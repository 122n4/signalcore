import type { DecisionEngineInput, EnvironmentOutput } from "./types";
import { clampPercentage } from "./utils";

export function readEnvironment(input: DecisionEngineInput): EnvironmentOutput {
  if (!input.market.session.marketOpen) {
    return {
      state: "unfavorable",
      score: 10,
      confidence: 95,
    };
  }

  let score = 50;

  if (["trending", "expansion", "compression", "ranging", "mean_reverting"].includes(input.market.regime.state)) {
    score += 8;
  }

  if (input.market.regime.state === "noisy" || input.market.regime.state === "low_participation") {
    score -= 18;
  }

  if (input.market.volatility.state === "spike") {
    score -= 14;
  } else if (input.market.volatility.state === "normal" || input.market.volatility.state === "expansion") {
    score += 6;
  }

  if (input.market.session.session === "midday_lull") {
    score -= 12;
  } else if (["ny_open", "london_open", "london_ny_overlap"].includes(input.market.session.session)) {
    score += 8;
  }

  if (
    input.market.liquidity.state === "healthy_participation" ||
    input.market.liquidity.state === "reclaim_after_sweep"
  ) {
    score += 8;
  }

  if (
    input.market.liquidity.state === "poor_participation" ||
    input.market.liquidity.state === "thin_liquidity"
  ) {
    score -= 12;
  }

  if (input.setupCore.quality.grade === "A") {
    score += 10;
  } else if (input.setupCore.quality.grade === "B") {
    score += 6;
  } else if (input.setupCore.quality.grade === "D") {
    score -= 14;
  }

  if (input.setupCore.opportunityWindow.state === "active") {
    score += 6;
  }

  if (input.setupCore.opportunityWindow.state === "degrading" || input.setupCore.opportunityWindow.state === "closed") {
    score -= 12;
  }

  const normalizedScore = clampPercentage(score);

  return {
    state: normalizedScore >= 66 ? "favorable" : normalizedScore >= 42 ? "neutral" : "unfavorable",
    score: normalizedScore,
    confidence: clampPercentage(
      input.market.session.confidence * 0.2 +
        input.market.regime.confidence * 0.18 +
        input.market.liquidity.confidence * 0.12 +
        input.setupCore.quality.confidence * 0.25 +
        input.setupCore.opportunityWindow.confidence * 0.25,
    ),
  };
}
