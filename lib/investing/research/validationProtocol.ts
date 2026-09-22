import {
  assertHashRefDomainV1,
  canonicalDateV1,
  canonicalIntegerV1,
  hashRefV1,
  i5ResearchInternalCanonicalJsonBytesV1,
  immutableBehaviorTokenV1,
  sha256HexV1,
  type CanonicalJsonValue,
  type CanonicalSha256HexV1,
  type HashRefV1,
} from "./canonical";
import { isXnysSessionV1, nextXnysSessionV1, xnysSessionsInRangeV1 } from "./calendars";
import {
  canonicalDatasetSeriesHashPayloadV1,
  hashDatasetSnapshotV1,
  hashExecutionConfigV1,
  hashMetricRequestSetV1,
  type DatasetSeriesHashPayloadV1,
  type DatasetSnapshotHashPayloadV1,
  type ExecutionConfigHashPayloadV1,
  type MetricRequestSetHashPayloadV1,
} from "./executionMaterials";
import {
  canonicalDatasetSeriesMaterialBytesV1,
  verifyDatasetSeriesMaterialV1,
  type DatasetSeriesObservationV1,
} from "./datasetMaterial";
import { canonicalResearchIrPayloadV1, type ResearchIrV1 } from "./researchIr";
import {
  canonicalExperimentHashPayloadV1,
  hashExperimentV1,
  type ExperimentCandidateV1,
} from "./experiment";
import { hashResearchIrV1 } from "./researchIr";
import { ownerStructuredHashPreimageV1 } from "./scientificPreimage";

export type ValidationModeV1 =
  | "CHRONOLOGICAL_HOLDOUT"
  | "IS_OOS_SPLIT"
  | "ROLLING_WALK_FORWARD"
  | "EXPANDING_WALK_FORWARD";

export type ValidationWindowV1 = Readonly<{
  startDate: string;
  endDate: string;
}>;

export type ValidationFoldV1 = Readonly<{
  ordinal: string;
  trainingWindow: ValidationWindowV1;
  evaluationWindow: ValidationWindowV1;
}>;

export type ValidationProtocolHashPayloadV1 = Readonly<{
  schemaVersion: "VALIDATION_PROTOCOL_HASH_PAYLOAD_V1";
  methodology: "VALIDATION_METHODOLOGY_V1";
  boundaryPolicy: "EXACT_XNYS_SESSION_BOUNDARIES_V1";
  missingDataSemantics: "INHERIT_EXECUTION_CONFIG_EXACT_V1";
  sourceMaterialPolicy: "PREFIX_TO_PHASE_END_NO_FUTURE_DATA_V1";
  subjectExperiment: HashRefV1;
  subjectResearchIr: HashRefV1;
  sourceDatasetSnapshot: HashRefV1;
  engineId: string;
  engineVersion: string;
  metricRegistryVersion: string;
  metricRequestSet: HashRefV1;
  executionConfig: HashRefV1;
  validationMode: ValidationModeV1;
  folds: readonly ValidationFoldV1[];
}>;

export type DatasetSeriesPrefixSliceV1 = Readonly<{
  series: DatasetSeriesHashPayloadV1;
  bytes: Buffer;
  observations: readonly DatasetSeriesObservationV1[];
}>;

export type ValidationProtocolCandidateV1 = Readonly<{
  protocol: ValidationProtocolHashPayloadV1;
  subjectExperimentCandidate: ExperimentCandidateV1;
  subjectResearchIrPayload: ResearchIrV1;
  sourceDatasetSnapshotPayload: DatasetSnapshotHashPayloadV1;
  metricRequestSetPayload: MetricRequestSetHashPayloadV1;
  executionConfigPayload: ExecutionConfigHashPayloadV1;
}>;

export type AdmittedValidationProtocolV1 = Readonly<{
  protocol: CanonicalJsonValue;
  validationProtocol: HashRefV1;
}>;

const payloadKeys = new Set([
  "schemaVersion",
  "methodology",
  "boundaryPolicy",
  "missingDataSemantics",
  "sourceMaterialPolicy",
  "subjectExperiment",
  "subjectResearchIr",
  "sourceDatasetSnapshot",
  "engineId",
  "engineVersion",
  "metricRegistryVersion",
  "metricRequestSet",
  "executionConfig",
  "validationMode",
  "folds",
]);
const foldKeys = new Set(["ordinal", "trainingWindow", "evaluationWindow"]);
const windowKeys = new Set(["startDate", "endDate"]);
const validationModes = new Set(["CHRONOLOGICAL_HOLDOUT", "IS_OOS_SPLIT", "ROLLING_WALK_FORWARD", "EXPANDING_WALK_FORWARD"]);

type CanonicalValidationFoldV1 = ValidationFoldV1 & CanonicalJsonValue;
type CanonicalValidationProtocolPayloadV1 = Readonly<{
  schemaVersion: "VALIDATION_PROTOCOL_HASH_PAYLOAD_V1";
  methodology: "VALIDATION_METHODOLOGY_V1";
  boundaryPolicy: "EXACT_XNYS_SESSION_BOUNDARIES_V1";
  missingDataSemantics: "INHERIT_EXECUTION_CONFIG_EXACT_V1";
  sourceMaterialPolicy: "PREFIX_TO_PHASE_END_NO_FUTURE_DATA_V1";
  subjectExperiment: HashRefV1;
  subjectResearchIr: HashRefV1;
  sourceDatasetSnapshot: HashRefV1;
  engineId: string;
  engineVersion: string;
  metricRegistryVersion: string;
  metricRequestSet: HashRefV1;
  executionConfig: HashRefV1;
  validationMode: ValidationModeV1;
  folds: readonly CanonicalValidationFoldV1[];
}> & CanonicalJsonValue;

const acceptedEngineIdV1 = "HISTORICAL_EXECUTION_ADAPTER";
const acceptedEngineVersionV1 = "ENGINE_V20260918";
const acceptedMetricRegistryVersionV1 = "METRIC_REGISTRY_V20260918";

export function canonicalValidationProtocolHashPayloadV1(input: ValidationProtocolHashPayloadV1): CanonicalJsonValue {
  assertClosedPlainObject(input, payloadKeys);
  if (input.schemaVersion !== "VALIDATION_PROTOCOL_HASH_PAYLOAD_V1") throw new Error("invalid ValidationProtocol schemaVersion");
  if (input.methodology !== "VALIDATION_METHODOLOGY_V1") throw new Error("unsupported Validation methodology");
  if (input.boundaryPolicy !== "EXACT_XNYS_SESSION_BOUNDARIES_V1") throw new Error("unsupported Validation boundary policy");
  if (input.missingDataSemantics !== "INHERIT_EXECUTION_CONFIG_EXACT_V1") throw new Error("unsupported Validation missing-data semantics");
  if (input.sourceMaterialPolicy !== "PREFIX_TO_PHASE_END_NO_FUTURE_DATA_V1") throw new Error("unsupported Validation source material policy");
  if (!validationModes.has(input.validationMode)) throw new Error("unsupported Validation mode");

  const subjectExperiment = hashRefV1(input.subjectExperiment);
  assertHashRefDomainV1(subjectExperiment, "SYNTRAKE:EXPERIMENT:V1");
  const subjectResearchIr = hashRefV1(input.subjectResearchIr);
  assertHashRefDomainV1(subjectResearchIr, "SYNTRAKE:RESEARCH_IR:V1");
  const sourceDatasetSnapshot = hashRefV1(input.sourceDatasetSnapshot);
  assertHashRefDomainV1(sourceDatasetSnapshot, "SYNTRAKE:DATASET_SNAPSHOT:V1");
  const metricRequestSet = hashRefV1(input.metricRequestSet);
  assertHashRefDomainV1(metricRequestSet, "SYNTRAKE:METRIC_REQUEST_SET:V1");
  const executionConfig = hashRefV1(input.executionConfig);
  assertHashRefDomainV1(executionConfig, "SYNTRAKE:EXECUTION_CONFIG:V1");

  const folds = canonicalFoldsV1(input.validationMode, input.folds);
  return {
    schemaVersion: input.schemaVersion,
    methodology: input.methodology,
    boundaryPolicy: input.boundaryPolicy,
    missingDataSemantics: input.missingDataSemantics,
    sourceMaterialPolicy: input.sourceMaterialPolicy,
    subjectExperiment,
    subjectResearchIr,
    sourceDatasetSnapshot,
    engineId: immutableBehaviorTokenV1(input.engineId),
    engineVersion: immutableBehaviorTokenV1(input.engineVersion),
    metricRegistryVersion: immutableBehaviorTokenV1(input.metricRegistryVersion),
    metricRequestSet,
    executionConfig,
    validationMode: input.validationMode,
    folds,
  };
}

export function canonicalValidationProtocolBytesV1(input: ValidationProtocolHashPayloadV1): Buffer {
  return i5ResearchInternalCanonicalJsonBytesV1(canonicalValidationProtocolHashPayloadV1(input));
}

export function hashValidationProtocolV1(input: ValidationProtocolHashPayloadV1): CanonicalSha256HexV1 {
  return hashCanonicalValidationProtocolPayloadV1(canonicalValidationProtocolHashPayloadV1(input));
}

export function admitValidationProtocolV1(input: ValidationProtocolCandidateV1): AdmittedValidationProtocolV1 {
  const protocol = canonicalValidationProtocolHashPayloadV1(input.protocol) as CanonicalValidationProtocolPayloadV1;
  if (protocol.engineId !== acceptedEngineIdV1) throw new Error("VALIDATION_ENGINE_ID_UNSUPPORTED");
  if (protocol.engineVersion !== acceptedEngineVersionV1) throw new Error("VALIDATION_ENGINE_VERSION_UNSUPPORTED");
  if (protocol.metricRegistryVersion !== acceptedMetricRegistryVersionV1) {
    throw new Error("VALIDATION_METRIC_REGISTRY_VERSION_UNSUPPORTED");
  }

  const experiment = ref("SYNTRAKE:EXPERIMENT:V1", hashExperimentV1(input.subjectExperimentCandidate));
  assertSameRef(protocol.subjectExperiment, experiment, "ValidationProtocol Experiment");
  const experimentPayload = canonicalExperimentHashPayloadV1(input.subjectExperimentCandidate);
  assertSameRef(experimentPayload.researchIr, protocol.subjectResearchIr, "ValidationProtocol Experiment Research IR");

  const researchIr = ref("SYNTRAKE:RESEARCH_IR:V1", hashResearchIrV1(input.subjectResearchIrPayload));
  assertSameRef(protocol.subjectResearchIr, researchIr, "ValidationProtocol Research IR");

  const datasetSnapshot = ref("SYNTRAKE:DATASET_SNAPSHOT:V1", hashDatasetSnapshotV1(input.sourceDatasetSnapshotPayload));
  assertSameRef(protocol.sourceDatasetSnapshot, datasetSnapshot, "ValidationProtocol DatasetSnapshot");

  const metricRequestSet = ref("SYNTRAKE:METRIC_REQUEST_SET:V1", hashMetricRequestSetV1(input.metricRequestSetPayload));
  assertSameRef(protocol.metricRequestSet, metricRequestSet, "ValidationProtocol MetricRequestSet");
  if (input.metricRequestSetPayload.metricRegistryVersion !== protocol.metricRegistryVersion) {
    throw new Error("VALIDATION_METRIC_REGISTRY_VERSION_MISMATCH");
  }

  const executionConfig = ref("SYNTRAKE:EXECUTION_CONFIG:V1", hashExecutionConfigV1(input.executionConfigPayload));
  assertSameRef(protocol.executionConfig, executionConfig, "ValidationProtocol ExecutionConfig");
  if (input.executionConfigPayload.engineCompatibilityVersion !== protocol.engineVersion) {
    throw new Error("VALIDATION_ENGINE_VERSION_MISMATCH");
  }
  assertExecutionConfigBoundToValidationProtocolV1(protocol, input.executionConfigPayload);
  const frozenProtocol = deepFreezeCanonicalJsonV1(protocol);

  return Object.freeze({
    protocol: frozenProtocol,
    validationProtocol: Object.freeze(ref("SYNTRAKE:VALIDATION_PROTOCOL:V1", hashCanonicalValidationProtocolPayloadV1(frozenProtocol))),
  });
}

function hashCanonicalValidationProtocolPayloadV1(payload: CanonicalJsonValue): CanonicalSha256HexV1 {
  return sha256HexV1(ownerStructuredHashPreimageV1("SYNTRAKE:VALIDATION_PROTOCOL:V1", payload));
}

export function deriveValidationPhaseResearchIrV1(subjectResearchIr: ResearchIrV1, phaseWindow: ValidationWindowV1): ResearchIrV1 {
  canonicalResearchIrPayloadV1(subjectResearchIr);
  const window = canonicalWindowV1(phaseWindow);
  const derived = { ...subjectResearchIr, testPeriod: { startDate: window.startDate, endDate: window.endDate } };
  assertOnlyResearchIrTestPeriodChangedV1(subjectResearchIr, derived);
  return derived;
}

export function assertOnlyResearchIrTestPeriodChangedV1(subjectResearchIr: ResearchIrV1, derivedResearchIr: ResearchIrV1): void {
  const subject = canonicalResearchIrPayloadV1(subjectResearchIr);
  const derived = canonicalResearchIrPayloadV1(derivedResearchIr);
  const subjectWithoutTestPeriod = withoutKey(subject, "testPeriod");
  const derivedWithoutTestPeriod = withoutKey(derived, "testPeriod");
  if (!i5ResearchInternalCanonicalJsonBytesV1(subjectWithoutTestPeriod).equals(i5ResearchInternalCanonicalJsonBytesV1(derivedWithoutTestPeriod))) {
    throw new Error("VALIDATION_PHASE_RESEARCH_IR_DRIFT");
  }
}

export function sliceValidationDatasetSeriesPrefixV1(
  sourceSeries: DatasetSeriesHashPayloadV1,
  sourceBytes: Buffer,
  phaseEndDate: string,
): DatasetSeriesPrefixSliceV1 {
  canonicalDatasetSeriesHashPayloadV1(sourceSeries);
  const verified = verifyDatasetSeriesMaterialV1(sourceSeries, sourceBytes);
  const endDate = canonicalDateV1(phaseEndDate);
  if (!isXnysSessionV1(endDate)) throw new Error("VALIDATION_PHASE_END_NOT_XNYS_SESSION");
  if (endDate > sourceSeries.coverageEnd) throw new Error("VALIDATION_PHASE_END_OUTSIDE_SOURCE_COVERAGE");
  const observations = verified.observations.filter((observation) => observation.date <= endDate);
  if (observations.length === 0) throw new Error("VALIDATION_PREFIX_EMPTY");
  if (observations.some((observation) => observation.date > endDate)) throw new Error("VALIDATION_PREFIX_LOOKAHEAD");
  if (observations.at(-1)!.date !== endDate) throw new Error("VALIDATION_PHASE_END_MATERIAL_MISSING");
  const bytes = canonicalDatasetSeriesMaterialBytesV1(observations);
  const series: DatasetSeriesHashPayloadV1 = {
    ...sourceSeries,
    coverageEnd: observations.at(-1)!.date,
    observationCount: String(observations.length),
    contentSha256: sha256HexV1(bytes),
  };
  verifyDatasetSeriesMaterialV1(series, bytes);
  return Object.freeze({ series, bytes, observations });
}

export function assertExecutionConfigBoundToValidationProtocolV1(
  protocol: ValidationProtocolHashPayloadV1,
  executionConfig: ExecutionConfigHashPayloadV1,
): void {
  if (executionConfig.missingDataPolicy === undefined || protocol.missingDataSemantics !== "INHERIT_EXECUTION_CONFIG_EXACT_V1") {
    throw new Error("VALIDATION_MISSING_DATA_POLICY_UNBOUND");
  }
  const executionConfigRef = hashRefV1(protocol.executionConfig);
  assertHashRefDomainV1(executionConfigRef, "SYNTRAKE:EXECUTION_CONFIG:V1");
  if (executionConfigRef.hashHex !== hashExecutionConfigV1(executionConfig)) {
    throw new Error("VALIDATION_EXECUTION_CONFIG_HASH_MISMATCH");
  }
}

function canonicalFoldsV1(mode: ValidationModeV1, input: readonly ValidationFoldV1[]): CanonicalValidationFoldV1[] {
  if (!Array.isArray(input)) throw new Error("Validation folds must be an ORDERED_SEQUENCE array");
  if (mode === "CHRONOLOGICAL_HOLDOUT" || mode === "IS_OOS_SPLIT") {
    if (input.length !== 1) throw new Error("Validation mode requires exactly one fold");
  } else if (input.length < 2) {
    throw new Error("Walk-forward validation requires at least two folds");
  }
  const folds = input.map(canonicalFoldV1);
  validateOrdinals(folds);
  validateModeInvariants(mode, folds);
  return folds;
}

function canonicalFoldV1(input: ValidationFoldV1): CanonicalValidationFoldV1 {
  assertClosedPlainObject(input, foldKeys);
  const ordinal = canonicalIntegerV1(input.ordinal, { min: "0", allowNegative: false });
  const trainingWindow = canonicalWindowV1(input.trainingWindow);
  const evaluationWindow = canonicalWindowV1(input.evaluationWindow);
  if (trainingWindow.endDate >= evaluationWindow.startDate) throw new Error("VALIDATION_TRAIN_EVAL_OVERLAP");
  return { ordinal, trainingWindow, evaluationWindow };
}

function canonicalWindowV1(input: ValidationWindowV1): ValidationWindowV1 {
  assertClosedPlainObject(input, windowKeys);
  const startDate = canonicalDateV1(input.startDate);
  const endDate = canonicalDateV1(input.endDate);
  if (!isXnysSessionV1(startDate) || !isXnysSessionV1(endDate)) throw new Error("VALIDATION_WINDOW_BOUNDARY_NOT_XNYS_SESSION");
  if (startDate > endDate) throw new Error("VALIDATION_WINDOW_REVERSED");
  return { startDate, endDate };
}

function validateOrdinals(folds: readonly CanonicalValidationFoldV1[]): void {
  const seen = new Set<string>();
  folds.forEach((fold, index) => {
    if (seen.has(fold.ordinal)) throw new Error("VALIDATION_FOLD_DUPLICATE_ORDINAL");
    seen.add(fold.ordinal);
    if (fold.ordinal !== String(index)) throw new Error("VALIDATION_FOLD_ORDINAL_GAP");
  });
}

function validateModeInvariants(mode: ValidationModeV1, folds: readonly CanonicalValidationFoldV1[]): void {
  if (mode === "IS_OOS_SPLIT") {
    assertContiguous(folds[0]!);
    return;
  }
  if (mode === "ROLLING_WALK_FORWARD") {
    const trainSize = sessionCount(folds[0]!.trainingWindow);
    const evalSize = sessionCount(folds[0]!.evaluationWindow);
    assertNonOverlappingEvaluations(folds);
    for (const fold of folds) {
      if (sessionCount(fold.trainingWindow) !== trainSize) throw new Error("VALIDATION_ROLLING_TRAINING_SIZE_DRIFT");
      if (sessionCount(fold.evaluationWindow) !== evalSize) throw new Error("VALIDATION_ROLLING_EVALUATION_SIZE_DRIFT");
    }
    validateWalkForwardSequence(folds);
    return;
  }
  if (mode === "EXPANDING_WALK_FORWARD") {
    const trainStart = folds[0]!.trainingWindow.startDate;
    const evalSize = sessionCount(folds[0]!.evaluationWindow);
    assertNonOverlappingEvaluations(folds);
    for (const fold of folds) {
      if (fold.trainingWindow.startDate !== trainStart) throw new Error("VALIDATION_EXPANDING_TRAIN_START_DRIFT");
      if (sessionCount(fold.evaluationWindow) !== evalSize) throw new Error("VALIDATION_EXPANDING_EVALUATION_SIZE_DRIFT");
    }
    validateWalkForwardSequence(folds);
  }
}

function assertContiguous(fold: ValidationFoldV1): void {
  if (nextXnysSessionV1(fold.trainingWindow.endDate) !== fold.evaluationWindow.startDate) {
    throw new Error("VALIDATION_OOS_NOT_CONTIGUOUS");
  }
}

function validateWalkForwardSequence(folds: readonly ValidationFoldV1[]): void {
  for (let index = 1; index < folds.length; index += 1) {
    const previous = folds[index - 1]!;
    const current = folds[index]!;
    if (current.trainingWindow.endDate !== previous.evaluationWindow.endDate) throw new Error("VALIDATION_WALK_FORWARD_TRAIN_END_DRIFT");
    assertContiguous(current);
  }
}

function assertNonOverlappingEvaluations(folds: readonly ValidationFoldV1[]): void {
  let previousEnd = "";
  for (const fold of folds) {
    if (previousEnd !== "" && fold.evaluationWindow.startDate <= previousEnd) throw new Error("VALIDATION_EVALUATION_OVERLAP");
    previousEnd = fold.evaluationWindow.endDate;
  }
}

function sessionCount(window: ValidationWindowV1): number {
  return xnysSessionsInRangeV1(window.startDate, window.endDate).length;
}

function ref(hashDomain: HashRefV1["hashDomain"], hashHex: CanonicalSha256HexV1): HashRefV1 {
  return hashRefV1({ hashAlgorithm: "SHA-256", hashDomain, hashVersion: "SYNTRAKE_SHA256_V1", hashHex });
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

function withoutKey(value: CanonicalJsonValue, keyToDrop: string): CanonicalJsonValue {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== keyToDrop)) as CanonicalJsonValue;
}

function assertClosedPlainObject(value: unknown, allowedKeys: ReadonlySet<string>) {
  if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error("expected closed plain object");
  }
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") throw new Error("VALIDATION_CANONICAL_STRING_KEY_REQUIRED");
    if (!allowedKeys.has(key)) throw new Error(`undeclared field ${key}`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor)) throw new Error("VALIDATION_CANONICAL_DATA_PROPERTY_REQUIRED");
    if (descriptor.enumerable !== true) throw new Error("VALIDATION_CANONICAL_ENUMERABLE_PROPERTY_REQUIRED");
    if (descriptor.value === undefined) throw new Error(`undefined is not canonical data at ${key}`);
  }
  for (const key of allowedKeys) {
    if (!Object.hasOwn(value, key)) throw new Error(`missing field ${key}`);
  }
}
