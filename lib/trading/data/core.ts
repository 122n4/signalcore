import {
  TRADING_TIMEFRAMES,
  type NormalizedCandle,
  type TradingCandleInput,
  type TradingMarketDataInput,
  type TradingMarketDataSnapshot,
  type TradingMarketType,
  type TradingSessionProfile,
  type TradingTimeframe,
} from "./types";

const DEFAULT_TIMEFRAME_ORDER: TradingTimeframe[] = ["15m", "5m", "1h", "4h", "1d", "1m"];

function toIsoTimestamp(value: string | number | Date | undefined): string {
  const date = value ? new Date(value) : new Date();

  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid trading timestamp.");
  }

  return date.toISOString();
}

function resolveSessionProfile(
  marketType: TradingMarketType,
  sessionProfile?: TradingSessionProfile,
): TradingSessionProfile {
  if (sessionProfile) {
    return sessionProfile;
  }

  if (marketType === "equities") {
    return "ny_equities";
  }

  return marketType;
}

export function normalizeTradingCandle(input: TradingCandleInput): NormalizedCandle {
  const open = Number(input.open);
  const close = Number(input.close);
  const high = Number(input.high);
  const low = Number(input.low);
  const volumeValue =
    input.volume === null || input.volume === undefined ? null : Number(input.volume);
  const sanitizedHigh = Math.max(open, close, high, low);
  const sanitizedLow = Math.min(open, close, high, low);

  return {
    timestamp: toIsoTimestamp(input.timestamp),
    open,
    high: sanitizedHigh,
    low: sanitizedLow,
    close,
    volume:
      volumeValue === null || Number.isNaN(volumeValue) || volumeValue < 0 ? null : volumeValue,
  };
}

function normalizeSeries(candles: TradingCandleInput[] | undefined): NormalizedCandle[] {
  if (!candles || candles.length === 0) {
    return [];
  }

  const deduped = new Map<string, NormalizedCandle>();

  for (const candle of candles) {
    const normalized = normalizeTradingCandle(candle);
    deduped.set(normalized.timestamp, normalized);
  }

  return Array.from(deduped.values()).sort((left, right) =>
    left.timestamp.localeCompare(right.timestamp),
  );
}

export function createTradingMarketDataSnapshot(
  input: TradingMarketDataInput,
): TradingMarketDataSnapshot {
  const timeframes: TradingMarketDataSnapshot["timeframes"] = {};

  for (const timeframe of TRADING_TIMEFRAMES) {
    const normalized = normalizeSeries(input.timeframes[timeframe]);

    if (normalized.length > 0) {
      timeframes[timeframe] = normalized;
    }
  }

  const availableTimeframes = TRADING_TIMEFRAMES.filter(
    (timeframe) => (timeframes[timeframe] ?? []).length > 0,
  );
  const latestCandleTimestamp =
    availableTimeframes.length > 0
      ? (timeframes[availableTimeframes[0]] ?? []).at(-1)?.timestamp
      : undefined;

  return {
    instrument: input.instrument.trim().toUpperCase(),
    marketType: input.marketType,
    sessionProfile: resolveSessionProfile(input.marketType, input.sessionProfile),
    snapshotAt: toIsoTimestamp(input.snapshotAt ?? latestCandleTimestamp),
    timeframes,
    availableTimeframes,
  };
}

export function getTimeframeCandles(
  snapshot: TradingMarketDataSnapshot,
  timeframe: TradingTimeframe,
): NormalizedCandle[] {
  return snapshot.timeframes[timeframe] ?? [];
}

export function resolvePrimaryTimeframe(
  snapshot: TradingMarketDataSnapshot,
  preferredOrder: TradingTimeframe[] = DEFAULT_TIMEFRAME_ORDER,
): TradingTimeframe | null {
  for (const timeframe of preferredOrder) {
    if ((snapshot.timeframes[timeframe] ?? []).length > 0) {
      return timeframe;
    }
  }

  return null;
}
