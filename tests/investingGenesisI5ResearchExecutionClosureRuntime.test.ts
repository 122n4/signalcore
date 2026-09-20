import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  canonicalDatasetSeriesMaterialBytesV1,
  compareCivilDateV1,
  compareRationalV1,
  divideRationalV1,
  executeHistoricalBacktestV1,
  hashDatasetSeriesV1,
  hashDatasetSnapshotV1,
  hashExecutionConfigV1,
  hashMetricRequestSetV1,
  hashRefV1,
  hashResearchIrV1,
  hashResultV1,
  isXnysSessionV1,
  latestXnysSessionOnOrBeforeV1,
  parseExactDecimalV1,
  previousXnysSessionV1,
  rebalanceSessionsV1,
  reduceRationalV1,
  renderCanonicalDecimalV1,
  renderQuantityOutputV1,
  roundHalfEvenRationalToScaleV1,
  sha256HexV1,
  subtractCalendarMonthsV1,
  truncateRationalToScaleV1,
  verifyDatasetSeriesMaterialV1,
  verifyXnysTradingCalendarArtifactV1,
  xnysTradingCalendarArtifactSha256V1,
  xnysTradingCalendarV1,
  type DatasetSeriesHashPayloadV1,
  type ExecutionConfigHashPayloadV1,
  type MetricRequestSetHashPayloadV1,
  type ResearchIrV1,
  type RunInputHashPayloadV1,
} from "../lib/investing/research";
import { hashRunInputV1 } from "../lib/investing/research/canonical";
import { canonicalResultHashPayloadV1 } from "../lib/investing/research/resultArtifacts";
import { decimalStringToRationalV1, integerToRationalV1 } from "../lib/investing/research/exactRational";

const ref = (hashDomain: Parameters<typeof hashRefV1>[0]["hashDomain"], hashHex: string) =>
  hashRefV1({ hashAlgorithm: "SHA-256", hashDomain, hashVersion: "SYNTRAKE_SHA256_V1", hashHex });

const executionConfig: ExecutionConfigHashPayloadV1 = {
  schemaVersion: "EXECUTION_CONFIG_HASH_PAYLOAD_V1",
  engineCompatibilityVersion: "ENGINE_V20260918",
  missingDataPolicy: "MISSING_DATA_EXCLUDE_V1",
  fxPolicy: "FX_USD_IDENTITY_V1",
  costsPolicy: "COSTS_ZERO_RESEARCH_V1",
  slippagePolicy: "SLIPPAGE_ZERO_RESEARCH_V1",
  fillPolicy: "CLOSE_TO_CLOSE_V1",
  corporateActionPolicy: "ADJUSTED_PRICE_PROVIDER_V1",
  calendarSessionPolicy: "XNYS_CLOSE_SESSION_V1",
  valuationPolicy: "USD_CLOSE_MARK_V1",
};

const metricRequestSet: MetricRequestSetHashPayloadV1 = {
  schemaVersion: "METRIC_REQUEST_SET_HASH_PAYLOAD_V1",
  metricRegistryVersion: "METRIC_REGISTRY_V20260918",
  requests: [
    { metricId: "TOTAL_RETURN", metricVersion: "METRIC_V1" },
    { metricId: "MAX_DRAWDOWN", metricVersion: "METRIC_V1" },
  ],
};

function priceMaterial(instrumentId: string, values: readonly [string, string][]) {
  const bytes = canonicalDatasetSeriesMaterialBytesV1(values.map(([date, value]) => ({ date, value })));
  const series: DatasetSeriesHashPayloadV1 = {
    schemaVersion: "DATASET_SERIES_HASH_PAYLOAD_V1",
    providerDatasetId: "I5_EXECUTION_FIXTURE",
    providerDatasetVersion: "V20260919",
    instrumentId,
    fieldId: "ADJUSTED_CLOSE",
    fieldVersion: "PRICE_FIELD_V1",
    frequency: "DAILY",
    timezone: "America/New_York",
    calendar: "XNYS_TRADING_CALENDAR_V1",
    currency: "USD",
    coverageStart: values[0]![0],
    coverageEnd: values.at(-1)![0],
    observationCount: String(values.length),
    contentSha256: sha256HexV1(bytes),
  };
  return { series, bytes, verified: verifyDatasetSeriesMaterialV1(series, bytes) };
}

function fixture(changed = false) {
  const aaa = priceMaterial("US:AAA", [
    ["2025-01-06", "100"],
    ["2025-01-07", changed ? "104" : "102"],
    ["2025-01-08", "104"],
    ["2025-01-10", "106"],
  ]);
  const bbb = priceMaterial("US:BBB", [
    ["2025-01-06", "100"],
    ["2025-01-07", "100"],
    ["2025-01-08", "100"],
    ["2025-01-10", "100"],
  ]);
  const researchIr: ResearchIrV1 = {
    schemaVersion: "RESEARCH_IR_HASH_PAYLOAD_V1",
    irVersion: "RESEARCH_IR_V1",
    universe: { type: "EXPLICIT_INSTRUMENTS", instrumentIds: ["US:BBB", "US:AAA"] },
    pipeline: [
      {
        type: "FILTER",
        predicate: {
          type: "COMPARE",
          left: { type: "DATA_FIELD_REF", fieldId: "ADJUSTED_CLOSE", fieldVersion: "I5A_RESEARCH_IR_FIELD_CONTRACT_V1" },
          operator: "GT",
          right: { type: "DECIMAL", value: "0", unit: "VALUATION_CURRENCY_PER_INSTRUMENT" },
        },
      },
      { type: "WEIGHT", method: "EQUAL" },
      { type: "REBALANCE", schedule: "DAILY" },
    ],
    benchmark: { type: "BENCHMARK", benchmark: "INSTRUMENT", instrumentId: "US:BBB" },
    testPeriod: { startDate: "2025-01-06", endDate: "2025-01-10" },
    valuationCurrency: "USD",
    startingCapital: { amount: "1000", currency: "USD", origin: "SIMULATED" },
  };
  const datasetSnapshot = {
    schemaVersion: "DATASET_SNAPSHOT_HASH_PAYLOAD_V1" as const,
    snapshotPolicy: "DATASET_SNAPSHOT_POLICY_V1" as const,
    series: [
      ref("SYNTRAKE:DATASET_SERIES:V1", hashDatasetSeriesV1(aaa.series)),
      ref("SYNTRAKE:DATASET_SERIES:V1", hashDatasetSeriesV1(bbb.series)),
    ],
  };
  const runInput: RunInputHashPayloadV1 = {
    schemaVersion: "RUN_INPUT_HASH_PAYLOAD_V1",
    runType: "HISTORICAL_BACKTEST",
    researchEnvironment: "HISTORICAL_BACKTEST",
    researchSourceContext: "PURE_RESEARCH",
    researchSpec: ref("SYNTRAKE:RESEARCH_SPEC:V1", "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"),
    researchIr: ref("SYNTRAKE:RESEARCH_IR:V1", hashResearchIrV1(researchIr)),
    experiment: ref("SYNTRAKE:EXPERIMENT:V1", "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB"),
    datasetSnapshot: ref("SYNTRAKE:DATASET_SNAPSHOT:V1", hashDatasetSnapshotV1(datasetSnapshot)),
    engineId: "HISTORICAL_EXECUTION_ADAPTER",
    engineVersion: "ENGINE_V20260918",
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
    datasetSeries: [aaa.series, bbb.series],
    executionConfig,
    metricRequestSet,
    runInput,
    runInputHash: ref("SYNTRAKE:RUN_INPUT:V1", hashRunInputV1(runInput)),
    materials: [aaa.verified, bbb.verified],
  };
}

describe("I5 Research Execution Closure runtime", () => {
  it("implements exact rational rounding and civil-date helpers", () => {
    expect(renderCanonicalDecimalV1(parseExactDecimalV1("1.2300"))).toBe("1.23");
    expect(() => parseExactDecimalV1("001")).toThrow("INVALID_DECIMAL");
    expect(reduceRationalV1({ numerator: 4n, denominator: 8n })).toEqual({ numerator: 1n, denominator: 2n });
    expect(compareRationalV1({ numerator: 1n, denominator: 3n }, { numerator: 2n, denominator: 6n })).toBe(0);
    expect(renderCanonicalDecimalV1(roundHalfEvenRationalToScaleV1(decimalStringToRationalV1("1.25"), 1))).toBe("1.2");
    expect(renderCanonicalDecimalV1(roundHalfEvenRationalToScaleV1(decimalStringToRationalV1("1.35"), 1))).toBe("1.4");
    expect(renderCanonicalDecimalV1(roundHalfEvenRationalToScaleV1(decimalStringToRationalV1("-1.25"), 1))).toBe("-1.2");
    expect(renderCanonicalDecimalV1(roundHalfEvenRationalToScaleV1({ numerator: 1249n, denominator: 1000n }, 1))).toBe("1.2");
    expect(renderCanonicalDecimalV1(roundHalfEvenRationalToScaleV1({ numerator: 1251n, denominator: 1000n }, 1))).toBe("1.3");
    expect(renderQuantityOutputV1(divideRationalV1(integerToRationalV1(1n), integerToRationalV1(3n)))).toBe("0.33333333");
    expect(renderCanonicalDecimalV1(truncateRationalToScaleV1(decimalStringToRationalV1("-1.239"), 2))).toBe("-1.23");
    expect(subtractCalendarMonthsV1("2024-02-29", 12)).toBe("2023-02-28");
    expect(subtractCalendarMonthsV1("2025-03-31", 1)).toBe("2025-02-28");
    expect(compareCivilDateV1("2025-01-01", "2025-01-02")).toBe(-1);
  });

  it("pins XNYS sessions and special closures", () => {
    verifyXnysTradingCalendarArtifactV1();
    expect(xnysTradingCalendarV1.sessionCount).toBe("11774");
    expect(xnysTradingCalendarArtifactSha256V1).toBe("6279CB8F235222063AB6F766ECC347C1D6F74CD99B4FD8BDFE9EF644F9F880E6");
    for (const closed of ["1985-09-27", "1994-04-27", "2001-09-11", "2001-09-12", "2001-09-13", "2001-09-14", "2004-06-11", "2007-01-02", "2012-10-29", "2012-10-30", "2018-12-05", "2025-01-09"]) {
      expect(isXnysSessionV1(closed)).toBe(false);
    }
    expect(isXnysSessionV1("2001-09-17")).toBe(true);
    expect(isXnysSessionV1("2026-09-18")).toBe(true);
    expect(() => isXnysSessionV1("2026-09-21")).toThrow("CALENDAR_OUT_OF_RANGE");
    expect(previousXnysSessionV1("2025-01-10")).toBe("2025-01-08");
    expect(latestXnysSessionOnOrBeforeV1("2025-01-09")).toBe("2025-01-08");
    expect([...rebalanceSessionsV1(["2025-01-06", "2025-01-07", "2025-01-08", "2025-01-10"], "WEEKLY")]).toEqual(["2025-01-10"]);
  });

  it("verifies canonical dataset material bytes", () => {
    const f = fixture();
    expect(f.datasetSeries[0]!.contentSha256).toBe(sha256HexV1(canonicalDatasetSeriesMaterialBytesV1(f.materials[0]!.observations)));
    const bad = Buffer.from(canonicalDatasetSeriesMaterialBytesV1(f.materials[0]!.observations).toString("utf8").replace("\n", "\r\n"), "utf8");
    expect(() => verifyDatasetSeriesMaterialV1(f.datasetSeries[0]!, bad)).toThrow();
  });

  it("produces deterministic artifacts, no-lookahead fills, metrics, benchmark and Result golden", () => {
    const first = executeHistoricalBacktestV1(fixture());
    const second = executeHistoricalBacktestV1(fixture());
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.artifacts.executionTraceBytes.equals(second.artifacts.executionTraceBytes)).toBe(true);
    expect(first.artifacts.valuationSeriesBytes.equals(second.artifacts.valuationSeriesBytes)).toBe(true);
    expect(first.artifacts.metricResultSetBytes.equals(second.artifacts.metricResultSetBytes)).toBe(true);
    expect(first.artifacts.benchmarkSeriesBytes?.equals(second.artifacts.benchmarkSeriesBytes!)).toBe(true);
    const trace = first.artifacts.executionTraceBytes.toString("utf8").trim().split("\n").map((line) => JSON.parse(line));
    expect(trace.filter((row) => row.type === "FILL" && row.executionSession === "2025-01-06")).toHaveLength(0);
    expect(trace.filter((row) => row.type === "FILL").map((row) => row.executionSession)).toContain("2025-01-07");
    expect(trace[0]).toMatchObject({ type: "EVALUATION", sessionDate: "2025-01-06", evaluationSequence: "0" });
    expect(trace[1]).toMatchObject({ type: "TARGET_INTENT", signalSession: "2025-01-06", requiredExecutionSession: "2025-01-07" });
    const evaluations = new Set(trace.filter((row) => row.type === "EVALUATION").map((row) => row.evaluationSequence));
    const intents = new Set(trace.filter((row) => row.type === "TARGET_INTENT").map((row) => row.sequence));
    for (const row of trace.filter((entry) => entry.type === "TARGET_INTENT")) expect(evaluations.has(row.originatingEvaluationSequence)).toBe(true);
    for (const row of trace.filter((entry) => entry.type === "FILL")) expect(intents.has(row.originatingTargetIntent)).toBe(true);
    const firstFill = trace.find((row) => row.type === "FILL");
    expect(firstFill.cashBefore).toBe("1000");
    expect(firstFill.cashAfter).toBe("500.00000044");
    const valuations = first.artifacts.valuationSeriesBytes.toString("utf8").trim().split("\n").map((line) => JSON.parse(line));
    expect(valuations[0]).toMatchObject({ sessionDate: "2025-01-06", cash: "1000", marketValue: "0", nav: "1000" });
    expect(valuations.at(-1)!.nav).toBe("1019.51357464");
    expect(first.artifacts.metricResultSetBytes.toString("utf8")).toContain("TOTAL_RETURN");
    expect(first.artifacts.benchmarkSeriesBytes?.toString("utf8")).toContain("\"value\":\"1000\"");
    expect(hashResultV1(first.resultPayload)).toBe("C69E7EFBF62897F0AF3BADEAD6D44208868C353EE0D2074783364E05CFEE5815");
    expect(() => canonicalResultHashPayloadV1({ ...first.resultPayload, endingNav: "not-money" } as never)).toThrow("RESULT_MONEY_INVALID");
  });

  it("implements virtual OBSERVATION_DATE and point-in-time derived missingness", () => {
    const base = fixture();
    const observationDateIr: ResearchIrV1 = {
      ...base.researchIr,
      pipeline: [
        {
          type: "FILTER",
          predicate: {
            type: "COMPARE",
            left: { type: "DATA_FIELD_REF", fieldId: "OBSERVATION_DATE", fieldVersion: "I5A_RESEARCH_IR_FIELD_CONTRACT_V1" },
            operator: "GTE",
            right: { type: "DATE", value: "2025-01-07" },
          },
        },
        { type: "WEIGHT", method: "EQUAL" },
        { type: "REBALANCE", schedule: "DAILY" },
      ],
    };
    const runInput = { ...base.runInput, researchIr: ref("SYNTRAKE:RESEARCH_IR:V1", hashResearchIrV1(observationDateIr)) };
    const result = executeHistoricalBacktestV1({ ...base, researchIr: observationDateIr, runInput, runInputHash: ref("SYNTRAKE:RUN_INPUT:V1", hashRunInputV1(runInput)) });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const trace = result.artifacts.executionTraceBytes.toString("utf8");
    const observationDateTrace = trace.trim().split("\n").map((line) => JSON.parse(line));
    expect(observationDateTrace.find((row) => row.type === "EVALUATION" && row.sessionDate === "2025-01-06").eligibleInstrumentSet).toEqual([]);
    expect(observationDateTrace.find((row) => row.type === "EVALUATION" && row.sessionDate === "2025-01-07").eligibleInstrumentSet).toEqual(["US:AAA", "US:BBB"]);

    const totalReturnIr: ResearchIrV1 = {
      ...base.researchIr,
      pipeline: [
        {
          type: "FILTER",
          predicate: {
            type: "COMPARE",
            left: { type: "DATA_FIELD_REF", fieldId: "TOTAL_RETURN", fieldVersion: "I5A_RESEARCH_IR_FIELD_CONTRACT_V1" },
            operator: "GT",
            right: { type: "DECIMAL", value: "0", unit: "RATIO" },
          },
        },
        { type: "WEIGHT", method: "EQUAL" },
        { type: "REBALANCE", schedule: "DAILY" },
      ],
    };
    const totalReturnRunInput = { ...base.runInput, researchIr: ref("SYNTRAKE:RESEARCH_IR:V1", hashResearchIrV1(totalReturnIr)) };
    const totalReturn = executeHistoricalBacktestV1({ ...base, researchIr: totalReturnIr, runInput: totalReturnRunInput, runInputHash: ref("SYNTRAKE:RUN_INPUT:V1", hashRunInputV1(totalReturnRunInput)) });
    expect(totalReturn.ok).toBe(true);
    if (!totalReturn.ok) return;
    const totalTrace = totalReturn.artifacts.executionTraceBytes.toString("utf8").trim().split("\n").map((line) => JSON.parse(line));
    expect(totalTrace.find((row) => row.type === "EVALUATION" && row.sessionDate === "2025-01-06").eligibleInstrumentSet).toEqual([]);
    expect(totalTrace.find((row) => row.type === "EVALUATION" && row.sessionDate === "2025-01-10").eligibleInstrumentSet).toEqual(["US:AAA"]);

    const momentumIr: ResearchIrV1 = {
      ...base.researchIr,
      pipeline: [
        {
          type: "FILTER",
          predicate: {
            type: "COMPARE",
            left: { type: "DATA_FIELD_REF", fieldId: "MOMENTUM_12M", fieldVersion: "I5A_RESEARCH_IR_FIELD_CONTRACT_V1" },
            operator: "GT",
            right: { type: "DECIMAL", value: "0", unit: "RATIO" },
          },
        },
        { type: "WEIGHT", method: "EQUAL" },
        { type: "REBALANCE", schedule: "DAILY" },
      ],
    };
    const momentumRunInput = { ...base.runInput, researchIr: ref("SYNTRAKE:RESEARCH_IR:V1", hashResearchIrV1(momentumIr)) };
    const momentum = executeHistoricalBacktestV1({ ...base, researchIr: momentumIr, runInput: momentumRunInput, runInputHash: ref("SYNTRAKE:RUN_INPUT:V1", hashRunInputV1(momentumRunInput)) });
    expect(momentum.ok).toBe(true);
    if (!momentum.ok) return;
    const momentumTrace = momentum.artifacts.executionTraceBytes.toString("utf8");
    expect(momentumTrace).toContain("\"eligibleInstrumentSet\":[]");
  });

  it("changes Result identity when real material observations and upstream identities change", () => {
    const base = executeHistoricalBacktestV1(fixture());
    const changed = executeHistoricalBacktestV1(fixture(true));
    expect(base.ok && changed.ok).toBe(true);
    if (!base.ok || !changed.ok) return;
    expect(fixture().runInputHash.hashHex).not.toBe(fixture(true).runInputHash.hashHex);
    expect(hashResultV1(base.resultPayload)).not.toBe(hashResultV1(changed.resultPayload));
  });

  it("keeps pure engine modules free of nondeterministic imports and APIs", () => {
    const root = path.resolve(__dirname, "..");
    const files = [
      "lib/investing/research/exactRational.ts",
      "lib/investing/research/civilDate.ts",
      "lib/investing/research/historicalExecutionEngine.ts",
      "lib/investing/research/researchMetrics.ts",
    ];
    for (const file of files) {
      const text = fs.readFileSync(path.join(root, file), "utf8");
      expect(text).not.toMatch(/Date\.now|Math\.random|crypto\.random|fetch\(|process\.env|database|authority|from "node:fs"|from 'node:fs'/);
    }
  });
});
