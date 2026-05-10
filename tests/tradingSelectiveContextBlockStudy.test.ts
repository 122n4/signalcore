import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, test } from "vitest";

import {
  createTradingHistoricalYearPeriods,
  runTradingContextBlockStudy,
  type TradingContextBlockStudyMetricSummary,
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

const OUTPUT_PATH = path.resolve(
  "artifacts/trading-backtests/trading-selective-context-block-study-nas100_breakout_overlap_quality_clarity_variants.json",
);
const BASELINE_YEARLY_PATH = path.resolve(
  "artifacts/trading-backtests/trading-comparative-sweep-local-2020-2025-yearly-live_risk_shaped_indices.json",
);
const BASELINE_CRISIS_PATH = path.resolve(
  "artifacts/trading-backtests/trading-crisis-comparative-local-live_risk_shaped_indices.json",
);
const BASELINE_WALK_FORWARD_PATH = path.resolve(
  "artifacts/trading-backtests/trading-second-layer-risk-study-actual-walk-forward-live_indices_mixed_soft_risk.json",
);

const runStudy = process.env.RUN_TRADING_SELECTIVE_CONTEXT_BLOCK_STUDY === "1" ? test : test.skip;

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

describe("trading selective context block study", () => {
  runStudy(
    "tests selective NAS100 overlap breakout filters by quality and clarity without hurting walk-forward",
    { timeout: 1000 * 60 * 150 },
    async () => {
      const baselineYearly = await readJson<TradingBacktestComparativeReport>(BASELINE_YEARLY_PATH);
      const baselineCrisis = await readJson<TradingBacktestComparativeReport>(BASELINE_CRISIS_PATH);
      const baselineWalkForward = await readJson<{
        baseline: {
          walkForwardByAffectedInstruments: Record<string, TradingContextBlockStudyMetricSummary>;
        };
      }>(BASELINE_WALK_FORWARD_PATH);

      const report = await runTradingContextBlockStudy({
        yearlyPeriods: [...YEARLY_PERIODS],
        crisisPeriods: [...CRISIS_PERIODS],
        scenarios: [
          {
            id: "nas100_breakout_overlap_non_a_quality_blocked",
            description: "Block NAS100 breakout continuation during London/New York overlap only when setup quality is below A.",
            rules: [
              {
                instrument: "NAS100",
                sessions: ["london_ny_overlap"],
                setupTypes: ["breakout_continuation"],
                qualityGrades: ["B", "C", "D"],
                reason:
                  "Elite-path study blocked lower-grade NAS100 breakout continuation during London/New York overlap.",
              },
            ],
          },
          {
            id: "nas100_breakout_overlap_medium_neutral_blocked",
            description:
              "Block NAS100 breakout continuation during London/New York overlap only when clarity is medium and environment is neutral.",
            rules: [
              {
                instrument: "NAS100",
                sessions: ["london_ny_overlap"],
                setupTypes: ["breakout_continuation"],
                clarityLevels: ["medium"],
                environmentStates: ["neutral"],
                reason:
                  "Elite-path study blocked medium-clarity, neutral-environment NAS100 breakout continuation during London/New York overlap.",
              },
            ],
          },
          {
            id: "nas100_breakout_overlap_non_a_medium_neutral_blocked",
            description:
              "Block NAS100 breakout continuation during London/New York overlap only when quality is below A and context is medium/neutral.",
            rules: [
              {
                instrument: "NAS100",
                sessions: ["london_ny_overlap"],
                setupTypes: ["breakout_continuation"],
                qualityGrades: ["B", "C", "D"],
                clarityLevels: ["medium"],
                environmentStates: ["neutral"],
                reason:
                  "Elite-path study blocked lower-grade NAS100 breakout continuation during London/New York overlap only in medium/neutral context.",
              },
            ],
          },
        ],
        sourcePreference: "local_only",
        backtest: {
          captureSteps: false,
        },
        walkForward: {
          from: "2020-01-01T00:00:00.000Z",
          to: "2025-12-31T23:59:59.000Z",
        },
        baseline: {
          yearlyComparatives: [baselineYearly],
          crisisComparatives: [baselineCrisis],
          walkForwardByAffectedInstruments: baselineWalkForward.baseline.walkForwardByAffectedInstruments,
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

      expect(report.scenarios.length).toBe(3);
    },
  );
});
