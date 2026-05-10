import { computeBacktestMetrics } from "@/lib/trading/backtest/metrics";
import type { TradingBacktestTrade } from "@/lib/trading/backtest/types";

import type { ResearchConfig, ResearchPortfolioStressDiagnostics, ResearchPortfolioStressResult } from "./types";

function roundMetric(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function buildEquityValues(trades: TradingBacktestTrade[], startingEquity = 100): number[] {
  let equity = startingEquity;
  const values = [equity];

  for (const trade of trades) {
    equity = roundMetric(equity + trade.pnlPct);
    values.push(equity);
  }

  return values;
}

type TradeCluster = {
  trades: TradingBacktestTrade[];
  start: string;
  end: string;
};

function compareTradeStart(left: TradingBacktestTrade, right: TradingBacktestTrade): number {
  return (
    left.openedAt.localeCompare(right.openedAt) ||
    left.closedAt.localeCompare(right.closedAt) ||
    left.id.localeCompare(right.id)
  );
}

function buildTradeClusters(trades: TradingBacktestTrade[]): TradeCluster[] {
  const ordered = [...trades].sort(compareTradeStart);
  const clusters: TradeCluster[] = [];

  for (const trade of ordered) {
    const current = clusters.at(-1);
    if (!current || trade.openedAt > current.end) {
      clusters.push({
        trades: [trade],
        start: trade.openedAt,
        end: trade.closedAt,
      });
      continue;
    }

    current.trades.push(trade);
    if (trade.closedAt > current.end) {
      current.end = trade.closedAt;
    }
  }

  return clusters;
}

function computeMaxConcurrentTrades(trades: TradingBacktestTrade[]): number {
  const events = trades.flatMap((trade) => [
    { at: trade.openedAt, delta: 1 },
    { at: trade.closedAt, delta: -1 },
  ]);

  events.sort((left, right) => left.at.localeCompare(right.at) || right.delta - left.delta);

  let current = 0;
  let peak = 0;

  for (const event of events) {
    current += event.delta;
    peak = Math.max(peak, current);
  }

  return peak;
}

function buildStressedTradeOrder(trades: TradingBacktestTrade[]): TradingBacktestTrade[] {
  const clusters = buildTradeClusters(trades);

  return clusters.flatMap((cluster) =>
    cluster.trades
      .slice()
      .sort(
        (left, right) =>
          left.pnlPct - right.pnlPct ||
          left.closedAt.localeCompare(right.closedAt) ||
          left.id.localeCompare(right.id),
      ),
  );
}

export function analyzeResearchPortfolioStress(
  trades: TradingBacktestTrade[],
  evaluatedBars: number,
): ResearchPortfolioStressDiagnostics {
  if (trades.length === 0) {
    return {
      cluster_count: 0,
      overlapping_trade_count: 0,
      overlap_ratio: 0,
      max_concurrent_trades: 0,
      stressed_max_drawdown: 0,
    };
  }

  const clusters = buildTradeClusters(trades);
  const overlappingTradeCount = clusters
    .filter((cluster) => cluster.trades.length > 1)
    .reduce((sum, cluster) => sum + cluster.trades.length, 0);
  const stressedTrades = buildStressedTradeOrder(trades);
  const stressedMetrics = computeBacktestMetrics({
    trades: stressedTrades,
    evaluatedBars,
    equityValues: buildEquityValues(stressedTrades),
  });

  return {
    cluster_count: clusters.length,
    overlapping_trade_count: overlappingTradeCount,
    overlap_ratio: roundMetric(trades.length > 0 ? overlappingTradeCount / trades.length : 0),
    max_concurrent_trades: computeMaxConcurrentTrades(trades),
    stressed_max_drawdown: stressedMetrics.maxDrawdown,
  };
}

export function evaluateResearchPortfolioStress(args: {
  config: ResearchConfig;
  baselineTrades: TradingBacktestTrade[];
  baselineEvaluatedBars: number;
  currentTrades: TradingBacktestTrade[];
  currentEvaluatedBars: number;
}): ResearchPortfolioStressResult | null {
  const settings = args.config.study.robustness?.portfolioStress;
  if (!settings?.enabled) {
    return null;
  }

  const baseline = analyzeResearchPortfolioStress(args.baselineTrades, args.baselineEvaluatedBars);
  const current = analyzeResearchPortfolioStress(args.currentTrades, args.currentEvaluatedBars);

  const drawdownPass =
    current.stressed_max_drawdown <= baseline.stressed_max_drawdown + settings.maxDrawdownTolerance;
  const concurrentPass = current.max_concurrent_trades <= settings.maxConcurrentTrades;
  const overlapPass = current.overlap_ratio <= settings.maxOverlapRatio;
  const passes = drawdownPass && concurrentPass && overlapPass;

  const reasons: string[] = [];
  if (!drawdownPass) {
    reasons.push("stressed drawdown worsened");
  }
  if (!concurrentPass) {
    reasons.push("max concurrency too high");
  }
  if (!overlapPass) {
    reasons.push("overlap ratio too high");
  }

  return {
    baseline,
    current,
    passes,
    reason: passes ? "Portfolio stress passed." : `Portfolio stress failed: ${reasons.join(", ")}.`,
  };
}
