import type { TradingHistoricalPeriod } from "@/lib/trading/backtest/periods";

import type { ResearchMetricSummary } from "./types";

const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

function finiteNumber(value: unknown): number | null {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

function roundMetric(value: number): number {
  return Math.round(value * 10000) / 10000;
}

export function estimateAnnualizedTrades(
  totalTrades: number,
  periods?: TradingHistoricalPeriod[] | null,
): number | null {
  if (!Number.isFinite(totalTrades) || !Array.isArray(periods) || periods.length === 0) {
    return null;
  }

  const measuredYears = periods.reduce((sum, period) => {
    const from = new Date(period.from).getTime();
    const to = new Date(period.to).getTime();
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return sum;
    return sum + (to - from) / YEAR_MS;
  }, 0);

  if (!Number.isFinite(measuredYears) || measuredYears <= 0) return null;
  return roundMetric(totalTrades / measuredYears);
}

export function buildResearchMetricSummary(
  input: Partial<ResearchMetricSummary> | ResearchMetricSummary | null | undefined,
  annualizationPeriods?: TradingHistoricalPeriod[] | null,
): ResearchMetricSummary {
  const totalTrades = finiteNumber(input?.totalTrades) ?? 0;
  const explicitAnnualizedTrades =
    input?.annualizedTrades === null ? null : finiteNumber(input?.annualizedTrades);

  return {
    totalTrades,
    annualizedTrades:
      explicitAnnualizedTrades ?? estimateAnnualizedTrades(totalTrades, annualizationPeriods),
    winRate: finiteNumber(input?.winRate) ?? 0,
    averageRiskReward:
      input?.averageRiskReward === null ? null : finiteNumber(input?.averageRiskReward),
    expectancy: finiteNumber(input?.expectancy) ?? 0,
    profitFactor: input?.profitFactor === null ? null : finiteNumber(input?.profitFactor),
    maxDrawdown: finiteNumber(input?.maxDrawdown) ?? 0,
  };
}
