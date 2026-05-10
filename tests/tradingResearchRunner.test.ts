import path from "node:path";

import { describe, expect, it } from "vitest";

import { processResearchQueue, readJsonFile, readResearchQueue, writeJsonAtomic } from "@/lib/trading/research";
import {
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
  datasetHealth: {
    jsonPath: "stub-dataset-health.json",
    markdownPath: "stub-dataset-health.md",
  },
});

describe("trading research runner", () => {
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
    expect(result.reportOutputs!.datasetHealth.jsonPath).toBe("stub-dataset-health.json");

    const dailyReport = await readJsonFile<{ promoted: Array<unknown> }>(
      result.reportOutputs!.daily.jsonPath,
    );
    expect(Array.isArray(dailyReport.promoted)).toBe(true);
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
          datasetHealth: {
            jsonPath: `dataset-${refreshCount}.json`,
            markdownPath: `dataset-${refreshCount}.md`,
          },
        };
      },
    });

    expect(refreshCount).toBe(2);
    expect(result.reportOutputs?.board.jsonPath).toBe("board-2.json");
    expect(result.reportOutputs?.packages.jsonPath).toBe("packages-2.json");
  });

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
