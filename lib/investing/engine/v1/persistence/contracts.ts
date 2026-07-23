export const INVESTING_ENGINE_PERSISTENCE_SCHEMA_VERSION = "investing-engine-persistence/v2" as const;
export const INVESTING_ENGINE_MANIFEST_VERSION = "investing-engine-persistence-manifest/v3" as const;
export const INVESTING_ENGINE_CONSTRAINT_SET_VERSION = "investing-constraint-set/v1" as const;
export const INVESTING_ENGINE_PERSISTENCE_SOURCE = "investing_engine_v1_phase3f" as const;
export const INVESTING_ENGINE_PERSISTENCE_SCOPE = "investing_engine_v1" as const;
export const INVESTING_ENGINE_CANONICAL_PAYLOAD_MAX_BYTES = 16_777_216 as const;

export const INVESTING_ENGINE_PERSISTENCE_TABLES = [
  "investing_engine_runs",
  "investing_engine_artifacts",
  "investing_engine_phase_summaries",
  "investing_engine_reason_evidence",
  "investing_engine_shadow_packages",
  "investing_engine_idempotency_keys",
] as const;

export const INVESTING_ENGINE_ARTIFACT_TYPES_V1 = [
  "canonical_input",
  "portfolio_state_derivation",
  "risk_assessment",
  "policy_evaluation",
  "constraint_evaluation",
  "feasible_decision_envelope",
  "construction_model",
  "preliminary_proposal",
  "final_decision",
  "audit_bundle",
  "shadow_package",
  "final_result",
] as const;

export const INVESTING_ENGINE_PERSISTENCE_PHASES_V1 = ["phase3c", "phase3d", "phase3e", "phase3f"] as const;
export const INVESTING_ENGINE_FINAL_STATES_V1 = [
  "proposal_ready", "no_trade", "degraded", "blocked", "insufficient_data",
] as const;

export type CanonicalObjectV1 = Readonly<Record<string, unknown>>;
export type InvestingEngineArtifactTypeV1 = (typeof INVESTING_ENGINE_ARTIFACT_TYPES_V1)[number];
export type InvestingEnginePersistencePhaseV1 = (typeof INVESTING_ENGINE_PERSISTENCE_PHASES_V1)[number];
export type InvestingEnginePersistedFinalStateV1 = (typeof INVESTING_ENGINE_FINAL_STATES_V1)[number];
export type InvestingEnginePersistedQualityV1 = "good" | "degraded" | "insufficient";

export type InvestingEngineRunIdentityV1 = Readonly<{
  runId: string; requestedUserId: string; ownerId: string; accountId: string;
  accountMode: "paper"; environment: "paper"; asOf: string;
  inputSnapshotId: string; marketSnapshotId: string; mandateSnapshotId: string;
  constructionModelSnapshotId: string;
}>;

export type InvestingEnginePersistenceClaimV1 = Readonly<{
  scope: string; idempotencyKey: string;
  artifactType: InvestingEngineArtifactTypeV1 | "engine_run";
  ownerId: string; accountId: string; runId: string; finalResultHash: string;
  expectedContentHash: string;
}>;

export type InvestingEnginePersistenceRowScopeV1 = Readonly<{
  ownerId: string; accountId: string; runId: string; finalResultHash: string;
}>;

export type InvestingEngineSealedArtifactV1 = Readonly<{
  identity: InvestingEngineRunIdentityV1;
  artifactType: InvestingEngineArtifactTypeV1;
  sourcePhase: InvestingEnginePersistencePhaseV1;
  state: string; quality: InvestingEnginePersistedQualityV1;
  confidence: Readonly<{ value: string; basis: readonly string[] }>;
  contentHash: string; finalResultHash: string; contractVersion: string;
  schemaVersion: typeof INVESTING_ENGINE_PERSISTENCE_SCHEMA_VERSION;
  canonicalPayload: string; sealed: true; executable: false;
  persistenceTxid?: string;
  claim: InvestingEnginePersistenceClaimV1;
}>;

export type InvestingEnginePhaseSummaryPersistenceV1 = InvestingEnginePersistenceRowScopeV1 & Readonly<{
  phase: InvestingEnginePersistencePhaseV1; state: string; quality: InvestingEnginePersistedQualityV1;
  inputHash: string; outputHash: string; warningCodes: readonly string[];
  blockingReasons: readonly string[]; reasonCodes: readonly string[];
}>;

export type InvestingEngineReasonEvidencePersistenceV1 = InvestingEnginePersistenceRowScopeV1 & Readonly<{
  reasonCode: string; phaseSource: InvestingEnginePersistencePhaseV1;
  severity: "info" | "warning" | "error";
  consequence: "inform" | "degrade" | "block" | "insufficient_data" | "select";
  evidenceHash: string; relatedSymbol: string | null; relatedOrder: string | null;
  relatedConstraint: string | null;
}>;

export type InvestingEngineShadowMetadataV1 = InvestingEnginePersistenceRowScopeV1 & Readonly<{
  shadowPackageHash: string; engineNewResultHash: string; status: "awaiting_legacy_result";
  legacyResult: null; comparison: null; executable: false;
}>;

export type InvestingEngineArtifactMetadataV1 = Readonly<{
  identity: InvestingEngineRunIdentityV1;
  artifactType: InvestingEngineArtifactTypeV1;
  sourcePhase: InvestingEnginePersistencePhaseV1;
  state: string; quality: InvestingEnginePersistedQualityV1;
  confidence: Readonly<{ value: string; basis: readonly string[] }>;
  contentHash: string; finalResultHash: string; contractVersion: string;
  schemaVersion: typeof INVESTING_ENGINE_PERSISTENCE_SCHEMA_VERSION;
  sealed: true; executable: false;
}>;

export type InvestingEngineVersionSetPersistenceV1 = Readonly<{
  contractVersion: string; engineVersion: string; policyVersion: string; modelVersion: string;
  instrumentCatalogVersion: string; marketDataSchemaVersion: string;
}>;

export type InvestingEnginePersistenceManifestV1 = Readonly<{
  contractVersion: typeof INVESTING_ENGINE_MANIFEST_VERSION;
  schemaVersion: typeof INVESTING_ENGINE_PERSISTENCE_SCHEMA_VERSION;
  identity: InvestingEngineRunIdentityV1;
  versions: InvestingEngineVersionSetPersistenceV1;
  idempotency: Readonly<{ scope: string; key: string }>;
  state: InvestingEnginePersistedFinalStateV1; quality: InvestingEnginePersistedQualityV1;
  rootMetadata: Readonly<{
    confidence: Readonly<{ value: string; basis: readonly string[] }>;
    selectedCandidateId: string | null;
  }>;
  executable: false; inputSnapshotId: string; marketSnapshotId: string;
  modelSnapshotIds: Readonly<{ mandate: string; construction: string }>;
  requestHash: string; finalResultHash: string;
  artifactHashes: readonly Readonly<{ artifactType: InvestingEngineArtifactTypeV1; contentHash: string }>[];
  phaseSummaryHashes: readonly Readonly<{ phase: InvestingEnginePersistencePhaseV1; contentHash: string }>[];
  reasonEvidenceHashes: readonly Readonly<{ reasonCode: string; evidenceHash: string }>[];
  artifactMetadata: readonly InvestingEngineArtifactMetadataV1[];
  phaseSummaries: readonly InvestingEnginePhaseSummaryPersistenceV1[];
  reasonEvidence: readonly InvestingEngineReasonEvidencePersistenceV1[];
  claims: readonly InvestingEnginePersistenceClaimV1[];
  shadowMetadata: InvestingEngineShadowMetadataV1;
  counts: Readonly<{ artifacts: string; phaseSummaries: string; reasonEvidence: string; shadowPackages: "1"; claims: string }>;
  manifestHash: string;
}>;

export type InvestingEnginePersistenceInputV1 = Readonly<{
  idempotencyKey: string;
  request: CanonicalObjectV1; context: CanonicalObjectV1; canonicalInput: CanonicalObjectV1;
  portfolioStateDerivation: CanonicalObjectV1; riskAssessment: CanonicalObjectV1;
  policyEvaluation: CanonicalObjectV1; constraintEvaluations: readonly CanonicalObjectV1[];
  feasibleDecisionEnvelope: CanonicalObjectV1; constructionModel: CanonicalObjectV1;
  preliminaryProposal: CanonicalObjectV1; finalDecision: CanonicalObjectV1;
  explanation: CanonicalObjectV1; auditBundle: CanonicalObjectV1;
  shadowPackage: CanonicalObjectV1; finalResult: CanonicalObjectV1;
  phaseSummaries: readonly CanonicalObjectV1[]; reasonEvidence: readonly CanonicalObjectV1[];
}>;

export type InvestingEnginePersistencePreparedV1 = Readonly<{
  manifest: InvestingEnginePersistenceManifestV1;
  artifacts: readonly InvestingEngineSealedArtifactV1[];
  phaseSummaries: readonly InvestingEnginePhaseSummaryPersistenceV1[];
  reasonEvidence: readonly InvestingEngineReasonEvidencePersistenceV1[];
  shadowPackage: CanonicalObjectV1;
  shadowMetadata: InvestingEngineShadowMetadataV1;
  claims: readonly InvestingEnginePersistenceClaimV1[];
  source: InvestingEnginePersistenceInputV1;
}>;

export type InvestingEnginePersistedRunRowV1 = Readonly<{
  identity: InvestingEngineRunIdentityV1; versions: InvestingEngineVersionSetPersistenceV1;
  state: InvestingEnginePersistedFinalStateV1; quality: InvestingEnginePersistedQualityV1;
  confidence: Readonly<{ value: string; basis: readonly string[] }>;
  executable: false; source: typeof INVESTING_ENGINE_PERSISTENCE_SOURCE;
  idempotencyScope: string; idempotencyKey: string; requestHash: string;
  hashes: Readonly<Record<InvestingEngineArtifactTypeV1, string>>;
  selectedCandidateId: string | null; manifestVersion: string | null; persistenceTxid: string;
}>;

export type InvestingEngineLoadedPersistenceV1 = Readonly<{
  run: InvestingEnginePersistedRunRowV1;
  artifacts: readonly InvestingEngineSealedArtifactV1[];
  phaseSummaries: readonly (InvestingEnginePhaseSummaryPersistenceV1 & Readonly<{ persistenceTxid: string }>)[];
  reasonEvidence: readonly (InvestingEngineReasonEvidencePersistenceV1 & Readonly<{ persistenceTxid: string }>)[];
  shadowPackage: InvestingEngineShadowMetadataV1 & Readonly<{ persistenceTxid: string }>;
  claims: readonly (InvestingEnginePersistenceClaimV1 & Readonly<{ persistenceTxid: string }>)[];
}>;

export type InvestingEngineVerifiedLoadV1 = Readonly<{
  status: "complete";
  loaded: InvestingEngineLoadedPersistenceV1;
  manifest: InvestingEnginePersistenceManifestV1;
  parsedArtifacts: Readonly<Record<InvestingEngineArtifactTypeV1, CanonicalObjectV1>>;
}>;

export type InvestingEnginePersistResultV1 = Readonly<{
  status: "inserted" | "idempotent_existing" | "recovered_after_ambiguous_commit";
  runId: string; ownerId: string; accountId: string; finalResultHash: string; manifestHash: string;
  counts: InvestingEnginePersistenceManifestV1["counts"]; errorCode: null; writes: "committed" | "none";
}>;

export type InvestingEngineReplayStatusV1 = "replay_match" | "replay_mismatch" | "replay_blocked_by_integrity_error";
export type InvestingEngineReplayResultV1 = Readonly<{
  status: InvestingEngineReplayStatusV1; runId: string; ownerId: string; accountId: string; manifestHash: string | null;
  persistedFinalResultHash: string | null; replayedFinalResultHash: string | null;
  mismatchPaths: readonly string[]; errorCode: string | null; writes: "none";
}>;

export type PureInvestingEngineRunnerV1 = (sources: Readonly<Record<string, unknown>>) => CanonicalObjectV1;
