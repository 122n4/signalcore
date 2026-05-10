import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { TradingHistoricalDatasetCachePolicy } from "./archive";
import {
  runTradingHistoricalComparativeSweep,
  type TradingBacktestComparativeReport,
  type TradingBacktestComparativeSweepRequest,
} from "./comparativeSweep";
import type { TradingHistoricalSourcePreference } from "./datasets";
import type { TradingHistoricalPeriod } from "./periods";
import type { TradingBacktestConfig } from "./types";

export type TradingHistoricalStudyDefinition = {
  label: string;
  periods: TradingHistoricalPeriod[];
  description?: string | null;
};

export type TradingHistoricalStudyCampaignRequest = {
  studies: TradingHistoricalStudyDefinition[];
  instruments?: string[];
  timeframes?: TradingBacktestComparativeSweepRequest["timeframes"];
  backtest?: TradingBacktestConfig;
  continueOnError?: boolean;
  cachePolicy?: TradingHistoricalDatasetCachePolicy;
  cacheDir?: string | null;
  sourcePreference?: TradingHistoricalSourcePreference;
};

export type TradingHistoricalStudyCampaignStudyResult = {
  label: string;
  description: string | null;
  report: TradingBacktestComparativeReport;
};

export type TradingHistoricalStudyCampaignReport = {
  generatedAt: string;
  request: {
    studies: Array<{
      label: string;
      description: string | null;
      periodCount: number;
      periodLabels: string[];
    }>;
    instruments: string[];
    timeframes: string[];
    sourcePreference: TradingHistoricalSourcePreference | null;
  };
  studies: TradingHistoricalStudyCampaignStudyResult[];
  summary: {
    byStudy: Record<string, {
      totalTrades: number;
      winRate: number;
      expectancy: number;
      profitFactor: number | null;
      strongestMarket: string | null;
      weakestMarket: string | null;
      strongestSetup: string | null;
      weakestSetup: string | null;
      strongestSession: string | null;
      weakestSession: string | null;
      completedPeriods: number;
      failedPeriods: number;
    }>;
    byMarket: Record<string, {
      instrument: string;
      totalTrades: number;
      averageExpectancy: number;
      averageProfitFactor: number | null;
      strongestStudy: string | null;
      weakestStudy: string | null;
      completedStudies: string[];
    }>;
  };
};

type TradingHistoricalStudyCampaignDeps = {
  runComparativeSweep?: (
    request: TradingBacktestComparativeSweepRequest,
  ) => Promise<TradingBacktestComparativeReport>;
};

function roundMetric(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return roundMetric(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function averageNullable(values: Array<number | null>): number | null {
  const filtered = values.filter((value): value is number => value !== null);

  if (filtered.length === 0) {
    return null;
  }

  return average(filtered);
}

function resolveStrongWeakStudy(args: {
  metrics: Array<{ label: string; expectancy: number; totalTrades: number }>;
}): {
  strongestStudy: string | null;
  weakestStudy: string | null;
} {
  const candidates = args.metrics.filter((metric) => metric.totalTrades > 0);

  if (candidates.length === 0) {
    return {
      strongestStudy: null,
      weakestStudy: null,
    };
  }

  const strongestStudy = [...candidates].sort((left, right) => right.expectancy - left.expectancy)[0]?.label ?? null;
  const weakestStudy = [...candidates].sort((left, right) => left.expectancy - right.expectancy)[0]?.label ?? null;

  return {
    strongestStudy,
    weakestStudy,
  };
}

export async function runTradingHistoricalStudyCampaign(
  request: TradingHistoricalStudyCampaignRequest,
  deps: TradingHistoricalStudyCampaignDeps = {},
): Promise<TradingHistoricalStudyCampaignReport> {
  const runComparativeSweep = deps.runComparativeSweep ?? runTradingHistoricalComparativeSweep;
  const studies: TradingHistoricalStudyCampaignStudyResult[] = [];

  for (const study of request.studies) {
    const report = await runComparativeSweep({
      periods: study.periods,
      instruments: request.instruments,
      timeframes: request.timeframes,
      backtest: request.backtest,
      continueOnError: request.continueOnError,
      cachePolicy: request.cachePolicy,
      cacheDir: request.cacheDir,
      sourcePreference: request.sourcePreference,
    });

    studies.push({
      label: study.label,
      description: study.description ?? null,
      report,
    });
  }

  const instrumentSet = new Set(
    studies.flatMap((study) => Object.keys(study.report.comparisons.byMarket)),
  );

  const byStudy = Object.fromEntries(
    studies.map((study) => [
      study.label,
      {
        totalTrades: study.report.aggregate.summary.totalTrades,
        winRate: study.report.aggregate.summary.winRate,
        expectancy: study.report.aggregate.summary.expectancy,
        profitFactor: study.report.aggregate.summary.profitFactor,
        strongestMarket: study.report.aggregate.insights.strongestMarket,
        weakestMarket: study.report.aggregate.insights.weakestMarket,
        strongestSetup: study.report.aggregate.insights.strongestSetup,
        weakestSetup: study.report.aggregate.insights.weakestSetup,
        strongestSession: study.report.aggregate.insights.strongestSession,
        weakestSession: study.report.aggregate.insights.weakestSession,
        completedPeriods: Object.values(study.report.comparisons.byPeriod).filter(
          (period) => period.failures.length === 0,
        ).length,
        failedPeriods: Object.values(study.report.comparisons.byPeriod).filter(
          (period) => period.failures.length > 0,
        ).length,
      },
    ]),
  );

  const byMarket = Object.fromEntries(
    Array.from(instrumentSet.values()).map((instrument) => {
      const marketStudies = studies
        .map((study) => ({
          label: study.label,
          market: study.report.comparisons.byMarket[instrument] ?? null,
        }))
        .filter((entry) => entry.market !== null);
      const strongestWeakestStudy = resolveStrongWeakStudy({
        metrics: marketStudies.map((entry) => ({
          label: entry.label,
          expectancy: entry.market.summary.expectancy,
          totalTrades: entry.market.summary.totalTrades,
        })),
      });

      return [
        instrument,
        {
          instrument,
          totalTrades: marketStudies.reduce((sum, entry) => sum + entry.market.summary.totalTrades, 0),
          averageExpectancy: average(marketStudies.map((entry) => entry.market.summary.expectancy)),
          averageProfitFactor: averageNullable(
            marketStudies.map((entry) => entry.market.summary.profitFactor),
          ),
          strongestStudy: strongestWeakestStudy.strongestStudy,
          weakestStudy: strongestWeakestStudy.weakestStudy,
          completedStudies: marketStudies
            .filter((entry) => entry.market.summary.totalTrades > 0)
            .map((entry) => entry.label),
        },
      ];
    }),
  );

  return {
    generatedAt: new Date().toISOString(),
    request: {
      studies: request.studies.map((study) => ({
        label: study.label,
        description: study.description ?? null,
        periodCount: study.periods.length,
        periodLabels: study.periods.map((period) => period.label),
      })),
      instruments: request.instruments ?? [],
      timeframes: request.timeframes ?? ["4h", "1h", "15m"],
      sourcePreference: request.sourcePreference ?? null,
    },
    studies,
    summary: {
      byStudy,
      byMarket,
    },
  };
}

export async function writeTradingHistoricalStudyCampaignReport(args: {
  report: TradingHistoricalStudyCampaignReport;
  outputPath: string;
}): Promise<string> {
  const absolutePath = path.resolve(args.outputPath);

  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, JSON.stringify(args.report, null, 2), "utf8");

  return absolutePath;
}
