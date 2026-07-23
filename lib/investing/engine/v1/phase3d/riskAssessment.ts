import {
  canonicalDecimalFromString,
  canonicalSha256,
  deepFreezeCanonical,
  type CanonicalDecimal,
} from "@/lib/investing/engine/v1/canonical";
import type {
  CanonicalInvestingInputV1,
  CanonicalMarketPointV1,
  InvestingQualityIssueV1,
} from "@/lib/investing/engine/v1/contracts";
import {
  DECIMAL_ONE,
  DECIMAL_ZERO,
  decimalAdd,
  decimalDivide,
  decimalIsPositive,
  decimalMin,
  decimalMultiply,
  decimalSum,
} from "@/lib/investing/engine/v1/phase3d/decimalMath";
import {
  RISK_ASSESSMENT_CONTRACT_VERSION,
  type ConcentrationMetricV1,
  type RiskAssessmentV1,
  type RiskMetricV1,
} from "@/lib/investing/engine/v1/phase3d/types";

const MAX_MARKET_AGE_MS = 15 * 60 * 1000;

function issue(
  input: CanonicalInvestingInputV1,
  code: string,
  severity: "info" | "warning" | "error",
  domain: string,
  message: string,
): InvestingQualityIssueV1 {
  return { code, severity, domain, message, observedAt: input.asOf };
}

function dedupeIssues(issues: readonly InvestingQualityIssueV1[]) {
  return [...new Map(
    [...issues]
      .sort((a, b) => `${a.severity}:${a.code}:${a.domain}:${a.message}`.localeCompare(`${b.severity}:${b.code}:${b.domain}:${b.message}`))
      .map((entry) => [`${entry.severity}:${entry.code}:${entry.domain}:${entry.message}`, entry]),
  ).values()];
}

function metric(
  value: CanonicalDecimal | null,
  unit: RiskMetricV1["unit"],
  source: string,
  explanation: string,
): RiskMetricV1 {
  return {
    status: value === null ? "insufficient_data" : "supported",
    value,
    unit,
    source,
    explanation,
  };
}

function findFxRate(
  input: CanonicalInvestingInputV1,
  currency: string,
  market: ReadonlyMap<string, CanonicalMarketPointV1>,
  issues: InvestingQualityIssueV1[],
): CanonicalDecimal | null {
  if (currency === input.mandate.baseCurrency) return DECIMAL_ONE;
  const direct = market.get(`${currency}${input.mandate.baseCurrency}`)
    ?? market.get(`${currency}_${input.mandate.baseCurrency}`);
  if (direct && direct.currency === input.mandate.baseCurrency) return direct.price;
  const inverse = market.get(`${input.mandate.baseCurrency}${currency}`)
    ?? market.get(`${input.mandate.baseCurrency}_${currency}`);
  if (inverse && inverse.currency === currency && decimalIsPositive(inverse.price)) {
    return decimalDivide(DECIMAL_ONE, inverse.price);
  }
  issues.push(issue(input, "risk_fx_missing", "error", "risk_market", `Missing sealed FX from ${currency} to ${input.mandate.baseCurrency}`));
  return null;
}

function stableConcentrations(values: ReadonlyMap<string, CanonicalDecimal>, total: CanonicalDecimal) {
  return [...values.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([subject, valueInBase]): ConcentrationMetricV1 => ({
      subject,
      valueInBase,
      weight: decimalIsPositive(total) ? decimalDivide(valueInBase, total) : DECIMAL_ZERO,
    }));
}

export function assessInvestingRiskV1(input: CanonicalInvestingInputV1): RiskAssessmentV1 {
  const issues: InvestingQualityIssueV1[] = [...input.quality.issues, ...input.warnings];
  const market = new Map(input.market.points.map((point) => [point.symbol, point]));
  const catalog = new Map(input.instrumentCatalog.instruments.map((instrument) => [instrument.symbol, instrument]));
  const asOfMs = new Date(input.asOf).getTime();
  const usedMarketSymbols = new Set<string>();
  let valuationComplete = true;

  const currencyValues = new Map<string, CanonicalDecimal>();
  let cashValue = DECIMAL_ZERO;
  for (const cash of input.projected.cash) {
    const value = decimalAdd(cash.available, cash.reserved);
    const fx = findFxRate(input, cash.currency, market, issues);
    if (fx === null) {
      valuationComplete = false;
      continue;
    }
    const baseValue = decimalMultiply(value, fx);
    cashValue = decimalAdd(cashValue, baseValue);
    currencyValues.set(cash.currency, decimalAdd(currencyValues.get(cash.currency) ?? DECIMAL_ZERO, baseValue));
  }

  const instrumentValues = new Map<string, CanonicalDecimal>();
  const assetClassValues = new Map<string, CanonicalDecimal>();
  let positionValue = DECIMAL_ZERO;
  for (const position of input.projected.positions) {
    const instrument = catalog.get(position.symbol);
    if (!instrument) {
      issues.push(issue(input, "risk_instrument_catalog_missing", "error", "risk_catalog", `${position.symbol} is absent from the sealed catalog`));
      valuationComplete = false;
    }
    const point = market.get(position.symbol);
    if (!point) {
      issues.push(issue(input, "risk_price_missing", "error", "risk_market", `${position.symbol} has no sealed price`));
      valuationComplete = false;
      continue;
    }
    usedMarketSymbols.add(point.symbol);
    if (point.currency !== position.currency || (instrument && instrument.currency !== position.currency)) {
      issues.push(issue(input, "risk_currency_mismatch", "error", "risk_market", `${position.symbol} currency sources disagree`));
      valuationComplete = false;
    }
    const fx = findFxRate(input, position.currency, market, issues);
    if (fx === null) {
      valuationComplete = false;
      continue;
    }
    const localValue = decimalMultiply(position.quantity, point.price);
    const baseValue = decimalMultiply(localValue, fx);
    positionValue = decimalAdd(positionValue, baseValue);
    instrumentValues.set(position.symbol, decimalAdd(instrumentValues.get(position.symbol) ?? DECIMAL_ZERO, baseValue));
    const assetClass = instrument?.assetClass ?? "unknown";
    assetClassValues.set(assetClass, decimalAdd(assetClassValues.get(assetClass) ?? DECIMAL_ZERO, baseValue));
    currencyValues.set(position.currency, decimalAdd(currencyValues.get(position.currency) ?? DECIMAL_ZERO, baseValue));
  }

  for (const symbol of [...usedMarketSymbols].sort()) {
    const point = market.get(symbol)!;
    if (asOfMs - new Date(point.providerAsOf).getTime() > MAX_MARKET_AGE_MS) {
      issues.push(issue(input, "risk_price_stale", "warning", "risk_market", `${symbol} exceeds the risk-policy staleness limit`));
    }
    if (point.quality === "degraded") {
      issues.push(issue(input, "risk_price_degraded", "warning", "risk_market", `${symbol} market quality is degraded`));
    }
    if (point.quality === "insufficient") {
      issues.push(issue(input, "risk_price_insufficient", "error", "risk_market", `${symbol} market quality is insufficient`));
      valuationComplete = false;
    }
  }

  issues.push(issue(input, "risk_volatility_unavailable", "info", "risk_model", "No canonical return series is present in input v1"));
  issues.push(issue(input, "risk_drawdown_unavailable", "info", "risk_model", "No canonical equity curve is present in input v1"));
  issues.push(issue(input, "risk_capacity_unavailable", "info", "risk_model", "Mandate v1 has no canonical loss-capacity dataset"));

  const totalValue = valuationComplete ? decimalAdd(cashValue, positionValue) : null;
  const totalExposure = totalValue === null
    ? null
    : decimalIsPositive(totalValue)
      ? decimalDivide(positionValue, totalValue)
      : DECIMAL_ZERO;
  const cashWeight = totalValue === null
    ? null
    : decimalIsPositive(totalValue)
      ? decimalDivide(cashValue, totalValue)
      : DECIMAL_ONE;
  const instrumentConcentrations = totalValue === null ? [] : stableConcentrations(instrumentValues, totalValue);
  const assetClassConcentrations = totalValue === null ? [] : stableConcentrations(assetClassValues, totalValue);
  const currencyExposures = totalValue === null ? [] : stableConcentrations(currencyValues, totalValue);
  const concentrationRiskScore = totalValue === null
    ? null
    : decimalSum(instrumentConcentrations.map((entry) => decimalMultiply(entry.weight, entry.weight)));

  const normalizedIssues = dedupeIssues(issues);
  const hasError = input.quality.status === "insufficient" || normalizedIssues.some((entry) => entry.severity === "error");
  const hasWarning = input.quality.status === "degraded" || normalizedIssues.some((entry) => entry.severity === "warning");
  const status = hasError ? "insufficient_data" : hasWarning ? "degraded" : "complete";
  const quality = hasError ? "insufficient" : hasWarning ? "degraded" : "good";
  const confidenceCap = hasError ? DECIMAL_ZERO : hasWarning ? canonicalDecimalFromString("0.5") : DECIMAL_ONE;
  const draft: Omit<RiskAssessmentV1, "assessmentHash"> = {
    contractVersion: RISK_ASSESSMENT_CONTRACT_VERSION,
    inputHash: input.inputHash,
    asOf: input.asOf,
    baseCurrency: input.mandate.baseCurrency,
    status,
    dataQuality: quality,
    confidence: {
      value: decimalMin(input.confidence.value, confidenceCap),
      basis: normalizedIssues.length === 0 ? ["risk_sources_complete"] : normalizedIssues.map((entry) => entry.code),
    },
    totalPortfolioValue: metric(totalValue, "base_currency", "projected_state_and_market_snapshot", "Projected cash plus projected positions in base currency"),
    totalExposure: metric(totalExposure, "ratio", "projected_positions", "Projected position value divided by projected total value"),
    availableCash: metric(valuationComplete ? cashValue : null, "base_currency", "projected_cash", "Projected cash converted to base currency"),
    cashWeight: metric(cashWeight, "ratio", "projected_cash", "Projected cash divided by projected total value"),
    concentrationRiskScore: metric(concentrationRiskScore, "score", "instrument_concentrations", "Herfindahl sum of squared instrument weights"),
    volatility: metric(null, "ratio", "canonical_return_series", "Unsupported without a canonical return series"),
    drawdown: metric(null, "ratio", "canonical_equity_curve", "Unsupported without a canonical equity curve"),
    riskCapacity: metric(null, "score", "canonical_loss_capacity", "Unsupported without canonical loss-capacity inputs"),
    instrumentConcentrations,
    assetClassConcentrations,
    currencyExposures,
    issues: normalizedIssues,
  };
  const result = { ...draft, assessmentHash: canonicalSha256(draft) } satisfies RiskAssessmentV1;
  return deepFreezeCanonical(result) as RiskAssessmentV1;
}
