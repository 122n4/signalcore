import { createHash } from "node:crypto";

export type CanonicalTextV1 = string & { readonly __canonicalTextV1: unique symbol };
export type CanonicalOpaqueStringV1 = string & { readonly __canonicalOpaqueStringV1: unique symbol };
export type CanonicalTokenV1 = string & { readonly __canonicalTokenV1: unique symbol };
export type CanonicalUuidV1 = string & { readonly __canonicalUuidV1: unique symbol };
export type CanonicalDecimalV1 = string & { readonly __canonicalDecimalV1: unique symbol };
export type CanonicalIntegerV1 = string & { readonly __canonicalIntegerV1: unique symbol };
export type CanonicalDateV1 = string & { readonly __canonicalDateV1: unique symbol };
export type CanonicalTimestampUtcMicrosV1 = string & { readonly __canonicalTimestampUtcMicrosV1: unique symbol };
export type CanonicalSha256HexV1 = string & { readonly __canonicalSha256HexV1: unique symbol };

export type HashDomainV1 =
  | "SYNTRAKE:RESEARCH_DRAFT:V1"
  | "SYNTRAKE:HYPOTHESIS:V1"
  | "SYNTRAKE:RESEARCH_SPEC:V1"
  | "SYNTRAKE:RESEARCH_IR:V1"
  | "SYNTRAKE:EXPERIMENT:V1"
  | "SYNTRAKE:EXPERIMENT_PARAMETERS:V1"
  | "SYNTRAKE:DATASET_SERIES:V1"
  | "SYNTRAKE:DATASET_SNAPSHOT:V1"
  | "SYNTRAKE:ACCOUNT_RESEARCH_CONTEXT:V1"
  | "SYNTRAKE:RUN_INPUT:V1"
  | "SYNTRAKE:RESULT:V1"
  | "SYNTRAKE:EVIDENCE_OBJECT:V1"
  | "SYNTRAKE:RESEARCH_TEMPLATE:V1"
  | "SYNTRAKE:METRIC_REQUEST_SET:V1"
  | "SYNTRAKE:EXECUTION_CONFIG:V1"
  | "SYNTRAKE:CANONICAL_TEST:V1";

export type HashRefV1 = Readonly<{
  hashAlgorithm: "SHA-256";
  hashDomain: HashDomainV1;
  hashVersion: "SYNTRAKE_SHA256_V1";
  hashHex: CanonicalSha256HexV1;
}>;

type DomainAdmissionState =
  | "DECLARED_BUT_HASHING_DISABLED"
  | "OWNER_PAYLOAD_EXACT"
  | "PREIMAGE_ENVELOPE_EXACT"
  | "CONTENT_PREIMAGE_EXACT"
  | "TEST_ONLY";

const hashDomainAdmission = {
  "SYNTRAKE:RESEARCH_DRAFT:V1": "OWNER_PAYLOAD_EXACT",
  "SYNTRAKE:HYPOTHESIS:V1": "OWNER_PAYLOAD_EXACT",
  "SYNTRAKE:RESEARCH_SPEC:V1": "DECLARED_BUT_HASHING_DISABLED",
  "SYNTRAKE:RESEARCH_IR:V1": "DECLARED_BUT_HASHING_DISABLED",
  "SYNTRAKE:EXPERIMENT:V1": "DECLARED_BUT_HASHING_DISABLED",
  "SYNTRAKE:EXPERIMENT_PARAMETERS:V1": "DECLARED_BUT_HASHING_DISABLED",
  "SYNTRAKE:DATASET_SERIES:V1": "DECLARED_BUT_HASHING_DISABLED",
  "SYNTRAKE:DATASET_SNAPSHOT:V1": "DECLARED_BUT_HASHING_DISABLED",
  "SYNTRAKE:ACCOUNT_RESEARCH_CONTEXT:V1": "DECLARED_BUT_HASHING_DISABLED",
  "SYNTRAKE:RUN_INPUT:V1": "PREIMAGE_ENVELOPE_EXACT",
  "SYNTRAKE:RESULT:V1": "DECLARED_BUT_HASHING_DISABLED",
  "SYNTRAKE:EVIDENCE_OBJECT:V1": "CONTENT_PREIMAGE_EXACT",
  "SYNTRAKE:RESEARCH_TEMPLATE:V1": "DECLARED_BUT_HASHING_DISABLED",
  "SYNTRAKE:METRIC_REQUEST_SET:V1": "DECLARED_BUT_HASHING_DISABLED",
  "SYNTRAKE:EXECUTION_CONFIG:V1": "DECLARED_BUT_HASHING_DISABLED",
  "SYNTRAKE:CANONICAL_TEST:V1": "TEST_ONLY",
} as const satisfies Record<HashDomainV1, DomainAdmissionState>;

const mutableBehaviorAliases = new Set([
  "latest",
  "current",
  "stable",
  "production",
  "default",
  "active",
  "rolling",
]);

const runTypesV1 = new Set(["HISTORICAL_BACKTEST", "SIMULATION", "SENSITIVITY", "REPRODUCIBILITY_CHECK"]);
const researchEnvironmentsV1 = new Set(["HISTORICAL_BACKTEST", "SIMULATION"]);
const researchSourceContextsV1 = new Set(["PURE_RESEARCH", "TEST_PORTFOLIO", "USER_PORTFOLIO"]);

export type CanonicalJsonValue =
  | null
  | boolean
  | string
  | readonly CanonicalJsonValue[]
  | { readonly [key: string]: CanonicalJsonValue };

export type RunTypeV1 =
  | "HISTORICAL_BACKTEST"
  | "SIMULATION"
  | "SENSITIVITY"
  | "REPRODUCIBILITY_CHECK";

export type ResearchEnvironmentV1 = "HISTORICAL_BACKTEST" | "SIMULATION";
export type ResearchSourceContextV1 = "PURE_RESEARCH" | "TEST_PORTFOLIO" | "USER_PORTFOLIO";

export type MaterialPolicyRefV1 = Readonly<{
  policyId: string;
  policyVersion: string;
}>;

export type RunInputHashPayloadV1 = Readonly<{
  schemaVersion: "RUN_INPUT_HASH_PAYLOAD_V1";
  runType: RunTypeV1;
  researchEnvironment: ResearchEnvironmentV1;
  researchSourceContext: ResearchSourceContextV1;
  researchSpec: HashRefV1;
  researchIr: HashRefV1;
  experiment: HashRefV1;
  datasetSnapshot: HashRefV1;
  accountResearchContext?: HashRefV1;
  engineId: string;
  engineVersion: string;
  metricRegistryVersion: string;
  metricRequestSet: HashRefV1;
  executionConfig: HashRefV1;
  deterministicSeed?: string;
  materialPolicies: readonly MaterialPolicyRefV1[];
}>;

export type EvidenceContentDescriptorV1 = Readonly<{
  schemaVersion: "EVIDENCE_CONTENT_DESCRIPTOR_V1";
  kind: string;
  artifactSchemaVersion: string;
  format: string;
  contentByteLength: string;
}>;

export function canonicalTextV1(value: string, bounds?: { minBytes?: number; maxBytes?: number }): CanonicalTextV1 {
  assertString(value, "CanonicalTextV1");
  assertValidUnicodeScalars(value);
  const normalized = value.normalize("NFC");
  assertValidUnicodeScalars(normalized);
  assertByteBounds(normalized, bounds, "CanonicalTextV1");
  return normalized as CanonicalTextV1;
}

export function canonicalOpaqueStringV1(
  value: string,
  bounds?: { minBytes?: number; maxBytes?: number },
): CanonicalOpaqueStringV1 {
  assertString(value, "CanonicalOpaqueStringV1");
  assertValidUnicodeScalars(value);
  assertByteBounds(value, bounds, "CanonicalOpaqueStringV1");
  return value as CanonicalOpaqueStringV1;
}

export function canonicalTokenV1(value: string, allowed: ReadonlySet<string>): CanonicalTokenV1 {
  assertString(value, "CanonicalTokenV1");
  if (!allowed.has(value)) throw new Error("CanonicalTokenV1 outside closed vocabulary");
  return value as CanonicalTokenV1;
}

export function immutableBehaviorTokenV1(value: string): CanonicalTokenV1 {
  const token = canonicalRunInputAsciiIdentifierV1(value, "CanonicalTokenV1");
  if (mutableBehaviorAliases.has(value.toLowerCase())) {
    throw new Error("BEHAVIOR_VERSION_NOT_IMMUTABLE");
  }
  return token;
}

export function canonicalUuidV1(value: string): CanonicalUuidV1 {
  assertString(value, "CanonicalUuidV1");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(value)) {
    throw new Error("invalid CanonicalUuidV1");
  }
  return value as CanonicalUuidV1;
}

export function canonicalDecimalV1(
  value: string,
  bounds?: { allowNegative?: boolean; min?: string; max?: string; maxIntegerDigits?: number; maxScale?: number },
): CanonicalDecimalV1 {
  assertString(value, "CanonicalDecimalV1");
  if (!/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/u.test(value)) throw new Error("invalid CanonicalDecimalV1");
  if (/^-0(?:\.0+)?$/u.test(value)) throw new Error("invalid CanonicalDecimalV1 -0");

  const negative = value.startsWith("-");
  if (negative && bounds?.allowNegative === false) throw new Error("CanonicalDecimalV1 negative not allowed");
  const unsigned = negative ? value.slice(1) : value;
  const [whole = "", fraction = ""] = unsigned.split(".");
  const trimmedFraction = fraction.replace(/0+$/u, "");
  const canonical = `${negative ? "-" : ""}${trimmedFraction === "" ? whole : `${whole}.${trimmedFraction}`}`;
  const [, canonicalFraction = ""] = canonical.replace(/^-/, "").split(".");

  if (bounds?.maxIntegerDigits !== undefined && whole.length > bounds.maxIntegerDigits) {
    throw new Error("CanonicalDecimalV1 integer digits out of bounds");
  }
  if (bounds?.maxScale !== undefined && canonicalFraction.length > bounds.maxScale) {
    throw new Error("CanonicalDecimalV1 scale out of bounds");
  }
  if (bounds?.min !== undefined && compareCanonicalDecimal(canonical, canonicalDecimalV1(bounds.min)) < 0) {
    throw new Error("CanonicalDecimalV1 below minimum");
  }
  if (bounds?.max !== undefined && compareCanonicalDecimal(canonical, canonicalDecimalV1(bounds.max)) > 0) {
    throw new Error("CanonicalDecimalV1 above maximum");
  }

  return canonical as CanonicalDecimalV1;
}

export function canonicalIntegerV1(
  value: string,
  bounds?: { min?: string; max?: string; allowNegative?: boolean },
): CanonicalIntegerV1 {
  assertString(value, "CanonicalIntegerV1");
  if (!/^-?(?:0|[1-9][0-9]*)$/u.test(value)) throw new Error("invalid CanonicalIntegerV1");
  if (value === "-0") throw new Error("invalid CanonicalIntegerV1 -0");
  if (value.startsWith("-") && bounds?.allowNegative === false) throw new Error("CanonicalIntegerV1 negative not allowed");
  if (bounds?.min !== undefined && compareCanonicalInteger(value, canonicalIntegerV1(bounds.min)) < 0) {
    throw new Error("CanonicalIntegerV1 below minimum");
  }
  if (bounds?.max !== undefined && compareCanonicalInteger(value, canonicalIntegerV1(bounds.max)) > 0) {
    throw new Error("CanonicalIntegerV1 above maximum");
  }
  return value as CanonicalIntegerV1;
}

export function canonicalDateV1(value: string): CanonicalDateV1 {
  assertString(value, "CanonicalDateV1");
  const match = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/u.exec(value);
  if (!match) throw new Error("invalid CanonicalDateV1");
  assertGregorianDate(Number(match[1]), Number(match[2]), Number(match[3]), "CanonicalDateV1");
  return value as CanonicalDateV1;
}

export function canonicalTimestampUtcMicrosV1(value: string): CanonicalTimestampUtcMicrosV1 {
  assertString(value, "CanonicalTimestampUtcMicrosV1");
  const match = /^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})\.([0-9]{6})Z$/u.exec(value);
  if (!match) throw new Error("invalid CanonicalTimestampUtcMicrosV1");
  assertGregorianDate(Number(match[1]), Number(match[2]), Number(match[3]), "CanonicalTimestampUtcMicrosV1");
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  if (hour > 23 || minute > 59 || second > 59) throw new Error("invalid CanonicalTimestampUtcMicrosV1");
  return value as CanonicalTimestampUtcMicrosV1;
}

export function canonicalSha256HexV1(value: string): CanonicalSha256HexV1 {
  assertString(value, "CanonicalSha256HexV1");
  if (!/^[0-9A-F]{64}$/u.test(value)) throw new Error("invalid CanonicalSha256HexV1");
  return value as CanonicalSha256HexV1;
}

export function canonicalHashDomainV1(value: string): HashDomainV1 {
  assertString(value, "CanonicalHashDomainV1");
  if (!/^[A-Z0-9:_-]+$/u.test(value)) throw new Error("invalid CanonicalHashDomainV1");
  if (!Object.hasOwn(hashDomainAdmission, value)) throw new Error("unknown hash domain");
  return value as HashDomainV1;
}

export function hashDomainStateV1(domain: string): DomainAdmissionState {
  return hashDomainAdmission[canonicalHashDomainV1(domain)];
}

export function hashRefV1(input: {
  hashAlgorithm: string;
  hashDomain: string;
  hashVersion: string;
  hashHex: string;
}): HashRefV1 {
  assertClosedPlainObject(input, new Set(["hashAlgorithm", "hashDomain", "hashVersion", "hashHex"]));
  if (input.hashAlgorithm !== "SHA-256") throw new Error("invalid hash algorithm");
  if (input.hashVersion !== "SYNTRAKE_SHA256_V1") throw new Error("invalid hash version");
  return {
    hashAlgorithm: "SHA-256",
    hashDomain: canonicalHashDomainV1(input.hashDomain),
    hashVersion: "SYNTRAKE_SHA256_V1",
    hashHex: canonicalSha256HexV1(input.hashHex),
  };
}

export function assertHashRefDomainV1(ref: HashRefV1, expectedDomain: HashDomainV1) {
  if (ref.hashDomain !== expectedDomain) throw new Error("wrong-domain HashRefV1");
}

export function assertHashDomainAdmittedForHashingV1(domain: HashDomainV1) {
  const state = hashDomainAdmission[domain];
  if (state === "DECLARED_BUT_HASHING_DISABLED") throw new Error("hash domain declared but hashing disabled");
  return state;
}

function syntrakeCanonicalJsonV1(value: CanonicalJsonValue): string {
  return emitCanonicalJson(value, []);
}

function syntrakeCanonicalJsonBytesV1(value: CanonicalJsonValue): Buffer {
  return Buffer.from(syntrakeCanonicalJsonV1(value), "utf8");
}

export function i5ResearchInternalCanonicalJsonBytesV1(value: CanonicalJsonValue): Buffer {
  return syntrakeCanonicalJsonBytesV1(value);
}

export function sha256HexV1(bytes: Uint8Array): CanonicalSha256HexV1 {
  return createHash("sha256").update(bytes).digest("hex").toUpperCase() as CanonicalSha256HexV1;
}

export function canonicalRunInputHashPayloadV1(input: RunInputHashPayloadV1): CanonicalJsonValue {
  assertClosedPlainObject(input, new Set([
    "schemaVersion",
    "runType",
    "researchEnvironment",
    "researchSourceContext",
    "researchSpec",
    "researchIr",
    "experiment",
    "datasetSnapshot",
    "accountResearchContext",
    "engineId",
    "engineVersion",
    "metricRegistryVersion",
    "metricRequestSet",
    "executionConfig",
    "deterministicSeed",
    "materialPolicies",
  ]));
  if (input.schemaVersion !== "RUN_INPUT_HASH_PAYLOAD_V1") throw new Error("invalid RunInput schemaVersion");
  validateRunEnvironment(input.runType, input.researchEnvironment);
  validateAccountResearchContext(input.researchSourceContext, input.accountResearchContext);

  const researchSpec = hashRefV1(input.researchSpec);
  assertHashRefDomainV1(researchSpec, "SYNTRAKE:RESEARCH_SPEC:V1");
  const researchIr = hashRefV1(input.researchIr);
  assertHashRefDomainV1(researchIr, "SYNTRAKE:RESEARCH_IR:V1");
  const experiment = hashRefV1(input.experiment);
  assertHashRefDomainV1(experiment, "SYNTRAKE:EXPERIMENT:V1");
  const datasetSnapshot = hashRefV1(input.datasetSnapshot);
  assertHashRefDomainV1(datasetSnapshot, "SYNTRAKE:DATASET_SNAPSHOT:V1");
  const metricRequestSet = hashRefV1(input.metricRequestSet);
  assertHashRefDomainV1(metricRequestSet, "SYNTRAKE:METRIC_REQUEST_SET:V1");
  const executionConfig = hashRefV1(input.executionConfig);
  assertHashRefDomainV1(executionConfig, "SYNTRAKE:EXECUTION_CONFIG:V1");

  const payload: Record<string, CanonicalJsonValue> = {
    schemaVersion: input.schemaVersion,
    runType: canonicalRunTypeV1(input.runType),
    researchEnvironment: canonicalResearchEnvironmentV1(input.researchEnvironment),
    researchSourceContext: canonicalResearchSourceContextV1(input.researchSourceContext),
    researchSpec,
    researchIr,
    experiment,
    datasetSnapshot,
    engineId: immutableBehaviorTokenV1(input.engineId),
    engineVersion: immutableBehaviorTokenV1(input.engineVersion),
    metricRegistryVersion: immutableBehaviorTokenV1(input.metricRegistryVersion),
    metricRequestSet,
    executionConfig,
    materialPolicies: canonicalMaterialPolicies(input.materialPolicies),
  };

  if (input.accountResearchContext !== undefined) {
    const accountResearchContext = hashRefV1(input.accountResearchContext);
    assertHashRefDomainV1(accountResearchContext, "SYNTRAKE:ACCOUNT_RESEARCH_CONTEXT:V1");
    payload.accountResearchContext = accountResearchContext;
  }
  if (input.deterministicSeed !== undefined) {
    payload.deterministicSeed = canonicalOpaqueStringV1(input.deterministicSeed, { minBytes: 1 });
  }

  return payload;
}

export function canonicalRunInputBytesV1(input: RunInputHashPayloadV1): Buffer {
  return syntrakeCanonicalJsonBytesV1(canonicalRunInputHashPayloadV1(input));
}

export function hashRunInputV1(input: RunInputHashPayloadV1): CanonicalSha256HexV1 {
  canonicalRunInputHashPayloadV1(input);
  const hashRefs = [
    hashRefV1(input.researchSpec),
    hashRefV1(input.researchIr),
    hashRefV1(input.experiment),
    hashRefV1(input.datasetSnapshot),
    input.accountResearchContext === undefined ? undefined : hashRefV1(input.accountResearchContext),
    hashRefV1(input.metricRequestSet),
    hashRefV1(input.executionConfig),
  ].filter((value): value is HashRefV1 => value !== undefined);
  if (hashRefs.some((ref) => hashDomainAdmission[ref.hashDomain] === "DECLARED_BUT_HASHING_DISABLED")) {
    throw new Error("required nested scientific domain still hashing-disabled");
  }
  return sha256HexV1(runInputPreimageV1(input));
}

function runInputPreimageV1(input: RunInputHashPayloadV1): Buffer {
  return Buffer.concat([Buffer.from("SYNTRAKE:RUN_INPUT:V1\n", "utf8"), canonicalRunInputBytesV1(input)]);
}

function canonicalMaterialPolicies(policies: readonly MaterialPolicyRefV1[]): CanonicalJsonValue {
  if (!Array.isArray(policies)) throw new Error("materialPolicies must be an array");
  const seen = new Set<string>();
  const normalized = policies.map((policy) => {
    assertClosedPlainObject(policy, new Set(["policyId", "policyVersion"]));
    const policyId = canonicalRunInputAsciiIdentifierV1(policy.policyId, "material policy id");
    if (seen.has(policyId)) throw new Error("duplicate policyId");
    seen.add(policyId);
    return {
      policyId,
      policyVersion: immutableBehaviorTokenV1(policy.policyVersion),
    };
  });
  return normalized.sort((left, right) => compareAsciiBytes(left.policyId, right.policyId));
}

function validateRunEnvironment(runType: RunTypeV1, researchEnvironment: ResearchEnvironmentV1) {
  canonicalRunTypeV1(runType);
  canonicalResearchEnvironmentV1(researchEnvironment);
  if (runType === "HISTORICAL_BACKTEST" && researchEnvironment !== "HISTORICAL_BACKTEST") {
    throw new Error("runType/researchEnvironment mismatch");
  }
  if (runType === "SIMULATION" && researchEnvironment !== "SIMULATION") {
    throw new Error("runType/researchEnvironment mismatch");
  }
  if (runType === "SENSITIVITY" || runType === "REPRODUCIBILITY_CHECK") {
    throw new Error("runType environment compatibility unresolved");
  }
}

function validateAccountResearchContext(sourceContext: ResearchSourceContextV1, accountContext: HashRefV1 | undefined) {
  canonicalResearchSourceContextV1(sourceContext);
  if (sourceContext === "USER_PORTFOLIO" && accountContext === undefined) {
    throw new Error("accountResearchContext required for USER_PORTFOLIO");
  }
  if ((sourceContext === "PURE_RESEARCH" || sourceContext === "TEST_PORTFOLIO") && accountContext !== undefined) {
    throw new Error("accountResearchContext must be absent");
  }
}

function canonicalRunTypeV1(value: string): CanonicalTokenV1 {
  return canonicalTokenV1(value, runTypesV1);
}

function canonicalResearchEnvironmentV1(value: string): CanonicalTokenV1 {
  return canonicalTokenV1(value, researchEnvironmentsV1);
}

function canonicalResearchSourceContextV1(value: string): CanonicalTokenV1 {
  return canonicalTokenV1(value, researchSourceContextsV1);
}

function canonicalRunInputAsciiIdentifierV1(value: string, name: string): CanonicalTokenV1 {
  assertString(value, name);
  if (!/^[A-Z0-9_]+$/u.test(value)) throw new Error(`invalid ${name}`);
  return value as CanonicalTokenV1;
}

function assertString(value: string, name: string) {
  if (typeof value !== "string") throw new Error(`${name} must be string`);
}

function assertValidUnicodeScalars(value: string) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new Error("invalid Unicode scalar value");
      index += 1;
      continue;
    }
    if (code >= 0xdc00 && code <= 0xdfff) throw new Error("invalid Unicode scalar value");
  }
}

function assertByteBounds(value: string, bounds: { minBytes?: number; maxBytes?: number } | undefined, name: string) {
  const byteLength = Buffer.byteLength(value, "utf8");
  if (bounds?.minBytes !== undefined && byteLength < bounds.minBytes) throw new Error(`${name} below byte bound`);
  if (bounds?.maxBytes !== undefined && byteLength > bounds.maxBytes) throw new Error(`${name} above byte bound`);
}

function assertGregorianDate(year: number, month: number, day: number, name: string) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) throw new Error(`invalid ${name}`);
  if (year < 1 || year > 9999 || month < 1 || month > 12) throw new Error(`invalid ${name}`);
  const monthLengths = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (day < 1 || day > monthLengths[month - 1]!) throw new Error(`invalid ${name}`);
}

function isLeapYear(year: number) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function emitCanonicalJson(value: unknown, path: string[]): string {
  if (value === null) return "null";
  if (typeof value === "string") return emitCanonicalJsonString(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number" || typeof value === "bigint") throw new Error("JSON numbers are forbidden");
  if (typeof value === "undefined") throw new Error("undefined is not canonical data");
  if (typeof value === "function" || typeof value === "symbol") throw new Error("unsupported canonical JSON value");
  if (Array.isArray(value)) {
    return `[${value.map((entry, index) => emitCanonicalJson(entry, [...path, String(index)])).join(",")}]`;
  }
  if (!isPlainObject(value)) throw new Error("class/provider objects are forbidden");

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort(compareUnicodeCodePoints);
  return `{${keys.map((key) => {
    const entry = record[key];
    if (entry === undefined) throw new Error(`undefined is not canonical data at ${[...path, key].join(".")}`);
    return `${emitCanonicalJsonString(key)}:${emitCanonicalJson(entry, [...path, key])}`;
  }).join(",")}}`;
}

function emitCanonicalJsonString(value: string): string {
  assertValidUnicodeScalars(value);
  let out = "\"";
  for (const scalar of value) {
    const codePoint = scalar.codePointAt(0)!;
    if (scalar === "\"") out += "\\\"";
    else if (scalar === "\\") out += "\\\\";
    else if (scalar === "\b") out += "\\b";
    else if (scalar === "\t") out += "\\t";
    else if (scalar === "\n") out += "\\n";
    else if (scalar === "\f") out += "\\f";
    else if (scalar === "\r") out += "\\r";
    else if (codePoint >= 0 && codePoint <= 0x1f) out += `\\u${codePoint.toString(16).padStart(4, "0")}`;
    else out += scalar;
  }
  return `${out}"`;
}

function isPlainObject(value: unknown) {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertClosedPlainObject(value: unknown, allowedKeys: ReadonlySet<string>) {
  if (!isPlainObject(value)) throw new Error("expected closed plain object");
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!allowedKeys.has(key)) throw new Error(`undeclared field ${key}`);
    if (record[key] === undefined) throw new Error(`undefined is not canonical data at ${key}`);
  }
}

function compareUnicodeCodePoints(left: string, right: string) {
  const leftPoints = Array.from(left, (value) => value.codePointAt(0)!);
  const rightPoints = Array.from(right, (value) => value.codePointAt(0)!);
  const count = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < count; index += 1) {
    const delta = leftPoints[index]! - rightPoints[index]!;
    if (delta !== 0) return delta;
  }
  return leftPoints.length - rightPoints.length;
}

function compareAsciiBytes(left: string, right: string) {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function compareCanonicalInteger(left: string, right: string) {
  const leftNegative = left.startsWith("-");
  const rightNegative = right.startsWith("-");
  if (leftNegative !== rightNegative) return leftNegative ? -1 : 1;
  const leftDigits = leftNegative ? left.slice(1) : left;
  const rightDigits = rightNegative ? right.slice(1) : right;
  const magnitude = compareUnsignedIntegerText(leftDigits, rightDigits);
  return leftNegative ? -magnitude : magnitude;
}

function compareCanonicalDecimal(left: string, right: string) {
  const leftNegative = left.startsWith("-");
  const rightNegative = right.startsWith("-");
  if (leftNegative !== rightNegative) return leftNegative ? -1 : 1;
  const leftMagnitude = decimalMagnitudeParts(leftNegative ? left.slice(1) : left);
  const rightMagnitude = decimalMagnitudeParts(rightNegative ? right.slice(1) : right);
  const whole = compareUnsignedIntegerText(leftMagnitude.whole, rightMagnitude.whole);
  if (whole !== 0) return leftNegative ? -whole : whole;
  const scale = Math.max(leftMagnitude.fraction.length, rightMagnitude.fraction.length);
  const leftFraction = leftMagnitude.fraction.padEnd(scale, "0");
  const rightFraction = rightMagnitude.fraction.padEnd(scale, "0");
  const fraction = leftFraction === rightFraction ? 0 : leftFraction < rightFraction ? -1 : 1;
  return leftNegative ? -fraction : fraction;
}

function decimalMagnitudeParts(value: string) {
  const [whole = "", fraction = ""] = value.split(".");
  return { whole, fraction };
}

function compareUnsignedIntegerText(left: string, right: string) {
  if (left.length !== right.length) return left.length < right.length ? -1 : 1;
  if (left === right) return 0;
  return left < right ? -1 : 1;
}
