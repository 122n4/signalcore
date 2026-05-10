import { describe, expect, it } from "vitest";

import { computeBacktestMetrics } from "@/lib/trading/backtest";

import { createBacktestTradeFixture } from "./helpers/tradingBacktestFixtures";

describe("trading backtest metrics", () => {
  it("computes core metrics and distributions", () => {
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
        riskRewardEstimate: 2,
      }),
      createBacktestTradeFixture({
        id: "EURUSD:trade:3",
        setupType: "breakout_continuation",
        session: "ny_open",
        outcome: "scratch",
        exitReason: "technical_exit",
        pnlR: 0,
        pnlPct: 0,
        riskRewardEstimate: 2.4,
      }),
    ];

    const metrics = computeBacktestMetrics({
      trades,
      evaluatedBars: 30,
      equityValues: [100, 100.845, 100.345, 100.345],
    });

    expect(metrics.tradeCount).toBe(3);
    expect(metrics.winRate).toBeCloseTo(33.3333, 3);
    expect(metrics.averageRiskReward).toBeCloseTo(2.2, 4);
    expect(metrics.expectancy).toBeCloseTo(0.23, 2);
    expect(metrics.maxDrawdown).toBeCloseTo(0.5, 4);
    expect(metrics.profitFactor).toBeCloseTo(1.69, 2);
    expect(metrics.tradeFrequency.tradesPer100Bars).toBe(10);
    expect(metrics.distributions.bySetup.breakout_continuation?.count).toBe(2);
    expect(metrics.distributions.bySession.ny_open?.count).toBe(2);
  });
});
