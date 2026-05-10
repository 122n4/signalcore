import {
  runTradingHistoricalComparativeSweep,
  type TradingBacktestComparativeReport,
  type TradingContextBlockStudyScenario,
  type TradingSecondLayerRiskStudyScenario,
} from "@/lib/trading/backtest";
import { computeBacktestMetrics } from "@/lib/trading/backtest/metrics";
import type {
  TradingBacktestConfig,
  TradingBacktestMarketSessionRule,
  TradingBacktestRiskRule,
  TradingBacktestTrade,
} from "@/lib/trading/backtest/types";

import type {
  ResearchMetricSummary,
  ResearchSupplementalValidationSummary,
  ResearchTaskExecutorContext,
} from "./types";

type ResearchMonteCarloSlice = {
  trades: TradingBacktestTrade[];
  evaluatedBars: number;
};

type ResearchMonteCarloComputation = {
  summary: ResearchMetricSummary;
  diagnostics: NonNullable<ResearchSupplementalValidationSummary["diagnostics"]>;
};

function roundMetric(value: number | null): number | null {
  if (value === null) {
    return null;
  }

  return Math.round(value * 10_000) / 10_000;
}

function clampPercentile(percentile: number): number {
  return Math.min(0.49, Math.max(0.01, percentile));
}

function hashStringToUint32(input: string): number {
  let hash = 2_166_136_261;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }

  return hash >>> 0;
}

function createSeededRng(seed: number): () => number {
  let state = seed >>> 0;

  if (state === 0) {
    state = 0x9e3779b9;
  }

  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4_294_967_296;
  };
}

function buildEquityValues(trades: TradingBacktestTrade[], startingEquity = 100): number[] {
  const orderedTrades = [...trades].sort((left, right) => left.closedAt.localeCompare(right.closedAt));
  let equity = startingEquity;
  const values = [equity];

  for (const trade of orderedTrades) {
    equity = roundMetric(equity + trade.pnlPct) ?? equity;
    values.push(equity);
  }

  return values;
}

function computeMetricSummary(slice: ResearchMonteCarloSlice): ResearchMetricSummary {
  const metrics = computeBacktestMetrics({
    trades: slice.trades,
    evaluatedBars: slice.evaluatedBars,
    equityValues: buildEquityValues(slice.trades),
  });

  return {
    totalTrades: slice.trades.length,
    winRate: metrics.winRate,
    averageRiskReward: metrics.averageRiskReward,
    expectancy: metrics.expectancy,
    profitFactor: metrics.profitFactor,
    maxDrawdown: metrics.maxDrawdown,
  };
}

function computeQuantile(values: number[], percentile: number): number {
  if (values.length === 0) {
    return 0;
  }

  const ordered = [...values].sort((left, right) => left - right);
  const scaledIndex = percentile * (ordered.length - 1);
  const lowerIndex = Math.floor(scaledIndex);
  const upperIndex = Math.ceil(scaledIndex);

  if (lowerIndex === upperIndex) {
    return ordered[lowerIndex]!;
  }

  const weight = scaledIndex - lowerIndex;
  const lower = ordered[lowerIndex]!;
  const upper = ordered[upperIndex]!;

  return lower + (upper - lower) * weight;
}

function computeNullableQuantile(values: Array<number | null>, percentile: number): number | null {
  const filtered = values.filter((value): value is number => value !== null);
  return filtered.length === 0 ? null : roundMetric(computeQuantile(filtered, percentile));
}

function computeQuantileSummary(
  summaries: ResearchMetricSummary[],
  percentile: number,
  inversePercentile: number,
  reshuffleDrawdowns: number[],
): ResearchMetricSummary {
  return {
    totalTrades: Math.round(computeQuantile(summaries.map((summary) => summary.totalTrades), percentile)),
    winRate: roundMetric(computeQuantile(summaries.map((summary) => summary.winRate), percentile)) ?? 0,
    averageRiskReward: computeNullableQuantile(
      summaries.map((summary) => summary.averageRiskReward),
      percentile,
    ),
    expectancy: roundMetric(computeQuantile(summaries.map((summary) => summary.expectancy), percentile)) ?? 0,
    profitFactor: computeNullableQuantile(
      summaries.map((summary) => summary.profitFactor),
      percentile,
    ),
    maxDrawdown:
      roundMetric(
        Math.max(
          computeQuantile(summaries.map((summary) => summary.maxDrawdown), inversePercentile),
          computeQuantile(reshuffleDrawdowns, inversePercentile),
        ),
      ) ?? 0,
  };
}

function bootstrapTrades(
  trades: TradingBacktestTrade[],
  rng: () => number,
): TradingBacktestTrade[] {
  if (trades.length === 0) {
    return [];
  }

  return Array.from({ length: trades.length }, () => {
    const index = Math.min(trades.length - 1, Math.floor(rng() * trades.length));
    return trades[index]!;
  });
}

function reshuffleTrades(
  trades: TradingBacktestTrade[],
  rng: () => number,
): TradingBacktestTrade[] {
  const output = [...trades];

  for (let index = output.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [output[index], output[swapIndex]] = [output[swapIndex]!, output[index]!];
  }

  return output;
}

function buildMonteCarloSummary(args: {
  slice: ResearchMonteCarloSlice;
  iterations: number;
  percentile: number;
  seed: number;
  label: string;
}): ResearchMonteCarloComputation {
  const percentile = clampPercentile(args.percentile);
  const inversePercentile = 1 - percentile;
  const bootstrapSummaries: ResearchMetricSummary[] = [];
  const reshuffleDrawdowns: number[] = [];

  for (let iteration = 0; iteration < args.iterations; iteration += 1) {
    const bootstrapRng = createSeededRng(
      args.seed ^ hashStringToUint32(`${args.label}:bootstrap:${iteration}`),
    );
    const reshuffleRng = createSeededRng(
      args.seed ^ hashStringToUint32(`${args.label}:reshuffle:${iteration}`),
    );
    const bootstrappedTrades = bootstrapTrades(args.slice.trades, bootstrapRng);
    const reshuffledTrades = reshuffleTrades(args.slice.trades, reshuffleRng);

    bootstrapSummaries.push(
      computeMetricSummary({
        trades: bootstrappedTrades,
        evaluatedBars: args.slice.evaluatedBars,
      }),
    );
    reshuffleDrawdowns.push(
      computeMetricSummary({
        trades: reshuffledTrades,
        evaluatedBars: args.slice.evaluatedBars,
      }).maxDrawdown,
    );
  }

  const pessimistic = computeQuantileSummary(
    bootstrapSummaries,
    percentile,
    inversePercentile,
    reshuffleDrawdowns,
  );

  return {
    summary: pessimistic,
    diagnostics: {
      iterations: args.iterations,
      percentile,
      bootstrap: {
        pessimistic,
        median: computeQuantileSummary(
          bootstrapSummaries,
          0.5,
          0.5,
          reshuffleDrawdowns,
        ),
        worst: computeQuantileSummary(
          bootstrapSummaries,
          0,
          1,
          reshuffleDrawdowns,
        ),
      },
      reshuffle: {
        pessimisticDrawdown:
          roundMetric(computeQuantile(reshuffleDrawdowns, inversePercentile)) ?? 0,
        medianDrawdown: roundMetric(computeQuantile(reshuffleDrawdowns, 0.5)) ?? 0,
        worstDrawdown: roundMetric(Math.max(...reshuffleDrawdowns, 0)) ?? 0,
      },
    },
  };
}

export function runResearchMonteCarloFromSlices(args: {
  baselineSlice: ResearchMonteCarloSlice;
  currentSlice: ResearchMonteCarloSlice;
  iterations: number;
  percentile: number;
  seed: number;
  label: string;
}): ResearchSupplementalValidationSummary {
  const baseline = buildMonteCarloSummary({
    slice: args.baselineSlice,
    iterations: args.iterations,
    percentile: args.percentile,
    seed: args.seed,
    label: `${args.label}:baseline`,
  });
  const current = buildMonteCarloSummary({
    slice: args.currentSlice,
    iterations: args.iterations,
    percentile: args.percentile,
    seed: args.seed,
    label: `${args.label}:current`,
  });

  return {
    baseline: baseline.summary,
    current: current.summary,
    diagnostics: current.diagnostics,
  };
}

function collectComparativeSlice(
  report: TradingBacktestComparativeReport,
  instrumentFilter: Set<string>,
): ResearchMonteCarloSlice {
  const selectedMarkets = report.periods.flatMap((periodResult) =>
    periodResult.report.markets.filter((market) => instrumentFilter.has(market.instrument)),
  );

  return {
    trades: selectedMarkets.flatMap((market) => market.report.trades),
    evaluatedBars: selectedMarkets.reduce((sum, market) => sum + market.report.period.evaluatedBars, 0),
  };
}

function mergeRiskBacktest(
  baseBacktest: TradingBacktestConfig | undefined,
  rules: TradingBacktestRiskRule[],
): TradingBacktestConfig {
  const baseRiskOverrides = baseBacktest?.riskOverrides ?? null;

  return {
    ...baseBacktest,
    captureSteps: false,
    riskOverrides: {
      aggressiveRiskPct: baseRiskOverrides?.aggressiveRiskPct ?? null,
      rules: [...(baseRiskOverrides?.rules ?? []), ...rules],
    },
  };
}

function mergeContextBacktest(
  baseBacktest: TradingBacktestConfig | undefined,
  rules: TradingBacktestMarketSessionRule[],
): TradingBacktestConfig {
  const baseOverrides = baseBacktest?.marketSessionOverrides ?? null;

  return {
    ...baseBacktest,
    captureSteps: false,
    marketSessionOverrides: {
      blockedTradeValidContexts: [...(baseOverrides?.blockedTradeValidContexts ?? []), ...rules],
    },
  };
}

export async function runResearchRiskMonteCarloValidation(args: {
  context: ResearchTaskExecutorContext;
  scenario: TradingSecondLayerRiskStudyScenario;
  affectedInstruments: string[];
}): Promise<ResearchSupplementalValidationSummary | null> {
  const settings = args.context.config.study.robustness?.monteCarlo;
  if (!settings?.enabled) {
    return null;
  }

  const instrumentFilter = new Set(args.affectedInstruments);
  const baselineSlice = collectComparativeSlice(args.context.baseline.aggregateComparative, instrumentFilter);
  const currentComparative = await runTradingHistoricalComparativeSweep({
    periods: args.context.config.study.yearlyPeriods,
    instruments: args.affectedInstruments,
    timeframes: args.context.config.study.timeframes,
    continueOnError: true,
    sourcePreference: args.context.config.study.sourcePreference,
    backtest: mergeRiskBacktest(undefined, args.scenario.rules),
  });
  const currentSlice = collectComparativeSlice(currentComparative, instrumentFilter);

  return runResearchMonteCarloFromSlices({
    baselineSlice,
    currentSlice,
    iterations: settings.iterations,
    percentile: settings.percentile,
    seed: settings.seed,
    label: `${args.context.task.id}:risk:${args.affectedInstruments.join(",")}`,
  });
}

export async function runResearchContextMonteCarloValidation(args: {
  context: ResearchTaskExecutorContext;
  scenario: TradingContextBlockStudyScenario;
  affectedInstruments: string[];
}): Promise<ResearchSupplementalValidationSummary | null> {
  const settings = args.context.config.study.robustness?.monteCarlo;
  if (!settings?.enabled) {
    return null;
  }

  const instrumentFilter = new Set(args.affectedInstruments);
  const baselineSlice = collectComparativeSlice(args.context.baseline.aggregateComparative, instrumentFilter);
  const currentComparative = await runTradingHistoricalComparativeSweep({
    periods: args.context.config.study.yearlyPeriods,
    instruments: args.affectedInstruments,
    timeframes: args.context.config.study.timeframes,
    continueOnError: true,
    sourcePreference: args.context.config.study.sourcePreference,
    backtest: mergeContextBacktest(undefined, args.scenario.rules),
  });
  const currentSlice = collectComparativeSlice(currentComparative, instrumentFilter);

  return runResearchMonteCarloFromSlices({
    baselineSlice,
    currentSlice,
    iterations: settings.iterations,
    percentile: settings.percentile,
    seed: settings.seed,
    label: `${args.context.task.id}:context:${args.affectedInstruments.join(",")}`,
  });
}
