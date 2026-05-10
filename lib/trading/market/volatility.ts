import type { TradingMarketDataSnapshot } from "@/lib/trading/data";

import type { VolatilityOutput } from "./types";
import { calculateAtr, clampPercentage, pickPreferredCandles } from "./utils";

const DEFAULT_OUTPUT: VolatilityOutput = {
  state: "normal",
  score: 45,
  confidence: 25,
};

function buildOutput(
  state: VolatilityOutput["state"],
  score: number,
  confidence: number,
): VolatilityOutput {
  return {
    state,
    score: clampPercentage(score),
    confidence: clampPercentage(confidence),
  };
}

export function readVolatility(snapshot: TradingMarketDataSnapshot): VolatilityOutput {
  const { candles } = pickPreferredCandles(snapshot, ["15m", "5m", "1h", "4h", "1d", "1m"], 12);

  if (candles.length < 12) {
    return DEFAULT_OUTPUT;
  }

  const recent = candles.slice(-6);
  const baseline = candles.slice(-20, -6).length >= 6 ? candles.slice(-20, -6) : candles.slice(0, -6);
  const recentAtr = calculateAtr(recent, 5);
  const baselineAtr = calculateAtr(baseline, 6);
  const safeBaselineAtr = baselineAtr > 0 ? baselineAtr : Math.max(recentAtr, 1);
  const atrRatio = safeBaselineAtr === 0 ? 1 : recentAtr / safeBaselineAtr;

  if (atrRatio < 0.72) {
    return buildOutput(
      "compression",
      60 + (1 - atrRatio) * 28,
      52 + (1 - atrRatio) * 30,
    );
  }

  if (atrRatio > 2.1) {
    return buildOutput("spike", 72 + (atrRatio - 2) * 18, 62 + Math.min((atrRatio - 2) * 20, 30));
  }

  if (atrRatio > 1.35) {
    return buildOutput(
      "expansion",
      62 + (atrRatio - 1) * 22,
      54 + Math.min((atrRatio - 1) * 18, 28),
    );
  }

  return buildOutput("normal", 48 + Math.abs(1 - atrRatio) * 8, 50);
}
