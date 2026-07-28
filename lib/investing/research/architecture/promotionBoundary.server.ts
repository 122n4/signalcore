import "server-only";

import {
  canonicalizeResearchContract,
} from "../contracts/runtimeValidation";
import {
  scientificResearchScopesEqual,
  toInvestingResearchScientificScope,
} from "../contracts/scope";
import {
  validateResearchArtifactIdentityIntegrity,
} from "../reproducibility/artifacts.server";
import {
  deriveReproducibleExecutionIdentity,
  validateReproducibleExecutionIdentityIntegrity,
} from "../reproducibility/executionIdentity.server";
import {
  validateReproducibilityManifestIntegrity,
} from "../reproducibility/manifest.server";
import {
  validateScientificExperimentIdentityIntegrity,
} from "../reproducibility/scientificIdentity.server";
import type {
  ArchitectureIssue,
  ArchitectureValidationResult,
} from "./dependencyGraph";
import {
  validatePromotionCandidateEnvelope,
  type PromotionCandidateEnvelope,
} from "./promotionBoundary";

function fail(
  path: string,
  reasonCode: ArchitectureIssue["reasonCode"],
): ArchitectureValidationResult<never> {
  return { ok: false, issues: [{ path, reasonCode }] };
}
function same(left: unknown, right: unknown): boolean {
  const a = canonicalizeResearchContract(left);
  const b = canonicalizeResearchContract(right);
  return a.ok && b.ok && a.value === b.value;
}

/**
 * The sole Phase 6D preparation gate. This verifies evidence only and performs
 * no write, submission, Engine call, broker call, or promotion.
 */
export function verifyPromotionCandidateForPreparation(
  input: unknown,
): ArchitectureValidationResult<PromotionCandidateEnvelope> {
  const parsed = validatePromotionCandidateEnvelope(input);
  if (!parsed.ok) return parsed;
  const value = parsed.value;
  const scientific = validateScientificExperimentIdentityIntegrity(
    value.scientificIdentity,
  );
  const execution = validateReproducibleExecutionIdentityIntegrity(
    value.executionIdentity,
  );
  const suppliedExecution = deriveReproducibleExecutionIdentity(
    value.executionMaterial,
  );
  if (!scientific.ok || !execution.ok || !suppliedExecution.ok
    || suppliedExecution.value.executionId !== value.executionIdentity.executionId
    || !same(execution.value.material, value.executionMaterial)) {
    return fail("promotion.identities", "research.promotion.identity_mismatch");
  }
  if (execution.value.material.scientificExperimentId
    !== scientific.value.identity.experimentId
    || execution.value.material.scientificExperimentDigest
    !== scientific.value.identity.digest
    || !scientificResearchScopesEqual(
      scientific.value.material.scientificScope,
      toInvestingResearchScientificScope(value.scope),
    )) {
    return fail("promotion.scope", "research.promotion.scope_mismatch");
  }
  if (execution.value.material.sourceRevision.workingTreeState !== "clean") {
    return fail("promotion.executionMaterial.sourceRevision", "research.promotion.integrity_blocked");
  }
  const manifest = validateReproducibilityManifestIntegrity(value.manifest);
  if (!manifest.ok
    || manifest.value.core.scientificIdentity.experimentId
      !== scientific.value.identity.experimentId
    || manifest.value.core.executionIdentity.executionId
      !== execution.value.identity.executionId
    || !same(manifest.value.core.sourceRevision,
      execution.value.material.sourceRevision)
    || !same(manifest.value.core.environment,
      execution.value.material.environment)) {
    return fail("promotion.manifest", "research.promotion.manifest_invalid");
  }
  for (const artifact of manifest.value.core.artifacts) {
    const integrity = validateResearchArtifactIdentityIntegrity(
      artifact.identity,
    );
    if (!integrity.ok
      || integrity.value.projection.scientificExperimentId
        !== scientific.value.identity.experimentId
      || integrity.value.projection.reproducibleExecutionId
        !== execution.value.identity.executionId
      || !same(integrity.value.projection, {
        contractVersion: artifact.identity.contractVersion,
        scientificExperimentId: artifact.scientificExperimentId,
        reproducibleExecutionId: artifact.reproducibleExecutionId,
        contentHash: artifact.contentHash,
        kind: artifact.kind,
        mediaType: artifact.mediaType,
        schemaVersion: artifact.schemaVersion,
        logicalRole: artifact.logicalRole,
      })) {
      return fail("promotion.manifest.artifacts", "research.promotion.manifest_invalid");
    }
  }
  if (value.datasets.length !== 1
    || !same(value.datasets[0]?.version, manifest.value.core.dataset)
    || value.datasets[0]?.state !== "research_ready"
    || scientific.value.material.datasetVersionId
      !== manifest.value.core.dataset.datasetVersionId
    || scientific.value.material.datasetManifestHash
      !== manifest.value.core.dataset.manifestHash
    || scientific.value.material.datasetContentHash
      !== manifest.value.core.dataset.aggregateContentHash) {
    return fail("promotion.datasets", "research.promotion.manifest_invalid");
  }
  const report = value.validationReport;
  const decision = value.scientificDecision;
  const eligibility = value.promotionEligibility;
  const identity = scientific.value.material;
  if (report.result.completionStatus !== "completed") {
    return fail(
      "promotion.validationReport.result.completionStatus",
      "research.promotion.report_incomplete",
    );
  }
  const linked = report.experimentId === scientific.value.identity.experimentId
    && report.runId === execution.value.identity.executionId
    && same(report.scope, value.scope)
    && same(report.dataset, manifest.value.core.dataset)
    && report.candidateId === identity.candidateId
    && report.candidateVersion === identity.candidateVersion
    && report.hypothesisId === identity.hypothesisId
    && report.hypothesisVersion === identity.hypothesisVersion
    && decision.experimentId === report.experimentId
    && decision.runId === report.runId
    && same(decision.scope, value.scope)
    && same(decision.validationReport, report)
    && eligibility.experimentId === report.experimentId
    && eligibility.runId === report.runId
    && same(eligibility.scope, value.scope)
    && same(eligibility.validationDecision, decision)
    && value.candidate.id === identity.candidateId
    && value.candidate.version === identity.candidateVersion
    && value.strategy.id === identity.strategyContract.id
    && value.strategy.version === identity.strategyContract.version
    && same(value.portfolioConfiguration, identity.portfolioConfiguration)
    && same(value.costModel, identity.costModel)
    && same(value.benchmark, identity.benchmark);
  if (!linked) {
    return fail("promotion.references", "research.promotion.identity_mismatch");
  }
  if (report.blockers.length > 0 || decision.blockers.length > 0
    || decision.outcome !== "validated"
    || eligibility.state !== "promotion_eligible") {
    return fail("promotion.decision", "research.promotion.decision_not_eligible");
  }
  return { ok: true, value: structuredClone(value) };
}
