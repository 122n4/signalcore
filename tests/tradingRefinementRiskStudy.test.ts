import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, test } from "vitest";

import {
  createTradingHistoricalYearPeriods,
  runTradingSecondLayerRiskStudy,
  type TradingSecondLayerRiskStudyScenario,
} from "@/lib/trading/backtest";
import type { TradingBacktestComparativeReport } from "@/lib/trading/backtest/comparativeSweep";

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

const SCENARIOS: TradingSecondLayerRiskStudyScenario[] = [
  {
    id: "nas100_breakout_ny_open_medium_neutral_non_a_soft_risk",
    description:
      "Soften NAS100 breakout continuation risk in ny_open only for medium-clarity, neutral-environment, non-A trades.",
    rules: [
      {
        instrument: "NAS100",
        sessions: ["ny_open"],
        setupTypes: ["breakout_continuation"],
        riskModes: ["reduced"],
        qualityGrades: ["B", "C", "D"],
        clarityLevels: ["medium"],
        environmentStates: ["neutral"],
        riskMultiplier: 0.67,
        reason:
          "Refinement study softens NAS100 breakout continuation risk in ny_open for medium-clarity neutral non-A trades.",
      },
    ],
  },
  {
    id: "nas100_breakout_ny_open_medium_neutral_non_a_half_risk",
    description:
      "Halve NAS100 breakout continuation risk in ny_open only for medium-clarity, neutral-environment, non-A trades.",
    rules: [
      {
        instrument: "NAS100",
        sessions: ["ny_open"],
        setupTypes: ["breakout_continuation"],
        riskModes: ["reduced"],
        qualityGrades: ["B", "C", "D"],
        clarityLevels: ["medium"],
        environmentStates: ["neutral"],
        riskMultiplier: 0.5,
        reason:
          "Refinement study halves NAS100 breakout continuation risk in ny_open for medium-clarity neutral non-A trades.",
      },
    ],
  },
  {
    id: "nas100_breakout_late_us_medium_neutral_non_a_soft_risk",
    description:
      "Soften NAS100 breakout continuation risk in late_us only for medium-clarity, neutral-environment, non-A trades.",
    rules: [
      {
        instrument: "NAS100",
        sessions: ["late_us"],
        setupTypes: ["breakout_continuation"],
        riskModes: ["reduced"],
        qualityGrades: ["B", "C", "D"],
        clarityLevels: ["medium"],
        environmentStates: ["neutral"],
        riskMultiplier: 0.67,
        reason:
          "Refinement study softens NAS100 breakout continuation risk in late_us for medium-clarity neutral non-A trades.",
      },
    ],
  },
  {
    id: "nas100_breakout_late_us_medium_neutral_non_a_half_risk",
    description:
      "Halve NAS100 breakout continuation risk in late_us only for medium-clarity, neutral-environment, non-A trades.",
    rules: [
      {
        instrument: "NAS100",
        sessions: ["late_us"],
        setupTypes: ["breakout_continuation"],
        riskModes: ["reduced"],
        qualityGrades: ["B", "C", "D"],
        clarityLevels: ["medium"],
        environmentStates: ["neutral"],
        riskMultiplier: 0.5,
        reason:
          "Refinement study halves NAS100 breakout continuation risk in late_us for medium-clarity neutral non-A trades.",
      },
    ],
  },
  {
    id: "nas100_breakout_overlap_medium_neutral_non_a_soft_risk",
    description:
      "Soften NAS100 breakout continuation risk in london_ny_overlap only for medium-clarity, neutral-environment, non-A trades.",
    rules: [
      {
        instrument: "NAS100",
        sessions: ["london_ny_overlap"],
        setupTypes: ["breakout_continuation"],
        riskModes: ["reduced"],
        qualityGrades: ["B", "C", "D"],
        clarityLevels: ["medium"],
        environmentStates: ["neutral"],
        riskMultiplier: 0.67,
        reason:
          "Refinement study softens NAS100 breakout continuation risk in london_ny_overlap for medium-clarity neutral non-A trades.",
      },
    ],
  },
  {
    id: "nas100_breakout_overlap_medium_neutral_non_a_half_risk",
    description:
      "Halve NAS100 breakout continuation risk in london_ny_overlap only for medium-clarity, neutral-environment, non-A trades.",
    rules: [
      {
        instrument: "NAS100",
        sessions: ["london_ny_overlap"],
        setupTypes: ["breakout_continuation"],
        riskModes: ["reduced"],
        qualityGrades: ["B", "C", "D"],
        clarityLevels: ["medium"],
        environmentStates: ["neutral"],
        riskMultiplier: 0.5,
        reason:
          "Refinement study halves NAS100 breakout continuation risk in london_ny_overlap for medium-clarity neutral non-A trades.",
      },
    ],
  },
  {
    id: "nas100_breakout_ny_open_non_a_quality_soft_risk",
    description:
      "Soften NAS100 breakout continuation risk in ny_open for non-A quality trades only.",
    rules: [
      {
        instrument: "NAS100",
        sessions: ["ny_open"],
        setupTypes: ["breakout_continuation"],
        qualityGrades: ["B", "C", "D"],
        riskMultiplier: 0.67,
        reason: "Refinement study softens NAS100 breakout continuation risk in ny_open for non-A quality trades.",
      },
    ],
  },
  {
    id: "nas100_breakout_ny_open_medium_clarity_soft_risk",
    description:
      "Soften NAS100 breakout continuation risk in ny_open for medium-clarity trades only.",
    rules: [
      {
        instrument: "NAS100",
        sessions: ["ny_open"],
        setupTypes: ["breakout_continuation"],
        riskModes: ["reduced"],
        clarityLevels: ["medium"],
        riskMultiplier: 0.67,
        reason:
          "Refinement study softens NAS100 breakout continuation risk in ny_open for medium-clarity trades.",
      },
    ],
  },
  {
    id: "nas100_breakout_late_us_non_a_quality_soft_risk",
    description:
      "Soften NAS100 breakout continuation risk in late_us for non-A quality trades only.",
    rules: [
      {
        instrument: "NAS100",
        sessions: ["late_us"],
        setupTypes: ["breakout_continuation"],
        qualityGrades: ["B", "C", "D"],
        riskMultiplier: 0.67,
        reason:
          "Refinement study softens NAS100 breakout continuation risk in late_us for non-A quality trades.",
      },
    ],
  },
  {
    id: "nas100_breakout_late_us_medium_clarity_soft_risk",
    description:
      "Soften NAS100 breakout continuation risk in late_us for medium-clarity trades only.",
    rules: [
      {
        instrument: "NAS100",
        sessions: ["late_us"],
        setupTypes: ["breakout_continuation"],
        riskModes: ["reduced"],
        clarityLevels: ["medium"],
        riskMultiplier: 0.67,
        reason:
          "Refinement study softens NAS100 breakout continuation risk in late_us for medium-clarity trades.",
      },
    ],
  },
  {
    id: "nas100_breakout_overlap_non_a_quality_soft_risk",
    description:
      "Soften NAS100 breakout continuation risk in london_ny_overlap for non-A quality trades only.",
    rules: [
      {
        instrument: "NAS100",
        sessions: ["london_ny_overlap"],
        setupTypes: ["breakout_continuation"],
        qualityGrades: ["B", "C", "D"],
        riskMultiplier: 0.67,
        reason:
          "Refinement study softens NAS100 breakout continuation risk in london_ny_overlap for non-A quality trades.",
      },
    ],
  },
  {
    id: "nas100_breakout_overlap_medium_clarity_soft_risk",
    description:
      "Soften NAS100 breakout continuation risk in london_ny_overlap for medium-clarity trades only.",
    rules: [
      {
        instrument: "NAS100",
        sessions: ["london_ny_overlap"],
        setupTypes: ["breakout_continuation"],
        riskModes: ["reduced"],
        clarityLevels: ["medium"],
        riskMultiplier: 0.67,
        reason:
          "Refinement study softens NAS100 breakout continuation risk in london_ny_overlap for medium-clarity trades.",
      },
    ],
  },
  {
    id: "nas100_breakout_ny_open_non_a_quality_very_soft_risk",
    description:
      "Very slightly soften NAS100 breakout continuation risk in ny_open for non-A quality trades only.",
    rules: [
      {
        instrument: "NAS100",
        sessions: ["ny_open"],
        setupTypes: ["breakout_continuation"],
        qualityGrades: ["B", "C", "D"],
        riskMultiplier: 0.8,
        reason:
          "Refinement study slightly softens NAS100 breakout continuation risk in ny_open for non-A quality trades.",
      },
    ],
  },
  {
    id: "nas100_breakout_overlap_non_a_quality_very_soft_risk",
    description:
      "Very slightly soften NAS100 breakout continuation risk in london_ny_overlap for non-A quality trades only.",
    rules: [
      {
        instrument: "NAS100",
        sessions: ["london_ny_overlap"],
        setupTypes: ["breakout_continuation"],
        qualityGrades: ["B", "C", "D"],
        riskMultiplier: 0.8,
        reason:
          "Refinement study slightly softens NAS100 breakout continuation risk in london_ny_overlap for non-A quality trades.",
      },
    ],
  },
  {
    id: "nas100_breakout_overlap_caution_very_soft_risk",
    description:
      "Very slightly soften NAS100 breakout continuation risk in london_ny_overlap for caution trades only.",
    rules: [
      {
        instrument: "NAS100",
        sessions: ["london_ny_overlap"],
        setupTypes: ["breakout_continuation"],
        executionStatuses: ["caution"],
        riskMultiplier: 0.8,
        reason:
          "Refinement study slightly softens NAS100 breakout continuation risk in london_ny_overlap for caution trades.",
      },
    ],
  },
  {
    id: "nas100_breakout_overlap_caution_soft_risk",
    description:
      "Soften NAS100 breakout continuation risk in london_ny_overlap for caution trades only.",
    rules: [
      {
        instrument: "NAS100",
        sessions: ["london_ny_overlap"],
        setupTypes: ["breakout_continuation"],
        executionStatuses: ["caution"],
        riskMultiplier: 0.67,
        reason:
          "Refinement study softens NAS100 breakout continuation risk in london_ny_overlap for caution trades.",
      },
    ],
  },
  {
    id: "nas100_breakout_overlap_caution_non_a_very_soft_risk",
    description:
      "Very slightly soften NAS100 breakout continuation risk in london_ny_overlap for caution non-A trades only.",
    rules: [
      {
        instrument: "NAS100",
        sessions: ["london_ny_overlap"],
        setupTypes: ["breakout_continuation"],
        executionStatuses: ["caution"],
        qualityGrades: ["B", "C", "D"],
        riskMultiplier: 0.8,
        reason:
          "Refinement study slightly softens NAS100 breakout continuation risk in london_ny_overlap for caution non-A trades.",
      },
    ],
  },
  {
    id: "us500_pre_market_caution_very_soft_risk",
    description:
      "Very slightly soften US500 risk in pre_market for caution trades only.",
    rules: [
      {
        instrument: "US500",
        sessions: ["pre_market"],
        executionStatuses: ["caution"],
        riskMultiplier: 0.8,
        reason: "Refinement study slightly softens US500 pre_market risk for caution trades.",
      },
    ],
  },
  {
    id: "nas100_breakout_late_us_non_a_quality_very_soft_risk",
    description:
      "Very slightly soften NAS100 breakout continuation risk in late_us for non-A quality trades only.",
    rules: [
      {
        instrument: "NAS100",
        sessions: ["late_us"],
        setupTypes: ["breakout_continuation"],
        qualityGrades: ["B", "C", "D"],
        riskMultiplier: 0.8,
        reason:
          "Refinement study slightly softens NAS100 breakout continuation risk in late_us for non-A quality trades.",
      },
    ],
  },
  {
    id: "us500_breakout_late_us_non_a_quality_very_soft_risk",
    description:
      "Very slightly soften US500 breakout continuation risk in late_us for non-A quality trades only.",
    rules: [
      {
        instrument: "US500",
        sessions: ["late_us"],
        setupTypes: ["breakout_continuation"],
        qualityGrades: ["B", "C", "D"],
        riskMultiplier: 0.8,
        reason:
          "Refinement study slightly softens US500 breakout continuation risk in late_us for non-A quality trades.",
      },
    ],
  },
  {
    id: "nas100_breakout_late_us_soft_second_layer",
    description: "Reduce NAS100 breakout continuation risk only in late_us.",
    rules: [
      {
        instrument: "NAS100",
        sessions: ["late_us"],
        setupTypes: ["breakout_continuation"],
        riskMultiplier: 0.67,
        reason: "Refinement study softens NAS100 breakout continuation risk in late_us.",
      },
    ],
  },
  {
    id: "nas100_breakout_late_us_half_risk",
    description: "Halve NAS100 breakout continuation risk only in late_us.",
    rules: [
      {
        instrument: "NAS100",
        sessions: ["late_us"],
        setupTypes: ["breakout_continuation"],
        riskMultiplier: 0.5,
        reason: "Refinement study halves NAS100 breakout continuation risk in late_us.",
      },
    ],
  },
  {
    id: "nas100_breakout_ny_open_soft_second_layer_current_live",
    description: "Reduce NAS100 breakout continuation risk only in ny_open on top of the current live state.",
    rules: [
      {
        instrument: "NAS100",
        sessions: ["ny_open"],
        setupTypes: ["breakout_continuation"],
        riskMultiplier: 0.67,
        reason: "Refinement study softens NAS100 breakout continuation risk in ny_open.",
      },
    ],
  },
  {
    id: "nas100_breakout_ny_open_half_risk_current_live",
    description: "Halve NAS100 breakout continuation risk only in ny_open on top of the current live state.",
    rules: [
      {
        instrument: "NAS100",
        sessions: ["ny_open"],
        setupTypes: ["breakout_continuation"],
        riskMultiplier: 0.5,
        reason: "Refinement study halves NAS100 breakout continuation risk in ny_open.",
      },
    ],
  },
  {
    id: "us500_breakout_late_us_soft_second_layer",
    description: "Reduce US500 breakout continuation risk only in late_us.",
    rules: [
      {
        instrument: "US500",
        sessions: ["late_us"],
        setupTypes: ["breakout_continuation"],
        riskMultiplier: 0.67,
        reason: "Refinement study softens US500 breakout continuation risk in late_us.",
      },
    ],
  },
  {
    id: "us500_breakout_late_us_half_risk",
    description: "Halve US500 breakout continuation risk only in late_us.",
    rules: [
      {
        instrument: "US500",
        sessions: ["late_us"],
        setupTypes: ["breakout_continuation"],
        riskMultiplier: 0.5,
        reason: "Refinement study halves US500 breakout continuation risk in late_us.",
      },
    ],
  },
  {
    id: "nas100_us500_breakout_late_sessions_soft_stack",
    description: "Reduce late-session breakout risk on NAS100 and US500 without blocking the trades.",
    rules: [
      {
        instrument: "NAS100",
        sessions: ["late_us"],
        setupTypes: ["breakout_continuation"],
        riskMultiplier: 0.67,
        reason: "Refinement study softens NAS100 breakout continuation risk in late_us.",
      },
      {
        instrument: "US500",
        sessions: ["late_us"],
        setupTypes: ["breakout_continuation"],
        riskMultiplier: 0.67,
        reason: "Refinement study softens US500 breakout continuation risk in late_us.",
      },
    ],
  },
  {
    id: "xauusd_breakout_london_open_half_risk",
    description: "Halve XAUUSD breakout continuation risk in london_open.",
    rules: [
      {
        instrument: "XAUUSD",
        sessions: ["london_open"],
        setupTypes: ["breakout_continuation"],
        riskMultiplier: 0.5,
        reason: "Refinement study halves XAUUSD breakout continuation risk in london_open.",
      },
    ],
  },
  {
    id: "btcusd_breakout_weekend_drift_half_risk",
    description: "Halve BTCUSD breakout continuation risk in weekend_drift.",
    rules: [
      {
        instrument: "BTCUSD",
        sessions: ["weekend_drift"],
        setupTypes: ["breakout_continuation"],
        riskMultiplier: 0.5,
        reason: "Refinement study halves BTCUSD breakout continuation risk in weekend_drift.",
      },
    ],
  },
  {
    id: "xauusd_btcusd_breakout_weak_sessions_half_risk",
    description:
      "Halve breakout continuation risk on XAUUSD london_open and BTCUSD weekend_drift.",
    rules: [
      {
        instrument: "XAUUSD",
        sessions: ["london_open"],
        setupTypes: ["breakout_continuation"],
        riskMultiplier: 0.5,
        reason: "Refinement study halves XAUUSD breakout continuation risk in london_open.",
      },
      {
        instrument: "BTCUSD",
        sessions: ["weekend_drift"],
        setupTypes: ["breakout_continuation"],
        riskMultiplier: 0.5,
        reason: "Refinement study halves BTCUSD breakout continuation risk in weekend_drift.",
      },
    ],
  },
] as const;

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

const OUTPUT_DIR = path.resolve("artifacts/trading-backtests");
const SCREEN_OUTPUT = path.resolve(
  OUTPUT_DIR,
  "trading-refinement-risk-study-local-2020-2025-current_live_screen.json",
);

const runScreen = process.env.RUN_TRADING_REFINEMENT_RISK_STUDY === "1" ? test : test.skip;
const runActual = process.env.RUN_TRADING_REFINEMENT_RISK_ACTUAL_WF === "1" ? test : test.skip;
const requestedScreenScenarioIds = new Set(
  process.env.TRADING_REFINEMENT_RISK_SCREEN_IDS?.split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0) ?? [],
);
const activeScenarioId = process.env.TRADING_REFINEMENT_RISK_SCENARIO_ID?.trim() ?? null;
const screeningScenarios =
  requestedScreenScenarioIds.size > 0
    ? SCENARIOS.filter((scenario) => requestedScreenScenarioIds.has(scenario.id))
    : SCENARIOS;
const activeScenarios = activeScenarioId
  ? SCENARIOS.filter((scenario) => scenario.id === activeScenarioId)
  : SCENARIOS;
const ACTUAL_OUTPUT = path.resolve(
  OUTPUT_DIR,
  activeScenarioId
    ? `trading-refinement-risk-study-actual-walk-forward-${activeScenarioId}.json`
    : "trading-refinement-risk-study-actual-walk-forward-current_live.json",
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

describe("trading refinement risk study", () => {
  runScreen(
    "screens next refinement candidates against the current live baseline using comparative proxy",
    { timeout: 1000 * 60 * 90 },
    async () => {
      const baseline = await loadCurrentBaselineComparatives();
      const report = await runTradingSecondLayerRiskStudy({
        yearlyPeriods: [...YEARLY_PERIODS],
        crisisPeriods: [...CRISIS_PERIODS],
        scenarios: [...screeningScenarios],
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
              crisisExpectancy: scenario.crisis.current.expectancy,
              crisisProfitFactor: scenario.crisis.current.profitFactor,
              walkForwardExpectancy: scenario.walkForward.current.expectancy,
              walkForwardProfitFactor: scenario.walkForward.current.profitFactor,
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
    "runs actual walk-forward for the selected refinement candidate on top of the current live baseline",
    { timeout: 1000 * 60 * 180 },
    async () => {
      expect(activeScenarios.length).toBeGreaterThan(0);

      const baseline = await loadCurrentBaselineComparatives();
      const report = await runTradingSecondLayerRiskStudy({
        yearlyPeriods: [...YEARLY_PERIODS],
        crisisPeriods: [...CRISIS_PERIODS],
        scenarios: activeScenarios,
        sourcePreference: "local_only",
        backtest: {
          captureSteps: false,
        },
        walkForward: {
          mode: "actual",
          from: "2020-01-01T00:00:00.000Z",
          to: "2025-12-31T23:59:59.000Z",
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
