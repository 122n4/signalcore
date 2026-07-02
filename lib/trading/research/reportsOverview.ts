import path from "node:path";

import { readJsonIfExists } from "./fs";
import { buildResearchPaperPromotionSnapshot } from "./paperPromotion";
import type {
  ResearchBundleValidationReport,
  ResearchConfig,
  ResearchDatasetHealthReport,
  ResearchOpportunityReviewReport,
  ResearchPaperPromotionSnapshot,
  ResearchPromotionBoardReport,
  ResearchPromotionPackageReport,
  ResearchRegistryReport,
} from "./types";

export type ResearchLatestReportSummary = {
  report_id: string;
  schema_version: string;
  generated_at: string;
  live_baseline_id: string | null;
  dataset_ref_count: number;
  upstream_report_count: number;
};

export type ResearchLatestReportsOverview = {
  bundleValidation: ResearchLatestReportSummary | null;
  promotionBoard: ResearchLatestReportSummary | null;
  promotionPackages: ResearchLatestReportSummary | null;
  opportunityReview: ResearchLatestReportSummary | null;
  datasetHealth: ResearchLatestReportSummary | null;
  registry: ResearchLatestReportSummary | null;
};

export type ResearchPromotionReadinessOverview = {
  board: {
    reviewReadyCount: number;
    watchlistCount: number;
    bundleConfirmedCount: number;
    taskPromotes: number;
    taskCandidates: number;
  } | null;
  packages: {
    packageCount: number;
    readyForLiveReviewCount: number;
    blockedCount: number;
    bundleConfirmedCount: number;
    topBlockers: string[];
  } | null;
  opportunity: {
    reviewedItemCount: number;
    packageReadyForLiveReviewCount: number;
    isolatedPromoteCount: number;
    isolatedCandidateCount: number;
    isolatedRejectCount: number;
    bundleStatus: ResearchOpportunityReviewReport["summary"]["bundle_status"];
  } | null;
  paperGate: {
    readyPackageCount: number;
    executableTaskScopeCount: number;
    bundleOnlyReadyPackageCount: number;
    status: "ready" | "blocked" | "bundle_only" | "idle";
  } | null;
};

export function emptyResearchPromotionReadinessOverview(): ResearchPromotionReadinessOverview {
  return {
    board: null,
    packages: null,
    opportunity: null,
    paperGate: null,
  };
}

function summarizePromotionReadiness(args: {
  board: ResearchPromotionBoardReport | null;
  packages: ResearchPromotionPackageReport | null;
  opportunity: ResearchOpportunityReviewReport | null;
  paperPromotion: ResearchPaperPromotionSnapshot | null;
}): ResearchPromotionReadinessOverview {
  const topBlockers = Array.from(
    new Set(
      (args.packages?.packages ?? [])
        .filter((pkg) => !pkg.review.ready_for_live_review)
        .flatMap((pkg) => pkg.review.blockers),
    ),
  ).slice(0, 6);

  const paperGateStatus =
    !args.paperPromotion
      ? null
      : args.paperPromotion.executable_task_scope_count > 0
        ? "ready"
        : args.paperPromotion.ready_package_count > 0 &&
            args.paperPromotion.bundle_only_ready_package_count > 0
          ? "bundle_only"
          : (args.packages?.summary.review_ready_count ?? 0) > 0 ||
              (args.packages?.summary.blocked_count ?? 0) > 0
            ? "blocked"
            : "idle";

  return {
    board: args.board
      ? {
          reviewReadyCount: args.board.summary.review_ready_count,
          watchlistCount: args.board.summary.watchlist_count,
          bundleConfirmedCount: args.board.summary.bundle_confirmed_count,
          taskPromotes: args.board.summary.task_promotes,
          taskCandidates: args.board.summary.task_candidates,
        }
      : null,
    packages: args.packages
      ? {
          packageCount: args.packages.summary.package_count,
          readyForLiveReviewCount: args.packages.summary.ready_for_live_review_count,
          blockedCount: args.packages.summary.blocked_count,
          bundleConfirmedCount: args.packages.summary.bundle_confirmed_count,
          topBlockers,
        }
      : null,
    opportunity: args.opportunity
      ? {
          reviewedItemCount: args.opportunity.summary.reviewed_item_count,
          packageReadyForLiveReviewCount: args.opportunity.summary.package_ready_for_live_review_count,
          isolatedPromoteCount: args.opportunity.summary.isolated_promote_count,
          isolatedCandidateCount: args.opportunity.summary.isolated_candidate_count,
          isolatedRejectCount: args.opportunity.summary.isolated_reject_count,
          bundleStatus: args.opportunity.summary.bundle_status,
        }
      : null,
    paperGate: args.paperPromotion
      ? {
          readyPackageCount: args.paperPromotion.ready_package_count,
          executableTaskScopeCount: args.paperPromotion.executable_task_scope_count,
          bundleOnlyReadyPackageCount: args.paperPromotion.bundle_only_ready_package_count,
          status: paperGateStatus ?? "idle",
        }
      : null,
  };
}

function summarizeLatestReport(
  report:
    | ResearchBundleValidationReport
    | ResearchPromotionBoardReport
    | ResearchPromotionPackageReport
    | ResearchOpportunityReviewReport
    | ResearchDatasetHealthReport
    | ResearchRegistryReport
    | null,
): ResearchLatestReportSummary | null {
  if (!report) {
    return null;
  }

  const provenance =
    report && typeof report === "object" && "provenance" in report && report.provenance
      ? report.provenance
      : null;
  const datasetRefs = Array.isArray(provenance?.dataset_refs) ? provenance.dataset_refs : [];
  const upstreamReportIds = Array.isArray(provenance?.upstream_report_ids) ? provenance.upstream_report_ids : [];

  const liveBaselineId =
    "live_baseline_id" in report
      ? report.live_baseline_id
      : "baseline_id" in report
        ? report.baseline_id
        : provenance?.live_baseline_id ?? null;

  return {
    report_id: report.report_id,
    schema_version: report.schema_version,
    generated_at: report.generated_at,
    live_baseline_id: liveBaselineId ?? null,
    dataset_ref_count: datasetRefs.length,
    upstream_report_count: upstreamReportIds.length,
  };
}

export async function buildResearchLatestReportsOverview(
  config: ResearchConfig,
): Promise<ResearchLatestReportsOverview> {
  const [
    bundleValidation,
    promotionBoard,
    promotionPackages,
    opportunityReview,
    datasetHealth,
    registry,
  ] = await Promise.all([
    readJsonIfExists<ResearchBundleValidationReport>(
      path.join(config.paths.reportsDir, "bundles", "bundle-validation-latest.json"),
    ),
    readJsonIfExists<ResearchPromotionBoardReport>(
      path.join(config.paths.reportsDir, "boards", "promotion-board-latest.json"),
    ),
    readJsonIfExists<ResearchPromotionPackageReport>(
      path.join(config.paths.reportsDir, "packages", "promotion-packages-latest.json"),
    ),
    readJsonIfExists<ResearchOpportunityReviewReport>(
      path.join(config.paths.reportsDir, "reviews", "opportunity-review-latest.json"),
    ),
    readJsonIfExists<ResearchDatasetHealthReport>(
      path.join(config.paths.reportsDir, "datasets", "dataset-health-latest.json"),
    ),
    readJsonIfExists<ResearchRegistryReport>(
      path.join(config.paths.reportsDir, "registry", "registry-latest.json"),
    ),
  ]);

  return {
    bundleValidation: summarizeLatestReport(bundleValidation),
    promotionBoard: summarizeLatestReport(promotionBoard),
    promotionPackages: summarizeLatestReport(promotionPackages),
    opportunityReview: summarizeLatestReport(opportunityReview),
    datasetHealth: summarizeLatestReport(datasetHealth),
    registry: summarizeLatestReport(registry),
  };
}

export async function buildResearchPromotionReadinessOverview(args: {
  config: ResearchConfig;
  paperPromotion?: ResearchPaperPromotionSnapshot | null;
}): Promise<ResearchPromotionReadinessOverview> {
  const [board, packages, opportunity, paperPromotion] = await Promise.all([
    readJsonIfExists<ResearchPromotionBoardReport>(
      path.join(args.config.paths.reportsDir, "boards", "promotion-board-latest.json"),
    ),
    readJsonIfExists<ResearchPromotionPackageReport>(
      path.join(args.config.paths.reportsDir, "packages", "promotion-packages-latest.json"),
    ),
    readJsonIfExists<ResearchOpportunityReviewReport>(
      path.join(args.config.paths.reportsDir, "reviews", "opportunity-review-latest.json"),
    ),
    args.paperPromotion !== undefined
      ? Promise.resolve(args.paperPromotion)
      : buildResearchPaperPromotionSnapshot(args.config),
  ]);

  return summarizePromotionReadiness({
    board,
    packages,
    opportunity,
    paperPromotion,
  });
}
