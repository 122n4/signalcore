import {
  canonicalDecimalFromString,
  canonicalJsonStringify,
  deepFreezeCanonical,
  normalizeIsoTimestamp,
  type CanonicalDecimal,
} from "@/lib/investing/engine/v1/canonical";
import type {
  CanonicalInstrumentCatalogSnapshotV1,
  CanonicalMarketPointV1,
  CanonicalMarketSnapshotV1,
  CanonicalPortfolioStateV1,
  InvestingQualityIssueV1,
} from "@/lib/investing/engine/v1/contracts";
import {
  DECIMAL_ONE,
  DECIMAL_ZERO,
  decimalAdd,
  decimalCompare,
  decimalDivide,
  decimalEquals,
  decimalIsNegative,
  decimalIsPositive,
  decimalMax,
  decimalMin,
  decimalMultiply,
  decimalSubtract,
  decimalSum,
} from "@/lib/investing/engine/v1/phase3c/decimalMath";
import { getInvestingOrderStateSemanticsV1 } from "@/lib/investing/engine/v1/phase3c/orderSemantics";
import type {
  InvestingAccountSourceV1,
  InvestingFillSourceV1,
  InvestingFinancialReadModelV1,
  NormalizedInvestingAuthoringV1,
  OrderEconomicEffectV1,
  PortfolioStateDerivationV1,
  PortfolioValuationLineV1,
  PortfolioValuationV1,
  ReservedCashStateV1,
  ReservedPositionStateV1,
} from "@/lib/investing/engine/v1/phase3c/types";

const SYMBOL_PATTERN = /^[A-Z0-9][A-Z0-9._-]{0,31}$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;

type MutableIssue = InvestingQualityIssueV1;

export type PortfolioStateEngineArgsV1 = {
  readonly account: InvestingAccountSourceV1;
  readonly financial: InvestingFinancialReadModelV1;
  readonly instrumentCatalog: CanonicalInstrumentCatalogSnapshotV1;
  readonly market: CanonicalMarketSnapshotV1;
  readonly authoring: NormalizedInvestingAuthoringV1;
  readonly asOf: string;
  readonly initialIssues?: readonly InvestingQualityIssueV1[];
};

function addIssue(
  issues: MutableIssue[],
  asOf: string,
  code: string,
  severity: "warning" | "error",
  domain: string,
  message: string,
) {
  issues.push({ code, severity, domain, message, observedAt: asOf });
}

function normalizeFinancialDecimal(
  value: unknown,
  issues: MutableIssue[],
  asOf: string,
  code: string,
  domain: string,
): CanonicalDecimal {
  try {
    if (typeof value !== "string") throw new Error("financial_string_required");
    return canonicalDecimalFromString(value);
  } catch {
    addIssue(issues, asOf, code, "error", domain, "Invalid financial decimal was replaced by zero and blocked");
    return DECIMAL_ZERO;
  }
}

function deterministicUnique<T>(
  rows: readonly T[],
  keyOf: (row: T) => string,
  duplicateCode: string,
  domain: string,
  issues: MutableIssue[],
  asOf: string,
): T[] {
  const sorted = [...rows].sort((left, right) => {
    const keyCompare = keyOf(left).localeCompare(keyOf(right));
    if (keyCompare !== 0) return keyCompare;
    return canonicalJsonStringify(left).localeCompare(canonicalJsonStringify(right));
  });
  const output: T[] = [];
  let previousKey: string | null = null;
  for (const row of sorted) {
    const key = keyOf(row);
    if (key === previousKey) {
      addIssue(issues, asOf, duplicateCode, "error", domain, `Duplicate source key ${key} was ignored`);
      continue;
    }
    previousKey = key;
    output.push(row);
  }
  return output;
}

function dedupeIssues(issues: readonly InvestingQualityIssueV1[]) {
  const sorted = [...issues].sort((left, right) => {
    const a = `${left.severity}:${left.code}:${left.domain}:${left.message}:${left.observedAt ?? ""}`;
    const b = `${right.severity}:${right.code}:${right.domain}:${right.message}:${right.observedAt ?? ""}`;
    return a.localeCompare(b);
  });
  return sorted.filter((entry, index) => index === 0 || canonicalJsonStringify(entry) !== canonicalJsonStringify(sorted[index - 1]));
}

function getUniqueFills(
  fills: readonly InvestingFillSourceV1[],
  issues: MutableIssue[],
  asOf: string,
) {
  const bySemanticId = new Map<string, InvestingFillSourceV1>();
  for (const fill of [...fills].sort((a, b) => {
    const key = a.semanticFillId.localeCompare(b.semanticFillId);
    return key || canonicalJsonStringify(a).localeCompare(canonicalJsonStringify(b));
  })) {
    const existing = bySemanticId.get(fill.semanticFillId);
    if (!existing) {
      bySemanticId.set(fill.semanticFillId, fill);
      continue;
    }
    const same = canonicalJsonStringify(existing) === canonicalJsonStringify(fill);
    addIssue(
      issues,
      asOf,
      same ? "duplicate_semantic_fill" : "duplicate_semantic_fill_conflict",
      same ? "warning" : "error",
      "fills",
      `Semantic fill ${fill.semanticFillId} occurred more than once and was counted once`,
    );
  }
  return [...bySemanticId.values()];
}

function isOlderThan(asOf: string, observedAt: string, seconds: CanonicalDecimal) {
  const asOfMs = new Date(asOf).getTime();
  const observedMs = new Date(observedAt).getTime();
  const maximumAgeMs = BigInt(seconds) * BigInt(1000);
  return BigInt(asOfMs - observedMs) > maximumAgeMs;
}

function pointIsUsable(
  point: CanonicalMarketPointV1,
  asOf: string,
  maxAge: CanonicalDecimal,
  issues: MutableIssue[],
  domain: string,
) {
  if (new Date(point.providerAsOf).getTime() > new Date(asOf).getTime()) {
    addIssue(issues, asOf, "market_timestamp_future", "error", domain, `${point.symbol} is dated after asOf`);
  }
  if (isOlderThan(asOf, point.providerAsOf, maxAge)) {
    addIssue(issues, asOf, "market_price_stale", "warning", domain, `${point.symbol} exceeds the versioned staleness limit`);
  }
  if (point.quality === "degraded") {
    addIssue(issues, asOf, "market_point_degraded", "warning", domain, `${point.symbol} is marked degraded`);
  }
  if (point.quality === "insufficient") {
    addIssue(issues, asOf, "market_point_insufficient", "error", domain, `${point.symbol} is marked insufficient`);
  }
}

function findFxRate(
  fromCurrency: string,
  baseCurrency: string,
  marketBySymbol: ReadonlyMap<string, CanonicalMarketPointV1>,
  asOf: string,
  maxAge: CanonicalDecimal,
  issues: MutableIssue[],
): CanonicalDecimal | null {
  if (fromCurrency === baseCurrency) return DECIMAL_ONE;
  const direct = marketBySymbol.get(`${fromCurrency}${baseCurrency}`)
    ?? marketBySymbol.get(`${fromCurrency}_${baseCurrency}`);
  if (direct && direct.currency === baseCurrency) {
    pointIsUsable(direct, asOf, maxAge, issues, "fx");
    return direct.price;
  }
  const inverse = marketBySymbol.get(`${baseCurrency}${fromCurrency}`)
    ?? marketBySymbol.get(`${baseCurrency}_${fromCurrency}`);
  if (inverse && inverse.currency === fromCurrency && decimalIsPositive(inverse.price)) {
    pointIsUsable(inverse, asOf, maxAge, issues, "fx");
    return decimalDivide(DECIMAL_ONE, inverse.price);
  }
  addIssue(issues, asOf, "market_fx_missing", "error", "fx", `No sealed FX rate from ${fromCurrency} to ${baseCurrency}`);
  return null;
}

function valuePortfolio(
  state: CanonicalPortfolioStateV1,
  baseCurrency: string,
  catalog: CanonicalInstrumentCatalogSnapshotV1,
  market: CanonicalMarketSnapshotV1,
  maxAge: CanonicalDecimal,
  asOf: string,
  issues: MutableIssue[],
): PortfolioValuationV1 {
  const catalogBySymbol = new Map(catalog.instruments.map((instrument) => [instrument.symbol, instrument]));
  const marketBySymbol = new Map(market.points.map((point) => [point.symbol, point]));
  let cashComplete = true;
  let cashValue = DECIMAL_ZERO;
  for (const cash of state.cash) {
    const cashTotal = decimalAdd(cash.available, cash.reserved);
    if (!decimalIsPositive(cashTotal)) continue;
    const fx = findFxRate(cash.currency, baseCurrency, marketBySymbol, asOf, maxAge, issues);
    if (fx === null) {
      cashComplete = false;
    } else {
      cashValue = decimalAdd(cashValue, decimalMultiply(cashTotal, fx));
    }
  }

  let positionsComplete = true;
  const unweighted: PortfolioValuationLineV1[] = [];
  let positionValue = DECIMAL_ZERO;
  for (const position of state.positions) {
    const availableQuantity = decimalSubtract(position.quantity, position.reservedQuantity);
    const instrument = catalogBySymbol.get(position.symbol);
    if (!instrument) {
      addIssue(issues, asOf, "instrument_catalog_missing", "error", "catalog", `${position.symbol} is absent from the sealed catalog`);
    } else if (instrument.currency !== position.currency) {
      addIssue(issues, asOf, "instrument_currency_mismatch", "error", "catalog", `${position.symbol} currency differs from the catalog`);
    }
    const point = marketBySymbol.get(position.symbol);
    if (!point) {
      addIssue(issues, asOf, "market_price_missing", "error", "market", `${position.symbol} has no price in the sealed snapshot`);
      positionsComplete = false;
      unweighted.push({
        symbol: position.symbol,
        currency: position.currency,
        quantity: position.quantity,
        availableQuantity,
        marketPrice: null,
        fxRateToBase: null,
        marketValue: null,
        baseMarketValue: null,
        exposure: null,
      });
      continue;
    }
    pointIsUsable(point, asOf, maxAge, issues, "market");
    if (point.currency !== position.currency) {
      addIssue(issues, asOf, "market_currency_mismatch", "error", "market", `${position.symbol} price currency differs from the position`);
    }
    const fx = findFxRate(position.currency, baseCurrency, marketBySymbol, asOf, maxAge, issues);
    const marketValue = decimalMultiply(position.quantity, point.price);
    const baseMarketValue = fx === null ? null : decimalMultiply(marketValue, fx);
    if (baseMarketValue === null) {
      positionsComplete = false;
    } else {
      positionValue = decimalAdd(positionValue, baseMarketValue);
    }
    unweighted.push({
      symbol: position.symbol,
      currency: position.currency,
      quantity: position.quantity,
      availableQuantity,
      marketPrice: point.price,
      fxRateToBase: fx,
      marketValue,
      baseMarketValue,
      exposure: null,
    });
  }

  const complete = cashComplete && positionsComplete;
  const total = complete ? decimalAdd(cashValue, positionValue) : null;
  const positions = unweighted.map((line) => ({
    ...line,
    exposure: line.baseMarketValue === null || total === null || !decimalIsPositive(total)
      ? null
      : decimalDivide(line.baseMarketValue, total),
  }));
  return {
    baseCurrency,
    cashValueInBase: cashComplete ? cashValue : null,
    positionValueInBase: positionsComplete ? positionValue : null,
    totalValueInBase: total,
    positions,
  };
}

function orderEffects(
  account: InvestingAccountSourceV1,
  financial: InvestingFinancialReadModelV1,
  market: CanonicalMarketSnapshotV1,
  orderStaleAfterSeconds: CanonicalDecimal,
  asOf: string,
  issues: MutableIssue[],
) {
  const scopedOrders = financial.orders.filter((order) => order.accountId === account.accountId);
  for (const order of scopedOrders) {
    if (order.userId !== account.userId || order.portfolioId !== account.portfolioId) {
      throw new Error("investing_input_order_ownership_mismatch");
    }
  }
  const uniqueOrders = deterministicUnique(
    scopedOrders,
    (order) => order.semanticOrderId,
    "duplicated_semantic_order",
    "orders",
    issues,
    asOf,
  );
  const orderIds = new Set(uniqueOrders.map((order) => order.orderId));
  if (orderIds.size !== uniqueOrders.length) {
    addIssue(issues, asOf, "duplicated_order_id", "error", "orders", "An order id represents multiple semantic orders");
  }

  const fills = getUniqueFills(financial.fills, issues, asOf);
  for (const fill of fills) {
    if (!orderIds.has(fill.orderId)) {
      addIssue(issues, asOf, "orphan_fill", "error", "fills", `Fill ${fill.fillId} has no unique source order`);
    }
  }
  const fillsByOrder = new Map<string, InvestingFillSourceV1[]>();
  for (const fill of fills) {
    const list = fillsByOrder.get(fill.orderId) ?? [];
    list.push(fill);
    fillsByOrder.set(fill.orderId, list);
  }
  const marketBySymbol = new Map(market.points.map((point) => [point.symbol, point]));

  return uniqueOrders.map((order): OrderEconomicEffectV1 => {
    const domain = `order_${order.orderId}`;
    if (!SYMBOL_PATTERN.test(order.symbol)) {
      addIssue(issues, asOf, "order_symbol_invalid", "error", domain, "Order symbol is invalid");
    }
    if (!CURRENCY_PATTERN.test(order.currency)) {
      addIssue(issues, asOf, "order_currency_invalid", "error", domain, "Order currency is invalid");
    }
    const quantity = normalizeFinancialDecimal(order.quantity, issues, asOf, "order_quantity_invalid", domain);
    const reportedFilled = normalizeFinancialDecimal(
      order.cumulativeFilledQuantity,
      issues,
      asOf,
      "order_filled_quantity_invalid",
      domain,
    );
    const persistedReservedCash = normalizeFinancialDecimal(
      order.persistedReservedCash,
      issues,
      asOf,
      "order_reserved_cash_invalid",
      domain,
    );
    const persistedReservedQuantity = normalizeFinancialDecimal(
      order.persistedReservedQuantity,
      issues,
      asOf,
      "order_reserved_quantity_invalid",
      domain,
    );
    const fee = order.estimatedFeeRemaining === null
      ? DECIMAL_ZERO
      : normalizeFinancialDecimal(order.estimatedFeeRemaining, issues, asOf, "order_fee_invalid", domain);
    if (!decimalIsPositive(quantity)) {
      addIssue(issues, asOf, "order_notional_or_quantity_insufficient", "error", domain, "Order quantity must be positive");
    }
    if (decimalIsNegative(reportedFilled)) {
      addIssue(issues, asOf, "order_filled_quantity_invalid", "error", domain, "Cumulative fill cannot be negative");
    }

    const fillQuantity = decimalSum((fillsByOrder.get(order.orderId) ?? []).map((fill) =>
      normalizeFinancialDecimal(fill.quantity, issues, asOf, "fill_quantity_invalid", `fill_${fill.fillId}`),
    ));
    if (decimalIsPositive(fillQuantity) && !decimalEquals(fillQuantity, reportedFilled)) {
      addIssue(issues, asOf, "order_cumulative_fill_conflict", "error", domain, "Unique fills disagree with cumulative filled quantity");
    }
    const effectiveFilledUncapped = decimalMax(reportedFilled, fillQuantity);
    if (decimalCompare(effectiveFilledUncapped, quantity) > 0) {
      addIssue(issues, asOf, "fill_exceeds_order_quantity", "error", domain, "Cumulative fill exceeds order quantity");
    }
    const effectiveFilled = decimalMin(decimalMax(effectiveFilledUncapped, DECIMAL_ZERO), decimalMax(quantity, DECIMAL_ZERO));
    const semantics = getInvestingOrderStateSemanticsV1(order.status);
    if (!semantics) {
      addIssue(issues, asOf, "order_state_unknown", "error", domain, `Unknown order state ${order.status}`);
    }

    let updatedAt = asOf;
    try {
      updatedAt = normalizeIsoTimestamp(order.updatedAt);
    } catch {
      addIssue(issues, asOf, "order_timestamp_invalid", "error", domain, "Order timestamp is invalid or ambiguous");
    }
    if (semantics && !semantics.terminal && isOlderThan(asOf, updatedAt, orderStaleAfterSeconds)) {
      addIssue(issues, asOf, "order_state_stale", "warning", domain, "Non-terminal order exceeds the versioned staleness limit");
    }
    if (semantics?.ambiguity === "degraded") {
      addIssue(issues, asOf, "order_state_reconciling_ambiguous", "warning", domain, "Reconciling order remains conservatively committed");
    }
    if (order.status === "proposed" && decimalIsPositive(effectiveFilled)) {
      addIssue(issues, asOf, "order_state_contradictory", "error", domain, "Proposed order cannot contain fills");
    }
    if ((order.status === "submission_failed" || order.status === "rejected") && decimalIsPositive(effectiveFilled)) {
      addIssue(issues, asOf, "order_state_contradictory", "error", domain, "Failed or rejected order cannot contain fills");
    }
    if (order.status === "filled" && !decimalEquals(effectiveFilled, quantity)) {
      addIssue(issues, asOf, "order_state_contradictory", "error", domain, "Filled order must have its full quantity filled");
    }

    const terminal = semantics?.terminal ?? false;
    const rawRemaining = decimalSubtract(quantity, effectiveFilled);
    const remaining = terminal || decimalIsNegative(rawRemaining) ? DECIMAL_ZERO : rawRemaining;
    if (order.status === "partially_filled" && (!decimalIsPositive(effectiveFilled) || !decimalIsPositive(remaining))) {
      addIssue(issues, asOf, "order_state_contradictory", "error", domain, "Partially filled order requires both filled and remaining quantity");
    }

    let unitPrice = DECIMAL_ZERO;
    if (order.unitPrice !== null) {
      unitPrice = normalizeFinancialDecimal(order.unitPrice, issues, asOf, "order_unit_price_invalid", domain);
    } else {
      const point = marketBySymbol.get(order.symbol);
      if (point && point.currency === order.currency) unitPrice = point.price;
    }
    if (semantics?.entersProjected && (!decimalIsPositive(unitPrice) || !decimalIsPositive(remaining))) {
      addIssue(issues, asOf, "order_notional_or_quantity_insufficient", "error", domain, "Pending order lacks a positive remainder or sealed unit price");
    }

    const notional = decimalMultiply(remaining, unitPrice);
    const buyCommitment = decimalAdd(notional, fee);
    const sellProceeds = decimalMax(decimalSubtract(notional, fee), DECIMAL_ZERO);
    const entersReserved = semantics?.entersReserved ?? false;
    const entersProjected = semantics?.entersProjected ?? false;
    const economicReservedCash = entersReserved && order.side === "buy" ? buyCommitment : DECIMAL_ZERO;
    const economicReservedQuantity = entersReserved && order.side === "sell" ? remaining : DECIMAL_ZERO;
    const projectedCashDelta = !entersProjected
      ? DECIMAL_ZERO
      : order.side === "buy"
        ? decimalSubtract(DECIMAL_ZERO, buyCommitment)
        : sellProceeds;
    const projectedQuantityDelta = !entersProjected
      ? DECIMAL_ZERO
      : order.side === "buy"
        ? remaining
        : decimalSubtract(DECIMAL_ZERO, remaining);

    if (!entersReserved && (decimalIsPositive(persistedReservedCash) || decimalIsPositive(persistedReservedQuantity))) {
      addIssue(issues, asOf, "inconsistent_persisted_reservation", "error", domain, "Non-reserving order retains a persisted reservation");
    }
    if (entersReserved) {
      const expected = order.side === "buy" ? economicReservedCash : economicReservedQuantity;
      const persisted = order.side === "buy" ? persistedReservedCash : persistedReservedQuantity;
      if (!decimalEquals(expected, persisted)) {
        addIssue(issues, asOf, "inconsistent_persisted_reservation", "error", domain, "Order reservation differs from its economic remainder");
      }
    }

    return {
      orderId: order.orderId,
      semanticOrderId: order.semanticOrderId,
      sourceState: order.status,
      terminal,
      entersReserved,
      entersProjected,
      remainingQuantity: remaining,
      effectiveFilledQuantity: effectiveFilled,
      economicReservedCash,
      economicReservedQuantity,
      persistedReservedCash,
      persistedReservedQuantity,
      estimatedFeeRemaining: fee,
      projectedCashDelta,
      projectedQuantityDelta,
      canonicalPendingOrder: semantics?.canonicalPendingStatus && entersProjected
        ? {
            orderId: order.orderId,
            symbol: order.symbol,
            side: order.side,
            status: semantics.canonicalPendingStatus,
            quantity,
            cumulativeFilledQuantity: effectiveFilled,
            reservedCash: economicReservedCash,
            reservedQuantity: economicReservedQuantity,
            currency: order.currency,
          }
        : null,
    };
  });
}

export function buildPortfolioStateV1(args: PortfolioStateEngineArgsV1): PortfolioStateDerivationV1 {
  const asOf = normalizeIsoTimestamp(args.asOf);
  const issues: MutableIssue[] = [...(args.initialIssues ?? [])];
  const account = args.account;
  const cashSources = deterministicUnique(
    args.financial.cashBalances.filter((cash) => cash.accountId === account.accountId),
    (cash) => cash.currency,
    "cash_currency_duplicate",
    "cash",
    issues,
    asOf,
  );
  const positionSources = deterministicUnique(
    args.financial.positions.filter((position) => position.accountId === account.accountId),
    (position) => position.symbol,
    "position_symbol_duplicate",
    "positions",
    issues,
    asOf,
  );

  const actualCash = cashSources.flatMap((cash): CanonicalPortfolioStateV1["cash"][number][] => {
    if (!CURRENCY_PATTERN.test(cash.currency)) {
      addIssue(issues, asOf, "cash_currency_invalid", "error", "cash", `Invalid cash currency ${cash.currency}`);
      return [];
    }
    const available = normalizeFinancialDecimal(cash.available, issues, asOf, "cash_available_invalid", `cash_${cash.currency}`);
    const settled = normalizeFinancialDecimal(cash.settled, issues, asOf, "cash_settled_invalid", `cash_${cash.currency}`);
    const reserved = normalizeFinancialDecimal(cash.reserved, issues, asOf, "cash_reserved_invalid", `cash_${cash.currency}`);
    if (decimalIsNegative(available) || decimalIsNegative(settled) || decimalIsNegative(reserved)) {
      addIssue(issues, asOf, "cash_negative", "error", "cash", `${cash.currency} contains a negative cash component`);
    }
    return [{ currency: cash.currency, available, settled, reserved }];
  });

  const actualPositions = positionSources.flatMap((position): CanonicalPortfolioStateV1["positions"][number][] => {
    if (!SYMBOL_PATTERN.test(position.symbol) || !CURRENCY_PATTERN.test(position.currency)) {
      addIssue(issues, asOf, "position_identity_invalid", "error", "positions", `Invalid position identity ${position.symbol}`);
      return [];
    }
    const quantity = normalizeFinancialDecimal(position.quantity, issues, asOf, "position_quantity_invalid", `position_${position.symbol}`);
    const reservedQuantity = normalizeFinancialDecimal(
      position.reservedQuantity,
      issues,
      asOf,
      "position_reserved_quantity_invalid",
      `position_${position.symbol}`,
    );
    const costBasis = normalizeFinancialDecimal(position.costBasis, issues, asOf, "position_cost_basis_invalid", `position_${position.symbol}`);
    if (decimalIsNegative(quantity) || decimalIsNegative(reservedQuantity)) {
      addIssue(issues, asOf, "position_quantity_invalid", "error", "positions", `${position.symbol} contains a negative quantity`);
    }
    if (decimalCompare(reservedQuantity, quantity) > 0) {
      addIssue(issues, asOf, "reservation_exceeds_resource", "error", "positions", `${position.symbol} persisted reservation exceeds quantity`);
    }
    return [{ symbol: position.symbol, quantity, reservedQuantity, costBasis, currency: position.currency }];
  });

  const actual: CanonicalPortfolioStateV1 = {
    stateVersion: "actual/v1",
    cash: actualCash,
    positions: actualPositions,
  };
  const effects = orderEffects(
    account,
    args.financial,
    args.market,
    args.authoring.settings.orderStaleAfterSeconds,
    asOf,
    issues,
  );

  const actualCashByCurrency = new Map(actualCash.map((cash) => [cash.currency, cash]));
  const cashCurrencies = new Set([
    ...actualCash.map((cash) => cash.currency),
    ...effects.filter((effect) => effect.entersProjected).map((effect) => {
      const order = args.financial.orders.find((candidate) => candidate.orderId === effect.orderId);
      return order?.currency ?? account.baseCurrency;
    }),
  ]);
  const reservedCash: ReservedCashStateV1[] = [];
  const projectedCash: CanonicalPortfolioStateV1["cash"][number][] = [];
  for (const currency of [...cashCurrencies].sort()) {
    const actualEntry = actualCashByCurrency.get(currency);
    const relevant = effects.filter((effect) => {
      const source = args.financial.orders.find((order) => order.orderId === effect.orderId);
      return source?.currency === currency && effect.entersReserved && source.side === "buy";
    });
    const sells = effects.filter((effect) => {
      const source = args.financial.orders.find((order) => order.orderId === effect.orderId);
      return source?.currency === currency && effect.entersProjected && source.side === "sell";
    });
    const persistedBalance = actualEntry?.reserved ?? DECIMAL_ZERO;
    const persistedOrders = decimalSum(relevant.map((effect) => effect.persistedReservedCash));
    const economic = decimalSum(relevant.map((effect) => effect.economicReservedCash));
    const fees = decimalSum(relevant.map((effect) => effect.estimatedFeeRemaining));
    const effective = decimalMax(decimalMax(persistedBalance, persistedOrders), economic);
    if (!decimalEquals(persistedBalance, persistedOrders) || !decimalEquals(persistedOrders, economic)) {
      addIssue(issues, asOf, "inconsistent_persisted_reservation", "error", "cash", `${currency} aggregate reservations disagree`);
    }
    const totalResource = decimalAdd(actualEntry?.available ?? DECIMAL_ZERO, persistedBalance);
    if (decimalCompare(effective, totalResource) > 0) {
      addIssue(issues, asOf, "reservation_exceeds_resource", "error", "cash", `${currency} buy commitment exceeds current cash resource`);
    }
    if (!actualEntry && (decimalIsPositive(effective) || sells.length > 0)) {
      addIssue(issues, asOf, "cash_balance_missing_for_order", "error", "cash", `${currency} has order effects but no cash balance`);
    }
    const sellCredits = decimalSum(sells.map((effect) => effect.projectedCashDelta));
    const projectedAvailable = decimalAdd(decimalSubtract(totalResource, effective), sellCredits);
    if (decimalIsNegative(projectedAvailable)) {
      addIssue(issues, asOf, "projected_cash_negative", "error", "cash", `${currency} projected cash is negative`);
    }
    reservedCash.push({
      currency,
      persisted: persistedBalance,
      economic,
      effective,
      fees,
      orderIds: relevant.map((effect) => effect.orderId).sort(),
    });
    projectedCash.push({
      currency,
      available: projectedAvailable,
      settled: actualEntry?.settled ?? DECIMAL_ZERO,
      reserved: DECIMAL_ZERO,
    });
  }

  const actualPositionsBySymbol = new Map(actualPositions.map((position) => [position.symbol, position]));
  const sourceOrderById = new Map(args.financial.orders.map((order) => [order.orderId, order]));
  const positionSymbols = new Set([
    ...actualPositions.map((position) => position.symbol),
    ...effects.filter((effect) => effect.entersProjected).map((effect) => sourceOrderById.get(effect.orderId)?.symbol ?? ""),
  ]);
  positionSymbols.delete("");
  const catalogBySymbol = new Map(args.instrumentCatalog.instruments.map((instrument) => [instrument.symbol, instrument]));
  const reservedPositions: ReservedPositionStateV1[] = [];
  const projectedPositions: CanonicalPortfolioStateV1["positions"][number][] = [];
  for (const symbol of [...positionSymbols].sort()) {
    const actualEntry = actualPositionsBySymbol.get(symbol);
    const relevant = effects.filter((effect) => {
      const source = sourceOrderById.get(effect.orderId);
      return source?.symbol === symbol && effect.entersReserved && source.side === "sell";
    });
    const buys = effects.filter((effect) => {
      const source = sourceOrderById.get(effect.orderId);
      return source?.symbol === symbol && effect.entersProjected && source.side === "buy";
    });
    const symbolOrders = effects.filter((effect) => sourceOrderById.get(effect.orderId)?.symbol === symbol);
    const currencies = new Set(symbolOrders.map((effect) => sourceOrderById.get(effect.orderId)?.currency).filter(Boolean));
    if (actualEntry) currencies.add(actualEntry.currency);
    if (currencies.size > 1) {
      addIssue(issues, asOf, "order_currency_mismatch", "error", "orders", `${symbol} orders and position use different currencies`);
    }
    const persistedPosition = actualEntry?.reservedQuantity ?? DECIMAL_ZERO;
    const persistedOrders = decimalSum(relevant.map((effect) => effect.persistedReservedQuantity));
    const economic = decimalSum(relevant.map((effect) => effect.economicReservedQuantity));
    const effective = decimalMax(decimalMax(persistedPosition, persistedOrders), economic);
    if (!decimalEquals(persistedPosition, persistedOrders) || !decimalEquals(persistedOrders, economic)) {
      addIssue(issues, asOf, "inconsistent_persisted_reservation", "error", "positions", `${symbol} aggregate reservations disagree`);
    }
    const quantity = actualEntry?.quantity ?? DECIMAL_ZERO;
    if (decimalCompare(effective, quantity) > 0) {
      addIssue(issues, asOf, "reservation_exceeds_resource", "error", "positions", `${symbol} sell commitment exceeds current quantity`);
    }
    const buyQuantity = decimalSum(buys.map((effect) => effect.remainingQuantity));
    const projectedQuantity = decimalAdd(decimalSubtract(quantity, effective), buyQuantity);
    if (decimalIsNegative(projectedQuantity)) {
      addIssue(issues, asOf, "projected_quantity_negative", "error", "positions", `${symbol} projected quantity is negative`);
    }
    const orderCurrency = symbolOrders.map((effect) => sourceOrderById.get(effect.orderId)?.currency).find(Boolean);
    const currency = actualEntry?.currency ?? orderCurrency ?? catalogBySymbol.get(symbol)?.currency ?? account.baseCurrency;
    reservedPositions.push({
      symbol,
      persisted: persistedPosition,
      economic,
      effective,
      orderIds: relevant.map((effect) => effect.orderId).sort(),
    });
    projectedPositions.push({
      symbol,
      quantity: projectedQuantity,
      reservedQuantity: DECIMAL_ZERO,
      costBasis: actualEntry?.costBasis ?? DECIMAL_ZERO,
      currency,
    });
  }

  const projected: CanonicalPortfolioStateV1 = {
    stateVersion: "projected/v1",
    cash: projectedCash,
    positions: projectedPositions,
  };
  const actualValuation = valuePortfolio(
    actual,
    account.baseCurrency,
    args.instrumentCatalog,
    args.market,
    args.authoring.settings.marketDataMaxAgeSeconds,
    asOf,
    issues,
  );
  const projectedValuation = valuePortfolio(
    projected,
    account.baseCurrency,
    args.instrumentCatalog,
    args.market,
    args.authoring.settings.marketDataMaxAgeSeconds,
    asOf,
    issues,
  );

  const result: PortfolioStateDerivationV1 = {
    actual: { canonical: actual, valuation: actualValuation },
    reserved: {
      cash: reservedCash,
      positions: reservedPositions,
      orders: effects,
    },
    projected: { canonical: projected, valuation: projectedValuation },
    issues: dedupeIssues(issues),
  };
  return deepFreezeCanonical(result) as PortfolioStateDerivationV1;
}
