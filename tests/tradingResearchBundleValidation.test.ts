import { describe, expect, it } from "vitest";

import {
  buildResearchBundleValidationReport,
  buildResearchPromotionBundleCandidates,
  refreshResearchBundleValidationReportIfNeeded,
  writeJsonAtomic,
} from "@/lib/trading/research";
import type { TradingBacktestTrade } from "@/lib/trading/backtest/types";

import {
  createMetricSummary,
  createResearchConfig,
  createResearchQueue,
  createResearchTask,
  createResearchTempDir,
} from "./helpers/tradingResearchFixtures";

function createTrade(id: string, instrument: string, pnlR: number, closedAt: string): TradingBacktestTrade {
  return {
    id,
    instrument,
    setupType: "breakout_continuation",
    session: instrument === "US500" ? "pre_market" : "ny_open",
    direction: "long",
    signalAt: closedAt,
    openedAt: closedAt,
    closedAt,
    entryPrice: 100,
    exitPrice: 100 + pnlR,
    triggerType: "close_confirm",
    triggerLevel: 100,
    invalidationLevel: 99,
    targetZone: null,
    riskPct: 1,
    riskRewardEstimate: pnlR > 0 ? 2 : 1,
    exitReason: pnlR > 0 ? "target_hit" : "invalidation_hit",
    outcome: pnlR > 0 ? "win" : "loss",
    pnlR,
    pnlPct: pnlR,
    barsHeld: 3,
  };
}

function createComparativeReport(args: {
  instruments: string[];
  tradesByInstrument: Record<string, TradingBacktestTrade[]>;
  summary?: ReturnType<typeof createMetricSummary>;
}) {
  return {
    generatedAt: "2026-03-21T00:00:00.000Z",
    request: {
      periods: [
        {
          label: "2025",
          from: "2025-01-01T00:00:00.000Z",
          to: "2025-12-31T23:59:59.000Z",
        },
      ],
      instruments: args.instruments,
      timeframes: ["4h", "1h", "15m"],
    },
    periods: [
      {
        period: {
          label: "2025",
          from: "2025-01-01T00:00:00.000Z",
          to: "2025-12-31T23:59:59.000Z",
        },
        report: {
          request: {
            instruments: args.instruments,
            timeframes: ["4h", "1h", "15m"],
            from: "2025-01-01T00:00:00.000Z",
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
                evaluatedBars: 500,
              },
              trades: args.tradesByInstrument[instrument] ?? [],
              summary: args.summary ?? createMetricSummary(),
            },
          })),
          aggregate: {
            summary: args.summary ?? createMetricSummary(),
            totals: {
              evaluatedBars: args.instruments.length * 500,
              tradesByMarket: Object.fromEntries(
                args.instruments.map((instrument) => [
                  instrument,
                  (args.tradesByInstrument[instrument] ?? []).length,
                ]),
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
      summary: args.summary ?? createMetricSummary(),
      totals: {
        totalTrades: Object.values(args.tradesByInstrument).flat().length,
        evaluatedBars: args.instruments.length * 500,
        tradesByMarket: Object.fromEntries(
          args.instruments.map((instrument) => [
            instrument,
            (args.tradesByInstrument[instrument] ?? []).length,
          ]),
        ),
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
  } as any;
}

describe("trading research bundle validation", () => {
  it("builds only compatible non-overlapping bundle candidates", () => {
    const promoteA = createResearchTask({
      id: "promote-a",
      status: "completed",
      decision: "promote",
      planner_source: {
        campaign_id: "increase_expectancy",
        campaign_objective: "increase_expectancy",
        family_id: "risk-family",
        template_id: "promote-a-template",
        auto_enqueued: true,
      },
      candidate_scope: {
        instruments: ["NAS100"],
        sessions: ["ny_open"],
        setup_types: ["breakout_continuation"],
      },
    });
    const promoteB = createResearchTask({
      id: "promote-b",
      status: "completed",
      decision: "promote",
      planner_source: {
        campaign_id: "reduce_drawdown",
        campaign_objective: "reduce_drawdown",
        family_id: "context-family",
        template_id: "promote-b-template",
        auto_enqueued: true,
      },
      candidate_scope: {
        instruments: ["US500"],
        sessions: ["pre_market"],
        setup_types: ["breakout_continuation"],
      },
      candidate_mutation: {
        kind: "blocked_context",
      },
      type: "context_filter",
    });
    const promoteC = createResearchTask({
      id: "promote-c",
      status: "completed",
      decision: "promote",
      candidate_scope: {},
      candidate_mutation: {
        kind: "risk_multiplier",
        value: 0.5,
      },
    });

    const bundles = buildResearchPromotionBundleCandidates([promoteA, promoteB, promoteC]);

    expect(bundles).toHaveLength(1);
    expect(bundles[0]?.task_ids).toEqual(["promote-a", "promote-b"]);
    expect(bundles[0]?.campaign_mode).toBe("mixed");
    expect(bundles[0]?.campaign_ids).toEqual(["increase_expectancy", "reduce_drawdown"]);
  });

  it("ignores superseded promotes when a newer task for the same template was rejected", () => {
    const oldPromote = createResearchTask({
      id: "promote-old",
      status: "completed",
      decision: "promote",
      created_at: "2026-03-21T10:00:00.000Z",
      planner_source: {
        campaign_id: "increase_expectancy",
        campaign_objective: "increase_expectancy",
        family_id: "risk-family",
        template_id: "shared-template",
        auto_enqueued: true,
      },
      candidate_scope: {
        instruments: ["NAS100"],
        sessions: ["ny_open"],
        setup_types: ["breakout_continuation"],
      },
    });
    const newerReject = createResearchTask({
      id: "reject-new",
      status: "completed",
      decision: "reject",
      created_at: "2026-03-21T12:00:00.000Z",
      planner_source: {
        campaign_id: "increase_expectancy",
        campaign_objective: "increase_expectancy",
        family_id: "risk-family",
        template_id: "shared-template",
        auto_enqueued: true,
      },
      candidate_scope: {
        instruments: ["NAS100"],
        sessions: ["ny_open"],
        setup_types: ["breakout_continuation"],
      },
    });
    const otherPromote = createResearchTask({
      id: "promote-other",
      status: "completed",
      decision: "promote",
      planner_source: {
        campaign_id: "reduce_drawdown",
        campaign_objective: "reduce_drawdown",
        family_id: "context-family",
        template_id: "other-template",
        auto_enqueued: true,
      },
      candidate_scope: {
        instruments: ["US500"],
        sessions: ["pre_market"],
        setup_types: ["breakout_continuation"],
      },
      candidate_mutation: {
        kind: "blocked_context",
      },
      type: "context_filter",
    });

    const bundles = buildResearchPromotionBundleCandidates([
      oldPromote,
      newerReject,
      otherPromote,
    ]);

    expect(bundles).toHaveLength(0);
  });

  it("validates bundle candidates with shared ranking and decision output", async () => {
    const rootDir = await createResearchTempDir();
    const config = await createResearchConfig(rootDir);
    config.study.robustness = {
      holdout: { enabled: false, from: "", to: "" },
      perturbation: { enabled: false },
      monteCarlo: { enabled: false, iterations: 0, percentile: 0.15, seed: 1337 },
      portfolioStress: {
        enabled: true,
        maxConcurrentTrades: 3,
        maxOverlapRatio: 0.6,
        maxDrawdownTolerance: 0.35,
      },
    };
    const promoteA = createResearchTask({
      id: "promote-a",
      status: "completed",
      decision: "promote",
      planner_source: {
        campaign_id: "increase_expectancy",
        campaign_objective: "increase_expectancy",
        family_id: "risk-family",
        template_id: "promote-a-template",
        auto_enqueued: true,
      },
      candidate_scope: {
        instruments: ["NAS100"],
        sessions: ["ny_open"],
        setup_types: ["breakout_continuation"],
      },
      run_fingerprint: "fp-a",
    });
    const promoteB = createResearchTask({
      id: "promote-b",
      status: "completed",
      decision: "promote",
      type: "context_filter",
      planner_source: {
        campaign_id: "increase_expectancy",
        campaign_objective: "increase_expectancy",
        family_id: "context-family",
        template_id: "promote-b-template",
        auto_enqueued: true,
      },
      candidate_scope: {
        instruments: ["US500"],
        sessions: ["pre_market"],
        setup_types: ["breakout_continuation"],
      },
      candidate_mutation: {
        kind: "blocked_context",
      },
      run_fingerprint: "fp-b",
    });
    await writeJsonAtomic(config.paths.queuePath, createResearchQueue([promoteA, promoteB]));

    await writeJsonAtomic(
      config.liveBaselineSource.aggregateComparativePath,
      createComparativeReport({
        instruments: ["NAS100", "US500"],
        tradesByInstrument: {
          NAS100: [
            createTrade("b1", "NAS100", 1.2, "2025-01-01T00:00:00.000Z"),
            createTrade("b2", "NAS100", -1, "2025-01-02T00:00:00.000Z"),
          ],
          US500: [
            createTrade("b3", "US500", 1, "2025-01-03T00:00:00.000Z"),
            createTrade("b4", "US500", -1, "2025-01-04T00:00:00.000Z"),
          ],
        },
        summary: createMetricSummary({ expectancy: 0.2, profitFactor: 1.5, maxDrawdown: 4 }),
      }),
    );
    await writeJsonAtomic(
      config.liveBaselineSource.crisisComparativePath,
      createComparativeReport({
        instruments: ["NAS100", "US500"],
        tradesByInstrument: {
          NAS100: [createTrade("c1", "NAS100", -1, "2025-02-01T00:00:00.000Z")],
          US500: [createTrade("c2", "US500", 0.4, "2025-02-02T00:00:00.000Z")],
        },
        summary: createMetricSummary({ expectancy: -0.05, profitFactor: 0.98, maxDrawdown: 5 }),
      }),
    );

    const report = await buildResearchBundleValidationReport({
      config,
      deps: {
        now: () => new Date("2026-03-21T14:00:00.000Z"),
        runComparative: async (request) =>
          createComparativeReport({
            instruments: request.instruments ?? ["NAS100", "US500"],
            tradesByInstrument: {
              NAS100: [
                createTrade("s1", "NAS100", 1.8, "2025-01-01T00:00:00.000Z"),
                createTrade("s2", "NAS100", -0.7, "2025-01-02T00:00:00.000Z"),
              ],
              US500: [
                createTrade("s3", "US500", 1.6, "2025-01-03T00:00:00.000Z"),
                createTrade("s4", "US500", -0.5, "2025-01-04T00:00:00.000Z"),
              ],
            },
            summary: createMetricSummary({ expectancy: 0.28, profitFactor: 1.75, maxDrawdown: 3.1 }),
          }) as any,
        runWalkForward: async (request) =>
          ({
            generatedAt: "2026-03-21T14:00:00.000Z",
            request: {
              instruments: request.instruments ?? ["NAS100", "US500"],
              from: request.from,
              to: request.to,
              timeframes: ["4h", "1h", "15m"],
              windowing: {
                trainFraction: 0.7,
                testFraction: 0.2,
                minTrainBars: 300,
                minTestBars: 100,
                primaryTimeframe: null,
              },
            },
            instruments: [],
            failures: [],
            aggregate: request.backtest
              ? createMetricSummary({ expectancy: 0.12, profitFactor: 1.18, maxDrawdown: 2.1 })
              : createMetricSummary({ expectancy: 0.06, profitFactor: 1.03, maxDrawdown: 2.4 }),
        }) as any,
      },
    });

    expect(report.schema_version).toBe("research.bundle-validation-report.v1");
    expect(report.provenance.live_baseline_id).toBe(config.liveBaselineSource.baselineId);
    expect(report.candidate_count).toBe(1);
    expect(report.candidates[0]?.primary_campaign_id).toBe("increase_expectancy");
    expect(report.results[0]?.decision.ranking?.score).toBeGreaterThan(0);
    expect(report.results[0]?.decision.decision).not.toBe("reject");
    expect(report.results[0]?.campaign_mode).toBe("single");
    expect(report.results[0]?.primary_campaign_objective).toBe("increase_expectancy");
    expect(report.results[0]?.portfolio_stress?.passes).toBe(true);
    expect(report.keepable_bundles).toHaveLength(1);
    expect(report.keepable_bundles[0]?.primary_campaign_id).toBe("increase_expectancy");
    expect(report.keepable_bundles[0]?.portfolio_stress_passed).toBe(true);
    expect(report.campaign_performance[0]?.campaign_id).toBe("increase_expectancy");
  });

  it("refreshes bundle validation only when candidate bundles changed", async () => {
    const rootDir = await createResearchTempDir();
    const config = await createResearchConfig(rootDir);
    config.study.robustness = {
      holdout: { enabled: false, from: "", to: "" },
      perturbation: { enabled: false },
      monteCarlo: { enabled: false, iterations: 0, percentile: 0.15, seed: 1337 },
      portfolioStress: {
        enabled: true,
        maxConcurrentTrades: 3,
        maxOverlapRatio: 0.6,
        maxDrawdownTolerance: 0.35,
      },
    };

    const promoteA = createResearchTask({
      id: "promote-a",
      status: "completed",
      decision: "promote",
      run_fingerprint: "fp-a",
      planner_source: {
        campaign_id: "increase_expectancy",
        campaign_objective: "increase_expectancy",
        family_id: "risk-family",
        template_id: "promote-a-template",
        auto_enqueued: true,
      },
      candidate_scope: {
        instruments: ["NAS100"],
        sessions: ["ny_open"],
        setup_types: ["breakout_continuation"],
      },
    });
    const promoteB = createResearchTask({
      id: "promote-b",
      status: "completed",
      decision: "promote",
      type: "context_filter",
      run_fingerprint: "fp-b",
      planner_source: {
        campaign_id: "increase_expectancy",
        campaign_objective: "increase_expectancy",
        family_id: "context-family",
        template_id: "promote-b-template",
        auto_enqueued: true,
      },
      candidate_scope: {
        instruments: ["US500"],
        sessions: ["pre_market"],
        setup_types: ["breakout_continuation"],
      },
      candidate_mutation: {
        kind: "blocked_context",
      },
    });
    await writeJsonAtomic(config.paths.queuePath, createResearchQueue([promoteA, promoteB]));

    await writeJsonAtomic(
      config.liveBaselineSource.aggregateComparativePath,
      createComparativeReport({
        instruments: ["NAS100", "US500"],
        tradesByInstrument: {
          NAS100: [createTrade("a1", "NAS100", 1.2, "2025-01-01T00:00:00.000Z")],
          US500: [createTrade("a2", "US500", 1.1, "2025-01-02T00:00:00.000Z")],
        },
        summary: createMetricSummary({ expectancy: 0.2, profitFactor: 1.5, maxDrawdown: 4 }),
      }),
    );
    await writeJsonAtomic(
      config.liveBaselineSource.crisisComparativePath,
      createComparativeReport({
        instruments: ["NAS100", "US500"],
        tradesByInstrument: {
          NAS100: [createTrade("c1", "NAS100", -0.5, "2025-02-01T00:00:00.000Z")],
          US500: [createTrade("c2", "US500", 0.6, "2025-02-02T00:00:00.000Z")],
        },
        summary: createMetricSummary({ expectancy: -0.05, profitFactor: 0.98, maxDrawdown: 5 }),
      }),
    );

    const deps = {
      now: () => new Date("2026-03-21T15:00:00.000Z"),
      runComparative: async (request: any) =>
        createComparativeReport({
          instruments: request.instruments ?? ["NAS100", "US500"],
          tradesByInstrument: {
            NAS100: [createTrade("s1", "NAS100", 1.5, "2025-03-01T00:00:00.000Z")],
            US500: [createTrade("s2", "US500", 1.4, "2025-03-02T00:00:00.000Z")],
          },
          summary: createMetricSummary({ expectancy: 0.26, profitFactor: 1.7, maxDrawdown: 3.4 }),
        }) as any,
      runWalkForward: async (request: any) =>
        ({
          generatedAt: "2026-03-21T15:00:00.000Z",
          request,
          instruments: [],
          failures: [],
          aggregate: createMetricSummary({ expectancy: 0.08, profitFactor: 1.04, maxDrawdown: 2.1 }),
        }) as any,
    };

    const first = await refreshResearchBundleValidationReportIfNeeded({
      config,
      deps,
    });
    const second = await refreshResearchBundleValidationReportIfNeeded({
      config,
      deps,
    });

    expect(first.refreshed).toBe(true);
    expect(first.outputs?.latestJsonPath).toContain("bundle-validation-latest.json");
    expect(second.refreshed).toBe(false);
    expect(second.outputs).toBeNull();
  });
});
