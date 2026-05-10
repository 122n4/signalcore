import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, test } from "vitest";

import {
  createTradingHistoricalYearPeriods,
  runTradingHistoricalComparativeSweep,
  writeTradingHistoricalComparativeReport,
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

const runStudy = process.env.RUN_TRADING_CURRENT_LIVE_SLICE === "1" ? test : test.skip;
const instrumentList =
  process.env.TRADING_LIVE_SLICE_INSTRUMENTS?.split(",")
    .map((value) => value.trim().toUpperCase())
    .filter((value) => value.length > 0) ?? [];

const label =
  process.env.TRADING_LIVE_SLICE_LABEL?.trim().toLowerCase() ??
  (instrumentList.length > 0 ? instrumentList.join("_").toLowerCase() : "unknown");

const OUTPUT_DIR = path.resolve("artifacts/trading-backtests");
const YEARLY_OUTPUT = path.resolve(OUTPUT_DIR, `trading-current-live-slice-${label}-yearly.json`);
const CRISIS_OUTPUT = path.resolve(OUTPUT_DIR, `trading-current-live-slice-${label}-crisis.json`);
const SUMMARY_OUTPUT = path.resolve(OUTPUT_DIR, `trading-current-live-slice-${label}-summary.json`);

describe("trading current live slice", () => {
  runStudy(
    "captures yearly and crisis comparatives for a focused instrument slice using the current live engine state",
    { timeout: 1000 * 60 * 90 },
    async () => {
      expect(instrumentList.length).toBeGreaterThan(0);

      const yearly = await runTradingHistoricalComparativeSweep({
        periods: [...YEARLY_PERIODS],
        instruments: instrumentList,
        continueOnError: true,
        sourcePreference: "local_only",
        backtest: {
          captureSteps: false,
        },
      });
      const crisis = await runTradingHistoricalComparativeSweep({
        periods: [...CRISIS_PERIODS],
        instruments: instrumentList,
        continueOnError: true,
        sourcePreference: "local_only",
        backtest: {
          captureSteps: false,
        },
      });

      await mkdir(OUTPUT_DIR, { recursive: true });
      await writeTradingHistoricalComparativeReport({
        report: yearly,
        outputPath: YEARLY_OUTPUT,
      });
      await writeTradingHistoricalComparativeReport({
        report: crisis,
        outputPath: CRISIS_OUTPUT,
      });
      await writeFile(
        SUMMARY_OUTPUT,
        JSON.stringify(
          {
            instruments: instrumentList,
            yearlyOutput: YEARLY_OUTPUT,
            crisisOutput: CRISIS_OUTPUT,
            yearlySummary: yearly.aggregate.summary,
            crisisSummary: crisis.aggregate.summary,
          },
          null,
          2,
        ),
        "utf8",
      );

      expect(yearly.periods.length).toBe(YEARLY_PERIODS.length);
      expect(crisis.periods.length).toBe(CRISIS_PERIODS.length);
    },
  );
});
