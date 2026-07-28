import { describe, expect, it } from "vitest";

import {
  DATASET_VERSION_REF_VERSION,
  EXPERIMENT_IDENTITY_MATERIAL_VERSION,
  EXPERIMENT_RESULT_ENVELOPE_VERSION,
  INVESTING_RESEARCH_SCOPE_VERSION,
  PROMOTION_ELIGIBILITY_ENVELOPE_VERSION,
  RESEARCH_ARTIFACT_REF_VERSION,
  SCIENTIFIC_DECISION_VERSION,
  type DatasetVersionRef,
  type ExperimentIdentityMaterial,
  type ExperimentResultEnvelope,
  type PromotionEligibilityEnvelope,
  type ResearchArtifactRef,
  type ScientificDecision,
  type ValidationReport,
} from "@/lib/investing/research/contracts";
import {
  ARTIFACT_IDENTITY_VERSION,
  EXECUTION_ENVIRONMENT_VERSION,
  REPRODUCIBILITY_MANIFEST_VERSION,
  REPRODUCIBLE_EXECUTION_IDENTITY_VERSION,
  SOURCE_REVISION_VERSION,
  type ReproducibilityManifestCore,
} from "@/lib/investing/research/reproducibility";
import { deriveResearchArtifactIdentity } from "@/lib/investing/research/reproducibility/artifacts.server";
import { deriveReproducibleExecutionIdentity } from "@/lib/investing/research/reproducibility/executionIdentity.server";
import { deriveReproducibilityManifest } from "@/lib/investing/research/reproducibility/manifest.server";
import { deriveScientificExperimentIdentity } from "@/lib/investing/research/reproducibility/scientificIdentity.server";
import {
  PROMOTION_CANDIDATE_ENVELOPE_VERSION,
  validatePromotionCandidateEnvelope,
} from "@/lib/investing/research/architecture";
import { verifyPromotionCandidateForPreparation } from "@/lib/investing/research/architecture/promotionBoundary.server";

const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);
const AT = "2026-01-01T00:00:00.000Z";
const LATER = "2026-12-31T00:00:00.000Z";
const scope = {
  contractVersion: INVESTING_RESEARCH_SCOPE_VERSION,
  authenticatedUserId: "user-a", membershipId: "membership-a",
  tenantId: "tenant-a", ownerId: "owner-a",
  portfolioId: "portfolio-a", accountId: "account-a",
};
const portfolio = {
  baseCurrency: "EUR", initialCapital: 100_000, allowLeverage: false,
  allowShorting: false, rebalanceFrequency: "monthly",
} as const;
const material: ExperimentIdentityMaterial = {
  contractVersion: EXPERIMENT_IDENTITY_MATERIAL_VERSION,
  scientificScope: { tenantId: "tenant-a", ownerId: "owner-a", portfolioId: "portfolio-a", accountId: "account-a" },
  candidateId: "candidate-a", candidateVersion: "v1",
  hypothesisId: "hypothesis-a", hypothesisVersion: "v1",
  strategyContract: { id: "strategy-a", version: "v1" },
  canonicalParameters: [{ name: "allocation", value: 0.8 }],
  datasetVersionId: "dataset-a", datasetManifestHash: A,
  datasetContentHash: B,
  engineContract: { id: "engine-a", version: "v1" },
  validationProfile: { id: "validation-a", version: "v1" },
  portfolioConfiguration: portfolio,
  costModel: { id: "cost-a", version: "v1" },
  benchmark: { id: "benchmark-a", version: "v1" },
  splits: [{ name: "holdout", purpose: "holdout", range: { from: AT, to: LATER } }],
  randomSeed: "seed-a", configurationVersion: "v1",
};
const dataset: DatasetVersionRef = {
  contractVersion: DATASET_VERSION_REF_VERSION,
  datasetVersionId: "dataset-a", datasetSchemaVersion: "v1",
  manifestHash: A, aggregateContentHash: B,
  coverage: { instruments: ["IWDA"], timeframe: "1d", range: { from: AT, to: LATER }, coverageRatio: 1, gapCount: 0 },
  quality: { status: "qualified", warningCodes: [] },
  provenanceRef: { id: "provider-a", version: "v1" }, qualifiedAt: LATER,
};
const artifact: ResearchArtifactRef = {
  contractVersion: RESEARCH_ARTIFACT_REF_VERSION,
  artifactId: "artifact-logical-a", kind: "metrics", contentHash: A,
  mediaType: "application/json", schemaVersion: "v1", sizeBytes: 128,
  logicalRole: "primary-result",
  provenanceRef: { id: "worker-a", version: "v1" },
  retentionClass: "scientific_record",
};

function fixture() {
  const scientific = deriveScientificExperimentIdentity(material);
  if (!scientific.ok) throw new Error("scientific fixture");
  const executionMaterial = {
    contractVersion: REPRODUCIBLE_EXECUTION_IDENTITY_VERSION,
    scientificExperimentId: scientific.value.experimentId,
    scientificExperimentDigest: scientific.value.digest,
    sourceRevision: {
      contractVersion: SOURCE_REVISION_VERSION, repositoryId: "syntrake",
      vcsKind: "git" as const, commitHash: "d".repeat(40),
      workingTreeState: "clean" as const, sourceContentHash: C,
    },
    environment: {
      contractVersion: EXECUTION_ENVIRONMENT_VERSION,
      dependencyLockHash: "e".repeat(64), engineBuildHash: "f".repeat(64),
      runtime: { id: "node", version: "24.13.0" },
      platform: "linux" as const, architecture: "x64" as const,
      rng: { id: "pcg64", version: "v1" },
      numericPolicy: { id: "ieee754", version: "v1" },
      calendarPolicy: { id: "utc", version: "v1" },
    },
    contractVersions: {
      experimentIdentityMaterial: EXPERIMENT_IDENTITY_MATERIAL_VERSION,
      datasetVersionRef: DATASET_VERSION_REF_VERSION,
      artifactRef: RESEARCH_ARTIFACT_REF_VERSION,
    },
  };
  const execution = deriveReproducibleExecutionIdentity(executionMaterial);
  if (!execution.ok) throw new Error("execution fixture");
  const artifactIdentity = deriveResearchArtifactIdentity({
    contractVersion: ARTIFACT_IDENTITY_VERSION,
    scientificIdentity: scientific.value, executionIdentity: execution.value,
    executionMaterial, artifact,
  });
  if (!artifactIdentity.ok) throw new Error("artifact fixture");
  const core: ReproducibilityManifestCore = {
    contractVersion: REPRODUCIBILITY_MANIFEST_VERSION,
    scientificIdentity: scientific.value, executionIdentity: execution.value,
    dataset, hypothesis: { id: material.hypothesisId, version: material.hypothesisVersion },
    candidate: { id: material.candidateId, version: material.candidateVersion },
    sourceRevision: executionMaterial.sourceRevision,
    environment: executionMaterial.environment,
    strategyContract: material.strategyContract,
    engineContract: material.engineContract,
    validationProfile: material.validationProfile,
    configurationVersion: material.configurationVersion,
    randomSeed: material.randomSeed,
    artifactExpectations: [{ kind: artifact.kind, logicalRole: artifact.logicalRole, mediaType: artifact.mediaType, schemaVersion: artifact.schemaVersion, required: true }],
    artifacts: [{ identity: artifactIdentity.value, scientificExperimentId: scientific.value.experimentId, reproducibleExecutionId: execution.value.executionId, contentHash: artifact.contentHash, kind: artifact.kind, mediaType: artifact.mediaType, schemaVersion: artifact.schemaVersion, logicalRole: artifact.logicalRole }],
  };
  const manifest = deriveReproducibilityManifest(core, {
    createdAt: AT, createdByProcess: { id: "orchestrator", version: "v1" },
    warnings: [],
  });
  if (!manifest.ok) throw new Error("manifest fixture");
  const result: ExperimentResultEnvelope = {
    contractVersion: EXPERIMENT_RESULT_ENVELOPE_VERSION,
    experimentId: scientific.value.experimentId,
    runId: execution.value.executionId,
    candidateId: material.candidateId, candidateVersion: material.candidateVersion,
    hypothesisId: material.hypothesisId, hypothesisVersion: material.hypothesisVersion,
    scope, dataset, validationProfile: material.validationProfile,
    benchmark: material.benchmark, completionStatus: "completed",
    summary: "complete", metrics: [], benchmarkComparison: [], warnings: [],
    qualityFlags: [], validationInputRefs: [], artifacts: [artifact],
  };
  const report: ValidationReport = {
    contractVersion: "investing-validation-report/v1", reportId: "report-a",
    candidateId: material.candidateId, candidateVersion: material.candidateVersion,
    hypothesisId: material.hypothesisId, hypothesisVersion: material.hypothesisVersion,
    experimentId: scientific.value.experimentId, runId: execution.value.executionId,
    scope, dataset, validationProfile: material.validationProfile,
    benchmark: material.benchmark, result,
    gates: [{ gateId: "gate-a", gateVersion: "v1", outcome: "passed", reasonCodes: [], evidenceIds: ["evidence-a"] }],
    evidence: [{ evidenceId: "evidence-a", kind: "validation", description: "passed", artifactRefs: [artifact], reasonCodes: [] }],
    warnings: [], blockers: [], evaluatedAt: LATER,
    evaluatedBy: { id: "validator", version: "v1" },
  };
  const decision: ScientificDecision & { outcome: "validated" } = {
    contractVersion: SCIENTIFIC_DECISION_VERSION, decisionId: "decision-a",
    outcome: "validated", candidateId: material.candidateId,
    candidateVersion: material.candidateVersion,
    hypothesisId: material.hypothesisId, hypothesisVersion: material.hypothesisVersion,
    experimentId: scientific.value.experimentId, runId: execution.value.executionId,
    datasetVersionId: dataset.datasetVersionId,
    datasetManifestHash: dataset.manifestHash,
    datasetContentHash: dataset.aggregateContentHash,
    scope, scientificScope: material.scientificScope,
    validationReport: report, validationProfile: material.validationProfile,
    reasonCodes: [], evidenceIds: ["evidence-a"], warnings: [], blockers: [],
    decidedAt: LATER, decidedBy: { id: "validator", version: "v1" },
  };
  const eligibility: PromotionEligibilityEnvelope = {
    contractVersion: PROMOTION_ELIGIBILITY_ENVELOPE_VERSION,
    eligibilityId: "eligibility-a", state: "promotion_eligible", scope,
    scientificScope: material.scientificScope,
    candidateId: material.candidateId, candidateVersion: material.candidateVersion,
    hypothesisId: material.hypothesisId, hypothesisVersion: material.hypothesisVersion,
    experimentId: scientific.value.experimentId, runId: execution.value.executionId,
    dataset, validationDecision: decision, evidenceIds: ["evidence-a"],
    reasonCodes: [], eligibilityProfile: { id: "eligibility", version: "v1" },
    evaluatedAt: LATER, evaluatedBy: { id: "eligibility", version: "v1" },
  };
  return {
    contractVersion: PROMOTION_CANDIDATE_ENVELOPE_VERSION, scope,
    scientificIdentity: scientific.value, executionIdentity: execution.value,
    executionMaterial, manifest: manifest.value,
    datasets: [{ version: dataset, state: "research_ready" }],
    validationReport: report, scientificDecision: decision,
    promotionEligibility: eligibility,
    candidate: { id: material.candidateId, version: material.candidateVersion },
    strategy: material.strategyContract, portfolioConfiguration: portfolio,
    costModel: material.costModel, benchmark: material.benchmark,
    riskCapacityReferences: [{ id: "risk-a", version: "v1" }],
    correlationId: "correlation-a", idempotencyKey: "idempotency-a",
    contractVersions: {
      scientificContracts: PROMOTION_ELIGIBILITY_ENVELOPE_VERSION,
      reproducibility: REPRODUCIBILITY_MANIFEST_VERSION,
      promotionBoundary: PROMOTION_CANDIDATE_ENVELOPE_VERSION,
    },
    requestedTarget: "shadow",
  } as const;
}

describe("Investing Phase 6D verified promotion boundary", () => {
  it("accepts an integral fixture built with official 6B/6C mechanisms", () => {
    expect(validatePromotionCandidateEnvelope(fixture()).ok).toBe(true);
    expect(verifyPromotionCandidateForPreparation(fixture()).ok).toBe(true);
  });

  it("rejects each unsupported boundary version exactly", () => {
    const value = fixture();
    expect(verifyPromotionCandidateForPreparation({
      ...value,
      contractVersions: {
        ...value.contractVersions,
        scientificContracts: "unknown/v999",
      },
    }).ok).toBe(false);
    expect(verifyPromotionCandidateForPreparation({
      ...value,
      contractVersions: {
        ...value.contractVersions,
        reproducibility: "unknown/v999",
      },
    }).ok).toBe(false);
    expect(verifyPromotionCandidateForPreparation({
      ...value,
      contractVersions: {
        ...value.contractVersions,
        promotionBoundary: "unknown/v999",
      },
    }).ok).toBe(false);
    expect(verifyPromotionCandidateForPreparation({
      ...value,
      contractVersions: {
        scientificContracts: "unknown/v999",
        reproducibility: "unknown/v999",
        promotionBoundary: "unknown/v999",
      },
    }).ok).toBe(false);
  });

  it("requires a completed validation result before preparation", () => {
    for (const completionStatus of ["partial", "failed", "blocked"] as const) {
      const value = fixture();
      const report = {
        ...value.validationReport,
        result: { ...value.validationReport.result, completionStatus },
      };
      const decision = {
        ...value.scientificDecision,
        validationReport: report,
      };
      const eligibility = {
        ...value.promotionEligibility,
        validationDecision: decision,
      };
      expect(verifyPromotionCandidateForPreparation({
        ...value,
        validationReport: report,
        scientificDecision: decision,
        promotionEligibility: eligibility,
      }).ok).toBe(false);
    }
    expect(verifyPromotionCandidateForPreparation(fixture()).ok).toBe(true);
  });

  it("rejects targets, dirty source, fabricated and mismatched identities", () => {
    const value = fixture();
    expect(verifyPromotionCandidateForPreparation({ ...value, requestedTarget: "live" }).ok).toBe(false);
    expect(verifyPromotionCandidateForPreparation({ ...value, requestedTarget: "trading" }).ok).toBe(false);
    expect(verifyPromotionCandidateForPreparation({ ...value, scientificIdentity: { ...value.scientificIdentity, experimentId: `irexp_v1_${B}` } }).ok).toBe(false);
    expect(verifyPromotionCandidateForPreparation({ ...value, executionIdentity: { ...value.executionIdentity, executionId: `irexec_v1_${A}` } }).ok).toBe(false);
    expect(verifyPromotionCandidateForPreparation({ ...value, executionMaterial: { ...value.executionMaterial, sourceRevision: { ...value.executionMaterial.sourceRevision, workingTreeState: "dirty" } } }).ok).toBe(false);
  });

  it("rejects manifest, artifact and dataset mismatches", () => {
    const value = fixture();
    expect(verifyPromotionCandidateForPreparation({ ...value, manifest: { ...value.manifest, manifestId: `irman_v1_${B}` } }).ok).toBe(false);
    expect(verifyPromotionCandidateForPreparation({ ...value, manifest: { ...value.manifest, core: { ...value.manifest.core, artifacts: [] } } }).ok).toBe(false);
    expect(verifyPromotionCandidateForPreparation({ ...value, datasets: [{ ...value.datasets[0], state: "research_ready", version: { ...dataset, aggregateContentHash: C } }] }).ok).toBe(false);
    expect(verifyPromotionCandidateForPreparation({ ...value, datasets: [{ ...value.datasets[0], state: "acquired" }] }).ok).toBe(false);
  });

  it("rejects unrelated report, decision, eligibility and scope", () => {
    const value = fixture();
    expect(verifyPromotionCandidateForPreparation({ ...value, validationReport: { ...value.validationReport, runId: "other-run" } }).ok).toBe(false);
    expect(verifyPromotionCandidateForPreparation({ ...value, scientificDecision: { ...value.scientificDecision, decisionId: "other-decision", validationReport: { ...value.validationReport, reportId: "other-report" } } }).ok).toBe(false);
    expect(verifyPromotionCandidateForPreparation({ ...value, promotionEligibility: { ...value.promotionEligibility, eligibilityId: "other", validationDecision: { ...value.scientificDecision, decisionId: "other" } } }).ok).toBe(false);
    expect(verifyPromotionCandidateForPreparation({ ...value, scope: { ...scope, tenantId: "tenant-b" } }).ok).toBe(false);
  });

  it("rejects callbacks and accessors without executing them", () => {
    let invoked = 0;
    expect(validatePromotionCandidateEnvelope({ ...fixture(), execute: () => { invoked += 1; } }).ok).toBe(false);
    const accessor = Object.defineProperty(fixture(), "writer", {
      enumerable: true, get() { invoked += 1; return true; },
    });
    expect(validatePromotionCandidateEnvelope(accessor).ok).toBe(false);
    expect(invoked).toBe(0);
  });
});
