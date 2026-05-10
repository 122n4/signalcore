import type { SessionState } from "@/lib/trading/market";
import type { SetupType } from "@/lib/trading/setups";
import type { TradingBacktestDistributionBucket, TradingBacktestMetrics, TradingBacktestTrade } from "./types";

function roundMetric(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
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

function buildDistributionMap<TKey extends string>(
  trades: TradingBacktestTrade[],
  keySelector: (trade: TradingBacktestTrade) => TKey,
): Partial<Record<TKey, TradingBacktestDistributionBucket>> {
  const buckets = new Map<TKey, TradingBacktestTrade[]>();

  for (const trade of trades) {
    const key = keySelector(trade);
    const existing = buckets.get(key) ?? [];
    existing.push(trade);
    buckets.set(key, existing);
  }

  const output: Partial<Record<TKey, TradingBacktestDistributionBucket>> = {};

  for (const [key, bucketTrades] of buckets.entries()) {
    output[key] = buildDistributionBucket(bucketTrades);
  }

  return output;
}

function resolveMaxDrawdown(equityValues: number[]): number {
  let peak = Number.NEGATIVE_INFINITY;
  let maxDrawdown = 0;

  for (const value of equityValues) {
    peak = Math.max(peak, value);
    maxDrawdown = Math.max(maxDrawdown, peak - value);
  }

  return roundMetric(maxDrawdown);
}

export function computeBacktestMetrics(args: {
  trades: TradingBacktestTrade[];
  evaluatedBars: number;
  equityValues: number[];
}): TradingBacktestMetrics {
  const { trades, evaluatedBars, equityValues } = args;
  const wins = trades.filter((trade) => trade.outcome === "win").length;
  const losses = trades.filter((trade) => trade.outcome === "loss").length;
  const scratches = trades.filter((trade) => trade.outcome === "scratch").length;
  const winRate = trades.length > 0 ? (wins / trades.length) * 100 : 0;
  const averageRiskRewardValues = trades
    .map((trade) => trade.riskRewardEstimate)
    .filter((value): value is number => typeof value === "number");
  const expectancy = trades.length > 0 ? average(trades.map((trade) => trade.pnlR)) : 0;
  const grossProfitPct = trades
    .filter((trade) => trade.pnlPct > 0)
    .reduce((sum, trade) => sum + trade.pnlPct, 0);
  const grossLossPct = trades
    .filter((trade) => trade.pnlPct < 0)
    .reduce((sum, trade) => sum + Math.abs(trade.pnlPct), 0);

  return {
    tradeCount: trades.length,
    wins,
    losses,
    scratches,
    winRate: roundMetric(winRate),
    averageRiskReward:
      averageRiskRewardValues.length > 0 ? roundMetric(average(averageRiskRewardValues)) : null,
    expectancy: roundMetric(expectancy),
    maxDrawdown: resolveMaxDrawdown(equityValues),
    profitFactor: grossLossPct > 0 ? roundMetric(grossProfitPct / grossLossPct) : null,
    tradeFrequency: {
      totalTrades: trades.length,
      tradesPer100Bars: roundMetric(evaluatedBars > 0 ? (trades.length / evaluatedBars) * 100 : 0),
      averageBarsHeld: roundMetric(trades.length > 0 ? average(trades.map((trade) => trade.barsHeld)) : 0),
    },
    grossProfitPct: roundMetric(grossProfitPct),
    grossLossPct: roundMetric(grossLossPct),
    distributions: {
      bySetup: buildDistributionMap<SetupType>(trades, (trade) => trade.setupType),
      bySession: buildDistributionMap<SessionState>(trades, (trade) => trade.session),
    },
  };
}
