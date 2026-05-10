import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, test } from "vitest";

import {
  computeBacktestMetrics,
  createTradingHistoricalYearPeriods,
  runTradingHistoricalComparativeSweep,
  runTradingWalkForwardStudy,
  type TradingBacktestComparativeReport,
  type TradingBacktestConfig,
  type TradingBacktestTrade,
} from "@/lib/trading/backtest";
import type { SessionState } from "@/lib/trading/market";
import {
  createDefaultTradingPlaybook,
  type TradingPlaybook,
  type TradingPlaybookRules,
} from "@/lib/trading/playbook";

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

type BehaviorRefinementScenario = {
  id: string;
  description: string;
  sessionOverrides: Partial<Record<SessionState, Partial<TradingPlaybookRules>>>;
};

type MetricSummary = {
  totalTrades: number;
  winRate: number;
  averageRiskReward: number | null;
  expectancy: number;
  profitFactor: number | null;
  maxDrawdown: number;
};

const SCENARIOS: BehaviorRefinementScenario[] = [
  {
    id: "ny_open_one_strike_lockout",
    description: "Restrict after one consecutive loss during ny_open.",
    sessionOverrides: {
      ny_open: {
        maxConsecutiveLosses: 1,
      },
    },
  },
  {
    id: "london_ny_overlap_one_strike_lockout",
    description: "Restrict after one consecutive loss during london_ny_overlap.",
    sessionOverrides: {
      london_ny_overlap: {
        maxConsecutiveLosses: 1,
      },
    },
  },
  {
    id: "ny_open_and_overlap_one_strike_lockout",
    description: "Restrict after one consecutive loss during ny_open and london_ny_overlap.",
    sessionOverrides: {
      ny_open: {
        maxConsecutiveLosses: 1,
      },
      london_ny_overlap: {
        maxConsecutiveLosses: 1,
      },
    },
  },
  {
    id: "ny_open_max_trades_3",
    description: "Reduce ny_open max trades from 4 to 3.",
    sessionOverrides: {
      ny_open: {
        maxTrades: 3,
      },
    },
  },
  {
    id: "london_ny_overlap_max_trades_3",
    description: "Reduce london_ny_overlap max trades from 4 to 3.",
    sessionOverrides: {
      london_ny_overlap: {
        maxTrades: 3,
      },
    },
  },
] as const;

const OUTPUT_DIR = path.resolve("artifacts/trading-backtests");
const SCREEN_OUTPUT = path.resolve(
  OUTPUT_DIR,
  "trading-behavior-refinement-study-local-2020-2025-current_live_screen.json",
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

const runScreen = process.env.RUN_TRADING_BEHAVIOR_REFINEMENT_STUDY === "1" ? test : test.skip;
const runActual = process.env.RUN_TRADING_BEHAVIOR_REFINEMENT_ACTUAL_WF === "1" ? test : test.skip;
const requestedScreenScenarioIds = new Set(
  process.env.TRADING_BEHAVIOR_REFINEMENT_SCREEN_IDS?.split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0) ?? [],
);
const screeningScenarios =
  requestedScreenScenarioIds.size > 0
    ? SCENARIOS.filter((scenario) => requestedScreenScenarioIds.has(scenario.id))
    : SCENARIOS;
const activeScenarioId = process.env.TRADING_BEHAVIOR_REFINEMENT_SCENARIO_ID?.trim() ?? null;
const activeScenarios = activeScenarioId
  ? SCENARIOS.filter((scenario) => scenario.id === activeScenarioId)
  : SCENARIOS;
const ACTUAL_OUTPUT = path.resolve(
  OUTPUT_DIR,
  activeScenarioId
    ? `trading-behavior-refinement-study-actual-walk-forward-${activeScenarioId}.json`
    : "trading-behavior-refinement-study-actual-walk-forward-current_live.json",
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

function collectTradesFromComparativeCollection(
  reports: TradingBacktestComparativeReport[],
): { trades: TradingBacktestTrade[]; evaluatedBars: number } {
  const byInstrument = new Map<string, { trades: TradingBacktestTrade[]; evaluatedBars: number }>();

  for (const report of reports) {
    const slices = buildInstrumentSlicesFromComparative(report);

    for (const [instrument, slice] of slices.entries()) {
      byInstrument.set(instrument, slice);
    }
  }

  const selected = Array.from(byInstrument.values());

  return {
    trades: selected.flatMap((slice) => slice.trades),
    evaluatedBars: selected.reduce((sum, slice) => sum + slice.evaluatedBars, 0),
  };
}

function computeSummaryFromComparativeCollection(
  reports: TradingBacktestComparativeReport[],
): MetricSummary {
  const collected = collectTradesFromComparativeCollection(reports);
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

function buildScenarioBacktestConfig(scenario: BehaviorRefinementScenario): TradingBacktestConfig {
  const playbook: TradingPlaybook = createDefaultTradingPlaybook({
    sessionOverrides: scenario.sessionOverrides,
  });

  return {
    captureSteps: false,
    playbook,
  };
}

describe("trading behavior refinement study", () => {
  runScreen(
    "screens small session behavior refinements against the current live baseline",
    { timeout: 1000 * 60 * 180 },
    async () => {
      const baseline = await loadCurrentBaselineComparatives();
      const baselineAggregate = computeSummaryFromComparativeCollection(baseline.yearlyComparatives);
      const baselineCrisis = computeSummaryFromComparativeCollection(baseline.crisisComparatives);
      const scenarioResults = [];

      for (const scenario of screeningScenarios) {
        const backtest = buildScenarioBacktestConfig(scenario);
        const yearly = await runTradingHistoricalComparativeSweep({
          periods: [...YEARLY_PERIODS],
          instruments: ["EURUSD", "GBPUSD", "USDJPY", "XAUUSD", "NAS100", "US500", "BTCUSD", "ETHUSD"],
          timeframes: ["4h", "1h", "15m"],
          continueOnError: true,
          sourcePreference: "local_only",
          backtest,
        });
        const crisis = await runTradingHistoricalComparativeSweep({
          periods: [...CRISIS_PERIODS],
          instruments: ["EURUSD", "GBPUSD", "USDJPY", "XAUUSD", "NAS100", "US500", "BTCUSD", "ETHUSD"],
          timeframes: ["4h", "1h", "15m"],
          continueOnError: true,
          sourcePreference: "local_only",
          backtest,
        });
        const aggregateSummary = computeSummaryFromComparativeCollection([yearly]);
        const crisisSummary = computeSummaryFromComparativeCollection([crisis]);
        const walkForwardSummary = aggregateSummary;

        const aggregateImproved =
          aggregateSummary.expectancy >= baselineAggregate.expectancy &&
          (aggregateSummary.profitFactor ?? 0) >= (baselineAggregate.profitFactor ?? 0) &&
          aggregateSummary.maxDrawdown <= baselineAggregate.maxDrawdown;
        const crisesNotWorse =
          crisisSummary.expectancy >= baselineCrisis.expectancy &&
          (crisisSummary.profitFactor ?? 0) >= (baselineCrisis.profitFactor ?? 0) &&
          crisisSummary.maxDrawdown <= baselineCrisis.maxDrawdown;
        const walkForwardNotWorse =
          walkForwardSummary.expectancy >= baselineAggregate.expectancy &&
          (walkForwardSummary.profitFactor ?? 0) >= (baselineAggregate.profitFactor ?? 0) &&
          walkForwardSummary.maxDrawdown <= baselineAggregate.maxDrawdown;

        scenarioResults.push({
          id: scenario.id,
          description: scenario.description,
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
            delta: buildDelta(walkForwardSummary, baselineAggregate),
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
        },
        scenarios: scenarioResults,
        keepableScenarios: scenarioResults
          .filter((scenario) => scenario.gates.keep)
          .map((scenario) => ({
            id: scenario.id,
            description: scenario.description,
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
              crisisExpectancy: scenario.crisis.current.expectancy,
              crisisProfitFactor: scenario.crisis.current.profitFactor,
              aggregateDrawdown: scenario.aggregate.current.maxDrawdown,
              crisisDrawdown: scenario.crisis.current.maxDrawdown,
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
    "runs actual walk-forward for the selected behavior refinement candidate",
    { timeout: 1000 * 60 * 240 },
    async () => {
      expect(activeScenarios.length).toBeGreaterThan(0);

      const baseline = await loadCurrentBaselineComparatives();
      const baselineAggregate = computeSummaryFromComparativeCollection(baseline.yearlyComparatives);
      const baselineCrisis = computeSummaryFromComparativeCollection(baseline.crisisComparatives);
      const scenarioResults = [];

      const baselineWalkForward = await runTradingWalkForwardStudy({
        instruments: ["EURUSD", "GBPUSD", "USDJPY", "XAUUSD", "NAS100", "US500", "BTCUSD", "ETHUSD"],
        from: "2020-01-01T00:00:00.000Z",
        to: "2025-12-31T23:59:59.000Z",
        timeframes: ["4h", "1h", "15m"],
        sourcePreference: "local_only",
        backtest: {
          captureSteps: false,
        },
      });
      const baselineWalkForwardSummary: MetricSummary = {
        totalTrades: baselineWalkForward.aggregate.totalTrades,
        winRate: baselineWalkForward.aggregate.winRate,
        averageRiskReward: baselineWalkForward.aggregate.averageRiskReward,
        expectancy: baselineWalkForward.aggregate.expectancy,
        profitFactor: baselineWalkForward.aggregate.profitFactor,
        maxDrawdown: baselineWalkForward.aggregate.maxDrawdown,
      };

      for (const scenario of activeScenarios) {
        const backtest = buildScenarioBacktestConfig(scenario);
        const yearly = await runTradingHistoricalComparativeSweep({
          periods: [...YEARLY_PERIODS],
          instruments: ["EURUSD", "GBPUSD", "USDJPY", "XAUUSD", "NAS100", "US500", "BTCUSD", "ETHUSD"],
          timeframes: ["4h", "1h", "15m"],
          continueOnError: true,
          sourcePreference: "local_only",
          backtest,
        });
        const crisis = await runTradingHistoricalComparativeSweep({
          periods: [...CRISIS_PERIODS],
          instruments: ["EURUSD", "GBPUSD", "USDJPY", "XAUUSD", "NAS100", "US500", "BTCUSD", "ETHUSD"],
          timeframes: ["4h", "1h", "15m"],
          continueOnError: true,
          sourcePreference: "local_only",
          backtest,
        });
        const walkForward = await runTradingWalkForwardStudy({
          instruments: ["EURUSD", "GBPUSD", "USDJPY", "XAUUSD", "NAS100", "US500", "BTCUSD", "ETHUSD"],
          from: "2020-01-01T00:00:00.000Z",
          to: "2025-12-31T23:59:59.000Z",
          timeframes: ["4h", "1h", "15m"],
          sourcePreference: "local_only",
          backtest,
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
              crisisExpectancy: scenario.crisis.current.expectancy,
              crisisProfitFactor: scenario.crisis.current.profitFactor,
              walkForwardExpectancy: scenario.walkForward.current.expectancy,
              walkForwardProfitFactor: scenario.walkForward.current.profitFactor,
              walkForwardDrawdown: scenario.walkForward.current.maxDrawdown,
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
