import path from "node:path";

import { describe, expect, it } from "vitest";

import { processResearchQueue, readJsonFile, readResearchQueue, writeJsonAtomic } from "@/lib/trading/research";
import {
  buildMetricSummary,
  buildResearchContextScenarioFromTask,
  buildResearchRiskScenarioFromTask,
} from "@/lib/trading/research/runner";

import {
  createMetricSummary,
  createResearchConfig,
  createResearchQueue,
  createResearchTask,
  createResearchTempDir,
  writeResearchCandidateLibrary,
} from "./helpers/tradingResearchFixtures";

const stubOpportunityRefresh = async () => ({
  bundle: {
    refreshed: true,
    jsonPath: "stub-bundle.json",
    markdownPath: "stub-bundle.md",
  },
  board: {
    jsonPath: "stub-board.json",
    markdownPath: "stub-board.md",
  },
  packages: {
    jsonPath: "stub-packages.json",
    markdownPath: "stub-packages.md",
  },
  review: {
    jsonPath: "stub-review.json",
    markdownPath: "stub-review.md",
  },
  datasetHealth: {
    jsonPath: "stub-dataset-health.json",
    markdownPath: "stub-dataset-health.md",
  },
});

describe("trading research runner", () => {
  it("coerces null or partial metric summaries without crashing", () => {
    expect(buildMetricSummary(undefined)).toEqual({
      totalTrades: 0,
      annualizedTrades: null,
      winRate: 0,
      averageRiskReward: null,
      expectancy: 0,
      profitFactor: null,
      maxDrawdown: 0,
    });

    expect(buildMetricSummary({ totalTrades: 12, expectancy: 0.14 })).toEqual({
      totalTrades: 12,
      annualizedTrades: null,
      winRate: 0,
      averageRiskReward: null,
      expectancy: 0.14,
      profitFactor: null,
      maxDrawdown: 0,
    });

    expect(
      buildMetricSummary(
        { totalTrades: 600, expectancy: 0.14 },
        [
          {
            label: "2024",
            from: "2024-01-01T00:00:00.000Z",
            to: "2024-12-31T23:59:59.000Z",
          },
          {
            label: "2025",
            from: "2025-01-01T00:00:00.000Z",
            to: "2025-12-31T23:59:59.000Z",
          },
        ],
      ).annualizedTrades,
    ).toBeCloseTo(300, 0);

    expect(
      buildMetricSummary(
        { totalTrades: 243, annualizedTrades: null },
        [
          {
            label: "2020",
            from: "2020-01-01T00:00:00.000Z",
            to: "2020-12-31T23:59:59.000Z",
          },
          {
            label: "2021",
            from: "2021-01-01T00:00:00.000Z",
            to: "2021-12-31T23:59:59.000Z",
          },
          {
            label: "2022",
            from: "2022-01-01T00:00:00.000Z",
            to: "2022-12-31T23:59:59.000Z",
          },
          {
            label: "2023",
            from: "2023-01-01T00:00:00.000Z",
            to: "2023-12-31T23:59:59.000Z",
          },
          {
            label: "2024",
            from: "2024-01-01T00:00:00.000Z",
            to: "2024-12-31T23:59:59.000Z",
          },
          {
            label: "2025",
            from: "2025-01-01T00:00:00.000Z",
            to: "2025-12-31T23:59:59.000Z",
          },
        ],
      ).annualizedTrades,
    ).toBeCloseTo(40.5, 1);
  });

  it("expands research task scopes across every targeted instrument", () => {
    const riskScenario = buildResearchRiskScenarioFromTask({
      task: createResearchTask({
        id: "task-multi-risk",
        candidate_scope: {
          instruments: ["BTCUSD", "ETHUSD"],
          sessions: ["weekend_drift"],
          setup_types: ["breakout_continuation"],
          environment_states: ["neutral", "unfavorable"],
        },
        candidate_mutation: {
          kind: "risk_multiplier",
          value: 0.72,
        },
      }),
      fallbackInstruments: ["NAS100"],
    });

    expect(riskScenario.rules.map((rule) => rule.instrument)).toEqual(["BTCUSD", "ETHUSD"]);
    expect(riskScenario.rules.every((rule) => rule.riskMultiplier === 0.72)).toBe(true);
    expect(riskScenario.rules.every((rule) => rule.environmentStates?.includes("unfavorable"))).toBe(true);

    const contextScenario = buildResearchContextScenarioFromTask({
      task: createResearchTask({
        id: "task-portfolio-context",
        type: "context_filter",
        candidate_scope: {
          sessions: ["ny_open"],
          setup_types: ["breakout_continuation"],
        },
        candidate_mutation: {
          kind: "blocked_context",
        },
      }),
      fallbackInstruments: ["NAS100", "US500"],
    });

    expect(contextScenario.rules.map((rule) => rule.instrument)).toEqual(["NAS100", "US500"]);
    expect(contextScenario.rules.every((rule) => rule.sessions?.includes("ny_open"))).toBe(true);
  });

  it("processes tasks sequentially end-to-end and writes artifacts", async () => {
    const rootDir = await createResearchTempDir();
    const config = await createResearchConfig(rootDir);
    const queue = createResearchQueue([
      createResearchTask({
        id: "task-b",
        priority: 50,
        candidate_scope: {
          instruments: ["US500"],
          sessions: ["pre_market"],
          setup_types: ["breakout_continuation"],
        },
        candidate_mutation: {
          kind: "risk_multiplier",
          value: 0.5,
        },
      }),
      createResearchTask({ id: "task-a", priority: 100 }),
    ]);
    await writeJsonAtomic(config.paths.queuePath, queue);

    const executed: string[] = [];

    const result = await processResearchQueue(config, {
      executors: {
        risk_shaping: async ({ task }) => {
          executed.push(task.id);
          return {
            affectedInstruments: ["NAS100"],
            comparison: {
              aggregate: {
                baseline: createMetricSummary(),
                current: createMetricSummary({ profitFactor: 1.62, maxDrawdown: 3.8 }),
              },
              crisis: {
                baseline: createMetricSummary({ expectancy: -0.05, profitFactor: 0.98, maxDrawdown: 5 }),
                current: createMetricSummary({ expectancy: -0.02, profitFactor: 1.05, maxDrawdown: 4.6 }),
              },
              walkForward: {
                baseline: createMetricSummary({ expectancy: 0.05, profitFactor: 1.01, maxDrawdown: 2.4 }),
                current: createMetricSummary({ expectancy: 0.08, profitFactor: 1.04, maxDrawdown: 2.2 }),
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
                aggregateImproved: true,
                crisisImproved: true,
                walkForwardImproved: true,
                promotionThresholdMet: true,
                allHardGatesPass: true,
              },
            },
            artifacts: {
              aggregateReport: { ok: true, type: "aggregate" },
              crisisReport: { ok: true, type: "crisis" },
              walkForwardReport: { ok: true, type: "walkforward" },
            },
          };
        },
      },
      now: () => new Date("2026-03-19T10:00:00.000Z"),
      pid: () => 4242,
      postCycleOpportunityRefresh: stubOpportunityRefresh,
    });

    expect(result.autoEnqueuedTaskIds).toEqual([]);
    expect(result.reportOutputs).not.toBeNull();
    expect(executed).toEqual(["task-a", "task-b"]);

    const updatedQueue = await readResearchQueue(config);
    expect(updatedQueue.tasks.every((task) => task.status === "completed")).toBe(true);
    expect(updatedQueue.tasks.every((task) => task.decision === "promote")).toBe(true);

    const runDirs = updatedQueue.tasks.map((task) =>
      path.join(config.paths.runsDir, task.last_run_id as string),
    );
    for (const runDir of runDirs) {
      const decision = await readJsonFile<{ decision: string }>(path.join(runDir, "decision.json"));
      expect(decision.decision).toBe("promote");
    }

    const cycleReport = await readJsonFile<{ processed_run_ids: string[] }>(
      result.reportOutputs!.cycle.jsonPath,
    );
    expect(cycleReport.processed_run_ids).toHaveLength(2);
    expect(result.reportOutputs!.bundle?.refreshed).toBe(true);
    expect(result.reportOutputs!.bundle?.jsonPath).toBe("stub-bundle.json");
    expect(result.reportOutputs!.board.jsonPath).toBe("stub-board.json");
    expect(result.reportOutputs!.packages.jsonPath).toBe("stub-packages.json");
    expect(result.reportOutputs!.review?.jsonPath).toBe("stub-review.json");
    expect(result.reportOutputs!.datasetHealth.jsonPath).toBe("stub-dataset-health.json");

    const dailyReport = await readJsonFile<{ promoted: Array<unknown> }>(
      result.reportOutputs!.daily.jsonPath,
    );
    expect(Array.isArray(dailyReport.promoted)).toBe(true);
  }, 15000);

  it("blocks invalid tasks before execution when no effective instrument can be resolved", async () => {
    const rootDir = await createResearchTempDir();
    const config = await createResearchConfig(rootDir);
    config.study.instruments = [];
    await writeJsonAtomic(
      config.paths.queuePath,
      createResearchQueue([
        createResearchTask({
          id: "task-invalid-scope",
          candidate_scope: {
            instruments: [],
            sessions: ["london_ny_overlap"],
            setup_types: ["breakout_continuation"],
          },
        }),
      ]),
    );

    await processResearchQueue(config, {
      executors: {
        risk_shaping: async () => {
          throw new Error("should not execute");
        },
      },
      postCycleOpportunityRefresh: stubOpportunityRefresh,
    });

    const queue = await readResearchQueue(config);
    expect(queue.tasks[0].status).toBe("blocked");
    expect(queue.tasks[0].error).toContain("must target at least one instrument");
  });

  it("writes a complete failure artifact contract when execution crashes", async () => {
    const rootDir = await createResearchTempDir();
    const config = await createResearchConfig(rootDir);
    await writeJsonAtomic(
      config.paths.queuePath,
      createResearchQueue([createResearchTask({ id: "task-failure-artifacts" })]),
    );

    await processResearchQueue(config, {
      executors: {
        risk_shaping: async ({ reportProgress }) => {
          await reportProgress?.({
            stage: "robustness",
            progress_note: "About to fail inside robustness stage.",
            completed_stages: ["aggregate", "crisis", "walkforward"],
          });
          throw new Error("Synthetic robustness timeout failure.");
        },
      },
      postCycleOpportunityRefresh: stubOpportunityRefresh,
    });

    const queue = await readResearchQueue(config);
    const runId = queue.tasks[0].last_run_id as string;
    const runDir = path.join(config.paths.runsDir, runId);
    const decision = await readJsonFile<{ decision: string; operational_failure?: boolean }>(
      path.join(runDir, "decision.json"),
    );
    const status = await readJsonFile<{ status: string; failed_stage: string | null }>(
      path.join(runDir, "status.json"),
    );
    const checksums = await readJsonFile<Record<string, string>>(path.join(runDir, "checksums.json"));

    expect(queue.tasks[0].status).toBe("failed");
    expect(decision.decision).toBe("reject");
    expect(decision.operational_failure).toBe(true);
    expect(status.status).toBe("failed");
    expect(status.failed_stage).toBe("robustness");
    expect(Object.keys(checksums)).toEqual(
      expect.arrayContaining([
        "manifest.json",
        "input.json",
        "status.json",
        "aggregate-report.json",
        "crisis-report.json",
        "walkforward-report.json",
        "comparison.json",
        "decision.json",
      ]),
    );
  }, 15000);

  it("reuses an existing fingerprinted run instead of executing the same candidate twice", async () => {
    const rootDir = await createResearchTempDir();
    const config = await createResearchConfig(rootDir);
    const queue = createResearchQueue([
      createResearchTask({ id: "task-1" }),
      createResearchTask({ id: "task-2", created_at: "2026-03-19T10:01:00.000Z" }),
    ]);
    await writeJsonAtomic(config.paths.queuePath, queue);

    let executionCount = 0;

    const result = await processResearchQueue(config, {
      executors: {
        risk_shaping: async () => {
          executionCount += 1;
          return {
            affectedInstruments: ["NAS100"],
            comparison: {
              aggregate: {
                baseline: createMetricSummary(),
                current: createMetricSummary({ profitFactor: 1.6, maxDrawdown: 3.9 }),
              },
              crisis: {
                baseline: createMetricSummary({ expectancy: -0.05, profitFactor: 0.98, maxDrawdown: 5 }),
                current: createMetricSummary({ expectancy: -0.02, profitFactor: 1.01, maxDrawdown: 4.8 }),
              },
              walkForward: {
                baseline: createMetricSummary({ expectancy: 0.05, profitFactor: 1.01, maxDrawdown: 2.4 }),
                current: createMetricSummary({ expectancy: 0.06, profitFactor: 1.02, maxDrawdown: 2.3 }),
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
                aggregateImproved: true,
                crisisImproved: true,
                walkForwardImproved: true,
                promotionThresholdMet: true,
                allHardGatesPass: true,
              },
            },
            artifacts: {
              aggregateReport: { ok: true },
              crisisReport: { ok: true },
              walkForwardReport: { ok: true },
            },
          };
        },
      },
      now: () => new Date("2026-03-19T10:00:00.000Z"),
      pid: () => 5151,
      postCycleOpportunityRefresh: stubOpportunityRefresh,
    });

    expect(executionCount).toBe(1);
    expect(result.reportOutputs).not.toBeNull();
  }, 15000);

  it("keeps the research lock heartbeat alive during a long-running task", async () => {
    const rootDir = await createResearchTempDir();
    const config = await createResearchConfig(rootDir);
    config.timing.heartbeatIntervalMs = 10;
    await writeJsonAtomic(
      config.paths.queuePath,
      createResearchQueue([createResearchTask({ id: "task-heartbeat" })]),
    );

    let observedHeartbeatUpdate = false;

    await processResearchQueue(config, {
      executors: {
        risk_shaping: async ({ config: executorConfig }) => {
          const initialLock = await readJsonFile<{ heartbeat_at: string; run_id: string }>(
            executorConfig.paths.lockPath,
          );
          const initialStatus = await readJsonFile<{ updated_at: string }>(
            path.join(executorConfig.paths.runsDir, initialLock.run_id, "status.json"),
          );
          const startedAt = Date.now();
          while (Date.now() - startedAt < 500) {
            await new Promise((resolve) => setTimeout(resolve, 25));
            const updatedLock = await readJsonFile<{ heartbeat_at: string; run_id: string }>(
              executorConfig.paths.lockPath,
            );
            const updatedStatus = await readJsonFile<{ updated_at: string }>(
              path.join(executorConfig.paths.runsDir, updatedLock.run_id, "status.json"),
            );
            observedHeartbeatUpdate =
              updatedLock.heartbeat_at !== initialLock.heartbeat_at &&
              updatedStatus.updated_at !== initialStatus.updated_at;

            if (observedHeartbeatUpdate) break;
          }

          return {
            affectedInstruments: ["NAS100"],
            comparison: {
              aggregate: {
                baseline: createMetricSummary(),
                current: createMetricSummary({ profitFactor: 1.62, maxDrawdown: 3.8 }),
              },
              crisis: {
                baseline: createMetricSummary({ expectancy: -0.05, profitFactor: 0.98, maxDrawdown: 5 }),
                current: createMetricSummary({ expectancy: -0.02, profitFactor: 1.05, maxDrawdown: 4.6 }),
              },
              walkForward: {
                baseline: createMetricSummary({ expectancy: 0.05, profitFactor: 1.01, maxDrawdown: 2.4 }),
                current: createMetricSummary({ expectancy: 0.08, profitFactor: 1.04, maxDrawdown: 2.2 }),
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
                aggregateImproved: true,
                crisisImproved: true,
                walkForwardImproved: true,
                promotionThresholdMet: true,
                allHardGatesPass: true,
              },
            },
            artifacts: {
              aggregateReport: { ok: true },
              crisisReport: { ok: true },
              walkForwardReport: { ok: true },
            },
          };
        },
      },
      now: () => new Date("2026-03-19T10:00:00.000Z"),
      pid: () => 7171,
      postCycleOpportunityRefresh: stubOpportunityRefresh,
    });

    expect(observedHeartbeatUpdate).toBe(true);
  }, 15000);

  it("persists explicit stage progress while a task is running", async () => {
    const rootDir = await createResearchTempDir();
    const config = await createResearchConfig(rootDir);
    await writeJsonAtomic(
      config.paths.queuePath,
      createResearchQueue([createResearchTask({ id: "task-progress" })]),
    );

    let observedStage: string | null = null;
    let observedNote: string | null = null;

    await processResearchQueue(config, {
      executors: {
        risk_shaping: async ({ config: executorConfig, reportProgress }) => {
          await reportProgress?.({
            stage: "crisis",
            progress_note: "Running crisis validation slice.",
            completed_stages: ["aggregate"],
          });

          const queue = await readResearchQueue(executorConfig);
          const status = await readJsonFile<{ stage: string; progress_note: string | null }>(
            path.join(executorConfig.paths.runsDir, queue.active_run_id as string, "status.json"),
          );
          observedStage = status.stage;
          observedNote = status.progress_note;

          return {
            affectedInstruments: ["NAS100"],
            comparison: {
              aggregate: {
                baseline: createMetricSummary(),
                current: createMetricSummary({ profitFactor: 1.62, maxDrawdown: 3.8 }),
              },
              crisis: {
                baseline: createMetricSummary({ expectancy: -0.05, profitFactor: 0.98, maxDrawdown: 5 }),
                current: createMetricSummary({ expectancy: -0.02, profitFactor: 1.05, maxDrawdown: 4.6 }),
              },
              walkForward: {
                baseline: createMetricSummary({ expectancy: 0.05, profitFactor: 1.01, maxDrawdown: 2.4 }),
                current: createMetricSummary({ expectancy: 0.08, profitFactor: 1.04, maxDrawdown: 2.2 }),
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
                aggregateImproved: true,
                crisisImproved: true,
                walkForwardImproved: true,
                promotionThresholdMet: true,
                allHardGatesPass: true,
              },
            },
            artifacts: {
              aggregateReport: { ok: true },
              crisisReport: { ok: true },
              walkForwardReport: { ok: true },
            },
          };
        },
      },
      now: () => new Date("2026-03-19T10:00:00.000Z"),
      pid: () => 7272,
      postCycleOpportunityRefresh: stubOpportunityRefresh,
    });

    expect(observedStage).toBe("crisis");
    expect(observedNote).toBe("Running crisis validation slice.");
  }, 15000);

  it("refreshes research opportunities after each processed run instead of waiting for full cycle end", async () => {
    const rootDir = await createResearchTempDir();
    const config = await createResearchConfig(rootDir);
    await writeJsonAtomic(
      config.paths.queuePath,
      createResearchQueue([
        createResearchTask({ id: "task-refresh-a", priority: 100 }),
        createResearchTask({ id: "task-refresh-b", priority: 90 }),
      ]),
    );

    let refreshCount = 0;

    const result = await processResearchQueue(config, {
      executors: {
        risk_shaping: async () => ({
          affectedInstruments: ["NAS100"],
          comparison: {
            aggregate: {
              baseline: createMetricSummary(),
              current: createMetricSummary({ profitFactor: 1.62, maxDrawdown: 3.8 }),
            },
            crisis: {
              baseline: createMetricSummary({ expectancy: -0.05, profitFactor: 0.98, maxDrawdown: 5 }),
              current: createMetricSummary({ expectancy: -0.02, profitFactor: 1.05, maxDrawdown: 4.6 }),
            },
            walkForward: {
              baseline: createMetricSummary({ expectancy: 0.05, profitFactor: 1.01, maxDrawdown: 2.4 }),
              current: createMetricSummary({ expectancy: 0.08, profitFactor: 1.04, maxDrawdown: 2.2 }),
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
              aggregateImproved: true,
              crisisImproved: true,
              walkForwardImproved: true,
              promotionThresholdMet: true,
              allHardGatesPass: true,
            },
          },
          artifacts: {
            aggregateReport: { ok: true },
            crisisReport: { ok: true },
            walkForwardReport: { ok: true },
          },
        }),
      },
      now: () => new Date("2026-03-19T10:00:00.000Z"),
      pid: () => 8181,
      postRunOpportunityRefresh: async () => {
        refreshCount += 1;
        return {
          bundle: {
            refreshed: true,
            jsonPath: `bundle-${refreshCount}.json`,
            markdownPath: `bundle-${refreshCount}.md`,
          },
          board: {
            jsonPath: `board-${refreshCount}.json`,
            markdownPath: `board-${refreshCount}.md`,
          },
          packages: {
            jsonPath: `packages-${refreshCount}.json`,
            markdownPath: `packages-${refreshCount}.md`,
          },
          review: {
            jsonPath: `review-${refreshCount}.json`,
            markdownPath: `review-${refreshCount}.md`,
          },
          datasetHealth: {
            jsonPath: `dataset-${refreshCount}.json`,
            markdownPath: `dataset-${refreshCount}.md`,
          },
        };
      },
    });

    expect(refreshCount).toBe(2);
    expect(result.reportOutputs?.board.jsonPath).not.toBe("board-2.json");
    expect(result.reportOutputs?.packages.jsonPath).not.toBe("packages-2.json");
    expect(result.reportOutputs?.review?.jsonPath).not.toBe("review-2.json");
    expect(result.reportOutputs?.datasetHealth.jsonPath).not.toBe("stub-dataset-health.json");
  }, 15000);

  it("does not reuse the heavy end-of-cycle refresh callback for each processed run by default", async () => {
    const rootDir = await createResearchTempDir();
    const config = await createResearchConfig(rootDir);
    await writeJsonAtomic(
      config.paths.queuePath,
      createResearchQueue([
        createResearchTask({ id: "task-heavy-a", priority: 100 }),
        createResearchTask({ id: "task-heavy-b", priority: 90 }),
      ]),
    );

    let cycleRefreshCount = 0;

    await processResearchQueue(config, {
      executors: {
        risk_shaping: async () => ({
          affectedInstruments: ["NAS100"],
          comparison: {
            aggregate: {
              baseline: createMetricSummary(),
              current: createMetricSummary({ profitFactor: 1.62, maxDrawdown: 3.8 }),
            },
            crisis: {
              baseline: createMetricSummary({ expectancy: -0.05, profitFactor: 0.98, maxDrawdown: 5 }),
              current: createMetricSummary({ expectancy: -0.02, profitFactor: 1.05, maxDrawdown: 4.6 }),
            },
            walkForward: {
              baseline: createMetricSummary({ expectancy: 0.05, profitFactor: 1.01, maxDrawdown: 2.4 }),
              current: createMetricSummary({ expectancy: 0.08, profitFactor: 1.04, maxDrawdown: 2.2 }),
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
              aggregateImproved: true,
              crisisImproved: true,
              walkForwardImproved: true,
              promotionThresholdMet: true,
              allHardGatesPass: true,
            },
          },
          artifacts: {
            aggregateReport: { ok: true },
            crisisReport: { ok: true },
            walkForwardReport: { ok: true },
          },
        }),
      },
      postCycleOpportunityRefresh: async () => {
        cycleRefreshCount += 1;
        return stubOpportunityRefresh();
      },
    });

    expect(cycleRefreshCount).toBe(1);
  }, 15000);

  it("auto-enqueues one supported candidate from the library when the queue is empty", async () => {
    const rootDir = await createResearchTempDir();
    const config = await createResearchConfig(rootDir);
    await writeJsonAtomic(config.paths.queuePath, createResearchQueue([]));
    await writeResearchCandidateLibrary(config, {
      version: 1,
      families: [
        {
          id: "risk-core",
          enabled: true,
          priority: 100,
          campaign_id: "increase_expectancy",
          templates: [
            {
              id: "auto-risk-template",
              enabled: true,
              type: "risk_shaping",
              priority: 100,
              dataset_profile: "core_20y",
              validation_profile: "default_live_safe",
              candidate_scope: {
                instruments: ["NAS100"],
                sessions: ["london_ny_overlap"],
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

    const executed: string[] = [];

    const result = await processResearchQueue(config, {
      executors: {
        risk_shaping: async ({ task }) => {
          executed.push(task.id);
          return {
            affectedInstruments: ["NAS100"],
            comparison: {
              aggregate: {
                baseline: createMetricSummary(),
                current: createMetricSummary({ profitFactor: 1.62, maxDrawdown: 3.8 }),
              },
              crisis: {
                baseline: createMetricSummary({ expectancy: -0.05, profitFactor: 0.98, maxDrawdown: 5 }),
                current: createMetricSummary({ expectancy: -0.02, profitFactor: 1.05, maxDrawdown: 4.6 }),
              },
              walkForward: {
                baseline: createMetricSummary({ expectancy: 0.05, profitFactor: 1.01, maxDrawdown: 2.4 }),
                current: createMetricSummary({ expectancy: 0.08, profitFactor: 1.04, maxDrawdown: 2.2 }),
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
                aggregateImproved: true,
                crisisImproved: true,
                walkForwardImproved: true,
                promotionThresholdMet: true,
                allHardGatesPass: true,
              },
            },
            artifacts: {
              aggregateReport: { ok: true },
              crisisReport: { ok: true },
              walkForwardReport: { ok: true },
            },
          };
        },
      },
      now: () => new Date("2026-03-19T10:00:00.000Z"),
      pid: () => 6161,
      postCycleOpportunityRefresh: stubOpportunityRefresh,
    });

    expect(executed).toHaveLength(1);
    expect(executed[0]).toContain("task-auto-auto-risk-template");
    expect(result.autoEnqueuedTaskIds).toHaveLength(1);
    expect(result.reportOutputs).not.toBeNull();

    const queue = await readResearchQueue(config);
    expect(queue.tasks).toHaveLength(1);
    expect(queue.tasks[0]?.status).toBe("completed");
  });
});
