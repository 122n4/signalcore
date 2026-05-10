import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { TradingTimeframe } from "@/lib/trading/data";
import {
  buildTradingMarketSessionStudyReport,
  buildTradingSetupSegmentationReport,
  createTradingHistoricalYearPeriods,
  runTradingHistoricalComparativeSweep,
  type TradingBacktestComparativeReport,
  type TradingBacktestMarketSessionRule,
  writeTradingHistoricalComparativeReport,
  writeTradingMarketSessionStudyReport,
  writeTradingSetupSegmentationReport,
} from "@/lib/trading/backtest";

type ScenarioDefinition = {
  id: string;
  description: string;
  rules: TradingBacktestMarketSessionRule[];
};

type ComparativeSummary = TradingBacktestComparativeReport["aggregate"]["summary"];

type ScenarioResult = {
  id: string;
  description: string;
  rules: TradingBacktestMarketSessionRule[];
  summary: ComparativeSummary;
  deltas: {
    totalTrades: number;
    expectancy: number;
    profitFactor: number | null;
    maxDrawdown: number;
    grossProfitPct: number;
    grossLossPct: number;
  };
  artifacts: {
    comparative: string;
    setupSegmentation: string;
    marketSessionStudy: string;
  };
};

type StudyReport = {
  generatedAt: string;
  baseline: {
    label: string;
    summary: ComparativeSummary;
    artifact: string;
  };
  scenarios: ScenarioResult[];
  strongestQualityImprovements: Array<{
    id: string;
    description: string;
    expectancyDelta: number;
    profitFactorDelta: number | null;
    drawdownDelta: number;
    tradeDelta: number;
  }>;
};

const BASELINE_LABEL = "live_high_edge_1_0";
const BASELINE_ARTIFACT = path.resolve(
  "artifacts/trading-backtests/trading-comparative-sweep-local-2020-2025-yearly-live_high_edge_1_0.json",
);
const OUTPUT_DIR = path.resolve("artifacts/trading-backtests");
const PERIODS = createTradingHistoricalYearPeriods({
  startYear: 2020,
  endYear: 2025,
});

const SCENARIOS: ScenarioDefinition[] = [
  {
    id: "nas100_pre_market_blocked",
    description: "Block NAS100 pre-market where expectancy is deeply negative.",
    rules: [
      {
        instrument: "NAS100",
        sessions: ["pre_market"],
        reason: "Backtest calibration blocked NAS100 pre-market.",
      },
    ],
  },
  {
    id: "us500_london_ny_overlap_blocked",
    description: "Block US500 during London/NY overlap where current edge is negative.",
    rules: [
      {
        instrument: "US500",
        sessions: ["london_ny_overlap"],
        reason: "Backtest calibration blocked US500 during London/NY overlap.",
      },
    ],
  },
  {
    id: "eurusd_london_session_blocked",
    description: "Block EURUSD London session where the aggregate block is currently losing.",
    rules: [
      {
        instrument: "EURUSD",
        sessions: ["london_session"],
        reason: "Backtest calibration blocked EURUSD during London session.",
      },
    ],
  },
  {
    id: "usdjpy_london_open_blocked",
    description: "Block USDJPY London open where expectancy is negative.",
    rules: [
      {
        instrument: "USDJPY",
        sessions: ["london_open"],
        reason: "Backtest calibration blocked USDJPY during London open.",
      },
    ],
  },
  {
    id: "late_us_blocked_global",
    description: "Block late US globally to test whether the weakest aggregate session should be suppressed.",
    rules: [
      {
        sessions: ["late_us"],
        reason: "Backtest calibration blocked late US globally.",
      },
    ],
  },
  {
    id: "stacked_weak_blocks_blocked",
    description: "Block the four weakest market/session blocks together without touching the rest.",
    rules: [
      {
        instrument: "NAS100",
        sessions: ["pre_market"],
        reason: "Backtest calibration blocked NAS100 pre-market.",
      },
      {
        instrument: "US500",
        sessions: ["london_ny_overlap"],
        reason: "Backtest calibration blocked US500 during London/NY overlap.",
      },
      {
        instrument: "EURUSD",
        sessions: ["london_session"],
        reason: "Backtest calibration blocked EURUSD during London session.",
      },
      {
        instrument: "USDJPY",
        sessions: ["london_open"],
        reason: "Backtest calibration blocked USDJPY during London open.",
      },
    ],
  },
];

function roundMetric(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

async function main() {
  const rawBaseline = await readFile(BASELINE_ARTIFACT, "utf8");
  const baseline = JSON.parse(rawBaseline) as TradingBacktestComparativeReport;
  const requestedScenarioIds = new Set(
    process.argv
      .slice(2)
      .map((argument) => argument.trim())
      .filter((argument) => argument.length > 0),
  );
  const scenariosToRun =
    requestedScenarioIds.size > 0
      ? SCENARIOS.filter((scenario) => requestedScenarioIds.has(scenario.id))
      : SCENARIOS;

  if (requestedScenarioIds.size > 0 && scenariosToRun.length === 0) {
    throw new Error(`No market/session calibration scenarios matched: ${Array.from(requestedScenarioIds).join(", ")}`);
  }

  const scenarioResults: ScenarioResult[] = [];

  for (const scenario of scenariosToRun) {
    const comparative = await runTradingHistoricalComparativeSweep({
      periods: PERIODS,
      instruments: baseline.request.instruments,
      timeframes: baseline.request.timeframes as TradingTimeframe[],
      continueOnError: true,
      sourcePreference: "local_only",
      backtest: {
        marketSessionOverrides: {
          blockedTradeValidContexts: scenario.rules,
        },
      },
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

    const comparativePath = path.resolve(
      OUTPUT_DIR,
      `trading-comparative-sweep-local-2020-2025-yearly-${scenario.id}.json`,
    );
    const setupPath = path.resolve(
      OUTPUT_DIR,
      `trading-setup-segmentation-local-2020-2025-yearly-${scenario.id}.json`,
    );
    const marketSessionPath = path.resolve(
      OUTPUT_DIR,
      `trading-market-session-study-local-2020-2025-${scenario.id}.json`,
    );

    await writeTradingHistoricalComparativeReport({
      report: comparative,
      outputPath: comparativePath,
    });
    await writeTradingSetupSegmentationReport({
      report: setupSegmentation,
      outputPath: setupPath,
    });
    await writeTradingMarketSessionStudyReport({
      report: marketSessionStudy,
      outputPath: marketSessionPath,
    });

    scenarioResults.push({
      id: scenario.id,
      description: scenario.description,
      rules: scenario.rules,
      summary: comparative.aggregate.summary,
      deltas: {
        totalTrades: comparative.aggregate.summary.totalTrades - baseline.aggregate.summary.totalTrades,
        expectancy: roundMetric(
          comparative.aggregate.summary.expectancy - baseline.aggregate.summary.expectancy,
        ),
        profitFactor:
          comparative.aggregate.summary.profitFactor == null ||
          baseline.aggregate.summary.profitFactor == null
            ? null
            : roundMetric(
                comparative.aggregate.summary.profitFactor -
                  baseline.aggregate.summary.profitFactor,
              ),
        maxDrawdown: roundMetric(
          comparative.aggregate.summary.maxDrawdown - baseline.aggregate.summary.maxDrawdown,
        ),
        grossProfitPct: roundMetric(
          comparative.aggregate.summary.grossProfitPct - baseline.aggregate.summary.grossProfitPct,
        ),
        grossLossPct: roundMetric(
          comparative.aggregate.summary.grossLossPct - baseline.aggregate.summary.grossLossPct,
        ),
      },
      artifacts: {
        comparative: comparativePath,
        setupSegmentation: setupPath,
        marketSessionStudy: marketSessionPath,
      },
    });
  }

  const report: StudyReport = {
    generatedAt: new Date().toISOString(),
    baseline: {
      label: BASELINE_LABEL,
      summary: baseline.aggregate.summary,
      artifact: BASELINE_ARTIFACT,
    },
    scenarios: scenarioResults,
    strongestQualityImprovements: [...scenarioResults]
      .sort((left, right) => {
        if (right.deltas.expectancy !== left.deltas.expectancy) {
          return right.deltas.expectancy - left.deltas.expectancy;
        }

        const rightPf = right.deltas.profitFactor ?? Number.NEGATIVE_INFINITY;
        const leftPf = left.deltas.profitFactor ?? Number.NEGATIVE_INFINITY;
        if (rightPf !== leftPf) {
          return rightPf - leftPf;
        }

        return left.deltas.maxDrawdown - right.deltas.maxDrawdown;
      })
      .map((scenario) => ({
        id: scenario.id,
        description: scenario.description,
        expectancyDelta: scenario.deltas.expectancy,
        profitFactorDelta: scenario.deltas.profitFactor,
        drawdownDelta: scenario.deltas.maxDrawdown,
        tradeDelta: scenario.deltas.totalTrades,
      })),
  };

  const reportPath = path.resolve(
    OUTPUT_DIR,
    "trading-market-session-calibration-study-local-2020-2025-live_high_edge_1_0.json",
  );

  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");

  console.log(
    JSON.stringify(
      {
        reportPath,
        scenariosRun: scenariosToRun.map((scenario) => scenario.id),
        strongestQualityImprovements: report.strongestQualityImprovements.slice(0, 5),
      },
      null,
      2,
    ),
  );
}

await main();
