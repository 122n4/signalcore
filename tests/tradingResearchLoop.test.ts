import { describe, expect, it } from "vitest";

import { runResearchAutomationLoop } from "@/lib/trading/research";

import {
  createResearchConfig,
  createResearchQueue,
  createResearchTask,
  createResearchTempDir,
} from "./helpers/tradingResearchFixtures";

describe("trading research automation loop", () => {
  it("waits on the idle interval when the queue ends in a formal idle state", async () => {
    const rootDir = await createResearchTempDir();
    const config = await createResearchConfig(rootDir);
    const sleeps: number[] = [];
    let cycle = 0;

    const result = await runResearchAutomationLoop({
      loadConfig: async () => config,
      processQueue: async () => {
        cycle += 1;
        return {
          processedRunIds: [`run-${cycle}`],
          autoEnqueuedTaskIds: [`task-auto-${cycle}`],
          reportOutputs: {
            daily: { jsonPath: "daily.json", markdownPath: "daily.md" },
            cycle: { jsonPath: "cycle.json", markdownPath: "cycle.md" },
            bundle: null,
            board: { jsonPath: "board.json", markdownPath: "board.md" },
            packages: { jsonPath: "packages.json", markdownPath: "packages.md" },
            datasetHealth: {
              jsonPath: "dataset-health.json",
              markdownPath: "dataset-health.md",
            },
          },
        };
      },
      readQueue: async () => ({
        ...createResearchQueue([]),
        idle_reason: "all_candidates_deduped_for_current_baseline",
      }),
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      maxCycles: 2,
    });

    expect(result.cycles).toBe(2);
    expect(result.idleCycles).toBe(2);
    expect(result.processedRunIds).toEqual(["run-1", "run-2"]);
    expect(result.autoEnqueuedTaskIds).toEqual(["task-auto-1", "task-auto-2"]);
    expect(result.stopReason).toBe("max_cycles_reached");
    expect(sleeps).toEqual([config.automation.idleIntervalMs]);
  });

  it("waits on the poll interval when there is still active work after a cycle", async () => {
    const rootDir = await createResearchTempDir();
    const config = await createResearchConfig(rootDir);
    const sleeps: number[] = [];
    let readCount = 0;

    const result = await runResearchAutomationLoop({
      loadConfig: async () => config,
      processQueue: async () => ({
        processedRunIds: ["run-1"],
        autoEnqueuedTaskIds: [],
        reportOutputs: {
          daily: { jsonPath: "daily.json", markdownPath: "daily.md" },
          cycle: { jsonPath: "cycle.json", markdownPath: "cycle.md" },
          bundle: null,
          board: { jsonPath: "board.json", markdownPath: "board.md" },
          packages: { jsonPath: "packages.json", markdownPath: "packages.md" },
          datasetHealth: {
            jsonPath: "dataset-health.json",
            markdownPath: "dataset-health.md",
          },
        },
      }),
      readQueue: async () => {
        readCount += 1;
        if (readCount === 1) {
          return createResearchQueue([createResearchTask({ id: "task-next" })]);
        }
        return {
          ...createResearchQueue([]),
          idle_reason: "all_candidates_deduped_for_current_baseline",
        };
      },
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      maxCycles: 2,
    });

    expect(result.cycles).toBe(2);
    expect(sleeps).toEqual([config.automation.pollIntervalMs]);
  });

  it("backs off after an error and continues with the next cycle", async () => {
    const rootDir = await createResearchTempDir();
    const config = await createResearchConfig(rootDir);
    const sleeps: number[] = [];
    let processCount = 0;

    const result = await runResearchAutomationLoop({
      loadConfig: async () => config,
      processQueue: async () => {
        processCount += 1;
        if (processCount === 1) {
          throw new Error("transient");
        }
        return {
          processedRunIds: ["run-1"],
          autoEnqueuedTaskIds: [],
          reportOutputs: {
            daily: { jsonPath: "daily.json", markdownPath: "daily.md" },
            cycle: { jsonPath: "cycle.json", markdownPath: "cycle.md" },
            bundle: null,
            board: { jsonPath: "board.json", markdownPath: "board.md" },
            packages: { jsonPath: "packages.json", markdownPath: "packages.md" },
            datasetHealth: {
              jsonPath: "dataset-health.json",
              markdownPath: "dataset-health.md",
            },
          },
        };
      },
      readQueue: async () => createResearchQueue([]),
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      maxCycles: 1,
    });

    expect(result.cycles).toBe(1);
    expect(result.processedRunIds).toEqual(["run-1"]);
    expect(sleeps[0]).toBe(config.automation.errorBackoffMs);
  });
});
