import type { TradingMarketDataSnapshot } from "@/lib/trading/data";

import type { MomentumOutput } from "./types";
import {
  calculateAverageRange,
  calculateWickRatios,
  clampPercentage,
  coerceDirection,
  lastItem,
  pickPreferredCandles,
} from "./utils";

const DEFAULT_OUTPUT: MomentumOutput = {
  state: "neutral",
  direction: "neutral",
  score: 38,
  confidence: 24,
};

function buildOutput(
  state: MomentumOutput["state"],
  direction: MomentumOutput["direction"],
  score: number,
  confidence: number,
): MomentumOutput {
  return {
    state,
    direction,
    score: clampPercentage(score),
    confidence: clampPercentage(confidence),
  };
}

export function readMomentum(snapshot: TradingMarketDataSnapshot): MomentumOutput {
  const { candles } = pickPreferredCandles(snapshot, ["5m", "15m", "1h", "1m", "4h", "1d"], 10);

  if (candles.length < 10) {
    return DEFAULT_OUTPUT;
  }

  const latest = lastItem(candles);

  if (!latest) {
    return DEFAULT_OUTPUT;
  }

  const pivotIndex = candles.length - 5;
  const previousIndex = candles.length - 9;
  const recentMove = latest.close - candles[pivotIndex].close;
  const previousMove = candles[pivotIndex].close - candles[previousIndex].close;
  const rangeScale = Math.max(calculateAverageRange(candles.slice(-8)) * 4, latest.close * 0.004);
  const recentImpulse = rangeScale === 0 ? 0 : recentMove / rangeScale;
  const previousImpulse = rangeScale === 0 ? 0 : previousMove / rangeScale;
  const direction = coerceDirection(recentImpulse, 0.18);
  const previousDirection = coerceDirection(previousImpulse, 0.18);
  const acceleration = Math.abs(recentImpulse) - Math.abs(previousImpulse);
  const wickRatios = calculateWickRatios(latest);
  const closeWindow = candles.slice(-6).map((candle) => candle.close);
  const latestClose = closeWindow[closeWindow.length - 1] ?? latest.close;
  const recentHigh = Math.max(...candles.slice(-6).map((candle) => candle.high));
  const recentLow = Math.min(...candles.slice(-6).map((candle) => candle.low));
  const directionalRange = Math.max(recentHigh - recentLow, latest.close * 0.002);
  const directionalPosition =
    directionalRange === 0
      ? 0.5
      : (latestClose - recentLow) / directionalRange;
  const opposingWick =
    direction === "long"
      ? wickRatios.upper
      : direction === "short"
        ? wickRatios.lower
        : Math.max(wickRatios.upper, wickRatios.lower);

  if (direction === "neutral") {
    if (previousDirection !== "neutral" && Math.abs(previousImpulse) > 0.45) {
      return buildOutput(
        "exhausted",
        previousDirection,
        58 + Math.abs(previousImpulse) * 18,
        52 + Math.abs(previousImpulse) * 18,
      );
    }

    if (directionalPosition >= 0.78) {
      return buildOutput(
        "rising",
        "long",
        52 + directionalPosition * 18,
        46 + directionalPosition * 18,
      );
    }

    if (directionalPosition <= 0.22) {
      return buildOutput(
        "rising",
        "short",
        52 + (1 - directionalPosition) * 18,
        46 + (1 - directionalPosition) * 18,
      );
    }

    return DEFAULT_OUTPUT;
  }

  if (previousDirection === direction && acceleration > 0.18 && Math.abs(recentImpulse) > 0.45) {
    return buildOutput(
      "accelerating",
      direction,
      64 + Math.abs(recentImpulse) * 18,
      56 + Math.abs(recentImpulse) * 16,
    );
  }

  if (previousDirection === direction && opposingWick > 0.45 && acceleration < -0.18) {
    return buildOutput(
      "exhausted",
      direction,
      58 + Math.abs(previousImpulse) * 16,
      52 + opposingWick * 28,
    );
  }

  if (previousDirection === direction && Math.abs(recentImpulse) > 0.32 && acceleration >= -0.08) {
    return buildOutput(
      "rising",
      direction,
      60 + Math.abs(recentImpulse) * 16,
      52 + Math.abs(recentImpulse) * 14,
    );
  }

  if (previousDirection === direction && acceleration < -0.12) {
    return buildOutput(
      "weakening",
      direction,
      56 + Math.abs(recentImpulse) * 14,
      50 + Math.abs(previousImpulse) * 14,
    );
  }

  if (previousDirection !== "neutral" && previousDirection !== direction) {
    return buildOutput(
      "exhausted",
      previousDirection,
      60 + Math.abs(previousImpulse) * 14,
      52 + Math.abs(previousImpulse) * 16,
    );
  }

  return buildOutput(
    "rising",
    direction,
    56 + Math.abs(recentImpulse) * 14,
    50 + Math.abs(recentImpulse) * 14,
  );
}
