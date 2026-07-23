import type { CanonicalDecimal } from "@/lib/investing/engine/v1/canonical";
import {
  FINAL_AUDIT_BUNDLE_VERSION,
  FINAL_DECISION_VERSION,
  FINAL_RESULT_VERSION,
  FINAL_RUN_CONTEXT_VERSION,
  FINAL_RUN_REQUEST_VERSION,
  FINAL_SHADOW_PACKAGE_VERSION,
  type InvestingEnginePhase3FSourcesV1,
  type InvestingEngineResultV1Final,
} from "@/lib/investing/engine/v1/phase3f/types";
import {
  ONE,
  canonicalStringify,
  compare,
  decimal,
  hashSetSemanticSnapshot,
  hashWithout,
  multiply,
  normalizeTimestamp,
  sha256,
  subtract,
  sum,
} from "@/lib/investing/engine/v1/phase3f/primitives";

const SHA_PATTERN = /^[a-f0-9]{64}$/;

function assertHash(value: unknown, field: string, code: string) {
  const hash = (value as Record<string, unknown>)[field];
  if (typeof hash !== "string" || !SHA_PATTERN.test(hash) || hashWithout(value, field) !== hash) {
    throw new Error(code);
  }
}

function assertEqual(left: unknown, right: unknown, code: string) {
  if (canonicalStringify(left) !== canonicalStringify(right)) throw new Error(code);
}

export function hashPortfolioStateDerivationV1(value: InvestingEnginePhase3FSourcesV1["portfolioState"]) {
  return hashSetSemanticSnapshot(value);
}

export function hashConstraintEvaluationSetV1(value: InvestingEnginePhase3FSourcesV1["constraints"]) {
  return hashSetSemanticSnapshot(value);
}

export function assertInvestingEnginePhase3FSourcesV1(sources: InvestingEnginePhase3FSourcesV1) {
  canonicalStringify(sources);
  if (sources.request.contractVersion !== FINAL_RUN_REQUEST_VERSION) throw new Error("final_request_invalid");
  if (sources.context.contractVersion !== FINAL_RUN_CONTEXT_VERSION) throw new Error("final_context_invalid");
  assertHash(sources.request, "requestHash", "final_request_invalid");
  assertHash(sources.context, "contextHash", "final_context_invalid");
  assertHash(sources.canonicalInput, "inputHash", "cross_phase_hash_mismatch");
  assertHash(sources.risk, "assessmentHash", "cross_phase_hash_mismatch");
  assertHash(sources.policy, "policyHash", "cross_phase_hash_mismatch");
  assertHash(sources.envelope, "envelopeHash", "cross_phase_hash_mismatch");
  assertHash(sources.constructionModel, "snapshotHash", "cross_phase_hash_mismatch");
  assertHash(sources.preliminaryProposal, "proposalHash", "cross_phase_hash_mismatch");

  if (
    sources.context.accountMode !== "paper"
    || sources.canonicalInput.environment !== "paper"
    || sources.envelope.authorization.environment !== "paper"
  ) {
    throw new Error("final_live_or_non_paper_forbidden");
  }
  if (
    sources.request.requestedUserId !== sources.context.expectedUserId
    || sources.context.ownerId !== sources.context.expectedUserId
    || sources.canonicalInput.userId !== sources.context.ownerId
    || sources.envelope.authorization.expectedUserId !== sources.context.ownerId
  ) {
    throw new Error("cross_phase_identity_mismatch");
  }
  if (
    sources.request.accountId !== sources.context.expectedAccountId
    || sources.canonicalInput.accountId !== sources.context.expectedAccountId
    || sources.envelope.authorization.expectedAccountId !== sources.context.expectedAccountId
  ) {
    throw new Error("cross_phase_account_mismatch");
  }
  if (sources.request.runId !== sources.canonicalInput.runId) throw new Error("cross_run_snapshot_mismatch");
  if (sources.request.inputSnapshotId !== sources.canonicalInput.inputSnapshotId) {
    throw new Error("cross_phase_input_snapshot_mismatch");
  }
  if (
    sources.request.marketSnapshotId !== sources.canonicalInput.market.marketSnapshotId
    || sources.canonicalInput.market.asOf !== sources.canonicalInput.asOf
  ) {
    throw new Error("cross_phase_market_snapshot_mismatch");
  }
  if (sources.request.mandateSnapshotId !== sources.canonicalInput.mandate.mandateSnapshotId) {
    throw new Error("cross_phase_mandate_snapshot_mismatch");
  }
  const expectedAsOf = normalizeTimestamp(sources.request.asOf);
  if (
    expectedAsOf !== sources.request.asOf
    || sources.canonicalInput.asOf !== expectedAsOf
    || sources.risk.asOf !== expectedAsOf
    || sources.policy.asOf !== expectedAsOf
    || sources.envelope.asOf !== expectedAsOf
    || sources.constructionModel.asOf !== expectedAsOf
    || sources.preliminaryProposal.asOf !== expectedAsOf
  ) {
    throw new Error("cross_phase_asof_mismatch");
  }
  if (
    canonicalStringify(sources.request.versions) !== canonicalStringify(sources.canonicalInput.versions)
    || sources.policy.policyVersion !== sources.request.versions.policyVersion
    || sources.constructionModel.version !== sources.request.versions.modelVersion
    || sources.canonicalInput.instrumentCatalog.version !== sources.request.versions.instrumentCatalogVersion
    || sources.canonicalInput.market.schemaVersion !== sources.request.versions.marketDataSchemaVersion
  ) {
    throw new Error("cross_phase_version_mismatch");
  }

  const calculatedPortfolioHash = hashPortfolioStateDerivationV1(sources.portfolioState);
  const calculatedConstraintHash = hashConstraintEvaluationSetV1(sources.constraints);
  const expectedHashes = sources.request.sourceHashes;
  if (
    expectedHashes.canonicalInputHash !== sources.canonicalInput.inputHash
    || expectedHashes.portfolioStateDerivationHash !== calculatedPortfolioHash
    || expectedHashes.riskAssessmentHash !== sources.risk.assessmentHash
    || expectedHashes.policyEvaluationHash !== sources.policy.policyHash
    || expectedHashes.constraintEvaluationHash !== calculatedConstraintHash
    || expectedHashes.feasibleDecisionEnvelopeHash !== sources.envelope.envelopeHash
    || expectedHashes.constructionModelHash !== sources.constructionModel.snapshotHash
    || expectedHashes.preliminaryProposalHash !== sources.preliminaryProposal.proposalHash
  ) {
    throw new Error("cross_phase_hash_mismatch");
  }
  if (
    sources.risk.inputHash !== sources.canonicalInput.inputHash
    || sources.policy.inputHash !== sources.canonicalInput.inputHash
    || sources.envelope.inputHash !== sources.canonicalInput.inputHash
    || sources.preliminaryProposal.inputHash !== sources.canonicalInput.inputHash
    || sources.envelope.risk.assessmentHash !== sources.risk.assessmentHash
    || sources.envelope.policy.policyHash !== sources.policy.policyHash
    || sources.preliminaryProposal.envelopeHash !== sources.envelope.envelopeHash
    || sources.preliminaryProposal.modelSnapshotHash !== sources.constructionModel.snapshotHash
  ) {
    throw new Error("cross_phase_hash_mismatch");
  }
  assertEqual(sources.portfolioState.actual.canonical, sources.canonicalInput.actual, "cross_phase_actual_mismatch");
  assertEqual(sources.portfolioState.projected.canonical, sources.canonicalInput.projected, "cross_phase_projected_mismatch");
  if (hashConstraintEvaluationSetV1(sources.constraints) !== hashConstraintEvaluationSetV1(sources.envelope.constraints)) {
    throw new Error("cross_phase_constraint_mismatch");
  }
  assertEqual(sources.risk, sources.envelope.risk, "cross_phase_risk_mismatch");
  assertEqual(sources.policy, sources.envelope.policy, "cross_phase_policy_mismatch");

  const proposal = sources.preliminaryProposal;
  if (proposal.executable !== false) throw new Error("final_proposal_executable_forbidden");
  if (proposal.selectedCandidateId === null) {
    if (proposal.target !== null || proposal.actions.length > 0) throw new Error("selected_candidate_integrity_failed");
  } else {
    const selected = proposal.candidates.find((candidate) => candidate.candidateId === proposal.selectedCandidateId);
    if (!selected) throw new Error("selected_candidate_integrity_failed");
    assertHash(selected, "candidateHash", "selected_candidate_integrity_failed");
    assertHash(selected.target, "targetHash", "selected_candidate_integrity_failed");
    assertEqual(proposal.target, selected.target, "selected_candidate_integrity_failed");
    assertEqual(proposal.actions, selected.actions, "selected_candidate_integrity_failed");
    if (proposal.residualCash !== selected.target.residualCash) throw new Error("selected_candidate_integrity_failed");
    for (const action of proposal.actions) {
      const targetPosition = proposal.target?.positions.find((position) => position.symbol === action.symbol);
      if ((targetPosition?.targetQuantity ?? "0") !== action.targetQuantity) {
        throw new Error("final_target_action_mismatch");
      }
    }
    const totalValue = sources.risk.totalPortfolioValue.value;
    if (totalValue !== null) {
      const targetValue = sum(selected.target.positions.map((position) => position.targetValue));
      if (compare(sum([targetValue, selected.target.residualCash]), totalValue) !== 0) {
        throw new Error("final_residual_cash_mismatch");
      }
    }
    const weightTotal = sum([selected.target.totalExposure, selected.target.cashWeight]);
    const weightDifference = compare(weightTotal, ONE) > 0
      ? subtract(weightTotal, ONE)
      : subtract(ONE, weightTotal);
    if (compare(weightDifference, decimal("0.00000000000000001")) > 0) {
      throw new Error("final_target_weight_mismatch");
    }
  }
}

export function targetRiskAfterV1(target: InvestingEnginePhase3FSourcesV1["preliminaryProposal"]["target"]): CanonicalDecimal | null {
  if (!target) return null;
  return sum(target.positions.map((position) => multiply(position.targetWeight, position.targetWeight)));
}

export function assertInvestingEngineResultV1Final(result: InvestingEngineResultV1Final) {
  canonicalStringify(result);
  if (result.contractVersion !== FINAL_RESULT_VERSION || result.executable !== false) {
    throw new Error("final_result_integrity_failed");
  }
  if (result.decision.contractVersion !== FINAL_DECISION_VERSION || result.decision.executable !== false) {
    throw new Error("final_result_integrity_failed");
  }
  if (result.auditBundle.contractVersion !== FINAL_AUDIT_BUNDLE_VERSION || result.auditBundle.executable !== false) {
    throw new Error("final_result_integrity_failed");
  }
  if (result.shadowPackage.contractVersion !== FINAL_SHADOW_PACKAGE_VERSION || result.shadowPackage.status !== "awaiting_legacy_result") {
    throw new Error("final_result_integrity_failed");
  }
  assertHash(result.decision, "finalDecisionHash", "final_result_integrity_failed");
  assertHash(result.explanation, "explanationHash", "final_result_integrity_failed");
  assertHash(result.auditBundle, "auditBundleHash", "final_result_integrity_failed");
  assertHash(result.shadowPackage, "shadowPackageHash", "final_result_integrity_failed");
  assertHash(result, "finalResultHash", "final_result_integrity_failed");
  if (
    result.hashes.finalDecisionHash !== result.decision.finalDecisionHash
    || result.hashes.auditBundleHash !== result.auditBundle.auditBundleHash
    || result.hashes.shadowPackageHash !== result.shadowPackage.shadowPackageHash
    || result.state !== result.decision.state
    || canonicalStringify(result.actions) !== canonicalStringify(result.decision.actions)
    || canonicalStringify(result.targetPortfolio) !== canonicalStringify(result.decision.targetPortfolio)
    || result.selectedCandidateId !== result.decision.selectedCandidateId
    || result.residualCash !== result.decision.residualCash
  ) {
    throw new Error("final_result_integrity_failed");
  }
  const reasonEvidence = new Set(result.decision.reasons.map((reason) => reason.code));
  if (result.reasonCodes.some((code) => !reasonEvidence.has(code))) throw new Error("final_reason_origin_missing");
  for (const reason of result.decision.reasons) {
    if (hashWithout(reason, "evidenceHash") !== reason.evidenceHash) throw new Error("final_reason_origin_missing");
  }
  for (const action of result.actions) assertHash(action, "actionHash", "final_result_integrity_failed");
  for (const node of result.explanation.nodes) {
    if (!SHA_PATTERN.test(node.evidenceHash) || hashWithout(node, "evidenceHash") !== node.evidenceHash) {
      throw new Error("final_explanation_evidence_invalid");
    }
  }
  if (sha256(result.explanation.nodes) === "") throw new Error("final_explanation_evidence_invalid");
}
