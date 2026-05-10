import type { ExecutionPlanningInput, InvalidationOutput, TradePathOutput } from "./types";
import { formatZone, resolveRiskDistance, roundLevel } from "./utils";

function resolveBaseRiskReward(type: ExecutionPlanningInput["setupCore"]["setup"]["type"]): number | null {
  switch (type) {
    case "breakout_continuation":
      return 2.4;
    case "trend_pullback":
      return 2.2;
    case "liquidity_sweep_reversal":
      return 2;
    case "range_reclaim":
      return 1.8;
    case "failed_breakout":
      return 1.9;
    case "none":
      return null;
  }
}

function resolvePrimaryPath(type: ExecutionPlanningInput["setupCore"]["setup"]["type"]): string | null {
  switch (type) {
    case "breakout_continuation":
      return "Continuation path through fresh expansion.";
    case "trend_pullback":
      return "Trend resumption back into directional flow.";
    case "liquidity_sweep_reversal":
      return "Reversal path after reclaiming swept liquidity.";
    case "range_reclaim":
      return "Reclaim path back through the range interior.";
    case "failed_breakout":
      return "Failure path back through the broken level.";
    case "none":
      return null;
  }
}

function resolveSecondaryPath(type: ExecutionPlanningInput["setupCore"]["setup"]["type"]): string | null {
  switch (type) {
    case "breakout_continuation":
      return "Extension path toward a trend day continuation.";
    case "trend_pullback":
      return "Secondary extension if momentum re-accelerates.";
    case "liquidity_sweep_reversal":
      return "Secondary push if reversal squeezes trapped liquidity.";
    case "range_reclaim":
      return "Secondary test of the opposite side of the range.";
    case "failed_breakout":
      return "Secondary unwind if trapped participants fully exit.";
    case "none":
      return null;
  }
}

export function buildTradePath(
  input: ExecutionPlanningInput,
  invalidation: InvalidationOutput,
): TradePathOutput {
  const triggerLevel = input.setupCore.setup.triggerLevel ?? null;
  const riskDistance = resolveRiskDistance(triggerLevel, invalidation.invalidationLevel);
  const baseRiskReward = resolveBaseRiskReward(input.setupCore.setup.type);

  if (
    input.setupCore.setup.type === "none" ||
    typeof triggerLevel !== "number" ||
    riskDistance === null ||
    baseRiskReward === null
  ) {
    return {
      targetZone: null,
      primaryPath: null,
      secondaryPath: null,
      riskRewardEstimate: null,
    };
  }

  let riskRewardEstimate = baseRiskReward;

  if (input.setupCore.quality.grade === "A") {
    riskRewardEstimate += 0.2;
  } else if (input.setupCore.quality.grade === "D") {
    riskRewardEstimate -= 0.2;
  }

  const directionalTarget =
    input.setupCore.setup.direction === "long"
      ? triggerLevel + riskDistance * riskRewardEstimate
      : triggerLevel - riskDistance * riskRewardEstimate;
  const targetBuffer = riskDistance * 0.35;
  const targetZone =
    input.setupCore.setup.direction === "long"
      ? formatZone(directionalTarget - targetBuffer * 0.25, directionalTarget + targetBuffer * 0.75)
      : formatZone(directionalTarget - targetBuffer * 0.75, directionalTarget + targetBuffer * 0.25);

  return {
    targetZone,
    primaryPath: resolvePrimaryPath(input.setupCore.setup.type),
    secondaryPath: resolveSecondaryPath(input.setupCore.setup.type),
    riskRewardEstimate: roundLevel(riskRewardEstimate),
  };
}
