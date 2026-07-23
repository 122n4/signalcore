import type { PoolClient, QueryResultRow } from "pg";

import type { InvestingEngineLoadedPersistenceV1, InvestingEnginePersistencePreparedV1, InvestingEnginePersistedRunRowV1 } from "@/lib/investing/engine/v1/persistence/contracts";
import type { InvestingEngineIdempotencySelectorV1, InvestingEnginePersistenceTransactionV1 } from "@/lib/investing/engine/v1/persistence/repositoryPort";
import { persistenceError } from "@/lib/investing/engine/v1/persistence/errors";
import { ARTIFACT_INSERT_V1, CLAIM_INSERT_V1, PHASE_SUMMARY_INSERT_V1, REASON_INSERT_V1, RUN_INSERT_V1, SHADOW_INSERT_V1 } from "@/lib/investing/engine/v1/persistence/postgres/queries";
import { findByFinalHashV1, findByIdempotencyV1, findByScopeV1, findLatestV1, loadCompleteWithQueryableV1 } from "@/lib/investing/engine/v1/persistence/postgres/adapter";

export class PostgresInvestingEnginePersistenceTransactionV1 implements InvestingEnginePersistenceTransactionV1 {
  private ended = false;
  constructor(private readonly client: PoolClient, private readonly onCommit?: () => Promise<void> | void) {}

  async lockIdempotency(selector: InvestingEngineIdempotencySelectorV1) {
    await this.client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [`${selector.ownerId}:${selector.accountId}:${selector.scope}:${selector.key}`]);
  }
  async lockRunId(runId: string) { await this.client.query("select pg_advisory_xact_lock(hashtextextended($1, 1))", [runId]); }
  findRunByScope = (selector: Parameters<typeof findByScopeV1>[1]) => findByScopeV1(this.client, selector);
  findRunByIdempotency = (selector: Parameters<typeof findByIdempotencyV1>[1]) => findByIdempotencyV1(this.client, selector);
  findRunByFinalHash = (selector: Parameters<typeof findByFinalHashV1>[1]) => findByFinalHashV1(this.client, selector);
  findLatestRun = (selector: Parameters<typeof findLatestV1>[1]) => findLatestV1(this.client, selector);
  loadCompleteRun = (run: InvestingEnginePersistedRunRowV1): Promise<InvestingEngineLoadedPersistenceV1> => loadCompleteWithQueryableV1(this.client, run);

  async insertRun(prepared: InvestingEnginePersistencePreparedV1) {
    const m = prepared.manifest; const r = prepared.source.finalResult as Record<string, unknown>;
    const h = Object.fromEntries(m.artifactHashes.map((entry) => [entry.artifactType, entry.contentHash]));
    await this.client.query(RUN_INSERT_V1, [
      m.identity.runId, m.identity.requestedUserId, m.identity.ownerId, m.identity.accountId, "paper", "paper", m.identity.asOf,
      m.identity.inputSnapshotId, m.identity.marketSnapshotId, m.identity.mandateSnapshotId, m.identity.constructionModelSnapshotId,
      JSON.stringify(m.versions), m.state, m.quality, JSON.stringify(r.confidence), false, "investing_engine_v1_phase3f",
      m.idempotency.scope, m.idempotency.key, m.requestHash, h.canonical_input, h.portfolio_state_derivation,
      h.risk_assessment, h.policy_evaluation, h.constraint_evaluation, h.feasible_decision_envelope,
      h.construction_model, h.preliminary_proposal, h.final_decision, h.audit_bundle, h.shadow_package, h.final_result,
      r.selectedCandidateId ?? null, m.contractVersion,
    ]);
  }
  async insertArtifacts(prepared: InvestingEnginePersistencePreparedV1) {
    for (const a of prepared.artifacts) await this.client.query(ARTIFACT_INSERT_V1, [
      a.identity.runId, a.identity.ownerId, a.identity.accountId, a.finalResultHash, a.artifactType, a.sourcePhase,
      a.state, a.quality, JSON.stringify(a.confidence), a.contentHash, a.contractVersion, a.schemaVersion,
      a.canonicalPayload, true, false,
    ]);
  }
  async insertPhaseSummaries(prepared: InvestingEnginePersistencePreparedV1) {
    const m = prepared.manifest;
    for (const s of prepared.phaseSummaries) await this.client.query(PHASE_SUMMARY_INSERT_V1, [
      m.identity.runId, m.identity.ownerId, m.identity.accountId, m.finalResultHash, s.phase, s.state, s.quality,
      s.inputHash, s.outputHash, JSON.stringify(s.warningCodes), JSON.stringify(s.blockingReasons), JSON.stringify(s.reasonCodes),
    ]);
  }
  async insertReasonEvidence(prepared: InvestingEnginePersistencePreparedV1) {
    const m = prepared.manifest;
    for (const e of prepared.reasonEvidence) await this.client.query(REASON_INSERT_V1, [
      m.identity.runId, m.identity.ownerId, m.identity.accountId, m.finalResultHash, e.reasonCode, e.phaseSource,
      e.severity, e.consequence, e.evidenceHash, e.relatedSymbol, e.relatedOrder, e.relatedConstraint,
    ]);
  }
  async insertShadowPackage(prepared: InvestingEnginePersistencePreparedV1) {
    const m = prepared.manifest;
    await this.client.query(SHADOW_INSERT_V1, [m.identity.runId, m.identity.ownerId, m.identity.accountId, m.finalResultHash, prepared.shadowMetadata.shadowPackageHash, prepared.shadowMetadata.engineNewResultHash]);
  }
  async insertClaims(prepared: InvestingEnginePersistencePreparedV1) {
    const m = prepared.manifest;
    for (const c of prepared.claims) await this.client.query(CLAIM_INSERT_V1, [m.identity.runId, m.identity.ownerId, m.identity.accountId, m.finalResultHash, c.scope, c.idempotencyKey, c.artifactType, c.expectedContentHash]);
  }
  async assertExpectedCounts(prepared: InvestingEnginePersistencePreparedV1) {
    const result = await this.client.query<QueryResultRow>(`
      select
        (select count(*)::text from public.investing_engine_artifacts where run_id=$1) artifacts,
        (select count(*)::text from public.investing_engine_phase_summaries where run_id=$1) summaries,
        (select count(*)::text from public.investing_engine_reason_evidence where run_id=$1) reasons,
        (select count(*)::text from public.investing_engine_shadow_packages where run_id=$1) shadows,
        (select count(*)::text from public.investing_engine_idempotency_keys where run_id=$1) claims`, [prepared.manifest.identity.runId]);
    const row = result.rows[0]; const c = prepared.manifest.counts;
    if (!row || row.artifacts !== c.artifacts || row.summaries !== c.phaseSummaries || row.reasons !== c.reasonEvidence || row.shadows !== c.shadowPackages || row.claims !== c.claims) persistenceError("persistence_manifest_incomplete");
  }
  async forceDeferredConstraints() { await this.client.query("set constraints all immediate"); }
  async commit() {
    if (this.ended) return;
    await this.client.query("commit"); this.ended = true; this.client.release(); await this.onCommit?.();
  }
  async rollback() {
    if (this.ended) return;
    try { await this.client.query("rollback"); } finally { this.ended = true; this.client.release(); }
  }
}
