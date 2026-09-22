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
  hashExecutionConfigV1,
  type DatasetSeriesHashPayloadV1,
  type ExecutionConfigHashPayloadV1,
} from "./executionMaterials";
import {
  canonicalDatasetSeriesMaterialBytesV1,
  verifyDatasetSeriesMaterialV1,
  type DatasetSeriesObservationV1,
} from "./datasetMaterial";
import { canonicalResearchIrPayloadV1, type ResearchIrV1 } from "./researchIr";
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
  return sha256HexV1(ownerStructuredHashPreimageV1("SYNTRAKE:VALIDATION_PROTOCOL:V1", canonicalValidationProtocolHashPayloadV1(input)));
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
  const observations = verified.observations.filter((observation) => observation.date <= endDate);
  if (observations.length === 0) throw new Error("VALIDATION_PREFIX_EMPTY");
  if (observations.some((observation) => observation.date > endDate)) throw new Error("VALIDATION_PREFIX_LOOKAHEAD");
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

function withoutKey(value: CanonicalJsonValue, keyToDrop: string): CanonicalJsonValue {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== keyToDrop)) as CanonicalJsonValue;
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
