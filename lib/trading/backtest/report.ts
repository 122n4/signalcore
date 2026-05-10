import type { TradingBacktestMetrics, TradingBacktestReport, TradingBacktestResult, TradingBacktestTrade } from "./types";

function roundMetric(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function resolveStrongWeak<TKey extends string>(
  distributions: Partial<Record<TKey, { expectancy: number; count: number }>>,
): {
  strongest: TKey | null;
  weakest: TKey | null;
} {
  const candidates = Object.entries(distributions)
    .filter((entry): entry is [TKey, { expectancy: number; count: number }] => Boolean(entry[0] && entry[1]))
    .filter(([, bucket]) => bucket.count > 0);

  if (candidates.length === 0) {
    return {
      strongest: null,
      weakest: null,
    };
  }

  const strongest = [...candidates].sort((left, right) => right[1].expectancy - left[1].expectancy)[0][0];
  const weakest = [...candidates].sort((left, right) => left[1].expectancy - right[1].expectancy)[0][0];

  return {
    strongest,
    weakest,
  };
}

export function buildBacktestReport(args: {
  instrument: string;
  marketType: TradingBacktestResult["marketType"];
  sessionProfile: TradingBacktestResult["sessionProfile"];
  primaryTimeframe: TradingBacktestResult["primaryTimeframe"];
  warmupBars: number;
  periodFrom: string | null;
  periodTo: string | null;
  barsProcessed: number;
  evaluatedBars: number;
  trades: TradingBacktestTrade[];
  metrics: TradingBacktestMetrics;
}): TradingBacktestReport {
  const {
    instrument,
    marketType,
    sessionProfile,
    primaryTimeframe,
    warmupBars,
    periodFrom,
    periodTo,
    barsProcessed,
    evaluatedBars,
    trades,
    metrics,
  } = args;
  const strongestWeakestSetup = resolveStrongWeak(metrics.distributions.bySetup);
  const strongestWeakestSession = resolveStrongWeak(metrics.distributions.bySession);

  return {
    instrument,
    marketType,
    sessionProfile,
    primaryTimeframe,
    period: {
      from: periodFrom,
      to: periodTo,
      barsProcessed,
      evaluatedBars,
      warmupBars,
    },
    summary: {
      totalTrades: trades.length,
      winRate: metrics.winRate,
      averageRiskReward: metrics.averageRiskReward,
      expectancy: metrics.expectancy,
      maxDrawdown: metrics.maxDrawdown,
      profitFactor: metrics.profitFactor,
      tradeFrequency: roundMetric(metrics.tradeFrequency.tradesPer100Bars),
      grossProfitPct: metrics.grossProfitPct,
      grossLossPct: metrics.grossLossPct,
    },
    distributions: metrics.distributions,
    insights: {
      strongestSetup: strongestWeakestSetup.strongest,
      weakestSetup: strongestWeakestSetup.weakest,
      strongestSession: strongestWeakestSession.strongest,
      weakestSession: strongestWeakestSession.weakest,
    },
    trades,
  };
}
