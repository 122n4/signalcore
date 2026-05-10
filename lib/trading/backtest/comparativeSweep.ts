import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { SessionState } from "@/lib/trading/market";
import type { SetupType } from "@/lib/trading/setups";

import { computeBacktestMetrics } from "./metrics";
import {
  runTradingHistoricalMarketSweep,
  type TradingBacktestAggregateReport,
  type TradingBacktestMarketSweepRequest,
} from "./marketSweep";
import type { TradingHistoricalDatasetCachePolicy } from "./archive";
import type { TradingHistoricalPeriod } from "./periods";
import type {
  TradingBacktestConfig,
  TradingBacktestDistributionBucket,
  TradingBacktestTrade,
} from "./types";
import type { TradingHistoricalSourcePreference } from "./datasets";

export type TradingBacktestComparativeSweepRequest = {
  periods: TradingHistoricalPeriod[];
  instruments?: string[];
  timeframes?: TradingBacktestMarketSweepRequest["timeframes"];
  backtest?: TradingBacktestConfig;
  continueOnError?: boolean;
  cachePolicy?: TradingHistoricalDatasetCachePolicy;
  cacheDir?: string | null;
  sourcePreference?: TradingHistoricalSourcePreference;
};

type ComparativeSummary = {
  totalTrades: number;
  winRate: number;
  averageRiskReward: number | null;
  expectancy: number;
  maxDrawdown: number;
  profitFactor: number | null;
  tradeFrequency: number;
  grossProfitPct: number;
  grossLossPct: number;
};

export type TradingBacktestComparativePeriodResult = {
  period: TradingHistoricalPeriod;
  report: TradingBacktestAggregateReport;
};

export type TradingBacktestComparativePeriodSummary = {
  period: TradingHistoricalPeriod;
  summary: ComparativeSummary;
  evaluatedBars: number;
  tradesByMarket: Record<string, number>;
  failures: TradingBacktestAggregateReport["failures"];
  strongestMarket: string | null;
  weakestMarket: string | null;
};

export type TradingBacktestComparativeMarketSummary = {
  instrument: string;
  summary: ComparativeSummary;
  evaluatedBars: number;
  completedPeriods: string[];
  failedPeriods: string[];
  strongestSetup: SetupType | null;
  weakestSetup: SetupType | null;
  strongestSession: SessionState | null;
  weakestSession: SessionState | null;
  dataSymbols: string[];
  usedProxyData: boolean;
  periods: Record<string, ComparativeSummary | null>;
};

export type TradingBacktestComparativeBucketSummary<TKey extends string> = {
  key: TKey;
  summary: TradingBacktestDistributionBucket;
  periods: Record<string, TradingBacktestDistributionBucket | null>;
};

export type TradingBacktestComparativeReport = {
  generatedAt: string;
  request: {
    periods: TradingHistoricalPeriod[];
    instruments: string[];
    timeframes: string[];
  };
  periods: TradingBacktestComparativePeriodResult[];
  aggregate: {
    summary: ComparativeSummary;
    totals: {
      totalTrades: number;
      evaluatedBars: number;
      tradesByMarket: Record<string, number>;
    };
    insights: {
      strongestSetup: SetupType | null;
      weakestSetup: SetupType | null;
      strongestSession: SessionState | null;
      weakestSession: SessionState | null;
      strongestMarket: string | null;
      weakestMarket: string | null;
    };
  };
  comparisons: {
    byPeriod: Record<string, TradingBacktestComparativePeriodSummary>;
    byMarket: Record<string, TradingBacktestComparativeMarketSummary>;
    bySetup: Record<string, TradingBacktestComparativeBucketSummary<SetupType>>;
    bySession: Record<string, TradingBacktestComparativeBucketSummary<SessionState>>;
  };
};

function roundMetric(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function toComparativeSummary(summary: TradingBacktestAggregateReport["aggregate"]["summary"]): ComparativeSummary {
  return {
    totalTrades: summary.totalTrades,
    winRate: summary.winRate,
    averageRiskReward: summary.averageRiskReward,
    expectancy: summary.expectancy,
    maxDrawdown: summary.maxDrawdown,
    profitFactor: summary.profitFactor,
    tradeFrequency: summary.tradeFrequency,
    grossProfitPct: summary.grossProfitPct,
    grossLossPct: summary.grossLossPct,
  };
}

function resolveStrongWeak<TKey extends string>(
  distributions: Partial<Record<TKey, { expectancy: number; count: number }>>,
): { strongest: TKey | null; weakest: TKey | null } {
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

function buildEquityValues(trades: TradingBacktestTrade[], startingEquity = 100): number[] {
  const orderedTrades = [...trades].sort((left, right) => left.closedAt.localeCompare(right.closedAt));
  let equity = startingEquity;
  const values = [equity];

  for (const trade of orderedTrades) {
    equity = roundMetric(equity + trade.pnlPct);
    values.push(equity);
  }

  return values;
}

function buildBucketSummary<TKey extends string>(args: {
  periodResults: TradingBacktestComparativePeriodResult[];
  overall: Partial<Record<TKey, TradingBacktestDistributionBucket>>;
  selector: (period: TradingBacktestComparativePeriodResult) => Partial<Record<TKey, TradingBacktestDistributionBucket>>;
}): Record<string, TradingBacktestComparativeBucketSummary<TKey>> {
  const output: Record<string, TradingBacktestComparativeBucketSummary<TKey>> = {};

  for (const [key, bucket] of Object.entries(args.overall) as [TKey, TradingBacktestDistributionBucket][]) {
    output[key] = {
      key,
      summary: bucket,
      periods: Object.fromEntries(
        args.periodResults.map((periodResult) => [
          periodResult.period.label,
          args.selector(periodResult)[key] ?? null,
        ]),
      ),
    };
  }

  return output;
}

export async function runTradingHistoricalComparativeSweep(
  request: TradingBacktestComparativeSweepRequest,
): Promise<TradingBacktestComparativeReport> {
  const periodResults: TradingBacktestComparativePeriodResult[] = [];

  for (const period of request.periods) {
    const report = await runTradingHistoricalMarketSweep({
      instruments: request.instruments,
      from: period.from,
      to: period.to,
      timeframes: request.timeframes,
      backtest: request.backtest,
      continueOnError: request.continueOnError,
      cachePolicy: request.cachePolicy,
      cacheDir: request.cacheDir,
      periodLabel: period.label,
      sourcePreference: request.sourcePreference,
    });

    periodResults.push({
      period,
      report,
    });
  }

  const allTrades = periodResults.flatMap((periodResult) =>
    periodResult.report.markets.flatMap((market) => market.report.trades),
  );
  const totalEvaluatedBars = periodResults.reduce(
    (sum, periodResult) => sum + periodResult.report.aggregate.totals.evaluatedBars,
    0,
  );
  const overallMetrics = computeBacktestMetrics({
    trades: allTrades,
    evaluatedBars: totalEvaluatedBars,
    equityValues: buildEquityValues(allTrades),
  });

  const byPeriod = Object.fromEntries(
    periodResults.map((periodResult) => [
      periodResult.period.label,
      {
        period: periodResult.period,
        summary: toComparativeSummary(periodResult.report.aggregate.summary),
        evaluatedBars: periodResult.report.aggregate.totals.evaluatedBars,
        tradesByMarket: periodResult.report.aggregate.totals.tradesByMarket,
        failures: periodResult.report.failures,
        strongestMarket: periodResult.report.aggregate.insights.strongestMarket,
        weakestMarket: periodResult.report.aggregate.insights.weakestMarket,
      } satisfies TradingBacktestComparativePeriodSummary,
    ]),
  );

  const instrumentSet = new Set(
    periodResults.flatMap((periodResult) => [
      ...periodResult.report.request.instruments,
      ...periodResult.report.markets.map((market) => market.instrument),
      ...periodResult.report.failures.map((failure) => failure.instrument),
    ]),
  );
  const byMarket = Object.fromEntries(
    Array.from(instrumentSet.values()).map((instrument) => {
      const marketRuns = periodResults
        .map((periodResult) => ({
          period: periodResult.period,
          market: periodResult.report.markets.find((entry) => entry.instrument === instrument) ?? null,
          failure: periodResult.report.failures.find((entry) => entry.instrument === instrument) ?? null,
        }));
      const trades = marketRuns.flatMap((run) => run.market?.report.trades ?? []);
      const evaluatedBars = marketRuns.reduce(
        (sum, run) => sum + (run.market?.report.period.evaluatedBars ?? 0),
        0,
      );
      const metrics = computeBacktestMetrics({
        trades,
        evaluatedBars,
        equityValues: buildEquityValues(trades),
      });
      const setupInsights = resolveStrongWeak(metrics.distributions.bySetup);
      const sessionInsights = resolveStrongWeak(metrics.distributions.bySession);
      const dataSymbols = Array.from(
        new Set(marketRuns.flatMap((run) => (run.market ? [run.market.historical.dataSymbol] : []))),
      );

      return [
        instrument,
        {
          instrument,
          summary: {
            totalTrades: trades.length,
            winRate: metrics.winRate,
            averageRiskReward: metrics.averageRiskReward,
            expectancy: metrics.expectancy,
            maxDrawdown: metrics.maxDrawdown,
            profitFactor: metrics.profitFactor,
            tradeFrequency: metrics.tradeFrequency.tradesPer100Bars,
            grossProfitPct: metrics.grossProfitPct,
            grossLossPct: metrics.grossLossPct,
          },
          evaluatedBars,
          completedPeriods: marketRuns.filter((run) => run.market).map((run) => run.period.label),
          failedPeriods: marketRuns.filter((run) => run.failure).map((run) => run.period.label),
          strongestSetup: setupInsights.strongest,
          weakestSetup: setupInsights.weakest,
          strongestSession: sessionInsights.strongest,
          weakestSession: sessionInsights.weakest,
          dataSymbols,
          usedProxyData: marketRuns.some(
            (run) => run.market?.historical.dataSymbolRelation === "proxy",
          ),
          periods: Object.fromEntries(
            marketRuns.map((run) => [
              run.period.label,
              run.market
                ? {
                    totalTrades: run.market.report.summary.totalTrades,
                    winRate: run.market.report.summary.winRate,
                    averageRiskReward: run.market.report.summary.averageRiskReward,
                    expectancy: run.market.report.summary.expectancy,
                    maxDrawdown: run.market.report.summary.maxDrawdown,
                    profitFactor: run.market.report.summary.profitFactor,
                    tradeFrequency: run.market.report.summary.tradeFrequency,
                    grossProfitPct: run.market.report.summary.grossProfitPct,
                    grossLossPct: run.market.report.summary.grossLossPct,
                  }
                : null,
            ]),
          ),
        } satisfies TradingBacktestComparativeMarketSummary,
      ];
    }),
  );

  const bySetup = buildBucketSummary({
    periodResults,
    overall: overallMetrics.distributions.bySetup,
    selector: (periodResult) => periodResult.report.aggregate.distributions.bySetup,
  });
  const bySession = buildBucketSummary({
    periodResults,
    overall: overallMetrics.distributions.bySession,
    selector: (periodResult) => periodResult.report.aggregate.distributions.bySession,
  });
  const marketBuckets = Object.fromEntries(
    Object.entries(byMarket).map(([instrument, market]) => [
      instrument,
      {
        expectancy: market.summary.expectancy,
        count: market.summary.totalTrades,
      },
    ]),
  );
  const setupInsights = resolveStrongWeak(overallMetrics.distributions.bySetup);
  const sessionInsights = resolveStrongWeak(overallMetrics.distributions.bySession);
  const marketInsights = resolveStrongWeak(marketBuckets);

  return {
    generatedAt: new Date().toISOString(),
    request: {
      periods: request.periods,
      instruments: request.instruments ?? Array.from(instrumentSet.values()),
      timeframes: request.timeframes ?? ["4h", "1h", "15m"],
    },
    periods: periodResults,
    aggregate: {
      summary: {
        totalTrades: allTrades.length,
        winRate: overallMetrics.winRate,
        averageRiskReward: overallMetrics.averageRiskReward,
        expectancy: overallMetrics.expectancy,
        maxDrawdown: overallMetrics.maxDrawdown,
        profitFactor: overallMetrics.profitFactor,
        tradeFrequency: overallMetrics.tradeFrequency.tradesPer100Bars,
        grossProfitPct: overallMetrics.grossProfitPct,
        grossLossPct: overallMetrics.grossLossPct,
      },
      totals: {
        totalTrades: allTrades.length,
        evaluatedBars: totalEvaluatedBars,
        tradesByMarket: Object.fromEntries(
          Object.entries(byMarket).map(([instrument, market]) => [instrument, market.summary.totalTrades]),
        ),
      },
      insights: {
        strongestSetup: setupInsights.strongest,
        weakestSetup: setupInsights.weakest,
        strongestSession: sessionInsights.strongest,
        weakestSession: sessionInsights.weakest,
        strongestMarket: marketInsights.strongest,
        weakestMarket: marketInsights.weakest,
      },
    },
    comparisons: {
      byPeriod,
      byMarket,
      bySetup,
      bySession,
    },
  };
}

export async function writeTradingHistoricalComparativeReport(args: {
  report: TradingBacktestComparativeReport;
  outputPath: string;
}): Promise<string> {
  const absolutePath = path.resolve(args.outputPath);

  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, JSON.stringify(args.report, null, 2), "utf8");

  return absolutePath;
}
