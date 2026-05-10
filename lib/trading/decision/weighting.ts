import type {
  BiasOutput,
  ClarityOutput,
  DecisionEngineInput,
  DecisionWeightingOutput,
  EnvironmentOutput,
} from "./types";
import { clampPercentage, isOpeningSession } from "./utils";

type WeightProfile = {
  structure: number;
  momentum: number;
  liquidity: number;
  setup: number;
  maturity: number;
  window: number;
  quality: number;
};

function resolveWeightProfile(input: DecisionEngineInput): WeightProfile {
  const base: WeightProfile = {
    structure: 1,
    momentum: 1,
    liquidity: 1,
    setup: 1,
    maturity: 1,
    window: 1,
    quality: 1,
  };

  if (input.market.regime.state === "trending") {
    base.structure += 0.25;
    base.momentum += 0.18;
    base.setup += input.setupCore.setup.type === "breakout_continuation" ? 0.18 : 0.08;
  }

  if (
    input.market.regime.state === "ranging" ||
    input.market.regime.state === "mean_reverting" ||
    input.market.regime.state === "compression"
  ) {
    base.liquidity += 0.22;
    base.setup +=
      input.setupCore.setup.type === "range_reclaim" ||
      input.setupCore.setup.type === "liquidity_sweep_reversal"
        ? 0.2
        : 0.05;
    base.structure -= 0.08;
  }

  if (input.market.volatility.state === "expansion") {
    base.momentum += 0.08;
    base.window += 0.12;
  }

  if (input.market.volatility.state === "compression") {
    base.setup += 0.08;
    base.maturity += 0.08;
  }

  if (input.market.volatility.state === "spike") {
    base.quality -= 0.12;
    base.window -= 0.1;
  }

  if (isOpeningSession(input.market.session.session)) {
    base.window += 0.14;
    base.momentum += 0.08;
  }

  if (input.market.session.session === "midday_lull") {
    base.window -= 0.18;
    base.quality -= 0.08;
  }

  return base;
}

export function applyDecisionWeighting(
  input: DecisionEngineInput,
  clarity: ClarityOutput,
  bias: BiasOutput,
  environment: EnvironmentOutput,
): DecisionWeightingOutput {
  const profile = resolveWeightProfile(input);
  const contextProfile = `${input.market.regime.state}:${input.market.volatility.state}:${input.market.session.session}`;
  const confluenceBonus =
    clarity.alignment >= 75 && bias.direction !== "mixed" && environment.state === "favorable"
      ? 10
      : clarity.alignment >= 60
        ? 5
        : 0;
  const conflictPenalty = clampPercentage(clarity.conflictScore);

  const weightedScores: Record<string, number> = {
    structure: clampPercentage(input.market.structure.score * profile.structure),
    momentum: clampPercentage(input.market.momentum.score * profile.momentum),
    liquidity: clampPercentage(input.market.liquidity.score * profile.liquidity),
    setup: clampPercentage(input.setupCore.setup.confidence * profile.setup),
    maturity: clampPercentage(input.setupCore.maturity.score * profile.maturity),
    opportunityWindow: clampPercentage(input.setupCore.opportunityWindow.score * profile.window),
    quality: clampPercentage(input.setupCore.quality.score * profile.quality),
    clarity: clarity.score,
    bias: bias.score,
    environment: environment.score,
    conflictPenalty,
    confluenceBonus,
  };

  return {
    contextProfile,
    weightedScores,
    confidence: clampPercentage(
      clarity.score * 0.2 +
        bias.confidence * 0.2 +
        environment.confidence * 0.2 +
        input.setupCore.quality.confidence * 0.2 +
        input.setupCore.opportunityWindow.confidence * 0.2,
    ),
  };
}
