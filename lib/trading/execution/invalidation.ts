import type { ExecutionPlanningInput, InvalidationOutput } from "./types";

function clampPercentage(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function buildInvalidation(input: ExecutionPlanningInput): InvalidationOutput {
  const level = input.setupCore.setup.invalidationLevel ?? null;

  if (input.setupCore.setup.type === "none") {
    return {
      invalidationLevel: null,
      invalidationType: "hard",
      confidence: 18,
    };
  }

  if (
    input.setupCore.opportunityWindow.state === "degrading" ||
    input.decisionCore.decision.currentState === "TOO_LATE"
  ) {
    return {
      invalidationLevel: level,
      invalidationType: "time_based",
      confidence: clampPercentage(
        input.setupCore.maturity.confidence * 0.35 + input.setupCore.setup.confidence * 0.3,
      ),
    };
  }

  const invalidationType: InvalidationOutput["invalidationType"] =
    input.setupCore.setup.type === "breakout_continuation" ||
    input.setupCore.setup.type === "failed_breakout"
      ? "hard"
      : "structural";

  return {
    invalidationLevel: level,
    invalidationType,
    confidence: clampPercentage(
      input.setupCore.setup.confidence * 0.45 +
        input.setupCore.maturity.confidence * 0.2 +
        input.decisionCore.clarity.score * 0.2 +
        input.market.structure.confidence * 0.15,
    ),
  };
}
