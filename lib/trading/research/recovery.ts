import { appendJsonLine } from "./fs";
import { buildResearchRunArtifactPaths, verifyResearchRunArtifacts } from "./artifactContract";
import { classifyResearchFailure } from "./forensics";
import { classifyResearchLockHealth, readResearchLock, releaseResearchLock } from "./lock";
import {
  finalizeResearchTask,
  readResearchQueue,
  requeueResearchTaskForRetry,
  updateResearchTaskStatus,
  writeResearchQueue,
} from "./queue";
import type { ResearchConfig, ResearchDecisionLedgerEntry, ResearchRunDecision } from "./types";
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

  const health = classifyResearchLockHealth(config, lock);
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
  const artifactsValid = await verifyResearchRunArtifacts(runPaths);
  const now = new Date().toISOString();

  if (decision && artifactsValid) {
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
  const recoveryError = stageTimedOut
    ? `${recoveryReason} Artifact contract was incomplete.`
    : "Recovered stale or hung lock without complete artifact contract.";
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
