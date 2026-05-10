import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { SessionState } from "@/lib/trading/market";
import type { SetupType } from "@/lib/trading/setups";

import { computeBacktestMetrics } from "./metrics";
import type { TradingBacktestComparativeReport } from "./comparativeSweep";
import type { TradingBacktestTrade } from "./types";

export type TradingSetupSegmentMetrics = {
  trades: number;
  winRate: number;
  averageRiskReward: number | null;
  expectancy: number;
  profitFactor: number | null;
  maxDrawdown: number;
};

export type TradingSetupSegmentReport = {
  setupType: SetupType;
  aggregate: TradingSetupSegmentMetrics;
  byMarket: Record<string, TradingSetupSegmentMetrics>;
  bySession: Record<SessionState, TradingSetupSegmentMetrics>;
  omitted: {
    markets: string[];
    sessions: SessionState[];
  };
};

export type TradingSetupSegmentationReport = {
  generatedAt: string;
  source: {
    kind: "comparative_report";
    periods: string[];
    instruments: string[];
    minimumSampleCount: number;
    totalTrades: number;
  };
  setups: TradingSetupSegmentReport[];
};

function roundMetric(value: number): number {
  return Math.round(value * 10_000) / 10_000;
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

function buildSegmentMetrics(trades: TradingBacktestTrade[]): TradingSetupSegmentMetrics {
  const metrics = computeBacktestMetrics({
    trades,
    evaluatedBars: 0,
    equityValues: buildEquityValues(trades),
  });

  return {
    trades: trades.length,
    winRate: metrics.winRate,
    averageRiskReward: metrics.averageRiskReward,
    expectancy: metrics.expectancy,
    profitFactor: metrics.profitFactor,
    maxDrawdown: metrics.maxDrawdown,
  };
}

function buildKeyedSegments<TKey extends string>(args: {
  trades: TradingBacktestTrade[];
  keySelector: (trade: TradingBacktestTrade) => TKey;
  minimumSampleCount: number;
}): {
  included: Record<TKey, TradingSetupSegmentMetrics>;
  omitted: TKey[];
} {
  const buckets = new Map<TKey, TradingBacktestTrade[]>();

  for (const trade of args.trades) {
    const key = args.keySelector(trade);
    const bucket = buckets.get(key) ?? [];
    bucket.push(trade);
    buckets.set(key, bucket);
  }

  const included = {} as Record<TKey, TradingSetupSegmentMetrics>;
  const omitted: TKey[] = [];

  for (const [key, bucketTrades] of buckets.entries()) {
    if (bucketTrades.length < args.minimumSampleCount) {
      omitted.push(key);
      continue;
    }

    included[key] = buildSegmentMetrics(bucketTrades);
  }

  return {
    included,
    omitted: omitted.sort(),
  };
}

export function buildTradingSetupSegmentationReport(args: {
  comparativeReport: TradingBacktestComparativeReport;
  minimumSampleCount?: number;
}): TradingSetupSegmentationReport {
  const minimumSampleCount = Math.max(1, args.minimumSampleCount ?? 5);
  const trades = args.comparativeReport.periods.flatMap((periodResult) =>
    periodResult.report.markets.flatMap((market) => market.report.trades),
  );
  const setupTypes = Array.from(
    new Set(trades.map((trade) => trade.setupType)),
  ).sort() as SetupType[];

  const setups = setupTypes.map((setupType) => {
    const setupTrades = trades.filter((trade) => trade.setupType === setupType);
    const byMarket = buildKeyedSegments({
      trades: setupTrades,
      keySelector: (trade) => trade.instrument,
      minimumSampleCount,
    });
    const bySession = buildKeyedSegments({
      trades: setupTrades,
      keySelector: (trade) => trade.session,
      minimumSampleCount,
    });

    return {
      setupType,
      aggregate: buildSegmentMetrics(setupTrades),
      byMarket: byMarket.included,
      bySession: bySession.included,
      omitted: {
        markets: byMarket.omitted,
        sessions: bySession.omitted,
      },
    } satisfies TradingSetupSegmentReport;
  });

  return {
    generatedAt: new Date().toISOString(),
    source: {
      kind: "comparative_report",
      periods: args.comparativeReport.request.periods.map((period) => period.label),
      instruments: args.comparativeReport.request.instruments,
      minimumSampleCount,
      totalTrades: trades.length,
    },
    setups,
  };
}

export async function writeTradingSetupSegmentationReport(args: {
  report: TradingSetupSegmentationReport;
  outputPath: string;
}): Promise<string> {
  const absolutePath = path.resolve(args.outputPath);

  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, JSON.stringify(args.report, null, 2), "utf8");

  return absolutePath;
}
