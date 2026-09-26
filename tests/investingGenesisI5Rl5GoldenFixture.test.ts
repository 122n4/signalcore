import { describe, expect, it } from "vitest";
import {
  canonicalDatasetSeriesMaterialBytesV1,
  constructResearchExecutionEvidenceObjectV1,
  executeHistoricalBacktestV2,
  hashDatasetSeriesV1,
  hashDatasetSnapshotV1,
  hashExecutionConfigV1,
  hashExperimentV1,
  hashMetricRequestSetV1,
  hashResearchIrV1,
  hashResultV1,
  hashRefV1,
  sha256HexV1,
  verifyDatasetSeriesMaterialV2,
  type DatasetSeriesHashPayloadV1,
  type DatasetSeriesObservationV1,
  type DatasetSnapshotHashPayloadV1,
  type ExecutionConfigHashPayloadV1,
  type ExperimentBaselineCandidateV1,
  type HashRefV1,
  type MetricRequestSetHashPayloadV1,
  type ResearchIrV1,
} from "@/lib/investing/research";
import { hashRunInputV1, type RunInputHashPayloadV1 } from "@/lib/investing/research/canonical";

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

function buildGoldenFixture() {
  const researchIr: ResearchIrV1 = {
    schemaVersion: "RESEARCH_IR_HASH_PAYLOAD_V1",
    irVersion: "RESEARCH_IR_V1",
    universe: { type: "EXPLICIT_INSTRUMENTS", instrumentIds: ["AAA", "BBB"] },
    pipeline: [
      {
        type: "WEIGHT",
        method: "FIXED_TARGETS",
        targets: [
          { instrumentId: "AAA", weight: "0.5" },
          { instrumentId: "BBB", weight: "0.5" },
        ],
      },
      { type: "REBALANCE", schedule: "DAILY" },
    ],
    benchmark: { type: "BENCHMARK", benchmark: "INSTRUMENT", instrumentId: "AAA" },
    testPeriod: { startDate: "2020-01-02", endDate: "2020-01-07" },
    valuationCurrency: "USD",
    startingCapital: { amount: "1000", currency: "USD", origin: "SIMULATED" },
  };
  const executionConfig: ExecutionConfigHashPayloadV1 = {
    schemaVersion: "EXECUTION_CONFIG_HASH_PAYLOAD_V1",
    engineCompatibilityVersion: "ENGINE_V20260926",
    missingDataPolicy: "MISSING_DATA_STRICT_RESEARCH_V2",
    fxPolicy: "FX_USD_IDENTITY_V1",
    costsPolicy: "COMMISSION_FEES_NOTIONAL_1_BPS_V1",
    slippagePolicy: "SLIPPAGE_SPREAD_ADVERSE_1_BPS_V1",
    fillPolicy: "NEXT_SESSION_OPEN_V1",
    corporateActionPolicy: "SYNTHETIC_ADJUSTED_OHLC_PROVIDER_V2",
    calendarSessionPolicy: "XNYS_OPEN_CLOSE_SESSION_V2",
    valuationPolicy: "USD_ADJUSTED_CLOSE_MARK_V2",
  };
  const metricRequestSet: MetricRequestSetHashPayloadV1 = {
    schemaVersion: "METRIC_REQUEST_SET_HASH_PAYLOAD_V1",
    metricRegistryVersion: "METRIC_REGISTRY_V20260918",
    requests: [
      { metricId: "TOTAL_RETURN", metricVersion: "METRIC_V1" },
      { metricId: "MAX_DRAWDOWN", metricVersion: "METRIC_V1" },
    ],
  };
  const datasetSeries = ["AAA", "BBB"].flatMap((instrumentId) => ["ADJUSTED_OPEN", "ADJUSTED_HIGH", "ADJUSTED_LOW", "ADJUSTED_CLOSE", "VOLUME"].map((fieldId) => series(instrumentId, fieldId)));
  const datasetSnapshot: DatasetSnapshotHashPayloadV1 = {
    schemaVersion: "DATASET_SNAPSHOT_HASH_PAYLOAD_V1",
    snapshotPolicy: "DATASET_SNAPSHOT_POLICY_V1",
    series: datasetSeries.map((payload) => ref("SYNTRAKE:DATASET_SERIES:V1", hashDatasetSeriesV1(payload))),
  };
  const experiment: ExperimentBaselineCandidateV1 = {
    schemaVersion: "EXPERIMENT_BASELINE_CANDIDATE_V1",
    relation: "BASELINE",
    researchSpecRevisionId: "93000000-0000-4000-8000-000000000026",
    researchIr: ref("SYNTRAKE:RESEARCH_IR:V1", hashResearchIrV1(researchIr)),
  };
  const runInput: RunInputHashPayloadV1 = {
    schemaVersion: "RUN_INPUT_HASH_PAYLOAD_V1",
    runType: "HISTORICAL_BACKTEST",
    researchEnvironment: "HISTORICAL_BACKTEST",
    researchSourceContext: "PURE_RESEARCH",
    researchSpec: ref("SYNTRAKE:RESEARCH_SPEC:V1", "A".repeat(64)),
    researchIr: ref("SYNTRAKE:RESEARCH_IR:V1", hashResearchIrV1(researchIr)),
    experiment: ref("SYNTRAKE:EXPERIMENT:V1", hashExperimentV1(experiment)),
    datasetSnapshot: ref("SYNTRAKE:DATASET_SNAPSHOT:V1", hashDatasetSnapshotV1(datasetSnapshot)),
    engineId: "HISTORICAL_EXECUTION_ADAPTER",
    engineVersion: "ENGINE_V20260926",
    metricRegistryVersion: "METRIC_REGISTRY_V20260918",
    metricRequestSet: ref("SYNTRAKE:METRIC_REQUEST_SET:V1", hashMetricRequestSetV1(metricRequestSet)),
    executionConfig: ref("SYNTRAKE:EXECUTION_CONFIG:V1", hashExecutionConfigV1(executionConfig)),
    materialPolicies: [
      { policyId: "DATASET_SNAPSHOT", policyVersion: "DATASET_SNAPSHOT_POLICY_V1" },
      { policyId: "EXECUTION_CONFIG", policyVersion: "EXECUTION_CONFIG_HASH_PAYLOAD_V1" },
    ],
  };
  return {
    researchIr,
    executionConfig,
    metricRequestSet,
    datasetSeries,
    datasetSnapshot,
    runInput,
    materials: datasetSeries.map((payload) => verifyDatasetSeriesMaterialV2(payload, materialBytes(payload.instrumentId, payload.fieldId))),
  };
}

function series(instrumentId: string, fieldId: string): DatasetSeriesHashPayloadV1 {
  const rows = rowsFor(instrumentId, fieldId);
  const bytes = canonicalDatasetSeriesMaterialBytesV1(rows);
  return {
    schemaVersion: "DATASET_SERIES_HASH_PAYLOAD_V1",
    providerDatasetId: "SYNTRAKE_RL5_TEST_OHLCV",
    providerDatasetVersion: "V20260926",
    instrumentId,
    fieldId,
    fieldVersion: fieldId === "VOLUME" ? "POINT_IN_TIME_REPORTED_SESSION_VOLUME_V2" : "SYNTHETIC_ADJUSTED_OHLC_PROVIDER_V2",
    frequency: "DAILY",
    timezone: "America/New_York",
    calendar: "XNYS_TRADING_CALENDAR_V2",
    currency: fieldId === "VOLUME" ? "NONE" : "USD",
    coverageStart: rows[0]!.date,
    coverageEnd: rows.at(-1)!.date,
    observationCount: String(rows.length),
    contentSha256: sha256HexV1(bytes),
  };
}

function materialBytes(instrumentId: string, fieldId: string) {
  return canonicalDatasetSeriesMaterialBytesV1(rowsFor(instrumentId, fieldId));
}

function rowsFor(instrumentId: string, fieldId: string): readonly DatasetSeriesObservationV1[] {
  const aaa = {
    ADJUSTED_OPEN: ["100.17", "100.5", "101", "101.5"],
    ADJUSTED_HIGH: ["101", "101", "102", "102"],
    ADJUSTED_LOW: ["99", "100", "100.5", "101"],
    ADJUSTED_CLOSE: ["100.17", "100.5", "101.23", "101.5"],
    VOLUME: ["1000", "1100", "1200", "1300"],
  } as const;
  const bbb = {
    ADJUSTED_OPEN: ["50", "51", "51.5", "52"],
    ADJUSTED_HIGH: ["51", "52", "52", "53"],
    ADJUSTED_LOW: ["49", "50", "51", "51.5"],
    ADJUSTED_CLOSE: ["50", "51", "51.5", "52.5"],
    VOLUME: ["2000", "2100", "2200", "2300"],
  } as const;
  const values = (instrumentId === "AAA" ? aaa : bbb)[fieldId as keyof typeof aaa];
  return ["2020-01-02", "2020-01-03", "2020-01-06", "2020-01-07"].map((date, index) => ({ date, value: values[index]! }));
}

function ref(hashDomain: HashRefV1["hashDomain"], hashHex: string): HashRefV1 {
  return hashRefV1({ hashAlgorithm: "SHA-256", hashDomain, hashVersion: "SYNTRAKE_SHA256_V1", hashHex });
}
