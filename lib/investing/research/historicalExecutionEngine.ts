import { sha256HexV1, type CanonicalJsonValue, type HashRefV1, hashRefV1 } from "./canonical";
import { latestXnysSessionOnOrBeforeV1, nextXnysSessionV1, previousXnysSessionV1, rebalanceSessionsV1, xnysSessionsInRangeV1 } from "./calendars";
import { subtractCalendarMonthsV1 } from "./civilDate";
import { type DatasetSeriesHashPayloadV1, type ExecutionConfigHashPayloadV1, type MetricRequestSetHashPayloadV1 } from "./executionMaterials";
import {
  addRationalV1,
  compareRationalV1,
  decimalStringToRationalV1,
  divideRationalV1,
  integerToRationalV1,
  multiplyRationalV1,
  renderMoneyOutputV1,
  renderQuantityOutputV1,
  renderRatioOutputV1,
  subtractRationalV1,
  type ExactRationalV1,
} from "./exactRational";
import { type ResearchIrV1, type ResearchOperationV1, type BooleanExpressionV1, type DataFieldRefV1 } from "./index";
import { canonicalJsonlArtifactBytesV1, artifactDescriptorV1, type ResultHashPayloadV1 } from "./resultArtifacts";
import { metricResultRecordsV1, type ValuationRecordV1 } from "./researchMetrics";
import { type RunInputHashPayloadV1 } from "./canonical";
import { type VerifiedDatasetSeriesMaterialV1 } from "./datasetMaterial";

export type ResearchExecutionFailureCodeV1 =
  | "UNSUPPORTED_RUN_PROFILE"
  | "UNSUPPORTED_ENGINE"
  | "UNSUPPORTED_EXECUTION_CONFIG"
  | "UNSUPPORTED_IR_PROFILE"
  | "CALENDAR_OUT_OF_RANGE"
  | "NO_ELIGIBLE_SESSIONS"
  | "DATASET_MATERIAL_NOT_FOUND"
  | "DATASET_MATERIAL_HASH_MISMATCH"
  | "DATASET_MATERIAL_SCHEMA_INVALID"
  | "DATASET_MATERIAL_COUNT_MISMATCH"
  | "DATASET_MATERIAL_COVERAGE_MISMATCH"
  | "MISSING_REQUIRED_EXECUTION_PRICE"
  | "MISSING_REQUIRED_VALUATION_PRICE"
  | "MISSING_REQUIRED_BENCHMARK_PRICE"
  | "NUMERIC_INVARIANT_VIOLATION"
  | "ACCOUNTING_INVARIANT_VIOLATION"
  | "RESULT_ARTIFACT_LIMIT_EXCEEDED";

export type ResearchExecutionSuccessV1 = Readonly<{
  ok: true;
  artifacts: {
    executionTraceBytes: Buffer;
    valuationSeriesBytes: Buffer;
    metricResultSetBytes: Buffer;
    benchmarkSeriesBytes: Buffer | null;
  };
  resultPayload: ResultHashPayloadV1;
}>;

export type ResearchExecutionResultV1 = ResearchExecutionSuccessV1 | Readonly<{ ok: false; code: ResearchExecutionFailureCodeV1 }>;

type EngineInput = Readonly<{
  runInput: RunInputHashPayloadV1;
  runInputHash: HashRefV1;
  researchIr: ResearchIrV1;
  datasetSeries: readonly DatasetSeriesHashPayloadV1[];
  executionConfig: ExecutionConfigHashPayloadV1;
  metricRequestSet: MetricRequestSetHashPayloadV1;
  materials: readonly VerifiedDatasetSeriesMaterialV1[];
}>;

type Position = { quantity: ExactRationalV1 };
type Intent = Readonly<{ sequence: string; evaluationSequence: string; signalSession: string; executionSession: string; weights: ReadonlyMap<string, ExactRationalV1> }>;
type FieldRuntimeValue = Readonly<{ kind: "RATIONAL"; value: ExactRationalV1 }> | Readonly<{ kind: "DATE"; value: string }>;

const zero = integerToRationalV1(0n);
const one = integerToRationalV1(1n);
const maxArtifactBytes = 67_108_864;

export function executeHistoricalBacktestV1(input: EngineInput): ResearchExecutionResultV1 {
  try {
    validateProfile(input);
    const sessions = xnysSessionsInRangeV1(input.researchIr.testPeriod.startDate, input.researchIr.testPeriod.endDate);
    if (sessions.length < 1) return { ok: false, code: "NO_ELIGIBLE_SESSIONS" };
    const executable = validateExecutableIr(input.researchIr);
    const prices = materialMap(input.materials, "ADJUSTED_CLOSE");
    const volumes = materialMap(input.materials, "VOLUME");
    const instruments = [...input.researchIr.universe.instrumentIds].sort(compareBytes);
    const rebalanceSignals = rebalanceSessionsV1(sessions, executable.rebalance.schedule);
    let cash = decimalStringToRationalV1(input.researchIr.startingCapital.amount);
    const positions = new Map<string, Position>();
    let pending: Intent | null = null;
    let sequence = 0;
    const trace: CanonicalJsonValue[] = [];
    const valuations: ValuationRecordV1[] = [];
    const benchmarkRecords: CanonicalJsonValue[] = [];
    const benchmarkStartPrice = input.researchIr.benchmark.benchmark === "INSTRUMENT"
      ? getPrice(prices, input.researchIr.benchmark.instrumentId, sessions[0]!, "MISSING_REQUIRED_BENCHMARK_PRICE")
      : null;

    for (const session of sessions) {
      if (pending?.executionSession === session) {
        const beforeNav = nav(cash, positions, prices, session, "MISSING_REQUIRED_EXECUTION_PRICE");
        const fill = executeIntent(pending, cash, positions, prices, session, beforeNav);
        cash = fill.cash;
        for (const record of fill.records) trace.push({ ...(record as Record<string, CanonicalJsonValue>), sequence: String(sequence++) });
        const afterNav = nav(cash, positions, prices, session, "MISSING_REQUIRED_VALUATION_PRICE");
        if (compareRationalV1(beforeNav, afterNav) !== 0) return { ok: false, code: "ACCOUNTING_INVARIANT_VIOLATION" };
        pending = null;
      }

      const currentNav = nav(cash, positions, prices, session, "MISSING_REQUIRED_VALUATION_PRICE");
      const marketValue = subtractRationalV1(currentNav, cash);
      valuations.push({
        sessionDate: session,
        cash: renderMoneyOutputV1(cash),
        marketValue: renderMoneyOutputV1(marketValue),
        nav: renderMoneyOutputV1(currentNav),
        navExact: currentNav,
      });

      if (benchmarkStartPrice) {
        const benchmarkPrice = getPrice(prices, (input.researchIr.benchmark as { instrumentId: string }).instrumentId, session, "MISSING_REQUIRED_BENCHMARK_PRICE");
        const value = multiplyRationalV1(decimalStringToRationalV1(input.researchIr.startingCapital.amount), divideRationalV1(benchmarkPrice, benchmarkStartPrice));
        benchmarkRecords.push({ sessionDate: session, value: renderMoneyOutputV1(value) });
      }

      const evaluation = evaluatePipeline(input.researchIr.pipeline, instruments, positions, prices, volumes, session);
      const observationDigest = sha256HexV1(canonicalJsonlArtifactBytesV1(evaluation.observations));
      const evaluationSequence = String(sequence++);
      trace.push({
        sequence: evaluationSequence,
        type: "EVALUATION",
        sessionDate: session,
        evaluationSequence,
        observationDigest,
        eligibleInstrumentSet: evaluation.eligible,
        targetWeights: weightsRecord(evaluation.weights, renderRatioOutputV1),
      });

      if (rebalanceSignals.has(session)) {
        const executionSession = nextXnysSessionV1(session);
        if (executionSession && executionSession <= input.researchIr.testPeriod.endDate) {
          const intentSequence = String(sequence++);
          pending = { sequence: intentSequence, evaluationSequence, signalSession: session, executionSession, weights: evaluation.weights };
          trace.push({
            sequence: intentSequence,
            type: "TARGET_INTENT",
            originatingEvaluationSequence: evaluationSequence,
            signalSession: session,
            requiredExecutionSession: executionSession,
            targetWeights: weightsRecord(evaluation.weights, renderRatioOutputV1),
          });
        }
      }
    }

    const valuationRecords = valuations.map((valuation) => ({
      sessionDate: valuation.sessionDate,
      cash: valuation.cash,
      marketValue: valuation.marketValue,
      nav: valuation.nav,
    }));
    const metricRecords = metricResultRecordsV1(valuations);
    const executionTraceBytes = canonicalJsonlArtifactBytesV1(trace);
    const valuationSeriesBytes = canonicalJsonlArtifactBytesV1(valuationRecords);
    const metricResultSetBytes = canonicalJsonlArtifactBytesV1(metricRecords);
    const benchmarkSeriesBytes = benchmarkRecords.length ? canonicalJsonlArtifactBytesV1(benchmarkRecords) : null;
    if ([executionTraceBytes, valuationSeriesBytes, metricResultSetBytes, benchmarkSeriesBytes].some((bytes) => bytes && bytes.length > maxArtifactBytes)) {
      return { ok: false, code: "RESULT_ARTIFACT_LIMIT_EXCEEDED" };
    }

    return {
      ok: true,
      artifacts: { executionTraceBytes, valuationSeriesBytes, metricResultSetBytes, benchmarkSeriesBytes },
      resultPayload: {
        schemaVersion: "RESULT_HASH_PAYLOAD_V1",
        runInput: hashRefV1(input.runInputHash),
        engineId: "HISTORICAL_EXECUTION_ADAPTER",
        engineVersion: "ENGINE_V20260918",
        executionModelClass: "SYNTHETIC_ADJUSTED_CLOSE_RESEARCH_V1",
        valuationCurrency: "USD",
        testPeriod: input.researchIr.testPeriod,
        startingNav: renderMoneyOutputV1(valuations[0]!.navExact),
        endingNav: valuations.at(-1)!.nav,
        terminalCash: valuations.at(-1)!.cash,
        executionTrace: artifactDescriptorV1("RESEARCH_EXECUTION_TRACE_V1", executionTraceBytes, trace.length),
        valuationSeries: artifactDescriptorV1("RESEARCH_VALUATION_SERIES_V1", valuationSeriesBytes, valuationRecords.length),
        metricResultSet: artifactDescriptorV1("METRIC_RESULT_SET_V1", metricResultSetBytes, metricRecords.length),
        benchmark: benchmarkSeriesBytes ? artifactDescriptorV1("RESEARCH_BENCHMARK_SERIES_V1", benchmarkSeriesBytes, benchmarkRecords.length) : null,
      },
    };
  } catch (error) {
    const code = error instanceof Error ? error.message : "NUMERIC_INVARIANT_VIOLATION";
    if (isFailureCode(code)) return { ok: false, code };
    return { ok: false, code: "NUMERIC_INVARIANT_VIOLATION" };
  }
}

export function admitHistoricalBacktestV1(input: Omit<EngineInput, "materials">): Readonly<{ ok: true } | { ok: false; code: ResearchExecutionFailureCodeV1 }> {
  try {
    validateProfile(input);
    const sessions = xnysSessionsInRangeV1(input.researchIr.testPeriod.startDate, input.researchIr.testPeriod.endDate);
    if (sessions.length < 1) return { ok: false, code: "NO_ELIGIBLE_SESSIONS" };
    validateExecutableIr(input.researchIr);
    return { ok: true };
  } catch (error) {
    const code = error instanceof Error ? error.message : "NUMERIC_INVARIANT_VIOLATION";
    return isFailureCode(code) ? { ok: false, code } : { ok: false, code: "NUMERIC_INVARIANT_VIOLATION" };
  }
}

function validateProfile(input: Omit<EngineInput, "materials">) {
  if (input.runInput.runType !== "HISTORICAL_BACKTEST" || input.runInput.researchEnvironment !== "HISTORICAL_BACKTEST" || input.runInput.researchSourceContext !== "PURE_RESEARCH" || input.runInput.accountResearchContext) {
    throw new Error("UNSUPPORTED_RUN_PROFILE");
  }
  if (input.runInput.engineId !== "HISTORICAL_EXECUTION_ADAPTER" || input.runInput.engineVersion !== "ENGINE_V20260918") throw new Error("UNSUPPORTED_ENGINE");
  const config = input.executionConfig;
  if (
    config.missingDataPolicy !== "MISSING_DATA_EXCLUDE_V1" ||
    config.fxPolicy !== "FX_USD_IDENTITY_V1" ||
    config.costsPolicy !== "COSTS_ZERO_RESEARCH_V1" ||
    config.slippagePolicy !== "SLIPPAGE_ZERO_RESEARCH_V1" ||
    config.fillPolicy !== "CLOSE_TO_CLOSE_V1" ||
    config.corporateActionPolicy !== "ADJUSTED_PRICE_PROVIDER_V1" ||
    config.calendarSessionPolicy !== "XNYS_CLOSE_SESSION_V1" ||
    config.valuationPolicy !== "USD_CLOSE_MARK_V1"
  ) throw new Error("UNSUPPORTED_EXECUTION_CONFIG");
  for (const request of input.metricRequestSet.requests) {
    if ((request.metricId !== "TOTAL_RETURN" && request.metricId !== "MAX_DRAWDOWN") || request.metricVersion !== "METRIC_V1") throw new Error("UNSUPPORTED_EXECUTION_CONFIG");
  }
}

function validateExecutableIr(ir: ResearchIrV1) {
  if (ir.universe.type !== "EXPLICIT_INSTRUMENTS" || ir.startingCapital.origin !== "SIMULATED" || ir.valuationCurrency !== "USD" || ir.startingCapital.currency !== "USD") {
    throw new Error("UNSUPPORTED_IR_PROFILE");
  }
  const weights = ir.pipeline.filter((operation) => operation.type === "WEIGHT");
  const rebalances = ir.pipeline.filter((operation) => operation.type === "REBALANCE");
  if (weights.length !== 1 || rebalances.length !== 1 || ir.pipeline.at(-1)?.type !== "REBALANCE") throw new Error("UNSUPPORTED_IR_PROFILE");
  const weightIndex = ir.pipeline.findIndex((operation) => operation.type === "WEIGHT");
  if (ir.pipeline.slice(weightIndex + 1, -1).length !== 0) throw new Error("UNSUPPORTED_IR_PROFILE");
  return { weight: weights[0] as Extract<ResearchOperationV1, { type: "WEIGHT" }>, rebalance: rebalances[0] as Extract<ResearchOperationV1, { type: "REBALANCE" }> };
}

function materialMap(materials: readonly VerifiedDatasetSeriesMaterialV1[], fieldId: string) {
  const map = new Map<string, Map<string, ExactRationalV1>>();
  for (const material of materials.filter((entry) => entry.series.fieldId === fieldId)) {
    const byDate = new Map<string, ExactRationalV1>();
    for (const observation of material.observations) byDate.set(observation.date, decimalStringToRationalV1(observation.value));
    map.set(material.series.instrumentId, byDate);
  }
  return map;
}

function getPrice(prices: Map<string, Map<string, ExactRationalV1>>, instrumentId: string, session: string, code: ResearchExecutionFailureCodeV1): ExactRationalV1 {
  const price = prices.get(instrumentId)?.get(session);
  if (!price) throw new Error(code);
  return price;
}

function nav(cash: ExactRationalV1, positions: ReadonlyMap<string, Position>, prices: Map<string, Map<string, ExactRationalV1>>, session: string, code: ResearchExecutionFailureCodeV1) {
  let total = cash;
  for (const [instrumentId, position] of positions) {
    const price = getPrice(prices, instrumentId, session, code);
    total = addRationalV1(total, multiplyRationalV1(position.quantity, price));
  }
  return total;
}

function executeIntent(intent: Intent, cash: ExactRationalV1, positions: Map<string, Position>, prices: Map<string, Map<string, ExactRationalV1>>, session: string, preTradeNav: ExactRationalV1) {
  const target = new Map<string, ExactRationalV1>();
  const instruments = [...new Set([...positions.keys(), ...intent.weights.keys()])].sort(compareBytes);
  for (const instrumentId of instruments) {
    const weight = intent.weights.get(instrumentId) ?? zero;
    const price = getPrice(prices, instrumentId, session, "MISSING_REQUIRED_EXECUTION_PRICE");
    const quantity = decimalStringToRationalV1(renderQuantityOutputV1(divideRationalV1(multiplyRationalV1(preTradeNav, weight), price)));
    target.set(instrumentId, quantity);
  }
  let nextCash = cash;
  const records: CanonicalJsonValue[] = [];
  for (const group of ["SELL", "BUY"] as const) {
    for (const instrumentId of instruments) {
      const current = positions.get(instrumentId)?.quantity ?? zero;
      const desired = target.get(instrumentId) ?? zero;
      const delta = subtractRationalV1(desired, current);
      if ((group === "SELL" && compareRationalV1(delta, zero) >= 0) || (group === "BUY" && compareRationalV1(delta, zero) <= 0)) continue;
      const price = getPrice(prices, instrumentId, session, "MISSING_REQUIRED_EXECUTION_PRICE");
      const quantity = group === "SELL" ? subtractRationalV1(current, desired) : delta;
      const notional = multiplyRationalV1(quantity, price);
      const cashBefore = nextCash;
      nextCash = group === "SELL" ? addRationalV1(nextCash, notional) : subtractRationalV1(nextCash, notional);
      if (compareRationalV1(nextCash, zero) < 0) throw new Error("ACCOUNTING_INVARIANT_VIOLATION");
      if (compareRationalV1(desired, zero) === 0) positions.delete(instrumentId);
      else positions.set(instrumentId, { quantity: desired });
      records.push({
        type: "FILL",
        originatingTargetIntent: intent.sequence,
        executionSession: session,
        instrumentId,
        side: group,
        quantity: renderQuantityOutputV1(quantity),
        price: renderMoneyOutputV1(price),
        notional: renderMoneyOutputV1(notional),
        preQuantity: renderQuantityOutputV1(current),
        postQuantity: renderQuantityOutputV1(desired),
        cashBefore: renderMoneyOutputV1(cashBefore),
        cashAfter: renderMoneyOutputV1(nextCash),
      });
    }
  }
  return { cash: nextCash, records };
}

function evaluatePipeline(pipeline: readonly ResearchOperationV1[], universe: readonly string[], positions: ReadonlyMap<string, Position>, prices: Map<string, Map<string, ExactRationalV1>>, volumes: Map<string, Map<string, ExactRationalV1>>, session: string) {
  let eligible = [...universe];
  const observations: CanonicalJsonValue[] = [];
  let weights = new Map<string, ExactRationalV1>();
  for (const operation of pipeline) {
    if (operation.type === "REBALANCE") break;
    if (operation.type === "FILTER") eligible = eligible.filter((instrumentId) => evalBool(operation.predicate, instrumentId, prices, volumes, session, observations) === true);
    if (operation.type === "RANK") {
      eligible = eligible.map((instrumentId) => ({ instrumentId, value: rationalFieldValue(operation.field, instrumentId, prices, volumes, session, observations) }))
        .filter((entry) => entry.value || operation.missingPolicy === "LAST")
        .sort((left, right) => {
          if (!left.value && !right.value) return compareBytes(left.instrumentId, right.instrumentId);
          if (!left.value) return 1;
          if (!right.value) return -1;
          const cmp = compareRationalV1(left.value, right.value);
          return (operation.direction === "ASC" ? cmp : -cmp) || compareBytes(left.instrumentId, right.instrumentId);
        }).map((entry) => entry.instrumentId);
    }
    if (operation.type === "TAKE") eligible = eligible.slice(0, Number(operation.count));
    if (operation.type === "ENTER") eligible = eligible.filter((instrumentId) => positions.has(instrumentId) || evalBool(operation.condition, instrumentId, prices, volumes, session, observations) === true);
    if (operation.type === "EXIT") {
      const exited = new Set(universe.filter((instrumentId) => positions.has(instrumentId) && evalBool(operation.condition, instrumentId, prices, volumes, session, observations) === true));
      eligible = eligible.filter((instrumentId) => !exited.has(instrumentId));
    }
    if (operation.type === "WEIGHT") {
      if (operation.method === "EQUAL") {
        weights = new Map(eligible.map((instrumentId) => [instrumentId, eligible.length ? divideRationalV1(one, integerToRationalV1(BigInt(eligible.length))) : zero]));
      } else {
        const eligibleSet = new Set(eligible);
        weights = new Map(operation.targets.map((target) => [target.instrumentId, eligibleSet.has(target.instrumentId) ? decimalStringToRationalV1(target.weight) : zero]));
      }
    }
  }
  return { eligible, weights, observations: observations.sort((left, right) => compareBytes(JSON.stringify(left), JSON.stringify(right))) };
}

function evalBool(expr: BooleanExpressionV1, instrumentId: string, prices: Map<string, Map<string, ExactRationalV1>>, volumes: Map<string, Map<string, ExactRationalV1>>, session: string, observations: CanonicalJsonValue[]): boolean | null {
  if (expr.type === "AND") {
    let sawMissing = false;
    for (const clause of expr.clauses) {
      const value = evalBool(clause, instrumentId, prices, volumes, session, observations);
      if (value === false) return false;
      if (value === null) sawMissing = true;
    }
    return sawMissing ? null : true;
  }
  if (expr.type === "OR") {
    let sawMissing = false;
    for (const clause of expr.clauses) {
      const value = evalBool(clause, instrumentId, prices, volumes, session, observations);
      if (value === true) return true;
      if (value === null) sawMissing = true;
    }
    return sawMissing ? null : false;
  }
  if (expr.type === "NOT") {
    const value = evalBool(expr.clause, instrumentId, prices, volumes, session, observations);
    return value === null ? null : !value;
  }
  const left = fieldValue(expr.left, instrumentId, prices, volumes, session, observations);
  const right = "fieldId" in expr.right ? fieldValue(expr.right, instrumentId, prices, volumes, session, observations) : literalValue(expr.right);
  if (!left || !right) return null;
  if (left.kind !== right.kind) return null;
  const cmp = left.kind === "DATE" && right.kind === "DATE"
    ? (left.value === right.value ? 0 : left.value < right.value ? -1 : 1)
    : left.kind === "RATIONAL" && right.kind === "RATIONAL"
      ? compareRationalV1(left.value, right.value)
      : 0;
  return expr.operator === "EQ" ? cmp === 0 : expr.operator === "NEQ" ? cmp !== 0 : expr.operator === "GT" ? cmp > 0 : expr.operator === "GTE" ? cmp >= 0 : expr.operator === "LT" ? cmp < 0 : cmp <= 0;
}

function rationalFieldValue(field: DataFieldRefV1, instrumentId: string, prices: Map<string, Map<string, ExactRationalV1>>, volumes: Map<string, Map<string, ExactRationalV1>>, session: string, observations: CanonicalJsonValue[]): ExactRationalV1 | null {
  const value = fieldValue(field, instrumentId, prices, volumes, session, observations);
  return value?.kind === "RATIONAL" ? value.value : null;
}

function fieldValue(field: DataFieldRefV1, instrumentId: string, prices: Map<string, Map<string, ExactRationalV1>>, volumes: Map<string, Map<string, ExactRationalV1>>, session: string, observations: CanonicalJsonValue[]): FieldRuntimeValue | null {
  let value: ExactRationalV1 | null = null;
  if (field.fieldId === "ADJUSTED_CLOSE") value = prices.get(instrumentId)?.get(session) ?? null;
  if (field.fieldId === "VOLUME") value = volumes.get(instrumentId)?.get(session) ?? null;
  if (field.fieldId === "TOTAL_RETURN") {
    const previous = previousXnysSessionV1(session);
    const currentPrice = prices.get(instrumentId)?.get(session);
    const previousPrice = previous ? prices.get(instrumentId)?.get(previous) : null;
    value = currentPrice && previousPrice ? subtractRationalV1(divideRationalV1(currentPrice, previousPrice), one) : null;
  }
  if (field.fieldId === "MOMENTUM_12M") {
    const anchor = latestXnysSessionOnOrBeforeV1(subtractCalendarMonthsV1(session, 12));
    const currentPrice = prices.get(instrumentId)?.get(session);
    const anchorPrice = anchor ? prices.get(instrumentId)?.get(anchor) : null;
    value = currentPrice && anchorPrice ? subtractRationalV1(divideRationalV1(currentPrice, anchorPrice), one) : null;
  }
  if (field.fieldId === "OBSERVATION_DATE") {
    observations.push({ instrumentId, fieldId: field.fieldId, value: session });
    return { kind: "DATE", value: session };
  }
  if (value) observations.push({ instrumentId, fieldId: field.fieldId, value: renderRatioOutputV1(value) });
  return value ? { kind: "RATIONAL", value } : null;
}

function literalValue(literal: Exclude<BooleanExpressionV1 extends infer T ? T : never, never> extends never ? never : { type: string; value?: unknown }): FieldRuntimeValue | null {
  if (literal.type === "DECIMAL" || literal.type === "INTEGER") return { kind: "RATIONAL", value: decimalStringToRationalV1(String(literal.value)) };
  if (literal.type === "DATE") return { kind: "DATE", value: String(literal.value) };
  return null;
}

function weightsRecord(weights: ReadonlyMap<string, ExactRationalV1>, render: (value: ExactRationalV1) => string): CanonicalJsonValue {
  return [...weights.entries()].sort((a, b) => compareBytes(a[0], b[0])).map(([instrumentId, weight]) => ({ instrumentId, weight: render(weight) }));
}

function compareBytes(left: string, right: string) {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function isFailureCode(value: string): value is ResearchExecutionFailureCodeV1 {
  return [
    "UNSUPPORTED_RUN_PROFILE", "UNSUPPORTED_ENGINE", "UNSUPPORTED_EXECUTION_CONFIG", "UNSUPPORTED_IR_PROFILE", "CALENDAR_OUT_OF_RANGE",
    "DATASET_MATERIAL_NOT_FOUND", "DATASET_MATERIAL_HASH_MISMATCH", "DATASET_MATERIAL_SCHEMA_INVALID", "DATASET_MATERIAL_COUNT_MISMATCH", "DATASET_MATERIAL_COVERAGE_MISMATCH",
    "NO_ELIGIBLE_SESSIONS", "MISSING_REQUIRED_EXECUTION_PRICE", "MISSING_REQUIRED_VALUATION_PRICE", "MISSING_REQUIRED_BENCHMARK_PRICE",
    "NUMERIC_INVARIANT_VIOLATION", "ACCOUNTING_INVARIANT_VIOLATION", "RESULT_ARTIFACT_LIMIT_EXCEEDED",
  ].includes(value);
}
