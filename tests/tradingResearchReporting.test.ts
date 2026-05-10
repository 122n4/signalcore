import { describe, expect, it } from "vitest";

import {
  appendJsonLine,
  buildDailyResearchReport,
  buildResearchCycleReport,
  buildResearchWindowReport,
  writeDailyResearchReport,
  writeJsonAtomic,
  writeResearchCycleReport,
  writeResearchWindowReport,
} from "@/lib/trading/research";

import { createMetricSummary, createResearchConfig, createResearchQueue, createResearchTask, createResearchTempDir } from "./helpers/tradingResearchFixtures";

describe("trading research reporting", () => {
  it("renders a daily report from the decision ledger", async () => {
    const rootDir = await createResearchTempDir();
    const config = await createResearchConfig(rootDir);
    await writeJsonAtomic(config.paths.queuePath, createResearchQueue([
      createResearchTask({ id: "task-pending" }),
    ]));

    await appendJsonLine(config.paths.decisionsPath, {
      event_id: "evt-1",
      timestamp: "2026-03-19T10:00:00.000Z",
      run_id: "run-1",
      task_id: "task-1",
      baseline_id: "baseline-test-live",
      run_fingerprint: "fp-1",
      decision: "promote",
      reason: "Promotion reason.",
      aggregate_summary: createMetricSummary({ profitFactor: 1.7 }),
      crisis_summary: createMetricSummary({ expectancy: -0.02, profitFactor: 1.03 }),
      walkforward_summary: createMetricSummary({ expectancy: 0.06, profitFactor: 1.02 }),
      ranking_score: 72.5,
      ranking_band: "strong",
    });

    const report = await buildDailyResearchReport(config, new Date("2026-03-19T12:00:00.000Z"));
    const outputs = await writeDailyResearchReport(config, report);

    expect(report.promoted).toHaveLength(1);
    expect(report.top_promotions).toHaveLength(1);
    expect(report.fuel_status.active_campaign_count).toBeGreaterThan(0);
    expect(report.fuel_status.campaigns.length).toBeGreaterThan(0);
    expect(report.fuel_status.active_template_count).toBeGreaterThanOrEqual(0);
    expect(report.dataset_health.audit_loaded).toBe(true);
    expect(outputs.jsonPath.endsWith(".json")).toBe(true);
    expect(outputs.markdownPath.endsWith(".md")).toBe(true);
  });

  it("renders a cycle report for the processed runs", async () => {
    const rootDir = await createResearchTempDir();
    const config = await createResearchConfig(rootDir);
    await writeJsonAtomic(
      config.paths.queuePath,
      createResearchQueue([createResearchTask({ id: "task-next" })]),
    );

    await appendJsonLine(config.paths.decisionsPath, {
      event_id: "evt-cycle-1",
      timestamp: "2026-03-19T10:00:00.000Z",
      run_id: "run-cycle-1",
      task_id: "task-cycle-1",
      baseline_id: "baseline-test-live",
      run_fingerprint: "fp-cycle-1",
      decision: "candidate",
      reason: "Cycle candidate.",
      aggregate_summary: createMetricSummary({ profitFactor: 1.6 }),
      crisis_summary: createMetricSummary({ expectancy: -0.01, profitFactor: 1.01 }),
      walkforward_summary: createMetricSummary({ expectancy: 0.03, profitFactor: 1.01 }),
      planner_campaign_id: "increase_expectancy",
      planner_campaign_objective: "increase_expectancy",
      planner_family_id: "risk-core",
      planner_template_id: "auto-risk-template",
      ranking_score: 41.5,
      ranking_band: "promising",
    });

    const report = await buildResearchCycleReport(config, {
      processedRunIds: ["run-cycle-1"],
      autoEnqueuedTaskIds: ["task-auto-1"],
      startedAt: new Date("2026-03-19T09:00:00.000Z"),
      finishedAt: new Date("2026-03-19T11:00:00.000Z"),
    });
    const outputs = await writeResearchCycleReport(config, report);

    expect(report.runs).toHaveLength(1);
    expect(report.runs[0]?.ranking_score).toBe(41.5);
    expect(report.runs[0]?.planner_campaign_id).toBe("increase_expectancy");
    expect(report.auto_enqueued_task_ids).toEqual(["task-auto-1"]);
    expect(report.fuel_status.active_campaign_count).toBeGreaterThan(0);
    expect(report.fuel_status.quota.enabled).toBe(true);
    expect(report.dataset_health.eligible_instrument_count).toBeGreaterThan(0);
    expect(outputs.jsonPath.endsWith(".json")).toBe(true);
    expect(outputs.markdownPath.endsWith(".md")).toBe(true);
  });

  it("renders a rolling window report for the last 8 hours", async () => {
    const rootDir = await createResearchTempDir();
    const config = await createResearchConfig(rootDir);
    config.automation.reportIntervalMs = 8 * 60 * 60 * 1000;
    await writeJsonAtomic(
      config.paths.queuePath,
      createResearchQueue([createResearchTask({ id: "task-window-next" })]),
    );

    await appendJsonLine(config.paths.decisionsPath, {
      event_id: "evt-window-1",
      timestamp: "2026-03-19T04:30:00.000Z",
      run_id: "run-window-1",
      task_id: "task-window-1",
      baseline_id: "baseline-test-live",
      run_fingerprint: "fp-window-1",
      decision: "promote",
      reason: "Window promote.",
      aggregate_summary: createMetricSummary({ profitFactor: 1.8 }),
      crisis_summary: createMetricSummary({ expectancy: 0.01, profitFactor: 1.04 }),
      walkforward_summary: createMetricSummary({ expectancy: 0.07, profitFactor: 1.05 }),
      ranking_score: 88,
      ranking_band: "elite_watch",
    });
    await appendJsonLine(config.paths.decisionsPath, {
      event_id: "evt-window-2",
      timestamp: "2026-03-18T19:00:00.000Z",
      run_id: "run-window-2",
      task_id: "task-window-2",
      baseline_id: "baseline-test-live",
      run_fingerprint: "fp-window-2",
      decision: "reject",
      reason: "Too old for current window.",
      failure_forensics: {
        category: "validation_gate",
        confidence: "high",
        summary: "Candidate was rejected by formal validation gates.",
      },
    });

    const report = await buildResearchWindowReport(config, {
      date: new Date("2026-03-19T06:00:00.000Z"),
    });
    const outputs = await writeResearchWindowReport(config, report);

    expect(report.interval_hours).toBe(8);
    expect(report.runs_started).toBe(1);
    expect(report.promoted).toHaveLength(1);
    expect(report.top_promotions[0]?.band).toBe("elite_watch");
    expect(report.fuel_status.active_campaign_count).toBeGreaterThan(0);
    expect(report.fuel_status.selectable_template_count).toBeGreaterThanOrEqual(0);
    expect(report.dataset_health.audit_loaded).toBe(true);
    expect(outputs.jsonPath.endsWith(".json")).toBe(true);
    expect(outputs.markdownPath.endsWith(".md")).toBe(true);
  });
});
