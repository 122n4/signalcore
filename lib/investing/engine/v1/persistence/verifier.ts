import {
  INVESTING_ENGINE_ARTIFACT_TYPES_V1,
  INVESTING_ENGINE_CONSTRAINT_SET_VERSION,
  INVESTING_ENGINE_MANIFEST_VERSION,
  INVESTING_ENGINE_PERSISTENCE_PHASES_V1,
  INVESTING_ENGINE_PERSISTENCE_SCHEMA_VERSION,
  type CanonicalObjectV1,
  type InvestingEngineArtifactMetadataV1,
  type InvestingEngineArtifactTypeV1,
  type InvestingEngineLoadedPersistenceV1,
  type InvestingEnginePersistenceInputV1,
  type InvestingEnginePersistenceManifestV1,
  type InvestingEngineVerifiedLoadV1,
} from "@/lib/investing/engine/v1/persistence/contracts";
import {
  canonicalEqualV1,
  canonicalPersistenceSha256V1,
  canonicalPersistenceStringifyV1,
  hashSetSemanticPersistenceV1,
  hashWithoutPersistenceFieldV1,
  parseCanonicalPayloadV1,
} from "@/lib/investing/engine/v1/persistence/canonical";
import { persistenceError } from "@/lib/investing/engine/v1/persistence/errors";
import {
  buildInvestingEnginePersistenceManifestV1,
  hashInvestingEnginePhaseSummaryV1,
  sealInvestingEngineManifestDraftV1,
} from "@/lib/investing/engine/v1/persistence/manifest";

const SHA = /^[a-f0-9]{64}$/u;

function object(value: unknown, label: string): CanonicalObjectV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) return persistenceError("persistence_input_invalid", { label });
  return value as CanonicalObjectV1;
}
function text(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) return persistenceError("persistence_input_invalid", { label });
  return value;
}
function array(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) return persistenceError("persistence_input_invalid", { label });
  return value;
}
function same(left: unknown, right: unknown, code: "persistence_scope_mismatch" | "persistence_version_mismatch" | "persistence_snapshot_mismatch" | "persistence_manifest_mismatch" = "persistence_manifest_mismatch") {
  if (!canonicalEqualV1(left, right)) persistenceError(code);
}
function assertHash(value: CanonicalObjectV1, field: string) {
  const expected = text(value[field], field);
  if (!SHA.test(expected) || hashWithoutPersistenceFieldV1(value, field) !== expected) {
    persistenceError("persistence_hash_mismatch", { field });
  }
}

function assertArtifactHash(type: InvestingEngineArtifactTypeV1, payload: CanonicalObjectV1, expected: string) {
  let actual: string;
  switch (type) {
    case "canonical_input": assertHash(payload, "inputHash"); actual = text(payload.inputHash, "inputHash"); break;
    case "portfolio_state_derivation": actual = hashSetSemanticPersistenceV1(payload); break;
    case "risk_assessment": assertHash(payload, "assessmentHash"); actual = text(payload.assessmentHash, "assessmentHash"); break;
    case "policy_evaluation": assertHash(payload, "policyHash"); actual = text(payload.policyHash, "policyHash"); break;
    case "constraint_evaluation":
      if (payload.contractVersion !== INVESTING_ENGINE_CONSTRAINT_SET_VERSION) persistenceError("persistence_version_mismatch");
      actual = hashSetSemanticPersistenceV1(array(payload.items, "constraints.items")); break;
    case "feasible_decision_envelope": assertHash(payload, "envelopeHash"); actual = text(payload.envelopeHash, "envelopeHash"); break;
    case "construction_model": assertHash(payload, "snapshotHash"); actual = text(payload.snapshotHash, "snapshotHash"); break;
    case "preliminary_proposal": assertHash(payload, "proposalHash"); actual = text(payload.proposalHash, "proposalHash"); break;
    case "final_decision": assertHash(payload, "finalDecisionHash"); actual = text(payload.finalDecisionHash, "finalDecisionHash"); break;
    case "audit_bundle": assertHash(payload, "auditBundleHash"); actual = text(payload.auditBundleHash, "auditBundleHash"); break;
    case "shadow_package": assertHash(payload, "shadowPackageHash"); actual = text(payload.shadowPackageHash, "shadowPackageHash"); break;
    case "final_result": assertHash(payload, "finalResultHash"); actual = text(payload.finalResultHash, "finalResultHash"); break;
  }
  if (actual !== expected) persistenceError("persistence_hash_mismatch", { artifactType: type });
}

function assertNestedIntegrity(finalResult: CanonicalObjectV1) {
  const decision = object(finalResult.decision, "finalResult.decision");
  const explanation = object(finalResult.explanation, "finalResult.explanation");
  const audit = object(finalResult.auditBundle, "finalResult.auditBundle");
  const shadow = object(finalResult.shadowPackage, "finalResult.shadowPackage");
  assertHash(decision, "finalDecisionHash"); assertHash(explanation, "explanationHash");
  assertHash(audit, "auditBundleHash"); assertHash(shadow, "shadowPackageHash"); assertHash(finalResult, "finalResultHash");
  if (finalResult.executable !== false || decision.executable !== false || audit.executable !== false) {
    persistenceError("persistence_executable_forbidden");
  }
  if (finalResult.accountMode !== "paper" || object(audit.accountSummary, "accountSummary").accountMode !== "paper") {
    persistenceError("persistence_non_paper_forbidden");
  }
  const hashes = object(finalResult.hashes, "finalResult.hashes");
  if (hashes.finalDecisionHash !== decision.finalDecisionHash || hashes.auditBundleHash !== audit.auditBundleHash || hashes.shadowPackageHash !== shadow.shadowPackageHash) {
    persistenceError("persistence_hash_mismatch", { field: "finalResult.hashes" });
  }
  same(finalResult.actions, decision.actions); same(finalResult.targetPortfolio, decision.targetPortfolio);
  same(finalResult.explanation, decision.explanation);
  if (!canonicalEqualV1(finalResult.confidence, decision.confidence)) persistenceError("persistence_root_confidence_mismatch");
  if (finalResult.state !== decision.state) persistenceError("persistence_manifest_mismatch");
  if (finalResult.selectedCandidateId !== decision.selectedCandidateId) persistenceError("persistence_root_selected_candidate_mismatch");
  for (const reasonValue of array(decision.reasons, "decision.reasons")) {
    const reason = object(reasonValue, "reason"); assertHash(reason, "evidenceHash");
  }
  for (const actionValue of array(decision.actions, "decision.actions")) assertHash(object(actionValue, "action"), "actionHash");
  for (const nodeValue of array(explanation.nodes, "explanation.nodes")) assertHash(object(nodeValue, "node"), "evidenceHash");
}

function artifactMetadata(artifact: InvestingEngineLoadedPersistenceV1["artifacts"][number]): InvestingEngineArtifactMetadataV1 {
  return {
    identity: artifact.identity, artifactType: artifact.artifactType, sourcePhase: artifact.sourcePhase,
    state: artifact.state, quality: artifact.quality, confidence: artifact.confidence,
    contentHash: artifact.contentHash, finalResultHash: artifact.finalResultHash,
    contractVersion: artifact.contractVersion, schemaVersion: artifact.schemaVersion,
    sealed: artifact.sealed, executable: artifact.executable,
  };
}

function canonicalOrder<T>(values: readonly T[]): readonly T[] {
  return [...values].sort((a, b) => canonicalPersistenceStringifyV1(a).localeCompare(canonicalPersistenceStringifyV1(b)));
}

function materialRow<T extends Readonly<{ persistenceTxid: string }>>(value: T): Omit<T, "persistenceTxid"> {
  const { persistenceTxid: _persistenceTxid, ...material } = value;
  void _persistenceTxid;
  return material;
}

function verifySourceCoherence(input: InvestingEnginePersistenceInputV1) {
  canonicalPersistenceStringifyV1(input);
  const result = input.finalResult;
  const request = input.request;
  const context = input.context;
  assertHash(request, "requestHash"); assertHash(context, "contextHash"); assertNestedIntegrity(result);
  if (
    request.contractVersion !== "investing-engine-run-request/v1"
    || context.contractVersion !== "investing-engine-run-context/v1"
    || result.contractVersion !== "investing-engine-result-final/v1"
    || input.finalDecision.contractVersion !== "investing-engine-decision/v1"
    || input.auditBundle.contractVersion !== "investing-engine-audit-bundle/v1"
    || input.shadowPackage.contractVersion !== "investing-engine-shadow-package/v1"
    || input.explanation.contractVersion !== "investing-engine-explanation/v1"
  ) persistenceError("persistence_version_mismatch");
  if (context.accountMode !== "paper" || input.canonicalInput.environment !== "paper") persistenceError("persistence_non_paper_forbidden");
  if (result.ownerId !== context.ownerId || result.requestedUserId !== request.requestedUserId || request.requestedUserId !== context.expectedUserId || context.ownerId !== context.expectedUserId) {
    persistenceError("persistence_scope_mismatch");
  }
  if (result.accountId !== request.accountId || request.accountId !== context.expectedAccountId || input.canonicalInput.accountId !== result.accountId) {
    persistenceError("persistence_scope_mismatch");
  }
  if (result.runId !== request.runId || input.canonicalInput.runId !== result.runId) persistenceError("persistence_scope_mismatch");
  for (const key of ["asOf", "inputSnapshotId", "marketSnapshotId", "mandateSnapshotId", "constructionModelSnapshotId"] as const) {
    if (result[key] !== request[key]) persistenceError("persistence_snapshot_mismatch", { key });
  }
  same(result.versions, request.versions, "persistence_version_mismatch");
  same(result.versions, input.canonicalInput.versions, "persistence_version_mismatch");
  const hashes = object(result.hashes, "hashes");
  const sourceHashes = object(request.sourceHashes, "sourceHashes");
  const sourceHashKeys = ["canonicalInputHash", "portfolioStateDerivationHash", "riskAssessmentHash", "policyEvaluationHash", "constraintEvaluationHash", "feasibleDecisionEnvelopeHash", "constructionModelHash", "preliminaryProposalHash"];
  for (const key of sourceHashKeys) if (hashes[key] !== sourceHashes[key]) persistenceError("persistence_hash_mismatch", { key });
  if (hashes.requestHash !== request.requestHash) persistenceError("persistence_hash_mismatch", { key: "requestHash" });
  if (!canonicalEqualV1(input.explanation, result.explanation)) persistenceError("persistence_manifest_mismatch", { key: "explanation" });
  same(input.finalDecision, result.decision); same(input.auditBundle, result.auditBundle); same(input.shadowPackage, result.shadowPackage);
  same(input.phaseSummaries, result.phaseSummaries); same(input.reasonEvidence, object(result.decision, "decision").reasons);
  const proposal = input.preliminaryProposal;
  if (!canonicalEqualV1(proposal.confidence, result.confidence)) persistenceError("persistence_root_confidence_mismatch");
  if (result.selectedCandidateId !== null) {
    const candidates = array(proposal.candidates, "preliminaryProposal.candidates");
    const selectedExists = candidates.some((candidate) => object(candidate, "candidate").candidateId === result.selectedCandidateId);
    if (proposal.selectedCandidateId !== result.selectedCandidateId || !selectedExists) {
      persistenceError("persistence_root_selected_candidate_mismatch");
    }
  }
}

export class InvestingEnginePersistenceVerifierV1 {
  verifyInput(input: InvestingEnginePersistenceInputV1) {
    verifySourceCoherence(input);
    const prepared = buildInvestingEnginePersistenceManifestV1(input);
    for (const artifact of prepared.artifacts) {
      const parsed = parseCanonicalPayloadV1(artifact.canonicalPayload);
      const expectedContractVersion = artifact.artifactType === "canonical_input"
        ? prepared.manifest.versions.contractVersion
        : artifact.artifactType === "portfolio_state_derivation"
          ? "investing-portfolio-state-derivation/v1"
          : text(parsed.contractVersion, `${artifact.artifactType}.contractVersion`);
      if (artifact.contractVersion !== expectedContractVersion) persistenceError("persistence_version_mismatch", { artifactType: artifact.artifactType });
      assertArtifactHash(artifact.artifactType, parsed, artifact.contentHash);
    }
    if (prepared.phaseSummaries.length !== 4 || prepared.reasonEvidence.length === 0) persistenceError("persistence_manifest_incomplete");
    return prepared;
  }

  verifyLoaded(loaded: InvestingEngineLoadedPersistenceV1): InvestingEngineVerifiedLoadV1 {
    if (loaded.run.executable !== false || loaded.run.identity.accountMode !== "paper" || loaded.run.identity.environment !== "paper") {
      persistenceError(loaded.run.executable === false ? "persistence_non_paper_forbidden" : "persistence_executable_forbidden");
    }
    if (loaded.run.source !== "investing_engine_v1_phase3f") persistenceError("persistence_version_mismatch");
    if (loaded.run.manifestVersion !== INVESTING_ENGINE_MANIFEST_VERSION) persistenceError("persistence_version_mismatch");
    if (loaded.artifacts.length !== INVESTING_ENGINE_ARTIFACT_TYPES_V1.length || loaded.phaseSummaries.length !== 4 || loaded.reasonEvidence.length === 0 || loaded.claims.length !== 13) {
      persistenceError("persistence_partial_load");
    }
    const artifactsByType = new Map<InvestingEngineArtifactTypeV1, CanonicalObjectV1>();
    for (const artifact of loaded.artifacts) {
      if (artifactsByType.has(artifact.artifactType)) persistenceError("persistence_manifest_incomplete", { reason: "duplicate_artifact" });
      if (artifact.schemaVersion !== INVESTING_ENGINE_PERSISTENCE_SCHEMA_VERSION || !artifact.sealed || artifact.executable) persistenceError("persistence_version_mismatch");
      if (artifact.identity.runId !== loaded.run.identity.runId || artifact.identity.ownerId !== loaded.run.identity.ownerId || artifact.identity.accountId !== loaded.run.identity.accountId) {
        persistenceError("persistence_cross_tenant_artifact_mismatch");
      }
      if (artifact.finalResultHash !== loaded.run.hashes.final_result) {
        persistenceError("persistence_scope_mismatch");
      }
      const parsed = parseCanonicalPayloadV1(artifact.canonicalPayload);
      const expectedContractVersion = artifact.artifactType === "canonical_input"
        ? loaded.run.versions.contractVersion
        : artifact.artifactType === "portfolio_state_derivation"
          ? "investing-portfolio-state-derivation/v1"
          : text(parsed.contractVersion, `${artifact.artifactType}.contractVersion`);
      if (artifact.contractVersion !== expectedContractVersion) persistenceError("persistence_version_mismatch", { artifactType: artifact.artifactType });
      assertArtifactHash(artifact.artifactType, parsed, artifact.contentHash);
      if (loaded.run.hashes[artifact.artifactType] !== artifact.contentHash) persistenceError("persistence_hash_mismatch", { artifactType: artifact.artifactType });
      artifactsByType.set(artifact.artifactType, parsed);
    }
    for (const type of INVESTING_ENGINE_ARTIFACT_TYPES_V1) if (!artifactsByType.has(type)) persistenceError("persistence_manifest_incomplete", { artifactType: type });
    const finalResult = artifactsByType.get("final_result")!;
    assertNestedIntegrity(finalResult);
    if (finalResult.runId !== loaded.run.identity.runId || finalResult.ownerId !== loaded.run.identity.ownerId || finalResult.accountId !== loaded.run.identity.accountId) persistenceError("persistence_scope_mismatch");
    if (finalResult.inputSnapshotId !== loaded.run.identity.inputSnapshotId || finalResult.marketSnapshotId !== loaded.run.identity.marketSnapshotId) persistenceError("persistence_snapshot_mismatch");
    same(finalResult.versions, loaded.run.versions, "persistence_version_mismatch");
    if (finalResult.state !== loaded.run.state || finalResult.quality !== loaded.run.quality) persistenceError("persistence_manifest_mismatch");
    if (!canonicalEqualV1(finalResult.confidence, loaded.run.confidence)) {
      persistenceError("persistence_root_confidence_mismatch");
    }
    if (finalResult.selectedCandidateId !== loaded.run.selectedCandidateId) {
      persistenceError("persistence_root_selected_candidate_mismatch");
    }
    const audit = artifactsByType.get("audit_bundle")!;
    const contextDraft = {
      contractVersion: "investing-engine-run-context/v1",
      ownerId: loaded.run.identity.ownerId,
      expectedUserId: loaded.run.identity.requestedUserId,
      expectedAccountId: loaded.run.identity.accountId,
      accountMode: "paper",
    } as const;
    const reconstructed: InvestingEnginePersistenceInputV1 = {
      idempotencyKey: loaded.run.idempotencyKey,
      request: object(audit.request, "audit.request"),
      context: { ...contextDraft, contextHash: canonicalPersistenceSha256V1(contextDraft) },
      canonicalInput: artifactsByType.get("canonical_input")!,
      portfolioStateDerivation: artifactsByType.get("portfolio_state_derivation")!,
      riskAssessment: artifactsByType.get("risk_assessment")!,
      policyEvaluation: artifactsByType.get("policy_evaluation")!,
      constraintEvaluations: array(artifactsByType.get("constraint_evaluation")!.items, "constraints") as readonly CanonicalObjectV1[],
      feasibleDecisionEnvelope: artifactsByType.get("feasible_decision_envelope")!,
      constructionModel: artifactsByType.get("construction_model")!,
      preliminaryProposal: artifactsByType.get("preliminary_proposal")!,
      finalDecision: artifactsByType.get("final_decision")!,
      explanation: object(finalResult.explanation, "finalResult.explanation"),
      auditBundle: audit,
      shadowPackage: artifactsByType.get("shadow_package")!, finalResult,
      phaseSummaries: array(finalResult.phaseSummaries, "finalResult.phaseSummaries") as readonly CanonicalObjectV1[],
      reasonEvidence: array(object(finalResult.decision, "decision").reasons, "decision.reasons") as readonly CanonicalObjectV1[],
    };
    verifySourceCoherence(reconstructed);
    for (const phase of INVESTING_ENGINE_PERSISTENCE_PHASES_V1) if (!loaded.phaseSummaries.some((summary) => summary.phase === phase)) persistenceError("persistence_partial_load");
    const reasons = array(object(finalResult.decision, "decision").reasons, "reasons");
    if (reasons.length !== loaded.reasonEvidence.length) persistenceError("persistence_partial_load", { reason: "reason_count" });
    for (const evidence of loaded.reasonEvidence) {
      const source = reasons.find((entry) => object(entry, "reason").evidenceHash === evidence.evidenceHash);
      if (!source || object(source, "reason").code !== evidence.reasonCode) persistenceError("persistence_hash_mismatch", { reason: "evidence" });
    }
    const shadowArtifact = artifactsByType.get("shadow_package")!;
    if (loaded.shadowPackage.ownerId !== loaded.run.identity.ownerId || loaded.shadowPackage.accountId !== loaded.run.identity.accountId || loaded.shadowPackage.runId !== loaded.run.identity.runId || loaded.shadowPackage.finalResultHash !== loaded.run.hashes.final_result || loaded.shadowPackage.shadowPackageHash !== shadowArtifact.shadowPackageHash || loaded.shadowPackage.engineNewResultHash !== finalResult.finalResultHash || loaded.shadowPackage.status !== "awaiting_legacy_result" || loaded.shadowPackage.legacyResult !== null || loaded.shadowPackage.comparison !== null || loaded.shadowPackage.executable !== false) {
      persistenceError("persistence_shadow_metadata_mismatch", { reason: "shadow" });
    }
    const txid = loaded.run.persistenceTxid;
    if (loaded.artifacts.some((artifact) => (artifact as unknown as { persistenceTxid?: string }).persistenceTxid !== undefined && (artifact as unknown as { persistenceTxid: string }).persistenceTxid !== txid) || loaded.phaseSummaries.some((summary) => summary.persistenceTxid !== txid) || loaded.reasonEvidence.some((reason) => reason.persistenceTxid !== txid) || loaded.claims.some((claim) => claim.persistenceTxid !== txid) || loaded.shadowPackage.persistenceTxid !== txid) {
      persistenceError("persistence_partial_load", { reason: "transaction_boundary" });
    }
    const artifactHashes = INVESTING_ENGINE_ARTIFACT_TYPES_V1.map((artifactType) => ({ artifactType, contentHash: loaded.run.hashes[artifactType] }));
    const fullArtifactMetadata = INVESTING_ENGINE_ARTIFACT_TYPES_V1.map((artifactType) => {
      const artifact = loaded.artifacts.find((entry) => entry.artifactType === artifactType)!;
      return artifactMetadata(artifact);
    });
    const fullPhaseSummaries = INVESTING_ENGINE_PERSISTENCE_PHASES_V1.map((phase) => materialRow(loaded.phaseSummaries.find((entry) => entry.phase === phase)!));
    const fullReasonEvidence = canonicalOrder(loaded.reasonEvidence.map(materialRow));
    const fullClaims = canonicalOrder(loaded.claims.map(materialRow));
    const fullShadowMetadata = {
      ownerId: loaded.shadowPackage.ownerId, accountId: loaded.shadowPackage.accountId,
      runId: loaded.shadowPackage.runId, finalResultHash: loaded.shadowPackage.finalResultHash,
      shadowPackageHash: loaded.shadowPackage.shadowPackageHash,
      engineNewResultHash: loaded.shadowPackage.engineNewResultHash,
      status: loaded.shadowPackage.status,
      legacyResult: loaded.shadowPackage.legacyResult,
      comparison: loaded.shadowPackage.comparison,
      executable: loaded.shadowPackage.executable,
    } as const;
    const phaseSummaryHashes = INVESTING_ENGINE_PERSISTENCE_PHASES_V1.map((phase) => {
      const summary = fullPhaseSummaries.find((entry) => entry.phase === phase)!;
      return { phase, contentHash: hashInvestingEnginePhaseSummaryV1(summary as unknown as CanonicalObjectV1) };
    });
    const reasonEvidenceHashes = [...loaded.reasonEvidence]
      .sort((a, b) => `${a.reasonCode}:${a.evidenceHash}`.localeCompare(`${b.reasonCode}:${b.evidenceHash}`))
      .map(({ reasonCode, evidenceHash }) => ({ reasonCode, evidenceHash }));
    const manifest = sealInvestingEngineManifestDraftV1({
      contractVersion: INVESTING_ENGINE_MANIFEST_VERSION, schemaVersion: INVESTING_ENGINE_PERSISTENCE_SCHEMA_VERSION,
      identity: loaded.run.identity, versions: loaded.run.versions,
      idempotency: { scope: loaded.run.idempotencyScope, key: loaded.run.idempotencyKey },
      state: loaded.run.state, quality: loaded.run.quality,
      rootMetadata: { confidence: loaded.run.confidence, selectedCandidateId: loaded.run.selectedCandidateId },
      executable: false,
      inputSnapshotId: loaded.run.identity.inputSnapshotId, marketSnapshotId: loaded.run.identity.marketSnapshotId,
      modelSnapshotIds: { mandate: loaded.run.identity.mandateSnapshotId, construction: loaded.run.identity.constructionModelSnapshotId },
      requestHash: loaded.run.requestHash, finalResultHash: loaded.run.hashes.final_result,
      artifactHashes, phaseSummaryHashes, reasonEvidenceHashes,
      artifactMetadata: fullArtifactMetadata,
      phaseSummaries: fullPhaseSummaries,
      reasonEvidence: fullReasonEvidence,
      claims: fullClaims,
      shadowMetadata: fullShadowMetadata,
      counts: { artifacts: `${loaded.artifacts.length}`, phaseSummaries: `${loaded.phaseSummaries.length}`, reasonEvidence: `${loaded.reasonEvidence.length}`, shadowPackages: "1", claims: `${loaded.claims.length}` },
    });
    const claims = new Map(loaded.claims.map((claim) => [claim.artifactType, claim]));
    for (const type of ["engine_run", ...INVESTING_ENGINE_ARTIFACT_TYPES_V1] as const) {
      const claim = claims.get(type);
      const expected = type === "engine_run" ? loaded.run.hashes.final_result : loaded.run.hashes[type];
      if (!claim || claim.runId !== loaded.run.identity.runId || claim.ownerId !== loaded.run.identity.ownerId || claim.accountId !== loaded.run.identity.accountId || claim.finalResultHash !== loaded.run.hashes.final_result || claim.expectedContentHash !== expected) persistenceError("persistence_claim_metadata_mismatch", { reason: "claim", type });
    }
    const expectedFromPayloads = buildInvestingEnginePersistenceManifestV1(reconstructed).manifest;
    if (!canonicalEqualV1(expectedFromPayloads.artifactMetadata, manifest.artifactMetadata)) persistenceError("persistence_artifact_metadata_mismatch");
    if (!canonicalEqualV1(expectedFromPayloads.phaseSummaries, manifest.phaseSummaries)) persistenceError("persistence_summary_metadata_mismatch");
    if (!canonicalEqualV1(expectedFromPayloads.reasonEvidence, manifest.reasonEvidence)) persistenceError("persistence_reason_metadata_mismatch");
    if (!canonicalEqualV1(expectedFromPayloads.claims, manifest.claims)) persistenceError("persistence_claim_metadata_mismatch");
    if (!canonicalEqualV1(expectedFromPayloads.shadowMetadata, manifest.shadowMetadata)) persistenceError("persistence_shadow_metadata_mismatch");
    this.assertSameManifest(expectedFromPayloads, manifest);
    return { status: "complete", loaded, manifest, parsedArtifacts: Object.fromEntries(artifactsByType) as Record<InvestingEngineArtifactTypeV1, CanonicalObjectV1> };
  }

  assertSameManifest(expected: InvestingEnginePersistenceManifestV1, actual: InvestingEnginePersistenceManifestV1) {
    if (expected.manifestHash !== actual.manifestHash || canonicalPersistenceStringifyV1(expected) !== canonicalPersistenceStringifyV1(actual)) {
      persistenceError("persistence_manifest_mismatch", { expected: expected.manifestHash, actual: actual.manifestHash });
    }
  }
}
