import path from "node:path";

import { loadResearchConfig } from "./config";
import { readJsonIfExists } from "./fs";
import { readResearchQueue } from "./queue";
import type {
  ResearchConfig,
  ResearchPaperPromotionApproval,
  ResearchPaperPromotionCandidateSummary,
  ResearchPaperPromotionScope,
  ResearchPaperPromotionSnapshot,
  ResearchPromotionPackageReport,
  ResearchQueue,
} from "./types";
import type { ComposeTradingLiveDecisionInput } from "@/lib/trading/state";

function normalizeString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeList(values: string[] | undefined): string[] {
  return Array.from(
    new Set((values ?? []).map((value) => normalizeString(value)).filter((value): value is string => Boolean(value))),
  ).sort();
}

function buildCandidateSummary(
  candidate: ComposeTradingLiveDecisionInput,
): ResearchPaperPromotionCandidateSummary {
  return {
    instrument: normalizeString(candidate.snapshot.instrument)?.toUpperCase() ?? null,
    session: normalizeString(candidate.market.session.session),
    setup_type: normalizeString(candidate.setupCore.setup.type),
    risk_mode: normalizeString(candidate.executionPlan.riskFraming.riskMode),
    execution_status: normalizeString(candidate.executionPlan.executionStatus.executionStatus),
    quality_grade: normalizeString(candidate.setupCore.quality.grade),
    clarity_level: normalizeString(candidate.decisionCore.clarity.level),
    environment_state: normalizeString(candidate.decisionCore.environment.state),
  };
}

function matchesScopeValue(current: string | null, allowed: string[]): boolean {
  if (allowed.length === 0) return true;
  if (!current) return false;
  return allowed.includes(current);
}

function matchesScope(
  candidate: ResearchPaperPromotionCandidateSummary,
  scope: ResearchPaperPromotionScope,
): boolean {
  return (
    matchesScopeValue(candidate.instrument, scope.instrument ? [scope.instrument] : []) &&
    matchesScopeValue(candidate.session, scope.sessions) &&
    matchesScopeValue(candidate.setup_type, scope.setup_types) &&
    matchesScopeValue(candidate.risk_mode, scope.risk_modes) &&
    matchesScopeValue(candidate.execution_status, scope.execution_statuses) &&
    matchesScopeValue(candidate.quality_grade, scope.quality_grades) &&
    matchesScopeValue(candidate.clarity_level, scope.clarity_levels) &&
    matchesScopeValue(candidate.environment_state, scope.environment_states)
  );
}

function buildSnapshotFromPackageReport(args: {
  report: ResearchPromotionPackageReport;
  queue: ResearchQueue;
}): ResearchPaperPromotionSnapshot {
  const tasksById = new Map(args.queue.tasks.map((task) => [task.id, task] as const));
  const readyPackages = args.report.packages.filter((pkg) => pkg.review.ready_for_live_review);
  const scopes: ResearchPaperPromotionScope[] = [];
  let bundleOnlyReadyPackageCount = 0;

  for (const pkg of readyPackages) {
    if (pkg.source !== "task") {
      bundleOnlyReadyPackageCount += 1;
      continue;
    }

    for (const taskId of pkg.task_ids) {
      const task = tasksById.get(taskId);
      if (!task) continue;

      const instruments = normalizeList(task.candidate_scope.instruments);
      const sessions = normalizeList(task.candidate_scope.sessions);
      const setupTypes = normalizeList(task.candidate_scope.setup_types);
      const riskModes = normalizeList(task.candidate_scope.risk_modes);
      const executionStatuses = normalizeList(task.candidate_scope.execution_statuses);
      const qualityGrades = normalizeList(task.candidate_scope.quality_grades);
      const clarityLevels = normalizeList(task.candidate_scope.clarity_levels);
      const environmentStates = normalizeList(task.candidate_scope.environment_states);

      scopes.push({
        package_id: pkg.package_id,
        entry_id: pkg.entry_id,
        task_id: taskId,
        source: pkg.source,
        baseline_id: pkg.baseline_id,
        instrument: instruments[0] ?? null,
        sessions,
        setup_types: setupTypes,
        risk_modes: riskModes,
        execution_statuses: executionStatuses,
        quality_grades: qualityGrades,
        clarity_levels: clarityLevels,
        environment_states: environmentStates,
        package_ready_for_live_review: true,
      });
    }
  }

  return {
    generated_at: args.report.generated_at,
    live_baseline_id: args.report.live_baseline_id,
    ready_package_count: readyPackages.length,
    executable_task_scope_count: scopes.length,
    bundle_only_ready_package_count: bundleOnlyReadyPackageCount,
    scopes,
  };
}

export async function buildResearchPaperPromotionSnapshot(
  config?: ResearchConfig,
): Promise<ResearchPaperPromotionSnapshot | null> {
  const resolvedConfig = config ?? (await loadResearchConfig());
  const latestPackagePath = path.join(
    resolvedConfig.paths.reportsDir,
    "packages",
    "promotion-packages-latest.json",
  );
  const [queue, report] = await Promise.all([
    readResearchQueue(resolvedConfig, { createIfMissing: false }),
    readJsonIfExists<ResearchPromotionPackageReport>(latestPackagePath),
  ]);
  if (!report) return null;
  return buildSnapshotFromPackageReport({ queue, report });
}

function approvalFromSnapshot(args: {
  source: ResearchPaperPromotionApproval["source"];
  snapshot: ResearchPaperPromotionSnapshot | null;
  candidate: ComposeTradingLiveDecisionInput;
}): ResearchPaperPromotionApproval {
  const candidateSummary = buildCandidateSummary(args.candidate);
  const snapshot = args.snapshot;

  if (!snapshot) {
    return {
      approved: false,
      source: args.source,
      reason: "Research promotion snapshot is unavailable.",
      snapshot: null,
      matched_scope: null,
      candidate_summary: candidateSummary,
    };
  }

  const matchingScopes = snapshot.scopes.filter((scope) => matchesScope(candidateSummary, scope));
  const matchedScope = matchingScopes[0] ?? null;
  if (matchingScopes.length === 1 && matchedScope) {
    return {
      approved: true,
      source: args.source,
      reason: `Research promotion scope matched package '${matchedScope.package_id}'.`,
      snapshot,
      matched_scope: matchedScope,
      candidate_summary: candidateSummary,
    };
  }

  if (matchingScopes.length > 1) {
    return {
      approved: false,
      source: args.source,
      reason:
        "Multiple ready-for-live-review Research promotion scopes match this paper candidate. Canonical Promote -> Paper handoff is ambiguous.",
      snapshot,
      matched_scope: null,
      candidate_summary: candidateSummary,
    };
  }

  if (snapshot.ready_package_count === 0) {
    return {
      approved: false,
      source: args.source,
      reason: "No Research promotion package is ready for paper execution yet.",
      snapshot,
      matched_scope: null,
      candidate_summary: candidateSummary,
    };
  }

  if (snapshot.executable_task_scope_count === 0 && snapshot.bundle_only_ready_package_count > 0) {
    return {
      approved: false,
      source: args.source,
      reason:
        "Research has bundle-level live-review packages, but the current paper path cannot execute bundle promotions canonically.",
      snapshot,
      matched_scope: null,
      candidate_summary: candidateSummary,
    };
  }

  return {
    approved: false,
    source: args.source,
    reason: "No ready-for-live-review Research promotion scope matches this paper candidate.",
    snapshot,
    matched_scope: null,
    candidate_summary: candidateSummary,
  };
}

export async function resolveResearchPaperPromotionApproval(args: {
  candidate: ComposeTradingLiveDecisionInput;
  config?: ResearchConfig;
}): Promise<ResearchPaperPromotionApproval> {
  const localSnapshot = await buildResearchPaperPromotionSnapshot(args.config);
  return approvalFromSnapshot({
    source: localSnapshot ? "local_artifact" : "missing",
    snapshot: localSnapshot,
    candidate: args.candidate,
  });
}

export function evaluateResearchPaperPromotionApproval(args: {
  candidate: ComposeTradingLiveDecisionInput;
  snapshot: ResearchPaperPromotionSnapshot | null;
  source: ResearchPaperPromotionApproval["source"];
}): ResearchPaperPromotionApproval {
  return approvalFromSnapshot(args);
}
