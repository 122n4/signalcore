import { describe, expect, it } from "vitest";

import {
  buildTradingMarketSessionStudyReport,
  type TradingBacktestComparativeReport,
} from "@/lib/trading/backtest";

import { createBacktestTradeFixture } from "./helpers/tradingBacktestFixtures";

describe("trading market session segmentation", () => {
  it("builds market-by-session diagnostics and ranks strong and weak blocks", () => {
    const eurusdNyWin = createBacktestTradeFixture({
      id: "eurusd-ny-win-1",
      instrument: "EURUSD",
      session: "ny_open",
      pnlR: 2.1,
      pnlPct: 1,
      outcome: "win",
      closedAt: "2026-03-10T15:00:00.000Z",
    });
    const eurusdNyWin2 = createBacktestTradeFixture({
      id: "eurusd-ny-win-2",
      instrument: "EURUSD",
      session: "ny_open",
      pnlR: 1.9,
      pnlPct: 0.9,
      outcome: "win",
      closedAt: "2026-03-11T15:00:00.000Z",
    });
    const eurusdLateLoss = createBacktestTradeFixture({
      id: "eurusd-late-loss-1",
      instrument: "EURUSD",
      session: "late_us",
      pnlR: -1,
      pnlPct: -0.5,
      outcome: "loss",
      closedAt: "2026-03-12T15:00:00.000Z",
    });
    const eurusdLateLoss2 = createBacktestTradeFixture({
      id: "eurusd-late-loss-2",
      instrument: "EURUSD",
      session: "late_us",
      pnlR: -0.8,
      pnlPct: -0.4,
      outcome: "loss",
      closedAt: "2026-03-13T15:00:00.000Z",
    });
    const gbpusdLondonWin = createBacktestTradeFixture({
      id: "gbpusd-london-win-1",
      instrument: "GBPUSD",
      session: "london_session",
      pnlR: 1.7,
      pnlPct: 0.85,
      outcome: "win",
      closedAt: "2026-03-14T15:00:00.000Z",
    });
    const gbpusdLondonLoss = createBacktestTradeFixture({
      id: "gbpusd-london-loss-1",
      instrument: "GBPUSD",
      session: "london_session",
      pnlR: -1,
      pnlPct: -0.5,
      outcome: "loss",
      closedAt: "2026-03-15T15:00:00.000Z",
    });

    const comparativeReport = {
      request: {
        periods: [
          { label: "2024", from: "2024-01-01T00:00:00.000Z", to: "2024-12-31T23:59:59.000Z" },
          { label: "2025", from: "2025-01-01T00:00:00.000Z", to: "2025-12-31T23:59:59.000Z" },
        ],
        instruments: ["EURUSD", "GBPUSD"],
        timeframes: ["4h", "1h", "15m"],
      },
      periods: [
        {
          period: { label: "2024", from: "2024-01-01T00:00:00.000Z", to: "2024-12-31T23:59:59.000Z" },
          report: {
            markets: [
              {
                instrument: "EURUSD",
                report: {
                  trades: [eurusdNyWin, eurusdLateLoss],
                },
              },
              {
                instrument: "GBPUSD",
                report: {
                  trades: [gbpusdLondonWin],
                },
              },
            ],
          },
        },
        {
          period: { label: "2025", from: "2025-01-01T00:00:00.000Z", to: "2025-12-31T23:59:59.000Z" },
          report: {
            markets: [
              {
                instrument: "EURUSD",
                report: {
                  trades: [eurusdNyWin2, eurusdLateLoss2],
                },
              },
              {
                instrument: "GBPUSD",
                report: {
                  trades: [gbpusdLondonLoss],
                },
              },
            ],
          },
        },
      ],
    } as TradingBacktestComparativeReport;

    const report = buildTradingMarketSessionStudyReport({
      comparativeReport,
      minimumSampleCount: 2,
      nestedMinimumSampleCount: 1,
    });

    expect(report.byMarket.EURUSD.strongestSession).toBe("ny_open");
    expect(report.byMarket.EURUSD.weakestSession).toBe("late_us");
    expect(report.byMarket.EURUSD.bySession.ny_open.aggregate.trades).toBe(2);
    expect(report.byMarket.EURUSD.bySession.late_us.aggregate.expectancy).toBeLessThan(0);
    expect(report.crossMarket.strongestBlocks[0]?.session).toBe("ny_open");
    expect(report.crossMarket.weakestBlocks[0]?.session).toBe("late_us");
    expect(report.byMarket.GBPUSD.bySession.london_session.bySetup.breakout_continuation).toBeDefined();
  });
});
