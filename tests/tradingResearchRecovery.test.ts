import os from "node:os";

import { describe, expect, it } from "vitest";

import {
  buildResearchRunArtifactPaths,
  recoverResearchRunner,
  readResearchQueue,
  readJsonFile,
  verifyResearchRunArtifacts,
  writeJsonAtomic,
} from "@/lib/trading/research";

import { createMetricSummary, createResearchConfig, createResearchQueue, createResearchTask, createResearchTempDir } from "./helpers/tradingResearchFixtures";

describe("trading research recovery", () => {
  it("recovers a stale completed run and synthesizes missing checksums", async () => {
    const rootDir = await createResearchTempDir();
    const config = await createResearchConfig(rootDir);
    const task = createResearchTask({
      id: "task-recover",
      status: "running",
      started_at: "2026-03-19T10:00:00.000Z",
      last_run_id: "run-recover-001",
      run_fingerprint: "fp-1",
    });
    await writeJsonAtomic(config.paths.queuePath, {
      ...createResearchQueue([task]),
      active_run_id: "run-recover-001",
    });
    await writeJsonAtomic(config.paths.lockPath, {
      version: 1,
      run_id: "run-recover-001",
      task_id: "task-recover",
      runner_pid: 9999,
      hostname: "test",
      started_at: "2026-03-19T10:00:00.000Z",
      heartbeat_at: "2026-03-19T09:00:00.000Z",
      stage: "decision",
      run_fingerprint: "fp-1",
      baseline_id: "baseline-test-live",
    });

    const paths = buildResearchRunArtifactPaths(config.paths.runsDir, "run-recover-001");
    await writeJsonAtomic(paths.manifestPath, { ok: true });
    await writeJsonAtomic(paths.inputPath, { ok: true });
    await writeJsonAtomic(paths.statusPath, { ok: true });
    await writeJsonAtomic(paths.aggregateReportPath, { metric: createMetricSummary() });
    await writeJsonAtomic(paths.crisisReportPath, { metric: createMetricSummary() });
    await writeJsonAtomic(paths.walkForwardReportPath, { metric: createMetricSummary() });
    await writeJsonAtomic(paths.comparisonPath, { ok: true });
    await writeJsonAtomic(paths.decisionPath, {
      run_id: "run-recover-001",
      task_id: "task-recover",
      decision: "promote",
      reason: "Recovered promote.",
      gates: {},
      promoted_metrics: {},
      ranking: {
        score: 77,
        band: "strong",
        components: {
          aggregate: 20,
          crisis: 20,
          walkForward: 20,
          robustness: 20,
          penalties: -3,
        },
      },
      failure_forensics: null,
    });

    const result = await recoverResearchRunner(config);
    expect(result.recovered).toBe(true);

    const queue = await readResearchQueue(config);
    expect(queue.tasks[0].status).toBe("completed");
    expect(queue.tasks[0].decision).toBe("promote");
    expect(queue.active_run_id).toBeNull();
    expect(await verifyResearchRunArtifacts(paths)).toBe(true);
    const status = await readJsonFile<{ status: string; stage: string; error: string | null }>(
      paths.statusPath,
    );
    expect(status.status).toBe("completed");
    expect(status.stage).toBe("completed");
    expect(status.error).toBeNull();
  });

  it("requeues a stale retryable run when attempts remain", async () => {
    const rootDir = await createResearchTempDir();
    const config = await createResearchConfig(rootDir);
    const task = createResearchTask({
      id: "task-retry",
      status: "running",
      attempt: 1,
      max_attempts: 2,
      retryable: true,
      started_at: "2026-03-19T10:00:00.000Z",
      last_run_id: "run-retry-001",
      run_fingerprint: "fp-retry",
    });

    await writeJsonAtomic(config.paths.queuePath, {
      ...createResearchQueue([task]),
      active_run_id: "run-retry-001",
    });
    await writeJsonAtomic(config.paths.lockPath, {
      version: 1,
      run_id: "run-retry-001",
      task_id: "task-retry",
      runner_pid: 9999,
      hostname: "test",
      started_at: "2026-03-19T10:00:00.000Z",
      heartbeat_at: "2026-03-19T09:00:00.000Z",
      stage: "aggregate",
      run_fingerprint: "fp-retry",
      baseline_id: "baseline-test-live",
    });

    const result = await recoverResearchRunner(config);
    expect(result.recovered).toBe(true);
    expect(result.message).toContain("automatic retry");

    const queue = await readResearchQueue(config);
    expect(queue.active_run_id).toBeNull();
    expect(queue.tasks[0].status).toBe("pending");
    expect(queue.tasks[0].attempt).toBe(1);
    expect(queue.tasks[0].error).toContain("Recovered stale or hung lock");
    expect(queue.tasks[0].last_run_id).toBe("run-retry-001");
    expect(queue.tasks[0].run_fingerprint).toBe("fp-retry");

    const paths = buildResearchRunArtifactPaths(config.paths.runsDir, "run-retry-001");
    expect(await verifyResearchRunArtifacts(paths)).toBe(true);
    const decision = await readJsonFile<{ decision: string; operational_failure?: boolean }>(
      paths.decisionPath,
    );
    expect(decision.decision).toBe("reject");
    expect(decision.operational_failure).toBe(true);
  });

  it("requeues a stage-timeout run even when the lock heartbeat is healthy", async () => {
    const rootDir = await createResearchTempDir();
    const config = await createResearchConfig(rootDir);
    config.timing.stageWarnMs = 1000;
    config.timing.stageHardTimeoutMs = 2000;
    const task = createResearchTask({
      id: "task-stage-timeout",
      status: "running",
      attempt: 1,
      max_attempts: 2,
      retryable: true,
      started_at: "2026-03-19T10:00:00.000Z",
      last_run_id: "run-stage-timeout-001",
      run_fingerprint: "fp-stage-timeout",
    });

    await writeJsonAtomic(config.paths.queuePath, {
      ...createResearchQueue([task]),
      active_run_id: "run-stage-timeout-001",
    });
    await writeJsonAtomic(config.paths.lockPath, {
      version: 1,
      run_id: "run-stage-timeout-001",
      task_id: "task-stage-timeout",
      runner_pid: 9999,
      hostname: "test",
      started_at: "2026-03-19T10:00:00.000Z",
      heartbeat_at: new Date().toISOString(),
      stage: "aggregate",
      run_fingerprint: "fp-stage-timeout",
      baseline_id: "baseline-test-live",
    });

    const paths = buildResearchRunArtifactPaths(config.paths.runsDir, "run-stage-timeout-001");
    await writeJsonAtomic(paths.statusPath, {
      run_id: "run-stage-timeout-001",
      task_id: "task-stage-timeout",
      status: "running",
      stage: "aggregate",
      started_at: "2026-03-19T10:00:00.000Z",
      updated_at: new Date().toISOString(),
      stage_started_at: "2026-03-19T10:00:00.000Z",
      completed_stages: [],
      failed_stage: null,
      error: null,
    });

    const result = await recoverResearchRunner(config);
    expect(result.recovered).toBe(true);
    expect(result.message).toContain("automatic retry");

    const queue = await readResearchQueue(config);
    expect(queue.active_run_id).toBeNull();
    expect(queue.tasks[0].status).toBe("pending");
    expect(queue.tasks[0].error).toContain("Recovered stage-timeout run");
  });

  it("recovers a local lock with a dead runner even when the heartbeat is recent", async () => {
    const rootDir = await createResearchTempDir();
    const config = await createResearchConfig(rootDir);
    const task = createResearchTask({
      id: "task-dead-runner",
      status: "running",
      attempt: 1,
      max_attempts: 2,
      retryable: true,
      started_at: "2026-03-19T10:00:00.000Z",
      last_run_id: "run-dead-runner-001",
      run_fingerprint: "fp-dead-runner",
    });

    await writeJsonAtomic(config.paths.queuePath, {
      ...createResearchQueue([task]),
      active_run_id: "run-dead-runner-001",
    });
    await writeJsonAtomic(config.paths.lockPath, {
      version: 1,
      run_id: "run-dead-runner-001",
      task_id: "task-dead-runner",
      runner_pid: 999_999_999,
      hostname: os.hostname(),
      started_at: "2026-03-19T10:00:00.000Z",
      heartbeat_at: new Date().toISOString(),
      stage: "walkforward",
      run_fingerprint: "fp-dead-runner",
      baseline_id: "baseline-test-live",
    });

    const result = await recoverResearchRunner(config);
    expect(result.recovered).toBe(true);
    expect(result.message).toContain("automatic retry");

    const queue = await readResearchQueue(config);
    expect(queue.active_run_id).toBeNull();
    expect(queue.tasks[0].status).toBe("pending");
    expect(queue.tasks[0].error).toContain("Recovered stale or hung lock");
  });
});
