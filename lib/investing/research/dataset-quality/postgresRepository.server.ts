import "server-only";

import type { InvestingResearchScientificScope } from "../contracts";
import { canonicalizeResearchContract } from "../contracts/runtimeValidation";
import type { ScopedSqlClient, ScopedSqlPool } from "../dataset-catalog/postgresRepository.server";
import type { DatasetQualityReport } from "./types";
import type { DatasetQualityRepository, QualityPublication } from "./repository.server";

const scopeValues = (scope: InvestingResearchScientificScope) =>
  [scope.tenantId, scope.ownerId, scope.portfolioId, scope.accountId] as const;
const sameCanonicalValue = (left: unknown, right: unknown): boolean => {
  const a = canonicalizeResearchContract(left);
  const b = canonicalizeResearchContract(right);
  return a.ok && b.ok && a.value === b.value;
};

export class PostgresDatasetQualityRepository implements DatasetQualityRepository {
  constructor(private readonly pool: ScopedSqlPool) {}
  private async transaction<T>(work: (client: ScopedSqlClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try { await client.query("begin"); const value = await work(client); await client.query("commit"); return value; }
    catch (error) { await client.query("rollback"); throw error; }
    finally { client.release?.(); }
  }

  async loadEvaluationSource(scope: InvestingResearchScientificScope, sourceDatasetVersionId: string) {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `select v.canonical_payload source_payload,r.canonical_payload->'material' requirement_material
         from public.investing_research_dataset_versions v
         join public.investing_research_dataset_requests r
           on r.tenant_id=v.tenant_id and r.owner_id=v.owner_id and r.portfolio_id=v.portfolio_id
          and r.account_id=v.account_id and r.request_id=v.request_id
         where v.tenant_id=$1 and v.owner_id=$2 and v.portfolio_id=$3 and v.account_id=$4
           and v.dataset_version_id=$5 and v.quality_state='awaiting_quality'`,
        [...scopeValues(scope), sourceDatasetVersionId],
      );
      return result.rows.length === 1 ? {
        source: result.rows[0].source_payload,
        requirement: result.rows[0].requirement_material,
      } as Awaited<ReturnType<DatasetQualityRepository["loadEvaluationSource"]>> : null;
    } finally { client.release?.(); }
  }

  async publishOrReuse(input: QualityPublication) {
    return this.transaction(async (client) => {
      const report = input.report;
      const scope = scopeValues(report.material.scope);
      const inserted = await client.query(
        `insert into public.investing_research_dataset_quality_reports
          (tenant_id,owner_id,portfolio_id,account_id,quality_report_id,source_dataset_version_id,
           request_id,policy_version,report_hash,canonical_material,outcome,evaluated_at,correlation_id,canonical_payload)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb)
         on conflict (tenant_id,owner_id,portfolio_id,account_id,source_dataset_version_id,policy_version,report_hash)
         do nothing returning quality_report_id`,
        [...scope, report.qualityReportId, report.material.sourceDatasetVersionId,
          report.material.requirementId, report.material.policyVersion, report.reportHash,
          report.canonicalMaterial, report.material.outcome, report.evaluatedAt, report.correlationId, JSON.stringify(report.material)],
      );
      if (!inserted.rowCount) {
        const existing = await client.query(
          `select quality_report_id,canonical_payload from public.investing_research_dataset_quality_reports
           where tenant_id=$1 and owner_id=$2 and portfolio_id=$3 and account_id=$4
             and source_dataset_version_id=$5 and policy_version=$6 and report_hash=$7`,
          [...scope, report.material.sourceDatasetVersionId, report.material.policyVersion, report.reportHash],
        );
        if (existing.rows.length !== 1 || existing.rows[0].quality_report_id !== report.qualityReportId
          || !sameCanonicalValue(existing.rows[0].canonical_payload, report.material)) {
          throw new Error("quality_evidence_mismatch");
        }
      }
      if (report.material.outcome !== "research_ready") {
        return { qualityReportId: report.qualityReportId, datasetVersionId: null, reused: !inserted.rowCount };
      }

      const source = await client.query(
        `select dataset_id,manifest_hash,content_hash from public.investing_research_dataset_versions
         where tenant_id=$1 and owner_id=$2 and portfolio_id=$3 and account_id=$4
           and dataset_version_id=$5 and quality_state='awaiting_quality' for key share`,
        [...scope, report.material.sourceDatasetVersionId],
      );
      if (source.rows.length !== 1) throw new Error("quality_source_not_awaiting_quality");
      const version = await client.query(
        `insert into public.investing_research_dataset_versions
          (tenant_id,owner_id,portfolio_id,account_id,dataset_version_id,dataset_id,request_id,
           acquisition_job_id,acquisition_attempt,manifest_hash,content_hash,schema_version,
           quality_state,qualified_at,canonical_payload,quality_report_id,source_dataset_version_id)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'research_ready',$13,$14::jsonb,$15,$16)
         on conflict (tenant_id,owner_id,portfolio_id,account_id,dataset_version_id) do nothing
         returning dataset_version_id`,
        [...scope, input.derivedDatasetVersionId, source.rows[0].dataset_id,
          input.derived.requirementId, input.derived.acquisitionJobId, input.derived.acquisitionAttempt,
          input.derivedManifestHash, input.derived.storage.normalizedContentHash, input.derived.storage.schemaVersion,
          input.derived.qualifiedAt, JSON.stringify(input.derived), report.qualityReportId,
          report.material.sourceDatasetVersionId],
      );
      const lineage = await client.query(
        `insert into public.investing_research_dataset_lineage
          (tenant_id,owner_id,portfolio_id,account_id,lineage_event_id,parent_dataset_version_id,
           child_dataset_version_id,transformation_version,event_hash,canonical_payload)
         values ($1,$2,$3,$4,$5,$6,$7,'investing.dataset-quality-qualification/v1',$8,$9::jsonb)
         on conflict (tenant_id,owner_id,portfolio_id,account_id,event_hash) do nothing returning lineage_event_id`,
        [...scope, input.lineageEventId, report.material.sourceDatasetVersionId,
          input.derivedDatasetVersionId, input.lineageEventHash, JSON.stringify({
            qualityReportId: report.qualityReportId,
            sourceDatasetVersionId: report.material.sourceDatasetVersionId,
            derivedDatasetVersionId: input.derivedDatasetVersionId,
            transformationVersion: "investing.dataset-quality-qualification/v1",
          })],
      );
      if ((version.rowCount ? 1 : 0) !== (lineage.rowCount ? 1 : 0)) throw new Error("quality_atomic_publication_mismatch");
      if (!version.rowCount) {
        const existingVersion = await client.query(
          `select canonical_payload,quality_report_id,source_dataset_version_id
           from public.investing_research_dataset_versions
           where tenant_id=$1 and owner_id=$2 and portfolio_id=$3 and account_id=$4 and dataset_version_id=$5`,
          [...scope, input.derivedDatasetVersionId],
        );
        const existingLineage = await client.query(
          `select canonical_payload from public.investing_research_dataset_lineage
           where tenant_id=$1 and owner_id=$2 and portfolio_id=$3 and account_id=$4 and event_hash=$5`,
          [...scope, input.lineageEventHash],
        );
        if (existingVersion.rows.length !== 1 || existingLineage.rows.length !== 1
          || existingVersion.rows[0].quality_report_id !== report.qualityReportId
          || existingVersion.rows[0].source_dataset_version_id !== report.material.sourceDatasetVersionId
          || !sameCanonicalValue(existingVersion.rows[0].canonical_payload, input.derived)) {
          throw new Error("quality_atomic_publication_mismatch");
        }
      }
      return { qualityReportId: report.qualityReportId, datasetVersionId: input.derivedDatasetVersionId, reused: !version.rowCount };
    });
  }

  async getReport(scope: InvestingResearchScientificScope, qualityReportId: string) {
    const client = await this.pool.connect();
    try {
      const rows = await client.query(
        `select quality_report_id,report_hash,canonical_material,evaluated_at,correlation_id,canonical_payload
         from public.investing_research_dataset_quality_reports
         where tenant_id=$1 and owner_id=$2 and portfolio_id=$3 and account_id=$4 and quality_report_id=$5`,
        [...scopeValues(scope), qualityReportId],
      );
      return rows.rows.length === 1 ? {
        qualityReportId: String(rows.rows[0].quality_report_id),
        reportHash: String(rows.rows[0].report_hash),
        canonicalMaterial: String(rows.rows[0].canonical_material),
        evaluatedAt: new Date(String(rows.rows[0].evaluated_at)).toISOString(),
        correlationId: String(rows.rows[0].correlation_id),
        material: rows.rows[0].canonical_payload,
      } as DatasetQualityReport : null;
    } finally { client.release?.(); }
  }

  async listReports(scope: InvestingResearchScientificScope) {
    const client = await this.pool.connect();
    try {
      const rows = await client.query(
        `select quality_report_id,report_hash,canonical_material,evaluated_at,correlation_id,canonical_payload
         from public.investing_research_dataset_quality_reports
         where tenant_id=$1 and owner_id=$2 and portfolio_id=$3 and account_id=$4 order by created_at`,
        scopeValues(scope),
      );
      return rows.rows.map((row) => ({
        qualityReportId: String(row.quality_report_id), reportHash: String(row.report_hash), canonicalMaterial: String(row.canonical_material),
        evaluatedAt: new Date(String(row.evaluated_at)).toISOString(), correlationId: String(row.correlation_id),
        material: row.canonical_payload,
      } as DatasetQualityReport));
    } finally { client.release?.(); }
  }
}
