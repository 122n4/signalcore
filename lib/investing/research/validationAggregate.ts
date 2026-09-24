import {
  assertHashDomainAdmittedForHashingV1,
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
import type { ValidationModeV1 } from "./validationProtocol";

export type ValidationAggregateFoldV1 = Readonly<{
  ordinal: string;
  trainingRunInput: HashRefV1;
  trainingChildResult: HashRefV1;
  evaluationRunInput: HashRefV1;
  evaluationChildResult: HashRefV1;
}>;

export type ValidationResultHashPayloadV1 = Readonly<{
  schemaVersion: "VALIDATION_RESULT_HASH_PAYLOAD_V1";
  methodology: "VALIDATION_AGGREGATION_METHODOLOGY_V1";
  validationProtocol: HashRefV1;
  subjectExperiment: HashRefV1;
  validationMode: ValidationModeV1;
  folds: readonly ValidationAggregateFoldV1[];
}>;

const payloadKeys = new Set([
  "schemaVersion",
  "methodology",
  "validationProtocol",
  "subjectExperiment",
  "validationMode",
  "folds",
]);
const foldKeys = new Set([
  "ordinal",
  "trainingRunInput",
  "trainingChildResult",
  "evaluationRunInput",
  "evaluationChildResult",
]);
const validationModes = new Set<ValidationModeV1>([
  "CHRONOLOGICAL_HOLDOUT",
  "IS_OOS_SPLIT",
  "ROLLING_WALK_FORWARD",
  "EXPANDING_WALK_FORWARD",
]);

export function canonicalValidationResultHashPayloadV1(input: ValidationResultHashPayloadV1): CanonicalJsonValue {
  assertClosedPlainObject(input, payloadKeys, "ValidationResult");
  if (input.schemaVersion !== "VALIDATION_RESULT_HASH_PAYLOAD_V1") {
    throw new Error("VALIDATION_RESULT_SCHEMA_INVALID");
  }
  if (input.methodology !== "VALIDATION_AGGREGATION_METHODOLOGY_V1") {
    throw new Error("VALIDATION_RESULT_METHODOLOGY_INVALID");
  }
  immutableBehaviorTokenV1(input.methodology);
  if (!validationModes.has(input.validationMode)) throw new Error("VALIDATION_RESULT_MODE_INVALID");

  const validationProtocol = hashRefV1(input.validationProtocol);
  assertHashRefDomainV1(validationProtocol, "SYNTRAKE:VALIDATION_PROTOCOL:V1");
  const subjectExperiment = hashRefV1(input.subjectExperiment);
  assertHashRefDomainV1(subjectExperiment, "SYNTRAKE:EXPERIMENT:V1");

  if (!Array.isArray(input.folds) || input.folds.length === 0) {
    throw new Error("VALIDATION_RESULT_FOLDS_EMPTY");
  }

  let previousOrdinal: bigint | null = null;
  const folds = input.folds.map((fold) => {
    assertClosedPlainObject(fold, foldKeys, "ValidationResultFold");
    const ordinal = canonicalIntegerV1(fold.ordinal, { min: "0", allowNegative: false });
    const ordinalBigInt = BigInt(ordinal);
    if (previousOrdinal !== null && ordinalBigInt <= previousOrdinal) {
      throw new Error("VALIDATION_RESULT_FOLD_ORDER_INVALID");
    }
    previousOrdinal = ordinalBigInt;

    const trainingRunInput = hashRefV1(fold.trainingRunInput);
    assertHashRefDomainV1(trainingRunInput, "SYNTRAKE:VALIDATION_RUN_INPUT:V1");
    const trainingChildResult = hashRefV1(fold.trainingChildResult);
    assertHashRefDomainV1(trainingChildResult, "SYNTRAKE:VALIDATION_CHILD_RESULT:V1");
    const evaluationRunInput = hashRefV1(fold.evaluationRunInput);
    assertHashRefDomainV1(evaluationRunInput, "SYNTRAKE:VALIDATION_RUN_INPUT:V1");
    const evaluationChildResult = hashRefV1(fold.evaluationChildResult);
    assertHashRefDomainV1(evaluationChildResult, "SYNTRAKE:VALIDATION_CHILD_RESULT:V1");

    return {
      ordinal,
      trainingRunInput,
      trainingChildResult,
      evaluationRunInput,
      evaluationChildResult,
    };
  });

  return {
    schemaVersion: input.schemaVersion,
    methodology: input.methodology,
    validationProtocol,
    subjectExperiment,
    validationMode: input.validationMode,
    folds,
  };
}

export function canonicalValidationResultBytesV1(input: ValidationResultHashPayloadV1): Buffer {
  return i5ResearchInternalCanonicalJsonBytesV1(canonicalValidationResultHashPayloadV1(input));
}

export function hashValidationResultV1(input: ValidationResultHashPayloadV1): CanonicalSha256HexV1 {
  const payload = canonicalValidationResultHashPayloadV1(input);
  assertHashDomainAdmittedForHashingV1("SYNTRAKE:VALIDATION_RESULT:V1");
  return sha256HexV1(
    Buffer.concat([
      Buffer.from("SYNTRAKE:VALIDATION_RESULT:V1\n", "utf8"),
      i5ResearchInternalCanonicalJsonBytesV1(payload),
    ]),
  );
}

function assertClosedPlainObject(value: unknown, allowedKeys: ReadonlySet<string>, label: string): void {
  if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error(label + " must be a plain object");
  }
  for (const key of Object.keys(value as Record<string, unknown>)) {
    if (!allowedKeys.has(key)) throw new Error(label + " contains unknown key: " + key);
  }
}
