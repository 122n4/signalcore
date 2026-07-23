import type { CanonicalDecimal } from "@/lib/investing/engine/v1/canonical";
import {
  CONSTRUCTION_CANDIDATE_CONTRACT_VERSION,
  CONSTRUCTION_EVALUATION_CONTRACT_VERSION,
  COST_ESTIMATE_CONTRACT_VERSION,
  LIQUIDITY_ASSESSMENT_CONTRACT_VERSION,
  PORTFOLIO_TARGET_CONTRACT_VERSION,
  REBALANCE_ACTION_CONTRACT_VERSION,
  TAX_AWARENESS_CONTRACT_VERSION,
  type ConstructionCandidateV1,
  type ConstructionEngineInputV1,
  type ConstructionEvaluationV1,
  type ConstructionInstrumentModelV1,
  type CostEstimateV1,
  type LiquidityAssessmentV1,
  type PolicyLimitSnapshotV1,
  type PortfolioTargetV1,
  type RebalanceActionV1,
  type TaxAwarenessAssessmentV1,
  type TargetPositionV1,
} from "@/lib/investing/engine/v1/phase3e/types";
import {
  ONE,
  ZERO,
  abs,
  add,
  ceilToIncrement,
  compare,
  decimal,
  divide,
  floorToIncrement,
  isPositive,
  max,
  min,
  multiply,
  sha256,
  subtract,
  sum,
} from "@/lib/investing/engine/v1/phase3e/primitives";
import {
  applyMinimumTradeBenefit,
  assessLiquidityV1,
  assessTaxAwarenessV1,
  estimateTransactionCostV1,
  estimatedBenefitFromDrift,
} from "@/lib/investing/engine/v1/phase3e/models";

type CandidateMode = ConstructionCandidateV1["mode"];
type WeightMap = Map<string, CanonicalDecimal>;

type MarketFacts = {
  price: CanonicalDecimal;
  fx: CanonicalDecimal;
  basePrice: CanonicalDecimal;
};

function findLimit(
  sources: ConstructionEngineInputV1,
  scope: PolicyLimitSnapshotV1["scope"],
  subject: string | null,
) {
  return sources.policy.limits.find((limit) => limit.scope === scope && limit.subject === subject)
    ?? sources.policy.limits.find((limit) => limit.scope === scope && limit.subject === null)
    ?? null;
}

function marketFacts(sources: ConstructionEngineInputV1, symbol: string): MarketFacts | null {
  const position = sources.canonicalInput.projected.positions.find((entry) => entry.symbol === symbol);
  const instrument = sources.canonicalInput.instrumentCatalog.instruments.find((entry) => entry.symbol === symbol);
  const currency = position?.currency ?? instrument?.currency;
  const point = sources.canonicalInput.market.points.find((entry) => entry.symbol === symbol);
  if (!currency || !point || point.currency !== currency) return null;
  let fx = ONE;
  if (currency !== sources.canonicalInput.mandate.baseCurrency) {
    const direct = sources.canonicalInput.market.points.find((entry) =>
      (entry.symbol === `${currency}${sources.canonicalInput.mandate.baseCurrency}`
        || entry.symbol === `${currency}_${sources.canonicalInput.mandate.baseCurrency}`)
      && entry.currency === sources.canonicalInput.mandate.baseCurrency,
    );
    const inverse = sources.canonicalInput.market.points.find((entry) =>
      (entry.symbol === `${sources.canonicalInput.mandate.baseCurrency}${currency}`
        || entry.symbol === `${sources.canonicalInput.mandate.baseCurrency}_${currency}`)
      && entry.currency === currency,
    );
    if (direct) fx = direct.price;
    else if (inverse && isPositive(inverse.price)) fx = divide(ONE, inverse.price);
    else return null;
  }
  return { price: point.price, fx, basePrice: multiply(point.price, fx) };
}

function mapValue(map: ReadonlyMap<string, CanonicalDecimal>, key: string) {
  return map.get(key) ?? ZERO;
}

function idealWeights(sources: ConstructionEngineInputV1) {
  const instrumentBySymbol = new Map(sources.canonicalInput.instrumentCatalog.instruments.map((entry) => [entry.symbol, entry]));
  const symbols = [...sources.envelope.allowedInstruments]
    .filter((symbol) => instrumentBySymbol.get(symbol)?.enabled === true)
    .sort();
  const minimumCash = findLimit(sources, "cash", null)?.value ?? ZERO;
  const maximumExposure = findLimit(sources, "total_exposure", null)?.value ?? ONE;
  const requiredCash = max(minimumCash, subtract(ONE, maximumExposure));
  const desiredExposure = max(subtract(ONE, requiredCash), ZERO);
  const allocations: WeightMap = new Map(symbols.map((symbol) => [symbol, ZERO]));
  const classAllocations: WeightMap = new Map();
  const currencyAllocations: WeightMap = new Map();
  let remaining = desiredExposure;

  for (let iteration = 0; iteration < 64 && isPositive(remaining); iteration += 1) {
    const active = symbols.filter((symbol) => {
      const instrument = instrumentBySymbol.get(symbol)!;
      const instrumentLimit = findLimit(sources, "instrument", symbol)?.value ?? ONE;
      const classLimit = findLimit(sources, "asset_class", instrument.assetClass)?.value ?? ONE;
      const specificCurrencyLimit = sources.policy.limits.find((limit) =>
        limit.scope === "currency" && limit.subject === instrument.currency,
      );
      const currencyLimit = instrument.currency === sources.canonicalInput.mandate.baseCurrency && !specificCurrencyLimit
        ? ONE
        : (specificCurrencyLimit ?? findLimit(sources, "currency", instrument.currency))?.value ?? ONE;
      return isPositive(min(instrumentLimit, min(
        subtract(classLimit, mapValue(classAllocations, instrument.assetClass)),
        subtract(currencyLimit, mapValue(currencyAllocations, instrument.currency)),
      ))) && compare(mapValue(allocations, symbol), instrumentLimit) < 0;
    });
    if (active.length === 0) break;
    const share = divide(remaining, decimal(String(active.length)));
    let allocatedThisRound = ZERO;
    for (const symbol of active) {
      const instrument = instrumentBySymbol.get(symbol)!;
      const instrumentLimit = findLimit(sources, "instrument", symbol)?.value ?? ONE;
      const classLimit = findLimit(sources, "asset_class", instrument.assetClass)?.value ?? ONE;
      const specificCurrencyLimit = sources.policy.limits.find((limit) =>
        limit.scope === "currency" && limit.subject === instrument.currency,
      );
      const currencyLimit = instrument.currency === sources.canonicalInput.mandate.baseCurrency && !specificCurrencyLimit
        ? ONE
        : (specificCurrencyLimit ?? findLimit(sources, "currency", instrument.currency))?.value ?? ONE;
      const capacity = min(
        subtract(instrumentLimit, mapValue(allocations, symbol)),
        min(
          subtract(classLimit, mapValue(classAllocations, instrument.assetClass)),
          subtract(currencyLimit, mapValue(currencyAllocations, instrument.currency)),
        ),
      );
      const increment = max(min(min(share, remaining), capacity), ZERO);
      if (!isPositive(increment)) continue;
      allocations.set(symbol, add(mapValue(allocations, symbol), increment));
      classAllocations.set(
        instrument.assetClass,
        add(mapValue(classAllocations, instrument.assetClass), increment),
      );
      currencyAllocations.set(
        instrument.currency,
        add(mapValue(currencyAllocations, instrument.currency), increment),
      );
      allocatedThisRound = add(allocatedThisRound, increment);
      remaining = max(subtract(remaining, increment), ZERO);
    }
    if (!isPositive(allocatedThisRound)) break;
  }
  return { allocations, desiredExposure, unallocated: remaining };
}

function blendedWeights(sources: ConstructionEngineInputV1, ideal: WeightMap, mode: CandidateMode) {
  const current = new Map(sources.risk.instrumentConcentrations.map((entry) => [entry.subject, entry.weight]));
  if (mode === "hold") return current;
  if (mode === "full_rebalance") return ideal;
  const factor = decimal("0.5");
  const symbols = new Set([...current.keys(), ...ideal.keys()]);
  return new Map([...symbols].sort().map((symbol) => {
    const now = mapValue(current, symbol);
    return [symbol, add(now, multiply(subtract(mapValue(ideal, symbol), now), factor))];
  }));
}

function targetFromWeights(
  sources: ConstructionEngineInputV1,
  mode: CandidateMode,
  weights: WeightMap,
): { target: PortfolioTargetV1; impossible: boolean; reasonCodes: string[] } {
  const portfolioValue = sources.risk.totalPortfolioValue.value ?? ZERO;
  const catalog = new Map(sources.canonicalInput.instrumentCatalog.instruments.map((entry) => [entry.symbol, entry]));
  const model = new Map(sources.model.instruments.map((entry) => [entry.symbol, entry]));
  const projected = new Map(sources.canonicalInput.projected.positions.map((entry) => [entry.symbol, entry]));
  const reasons: string[] = [];
  let impossible = false;
  const positions: TargetPositionV1[] = [];

  for (const symbol of [...weights.keys()].sort()) {
    const weight = max(mapValue(weights, symbol), ZERO);
    if (!isPositive(weight) && mode !== "hold") continue;
    const instrument = catalog.get(symbol);
    const facts = marketFacts(sources, symbol);
    if (!instrument || !facts) {
      impossible = true;
      reasons.push(!instrument ? `target_instrument_missing:${symbol}` : `target_market_data_missing:${symbol}`);
      continue;
    }
    const instrumentModel = model.get(symbol);
    const increment = instrumentModel
      ? instrumentModel.fractionalShares
        ? instrumentModel.quantityIncrement
        : max(decimal("1"), max(instrumentModel.quantityIncrement, instrument.lotSize))
      : instrument.lotSize;
    const minimumQuantity = instrumentModel?.minimumQuantity ?? instrument.lotSize;
    const targetValueBeforeRounding = multiply(weight, portfolioValue);
    let quantity = mode === "hold"
      ? projected.get(symbol)?.quantity ?? ZERO
      : floorToIncrement(divide(targetValueBeforeRounding, facts.basePrice), increment);
    let roundedValue = multiply(quantity, facts.basePrice);
    const positionReasons = ["projected_state_start", "policy_capacity_allocation", "conservative_rounding"];
    if (isPositive(quantity) && compare(quantity, minimumQuantity) < 0) {
      quantity = ZERO;
      roundedValue = ZERO;
      positionReasons.push("below_minimum_quantity");
    }
    if (isPositive(roundedValue) && compare(roundedValue, instrument.minimumNotional) < 0) {
      quantity = ZERO;
      roundedValue = ZERO;
      positionReasons.push("below_minimum_notional");
    }
    const roundedWeight = isPositive(portfolioValue) ? divide(roundedValue, portfolioValue) : ZERO;
    positions.push({
      symbol,
      assetClass: instrument.assetClass,
      currency: instrument.currency,
      targetWeight: roundedWeight,
      targetValue: roundedValue,
      targetQuantity: quantity,
      roundingResidual: max(subtract(targetValueBeforeRounding, roundedValue), ZERO),
      reasonCodes: positionReasons,
    });
  }

  const investedWeight = sum(positions.map((entry) => entry.targetWeight));
  const cashWeight = max(subtract(ONE, investedWeight), ZERO);
  const investedValue = sum(positions.map((entry) => entry.targetValue));
  const residualCash = max(subtract(portfolioValue, investedValue), ZERO);
  const classMap = new Map<string, CanonicalDecimal>();
  for (const position of positions) {
    classMap.set(position.assetClass, add(mapValue(classMap, position.assetClass), position.targetWeight));
  }
  const targetId = `target:${mode}:${sources.canonicalInput.inputHash.slice(0, 16)}`;
  const draft: Omit<PortfolioTargetV1, "targetHash"> = {
    contractVersion: PORTFOLIO_TARGET_CONTRACT_VERSION,
    targetId,
    inputHash: sources.canonicalInput.inputHash,
    positions,
    assetClassWeights: [...classMap].sort(([a], [b]) => a.localeCompare(b)).map(([assetClass, weight]) => ({ assetClass, weight })),
    cashWeight,
    totalExposure: investedWeight,
    residualCash,
  };
  return {
    target: { ...draft, targetHash: sha256(draft) },
    impossible,
    reasonCodes: [...new Set(reasons)].sort(),
  };
}

function targetFromActions(
  sources: ConstructionEngineInputV1,
  requested: PortfolioTargetV1,
  actions: readonly RebalanceActionV1[],
): PortfolioTargetV1 {
  const portfolioValue = sources.risk.totalPortfolioValue.value ?? ZERO;
  const catalog = new Map(sources.canonicalInput.instrumentCatalog.instruments.map((entry) => [entry.symbol, entry]));
  const requestedPositions = new Map(requested.positions.map((entry) => [entry.symbol, entry]));
  const positions: TargetPositionV1[] = [];

  for (const action of actions) {
    if (!isPositive(action.targetQuantity)) continue;
    const instrument = catalog.get(action.symbol);
    const facts = marketFacts(sources, action.symbol);
    if (!instrument || !facts) continue;
    const targetValue = multiply(action.targetQuantity, facts.basePrice);
    const requestedPosition = requestedPositions.get(action.symbol);
    positions.push({
      symbol: action.symbol,
      assetClass: instrument.assetClass,
      currency: instrument.currency,
      targetWeight: isPositive(portfolioValue) ? divide(targetValue, portfolioValue) : ZERO,
      targetValue,
      targetQuantity: action.targetQuantity,
      roundingResidual: requestedPosition
        ? max(subtract(requestedPosition.targetValue, targetValue), ZERO)
        : ZERO,
      reasonCodes: [...new Set([
        ...(requestedPosition?.reasonCodes ?? []),
        "action_adjusted_target",
      ])].sort(),
    });
  }
  const investedValue = sum(positions.map((entry) => entry.targetValue));
  const totalExposure = isPositive(portfolioValue) ? divide(investedValue, portfolioValue) : ZERO;
  const residualCash = max(subtract(portfolioValue, investedValue), ZERO);
  const cashWeight = isPositive(portfolioValue) ? divide(residualCash, portfolioValue) : ONE;
  const assetClasses = new Map<string, CanonicalDecimal>();
  for (const position of positions) {
    assetClasses.set(position.assetClass, add(mapValue(assetClasses, position.assetClass), position.targetWeight));
  }
  const draft: Omit<PortfolioTargetV1, "targetHash"> = {
    contractVersion: requested.contractVersion,
    targetId: requested.targetId,
    inputHash: requested.inputHash,
    positions,
    assetClassWeights: [...assetClasses]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([assetClass, weight]) => ({ assetClass, weight })),
    cashWeight,
    totalExposure,
    residualCash,
  };
  return { ...draft, targetHash: sha256(draft) };
}

function unavailableCost(): CostEstimateV1 {
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
    unavailableComponents: ["instrument_execution_model"],
  };
}

function unavailableLiquidity(quantity: CanonicalDecimal): LiquidityAssessmentV1 {
  if (!isPositive(quantity)) {
    return {
      contractVersion: LIQUIDITY_ASSESSMENT_CONTRACT_VERSION,
      status: "not_required",
      marketability: "not_required",
      requestedQuantity: ZERO,
      estimatedTradableQuantity: ZERO,
      averageDailyVolume: null,
      maxParticipation: null,
      liquidityTier: null,
      estimatedMarketImpact: ZERO,
      sourceAsOf: null,
      explanation: "Hold/no-trade requires no liquidity proof",
    };
  }
  return {
    contractVersion: LIQUIDITY_ASSESSMENT_CONTRACT_VERSION,
    status: "unavailable",
    marketability: "unknown",
    requestedQuantity: quantity,
    estimatedTradableQuantity: null,
    averageDailyVolume: null,
    maxParticipation: null,
    liquidityTier: null,
    estimatedMarketImpact: null,
    sourceAsOf: null,
    explanation: "Instrument execution model is unavailable",
  };
}

function zeroCost(): CostEstimateV1 {
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

function unknownTax(side: "buy" | "sell" | "hold"): TaxAwarenessAssessmentV1 {
  return {
    contractVersion: TAX_AWARENESS_CONTRACT_VERSION,
    status: side === "sell" ? "unknown_basis" : "not_applicable",
    taxLotAvailability: side === "sell" ? "unavailable" : "not_applicable",
    estimatedRealizedGainLoss: null,
    taxableSaleWarning: side === "sell",
    turnoverPreference: side === "sell" ? "prefer_lower" : "neutral",
    explanation: "Instrument tax-lot model is unavailable",
  };
}

function roundedExecutionPrice(
  price: CanonicalDecimal,
  side: "buy" | "sell" | "hold",
  model: ConstructionInstrumentModelV1 | null,
) {
  if (!model?.priceIncrement || side === "hold") return price;
  return side === "buy" ? ceilToIncrement(price, model.priceIncrement) : floorToIncrement(price, model.priceIncrement);
}

function actualCashBudgetInBase(sources: ConstructionEngineInputV1) {
  let value = ZERO;
  for (const cash of sources.canonicalInput.actual.cash) {
    if (!isPositive(cash.available)) continue;
    if (cash.currency === sources.canonicalInput.mandate.baseCurrency) value = add(value, cash.available);
    else {
      const direct = sources.canonicalInput.market.points.find((entry) =>
        (entry.symbol === `${cash.currency}${sources.canonicalInput.mandate.baseCurrency}`
          || entry.symbol === `${cash.currency}_${sources.canonicalInput.mandate.baseCurrency}`)
        && entry.currency === sources.canonicalInput.mandate.baseCurrency,
      );
      if (direct) value = add(value, multiply(cash.available, direct.price));
    }
  }
  const portfolioValue = sources.risk.totalPortfolioValue.value ?? ZERO;
  const minimumCashWeight = findLimit(sources, "cash", null)?.value ?? ZERO;
  const maximumExposure = findLimit(sources, "total_exposure", null)?.value ?? ONE;
  const requiredCashWeight = max(minimumCashWeight, subtract(ONE, maximumExposure));
  const requiredCashValue = multiply(portfolioValue, requiredCashWeight);
  return max(subtract(value, requiredCashValue), ZERO);
}

function buildActions(sources: ConstructionEngineInputV1, target: PortfolioTargetV1) {
  const catalog = new Map(sources.canonicalInput.instrumentCatalog.instruments.map((entry) => [entry.symbol, entry]));
  const models = new Map(sources.model.instruments.map((entry) => [entry.symbol, entry]));
  const actual = new Map(sources.canonicalInput.actual.positions.map((entry) => [entry.symbol, entry]));
  const projected = new Map(sources.canonicalInput.projected.positions.map((entry) => [entry.symbol, entry]));
  const targetPositions = new Map(target.positions.map((entry) => [entry.symbol, entry]));
  const actualWeights = new Map(sources.portfolioState.actual.valuation.positions.map((entry) => [entry.symbol, entry.exposure ?? ZERO]));
  const projectedWeights = new Map(sources.risk.instrumentConcentrations.map((entry) => [entry.subject, entry.weight]));
  const portfolioValue = sources.risk.totalPortfolioValue.value ?? ZERO;
  const symbols = new Set([...actual.keys(), ...projected.keys(), ...targetPositions.keys()]);
  let buyBudget = actualCashBudgetInBase(sources);
  const actions: RebalanceActionV1[] = [];

  for (const symbol of [...symbols].sort()) {
    const instrument = catalog.get(symbol);
    const model = models.get(symbol) ?? null;
    const facts = marketFacts(sources, symbol);
    const currentQuantity = actual.get(symbol)?.quantity ?? ZERO;
    const projectedQuantity = projected.get(symbol)?.quantity ?? ZERO;
    const desiredQuantity = targetPositions.get(symbol)?.targetQuantity ?? ZERO;
    const desiredDelta = subtract(desiredQuantity, projectedQuantity);
    const initialSide: RebalanceActionV1["side"] = compare(desiredDelta, ZERO) > 0
      ? "buy"
      : compare(desiredDelta, ZERO) < 0 ? "sell" : "hold";
    const currentWeight = mapValue(actualWeights, symbol);
    const projectedWeight = mapValue(projectedWeights, symbol);
    const desiredWeight = targetPositions.get(symbol)?.targetWeight ?? ZERO;
    const weightDrift = subtract(desiredWeight, projectedWeight);
    const reasons = ["projected_state_used", `target_drift:${compare(weightDrift, ZERO)}`];
    const explanations = [
      `Current quantity ${currentQuantity}; projected quantity ${projectedQuantity}; desired target quantity ${desiredQuantity}.`,
      `Projected weight ${projectedWeight}; target weight ${desiredWeight}; drift ${weightDrift}.`,
    ];
    const relevantConstraints = sources.constraints
      .filter((entry) => entry.code.includes(symbol) || !entry.code.includes(":"))
      .map((entry) => entry.code)
      .sort();

    if (!instrument || !facts) {
      actions.push({
        contractVersion: REBALANCE_ACTION_CONTRACT_VERSION,
        symbol,
        side: initialSide,
        status: "insufficient_data",
        currentQuantity,
        projectedQuantity,
        targetQuantity: projectedQuantity,
        quantityDelta: ZERO,
        currentWeight,
        projectedWeight,
        targetWeight: projectedWeight,
        weightDrift,
        estimatedPrice: facts?.price ?? ZERO,
        estimatedNotional: ZERO,
        cost: unavailableCost(),
        liquidity: unavailableLiquidity(abs(desiredDelta)),
        taxAwareness: unknownTax(initialSide),
        constraintsApplied: relevantConstraints,
        reasonCodes: [!instrument ? "instrument_catalog_missing" : "market_data_missing"],
        explanation: [...explanations, "Required catalog/market facts are unavailable."],
        rejectedAlternative: "Trade rejected because valuation facts are incomplete",
        confidence: sources.risk.confidence,
        dataQuality: "insufficient",
      });
      continue;
    }
    const increment = model
      ? model.fractionalShares
        ? model.quantityIncrement
        : max(decimal("1"), max(model.quantityIncrement, instrument.lotSize))
      : instrument.lotSize;
    let quantity = floorToIncrement(abs(desiredDelta), increment);
    let side: RebalanceActionV1["side"] = initialSide;
    let targetQuantity = desiredQuantity;
    let status: RebalanceActionV1["status"] = "trade";
    let rejectedAlternative: string | null = null;
    if (!isPositive(quantity) || (model && compare(quantity, model.minimumQuantity) < 0)) {
      quantity = ZERO;
      side = "hold";
      status = "hold";
      targetQuantity = projectedQuantity;
      reasons.push("below_minimum_quantity");
      rejectedAlternative = "Trade quantity is below the deterministic minimum/increment";
    }
    const estimatedPrice = roundedExecutionPrice(facts.price, side, model);
    let notional = multiply(quantity, multiply(estimatedPrice, facts.fx));
    if (isPositive(notional) && compare(notional, instrument.minimumNotional) < 0) {
      quantity = ZERO;
      notional = ZERO;
      side = "hold";
      status = "hold";
      targetQuantity = projectedQuantity;
      reasons.push("below_minimum_notional");
      rejectedAlternative = "Trade notional is below the instrument minimum";
    }

    let cost = model
      ? estimateTransactionCostV1({
          notionalInBase: notional,
          portfolioValueInBase: portfolioValue,
          instrumentCurrency: instrument.currency,
          baseCurrency: sources.canonicalInput.mandate.baseCurrency,
          catalogFeeBps: instrument.feeBps,
          model,
          costBenefitThreshold: sources.model.costBenefitThreshold,
        })
      : isPositive(notional) ? unavailableCost() : estimateTransactionCostV1({
          notionalInBase: ZERO,
          portfolioValueInBase: portfolioValue,
          instrumentCurrency: instrument.currency,
          baseCurrency: sources.canonicalInput.mandate.baseCurrency,
          catalogFeeBps: instrument.feeBps,
          model: {
            symbol,
            fractionalShares: false,
            minimumQuantity: instrument.lotSize,
            quantityIncrement: instrument.lotSize,
            priceIncrement: null,
            commissionBps: instrument.feeBps,
            spreadBps: ZERO,
            slippageBps: ZERO,
            fxCostBps: ZERO,
            minimumFee: ZERO,
            averageDailyVolume: null,
            maxParticipation: null,
            liquidityTier: null,
            marketImpactBps: null,
            liquidityAsOf: null,
            taxLotAvailability: "not_applicable",
          },
          costBenefitThreshold: sources.model.costBenefitThreshold,
        });

    if (side === "buy" && isPositive(quantity) && cost.totalCost !== null) {
      const required = add(notional, cost.totalCost);
      if (compare(required, buyBudget) > 0) {
        const allInRatio = isPositive(notional) ? divide(required, notional) : ONE;
        const affordable = floorToIncrement(divide(buyBudget, multiply(facts.basePrice, allInRatio)), increment);
        quantity = min(quantity, affordable);
        targetQuantity = add(projectedQuantity, quantity);
        notional = multiply(quantity, multiply(estimatedPrice, facts.fx));
        cost = estimateTransactionCostV1({
          notionalInBase: notional,
          portfolioValueInBase: portfolioValue,
          instrumentCurrency: instrument.currency,
          baseCurrency: sources.canonicalInput.mandate.baseCurrency,
          catalogFeeBps: instrument.feeBps,
          model: model!,
          costBenefitThreshold: sources.model.costBenefitThreshold,
        });
        reasons.push("cash_limited_partial_rebalance");
        rejectedAlternative = "Full buy was reduced to preserve factual cash and buffer without sell proceeds";
        if (!isPositive(quantity)) {
          side = "hold";
          status = "hold";
          targetQuantity = projectedQuantity;
          reasons.push("cash_insufficient");
        }
      }
      if (
        !isPositive(quantity)
        || (model && compare(quantity, model.minimumQuantity) < 0)
        || (isPositive(notional) && compare(notional, instrument.minimumNotional) < 0)
      ) {
        quantity = ZERO;
        notional = ZERO;
        side = "hold";
        status = "hold";
        targetQuantity = projectedQuantity;
        reasons.push("cash_insufficient_after_trade_minimums");
        rejectedAlternative = "Affordable size falls below quantity or notional minimum";
        cost = zeroCost();
      }
    }
    if (side === "sell" && compare(quantity, projectedQuantity) > 0) {
      quantity = projectedQuantity;
      targetQuantity = ZERO;
      notional = multiply(quantity, multiply(estimatedPrice, facts.fx));
      reasons.push("oversell_prevented");
    }

    const benefit = estimatedBenefitFromDrift({ drift: abs(weightDrift), portfolioValue });
    if (side !== "hold" && !applyMinimumTradeBenefit(benefit, sources.model.minimumTradeBenefit)) {
      quantity = ZERO;
      notional = ZERO;
      side = "hold";
      status = "hold";
      targetQuantity = projectedQuantity;
      reasons.push("benefit_below_minimum");
      rejectedAlternative = "Estimated drift benefit is below the versioned minimum";
      cost = zeroCost();
    } else if (side !== "hold" && cost.costBenefitStatus === "fail") {
      quantity = ZERO;
      notional = ZERO;
      side = "hold";
      status = "hold";
      status = "hold";
      targetQuantity = projectedQuantity;
      reasons.push("transaction_cost_exceeds_benefit_threshold");
      rejectedAlternative = "Trade cost ratio exceeds the versioned threshold";
    } else if (side !== "hold" && cost.status === "unavailable") {
      status = "insufficient_data";
      reasons.push("transaction_cost_data_unavailable");
    }

    const liquidity = model
      ? assessLiquidityV1({
          requestedQuantity: quantity,
          notionalInBase: notional,
          model,
          asOf: sources.canonicalInput.asOf,
          maxAgeSeconds: sources.model.liquidityMaxAgeSeconds,
        })
      : side === "hold" ? unavailableLiquidity(ZERO) : unavailableLiquidity(quantity);
    if (side !== "hold" && liquidity.status === "insufficient") {
      status = "blocked";
      reasons.push("liquidity_capacity_exceeded");
    } else if (side !== "hold" && (liquidity.status === "unavailable" || liquidity.status === "stale")) {
      status = "insufficient_data";
      reasons.push(liquidity.status === "stale" ? "liquidity_data_stale" : "liquidity_data_unavailable");
    }
    const tax = model
      ? assessTaxAwarenessV1({
          side,
          quantity,
          estimatedPrice,
          costBasis: projected.get(symbol)?.costBasis ?? actual.get(symbol)?.costBasis ?? ZERO,
          fxRateToBase: facts.fx,
          model,
        })
      : unknownTax(side);
    if (tax.status === "unknown_basis" && side === "sell" && status === "trade") {
      reasons.push("tax_basis_unknown");
    }
    if (tax.status === "known_gain") reasons.push("potential_taxable_gain");
    if (tax.status === "known_loss") reasons.push("estimated_realized_loss");
    if (side === "buy" && status === "trade" && cost.totalCost !== null) {
      buyBudget = max(subtract(buyBudget, add(notional, cost.totalCost)), ZERO);
    }

    const effectiveTargetWeight = isPositive(portfolioValue)
      ? divide(multiply(targetQuantity, facts.basePrice), portfolioValue)
      : ZERO;
    explanations.push(`Estimated cost status ${cost.status}; liquidity ${liquidity.status}; tax ${tax.status}.`);
    explanations.push(
      `Concentration risk before ${sources.risk.concentrationRiskScore.value ?? "unknown"}; requested target risk ${targetHhi(target)}.`,
      `Constraints applied: ${relevantConstraints.length > 0 ? relevantConstraints.join(", ") : "none"}.`,
      `Final action ${side}/${status}; reasons ${[...new Set(reasons)].sort().join(", ")}.`,
    );
    actions.push({
      contractVersion: REBALANCE_ACTION_CONTRACT_VERSION,
      symbol,
      side,
      status,
      currentQuantity,
      projectedQuantity,
      targetQuantity,
      quantityDelta: side === "buy" ? quantity : side === "sell" ? subtract(ZERO, quantity) : ZERO,
      currentWeight,
      projectedWeight,
      targetWeight: effectiveTargetWeight,
      weightDrift: subtract(effectiveTargetWeight, projectedWeight),
      estimatedPrice,
      estimatedNotional: notional,
      cost,
      liquidity,
      taxAwareness: tax,
      constraintsApplied: relevantConstraints,
      reasonCodes: [...new Set(reasons)].sort(),
      explanation: explanations,
      rejectedAlternative,
      confidence: sources.risk.confidence,
      dataQuality: status === "insufficient_data"
        ? "insufficient"
        : status === "blocked" || tax.status === "unknown_basis" || sources.envelope.status === "degraded"
          ? "degraded"
          : "good",
    });
  }
  return actions;
}

function targetHardCompliance(sources: ConstructionEngineInputV1, target: PortfolioTargetV1) {
  for (const position of target.positions) {
    if (!sources.envelope.allowedInstruments.includes(position.symbol)) return false;
    const instrumentLimit = findLimit(sources, "instrument", position.symbol);
    if (instrumentLimit?.kind === "hard" && compare(position.targetWeight, instrumentLimit.value) > 0) return false;
  }
  for (const assetClass of target.assetClassWeights) {
    const limit = findLimit(sources, "asset_class", assetClass.assetClass);
    if (limit?.kind === "hard" && compare(assetClass.weight, limit.value) > 0) return false;
  }
  const currencyWeights = new Map<string, CanonicalDecimal>();
  for (const position of target.positions) {
    currencyWeights.set(position.currency, add(mapValue(currencyWeights, position.currency), position.targetWeight));
  }
  for (const [currency, weight] of currencyWeights) {
    const specific = sources.policy.limits.find((limit) => limit.scope === "currency" && limit.subject === currency);
    if (currency === sources.canonicalInput.mandate.baseCurrency && !specific) continue;
    const limit = specific ?? findLimit(sources, "currency", currency);
    if (limit?.kind === "hard" && compare(weight, limit.value) > 0) return false;
  }
  const cashLimit = findLimit(sources, "cash", null);
  if (cashLimit?.kind === "hard" && compare(target.cashWeight, cashLimit.value) < 0) return false;
  const exposureLimit = findLimit(sources, "total_exposure", null);
  if (exposureLimit?.kind === "hard" && compare(target.totalExposure, exposureLimit.value) > 0) return false;
  const riskLimit = findLimit(sources, "risk_score", null);
  if (riskLimit?.kind === "hard" && compare(targetHhi(target), riskLimit.value) > 0) return false;
  return true;
}

function targetHhi(target: PortfolioTargetV1) {
  return sum(target.positions.map((entry) => multiply(entry.targetWeight, entry.targetWeight)));
}

function targetFit(target: PortfolioTargetV1, ideal: PortfolioTargetV1) {
  const targetMap = new Map(target.positions.map((entry) => [entry.symbol, entry.targetWeight]));
  const idealMap = new Map(ideal.positions.map((entry) => [entry.symbol, entry.targetWeight]));
  const symbols = new Set([...targetMap.keys(), ...idealMap.keys()]);
  const distance = add(
    sum([...symbols].map((symbol) => abs(subtract(mapValue(targetMap, symbol), mapValue(idealMap, symbol))))),
    abs(subtract(target.cashWeight, ideal.cashWeight)),
  );
  return max(subtract(ONE, divide(distance, decimal("2"))), ZERO);
}

export function buildConstructionCandidateV1(args: {
  sources: ConstructionEngineInputV1;
  mode: CandidateMode;
  idealWeights: WeightMap;
  idealTarget: PortfolioTargetV1;
}): ConstructionCandidateV1 {
  const weights = blendedWeights(args.sources, args.idealWeights, args.mode);
  const targetResult = targetFromWeights(args.sources, args.mode, weights);
  const actions = buildActions(args.sources, targetResult.target);
  const target = targetFromActions(args.sources, targetResult.target, actions);
  const targetCompliant = targetHardCompliance(args.sources, target) && !targetResult.impossible;
  const hasBlockedAction = actions.some((action) => action.status === "blocked");
  const hasUnknownAction = actions.some((action) => action.status === "insufficient_data");
  const hardCompliance: ConstructionEvaluationV1["hardConstraintCompliance"] = !targetCompliant || hasBlockedAction
    ? "fail"
    : hasUnknownAction ? "unknown" : "pass";
  const costStatus = actions.some((action) => action.cost.costBenefitStatus === "fail")
    ? "fail"
    : actions.some((action) => action.cost.costBenefitStatus === "unknown") ? "unknown" : "pass";
  const liquidityStatus = actions.some((action) => action.liquidity.status === "insufficient")
    ? "fail"
    : actions.some((action) => action.liquidity.status === "unavailable" || action.liquidity.status === "stale")
      ? "unknown" : "pass";
  const taxStatus = actions.some((action) => action.taxAwareness.status === "unknown_basis")
    ? "unknown"
    : actions.some((action) => action.side === "sell") ? "known" : "not_applicable";
  const turnoverValue = sum(actions.map((action) => action.estimatedNotional));
  const portfolioValue = args.sources.risk.totalPortfolioValue.value ?? ZERO;
  const turnover = isPositive(portfolioValue) ? divide(turnoverValue, portfolioValue) : ZERO;
  const currentRisk = args.sources.risk.concentrationRiskScore.value ?? ZERO;
  const riskImprovement = max(subtract(currentRisk, targetHhi(target)), ZERO);
  const diversification = max(subtract(ONE, targetHhi(target)), ZERO);
  const dataQuality = hardCompliance === "unknown" || costStatus === "unknown" || liquidityStatus === "unknown"
    ? "insufficient"
    : taxStatus === "unknown" || args.sources.envelope.status === "degraded" || costStatus === "fail"
      ? "degraded" : "good";
  const rankReasons = [
    targetCompliant ? "hard_constraints_satisfied" : "hard_constraints_failed",
    isPositive(riskImprovement) ? "risk_improves" : "risk_not_improved",
    costStatus === "pass" ? "cost_threshold_pass" : `cost_${costStatus}`,
    liquidityStatus === "pass" ? "liquidity_pass" : `liquidity_${liquidityStatus}`,
    taxStatus === "unknown" ? "tax_basis_unknown" : taxStatus === "known" ? "tax_effect_known" : "tax_not_applicable",
    ...targetResult.reasonCodes,
  ];
  if (actions.some((action) => action.taxAwareness.status === "known_gain")) {
    rankReasons.push("taxable_gain_prefer_lower_turnover");
  }
  const evaluation: ConstructionEvaluationV1 = {
    contractVersion: CONSTRUCTION_EVALUATION_CONTRACT_VERSION,
    hardConstraintCompliance: hardCompliance,
    riskImprovement,
    targetFit: targetFit(target, args.idealTarget),
    diversification,
    costStatus,
    liquidityStatus,
    turnover,
    taxStatus,
    residualCash: target.residualCash,
    dataQuality,
    rankReasonCodes: [...new Set(rankReasons)].sort(),
  };
  const state: ConstructionCandidateV1["state"] = hardCompliance === "fail" || liquidityStatus === "fail"
    ? "blocked"
    : hardCompliance === "unknown" || costStatus === "unknown" || liquidityStatus === "unknown"
      ? "insufficient_data"
      : dataQuality === "degraded" ? "degraded" : "feasible";
  const draft: Omit<ConstructionCandidateV1, "candidateHash"> = {
    contractVersion: CONSTRUCTION_CANDIDATE_CONTRACT_VERSION,
    candidateId: `candidate:${args.mode}:${args.sources.canonicalInput.inputHash.slice(0, 16)}`,
    mode: args.mode,
    state,
    target,
    actions,
    evaluation,
  };
  return { ...draft, candidateHash: sha256(draft) };
}

export function buildConstructionCandidatesV1(sources: ConstructionEngineInputV1) {
  const ideal = idealWeights(sources);
  const idealTargetResult = targetFromWeights(sources, "full_rebalance", ideal.allocations);
  const candidates = (["hold", "partial_rebalance", "full_rebalance"] as const).map((mode) =>
    buildConstructionCandidateV1({
      sources,
      mode,
      idealWeights: ideal.allocations,
      idealTarget: idealTargetResult.target,
    }),
  );
  return {
    candidates,
    targetImpossible: idealTargetResult.impossible
      || (isPositive(ideal.desiredExposure) && !isPositive(sum([...ideal.allocations.values()]))),
    targetReasonCodes: idealTargetResult.reasonCodes,
  };
}

function statePriority(state: ConstructionCandidateV1["state"]) {
  return state === "feasible" ? 0 : state === "degraded" ? 1 : state === "insufficient_data" ? 2 : 3;
}

export function rankConstructionCandidatesV1(candidates: readonly ConstructionCandidateV1[]) {
  return [...candidates].sort((left, right) => {
    const state = statePriority(left.state) - statePriority(right.state);
    if (state !== 0) return state;
    const leftImproves = isPositive(left.evaluation.riskImprovement);
    const rightImproves = isPositive(right.evaluation.riskImprovement);
    if (leftImproves !== rightImproves) return leftImproves ? -1 : 1;
    const taxSensitive = left.evaluation.rankReasonCodes.includes("taxable_gain_prefer_lower_turnover")
      || right.evaluation.rankReasonCodes.includes("taxable_gain_prefer_lower_turnover");
    if (taxSensitive) {
      const turnover = compare(left.evaluation.turnover, right.evaluation.turnover);
      if (turnover !== 0) return turnover;
    }
    const fit = compare(right.evaluation.targetFit, left.evaluation.targetFit);
    if (fit !== 0) return fit;
    const cost = compare(left.evaluation.turnover, right.evaluation.turnover);
    if (cost !== 0) return cost;
    return left.candidateId.localeCompare(right.candidateId);
  });
}
