import { describe, expect, it } from "vitest";

import { buildCalibrationScorecard, type CrisisValidationReport, type TradingBacktestComparativeReport } from "@/lib/trading/backtest";

function createComparativeReport(summary: {
  totalTrades: number;
  winRate: number;
  averageRiskReward: number;
  expectancy: number;
  profitFactor: number;
  maxDrawdown: number;
}): TradingBacktestComparativeReport {
  return {
    generatedAt: new Date().toISOString(),
    request: {
      periods: [],
      instruments: [],
      timeframes: ["4h", "1h", "15m"],
    },
    periods: [],
    aggregate: {
      summary: {
        totalTrades: summary.totalTrades,
        winRate: summary.winRate,
        averageRiskReward: summary.averageRiskReward,
        expectancy: summary.expectancy,
        maxDrawdown: summary.maxDrawdown,
        profitFactor: summary.profitFactor,
        tradeFrequency: 0,
        grossProfitPct: 0,
        grossLossPct: 0,
      },
      totals: {
        totalTrades: summary.totalTrades,
        evaluatedBars: 0,
        tradesByMarket: {},
      },
      insights: {
        strongestSetup: null,
        weakestSetup: null,
        strongestSession: null,
        weakestSession: null,
        strongestMarket: null,
        weakestMarket: null,
      },
    },
    comparisons: {
      byPeriod: {},
      byMarket: {},
      bySetup: {},
      bySession: {},
    },
  };
}

function createCrisisValidationReport(current: {
  totalTrades: number;
  winRate: number;
  averageRiskReward: number;
  expectancy: number;
  profitFactor: number;
  maxDrawdown: number;
}): CrisisValidationReport {
  return {
    aggregate: {
      baseline: current,
      current,
      delta: {
        totalTrades: 0,
        winRate: 0,
        expectancy: 0,
        profitFactor: 0,
        maxDrawdown: 0,
        grossProfitPct: 0,
        grossLossPct: 0,
      },
    },
    byPeriod: {},
  };
}

describe("buildCalibrationScorecard", () => {
  it("classifies strong but not elite systems conservatively", () => {
    const scorecard = buildCalibrationScorecard({
      currentComparative: createComparativeReport({
        totalTrades: 240,
        winRate: 44.4,
        averageRiskReward: 2.26,
        expectancy: 0.205,
        profitFactor: 1.57,
        maxDrawdown: 4.39,
      }),
      crisisValidation: createCrisisValidationReport({
        totalTrades: 88,
        winRate: 34.1,
        averageRiskReward: 2.39,
        expectancy: -0.068,
        profitFactor: 0.9815,
        maxDrawdown: 5.58,
      }),
    });

    expect(scorecard.cadence).toMatchObject({
      averageAnnualTrades: 240,
      targetAnnualTradesMin: 250,
      targetAnnualTradesMax: 300,
      status: "below_target",
    });
    expect(scorecard.assessment.currentTier).toBe("safe");
    expect(scorecard.assessment.maximumDefendableTierNow).toBe("below_safe");
    expect(scorecard.assessment.eliteTargetStatus).toBe("not_yet_defendable");
    expect(scorecard.blockers).toContain(
      "Crisis aggregate expectancy is still negative, which raises overfit risk.",
    );
  });
});
