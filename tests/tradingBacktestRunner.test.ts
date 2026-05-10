import { describe, expect, it } from "vitest";

import { runTradingBacktest, runTradingBacktestAsync } from "@/lib/trading/backtest";

import { createBacktestDatasetFixture } from "./helpers/tradingBacktestFixtures";

describe("trading backtest runner", () => {
  it("replays the engine candle-by-candle without future leakage", () => {
    const dataset = createBacktestDatasetFixture();
    const result = runTradingBacktest(dataset, {
      warmupBars: 10,
    });

    expect(result.primaryTimeframe).toBe("15m");
    expect(result.steps.length).toBe(23);
    expect(result.report.instrument).toBe("EURUSD");
    expect(result.report.summary.totalTrades).toBe(result.trades.length);

    for (const step of result.steps) {
      for (const timeframe of step.snapshot.availableTimeframes) {
        const candles = step.snapshot.timeframes[timeframe] ?? [];
        expect(candles.every((candle) => candle.timestamp <= step.asOf)).toBe(true);
      }
    }
  });

  it("supports mass backtest mode without retaining every step snapshot", () => {
    const dataset = createBacktestDatasetFixture();
    const result = runTradingBacktest(dataset, {
      warmupBars: 10,
      captureSteps: false,
    });

    expect(result.steps).toHaveLength(0);
    expect(result.report.period.barsProcessed).toBe(23);
    expect(result.report.summary.totalTrades).toBe(result.trades.length);
  });

  it("supports an async yielding mode without changing backtest results", async () => {
    const dataset = createBacktestDatasetFixture();
    const syncResult = runTradingBacktest(dataset, {
      warmupBars: 10,
      captureSteps: false,
    });
    const asyncResult = await runTradingBacktestAsync(
      dataset,
      {
        warmupBars: 10,
        captureSteps: false,
      },
      {
        yieldEveryBars: 1,
      },
    );

    expect(asyncResult.trades).toEqual(syncResult.trades);
    expect(asyncResult.report).toEqual(syncResult.report);
    expect(asyncResult.metrics).toEqual(syncResult.metrics);
  });
});
