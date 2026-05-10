import {
  createTradingMarketDataSnapshot,
  type TradingCandleInput,
  type TradingMarketDataSnapshot,
  type TradingMarketType,
  type TradingSessionProfile,
  type TradingTimeframe,
} from "@/lib/trading/data";

type BuildSequenceCandlesOptions = {
  closes: number[];
  ranges?: number[];
  opens?: number[];
  volumeSeries?: Array<number | null>;
  start?: string;
  stepMinutes?: number;
};

type CreateTradingSnapshotOptions = {
  instrument?: string;
  marketType?: TradingMarketType;
  sessionProfile?: TradingSessionProfile;
  snapshotAt?: string;
  timeframes: Partial<Record<TradingTimeframe, TradingCandleInput[]>>;
};

export function buildSequenceCandles(
  options: BuildSequenceCandlesOptions,
): TradingCandleInput[] {
  const {
    closes,
    ranges = closes.map(() => 1),
    opens,
    volumeSeries,
    start = "2026-03-10T09:00:00.000Z",
    stepMinutes = 15,
  } = options;
  const startAt = new Date(start).getTime();

  return closes.map((close, index) => {
    const open = opens?.[index] ?? (index === 0 ? close - 0.4 : closes[index - 1]);
    const range = ranges[index] ?? ranges[ranges.length - 1] ?? 1;
    const high = Math.max(open, close) + range / 2;
    const low = Math.min(open, close) - range / 2;
    const volume = volumeSeries?.[index] ?? 1000 + index * 25;

    return {
      timestamp: new Date(startAt + index * stepMinutes * 60_000).toISOString(),
      open,
      high,
      low,
      close,
      volume,
    };
  });
}

export function createTradingSnapshot(
  options: CreateTradingSnapshotOptions,
): TradingMarketDataSnapshot {
  return createTradingMarketDataSnapshot({
    instrument: options.instrument ?? "NVDA",
    marketType: options.marketType ?? "equities",
    sessionProfile: options.sessionProfile,
    snapshotAt: options.snapshotAt,
    timeframes: options.timeframes,
  });
}
