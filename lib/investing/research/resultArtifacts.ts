import {
  hashRefV1,
  i5ResearchInternalCanonicalJsonBytesV1,
  sha256HexV1,
  type CanonicalJsonValue,
  type CanonicalSha256HexV1,
  type HashRefV1,
} from "./canonical";

export type ResearchArtifactKindV1 = "EXECUTION_TRACE" | "VALUATION_SERIES" | "METRIC_RESULT_SET" | "BENCHMARK_SERIES";

export type ResearchArtifactDescriptorV1 = Readonly<{
  artifactSchemaVersion: string;
  format: "CANONICAL_JSONL_UTF8_LF_FINAL_NEWLINE_V1";
  contentSha256: string;
  contentByteLength: string;
  recordCount: string;
}>;

export type ResultHashPayloadV1 = Readonly<{
  schemaVersion: "RESULT_HASH_PAYLOAD_V1";
  runInput: HashRefV1;
  engineId: "HISTORICAL_EXECUTION_ADAPTER";
  engineVersion: "ENGINE_V20260918";
  executionModelClass: "SYNTHETIC_ADJUSTED_CLOSE_RESEARCH_V1";
  valuationCurrency: "USD";
  testPeriod: Readonly<{ startDate: string; endDate: string }>;
  startingNav: string;
  endingNav: string;
  terminalCash: string;
  executionTrace: ResearchArtifactDescriptorV1;
  valuationSeries: ResearchArtifactDescriptorV1;
  metricResultSet: ResearchArtifactDescriptorV1;
  benchmark: ResearchArtifactDescriptorV1 | null;
}>;

export function canonicalJsonlArtifactBytesV1(records: readonly CanonicalJsonValue[]): Buffer {
  return Buffer.from(records.map((record) => `${i5ResearchInternalCanonicalJsonBytesV1(record).toString("utf8")}\n`).join(""), "utf8");
}

export function artifactDescriptorV1(artifactSchemaVersion: string, bytes: Buffer, recordCount: number): ResearchArtifactDescriptorV1 {
  return {
    artifactSchemaVersion,
    format: "CANONICAL_JSONL_UTF8_LF_FINAL_NEWLINE_V1",
    contentSha256: sha256HexV1(bytes),
    contentByteLength: String(bytes.length),
    recordCount: String(recordCount),
  };
}

export function canonicalResultHashPayloadV1(input: ResultHashPayloadV1): CanonicalJsonValue {
  const runInput = hashRefV1(input.runInput);
  if (runInput.hashDomain !== "SYNTRAKE:RUN_INPUT:V1") throw new Error("RESULT_RUN_INPUT_DOMAIN_INVALID");
  return {
    schemaVersion: "RESULT_HASH_PAYLOAD_V1",
    runInput,
    engineId: input.engineId,
    engineVersion: input.engineVersion,
    executionModelClass: input.executionModelClass,
    valuationCurrency: input.valuationCurrency,
    testPeriod: input.testPeriod,
    startingNav: input.startingNav,
    endingNav: input.endingNav,
    terminalCash: input.terminalCash,
    executionTrace: input.executionTrace,
    valuationSeries: input.valuationSeries,
    metricResultSet: input.metricResultSet,
    benchmark: input.benchmark,
  };
}

export function canonicalResultBytesV1(input: ResultHashPayloadV1): Buffer {
  return i5ResearchInternalCanonicalJsonBytesV1(canonicalResultHashPayloadV1(input));
}

export function hashResultV1(input: ResultHashPayloadV1): CanonicalSha256HexV1 {
  return sha256HexV1(Buffer.concat([Buffer.from("SYNTRAKE:RESULT:V1\n", "utf8"), canonicalResultBytesV1(input)]));
}
