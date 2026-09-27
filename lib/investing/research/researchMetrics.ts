import {
  addRationalV1,
  compareRationalV1,
  divideRationalV1,
  integerToRationalV1,
  multiplyRationalV1,
  renderRatioOutputV1,
  subtractRationalV1,
  type ExactRationalV1,
} from "./exactRational";
import type { CanonicalJsonValue } from "./canonical";

export type ValuationRecordV1 = Readonly<{
  sessionDate: string;
  cash: string;
  marketValue: string;
  nav: string;
  navExact: ExactRationalV1;
}>;

export function metricResultRecordsV1(valuations: readonly ValuationRecordV1[]): readonly CanonicalJsonValue[] {
  if (valuations.length < 1) throw new Error("NO_VALUATIONS");
  const starting = valuations[0]!.navExact;
  const ending = valuations[valuations.length - 1]!.navExact;
  const totalReturn = subtractRationalV1(divideRationalV1(ending, starting), integerToRationalV1(1n));
  let peak = starting;
  let maxDrawdown = integerToRationalV1(0n);
  for (const valuation of valuations) {
    if (compareRationalV1(valuation.navExact, peak) > 0) peak = valuation.navExact;
    const drawdown = divideRationalV1(subtractRationalV1(peak, valuation.navExact), peak);
    if (compareRationalV1(drawdown, maxDrawdown) > 0) maxDrawdown = drawdown;
  }
  return [
    { metricId: "MAX_DRAWDOWN", metricVersion: "METRIC_V1", value: renderRatioOutputV1(maxDrawdown) },
    { metricId: "TOTAL_RETURN", metricVersion: "METRIC_V1", value: renderRatioOutputV1(totalReturn) },
  ];
}

export function sumRationalsV1(values: readonly ExactRationalV1[]): ExactRationalV1 {
  return values.reduce((total, value) => addRationalV1(total, value), integerToRationalV1(0n));
}

export const metricRegistryVersionV2 = "METRIC_REGISTRY_V20260927";
export const metricRegistryV2Requests = [
  { metricId: "ANNUALIZED_VOLATILITY", metricVersion: "METRIC_V2" },
  { metricId: "AVERAGE_GROSS_EXPOSURE", metricVersion: "METRIC_V2" },
  { metricId: "BENCHMARK_RELATIVE_RETURN", metricVersion: "METRIC_V2" },
  { metricId: "CAGR", metricVersion: "METRIC_V2" },
  { metricId: "CALMAR_RATIO", metricVersion: "METRIC_V2" },
  { metricId: "DOWNSIDE_DEVIATION", metricVersion: "METRIC_V2" },
  { metricId: "MAX_DRAWDOWN", metricVersion: "METRIC_V2" },
  { metricId: "MAX_DRAWDOWN_DURATION", metricVersion: "METRIC_V2" },
  { metricId: "MAX_DRAWDOWN_RECOVERY", metricVersion: "METRIC_V2" },
  { metricId: "REBALANCE_COUNT", metricVersion: "METRIC_V2" },
  { metricId: "SHARPE_RATIO", metricVersion: "METRIC_V2" },
  { metricId: "SORTINO_RATIO", metricVersion: "METRIC_V2" },
  { metricId: "TOTAL_RETURN", metricVersion: "METRIC_V2" },
  { metricId: "TRACKING_ERROR", metricVersion: "METRIC_V2" },
  { metricId: "TRADE_COUNT", metricVersion: "METRIC_V2" },
  { metricId: "TURNOVER", metricVersion: "METRIC_V2" },
] as const;

export type MetricFillRecordV2 = Readonly<{
  originatingTargetIntent: string;
  grossNotional: ExactRationalV1;
}>;

export type MetricBenchmarkRecordV2 = Readonly<{
  sessionDate: string;
  valueExact: ExactRationalV1;
}>;

export type MetricResultContextV2 = Readonly<{
  valuations: readonly (ValuationRecordV1 & { marketValueExact: ExactRationalV1 })[];
  fills: readonly MetricFillRecordV2[];
  benchmark: readonly MetricBenchmarkRecordV2[];
}>;

type MetricUnavailableReasonV2 =
  | "INSUFFICIENT_OBSERVATIONS"
  | "ZERO_DENOMINATOR"
  | "UNRECOVERED_DRAWDOWN"
  | "BENCHMARK_UNAVAILABLE"
  | "NON_POSITIVE_NAV"
  | "INVALID_CAGR_DOMAIN"
  | "INSUFFICIENT_DOWNSIDE_OBSERVATIONS"
  | "NO_DOWNSIDE_OBSERVATIONS";

type DrawdownEpisode = Readonly<{
  maxDrawdown: ExactRationalV1;
  durationSessions: bigint;
  recoverySessions: bigint | null;
}>;

const zero = integerToRationalV1(0n);
const one = integerToRationalV1(1n);
const tradingSessionsPerYear = integerToRationalV1(252n);
const certificationStartScale = 36;
const certificationStepScale = 18;
const certificationMaxScale = 216;

export function metricResultRecordsV2(input: MetricResultContextV2): readonly CanonicalJsonValue[] {
  if (input.valuations.length < 1) throw new Error("NO_VALUATIONS");
  const records = new Map<string, CanonicalJsonValue>();
  const valuations = input.valuations;
  const starting = valuations[0]!.navExact;
  const ending = valuations.at(-1)!.navExact;
  const returns = valuations.some((valuation) => compareRationalV1(valuation.navExact, zero) <= 0) ? null : sessionReturns(valuations);
  const drawdown = drawdownEpisode(valuations);
  const totalReturn = compareRationalV1(starting, zero) === 0 ? unavailable("TOTAL_RETURN", "ZERO_DENOMINATOR") : availableRatio("TOTAL_RETURN", subtractRationalV1(divideRationalV1(ending, starting), one));
  records.set("TOTAL_RETURN", totalReturn);
  records.set("MAX_DRAWDOWN", availableRatio("MAX_DRAWDOWN", drawdown.maxDrawdown));
  records.set("MAX_DRAWDOWN_DURATION", availableInteger("MAX_DRAWDOWN_DURATION", drawdown.durationSessions));
  records.set("MAX_DRAWDOWN_RECOVERY", drawdown.recoverySessions === null ? unavailable("MAX_DRAWDOWN_RECOVERY", "UNRECOVERED_DRAWDOWN") : availableInteger("MAX_DRAWDOWN_RECOVERY", drawdown.recoverySessions));
  records.set("TRADE_COUNT", availableInteger("TRADE_COUNT", BigInt(input.fills.length)));
  records.set("REBALANCE_COUNT", availableInteger("REBALANCE_COUNT", BigInt(new Set(input.fills.map((fill) => fill.originatingTargetIntent)).size)));
  records.set("TURNOVER", turnoverMetric(input.fills, valuations));
  records.set("AVERAGE_GROSS_EXPOSURE", averageGrossExposure(valuations));
  const cagr = cagrMetric(valuations);
  records.set("CAGR", cagr.record);
  records.set("ANNUALIZED_VOLATILITY", returns ? volatilityMetric("ANNUALIZED_VOLATILITY", returns, false) : unavailable("ANNUALIZED_VOLATILITY", "NON_POSITIVE_NAV"));
  records.set("DOWNSIDE_DEVIATION", returns ? volatilityMetric("DOWNSIDE_DEVIATION", returns, true) : unavailable("DOWNSIDE_DEVIATION", "NON_POSITIVE_NAV"));
  records.set("SHARPE_RATIO", returns ? sharpeMetric(returns) : unavailable("SHARPE_RATIO", "NON_POSITIVE_NAV"));
  records.set("SORTINO_RATIO", returns ? sortinoMetric(returns) : unavailable("SORTINO_RATIO", "NON_POSITIVE_NAV"));
  records.set("CALMAR_RATIO", calmarMetric(cagr, drawdown.maxDrawdown));
  const alignedBenchmark = alignBenchmark(input.benchmark, valuations);
  const benchmarkReturns = returns && alignedBenchmark ? sessionReturns(alignedBenchmark.map((record) => ({ sessionDate: record.sessionDate, cash: "", marketValue: "", nav: "", navExact: record.valueExact }))) : null;
  records.set("BENCHMARK_RELATIVE_RETURN", benchmarkRelativeReturn(alignedBenchmark, ending, starting));
  records.set("TRACKING_ERROR", returns ? trackingErrorMetric(returns, benchmarkReturns) : unavailable("TRACKING_ERROR", "NON_POSITIVE_NAV"));
  return metricRegistryV2Requests.map((request) => records.get(request.metricId)!);
}

function availableRatio(metricId: string, value: ExactRationalV1): CanonicalJsonValue {
  return metricRecord(metricId, { status: "AVAILABLE", value: renderRatioOutputV1(value) });
}

function availableInteger(metricId: string, value: bigint): CanonicalJsonValue {
  return metricRecord(metricId, { status: "AVAILABLE", value: value.toString() });
}

function unavailable(metricId: string, reason: MetricUnavailableReasonV2): CanonicalJsonValue {
  return metricRecord(metricId, { status: "UNAVAILABLE", reason });
}

function metricRecord(metricId: string, fields: Record<string, CanonicalJsonValue>): CanonicalJsonValue {
  return {
    metricId,
    metricVersion: "METRIC_V2",
    registryVersion: metricRegistryVersionV2,
    annualizationBasis: "TRADING_SESSIONS_PER_YEAR_252",
    riskFreeSessionReturn: "0",
    minimumAcceptableSessionReturn: "0",
    arithmetic: "EXACT_RATIONAL_WITH_DETERMINISTIC_BIGINT_ROOT_POWER_V1",
    rounding: "RESEARCH_RATIO_OUTPUT_V1_SCALE_18_ROUND_HALF_EVEN",
    ...fields,
  };
}

function sessionReturns(valuations: readonly ValuationRecordV1[]): ExactRationalV1[] {
  const returns: ExactRationalV1[] = [];
  for (let index = 1; index < valuations.length; index += 1) {
    const previous = valuations[index - 1]!.navExact;
    if (compareRationalV1(previous, zero) <= 0 || compareRationalV1(valuations[index]!.navExact, zero) <= 0) throw new Error("NON_POSITIVE_NAV");
    returns.push(subtractRationalV1(divideRationalV1(valuations[index]!.navExact, previous), one));
  }
  return returns;
}

function drawdownEpisode(valuations: readonly ValuationRecordV1[]): DrawdownEpisode {
  let peak = valuations[0]!.navExact;
  let peakIndex = 0;
  let activeStart: number | null = null;
  let activeTrough = zero;
  let activeTroughIndex = 0;
  let best: DrawdownEpisode = { maxDrawdown: zero, durationSessions: 0n, recoverySessions: 0n };
  for (let index = 0; index < valuations.length; index += 1) {
    const nav = valuations[index]!.navExact;
    if (compareRationalV1(nav, peak) >= 0) {
      if (activeStart !== null) {
        const episode = { maxDrawdown: activeTrough, durationSessions: BigInt(index - activeStart), recoverySessions: BigInt(index - activeTroughIndex) };
        best = chooseDrawdown(best, episode);
      }
      peak = nav;
      peakIndex = index;
      activeStart = null;
      activeTrough = zero;
      activeTroughIndex = index;
      continue;
    }
    const current = divideRationalV1(subtractRationalV1(peak, nav), peak);
    if (activeStart === null) {
      activeStart = peakIndex;
      activeTrough = current;
      activeTroughIndex = index;
    } else if (compareRationalV1(current, activeTrough) > 0) {
      activeTrough = current;
      activeTroughIndex = index;
    }
  }
  if (activeStart !== null) {
    best = chooseDrawdown(best, {
      maxDrawdown: activeTrough,
      durationSessions: BigInt(valuations.length - 1 - activeStart),
      recoverySessions: null,
    });
  }
  return best;
}

function chooseDrawdown(left: DrawdownEpisode, right: DrawdownEpisode): DrawdownEpisode {
  const cmp = compareRationalV1(right.maxDrawdown, left.maxDrawdown);
  if (cmp > 0) return right;
  if (cmp < 0) return left;
  if (right.durationSessions > left.durationSessions) return right;
  return left;
}

function turnoverMetric(fills: readonly MetricFillRecordV2[], valuations: readonly ValuationRecordV1[]): CanonicalJsonValue {
  const navSum = sumRationalsV1(valuations.map((valuation) => valuation.navExact));
  if (compareRationalV1(navSum, zero) === 0) return unavailable("TURNOVER", "ZERO_DENOMINATOR");
  const denominator = divideRationalV1(navSum, integerToRationalV1(BigInt(valuations.length)));
  const totalGross = sumRationalsV1(fills.map((fill) => fill.grossNotional));
  return availableRatio("TURNOVER", divideRationalV1(totalGross, denominator));
}

function averageGrossExposure(valuations: readonly (ValuationRecordV1 & { marketValueExact: ExactRationalV1 })[]): CanonicalJsonValue {
  if (valuations.some((valuation) => compareRationalV1(valuation.navExact, zero) <= 0)) return unavailable("AVERAGE_GROSS_EXPOSURE", "NON_POSITIVE_NAV");
  const exposure = valuations.map((valuation) => divideRationalV1(valuation.marketValueExact, valuation.navExact));
  return availableRatio("AVERAGE_GROSS_EXPOSURE", divideRationalV1(sumRationalsV1(exposure), integerToRationalV1(BigInt(exposure.length))));
}

function cagrMetric(valuations: readonly ValuationRecordV1[]): Readonly<{ record: CanonicalJsonValue; interval: RationalIntervalV1 | null }> {
  const start = valuations[0]!;
  const end = valuations.at(-1)!;
  const days = civilDayNumber(end.sessionDate) - civilDayNumber(start.sessionDate);
  if (days <= 0n) return { record: unavailable("CAGR", "INSUFFICIENT_OBSERVATIONS"), interval: null };
  if (compareRationalV1(start.navExact, zero) <= 0 || compareRationalV1(end.navExact, zero) <= 0) return { record: unavailable("CAGR", "INVALID_CAGR_DOMAIN"), interval: null };
  const growth = divideRationalV1(end.navExact, start.navExact);
  const certified = certifiedRationalPowerMinusOneOutputV2(growth, 365n, days);
  return { record: metricRecord("CAGR", { status: "AVAILABLE", value: certified.value }), interval: certified.interval };
}

function volatilityMetric(metricId: "ANNUALIZED_VOLATILITY" | "DOWNSIDE_DEVIATION", returns: readonly ExactRationalV1[], downsideOnly: boolean): CanonicalJsonValue {
  const sample = downsideOnly ? returns.filter((value) => compareRationalV1(value, zero) < 0) : returns;
  if (sample.length === 0) return unavailable(metricId, downsideOnly ? "NO_DOWNSIDE_OBSERVATIONS" : "INSUFFICIENT_OBSERVATIONS");
  if (sample.length < 2) return unavailable(metricId, downsideOnly ? "INSUFFICIENT_DOWNSIDE_OBSERVATIONS" : "INSUFFICIENT_OBSERVATIONS");
  const mean = downsideOnly ? zero : divideRationalV1(sumRationalsV1(sample), integerToRationalV1(BigInt(sample.length)));
  const squared = sample.map((value) => {
    const diff = subtractRationalV1(value, mean);
    return multiplyRationalV1(diff, diff);
  });
  const variance = divideRationalV1(sumRationalsV1(squared), integerToRationalV1(BigInt(sample.length - 1)));
  const annualized = multiplyRationalV1(variance, tradingSessionsPerYear);
  return metricRecord(metricId, { status: "AVAILABLE", value: certifiedSqrtRatioOutputV2(annualized).value });
}

function sharpeMetric(returns: readonly ExactRationalV1[]): CanonicalJsonValue {
  if (returns.length < 2) return unavailable("SHARPE_RATIO", "INSUFFICIENT_OBSERVATIONS");
  const mean = divideRationalV1(sumRationalsV1(returns), integerToRationalV1(BigInt(returns.length)));
  const vol = volatilityExact(returns);
  if (compareRationalV1(vol, zero) === 0) return unavailable("SHARPE_RATIO", "ZERO_DENOMINATOR");
  return metricRecord("SHARPE_RATIO", { status: "AVAILABLE", value: certifiedAnnualizedMeanRatioOutput(mean, vol) });
}

function sortinoMetric(returns: readonly ExactRationalV1[]): CanonicalJsonValue {
  const downside = returns.filter((value) => compareRationalV1(value, zero) < 0);
  if (returns.length < 2) return unavailable("SORTINO_RATIO", "INSUFFICIENT_OBSERVATIONS");
  if (downside.length === 0) return unavailable("SORTINO_RATIO", "NO_DOWNSIDE_OBSERVATIONS");
  if (downside.length < 2) return unavailable("SORTINO_RATIO", "INSUFFICIENT_DOWNSIDE_OBSERVATIONS");
  const mean = divideRationalV1(sumRationalsV1(returns), integerToRationalV1(BigInt(returns.length)));
  const downsideDeviation = downsideDeviationExact(downside);
  if (compareRationalV1(downsideDeviation, zero) === 0) return unavailable("SORTINO_RATIO", "ZERO_DENOMINATOR");
  return metricRecord("SORTINO_RATIO", { status: "AVAILABLE", value: certifiedAnnualizedMeanRatioOutput(mean, downsideDeviation) });
}

function calmarMetric(cagr: Readonly<{ record: CanonicalJsonValue; interval: RationalIntervalV1 | null }>, maxDrawdown: ExactRationalV1): CanonicalJsonValue {
  if (!isAvailableMetric(cagr.record) || cagr.interval === null) return unavailable("CALMAR_RATIO", "INVALID_CAGR_DOMAIN");
  if (compareRationalV1(maxDrawdown, zero) === 0) return unavailable("CALMAR_RATIO", "ZERO_DENOMINATOR");
  return metricRecord("CALMAR_RATIO", { status: "AVAILABLE", value: certifyIntervalOutput({
    lower: divideRationalV1(cagr.interval.lower, maxDrawdown),
    upper: divideRationalV1(cagr.interval.upper, maxDrawdown),
  }) });
}

function benchmarkRelativeReturn(benchmark: readonly MetricBenchmarkRecordV2[] | null, ending: ExactRationalV1, starting: ExactRationalV1): CanonicalJsonValue {
  if (!benchmark || benchmark.length < 1) return unavailable("BENCHMARK_RELATIVE_RETURN", "BENCHMARK_UNAVAILABLE");
  if (compareRationalV1(starting, zero) === 0 || compareRationalV1(benchmark[0]!.valueExact, zero) === 0) return unavailable("BENCHMARK_RELATIVE_RETURN", "ZERO_DENOMINATOR");
  const portfolioReturn = subtractRationalV1(divideRationalV1(ending, starting), one);
  const benchmarkReturn = subtractRationalV1(divideRationalV1(benchmark.at(-1)!.valueExact, benchmark[0]!.valueExact), one);
  return availableRatio("BENCHMARK_RELATIVE_RETURN", subtractRationalV1(portfolioReturn, benchmarkReturn));
}

function alignBenchmark(benchmark: readonly MetricBenchmarkRecordV2[], valuations: readonly ValuationRecordV1[]): readonly MetricBenchmarkRecordV2[] | null {
  if (benchmark.length === 0) return null;
  if (benchmark.length !== valuations.length) throw new Error("BENCHMARK_MISALIGNED");
  for (let index = 0; index < benchmark.length; index += 1) {
    if (benchmark[index]!.sessionDate !== valuations[index]!.sessionDate) throw new Error("BENCHMARK_MISALIGNED");
  }
  return benchmark;
}

function trackingErrorMetric(returns: readonly ExactRationalV1[], benchmarkReturns: readonly ExactRationalV1[] | null): CanonicalJsonValue {
  if (!benchmarkReturns) return unavailable("TRACKING_ERROR", "BENCHMARK_UNAVAILABLE");
  if (returns.length !== benchmarkReturns.length || returns.length < 2) return unavailable("TRACKING_ERROR", "INSUFFICIENT_OBSERVATIONS");
  const active = returns.map((value, index) => subtractRationalV1(value, benchmarkReturns[index]!));
  const variance = volatilityExact(active);
  return metricRecord("TRACKING_ERROR", { status: "AVAILABLE", value: certifiedSqrtRatioOutputV2(multiplyRationalV1(variance, tradingSessionsPerYear)).value });
}

function volatilityExact(values: readonly ExactRationalV1[]): ExactRationalV1 {
  const mean = divideRationalV1(sumRationalsV1(values), integerToRationalV1(BigInt(values.length)));
  const squared = values.map((value) => {
    const diff = subtractRationalV1(value, mean);
    return multiplyRationalV1(diff, diff);
  });
  return divideRationalV1(sumRationalsV1(squared), integerToRationalV1(BigInt(values.length - 1)));
}

function downsideDeviationExact(values: readonly ExactRationalV1[]): ExactRationalV1 {
  const squared = values.map((value) => multiplyRationalV1(value, value));
  return divideRationalV1(sumRationalsV1(squared), integerToRationalV1(BigInt(values.length - 1)));
}

type RationalIntervalV1 = Readonly<{ lower: ExactRationalV1; upper: ExactRationalV1 }>;

export function certifiedSqrtRatioOutputV2(value: ExactRationalV1): Readonly<{ value: string; interval: RationalIntervalV1 }> {
  if (value.numerator < 0n) throw new Error("NUMERIC_INVARIANT_VIOLATION");
  for (let scale = certificationStartScale; scale <= certificationMaxScale; scale += certificationStepScale) {
    const factor = 10n ** BigInt(scale);
    const rootFloor = sqrtFloor((value.numerator * factor * factor) / value.denominator);
    const isExact = rootFloor * rootFloor * value.denominator === value.numerator * factor * factor;
    const interval = normalizeInterval({
      lower: { numerator: rootFloor, denominator: factor },
      upper: { numerator: isExact ? rootFloor : rootFloor + 1n, denominator: factor },
    });
    const certified = tryCertifyIntervalOutput(interval);
    if (certified) return { value: certified, interval };
  }
  throw new Error("NUMERIC_INVARIANT_VIOLATION");
}

export function certifiedRationalPowerMinusOneOutputV2(base: ExactRationalV1, exponentNumerator: bigint, exponentDenominator: bigint): Readonly<{ value: string; interval: RationalIntervalV1 }> {
  if (base.numerator <= 0n || exponentNumerator <= 0n || exponentDenominator <= 0n) throw new Error("NUMERIC_INVARIANT_VIOLATION");
  for (let scale = certificationStartScale; scale <= certificationMaxScale; scale += certificationStepScale) {
    const interval = rationalPowerMinusOneInterval(base, exponentNumerator, exponentDenominator, scale);
    const certified = tryCertifyIntervalOutput(interval);
    if (certified) return { value: certified, interval };
  }
  throw new Error("NUMERIC_INVARIANT_VIOLATION");
}

function rationalPowerMinusOneInterval(base: ExactRationalV1, exponentNumerator: bigint, exponentDenominator: bigint, scale: number): RationalIntervalV1 {
  const factor = 10n ** BigInt(scale);
  const rootFloor = nthRootAtScale(base, exponentDenominator, scale);
  const isExact = bigintPower(rootFloor, exponentDenominator) * base.denominator === base.numerator * bigintPower(factor, exponentDenominator);
  const lowerRoot = { numerator: rootFloor, denominator: factor };
  const upperRoot = { numerator: isExact ? rootFloor : rootFloor + 1n, denominator: factor };
  return normalizeInterval({
    lower: subtractRationalV1(rationalPowerExact(lowerRoot, exponentNumerator), one),
    upper: subtractRationalV1(rationalPowerExact(upperRoot, exponentNumerator), one),
  });
}

function certifiedAnnualizedMeanRatioOutput(mean: ExactRationalV1, denominatorVariance: ExactRationalV1): string {
  for (let scale = certificationStartScale; scale <= certificationMaxScale; scale += certificationStepScale) {
    const numeratorRoot = sqrtIntervalAtScale(tradingSessionsPerYear, scale);
    const denominatorRoot = sqrtIntervalAtScale(denominatorVariance, scale);
    const candidates = [
      divideRationalV1(multiplyRationalV1(mean, numeratorRoot.lower), denominatorRoot.lower),
      divideRationalV1(multiplyRationalV1(mean, numeratorRoot.lower), denominatorRoot.upper),
      divideRationalV1(multiplyRationalV1(mean, numeratorRoot.upper), denominatorRoot.lower),
      divideRationalV1(multiplyRationalV1(mean, numeratorRoot.upper), denominatorRoot.upper),
    ];
    const interval = normalizeInterval({
      lower: minRational(candidates),
      upper: maxRational(candidates),
    });
    const certified = tryCertifyIntervalOutput(interval);
    if (certified) return certified;
  }
  throw new Error("NUMERIC_INVARIANT_VIOLATION");
}

function sqrtIntervalAtScale(value: ExactRationalV1, scale: number): RationalIntervalV1 {
  if (value.numerator < 0n) throw new Error("NUMERIC_INVARIANT_VIOLATION");
  const factor = 10n ** BigInt(scale);
  const rootFloor = sqrtFloor((value.numerator * factor * factor) / value.denominator);
  const isExact = rootFloor * rootFloor * value.denominator === value.numerator * factor * factor;
  return normalizeInterval({
    lower: { numerator: rootFloor, denominator: factor },
    upper: { numerator: isExact ? rootFloor : rootFloor + 1n, denominator: factor },
  });
}

function rationalPowerExact(base: ExactRationalV1, exponent: bigint): ExactRationalV1 {
  return {
    numerator: bigintPower(base.numerator, exponent),
    denominator: bigintPower(base.denominator, exponent),
  };
}

function certifyIntervalOutput(interval: RationalIntervalV1): string {
  const certified = tryCertifyIntervalOutput(normalizeInterval(interval));
  if (!certified) throw new Error("NUMERIC_INVARIANT_VIOLATION");
  return certified;
}

function tryCertifyIntervalOutput(interval: RationalIntervalV1): string | null {
  const lower = renderRatioOutputV1(interval.lower);
  const upper = renderRatioOutputV1(interval.upper);
  return lower === upper ? lower : null;
}

function normalizeInterval(interval: RationalIntervalV1): RationalIntervalV1 {
  return compareRationalV1(interval.lower, interval.upper) <= 0
    ? interval
    : { lower: interval.upper, upper: interval.lower };
}

function minRational(values: readonly ExactRationalV1[]): ExactRationalV1 {
  return values.reduce((minimum, value) => compareRationalV1(value, minimum) < 0 ? value : minimum, values[0]!);
}

function maxRational(values: readonly ExactRationalV1[]): ExactRationalV1 {
  return values.reduce((maximum, value) => compareRationalV1(value, maximum) > 0 ? value : maximum, values[0]!);
}

function nthRootAtScale(value: ExactRationalV1, n: bigint, scale: number): bigint {
  if (value.numerator <= 0n || n <= 0n) throw new Error("NUMERIC_INVARIANT_VIOLATION");
  const factor = 10n ** BigInt(scale);
  const target = value.numerator * bigintPower(factor, n);
  const denominator = value.denominator;
  let low = 0n;
  let high = factor;
  const comparePower = (base: bigint): -1 | 0 | 1 => {
    let result = 1n;
    for (let index = 0n; index < n; index += 1n) {
      result *= base;
      if (result * denominator > target) return 1;
    }
    const left = result * denominator;
    return left === target ? 0 : left < target ? -1 : 1;
  };
  while (comparePower(high) < 0) high *= 2n;
  while (low + 1n < high) {
    const mid = (low + high) / 2n;
    if (comparePower(mid) <= 0) low = mid;
    else high = mid;
  }
  return low;
}

function bigintPower(base: bigint, exponent: bigint): bigint {
  let result = 1n;
  for (let index = 0n; index < exponent; index += 1n) result *= base;
  return result;
}

function sqrtFloor(value: bigint): bigint {
  if (value < 0n) throw new Error("NUMERIC_INVARIANT_VIOLATION");
  if (value < 2n) return value;
  let low = 1n;
  let high = value;
  while (low + 1n < high) {
    const mid = (low + high) / 2n;
    if (mid * mid <= value) low = mid;
    else high = mid;
  }
  return low;
}

function civilDayNumber(date: string): bigint {
  const match = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/u.exec(date);
  if (!match) throw new Error("INVALID_DATE");
  let y = BigInt(match[1]!);
  const m = BigInt(match[2]!);
  const d = BigInt(match[3]!);
  y -= m <= 2n ? 1n : 0n;
  const era = y >= 0n ? y / 400n : (y - 399n) / 400n;
  const yoe = y - era * 400n;
  const mp = m + (m > 2n ? -3n : 9n);
  const doy = (153n * mp + 2n) / 5n + d - 1n;
  const doe = yoe * 365n + yoe / 4n - yoe / 100n + doy;
  return era * 146097n + doe;
}

function isAvailableMetric(value: CanonicalJsonValue): value is CanonicalJsonValue & { status: "AVAILABLE"; value: string } {
  return typeof value === "object" && value !== null && !Array.isArray(value) && (value as { status?: unknown }).status === "AVAILABLE" && typeof (value as { value?: unknown }).value === "string";
}
