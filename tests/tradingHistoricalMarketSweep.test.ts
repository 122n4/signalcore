import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runTradingHistoricalMarketSweep } from "@/lib/trading/backtest";

const INTERVAL_MS: Record<string, number> = {
  "4h": 4 * 60 * 60_000,
  "1h": 60 * 60_000,
  "15min": 15 * 60_000,
};

function buildIntervalSeries(args: {
  interval: string;
  startDate: string;
  endDate: string;
  outputsize: number;
}) {
  const start = new Date(args.startDate.replace(" ", "T") + "Z").getTime();
  const end = new Date(args.endDate.replace(" ", "T") + "Z").getTime();
  const stepMs = INTERVAL_MS[args.interval] ?? INTERVAL_MS["15min"];
  const candles = [];
  let cursor = start;
  let index = 0;

  while (cursor <= end && index < Math.max(2, args.outputsize)) {
    const base = 100 + index * 0.05;
    candles.push({
      datetime: new Date(cursor).toISOString(),
      open: base.toFixed(4),
      high: (base + 0.06).toFixed(4),
      low: (base - 0.04).toFixed(4),
      close: (base + 0.025).toFixed(4),
      volume: String(150 + index),
    });
    cursor += stepMs;
    index += 1;
  }

  return { values: candles };
}

describe("trading historical market sweep", () => {
  const originalKey = process.env.TWELVEDATA_API_KEY;

  beforeEach(() => {
    process.env.TWELVEDATA_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = new URL(String(input));
        const interval = url.searchParams.get("interval") ?? "15min";
        const startDate = url.searchParams.get("start_date") ?? "2024-01-01 00:00:00";
        const endDate = url.searchParams.get("end_date") ?? "2024-03-01 00:00:00";
        const outputsize = Number(url.searchParams.get("outputsize") ?? "500");

        return {
          ok: true,
          status: 200,
          json: async () =>
            buildIntervalSeries({
              interval,
              startDate,
              endDate,
              outputsize,
            }),
        } as Response;
      }),
    );
  });

  afterEach(() => {
    process.env.TWELVEDATA_API_KEY = originalKey;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("runs the historical backtest sweep and produces an aggregate report by market", async () => {
    const report = await runTradingHistoricalMarketSweep({
      instruments: ["EURUSD", "BTCUSD"],
      from: "2024-01-01T00:00:00.000Z",
      to: "2024-03-01T00:00:00.000Z",
      timeframes: ["4h", "1h", "15m"],
      sourcePreference: "api_only",
      backtest: {
        warmupBars: 24,
      },
    });

    expect(report.markets).toHaveLength(2);
    expect(report.failures).toHaveLength(0);
    expect(report.aggregate.summary.totalTrades).toBeGreaterThanOrEqual(0);
    expect(Object.keys(report.aggregate.totals.tradesByMarket)).toEqual(["EURUSD", "BTCUSD"]);
    expect(report.aggregate.distributions.byMarket.EURUSD?.count).toBe(report.markets[0].report.summary.totalTrades);
  }, 90_000);
});
