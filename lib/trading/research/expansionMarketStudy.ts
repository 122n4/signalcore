import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  runTradingHistoricalComparativeSweep,
  writeTradingHistoricalComparativeReport,
} from "@/lib/trading/backtest";
import type { TradingHistoricalPeriod } from "@/lib/trading/backtest";
import type { TradingTimeframe } from "@/lib/trading/data";

export const DEFAULT_RESEARCH_EXPANSION_INSTRUMENTS = ["SOLUSD", "BNBUSD", "XRPUSD"] as const;
export const DEFAULT_RESEARCH_EXPANSION_TIMEFRAMES: TradingTimeframe[] = ["4h", "1h", "15m"];

const MIN_PROMOTION_SAMPLE_TRADES = 50;
const MIN_WATCHLIST_SAMPLE_TRADES = 10;
const MIN_PROMOTION_PROFIT_FACTOR = 1.35;
const MIN_PROMOTION_EXPECTANCY = 0.15;

export type ExpansionMarketSummary = {
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

export type ExpansionMarketQualification = {
  status: "promote_candidate" | "research_watchlist" | "reject";
  reason: string;
};

export type ResearchExpansionMarketStudySummary = {
  generatedAt: string;
  localDataDir: string | undefined;
  request: {
    instruments: string[];
    from: string;
    to: string;
    timeframes: TradingTimeframe[];
  };
  aggregate: ExpansionMarketSummary;
  byMarket: Record<string, ExpansionMarketSummary & { qualification: ExpansionMarketQualification }>;
  failures: Array<{ instrument: string; error: string }>;
  outputs: {
    reportPath: string;
    summaryPath: string;
  };
};

export function qualifyExpansionMarket(summary: ExpansionMarketSummary): ExpansionMarketQualification {
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

export async function runResearchExpansionMarketStudy(args: {
  from: string;
  to: string;
  instruments?: string[];
  timeframes?: TradingTimeframe[];
  outputDir?: string;
  localDataDir?: string;
}): Promise<ResearchExpansionMarketStudySummary> {
  process.env.TRADING_BACKTEST_LOCAL_DATA_DIR ??= args.localDataDir ?? "data/historical-staging";

  const from = new Date(args.from).toISOString();
  const to = new Date(args.to).toISOString();
  const instruments = (args.instruments?.length ? args.instruments : [...DEFAULT_RESEARCH_EXPANSION_INSTRUMENTS])
    .map((instrument) => instrument.trim().toUpperCase())
    .filter(Boolean);
  const timeframes = args.timeframes?.length ? args.timeframes : DEFAULT_RESEARCH_EXPANSION_TIMEFRAMES;
  const label = `${from.slice(0, 10)}_${to.slice(0, 10)}`;
  const periods: TradingHistoricalPeriod[] = [{ label, from, to }];
  const outputDir = path.resolve(args.outputDir ?? "artifacts/trading-backtests");
  const outputPath = path.join(outputDir, `trading-expansion-market-study-${label}.json`);
  const summaryPath = path.join(outputDir, `trading-expansion-market-study-${label}-summary.json`);

  const report = await runTradingHistoricalComparativeSweep({
    periods,
    instruments,
    timeframes,
    sourcePreference: "local_only",
    cachePolicy: "refresh",
    continueOnError: true,
    backtest: {
      captureSteps: false,
    },
  });

  const summary: ResearchExpansionMarketStudySummary = {
    generatedAt: new Date().toISOString(),
    localDataDir: process.env.TRADING_BACKTEST_LOCAL_DATA_DIR,
    request: {
      instruments,
      from,
      to,
      timeframes,
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
    outputs: {
      reportPath: outputPath,
      summaryPath,
    },
  };

  await mkdir(outputDir, { recursive: true });
  await writeTradingHistoricalComparativeReport({ report, outputPath });
  await writeFile(summaryPath, JSON.stringify(summary, null, 2), "utf8");

  return summary;
}
