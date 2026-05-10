import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { SessionState } from "@/lib/trading/market";
import type { SetupType } from "@/lib/trading/setups";

import { computeBacktestMetrics } from "./metrics";
import type { TradingBacktestComparativeReport } from "./comparativeSweep";
import type { TradingBacktestTrade } from "./types";

export type TradingMarketSessionSegmentMetrics = {
  trades: number;
  winRate: number;
  averageRiskReward: number | null;
  expectancy: number;
  profitFactor: number | null;
  maxDrawdown: number;
  netPnlPct: number;
};

export type TradingMarketSessionBlockReport = {
  session: SessionState;
  aggregate: TradingMarketSessionSegmentMetrics;
  bySetup: Record<string, TradingMarketSessionSegmentMetrics>;
  periods: Record<string, TradingMarketSessionSegmentMetrics | null>;
  omittedSetups: SetupType[];
};

export type TradingMarketSessionMarketReport = {
  instrument: string;
  aggregate: TradingMarketSessionSegmentMetrics;
  bySession: Record<string, TradingMarketSessionBlockReport>;
  omittedSessions: SessionState[];
  strongestSession: SessionState | null;
  weakestSession: SessionState | null;
};

export type TradingMarketSessionStudyBlock = {
  instrument: string;
  session: SessionState;
  metrics: TradingMarketSessionSegmentMetrics;
};

export type TradingMarketSessionStudyReport = {
  generatedAt: string;
  source: {
    kind: "comparative_report";
    periods: string[];
    instruments: string[];
    minimumSampleCount: number;
    nestedMinimumSampleCount: number;
    totalTrades: number;
  };
  byMarket: Record<string, TradingMarketSessionMarketReport>;
  crossMarket: {
    bySession: Record<string, TradingMarketSessionSegmentMetrics>;
    strongestBlocks: TradingMarketSessionStudyBlock[];
    weakestBlocks: TradingMarketSessionStudyBlock[];
  };
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

function buildSegmentMetrics(trades: TradingBacktestTrade[]): TradingMarketSessionSegmentMetrics {
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
    netPnlPct: roundMetric(metrics.grossProfitPct - metrics.grossLossPct),
  };
}

function buildKeyedSegments<TKey extends string>(args: {
  trades: TradingBacktestTrade[];
  keySelector: (trade: TradingBacktestTrade) => TKey;
  minimumSampleCount: number;
}): {
  included: Record<TKey, TradingMarketSessionSegmentMetrics>;
  omitted: TKey[];
} {
  const buckets = new Map<TKey, TradingBacktestTrade[]>();

  for (const trade of args.trades) {
    const key = args.keySelector(trade);
    const existing = buckets.get(key) ?? [];
    existing.push(trade);
    buckets.set(key, existing);
  }

  const included = {} as Record<TKey, TradingMarketSessionSegmentMetrics>;
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

function resolveStrongWeak<TKey extends string>(
  entries: Record<TKey, TradingMarketSessionSegmentMetrics>,
): { strongest: TKey | null; weakest: TKey | null } {
  const candidates = Object.entries(entries)
    .filter((entry): entry is [TKey, TradingMarketSessionSegmentMetrics] => Boolean(entry[1]))
    .filter(([, metrics]) => metrics.trades > 0);

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

function flattenComparativeTrades(comparativeReport: TradingBacktestComparativeReport) {
  return comparativeReport.periods.flatMap((periodResult) =>
    periodResult.report.markets.flatMap((market) =>
      market.report.trades.map((trade) => ({
        periodLabel: periodResult.period.label,
        instrument: market.instrument,
        trade,
      })),
    ),
  );
}

export function buildTradingMarketSessionStudyReport(args: {
  comparativeReport: TradingBacktestComparativeReport;
  minimumSampleCount?: number;
  nestedMinimumSampleCount?: number;
}): TradingMarketSessionStudyReport {
  const minimumSampleCount = Math.max(1, args.minimumSampleCount ?? 5);
  const nestedMinimumSampleCount = Math.max(1, args.nestedMinimumSampleCount ?? 3);
  const flattenedTrades = flattenComparativeTrades(args.comparativeReport);
  const instruments = args.comparativeReport.request.instruments;

  const byMarket = Object.fromEntries(
    instruments.map((instrument) => {
      const marketTrades = flattenedTrades.filter((entry) => entry.instrument === instrument);
      const marketTradeOnly = marketTrades.map((entry) => entry.trade);
      const sessionSegments = buildKeyedSegments({
        trades: marketTradeOnly,
        keySelector: (trade) => trade.session,
        minimumSampleCount,
      });

      const bySession = Object.fromEntries(
        Object.keys(sessionSegments.included).map((session) => {
          const typedSession = session as SessionState;
          const sessionTrades = marketTrades.filter((entry) => entry.trade.session === typedSession);
          const sessionTradeOnly = sessionTrades.map((entry) => entry.trade);
          const setupSegments = buildKeyedSegments({
            trades: sessionTradeOnly,
            keySelector: (trade) => trade.setupType,
            minimumSampleCount: nestedMinimumSampleCount,
          });
          const periods = Object.fromEntries(
            args.comparativeReport.request.periods.map((period) => {
              const periodTrades = sessionTrades
                .filter((entry) => entry.periodLabel === period.label)
                .map((entry) => entry.trade);

              return [
                period.label,
                periodTrades.length > 0 ? buildSegmentMetrics(periodTrades) : null,
              ];
            }),
          );

          return [
            typedSession,
            {
              session: typedSession,
              aggregate: sessionSegments.included[typedSession],
              bySetup: setupSegments.included,
              periods,
              omittedSetups: setupSegments.omitted,
            } satisfies TradingMarketSessionBlockReport,
          ];
        }),
      ) as Record<string, TradingMarketSessionBlockReport>;
      const sessionMetricMap = Object.fromEntries(
        Object.entries(bySession).map(([session, block]) => [session, block.aggregate]),
      ) as Record<SessionState, TradingMarketSessionSegmentMetrics>;
      const insights = resolveStrongWeak(sessionMetricMap);

      return [
        instrument,
        {
          instrument,
          aggregate: buildSegmentMetrics(marketTradeOnly),
          bySession,
          omittedSessions: sessionSegments.omitted,
          strongestSession: insights.strongest,
          weakestSession: insights.weakest,
        } satisfies TradingMarketSessionMarketReport,
      ];
    }),
  ) as Record<string, TradingMarketSessionMarketReport>;

  const crossMarketBySession = buildKeyedSegments({
    trades: flattenedTrades.map((entry) => entry.trade),
    keySelector: (trade) => trade.session,
    minimumSampleCount,
  }).included;

  const includedBlocks = Object.values(byMarket).flatMap((market) =>
    Object.values(market.bySession).map((block) => ({
      instrument: market.instrument,
      session: block.session,
      metrics: block.aggregate,
    })),
  );

  const strongestBlocks = [...includedBlocks]
    .filter((block) => block.metrics.trades >= minimumSampleCount)
    .sort((left, right) => {
      if (right.metrics.expectancy !== left.metrics.expectancy) {
        return right.metrics.expectancy - left.metrics.expectancy;
      }

      return right.metrics.trades - left.metrics.trades;
    })
    .slice(0, 10);

  const weakestBlocks = [...includedBlocks]
    .filter((block) => block.metrics.trades >= minimumSampleCount)
    .sort((left, right) => {
      if (left.metrics.expectancy !== right.metrics.expectancy) {
        return left.metrics.expectancy - right.metrics.expectancy;
      }

      return right.metrics.trades - left.metrics.trades;
    })
    .slice(0, 10);

  return {
    generatedAt: new Date().toISOString(),
    source: {
      kind: "comparative_report",
      periods: args.comparativeReport.request.periods.map((period) => period.label),
      instruments,
      minimumSampleCount,
      nestedMinimumSampleCount,
      totalTrades: flattenedTrades.length,
    },
    byMarket,
    crossMarket: {
      bySession: crossMarketBySession,
      strongestBlocks,
      weakestBlocks,
    },
  };
}

export async function writeTradingMarketSessionStudyReport(args: {
  report: TradingMarketSessionStudyReport;
  outputPath: string;
}): Promise<string> {
  const absolutePath = path.resolve(args.outputPath);

  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, JSON.stringify(args.report, null, 2), "utf8");

  return absolutePath;
}
