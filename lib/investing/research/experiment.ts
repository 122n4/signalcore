import {
  assertHashRefDomainV1,
  canonicalUuidV1,
  hashDomainStateV1,
  hashRefV1,
  type CanonicalUuidV1,
  type HashRefV1,
} from "./canonical";

export type ExperimentBaselineCandidateV1 = Readonly<{
  schemaVersion: "EXPERIMENT_BASELINE_CANDIDATE_V1";
  relation: "BASELINE";
  researchSpecRevisionId: string;
  researchIr: HashRefV1;
}>;

export type AdmittedExperimentBaselineV1 = Readonly<{
  schemaVersion: "EXPERIMENT_BASELINE_CANDIDATE_V1";
  relation: "BASELINE";
  researchSpecRevisionId: CanonicalUuidV1;
  researchIr: HashRefV1;
}>;

export type ExperimentVariantCandidateV1 = Readonly<{
  schemaVersion: "EXPERIMENT_VARIANT_CANDIDATE_V1";
  relation: "VARIANT";
  parentExperimentId: string;
  researchSpecRevisionId: string;
  researchIr: HashRefV1;
}>;

export type AdmittedExperimentVariantV1 = Readonly<{
  schemaVersion: "EXPERIMENT_VARIANT_CANDIDATE_V1";
  relation: "VARIANT";
  parentExperimentId: CanonicalUuidV1;
  researchSpecRevisionId: CanonicalUuidV1;
  researchIr: HashRefV1;
}>;

const baselineCandidateKeys = new Set(["schemaVersion", "relation", "researchSpecRevisionId", "researchIr"]);
const variantCandidateKeys = new Set(["schemaVersion", "relation", "parentExperimentId", "researchSpecRevisionId", "researchIr"]);

export function admitExperimentBaselineV1(input: ExperimentBaselineCandidateV1): AdmittedExperimentBaselineV1 {
  assertClosedPlainObject(input, baselineCandidateKeys);
  if (input.schemaVersion !== "EXPERIMENT_BASELINE_CANDIDATE_V1") {
    throw new Error("invalid ExperimentBaselineCandidateV1 schemaVersion");
  }
  if (input.relation !== "BASELINE") throw new Error("unsupported ExperimentBaselineCandidateV1 relation");

  const researchSpecRevisionId = canonicalUuidV1(input.researchSpecRevisionId);
  const researchIr = hashRefV1(input.researchIr);
  assertHashRefDomainV1(researchIr, "SYNTRAKE:RESEARCH_IR:V1");

  return deepFreeze({
    schemaVersion: "EXPERIMENT_BASELINE_CANDIDATE_V1",
    relation: "BASELINE",
    researchSpecRevisionId,
    researchIr: deepFreeze({ ...researchIr }),
  });
}

export function admitExperimentVariantV1(input: ExperimentVariantCandidateV1): AdmittedExperimentVariantV1 {
  assertClosedPlainObject(input, variantCandidateKeys);
  if (input.schemaVersion !== "EXPERIMENT_VARIANT_CANDIDATE_V1") {
    throw new Error("invalid ExperimentVariantCandidateV1 schemaVersion");
  }
  if (input.relation !== "VARIANT") throw new Error("unsupported ExperimentVariantCandidateV1 relation");

  const parentExperimentId = canonicalUuidV1(input.parentExperimentId);
  const researchSpecRevisionId = canonicalUuidV1(input.researchSpecRevisionId);
  const researchIr = hashRefV1(input.researchIr);
  assertHashRefDomainV1(researchIr, "SYNTRAKE:RESEARCH_IR:V1");

  return deepFreeze({
    schemaVersion: "EXPERIMENT_VARIANT_CANDIDATE_V1",
    relation: "VARIANT",
    parentExperimentId,
    researchSpecRevisionId,
    researchIr: deepFreeze({ ...researchIr }),
  });
}

export function assertExperimentBaselineHashingDisabledV1() {
  if (hashDomainStateV1("SYNTRAKE:EXPERIMENT:V1") !== "DECLARED_BUT_HASHING_DISABLED") {
    throw new Error("Experiment scientific hashing disabled");
  }
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

function deepFreeze<T extends object>(value: T): Readonly<T> {
  for (const nested of Object.values(value)) {
    if (nested !== null && typeof nested === "object") Object.freeze(nested);
  }
  return Object.freeze(value);
}
