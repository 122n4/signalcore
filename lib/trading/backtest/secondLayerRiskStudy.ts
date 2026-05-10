import type { TradingTimeframe } from "@/lib/trading/data";

import {
  runTradingHistoricalComparativeSweep,
  type TradingBacktestComparativeReport,
} from "./comparativeSweep";
import { computeBacktestMetrics } from "./metrics";
import {
  runTradingWalkForwardStudy,
  type TradingWalkForwardStudyReport,
} from "./walkForwardStudy";
import type { TradingHistoricalSourcePreference } from "./datasets";
import type { TradingHistoricalPeriod } from "./periods";
import type {
  TradingBacktestConfig,
  TradingBacktestRiskRule,
  TradingBacktestTrade,
} from "./types";

export type TradingSecondLayerRiskStudyScenario = {
  id: string;
  description: string;
  rules: TradingBacktestRiskRule[];
};

export type TradingSecondLayerRiskStudyMetricSummary = {
  totalTrades: number;
  winRate: number;
  averageRiskReward: number | null;
  expectancy: number;
  profitFactor: number | null;
  maxDrawdown: number;
};

export type TradingSecondLayerRiskStudyRequest = {
  yearlyPeriods: TradingHistoricalPeriod[];
  crisisPeriods: TradingHistoricalPeriod[];
  scenarios: TradingSecondLayerRiskStudyScenario[];
  instruments?: string[];
  timeframes?: TradingTimeframe[];
  sourcePreference?: TradingHistoricalSourcePreference;
  backtest?: TradingBacktestConfig;
  walkForward?: {
    mode?: "actual" | "comparative_proxy";
    from?: string;
    to?: string;
    windowing?: {
      primaryTimeframe?: TradingTimeframe | null;
      trainFraction?: number;
      testFraction?: number;
      minTrainBars?: number;
      minTestBars?: number;
    };
  };
  baseline?: {
    yearlyComparatives?: TradingBacktestComparativeReport[];
    crisisComparatives?: TradingBacktestComparativeReport[];
  };
};

export type TradingSecondLayerRiskStudyScenarioResult = {
  id: string;
  description: string;
  affectedInstruments: string[];
  rules: TradingBacktestRiskRule[];
  aggregate: {
    current: TradingSecondLayerRiskStudyMetricSummary;
    delta: {
      totalTrades: number;
      winRate: number;
      expectancy: number;
      profitFactor: number | null;
      maxDrawdown: number;
    };
  };
  crisis: {
    current: TradingSecondLayerRiskStudyMetricSummary;
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
    current: TradingSecondLayerRiskStudyMetricSummary;
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

export type TradingSecondLayerRiskStudyReport = {
  generatedAt: string;
  request: {
    yearlyPeriods: TradingHistoricalPeriod[];
    crisisPeriods: TradingHistoricalPeriod[];
    instruments: string[];
    timeframes: TradingTimeframe[];
    walkForward: TradingSecondLayerRiskStudyRequest["walkForward"];
  };
  baseline: {
    aggregate: TradingSecondLayerRiskStudyMetricSummary;
    crisis: TradingSecondLayerRiskStudyMetricSummary;
    walkForwardByAffectedInstruments: Record<string, TradingSecondLayerRiskStudyMetricSummary>;
  };
  scenarios: TradingSecondLayerRiskStudyScenarioResult[];
  keepableScenarios: Array<{
    id: string;
    description: string;
    aggregateExpectancy: number;
    crisisExpectancy: number;
    walkForwardExpectancy: number;
  }>;
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
): TradingSecondLayerRiskStudyMetricSummary {
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
  current: TradingSecondLayerRiskStudyMetricSummary,
  baseline: TradingSecondLayerRiskStudyMetricSummary,
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

function buildInstrumentSlicesFromComparative(
  report: TradingBacktestComparativeReport,
): Map<string, { trades: TradingBacktestTrade[]; evaluatedBars: number }> {
  const output = new Map<string, { trades: TradingBacktestTrade[]; evaluatedBars: number }>();

  for (const instrument of report.request.instruments) {
    const selectedMarkets = report.periods.flatMap((periodResult) =>
      periodResult.report.markets.filter((market) => market.instrument === instrument),
    );

    if (selectedMarkets.length === 0) {
      continue;
    }

    output.set(instrument, {
      trades: selectedMarkets.flatMap((market) => market.report.trades),
      evaluatedBars: selectedMarkets.reduce((sum, market) => sum + market.report.period.evaluatedBars, 0),
    });
  }

  return output;
}

function collectTradesFromComparativeCollection(
  reports: TradingBacktestComparativeReport[],
  instrumentFilter?: Set<string>,
): { trades: TradingBacktestTrade[]; evaluatedBars: number } {
  const byInstrument = new Map<string, { trades: TradingBacktestTrade[]; evaluatedBars: number }>();

  for (const report of reports) {
    const slices = buildInstrumentSlicesFromComparative(report);

    for (const [instrument, slice] of slices.entries()) {
      byInstrument.set(instrument, slice);
    }
  }

  const selected = Array.from(byInstrument.entries())
    .filter(([instrument]) => !instrumentFilter || instrumentFilter.has(instrument))
    .map(([, slice]) => slice);

  return {
    trades: selected.flatMap((slice) => slice.trades),
    evaluatedBars: selected.reduce((sum, slice) => sum + slice.evaluatedBars, 0),
  };
}

function computeSummaryFromComparativeCollection(
  reports: TradingBacktestComparativeReport[],
  instrumentFilter?: Set<string>,
): TradingSecondLayerRiskStudyMetricSummary {
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

function mergeBacktestWithScenario(
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

function buildBaselineBacktest(baseBacktest: TradingBacktestConfig | undefined): TradingBacktestConfig {
  return {
    ...baseBacktest,
    captureSteps: false,
  };
}

function resolveAffectedInstruments(rules: TradingBacktestRiskRule[]): string[] {
  return Array.from(
    new Set(
      rules
        .map((rule) => rule.instrument?.trim().toUpperCase())
        .filter((instrument): instrument is string => Boolean(instrument)),
    ),
  );
}

export async function runTradingSecondLayerRiskStudy(
  request: TradingSecondLayerRiskStudyRequest,
): Promise<TradingSecondLayerRiskStudyReport> {
  const instruments = request.instruments ?? [
    "EURUSD",
    "GBPUSD",
    "USDJPY",
    "XAUUSD",
    "NAS100",
    "US500",
    "BTCUSD",
    "ETHUSD",
  ];
  const timeframes = request.timeframes ?? ["4h", "1h", "15m"];
  const baselineBacktest = buildBaselineBacktest(request.backtest);
  const baselineYearlyComparatives =
    request.baseline?.yearlyComparatives && request.baseline.yearlyComparatives.length > 0
      ? request.baseline.yearlyComparatives
      : [
          await runTradingHistoricalComparativeSweep({
            periods: request.yearlyPeriods,
            instruments,
            timeframes,
            continueOnError: true,
            sourcePreference: request.sourcePreference,
            backtest: baselineBacktest,
          }),
        ];
  const baselineCrisisComparatives =
    request.baseline?.crisisComparatives && request.baseline.crisisComparatives.length > 0
      ? request.baseline.crisisComparatives
      : [
          await runTradingHistoricalComparativeSweep({
            periods: request.crisisPeriods,
            instruments,
            timeframes,
            continueOnError: true,
            sourcePreference: request.sourcePreference,
            backtest: baselineBacktest,
          }),
        ];
  const baselineAggregateSummary = computeSummaryFromComparativeCollection(baselineYearlyComparatives);
  const baselineCrisisSummary = computeSummaryFromComparativeCollection(baselineCrisisComparatives);

  const baselineWalkForwardCache = new Map<string, TradingSecondLayerRiskStudyMetricSummary>();
  const scenarioResults: TradingSecondLayerRiskStudyScenarioResult[] = [];
  const walkForwardMode = request.walkForward?.mode ?? "actual";

  for (const scenario of request.scenarios) {
    const affectedInstruments = resolveAffectedInstruments(scenario.rules);

    if (affectedInstruments.length === 0) {
      throw new Error(`Second-layer scenario "${scenario.id}" must target at least one instrument.`);
    }

    const scenarioBacktest = mergeBacktestWithScenario(request.backtest, scenario.rules);
    const affectedYearly = await runTradingHistoricalComparativeSweep({
      periods: request.yearlyPeriods,
      instruments: affectedInstruments,
      timeframes,
      continueOnError: true,
      sourcePreference: request.sourcePreference,
      backtest: scenarioBacktest,
    });
    const affectedCrisis = await runTradingHistoricalComparativeSweep({
      periods: request.crisisPeriods,
      instruments: affectedInstruments,
      timeframes,
      continueOnError: true,
      sourcePreference: request.sourcePreference,
      backtest: scenarioBacktest,
    });
    const aggregateSummary = computeSummaryFromComparativeCollection([
      ...baselineYearlyComparatives,
      affectedYearly,
    ]);
    const crisisSummary = computeSummaryFromComparativeCollection([
      ...baselineCrisisComparatives,
      affectedCrisis,
    ]);

    const walkForwardKey = affectedInstruments.slice().sort().join(",");

    let baselineWalkForwardSummary = baselineWalkForwardCache.get(walkForwardKey) ?? null;

    if (!baselineWalkForwardSummary) {
      if (walkForwardMode === "comparative_proxy") {
        baselineWalkForwardSummary = computeSummaryFromComparativeCollection(
          baselineYearlyComparatives,
          new Set(affectedInstruments),
        );
      } else {
        const baselineWalkForward = await runTradingWalkForwardStudy({
          instruments: affectedInstruments,
          from: request.walkForward?.from ?? request.yearlyPeriods[0]?.from ?? "2020-01-01T00:00:00.000Z",
          to:
            request.walkForward?.to ??
            request.yearlyPeriods[request.yearlyPeriods.length - 1]?.to ??
            "2025-12-31T23:59:59.000Z",
          timeframes,
          sourcePreference: request.sourcePreference,
          backtest: baselineBacktest,
          windowing: request.walkForward?.windowing,
        });
        baselineWalkForwardSummary = toWalkForwardSummary(baselineWalkForward);
      }
      baselineWalkForwardCache.set(walkForwardKey, baselineWalkForwardSummary);
    }

    const walkForwardSummary =
      walkForwardMode === "comparative_proxy"
        ? computeSummaryFromComparativeCollection([affectedYearly], new Set(affectedInstruments))
        : toWalkForwardSummary(
            await runTradingWalkForwardStudy({
              instruments: affectedInstruments,
              from: request.walkForward?.from ?? request.yearlyPeriods[0]?.from ?? "2020-01-01T00:00:00.000Z",
              to:
                request.walkForward?.to ??
                request.yearlyPeriods[request.yearlyPeriods.length - 1]?.to ??
                "2025-12-31T23:59:59.000Z",
              timeframes,
              sourcePreference: request.sourcePreference,
              backtest: scenarioBacktest,
              windowing: request.walkForward?.windowing,
            }),
          );
    const aggregateDelta = buildDelta(aggregateSummary, baselineAggregateSummary);
    const crisisDelta = buildDelta(crisisSummary, baselineCrisisSummary);
    const walkForwardDelta = buildDelta(walkForwardSummary, baselineWalkForwardSummary);
    const crisisBreakEvenOrBetter =
      crisisSummary.expectancy >= 0 && (crisisSummary.profitFactor ?? 0) >= 1;
    const walkForwardBreakEvenOrBetter =
      walkForwardSummary.expectancy >= 0 && (walkForwardSummary.profitFactor ?? 0) >= 1;
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
    const keep =
      aggregateImproved &&
      crisesNotWorse &&
      walkForwardNotWorse &&
      (walkForwardMode === "comparative_proxy" || walkForwardBreakEvenOrBetter);

    scenarioResults.push({
      id: scenario.id,
      description: scenario.description,
      affectedInstruments,
      rules: scenario.rules,
      aggregate: {
        current: aggregateSummary,
        delta: aggregateDelta,
      },
      crisis: {
        current: crisisSummary,
        delta: crisisDelta,
        breakEvenOrBetter: crisisBreakEvenOrBetter,
      },
      walkForward: {
        current: walkForwardSummary,
        delta: walkForwardDelta,
        breakEvenOrBetter: walkForwardBreakEvenOrBetter,
      },
      gates: {
        aggregateImproved,
        crisesNotWorse,
        walkForwardNotWorse,
        keep,
      },
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    request: {
      yearlyPeriods: request.yearlyPeriods,
      crisisPeriods: request.crisisPeriods,
      instruments,
      timeframes,
      walkForward: request.walkForward,
    },
    baseline: {
      aggregate: baselineAggregateSummary,
      crisis: baselineCrisisSummary,
      walkForwardByAffectedInstruments: Object.fromEntries(baselineWalkForwardCache.entries()),
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
