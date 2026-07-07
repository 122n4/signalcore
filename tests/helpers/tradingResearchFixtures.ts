import os from "node:os";
import path from "node:path";
import { mkdtemp } from "node:fs/promises";

import type {
  ResearchCampaignLibrary,
  ResearchCandidateLibrary,
  ResearchConfig,
  ResearchMetricSummary,
  ResearchQueue,
  ResearchTask,
} from "@/lib/trading/research";
import { writeJsonAtomic } from "@/lib/trading/research";

export async function createResearchTempDir(prefix = "trading-research-"): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

export function createMetricSummary(
  overrides: Partial<ResearchMetricSummary> = {},
): ResearchMetricSummary {
  return {
    totalTrades: 20,
    winRate: 45,
    averageRiskReward: 2.1,
    expectancy: 0.2,
    profitFactor: 1.5,
    maxDrawdown: 4,
    ...overrides,
  };
}

function createBaselineComparativeReport(args: {
  instruments: string[];
  summary: ResearchMetricSummary;
}) {
  return {
    generatedAt: "2026-03-19T00:00:00.000Z",
    request: {
      periods: [
        {
          label: "baseline",
          from: "2020-01-01T00:00:00.000Z",
          to: "2025-12-31T23:59:59.000Z",
        },
      ],
      instruments: args.instruments,
      timeframes: ["4h", "1h", "15m"],
    },
    periods: [
      {
        period: {
          label: "baseline",
          from: "2020-01-01T00:00:00.000Z",
          to: "2025-12-31T23:59:59.000Z",
        },
        report: {
          request: {
            instruments: args.instruments,
            timeframes: ["4h", "1h", "15m"],
            from: "2020-01-01T00:00:00.000Z",
            to: "2025-12-31T23:59:59.000Z",
          },
          markets: args.instruments.map((instrument) => ({
            instrument,
            historical: {
              dataSymbol: instrument,
              dataSymbolRelation: "direct",
            },
            report: {
              period: {
                evaluatedBars: 0,
              },
              trades: [],
              summary: args.summary,
            },
          })),
          aggregate: {
            summary: args.summary,
            totals: {
              evaluatedBars: 0,
              tradesByMarket: Object.fromEntries(
                args.instruments.map((instrument) => [instrument, 0]),
              ),
            },
            distributions: {
              bySetup: {},
              bySession: {},
            },
            insights: {
              strongestSetup: null,
              weakestSetup: null,
              strongestSession: null,
              weakestSession: null,
              strongestMarket: null,
              weakestMarket: null,
            },
          },
          failures: [],
        },
      },
    ],
    aggregate: {
      summary: args.summary,
      totals: {
        totalTrades: 0,
        evaluatedBars: 0,
        tradesByMarket: Object.fromEntries(args.instruments.map((instrument) => [instrument, 0])),
      },
      insights: {
        strongestSetup: null,
        weakestSetup: null,
        strongestSession: null,
        weakestSession: null,
        strongestMarket: null,
        weakestMarket: null,
      },
    },
    comparisons: {
      byPeriod: {},
      byMarket: {},
      bySetup: {},
      bySession: {},
    },
  };
}

export async function createResearchConfig(rootDir: string): Promise<ResearchConfig> {
  const baselineAggregatePath = path.join(rootDir, "source-aggregate.json");
  const baselineCrisisPath = path.join(rootDir, "source-crisis.json");
  const engineFilePath = path.join(rootDir, "engine-source.ts");
  const candidateLibraryPath = path.join(rootDir, "candidate-library.json");
  const candidateReserveLibraryPath = path.join(rootDir, "candidate-library-reserve.json");
  const campaignLibraryPath = path.join(rootDir, "campaigns.json");
  const coverageAuditPath = path.join(rootDir, "coverage-audit.json");

  const baselineInstruments = ["NAS100", "US500", "EURUSD", "USDJPY", "XAUUSD", "GBPUSD"];

  await writeJsonAtomic(baselineAggregatePath, {
    ...createBaselineComparativeReport({
      instruments: baselineInstruments,
      summary: createMetricSummary(),
    }),
  });
  await writeJsonAtomic(baselineCrisisPath, {
    ...createBaselineComparativeReport({
      instruments: baselineInstruments,
      summary: createMetricSummary({
        expectancy: -0.05,
        profitFactor: 0.98,
        maxDrawdown: 5,
      }),
    }),
  });
  await writeJsonAtomic(engineFilePath, { sentinel: true });
  await writeJsonAtomic(candidateLibraryPath, {
    version: 1,
    families: [],
  } satisfies ResearchCandidateLibrary);
  await writeJsonAtomic(candidateReserveLibraryPath, {
    version: 1,
    families: [],
  } satisfies ResearchCandidateLibrary);
  await writeJsonAtomic(campaignLibraryPath, {
    version: 1,
    campaigns: [
      {
        id: "increase_expectancy",
        enabled: true,
        objective: "increase_expectancy",
        priority: 100,
      },
      {
        id: "improve_crisis",
        enabled: true,
        objective: "improve_crisis",
        priority: 95,
      },
      {
        id: "reduce_drawdown",
        enabled: true,
        objective: "reduce_drawdown",
        priority: 90,
      },
    ],
  } satisfies ResearchCampaignLibrary);
  await writeJsonAtomic(coverageAuditPath, {
    generatedAt: "2026-03-15T00:00:00.000Z",
    request: {
      instruments: ["NAS100", "US500", "EURUSD", "USDJPY", "XAUUSD", "GBPUSD"],
      periods: [],
      timeframes: ["4h", "1h", "15m"],
      sourcePreference: "local_only",
    },
    entries: [],
    summary: {
      byInstrument: {
        NAS100: { validPeriods: 1, invalidPeriods: 0, failedPeriods: 0, sources: ["local_archive"] },
        US500: { validPeriods: 1, invalidPeriods: 0, failedPeriods: 0, sources: ["local_archive"] },
        EURUSD: { validPeriods: 1, invalidPeriods: 0, failedPeriods: 0, sources: ["local_archive"] },
        USDJPY: { validPeriods: 1, invalidPeriods: 0, failedPeriods: 0, sources: ["local_archive"] },
        XAUUSD: { validPeriods: 1, invalidPeriods: 0, failedPeriods: 0, sources: ["local_archive"] },
        GBPUSD: { validPeriods: 1, invalidPeriods: 0, failedPeriods: 0, sources: ["local_archive"] },
      },
      byPeriod: {},
      failures: [],
    },
  });

  return {
    version: 1,
    queueId: "test-research-queue",
    paths: {
      rootDir,
      queueDir: path.join(rootDir, "queue"),
      queuePath: path.join(rootDir, "queue", "research-queue.json"),
      lockPath: path.join(rootDir, "queue", "research-lock.json"),
      candidateLibraryPath,
      candidateReserveLibraryPath,
      campaignLibraryPath,
      coverageAuditPath,
      baselinesDir: path.join(rootDir, "baselines"),
      runsDir: path.join(rootDir, "runs"),
      reportsDir: path.join(rootDir, "reports"),
      decisionsPath: path.join(rootDir, "decisions", "research-decisions.jsonl"),
      runIndexDir: path.join(rootDir, "index", "by-run-id"),
      fingerprintIndexDir: path.join(rootDir, "index", "by-fingerprint"),
    },
    timing: {
      heartbeatIntervalMs: 1000,
      staleLockMs: 1000,
      hungLockMs: 2000,
    },
    automation: {
      pollIntervalMs: 10,
      idleIntervalMs: 20,
      errorBackoffMs: 30,
      reportIntervalMs: 100,
      templateCooldown: {
        enabled: true,
        maxRecentRejects: 2,
        decisionWindowSize: 6,
      },
      campaignQuota: {
        enabled: true,
        maxSelectionsPerWindow: 2,
        decisionWindowSize: 4,
      },
      familyQuota: {
        enabled: true,
        maxSelectionsPerWindow: 3,
        decisionWindowSize: 6,
      },
    },
    liveBaselineSource: {
      baselineId: "baseline-test-live",
      datasetProfile: "core_20y",
      validationProfile: "default_live_safe",
      aggregateComparativePath: baselineAggregatePath,
      crisisComparativePath: baselineCrisisPath,
      walkforwardBaselinePath: null,
      engineManifestFiles: [engineFilePath],
    },
    validationProfiles: {
      default_live_safe: {
        id: "default_live_safe",
        thresholds: {
          epsilon: 0.0001,
          aggregateExpectancyMinDelta: 0.005,
          aggregateProfitFactorMinDelta: 0.01,
          crisisExpectancyMinDelta: 0.005,
          crisisProfitFactorMinDelta: 0.01,
          maxDrawdownMinImprovement: 0.1,
          requireWalkForwardBreakEven: true,
          requireHoldoutBreakEven: true,
          requireFinalHoldoutBreakEven: true,
          requirePerturbationBreakEven: true,
          requireMonteCarloBreakEven: true,
          requireCostStressBreakEven: true,
        },
      },
      elite_push: {
        id: "elite_push",
        thresholds: {
          epsilon: 0.0001,
          aggregateExpectancyMinDelta: 0.01,
          aggregateProfitFactorMinDelta: 0.015,
          crisisExpectancyMinDelta: 0.01,
          crisisProfitFactorMinDelta: 0.015,
          maxDrawdownMinImprovement: 0.15,
          requireWalkForwardBreakEven: true,
          requireHoldoutBreakEven: true,
          requireFinalHoldoutBreakEven: true,
          requirePerturbationBreakEven: true,
          requireMonteCarloBreakEven: true,
          requireCostStressBreakEven: true,
        },
      },
      frequency_annual_180_500_live_safe: {
        id: "frequency_annual_180_500_live_safe",
        thresholds: {
          epsilon: 0.0001,
          aggregateExpectancyMinDelta: 0.005,
          aggregateProfitFactorMinDelta: 0.01,
          crisisExpectancyMinDelta: 0.005,
          crisisProfitFactorMinDelta: 0.01,
          maxDrawdownMinImprovement: 0.1,
          requireWalkForwardBreakEven: true,
          minAggregateTrades: 220,
          maxAggregateTrades: 3200,
          minAnnualizedTrades: 180,
          maxAnnualizedTrades: 500,
          minAggregateTradeRetentionPct: 0.9,
          requireCrisisImprovementForPromotion: true,
          requireHoldoutBreakEven: true,
          requireFinalHoldoutBreakEven: true,
          requirePerturbationBreakEven: true,
          requireMonteCarloBreakEven: true,
          requireCostStressBreakEven: true,
        },
      },
    },
    study: {
      yearlyPeriods: [],
      crisisPeriods: [],
      instruments: ["NAS100"],
      timeframes: ["4h", "1h", "15m"],
      sourcePreference: "local_only",
      walkForward: {
        from: "2020-01-01T00:00:00.000Z",
        to: "2025-12-31T23:59:59.000Z",
      },
      robustness: {
        holdout: {
          enabled: true,
          from: "2024-01-01T00:00:00.000Z",
          to: "2025-12-31T23:59:59.000Z",
        },
        finalHoldout: {
          enabled: true,
          from: "2021-01-01T00:00:00.000Z",
          to: "2023-12-31T23:59:59.000Z",
          windowing: {
            trainFraction: 0.7,
            testFraction: 0.2,
            minTrainBars: 220,
            minTestBars: 80,
          },
        },
        perturbation: {
          enabled: true,
          windowing: {
            trainFraction: 0.7,
            testFraction: 0.15,
            minTrainBars: 220,
            minTestBars: 70,
          },
        },
        monteCarlo: {
          enabled: true,
          iterations: 16,
          percentile: 0.15,
          seed: 1337,
        },
        costStress: {
          enabled: true,
          roundTripCostR: 0.08,
        },
        portfolioStress: {
          enabled: true,
          maxConcurrentTrades: 3,
          maxOverlapRatio: 0.6,
          maxDrawdownTolerance: 0.35,
        },
      },
    },
  };
}

export function createResearchTask(
  overrides: Partial<ResearchTask> = {},
): ResearchTask {
  return {
    id: "task-001",
    type: "risk_shaping",
    status: "pending",
    priority: 100,
    created_at: "2026-03-19T10:00:00.000Z",
    started_at: null,
    finished_at: null,
    attempt: 0,
    max_attempts: 2,
    retryable: true,
    baseline_id: "baseline-test-live",
    dataset_profile: "core_20y",
    validation_profile: "default_live_safe",
    depends_on: [],
    candidate_scope: {
      instruments: ["NAS100"],
      sessions: ["london_ny_overlap"],
      setup_types: ["breakout_continuation"],
    },
    candidate_mutation: {
      kind: "risk_multiplier",
      value: 0.67,
    },
    engine_scope: {
      allowed_files: ["lib/trading/backtest/**"],
      live_mutation_allowed: false,
    },
    run_fingerprint: null,
    last_run_id: null,
    decision: null,
    decision_reason: null,
    error: null,
    notes: "test task",
    planner_source: null,
    ...overrides,
  };
}

export function createResearchQueue(tasks: ResearchTask[]): ResearchQueue {
  return {
    version: 1,
    queue_id: "test-research-queue",
    updated_at: "2026-03-19T10:00:00.000Z",
    live_baseline_id: "baseline-test-live",
    active_run_id: null,
    idle_reason: null,
    tasks,
  };
}

export async function writeResearchCandidateLibrary(
  config: ResearchConfig,
  library: ResearchCandidateLibrary,
): Promise<void> {
  await writeJsonAtomic(config.paths.candidateLibraryPath, library);
}

export async function writeResearchCandidateReserveLibrary(
  config: ResearchConfig,
  library: ResearchCandidateLibrary,
): Promise<void> {
  if (!config.paths.candidateReserveLibraryPath) {
    throw new Error("Research config is missing candidateReserveLibraryPath.");
  }
  await writeJsonAtomic(config.paths.candidateReserveLibraryPath, library);
}

export async function writeResearchCampaignLibrary(
  config: ResearchConfig,
  library: ResearchCampaignLibrary,
): Promise<void> {
  if (!config.paths.campaignLibraryPath) {
    throw new Error("Research config is missing campaignLibraryPath.");
  }
  await writeJsonAtomic(config.paths.campaignLibraryPath, library);
}

export async function writeResearchCoverageAudit(
  config: ResearchConfig,
  report: unknown,
): Promise<void> {
  if (!config.paths.coverageAuditPath) {
    throw new Error("Research config is missing coverageAuditPath.");
  }
  await writeJsonAtomic(config.paths.coverageAuditPath, report);
}
