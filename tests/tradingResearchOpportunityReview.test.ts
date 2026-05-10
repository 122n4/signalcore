import { describe, expect, it } from "vitest";

import {
  buildResearchOpportunityReviewReport,
  writeJsonAtomic,
  type ResearchPromotionBoardReport,
  type ResearchPromotionPackageReport,
  type ResearchRunComparison,
} from "@/lib/trading/research";

import {
  createMetricSummary,
  createResearchConfig,
  createResearchQueue,
  createResearchTask,
  createResearchTempDir,
} from "./helpers/tradingResearchFixtures";

function createComparison(
  overrides: Partial<ResearchRunComparison> = {},
): ResearchRunComparison {
  return {
    aggregate: {
      baseline: createMetricSummary({ expectancy: 0.2, profitFactor: 1.5 }),
      current: createMetricSummary({ expectancy: 0.24, profitFactor: 1.7 }),
    },
    crisis: {
      baseline: createMetricSummary({ expectancy: -0.05, profitFactor: 0.98 }),
      current: createMetricSummary({ expectancy: 0.01, profitFactor: 1.05 }),
    },
    walkForward: {
      baseline: createMetricSummary({ expectancy: 0.01, profitFactor: 1.01 }),
      current: createMetricSummary({ expectancy: 0.12, profitFactor: 1.14, totalTrades: 12 }),
      affectedInstruments: ["NAS100"],
    },
    robustness: null,
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
    ...overrides,
  };
}

function createBoardAndPackageReports(args: {
  taskIds: string[];
  baselineId: string;
}): {
  boardReport: ResearchPromotionBoardReport;
  packageReport: ResearchPromotionPackageReport;
} {
  const entries = args.taskIds.map((taskId) => ({
    entry_id: `task-${taskId}`,
    source: "task" as const,
    baseline_id: args.baselineId,
    task_ids: [taskId],
    campaign_ids: ["reduce_drawdown"],
    campaign_objectives: ["reduce_drawdown" as const],
    primary_campaign_id: "reduce_drawdown",
    primary_campaign_objective: "reduce_drawdown" as const,
    campaign_metadata_source: "recorded" as const,
    campaign_mode: "single" as const,
    run_id: `run-${taskId}`,
    decision: "promote" as const,
    board_status: "review_ready" as const,
    summary: `Review ${taskId}`,
    score: 62,
    band: "strong" as const,
    ranking_metadata_source: "recorded" as const,
    aggregate_summary: createMetricSummary({ expectancy: 0.24, profitFactor: 1.7 }),
    crisis_summary: createMetricSummary({ expectancy: 0.01, profitFactor: 1.05 }),
    walkforward_summary: createMetricSummary({ expectancy: 0.12, profitFactor: 1.14, totalTrades: 12 }),
    generated_at: "2026-03-21T00:00:00.000Z",
  }));

  const boardReport: ResearchPromotionBoardReport = {
    report_id: "board-1",
    generated_at: "2026-03-21T00:00:00.000Z",
    live_baseline_id: args.baselineId,
    summary: {
      task_promotes: entries.length,
      task_candidates: 0,
      bundle_promotes: 0,
      bundle_candidates: 0,
      review_ready_count: entries.length,
      watchlist_count: 0,
      bundle_confirmed_count: 0,
    },
    campaign_performance: [],
    entries,
    top_review_ready: entries.map((entry) => ({
      entry_id: entry.entry_id,
      source: entry.source,
      primary_campaign_id: entry.primary_campaign_id,
      primary_campaign_objective: entry.primary_campaign_objective,
      score: entry.score,
      band: entry.band,
      board_status: entry.board_status,
      portfolio_stress_passed: null,
    })),
  };

  const packageReport: ResearchPromotionPackageReport = {
    report_id: "packages-1",
    generated_at: "2026-03-21T00:00:00.000Z",
    live_baseline_id: args.baselineId,
    summary: {
      package_count: entries.length,
      review_ready_count: entries.length,
      bundle_confirmed_count: 0,
      ready_for_live_review_count: entries.length,
      blocked_count: 0,
    },
    packages: entries.map((entry) => ({
      package_id: `package-${entry.entry_id}`,
      generated_at: "2026-03-21T00:00:00.000Z",
      baseline_id: args.baselineId,
      entry_id: entry.entry_id,
      source: entry.source,
      board_status: entry.board_status,
      decision: entry.decision,
      summary: entry.summary,
      task_ids: entry.task_ids,
      campaign_ids: entry.campaign_ids,
      campaign_objectives: entry.campaign_objectives,
      primary_campaign_id: entry.primary_campaign_id,
      primary_campaign_objective: entry.primary_campaign_objective,
      campaign_metadata_source: entry.campaign_metadata_source,
      campaign_mode: entry.campaign_mode,
      run_id: entry.run_id,
      score: entry.score,
      band: entry.band,
      ranking_metadata_source: entry.ranking_metadata_source,
      portfolio_stress_passed: null,
      portfolio_stress_overlap_ratio: null,
      portfolio_stress_max_concurrent: null,
      aggregate_summary: entry.aggregate_summary,
      crisis_summary: entry.crisis_summary,
      walkforward_summary: entry.walkforward_summary,
      review: {
        ready_for_live_review: true,
        blockers: [],
        cautions: [],
        checklist: [],
      },
      artifacts: {
        board_json_path: null,
        board_markdown_path: null,
        bundle_json_path: null,
        bundle_markdown_path: null,
        run_artifacts: [],
      },
    })),
  };

  return {
    boardReport,
    packageReport,
  };
}

describe("trading research opportunity review", () => {
  it("reviews a single ready package and reports insufficient bundle candidates", async () => {
    const rootDir = await createResearchTempDir();
    const config = await createResearchConfig(rootDir);
    const task = createResearchTask({
      id: "review-task-a",
      status: "completed",
      decision: "promote",
      type: "context_filter",
      candidate_mutation: {
        kind: "blocked_context",
      },
      planner_source: {
        family_id: "family-a",
        template_id: "template-a",
        campaign_id: "reduce_drawdown",
        campaign_objective: "reduce_drawdown",
        auto_enqueued: true,
      },
    });

    await writeJsonAtomic(config.paths.queuePath, createResearchQueue([task]));
    const { boardReport, packageReport } = createBoardAndPackageReports({
      taskIds: [task.id],
      baselineId: "baseline-test-live",
    });

    const report = await buildResearchOpportunityReviewReport(config, {
      boardReport,
      packageReport,
      executors: {
        context_filter: async () => ({
          affectedInstruments: ["NAS100"],
          comparison: createComparison(),
          artifacts: {
            aggregateReport: {},
            crisisReport: {},
            walkForwardReport: {},
          },
        }),
      },
      now: () => new Date("2026-03-21T00:00:00.000Z"),
    });

    expect(report.summary.reviewed_item_count).toBe(1);
    expect(report.summary.isolated_promote_count).toBe(1);
    expect(report.bundle.status).toBe("insufficient_candidates");
  });

  it("validates a compatible bundle when two ready opportunities are present", async () => {
    const rootDir = await createResearchTempDir();
    const config = await createResearchConfig(rootDir);
    const taskA = createResearchTask({
      id: "review-task-a",
      status: "completed",
      decision: "promote",
      type: "context_filter",
      candidate_scope: {
        instruments: ["NAS100"],
        sessions: ["ny_open"],
        setup_types: ["breakout_continuation"],
      },
      candidate_mutation: {
        kind: "blocked_context",
      },
      planner_source: {
        family_id: "family-a",
        template_id: "template-a",
        campaign_id: "reduce_drawdown",
        campaign_objective: "reduce_drawdown",
        auto_enqueued: true,
      },
    });
    const taskB = createResearchTask({
      id: "review-task-b",
      status: "completed",
      decision: "promote",
      type: "risk_shaping",
      candidate_scope: {
        instruments: ["XAUUSD"],
        sessions: ["late_us"],
        setup_types: ["breakout_continuation"],
      },
      candidate_mutation: {
        kind: "risk_multiplier",
        value: 0.75,
      },
      planner_source: {
        family_id: "family-b",
        template_id: "template-b",
        campaign_id: "increase_expectancy",
        campaign_objective: "increase_expectancy",
        auto_enqueued: true,
      },
    });

    await writeJsonAtomic(config.paths.queuePath, createResearchQueue([taskA, taskB]));
    const { boardReport, packageReport } = createBoardAndPackageReports({
      taskIds: [taskA.id, taskB.id],
      baselineId: "baseline-test-live",
    });

    const report = await buildResearchOpportunityReviewReport(config, {
      boardReport,
      packageReport,
      executors: {
        context_filter: async () => ({
          affectedInstruments: ["NAS100"],
          comparison: createComparison(),
          artifacts: {
            aggregateReport: {},
            crisisReport: {},
            walkForwardReport: {},
          },
        }),
        risk_shaping: async () => ({
          affectedInstruments: ["XAUUSD"],
          comparison: createComparison({
            walkForward: {
              baseline: createMetricSummary({ expectancy: 0.01, profitFactor: 1.01 }),
              current: createMetricSummary({ expectancy: 0.14, profitFactor: 1.18, totalTrades: 15 }),
              affectedInstruments: ["XAUUSD"],
            },
          }),
          artifacts: {
            aggregateReport: {},
            crisisReport: {},
            walkForwardReport: {},
          },
        }),
      },
      validateBundle: async ({ candidate }) => ({
        bundle_id: candidate.id,
        baseline_id: candidate.baseline_id,
        task_ids: candidate.task_ids,
        affected_instruments: candidate.affected_instruments,
        campaign_ids: candidate.campaign_ids,
        campaign_objectives: candidate.campaign_objectives,
        primary_campaign_id: candidate.primary_campaign_id,
        primary_campaign_objective: candidate.primary_campaign_objective,
        campaign_mode: candidate.campaign_mode,
        comparison: createComparison(),
        decision: {
          run_id: "bundle-run",
          task_id: candidate.id,
          decision: "candidate",
          reason: "Bundle validated.",
          gates: createComparison().gates,
          promoted_metrics: {},
          ranking: {
            score: 66,
            band: "strong",
            components: {
              aggregate: 20,
              crisis: 18,
              walkForward: 16,
              robustness: 14,
              penalties: -2,
            },
          },
          failure_forensics: null,
        },
        portfolio_stress: null,
      }),
      now: () => new Date("2026-03-21T00:00:00.000Z"),
    });

    expect(report.summary.reviewed_item_count).toBe(2);
    expect(report.bundle.status).toBe("validated");
    expect(report.bundle.decision?.decision).toBe("candidate");
  });
});
