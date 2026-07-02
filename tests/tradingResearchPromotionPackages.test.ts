import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  buildResearchPromotionBoard,
  buildResearchPromotionPackageReport,
  buildResearchRegistryReport,
  writeJsonAtomic,
  writeResearchPromotionBoard,
  writeResearchPromotionPackageReport,
  writeResearchRegistryReport,
} from "@/lib/trading/research";

import {
  createMetricSummary,
  createResearchConfig,
  createResearchQueue,
  createResearchTask,
  createResearchTempDir,
  writeResearchCandidateLibrary,
} from "./helpers/tradingResearchFixtures";

async function writeRunArtifacts(
  rootRunsDir: string,
  runId: string,
  comparisonOverrides: Record<string, unknown> | null = null,
) {
  const runDir = path.join(rootRunsDir, runId);
  await mkdir(runDir, { recursive: true });
  await writeJsonAtomic(path.join(runDir, "manifest.json"), { run_id: runId });
  await writeJsonAtomic(path.join(runDir, "comparison.json"), {
    run_id: runId,
    comparison: true,
    ...(comparisonOverrides ?? {}),
  });
  await writeJsonAtomic(path.join(runDir, "decision.json"), { run_id: runId, decision: "promote" });
}

describe("trading research promotion packages", () => {
  it("builds formal review packages for review-ready and bundle-confirmed opportunities", async () => {
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
      last_run_id: "run-promote-a",
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
      last_run_id: "run-promote-b",
    });
    const candidateTask = createResearchTask({
      id: "candidate-a",
      status: "completed",
      decision: "candidate",
      decision_reason: "Still watchlist",
      planner_source: {
        campaign_id: "improve_crisis",
        campaign_objective: "improve_crisis",
        family_id: "risk-family",
        template_id: "candidate-a-template",
        auto_enqueued: true,
      },
      last_run_id: "run-candidate-a",
    });

    await writeJsonAtomic(
      config.paths.queuePath,
      createResearchQueue([promoteTask, bundlePromoteTask, candidateTask]),
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
          run_fingerprint: "promote-a-fingerprint",
          decision: "promote",
          reason: "Strong promote",
          planner_campaign_id: "increase_expectancy",
          planner_campaign_objective: "increase_expectancy",
          aggregate_summary: createMetricSummary({ expectancy: 0.28, profitFactor: 1.8 }),
          crisis_summary: createMetricSummary({ expectancy: 0.02, profitFactor: 1.15 }),
          walkforward_summary: createMetricSummary({ expectancy: 0.11, profitFactor: 1.12, totalTrades: 12 }),
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
          walkforward_summary: createMetricSummary({ expectancy: 0.08, profitFactor: 1.05, totalTrades: 11 }),
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
          reason: "Still watchlist",
          planner_campaign_id: "improve_crisis",
          planner_campaign_objective: "improve_crisis",
          aggregate_summary: createMetricSummary({ expectancy: 0.21, profitFactor: 1.54 }),
          crisis_summary: createMetricSummary({ expectancy: -0.01, profitFactor: 1.01 }),
          walkforward_summary: createMetricSummary({ expectancy: 0.02, profitFactor: 1.01, totalTrades: 9 }),
          ranking_score: 58,
          ranking_band: "promising",
        }),
      ].join("\n") + "\n",
      "utf8",
    );

    const bundleReport = {
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
              current: createMetricSummary({ expectancy: 0.15, profitFactor: 1.24, totalTrades: 14 }),
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
      campaign_performance: [],
    };

    await mkdir(path.join(config.paths.reportsDir, "bundles"), { recursive: true });
    await writeJsonAtomic(
      path.join(config.paths.reportsDir, "bundles", "bundle-validation-latest.json"),
      bundleReport,
    );
    await writeFile(
      path.join(config.paths.reportsDir, "bundles", "bundle-validation-latest.md"),
      "# bundle latest\n",
      "utf8",
    );

    await writeRunArtifacts(config.paths.runsDir, "run-promote-a", {
      gates: {
        statisticalValidationPass: true,
      },
      statistical_validation: {
        sample_size: 120,
        independent_trial_count: 1,
        trade_level_sharpe_ratio: 0.88,
        deflated_sharpe_ratio: 0.64,
        pbo: {
          value: 0.11,
          risk_band: "low",
        },
        white_reality_check: {
          p_value: 0.09,
          adjusted_p_value: 0.07,
          bootstrap_iterations: 500,
        },
        diagnostics: {
          out_of_sample_checks: [],
          notes: [],
        },
      },
    });
    await writeRunArtifacts(config.paths.runsDir, "run-promote-b");
    const registryReport = await buildResearchRegistryReport(config);
    await writeResearchRegistryReport({ config, report: registryReport });

    const boardReport = await buildResearchPromotionBoard(config);
    await writeResearchPromotionBoard({ config, report: boardReport });

    const packageReport = await buildResearchPromotionPackageReport({
      config,
      boardReport,
    });

    expect(packageReport.schema_version).toBe("research.promotion-packages-report.v1");
    expect(packageReport.provenance.upstream_report_ids).toContain(boardReport.report_id);
    expect(packageReport.summary.package_count).toBe(3);
    expect(packageReport.summary.ready_for_live_review_count).toBe(3);
    expect(packageReport.summary.bundle_confirmed_count).toBe(1);

    const bundlePackage = packageReport.packages.find((pkg) => pkg.source === "bundle");
    expect(bundlePackage?.review.ready_for_live_review).toBe(true);
    expect(bundlePackage?.portfolio_stress_passed).toBe(true);
    expect(bundlePackage?.artifacts.bundle_json_path).toContain("bundle-validation-latest.json");
    expect(bundlePackage?.artifacts.registry_report_id).toBe(registryReport.report_id);
    expect(bundlePackage?.artifacts.run_artifacts).toHaveLength(2);
    expect(bundlePackage?.artifacts.run_artifacts[0]?.decision_path).toContain("decision.json");
    expect(bundlePackage?.artifacts.run_artifacts[0]?.comparison_artifact_id).toContain("comparison");
    expect(bundlePackage?.campaign_metadata_source).toBe("recorded");
    expect(bundlePackage?.ranking_metadata_source).toBe("recorded");

    const taskPackage = packageReport.packages.find((pkg) => pkg.package_id === "package-task-promote-a");
    expect(taskPackage?.statistical_validation_passed).toBe(true);
    expect(taskPackage?.deflated_sharpe_ratio).toBe(0.64);
    expect(taskPackage?.pbo_estimate).toBe(0.11);
    expect(taskPackage?.white_reality_check_p_value).toBe(0.07);
    expect(taskPackage?.review.cautions).not.toContain(
      "Task-level promote has not yet been upgraded into a bundle-level statistical review.",
    );

    const outputs = await writeResearchPromotionPackageReport({
      config,
      report: packageReport,
    });

    expect(outputs.latestJsonPath).toContain("promotion-packages-latest.json");
    expect(outputs.itemCount).toBe(3);
  });

  it("blocks overlapping task-level promotes from claiming ready-for-live-review at the same time", async () => {
    const rootDir = await createResearchTempDir();
    const config = await createResearchConfig(rootDir);

    const broadTask = createResearchTask({
      id: "promote-broad",
      type: "context_filter",
      status: "completed",
      decision: "promote",
      decision_reason: "Broad NAS100 promote",
      candidate_scope: {
        instruments: ["NAS100"],
        sessions: ["ny_open"],
        setup_types: ["breakout_continuation"],
      },
      candidate_mutation: {
        kind: "blocked_context",
      },
      planner_source: {
        campaign_id: "reduce_drawdown",
        campaign_objective: "reduce_drawdown",
        family_id: "context-family",
        template_id: "promote-broad-template",
        auto_enqueued: true,
      },
      last_run_id: "run-promote-broad",
    });
    const filteredTask = createResearchTask({
      id: "promote-filtered",
      type: "context_filter",
      status: "completed",
      decision: "promote",
      decision_reason: "Filtered NAS100 promote",
      candidate_scope: {
        instruments: ["NAS100"],
        sessions: ["ny_open"],
        setup_types: ["breakout_continuation"],
        quality_grades: ["B", "C", "D"],
      },
      candidate_mutation: {
        kind: "blocked_context",
      },
      planner_source: {
        campaign_id: "reduce_drawdown",
        campaign_objective: "reduce_drawdown",
        family_id: "context-family",
        template_id: "promote-filtered-template",
        auto_enqueued: true,
      },
      last_run_id: "run-promote-filtered",
    });

    await writeJsonAtomic(
      config.paths.queuePath,
      createResearchQueue([broadTask, filteredTask]),
    );

    await mkdir(path.dirname(config.paths.decisionsPath), { recursive: true });
    await writeFile(
      config.paths.decisionsPath,
      [
        JSON.stringify({
          event_id: "evt-broad",
          timestamp: "2026-03-21T09:00:00.000Z",
          run_id: "run-promote-broad",
          task_id: "promote-broad",
          baseline_id: "baseline-test-live",
          run_fingerprint: "promote-broad-fingerprint",
          decision: "promote",
          reason: "Broad NAS100 promote",
          planner_campaign_id: "reduce_drawdown",
          planner_campaign_objective: "reduce_drawdown",
          aggregate_summary: createMetricSummary({ expectancy: 0.24, profitFactor: 1.75 }),
          crisis_summary: createMetricSummary({ expectancy: 0.01, profitFactor: 1.08, totalTrades: 18 }),
          walkforward_summary: createMetricSummary({ expectancy: 0.13, profitFactor: 1.15, totalTrades: 12 }),
          ranking_score: 71,
          ranking_band: "strong",
        }),
        JSON.stringify({
          event_id: "evt-filtered",
          timestamp: "2026-03-21T10:00:00.000Z",
          run_id: "run-promote-filtered",
          task_id: "promote-filtered",
          baseline_id: "baseline-test-live",
          run_fingerprint: "promote-filtered-fingerprint",
          decision: "promote",
          reason: "Filtered NAS100 promote",
          planner_campaign_id: "reduce_drawdown",
          planner_campaign_objective: "reduce_drawdown",
          aggregate_summary: createMetricSummary({ expectancy: 0.25, profitFactor: 1.78 }),
          crisis_summary: createMetricSummary({ expectancy: 0.02, profitFactor: 1.1, totalTrades: 19 }),
          walkforward_summary: createMetricSummary({ expectancy: 0.14, profitFactor: 1.18, totalTrades: 12 }),
          ranking_score: 72,
          ranking_band: "strong",
        }),
      ].join("\n") + "\n",
      "utf8",
    );

    await writeRunArtifacts(config.paths.runsDir, "run-promote-broad");
    await writeRunArtifacts(config.paths.runsDir, "run-promote-filtered");

    const boardReport = await buildResearchPromotionBoard(config);
    const packageReport = await buildResearchPromotionPackageReport({
      config,
      boardReport,
    });

    expect(packageReport.summary.review_ready_count).toBe(2);
    expect(packageReport.summary.ready_for_live_review_count).toBe(0);
    expect(packageReport.summary.blocked_count).toBe(2);

    const broadPackage = packageReport.packages.find((pkg) => pkg.package_id === "package-task-promote-broad");
    const filteredPackage = packageReport.packages.find((pkg) => pkg.package_id === "package-task-promote-filtered");

    expect(broadPackage?.review.ready_for_live_review).toBe(false);
    expect(filteredPackage?.review.ready_for_live_review).toBe(false);
    expect(broadPackage?.review.blockers).toContain(
      "Overlapping ready-for-live-review scope with package 'package-task-promote-filtered'. Canonical Promote -> Paper handoff requires a unique scope.",
    );
    expect(filteredPackage?.review.blockers).toContain(
      "Overlapping ready-for-live-review scope with package 'package-task-promote-broad'. Canonical Promote -> Paper handoff requires a unique scope.",
    );
  });

  it("keeps the narrowest equivalent overlapping task scope as the canonical live-review package", async () => {
    const rootDir = await createResearchTempDir();
    const config = await createResearchConfig(rootDir);
    const sharedAggregate = createMetricSummary({
      expectancy: 0.2207,
      profitFactor: 1.7586,
      maxDrawdown: 3.8896,
      totalTrades: 238,
      winRate: 44.958,
      averageRiskReward: 2.255,
    });
    const sharedCrisis = createMetricSummary({
      expectancy: -0.0342,
      profitFactor: 1.1285,
      maxDrawdown: 4.1077,
      totalTrades: 88,
      winRate: 35.2273,
      averageRiskReward: 2.3909,
    });
    const sharedWalkforward = createMetricSummary({
      expectancy: 0.1466,
      profitFactor: 2.2136,
      maxDrawdown: 0.2547,
      totalTrades: 6,
      winRate: 66.6667,
      averageRiskReward: 2.4,
    });

    const broadTask = createResearchTask({
      id: "promote-broad-equivalent",
      type: "context_filter",
      status: "completed",
      decision: "promote",
      decision_reason: "Broad NAS100 promote",
      candidate_scope: {
        instruments: ["NAS100"],
        sessions: ["ny_open"],
        setup_types: ["breakout_continuation"],
      },
      candidate_mutation: {
        kind: "blocked_context",
      },
      planner_source: {
        campaign_id: "reduce_drawdown",
        campaign_objective: "reduce_drawdown",
        family_id: "context-family",
        template_id: "promote-broad-template",
        auto_enqueued: true,
      },
      last_run_id: "run-promote-broad-equivalent",
    });
    const filteredTask = createResearchTask({
      id: "promote-filtered-equivalent",
      type: "context_filter",
      status: "completed",
      decision: "promote",
      decision_reason: "Filtered NAS100 promote",
      candidate_scope: {
        instruments: ["NAS100"],
        sessions: ["ny_open"],
        setup_types: ["breakout_continuation"],
        quality_grades: ["B", "C", "D"],
      },
      candidate_mutation: {
        kind: "blocked_context",
      },
      planner_source: {
        campaign_id: "reduce_drawdown",
        campaign_objective: "reduce_drawdown",
        family_id: "context-family",
        template_id: "promote-filtered-template",
        auto_enqueued: true,
      },
      last_run_id: "run-promote-filtered-equivalent",
    });

    await writeJsonAtomic(
      config.paths.queuePath,
      createResearchQueue([broadTask, filteredTask]),
    );

    await mkdir(path.dirname(config.paths.decisionsPath), { recursive: true });
    await writeFile(
      config.paths.decisionsPath,
      [
        JSON.stringify({
          event_id: "evt-broad-equivalent",
          timestamp: "2026-03-21T09:00:00.000Z",
          run_id: "run-promote-broad-equivalent",
          task_id: "promote-broad-equivalent",
          baseline_id: "baseline-test-live",
          run_fingerprint: "promote-broad-equivalent-fingerprint",
          decision: "promote",
          reason: "Broad NAS100 promote",
          planner_campaign_id: "reduce_drawdown",
          planner_campaign_objective: "reduce_drawdown",
          aggregate_summary: sharedAggregate,
          crisis_summary: sharedCrisis,
          walkforward_summary: sharedWalkforward,
          ranking_score: 53.93,
          ranking_band: "promising",
        }),
        JSON.stringify({
          event_id: "evt-filtered-equivalent",
          timestamp: "2026-03-21T10:00:00.000Z",
          run_id: "run-promote-filtered-equivalent",
          task_id: "promote-filtered-equivalent",
          baseline_id: "baseline-test-live",
          run_fingerprint: "promote-filtered-equivalent-fingerprint",
          decision: "promote",
          reason: "Filtered NAS100 promote",
          planner_campaign_id: "reduce_drawdown",
          planner_campaign_objective: "reduce_drawdown",
          aggregate_summary: sharedAggregate,
          crisis_summary: sharedCrisis,
          walkforward_summary: sharedWalkforward,
          ranking_score: 53.93,
          ranking_band: "promising",
        }),
      ].join("\n") + "\n",
      "utf8",
    );

    await writeRunArtifacts(config.paths.runsDir, "run-promote-broad-equivalent");
    await writeRunArtifacts(config.paths.runsDir, "run-promote-filtered-equivalent");

    const boardReport = await buildResearchPromotionBoard(config);
    const packageReport = await buildResearchPromotionPackageReport({
      config,
      boardReport,
    });

    expect(packageReport.summary.review_ready_count).toBe(2);
    expect(packageReport.summary.ready_for_live_review_count).toBe(1);
    expect(packageReport.summary.blocked_count).toBe(1);

    const broadPackage = packageReport.packages.find(
      (pkg) => pkg.package_id === "package-task-promote-broad-equivalent",
    );
    const filteredPackage = packageReport.packages.find(
      (pkg) => pkg.package_id === "package-task-promote-filtered-equivalent",
    );

    expect(broadPackage?.review.ready_for_live_review).toBe(false);
    expect(broadPackage?.review.blockers).toContain(
      "Broader overlapping scope than equivalent narrower package 'package-task-promote-filtered-equivalent'. Canonical Promote -> Paper handoff keeps the narrowest equivalent task scope.",
    );
    expect(filteredPackage?.review.ready_for_live_review).toBe(true);
    expect(
      filteredPackage?.review.blockers.some((blocker) => blocker.includes("Overlapping ready-for-live-review scope")),
    ).toBe(false);
  });

  it("treats backfilled legacy metadata as caution instead of blocker", async () => {
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
      last_run_id: "run-legacy",
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
        aggregate_summary: createMetricSummary({ expectancy: 0.24, profitFactor: 1.75 }),
        crisis_summary: createMetricSummary({
          expectancy: 0.01,
          profitFactor: 1.08,
          totalTrades: 18,
        }),
        walkforward_summary: createMetricSummary({
          expectancy: 0.13,
          profitFactor: 1.15,
          totalTrades: 12,
        }),
      }) + "\n",
      "utf8",
    );

    await writeRunArtifacts(config.paths.runsDir, "run-legacy");

    const boardReport = await buildResearchPromotionBoard(config);
    await writeResearchPromotionBoard({ config, report: boardReport });

    const packageReport = await buildResearchPromotionPackageReport({
      config,
      boardReport,
    });
    const legacyPackage = packageReport.packages[0];

    expect(packageReport.schema_version).toBe("research.promotion-packages-report.v1");
    expect(packageReport.provenance.upstream_report_ids).toContain(boardReport.report_id);
    expect(legacyPackage?.review.ready_for_live_review).toBe(true);
    expect(legacyPackage?.review.blockers).toEqual([]);
    expect(legacyPackage?.review.cautions).toEqual(
      expect.arrayContaining([
        "Task-level promote is not yet bundle-confirmed.",
        "Campaign metadata was backfilled from library_backfill.",
        "Ranking metadata was backfilled from summary_backfill.",
      ]),
    );
    expect(legacyPackage?.campaign_metadata_source).toBe("library_backfill");
    expect(legacyPackage?.ranking_metadata_source).toBe("summary_backfill");
  });
});
