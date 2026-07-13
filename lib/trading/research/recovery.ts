import { appendJsonLine, writeJsonAtomic } from "./fs";
import {
  buildResearchRunArtifactPaths,
  verifyResearchRunCompletionArtifacts,
  writeResearchRunChecksums,
  writeResearchFailureArtifacts,
} from "./artifactContract";
import { classifyResearchFailure } from "./forensics";
import {
  classifyResearchLockHealth,
  isResearchLockRunnerAlive,
  readResearchLock,
  releaseResearchLock,
} from "./lock";
import {
  finalizeResearchTask,
  readResearchQueue,
  requeueResearchTaskForRetry,
  updateResearchTaskStatus,
  writeResearchQueue,
} from "./queue";
import type {
  ResearchConfig,
  ResearchDecisionLedgerEntry,
  ResearchRunDecision,
  ResearchRunStatus,
} from "./types";
import { readJsonIfExists } from "./fs";
import { buildResearchRuntimeHealth } from "./runtimeHealth";

export async function recoverResearchRunner(config: ResearchConfig): Promise<{
  recovered: boolean;
  message: string;
}> {
  const lock = await readResearchLock(config);

  if (!lock) {
    return { recovered: false, message: "No active research lock found." };
  }

  const timeHealth = classifyResearchLockHealth(config, lock);
  const runnerAlive = isResearchLockRunnerAlive(lock);
  const health = runnerAlive === false && timeHealth === "healthy" ? "stale" : timeHealth;
  const runtimeHealth = await buildResearchRuntimeHealth({ config });
  const stageTimedOut =
    runtimeHealth.activeRun.runId === lock.run_id &&
    runtimeHealth.activeRun.stageHealth === "timed_out";

  if (health === "healthy" && !stageTimedOut) {
    return { recovered: false, message: "Active research lock is healthy." };
  }

  const recoveryReason = stageTimedOut
    ? `Recovered stage-timeout run in '${runtimeHealth.activeRun.stage ?? lock.stage}' after ${runtimeHealth.activeRun.stageElapsedMs ?? "unknown"}ms.`
    : "Recovered stale or hung run without complete artifact contract.";

  const queue = await readResearchQueue(config);
  const task = queue.tasks.find((entry) => entry.id === lock.task_id) ?? null;
  const runPaths = buildResearchRunArtifactPaths(config.paths.runsDir, lock.run_id);
  const decision = await readJsonIfExists<ResearchRunDecision>(runPaths.decisionPath);
  const status = await readJsonIfExists<ResearchRunStatus>(runPaths.statusPath);
  const completionArtifactsValid = await verifyResearchRunCompletionArtifacts(runPaths);
  const now = new Date().toISOString();

  if (
    decision &&
    completionArtifactsValid &&
    !decision.operational_failure &&
    status?.status !== "failed"
  ) {
    await writeResearchRunChecksums(runPaths);
    const awaitingDecisionQueue = updateResearchTaskStatus(
      queue,
      lock.task_id,
      "awaiting_decision",
      { last_run_id: lock.run_id, run_fingerprint: lock.run_fingerprint },
    );
    const completedQueue = finalizeResearchTask(awaitingDecisionQueue, lock.task_id, {
      status: "completed",
      finishedAt: now,
      runId: lock.run_id,
      runFingerprint: lock.run_fingerprint,
      decision: decision.decision,
      decisionReason: decision.reason,
    });

    await writeResearchQueue(config, completedQueue);
    if (status) {
      await writeJsonAtomic(runPaths.statusPath, {
        ...status,
        status: "completed",
        stage: "completed",
        updated_at: now,
        failed_stage: null,
        error: null,
      });
    }
    await appendJsonLine(config.paths.decisionsPath, {
      event_id: `evt-recovery-${lock.run_id}`,
      timestamp: now,
      run_id: lock.run_id,
      task_id: lock.task_id,
      baseline_id: lock.baseline_id,
      run_fingerprint: lock.run_fingerprint,
      decision: decision.decision,
      reason: `Recovered completed run: ${decision.reason}`,
      planner_family_id: task?.planner_source?.family_id ?? null,
      planner_template_id: task?.planner_source?.template_id ?? null,
      planner_campaign_id: task?.planner_source?.campaign_id ?? null,
      planner_campaign_objective: task?.planner_source?.campaign_objective ?? null,
      ranking_score: decision.ranking?.score ?? null,
      ranking_band: decision.ranking?.band ?? null,
      failure_forensics: decision.failure_forensics ?? null,
    } satisfies ResearchDecisionLedgerEntry);
    await releaseResearchLock(config);

    return { recovered: true, message: `Recovered completed run '${lock.run_id}'.` };
  }

  const failureForensics = classifyResearchFailure({
    reason: recoveryReason,
    error: recoveryReason,
  });
  const rawFailedStage = runtimeHealth.activeRun.stage ?? lock.stage;
  const failedStage =
    rawFailedStage === "completed" || rawFailedStage === "failed"
      ? status?.stage && status.stage !== "completed" && status.stage !== "failed"
        ? status.stage
        : lock.stage === "completed"
          ? "decision"
          : lock.stage
      : rawFailedStage;
  const recoveryError = stageTimedOut
    ? `${recoveryReason} Artifact contract was incomplete.`
    : "Recovered stale or hung lock without complete artifact contract.";
  const failedStatus: ResearchRunStatus = {
    run_id: lock.run_id,
    task_id: lock.task_id,
    status: "failed",
    stage: "failed",
    started_at: status?.started_at ?? lock.started_at,
    updated_at: now,
    stage_started_at: status?.stage_started_at ?? status?.started_at ?? lock.started_at,
    stage_elapsed_ms: status?.stage_elapsed_ms,
    stage_warn_ms: status?.stage_warn_ms ?? null,
    stage_hard_timeout_ms: status?.stage_hard_timeout_ms ?? null,
    progress_note: status?.progress_note ?? null,
    completed_stages: status?.completed_stages ?? [],
    failed_stage: failedStage,
    error: recoveryError,
  };
  await writeResearchFailureArtifacts({
    paths: runPaths,
    manifest: task
      ? {
          version: 1,
          run_id: lock.run_id,
          task_id: lock.task_id,
          task_type: task.type,
          baseline_id: task.baseline_id,
          run_fingerprint: lock.run_fingerprint,
          started_at: status?.started_at ?? lock.started_at,
          dataset_profile: task.dataset_profile,
          validation_profile: task.validation_profile,
        }
      : null,
    input: task ?? undefined,
    status: failedStatus,
    error: recoveryError,
    failureForensics,
  });
  const canRetry =
    task !== null &&
    task.retryable &&
    task.attempt < task.max_attempts;

  const nextQueue = canRetry
    ? requeueResearchTaskForRetry(queue, lock.task_id, {
        finishedAt: now,
        runId: lock.run_id,
        runFingerprint: lock.run_fingerprint,
        error: recoveryError,
      })
    : finalizeResearchTask(queue, lock.task_id, {
        status: "failed",
        finishedAt: now,
        runId: lock.run_id,
        runFingerprint: lock.run_fingerprint,
        decision: null,
        decisionReason: "Recovered stale run without valid artifacts.",
        error: recoveryError,
      });
  await writeResearchQueue(config, nextQueue);
  await appendJsonLine(config.paths.decisionsPath, {
    event_id: `evt-recovery-failed-${lock.run_id}`,
    timestamp: now,
    run_id: lock.run_id,
    task_id: lock.task_id,
    baseline_id: lock.baseline_id,
    run_fingerprint: lock.run_fingerprint,
    decision: "failed",
    reason: canRetry
      ? `${recoveryReason}; auto-requeued attempt ${task?.attempt ?? 0}/${task?.max_attempts ?? 0}.`
      : recoveryReason,
    error: recoveryError,
    planner_family_id: task?.planner_source?.family_id ?? null,
    planner_template_id: task?.planner_source?.template_id ?? null,
    planner_campaign_id: task?.planner_source?.campaign_id ?? null,
    planner_campaign_objective: task?.planner_source?.campaign_objective ?? null,
    ranking_score: null,
    ranking_band: null,
    failure_forensics: failureForensics,
  } satisfies ResearchDecisionLedgerEntry);
  await releaseResearchLock(config);

  return {
    recovered: true,
    message: canRetry
      ? `Requeued recoverable run '${lock.run_id}' for automatic retry.`
      : `Marked recoverable run '${lock.run_id}' as failed.`,
  };
}
