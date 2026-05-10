import { describe, expect, it } from "vitest";

import {
  buildTradingSetupSegmentationReport,
  type TradingBacktestComparativeReport,
} from "@/lib/trading/backtest";

import { createBacktestTradeFixture } from "./helpers/tradingBacktestFixtures";

describe("trading setup segmentation report", () => {
  it("builds aggregate, market, and session metrics per setup type with a sample threshold", () => {
    const breakoutTrades = [
      createBacktestTradeFixture({
        id: "EURUSD:1",
        instrument: "EURUSD",
        setupType: "breakout_continuation",
        session: "ny_open",
        pnlR: 2,
        pnlPct: 1,
        riskRewardEstimate: 2.2,
        closedAt: "2026-01-01T10:00:00.000Z",
      }),
      createBacktestTradeFixture({
        id: "EURUSD:2",
        instrument: "EURUSD",
        setupType: "breakout_continuation",
        session: "ny_open",
        outcome: "loss",
        pnlR: -1,
        pnlPct: -0.5,
        riskRewardEstimate: 2.1,
        closedAt: "2026-01-02T10:00:00.000Z",
      }),
      createBacktestTradeFixture({
        id: "XAUUSD:1",
        instrument: "XAUUSD",
        setupType: "breakout_continuation",
        session: "london_session",
        pnlR: 1.5,
        pnlPct: 0.75,
        riskRewardEstimate: 2.5,
        closedAt: "2026-01-03T10:00:00.000Z",
      }),
    ];
    const failedBreakTrades = [
      createBacktestTradeFixture({
        id: "GBPUSD:1",
        instrument: "GBPUSD",
        setupType: "failed_breakout",
        session: "asia_flow",
        pnlR: 1.2,
        pnlPct: 0.6,
        riskRewardEstimate: 1.8,
        closedAt: "2026-01-04T10:00:00.000Z",
      }),
      createBacktestTradeFixture({
        id: "GBPUSD:2",
        instrument: "GBPUSD",
        setupType: "failed_breakout",
        session: "asia_flow",
        outcome: "loss",
        pnlR: -1,
        pnlPct: -0.5,
        riskRewardEstimate: 1.7,
        closedAt: "2026-01-05T10:00:00.000Z",
      }),
    ];

    const comparativeReport: TradingBacktestComparativeReport = {
      generatedAt: "2026-03-15T00:00:00.000Z",
      request: {
        periods: [{ label: "2025", from: "2025-01-01T00:00:00.000Z", to: "2025-12-31T23:59:59.000Z" }],
        instruments: ["EURUSD", "XAUUSD", "GBPUSD"],
        timeframes: ["4h", "1h", "15m"],
      },
      periods: [
        {
          period: { label: "2025", from: "2025-01-01T00:00:00.000Z", to: "2025-12-31T23:59:59.000Z" },
          report: {
            generatedAt: "2026-03-15T00:00:00.000Z",
            request: {
              instruments: ["EURUSD", "XAUUSD", "GBPUSD"],
              from: "2025-01-01T00:00:00.000Z",
              to: "2025-12-31T23:59:59.000Z",
              timeframes: ["4h", "1h", "15m"],
            },
            markets: [
              {
                instrument: "EURUSD",
                historical: {
                  instrument: "EURUSD",
                  dataSymbol: "EURUSD",
                  dataSymbolRelation: "direct",
                  dataSymbolLabel: null,
                  marketType: "forex",
                  sessionProfile: "forex",
                  source: "local_archive",
                  from: "2025-01-01T00:00:00.000Z",
                  to: "2025-12-31T23:59:59.000Z",
                  loadedAt: "2026-03-15T00:00:00.000Z",
                  timeframes: ["4h", "1h", "15m"],
                  candleCounts: { "4h": 10, "1h": 20, "15m": 40 },
                },
                report: {
                  instrument: "EURUSD",
                  marketType: "forex",
                  sessionProfile: "forex",
                  primaryTimeframe: "15m",
                  period: {
                    from: "2025-01-01T00:00:00.000Z",
                    to: "2025-12-31T23:59:59.000Z",
                    barsProcessed: 40,
                    evaluatedBars: 40,
                    warmupBars: 48,
                  },
                  summary: {
                    totalTrades: 2,
                    winRate: 50,
                    averageRiskReward: 2,
                    expectancy: 0.5,
                    maxDrawdown: 0.5,
                    profitFactor: 2,
                    tradeFrequency: 1,
                    grossProfitPct: 1,
                    grossLossPct: 0.5,
                  },
                  distributions: {
                    bySetup: {},
                    bySession: {},
                  },
                  insights: {
                    strongestSetup: "breakout_continuation",
                    weakestSetup: "breakout_continuation",
                    strongestSession: "ny_open",
                    weakestSession: "ny_open",
                  },
                  trades: breakoutTrades.slice(0, 2),
                },
              },
              {
                instrument: "XAUUSD",
                historical: {
                  instrument: "XAUUSD",
                  dataSymbol: "XAUUSD",
                  dataSymbolRelation: "direct",
                  dataSymbolLabel: null,
                  marketType: "forex",
                  sessionProfile: "forex",
                  source: "local_archive",
                  from: "2025-01-01T00:00:00.000Z",
                  to: "2025-12-31T23:59:59.000Z",
                  loadedAt: "2026-03-15T00:00:00.000Z",
                  timeframes: ["4h", "1h", "15m"],
                  candleCounts: { "4h": 10, "1h": 20, "15m": 40 },
                },
                report: {
                  instrument: "XAUUSD",
                  marketType: "forex",
                  sessionProfile: "forex",
                  primaryTimeframe: "15m",
                  period: {
                    from: "2025-01-01T00:00:00.000Z",
                    to: "2025-12-31T23:59:59.000Z",
                    barsProcessed: 40,
                    evaluatedBars: 40,
                    warmupBars: 48,
                  },
                  summary: {
                    totalTrades: 1,
                    winRate: 100,
                    averageRiskReward: 2.5,
                    expectancy: 1.5,
                    maxDrawdown: 0,
                    profitFactor: null,
                    tradeFrequency: 1,
                    grossProfitPct: 0.75,
                    grossLossPct: 0,
                  },
                  distributions: {
                    bySetup: {},
                    bySession: {},
                  },
                  insights: {
                    strongestSetup: "breakout_continuation",
                    weakestSetup: "breakout_continuation",
                    strongestSession: "london_session",
                    weakestSession: "london_session",
                  },
                  trades: breakoutTrades.slice(2),
                },
              },
              {
                instrument: "GBPUSD",
                historical: {
                  instrument: "GBPUSD",
                  dataSymbol: "GBPUSD",
                  dataSymbolRelation: "direct",
                  dataSymbolLabel: null,
                  marketType: "forex",
                  sessionProfile: "forex",
                  source: "local_archive",
                  from: "2025-01-01T00:00:00.000Z",
                  to: "2025-12-31T23:59:59.000Z",
                  loadedAt: "2026-03-15T00:00:00.000Z",
                  timeframes: ["4h", "1h", "15m"],
                  candleCounts: { "4h": 10, "1h": 20, "15m": 40 },
                },
                report: {
                  instrument: "GBPUSD",
                  marketType: "forex",
                  sessionProfile: "forex",
                  primaryTimeframe: "15m",
                  period: {
                    from: "2025-01-01T00:00:00.000Z",
                    to: "2025-12-31T23:59:59.000Z",
                    barsProcessed: 40,
                    evaluatedBars: 40,
                    warmupBars: 48,
                  },
                  summary: {
                    totalTrades: 2,
                    winRate: 50,
                    averageRiskReward: 1.75,
                    expectancy: 0.1,
                    maxDrawdown: 0.5,
                    profitFactor: 1.2,
                    tradeFrequency: 1,
                    grossProfitPct: 0.6,
                    grossLossPct: 0.5,
                  },
                  distributions: {
                    bySetup: {},
                    bySession: {},
                  },
                  insights: {
                    strongestSetup: "failed_breakout",
                    weakestSetup: "failed_breakout",
                    strongestSession: "asia_flow",
                    weakestSession: "asia_flow",
                  },
                  trades: failedBreakTrades,
                },
              },
            ],
            failures: [],
            aggregate: {
              summary: {
                totalTrades: 5,
                winRate: 60,
                averageRiskReward: 2,
                expectancy: 0.54,
                maxDrawdown: 0.5,
                profitFactor: 1.8,
                tradeFrequency: 1,
                grossProfitPct: 2.35,
                grossLossPct: 1,
              },
              totals: {
                evaluatedBars: 120,
                tradesByMarket: {
                  EURUSD: 2,
                  XAUUSD: 1,
                  GBPUSD: 2,
                },
              },
              distributions: {
                bySetup: {},
                bySession: {},
                byMarket: {},
              },
              insights: {
                strongestSetup: "breakout_continuation",
                weakestSetup: "failed_breakout",
                strongestSession: "ny_open",
                weakestSession: "asia_flow",
                strongestMarket: "EURUSD",
                weakestMarket: "GBPUSD",
              },
            },
          },
        },
      ],
      aggregate: {
        summary: {
          totalTrades: 5,
          winRate: 60,
          averageRiskReward: 2,
          expectancy: 0.54,
          maxDrawdown: 0.5,
          profitFactor: 1.8,
          tradeFrequency: 1,
          grossProfitPct: 2.35,
          grossLossPct: 1,
        },
        totals: {
          totalTrades: 5,
          evaluatedBars: 120,
          tradesByMarket: {
            EURUSD: 2,
            XAUUSD: 1,
            GBPUSD: 2,
          },
        },
        insights: {
          strongestSetup: "breakout_continuation",
          weakestSetup: "failed_breakout",
          strongestSession: "ny_open",
          weakestSession: "asia_flow",
          strongestMarket: "EURUSD",
          weakestMarket: "GBPUSD",
        },
      },
      comparisons: {
        byPeriod: {},
        byMarket: {},
        bySetup: {},
        bySession: {},
      },
    };

    const report = buildTradingSetupSegmentationReport({
      comparativeReport,
      minimumSampleCount: 2,
    });

    const breakout = report.setups.find((entry) => entry.setupType === "breakout_continuation");
    const failedBreak = report.setups.find((entry) => entry.setupType === "failed_breakout");

    expect(breakout?.aggregate.trades).toBe(3);
    expect(breakout?.byMarket.EURUSD?.trades).toBe(2);
    expect(breakout?.byMarket.XAUUSD).toBeUndefined();
    expect(breakout?.omitted.markets).toContain("XAUUSD");
    expect(breakout?.bySession.ny_open?.trades).toBe(2);
    expect(breakout?.aggregate.maxDrawdown).toBeGreaterThan(0);

    expect(failedBreak?.aggregate.trades).toBe(2);
    expect(failedBreak?.byMarket.GBPUSD?.trades).toBe(2);
    expect(failedBreak?.bySession.asia_flow?.trades).toBe(2);
  });
});
