import { describe, expect, it } from "vitest";

import { runResearchMonteCarloFromSlices } from "@/lib/trading/research";
import type { TradingBacktestTrade } from "@/lib/trading/backtest/types";

function createTrade(id: number, pnlR: number, closedAt: string): TradingBacktestTrade {
  return {
    id: `trade-${id}`,
    instrument: "NAS100",
    setupType: "breakout_continuation",
    session: "ny_open",
    direction: "long",
    signalAt: closedAt,
    openedAt: closedAt,
    closedAt,
    entryPrice: 100,
    exitPrice: 100 + pnlR,
    triggerType: "close_confirm",
    triggerLevel: 100,
    invalidationLevel: 99,
    targetZone: null,
    riskPct: 1,
    riskRewardEstimate: 2,
    exitReason: pnlR >= 0 ? "target_hit" : "invalidation_hit",
    outcome: pnlR > 0 ? "win" : "loss",
    pnlR,
    pnlPct: pnlR,
    barsHeld: 3,
  };
}

describe("trading research monte carlo", () => {
  it("is deterministic and differentiates stronger slices from weaker ones", () => {
    const baselineTrades = [
      createTrade(1, 1.4, "2024-01-01T00:00:00.000Z"),
      createTrade(2, -1, "2024-01-02T00:00:00.000Z"),
      createTrade(3, 0.8, "2024-01-03T00:00:00.000Z"),
      createTrade(4, -1, "2024-01-04T00:00:00.000Z"),
      createTrade(5, 1.1, "2024-01-05T00:00:00.000Z"),
      createTrade(6, -1, "2024-01-06T00:00:00.000Z"),
      createTrade(7, 0.7, "2024-01-07T00:00:00.000Z"),
      createTrade(8, -1, "2024-01-08T00:00:00.000Z"),
    ];
    const currentTrades = [
      createTrade(11, 2.2, "2024-01-01T00:00:00.000Z"),
      createTrade(12, -1, "2024-01-02T00:00:00.000Z"),
      createTrade(13, 1.8, "2024-01-03T00:00:00.000Z"),
      createTrade(14, -0.8, "2024-01-04T00:00:00.000Z"),
      createTrade(15, 1.9, "2024-01-05T00:00:00.000Z"),
      createTrade(16, -0.7, "2024-01-06T00:00:00.000Z"),
      createTrade(17, 1.4, "2024-01-07T00:00:00.000Z"),
      createTrade(18, -0.6, "2024-01-08T00:00:00.000Z"),
    ];

    const first = runResearchMonteCarloFromSlices({
      baselineSlice: {
        trades: baselineTrades,
        evaluatedBars: 800,
      },
      currentSlice: {
        trades: currentTrades,
        evaluatedBars: 800,
      },
      iterations: 32,
      percentile: 0.15,
      seed: 1337,
      label: "nas100-stronger-slice",
    });
    const second = runResearchMonteCarloFromSlices({
      baselineSlice: {
        trades: baselineTrades,
        evaluatedBars: 800,
      },
      currentSlice: {
        trades: currentTrades,
        evaluatedBars: 800,
      },
      iterations: 32,
      percentile: 0.15,
      seed: 1337,
      label: "nas100-stronger-slice",
    });

    expect(first).toEqual(second);
    expect(first.current.expectancy).toBeGreaterThan(first.baseline.expectancy);
    expect(first.current.profitFactor ?? 0).toBeGreaterThan(first.baseline.profitFactor ?? 0);
    expect(first.diagnostics?.iterations).toBe(32);
    expect(first.diagnostics?.reshuffle.pessimisticDrawdown).toBeGreaterThanOrEqual(0);
  });
});
