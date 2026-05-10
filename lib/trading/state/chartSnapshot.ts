import type { TradingMarketDataSnapshot, TradingTimeframe } from "@/lib/trading/data";
import type { TradingChartSnapshot } from "./types";

const PREFERRED_TIMEFRAMES: TradingTimeframe[] = ["5m", "15m", "1m", "1h", "4h", "1d"];

export function composeTradingChartSnapshot(
  snapshot: TradingMarketDataSnapshot,
): TradingChartSnapshot {
  const timeframe =
    PREFERRED_TIMEFRAMES.find((candidate) => (snapshot.timeframes[candidate]?.length ?? 0) > 0) ??
    snapshot.availableTimeframes[0] ??
    null;

  return {
    instrument: snapshot.instrument,
    timeframe,
    snapshotAt: snapshot.snapshotAt,
    candles: timeframe ? [...(snapshot.timeframes[timeframe] ?? [])] : [],
  };
}
