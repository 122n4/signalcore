import type { CanonicalDecimal } from "@/lib/investing/engine/v1/canonical";
import {
  COST_ESTIMATE_CONTRACT_VERSION,
  LIQUIDITY_ASSESSMENT_CONTRACT_VERSION,
  TAX_AWARENESS_CONTRACT_VERSION,
  type ConstructionInstrumentModelV1,
  type CostEstimateV1,
  type LiquidityAssessmentV1,
  type TaxAwarenessAssessmentV1,
} from "@/lib/investing/engine/v1/phase3e/types";
import {
  BPS_DIVISOR,
  ZERO,
  add,
  compare,
  decimal,
  divide,
  max,
  multiply,
  subtract,
  sum,
} from "@/lib/investing/engine/v1/phase3e/primitives";

export function estimateTransactionCostV1(args: {
  notionalInBase: CanonicalDecimal;
  portfolioValueInBase: CanonicalDecimal;
  instrumentCurrency: string;
  baseCurrency: string;
  catalogFeeBps: CanonicalDecimal;
  model: ConstructionInstrumentModelV1;
  costBenefitThreshold: CanonicalDecimal;
}): CostEstimateV1 {
  if (compare(args.notionalInBase, ZERO) === 0) {
    return {
      contractVersion: COST_ESTIMATE_CONTRACT_VERSION,
      status: "available",
      commission: ZERO,
      spread: ZERO,
      slippage: ZERO,
      fxCost: ZERO,
      estimatedFees: ZERO,
      minimumFeeApplied: false,
      totalCost: ZERO,
      costPercentNotional: ZERO,
      costPercentPortfolio: ZERO,
      costBenefitStatus: "pass",
      unavailableComponents: [],
    };
  }
  const unavailable: string[] = [];
  const commissionBps = args.model.commissionBps ?? args.catalogFeeBps;
  if (args.model.spreadBps === null) unavailable.push("spread_bps");
  if (args.model.slippageBps === null) unavailable.push("slippage_bps");
  if (args.model.minimumFee === null) unavailable.push("minimum_fee");
  if (args.instrumentCurrency !== args.baseCurrency && args.model.fxCostBps === null) unavailable.push("fx_cost_bps");
  if (unavailable.length > 0) {
    return {
      contractVersion: COST_ESTIMATE_CONTRACT_VERSION,
      status: "unavailable",
      commission: null,
      spread: null,
      slippage: null,
      fxCost: null,
      estimatedFees: null,
      minimumFeeApplied: null,
      totalCost: null,
      costPercentNotional: null,
      costPercentPortfolio: null,
      costBenefitStatus: "unknown",
      unavailableComponents: unavailable.sort(),
    };
  }
  const rawCommission = divide(multiply(args.notionalInBase, commissionBps), BPS_DIVISOR);
  const commission = max(rawCommission, args.model.minimumFee!);
  const spread = divide(multiply(args.notionalInBase, args.model.spreadBps!), BPS_DIVISOR);
  const slippage = divide(multiply(args.notionalInBase, args.model.slippageBps!), BPS_DIVISOR);
  const fxCost = args.instrumentCurrency === args.baseCurrency
    ? ZERO
    : divide(multiply(args.notionalInBase, args.model.fxCostBps!), BPS_DIVISOR);
  const totalCost = sum([commission, spread, slippage, fxCost]);
  const costPercentNotional = divide(totalCost, args.notionalInBase);
  const costPercentPortfolio = compare(args.portfolioValueInBase, ZERO) > 0
    ? divide(totalCost, args.portfolioValueInBase)
    : ZERO;
  return {
    contractVersion: COST_ESTIMATE_CONTRACT_VERSION,
    status: "available",
    commission,
    spread,
    slippage,
    fxCost,
    estimatedFees: add(commission, fxCost),
    minimumFeeApplied: compare(commission, rawCommission) > 0,
    totalCost,
    costPercentNotional,
    costPercentPortfolio,
    costBenefitStatus: compare(costPercentNotional, args.costBenefitThreshold) <= 0 ? "pass" : "fail",
    unavailableComponents: [],
  };
}

export function assessLiquidityV1(args: {
  requestedQuantity: CanonicalDecimal;
  notionalInBase: CanonicalDecimal;
  model: ConstructionInstrumentModelV1;
  asOf: string;
  maxAgeSeconds: CanonicalDecimal;
}): LiquidityAssessmentV1 {
  if (compare(args.requestedQuantity, ZERO) === 0) {
    return {
      contractVersion: LIQUIDITY_ASSESSMENT_CONTRACT_VERSION,
      status: "not_required",
      marketability: "not_required",
      requestedQuantity: ZERO,
      estimatedTradableQuantity: ZERO,
      averageDailyVolume: args.model.averageDailyVolume,
      maxParticipation: args.model.maxParticipation,
      liquidityTier: args.model.liquidityTier,
      estimatedMarketImpact: ZERO,
      sourceAsOf: args.model.liquidityAsOf,
      explanation: "Hold/no-trade requires no liquidity proof",
    };
  }
  if (
    args.model.averageDailyVolume === null
    || args.model.maxParticipation === null
    || args.model.liquidityTier === null
    || args.model.marketImpactBps === null
    || args.model.liquidityAsOf === null
  ) {
    return {
      contractVersion: LIQUIDITY_ASSESSMENT_CONTRACT_VERSION,
      status: "unavailable",
      marketability: "unknown",
      requestedQuantity: args.requestedQuantity,
      estimatedTradableQuantity: null,
      averageDailyVolume: args.model.averageDailyVolume,
      maxParticipation: args.model.maxParticipation,
      liquidityTier: args.model.liquidityTier,
      estimatedMarketImpact: null,
      sourceAsOf: args.model.liquidityAsOf,
      explanation: "A material liquidity component is unavailable",
    };
  }
  const ageMilliseconds = new Date(args.asOf).getTime() - new Date(args.model.liquidityAsOf).getTime();
  const ageMs = decimal(String(ageMilliseconds));
  const maximumAgeMs = multiply(args.maxAgeSeconds, decimal("1000"));
  const tradable = multiply(args.model.averageDailyVolume, args.model.maxParticipation);
  const impact = divide(multiply(args.notionalInBase, args.model.marketImpactBps), BPS_DIVISOR);
  if (compare(ageMs, maximumAgeMs) > 0) {
    return {
      contractVersion: LIQUIDITY_ASSESSMENT_CONTRACT_VERSION,
      status: "stale",
      marketability: "unknown",
      requestedQuantity: args.requestedQuantity,
      estimatedTradableQuantity: tradable,
      averageDailyVolume: args.model.averageDailyVolume,
      maxParticipation: args.model.maxParticipation,
      liquidityTier: args.model.liquidityTier,
      estimatedMarketImpact: impact,
      sourceAsOf: args.model.liquidityAsOf,
      explanation: "Liquidity data exceeds the versioned staleness limit",
    };
  }
  const sufficient = compare(args.requestedQuantity, tradable) <= 0;
  return {
    contractVersion: LIQUIDITY_ASSESSMENT_CONTRACT_VERSION,
    status: sufficient ? "sufficient" : "insufficient",
    marketability: sufficient ? "marketable" : "not_marketable",
    requestedQuantity: args.requestedQuantity,
    estimatedTradableQuantity: tradable,
    averageDailyVolume: args.model.averageDailyVolume,
    maxParticipation: args.model.maxParticipation,
    liquidityTier: args.model.liquidityTier,
    estimatedMarketImpact: impact,
    sourceAsOf: args.model.liquidityAsOf,
    explanation: sufficient
      ? "Requested quantity is within participation and ADV limits"
      : "Requested quantity exceeds the estimated tradable quantity",
  };
}

export function assessTaxAwarenessV1(args: {
  side: "buy" | "sell" | "hold";
  quantity: CanonicalDecimal;
  estimatedPrice: CanonicalDecimal;
  costBasis: CanonicalDecimal;
  fxRateToBase: CanonicalDecimal;
  model: ConstructionInstrumentModelV1;
}): TaxAwarenessAssessmentV1 {
  if (args.side !== "sell" || compare(args.quantity, ZERO) === 0) {
    return {
      contractVersion: TAX_AWARENESS_CONTRACT_VERSION,
      status: "not_applicable",
      taxLotAvailability: args.model.taxLotAvailability,
      estimatedRealizedGainLoss: null,
      taxableSaleWarning: false,
      turnoverPreference: "neutral",
      explanation: "No sale is proposed",
    };
  }
  if (args.model.taxLotAvailability !== "available") {
    return {
      contractVersion: TAX_AWARENESS_CONTRACT_VERSION,
      status: "unknown_basis",
      taxLotAvailability: args.model.taxLotAvailability,
      estimatedRealizedGainLoss: null,
      taxableSaleWarning: true,
      turnoverPreference: "prefer_lower",
      explanation: "Canonical tax-lot/cost-basis proof is unavailable; gain is not assumed to be zero",
    };
  }
  const localGainLoss = multiply(subtract(args.estimatedPrice, args.costBasis), args.quantity);
  const gainLoss = multiply(localGainLoss, args.fxRateToBase);
  const status = compare(gainLoss, ZERO) > 0
    ? "known_gain"
    : compare(gainLoss, ZERO) < 0
      ? "known_loss"
      : "known_neutral";
  return {
    contractVersion: TAX_AWARENESS_CONTRACT_VERSION,
    status,
    taxLotAvailability: "available",
    estimatedRealizedGainLoss: gainLoss,
    taxableSaleWarning: status === "known_gain",
    turnoverPreference: status === "known_gain" ? "prefer_lower" : "neutral",
    explanation: status === "known_gain"
      ? "Estimated sale is above canonical cost basis and may be taxable"
      : status === "known_loss"
        ? "Estimated sale is below canonical cost basis"
        : "Estimated sale equals canonical cost basis",
  };
}

export function estimatedBenefitFromDrift(args: {
  drift: CanonicalDecimal;
  portfolioValue: CanonicalDecimal;
}) {
  return multiply(args.drift, args.portfolioValue);
}

export function applyMinimumTradeBenefit(
  benefit: CanonicalDecimal,
  minimum: CanonicalDecimal,
) {
  return compare(benefit, minimum) >= 0;
}

export function normalizeBps(value: string) {
  return decimal(value);
}
