import path from "node:path";

import { type ResearchConfig, type ResearchDecision } from "./types";
import { fileExists, readJsonIfExists, sanitizeFileSegment, sha256Json, writeJsonAtomic } from "./fs";

export type ResearchRunIndexEntry = {
  run_id: string;
  task_id: string;
  run_fingerprint: string;
  completed_at: string;
  decision: ResearchDecision;
  decision_path: string;
  run_dir: string;
};

export function computeResearchTaskFingerprint(args: {
  task: {
    type: string;
    baseline_id: string;
    dataset_profile: string;
    validation_profile: string;
    candidate_scope: unknown;
    candidate_mutation: unknown;
  };
  baselineId: string;
  datasetManifestHash: string;
  engineManifestHash: string;
  validationProfileId: string;
  studyConfig: unknown;
}): string {
  return sha256Json({
    task: {
      type: args.task.type,
      baseline_id: args.task.baseline_id,
      dataset_profile: args.task.dataset_profile,
      validation_profile: args.task.validation_profile,
      candidate_scope: args.task.candidate_scope,
      candidate_mutation: args.task.candidate_mutation,
    },
    baselineId: args.baselineId,
    datasetManifestHash: args.datasetManifestHash,
    engineManifestHash: args.engineManifestHash,
    validationProfileId: args.validationProfileId,
    studyConfig: args.studyConfig,
  });
}

export function buildFingerprintIndexPath(
  config: ResearchConfig,
  fingerprint: string,
): string {
  return path.join(
    config.paths.fingerprintIndexDir,
    `${sanitizeFileSegment(fingerprint)}.json`,
  );
}

export function buildRunIndexPath(config: ResearchConfig, runId: string): string {
  return path.join(config.paths.runIndexDir, `${sanitizeFileSegment(runId)}.json`);
}

export async function readFingerprintIndexEntry(
  config: ResearchConfig,
  fingerprint: string,
): Promise<ResearchRunIndexEntry | null> {
  return readJsonIfExists<ResearchRunIndexEntry>(buildFingerprintIndexPath(config, fingerprint));
}

export async function writeRunIndexEntry(
  config: ResearchConfig,
  entry: ResearchRunIndexEntry,
): Promise<void> {
  await writeJsonAtomic(buildFingerprintIndexPath(config, entry.run_fingerprint), entry);
  await writeJsonAtomic(buildRunIndexPath(config, entry.run_id), entry);
}

export async function canReuseIndexedRun(
  config: ResearchConfig,
  fingerprint: string,
): Promise<boolean> {
  const entry = await readFingerprintIndexEntry(config, fingerprint);

  if (!entry) {
    return false;
  }

  return fileExists(entry.decision_path);
}
