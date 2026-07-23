import type { CanonicalDecimal } from "@/lib/investing/engine/v1/canonical";
import type {
  CanonicalInstrumentCatalogSnapshotV1,
  CanonicalInvestingInputV1,
  CanonicalMandateV1,
  CanonicalMarketSnapshotV1,
  CanonicalPendingOrderV1,
  CanonicalPortfolioStateV1,
  InvestingQualityIssueV1,
  VersionSet,
} from "@/lib/investing/engine/v1/contracts";

export const INVESTING_ORDER_STATES_V1 = [
  "proposed",
  "approved",
  "submitting",
  "submitted",
  "partially_filled",
  "reconciling",
  "cancellation_requested",
  "cancelled",
  "submission_failed",
  "rejected",
  "filled",
  "reconciled",
] as const;

export type InvestingOrderStateV1 = (typeof INVESTING_ORDER_STATES_V1)[number];

export type InvestingOrderStateSemanticsV1 = {
  readonly state: InvestingOrderStateV1;
  readonly terminal: boolean;
  readonly entersReserved: boolean;
  readonly entersProjected: boolean;
  readonly canonicalPendingStatus: CanonicalPendingOrderV1["status"] | null;
  readonly cashEffect: "none" | "buy_debit_sell_credit_for_remainder";
  readonly positionEffect: "none" | "buy_add_sell_subtract_for_remainder";
  readonly partialFillRule: string;
  readonly exceptionalRule: string;
  readonly ambiguity: "none" | "degraded";
};

export type InvestingIdentitySourceV1 = {
  readonly requestedUserId: string;
  readonly ownerUserId: string;
};

export type InvestingAccountSourceV1 = {
  readonly accountId: string;
  readonly userId: string;
  readonly portfolioId: string;
  readonly environment: "paper" | "simulation" | "live";
  readonly status: "active" | "closed" | "suspended";
  readonly baseCurrency: string;
};

export type InvestingCashBalanceSourceV1 = {
  readonly accountId: string;
  readonly currency: string;
  readonly available: string;
  readonly settled: string;
  readonly reserved: string;
};

export type InvestingPositionSourceV1 = {
  readonly accountId: string;
  readonly symbol: string;
  readonly quantity: string;
  readonly reservedQuantity: string;
  readonly costBasis: string;
  readonly currency: string;
};

export type InvestingOrderSourceV1 = {
  readonly orderId: string;
  readonly semanticOrderId: string;
  readonly accountId: string;
  readonly userId: string;
  readonly portfolioId: string;
  readonly symbol: string;
  readonly currency: string;
  readonly side: "buy" | "sell";
  readonly status: string;
  readonly quantity: string;
  readonly cumulativeFilledQuantity: string;
  readonly unitPrice: string | null;
  readonly persistedReservedCash: string;
  readonly persistedReservedQuantity: string;
  readonly estimatedFeeRemaining: string | null;
  readonly updatedAt: string;
};

export type InvestingFillSourceV1 = {
  readonly fillId: string;
  readonly semanticFillId: string;
  readonly orderId: string;
  readonly quantity: string;
};

export type InvestingMandateSnapshotSourceV1 = {
  readonly userId: string;
  readonly accountId: string;
  readonly mandate: CanonicalMandateV1;
};

export type InvestingAuthoringSourceV1 = {
  readonly plan: Readonly<Record<string, unknown>>;
  readonly settings: Readonly<Record<string, unknown>>;
};

export type NormalizedInvestingAuthoringV1 = {
  readonly plan: {
    readonly objective: CanonicalMandateV1["objective"] | null;
    readonly riskProfile: CanonicalMandateV1["riskProfile"] | null;
    readonly horizon: CanonicalMandateV1["horizon"] | null;
  };
  readonly settings: {
    readonly marketDataMaxAgeSeconds: CanonicalDecimal;
    readonly orderStaleAfterSeconds: CanonicalDecimal;
  };
};

export type InvestingFinancialReadModelV1 = {
  readonly identity: InvestingIdentitySourceV1;
  readonly accounts: readonly InvestingAccountSourceV1[];
  readonly cashBalances: readonly InvestingCashBalanceSourceV1[];
  readonly positions: readonly InvestingPositionSourceV1[];
  readonly orders: readonly InvestingOrderSourceV1[];
  readonly fills: readonly InvestingFillSourceV1[];
  readonly mandateSnapshot: InvestingMandateSnapshotSourceV1;
  readonly authoring: InvestingAuthoringSourceV1;
};

export type CanonicalInputBuildRequestV1 = {
  readonly requestedUserId: string;
  readonly requestedAccountId: string | null;
  readonly inputSnapshotId: string;
  readonly runId: string;
  readonly asOf: string;
  readonly marketSnapshotId: string;
  readonly versions: VersionSet;
};

export type CanonicalInputBuildSourcesV1 = {
  readonly request: CanonicalInputBuildRequestV1;
  readonly financial: InvestingFinancialReadModelV1;
  readonly instrumentCatalog: CanonicalInstrumentCatalogSnapshotV1;
  readonly market: CanonicalMarketSnapshotV1;
};

export type OrderEconomicEffectV1 = {
  readonly orderId: string;
  readonly semanticOrderId: string;
  readonly sourceState: string;
  readonly terminal: boolean;
  readonly entersReserved: boolean;
  readonly entersProjected: boolean;
  readonly remainingQuantity: CanonicalDecimal;
  readonly effectiveFilledQuantity: CanonicalDecimal;
  readonly economicReservedCash: CanonicalDecimal;
  readonly economicReservedQuantity: CanonicalDecimal;
  readonly persistedReservedCash: CanonicalDecimal;
  readonly persistedReservedQuantity: CanonicalDecimal;
  readonly estimatedFeeRemaining: CanonicalDecimal;
  readonly projectedCashDelta: CanonicalDecimal;
  readonly projectedQuantityDelta: CanonicalDecimal;
  readonly canonicalPendingOrder: CanonicalPendingOrderV1 | null;
};

export type ReservedCashStateV1 = {
  readonly currency: string;
  readonly persisted: CanonicalDecimal;
  readonly economic: CanonicalDecimal;
  readonly effective: CanonicalDecimal;
  readonly fees: CanonicalDecimal;
  readonly orderIds: readonly string[];
};

export type ReservedPositionStateV1 = {
  readonly symbol: string;
  readonly persisted: CanonicalDecimal;
  readonly economic: CanonicalDecimal;
  readonly effective: CanonicalDecimal;
  readonly orderIds: readonly string[];
};

export type PortfolioValuationLineV1 = {
  readonly symbol: string;
  readonly currency: string;
  readonly quantity: CanonicalDecimal;
  readonly availableQuantity: CanonicalDecimal;
  readonly marketPrice: CanonicalDecimal | null;
  readonly fxRateToBase: CanonicalDecimal | null;
  readonly marketValue: CanonicalDecimal | null;
  readonly baseMarketValue: CanonicalDecimal | null;
  readonly exposure: CanonicalDecimal | null;
};

export type PortfolioValuationV1 = {
  readonly baseCurrency: string;
  readonly cashValueInBase: CanonicalDecimal | null;
  readonly positionValueInBase: CanonicalDecimal | null;
  readonly totalValueInBase: CanonicalDecimal | null;
  readonly positions: readonly PortfolioValuationLineV1[];
};

export type PortfolioStateDerivationV1 = {
  readonly actual: {
    readonly canonical: CanonicalPortfolioStateV1;
    readonly valuation: PortfolioValuationV1;
  };
  readonly reserved: {
    readonly cash: readonly ReservedCashStateV1[];
    readonly positions: readonly ReservedPositionStateV1[];
    readonly orders: readonly OrderEconomicEffectV1[];
  };
  readonly projected: {
    readonly canonical: CanonicalPortfolioStateV1;
    readonly valuation: PortfolioValuationV1;
  };
  readonly issues: readonly InvestingQualityIssueV1[];
};

export type CanonicalInputBuildResultV1 = {
  readonly input: CanonicalInvestingInputV1;
  readonly selectedAccountId: string;
  readonly normalizedAuthoring: NormalizedInvestingAuthoringV1;
  readonly portfolioState: PortfolioStateDerivationV1;
};
