import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, test } from "vitest";

import {
  createTradingHistoricalYearPeriods,
  runTradingSecondLayerRiskStudy,
  type TradingBacktestComparativeReport,
  type TradingBacktestRiskRule,
  type TradingSecondLayerRiskStudyScenario,
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

const INSTRUMENTS = [
  "EURUSD",
  "GBPUSD",
  "USDJPY",
  "XAUUSD",
  "NAS100",
  "US500",
  "BTCUSD",
  "ETHUSD",
] as const;

const COARSE_WALK_FORWARD = {
  trainFraction: 0.75,
  testFraction: 0.2,
  minTrainBars: 400,
  minTestBars: 120,
} as const;

function buildGlobalCautionRules(args: {
  riskMultiplier: number;
  qualityGrades?: Array<"A" | "B" | "C" | "D">;
}): TradingBacktestRiskRule[] {
  return INSTRUMENTS.map((instrument) => ({
    instrument,
    executionStatuses: ["caution"],
    qualityGrades: args.qualityGrades ?? null,
    riskMultiplier: args.riskMultiplier,
    reason: `Caution risk study shapes ${instrument} caution trades with multiplier ${args.riskMultiplier}.`,
  }));
}

const SCENARIOS: TradingSecondLayerRiskStudyScenario[] = [
  {
    id: "global_caution_very_soft_risk",
    description: "Slightly reduce risk on all caution trades across all markets.",
    rules: buildGlobalCautionRules({
      riskMultiplier: 0.8,
    }),
  },
  {
    id: "global_caution_soft_risk",
    description: "Reduce risk on all caution trades across all markets.",
    rules: buildGlobalCautionRules({
      riskMultiplier: 0.67,
    }),
  },
  {
    id: "global_caution_half_risk",
    description: "Halve risk on all caution trades across all markets.",
    rules: buildGlobalCautionRules({
      riskMultiplier: 0.5,
    }),
  },
  {
    id: "global_caution_non_a_soft_risk",
    description: "Reduce risk only on caution non-A trades across all markets.",
    rules: buildGlobalCautionRules({
      riskMultiplier: 0.67,
      qualityGrades: ["B", "C", "D"],
    }),
  },
] as const;

const OUTPUT_DIR = path.resolve("artifacts/trading-backtests");
const SCREEN_OUTPUT = path.resolve(
  OUTPUT_DIR,
  "trading-caution-risk-shaping-study-local-2020-2025-current_live_screen.json",
);
const runScreen = process.env.RUN_TRADING_CAUTION_RISK_SHAPING_STUDY === "1" ? test : test.skip;
const runActual = process.env.RUN_TRADING_CAUTION_RISK_SHAPING_ACTUAL_WF === "1" ? test : test.skip;
const requestedScreenScenarioIds = new Set(
  process.env.TRADING_CAUTION_RISK_SHAPING_SCREEN_IDS?.split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0) ?? [],
);
const screeningScenarios =
  requestedScreenScenarioIds.size > 0
    ? SCENARIOS.filter((scenario) => requestedScreenScenarioIds.has(scenario.id))
    : SCENARIOS;
const activeScenarioId = process.env.TRADING_CAUTION_RISK_SHAPING_SCENARIO_ID?.trim() ?? null;
const activeScenarios = activeScenarioId
  ? SCENARIOS.filter((scenario) => scenario.id === activeScenarioId)
  : SCENARIOS;
const ACTUAL_OUTPUT = path.resolve(
  OUTPUT_DIR,
  activeScenarioId
    ? `trading-caution-risk-shaping-study-actual-walk-forward-${activeScenarioId}.json`
    : "trading-caution-risk-shaping-study-actual-walk-forward.json",
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

async function readJsonFile<T>(targetPath: string): Promise<T> {
  return JSON.parse(await readFile(targetPath, "utf8")) as T;
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

describe("trading caution risk shaping study", () => {
  runScreen(
    "screens caution-risk shaping candidates against the current live baseline",
    { timeout: 1000 * 60 * 180 },
    async () => {
      const baseline = await loadCurrentBaselineComparatives();
      const report = await runTradingSecondLayerRiskStudy({
        yearlyPeriods: [...YEARLY_PERIODS],
        crisisPeriods: [...CRISIS_PERIODS],
        scenarios: [...screeningScenarios],
        instruments: [...INSTRUMENTS],
        timeframes: ["4h", "1h", "15m"],
        sourcePreference: "local_only",
        backtest: {
          captureSteps: false,
        },
        walkForward: {
          mode: "comparative_proxy",
        },
        baseline,
      });

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
              walkForwardExpectancy: scenario.walkForward.current.expectancy,
              walkForwardProfitFactor: scenario.walkForward.current.profitFactor,
              walkForwardMaxDrawdown: scenario.walkForward.current.maxDrawdown,
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
    "runs coarse actual walk-forward for the selected caution-risk shaping candidate",
    { timeout: 1000 * 60 * 240 },
    async () => {
      expect(activeScenarios.length).toBeGreaterThan(0);

      const baseline = await loadCurrentBaselineComparatives();
      const report = await runTradingSecondLayerRiskStudy({
        yearlyPeriods: [...YEARLY_PERIODS],
        crisisPeriods: [...CRISIS_PERIODS],
        scenarios: activeScenarios,
        instruments: [...INSTRUMENTS],
        timeframes: ["4h", "1h", "15m"],
        sourcePreference: "local_only",
        backtest: {
          captureSteps: false,
        },
        walkForward: {
          mode: "actual",
          from: "2020-01-01T00:00:00.000Z",
          to: "2025-12-31T23:59:59.000Z",
          windowing: COARSE_WALK_FORWARD,
        },
        baseline,
      });

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
