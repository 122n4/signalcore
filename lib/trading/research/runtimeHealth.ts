import path from "node:path";

import { buildResearchRunArtifactPaths } from "./artifactContract";
import { loadResearchConfig } from "./config";
import { readJsonIfExists } from "./fs";
import { classifyResearchLockHealth, readResearchLock } from "./lock";
import { readResearchQueue } from "./queue";
import type { ResearchConfig, ResearchLock, ResearchQueue, ResearchRunStatus } from "./types";

export type ResearchRuntimeSeverity = "ok" | "warn" | "error";

export type ResearchRuntimeHealth = {
  ok: boolean;
  severity: ResearchRuntimeSeverity;
  generatedAt: string;
  queue: {
    activeRunId: string | null;
    idleReason: string | null;
    pending: number;
    running: number;
    awaitingDecision: number;
    failed: number;
  };
  lock: {
    present: boolean;
    health: "healthy" | "stale" | "hung" | "missing";
    heartbeatAt: string | null;
    heartbeatAgeMs: number | null;
    stage: string | null;
    runnerPid: number | null;
  };
  activeRun: {
    runId: string | null;
    taskId: string | null;
    status: ResearchRunStatus["status"] | "missing" | null;
    stage: string | null;
    startedAt: string | null;
    updatedAt: string | null;
    stageStartedAt: string | null;
    stageElapsedMs: number | null;
    stageWarnMs: number;
    stageHardTimeoutMs: number;
    stageHealth: "ok" | "long_running" | "timed_out" | "unknown";
    statusPath: string | null;
  };
  backfill: {
    generatedAt: string | null;
    existing: number | null;
    missingDownloadable: number | null;
    missingManual: number | null;
    reportPath: string;
  };
  alerts: Array<{
    id: string;
    severity: Exclude<ResearchRuntimeSeverity, "ok">;
    message: string;
  }>;
};

function nowMs(now: Date) {
  return now.getTime();
}

function safeDateMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function summarizeQueue(queue: ResearchQueue): ResearchRuntimeHealth["queue"] {
  return {
    activeRunId: queue.active_run_id,
    idleReason: queue.idle_reason,
    pending: queue.tasks.filter((task) => task.status === "pending").length,
    running: queue.tasks.filter((task) => task.status === "running").length,
    awaitingDecision: queue.tasks.filter((task) => task.status === "awaiting_decision").length,
    failed: queue.tasks.filter((task) => task.status === "failed").length,
  };
}

function summarizeLock(config: ResearchConfig, lock: ResearchLock | null, now: Date): ResearchRuntimeHealth["lock"] {
  if (!lock) {
    return {
      present: false,
      health: "missing",
      heartbeatAt: null,
      heartbeatAgeMs: null,
      stage: null,
      runnerPid: null,
    };
  }

  const heartbeatMs = safeDateMs(lock.heartbeat_at);
  return {
    present: true,
    health: classifyResearchLockHealth(config, lock, now),
    heartbeatAt: lock.heartbeat_at,
    heartbeatAgeMs: heartbeatMs === null ? null : Math.max(0, nowMs(now) - heartbeatMs),
    stage: lock.stage,
    runnerPid: lock.runner_pid,
  };
}

function resolveStageWarnMs(config: ResearchConfig) {
  return config.timing.stageWarnMs ?? config.timing.hungLockMs;
}

function resolveStageHardTimeoutMs(config: ResearchConfig) {
  return config.timing.stageHardTimeoutMs ?? Math.max(config.timing.hungLockMs * 4, 60 * 60_000);
}

async function readActiveRunStatus(args: {
  config: ResearchConfig;
  activeRunId: string | null;
  now: Date;
}): Promise<ResearchRuntimeHealth["activeRun"]> {
  const stageWarnMs = resolveStageWarnMs(args.config);
  const stageHardTimeoutMs = resolveStageHardTimeoutMs(args.config);
  if (!args.activeRunId) {
    return {
      runId: null,
      taskId: null,
      status: null,
      stage: null,
      startedAt: null,
      updatedAt: null,
      stageStartedAt: null,
      stageElapsedMs: null,
      stageWarnMs,
      stageHardTimeoutMs,
      stageHealth: "unknown",
      statusPath: null,
    };
  }

  const paths = buildResearchRunArtifactPaths(args.config.paths.runsDir, args.activeRunId);
  const status = await readJsonIfExists<ResearchRunStatus>(paths.statusPath);
  if (!status) {
    return {
      runId: args.activeRunId,
      taskId: null,
      status: "missing",
      stage: null,
      startedAt: null,
      updatedAt: null,
      stageStartedAt: null,
      stageElapsedMs: null,
      stageWarnMs,
      stageHardTimeoutMs,
      stageHealth: "unknown",
      statusPath: paths.statusPath,
    };
  }

  const stageStartedAt = status.stage_started_at ?? status.started_at;
  const stageStartedMs = safeDateMs(stageStartedAt);
  const stageElapsedMs =
    stageStartedMs === null ? null : Math.max(0, nowMs(args.now) - stageStartedMs);
  const stageHealth =
    stageElapsedMs === null
      ? "unknown"
      : stageElapsedMs >= stageHardTimeoutMs
        ? "timed_out"
        : stageElapsedMs >= stageWarnMs
          ? "long_running"
          : "ok";

  return {
    runId: status.run_id,
    taskId: status.task_id,
    status: status.status,
    stage: status.stage,
    startedAt: status.started_at,
    updatedAt: status.updated_at,
    stageStartedAt,
    stageElapsedMs,
    stageWarnMs,
    stageHardTimeoutMs,
    stageHealth,
    statusPath: paths.statusPath,
  };
}

async function readBackfillSummary(config: ResearchConfig): Promise<ResearchRuntimeHealth["backfill"]> {
  const reportPath = path.join(config.paths.reportsDir, "datasets", "market-data-backfill-latest.json");
  const report = await readJsonIfExists<{
    generatedAt?: string;
    after?: {
      summary?: {
        existing?: number;
        missingDownloadable?: number;
        missingManual?: number;
      };
    };
  }>(reportPath);

  return {
    generatedAt: report?.generatedAt ?? null,
    existing: report?.after?.summary?.existing ?? null,
    missingDownloadable: report?.after?.summary?.missingDownloadable ?? null,
    missingManual: report?.after?.summary?.missingManual ?? null,
    reportPath,
  };
}

function buildAlerts(args: {
  lock: ResearchRuntimeHealth["lock"];
  activeRun: ResearchRuntimeHealth["activeRun"];
  backfill: ResearchRuntimeHealth["backfill"];
}): ResearchRuntimeHealth["alerts"] {
  const alerts: ResearchRuntimeHealth["alerts"] = [];

  if (args.lock.health === "hung") {
    alerts.push({
      id: "research-lock-hung",
      severity: "error",
      message: "Research lock heartbeat is hung; recovery should requeue or fail the active run.",
    });
  } else if (args.lock.health === "stale") {
    alerts.push({
      id: "research-lock-stale",
      severity: "warn",
      message: "Research lock heartbeat is stale; monitor before trusting the active run.",
    });
  }

  if (args.activeRun.stageHealth === "timed_out") {
    alerts.push({
      id: "research-stage-timeout",
      severity: "error",
      message: `Research run stayed in stage '${args.activeRun.stage ?? "unknown"}' beyond the hard timeout.`,
    });
  } else if (args.activeRun.stageHealth === "long_running") {
    alerts.push({
      id: "research-stage-long-running",
      severity: "warn",
      message: `Research run is still in stage '${args.activeRun.stage ?? "unknown"}' beyond the warning threshold.`,
    });
  }

  if ((args.backfill.missingDownloadable ?? 0) > 0) {
    alerts.push({
      id: "research-data-downloadable-gaps",
      severity: "warn",
      message: `${args.backfill.missingDownloadable} downloadable market data gaps are waiting for backfill.`,
    });
  }

  return alerts;
}

export async function buildResearchRuntimeHealth(args: {
  config?: ResearchConfig;
  now?: Date;
} = {}): Promise<ResearchRuntimeHealth> {
  const config = args.config ?? await loadResearchConfig();
  const now = args.now ?? new Date();
  const [queue, lock] = await Promise.all([
    readResearchQueue(config, { createIfMissing: false }),
    readResearchLock(config),
  ]);
  const queueSummary = summarizeQueue(queue);
  const lockSummary = summarizeLock(config, lock, now);
  const [activeRun, backfill] = await Promise.all([
    readActiveRunStatus({
      config,
      activeRunId: queue.active_run_id,
      now,
    }),
    readBackfillSummary(config),
  ]);
  const alerts = buildAlerts({
    lock: lockSummary,
    activeRun,
    backfill,
  });
  const severity = alerts.some((alert) => alert.severity === "error")
    ? "error"
    : alerts.some((alert) => alert.severity === "warn")
      ? "warn"
      : "ok";

  return {
    ok: severity !== "error",
    severity,
    generatedAt: now.toISOString(),
    queue: queueSummary,
    lock: lockSummary,
    activeRun,
    backfill,
    alerts,
  };
}
