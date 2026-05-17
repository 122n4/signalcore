import path from "node:path";
import { describe, expect, it } from "vitest";

import { buildResearchLabOverview } from "@/lib/ops/researchLabOverview";
import { appendJsonLine, writeJsonAtomic } from "@/lib/trading/research";

import {
  createMetricSummary,
  createResearchConfig,
  createResearchQueue,
  createResearchTask,
  createResearchTempDir,
} from "./helpers/tradingResearchFixtures";

describe("research lab overview", () => {
  it("builds a read-only lab overview from local artifacts", async () => {
    const rootDir = await createResearchTempDir();
    const config = await createResearchConfig(rootDir);
    const baselineDir = path.join(config.paths.baselinesDir, config.liveBaselineSource.baselineId);

    await writeJsonAtomic(config.paths.queuePath, createResearchQueue([
      createResearchTask({
        id: "task-promoted",
        status: "completed",
        decision: "promote",
        finished_at: "2026-05-17T12:00:00.000Z",
      }),
    ]));
    await writeJsonAtomic(path.join(baselineDir, "baseline-manifest.json"), {
      baseline_id: config.liveBaselineSource.baselineId,
      created_at: "2026-05-17T10:00:00.000Z",
      dataset_profile: config.liveBaselineSource.datasetProfile,
      validation_profile: config.liveBaselineSource.validationProfile,
      dataset_manifest_hash: "dataset-hash",
      engine_manifest_hash: "engine-hash",
      source_artifacts: {
        aggregate: "aggregate.json",
        crisis: "crisis.json",
        walkforward: "walkforward.json",
      },
      live_summary: createMetricSummary({ totalTrades: 243 }),
      crisis_summary: createMetricSummary({ totalTrades: 88, expectancy: -0.068 }),
    });
    await appendJsonLine(config.paths.decisionsPath, {
      timestamp: "2026-05-17T12:30:00.000Z",
      run_id: "run-1",
      task_id: "task-promoted",
      decision: "promote",
      reason: "Validated improvement.",
      aggregate_summary: createMetricSummary({ totalTrades: 250 }),
      crisis_summary: createMetricSummary({ expectancy: 0.01 }),
      ranking_score: 88,
      ranking_band: "strong",
    });

    const overview = await buildResearchLabOverview({
      config,
      now: new Date("2026-05-17T13:00:00.000Z"),
    });

    expect(overview.baseline?.live_summary.totalTrades).toBe(243);
    expect(overview.queue.counts.completed).toBe(1);
    expect(overview.decisions.counts.promote).toBe(1);
    expect(overview.decisions.promotedOrCandidate[0]?.runId).toBe("run-1");
    expect(overview.storage.localArtifactBacked).toBe(true);
  });
});
