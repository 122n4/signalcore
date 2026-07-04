import { readdir, readFile } from "node:fs/promises";

import { buildResearchRunArtifactPaths } from "./artifactContract";
import { readJsonIfExists } from "./fs";
import type {
  ResearchBaselineManifest,
  ResearchCandidateLibrary,
  ResearchConfig,
  ResearchMetricSummary,
  ResearchQueue,
  ResearchRunComparison,
} from "./types";

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
    enabledTemplates: number;
    exploredTemplates: number;
    baselineId: string | null;
    baselineTradeCount: number | null;
    crisisTradeCount: number | null;
    comparisonsInspected: number;
    comparisonsWithStatisticalValidation: number;
  };
};

type DecisionLike = {
  decision: string;
  reason?: string | null;
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

function countEnabledTemplates(library: ResearchCandidateLibrary | null): number {
  return (library?.families ?? []).reduce(
    (total, family) => total + (family.enabled ? family.templates.filter((template) => template.enabled).length : 0),
    0,
  );
}

function hasMetricEvidence(summary: ResearchMetricSummary | null | undefined): summary is ResearchMetricSummary {
  return Boolean(summary && Number.isFinite(summary.totalTrades) && summary.totalTrades > 0);
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
  const enabledTemplates = countEnabledTemplates(candidateLibrary);
  const exploredTemplates = new Set(
    decisions.map((entry) => entry.plannerTemplateId).filter((value): value is string => Boolean(value)),
  ).size;
  const fingerprintedCompleted = args.queue.tasks.filter(
    (task) => task.status === "completed" && Boolean(task.run_fingerprint) && Boolean(task.last_run_id),
  ).length;
  const baselineHashesPresent = Boolean(
    args.baseline?.dataset_manifest_hash && args.baseline?.engine_manifest_hash,
  );

  const engineStabilityPct = pct(completedTasks, completedTasks + failedTasks);
  const searchCoveragePct = pct(exploredTemplates, enabledTemplates);
  const promotionEfficiencyPct = pct(promotes, scientificDecisions);
  const candidateConversionPct = pct(promotes + candidates, scientificDecisions);
  const reproducibilityPct = completedTasks > 0
    ? clampScore((fingerprintedCompleted / completedTasks) * 80 + (baselineHashesPresent ? 20 : 0))
    : null;
  const overfittingRisk = scoreOverfittingRisk(comparisons);
  const baselineResistance = scoreBaselineResistance(args.baseline);

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
      enabledTemplates,
      exploredTemplates,
      baselineId: args.baseline?.baseline_id ?? null,
      baselineTradeCount: args.baseline?.live_summary.totalTrades ?? null,
      crisisTradeCount: args.baseline?.crisis_summary.totalTrades ?? null,
      comparisonsInspected: comparisons.length,
      comparisonsWithStatisticalValidation: comparisons.filter((comparison) => comparison.statistical_validation).length,
    },
  };
}
