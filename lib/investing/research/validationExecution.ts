import {
  assertHashRefDomainV1,
  canonicalIntegerV1,
  hashRefV1,
  i5ResearchInternalCanonicalJsonBytesV1,
  immutableBehaviorTokenV1,
  sha256HexV1,
  type CanonicalJsonValue,
  type CanonicalSha256HexV1,
  type HashRefV1,
} from "./canonical";
import {
  canonicalDatasetSeriesHashPayloadV1,
  canonicalDatasetSnapshotHashPayloadV1,
  canonicalExecutionConfigHashPayloadV1,
  canonicalMetricRequestSetHashPayloadV1,
  hashDatasetSeriesV1,
  hashDatasetSnapshotV1,
  type DatasetSeriesHashPayloadV1,
  type DatasetSnapshotHashPayloadV1,
  type ExecutionConfigHashPayloadV1,
  type MetricRequestSetHashPayloadV1,
} from "./executionMaterials";
import { executeHistoricalKernelV1, type HistoricalKernelInputV1 } from "./historicalExecutionEngine";
import { canonicalResearchIrPayloadV1, hashResearchIrV1, type ResearchIrV1 } from "./researchIr";
import {
  canonicalExecutionResultFieldsV1,
  type ResearchArtifactDescriptorV1,
} from "./resultArtifacts";
import { ownerStructuredHashPreimageV1 } from "./scientificPreimage";
import {
  admitValidationProtocolV1,
  assertOnlyResearchIrTestPeriodChangedV1,
  deriveValidationPhaseResearchIrV1,
  sliceValidationDatasetSeriesPrefixV1,
  type ValidationProtocolCandidateV1,
  type ValidationWindowV1,
} from "./validationProtocol";
import { verifyDatasetSeriesMaterialV1, type DatasetSeriesObservationV1, type VerifiedDatasetSeriesMaterialV1 } from "./datasetMaterial";

export type ValidationPhaseV1 = "TRAINING" | "EVALUATION";

export type ValidationRunInputHashPayloadV1 = Readonly<{
  schemaVersion: "VALIDATION_RUN_INPUT_HASH_PAYLOAD_V1";
  validationProtocol: HashRefV1;
  subjectExperiment: HashRefV1;
  subjectResearchIr: HashRefV1;
  phaseResearchIr: HashRefV1;
  sourceDatasetSnapshot: HashRefV1;
  phaseDatasetSnapshot: HashRefV1;
  foldOrdinal: string;
  phase: ValidationPhaseV1;
  phaseWindow: ValidationWindowV1;
  engineId: string;
  engineVersion: string;
  metricRegistryVersion: string;
  metricRequestSet: HashRefV1;
  executionConfig: HashRefV1;
}>;

export type ValidationChildResultHashPayloadV1 = Readonly<{
  schemaVersion: "VALIDATION_CHILD_RESULT_HASH_PAYLOAD_V1";
  validationRunInput: HashRefV1;
  engineId: "HISTORICAL_EXECUTION_ADAPTER";
  engineVersion: "ENGINE_V20260918";
  executionModelClass: "SYNTHETIC_ADJUSTED_CLOSE_RESEARCH_V1";
  valuationCurrency: "USD";
  testPeriod: ValidationWindowV1;
  startingNav: string;
  endingNav: string;
  terminalCash: string;
  executionTrace: ResearchArtifactDescriptorV1;
  valuationSeries: ResearchArtifactDescriptorV1;
  metricResultSet: ResearchArtifactDescriptorV1;
  benchmark: ResearchArtifactDescriptorV1 | null;
}>;

export type ValidationRunInputCandidateV1 = Readonly<{
  validationProtocolCandidate: ValidationProtocolCandidateV1;
  validationRunInput: ValidationRunInputHashPayloadV1;
  phaseResearchIrPayload: ResearchIrV1;
  phaseDatasetSeriesPayloads: readonly DatasetSeriesHashPayloadV1[];
  phaseDatasetSnapshotPayload: DatasetSnapshotHashPayloadV1;
  sourceDatasetSeriesPayloads: readonly DatasetSeriesHashPayloadV1[];
  sourceMaterials: readonly Buffer[];
}>;

export type AdmittedValidationRunInputV1 = Readonly<{
  validationRunInput: CanonicalJsonValue;
  validationRunInputHash: HashRefV1;
  phaseResearchIr: ResearchIrV1;
  phaseDatasetSeries: readonly DatasetSeriesHashPayloadV1[];
  phaseDatasetSnapshot: DatasetSnapshotHashPayloadV1;
  executionConfig: ExecutionConfigHashPayloadV1;
  metricRequestSet: MetricRequestSetHashPayloadV1;
  phaseMaterials: readonly VerifiedDatasetSeriesMaterialV1[];
}>;

export type ValidationChildExecutionInputV1 = Readonly<{
  admittedRunInput: AdmittedValidationRunInputV1;
}>;

export type ValidationChildExecutionResultV1 =
  | Readonly<{
    ok: true;
    artifacts: {
      executionTraceBytes: Buffer;
      valuationSeriesBytes: Buffer;
      metricResultSetBytes: Buffer;
      benchmarkSeriesBytes: Buffer | null;
    };
    childResultPayload: ValidationChildResultHashPayloadV1;
    childResultHash: HashRefV1;
  }>
  | Readonly<{ ok: false; code: string }>;

const runInputKeys = new Set([
  "schemaVersion",
  "validationProtocol",
  "subjectExperiment",
  "subjectResearchIr",
  "phaseResearchIr",
  "sourceDatasetSnapshot",
  "phaseDatasetSnapshot",
  "foldOrdinal",
  "phase",
  "phaseWindow",
  "engineId",
  "engineVersion",
  "metricRegistryVersion",
  "metricRequestSet",
  "executionConfig",
]);
const childResultKeys = new Set([
  "schemaVersion",
  "validationRunInput",
  "engineId",
  "engineVersion",
  "executionModelClass",
  "valuationCurrency",
  "testPeriod",
  "startingNav",
  "endingNav",
  "terminalCash",
  "executionTrace",
  "valuationSeries",
  "metricResultSet",
  "benchmark",
]);
const windowKeys = new Set(["startDate", "endDate"]);
const admittedValidationRunInputs = new WeakSet<object>();

export function canonicalValidationRunInputHashPayloadV1(input: ValidationRunInputHashPayloadV1): CanonicalJsonValue {
  assertClosedPlainObject(input, runInputKeys);
  if (input.schemaVersion !== "VALIDATION_RUN_INPUT_HASH_PAYLOAD_V1") throw new Error("VALIDATION_RUN_INPUT_SCHEMA_INVALID");
  if (input.phase !== "TRAINING" && input.phase !== "EVALUATION") throw new Error("VALIDATION_PHASE_INVALID");
  const validationProtocol = hashRefV1(input.validationProtocol);
  assertHashRefDomainV1(validationProtocol, "SYNTRAKE:VALIDATION_PROTOCOL:V1");
  const subjectExperiment = hashRefV1(input.subjectExperiment);
  assertHashRefDomainV1(subjectExperiment, "SYNTRAKE:EXPERIMENT:V1");
  const subjectResearchIr = hashRefV1(input.subjectResearchIr);
  assertHashRefDomainV1(subjectResearchIr, "SYNTRAKE:RESEARCH_IR:V1");
  const phaseResearchIr = hashRefV1(input.phaseResearchIr);
  assertHashRefDomainV1(phaseResearchIr, "SYNTRAKE:RESEARCH_IR:V1");
  const sourceDatasetSnapshot = hashRefV1(input.sourceDatasetSnapshot);
  assertHashRefDomainV1(sourceDatasetSnapshot, "SYNTRAKE:DATASET_SNAPSHOT:V1");
  const phaseDatasetSnapshot = hashRefV1(input.phaseDatasetSnapshot);
  assertHashRefDomainV1(phaseDatasetSnapshot, "SYNTRAKE:DATASET_SNAPSHOT:V1");
  const metricRequestSet = hashRefV1(input.metricRequestSet);
  assertHashRefDomainV1(metricRequestSet, "SYNTRAKE:METRIC_REQUEST_SET:V1");
  const executionConfig = hashRefV1(input.executionConfig);
  assertHashRefDomainV1(executionConfig, "SYNTRAKE:EXECUTION_CONFIG:V1");
  return {
    schemaVersion: input.schemaVersion,
    validationProtocol,
    subjectExperiment,
    subjectResearchIr,
    phaseResearchIr,
    sourceDatasetSnapshot,
    phaseDatasetSnapshot,
    foldOrdinal: canonicalIntegerV1(input.foldOrdinal, { min: "0", allowNegative: false }),
    phase: input.phase,
    phaseWindow: canonicalWindow(input.phaseWindow),
    engineId: immutableBehaviorTokenV1(input.engineId),
    engineVersion: immutableBehaviorTokenV1(input.engineVersion),
    metricRegistryVersion: immutableBehaviorTokenV1(input.metricRegistryVersion),
    metricRequestSet,
    executionConfig,
  };
}

export function canonicalValidationRunInputBytesV1(input: ValidationRunInputHashPayloadV1): Buffer {
  return i5ResearchInternalCanonicalJsonBytesV1(canonicalValidationRunInputHashPayloadV1(input));
}

export function hashValidationRunInputV1(input: ValidationRunInputHashPayloadV1): CanonicalSha256HexV1 {
  return hashCanonicalOwnerPayloadV1("SYNTRAKE:VALIDATION_RUN_INPUT:V1", canonicalValidationRunInputHashPayloadV1(input));
}

export function admitValidationRunInputV1(input: ValidationRunInputCandidateV1): AdmittedValidationRunInputV1 {
  const admittedProtocol = admitValidationProtocolV1(input.validationProtocolCandidate);
  const protocol = admittedProtocol.protocol as ValidationProtocolCandidateV1["protocol"] & {
    folds: readonly { ordinal: string; trainingWindow: ValidationWindowV1; evaluationWindow: ValidationWindowV1 }[];
  };
  const runInput = canonicalValidationRunInputHashPayloadV1(input.validationRunInput) as ValidationRunInputHashPayloadV1 & CanonicalJsonValue;
  assertSameRef(runInput.validationProtocol, admittedProtocol.validationProtocol, "Validation Protocol");
  assertSameRef(runInput.subjectExperiment, protocol.subjectExperiment, "subject Experiment");
  assertSameRef(runInput.subjectResearchIr, protocol.subjectResearchIr, "subject Research IR");
  assertSameRef(runInput.sourceDatasetSnapshot, protocol.sourceDatasetSnapshot, "source DatasetSnapshot");
  assertSameRef(runInput.metricRequestSet, protocol.metricRequestSet, "MetricRequestSet");
  assertSameRef(runInput.executionConfig, protocol.executionConfig, "ExecutionConfig");

  const fold = protocol.folds.find((entry) => entry.ordinal === runInput.foldOrdinal);
  if (!fold) throw new Error("VALIDATION_FOLD_NOT_FOUND");
  const expectedWindow = runInput.phase === "TRAINING" ? fold.trainingWindow : fold.evaluationWindow;
  if (runInput.phaseWindow.startDate !== expectedWindow.startDate || runInput.phaseWindow.endDate !== expectedWindow.endDate) {
    throw new Error("VALIDATION_PHASE_WINDOW_MISMATCH");
  }

  const subjectResearchIr = canonicalResearchIrPayloadV1(input.validationProtocolCandidate.subjectResearchIrPayload) as ResearchIrV1;
  const phaseResearchIr = canonicalResearchIrPayloadV1(input.phaseResearchIrPayload) as ResearchIrV1;
  const expectedPhaseIr = deriveValidationPhaseResearchIrV1(subjectResearchIr, expectedWindow);
  assertOnlyResearchIrTestPeriodChangedV1(subjectResearchIr, phaseResearchIr);
  if (!canonicalBytesEqual(expectedPhaseIr, phaseResearchIr)) throw new Error("VALIDATION_PHASE_RESEARCH_IR_MISMATCH");
  assertSameRef(runInput.phaseResearchIr, ref("SYNTRAKE:RESEARCH_IR:V1", hashResearchIrV1(phaseResearchIr)), "phase Research IR");

  const sourceSnapshot = canonicalDatasetSnapshotHashPayloadV1(input.validationProtocolCandidate.sourceDatasetSnapshotPayload) as DatasetSnapshotHashPayloadV1;
  assertSameRef(runInput.sourceDatasetSnapshot, ref("SYNTRAKE:DATASET_SNAPSHOT:V1", hashDatasetSnapshotV1(sourceSnapshot)), "source DatasetSnapshot");
  const sourceDatasetSeries = input.sourceDatasetSeriesPayloads.map((series) => canonicalDatasetSeriesHashPayloadV1(series) as DatasetSeriesHashPayloadV1);
  assertDatasetSnapshotSeries(sourceSnapshot, sourceDatasetSeries, "source DatasetSnapshot");

  if (input.sourceDatasetSeriesPayloads.length !== input.sourceMaterials.length) throw new Error("VALIDATION_SOURCE_MATERIAL_COUNT_MISMATCH");
  const sliced = sourceDatasetSeries.map((series, index) =>
    sliceValidationDatasetSeriesPrefixV1(series, input.sourceMaterials[index]!, expectedWindow.endDate));
  const slicedSeries = sliced.map((slice) => slice.series);
  const phaseDatasetSeries = input.phaseDatasetSeriesPayloads.map((series) => canonicalDatasetSeriesHashPayloadV1(series) as DatasetSeriesHashPayloadV1);
  assertSamePayloadSet(slicedSeries, phaseDatasetSeries, "VALIDATION_PHASE_DATASET_SERIES_MISMATCH");
  const phaseSnapshot = canonicalDatasetSnapshotHashPayloadV1(input.phaseDatasetSnapshotPayload) as DatasetSnapshotHashPayloadV1;
  assertDatasetSnapshotSeries(phaseSnapshot, phaseDatasetSeries, "phase DatasetSnapshot");
  assertSameRef(runInput.phaseDatasetSnapshot, ref("SYNTRAKE:DATASET_SNAPSHOT:V1", hashDatasetSnapshotV1(phaseSnapshot)), "phase DatasetSnapshot");

  const metricRequestSet = canonicalMetricRequestSetHashPayloadV1(input.validationProtocolCandidate.metricRequestSetPayload) as MetricRequestSetHashPayloadV1;
  const executionConfig = canonicalExecutionConfigHashPayloadV1(input.validationProtocolCandidate.executionConfigPayload) as ExecutionConfigHashPayloadV1;
  if (runInput.engineId !== "HISTORICAL_EXECUTION_ADAPTER" || runInput.engineVersion !== "ENGINE_V20260918") throw new Error("VALIDATION_RUN_INPUT_ENGINE_UNSUPPORTED");
  if (runInput.metricRegistryVersion !== "METRIC_REGISTRY_V20260918") throw new Error("VALIDATION_RUN_INPUT_METRIC_REGISTRY_UNSUPPORTED");
  if (metricRequestSet.metricRegistryVersion !== runInput.metricRegistryVersion) throw new Error("VALIDATION_RUN_INPUT_METRIC_REGISTRY_MISMATCH");
  if (executionConfig.engineCompatibilityVersion !== runInput.engineVersion) throw new Error("VALIDATION_RUN_INPUT_EXECUTION_CONFIG_MISMATCH");

  const frozenRunInput = deepFreezeCanonicalJsonV1(runInput);
  const phaseMaterials = sliced.map((slice) => freezeVerifiedDatasetSeriesMaterialV1(verifyDatasetSeriesMaterialV1(slice.series, slice.bytes)));
  const admitted = Object.freeze({
    validationRunInput: frozenRunInput,
    validationRunInputHash: Object.freeze(ref("SYNTRAKE:VALIDATION_RUN_INPUT:V1", hashCanonicalOwnerPayloadV1("SYNTRAKE:VALIDATION_RUN_INPUT:V1", frozenRunInput))),
    phaseResearchIr: deepFreezeCanonicalJsonV1(phaseResearchIr),
    phaseDatasetSeries: Object.freeze(phaseDatasetSeries.map((series) => deepFreezeCanonicalJsonV1(series))),
    phaseDatasetSnapshot: deepFreezeCanonicalJsonV1(phaseSnapshot),
    executionConfig: deepFreezeCanonicalJsonV1(executionConfig),
    metricRequestSet: deepFreezeCanonicalJsonV1(metricRequestSet),
    phaseMaterials: Object.freeze(phaseMaterials),
  });
  admittedValidationRunInputs.add(admitted);
  return admitted;
}

export function canonicalValidationChildResultHashPayloadV1(input: ValidationChildResultHashPayloadV1): CanonicalJsonValue {
  assertClosedPlainObject(input, childResultKeys);
  if (input.schemaVersion !== "VALIDATION_CHILD_RESULT_HASH_PAYLOAD_V1") throw new Error("VALIDATION_CHILD_RESULT_SCHEMA_INVALID");
  const validationRunInput = hashRefV1(input.validationRunInput);
  assertHashRefDomainV1(validationRunInput, "SYNTRAKE:VALIDATION_RUN_INPUT:V1");
  const resultFields = canonicalExecutionResultFieldsV1(input);
  return {
    schemaVersion: "VALIDATION_CHILD_RESULT_HASH_PAYLOAD_V1",
    validationRunInput,
    ...resultFields,
  };
}

export function canonicalValidationChildResultBytesV1(input: ValidationChildResultHashPayloadV1): Buffer {
  return i5ResearchInternalCanonicalJsonBytesV1(canonicalValidationChildResultHashPayloadV1(input));
}

export function hashValidationChildResultV1(input: ValidationChildResultHashPayloadV1): CanonicalSha256HexV1 {
  return hashCanonicalOwnerPayloadV1("SYNTRAKE:VALIDATION_CHILD_RESULT:V1", canonicalValidationChildResultHashPayloadV1(input));
}

export function executeValidationChildBacktestV1(input: ValidationChildExecutionInputV1): ValidationChildExecutionResultV1 {
  if (!admittedValidationRunInputs.has(input.admittedRunInput as object)) {
    return { ok: false, code: "VALIDATION_RUN_INPUT_NOT_ADMITTED" };
  }
  const runInput = input.admittedRunInput.validationRunInput as ValidationRunInputHashPayloadV1;
  const kernelInput: HistoricalKernelInputV1 = {
    researchIr: input.admittedRunInput.phaseResearchIr,
    datasetSeries: input.admittedRunInput.phaseDatasetSeries,
    executionConfig: input.admittedRunInput.executionConfig,
    metricRequestSet: input.admittedRunInput.metricRequestSet,
    materials: input.admittedRunInput.phaseMaterials,
  };
  const kernel = executeHistoricalKernelV1(kernelInput);
  if (kernel.ok === false) return kernel;
  if (
    kernel.resultFields.testPeriod.startDate !== runInput.phaseWindow.startDate ||
    kernel.resultFields.testPeriod.endDate !== runInput.phaseWindow.endDate ||
    input.admittedRunInput.phaseResearchIr.testPeriod.startDate !== runInput.phaseWindow.startDate ||
    input.admittedRunInput.phaseResearchIr.testPeriod.endDate !== runInput.phaseWindow.endDate
  ) {
    return { ok: false, code: "VALIDATION_CHILD_RESULT_TEST_PERIOD_MISMATCH" };
  }
  if (kernel.resultFields.engineId !== runInput.engineId || kernel.resultFields.engineVersion !== runInput.engineVersion) {
    return { ok: false, code: "VALIDATION_CHILD_RESULT_ENGINE_MISMATCH" };
  }
  const childResultPayload: ValidationChildResultHashPayloadV1 = {
    schemaVersion: "VALIDATION_CHILD_RESULT_HASH_PAYLOAD_V1",
    validationRunInput: input.admittedRunInput.validationRunInputHash,
    ...kernel.resultFields,
  };
  return {
    ok: true,
    artifacts: kernel.artifacts,
    childResultPayload,
    childResultHash: ref("SYNTRAKE:VALIDATION_CHILD_RESULT:V1", hashValidationChildResultV1(childResultPayload)),
  };
}

function hashCanonicalOwnerPayloadV1(domain: HashRefV1["hashDomain"], payload: CanonicalJsonValue): CanonicalSha256HexV1 {
  return sha256HexV1(ownerStructuredHashPreimageV1(domain, payload));
}

function ref(hashDomain: HashRefV1["hashDomain"], hashHex: CanonicalSha256HexV1): HashRefV1 {
  return hashRefV1({ hashAlgorithm: "SHA-256", hashDomain, hashVersion: "SYNTRAKE_SHA256_V1", hashHex });
}

function canonicalWindow(input: ValidationWindowV1): ValidationWindowV1 {
  assertClosedPlainObject(input, windowKeys);
  return { startDate: String(input.startDate), endDate: String(input.endDate) };
}

function assertSameRef(actualInput: HashRefV1, expectedInput: HashRefV1, name: string): void {
  const actual = hashRefV1(actualInput);
  const expected = hashRefV1(expectedInput);
  if (
    actual.hashAlgorithm !== expected.hashAlgorithm ||
    actual.hashDomain !== expected.hashDomain ||
    actual.hashVersion !== expected.hashVersion ||
    actual.hashHex !== expected.hashHex
  ) {
    throw new Error(`${name} HashRef mismatch`);
  }
}

function assertDatasetSnapshotSeries(
  snapshot: DatasetSnapshotHashPayloadV1,
  series: readonly DatasetSeriesHashPayloadV1[],
  name: string,
): void {
  const expected = series.map((payload) => ref("SYNTRAKE:DATASET_SERIES:V1", hashDatasetSeriesV1(payload)))
    .sort((left, right) => left.hashHex.localeCompare(right.hashHex));
  const actual = snapshot.series.map(hashRefV1).sort((left, right) => left.hashHex.localeCompare(right.hashHex));
  if (actual.length !== expected.length) throw new Error(`${name} series mismatch`);
  for (let index = 0; index < actual.length; index += 1) assertSameRef(actual[index]!, expected[index]!, name);
}

function assertSamePayloadSet(
  expectedInput: readonly DatasetSeriesHashPayloadV1[],
  actualInput: readonly DatasetSeriesHashPayloadV1[],
  code: string,
): void {
  const expected = expectedInput.map((payload) => i5ResearchInternalCanonicalJsonBytesV1(canonicalDatasetSeriesHashPayloadV1(payload)).toString("utf8")).sort();
  const actual = actualInput.map((payload) => i5ResearchInternalCanonicalJsonBytesV1(canonicalDatasetSeriesHashPayloadV1(payload)).toString("utf8")).sort();
  if (expected.length !== actual.length) throw new Error(code);
  for (let index = 0; index < expected.length; index += 1) if (expected[index] !== actual[index]) throw new Error(code);
}

function canonicalBytesEqual(left: CanonicalJsonValue, right: CanonicalJsonValue): boolean {
  return i5ResearchInternalCanonicalJsonBytesV1(left).equals(i5ResearchInternalCanonicalJsonBytesV1(right));
}

function deepFreezeCanonicalJsonV1<T extends CanonicalJsonValue>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    for (const item of value) deepFreezeCanonicalJsonV1(item);
    return Object.freeze(value) as T;
  }
  if (Object.getPrototypeOf(value) !== Object.prototype) throw new Error("expected canonical JSON plain object");
  for (const child of Object.values(value)) deepFreezeCanonicalJsonV1(child);
  return Object.freeze(value) as T;
}

function freezeVerifiedDatasetSeriesMaterialV1(material: VerifiedDatasetSeriesMaterialV1): VerifiedDatasetSeriesMaterialV1 {
  const observations = material.observations.map((observation) => Object.freeze({
    date: observation.date,
    value: observation.value,
  } satisfies DatasetSeriesObservationV1));
  return Object.freeze({
    series: deepFreezeCanonicalJsonV1(material.series),
    observations: Object.freeze(observations),
    byDate: material.byDate,
  });
}

function assertClosedPlainObject(value: unknown, allowedKeys: ReadonlySet<string>): void {
  if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error("VALIDATION_CANONICAL_PLAIN_OBJECT_REQUIRED");
  }
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") throw new Error("VALIDATION_CANONICAL_STRING_KEY_REQUIRED");
    if (!allowedKeys.has(key)) throw new Error(`undeclared field ${key}`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor)) throw new Error("VALIDATION_CANONICAL_DATA_PROPERTY_REQUIRED");
    if (descriptor.enumerable !== true) throw new Error("VALIDATION_CANONICAL_ENUMERABLE_PROPERTY_REQUIRED");
    if (descriptor.value === undefined) throw new Error(`undefined is not canonical data at ${key}`);
  }
  for (const key of allowedKeys) if (!Object.hasOwn(value, key)) throw new Error(`missing field ${key}`);
}
