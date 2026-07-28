import "server-only";
import type { InvestingResearchScientificScope } from "../contracts";
import type { DatasetRequirementEnvelope, DatasetVersionMaterial } from "../datasets";
import type { AcquisitionAttemptCreate, AcquisitionAttemptRecord, DatasetCatalogRepository } from "./repository.server";

type QueryResult = Readonly<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
export interface ScopedSqlClient {
  query(text: string, values?: readonly unknown[]): Promise<QueryResult>;
  release?(): void;
}
export interface ScopedSqlPool {
  connect(): Promise<ScopedSqlClient>;
}

const scopeValues = (scope: InvestingResearchScientificScope) =>
  [scope.tenantId, scope.ownerId, scope.portfolioId, scope.accountId] as const;
const attemptFromRow = (row: Record<string, unknown>): AcquisitionAttemptRecord => ({
  acquisitionJobId: String(row.acquisition_job_id),
  requirementId: String(row.request_id),
  scope: { tenantId: String(row.tenant_id), ownerId: String(row.owner_id), portfolioId: String(row.portfolio_id), accountId: String(row.account_id) },
  attempt: Number(row.attempt), idempotencyKey: String(row.idempotency_key),
  state: row.state as AcquisitionAttemptRecord["state"],
  stateVersion: Number(row.state_version), correlationId: String(row.correlation_id),
  requestedBy: String(row.requested_by),
  providerPreference: row.provider_preference === null ? null : String(row.provider_preference),
  outcome: row.outcome as AcquisitionAttemptRecord["outcome"],
});

export class PostgresDatasetCatalogRepository implements DatasetCatalogRepository {
  constructor(private readonly pool: ScopedSqlPool) {}
  private async transaction<T>(work: (client: ScopedSqlClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try { await client.query("begin"); const result = await work(client); await client.query("commit"); return result; }
    catch (error) { await client.query("rollback"); throw error; }
    finally { client.release?.(); }
  }

  async createOrReuseRequirement(value: DatasetRequirementEnvelope) {
    return this.transaction(async (client) => {
      const scope = scopeValues(value.material.scientificScope);
      const digest = value.requirementId.slice("irdsreq_v1_".length);
      const inserted = await client.query(
        `insert into public.investing_research_dataset_requests
          (tenant_id,owner_id,portfolio_id,account_id,request_id,contract_version,request_hash,state,created_at,canonical_payload)
         values ($1,$2,$3,$4,$5,$6,$7,'requested',$8,$9::jsonb)
         on conflict (tenant_id,owner_id,portfolio_id,account_id,request_hash) do nothing
         returning request_id, canonical_payload`,
        [...scope, value.requirementId, value.material.contractVersion, digest, value.createdAt, JSON.stringify(value)],
      );
      const result = inserted.rowCount
        ? inserted
        : await client.query(
          `select request_id, canonical_payload from public.investing_research_dataset_requests
           where tenant_id=$1 and owner_id=$2 and portfolio_id=$3 and account_id=$4 and request_hash=$5`,
          [...scope, digest],
        );
      if (result.rows.length !== 1 || JSON.stringify(result.rows[0].canonical_payload) !== JSON.stringify(value)) throw new Error("dataset_requirement_integrity_mismatch");
      return { value, reused: !inserted.rowCount };
    });
  }

  async createOrReuseActiveAttempt(value: AcquisitionAttemptCreate) {
    return this.transaction(async (client) => {
      const scope = scopeValues(value.scope);
      await client.query(
        `select request_id from public.investing_research_dataset_requests
         where tenant_id=$1 and owner_id=$2 and portfolio_id=$3 and account_id=$4 and request_id=$5
         for update`,
        [...scope, value.requirementId],
      );
      const active = await client.query(
        `select * from public.investing_research_acquisition_jobs
         where tenant_id=$1 and owner_id=$2 and portfolio_id=$3 and account_id=$4
           and request_id=$5 and acquisition_policy_version='investing-research-acquisition-policy/v1'
           and state in ('requested','acquiring','acquired_raw','normalized')`,
        [...scope, value.requirementId],
      );
      if (active.rows.length === 1) return { value: attemptFromRow(active.rows[0]), reused: true };
      if (active.rows.length > 1) throw new Error("acquisition_active_invariant_broken");
      const next = await client.query(
        `select coalesce(max(attempt),0)::integer + 1 as attempt
         from public.investing_research_acquisition_jobs
         where tenant_id=$1 and owner_id=$2 and portfolio_id=$3 and account_id=$4 and request_id=$5`,
        [...scope, value.requirementId],
      );
      const attempt = Number(next.rows[0].attempt);
      const acquisitionJobId = `iracq_${value.idempotencyKey}_${attempt}`;
      const inserted = await client.query(
        `insert into public.investing_research_acquisition_jobs
          (tenant_id,owner_id,portfolio_id,account_id,acquisition_job_id,request_id,attempt,
           acquisition_policy_version,idempotency_key,requested_by,correlation_id,
           provider_preference,priority,state,state_version,requested_at,created_at,updated_at)
         values ($1,$2,$3,$4,$5,$6,$7,'investing-research-acquisition-policy/v1',$8,$9,$10,$11,'normal','requested',0,statement_timestamp(),statement_timestamp(),statement_timestamp())
         on conflict do nothing returning *`,
        [...scope, acquisitionJobId, value.requirementId, attempt, value.idempotencyKey, value.requestedBy, value.correlationId, value.providerPreference],
      );
      const result = inserted.rowCount ? inserted : await client.query(
        `select * from public.investing_research_acquisition_jobs
         where tenant_id=$1 and owner_id=$2 and portfolio_id=$3 and account_id=$4
           and request_id=$5 and acquisition_policy_version='investing-research-acquisition-policy/v1'
           and state in ('requested','acquiring','acquired_raw','normalized')`,
        [...scope, value.requirementId],
      );
      if (result.rows.length !== 1) throw new Error("acquisition_request_integrity_mismatch");
      return { value: attemptFromRow(result.rows[0]), reused: !inserted.rowCount };
    });
  }

  async compareAndSetAttempt(input: Parameters<DatasetCatalogRepository["compareAndSetAttempt"]>[0]) {
    const result = await this.transaction((client) => client.query(
      `update public.investing_research_acquisition_jobs
       set state=$6, state_version=state_version+1, outcome=$7::jsonb,
           started_at=case when $6='acquiring' then statement_timestamp() else started_at end,
           completed_at=case when $6 in ('awaiting_quality','confirmed_no_data','provider_unavailable','acquisition_failed','cancelled') then statement_timestamp() else null end
       where tenant_id=$1 and owner_id=$2 and portfolio_id=$3 and account_id=$4
         and acquisition_job_id=$5 and state=$8 and state_version=$9 returning *`,
      [...scopeValues(input.scope), input.acquisitionJobId, input.nextState, input.outcome === null ? null : JSON.stringify(input.outcome), input.expectedState, input.expectedStateVersion],
    ));
    return result.rows.length === 1 ? attemptFromRow(result.rows[0]) : null;
  }

  async publishOrReuseVersion(input: Readonly<{ datasetVersionId: string; manifestHash: string; material: DatasetVersionMaterial }>) {
    return this.transaction(async (client) => {
      const value = input.material, scope = scopeValues(value.scope);
      const datasetId = `irdataset_${value.requirementId.slice("irdsreq_v1_".length)}`;
      await client.query(
        `insert into public.investing_research_datasets
          (tenant_id,owner_id,portfolio_id,account_id,dataset_id,request_id,dataset_contract_version,state)
         values ($1,$2,$3,$4,$5,$6,$7,'awaiting_quality')
         on conflict (tenant_id,owner_id,portfolio_id,account_id,request_id) do nothing`,
        [...scope, datasetId, value.requirementId, value.contractVersion],
      );
      const inserted = await client.query(
        `insert into public.investing_research_dataset_versions
          (tenant_id,owner_id,portfolio_id,account_id,dataset_version_id,dataset_id,request_id,
           acquisition_job_id,acquisition_attempt,manifest_hash,content_hash,schema_version,
           quality_state,qualified_at,canonical_payload)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'awaiting_quality',null,$13::jsonb)
         on conflict (tenant_id,owner_id,portfolio_id,account_id,dataset_id,manifest_hash,content_hash)
         do nothing returning dataset_version_id`,
        [...scope, input.datasetVersionId, datasetId, value.requirementId, value.acquisitionJobId, value.acquisitionAttempt, input.manifestHash, value.storage.normalizedContentHash, value.storage.schemaVersion, JSON.stringify(value)],
      );
      if (!inserted.rowCount) {
        const existing = await client.query(
          `select dataset_version_id, canonical_payload from public.investing_research_dataset_versions
           where tenant_id=$1 and owner_id=$2 and portfolio_id=$3 and account_id=$4
             and dataset_id=$5 and manifest_hash=$6 and content_hash=$7`,
          [...scope, datasetId, input.manifestHash, value.storage.normalizedContentHash],
        );
        if (existing.rows.length !== 1 || existing.rows[0].dataset_version_id !== input.datasetVersionId
          || JSON.stringify(existing.rows[0].canonical_payload) !== JSON.stringify(value)) throw new Error("dataset_content_mismatch");
      }
      return { datasetVersionId: input.datasetVersionId, reused: !inserted.rowCount };
    });
  }

  async getAttempt(scope: InvestingResearchScientificScope, acquisitionJobId: string) {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `select * from public.investing_research_acquisition_jobs
         where tenant_id=$1 and owner_id=$2 and portfolio_id=$3 and account_id=$4 and acquisition_job_id=$5`,
        [...scopeValues(scope), acquisitionJobId],
      );
      return result.rows.length === 1 ? attemptFromRow(result.rows[0]) : null;
    } finally { client.release?.(); }
  }

  async listVersions(scope: InvestingResearchScientificScope) {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `select canonical_payload from public.investing_research_dataset_versions
         where tenant_id=$1 and owner_id=$2 and portfolio_id=$3 and account_id=$4 order by dataset_version_id`,
        scopeValues(scope),
      );
      return result.rows.map((row) => row.canonical_payload as DatasetVersionMaterial);
    } finally { client.release?.(); }
  }

  async getVersion(scope: InvestingResearchScientificScope, datasetVersionId: string) {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `select canonical_payload from public.investing_research_dataset_versions
         where tenant_id=$1 and owner_id=$2 and portfolio_id=$3 and account_id=$4 and dataset_version_id=$5`,
        [...scopeValues(scope), datasetVersionId],
      );
      return result.rows.length === 1 ? result.rows[0].canonical_payload as DatasetVersionMaterial : null;
    } finally { client.release?.(); }
  }
}
