import { describe, expect, it } from "vitest";
import {
  assertEngineV2MetricRequestSet,
  canonicalDatasetSeriesMaterialBytesV1,
  executeHistoricalKernelV2,
  metricRegistryV2Requests,
  metricRegistryVersionV2,
  metricResultRecordsV2,
  sha256HexV1,
  verifyDatasetSeriesMaterialV2,
  type DatasetSeriesHashPayloadV1,
  type DatasetSeriesObservationV1,
  type ExecutionConfigHashPayloadV1,
  type MetricRequestSetHashPayloadV1,
  type ResearchIrV1,
} from "@/lib/investing/research";
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
    for (const id of ["CAGR", "ANNUALIZED_VOLATILITY", "DOWNSIDE_DEVIATION", "SHARPE_RATIO", "SORTINO_RATIO", "CALMAR_RATIO", "TURNOVER", "AVERAGE_GROSS_EXPOSURE", "TRACKING_ERROR"]) {
      expect(byId(records, id)).toMatchObject({ status: "AVAILABLE" });
      expect(String(byId(records, id).value)).toMatch(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/u);
    }
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
    expect(() => metricResultRecordsV2({
      valuations: flat,
      fills: [],
      benchmark: [
        { sessionDate: "2020-01-02", valueExact: r("1000") },
        { sessionDate: "2020-01-07", valueExact: r("1000") },
        { sessionDate: "2020-01-06", valueExact: r("1000") },
      ],
    })).toThrow("BENCHMARK_MISALIGNED");
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
