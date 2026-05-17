import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  runTradingHistoricalComparativeSweep,
  writeTradingHistoricalComparativeReport,
} from "@/lib/trading/backtest";
import type { TradingHistoricalPeriod } from "@/lib/trading/backtest";
import type { TradingTimeframe } from "@/lib/trading/data";

const DEFAULT_INSTRUMENTS = ["SOLUSD", "BNBUSD", "XRPUSD"];
const DEFAULT_TIMEFRAMES: TradingTimeframe[] = ["4h", "1h", "15m"];
const MIN_PROMOTION_SAMPLE_TRADES = 50;
const MIN_WATCHLIST_SAMPLE_TRADES = 10;
const MIN_PROMOTION_PROFIT_FACTOR = 1.35;
const MIN_PROMOTION_EXPECTANCY = 0.15;

type ExpansionMarketSummary = {
  totalTrades: number;
  winRate: number;
  averageRiskReward: number | null;
  expectancy: number;
  maxDrawdown: number;
  profitFactor: number | null;
  tradeFrequency: number;
  grossProfitPct: number;
  grossLossPct: number;
};

function qualifyExpansionMarket(summary: ExpansionMarketSummary): {
  status: "promote_candidate" | "research_watchlist" | "reject";
  reason: string;
} {
  const profitFactor = summary.profitFactor ?? 0;

  if (summary.expectancy <= 0 || profitFactor < 1) {
    return {
      status: "reject",
      reason: "Negative or sub-1 profit factor in the tested window.",
    };
  }

  if (
    summary.totalTrades >= MIN_PROMOTION_SAMPLE_TRADES &&
    summary.expectancy >= MIN_PROMOTION_EXPECTANCY &&
    profitFactor >= MIN_PROMOTION_PROFIT_FACTOR
  ) {
    return {
      status: "promote_candidate",
      reason: "Positive expectancy, acceptable PF, and enough sample for deeper validation.",
    };
  }

  if (summary.totalTrades >= MIN_WATCHLIST_SAMPLE_TRADES) {
    return {
      status: "research_watchlist",
      reason: "Positive edge, but sample is still too small for live promotion.",
    };
  }

  return {
    status: "research_watchlist",
    reason: "Positive edge, but sample is very small; collect more history before trusting it.",
  };
}

function readArg(name: string): string | null {
  const prefix = `--${name}=`;
  const matched = process.argv.find((arg) => arg.startsWith(prefix));
  return matched ? matched.slice(prefix.length) : null;
}

function parseCsvArg(name: string, fallback: string[]): string[] {
  const raw = readArg(name);
  if (!raw) return fallback;
  return raw
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);
}

function dateArg(name: string, fallback: string): string {
  const raw = readArg(name) ?? fallback;
  return new Date(raw).toISOString();
}

async function main() {
  process.env.TRADING_BACKTEST_LOCAL_DATA_DIR ??= "data/historical-staging";

  const from = dateArg("from", "2025-01-01T00:00:00.000Z");
  const to = dateArg("to", "2025-03-31T23:59:59.000Z");
  const instruments = parseCsvArg("instruments", DEFAULT_INSTRUMENTS);
  const label = `${from.slice(0, 10)}_${to.slice(0, 10)}`;
  const periods: TradingHistoricalPeriod[] = [{ label, from, to }];
  const outputDir = path.resolve("artifacts/trading-backtests");
  const outputPath = path.join(outputDir, `trading-expansion-market-study-${label}.json`);
  const summaryPath = path.join(outputDir, `trading-expansion-market-study-${label}-summary.json`);

  const report = await runTradingHistoricalComparativeSweep({
    periods,
    instruments,
    timeframes: DEFAULT_TIMEFRAMES,
    sourcePreference: "local_only",
    continueOnError: true,
    backtest: {
      captureSteps: false,
    },
  });

  const summary = {
    generatedAt: new Date().toISOString(),
    localDataDir: process.env.TRADING_BACKTEST_LOCAL_DATA_DIR,
    request: {
      instruments,
      from,
      to,
      timeframes: DEFAULT_TIMEFRAMES,
    },
    aggregate: report.aggregate.summary,
    byMarket: Object.fromEntries(
      Object.entries(report.comparisons.byMarket).map(([instrument, market]) => [
        instrument,
        {
          ...market.summary,
          qualification: qualifyExpansionMarket(market.summary),
        },
      ]),
    ),
    failures: report.periods.flatMap((period) => period.report.failures),
  };

  await mkdir(outputDir, { recursive: true });
  await writeTradingHistoricalComparativeReport({ report, outputPath });
  await writeFile(summaryPath, JSON.stringify(summary, null, 2), "utf8");
  console.log(JSON.stringify(summary, null, 2));
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
