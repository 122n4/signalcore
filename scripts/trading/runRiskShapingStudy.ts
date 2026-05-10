import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  computeBacktestMetrics,
  runTradingHistoricalComparativeSweep,
  writeTradingHistoricalComparativeReport,
  type TradingBacktestComparativeReport,
  type TradingBacktestRiskRule,
  type TradingBacktestTrade,
} from "@/lib/trading/backtest";

type ScenarioDefinition = {
  id: string;
  description: string;
  rules: TradingBacktestRiskRule[];
};

type MetricSummary = {
  totalTrades: number;
  winRate: number;
  averageRiskReward: number | null;
  expectancy: number;
  profitFactor: number | null;
  maxDrawdown: number;
};

type ScenarioResult = {
  id: string;
  description: string;
  rules: TradingBacktestRiskRule[];
  aggregate: {
    current: MetricSummary;
    delta: {
      totalTrades: number;
      winRate: number;
      expectancy: number;
      profitFactor: number | null;
      maxDrawdown: number;
    };
  };
  crisis: {
    current: MetricSummary;
    delta: {
      totalTrades: number;
      winRate: number;
      expectancy: number;
      profitFactor: number | null;
      maxDrawdown: number;
    };
    breakEvenOrBetter: boolean;
  };
  walkForwardStyle: {
    current: MetricSummary;
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
  artifacts: {
    affectedYearlyComparative: string;
    affectedCrisisComparative: string;
  };
};

const YEARS = [
  { label: "2020", from: "2020-01-01T00:00:00.000Z", to: "2020-12-31T23:59:59.000Z" },
  { label: "2021", from: "2021-01-01T00:00:00.000Z", to: "2021-12-31T23:59:59.000Z" },
  { label: "2022", from: "2022-01-01T00:00:00.000Z", to: "2022-12-31T23:59:59.000Z" },
  { label: "2023", from: "2023-01-01T00:00:00.000Z", to: "2023-12-31T23:59:59.000Z" },
  { label: "2024", from: "2024-01-01T00:00:00.000Z", to: "2024-12-31T23:59:59.000Z" },
  { label: "2025", from: "2025-01-01T00:00:00.000Z", to: "2025-12-31T23:59:59.000Z" },
] as const;

const CRISIS_PERIODS = [
  { label: "covid_crash", from: "2020-02-15T00:00:00.000Z", to: "2020-06-30T23:59:59.000Z" },
  {
    label: "inflation_war_shock",
    from: "2022-02-01T00:00:00.000Z",
    to: "2022-06-30T23:59:59.000Z",
  },
  { label: "banking_stress", from: "2023-03-01T00:00:00.000Z", to: "2023-05-31T23:59:59.000Z" },
] as const;

const OUTPUT_DIR = path.resolve("artifacts/trading-backtests");
const BASELINE_FULL_YEARLY_PATH = path.resolve(
  "artifacts/trading-backtests/trading-comparative-sweep-local-2020-2025-yearly-live_playbook_market_session_calibrated.json",
);
const BASELINE_FULL_CRISIS_PATH = path.resolve(
  "artifacts/trading-backtests/trading-crisis-comparative-local-live_playbook_market_session_calibrated.json",
);
const OUTPUT_PATH = path.resolve(
  "artifacts/trading-backtests/trading-risk-shaping-study-local-2020-2025-live_playbook_market_session_calibrated.json",
);

const SCENARIOS: ScenarioDefinition[] = [
  {
    id: "nas100_breakout_soft_risk",
    description: "Reduce NAS100 breakout continuation exposure softly to protect crisis equity without cutting the block.",
    rules: [
      {
        instrument: "NAS100",
        setupTypes: ["breakout_continuation"],
        riskMultiplier: 0.75,
        reason: "Risk shaping reduced NAS100 breakout continuation exposure.",
      },
    ],
  },
  {
    id: "nas100_breakout_half_risk",
    description: "Cut NAS100 breakout continuation exposure in half across the affected context.",
    rules: [
      {
        instrument: "NAS100",
        setupTypes: ["breakout_continuation"],
        riskMultiplier: 0.5,
        reason: "Risk shaping halved NAS100 breakout continuation exposure.",
      },
    ],
  },
  {
    id: "nas100_crisis_sessions_half_risk",
    description: "Halve NAS100 exposure in NY open and London/NY overlap where crisis expectancy is weak.",
    rules: [
      {
        instrument: "NAS100",
        sessions: ["ny_open", "london_ny_overlap"],
        riskMultiplier: 0.5,
        reason: "Risk shaping halved NAS100 exposure in weak crisis sessions.",
      },
    ],
  },
  {
    id: "us500_pre_market_half_risk",
    description: "Halve US500 pre-market exposure instead of blocking the session entirely.",
    rules: [
      {
        instrument: "US500",
        sessions: ["pre_market"],
        riskMultiplier: 0.5,
        reason: "Risk shaping halved US500 pre-market exposure.",
      },
    ],
  },
  {
    id: "indices_mixed_soft_risk",
    description: "Apply softer NAS100 breakout shaping plus deeper US500 pre-market shaping.",
    rules: [
      {
        instrument: "NAS100",
        setupTypes: ["breakout_continuation"],
        riskMultiplier: 0.75,
        reason: "Risk shaping reduced NAS100 breakout continuation exposure.",
      },
      {
        instrument: "US500",
        sessions: ["pre_market"],
        riskMultiplier: 0.5,
        reason: "Risk shaping halved US500 pre-market exposure.",
      },
    ],
  },
];

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

function toSummary(source: {
  totalTrades: number;
  winRate: number;
  averageRiskReward: number | null;
  expectancy: number;
  profitFactor: number | null;
  maxDrawdown: number;
}): MetricSummary {
  return {
    totalTrades: source.totalTrades,
    winRate: source.winRate,
    averageRiskReward: source.averageRiskReward,
    expectancy: source.expectancy,
    profitFactor: source.profitFactor,
    maxDrawdown: source.maxDrawdown,
  };
}

function buildDelta(current: MetricSummary, baseline: MetricSummary) {
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

async function readJsonFile<T>(inputPath: string): Promise<T> {
  const raw = await readFile(inputPath, "utf8");
  return JSON.parse(raw) as T;
}

function buildScenarioBacktest(rules: TradingBacktestRiskRule[]) {
  return rules.length > 0
    ? {
        captureSteps: false,
        riskOverrides: {
          rules,
        },
      }
    : {
        captureSteps: false,
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

function computeSummaryFromComparative(
  report: TradingBacktestComparativeReport,
  instrumentFilter?: Set<string>,
): MetricSummary {
  const collected = collectTradesFromComparative(report, instrumentFilter);
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
}): MetricSummary {
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

async function runAffectedComparative(args: {
  periods: readonly { label: string; from: string; to: string }[];
  rules: TradingBacktestRiskRule[];
  instruments: string[];
  timeframes: string[];
  outputName: string;
}): Promise<{ report: TradingBacktestComparativeReport; outputPath: string }> {
  const report = await runTradingHistoricalComparativeSweep({
    periods: [...args.periods],
    instruments: args.instruments,
    timeframes: args.timeframes as ("4h" | "1h" | "15m")[],
    continueOnError: true,
    sourcePreference: "local_only",
    backtest: buildScenarioBacktest(args.rules),
  });
  const outputPath = path.resolve(OUTPUT_DIR, args.outputName);

  await writeTradingHistoricalComparativeReport({
    report,
    outputPath,
  });

  return { report, outputPath };
}

async function main() {
  const requestedScenarioIds = new Set(
    process.argv
      .slice(2)
      .map((argument) => argument.trim())
      .filter((argument) => argument.length > 0),
  );
  const scenariosToRun =
    requestedScenarioIds.size > 0
      ? SCENARIOS.filter((scenario) => requestedScenarioIds.has(scenario.id))
      : SCENARIOS;

  if (requestedScenarioIds.size > 0 && scenariosToRun.length === 0) {
    throw new Error(`No risk shaping scenarios matched: ${Array.from(requestedScenarioIds).join(", ")}`);
  }

  const baselineFullYearly = await readJsonFile<TradingBacktestComparativeReport>(BASELINE_FULL_YEARLY_PATH);
  const baselineFullCrisis = await readJsonFile<TradingBacktestComparativeReport>(BASELINE_FULL_CRISIS_PATH);
  const baselineAggregateSummary = toSummary(baselineFullYearly.aggregate.summary);
  const baselineCrisisSummary = toSummary(baselineFullCrisis.aggregate.summary);

  const scenarioResults: ScenarioResult[] = [];

  for (const scenario of scenariosToRun) {
    const affectedInstruments = Array.from(
      new Set(
        scenario.rules
          .map((rule) => rule.instrument?.trim().toUpperCase())
          .filter((instrument): instrument is string => Boolean(instrument)),
      ),
    );
    const affectedInstrumentSet = new Set(affectedInstruments);

    const { report: affectedYearlyReport, outputPath: affectedYearlyPath } = await runAffectedComparative({
      periods: YEARS,
      rules: scenario.rules,
      instruments: affectedInstruments,
      timeframes: baselineFullYearly.request.timeframes,
      outputName: `trading-risk-shaped-affected-yearly-${scenario.id}.json`,
    });

    const { report: affectedCrisisReport, outputPath: affectedCrisisPath } = await runAffectedComparative({
      periods: CRISIS_PERIODS,
      rules: scenario.rules,
      instruments: affectedInstruments,
      timeframes: baselineFullYearly.request.timeframes,
      outputName: `trading-risk-shaped-affected-crisis-${scenario.id}.json`,
    });

    const aggregateSummary = buildMergedSummary({
      baselineFull: baselineFullYearly,
      scenarioAffected: affectedYearlyReport,
      affectedInstruments: affectedInstrumentSet,
    });
    const crisisSummary = buildMergedSummary({
      baselineFull: baselineFullCrisis,
      scenarioAffected: affectedCrisisReport,
      affectedInstruments: affectedInstrumentSet,
    });
    const walkForwardSummary = computeSummaryFromComparative(affectedYearlyReport, affectedInstrumentSet);
    const baselineWalkForwardSummary = computeSummaryFromComparative(
      baselineFullYearly,
      affectedInstrumentSet,
    );

    const aggregateDelta = buildDelta(aggregateSummary, baselineAggregateSummary);
    const crisisDelta = buildDelta(crisisSummary, baselineCrisisSummary);
    const walkForwardDelta = buildDelta(walkForwardSummary, baselineWalkForwardSummary);

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
      rules: scenario.rules,
      aggregate: {
        current: aggregateSummary,
        delta: aggregateDelta,
      },
      crisis: {
        current: crisisSummary,
        delta: crisisDelta,
        breakEvenOrBetter: crisisSummary.expectancy >= 0 && (crisisSummary.profitFactor ?? 0) >= 1,
      },
      walkForwardStyle: {
        current: walkForwardSummary,
        delta: walkForwardDelta,
        breakEvenOrBetter:
          walkForwardSummary.expectancy >= 0 && (walkForwardSummary.profitFactor ?? 0) >= 1,
      },
      gates: {
        aggregateImproved,
        crisesNotWorse,
        walkForwardNotWorse,
        keep: aggregateImproved && crisesNotWorse && walkForwardNotWorse,
      },
      artifacts: {
        affectedYearlyComparative: affectedYearlyPath,
        affectedCrisisComparative: affectedCrisisPath,
      },
    });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    baseline: {
      aggregate: baselineAggregateSummary,
      crisis: baselineCrisisSummary,
      artifacts: {
        yearlyFull: BASELINE_FULL_YEARLY_PATH,
        crisisFull: BASELINE_FULL_CRISIS_PATH,
      },
    },
    scenarios: scenarioResults,
    keepableScenarios: scenarioResults
      .filter((scenario) => scenario.gates.keep)
      .map((scenario) => ({
        id: scenario.id,
        description: scenario.description,
        aggregateExpectancy: scenario.aggregate.current.expectancy,
        crisisExpectancy: scenario.crisis.current.expectancy,
        walkForwardExpectancy: scenario.walkForwardStyle.current.expectancy,
      })),
  };

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, JSON.stringify(report, null, 2), "utf8");

  console.log(
    JSON.stringify(
      {
        outputPath: OUTPUT_PATH,
        keepableScenarios: report.keepableScenarios,
        scoredScenarios: scenarioResults.map((scenario) => ({
          id: scenario.id,
          gates: scenario.gates,
          aggregateExpectancy: scenario.aggregate.current.expectancy,
          aggregateProfitFactor: scenario.aggregate.current.profitFactor,
          crisisExpectancy: scenario.crisis.current.expectancy,
          crisisProfitFactor: scenario.crisis.current.profitFactor,
          walkForwardExpectancy: scenario.walkForwardStyle.current.expectancy,
          walkForwardProfitFactor: scenario.walkForwardStyle.current.profitFactor,
        })),
      },
      null,
      2,
    ),
  );
}

await main();
