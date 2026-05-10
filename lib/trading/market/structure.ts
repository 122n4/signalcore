import type { TradingMarketDataSnapshot } from "@/lib/trading/data";

import type { StructureOutput } from "./types";
import {
  average,
  calculateBodyRatio,
  calculateEfficiencyRatio,
  calculateSlope,
  clampPercentage,
  lastItem,
  pickPreferredCandles,
} from "./utils";

const DEFAULT_OUTPUT: StructureOutput = {
  state: "transition",
  direction: "neutral",
  score: 35,
  confidence: 25,
};

function buildOutput(
  state: StructureOutput["state"],
  direction: StructureOutput["direction"],
  score: number,
  confidence: number,
): StructureOutput {
  return {
    state,
    direction,
    score: clampPercentage(score),
    confidence: clampPercentage(confidence),
  };
}

export function readStructure(snapshot: TradingMarketDataSnapshot): StructureOutput {
  const { candles } = pickPreferredCandles(snapshot, ["15m", "5m", "1h", "4h", "1d", "1m"], 8);

  if (candles.length < 8) {
    return DEFAULT_OUTPUT;
  }

  const latest = lastItem(candles);

  if (!latest) {
    return DEFAULT_OUTPUT;
  }

  const previous = candles[candles.length - 2];
  const context = candles.slice(-13, -1);

  if (context.length < 5) {
    return DEFAULT_OUTPUT;
  }

  const contextHigh = Math.max(...context.map((candle) => candle.high));
  const contextLow = Math.min(...context.map((candle) => candle.low));
  const contextRange = Math.max(contextHigh - contextLow, latest.close * 0.002);
  const buffer = contextRange * 0.03;
  const bodyRatio = calculateBodyRatio(latest);
  const contextEfficiency = calculateEfficiencyRatio(context);
  const efficiency = calculateEfficiencyRatio(candles.slice(-12));
  const slope = calculateSlope(candles, 6);
  const closes = candles.map((candle) => candle.close);
  const shortAverage = average(closes.slice(-5));
  const mediumAverage = average(closes.slice(-10));
  const recentHigh = Math.max(...candles.slice(-4).map((candle) => candle.high));
  const recentLow = Math.min(...candles.slice(-4).map((candle) => candle.low));
  const rangeLikeContext = contextEfficiency < 0.32;
  const directionalPosition =
    contextRange === 0 ? 0.5 : (latest.close - contextLow) / contextRange;

  if (rangeLikeContext && latest.close > contextHigh + buffer && bodyRatio >= 0.45) {
    return buildOutput(
      "breakout_structure",
      "long",
      72 + ((latest.close - contextHigh) / contextRange) * 18 + bodyRatio * 10,
      58 + efficiency * 25 + bodyRatio * 20,
    );
  }

  if (rangeLikeContext && latest.close < contextLow - buffer && bodyRatio >= 0.45) {
    return buildOutput(
      "breakout_structure",
      "short",
      72 + ((contextLow - latest.close) / contextRange) * 18 + bodyRatio * 10,
      58 + efficiency * 25 + bodyRatio * 20,
    );
  }

  if (previous.close < contextLow - buffer && latest.close > contextLow && latest.close > latest.open) {
    return buildOutput(
      "reclaim_structure",
      "long",
      68 + bodyRatio * 12 + efficiency * 12,
      56 + bodyRatio * 22 + efficiency * 16,
    );
  }

  if (
    previous.close > contextHigh + buffer &&
    latest.close < contextHigh &&
    latest.close < latest.open
  ) {
    return buildOutput(
      "reclaim_structure",
      "short",
      68 + bodyRatio * 12 + efficiency * 12,
      56 + bodyRatio * 22 + efficiency * 16,
    );
  }

  if (recentHigh > contextHigh + buffer && latest.close < contextHigh) {
    return buildOutput(
      "failed_break",
      "short",
      64 + bodyRatio * 10 + (1 - contextEfficiency) * 10,
      52 + bodyRatio * 20 + (1 - contextEfficiency) * 18,
    );
  }

  if (recentLow < contextLow - buffer && latest.close > contextLow) {
    return buildOutput(
      "failed_break",
      "long",
      64 + bodyRatio * 10 + (1 - contextEfficiency) * 10,
      52 + bodyRatio * 20 + (1 - contextEfficiency) * 18,
    );
  }

  if (shortAverage > mediumAverage && slope > 0.3 && efficiency > 0.35) {
    return buildOutput(
      "uptrend",
      "long",
      58 + efficiency * 24 + slope * 4,
      50 + efficiency * 26 + Math.min(slope * 5, 25),
    );
  }

  if (shortAverage < mediumAverage && slope < -0.3 && efficiency > 0.35) {
    return buildOutput(
      "downtrend",
      "short",
      58 + efficiency * 24 + Math.abs(slope) * 4,
      50 + efficiency * 26 + Math.min(Math.abs(slope) * 5, 25),
    );
  }

  if (Math.abs(slope) < 0.12 && efficiency < 0.25) {
    return buildOutput("range", "neutral", 54 + (1 - efficiency) * 18, 52 + (1 - efficiency) * 22);
  }

  if (rangeLikeContext && directionalPosition >= 0.74) {
    return buildOutput(
      "uptrend",
      "long",
      54 + directionalPosition * 16,
      46 + directionalPosition * 18,
    );
  }

  if (rangeLikeContext && directionalPosition <= 0.26) {
    return buildOutput(
      "downtrend",
      "short",
      54 + (1 - directionalPosition) * 16,
      46 + (1 - directionalPosition) * 18,
    );
  }

  return buildOutput("transition", "neutral", 42 + Math.abs(slope) * 8, 38 + efficiency * 18);
}
