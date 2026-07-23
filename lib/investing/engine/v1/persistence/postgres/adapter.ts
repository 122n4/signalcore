import { Pool, type QueryResultRow } from "pg";

import {
  type InvestingEngineArtifactTypeV1,
  type InvestingEngineLoadedPersistenceV1,
  type InvestingEnginePersistedRunRowV1,
  type InvestingEngineSealedArtifactV1,
} from "@/lib/investing/engine/v1/persistence/contracts";
import type {
  InvestingEngineFinalHashSelectorV1, InvestingEngineIdempotencySelectorV1,
  InvestingEngineLatestSelectorV1, InvestingEnginePersistenceRepositoryPortV1, InvestingEngineRunScopeV1,
} from "@/lib/investing/engine/v1/persistence/repositoryPort";
import { RUN_SELECT_V1 } from "@/lib/investing/engine/v1/persistence/postgres/queries";
import { PostgresInvestingEnginePersistenceTransactionV1 } from "@/lib/investing/engine/v1/persistence/postgres/transaction";
import { persistenceError } from "@/lib/investing/engine/v1/persistence/errors";

export type PostgresQueryV1 = { query<R extends QueryResultRow = QueryResultRow>(text: string, values?: readonly unknown[]): Promise<{ rows: R[]; rowCount: number | null }> };

function runRow(row: QueryResultRow): InvestingEnginePersistedRunRowV1 {
  return {
    identity: {
      runId: row.run_id, requestedUserId: row.requested_user_id, ownerId: row.owner_id, accountId: row.account_id,
      accountMode: row.account_mode, environment: row.environment, asOf: new Date(row.as_of).toISOString(),
      inputSnapshotId: row.input_snapshot_id, marketSnapshotId: row.market_snapshot_id,
      mandateSnapshotId: row.mandate_snapshot_id, constructionModelSnapshotId: row.construction_model_snapshot_id,
    },
    versions: row.version_set, state: row.state, quality: row.quality, confidence: row.confidence,
    executable: row.executable, source: row.source, idempotencyScope: row.idempotency_scope,
    idempotencyKey: row.idempotency_key, requestHash: row.request_hash,
    hashes: {
      canonical_input: row.canonical_input_hash, portfolio_state_derivation: row.portfolio_state_derivation_hash,
      risk_assessment: row.risk_assessment_hash, policy_evaluation: row.policy_evaluation_hash,
      constraint_evaluation: row.constraint_evaluation_hash, feasible_decision_envelope: row.feasible_decision_envelope_hash,
      construction_model: row.construction_model_hash, preliminary_proposal: row.preliminary_proposal_hash,
      final_decision: row.final_decision_hash, audit_bundle: row.audit_bundle_hash,
      shadow_package: row.shadow_package_hash, final_result: row.final_result_hash,
    },
    selectedCandidateId: row.selected_candidate_id, manifestVersion: row.manifest_version, persistenceTxid: row.persistence_txid,
  };
}

async function one(queryable: PostgresQueryV1, sql: string, values: readonly unknown[]) {
  const result = await queryable.query(`${RUN_SELECT_V1} ${sql}`, values);
  return result.rows[0] ? runRow(result.rows[0]) : null;
}

export const findByScopeV1 = (q: PostgresQueryV1, s: InvestingEngineRunScopeV1) => one(q, "where owner_id=$1 and account_id=$2 and run_id=$3", [s.ownerId, s.accountId, s.runId]);
export const findByIdempotencyV1 = (q: PostgresQueryV1, s: InvestingEngineIdempotencySelectorV1) => one(q, "where owner_id=$1 and account_id=$2 and idempotency_scope=$3 and idempotency_key=$4", [s.ownerId, s.accountId, s.scope, s.key]);
export const findByFinalHashV1 = (q: PostgresQueryV1, s: InvestingEngineFinalHashSelectorV1) => one(q, "where owner_id=$1 and account_id=$2 and final_result_hash=$3", [s.ownerId, s.accountId, s.finalResultHash]);
export const findLatestV1 = (q: PostgresQueryV1, s: InvestingEngineLatestSelectorV1) => one(q, "where owner_id=$1 and account_id=$2 order by as_of desc, created_at desc, run_id desc limit 1", [s.ownerId, s.accountId]);

export async function loadCompleteWithQueryableV1(q: PostgresQueryV1, run: InvestingEnginePersistedRunRowV1): Promise<InvestingEngineLoadedPersistenceV1> {
  const id = run.identity.runId;
  const artifacts = await q.query(`select run_id, owner_id, account_id::text, artifact_type, source_phase, state, quality, confidence, content_hash, final_result_hash, contract_version, schema_version, canonical_payload, sealed, executable, persistence_txid::text from public.investing_engine_artifacts where run_id=$1 order by case artifact_type ${[
      "canonical_input", "portfolio_state_derivation", "risk_assessment", "policy_evaluation", "constraint_evaluation", "feasible_decision_envelope", "construction_model", "preliminary_proposal", "final_decision", "audit_bundle", "shadow_package", "final_result",
    ].map((type, index) => `when '${type}' then ${index}`).join(" ")} end`, [id]);
  const summaries = await q.query("select run_id,owner_id,account_id::text,final_result_hash,phase,phase_state,quality,input_hash,output_hash,warning_codes,blocking_reasons,reason_codes,persistence_txid::text from public.investing_engine_phase_summaries where run_id=$1 order by case phase when 'phase3c' then 0 when 'phase3d' then 1 when 'phase3e' then 2 else 3 end", [id]);
  const reasons = await q.query("select run_id,owner_id,account_id::text,final_result_hash,reason_code,phase_source,severity,consequence,evidence_hash,related_symbol,related_order,related_constraint,persistence_txid::text from public.investing_engine_reason_evidence where run_id=$1 order by reason_code,evidence_hash,coalesce(related_symbol,''),coalesce(related_order,''),coalesce(related_constraint,'')", [id]);
  const shadows = await q.query("select run_id,owner_id,account_id::text,final_result_hash,shadow_package_hash,engine_new_result_hash,status,legacy_result,comparison,executable,persistence_txid::text from public.investing_engine_shadow_packages where run_id=$1", [id]);
  const claims = await q.query("select scope,idempotency_key,artifact_type,owner_id,account_id::text,run_id,final_result_hash,expected_content_hash,persistence_txid::text from public.investing_engine_idempotency_keys where run_id=$1 order by artifact_type", [id]);
  if (shadows.rowCount !== 1) persistenceError("persistence_partial_load", { reason: "shadow_count" });
  return {
    run,
    artifacts: artifacts.rows.map((row) => ({
      identity: { ...run.identity, runId: row.run_id, ownerId: row.owner_id, accountId: row.account_id }, artifactType: row.artifact_type as InvestingEngineArtifactTypeV1,
      sourcePhase: row.source_phase, state: row.state, quality: row.quality, confidence: row.confidence,
      contentHash: row.content_hash, finalResultHash: row.final_result_hash, contractVersion: row.contract_version,
      schemaVersion: row.schema_version, canonicalPayload: row.canonical_payload, sealed: row.sealed,
      executable: row.executable, persistenceTxid: row.persistence_txid,
      claim: { scope: "", idempotencyKey: "", artifactType: row.artifact_type, ownerId: run.identity.ownerId, accountId: run.identity.accountId, runId: id, expectedContentHash: row.content_hash },
    } as InvestingEngineSealedArtifactV1)),
    phaseSummaries: summaries.rows.map((row) => ({ ownerId: row.owner_id, accountId: row.account_id, runId: row.run_id, finalResultHash: row.final_result_hash, phase: row.phase, state: row.phase_state, quality: row.quality, inputHash: row.input_hash, outputHash: row.output_hash, warningCodes: row.warning_codes, blockingReasons: row.blocking_reasons, reasonCodes: row.reason_codes, persistenceTxid: row.persistence_txid })),
    reasonEvidence: reasons.rows.map((row) => ({ ownerId: row.owner_id, accountId: row.account_id, runId: row.run_id, finalResultHash: row.final_result_hash, reasonCode: row.reason_code, phaseSource: row.phase_source, severity: row.severity, consequence: row.consequence, evidenceHash: row.evidence_hash, relatedSymbol: row.related_symbol, relatedOrder: row.related_order, relatedConstraint: row.related_constraint, persistenceTxid: row.persistence_txid })),
    shadowPackage: { ownerId: shadows.rows[0].owner_id, accountId: shadows.rows[0].account_id, runId: shadows.rows[0].run_id, finalResultHash: shadows.rows[0].final_result_hash, shadowPackageHash: shadows.rows[0].shadow_package_hash, engineNewResultHash: shadows.rows[0].engine_new_result_hash, status: shadows.rows[0].status, legacyResult: shadows.rows[0].legacy_result, comparison: shadows.rows[0].comparison, executable: shadows.rows[0].executable, persistenceTxid: shadows.rows[0].persistence_txid },
    claims: claims.rows.map((row) => ({ scope: row.scope, idempotencyKey: row.idempotency_key, artifactType: row.artifact_type, ownerId: row.owner_id, accountId: row.account_id, runId: row.run_id, finalResultHash: row.final_result_hash, expectedContentHash: row.expected_content_hash, persistenceTxid: row.persistence_txid })),
  };
}

export class PostgresInvestingEnginePersistenceAdapterV1 implements InvestingEnginePersistenceRepositoryPortV1 {
  readonly pool: Pool;
  private readonly ownsPool: boolean;
  constructor(config: { pool?: Pool; connectionString?: string; max?: number; onCommit?: () => Promise<void> | void }) {
    if (!config.pool && !config.connectionString) throw new Error("persistence_postgres_configuration_required");
    this.pool = config.pool ?? new Pool({ connectionString: config.connectionString, max: config.max ?? 8 });
    this.ownsPool = !config.pool; this.onCommit = config.onCommit;
  }
  private readonly onCommit?: () => Promise<void> | void;
  findRunByScope = (s: InvestingEngineRunScopeV1) => findByScopeV1(this.pool, s);
  findRunByIdempotency = (s: InvestingEngineIdempotencySelectorV1) => findByIdempotencyV1(this.pool, s);
  findRunByFinalHash = (s: InvestingEngineFinalHashSelectorV1) => findByFinalHashV1(this.pool, s);
  findLatestRun = (s: InvestingEngineLatestSelectorV1) => findLatestV1(this.pool, s);
  async loadCompleteRun(run: InvestingEnginePersistedRunRowV1) {
    const client = await this.pool.connect();
    try { await client.query("begin isolation level repeatable read read only"); const loaded = await loadCompleteWithQueryableV1(client, run); await client.query("commit"); return loaded; }
    catch (error) { await client.query("rollback"); throw error; }
    finally { client.release(); }
  }
  async beginTransaction() { const client = await this.pool.connect(); await client.query("begin"); return new PostgresInvestingEnginePersistenceTransactionV1(client, this.onCommit); }
  async close() { if (this.ownsPool) await this.pool.end(); }
}
