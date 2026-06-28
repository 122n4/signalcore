import path from "node:path";
import { describe, expect, it } from "vitest";

import { buildResearchLabOverview } from "@/lib/ops/researchLabOverview";
import {
  appendJsonLine,
  buildResearchDatasetHealthReport,
  buildResearchRegistryReport,
  writeJsonAtomic,
  writeResearchDatasetHealthReport,
  writeResearchRegistryReport,
} from "@/lib/trading/research";

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
    await writeJsonAtomic(path.join(baselineDir, "aggregate-baseline.json"), { ok: true });
    await writeJsonAtomic(path.join(baselineDir, "crisis-baseline.json"), { ok: true });
    await writeJsonAtomic(path.join(baselineDir, "walkforward-baseline.json"), { ok: true });
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
    const datasetHealth = await buildResearchDatasetHealthReport(config);
    await writeResearchDatasetHealthReport({ config, report: datasetHealth });
    const registry = await buildResearchRegistryReport(config);
    await writeResearchRegistryReport({ config, report: registry });
    await writeJsonAtomic(path.join(config.paths.reportsDir, "datasets", "market-data-backfill-latest.json"), {
      generatedAt: "2026-05-17T12:45:00.000Z",
      after: {
        summary: {
          instruments: 2,
          periods: 2,
          existing: 1,
          missingDownloadable: 0,
          missingManual: 1,
          unsupported: 0,
        },
        entries: [
          {
            instrument: "NAS100",
            source: "active_lab",
            group: "indices",
            localFormat: "forex_ascii_yearly_m1",
            dataSymbol: "NAS100",
            autoDownload: false,
            periods: [
              {
                label: "2026",
                status: "missing_manual",
                targetPath: path.join(rootDir, "Data", "historical", "indices", "nas100", "DAT_ASCII_NAS100_M1_2026.csv"),
                existingPath: null,
                remoteUrl: null,
                note: "Local file is required before this market can be trusted by local-only research.",
              },
            ],
          },
          {
            instrument: "XAGUSD",
            source: "staged_market",
            group: "metals",
            localFormat: "histdata_ascii_yearly_m1",
            dataSymbol: "XAGUSD",
            autoDownload: false,
            periods: [
              {
                label: "2025",
                status: "existing",
                targetPath: path.join(rootDir, "data", "historical-staging", "metals", "xagusd", "DAT_ASCII_XAGUSD_M1_2025.csv"),
                existingPath: "exists",
                remoteUrl: "https://www.histdata.com/download-free-forex-historical-data/",
                note: "Staged file exists, but this market is not active in the lab yet.",
              },
            ],
          },
        ],
      },
    });

    const overview = await buildResearchLabOverview({
      config,
      now: new Date("2026-05-17T13:00:00.000Z"),
    });

    expect(overview.baseline?.live_summary.totalTrades).toBe(243);
    expect(overview.queue.counts.completed).toBe(1);
    expect(overview.decisions.counts.promote).toBe(1);
    expect(overview.decisions.promotedOrCandidate[0]?.runId).toBe("run-1");
    expect(overview.reports.datasetHealth?.report_id).toBe(datasetHealth.report_id);
    expect(overview.reports.registry?.report_id).toBe(registry.report_id);
    expect(overview.reports.registry?.dataset_ref_count).toBe(4);
    expect(overview.datasetRequirements.summary.officialGapCount).toBe(1);
    expect(overview.dataAcquisitionPlan.summary.manualCount).toBe(1);
    expect(overview.storage.localArtifactBacked).toBe(true);
  });
});
