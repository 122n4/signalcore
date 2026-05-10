import path from "node:path";

import {
  buildTradingMarketSessionStudyReport,
  buildTradingSetupSegmentationReport,
  createTradingHistoricalYearPeriods,
  runTradingHistoricalComparativeSweep,
  writeTradingHistoricalComparativeReport,
  writeTradingMarketSessionStudyReport,
  writeTradingSetupSegmentationReport,
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

const OUTPUT_PREFIX = "live_current_xau_btc_breakout_risk_shaped";

const YEARLY_COMPARATIVE_OUTPUT = path.resolve(
  `artifacts/trading-backtests/trading-comparative-sweep-local-2020-2025-yearly-${OUTPUT_PREFIX}.json`,
);
const YEARLY_SETUP_OUTPUT = path.resolve(
  `artifacts/trading-backtests/trading-setup-segmentation-local-2020-2025-yearly-${OUTPUT_PREFIX}.json`,
);
const YEARLY_MARKET_SESSION_OUTPUT = path.resolve(
  `artifacts/trading-backtests/trading-market-session-study-local-2020-2025-${OUTPUT_PREFIX}.json`,
);
const CRISIS_COMPARATIVE_OUTPUT = path.resolve(
  `artifacts/trading-backtests/trading-crisis-comparative-local-${OUTPUT_PREFIX}.json`,
);

async function main() {
  const comparative = await runTradingHistoricalComparativeSweep({
    periods: YEARLY_PERIODS,
    continueOnError: true,
    sourcePreference: "local_only",
  });
  const setupSegmentation = buildTradingSetupSegmentationReport({
    comparativeReport: comparative,
    minimumSampleCount: 5,
  });
  const marketSessionStudy = buildTradingMarketSessionStudyReport({
    comparativeReport: comparative,
    minimumSampleCount: 5,
    nestedMinimumSampleCount: 3,
  });
  const crisisComparative = await runTradingHistoricalComparativeSweep({
    periods: [...CRISIS_PERIODS],
    continueOnError: true,
    sourcePreference: "local_only",
  });

  await writeTradingHistoricalComparativeReport({
    report: comparative,
    outputPath: YEARLY_COMPARATIVE_OUTPUT,
  });
  await writeTradingSetupSegmentationReport({
    report: setupSegmentation,
    outputPath: YEARLY_SETUP_OUTPUT,
  });
  await writeTradingMarketSessionStudyReport({
    report: marketSessionStudy,
    outputPath: YEARLY_MARKET_SESSION_OUTPUT,
  });
  await writeTradingHistoricalComparativeReport({
    report: crisisComparative,
    outputPath: CRISIS_COMPARATIVE_OUTPUT,
  });

  console.log(
    JSON.stringify(
      {
        yearlyComparative: YEARLY_COMPARATIVE_OUTPUT,
        yearlySetupSegmentation: YEARLY_SETUP_OUTPUT,
        yearlyMarketSessionStudy: YEARLY_MARKET_SESSION_OUTPUT,
        crisisComparative: CRISIS_COMPARATIVE_OUTPUT,
        yearlySummary: comparative.aggregate.summary,
        crisisSummary: crisisComparative.aggregate.summary,
      },
      null,
      2,
    ),
  );
}

await main();
