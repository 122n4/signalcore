import type { BiasOutput, DecisionEngineInput } from "./types";
import { clampPercentage, countDirections, resolveDominantDirection } from "./utils";

function isReversalSetup(input: DecisionEngineInput): boolean {
  return ["liquidity_sweep_reversal", "range_reclaim", "failed_breakout"].includes(
    input.setupCore.setup.type,
  );
}

function resolveReversalBias(input: DecisionEngineInput): BiasOutput | null {
  if (
    !isReversalSetup(input) ||
    !["compression", "mean_reverting"].includes(input.market.regime.state) ||
    input.setupCore.setup.direction === "neutral"
  ) {
    return null;
  }

  const setupDirection = input.setupCore.setup.direction;
  const momentumSupports =
    input.market.momentum.direction === "neutral" ||
    input.market.momentum.direction === setupDirection;

  if (!momentumSupports) {
    return null;
  }

  const structureOpposes =
    input.market.structure.direction !== "neutral" &&
    input.market.structure.direction !== setupDirection;

  return {
    direction: setupDirection === "long" ? "bullish" : "bearish",
    score: clampPercentage(
      54 +
        input.setupCore.quality.score * 0.22 +
        input.setupCore.setup.confidence * 0.12 +
        input.market.regime.confidence * 0.08 -
        (structureOpposes ? 6 : 0),
    ),
    confidence: clampPercentage(
      50 +
        input.setupCore.setup.confidence * 0.22 +
        input.market.momentum.confidence * 0.16 +
        input.market.regime.confidence * 0.12 -
        (structureOpposes ? 4 : 0),
    ),
  };
}

export function readBias(input: DecisionEngineInput): BiasOutput {
  const reversalBias = resolveReversalBias(input);

  if (reversalBias) {
    return reversalBias;
  }

  const dominantDirection = resolveDominantDirection(input);
  const counts = countDirections(input);
  const totalDirectionalVotes = counts.bullish + counts.bearish;

  if (dominantDirection === "neutral") {
    return {
      direction: "neutral",
      score: 22,
      confidence: 28,
    };
  }

  if (dominantDirection === "mixed") {
    return {
      direction: "mixed",
      score: clampPercentage(
        42 + input.market.regime.confidence * 0.08 + input.setupCore.quality.score * 0.06,
      ),
      confidence: clampPercentage(
        46 + totalDirectionalVotes * 6 + input.market.regime.confidence * 0.06,
      ),
    };
  }

  const agreement =
    totalDirectionalVotes === 0
      ? 0
      : (Math.max(counts.bullish, counts.bearish) / totalDirectionalVotes) * 100;
  const score = clampPercentage(
    agreement * 0.52 +
      input.market.structure.score * 0.18 +
      input.market.momentum.score * 0.12 +
      input.setupCore.quality.score * 0.18,
  );

  return {
    direction: dominantDirection,
    score,
    confidence: clampPercentage(
      agreement * 0.45 +
        input.market.structure.confidence * 0.2 +
        input.market.momentum.confidence * 0.15 +
        input.setupCore.setup.confidence * 0.2,
    ),
  };
}
