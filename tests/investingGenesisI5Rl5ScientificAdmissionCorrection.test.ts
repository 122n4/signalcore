import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  admitScientificRunInputV1,
  admitValidationProtocolV1,
  admitValidationRunInputV1,
  canonicalDatasetSeriesMaterialBytesV1,
  executeHistoricalBacktestV1,
  executeHistoricalKernelV2,
  hashDatasetSeriesV1,
  hashDatasetSnapshotV1,
  hashExecutionConfigV1,
  hashExperimentV1,
  hashMetricRequestSetV1,
  hashRefV1,
  hashResearchIrV1,
  hashResearchSpecV1,
  hashValidationProtocolV1,
  sha256HexV1,
  sliceValidationDatasetSeriesPrefixV2,
  verifyDatasetSeriesMaterialV1,
  verifyDatasetSeriesMaterialV2,
  type DatasetSeriesHashPayloadV1,
  type DatasetSeriesObservationV1,
  type DatasetSnapshotHashPayloadV1,
  type ExecutionConfigHashPayloadV1,
  type ExperimentBaselineCandidateV1,
  type HashRefV1,
  type MetricRequestSetHashPayloadV1,
  type ResearchIrV1,
  type RunInputHashPayloadV1,
  type ValidationProtocolHashPayloadV1,
  type ValidationRunInputHashPayloadV1,
} from "@/lib/investing/research";
import { hashRunInputV1 } from "@/lib/investing/research/canonical";
import {
  datasetSeriesV1,
  datasetSnapshotV1,
  executionConfigV1,
  metricRequestSetV1,
  researchSpecV1,
  scientificRunInputCandidateV1,
  secondDatasetSeriesV1,
} from "./support/investingI5DatasetRunScientificFixtures";

const v2Config: ExecutionConfigHashPayloadV1 = {
  schemaVersion: "EXECUTION_CONFIG_HASH_PAYLOAD_V1",
  engineCompatibilityVersion: "ENGINE_V20260926",
  missingDataPolicy: "MISSING_DATA_STRICT_RESEARCH_V2",
  fxPolicy: "FX_USD_IDENTITY_V1",
  costsPolicy: "COMMISSION_FEES_ZERO_V1",
  slippagePolicy: "SLIPPAGE_ZERO_RESEARCH_V1",
  fillPolicy: "NEXT_SESSION_OPEN_V1",
  corporateActionPolicy: "SYNTHETIC_ADJUSTED_OHLC_PROVIDER_V2",
  calendarSessionPolicy: "XNYS_OPEN_CLOSE_SESSION_V2",
  valuationPolicy: "USD_ADJUSTED_CLOSE_MARK_V2",
};

const v2Metrics: MetricRequestSetHashPayloadV1 = {
  schemaVersion: "METRIC_REQUEST_SET_HASH_PAYLOAD_V1",
  metricRegistryVersion: "METRIC_REGISTRY_V20260918",
  requests: [
    { metricId: "TOTAL_RETURN", metricVersion: "METRIC_V1" },
    { metricId: "MAX_DRAWDOWN", metricVersion: "METRIC_V1" },
  ],
};

describe("I5 RL-5 scientific admission correction", () => {
  it("rejects unknown scientific engine versions without a fall-through admission path", () => {
    expect(() => admitScientificRunInputV1(unknownEngineCandidate())).toThrow("UNSUPPORTED_ENGINE");
    expect(() => admitScientificRunInputV1(scientificRunInputCandidateV1())).not.toThrow();
    expect(() => admitScientificRunInputV1(v2Fixture().scientific)).not.toThrow();
  });

  it("rejects V2 Research IR field contracts on V1 RunInput and V1 execution", () => {
    const ir = v1IrWithFieldVersion("I5_RL4_RESEARCH_IR_FIELD_CONTRACT_V2");
    const experiment = experimentFor(ir);
    const runInput = { ...scientificRunInputCandidateV1().runInput, researchIr: ref("SYNTRAKE:RESEARCH_IR:V1", hashResearchIrV1(ir)), experiment: ref("SYNTRAKE:EXPERIMENT:V1", hashExperimentV1(experiment)) };
    expect(() => admitScientificRunInputV1({
      ...scientificRunInputCandidateV1(),
      runInput,
      researchIr: ir,
      experiment,
    })).toThrow("UNSUPPORTED_IR_PROFILE");

    const material = verifyDatasetSeriesMaterialV1(v1PriceSeries(), v1PriceBytes());
    const execution = executeHistoricalBacktestV1({
      runInput,
      runInputHash: ref("SYNTRAKE:RUN_INPUT:V1", hashRunInputV1(runInput)),
      researchIr: ir,
      datasetSeries: [material.series],
      executionConfig: executionConfigV1,
      metricRequestSet: metricRequestSetV1,
      materials: [material],
    });
    expect(execution).toEqual({ ok: false, code: "UNSUPPORTED_IR_PROFILE" });
  });

  it("closes V1/V2 Validation Protocol field and execution-config matrices", () => {
    const v2 = v2Fixture();
    expect(() => admitValidationProtocolV1(protocolCandidate({ ir: { ...v2.ir, pipeline: v2.ir.pipeline.map((op) => op.type === "RANK" ? { ...op, field: { ...op.field, fieldVersion: "I5A_RESEARCH_IR_FIELD_CONTRACT_V1" } } : op) as ResearchIrV1["pipeline"] } }))).toThrow("UNSUPPORTED_V2_FIELD_VERSION");
    expect(() => admitValidationProtocolV1(protocolCandidate({ config: { ...v2Config, fillPolicy: "CLOSE_TO_CLOSE_V1" } }))).toThrow("UNSUPPORTED_EXECUTION_CONFIG");
    expect(() => admitValidationProtocolV1(protocolCandidate({ config: { ...v2Config, corporateActionPolicy: "ADJUSTED_PRICE_PROVIDER_V1" } }))).toThrow("UNSUPPORTED_EXECUTION_CONFIG");
    expect(() => admitValidationProtocolV1(protocolCandidate({ protocol: { ...v2.protocol, boundaryPolicy: "EXACT_XNYS_SESSION_BOUNDARIES_V1" } }))).toThrow("VALIDATION_BOUNDARY_POLICY_UNSUPPORTED");

    const v1Protocol = protocolCandidate({
      engineVersion: "ENGINE_V20260918",
      boundaryPolicy: "EXACT_XNYS_SESSION_BOUNDARIES_V1",
      ir: v1IrWithFieldVersion("I5_RL4_RESEARCH_IR_FIELD_CONTRACT_V2"),
      config: executionConfigV1,
      metrics: metricRequestSetV1,
      sourceSeries: [datasetSeriesV1, secondDatasetSeriesV1],
      sourceSnapshot: datasetSnapshotV1(),
    });
    expect(() => admitValidationProtocolV1(v1Protocol)).toThrow("UNSUPPORTED_IR_PROFILE");
  });

  it("admits complete V2 scientific RunInput before persistence and rejects wrong V2 matrix members", () => {
    const fixture = v2Fixture();
    expect(() => admitScientificRunInputV1(fixture.scientific)).not.toThrow();
    const wrongIr = { ...fixture.ir, pipeline: fixture.ir.pipeline.map((op) => op.type === "RANK" ? { ...op, field: { ...op.field, fieldVersion: "I5A_RESEARCH_IR_FIELD_CONTRACT_V1" } } : op) as ResearchIrV1["pipeline"] };
    const wrongExperiment = experimentFor(wrongIr);
    expect(() => admitScientificRunInputV1({
      ...fixture.scientific,
      runInput: { ...fixture.runInput, researchIr: ref("SYNTRAKE:RESEARCH_IR:V1", hashResearchIrV1(wrongIr)), experiment: ref("SYNTRAKE:EXPERIMENT:V1", hashExperimentV1(wrongExperiment)) },
      researchIr: wrongIr,
      experiment: wrongExperiment,
    })).toThrow("UNSUPPORTED_V2_FIELD_VERSION");
    expect(() => admitScientificRunInputV1(scientificCandidateV2({ config: { ...v2Config, fillPolicy: "CLOSE_TO_CLOSE_V1" } }))).toThrow("UNSUPPORTED_EXECUTION_CONFIG");
    expect(() => admitScientificRunInputV1(scientificCandidateV2({ series: [{ ...fixture.series[0]!, calendar: "XNYS_TRADING_CALENDAR_V1" }, ...fixture.series.slice(1)] }))).toThrow("DATASET_MATERIAL_SCHEMA_INVALID");
  });

  it("rejects duplicate DatasetSeries semantic keys and exact material binding mismatches", () => {
    const fixture = v2Fixture();
    const duplicateClose = { ...seriesV2("ADJUSTED_CLOSE"), contentSha256: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" };
    expect(executeHistoricalKernelV2({ ...fixture.kernel, datasetSeries: [...fixture.series, duplicateClose] })).toEqual({ ok: false, code: "DATASET_MATERIAL_SCHEMA_INVALID" });
    const wrongClose = seriesV2("ADJUSTED_CLOSE", "BBB");
    const wrongCloseMaterial = verifyDatasetSeriesMaterialV2(wrongClose, bytesV2("ADJUSTED_CLOSE"));
    expect(executeHistoricalKernelV2({ ...fixture.kernel, materials: fixture.materials.map((material) => material.series.fieldId === "ADJUSTED_CLOSE" ? wrongCloseMaterial : material) })).toEqual({ ok: false, code: "DATASET_MATERIAL_SCHEMA_INVALID" });
    expect(executeHistoricalKernelV2({ ...fixture.kernel, materials: [...fixture.materials, fixture.materials[0]!] })).toEqual({ ok: false, code: "DATASET_MATERIAL_SCHEMA_INVALID" });
    expect(executeHistoricalKernelV2({ ...fixture.kernel, materials: fixture.materials.slice(1) })).toEqual({ ok: false, code: "DATASET_MATERIAL_SCHEMA_INVALID" });
    const normal = executeHistoricalKernelV2(fixture.kernel);
    const reversed = executeHistoricalKernelV2({ ...fixture.kernel, datasetSeries: [...fixture.series].reverse(), materials: [...fixture.materials].reverse() });
    expect(normal.ok).toBe(true);
    expect(reversed.ok).toBe(true);
    if (normal.ok && reversed.ok) {
      expect(reversed.artifacts.executionTraceBytes.equals(normal.artifacts.executionTraceBytes)).toBe(true);
      expect(reversed.artifacts.valuationSeriesBytes.equals(normal.artifacts.valuationSeriesBytes)).toBe(true);
    }
  });

  it("requires the exact universe OHLCV profile and rejects unrelated instruments", () => {
    const fixture = v2Fixture();
    expect(admitScientificRunInputV1(fixture.scientific).runInputHash.hashDomain).toBe("SYNTRAKE:RUN_INPUT:V1");
    for (const missing of ["ADJUSTED_OPEN", "ADJUSTED_HIGH", "ADJUSTED_LOW", "ADJUSTED_CLOSE"]) {
      expect(() => admitScientificRunInputV1(scientificCandidateV2({
        series: fixture.series.filter((payload) => payload.fieldId !== missing),
      }))).toThrow("DATASET_MATERIAL_SCHEMA_INVALID");
    }
    expect(() => admitScientificRunInputV1(scientificCandidateV2({ includeVolume: false, ir: v2Ir(false) }))).toThrow("VOLUME_POINT_IN_TIME_PROVENANCE_UNAVAILABLE");
    expect(() => admitScientificRunInputV1(scientificCandidateV2({
      series: [...fixture.series, seriesV2("ADJUSTED_CLOSE", "CCC")],
    }))).toThrow("DATASET_MATERIAL_SCHEMA_INVALID");
    expect(() => admitScientificRunInputV1(scientificCandidateV2({
      series: [...fixture.series, { ...seriesV2("ADJUSTED_CLOSE"), providerDatasetId: "SYNTRAKE_RL5_TEST_OHLCV_DUPLICATE" }],
    }))).toThrow("DATASET_MATERIAL_SCHEMA_INVALID");
  });

  it("keeps stable VOLUME provenance while requiring universe VOLUME material", () => {
    expect(() => admitScientificRunInputV1(scientificCandidateV2({ includeVolume: false, ir: v2Ir(true) }))).toThrow("VOLUME_POINT_IN_TIME_PROVENANCE_UNAVAILABLE");
    expect(() => admitScientificRunInputV1(scientificCandidateV2({ seriesPatch: (payload) => payload.fieldId === "VOLUME" ? { ...payload, providerDatasetId: "UNKNOWN_PROVIDER" } : payload, ir: v2Ir(true) }))).toThrow("VOLUME_POINT_IN_TIME_PROVENANCE_UNAVAILABLE");
    expect(() => admitScientificRunInputV1(scientificCandidateV2({ ir: v2Ir(true) }))).not.toThrow();
  });

  it("admits only benchmark-close material for a benchmark outside the universe", () => {
    const ir = v2Ir(false, "BENCH");
    const exact = v2Fixture({ ir, series: [...v2Fixture({ ir }).series, seriesV2("ADJUSTED_CLOSE", "BENCH")] });
    expect(() => admitScientificRunInputV1(exact.scientific)).not.toThrow();
    expect(() => admitScientificRunInputV1(scientificCandidateV2({ ir }))).toThrow("DATASET_MATERIAL_SCHEMA_INVALID");
    for (const fieldId of ["ADJUSTED_OPEN", "ADJUSTED_HIGH", "ADJUSTED_LOW", "VOLUME"]) {
      expect(() => admitScientificRunInputV1(scientificCandidateV2({
        ir,
        series: [...exact.series, seriesV2(fieldId, "BENCH")],
      }))).toThrow("DATASET_MATERIAL_SCHEMA_INVALID");
    }
    expect(() => admitScientificRunInputV1(scientificCandidateV2({ ir: { ...v2Ir(false), benchmark: { type: "BENCHMARK", benchmark: "NONE" } } }))).not.toThrow();
  });

  it("enforces exact DatasetSnapshot membership and Validation V2 source material scope", () => {
    const fixture = v2Fixture();
    const snapshot = snapshotFor([...fixture.series, seriesV2("ADJUSTED_CLOSE", "CCC")]);
    expect(() => admitScientificRunInputV1({
      ...fixture.scientific,
      runInput: {
        ...fixture.runInput,
        datasetSnapshot: ref("SYNTRAKE:DATASET_SNAPSHOT:V1", hashDatasetSnapshotV1(snapshot)),
      },
      datasetSnapshot: snapshot,
    })).toThrow("DatasetSnapshot DatasetSeries proof mismatch");

    const sourceSeries = [...fixture.series, seriesV2("ADJUSTED_CLOSE", "CCC")];
    const candidate = protocolCandidate({ sourceSeries });
    const sourceMaterials = sourceSeries.map((payload) => canonicalDatasetSeriesMaterialBytesV1(observationsV2(payload.fieldId)));
    const phaseSeries = sourceSeries.map((payload, index) => sliceValidationDatasetSeriesPrefixV2(payload, sourceMaterials[index]!, candidate.protocol.folds[0]!.trainingWindow.endDate).series);
    const phaseSnapshot = snapshotFor(phaseSeries);
    const phaseResearchIr = { ...candidate.subjectResearchIrPayload, testPeriod: candidate.protocol.folds[0]!.trainingWindow };
    const validationRunInput = {
      ...validationRunInputFor(candidate),
      phaseResearchIr: ref("SYNTRAKE:RESEARCH_IR:V1", hashResearchIrV1(phaseResearchIr)),
      phaseDatasetSnapshot: ref("SYNTRAKE:DATASET_SNAPSHOT:V1", hashDatasetSnapshotV1(phaseSnapshot)),
    };
    expect(() => admitValidationRunInputV1({
      validationProtocolCandidate: candidate,
      validationRunInput,
      phaseResearchIrPayload: phaseResearchIr,
      phaseDatasetSeriesPayloads: phaseSeries,
      phaseDatasetSnapshotPayload: phaseSnapshot,
      sourceDatasetSeriesPayloads: sourceSeries,
      sourceMaterials,
    })).toThrow("DATASET_MATERIAL_SCHEMA_INVALID");
  });

  it("rejects invalid V2 Validation RunInput before child execution can be admitted", () => {
    const candidate = protocolCandidate({ config: { ...v2Config, fillPolicy: "CLOSE_TO_CLOSE_V1" } });
    expect(() => admitValidationRunInputV1({
      validationProtocolCandidate: candidate,
      validationRunInput: validationRunInputFor(candidate),
      phaseResearchIrPayload: candidate.subjectResearchIrPayload,
      phaseDatasetSeriesPayloads: (candidate.sourceDatasetSnapshotPayload.series.map((entry) => v2Fixture().series.find((payload) => hashDatasetSeriesV1(payload) === entry.hashHex)!)),
      phaseDatasetSnapshotPayload: candidate.sourceDatasetSnapshotPayload,
      sourceDatasetSeriesPayloads: v2Fixture().series,
      sourceMaterials: v2Fixture().materials.map((material) => canonicalDatasetSeriesMaterialBytesV1(material.observations)),
    })).toThrow("UNSUPPORTED_EXECUTION_CONFIG");
  });

  it("guards the V2 calendar generator against library version drift", () => {
    const script = readFileSync("scripts/investing/generateXnysCalendarV2.py", "utf8");
    expect(script).toContain('EXPECTED_EXCHANGE_CALENDARS_VERSION = "4.11.1"');
    expect(script).toContain('EXPECTED_PANDAS_MARKET_CALENDARS_VERSION = "5.1.1"');
    expect(script).toContain("exchange_calendars.__version__ != EXPECTED_EXCHANGE_CALENDARS_VERSION");
    expect(script).toContain("pandas_market_calendars.__version__ != EXPECTED_PANDAS_MARKET_CALENDARS_VERSION");
  });
});

function scientificCandidateV2(options: { config?: ExecutionConfigHashPayloadV1; series?: readonly DatasetSeriesHashPayloadV1[]; seriesPatch?: (payload: DatasetSeriesHashPayloadV1) => DatasetSeriesHashPayloadV1; ir?: ResearchIrV1; includeVolume?: boolean } = {}) {
  const fixture = v2Fixture(options);
  return fixture.scientific;
}

function v2Fixture(options: { config?: ExecutionConfigHashPayloadV1; series?: readonly DatasetSeriesHashPayloadV1[]; seriesPatch?: (payload: DatasetSeriesHashPayloadV1) => DatasetSeriesHashPayloadV1; ir?: ResearchIrV1; includeVolume?: boolean } = {}) {
  const ir = options.ir ?? v2Ir(false);
  const config = options.config ?? v2Config;
  const series = (options.series ?? ["ADJUSTED_OPEN", "ADJUSTED_HIGH", "ADJUSTED_LOW", "ADJUSTED_CLOSE", ...(options.includeVolume === false ? [] : ["VOLUME"])].map((fieldId) => seriesV2(fieldId))).map((payload) => options.seriesPatch?.(payload) ?? payload);
  const snapshot = snapshotFor(series);
  const experiment = experimentFor(ir);
  const runInput = runInputV2(ir, experiment, snapshot, config);
  const materials = series.every((payload) => payload.providerDatasetId === "SYNTRAKE_RL5_TEST_OHLCV" && payload.providerDatasetVersion === "V20260926")
    ? series.map((payload) => verifyDatasetSeriesMaterialV2(payload, bytesV2(payload.fieldId)))
    : [];
  const scientific = { runInput, researchSpec: researchSpecV1(), researchIr: ir, experiment, datasetSeries: series, datasetSnapshot: snapshot, metricRequestSet: v2Metrics, executionConfig: config };
  return { ir, series, snapshot, experiment, runInput, materials, scientific, protocol: protocolFor(ir, snapshot, config), kernel: { researchIr: ir, datasetSeries: series, executionConfig: config, metricRequestSet: v2Metrics, materials } };
}

function v2Ir(volume: boolean, benchmarkInstrumentId = "AAA"): ResearchIrV1 {
  return {
    schemaVersion: "RESEARCH_IR_HASH_PAYLOAD_V1",
    irVersion: "RESEARCH_IR_V1",
    universe: { type: "EXPLICIT_INSTRUMENTS", instrumentIds: ["AAA"] },
    pipeline: [
      ...(volume ? [{ type: "FILTER" as const, predicate: { type: "COMPARE" as const, left: field("VOLUME"), operator: "GT" as const, right: { type: "INTEGER" as const, value: "0", unit: "SHARES" as const } } }] : []),
      { type: "RANK", field: field("TOTAL_RETURN"), direction: "DESC", missingPolicy: "LAST" },
      { type: "WEIGHT", method: "FIXED_TARGETS", targets: [{ instrumentId: "AAA", weight: "1" }] },
      { type: "REBALANCE", schedule: "DAILY" },
    ],
    benchmark: { type: "BENCHMARK", benchmark: "INSTRUMENT", instrumentId: benchmarkInstrumentId },
    testPeriod: { startDate: "2020-01-02", endDate: "2020-01-06" },
    valuationCurrency: "USD",
    startingCapital: { amount: "1000", currency: "USD", origin: "SIMULATED" },
  };
}

function field(fieldId: "TOTAL_RETURN" | "VOLUME") {
  return { type: "DATA_FIELD_REF" as const, fieldId, fieldVersion: "I5_RL4_RESEARCH_IR_FIELD_CONTRACT_V2" as const };
}

function seriesV2(fieldId: string, instrumentId = "AAA"): DatasetSeriesHashPayloadV1 {
  const rows = observationsV2(fieldId);
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
    contentSha256: sha256HexV1(bytesV2(fieldId)),
  };
}

function observationsV2(fieldId: string): readonly DatasetSeriesObservationV1[] {
  if (fieldId === "ADJUSTED_OPEN") return [{ date: "2020-01-02", value: "10" }, { date: "2020-01-03", value: "10" }, { date: "2020-01-06", value: "11" }];
  if (fieldId === "ADJUSTED_HIGH") return [{ date: "2020-01-02", value: "11" }, { date: "2020-01-03", value: "11" }, { date: "2020-01-06", value: "12" }];
  if (fieldId === "ADJUSTED_LOW") return [{ date: "2020-01-02", value: "9" }, { date: "2020-01-03", value: "9" }, { date: "2020-01-06", value: "10" }];
  if (fieldId === "ADJUSTED_CLOSE") return [{ date: "2020-01-02", value: "10" }, { date: "2020-01-03", value: "11" }, { date: "2020-01-06", value: "12" }];
  return [{ date: "2020-01-02", value: "1000" }, { date: "2020-01-03", value: "1100" }, { date: "2020-01-06", value: "1200" }];
}

function bytesV2(fieldId: string): Buffer {
  return canonicalDatasetSeriesMaterialBytesV1(observationsV2(fieldId));
}

function snapshotFor(series: readonly DatasetSeriesHashPayloadV1[]): DatasetSnapshotHashPayloadV1 {
  return { schemaVersion: "DATASET_SNAPSHOT_HASH_PAYLOAD_V1", snapshotPolicy: "DATASET_SNAPSHOT_POLICY_V1", series: series.map((payload) => ref("SYNTRAKE:DATASET_SERIES:V1", hashDatasetSeriesV1(payload))) };
}

function runInputV2(ir: ResearchIrV1, experiment: ExperimentBaselineCandidateV1, snapshot: DatasetSnapshotHashPayloadV1, config: ExecutionConfigHashPayloadV1): RunInputHashPayloadV1 {
  return {
    schemaVersion: "RUN_INPUT_HASH_PAYLOAD_V1",
    runType: "HISTORICAL_BACKTEST",
    researchEnvironment: "HISTORICAL_BACKTEST",
    researchSourceContext: "PURE_RESEARCH",
    researchSpec: ref("SYNTRAKE:RESEARCH_SPEC:V1", hashResearchSpecV1(researchSpecV1())),
    researchIr: ref("SYNTRAKE:RESEARCH_IR:V1", hashResearchIrV1(ir)),
    experiment: ref("SYNTRAKE:EXPERIMENT:V1", hashExperimentV1(experiment)),
    datasetSnapshot: ref("SYNTRAKE:DATASET_SNAPSHOT:V1", hashDatasetSnapshotV1(snapshot)),
    engineId: "HISTORICAL_EXECUTION_ADAPTER",
    engineVersion: "ENGINE_V20260926",
    metricRegistryVersion: "METRIC_REGISTRY_V20260918",
    metricRequestSet: ref("SYNTRAKE:METRIC_REQUEST_SET:V1", hashMetricRequestSetV1(v2Metrics)),
    executionConfig: ref("SYNTRAKE:EXECUTION_CONFIG:V1", hashExecutionConfigV1(config)),
    materialPolicies: [
      { policyId: "DATASET_SNAPSHOT", policyVersion: "DATASET_SNAPSHOT_POLICY_V1" },
      { policyId: "EXECUTION_CONFIG", policyVersion: "EXECUTION_CONFIG_HASH_PAYLOAD_V1" },
    ],
  };
}

function unknownEngineCandidate() {
  const fixture = v2Fixture();
  const config = { ...fixture.scientific.executionConfig, engineCompatibilityVersion: "ENGINE_UNKNOWN" } as ExecutionConfigHashPayloadV1;
  const runInput = {
    ...fixture.runInput,
    engineVersion: "ENGINE_UNKNOWN",
    executionConfig: ref("SYNTRAKE:EXECUTION_CONFIG:V1", hashExecutionConfigV1(config)),
  } as RunInputHashPayloadV1;
  return { ...fixture.scientific, runInput, executionConfig: config };
}

function protocolFor(ir: ResearchIrV1, snapshot: DatasetSnapshotHashPayloadV1, config: ExecutionConfigHashPayloadV1): ValidationProtocolHashPayloadV1 {
  const experiment = experimentFor(ir);
  return {
    schemaVersion: "VALIDATION_PROTOCOL_HASH_PAYLOAD_V1",
    methodology: "VALIDATION_METHODOLOGY_V1",
    boundaryPolicy: "EXACT_XNYS_SESSION_BOUNDARIES_V2",
    missingDataSemantics: "INHERIT_EXECUTION_CONFIG_EXACT_V1",
    sourceMaterialPolicy: "PREFIX_TO_PHASE_END_NO_FUTURE_DATA_V1",
    subjectExperiment: ref("SYNTRAKE:EXPERIMENT:V1", hashExperimentV1(experiment)),
    subjectResearchIr: ref("SYNTRAKE:RESEARCH_IR:V1", hashResearchIrV1(ir)),
    sourceDatasetSnapshot: ref("SYNTRAKE:DATASET_SNAPSHOT:V1", hashDatasetSnapshotV1(snapshot)),
    engineId: "HISTORICAL_EXECUTION_ADAPTER",
    engineVersion: "ENGINE_V20260926",
    metricRegistryVersion: "METRIC_REGISTRY_V20260918",
    metricRequestSet: ref("SYNTRAKE:METRIC_REQUEST_SET:V1", hashMetricRequestSetV1(v2Metrics)),
    executionConfig: ref("SYNTRAKE:EXECUTION_CONFIG:V1", hashExecutionConfigV1(config)),
    validationMode: "CHRONOLOGICAL_HOLDOUT",
    folds: [{ ordinal: "0", trainingWindow: { startDate: "2020-01-02", endDate: "2020-01-03" }, evaluationWindow: { startDate: "2020-01-06", endDate: "2020-01-06" } }],
  };
}

function protocolCandidate(options: { protocol?: ValidationProtocolHashPayloadV1; engineVersion?: "ENGINE_V20260918" | "ENGINE_V20260926"; boundaryPolicy?: "EXACT_XNYS_SESSION_BOUNDARIES_V1" | "EXACT_XNYS_SESSION_BOUNDARIES_V2"; ir?: ResearchIrV1; config?: ExecutionConfigHashPayloadV1; metrics?: MetricRequestSetHashPayloadV1; sourceSeries?: readonly DatasetSeriesHashPayloadV1[]; sourceSnapshot?: DatasetSnapshotHashPayloadV1 } = {}) {
  const ir = options.ir ?? v2Ir(false);
  const config = options.config ?? v2Config;
  const metrics = options.metrics ?? v2Metrics;
  const sourceSnapshot = options.sourceSnapshot ?? snapshotFor(options.sourceSeries ?? v2Fixture().series);
  const experiment = experimentFor(ir);
  const protocol = options.protocol ?? {
    ...protocolFor(ir, sourceSnapshot, config),
    engineVersion: options.engineVersion ?? "ENGINE_V20260926",
    boundaryPolicy: options.boundaryPolicy ?? "EXACT_XNYS_SESSION_BOUNDARIES_V2",
    metricRequestSet: ref("SYNTRAKE:METRIC_REQUEST_SET:V1", hashMetricRequestSetV1(metrics)),
    executionConfig: ref("SYNTRAKE:EXECUTION_CONFIG:V1", hashExecutionConfigV1(config)),
  };
  return { protocol, subjectExperimentCandidate: experiment, subjectResearchIrPayload: ir, sourceDatasetSnapshotPayload: sourceSnapshot, metricRequestSetPayload: metrics, executionConfigPayload: config };
}

function validationRunInputFor(candidate: ReturnType<typeof protocolCandidate>): ValidationRunInputHashPayloadV1 {
  return {
    schemaVersion: "VALIDATION_RUN_INPUT_HASH_PAYLOAD_V1",
    validationProtocol: ref("SYNTRAKE:VALIDATION_PROTOCOL:V1", hashValidationProtocolV1(candidate.protocol)),
    subjectExperiment: candidate.protocol.subjectExperiment,
    subjectResearchIr: candidate.protocol.subjectResearchIr,
    phaseResearchIr: candidate.protocol.subjectResearchIr,
    sourceDatasetSnapshot: candidate.protocol.sourceDatasetSnapshot,
    phaseDatasetSnapshot: candidate.protocol.sourceDatasetSnapshot,
    foldOrdinal: "0",
    phase: "TRAINING",
    phaseWindow: candidate.protocol.folds[0]!.trainingWindow,
    engineId: candidate.protocol.engineId,
    engineVersion: candidate.protocol.engineVersion,
    metricRegistryVersion: candidate.protocol.metricRegistryVersion,
    metricRequestSet: candidate.protocol.metricRequestSet,
    executionConfig: candidate.protocol.executionConfig,
  };
}

function v1IrWithFieldVersion(fieldVersion: "I5A_RESEARCH_IR_FIELD_CONTRACT_V1" | "I5_RL4_RESEARCH_IR_FIELD_CONTRACT_V2"): ResearchIrV1 {
  return {
    schemaVersion: "RESEARCH_IR_HASH_PAYLOAD_V1",
    irVersion: "RESEARCH_IR_V1",
    universe: { type: "EXPLICIT_INSTRUMENTS", instrumentIds: ["US:AAPL"] },
    pipeline: [
      { type: "RANK", field: { type: "DATA_FIELD_REF", fieldId: "TOTAL_RETURN", fieldVersion }, direction: "DESC", missingPolicy: "LAST" },
      { type: "WEIGHT", method: "FIXED_TARGETS", targets: [{ instrumentId: "US:AAPL", weight: "1" }] },
      { type: "REBALANCE", schedule: "DAILY" },
    ],
    benchmark: { type: "BENCHMARK", benchmark: "NONE" },
    testPeriod: { startDate: "2020-01-31", endDate: "2020-02-03" },
    valuationCurrency: "USD",
    startingCapital: { amount: "1000", currency: "USD", origin: "SIMULATED" },
  };
}

function v1PriceRows(): readonly DatasetSeriesObservationV1[] {
  return [{ date: "2020-01-31", value: "100" }, { date: "2020-02-03", value: "101" }];
}

function v1PriceBytes(): Buffer {
  return canonicalDatasetSeriesMaterialBytesV1(v1PriceRows());
}

function v1PriceSeries(): DatasetSeriesHashPayloadV1 {
  return { ...datasetSeriesV1, instrumentId: "US:AAPL", coverageStart: "2020-01-31", coverageEnd: "2020-02-03", observationCount: "2", contentSha256: sha256HexV1(v1PriceBytes()) };
}

function experimentFor(ir: ResearchIrV1): ExperimentBaselineCandidateV1 {
  return { schemaVersion: "EXPERIMENT_BASELINE_CANDIDATE_V1", relation: "BASELINE", researchSpecRevisionId: "93000000-0000-4000-8000-000000000026", researchIr: ref("SYNTRAKE:RESEARCH_IR:V1", hashResearchIrV1(ir)) };
}

function ref(hashDomain: HashRefV1["hashDomain"], hashHex: string): HashRefV1 {
  return hashRefV1({ hashAlgorithm: "SHA-256", hashDomain, hashVersion: "SYNTRAKE_SHA256_V1", hashHex });
}
