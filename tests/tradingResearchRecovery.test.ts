import { describe, expect, it } from "vitest";

import {
  buildResearchRunArtifactPaths,
  recoverResearchRunner,
  readResearchQueue,
  writeJsonAtomic,
} from "@/lib/trading/research";

import { createMetricSummary, createResearchConfig, createResearchQueue, createResearchTask, createResearchTempDir } from "./helpers/tradingResearchFixtures";

describe("trading research recovery", () => {
  it("recovers a stale completed run and finalizes the queue", async () => {
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
    await writeJsonAtomic(paths.checksumsPath, { ok: true });

    const result = await recoverResearchRunner(config);
    expect(result.recovered).toBe(true);

    const queue = await readResearchQueue(config);
    expect(queue.tasks[0].status).toBe("completed");
    expect(queue.tasks[0].decision).toBe("promote");
    expect(queue.active_run_id).toBeNull();
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
  });
});
