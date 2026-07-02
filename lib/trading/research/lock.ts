import os from "node:os";
import { open } from "node:fs/promises";

import { readJsonIfExists, removeFileIfExists, writeJsonAtomic } from "./fs";
import type { ResearchConfig, ResearchLock } from "./types";

export async function readResearchLock(config: ResearchConfig): Promise<ResearchLock | null> {
  return readJsonIfExists<ResearchLock>(config.paths.lockPath);
}

export async function acquireResearchLock(
  config: ResearchConfig,
  args: {
    runId: string;
    taskId: string;
    runFingerprint: string;
    baselineId: string;
    pid: number;
    stage: string;
  },
): Promise<ResearchLock> {
  const now = new Date().toISOString();
  const lock: ResearchLock = {
    version: 1,
    run_id: args.runId,
    task_id: args.taskId,
    runner_pid: args.pid,
    hostname: os.hostname(),
    started_at: now,
    heartbeat_at: now,
    stage: args.stage,
    run_fingerprint: args.runFingerprint,
    baseline_id: args.baselineId,
  };

  const handle = await open(config.paths.lockPath, "wx");
  try {
    await handle.writeFile(`${JSON.stringify(lock, null, 2)}\n`, "utf8");
  } finally {
    await handle.close();
  }

  return lock;
}

export async function updateResearchLockHeartbeat(
  config: ResearchConfig,
  lock: ResearchLock,
  stage: string,
): Promise<ResearchLock> {
  const updated: ResearchLock = {
    ...lock,
    stage,
    heartbeat_at: new Date().toISOString(),
  };
  await writeJsonAtomic(config.paths.lockPath, updated);
  return updated;
}

export async function releaseResearchLock(config: ResearchConfig): Promise<void> {
  await removeFileIfExists(config.paths.lockPath);
}

export function classifyResearchLockHealth(
  config: ResearchConfig,
  lock: ResearchLock,
  now = new Date(),
): "healthy" | "stale" | "hung" {
  const heartbeat = new Date(lock.heartbeat_at).getTime();
  const ageMs = now.getTime() - heartbeat;

  if (ageMs > config.timing.hungLockMs) {
    return "hung";
  }
  if (ageMs > config.timing.staleLockMs) {
    return "stale";
  }
  return "healthy";
}

export function isResearchLockRunnerAlive(lock: ResearchLock): boolean | null {
  if (lock.hostname !== os.hostname()) {
    return null;
  }

  if (!Number.isInteger(lock.runner_pid) || lock.runner_pid <= 0) {
    return false;
  }

  try {
    process.kill(lock.runner_pid, 0);
    return true;
  } catch {
    return false;
  }
}
