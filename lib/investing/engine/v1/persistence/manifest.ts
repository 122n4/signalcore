import {
  INVESTING_ENGINE_ARTIFACT_TYPES_V1,
  INVESTING_ENGINE_CANONICAL_PAYLOAD_MAX_BYTES,
  INVESTING_ENGINE_CONSTRAINT_SET_VERSION,
  INVESTING_ENGINE_MANIFEST_VERSION,
  INVESTING_ENGINE_PERSISTENCE_SCHEMA_VERSION,
  INVESTING_ENGINE_PERSISTENCE_SCOPE,
  type CanonicalObjectV1,
  type InvestingEngineArtifactMetadataV1,
  type InvestingEngineArtifactTypeV1,
  type InvestingEnginePersistenceClaimV1,
  type InvestingEnginePersistenceInputV1,
  type InvestingEnginePersistenceManifestV1,
  type InvestingEnginePersistencePhaseV1,
  type InvestingEnginePersistencePreparedV1,
  type InvestingEnginePersistedQualityV1,
  type InvestingEngineRunIdentityV1,
  type InvestingEngineSealedArtifactV1,
  type InvestingEngineShadowMetadataV1,
  type InvestingEngineVersionSetPersistenceV1,
} from "@/lib/investing/engine/v1/persistence/contracts";
import { canonicalPersistenceSha256V1, canonicalPersistenceStringifyV1 } from "@/lib/investing/engine/v1/persistence/canonical";
import { persistenceError } from "@/lib/investing/engine/v1/persistence/errors";

const ARTIFACT_PHASE: Readonly<Record<InvestingEngineArtifactTypeV1, InvestingEnginePersistencePhaseV1>> = {
  canonical_input: "phase3c", portfolio_state_derivation: "phase3c",
  risk_assessment: "phase3d", policy_evaluation: "phase3d", constraint_evaluation: "phase3d",
  feasible_decision_envelope: "phase3d", construction_model: "phase3e", preliminary_proposal: "phase3e",
  final_decision: "phase3f", audit_bundle: "phase3f", shadow_package: "phase3f", final_result: "phase3f",
};

const HASH_FIELD: Readonly<Record<InvestingEngineArtifactTypeV1, string>> = {
  canonical_input: "canonicalInputHash", portfolio_state_derivation: "portfolioStateDerivationHash",
  risk_assessment: "riskAssessmentHash", policy_evaluation: "policyEvaluationHash",
  constraint_evaluation: "constraintEvaluationHash", feasible_decision_envelope: "feasibleDecisionEnvelopeHash",
  construction_model: "constructionModelHash", preliminary_proposal: "preliminaryProposalHash",
  final_decision: "finalDecisionHash", audit_bundle: "auditBundleHash", shadow_package: "shadowPackageHash",
  final_result: "finalResultHash",
};

function object(value: unknown, label: string): CanonicalObjectV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) return persistenceError("persistence_input_invalid", { label });
  return value as CanonicalObjectV1;
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") return persistenceError("persistence_input_invalid", { label });
  return value;
}

function quality(value: unknown): InvestingEnginePersistedQualityV1 {
  if (value === "good" || value === "degraded" || value === "insufficient") return value;
  return persistenceError("persistence_input_invalid", { label: "quality" });
}

function artifactPayloads(input: InvestingEnginePersistenceInputV1): Readonly<Record<InvestingEngineArtifactTypeV1, CanonicalObjectV1>> {
  return {
    canonical_input: input.canonicalInput,
    portfolio_state_derivation: input.portfolioStateDerivation,
    risk_assessment: input.riskAssessment,
    policy_evaluation: input.policyEvaluation,
    constraint_evaluation: { contractVersion: INVESTING_ENGINE_CONSTRAINT_SET_VERSION, items: input.constraintEvaluations },
    feasible_decision_envelope: input.feasibleDecisionEnvelope,
    construction_model: input.constructionModel,
    preliminary_proposal: input.preliminaryProposal,
    final_decision: input.finalDecision,
    audit_bundle: input.auditBundle,
    shadow_package: input.shadowPackage,
    final_result: input.finalResult,
  };
}

function contractVersion(type: InvestingEngineArtifactTypeV1, payload: CanonicalObjectV1, versions: InvestingEngineVersionSetPersistenceV1): string {
  if (type === "portfolio_state_derivation") return "investing-portfolio-state-derivation/v1";
  if (type === "canonical_input") return versions.contractVersion;
  return string(payload.contractVersion, `${type}.contractVersion`);
}

function hashRecord(finalResult: CanonicalObjectV1): CanonicalObjectV1 {
  return object(finalResult.hashes, "finalResult.hashes");
}

function artifactHash(type: InvestingEngineArtifactTypeV1, finalResult: CanonicalObjectV1): string {
  if (type === "final_result") return string(finalResult.finalResultHash, "finalResult.finalResultHash");
  return string(hashRecord(finalResult)[HASH_FIELD[type]], `finalResult.hashes.${HASH_FIELD[type]}`);
}

function phaseSummaryHash(summary: CanonicalObjectV1): string {
  return canonicalPersistenceSha256V1(summary);
}

function artifactMetadata(artifact: InvestingEngineSealedArtifactV1): InvestingEngineArtifactMetadataV1 {
  return {
    identity: artifact.identity, artifactType: artifact.artifactType, sourcePhase: artifact.sourcePhase,
    state: artifact.state, quality: artifact.quality, confidence: artifact.confidence,
    contentHash: artifact.contentHash, finalResultHash: artifact.finalResultHash,
    contractVersion: artifact.contractVersion, schemaVersion: artifact.schemaVersion,
    sealed: artifact.sealed, executable: artifact.executable,
  };
}

function claimOrder(claim: InvestingEnginePersistenceClaimV1): string {
  return `${claim.artifactType}:${claim.scope}:${claim.idempotencyKey}`;
}

function buildManifestDraft(args: Omit<InvestingEnginePersistenceManifestV1, "manifestHash">) {
  return { ...args, manifestHash: canonicalPersistenceSha256V1(args) } satisfies InvestingEnginePersistenceManifestV1;
}

export function buildInvestingEnginePersistenceManifestV1(input: InvestingEnginePersistenceInputV1): InvestingEnginePersistencePreparedV1 {
  const result = input.finalResult;
  const request = input.request;
  const context = input.context;
  const versions = object(result.versions, "finalResult.versions") as InvestingEngineVersionSetPersistenceV1;
  const identity: InvestingEngineRunIdentityV1 = {
    runId: string(result.runId, "runId"), requestedUserId: string(result.requestedUserId, "requestedUserId"),
    ownerId: string(result.ownerId, "ownerId"), accountId: string(result.accountId, "accountId"),
    accountMode: result.accountMode === "paper" ? "paper" : persistenceError("persistence_non_paper_forbidden"),
    environment: input.canonicalInput.environment === "paper" ? "paper" : persistenceError("persistence_non_paper_forbidden"),
    asOf: string(result.asOf, "asOf"), inputSnapshotId: string(result.inputSnapshotId, "inputSnapshotId"),
    marketSnapshotId: string(result.marketSnapshotId, "marketSnapshotId"),
    mandateSnapshotId: string(result.mandateSnapshotId, "mandateSnapshotId"),
    constructionModelSnapshotId: string(result.constructionModelSnapshotId, "constructionModelSnapshotId"),
  };
  if (request.runId !== identity.runId || context.ownerId !== identity.ownerId) {
    return persistenceError("persistence_scope_mismatch");
  }
  const state = result.state;
  if (!(["proposal_ready", "no_trade", "degraded", "blocked", "insufficient_data"] as unknown[]).includes(state)) {
    return persistenceError("persistence_input_invalid", { label: "state" });
  }
  if (result.executable !== false || input.finalDecision.executable !== false || input.auditBundle.executable !== false) {
    return persistenceError("persistence_executable_forbidden");
  }
  const finalResultHash = string(result.finalResultHash, "finalResultHash");
  const rowScope = { ownerId: identity.ownerId, accountId: identity.accountId, runId: identity.runId, finalResultHash };
  const resultQuality = quality(result.quality);
  const confidence = object(result.confidence, "confidence") as { value: string; basis: readonly string[] };
  const payloads = artifactPayloads(input);
  const artifacts = INVESTING_ENGINE_ARTIFACT_TYPES_V1.map((artifactType) => {
    const canonicalPayload = canonicalPersistenceStringifyV1(payloads[artifactType]);
    if (Buffer.byteLength(canonicalPayload, "utf8") > INVESTING_ENGINE_CANONICAL_PAYLOAD_MAX_BYTES) {
      return persistenceError("persistence_input_invalid", { label: artifactType, reason: "payload_too_large" });
    }
    const contentHash = artifactHash(artifactType, result);
    return {
      identity, artifactType, sourcePhase: ARTIFACT_PHASE[artifactType], state: state as InvestingEngineSealedArtifactV1["state"],
      quality: resultQuality, confidence, contentHash, finalResultHash,
      contractVersion: contractVersion(artifactType, payloads[artifactType], versions),
      schemaVersion: INVESTING_ENGINE_PERSISTENCE_SCHEMA_VERSION, canonicalPayload, sealed: true, executable: false,
      claim: {
        scope: `${INVESTING_ENGINE_PERSISTENCE_SCOPE}:artifact`, idempotencyKey: `${input.idempotencyKey}:${artifactType}`,
        artifactType, ownerId: identity.ownerId, accountId: identity.accountId, runId: identity.runId,
        finalResultHash, expectedContentHash: contentHash,
      },
    } satisfies InvestingEngineSealedArtifactV1;
  });
  const phaseSummaries = input.phaseSummaries.map((entry) => ({
    ...rowScope,
    phase: string(entry.phase, "summary.phase") as InvestingEnginePersistencePhaseV1,
    state: string(entry.state, "summary.state"), quality: quality(entry.quality),
    inputHash: string(entry.inputHash, "summary.inputHash"), outputHash: string(entry.outputHash, "summary.outputHash"),
    warningCodes: [], blockingReasons: entry.phase === "phase3f" ? (result.blockers as readonly string[] ?? []) : [],
    reasonCodes: entry.reasonCodes as readonly string[],
  }));
  const reasonEvidence = input.reasonEvidence.map((entry) => ({
    ...rowScope,
    reasonCode: string(entry.code, "reason.code"), phaseSource: string(entry.phaseSource, "reason.phaseSource") as InvestingEnginePersistencePhaseV1,
    severity: string(entry.severity, "reason.severity") as "info" | "warning" | "error",
    consequence: string(entry.consequence, "reason.consequence") as "inform" | "degrade" | "block" | "insufficient_data" | "select",
    evidenceHash: string(entry.evidenceHash, "reason.evidenceHash"), relatedSymbol: null, relatedOrder: null, relatedConstraint: null,
  }));
  const artifactHashes = artifacts.map(({ artifactType, contentHash }) => ({ artifactType, contentHash }));
  const phaseSummaryHashes = phaseSummaries.map((summary) => ({ phase: summary.phase, contentHash: phaseSummaryHash(summary as unknown as CanonicalObjectV1) }));
  const reasonEvidenceHashes = reasonEvidence
    .map(({ reasonCode, evidenceHash }) => ({ reasonCode, evidenceHash }))
    .sort((a, b) => `${a.reasonCode}:${a.evidenceHash}`.localeCompare(`${b.reasonCode}:${b.evidenceHash}`));
  const engineClaim = {
    scope: INVESTING_ENGINE_PERSISTENCE_SCOPE, idempotencyKey: input.idempotencyKey,
    artifactType: "engine_run", ownerId: identity.ownerId, accountId: identity.accountId,
    runId: identity.runId, finalResultHash, expectedContentHash: finalResultHash,
  } satisfies InvestingEnginePersistenceClaimV1;
  const claims: readonly InvestingEnginePersistenceClaimV1[] = ([
    engineClaim,
    ...artifacts.map((artifact) => artifact.claim),
  ] satisfies InvestingEnginePersistenceClaimV1[]).sort((a, b) => claimOrder(a).localeCompare(claimOrder(b)));
  const shadowMetadata: InvestingEngineShadowMetadataV1 = {
    ...rowScope,
    shadowPackageHash: string(input.shadowPackage.shadowPackageHash, "shadowPackageHash"),
    engineNewResultHash: finalResultHash, status: "awaiting_legacy_result",
    legacyResult: null, comparison: null, executable: false,
  };
  const manifest = buildManifestDraft({
    contractVersion: INVESTING_ENGINE_MANIFEST_VERSION, schemaVersion: INVESTING_ENGINE_PERSISTENCE_SCHEMA_VERSION,
    identity, versions, idempotency: { scope: INVESTING_ENGINE_PERSISTENCE_SCOPE, key: input.idempotencyKey },
    state: state as InvestingEnginePersistenceManifestV1["state"], quality: resultQuality,
    rootMetadata: {
      confidence,
      selectedCandidateId: result.selectedCandidateId === null
        ? null
        : string(result.selectedCandidateId, "selectedCandidateId"),
    },
    executable: false,
    inputSnapshotId: identity.inputSnapshotId, marketSnapshotId: identity.marketSnapshotId,
    modelSnapshotIds: { mandate: identity.mandateSnapshotId, construction: identity.constructionModelSnapshotId },
    requestHash: string(hashRecord(result).requestHash, "requestHash"), finalResultHash,
    artifactHashes, phaseSummaryHashes, reasonEvidenceHashes,
    artifactMetadata: artifacts.map(artifactMetadata),
    phaseSummaries,
    reasonEvidence: [...reasonEvidence].sort((a, b) => canonicalPersistenceStringifyV1(a).localeCompare(canonicalPersistenceStringifyV1(b))),
    claims,
    shadowMetadata,
    counts: { artifacts: `${artifacts.length}`, phaseSummaries: `${phaseSummaries.length}`, reasonEvidence: `${reasonEvidence.length}`, shadowPackages: "1", claims: `${claims.length}` },
  });
  return { manifest, artifacts, phaseSummaries, reasonEvidence, shadowPackage: input.shadowPackage, shadowMetadata, claims, source: input };
}

export function hashInvestingEnginePhaseSummaryV1(summary: CanonicalObjectV1): string { return phaseSummaryHash(summary); }
export function sealInvestingEngineManifestDraftV1(draft: Omit<InvestingEnginePersistenceManifestV1, "manifestHash">) { return buildManifestDraft(draft); }
