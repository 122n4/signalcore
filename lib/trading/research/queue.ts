import { writeJsonAtomic, readJsonIfExists } from "./fs";
import { createEmptyResearchQueue, assertValidResearchQueue } from "./queueSchema";
import { assertResearchTaskStatusTransition } from "./stateMachine";
import type {
  ResearchConfig,
  ResearchDecision,
  ResearchIdleReason,
  ResearchQueue,
  ResearchTask,
  ResearchTaskStatus,
} from "./types";

export async function readResearchQueue(
  config: ResearchConfig,
  options: { createIfMissing?: boolean } = {},
): Promise<ResearchQueue> {
  const queue = await readJsonIfExists<ResearchQueue>(config.paths.queuePath);

  if (!queue) {
    const created = createEmptyResearchQueue({
      queueId: config.queueId,
      liveBaselineId: config.liveBaselineSource.baselineId,
    });
    if (options.createIfMissing !== false) {
      await writeResearchQueue(config, created);
    }
    return created;
  }

  const normalizedQueue: ResearchQueue = {
    ...queue,
    idle_reason: queue.idle_reason ?? null,
  };

  assertValidResearchQueue(normalizedQueue);
  return normalizedQueue;
}

export async function writeResearchQueue(config: ResearchConfig, queue: ResearchQueue): Promise<void> {
  await writeJsonAtomic(config.paths.queuePath, {
    ...queue,
    updated_at: new Date().toISOString(),
  });
}

export function selectNextResearchTask(queue: ResearchQueue): ResearchTask | null {
  return (
    [...queue.tasks]
      .filter((task) => task.status === "pending")
      .sort((left, right) => {
        if (left.priority !== right.priority) {
          return right.priority - left.priority;
        }
        if (left.created_at !== right.created_at) {
          return left.created_at.localeCompare(right.created_at);
        }
        return left.id.localeCompare(right.id);
      })[0] ?? null
  );
}

export function updateResearchTaskStatus(
  queue: ResearchQueue,
  taskId: string,
  nextStatus: ResearchTaskStatus,
  extra: Partial<ResearchTask> = {},
): ResearchQueue {
  return {
    ...queue,
    tasks: queue.tasks.map((task) => {
      if (task.id !== taskId) {
        return task;
      }

      assertResearchTaskStatusTransition(task.status, nextStatus);
      return {
        ...task,
        ...extra,
        status: nextStatus,
      };
    }),
  };
}

export function setResearchQueueActiveRun(
  queue: ResearchQueue,
  runId: string | null,
): ResearchQueue {
  return {
    ...queue,
    active_run_id: runId,
    idle_reason: runId ? null : queue.idle_reason,
  };
}

export function appendResearchTask(queue: ResearchQueue, task: ResearchTask): ResearchQueue {
  return {
    ...queue,
    idle_reason: null,
    tasks: [...queue.tasks, task],
  };
}

export function setResearchQueueIdleReason(
  queue: ResearchQueue,
  reason: ResearchIdleReason | null,
): ResearchQueue {
  return {
    ...queue,
    idle_reason: reason,
  };
}

export function finalizeResearchTask(
  queue: ResearchQueue,
  taskId: string,
  args: {
    status: "completed" | "failed" | "blocked";
    finishedAt: string;
    runId: string | null;
    runFingerprint: string | null;
    decision: ResearchDecision | null;
    decisionReason: string | null;
    error?: string | null;
  },
): ResearchQueue {
  const updated = queue.tasks.map((task) => {
    if (task.id !== taskId) {
      return task;
    }

    assertResearchTaskStatusTransition(task.status, args.status);

    return {
      ...task,
      status: args.status,
      finished_at: args.finishedAt,
      last_run_id: args.runId,
      run_fingerprint: args.runFingerprint,
      decision: args.decision,
      decision_reason: args.decisionReason,
      error: args.error ?? null,
    };
  });

  return {
    ...queue,
    active_run_id: null,
    idle_reason: queue.idle_reason,
    tasks: updated,
  };
}

export function requeueResearchTaskForRetry(
  queue: ResearchQueue,
  taskId: string,
  args: {
    finishedAt: string;
    runId: string | null;
    runFingerprint: string | null;
    error: string;
  },
): ResearchQueue {
  const failedQueue = finalizeResearchTask(queue, taskId, {
    status: "failed",
    finishedAt: args.finishedAt,
    runId: args.runId,
    runFingerprint: args.runFingerprint,
    decision: null,
    decisionReason: "Recovered stale run and scheduled an automatic retry.",
    error: args.error,
  });

  const retriedQueue = updateResearchTaskStatus(failedQueue, taskId, "pending", {
    started_at: null,
    finished_at: null,
    decision: null,
    decision_reason: null,
    error: args.error,
  });

  return {
    ...retriedQueue,
    active_run_id: null,
    idle_reason: null,
  };
}
