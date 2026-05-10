import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  buildTradingMarketSessionStudyReport,
  writeTradingMarketSessionStudyReport,
  type TradingBacktestComparativeReport,
} from "@/lib/trading/backtest";

const INPUT_PATH = path.resolve(
  "artifacts/trading-backtests/trading-comparative-sweep-local-2020-2025-yearly-live_high_edge_1_0.json",
);
const OUTPUT_PATH = path.resolve(
  "artifacts/trading-backtests/trading-market-session-study-local-2020-2025-live_high_edge_1_0.json",
);

async function main() {
  const raw = await readFile(INPUT_PATH, "utf8");
  const comparativeReport = JSON.parse(raw) as TradingBacktestComparativeReport;
  const report = buildTradingMarketSessionStudyReport({
    comparativeReport,
    minimumSampleCount: 5,
    nestedMinimumSampleCount: 3,
  });

  await writeTradingMarketSessionStudyReport({
    report,
    outputPath: OUTPUT_PATH,
  });

  console.log(
    JSON.stringify(
      {
        outputPath: OUTPUT_PATH,
        strongestBlocks: report.crossMarket.strongestBlocks.slice(0, 5),
        weakestBlocks: report.crossMarket.weakestBlocks.slice(0, 5),
      },
      null,
      2,
    ),
  );
}

await main();
