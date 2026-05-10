import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  buildTradingSetupSegmentationReport,
  createTradingHistoricalYearPeriods,
  runHistoricalTradingBacktestFunnelAnalysis,
  runTradingHistoricalComparativeSweep,
  type TradingBacktestComparativeReport,
  type TradingBacktestConfig,
  type TradingBacktestFunnelReport,
} from "@/lib/trading/backtest";

type FunnelScenario = {
  key: string;
  description: string;
  backtest: TradingBacktestConfig;
};

type CounterMap = Record<string, number>;

type FunnelAggregateReport = {
  generatedAt: string;
  label: string;
  request: {
    from: string;
    to: string;
    instruments: string[];
  };
  aggregate: {
    counts: {
      setupTypes: CounterMap;
      maturityStates: CounterMap;
      opportunityWindowStates: CounterMap;
      decisionStates: CounterMap;
      executionStatuses: CounterMap;
      behaviorStates: CounterMap;
      signalsGenerated: number;
      tradesOpened: number;
      tradesClosed: number;
    };
    blockers: {
      decision: CounterMap;
      playbook: CounterMap;
      behavior: CounterMap;
    };
    highlights: {
      topDecisionBlockers: Array<{ key: string; count: number }>;
      topPlaybookReasons: Array<{ key: string; count: number }>;
      topBehaviorReasons: Array<{ key: string; count: number }>;
    };
  };
  markets: Array<{
    instrument: string;
    counts: TradingBacktestFunnelReport["counts"];
    highlights: TradingBacktestFunnelReport["highlights"];
  }>;
};

type FunnelStudyScenarioSummary = {
  key: string;
  description: string;
  outputPaths: {
    comparative: string;
    setupSegmentation: string;
    funnel: string;
  };
  summary: TradingBacktestComparativeReport["aggregate"]["summary"];
  tradesByMarket: Record<string, number>;
  topSessions: TradingBacktestComparativeReport["comparisons"]["bySession"];
  accepted: boolean;
  acceptanceChecks: {
    tradesIncreased: boolean;
    profitFactorThreshold: boolean;
    expectancyThreshold: boolean;
  };
};

const OUTPUT_DIR = path.resolve("artifacts/trading-backtests");
const BASELINE_KEY = "live_high_edge_1_0";
const YEARS = createTradingHistoricalYearPeriods({
  startYear: 2020,
  endYear: 2025,
});
const FUNNEL_WINDOW = {
  from: "2024-01-01T00:00:00.000Z",
  to: "2024-12-31T23:59:59.000Z",
};
const SCENARIOS: FunnelScenario[] = [
  {
    key: "maturity_relaxed_small",
    description: "Slightly relax maturity thresholds while preserving the current setup taxonomy.",
    backtest: {
      warmupBars: 24,
      funnelOverrides: {
        maturityThresholds: {
          defaultDeveloping: 0.55,
          defaultReady: 0.9,
          breakoutDeveloping: 0.5,
          breakoutReady: 0.84,
        },
      },
    },
  },
  {
    key: "opening_window_promoted",
    description: "Promote opening windows to active during the study without touching execution targets.",
    backtest: {
      warmupBars: 24,
      funnelOverrides: {
        opportunityWindow: {
          promoteOpeningToActive: true,
        },
      },
    },
  },
  {
    key: "weighted_edge_relaxed",
    description: "Lower the trade-valid weighted edge gate by four points in the study layer only.",
    backtest: {
      warmupBars: 24,
      funnelOverrides: {
        tradeValidEdgeThresholds: {
          defaultTradeValid: 60,
          breakoutTradeValid: 56,
        },
      },
    },
  },
  {
    key: "midday_session_relaxed",
    description: "Remove the midday-lull opportunity degradation to test session gating sensitivity.",
    backtest: {
      warmupBars: 24,
      funnelOverrides: {
        opportunityWindow: {
          ignoreMiddayLullDegrading: true,
        },
      },
    },
  },
];

function bump(map: CounterMap, key: string, amount = 1): void {
  map[key] = (map[key] ?? 0) + amount;
}

function mergeMaps(target: CounterMap, source: CounterMap): void {
  for (const [key, count] of Object.entries(source)) {
    bump(target, key, count);
  }
}

function topEntries(map: CounterMap, limit = 10): Array<{ key: string; count: number }> {
  return Object.entries(map)
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key))
    .slice(0, limit);
}

async function writeJson(outputPath: string, payload: unknown): Promise<string> {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(payload, null, 2), "utf8");

  return outputPath;
}

async function runFunnelAggregate(args: {
  label: string;
  instruments: string[];
  backtest: TradingBacktestConfig;
}): Promise<FunnelAggregateReport> {
  const aggregate: FunnelAggregateReport["aggregate"] = {
    counts: {
      setupTypes: {},
      maturityStates: {},
      opportunityWindowStates: {},
      decisionStates: {},
      executionStatuses: {},
      behaviorStates: {},
      signalsGenerated: 0,
      tradesOpened: 0,
      tradesClosed: 0,
    },
    blockers: {
      decision: {},
      playbook: {},
      behavior: {},
    },
    highlights: {
      topDecisionBlockers: [],
      topPlaybookReasons: [],
      topBehaviorReasons: [],
    },
  };
  const markets: FunnelAggregateReport["markets"] = [];

  for (const instrument of args.instruments) {
    const result = await runHistoricalTradingBacktestFunnelAnalysis({
      request: {
        instrument,
        from: FUNNEL_WINDOW.from,
        to: FUNNEL_WINDOW.to,
        timeframes: ["4h", "1h", "15m"],
        sourcePreference: "local_only",
      },
      backtest: args.backtest,
    });

    mergeMaps(aggregate.counts.setupTypes, result.report.counts.setupTypes);
    mergeMaps(aggregate.counts.maturityStates, result.report.counts.maturityStates);
    mergeMaps(aggregate.counts.opportunityWindowStates, result.report.counts.opportunityWindowStates);
    mergeMaps(aggregate.counts.decisionStates, result.report.counts.decisionStates);
    mergeMaps(aggregate.counts.executionStatuses, result.report.counts.executionStatuses);
    mergeMaps(aggregate.counts.behaviorStates, result.report.counts.behaviorStates);
    aggregate.counts.signalsGenerated += result.report.counts.signalsGenerated;
    aggregate.counts.tradesOpened += result.report.counts.tradesOpened;
    aggregate.counts.tradesClosed += result.report.counts.tradesClosed;

    mergeMaps(aggregate.blockers.decision, result.report.blockers.decision);
    mergeMaps(aggregate.blockers.playbook, result.report.blockers.playbook);
    mergeMaps(aggregate.blockers.behavior, result.report.blockers.behavior);

    markets.push({
      instrument,
      counts: result.report.counts,
      highlights: result.report.highlights,
    });
  }

  aggregate.highlights.topDecisionBlockers = topEntries(aggregate.blockers.decision);
  aggregate.highlights.topPlaybookReasons = topEntries(aggregate.blockers.playbook);
  aggregate.highlights.topBehaviorReasons = topEntries(aggregate.blockers.behavior);

  return {
    generatedAt: new Date().toISOString(),
    label: args.label,
    request: {
      from: FUNNEL_WINDOW.from,
      to: FUNNEL_WINDOW.to,
      instruments: args.instruments,
    },
    aggregate,
    markets,
  };
}

async function runScenario(args: {
  key: string;
  description: string;
  backtest: TradingBacktestConfig;
  baselineTradeCount: number;
}): Promise<FunnelStudyScenarioSummary> {
  console.log(`Running scenario: ${args.key}`);

  const comparative = await runTradingHistoricalComparativeSweep({
    periods: YEARS,
    continueOnError: true,
    sourcePreference: "local_only",
    backtest: args.backtest,
  });
  const setupSegmentation = buildTradingSetupSegmentationReport({
    comparativeReport: comparative,
    minimumSampleCount: 5,
  });
  const funnel = await runFunnelAggregate({
    label: args.key,
    instruments: comparative.request.instruments,
    backtest: args.backtest,
  });

  const comparativePath = path.join(
    OUTPUT_DIR,
    `trading-comparative-sweep-local-2020-2025-yearly-${args.key}.json`,
  );
  const setupPath = path.join(
    OUTPUT_DIR,
    `trading-setup-segmentation-local-2020-2025-yearly-${args.key}.json`,
  );
  const funnelPath = path.join(
    OUTPUT_DIR,
    `trading-funnel-diagnostics-local-2024-${args.key}.json`,
  );

  await writeJson(comparativePath, comparative);
  await writeJson(setupPath, setupSegmentation);
  await writeJson(funnelPath, funnel);

  const tradesIncreased = comparative.aggregate.summary.totalTrades > args.baselineTradeCount;
  const profitFactorThreshold = (comparative.aggregate.summary.profitFactor ?? 0) >= 1.4;
  const expectancyThreshold = comparative.aggregate.summary.expectancy >= 0.17;

  return {
    key: args.key,
    description: args.description,
    outputPaths: {
      comparative: comparativePath,
      setupSegmentation: setupPath,
      funnel: funnelPath,
    },
    summary: comparative.aggregate.summary,
    tradesByMarket: comparative.aggregate.totals.tradesByMarket,
    topSessions: comparative.comparisons.bySession,
    accepted: tradesIncreased && profitFactorThreshold && expectancyThreshold,
    acceptanceChecks: {
      tradesIncreased,
      profitFactorThreshold,
      expectancyThreshold,
    },
  };
}

async function main() {
  console.log(`Running baseline: ${BASELINE_KEY}`);

  const baselineComparative = await runTradingHistoricalComparativeSweep({
    periods: YEARS,
    continueOnError: true,
    sourcePreference: "local_only",
    backtest: {
      warmupBars: 24,
    },
  });
  const baselineSetupSegmentation = buildTradingSetupSegmentationReport({
    comparativeReport: baselineComparative,
    minimumSampleCount: 5,
  });
  const baselineFunnel = await runFunnelAggregate({
    label: BASELINE_KEY,
    instruments: baselineComparative.request.instruments,
    backtest: {
      warmupBars: 24,
    },
  });

  const baselineComparativePath = path.join(
    OUTPUT_DIR,
    `trading-comparative-sweep-local-2020-2025-yearly-${BASELINE_KEY}.json`,
  );
  const baselineSetupPath = path.join(
    OUTPUT_DIR,
    `trading-setup-segmentation-local-2020-2025-yearly-${BASELINE_KEY}.json`,
  );
  const baselineFunnelPath = path.join(
    OUTPUT_DIR,
    `trading-funnel-diagnostics-local-2024-${BASELINE_KEY}.json`,
  );

  await writeJson(baselineComparativePath, baselineComparative);
  await writeJson(baselineSetupPath, baselineSetupSegmentation);
  await writeJson(baselineFunnelPath, baselineFunnel);

  const scenarios: FunnelStudyScenarioSummary[] = [];

  for (const scenario of SCENARIOS) {
    scenarios.push(
      await runScenario({
        key: scenario.key,
        description: scenario.description,
        backtest: scenario.backtest,
        baselineTradeCount: baselineComparative.aggregate.summary.totalTrades,
      }),
    );
  }

  const report = {
    generatedAt: new Date().toISOString(),
    baseline: {
      key: BASELINE_KEY,
      outputPaths: {
        comparative: baselineComparativePath,
        setupSegmentation: baselineSetupPath,
        funnel: baselineFunnelPath,
      },
      summary: baselineComparative.aggregate.summary,
      tradesByMarket: baselineComparative.aggregate.totals.tradesByMarket,
    },
    acceptanceCriteria: {
      tradesMustIncrease: true,
      minimumProfitFactor: 1.4,
      minimumExpectancyR: 0.17,
    },
    scenarios,
    acceptedScenarios: scenarios.filter((scenario) => scenario.accepted).map((scenario) => scenario.key),
  };

  const reportPath = path.join(
    OUTPUT_DIR,
    "trading-funnel-calibration-study-local-2020-2025.json",
  );

  await writeJson(reportPath, report);

  console.log(
    JSON.stringify(
      {
        baseline: baselineComparative.aggregate.summary,
        acceptedScenarios: report.acceptedScenarios,
        outputPath: reportPath,
      },
      null,
      2,
    ),
  );
}

await main();
