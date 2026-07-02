import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  buildResearchPromotionBoard,
  writeJsonAtomic,
  writeResearchPromotionBoard,
} from "@/lib/trading/research";

import {
  createMetricSummary,
  createResearchConfig,
  createResearchQueue,
  createResearchTask,
  createResearchTempDir,
  writeResearchCandidateLibrary,
} from "./helpers/tradingResearchFixtures";

async function writeTaskComparison(args: {
  runsDir: string;
  runId: string;
  deflatedSharpeRatio: number;
  pboEstimate: number;
  adjustedPValue: number;
}) {
  const runDir = path.join(args.runsDir, args.runId);
  await mkdir(runDir, { recursive: true });
  await writeJsonAtomic(path.join(runDir, "comparison.json"), {
    aggregate: {
      baseline: createMetricSummary(),
      current: createMetricSummary({ expectancy: 0.28, profitFactor: 1.8 }),
    },
    crisis: {
      baseline: createMetricSummary({ expectancy: -0.05, profitFactor: 0.98 }),
      current: createMetricSummary({ expectancy: 0.02, profitFactor: 1.15 }),
    },
    walkForward: {
      baseline: createMetricSummary({ expectancy: 0.01, profitFactor: 1.01 }),
      current: createMetricSummary({ expectancy: 0.11, profitFactor: 1.12 }),
      affectedInstruments: ["NAS100"],
    },
    gates: {
      aggregateExpectancyStable: true,
      aggregateProfitFactorStable: true,
      aggregateDrawdownStable: true,
      crisisExpectancyStable: true,
      crisisProfitFactorStable: true,
      crisisDrawdownStable: true,
      walkForwardExpectancyStable: true,
      walkForwardProfitFactorStable: true,
      walkForwardDrawdownStable: true,
      walkForwardBreakEvenOrBetter: true,
      statisticalValidationPass: true,
      aggregateImproved: true,
      crisisImproved: true,
      walkForwardImproved: true,
      promotionThresholdMet: true,
      allHardGatesPass: true,
    },
    statistical_validation: {
      sample_size: 120,
      independent_trial_count: 1,
      trade_level_sharpe_ratio: 0.88,
      deflated_sharpe_ratio: args.deflatedSharpeRatio,
      pbo: {
        value: args.pboEstimate,
        risk_band: "low",
      },
      white_reality_check: {
        p_value: 0.09,
        adjusted_p_value: args.adjustedPValue,
        bootstrap_iterations: 500,
      },
      diagnostics: {
        out_of_sample_checks: [],
        notes: [],
      },
    },
  });
}

describe("trading research promotion board", () => {
  it("builds a ranked board from task decisions and bundle reports", async () => {
    const rootDir = await createResearchTempDir();
    const config = await createResearchConfig(rootDir);
    const promoteTask = createResearchTask({
      id: "promote-a",
      status: "completed",
      decision: "promote",
      decision_reason: "Strong promote",
      planner_source: {
        campaign_id: "increase_expectancy",
        campaign_objective: "increase_expectancy",
        family_id: "risk-family",
        template_id: "promote-a-template",
        auto_enqueued: true,
      },
    });
    const candidateTask = createResearchTask({
      id: "candidate-a",
      status: "completed",
      decision: "candidate",
      decision_reason: "Watch this candidate",
      run_fingerprint: "candidate-fingerprint",
      priority: 90,
      planner_source: {
        campaign_id: "improve_crisis",
        campaign_objective: "improve_crisis",
        family_id: "risk-family",
        template_id: "candidate-a-template",
        auto_enqueued: true,
      },
    });
    const bundlePromoteTask = createResearchTask({
      id: "promote-b",
      status: "completed",
      decision: "promote",
      type: "context_filter",
      run_fingerprint: "promote-b-fingerprint",
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
      priority: 95,
    });

    await writeJsonAtomic(
      config.paths.queuePath,
      createResearchQueue([promoteTask, candidateTask, bundlePromoteTask]),
    );

    await mkdir(path.dirname(config.paths.decisionsPath), { recursive: true });
    await writeFile(
      config.paths.decisionsPath,
      [
        JSON.stringify({
          event_id: "evt-1",
          timestamp: "2026-03-21T10:00:00.000Z",
          run_id: "run-promote-a",
          task_id: "promote-a",
          baseline_id: "baseline-test-live",
          run_fingerprint: "promote-fingerprint",
          decision: "promote",
          reason: "Strong promote",
          planner_campaign_id: "increase_expectancy",
          planner_campaign_objective: "increase_expectancy",
          aggregate_summary: createMetricSummary({ expectancy: 0.28, profitFactor: 1.8 }),
          crisis_summary: createMetricSummary({ expectancy: 0.02, profitFactor: 1.15 }),
          walkforward_summary: createMetricSummary({ expectancy: 0.11, profitFactor: 1.12 }),
          ranking_score: 86,
          ranking_band: "strong",
        }),
        JSON.stringify({
          event_id: "evt-2",
          timestamp: "2026-03-21T10:30:00.000Z",
          run_id: "run-promote-b",
          task_id: "promote-b",
          baseline_id: "baseline-test-live",
          run_fingerprint: "promote-b-fingerprint",
          decision: "promote",
          reason: "Complementary promote",
          planner_campaign_id: "increase_expectancy",
          planner_campaign_objective: "increase_expectancy",
          aggregate_summary: createMetricSummary({ expectancy: 0.24, profitFactor: 1.66 }),
          crisis_summary: createMetricSummary({ expectancy: 0.01, profitFactor: 1.08 }),
          walkforward_summary: createMetricSummary({ expectancy: 0.08, profitFactor: 1.05 }),
          ranking_score: 74,
          ranking_band: "strong",
        }),
        JSON.stringify({
          event_id: "evt-3",
          timestamp: "2026-03-21T11:00:00.000Z",
          run_id: "run-candidate-a",
          task_id: "candidate-a",
          baseline_id: "baseline-test-live",
          run_fingerprint: "candidate-fingerprint",
          decision: "candidate",
          reason: "Watch this candidate",
          planner_campaign_id: "improve_crisis",
          planner_campaign_objective: "improve_crisis",
          aggregate_summary: createMetricSummary({ expectancy: 0.23, profitFactor: 1.65 }),
          crisis_summary: createMetricSummary({ expectancy: -0.01, profitFactor: 1.03 }),
          walkforward_summary: createMetricSummary({ expectancy: 0.03, profitFactor: 1.01 }),
          ranking_score: 61,
          ranking_band: "promising",
        }),
      ].join("\n") + "\n",
      "utf8",
    );

    await writeJsonAtomic(path.join(config.paths.reportsDir, "bundles", "bundle-report.json"), {
      report_id: "bundle-validation-1",
      generated_at: "2026-03-21T12:00:00.000Z",
      baseline_id: "baseline-test-live",
      candidate_count: 1,
      candidates: [
        {
          bundle_id: "bundle-promote-a__promote-b",
          task_ids: ["promote-a", "promote-b"],
          affected_instruments: ["NAS100", "US500"],
          campaign_ids: ["increase_expectancy"],
          campaign_objectives: ["increase_expectancy"],
          primary_campaign_id: "increase_expectancy",
          primary_campaign_objective: "increase_expectancy",
          campaign_mode: "single",
        },
      ],
      results: [
        {
          bundle_id: "bundle-promote-a__promote-b",
          baseline_id: "baseline-test-live",
          task_ids: ["promote-a", "promote-b"],
          affected_instruments: ["NAS100", "US500"],
          campaign_ids: ["increase_expectancy"],
          campaign_objectives: ["increase_expectancy"],
          primary_campaign_id: "increase_expectancy",
          primary_campaign_objective: "increase_expectancy",
          campaign_mode: "single",
          portfolio_stress: {
            baseline: {
              cluster_count: 1,
              overlapping_trade_count: 0,
              overlap_ratio: 0,
              max_concurrent_trades: 1,
              stressed_max_drawdown: 2.1,
            },
            current: {
              cluster_count: 1,
              overlapping_trade_count: 0,
              overlap_ratio: 0,
              max_concurrent_trades: 1,
              stressed_max_drawdown: 1.9,
            },
            passes: true,
            reason: "Portfolio stress passed.",
          },
          comparison: {
            aggregate: {
              baseline: createMetricSummary({ expectancy: 0.2, profitFactor: 1.5 }),
              current: createMetricSummary({ expectancy: 0.31, profitFactor: 1.92 }),
            },
            crisis: {
              baseline: createMetricSummary({ expectancy: -0.05, profitFactor: 0.98 }),
              current: createMetricSummary({ expectancy: 0.04, profitFactor: 1.18 }),
            },
            walkForward: {
              baseline: createMetricSummary({ expectancy: 0.01, profitFactor: 1.01 }),
              current: createMetricSummary({ expectancy: 0.15, profitFactor: 1.24 }),
              affectedInstruments: ["NAS100", "US500"],
            },
            gates: {
              aggregateExpectancyStable: true,
              aggregateProfitFactorStable: true,
              aggregateDrawdownStable: true,
              crisisExpectancyStable: true,
              crisisProfitFactorStable: true,
              crisisDrawdownStable: true,
              walkForwardExpectancyStable: true,
              walkForwardProfitFactorStable: true,
              walkForwardDrawdownStable: true,
              walkForwardBreakEvenOrBetter: true,
              aggregateImproved: true,
              crisisImproved: true,
              walkForwardImproved: true,
              promotionThresholdMet: true,
              allHardGatesPass: true,
            },
          },
          decision: {
            run_id: "bundle-run-1",
            task_id: "bundle-promote-a__promote-b",
            decision: "promote",
            reason: "Bundle is stronger than parts",
            gates: {
              aggregateExpectancyStable: true,
              aggregateProfitFactorStable: true,
              aggregateDrawdownStable: true,
              crisisExpectancyStable: true,
              crisisProfitFactorStable: true,
              crisisDrawdownStable: true,
              walkForwardExpectancyStable: true,
              walkForwardProfitFactorStable: true,
              walkForwardDrawdownStable: true,
              walkForwardBreakEvenOrBetter: true,
              aggregateImproved: true,
              crisisImproved: true,
              walkForwardImproved: true,
              promotionThresholdMet: true,
              allHardGatesPass: true,
            },
            promoted_metrics: {
              aggregateProfitFactorDelta: 0.42,
            },
            ranking: {
              score: 94,
              band: "elite_watch",
              components: {
                aggregate: 30,
                crisis: 25,
                walkForward: 22,
                robustness: 20,
                penalties: -3,
              },
            },
            failure_forensics: null,
          },
        },
      ],
      keepable_bundles: [
        {
          bundle_id: "bundle-promote-a__promote-b",
          decision: "promote",
          score: 94,
          band: "elite_watch",
          primary_campaign_id: "increase_expectancy",
          primary_campaign_objective: "increase_expectancy",
          campaign_mode: "single",
          portfolio_stress_passed: true,
        },
      ],
      campaign_performance: [
        {
          campaign_id: "increase_expectancy",
          objective: "increase_expectancy",
          task_promotes: 0,
          task_candidates: 0,
          task_rejects_or_failed: 0,
          bundle_promotes: 1,
          bundle_candidates: 0,
          bundle_confirmed_count: 1,
          review_ready_count: 1,
          watchlist_count: 0,
          top_score: 94,
          last_activity_at: "2026-03-21T12:00:00.000Z",
        },
      ],
    });

    const report = await buildResearchPromotionBoard(config);

    expect(report.schema_version).toBe("research.promotion-board-report.v1");
    expect(report.provenance.upstream_report_ids).toContain("bundle-validation-1");
    expect(report.summary.task_promotes).toBe(2);
    expect(report.summary.task_candidates).toBe(1);
    expect(report.summary.bundle_promotes).toBe(1);
    expect(report.summary.review_ready_count).toBe(2);
    expect(report.summary.bundle_confirmed_count).toBe(1);
    expect(report.campaign_performance[0]?.campaign_id).toBe("increase_expectancy");
    expect(report.top_review_ready[0]?.entry_id).toBe(
      "bundle-bundle-promote-a__promote-b",
    );
    expect(report.top_review_ready[0]?.primary_campaign_id).toBe("increase_expectancy");
    expect(report.top_review_ready[0]?.portfolio_stress_passed).toBe(true);
    expect(report.entries.map((entry) => entry.board_status)).toEqual([
      "bundle_confirmed",
      "review_ready",
      "review_ready",
      "watchlist",
    ]);
    expect(report.entries[0]?.primary_campaign_objective).toBe("increase_expectancy");
    expect(report.entries[0]?.portfolio_stress_passed).toBe(true);
    expect(report.entries[0]?.campaign_metadata_source).toBe("recorded");
    expect(report.entries[0]?.ranking_metadata_source).toBe("recorded");

    const outputs = await writeResearchPromotionBoard({ config, report });

    expect(outputs.jsonPath).toContain("promotion-board-");
    expect(outputs.latestJsonPath).toContain("promotion-board-latest.json");
  });

  it("hydrates task-level statistical validation fields from canonical comparison artifacts", async () => {
    const rootDir = await createResearchTempDir();
    const config = await createResearchConfig(rootDir);

    const promoteTask = createResearchTask({
      id: "promote-stats",
      status: "completed",
      decision: "promote",
      decision_reason: "Strong promote with statistical validation",
      planner_source: {
        campaign_id: "increase_expectancy",
        campaign_objective: "increase_expectancy",
        family_id: "risk-family",
        template_id: "promote-stats-template",
        auto_enqueued: true,
      },
    });

    await writeJsonAtomic(config.paths.queuePath, createResearchQueue([promoteTask]));
    await mkdir(path.dirname(config.paths.decisionsPath), { recursive: true });
    await writeFile(
      config.paths.decisionsPath,
      JSON.stringify({
        event_id: "evt-stats",
        timestamp: "2026-03-21T10:00:00.000Z",
        run_id: "run-promote-stats",
        task_id: "promote-stats",
        baseline_id: "baseline-test-live",
        run_fingerprint: "promote-stats-fingerprint",
        decision: "promote",
        reason: "Strong promote with statistical validation",
        planner_campaign_id: "increase_expectancy",
        planner_campaign_objective: "increase_expectancy",
        aggregate_summary: createMetricSummary({ expectancy: 0.28, profitFactor: 1.8 }),
        crisis_summary: createMetricSummary({ expectancy: 0.02, profitFactor: 1.15 }),
        walkforward_summary: createMetricSummary({ expectancy: 0.11, profitFactor: 1.12 }),
        ranking_score: 86,
        ranking_band: "strong",
      }) + "\n",
      "utf8",
    );

    await writeTaskComparison({
      runsDir: config.paths.runsDir,
      runId: "run-promote-stats",
      deflatedSharpeRatio: 0.67,
      pboEstimate: 0.12,
      adjustedPValue: 0.08,
    });

    const report = await buildResearchPromotionBoard(config);
    const entry = report.entries[0];

    expect(entry?.statistical_validation_passed).toBe(true);
    expect(entry?.deflated_sharpe_ratio).toBe(0.67);
    expect(entry?.pbo_estimate).toBe(0.12);
    expect(entry?.white_reality_check_p_value).toBe(0.08);
  });

  it("backfills campaign and ranking metadata for legacy promotes from queue and library context", async () => {
    const rootDir = await createResearchTempDir();
    const config = await createResearchConfig(rootDir);

    await writeResearchCandidateLibrary(config, {
      version: 1,
      families: [
        {
          id: "legacy-family",
          enabled: true,
          priority: 100,
          campaign_id: "increase_expectancy",
          templates: [
            {
              id: "legacy-template",
              enabled: true,
              type: "context_filter",
              priority: 100,
              dataset_profile: "core_20y",
              validation_profile: "default_live_safe",
              candidate_scope: {
                instruments: ["NAS100"],
                sessions: ["ny_open"],
                setup_types: ["breakout_continuation"],
              },
              candidate_mutation: {
                kind: "blocked_context",
              },
            },
          ],
        },
      ],
    });

    const legacyTask = createResearchTask({
      id: "legacy-promote",
      type: "context_filter",
      status: "completed",
      decision: "promote",
      decision_reason: "Legacy promote missing metadata",
      planner_source: {
        family_id: "legacy-family",
        template_id: "legacy-template",
        campaign_id: null,
        campaign_objective: null,
        auto_enqueued: true,
      },
    });

    await writeJsonAtomic(
      config.paths.queuePath,
      createResearchQueue([legacyTask]),
    );

    await mkdir(path.dirname(config.paths.decisionsPath), { recursive: true });
    await writeFile(
      config.paths.decisionsPath,
      JSON.stringify({
        event_id: "evt-legacy",
        timestamp: "2026-03-21T09:00:00.000Z",
        run_id: "run-legacy",
        task_id: "legacy-promote",
        baseline_id: "baseline-test-live",
        run_fingerprint: "legacy-fingerprint",
        decision: "promote",
        reason: "Legacy promote missing metadata",
        aggregate_summary: createMetricSummary({ expectancy: 0.23, profitFactor: 1.72 }),
        crisis_summary: createMetricSummary({ expectancy: -0.02, profitFactor: 1.05 }),
        walkforward_summary: createMetricSummary({
          expectancy: 0.12,
          profitFactor: 1.19,
          totalTrades: 11,
        }),
      }) + "\n",
      "utf8",
    );

    const report = await buildResearchPromotionBoard(config);
    const entry = report.entries[0];

    expect(entry?.primary_campaign_id).toBe("increase_expectancy");
    expect(entry?.primary_campaign_objective).toBe("increase_expectancy");
    expect(entry?.campaign_metadata_source).toBe("library_backfill");
    expect(entry?.score).not.toBeNull();
    expect(entry?.band).not.toBeNull();
    expect(entry?.ranking_metadata_source).toBe("summary_backfill");
    expect(report.campaign_performance[0]?.campaign_id).toBe("increase_expectancy");
    expect(report.campaign_performance[0]?.task_promotes).toBe(1);
  });

  it("keeps the latest positive board entry when a newer rerun of the same template is rejected", async () => {
    const rootDir = await createResearchTempDir();
    const config = await createResearchConfig(rootDir);

    const oldPromoteTask = createResearchTask({
      id: "nas100-block-old",
      type: "context_filter",
      status: "completed",
      decision: "promote",
      planner_source: {
        campaign_id: "reduce_drawdown",
        campaign_objective: "reduce_drawdown",
        family_id: "context-family",
        template_id: "nas100_breakout_ny_open_block",
        auto_enqueued: true,
      },
      created_at: "2026-03-21T10:00:00.000Z",
      finished_at: "2026-03-21T10:20:00.000Z",
    });
    const newerRejectTask = createResearchTask({
      id: "nas100-block-new",
      type: "context_filter",
      status: "completed",
      decision: "reject",
      planner_source: {
        campaign_id: "reduce_drawdown",
        campaign_objective: "reduce_drawdown",
        family_id: "context-family",
        template_id: "nas100_breakout_ny_open_block",
        auto_enqueued: true,
      },
      created_at: "2026-03-21T12:00:00.000Z",
      finished_at: "2026-03-21T12:30:00.000Z",
    });

    await writeJsonAtomic(
      config.paths.queuePath,
      createResearchQueue([oldPromoteTask, newerRejectTask]),
    );

    await mkdir(path.dirname(config.paths.decisionsPath), { recursive: true });
    await writeFile(
      config.paths.decisionsPath,
      [
        JSON.stringify({
          event_id: "evt-old-promote",
          timestamp: "2026-03-21T10:20:00.000Z",
          run_id: "run-old-promote",
          task_id: "nas100-block-old",
          baseline_id: "baseline-test-live",
          run_fingerprint: "fp-old-promote",
          decision: "promote",
          reason: "Old promote.",
          planner_family_id: "context-family",
          planner_template_id: "nas100_breakout_ny_open_block",
          planner_campaign_id: "reduce_drawdown",
          planner_campaign_objective: "reduce_drawdown",
          aggregate_summary: createMetricSummary({ expectancy: 0.24, profitFactor: 1.75 }),
          crisis_summary: createMetricSummary({ expectancy: -0.03, profitFactor: 1.12 }),
          walkforward_summary: createMetricSummary({ expectancy: 0.14, profitFactor: 2.2 }),
        }),
        JSON.stringify({
          event_id: "evt-new-reject",
          timestamp: "2026-03-21T12:30:00.000Z",
          run_id: "run-new-reject",
          task_id: "nas100-block-new",
          baseline_id: "baseline-test-live",
          run_fingerprint: "fp-new-reject",
          decision: "reject",
          reason: "Newer rerun failed.",
          planner_family_id: "context-family",
          planner_template_id: "nas100_breakout_ny_open_block",
          planner_campaign_id: "reduce_drawdown",
          planner_campaign_objective: "reduce_drawdown",
          aggregate_summary: createMetricSummary({ expectancy: 0.2, profitFactor: 1.6 }),
          crisis_summary: createMetricSummary({ expectancy: -0.08, profitFactor: 1.01 }),
          walkforward_summary: createMetricSummary({ expectancy: -0.05, profitFactor: 0.9 }),
        }),
      ].join("\n") + "\n",
      "utf8",
    );

    const report = await buildResearchPromotionBoard(config);

    expect(report.entries).toHaveLength(1);
    expect(report.entries[0]?.decision).toBe("promote");
    expect(report.entries[0]?.board_status).toBe("review_ready");
    expect(report.entries[0]?.task_ids).toEqual(["nas100-block-old"]);
    expect(report.summary.task_promotes).toBe(1);
    expect(report.summary.review_ready_count).toBe(1);
    expect(report.campaign_performance[0]?.campaign_id).toBe("reduce_drawdown");
    expect(report.campaign_performance[0]?.task_promotes).toBe(1);
    expect(report.campaign_performance[0]?.task_rejects_or_failed).toBe(1);
  });
});
