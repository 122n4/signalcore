import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { buildResearchRunArtifactPaths } from "./artifactContract";
import { readJsonIfExists } from "./fs";
import { buildResearchMetricSummary } from "./metrics";
import type {
  ResearchBaselineManifest,
  ResearchCandidateLibrary,
  ResearchConfig,
  ResearchMetricSummary,
  ResearchQueue,
  ResearchRunComparison,
} from "./types";

type BaselineAggregateArtifact = {
  request?: {
    periods?: Array<{ label: string; from: string; to: string }>;
  };
  aggregate?: {
    summary?: Partial<ResearchMetricSummary> | ResearchMetricSummary | null;
  };
};

const RESEARCH_ARTIFACTS_ROOT = path.join(
  /*turbopackIgnore: true*/ process.cwd(),
  "artifacts",
  "trading-research",
);
const RESEARCH_ARTIFACTS_PREFIX = ["artifacts", "trading-research"].join(path.sep);

function resolveResearchArtifactPath(artifactPath: string): string | null {
  const normalized = artifactPath.replace(/\\/g, path.sep);
  const prefixIndex = normalized.indexOf(RESEARCH_ARTIFACTS_PREFIX);
  if (prefixIndex < 0) return null;

  const relativeToResearchRoot = normalized
    .slice(prefixIndex + RESEARCH_ARTIFACTS_PREFIX.length)
    .replace(/^[/\\]+/, "");
  if (!relativeToResearchRoot || relativeToResearchRoot.startsWith("..")) return null;

  return path.join(/*turbopackIgnore: true*/ RESEARCH_ARTIFACTS_ROOT, relativeToResearchRoot);
}

export type ResearchIntelligenceGrade =
  | "strong"
  | "healthy"
  | "watch"
  | "weak"
  | "insufficient_evidence";

export type ResearchIntelligenceMetric = {
  label: string;
  value: number | null;
  unit: "score" | "ratio" | "count" | "percent" | "risk";
  grade: ResearchIntelligenceGrade;
  evidence: string;
  missingEvidence: string[];
};

export type ResearchIntelligenceReport = {
  generatedAt: string;
  source: "canonical_artifacts";
  summary: {
    confidence: ResearchIntelligenceMetric;
    baselineResistance: ResearchIntelligenceMetric;
    searchSpaceCoverage: ResearchIntelligenceMetric;
    promotionEfficiency: ResearchIntelligenceMetric;
    candidateConversion: ResearchIntelligenceMetric;
    researchEfficiency: ResearchIntelligenceMetric;
    engineStability: ResearchIntelligenceMetric;
    reproducibility: ResearchIntelligenceMetric;
    overfittingRisk: ResearchIntelligenceMetric;
  };
  evidence: {
    queueTasks: number;
    completedTasks: number;
    failedTasks: number;
    decisionEvents: number;
    scientificRejects: number;
    operationalFailures: number;
    candidates: number;
    promotes: number;
    rejectGateBreakdown: Record<string, number>;
    enabledTemplates: number;
    exploredTemplates: number;
    templatesPerCandidate: number | null;
    templatesUntilFirstCandidate: number | null;
    scientificRunsPerCandidate: number | null;
    firstCandidateAfterDecisions: number | null;
    hoursToFirstCandidate: number | null;
    baselineId: string | null;
    baselineTradeCount: number | null;
    baselineAnnualizedTrades: number | null;
    crisisTradeCount: number | null;
    comparisonsInspected: number;
    comparisonsWithStatisticalValidation: number;
  };
};

type DecisionLike = {
  decision: string;
  reason?: string | null;
  timestamp?: string | null;
  plannerTemplateId?: string | null;
  failureCategory?: string | null;
};

function gradePercent(value: number | null): ResearchIntelligenceGrade {
  if (value == null) return "insufficient_evidence";
  if (value >= 85) return "strong";
  if (value >= 70) return "healthy";
  if (value >= 45) return "watch";
  return "weak";
}

function gradeRisk(value: number | null): ResearchIntelligenceGrade {
  if (value == null) return "insufficient_evidence";
  if (value <= 20) return "strong";
  if (value <= 40) return "healthy";
  if (value <= 65) return "watch";
  return "weak";
}

function pct(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 10000) / 100;
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value * 100) / 100));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function metric(args: {
  label: string;
  value: number | null;
  unit: ResearchIntelligenceMetric["unit"];
  grade?: ResearchIntelligenceGrade;
  evidence: string;
  missingEvidence?: string[];
  risk?: boolean;
}): ResearchIntelligenceMetric {
  return {
    label: args.label,
    value: args.value,
    unit: args.unit,
    grade: args.grade ?? (args.risk ? gradeRisk(args.value) : gradePercent(args.value)),
    evidence: args.evidence,
    missingEvidence: args.missingEvidence ?? [],
  };
}

async function readDecisionEntries(config: ResearchConfig): Promise<DecisionLike[]> {
  try {
    const raw = await readFile(config.paths.decisionsPath, "utf8");
    return raw
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0)
      .map((line) => {
        const parsed = JSON.parse(line) as any;
        return {
          decision: String(parsed.decision ?? "unknown"),
          reason: typeof parsed.reason === "string" ? parsed.reason : null,
          timestamp: typeof parsed.timestamp === "string" ? parsed.timestamp : null,
          plannerTemplateId:
            typeof parsed.planner_template_id === "string" ? parsed.planner_template_id : null,
          failureCategory:
            typeof parsed.failure_forensics?.category === "string"
              ? parsed.failure_forensics.category
              : null,
        };
      });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function readCandidateLibrary(config: ResearchConfig): Promise<ResearchCandidateLibrary | null> {
  return readJsonIfExists<ResearchCandidateLibrary>(config.paths.candidateLibraryPath);
}

function resolveBaselineAggregateArtifactPaths(config: ResearchConfig, baseline: ResearchBaselineManifest): string[] {
  const candidates: string[] = [];
  const configuredPath = baseline.source_artifacts?.aggregate;
  if (configuredPath) {
    const resolvedPath = resolveResearchArtifactPath(configuredPath);
    if (resolvedPath) candidates.push(resolvedPath);
  }

  candidates.push(path.join(config.paths.baselinesDir, baseline.baseline_id, "aggregate-baseline.json"));
  return Array.from(new Set(candidates));
}

async function readBaselineLiveSummary(
  config: ResearchConfig,
  baseline: ResearchBaselineManifest | null,
): Promise<ResearchMetricSummary | null> {
  if (!baseline?.live_summary) return null;

  const directSummary = buildResearchMetricSummary(baseline.live_summary, config.study.yearlyPeriods);
  if (directSummary.annualizedTrades != null) return directSummary;

  let aggregateArtifact: BaselineAggregateArtifact | null = null;
  for (const artifactPath of resolveBaselineAggregateArtifactPaths(config, baseline)) {
    aggregateArtifact = await readJsonIfExists<BaselineAggregateArtifact>(artifactPath);
    if (aggregateArtifact) break;
  }
  const artifactSummary = aggregateArtifact?.aggregate?.summary;
  const artifactPeriods = aggregateArtifact?.request?.periods;

  if (!artifactSummary || !Array.isArray(artifactPeriods) || artifactPeriods.length === 0) {
    return directSummary;
  }

  const mergedSummary: Partial<ResearchMetricSummary> = {
    ...baseline.live_summary,
    ...artifactSummary,
  };
  if (mergedSummary.annualizedTrades === null) {
    delete mergedSummary.annualizedTrades;
  }

  return buildResearchMetricSummary(
    mergedSummary,
    artifactPeriods,
  );
}

function countEnabledTemplates(library: ResearchCandidateLibrary | null): number {
  return (library?.families ?? []).reduce(
    (total, family) => total + (family.enabled ? family.templates.filter((template) => template.enabled).length : 0),
    0,
  );
}

function hasMetricEvidence(summary: ResearchMetricSummary | null | undefined): summary is ResearchMetricSummary {
  return Boolean(summary && Number.isFinite(summary.totalTrades) && summary.totalTrades > 0);
}

function extractFailedGateReasons(reason: string | null | undefined): string[] {
  if (!reason?.startsWith("Hard validation gates failed:")) return [];
  return reason
    .replace(/^Hard validation gates failed:\s*/i, "")
    .replace(/\.$/, "")
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildRejectGateBreakdown(decisions: DecisionLike[]): Record<string, number> {
  const breakdown: Record<string, number> = {};
  for (const decision of decisions) {
    if (decision.decision !== "reject") continue;
    for (const reason of extractFailedGateReasons(decision.reason)) {
      breakdown[reason] = (breakdown[reason] ?? 0) + 1;
    }
  }
  return Object.fromEntries(
    Object.entries(breakdown).sort(([, a], [, b]) => b - a),
  );
}

function hoursBetween(start: string | null | undefined, end: string | null | undefined): number | null {
  if (!start || !end) return null;
  const from = new Date(start).getTime();
  const to = new Date(end).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return null;
  return round((to - from) / (60 * 60 * 1000));
}

function scoreBaselineResistance(baseline: ResearchBaselineManifest | null): ResearchIntelligenceMetric {
  const live = baseline?.live_summary ?? null;
  const crisis = baseline?.crisis_summary ?? null;
  if (!hasMetricEvidence(live) || !hasMetricEvidence(crisis)) {
    return metric({
      label: "Baseline Strength / Resistance",
      value: null,
      unit: "score",
      evidence: "Requires baseline live_summary and crisis_summary with trade samples.",
      missingEvidence: ["baseline.live_summary", "baseline.crisis_summary"],
    });
  }

  const livePf = live.profitFactor ?? 0;
  const crisisPf = crisis.profitFactor ?? 0;
  const liveExpectancy = live.expectancy;
  const crisisExpectancy = crisis.expectancy;
  const tradeDepthScore = Math.min(25, (Math.min(live.totalTrades, 320) / 320) * 25);
  const liveScore = Math.min(30, Math.max(0, liveExpectancy * 25 + (livePf - 1) * 22));
  const crisisScore = Math.min(30, Math.max(0, crisisExpectancy * 30 + (crisisPf - 1) * 25));
  const drawdownScore = Math.min(15, Math.max(0, 15 - Math.max(live.maxDrawdown, crisis.maxDrawdown)));
  const score = clampScore(tradeDepthScore + liveScore + crisisScore + drawdownScore);

  return metric({
    label: "Baseline Strength / Resistance",
    value: score,
    unit: "score",
    evidence: `Derived from baseline live/crisis trades, expectancy, PF and max drawdown (${baseline?.baseline_id ?? "unknown"}).`,
  });
}

async function readRecentComparisons(config: ResearchConfig, limit = 80): Promise<ResearchRunComparison[]> {
  let runIds: string[] = [];
  try {
    runIds = (await readdir(config.paths.runsDir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .slice(-limit);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const comparisons = await Promise.all(
    runIds.map(async (runId) => {
      const paths = buildResearchRunArtifactPaths(config.paths.runsDir, runId);
      return readJsonIfExists<ResearchRunComparison>(paths.comparisonPath);
    }),
  );

  return comparisons.filter((comparison): comparison is ResearchRunComparison => Boolean(comparison));
}

function scoreOverfittingRisk(comparisons: ResearchRunComparison[]): ResearchIntelligenceMetric {
  const statistical = comparisons
    .map((comparison) => comparison.statistical_validation)
    .filter((value): value is NonNullable<ResearchRunComparison["statistical_validation"]> => Boolean(value));

  if (statistical.length === 0) {
    return metric({
      label: "Overfitting Risk",
      value: null,
      unit: "risk",
      evidence: "No recent comparison artifacts with statistical_validation were available.",
      missingEvidence: ["comparison.statistical_validation.deflated_sharpe_ratio", "comparison.statistical_validation.pbo", "comparison.statistical_validation.white_reality_check"],
      risk: true,
    });
  }

  const risks = statistical.map((entry) => {
    const pboRisk = entry.pbo.value == null ? 50 : entry.pbo.value * 100;
    const wrcRisk =
      entry.white_reality_check.adjusted_p_value == null
        ? 50
        : Math.min(100, entry.white_reality_check.adjusted_p_value * 100);
    const dsrRisk =
      entry.deflated_sharpe_ratio == null
        ? 50
        : Math.max(0, 100 - Math.min(1, entry.deflated_sharpe_ratio) * 100);
    return (pboRisk * 0.5) + (wrcRisk * 0.3) + (dsrRisk * 0.2);
  });
  const averageRisk = clampScore(risks.reduce((sum, value) => sum + value, 0) / risks.length);

  return metric({
    label: "Overfitting Risk",
    value: averageRisk,
    unit: "risk",
    evidence: `Aggregated from ${statistical.length} recent comparison artifacts with DSR/PBO/White Reality Check.`,
    risk: true,
  });
}

export async function buildResearchIntelligenceReport(args: {
  config: ResearchConfig;
  queue: ResearchQueue;
  baseline: ResearchBaselineManifest | null;
  generatedAt?: string;
}): Promise<ResearchIntelligenceReport> {
  const [decisions, candidateLibrary, comparisons] = await Promise.all([
    readDecisionEntries(args.config),
    readCandidateLibrary(args.config),
    readRecentComparisons(args.config),
  ]);

  const queueTasks = args.queue.tasks.length;
  const completedTasks = args.queue.tasks.filter((task) => task.status === "completed").length;
  const failedTasks = args.queue.tasks.filter((task) => task.status === "failed").length;
  const promotes = decisions.filter((entry) => entry.decision === "promote").length;
  const candidates = decisions.filter((entry) => entry.decision === "candidate").length;
  const rejects = decisions.filter((entry) => entry.decision === "reject").length;
  const operationalFailures = decisions.filter((entry) => entry.decision === "failed").length;
  const scientificDecisions = promotes + candidates + rejects;
  const usefulScientificDecisions = promotes + candidates;
  const sortedScientificDecisions = decisions
    .filter((entry) => ["promote", "candidate", "reject"].includes(entry.decision))
    .slice()
    .sort((a, b) => {
      const aTime = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const bTime = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return aTime - bTime;
    });
  const firstUsefulIndex = sortedScientificDecisions.findIndex((entry) =>
    ["promote", "candidate"].includes(entry.decision),
  );
  const firstUsefulDecision = firstUsefulIndex >= 0 ? sortedScientificDecisions[firstUsefulIndex] : null;
  const firstScientificDecision = sortedScientificDecisions[0] ?? null;
  const enabledTemplates = countEnabledTemplates(candidateLibrary);
  const exploredTemplates = new Set(
    decisions.map((entry) => entry.plannerTemplateId).filter((value): value is string => Boolean(value)),
  ).size;
  const exploredBeforeFirstCandidate =
    firstUsefulIndex >= 0
      ? new Set(
          sortedScientificDecisions
            .slice(0, firstUsefulIndex + 1)
            .map((entry) => entry.plannerTemplateId)
            .filter((value): value is string => Boolean(value)),
        ).size
      : null;
  const rejectGateBreakdown = buildRejectGateBreakdown(decisions);
  const templatesPerCandidate =
    usefulScientificDecisions > 0 && exploredTemplates > 0
      ? round(exploredTemplates / usefulScientificDecisions)
      : null;
  const scientificRunsPerCandidate =
    usefulScientificDecisions > 0 && scientificDecisions > 0
      ? round(scientificDecisions / usefulScientificDecisions)
      : null;
  const hoursToFirstCandidate = hoursBetween(
    firstScientificDecision?.timestamp,
    firstUsefulDecision?.timestamp,
  );
  const fingerprintedCompleted = args.queue.tasks.filter(
    (task) => task.status === "completed" && Boolean(task.run_fingerprint) && Boolean(task.last_run_id),
  ).length;
  const baselineHashesPresent = Boolean(
    args.baseline?.dataset_manifest_hash && args.baseline?.engine_manifest_hash,
  );

  const engineStabilityPct = pct(completedTasks, completedTasks + failedTasks);
  const rawSearchCoveragePct = pct(exploredTemplates, enabledTemplates);
  const searchCoveragePct = rawSearchCoveragePct == null ? null : clampScore(rawSearchCoveragePct);
  const promotionEfficiencyPct = pct(promotes, scientificDecisions);
  const candidateConversionPct = pct(promotes + candidates, scientificDecisions);
  const candidateTemplateYieldPct = pct(usefulScientificDecisions, exploredTemplates);
  const researchEfficiencyPct =
    scientificDecisions <= 0
      ? null
      : usefulScientificDecisions === 0
        ? 0
        : clampScore(
            ((candidateConversionPct ?? 0) * 0.5) +
              ((candidateTemplateYieldPct ?? 0) * 0.35) +
              ((promotionEfficiencyPct ?? 0) * 0.15),
          );
  const reproducibilityPct = completedTasks > 0
    ? clampScore((fingerprintedCompleted / completedTasks) * 80 + (baselineHashesPresent ? 20 : 0))
    : null;
  const overfittingRisk = scoreOverfittingRisk(comparisons);
  const baselineResistance = scoreBaselineResistance(args.baseline);
  const baselineLiveSummary = await readBaselineLiveSummary(args.config, args.baseline);

  const confidenceInputs = [
    engineStabilityPct,
    searchCoveragePct == null ? null : Math.min(100, searchCoveragePct * 4),
    baselineResistance.value,
    reproducibilityPct,
    overfittingRisk.value == null ? null : 100 - overfittingRisk.value,
  ].filter((value): value is number => value != null);
  const researchConfidence = confidenceInputs.length >= 3
    ? clampScore(confidenceInputs.reduce((sum, value) => sum + value, 0) / confidenceInputs.length)
    : null;

  return {
    generatedAt: args.generatedAt ?? new Date().toISOString(),
    source: "canonical_artifacts",
    summary: {
      confidence: metric({
        label: "Research Confidence",
        value: researchConfidence,
        unit: "score",
        evidence: "Composite of engine stability, search coverage, baseline resistance, reproducibility and inverse overfitting risk.",
        missingEvidence:
          confidenceInputs.length >= 3
            ? []
            : ["at least three supported component metrics"],
      }),
      baselineResistance,
      searchSpaceCoverage: metric({
        label: "Search Space Coverage",
        value: searchCoveragePct,
        unit: "percent",
        evidence: `${exploredTemplates}/${enabledTemplates} enabled candidate templates have appeared in the decision ledger.`,
        missingEvidence: enabledTemplates > 0 ? [] : ["candidate library enabled templates"],
      }),
      promotionEfficiency: metric({
        label: "Promotion Efficiency",
        value: promotionEfficiencyPct,
        unit: "percent",
        evidence: `${promotes}/${scientificDecisions} scientific decisions ended as promote.`,
        missingEvidence: scientificDecisions > 0 ? [] : ["scientific decisions"],
      }),
      candidateConversion: metric({
        label: "Candidate Conversion",
        value: candidateConversionPct,
        unit: "percent",
        evidence: `${promotes + candidates}/${scientificDecisions} scientific decisions became candidate/promote.`,
        missingEvidence: scientificDecisions > 0 ? [] : ["scientific decisions"],
      }),
      researchEfficiency: metric({
        label: "Research Efficiency",
        value: researchEfficiencyPct,
        unit: "score",
        evidence:
          usefulScientificDecisions > 0
            ? `${exploredTemplates} explored templates produced ${usefulScientificDecisions} candidate/promote decisions; ${scientificRunsPerCandidate ?? "n/a"} scientific runs per useful decision.`
            : `${exploredTemplates} explored templates and ${scientificDecisions} scientific decisions have not produced a candidate/promote yet.`,
        missingEvidence:
          scientificDecisions > 0
            ? []
            : ["scientific decisions", "decision ledger template ids"],
      }),
      engineStability: metric({
        label: "Engine Stability",
        value: engineStabilityPct,
        unit: "percent",
        evidence: `${completedTasks}/${completedTasks + failedTasks} terminal queue tasks completed without operational failure.`,
        missingEvidence: completedTasks + failedTasks > 0 ? [] : ["terminal queue tasks"],
      }),
      reproducibility: metric({
        label: "Reproducibility",
        value: reproducibilityPct,
        unit: "percent",
        evidence: `${fingerprintedCompleted}/${completedTasks} completed tasks have run fingerprints; baseline hashes present=${baselineHashesPresent}.`,
        missingEvidence: completedTasks > 0 ? [] : ["completed tasks"],
      }),
      overfittingRisk,
    },
    evidence: {
      queueTasks,
      completedTasks,
      failedTasks,
      decisionEvents: decisions.length,
      scientificRejects: rejects,
      operationalFailures,
      candidates,
      promotes,
      rejectGateBreakdown,
      enabledTemplates,
      exploredTemplates,
      templatesPerCandidate,
      templatesUntilFirstCandidate: exploredBeforeFirstCandidate,
      scientificRunsPerCandidate,
      firstCandidateAfterDecisions: firstUsefulIndex >= 0 ? firstUsefulIndex + 1 : null,
      hoursToFirstCandidate,
      baselineId: args.baseline?.baseline_id ?? null,
      baselineTradeCount: args.baseline?.live_summary.totalTrades ?? null,
      baselineAnnualizedTrades: baselineLiveSummary?.annualizedTrades ?? null,
      crisisTradeCount: args.baseline?.crisis_summary.totalTrades ?? null,
      comparisonsInspected: comparisons.length,
      comparisonsWithStatisticalValidation: comparisons.filter((comparison) => comparison.statistical_validation).length,
    },
  };
}
