import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { SessionState } from "@/lib/trading/market";
import type { SetupType } from "@/lib/trading/setups";

import {
  defaultTradingHistoricalPeriodLabel,
  TRADING_BACKTEST_BASE_INSTRUMENTS,
  type TradingHistoricalBacktestResult,
  type TradingHistoricalDatasetRequest,
  type TradingHistoricalSourcePreference,
} from "./datasets";
import { loadOrFetchTradingHistoricalDataset, type TradingHistoricalDatasetCachePolicy } from "./archive";
import { computeBacktestMetrics } from "./metrics";
import { loadHistoricalTradingDataset } from "./historicalLoader";
import { runTradingBacktestAsync } from "./runner";
import type {
  TradingBacktestConfig,
  TradingBacktestDistributionBucket,
  TradingBacktestMetrics,
  TradingBacktestReport,
  TradingBacktestTrade,
} from "./types";

export type TradingBacktestMarketSweepRequest = {
  instruments?: string[];
  from: string;
  to: string;
  timeframes?: TradingHistoricalDatasetRequest["timeframes"];
  backtest?: TradingBacktestConfig;
  continueOnError?: boolean;
  periodLabel?: string | null;
  cachePolicy?: TradingHistoricalDatasetCachePolicy;
  cacheDir?: string | null;
  sourcePreference?: TradingHistoricalSourcePreference;
};

export type TradingBacktestMarketSweepFailure = {
  instrument: string;
  error: string;
};

export type TradingBacktestMarketSweepMarketResult = {
  instrument: string;
  historical: TradingHistoricalBacktestResult["historicalDataset"]["metadata"];
  report: TradingBacktestReport;
};

export type TradingBacktestAggregateReport = {
  generatedAt: string;
  request: {
    instruments: string[];
    from: string;
    to: string;
    timeframes: string[];
  };
  markets: TradingBacktestMarketSweepMarketResult[];
  failures: TradingBacktestMarketSweepFailure[];
  aggregate: {
    summary: {
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
    totals: {
      evaluatedBars: number;
      tradesByMarket: Record<string, number>;
    };
    distributions: {
      bySetup: TradingBacktestMetrics["distributions"]["bySetup"];
      bySession: TradingBacktestMetrics["distributions"]["bySession"];
      byMarket: Record<string, TradingBacktestDistributionBucket>;
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
};

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

function buildDistributionBucket(trades: TradingBacktestTrade[]): TradingBacktestDistributionBucket {
  const wins = trades.filter((trade) => trade.outcome === "win").length;
  const losses = trades.filter((trade) => trade.outcome === "loss").length;
  const scratches = trades.filter((trade) => trade.outcome === "scratch").length;
  const totalPnlR = trades.reduce((sum, trade) => sum + trade.pnlR, 0);
  const totalPnlPct = trades.reduce((sum, trade) => sum + trade.pnlPct, 0);

  return {
    count: trades.length,
    wins,
    losses,
    scratches,
    winRate: roundMetric(trades.length > 0 ? (wins / trades.length) * 100 : 0),
    totalPnlR: roundMetric(totalPnlR),
    totalPnlPct: roundMetric(totalPnlPct),
    expectancy: roundMetric(trades.length > 0 ? totalPnlR / trades.length : 0),
  };
}

function buildMarketDistribution(
  marketResults: TradingBacktestMarketSweepMarketResult[],
): Record<string, TradingBacktestDistributionBucket> {
  const distribution: Record<string, TradingBacktestDistributionBucket> = {};

  for (const market of marketResults) {
    distribution[market.instrument] = buildDistributionBucket(market.report.trades);
  }

  return distribution;
}

function buildAggregateEquityValues(
  trades: TradingBacktestTrade[],
  startingEquity = 100,
): number[] {
  const orderedTrades = [...trades].sort((left, right) => left.closedAt.localeCompare(right.closedAt));
  let equity = startingEquity;
  const values = [equity];

  for (const trade of orderedTrades) {
    equity = roundMetric(equity + trade.pnlPct);
    values.push(equity);
  }

  return values;
}

function buildAggregateReport(args: {
  request: TradingBacktestMarketSweepRequest;
  markets: TradingBacktestMarketSweepMarketResult[];
  failures: TradingBacktestMarketSweepFailure[];
}): TradingBacktestAggregateReport {
  const allTrades = args.markets.flatMap((market) => market.report.trades);
  const evaluatedBars = args.markets.reduce(
    (sum, market) => sum + market.report.period.evaluatedBars,
    0,
  );
  const aggregateMetrics = computeBacktestMetrics({
    trades: allTrades,
    evaluatedBars,
    equityValues: buildAggregateEquityValues(allTrades),
  });
  const byMarket = buildMarketDistribution(args.markets);
  const setupInsights = resolveStrongWeak(aggregateMetrics.distributions.bySetup);
  const sessionInsights = resolveStrongWeak(aggregateMetrics.distributions.bySession);
  const marketInsights = resolveStrongWeak(byMarket);

  return {
    generatedAt: new Date().toISOString(),
    request: {
      instruments: args.request.instruments ?? TRADING_BACKTEST_BASE_INSTRUMENTS.map((item) => item.instrument),
      from: args.request.from,
      to: args.request.to,
      timeframes: args.request.timeframes ?? ["4h", "1h", "15m"],
    },
    markets: args.markets,
    failures: args.failures,
    aggregate: {
      summary: {
        totalTrades: allTrades.length,
        winRate: aggregateMetrics.winRate,
        averageRiskReward: aggregateMetrics.averageRiskReward,
        expectancy: aggregateMetrics.expectancy,
        maxDrawdown: aggregateMetrics.maxDrawdown,
        profitFactor: aggregateMetrics.profitFactor,
        tradeFrequency: aggregateMetrics.tradeFrequency.tradesPer100Bars,
        grossProfitPct: aggregateMetrics.grossProfitPct,
        grossLossPct: aggregateMetrics.grossLossPct,
      },
      totals: {
        evaluatedBars,
        tradesByMarket: Object.fromEntries(
          args.markets.map((market) => [market.instrument, market.report.summary.totalTrades]),
        ),
      },
      distributions: {
        bySetup: aggregateMetrics.distributions.bySetup,
        bySession: aggregateMetrics.distributions.bySession,
        byMarket,
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
  };
}

export async function runTradingHistoricalMarketSweep(
  request: TradingBacktestMarketSweepRequest,
): Promise<TradingBacktestAggregateReport> {
  const instruments =
    request.instruments?.length
      ? request.instruments.map((instrument) => instrument.trim().toUpperCase())
      : TRADING_BACKTEST_BASE_INSTRUMENTS.map((instrument) => instrument.instrument);
  const markets: TradingBacktestMarketSweepMarketResult[] = [];
  const failures: TradingBacktestMarketSweepFailure[] = [];
  const periodLabel =
    request.periodLabel ?? defaultTradingHistoricalPeriodLabel({ from: request.from, to: request.to });

  for (const instrument of instruments) {
    try {
      const historicalRequest = {
        instrument,
        from: request.from,
        to: request.to,
        timeframes: request.timeframes ?? ["4h", "1h", "15m", "5m"],
        sourcePreference: request.sourcePreference,
      };
      const historicalDataset = await loadOrFetchTradingHistoricalDataset({
        request: historicalRequest,
        periodLabel,
        cachePolicy: request.cachePolicy,
        baseDir: request.cacheDir,
        fetchDataset: () => loadHistoricalTradingDataset(historicalRequest),
      });
      const result = await runTradingBacktestAsync(historicalDataset.dataset, {
        captureSteps: false,
        ...request.backtest,
      });

      markets.push({
        instrument,
        historical: historicalDataset.metadata,
        report: result.report,
      });
    } catch (error) {
      const failure = {
        instrument,
        error: error instanceof Error ? error.message : String(error),
      };

      failures.push(failure);

      if (request.continueOnError === false) {
        throw new Error(`Trading market sweep failed for ${instrument}: ${failure.error}`);
      }
    }
  }

  return buildAggregateReport({
    request,
    markets,
    failures,
  });
}

export async function writeTradingHistoricalMarketSweepReport(args: {
  report: TradingBacktestAggregateReport;
  outputPath: string;
}): Promise<string> {
  const absolutePath = path.resolve(args.outputPath);

  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, JSON.stringify(args.report, null, 2), "utf8");

  return absolutePath;
}
