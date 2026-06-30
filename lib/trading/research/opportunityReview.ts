import path from "node:path";
import { writeFile } from "node:fs/promises";

import { ensureResearchBaselineSnapshot } from "./baseline";
import {
  buildResearchPromotionBundleCandidates,
  validateResearchPromotionBundle,
} from "./bundleValidation";
import { loadResearchConfig } from "./config";
import { decideResearchRun } from "./decisionEngine";
import {
  ensureDirectory,
  readJsonIfExists,
  sanitizeFileSegment,
  writeJsonAtomic,
} from "./fs";
import { buildResearchReportProvenance } from "./provenance";
import { buildResearchPromotionBoard } from "./promotionBoard";
import { buildResearchPromotionPackageReport } from "./promotionPackages";
import { readResearchQueue } from "./queue";
import { buildDefaultResearchExecutorMap } from "./runner";
import { resolveResearchReportSchemaVersion } from "./schema";
import type {
  ResearchConfig,
  ResearchOpportunityReviewBundle,
  ResearchOpportunityReviewItem,
  ResearchOpportunityReviewReport,
  ResearchPromotionBoardReport,
  ResearchPromotionPackage,
  ResearchPromotionPackageReport,
  ResearchRunComparison,
  ResearchTask,
  ResearchTaskExecutorMap,
} from "./types";

type OpportunityReviewDeps = {
  boardReport?: ResearchPromotionBoardReport;
  packageReport?: ResearchPromotionPackageReport;
  executors?: ResearchTaskExecutorMap;
  validateBundle?: typeof validateResearchPromotionBundle;
  now?: () => Date;
};

function buildScopedConfig(config: ResearchConfig, instruments: string[]): ResearchConfig {
  const scopedInstruments = Array.from(new Set(instruments)).sort();

  return {
    ...config,
    study: {
      ...config.study,
      instruments: scopedInstruments,
    },
  };
}

function buildPromotedMetrics(item: ResearchOpportunityReviewItem["comparison"]): Record<string, number | null> {
  return {
    aggregateExpectancy: item.aggregate.current.expectancy,
    aggregateProfitFactor: item.aggregate.current.profitFactor,
    crisisExpectancy: item.crisis.current.expectancy,
    crisisProfitFactor: item.crisis.current.profitFactor,
    walkForwardExpectancy: item.walkForward.current.expectancy,
    walkForwardProfitFactor: item.walkForward.current.profitFactor,
    holdoutExpectancy: item.robustness?.holdout?.current.expectancy ?? null,
    holdoutProfitFactor: item.robustness?.holdout?.current.profitFactor ?? null,
    finalHoldoutExpectancy: item.robustness?.finalHoldout?.current.expectancy ?? null,
    finalHoldoutProfitFactor: item.robustness?.finalHoldout?.current.profitFactor ?? null,
    perturbationExpectancy: item.robustness?.perturbation?.current.expectancy ?? null,
    perturbationProfitFactor: item.robustness?.perturbation?.current.profitFactor ?? null,
    monteCarloExpectancy: item.robustness?.monteCarlo?.current.expectancy ?? null,
    monteCarloProfitFactor: item.robustness?.monteCarlo?.current.profitFactor ?? null,
    monteCarloMaxDrawdown: item.robustness?.monteCarlo?.current.maxDrawdown ?? null,
    costStressExpectancy: item.robustness?.costStress?.current.expectancy ?? null,
    costStressProfitFactor: item.robustness?.costStress?.current.profitFactor ?? null,
    costStressMaxDrawdown: item.robustness?.costStress?.current.maxDrawdown ?? null,
  };
}

function sortItems(
  left: ResearchOpportunityReviewItem,
  right: ResearchOpportunityReviewItem,
): number {
  return (
    Number(right.package_ready_for_live_review) - Number(left.package_ready_for_live_review) ||
    (right.isolated_score ?? Number.NEGATIVE_INFINITY) -
      (left.isolated_score ?? Number.NEGATIVE_INFINITY) ||
    left.task_id.localeCompare(right.task_id)
  );
}

function buildBundleReview(args: {
  candidateTasks: ResearchTask[];
  bundleCandidates: ReturnType<typeof buildResearchPromotionBundleCandidates>;
  bundleResult:
    | Awaited<ReturnType<typeof validateResearchPromotionBundle>>
    | null;
}): ResearchOpportunityReviewBundle {
  if (args.candidateTasks.length < 2) {
    return {
      status: "insufficient_candidates",
      reason: "Need at least two ready-for-review task opportunities to validate a bundle.",
      bundle_id: null,
      task_ids: args.candidateTasks.map((task) => task.id),
      decision: null,
      comparison: null,
      portfolio_stress: null,
    };
  }

  if (!args.bundleCandidates.length || !args.bundleResult) {
    return {
      status: "incompatible",
      reason: "Selected opportunities target overlapping scope and do not form a valid bundle under current bundle rules.",
      bundle_id: null,
      task_ids: args.candidateTasks.map((task) => task.id),
      decision: null,
      comparison: null,
      portfolio_stress: null,
    };
  }

  return {
    status: "validated",
    reason: args.bundleResult.decision.reason,
    bundle_id: args.bundleResult.bundle_id,
    task_ids: args.bundleResult.task_ids,
    decision: args.bundleResult.decision,
    comparison: args.bundleResult.comparison,
    portfolio_stress: args.bundleResult.portfolio_stress ?? null,
  };
}

async function loadCanonicalPackageComparison(
  pkg: ResearchPromotionPackage,
  taskId: string,
): Promise<ResearchRunComparison | null> {
  const runArtifact =
    pkg.artifacts.run_artifacts.find((artifact) => artifact.task_id === taskId) ?? null;
  const comparisonPath = runArtifact?.comparison_path ?? null;

  if (!comparisonPath) {
    return null;
  }

  return readJsonIfExists<ResearchRunComparison>(comparisonPath);
}

export async function buildResearchOpportunityReviewReport(
  config: ResearchConfig,
  deps: OpportunityReviewDeps = {},
): Promise<ResearchOpportunityReviewReport> {
  const now = deps.now ?? (() => new Date());
  const boardReport = deps.boardReport ?? (await buildResearchPromotionBoard(config));
  const packageReport =
    deps.packageReport ??
    (await buildResearchPromotionPackageReport({
      config,
      boardReport,
    }));
  const queue = await readResearchQueue(config);
  const executors = {
    ...buildDefaultResearchExecutorMap(),
    ...(deps.executors ?? {}),
  };
  const readyPackages = packageReport.packages.filter((pkg) => pkg.review.ready_for_live_review);
  const queueTasksById = new Map(queue.tasks.map((task) => [task.id, task] as const));

  const items: ResearchOpportunityReviewItem[] = [];
  for (const pkg of readyPackages) {
    if (pkg.source !== "task") {
      continue;
    }

    const taskId = pkg.task_ids[0];
    if (!taskId) {
      continue;
    }
    const task = queueTasksById.get(taskId);
    if (!task) {
      continue;
    }
    const scopedConfig = buildScopedConfig(
      config,
      task.candidate_scope.instruments ?? config.study.instruments,
    );
    const comparison =
      (await loadCanonicalPackageComparison(pkg, taskId)) ??
      (await (async () => {
        const executor = executors[task.type];
        if (!executor) {
          return null;
        }
        const scopedBaseline = await ensureResearchBaselineSnapshot(scopedConfig);
        const execution = await executor({
          config: scopedConfig,
          task,
          baseline: scopedBaseline,
        });
        return execution.comparison;
      })());

    if (!comparison) {
      continue;
    }

    const isolatedDecision = decideResearchRun({
      runId: `review-${pkg.package_id}-${sanitizeFileSegment(now().toISOString())}`,
      taskId,
      gates: comparison.gates,
      promotedMetrics: buildPromotedMetrics(comparison),
      comparison,
    });

    items.push({
      entry_id: pkg.entry_id,
      package_id: pkg.package_id,
      task_id: taskId,
      source: pkg.source,
      board_status: pkg.board_status,
      decision: pkg.decision,
      primary_campaign_id: pkg.primary_campaign_id,
      primary_campaign_objective: pkg.primary_campaign_objective,
      isolated_decision: isolatedDecision.decision,
      isolated_reason: isolatedDecision.reason,
      isolated_score: isolatedDecision.ranking?.score ?? null,
      isolated_band: isolatedDecision.ranking?.band ?? null,
      comparison,
      package_ready_for_live_review: pkg.review.ready_for_live_review,
    });
  }

  const reviewTasks = items
    .map((item) => queueTasksById.get(item.task_id))
    .filter((task): task is ResearchTask => Boolean(task));
  const bundleCandidates = buildResearchPromotionBundleCandidates(reviewTasks);
  const bundleCandidate =
    bundleCandidates.find(
      (candidate) =>
        candidate.task_ids.length === reviewTasks.length &&
        candidate.task_ids.every((taskId) => reviewTasks.some((task) => task.id === taskId)),
    ) ?? null;
  const bundleResult = bundleCandidate
    ? await (deps.validateBundle ?? validateResearchPromotionBundle)({
        config: buildScopedConfig(config, bundleCandidate.affected_instruments),
        candidate: bundleCandidate,
        trialCount: bundleCandidates.length,
      })
    : null;
  const bundle = buildBundleReview({
    candidateTasks: reviewTasks,
    bundleCandidates,
    bundleResult,
  });

  const sortedItems = items.sort(sortItems);

  return {
    schema_version: resolveResearchReportSchemaVersion("opportunityReview"),
    provenance: await buildResearchReportProvenance({
      config,
      upstreamReportIds: [
        boardReport.report_id,
        packageReport.report_id,
        packageReport.packages[0]?.artifacts.registry_report_id ?? "",
      ],
    }),
    report_id: `opportunity-review-${now().toISOString()}`,
    generated_at: now().toISOString(),
    live_baseline_id: boardReport.live_baseline_id,
    source_board_report_id: boardReport.report_id,
    source_package_report_id: packageReport.report_id,
    source_registry_report_id: packageReport.packages[0]?.artifacts.registry_report_id ?? null,
    summary: {
      reviewed_item_count: sortedItems.length,
      isolated_promote_count: sortedItems.filter((item) => item.isolated_decision === "promote").length,
      isolated_candidate_count: sortedItems.filter((item) => item.isolated_decision === "candidate").length,
      isolated_reject_count: sortedItems.filter((item) => item.isolated_decision === "reject").length,
      package_ready_for_live_review_count: sortedItems.filter((item) => item.package_ready_for_live_review).length,
      bundle_status: bundle.status,
    },
    items: sortedItems,
    bundle,
  };
}

function renderOpportunityReviewMarkdown(report: ResearchOpportunityReviewReport): string {
  const lines = [
    "# Research Opportunity Review",
    "",
    `- Schema version: ${report.schema_version}`,
    `- Upstream reports: ${report.provenance.upstream_report_ids.length}`,
    `- Generated at: ${report.generated_at}`,
    `- Live baseline: ${report.live_baseline_id ?? "n/a"}`,
    `- Board source: ${report.source_board_report_id}`,
    `- Package source: ${report.source_package_report_id}`,
    `- Registry source: ${report.source_registry_report_id ?? "n/a"}`,
    `- Reviewed items: ${report.summary.reviewed_item_count}`,
    `- Isolated promotes: ${report.summary.isolated_promote_count}`,
    `- Isolated candidates: ${report.summary.isolated_candidate_count}`,
    `- Isolated rejects: ${report.summary.isolated_reject_count}`,
    `- Bundle status: ${report.summary.bundle_status}`,
    "",
    "## Items",
    ...(report.items.length > 0
      ? report.items.map(
          (item) =>
            `- ${item.task_id}: package=${item.decision}, isolated=${item.isolated_decision}` +
            ` [${item.isolated_score ?? "n/a"} ${item.isolated_band ?? "n/a"}]` +
            `${item.primary_campaign_id ? ` [${item.primary_campaign_id}/${item.primary_campaign_objective ?? "n/a"}]` : ""}` +
            ` (${item.isolated_reason})`,
        )
      : ["- none"]),
    "",
    "## Bundle",
    `- Status: ${report.bundle.status}`,
    `- Reason: ${report.bundle.reason}`,
    `- Task IDs: ${report.bundle.task_ids.join(", ") || "none"}`,
    `- Decision: ${report.bundle.decision?.decision ?? "n/a"}`,
    `- Score: ${report.bundle.decision?.ranking?.score ?? "n/a"}`,
    `- Band: ${report.bundle.decision?.ranking?.band ?? "n/a"}`,
    `- Portfolio stress: ${report.bundle.portfolio_stress?.passes ?? "n/a"}`,
  ];

  return `${lines.join("\n")}\n`;
}

export async function writeResearchOpportunityReviewReport(args: {
  config: ResearchConfig;
  report: ResearchOpportunityReviewReport;
}): Promise<{
  jsonPath: string;
  markdownPath: string;
  latestJsonPath: string;
  latestMarkdownPath: string;
}> {
  const reviewDir = path.join(args.config.paths.reportsDir, "reviews");
  await ensureDirectory(reviewDir);

  const safeId = sanitizeFileSegment(args.report.report_id);
  const jsonPath = path.join(reviewDir, `${safeId}.json`);
  const markdownPath = path.join(reviewDir, `${safeId}.md`);
  const latestJsonPath = path.join(reviewDir, "opportunity-review-latest.json");
  const latestMarkdownPath = path.join(reviewDir, "opportunity-review-latest.md");

  await writeJsonAtomic(jsonPath, args.report);
  await writeJsonAtomic(latestJsonPath, args.report);
  const markdown = renderOpportunityReviewMarkdown(args.report);
  await writeFile(markdownPath, markdown, "utf8");
  await writeFile(latestMarkdownPath, markdown, "utf8");

  return {
    jsonPath,
    markdownPath,
    latestJsonPath,
    latestMarkdownPath,
  };
}

export async function buildAndWriteResearchOpportunityReviewReport(
  config?: ResearchConfig,
  deps: OpportunityReviewDeps = {},
): Promise<{
  report: ResearchOpportunityReviewReport;
  outputs: {
    jsonPath: string;
    markdownPath: string;
    latestJsonPath: string;
    latestMarkdownPath: string;
  };
}> {
  const resolvedConfig = config ?? (await loadResearchConfig());
  const report = await buildResearchOpportunityReviewReport(resolvedConfig, deps);
  const outputs = await writeResearchOpportunityReviewReport({
    config: resolvedConfig,
    report,
  });

  return {
    report,
    outputs,
  };
}
