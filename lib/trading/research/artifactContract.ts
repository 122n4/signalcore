import path from "node:path";

import { ensureDirectory, fileExists, sha256File, writeJsonAtomic } from "./fs";
import type {
  ResearchFailureForensics,
  ResearchGateEvaluation,
  ResearchMetricSummary,
  ResearchRunDecision,
  ResearchRunManifest,
  ResearchRunStatus,
} from "./types";

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

export const RESEARCH_RUN_MANDATORY_ARTIFACT_KEYS: Array<keyof ResearchRunArtifactPaths> = [
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

export const RESEARCH_RUN_COMPLETION_ARTIFACT_KEYS: Array<keyof ResearchRunArtifactPaths> =
  RESEARCH_RUN_MANDATORY_ARTIFACT_KEYS.filter(
    (key): key is keyof ResearchRunArtifactPaths => key !== "checksumsPath",
  );

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

  for (const key of RESEARCH_RUN_MANDATORY_ARTIFACT_KEYS.filter((key) => key !== "checksumsPath")) {
    const artifactPath = paths[key];
    checksums[path.basename(artifactPath)] = await sha256File(artifactPath);
  }

  await writeJsonAtomic(paths.checksumsPath, checksums);
}

export async function verifyResearchRunArtifacts(paths: ResearchRunArtifactPaths): Promise<boolean> {
  for (const key of RESEARCH_RUN_MANDATORY_ARTIFACT_KEYS) {
    if (!(await fileExists(paths[key]))) {
      return false;
    }
  }
  return true;
}

export async function verifyResearchRunCompletionArtifacts(
  paths: ResearchRunArtifactPaths,
): Promise<boolean> {
  for (const key of RESEARCH_RUN_COMPLETION_ARTIFACT_KEYS) {
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

export function createZeroResearchMetricSummary(): ResearchMetricSummary {
  return {
    totalTrades: 0,
    annualizedTrades: null,
    winRate: 0,
    averageRiskReward: null,
    expectancy: 0,
    profitFactor: null,
    maxDrawdown: 0,
  };
}

function createFailedResearchGateEvaluation(): ResearchGateEvaluation {
  return {
    aggregateExpectancyStable: false,
    aggregateProfitFactorStable: false,
    aggregateDrawdownStable: false,
    aggregateTradeCountStable: false,
    aggregateTradeCadencePass: false,
    crisisExpectancyStable: false,
    crisisProfitFactorStable: false,
    crisisDrawdownStable: false,
    walkForwardExpectancyStable: false,
    walkForwardProfitFactorStable: false,
    walkForwardDrawdownStable: false,
    walkForwardBreakEvenOrBetter: false,
    holdoutBreakEvenOrBetter: false,
    finalHoldoutBreakEvenOrBetter: false,
    perturbationBreakEvenOrBetter: false,
    monteCarloBreakEvenOrBetter: false,
    costStressBreakEvenOrBetter: false,
    aggregateImproved: false,
    crisisImproved: false,
    walkForwardImproved: false,
    aggregatePromotionThresholdMet: false,
    crisisPromotionThresholdMet: false,
    drawdownPromotionThresholdMet: false,
    promotionThresholdMet: false,
    allHardGatesPass: false,
  };
}

export async function writeResearchFailureArtifacts(args: {
  paths: ResearchRunArtifactPaths;
  manifest?: ResearchRunManifest | null;
  input?: unknown;
  status: ResearchRunStatus;
  error: string;
  failureForensics?: ResearchFailureForensics | null;
}): Promise<void> {
  if (args.manifest) {
    await writeJsonAtomic(args.paths.manifestPath, args.manifest);
  }
  if (args.input !== undefined) {
    await writeJsonAtomic(args.paths.inputPath, args.input);
  }
  await writeJsonAtomic(args.paths.statusPath, args.status);

  const emptySummary = createZeroResearchMetricSummary();
  const failedAt = args.status.updated_at;
  const failedStage = args.status.failed_stage ?? args.status.stage;

  await writeJsonAtomic(args.paths.aggregateReportPath, {
    status: "failed",
    stage: failedStage,
    generated_at: failedAt,
    error: args.error,
    summary: emptySummary,
  });
  await writeJsonAtomic(args.paths.crisisReportPath, {
    status: "failed",
    stage: failedStage,
    generated_at: failedAt,
    error: args.error,
    summary: emptySummary,
  });
  await writeJsonAtomic(args.paths.walkForwardReportPath, {
    status: "failed",
    stage: failedStage,
    generated_at: failedAt,
    error: args.error,
    summary: emptySummary,
  });

  const failedComparison = {
    aggregate: {
      baseline: emptySummary,
      current: emptySummary,
    },
    crisis: {
      baseline: emptySummary,
      current: emptySummary,
    },
    walkForward: {
      baseline: emptySummary,
      current: emptySummary,
      affectedInstruments: [],
    },
    gates: createFailedResearchGateEvaluation(),
    operational_failure: true,
  };
  await writeJsonAtomic(args.paths.comparisonPath, failedComparison);

  const failedDecision: ResearchRunDecision = {
    run_id: args.status.run_id,
    task_id: args.status.task_id,
    decision: "reject",
    reason: args.error,
    gates: failedComparison.gates,
    promoted_metrics: {},
    ranking: null,
    failure_forensics: args.failureForensics ?? null,
    operational_failure: true,
    failed_stage: failedStage,
  };
  await writeResearchDecisionArtifact(args.paths.decisionPath, failedDecision);
  await writeResearchRunChecksums(args.paths);
}
