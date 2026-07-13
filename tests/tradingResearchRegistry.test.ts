import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildResearchRegistryReport,
  buildResearchRunArtifactPaths,
  initializeResearchRunArtifacts,
  readJsonFile,
  writeJsonAtomic,
  writeResearchRegistryReport,
  writeResearchRunChecksums,
} from "@/lib/trading/research";

import {
  createResearchConfig,
  createResearchTempDir,
} from "./helpers/tradingResearchFixtures";

describe("trading research registry", () => {
  it("builds canonical dataset and artifact registry entries from existing lab assets", async () => {
    const rootDir = await createResearchTempDir();
    const config = await createResearchConfig(rootDir);
    const runId = "run-2026-03-20-task-alpha";
    const runPaths = buildResearchRunArtifactPaths(config.paths.runsDir, runId);

    await initializeResearchRunArtifacts({
      paths: runPaths,
      manifest: {
        version: 1,
        run_id: runId,
        task_id: "task-alpha",
        task_type: "risk_shaping",
        baseline_id: config.liveBaselineSource.baselineId,
        run_fingerprint: "fp-alpha",
        started_at: "2026-03-20T10:00:00.000Z",
        dataset_profile: "core_20y",
        validation_profile: "default_live_safe",
      },
      input: {
        taskId: "task-alpha",
      },
      status: {
        run_id: runId,
        task_id: "task-alpha",
        status: "completed",
        stage: "completed",
        started_at: "2026-03-20T10:00:00.000Z",
        updated_at: "2026-03-20T10:05:00.000Z",
        completed_stages: ["aggregate", "crisis", "walkforward", "robustness", "decision"],
        failed_stage: null,
        error: null,
      },
    });
    await writeJsonAtomic(runPaths.aggregateReportPath, { ok: true, type: "aggregate" });
    await writeJsonAtomic(runPaths.crisisReportPath, { ok: true, type: "crisis" });
    await writeJsonAtomic(runPaths.walkForwardReportPath, { ok: true, type: "walkforward" });
    await writeJsonAtomic(runPaths.comparisonPath, { comparison: true });
    await writeJsonAtomic(runPaths.decisionPath, { decision: "promote" });
    await writeResearchRunChecksums(runPaths);

    const report = await buildResearchRegistryReport(config);
    const outputs = await writeResearchRegistryReport({ config, report });
    const latest = await readJsonFile<typeof report>(outputs.latestJsonPath);

    expect(report.schema_version).toBe("research.registry-report.v1");
    expect(report.provenance.dataset_refs).toHaveLength(3);
    expect(report.summary.dataset_count).toBe(5);
    expect(report.summary.bronze_dataset_count).toBe(2);
    expect(report.summary.silver_dataset_count).toBe(1);
    expect(report.summary.gold_dataset_count).toBe(2);
    expect(report.summary.verified_dataset_count).toBe(2);
    expect(report.datasets.some((dataset) => dataset.dataset_id === "coverage_audit_local_only")).toBe(true);
    expect(report.datasets.some((dataset) => dataset.dataset_id === "active_research_universe_core_20y")).toBe(true);
    expect(report.datasets.some((dataset) => dataset.kind === "scientific_snapshot")).toBe(true);
    expect(
      report.datasets.find((dataset) => dataset.dataset_id === "coverage_audit_local_only")?.data_plane,
    ).toMatchObject({
      tier: "silver",
      coverage: {
        gap_detected: false,
      },
      provider_quality: {
        source_mode: "local_only",
      },
      integrity: {
        verification_status: "verified",
      },
    });
    expect(
      report.datasets.find((dataset) => dataset.dataset_id === "active_research_universe_core_20y")?.data_plane,
    ).toMatchObject({
      tier: "gold",
      provider_quality: {
        source_mode: "derived",
      },
      integrity: {
        verification_status: "not_applicable",
      },
    });
    expect(report.summary.artifact_count).toBeGreaterThanOrEqual(8);
    expect(
      report.artifacts.some(
        (artifact) =>
          artifact.run_id === runId &&
          artifact.task_id === "task-alpha" &&
          artifact.artifact_type === "decision",
      ),
    ).toBe(true);
    expect(latest.summary.run_count).toBe(1);
    expect(path.basename(outputs.latestMarkdownPath)).toBe("registry-latest.md");
  });

  it("marks the active research universe as degraded when coverage audit reports suspended instruments", async () => {
    const rootDir = await createResearchTempDir();
    const config = await createResearchConfig(rootDir);
    config.study.instruments = ["NAS100", "US500"];
    await writeJsonAtomic(config.paths.coverageAuditPath, {
      generatedAt: "2026-03-15T00:00:00.000Z",
      summary: {
        byInstrument: {
          NAS100: { validPeriods: 1, invalidPeriods: 0, failedPeriods: 0, sources: ["local_archive"] },
          US500: { validPeriods: 0, invalidPeriods: 1, failedPeriods: 0, sources: ["local_archive"] },
        },
      },
    });

    const report = await buildResearchRegistryReport(config);
    const activeUniverse = report.datasets.find((dataset) => dataset.dataset_id === "active_research_universe_core_20y");

    expect(activeUniverse).toMatchObject({
      status: "degraded",
      data_plane: {
        coverage: {
          scoped_items: 2,
          ready_items: 1,
          gap_items: 1,
          gap_detected: true,
        },
      },
    });
  });
});
