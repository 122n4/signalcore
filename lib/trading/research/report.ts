import path from "node:path";

import { readFile, writeFile } from "node:fs/promises";

import { buildResearchDatasetHealthSummary } from "./datasetHealth";
import { buildResearchPlannerFuelStatus } from "./planner";
import { readResearchQueue } from "./queue";
import type {
  ResearchConfig,
  ResearchCycleReport,
  ResearchDailyReport,
  ResearchDecisionLedgerEntry,
  ResearchFailureCategory,
  ResearchQueue,
  ResearchQueueSnapshot,
  ResearchTaskType,
  ResearchWindowReport,
} from "./types";
import { ensureDirectory, sanitizeFileSegment, writeJsonAtomic } from "./fs";

function buildQueueSnapshot(queue: ResearchQueue): ResearchQueueSnapshot {
  return {
    pending: queue.tasks.filter((task) => task.status === "pending").length,
    running: queue.tasks.filter((task) => task.status === "running").length,
    blocked: queue.tasks.filter((task) => task.status === "blocked").length,
    failed: queue.tasks.filter((task) => task.status === "failed").length,
  };
}

function buildNextPlannedTaskId(queue: ResearchQueue): string | null {
  return (
    queue.tasks
      .filter((task) => task.status === "pending")
      .sort((left, right) => right.priority - left.priority)[0]?.id ?? null
  );
}

async function buildFuelStatus(config: ResearchConfig) {
  return buildResearchPlannerFuelStatus({
    config,
    supportedTypes: new Set<ResearchTaskType>(["risk_shaping", "context_filter"]),
  });
}

function buildTopPromotions(entries: ResearchDecisionLedgerEntry[]) {
  return entries
    .filter(
      (entry): entry is ResearchDecisionLedgerEntry & { ranking_score: number; ranking_band: NonNullable<ResearchDecisionLedgerEntry["ranking_band"]> } =>
        entry.decision === "promote" &&
        typeof entry.ranking_score === "number" &&
        Boolean(entry.ranking_band),
    )
    .sort((left, right) => right.ranking_score - left.ranking_score)
    .slice(0, 5)
    .map((entry) => ({
      task_id: entry.task_id,
      run_id: entry.run_id,
      score: entry.ranking_score,
      band: entry.ranking_band,
    }));
}

function buildFailureForensicsSummary(
  entries: ResearchDecisionLedgerEntry[],
): Partial<Record<ResearchFailureCategory, number>> {
  const summary: Partial<Record<ResearchFailureCategory, number>> = {};

  for (const entry of entries) {
    const category = entry.failure_forensics?.category;
    if (!category) {
      continue;
    }
    summary[category] = (summary[category] ?? 0) + 1;
  }

  return summary;
}

function renderFuelStatusMarkdown(report: {
  fuel_status: ResearchDailyReport["fuel_status"];
}): string[] {
  return [
    `## Fuel`,
    `- Active campaigns: ${report.fuel_status.active_campaign_count}`,
    `- Active families: ${report.fuel_status.active_family_count}`,
    `- Active templates: ${report.fuel_status.active_template_count}`,
    `- Reserve templates: ${report.fuel_status.reserve_template_count}`,
    `- Campaign-qualified templates: ${report.fuel_status.campaign_qualified_template_count}`,
    `- Selectable templates: ${report.fuel_status.selectable_template_count}`,
    `- Selectable campaigns: ${report.fuel_status.selectable_campaign_count}`,
    `- Blocked by campaign: ${report.fuel_status.blocked_by_campaign_count}`,
    `- Blocked by data quality: ${report.fuel_status.blocked_by_data_quality_count}`,
    `- Blocked by dedupe: ${report.fuel_status.blocked_by_dedupe_count}`,
    `- Blocked by quota: ${report.fuel_status.blocked_by_quota_count}`,
    `- Campaign quota constrained: ${report.fuel_status.campaign_quota.constrained ? "yes" : "no"}`,
    `- Quota constrained: ${report.fuel_status.quota.constrained ? "yes" : "no"}`,
  ];
}

function renderCampaignStatusMarkdown(report: {
  fuel_status: ResearchDailyReport["fuel_status"];
}): string[] {
  return [
    `## Campaigns`,
    ...(report.fuel_status.campaigns.length > 0
      ? report.fuel_status.campaigns.slice(0, 6).map(
          (campaign) =>
            `- ${campaign.campaign_id} [${campaign.objective}]: selectable ${campaign.selectable_templates}, recent ${campaign.recent_selection_count}, rejects ${campaign.rejected_or_failed_count}, completed ${campaign.completed_count}`,
        )
      : ["- none"]),
  ];
}

function renderDatasetHealthMarkdown(report: {
  dataset_health: ResearchDailyReport["dataset_health"];
}): string[] {
  return [
    `## Dataset Health`,
    `- Audit loaded: ${report.dataset_health.audit_loaded ? "yes" : "no"}`,
    `- Audit generated at: ${report.dataset_health.audit_generated_at ?? "n/a"}`,
    `- Eligible instruments: ${report.dataset_health.eligible_instrument_count}`,
    `- Suspended instruments: ${report.dataset_health.suspended_instrument_count}`,
    `- Missing instruments: ${report.dataset_health.missing_instrument_count}`,
    `- Suspended list: ${report.dataset_health.suspended_instruments.join(", ") || "none"}`,
  ];
}

function renderTopPromotionsMarkdown(report: {
  top_promotions: ResearchDailyReport["top_promotions"];
}): string[] {
  return [
    `## Top Promotions`,
    ...(report.top_promotions.length > 0
      ? report.top_promotions.map(
          (entry) => `- ${entry.task_id}: ${entry.score} (${entry.band})`,
        )
      : ["- none"]),
  ];
}

function renderFailureForensicsMarkdown(report: {
  failure_forensics_summary: ResearchDailyReport["failure_forensics_summary"];
}): string[] {
  const entries = Object.entries(report.failure_forensics_summary);
  return [
    `## Failure Forensics`,
    ...(entries.length > 0
      ? entries.map(([category, count]) => `- ${category}: ${count}`)
      : ["- none"]),
  ];
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

function filterLedgerEntriesWithinWindow(args: {
  entries: ResearchDecisionLedgerEntry[];
  from: Date;
  to: Date;
}): ResearchDecisionLedgerEntry[] {
  const fromMs = args.from.getTime();
  const toMs = args.to.getTime();

  return args.entries.filter((entry) => {
    const timestampMs = new Date(entry.timestamp).getTime();
    return timestampMs >= fromMs && timestampMs <= toMs;
  });
}

export async function buildDailyResearchReport(
  config: ResearchConfig,
  date = new Date(),
): Promise<ResearchDailyReport> {
  const dateStamp = date.toISOString().slice(0, 10);
  const queue = await readResearchQueue(config);
  const ledgerEntries = (await readDecisionLedgerEntries(config)).filter((entry) =>
    entry.timestamp.startsWith(dateStamp),
  );
  const fuelStatus = await buildFuelStatus(config);
  const datasetHealth = await buildResearchDatasetHealthSummary(config);

  const promoted = ledgerEntries.filter((entry) => entry.decision === "promote");
  const candidates = ledgerEntries.filter((entry) => entry.decision === "candidate");
  const rejected = ledgerEntries.filter(
    (entry) => entry.decision === "reject" || entry.decision === "failed",
  );

  const latestPromoted = promoted[promoted.length - 1] ?? null;
  const latestCandidate = candidates[candidates.length - 1] ?? null;

  return {
    report_id: `report-${dateStamp}`,
    generated_at: date.toISOString(),
    live_baseline_id: queue.live_baseline_id,
    runs_started: ledgerEntries.length,
    runs_completed:
      promoted.length + candidates.length + rejected.filter((entry) => entry.decision !== "failed").length,
    runs_failed: rejected.filter((entry) => entry.decision === "failed").length,
    promoted: promoted.map((entry) => ({
      task_id: entry.task_id,
      run_id: entry.run_id,
      summary: entry.reason,
    })),
    candidates: candidates.map((entry) => ({
      task_id: entry.task_id,
      run_id: entry.run_id,
      summary: entry.reason,
    })),
    rejected: rejected.map((entry) => ({
      task_id: entry.task_id,
      run_id: entry.run_id,
      reason: entry.reason,
    })),
    queue_snapshot: buildQueueSnapshot(queue),
    idle_reason: queue.idle_reason,
    live_state_after_promotions:
      latestPromoted?.aggregate_summary ?? latestCandidate?.aggregate_summary ?? null,
    crisis_state_after_promotions:
      latestPromoted?.crisis_summary ?? latestCandidate?.crisis_summary ?? null,
    next_planned_task_id: buildNextPlannedTaskId(queue),
    fuel_status: fuelStatus,
    dataset_health: datasetHealth,
    top_promotions: buildTopPromotions(ledgerEntries),
    failure_forensics_summary: buildFailureForensicsSummary(ledgerEntries),
  };
}

export async function buildResearchWindowReport(
  config: ResearchConfig,
  args: {
    date?: Date;
    intervalMs?: number;
  } = {},
): Promise<ResearchWindowReport> {
  const finishedAt = args.date ?? new Date();
  const intervalMs = args.intervalMs ?? config.automation.reportIntervalMs ?? 8 * 60 * 60 * 1000;
  const startedAt = new Date(finishedAt.getTime() - intervalMs);
  const queue = await readResearchQueue(config);
  const fuelStatus = await buildFuelStatus(config);
  const datasetHealth = await buildResearchDatasetHealthSummary(config);
  const ledgerEntries = filterLedgerEntriesWithinWindow({
    entries: await readDecisionLedgerEntries(config),
    from: startedAt,
    to: finishedAt,
  });

  const promoted = ledgerEntries.filter((entry) => entry.decision === "promote");
  const candidates = ledgerEntries.filter((entry) => entry.decision === "candidate");
  const rejected = ledgerEntries.filter(
    (entry) => entry.decision === "reject" || entry.decision === "failed",
  );

  const latestPromoted = promoted[promoted.length - 1] ?? null;
  const latestCandidate = candidates[candidates.length - 1] ?? null;

  return {
    report_id: `report-window-${sanitizeFileSegment(startedAt.toISOString())}`,
    generated_at: finishedAt.toISOString(),
    interval_hours: Math.round((intervalMs / (60 * 60 * 1000)) * 100) / 100,
    window_started_at: startedAt.toISOString(),
    window_finished_at: finishedAt.toISOString(),
    live_baseline_id: queue.live_baseline_id,
    runs_started: ledgerEntries.length,
    runs_completed:
      promoted.length + candidates.length + rejected.filter((entry) => entry.decision !== "failed").length,
    runs_failed: rejected.filter((entry) => entry.decision === "failed").length,
    promoted: promoted.map((entry) => ({
      task_id: entry.task_id,
      run_id: entry.run_id,
      summary: entry.reason,
    })),
    candidates: candidates.map((entry) => ({
      task_id: entry.task_id,
      run_id: entry.run_id,
      summary: entry.reason,
    })),
    rejected: rejected.map((entry) => ({
      task_id: entry.task_id,
      run_id: entry.run_id,
      reason: entry.reason,
    })),
    queue_snapshot: buildQueueSnapshot(queue),
    idle_reason: queue.idle_reason,
    live_state_after_promotions:
      latestPromoted?.aggregate_summary ?? latestCandidate?.aggregate_summary ?? null,
    crisis_state_after_promotions:
      latestPromoted?.crisis_summary ?? latestCandidate?.crisis_summary ?? null,
    next_planned_task_id: buildNextPlannedTaskId(queue),
    fuel_status: fuelStatus,
    dataset_health: datasetHealth,
    top_promotions: buildTopPromotions(ledgerEntries),
    failure_forensics_summary: buildFailureForensicsSummary(ledgerEntries),
  };
}

export async function buildResearchCycleReport(
  config: ResearchConfig,
  args: {
    processedRunIds: string[];
    autoEnqueuedTaskIds?: string[];
    startedAt: Date;
    finishedAt?: Date;
  },
): Promise<ResearchCycleReport> {
  const queue = await readResearchQueue(config);
  const fuelStatus = await buildFuelStatus(config);
  const datasetHealth = await buildResearchDatasetHealthSummary(config);
  const ledgerEntries = await readDecisionLedgerEntries(config);
  const processedRunIdSet = new Set(args.processedRunIds);
  const cycleEntries = ledgerEntries.filter((entry) => processedRunIdSet.has(entry.run_id));
  const finishedAt = args.finishedAt ?? new Date();

  return {
    cycle_id: `cycle-${sanitizeFileSegment(args.startedAt.toISOString())}`,
    generated_at: finishedAt.toISOString(),
    started_at: args.startedAt.toISOString(),
    finished_at: finishedAt.toISOString(),
    live_baseline_id: queue.live_baseline_id,
    processed_run_ids: [...args.processedRunIds],
    auto_enqueued_task_ids: [...(args.autoEnqueuedTaskIds ?? [])],
    runs: cycleEntries.map((entry) => ({
      task_id: entry.task_id,
      run_id: entry.run_id,
      decision: entry.decision,
      reason: entry.reason,
      planner_family_id: entry.planner_family_id ?? null,
      planner_template_id: entry.planner_template_id ?? null,
      planner_campaign_id: entry.planner_campaign_id ?? null,
      planner_campaign_objective: entry.planner_campaign_objective ?? null,
      ranking_score: entry.ranking_score ?? null,
      ranking_band: entry.ranking_band ?? null,
      failure_category: entry.failure_forensics?.category ?? null,
    })),
    queue_snapshot: buildQueueSnapshot(queue),
    idle_reason: queue.idle_reason,
    next_planned_task_id: buildNextPlannedTaskId(queue),
    fuel_status: fuelStatus,
    dataset_health: datasetHealth,
    top_promotions: buildTopPromotions(cycleEntries),
    failure_forensics_summary: buildFailureForensicsSummary(cycleEntries),
  };
}

export async function writeDailyResearchReport(
  config: ResearchConfig,
  report: ResearchDailyReport,
): Promise<{
  jsonPath: string;
  markdownPath: string;
}> {
  await ensureDirectory(path.join(config.paths.reportsDir, "daily"));
  const dateStamp = report.generated_at.slice(0, 10);
  const jsonPath = path.join(config.paths.reportsDir, "daily", `${dateStamp}.json`);
  const markdownPath = path.join(config.paths.reportsDir, "daily", `${dateStamp}.md`);

  await writeJsonAtomic(jsonPath, report);

  const markdown = [
    `# Research Report ${dateStamp}`,
    ``,
    `- Runs started: ${report.runs_started}`,
    `- Runs completed: ${report.runs_completed}`,
    `- Runs failed: ${report.runs_failed}`,
    `- Live baseline: ${report.live_baseline_id ?? "n/a"}`,
    ``,
    `- Idle reason: ${report.idle_reason ?? "n/a"}`,
    ``,
    ...renderFuelStatusMarkdown(report),
    ``,
    ...renderCampaignStatusMarkdown(report),
    ``,
    ...renderDatasetHealthMarkdown(report),
    ``,
    ...renderTopPromotionsMarkdown(report),
    ``,
    ...renderFailureForensicsMarkdown(report),
    ``,
    `## Promoted`,
    ...(report.promoted.length > 0
      ? report.promoted.map((entry) => `- ${entry.task_id}: ${entry.summary}`)
      : ["- none"]),
    ``,
    `## Candidates`,
    ...(report.candidates.length > 0
      ? report.candidates.map((entry) => `- ${entry.task_id}: ${entry.summary}`)
      : ["- none"]),
    ``,
    `## Rejected`,
    ...(report.rejected.length > 0
      ? report.rejected.map((entry) => `- ${entry.task_id}: ${entry.reason}`)
      : ["- none"]),
  ].join("\n");

  await writeFile(markdownPath, `${markdown}\n`, "utf8");

  return { jsonPath, markdownPath };
}

export async function writeResearchCycleReport(
  config: ResearchConfig,
  report: ResearchCycleReport,
): Promise<{
  jsonPath: string;
  markdownPath: string;
}> {
  const dateStamp = report.generated_at.slice(0, 10);
  const cycleDir = path.join(config.paths.reportsDir, "cycles", dateStamp);
  await ensureDirectory(cycleDir);

  const jsonPath = path.join(cycleDir, `${report.cycle_id}.json`);
  const markdownPath = path.join(cycleDir, `${report.cycle_id}.md`);

  await writeJsonAtomic(jsonPath, report);

  const markdown = [
    `# Research Cycle ${report.cycle_id}`,
    ``,
    `- Started: ${report.started_at}`,
    `- Finished: ${report.finished_at}`,
    `- Live baseline: ${report.live_baseline_id ?? "n/a"}`,
    `- Processed runs: ${report.processed_run_ids.length}`,
    `- Auto-enqueued tasks: ${report.auto_enqueued_task_ids.length}`,
    `- Idle reason: ${report.idle_reason ?? "n/a"}`,
    `- Next planned task: ${report.next_planned_task_id ?? "n/a"}`,
    ``,
    ...renderFuelStatusMarkdown(report),
    ``,
    ...renderCampaignStatusMarkdown(report),
    ``,
    ...renderDatasetHealthMarkdown(report),
    ``,
    ...renderTopPromotionsMarkdown(report),
    ``,
    ...renderFailureForensicsMarkdown(report),
    ``,
    `## Runs`,
    ...(report.runs.length > 0
      ? report.runs.map(
          (entry) =>
            `- ${entry.run_id} / ${entry.task_id}: ${entry.decision} (${entry.reason})` +
            `${entry.planner_campaign_id ? ` [campaign ${entry.planner_campaign_id}${entry.planner_campaign_objective ? `/${entry.planner_campaign_objective}` : ""}]` : ""}` +
            `${entry.ranking_score !== null ? ` [rank ${entry.ranking_score} ${entry.ranking_band}]` : ""}` +
            `${entry.failure_category ? ` [failure ${entry.failure_category}]` : ""}`,
        )
      : ["- none"]),
    ``,
    `## Auto-Enqueued`,
    ...(report.auto_enqueued_task_ids.length > 0
      ? report.auto_enqueued_task_ids.map((taskId) => `- ${taskId}`)
      : ["- none"]),
  ].join("\n");

  await writeFile(markdownPath, `${markdown}\n`, "utf8");

  return { jsonPath, markdownPath };
}

function buildWindowSlotId(date: Date, intervalMs: number): string {
  const slotStartMs = Math.floor(date.getTime() / intervalMs) * intervalMs;
  return sanitizeFileSegment(new Date(slotStartMs).toISOString());
}

export async function writeResearchWindowReport(
  config: ResearchConfig,
  report: ResearchWindowReport,
): Promise<{
  jsonPath: string;
  markdownPath: string;
}> {
  const intervalDir = path.join(
    config.paths.reportsDir,
    "windows",
    `${report.interval_hours.toString().replace(".", "_")}h`,
  );
  await ensureDirectory(intervalDir);

  const slotId = buildWindowSlotId(
    new Date(report.window_finished_at),
    (config.automation.reportIntervalMs ?? 8 * 60 * 60 * 1000),
  );
  const jsonPath = path.join(intervalDir, `${slotId}.json`);
  const markdownPath = path.join(intervalDir, `${slotId}.md`);

  await writeJsonAtomic(jsonPath, report);

  const markdown = [
    `# Research Window ${report.interval_hours}h`,
    ``,
    `- Window start: ${report.window_started_at}`,
    `- Window end: ${report.window_finished_at}`,
    `- Runs started: ${report.runs_started}`,
    `- Runs completed: ${report.runs_completed}`,
    `- Runs failed: ${report.runs_failed}`,
    `- Live baseline: ${report.live_baseline_id ?? "n/a"}`,
    `- Idle reason: ${report.idle_reason ?? "n/a"}`,
    `- Next planned task: ${report.next_planned_task_id ?? "n/a"}`,
    ``,
    ...renderFuelStatusMarkdown(report),
    ``,
    ...renderCampaignStatusMarkdown(report),
    ``,
    ...renderDatasetHealthMarkdown(report),
    ``,
    ...renderTopPromotionsMarkdown(report),
    ``,
    ...renderFailureForensicsMarkdown(report),
    ``,
    `## Promoted`,
    ...(report.promoted.length > 0
      ? report.promoted.map((entry) => `- ${entry.task_id}: ${entry.summary}`)
      : ["- none"]),
    ``,
    `## Candidates`,
    ...(report.candidates.length > 0
      ? report.candidates.map((entry) => `- ${entry.task_id}: ${entry.summary}`)
      : ["- none"]),
    ``,
    `## Rejected`,
    ...(report.rejected.length > 0
      ? report.rejected.map((entry) => `- ${entry.task_id}: ${entry.reason}`)
      : ["- none"]),
  ].join("\n");

  await writeFile(markdownPath, `${markdown}\n`, "utf8");

  return { jsonPath, markdownPath };
}
