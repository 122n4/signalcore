import { describe, expect, it } from "vitest";
import {
  assertEngineV2MetricRequestSet,
  canonicalDatasetSeriesMaterialBytesV1,
  constructResearchExecutionEvidenceObjectV1,
  executeHistoricalKernelV2,
  hashDatasetSeriesV1,
  hashDatasetSnapshotV1,
  hashExecutionConfigV1,
  hashExperimentV1,
  metricRegistryV2Requests,
  metricRegistryVersionV2,
  metricResultRecordsV2,
  hashMetricRequestSetV1,
  hashResearchIrV1,
  hashResultV1,
  hashRefV1,
  artifactDescriptorV1,
  sha256HexV1,
  verifyDatasetSeriesMaterialV2,
  type DatasetSnapshotHashPayloadV1,
  type ExperimentBaselineCandidateV1,
  type HashRefV1,
  type DatasetSeriesHashPayloadV1,
  type DatasetSeriesObservationV1,
  type ExecutionConfigHashPayloadV1,
  type MetricRequestSetHashPayloadV1,
  type ResearchIrV1,
} from "@/lib/investing/research";
import { hashRunInputV1, type RunInputHashPayloadV1 } from "@/lib/investing/research/canonical";
import { decimalStringToRationalV1, integerToRationalV1, type ExactRationalV1 } from "@/lib/investing/research/exactRational";

const executionConfigV2: ExecutionConfigHashPayloadV1 = {
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

const metricRequestSetV2: MetricRequestSetHashPayloadV1 = {
  schemaVersion: "METRIC_REQUEST_SET_HASH_PAYLOAD_V1",
  metricRegistryVersion: metricRegistryVersionV2,
  requests: metricRegistryV2Requests,
};

const researchIrV2: ResearchIrV1 = {
  schemaVersion: "RESEARCH_IR_HASH_PAYLOAD_V1",
  irVersion: "RESEARCH_IR_V1",
  universe: { type: "EXPLICIT_INSTRUMENTS", instrumentIds: ["AAA"] },
  pipeline: [
    { type: "WEIGHT", method: "FIXED_TARGETS", targets: [{ instrumentId: "AAA", weight: "1" }] },
    { type: "REBALANCE", schedule: "DAILY" },
  ],
  benchmark: { type: "BENCHMARK", benchmark: "INSTRUMENT", instrumentId: "AAA" },
  testPeriod: { startDate: "2020-01-02", endDate: "2020-01-08" },
  valuationCurrency: "USD",
  startingCapital: { amount: "1000", currency: "USD", origin: "SIMULATED" },
};

describe("I5 RL-6 Metric Registry V2", () => {
  it("admits the exact closed V2 request set and rejects duplicate or unknown requests", () => {
    expect(() => assertEngineV2MetricRequestSet(metricRequestSetV2)).not.toThrow();
    expect(() => assertEngineV2MetricRequestSet({
      ...metricRequestSetV2,
      requests: [...metricRegistryV2Requests].reverse(),
    })).not.toThrow();
    expect(() => assertEngineV2MetricRequestSet({
      ...metricRequestSetV2,
      requests: [...metricRegistryV2Requests, metricRegistryV2Requests[0]!],
    })).toThrow("UNSUPPORTED_V2_METRIC_REQUEST_SET");
    expect(() => assertEngineV2MetricRequestSet({
      ...metricRequestSetV2,
      requests: [{ metricId: "TOTAL_RETURN", metricVersion: "METRIC_V2" }],
    })).toThrow("UNSUPPORTED_V2_METRIC_REQUEST_SET");
  });

  it("computes every V2 metric with deterministic available/unavailable records", () => {
    const records = metricResultRecordsV2({
      valuations: [
        valuation("2020-01-02", "1000", "0"),
        valuation("2020-01-03", "1100", "1000"),
        valuation("2020-01-06", "900", "900"),
        valuation("2020-01-07", "1200", "1100"),
        valuation("2020-01-08", "1150", "1000"),
      ],
      fills: [
        { originatingTargetIntent: "1", grossNotional: r("1000") },
        { originatingTargetIntent: "1", grossNotional: r("500") },
        { originatingTargetIntent: "3", grossNotional: r("250") },
      ],
      benchmark: [
        { sessionDate: "2020-01-02", valueExact: r("1000") },
        { sessionDate: "2020-01-03", valueExact: r("1000") },
        { sessionDate: "2020-01-06", valueExact: r("950") },
        { sessionDate: "2020-01-07", valueExact: r("1000") },
        { sessionDate: "2020-01-08", valueExact: r("1000") },
      ],
    });
    expect(records).toHaveLength(metricRegistryV2Requests.length);
    expect(records.map((record) => (record as { metricId: string }).metricId)).toEqual(metricRegistryV2Requests.map((request) => request.metricId));
    expect(byId(records, "TOTAL_RETURN")).toMatchObject({ status: "AVAILABLE", value: "0.15" });
    expect(byId(records, "MAX_DRAWDOWN")).toMatchObject({ status: "AVAILABLE", value: "0.181818181818181818" });
    expect(byId(records, "MAX_DRAWDOWN_DURATION")).toMatchObject({ status: "AVAILABLE", value: "2" });
    expect(byId(records, "MAX_DRAWDOWN_RECOVERY")).toMatchObject({ status: "AVAILABLE", value: "1" });
    expect(byId(records, "TRADE_COUNT")).toMatchObject({ status: "AVAILABLE", value: "3" });
    expect(byId(records, "REBALANCE_COUNT")).toMatchObject({ status: "AVAILABLE", value: "2" });
    expect(byId(records, "BENCHMARK_RELATIVE_RETURN")).toMatchObject({ status: "AVAILABLE", value: "0.15" });
    expect(byId(records, "CAGR")).toMatchObject({ status: "AVAILABLE", value: "4924.518502805636111613" });
    expect(byId(records, "ANNUALIZED_VOLATILITY")).toMatchObject({ status: "AVAILABLE", value: "3.488733588616591084" });
    expect(byId(records, "DOWNSIDE_DEVIATION")).toMatchObject({ status: "AVAILABLE", value: "2.961094141089859746" });
    expect(byId(records, "SHARPE_RATIO")).toMatchObject({ status: "AVAILABLE", value: "3.78947093827732869" });
    expect(byId(records, "SORTINO_RATIO")).toMatchObject({ status: "AVAILABLE", value: "4.464719429889056979" });
    expect(byId(records, "CALMAR_RATIO")).toMatchObject({ status: "AVAILABLE", value: "27084.851765430998613873" });
    expect(byId(records, "TURNOVER")).toMatchObject({ status: "AVAILABLE", value: "1.635514018691588785" });
    expect(byId(records, "AVERAGE_GROSS_EXPOSURE")).toMatchObject({ status: "AVAILABLE", value: "0.739064558629776021" });
    expect(byId(records, "TRACKING_ERROR")).toMatchObject({ status: "AVAILABLE", value: "2.856983765296380287" });
  });

  it("keeps missingness distinct from zero and fails closed on benchmark misalignment", () => {
    const flat = [
      valuation("2020-01-02", "1000", "0"),
      valuation("2020-01-03", "1000", "0"),
      valuation("2020-01-06", "1000", "0"),
    ];
    const records = metricResultRecordsV2({ valuations: flat, fills: [], benchmark: [] });
    expect(byId(records, "TOTAL_RETURN")).toMatchObject({ status: "AVAILABLE", value: "0" });
    expect(byId(records, "MAX_DRAWDOWN")).toMatchObject({ status: "AVAILABLE", value: "0" });
    expect(byId(records, "MAX_DRAWDOWN_RECOVERY")).toMatchObject({ status: "AVAILABLE", value: "0" });
    expect(byId(records, "BENCHMARK_RELATIVE_RETURN")).toMatchObject({ status: "UNAVAILABLE", reason: "BENCHMARK_UNAVAILABLE" });
    expect(byId(records, "TRACKING_ERROR")).toMatchObject({ status: "UNAVAILABLE", reason: "BENCHMARK_UNAVAILABLE" });
    expect(byId(records, "SORTINO_RATIO")).toMatchObject({ status: "UNAVAILABLE", reason: "NO_DOWNSIDE_OBSERVATIONS" });
    expect(byId(records, "CALMAR_RATIO")).toMatchObject({ status: "UNAVAILABLE", reason: "ZERO_DENOMINATOR" });
    for (const benchmark of [
      [
        { sessionDate: "2020-01-02", valueExact: r("1000") },
        { sessionDate: "2020-01-03", valueExact: r("1000") },
      ],
      [
        { sessionDate: "2020-01-02", valueExact: r("1000") },
        { sessionDate: "2020-01-03", valueExact: r("1000") },
        { sessionDate: "2020-01-06", valueExact: r("1000") },
        { sessionDate: "2020-01-07", valueExact: r("1000") },
      ],
      [
        { sessionDate: "2020-01-02", valueExact: r("1000") },
        { sessionDate: "2020-01-07", valueExact: r("1000") },
        { sessionDate: "2020-01-06", valueExact: r("1000") },
      ],
      [
        { sessionDate: "2020-01-03", valueExact: r("1000") },
        { sessionDate: "2020-01-02", valueExact: r("1000") },
        { sessionDate: "2020-01-06", valueExact: r("1000") },
      ],
    ]) {
      expect(() => metricResultRecordsV2({ valuations: flat, fills: [], benchmark })).toThrow("BENCHMARK_MISALIGNED");
    }
  });

  it("rejects Result/Evidence metric artifact schema mismatches against the exact RunInput registry", () => {
    const fixture = evidenceFixture(metricRequestSetV2);
    const v2Result = resultPayload(fixture.runInput, "METRIC_RESULT_SET_V2");
    expect(() => constructResearchExecutionEvidenceObjectV1({
      expectedRunInput: ref("SYNTRAKE:RUN_INPUT:V1", hashRunInputV1(fixture.runInput)),
      expectedResult: ref("SYNTRAKE:RESULT:V1", hashResultV1(v2Result)),
      runInputPayload: fixture.runInput,
      resultPayload: v2Result,
      datasetSnapshotPayload: fixture.datasetSnapshot,
      datasetSeriesPayloads: fixture.datasetSeries,
    })).not.toThrow();

    const historicalRegistry = {
      schemaVersion: "METRIC_REQUEST_SET_HASH_PAYLOAD_V1",
      metricRegistryVersion: "METRIC_REGISTRY_V20260918",
      requests: [
        { metricId: "TOTAL_RETURN", metricVersion: "METRIC_V1" },
        { metricId: "MAX_DRAWDOWN", metricVersion: "METRIC_V1" },
      ],
    } satisfies MetricRequestSetHashPayloadV1;
    const v1Fixture = evidenceFixture(historicalRegistry);
    const v1RunV2Metrics = resultPayload(v1Fixture.runInput, "METRIC_RESULT_SET_V2");
    expect(() => constructResearchExecutionEvidenceObjectV1({
      expectedRunInput: ref("SYNTRAKE:RUN_INPUT:V1", hashRunInputV1(v1Fixture.runInput)),
      expectedResult: ref("SYNTRAKE:RESULT:V1", hashResultV1(v1RunV2Metrics)),
      runInputPayload: v1Fixture.runInput,
      resultPayload: v1RunV2Metrics,
      datasetSnapshotPayload: v1Fixture.datasetSnapshot,
      datasetSeriesPayloads: v1Fixture.datasetSeries,
    })).toThrow("EVIDENCE_METRIC_REGISTRY_ARTIFACT_SCHEMA_MISMATCH");

    const v2RunV1Metrics = resultPayload(fixture.runInput, "METRIC_RESULT_SET_V1");
    expect(() => constructResearchExecutionEvidenceObjectV1({
      expectedRunInput: ref("SYNTRAKE:RUN_INPUT:V1", hashRunInputV1(fixture.runInput)),
      expectedResult: ref("SYNTRAKE:RESULT:V1", hashResultV1(v2RunV1Metrics)),
      runInputPayload: fixture.runInput,
      resultPayload: v2RunV1Metrics,
      datasetSnapshotPayload: fixture.datasetSnapshot,
      datasetSeriesPayloads: fixture.datasetSeries,
    })).toThrow("EVIDENCE_METRIC_REGISTRY_ARTIFACT_SCHEMA_MISMATCH");
  });

  it("keeps total-period turnover invariant when duplicate no-trade observations preserve average NAV", () => {
    const base = metricResultRecordsV2({
      valuations: [valuation("2020-01-02", "1000", "0"), valuation("2020-01-03", "1000", "0")],
      fills: [{ originatingTargetIntent: "1", grossNotional: r("500") }],
      benchmark: [],
    });
    const expanded = metricResultRecordsV2({
      valuations: [valuation("2020-01-02", "1000", "0"), valuation("2020-01-03", "1000", "0"), valuation("2020-01-06", "1000", "0"), valuation("2020-01-07", "1000", "0")],
      fills: [{ originatingTargetIntent: "1", grossNotional: r("500") }],
      benchmark: [],
    });
    expect(byId(base, "TURNOVER")).toMatchObject({ value: "0.5" });
    expect(byId(expanded, "TURNOVER")).toMatchObject({ value: "0.5" });
  });

  it("freezes drawdown duration as duration of the maximum-depth episode", () => {
    const records = metricResultRecordsV2({
      valuations: [
        valuation("2020-01-02", "1000", "0"),
        valuation("2020-01-03", "990", "0"),
        valuation("2020-01-06", "990", "0"),
        valuation("2020-01-07", "1000", "0"),
        valuation("2020-01-08", "700", "0"),
        valuation("2020-01-09", "1000", "0"),
      ],
      fills: [],
      benchmark: [],
    });
    expect(byId(records, "MAX_DRAWDOWN")).toMatchObject({ value: "0.3" });
    expect(byId(records, "MAX_DRAWDOWN_DURATION")).toMatchObject({ value: "2" });
    expect(byId(records, "MAX_DRAWDOWN_RECOVERY")).toMatchObject({ value: "1" });
  });

  it("keeps root and rational-power half-even boundary outputs deterministic", () => {
    const flat = [
      valuation("2020-01-02", "1000", "0"),
      valuation("2020-01-03", "1000", "0"),
      valuation("2020-01-06", "1000", "0"),
    ];
    const records = metricResultRecordsV2({
      valuations: flat,
      fills: [],
      benchmark: [],
    });
    expect(byId(records, "ANNUALIZED_VOLATILITY")).toMatchObject({ status: "AVAILABLE", value: "0" });
    expect(byId(records, "CAGR")).toMatchObject({ status: "AVAILABLE", value: "0" });
  });

  it("handles unrecovered drawdown and invalid CAGR domains explicitly", () => {
    const records = metricResultRecordsV2({
      valuations: [
        valuation("2020-01-02", "1000", "0"),
        valuation("2020-01-03", "900", "0"),
        valuation("2020-01-06", "800", "0"),
      ],
      fills: [],
      benchmark: [],
    });
    expect(byId(records, "MAX_DRAWDOWN_RECOVERY")).toMatchObject({ status: "UNAVAILABLE", reason: "UNRECOVERED_DRAWDOWN" });
    const invalid = metricResultRecordsV2({
      valuations: [valuation("2020-01-02", "0", "0"), valuation("2020-01-03", "1", "0")],
      fills: [],
      benchmark: [],
    });
    expect(byId(invalid, "CAGR")).toMatchObject({ status: "UNAVAILABLE", reason: "INVALID_CAGR_DOMAIN" });
    expect(byId(invalid, "AVERAGE_GROSS_EXPOSURE")).toMatchObject({ status: "UNAVAILABLE", reason: "NON_POSITIVE_NAV" });
  });

  it("executes Engine V2 with Metric Registry V2 and freezes byte-identical metric artifacts", () => {
    const materials = ["ADJUSTED_OPEN", "ADJUSTED_HIGH", "ADJUSTED_LOW", "ADJUSTED_CLOSE", "VOLUME"].map((fieldId) =>
      verifyDatasetSeriesMaterialV2(series(fieldId), bytes(fieldId)));
    const input = {
      researchIr: researchIrV2,
      datasetSeries: materials.map((material) => material.series),
      executionConfig: executionConfigV2,
      metricRequestSet: metricRequestSetV2,
      materials,
    };
    const first = executeHistoricalKernelV2(input);
    const second = executeHistoricalKernelV2(input);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.resultFields.metricResultSet.artifactSchemaVersion).toBe("METRIC_RESULT_SET_V2");
    expect(first.resultFields.metricResultSet.recordCount).toBe(String(metricRegistryV2Requests.length));
    expect(first.artifacts.metricResultSetBytes.equals(second.artifacts.metricResultSetBytes)).toBe(true);
    expect(sha256HexV1(first.artifacts.metricResultSetBytes)).toBe(sha256HexV1(second.artifacts.metricResultSetBytes));
    const metricLines = first.artifacts.metricResultSetBytes.toString("utf8").trim().split("\n").map((line) => JSON.parse(line));
    expect(byId(metricLines, "TRADE_COUNT")).toMatchObject({ status: "AVAILABLE", value: "1" });
    expect(byId(metricLines, "REBALANCE_COUNT")).toMatchObject({ status: "AVAILABLE", value: "1" });
  });
});

function valuation(sessionDate: string, nav: string, marketValue: string) {
  const navExact = r(nav);
  return {
    sessionDate,
    cash: "0",
    marketValue,
    marketValueExact: r(marketValue),
    nav,
    navExact,
  };
}

function r(value: string): ExactRationalV1 {
  return value === "0" ? integerToRationalV1(0n) : decimalStringToRationalV1(value);
}

function byId(records: readonly unknown[], metricId: string): Record<string, unknown> {
  return records.find((record) => (record as { metricId?: string }).metricId === metricId) as Record<string, unknown>;
}

function rows(fieldId: string): readonly DatasetSeriesObservationV1[] {
  const values = {
    ADJUSTED_OPEN: ["10", "10", "11", "12", "11"],
    ADJUSTED_HIGH: ["11", "11", "12", "13", "14"],
    ADJUSTED_LOW: ["9", "9", "10", "11", "10"],
    ADJUSTED_CLOSE: ["10", "11", "12", "11", "13"],
    VOLUME: ["1000", "1100", "1200", "1300", "1400"],
  }[fieldId]!;
  return ["2020-01-02", "2020-01-03", "2020-01-06", "2020-01-07", "2020-01-08"].map((date, index) => ({ date, value: values[index]! }));
}

function bytes(fieldId: string): Buffer {
  return canonicalDatasetSeriesMaterialBytesV1(rows(fieldId));
}

function series(fieldId: string): DatasetSeriesHashPayloadV1 {
  const content = bytes(fieldId);
  return {
    schemaVersion: "DATASET_SERIES_HASH_PAYLOAD_V1",
    providerDatasetId: "SYNTRAKE_RL5_TEST_OHLCV",
    providerDatasetVersion: "V20260926",
    instrumentId: "AAA",
    fieldId,
    fieldVersion: fieldId === "VOLUME" ? "POINT_IN_TIME_REPORTED_SESSION_VOLUME_V2" : "SYNTHETIC_ADJUSTED_OHLC_PROVIDER_V2",
    frequency: "DAILY",
    timezone: "America/New_York",
    calendar: "XNYS_TRADING_CALENDAR_V2",
    currency: fieldId === "VOLUME" ? "NONE" : "USD",
    coverageStart: "2020-01-02",
    coverageEnd: "2020-01-08",
    observationCount: "5",
    contentSha256: sha256HexV1(content),
  };
}

function evidenceFixture(metricRequestSet: MetricRequestSetHashPayloadV1) {
  const datasetSeries = ["ADJUSTED_OPEN", "ADJUSTED_HIGH", "ADJUSTED_LOW", "ADJUSTED_CLOSE", "VOLUME"].map((fieldId) => series(fieldId));
  const datasetSnapshot: DatasetSnapshotHashPayloadV1 = {
    schemaVersion: "DATASET_SNAPSHOT_HASH_PAYLOAD_V1",
    snapshotPolicy: "DATASET_SNAPSHOT_POLICY_V1",
    series: datasetSeries.map((payload) => ref("SYNTRAKE:DATASET_SERIES:V1", hashDatasetSeriesV1(payload))),
  };
  const experiment: ExperimentBaselineCandidateV1 = {
    schemaVersion: "EXPERIMENT_BASELINE_CANDIDATE_V1",
    relation: "BASELINE",
    researchSpecRevisionId: "96000000-0000-4000-8000-000000000027",
    researchIr: ref("SYNTRAKE:RESEARCH_IR:V1", hashResearchIrV1(researchIrV2)),
  };
  const runInput: RunInputHashPayloadV1 = {
    schemaVersion: "RUN_INPUT_HASH_PAYLOAD_V1",
    runType: "HISTORICAL_BACKTEST",
    researchEnvironment: "HISTORICAL_BACKTEST",
    researchSourceContext: "PURE_RESEARCH",
    researchSpec: ref("SYNTRAKE:RESEARCH_SPEC:V1", "A".repeat(64)),
    researchIr: ref("SYNTRAKE:RESEARCH_IR:V1", hashResearchIrV1(researchIrV2)),
    experiment: ref("SYNTRAKE:EXPERIMENT:V1", hashExperimentV1(experiment)),
    datasetSnapshot: ref("SYNTRAKE:DATASET_SNAPSHOT:V1", hashDatasetSnapshotV1(datasetSnapshot)),
    engineId: "HISTORICAL_EXECUTION_ADAPTER",
    engineVersion: "ENGINE_V20260926",
    metricRegistryVersion: metricRequestSet.metricRegistryVersion,
    metricRequestSet: ref("SYNTRAKE:METRIC_REQUEST_SET:V1", hashMetricRequestSetV1(metricRequestSet)),
    executionConfig: ref("SYNTRAKE:EXECUTION_CONFIG:V1", hashExecutionConfigV1(executionConfigV2)),
    materialPolicies: [
      { policyId: "DATASET_SNAPSHOT", policyVersion: "DATASET_SNAPSHOT_POLICY_V1" },
      { policyId: "EXECUTION_CONFIG", policyVersion: "EXECUTION_CONFIG_HASH_PAYLOAD_V1" },
    ],
  };
  return { datasetSeries, datasetSnapshot, runInput };
}

function resultPayload(runInput: RunInputHashPayloadV1, metricSchema: "METRIC_RESULT_SET_V1" | "METRIC_RESULT_SET_V2") {
  const bytes = Buffer.from("{}\n", "utf8");
  return {
    schemaVersion: "RESULT_HASH_PAYLOAD_V1",
    runInput: ref("SYNTRAKE:RUN_INPUT:V1", hashRunInputV1(runInput)),
    engineId: "HISTORICAL_EXECUTION_ADAPTER",
    engineVersion: "ENGINE_V20260926",
    executionModelClass: "NEXT_SESSION_ADJUSTED_OHLCV_RESEARCH_V2",
    valuationCurrency: "USD",
    testPeriod: researchIrV2.testPeriod,
    startingNav: "1000",
    endingNav: "1000",
    terminalCash: "1000",
    executionTrace: artifactDescriptorV1("RESEARCH_EXECUTION_TRACE_V2", bytes, 1),
    valuationSeries: artifactDescriptorV1("RESEARCH_VALUATION_SERIES_V2", bytes, 1),
    metricResultSet: artifactDescriptorV1(metricSchema, bytes, 1),
    benchmark: null,
  } as const;
}

function ref(hashDomain: HashRefV1["hashDomain"], hashHex: string): HashRefV1 {
  return hashRefV1({ hashAlgorithm: "SHA-256", hashDomain, hashVersion: "SYNTRAKE_SHA256_V1", hashHex });
}
