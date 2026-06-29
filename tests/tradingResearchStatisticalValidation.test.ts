import { describe, expect, it } from "vitest";

import { buildResearchStatisticalValidation } from "@/lib/trading/research";
import type { TradingBacktestTrade } from "@/lib/trading/backtest/types";

import { createMetricSummary } from "./helpers/tradingResearchFixtures";

function createTrade(id: string, pnlPct: number, closedAt: string): TradingBacktestTrade {
  return {
    id,
    instrument: "NAS100",
    setupType: "breakout_continuation",
    session: "ny_open",
    direction: "long",
    signalAt: closedAt,
    openedAt: closedAt,
    closedAt,
    entryPrice: 100,
    exitPrice: 100 + pnlPct,
    triggerType: "close_confirm",
    triggerLevel: 100,
    invalidationLevel: 99,
    targetZone: null,
    riskPct: 1,
    riskRewardEstimate: pnlPct > 0 ? 2 : 1,
    exitReason: pnlPct > 0 ? "target_hit" : "invalidation_hit",
    outcome: pnlPct > 0 ? "win" : "loss",
    pnlR: pnlPct,
    pnlPct,
    barsHeld: 3,
  };
}

describe("trading research statistical validation", () => {
  it("returns insufficient-data status for small samples", () => {
    const baselineTrades = Array.from({ length: 8 }, (_, index) =>
      createTrade(`b-${index}`, index % 2 === 0 ? 0.4 : -0.2, `2026-01-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`),
    );
    const currentTrades = Array.from({ length: 8 }, (_, index) =>
      createTrade(`c-${index}`, index % 3 === 0 ? 0.7 : -0.1, `2026-02-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`),
    );

    const result = buildResearchStatisticalValidation({
      baselineTrades,
      currentTrades,
      aggregateCurrent: createMetricSummary({ expectancy: 0.18, profitFactor: 1.4 }),
      walkForwardCurrent: createMetricSummary({ expectancy: 0.05, profitFactor: 1.02 }),
      robustness: null,
      independentTrialCount: 4,
    });

    expect(result.sample_size).toBe(8);
    expect(result.deflated_sharpe_ratio).toBeNull();
    expect(result.pbo.risk_band).toBe("insufficient_data");
    expect(result.white_reality_check.adjusted_p_value).toBeNull();
  });

  it("computes institutional statistical diagnostics for sufficiently large samples", () => {
    const baselineTrades = Array.from({ length: 30 }, (_, index) =>
      createTrade(
        `b-${index}`,
        index % 4 === 0 ? 0.2 : index % 5 === 0 ? -0.35 : 0.05,
        `2026-03-${String((index % 28) + 1).padStart(2, "0")}T00:00:00.000Z`,
      ),
    );
    const currentTrades = Array.from({ length: 30 }, (_, index) =>
      createTrade(
        `c-${index}`,
        index % 6 === 0 ? -0.25 : 0.55,
        `2026-04-${String((index % 28) + 1).padStart(2, "0")}T00:00:00.000Z`,
      ),
    );

    const result = buildResearchStatisticalValidation({
      baselineTrades,
      currentTrades,
      aggregateCurrent: createMetricSummary({ expectancy: 0.28, profitFactor: 1.8 }),
      walkForwardCurrent: createMetricSummary({ expectancy: 0.11, profitFactor: 1.09 }),
      robustness: {
        holdout: {
          baseline: createMetricSummary({ expectancy: 0.03, profitFactor: 1.01 }),
          current: createMetricSummary({ expectancy: 0.07, profitFactor: 1.04 }),
        },
        perturbation: {
          baseline: createMetricSummary({ expectancy: 0.02, profitFactor: 1.01 }),
          current: createMetricSummary({ expectancy: 0.06, profitFactor: 1.03 }),
        },
      },
      independentTrialCount: 6,
      bootstrapIterations: 128,
      seed: 42,
    });

    expect(result.sample_size).toBe(30);
    expect(result.trade_level_sharpe_ratio).not.toBeNull();
    expect(result.deflated_sharpe_ratio).not.toBeNull();
    expect(result.pbo.value).not.toBeNull();
    expect(result.white_reality_check.adjusted_p_value).not.toBeNull();
    expect(result.diagnostics.out_of_sample_checks.length).toBeGreaterThanOrEqual(3);
  });
});
