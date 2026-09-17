import {
  assertHashRefDomainV1,
  hashRefV1,
  i5ResearchInternalCanonicalJsonBytesV1,
  sha256HexV1,
  type CanonicalJsonValue,
  type CanonicalSha256HexV1,
  type HashRefV1,
} from "./canonical";
import {
  canonicalResearchIrPayloadV1,
  hashResearchIrV1,
  type ResearchIrV1,
} from "./researchIr";
import { ownerStructuredHashPreimageV1 } from "./scientificPreimage";

export type ResearchIrProofForExperimentParametersV1 = Readonly<{
  ref: HashRefV1;
  payload: ResearchIrV1;
}>;

export type ExperimentParametersCandidateV1 = Readonly<{
  schemaVersion: "EXPERIMENT_PARAMETERS_CANDIDATE_V1";
  parameterizationPolicy: "I5_EXPERIMENT_PARAMETERS_POLICY_V1";
  baseResearchIr: ResearchIrProofForExperimentParametersV1;
  resolvedResearchIr: ResearchIrProofForExperimentParametersV1;
}>;

export type ExperimentParametersHashPayloadV1 = Readonly<{
  schemaVersion: "EXPERIMENT_PARAMETERS_HASH_PAYLOAD_V1";
  parameterizationPolicy: "I5_EXPERIMENT_PARAMETERS_POLICY_V1";
  baseResearchIr: HashRefV1;
  resolvedResearchIr: HashRefV1;
}>;

const candidateKeys = new Set(["schemaVersion", "parameterizationPolicy", "baseResearchIr", "resolvedResearchIr"]);
const proofKeys = new Set(["ref", "payload"]);
const maskedCompareLiteralValue = "__I5_EXPERIMENT_PARAMETERS_COMPARE_LITERAL_VALUE__";
const maskedTakeCount = "__I5_EXPERIMENT_PARAMETERS_TAKE_COUNT__";
const maskedFixedWeight = "__I5_EXPERIMENT_PARAMETERS_FIXED_TARGET_WEIGHT__";
const maskedRebalanceSchedule = "__I5_EXPERIMENT_PARAMETERS_REBALANCE_SCHEDULE__";

export function canonicalExperimentParametersHashPayloadV1(
  input: ExperimentParametersCandidateV1,
): ExperimentParametersHashPayloadV1 {
  assertClosedPlainObject(input, candidateKeys);
  if (input.schemaVersion !== "EXPERIMENT_PARAMETERS_CANDIDATE_V1") {
    throw new Error("invalid ExperimentParametersCandidateV1 schemaVersion");
  }
  if (input.parameterizationPolicy !== "I5_EXPERIMENT_PARAMETERS_POLICY_V1") {
    throw new Error("unsupported ExperimentParameters parameterization policy");
  }

  const base = validateResearchIrProof(input.baseResearchIr, "baseResearchIr");
  const resolved = validateResearchIrProof(input.resolvedResearchIr, "resolvedResearchIr");
  if (base.ref.hashHex === resolved.ref.hashHex) throw new Error("ExperimentParameters V1 no-op parameterization rejected");

  const baseSkeleton = parameterizationSkeletonV1(base.canonicalPayload);
  const resolvedSkeleton = parameterizationSkeletonV1(resolved.canonicalPayload);
  if (
    i5ResearchInternalCanonicalJsonBytesV1(baseSkeleton).toString("utf8") !==
    i5ResearchInternalCanonicalJsonBytesV1(resolvedSkeleton).toString("utf8")
  ) {
    throw new Error("Research IR payloads are not in the same ExperimentParameters V1 structural family");
  }

  return {
    schemaVersion: "EXPERIMENT_PARAMETERS_HASH_PAYLOAD_V1",
    parameterizationPolicy: "I5_EXPERIMENT_PARAMETERS_POLICY_V1",
    baseResearchIr: deepFreeze({ ...base.ref }),
    resolvedResearchIr: deepFreeze({ ...resolved.ref }),
  };
}

export function canonicalExperimentParametersBytesV1(input: ExperimentParametersCandidateV1): Buffer {
  return i5ResearchInternalCanonicalJsonBytesV1(canonicalExperimentParametersHashPayloadV1(input));
}

export function hashExperimentParametersV1(input: ExperimentParametersCandidateV1): CanonicalSha256HexV1 {
  return sha256HexV1(
    ownerStructuredHashPreimageV1(
      "SYNTRAKE:EXPERIMENT_PARAMETERS:V1",
      canonicalExperimentParametersHashPayloadV1(input),
    ),
  );
}

function validateResearchIrProof(
  input: ResearchIrProofForExperimentParametersV1,
  name: string,
): { ref: HashRefV1; canonicalPayload: CanonicalJsonValue } {
  assertClosedPlainObject(input, proofKeys);
  const ref = hashRefV1(input.ref);
  assertHashRefDomainV1(ref, "SYNTRAKE:RESEARCH_IR:V1");
  const actual = hashResearchIrV1(input.payload);
  if (actual !== ref.hashHex) throw new Error(`${name} HashRef does not match Research IR payload`);
  return { ref, canonicalPayload: canonicalResearchIrPayloadV1(input.payload) };
}

function parameterizationSkeletonV1(input: CanonicalJsonValue): CanonicalJsonValue {
  const payload = expectObject(input, "Research IR payload");
  assertExactKeys(payload, new Set([
    "schemaVersion",
    "irVersion",
    "universe",
    "pipeline",
    "benchmark",
    "testPeriod",
    "valuationCurrency",
    "startingCapital",
  ]));
  const pipeline = expectArray(payload.pipeline, "Research IR pipeline");
  return {
    schemaVersion: payload.schemaVersion,
    irVersion: payload.irVersion,
    universe: payload.universe,
    pipeline: pipeline.map((operation) => operationSkeletonV1(operation)),
    benchmark: payload.benchmark,
    testPeriod: payload.testPeriod,
    valuationCurrency: payload.valuationCurrency,
    startingCapital: payload.startingCapital,
  };
}

function operationSkeletonV1(input: CanonicalJsonValue): CanonicalJsonValue {
  const operation = expectObject(input, "Research IR operation");
  const type = expectString(operation.type, "Research IR operation type");
  if (type === "FILTER") {
    assertExactKeys(operation, new Set(["type", "predicate"]));
    return { type, predicate: booleanExpressionSkeletonV1(operation.predicate) };
  }
  if (type === "ENTER") {
    assertExactKeys(operation, new Set(["type", "condition"]));
    return { type, condition: booleanExpressionSkeletonV1(operation.condition) };
  }
  if (type === "EXIT") {
    assertExactKeys(operation, new Set(["type", "condition"]));
    return { type, condition: booleanExpressionSkeletonV1(operation.condition) };
  }
  if (type === "TAKE") {
    assertExactKeys(operation, new Set(["type", "count"]));
    return { type, count: maskedTakeCount };
  }
  if (type === "WEIGHT") return weightSkeletonV1(operation);
  if (type === "REBALANCE") {
    assertExactKeys(operation, new Set(["type", "schedule"]));
    return { type, schedule: maskedRebalanceSchedule };
  }
  if (type === "RANK") {
    assertExactKeys(operation, new Set(["type", "field", "direction", "missingPolicy"]));
    return operation;
  }
  throw new Error("unsupported ExperimentParameters V1 Research IR operation");
}

function booleanExpressionSkeletonV1(input: CanonicalJsonValue): CanonicalJsonValue {
  const expression = expectObject(input, "BooleanExpressionV1");
  const type = expectString(expression.type, "BooleanExpressionV1 type");
  if (type === "COMPARE") {
    assertExactKeys(expression, new Set(["type", "left", "operator", "right"]));
    return {
      type,
      left: expression.left,
      operator: expression.operator,
      right: compareRightSkeletonV1(expression.right),
    };
  }
  if (type === "AND" || type === "OR") {
    assertExactKeys(expression, new Set(["type", "clauses"]));
    return {
      type,
      clauses: expectArray(expression.clauses, `${type} clauses`).map((clause) => booleanExpressionSkeletonV1(clause)),
    };
  }
  if (type === "NOT") {
    assertExactKeys(expression, new Set(["type", "clause"]));
    return { type, clause: booleanExpressionSkeletonV1(expression.clause) };
  }
  throw new Error("unsupported ExperimentParameters V1 BooleanExpression");
}

function compareRightSkeletonV1(input: CanonicalJsonValue): CanonicalJsonValue {
  const operand = expectObject(input, "COMPARE right operand");
  const type = expectString(operand.type, "COMPARE right operand type");
  if (type === "DATA_FIELD_REF") {
    assertExactKeys(operand, new Set(["type", "fieldId", "fieldVersion"]));
    return operand;
  }
  if (type === "DECIMAL" || type === "INTEGER") {
    assertExactKeys(operand, new Set(["type", "value", "unit"]));
    return { type, unit: operand.unit, value: maskedCompareLiteralValue };
  }
  if (type === "BOOLEAN" || type === "DATE" || type === "ENUM") {
    assertExactKeys(operand, new Set(["type", "value"]));
    return { type, value: maskedCompareLiteralValue };
  }
  throw new Error("unsupported ExperimentParameters V1 COMPARE right operand");
}

function weightSkeletonV1(input: Readonly<Record<string, CanonicalJsonValue>>): CanonicalJsonValue {
  if (input.method === "EQUAL") {
    assertExactKeys(input, new Set(["type", "method"]));
    return input;
  }
  if (input.method !== "FIXED_TARGETS") throw new Error("unsupported ExperimentParameters V1 WEIGHT method");
  assertExactKeys(input, new Set(["type", "method", "targets"]));
  return {
    type: "WEIGHT",
    method: "FIXED_TARGETS",
    targets: expectArray(input.targets, "FIXED_TARGETS targets").map((target) => {
      const entry = expectObject(target, "FIXED_TARGETS target");
      assertExactKeys(entry, new Set(["instrumentId", "weight"]));
      return { instrumentId: entry.instrumentId, weight: maskedFixedWeight };
    }),
  };
}

function expectObject(value: CanonicalJsonValue, name: string): Readonly<Record<string, CanonicalJsonValue>> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${name} must be object`);
  return value as Readonly<Record<string, CanonicalJsonValue>>;
}

function expectArray(value: CanonicalJsonValue, name: string): readonly CanonicalJsonValue[] {
  if (!Array.isArray(value)) throw new Error(`${name} must be array`);
  return value;
}

function expectString(value: CanonicalJsonValue, name: string): string {
  if (typeof value !== "string") throw new Error(`${name} must be string`);
  return value;
}

function assertClosedPlainObject(value: unknown, allowedKeys: ReadonlySet<string>) {
  if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error("expected closed plain object");
  }
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) throw new Error(`undeclared field ${key}`);
    if ((value as Record<string, unknown>)[key] === undefined) throw new Error(`undefined is not canonical data at ${key}`);
  }
  for (const key of allowedKeys) {
    if (!Object.hasOwn(value, key)) throw new Error(`missing field ${key}`);
  }
}

function assertExactKeys(value: Readonly<Record<string, CanonicalJsonValue>>, expectedKeys: ReadonlySet<string>) {
  const actualKeys = new Set(Object.keys(value));
  for (const key of expectedKeys) {
    if (!actualKeys.has(key)) throw new Error(`missing field ${key}`);
  }
  if (actualKeys.size !== expectedKeys.size) throw new Error("unexpected canonical Research IR shape");
}

function deepFreeze<T extends object>(value: T): Readonly<T> {
  return Object.freeze(value);
}
