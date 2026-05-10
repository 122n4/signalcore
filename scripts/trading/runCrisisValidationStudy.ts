import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  createDefaultTradingPlaybook,
} from "@/lib/trading/playbook";
import {
  runTradingHistoricalComparativeSweep,
  type TradingBacktestComparativeReport,
  type TradingHistoricalPeriod,
} from "@/lib/trading/backtest";

const PERIODS: TradingHistoricalPeriod[] = [
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
];

const OUTPUT_PATH = path.resolve(
  "artifacts/trading-backtests/trading-crisis-validation-local-live_vs_pre_context_blocks.json",
);

function roundMetric(value: number | null): number | null {
  if (value === null) {
    return null;
  }

  return Math.round(value * 10_000) / 10_000;
}

function summarize(report: TradingBacktestComparativeReport) {
  return {
    totalTrades: report.aggregate.summary.totalTrades,
    winRate: report.aggregate.summary.winRate,
    averageRiskReward: report.aggregate.summary.averageRiskReward,
    expectancy: report.aggregate.summary.expectancy,
    profitFactor: report.aggregate.summary.profitFactor,
    maxDrawdown: report.aggregate.summary.maxDrawdown,
    grossProfitPct: report.aggregate.summary.grossProfitPct,
    grossLossPct: report.aggregate.summary.grossLossPct,
  };
}

function deltaMetric(current: number | null, baseline: number | null): number | null {
  if (current === null || baseline === null) {
    return null;
  }

  return roundMetric(current - baseline);
}

function buildDelta(
  current: TradingBacktestComparativeReport,
  baseline: TradingBacktestComparativeReport,
) {
  return {
    totalTrades: current.aggregate.summary.totalTrades - baseline.aggregate.summary.totalTrades,
    winRate: roundMetric(current.aggregate.summary.winRate - baseline.aggregate.summary.winRate),
    expectancy: roundMetric(current.aggregate.summary.expectancy - baseline.aggregate.summary.expectancy),
    profitFactor: deltaMetric(
      current.aggregate.summary.profitFactor,
      baseline.aggregate.summary.profitFactor,
    ),
    maxDrawdown: roundMetric(
      current.aggregate.summary.maxDrawdown - baseline.aggregate.summary.maxDrawdown,
    ),
    grossProfitPct: roundMetric(
      current.aggregate.summary.grossProfitPct - baseline.aggregate.summary.grossProfitPct,
    ),
    grossLossPct: roundMetric(
      current.aggregate.summary.grossLossPct - baseline.aggregate.summary.grossLossPct,
    ),
  };
}

function buildPerPeriodDelta(
  current: TradingBacktestComparativeReport,
  baseline: TradingBacktestComparativeReport,
) {
  return Object.fromEntries(
    PERIODS.map((period) => {
      const currentSummary = current.comparisons.byPeriod[period.label]?.summary;
      const baselineSummary = baseline.comparisons.byPeriod[period.label]?.summary;

      if (!currentSummary || !baselineSummary) {
        return [period.label, null];
      }

      return [
        period.label,
        {
          current: currentSummary,
          baseline: baselineSummary,
          delta: {
            totalTrades: currentSummary.totalTrades - baselineSummary.totalTrades,
            winRate: roundMetric(currentSummary.winRate - baselineSummary.winRate),
            expectancy: roundMetric(currentSummary.expectancy - baselineSummary.expectancy),
            profitFactor: deltaMetric(currentSummary.profitFactor, baselineSummary.profitFactor),
            maxDrawdown: roundMetric(currentSummary.maxDrawdown - baselineSummary.maxDrawdown),
            grossProfitPct: roundMetric(
              currentSummary.grossProfitPct - baselineSummary.grossProfitPct,
            ),
            grossLossPct: roundMetric(
              currentSummary.grossLossPct - baselineSummary.grossLossPct,
            ),
          },
        },
      ];
    }),
  );
}

async function main() {
  const baselinePlaybook = createDefaultTradingPlaybook();
  baselinePlaybook.baseRules.blockedTradeValidContexts = [];

  const baseline = await runTradingHistoricalComparativeSweep({
    periods: PERIODS,
    continueOnError: true,
    sourcePreference: "local_only",
    backtest: {
      playbook: baselinePlaybook,
    },
  });

  const current = await runTradingHistoricalComparativeSweep({
    periods: PERIODS,
    continueOnError: true,
    sourcePreference: "local_only",
  });

  const report = {
    generatedAt: new Date().toISOString(),
    periods: PERIODS,
    baselineLabel: "pre_context_blocks_high_edge_1_0",
    currentLabel: "live_playbook_market_session_calibrated",
    aggregate: {
      baseline: summarize(baseline),
      current: summarize(current),
      delta: buildDelta(current, baseline),
    },
    byPeriod: buildPerPeriodDelta(current, baseline),
  };

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, JSON.stringify(report, null, 2), "utf8");

  console.log(
    JSON.stringify(
      {
        outputPath: OUTPUT_PATH,
        aggregate: report.aggregate,
        byPeriod: report.byPeriod,
      },
      null,
      2,
    ),
  );
}

await main();
