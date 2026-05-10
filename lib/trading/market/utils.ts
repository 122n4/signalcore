import {
  getTimeframeCandles,
  resolvePrimaryTimeframe,
  type NormalizedCandle,
  type TradingMarketDataSnapshot,
  type TradingTimeframe,
} from "@/lib/trading/data";

import type { MarketDirection } from "./types";

export function clampPercentage(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

export function lastItem<T>(values: T[]): T | null {
  return values.length === 0 ? null : values[values.length - 1];
}

export function calculateBodyRatio(candle: NormalizedCandle): number {
  const range = candle.high - candle.low;

  if (range <= 0) {
    return 0;
  }

  return Math.abs(candle.close - candle.open) / range;
}

export function calculateWickRatios(candle: NormalizedCandle): { upper: number; lower: number } {
  const range = candle.high - candle.low;

  if (range <= 0) {
    return { upper: 0, lower: 0 };
  }

  const bodyHigh = Math.max(candle.open, candle.close);
  const bodyLow = Math.min(candle.open, candle.close);

  return {
    upper: (candle.high - bodyHigh) / range,
    lower: (bodyLow - candle.low) / range,
  };
}

export function calculateAverageRange(candles: NormalizedCandle[]): number {
  return average(candles.map((candle) => candle.high - candle.low));
}

export function calculateAtr(candles: NormalizedCandle[], period = 14): number {
  if (candles.length < 2) {
    return 0;
  }

  const window = candles.slice(-(Math.min(period, candles.length - 1) + 1));
  const ranges: number[] = [];

  for (let index = 1; index < window.length; index += 1) {
    const current = window[index];
    const previousClose = window[index - 1].close;
    ranges.push(
      Math.max(
        current.high - current.low,
        Math.abs(current.high - previousClose),
        Math.abs(current.low - previousClose),
      ),
    );
  }

  return average(ranges);
}

export function calculateEfficiencyRatio(candles: NormalizedCandle[]): number {
  if (candles.length < 2) {
    return 0;
  }

  const closes = candles.map((candle) => candle.close);
  const netMove = Math.abs(closes[closes.length - 1] - closes[0]);
  let totalMove = 0;

  for (let index = 1; index < closes.length; index += 1) {
    totalMove += Math.abs(closes[index] - closes[index - 1]);
  }

  return totalMove === 0 ? 0 : netMove / totalMove;
}

export function calculateDirectionChangeRatio(candles: NormalizedCandle[]): number {
  if (candles.length < 3) {
    return 0;
  }

  const changes: number[] = [];

  for (let index = 1; index < candles.length; index += 1) {
    const move = candles[index].close - candles[index - 1].close;

    if (move !== 0) {
      changes.push(Math.sign(move));
    }
  }

  if (changes.length < 2) {
    return 0;
  }

  let flips = 0;

  for (let index = 1; index < changes.length; index += 1) {
    if (changes[index] !== changes[index - 1]) {
      flips += 1;
    }
  }

  return flips / (changes.length - 1);
}

export function calculateVolumeRatio(
  candles: NormalizedCandle[],
  recentCount = 6,
  baselineCount = 20,
): number | null {
  const recent = candles
    .slice(-recentCount)
    .map((candle) => candle.volume)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const baseline = candles
    .slice(-baselineCount)
    .map((candle) => candle.volume)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  if (recent.length === 0 || baseline.length === 0) {
    return null;
  }

  const baselineAverage = average(baseline);

  return baselineAverage === 0 ? null : average(recent) / baselineAverage;
}

export function calculateSlope(candles: NormalizedCandle[], lookback = 6): number {
  if (candles.length < 2) {
    return 0;
  }

  const window = candles.slice(-(Math.min(lookback, candles.length - 1) + 1));
  const first = window[0];
  const last = window[window.length - 1];
  const scale = Math.max(calculateAverageRange(window), last.close * 0.001);

  return (last.close - first.close) / scale;
}

export function pickPreferredCandles(
  snapshot: TradingMarketDataSnapshot,
  preferredTimeframes: TradingTimeframe[],
  minimumCount = 1,
): { timeframe: TradingTimeframe | null; candles: NormalizedCandle[] } {
  for (const timeframe of preferredTimeframes) {
    const candles = getTimeframeCandles(snapshot, timeframe);

    if (candles.length >= minimumCount) {
      return { timeframe, candles };
    }
  }

  const timeframe = resolvePrimaryTimeframe(snapshot, preferredTimeframes);

  return {
    timeframe,
    candles: timeframe ? getTimeframeCandles(snapshot, timeframe) : [],
  };
}

export function coerceDirection(strength: number, threshold = 0.18): MarketDirection {
  if (strength > threshold) {
    return "long";
  }

  if (strength < -threshold) {
    return "short";
  }

  return "neutral";
}
