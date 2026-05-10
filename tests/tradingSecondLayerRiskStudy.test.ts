import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

import {
  createTradingHistoricalYearPeriods,
  runTradingSecondLayerRiskStudy,
  type TradingBacktestComparativeReport,
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

const SCENARIOS: TradingSecondLayerRiskStudyScenario[] = [
  {
    id: "nas100_breakout_overlap_soft_second_layer",
    description: "Reduce NAS100 breakout continuation risk only in london_ny_overlap.",
    rules: [
      {
        instrument: "NAS100",
        sessions: ["london_ny_overlap"],
        setupTypes: ["breakout_continuation"],
        riskMultiplier: 0.67,
        reason: "Second-layer study softens NAS100 breakout continuation risk in london_ny_overlap.",
      },
    ],
  },
  {
    id: "nas100_breakout_ny_open_soft_second_layer",
    description: "Reduce NAS100 breakout continuation risk only in ny_open.",
    rules: [
      {
        instrument: "NAS100",
        sessions: ["ny_open"],
        setupTypes: ["breakout_continuation"],
        riskMultiplier: 0.67,
        reason: "Second-layer study softens NAS100 breakout continuation risk in ny_open.",
      },
    ],
  },
  {
    id: "us500_pre_market_breakout_soft_second_layer",
    description: "Reduce US500 pre-market breakout continuation risk with a soft second layer.",
    rules: [
      {
        instrument: "US500",
        sessions: ["pre_market"],
        setupTypes: ["breakout_continuation"],
        riskMultiplier: 0.75,
        reason: "Second-layer study softens US500 breakout continuation risk in pre_market.",
      },
    ],
  },
];

const OUTPUT_PATH = path.resolve(
  "artifacts/trading-backtests/trading-second-layer-risk-study-local-2020-2025-live_indices_mixed_soft_risk.json",
);
const BASELINE_YEARLY_PATH = path.resolve(
  "artifacts/trading-backtests/trading-comparative-sweep-local-2020-2025-yearly-live_playbook_market_session_calibrated.json",
);
const BASELINE_CRISIS_PATH = path.resolve(
  "artifacts/trading-backtests/trading-crisis-comparative-local-live_playbook_market_session_calibrated.json",
);
const CURRENT_INDICES_YEARLY_PATH = path.resolve(
  "artifacts/trading-backtests/trading-risk-shaped-affected-yearly-indices_mixed_soft_risk.json",
);
const CURRENT_INDICES_CRISIS_PATH = path.resolve(
  "artifacts/trading-backtests/trading-risk-shaped-affected-crisis-indices_mixed_soft_risk.json",
);

const runStudy = process.env.RUN_TRADING_SECOND_LAYER_STUDY === "1" ? test : test.skip;

function readJsonFile<T>(targetPath: string): T {
  return JSON.parse(readFileSync(targetPath, "utf8")) as T;
}

describe("trading second-layer risk study", () => {
  runStudy(
    "generates a second-layer crisis-aware risk study on top of the live risk-shaped baseline",
    { timeout: 1000 * 60 * 30 },
    async () => {
      const baselineYearly = readJsonFile<TradingBacktestComparativeReport>(BASELINE_YEARLY_PATH);
      const baselineCrisis = readJsonFile<TradingBacktestComparativeReport>(BASELINE_CRISIS_PATH);
      const currentIndicesYearly = readJsonFile<TradingBacktestComparativeReport>(CURRENT_INDICES_YEARLY_PATH);
      const currentIndicesCrisis = readJsonFile<TradingBacktestComparativeReport>(CURRENT_INDICES_CRISIS_PATH);
      const report = await runTradingSecondLayerRiskStudy({
        yearlyPeriods: [...YEARLY_PERIODS],
        crisisPeriods: [...CRISIS_PERIODS],
        scenarios: SCENARIOS,
        sourcePreference: "local_only",
        backtest: {
          captureSteps: false,
        },
        walkForward: {
          mode: "comparative_proxy",
        },
        baseline: {
          yearlyComparatives: [baselineYearly, currentIndicesYearly],
          crisisComparatives: [baselineCrisis, currentIndicesCrisis],
        },
      });

      await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
      await writeFile(OUTPUT_PATH, JSON.stringify(report, null, 2), "utf8");

      console.log(
        JSON.stringify(
          {
            outputPath: OUTPUT_PATH,
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

      expect(report.scenarios.length).toBe(SCENARIOS.length);
    },
  );
});
