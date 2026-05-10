import type { TradingMarketDataSnapshot } from "@/lib/trading/data";

import type { LiquidityOutput } from "./types";
import {
  average,
  calculateBodyRatio,
  calculateVolumeRatio,
  calculateWickRatios,
  clampPercentage,
  lastItem,
  pickPreferredCandles,
} from "./utils";

const DEFAULT_OUTPUT: LiquidityOutput = {
  state: "neutral",
  score: 40,
  confidence: 24,
};

function buildOutput(
  state: LiquidityOutput["state"],
  score: number,
  confidence: number,
): LiquidityOutput {
  return {
    state,
    score: clampPercentage(score),
    confidence: clampPercentage(confidence),
  };
}

export function readLiquidity(snapshot: TradingMarketDataSnapshot): LiquidityOutput {
  const { candles } = pickPreferredCandles(snapshot, ["5m", "15m", "1m", "1h", "4h", "1d"], 10);

  if (candles.length < 10) {
    return DEFAULT_OUTPUT;
  }

  const latest = lastItem(candles);

  if (!latest) {
    return DEFAULT_OUTPUT;
  }

  const previous = candles[candles.length - 2];
  const context = candles.slice(-12, -2);

  if (context.length < 5) {
    return DEFAULT_OUTPUT;
  }

  const contextHigh = Math.max(...context.map((candle) => candle.high));
  const contextLow = Math.min(...context.map((candle) => candle.low));
  const contextRange = Math.max(contextHigh - contextLow, latest.close * 0.002);
  const buffer = contextRange * 0.025;
  const latestWicks = calculateWickRatios(latest);
  const averageBodyRatio = average(candles.slice(-4).map(calculateBodyRatio));
  const averageWickRatio = average(
    candles.slice(-4).map((candle) => {
      const wick = calculateWickRatios(candle);
      return Math.max(wick.upper, wick.lower);
    }),
  );
  const volumeRatio = calculateVolumeRatio(candles, 4, 16);

  if (previous.low < contextLow - buffer && latest.close > contextLow && latest.close > latest.open) {
    return buildOutput(
      "reclaim_after_sweep",
      70 + averageBodyRatio * 16,
      60 + averageBodyRatio * 18,
    );
  }

  if (
    previous.high > contextHigh + buffer &&
    latest.close < contextHigh &&
    latest.close < latest.open
  ) {
    return buildOutput(
      "reclaim_after_sweep",
      70 + averageBodyRatio * 16,
      60 + averageBodyRatio * 18,
    );
  }

  if (latest.high > contextHigh + buffer && latest.close < contextHigh && latestWicks.upper > 0.45) {
    return buildOutput(
      "liquidity_sweep",
      68 + latestWicks.upper * 18,
      58 + latestWicks.upper * 20,
    );
  }

  if (latest.low < contextLow - buffer && latest.close > contextLow && latestWicks.lower > 0.45) {
    return buildOutput(
      "liquidity_sweep",
      68 + latestWicks.lower * 18,
      58 + latestWicks.lower * 20,
    );
  }

  if (volumeRatio !== null && volumeRatio > 1.1 && averageBodyRatio > 0.38) {
    return buildOutput(
      "healthy_participation",
      62 + volumeRatio * 16,
      54 + volumeRatio * 16,
    );
  }

  if (volumeRatio !== null && volumeRatio < 0.7 && averageBodyRatio < 0.35) {
    return buildOutput(
      "poor_participation",
      60 + (1 - volumeRatio) * 22,
      52 + (1 - volumeRatio) * 24,
    );
  }

  if ((volumeRatio !== null && volumeRatio < 0.9 && averageWickRatio > 0.52) || averageWickRatio > 0.62) {
    return buildOutput(
      "thin_liquidity",
      60 + averageWickRatio * 20,
      52 + averageWickRatio * 20,
    );
  }

  return DEFAULT_OUTPUT;
}
