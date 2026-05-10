import type { DecisionEngineInput } from "./types";

export function clampPercentage(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

export function countDirections(
  input: DecisionEngineInput,
): { bullish: number; bearish: number; neutral: number } {
  const directions = [
    input.market.structure.direction,
    input.market.momentum.direction,
    input.setupCore.setup.direction,
  ];

  return directions.reduce(
    (totals, direction) => {
      if (direction === "long") {
        totals.bullish += 1;
      } else if (direction === "short") {
        totals.bearish += 1;
      } else {
        totals.neutral += 1;
      }

      return totals;
    },
    { bullish: 0, bearish: 0, neutral: 0 },
  );
}

export function resolveDominantDirection(input: DecisionEngineInput): "bullish" | "bearish" | "mixed" | "neutral" {
  const counts = countDirections(input);

  if (counts.bullish === 0 && counts.bearish === 0) {
    return "neutral";
  }

  if (counts.bullish > 0 && counts.bearish > 0) {
    return "mixed";
  }

  return counts.bullish > counts.bearish ? "bullish" : "bearish";
}

export function setupLabel(type: DecisionEngineInput["setupCore"]["setup"]["type"]): string {
  switch (type) {
    case "breakout_continuation":
      return "breakout continuation";
    case "trend_pullback":
      return "trend pullback";
    case "liquidity_sweep_reversal":
      return "liquidity sweep reversal";
    case "range_reclaim":
      return "range reclaim";
    case "failed_breakout":
      return "failed breakout";
    case "none":
      return "no active setup";
  }
}

export function isOpeningSession(session: DecisionEngineInput["market"]["session"]["session"]): boolean {
  return ["london_open", "ny_open", "london_ny_overlap"].includes(session);
}
