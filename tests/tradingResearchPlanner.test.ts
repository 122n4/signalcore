import { describe, expect, it } from "vitest";

import { appendJsonLine, autoEnqueueNextResearchTask, readResearchQueue, writeJsonAtomic } from "@/lib/trading/research";

import {
  createResearchConfig,
  createResearchQueue,
  createResearchTask,
  createResearchTempDir,
  writeResearchCampaignLibrary,
  writeResearchCandidateLibrary,
  writeResearchCandidateReserveLibrary,
  writeResearchCoverageAudit,
} from "./helpers/tradingResearchFixtures";

describe("trading research planner", () => {
  it("enqueues the highest-priority supported candidate deterministically", async () => {
    const rootDir = await createResearchTempDir();
    const config = await createResearchConfig(rootDir);
    await writeJsonAtomic(config.paths.queuePath, createResearchQueue([]));
    await writeResearchCandidateLibrary(config, {
      version: 1,
      families: [
        {
          id: "context-low",
          enabled: true,
          priority: 10,
          campaign_id: "reduce_drawdown",
          templates: [
            {
              id: "context-low-template",
              enabled: true,
              type: "context_filter",
              priority: 50,
              dataset_profile: "core_20y",
              validation_profile: "default_live_safe",
              candidate_scope: {
                instruments: ["NAS100"],
                sessions: ["london_ny_overlap"],
                setup_types: ["breakout_continuation"],
              },
              candidate_mutation: {
                kind: "blocked_context",
              },
            },
          ],
        },
        {
          id: "risk-high",
          enabled: true,
          priority: 100,
          campaign_id: "increase_expectancy",
          templates: [
            {
              id: "risk-high-template",
              enabled: true,
              type: "risk_shaping",
              priority: 100,
              dataset_profile: "core_20y",
              validation_profile: "default_live_safe",
              candidate_scope: {
                instruments: ["US500"],
                sessions: ["pre_market"],
                setup_types: ["breakout_continuation"],
              },
              candidate_mutation: {
                kind: "risk_multiplier",
                value: 0.8,
              },
            },
          ],
        },
      ],
    });

    const result = await autoEnqueueNextResearchTask({
      config,
      supportedTypes: new Set(["risk_shaping", "context_filter"]),
      now: () => new Date("2026-03-19T13:00:00.000Z"),
    });

    expect(result.action).toBe("enqueued");
    const queue = await readResearchQueue(config);
    expect(queue.idle_reason).toBeNull();
    expect(queue.tasks).toHaveLength(1);
    expect(queue.tasks[0]?.type).toBe("risk_shaping");
    expect(queue.tasks[0]?.candidate_scope.instruments).toEqual(["US500"]);
    expect(queue.tasks[0]?.run_fingerprint).toBeTruthy();
  });

  it("goes idle with explicit reason when all candidates are deduped for the current baseline", async () => {
    const rootDir = await createResearchTempDir();
    const config = await createResearchConfig(rootDir);
    const existingTask = createResearchTask({
      id: "existing-task",
    });
    await writeJsonAtomic(config.paths.queuePath, createResearchQueue([existingTask]));
    await writeResearchCandidateLibrary(config, {
      version: 1,
      families: [
        {
          id: "risk-core",
          enabled: true,
          priority: 100,
          campaign_id: "improve_crisis",
          templates: [
            {
              id: "existing-template",
              enabled: true,
              type: "risk_shaping",
              priority: 100,
              dataset_profile: "core_20y",
              validation_profile: "default_live_safe",
              candidate_scope: existingTask.candidate_scope,
              candidate_mutation: existingTask.candidate_mutation,
            },
          ],
        },
      ],
    });

    const firstResult = await autoEnqueueNextResearchTask({
      config,
      supportedTypes: new Set(["risk_shaping"]),
      now: () => new Date("2026-03-19T13:00:00.000Z"),
    });

    expect(firstResult.action).toBe("idle");
    if (firstResult.action === "idle") {
      expect(firstResult.reason).toBe("all_candidates_deduped_for_current_baseline");
    }
    const queue = await readResearchQueue(config);
    expect(queue.idle_reason).toBe("all_candidates_deduped_for_current_baseline");
    expect(queue.tasks).toHaveLength(1);
  });

  it("uses ledger-derived family memory to prefer untouched families before rejected ones", async () => {
    const rootDir = await createResearchTempDir();
    const config = await createResearchConfig(rootDir);
    await writeJsonAtomic(config.paths.queuePath, createResearchQueue([]));
    await appendJsonLine(config.paths.decisionsPath, {
      event_id: "evt-reject-risk-family",
      timestamp: "2026-03-19T12:00:00.000Z",
      run_id: "run-risk-reject",
      task_id: "task-auto-risk-family-template-old",
      baseline_id: "baseline-test-live",
      run_fingerprint: "fp-risk-reject",
      decision: "reject",
      reason: "Rejected in prior cycle.",
      planner_family_id: "risk-family",
      planner_template_id: "risk-family-template-old",
    });
    await writeResearchCandidateLibrary(config, {
      version: 1,
      families: [
        {
          id: "risk-family",
          enabled: true,
          priority: 100,
          campaign_id: "increase_expectancy",
          templates: [
            {
              id: "risk-family-template-new",
              enabled: true,
              type: "risk_shaping",
              priority: 100,
              dataset_profile: "core_20y",
              validation_profile: "default_live_safe",
              candidate_scope: {
                instruments: ["US500"],
                sessions: ["pre_market"],
                setup_types: ["breakout_continuation"],
              },
              candidate_mutation: {
                kind: "risk_multiplier",
                value: 0.8,
              },
            },
          ],
        },
        {
          id: "context-family",
          enabled: true,
          priority: 80,
          campaign_id: "increase_expectancy",
          templates: [
            {
              id: "context-family-template",
              enabled: true,
              type: "context_filter",
              priority: 100,
              dataset_profile: "core_20y",
              validation_profile: "default_live_safe",
              candidate_scope: {
                instruments: ["NAS100"],
                sessions: ["london_ny_overlap"],
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

    const result = await autoEnqueueNextResearchTask({
      config,
      supportedTypes: new Set(["risk_shaping", "context_filter"]),
      now: () => new Date("2026-03-19T13:00:00.000Z"),
    });

    expect(result.action).toBe("enqueued");
    const queue = await readResearchQueue(config);
    expect(queue.tasks).toHaveLength(1);
    expect(queue.tasks[0]?.planner_source?.family_id).toBe("context-family");
    expect(queue.tasks[0]?.type).toBe("context_filter");
  });

  it("cools down templates with repeated recent rejects before picking the next candidate", async () => {
    const rootDir = await createResearchTempDir();
    const config = await createResearchConfig(rootDir);
    await writeJsonAtomic(config.paths.queuePath, createResearchQueue([]));
    await appendJsonLine(config.paths.decisionsPath, {
      event_id: "evt-template-reject-1",
      timestamp: "2026-03-19T12:00:00.000Z",
      run_id: "run-template-reject-1",
      task_id: "task-template-reject-1",
      baseline_id: "baseline-test-live",
      run_fingerprint: "fp-template-reject-1",
      decision: "reject",
      reason: "Recent weak reject.",
      planner_family_id: "risk-family",
      planner_template_id: "risk-template-hot",
      planner_campaign_id: "increase_expectancy",
    });
    await appendJsonLine(config.paths.decisionsPath, {
      event_id: "evt-template-reject-2",
      timestamp: "2026-03-19T12:30:00.000Z",
      run_id: "run-template-reject-2",
      task_id: "task-template-reject-2",
      baseline_id: "baseline-test-live",
      run_fingerprint: "fp-template-reject-2",
      decision: "reject",
      reason: "Recent weak reject again.",
      planner_family_id: "risk-family",
      planner_template_id: "risk-template-hot",
      planner_campaign_id: "increase_expectancy",
    });
    await writeResearchCandidateLibrary(config, {
      version: 1,
      families: [
        {
          id: "risk-family",
          enabled: true,
          priority: 100,
          campaign_id: "increase_expectancy",
          templates: [
            {
              id: "risk-template-hot",
              enabled: true,
              type: "risk_shaping",
              priority: 100,
              dataset_profile: "core_20y",
              validation_profile: "default_live_safe",
              candidate_scope: {
                instruments: ["US500"],
                sessions: ["pre_market"],
                setup_types: ["breakout_continuation"],
              },
              candidate_mutation: {
                kind: "risk_multiplier",
                value: 0.8,
              },
            },
            {
              id: "risk-template-fresh",
              enabled: true,
              type: "risk_shaping",
              priority: 90,
              dataset_profile: "core_20y",
              validation_profile: "default_live_safe",
              candidate_scope: {
                instruments: ["EURUSD"],
                sessions: ["london_session"],
                setup_types: ["breakout_continuation"],
              },
              candidate_mutation: {
                kind: "risk_multiplier",
                value: 0.75,
              },
            },
          ],
        },
      ],
    });

    const result = await autoEnqueueNextResearchTask({
      config,
      supportedTypes: new Set(["risk_shaping"]),
      now: () => new Date("2026-03-19T13:00:00.000Z"),
    });

    expect(result.action).toBe("enqueued");
    const queue = await readResearchQueue(config);
    expect(queue.tasks[0]?.planner_source?.template_id).toBe("risk-template-fresh");
    expect(queue.tasks[0]?.candidate_scope.instruments).toEqual(["EURUSD"]);
  });

  it("prefers families with proven completed history over equally clean untouched ones", async () => {
    const rootDir = await createResearchTempDir();
    const config = await createResearchConfig(rootDir);
    await writeJsonAtomic(config.paths.queuePath, createResearchQueue([]));
    await appendJsonLine(config.paths.decisionsPath, {
      event_id: "evt-proven-family",
      timestamp: "2026-03-19T11:00:00.000Z",
      run_id: "run-proven-family",
      task_id: "task-proven-family",
      baseline_id: "baseline-test-live",
      run_fingerprint: "fp-proven-family",
      decision: "candidate",
      reason: "Completed prior cycle cleanly.",
      planner_family_id: "proven-family",
      planner_template_id: "proven-template-old",
      planner_campaign_id: "increase_expectancy",
    });
    await writeResearchCandidateLibrary(config, {
      version: 1,
      families: [
        {
          id: "untouched-family",
          enabled: true,
          priority: 100,
          campaign_id: "increase_expectancy",
          templates: [
            {
              id: "untouched-template",
              enabled: true,
              type: "risk_shaping",
              priority: 100,
              dataset_profile: "core_20y",
              validation_profile: "default_live_safe",
              candidate_scope: {
                instruments: ["US500"],
                sessions: ["pre_market"],
                setup_types: ["breakout_continuation"],
              },
              candidate_mutation: {
                kind: "risk_multiplier",
                value: 0.8,
              },
            },
          ],
        },
        {
          id: "proven-family",
          enabled: true,
          priority: 100,
          campaign_id: "increase_expectancy",
          templates: [
            {
              id: "proven-template-new",
              enabled: true,
              type: "risk_shaping",
              priority: 100,
              dataset_profile: "core_20y",
              validation_profile: "default_live_safe",
              candidate_scope: {
                instruments: ["EURUSD"],
                sessions: ["london_session"],
                setup_types: ["breakout_continuation"],
              },
              candidate_mutation: {
                kind: "risk_multiplier",
                value: 0.8,
              },
            },
          ],
        },
      ],
    });

    const result = await autoEnqueueNextResearchTask({
      config,
      supportedTypes: new Set(["risk_shaping"]),
      now: () => new Date("2026-03-19T13:00:00.000Z"),
    });

    expect(result.action).toBe("enqueued");
    const queue = await readResearchQueue(config);
    expect(queue.tasks[0]?.planner_source?.family_id).toBe("proven-family");
    expect(queue.tasks[0]?.candidate_scope.instruments).toEqual(["EURUSD"]);
  });

  it("applies a soft family quota before falling back to the full pool", async () => {
    const rootDir = await createResearchTempDir();
    const config = await createResearchConfig(rootDir);
    config.automation.familyQuota = {
      enabled: true,
      maxSelectionsPerWindow: 2,
      decisionWindowSize: 4,
    };
    await writeJsonAtomic(config.paths.queuePath, createResearchQueue([]));
    await appendJsonLine(config.paths.decisionsPath, {
      event_id: "evt-quota-1",
      timestamp: "2026-03-19T09:00:00.000Z",
      run_id: "run-quota-1",
      task_id: "task-quota-1",
      baseline_id: "baseline-test-live",
      run_fingerprint: "fp-quota-1",
      decision: "reject",
      reason: "Recent family usage.",
      planner_family_id: "risk-family",
      planner_template_id: "risk-family-template-old-1",
    });
    await appendJsonLine(config.paths.decisionsPath, {
      event_id: "evt-quota-2",
      timestamp: "2026-03-19T10:00:00.000Z",
      run_id: "run-quota-2",
      task_id: "task-quota-2",
      baseline_id: "baseline-test-live",
      run_fingerprint: "fp-quota-2",
      decision: "candidate",
      reason: "Recent family usage again.",
      planner_family_id: "risk-family",
      planner_template_id: "risk-family-template-old-2",
    });
    await writeResearchCandidateLibrary(config, {
      version: 1,
      families: [
        {
          id: "risk-family",
          enabled: true,
          priority: 100,
          campaign_id: "increase_expectancy",
          templates: [
            {
              id: "risk-family-template-new",
              enabled: true,
              type: "risk_shaping",
              priority: 100,
              dataset_profile: "core_20y",
              validation_profile: "default_live_safe",
              candidate_scope: {
                instruments: ["US500"],
                sessions: ["pre_market"],
                setup_types: ["breakout_continuation"],
              },
              candidate_mutation: {
                kind: "risk_multiplier",
                value: 0.8,
              },
            },
          ],
        },
        {
          id: "context-family",
          enabled: true,
          priority: 90,
          campaign_id: "reduce_drawdown",
          templates: [
            {
              id: "context-family-template",
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

    const result = await autoEnqueueNextResearchTask({
      config,
      supportedTypes: new Set(["risk_shaping", "context_filter"]),
      now: () => new Date("2026-03-19T13:00:00.000Z"),
    });

    expect(result.action).toBe("enqueued");
    const queue = await readResearchQueue(config);
    expect(queue.tasks[0]?.planner_source?.family_id).toBe("context-family");
  });

  it("replenishes the active library from reserve before going idle", async () => {
    const rootDir = await createResearchTempDir();
    const config = await createResearchConfig(rootDir);
    const existingTask = createResearchTask({ id: "existing-task" });
    await writeJsonAtomic(config.paths.queuePath, createResearchQueue([existingTask]));
    await writeResearchCandidateLibrary(config, {
      version: 1,
      families: [
        {
          id: "risk-core",
          enabled: true,
          priority: 100,
          campaign_id: "improve_crisis",
          templates: [
            {
              id: "existing-template",
              enabled: true,
              type: "risk_shaping",
              priority: 100,
              dataset_profile: "core_20y",
              validation_profile: "default_live_safe",
              candidate_scope: existingTask.candidate_scope,
              candidate_mutation: existingTask.candidate_mutation,
            },
          ],
        },
      ],
    });
    await writeResearchCandidateReserveLibrary(config, {
      version: 1,
      families: [
        {
          id: "reserve-family",
          enabled: true,
          priority: 90,
          campaign_id: "reduce_drawdown",
          templates: [
            {
              id: "reserve-template",
              enabled: true,
              type: "context_filter",
              priority: 100,
              dataset_profile: "core_20y",
              validation_profile: "default_live_safe",
              candidate_scope: {
                instruments: ["US500"],
                sessions: ["pre_market"],
                setup_types: ["breakout_continuation"],
                quality_grades: ["B", "C", "D"],
                clarity_levels: ["medium"],
              },
              candidate_mutation: {
                kind: "blocked_context",
              },
            },
          ],
        },
      ],
    });

    const result = await autoEnqueueNextResearchTask({
      config,
      supportedTypes: new Set(["risk_shaping", "context_filter"]),
      now: () => new Date("2026-03-19T13:00:00.000Z"),
    });

    expect(result.action).toBe("enqueued");
    const queue = await readResearchQueue(config);
    expect(queue.idle_reason).toBeNull();
    expect(queue.tasks).toHaveLength(2);
    expect(queue.tasks[1]?.planner_source?.family_id).toBe("reserve-family");
  });

  it("filters out candidates for instruments that fail the coverage audit", async () => {
    const rootDir = await createResearchTempDir();
    const config = await createResearchConfig(rootDir);
    await writeJsonAtomic(config.paths.queuePath, createResearchQueue([]));
    await writeResearchCoverageAudit(config, {
      generatedAt: "2026-03-15T00:00:00.000Z",
      request: {
        instruments: ["EURUSD", "BTCUSD"],
        periods: [],
        timeframes: ["4h", "1h", "15m"],
        sourcePreference: "local_only",
      },
      entries: [],
      summary: {
        byInstrument: {
          EURUSD: { validPeriods: 6, invalidPeriods: 0, failedPeriods: 0, sources: ["local_archive"] },
          BTCUSD: { validPeriods: 2, invalidPeriods: 3, failedPeriods: 1, sources: ["local_archive"] },
        },
        byPeriod: {},
        failures: [],
      },
    });
    await writeResearchCandidateLibrary(config, {
      version: 1,
      families: [
        {
          id: "risk-family",
          enabled: true,
          priority: 100,
          campaign_id: "increase_expectancy",
          templates: [
            {
              id: "btcusd-template",
              enabled: true,
              type: "risk_shaping",
              priority: 100,
              dataset_profile: "core_20y",
              validation_profile: "default_live_safe",
              candidate_scope: {
                instruments: ["BTCUSD"],
                sessions: ["weekend_drift"],
                setup_types: ["breakout_continuation"],
              },
              candidate_mutation: {
                kind: "risk_multiplier",
                value: 0.8,
              },
            },
            {
              id: "eurusd-template",
              enabled: true,
              type: "risk_shaping",
              priority: 90,
              dataset_profile: "core_20y",
              validation_profile: "default_live_safe",
              candidate_scope: {
                instruments: ["EURUSD"],
                sessions: ["london_session"],
                setup_types: ["breakout_continuation"],
              },
              candidate_mutation: {
                kind: "risk_multiplier",
                value: 0.8,
              },
            },
          ],
        },
      ],
    });

    const result = await autoEnqueueNextResearchTask({
      config,
      supportedTypes: new Set(["risk_shaping"]),
      now: () => new Date("2026-03-19T13:00:00.000Z"),
    });

    expect(result.action).toBe("enqueued");
    const queue = await readResearchQueue(config);
    expect(queue.tasks).toHaveLength(1);
    expect(queue.tasks[0]?.candidate_scope.instruments).toEqual(["EURUSD"]);
  });

  it("prefers the higher-priority enabled campaign before family priority", async () => {
    const rootDir = await createResearchTempDir();
    const config = await createResearchConfig(rootDir);
    await writeJsonAtomic(config.paths.queuePath, createResearchQueue([]));
    await writeResearchCampaignLibrary(config, {
      version: 1,
      campaigns: [
        {
          id: "low-campaign",
          enabled: true,
          objective: "reduce_drawdown",
          priority: 40,
        },
        {
          id: "high-campaign",
          enabled: true,
          objective: "increase_expectancy",
          priority: 100,
        },
      ],
    });
    await writeResearchCandidateLibrary(config, {
      version: 1,
      families: [
        {
          id: "strong-family-low-campaign",
          enabled: true,
          priority: 100,
          campaign_id: "low-campaign",
          templates: [
            {
              id: "low-campaign-template",
              enabled: true,
              type: "risk_shaping",
              priority: 100,
              dataset_profile: "core_20y",
              validation_profile: "default_live_safe",
              candidate_scope: {
                instruments: ["NAS100"],
                sessions: ["ny_open"],
                setup_types: ["breakout_continuation"],
              },
              candidate_mutation: {
                kind: "risk_multiplier",
                value: 0.8,
              },
            },
          ],
        },
        {
          id: "weaker-family-high-campaign",
          enabled: true,
          priority: 80,
          campaign_id: "high-campaign",
          templates: [
            {
              id: "high-campaign-template",
              enabled: true,
              type: "risk_shaping",
              priority: 90,
              dataset_profile: "core_20y",
              validation_profile: "default_live_safe",
              candidate_scope: {
                instruments: ["EURUSD"],
                sessions: ["london_session"],
                setup_types: ["breakout_continuation"],
              },
              candidate_mutation: {
                kind: "risk_multiplier",
                value: 0.8,
              },
            },
          ],
        },
      ],
    });

    const result = await autoEnqueueNextResearchTask({
      config,
      supportedTypes: new Set(["risk_shaping"]),
      now: () => new Date("2026-03-19T13:00:00.000Z"),
    });

    expect(result.action).toBe("enqueued");
    const queue = await readResearchQueue(config);
    expect(queue.tasks[0]?.planner_source?.campaign_id).toBe("high-campaign");
    expect(queue.tasks[0]?.candidate_scope.instruments).toEqual(["EURUSD"]);
  });

  it("goes idle when no candidate resolves to an enabled campaign", async () => {
    const rootDir = await createResearchTempDir();
    const config = await createResearchConfig(rootDir);
    await writeJsonAtomic(config.paths.queuePath, createResearchQueue([]));
    await writeResearchCampaignLibrary(config, {
      version: 1,
      campaigns: [
        {
          id: "disabled-campaign",
          enabled: false,
          objective: "increase_expectancy",
          priority: 100,
        },
      ],
    });
    await writeResearchCandidateLibrary(config, {
      version: 1,
      families: [
        {
          id: "risk-family",
          enabled: true,
          priority: 100,
          campaign_id: "disabled-campaign",
          templates: [
            {
              id: "risk-template",
              enabled: true,
              type: "risk_shaping",
              priority: 100,
              dataset_profile: "core_20y",
              validation_profile: "default_live_safe",
              candidate_scope: {
                instruments: ["NAS100"],
                sessions: ["ny_open"],
                setup_types: ["breakout_continuation"],
              },
              candidate_mutation: {
                kind: "risk_multiplier",
                value: 0.8,
              },
            },
          ],
        },
      ],
    });

    const result = await autoEnqueueNextResearchTask({
      config,
      supportedTypes: new Set(["risk_shaping"]),
      now: () => new Date("2026-03-19T13:00:00.000Z"),
    });

    expect(result.action).toBe("idle");
    if (result.action === "idle") {
      expect(result.reason).toBe("no_campaign_qualified_candidates");
    }
  });
});
