import {
  FINAL_ACTION_VERSION,
  FINAL_EXPLANATION_TEMPLATE_VERSION,
  FINAL_EXPLANATION_VERSION,
  type InvestingEngineActionDecisionV1,
  type InvestingEngineExplanationNodeV1,
  type InvestingEngineExplanationV1,
  type InvestingEngineFinalStateV1,
  type InvestingEnginePhase3FSourcesV1,
  type InvestingEngineReasonV1,
} from "@/lib/investing/engine/v1/phase3f/types";
import { ZERO, freeze, sha256 } from "@/lib/investing/engine/v1/phase3f/primitives";

type NodeDraft = Omit<InvestingEngineExplanationNodeV1, "evidenceHash">;

function sealNode(draft: NodeDraft): InvestingEngineExplanationNodeV1 {
  return { ...draft, evidenceHash: sha256(draft) };
}

export function createReasonV1(
  code: string,
  phaseSource: InvestingEngineReasonV1["phaseSource"],
  severity: InvestingEngineReasonV1["severity"],
  consequence: InvestingEngineReasonV1["consequence"],
): InvestingEngineReasonV1 {
  const evidence = { code, phaseSource, severity, consequence };
  return { ...evidence, evidenceHash: sha256(evidence) };
}

export function buildFinalActionsV1(args: {
  sources: InvestingEnginePhase3FSourcesV1;
  riskBefore: InvestingEngineActionDecisionV1["riskBefore"];
  riskAfter: InvestingEngineActionDecisionV1["estimatedRiskAfter"];
}) {
  const reserved = new Map(args.sources.portfolioState.reserved.positions.map((entry) => [entry.symbol, entry.effective]));
  return args.sources.preliminaryProposal.actions.map((action) => {
    const warnings = [
      ...(action.dataQuality !== "good" ? [`action_quality_${action.dataQuality}`] : []),
      ...(action.taxAwareness.status === "unknown_basis" ? ["tax_basis_unknown"] : []),
    ].sort();
    const blockers = action.status === "blocked"
      ? action.reasonCodes
      : action.status === "insufficient_data" ? action.reasonCodes : [];
    const draft: Omit<InvestingEngineActionDecisionV1, "actionHash"> = {
      contractVersion: FINAL_ACTION_VERSION,
      symbol: action.symbol,
      side: action.side,
      currentQuantity: action.currentQuantity,
      reservedQuantity: reserved.get(action.symbol) ?? ZERO,
      projectedQuantity: action.projectedQuantity,
      targetQuantity: action.targetQuantity,
      quantityDelta: action.quantityDelta,
      currentWeight: action.currentWeight,
      projectedWeight: action.projectedWeight,
      targetWeight: action.targetWeight,
      weightDrift: action.weightDrift,
      estimatedPrice: action.estimatedPrice,
      estimatedNotional: action.estimatedNotional,
      estimatedCosts: action.cost,
      liquidity: action.liquidity,
      taxAwareness: action.taxAwareness,
      riskBefore: args.riskBefore,
      estimatedRiskAfter: args.riskAfter,
      constraints: action.constraintsApplied,
      warnings,
      blockers: [...new Set(blockers)].sort(),
      reasonCodes: action.reasonCodes,
      explanation: [
        `Current quantity ${action.currentQuantity}; reserved quantity ${reserved.get(action.symbol) ?? "0"}; projected quantity ${action.projectedQuantity}.`,
        `Target quantity ${action.targetQuantity}; quantity delta ${action.quantityDelta}; weight drift ${action.weightDrift}.`,
        `Decision ${action.side}/${action.status}; estimated notional ${action.estimatedNotional}; cost status ${action.cost.status}.`,
        `Liquidity ${action.liquidity.status}/${action.liquidity.marketability}; tax awareness ${action.taxAwareness.status}.`,
        `Risk before ${args.riskBefore ?? "unknown"}; estimated target risk after ${args.riskAfter ?? "unknown"}.`,
        `Applied constraints ${action.constraintsApplied.length > 0 ? action.constraintsApplied.join(", ") : "none"}.`,
        `Rejected alternative ${action.rejectedAlternative ?? "none"}.`,
        ...action.explanation,
      ],
      rejectedAlternative: action.rejectedAlternative,
      confidence: action.confidence,
      quality: action.dataQuality,
      executable: false,
    };
    return { ...draft, actionHash: sha256(draft) } satisfies InvestingEngineActionDecisionV1;
  });
}

export function buildFinalExplanationV1(args: {
  sources: InvestingEnginePhase3FSourcesV1;
  state: InvestingEngineFinalStateV1;
  actions: readonly InvestingEngineActionDecisionV1[];
  riskAfter: InvestingEngineActionDecisionV1["estimatedRiskAfter"];
  reasons: readonly InvestingEngineReasonV1[];
}): InvestingEngineExplanationV1 {
  const nodeStatus = (value: string): InvestingEngineExplanationNodeV1["status"] => {
    if (value === "blocked") return "blocked";
    if (value === "insufficient" || value === "insufficient_data") return "insufficient_data";
    if (value === "degraded") return "degraded";
    if (value === "selected" || value === "proposal_ready" || value === "no_trade") return "selected";
    return "pass";
  };
  const terminal = args.state === "blocked" || args.state === "insufficient_data";
  const selected = terminal ? null : args.sources.preliminaryProposal.candidates.find(
    (candidate) => candidate.candidateId === args.sources.preliminaryProposal.selectedCandidateId,
  ) ?? null;
  const visibleTarget = terminal ? null : args.sources.preliminaryProposal.target;
  const orderIds = args.sources.portfolioState.reserved.orders
    .filter((order) => order.entersProjected)
    .map((order) => order.orderId)
    .sort();
  const symbols = args.actions.map((action) => action.symbol).sort();
  const constraintCodes = args.sources.constraints.map((constraint) => constraint.code).sort();
  const stages = [
    ["canonical_input", "phase3c", args.sources.canonicalInput.quality.status, args.sources.canonicalInput.inputHash, "Canonical input hash and identity validated."],
    ["portfolio_state", "phase3c", args.sources.portfolioState.issues.some((issue) => issue.severity === "error") ? "insufficient_data" : "pass", args.sources.request.sourceHashes.portfolioStateDerivationHash, "ACTUAL, RESERVED and PROJECTED are bound to the run request."],
    ["data_quality", "phase3c", args.sources.canonicalInput.quality.status === "good" ? "pass" : "degraded", args.sources.canonicalInput.quality.status, `Canonical data quality is ${args.sources.canonicalInput.quality.status}.`],
    ["risk_assessment", "phase3d", args.sources.risk.status === "complete" ? "pass" : args.sources.risk.status, args.sources.risk.assessmentHash, `Risk before is ${args.sources.risk.concentrationRiskScore.value ?? "unknown"}.`],
    ["policy_evaluation", "phase3d", args.sources.policy.status === "resolved" ? "pass" : "blocked", args.sources.policy.policyHash, `Mandate policy status is ${args.sources.policy.status}.`],
    ["constraints", "phase3d", args.sources.envelope.status === "blocked" ? "blocked" : args.sources.envelope.status === "insufficient_data" ? "insufficient_data" : "pass", args.sources.request.sourceHashes.constraintEvaluationHash, `${constraintCodes.length} constraint evaluations are preserved.`],
    ["feasible_envelope", "phase3d", args.sources.envelope.status === "allowed" ? "pass" : args.sources.envelope.status, args.sources.envelope.envelopeHash, `Feasible envelope status is ${args.sources.envelope.status}.`],
    ["target_construction", "phase3e", visibleTarget ? "pass" : args.state, visibleTarget?.targetHash ?? null, `Target ${visibleTarget?.targetId ?? "not exposed because final precedence did not authorize it"}.`],
    ["rebalance_candidates", "phase3e", terminal ? args.state : "pass", args.sources.preliminaryProposal.proposalHash, terminal ? "Candidate evidence is retained for audit but no candidate is selectable after the prior terminal state." : `${args.sources.preliminaryProposal.candidates.length} deterministic candidates were evaluated.`],
    ["cost_evaluation", "phase3e", args.actions.some((action) => action.estimatedCosts.status === "unavailable") ? "insufficient_data" : "pass", null, "Transaction-cost components are preserved per action."],
    ["liquidity_evaluation", "phase3e", args.actions.some((action) => action.liquidity.status === "insufficient") ? "blocked" : args.actions.some((action) => ["stale", "unavailable"].includes(action.liquidity.status)) ? "insufficient_data" : "pass", null, "Liquidity capacity and marketability are preserved per action."],
    ["tax_awareness", "phase3e", args.actions.some((action) => action.taxAwareness.status === "unknown_basis") ? "degraded" : "pass", null, "Tax awareness affects explanation and deterministic ranking only."],
    ["candidate_ranking", "phase3e", selected ? "selected" : args.state, selected?.candidateHash ?? null, `Selected candidate ${selected?.candidateId ?? "none"}; rejected candidates remain auditable.`],
    ["selected_decision", "phase3f", selected ? "selected" : args.state, selected?.candidateHash ?? null, `The final decision preserves the selected preliminary proposal without execution.`],
    ["final_state", "phase3f", args.state, args.sources.preliminaryProposal.proposalHash, `Final state is ${args.state}; ${args.reasons.length} reason codes have evidence; executable is false.`],
  ] as const;

  const nodes = stages.map((stage, index) => sealNode({
    nodeId: `explanation:${String(index + 1).padStart(2, "0")}:${stage[0]}`,
    stableCode: stage[0],
    phaseSource: stage[1],
    category: stage[0],
    severity: stage[2] === "blocked" || stage[2] === "insufficient_data" ? "error" : stage[2] === "degraded" ? "warning" : "info",
    status: nodeStatus(stage[2]),
    observedValue: stage[3],
    expectedValue: stage[0] === "final_state" ? args.state : null,
    source: `${stage[1]}:${stage[0]}`,
    consequence: stage[0] === "final_state" ? args.state : "preserved_in_sequence",
    relatedSymbols: symbols,
    relatedOrders: orderIds,
    relatedConstraints: constraintCodes,
    childNodeIds: index + 1 < stages.length ? [`explanation:${String(index + 2).padStart(2, "0")}:${stages[index + 1][0]}`] : [],
    deterministicText: stage[4],
  }));
  const explanationDraft = {
    contractVersion: FINAL_EXPLANATION_VERSION,
    templateVersion: FINAL_EXPLANATION_TEMPLATE_VERSION,
    rootNodeId: nodes[0].nodeId,
    nodes,
  };
  const result = { ...explanationDraft, explanationHash: sha256(explanationDraft) } satisfies InvestingEngineExplanationV1;
  return freeze(result) as InvestingEngineExplanationV1;
}
