import "server-only";
import type { ScopedSqlClient, ScopedSqlPool } from "../dataset-catalog/postgresRepository.server";
import type { InvestingResearchScientificScope } from "../contracts";
import { deriveVersionMaterialHash } from "./identity.server";
import type { HypothesisCandidateRepository } from "./repository.server";
import type { CandidateRecord, HypothesisRecord } from "./types";

const scopeValues = (scope: InvestingResearchScientificScope) =>
  [scope.tenantId, scope.ownerId, scope.portfolioId, scope.accountId] as const;

const scopeFrom = (row: Record<string, unknown>) => ({
  tenantId: String(row.tenant_id), ownerId: String(row.owner_id),
  portfolioId: String(row.portfolio_id), accountId: String(row.account_id),
});
const hypothesisFrom = (row: Record<string, unknown>): HypothesisRecord => ({
  scope: scopeFrom(row), value: row.canonical_payload as HypothesisRecord["value"],
  materialHash: String(row.material_hash), createdAt: new Date(String(row.created_at)).toISOString(),
});
const candidateFrom = (row: Record<string, unknown>): CandidateRecord => ({
  scope: scopeFrom(row), value: row.canonical_payload as CandidateRecord["value"],
  materialHash: String(row.material_hash), createdAt: new Date(String(row.created_at)).toISOString(),
});
const nextVersion = (version: string) => `v${Number(version.slice(1)) + 1}`;

export class PostgresHypothesisCandidateRepository implements HypothesisCandidateRepository {
  constructor(private readonly pool: ScopedSqlPool) {}
  private async transaction<T>(work: (client: ScopedSqlClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const result = await work(client);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally { client.release?.(); }
  }
  async createOrReuseHypothesis(record: HypothesisRecord) {
    return this.transaction(async (client) => {
      const scope = scopeValues(record.scope);
      const inserted = await client.query(
        `insert into public.investing_research_hypotheses(
          tenant_id,owner_id,portfolio_id,account_id,hypothesis_id,hypothesis_version,
          state,material_hash,contract_version,created_at,canonical_payload)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
         on conflict (tenant_id,owner_id,portfolio_id,account_id,material_hash)
         do nothing returning *`,
        [...scope,record.value.hypothesisId,record.value.hypothesisVersion,record.value.state,
          record.materialHash,record.value.contractVersion,record.createdAt,JSON.stringify(record.value)],
      );
      const result = inserted.rowCount ? inserted : await client.query(
        `select * from public.investing_research_hypotheses
         where tenant_id=$1 and owner_id=$2 and portfolio_id=$3 and account_id=$4
           and material_hash=$5`,
        [...scope,record.materialHash],
      );
      if (result.rows.length !== 1
        || JSON.stringify(result.rows[0].canonical_payload) !== JSON.stringify(record.value)) {
        throw new Error("research_hypothesis_integrity_mismatch");
      }
      return { value: hypothesisFrom(result.rows[0]), reused: !inserted.rowCount };
    });
  }
  async transitionHypothesis(input: Parameters<HypothesisCandidateRepository["transitionHypothesis"]>[0]) {
    return this.transaction(async (client) => {
      const scope = scopeValues(input.scope);
      const current = await client.query(
        `select * from public.investing_research_hypotheses
         where tenant_id=$1 and owner_id=$2 and portfolio_id=$3 and account_id=$4
           and hypothesis_id=$5 order by version_sequence desc limit 1 for update`,
        [...scope,input.hypothesisId],
      );
      if (current.rows.length !== 1) return null;
      const value = current.rows[0].canonical_payload as HypothesisRecord["value"];
      if (value.hypothesisVersion !== input.expectedVersion) return null;
      const transitioned = { ...value, hypothesisVersion: nextVersion(value.hypothesisVersion),
        state: input.nextState };
      const hash = deriveVersionMaterialHash(transitioned);
      if (hash === null) throw new Error("research_hypothesis_integrity_mismatch");
      const inserted = await client.query(
        `insert into public.investing_research_hypotheses(
          tenant_id,owner_id,portfolio_id,account_id,hypothesis_id,hypothesis_version,
          state,material_hash,contract_version,created_at,canonical_payload)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
         on conflict do nothing returning *`,
        [...scope,transitioned.hypothesisId,transitioned.hypothesisVersion,
          transitioned.state,hash,transitioned.contractVersion,input.createdAt,
          JSON.stringify(transitioned)],
      );
      return inserted.rows.length === 1 ? hypothesisFrom(inserted.rows[0]) : null;
    });
  }
  async getHypothesis(scope: InvestingResearchScientificScope, id: string, version?: string) {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `select * from public.investing_research_hypotheses
         where tenant_id=$1 and owner_id=$2 and portfolio_id=$3 and account_id=$4
           and hypothesis_id=$5 and ($6::text is null or hypothesis_version=$6)
         order by version_sequence desc limit 1`,
        [...scopeValues(scope),id,version ?? null],
      );
      return result.rows.length === 1 ? hypothesisFrom(result.rows[0]) : null;
    } finally { client.release?.(); }
  }
  async listHypotheses(scope: InvestingResearchScientificScope) {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `select distinct on (hypothesis_id) * from public.investing_research_hypotheses
         where tenant_id=$1 and owner_id=$2 and portfolio_id=$3 and account_id=$4
         order by hypothesis_id,version_sequence desc`,
        scopeValues(scope),
      );
      return result.rows.map(hypothesisFrom);
    } finally { client.release?.(); }
  }
  async createOrReuseCandidate(record: CandidateRecord) {
    return this.transaction(async (client) => {
      const scope = scopeValues(record.scope);
      const inserted = await client.query(
        `insert into public.investing_research_candidates(
          tenant_id,owner_id,portfolio_id,account_id,candidate_id,candidate_version,
          hypothesis_id,hypothesis_version,state,material_hash,strategy_contract_version,
          parent_candidate_id,created_at,canonical_payload)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb)
         on conflict do nothing returning *`,
        [...scope,record.value.candidateId,record.value.candidateVersion,
          record.value.hypothesisId,record.value.hypothesisVersion,record.value.state,
          record.materialHash,record.value.strategyContract.version,
          record.value.generation.parentCandidateId,record.createdAt,JSON.stringify(record.value)],
      );
      const result = inserted.rowCount ? inserted : await client.query(
        `select * from public.investing_research_candidates
         where tenant_id=$1 and owner_id=$2 and portfolio_id=$3 and account_id=$4
           and candidate_id=$5 and candidate_version='v1'`,
        [...scope,record.value.candidateId],
      );
      if (result.rows.length !== 1
        || String(result.rows[0].candidate_id) !== record.value.candidateId) {
        throw new Error("strategy_candidate_integrity_mismatch");
      }
      return { value: candidateFrom(result.rows[0]), reused: !inserted.rowCount };
    });
  }
  async transitionCandidate(input: Parameters<HypothesisCandidateRepository["transitionCandidate"]>[0]) {
    return this.transaction(async (client) => {
      const scope = scopeValues(input.scope);
      const current = await client.query(
        `select * from public.investing_research_candidates
         where tenant_id=$1 and owner_id=$2 and portfolio_id=$3 and account_id=$4
           and candidate_id=$5 order by version_sequence desc limit 1 for update`,
        [...scope,input.candidateId],
      );
      if (current.rows.length !== 1) return null;
      const value = current.rows[0].canonical_payload as CandidateRecord["value"];
      if (value.candidateVersion !== input.expectedVersion) return null;
      const transitioned = { ...value, candidateVersion: nextVersion(value.candidateVersion),
        state: input.nextState };
      const hash = deriveVersionMaterialHash(transitioned);
      if (hash === null) throw new Error("strategy_candidate_integrity_mismatch");
      const inserted = await client.query(
        `insert into public.investing_research_candidates(
          tenant_id,owner_id,portfolio_id,account_id,candidate_id,candidate_version,
          hypothesis_id,hypothesis_version,state,material_hash,strategy_contract_version,
          parent_candidate_id,created_at,canonical_payload)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb)
         on conflict do nothing returning *`,
        [...scope,transitioned.candidateId,transitioned.candidateVersion,
          transitioned.hypothesisId,transitioned.hypothesisVersion,transitioned.state,
          hash,transitioned.strategyContract.version,
          transitioned.generation.parentCandidateId,input.createdAt,JSON.stringify(transitioned)],
      );
      return inserted.rows.length === 1 ? candidateFrom(inserted.rows[0]) : null;
    });
  }
  async getCandidate(scope: InvestingResearchScientificScope, id: string, version?: string) {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `select * from public.investing_research_candidates
         where tenant_id=$1 and owner_id=$2 and portfolio_id=$3 and account_id=$4
           and candidate_id=$5 and ($6::text is null or candidate_version=$6)
         order by version_sequence desc limit 1`,
        [...scopeValues(scope),id,version ?? null],
      );
      return result.rows.length === 1 ? candidateFrom(result.rows[0]) : null;
    } finally { client.release?.(); }
  }
  async listCandidates(scope: InvestingResearchScientificScope) {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `select distinct on (candidate_id) * from public.investing_research_candidates
         where tenant_id=$1 and owner_id=$2 and portfolio_id=$3 and account_id=$4
         order by candidate_id,version_sequence desc`,
        scopeValues(scope),
      );
      return result.rows.map(candidateFrom);
    } finally { client.release?.(); }
  }
}
