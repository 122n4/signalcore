import { readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { loadResearchConfig } from "./config";
import {
  buildResearchRunArtifactPaths,
  RESEARCH_RUN_MANDATORY_ARTIFACT_KEYS,
} from "./artifactContract";
import {
  ensureDirectory,
  fileExists,
  readJsonIfExists,
  sanitizeFileSegment,
  writeJsonAtomic,
} from "./fs";
import { buildResearchReportProvenance } from "./provenance";
import { resolveResearchReportSchemaVersion } from "./schema";
import { buildResearchDatasetCatalog } from "./sourceCatalog";
import type {
  ResearchConfig,
  ResearchRegistryArtifactEntry,
  ResearchRegistryReport,
  ResearchRunManifest,
  ResearchRunStatus,
} from "./types";

type ChecksumsFile = Record<string, string>;

function resolveRegistryDir(config: ResearchConfig) {
  return path.join(config.paths.reportsDir, "registry");
}

export async function readLatestResearchRegistryReport(
  config: ResearchConfig,
): Promise<ResearchRegistryReport | null> {
  return readJsonIfExists<ResearchRegistryReport>(
    path.join(resolveRegistryDir(config), "registry-latest.json"),
  );
}

function artifactTypeFromFileName(fileName: string): ResearchRegistryArtifactEntry["artifact_type"] | null {
  switch (fileName) {
    case "manifest.json":
      return "manifest";
    case "input.json":
      return "input";
    case "status.json":
      return "status";
    case "aggregate-report.json":
      return "aggregate_report";
    case "crisis-report.json":
      return "crisis_report";
    case "walkforward-report.json":
      return "walkforward_report";
    case "comparison.json":
      return "comparison";
    case "decision.json":
      return "decision";
    case "checksums.json":
      return "checksums";
    default:
      return null;
  }
}

async function buildRunArtifactEntries(args: {
  config: ResearchConfig;
  datasets: Awaited<ReturnType<typeof buildResearchDatasetCatalog>>;
  runLimit?: number;
}): Promise<ResearchRegistryArtifactEntry[]> {
  let runDirs: string[] = [];
  try {
    runDirs = (await readdir(args.config.paths.runsDir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const datasetIds = args.datasets.map((dataset) => dataset.dataset_id);
  const selectedRunDirs = runDirs.slice(-(args.runLimit ?? 80));
  const allEntries = await Promise.all(
    selectedRunDirs.map(async (runId) => {
      const paths = buildResearchRunArtifactPaths(args.config.paths.runsDir, runId);
      const [manifest, status, checksums] = await Promise.all([
        readJsonIfExists<ResearchRunManifest>(paths.manifestPath),
        readJsonIfExists<ResearchRunStatus>(paths.statusPath),
        readJsonIfExists<ChecksumsFile>(paths.checksumsPath),
      ]);
      const taskId = manifest?.task_id ?? status?.task_id ?? null;
      const dependencyIds: string[] = [];
      const entries: ResearchRegistryArtifactEntry[] = [];

      for (const key of RESEARCH_RUN_MANDATORY_ARTIFACT_KEYS) {
        const artifactPath = paths[key];
        if (!(await fileExists(artifactPath))) continue;
        const fileName = path.basename(artifactPath);
        const artifactType = artifactTypeFromFileName(fileName);
        if (!artifactType) continue;
        const artifactId = `${runId}:${artifactType}`;
        const artifactVersion = fileName === "checksums.json"
          ? null
          : (checksums?.[fileName] ?? null);

        entries.push({
          artifact_id: artifactId,
          artifact_version: artifactVersion,
          run_id: runId,
          task_id: taskId,
          artifact_type: artifactType,
          path: artifactPath,
          generated_at: status?.updated_at ?? manifest?.started_at ?? null,
          owner: "research_lab",
          lineage: {
            dataset_ids: datasetIds,
            depends_on_artifact_ids: [...dependencyIds],
          },
        });

        dependencyIds.push(artifactId);
      }

      return entries;
    }),
  );

  return allEntries.flat();
}

export async function buildResearchRegistryReport(
  config: ResearchConfig,
  args: {
    runLimit?: number;
  } = {},
): Promise<ResearchRegistryReport> {
  const datasets = await buildResearchDatasetCatalog(config);
  const artifacts = await buildRunArtifactEntries({
    config,
    datasets,
    runLimit: args.runLimit,
  });
  const runCount = new Set(artifacts.map((artifact) => artifact.run_id)).size;

  return {
    schema_version: resolveResearchReportSchemaVersion("registry"),
    provenance: await buildResearchReportProvenance({ config }),
    report_id: `registry-${new Date().toISOString()}`,
    generated_at: new Date().toISOString(),
    summary: {
      dataset_count: datasets.length,
      ready_dataset_count: datasets.filter((dataset) => dataset.status === "ready").length,
      degraded_dataset_count: datasets.filter((dataset) => dataset.status === "degraded").length,
      missing_dataset_count: datasets.filter((dataset) => dataset.status === "missing").length,
      bronze_dataset_count: datasets.filter((dataset) => dataset.data_plane.tier === "bronze").length,
      silver_dataset_count: datasets.filter((dataset) => dataset.data_plane.tier === "silver").length,
      gold_dataset_count: datasets.filter((dataset) => dataset.data_plane.tier === "gold").length,
      gap_dataset_count: datasets.filter((dataset) => dataset.data_plane.coverage.gap_detected).length,
      verified_dataset_count: datasets.filter((dataset) => dataset.data_plane.integrity.verification_status === "verified").length,
      artifact_count: artifacts.length,
      run_count: runCount,
    },
    datasets,
    artifacts,
  };
}

export async function writeResearchRegistryReport(args: {
  config: ResearchConfig;
  report: ResearchRegistryReport;
}): Promise<{
  jsonPath: string;
  markdownPath: string;
  latestJsonPath: string;
  latestMarkdownPath: string;
}> {
  const registryDir = resolveRegistryDir(args.config);
  await ensureDirectory(registryDir);

  const safeId = sanitizeFileSegment(args.report.report_id);
  const jsonPath = path.join(registryDir, `${safeId}.json`);
  const markdownPath = path.join(registryDir, `${safeId}.md`);
  const latestJsonPath = path.join(registryDir, "registry-latest.json");
  const latestMarkdownPath = path.join(registryDir, "registry-latest.md");

  await writeJsonAtomic(jsonPath, args.report);
  await writeJsonAtomic(latestJsonPath, args.report);

  const markdown = [
    "# Research Registry",
    "",
    `- Schema version: ${args.report.schema_version}`,
    `- Dataset refs: ${args.report.provenance.dataset_refs.length}`,
    `- Generated at: ${args.report.generated_at}`,
    `- Datasets: ${args.report.summary.dataset_count}`,
    `- Ready datasets: ${args.report.summary.ready_dataset_count}`,
    `- Degraded datasets: ${args.report.summary.degraded_dataset_count}`,
    `- Missing datasets: ${args.report.summary.missing_dataset_count}`,
    `- Bronze / Silver / Gold: ${args.report.summary.bronze_dataset_count} / ${args.report.summary.silver_dataset_count} / ${args.report.summary.gold_dataset_count}`,
    `- Datasets with gaps: ${args.report.summary.gap_dataset_count}`,
    `- Verified datasets: ${args.report.summary.verified_dataset_count}`,
    `- Artifacts: ${args.report.summary.artifact_count}`,
    `- Runs represented: ${args.report.summary.run_count}`,
    "",
    "## Datasets",
    ...(args.report.datasets.length > 0
      ? args.report.datasets.map(
          (dataset) =>
            `- ${dataset.dataset_id} [${dataset.kind}] ${dataset.status}` +
            ` tier=${dataset.data_plane.tier}` +
            ` version=${dataset.dataset_version.slice(0, 12)}` +
            `${dataset.data_plane.coverage.coverage_ratio != null
              ? ` coverage=${Math.round(dataset.data_plane.coverage.coverage_ratio * 100)}%`
              : ""}` +
            `${dataset.data_plane.integrity.verification_status !== "not_applicable"
              ? ` integrity=${dataset.data_plane.integrity.verification_status}`
              : ""}` +
            `${dataset.source_path ? ` path=${dataset.source_path}` : ""}`,
        )
      : ["- none"]),
    "",
    "## Recent Artifacts",
    ...(args.report.artifacts.slice(-20).length > 0
      ? args.report.artifacts.slice(-20).map(
          (artifact) =>
            `- ${artifact.run_id} / ${artifact.artifact_type}` +
            `${artifact.task_id ? ` / ${artifact.task_id}` : ""}` +
            `${artifact.artifact_version ? ` / ${artifact.artifact_version.slice(0, 12)}` : ""}`,
        )
      : ["- none"]),
  ].join("\n");

  await writeFile(markdownPath, `${markdown}\n`, "utf8");
  await writeFile(latestMarkdownPath, `${markdown}\n`, "utf8");

  return {
    jsonPath,
    markdownPath,
    latestJsonPath,
    latestMarkdownPath,
  };
}

export async function buildAndWriteResearchRegistryReport(args: {
  config?: ResearchConfig;
  runLimit?: number;
} = {}) {
  const config = args.config ?? await loadResearchConfig();
  const report = await buildResearchRegistryReport(config, {
    runLimit: args.runLimit,
  });
  const outputs = await writeResearchRegistryReport({
    config,
    report,
  });
  return {
    report,
    outputs,
  };
}
