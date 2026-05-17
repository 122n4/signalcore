import type { PremiumAuditReport } from "@/lib/billing/premiumAuditService";
import type { MarketProviderStatus } from "@/lib/market/providerStatus";
import { summarizeMarketProviderStatuses } from "@/lib/market/providerStatus";
import type { TradingLightScannerDiagnosticSummary } from "@/lib/trading/lightScanner";
import type { ResearchRuntimeHealth } from "@/lib/trading/research/runtimeHealth";

export type ProductReadinessSeverity = "ok" | "warn" | "fail";

export type ProductReadinessReport = {
  severity: ProductReadinessSeverity;
  score: number;
  generatedAt: string;
  checks: Array<{
    id: string;
    severity: ProductReadinessSeverity;
    label: string;
    detail: string;
  }>;
};

function severityRank(severity: ProductReadinessSeverity) {
  if (severity === "fail") return 3;
  if (severity === "warn") return 2;
  return 1;
}

function worstSeverity(checks: ProductReadinessReport["checks"]) {
  return checks.reduce<ProductReadinessSeverity>(
    (current, check) => (severityRank(check.severity) > severityRank(current) ? check.severity : current),
    "ok",
  );
}

function readinessScore(checks: ProductReadinessReport["checks"]) {
  const penalties = checks.reduce((total, check) => {
    if (check.severity === "fail") return total + 30;
    if (check.severity === "warn") return total + 12;
    return total;
  }, 0);
  return Math.max(0, Math.min(100, 100 - penalties));
}

export function buildProductReadinessReport(args: {
  billing: PremiumAuditReport | null;
  billingError?: string | null;
  marketProviders: MarketProviderStatus[];
  research: ResearchRuntimeHealth | null;
  researchError?: string | null;
  scanner: TradingLightScannerDiagnosticSummary | null;
  scannerError?: string | null;
  generatedAt?: string;
}): ProductReadinessReport {
  const checks: ProductReadinessReport["checks"] = [];
  const providerSummary = summarizeMarketProviderStatuses(args.marketProviders);

  if (!args.scanner) {
    checks.push({
      id: "scanner-unavailable",
      severity: "fail",
      label: "Live scanner unavailable",
      detail: args.scannerError || "Scanner diagnostics could not be built.",
    });
  } else if (args.scanner.openMarketCount > 0 && args.scanner.freshOpenMarketCount === 0) {
    checks.push({
      id: "scanner-no-fresh-open-markets",
      severity: "fail",
      label: "No fresh open-market snapshots",
      detail: `${args.scanner.openMarketCount} markets are open and none are fresh.`,
    });
  } else if (args.scanner.staleOpenMarketCount > 0) {
    checks.push({
      id: "scanner-some-stale-open-markets",
      severity: "warn",
      label: "Some open markets are stale",
      detail: `${args.scanner.staleOpenMarketCount}/${args.scanner.openMarketCount} open markets are stale.`,
    });
  } else {
    checks.push({
      id: "scanner-fresh",
      severity: "ok",
      label: "Live scanner ready",
      detail: `${args.scanner.freshOpenMarketCount}/${args.scanner.openMarketCount} open markets are fresh.`,
    });
  }

  if (providerSummary.forexRedundancy < 2 || providerSummary.equityRedundancy < 2) {
    checks.push({
      id: "provider-redundancy-thin",
      severity: "warn",
      label: "Provider redundancy is thin",
      detail: `Configured redundancy: forex ${providerSummary.forexRedundancy}, equities ${providerSummary.equityRedundancy}, crypto ${providerSummary.cryptoRedundancy}.`,
    });
  } else {
    checks.push({
      id: "provider-redundancy-ok",
      severity: "ok",
      label: "Provider redundancy ready",
      detail: `Configured providers: ${providerSummary.configured}/${providerSummary.total}.`,
    });
  }

  if (!args.billing) {
    checks.push({
      id: "billing-audit-unavailable",
      severity: "fail",
      label: "Billing audit unavailable",
      detail: args.billingError || "Premium entitlement audit could not run.",
    });
  } else if (args.billing.summary.fail > 0) {
    checks.push({
      id: "billing-failures",
      severity: "fail",
      label: "Billing has failing issues",
      detail: `${args.billing.summary.fail} premium entitlement failures need action.`,
    });
  } else if (args.billing.summary.warn > 0) {
    checks.push({
      id: "billing-warnings",
      severity: "warn",
      label: "Billing has warnings",
      detail: `${args.billing.summary.warn} entitlement warnings need review.`,
    });
  } else {
    checks.push({
      id: "billing-clear",
      severity: "ok",
      label: "Billing audit clear",
      detail: `${args.billing.summary.checked} users checked, ${args.billing.summary.fail} failures.`,
    });
  }

  if (!args.research) {
    checks.push({
      id: "research-unavailable",
      severity: "warn",
      label: "Research runtime unavailable",
      detail: args.researchError || "Lab health could not be checked.",
    });
  } else if (args.research.severity === "error") {
    checks.push({
      id: "research-error",
      severity: "fail",
      label: "Research lab needs action",
      detail: args.research.alerts.map((alert) => alert.message).join(" ") || "Research runtime reported an error.",
    });
  } else if (args.research.severity === "warn") {
    checks.push({
      id: "research-warning",
      severity: "warn",
      label: "Research lab needs monitoring",
      detail: args.research.alerts.map((alert) => alert.message).join(" ") || "Research runtime reported warnings.",
    });
  } else {
    checks.push({
      id: "research-ok",
      severity: "ok",
      label: "Research lab healthy",
      detail: args.research.queue.activeRunId ? `Active run ${args.research.queue.activeRunId}.` : "No blocking lab alerts.",
    });
  }

  return {
    severity: worstSeverity(checks),
    score: readinessScore(checks),
    generatedAt: args.generatedAt ?? new Date().toISOString(),
    checks,
  };
}
