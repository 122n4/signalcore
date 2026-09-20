import { describe, expect, it } from "vitest";
import {
  buildResearchExecutionEvidenceV1,
  canonicalEvidenceContentDescriptorV1,
  hashEvidenceObjectV1,
  hashDatasetSnapshotV1,
  hashRefV1,
  type ResultHashPayloadV1,
  type RunInputHashPayloadV1,
} from "../lib/investing/research";
import { hashRunInputV1 } from "../lib/investing/research/canonical";
import { hashResultV1 } from "../lib/investing/research/resultArtifacts";

const ref = (domain: Parameters<typeof hashRefV1>[0]["hashDomain"], hex: string) =>
  hashRefV1({ hashAlgorithm: "SHA-256", hashDomain: domain, hashVersion: "SYNTRAKE_SHA256_V1", hashHex: hex });

function fixture() {
  const datasetSnapshot = {
    schemaVersion: "DATASET_SNAPSHOT_HASH_PAYLOAD_V1" as const,
    snapshotPolicy: "DATASET_SNAPSHOT_POLICY_V1" as const,
    series: [
      ref("SYNTRAKE:DATASET_SERIES:V1", "9".repeat(64)),
      ref("SYNTRAKE:DATASET_SERIES:V1", "8".repeat(64)),
    ],
  };
  const runInput: RunInputHashPayloadV1 = {
    schemaVersion: "RUN_INPUT_HASH_PAYLOAD_V1",
    runType: "HISTORICAL_BACKTEST",
    researchEnvironment: "HISTORICAL_BACKTEST",
    researchSourceContext: "PURE_RESEARCH",
    researchSpec: ref("SYNTRAKE:RESEARCH_SPEC:V1", "A".repeat(64)),
    researchIr: ref("SYNTRAKE:RESEARCH_IR:V1", "B".repeat(64)),
    experiment: ref("SYNTRAKE:EXPERIMENT:V1", "C".repeat(64)),
    datasetSnapshot: ref("SYNTRAKE:DATASET_SNAPSHOT:V1", hashDatasetSnapshotV1(datasetSnapshot)),
    engineId: "HISTORICAL_EXECUTION_ADAPTER",
    engineVersion: "ENGINE_V20260918",
    metricRegistryVersion: "METRIC_REGISTRY_V20260918",
    metricRequestSet: ref("SYNTRAKE:METRIC_REQUEST_SET:V1", "E".repeat(64)),
    executionConfig: ref("SYNTRAKE:EXECUTION_CONFIG:V1", "F".repeat(64)),
    materialPolicies: [],
  };
  const runInputHash = hashRunInputV1(runInput);
  const artifact = (schema: string, sha: string) => ({
    artifactSchemaVersion: schema,
    format: "CANONICAL_JSONL_UTF8_LF_FINAL_NEWLINE_V1" as const,
    contentSha256: sha,
    contentByteLength: "10",
    recordCount: "1",
  });
  const resultPayload: ResultHashPayloadV1 = {
    schemaVersion: "RESULT_HASH_PAYLOAD_V1",
    runInput: ref("SYNTRAKE:RUN_INPUT:V1", runInputHash),
    engineId: "HISTORICAL_EXECUTION_ADAPTER",
    engineVersion: "ENGINE_V20260918",
    executionModelClass: "SYNTHETIC_ADJUSTED_CLOSE_RESEARCH_V1",
    valuationCurrency: "USD",
    testPeriod: { startDate: "2025-01-01", endDate: "2025-12-31" },
    startingNav: "1000",
    endingNav: "1100",
    terminalCash: "100",
    executionTrace: artifact("RESEARCH_EXECUTION_TRACE_V1", "1".repeat(64)),
    valuationSeries: artifact("RESEARCH_VALUATION_SERIES_V1", "2".repeat(64)),
    metricResultSet: artifact("METRIC_RESULT_SET_V1", "3".repeat(64)),
    benchmark: artifact("RESEARCH_BENCHMARK_SERIES_V1", "4".repeat(64)),
  };
  return {
    runInput,
    runInputHash,
    resultPayload,
    resultHash: hashResultV1(resultPayload),
    datasetSnapshot,
  };
}

describe("I5 RL-1 Evidence Object scientific identity", () => {
  it("binds Result, RunInput, datasets, metrics and artifacts into deterministic exact content", () => {
    const f = fixture();
    const first = buildResearchExecutionEvidenceV1({
      runInput: f.runInput,
      runInputHashHex: f.runInputHash,
      resultPayload: f.resultPayload,
      resultHashHex: f.resultHash,
      datasetSnapshot: f.datasetSnapshot,
    });
    const second = buildResearchExecutionEvidenceV1({
      runInput: f.runInput,
      runInputHashHex: f.runInputHash,
      resultPayload: f.resultPayload,
      resultHashHex: f.resultHash,
      datasetSnapshot: {
        ...f.datasetSnapshot,
        series: [...f.datasetSnapshot.series].reverse(),
      },
    });

    expect(first.hashHex).toBe(second.hashHex);
    expect(first.contentBytes.equals(second.contentBytes)).toBe(true);
    expect(first.descriptor.kind).toBe("RESEARCH_EXECUTION_EVIDENCE");
    expect(first.descriptor.artifactSchemaVersion).toBe("RESEARCH_EXECUTION_EVIDENCE_V1");
    expect(first.descriptor.contentByteLength).toBe(String(first.contentBytes.length));
    expect(first.content.datasetSeries.map((entry) => entry.hashHex)).toEqual(["8".repeat(64), "9".repeat(64)]);
    expect(first.content.result.hashHex).toBe(f.resultHash);
    expect(first.content.runInput.hashHex).toBe(f.runInputHash);
    expect(first.content.datasetSnapshot.hashHex).toBe(f.runInput.datasetSnapshot.hashHex);
    expect(first.content.metricRequestSet.hashHex).toBe(f.runInput.metricRequestSet.hashHex);
    expect(first.content.executionConfig.hashHex).toBe(f.runInput.executionConfig.hashHex);
    expect(first.content.artifacts.metricResultSet.contentSha256).toBe("3".repeat(64));
    expect(hashEvidenceObjectV1(first.descriptor, first.contentBytes)).toBe(first.hashHex);
  });

  it("keeps operational provenance outside scientific Evidence content", () => {
    const f = fixture();
    const evidence = buildResearchExecutionEvidenceV1({
      runInput: f.runInput,
      runInputHashHex: f.runInputHash,
      resultPayload: f.resultPayload,
      resultHashHex: f.resultHash,
      datasetSnapshot: f.datasetSnapshot,
    });
    const text = evidence.contentBytes.toString("utf8");
    for (const forbidden of ["tenantId", "principalId", "membership", "correlationId", "researchExecutionRunId", "createdAt"]) {
      expect(text).not.toContain(forbidden);
    }
  });

  it("fails closed on mismatched Result or RunInput identity", () => {
    const f = fixture();
    expect(() => buildResearchExecutionEvidenceV1({
      runInput: f.runInput,
      runInputHashHex: "0".repeat(64),
      resultPayload: f.resultPayload,
      resultHashHex: f.resultHash,
      datasetSnapshot: f.datasetSnapshot,
    })).toThrow("EVIDENCE_RUN_INPUT_HASH_MISMATCH");

    expect(() => buildResearchExecutionEvidenceV1({
      runInput: f.runInput,
      runInputHashHex: f.runInputHash,
      resultPayload: f.resultPayload,
      resultHashHex: "0".repeat(64),
      datasetSnapshot: f.datasetSnapshot,
    })).toThrow("EVIDENCE_RESULT_HASH_MISMATCH");
  });

  it("enforces exact descriptor byte length", () => {
    expect(() => canonicalEvidenceContentDescriptorV1({
      schemaVersion: "EVIDENCE_CONTENT_DESCRIPTOR_V1",
      kind: "RESEARCH_EXECUTION_EVIDENCE",
      artifactSchemaVersion: "RESEARCH_EXECUTION_EVIDENCE_V1",
      format: "CANONICAL_JSON_UTF8_V1",
      contentByteLength: "4",
    }, 3)).toThrow("Evidence contentByteLength mismatch");
  });
});
