import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runHistoricalTradingBacktest } from "@/lib/trading/backtest";

const INTERVAL_MS: Record<string, number> = {
  "4h": 4 * 60 * 60_000,
  "1h": 60 * 60_000,
  "15min": 15 * 60_000,
  "5min": 5 * 60_000,
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
    const base = 100 + index * 0.06;
    candles.push({
      datetime: new Date(cursor).toISOString(),
      open: base.toFixed(4),
      high: (base + 0.08).toFixed(4),
      low: (base - 0.06).toFixed(4),
      close: (base + 0.03).toFixed(4),
      volume: String(200 + index),
    });
    cursor += stepMs;
    index += 1;
  }

  return {
    values: candles,
  };
}

describe("trading historical backtest", () => {
  const originalKey = process.env.TWELVEDATA_API_KEY;

  beforeEach(() => {
    process.env.TWELVEDATA_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = new URL(String(input));
        const interval = url.searchParams.get("interval") ?? "15min";
        const startDate = url.searchParams.get("start_date") ?? "2026-03-01 00:00:00";
        const endDate = url.searchParams.get("end_date") ?? "2026-03-10 00:00:00";
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

  it(
    "loads historical data and runs the backtest runner on it",
    async () => {
      const run = await runHistoricalTradingBacktest({
        request: {
          instrument: "EURUSD",
        from: "2026-03-01T00:00:00.000Z",
        to: "2026-03-10T00:00:00.000Z",
        sourcePreference: "api_only",
      },
      backtest: {
        warmupBars: 12,
      },
    });

      expect(run.historicalDataset.metadata.instrument).toBe("EURUSD");
      expect(run.result.instrument).toBe("EURUSD");
      expect(run.result.steps.length).toBeGreaterThan(0);
      expect(run.result.report.period.barsProcessed).toBe(run.result.steps.length);
      expect(run.result.report.summary.totalTrades).toBe(run.result.trades.length);
    },
    15_000,
  );
});
