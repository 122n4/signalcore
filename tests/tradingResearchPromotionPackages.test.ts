import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  buildResearchPromotionBoard,
  buildResearchPromotionPackageReport,
  writeJsonAtomic,
  writeResearchPromotionBoard,
  writeResearchPromotionPackageReport,
} from "@/lib/trading/research";

import {
  createMetricSummary,
  createResearchConfig,
  createResearchQueue,
  createResearchTask,
  createResearchTempDir,
  writeResearchCandidateLibrary,
} from "./helpers/tradingResearchFixtures";

async function writeRunArtifacts(rootRunsDir: string, runId: string) {
  const runDir = path.join(rootRunsDir, runId);
  await mkdir(runDir, { recursive: true });
  await writeJsonAtomic(path.join(runDir, "manifest.json"), { run_id: runId });
  await writeJsonAtomic(path.join(runDir, "comparison.json"), { run_id: runId, comparison: true });
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

    await writeRunArtifacts(config.paths.runsDir, "run-promote-a");
    await writeRunArtifacts(config.paths.runsDir, "run-promote-b");

    const boardReport = await buildResearchPromotionBoard(config);
    await writeResearchPromotionBoard({ config, report: boardReport });

    const packageReport = await buildResearchPromotionPackageReport({
      config,
      boardReport,
    });

    expect(packageReport.summary.package_count).toBe(3);
    expect(packageReport.summary.ready_for_live_review_count).toBe(3);
    expect(packageReport.summary.bundle_confirmed_count).toBe(1);

    const bundlePackage = packageReport.packages.find((pkg) => pkg.source === "bundle");
    expect(bundlePackage?.review.ready_for_live_review).toBe(true);
    expect(bundlePackage?.portfolio_stress_passed).toBe(true);
    expect(bundlePackage?.artifacts.bundle_json_path).toContain("bundle-validation-latest.json");
    expect(bundlePackage?.artifacts.run_artifacts).toHaveLength(2);
    expect(bundlePackage?.artifacts.run_artifacts[0]?.decision_path).toContain("decision.json");
    expect(bundlePackage?.campaign_metadata_source).toBe("recorded");
    expect(bundlePackage?.ranking_metadata_source).toBe("recorded");

    const outputs = await writeResearchPromotionPackageReport({
      config,
      report: packageReport,
    });

    expect(outputs.latestJsonPath).toContain("promotion-packages-latest.json");
    expect(outputs.itemCount).toBe(3);
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
