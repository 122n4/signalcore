import { describe, expect, it } from "vitest";

import { buildResearchRuntimeHealth, fileExists, readJsonFile, writeJsonAtomic } from "@/lib/trading/research";

import {
  createResearchConfig,
  createResearchQueue,
  createResearchTask,
  createResearchTempDir,
} from "./helpers/tradingResearchFixtures";

describe("trading research runtime health", () => {
  it("does not create the research queue while rendering read-only health", async () => {
    const rootDir = await createResearchTempDir();
    const config = await createResearchConfig(rootDir);

    expect(await fileExists(config.paths.queuePath)).toBe(false);

    const health = await buildResearchRuntimeHealth({
      config,
      now: new Date("2026-05-17T15:00:00.000Z"),
    });

    expect(health.queue.activeRunId).toBeNull();
    expect(health.queue.pending).toBe(0);
    expect(await fileExists(config.paths.queuePath)).toBe(false);
  });

  it("canonicalizes an active run against queue and decision truth before reporting health", async () => {
    const rootDir = await createResearchTempDir();
    const config = await createResearchConfig(rootDir);
    const task = createResearchTask({
      id: "task-runtime-canonical",
      status: "completed",
      last_run_id: "run-runtime-canonical",
      finished_at: "2026-05-17T14:30:00.000Z",
      decision: "reject",
      decision_reason: "Hard gates failed.",
    });
    await writeJsonAtomic(
      config.paths.queuePath,
      {
        ...createResearchQueue([task]),
        active_run_id: "run-runtime-canonical",
      },
    );
    const statusPath = `${config.paths.runsDir}\\run-runtime-canonical\\status.json`;
    await writeJsonAtomic(statusPath, {
      run_id: "run-runtime-canonical",
      task_id: task.id,
      status: "running",
      stage: "aggregate",
      started_at: "2026-05-17T14:00:00.000Z",
      updated_at: "2026-05-17T14:05:00.000Z",
      completed_stages: [],
      progress_note: "stale",
    });

    const health = await buildResearchRuntimeHealth({
      config,
      now: new Date("2026-05-17T15:00:00.000Z"),
    });

    expect(health.activeRun.runId).toBe("run-runtime-canonical");
    expect(health.activeRun.taskId).toBe(task.id);
    expect(health.activeRun.status).toBe("completed");
    expect(health.activeRun.stage).toBe("completed");

    const rewritten = await readJsonFile<{ status: string; stage: string }>(statusPath);
    expect(rewritten.status).toBe("completed");
    expect(rewritten.stage).toBe("completed");
  });
});
