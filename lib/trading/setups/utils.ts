import { getTimeframeCandles, resolvePrimaryTimeframe, type NormalizedCandle } from "@/lib/trading/data";

import type {
  OpportunityWindowState,
  SetupContext,
  SetupEngineInput,
  SetupMaturityState,
  SetupOutput,
} from "./types";

type ResolvedSetupContext = SetupContext & {
  candles: NormalizedCandle[];
  latestCandle: NormalizedCandle | null;
  previousCandle: NormalizedCandle | null;
  recentHigh: number | null;
  recentLow: number | null;
  contextHigh: number | null;
  contextLow: number | null;
};

const PREFERRED_SETUP_TIMEFRAMES = ["15m", "5m", "1h", "1m", "4h", "1d"] as const;

export function clampPercentage(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function roundLevel(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.round(value * 10_000) / 10_000;
}

export function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

export function createSetupContext(input: SetupEngineInput): SetupContext {
  const timeframe = resolvePrimaryTimeframe(input.snapshot, [...PREFERRED_SETUP_TIMEFRAMES]);
  const candles = timeframe ? getTimeframeCandles(input.snapshot, timeframe) : [];
  const latestPrice = candles.length > 0 ? candles[candles.length - 1].close : null;

  return {
    snapshot: input.snapshot,
    market: input.market,
    timeframe,
    latestPrice,
  };
}

export function resolveSetupContext(input: SetupEngineInput | SetupContext): ResolvedSetupContext {
  const context =
    "timeframe" in input && "latestPrice" in input ? input : createSetupContext(input);
  const candles = context.timeframe ? getTimeframeCandles(context.snapshot, context.timeframe) : [];
  const latestCandle = candles.length > 0 ? candles[candles.length - 1] : null;
  const previousCandle = candles.length > 1 ? candles[candles.length - 2] : null;
  const contextWindow = candles.slice(-10, -1);
  const recentWindow = candles.slice(-6);

  return {
    ...context,
    candles,
    latestCandle,
    previousCandle,
    recentHigh:
      recentWindow.length > 0 ? Math.max(...recentWindow.map((candle) => candle.high)) : null,
    recentLow: recentWindow.length > 0 ? Math.min(...recentWindow.map((candle) => candle.low)) : null,
    contextHigh:
      contextWindow.length > 0 ? Math.max(...contextWindow.map((candle) => candle.high)) : null,
    contextLow:
      contextWindow.length > 0 ? Math.min(...contextWindow.map((candle) => candle.low)) : null,
  };
}

export function resolveDirectionalLevels(
  direction: SetupOutput["direction"],
  latestCandle: NormalizedCandle | null,
  recentHigh: number | null,
  recentLow: number | null,
): { triggerLevel: number | null; invalidationLevel: number | null } {
  if (!latestCandle || direction === "neutral") {
    return {
      triggerLevel: null,
      invalidationLevel: null,
    };
  }

  if (direction === "long") {
    return {
      triggerLevel: roundLevel(Math.max(latestCandle.high, recentHigh ?? latestCandle.high)),
      invalidationLevel: roundLevel(Math.min(latestCandle.low, recentLow ?? latestCandle.low)),
    };
  }

  return {
    triggerLevel: roundLevel(Math.min(latestCandle.low, recentLow ?? latestCandle.low)),
    invalidationLevel: roundLevel(Math.max(latestCandle.high, recentHigh ?? latestCandle.high)),
  };
}

export function getDirectionalProgress(
  direction: SetupOutput["direction"],
  latestPrice: number | null,
  triggerLevel: number | null | undefined,
  invalidationLevel: number | null | undefined,
): { riskDistance: number; progressToTrigger: number } | null {
  if (
    direction === "neutral" ||
    latestPrice === null ||
    typeof triggerLevel !== "number" ||
    typeof invalidationLevel !== "number"
  ) {
    return null;
  }

  const riskDistance = Math.abs(triggerLevel - invalidationLevel);

  if (riskDistance <= 0) {
    return null;
  }

  const progressToTrigger =
    direction === "long"
      ? (latestPrice - invalidationLevel) / riskDistance
      : (invalidationLevel - latestPrice) / riskDistance;

  return {
    riskDistance,
    progressToTrigger,
  };
}

export function isSetupInvalid(
  direction: SetupOutput["direction"],
  latestPrice: number | null,
  invalidationLevel: number | null | undefined,
): boolean {
  if (
    direction === "neutral" ||
    latestPrice === null ||
    typeof invalidationLevel !== "number"
  ) {
    return true;
  }

  return direction === "long" ? latestPrice <= invalidationLevel : latestPrice >= invalidationLevel;
}

export function mapMaturityStateScore(state: SetupMaturityState): number {
  switch (state) {
    case "forming":
      return 38;
    case "developing":
      return 58;
    case "ready":
      return 78;
    case "late":
      return 42;
    case "invalid":
      return 10;
  }
}

export function mapWindowStateScore(state: OpportunityWindowState): number {
  switch (state) {
    case "forming":
      return 40;
    case "opening":
      return 62;
    case "active":
      return 82;
    case "degrading":
      return 44;
    case "closed":
      return 10;
  }
}
