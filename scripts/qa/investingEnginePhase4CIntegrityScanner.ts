import { createHash } from "node:crypto";

import type { Pool, PoolClient, QueryResultRow } from "pg";

import {
  INVESTING_ENGINE_ARTIFACT_TYPES_V1,
  INVESTING_ENGINE_MANIFEST_VERSION,
  INVESTING_ENGINE_PERSISTENCE_SCHEMA_VERSION,
  InvestingEnginePersistenceReaderV1,
  InvestingEngineReplayServiceV1,
  canonicalPersistenceStringifyV1,
  computeInvestingEngineArtifactContentHashV1,
  errorCodeOf,
  parseCanonicalPayloadV1,
} from "@/lib/investing/engine/v1/persistence";

export const INVESTING_ENGINE_PHASE4C_INTEGRITY_TABLES = [
  "investing_engine_runs",
  "investing_engine_artifacts",
  "investing_engine_phase_summaries",
  "investing_engine_reason_evidence",
  "investing_engine_shadow_packages",
  "investing_engine_idempotency_keys",
] as const;

export const INVESTING_ENGINE_PHASE4C_INTEGRITY_REASON_CODES = [
  "ARTIFACT_CONTENT_HASH_MISMATCH",
  "ARTIFACT_DUPLICATE",
  "ARTIFACT_INVENTORY_MISSING",
  "ARTIFACT_INVENTORY_UNEXPECTED",
  "ARTIFACT_ROOT_HASH_MISMATCH",
  "ARTIFACT_VERSION_UNKNOWN",
  "BROKEN_ACCOUNT_REFERENCE",
  "BROKEN_FINAL_HASH_REFERENCE",
  "BROKEN_OWNER_REFERENCE",
  "CLAIM_COUNT_MISMATCH",
  "CLAIM_DUPLICATE",
  "LOAD_VERIFY_FAILED",
  "MANDATORY_CHECK_INCOMPLETE",
  "ORPHAN_ARTIFACT",
  "ORPHAN_CLAIM",
  "ORPHAN_PHASE_SUMMARY",
  "ORPHAN_REASON_EVIDENCE",
  "ORPHAN_SHADOW_PACKAGE",
  "PHASE_SUMMARY_COUNT_MISMATCH",
  "PHASE_SUMMARY_DUPLICATE",
  "REASON_EVIDENCE_DUPLICATE",
  "REPLAY_BLOCKED",
  "REPLAY_MISMATCH",
  "RUN_DUPLICATE",
  "RUN_MANIFEST_VERSION_UNKNOWN",
  "RUN_UNSAFE_STATE",
  "SHADOW_PACKAGE_COUNT_MISMATCH",
  "SHADOW_PACKAGE_DUPLICATE",
  "UNEXPECTED_ARTIFACT_STATE",
] as const;

export type InvestingEnginePhase4CIntegrityReasonCode =
  (typeof INVESTING_ENGINE_PHASE4C_INTEGRITY_REASON_CODES)[number];

export type InvestingEnginePhase4CIntegrityIssue = Readonly<{
  code: InvestingEnginePhase4CIntegrityReasonCode;
  runId: string | null;
  table: (typeof INVESTING_ENGINE_PHASE4C_INTEGRITY_TABLES)[number];
  detail: string;
}>;

type RunInventoryRow = Readonly<{
  runId: string;
  ownerId: string;
  accountId: string;
  finalResultHash: string;
  manifestVersion: string | null;
  environment: string;
  executable: boolean;
  source: string;
  hashes: Readonly<Record<string, string>>;
}>;

type ArtifactInventoryRow = Readonly<{
  runId: string;
  ownerId: string;
  accountId: string;
  finalResultHash: string;
  artifactType: string;
  schemaVersion: string;
  contentHash: string;
  computedHash: string | null;
  hashComputationError: string | null;
  sealed: boolean;
  executable: boolean;
}>;

type ScopedInventoryRow = Readonly<{
  runId: string;
  ownerId: string;
  accountId: string;
  finalResultHash: string;
}>;

type PhaseSummaryInventoryRow = ScopedInventoryRow & Readonly<{ phase: string }>;
type ReasonEvidenceInventoryRow = ScopedInventoryRow & Readonly<{
  reasonCode: string;
  evidenceHash: string;
  relatedSymbol: string | null;
  relatedOrder: string | null;
  relatedConstraint: string | null;
}>;
type ClaimInventoryRow = ScopedInventoryRow & Readonly<{
  scope: string;
  idempotencyKey: string;
  artifactType: string;
}>;

export type InvestingEnginePhase4CInventorySnapshot = Readonly<{
  transactionReadOnly: true;
  runs: readonly RunInventoryRow[];
  artifacts: readonly ArtifactInventoryRow[];
  phaseSummaries: readonly PhaseSummaryInventoryRow[];
  reasonEvidence: readonly ReasonEvidenceInventoryRow[];
  shadowPackages: readonly ScopedInventoryRow[];
  claims: readonly ClaimInventoryRow[];
  tableHashes: Readonly<Record<(typeof INVESTING_ENGINE_PHASE4C_INTEGRITY_TABLES)[number], string>>;
}>;

export type InvestingEnginePhase4CRunCheck = Readonly<{
  runId: string;
  ownerId: string;
  accountId: string;
  manifestHash: string | null;
  loadVerifyStatus: "verified" | "failed";
  replayStatus: "replay_match" | "replay_mismatch" | "replay_blocked_by_integrity_error";
  persistedFinalResultHash: string | null;
  replayedFinalResultHash: string | null;
}>;

export type InvestingEnginePhase4CIntegrityReport = Readonly<{
  contractVersion: "investing-engine-phase4c-integrity-report/v1";
  status: "clean" | "blocked";
  writes: "none";
  counts: Readonly<Record<(typeof INVESTING_ENGINE_PHASE4C_INTEGRITY_TABLES)[number], number>>;
  tableHashes: InvestingEnginePhase4CInventorySnapshot["tableHashes"];
  runChecks: readonly InvestingEnginePhase4CRunCheck[];
  issues: readonly InvestingEnginePhase4CIntegrityIssue[];
  reportHash: string;
}>;

type ScannerDependencies = Readonly<{
  pool: Pool;
  reader: InvestingEnginePersistenceReaderV1;
  replay: InvestingEngineReplayServiceV1;
}>;

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function issue(
  code: InvestingEnginePhase4CIntegrityReasonCode,
  table: InvestingEnginePhase4CIntegrityIssue["table"],
  runId: string | null,
  detail: string,
): InvestingEnginePhase4CIntegrityIssue {
  return { code, table, runId, detail };
}

function duplicateKeys<T>(rows: readonly T[], keyOf: (row: T) => string): readonly string[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = keyOf(row);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([key]) => key)
    .sort();
}

function scopeIssues(
  table: InvestingEnginePhase4CIntegrityIssue["table"],
  rows: readonly ScopedInventoryRow[],
  runs: ReadonlyMap<string, RunInventoryRow>,
  orphanCode: InvestingEnginePhase4CIntegrityReasonCode,
): InvestingEnginePhase4CIntegrityIssue[] {
  const issues: InvestingEnginePhase4CIntegrityIssue[] = [];
  for (const row of rows) {
    const run = runs.get(row.runId);
    if (!run) {
      issues.push(issue(orphanCode, table, row.runId, "run_reference_missing"));
      continue;
    }
    if (row.ownerId !== run.ownerId) {
      issues.push(issue("BROKEN_OWNER_REFERENCE", table, row.runId, `${row.ownerId}!=${run.ownerId}`));
    }
    if (row.accountId !== run.accountId) {
      issues.push(issue("BROKEN_ACCOUNT_REFERENCE", table, row.runId, `${row.accountId}!=${run.accountId}`));
    }
    if (row.finalResultHash !== run.finalResultHash) {
      issues.push(issue(
        "BROKEN_FINAL_HASH_REFERENCE",
        table,
        row.runId,
        `${row.finalResultHash}!=${run.finalResultHash}`,
      ));
    }
  }
  return issues;
}

export function analyzeInvestingEnginePhase4CInventory(
  snapshot: InvestingEnginePhase4CInventorySnapshot,
): readonly InvestingEnginePhase4CIntegrityIssue[] {
  const issues: InvestingEnginePhase4CIntegrityIssue[] = [];
  const runs = new Map(snapshot.runs.map((run) => [run.runId, run]));
  const knownArtifactTypes = new Set<string>(INVESTING_ENGINE_ARTIFACT_TYPES_V1);

  for (const key of duplicateKeys(snapshot.runs, (run) => run.runId)) {
    issues.push(issue("RUN_DUPLICATE", "investing_engine_runs", key, "duplicate_run_id"));
  }
  for (const run of snapshot.runs) {
    if (run.manifestVersion !== INVESTING_ENGINE_MANIFEST_VERSION) {
      issues.push(issue(
        "RUN_MANIFEST_VERSION_UNKNOWN",
        "investing_engine_runs",
        run.runId,
        run.manifestVersion ?? "null",
      ));
    }
    if (
      run.environment !== "paper"
      || run.executable
      || run.source !== "investing_engine_v1_phase3f"
    ) {
      issues.push(issue(
        "RUN_UNSAFE_STATE",
        "investing_engine_runs",
        run.runId,
        `${run.environment}:${String(run.executable)}:${run.source}`,
      ));
    }
  }

  issues.push(...scopeIssues(
    "investing_engine_artifacts",
    snapshot.artifacts,
    runs,
    "ORPHAN_ARTIFACT",
  ));
  issues.push(...scopeIssues(
    "investing_engine_phase_summaries",
    snapshot.phaseSummaries,
    runs,
    "ORPHAN_PHASE_SUMMARY",
  ));
  issues.push(...scopeIssues(
    "investing_engine_reason_evidence",
    snapshot.reasonEvidence,
    runs,
    "ORPHAN_REASON_EVIDENCE",
  ));
  issues.push(...scopeIssues(
    "investing_engine_shadow_packages",
    snapshot.shadowPackages,
    runs,
    "ORPHAN_SHADOW_PACKAGE",
  ));
  issues.push(...scopeIssues(
    "investing_engine_idempotency_keys",
    snapshot.claims,
    runs,
    "ORPHAN_CLAIM",
  ));

  for (const key of duplicateKeys(snapshot.artifacts, (row) => `${row.runId}:${row.artifactType}`)) {
    const [runId] = key.split(":");
    issues.push(issue("ARTIFACT_DUPLICATE", "investing_engine_artifacts", runId, key));
  }
  for (const key of duplicateKeys(snapshot.phaseSummaries, (row) => `${row.runId}:${row.phase}`)) {
    const [runId] = key.split(":");
    issues.push(issue("PHASE_SUMMARY_DUPLICATE", "investing_engine_phase_summaries", runId, key));
  }
  for (const key of duplicateKeys(
    snapshot.reasonEvidence,
    (row) => [
      row.runId,
      row.reasonCode,
      row.evidenceHash,
      row.relatedSymbol ?? "",
      row.relatedOrder ?? "",
      row.relatedConstraint ?? "",
    ].join(":"),
  )) {
    const [runId] = key.split(":");
    issues.push(issue("REASON_EVIDENCE_DUPLICATE", "investing_engine_reason_evidence", runId, key));
  }
  for (const key of duplicateKeys(snapshot.shadowPackages, (row) => row.runId)) {
    issues.push(issue("SHADOW_PACKAGE_DUPLICATE", "investing_engine_shadow_packages", key, key));
  }
  for (const key of duplicateKeys(
    snapshot.claims,
    (row) => `${row.ownerId}:${row.accountId}:${row.scope}:${row.idempotencyKey}:${row.artifactType}`,
  )) {
    const row = snapshot.claims.find((candidate) =>
      `${candidate.ownerId}:${candidate.accountId}:${candidate.scope}:${candidate.idempotencyKey}:${candidate.artifactType}` === key);
    issues.push(issue("CLAIM_DUPLICATE", "investing_engine_idempotency_keys", row?.runId ?? null, key));
  }

  for (const run of snapshot.runs) {
    const artifacts = snapshot.artifacts.filter((row) => row.runId === run.runId);
    const summaries = snapshot.phaseSummaries.filter((row) => row.runId === run.runId);
    const shadows = snapshot.shadowPackages.filter((row) => row.runId === run.runId);
    const claims = snapshot.claims.filter((row) => row.runId === run.runId);

    for (const artifactType of INVESTING_ENGINE_ARTIFACT_TYPES_V1) {
      if (!artifacts.some((row) => row.artifactType === artifactType)) {
        issues.push(issue(
          "ARTIFACT_INVENTORY_MISSING",
          "investing_engine_artifacts",
          run.runId,
          artifactType,
        ));
      }
    }
    if (summaries.length !== 4) {
      issues.push(issue(
        "PHASE_SUMMARY_COUNT_MISMATCH",
        "investing_engine_phase_summaries",
        run.runId,
        `${summaries.length}!=4`,
      ));
    }
    if (shadows.length !== 1) {
      issues.push(issue(
        "SHADOW_PACKAGE_COUNT_MISMATCH",
        "investing_engine_shadow_packages",
        run.runId,
        `${shadows.length}!=1`,
      ));
    }
    if (claims.length !== 13) {
      issues.push(issue(
        "CLAIM_COUNT_MISMATCH",
        "investing_engine_idempotency_keys",
        run.runId,
        `${claims.length}!=13`,
      ));
    }
  }

  for (const artifact of snapshot.artifacts) {
    if (!knownArtifactTypes.has(artifact.artifactType)) {
      issues.push(issue(
        "ARTIFACT_INVENTORY_UNEXPECTED",
        "investing_engine_artifacts",
        artifact.runId,
        artifact.artifactType,
      ));
    }
    if (artifact.schemaVersion !== INVESTING_ENGINE_PERSISTENCE_SCHEMA_VERSION) {
      issues.push(issue(
        "ARTIFACT_VERSION_UNKNOWN",
        "investing_engine_artifacts",
        artifact.runId,
        `${artifact.artifactType}:${artifact.schemaVersion}`,
      ));
    }
    if (artifact.computedHash === null || artifact.contentHash !== artifact.computedHash) {
      issues.push(issue(
        "ARTIFACT_CONTENT_HASH_MISMATCH",
        "investing_engine_artifacts",
        artifact.runId,
        artifact.hashComputationError
          ? `${artifact.artifactType}:${artifact.hashComputationError}`
          : artifact.artifactType,
      ));
    }
    if (!artifact.sealed || artifact.executable) {
      issues.push(issue(
        "UNEXPECTED_ARTIFACT_STATE",
        "investing_engine_artifacts",
        artifact.runId,
        `${artifact.artifactType}:${String(artifact.sealed)}:${String(artifact.executable)}`,
      ));
    }
    const run = runs.get(artifact.runId);
    if (run && run.hashes[artifact.artifactType] !== artifact.contentHash) {
      issues.push(issue(
        "ARTIFACT_ROOT_HASH_MISMATCH",
        "investing_engine_artifacts",
        artifact.runId,
        artifact.artifactType,
      ));
    }
  }

  return issues.sort((left, right) =>
    left.code.localeCompare(right.code)
    || (left.runId ?? "").localeCompare(right.runId ?? "")
    || left.table.localeCompare(right.table)
    || left.detail.localeCompare(right.detail));
}

function mapRuns(rows: readonly QueryResultRow[]): readonly RunInventoryRow[] {
  return rows.map((row) => ({
    runId: row.run_id,
    ownerId: row.owner_id,
    accountId: row.account_id,
    finalResultHash: row.final_result_hash,
    manifestVersion: row.manifest_version,
    environment: row.environment,
    executable: row.executable,
    source: row.source,
    hashes: row.hashes,
  }));
}

function mapScoped(rows: readonly QueryResultRow[]): readonly ScopedInventoryRow[] {
  return rows.map((row) => ({
    runId: row.run_id,
    ownerId: row.owner_id,
    accountId: row.account_id,
    finalResultHash: row.final_result_hash,
  }));
}

async function tableHash(
  client: PoolClient,
  table: (typeof INVESTING_ENGINE_PHASE4C_INTEGRITY_TABLES)[number],
): Promise<string> {
  const result = await client.query<{ table_hash: string }>(
    `select encode(digest(coalesce(
       string_agg(to_jsonb(row_value)::text, E'\\n' order by to_jsonb(row_value)::text),
       ''
     ), 'sha256'), 'hex') table_hash
     from public.${table} row_value`,
  );
  return result.rows[0].table_hash;
}

async function loadSnapshot(client: PoolClient): Promise<InvestingEnginePhase4CInventorySnapshot> {
  const readOnly = await client.query<{ read_only: string }>(
    "select current_setting('transaction_read_only') read_only",
  );
  if (readOnly.rows[0]?.read_only !== "on") {
    throw new Error("investing_phase4c_scanner_transaction_not_read_only");
  }

  const runs = await client.query(`
    select run_id,owner_id,account_id::text,final_result_hash,manifest_version,
           environment,executable,source,
           jsonb_build_object(
             'canonical_input',canonical_input_hash,
             'portfolio_state_derivation',portfolio_state_derivation_hash,
             'risk_assessment',risk_assessment_hash,
             'policy_evaluation',policy_evaluation_hash,
             'constraint_evaluation',constraint_evaluation_hash,
             'feasible_decision_envelope',feasible_decision_envelope_hash,
             'construction_model',construction_model_hash,
             'preliminary_proposal',preliminary_proposal_hash,
             'final_decision',final_decision_hash,
             'audit_bundle',audit_bundle_hash,
             'shadow_package',shadow_package_hash,
             'final_result',final_result_hash
           ) hashes
    from public.investing_engine_runs
    order by run_id
  `);
  const artifacts = await client.query(`
    select run_id,owner_id,account_id::text,final_result_hash,artifact_type,
           schema_version,content_hash,canonical_payload,
           sealed,executable
    from public.investing_engine_artifacts
    order by run_id,artifact_type
  `);
  const summaries = await client.query(`
    select run_id,owner_id,account_id::text,final_result_hash,phase
    from public.investing_engine_phase_summaries
    order by run_id,phase
  `);
  const reasons = await client.query(`
    select run_id,owner_id,account_id::text,final_result_hash,reason_code,evidence_hash,
           related_symbol,related_order,related_constraint
    from public.investing_engine_reason_evidence
    order by run_id,reason_code,evidence_hash,
             coalesce(related_symbol,''),coalesce(related_order,''),coalesce(related_constraint,'')
  `);
  const shadows = await client.query(`
    select run_id,owner_id,account_id::text,final_result_hash
    from public.investing_engine_shadow_packages
    order by run_id
  `);
  const claims = await client.query(`
    select run_id,owner_id,account_id::text,final_result_hash,scope,idempotency_key,artifact_type
    from public.investing_engine_idempotency_keys
    order by run_id,artifact_type
  `);
  const hashes = {} as Record<(typeof INVESTING_ENGINE_PHASE4C_INTEGRITY_TABLES)[number], string>;
  for (const table of INVESTING_ENGINE_PHASE4C_INTEGRITY_TABLES) {
    hashes[table] = await tableHash(client, table);
  }

  return {
    transactionReadOnly: true,
    runs: mapRuns(runs.rows),
    artifacts: artifacts.rows.map((row) => {
      let computedHash: string | null = null;
      let hashComputationError: string | null = null;
      try {
        const artifactType = row.artifact_type as (typeof INVESTING_ENGINE_ARTIFACT_TYPES_V1)[number];
        const payload = parseCanonicalPayloadV1(row.canonical_payload);
        computedHash = computeInvestingEngineArtifactContentHashV1(artifactType, payload);
      } catch (error) {
        hashComputationError = errorCodeOf(error);
      }
      return {
        runId: row.run_id,
        ownerId: row.owner_id,
        accountId: row.account_id,
        finalResultHash: row.final_result_hash,
        artifactType: row.artifact_type,
        schemaVersion: row.schema_version,
        contentHash: row.content_hash,
        computedHash,
        hashComputationError,
        sealed: row.sealed,
        executable: row.executable,
      };
    }),
    phaseSummaries: summaries.rows.map((row) => ({
      ...mapScoped([row])[0],
      phase: row.phase,
    })),
    reasonEvidence: reasons.rows.map((row) => ({
      ...mapScoped([row])[0],
      reasonCode: row.reason_code,
      evidenceHash: row.evidence_hash,
      relatedSymbol: row.related_symbol,
      relatedOrder: row.related_order,
      relatedConstraint: row.related_constraint,
    })),
    shadowPackages: mapScoped(shadows.rows),
    claims: claims.rows.map((row) => ({
      ...mapScoped([row])[0],
      scope: row.scope,
      idempotencyKey: row.idempotency_key,
      artifactType: row.artifact_type,
    })),
    tableHashes: hashes,
  };
}

export class InvestingEnginePhase4CIntegrityScanner {
  constructor(private readonly dependencies: ScannerDependencies) {
    if (!dependencies.reader) {
      throw new Error("investing_phase4c_scanner_reader_required");
    }
    if (!dependencies.replay) {
      throw new Error("investing_phase4c_scanner_replay_required");
    }
  }

  async scan(): Promise<InvestingEnginePhase4CIntegrityReport> {
    const client = await this.dependencies.pool.connect();
    let snapshot: InvestingEnginePhase4CInventorySnapshot;
    try {
      await client.query("begin isolation level repeatable read read only");
      snapshot = await loadSnapshot(client);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

    const issues = [...analyzeInvestingEnginePhase4CInventory(snapshot)];
    const runChecks: InvestingEnginePhase4CRunCheck[] = [];
    for (const run of snapshot.runs) {
      const selector = { ownerId: run.ownerId, accountId: run.accountId, runId: run.runId };
      let manifestHash: string | null = null;
      let loadVerifyStatus: InvestingEnginePhase4CRunCheck["loadVerifyStatus"] = "failed";
      try {
        manifestHash = (await this.dependencies.reader.loadByRunId(selector)).manifest.manifestHash;
        loadVerifyStatus = "verified";
      } catch (error) {
        const errorCode = errorCodeOf(error);
        issues.push(issue(
          "LOAD_VERIFY_FAILED",
          "investing_engine_runs",
          run.runId,
          errorCode,
        ));
        if (errorCode === "persistence_hash_mismatch") {
          issues.push(issue(
            "ARTIFACT_CONTENT_HASH_MISMATCH",
            "investing_engine_artifacts",
            run.runId,
            "load_verifier",
          ));
        }
      }

      const replay = await this.dependencies.replay.replay(selector);
      if (replay.status === "replay_mismatch") {
        issues.push(issue(
          "REPLAY_MISMATCH",
          "investing_engine_runs",
          run.runId,
          replay.mismatchPaths.join(","),
        ));
      } else if (replay.status === "replay_blocked_by_integrity_error") {
        issues.push(issue(
          "REPLAY_BLOCKED",
          "investing_engine_runs",
          run.runId,
          replay.errorCode ?? "unknown",
        ));
      }
      runChecks.push({
        runId: run.runId,
        ownerId: run.ownerId,
        accountId: run.accountId,
        manifestHash,
        loadVerifyStatus,
        replayStatus: replay.status,
        persistedFinalResultHash: replay.persistedFinalResultHash ?? null,
        replayedFinalResultHash: replay.replayedFinalResultHash ?? null,
      });
    }

    for (const check of runChecks) {
      if (
        check.loadVerifyStatus !== "verified"
        || check.manifestHash === null
        || check.replayStatus !== "replay_match"
        || check.persistedFinalResultHash === null
        || check.replayedFinalResultHash === null
        || check.persistedFinalResultHash !== check.replayedFinalResultHash
      ) {
        issues.push(issue(
          "MANDATORY_CHECK_INCOMPLETE",
          "investing_engine_runs",
          check.runId,
          `${check.loadVerifyStatus}:${check.replayStatus}`,
        ));
      }
    }

    const sortedIssues = issues.sort((left, right) =>
      left.code.localeCompare(right.code)
      || (left.runId ?? "").localeCompare(right.runId ?? "")
      || left.table.localeCompare(right.table)
      || left.detail.localeCompare(right.detail));
    const counts = {
      investing_engine_runs: snapshot.runs.length,
      investing_engine_artifacts: snapshot.artifacts.length,
      investing_engine_phase_summaries: snapshot.phaseSummaries.length,
      investing_engine_reason_evidence: snapshot.reasonEvidence.length,
      investing_engine_shadow_packages: snapshot.shadowPackages.length,
      investing_engine_idempotency_keys: snapshot.claims.length,
    };
    const hashInput = {
      contractVersion: "investing-engine-phase4c-integrity-report/v1",
      counts: Object.fromEntries(
        Object.entries(counts).map(([table, count]) => [table, String(count)]),
      ),
      tableHashes: snapshot.tableHashes,
      runChecks,
      issues: sortedIssues,
    };
    return {
      contractVersion: "investing-engine-phase4c-integrity-report/v1",
      status: sortedIssues.length === 0 ? "clean" : "blocked",
      writes: "none",
      counts,
      tableHashes: snapshot.tableHashes,
      runChecks,
      issues: sortedIssues,
      reportHash: sha256(canonicalPersistenceStringifyV1(hashInput)),
    };
  }
}
