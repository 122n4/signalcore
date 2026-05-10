import type { ClarityOutput, DecisionEngineInput } from "./types";
import { clampPercentage, countDirections } from "./utils";

export function readClarity(input: DecisionEngineInput): ClarityOutput {
  const counts = countDirections(input);
  const directionalVotes = counts.bullish + counts.bearish;
  const dominantVotes = Math.max(counts.bullish, counts.bearish);
  const baseAlignment =
    directionalVotes === 0 ? 0 : (dominantVotes / directionalVotes) * 100;
  let conflictScore = 0;

  if (counts.bullish > 0 && counts.bearish > 0) {
    conflictScore += 38;
  }

  if (input.market.regime.state === "noisy") {
    conflictScore += 24;
  }

  if (input.market.regime.state === "low_participation") {
    conflictScore += 18;
  }

  if (input.market.volatility.state === "spike") {
    conflictScore += 20;
  }

  if (
    input.market.liquidity.state === "thin_liquidity" ||
    input.market.liquidity.state === "poor_participation"
  ) {
    conflictScore += 16;
  }

  if (input.setupCore.setup.type === "none") {
    conflictScore += 18;
  }

  if (input.setupCore.maturity.state === "late" || input.setupCore.maturity.state === "invalid") {
    conflictScore += 18;
  }

  const alignment = clampPercentage(
    baseAlignment + input.setupCore.quality.score * 0.18 + input.market.structure.confidence * 0.08,
  );
  const normalizedConflict = clampPercentage(conflictScore);
  const score = clampPercentage(
    alignment * 0.62 +
      input.setupCore.quality.score * 0.2 +
      input.setupCore.maturity.score * 0.1 -
      normalizedConflict * 0.35,
  );
  const level: ClarityOutput["level"] =
    score >= 72 ? "high" : score >= 48 ? "medium" : "low";

  return {
    level,
    score,
    conflictScore: normalizedConflict,
    alignment,
  };
}
