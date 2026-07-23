import type { CanonicalDecimal } from "@/lib/investing/engine/v1/canonical";

export const INVESTING_ENGINE_INPUT_CONTRACT_VERSION = "investing-engine-input/v1" as const;
export const INVESTING_ENGINE_RESULT_CONTRACT_VERSION = "investing-engine-result/v1" as const;
export const INVESTING_ENGINE_STATES_V1 = ["ready", "degraded", "blocked", "no_trade"] as const;
export const INVESTING_DATA_QUALITY_STATES_V1 = ["good", "degraded", "insufficient"] as const;
export const INVESTING_CONSTRAINT_KINDS_V1 = ["hard", "soft"] as const;
export const INVESTING_CONSTRAINT_STATES_V1 = ["pass", "fail", "unknown"] as const;

export type InvestingEngineEnvironmentV1 = "paper" | "simulation";
export type InvestingEngineStateV1 = (typeof INVESTING_ENGINE_STATES_V1)[number];
export type InvestingDataQualityV1 = (typeof INVESTING_DATA_QUALITY_STATES_V1)[number];
export type InvestingConstraintKindV1 = (typeof INVESTING_CONSTRAINT_KINDS_V1)[number];
export type InvestingConstraintStatusV1 = (typeof INVESTING_CONSTRAINT_STATES_V1)[number];
export type InvestingIssueSeverityV1 = "info" | "warning" | "error";

export type VersionSet = {
  readonly contractVersion: typeof INVESTING_ENGINE_INPUT_CONTRACT_VERSION;
  readonly engineVersion: string;
  readonly policyVersion: string;
  readonly modelVersion: string;
  readonly instrumentCatalogVersion: string;
  readonly marketDataSchemaVersion: string;
};

export type InvestingQualityIssueV1 = {
  readonly code: string;
  readonly severity: InvestingIssueSeverityV1;
  readonly domain: string;
  readonly message: string;
  readonly observedAt: string | null;
};

export type InvestingConstraintEvaluationV1 = {
  readonly id: string;
  readonly kind: InvestingConstraintKindV1;
  readonly status: InvestingConstraintStatusV1;
  readonly reasonCode: string;
  readonly observed: CanonicalDecimal | null;
  readonly limit: CanonicalDecimal | null;
  readonly evidenceRefs: readonly string[];
};

export type InvestingConfidenceV1 = {
  readonly value: CanonicalDecimal;
  readonly basis: readonly string[];
};

export type CanonicalCashBalanceV1 = {
  readonly currency: string;
  readonly available: CanonicalDecimal;
  readonly settled: CanonicalDecimal;
  readonly reserved: CanonicalDecimal;
};

export type CanonicalPositionV1 = {
  readonly symbol: string;
  readonly quantity: CanonicalDecimal;
  readonly reservedQuantity: CanonicalDecimal;
  readonly costBasis: CanonicalDecimal;
  readonly currency: string;
};

export type CanonicalPortfolioStateV1 = {
  readonly stateVersion: string;
  readonly cash: readonly CanonicalCashBalanceV1[];
  readonly positions: readonly CanonicalPositionV1[];
};

export type CanonicalPendingOrderV1 = {
  readonly orderId: string;
  readonly symbol: string;
  readonly side: "buy" | "sell";
  readonly status: "pending" | "submitted" | "partially_filled" | "reconciling";
  readonly quantity: CanonicalDecimal;
  readonly cumulativeFilledQuantity: CanonicalDecimal;
  readonly reservedCash: CanonicalDecimal;
  readonly reservedQuantity: CanonicalDecimal;
  readonly currency: string;
};

export type CanonicalMandateV1 = {
  readonly mandateSnapshotId: string;
  readonly objective: "preservation" | "growth" | "income" | "balanced";
  readonly riskProfile: "Conservative" | "Balanced" | "Aggressive";
  readonly horizon: "Short" | "Medium" | "Long";
  readonly baseCurrency: string;
  readonly constraints: readonly InvestingConstraintEvaluationV1[];
};

export type CanonicalInstrumentV1 = {
  readonly instrumentId: string;
  readonly symbol: string;
  readonly name: string;
  readonly assetClass: "equity" | "bond" | "commodity" | "cash" | "other";
  readonly currency: string;
  readonly enabled: boolean;
  readonly lotSize: CanonicalDecimal;
  readonly minimumNotional: CanonicalDecimal;
  readonly feeBps: CanonicalDecimal;
  readonly qualityScore: CanonicalDecimal;
};

export type CanonicalInstrumentCatalogSnapshotV1 = {
  readonly version: string;
  readonly instruments: readonly CanonicalInstrumentV1[];
  readonly catalogHash: string;
};

export type CanonicalMarketPointV1 = {
  readonly symbol: string;
  readonly price: CanonicalDecimal;
  readonly currency: string;
  readonly provider: string;
  readonly providerAsOf: string;
  readonly receivedAt: string;
  readonly quality: InvestingDataQualityV1;
};

export type CanonicalMarketSnapshotV1 = {
  readonly contractVersion: "investing-market-snapshot/v1";
  readonly marketSnapshotId: string;
  readonly asOf: string;
  readonly schemaVersion: string;
  readonly points: readonly CanonicalMarketPointV1[];
  readonly issues: readonly InvestingQualityIssueV1[];
  readonly snapshotHash: string;
};

export type CanonicalInvestingInputV1 = {
  readonly contractVersion: typeof INVESTING_ENGINE_INPUT_CONTRACT_VERSION;
  readonly inputSnapshotId: string;
  readonly runId: string;
  readonly userId: string;
  readonly portfolioId: string;
  readonly accountId: string;
  readonly environment: InvestingEngineEnvironmentV1;
  readonly asOf: string;
  readonly versions: VersionSet;
  readonly mandate: CanonicalMandateV1;
  readonly actual: CanonicalPortfolioStateV1;
  readonly pendingOrders: readonly CanonicalPendingOrderV1[];
  readonly projected: CanonicalPortfolioStateV1;
  readonly instrumentCatalog: CanonicalInstrumentCatalogSnapshotV1;
  readonly market: CanonicalMarketSnapshotV1;
  readonly quality: {
    readonly status: InvestingDataQualityV1;
    readonly issues: readonly InvestingQualityIssueV1[];
  };
  readonly confidence: InvestingConfidenceV1;
  readonly warnings: readonly InvestingQualityIssueV1[];
  readonly inputHash: string;
};

export type InvestingTargetAllocationV1 = {
  readonly symbol: string;
  readonly targetWeight: CanonicalDecimal;
  readonly targetValue: CanonicalDecimal;
  readonly currency: string;
  readonly reasonCodes: readonly string[];
};

export type InvestingRebalanceActionV1 = {
  readonly symbol: string;
  readonly action: "buy" | "sell" | "hold";
  readonly deltaQuantity: CanonicalDecimal;
  readonly deltaValue: CanonicalDecimal;
  readonly currency: string;
  readonly reasonCodes: readonly string[];
};

export type InvestingEngineResultV1 = {
  readonly contractVersion: typeof INVESTING_ENGINE_RESULT_CONTRACT_VERSION;
  readonly runId: string;
  readonly inputSnapshotId: string;
  readonly inputHash: string;
  readonly asOf: string;
  readonly versions: VersionSet;
  readonly state: InvestingEngineStateV1;
  readonly quality: InvestingDataQualityV1;
  readonly constraints: readonly InvestingConstraintEvaluationV1[];
  readonly confidence: InvestingConfidenceV1;
  readonly warnings: readonly InvestingQualityIssueV1[];
  readonly targetPortfolio: readonly InvestingTargetAllocationV1[];
  readonly rebalance: readonly InvestingRebalanceActionV1[];
  readonly proposal: null;
  readonly outputHash: string;
};
