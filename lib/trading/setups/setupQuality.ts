import type {
  OpportunityWindowOutput,
  SetupContext,
  SetupEngineInput,
  SetupMaturityOutput,
  SetupOutput,
  SetupQualityOutput,
} from "./types";
import { clampPercentage, resolveSetupContext } from "./utils";

function gradeFromScore(score: number): SetupQualityOutput["grade"] {
  if (score >= 80) {
    return "A";
  }

  if (score >= 65) {
    return "B";
  }

  if (score >= 50) {
    return "C";
  }

  return "D";
}

export function assessSetupQuality(
  input: SetupEngineInput | SetupContext,
  setup: SetupOutput,
  maturity: SetupMaturityOutput,
  opportunityWindow: OpportunityWindowOutput,
): SetupQualityOutput {
  const context = resolveSetupContext(input);

  if (setup.type === "none") {
    return {
      score: 18,
      grade: "D",
      confidence: 82,
    };
  }

  let score =
    setup.confidence * 0.32 +
    maturity.score * 0.22 +
    context.market.structure.confidence * 0.1 +
    context.market.regime.confidence * 0.08 +
    context.market.momentum.confidence * 0.1 +
    context.market.liquidity.confidence * 0.1 +
    opportunityWindow.score * 0.08;

  if (setup.type === "breakout_continuation" && context.market.regime.state === "trending") {
    score += 6;
  }

  if (
    setup.type === "range_reclaim" &&
    ["ranging", "compression", "mean_reverting"].includes(context.market.regime.state)
  ) {
    score += 6;
  }

  if (
    setup.type === "liquidity_sweep_reversal" &&
    ["liquidity_sweep", "reclaim_after_sweep"].includes(context.market.liquidity.state)
  ) {
    score += 8;
  }

  if (setup.type === "liquidity_sweep_reversal") {
    if (context.market.session.session === "asia_flow" || context.market.session.session === "london_session") {
      score += 4;
    }

    if (context.market.session.session === "london_ny_overlap") {
      score -= 6;
    }

    if (context.market.session.session === "late_us") {
      score -= 10;
    }
  }

  if (context.market.regime.state === "noisy" || context.market.regime.state === "low_participation") {
    score -= 12;
  }

  if (context.market.volatility.state === "spike") {
    score -= 10;
  }

  if (
    context.market.liquidity.state === "thin_liquidity" ||
    context.market.liquidity.state === "poor_participation"
  ) {
    score -= 8;
  }

  if (maturity.state === "late" || opportunityWindow.state === "degrading") {
    score -= 12;
  }

  if (context.market.session.session === "midday_lull") {
    score -= 6;
  }

  const normalizedScore = clampPercentage(score);

  return {
    score: normalizedScore,
    grade: gradeFromScore(normalizedScore),
    confidence: clampPercentage(
      setup.confidence * 0.35 +
        maturity.confidence * 0.2 +
        context.market.structure.confidence * 0.15 +
        context.market.momentum.confidence * 0.15 +
        opportunityWindow.confidence * 0.15,
    ),
  };
}
