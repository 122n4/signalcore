import { getTimeframeCandles } from "@/lib/trading/data";

import type { SetupOutput } from "./types";
import { clampPercentage, resolveDirectionalLevels, resolveSetupContext } from "./utils";
import type { SetupContext, SetupEngineInput } from "./types";

const NONE_OUTPUT: SetupOutput = {
  type: "none",
  direction: "neutral",
  triggerLevel: null,
  invalidationLevel: null,
  confidence: 18,
};

function isMomentumOpposingDirection(
  direction: SetupOutput["direction"],
  momentumDirection: SetupOutput["direction"],
) {
  return (
    direction !== "neutral" &&
    momentumDirection === (direction === "long" ? "short" : "long")
  );
}

function resolveDirectionalRangePosition(args: {
  direction: SetupOutput["direction"];
  latestClose: number;
  recentHigh: number | null;
  recentLow: number | null;
}) {
  const rangeHigh = args.recentHigh ?? args.latestClose;
  const rangeLow = args.recentLow ?? args.latestClose;
  const rangeSize = Math.max(rangeHigh - rangeLow, args.latestClose * 0.002);

  return args.direction === "long"
    ? (args.latestClose - rangeLow) / rangeSize
    : (rangeHigh - args.latestClose) / rangeSize;
}

function buildSetup(
  type: SetupOutput["type"],
  direction: SetupOutput["direction"],
  confidence: number,
  triggerLevel: number | null,
  invalidationLevel: number | null,
): SetupOutput {
  return {
    type,
    direction,
    triggerLevel,
    invalidationLevel,
    confidence: clampPercentage(confidence),
  };
}

function resolveHigherTimeframeDirection(input: SetupEngineInput | SetupContext): SetupOutput["direction"] {
  const snapshot = input.snapshot;
  const candidates: Array<{ direction: SetupOutput["direction"]; strength: number }> = [];

  for (const timeframe of ["1h", "4h"] as const) {
    const candles = getTimeframeCandles(snapshot, timeframe);

    if (candles.length < 10) {
      continue;
    }

    const recent = candles.slice(-6);
    const latest = recent[recent.length - 1];
    const anchor = recent[0];

    if (!latest || !anchor) {
      continue;
    }

    const high = Math.max(...recent.map((candle) => candle.high));
    const low = Math.min(...recent.map((candle) => candle.low));
    const range = Math.max(high - low, latest.close * 0.002);
    const move = latest.close - anchor.close;
    const impulse = range === 0 ? 0 : move / range;
    const position = range === 0 ? 0.5 : (latest.close - low) / range;

    if (impulse >= 0.32 || position >= 0.74) {
      candidates.push({
        direction: "long",
        strength: Math.max(impulse, position),
      });
      continue;
    }

    if (impulse <= -0.32 || position <= 0.26) {
      candidates.push({
        direction: "short",
        strength: Math.max(Math.abs(impulse), 1 - position),
      });
    }
  }

  if (candidates.length === 0) {
    return "neutral";
  }

  const hasLong = candidates.some((candidate) => candidate.direction === "long");
  const hasShort = candidates.some((candidate) => candidate.direction === "short");

  if (hasLong && hasShort) {
    return "neutral";
  }

  const strongest = candidates.sort((left, right) => right.strength - left.strength)[0];

  return strongest?.direction ?? "neutral";
}

export function detectSetup(input: SetupEngineInput | SetupContext): SetupOutput {
  const context = resolveSetupContext(input);
  const {
    market,
    latestCandle,
    previousCandle,
    recentHigh,
    recentLow,
    contextHigh,
    contextLow,
    candles,
  } = context;

  if (!latestCandle || candles.length < 8) {
    return NONE_OUTPUT;
  }

  const structureDirection = market.structure.direction;
  const momentumDirection = market.momentum.direction;
  const higherTimeframeDirection = resolveHigherTimeframeDirection(input);
  const direction =
    structureDirection !== "neutral"
      ? structureDirection
      : momentumDirection !== "neutral"
        ? momentumDirection
        : higherTimeframeDirection;
  const momentumOpposesDirection = isMomentumOpposingDirection(direction, momentumDirection);
  const rangeLike =
    market.structure.state === "range" ||
    market.structure.state === "reclaim_structure" ||
    market.regime.state === "ranging" ||
    market.regime.state === "compression" ||
    market.regime.state === "mean_reverting";
  const trendLike =
    market.structure.state === "uptrend" ||
    market.structure.state === "downtrend" ||
    market.structure.state === "breakout_structure" ||
    market.regime.state === "trending" ||
    market.regime.state === "expansion";

  if (direction !== "neutral" && market.structure.state === "failed_break") {
    const levels = resolveDirectionalLevels(direction, latestCandle, recentHigh, recentLow);

    return buildSetup(
      "failed_breakout",
      direction,
      60 + market.structure.confidence * 0.16 + market.momentum.confidence * 0.14,
      levels.triggerLevel,
      levels.invalidationLevel,
    );
  }

  if (
    direction !== "neutral" &&
    (market.liquidity.state === "reclaim_after_sweep" ||
      (market.liquidity.state === "liquidity_sweep" &&
        market.momentum.direction === direction &&
        market.momentum.state !== "exhausted"))
  ) {
    const levels = resolveDirectionalLevels(direction, latestCandle, recentHigh, recentLow);

    return buildSetup(
      "liquidity_sweep_reversal",
      direction,
      62 + market.liquidity.confidence * 0.18 + market.structure.confidence * 0.12,
      levels.triggerLevel,
      levels.invalidationLevel,
    );
  }

  if (
    direction !== "neutral" &&
    market.structure.state === "reclaim_structure" &&
    rangeLike &&
    market.momentum.direction !== (direction === "long" ? "short" : "long")
  ) {
    const levels = resolveDirectionalLevels(direction, latestCandle, recentHigh, recentLow);

    return buildSetup(
      "range_reclaim",
      direction,
      60 + market.structure.confidence * 0.18 + market.regime.confidence * 0.12,
      levels.triggerLevel,
      levels.invalidationLevel,
    );
  }

  if (
    direction !== "neutral" &&
    market.structure.state === "breakout_structure" &&
    trendLike &&
    !momentumOpposesDirection &&
    market.momentum.state !== "exhausted"
  ) {
    const levels = resolveDirectionalLevels(direction, latestCandle, recentHigh, recentLow);

    return buildSetup(
      "breakout_continuation",
      direction,
      60 +
        market.structure.confidence * 0.18 +
        market.momentum.confidence * 0.1 +
        (market.momentum.direction === direction ? 4 : 0),
      levels.triggerLevel,
      levels.invalidationLevel,
    );
  }

  if (
    direction !== "neutral" &&
    market.regime.state === "compression" &&
    market.momentum.direction === direction &&
    market.momentum.state !== "exhausted" &&
    market.volatility.state !== "spike" &&
    market.liquidity.state !== "poor_participation" &&
    market.liquidity.state !== "thin_liquidity"
  ) {
    const pricePosition = resolveDirectionalRangePosition({
      direction,
      latestClose: latestCandle.close,
      recentHigh,
      recentLow,
    });

    if (pricePosition >= 0.8) {
      const levels = resolveDirectionalLevels(direction, latestCandle, recentHigh, recentLow);

      return buildSetup(
        "breakout_continuation",
        direction,
        52 +
          market.regime.confidence * 0.14 +
          market.momentum.confidence * 0.12 +
          (market.structure.direction === direction ? 4 : 0),
        levels.triggerLevel,
        levels.invalidationLevel,
      );
    }
  }

  if (
    direction !== "neutral" &&
    (market.structure.state === "uptrend" || market.structure.state === "downtrend") &&
    (market.regime.state === "trending" || market.regime.state === "expansion") &&
    !momentumOpposesDirection &&
    market.momentum.state !== "exhausted" &&
    market.volatility.state !== "spike" &&
    market.liquidity.state !== "poor_participation"
  ) {
    const pricePosition = resolveDirectionalRangePosition({
      direction,
      latestClose: latestCandle.close,
      recentHigh,
      recentLow,
    });

    if (pricePosition >= 0.18 && pricePosition <= 0.88) {
      const levels = resolveDirectionalLevels(direction, latestCandle, recentHigh, recentLow);

      return buildSetup(
        "trend_pullback",
        direction,
        54 +
          market.structure.confidence * 0.16 +
          market.regime.confidence * 0.12 +
          (market.momentum.direction === direction ? 4 : 0),
        levels.triggerLevel,
        levels.invalidationLevel,
      );
    }
  }

  if (
    direction !== "neutral" &&
    previousCandle &&
    contextHigh !== null &&
    contextLow !== null &&
    rangeLike &&
    market.momentum.direction === direction &&
    market.structure.state !== "breakout_structure"
  ) {
    const brokeAbove = previousCandle.high > contextHigh && latestCandle.close < contextHigh;
    const brokeBelow = previousCandle.low < contextLow && latestCandle.close > contextLow;

    if (
      (direction === "short" && brokeAbove) ||
      (direction === "long" && brokeBelow)
    ) {
      const levels = resolveDirectionalLevels(direction, latestCandle, recentHigh, recentLow);

      return buildSetup(
        "failed_breakout",
        direction,
        56 + market.structure.confidence * 0.15 + market.liquidity.confidence * 0.12,
        levels.triggerLevel,
        levels.invalidationLevel,
      );
    }
  }

  if (
    direction !== "neutral" &&
    !momentumOpposesDirection &&
    market.regime.state !== "low_participation" &&
    market.regime.state !== "noisy" &&
    market.volatility.state !== "spike" &&
    market.liquidity.state !== "poor_participation" &&
    market.liquidity.state !== "thin_liquidity"
  ) {
    const pricePosition = resolveDirectionalRangePosition({
      direction,
      latestClose: latestCandle.close,
      recentHigh,
      recentLow,
    });

    if (
      (market.structure.state === "uptrend" || market.structure.state === "downtrend") &&
      pricePosition >= 0.22 &&
      pricePosition <= 0.92
    ) {
      const levels = resolveDirectionalLevels(direction, latestCandle, recentHigh, recentLow);

      return buildSetup(
        "trend_pullback",
        direction,
        48 +
          market.structure.confidence * 0.14 +
          market.regime.confidence * 0.08 +
          market.momentum.confidence * 0.06,
        levels.triggerLevel,
        levels.invalidationLevel,
      );
    }

    if (rangeLike && pricePosition >= 0.16 && pricePosition <= 0.9) {
      const levels = resolveDirectionalLevels(direction, latestCandle, recentHigh, recentLow);

      return buildSetup(
        "range_reclaim",
        direction,
        46 +
          market.structure.confidence * 0.12 +
          market.regime.confidence * 0.08 +
          market.liquidity.confidence * 0.06,
        levels.triggerLevel,
        levels.invalidationLevel,
      );
    }
  }

  return NONE_OUTPUT;
}
