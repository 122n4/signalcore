import {
  runTradingHistoricalCoverageAudit,
  writeTradingHistoricalCoverageAuditReport,
  type TradingHistoricalPeriod,
} from "../../lib/trading/backtest/index";
import { loadResearchConfig } from "../../lib/trading/research/index";

function readArg(name: string): string | null {
  const prefix = `--${name}=`;
  const matched = process.argv.find((arg) => arg.startsWith(prefix));
  return matched ? matched.slice(prefix.length) : null;
}

function buildPeriods(fromYear: number, toYear: number): TradingHistoricalPeriod[] {
  const periods: TradingHistoricalPeriod[] = [];
  for (let year = fromYear; year <= toYear; year += 1) {
    periods.push({
      label: String(year),
      from: `${year}-01-01T00:00:00.000Z`,
      to: `${year}-12-31T23:59:59.000Z`,
    });
  }
  return periods;
}

async function main() {
  const config = await loadResearchConfig();
  const fromYear = Number(readArg("fromYear") ?? process.env.TRADING_AUDIT_FROM_YEAR ?? "2019");
  const toYear = Number(readArg("toYear") ?? process.env.TRADING_AUDIT_TO_YEAR ?? "2025");
  const instruments = (
    readArg("instruments")
    ?? process.env.TRADING_AUDIT_INSTRUMENTS
    ?? config.study.instruments.join(",")
  )
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);
  const outputPath =
    readArg("output")
    ?? process.env.TRADING_AUDIT_OUTPUT_PATH
    ?? config.paths.coverageAuditPath
    ?? "artifacts/trading-backtests/trading-coverage-audit-local-2019-2025.json";

  const report = await runTradingHistoricalCoverageAudit({
    periods: buildPeriods(fromYear, toYear),
    instruments,
    timeframes: ["4h", "1h", "15m"],
    continueOnError: true,
    sourcePreference: "local_only",
  });
  const writtenPath = await writeTradingHistoricalCoverageAuditReport({
    report,
    outputPath,
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        outputPath: writtenPath,
        instruments,
        fromYear,
        toYear,
        summary: report.summary.byInstrument,
        failures: report.summary.failures,
      },
      null,
      2,
    ),
  );
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
