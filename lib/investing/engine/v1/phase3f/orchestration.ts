import {
  FINAL_DECISION_VERSION,
  type ConstructionCandidateV1,
  type InvestingEngineDecisionV1,
  type InvestingEngineFinalStateV1,
  type InvestingEnginePhase3FSourcesV1,
  type InvestingEnginePhaseSummaryV1,
  type InvestingEngineReasonV1,
} from "@/lib/investing/engine/v1/phase3f/types";
import { canonicalStringify, compare, freeze, sha256, ZERO } from "@/lib/investing/engine/v1/phase3f/primitives";
import { assertInvestingEnginePhase3FSourcesV1, targetRiskAfterV1 } from "@/lib/investing/engine/v1/phase3f/validation";
import { buildFinalActionsV1, buildFinalExplanationV1, createReasonV1 } from "@/lib/investing/engine/v1/phase3f/explanation";

const BLOCKING_3C_FRAGMENTS = ["ambiguous", "conflict", "ownership", "account", "negative", "oversell", "duplicate"];

function phase3cTerminal(sources: InvestingEnginePhase3FSourcesV1): "blocked" | "insufficient_data" | null {
  const errorIssues = [...sources.canonicalInput.quality.issues, ...sources.portfolioState.issues]
    .filter((issue) => issue.severity === "error");
  if (errorIssues.some((issue) => BLOCKING_3C_FRAGMENTS.some((fragment) => issue.code.includes(fragment)))) return "blocked";
  if (errorIssues.length > 0 || sources.canonicalInput.quality.status === "insufficient") return "insufficient_data";
  return null;
}

function hasMaterialAction(sources: InvestingEnginePhase3FSourcesV1) {
  return sources.preliminaryProposal.actions.some((action) =>
    action.side !== "hold" && action.status === "trade" && compare(action.quantityDelta, ZERO) !== 0,
  );
}

function finalState(sources: InvestingEnginePhase3FSourcesV1): InvestingEngineFinalStateV1 {
  const phase3c = phase3cTerminal(sources);
  if (phase3c) return phase3c;
  if (sources.envelope.status === "blocked") return "blocked";
  if (sources.envelope.status === "insufficient_data") return "insufficient_data";
  if (sources.preliminaryProposal.state === "blocked") return "blocked";
  if (sources.preliminaryProposal.state === "insufficient_data") return "insufficient_data";
  if (!hasMaterialAction(sources)) return "no_trade";
  if (
    sources.preliminaryProposal.state === "degraded"
    || sources.envelope.status === "degraded"
    || sources.canonicalInput.quality.status === "degraded"
    || sources.portfolioState.issues.some((issue) => issue.severity === "warning")
  ) return "degraded";
  return "proposal_ready";
}

function reasonSeverity(state: InvestingEngineFinalStateV1): InvestingEngineReasonV1["severity"] {
  return state === "blocked" || state === "insufficient_data" ? "error" : state === "degraded" ? "warning" : "info";
}

function addReason(
  reasons: Map<string, InvestingEngineReasonV1>,
  code: string,
  phase: InvestingEngineReasonV1["phaseSource"],
  severity: InvestingEngineReasonV1["severity"],
  consequence: InvestingEngineReasonV1["consequence"],
) {
  if (!reasons.has(code)) reasons.set(code, createReasonV1(code, phase, severity, consequence));
}

function buildReasons(sources: InvestingEnginePhase3FSourcesV1, state: InvestingEngineFinalStateV1) {
  const reasons = new Map<string, InvestingEngineReasonV1>();
  for (const issue of [...sources.canonicalInput.quality.issues, ...sources.portfolioState.issues]) {
    addReason(
      reasons,
      issue.code,
      "phase3c",
      issue.severity,
      issue.severity === "error" ? (phase3cTerminal(sources) === "blocked" ? "block" : "insufficient_data") : "inform",
    );
  }
  for (const condition of sources.envelope.conditions) {
    addReason(
      reasons,
      condition,
      "phase3d",
      sources.envelope.status === "blocked" || sources.envelope.status === "insufficient_data" ? "error" : "warning",
      sources.envelope.status === "blocked" ? "block" : sources.envelope.status === "insufficient_data" ? "insufficient_data" : "degrade",
    );
  }
  for (const code of sources.preliminaryProposal.reasonCodes) {
    addReason(
      reasons,
      code,
      "phase3e",
      sources.preliminaryProposal.state === "blocked" || sources.preliminaryProposal.state === "insufficient_data" ? "error" : "info",
      sources.preliminaryProposal.state === "blocked" ? "block" : sources.preliminaryProposal.state === "insufficient_data" ? "insufficient_data" : "inform",
    );
  }
  const phase3c = phase3cTerminal(sources);
  if (phase3c) addReason(reasons, `phase3c_${phase3c}`, "phase3f", "error", phase3c === "blocked" ? "block" : "insufficient_data");
  if (sources.envelope.status === "blocked") addReason(reasons, "phase3d_blocked", "phase3f", "error", "block");
  if (sources.envelope.status === "insufficient_data") addReason(reasons, "phase3d_insufficient_data", "phase3f", "error", "insufficient_data");
  if (sources.preliminaryProposal.state === "blocked") addReason(reasons, "phase3e_blocked", "phase3f", "error", "block");
  if (sources.preliminaryProposal.state === "insufficient_data") addReason(reasons, "phase3e_insufficient_data", "phase3f", "error", "insufficient_data");
  addReason(reasons, `final_${state}`, "phase3f", reasonSeverity(state), state === "blocked" ? "block" : state === "insufficient_data" ? "insufficient_data" : state === "degraded" ? "degrade" : "select");
  if (sources.preliminaryProposal.selectedCandidateId !== null && state !== "blocked" && state !== "insufficient_data") {
    addReason(reasons, "selected_candidate_confirmed", "phase3f", "info", "select");
  }
  for (const candidate of sources.preliminaryProposal.candidates) {
    if (candidate.candidateId === sources.preliminaryProposal.selectedCandidateId) continue;
    const code = candidate.evaluation.hardConstraintCompliance === "fail"
      ? "rejected_candidate_hard_constraint"
      : candidate.evaluation.liquidityStatus === "fail" || candidate.evaluation.liquidityStatus === "unknown"
        ? "rejected_candidate_liquidity"
        : candidate.evaluation.costStatus === "fail" || candidate.evaluation.costStatus === "unknown"
          ? "rejected_candidate_cost"
          : candidate.evaluation.rankReasonCodes.includes("taxable_gain_prefer_lower_turnover")
            ? "rejected_candidate_tax_turnover"
            : "rejected_candidate_lower_target_fit";
    addReason(reasons, code, "phase3f", "info", "inform");
  }
  addReason(reasons, "audit_bundle_created", "phase3f", "info", "inform");
  addReason(reasons, "shadow_package_created", "phase3f", "info", "inform");
  addReason(reasons, "awaiting_legacy_result", "phase3f", "info", "inform");
  addReason(reasons, "executable_false_asserted", "phase3f", "info", "inform");
  return [...reasons.values()].sort((left, right) => left.code.localeCompare(right.code));
}

function selectedCandidate(sources: InvestingEnginePhase3FSourcesV1, state: InvestingEngineFinalStateV1): ConstructionCandidateV1 | null {
  if (state === "blocked" || state === "insufficient_data" || sources.preliminaryProposal.selectedCandidateId === null) return null;
  return sources.preliminaryProposal.candidates.find(
    (candidate) => candidate.candidateId === sources.preliminaryProposal.selectedCandidateId,
  ) ?? null;
}

export function buildPhaseSummariesV1(args: {
  sources: InvestingEnginePhase3FSourcesV1;
  finalState: InvestingEngineFinalStateV1;
  finalOutputHash: string;
  reasonCodes: readonly string[];
}): readonly InvestingEnginePhaseSummaryV1[] {
  const phase3c = phase3cTerminal(args.sources);
  return [
    {
      phase: "phase3c",
      state: phase3c ?? "ready",
      quality: phase3c === "insufficient_data" ? "insufficient" : args.sources.canonicalInput.quality.status,
      inputHash: args.sources.canonicalInput.inputHash,
      outputHash: args.sources.request.sourceHashes.portfolioStateDerivationHash,
      reasonCodes: [...args.sources.portfolioState.issues.map((issue) => issue.code)].sort(),
    },
    {
      phase: "phase3d",
      state: args.sources.envelope.status,
      quality: args.sources.risk.dataQuality,
      inputHash: args.sources.canonicalInput.inputHash,
      outputHash: args.sources.envelope.envelopeHash,
      reasonCodes: [...args.sources.envelope.conditions].sort(),
    },
    {
      phase: "phase3e",
      state: args.sources.preliminaryProposal.state,
      quality: args.sources.preliminaryProposal.dataQuality,
      inputHash: args.sources.envelope.envelopeHash,
      outputHash: args.sources.preliminaryProposal.proposalHash,
      reasonCodes: args.sources.preliminaryProposal.reasonCodes,
    },
    {
      phase: "phase3f",
      state: args.finalState,
      quality: args.finalState === "insufficient_data" ? "insufficient" : args.finalState === "blocked" || args.finalState === "degraded" ? "degraded" : "good",
      inputHash: args.sources.preliminaryProposal.proposalHash,
      outputHash: args.finalOutputHash,
      reasonCodes: args.reasonCodes,
    },
  ];
}

export function buildInvestingEngineDecisionV1(sources: InvestingEnginePhase3FSourcesV1): InvestingEngineDecisionV1 {
  assertInvestingEnginePhase3FSourcesV1(sources);
  const state = finalState(sources);
  const selected = selectedCandidate(sources, state);
  const exposeProposal = state !== "blocked" && state !== "insufficient_data";
  const riskBefore = sources.risk.concentrationRiskScore.value;
  const riskAfter = exposeProposal ? targetRiskAfterV1(sources.preliminaryProposal.target) : null;
  const actions = exposeProposal ? buildFinalActionsV1({ sources, riskBefore, riskAfter }) : [];
  const reasons = buildReasons(sources, state);
  const reasonCodes = reasons.map((reason) => reason.code);
  const explanation = buildFinalExplanationV1({ sources, state, actions, riskAfter, reasons });
  const warnings = [...sources.canonicalInput.warnings, ...sources.portfolioState.issues]
    .sort((left, right) => canonicalStringify(left).localeCompare(canonicalStringify(right)));
  const blockers = reasons
    .filter((reason) => reason.consequence === "block" || reason.consequence === "insufficient_data")
    .map((reason) => reason.code)
    .sort();
  const quality = state === "insufficient_data"
    ? "insufficient"
    : state === "blocked" || state === "degraded" ? "degraded" : sources.preliminaryProposal.dataQuality;
  const hardConstraints = sources.constraints
    .filter((constraint) => constraint.severity === "hard")
    .sort((left, right) => canonicalStringify(left).localeCompare(canonicalStringify(right)));
  const softConstraints = sources.constraints
    .filter((constraint) => constraint.severity === "soft")
    .sort((left, right) => canonicalStringify(left).localeCompare(canonicalStringify(right)));
  const draft: Omit<InvestingEngineDecisionV1, "finalDecisionHash"> = {
    contractVersion: FINAL_DECISION_VERSION,
    state,
    quality,
    confidence: sources.preliminaryProposal.confidence,
    executable: false,
    selectedCandidateId: selected?.candidateId ?? null,
    selectedCandidateMode: selected?.mode ?? null,
    proposal: exposeProposal ? sources.preliminaryProposal : null,
    targetPortfolio: exposeProposal ? sources.preliminaryProposal.target : null,
    actions,
    residualCash: exposeProposal ? sources.preliminaryProposal.residualCash : null,
    turnover: exposeProposal ? sources.preliminaryProposal.estimatedTurnover : null,
    riskBefore,
    projectedRiskAfter: riskAfter,
    hardConstraints,
    softConstraints,
    costs: actions.map((action) => ({ symbol: action.symbol, estimate: action.estimatedCosts })),
    liquidity: actions.map((action) => ({ symbol: action.symbol, assessment: action.liquidity })),
    taxAwareness: actions.map((action) => ({ symbol: action.symbol, assessment: action.taxAwareness })),
    warnings,
    blockers,
    reasonCodes,
    reasons,
    explanation,
  };
  const result = { ...draft, finalDecisionHash: sha256(draft) } satisfies InvestingEngineDecisionV1;
  return freeze(result) as InvestingEngineDecisionV1;
}
