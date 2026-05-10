import { describe, expect, it } from "vitest";

import { buildBacktestReport, computeBacktestMetrics } from "@/lib/trading/backtest";

import { createBacktestStepFixture, createBacktestTradeFixture } from "./helpers/tradingBacktestFixtures";

describe("trading backtest report", () => {
  it("builds a structured report with setup and session insights", () => {
    const steps = [createBacktestStepFixture()];
    const trades = [
      createBacktestTradeFixture(),
      createBacktestTradeFixture({
        id: "EURUSD:trade:2",
        setupType: "trend_pullback",
        session: "london_session",
        outcome: "loss",
        exitReason: "invalidation_hit",
        pnlR: -1,
        pnlPct: -0.5,
        riskRewardEstimate: 1.8,
      }),
    ];
    const metrics = computeBacktestMetrics({
      trades,
      evaluatedBars: 20,
      equityValues: [100, 100.845, 100.345],
    });
    const report = buildBacktestReport({
      instrument: "EURUSD",
      marketType: "forex",
      sessionProfile: "forex",
      primaryTimeframe: "15m",
      warmupBars: 10,
      periodFrom: steps[0].asOf,
      periodTo: steps.at(-1)?.asOf ?? null,
      barsProcessed: steps.length,
      evaluatedBars: 20,
      trades,
      metrics,
    });

    expect(report.summary.totalTrades).toBe(2);
    expect(report.insights.strongestSetup).toBe("breakout_continuation");
    expect(report.insights.weakestSession).toBe("london_session");
    expect(report.distributions.bySession.ny_open?.count).toBe(1);
  });
});
