import { describe, expect, it } from "vitest";
import {
  assertHashDomainAdmittedForHashingV1,
  assertHashRefDomainV1,
  canonicalDateV1,
  canonicalDecimalV1,
  canonicalHashDomainV1,
  canonicalIntegerV1,
  canonicalOpaqueStringV1,
  canonicalRunInputBytesV1,
  canonicalSha256HexV1,
  canonicalTextV1,
  canonicalTimestampUtcMicrosV1,
  canonicalTokenV1,
  canonicalUuidV1,
  evidenceObjectPreimageV1,
  hashDomainStateV1,
  hashEvidenceObjectV1,
  hashRefV1,
  hashRunInputV1,
  immutableBehaviorTokenV1,
  runInputPreimageV1,
  sha256HexV1,
  type HashRefV1,
  type RunInputHashPayloadV1,
} from "../lib/investing/research";
import * as publicResearchCanonical from "../lib/investing/research";
import {
  i5A2TestOnlyCanonicalJsonEscapingVectorV1,
  i5A2TestOnlyCanonicalTextVectorHashV1,
  i5A2TestOnlyCanonicalTextVectorJsonV1,
} from "../lib/investing/research/canonical";

const hexA = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const hexB = "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";
const hexC = "CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC";
const hexD = "DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD";
const hexE = "EEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE";
const hexF = "FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF";

function ref(hashDomain: HashRefV1["hashDomain"], hashHex: string): HashRefV1 {
  return hashRefV1({
    hashAlgorithm: "SHA-256",
    hashDomain,
    hashVersion: "SYNTRAKE_SHA256_V1",
    hashHex,
  });
}

const runInputVector: RunInputHashPayloadV1 = {
  schemaVersion: "RUN_INPUT_HASH_PAYLOAD_V1",
  runType: "HISTORICAL_BACKTEST",
  researchEnvironment: "HISTORICAL_BACKTEST",
  researchSourceContext: "PURE_RESEARCH",
  researchSpec: ref("SYNTRAKE:RESEARCH_SPEC:V1", hexA),
  researchIr: ref("SYNTRAKE:RESEARCH_IR:V1", hexB),
  experiment: ref("SYNTRAKE:EXPERIMENT:V1", hexC),
  datasetSnapshot: ref("SYNTRAKE:DATASET_SNAPSHOT:V1", hexD),
  engineId: "HISTORICAL_EXECUTION_ADAPTER",
  engineVersion: "V1",
  metricRegistryVersion: "METRICS_V1",
  metricRequestSet: ref("SYNTRAKE:METRIC_REQUEST_SET:V1", hexE),
  executionConfig: ref("SYNTRAKE:EXECUTION_CONFIG:V1", hexF),
  deterministicSeed: "seed-001",
  materialPolicies: [
    { policyId: "MISSING_DATA", policyVersion: "MISSING_DATA_V1" },
    { policyId: "FX", policyVersion: "FX_V1" },
  ],
};

const expectedRunInputJson =
  '{"datasetSnapshot":{"hashAlgorithm":"SHA-256","hashDomain":"SYNTRAKE:DATASET_SNAPSHOT:V1","hashHex":"DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD","hashVersion":"SYNTRAKE_SHA256_V1"},"deterministicSeed":"seed-001","engineId":"HISTORICAL_EXECUTION_ADAPTER","engineVersion":"V1","executionConfig":{"hashAlgorithm":"SHA-256","hashDomain":"SYNTRAKE:EXECUTION_CONFIG:V1","hashHex":"FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF","hashVersion":"SYNTRAKE_SHA256_V1"},"experiment":{"hashAlgorithm":"SHA-256","hashDomain":"SYNTRAKE:EXPERIMENT:V1","hashHex":"CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC","hashVersion":"SYNTRAKE_SHA256_V1"},"materialPolicies":[{"policyId":"FX","policyVersion":"FX_V1"},{"policyId":"MISSING_DATA","policyVersion":"MISSING_DATA_V1"}],"metricRegistryVersion":"METRICS_V1","metricRequestSet":{"hashAlgorithm":"SHA-256","hashDomain":"SYNTRAKE:METRIC_REQUEST_SET:V1","hashHex":"EEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE","hashVersion":"SYNTRAKE_SHA256_V1"},"researchEnvironment":"HISTORICAL_BACKTEST","researchIr":{"hashAlgorithm":"SHA-256","hashDomain":"SYNTRAKE:RESEARCH_IR:V1","hashHex":"BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB","hashVersion":"SYNTRAKE_SHA256_V1"},"researchSourceContext":"PURE_RESEARCH","researchSpec":{"hashAlgorithm":"SHA-256","hashDomain":"SYNTRAKE:RESEARCH_SPEC:V1","hashHex":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA","hashVersion":"SYNTRAKE_SHA256_V1"},"runType":"HISTORICAL_BACKTEST","schemaVersion":"RUN_INPUT_HASH_PAYLOAD_V1"}';

describe("Investing Genesis I5-A2 canonical runtime foundation", () => {
  it("implements CanonicalTextV1 as valid Unicode scalar text with NFC normalization", () => {
    expect(canonicalTextV1("Cafe\u0301 plan")).toBe("Caf\u00e9 plan");
    expect(canonicalTextV1("Caf\u00e9 plan")).toBe("Caf\u00e9 plan");
    expect(() => canonicalTextV1("\ud800")).toThrow("invalid Unicode scalar value");
    expect(() => canonicalTextV1("\udc00")).toThrow("invalid Unicode scalar value");
    expect(() => canonicalTextV1("", { minBytes: 1 })).toThrow("below byte bound");
  });

  it("implements CanonicalOpaqueStringV1 without Unicode normalization", () => {
    const composed = canonicalOpaqueStringV1("seed-\u00e9", { minBytes: 1 });
    const decomposed = canonicalOpaqueStringV1("seed-e\u0301", { minBytes: 1 });

    expect(composed).not.toBe(decomposed);
    expect(Buffer.from(composed, "utf8").equals(Buffer.from(decomposed, "utf8"))).toBe(false);
    expect(() => canonicalOpaqueStringV1("\ud800")).toThrow("invalid Unicode scalar value");
  });

  it("validates tokens, UUIDs, dates, timestamps, decimals, integers, and SHA text", () => {
    expect(canonicalTokenV1("SYNTRAKE:RUN_INPUT:V1", new Set(["SYNTRAKE:RUN_INPUT:V1"]))).toBe("SYNTRAKE:RUN_INPUT:V1");
    expect(() => canonicalTokenV1("LATEST", new Set(["V1"]))).toThrow("CanonicalTokenV1 outside closed vocabulary");
    expect(immutableBehaviorTokenV1("V1")).toBe("V1");
    expect(() => immutableBehaviorTokenV1("LATEST")).toThrow("BEHAVIOR_VERSION_NOT_IMMUTABLE");
    expect(canonicalUuidV1("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(() => canonicalUuidV1("AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA")).toThrow("invalid CanonicalUuidV1");
    expect(canonicalDecimalV1("1.2300")).toBe("1.23");
    expect(canonicalDecimalV1("0.500")).toBe("0.5");
    expect(canonicalDecimalV1("-0.500")).toBe("-0.5");
    for (const invalid of ["+1", "01", "1e3", "-0", "NaN", "Infinity", "1,25"]) {
      expect(() => canonicalDecimalV1(invalid)).toThrow();
    }
    expect(canonicalIntegerV1("-12")).toBe("-12");
    for (const invalid of ["01", "-0", "+1", "1.0", "1e3"]) {
      expect(() => canonicalIntegerV1(invalid)).toThrow();
    }
    expect(canonicalDateV1("2028-02-29")).toBe("2028-02-29");
    expect(() => canonicalDateV1("2027-02-29")).toThrow("invalid CanonicalDateV1");
    expect(canonicalTimestampUtcMicrosV1("2026-09-06T18:20:48.123456Z")).toBe("2026-09-06T18:20:48.123456Z");
    expect(() => canonicalTimestampUtcMicrosV1("2026-09-06T18:20:48.123Z")).toThrow("invalid CanonicalTimestampUtcMicrosV1");
    expect(() => canonicalTimestampUtcMicrosV1("2026-09-06T18:20:48+00:00")).toThrow("invalid CanonicalTimestampUtcMicrosV1");
    expect(canonicalSha256HexV1(hexA)).toBe(hexA);
    expect(() => canonicalSha256HexV1(hexA.toLowerCase())).toThrow("invalid CanonicalSha256HexV1");
  });

  it("emits byte-exact SYNTRAKE_CANONICAL_JSON_V1 with code-point key order and exact escaping", () => {
    const json = i5A2TestOnlyCanonicalJsonEscapingVectorV1();

    expect(json).toBe('{"a":"\\b\\t\\n\\f\\r\\u0000\\u001f/  é","aa":true,"b":null,"😀":"emoji-key"}');
    expect(Buffer.from(json, "utf8")[0]).toBe(0x7b);
  });

  it("matches A2 Vector D NFC and exact JSON/hash bytes", () => {
    const jsonBytes = Buffer.from(i5A2TestOnlyCanonicalTextVectorJsonV1("cafe\u0301\n\"x\"\\y"), "utf8");

    expect(jsonBytes.toString("utf8")).toBe('{"schemaVersion":"CANONICAL_TEXT_VECTOR_V1","text":"café\\n\\"x\\"\\\\y"}');
    expect(jsonBytes.toString("hex").toUpperCase()).toBe(
      "7B22736368656D6156657273696F6E223A2243414E4F4E4943414C5F544558545F564543544F525F5631222C2274657874223A22636166C3A95C6E5C22785C225C5C79227D",
    );
    expect(i5A2TestOnlyCanonicalTextVectorHashV1("cafe\u0301\n\"x\"\\y")).toBe(
      "0607C97E6E2663D8EE4AF608A042D84BA477E3B59B52E9147C5AE71695CD1B9E",
    );
  });

  it("validates HashRefV1 domain/version and fails closed for unknown or disabled domains", () => {
    const researchSpec = ref("SYNTRAKE:RESEARCH_SPEC:V1", hexA);

    expect(hashDomainStateV1("SYNTRAKE:RESEARCH_SPEC:V1")).toBe("DECLARED_BUT_HASHING_DISABLED");
    expect(hashDomainStateV1("SYNTRAKE:RUN_INPUT:V1")).toBe("PREIMAGE_ENVELOPE_EXACT");
    expect(hashDomainStateV1("SYNTRAKE:EVIDENCE_OBJECT:V1")).toBe("CONTENT_PREIMAGE_EXACT");
    expect(() => canonicalHashDomainV1("SYNTRAKE:UNKNOWN:V1")).toThrow("unknown hash domain");
    expect(() => assertHashDomainAdmittedForHashingV1("SYNTRAKE:RESEARCH_SPEC:V1")).toThrow("hashing disabled");
    expect(() => assertHashRefDomainV1(researchSpec, "SYNTRAKE:HYPOTHESIS:V1")).toThrow("wrong-domain HashRefV1");
    expect(() => hashRefV1({ hashAlgorithm: "SHA-512", hashDomain: "SYNTRAKE:RESEARCH_SPEC:V1", hashVersion: "SYNTRAKE_SHA256_V1", hashHex: hexA })).toThrow(
      "invalid hash algorithm",
    );
    expect(() => hashRefV1({ hashAlgorithm: "SHA-256", hashDomain: "SYNTRAKE:RESEARCH_SPEC:V1", hashVersion: "V2", hashHex: hexA })).toThrow(
      "invalid hash version",
    );
  });

  it("matches A2 Vector E canonical RunInput bytes and proves production RunInput hashing remains blocked", () => {
    const bytes = canonicalRunInputBytesV1(runInputVector);
    const reorderedBytes = canonicalRunInputBytesV1({
      ...runInputVector,
      materialPolicies: [...runInputVector.materialPolicies].reverse(),
    });

    expect(bytes.toString("utf8")).toBe(expectedRunInputJson);
    expect(reorderedBytes.equals(bytes)).toBe(true);
    expect(sha256HexV1(runInputPreimageV1(runInputVector))).toBe("48605C6D47930999F42958C52851B45B18EDBF35F2045628BF108A31F89352B6");
    expect(() => hashRunInputV1(runInputVector)).toThrow("required nested scientific domain still hashing-disabled");
    expect(() =>
      canonicalRunInputBytesV1({
        ...runInputVector,
        materialPolicies: [...runInputVector.materialPolicies, { policyId: "FX", policyVersion: "FX_V1" }],
      }),
    ).toThrow("duplicate policyId");
    expect(() => canonicalRunInputBytesV1({ ...runInputVector, researchSpec: ref("SYNTRAKE:HYPOTHESIS:V1", hexA) })).toThrow(
      "wrong-domain HashRefV1",
    );
    expect(() => canonicalRunInputBytesV1({ ...runInputVector, engineVersion: "CURRENT" })).toThrow("BEHAVIOR_VERSION_NOT_IMMUTABLE");
  });

  it("enforces RunInput source-context, environment, null, undefined, and undeclared-field rules", () => {
    expect(() => canonicalRunInputBytesV1({ ...runInputVector, runType: "UNKNOWN_RUN_TYPE" } as never)).toThrow(
      "CanonicalTokenV1 outside closed vocabulary",
    );
    expect(() => canonicalRunInputBytesV1({ ...runInputVector, researchEnvironment: "UNKNOWN_ENVIRONMENT" } as never)).toThrow(
      "CanonicalTokenV1 outside closed vocabulary",
    );
    expect(() => canonicalRunInputBytesV1({ ...runInputVector, researchSourceContext: "UNKNOWN_SOURCE_CONTEXT" } as never)).toThrow(
      "CanonicalTokenV1 outside closed vocabulary",
    );
    expect(() =>
      canonicalRunInputBytesV1({
        ...runInputVector,
        runType: "UNKNOWN_RUN_TYPE",
        researchEnvironment: "UNKNOWN_ENVIRONMENT",
      } as never),
    ).toThrow("CanonicalTokenV1 outside closed vocabulary");
    expect(() => canonicalRunInputBytesV1({ ...runInputVector, researchEnvironment: "SIMULATION" })).toThrow(
      "runType/researchEnvironment mismatch",
    );
    expect(() => canonicalRunInputBytesV1({ ...runInputVector, runType: "SENSITIVITY" })).toThrow(
      "runType environment compatibility unresolved",
    );
    expect(() => canonicalRunInputBytesV1({ ...runInputVector, researchSourceContext: "USER_PORTFOLIO" })).toThrow(
      "accountResearchContext required",
    );
    expect(() =>
      canonicalRunInputBytesV1({
        ...runInputVector,
        accountResearchContext: ref("SYNTRAKE:ACCOUNT_RESEARCH_CONTEXT:V1", hexA),
      }),
    ).toThrow("accountResearchContext must be absent");
    const withoutDeterministicSeed = Object.fromEntries(
      Object.entries(runInputVector).filter(([key]) => key !== "deterministicSeed"),
    ) as RunInputHashPayloadV1;

    expect(() => canonicalRunInputBytesV1(withoutDeterministicSeed)).not.toThrow();
    expect(() => canonicalRunInputBytesV1({ ...runInputVector, deterministicSeed: undefined })).toThrow(
      "undefined is not canonical data",
    );
    expect(() => canonicalRunInputBytesV1({ ...runInputVector, deterministicSeed: null } as never)).toThrow("CanonicalOpaqueStringV1 must be string");
    expect(() => canonicalRunInputBytesV1({ ...runInputVector, runId: "not-member" } as never)).toThrow("undeclared field runId");
  });

  it("matches A2 Vector F EvidenceObject uncompressed scientific content identity", () => {
    const descriptor = {
      schemaVersion: "EVIDENCE_CONTENT_DESCRIPTOR_V1" as const,
      kind: "ENGINE_LOG_SUMMARY",
      artifactSchemaVersion: "ENGINE_LOG_SUMMARY_V1",
      format: "text/plain; charset=utf-8",
      contentByteLength: "4",
    };
    const content = Buffer.from("abc\n", "utf8");
    const descriptorJson =
      '{"artifactSchemaVersion":"ENGINE_LOG_SUMMARY_V1","contentByteLength":"4","format":"text/plain; charset=utf-8","kind":"ENGINE_LOG_SUMMARY","schemaVersion":"EVIDENCE_CONTENT_DESCRIPTOR_V1"}';

    expect(evidenceObjectPreimageV1(descriptor, content).toString("utf8")).toBe(
      `SYNTRAKE:EVIDENCE_OBJECT:V1\n${descriptorJson}\nabc\n`,
    );
    expect(hashEvidenceObjectV1(descriptor, content)).toBe("0EF6EC9749E99DF97644FA30F143EA6BD5D9D3D8C7C0AEABBB18E89AF34654F4");
    expect(hashEvidenceObjectV1({ ...descriptor, contentByteLength: "4" }, content)).toBe(hashEvidenceObjectV1(descriptor, content));
    expect(() => hashEvidenceObjectV1({ ...descriptor, contentByteLength: "3" }, content)).toThrow("contentByteLength mismatch");
    expect(hashEvidenceObjectV1({ ...descriptor, format: "application/octet-stream" }, content)).not.toBe(hashEvidenceObjectV1(descriptor, content));
  });

  it("does not expose generic scientific admission for arbitrary maps, arrays, or disabled owner domains", () => {
    expect("syntrakeCanonicalJsonV1" in publicResearchCanonical).toBe(false);
    expect("syntrakeCanonicalJsonBytesV1" in publicResearchCanonical).toBe(false);
    expect("structuredHashPreimageV1" in publicResearchCanonical).toBe(false);
    expect("canonicalTestHashV1" in publicResearchCanonical).toBe(false);
    expect("i5A2TestOnlyCanonicalJsonEscapingVectorV1" in publicResearchCanonical).toBe(false);
    expect(() => assertHashDomainAdmittedForHashingV1("SYNTRAKE:RESEARCH_DRAFT:V1")).toThrow(
      "hash domain declared but hashing disabled",
    );
    expect(() => canonicalRunInputBytesV1({ arbitraryMap: { x: "y" } } as never)).toThrow("undeclared field arbitraryMap");
    expect(() => canonicalRunInputBytesV1([] as never)).toThrow("expected closed plain object");
    expect(() => runInputPreimageV1({ schemaVersion: "RUN_INPUT_HASH_PAYLOAD_V1", bytes: "{}" } as never)).toThrow(
      "undeclared field bytes",
    );
  });
});
