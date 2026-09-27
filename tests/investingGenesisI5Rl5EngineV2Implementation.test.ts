import { describe, expect, it } from "vitest";
import {
  artifactDescriptorV1,
  canonicalDatasetSeriesMaterialBytesV1,
  canonicalResultHashPayloadV1,
  admitValidationProtocolV1,
  admitValidationRunInputV1,
  deriveValidationPhaseResearchIrV2,
  engineV2ProviderProfiles,
  executeHistoricalKernelV2,
  executeValidationChildBacktestV1,
  hashDatasetSeriesV1,
  hashDatasetSnapshotV1,
  hashExecutionConfigV1,
  hashExperimentV1,
  hashMetricRequestSetV1,
  isXnysSessionV2,
  sha256HexV1,
  hashResearchIrV1,
  hashValidationProtocolV1,
  sliceValidationDatasetSeriesPrefixV2,
  verifyDatasetSeriesMaterialV2,
  verifyXnysTradingCalendarArtifactV2,
  xnysTradingCalendarArtifactSha256V2,
  xnysTradingCalendarV2,
  type DatasetSeriesHashPayloadV1,
  type DatasetSeriesObservationV1,
  type DatasetSnapshotHashPayloadV1,
  type ExecutionConfigHashPayloadV1,
  type ExperimentBaselineCandidateV1,
  type HashRefV1,
  type MetricRequestSetHashPayloadV1,
  type ResearchIrV1,
  type ValidationProtocolHashPayloadV1,
  type ValidationRunInputHashPayloadV1,
} from "@/lib/investing/research";

const executionConfigV2: ExecutionConfigHashPayloadV1 = {
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

const metricRequestSetV2: MetricRequestSetHashPayloadV1 = {
  schemaVersion: "METRIC_REQUEST_SET_HASH_PAYLOAD_V1",
  metricRegistryVersion: "METRIC_REGISTRY_V20260918",
  requests: [
    { metricId: "TOTAL_RETURN", metricVersion: "METRIC_V1" },
    { metricId: "MAX_DRAWDOWN", metricVersion: "METRIC_V1" },
  ],
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
  testPeriod: { startDate: "2020-01-02", endDate: "2020-01-06" },
  valuationCurrency: "USD",
  startingCapital: { amount: "1000", currency: "USD", origin: "SIMULATED" },
};

describe("I5 RL-5 Engine V2 implementation closure", () => {
  it("pins XNYS_TRADING_CALENDAR_V2 and preserves overlap with V1", () => {
    verifyXnysTradingCalendarArtifactV2();
    expect(xnysTradingCalendarV2.coverageStart).toBe("1980-01-01");
    expect(xnysTradingCalendarV2.coverageEnd).toBe("2035-12-31");
    expect(xnysTradingCalendarV2.sessionListSha256).toBe("3F69B45605C1E64B8ABF5CAA2E76B5E2B8CAD7CF3C7DCF6A0D985E2D3A74F8BB");
    expect(xnysTradingCalendarArtifactSha256V2).toBe("071433C0BCC4D72960DEEBBFC5678E5635E41B2B48319E05658D9715CA3F8578");
    expect(isXnysSessionV2("2020-01-02")).toBe(true);
  });

  it("registers only the deterministic RL-5 test fixture provider profile", () => {
    expect(engineV2ProviderProfiles).toEqual([
      expect.objectContaining({
        providerDatasetId: "SYNTRAKE_RL5_TEST_OHLCV",
        providerDatasetVersion: "V20260926",
        fixture: true,
        volumePointInTimeSafe: true,
      }),
    ]);
  });

  it("executes a deterministic next-session OPEN V2 fixture", () => {
    const materials = ["ADJUSTED_OPEN", "ADJUSTED_HIGH", "ADJUSTED_LOW", "ADJUSTED_CLOSE", "VOLUME"].map((fieldId) =>
      verifyDatasetSeriesMaterialV2(series(fieldId), bytes(fieldId)));
    const result = executeHistoricalKernelV2({
      researchIr: researchIrV2,
      datasetSeries: materials.map((material) => material.series),
      executionConfig: executionConfigV2,
      metricRequestSet: metricRequestSetV2,
      materials,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.resultFields.engineVersion).toBe("ENGINE_V20260926");
    expect(result.resultFields.executionModelClass).toBe("NEXT_SESSION_ADJUSTED_OHLCV_RESEARCH_V2");
    expect(result.resultFields.executionTrace.artifactSchemaVersion).toBe("RESEARCH_EXECUTION_TRACE_V2");
    expect(result.resultFields.valuationSeries.artifactSchemaVersion).toBe("RESEARCH_VALUATION_SERIES_V2");
    expect(result.resultFields.benchmark?.artifactSchemaVersion).toBe("RESEARCH_BENCHMARK_SERIES_V2");
    const trace = result.artifacts.executionTraceBytes.toString("utf8");
    expect(trace).toContain("\"executionSession\":\"2020-01-03\"");
    expect(trace).toContain("\"referenceOpen\":\"10\"");
    expect(trace).toContain("\"effectiveFillPrice\":\"10\"");
    expect(trace).not.toContain("2020-01-06T");
  });

  it("rejects Result cross-version artifact mixtures under SYNTRAKE:RESULT:V1", () => {
    const bytes = Buffer.from("{}\n", "utf8");
    expect(() => canonicalResultHashPayloadV1({
      schemaVersion: "RESULT_HASH_PAYLOAD_V1",
      runInput: ref("SYNTRAKE:RUN_INPUT:V1"),
      engineId: "HISTORICAL_EXECUTION_ADAPTER",
      engineVersion: "ENGINE_V20260926",
      executionModelClass: "NEXT_SESSION_ADJUSTED_OHLCV_RESEARCH_V2",
      valuationCurrency: "USD",
      testPeriod: { startDate: "2020-01-02", endDate: "2020-01-06" },
      startingNav: "1000",
      endingNav: "1000",
      terminalCash: "0",
      executionTrace: artifactDescriptorV1("RESEARCH_EXECUTION_TRACE_V1", bytes, 1),
      valuationSeries: artifactDescriptorV1("RESEARCH_VALUATION_SERIES_V2", bytes, 1),
      metricResultSet: artifactDescriptorV1("METRIC_RESULT_SET_V1", bytes, 1),
      benchmark: null,
    })).toThrow("RESULT_ARTIFACT_DESCRIPTOR_SCHEMA_INVALID");
  });

  it("rejects OHLC invariant violations", () => {
    expect(() => verifyDatasetSeriesMaterialV2(
      series("ADJUSTED_HIGH", [{ date: "2020-01-02", value: "9" }]),
      bytes("ADJUSTED_HIGH", [{ date: "2020-01-02", value: "9" }]),
    )).not.toThrow();
    const materials = [
      verifyDatasetSeriesMaterialV2(series("ADJUSTED_OPEN", [{ date: "2020-01-02", value: "10" }]), bytes("ADJUSTED_OPEN", [{ date: "2020-01-02", value: "10" }])),
      verifyDatasetSeriesMaterialV2(series("ADJUSTED_HIGH", [{ date: "2020-01-02", value: "9" }]), bytes("ADJUSTED_HIGH", [{ date: "2020-01-02", value: "9" }])),
      verifyDatasetSeriesMaterialV2(series("ADJUSTED_LOW", [{ date: "2020-01-02", value: "8" }]), bytes("ADJUSTED_LOW", [{ date: "2020-01-02", value: "8" }])),
      verifyDatasetSeriesMaterialV2(series("ADJUSTED_CLOSE", [{ date: "2020-01-02", value: "10" }]), bytes("ADJUSTED_CLOSE", [{ date: "2020-01-02", value: "10" }])),
      verifyDatasetSeriesMaterialV2(series("VOLUME", [{ date: "2020-01-02", value: "1000" }]), bytes("VOLUME", [{ date: "2020-01-02", value: "1000" }])),
    ];
    const result = executeHistoricalKernelV2({
      researchIr: researchIrV2,
      datasetSeries: materials.map((material) => material.series),
      executionConfig: executionConfigV2,
      metricRequestSet: metricRequestSetV2,
      materials,
    });
    expect(result).toEqual({ ok: false, code: "OHLC_INVARIANT_VIOLATION" });
  });

  it("admits V2 Validation and dispatches child execution to the same V2 kernel without future material", () => {
    const sourceRows = {
      ADJUSTED_OPEN: [...observations("ADJUSTED_OPEN"), { date: "2020-01-07", value: "12" }],
      ADJUSTED_HIGH: [...observations("ADJUSTED_HIGH"), { date: "2020-01-07", value: "13" }],
      ADJUSTED_LOW: [...observations("ADJUSTED_LOW"), { date: "2020-01-07", value: "11" }],
      ADJUSTED_CLOSE: [...observations("ADJUSTED_CLOSE"), { date: "2020-01-07", value: "13" }],
      VOLUME: [...observations("VOLUME"), { date: "2020-01-07", value: "1300" }],
    } satisfies Record<string, readonly DatasetSeriesObservationV1[]>;
    const sourceSeries = Object.entries(sourceRows).map(([fieldId, rows]) => series(fieldId, rows));
    const sourceBuffers = Object.entries(sourceRows).map(([fieldId, rows]) => bytes(fieldId, rows));
    const sourceSnapshot = snapshotFor(sourceSeries);
    const subjectExperiment = experimentFor(researchIrV2);
    const protocol: ValidationProtocolHashPayloadV1 = {
      schemaVersion: "VALIDATION_PROTOCOL_HASH_PAYLOAD_V1",
      methodology: "VALIDATION_METHODOLOGY_V1",
      boundaryPolicy: "EXACT_XNYS_SESSION_BOUNDARIES_V2",
      missingDataSemantics: "INHERIT_EXECUTION_CONFIG_EXACT_V1",
      sourceMaterialPolicy: "PREFIX_TO_PHASE_END_NO_FUTURE_DATA_V1",
      subjectExperiment: ref("SYNTRAKE:EXPERIMENT:V1", hashExperimentV1(subjectExperiment)),
      subjectResearchIr: ref("SYNTRAKE:RESEARCH_IR:V1", hashResearchIrV1(researchIrV2)),
      sourceDatasetSnapshot: ref("SYNTRAKE:DATASET_SNAPSHOT:V1", hashDatasetSnapshotV1(sourceSnapshot)),
      engineId: "HISTORICAL_EXECUTION_ADAPTER",
      engineVersion: "ENGINE_V20260926",
      metricRegistryVersion: "METRIC_REGISTRY_V20260918",
      metricRequestSet: ref("SYNTRAKE:METRIC_REQUEST_SET:V1", hashMetricRequestSetV1(metricRequestSetV2)),
      executionConfig: ref("SYNTRAKE:EXECUTION_CONFIG:V1", hashExecutionConfigV1(executionConfigV2)),
      validationMode: "CHRONOLOGICAL_HOLDOUT",
      folds: [{ ordinal: "0", trainingWindow: { startDate: "2020-01-02", endDate: "2020-01-03" }, evaluationWindow: { startDate: "2020-01-06", endDate: "2020-01-07" } }],
    };
    expect(() => admitValidationProtocolV1({
      protocol: { ...protocol, boundaryPolicy: "EXACT_XNYS_SESSION_BOUNDARIES_V1" },
      subjectExperimentCandidate: subjectExperiment,
      subjectResearchIrPayload: researchIrV2,
      sourceDatasetSnapshotPayload: sourceSnapshot,
      metricRequestSetPayload: metricRequestSetV2,
      executionConfigPayload: executionConfigV2,
    })).toThrow("VALIDATION_BOUNDARY_POLICY_UNSUPPORTED");

    const admittedProtocol = admitValidationProtocolV1({
      protocol,
      subjectExperimentCandidate: subjectExperiment,
      subjectResearchIrPayload: researchIrV2,
      sourceDatasetSnapshotPayload: sourceSnapshot,
      metricRequestSetPayload: metricRequestSetV2,
      executionConfigPayload: executionConfigV2,
    });
    const phaseWindow = protocol.folds[0]!.evaluationWindow;
    const phaseResearchIr = deriveValidationPhaseResearchIrV2(researchIrV2, phaseWindow);
    const slices = sourceSeries.map((payload, index) => sliceValidationDatasetSeriesPrefixV2(payload, sourceBuffers[index]!, phaseWindow.endDate));
    for (const slice of slices) {
      expect(slice.observations.some((row) => row.date > phaseWindow.endDate)).toBe(false);
      expect(slice.series.coverageEnd).toBe(phaseWindow.endDate);
      expect(slice.series.contentSha256).toBe(sha256HexV1(slice.bytes));
    }
    const phaseDatasetSeries = slices.map((slice) => slice.series);
    const phaseDatasetSnapshot = snapshotFor(phaseDatasetSeries);
    const validationRunInput: ValidationRunInputHashPayloadV1 = {
      schemaVersion: "VALIDATION_RUN_INPUT_HASH_PAYLOAD_V1",
      validationProtocol: ref("SYNTRAKE:VALIDATION_PROTOCOL:V1", hashValidationProtocolV1(protocol)),
      subjectExperiment: protocol.subjectExperiment,
      subjectResearchIr: protocol.subjectResearchIr,
      phaseResearchIr: ref("SYNTRAKE:RESEARCH_IR:V1", hashResearchIrV1(phaseResearchIr)),
      sourceDatasetSnapshot: protocol.sourceDatasetSnapshot,
      phaseDatasetSnapshot: ref("SYNTRAKE:DATASET_SNAPSHOT:V1", hashDatasetSnapshotV1(phaseDatasetSnapshot)),
      foldOrdinal: "0",
      phase: "EVALUATION",
      phaseWindow,
      engineId: "HISTORICAL_EXECUTION_ADAPTER",
      engineVersion: "ENGINE_V20260926",
      metricRegistryVersion: "METRIC_REGISTRY_V20260918",
      metricRequestSet: protocol.metricRequestSet,
      executionConfig: protocol.executionConfig,
    };
    const admitted = admitValidationRunInputV1({
      validationProtocolCandidate: {
        protocol,
        subjectExperimentCandidate: subjectExperiment,
        subjectResearchIrPayload: researchIrV2,
        sourceDatasetSnapshotPayload: sourceSnapshot,
        metricRequestSetPayload: metricRequestSetV2,
        executionConfigPayload: executionConfigV2,
      },
      validationRunInput,
      phaseResearchIrPayload: phaseResearchIr,
      phaseDatasetSeriesPayloads: phaseDatasetSeries,
      phaseDatasetSnapshotPayload: phaseDatasetSnapshot,
      sourceDatasetSeriesPayloads: sourceSeries,
      sourceMaterials: sourceBuffers,
    });
    expect(admitted.validationRunInputHash.hashDomain).toBe("SYNTRAKE:VALIDATION_RUN_INPUT:V1");
    const direct = executeHistoricalKernelV2({
      researchIr: admitted.phaseResearchIr,
      datasetSeries: admitted.phaseDatasetSeries,
      executionConfig: admitted.executionConfig,
      metricRequestSet: admitted.metricRequestSet,
      materials: admitted.phaseMaterials,
    });
    const child = executeValidationChildBacktestV1({ admittedRunInput: admitted });
    expect(direct.ok).toBe(true);
    expect(child.ok).toBe(true);
    if (!direct.ok || !child.ok) return;
    expect(child.childResultPayload.engineVersion).toBe("ENGINE_V20260926");
    expect(child.childResultPayload.executionModelClass).toBe("NEXT_SESSION_ADJUSTED_OHLCV_RESEARCH_V2");
    expect(child.artifacts.executionTraceBytes.equals(direct.artifacts.executionTraceBytes)).toBe(true);
    expect(child.artifacts.valuationSeriesBytes.equals(direct.artifacts.valuationSeriesBytes)).toBe(true);
    expect(child.artifacts.metricResultSetBytes.equals(direct.artifacts.metricResultSetBytes)).toBe(true);
    expect(child.artifacts.benchmarkSeriesBytes?.equals(direct.artifacts.benchmarkSeriesBytes!)).toBe(true);
    expect(admittedProtocol.validationProtocol.hashHex).toBe(hashValidationProtocolV1(protocol));
  });
});

function observations(fieldId: string): readonly DatasetSeriesObservationV1[] {
  if (fieldId === "ADJUSTED_OPEN") return [{ date: "2020-01-02", value: "10" }, { date: "2020-01-03", value: "10" }, { date: "2020-01-06", value: "11" }];
  if (fieldId === "ADJUSTED_HIGH") return [{ date: "2020-01-02", value: "11" }, { date: "2020-01-03", value: "11" }, { date: "2020-01-06", value: "12" }];
  if (fieldId === "ADJUSTED_LOW") return [{ date: "2020-01-02", value: "9" }, { date: "2020-01-03", value: "9" }, { date: "2020-01-06", value: "10" }];
  if (fieldId === "ADJUSTED_CLOSE") return [{ date: "2020-01-02", value: "10" }, { date: "2020-01-03", value: "11" }, { date: "2020-01-06", value: "12" }];
  return [{ date: "2020-01-02", value: "1000" }, { date: "2020-01-03", value: "1100" }, { date: "2020-01-06", value: "1200" }];
}

function bytes(fieldId: string, rows: readonly DatasetSeriesObservationV1[] = observations(fieldId)): Buffer {
  return canonicalDatasetSeriesMaterialBytesV1(rows);
}

function series(fieldId: string, rows: readonly DatasetSeriesObservationV1[] = observations(fieldId)): DatasetSeriesHashPayloadV1 {
  const materialBytes = bytes(fieldId, rows);
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
    coverageStart: rows[0]!.date,
    coverageEnd: rows.at(-1)!.date,
    observationCount: String(rows.length),
    contentSha256: sha256HexV1(materialBytes),
  };
}

function snapshotFor(seriesPayloads: readonly DatasetSeriesHashPayloadV1[]): DatasetSnapshotHashPayloadV1 {
  return {
    schemaVersion: "DATASET_SNAPSHOT_HASH_PAYLOAD_V1",
    snapshotPolicy: "DATASET_SNAPSHOT_POLICY_V1",
    series: seriesPayloads.map((payload) => ref("SYNTRAKE:DATASET_SERIES:V1", hashDatasetSeriesV1(payload))),
  };
}

function experimentFor(ir: ResearchIrV1): ExperimentBaselineCandidateV1 {
  return {
    schemaVersion: "EXPERIMENT_BASELINE_CANDIDATE_V1",
    relation: "BASELINE",
    researchSpecRevisionId: "92000000-0000-4000-8000-000000000026",
    researchIr: ref("SYNTRAKE:RESEARCH_IR:V1", hashResearchIrV1(ir)),
  };
}

function ref(hashDomain: HashRefV1["hashDomain"], hashHex = hashDatasetSeriesV1(series("ADJUSTED_CLOSE"))): HashRefV1 {
  return { hashAlgorithm: "SHA-256", hashDomain, hashVersion: "SYNTRAKE_SHA256_V1", hashHex };
}
