export const RESEARCH_REPORT_SCHEMA_VERSIONS = {
  daily: "research.daily-report.v1",
  window: "research.window-report.v1",
  cycle: "research.cycle-report.v1",
  datasetHealth: "research.dataset-health-report.v1",
  bundleValidation: "research.bundle-validation-report.v1",
  promotionBoard: "research.promotion-board-report.v1",
  promotionPackages: "research.promotion-packages-report.v1",
  opportunityReview: "research.opportunity-review-report.v1",
  registry: "research.registry-report.v1",
} as const;

export type ResearchReportSchemaVersion =
  (typeof RESEARCH_REPORT_SCHEMA_VERSIONS)[keyof typeof RESEARCH_REPORT_SCHEMA_VERSIONS];

export function resolveResearchReportSchemaVersion<
  T extends keyof typeof RESEARCH_REPORT_SCHEMA_VERSIONS,
>(kind: T): (typeof RESEARCH_REPORT_SCHEMA_VERSIONS)[T] {
  return RESEARCH_REPORT_SCHEMA_VERSIONS[kind];
}
