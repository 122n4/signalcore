import { describe, expect, it } from "vitest";
import {
  canonicalValidationResultBytesV1,
  hashValidationResultV1,
  type ValidationResultHashPayloadV1,
} from "../lib/investing/research";
import type { HashRefV1 } from "../lib/investing/research/canonical";

function ref(hashDomain: HashRefV1["hashDomain"], seed: string): HashRefV1 {
  return {
    hashAlgorithm: "SHA-256",
    hashDomain,
    hashVersion: "SYNTRAKE_SHA256_V1",
    hashHex: seed.repeat(64).slice(0, 64).toUpperCase() as never,
  };
}

function payload(): ValidationResultHashPayloadV1 {
  return {
    schemaVersion: "VALIDATION_RESULT_HASH_PAYLOAD_V1",
    methodology: "VALIDATION_AGGREGATION_METHODOLOGY_V1",
    validationProtocol: ref("SYNTRAKE:VALIDATION_PROTOCOL:V1", "A"),
    subjectExperiment: ref("SYNTRAKE:EXPERIMENT:V1", "B"),
    validationMode: "ROLLING_WALK_FORWARD",
    folds: [
      {
        ordinal: "0",
        trainingRunInput: ref("SYNTRAKE:VALIDATION_RUN_INPUT:V1", "C"),
        trainingChildResult: ref("SYNTRAKE:VALIDATION_CHILD_RESULT:V1", "D"),
        evaluationRunInput: ref("SYNTRAKE:VALIDATION_RUN_INPUT:V1", "E"),
        evaluationChildResult: ref("SYNTRAKE:VALIDATION_CHILD_RESULT:V1", "F"),
      },
      {
        ordinal: "1",
        trainingRunInput: ref("SYNTRAKE:VALIDATION_RUN_INPUT:V1", "1"),
        trainingChildResult: ref("SYNTRAKE:VALIDATION_CHILD_RESULT:V1", "2"),
        evaluationRunInput: ref("SYNTRAKE:VALIDATION_RUN_INPUT:V1", "3"),
        evaluationChildResult: ref("SYNTRAKE:VALIDATION_CHILD_RESULT:V1", "4"),
      },
    ],
  };
}

describe("I5 RL-3C Validation aggregate scientific identity", () => {
  it("is deterministic and owner-payload exact", () => {
    const candidate = payload();
    const firstBytes = canonicalValidationResultBytesV1(candidate);
    const secondBytes = canonicalValidationResultBytesV1(structuredClone(candidate));
    expect(firstBytes.equals(secondBytes)).toBe(true);
    expect(hashValidationResultV1(candidate)).toBe(hashValidationResultV1(structuredClone(candidate)));
    expect(JSON.parse(firstBytes.toString("utf8"))).toEqual(candidate);
  });

  it("changes identity when a child scientific identity changes", () => {
    const first = payload();
    const second = structuredClone(first);
    second.folds[1] = {
      ...second.folds[1],
      evaluationChildResult: ref("SYNTRAKE:VALIDATION_CHILD_RESULT:V1", "9"),
    };
    expect(hashValidationResultV1(first)).not.toBe(hashValidationResultV1(second));
  });

  it("fails closed on unordered/duplicate folds and wrong domains", () => {
    const unordered = structuredClone(payload());
    unordered.folds = [unordered.folds[1]!, unordered.folds[0]!];
    expect(() => hashValidationResultV1(unordered)).toThrow("VALIDATION_RESULT_FOLD_ORDER_INVALID");

    const wrong = structuredClone(payload());
    wrong.folds[0] = {
      ...wrong.folds[0],
      trainingRunInput: ref("SYNTRAKE:RUN_INPUT:V1", "7"),
    };
    expect(() => hashValidationResultV1(wrong)).toThrow();
  });
});
