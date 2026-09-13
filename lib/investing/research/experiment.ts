import {
  canonicalUuidV1,
  hashRefV1,
  type HashRefV1,
} from "./canonical";
import {
  hashResearchIrV1,
  type ResearchIrV1,
} from "./researchIr";

export type ResearchIrProofV1 = Readonly<{
  ref: HashRefV1;
  payload: ResearchIrV1;
}>;

export type ExperimentBaselineCandidateV1 = Readonly<{
  schemaVersion: "EXPERIMENT_BASELINE_CANDIDATE_V1";
  relation: "BASELINE";
  researchSpecRevisionId: string;
  researchIr: ResearchIrProofV1;
}>;

export type AdmittedExperimentBaselineV1 = Readonly<{
  schemaVersion: "EXPERIMENT_BASELINE_CANDIDATE_V1";
  relation: "BASELINE";
  researchSpecRevisionId: string;
  researchIr: HashRefV1;
}>;

export function admitExperimentBaselineV1(
  input: ExperimentBaselineCandidateV1,
): AdmittedExperimentBaselineV1 {
  assertClosedPlainObject(
    input,
    new Set([
      "schemaVersion",
      "relation",
      "researchSpecRevisionId",
      "researchIr",
    ]),
    "ExperimentBaselineCandidateV1",
  );

  if (input.schemaVersion !== "EXPERIMENT_BASELINE_CANDIDATE_V1") {
    throw new Error("invalid Experiment baseline schemaVersion");
  }
  if (input.relation !== "BASELINE") {
    throw new Error("only BASELINE Experiment admission is supported");
  }

  const researchSpecRevisionId = canonicalUuidV1(input.researchSpecRevisionId);
  const researchIr = canonicalResearchIrProofV1(input.researchIr);

  return Object.freeze({
    schemaVersion: "EXPERIMENT_BASELINE_CANDIDATE_V1",
    relation: "BASELINE",
    researchSpecRevisionId,
    researchIr,
  });
}

function canonicalResearchIrProofV1(input: ResearchIrProofV1): HashRefV1 {
  assertClosedPlainObject(
    input,
    new Set(["ref", "payload"]),
    "ResearchIrProofV1",
  );

  const ref = hashRefV1(input.ref);
  if (ref.hashDomain !== "SYNTRAKE:RESEARCH_IR:V1") {
    throw new Error("wrong-domain Experiment Research IR proof");
  }

  const computedHash = hashResearchIrV1(input.payload);
  if (computedHash !== ref.hashHex) {
    throw new Error("Experiment Research IR proof hash mismatch");
  }

  return Object.freeze(ref);
}

function assertClosedPlainObject(
  input: unknown,
  allowedKeys: ReadonlySet<string>,
  label: string,
): asserts input is Record<string, unknown> {
  if (
    typeof input !== "object" ||
    input === null ||
    Array.isArray(input) ||
    Object.getPrototypeOf(input) !== Object.prototype
  ) {
    throw new Error(`${label} must be a plain object`);
  }

  for (const key of Object.keys(input)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`undeclared ${label} field ${key}`);
    }
  }

  for (const key of allowedKeys) {
    if (!(key in input)) {
      throw new Error(`missing ${label} field ${key}`);
    }
  }
}
