import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";

import { fileExists, ensureDirectory, readJsonIfExists, sanitizeFileSegment, writeJsonAtomic } from "./fs";
import { buildResearchReportProvenance } from "./provenance";
import { readResearchQueue } from "./queue";
import { readLatestResearchRegistryReport } from "./registry";
import { resolveResearchReportSchemaVersion } from "./schema";
import { readLatestResearchBundleValidationReport } from "./bundleValidation";
import type {
  ResearchConfig,
  ResearchDecisionLedgerEntry,
  ResearchPromotionBoardEntry,
  ResearchPromotionBoardReport,
  ResearchPromotionPackage,
  ResearchPromotionPackageReview,
  ResearchPromotionPackageReport,
  ResearchPromotionPackageRunArtifact,
  ResearchRegistryArtifactEntry,
  ResearchRegistryReport,
  ResearchTask,
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
  if (entry.source === "bundle" && entry.statistical_validation_passed === false) {
    blockers.push("Bundle does not have a passing statistical validation confirmation.");
  }
  if (entry.source === "bundle" && entry.statistical_validation_passed == null) {
    cautions.push("Bundle does not yet carry an explicit statistical validation summary.");
  }

  if (entry.source === "task" && entry.board_status === "review_ready") {
    cautions.push("Task-level promote is not yet bundle-confirmed.");
  }
  if (entry.source === "task" && entry.statistical_validation_passed == null) {
    cautions.push("Task-level promote has not yet been upgraded into a bundle-level statistical review.");
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

type ResearchPromotionPackageTaskScope = {
  package_id: string;
  instrument: string | null;
  sessions: string[];
  setup_types: string[];
  risk_modes: string[];
  execution_statuses: string[];
  quality_grades: string[];
  clarity_levels: string[];
  environment_states: string[];
};

function normalizeScopeString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeScopeList(values: string[] | undefined): string[] {
  return Array.from(
    new Set(
      (values ?? [])
        .map((value) => normalizeScopeString(value))
        .filter((value): value is string => Boolean(value)),
    ),
  ).sort();
}

function buildPackageTaskScope(args: {
  pkg: ResearchPromotionPackage;
  task: ResearchTask | null;
}): ResearchPromotionPackageTaskScope | null {
  if (args.pkg.source !== "task" || !args.task) {
    return null;
  }

  const instruments = normalizeScopeList(args.task.candidate_scope.instruments);
  return {
    package_id: args.pkg.package_id,
    instrument: instruments[0] ?? null,
    sessions: normalizeScopeList(args.task.candidate_scope.sessions),
    setup_types: normalizeScopeList(args.task.candidate_scope.setup_types),
    risk_modes: normalizeScopeList(args.task.candidate_scope.risk_modes),
    execution_statuses: normalizeScopeList(args.task.candidate_scope.execution_statuses),
    quality_grades: normalizeScopeList(args.task.candidate_scope.quality_grades),
    clarity_levels: normalizeScopeList(args.task.candidate_scope.clarity_levels),
    environment_states: normalizeScopeList(args.task.candidate_scope.environment_states),
  };
}

function scopeValueOverlaps(left: string | null, right: string | null): boolean {
  return !left || !right || left === right;
}

function scopeListOverlaps(left: string[], right: string[]): boolean {
  if (left.length === 0 || right.length === 0) {
    return true;
  }
  return left.some((value) => right.includes(value));
}

function packageScopesOverlap(
  left: ResearchPromotionPackageTaskScope,
  right: ResearchPromotionPackageTaskScope,
): boolean {
  return (
    scopeValueOverlaps(left.instrument, right.instrument) &&
    scopeListOverlaps(left.sessions, right.sessions) &&
    scopeListOverlaps(left.setup_types, right.setup_types) &&
    scopeListOverlaps(left.risk_modes, right.risk_modes) &&
    scopeListOverlaps(left.execution_statuses, right.execution_statuses) &&
    scopeListOverlaps(left.quality_grades, right.quality_grades) &&
    scopeListOverlaps(left.clarity_levels, right.clarity_levels) &&
    scopeListOverlaps(left.environment_states, right.environment_states)
  );
}

function scopeValueIsSubset(current: string | null, allowed: string | null): boolean {
  if (!current) {
    return !allowed;
  }
  if (!allowed) {
    return true;
  }
  return current === allowed;
}

function scopeListIsSubset(current: string[], allowed: string[]): boolean {
  if (current.length === 0) {
    return allowed.length === 0;
  }
  if (allowed.length === 0) {
    return true;
  }
  return current.every((value) => allowed.includes(value));
}

function packageScopeIsSubset(
  current: ResearchPromotionPackageTaskScope,
  allowed: ResearchPromotionPackageTaskScope,
): boolean {
  return (
    scopeValueIsSubset(current.instrument, allowed.instrument) &&
    scopeListIsSubset(current.sessions, allowed.sessions) &&
    scopeListIsSubset(current.setup_types, allowed.setup_types) &&
    scopeListIsSubset(current.risk_modes, allowed.risk_modes) &&
    scopeListIsSubset(current.execution_statuses, allowed.execution_statuses) &&
    scopeListIsSubset(current.quality_grades, allowed.quality_grades) &&
    scopeListIsSubset(current.clarity_levels, allowed.clarity_levels) &&
    scopeListIsSubset(current.environment_states, allowed.environment_states)
  );
}

function packageScopeIsStrictSubset(
  current: ResearchPromotionPackageTaskScope,
  allowed: ResearchPromotionPackageTaskScope,
): boolean {
  return (
    packageScopeIsSubset(current, allowed) &&
    !packageScopeIsSubset(allowed, current)
  );
}

async function buildPackageScientificEquivalenceKey(
  pkg: ResearchPromotionPackage,
): Promise<string | null> {
  const comparisonPath = pkg.artifacts.run_artifacts[0]?.comparison_path ?? null;
  if (!comparisonPath) {
    return null;
  }

  const comparison = await readJsonIfExists<Record<string, unknown>>(comparisonPath);
  if (!comparison) {
    return null;
  }

  return JSON.stringify({
    baseline_id: pkg.baseline_id,
    decision: pkg.decision,
    primary_campaign_id: pkg.primary_campaign_id ?? null,
    primary_campaign_objective: pkg.primary_campaign_objective ?? null,
    score: pkg.score ?? null,
    band: pkg.band ?? null,
    aggregate_summary: pkg.aggregate_summary ?? null,
    crisis_summary: pkg.crisis_summary ?? null,
    walkforward_summary: pkg.walkforward_summary ?? null,
    comparison: {
      aggregate: comparison.aggregate ?? null,
      crisis: comparison.crisis ?? null,
      walkForward: comparison.walkForward ?? null,
      robustness: comparison.robustness ?? null,
      statistical_validation: comparison.statistical_validation ?? null,
      gates: comparison.gates ?? null,
    },
  });
}

async function applyAmbiguousTaskScopeBlockers(args: {
  packages: ResearchPromotionPackage[];
  tasksById: Map<string, ResearchTask>;
}): Promise<ResearchPromotionPackage[]> {
  const canonicalDuplicateBlockers = new Map<string, string>();
  const overlapsByPackageId = new Map<string, Set<string>>();
  const candidateScopes = (
    await Promise.all(
      args.packages
        .filter((pkg) => pkg.source === "task" && pkg.review.ready_for_live_review)
        .map(async (pkg) => ({
          pkg,
          scope: buildPackageTaskScope({
            pkg,
            task: args.tasksById.get(pkg.task_ids[0] ?? "") ?? null,
          }),
          scientificKey: await buildPackageScientificEquivalenceKey(pkg),
        })),
    )
  )
    .filter(
      (
        entry,
      ): entry is {
        pkg: ResearchPromotionPackage;
        scope: ResearchPromotionPackageTaskScope;
        scientificKey: string | null;
      } => Boolean(entry.scope),
    );

  for (let leftIndex = 0; leftIndex < candidateScopes.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < candidateScopes.length; rightIndex += 1) {
      const left = candidateScopes[leftIndex];
      const right = candidateScopes[rightIndex];
      if (!left || !right) {
        continue;
      }
      if (!packageScopesOverlap(left.scope, right.scope)) {
        continue;
      }

      const scopesAreEquivalent =
        Boolean(left.scientificKey) &&
        left.scientificKey === right.scientificKey;
      const leftIsNarrower = packageScopeIsStrictSubset(left.scope, right.scope);
      const rightIsNarrower = packageScopeIsStrictSubset(right.scope, left.scope);

      if (scopesAreEquivalent && leftIsNarrower) {
        canonicalDuplicateBlockers.set(right.pkg.package_id, left.pkg.package_id);
        continue;
      }
      if (scopesAreEquivalent && rightIsNarrower) {
        canonicalDuplicateBlockers.set(left.pkg.package_id, right.pkg.package_id);
        continue;
      }
    }
  }

  const activeCandidatePackageIds = new Set(
    candidateScopes
      .map((entry) => entry.pkg.package_id)
      .filter((packageId) => !canonicalDuplicateBlockers.has(packageId)),
  );

  for (let leftIndex = 0; leftIndex < candidateScopes.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < candidateScopes.length; rightIndex += 1) {
      const left = candidateScopes[leftIndex];
      const right = candidateScopes[rightIndex];
      if (!left || !right) {
        continue;
      }
      if (
        !activeCandidatePackageIds.has(left.pkg.package_id) ||
        !activeCandidatePackageIds.has(right.pkg.package_id)
      ) {
        continue;
      }
      if (!packageScopesOverlap(left.scope, right.scope)) {
        continue;
      }

      const leftOverlaps = overlapsByPackageId.get(left.pkg.package_id) ?? new Set<string>();
      leftOverlaps.add(right.pkg.package_id);
      overlapsByPackageId.set(left.pkg.package_id, leftOverlaps);

      const rightOverlaps = overlapsByPackageId.get(right.pkg.package_id) ?? new Set<string>();
      rightOverlaps.add(left.pkg.package_id);
      overlapsByPackageId.set(right.pkg.package_id, rightOverlaps);
    }
  }

  if (overlapsByPackageId.size === 0 && canonicalDuplicateBlockers.size === 0) {
    return args.packages;
  }

  return args.packages.map((pkg) => {
    const narrowerPackageId = canonicalDuplicateBlockers.get(pkg.package_id);
    if (narrowerPackageId) {
      return {
        ...pkg,
        review: {
          ...pkg.review,
          ready_for_live_review: false,
          blockers: Array.from(
            new Set([
              ...pkg.review.blockers,
              `Broader overlapping scope than equivalent narrower package '${narrowerPackageId}'. Canonical Promote -> Paper handoff keeps the narrowest equivalent task scope.`,
            ]),
          ),
        },
      };
    }

    const overlaps = overlapsByPackageId.get(pkg.package_id);
    if (!overlaps || overlaps.size === 0) {
      return pkg;
    }

    const overlapBlockers = Array.from(overlaps)
      .sort()
      .map(
        (packageId) =>
          `Overlapping ready-for-live-review scope with package '${packageId}'. Canonical Promote -> Paper handoff requires a unique scope.`,
      );

    return {
      ...pkg,
      review: {
        ...pkg.review,
        ready_for_live_review: false,
        blockers: Array.from(new Set([...pkg.review.blockers, ...overlapBlockers])),
      },
    };
  });
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
  registryReport: ResearchRegistryReport | null;
}): Promise<ResearchPromotionPackageRunArtifact[]> {
  const artifacts: ResearchPromotionPackageRunArtifact[] = [];

  function resolveRegistryArtifact(
    runId: string,
    artifactType: ResearchRegistryArtifactEntry["artifact_type"],
  ) {
    return (
      args.registryReport?.artifacts.find(
        (artifact) =>
          artifact.run_id === runId &&
          artifact.artifact_type === artifactType,
      ) ?? null
    );
  }

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
    const manifestArtifact = resolveRegistryArtifact(runId, "manifest");
    const comparisonArtifact = resolveRegistryArtifact(runId, "comparison");
    const decisionArtifact = resolveRegistryArtifact(runId, "decision");

    artifacts.push({
      task_id: taskId,
      run_id: runId,
      manifest_path: (await fileExists(manifestPath)) ? manifestPath : null,
      comparison_path: (await fileExists(comparisonPath)) ? comparisonPath : null,
      decision_path: (await fileExists(decisionPath)) ? decisionPath : null,
      manifest_artifact_id: manifestArtifact?.artifact_id ?? null,
      manifest_artifact_version: manifestArtifact?.artifact_version ?? null,
      comparison_artifact_id: comparisonArtifact?.artifact_id ?? null,
      comparison_artifact_version: comparisonArtifact?.artifact_version ?? null,
      decision_artifact_id: decisionArtifact?.artifact_id ?? null,
      decision_artifact_version: decisionArtifact?.artifact_version ?? null,
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
  const tasksById = new Map(queue.tasks.map((task) => [task.id, task] as const));
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
  const registryLatestJsonPath = path.join(
    args.config.paths.reportsDir,
    "registry",
    "registry-latest.json",
  );
  const [registryReport, bundleLatestReport] = await Promise.all([
    readLatestResearchRegistryReport(args.config),
    readLatestResearchBundleValidationReport({
      config: args.config,
      baselineId: args.boardReport.live_baseline_id,
    }),
  ]);

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
          registryReport,
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
          statistical_validation_passed: entry.statistical_validation_passed ?? null,
          deflated_sharpe_ratio: entry.deflated_sharpe_ratio ?? null,
          pbo_estimate: entry.pbo_estimate ?? null,
          white_reality_check_p_value: entry.white_reality_check_p_value ?? null,
          aggregate_summary: entry.aggregate_summary,
          crisis_summary: entry.crisis_summary,
          walkforward_summary: entry.walkforward_summary,
          review,
          artifacts: {
            board_report_id: args.boardReport.report_id,
            board_json_path: (await fileExists(boardLatestJsonPath)) ? boardLatestJsonPath : null,
            board_markdown_path: (await fileExists(boardLatestMarkdownPath))
              ? boardLatestMarkdownPath
              : null,
            bundle_report_id: entry.source === "bundle" ? bundleLatestReport?.report_id ?? null : null,
            bundle_json_path:
              entry.source === "bundle" && (await fileExists(bundleLatestJsonPath))
                ? bundleLatestJsonPath
                : null,
            bundle_markdown_path:
              entry.source === "bundle" && (await fileExists(bundleLatestMarkdownPath))
                ? bundleLatestMarkdownPath
                : null,
            registry_report_id: registryReport?.report_id ?? null,
            registry_json_path: (await fileExists(registryLatestJsonPath)) ? registryLatestJsonPath : null,
            run_artifacts: runArtifacts,
          },
        } satisfies ResearchPromotionPackage;
      }),
  );

  const sortedPackages = (await applyAmbiguousTaskScopeBlockers({
    packages,
    tasksById,
  })).sort(sortPackages);

  return {
    schema_version: resolveResearchReportSchemaVersion("promotionPackages"),
    provenance: await buildResearchReportProvenance({
      config: args.config,
      upstreamReportIds: [
        args.boardReport.report_id,
        bundleLatestReport?.report_id ?? "",
        registryReport?.report_id ?? "",
      ],
    }),
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

export async function readLatestResearchPromotionPackageReport(
  config: ResearchConfig,
): Promise<ResearchPromotionPackageReport | null> {
  const latestJsonPath = path.join(
    config.paths.reportsDir,
    "packages",
    "promotion-packages-latest.json",
  );
  return readJsonIfExists<ResearchPromotionPackageReport>(latestJsonPath);
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
    `- Statistical validation passed: ${pkg.statistical_validation_passed ?? "n/a"}`,
    `- Deflated Sharpe Ratio: ${pkg.deflated_sharpe_ratio ?? "n/a"}`,
    `- Estimated PBO: ${pkg.pbo_estimate ?? "n/a"}`,
    `- White Reality Check p-value: ${pkg.white_reality_check_p_value ?? "n/a"}`,
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
    `- Registry JSON: ${pkg.artifacts.registry_json_path ?? "n/a"}`,
    `- Bundle JSON: ${pkg.artifacts.bundle_json_path ?? "n/a"}`,
    `- Bundle Markdown: ${pkg.artifacts.bundle_markdown_path ?? "n/a"}`,
    ...(pkg.artifacts.run_artifacts.length > 0
      ? pkg.artifacts.run_artifacts.flatMap((artifact) => [
          `- Run ${artifact.run_id} / ${artifact.task_id}`,
          `- Manifest: ${artifact.manifest_path ?? "n/a"}`,
          `- Manifest artifact: ${artifact.manifest_artifact_id ?? "n/a"}`,
          `- Comparison: ${artifact.comparison_path ?? "n/a"}`,
          `- Comparison artifact: ${artifact.comparison_artifact_id ?? "n/a"}`,
          `- Decision: ${artifact.decision_path ?? "n/a"}`,
          `- Decision artifact: ${artifact.decision_artifact_id ?? "n/a"}`,
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
    `- Schema version: ${args.report.schema_version}`,
    `- Upstream reports: ${args.report.provenance.upstream_report_ids.length}`,
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
