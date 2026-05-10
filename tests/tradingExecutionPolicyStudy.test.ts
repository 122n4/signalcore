import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, test } from "vitest";

import {
  computeBacktestMetrics,
  createTradingHistoricalYearPeriods,
  runTradingHistoricalComparativeSweep,
  runTradingWalkForwardStudy,
  type TradingBacktestComparativeReport,
  type TradingBacktestTrade,
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

const OUTPUT_DIR = path.resolve("artifacts/trading-backtests");
const SCREEN_OUTPUT = path.resolve(
  OUTPUT_DIR,
  "trading-execution-policy-study-local-2020-2025-current_live_screen.json",
);
const ACTUAL_OUTPUT = path.resolve(
  OUTPUT_DIR,
  "trading-execution-policy-study-actual-walk-forward-allowed_only.json",
);

const BASELINE_FULL_YEARLY_PATH = path.resolve(
  "artifacts/trading-backtests/trading-comparative-sweep-local-2020-2025-yearly-live_playbook_market_session_calibrated.json",
);
const BASELINE_FULL_CRISIS_PATH = path.resolve(
  "artifacts/trading-backtests/trading-crisis-comparative-local-live_playbook_market_session_calibrated.json",
);
const CURRENT_INDICES_YEARLY_PATH = path.resolve(
  "artifacts/trading-backtests/trading-risk-shaped-affected-yearly-indices_mixed_soft_risk.json",
);
const CURRENT_INDICES_CRISIS_PATH = path.resolve(
  "artifacts/trading-backtests/trading-risk-shaped-affected-crisis-indices_mixed_soft_risk.json",
);
const CURRENT_NAS100_YEARLY_PATH = path.resolve(
  "artifacts/trading-backtests/trading-current-live-slice-nas100-yearly.json",
);
const CURRENT_NAS100_CRISIS_PATH = path.resolve(
  "artifacts/trading-backtests/trading-current-live-slice-nas100-crisis.json",
);

const runScreen = process.env.RUN_TRADING_EXECUTION_POLICY_STUDY === "1" ? test : test.skip;
const runActual = process.env.RUN_TRADING_EXECUTION_POLICY_ACTUAL_WF === "1" ? test : test.skip;

type MetricSummary = {
  totalTrades: number;
  winRate: number;
  averageRiskReward: number | null;
  expectancy: number;
  profitFactor: number | null;
  maxDrawdown: number;
};

function roundMetric(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.round(value * 10_000) / 10_000;
}

function buildEquityValues(trades: TradingBacktestTrade[], startingEquity = 100): number[] {
  const orderedTrades = [...trades].sort((left, right) => left.closedAt.localeCompare(right.closedAt));
  let equity = startingEquity;
  const values = [equity];

  for (const trade of orderedTrades) {
    equity = roundMetric(equity + trade.pnlPct) ?? equity;
    values.push(equity);
  }

  return values;
}

async function readJsonFile<T>(targetPath: string): Promise<T> {
  return JSON.parse(await readFile(targetPath, "utf8")) as T;
}

function buildInstrumentSlicesFromComparative(
  report: TradingBacktestComparativeReport,
): Map<string, { trades: TradingBacktestTrade[]; evaluatedBars: number }> {
  const output = new Map<string, { trades: TradingBacktestTrade[]; evaluatedBars: number }>();

  for (const instrument of report.request.instruments) {
    const selectedMarkets = report.periods.flatMap((periodResult) =>
      periodResult.report.markets.filter((market) => market.instrument === instrument),
    );

    if (selectedMarkets.length === 0) {
      continue;
    }

    output.set(instrument, {
      trades: selectedMarkets.flatMap((market) => market.report.trades),
      evaluatedBars: selectedMarkets.reduce((sum, market) => sum + market.report.period.evaluatedBars, 0),
    });
  }

  return output;
}

function computeSummaryFromComparativeCollection(
  reports: TradingBacktestComparativeReport[],
): MetricSummary {
  const byInstrument = new Map<string, { trades: TradingBacktestTrade[]; evaluatedBars: number }>();

  for (const report of reports) {
    const slices = buildInstrumentSlicesFromComparative(report);

    for (const [instrument, slice] of slices.entries()) {
      byInstrument.set(instrument, slice);
    }
  }

  const collected = Array.from(byInstrument.values());
  const trades = collected.flatMap((slice) => slice.trades);
  const evaluatedBars = collected.reduce((sum, slice) => sum + slice.evaluatedBars, 0);
  const metrics = computeBacktestMetrics({
    trades,
    evaluatedBars,
    equityValues: buildEquityValues(trades),
  });

  return {
    totalTrades: trades.length,
    winRate: metrics.winRate,
    averageRiskReward: metrics.averageRiskReward,
    expectancy: metrics.expectancy,
    profitFactor: metrics.profitFactor,
    maxDrawdown: metrics.maxDrawdown,
  };
}

function buildDelta(current: MetricSummary, baseline: MetricSummary) {
  return {
    totalTrades: current.totalTrades - baseline.totalTrades,
    winRate: roundMetric(current.winRate - baseline.winRate) ?? 0,
    expectancy: roundMetric(current.expectancy - baseline.expectancy) ?? 0,
    profitFactor:
      current.profitFactor === null || baseline.profitFactor === null
        ? null
        : roundMetric(current.profitFactor - baseline.profitFactor),
    maxDrawdown: roundMetric(current.maxDrawdown - baseline.maxDrawdown) ?? 0,
  };
}

async function loadCurrentBaselineComparatives() {
  const baselineFullYearly = await readJsonFile<TradingBacktestComparativeReport>(
    BASELINE_FULL_YEARLY_PATH,
  );
  const baselineFullCrisis = await readJsonFile<TradingBacktestComparativeReport>(
    BASELINE_FULL_CRISIS_PATH,
  );
  const currentIndicesYearly = await readJsonFile<TradingBacktestComparativeReport>(
    CURRENT_INDICES_YEARLY_PATH,
  );
  const currentIndicesCrisis = await readJsonFile<TradingBacktestComparativeReport>(
    CURRENT_INDICES_CRISIS_PATH,
  );
  const currentNas100Yearly = await readJsonFile<TradingBacktestComparativeReport>(
    CURRENT_NAS100_YEARLY_PATH,
  );
  const currentNas100Crisis = await readJsonFile<TradingBacktestComparativeReport>(
    CURRENT_NAS100_CRISIS_PATH,
  );

  return {
    yearlyComparatives: [baselineFullYearly, currentIndicesYearly, currentNas100Yearly],
    crisisComparatives: [baselineFullCrisis, currentIndicesCrisis, currentNas100Crisis],
  };
}

describe("trading execution policy study", () => {
  runScreen(
    "screens allowed_only execution policy against the current live baseline",
    { timeout: 1000 * 60 * 180 },
    async () => {
      const baseline = await loadCurrentBaselineComparatives();
      const baselineAggregate = computeSummaryFromComparativeCollection(baseline.yearlyComparatives);
      const baselineCrisis = computeSummaryFromComparativeCollection(baseline.crisisComparatives);

      const yearly = await runTradingHistoricalComparativeSweep({
        periods: [...YEARLY_PERIODS],
        instruments: ["EURUSD", "GBPUSD", "USDJPY", "XAUUSD", "NAS100", "US500", "BTCUSD", "ETHUSD"],
        timeframes: ["4h", "1h", "15m"],
        continueOnError: true,
        sourcePreference: "local_only",
        backtest: {
          captureSteps: false,
          executionPolicy: "allowed_only",
        },
      });
      const crisis = await runTradingHistoricalComparativeSweep({
        periods: [...CRISIS_PERIODS],
        instruments: ["EURUSD", "GBPUSD", "USDJPY", "XAUUSD", "NAS100", "US500", "BTCUSD", "ETHUSD"],
        timeframes: ["4h", "1h", "15m"],
        continueOnError: true,
        sourcePreference: "local_only",
        backtest: {
          captureSteps: false,
          executionPolicy: "allowed_only",
        },
      });

      const aggregateSummary = computeSummaryFromComparativeCollection([yearly]);
      const crisisSummary = computeSummaryFromComparativeCollection([crisis]);
      const report = {
        generatedAt: new Date().toISOString(),
        baseline: {
          aggregate: baselineAggregate,
          crisis: baselineCrisis,
        },
        candidate: {
          aggregate: {
            current: aggregateSummary,
            delta: buildDelta(aggregateSummary, baselineAggregate),
          },
          crisis: {
            current: crisisSummary,
            delta: buildDelta(crisisSummary, baselineCrisis),
          },
          gates: {
            aggregateImproved:
              aggregateSummary.expectancy >= baselineAggregate.expectancy &&
              (aggregateSummary.profitFactor ?? 0) >= (baselineAggregate.profitFactor ?? 0) &&
              aggregateSummary.maxDrawdown <= baselineAggregate.maxDrawdown,
            crisesNotWorse:
              crisisSummary.expectancy >= baselineCrisis.expectancy &&
              (crisisSummary.profitFactor ?? 0) >= (baselineCrisis.profitFactor ?? 0) &&
              crisisSummary.maxDrawdown <= baselineCrisis.maxDrawdown,
          },
        },
      };

      await mkdir(OUTPUT_DIR, { recursive: true });
      await writeFile(SCREEN_OUTPUT, JSON.stringify(report, null, 2), "utf8");

      console.log(
        JSON.stringify(
          {
            outputPath: SCREEN_OUTPUT,
            aggregate: report.candidate.aggregate.current,
            aggregateDelta: report.candidate.aggregate.delta,
            crisis: report.candidate.crisis.current,
            crisisDelta: report.candidate.crisis.delta,
            gates: report.candidate.gates,
          },
          null,
          2,
        ),
      );

      expect(report.candidate.aggregate.current.totalTrades).toBeGreaterThan(0);
    },
  );

  runActual(
    "runs actual walk-forward for allowed_only execution policy",
    { timeout: 1000 * 60 * 240 },
    async () => {
      const baseline = await loadCurrentBaselineComparatives();
      const baselineAggregate = computeSummaryFromComparativeCollection(baseline.yearlyComparatives);
      const baselineCrisis = computeSummaryFromComparativeCollection(baseline.crisisComparatives);
      const baselineWalkForward = await runTradingWalkForwardStudy({
        instruments: ["EURUSD", "GBPUSD", "USDJPY", "XAUUSD", "NAS100", "US500", "BTCUSD", "ETHUSD"],
        from: "2020-01-01T00:00:00.000Z",
        to: "2025-12-31T23:59:59.000Z",
        timeframes: ["4h", "1h", "15m"],
        sourcePreference: "local_only",
        backtest: {
          captureSteps: false,
        },
      });
      const baselineWalkForwardSummary: MetricSummary = {
        totalTrades: baselineWalkForward.aggregate.totalTrades,
        winRate: baselineWalkForward.aggregate.winRate,
        averageRiskReward: baselineWalkForward.aggregate.averageRiskReward,
        expectancy: baselineWalkForward.aggregate.expectancy,
        profitFactor: baselineWalkForward.aggregate.profitFactor,
        maxDrawdown: baselineWalkForward.aggregate.maxDrawdown,
      };

      const yearly = await runTradingHistoricalComparativeSweep({
        periods: [...YEARLY_PERIODS],
        instruments: ["EURUSD", "GBPUSD", "USDJPY", "XAUUSD", "NAS100", "US500", "BTCUSD", "ETHUSD"],
        timeframes: ["4h", "1h", "15m"],
        continueOnError: true,
        sourcePreference: "local_only",
        backtest: {
          captureSteps: false,
          executionPolicy: "allowed_only",
        },
      });
      const crisis = await runTradingHistoricalComparativeSweep({
        periods: [...CRISIS_PERIODS],
        instruments: ["EURUSD", "GBPUSD", "USDJPY", "XAUUSD", "NAS100", "US500", "BTCUSD", "ETHUSD"],
        timeframes: ["4h", "1h", "15m"],
        continueOnError: true,
        sourcePreference: "local_only",
        backtest: {
          captureSteps: false,
          executionPolicy: "allowed_only",
        },
      });
      const walkForward = await runTradingWalkForwardStudy({
        instruments: ["EURUSD", "GBPUSD", "USDJPY", "XAUUSD", "NAS100", "US500", "BTCUSD", "ETHUSD"],
        from: "2020-01-01T00:00:00.000Z",
        to: "2025-12-31T23:59:59.000Z",
        timeframes: ["4h", "1h", "15m"],
        sourcePreference: "local_only",
        backtest: {
          captureSteps: false,
          executionPolicy: "allowed_only",
        },
      });

      const aggregateSummary = computeSummaryFromComparativeCollection([yearly]);
      const crisisSummary = computeSummaryFromComparativeCollection([crisis]);
      const walkForwardSummary: MetricSummary = {
        totalTrades: walkForward.aggregate.totalTrades,
        winRate: walkForward.aggregate.winRate,
        averageRiskReward: walkForward.aggregate.averageRiskReward,
        expectancy: walkForward.aggregate.expectancy,
        profitFactor: walkForward.aggregate.profitFactor,
        maxDrawdown: walkForward.aggregate.maxDrawdown,
      };

      const report = {
        generatedAt: new Date().toISOString(),
        baseline: {
          aggregate: baselineAggregate,
          crisis: baselineCrisis,
          walkForward: baselineWalkForwardSummary,
        },
        candidate: {
          aggregate: {
            current: aggregateSummary,
            delta: buildDelta(aggregateSummary, baselineAggregate),
          },
          crisis: {
            current: crisisSummary,
            delta: buildDelta(crisisSummary, baselineCrisis),
          },
          walkForward: {
            current: walkForwardSummary,
            delta: buildDelta(walkForwardSummary, baselineWalkForwardSummary),
          },
          gates: {
            aggregateImproved:
              aggregateSummary.expectancy >= baselineAggregate.expectancy &&
              (aggregateSummary.profitFactor ?? 0) >= (baselineAggregate.profitFactor ?? 0) &&
              aggregateSummary.maxDrawdown <= baselineAggregate.maxDrawdown,
            crisesNotWorse:
              crisisSummary.expectancy >= baselineCrisis.expectancy &&
              (crisisSummary.profitFactor ?? 0) >= (baselineCrisis.profitFactor ?? 0) &&
              crisisSummary.maxDrawdown <= baselineCrisis.maxDrawdown,
            walkForwardNotWorse:
              walkForwardSummary.expectancy >= baselineWalkForwardSummary.expectancy &&
              (walkForwardSummary.profitFactor ?? 0) >= (baselineWalkForwardSummary.profitFactor ?? 0) &&
              walkForwardSummary.maxDrawdown <= baselineWalkForwardSummary.maxDrawdown,
          },
        },
      };

      await mkdir(OUTPUT_DIR, { recursive: true });
      await writeFile(ACTUAL_OUTPUT, JSON.stringify(report, null, 2), "utf8");

      console.log(
        JSON.stringify(
          {
            outputPath: ACTUAL_OUTPUT,
            aggregate: report.candidate.aggregate.current,
            aggregateDelta: report.candidate.aggregate.delta,
            crisis: report.candidate.crisis.current,
            crisisDelta: report.candidate.crisis.delta,
            walkForward: report.candidate.walkForward.current,
            walkForwardDelta: report.candidate.walkForward.delta,
            gates: report.candidate.gates,
          },
          null,
          2,
        ),
      );

      expect(report.candidate.walkForward.current.totalTrades).toBeGreaterThan(0);
    },
  );
});
