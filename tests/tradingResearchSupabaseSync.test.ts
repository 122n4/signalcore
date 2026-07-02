import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildResearchSupabasePayload,
  writeJsonAtomic,
} from "@/lib/trading/research";

import {
  createResearchConfig,
  createResearchQueue,
  createResearchTask,
  createResearchTempDir,
} from "./helpers/tradingResearchFixtures";

describe("trading research supabase sync payload", () => {
  it("includes the canonical paper-promotion snapshot in the mirrored state payload", async () => {
    const rootDir = await createResearchTempDir();
    const config = await createResearchConfig(rootDir);
    const task = createResearchTask({
      id: "task-promoted-btc",
      baseline_id: config.liveBaselineSource.baselineId,
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
        provenance: {
          owner: "research_lab",
          config_path: config.paths.rootDir,
          live_baseline_id: task.baseline_id,
          dataset_manifest_hash: "",
          engine_manifest_hash: "",
          dataset_refs: [],
          upstream_report_ids: [],
        },
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

    const payload = await buildResearchSupabasePayload({
      config,
      runLimit: 5,
      decisionLimit: 5,
    });

    const paperPromotion = payload.stateRow.payload.paperPromotion;
    const promotionReadiness = payload.stateRow.payload.promotionReadiness;
    expect(paperPromotion).not.toBeNull();
    expect(paperPromotion?.ready_package_count).toBe(1);
    expect(paperPromotion?.executable_task_scope_count).toBe(1);
    expect(paperPromotion?.scopes).toHaveLength(1);
    expect(paperPromotion?.scopes[0]?.task_id).toBe(task.id);
    expect(promotionReadiness).not.toBeNull();
    expect(promotionReadiness?.packages?.readyForLiveReviewCount).toBe(1);
    expect(promotionReadiness?.paperGate?.status).toBe("ready");
  });
});
