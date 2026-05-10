import type { EngineContext, PriorityResult } from "./types";

export function selectPriorityClass(ctx: EngineContext): PriorityResult {
  if (!ctx?.setupComplete || !ctx?.plan?.hasPlan) {
    return { priorityClass: "SURVIVAL", reason: "Active plan/setup missing" };
  }

  if (!ctx?.portfolio?.hasHoldings) {
    return { priorityClass: "EXECUTION", reason: "Portfolio holdings not available yet" };
  }

  if ((ctx?.market?.dataQuality?.coveragePct ?? 0) < 50) {
    return { priorityClass: "RISK_CONTROL", reason: "Market data coverage too low for confident execution" };
  }

  if (ctx?.signals?.topRiskLeakSeverity === "high") {
    return { priorityClass: "RISK_CONTROL", reason: "High-severity risk leak detected" };
  }

  if (ctx?.dayState?.lastProofQuality != null && ctx.dayState.lastProofQuality < 50 && !ctx.dayState.doneToday) {
    return { priorityClass: "EXECUTION", reason: "Proof quality weak; prioritize disciplined execution" };
  }

  if (ctx?.dayState?.doneToday) {
    return { priorityClass: "OPTIMIZATION", reason: "Day already closed; review/optimization only" };
  }

  return { priorityClass: "GROWTH", reason: "Core setup healthy and execution window open" };
}
