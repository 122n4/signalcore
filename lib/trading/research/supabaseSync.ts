import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

import { buildResearchRunArtifactPaths } from "./artifactContract";
import { loadResearchConfig } from "./config";
import { readJsonIfExists } from "./fs";
import { readResearchQueue } from "./queue";
import { buildResearchRuntimeHealth } from "./runtimeHealth";
import type {
  ResearchBaselineManifest,
  ResearchConfig,
  ResearchDecisionLedgerEntry,
  ResearchMetricSummary,
  ResearchRunComparison,
  ResearchRunStatus,
} from "./types";

export type ResearchSupabaseSyncResult = {
  ok: boolean;
  generatedAt: string;
  schemaReady: boolean;
  stateSynced: boolean;
  runsSynced: number;
  decisionsSynced: number;
  error: string | null;
};

export type ResearchRemoteSnapshot = {
  schemaReady: boolean;
  error: string | null;
  state: any | null;
  runs: any[];
  decisions: any[];
};

function metric(value: unknown): ResearchMetricSummary | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<ResearchMetricSummary>;
  if (!Number.isFinite(Number(raw.totalTrades))) return null;
  return {
    totalTrades: Number(raw.totalTrades),
    winRate: Number(raw.winRate ?? 0),
    averageRiskReward: raw.averageRiskReward == null ? null : Number(raw.averageRiskReward),
    expectancy: Number(raw.expectancy ?? 0),
    profitFactor: raw.profitFactor == null ? null : Number(raw.profitFactor),
    maxDrawdown: Number(raw.maxDrawdown ?? 0),
  };
}

function isoOrNull(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function isMissingSchemaError(error: any) {
  const message = String(error?.message || error || "").toLowerCase();
  return (
    error?.code === "42P01" ||
    error?.code === "PGRST116" ||
    message.includes("does not exist") ||
    message.includes("schema cache") ||
    message.includes("research_lab_")
  );
}

async function readDecisionEntries(decisionsPath: string, limit: number) {
  try {
    const text = await readFile(decisionsPath, "utf8");
    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line) as ResearchDecisionLedgerEntry;
        } catch {
          return null;
        }
      })
      .filter((entry): entry is ResearchDecisionLedgerEntry => Boolean(entry))
      .sort((left, right) => String(right.timestamp).localeCompare(String(left.timestamp)))
      .slice(0, limit);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function readRecentRunRows(config: ResearchConfig, limit: number) {
  let runDirs: string[] = [];
  try {
    runDirs = (await readdir(config.paths.runsDir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const rows = await Promise.all(
    runDirs.slice(-300).map(async (runId) => {
      const paths = buildResearchRunArtifactPaths(config.paths.runsDir, runId);
      const [status, comparison] = await Promise.all([
        readJsonIfExists<ResearchRunStatus>(paths.statusPath),
        readJsonIfExists<ResearchRunComparison>(paths.comparisonPath),
      ]);
      const aggregate = metric(comparison?.aggregate?.current);
      const crisis = metric(comparison?.crisis?.current);
      const walkForward = metric(comparison?.walkForward?.current);
      return {
        run_id: runId,
        task_id: status?.task_id ?? null,
        status: status?.status ?? "missing",
        stage: status?.stage ?? null,
        started_at: isoOrNull(status?.started_at),
        updated_at: isoOrNull(status?.updated_at ?? status?.started_at),
        completed_at: status?.status === "completed" ? isoOrNull(status.updated_at) : null,
        profit_factor: aggregate?.profitFactor ?? null,
        win_rate: aggregate?.winRate ?? null,
        expectancy: aggregate?.expectancy ?? null,
        max_drawdown: aggregate?.maxDrawdown ?? null,
        aggregate_summary: aggregate,
        crisis_summary: crisis,
        walkforward_summary: walkForward,
        error: status?.error ?? null,
        payload: {
          status,
          comparison,
          paths: {
            statusPath: paths.statusPath,
            comparisonPath: paths.comparisonPath,
          },
        },
        synced_at: new Date().toISOString(),
      };
    }),
  );

  return rows
    .sort((left, right) =>
      String(right.updated_at ?? right.started_at ?? "").localeCompare(String(left.updated_at ?? left.started_at ?? "")),
    )
    .slice(0, limit);
}

function summarizeQueue(queue: Awaited<ReturnType<typeof readResearchQueue>>) {
  const counts = queue.tasks.reduce<Record<string, number>>((acc, task) => {
    acc[task.status] = (acc[task.status] ?? 0) + 1;
    return acc;
  }, {});
  return {
    activeRunId: queue.active_run_id,
    idleReason: queue.idle_reason,
    counts,
    recentTasks: [...queue.tasks]
      .sort((left, right) =>
        String(right.finished_at ?? right.started_at ?? right.created_at).localeCompare(
          String(left.finished_at ?? left.started_at ?? left.created_at),
        ),
      )
      .slice(0, 20),
  };
}

function decisionRow(entry: ResearchDecisionLedgerEntry) {
  const aggregate = metric(entry.aggregate_summary);
  const crisis = metric(entry.crisis_summary);
  const walkForward = metric(entry.walkforward_summary);
  return {
    event_id: entry.event_id,
    timestamp: isoOrNull(entry.timestamp) ?? new Date().toISOString(),
    run_id: entry.run_id ?? null,
    task_id: entry.task_id ?? null,
    decision: String(entry.decision ?? "unknown"),
    reason: entry.reason ?? null,
    profit_factor: aggregate?.profitFactor ?? null,
    win_rate: aggregate?.winRate ?? null,
    expectancy: aggregate?.expectancy ?? null,
    max_drawdown: aggregate?.maxDrawdown ?? null,
    aggregate_summary: aggregate,
    crisis_summary: crisis,
    walkforward_summary: walkForward,
    error: entry.error ?? null,
    payload: entry,
    synced_at: new Date().toISOString(),
  };
}

export function researchSupabaseSyncEnabled() {
  return String(process.env.RESEARCH_SUPABASE_SYNC ?? "1").trim() !== "0";
}

export async function buildResearchSupabasePayload(args: {
  config?: ResearchConfig;
  runLimit?: number;
  decisionLimit?: number;
} = {}) {
  const config = args.config ?? await loadResearchConfig();
  const generatedAt = new Date().toISOString();
  const baselinePath = path.join(
    config.paths.baselinesDir,
    config.liveBaselineSource.baselineId,
    "baseline-manifest.json",
  );
  const [runtime, queue, baseline, runs, decisions] = await Promise.all([
    buildResearchRuntimeHealth({ config }),
    readResearchQueue(config, { createIfMissing: false }),
    readJsonIfExists<ResearchBaselineManifest>(baselinePath),
    readRecentRunRows(config, args.runLimit ?? 80),
    readDecisionEntries(config.paths.decisionsPath, args.decisionLimit ?? 300),
  ]);
  const lastSuccessfulRunAt =
    runs.find((run) => run.status === "completed")?.updated_at ??
    decisions.find((entry) => entry.decision === "promote" || entry.decision === "candidate" || entry.decision === "reject")?.timestamp ??
    null;
  const lastError =
    runtime.alerts.find((alert) => alert.severity === "error")?.message ??
    runs.find((run) => run.error)?.error ??
    decisions.find((entry) => entry.error)?.error ??
    null;

  return {
    generatedAt,
    runtime,
    dataHunter: runtime.dataHunter,
    queue,
    queueOverview: summarizeQueue(queue),
    baseline,
    runs,
    decisions,
    stateRow: {
      id: "default",
      generated_at: generatedAt,
      severity: runtime.severity,
      status: runtime.queue.activeRunId ? "running" : runtime.queue.idleReason ? "idle" : runtime.severity,
      heartbeat_at: isoOrNull(runtime.lock.heartbeatAt),
      heartbeat_age_ms: runtime.lock.heartbeatAgeMs,
      active_run_id: runtime.queue.activeRunId,
      idle_reason: runtime.queue.idleReason,
      lock_health: runtime.lock.health,
      stage: runtime.activeRun.stage,
      last_successful_run_at: isoOrNull(lastSuccessfulRunAt),
      last_error: lastError,
      payload: {
        generatedAt,
        runtime,
        dataHunter: runtime.dataHunter,
        queueOverview: summarizeQueue(queue),
        baseline,
      },
    },
    decisionRows: decisions.map(decisionRow),
  };
}

export async function syncResearchLabToSupabase(args: {
  config?: ResearchConfig;
  runLimit?: number;
  decisionLimit?: number;
} = {}): Promise<ResearchSupabaseSyncResult> {
  const generatedAt = new Date().toISOString();
  if (!researchSupabaseSyncEnabled()) {
    return {
      ok: true,
      generatedAt,
      schemaReady: false,
      stateSynced: false,
      runsSynced: 0,
      decisionsSynced: 0,
      error: "research_supabase_sync_disabled",
    };
  }

  try {
    const sb = getSupabaseAdmin();
    const payload = await buildResearchSupabasePayload(args);
    const state = await sb.from("research_lab_state").upsert(payload.stateRow, { onConflict: "id" });
    if (state.error) throw state.error;

    let runsSynced = 0;
    if (payload.runs.length > 0) {
      const runRes = await sb.from("research_lab_runs").upsert(payload.runs, { onConflict: "run_id" });
      if (runRes.error) throw runRes.error;
      runsSynced = payload.runs.length;
    }

    let decisionsSynced = 0;
    if (payload.decisionRows.length > 0) {
      const decisionRes = await sb
        .from("research_lab_decisions")
        .upsert(payload.decisionRows, { onConflict: "event_id" });
      if (decisionRes.error) throw decisionRes.error;
      decisionsSynced = payload.decisionRows.length;
    }

    return {
      ok: true,
      generatedAt: payload.generatedAt,
      schemaReady: true,
      stateSynced: true,
      runsSynced,
      decisionsSynced,
      error: null,
    };
  } catch (error: any) {
    return {
      ok: false,
      generatedAt,
      schemaReady: !isMissingSchemaError(error),
      stateSynced: false,
      runsSynced: 0,
      decisionsSynced: 0,
      error: error?.message || "research_supabase_sync_failed",
    };
  }
}

export async function readResearchLabRemoteSnapshot(args: {
  runLimit?: number;
  decisionLimit?: number;
} = {}): Promise<ResearchRemoteSnapshot> {
  try {
    const sb = getSupabaseAdmin();
    const [stateRes, runsRes, decisionsRes] = await Promise.all([
      sb.from("research_lab_state").select("*").eq("id", "default").maybeSingle(),
      sb
        .from("research_lab_runs")
        .select("*")
        .order("updated_at", { ascending: false, nullsFirst: false })
        .limit(args.runLimit ?? 40),
      sb
        .from("research_lab_decisions")
        .select("*")
        .order("timestamp", { ascending: false })
        .limit(args.decisionLimit ?? 80),
    ]);
    const error = stateRes.error ?? runsRes.error ?? decisionsRes.error;
    if (error) throw error;
    return {
      schemaReady: true,
      error: null,
      state: stateRes.data ?? null,
      runs: runsRes.data ?? [],
      decisions: decisionsRes.data ?? [],
    };
  } catch (error: any) {
    return {
      schemaReady: !isMissingSchemaError(error),
      error: error?.message || "research_lab_remote_read_failed",
      state: null,
      runs: [],
      decisions: [],
    };
  }
}
