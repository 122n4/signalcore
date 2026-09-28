import {
  assertHashDomainAdmittedForHashingV1,
  canonicalSha256HexV1,
  i5ResearchInternalCanonicalJsonBytesV1,
  sha256HexV1,
  type CanonicalJsonValue,
  type CanonicalSha256HexV1,
} from "./canonical";
import type { ExactMetricDeltaV1 } from "./experimentComparisonEvidence";
import type { ComparisonFailClosedErrorV1, RobustnessClassificationV1, RobustnessDiagnosticV1 } from "./experimentComparisonClassification";

export type ComparisonProtocolHashRefV1 = Readonly<{
  hashAlgorithm: "SHA-256";
  hashDomain: "SYNTRAKE:EXPERIMENT_COMPARISON_PROTOCOL:V1";
  hashVersion: "SYNTRAKE_SHA256_V1";
  hashHex: string;
}>;

export type ParameterDeltaV1 =
  | Readonly<{ kind: "COMPARE_LITERAL_VALUE_DELTA"; pipelineOperationIndex: string; operationType: "FILTER" | "ENTER" | "EXIT" | "GUARD"; expressionPath: readonly string[]; literalType: "DECIMAL" | "INTEGER" | "DATE"; referenceValue: string; subjectValue: string }>
  | Readonly<{ kind: "TAKE_COUNT_DELTA"; pipelineOperationIndex: string; operationType: "TAKE"; path: readonly ["count"]; referenceValue: string; subjectValue: string }>
  | Readonly<{ kind: "FIXED_TARGET_WEIGHT_DELTA"; pipelineOperationIndex: string; operationType: "WEIGHT"; path: readonly ["targets", string, "weight"]; instrumentId: string; referenceValue: string; subjectValue: string }>
  | Readonly<{ kind: "REBALANCE_SCHEDULE_DELTA"; pipelineOperationIndex: string; operationType: "REBALANCE"; path: readonly ["schedule"]; referenceValue: string; subjectValue: string }>;

export type ScientificInputDeltaV1 = Readonly<{ field: string; referenceValue: string; subjectValue: string }>;
export type ValidationEvidenceV1 = Readonly<{ completeFoldCount: string; degradedFoldCount: string; nonDegradedFoldCount: string; aggregateOosOrientedDeltaSign: "-1" | "0" | "1" }>;
export type CostEvidenceV1 = Readonly<{ state: "AVAILABLE"; explicitFeeTotalReference: string; explicitFeeTotalSubject: string; slippageCostTotalReference: string; slippageCostTotalSubject: string }> | Readonly<{ state: "UNAVAILABLE"; reason: "MISSING_EXACT_COST_EVIDENCE" }>;
export type NeighborhoodEvidenceV1 = Readonly<{ state: "AVAILABLE"; neighborhoodMemberCount: string; degradedMemberCount: string; improvedOrEqualMemberCount: string }> | Readonly<{ state: "UNAVAILABLE"; reason: "INSUFFICIENT_PARAMETER_NEIGHBORHOOD" }>;
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

export function canonicalExperimentComparisonResultV1(input: ExperimentComparisonResultV1): CanonicalJsonValue {
  assertClosed(input, resultKeys, "ExperimentComparisonResult");
  if (input.schemaVersion !== "EXPERIMENT_COMPARISON_RESULT_V1") throw new Error("COMPARISON_RESULT_SCHEMA_INVALID");
  const protocol = canonicalProtocolRef(input.protocol);
  if (input.failure !== null && input.classification !== null) throw new Error("FAILURE_REQUIRES_NULL_CLASSIFICATION");
  if (input.failure === null && input.classification === null) throw new Error("SUCCESS_REQUIRES_CLASSIFICATION");
  return {
    schemaVersion: input.schemaVersion,
    protocol,
    parameterDeltas: canonicalParameterDeltas(input.parameterDeltas),
    scientificInputDelta: canonicalScientificInputDelta(input.scientificInputDelta),
    metricDeltas: canonicalMetricDeltas(input.metricDeltas),
    validationEvidence: canonicalRecord(input.validationEvidence),
    costEvidence: canonicalRecord(input.costEvidence),
    neighborhoodEvidence: canonicalRecord(input.neighborhoodEvidence),
    concentrationEvidence: canonicalRecord(input.concentrationEvidence),
    diagnostics: canonicalStrings(input.diagnostics, "DIAGNOSTICS") as readonly RobustnessDiagnosticV1[],
    classification: input.classification,
    failure: input.failure,
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
  if (input.referenceValue === input.subjectValue) throw new Error("INCOMPARABLE_PARAMETER_STRUCTURE");
  switch (input.kind) {
    case "COMPARE_LITERAL_VALUE_DELTA":
      assertClosed(input, new Set(["kind", "pipelineOperationIndex", "operationType", "expressionPath", "literalType", "referenceValue", "subjectValue"]), "ParameterDelta");
      if (!["FILTER", "ENTER", "EXIT", "GUARD"].includes(input.operationType) || !["DECIMAL", "INTEGER", "DATE"].includes(input.literalType)) throw new Error("INCOMPARABLE_PARAMETER_STRUCTURE");
      return Object.freeze({ ...input, pipelineOperationIndex: canonicalOperationIndex(input.pipelineOperationIndex), expressionPath: canonicalPath(input.expressionPath) });
    case "TAKE_COUNT_DELTA":
      assertClosed(input, new Set(["kind", "pipelineOperationIndex", "operationType", "path", "referenceValue", "subjectValue"]), "ParameterDelta");
      if (input.operationType !== "TAKE" || pathKey(input.path) !== "count") throw new Error("INCOMPARABLE_PARAMETER_STRUCTURE");
      return Object.freeze({ ...input, pipelineOperationIndex: canonicalOperationIndex(input.pipelineOperationIndex), path: Object.freeze(["count"]) });
    case "FIXED_TARGET_WEIGHT_DELTA":
      assertClosed(input, new Set(["kind", "pipelineOperationIndex", "operationType", "path", "instrumentId", "referenceValue", "subjectValue"]), "ParameterDelta");
      if (input.operationType !== "WEIGHT" || pathKey(input.path) !== `targets\u0000${input.instrumentId}\u0000weight` || !/^[A-Z0-9._:-]{1,96}$/u.test(input.instrumentId)) throw new Error("INCOMPARABLE_PARAMETER_STRUCTURE");
      return Object.freeze({ ...input, pipelineOperationIndex: canonicalOperationIndex(input.pipelineOperationIndex), path: Object.freeze(["targets", input.instrumentId, "weight"]) });
    case "REBALANCE_SCHEDULE_DELTA":
      assertClosed(input, new Set(["kind", "pipelineOperationIndex", "operationType", "path", "referenceValue", "subjectValue"]), "ParameterDelta");
      if (input.operationType !== "REBALANCE" || pathKey(input.path) !== "schedule") throw new Error("INCOMPARABLE_PARAMETER_STRUCTURE");
      return Object.freeze({ ...input, pipelineOperationIndex: canonicalOperationIndex(input.pipelineOperationIndex), path: Object.freeze(["schedule"]) });
    default:
      throw new Error("INCOMPARABLE_PARAMETER_STRUCTURE");
  }
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
  const copy = input.map((entry) => ({ ...entry }));
  copy.sort((a, b) => byteCompare(a.field, b.field));
  for (let i = 1; i < copy.length; i += 1) if (copy[i - 1]!.field === copy[i]!.field) throw new Error("SCIENTIFIC_INPUT_DELTA_DUPLICATE_FIELD");
  return Object.freeze(copy as CanonicalJsonValue[]);
}

function canonicalMetricDeltas(input: readonly ExactMetricDeltaV1[]): readonly CanonicalJsonValue[] {
  if (!Array.isArray(input)) throw new Error("METRIC_DELTAS_NOT_ARRAY");
  const copy = input.map((entry) => ({ ...entry }));
  copy.sort((a, b) => byteCompare(`${a.registryVersion}\u0000${a.metricVersion}\u0000${a.metricId}`, `${b.registryVersion}\u0000${b.metricVersion}\u0000${b.metricId}`));
  for (let i = 1; i < copy.length; i += 1) if (copy[i - 1]!.metricId === copy[i]!.metricId) throw new Error("METRIC_DELTAS_DUPLICATE_METRIC");
  return Object.freeze(copy as unknown as CanonicalJsonValue[]);
}

function canonicalStrings(input: readonly string[], label: string): readonly string[] {
  if (!Array.isArray(input)) throw new Error(label + "_NOT_ARRAY");
  const copy = [...input].sort(byteCompare);
  if (new Set(copy).size !== copy.length) throw new Error(label + "_DUPLICATE");
  return Object.freeze(copy);
}

function canonicalRecord(input: object): CanonicalJsonValue {
  if (input === null || Array.isArray(input) || Object.getPrototypeOf(input) !== Object.prototype) throw new Error("EVIDENCE_RECORD_INVALID");
  return { ...input } as CanonicalJsonValue;
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
