import path from "node:path";
import { readdir } from "node:fs/promises";

import { DEFAULT_RESEARCH_CONFIG_PATH } from "./config";
import { sha256File, sha256Json } from "./fs";
import type { ResearchConfig } from "./types";

type ManifestFileEntry = {
  path: string;
  sha256: string;
};

async function collectFiles(rootPath: string): Promise<string[]> {
  const resolved = path.resolve(rootPath);
  try {
  const entries = await readdir(resolved, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(resolved, entry.name);
      if (entry.isDirectory()) {
        return collectFiles(fullPath);
      }
      if (!/\.(ts|tsx|json|sql|md)$/.test(entry.name)) {
        return [];
      }
      return [fullPath];
    }),
  );
  return files.flat().sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function hashFiles(paths: string[]): Promise<ManifestFileEntry[]> {
  return Promise.all(
    paths.map(async (filePath) => ({
      path: filePath,
      sha256: await sha256File(filePath),
    })),
  );
}

export async function buildResearchScienceManifest(config: ResearchConfig) {
  const explicitEngineFiles = (config.liveBaselineSource.engineManifestFiles ?? [])
    .map((entry) => path.resolve(entry))
    .filter((entry, index, array) => entry.trim().length > 0 && array.indexOf(entry) === index);
  const rootTargets = explicitEngineFiles.length === 0
    ? [
        "lib/trading/research",
        "lib/trading/backtest",
        "lib/trading/decision",
        "lib/trading/execution",
        "lib/trading/playbook",
        "lib/trading/setups",
      ]
    : [];
  const explicitFiles = [
    DEFAULT_RESEARCH_CONFIG_PATH,
    config.paths.candidateLibraryPath,
    config.paths.candidateReserveLibraryPath ?? null,
    config.paths.campaignLibraryPath ?? null,
    config.paths.coverageAuditPath ?? null,
    ...explicitEngineFiles,
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  const collected = await Promise.all(rootTargets.map((target) => collectFiles(target)));
  const uniqueFiles = Array.from(
    new Set([...explicitFiles.map((entry) => path.resolve(entry)), ...collected.flat()]),
  ).sort();
  const files = await hashFiles(uniqueFiles);
  const featureVersions = {
    validation_profiles: sha256Json(config.validationProfiles),
    study_config: sha256Json(config.study),
    live_baseline_source: sha256Json(config.liveBaselineSource),
  };

  return {
    schema_version: "research.science-manifest.v1",
    generated_at: new Date().toISOString(),
    files,
    feature_versions: featureVersions,
  };
}
