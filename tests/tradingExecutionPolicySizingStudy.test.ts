import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, test } from "vitest";

import {
  computeBacktestMetrics,
  createTradingHistoricalYearPeriods,
  runTradingHistoricalComparativeSweep,
  runTradingWalkForwardStudy,
  type TradingBacktestComparativeReport,
  type TradingBacktestTrade,
} from "@/lib/trading/backtest";

const YEARLY_PERIODS = createTradingHistoricalYearPeriods({
  startYear: 2020,
  endYear: 2025,
});

const CRISIS_PERIODS = [
  {
    label: "covid_crash",
    from: "2020-02-15T00:00:00.000Z",
    to: "2020-06-30T23:59:59.000Z",
  },
  {
    label: "inflation_war_shock",
    from: "2022-02-01T00:00:00.000Z",
    to: "2022-06-30T23:59:59.000Z",
  },
  {
    label: "banking_stress",
    from: "2023-03-01T00:00:00.000Z",
    to: "2023-05-31T23:59:59.000Z",
  },
] as const;

const INSTRUMENTS = ["EURUSD", "GBPUSD", "USDJPY", "XAUUSD", "NAS100", "US500", "BTCUSD", "ETHUSD"] as const;

const COARSE_WALK_FORWARD = {
  trainFraction: 0.75,
  testFraction: 0.2,
  minTrainBars: 400,
  minTestBars: 120,
} as const;

const SCENARIOS = [
  {
    id: "allowed_only_high_edge_0_85",
    description: "Allowed-only execution policy with high-edge risk capped at 0.85%.",
    aggressiveRiskPct: 0.85,
  },
  {
    id: "allowed_only_high_edge_0_75",
    description: "Allowed-only execution policy with high-edge risk capped at 0.75%.",
    aggressiveRiskPct: 0.75,
  },
  {
    id: "allowed_only_high_edge_0_65",
    description: "Allowed-only execution policy with high-edge risk capped at 0.65%.",
    aggressiveRiskPct: 0.65,
  },
] as const;

type MetricSummary = {
  totalTrades: number;
  winRate: number;
  averageRiskReward: number | null;
  expectancy: number;
  profitFactor: number | null;
  maxDrawdown: number;
};

const OUTPUT_DIR = path.resolve("artifacts/trading-backtests");
const SCREEN_OUTPUT = path.resolve(
  OUTPUT_DIR,
  "trading-execution-policy-sizing-study-local-2020-2025-current_live_screen.json",
);
const runScreen = process.env.RUN_TRADING_EXECUTION_POLICY_SIZING_STUDY === "1" ? test : test.skip;
const runActual = process.env.RUN_TRADING_EXECUTION_POLICY_SIZING_ACTUAL_WF === "1" ? test : test.skip;
const requestedScreenScenarioIds = new Set(
  process.env.TRADING_EXECUTION_POLICY_SIZING_SCREEN_IDS?.split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0) ?? [],
);
const screeningScenarios =
  requestedScreenScenarioIds.size > 0
    ? SCENARIOS.filter((scenario) => requestedScreenScenarioIds.has(scenario.id))
    : SCENARIOS;
const activeScenarioId = process.env.TRADING_EXECUTION_POLICY_SIZING_SCENARIO_ID?.trim() ?? null;
const activeScenarios = activeScenarioId
  ? SCENARIOS.filter((scenario) => scenario.id === activeScenarioId)
  : SCENARIOS;
const ACTUAL_OUTPUT = path.resolve(
  OUTPUT_DIR,
  activeScenarioId
    ? `trading-execution-policy-sizing-study-actual-walk-forward-${activeScenarioId}.json`
    : "trading-execution-policy-sizing-study-actual-walk-forward.json",
);

const BASELINE_FULL_YEARLY_PATH = path.resolve(
  "artifacts/trading-backtests/trading-comparative-sweep-local-2020-2025-yearly-live_playbook_market_session_calibrated.json",
);
const BASELINE_FULL_CRISIS_PATH = path.resolve(
  "artifacts/trading-backtests/trading-crisis-comparative-local-live_playbook_market_session_calibrated.json",
);
const CURRENT_INDICES_YEARLY_PATH = path.resolve(
  "artifacts/trading-backtests/trading-risk-shaped-affected-yearly-indices_mixed_soft_risk.json",
);
const CURRENT_INDICES_CRISIS_PATH = path.resolve(
  "artifacts/trading-backtests/trading-risk-shaped-affected-crisis-indices_mixed_soft_risk.json",
);
const CURRENT_NAS100_YEARLY_PATH = path.resolve(
  "artifacts/trading-backtests/trading-current-live-slice-nas100-yearly.json",
);
const CURRENT_NAS100_CRISIS_PATH = path.resolve(
  "artifacts/trading-backtests/trading-current-live-slice-nas100-crisis.json",
);

function roundMetric(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
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

async function readJsonFile<T>(targetPath: string): Promise<T> {
  return JSON.parse(await readFile(targetPath, "utf8")) as T;
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

function computeSummaryFromComparativeCollection(
  reports: TradingBacktestComparativeReport[],
): MetricSummary {
  const byInstrument = new Map<string, { trades: TradingBacktestTrade[]; evaluatedBars: number }>();

  for (const report of reports) {
    const slices = buildInstrumentSlicesFromComparative(report);

    for (const [instrument, slice] of slices.entries()) {
      byInstrument.set(instrument, slice);
    }
  }

  const collected = Array.from(byInstrument.values());
  const trades = collected.flatMap((slice) => slice.trades);
  const evaluatedBars = collected.reduce((sum, slice) => sum + slice.evaluatedBars, 0);
  const metrics = computeBacktestMetrics({
    trades,
    evaluatedBars,
    equityValues: buildEquityValues(trades),
  });

  return {
    totalTrades: trades.length,
    winRate: metrics.winRate,
    averageRiskReward: metrics.averageRiskReward,
    expectancy: metrics.expectancy,
    profitFactor: metrics.profitFactor,
    maxDrawdown: metrics.maxDrawdown,
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

async function loadCurrentBaselineComparatives() {
  const baselineFullYearly = await readJsonFile<TradingBacktestComparativeReport>(
    BASELINE_FULL_YEARLY_PATH,
  );
  const baselineFullCrisis = await readJsonFile<TradingBacktestComparativeReport>(
    BASELINE_FULL_CRISIS_PATH,
  );
  const currentIndicesYearly = await readJsonFile<TradingBacktestComparativeReport>(
    CURRENT_INDICES_YEARLY_PATH,
  );
  const currentIndicesCrisis = await readJsonFile<TradingBacktestComparativeReport>(
    CURRENT_INDICES_CRISIS_PATH,
  );
  const currentNas100Yearly = await readJsonFile<TradingBacktestComparativeReport>(
    CURRENT_NAS100_YEARLY_PATH,
  );
  const currentNas100Crisis = await readJsonFile<TradingBacktestComparativeReport>(
    CURRENT_NAS100_CRISIS_PATH,
  );

  return {
    yearlyComparatives: [baselineFullYearly, currentIndicesYearly, currentNas100Yearly],
    crisisComparatives: [baselineFullCrisis, currentIndicesCrisis, currentNas100Crisis],
  };
}

describe("trading execution policy sizing study", () => {
  runScreen(
    "screens allowed-only execution policy with softer high-edge sizing",
    { timeout: 1000 * 60 * 180 },
    async () => {
      const baseline = await loadCurrentBaselineComparatives();
      const baselineAggregate = computeSummaryFromComparativeCollection(baseline.yearlyComparatives);
      const baselineCrisis = computeSummaryFromComparativeCollection(baseline.crisisComparatives);
      const scenarioResults = [];

      for (const scenario of screeningScenarios) {
        const yearly = await runTradingHistoricalComparativeSweep({
          periods: [...YEARLY_PERIODS],
          instruments: [...INSTRUMENTS],
          timeframes: ["4h", "1h", "15m"],
          continueOnError: true,
          sourcePreference: "local_only",
          backtest: {
            captureSteps: false,
            executionPolicy: "allowed_only",
            riskOverrides: {
              aggressiveRiskPct: scenario.aggressiveRiskPct,
            },
          },
        });
        const crisis = await runTradingHistoricalComparativeSweep({
          periods: [...CRISIS_PERIODS],
          instruments: [...INSTRUMENTS],
          timeframes: ["4h", "1h", "15m"],
          continueOnError: true,
          sourcePreference: "local_only",
          backtest: {
            captureSteps: false,
            executionPolicy: "allowed_only",
            riskOverrides: {
              aggressiveRiskPct: scenario.aggressiveRiskPct,
            },
          },
        });

        const aggregateSummary = computeSummaryFromComparativeCollection([yearly]);
        const crisisSummary = computeSummaryFromComparativeCollection([crisis]);
        const aggregateImproved =
          aggregateSummary.expectancy >= baselineAggregate.expectancy &&
          (aggregateSummary.profitFactor ?? 0) >= (baselineAggregate.profitFactor ?? 0) &&
          aggregateSummary.maxDrawdown <= baselineAggregate.maxDrawdown;
        const crisesNotWorse =
          crisisSummary.expectancy >= baselineCrisis.expectancy &&
          (crisisSummary.profitFactor ?? 0) >= (baselineCrisis.profitFactor ?? 0) &&
          crisisSummary.maxDrawdown <= baselineCrisis.maxDrawdown;

        scenarioResults.push({
          id: scenario.id,
          description: scenario.description,
          aggressiveRiskPct: scenario.aggressiveRiskPct,
          aggregate: {
            current: aggregateSummary,
            delta: buildDelta(aggregateSummary, baselineAggregate),
          },
          crisis: {
            current: crisisSummary,
            delta: buildDelta(crisisSummary, baselineCrisis),
          },
          gates: {
            aggregateImproved,
            crisesNotWorse,
            keep: aggregateImproved && crisesNotWorse,
          },
        });
      }

      const report = {
        generatedAt: new Date().toISOString(),
        baseline: {
          aggregate: baselineAggregate,
          crisis: baselineCrisis,
        },
        scenarios: scenarioResults,
        keepableScenarios: scenarioResults
          .filter((scenario) => scenario.gates.keep)
          .map((scenario) => ({
            id: scenario.id,
            aggressiveRiskPct: scenario.aggressiveRiskPct,
            aggregateExpectancy: scenario.aggregate.current.expectancy,
            crisisExpectancy: scenario.crisis.current.expectancy,
          })),
      };

      await mkdir(OUTPUT_DIR, { recursive: true });
      await writeFile(SCREEN_OUTPUT, JSON.stringify(report, null, 2), "utf8");

      console.log(
        JSON.stringify(
          {
            outputPath: SCREEN_OUTPUT,
            keepableScenarios: report.keepableScenarios,
            scoredScenarios: report.scenarios.map((scenario) => ({
              id: scenario.id,
              gates: scenario.gates,
              aggregateExpectancy: scenario.aggregate.current.expectancy,
              aggregateProfitFactor: scenario.aggregate.current.profitFactor,
              aggregateMaxDrawdown: scenario.aggregate.current.maxDrawdown,
              crisisExpectancy: scenario.crisis.current.expectancy,
              crisisProfitFactor: scenario.crisis.current.profitFactor,
              crisisMaxDrawdown: scenario.crisis.current.maxDrawdown,
            })),
          },
          null,
          2,
        ),
      );

      expect(report.scenarios.length).toBe(screeningScenarios.length);
    },
  );

  runActual(
    "runs coarse actual walk-forward for the selected allowed-only sizing candidate",
    { timeout: 1000 * 60 * 240 },
    async () => {
      expect(activeScenarios.length).toBeGreaterThan(0);

      const baseline = await loadCurrentBaselineComparatives();
      const baselineAggregate = computeSummaryFromComparativeCollection(baseline.yearlyComparatives);
      const baselineCrisis = computeSummaryFromComparativeCollection(baseline.crisisComparatives);
      const baselineWalkForward = await runTradingWalkForwardStudy({
        instruments: [...INSTRUMENTS],
        from: "2020-01-01T00:00:00.000Z",
        to: "2025-12-31T23:59:59.000Z",
        timeframes: ["4h", "1h", "15m"],
        sourcePreference: "local_only",
        backtest: {
          captureSteps: false,
        },
        windowing: COARSE_WALK_FORWARD,
      });
      const baselineWalkForwardSummary: MetricSummary = {
        totalTrades: baselineWalkForward.aggregate.totalTrades,
        winRate: baselineWalkForward.aggregate.winRate,
        averageRiskReward: baselineWalkForward.aggregate.averageRiskReward,
        expectancy: baselineWalkForward.aggregate.expectancy,
        profitFactor: baselineWalkForward.aggregate.profitFactor,
        maxDrawdown: baselineWalkForward.aggregate.maxDrawdown,
      };
      const scenarioResults = [];

      for (const scenario of activeScenarios) {
        const yearly = await runTradingHistoricalComparativeSweep({
          periods: [...YEARLY_PERIODS],
          instruments: [...INSTRUMENTS],
          timeframes: ["4h", "1h", "15m"],
          continueOnError: true,
          sourcePreference: "local_only",
          backtest: {
            captureSteps: false,
            executionPolicy: "allowed_only",
            riskOverrides: {
              aggressiveRiskPct: scenario.aggressiveRiskPct,
            },
          },
        });
        const crisis = await runTradingHistoricalComparativeSweep({
          periods: [...CRISIS_PERIODS],
          instruments: [...INSTRUMENTS],
          timeframes: ["4h", "1h", "15m"],
          continueOnError: true,
          sourcePreference: "local_only",
          backtest: {
            captureSteps: false,
            executionPolicy: "allowed_only",
            riskOverrides: {
              aggressiveRiskPct: scenario.aggressiveRiskPct,
            },
          },
        });
        const walkForward = await runTradingWalkForwardStudy({
          instruments: [...INSTRUMENTS],
          from: "2020-01-01T00:00:00.000Z",
          to: "2025-12-31T23:59:59.000Z",
          timeframes: ["4h", "1h", "15m"],
          sourcePreference: "local_only",
          backtest: {
            captureSteps: false,
            executionPolicy: "allowed_only",
            riskOverrides: {
              aggressiveRiskPct: scenario.aggressiveRiskPct,
            },
          },
          windowing: COARSE_WALK_FORWARD,
        });
        const aggregateSummary = computeSummaryFromComparativeCollection([yearly]);
        const crisisSummary = computeSummaryFromComparativeCollection([crisis]);
        const walkForwardSummary: MetricSummary = {
          totalTrades: walkForward.aggregate.totalTrades,
          winRate: walkForward.aggregate.winRate,
          averageRiskReward: walkForward.aggregate.averageRiskReward,
          expectancy: walkForward.aggregate.expectancy,
          profitFactor: walkForward.aggregate.profitFactor,
          maxDrawdown: walkForward.aggregate.maxDrawdown,
        };
        const aggregateImproved =
          aggregateSummary.expectancy >= baselineAggregate.expectancy &&
          (aggregateSummary.profitFactor ?? 0) >= (baselineAggregate.profitFactor ?? 0) &&
          aggregateSummary.maxDrawdown <= baselineAggregate.maxDrawdown;
        const crisesNotWorse =
          crisisSummary.expectancy >= baselineCrisis.expectancy &&
          (crisisSummary.profitFactor ?? 0) >= (baselineCrisis.profitFactor ?? 0) &&
          crisisSummary.maxDrawdown <= baselineCrisis.maxDrawdown;
        const walkForwardNotWorse =
          walkForwardSummary.expectancy >= baselineWalkForwardSummary.expectancy &&
          (walkForwardSummary.profitFactor ?? 0) >= (baselineWalkForwardSummary.profitFactor ?? 0) &&
          walkForwardSummary.maxDrawdown <= baselineWalkForwardSummary.maxDrawdown;

        scenarioResults.push({
          id: scenario.id,
          description: scenario.description,
          aggressiveRiskPct: scenario.aggressiveRiskPct,
          aggregate: {
            current: aggregateSummary,
            delta: buildDelta(aggregateSummary, baselineAggregate),
          },
          crisis: {
            current: crisisSummary,
            delta: buildDelta(crisisSummary, baselineCrisis),
          },
          walkForward: {
            current: walkForwardSummary,
            delta: buildDelta(walkForwardSummary, baselineWalkForwardSummary),
          },
          gates: {
            aggregateImproved,
            crisesNotWorse,
            walkForwardNotWorse,
            keep: aggregateImproved && crisesNotWorse && walkForwardNotWorse,
          },
        });
      }

      const report = {
        generatedAt: new Date().toISOString(),
        baseline: {
          aggregate: baselineAggregate,
          crisis: baselineCrisis,
          walkForward: baselineWalkForwardSummary,
          coarseWalkForwardWindowing: COARSE_WALK_FORWARD,
        },
        scenarios: scenarioResults,
        keepableScenarios: scenarioResults
          .filter((scenario) => scenario.gates.keep)
          .map((scenario) => ({
            id: scenario.id,
            aggressiveRiskPct: scenario.aggressiveRiskPct,
            aggregateExpectancy: scenario.aggregate.current.expectancy,
            crisisExpectancy: scenario.crisis.current.expectancy,
            walkForwardExpectancy: scenario.walkForward.current.expectancy,
          })),
      };

      await mkdir(OUTPUT_DIR, { recursive: true });
      await writeFile(ACTUAL_OUTPUT, JSON.stringify(report, null, 2), "utf8");

      console.log(
        JSON.stringify(
          {
            outputPath: ACTUAL_OUTPUT,
            keepableScenarios: report.keepableScenarios,
            scoredScenarios: report.scenarios.map((scenario) => ({
              id: scenario.id,
              gates: scenario.gates,
              aggregateExpectancy: scenario.aggregate.current.expectancy,
              aggregateProfitFactor: scenario.aggregate.current.profitFactor,
              aggregateMaxDrawdown: scenario.aggregate.current.maxDrawdown,
              crisisExpectancy: scenario.crisis.current.expectancy,
              crisisProfitFactor: scenario.crisis.current.profitFactor,
              crisisMaxDrawdown: scenario.crisis.current.maxDrawdown,
              walkForwardExpectancy: scenario.walkForward.current.expectancy,
              walkForwardProfitFactor: scenario.walkForward.current.profitFactor,
              walkForwardMaxDrawdown: scenario.walkForward.current.maxDrawdown,
            })),
          },
          null,
          2,
        ),
      );

      expect(report.scenarios.length).toBe(activeScenarios.length);
    },
  );
});
