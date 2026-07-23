import {
  PRELIMINARY_PROPOSAL_CONTRACT_VERSION,
  type ConstructionCandidateV1,
  type ConstructionEngineInputV1,
  type PreliminaryInvestingProposalV1,
} from "@/lib/investing/engine/v1/phase3e/types";
import {
  buildConstructionCandidatesV1,
  rankConstructionCandidatesV1,
} from "@/lib/investing/engine/v1/phase3e/constructionEngine";
import {
  ZERO,
  canonicalStringify,
  freeze,
  sha256,
} from "@/lib/investing/engine/v1/phase3e/primitives";
import { assertConstructionEngineInputV1 } from "@/lib/investing/engine/v1/phase3e/validation";

function hashProposal(proposal: PreliminaryInvestingProposalV1 | Omit<PreliminaryInvestingProposalV1, "proposalHash">) {
  const copy: Record<string, unknown> = { ...proposal };
  delete copy.proposalHash;
  return sha256(copy);
}

export function assertPreliminaryInvestingProposalV1(proposal: PreliminaryInvestingProposalV1) {
  canonicalStringify(proposal);
  if (proposal.contractVersion !== PRELIMINARY_PROPOSAL_CONTRACT_VERSION) {
    throw new Error("investing_preliminary_proposal_contract_invalid");
  }
  if (proposal.executable !== false) throw new Error("investing_preliminary_proposal_executable_forbidden");
  if (hashProposal(proposal) !== proposal.proposalHash) throw new Error("investing_preliminary_proposal_hash_mismatch");
  if ((proposal.state === "blocked" || proposal.state === "insufficient_data") && proposal.selectedCandidateId !== null) {
    throw new Error("investing_preliminary_proposal_selected_when_unavailable");
  }
}

function terminalWithoutCandidate(
  sources: ConstructionEngineInputV1,
  state: "blocked" | "insufficient_data",
  reasonCodes: readonly string[],
  candidates: readonly ConstructionCandidateV1[] = [],
): PreliminaryInvestingProposalV1 {
  const draft: Omit<PreliminaryInvestingProposalV1, "proposalHash"> = {
    contractVersion: PRELIMINARY_PROPOSAL_CONTRACT_VERSION,
    inputHash: sources.canonicalInput.inputHash,
    envelopeHash: sources.envelope.envelopeHash,
    modelSnapshotHash: sources.model.snapshotHash,
    asOf: sources.canonicalInput.asOf,
    state,
    executable: false,
    selectedCandidateId: null,
    target: null,
    actions: [],
    candidates,
    residualCash: null,
    estimatedTurnover: null,
    reasonCodes: [...new Set(reasonCodes)].sort(),
    warnings: [...sources.canonicalInput.warnings, ...sources.portfolioState.issues],
    confidence: sources.risk.confidence,
    dataQuality: state === "insufficient_data" ? "insufficient" : "degraded",
  };
  const result = { ...draft, proposalHash: hashProposal(draft) } satisfies PreliminaryInvestingProposalV1;
  assertPreliminaryInvestingProposalV1(result);
  return freeze(result) as PreliminaryInvestingProposalV1;
}

function candidateTradeNeeded(candidate: ConstructionCandidateV1) {
  return candidate.actions.some((action) => action.side !== "hold" || action.reasonCodes.some((code) =>
    [
      "transaction_cost_data_unavailable",
      "liquidity_data_unavailable",
      "liquidity_data_stale",
      "liquidity_capacity_exceeded",
      "cash_insufficient",
      "cash_limited_partial_rebalance",
    ].includes(code),
  ));
}

export function constructPreliminaryInvestingProposalV1(
  sources: ConstructionEngineInputV1,
): PreliminaryInvestingProposalV1 {
  assertConstructionEngineInputV1(sources);
  if (sources.envelope.status === "blocked") {
    return terminalWithoutCandidate(sources, "blocked", ["feasible_envelope_blocked", ...sources.envelope.conditions]);
  }
  if (sources.envelope.status === "insufficient_data") {
    return terminalWithoutCandidate(sources, "insufficient_data", [
      "feasible_envelope_insufficient_data",
      ...sources.envelope.conditions,
    ]);
  }
  const ambiguousPending = sources.portfolioState.issues.some((entry) => [
    "order_state_reconciling_ambiguous",
    "order_state_unknown",
    "duplicate_semantic_order_conflict",
    "order_cumulative_fill_conflict",
  ].includes(entry.code));
  if (ambiguousPending) {
    return terminalWithoutCandidate(sources, "blocked", ["pending_order_ambiguity_blocked"]);
  }

  const construction = buildConstructionCandidatesV1(sources);
  if (construction.targetImpossible) {
    return terminalWithoutCandidate(sources, "blocked", ["target_construction_impossible", ...construction.targetReasonCodes], construction.candidates);
  }
  const tradeCandidates = construction.candidates.filter((candidate) => candidate.mode !== "hold" && candidateTradeNeeded(candidate));
  if (tradeCandidates.length > 0 && tradeCandidates.every((candidate) => candidate.state === "insufficient_data")) {
    return terminalWithoutCandidate(sources, "insufficient_data", [
      "trade_safety_data_insufficient",
      ...tradeCandidates.flatMap((candidate) => candidate.actions.flatMap((action) => action.reasonCodes)),
    ], construction.candidates);
  }
  if (tradeCandidates.length > 0 && tradeCandidates.every((candidate) => candidate.state === "blocked")) {
    return terminalWithoutCandidate(sources, "blocked", [
      "all_rebalance_candidates_blocked",
      ...tradeCandidates.flatMap((candidate) => candidate.actions.flatMap((action) => action.reasonCodes)),
    ], construction.candidates);
  }

  const ranked = rankConstructionCandidatesV1(construction.candidates);
  const selected = ranked.find((candidate) => candidate.state === "feasible" || candidate.state === "degraded") ?? null;
  if (!selected) {
    const hasUnknown = ranked.some((candidate) => candidate.state === "insufficient_data");
    return terminalWithoutCandidate(
      sources,
      hasUnknown ? "insufficient_data" : "blocked",
      [hasUnknown ? "no_candidate_with_sufficient_data" : "no_hard_compliant_candidate"],
      construction.candidates,
    );
  }
  const tradeActions = selected.actions.filter((action) => action.side !== "hold" && action.status === "trade");
  const state: PreliminaryInvestingProposalV1["state"] = tradeActions.length === 0
    ? "no_trade"
    : selected.state === "degraded" || sources.envelope.status === "degraded"
      ? "degraded"
      : "proposal_ready";
  const rejectedReasons = ranked
    .filter((candidate) => candidate.candidateId !== selected.candidateId)
    .flatMap((candidate) => [
      `candidate_rejected:${candidate.mode}:${candidate.state}`,
      ...candidate.evaluation.rankReasonCodes,
    ]);
  const actionReasons = selected.actions.flatMap((action) => action.reasonCodes);
  const draft: Omit<PreliminaryInvestingProposalV1, "proposalHash"> = {
    contractVersion: PRELIMINARY_PROPOSAL_CONTRACT_VERSION,
    inputHash: sources.canonicalInput.inputHash,
    envelopeHash: sources.envelope.envelopeHash,
    modelSnapshotHash: sources.model.snapshotHash,
    asOf: sources.canonicalInput.asOf,
    state,
    executable: false,
    selectedCandidateId: selected.candidateId,
    target: selected.target,
    actions: selected.actions,
    candidates: construction.candidates,
    residualCash: selected.target.residualCash,
    estimatedTurnover: selected.evaluation.turnover,
    reasonCodes: [...new Set([
      state === "no_trade" ? "no_trade_after_thresholds" : `selected_${selected.mode}`,
      ...selected.evaluation.rankReasonCodes,
      ...actionReasons,
      ...rejectedReasons,
    ])].sort(),
    warnings: [...sources.canonicalInput.warnings, ...sources.portfolioState.issues],
    confidence: sources.risk.confidence,
    dataQuality: state === "degraded" ? "degraded" : sources.risk.dataQuality,
  };
  const result = { ...draft, proposalHash: hashProposal(draft) } satisfies PreliminaryInvestingProposalV1;
  assertPreliminaryInvestingProposalV1(result);
  return freeze(result) as PreliminaryInvestingProposalV1;
}

export function createNoTradeConstructionResultForKnownZeroPortfolio(
  sources: ConstructionEngineInputV1,
) {
  if (sources.risk.totalPortfolioValue.value !== ZERO) return null;
  return constructPreliminaryInvestingProposalV1(sources);
}
