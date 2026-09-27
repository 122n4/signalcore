import { sha256HexV1, type CanonicalJsonValue, type HashRefV1, hashRefV1 } from "./canonical";
import { latestXnysSessionOnOrBeforeV2, nextXnysSessionV2, previousXnysSessionV2, rebalanceSessionsV2, xnysSessionsInRangeV2 } from "./calendars";
import { subtractCalendarMonthsV1 } from "./civilDate";
import { type DatasetSeriesHashPayloadV1, type ExecutionConfigHashPayloadV1, type MetricRequestSetHashPayloadV1 } from "./executionMaterials";
import {
  addRationalV1,
  compareRationalV1,
  decimalStringToRationalV1,
  divideRationalV1,
  integerToRationalV1,
  multiplyRationalV1,
  reduceRationalV1,
  renderMoneyOutputV2,
  renderQuantityOutputV1,
  renderRatioOutputV1,
  subtractRationalV1,
  type ExactRationalV1,
} from "./exactRational";
import { type BooleanExpressionV1, type DataFieldRefV1, type ResearchIrV1, type ResearchOperationV1 } from "./index";
import { canonicalJsonlArtifactBytesV1, artifactDescriptorV1, type ExecutionResultFieldsV1, type ResultHashPayloadV1 } from "./resultArtifacts";
import { metricRegistryVersionV2, metricResultRecordsV1, metricResultRecordsV2, type MetricFillRecordV2, type MetricBenchmarkRecordV2, type ValuationRecordV1 } from "./researchMetrics";
import { type RunInputHashPayloadV1 } from "./canonical";
import { assertOhlcInvariantsV2, type VerifiedDatasetSeriesMaterialV1 } from "./datasetMaterial";
import {
  assertDatasetSeriesV2,
  assertEngineV2ExecutionConfig,
  assertEngineV2MaterialBinding,
  assertEngineV2MetricRequestSet,
  assertEngineV2ResearchIrFieldContract,
  assertEngineV2RunInputProfile,
  costPoliciesV2,
  slippagePoliciesV2,
} from "./engineV2ScientificProfile";

export type ResearchExecutionFailureCodeV2 =
  | "UNSUPPORTED_RUN_PROFILE"
  | "UNSUPPORTED_ENGINE"
  | "UNSUPPORTED_EXECUTION_CONFIG"
  | "UNSUPPORTED_IR_PROFILE"
  | "UNSUPPORTED_V2_FIELD"
  | "UNSUPPORTED_V2_FIELD_VERSION"
  | "UNSUPPORTED_V2_DETERMINISTIC_SEED"
  | "UNSUPPORTED_V2_MATERIAL_POLICIES"
  | "UNSUPPORTED_V2_METRIC_REQUEST_SET"
  | "CALENDAR_OUT_OF_RANGE"
  | "NO_ELIGIBLE_SESSIONS"
  | "DATASET_MATERIAL_NOT_FOUND"
  | "DATASET_MATERIAL_HASH_MISMATCH"
  | "DATASET_MATERIAL_SCHEMA_INVALID"
  | "DATASET_MATERIAL_COUNT_MISMATCH"
  | "DATASET_MATERIAL_COVERAGE_MISMATCH"
  | "OHLC_INVARIANT_VIOLATION"
  | "VOLUME_POINT_IN_TIME_PROVENANCE_UNAVAILABLE"
  | "MISSING_REQUIRED_EXECUTION_OPEN"
  | "MISSING_REQUIRED_VALUATION_CLOSE"
  | "MISSING_REQUIRED_BENCHMARK_CLOSE"
  | "NUMERIC_INVARIANT_VIOLATION"
  | "ACCOUNTING_INVARIANT_VIOLATION"
  | "RESULT_ARTIFACT_LIMIT_EXCEEDED";

export type ResearchExecutionSuccessV2 = Readonly<{
  ok: true;
  artifacts: {
    executionTraceBytes: Buffer;
    valuationSeriesBytes: Buffer;
    metricResultSetBytes: Buffer;
    benchmarkSeriesBytes: Buffer | null;
  };
  resultPayload: ResultHashPayloadV1;
}>;

export type ResearchExecutionResultV2 = ResearchExecutionSuccessV2 | Readonly<{ ok: false; code: ResearchExecutionFailureCodeV2 }>;
export type HistoricalKernelInputV2 = Readonly<{
  researchIr: ResearchIrV1;
  datasetSeries: readonly DatasetSeriesHashPayloadV1[];
  executionConfig: ExecutionConfigHashPayloadV1;
  metricRequestSet: MetricRequestSetHashPayloadV1;
  materials: readonly VerifiedDatasetSeriesMaterialV1[];
}>;
type EngineInputV2 = HistoricalKernelInputV2 & Readonly<{ runInput: RunInputHashPayloadV1; runInputHash: HashRefV1 }>;

type Position = { quantity: ExactRationalV1 };
type Intent = Readonly<{ sequence: string; evaluationSequence: string; signalSession: string; executionSession: string; weights: ReadonlyMap<string, ExactRationalV1> }>;
type FieldRuntimeValue = Readonly<{ kind: "RATIONAL"; value: ExactRationalV1 }> | Readonly<{ kind: "DATE"; value: string }>;

const zero = integerToRationalV1(0n);
const one = integerToRationalV1(1n);
const bpsDenominator = integerToRationalV1(10000n);
const maxArtifactBytes = 67_108_864;

export function executeHistoricalBacktestV2(input: EngineInputV2): ResearchExecutionResultV2 {
  try {
    validateProfile(input);
    const kernel = executeHistoricalKernelV2(input);
    if (kernel.ok === false) return kernel;
    return {
      ok: true,
      artifacts: kernel.artifacts,
      resultPayload: {
        schemaVersion: "RESULT_HASH_PAYLOAD_V1",
        runInput: hashRefV1(input.runInputHash),
        ...kernel.resultFields,
      },
    };
  } catch (error) {
    return failure(error);
  }
}

export function executeHistoricalKernelV2(input: HistoricalKernelInputV2): Readonly<{ ok: true; artifacts: ResearchExecutionSuccessV2["artifacts"]; resultFields: ExecutionResultFieldsV1 } | { ok: false; code: ResearchExecutionFailureCodeV2 }> {
  try {
    validateHistoricalKernelProfileV2(input);
    assertEngineV2MaterialBinding(input);
    assertOhlcInvariantsV2(input.materials);
    const sessions = xnysSessionsInRangeV2(input.researchIr.testPeriod.startDate, input.researchIr.testPeriod.endDate);
    if (sessions.length < 1) return { ok: false, code: "NO_ELIGIBLE_SESSIONS" };
    const executable = validateExecutableIrV2(input.researchIr);
    const open = materialMap(input.materials, "ADJUSTED_OPEN");
    const high = materialMap(input.materials, "ADJUSTED_HIGH");
    const low = materialMap(input.materials, "ADJUSTED_LOW");
    const close = materialMap(input.materials, "ADJUSTED_CLOSE");
    const volumes = materialMap(input.materials, "VOLUME");
    const instruments = [...input.researchIr.universe.instrumentIds].sort(compareBytes);
    const rebalanceSignals = rebalanceSessionsV2(sessions, executable.rebalance.schedule);
    const feeBps = policyBps(input.executionConfig.costsPolicy, costPoliciesV2);
    const slippageBps = policyBps(input.executionConfig.slippagePolicy, slippagePoliciesV2);
    let cash = decimalStringToRationalV1(input.researchIr.startingCapital.amount);
    let cumulativeExplicitFees = zero;
    let cumulativeSlippageCost = zero;
    const positions = new Map<string, Position>();
    let pending: Intent | null = null;
    let sequence = 0;
    const trace: CanonicalJsonValue[] = [];
    const valuations: (ValuationRecordV1 & { marketValueExact: ExactRationalV1; cumulativeExplicitFees: string; cumulativeSlippageCost: string })[] = [];
    const benchmarkRecords: CanonicalJsonValue[] = [];
    const benchmarkMetricRecords: MetricBenchmarkRecordV2[] = [];
    const metricFills: MetricFillRecordV2[] = [];
    const benchmarkStartPrice = input.researchIr.benchmark.benchmark === "INSTRUMENT"
      ? getPrice(close, input.researchIr.benchmark.instrumentId, sessions[0]!, "MISSING_REQUIRED_BENCHMARK_CLOSE")
      : null;

    for (const session of sessions) {
      if (pending?.executionSession === session) {
        const fill = executeIntent(pending, cash, positions, open, session, feeBps, slippageBps);
        cash = fill.cash;
        cumulativeExplicitFees = addRationalV1(cumulativeExplicitFees, fill.explicitFees);
        cumulativeSlippageCost = addRationalV1(cumulativeSlippageCost, fill.slippageCost);
        for (const metricFill of fill.metricFills) metricFills.push(metricFill);
        for (const record of fill.records) trace.push({ ...(record as Record<string, CanonicalJsonValue>), sequence: String(sequence++) });
        pending = null;
      }

      const currentNav = nav(cash, positions, close, session, "MISSING_REQUIRED_VALUATION_CLOSE");
      const marketValue = subtractRationalV1(currentNav, cash);
      valuations.push({
        sessionDate: session,
        cash: renderMoneyOutputV2(cash),
        marketValue: renderMoneyOutputV2(marketValue),
        nav: renderMoneyOutputV2(currentNav),
        navExact: currentNav,
        marketValueExact: marketValue,
        cumulativeExplicitFees: renderMoneyOutputV2(cumulativeExplicitFees),
        cumulativeSlippageCost: renderMoneyOutputV2(cumulativeSlippageCost),
      });

      if (benchmarkStartPrice) {
        const benchmarkPrice = getPrice(close, (input.researchIr.benchmark as { instrumentId: string }).instrumentId, session, "MISSING_REQUIRED_BENCHMARK_CLOSE");
        const value = multiplyRationalV1(decimalStringToRationalV1(input.researchIr.startingCapital.amount), divideRationalV1(benchmarkPrice, benchmarkStartPrice));
        benchmarkRecords.push({ sessionDate: session, value: exactRationalTrace(value) });
        benchmarkMetricRecords.push({ sessionDate: session, valueExact: value });
      }

      const evaluation = evaluatePipeline(input.researchIr.pipeline, instruments, positions, { open, high, low, close, volumes }, session);
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
        const executionSession = nextXnysSessionV2(session);
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
      cumulativeExplicitFees: valuation.cumulativeExplicitFees,
      cumulativeSlippageCost: valuation.cumulativeSlippageCost,
    }));
    const metricRecords = input.metricRequestSet.metricRegistryVersion === metricRegistryVersionV2
      ? metricResultRecordsV2({ valuations, fills: metricFills, benchmark: benchmarkMetricRecords })
      : metricResultRecordsV1(valuations);
    const metricResultSetSchema = input.metricRequestSet.metricRegistryVersion === metricRegistryVersionV2 ? "METRIC_RESULT_SET_V2" : "METRIC_RESULT_SET_V1";
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
      resultFields: {
        engineId: "HISTORICAL_EXECUTION_ADAPTER",
        engineVersion: "ENGINE_V20260926",
        executionModelClass: "NEXT_SESSION_ADJUSTED_OHLCV_RESEARCH_V2",
        valuationCurrency: "USD",
        testPeriod: input.researchIr.testPeriod,
        startingNav: renderMoneyOutputV2(valuations[0]!.navExact),
        endingNav: valuations.at(-1)!.nav,
        terminalCash: valuations.at(-1)!.cash,
        executionTrace: artifactDescriptorV1("RESEARCH_EXECUTION_TRACE_V2", executionTraceBytes, trace.length),
        valuationSeries: artifactDescriptorV1("RESEARCH_VALUATION_SERIES_V2", valuationSeriesBytes, valuationRecords.length),
        metricResultSet: artifactDescriptorV1(metricResultSetSchema, metricResultSetBytes, metricRecords.length),
        benchmark: benchmarkSeriesBytes ? artifactDescriptorV1("RESEARCH_BENCHMARK_SERIES_V2", benchmarkSeriesBytes, benchmarkRecords.length) : null,
      },
    };
  } catch (error) {
    return failure(error);
  }
}

export function validateHistoricalKernelProfileV2(input: Omit<HistoricalKernelInputV2, "materials"> & { materials?: readonly VerifiedDatasetSeriesMaterialV1[] }): void {
  assertEngineV2ExecutionConfig(input.executionConfig);
  assertEngineV2MetricRequestSet(input.metricRequestSet);
  for (const series of input.datasetSeries) assertDatasetSeriesV2(series);
  validateExecutableIrV2(input.researchIr);
}

function validateProfile(input: Omit<EngineInputV2, "materials">): void {
  assertEngineV2RunInputProfile(input.runInput);
  validateHistoricalKernelProfileV2(input);
}

function validateExecutableIrV2(ir: ResearchIrV1) {
  if (ir.universe.type !== "EXPLICIT_INSTRUMENTS" || ir.startingCapital.origin !== "SIMULATED" || ir.valuationCurrency !== "USD" || ir.startingCapital.currency !== "USD") throw new Error("UNSUPPORTED_IR_PROFILE");
  const weights = ir.pipeline.filter((operation) => operation.type === "WEIGHT");
  const rebalances = ir.pipeline.filter((operation) => operation.type === "REBALANCE");
  if (weights.length !== 1 || rebalances.length !== 1 || ir.pipeline.at(-1)?.type !== "REBALANCE") throw new Error("UNSUPPORTED_IR_PROFILE");
  assertEngineV2ResearchIrFieldContract(ir);
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

function getPrice(prices: Map<string, Map<string, ExactRationalV1>>, instrumentId: string, session: string, code: ResearchExecutionFailureCodeV2): ExactRationalV1 {
  const price = prices.get(instrumentId)?.get(session);
  if (!price) throw new Error(code);
  return price;
}

function nav(cash: ExactRationalV1, positions: ReadonlyMap<string, Position>, prices: Map<string, Map<string, ExactRationalV1>>, session: string, code: ResearchExecutionFailureCodeV2) {
  let total = cash;
  for (const [instrumentId, position] of positions) total = addRationalV1(total, multiplyRationalV1(position.quantity, getPrice(prices, instrumentId, session, code)));
  return total;
}

function executeIntent(intent: Intent, cash: ExactRationalV1, positions: Map<string, Position>, opens: Map<string, Map<string, ExactRationalV1>>, session: string, feeBps: bigint, slippageBps: bigint) {
  const target = new Map<string, ExactRationalV1>();
  const instruments = [...new Set([...positions.keys(), ...intent.weights.keys()])].sort(compareBytes);
  const preTradeNav = nav(cash, positions, opens, session, "MISSING_REQUIRED_EXECUTION_OPEN");
  for (const instrumentId of instruments) {
    const weight = intent.weights.get(instrumentId) ?? zero;
    const open = getPrice(opens, instrumentId, session, "MISSING_REQUIRED_EXECUTION_OPEN");
    target.set(instrumentId, decimalStringToRationalV1(renderQuantityOutputV1(divideRationalV1(multiplyRationalV1(preTradeNav, weight), open))));
  }
  let nextCash = cash;
  let explicitFees = zero;
  let slippageCost = zero;
  const records: CanonicalJsonValue[] = [];
  const metricFills: MetricFillRecordV2[] = [];
  const buyDeltas = new Map<string, ExactRationalV1>();
  for (const instrumentId of instruments) {
    const current = positions.get(instrumentId)?.quantity ?? zero;
    const desired = target.get(instrumentId) ?? zero;
    const delta = subtractRationalV1(desired, current);
    if (compareRationalV1(delta, zero) < 0) {
      const fill = fillRecord(intent.sequence, instrumentId, "SELL", subtractRationalV1(current, desired), current, desired, nextCash, opens, session, feeBps, slippageBps);
      nextCash = fill.cashAfterExact;
      explicitFees = addRationalV1(explicitFees, fill.feeExact);
      slippageCost = addRationalV1(slippageCost, fill.slippageExact);
      if (compareRationalV1(desired, zero) === 0) positions.delete(instrumentId);
      else positions.set(instrumentId, { quantity: desired });
      records.push(fill.record);
      metricFills.push({ originatingTargetIntent: intent.sequence, grossNotional: fill.grossNotionalExact });
    } else if (compareRationalV1(delta, zero) > 0) {
      buyDeltas.set(instrumentId, delta);
    }
  }
  const frozenCash = nextCash;
  let totalRequirement = zero;
  for (const [instrumentId, quantity] of buyDeltas) totalRequirement = addRationalV1(totalRequirement, buyRequirement(quantity, getPrice(opens, instrumentId, session, "MISSING_REQUIRED_EXECUTION_OPEN"), feeBps, slippageBps));
  const lambda = compareRationalV1(totalRequirement, zero) > 0 && compareRationalV1(totalRequirement, frozenCash) > 0 ? divideRationalV1(frozenCash, totalRequirement) : one;
  if (compareRationalV1(lambda, one) < 0) records.push({ type: "BUYING_POWER_SCALE", originatingTargetIntent: intent.sequence, executionSession: session, scaleFactor: exactRationalTrace(lambda) });
  for (const instrumentId of [...buyDeltas.keys()].sort(compareBytes)) {
    const current = positions.get(instrumentId)?.quantity ?? zero;
    const desiredDelta = buyDeltas.get(instrumentId)!;
    const quantity = decimalStringToRationalV1(renderQuantityOutputV1(multiplyRationalV1(desiredDelta, lambda)));
    if (compareRationalV1(quantity, zero) <= 0) continue;
    const desired = addRationalV1(current, quantity);
    const fill = fillRecord(intent.sequence, instrumentId, "BUY", quantity, current, desired, nextCash, opens, session, feeBps, slippageBps);
    nextCash = fill.cashAfterExact;
    explicitFees = addRationalV1(explicitFees, fill.feeExact);
    slippageCost = addRationalV1(slippageCost, fill.slippageExact);
    positions.set(instrumentId, { quantity: desired });
    records.push(fill.record);
    metricFills.push({ originatingTargetIntent: intent.sequence, grossNotional: fill.grossNotionalExact });
  }
  if (compareRationalV1(nextCash, zero) < 0) throw new Error("ACCOUNTING_INVARIANT_VIOLATION");
  return { cash: nextCash, explicitFees, slippageCost, records, metricFills };
}

function fillRecord(intent: string, instrumentId: string, side: "BUY" | "SELL", quantity: ExactRationalV1, preQuantity: ExactRationalV1, postQuantity: ExactRationalV1, cashBefore: ExactRationalV1, opens: Map<string, Map<string, ExactRationalV1>>, session: string, feeBps: bigint, slippageBps: bigint) {
  const referenceOpen = getPrice(opens, instrumentId, session, "MISSING_REQUIRED_EXECUTION_OPEN");
  const slip = divideRationalV1(integerToRationalV1(slippageBps), bpsDenominator);
  const effectiveFillPrice = multiplyRationalV1(referenceOpen, side === "BUY" ? addRationalV1(one, slip) : subtractRationalV1(one, slip));
  const grossNotional = multiplyRationalV1(quantity, effectiveFillPrice);
  const feeExact = multiplyRationalV1(grossNotional, divideRationalV1(integerToRationalV1(feeBps), bpsDenominator));
  const slippageExact = absRational(multiplyRationalV1(quantity, subtractRationalV1(effectiveFillPrice, referenceOpen)));
  const cashAfterExact = side === "BUY" ? subtractRationalV1(subtractRationalV1(cashBefore, grossNotional), feeExact) : subtractRationalV1(addRationalV1(cashBefore, grossNotional), feeExact);
  return {
    cashAfterExact,
    feeExact,
    grossNotionalExact: grossNotional,
    slippageExact,
    record: {
      type: "FILL",
      originatingTargetIntent: intent,
      executionSession: session,
      instrumentId,
      side,
      referenceOpen: renderMoneyOutputV2(referenceOpen),
      effectiveFillPrice: renderMoneyOutputV2(effectiveFillPrice),
      quantity: renderQuantityOutputV1(quantity),
      grossNotional: renderMoneyOutputV2(grossNotional),
      explicitFee: renderMoneyOutputV2(feeExact),
      slippageCost: renderMoneyOutputV2(slippageExact),
      preQuantity: renderQuantityOutputV1(preQuantity),
      postQuantity: renderQuantityOutputV1(postQuantity),
      cashBefore: renderMoneyOutputV2(cashBefore),
      cashAfter: renderMoneyOutputV2(cashAfterExact),
    },
  };
}

function buyRequirement(quantity: ExactRationalV1, referenceOpen: ExactRationalV1, feeBps: bigint, slippageBps: bigint) {
  const effective = multiplyRationalV1(referenceOpen, addRationalV1(one, divideRationalV1(integerToRationalV1(slippageBps), bpsDenominator)));
  const gross = multiplyRationalV1(quantity, effective);
  return addRationalV1(gross, multiplyRationalV1(gross, divideRationalV1(integerToRationalV1(feeBps), bpsDenominator)));
}

function evaluatePipeline(pipeline: readonly ResearchOperationV1[], universe: readonly string[], positions: ReadonlyMap<string, Position>, maps: { open: Map<string, Map<string, ExactRationalV1>>; high: Map<string, Map<string, ExactRationalV1>>; low: Map<string, Map<string, ExactRationalV1>>; close: Map<string, Map<string, ExactRationalV1>>; volumes: Map<string, Map<string, ExactRationalV1>> }, session: string) {
  let eligible = [...universe];
  const observations: CanonicalJsonValue[] = [];
  let weights = new Map<string, ExactRationalV1>();
  for (const operation of pipeline) {
    if (operation.type === "REBALANCE") break;
    if (operation.type === "FILTER") eligible = eligible.filter((instrumentId) => evalBool(operation.predicate, instrumentId, maps, session, observations) === true);
    if (operation.type === "RANK") {
      eligible = eligible.map((instrumentId) => ({ instrumentId, value: rationalFieldValue(operation.field, instrumentId, maps, session, observations) }))
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
    if (operation.type === "ENTER") eligible = eligible.filter((instrumentId) => positions.has(instrumentId) || evalBool(operation.condition, instrumentId, maps, session, observations) === true);
    if (operation.type === "EXIT") {
      const exited = new Set(universe.filter((instrumentId) => positions.has(instrumentId) && evalBool(operation.condition, instrumentId, maps, session, observations) === true));
      eligible = eligible.filter((instrumentId) => !exited.has(instrumentId));
    }
    if (operation.type === "WEIGHT") {
      if (operation.method === "EQUAL") weights = new Map(eligible.map((instrumentId) => [instrumentId, eligible.length ? divideRationalV1(one, integerToRationalV1(BigInt(eligible.length))) : zero]));
      else {
        const eligibleSet = new Set(eligible);
        weights = new Map(operation.targets.map((target) => [target.instrumentId, eligibleSet.has(target.instrumentId) ? decimalStringToRationalV1(target.weight) : zero]));
      }
    }
  }
  return { eligible, weights, observations: observations.sort((left, right) => compareBytes(JSON.stringify(left), JSON.stringify(right))) };
}

function evalBool(expr: BooleanExpressionV1, instrumentId: string, maps: Parameters<typeof evaluatePipeline>[3], session: string, observations: CanonicalJsonValue[]): boolean | null {
  if (expr.type === "AND") {
    let sawMissing = false;
    for (const clause of expr.clauses) {
      const value = evalBool(clause, instrumentId, maps, session, observations);
      if (value === false) return false;
      if (value === null) sawMissing = true;
    }
    return sawMissing ? null : true;
  }
  if (expr.type === "OR") {
    let sawMissing = false;
    for (const clause of expr.clauses) {
      const value = evalBool(clause, instrumentId, maps, session, observations);
      if (value === true) return true;
      if (value === null) sawMissing = true;
    }
    return sawMissing ? null : false;
  }
  if (expr.type === "NOT") {
    const value = evalBool(expr.clause, instrumentId, maps, session, observations);
    return value === null ? null : !value;
  }
  const left = fieldValue(expr.left, instrumentId, maps, session, observations);
  const right = "fieldId" in expr.right ? fieldValue(expr.right, instrumentId, maps, session, observations) : literalValue(expr.right);
  if (!left || !right || left.kind !== right.kind) return null;
  const cmp = left.kind === "DATE" && right.kind === "DATE" ? (left.value === right.value ? 0 : left.value < right.value ? -1 : 1) : left.kind === "RATIONAL" && right.kind === "RATIONAL" ? compareRationalV1(left.value, right.value) : 0;
  return expr.operator === "EQ" ? cmp === 0 : expr.operator === "NEQ" ? cmp !== 0 : expr.operator === "GT" ? cmp > 0 : expr.operator === "GTE" ? cmp >= 0 : expr.operator === "LT" ? cmp < 0 : cmp <= 0;
}

function rationalFieldValue(field: DataFieldRefV1, instrumentId: string, maps: Parameters<typeof evaluatePipeline>[3], session: string, observations: CanonicalJsonValue[]) {
  const value = fieldValue(field, instrumentId, maps, session, observations);
  return value?.kind === "RATIONAL" ? value.value : null;
}

function fieldValue(field: DataFieldRefV1, instrumentId: string, maps: Parameters<typeof evaluatePipeline>[3], session: string, observations: CanonicalJsonValue[]): FieldRuntimeValue | null {
  if (field.fieldVersion !== "I5_RL4_RESEARCH_IR_FIELD_CONTRACT_V2") throw new Error("UNSUPPORTED_V2_FIELD_VERSION");
  const close = maps.close.get(instrumentId)?.get(session);
  let value: ExactRationalV1 | null = null;
  if (field.fieldId === "VOLUME") value = maps.volumes.get(instrumentId)?.get(session) ?? null;
  if (field.fieldId === "TOTAL_RETURN") {
    const previous = previousXnysSessionV2(session);
    const previousClose = previous ? maps.close.get(instrumentId)?.get(previous) : null;
    value = close && previousClose ? subtractRationalV1(divideRationalV1(close, previousClose), one) : null;
  }
  if (field.fieldId === "MOMENTUM_12M") {
    const anchor = latestXnysSessionOnOrBeforeV2(subtractCalendarMonthsV1(session, 12));
    const anchorClose = anchor ? maps.close.get(instrumentId)?.get(anchor) : null;
    value = close && anchorClose ? subtractRationalV1(divideRationalV1(close, anchorClose), one) : null;
  }
  if (field.fieldId === "OPEN_TO_CLOSE_RETURN") {
    const open = maps.open.get(instrumentId)?.get(session);
    value = close && open ? subtractRationalV1(divideRationalV1(close, open), one) : null;
  }
  if (field.fieldId === "INTRADAY_RANGE_RATIO") {
    const high = maps.high.get(instrumentId)?.get(session);
    const low = maps.low.get(instrumentId)?.get(session);
    value = close && high && low ? divideRationalV1(subtractRationalV1(high, low), close) : null;
  }
  if (field.fieldId.startsWith("CLOSE_TO_SMA_")) value = closeToSma(field.fieldId, instrumentId, maps.close, session, close);
  if (field.fieldId === "CLOSE_TO_ROLLING_HIGH_20_RETURN") value = closeToRollingExtreme(instrumentId, maps.high, session, close, "HIGH");
  if (field.fieldId === "CLOSE_TO_ROLLING_LOW_20_RETURN") value = closeToRollingExtreme(instrumentId, maps.low, session, close, "LOW");
  if (field.fieldId === "OBSERVATION_DATE") {
    observations.push({ instrumentId, fieldId: field.fieldId, value: session });
    return { kind: "DATE", value: session };
  }
  if (value) observations.push({ instrumentId, fieldId: field.fieldId, value: field.fieldId === "VOLUME" ? renderQuantityOutputV1(value) : renderRatioOutputV1(value) });
  return value ? { kind: "RATIONAL", value } : null;
}

function closeToSma(fieldId: string, instrumentId: string, closes: Map<string, Map<string, ExactRationalV1>>, session: string, close: ExactRationalV1 | undefined) {
  const window = fieldId === "CLOSE_TO_SMA_20_RETURN" ? 20 : fieldId === "CLOSE_TO_SMA_50_RETURN" ? 50 : 200;
  const values = exactWindow(closes, instrumentId, session, window);
  if (!close || !values) return null;
  const total = values.reduce((sum, value) => addRationalV1(sum, value), zero);
  return subtractRationalV1(divideRationalV1(close, divideRationalV1(total, integerToRationalV1(BigInt(window)))), one);
}

function closeToRollingExtreme(instrumentId: string, valuesByInstrument: Map<string, Map<string, ExactRationalV1>>, session: string, close: ExactRationalV1 | undefined, kind: "HIGH" | "LOW") {
  const values = exactWindow(valuesByInstrument, instrumentId, session, 20);
  if (!close || !values) return null;
  let extreme = values[0]!;
  for (const value of values.slice(1)) {
    const cmp = compareRationalV1(value, extreme);
    if ((kind === "HIGH" && cmp > 0) || (kind === "LOW" && cmp < 0)) extreme = value;
  }
  return subtractRationalV1(divideRationalV1(close, extreme), one);
}

function exactWindow(map: Map<string, Map<string, ExactRationalV1>>, instrumentId: string, session: string, size: number): ExactRationalV1[] | null {
  const values: ExactRationalV1[] = [];
  let cursor: string | null = session;
  for (let index = 0; index < size; index += 1) {
    if (!cursor) return null;
    const value = map.get(instrumentId)?.get(cursor);
    if (!value) return null;
    values.push(value);
    cursor = previousXnysSessionV2(cursor);
  }
  return values;
}

function literalValue(literal: { type: string; value?: unknown }): FieldRuntimeValue | null {
  if (literal.type === "DECIMAL" || literal.type === "INTEGER") return { kind: "RATIONAL", value: decimalStringToRationalV1(String(literal.value)) };
  if (literal.type === "DATE") return { kind: "DATE", value: String(literal.value) };
  return null;
}

function weightsRecord(weights: ReadonlyMap<string, ExactRationalV1>, render: (value: ExactRationalV1) => string): CanonicalJsonValue {
  return [...weights.entries()].sort((a, b) => compareBytes(a[0], b[0])).map(([instrumentId, weight]) => ({ instrumentId, weight: render(weight) }));
}

function exactRationalTrace(value: ExactRationalV1): CanonicalJsonValue {
  const reduced = reduceRationalV1(value);
  return { numerator: reduced.numerator.toString(), denominator: reduced.denominator.toString() };
}

function absRational(value: ExactRationalV1) {
  return value.numerator < 0n ? { numerator: -value.numerator, denominator: value.denominator } : value;
}

function policyBps(policy: string, registry: Readonly<Record<string, bigint>>) {
  const value = registry[policy];
  if (value === undefined) throw new Error("UNSUPPORTED_EXECUTION_CONFIG");
  return value;
}

function compareBytes(left: string, right: string) {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function failure(error: unknown): { ok: false; code: ResearchExecutionFailureCodeV2 } {
  const code = error instanceof Error ? error.message : "NUMERIC_INVARIANT_VIOLATION";
  return isFailureCode(code) ? { ok: false, code } : { ok: false, code: "NUMERIC_INVARIANT_VIOLATION" };
}

function isFailureCode(value: string): value is ResearchExecutionFailureCodeV2 {
  return [
    "UNSUPPORTED_RUN_PROFILE", "UNSUPPORTED_ENGINE", "UNSUPPORTED_EXECUTION_CONFIG", "UNSUPPORTED_IR_PROFILE", "UNSUPPORTED_V2_FIELD",
    "UNSUPPORTED_V2_FIELD_VERSION", "UNSUPPORTED_V2_DETERMINISTIC_SEED", "UNSUPPORTED_V2_MATERIAL_POLICIES", "UNSUPPORTED_V2_METRIC_REQUEST_SET",
    "CALENDAR_OUT_OF_RANGE", "NO_ELIGIBLE_SESSIONS", "DATASET_MATERIAL_NOT_FOUND", "DATASET_MATERIAL_HASH_MISMATCH", "DATASET_MATERIAL_SCHEMA_INVALID",
    "DATASET_MATERIAL_COUNT_MISMATCH", "DATASET_MATERIAL_COVERAGE_MISMATCH", "OHLC_INVARIANT_VIOLATION", "VOLUME_POINT_IN_TIME_PROVENANCE_UNAVAILABLE",
    "MISSING_REQUIRED_EXECUTION_OPEN", "MISSING_REQUIRED_VALUATION_CLOSE", "MISSING_REQUIRED_BENCHMARK_CLOSE", "NUMERIC_INVARIANT_VIOLATION",
    "ACCOUNTING_INVARIANT_VIOLATION", "RESULT_ARTIFACT_LIMIT_EXCEEDED",
  ].includes(value);
}
