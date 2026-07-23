import {
  canonicalDecimalFromString,
  deepFreezeCanonical,
  normalizeIsoTimestamp,
} from "@/lib/investing/engine/v1/canonical";
import {
  INVESTING_ENGINE_INPUT_CONTRACT_VERSION,
  type InvestingQualityIssueV1,
} from "@/lib/investing/engine/v1/contracts";
import type { InstrumentCatalogPort, MarketSnapshotPort } from "@/lib/investing/engine/v1/ports";
import { sealCanonicalInvestingInputV1 } from "@/lib/investing/engine/v1/validation";
import { normalizeInvestingAuthoringV1 } from "@/lib/investing/engine/v1/phase3c/authoring";
import { buildPortfolioStateV1 } from "@/lib/investing/engine/v1/phase3c/portfolioState";
import type { InvestingCanonicalSourceRepositoryPortV1 } from "@/lib/investing/engine/v1/phase3c/repository";
import type {
  CanonicalInputBuildRequestV1,
  CanonicalInputBuildResultV1,
  CanonicalInputBuildSourcesV1,
  InvestingAccountSourceV1,
} from "@/lib/investing/engine/v1/phase3c/types";

const CURRENCY_PATTERN = /^[A-Z]{3}$/;

function qualityIssue(
  asOf: string,
  code: string,
  severity: "warning" | "error",
  domain: string,
  message: string,
): InvestingQualityIssueV1 {
  return { code, severity, domain, message, observedAt: asOf };
}

function selectPaperAccount(sources: CanonicalInputBuildSourcesV1): InvestingAccountSourceV1 {
  const { request, financial } = sources;
  if (
    request.requestedUserId !== financial.identity.requestedUserId
    || request.requestedUserId !== financial.identity.ownerUserId
  ) {
    throw new Error("investing_input_identity_ownership_mismatch");
  }
  const owned = financial.accounts.filter((account) => account.userId === request.requestedUserId);
  if (owned.length !== financial.accounts.length) {
    throw new Error("investing_input_account_ownership_mismatch");
  }
  const eligible = owned.filter((account) =>
    account.status === "active"
    && account.environment === "paper"
    && (request.requestedAccountId === null || account.accountId === request.requestedAccountId),
  );
  if (eligible.length === 0) throw new Error("investing_input_active_paper_account_required");
  if (eligible.length > 1) throw new Error("investing_input_paper_account_ambiguous");
  return eligible[0];
}

export function buildCanonicalInvestingInputFromSourcesV1(
  sources: CanonicalInputBuildSourcesV1,
): CanonicalInputBuildResultV1 {
  const asOf = normalizeIsoTimestamp(sources.request.asOf);
  const account = selectPaperAccount(sources);
  if (!CURRENCY_PATTERN.test(account.baseCurrency)) {
    throw new Error("investing_input_account_base_currency_invalid");
  }
  if (
    sources.financial.mandateSnapshot.userId !== account.userId
    || sources.financial.mandateSnapshot.accountId !== account.accountId
  ) {
    throw new Error("investing_input_mandate_ownership_mismatch");
  }
  if (sources.market.marketSnapshotId !== sources.request.marketSnapshotId) {
    throw new Error("investing_input_market_snapshot_identity_mismatch");
  }

  const authoring = normalizeInvestingAuthoringV1(sources.financial.authoring, asOf);
  const initialIssues: InvestingQualityIssueV1[] = [...authoring.issues];
  const mandate = sources.financial.mandateSnapshot.mandate;
  if (mandate.baseCurrency !== account.baseCurrency) {
    initialIssues.push(qualityIssue(
      asOf,
      "account_mandate_currency_mismatch",
      "error",
      "mandate",
      "Account and mandate base currencies disagree",
    ));
  }
  for (const [key, authored, authoritative] of [
    ["objective", authoring.normalized.plan.objective, mandate.objective],
    ["risk_profile", authoring.normalized.plan.riskProfile, mandate.riskProfile],
    ["horizon", authoring.normalized.plan.horizon, mandate.horizon],
  ] as const) {
    if (authored !== null && authored !== authoritative) {
      initialIssues.push(qualityIssue(
        asOf,
        `plan_${key}_mandate_mismatch`,
        "warning",
        "authoring",
        `Plan ${key} differs from the authoritative mandate and was not used`,
      ));
    }
  }
  if (new Date(sources.market.asOf).getTime() > new Date(asOf).getTime()) {
    initialIssues.push(qualityIssue(
      asOf,
      "market_snapshot_after_input_as_of",
      "error",
      "market",
      "Market snapshot is later than the canonical input asOf",
    ));
  }

  const portfolioState = buildPortfolioStateV1({
    account,
    financial: sources.financial,
    instrumentCatalog: sources.instrumentCatalog,
    market: sources.market,
    authoring: authoring.normalized,
    asOf,
    initialIssues,
  });
  const hasError = portfolioState.issues.some((entry) => entry.severity === "error");
  const hasWarning = portfolioState.issues.some((entry) => entry.severity === "warning");
  const quality = hasError ? "insufficient" : hasWarning ? "degraded" : "good";
  const confidence = hasError ? "0" : hasWarning ? "0.5" : "1";
  const pendingOrders = portfolioState.reserved.orders
    .map((effect) => effect.canonicalPendingOrder)
    .filter((order) => order !== null)
    .sort((left, right) => left.orderId.localeCompare(right.orderId));

  const input = sealCanonicalInvestingInputV1({
    contractVersion: INVESTING_ENGINE_INPUT_CONTRACT_VERSION,
    inputSnapshotId: sources.request.inputSnapshotId,
    runId: sources.request.runId,
    userId: account.userId,
    portfolioId: account.portfolioId,
    accountId: account.accountId,
    environment: "paper",
    asOf,
    versions: sources.request.versions,
    mandate,
    actual: portfolioState.actual.canonical,
    pendingOrders,
    projected: portfolioState.projected.canonical,
    instrumentCatalog: sources.instrumentCatalog,
    market: sources.market,
    quality: { status: quality, issues: portfolioState.issues },
    confidence: {
      value: canonicalDecimalFromString(confidence),
      basis: portfolioState.issues.length === 0
        ? ["canonical_sources_complete"]
        : portfolioState.issues.map((entry) => entry.code),
    },
    warnings: portfolioState.issues.filter((entry) => entry.severity !== "error"),
  });
  return deepFreezeCanonical({
    input,
    selectedAccountId: account.accountId,
    normalizedAuthoring: authoring.normalized,
    portfolioState,
  }) as CanonicalInputBuildResultV1;
}

export class CanonicalInvestingInputBuilderV1 {
  constructor(
    private readonly repository: InvestingCanonicalSourceRepositoryPortV1,
    private readonly instrumentCatalog: InstrumentCatalogPort,
    private readonly marketSnapshots: MarketSnapshotPort,
  ) {}

  async build(request: CanonicalInputBuildRequestV1): Promise<CanonicalInputBuildResultV1> {
    const financial = await this.repository.getFinancialReadModel(request.requestedUserId);
    if (!financial) throw new Error("investing_input_financial_read_model_missing");
    const market = await this.marketSnapshots.getSnapshotById(request.marketSnapshotId);
    if (!market) throw new Error("investing_input_market_snapshot_missing");
    return buildCanonicalInvestingInputFromSourcesV1({
      request,
      financial,
      instrumentCatalog: this.instrumentCatalog.snapshot(),
      market,
    });
  }
}
