import path from "node:path";

import type { TradingBacktestComparativeReport } from "@/lib/trading/backtest/comparativeSweep";

import { ensureDirectory, readJsonFile, readJsonIfExists, sha256File, sha256Json, writeJsonAtomic } from "./fs";
import type { ResearchBaselineManifest, ResearchConfig } from "./types";

type ResearchBaselineSnapshot = {
  manifest: ResearchBaselineManifest;
  aggregateComparative: TradingBacktestComparativeReport;
  crisisComparative: TradingBacktestComparativeReport;
};

function buildBaselinePaths(config: ResearchConfig, baselineId: string) {
  const baselineDir = path.join(config.paths.baselinesDir, baselineId);
  return {
    baselineDir,
    manifestPath: path.join(baselineDir, "baseline-manifest.json"),
    aggregatePath: path.join(baselineDir, "aggregate-baseline.json"),
    crisisPath: path.join(baselineDir, "crisis-baseline.json"),
    walkForwardPath: path.join(baselineDir, "walkforward-baseline.json"),
    datasetManifestPath: path.join(baselineDir, "dataset-manifest.json"),
    engineManifestPath: path.join(baselineDir, "engine-manifest.json"),
    checksumsPath: path.join(baselineDir, "checksums.json"),
  };
}

export async function ensureResearchBaselineSnapshot(
  config: ResearchConfig,
): Promise<ResearchBaselineSnapshot> {
  const baselineId = config.liveBaselineSource.baselineId;
  const paths = buildBaselinePaths(config, baselineId);
  const existingManifest = await readJsonIfExists<ResearchBaselineManifest>(paths.manifestPath);

  if (!existingManifest) {
    await ensureDirectory(paths.baselineDir);

    const aggregateComparative = await readJsonFile<TradingBacktestComparativeReport>(
      config.liveBaselineSource.aggregateComparativePath,
    );
    const crisisComparative = await readJsonFile<TradingBacktestComparativeReport>(
      config.liveBaselineSource.crisisComparativePath,
    );

    await writeJsonAtomic(paths.aggregatePath, aggregateComparative);
    await writeJsonAtomic(paths.crisisPath, crisisComparative);
    await writeJsonAtomic(paths.walkForwardPath, {
      mode: "dynamic_by_affected_instruments",
      cache: {},
    });

    const datasetManifest = {
      dataset_profile: config.liveBaselineSource.datasetProfile,
      aggregate_source: path.resolve(config.liveBaselineSource.aggregateComparativePath),
      crisis_source: path.resolve(config.liveBaselineSource.crisisComparativePath),
    };
    const engineManifest = {
      files: await Promise.all(
        config.liveBaselineSource.engineManifestFiles.map(async (filePath) => ({
          path: filePath,
          sha256: await sha256File(path.resolve(filePath)),
        })),
      ),
    };

    await writeJsonAtomic(paths.datasetManifestPath, datasetManifest);
    await writeJsonAtomic(paths.engineManifestPath, engineManifest);

    const manifest: ResearchBaselineManifest = {
      baseline_id: baselineId,
      created_at: new Date().toISOString(),
      dataset_profile: config.liveBaselineSource.datasetProfile,
      validation_profile: config.liveBaselineSource.validationProfile,
      dataset_manifest_hash: sha256Json(datasetManifest),
      engine_manifest_hash: sha256Json(engineManifest),
      source_artifacts: {
        aggregate: paths.aggregatePath,
        crisis: paths.crisisPath,
        walkforward: paths.walkForwardPath,
      },
      live_summary: aggregateComparative.aggregate.summary,
      crisis_summary: crisisComparative.aggregate.summary,
    };

    await writeJsonAtomic(paths.manifestPath, manifest);
    await writeJsonAtomic(paths.checksumsPath, {
      "aggregate-baseline.json": await sha256File(paths.aggregatePath),
      "crisis-baseline.json": await sha256File(paths.crisisPath),
      "walkforward-baseline.json": await sha256File(paths.walkForwardPath),
      "dataset-manifest.json": await sha256File(paths.datasetManifestPath),
      "engine-manifest.json": await sha256File(paths.engineManifestPath),
      "baseline-manifest.json": sha256Json(manifest),
    });
  }

  return {
    manifest: await readJsonFile<ResearchBaselineManifest>(paths.manifestPath),
    aggregateComparative: await readJsonFile<TradingBacktestComparativeReport>(paths.aggregatePath),
    crisisComparative: await readJsonFile<TradingBacktestComparativeReport>(paths.crisisPath),
  };
}
