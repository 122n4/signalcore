import type { TradingTimeframe } from "@/lib/trading/data";

import { runTradingHistoricalComparativeSweep, type TradingBacktestComparativeReport } from "./comparativeSweep";
import { computeBacktestMetrics } from "./metrics";
import { runTradingWalkForwardStudy, type TradingWalkForwardStudyReport } from "./walkForwardStudy";
import type { TradingHistoricalSourcePreference } from "./datasets";
import type { TradingHistoricalPeriod } from "./periods";
import type {
  TradingBacktestConfig,
  TradingBacktestMarketSessionRule,
  TradingBacktestTrade,
} from "./types";

export type TradingContextBlockStudyScenario = {
  id: string;
  description: string;
  rules: TradingBacktestMarketSessionRule[];
};

export type TradingContextBlockStudyMetricSummary = {
  totalTrades: number;
  winRate: number;
  averageRiskReward: number | null;
  expectancy: number;
  profitFactor: number | null;
  maxDrawdown: number;
};

export type TradingContextBlockStudyRequest = {
  yearlyPeriods: TradingHistoricalPeriod[];
  crisisPeriods: TradingHistoricalPeriod[];
  scenarios: TradingContextBlockStudyScenario[];
  instruments?: string[];
  timeframes?: TradingTimeframe[];
  sourcePreference?: TradingHistoricalSourcePreference;
  backtest?: TradingBacktestConfig;
  walkForward?: {
    from: string;
    to: string;
    windowing?: {
      primaryTimeframe?: TradingTimeframe | null;
      trainFraction?: number;
      testFraction?: number;
      minTrainBars?: number;
      minTestBars?: number;
    };
  };
  baseline?: {
    yearlyComparatives?: TradingBacktestComparativeReport[] | null;
    crisisComparatives?: TradingBacktestComparativeReport[] | null;
    walkForwardByAffectedInstruments?: Record<string, TradingContextBlockStudyMetricSummary> | null;
  };
  onProgress?: (progress: {
    stage: "aggregate" | "crisis" | "walkforward";
    scenarioId?: string;
    message: string;
  }) => void | Promise<void>;
};

export type TradingContextBlockStudyScenarioResult = {
  id: string;
  description: string;
  affectedInstruments: string[];
  rules: TradingBacktestMarketSessionRule[];
  aggregate: {
    current: TradingContextBlockStudyMetricSummary;
    delta: {
      totalTrades: number;
      winRate: number;
      expectancy: number;
      profitFactor: number | null;
      maxDrawdown: number;
    };
  };
  crisis: {
    current: TradingContextBlockStudyMetricSummary;
    delta: {
      totalTrades: number;
      winRate: number;
      expectancy: number;
      profitFactor: number | null;
      maxDrawdown: number;
    };
    breakEvenOrBetter: boolean;
  };
  walkForward: {
    current: TradingContextBlockStudyMetricSummary;
    delta: {
      totalTrades: number;
      winRate: number;
      expectancy: number;
      profitFactor: number | null;
      maxDrawdown: number;
    };
    breakEvenOrBetter: boolean;
  };
  gates: {
    aggregateImproved: boolean;
    crisesNotWorse: boolean;
    walkForwardNotWorse: boolean;
    keep: boolean;
  };
};

export type TradingContextBlockStudyReport = {
  generatedAt: string;
  request: {
    yearlyPeriods: TradingHistoricalPeriod[];
    crisisPeriods: TradingHistoricalPeriod[];
    instruments: string[];
    timeframes: TradingTimeframe[];
    walkForward: TradingContextBlockStudyRequest["walkForward"];
  };
  baseline: {
    aggregate: TradingContextBlockStudyMetricSummary;
    crisis: TradingContextBlockStudyMetricSummary;
    walkForwardByAffectedInstruments: Record<string, TradingContextBlockStudyMetricSummary>;
  };
  scenarios: TradingContextBlockStudyScenarioResult[];
  keepableScenarios: Array<{
    id: string;
    description: string;
    aggregateExpectancy: number;
    crisisExpectancy: number;
    walkForwardExpectancy: number;
  }>;
  artifacts?: {
    baselineYearlyComparative?: string;
    baselineCrisisComparative?: string;
  };
};

function roundMetric(value: number | null): number | null {
  if (value === null) {
    return null;
  }

  return Math.round(value * 10_000) / 10_000;
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

function toWalkForwardSummary(
  report: TradingWalkForwardStudyReport,
): TradingContextBlockStudyMetricSummary {
  return {
    totalTrades: report.aggregate.totalTrades,
    winRate: report.aggregate.winRate,
    averageRiskReward: report.aggregate.averageRiskReward,
    expectancy: report.aggregate.expectancy,
    profitFactor: report.aggregate.profitFactor,
    maxDrawdown: report.aggregate.maxDrawdown,
  };
}

function buildDelta(
  current: TradingContextBlockStudyMetricSummary,
  baseline: TradingContextBlockStudyMetricSummary,
) {
  return {
    totalTrades: current.totalTrades - baseline.totalTrades,
    winRate: roundMetric(current.winRate - baseline.winRate) ?? 0,
    expectancy: roundMetric(current.expectancy - baseline.expectancy) ?? 0,
    profitFactor:
      current.profitFactor === null || baseline.profitFactor === null
        ? null
        : roundMetric(current.profitFactor - baseline.profitFactor),
    maxDrawdown: roundMetric(current.maxDrawdown - baseline.maxDrawdown) ?? 0,
  };
}

function collectTradesFromComparative(
  report: TradingBacktestComparativeReport,
  instrumentFilter?: Set<string>,
): { trades: TradingBacktestTrade[]; evaluatedBars: number } {
  const selectedMarkets = report.periods.flatMap((periodResult) =>
    periodResult.report.markets.filter(
      (market) => !instrumentFilter || instrumentFilter.has(market.instrument),
    ),
  );

  return {
    trades: selectedMarkets.flatMap((market) => market.report.trades),
    evaluatedBars: selectedMarkets.reduce((sum, market) => sum + market.report.period.evaluatedBars, 0),
  };
}

function collectTradesFromComparativeCollection(
  reports: TradingBacktestComparativeReport[],
  instrumentFilter?: Set<string>,
): { trades: TradingBacktestTrade[]; evaluatedBars: number } {
  const selected = reports.map((report) => collectTradesFromComparative(report, instrumentFilter));

  return {
    trades: selected.flatMap((entry) => entry.trades),
    evaluatedBars: selected.reduce((sum, entry) => sum + entry.evaluatedBars, 0),
  };
}

function computeSummaryFromComparativeCollection(
  reports: TradingBacktestComparativeReport[],
  instrumentFilter?: Set<string>,
): TradingContextBlockStudyMetricSummary {
  const collected = collectTradesFromComparativeCollection(reports, instrumentFilter);
  const metrics = computeBacktestMetrics({
    trades: collected.trades,
    evaluatedBars: collected.evaluatedBars,
    equityValues: buildEquityValues(collected.trades),
  });

  return {
    totalTrades: collected.trades.length,
    winRate: metrics.winRate,
    averageRiskReward: metrics.averageRiskReward,
    expectancy: metrics.expectancy,
    profitFactor: metrics.profitFactor,
    maxDrawdown: metrics.maxDrawdown,
  };
}

function buildMergedSummary(args: {
  baselineFull: TradingBacktestComparativeReport;
  scenarioAffected: TradingBacktestComparativeReport;
  affectedInstruments: Set<string>;
}): TradingContextBlockStudyMetricSummary {
  const baselineUnchanged = collectTradesFromComparative(
    args.baselineFull,
    new Set(
      args.baselineFull.request.instruments.filter(
        (instrument) => !args.affectedInstruments.has(instrument),
      ),
    ),
  );
  const scenarioChanged = collectTradesFromComparative(args.scenarioAffected, args.affectedInstruments);
  const mergedTrades = [...baselineUnchanged.trades, ...scenarioChanged.trades].sort(
    (left, right) => left.closedAt.localeCompare(right.closedAt),
  );
  const metrics = computeBacktestMetrics({
    trades: mergedTrades,
    evaluatedBars: baselineUnchanged.evaluatedBars + scenarioChanged.evaluatedBars,
    equityValues: buildEquityValues(mergedTrades),
  });

  return {
    totalTrades: mergedTrades.length,
    winRate: metrics.winRate,
    averageRiskReward: metrics.averageRiskReward,
    expectancy: metrics.expectancy,
    profitFactor: metrics.profitFactor,
    maxDrawdown: metrics.maxDrawdown,
  };
}

function mergeBacktestWithScenario(
  baseBacktest: TradingBacktestConfig | undefined,
  rules: TradingBacktestMarketSessionRule[],
): TradingBacktestConfig {
  const baseOverrides = baseBacktest?.marketSessionOverrides ?? null;

  return {
    ...baseBacktest,
    captureSteps: false,
    marketSessionOverrides: {
      blockedTradeValidContexts: [
        ...(baseOverrides?.blockedTradeValidContexts ?? []),
        ...rules,
      ],
    },
  };
}

function buildBaselineBacktest(
  baseBacktest: TradingBacktestConfig | undefined,
): TradingBacktestConfig {
  return {
    ...baseBacktest,
    captureSteps: false,
  };
}

export async function runTradingContextBlockStudy(
  request: TradingContextBlockStudyRequest,
): Promise<TradingContextBlockStudyReport> {
  const requestedInstruments = request.instruments ?? [
    "EURUSD",
    "GBPUSD",
    "USDJPY",
    "XAUUSD",
    "NAS100",
    "US500",
    "BTCUSD",
    "ETHUSD",
  ];
  const requestedTimeframes = request.timeframes ?? ["4h", "1h", "15m"];
  const baseBacktest = buildBaselineBacktest(request.backtest);
  const baselineYearlyComparatives =
    request.baseline?.yearlyComparatives && request.baseline.yearlyComparatives.length > 0
      ? request.baseline.yearlyComparatives
      : [
          await runTradingHistoricalComparativeSweep({
            periods: request.yearlyPeriods,
            instruments: requestedInstruments,
            timeframes: requestedTimeframes,
            continueOnError: true,
            sourcePreference: request.sourcePreference,
            backtest: baseBacktest,
          }),
        ];
  const baselineCrisisComparatives =
    request.baseline?.crisisComparatives && request.baseline.crisisComparatives.length > 0
      ? request.baseline.crisisComparatives
      : [
          await runTradingHistoricalComparativeSweep({
            periods: request.crisisPeriods,
            instruments: requestedInstruments,
            timeframes: requestedTimeframes,
            continueOnError: true,
            sourcePreference: request.sourcePreference,
            backtest: baseBacktest,
          }),
        ];
  const baselineAggregateSummary = computeSummaryFromComparativeCollection(
    baselineYearlyComparatives,
  );
  const baselineCrisisSummary = computeSummaryFromComparativeCollection(baselineCrisisComparatives);

  const baselineWalkForwardCache = new Map<string, TradingContextBlockStudyMetricSummary>(
    Object.entries(request.baseline?.walkForwardByAffectedInstruments ?? {}),
  );
  const scenarioResults: TradingContextBlockStudyScenarioResult[] = [];

  for (const scenario of request.scenarios) {
    const affectedInstruments = Array.from(
      new Set(
        scenario.rules
          .map((rule) => rule.instrument?.trim().toUpperCase())
          .filter((instrument): instrument is string => Boolean(instrument)),
      ),
    );
    const affectedInstrumentSet = new Set(affectedInstruments);

    await request.onProgress?.({
      stage: "aggregate",
      scenarioId: scenario.id,
      message: `Running aggregate context sweep for ${scenario.id} on ${affectedInstruments.join(", ")}.`,
    });
    const affectedYearly = await runTradingHistoricalComparativeSweep({
      periods: request.yearlyPeriods,
      instruments: affectedInstruments,
      timeframes: requestedTimeframes,
      continueOnError: true,
      sourcePreference: request.sourcePreference,
      backtest: mergeBacktestWithScenario(baseBacktest, scenario.rules),
    });
    await request.onProgress?.({
      stage: "crisis",
      scenarioId: scenario.id,
      message: `Running crisis context sweep for ${scenario.id} on ${affectedInstruments.join(", ")}.`,
    });
    const affectedCrisis = await runTradingHistoricalComparativeSweep({
      periods: request.crisisPeriods,
      instruments: affectedInstruments,
      timeframes: requestedTimeframes,
      continueOnError: true,
      sourcePreference: request.sourcePreference,
      backtest: mergeBacktestWithScenario(baseBacktest, scenario.rules),
    });

    const instrumentKey = affectedInstruments.slice().sort().join("|");

    if (!baselineWalkForwardCache.has(instrumentKey)) {
      await request.onProgress?.({
        stage: "walkforward",
        scenarioId: scenario.id,
        message: `Building baseline walk-forward reference for ${scenario.id}.`,
      });
      const baselineWalkForward = await runTradingWalkForwardStudy({
        instruments: affectedInstruments,
        from: request.walkForward?.from ?? "2020-01-01T00:00:00.000Z",
        to: request.walkForward?.to ?? "2025-12-31T23:59:59.000Z",
        timeframes: requestedTimeframes,
        sourcePreference: request.sourcePreference,
        backtest: baseBacktest,
        windowing: request.walkForward?.windowing,
      });
      baselineWalkForwardCache.set(instrumentKey, toWalkForwardSummary(baselineWalkForward));
    }

    await request.onProgress?.({
      stage: "walkforward",
      scenarioId: scenario.id,
      message: `Running candidate walk-forward context validation for ${scenario.id}.`,
    });
    const scenarioWalkForward = await runTradingWalkForwardStudy({
      instruments: affectedInstruments,
      from: request.walkForward?.from ?? "2020-01-01T00:00:00.000Z",
      to: request.walkForward?.to ?? "2025-12-31T23:59:59.000Z",
      timeframes: requestedTimeframes,
      sourcePreference: request.sourcePreference,
      backtest: mergeBacktestWithScenario(baseBacktest, scenario.rules),
      windowing: request.walkForward?.windowing,
    });

    const aggregateSummary = buildMergedSummary({
      baselineFull: baselineYearlyComparatives[baselineYearlyComparatives.length - 1],
      scenarioAffected: affectedYearly,
      affectedInstruments: affectedInstrumentSet,
    });
    const crisisSummary = buildMergedSummary({
      baselineFull: baselineCrisisComparatives[baselineCrisisComparatives.length - 1],
      scenarioAffected: affectedCrisis,
      affectedInstruments: affectedInstrumentSet,
    });
    const baselineWalkForwardSummary = baselineWalkForwardCache.get(instrumentKey)!;
    const walkForwardSummary = toWalkForwardSummary(scenarioWalkForward);

    const aggregateImproved =
      aggregateSummary.expectancy >= baselineAggregateSummary.expectancy &&
      (aggregateSummary.profitFactor ?? 0) >= (baselineAggregateSummary.profitFactor ?? 0) &&
      aggregateSummary.maxDrawdown <= baselineAggregateSummary.maxDrawdown;
    const crisesNotWorse =
      crisisSummary.expectancy >= baselineCrisisSummary.expectancy &&
      (crisisSummary.profitFactor ?? 0) >= (baselineCrisisSummary.profitFactor ?? 0) &&
      crisisSummary.maxDrawdown <= baselineCrisisSummary.maxDrawdown;
    const walkForwardNotWorse =
      walkForwardSummary.expectancy >= baselineWalkForwardSummary.expectancy &&
      (walkForwardSummary.profitFactor ?? 0) >= (baselineWalkForwardSummary.profitFactor ?? 0) &&
      walkForwardSummary.maxDrawdown <= baselineWalkForwardSummary.maxDrawdown;

    scenarioResults.push({
      id: scenario.id,
      description: scenario.description,
      affectedInstruments,
      rules: scenario.rules,
      aggregate: {
        current: aggregateSummary,
        delta: buildDelta(aggregateSummary, baselineAggregateSummary),
      },
      crisis: {
        current: crisisSummary,
        delta: buildDelta(crisisSummary, baselineCrisisSummary),
        breakEvenOrBetter: crisisSummary.expectancy >= 0 && (crisisSummary.profitFactor ?? 0) >= 1,
      },
      walkForward: {
        current: walkForwardSummary,
        delta: buildDelta(walkForwardSummary, baselineWalkForwardSummary),
        breakEvenOrBetter:
          walkForwardSummary.expectancy >= 0 && (walkForwardSummary.profitFactor ?? 0) >= 1,
      },
      gates: {
        aggregateImproved,
        crisesNotWorse,
        walkForwardNotWorse,
        keep: aggregateImproved && crisesNotWorse && walkForwardNotWorse,
      },
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    request: {
      yearlyPeriods: request.yearlyPeriods,
      crisisPeriods: request.crisisPeriods,
      instruments: requestedInstruments,
      timeframes: requestedTimeframes,
      walkForward: request.walkForward,
    },
    baseline: {
      aggregate: baselineAggregateSummary,
      crisis: baselineCrisisSummary,
      walkForwardByAffectedInstruments: Object.fromEntries(
        Array.from(baselineWalkForwardCache.entries()).map(([key, value]) => [key, value]),
      ),
    },
    scenarios: scenarioResults,
    keepableScenarios: scenarioResults
      .filter((scenario) => scenario.gates.keep)
      .map((scenario) => ({
        id: scenario.id,
        description: scenario.description,
        aggregateExpectancy: scenario.aggregate.current.expectancy,
        crisisExpectancy: scenario.crisis.current.expectancy,
        walkForwardExpectancy: scenario.walkForward.current.expectancy,
      })),
  };
}
