export type TradingProductCoverageStatus =
  | "coverage_backed"
  | "staged_only"
  | "live_only";

export type TradingProductCoverageSource =
  | "dataset_health"
  | "staging_report"
  | "staging_catalog"
  | "scanner_default";

export type TradingProductMarketCoverage = {
  instrument: string;
  status: TradingProductCoverageStatus;
  label: string;
  detail: string;
  source: TradingProductCoverageSource;
};

export function coveragePriority(status: TradingProductCoverageStatus) {
  if (status === "coverage_backed") return 0;
  if (status === "staged_only") return 1;
  return 2;
}
