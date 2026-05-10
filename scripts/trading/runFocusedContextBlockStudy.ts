import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { runTradingContextBlockStudy } from "@/lib/trading/backtest";

const YEARLY_PERIODS = [
  { label: "2020", from: "2020-01-01T00:00:00.000Z", to: "2020-12-31T23:59:59.000Z" },
  { label: "2021", from: "2021-01-01T00:00:00.000Z", to: "2021-12-31T23:59:59.000Z" },
  { label: "2022", from: "2022-01-01T00:00:00.000Z", to: "2022-12-31T23:59:59.000Z" },
  { label: "2023", from: "2023-01-01T00:00:00.000Z", to: "2023-12-31T23:59:59.000Z" },
  { label: "2024", from: "2024-01-01T00:00:00.000Z", to: "2024-12-31T23:59:59.000Z" },
  { label: "2025", from: "2025-01-01T00:00:00.000Z", to: "2025-12-31T23:59:59.000Z" },
] as const;

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
  "artifacts/trading-backtests/trading-context-block-study-nas100_breakout_overlap_blocked.json",
);

async function main() {
  const report = await runTradingContextBlockStudy({
    yearlyPeriods: [...YEARLY_PERIODS],
    crisisPeriods: [...CRISIS_PERIODS],
    scenarios: [
      {
        id: "nas100_breakout_overlap_blocked",
        description: "Block NAS100 breakout continuation during London/New York overlap.",
        rules: [
          {
            instrument: "NAS100",
            sessions: ["london_ny_overlap"],
            setupTypes: ["breakout_continuation"],
            reason: "Elite-path study blocked NAS100 breakout continuation during London/New York overlap.",
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
}

await main();
