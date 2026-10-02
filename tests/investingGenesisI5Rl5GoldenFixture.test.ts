import { buildGoldenFixture, ref } from "./support/investingEngineV2GoldenFixture";
import { describe, expect, it } from "vitest";
import { constructResearchExecutionEvidenceObjectV1, executeHistoricalBacktestV2, hashResultV1, sha256HexV1 } from "@/lib/investing/research";
import { hashRunInputV1 } from "@/lib/investing/research/canonical";

const GOLDEN = {
  runInputHash: "7790ABE5668B8EA731C62DA9A448E88E90BB1A00CF243422B18019840610F5DC",
  executionTraceSha256: "21EE330089A144643A250511E594BAFFAF0925F1F74B92A44AF0A6054D723914",
  valuationSeriesSha256: "77117D88B2DEFC2C9405A912BCF27D640493DCF701FDB73DFF44706AEAF50581",
  metricResultSetSha256: "FEA6D5C953CBBF4FB89414F6565DF273DC53DB734EBED6E0E391B5702AD9E747",
  benchmarkSeriesSha256: "1558958199AF14B9013691E09C7F4DE4C1D3C06EDD9726FD9CB5AC4D2471920D",
  resultHash: "1198A30836B948412E57593CCBFF05AC82D97517DC6E52CACFF36A47E5AA4888",
  evidenceHash: "C6241F265BCB4D75DE5E676C063640A046932FA62E288BB3F51FCC207A998BC0",
};

describe("I5 RL-5 V2 golden fixture", () => {
  it("freezes deterministic V2 scientific hashes", () => {
    const fixture = buildGoldenFixture();
    const first = executeHistoricalBacktestV2({
      runInput: fixture.runInput,
      runInputHash: ref("SYNTRAKE:RUN_INPUT:V1", hashRunInputV1(fixture.runInput)),
      researchIr: fixture.researchIr,
      datasetSeries: fixture.datasetSeries,
      executionConfig: fixture.executionConfig,
      metricRequestSet: fixture.metricRequestSet,
      materials: fixture.materials,
    });
    const second = executeHistoricalBacktestV2({
      runInput: fixture.runInput,
      runInputHash: ref("SYNTRAKE:RUN_INPUT:V1", hashRunInputV1(fixture.runInput)),
      researchIr: fixture.researchIr,
      datasetSeries: fixture.datasetSeries,
      executionConfig: fixture.executionConfig,
      metricRequestSet: fixture.metricRequestSet,
      materials: fixture.materials,
    });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.artifacts.executionTraceBytes.equals(second.artifacts.executionTraceBytes)).toBe(true);
    expect(first.artifacts.valuationSeriesBytes.equals(second.artifacts.valuationSeriesBytes)).toBe(true);
    expect(first.artifacts.metricResultSetBytes.equals(second.artifacts.metricResultSetBytes)).toBe(true);
    expect(first.artifacts.benchmarkSeriesBytes?.equals(second.artifacts.benchmarkSeriesBytes!)).toBe(true);
    const resultHash = hashResultV1(first.resultPayload);
    const evidence = constructResearchExecutionEvidenceObjectV1({
      expectedRunInput: ref("SYNTRAKE:RUN_INPUT:V1", hashRunInputV1(fixture.runInput)),
      expectedResult: ref("SYNTRAKE:RESULT:V1", resultHash),
      runInputPayload: fixture.runInput,
      resultPayload: first.resultPayload,
      datasetSnapshotPayload: fixture.datasetSnapshot,
      datasetSeriesPayloads: fixture.datasetSeries,
    });
    const actual = {
      runInputHash: hashRunInputV1(fixture.runInput),
      executionTraceSha256: sha256HexV1(first.artifacts.executionTraceBytes),
      valuationSeriesSha256: sha256HexV1(first.artifacts.valuationSeriesBytes),
      metricResultSetSha256: sha256HexV1(first.artifacts.metricResultSetBytes),
      benchmarkSeriesSha256: sha256HexV1(first.artifacts.benchmarkSeriesBytes!),
      resultHash,
      evidenceHash: evidence.evidenceHash.hashHex,
    };
    expect(actual).toEqual(GOLDEN);
  });

  it("serializes benchmark values as exact reduced rationals for non-terminating ratios", () => {
    const fixture = buildGoldenFixture();
    const result = executeHistoricalBacktestV2({
      runInput: fixture.runInput,
      runInputHash: ref("SYNTRAKE:RUN_INPUT:V1", hashRunInputV1(fixture.runInput)),
      researchIr: fixture.researchIr,
      datasetSeries: fixture.datasetSeries,
      executionConfig: fixture.executionConfig,
      metricRequestSet: fixture.metricRequestSet,
      materials: fixture.materials,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const lines = result.artifacts.benchmarkSeriesBytes!.toString("utf8").trim().split("\n").map((line) => JSON.parse(line));
    expect(lines.at(-1)?.value).toEqual({ numerator: "1450000", denominator: "1431" });
  });
});
