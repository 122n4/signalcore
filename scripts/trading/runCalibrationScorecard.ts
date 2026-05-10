import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  buildCalibrationScorecard,
  type CrisisValidationReport,
  type TradingBacktestComparativeReport,
} from "@/lib/trading/backtest";

const CURRENT_COMPARATIVE_PATH = path.resolve(
  "artifacts/trading-backtests/trading-comparative-sweep-local-2020-2025-yearly-live_playbook_market_session_calibrated.json",
);
const CRISIS_VALIDATION_PATH = path.resolve(
  "artifacts/trading-backtests/trading-crisis-validation-local-live_vs_pre_context_blocks.json",
);
const OUTPUT_PATH = path.resolve(
  "artifacts/trading-backtests/trading-calibration-scorecard-live_playbook_market_session_calibrated.json",
);

async function readJsonFile<T>(inputPath: string): Promise<T> {
  const raw = await readFile(inputPath, "utf8");
  return JSON.parse(raw) as T;
}

async function main() {
  const comparative = await readJsonFile<TradingBacktestComparativeReport>(CURRENT_COMPARATIVE_PATH);
  const crisisValidation = await readJsonFile<CrisisValidationReport>(CRISIS_VALIDATION_PATH);
  const scorecard = buildCalibrationScorecard({
    currentComparative: comparative,
    crisisValidation,
  });

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, JSON.stringify(scorecard, null, 2), "utf8");

  console.log(
    JSON.stringify(
      {
        outputPath: OUTPUT_PATH,
        assessment: scorecard.assessment,
        gaps: scorecard.gaps,
        blockers: scorecard.blockers,
      },
      null,
      2,
    ),
  );
}

await main();
