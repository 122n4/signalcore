import {
  canonicalIntegerV1,
  canonicalRunInputHashPayloadV1,
  hashRunInputV1,
  hashRefV1,
  i5ResearchInternalCanonicalJsonBytesV1,
  immutableBehaviorTokenV1,
  sha256HexV1,
  type CanonicalJsonValue,
  type CanonicalSha256HexV1,
  type EvidenceContentDescriptorV1,
  type HashRefV1,
  type RunInputHashPayloadV1,
} from "./canonical";
import { hashDatasetSeriesV1, hashDatasetSnapshotV1, type DatasetSeriesHashPayloadV1, type DatasetSnapshotHashPayloadV1 } from "./executionMaterials";
import { canonicalResultHashPayloadV1, hashResultV1, type ResearchArtifactDescriptorV1, type ResultHashPayloadV1 } from "./resultArtifacts";

export type ResearchExecutionEvidenceContentV1 = Readonly<{
  schemaVersion: "RESEARCH_EXECUTION_EVIDENCE_V1";
  result: HashRefV1;
  runInput: HashRefV1;
  researchSpec: HashRefV1;
  researchIr: HashRefV1;
  experiment: HashRefV1;
  datasetSnapshot: HashRefV1;
  datasetSeries: readonly HashRefV1[];
  metricRegistryVersion: string;
  metricRequestSet: HashRefV1;
  executionConfig: HashRefV1;
  engineId: "HISTORICAL_EXECUTION_ADAPTER";
  engineVersion: "ENGINE_V20260918";
  resultArtifacts: Readonly<{
    executionTrace: ResearchArtifactDescriptorV1;
    valuationSeries: ResearchArtifactDescriptorV1;
    metricResultSet: ResearchArtifactDescriptorV1;
    benchmark: ResearchArtifactDescriptorV1 | null;
  }>;
}>;

export type ResearchExecutionEvidenceObjectV1 = Readonly<{
  descriptor: EvidenceContentDescriptorV1;
  content: ResearchExecutionEvidenceContentV1;
  contentBytes: Buffer;
  contentSha256: CanonicalSha256HexV1;
  evidenceHash: HashRefV1;
}>;

export type ConstructResearchExecutionEvidenceObjectInputV1 = Readonly<{
  expectedRunInput: HashRefV1;
  expectedResult: HashRefV1;
  runInputPayload: RunInputHashPayloadV1;
  resultPayload: ResultHashPayloadV1;
  datasetSnapshotPayload: DatasetSnapshotHashPayloadV1;
  datasetSeriesPayloads: readonly DatasetSeriesHashPayloadV1[];
}>;

export function constructResearchExecutionEvidenceObjectV1(
  input: ConstructResearchExecutionEvidenceObjectInputV1,
): ResearchExecutionEvidenceObjectV1 {
  const expectedRunInput = hashRefV1(input.expectedRunInput);
  const expectedResult = hashRefV1(input.expectedResult);
  assertDomain(expectedRunInput, "SYNTRAKE:RUN_INPUT:V1");
  assertDomain(expectedResult, "SYNTRAKE:RESULT:V1");

  const runInput = canonicalRunInputForEvidence(input.runInputPayload);
  if (runInput.hashHex !== expectedRunInput.hashHex) throw new Error("EVIDENCE_RUN_INPUT_HASH_MISMATCH");

  const resultPayload = canonicalResultHashPayloadV1(input.resultPayload) as ResultHashPayloadV1;
  const resultHashHex = hashResultV1(input.resultPayload);
  if (resultHashHex !== expectedResult.hashHex) throw new Error("EVIDENCE_RESULT_HASH_MISMATCH");
  if (resultPayload.runInput.hashHex !== expectedRunInput.hashHex) throw new Error("EVIDENCE_RESULT_RUN_INPUT_MISMATCH");
  if (runInput.engineId !== resultPayload.engineId || runInput.engineVersion !== resultPayload.engineVersion) {
    throw new Error("EVIDENCE_ENGINE_MISMATCH");
  }

  const datasetSnapshotHashHex = hashDatasetSnapshotV1(input.datasetSnapshotPayload);
  if (datasetSnapshotHashHex !== runInput.datasetSnapshot.hashHex) throw new Error("EVIDENCE_DATASET_SNAPSHOT_HASH_MISMATCH");
  const datasetSeries = canonicalDatasetSeriesRefsForEvidence(input.datasetSnapshotPayload, input.datasetSeriesPayloads);

  const content: ResearchExecutionEvidenceContentV1 = {
    schemaVersion: "RESEARCH_EXECUTION_EVIDENCE_V1",
    result: expectedResult,
    runInput: expectedRunInput,
    researchSpec: runInput.researchSpec,
    researchIr: runInput.researchIr,
    experiment: runInput.experiment,
    datasetSnapshot: runInput.datasetSnapshot,
    datasetSeries,
    metricRegistryVersion: runInput.metricRegistryVersion,
    metricRequestSet: runInput.metricRequestSet,
    executionConfig: runInput.executionConfig,
    engineId: resultPayload.engineId,
    engineVersion: resultPayload.engineVersion,
    resultArtifacts: {
      executionTrace: resultPayload.executionTrace,
      valuationSeries: resultPayload.valuationSeries,
      metricResultSet: resultPayload.metricResultSet,
      benchmark: resultPayload.benchmark,
    },
  };
  const contentBytes = i5ResearchInternalCanonicalJsonBytesV1(content as unknown as CanonicalJsonValue);
  const descriptor = canonicalResearchExecutionEvidenceDescriptorV1(contentBytes.byteLength);
  return {
    descriptor,
    content,
    contentBytes,
    contentSha256: sha256HexV1(contentBytes),
    evidenceHash: hashRefV1({
      hashAlgorithm: "SHA-256",
      hashDomain: "SYNTRAKE:EVIDENCE_OBJECT:V1",
      hashVersion: "SYNTRAKE_SHA256_V1",
      hashHex: hashResearchExecutionEvidenceObjectV1(descriptor, contentBytes),
    }),
  };
}

export function hashResearchExecutionEvidenceObjectV1(
  descriptor: EvidenceContentDescriptorV1,
  contentBytes: Uint8Array,
): CanonicalSha256HexV1 {
  return sha256HexV1(researchExecutionEvidenceObjectPreimageV1(descriptor, contentBytes));
}

export function researchExecutionEvidenceObjectPreimageV1(
  descriptor: EvidenceContentDescriptorV1,
  contentBytes: Uint8Array,
): Buffer {
  return Buffer.concat([
    Buffer.from("SYNTRAKE:EVIDENCE_OBJECT:V1\n", "utf8"),
    i5ResearchInternalCanonicalJsonBytesV1(canonicalEvidenceDescriptorPayloadV1(descriptor, contentBytes.byteLength)),
    Buffer.from("\n", "utf8"),
    Buffer.from(contentBytes),
  ]);
}

function canonicalResearchExecutionEvidenceDescriptorV1(contentByteLength: number): EvidenceContentDescriptorV1 {
  return {
    schemaVersion: "EVIDENCE_CONTENT_DESCRIPTOR_V1",
    kind: "RESEARCH_EXECUTION_EVIDENCE",
    artifactSchemaVersion: "RESEARCH_EXECUTION_EVIDENCE_V1",
    format: "CANONICAL_JSON_UTF8_V1",
    contentByteLength: String(contentByteLength),
  };
}

function canonicalEvidenceDescriptorPayloadV1(
  descriptor: EvidenceContentDescriptorV1,
  actualContentByteLength: number,
): CanonicalJsonValue {
  assertClosedPlainObject(descriptor, new Set(["schemaVersion", "kind", "artifactSchemaVersion", "format", "contentByteLength"]));
  if (descriptor.schemaVersion !== "EVIDENCE_CONTENT_DESCRIPTOR_V1") throw new Error("invalid Evidence descriptor schemaVersion");
  if (descriptor.kind !== "RESEARCH_EXECUTION_EVIDENCE") throw new Error("invalid Evidence descriptor kind");
  if (descriptor.format !== "CANONICAL_JSON_UTF8_V1") throw new Error("invalid Evidence descriptor format");
  const contentByteLength = canonicalIntegerV1(descriptor.contentByteLength, { min: "0", allowNegative: false });
  if (contentByteLength !== String(actualContentByteLength)) throw new Error("Evidence contentByteLength mismatch");
  return {
    schemaVersion: descriptor.schemaVersion,
    kind: descriptor.kind,
    artifactSchemaVersion: immutableBehaviorTokenV1(descriptor.artifactSchemaVersion),
    format: descriptor.format,
    contentByteLength,
  };
}

function canonicalRunInputForEvidence(input: RunInputHashPayloadV1) {
  return { ...(canonicalRunInputHashPayloadV1(input) as RunInputHashPayloadV1), hashHex: hashRunInputV1(input) };
}

function canonicalDatasetSeriesRefsForEvidence(
  datasetSnapshot: DatasetSnapshotHashPayloadV1,
  datasetSeriesPayloads: readonly DatasetSeriesHashPayloadV1[],
) {
  const expected = new Set(datasetSnapshot.series.map((ref) => hashRefV1(ref).hashHex));
  const seen = new Set<string>();
  const refs = datasetSeriesPayloads.map((series) => {
    const hashHex = hashDatasetSeriesV1(series);
    if (!expected.has(hashHex)) throw new Error("EVIDENCE_DATASET_SERIES_NOT_IN_SNAPSHOT");
    if (seen.has(hashHex)) throw new Error("EVIDENCE_DUPLICATE_DATASET_SERIES");
    seen.add(hashHex);
    return hashRefV1({ hashAlgorithm: "SHA-256", hashDomain: "SYNTRAKE:DATASET_SERIES:V1", hashVersion: "SYNTRAKE_SHA256_V1", hashHex });
  }).sort((left, right) => Buffer.compare(Buffer.from(left.hashHex, "utf8"), Buffer.from(right.hashHex, "utf8")));
  if (refs.length !== expected.size) throw new Error("EVIDENCE_DATASET_SERIES_SNAPSHOT_MISMATCH");
  return refs;
}

function assertDomain(ref: HashRefV1, domain: HashRefV1["hashDomain"]) {
  if (ref.hashDomain !== domain) throw new Error("EVIDENCE_HASHREF_DOMAIN_INVALID");
}

function assertClosedPlainObject(value: unknown, allowedKeys: ReadonlySet<string>) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("expected closed plain object");
  for (const key of Object.keys(value as Record<string, unknown>)) {
    if (!allowedKeys.has(key)) throw new Error(`undeclared field ${key}`);
    if ((value as Record<string, unknown>)[key] === undefined) throw new Error(`undefined is not canonical data at ${key}`);
  }
}
