import { spawn } from "node:child_process";
import path from "node:path";
import { open } from "node:fs/promises";

import { loadResearchConfig } from "./config";
import { ensureDirectory, fileExists, writeJsonAtomic } from "./fs";
import { classifyResearchLockHealth, readResearchLock } from "./lock";
import { readResearchQueue } from "./queue";
import { recoverResearchRunner } from "./recovery";
import { buildResearchWindowReport, writeResearchWindowReport } from "./report";
import { buildResearchRuntimeHealth } from "./runtimeHealth";
import { processResearchQueue } from "./runner";
import { researchSupabaseSyncEnabled, syncResearchLabToSupabase } from "./supabaseSync";
import type {
  ResearchConfig,
  ResearchLock,
  ResearchSupervisorCycleOutcome,
  ResearchSupervisorResult,
} from "./types";

type ResearchSupervisorDependencies = {
  loadConfig?: () => Promise<ResearchConfig>;
  recover?: typeof recoverResearchRunner;
  readQueue?: typeof readResearchQueue;
  readLock?: typeof readResearchLock;
  sleep?: (ms: number) => Promise<void>;
  runWorkerCycle?: (config: ResearchConfig) => Promise<ResearchSupervisorCycleOutcome>;
  runWorkerCycleFallback?: (config: ResearchConfig) => Promise<ResearchSupervisorCycleOutcome>;
  maxCycles?: number | null;
  signal?: AbortSignal;
};

function sleepDefault(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function monitorResearchWorkerCycle(args: {
  waitForExit: () => Promise<ResearchSupervisorCycleOutcome>;
  readLock: () => Promise<ResearchLock | null>;
  classifyLockHealth: (lock: ResearchLock) => "healthy" | "stale" | "hung";
  onUnhealthyLock: () => Promise<void>;
  readRunStageHealth?: () => Promise<"ok" | "long_running" | "timed_out" | "unknown">;
  onStageTimeout?: () => Promise<void>;
  onPoll?: () => Promise<void>;
  pollIntervalMs: number;
  sleep?: (ms: number) => Promise<void>;
}): Promise<ResearchSupervisorCycleOutcome> {
  const sleep = args.sleep ?? sleepDefault;
  let settled = false;

  const exitPromise = args.waitForExit().finally(() => {
    settled = true;
  });

  while (!settled) {
    await sleep(args.pollIntervalMs);
    if (settled) {
      break;
    }

    await args.onPoll?.().catch(() => {
      // Poll hooks are observability-only; never stop research because remote sync is unavailable.
    });

    const lock = await args.readLock();
    if (!lock) {
      continue;
    }

    const stageHealth = await args.readRunStageHealth?.();
    if (stageHealth === "timed_out") {
      await (args.onStageTimeout ?? args.onUnhealthyLock)();
      break;
    }

    const health = args.classifyLockHealth(lock);
    if (health !== "hung") {
      continue;
    }

    await args.onUnhealthyLock();
    break;
  }

  return exitPromise;
}

async function syncSupervisorState(config: ResearchConfig) {
  if (!researchSupabaseSyncEnabled()) return;
  await syncResearchLabToSupabase({ config });
}

function hasActiveResearchWork(queue: Awaited<ReturnType<typeof readResearchQueue>>): boolean {
  return (
    queue.active_run_id !== null ||
    queue.tasks.some(
      (task) =>
        task.status === "pending" ||
        task.status === "running" ||
        task.status === "awaiting_decision",
    )
  );
}

async function buildRuntimePaths(config: ResearchConfig): Promise<{
  runtimeDir: string;
  stdoutPath: string;
  stderrPath: string;
  metaPath: string;
}> {
  const runtimeDir = path.join(config.paths.rootDir, "runtime");
  await ensureDirectory(runtimeDir);
  return {
    runtimeDir,
    stdoutPath: path.join(runtimeDir, "research-supervisor.stdout.log"),
    stderrPath: path.join(runtimeDir, "research-supervisor.stderr.log"),
    metaPath: path.join(runtimeDir, "research-supervisor.meta.json"),
  };
}

async function appendSupervisorLogLine(
  handle: Awaited<ReturnType<typeof open>>,
  message: string,
): Promise<void> {
  await handle.write(Buffer.from(`${message}\n`, "utf8"));
}

async function spawnResearchWorkerCycle(config: ResearchConfig): Promise<ResearchSupervisorCycleOutcome> {
  const runtimePaths = await buildRuntimePaths(config);
  const stdoutHandle = await open(runtimePaths.stdoutPath, "a");
  const stderrHandle = await open(runtimePaths.stderrPath, "a");
  const startedAt = new Date().toISOString();

  try {
    const child = spawn(
      process.execPath,
      [
        "-r",
        "./scripts/register-alias.cjs",
        "./node_modules/jiti/bin/jiti.js",
        "scripts/trading/runResearchQueue.ts",
      ],
      {
        cwd: process.cwd(),
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    await writeJsonAtomic(runtimePaths.metaPath, {
      supervisor_pid: process.pid,
      worker_pid: child.pid ?? null,
      started_at: startedAt,
      stdout: runtimePaths.stdoutPath,
      stderr: runtimePaths.stderrPath,
    });

    child.stdout?.on("data", (chunk) => {
      void stdoutHandle.write(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      void stderrHandle.write(chunk);
    });

    return await monitorResearchWorkerCycle({
      waitForExit: () =>
        new Promise<ResearchSupervisorCycleOutcome>((resolve, reject) => {
          child.once("error", async (error) => {
            await appendSupervisorLogLine(
              stderrHandle,
              `[${new Date().toISOString()}] Worker ${child.pid ?? "unknown"} error: ${
                (error as Error).stack ?? String(error)
              }`,
            );
            await writeJsonAtomic(runtimePaths.metaPath, {
              supervisor_pid: process.pid,
              worker_pid: child.pid ?? null,
              started_at: startedAt,
              finished_at: new Date().toISOString(),
              stdout: runtimePaths.stdoutPath,
              stderr: runtimePaths.stderrPath,
              last_error: (error as Error).message ?? String(error),
            });
            reject(error);
          });
          child.once("exit", async (exitCode, signal) => {
            await appendSupervisorLogLine(
              stderrHandle,
              `[${new Date().toISOString()}] Worker ${child.pid ?? "unknown"} exited with code ${
                exitCode ?? "null"
              } and signal ${signal ?? "null"}.`,
            );
            await writeJsonAtomic(runtimePaths.metaPath, {
              supervisor_pid: process.pid,
              worker_pid: child.pid ?? null,
              started_at: startedAt,
              finished_at: new Date().toISOString(),
              stdout: runtimePaths.stdoutPath,
              stderr: runtimePaths.stderrPath,
              last_exit_code: exitCode,
              last_signal: signal,
            });
            resolve({
              exitCode,
              signal,
            });
          });
        }),
      readLock: async () => readResearchLock(config),
      classifyLockHealth: (lock) => classifyResearchLockHealth(config, lock),
      onPoll: async () => syncSupervisorState(config),
      readRunStageHealth: async () =>
        (await buildResearchRuntimeHealth({ config })).activeRun.stageHealth,
      onUnhealthyLock: async () => {
        await stderrHandle.write(
          Buffer.from(
            `[${new Date().toISOString()}] Supervisor detected hung research lock for worker ${child.pid ?? "unknown"}; terminating worker for recovery.\n`,
            "utf8",
          ),
        );
        child.kill();
      },
      onStageTimeout: async () => {
        const health = await buildResearchRuntimeHealth({ config });
        await stderrHandle.write(
          Buffer.from(
            `[${new Date().toISOString()}] Supervisor detected stage timeout for worker ${child.pid ?? "unknown"}; active_run=${health.activeRun.runId ?? "none"} stage=${health.activeRun.stage ?? "unknown"} elapsed_ms=${health.activeRun.stageElapsedMs ?? "unknown"}; terminating worker for recovery.\n`,
            "utf8",
          ),
        );
        child.kill();
      },
      pollIntervalMs: config.timing.heartbeatIntervalMs,
    });
  } finally {
    await stdoutHandle.close();
    await stderrHandle.close();
  }
}

async function runResearchWorkerCycleInProcess(
  config: ResearchConfig,
): Promise<ResearchSupervisorCycleOutcome> {
  const runtimePaths = await buildRuntimePaths(config);
  await writeJsonAtomic(runtimePaths.metaPath, {
    supervisor_pid: process.pid,
    worker_pid: process.pid,
    started_at: new Date().toISOString(),
    stdout: runtimePaths.stdoutPath,
    stderr: runtimePaths.stderrPath,
    mode: "in_process_fallback",
  });

  await processResearchQueue(config);
  return {
    exitCode: 0,
    signal: null,
  };
}

export async function runResearchSupervisor(
  dependencies: ResearchSupervisorDependencies = {},
): Promise<ResearchSupervisorResult> {
  const loadConfigFn = dependencies.loadConfig ?? (() => loadResearchConfig());
  const recoverFn = dependencies.recover ?? recoverResearchRunner;
  const readQueueFn = dependencies.readQueue ?? readResearchQueue;
  const readLockFn = dependencies.readLock ?? readResearchLock;
  const sleep = dependencies.sleep ?? sleepDefault;
  const runWorkerCycle = dependencies.runWorkerCycle ?? spawnResearchWorkerCycle;
  const runWorkerCycleFallback =
    dependencies.runWorkerCycleFallback ?? runResearchWorkerCycleInProcess;

  let cycles = 0;
  let recoveries = 0;
  let lastIdleReason: ResearchSupervisorResult["lastIdleReason"] = null;
  let lastCycleOutcome: ResearchSupervisorResult["lastCycleOutcome"] = null;

  while (true) {
    if (dependencies.signal?.aborted) {
      return {
        cycles,
        recoveries,
        lastIdleReason,
        stopReason: "aborted",
        lastCycleOutcome,
      };
    }

    const config = await loadConfigFn();
    await syncSupervisorState(config).catch(() => {
      // Remote lab visibility must not block local research progress.
    });
    const currentLock = await readLockFn(config);
    if (currentLock) {
      const recoveryResult = await recoverFn(config);
      if (recoveryResult.recovered) {
        recoveries += 1;
        await sleep(config.automation.errorBackoffMs);
        continue;
      }
    }

    try {
      lastCycleOutcome = await runWorkerCycle(config);
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err?.code === "EPERM" && err?.syscall === "spawn") {
        lastCycleOutcome = await runWorkerCycleFallback(config);
      } else {
        throw error;
      }
    }
    cycles += 1;

    const queue = await readQueueFn(config);
    lastIdleReason = queue.idle_reason;
    const windowReport = await buildResearchWindowReport(config);
    await writeResearchWindowReport(config, windowReport);
    await syncSupervisorState(config).catch(() => {
      // Best-effort remote sync after every worker cycle.
    });

    const lockAfterCycle = await readLockFn(config);
    if (lockAfterCycle && (await fileExists(config.paths.lockPath))) {
      const recoveryResult = await recoverFn(config);
      if (recoveryResult.recovered) {
        recoveries += 1;
      }
    }

    if (
      dependencies.maxCycles !== undefined &&
      dependencies.maxCycles !== null &&
      cycles >= dependencies.maxCycles
    ) {
      return {
        cycles,
        recoveries,
        lastIdleReason,
        stopReason: "max_cycles_reached",
        lastCycleOutcome,
      };
    }

    const delayMs =
      !hasActiveResearchWork(queue) && queue.idle_reason
        ? config.automation.idleIntervalMs
        : config.automation.pollIntervalMs;
    await sleep(delayMs);
  }
}
