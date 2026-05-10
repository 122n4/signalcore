import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";

import { fileExists, ensureDirectory, sanitizeFileSegment, writeJsonAtomic } from "./fs";
import { readResearchQueue } from "./queue";
import type {
  ResearchConfig,
  ResearchDecisionLedgerEntry,
  ResearchPromotionBoardEntry,
  ResearchPromotionBoardReport,
  ResearchPromotionPackage,
  ResearchPromotionPackageReview,
  ResearchPromotionPackageReport,
  ResearchPromotionPackageRunArtifact,
} from "./types";

async function readDecisionLedgerEntries(
  config: ResearchConfig,
): Promise<ResearchDecisionLedgerEntry[]> {
  try {
    const raw = await readFile(config.paths.decisionsPath, "utf8");
    return raw
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as ResearchDecisionLedgerEntry);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

function buildManualChecklist(entry: ResearchPromotionBoardEntry): string[] {
  const checklist = [
    "Review decision/comparison artifacts against the current live baseline.",
    "Confirm affected instruments, sessions, and setup scope still match the intended live surface.",
    "Confirm expected frequency and drawdown impact are acceptable for the live stack.",
    "Confirm no conflict with already approved live promotions or active review packages.",
  ];

  if (entry.source === "bundle") {
    checklist.push("Review bundle overlap/crowding and confirm portfolio stress still passes.");
  }

  return checklist;
}

function buildPackageReview(entry: ResearchPromotionBoardEntry): ResearchPromotionPackageReview {
  const blockers: string[] = [];
  const cautions: string[] = [];

  if (entry.board_status === "watchlist") {
    blockers.push("Board status is watchlist, not review-ready.");
  }
  if (
    entry.campaign_metadata_source === "missing" ||
    !entry.primary_campaign_id ||
    !entry.primary_campaign_objective
  ) {
    blockers.push("Missing campaign metadata.");
  }
  if (
    entry.ranking_metadata_source === "missing" ||
    entry.score === null ||
    !entry.band
  ) {
    blockers.push("Missing ranking metadata.");
  }
  if (!entry.aggregate_summary || !entry.crisis_summary || !entry.walkforward_summary) {
    blockers.push("Missing metric summary evidence.");
  }
  if (entry.source === "bundle" && entry.portfolio_stress_passed !== true) {
    blockers.push("Bundle does not have a passing portfolio stress confirmation.");
  }

  if (entry.source === "task" && entry.board_status === "review_ready") {
    cautions.push("Task-level promote is not yet bundle-confirmed.");
  }
  if (entry.campaign_metadata_source !== "recorded" && entry.campaign_metadata_source !== "missing") {
    cautions.push(`Campaign metadata was backfilled from ${entry.campaign_metadata_source}.`);
  }
  if (entry.ranking_metadata_source !== "recorded" && entry.ranking_metadata_source !== "missing") {
    cautions.push(`Ranking metadata was backfilled from ${entry.ranking_metadata_source}.`);
  }
  if ((entry.walkforward_summary?.totalTrades ?? 0) < 10) {
    cautions.push("Walk-forward sample is still small.");
  }
  if ((entry.crisis_summary?.expectancy ?? 0) < 0) {
    cautions.push("Crisis expectancy remains negative.");
  }

  return {
    ready_for_live_review: blockers.length === 0,
    blockers,
    cautions,
    checklist: buildManualChecklist(entry),
  };
}

function mapLatestLedgerByTaskId(args: {
  entries: ResearchDecisionLedgerEntry[];
  liveBaselineId: string | null;
}): Map<string, ResearchDecisionLedgerEntry> {
  const latestByTaskId = new Map<string, ResearchDecisionLedgerEntry>();

  for (const entry of args.entries) {
    if (!args.liveBaselineId || entry.baseline_id !== args.liveBaselineId) {
      continue;
    }
    const previous = latestByTaskId.get(entry.task_id);
    if (!previous || previous.timestamp.localeCompare(entry.timestamp) < 0) {
      latestByTaskId.set(entry.task_id, entry);
    }
  }

  return latestByTaskId;
}

async function buildRunArtifacts(args: {
  config: ResearchConfig;
  entry: ResearchPromotionBoardEntry;
  latestLedgerByTaskId: Map<string, ResearchDecisionLedgerEntry>;
  queueTaskRunIds: Map<string, string | null>;
}): Promise<ResearchPromotionPackageRunArtifact[]> {
  const artifacts: ResearchPromotionPackageRunArtifact[] = [];

  for (const [index, taskId] of args.entry.task_ids.entries()) {
    const runId =
      (index === 0 ? args.entry.run_id : null) ??
      args.latestLedgerByTaskId.get(taskId)?.run_id ??
      args.queueTaskRunIds.get(taskId) ??
      null;

    if (!runId) {
      continue;
    }

    const runDir = path.join(args.config.paths.runsDir, runId);
    const manifestPath = path.join(runDir, "manifest.json");
    const comparisonPath = path.join(runDir, "comparison.json");
    const decisionPath = path.join(runDir, "decision.json");

    artifacts.push({
      task_id: taskId,
      run_id: runId,
      manifest_path: (await fileExists(manifestPath)) ? manifestPath : null,
      comparison_path: (await fileExists(comparisonPath)) ? comparisonPath : null,
      decision_path: (await fileExists(decisionPath)) ? decisionPath : null,
    });
  }

  return artifacts;
}

function sortPackages(left: ResearchPromotionPackage, right: ResearchPromotionPackage): number {
  return (
    Number(right.review.ready_for_live_review) - Number(left.review.ready_for_live_review) ||
    (right.score ?? Number.NEGATIVE_INFINITY) - (left.score ?? Number.NEGATIVE_INFINITY) ||
    right.generated_at.localeCompare(left.generated_at) ||
    left.package_id.localeCompare(right.package_id)
  );
}

export async function buildResearchPromotionPackageReport(args: {
  config: ResearchConfig;
  boardReport: ResearchPromotionBoardReport;
}): Promise<ResearchPromotionPackageReport> {
  const queue = await readResearchQueue(args.config);
  const ledgerEntries = await readDecisionLedgerEntries(args.config);
  const latestLedgerByTaskId = mapLatestLedgerByTaskId({
    entries: ledgerEntries,
    liveBaselineId: args.boardReport.live_baseline_id,
  });
  const queueTaskRunIds = new Map(
    queue.tasks.map((task) => [task.id, task.last_run_id ?? null] as const),
  );
  const boardLatestJsonPath = path.join(
    args.config.paths.reportsDir,
    "boards",
    "promotion-board-latest.json",
  );
  const boardLatestMarkdownPath = path.join(
    args.config.paths.reportsDir,
    "boards",
    "promotion-board-latest.md",
  );
  const bundleLatestJsonPath = path.join(
    args.config.paths.reportsDir,
    "bundles",
    "bundle-validation-latest.json",
  );
  const bundleLatestMarkdownPath = path.join(
    args.config.paths.reportsDir,
    "bundles",
    "bundle-validation-latest.md",
  );

  const packages = await Promise.all(
    args.boardReport.entries
      .filter((entry) => entry.board_status !== "watchlist")
      .map(async (entry) => {
        const review = buildPackageReview(entry);
        const runArtifacts = await buildRunArtifacts({
          config: args.config,
          entry,
          latestLedgerByTaskId,
          queueTaskRunIds,
        });

        return {
          package_id: `package-${entry.entry_id}`,
          generated_at: args.boardReport.generated_at,
          baseline_id: entry.baseline_id,
          entry_id: entry.entry_id,
          source: entry.source,
          board_status: entry.board_status,
          decision: entry.decision,
          summary: entry.summary,
          task_ids: [...entry.task_ids],
          campaign_ids: [...entry.campaign_ids],
          campaign_objectives: [...entry.campaign_objectives],
          primary_campaign_id: entry.primary_campaign_id,
          primary_campaign_objective: entry.primary_campaign_objective,
          campaign_metadata_source: entry.campaign_metadata_source,
          campaign_mode: entry.campaign_mode,
          run_id: entry.run_id,
          score: entry.score,
          band: entry.band,
          ranking_metadata_source: entry.ranking_metadata_source,
          portfolio_stress_passed: entry.portfolio_stress_passed ?? null,
          portfolio_stress_overlap_ratio: entry.portfolio_stress_overlap_ratio ?? null,
          portfolio_stress_max_concurrent: entry.portfolio_stress_max_concurrent ?? null,
          aggregate_summary: entry.aggregate_summary,
          crisis_summary: entry.crisis_summary,
          walkforward_summary: entry.walkforward_summary,
          review,
          artifacts: {
            board_json_path: (await fileExists(boardLatestJsonPath)) ? boardLatestJsonPath : null,
            board_markdown_path: (await fileExists(boardLatestMarkdownPath))
              ? boardLatestMarkdownPath
              : null,
            bundle_json_path:
              entry.source === "bundle" && (await fileExists(bundleLatestJsonPath))
                ? bundleLatestJsonPath
                : null,
            bundle_markdown_path:
              entry.source === "bundle" && (await fileExists(bundleLatestMarkdownPath))
                ? bundleLatestMarkdownPath
                : null,
            run_artifacts: runArtifacts,
          },
        } satisfies ResearchPromotionPackage;
      }),
  );

  const sortedPackages = packages.sort(sortPackages);

  return {
    report_id: `promotion-packages-${args.boardReport.generated_at}`,
    generated_at: args.boardReport.generated_at,
    live_baseline_id: args.boardReport.live_baseline_id,
    summary: {
      package_count: sortedPackages.length,
      review_ready_count: sortedPackages.filter((entry) => entry.board_status === "review_ready").length,
      bundle_confirmed_count: sortedPackages.filter((entry) => entry.board_status === "bundle_confirmed").length,
      ready_for_live_review_count: sortedPackages.filter((entry) => entry.review.ready_for_live_review).length,
      blocked_count: sortedPackages.filter((entry) => !entry.review.ready_for_live_review).length,
    },
    packages: sortedPackages,
  };
}

function renderPackageMarkdown(pkg: ResearchPromotionPackage): string {
  const lines = [
    `# ${pkg.package_id}`,
    ``,
    `- Entry: ${pkg.entry_id}`,
    `- Source: ${pkg.source}`,
    `- Board status: ${pkg.board_status}`,
    `- Decision: ${pkg.decision}`,
    `- Baseline: ${pkg.baseline_id}`,
    `- Campaign: ${pkg.primary_campaign_id ?? "n/a"} / ${pkg.primary_campaign_objective ?? "n/a"}`,
    `- Campaign metadata source: ${pkg.campaign_metadata_source}`,
    `- Score: ${pkg.score ?? "n/a"}`,
    `- Band: ${pkg.band ?? "n/a"}`,
    `- Ranking metadata source: ${pkg.ranking_metadata_source}`,
    `- Ready for live review: ${pkg.review.ready_for_live_review ? "yes" : "no"}`,
    ``,
    `## Summary`,
    `- ${pkg.summary}`,
    ``,
    `## Metrics`,
    `- Aggregate expectancy: ${pkg.aggregate_summary?.expectancy ?? "n/a"}`,
    `- Aggregate PF: ${pkg.aggregate_summary?.profitFactor ?? "n/a"}`,
    `- Crisis expectancy: ${pkg.crisis_summary?.expectancy ?? "n/a"}`,
    `- Crisis PF: ${pkg.crisis_summary?.profitFactor ?? "n/a"}`,
    `- Walk-forward expectancy: ${pkg.walkforward_summary?.expectancy ?? "n/a"}`,
    `- Walk-forward PF: ${pkg.walkforward_summary?.profitFactor ?? "n/a"}`,
    `- Portfolio stress passed: ${pkg.portfolio_stress_passed ?? "n/a"}`,
    `- Portfolio overlap ratio: ${pkg.portfolio_stress_overlap_ratio ?? "n/a"}`,
    `- Portfolio max concurrent: ${pkg.portfolio_stress_max_concurrent ?? "n/a"}`,
    ``,
    `## Blockers`,
    ...(pkg.review.blockers.length > 0 ? pkg.review.blockers.map((item) => `- ${item}`) : ["- none"]),
    ``,
    `## Cautions`,
    ...(pkg.review.cautions.length > 0 ? pkg.review.cautions.map((item) => `- ${item}`) : ["- none"]),
    ``,
    `## Checklist`,
    ...pkg.review.checklist.map((item) => `- ${item}`),
    ``,
    `## Artifacts`,
    `- Board JSON: ${pkg.artifacts.board_json_path ?? "n/a"}`,
    `- Board Markdown: ${pkg.artifacts.board_markdown_path ?? "n/a"}`,
    `- Bundle JSON: ${pkg.artifacts.bundle_json_path ?? "n/a"}`,
    `- Bundle Markdown: ${pkg.artifacts.bundle_markdown_path ?? "n/a"}`,
    ...(pkg.artifacts.run_artifacts.length > 0
      ? pkg.artifacts.run_artifacts.flatMap((artifact) => [
          `- Run ${artifact.run_id} / ${artifact.task_id}`,
          `- Manifest: ${artifact.manifest_path ?? "n/a"}`,
          `- Comparison: ${artifact.comparison_path ?? "n/a"}`,
          `- Decision: ${artifact.decision_path ?? "n/a"}`,
        ])
      : ["- Run artifacts: none"]),
  ];

  return `${lines.join("\n")}\n`;
}

export async function writeResearchPromotionPackageReport(args: {
  config: ResearchConfig;
  report: ResearchPromotionPackageReport;
}): Promise<{
  jsonPath: string;
  markdownPath: string;
  latestJsonPath: string;
  latestMarkdownPath: string;
  itemCount: number;
}> {
  const packagesDir = path.join(args.config.paths.reportsDir, "packages");
  const itemsDir = path.join(packagesDir, "items");
  await ensureDirectory(packagesDir);
  await ensureDirectory(itemsDir);

  const safeId = sanitizeFileSegment(args.report.report_id);
  const jsonPath = path.join(packagesDir, `${safeId}.json`);
  const markdownPath = path.join(packagesDir, `${safeId}.md`);
  const latestJsonPath = path.join(packagesDir, "promotion-packages-latest.json");
  const latestMarkdownPath = path.join(packagesDir, "promotion-packages-latest.md");

  await writeJsonAtomic(jsonPath, args.report);
  await writeJsonAtomic(latestJsonPath, args.report);

  for (const pkg of args.report.packages) {
    const packageId = sanitizeFileSegment(pkg.package_id);
    await writeJsonAtomic(path.join(itemsDir, `${packageId}.json`), pkg);
    await writeFile(path.join(itemsDir, `${packageId}.md`), renderPackageMarkdown(pkg), "utf8");
  }

  const markdown = [
    `# Research Promotion Packages`,
    ``,
    `- Generated at: ${args.report.generated_at}`,
    `- Live baseline: ${args.report.live_baseline_id ?? "n/a"}`,
    `- Package count: ${args.report.summary.package_count}`,
    `- Review ready: ${args.report.summary.review_ready_count}`,
    `- Bundle confirmed: ${args.report.summary.bundle_confirmed_count}`,
    `- Ready for live review: ${args.report.summary.ready_for_live_review_count}`,
    `- Blocked: ${args.report.summary.blocked_count}`,
    ``,
    `## Packages`,
    ...(args.report.packages.length > 0
      ? args.report.packages.map(
          (pkg) =>
            `- ${pkg.package_id}: ${pkg.board_status} / ${pkg.decision}` +
            ` [${pkg.score ?? "n/a"} ${pkg.band ?? "n/a"}]` +
            `${pkg.primary_campaign_id ? ` [${pkg.primary_campaign_id}/${pkg.primary_campaign_objective ?? "n/a"}]` : ""}` +
            ` [campaign_source=${pkg.campaign_metadata_source}]` +
            ` [ranking_source=${pkg.ranking_metadata_source}]` +
            ` [ready=${pkg.review.ready_for_live_review ? "yes" : "no"}]`,
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
    itemCount: args.report.packages.length,
  };
}
