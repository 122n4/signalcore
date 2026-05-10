import {
  type ResearchIdleReason,
  type ResearchQueue,
  type ResearchTask,
  type ResearchTaskStatus,
  type ResearchTaskType,
  type ResearchValidationProfileId,
  type ResearchDatasetProfile,
} from "./types";

const TASK_TYPES = new Set<ResearchTaskType>([
  "baseline_validation",
  "risk_shaping",
  "context_filter",
  "session_nuance",
  "clarity_threshold",
  "behavior_control",
  "promotion_apply",
]);

const TASK_STATUSES = new Set<ResearchTaskStatus>([
  "pending",
  "running",
  "awaiting_decision",
  "completed",
  "failed",
  "blocked",
  "cancelled",
]);

const DATASET_PROFILES = new Set<ResearchDatasetProfile>([
  "core_20y",
  "crisis_windows",
  "walkforward_full",
]);

const VALIDATION_PROFILES = new Set<ResearchValidationProfileId>([
  "default_live_safe",
  "elite_push",
]);

const IDLE_REASONS = new Set<ResearchIdleReason>([
  "candidate_library_empty",
  "no_enabled_candidates",
  "no_supported_candidates",
  "no_valid_validation_profile",
  "no_compatible_candidates_for_current_baseline",
  "no_campaign_qualified_candidates",
  "no_data_quality_qualified_candidates",
  "all_candidates_deduped_for_current_baseline",
]);

export function createEmptyResearchQueue(args: {
  queueId: string;
  liveBaselineId?: string | null;
  now?: string;
}): ResearchQueue {
  return {
    version: 1,
    queue_id: args.queueId,
    updated_at: args.now ?? new Date().toISOString(),
    live_baseline_id: args.liveBaselineId ?? null,
    active_run_id: null,
    idle_reason: null,
    tasks: [],
  };
}

export function assertValidResearchQueue(input: unknown): asserts input is ResearchQueue {
  if (!input || typeof input !== "object") {
    throw new Error("Research queue must be an object.");
  }

  const queue = input as ResearchQueue;
  if (queue.version !== 1) {
    throw new Error(`Unsupported research queue version '${String(queue.version)}'.`);
  }
  if (typeof queue.queue_id !== "string" || queue.queue_id.trim().length === 0) {
    throw new Error("Research queue is missing queue_id.");
  }
  if (queue.idle_reason !== null && !IDLE_REASONS.has(queue.idle_reason)) {
    throw new Error(`Unsupported research idle reason '${String(queue.idle_reason)}'.`);
  }
  if (!Array.isArray(queue.tasks)) {
    throw new Error("Research queue tasks must be an array.");
  }

  for (const task of queue.tasks) {
    assertValidResearchTask(task);
  }
}

export function assertValidResearchTask(task: unknown): asserts task is ResearchTask {
  if (!task || typeof task !== "object") {
    throw new Error("Research task must be an object.");
  }

  const normalized = task as ResearchTask;

  if (!TASK_TYPES.has(normalized.type)) {
    throw new Error(`Unsupported research task type '${String(normalized.type)}'.`);
  }
  if (!TASK_STATUSES.has(normalized.status)) {
    throw new Error(`Unsupported research task status '${String(normalized.status)}'.`);
  }
  if (!DATASET_PROFILES.has(normalized.dataset_profile)) {
    throw new Error(`Unsupported dataset profile '${String(normalized.dataset_profile)}'.`);
  }
  if (!VALIDATION_PROFILES.has(normalized.validation_profile)) {
    throw new Error(
      `Unsupported validation profile '${String(normalized.validation_profile)}'.`,
    );
  }
  if (typeof normalized.id !== "string" || normalized.id.trim().length === 0) {
    throw new Error("Research task is missing id.");
  }
  if (typeof normalized.priority !== "number") {
    throw new Error(`Research task '${normalized.id}' is missing numeric priority.`);
  }
  if (typeof normalized.baseline_id !== "string" || normalized.baseline_id.trim().length === 0) {
    throw new Error(`Research task '${normalized.id}' is missing baseline_id.`);
  }
  if (!normalized.engine_scope || typeof normalized.engine_scope !== "object") {
    throw new Error(`Research task '${normalized.id}' is missing engine_scope.`);
  }
}
