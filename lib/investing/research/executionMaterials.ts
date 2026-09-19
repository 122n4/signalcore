import {
  assertHashRefDomainV1,
  canonicalDateV1,
  canonicalIntegerV1,
  canonicalOpaqueStringV1,
  canonicalTextV1,
  hashRefV1,
  i5ResearchInternalCanonicalJsonBytesV1,
  immutableBehaviorTokenV1,
  sha256HexV1,
  type CanonicalJsonValue,
  type CanonicalSha256HexV1,
  type HashRefV1,
} from "./canonical";
import { ownerStructuredHashPreimageV1 } from "./scientificPreimage";

export type DatasetSeriesHashPayloadV1 = Readonly<{
  schemaVersion: "DATASET_SERIES_HASH_PAYLOAD_V1";
  providerDatasetId: string;
  providerDatasetVersion: string;
  instrumentId: string;
  fieldId: string;
  fieldVersion: string;
  frequency: string;
  timezone: string;
  calendar: string;
  currency: string;
  coverageStart: string;
  coverageEnd: string;
  observationCount: string;
  contentSha256: string;
}>;

export type DatasetSnapshotHashPayloadV1 = Readonly<{
  schemaVersion: "DATASET_SNAPSHOT_HASH_PAYLOAD_V1";
  snapshotPolicy: "DATASET_SNAPSHOT_POLICY_V1";
  series: readonly HashRefV1[];
}>;

export type MetricRequestV1 = Readonly<{
  metricId: string;
  metricVersion: string;
}>;

export type MetricRequestSetHashPayloadV1 = Readonly<{
  schemaVersion: "METRIC_REQUEST_SET_HASH_PAYLOAD_V1";
  metricRegistryVersion: string;
  requests: readonly MetricRequestV1[];
}>;

export type ExecutionConfigHashPayloadV1 = Readonly<{
  schemaVersion: "EXECUTION_CONFIG_HASH_PAYLOAD_V1";
  engineCompatibilityVersion: string;
  missingDataPolicy: string;
  fxPolicy: string;
  costsPolicy: string;
  slippagePolicy: string;
  fillPolicy: string;
  corporateActionPolicy: string;
  calendarSessionPolicy: string;
  valuationPolicy: string;
}>;

const datasetSeriesKeys = new Set([
  "schemaVersion",
  "providerDatasetId",
  "providerDatasetVersion",
  "instrumentId",
  "fieldId",
  "fieldVersion",
  "frequency",
  "timezone",
  "calendar",
  "currency",
  "coverageStart",
  "coverageEnd",
  "observationCount",
  "contentSha256",
]);
const datasetSnapshotKeys = new Set(["schemaVersion", "snapshotPolicy", "series"]);
const metricRequestSetKeys = new Set(["schemaVersion", "metricRegistryVersion", "requests"]);
const metricRequestKeys = new Set(["metricId", "metricVersion"]);
const executionConfigKeys = new Set([
  "schemaVersion",
  "engineCompatibilityVersion",
  "missingDataPolicy",
  "fxPolicy",
  "costsPolicy",
  "slippagePolicy",
  "fillPolicy",
  "corporateActionPolicy",
  "calendarSessionPolicy",
  "valuationPolicy",
]);

export function canonicalDatasetSeriesHashPayloadV1(input: DatasetSeriesHashPayloadV1): CanonicalJsonValue {
  assertClosedPlainObject(input, datasetSeriesKeys);
  if (input.schemaVersion !== "DATASET_SERIES_HASH_PAYLOAD_V1") throw new Error("invalid DatasetSeries schemaVersion");
  const start = canonicalDateV1(input.coverageStart);
  const end = canonicalDateV1(input.coverageEnd);
  if (start > end) throw new Error("DatasetSeries coverageStart after coverageEnd");
  return {
    schemaVersion: input.schemaVersion,
    providerDatasetId: immutableBehaviorTokenV1(input.providerDatasetId),
    providerDatasetVersion: immutableBehaviorTokenV1(input.providerDatasetVersion),
    instrumentId: canonicalTextV1(input.instrumentId, { minBytes: 1, maxBytes: 256 }),
    fieldId: immutableBehaviorTokenV1(input.fieldId),
    fieldVersion: immutableBehaviorTokenV1(input.fieldVersion),
    frequency: immutableBehaviorTokenV1(input.frequency),
    timezone: canonicalTextV1(input.timezone, { minBytes: 1, maxBytes: 128 }),
    calendar: immutableBehaviorTokenV1(input.calendar),
    currency: immutableBehaviorTokenV1(input.currency),
    coverageStart: start,
    coverageEnd: end,
    observationCount: canonicalIntegerV1(input.observationCount, { min: "1", allowNegative: false }),
    contentSha256: canonicalUpperSha256(input.contentSha256, "DatasetSeries contentSha256"),
  };
}

export function canonicalDatasetSeriesBytesV1(input: DatasetSeriesHashPayloadV1): Buffer {
  return i5ResearchInternalCanonicalJsonBytesV1(canonicalDatasetSeriesHashPayloadV1(input));
}

export function hashDatasetSeriesV1(input: DatasetSeriesHashPayloadV1): CanonicalSha256HexV1 {
  return sha256HexV1(ownerStructuredHashPreimageV1("SYNTRAKE:DATASET_SERIES:V1", canonicalDatasetSeriesHashPayloadV1(input)));
}

export function canonicalDatasetSnapshotHashPayloadV1(input: DatasetSnapshotHashPayloadV1): CanonicalJsonValue {
  assertClosedPlainObject(input, datasetSnapshotKeys);
  if (input.schemaVersion !== "DATASET_SNAPSHOT_HASH_PAYLOAD_V1") throw new Error("invalid DatasetSnapshot schemaVersion");
  if (input.snapshotPolicy !== "DATASET_SNAPSHOT_POLICY_V1") throw new Error("unsupported DatasetSnapshot policy");
  if (!Array.isArray(input.series) || input.series.length < 1) throw new Error("DatasetSnapshot series required");
  const refs = input.series.map((entry) => {
    const ref = hashRefV1(entry);
    assertHashRefDomainV1(ref, "SYNTRAKE:DATASET_SERIES:V1");
    return ref;
  });
  const sorted = [...refs].sort(compareHashRefs);
  rejectDuplicateHashRefs(sorted, "DatasetSnapshot series");
  return { schemaVersion: input.schemaVersion, snapshotPolicy: input.snapshotPolicy, series: sorted };
}

export function canonicalDatasetSnapshotBytesV1(input: DatasetSnapshotHashPayloadV1): Buffer {
  return i5ResearchInternalCanonicalJsonBytesV1(canonicalDatasetSnapshotHashPayloadV1(input));
}

export function hashDatasetSnapshotV1(input: DatasetSnapshotHashPayloadV1): CanonicalSha256HexV1 {
  return sha256HexV1(ownerStructuredHashPreimageV1("SYNTRAKE:DATASET_SNAPSHOT:V1", canonicalDatasetSnapshotHashPayloadV1(input)));
}

export function canonicalMetricRequestSetHashPayloadV1(input: MetricRequestSetHashPayloadV1): CanonicalJsonValue {
  assertClosedPlainObject(input, metricRequestSetKeys);
  if (input.schemaVersion !== "METRIC_REQUEST_SET_HASH_PAYLOAD_V1") throw new Error("invalid MetricRequestSet schemaVersion");
  if (!Array.isArray(input.requests) || input.requests.length < 1) throw new Error("MetricRequestSet requests required");
  const requests = input.requests.map((request) => {
    assertClosedPlainObject(request, metricRequestKeys);
    return {
      metricId: immutableBehaviorTokenV1(request.metricId),
      metricVersion: immutableBehaviorTokenV1(request.metricVersion),
    };
  }).sort((left, right) => compareStrings(`${left.metricId}\n${left.metricVersion}`, `${right.metricId}\n${right.metricVersion}`));
  rejectDuplicateCanonicalElements(requests, "MetricRequestSet request");
  return {
    schemaVersion: input.schemaVersion,
    metricRegistryVersion: immutableBehaviorTokenV1(input.metricRegistryVersion),
    requests,
  };
}

export function canonicalMetricRequestSetBytesV1(input: MetricRequestSetHashPayloadV1): Buffer {
  return i5ResearchInternalCanonicalJsonBytesV1(canonicalMetricRequestSetHashPayloadV1(input));
}

export function hashMetricRequestSetV1(input: MetricRequestSetHashPayloadV1): CanonicalSha256HexV1 {
  return sha256HexV1(ownerStructuredHashPreimageV1("SYNTRAKE:METRIC_REQUEST_SET:V1", canonicalMetricRequestSetHashPayloadV1(input)));
}

export function canonicalExecutionConfigHashPayloadV1(input: ExecutionConfigHashPayloadV1): CanonicalJsonValue {
  assertClosedPlainObject(input, executionConfigKeys);
  if (input.schemaVersion !== "EXECUTION_CONFIG_HASH_PAYLOAD_V1") throw new Error("invalid ExecutionConfig schemaVersion");
  return {
    schemaVersion: input.schemaVersion,
    engineCompatibilityVersion: immutableBehaviorTokenV1(input.engineCompatibilityVersion),
    missingDataPolicy: immutableBehaviorTokenV1(input.missingDataPolicy),
    fxPolicy: immutableBehaviorTokenV1(input.fxPolicy),
    costsPolicy: immutableBehaviorTokenV1(input.costsPolicy),
    slippagePolicy: immutableBehaviorTokenV1(input.slippagePolicy),
    fillPolicy: immutableBehaviorTokenV1(input.fillPolicy),
    corporateActionPolicy: immutableBehaviorTokenV1(input.corporateActionPolicy),
    calendarSessionPolicy: immutableBehaviorTokenV1(input.calendarSessionPolicy),
    valuationPolicy: immutableBehaviorTokenV1(input.valuationPolicy),
  };
}

export function canonicalExecutionConfigBytesV1(input: ExecutionConfigHashPayloadV1): Buffer {
  return i5ResearchInternalCanonicalJsonBytesV1(canonicalExecutionConfigHashPayloadV1(input));
}

export function hashExecutionConfigV1(input: ExecutionConfigHashPayloadV1): CanonicalSha256HexV1 {
  return sha256HexV1(ownerStructuredHashPreimageV1("SYNTRAKE:EXECUTION_CONFIG:V1", canonicalExecutionConfigHashPayloadV1(input)));
}

function canonicalUpperSha256(value: string, name: string) {
  const normalized = canonicalOpaqueStringV1(value, { minBytes: 64, maxBytes: 64 });
  if (!/^[0-9A-F]{64}$/u.test(normalized)) throw new Error(`invalid ${name}`);
  return normalized;
}

function rejectDuplicateHashRefs(refs: readonly HashRefV1[], name: string) {
  const seen = new Set<string>();
  for (const ref of refs) {
    const key = `${ref.hashAlgorithm}\n${ref.hashDomain}\n${ref.hashVersion}\n${ref.hashHex}`;
    if (seen.has(key)) throw new Error(`duplicate ${name}`);
    seen.add(key);
  }
}

function rejectDuplicateCanonicalElements(values: readonly CanonicalJsonValue[], name: string) {
  const seen = new Set<string>();
  for (const value of values) {
    const key = i5ResearchInternalCanonicalJsonBytesV1(value).toString("utf8");
    if (seen.has(key)) throw new Error(`duplicate ${name}`);
    seen.add(key);
  }
}

function compareHashRefs(left: HashRefV1, right: HashRefV1) {
  return compareStrings(left.hashHex, right.hashHex);
}

function compareStrings(left: string, right: string) {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
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
