import {
  assertHashRefDomainV1,
  canonicalEvidenceContentDescriptorV1,
  canonicalRunInputHashPayloadV1,
  hashEvidenceObjectV1,
  hashRefV1,
  i5ResearchInternalCanonicalJsonBytesV1,
  sha256HexV1,
  type CanonicalJsonValue,
  type EvidenceContentDescriptorV1,
  type HashRefV1,
  type RunInputHashPayloadV1,
} from "./canonical";
import { hashRunInputV1 } from "./canonical";
import {
  canonicalResultHashPayloadV1,
  hashResultV1,
  type ResearchArtifactDescriptorV1,
  type ResultHashPayloadV1,
} from "./resultArtifacts";

export type ResearchExecutionEvidenceContentV1 = Readonly<{
  schemaVersion: "RESEARCH_EXECUTION_EVIDENCE_CONTENT_V1";
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
  artifacts: Readonly<{
    executionTrace: ResearchArtifactDescriptorV1;
    valuationSeries: ResearchArtifactDescriptorV1;
    metricResultSet: ResearchArtifactDescriptorV1;
    benchmark: ResearchArtifactDescriptorV1 | null;
  }>;
}>;

export type ResearchExecutionEvidenceV1 = Readonly<{
  descriptor: EvidenceContentDescriptorV1;
  content: ResearchExecutionEvidenceContentV1;
  contentBytes: Buffer;
  contentSha256: string;
  hashHex: string;
}>;

export function buildResearchExecutionEvidenceV1(input: {
  runInput: RunInputHashPayloadV1;
  runInputHashHex: string;
  resultPayload: ResultHashPayloadV1;
  resultHashHex: string;
  datasetSeries: readonly HashRefV1[];
}): ResearchExecutionEvidenceV1 {
  canonicalRunInputHashPayloadV1(input.runInput);
  const actualRunInputHash = hashRunInputV1(input.runInput);
  if (actualRunInputHash !== input.runInputHashHex) throw new Error("EVIDENCE_RUN_INPUT_HASH_MISMATCH");

  canonicalResultHashPayloadV1(input.resultPayload);
  const actualResultHash = hashResultV1(input.resultPayload);
  if (actualResultHash !== input.resultHashHex) throw new Error("EVIDENCE_RESULT_HASH_MISMATCH");

  const resultRunInput = hashRefV1(input.resultPayload.runInput);
  assertHashRefDomainV1(resultRunInput, "SYNTRAKE:RUN_INPUT:V1");
  if (resultRunInput.hashHex !== actualRunInputHash) throw new Error("EVIDENCE_RESULT_RUN_INPUT_MISMATCH");
  if (input.resultPayload.engineId !== input.runInput.engineId || input.resultPayload.engineVersion !== input.runInput.engineVersion) {
    throw new Error("EVIDENCE_ENGINE_BINDING_MISMATCH");
  }

  const content = canonicalResearchExecutionEvidenceContentV1({
    schemaVersion: "RESEARCH_EXECUTION_EVIDENCE_CONTENT_V1",
    result: hashRefV1({
      hashAlgorithm: "SHA-256",
      hashDomain: "SYNTRAKE:RESULT:V1",
      hashVersion: "SYNTRAKE_SHA256_V1",
      hashHex: actualResultHash,
    }),
    runInput: hashRefV1({
      hashAlgorithm: "SHA-256",
      hashDomain: "SYNTRAKE:RUN_INPUT:V1",
      hashVersion: "SYNTRAKE_SHA256_V1",
      hashHex: actualRunInputHash,
    }),
    researchSpec: input.runInput.researchSpec,
    researchIr: input.runInput.researchIr,
    experiment: input.runInput.experiment,
    datasetSnapshot: input.runInput.datasetSnapshot,
    datasetSeries: input.datasetSeries,
    metricRegistryVersion: input.runInput.metricRegistryVersion,
    metricRequestSet: input.runInput.metricRequestSet,
    executionConfig: input.runInput.executionConfig,
    engineId: input.resultPayload.engineId,
    engineVersion: input.resultPayload.engineVersion,
    artifacts: {
      executionTrace: input.resultPayload.executionTrace,
      valuationSeries: input.resultPayload.valuationSeries,
      metricResultSet: input.resultPayload.metricResultSet,
      benchmark: input.resultPayload.benchmark,
    },
  }) as ResearchExecutionEvidenceContentV1;

  const contentBytes = i5ResearchInternalCanonicalJsonBytesV1(content);
  const descriptor: EvidenceContentDescriptorV1 = {
    schemaVersion: "EVIDENCE_CONTENT_DESCRIPTOR_V1",
    kind: "RESEARCH_EXECUTION_EVIDENCE",
    artifactSchemaVersion: "RESEARCH_EXECUTION_EVIDENCE_V1",
    format: "CANONICAL_JSON_UTF8_V1",
    contentByteLength: String(contentBytes.length),
  };
  canonicalEvidenceContentDescriptorV1(descriptor, contentBytes.length);

  return {
    descriptor,
    content,
    contentBytes,
    contentSha256: sha256HexV1(contentBytes),
    hashHex: hashEvidenceObjectV1(descriptor, contentBytes),
  };
}

export function canonicalResearchExecutionEvidenceContentV1(
  input: ResearchExecutionEvidenceContentV1,
): CanonicalJsonValue {
  assertPlainObject(input, new Set([
    "schemaVersion",
    "result",
    "runInput",
    "researchSpec",
    "researchIr",
    "experiment",
    "datasetSnapshot",
    "datasetSeries",
    "metricRegistryVersion",
    "metricRequestSet",
    "executionConfig",
    "engineId",
    "engineVersion",
    "artifacts",
  ]));
  if (input.schemaVersion !== "RESEARCH_EXECUTION_EVIDENCE_CONTENT_V1") throw new Error("EVIDENCE_CONTENT_SCHEMA_INVALID");

  const result = canonicalRef(input.result, "SYNTRAKE:RESULT:V1");
  const runInput = canonicalRef(input.runInput, "SYNTRAKE:RUN_INPUT:V1");
  const researchSpec = canonicalRef(input.researchSpec, "SYNTRAKE:RESEARCH_SPEC:V1");
  const researchIr = canonicalRef(input.researchIr, "SYNTRAKE:RESEARCH_IR:V1");
  const experiment = canonicalRef(input.experiment, "SYNTRAKE:EXPERIMENT:V1");
  const datasetSnapshot = canonicalRef(input.datasetSnapshot, "SYNTRAKE:DATASET_SNAPSHOT:V1");
  const metricRequestSet = canonicalRef(input.metricRequestSet, "SYNTRAKE:METRIC_REQUEST_SET:V1");
  const executionConfig = canonicalRef(input.executionConfig, "SYNTRAKE:EXECUTION_CONFIG:V1");

  if (!Array.isArray(input.datasetSeries) || input.datasetSeries.length < 1) {
    throw new Error("EVIDENCE_DATASET_SERIES_REQUIRED");
  }
  const datasetSeries = input.datasetSeries
    .map((entry) => canonicalRef(entry, "SYNTRAKE:DATASET_SERIES:V1"))
    .sort((left, right) => Buffer.compare(Buffer.from(left.hashHex, "ascii"), Buffer.from(right.hashHex, "ascii")));
  const seen = new Set<string>();
  for (const ref of datasetSeries) {
    if (seen.has(ref.hashHex)) throw new Error("EVIDENCE_DATASET_SERIES_DUPLICATE");
    seen.add(ref.hashHex);
  }

  if (input.metricRegistryVersion !== "METRIC_REGISTRY_V20260918") throw new Error("EVIDENCE_METRIC_REGISTRY_INVALID");
  if (input.engineId !== "HISTORICAL_EXECUTION_ADAPTER" || input.engineVersion !== "ENGINE_V20260918") {
    throw new Error("EVIDENCE_ENGINE_INVALID");
  }

  assertPlainObject(input.artifacts, new Set(["executionTrace", "valuationSeries", "metricResultSet", "benchmark"]));
  const artifacts = {
    executionTrace: canonicalArtifact(input.artifacts.executionTrace, "RESEARCH_EXECUTION_TRACE_V1"),
    valuationSeries: canonicalArtifact(input.artifacts.valuationSeries, "RESEARCH_VALUATION_SERIES_V1"),
    metricResultSet: canonicalArtifact(input.artifacts.metricResultSet, "METRIC_RESULT_SET_V1"),
    benchmark: input.artifacts.benchmark === null
      ? null
      : canonicalArtifact(input.artifacts.benchmark, "RESEARCH_BENCHMARK_SERIES_V1"),
  };

  return {
    schemaVersion: input.schemaVersion,
    result,
    runInput,
    researchSpec,
    researchIr,
    experiment,
    datasetSnapshot,
    datasetSeries,
    metricRegistryVersion: input.metricRegistryVersion,
    metricRequestSet,
    executionConfig,
    engineId: input.engineId,
    engineVersion: input.engineVersion,
    artifacts,
  };
}

function canonicalRef(ref: HashRefV1, domain: HashRefV1["hashDomain"]) {
  const canonical = hashRefV1(ref);
  assertHashRefDomainV1(canonical, domain);
  return canonical;
}

function canonicalArtifact(input: ResearchArtifactDescriptorV1, expectedSchema: string): ResearchArtifactDescriptorV1 {
  assertPlainObject(input, new Set(["artifactSchemaVersion", "format", "contentSha256", "contentByteLength", "recordCount"]));
  if (input.artifactSchemaVersion !== expectedSchema) throw new Error("EVIDENCE_ARTIFACT_SCHEMA_INVALID");
  if (input.format !== "CANONICAL_JSONL_UTF8_LF_FINAL_NEWLINE_V1") throw new Error("EVIDENCE_ARTIFACT_FORMAT_INVALID");
  if (!/^[0-9A-F]{64}$/u.test(input.contentSha256)) throw new Error("EVIDENCE_ARTIFACT_SHA_INVALID");
  if (!/^(?:0|[1-9][0-9]*)$/u.test(input.contentByteLength)) throw new Error("EVIDENCE_ARTIFACT_LENGTH_INVALID");
  if (!/^(?:0|[1-9][0-9]*)$/u.test(input.recordCount)) throw new Error("EVIDENCE_ARTIFACT_COUNT_INVALID");
  return { ...input };
}

function assertPlainObject(value: unknown, keys: ReadonlySet<string>): void {
  if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error("EVIDENCE_PAYLOAD_INVALID");
  }
  const actual = Object.keys(value);
  for (const key of actual) {
    if (!keys.has(key) || (value as Record<string, unknown>)[key] === undefined) throw new Error("EVIDENCE_PAYLOAD_INVALID");
  }
  for (const key of keys) if (!Object.hasOwn(value, key)) throw new Error("EVIDENCE_PAYLOAD_INVALID");
}
