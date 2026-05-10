import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createTradingHistoricalYearPeriods,
  runTradingHistoricalComparativeSweep,
} from "@/lib/trading/backtest";

function buildIntervalSeries(interval: string, startDate: string) {
  const anchor = new Date(startDate.replace(" ", "T") + "Z");
  const candles =
    interval === "4h"
      ? Array.from({ length: 40 }, (_, index) => ({
          datetime: new Date(anchor.getTime() + index * 4 * 60 * 60_000).toISOString(),
          open: String(100 + index * 0.4),
          high: String(100.3 + index * 0.4),
          low: String(99.8 + index * 0.4),
          close: String(100.18 + index * 0.4),
          volume: "1000",
        }))
      : interval === "1h"
        ? Array.from({ length: 120 }, (_, index) => ({
            datetime: new Date(anchor.getTime() + index * 60 * 60_000).toISOString(),
            open: String(100 + index * 0.12),
            high: String(100.16 + index * 0.12),
            low: String(99.92 + index * 0.12),
            close: String(100.08 + index * 0.12),
            volume: "650",
          }))
        : Array.from({ length: 480 }, (_, index) => ({
            datetime: new Date(anchor.getTime() + index * 15 * 60_000).toISOString(),
            open: String(100 + index * 0.03),
            high: String(100.06 + index * 0.03),
            low: String(99.97 + index * 0.03),
            close: String(100.025 + index * 0.03),
            volume: "220",
          }));

  return { values: candles };
}

describe("trading historical comparative sweep", () => {
  const originalKey = process.env.TWELVEDATA_API_KEY;

  beforeEach(() => {
    process.env.TWELVEDATA_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = new URL(String(input));
        const interval = url.searchParams.get("interval") ?? "15min";
        const startDate = url.searchParams.get("start_date") ?? "2024-01-01 00:00:00";

        return {
          ok: true,
          status: 200,
          json: async () => buildIntervalSeries(interval, startDate),
        } as Response;
      }),
    );
  });

  afterEach(() => {
    process.env.TWELVEDATA_API_KEY = originalKey;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("builds comparable reports by period, market, setup, and session", async () => {
    const report = await runTradingHistoricalComparativeSweep({
      periods: createTradingHistoricalYearPeriods({
        startYear: 2023,
        endYear: 2024,
      }),
      instruments: ["EURUSD"],
      timeframes: ["4h", "1h", "15m"],
      sourcePreference: "api_only",
      backtest: {
        warmupBars: 24,
      },
    });

    expect(report.periods).toHaveLength(2);
    expect(report.comparisons.byPeriod["2023"]?.summary).toBeDefined();
    expect(report.comparisons.byMarket.EURUSD).toBeDefined();
    expect(report.comparisons.byMarket.EURUSD.periods["2024"]).not.toBeUndefined();
    expect(report.comparisons.bySetup).toBeTypeOf("object");
    expect(report.comparisons.bySession).toBeTypeOf("object");
  }, 45_000);
});
