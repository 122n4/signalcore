import { classifyResearchFailure } from "./forensics";
import { rankResearchOpportunity } from "./ranking";
import type { ResearchDecision, ResearchGateEvaluation, ResearchRunComparison, ResearchRunDecision } from "./types";

function buildFailedGateReasons(gates: ResearchGateEvaluation): string[] {
  const reasons: string[] = [];
  const add = (failed: boolean, reason: string) => {
    if (failed) reasons.push(reason);
  };

  add(!gates.aggregateExpectancyStable, "aggregate expectancy degraded");
  add(!gates.aggregateProfitFactorStable, "aggregate profit factor degraded");
  add(!gates.aggregateDrawdownStable, "aggregate drawdown worsened");
  add(gates.aggregateTradeCadencePass === false, "aggregate trade cadence left the allowed range");
  add(!gates.crisisExpectancyStable, "crisis expectancy degraded");
  add(!gates.crisisProfitFactorStable, "crisis profit factor degraded");
  add(!gates.crisisDrawdownStable, "crisis drawdown worsened");
  add(!gates.walkForwardExpectancyStable, "walk-forward expectancy degraded");
  add(!gates.walkForwardProfitFactorStable, "walk-forward profit factor degraded");
  add(!gates.walkForwardDrawdownStable, "walk-forward drawdown worsened");
  add(!gates.walkForwardBreakEvenOrBetter, "walk-forward is not break-even");
  add(gates.holdoutBreakEvenOrBetter === false, "holdout is not break-even");
  add(gates.finalHoldoutBreakEvenOrBetter === false, "final holdout is not break-even");
  add(gates.perturbationBreakEvenOrBetter === false, "perturbation is not break-even");
  add(gates.monteCarloBreakEvenOrBetter === false, "monte carlo is not break-even");
  add(gates.costStressBreakEvenOrBetter === false, "cost stress is not break-even");

  return Array.from(new Set(reasons)).slice(0, 6);
}

function buildPromotionMissReasons(gates: ResearchGateEvaluation): string[] {
  const reasons: string[] = [];
  if (gates.aggregatePromotionThresholdMet === false) {
    reasons.push("aggregate improvement threshold not met");
  }
  if (gates.crisisPromotionThresholdMet === false) {
    reasons.push("crisis improvement threshold not met");
  }
  if (gates.drawdownPromotionThresholdMet === false) {
    reasons.push("drawdown improvement threshold not met");
  }
  if (gates.aggregateTradeCadencePass === false) {
    reasons.push("trade cadence outside configured range");
  }
  return reasons.slice(0, 6);
}

export function decideResearchRun(args: {
  runId: string;
  taskId: string;
  gates: ResearchGateEvaluation;
  hardFailureReason?: string | null;
  promotedMetrics?: Record<string, number | null>;
  comparison?: ResearchRunComparison | null;
}): ResearchRunDecision {
  let decision: ResearchDecision;
  let reason: string;

  if (args.hardFailureReason) {
    decision = "reject";
    reason = args.hardFailureReason;
  } else if (!args.gates.allHardGatesPass) {
    decision = "reject";
    const failedReasons = buildFailedGateReasons(args.gates);
    reason =
      failedReasons.length > 0
        ? `Hard validation gates failed: ${failedReasons.join("; ")}.`
        : "One or more hard validation gates failed.";
  } else if (args.gates.promotionThresholdMet) {
    decision = "promote";
    reason = "All hard validation gates passed and promotion thresholds were met.";
  } else {
    decision = "candidate";
    const missReasons = buildPromotionMissReasons(args.gates);
    reason =
      missReasons.length > 0
        ? `Hard validation gates passed but promotion is withheld: ${missReasons.join("; ")}.`
        : "Hard validation gates passed but promotion thresholds were not met.";
  }

  const failureForensics =
    decision === "reject"
      ? classifyResearchFailure({
          reason,
          error: args.hardFailureReason ?? null,
        })
      : null;
  const ranking = args.comparison ? rankResearchOpportunity(args.comparison) : null;

  return {
    run_id: args.runId,
    task_id: args.taskId,
    decision,
    reason,
    gates: args.gates,
    promoted_metrics: args.promotedMetrics ?? {},
    ranking,
    failure_forensics: failureForensics,
  };
}
