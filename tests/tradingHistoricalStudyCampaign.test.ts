import { describe, expect, it } from "vitest";

import {
  runTradingHistoricalStudyCampaign,
  type TradingBacktestComparativeReport,
  type TradingHistoricalPeriod,
} from "@/lib/trading/backtest";

function createComparativeReportFixture(args: {
  label: string;
  totalTrades: number;
  strongestMarket: string | null;
  weakestMarket: string | null;
  expectancyByMarket: Record<string, number>;
  profitFactorByMarket: Record<string, number | null>;
}): TradingBacktestComparativeReport {
  const period: TradingHistoricalPeriod = {
    label: args.label,
    from: "2024-01-01T00:00:00.000Z",
    to: "2024-12-31T23:59:59.000Z",
  };
  const byMarket = Object.fromEntries(
    Object.entries(args.expectancyByMarket).map(([instrument, expectancy]) => [
      instrument,
      {
        instrument,
        summary: {
          totalTrades: Math.max(1, Math.round(args.totalTrades / Math.max(1, Object.keys(args.expectancyByMarket).length))),
          winRate: 50,
          averageRiskReward: 2,
          expectancy,
          maxDrawdown: 1,
          profitFactor: args.profitFactorByMarket[instrument] ?? null,
          tradeFrequency: 1,
          grossProfitPct: 1.5,
          grossLossPct: 1,
        },
        evaluatedBars: 1000,
        completedPeriods: [args.label],
        failedPeriods: [],
        strongestSetup: "breakout_continuation",
        weakestSetup: "failed_breakout",
        strongestSession: "ny_open",
        weakestSession: "late_us",
        dataSymbols: [instrument],
        usedProxyData: false,
        periods: {
          [args.label]: {
            totalTrades: 3,
            winRate: 50,
            averageRiskReward: 2,
            expectancy,
            maxDrawdown: 1,
            profitFactor: args.profitFactorByMarket[instrument] ?? null,
            tradeFrequency: 1,
            grossProfitPct: 1.5,
            grossLossPct: 1,
          },
        },
      },
    ]),
  ) as TradingBacktestComparativeReport["comparisons"]["byMarket"];

  return {
    generatedAt: "2026-03-15T00:00:00.000Z",
    request: {
      periods: [period],
      instruments: Object.keys(args.expectancyByMarket),
      timeframes: ["4h", "1h", "15m"],
    },
    periods: [
      {
        period,
        report: {
          generatedAt: "2026-03-15T00:00:00.000Z",
          request: {
            instruments: Object.keys(args.expectancyByMarket),
            from: period.from,
            to: period.to,
            timeframes: ["4h", "1h", "15m"],
          },
          markets: [],
          failures: [],
          aggregate: {
            summary: {
              totalTrades: args.totalTrades,
              winRate: 50,
              averageRiskReward: 2,
              expectancy: average(Object.values(args.expectancyByMarket)),
              maxDrawdown: 1,
              profitFactor: 1.2,
              tradeFrequency: 1,
              grossProfitPct: 2,
              grossLossPct: 1.2,
            },
            totals: {
              evaluatedBars: 1000,
              tradesByMarket: Object.fromEntries(
                Object.keys(args.expectancyByMarket).map((instrument) => [instrument, 3]),
              ),
            },
            distributions: {
              bySetup: {
                breakout_continuation: {
                  count: args.totalTrades,
                  wins: 2,
                  losses: 1,
                  scratches: 0,
                  winRate: 66.6667,
                  totalPnlR: 2,
                  totalPnlPct: 1.1,
                  expectancy: 0.3,
                },
              },
              bySession: {
                ny_open: {
                  count: args.totalTrades,
                  wins: 2,
                  losses: 1,
                  scratches: 0,
                  winRate: 66.6667,
                  totalPnlR: 2,
                  totalPnlPct: 1.1,
                  expectancy: 0.3,
                },
              },
              byMarket: {},
            },
            insights: {
              strongestSetup: "breakout_continuation",
              weakestSetup: "failed_breakout",
              strongestSession: "ny_open",
              weakestSession: "late_us",
              strongestMarket: args.strongestMarket,
              weakestMarket: args.weakestMarket,
            },
          },
        },
      },
    ],
    aggregate: {
      summary: {
        totalTrades: args.totalTrades,
        winRate: 50,
        averageRiskReward: 2,
        expectancy: average(Object.values(args.expectancyByMarket)),
        maxDrawdown: 1,
        profitFactor: 1.2,
        tradeFrequency: 1,
        grossProfitPct: 2,
        grossLossPct: 1.2,
      },
      totals: {
        totalTrades: args.totalTrades,
        evaluatedBars: 1000,
        tradesByMarket: Object.fromEntries(
          Object.keys(args.expectancyByMarket).map((instrument) => [instrument, 3]),
        ),
      },
      insights: {
        strongestSetup: "breakout_continuation",
        weakestSetup: "failed_breakout",
        strongestSession: "ny_open",
        weakestSession: "late_us",
        strongestMarket: args.strongestMarket,
        weakestMarket: args.weakestMarket,
      },
    },
    comparisons: {
      byPeriod: {
        [args.label]: {
          period,
          summary: {
            totalTrades: args.totalTrades,
            winRate: 50,
            averageRiskReward: 2,
            expectancy: average(Object.values(args.expectancyByMarket)),
            maxDrawdown: 1,
            profitFactor: 1.2,
            tradeFrequency: 1,
            grossProfitPct: 2,
            grossLossPct: 1.2,
          },
          evaluatedBars: 1000,
          tradesByMarket: Object.fromEntries(
            Object.keys(args.expectancyByMarket).map((instrument) => [instrument, 3]),
          ),
          failures: [],
          strongestMarket: args.strongestMarket,
          weakestMarket: args.weakestMarket,
        },
      },
      byMarket,
      bySetup: {
        breakout_continuation: {
          key: "breakout_continuation",
          summary: {
            count: args.totalTrades,
            wins: 2,
            losses: 1,
            scratches: 0,
            winRate: 66.6667,
            totalPnlR: 2,
            totalPnlPct: 1.1,
            expectancy: 0.3,
          },
          periods: {
            [args.label]: {
              count: args.totalTrades,
              wins: 2,
              losses: 1,
              scratches: 0,
              winRate: 66.6667,
              totalPnlR: 2,
              totalPnlPct: 1.1,
              expectancy: 0.3,
            },
          },
        },
      },
      bySession: {
        ny_open: {
          key: "ny_open",
          summary: {
            count: args.totalTrades,
            wins: 2,
            losses: 1,
            scratches: 0,
            winRate: 66.6667,
            totalPnlR: 2,
            totalPnlPct: 1.1,
            expectancy: 0.3,
          },
          periods: {
            [args.label]: {
              count: args.totalTrades,
              wins: 2,
              losses: 1,
              scratches: 0,
              winRate: 66.6667,
              totalPnlR: 2,
              totalPnlPct: 1.1,
              expectancy: 0.3,
            },
          },
        },
      },
    },
  };
}

function average(values: number[]): number {
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10_000) / 10_000;
}

describe("trading historical study campaign", () => {
  it("runs multiple studies and summarizes them by study and market", async () => {
    const studies = [
      {
        label: "yearly",
        periods: [{ label: "2024", from: "2024-01-01T00:00:00.000Z", to: "2024-12-31T23:59:59.000Z" }],
      },
      {
        label: "half_year",
        periods: [{ label: "H1-2024", from: "2024-01-01T00:00:00.000Z", to: "2024-06-30T23:59:59.000Z" }],
      },
    ];
    const reports = {
      yearly: createComparativeReportFixture({
        label: "2024",
        totalTrades: 20,
        strongestMarket: "EURUSD",
        weakestMarket: "GBPUSD",
        expectancyByMarket: { EURUSD: 0.4, GBPUSD: -0.1 },
        profitFactorByMarket: { EURUSD: 1.8, GBPUSD: 0.8 },
      }),
      half_year: createComparativeReportFixture({
        label: "H1-2024",
        totalTrades: 12,
        strongestMarket: "GBPUSD",
        weakestMarket: "EURUSD",
        expectancyByMarket: { EURUSD: 0.1, GBPUSD: 0.5 },
        profitFactorByMarket: { EURUSD: 1.1, GBPUSD: 1.9 },
      }),
    } as const;

    const report = await runTradingHistoricalStudyCampaign(
      {
        studies,
        instruments: ["EURUSD", "GBPUSD"],
        timeframes: ["4h", "1h", "15m"],
        sourcePreference: "local_only",
      },
      {
        runComparativeSweep: async (request) => reports[request.periods[0]?.label === "2024" ? "yearly" : "half_year"],
      },
    );

    expect(report.studies).toHaveLength(2);
    expect(report.summary.byStudy.yearly.totalTrades).toBe(20);
    expect(report.summary.byStudy.half_year.strongestMarket).toBe("GBPUSD");
    expect(report.summary.byMarket.EURUSD.strongestStudy).toBe("yearly");
    expect(report.summary.byMarket.GBPUSD.strongestStudy).toBe("half_year");
    expect(report.summary.byMarket.EURUSD.averageProfitFactor).toBe(1.45);
  });
});
