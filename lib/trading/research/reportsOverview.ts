import path from "node:path";

import { readJsonIfExists } from "./fs";
import type {
  ResearchBundleValidationReport,
  ResearchConfig,
  ResearchDatasetHealthReport,
  ResearchOpportunityReviewReport,
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
