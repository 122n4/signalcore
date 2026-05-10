import { describe, expect, it } from "vitest";

import { analyzeResearchPortfolioStress, evaluateResearchPortfolioStress } from "@/lib/trading/research";
import type { TradingBacktestTrade } from "@/lib/trading/backtest/types";

import { createResearchConfig, createResearchTempDir } from "./helpers/tradingResearchFixtures";

function createTrade(args: {
  id: string;
  instrument: string;
  openedAt: string;
  closedAt: string;
  pnlPct: number;
}): TradingBacktestTrade {
  return {
    id: args.id,
    instrument: args.instrument,
    setupType: "breakout_continuation",
    session: "ny_open",
    direction: "long",
    signalAt: args.openedAt,
    openedAt: args.openedAt,
    closedAt: args.closedAt,
    entryPrice: 100,
    exitPrice: 100 + args.pnlPct,
    triggerType: "close_confirm",
    triggerLevel: 100,
    invalidationLevel: 99,
    targetZone: null,
    riskPct: 1,
    riskRewardEstimate: args.pnlPct > 0 ? 2 : 1,
    exitReason: args.pnlPct > 0 ? "target_hit" : "invalidation_hit",
    outcome: args.pnlPct > 0 ? "win" : "loss",
    pnlR: args.pnlPct,
    pnlPct: args.pnlPct,
    barsHeld: 3,
  };
}

describe("trading research portfolio stress", () => {
  it("detects overlap clusters and stressed drawdown from concurrent trades", () => {
    const diagnostics = analyzeResearchPortfolioStress(
      [
        createTrade({
          id: "a",
          instrument: "NAS100",
          openedAt: "2026-03-21T10:00:00.000Z",
          closedAt: "2026-03-21T12:00:00.000Z",
          pnlPct: 1.2,
        }),
        createTrade({
          id: "b",
          instrument: "US500",
          openedAt: "2026-03-21T11:00:00.000Z",
          closedAt: "2026-03-21T13:00:00.000Z",
          pnlPct: -1,
        }),
        createTrade({
          id: "c",
          instrument: "EURUSD",
          openedAt: "2026-03-21T14:00:00.000Z",
          closedAt: "2026-03-21T15:00:00.000Z",
          pnlPct: 0.4,
        }),
      ],
      300,
    );

    expect(diagnostics.cluster_count).toBe(2);
    expect(diagnostics.overlapping_trade_count).toBe(2);
    expect(diagnostics.overlap_ratio).toBeCloseTo(0.6667, 4);
    expect(diagnostics.max_concurrent_trades).toBe(2);
    expect(diagnostics.stressed_max_drawdown).toBeGreaterThan(0);
  });

  it("fails portfolio stress when overlap and drawdown exceed configured tolerances", async () => {
    const config = await createResearchConfig(await createResearchTempDir());
    const result = evaluateResearchPortfolioStress({
      config,
      baselineTrades: [
        createTrade({
          id: "base-a",
          instrument: "NAS100",
          openedAt: "2026-03-21T10:00:00.000Z",
          closedAt: "2026-03-21T11:00:00.000Z",
          pnlPct: 0.8,
        }),
      ],
      baselineEvaluatedBars: 200,
      currentTrades: [
        createTrade({
          id: "cur-a",
          instrument: "NAS100",
          openedAt: "2026-03-21T10:00:00.000Z",
          closedAt: "2026-03-21T12:00:00.000Z",
          pnlPct: -1.2,
        }),
        createTrade({
          id: "cur-b",
          instrument: "US500",
          openedAt: "2026-03-21T10:30:00.000Z",
          closedAt: "2026-03-21T12:30:00.000Z",
          pnlPct: -0.9,
        }),
        createTrade({
          id: "cur-c",
          instrument: "XAUUSD",
          openedAt: "2026-03-21T10:45:00.000Z",
          closedAt: "2026-03-21T12:15:00.000Z",
          pnlPct: 0.6,
        }),
        createTrade({
          id: "cur-d",
          instrument: "EURUSD",
          openedAt: "2026-03-21T11:00:00.000Z",
          closedAt: "2026-03-21T11:30:00.000Z",
          pnlPct: 0.3,
        }),
      ],
      currentEvaluatedBars: 200,
    });

    expect(result?.passes).toBe(false);
    expect(result?.current.max_concurrent_trades).toBeGreaterThan(3);
    expect(result?.reason).toContain("Portfolio stress failed");
  });
});
