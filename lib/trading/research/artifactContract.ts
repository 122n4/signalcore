import path from "node:path";

import { ensureDirectory, fileExists, sha256File, writeJsonAtomic } from "./fs";
import type { ResearchRunDecision, ResearchRunManifest, ResearchRunStatus } from "./types";

export type ResearchRunArtifactPaths = {
  runDir: string;
  manifestPath: string;
  inputPath: string;
  statusPath: string;
  stdoutPath: string;
  stderrPath: string;
  aggregateReportPath: string;
  crisisReportPath: string;
  walkForwardReportPath: string;
  comparisonPath: string;
  decisionPath: string;
  checksumsPath: string;
};

const MANDATORY_ARTIFACT_KEYS: Array<keyof ResearchRunArtifactPaths> = [
  "manifestPath",
  "inputPath",
  "statusPath",
  "aggregateReportPath",
  "crisisReportPath",
  "walkForwardReportPath",
  "comparisonPath",
  "decisionPath",
  "checksumsPath",
];

export function buildResearchRunArtifactPaths(runsDir: string, runId: string): ResearchRunArtifactPaths {
  const runDir = path.join(runsDir, runId);
  return {
    runDir,
    manifestPath: path.join(runDir, "manifest.json"),
    inputPath: path.join(runDir, "input.json"),
    statusPath: path.join(runDir, "status.json"),
    stdoutPath: path.join(runDir, "stdout.log"),
    stderrPath: path.join(runDir, "stderr.log"),
    aggregateReportPath: path.join(runDir, "aggregate-report.json"),
    crisisReportPath: path.join(runDir, "crisis-report.json"),
    walkForwardReportPath: path.join(runDir, "walkforward-report.json"),
    comparisonPath: path.join(runDir, "comparison.json"),
    decisionPath: path.join(runDir, "decision.json"),
    checksumsPath: path.join(runDir, "checksums.json"),
  };
}

export async function initializeResearchRunArtifacts(args: {
  paths: ResearchRunArtifactPaths;
  manifest: ResearchRunManifest;
  input: unknown;
  status: ResearchRunStatus;
}): Promise<void> {
  await ensureDirectory(args.paths.runDir);
  await writeJsonAtomic(args.paths.manifestPath, args.manifest);
  await writeJsonAtomic(args.paths.inputPath, args.input);
  await writeJsonAtomic(args.paths.statusPath, args.status);
}

export async function writeResearchRunChecksums(paths: ResearchRunArtifactPaths): Promise<void> {
  const checksums: Record<string, string> = {};

  for (const key of MANDATORY_ARTIFACT_KEYS.filter((key) => key !== "checksumsPath")) {
    const artifactPath = paths[key];
    checksums[path.basename(artifactPath)] = await sha256File(artifactPath);
  }

  await writeJsonAtomic(paths.checksumsPath, checksums);
}

export async function verifyResearchRunArtifacts(paths: ResearchRunArtifactPaths): Promise<boolean> {
  for (const key of MANDATORY_ARTIFACT_KEYS) {
    if (!(await fileExists(paths[key]))) {
      return false;
    }
  }
  return true;
}

export async function writeResearchDecisionArtifact(
  decisionPath: string,
  decision: ResearchRunDecision,
): Promise<void> {
  await writeJsonAtomic(decisionPath, decision);
}
