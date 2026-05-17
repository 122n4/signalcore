import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { buildResearchRunArtifactPaths } from "@/lib/trading/research/artifactContract";
import { loadResearchConfig } from "@/lib/trading/research/config";
import { readJsonIfExists } from "@/lib/trading/research/fs";
import { readResearchQueue } from "@/lib/trading/research/queue";
import { buildResearchRuntimeHealth } from "@/lib/trading/research/runtimeHealth";
import type {
  ResearchBaselineManifest,
  ResearchConfig,
  ResearchMetricSummary,
  ResearchQueue,
  ResearchRunStatus,
  ResearchTaskStatus,
} from "@/lib/trading/research/types";

export type ResearchLabDecisionEntry = {
  timestamp: string | null;
  runId: string | null;
  taskId: string | null;
  decision: "candidate" | "failed" | "promote" | "reject" | string;
  reason: string | null;
  campaignId: string | null;
  campaignObjective: string | null;
  rankingScore: number | null;
  rankingBand: string | null;
  aggregateSummary: ResearchMetricSummary | null;
  crisisSummary: ResearchMetricSummary | null;
  walkforwardSummary: ResearchMetricSummary | null;
  failureSummary: string | null;
};

export type ResearchLabRunEntry = {
  runId: string;
  taskId: string | null;
  status: ResearchRunStatus["status"] | "missing";
  stage: ResearchRunStatus["stage"] | null;
  startedAt: string | null;
  updatedAt: string | null;
  failedStage: string | null;
  error: string | null;
};

export type ResearchLabOverview = {
  generatedAt: string;
  config: {
    queueId: string;
    baselineId: string;
    datasetProfile: string;
    validationProfile: string;
    instruments: string[];
    timeframes: string[];
    paths: {
      queuePath: string;
      runsDir: string;
      decisionsPath: string;
    };
  };
  runtime: Awaited<ReturnType<typeof buildResearchRuntimeHealth>>;
  baseline: ResearchBaselineManifest | null;
  queue: {
    activeRunId: string | null;
    idleReason: string | null;
    counts: Record<ResearchTaskStatus, number>;
    recentTasks: Array<{
      id: string;
      type: string;
      status: ResearchTaskStatus;
      priority: number;
      decision: string | null;
      campaignId: string | null;
      campaignObjective: string | null;
      error: string | null;
      createdAt: string;
      finishedAt: string | null;
    }>;
  };
  decisions: {
    counts: Record<string, number>;
    recent: ResearchLabDecisionEntry[];
    promotedOrCandidate: ResearchLabDecisionEntry[];
    rejectedOrFailed: ResearchLabDecisionEntry[];
  };
  runs: {
    recent: ResearchLabRunEntry[];
  };
  operatorActions: Array<{
    label: string;
    command: string;
    note: string;
  }>;
  storage: {
    localArtifactBacked: boolean;
    note: string;
  };
};

const TASK_STATUSES: ResearchTaskStatus[] = [
  "pending",
  "running",
  "awaiting_decision",
  "completed",
  "failed",
  "blocked",
  "cancelled",
];

function emptyTaskCounts(): Record<ResearchTaskStatus, number> {
  return Object.fromEntries(TASK_STATUSES.map((status) => [status, 0])) as Record<ResearchTaskStatus, number>;
}

function metricSummary(value: unknown): ResearchMetricSummary | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<ResearchMetricSummary>;
  if (!Number.isFinite(Number(raw.totalTrades))) return null;
  return {
    totalTrades: Number(raw.totalTrades),
    winRate: Number(raw.winRate ?? 0),
    averageRiskReward: raw.averageRiskReward === null ? null : Number(raw.averageRiskReward ?? 0),
    expectancy: Number(raw.expectancy ?? 0),
    profitFactor: raw.profitFactor === null ? null : Number(raw.profitFactor ?? 0),
    maxDrawdown: Number(raw.maxDrawdown ?? 0),
  };
}

function normalizeDecision(raw: any): ResearchLabDecisionEntry | null {
  if (!raw || typeof raw !== "object") return null;
  return {
    timestamp: typeof raw.timestamp === "string" ? raw.timestamp : null,
    runId: typeof raw.run_id === "string" ? raw.run_id : null,
    taskId: typeof raw.task_id === "string" ? raw.task_id : null,
    decision: String(raw.decision ?? "unknown"),
    reason: typeof raw.reason === "string" ? raw.reason : null,
    campaignId: typeof raw.planner_campaign_id === "string" ? raw.planner_campaign_id : null,
    campaignObjective: typeof raw.planner_campaign_objective === "string" ? raw.planner_campaign_objective : null,
    rankingScore: Number.isFinite(Number(raw.ranking_score)) ? Number(raw.ranking_score) : null,
    rankingBand: typeof raw.ranking_band === "string" ? raw.ranking_band : null,
    aggregateSummary: metricSummary(raw.aggregate_summary),
    crisisSummary: metricSummary(raw.crisis_summary),
    walkforwardSummary: metricSummary(raw.walkforward_summary),
    failureSummary:
      typeof raw.failure_forensics?.summary === "string"
        ? raw.failure_forensics.summary
        : typeof raw.error === "string"
          ? raw.error
          : null,
  };
}

async function readDecisionEntries(decisionsPath: string): Promise<ResearchLabDecisionEntry[]> {
  try {
    const text = await readFile(decisionsPath, "utf8");
    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return normalizeDecision(JSON.parse(line));
        } catch {
          return null;
        }
      })
      .filter((entry): entry is ResearchLabDecisionEntry => Boolean(entry))
      .sort((left, right) => String(right.timestamp ?? "").localeCompare(String(left.timestamp ?? "")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function readRecentRuns(config: ResearchConfig, limit = 16): Promise<ResearchLabRunEntry[]> {
  let runDirs: string[] = [];
  try {
    runDirs = (await readdir(config.paths.runsDir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const runs = await Promise.all(
    runDirs.slice(-200).map(async (runId) => {
      const paths = buildResearchRunArtifactPaths(config.paths.runsDir, runId);
      const status = await readJsonIfExists<ResearchRunStatus>(paths.statusPath);
      return {
        runId,
        taskId: status?.task_id ?? null,
        status: status?.status ?? "missing",
        stage: status?.stage ?? null,
        startedAt: status?.started_at ?? null,
        updatedAt: status?.updated_at ?? null,
        failedStage: status?.failed_stage ?? null,
        error: status?.error ?? null,
      } satisfies ResearchLabRunEntry;
    }),
  );

  return runs
    .sort((left, right) => String(right.updatedAt ?? right.startedAt ?? "").localeCompare(String(left.updatedAt ?? left.startedAt ?? "")))
    .slice(0, limit);
}

function summarizeQueue(queue: ResearchQueue): ResearchLabOverview["queue"] {
  const counts = emptyTaskCounts();
  for (const task of queue.tasks) {
    counts[task.status] += 1;
  }

  return {
    activeRunId: queue.active_run_id,
    idleReason: queue.idle_reason,
    counts,
    recentTasks: [...queue.tasks]
      .sort((left, right) => String(right.finished_at ?? right.started_at ?? right.created_at).localeCompare(String(left.finished_at ?? left.started_at ?? left.created_at)))
      .slice(0, 14)
      .map((task) => ({
        id: task.id,
        type: task.type,
        status: task.status,
        priority: task.priority,
        decision: task.decision,
        campaignId: task.planner_source?.campaign_id ?? null,
        campaignObjective: task.planner_source?.campaign_objective ?? null,
        error: task.error,
        createdAt: task.created_at,
        finishedAt: task.finished_at,
      })),
  };
}

export async function buildResearchLabOverview(args: {
  config?: ResearchConfig;
  now?: Date;
} = {}): Promise<ResearchLabOverview> {
  const config = args.config ?? await loadResearchConfig();
  const generatedAt = (args.now ?? new Date()).toISOString();
  const baselinePath = path.join(
    config.paths.baselinesDir,
    config.liveBaselineSource.baselineId,
    "baseline-manifest.json",
  );
  const [runtime, queue, baseline, decisions, recentRuns] = await Promise.all([
    buildResearchRuntimeHealth({ config, now: args.now }),
    readResearchQueue(config, { createIfMissing: false }),
    readJsonIfExists<ResearchBaselineManifest>(baselinePath),
    readDecisionEntries(config.paths.decisionsPath),
    readRecentRuns(config),
  ]);
  const decisionCounts = decisions.reduce<Record<string, number>>((acc, entry) => {
    acc[entry.decision] = (acc[entry.decision] ?? 0) + 1;
    return acc;
  }, {});
  const promotedOrCandidate = decisions
    .filter((entry) => entry.decision === "promote" || entry.decision === "candidate")
    .slice(0, 10);
  const rejectedOrFailed = decisions
    .filter((entry) => entry.decision === "reject" || entry.decision === "failed")
    .slice(0, 14);

  return {
    generatedAt,
    config: {
      queueId: config.queueId,
      baselineId: config.liveBaselineSource.baselineId,
      datasetProfile: config.liveBaselineSource.datasetProfile,
      validationProfile: config.liveBaselineSource.validationProfile,
      instruments: config.study.instruments,
      timeframes: config.study.timeframes,
      paths: {
        queuePath: config.paths.queuePath,
        runsDir: config.paths.runsDir,
        decisionsPath: config.paths.decisionsPath,
      },
    },
    runtime,
    baseline,
    queue: summarizeQueue(queue),
    decisions: {
      counts: decisionCounts,
      recent: decisions.slice(0, 18),
      promotedOrCandidate,
      rejectedOrFailed,
    },
    runs: {
      recent: recentRuns,
    },
    operatorActions: [
      {
        label: "Start supervisor",
        command: "npm run research:supervisor:start",
        note: "Starts the local Windows supervisor that actually runs the lab.",
      },
      {
        label: "Recover active run",
        command: "npm run research:recover",
        note: "Use when the lab reports a stale lock, hung stage, or incomplete artifact contract.",
      },
      {
        label: "Backfill market data",
        command: "npm run research:data-backfill",
        note: "Downloads supported missing historical files before new candidates are trusted.",
      },
      {
        label: "Runtime health",
        command: "npm run research:lab-health",
        note: "Prints the same core health object used by this page.",
      },
    ],
    storage: {
      localArtifactBacked: Boolean(baseline || decisions.length > 0 || recentRuns.length > 0),
      note: baseline || decisions.length > 0 || recentRuns.length > 0
        ? "This view is reading local research artifacts from the current workspace."
        : "No local lab artifacts are available in this runtime. Sync lab state to Supabase to make this page complete in production.",
    },
  };
}
