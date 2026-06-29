import type {
  ResearchDecisionLedgerEntry,
  ResearchQueue,
  ResearchRunStatus,
  ResearchTask,
} from "./types";

type RunSnapshot = {
  runId: string;
  taskId: string | null;
  status: ResearchRunStatus["status"] | "missing";
  stage: ResearchRunStatus["stage"] | null;
  startedAt: string | null;
  updatedAt: string | null;
  failedStage: string | null;
  error: string | null;
};

function latestTimestamp(values: Array<string | null | undefined>) {
  const filtered = values.filter((value): value is string => typeof value === "string" && value.length > 0);
  if (filtered.length === 0) return null;
  return [...filtered].sort((left, right) => right.localeCompare(left))[0] ?? null;
}

function decisionByRunId(decisions: ResearchDecisionLedgerEntry[]) {
  const index = new Map<string, ResearchDecisionLedgerEntry>();
  for (const entry of decisions) {
    if (!entry.run_id) continue;
    const current = index.get(entry.run_id);
    if (!current || entry.timestamp.localeCompare(current.timestamp) > 0) {
      index.set(entry.run_id, entry);
    }
  }
  return index;
}

function taskById(queue: ResearchQueue) {
  return new Map(queue.tasks.map((task) => [task.id, task] as const));
}

function resolveCompletedStatus(
  snapshot: RunSnapshot,
  task: ResearchTask | null,
  decision: ResearchDecisionLedgerEntry | null,
): RunSnapshot {
  const updatedAt = latestTimestamp([snapshot.updatedAt, task?.finished_at, decision?.timestamp]);
  const error =
    task?.status === "failed"
      ? task.error ?? decision?.error ?? decision?.reason ?? snapshot.error
      : snapshot.error;

  if (task?.status === "failed" || decision?.decision === "failed") {
    return {
      ...snapshot,
      status: "failed",
      stage: "failed",
      updatedAt,
      failedStage: snapshot.failedStage ?? snapshot.stage ?? "failed",
      error,
    };
  }

  if (task?.status === "completed" || decision) {
    return {
      ...snapshot,
      status: "completed",
      stage: "completed",
      updatedAt,
      failedStage: null,
      error: null,
    };
  }

  return snapshot;
}

export function canonicalizeResearchRunSnapshot(
  snapshot: RunSnapshot,
  args: {
    queue: ResearchQueue;
    decisions: ResearchDecisionLedgerEntry[];
  },
): RunSnapshot {
  const taskIndex = taskById(args.queue);
  const decisionIndex = decisionByRunId(args.decisions);
  const task = snapshot.taskId ? (taskIndex.get(snapshot.taskId) ?? null) : null;
  const decision = decisionIndex.get(snapshot.runId) ?? null;

  if (!task && !decision) return snapshot;
  if (snapshot.status === "completed" || snapshot.status === "failed") {
    return resolveCompletedStatus(snapshot, task, decision);
  }
  if (task?.status === "completed" || task?.status === "failed" || decision) {
    return resolveCompletedStatus(snapshot, task, decision);
  }
  return snapshot;
}
