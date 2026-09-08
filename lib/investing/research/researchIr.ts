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
const irVersionsV1 = new Set(["RESEARCH_IR_V1"]);
const operationTypesV1 = new Set(["FILTER", "RANK", "TAKE", "WEIGHT", "ENTER", "EXIT", "REBALANCE"]);
const compareOperatorsV1 = new Set(["EQ", "NEQ", "GT", "GTE", "LT", "LTE"]);
const rankDirectionsV1 = new Set(["ASC", "DESC"]);
const missingPoliciesV1 = new Set(["EXCLUDE", "LAST"]);
const rebalanceSchedulesV1 = new Set(["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY", "ANNUAL"]);
const currenciesV1 = new Set(["USD", "EUR", "GBP", "CHF", "CAD", "AUD", "JPY"]);
const decimalUnitsV1 = new Set(["RATIO", "VALUATION_CURRENCY_PER_INSTRUMENT"]);
const integerUnitsV1 = new Set(["SHARES"]);
const enumValuesV1 = new Set(["INCLUDED", "EXCLUDED"]);

const maxAstDepthV1 = 16;
const maxAstNodesV1 = 256;
const maxPayloadBytesV1 = 32768;

type AstContextV1 = { nodes: number };
type ValueCategoryV1 = "DECIMAL_PRICE" | "DECIMAL_RETURN_RATIO" | "INTEGER_VOLUME" | "DATE" | "BOOLEAN" | "ENUM";

type FieldContractV1 = Readonly<{
  fieldId: DataFieldRefV1["fieldId"];
  valueCategory: ValueCategoryV1;
  fieldVersion: "I5A_RESEARCH_IR_FIELD_CONTRACT_V1";
}>;

const dataFieldContractsV1 = {
  ADJUSTED_CLOSE: { fieldId: "ADJUSTED_CLOSE", valueCategory: "DECIMAL_PRICE", fieldVersion: "I5A_RESEARCH_IR_FIELD_CONTRACT_V1" },
  TOTAL_RETURN: { fieldId: "TOTAL_RETURN", valueCategory: "DECIMAL_RETURN_RATIO", fieldVersion: "I5A_RESEARCH_IR_FIELD_CONTRACT_V1" },
  VOLUME: { fieldId: "VOLUME", valueCategory: "INTEGER_VOLUME", fieldVersion: "I5A_RESEARCH_IR_FIELD_CONTRACT_V1" },
  MOMENTUM_12M: { fieldId: "MOMENTUM_12M", valueCategory: "DECIMAL_RETURN_RATIO", fieldVersion: "I5A_RESEARCH_IR_FIELD_CONTRACT_V1" },
  OBSERVATION_DATE: { fieldId: "OBSERVATION_DATE", valueCategory: "DATE", fieldVersion: "I5A_RESEARCH_IR_FIELD_CONTRACT_V1" },
} as const satisfies Record<string, FieldContractV1>;

export type ResearchIrV1 = Readonly<{
  schemaVersion: "RESEARCH_IR_HASH_PAYLOAD_V1";
  irVersion: "RESEARCH_IR_V1";
  universe: UniverseNodeV1;
  pipeline: readonly ResearchOperationV1[];
  benchmark: BenchmarkNodeV1;
  testPeriod: Readonly<{ startDate: string; endDate: string }>;
  valuationCurrency: "USD" | "EUR" | "GBP" | "CHF" | "CAD" | "AUD" | "JPY";
  startingCapital: Readonly<{ amount: string; currency: "USD" | "EUR" | "GBP" | "CHF" | "CAD" | "AUD" | "JPY"; origin: "SIMULATED" }>;
}>;

export type UniverseNodeV1 = Readonly<{
  type: "EXPLICIT_INSTRUMENTS";
  instrumentIds: readonly string[];
}>;

export type DataFieldRefV1 = Readonly<{
  type: "DATA_FIELD_REF";
  fieldId: "ADJUSTED_CLOSE" | "TOTAL_RETURN" | "VOLUME" | "MOMENTUM_12M" | "OBSERVATION_DATE";
  fieldVersion: "I5A_RESEARCH_IR_FIELD_CONTRACT_V1";
}>;

export type CanonicalLiteralV1 =
  | Readonly<{ type: "DECIMAL"; value: string; unit: "RATIO" | "VALUATION_CURRENCY_PER_INSTRUMENT" }>
  | Readonly<{ type: "INTEGER"; value: string; unit: "SHARES" }>
  | Readonly<{ type: "BOOLEAN"; value: boolean }>
  | Readonly<{ type: "DATE"; value: string }>
  | Readonly<{ type: "ENUM"; value: "INCLUDED" | "EXCLUDED" }>;

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
  | RebalanceNodeV1;

export function canonicalResearchIrPayloadV1(input: ResearchIrV1): CanonicalJsonValue {
  assertClosedPlainObject(input, new Set(["schemaVersion", "irVersion", "universe", "pipeline", "benchmark", "testPeriod", "valuationCurrency", "startingCapital"]));
  canonicalTokenV1(input.schemaVersion, schemaVersionsV1);
  canonicalTokenV1(input.irVersion, irVersionsV1);
  if (!Array.isArray(input.pipeline)) throw new Error("pipeline must be an ORDERED_SEQUENCE array");
  if (input.pipeline.length < 1 || input.pipeline.length > 64) throw new Error("pipeline length out of bounds");
  const context = { nodes: 0 };
  const pipeline = input.pipeline.map((operation) => canonicalResearchOperationV1(operation, context, 1));
  rejectDuplicateCanonicalElements("pipeline", pipeline);

  const payload = {
    schemaVersion: input.schemaVersion,
    irVersion: input.irVersion,
    universe: canonicalUniverseV1(input.universe, context),
    pipeline,
    benchmark: canonicalBenchmarkV1(input.benchmark, context),
    testPeriod: canonicalTestPeriodV1(input.testPeriod),
    valuationCurrency: canonicalTokenV1(input.valuationCurrency, currenciesV1),
    startingCapital: canonicalStartingCapitalV1(input.startingCapital),
  };
  if (i5ResearchInternalCanonicalJsonBytesV1(payload).length > maxPayloadBytesV1) {
    throw new Error("Research IR canonical payload bytes out of bounds");
  }
  return payload;
}

export function canonicalResearchIrBytesV1(input: ResearchIrV1): Buffer {
  return i5ResearchInternalCanonicalJsonBytesV1(canonicalResearchIrPayloadV1(input));
}

export function hashResearchIrV1(input: ResearchIrV1): CanonicalSha256HexV1 {
  return sha256HexV1(ownerStructuredHashPreimageV1("SYNTRAKE:RESEARCH_IR:V1", canonicalResearchIrPayloadV1(input)));
}

function canonicalUniverseV1(input: UniverseNodeV1, context: AstContextV1): CanonicalJsonValue {
  visitAstNode(context, 1);
  assertClosedPlainObject(input, new Set(["type", "instrumentIds"]));
  if (input.type !== "EXPLICIT_INSTRUMENTS") throw new Error("unsupported Research IR universe");
  if (!Array.isArray(input.instrumentIds)) throw new Error("instrumentIds must be an UNORDERED_SET array");
  if (input.instrumentIds.length < 1 || input.instrumentIds.length > 512) throw new Error("instrumentIds count out of bounds");
  const instrumentIds = input.instrumentIds.map(canonicalInstrumentIdV1).sort(compareAsciiBytes);
  rejectDuplicateStrings("instrumentIds", instrumentIds);
  return { type: input.type, instrumentIds };
}

function canonicalResearchOperationV1(input: ResearchOperationV1, context: AstContextV1, depth: number): CanonicalJsonValue {
  visitAstNode(context, depth);
  assertClosedPlainObject(input, new Set(["type", "predicate", "field", "direction", "missingPolicy", "count", "method", "targets", "condition", "schedule"]));
  const type = getStringField(input, "type");
  if (!operationTypesV1.has(type)) throw new Error("unsupported Research IR operation");
  if (type === "FILTER") {
    assertExactKeys(input, new Set(["type", "predicate"]));
    return { type, predicate: canonicalBooleanExpressionV1((input as FilterNodeV1).predicate, context, depth + 1) };
  }
  if (type === "RANK") {
    const rank = input as RankNodeV1;
    assertExactKeys(rank, new Set(["type", "field", "direction", "missingPolicy"]));
    return {
      type,
      field: canonicalDataFieldRefV1(rank.field),
      direction: canonicalTokenV1(rank.direction, rankDirectionsV1),
      missingPolicy: canonicalTokenV1(rank.missingPolicy, missingPoliciesV1),
    };
  }
  if (type === "TAKE") {
    assertExactKeys(input, new Set(["type", "count"]));
    return { type, count: canonicalIntegerV1((input as TakeNodeV1).count, { min: "1", max: "10000", allowNegative: false }) };
  }
  if (type === "WEIGHT") return canonicalWeightV1(input as WeightNodeV1);
  if (type === "ENTER") {
    assertExactKeys(input, new Set(["type", "condition"]));
    return { type, condition: canonicalBooleanExpressionV1((input as EnterNodeV1).condition, context, depth + 1) };
  }
  if (type === "EXIT") {
    assertExactKeys(input, new Set(["type", "condition"]));
    return { type, condition: canonicalBooleanExpressionV1((input as ExitNodeV1).condition, context, depth + 1) };
  }
  assertExactKeys(input, new Set(["type", "schedule"]));
  return { type: "REBALANCE", schedule: canonicalTokenV1((input as RebalanceNodeV1).schedule, rebalanceSchedulesV1) };
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

function canonicalBenchmarkV1(input: BenchmarkNodeV1, context: AstContextV1): CanonicalJsonValue {
  visitAstNode(context, 1);
  if (input.benchmark === "NONE") {
    assertExactKeys(input, new Set(["type", "benchmark"]));
    return { type: "BENCHMARK", benchmark: "NONE" };
  }
  if (input.benchmark !== "INSTRUMENT") throw new Error("unsupported BENCHMARK shape");
  assertExactKeys(input, new Set(["type", "benchmark", "instrumentId"]));
  return { type: "BENCHMARK", benchmark: "INSTRUMENT", instrumentId: canonicalInstrumentIdV1(input.instrumentId) };
}

function canonicalBooleanExpressionV1(input: BooleanExpressionV1, context: AstContextV1, depth: number): CanonicalJsonValue {
  visitAstNode(context, depth);
  assertClosedPlainObject(input, new Set(["type", "left", "operator", "right", "clauses", "clause"]));
  const type = getStringField(input, "type");
  if (type === "COMPARE") {
    const compare = input as Extract<BooleanExpressionV1, { type: "COMPARE" }>;
    assertExactKeys(compare, new Set(["type", "left", "operator", "right"]));
    const left = canonicalDataFieldRefWithCategoryV1(compare.left);
    const right = canonicalComparableOperandV1(compare.right);
    if (left.valueCategory !== right.valueCategory) throw new Error("COMPARE operand value categories incompatible");
    validateOperatorForCategory(compare.operator, left.valueCategory);
    return {
      type,
      left: left.payload,
      operator: canonicalTokenV1(compare.operator, compareOperatorsV1),
      right: right.payload,
    };
  }
  if (type === "AND" || type === "OR") {
    const compound = input as Extract<BooleanExpressionV1, { type: "AND" | "OR" }>;
    assertExactKeys(compound, new Set(["type", "clauses"]));
    if (!Array.isArray(compound.clauses)) throw new Error(`${type} clauses must be an ORDERED_SEQUENCE array`);
    if (compound.clauses.length < 2 || compound.clauses.length > 16) throw new Error(`${type} clause count out of bounds`);
    const clauses = compound.clauses.map((clause) => canonicalBooleanExpressionV1(clause, context, depth + 1));
    rejectDuplicateCanonicalElements(`${type} clauses`, clauses);
    return { type, clauses };
  }
  if (type === "NOT") {
    const negated = input as Extract<BooleanExpressionV1, { type: "NOT" }>;
    assertExactKeys(negated, new Set(["type", "clause"]));
    return { type, clause: canonicalBooleanExpressionV1(negated.clause, context, depth + 1) };
  }
  throw new Error("unsupported BooleanExpressionV1");
}

function canonicalComparableOperandV1(input: CanonicalLiteralV1 | DataFieldRefV1) {
  assertClosedPlainObject(input, new Set(["type", "value", "unit", "fieldId", "fieldVersion"]));
  if (input.type === "DATA_FIELD_REF") return canonicalDataFieldRefWithCategoryV1(input);
  return canonicalLiteralWithCategoryV1(input);
}

function canonicalLiteralWithCategoryV1(input: CanonicalLiteralV1) {
  assertClosedPlainObject(input, new Set(["type", "value", "unit"]));
  if (input.type === "DECIMAL") {
    assertExactKeys(input, new Set(["type", "value", "unit"]));
    canonicalTokenV1(input.unit, decimalUnitsV1);
    if (input.unit === "RATIO") {
      return {
        payload: { type: input.type, value: canonicalDecimalV1(input.value, { allowNegative: true, min: "-1", max: "100", maxIntegerDigits: 3, maxScale: 8 }), unit: input.unit },
        valueCategory: "DECIMAL_RETURN_RATIO" as const,
      };
    }
    return {
      payload: { type: input.type, value: canonicalDecimalV1(input.value, { allowNegative: false, min: "0", max: "9999999999999999.99999999", maxIntegerDigits: 16, maxScale: 8 }), unit: input.unit },
      valueCategory: "DECIMAL_PRICE" as const,
    };
  }
  if (input.type === "INTEGER") {
    assertExactKeys(input, new Set(["type", "value", "unit"]));
    canonicalTokenV1(input.unit, integerUnitsV1);
    return {
      payload: { type: input.type, value: canonicalIntegerV1(input.value, { min: "0", max: "1000000000000", allowNegative: false }), unit: input.unit },
      valueCategory: "INTEGER_VOLUME" as const,
    };
  }
  if (input.type === "BOOLEAN") {
    assertExactKeys(input, new Set(["type", "value"]));
    if (typeof input.value !== "boolean") throw new Error("BOOLEAN literal value must be boolean");
    return { payload: { type: input.type, value: input.value }, valueCategory: "BOOLEAN" as const };
  }
  if (input.type === "DATE") {
    assertExactKeys(input, new Set(["type", "value"]));
    return { payload: { type: input.type, value: canonicalDateV1(input.value) }, valueCategory: "DATE" as const };
  }
  if (input.type === "ENUM") {
    assertExactKeys(input, new Set(["type", "value"]));
    return { payload: { type: input.type, value: canonicalTokenV1(input.value, enumValuesV1) }, valueCategory: "ENUM" as const };
  }
  throw new Error("unsupported CanonicalLiteralV1");
}

function canonicalDataFieldRefV1(input: DataFieldRefV1): CanonicalJsonValue {
  return canonicalDataFieldRefWithCategoryV1(input).payload;
}

function canonicalDataFieldRefWithCategoryV1(input: DataFieldRefV1) {
  assertExactKeys(input, new Set(["type", "fieldId", "fieldVersion"]));
  if (input.type !== "DATA_FIELD_REF") throw new Error("unsupported comparable operand");
  if (!Object.hasOwn(dataFieldContractsV1, input.fieldId)) throw new Error("unknown DataFieldRefV1 fieldId");
  const contract = dataFieldContractsV1[input.fieldId];
  if (input.fieldVersion !== contract.fieldVersion) throw new Error("DataFieldRefV1 fieldVersion mismatch");
  return {
    payload: { type: "DATA_FIELD_REF", fieldId: contract.fieldId, fieldVersion: contract.fieldVersion },
    valueCategory: contract.valueCategory,
  };
}

function validateOperatorForCategory(operator: string, category: ValueCategoryV1) {
  canonicalTokenV1(operator, compareOperatorsV1);
  if ((category === "BOOLEAN" || category === "ENUM") && operator !== "EQ" && operator !== "NEQ") {
    throw new Error("COMPARE operator incompatible with operand value category");
  }
}

function canonicalTestPeriodV1(input: ResearchIrV1["testPeriod"]) {
  assertExactKeys(input, new Set(["startDate", "endDate"]));
  const startDate = canonicalDateV1(input.startDate);
  const endDate = canonicalDateV1(input.endDate);
  if (startDate > endDate) throw new Error("testPeriod startDate after endDate");
  return { startDate, endDate };
}

function canonicalStartingCapitalV1(input: ResearchIrV1["startingCapital"]) {
  assertExactKeys(input, new Set(["amount", "currency", "origin"]));
  if (input.origin !== "SIMULATED") throw new Error("startingCapital origin must be SIMULATED");
  return {
    amount: canonicalDecimalV1(input.amount, { allowNegative: false, min: "0.01", max: "9999999999999999.99", maxIntegerDigits: 16, maxScale: 2 }),
    currency: canonicalTokenV1(input.currency, currenciesV1),
    origin: input.origin,
  };
}

function visitAstNode(context: AstContextV1, depth: number) {
  if (depth > maxAstDepthV1) throw new Error("Research IR AST depth out of bounds");
  context.nodes += 1;
  if (context.nodes > maxAstNodesV1) throw new Error("Research IR AST node count out of bounds");
}

function canonicalInstrumentIdV1(value: string) {
  const canonical = canonicalOpaqueStringV1(value, { minBytes: 1, maxBytes: 64 });
  if (!/^[A-Z0-9][A-Z0-9._:-]*$/u.test(canonical)) throw new Error("invalid canonical instrument id");
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
