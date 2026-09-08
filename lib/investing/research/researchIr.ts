import {
  canonicalDateV1,
  canonicalDecimalV1,
  canonicalIntegerV1,
  canonicalOpaqueStringV1,
  canonicalTokenV1,
  i5ResearchInternalCanonicalJsonBytesV1,
  sha256HexV1,
  type CanonicalJsonValue,
  type CanonicalSha256HexV1,
} from "./canonical";
import { ownerStructuredHashPreimageV1 } from "./scientificPreimage";

const schemaVersionsV1 = new Set(["RESEARCH_IR_HASH_PAYLOAD_V1"]);
const irContractVersionsV1 = new Set(["I5A_RESEARCH_IR_OWNER_CONTRACT_V1"]);
const dataFieldIdsV1 = new Set(["ADJUSTED_CLOSE", "TOTAL_RETURN", "VOLUME", "MOMENTUM_12M"]);
const compareOperatorsV1 = new Set(["EQ", "NEQ", "GT", "GTE", "LT", "LTE"]);
const operationTypesV1 = new Set(["FILTER", "RANK", "TAKE", "WEIGHT", "ENTER", "EXIT", "REBALANCE", "BENCHMARK"]);
const rankDirectionsV1 = new Set(["ASC", "DESC"]);
const missingPoliciesV1 = new Set(["EXCLUDE", "LAST"]);
const rebalanceSchedulesV1 = new Set(["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY", "ANNUAL"]);
const valuationCurrenciesV1 = new Set(["USD", "EUR", "GBP", "CHF", "CAD", "AUD", "JPY"]);

export type ResearchIrV1 = Readonly<{
  schemaVersion: "RESEARCH_IR_HASH_PAYLOAD_V1";
  irVersion: "I5A_RESEARCH_IR_OWNER_CONTRACT_V1";
  universe: UniverseNodeV1;
  pipeline: readonly ResearchOperationV1[];
  execution: HistoricalExecutionNodeV1;
}>;

export type UniverseNodeV1 = Readonly<{
  type: "EXPLICIT_INSTRUMENTS";
  instrumentIds: readonly string[];
}>;

export type CanonicalLiteralV1 =
  | Readonly<{ type: "DECIMAL"; value: string; unit?: string }>
  | Readonly<{ type: "INTEGER"; value: string; unit?: string }>
  | Readonly<{ type: "BOOLEAN"; value: boolean }>
  | Readonly<{ type: "DATE"; value: string; unit?: string }>
  | Readonly<{ type: "ENUM"; value: string; unit?: string }>;

export type DataFieldRefV1 = Readonly<{
  type: "DATA_FIELD_REF";
  fieldId: "ADJUSTED_CLOSE" | "TOTAL_RETURN" | "VOLUME" | "MOMENTUM_12M";
  fieldVersion: "I5A_RESEARCH_IR_FIELD_CONTRACT_V1";
}>;

export type BooleanExpressionV1 =
  | Readonly<{ type: "COMPARE"; left: DataFieldRefV1; operator: "EQ" | "NEQ" | "GT" | "GTE" | "LT" | "LTE"; right: CanonicalLiteralV1 | DataFieldRefV1 }>
  | Readonly<{ type: "AND"; clauses: readonly BooleanExpressionV1[] }>
  | Readonly<{ type: "OR"; clauses: readonly BooleanExpressionV1[] }>
  | Readonly<{ type: "NOT"; clause: BooleanExpressionV1 }>;

export type FilterNodeV1 = Readonly<{ type: "FILTER"; predicate: BooleanExpressionV1 }>;
export type RankNodeV1 = Readonly<{ type: "RANK"; field: DataFieldRefV1; direction: "ASC" | "DESC"; missingPolicy: "EXCLUDE" | "LAST" }>;
export type TakeNodeV1 = Readonly<{ type: "TAKE"; count: string }>;
export type WeightNodeV1 =
  | Readonly<{ type: "WEIGHT"; method: "EQUAL" }>
  | Readonly<{ type: "WEIGHT"; method: "FIXED_TARGETS"; targets: readonly FixedWeightTargetV1[] }>;
export type FixedWeightTargetV1 = Readonly<{ instrumentId: string; weight: string }>;
export type EnterNodeV1 = Readonly<{ type: "ENTER"; condition: BooleanExpressionV1 }>;
export type ExitNodeV1 = Readonly<{ type: "EXIT"; condition: BooleanExpressionV1 }>;
export type RebalanceNodeV1 = Readonly<{ type: "REBALANCE"; schedule: "DAILY" | "WEEKLY" | "MONTHLY" | "QUARTERLY" | "ANNUAL" }>;
export type BenchmarkNodeV1 =
  | Readonly<{ type: "BENCHMARK"; benchmark: "NONE" }>
  | Readonly<{ type: "BENCHMARK"; benchmark: "INSTRUMENT"; instrumentId: string }>;

export type ResearchOperationV1 =
  | FilterNodeV1
  | RankNodeV1
  | TakeNodeV1
  | WeightNodeV1
  | EnterNodeV1
  | ExitNodeV1
  | RebalanceNodeV1
  | BenchmarkNodeV1;

export type ConditionOnNodeV1 = Readonly<{ type: "CONDITION_ON" }>;
export type GroupNodeV1 = Readonly<{ type: "GROUP" }>;
export type LagNodeV1 = Readonly<{ type: "LAG" }>;
export type AggregateNodeV1 = Readonly<{ type: "AGGREGATE" }>;
export type NormalizeNodeV1 = Readonly<{ type: "NORMALIZE" }>;
export type MetricRequestNodeV1 = Readonly<{ type: "METRIC_REQUEST" }>;

export type HistoricalExecutionNodeV1 = Readonly<{
  type: "HISTORICAL_EXECUTION";
  adapterId: "HISTORICAL_EXECUTION_ADAPTER_V1";
  testPeriod: Readonly<{ startDate: string; endDate: string }>;
  valuationCurrency: "USD" | "EUR" | "GBP" | "CHF" | "CAD" | "AUD" | "JPY";
  startingCapital: Readonly<{ amount: string; currency: "USD" | "EUR" | "GBP" | "CHF" | "CAD" | "AUD" | "JPY"; origin: "SIMULATED" }>;
  transactionCostModel: TransactionCostModelNodeV1;
  slippageModel: SlippageModelNodeV1;
}>;

export type TransactionCostModelNodeV1 =
  | Readonly<{ model: "EXPLICIT_ZERO"; modelVersion: "TRANSACTION_COST_EXPLICIT_ZERO_V1" }>
  | Readonly<{ model: "PROPORTIONAL_BPS"; bps: string; modelVersion: "TRANSACTION_COST_PROPORTIONAL_BPS_V1" }>;

export type SlippageModelNodeV1 =
  | Readonly<{ model: "EXPLICIT_ZERO"; modelVersion: "SLIPPAGE_EXPLICIT_ZERO_V1" }>
  | Readonly<{ model: "PROPORTIONAL_BPS"; bps: string; modelVersion: "SLIPPAGE_PROPORTIONAL_BPS_V1" }>;

export function canonicalResearchIrPayloadV1(input: ResearchIrV1): CanonicalJsonValue {
  assertClosedPlainObject(input, new Set(["schemaVersion", "irVersion", "universe", "pipeline", "execution"]));
  canonicalTokenV1(input.schemaVersion, schemaVersionsV1);
  canonicalTokenV1(input.irVersion, irContractVersionsV1);
  if (!Array.isArray(input.pipeline)) throw new Error("pipeline must be an ORDERED_SEQUENCE array");
  if (input.pipeline.length < 1 || input.pipeline.length > 64) throw new Error("pipeline length out of bounds");
  const pipeline = input.pipeline.map(canonicalResearchOperationV1);
  rejectDuplicateCanonicalElements("pipeline", pipeline);

  return {
    schemaVersion: input.schemaVersion,
    irVersion: input.irVersion,
    universe: canonicalUniverseV1(input.universe),
    pipeline,
    execution: canonicalHistoricalExecutionV1(input.execution),
  };
}

export function canonicalResearchIrBytesV1(input: ResearchIrV1): Buffer {
  return i5ResearchInternalCanonicalJsonBytesV1(canonicalResearchIrPayloadV1(input));
}

export function hashResearchIrV1(input: ResearchIrV1): CanonicalSha256HexV1 {
  return sha256HexV1(ownerStructuredHashPreimageV1("SYNTRAKE:RESEARCH_IR:V1", canonicalResearchIrPayloadV1(input)));
}

function canonicalUniverseV1(input: UniverseNodeV1): CanonicalJsonValue {
  assertClosedPlainObject(input, new Set(["type", "instrumentIds"]));
  if (input.type !== "EXPLICIT_INSTRUMENTS") throw new Error("unsupported Research IR universe");
  if (!Array.isArray(input.instrumentIds)) throw new Error("instrumentIds must be an UNORDERED_SET array");
  if (input.instrumentIds.length < 1 || input.instrumentIds.length > 512) throw new Error("instrumentIds count out of bounds");
  const instrumentIds = input.instrumentIds.map(canonicalInstrumentIdV1).sort(compareAsciiBytes);
  rejectDuplicateStrings("instrumentIds", instrumentIds);
  return { type: input.type, instrumentIds };
}

function canonicalResearchOperationV1(input: ResearchOperationV1): CanonicalJsonValue {
  assertClosedPlainObject(input, new Set(["type", "predicate", "field", "direction", "missingPolicy", "count", "method", "targets", "condition", "schedule", "benchmark", "instrumentId"]));
  const type = getStringField(input, "type");
  if (!operationTypesV1.has(type)) throw new Error("unsupported Research IR operation");
  if (type === "FILTER") return canonicalFilterV1(input as FilterNodeV1);
  if (type === "RANK") return canonicalRankV1(input as RankNodeV1);
  if (type === "TAKE") return canonicalTakeV1(input as TakeNodeV1);
  if (type === "WEIGHT") return canonicalWeightV1(input as WeightNodeV1);
  if (type === "ENTER") return canonicalEnterV1(input as EnterNodeV1);
  if (type === "EXIT") return canonicalExitV1(input as ExitNodeV1);
  if (type === "REBALANCE") return canonicalRebalanceV1(input as RebalanceNodeV1);
  return canonicalBenchmarkV1(input as BenchmarkNodeV1);
}

function canonicalFilterV1(input: FilterNodeV1): CanonicalJsonValue {
  assertExactKeys(input, new Set(["type", "predicate"]));
  return { type: "FILTER", predicate: canonicalBooleanExpressionV1(input.predicate) };
}

function canonicalRankV1(input: RankNodeV1): CanonicalJsonValue {
  assertExactKeys(input, new Set(["type", "field", "direction", "missingPolicy"]));
  return {
    type: "RANK",
    field: canonicalDataFieldRefV1(input.field),
    direction: canonicalTokenV1(input.direction, rankDirectionsV1),
    missingPolicy: canonicalTokenV1(input.missingPolicy, missingPoliciesV1),
  };
}

function canonicalTakeV1(input: TakeNodeV1): CanonicalJsonValue {
  assertExactKeys(input, new Set(["type", "count"]));
  return { type: "TAKE", count: canonicalIntegerV1(input.count, { min: "1", max: "10000", allowNegative: false }) };
}

function canonicalWeightV1(input: WeightNodeV1): CanonicalJsonValue {
  if (input.method === "EQUAL") {
    assertExactKeys(input, new Set(["type", "method"]));
    return { type: "WEIGHT", method: "EQUAL" };
  }
  if (input.method !== "FIXED_TARGETS") throw new Error("unsupported WEIGHT method");
  assertExactKeys(input, new Set(["type", "method", "targets"]));
  if (!Array.isArray(input.targets)) throw new Error("fixed weight targets must be an UNORDERED_SET array");
  if (input.targets.length < 1 || input.targets.length > 512) throw new Error("fixed weight target count out of bounds");
  const targets = input.targets.map(canonicalFixedWeightTargetV1).sort((left, right) => compareAsciiBytes(left.instrumentId, right.instrumentId));
  rejectDuplicateStrings("fixed weight targets", targets.map((target) => target.instrumentId));
  const sum = targets.reduce((total, target) => total + decimalToScaleUnits(target.weight, 8), 0);
  if (sum !== 100000000) throw new Error("fixed weight targets must sum exactly to 1");
  return { type: "WEIGHT", method: "FIXED_TARGETS", targets };
}

function canonicalFixedWeightTargetV1(input: FixedWeightTargetV1) {
  assertExactKeys(input, new Set(["instrumentId", "weight"]));
  return {
    instrumentId: canonicalInstrumentIdV1(input.instrumentId),
    weight: canonicalDecimalV1(input.weight, { allowNegative: false, min: "0", max: "1", maxIntegerDigits: 1, maxScale: 8 }),
  };
}

function canonicalEnterV1(input: EnterNodeV1): CanonicalJsonValue {
  assertExactKeys(input, new Set(["type", "condition"]));
  return { type: "ENTER", condition: canonicalBooleanExpressionV1(input.condition) };
}

function canonicalExitV1(input: ExitNodeV1): CanonicalJsonValue {
  assertExactKeys(input, new Set(["type", "condition"]));
  return { type: "EXIT", condition: canonicalBooleanExpressionV1(input.condition) };
}

function canonicalRebalanceV1(input: RebalanceNodeV1): CanonicalJsonValue {
  assertExactKeys(input, new Set(["type", "schedule"]));
  return { type: "REBALANCE", schedule: canonicalTokenV1(input.schedule, rebalanceSchedulesV1) };
}

function canonicalBenchmarkV1(input: BenchmarkNodeV1): CanonicalJsonValue {
  if (input.benchmark === "NONE") {
    assertExactKeys(input, new Set(["type", "benchmark"]));
    return { type: "BENCHMARK", benchmark: "NONE" };
  }
  if (input.benchmark !== "INSTRUMENT") throw new Error("unsupported BENCHMARK shape");
  assertExactKeys(input, new Set(["type", "benchmark", "instrumentId"]));
  return { type: "BENCHMARK", benchmark: "INSTRUMENT", instrumentId: canonicalInstrumentIdV1(input.instrumentId) };
}

function canonicalBooleanExpressionV1(input: BooleanExpressionV1): CanonicalJsonValue {
  assertClosedPlainObject(input, new Set(["type", "left", "operator", "right", "clauses", "clause"]));
  const type = getStringField(input, "type");
  if (type === "COMPARE") {
    assertExactKeys(input, new Set(["type", "left", "operator", "right"]));
    const compare = input as Extract<BooleanExpressionV1, { type: "COMPARE" }>;
    return {
      type: "COMPARE",
      left: canonicalDataFieldRefV1(compare.left),
      operator: canonicalTokenV1(compare.operator, compareOperatorsV1),
      right: canonicalComparableOperandV1(compare.right),
    };
  }
  if (type === "AND" || type === "OR") {
    assertExactKeys(input, new Set(["type", "clauses"]));
    const compound = input as Extract<BooleanExpressionV1, { type: "AND" | "OR" }>;
    if (!Array.isArray(compound.clauses)) throw new Error(`${type} clauses must be an ORDERED_SEQUENCE array`);
    if (compound.clauses.length < 2 || compound.clauses.length > 16) throw new Error(`${type} clause count out of bounds`);
    const clauses = compound.clauses.map(canonicalBooleanExpressionV1);
    rejectDuplicateCanonicalElements(`${type} clauses`, clauses);
    return { type, clauses };
  }
  if (type === "NOT") {
    assertExactKeys(input, new Set(["type", "clause"]));
    const negated = input as Extract<BooleanExpressionV1, { type: "NOT" }>;
    return { type: "NOT", clause: canonicalBooleanExpressionV1(negated.clause) };
  }
  throw new Error("unsupported BooleanExpressionV1");
}

function canonicalComparableOperandV1(input: CanonicalLiteralV1 | DataFieldRefV1): CanonicalJsonValue {
  assertClosedPlainObject(input, new Set(["type", "value", "unit", "fieldId", "fieldVersion"]));
  if (input.type === "DATA_FIELD_REF") return canonicalDataFieldRefV1(input);
  return canonicalLiteralV1(input);
}

function canonicalLiteralV1(input: CanonicalLiteralV1): CanonicalJsonValue {
  assertClosedPlainObject(input, new Set(["type", "value", "unit"]));
  if (input.type === "DECIMAL") return canonicalMaybeUnit({ type: input.type, value: canonicalDecimalV1(input.value, { maxIntegerDigits: 16, maxScale: 8 }) }, input.unit);
  if (input.type === "INTEGER") return canonicalMaybeUnit({ type: input.type, value: canonicalIntegerV1(input.value) }, input.unit);
  if (input.type === "BOOLEAN") {
    assertExactKeys(input, new Set(["type", "value"]));
    if (typeof input.value !== "boolean") throw new Error("BOOLEAN literal value must be boolean");
    return { type: input.type, value: input.value };
  }
  if (input.type === "DATE") return canonicalMaybeUnit({ type: input.type, value: canonicalDateV1(input.value) }, input.unit);
  if (input.type === "ENUM") return canonicalMaybeUnit({ type: input.type, value: canonicalIdentifierV1(input.value, "ENUM literal") }, input.unit);
  throw new Error("unsupported CanonicalLiteralV1");
}

function canonicalMaybeUnit(base: Record<string, CanonicalJsonValue>, unit: string | undefined): CanonicalJsonValue {
  if (unit === undefined) return base;
  return { ...base, unit: canonicalIdentifierV1(unit, "literal unit") };
}

function canonicalDataFieldRefV1(input: DataFieldRefV1): CanonicalJsonValue {
  assertExactKeys(input, new Set(["type", "fieldId", "fieldVersion"]));
  return {
    type: "DATA_FIELD_REF",
    fieldId: canonicalTokenV1(input.fieldId, dataFieldIdsV1),
    fieldVersion: canonicalTokenV1(input.fieldVersion, new Set(["I5A_RESEARCH_IR_FIELD_CONTRACT_V1"])),
  };
}

function canonicalHistoricalExecutionV1(input: HistoricalExecutionNodeV1): CanonicalJsonValue {
  assertExactKeys(input, new Set([
    "type",
    "adapterId",
    "testPeriod",
    "valuationCurrency",
    "startingCapital",
    "transactionCostModel",
    "slippageModel",
  ]));
  if (input.type !== "HISTORICAL_EXECUTION") throw new Error("unsupported execution node");
  if (input.adapterId !== "HISTORICAL_EXECUTION_ADAPTER_V1") throw new Error("unsupported execution adapter");
  const testPeriod = canonicalTestPeriodV1(input.testPeriod);
  const valuationCurrency = canonicalTokenV1(input.valuationCurrency, valuationCurrenciesV1);
  return {
    type: input.type,
    adapterId: input.adapterId,
    testPeriod,
    valuationCurrency,
    startingCapital: canonicalStartingCapitalV1(input.startingCapital),
    transactionCostModel: canonicalTransactionCostModelV1(input.transactionCostModel),
    slippageModel: canonicalSlippageModelV1(input.slippageModel),
  };
}

function canonicalTestPeriodV1(input: HistoricalExecutionNodeV1["testPeriod"]) {
  assertExactKeys(input, new Set(["startDate", "endDate"]));
  const startDate = canonicalDateV1(input.startDate);
  const endDate = canonicalDateV1(input.endDate);
  if (startDate > endDate) throw new Error("testPeriod startDate after endDate");
  return { startDate, endDate };
}

function canonicalStartingCapitalV1(input: HistoricalExecutionNodeV1["startingCapital"]) {
  assertExactKeys(input, new Set(["amount", "currency", "origin"]));
  if (input.origin !== "SIMULATED") throw new Error("startingCapital origin must be SIMULATED");
  return {
    amount: canonicalDecimalV1(input.amount, { allowNegative: false, min: "0.01", maxIntegerDigits: 16, maxScale: 2 }),
    currency: canonicalTokenV1(input.currency, valuationCurrenciesV1),
    origin: input.origin,
  };
}

function canonicalTransactionCostModelV1(input: TransactionCostModelNodeV1): CanonicalJsonValue {
  if (input.model === "EXPLICIT_ZERO") {
    assertExactKeys(input, new Set(["model", "modelVersion"]));
    if (input.modelVersion !== "TRANSACTION_COST_EXPLICIT_ZERO_V1") throw new Error("transaction cost modelVersion mismatch");
    return { model: input.model, modelVersion: input.modelVersion };
  }
  if (input.model !== "PROPORTIONAL_BPS") throw new Error("unsupported transaction cost model");
  assertExactKeys(input, new Set(["model", "bps", "modelVersion"]));
  if (input.modelVersion !== "TRANSACTION_COST_PROPORTIONAL_BPS_V1") throw new Error("transaction cost modelVersion mismatch");
  return {
    model: input.model,
    bps: canonicalBasisPointsV1(input.bps),
    modelVersion: input.modelVersion,
  };
}

function canonicalSlippageModelV1(input: SlippageModelNodeV1): CanonicalJsonValue {
  if (input.model === "EXPLICIT_ZERO") {
    assertExactKeys(input, new Set(["model", "modelVersion"]));
    if (input.modelVersion !== "SLIPPAGE_EXPLICIT_ZERO_V1") throw new Error("slippage modelVersion mismatch");
    return { model: input.model, modelVersion: input.modelVersion };
  }
  if (input.model !== "PROPORTIONAL_BPS") throw new Error("unsupported slippage model");
  assertExactKeys(input, new Set(["model", "bps", "modelVersion"]));
  if (input.modelVersion !== "SLIPPAGE_PROPORTIONAL_BPS_V1") throw new Error("slippage modelVersion mismatch");
  return {
    model: input.model,
    bps: canonicalBasisPointsV1(input.bps),
    modelVersion: input.modelVersion,
  };
}

function canonicalBasisPointsV1(value: string) {
  return canonicalDecimalV1(value, { allowNegative: false, min: "0", max: "10000", maxIntegerDigits: 5, maxScale: 4 });
}

function canonicalInstrumentIdV1(value: string) {
  const canonical = canonicalOpaqueStringV1(value, { minBytes: 1, maxBytes: 64 });
  if (!/^[A-Z0-9][A-Z0-9._:-]*$/u.test(canonical)) throw new Error("invalid canonical instrument id");
  return canonical;
}

function canonicalIdentifierV1(value: string, name: string) {
  const canonical = canonicalOpaqueStringV1(value, { minBytes: 1, maxBytes: 64 });
  if (!/^[A-Z0-9_:-]+$/u.test(canonical)) throw new Error(`invalid ${name}`);
  return canonical;
}

function getStringField(value: unknown, field: string) {
  if (!isPlainObject(value)) throw new Error("expected closed plain object");
  const fieldValue = (value as Record<string, unknown>)[field];
  if (typeof fieldValue !== "string") throw new Error(`${field} must be string`);
  return fieldValue;
}

function rejectDuplicateStrings(name: string, values: readonly string[]) {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new Error(`duplicate ${name} element`);
    seen.add(value);
  }
}

function rejectDuplicateCanonicalElements(name: string, elements: readonly CanonicalJsonValue[]) {
  const seen = new Set<string>();
  for (const element of elements) {
    const canonical = i5ResearchInternalCanonicalJsonBytesV1(element).toString("utf8");
    if (seen.has(canonical)) throw new Error(`duplicate ${name} element`);
    seen.add(canonical);
  }
}

function decimalToScaleUnits(value: string, scale: number) {
  const decimal = canonicalDecimalV1(value, { allowNegative: false, min: "0", max: "1", maxIntegerDigits: 1, maxScale: scale });
  const [whole = "", fraction = ""] = decimal.split(".");
  return Number(whole) * 10 ** scale + Number(fraction.padEnd(scale, "0"));
}

function compareAsciiBytes(left: string, right: string) {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function assertClosedPlainObject(value: unknown, allowedKeys: ReadonlySet<string>) {
  if (!isPlainObject(value)) throw new Error("expected closed plain object");
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!allowedKeys.has(key)) throw new Error(`undeclared field ${key}`);
    if (record[key] === undefined) throw new Error(`undefined is not canonical data at ${key}`);
  }
}

function assertExactKeys(value: unknown, expectedKeys: ReadonlySet<string>) {
  assertClosedPlainObject(value, expectedKeys);
  const actualKeys = new Set(Object.keys(value as Record<string, unknown>));
  for (const key of expectedKeys) {
    if (!actualKeys.has(key)) throw new Error(`missing required field ${key}`);
  }
  if (actualKeys.size !== expectedKeys.size) throw new Error("contradictory union payload");
}

function isPlainObject(value: unknown) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.getPrototypeOf(value) === Object.prototype;
}
