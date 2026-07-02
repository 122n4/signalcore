import path from "node:path";
import os from "node:os";
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

  it("uses the data hunter coverage ledger as the canonical ops summary when raw backfill scope is narrower", async () => {
    const rootDir = await createResearchTempDir();
    const config = await createResearchConfig(rootDir);
    const reportsDir = path.join(config.paths.reportsDir, "datasets");
    const backfillPath = path.join(reportsDir, "market-data-backfill-latest.json");
    const hunterPath = path.join(reportsDir, "research-data-hunter-latest.json");

    await writeJsonAtomic(backfillPath, {
      generatedAt: "2026-06-30T00:41:54.008Z",
      after: {
        summary: {
          existing: 198,
          missingDownloadable: 0,
          missingManual: 0,
          unsupported: 0,
        },
      },
      outputs: {
        jsonPath: backfillPath,
        markdownPath: path.join(reportsDir, "market-data-backfill-latest.md"),
      },
    });

    await writeJsonAtomic(hunterPath, {
      ok: true,
      status: "needs_sources",
      generatedAt: "2026-06-29T20:39:05.365Z",
      nextAction: "Lab can keep running, but 0 manual gaps and 7 unsupported periods need a new official source or manual dataset.",
      coverage: {
        instruments: 17,
        periods: 469,
        existing: 462,
        missingDownloadable: 0,
        missingManual: 0,
        unsupported: 7,
        stagedDownloaded: 0,
        stagedExisting: 224,
        stagedFailed: 7,
      },
      providers: [],
      needed: {
        downloadable: [],
        manual: [],
        unsupported: [],
      },
      outputs: {
        jsonPath: hunterPath,
        markdownPath: path.join(reportsDir, "research-data-hunter-latest.md"),
        backfillReportPath: backfillPath,
      },
      backfill: {
        generatedAt: "2026-06-29T20:39:04.000Z",
        request: {
          instruments: ["EURUSD", "GBPUSD"],
          from: { year: 2020, month: 1 },
          to: { year: 2026, month: 5 },
          includeStaged: true,
          download: true,
          force: false,
          runAudit: false,
          auditFromYear: 2020,
          auditToYear: 2025,
        },
        outputs: {
          jsonPath: backfillPath,
          markdownPath: path.join(reportsDir, "market-data-backfill-latest.md"),
        },
      },
    });

    const health = await buildResearchRuntimeHealth({
      config,
      now: new Date("2026-07-01T15:00:00.000Z"),
    });

    expect(health.backfill.generatedAt).toBe("2026-06-29T20:39:04.000Z");
    expect(health.backfill.existing).toBe(462);
    expect(health.backfill.missingDownloadable).toBe(0);
    expect(health.backfill.missingManual).toBe(0);
    expect(health.backfill.unsupported).toBe(7);
    expect(health.backfill.reportPath).toBe(backfillPath);
    expect(health.dataHunter.generatedAt).toBe("2026-06-29T20:39:05.365Z");
    expect(health.dataHunter.unsupported).toBe(7);
  });

  it("reports a local lock with a dead runner as stale even when the heartbeat is recent", async () => {
    const rootDir = await createResearchTempDir();
    const config = await createResearchConfig(rootDir);
    await writeJsonAtomic(config.paths.lockPath, {
      version: 1,
      run_id: "run-dead-runner-health",
      task_id: "task-dead-runner-health",
      runner_pid: 999_999_999,
      hostname: os.hostname(),
      started_at: "2026-05-17T14:00:00.000Z",
      heartbeat_at: "2026-05-17T14:59:59.000Z",
      stage: "walkforward",
      run_fingerprint: "fp-dead-runner-health",
      baseline_id: "baseline-test-live",
    });

    const health = await buildResearchRuntimeHealth({
      config,
      now: new Date("2026-05-17T15:00:00.000Z"),
    });

    expect(health.lock.present).toBe(true);
    expect(health.lock.health).toBe("stale");
    expect(health.lock.runnerPid).toBe(999_999_999);
  });
});
