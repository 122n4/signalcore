import { describe, expect, it } from "vitest";
import {
  constructResearchExecutionEvidenceObjectV1,
  hashResultV1,
  type ResearchArtifactDescriptorV1,
  type ResultHashPayloadV1,
} from "../lib/investing/research";
import { hashRunInputV1 } from "../lib/investing/research/canonical";
import { i5A2TestOnlyEvidenceObjectHashV1, i5A2TestOnlyEvidenceObjectPreimageV1 } from "./support/investingI5A2TestOnlyVectors";
import { researchExecutionEvidenceObjectPreimageV1 } from "../lib/investing/research/evidenceObject";
import {
  datasetSeriesV1,
  datasetSnapshotV1,
  ref,
  runInputV1,
  secondDatasetSeriesV1,
} from "./support/investingI5DatasetRunScientificFixtures";

const artifact = (artifactSchemaVersion: string, contentSha256: string, contentByteLength = "2", recordCount = "1"): ResearchArtifactDescriptorV1 => ({
  artifactSchemaVersion,
  format: "CANONICAL_JSONL_UTF8_LF_FINAL_NEWLINE_V1",
  contentSha256,
  contentByteLength,
  recordCount,
});

function resultPayload(runInput = runInputV1()): ResultHashPayloadV1 {
  return {
    schemaVersion: "RESULT_HASH_PAYLOAD_V1",
    runInput: ref("SYNTRAKE:RUN_INPUT:V1", hashRunInputV1(runInput)),
    engineId: "HISTORICAL_EXECUTION_ADAPTER",
    engineVersion: "ENGINE_V20260918",
    executionModelClass: "SYNTHETIC_ADJUSTED_CLOSE_RESEARCH_V1",
    valuationCurrency: "USD",
    testPeriod: { startDate: "2020-01-31", endDate: "2024-12-31" },
    startingNav: "1000000",
    endingNav: "1100000",
    terminalCash: "0",
    executionTrace: artifact("RESEARCH_EXECUTION_TRACE_V1", "A".repeat(64)),
    valuationSeries: artifact("RESEARCH_VALUATION_SERIES_V1", "B".repeat(64)),
    metricResultSet: artifact("METRIC_RESULT_SET_V1", "C".repeat(64)),
    benchmark: null,
  };
}

function evidence(overrides: Partial<Parameters<typeof constructResearchExecutionEvidenceObjectV1>[0]> = {}) {
  const runInputPayload = runInputV1();
  const result = resultPayload(runInputPayload);
  return constructResearchExecutionEvidenceObjectV1({
    expectedRunInput: ref("SYNTRAKE:RUN_INPUT:V1", hashRunInputV1(runInputPayload)),
    expectedResult: ref("SYNTRAKE:RESULT:V1", hashResultV1(result)),
    runInputPayload,
    resultPayload: result,
    datasetSnapshotPayload: datasetSnapshotV1(),
    datasetSeriesPayloads: [secondDatasetSeriesV1, datasetSeriesV1],
    ...overrides,
  });
}

describe("I5 RL-1 Evidence Object scientific closure", () => {
  it("constructs deterministic exact content bytes and scientific hash", () => {
    const first = evidence();
    const second = evidence();
    expect(first.contentBytes.equals(second.contentBytes)).toBe(true);
    expect(first.evidenceHash).toEqual(second.evidenceHash);
    expect(first.descriptor).toMatchObject({
      schemaVersion: "EVIDENCE_CONTENT_DESCRIPTOR_V1",
      kind: "RESEARCH_EXECUTION_EVIDENCE",
      artifactSchemaVersion: "RESEARCH_EXECUTION_EVIDENCE_V1",
      format: "CANONICAL_JSON_UTF8_V1",
      contentByteLength: String(first.contentBytes.byteLength),
    });
    expect(first.content.datasetSeries.map((series) => series.hashHex)).toEqual(
      [...first.content.datasetSeries.map((series) => series.hashHex)].sort(),
    );
  });

  it("canonicalizes DatasetSeries ordering and excludes operational provenance", () => {
    const ordered = evidence({ datasetSeriesPayloads: [datasetSeriesV1, secondDatasetSeriesV1] });
    const reversed = evidence({ datasetSeriesPayloads: [secondDatasetSeriesV1, datasetSeriesV1] });
    expect(ordered.evidenceHash.hashHex).toBe(reversed.evidenceHash.hashHex);
    expect(ordered.contentBytes.toString("utf8")).not.toContain("tenant");
    expect(ordered.contentBytes.toString("utf8")).not.toContain("correlation");
    expect(ordered.contentBytes.toString("utf8")).not.toContain("created_at");
  });

  it("matches the historical A2 Evidence preimage/hash vector for equivalent descriptor/content inputs", () => {
    const object = evidence();
    expect(researchExecutionEvidenceObjectPreimageV1(object.descriptor, object.contentBytes).equals(
      i5A2TestOnlyEvidenceObjectPreimageV1(object.descriptor, object.contentBytes),
    )).toBe(true);
    expect(object.evidenceHash.hashHex).toBe(i5A2TestOnlyEvidenceObjectHashV1(object.descriptor, object.contentBytes));
    const a2Preimage = i5A2TestOnlyEvidenceObjectPreimageV1(object.descriptor, object.contentBytes);
    expect(a2Preimage.includes(Buffer.from("SYNTRAKE:EVIDENCE_OBJECT:V1\n", "utf8"))).toBe(true);
  });

  it("fails closed on RunInput, Result, Result/RunInput, engine and DatasetSnapshot mismatches", () => {
    const runInputPayload = runInputV1();
    const result = resultPayload(runInputPayload);
    expect(() => evidence({ expectedRunInput: ref("SYNTRAKE:RUN_INPUT:V1", "D".repeat(64)) })).toThrow("EVIDENCE_RUN_INPUT_HASH_MISMATCH");
    expect(() => evidence({ expectedResult: ref("SYNTRAKE:RESULT:V1", "E".repeat(64)) })).toThrow("EVIDENCE_RESULT_HASH_MISMATCH");
    expect(() => evidence({ resultPayload: resultPayload({ ...runInputPayload, deterministicSeed: "different-seed" }) })).toThrow("EVIDENCE_RESULT_HASH_MISMATCH");
    expect(() => evidence({ runInputPayload: { ...runInputPayload, engineVersion: "ENGINE_V20260918_ALT" }, expectedRunInput: ref("SYNTRAKE:RUN_INPUT:V1", hashRunInputV1({ ...runInputPayload, engineVersion: "ENGINE_V20260918_ALT" })) })).toThrow();
    expect(() => evidence({ datasetSnapshotPayload: { ...datasetSnapshotV1(), series: [datasetSnapshotV1().series[0]!] } })).toThrow("EVIDENCE_DATASET_SNAPSHOT_HASH_MISMATCH");
    expect(() => evidence({ datasetSeriesPayloads: [datasetSeriesV1, datasetSeriesV1] })).toThrow("EVIDENCE_DUPLICATE_DATASET_SERIES");
    expect(() => evidence({ resultPayload: { ...result, executionTrace: { ...result.executionTrace, artifactSchemaVersion: "WRONG" } } })).toThrow("RESULT_ARTIFACT_DESCRIPTOR_SCHEMA_INVALID");
  });
});
