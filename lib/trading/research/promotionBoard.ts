import path from "node:path";
import { readdir, readFile, writeFile } from "node:fs/promises";

import {
  buildCurrentResearchTaskView,
  buildResearchPromotionBundleCandidates,
  buildResearchTaskOpportunityKey,
} from "./bundleValidation";
import { buildResearchCampaignMap, readResearchCampaignLibrary } from "./campaigns";
import {
  ensureDirectory,
  readJsonFile,
  readJsonIfExists,
  sanitizeFileSegment,
  stableStringify,
  writeJsonAtomic,
} from "./fs";
import { readResearchQueue } from "./queue";
import { rankResearchOpportunityFromSummaries } from "./ranking";
import type {
  ResearchCampaignDefinition,
  ResearchCampaignMetadataSource,
  ResearchBundleValidationReport,
  ResearchCampaignObjective,
  ResearchCampaignPerformanceEntry,
  ResearchCandidateLibrary,
  ResearchConfig,
  ResearchDecisionLedgerEntry,
  ResearchPromotionBoardEntry,
  ResearchPromotionBoardReport,
  ResearchPromotionBoardStatus,
  ResearchRankingMetadataSource,
  ResearchTask,
} from "./types";

type ResolvedCampaignMetadata = {
  campaignIds: string[];
  campaignObjectives: ResearchCampaignObjective[];
  primaryCampaignId: string | null;
  primaryCampaignObjective: ResearchCampaignObjective | null;
  campaignMode: "single" | "mixed" | "unknown";
  campaignMetadataSource: ResearchCampaignMetadataSource;
};

type ResolvedRankingMetadata = {
  score: number | null;
  band: ResearchPromotionBoardEntry["band"];
  rankingMetadataSource: ResearchRankingMetadataSource;
};

type CampaignLookupValue = {
  campaignId: string | null;
  objective: ResearchCampaignObjective | null;
};

type CandidateCampaignLookup = {
  byFamilyId: Map<string, CampaignLookupValue>;
  byTemplateId: Map<string, CampaignLookupValue>;
};

function buildLedgerOpportunityKey(args: {
  entry: ResearchDecisionLedgerEntry;
  task: ResearchTask | null;
}): string {
  const templateId =
    typeof args.entry.planner_template_id === "string" && args.entry.planner_template_id.trim().length > 0
      ? args.entry.planner_template_id.trim()
      : typeof args.task?.planner_source?.template_id === "string" &&
          args.task.planner_source.template_id.trim().length > 0
        ? args.task.planner_source.template_id.trim()
        : null;

  if (templateId) {
    return `${args.entry.baseline_id}::template::${templateId}`;
  }

  if (args.task) {
    return buildResearchTaskOpportunityKey(args.task);
  }

  if (args.entry.run_fingerprint && args.entry.run_fingerprint.trim().length > 0) {
    return `${args.entry.baseline_id}::fingerprint::${args.entry.run_fingerprint}`;
  }

  return `${args.entry.baseline_id}::task::${args.entry.task_id}::${stableStringify({
    family: args.entry.planner_family_id ?? null,
    template: args.entry.planner_template_id ?? null,
  })}`;
}

function getBoardStatusRank(status: ResearchPromotionBoardStatus): number {
  switch (status) {
    case "bundle_confirmed":
      return 0;
    case "review_ready":
      return 1;
    case "watchlist":
      return 2;
  }
}

function sortBoardEntries(
  left: ResearchPromotionBoardEntry,
  right: ResearchPromotionBoardEntry,
): number {
  return (
    getBoardStatusRank(left.board_status) - getBoardStatusRank(right.board_status) ||
    (right.score ?? Number.NEGATIVE_INFINITY) - (left.score ?? Number.NEGATIVE_INFINITY) ||
    right.generated_at.localeCompare(left.generated_at) ||
    left.entry_id.localeCompare(right.entry_id)
  );
}

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

async function readBundleReports(
  config: ResearchConfig,
): Promise<ResearchBundleValidationReport[]> {
  const bundleDir = path.join(config.paths.reportsDir, "bundles");

  try {
    const filenames = await readdir(bundleDir);
    const reports = await Promise.all(
      filenames
        .filter((filename) => filename.endsWith(".json"))
        .map((filename) =>
          readJsonFile<ResearchBundleValidationReport>(path.join(bundleDir, filename)),
        ),
    );
    return reports;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

function dedupeStrings(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }
    const trimmed = value.trim();
    if (trimmed.length === 0 || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    normalized.push(trimmed);
  }

  return normalized;
}

function dedupeObjectives(
  values: Array<ResearchCampaignObjective | null | undefined>,
): ResearchCampaignObjective[] {
  return dedupeStrings(values) as ResearchCampaignObjective[];
}

function normalizeCampaignMetadata(args: {
  campaignIds: Array<string | null | undefined>;
  campaignObjectives: Array<ResearchCampaignObjective | null | undefined>;
  source: ResearchCampaignMetadataSource;
}): ResolvedCampaignMetadata {
  const campaignIds = dedupeStrings(args.campaignIds);
  const campaignObjectives = dedupeObjectives(args.campaignObjectives);
  const hasAnyMetadata = campaignIds.length > 0 || campaignObjectives.length > 0;

  if (!hasAnyMetadata) {
    return {
      campaignIds: [],
      campaignObjectives: [],
      primaryCampaignId: null,
      primaryCampaignObjective: null,
      campaignMode: "unknown",
      campaignMetadataSource: "missing",
    };
  }

  const campaignMode =
    campaignIds.length > 1 || campaignObjectives.length > 1 ? "mixed" : "single";

  return {
    campaignIds,
    campaignObjectives,
    primaryCampaignId: campaignIds[0] ?? null,
    primaryCampaignObjective: campaignObjectives[0] ?? null,
    campaignMode,
    campaignMetadataSource: args.source,
  };
}

function resolveCampaignObjective(args: {
  campaignId: string | null;
  explicitObjective: ResearchCampaignObjective | null | undefined;
  campaignMap: Map<string, ResearchCampaignDefinition>;
}): ResearchCampaignObjective | null {
  if (args.explicitObjective) {
    return args.explicitObjective;
  }
  if (!args.campaignId) {
    return null;
  }
  return args.campaignMap.get(args.campaignId)?.objective ?? null;
}

function isCandidateLibrary(value: unknown): value is ResearchCandidateLibrary {
  if (!value || typeof value !== "object") {
    return false;
  }
  const library = value as ResearchCandidateLibrary;
  return library.version === 1 && Array.isArray(library.families);
}

async function readCandidateLibraries(config: ResearchConfig): Promise<ResearchCandidateLibrary[]> {
  const libraries: ResearchCandidateLibrary[] = [];
  const targetPaths = [
    config.paths.candidateLibraryPath,
    config.paths.candidateReserveLibraryPath,
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);

  for (const targetPath of targetPaths) {
    const library = await readJsonIfExists<ResearchCandidateLibrary>(targetPath);
    if (isCandidateLibrary(library)) {
      libraries.push(library);
    }
  }

  return libraries;
}

function buildCandidateCampaignLookup(args: {
  libraries: ResearchCandidateLibrary[];
  campaignMap: Map<string, ResearchCampaignDefinition>;
}): CandidateCampaignLookup {
  const byFamilyId = new Map<string, CampaignLookupValue>();
  const byTemplateId = new Map<string, CampaignLookupValue>();

  for (const library of args.libraries) {
    for (const family of library.families) {
      const campaignId =
        typeof family.campaign_id === "string" && family.campaign_id.trim().length > 0
          ? family.campaign_id
          : null;
      const objective = resolveCampaignObjective({
        campaignId,
        explicitObjective: null,
        campaignMap: args.campaignMap,
      });
      const lookupValue = {
        campaignId,
        objective,
      };

      if ((campaignId || objective) && !byFamilyId.has(family.id)) {
        byFamilyId.set(family.id, lookupValue);
      }

      for (const template of family.templates) {
        if ((campaignId || objective) && !byTemplateId.has(template.id)) {
          byTemplateId.set(template.id, lookupValue);
        }
      }
    }
  }

  return {
    byFamilyId,
    byTemplateId,
  };
}

function resolveCampaignMetadata(args: {
  ledgerEntry?: ResearchDecisionLedgerEntry | null;
  task?: ResearchTask | null;
  candidateLookup: CandidateCampaignLookup;
  campaignMap: Map<string, ResearchCampaignDefinition>;
}): ResolvedCampaignMetadata {
  const recordedCampaignId =
    typeof args.ledgerEntry?.planner_campaign_id === "string" &&
    args.ledgerEntry.planner_campaign_id.trim().length > 0
      ? args.ledgerEntry.planner_campaign_id
      : null;
  const recordedObjective = resolveCampaignObjective({
    campaignId: recordedCampaignId,
    explicitObjective: args.ledgerEntry?.planner_campaign_objective ?? null,
    campaignMap: args.campaignMap,
  });

  if (recordedCampaignId || recordedObjective) {
    return normalizeCampaignMetadata({
      campaignIds: [recordedCampaignId],
      campaignObjectives: [recordedObjective],
      source: "recorded",
    });
  }

  const taskCampaignId =
    typeof args.task?.planner_source?.campaign_id === "string" &&
    args.task.planner_source.campaign_id.trim().length > 0
      ? args.task.planner_source.campaign_id
      : null;
  const taskObjective = resolveCampaignObjective({
    campaignId: taskCampaignId,
    explicitObjective: args.task?.planner_source?.campaign_objective ?? null,
    campaignMap: args.campaignMap,
  });

  if (taskCampaignId || taskObjective) {
    return normalizeCampaignMetadata({
      campaignIds: [taskCampaignId],
      campaignObjectives: [taskObjective],
      source: "task",
    });
  }

  const templateId = args.ledgerEntry?.planner_template_id ?? args.task?.planner_source?.template_id;
  const familyId = args.ledgerEntry?.planner_family_id ?? args.task?.planner_source?.family_id;
  const lookup =
    (templateId ? args.candidateLookup.byTemplateId.get(templateId) : undefined) ??
    (familyId ? args.candidateLookup.byFamilyId.get(familyId) : undefined);

  if (lookup?.campaignId || lookup?.objective) {
    return normalizeCampaignMetadata({
      campaignIds: [lookup.campaignId],
      campaignObjectives: [lookup.objective],
      source: "library_backfill",
    });
  }

  return normalizeCampaignMetadata({
    campaignIds: [],
    campaignObjectives: [],
    source: "missing",
  });
}

function resolveRankingMetadata(args: {
  ledgerEntry?: ResearchDecisionLedgerEntry | null;
  aggregateSummary: ResearchPromotionBoardEntry["aggregate_summary"];
  crisisSummary: ResearchPromotionBoardEntry["crisis_summary"];
  walkforwardSummary: ResearchPromotionBoardEntry["walkforward_summary"];
}): ResolvedRankingMetadata {
  if (
    typeof args.ledgerEntry?.ranking_score === "number" &&
    args.ledgerEntry?.ranking_band
  ) {
    return {
      score: args.ledgerEntry.ranking_score,
      band: args.ledgerEntry.ranking_band,
      rankingMetadataSource: "recorded",
    };
  }

  if (args.aggregateSummary && args.crisisSummary && args.walkforwardSummary) {
    const ranking = rankResearchOpportunityFromSummaries({
      aggregate: args.aggregateSummary,
      crisis: args.crisisSummary,
      walkForward: args.walkforwardSummary,
    });
    return {
      score: ranking.score,
      band: ranking.band,
      rankingMetadataSource: "summary_backfill",
    };
  }

  return {
    score: null,
    band: null,
    rankingMetadataSource: "missing",
  };
}

function buildLatestTaskLedgerEntries(args: {
  ledgerEntries: ResearchDecisionLedgerEntry[];
  liveBaselineId: string | null;
  queueTasksById: Map<string, ResearchTask>;
}): ResearchDecisionLedgerEntry[] {
  if (!args.liveBaselineId) {
    return [];
  }

  const latestByOpportunity = new Map<string, ResearchDecisionLedgerEntry>();

  for (const entry of args.ledgerEntries) {
    if (entry.baseline_id !== args.liveBaselineId) {
      continue;
    }

    const task = args.queueTasksById.get(entry.task_id) ?? null;
    const key = buildLedgerOpportunityKey({
      entry,
      task,
    });
    const previous = latestByOpportunity.get(key);
    if (!previous || previous.timestamp.localeCompare(entry.timestamp) < 0) {
      latestByOpportunity.set(key, entry);
    }
  }

  return [...latestByOpportunity.values()];
}

function buildTaskEntries(args: {
  latestTaskLedgerEntries: ResearchDecisionLedgerEntry[];
  queueTasksById: Map<string, ResearchTask>;
  candidateLookup: CandidateCampaignLookup;
  campaignMap: Map<string, ResearchCampaignDefinition>;
}): ResearchPromotionBoardEntry[] {
  return args.latestTaskLedgerEntries
    .filter((entry) => entry.decision === "promote" || entry.decision === "candidate")
    .map((entry) => {
    const decision = entry.decision === "promote" ? "promote" : "candidate";
    const task = args.queueTasksById.get(entry.task_id) ?? null;
    const campaignMetadata = resolveCampaignMetadata({
      ledgerEntry: entry,
      task,
      candidateLookup: args.candidateLookup,
      campaignMap: args.campaignMap,
    });
    const rankingMetadata = resolveRankingMetadata({
      ledgerEntry: entry,
      aggregateSummary: entry.aggregate_summary ?? null,
      crisisSummary: entry.crisis_summary ?? null,
      walkforwardSummary: entry.walkforward_summary ?? null,
    });

    return {
      entry_id: `task-${entry.task_id}`,
      source: "task",
      baseline_id: entry.baseline_id,
      task_ids: [entry.task_id],
      campaign_ids: campaignMetadata.campaignIds,
      campaign_objectives: campaignMetadata.campaignObjectives,
      primary_campaign_id: campaignMetadata.primaryCampaignId,
      primary_campaign_objective: campaignMetadata.primaryCampaignObjective,
      campaign_metadata_source: campaignMetadata.campaignMetadataSource,
      campaign_mode: campaignMetadata.campaignMode,
      run_id: entry.run_id,
      decision,
      board_status: decision === "promote" ? "review_ready" : "watchlist",
      summary: entry.reason,
      score: rankingMetadata.score,
      band: rankingMetadata.band,
      ranking_metadata_source: rankingMetadata.rankingMetadataSource,
      aggregate_summary: entry.aggregate_summary ?? null,
      crisis_summary: entry.crisis_summary ?? null,
      walkforward_summary: entry.walkforward_summary ?? null,
      generated_at: entry.timestamp,
    };
  });
}

function buildBundleEntries(args: {
  bundleReports: ResearchBundleValidationReport[];
  liveBaselineId: string | null;
  currentBundleIds: Set<string>;
  taskEntriesByTaskId: Map<string, ResearchPromotionBoardEntry>;
}): ResearchPromotionBoardEntry[] {
  if (!args.liveBaselineId) {
    return [];
  }

  const latestByBundleId = new Map<
    string,
    { report: ResearchBundleValidationReport; result: ResearchBundleValidationReport["results"][number] }
  >();

  for (const report of args.bundleReports) {
    if (report.baseline_id !== args.liveBaselineId) {
      continue;
    }

    for (const result of report.results) {
      if (!args.currentBundleIds.has(result.bundle_id)) {
        continue;
      }
      if (result.decision.decision !== "promote" && result.decision.decision !== "candidate") {
        continue;
      }

      const previous = latestByBundleId.get(result.bundle_id);
      if (!previous || previous.report.generated_at.localeCompare(report.generated_at) < 0) {
        latestByBundleId.set(result.bundle_id, { report, result });
      }
    }
  }

  return Array.from(latestByBundleId.entries()).map(([bundleId, { report, result }]) => {
    const recordedCampaignMetadata = normalizeCampaignMetadata({
      campaignIds: [...result.campaign_ids, result.primary_campaign_id],
      campaignObjectives: [
        ...result.campaign_objectives,
        result.primary_campaign_objective,
      ],
      source: "recorded",
    });

    const taskBackfillEntries = result.task_ids
      .map((taskId) => args.taskEntriesByTaskId.get(taskId))
      .filter((entry): entry is ResearchPromotionBoardEntry => Boolean(entry));

    const taskBackfillMetadata = normalizeCampaignMetadata({
      campaignIds: taskBackfillEntries.flatMap((entry) => entry.campaign_ids),
      campaignObjectives: taskBackfillEntries.flatMap((entry) => entry.campaign_objectives),
      source: taskBackfillEntries.some((entry) => entry.campaign_metadata_source === "task")
        ? "task"
        : taskBackfillEntries.some((entry) => entry.campaign_metadata_source === "library_backfill")
          ? "library_backfill"
          : "missing",
    });

    const campaignMetadata =
      recordedCampaignMetadata.campaignMetadataSource !== "missing"
        ? recordedCampaignMetadata
        : taskBackfillMetadata;
    const rankingMetadata =
      result.decision.ranking
        ? {
            score: result.decision.ranking.score,
            band: result.decision.ranking.band,
            rankingMetadataSource: "recorded" as const,
          }
        : resolveRankingMetadata({
            ledgerEntry: null,
            aggregateSummary: result.comparison.aggregate.current,
            crisisSummary: result.comparison.crisis.current,
            walkforwardSummary: result.comparison.walkForward.current,
          });

    return {
      entry_id: `bundle-${bundleId}`,
      source: "bundle",
      baseline_id: result.baseline_id,
      task_ids: [...result.task_ids],
      campaign_ids: campaignMetadata.campaignIds,
      campaign_objectives: campaignMetadata.campaignObjectives,
      primary_campaign_id: campaignMetadata.primaryCampaignId,
      primary_campaign_objective: campaignMetadata.primaryCampaignObjective,
      campaign_metadata_source: campaignMetadata.campaignMetadataSource,
      campaign_mode: campaignMetadata.campaignMode,
      run_id: null,
      decision: result.decision.decision,
      board_status: result.decision.decision === "promote" ? "bundle_confirmed" : "watchlist",
      summary: result.decision.reason,
      score: rankingMetadata.score,
      band: rankingMetadata.band,
      ranking_metadata_source: rankingMetadata.rankingMetadataSource,
      portfolio_stress_passed: result.portfolio_stress?.passes ?? null,
      portfolio_stress_overlap_ratio: result.portfolio_stress?.current.overlap_ratio ?? null,
      portfolio_stress_max_concurrent: result.portfolio_stress?.current.max_concurrent_trades ?? null,
      aggregate_summary: result.comparison.aggregate.current,
      crisis_summary: result.comparison.crisis.current,
      walkforward_summary: result.comparison.walkForward.current,
      generated_at: report.generated_at,
    };
  });
}

function buildCampaignPerformance(args: {
  entries: ResearchPromotionBoardEntry[];
  latestTaskLedgerEntries: ResearchDecisionLedgerEntry[];
  queueTasksById: Map<string, ResearchTask>;
  candidateLookup: CandidateCampaignLookup;
  campaignMap: Map<string, ResearchCampaignDefinition>;
}): ResearchCampaignPerformanceEntry[] {
  const byCampaign = new Map<string, ResearchCampaignPerformanceEntry>();

  const ensureEntry = (campaignId: string, objective: ResearchCampaignObjective) => {
    const current = byCampaign.get(campaignId) ?? {
      campaign_id: campaignId,
      objective,
      task_promotes: 0,
      task_candidates: 0,
      task_rejects_or_failed: 0,
      bundle_promotes: 0,
      bundle_candidates: 0,
      bundle_confirmed_count: 0,
      review_ready_count: 0,
      watchlist_count: 0,
      top_score: null,
      last_activity_at: null,
    };
    byCampaign.set(campaignId, current);
    return current;
  };

  for (const ledgerEntry of args.latestTaskLedgerEntries) {
    const task = args.queueTasksById.get(ledgerEntry.task_id) ?? null;
    const campaignMetadata = resolveCampaignMetadata({
      ledgerEntry,
      task,
      candidateLookup: args.candidateLookup,
      campaignMap: args.campaignMap,
    });
    if (!campaignMetadata.primaryCampaignId || !campaignMetadata.primaryCampaignObjective) {
      continue;
    }

    const current = ensureEntry(
      campaignMetadata.primaryCampaignId,
      campaignMetadata.primaryCampaignObjective,
    );

    if (ledgerEntry.decision === "promote") {
      current.task_promotes += 1;
      current.review_ready_count += 1;
    } else if (ledgerEntry.decision === "candidate") {
      current.task_candidates += 1;
      current.watchlist_count += 1;
    } else if (ledgerEntry.decision === "reject" || ledgerEntry.decision === "failed") {
      current.task_rejects_or_failed += 1;
    }

    const rankingMetadata = resolveRankingMetadata({
      ledgerEntry,
      aggregateSummary: ledgerEntry.aggregate_summary ?? null,
      crisisSummary: ledgerEntry.crisis_summary ?? null,
      walkforwardSummary: ledgerEntry.walkforward_summary ?? null,
    });
    if (typeof rankingMetadata.score === "number") {
      current.top_score =
        current.top_score === null
          ? rankingMetadata.score
          : Math.max(current.top_score, rankingMetadata.score);
    }

    current.last_activity_at =
      !current.last_activity_at || current.last_activity_at.localeCompare(ledgerEntry.timestamp) < 0
        ? ledgerEntry.timestamp
        : current.last_activity_at;
  }

  for (const entry of args.entries) {
    if (!entry.primary_campaign_id || !entry.primary_campaign_objective) {
      continue;
    }

    const current = ensureEntry(entry.primary_campaign_id, entry.primary_campaign_objective);
    if (entry.source === "bundle") {
      if (entry.decision === "promote") {
        current.bundle_promotes += 1;
      } else if (entry.decision === "candidate") {
        current.bundle_candidates += 1;
      }
      if (entry.board_status === "bundle_confirmed") {
        current.bundle_confirmed_count += 1;
      } else if (entry.board_status === "watchlist") {
        current.watchlist_count += 1;
      } else if (entry.board_status === "review_ready") {
        current.review_ready_count += 1;
      }
    }

    if (typeof entry.score === "number") {
      current.top_score =
        current.top_score === null ? entry.score : Math.max(current.top_score, entry.score);
    }

    current.last_activity_at =
      !current.last_activity_at || current.last_activity_at.localeCompare(entry.generated_at) < 0
        ? entry.generated_at
        : current.last_activity_at;
  }

  return [...byCampaign.values()].sort((left, right) => {
    return (
      right.bundle_confirmed_count - left.bundle_confirmed_count ||
      right.task_promotes - left.task_promotes ||
      (right.top_score ?? Number.NEGATIVE_INFINITY) -
        (left.top_score ?? Number.NEGATIVE_INFINITY) ||
      left.campaign_id.localeCompare(right.campaign_id)
    );
  });
}

export async function buildResearchPromotionBoard(
  config: ResearchConfig,
): Promise<ResearchPromotionBoardReport> {
  const now = new Date().toISOString();
  const queue = await readResearchQueue(config);
  const [ledgerEntries, bundleReports, campaignLibrary, candidateLibraries] = await Promise.all([
    readDecisionLedgerEntries(config),
    readBundleReports(config),
    readResearchCampaignLibrary(config),
    readCandidateLibraries(config),
  ]);

  const queueTasksById = new Map(queue.tasks.map((task) => [task.id, task] as const));
  const currentQueueTasks = buildCurrentResearchTaskView(queue.tasks);
  const campaignMap = buildResearchCampaignMap(campaignLibrary);
  const candidateLookup = buildCandidateCampaignLookup({
    libraries: candidateLibraries,
    campaignMap,
  });
  const latestTaskLedgerEntries = buildLatestTaskLedgerEntries({
    ledgerEntries,
    liveBaselineId: queue.live_baseline_id,
    queueTasksById,
  });

  const taskEntries = buildTaskEntries({
    latestTaskLedgerEntries,
    queueTasksById,
    candidateLookup,
    campaignMap,
  });
  const taskEntriesByTaskId = new Map(
    taskEntries.map((entry) => [entry.task_ids[0] ?? entry.entry_id, entry] as const),
  );
  const currentBundleIds = new Set(
    buildResearchPromotionBundleCandidates(currentQueueTasks).map((candidate) => candidate.id),
  );
  const bundleEntries = buildBundleEntries({
    bundleReports,
    liveBaselineId: queue.live_baseline_id,
    currentBundleIds,
    taskEntriesByTaskId,
  });

  const entries = [...taskEntries, ...bundleEntries].sort(sortBoardEntries);
  const campaignPerformance = buildCampaignPerformance({
    entries,
    latestTaskLedgerEntries,
    queueTasksById,
    candidateLookup,
    campaignMap,
  });

  return {
    report_id: `promotion-board-${now}`,
    generated_at: now,
    live_baseline_id: queue.live_baseline_id,
    summary: {
      task_promotes: taskEntries.filter((entry) => entry.decision === "promote").length,
      task_candidates: taskEntries.filter((entry) => entry.decision === "candidate").length,
      bundle_promotes: bundleEntries.filter((entry) => entry.decision === "promote").length,
      bundle_candidates: bundleEntries.filter((entry) => entry.decision === "candidate").length,
      review_ready_count: entries.filter((entry) => entry.board_status === "review_ready").length,
      watchlist_count: entries.filter((entry) => entry.board_status === "watchlist").length,
      bundle_confirmed_count: entries.filter((entry) => entry.board_status === "bundle_confirmed").length,
    },
    campaign_performance: campaignPerformance,
    entries,
    top_review_ready: entries
      .filter((entry) => entry.board_status !== "watchlist")
      .slice(0, 10)
      .map((entry) => ({
        entry_id: entry.entry_id,
        source: entry.source,
        primary_campaign_id: entry.primary_campaign_id,
        primary_campaign_objective: entry.primary_campaign_objective,
        score: entry.score,
        band: entry.band,
        board_status: entry.board_status,
        portfolio_stress_passed: entry.portfolio_stress_passed ?? null,
      })),
  };
}

export async function writeResearchPromotionBoard(args: {
  config: ResearchConfig;
  report: ResearchPromotionBoardReport;
}): Promise<{
  jsonPath: string;
  markdownPath: string;
  latestJsonPath: string;
  latestMarkdownPath: string;
}> {
  const boardDir = path.join(args.config.paths.reportsDir, "boards");
  await ensureDirectory(boardDir);

  const safeId = sanitizeFileSegment(args.report.report_id);
  const jsonPath = path.join(boardDir, `${safeId}.json`);
  const markdownPath = path.join(boardDir, `${safeId}.md`);
  const latestJsonPath = path.join(boardDir, "promotion-board-latest.json");
  const latestMarkdownPath = path.join(boardDir, "promotion-board-latest.md");

  await writeJsonAtomic(jsonPath, args.report);
  await writeJsonAtomic(latestJsonPath, args.report);

  const markdown = [
    `# Research Promotion Board`,
    ``,
    `- Generated at: ${args.report.generated_at}`,
    `- Live baseline: ${args.report.live_baseline_id ?? "n/a"}`,
    `- Task promotes: ${args.report.summary.task_promotes}`,
    `- Task candidates: ${args.report.summary.task_candidates}`,
    `- Bundle promotes: ${args.report.summary.bundle_promotes}`,
    `- Bundle candidates: ${args.report.summary.bundle_candidates}`,
    `- Review ready: ${args.report.summary.review_ready_count}`,
    `- Bundle confirmed: ${args.report.summary.bundle_confirmed_count}`,
    `- Watchlist: ${args.report.summary.watchlist_count}`,
    ``,
    `## Campaign Performance`,
    ...(args.report.campaign_performance.length > 0
      ? args.report.campaign_performance.map(
          (entry) =>
            `- ${entry.campaign_id} [${entry.objective}]: task_promotes ${entry.task_promotes}, task_candidates ${entry.task_candidates}, bundle_confirmed ${entry.bundle_confirmed_count}, top_score ${entry.top_score ?? "n/a"}`,
        )
      : ["- none"]),
    ``,
    `## Top Review Ready`,
    ...(args.report.top_review_ready.length > 0
      ? args.report.top_review_ready.map(
          (entry) =>
            `- ${entry.entry_id}: ${entry.board_status} (${entry.score ?? "n/a"} / ${entry.band ?? "n/a"})` +
            `${entry.primary_campaign_id ? ` [${entry.primary_campaign_id}/${entry.primary_campaign_objective ?? "n/a"}]` : ""}` +
            ` [portfolio_stress=${entry.portfolio_stress_passed ?? "n/a"}]`,
        )
      : ["- none"]),
    ``,
    `## Entries`,
    ...(args.report.entries.length > 0
      ? args.report.entries.map(
          (entry) =>
            `- ${entry.entry_id}: ${entry.board_status} / ${entry.decision}` +
            ` [${entry.score ?? "n/a"} ${entry.band ?? "n/a"}]` +
            `${entry.primary_campaign_id ? ` [${entry.primary_campaign_id}/${entry.primary_campaign_objective ?? "n/a"}]` : ""}` +
            ` [campaign_source=${entry.campaign_metadata_source}]` +
            ` [ranking_source=${entry.ranking_metadata_source}]` +
            `${entry.portfolio_stress_passed !== undefined ? ` [portfolio_stress=${entry.portfolio_stress_passed ?? "n/a"}]` : ""}` +
            ` (${entry.summary})`,
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
  };
}
