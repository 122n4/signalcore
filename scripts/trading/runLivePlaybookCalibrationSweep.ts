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

const PERIODS = createTradingHistoricalYearPeriods({
  startYear: 2020,
  endYear: 2025,
});

const COMPARATIVE_OUTPUT = path.resolve(
  "artifacts/trading-backtests/trading-comparative-sweep-local-2020-2025-yearly-live_playbook_market_session_calibrated.json",
);
const SETUP_OUTPUT = path.resolve(
  "artifacts/trading-backtests/trading-setup-segmentation-local-2020-2025-yearly-live_playbook_market_session_calibrated.json",
);
const MARKET_SESSION_OUTPUT = path.resolve(
  "artifacts/trading-backtests/trading-market-session-study-local-2020-2025-live_playbook_market_session_calibrated.json",
);

async function main() {
  const comparative = await runTradingHistoricalComparativeSweep({
    periods: PERIODS,
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

  await writeTradingHistoricalComparativeReport({
    report: comparative,
    outputPath: COMPARATIVE_OUTPUT,
  });
  await writeTradingSetupSegmentationReport({
    report: setupSegmentation,
    outputPath: SETUP_OUTPUT,
  });
  await writeTradingMarketSessionStudyReport({
    report: marketSessionStudy,
    outputPath: MARKET_SESSION_OUTPUT,
  });

  console.log(
    JSON.stringify(
      {
        comparative: COMPARATIVE_OUTPUT,
        setupSegmentation: SETUP_OUTPUT,
        marketSessionStudy: MARKET_SESSION_OUTPUT,
        summary: comparative.aggregate.summary,
      },
      null,
      2,
    ),
  );
}

await main();
