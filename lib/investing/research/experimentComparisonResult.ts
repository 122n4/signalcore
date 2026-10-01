import {
  assertHashDomainAdmittedForHashingV1,
  canonicalSha256HexV1,
  i5ResearchInternalCanonicalJsonBytesV1,
  sha256HexV1,
  type CanonicalJsonValue,
  type CanonicalSha256HexV1,
  canonicalDateV1,
  canonicalDecimalV1,
  canonicalIntegerV1,
} from "./canonical";
import { addRationalV1, compareRationalV1, decimalStringToRationalV1, reduceRationalV1, subtractRationalV1, type ExactRationalV1 } from "./exactRational";
import { metricDirectionV1 } from "./experimentComparison";
import { compareExactMetricObservationV1, type ExactMetricDeltaV1, type ExactMetricObservationV1 } from "./experimentComparisonEvidence";
import {
  classifyRobustnessV1,
  type ComparisonFailClosedErrorV1,
  type RobustnessClassificationV1,
  type RobustnessDiagnosticV1,
} from "./experimentComparisonClassification";

export type ComparisonProtocolHashRefV1 = Readonly<{
  hashAlgorithm: "SHA-256";
  hashDomain: "SYNTRAKE:EXPERIMENT_COMPARISON_PROTOCOL:V1";
  hashVersion: "SYNTRAKE_SHA256_V1";
  hashHex: string;
}>;

export type ParameterDeltaV1 =
  | Readonly<{ kind: "COMPARE_LITERAL_VALUE_DELTA"; pipelineOperationIndex: string; operationType: "FILTER" | "ENTER" | "EXIT"; expressionPath: readonly string[]; literalType: "DECIMAL" | "INTEGER" | "DATE"; referenceValue: string; subjectValue: string }>
  | Readonly<{ kind: "TAKE_COUNT_DELTA"; pipelineOperationIndex: string; operationType: "TAKE"; path: readonly ["count"]; referenceValue: string; subjectValue: string }>
  | Readonly<{ kind: "FIXED_TARGET_WEIGHT_DELTA"; pipelineOperationIndex: string; operationType: "WEIGHT"; path: readonly ["targets", string, "weight"]; instrumentId: string; referenceValue: string; subjectValue: string }>
  | Readonly<{ kind: "REBALANCE_SCHEDULE_DELTA"; pipelineOperationIndex: string; operationType: "REBALANCE"; path: readonly ["schedule"]; referenceValue: string; subjectValue: string }>;

export type ScientificInputDeltaV1 = Readonly<{ field: string; referenceValue: string; subjectValue: string }>;
export type RationalRecordV1 = Readonly<{ numerator: string; denominator: string }>;
export type ValidationEvidenceV1 = Readonly<{ completeFoldCount: string; degradedFoldCount: string; nonDegradedFoldCount: string; aggregateOosOrientedDeltaSign: "-1" | "0" | "1"; foldMin: RationalRecordV1 | null; foldMax: RationalRecordV1 | null; foldRange: RationalRecordV1 | null }>;
export type CostEvidenceV1 = Readonly<{ state: "AVAILABLE"; explicitFeeTotalReference: string; explicitFeeTotalSubject: string; slippageCostTotalReference: string; slippageCostTotalSubject: string; costTotalReference: string; costTotalSubject: string; costDelta: string }> | Readonly<{ state: "UNAVAILABLE"; reason: "MISSING_EXACT_COST_EVIDENCE" }>;
export type NeighborhoodEvidenceV1 = Readonly<{ state: "AVAILABLE"; neighborhoodMemberCount: string; availableMemberCount: string; unavailableMemberCount: string; unavailableReasons: readonly string[]; degradedMemberCount: string; improvedOrEqualMemberCount: string; neighborhoodMin: RationalRecordV1; neighborhoodMax: RationalRecordV1; neighborhoodSpread: RationalRecordV1 }> | Readonly<{ state: "UNAVAILABLE"; reason: "INSUFFICIENT_PARAMETER_NEIGHBORHOOD"; availableMemberCount: string; unavailableMemberCount: string; unavailableReasons: readonly string[] }>;
export type ConcentrationEvidenceV1 = Readonly<{ state: "AVAILABLE"; tradeCount: string; rebalanceCount: string; foldDirectionConcentration: boolean }> | Readonly<{ state: "UNAVAILABLE"; reason: "UNSUPPORTED_CONCENTRATION_EVIDENCE" }>;

export type ExperimentComparisonResultV1 = Readonly<{
  schemaVersion: "EXPERIMENT_COMPARISON_RESULT_V1";
  protocol: ComparisonProtocolHashRefV1;
  parameterDeltas: readonly ParameterDeltaV1[];
  scientificInputDelta: readonly ScientificInputDeltaV1[];
  metricDeltas: readonly ExactMetricDeltaV1[];
  validationEvidence: ValidationEvidenceV1;
  costEvidence: CostEvidenceV1;
  neighborhoodEvidence: NeighborhoodEvidenceV1;
  concentrationEvidence: ConcentrationEvidenceV1;
  diagnostics: readonly RobustnessDiagnosticV1[];
  classification: RobustnessClassificationV1 | null;
  failure: ComparisonFailClosedErrorV1 | null;
}>;

const resultKeys = new Set(["schemaVersion", "protocol", "parameterDeltas", "scientificInputDelta", "metricDeltas", "validationEvidence", "costEvidence", "neighborhoodEvidence", "concentrationEvidence", "diagnostics", "classification", "failure"]);
const classificationValues = new Set<RobustnessClassificationV1>(["ROBUSTNESS_INSUFFICIENT_EVIDENCE", "ROBUSTNESS_UNSTABLE", "ROBUSTNESS_DEGRADED", "ROBUSTNESS_STABLE", "ROBUSTNESS_MIXED"]);
const failureValues = new Set<ComparisonFailClosedErrorV1>(["INCOMPARABLE_LINEAGE", "INCOMPARABLE_PARAMETER_STRUCTURE", "INCOMPATIBLE_SCIENTIFIC_INPUTS", "INCOMPATIBLE_METRIC_VERSIONS", "INCOMPARABLE_VALIDATION_PROTOCOL", "CORRUPTED_EVIDENCE", "AUTHORITY_FAILURE"]);
const diagnosticValues: ReadonlySet<string> = new Set<RobustnessDiagnosticV1>(["INSUFFICIENT_EVIDENCE", "MISSING_RESULT", "MISSING_VALIDATION_RESULT", "INCOMPLETE_VALIDATION", "METRIC_UNAVAILABLE", "MISSING_METRIC", "METRIC_UNAVAILABLE_ON_ONE_SIDE", "MISSING_EXACT_COST_EVIDENCE", "UNSUPPORTED_CONCENTRATION_EVIDENCE", "INSUFFICIENT_PARAMETER_NEIGHBORHOOD", "LOW_EVENT_COUNT_DEPENDENCE", "FOLD_DIRECTION_CONCENTRATION"]);
const scientificInputFields = new Set(["EXPERIMENT", "EXPERIMENT_PARAMETERS", "RESOLVED_RESEARCH_IR", "DATASET_SNAPSHOT", "EXECUTION_CONFIG", "METRIC_REQUEST_SET", "ENGINE", "METRIC_REGISTRY", "BENCHMARK", "EVALUATION_PERIOD", "VALIDATION_PROTOCOL", "VALIDATION_RESULT"]);
const incompatibleScientificInputFields = new Set(["DATASET_SNAPSHOT", "EXECUTION_CONFIG", "METRIC_REQUEST_SET", "ENGINE", "METRIC_REGISTRY", "BENCHMARK", "EVALUATION_PERIOD"]);
const validationProtocolInputFields = new Set(["VALIDATION_PROTOCOL"]);
const scheduleValues = new Set(["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY", "ANNUAL"]);

export function canonicalExperimentComparisonResultV1(input: ExperimentComparisonResultV1): CanonicalJsonValue {
  assertClosed(input, resultKeys, "ExperimentComparisonResult");
  if (input.schemaVersion !== "EXPERIMENT_COMPARISON_RESULT_V1") throw new Error("COMPARISON_RESULT_SCHEMA_INVALID");
  const protocol = canonicalProtocolRef(input.protocol);
  const failure = canonicalFailure(input.failure);
  const classification = canonicalClassification(input.classification);
  if (failure !== null && classification !== null) throw new Error("FAILURE_REQUIRES_NULL_CLASSIFICATION");
  if (failure === null && classification === null) throw new Error("SUCCESS_REQUIRES_CLASSIFICATION");
  const validationEvidence = canonicalValidationEvidence(input.validationEvidence);
  const costEvidence = canonicalCostEvidence(input.costEvidence);
  const neighborhoodEvidence = canonicalNeighborhoodEvidence(input.neighborhoodEvidence);
  const concentrationEvidence = canonicalConcentrationEvidence(input.concentrationEvidence);
  const scientificInputDelta = canonicalScientificInputDelta(input.scientificInputDelta);
  const diagnostics = canonicalDiagnosticsWithEvidence(input.diagnostics, costEvidence, neighborhoodEvidence, concentrationEvidence);
  assertStoredDecisionMatchesEvidence({
    classification,
    failure,
    diagnostics,
    validationEvidence,
    neighborhoodEvidence,
    scientificInputDelta,
  });
  return {
    schemaVersion: input.schemaVersion,
    protocol,
    parameterDeltas: canonicalParameterDeltas(input.parameterDeltas),
    scientificInputDelta,
    metricDeltas: canonicalMetricDeltas(input.metricDeltas),
    validationEvidence,
    costEvidence,
    neighborhoodEvidence,
    concentrationEvidence,
    diagnostics,
    classification,
    failure,
  } as CanonicalJsonValue;
}

export function canonicalExperimentComparisonResultBytesV1(input: ExperimentComparisonResultV1): Buffer {
  return i5ResearchInternalCanonicalJsonBytesV1(canonicalExperimentComparisonResultV1(input));
}

export function hashExperimentComparisonResultV1(input: ExperimentComparisonResultV1): CanonicalSha256HexV1 {
  assertHashDomainAdmittedForHashingV1("SYNTRAKE:EXPERIMENT_COMPARISON_RESULT:V1");
  const payload = canonicalExperimentComparisonResultV1(input);
  return sha256HexV1(Buffer.concat([Buffer.from("SYNTRAKE:EXPERIMENT_COMPARISON_RESULT:V1\n", "utf8"), i5ResearchInternalCanonicalJsonBytesV1(payload)]));
}

function canonicalProtocolRef(input: ComparisonProtocolHashRefV1): CanonicalJsonValue {
  assertClosed(input, new Set(["hashAlgorithm", "hashDomain", "hashVersion", "hashHex"]), "ComparisonProtocolHashRef");
  if (input.hashAlgorithm !== "SHA-256") throw new Error("invalid hash algorithm");
  if (input.hashDomain !== "SYNTRAKE:EXPERIMENT_COMPARISON_PROTOCOL:V1") throw new Error("wrong-domain HashRefV1");
  if (input.hashVersion !== "SYNTRAKE_SHA256_V1") throw new Error("invalid hash version");
  return { hashAlgorithm: "SHA-256", hashDomain: input.hashDomain, hashVersion: "SYNTRAKE_SHA256_V1", hashHex: canonicalSha256HexV1(input.hashHex) };
}

function canonicalParameterDeltas(input: readonly ParameterDeltaV1[]): readonly CanonicalJsonValue[] {
  if (!Array.isArray(input)) throw new Error("PARAMETER_DELTAS_NOT_ARRAY");
  const copy = input.map(canonicalParameterDelta);
  copy.sort((a, b) => byteCompare(parameterSortKey(a), parameterSortKey(b)));
  const seen = new Set<string>();
  for (const delta of copy) {
    const key = parameterSortKey(delta);
    if (seen.has(key)) throw new Error("PARAMETER_DELTAS_DUPLICATE_PATH");
    seen.add(key);
  }
  return Object.freeze(copy as CanonicalJsonValue[]);
}

function canonicalParameterDelta(input: ParameterDeltaV1): CanonicalJsonValue {
  if (input === null || typeof input !== "object" || Array.isArray(input) || Object.getPrototypeOf(input) !== Object.prototype) throw new Error("INCOMPARABLE_PARAMETER_STRUCTURE");
  if (input.referenceValue === input.subjectValue) throw new Error("INCOMPARABLE_PARAMETER_STRUCTURE");
  switch (input.kind) {
    case "COMPARE_LITERAL_VALUE_DELTA":
      assertClosed(input, new Set(["kind", "pipelineOperationIndex", "operationType", "expressionPath", "literalType", "referenceValue", "subjectValue"]), "ParameterDelta");
      if (!["FILTER", "ENTER", "EXIT"].includes(input.operationType) || !["DECIMAL", "INTEGER", "DATE"].includes(input.literalType)) throw new Error("INCOMPARABLE_PARAMETER_STRUCTURE");
      return rejectCanonicalEqual(Object.freeze({ ...input, pipelineOperationIndex: canonicalOperationIndex(input.pipelineOperationIndex), expressionPath: canonicalPath(input.expressionPath), referenceValue: canonicalLiteral(input.referenceValue, input.literalType), subjectValue: canonicalLiteral(input.subjectValue, input.literalType) }));
    case "TAKE_COUNT_DELTA":
      assertClosed(input, new Set(["kind", "pipelineOperationIndex", "operationType", "path", "referenceValue", "subjectValue"]), "ParameterDelta");
      if (input.operationType !== "TAKE" || pathKey(input.path) !== "count") throw new Error("INCOMPARABLE_PARAMETER_STRUCTURE");
      return rejectCanonicalEqual(Object.freeze({ ...input, pipelineOperationIndex: canonicalOperationIndex(input.pipelineOperationIndex), path: Object.freeze(["count"]), referenceValue: canonicalTakeCount(input.referenceValue), subjectValue: canonicalTakeCount(input.subjectValue) }));
    case "FIXED_TARGET_WEIGHT_DELTA":
      assertClosed(input, new Set(["kind", "pipelineOperationIndex", "operationType", "path", "instrumentId", "referenceValue", "subjectValue"]), "ParameterDelta");
      if (input.operationType !== "WEIGHT" || pathKey(input.path) !== `targets\u0000${input.instrumentId}\u0000weight` || !/^[A-Z0-9._:-]{1,96}$/u.test(input.instrumentId)) throw new Error("INCOMPARABLE_PARAMETER_STRUCTURE");
      return rejectCanonicalEqual(Object.freeze({ ...input, pipelineOperationIndex: canonicalOperationIndex(input.pipelineOperationIndex), path: Object.freeze(["targets", input.instrumentId, "weight"]), referenceValue: canonicalTargetWeight(input.referenceValue), subjectValue: canonicalTargetWeight(input.subjectValue) }));
    case "REBALANCE_SCHEDULE_DELTA":
      assertClosed(input, new Set(["kind", "pipelineOperationIndex", "operationType", "path", "referenceValue", "subjectValue"]), "ParameterDelta");
      if (input.operationType !== "REBALANCE" || pathKey(input.path) !== "schedule" || !scheduleValues.has(input.referenceValue) || !scheduleValues.has(input.subjectValue)) throw new Error("INCOMPARABLE_PARAMETER_STRUCTURE");
      return rejectCanonicalEqual(Object.freeze({ ...input, pipelineOperationIndex: canonicalOperationIndex(input.pipelineOperationIndex), path: Object.freeze(["schedule"]) }));
    default:
      throw new Error("INCOMPARABLE_PARAMETER_STRUCTURE");
  }
}

function rejectCanonicalEqual<T extends CanonicalJsonValue & { readonly referenceValue: string; readonly subjectValue: string }>(input: T): T {
  if (input.referenceValue === input.subjectValue) throw new Error("INCOMPARABLE_PARAMETER_STRUCTURE");
  return input;
}

function canonicalOperationIndex(value: string): string {
  if (!/^(?:0|[1-9][0-9]*)$/u.test(value)) throw new Error("INCOMPARABLE_PARAMETER_STRUCTURE");
  return value;
}

function canonicalPath(input: readonly string[]): readonly string[] {
  if (!Array.isArray(input) || input.length === 0) throw new Error("INCOMPARABLE_PARAMETER_STRUCTURE");
  return Object.freeze(input.map((part) => {
    if (typeof part !== "string" || part.length === 0 || part.includes("\u0000")) throw new Error("INCOMPARABLE_PARAMETER_STRUCTURE");
    return part;
  }));
}

function parameterSortKey(delta: CanonicalJsonValue): string {
  const record = delta as Record<string, unknown>;
  const path = Array.isArray(record.expressionPath) ? pathKey(record.expressionPath as readonly string[]) : pathKey(record.path as readonly string[]);
  const instrument = typeof record.instrumentId === "string" ? record.instrumentId : "";
  return `${record.pipelineOperationIndex}\u0000${record.operationType}\u0000${path}\u0000${instrument}\u0000${record.kind}`;
}

function pathKey(path: readonly string[]): string {
  if (!Array.isArray(path)) throw new Error("INCOMPARABLE_PARAMETER_STRUCTURE");
  return path.join("\u0000");
}

function canonicalScientificInputDelta(input: readonly ScientificInputDeltaV1[]): readonly CanonicalJsonValue[] {
  if (!Array.isArray(input)) throw new Error("SCIENTIFIC_INPUT_DELTA_NOT_ARRAY");
  const copy = input.map((entry) => {
    assertClosed(entry, new Set(["field", "referenceValue", "subjectValue"]), "ScientificInputDelta");
    if (!scientificInputFields.has(entry.field)) throw new Error("SCIENTIFIC_INPUT_DELTA_FIELD_INVALID");
    if (typeof entry.referenceValue !== "string" || typeof entry.subjectValue !== "string" || entry.referenceValue.length === 0 || entry.subjectValue.length === 0) throw new Error("SCIENTIFIC_INPUT_DELTA_VALUE_INVALID");
    if (entry.referenceValue === entry.subjectValue) throw new Error("SCIENTIFIC_INPUT_DELTA_EQUAL_VALUES");
    return Object.freeze({ ...entry });
  });
  copy.sort((a, b) => byteCompare(a.field, b.field));
  for (let i = 1; i < copy.length; i += 1) if (copy[i - 1]!.field === copy[i]!.field) throw new Error("SCIENTIFIC_INPUT_DELTA_DUPLICATE_FIELD");
  return Object.freeze(copy as CanonicalJsonValue[]);
}

function canonicalMetricDeltas(input: readonly ExactMetricDeltaV1[]): readonly CanonicalJsonValue[] {
  if (!Array.isArray(input)) throw new Error("METRIC_DELTAS_NOT_ARRAY");
  const copy = input.map(canonicalMetricDelta);
  copy.sort((a, b) => byteCompare(`${a.registryVersion}\u0000${a.metricVersion}\u0000${a.metricId}`, `${b.registryVersion}\u0000${b.metricVersion}\u0000${b.metricId}`));
  for (let i = 1; i < copy.length; i += 1) if (copy[i - 1]!.metricId === copy[i]!.metricId) throw new Error("METRIC_DELTAS_DUPLICATE_METRIC");
  return Object.freeze(copy as CanonicalJsonValue[]);
}

function canonicalDiagnosticStrings(input: readonly RobustnessDiagnosticV1[]): readonly RobustnessDiagnosticV1[] {
  if (!Array.isArray(input)) throw new Error("DIAGNOSTICS_NOT_ARRAY");
  const copy: RobustnessDiagnosticV1[] = [];
  for (const value of input) {
    if (typeof value !== "string" || !diagnosticValues.has(value)) throw new Error("DIAGNOSTICS_INVALID");
    copy.push(value as RobustnessDiagnosticV1);
  }
  copy.sort(byteCompare);
  if (new Set(copy).size !== copy.length) throw new Error("DIAGNOSTICS_DUPLICATE");
  return Object.freeze(copy);
}

function canonicalValidationEvidence(input: ValidationEvidenceV1): CanonicalJsonValue {
  assertClosed(input, new Set(["completeFoldCount", "degradedFoldCount", "nonDegradedFoldCount", "aggregateOosOrientedDeltaSign", "foldMin", "foldMax", "foldRange"]), "ValidationEvidence");
  const completeFoldCount = canonicalNonNegativeInteger(input.completeFoldCount);
  const degradedFoldCount = canonicalNonNegativeInteger(input.degradedFoldCount);
  const nonDegradedFoldCount = canonicalNonNegativeInteger(input.nonDegradedFoldCount);
  if (BigInt(degradedFoldCount) + BigInt(nonDegradedFoldCount) !== BigInt(completeFoldCount)) throw new Error("VALIDATION_EVIDENCE_COUNT_MISMATCH");
  if (!["-1", "0", "1"].includes(input.aggregateOosOrientedDeltaSign)) throw new Error("VALIDATION_EVIDENCE_SIGN_INVALID");
  const foldMin = input.foldMin === null ? null : canonicalRationalRecord(input.foldMin, "ValidationFoldMin");
  const foldMax = input.foldMax === null ? null : canonicalRationalRecord(input.foldMax, "ValidationFoldMax");
  const foldRange = input.foldRange === null ? null : canonicalRationalRecord(input.foldRange, "ValidationFoldRange");
  if (BigInt(completeFoldCount) === 0n) {
    if (foldMin !== null || foldMax !== null || foldRange !== null) throw new Error("VALIDATION_EVIDENCE_RANGE_MISMATCH");
  } else {
    if (foldMin === null || foldMax === null || foldRange === null) throw new Error("VALIDATION_EVIDENCE_RANGE_MISMATCH");
    assertRangeMath(foldMin, foldMax, foldRange, "VALIDATION_EVIDENCE_RANGE_MISMATCH");
  }
  return Object.freeze({ completeFoldCount, degradedFoldCount, nonDegradedFoldCount, aggregateOosOrientedDeltaSign: input.aggregateOosOrientedDeltaSign, foldMin, foldMax, foldRange });
}

function canonicalCostEvidence(input: CostEvidenceV1): CanonicalJsonValue {
  assertClosed(input, input.state === "AVAILABLE" ? new Set(["state", "explicitFeeTotalReference", "explicitFeeTotalSubject", "slippageCostTotalReference", "slippageCostTotalSubject", "costTotalReference", "costTotalSubject", "costDelta"]) : new Set(["state", "reason"]), "CostEvidence");
  if (input.state === "AVAILABLE") {
    const explicitFeeTotalReference = canonicalDecimal(input.explicitFeeTotalReference);
    const explicitFeeTotalSubject = canonicalDecimal(input.explicitFeeTotalSubject);
    const slippageCostTotalReference = canonicalDecimal(input.slippageCostTotalReference);
    const slippageCostTotalSubject = canonicalDecimal(input.slippageCostTotalSubject);
    const costTotalReference = canonicalDecimal(input.costTotalReference);
    const costTotalSubject = canonicalDecimal(input.costTotalSubject);
    const costDelta = canonicalDecimal(input.costDelta);
    assertDecimalSum(explicitFeeTotalReference, slippageCostTotalReference, costTotalReference, "COST_EVIDENCE_TOTAL_MISMATCH");
    assertDecimalSum(explicitFeeTotalSubject, slippageCostTotalSubject, costTotalSubject, "COST_EVIDENCE_TOTAL_MISMATCH");
    assertDecimalDifference(costTotalSubject, costTotalReference, costDelta, "COST_EVIDENCE_DELTA_MISMATCH");
    return Object.freeze({
    state: "AVAILABLE",
    explicitFeeTotalReference,
    explicitFeeTotalSubject,
    slippageCostTotalReference,
    slippageCostTotalSubject,
    costTotalReference,
    costTotalSubject,
    costDelta,
  });
  }
  if (input.state === "UNAVAILABLE" && input.reason === "MISSING_EXACT_COST_EVIDENCE") return Object.freeze({ state: "UNAVAILABLE", reason: input.reason });
  throw new Error("COST_EVIDENCE_INVALID");
}

function canonicalNeighborhoodEvidence(input: NeighborhoodEvidenceV1): CanonicalJsonValue {
  assertClosed(input, input.state === "AVAILABLE" ? new Set(["state", "neighborhoodMemberCount", "availableMemberCount", "unavailableMemberCount", "unavailableReasons", "degradedMemberCount", "improvedOrEqualMemberCount", "neighborhoodMin", "neighborhoodMax", "neighborhoodSpread"]) : new Set(["state", "reason", "availableMemberCount", "unavailableMemberCount", "unavailableReasons"]), "NeighborhoodEvidence");
  const unavailableReasons = canonicalReasonList(input.unavailableReasons);
  if (input.state === "AVAILABLE") {
    const neighborhoodMemberCount = canonicalNonNegativeInteger(input.neighborhoodMemberCount);
    const availableMemberCount = canonicalNonNegativeInteger(input.availableMemberCount);
    const unavailableMemberCount = canonicalNonNegativeInteger(input.unavailableMemberCount);
    const degradedMemberCount = canonicalNonNegativeInteger(input.degradedMemberCount);
    const improvedOrEqualMemberCount = canonicalNonNegativeInteger(input.improvedOrEqualMemberCount);
    if (BigInt(availableMemberCount) + BigInt(unavailableMemberCount) !== BigInt(neighborhoodMemberCount)) throw new Error("NEIGHBORHOOD_EVIDENCE_COUNT_MISMATCH");
    if (BigInt(unavailableMemberCount) !== 0n) throw new Error("NEIGHBORHOOD_EVIDENCE_COUNT_MISMATCH");
    if (BigInt(degradedMemberCount) + BigInt(improvedOrEqualMemberCount) !== BigInt(neighborhoodMemberCount)) throw new Error("NEIGHBORHOOD_EVIDENCE_COUNT_MISMATCH");
    const neighborhoodMin = canonicalRationalRecord(input.neighborhoodMin, "NeighborhoodMin");
    const neighborhoodMax = canonicalRationalRecord(input.neighborhoodMax, "NeighborhoodMax");
    const neighborhoodSpread = canonicalRationalRecord(input.neighborhoodSpread, "NeighborhoodSpread");
    assertRangeMath(neighborhoodMin, neighborhoodMax, neighborhoodSpread, "NEIGHBORHOOD_EVIDENCE_RANGE_MISMATCH");
    return Object.freeze({ state: "AVAILABLE", neighborhoodMemberCount, availableMemberCount, unavailableMemberCount, unavailableReasons, degradedMemberCount, improvedOrEqualMemberCount, neighborhoodMin, neighborhoodMax, neighborhoodSpread });
  }
  if (input.state === "UNAVAILABLE" && input.reason === "INSUFFICIENT_PARAMETER_NEIGHBORHOOD") return Object.freeze({ state: "UNAVAILABLE", reason: input.reason, availableMemberCount: canonicalNonNegativeInteger(input.availableMemberCount), unavailableMemberCount: canonicalNonNegativeInteger(input.unavailableMemberCount), unavailableReasons });
  throw new Error("NEIGHBORHOOD_EVIDENCE_INVALID");
}

function canonicalReasonList(input: readonly string[]): readonly string[] {
  if (!Array.isArray(input)) throw new Error("REASON_LIST_INVALID");
  const copy = input.map((value) => {
    if (!["MISSING_METRIC", "METRIC_UNAVAILABLE_ON_ONE_SIDE"].includes(value)) throw new Error("REASON_LIST_INVALID");
    return value;
  }).sort(byteCompare);
  return Object.freeze(copy);
}

function canonicalConcentrationEvidence(input: ConcentrationEvidenceV1): CanonicalJsonValue {
  assertClosed(input, input.state === "AVAILABLE" ? new Set(["state", "tradeCount", "rebalanceCount", "foldDirectionConcentration"]) : new Set(["state", "reason"]), "ConcentrationEvidence");
  if (input.state === "AVAILABLE") {
    if (typeof input.foldDirectionConcentration !== "boolean") throw new Error("CONCENTRATION_EVIDENCE_INVALID");
    return Object.freeze({
      state: "AVAILABLE",
      tradeCount: canonicalNonNegativeInteger(input.tradeCount),
      rebalanceCount: canonicalNonNegativeInteger(input.rebalanceCount),
      foldDirectionConcentration: input.foldDirectionConcentration,
    });
  }
  if (input.state === "UNAVAILABLE" && input.reason === "UNSUPPORTED_CONCENTRATION_EVIDENCE") return Object.freeze({ state: "UNAVAILABLE", reason: input.reason });
  throw new Error("CONCENTRATION_EVIDENCE_INVALID");
}

function canonicalDiagnosticsWithEvidence(
  input: readonly RobustnessDiagnosticV1[],
  costEvidence: CanonicalJsonValue,
  neighborhoodEvidence: CanonicalJsonValue,
  concentrationEvidence: CanonicalJsonValue,
): readonly RobustnessDiagnosticV1[] {
  const diagnostics = new Set(canonicalDiagnosticStrings(input));
  const cost = costEvidence as Record<string, unknown>;
  if (cost.state === "UNAVAILABLE") diagnostics.add("MISSING_EXACT_COST_EVIDENCE");
  const neighborhood = neighborhoodEvidence as Record<string, unknown>;
  if (neighborhood.state === "UNAVAILABLE" || BigInt(String(neighborhood.neighborhoodMemberCount ?? "0")) < 3n) diagnostics.add("INSUFFICIENT_PARAMETER_NEIGHBORHOOD");
  const concentration = concentrationEvidence as Record<string, unknown>;
  if (concentration.state === "UNAVAILABLE") diagnostics.add("UNSUPPORTED_CONCENTRATION_EVIDENCE");
  if (concentration.state === "AVAILABLE") {
    if (BigInt(String(concentration.tradeCount)) < 20n || BigInt(String(concentration.rebalanceCount)) < 5n) diagnostics.add("LOW_EVENT_COUNT_DEPENDENCE");
    if (concentration.foldDirectionConcentration === true) diagnostics.add("FOLD_DIRECTION_CONCENTRATION");
  }
  return Object.freeze([...diagnostics].sort(byteCompare));
}

function assertStoredDecisionMatchesEvidence(input: {
  classification: RobustnessClassificationV1 | null;
  failure: ComparisonFailClosedErrorV1 | null;
  diagnostics: readonly RobustnessDiagnosticV1[];
  validationEvidence: CanonicalJsonValue;
  neighborhoodEvidence: CanonicalJsonValue;
  scientificInputDelta: readonly CanonicalJsonValue[];
}): void {
  const deltaFields = input.scientificInputDelta.map((entry) => String((entry as Record<string, unknown>).field));
  if (deltaFields.some((field) => incompatibleScientificInputFields.has(field)) && input.failure !== "INCOMPATIBLE_SCIENTIFIC_INPUTS") {
    throw new Error("INCOMPATIBLE_SCIENTIFIC_INPUTS");
  }
  if (deltaFields.some((field) => validationProtocolInputFields.has(field)) && input.failure !== "INCOMPARABLE_VALIDATION_PROTOCOL") {
    throw new Error("INCOMPARABLE_VALIDATION_PROTOCOL");
  }
  const validation = input.validationEvidence as Record<string, string>;
  const neighborhood = input.neighborhoodEvidence as Record<string, string>;
  const decision = classifyRobustnessV1({
    primaryMetricId: "CAGR",
    completeFoldCount: toSafeCount(validation.completeFoldCount, "completeFoldCount"),
    neighborhoodMemberCount: neighborhood.state === "AVAILABLE" ? toSafeCount(neighborhood.neighborhoodMemberCount, "neighborhoodMemberCount") : 0,
    requiredMetricAvailable: !input.diagnostics.some((diagnostic) => diagnostic === "MISSING_METRIC" || diagnostic === "METRIC_UNAVAILABLE" || diagnostic === "METRIC_UNAVAILABLE_ON_ONE_SIDE"),
    aggregateOosOrientedDeltaSign: Number(validation.aggregateOosOrientedDeltaSign) as -1 | 0 | 1,
    degradedFoldCount: toSafeCount(validation.degradedFoldCount, "degradedFoldCount"),
    nonDegradedFoldCount: toSafeCount(validation.nonDegradedFoldCount, "nonDegradedFoldCount"),
    degradedMemberCount: neighborhood.state === "AVAILABLE" ? toSafeCount(neighborhood.degradedMemberCount, "degradedMemberCount") : 0,
    improvedOrEqualMemberCount: neighborhood.state === "AVAILABLE" ? toSafeCount(neighborhood.improvedOrEqualMemberCount, "improvedOrEqualMemberCount") : 0,
    diagnostics: input.diagnostics,
    failure: input.failure,
  });
  if (decision.failure !== input.failure || decision.classification !== input.classification) throw new Error("CLASSIFICATION_EVIDENCE_DRIFT");
}

function canonicalMetricDelta(input: ExactMetricDeltaV1): CanonicalJsonValue & { readonly metricId: string; readonly metricVersion: string; readonly registryVersion: string } {
  assertClosed(input, new Set(["metricId", "metricVersion", "registryVersion", "artifactSchemaVersion", "direction", "referenceValue", "subjectValue", "rawDelta", "orientedDelta", "orientedDeltaSign"]), "MetricDelta");
  if (input.metricVersion !== "METRIC_V2" || input.registryVersion !== "METRIC_REGISTRY_V20260927" || input.artifactSchemaVersion !== "METRIC_RESULT_SET_V2") throw new Error("INCOMPATIBLE_METRIC_VERSIONS");
  const direction = metricDirectionV1(input.metricId);
  if (input.direction !== direction) throw new Error("METRIC_DELTA_DIRECTION_MISMATCH");
  const referenceValue = canonicalMetricDecimal(input.referenceValue);
  const subjectValue = canonicalMetricDecimal(input.subjectValue);
  const rawDelta = canonicalRationalRecord(input.rawDelta, "MetricDeltaRaw");
  const orientedDelta = input.orientedDelta === null ? null : canonicalRationalRecord(input.orientedDelta, "MetricDeltaOriented");
  const canonicalInput = Object.freeze({ ...input, referenceValue, subjectValue, rawDelta, orientedDelta });
  const expected = compareExactMetricObservationV1(metricObservation(input.metricId, referenceValue), metricObservation(input.metricId, subjectValue));
  if (expected.state !== "AVAILABLE") throw new Error("METRIC_DELTA_MATH_MISMATCH");
  const expectedDelta = expected.delta;
  if (
    canonicalInput.direction !== expectedDelta.direction ||
    canonicalInput.rawDelta.numerator !== expectedDelta.rawDelta.numerator ||
    canonicalInput.rawDelta.denominator !== expectedDelta.rawDelta.denominator ||
    canonicalInput.orientedDeltaSign !== expectedDelta.orientedDeltaSign ||
    (canonicalInput.orientedDelta === null) !== (expectedDelta.orientedDelta === null) ||
    (canonicalInput.orientedDelta !== null && expectedDelta.orientedDelta !== null && (
      canonicalInput.orientedDelta.numerator !== expectedDelta.orientedDelta.numerator ||
      canonicalInput.orientedDelta.denominator !== expectedDelta.orientedDelta.denominator
    ))
  ) {
    throw new Error("METRIC_DELTA_MATH_MISMATCH");
  }
  return Object.freeze({
    ...canonicalInput,
    orientedDeltaSign: canonicalInput.orientedDeltaSign === null ? null : String(canonicalInput.orientedDeltaSign),
  }) as CanonicalJsonValue & { readonly metricId: string; readonly metricVersion: string; readonly registryVersion: string };
}

function canonicalClassification(input: RobustnessClassificationV1 | null): RobustnessClassificationV1 | null {
  if (input === null) return null;
  if (!classificationValues.has(input)) throw new Error("CLASSIFICATION_INVALID");
  return input;
}

function canonicalFailure(input: ComparisonFailClosedErrorV1 | null): ComparisonFailClosedErrorV1 | null {
  if (input === null) return null;
  if (!failureValues.has(input)) throw new Error("FAILURE_INVALID");
  return input;
}

function canonicalLiteral(value: string, literalType: "DECIMAL" | "INTEGER" | "DATE"): string {
  try {
    if (literalType === "DECIMAL") return canonicalDecimalV1(value, { allowNegative: true, min: "-1", max: "100", maxIntegerDigits: 3, maxScale: 8 });
    if (literalType === "INTEGER") return canonicalIntegerV1(value, { allowNegative: false, min: "0", max: "1000000000000" });
    return canonicalDateV1(value);
  } catch {
    throw new Error("INCOMPARABLE_PARAMETER_STRUCTURE");
  }
}

function canonicalDecimal(value: string): string {
  if (!/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/u.test(value)) throw new Error("INCOMPARABLE_PARAMETER_STRUCTURE");
  try {
    decimalStringToRationalV1(value);
  } catch {
    throw new Error("INCOMPARABLE_PARAMETER_STRUCTURE");
  }
  return value;
}

function canonicalInteger(value: string): string {
  if (!/^-?(?:0|[1-9][0-9]*)$/u.test(value)) throw new Error("INCOMPARABLE_PARAMETER_STRUCTURE");
  return value;
}

function canonicalTakeCount(value: string): string {
  try {
    return canonicalIntegerV1(value, { allowNegative: false, min: "1", max: "10000" });
  } catch {
    throw new Error("INCOMPARABLE_PARAMETER_STRUCTURE");
  }
}

function canonicalTargetWeight(value: string): string {
  try {
    return canonicalDecimalV1(value, { allowNegative: false, min: "0", max: "1", maxIntegerDigits: 1, maxScale: 8 });
  } catch {
    throw new Error("INCOMPARABLE_PARAMETER_STRUCTURE");
  }
}

function canonicalMetricDecimal(value: string): string {
  try {
    return canonicalDecimalV1(value);
  } catch {
    throw new Error("INCOMPARABLE_PARAMETER_STRUCTURE");
  }
}

function canonicalNonNegativeInteger(value: string): string {
  if (!/^(?:0|[1-9][0-9]*)$/u.test(value)) throw new Error("EVIDENCE_COUNTER_INVALID");
  return value;
}

function canonicalRationalRecord(input: unknown, label: string): Readonly<{ numerator: string; denominator: string }> {
  assertClosed(input, new Set(["numerator", "denominator"]), label);
  const record = input as Record<string, unknown>;
  if (typeof record.numerator !== "string" || typeof record.denominator !== "string") throw new Error(label + "_INVALID");
  canonicalInteger(record.numerator);
  if (!/^(?:[1-9][0-9]*)$/u.test(record.denominator)) throw new Error(label + "_INVALID");
  const reduced = reduceRationalV1({ numerator: BigInt(record.numerator), denominator: BigInt(record.denominator) });
  if (reduced.numerator.toString() !== record.numerator || reduced.denominator.toString() !== record.denominator) throw new Error(label + "_NON_CANONICAL");
  return Object.freeze({ numerator: record.numerator, denominator: record.denominator });
}

function rationalFromRecord(input: Readonly<{ numerator: string; denominator: string }>): ExactRationalV1 {
  return { numerator: BigInt(input.numerator), denominator: BigInt(input.denominator) };
}

function assertRangeMath(min: Readonly<{ numerator: string; denominator: string }>, max: Readonly<{ numerator: string; denominator: string }>, range: Readonly<{ numerator: string; denominator: string }>, error: string): void {
  const minR = rationalFromRecord(min);
  const maxR = rationalFromRecord(max);
  const rangeR = rationalFromRecord(range);
  if (compareRationalV1(minR, maxR) > 0) throw new Error(error);
  const expected = subtractRationalV1(maxR, minR);
  if (expected.numerator !== rangeR.numerator || expected.denominator !== rangeR.denominator) throw new Error(error);
}

function assertDecimalSum(left: string, right: string, actual: string, error: string): void {
  const expected = addRationalV1(decimalStringToRationalV1(left), decimalStringToRationalV1(right));
  const observed = decimalStringToRationalV1(actual);
  if (compareRationalV1(expected, observed) !== 0) throw new Error(error);
}

function assertDecimalDifference(left: string, right: string, actual: string, error: string): void {
  const expected = subtractRationalV1(decimalStringToRationalV1(left), decimalStringToRationalV1(right));
  const observed = decimalStringToRationalV1(actual);
  if (compareRationalV1(expected, observed) !== 0) throw new Error(error);
}

function metricObservation(metricId: ExactMetricDeltaV1["metricId"], canonicalDecimal: string): ExactMetricObservationV1 {
  return Object.freeze({
    metricId,
    metricVersion: "METRIC_V2",
    registryVersion: "METRIC_REGISTRY_V20260927",
    artifactSchemaVersion: "METRIC_RESULT_SET_V2",
    state: "VALUE",
    canonicalDecimal,
  });
}

function toSafeCount(value: string, label: string): number {
  const count = BigInt(value);
  if (count > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(label + " exceeds safe integer");
  return Number(count);
}

function byteCompare(a: string, b: string): number { return Buffer.from(a, "utf8").compare(Buffer.from(b, "utf8")); }

function assertClosed(value: unknown, allowed: ReadonlySet<string>, label: string): void {
  if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error(label + " must be a plain object");
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) throw new Error(label + " contains unknown key: " + key);
    if (record[key] === undefined) throw new Error(label + " contains undefined: " + key);
  }
  for (const key of allowed) if (!Object.hasOwn(record, key)) throw new Error(label + " missing key: " + key);
}
