import type { TradingMarketDataSnapshot } from "@/lib/trading/data";

import type { RegimeOutput } from "./types";
import {
  calculateAtr,
  calculateDirectionChangeRatio,
  calculateEfficiencyRatio,
  calculateVolumeRatio,
  clampPercentage,
  pickPreferredCandles,
} from "./utils";

const DEFAULT_OUTPUT: RegimeOutput = {
  state: "ranging",
  score: 40,
  confidence: 25,
};

function buildOutput(state: RegimeOutput["state"], score: number, confidence: number): RegimeOutput {
  return {
    state,
    score: clampPercentage(score),
    confidence: clampPercentage(confidence),
  };
}

export function readRegime(snapshot: TradingMarketDataSnapshot): RegimeOutput {
  const { candles } = pickPreferredCandles(snapshot, ["1h", "15m", "4h", "5m", "1d", "1m"], 12);

  if (candles.length < 12) {
    return DEFAULT_OUTPUT;
  }

  const recent = candles.slice(-8);
  const baseline = candles.slice(-20, -8).length >= 6 ? candles.slice(-20, -8) : candles.slice(0, -8);
  const recentAtr = calculateAtr(recent, 6);
  const baselineAtr = calculateAtr(baseline, 6);
  const safeBaselineAtr = baselineAtr > 0 ? baselineAtr : Math.max(recentAtr, 1);
  const atrRatio = safeBaselineAtr === 0 ? 1 : recentAtr / safeBaselineAtr;
  const efficiency = calculateEfficiencyRatio(candles.slice(-12));
  const directionChanges = calculateDirectionChangeRatio(candles.slice(-12));
  const volumeRatio = calculateVolumeRatio(candles, 6, 20);

  if (volumeRatio !== null && volumeRatio < 0.68 && atrRatio <= 0.95) {
    return buildOutput(
      "low_participation",
      60 + (1 - volumeRatio) * 25,
      55 + (1 - volumeRatio) * 28,
    );
  }

  if (atrRatio < 0.72) {
    return buildOutput(
      "compression",
      62 + (1 - atrRatio) * 30,
      52 + (1 - atrRatio) * 30,
    );
  }

  if (directionChanges > 0.72 && atrRatio >= 0.85) {
    return buildOutput(
      "noisy",
      62 + directionChanges * 18 + (atrRatio - 1) * 10,
      54 + directionChanges * 22,
    );
  }

  if (atrRatio > 1.45) {
    return buildOutput(
      "expansion",
      64 + (atrRatio - 1) * 20,
      56 + Math.min((atrRatio - 1) * 22, 32),
    );
  }

  if (efficiency > 0.58 && directionChanges < 0.45) {
    return buildOutput(
      "trending",
      60 + efficiency * 28,
      52 + efficiency * 30,
    );
  }

  if (efficiency < 0.22 && directionChanges > 0.55) {
    return buildOutput(
      "mean_reverting",
      58 + directionChanges * 20,
      50 + directionChanges * 22,
    );
  }

  return buildOutput(
    "ranging",
    54 + (1 - efficiency) * 18,
    48 + (1 - efficiency) * 20,
  );
}
