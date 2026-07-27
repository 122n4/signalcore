import { RESEARCH_SCHEMA_BLUEPRINT_VERSION } from "../reproducibility/versions";

export type PlannedLifecycle = "mutable" | "immutable" | "append_only";
export type PlannedRollbackPosture =
  | "drop_before_data_only"
  | "preserve_evidence_disable_writers";

export type PlannedForeignKey = Readonly<{
  columns: readonly string[];
  referencesTable: string;
  referencesColumns: readonly string[];
  scopeRelation: "same_scope" | "global";
  globalJustification: string | null;
}>;

export type PlannedResearchTable = Readonly<{
  name: `investing_research_${string}`;
  implementationPhase: string;
  purpose: string;
  sourceOfTruth: string;
  scopeBound: boolean;
  scopeColumns: readonly string[];
  globalJustification: string | null;
  explicitColumns: readonly string[];
  primaryKey: readonly string[];
  foreignKeys: readonly PlannedForeignKey[];
  uniqueConstraints: readonly (readonly string[])[];
  lifecycle: PlannedLifecycle;
  authorizedWriter: string;
  readers: readonly string[];
  rlsPosture: Readonly<{
    authenticatedRead: "resolved_active_membership_scope_only";
    authenticatedWrite: "none";
    privilegedRole: "least_privilege_scope_enforced_by_boundary";
    payloadScopeTrusted: false;
    serviceRoleIsAuthorizationBoundary: false;
  }>;
  idempotency: string;
  retention: string;
  rollbackPosture: PlannedRollbackPosture;
}>;

const SCOPE = [
  "tenant_id",
  "owner_id",
  "portfolio_id",
  "account_id",
] as const;

const RLS = Object.freeze({
  authenticatedRead: "resolved_active_membership_scope_only",
  authenticatedWrite: "none",
  privilegedRole: "least_privilege_scope_enforced_by_boundary",
  payloadScopeTrusted: false,
  serviceRoleIsAuthorizationBoundary: false,
} as const);

function table(
  value: Omit<
    PlannedResearchTable,
    "scopeBound" | "scopeColumns" | "globalJustification" | "rlsPosture"
  >,
): PlannedResearchTable {
  const scopedPrimaryKey = [...SCOPE, ...value.primaryKey];
  const hasScopedPrimaryKey = value.uniqueConstraints.some(
    (constraint) =>
      constraint.length === scopedPrimaryKey.length
      && constraint.every((column, index) => column === scopedPrimaryKey[index]),
  );
  return Object.freeze({
    ...value,
    uniqueConstraints: hasScopedPrimaryKey
      ? value.uniqueConstraints
      : [...value.uniqueConstraints, scopedPrimaryKey],
    scopeBound: true,
    scopeColumns: SCOPE,
    globalJustification: null,
    rlsPosture: RLS,
  });
}

function scopedForeignKey(
  columns: readonly string[],
  referencesTable: `investing_research_${string}`,
  referencesColumns: readonly string[],
): PlannedForeignKey {
  return Object.freeze({
    columns: [...SCOPE, ...columns],
    referencesTable,
    referencesColumns: [...SCOPE, ...referencesColumns],
    scopeRelation: "same_scope",
    globalJustification: null,
  });
}

export const INVESTING_RESEARCH_SCHEMA_TABLES = Object.freeze([
  table({
    name: "investing_research_dataset_requests",
    implementationPhase: "phase7",
    purpose: "Canonical requests for future dataset acquisition.",
    sourceOfTruth: "dataset catalog boundary",
    explicitColumns: [...SCOPE, "request_id", "contract_version", "request_hash", "state", "created_at", "canonical_payload"],
    primaryKey: ["request_id"],
    foreignKeys: [],
    uniqueConstraints: [[...SCOPE, "request_hash"]],
    lifecycle: "append_only",
    authorizedWriter: "investing data acquisition boundary",
    readers: ["research orchestrator", "research ops"],
    idempotency: "same scoped request hash reuses the request",
    retention: "scientific acquisition audit history",
    rollbackPosture: "preserve_evidence_disable_writers",
  }),
  table({
    name: "investing_research_datasets",
    implementationPhase: "phase7",
    purpose: "Stable logical dataset identities.",
    sourceOfTruth: "dataset catalog boundary",
    explicitColumns: [...SCOPE, "dataset_id", "dataset_contract_version", "state", "created_at"],
    primaryKey: ["dataset_id"],
    foreignKeys: [],
    uniqueConstraints: [[...SCOPE, "dataset_id"]],
    lifecycle: "immutable",
    authorizedWriter: "dataset catalog repository",
    readers: ["research orchestrator", "research worker", "research ops"],
    idempotency: "logical dataset identity is unique inside scope",
    retention: "retain while any version or experiment references it",
    rollbackPosture: "preserve_evidence_disable_writers",
  }),
  table({
    name: "investing_research_dataset_versions",
    implementationPhase: "phase7",
    purpose: "Immutable qualified dataset versions and canonical manifests.",
    sourceOfTruth: "dataset catalog boundary",
    explicitColumns: [...SCOPE, "dataset_version_id", "dataset_id", "manifest_hash", "content_hash", "schema_version", "quality_state", "qualified_at", "canonical_payload"],
    primaryKey: ["dataset_version_id"],
    foreignKeys: [scopedForeignKey(["dataset_id"], "investing_research_datasets", ["dataset_id"])],
    uniqueConstraints: [["dataset_id", "manifest_hash", "content_hash"]],
    lifecycle: "immutable",
    authorizedWriter: "dataset catalog repository",
    readers: ["research orchestrator", "research worker", "validation engine"],
    idempotency: "content and manifest hashes uniquely identify a version",
    retention: "permanent scientific input evidence",
    rollbackPosture: "preserve_evidence_disable_writers",
  }),
  table({
    name: "investing_research_dataset_lineage",
    implementationPhase: "phase7",
    purpose: "Append-only raw to research-ready lineage edges.",
    sourceOfTruth: "dataset catalog boundary",
    explicitColumns: [...SCOPE, "lineage_event_id", "parent_dataset_version_id", "child_dataset_version_id", "transformation_version", "event_hash", "created_at", "canonical_payload"],
    primaryKey: ["lineage_event_id"],
    foreignKeys: [
      scopedForeignKey(["parent_dataset_version_id"], "investing_research_dataset_versions", ["dataset_version_id"]),
      scopedForeignKey(["child_dataset_version_id"], "investing_research_dataset_versions", ["dataset_version_id"]),
    ],
    uniqueConstraints: [["event_hash"]],
    lifecycle: "append_only",
    authorizedWriter: "dataset catalog lineage repository",
    readers: ["research worker", "validation engine", "research ops"],
    idempotency: "event hash is unique",
    retention: "permanent lineage evidence",
    rollbackPosture: "preserve_evidence_disable_writers",
  }),
  table({
    name: "investing_research_acquisition_jobs",
    implementationPhase: "phase7",
    purpose: "Tenant-aware acquisition request execution state.",
    sourceOfTruth: "data acquisition repository",
    explicitColumns: [...SCOPE, "acquisition_job_id", "request_id", "idempotency_key", "state", "attempt", "lease_token", "lease_owner", "leased_at", "heartbeat_at", "expires_at", "fencing_token", "state_version", "created_at", "updated_at"],
    primaryKey: ["acquisition_job_id"],
    foreignKeys: [scopedForeignKey(["request_id"], "investing_research_dataset_requests", ["request_id"])],
    uniqueConstraints: [[...SCOPE, "idempotency_key"], ["acquisition_job_id", "attempt"]],
    lifecycle: "mutable",
    authorizedWriter: "investing data acquisition repository",
    readers: ["investing data agent", "research ops"],
    idempotency: "scoped key and attempt uniqueness",
    retention: "operational history plus terminal audit events",
    rollbackPosture: "preserve_evidence_disable_writers",
  }),
  table({
    name: "investing_research_hypotheses",
    implementationPhase: "phase10",
    purpose: "Versioned scientific hypotheses.",
    sourceOfTruth: "scientific memory repository",
    explicitColumns: [...SCOPE, "hypothesis_id", "hypothesis_version", "state", "material_hash", "contract_version", "created_at", "canonical_payload"],
    primaryKey: ["hypothesis_id", "hypothesis_version"],
    foreignKeys: [],
    uniqueConstraints: [[...SCOPE, "material_hash"]],
    lifecycle: "append_only",
    authorizedWriter: "hypothesis boundary",
    readers: ["planner", "orchestrator", "validation engine", "research UI"],
    idempotency: "same scoped material hash reuses a version",
    retention: "permanent scientific memory",
    rollbackPosture: "preserve_evidence_disable_writers",
  }),
  table({
    name: "investing_research_candidates",
    implementationPhase: "phase10",
    purpose: "Versioned executable candidate configurations.",
    sourceOfTruth: "candidate repository",
    explicitColumns: [...SCOPE, "candidate_id", "candidate_version", "hypothesis_id", "hypothesis_version", "state", "material_hash", "strategy_contract_version", "created_at", "canonical_payload"],
    primaryKey: ["candidate_id", "candidate_version"],
    foreignKeys: [scopedForeignKey(["hypothesis_id", "hypothesis_version"], "investing_research_hypotheses", ["hypothesis_id", "hypothesis_version"])],
    uniqueConstraints: [[...SCOPE, "material_hash"]],
    lifecycle: "append_only",
    authorizedWriter: "candidate boundary",
    readers: ["orchestrator", "worker", "validation engine", "research UI"],
    idempotency: "same scoped candidate material reuses a version",
    retention: "permanent candidate history",
    rollbackPosture: "preserve_evidence_disable_writers",
  }),
  table({
    name: "investing_research_experiments",
    implementationPhase: "phase9",
    purpose: "Immutable scientific experiment definitions and identities.",
    sourceOfTruth: "experiment repository",
    explicitColumns: [...SCOPE, "experiment_id", "scientific_digest", "identity_version", "canonicalization_version", "hash_algorithm", "candidate_id", "candidate_version", "dataset_version_id", "created_at", "canonical_material"],
    primaryKey: ["experiment_id"],
    foreignKeys: [
      scopedForeignKey(["candidate_id", "candidate_version"], "investing_research_candidates", ["candidate_id", "candidate_version"]),
      scopedForeignKey(["dataset_version_id"], "investing_research_dataset_versions", ["dataset_version_id"]),
    ],
    uniqueConstraints: [["scientific_digest"], ["experiment_id", "scientific_digest"]],
    lifecycle: "immutable",
    authorizedWriter: "experiment identity boundary",
    readers: ["orchestrator", "worker", "validation engine", "research ops"],
    idempotency: "same digest reuses experiment; divergent canonical material is integrity failure",
    retention: "permanent scientific definition",
    rollbackPosture: "preserve_evidence_disable_writers",
  }),
  table({
    name: "investing_research_experiment_runs",
    implementationPhase: "phase9",
    purpose: "Operational attempts for an immutable experiment.",
    sourceOfTruth: "orchestration repository",
    explicitColumns: [...SCOPE, "run_id", "experiment_id", "execution_id", "attempt", "state", "state_version", "lease_token", "lease_owner", "leased_at", "heartbeat_at", "expires_at", "fencing_token", "started_at", "completed_at", "result_hash", "canonical_result"],
    primaryKey: ["run_id"],
    foreignKeys: [scopedForeignKey(["experiment_id"], "investing_research_experiments", ["experiment_id"])],
    uniqueConstraints: [["experiment_id", "attempt"], ["execution_id", "attempt"]],
    lifecycle: "mutable",
    authorizedWriter: "fenced orchestration repository",
    readers: ["worker", "validation engine", "research ops"],
    idempotency: "attempt unique; identical finalization is idempotent, divergent finalization fails",
    retention: "run state retained; completed result becomes immutable",
    rollbackPosture: "preserve_evidence_disable_writers",
  }),
  table({
    name: "investing_research_artifacts",
    implementationPhase: "phase9",
    purpose: "Append-only artifact references and content identities.",
    sourceOfTruth: "artifact repository metadata",
    explicitColumns: [...SCOPE, "artifact_id", "run_id", "experiment_id", "execution_id", "content_hash", "kind", "schema_version", "media_type", "logical_role", "created_at", "canonical_payload"],
    primaryKey: ["artifact_id"],
    foreignKeys: [
      scopedForeignKey(["run_id"], "investing_research_experiment_runs", ["run_id"]),
      scopedForeignKey(["experiment_id"], "investing_research_experiments", ["experiment_id"]),
    ],
    uniqueConstraints: [["artifact_id", "content_hash"]],
    lifecycle: "append_only",
    authorizedWriter: "artifact metadata repository",
    readers: ["worker", "validation engine", "research ops"],
    idempotency: "same identity and content is idempotent; divergent content fails",
    retention: "preserve referenced scientific artifacts",
    rollbackPosture: "preserve_evidence_disable_writers",
  }),
  table({
    name: "investing_research_validation_reports",
    implementationPhase: "phase12",
    purpose: "Immutable validation evidence and gate outcomes.",
    sourceOfTruth: "validation repository",
    explicitColumns: [...SCOPE, "report_id", "experiment_id", "run_id", "dataset_version_id", "profile_version", "report_hash", "evaluated_at", "canonical_payload"],
    primaryKey: ["report_id"],
    foreignKeys: [
      scopedForeignKey(["experiment_id"], "investing_research_experiments", ["experiment_id"]),
      scopedForeignKey(["run_id"], "investing_research_experiment_runs", ["run_id"]),
    ],
    uniqueConstraints: [["report_hash"]],
    lifecycle: "append_only",
    authorizedWriter: "validation engine repository",
    readers: ["scientific decision boundary", "research ops", "research UI"],
    idempotency: "report hash is unique and immutable",
    retention: "permanent scientific evidence",
    rollbackPosture: "preserve_evidence_disable_writers",
  }),
  table({
    name: "investing_research_scientific_decisions",
    implementationPhase: "phase12",
    purpose: "Append-only scientific decisions over validation reports.",
    sourceOfTruth: "scientific decision repository",
    explicitColumns: [...SCOPE, "decision_id", "report_id", "experiment_id", "run_id", "outcome", "decision_hash", "decided_at", "canonical_payload"],
    primaryKey: ["decision_id"],
    foreignKeys: [scopedForeignKey(["report_id"], "investing_research_validation_reports", ["report_id"])],
    uniqueConstraints: [["decision_hash"]],
    lifecycle: "append_only",
    authorizedWriter: "scientific decision boundary",
    readers: ["scientific memory", "promotion eligibility boundary", "research UI"],
    idempotency: "decision hash is unique; terminal decisions never reopen",
    retention: "permanent scientific memory",
    rollbackPosture: "preserve_evidence_disable_writers",
  }),
  table({
    name: "investing_research_promotion_eligibility",
    implementationPhase: "phase15",
    purpose: "Append-only evidence that a validated candidate is eligible.",
    sourceOfTruth: "promotion eligibility repository",
    explicitColumns: [...SCOPE, "eligibility_id", "decision_id", "experiment_id", "candidate_id", "candidate_version", "evidence_hash", "evaluated_at", "canonical_payload"],
    primaryKey: ["eligibility_id"],
    foreignKeys: [scopedForeignKey(["decision_id"], "investing_research_scientific_decisions", ["decision_id"])],
    uniqueConstraints: [["evidence_hash"]],
    lifecycle: "append_only",
    authorizedWriter: "promotion eligibility boundary",
    readers: ["future promotion gateway", "research ops", "research UI"],
    idempotency: "same evidence hash reuses eligibility record",
    retention: "permanent eligibility evidence",
    rollbackPosture: "preserve_evidence_disable_writers",
  }),
  table({
    name: "investing_research_jobs",
    implementationPhase: "phase9",
    purpose: "Tenant-aware orchestration jobs independent of Trading queues.",
    sourceOfTruth: "orchestration repository",
    explicitColumns: [...SCOPE, "job_id", "experiment_id", "run_id", "idempotency_key", "state", "attempt", "lease_token", "lease_owner", "leased_at", "heartbeat_at", "expires_at", "fencing_token", "state_version", "created_at", "updated_at"],
    primaryKey: ["job_id"],
    foreignKeys: [
      scopedForeignKey(["experiment_id"], "investing_research_experiments", ["experiment_id"]),
      scopedForeignKey(["run_id"], "investing_research_experiment_runs", ["run_id"]),
    ],
    uniqueConstraints: [[...SCOPE, "idempotency_key"], ["run_id", "attempt"]],
    lifecycle: "mutable",
    authorizedWriter: "fenced orchestration repository",
    readers: ["orchestrator", "worker", "research ops"],
    idempotency: "scoped key and run attempt are unique",
    retention: "terminal jobs retained for operational audit",
    rollbackPosture: "preserve_evidence_disable_writers",
  }),
  table({
    name: "investing_research_idempotency_records",
    implementationPhase: "phase9",
    purpose: "Scoped request/result bindings for ambiguous retries.",
    sourceOfTruth: "application repositories",
    explicitColumns: [...SCOPE, "idempotency_record_id", "operation", "idempotency_key", "request_hash", "result_hash", "state", "created_at", "completed_at"],
    primaryKey: ["idempotency_record_id"],
    foreignKeys: [],
    uniqueConstraints: [[...SCOPE, "operation", "idempotency_key"]],
    lifecycle: "append_only",
    authorizedWriter: "scoped application repository",
    readers: ["orchestrator", "data agent", "research ops"],
    idempotency: "same key and request hash replays result; divergent request fails",
    retention: "at least the retry and recovery horizon",
    rollbackPosture: "preserve_evidence_disable_writers",
  }),
  table({
    name: "investing_research_audit_events",
    implementationPhase: "phase14",
    purpose: "Append-only scientific and operational audit events.",
    sourceOfTruth: "scientific memory event repository",
    explicitColumns: [...SCOPE, "event_id", "aggregate_type", "aggregate_id", "event_type", "event_version", "event_hash", "occurred_at", "canonical_payload"],
    primaryKey: ["event_id"],
    foreignKeys: [],
    uniqueConstraints: [["event_hash"]],
    lifecycle: "append_only",
    authorizedWriter: "audited research boundaries",
    readers: ["scientific memory", "research ops", "research UI"],
    idempotency: "event hash is unique",
    retention: "permanent audit and negative knowledge",
    rollbackPosture: "preserve_evidence_disable_writers",
  }),
] satisfies readonly PlannedResearchTable[]);

export type PlannedTransactionBoundary = Readonly<{
  operation: string;
  atomicGuarantee: string;
}>;

export const INVESTING_RESEARCH_TRANSACTION_BOUNDARIES = Object.freeze([
  { operation: "create_or_reuse_experiment", atomicGuarantee: "insert by unique scientific digest or return identical canonical material; divergent material fails" },
  { operation: "create_attempt", atomicGuarantee: "allocate unique (experiment_id, attempt) and run/job together" },
  { operation: "claim_lease", atomicGuarantee: "compare state/version and issue monotonically newer fencing token" },
  { operation: "heartbeat", atomicGuarantee: "update only matching live lease and fencing token" },
  { operation: "finalize_result", atomicGuarantee: "verify fence then persist terminal result and artifact references atomically" },
  { operation: "persist_validation_report", atomicGuarantee: "insert immutable report with all referenced hashes" },
  { operation: "persist_scientific_decision", atomicGuarantee: "insert terminal decision referencing one immutable report" },
  { operation: "emit_promotion_eligibility", atomicGuarantee: "insert evidence only after validated decision, without executing promotion" },
  { operation: "recover_expired_lease", atomicGuarantee: "prove expiry, increment fence/state version and requeue same experiment attempt policy" },
] satisfies readonly PlannedTransactionBoundary[]);

export const INVESTING_RESEARCH_RECOVERY_PLAN = Object.freeze({
  recoverableStates: ["queued", "leased", "running"] as const,
  terminalStates: ["completed", "failed", "blocked", "cancelled"] as const,
  retryBudget: "explicit policy version; never implicit or unbounded",
  failureClassification: "stable reason code and failed stage",
  replay: "same canonical input and final content is idempotent",
  orphanArtifacts: "quarantine until a fenced finalization adopts or expires them",
  partialFinalization: "roll back transaction or recover by idempotency record",
  prohibitions: [
    "change scientific identity",
    "reopen terminal decisions",
    "promote candidates",
    "write orders positions or accounting",
    "reuse Trading queue or filesystem lock",
  ] as const,
});

export const INVESTING_RESEARCH_MIGRATION_PLAN = Object.freeze([
  "create tables without integration writers",
  "add constraints and foreign keys",
  "enable RLS and least-privilege grants",
  "implement server-only repositories",
  "add real PostgreSQL and RLS tests",
  "introduce shadow writes or feature flag if required",
  "activate workers",
  "activate read models",
  "activate Promotion Gateway only in its own phase",
] as const);

export const INVESTING_RESEARCH_SCHEMA_BLUEPRINT = Object.freeze({
  contractVersion: RESEARCH_SCHEMA_BLUEPRINT_VERSION,
  tables: INVESTING_RESEARCH_SCHEMA_TABLES,
  transactionBoundaries: INVESTING_RESEARCH_TRANSACTION_BOUNDARIES,
  recovery: INVESTING_RESEARCH_RECOVERY_PLAN,
  migrationPlan: INVESTING_RESEARCH_MIGRATION_PLAN,
  rollback: {
    beforeData: "disable writers and drop only while evidence count is provably zero",
    afterData: "disable writers/processes and preserve tables, artifacts and scientific evidence",
  },
  enforcementIsPlannedNotImplemented: true,
});
