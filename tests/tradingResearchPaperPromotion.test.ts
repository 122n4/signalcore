import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildResearchPaperPromotionSnapshot,
  resolveResearchPaperPromotionApproval,
  writeJsonAtomic,
} from "@/lib/trading/research";
import type { ComposeTradingLiveDecisionInput } from "@/lib/trading/state";

import {
  createResearchConfig,
  createResearchQueue,
  createResearchTask,
  createResearchTempDir,
} from "./helpers/tradingResearchFixtures";

function candidate(overrides: Partial<ComposeTradingLiveDecisionInput> = {}): ComposeTradingLiveDecisionInput {
  return {
    snapshot: {
      instrument: "BTCUSD",
      snapshotAt: "2026-06-29T18:00:00.000Z",
      marketType: "crypto",
      sessionProfile: "crypto",
      availableTimeframes: ["15m"],
      timeframes: {},
    },
    market: {
      instrument: "BTCUSD",
      snapshotAt: "2026-06-29T18:00:00.000Z",
      timeframes: ["15m"],
      structure: { state: "uptrend", direction: "long", score: 70, confidence: 70 },
      regime: { state: "trending", score: 70, confidence: 70 },
      volatility: { state: "normal", score: 65, confidence: 65 },
      session: { marketOpen: true, session: "ny_open", confidence: 80 },
      momentum: { state: "rising", direction: "long", score: 70, confidence: 70 },
      liquidity: { state: "healthy_participation", score: 70, confidence: 70 },
    },
    setupCore: {
      setup: {
        type: "liquidity_sweep_reversal",
        direction: "long",
        triggerLevel: 70000,
        invalidationLevel: 69800,
        confidence: 78,
      },
      maturity: { state: "ready", score: 78, confidence: 78 },
      opportunityWindow: { state: "active", score: 80, confidence: 80 },
      quality: { score: 82, grade: "A", confidence: 82 },
    },
    decisionCore: {
      clarity: { level: "high", score: 80, conflictScore: 10, alignment: 85 },
      bias: { direction: "bullish", score: 75, confidence: 75 },
      environment: { state: "favorable", score: 77, confidence: 77 },
      weighting: { contextProfile: "default", weightedScores: {}, confidence: 78 },
      decision: {
        currentState: "TRADE_VALID",
        primaryMessage: "Ready.",
        confidence: 79,
        reasons: ["ready"],
      },
    },
    executionPlan: {
      entryZone: {
        triggerType: "touch",
        triggerLevel: 70000,
        entryZoneLow: 69950,
        entryZoneHigh: 70050,
      },
      invalidation: {
        invalidationLevel: 69800,
        invalidationType: "hard",
        confidence: 70,
      },
      tradePath: {
        targetZone: "70400",
        primaryPath: "up",
        secondaryPath: null,
        riskRewardEstimate: 2.4,
      },
      riskFraming: {
        riskPct: 0.25,
        sizeAdjustment: 1,
        riskMode: "normal",
      },
      executionStatus: {
        executionStatus: "allowed",
        reasons: [],
        nextDisciplineStep: null,
      },
    },
    scannerSnapshot: {
      source: "provider",
      providerError: null,
      dataSymbol: "BTCUSD",
      dataRelation: "direct",
      snapshotAgeMs: 1000,
      actionableFreshness: true,
      staleReason: null,
    },
    memory: null,
    ...overrides,
  } as ComposeTradingLiveDecisionInput;
}

describe("research paper promotion approval", () => {
  it("approves a candidate when a ready-for-live-review task package matches the task scope", async () => {
    const rootDir = await createResearchTempDir();
    const config = await createResearchConfig(rootDir);
    const task = createResearchTask({
      id: "task-promoted-btc",
      candidate_scope: {
        instruments: ["BTCUSD"],
        sessions: ["ny_open"],
        setup_types: ["liquidity_sweep_reversal"],
        risk_modes: ["normal"],
        execution_statuses: ["allowed"],
        quality_grades: ["A"],
        clarity_levels: ["high"],
        environment_states: ["favorable"],
      },
    });
    await writeJsonAtomic(config.paths.queuePath, createResearchQueue([task]));
    await writeJsonAtomic(
      path.join(config.paths.reportsDir, "packages", "promotion-packages-latest.json"),
      {
        schema_version: "research.promotion-packages-report.v1",
        provenance: { owner: "research_lab", config_path: config.paths.rootDir, live_baseline_id: task.baseline_id, dataset_manifest_hash: "", engine_manifest_hash: "", dataset_refs: [], upstream_report_ids: [] },
        report_id: "promotion-packages-test",
        generated_at: "2026-06-29T18:00:00.000Z",
        live_baseline_id: task.baseline_id,
        summary: {
          package_count: 1,
          review_ready_count: 1,
          bundle_confirmed_count: 0,
          ready_for_live_review_count: 1,
          blocked_count: 0,
        },
        packages: [
          {
            package_id: "pkg-btc",
            generated_at: "2026-06-29T18:00:00.000Z",
            baseline_id: task.baseline_id,
            entry_id: "entry-btc",
            source: "task",
            board_status: "review_ready",
            decision: "promote",
            summary: "Ready.",
            task_ids: [task.id],
            campaign_ids: ["improve_crisis"],
            campaign_objectives: ["improve_crisis"],
            primary_campaign_id: "improve_crisis",
            primary_campaign_objective: "improve_crisis",
            campaign_metadata_source: "recorded",
            campaign_mode: "single",
            run_id: "run-1",
            score: 80,
            band: "elite_watch",
            ranking_metadata_source: "recorded",
            portfolio_stress_passed: true,
            portfolio_stress_overlap_ratio: 0.1,
            portfolio_stress_max_concurrent: 1,
            statistical_validation_passed: true,
            deflated_sharpe_ratio: 0.2,
            pbo_estimate: 0.1,
            white_reality_check_p_value: 0.05,
            aggregate_summary: null,
            crisis_summary: null,
            walkforward_summary: null,
            review: {
              ready_for_live_review: true,
              blockers: [],
              cautions: [],
              checklist: [],
            },
            artifacts: {
              board_report_id: "board-1",
              board_json_path: null,
              board_markdown_path: null,
              bundle_report_id: null,
              bundle_json_path: null,
              bundle_markdown_path: null,
              registry_report_id: null,
              registry_json_path: null,
              run_artifacts: [],
            },
          },
        ],
      },
    );

    const snapshot = await buildResearchPaperPromotionSnapshot(config);
    const approval = await resolveResearchPaperPromotionApproval({
      candidate: candidate(),
      config,
    });

    expect(snapshot?.ready_package_count).toBe(1);
    expect(snapshot?.executable_task_scope_count).toBe(1);
    expect(approval.approved).toBe(true);
    expect(approval.matched_scope?.package_id).toBe("pkg-btc");
  });

  it("blocks when no ready-for-live-review package exists", async () => {
    const rootDir = await createResearchTempDir();
    const config = await createResearchConfig(rootDir);
    await writeJsonAtomic(config.paths.queuePath, createResearchQueue([]));
    await writeJsonAtomic(
      path.join(config.paths.reportsDir, "packages", "promotion-packages-latest.json"),
      {
        schema_version: "research.promotion-packages-report.v1",
        provenance: { owner: "research_lab", config_path: config.paths.rootDir, live_baseline_id: null, dataset_manifest_hash: "", engine_manifest_hash: "", dataset_refs: [], upstream_report_ids: [] },
        report_id: "promotion-packages-empty",
        generated_at: "2026-06-29T18:00:00.000Z",
        live_baseline_id: null,
        summary: {
          package_count: 0,
          review_ready_count: 0,
          bundle_confirmed_count: 0,
          ready_for_live_review_count: 0,
          blocked_count: 0,
        },
        packages: [],
      },
    );

    const approval = await resolveResearchPaperPromotionApproval({
      candidate: candidate(),
      config,
    });

    expect(approval.approved).toBe(false);
    expect(approval.reason).toContain("No Research promotion package is ready");
    expect(approval.source).toBe("local_artifact");
  });

  it("fails closed when a package is marked ready but carries an explicit failed validation gate", async () => {
    const rootDir = await createResearchTempDir();
    const config = await createResearchConfig(rootDir);
    const task = createResearchTask({
      id: "task-invalid-gate",
      candidate_scope: {
        instruments: ["BTCUSD"],
        sessions: ["ny_open"],
        setup_types: ["liquidity_sweep_reversal"],
        risk_modes: ["normal"],
        execution_statuses: ["allowed"],
        quality_grades: ["A"],
        clarity_levels: ["high"],
        environment_states: ["favorable"],
      },
    });

    await writeJsonAtomic(config.paths.queuePath, createResearchQueue([task]));
    await writeJsonAtomic(
      path.join(config.paths.reportsDir, "packages", "promotion-packages-latest.json"),
      {
        schema_version: "research.promotion-packages-report.v1",
        provenance: { owner: "research_lab", config_path: config.paths.rootDir, live_baseline_id: task.baseline_id, dataset_manifest_hash: "", engine_manifest_hash: "", dataset_refs: [], upstream_report_ids: [] },
        report_id: "promotion-packages-explicit-failed-gate",
        generated_at: "2026-06-29T18:00:00.000Z",
        live_baseline_id: task.baseline_id,
        summary: {
          package_count: 1,
          review_ready_count: 1,
          bundle_confirmed_count: 0,
          ready_for_live_review_count: 1,
          blocked_count: 0,
        },
        packages: [
          {
            package_id: "pkg-invalid-gate",
            generated_at: "2026-06-29T18:00:00.000Z",
            baseline_id: task.baseline_id,
            entry_id: "entry-invalid-gate",
            source: "task",
            board_status: "review_ready",
            decision: "promote",
            summary: "Inconsistent ready package.",
            task_ids: [task.id],
            campaign_ids: ["improve_crisis"],
            campaign_objectives: ["improve_crisis"],
            primary_campaign_id: "improve_crisis",
            primary_campaign_objective: "improve_crisis",
            campaign_metadata_source: "recorded",
            campaign_mode: "single",
            run_id: "run-invalid-gate",
            score: 80,
            band: "elite_watch",
            ranking_metadata_source: "recorded",
            portfolio_stress_passed: true,
            portfolio_stress_overlap_ratio: 0.1,
            portfolio_stress_max_concurrent: 1,
            statistical_validation_passed: false,
            deflated_sharpe_ratio: 0.2,
            pbo_estimate: 0.1,
            white_reality_check_p_value: 0.05,
            aggregate_summary: null,
            crisis_summary: null,
            walkforward_summary: null,
            review: {
              ready_for_live_review: true,
              blockers: [],
              cautions: [],
              checklist: [],
            },
            artifacts: {
              board_report_id: "board-invalid-gate",
              board_json_path: null,
              board_markdown_path: null,
              bundle_report_id: null,
              bundle_json_path: null,
              bundle_markdown_path: null,
              registry_report_id: null,
              registry_json_path: null,
              run_artifacts: [],
            },
          },
        ],
      },
    );

    const snapshot = await buildResearchPaperPromotionSnapshot(config);
    const approval = await resolveResearchPaperPromotionApproval({
      candidate: candidate(),
      config,
    });

    expect(snapshot?.ready_package_count).toBe(0);
    expect(snapshot?.executable_task_scope_count).toBe(0);
    expect(approval.approved).toBe(false);
    expect(approval.reason).toContain("No Research promotion package is ready");
  });

  it("fails closed when multiple ready-for-live-review scopes match the same paper candidate", async () => {
    const rootDir = await createResearchTempDir();
    const config = await createResearchConfig(rootDir);
    const broadTask = createResearchTask({
      id: "task-promoted-nas100-broad",
      candidate_scope: {
        instruments: ["NAS100"],
        sessions: ["ny_open"],
        setup_types: ["breakout_continuation"],
      },
    });
    const filteredTask = createResearchTask({
      id: "task-promoted-nas100-bcd",
      candidate_scope: {
        instruments: ["NAS100"],
        sessions: ["ny_open"],
        setup_types: ["breakout_continuation"],
        quality_grades: ["B", "C", "D"],
      },
    });

    await writeJsonAtomic(config.paths.queuePath, createResearchQueue([broadTask, filteredTask]));
    await writeJsonAtomic(
      path.join(config.paths.reportsDir, "packages", "promotion-packages-latest.json"),
      {
        schema_version: "research.promotion-packages-report.v1",
        provenance: {
          owner: "research_lab",
          config_path: config.paths.rootDir,
          live_baseline_id: broadTask.baseline_id,
          dataset_manifest_hash: "",
          engine_manifest_hash: "",
          dataset_refs: [],
          upstream_report_ids: [],
        },
        report_id: "promotion-packages-ambiguous",
        generated_at: "2026-06-29T18:00:00.000Z",
        live_baseline_id: broadTask.baseline_id,
        summary: {
          package_count: 2,
          review_ready_count: 2,
          bundle_confirmed_count: 0,
          ready_for_live_review_count: 2,
          blocked_count: 0,
        },
        packages: [
          {
            package_id: "pkg-nas100-broad",
            generated_at: "2026-06-29T18:00:00.000Z",
            baseline_id: broadTask.baseline_id,
            entry_id: "entry-nas100-broad",
            source: "task",
            board_status: "review_ready",
            decision: "promote",
            summary: "Ready.",
            task_ids: [broadTask.id],
            campaign_ids: ["reduce_drawdown"],
            campaign_objectives: ["reduce_drawdown"],
            primary_campaign_id: "reduce_drawdown",
            primary_campaign_objective: "reduce_drawdown",
            campaign_metadata_source: "recorded",
            campaign_mode: "single",
            run_id: "run-broad",
            score: 80,
            band: "elite_watch",
            ranking_metadata_source: "recorded",
            portfolio_stress_passed: true,
            portfolio_stress_overlap_ratio: 0.1,
            portfolio_stress_max_concurrent: 1,
            statistical_validation_passed: true,
            deflated_sharpe_ratio: 0.2,
            pbo_estimate: 0.1,
            white_reality_check_p_value: 0.05,
            aggregate_summary: null,
            crisis_summary: null,
            walkforward_summary: null,
            review: {
              ready_for_live_review: true,
              blockers: [],
              cautions: [],
              checklist: [],
            },
            artifacts: {
              board_report_id: "board-broad",
              board_json_path: null,
              board_markdown_path: null,
              bundle_report_id: null,
              bundle_json_path: null,
              bundle_markdown_path: null,
              registry_report_id: null,
              registry_json_path: null,
              run_artifacts: [],
            },
          },
          {
            package_id: "pkg-nas100-bcd",
            generated_at: "2026-06-29T18:00:00.000Z",
            baseline_id: filteredTask.baseline_id,
            entry_id: "entry-nas100-bcd",
            source: "task",
            board_status: "review_ready",
            decision: "promote",
            summary: "Ready.",
            task_ids: [filteredTask.id],
            campaign_ids: ["reduce_drawdown"],
            campaign_objectives: ["reduce_drawdown"],
            primary_campaign_id: "reduce_drawdown",
            primary_campaign_objective: "reduce_drawdown",
            campaign_metadata_source: "recorded",
            campaign_mode: "single",
            run_id: "run-bcd",
            score: 79,
            band: "promising",
            ranking_metadata_source: "recorded",
            portfolio_stress_passed: true,
            portfolio_stress_overlap_ratio: 0.1,
            portfolio_stress_max_concurrent: 1,
            statistical_validation_passed: true,
            deflated_sharpe_ratio: 0.2,
            pbo_estimate: 0.1,
            white_reality_check_p_value: 0.05,
            aggregate_summary: null,
            crisis_summary: null,
            walkforward_summary: null,
            review: {
              ready_for_live_review: true,
              blockers: [],
              cautions: [],
              checklist: [],
            },
            artifacts: {
              board_report_id: "board-bcd",
              board_json_path: null,
              board_markdown_path: null,
              bundle_report_id: null,
              bundle_json_path: null,
              bundle_markdown_path: null,
              registry_report_id: null,
              registry_json_path: null,
              run_artifacts: [],
            },
          },
        ],
      },
    );

    const approval = await resolveResearchPaperPromotionApproval({
      candidate: candidate({
        snapshot: {
          instrument: "NAS100",
          snapshotAt: "2026-06-29T18:00:00.000Z",
          marketType: "equities",
          sessionProfile: "ny_equities",
          availableTimeframes: ["15m"],
          timeframes: {},
        },
        market: {
          ...candidate().market,
          instrument: "NAS100",
        },
        setupCore: {
          ...candidate().setupCore,
          setup: {
            ...candidate().setupCore.setup,
            type: "breakout_continuation",
          },
          quality: { score: 75, grade: "B", confidence: 75 },
        },
      }),
      config,
    });

    expect(approval.approved).toBe(false);
    expect(approval.matched_scope).toBeNull();
    expect(approval.reason).toContain("Multiple ready-for-live-review Research promotion scopes match");
  });
});
