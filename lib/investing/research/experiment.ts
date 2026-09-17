import {
  assertHashRefDomainV1,
  canonicalUuidV1,
  hashDomainStateV1,
  hashRefV1,
  i5ResearchInternalCanonicalJsonBytesV1,
  sha256HexV1,
  type CanonicalJsonValue,
  type CanonicalSha256HexV1,
  type CanonicalUuidV1,
  type HashRefV1,
} from "./canonical";
import {
  canonicalExperimentParametersHashPayloadV1,
  hashExperimentParametersV1,
  type ExperimentParametersCandidateV1,
  type ExperimentParametersHashPayloadV1,
} from "./experimentParameters";
import { ownerStructuredHashPreimageV1 } from "./scientificPreimage";

export type ExperimentBaselineCandidateV1 = Readonly<{
  schemaVersion: "EXPERIMENT_BASELINE_CANDIDATE_V1";
  relation: "BASELINE";
  researchSpecRevisionId: string;
  researchIr: HashRefV1;
}>;

export type ExperimentVariantCandidateV1 = Readonly<{
  schemaVersion: "EXPERIMENT_VARIANT_CANDIDATE_V1";
  relation: "VARIANT";
  parentExperimentId: string;
  parentExperiment: HashRefV1;
  parentResearchIr: HashRefV1;
  researchSpecRevisionId: string;
  researchIr: HashRefV1;
  experimentParameters: ExperimentParametersCandidateV1;
}>;

export type ExperimentHashPayloadV1 =
  | Readonly<{
      schemaVersion: "EXPERIMENT_HASH_PAYLOAD_V1";
      relation: "BASELINE";
      researchIr: HashRefV1;
      experimentParameters: null;
    }>
  | Readonly<{
      schemaVersion: "EXPERIMENT_HASH_PAYLOAD_V1";
      relation: "VARIANT";
      parentExperiment: HashRefV1;
      researchIr: HashRefV1;
      experimentParameters: HashRefV1;
    }>;

export type AdmittedExperimentBaselineV1 = Readonly<{
  schemaVersion: "EXPERIMENT_BASELINE_CANDIDATE_V1";
  relation: "BASELINE";
  researchSpecRevisionId: CanonicalUuidV1;
  researchIr: HashRefV1;
  experiment: HashRefV1;
}>;

export type AdmittedExperimentVariantV1 = Readonly<{
  schemaVersion: "EXPERIMENT_VARIANT_CANDIDATE_V1";
  relation: "VARIANT";
  parentExperimentId: CanonicalUuidV1;
  parentExperiment: HashRefV1;
  parentResearchIr: HashRefV1;
  researchSpecRevisionId: CanonicalUuidV1;
  researchIr: HashRefV1;
  experimentParameters: HashRefV1;
  experimentParametersPayload: ExperimentParametersHashPayloadV1;
  experiment: HashRefV1;
}>;

export type ExperimentCandidateV1 = ExperimentBaselineCandidateV1 | ExperimentVariantCandidateV1;

const baselineCandidateKeys = new Set(["schemaVersion", "relation", "researchSpecRevisionId", "researchIr"]);
const variantCandidateKeys = new Set([
  "schemaVersion",
  "relation",
  "parentExperimentId",
  "parentExperiment",
  "parentResearchIr",
  "researchSpecRevisionId",
  "researchIr",
  "experimentParameters",
]);

export function admitExperimentBaselineV1(input: ExperimentBaselineCandidateV1): AdmittedExperimentBaselineV1 {
  if (!isPlainObject(input)) throw new Error("expected closed plain object");
  if (input.relation !== "BASELINE") throw new Error("unsupported ExperimentBaselineCandidateV1 relation");
  const payload = canonicalExperimentHashPayloadV1(input);
  const baseline = input as ExperimentBaselineCandidateV1;
  const researchSpecRevisionId = canonicalUuidV1(baseline.researchSpecRevisionId);
  const researchIr = payload.researchIr;
  return deepFreeze({
    schemaVersion: "EXPERIMENT_BASELINE_CANDIDATE_V1",
    relation: "BASELINE",
    researchSpecRevisionId,
    researchIr: deepFreeze({ ...researchIr }),
    experiment: deepFreeze({ ...experimentRef(hashExperimentV1(input)) }),
  });
}

export function admitExperimentVariantV1(input: ExperimentVariantCandidateV1): AdmittedExperimentVariantV1 {
  if (!isPlainObject(input)) throw new Error("expected closed plain object");
  if (input.relation !== "VARIANT") throw new Error("unsupported ExperimentVariantCandidateV1 relation");
  const payload = canonicalExperimentHashPayloadV1(input);
  if (payload.relation !== "VARIANT") throw new Error("unsupported ExperimentVariantCandidateV1 relation");
  const parentExperimentId = canonicalUuidV1(input.parentExperimentId);
  const parentResearchIr = canonicalResearchIrRef(input.parentResearchIr);
  const researchSpecRevisionId = canonicalUuidV1(input.researchSpecRevisionId);
  const experimentParametersPayload = canonicalExperimentParametersHashPayloadV1(input.experimentParameters);
  return deepFreeze({
    schemaVersion: "EXPERIMENT_VARIANT_CANDIDATE_V1",
    relation: "VARIANT",
    parentExperimentId,
    parentExperiment: deepFreeze({ ...payload.parentExperiment }),
    parentResearchIr: deepFreeze({ ...parentResearchIr }),
    researchSpecRevisionId,
    researchIr: deepFreeze({ ...payload.researchIr }),
    experimentParameters: deepFreeze({ ...payload.experimentParameters }),
    experimentParametersPayload: deepFreeze({
      ...experimentParametersPayload,
      baseResearchIr: deepFreeze({ ...experimentParametersPayload.baseResearchIr }),
      resolvedResearchIr: deepFreeze({ ...experimentParametersPayload.resolvedResearchIr }),
    }),
    experiment: deepFreeze({ ...experimentRef(hashExperimentV1(input)) }),
  });
}

export function canonicalExperimentHashPayloadV1(input: ExperimentCandidateV1): ExperimentHashPayloadV1 {
  if (!isPlainObject(input)) throw new Error("expected closed plain object");
  if ((input as { relation?: unknown }).relation === "BASELINE") {
    assertClosedPlainObject(input, baselineCandidateKeys);
    if (input.schemaVersion !== "EXPERIMENT_BASELINE_CANDIDATE_V1") {
      throw new Error("invalid ExperimentBaselineCandidateV1 schemaVersion");
    }
    return {
      schemaVersion: "EXPERIMENT_HASH_PAYLOAD_V1",
      relation: "BASELINE",
      researchIr: deepFreeze({ ...canonicalResearchIrRef(input.researchIr) }),
      experimentParameters: null,
    };
  }

  if ((input as { relation?: unknown }).relation !== "VARIANT") throw new Error("unsupported Experiment relation");
  assertClosedPlainObject(input, variantCandidateKeys);
  if (input.schemaVersion !== "EXPERIMENT_VARIANT_CANDIDATE_V1") {
    throw new Error("invalid ExperimentVariantCandidateV1 schemaVersion");
  }
  if (input.relation !== "VARIANT") throw new Error("unsupported Experiment relation");
  const parentExperiment = hashRefV1(input.parentExperiment);
  assertHashRefDomainV1(parentExperiment, "SYNTRAKE:EXPERIMENT:V1");
  const parentResearchIr = canonicalResearchIrRef(input.parentResearchIr);
  const researchIr = canonicalResearchIrRef(input.researchIr);
  const experimentParametersPayload = canonicalExperimentParametersHashPayloadV1(input.experimentParameters);
  if (!sameHashRef(experimentParametersPayload.baseResearchIr, parentResearchIr)) {
    throw new Error("ExperimentParameters base Research IR must match parent Research IR");
  }
  if (!sameHashRef(experimentParametersPayload.resolvedResearchIr, researchIr)) {
    throw new Error("ExperimentParameters resolved Research IR must match VARIANT Research IR");
  }

  return {
    schemaVersion: "EXPERIMENT_HASH_PAYLOAD_V1",
    relation: "VARIANT",
    parentExperiment: deepFreeze({ ...parentExperiment }),
    researchIr: deepFreeze({ ...researchIr }),
    experimentParameters: deepFreeze({ ...experimentParametersRef(hashExperimentParametersV1(input.experimentParameters)) }),
  };
}

export function canonicalExperimentBytesV1(input: ExperimentCandidateV1): Buffer {
  return i5ResearchInternalCanonicalJsonBytesV1(canonicalExperimentHashPayloadV1(input) as CanonicalJsonValue);
}

export function hashExperimentV1(input: ExperimentCandidateV1): CanonicalSha256HexV1 {
  return sha256HexV1(
    ownerStructuredHashPreimageV1("SYNTRAKE:EXPERIMENT:V1", canonicalExperimentHashPayloadV1(input) as CanonicalJsonValue),
  );
}

export function assertExperimentHashingEnabledV1() {
  if (hashDomainStateV1("SYNTRAKE:EXPERIMENT:V1") !== "OWNER_PAYLOAD_EXACT") {
    throw new Error("Experiment scientific hashing disabled");
  }
}

function canonicalResearchIrRef(input: HashRefV1) {
  const ref = hashRefV1(input);
  assertHashRefDomainV1(ref, "SYNTRAKE:RESEARCH_IR:V1");
  return ref;
}

function experimentRef(hashHex: string): HashRefV1 {
  return hashRefV1({
    hashAlgorithm: "SHA-256",
    hashDomain: "SYNTRAKE:EXPERIMENT:V1",
    hashVersion: "SYNTRAKE_SHA256_V1",
    hashHex,
  });
}

function experimentParametersRef(hashHex: string): HashRefV1 {
  return hashRefV1({
    hashAlgorithm: "SHA-256",
    hashDomain: "SYNTRAKE:EXPERIMENT_PARAMETERS:V1",
    hashVersion: "SYNTRAKE_SHA256_V1",
    hashHex,
  });
}

function sameHashRef(left: HashRefV1, right: HashRefV1) {
  return (
    left.hashAlgorithm === right.hashAlgorithm &&
    left.hashDomain === right.hashDomain &&
    left.hashVersion === right.hashVersion &&
    left.hashHex === right.hashHex
  );
}

function assertClosedPlainObject(value: unknown, allowedKeys: ReadonlySet<string>) {
  if (!isPlainObject(value)) throw new Error("expected closed plain object");
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!allowedKeys.has(key)) throw new Error(`undeclared field ${key}`);
    if (record[key] === undefined) throw new Error(`undefined is not canonical data at ${key}`);
  }
  for (const key of allowedKeys) {
    if (!Object.hasOwn(record, key)) throw new Error(`missing field ${key}`);
  }
}

function isPlainObject(value: unknown) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function deepFreeze<T extends object>(value: T): Readonly<T> {
  for (const nested of Object.values(value)) {
    if (nested !== null && typeof nested === "object") Object.freeze(nested);
  }
  return Object.freeze(value);
}
