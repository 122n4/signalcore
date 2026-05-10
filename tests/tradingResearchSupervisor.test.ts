import { describe, expect, it } from "vitest";

import { monitorResearchWorkerCycle, runResearchSupervisor } from "@/lib/trading/research";

import {
  createResearchConfig,
  createResearchQueue,
  createResearchTask,
  createResearchTempDir,
} from "./helpers/tradingResearchFixtures";

describe("trading research supervisor", () => {
  it("does not terminate a worker cycle when the lock is only stale", async () => {
    const sleeps: number[] = [];
    let readCount = 0;
    let killed = false;
    let completed = false;

    const result = await monitorResearchWorkerCycle({
      waitForExit: async () => {
        while (!completed) {
          await Promise.resolve();
        }
        return {
          exitCode: 0,
          signal: null,
        };
      },
      readLock: async () => {
        readCount += 1;
        if (readCount >= 2) {
          completed = true;
        }
        return {
          version: 1,
          run_id: "run-test",
          task_id: "task-test",
          runner_pid: 123,
          hostname: "test-host",
          started_at: "2026-03-20T04:00:00.000Z",
          heartbeat_at: readCount === 1 ? "2026-03-20T04:00:00.000Z" : "2026-03-20T03:40:00.000Z",
          stage: "aggregate",
          run_fingerprint: "fp-test",
          baseline_id: "baseline-test-live",
        };
      },
      classifyLockHealth: (lock) =>
        lock.heartbeat_at === "2026-03-20T03:40:00.000Z" ? "stale" : "healthy",
      onUnhealthyLock: async () => {
        killed = true;
      },
      pollIntervalMs: 1,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });

    expect(killed).toBe(false);
    expect(result.exitCode).toBe(0);
    expect(sleeps.length).toBeGreaterThan(0);
  });

  it("terminates a worker cycle when the lock becomes hung", async () => {
    const sleeps: number[] = [];
    let readCount = 0;
    let killed = false;

    const result = await monitorResearchWorkerCycle({
      waitForExit: async () => {
        while (!killed) {
          await Promise.resolve();
        }
        return {
          exitCode: null,
          signal: "SIGTERM",
        };
      },
      readLock: async () => {
        readCount += 1;
        if (readCount === 1) {
          return {
            version: 1,
            run_id: "run-test",
            task_id: "task-test",
            runner_pid: 123,
            hostname: "test-host",
            started_at: "2026-03-20T04:00:00.000Z",
            heartbeat_at: "2026-03-20T04:00:00.000Z",
            stage: "aggregate",
            run_fingerprint: "fp-test",
            baseline_id: "baseline-test-live",
          };
        }
        return {
          version: 1,
          run_id: "run-test",
          task_id: "task-test",
          runner_pid: 123,
          hostname: "test-host",
          started_at: "2026-03-20T04:00:00.000Z",
          heartbeat_at: "2026-03-20T03:40:00.000Z",
          stage: "aggregate",
          run_fingerprint: "fp-test",
          baseline_id: "baseline-test-live",
        };
      },
      classifyLockHealth: (lock) =>
        lock.heartbeat_at === "2026-03-20T03:40:00.000Z" ? "hung" : "healthy",
      onUnhealthyLock: async () => {
        killed = true;
      },
      pollIntervalMs: 1,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });

    expect(killed).toBe(true);
    expect(result.signal).toBe("SIGTERM");
    expect(sleeps.length).toBeGreaterThan(0);
  });

  it("terminates a worker cycle when the active run stage times out even with a healthy lock", async () => {
    const sleeps: number[] = [];
    let readCount = 0;
    let killed = false;

    const result = await monitorResearchWorkerCycle({
      waitForExit: async () => {
        while (!killed) {
          await Promise.resolve();
        }
        return {
          exitCode: null,
          signal: "SIGTERM",
        };
      },
      readLock: async () => {
        readCount += 1;
        return {
          version: 1,
          run_id: "run-test",
          task_id: "task-test",
          runner_pid: 123,
          hostname: "test-host",
          started_at: "2026-03-20T04:00:00.000Z",
          heartbeat_at: "2026-03-20T04:00:00.000Z",
          stage: "aggregate",
          run_fingerprint: "fp-test",
          baseline_id: "baseline-test-live",
        };
      },
      classifyLockHealth: () => "healthy",
      readRunStageHealth: async () => (readCount >= 2 ? "timed_out" : "ok"),
      onUnhealthyLock: async () => {
        throw new Error("lock kill should not be used for stage timeout");
      },
      onStageTimeout: async () => {
        killed = true;
      },
      pollIntervalMs: 1,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });

    expect(killed).toBe(true);
    expect(result.signal).toBe("SIGTERM");
    expect(sleeps.length).toBeGreaterThan(0);
  });

  it("recovers a pre-existing lock before running the next worker cycle", async () => {
    const rootDir = await createResearchTempDir();
    const config = await createResearchConfig(rootDir);
    const calls: string[] = [];

    const result = await runResearchSupervisor({
      loadConfig: async () => config,
      readLock: async () =>
        calls.includes("readLock:after")
          ? null
          : {
              version: 1,
              run_id: "run-locked",
              task_id: "task-locked",
              runner_pid: 123,
              hostname: "test-host",
              started_at: "2026-03-19T10:00:00.000Z",
              heartbeat_at: "2026-03-19T10:00:00.000Z",
              stage: "aggregate",
              run_fingerprint: "fp-locked",
              baseline_id: "baseline-test-live",
            },
      recover: async () => {
        calls.push("recover");
        return {
          recovered: true,
          message: "Recovered.",
        };
      },
      runWorkerCycle: async () => {
        calls.push("worker");
        return {
          exitCode: 0,
          signal: null,
        };
      },
      readQueue: async () => ({
        ...createResearchQueue([]),
        idle_reason: "all_candidates_deduped_for_current_baseline",
      }),
      sleep: async () => {
        calls.push("sleep");
        calls.push("readLock:after");
      },
      maxCycles: 1,
    });

    expect(result.cycles).toBe(1);
    expect(result.recoveries).toBe(1);
    expect(calls).toContain("recover");
    expect(calls).toContain("worker");
  });

  it("uses idle delay when the queue ends in a formal idle state", async () => {
    const rootDir = await createResearchTempDir();
    const config = await createResearchConfig(rootDir);
    const sleeps: number[] = [];

    const result = await runResearchSupervisor({
      loadConfig: async () => config,
      readLock: async () => null,
      recover: async () => ({
        recovered: false,
        message: "No recovery needed.",
      }),
      runWorkerCycle: async () => ({
        exitCode: 0,
        signal: null,
      }),
      readQueue: async () => ({
        ...createResearchQueue([]),
        idle_reason: "all_candidates_deduped_for_current_baseline",
      }),
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      maxCycles: 1,
    });

    expect(result.lastIdleReason).toBe("all_candidates_deduped_for_current_baseline");
    expect(sleeps).toEqual([]);
  });

  it("continues polling when there is still active work after the worker cycle", async () => {
    const rootDir = await createResearchTempDir();
    const config = await createResearchConfig(rootDir);
    const sleeps: number[] = [];
    let readCount = 0;

    const result = await runResearchSupervisor({
      loadConfig: async () => config,
      readLock: async () => null,
      recover: async () => ({
        recovered: false,
        message: "No recovery needed.",
      }),
      runWorkerCycle: async () => ({
        exitCode: 0,
        signal: null,
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

  it("falls back to an in-process worker cycle when spawn is blocked", async () => {
    const rootDir = await createResearchTempDir();
    const config = await createResearchConfig(rootDir);
    let fallbackCalled = false;

    const result = await runResearchSupervisor({
      loadConfig: async () => config,
      readLock: async () => null,
      recover: async () => ({
        recovered: false,
        message: "No recovery needed.",
      }),
      runWorkerCycle: async () => {
        const error = new Error("spawn blocked") as NodeJS.ErrnoException;
        error.code = "EPERM";
        error.syscall = "spawn";
        throw error;
      },
      runWorkerCycleFallback: async () => {
        fallbackCalled = true;
        return {
          exitCode: 0,
          signal: null,
        };
      },
      readQueue: async () => ({
        ...createResearchQueue([]),
        idle_reason: "all_candidates_deduped_for_current_baseline",
      }),
      sleep: async () => undefined,
      maxCycles: 1,
    });

    expect(fallbackCalled).toBe(true);
    expect(result.cycles).toBe(1);
    expect(result.lastCycleOutcome).toEqual({
      exitCode: 0,
      signal: null,
    });
  });
});
