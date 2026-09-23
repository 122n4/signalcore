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

export type ExecutionResultFieldsV1 = Omit<ResultHashPayloadV1, "schemaVersion" | "runInput">;

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
  assertPlainObject(input, new Set([
    "schemaVersion",
    "runInput",
    "engineId",
    "engineVersion",
    "executionModelClass",
    "valuationCurrency",
    "testPeriod",
    "startingNav",
    "endingNav",
    "terminalCash",
    "executionTrace",
    "valuationSeries",
    "metricResultSet",
    "benchmark",
  ]));
  if (input.schemaVersion !== "RESULT_HASH_PAYLOAD_V1") throw new Error("RESULT_SCHEMA_INVALID");
  const runInput = hashRefV1(input.runInput);
  if (runInput.hashDomain !== "SYNTRAKE:RUN_INPUT:V1") throw new Error("RESULT_RUN_INPUT_DOMAIN_INVALID");
  const fields = canonicalExecutionResultFieldsV1(input);
  return {
    schemaVersion: "RESULT_HASH_PAYLOAD_V1",
    runInput,
    ...fields,
  };
}

export function canonicalExecutionResultFieldsV1(input: ExecutionResultFieldsV1): ExecutionResultFieldsV1 {
  if (input.engineId !== "HISTORICAL_EXECUTION_ADAPTER") throw new Error("RESULT_ENGINE_INVALID");
  if (input.engineVersion !== "ENGINE_V20260918") throw new Error("RESULT_ENGINE_INVALID");
  if (input.executionModelClass !== "SYNTHETIC_ADJUSTED_CLOSE_RESEARCH_V1") throw new Error("RESULT_EXECUTION_MODEL_INVALID");
  if (input.valuationCurrency !== "USD") throw new Error("RESULT_VALUATION_CURRENCY_INVALID");
  assertPlainObject(input.testPeriod, new Set(["startDate", "endDate"]));
  assertDate(input.testPeriod.startDate);
  assertDate(input.testPeriod.endDate);
  assertMoney(input.startingNav);
  assertMoney(input.endingNav);
  assertMoney(input.terminalCash);
  const executionTrace = canonicalArtifactDescriptor(input.executionTrace, "RESEARCH_EXECUTION_TRACE_V1");
  const valuationSeries = canonicalArtifactDescriptor(input.valuationSeries, "RESEARCH_VALUATION_SERIES_V1");
  const metricResultSet = canonicalArtifactDescriptor(input.metricResultSet, "METRIC_RESULT_SET_V1");
  const benchmark = input.benchmark === null ? null : canonicalArtifactDescriptor(input.benchmark, "RESEARCH_BENCHMARK_SERIES_V1");
  return {
    engineId: input.engineId,
    engineVersion: input.engineVersion,
    executionModelClass: input.executionModelClass,
    valuationCurrency: input.valuationCurrency,
    testPeriod: input.testPeriod,
    startingNav: input.startingNav,
    endingNav: input.endingNav,
    terminalCash: input.terminalCash,
    executionTrace,
    valuationSeries,
    metricResultSet,
    benchmark,
  };
}

export function canonicalResultBytesV1(input: ResultHashPayloadV1): Buffer {
  return i5ResearchInternalCanonicalJsonBytesV1(canonicalResultHashPayloadV1(input));
}

export function hashResultV1(input: ResultHashPayloadV1): CanonicalSha256HexV1 {
  return sha256HexV1(Buffer.concat([Buffer.from("SYNTRAKE:RESULT:V1\n", "utf8"), canonicalResultBytesV1(input)]));
}

function canonicalArtifactDescriptor(input: ResearchArtifactDescriptorV1, expectedSchema: string): ResearchArtifactDescriptorV1 {
  assertPlainObject(input, new Set(["artifactSchemaVersion", "format", "contentSha256", "contentByteLength", "recordCount"]));
  if (input.artifactSchemaVersion !== expectedSchema) throw new Error("RESULT_ARTIFACT_DESCRIPTOR_SCHEMA_INVALID");
  if (input.format !== "CANONICAL_JSONL_UTF8_LF_FINAL_NEWLINE_V1") throw new Error("RESULT_ARTIFACT_DESCRIPTOR_FORMAT_INVALID");
  if (!/^[0-9A-F]{64}$/u.test(input.contentSha256)) throw new Error("RESULT_ARTIFACT_DESCRIPTOR_SHA_INVALID");
  assertDecimalInteger(input.contentByteLength);
  assertDecimalInteger(input.recordCount);
  return {
    artifactSchemaVersion: input.artifactSchemaVersion,
    format: input.format,
    contentSha256: input.contentSha256,
    contentByteLength: input.contentByteLength,
    recordCount: input.recordCount,
  };
}

function assertPlainObject(value: unknown, keys: ReadonlySet<string>): void {
  if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error("RESULT_PAYLOAD_INVALID");
  }
  const actual = Object.keys(value);
  for (const key of actual) {
    if (!keys.has(key)) throw new Error("RESULT_PAYLOAD_INVALID");
    if ((value as Record<string, unknown>)[key] === undefined) throw new Error("RESULT_PAYLOAD_INVALID");
  }
  for (const key of keys) if (!Object.hasOwn(value, key)) throw new Error("RESULT_PAYLOAD_INVALID");
}

function assertDate(value: string): void {
  if (typeof value !== "string" || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/u.test(value)) throw new Error("RESULT_DATE_INVALID");
}

function assertMoney(value: string): void {
  if (typeof value !== "string" || !/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]{1,16})?$/u.test(value) || /^-0(?:\.0+)?$/u.test(value)) {
    throw new Error("RESULT_MONEY_INVALID");
  }
}

function assertDecimalInteger(value: string): void {
  if (typeof value !== "string" || !/^(?:0|[1-9][0-9]*)$/u.test(value)) throw new Error("RESULT_DESCRIPTOR_INTEGER_INVALID");
}
