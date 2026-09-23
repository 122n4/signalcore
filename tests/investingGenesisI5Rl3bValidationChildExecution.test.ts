import { describe, expect, it } from "vitest";
import {
  admitValidationRunInputV1,
  canonicalDatasetSeriesMaterialBytesV1,
  deriveValidationPhaseResearchIrV1,
  executeHistoricalBacktestV1,
  executeValidationChildBacktestV1,
  hashDatasetSeriesV1,
  hashDatasetSnapshotV1,
  hashExecutionConfigV1,
  hashExperimentV1,
  hashMetricRequestSetV1,
  hashRefV1,
  hashResearchIrV1,
  hashValidationProtocolV1,
  hashValidationRunInputV1,
  sha256HexV1,
  sliceValidationDatasetSeriesPrefixV1,
  verifyDatasetSeriesMaterialV1,
  type DatasetSeriesHashPayloadV1,
  type DatasetSeriesObservationV1,
  type DatasetSnapshotHashPayloadV1,
  type ValidationPhaseV1,
  type ValidationProtocolCandidateV1,
  type ValidationProtocolHashPayloadV1,
  type ValidationRunInputHashPayloadV1,
} from "../lib/investing/research";
import {
  executionConfigV1,
  metricRequestSetV1,
  ref,
} from "./support/investingI5DatasetRunScientificFixtures";
import {
  i5BaselineCandidateV1,
  i5ExperimentBaseResearchIrV1,
} from "./support/investingI5ExperimentScientificFixtures";
import { hashRunInputV1, type RunInputHashPayloadV1 } from "../lib/investing/research/canonical";
import { hashResultV1 } from "../lib/investing/research/resultArtifacts";

const subjectExperimentCandidate = i5BaselineCandidateV1("91000000-0000-4000-8000-000000000071");
const folds = [
  {
    ordinal: "0",
    trainingWindow: { startDate: "2020-01-31", endDate: "2020-02-04" },
    evaluationWindow: { startDate: "2020-02-05", endDate: "2020-02-06" },
  },
  {
    ordinal: "1",
    trainingWindow: { startDate: "2020-02-04", endDate: "2020-02-06" },
    evaluationWindow: { startDate: "2020-02-07", endDate: "2020-02-10" },
  },
] as const;

function series(instrumentId: string, values: readonly [string, string][]): { series: DatasetSeriesHashPayloadV1; bytes: Buffer } {
  const observations: readonly DatasetSeriesObservationV1[] = values.map(([date, value]) => ({ date, value }));
  const bytes = canonicalDatasetSeriesMaterialBytesV1(observations);
  return {
    bytes,
    series: {
      schemaVersion: "DATASET_SERIES_HASH_PAYLOAD_V1",
      providerDatasetId: "RL3B_VALIDATION_FIXTURE",
      providerDatasetVersion: "V20260923",
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
    },
  };
}

function sourceMaterials() {
  const dates: readonly [string, string][] = [
    ["2020-01-31", "100"],
    ["2020-02-03", "101"],
    ["2020-02-04", "102"],
    ["2020-02-05", "103"],
    ["2020-02-06", "104"],
    ["2020-02-07", "105"],
    ["2020-02-10", "106"],
    ["2020-02-11", "107"],
    ["2020-02-12", "108"],
    ["2020-02-13", "109"],
    ["2020-02-14", "110"],
    ["2020-02-18", "111"],
    ["2020-02-19", "112"],
  ];
  return [
    series("US:AAPL", dates),
    series("US:MSFT", dates.map(([date, value]) => [date, String(Number(value) + 10)] as [string, string])),
  ] as const;
}

function snapshotFor(seriesPayloads: readonly DatasetSeriesHashPayloadV1[]): DatasetSnapshotHashPayloadV1 {
  return {
    schemaVersion: "DATASET_SNAPSHOT_HASH_PAYLOAD_V1",
    snapshotPolicy: "DATASET_SNAPSHOT_POLICY_V1",
    series: seriesPayloads.map((payload) => ref("SYNTRAKE:DATASET_SERIES:V1", hashDatasetSeriesV1(payload))),
  };
}

function protocolCandidate(): ValidationProtocolCandidateV1 & {
  sourceDatasetSeriesPayloads: readonly DatasetSeriesHashPayloadV1[];
  sourceBytes: readonly Buffer[];
} {
  const source = sourceMaterials();
  const sourceDatasetSeriesPayloads = source.map((entry) => entry.series);
  const sourceDatasetSnapshotPayload = snapshotFor(sourceDatasetSeriesPayloads);
  const protocol: ValidationProtocolHashPayloadV1 = {
    schemaVersion: "VALIDATION_PROTOCOL_HASH_PAYLOAD_V1",
    methodology: "VALIDATION_METHODOLOGY_V1",
    boundaryPolicy: "EXACT_XNYS_SESSION_BOUNDARIES_V1",
    missingDataSemantics: "INHERIT_EXECUTION_CONFIG_EXACT_V1",
    sourceMaterialPolicy: "PREFIX_TO_PHASE_END_NO_FUTURE_DATA_V1",
    subjectExperiment: ref("SYNTRAKE:EXPERIMENT:V1", hashExperimentV1(subjectExperimentCandidate)),
    subjectResearchIr: ref("SYNTRAKE:RESEARCH_IR:V1", hashResearchIrV1(i5ExperimentBaseResearchIrV1)),
    sourceDatasetSnapshot: ref("SYNTRAKE:DATASET_SNAPSHOT:V1", hashDatasetSnapshotV1(sourceDatasetSnapshotPayload)),
    engineId: "HISTORICAL_EXECUTION_ADAPTER",
    engineVersion: "ENGINE_V20260918",
    metricRegistryVersion: "METRIC_REGISTRY_V20260918",
    metricRequestSet: ref("SYNTRAKE:METRIC_REQUEST_SET:V1", hashMetricRequestSetV1(metricRequestSetV1)),
    executionConfig: ref("SYNTRAKE:EXECUTION_CONFIG:V1", hashExecutionConfigV1(executionConfigV1)),
    validationMode: "ROLLING_WALK_FORWARD",
    folds,
  };
  return {
    protocol,
    subjectExperimentCandidate,
    subjectResearchIrPayload: i5ExperimentBaseResearchIrV1,
    sourceDatasetSnapshotPayload,
    metricRequestSetPayload: metricRequestSetV1,
    executionConfigPayload: executionConfigV1,
    sourceDatasetSeriesPayloads,
    sourceBytes: source.map((entry) => entry.bytes),
  };
}

function validationRunInput(
  phase: ValidationPhaseV1,
  foldOrdinal = "0",
  overrides: Partial<ValidationRunInputHashPayloadV1> = {},
) {
  const candidate = protocolCandidate();
  const fold = candidate.protocol.folds.find((entry) => entry.ordinal === foldOrdinal)!;
  const phaseWindow = phase === "TRAINING" ? fold.trainingWindow : fold.evaluationWindow;
  const phaseResearchIrPayload = deriveValidationPhaseResearchIrV1(i5ExperimentBaseResearchIrV1, phaseWindow);
  const slices = candidate.sourceDatasetSeriesPayloads.map((payload, index) =>
    sliceValidationDatasetSeriesPrefixV1(payload, candidate.sourceBytes[index]!, phaseWindow.endDate));
  const phaseDatasetSeriesPayloads = slices.map((slice) => slice.series);
  const phaseDatasetSnapshotPayload = snapshotFor(phaseDatasetSeriesPayloads);
  const validationRunInputPayload: ValidationRunInputHashPayloadV1 = {
    schemaVersion: "VALIDATION_RUN_INPUT_HASH_PAYLOAD_V1",
    validationProtocol: ref("SYNTRAKE:VALIDATION_PROTOCOL:V1", hashValidationProtocolV1(candidate.protocol)),
    subjectExperiment: candidate.protocol.subjectExperiment,
    subjectResearchIr: candidate.protocol.subjectResearchIr,
    phaseResearchIr: ref("SYNTRAKE:RESEARCH_IR:V1", hashResearchIrV1(phaseResearchIrPayload)),
    sourceDatasetSnapshot: candidate.protocol.sourceDatasetSnapshot,
    phaseDatasetSnapshot: ref("SYNTRAKE:DATASET_SNAPSHOT:V1", hashDatasetSnapshotV1(phaseDatasetSnapshotPayload)),
    foldOrdinal,
    phase,
    phaseWindow,
    engineId: "HISTORICAL_EXECUTION_ADAPTER",
    engineVersion: "ENGINE_V20260918",
    metricRegistryVersion: "METRIC_REGISTRY_V20260918",
    metricRequestSet: candidate.protocol.metricRequestSet,
    executionConfig: candidate.protocol.executionConfig,
    ...overrides,
  };
  return {
    candidate,
    phaseResearchIrPayload,
    phaseDatasetSeriesPayloads,
    phaseDatasetSnapshotPayload,
    validationRunInputPayload,
    phaseMaterials: slices.map((slice) => verifyDatasetSeriesMaterialV1(slice.series, slice.bytes)),
  };
}

describe("I5 RL-3B Validation Child Execution runtime", () => {
  it("admits Validation Run Input without weakening RUN_INPUT:V1 or Experiment lineage", () => {
    const training = validationRunInput("TRAINING");
    const admitted = admitValidationRunInputV1({
      validationProtocolCandidate: training.candidate,
      validationRunInput: training.validationRunInputPayload,
      phaseResearchIrPayload: training.phaseResearchIrPayload,
      phaseDatasetSeriesPayloads: training.phaseDatasetSeriesPayloads,
      phaseDatasetSnapshotPayload: training.phaseDatasetSnapshotPayload,
      sourceDatasetSeriesPayloads: training.candidate.sourceDatasetSeriesPayloads,
      sourceMaterials: training.candidate.sourceBytes,
    });

    expect(admitted.validationRunInputHash.hashDomain).toBe("SYNTRAKE:VALIDATION_RUN_INPUT:V1");
    expect(admitted.validationRunInputHash.hashHex).toBe(hashValidationRunInputV1(training.validationRunInputPayload));
    expect(admitted.phaseResearchIr.testPeriod).toEqual(training.validationRunInputPayload.phaseWindow);
    expect(admitted.phaseResearchIr.pipeline).toEqual(i5ExperimentBaseResearchIrV1.pipeline);
    expect(admitted.phaseResearchIr.startingCapital).toEqual(i5ExperimentBaseResearchIrV1.startingCapital);
    expect(training.validationRunInputPayload.subjectExperiment).toEqual(ref("SYNTRAKE:EXPERIMENT:V1", hashExperimentV1(subjectExperimentCandidate)));

    const forbiddenRunInput: RunInputHashPayloadV1 = {
      schemaVersion: "RUN_INPUT_HASH_PAYLOAD_V1",
      runType: "HISTORICAL_BACKTEST",
      researchEnvironment: "HISTORICAL_BACKTEST",
      researchSourceContext: "PURE_RESEARCH",
      researchSpec: ref("SYNTRAKE:RESEARCH_SPEC:V1", "A".repeat(64)),
      researchIr: training.validationRunInputPayload.phaseResearchIr,
      experiment: training.validationRunInputPayload.subjectExperiment,
      datasetSnapshot: training.validationRunInputPayload.phaseDatasetSnapshot,
      engineId: "HISTORICAL_EXECUTION_ADAPTER",
      engineVersion: "ENGINE_V20260918",
      metricRegistryVersion: "METRIC_REGISTRY_V20260918",
      metricRequestSet: training.validationRunInputPayload.metricRequestSet,
      executionConfig: training.validationRunInputPayload.executionConfig,
      materialPolicies: [],
    };
    expect(hashRunInputV1(forbiddenRunInput)).not.toBe(admitted.validationRunInputHash.hashHex);
  });

  it("derives no-lookahead phase material and separates fold/phase identities deterministically", () => {
    const training = validationRunInput("TRAINING");
    const evaluation = validationRunInput("EVALUATION");
    const nextFoldTraining = validationRunInput("TRAINING", "1");

    expect(training.phaseDatasetSeriesPayloads.every((payload) => payload.coverageEnd === "2020-02-04")).toBe(true);
    expect(evaluation.phaseDatasetSeriesPayloads.every((payload) => payload.coverageEnd === "2020-02-06")).toBe(true);
    expect(training.phaseMaterials.every((material) => material.observations.every((row) => row.date <= "2020-02-04"))).toBe(true);
    expect(evaluation.phaseMaterials.every((material) => material.observations.every((row) => row.date <= "2020-02-06"))).toBe(true);
    expect(hashValidationRunInputV1(training.validationRunInputPayload)).toBe(hashValidationRunInputV1({ ...training.validationRunInputPayload }));
    expect(hashValidationRunInputV1(training.validationRunInputPayload)).not.toBe(hashValidationRunInputV1(evaluation.validationRunInputPayload));
    expect(hashValidationRunInputV1(training.validationRunInputPayload)).not.toBe(hashValidationRunInputV1(nextFoldTraining.validationRunInputPayload));
    expect(() => admitValidationRunInputV1({
      validationProtocolCandidate: training.candidate,
      validationRunInput: { ...training.validationRunInputPayload, phaseWindow: evaluation.validationRunInputPayload.phaseWindow },
      phaseResearchIrPayload: training.phaseResearchIrPayload,
      phaseDatasetSeriesPayloads: training.phaseDatasetSeriesPayloads,
      phaseDatasetSnapshotPayload: training.phaseDatasetSnapshotPayload,
      sourceDatasetSeriesPayloads: training.candidate.sourceDatasetSeriesPayloads,
      sourceMaterials: training.candidate.sourceBytes,
    })).toThrow("VALIDATION_PHASE_WINDOW_MISMATCH");
  });

  it("executes Validation Child Result through the same historical kernel without changing Result V1 goldens", () => {
    const training = validationRunInput("TRAINING");
    const admitted = admitValidationRunInputV1({
      validationProtocolCandidate: training.candidate,
      validationRunInput: training.validationRunInputPayload,
      phaseResearchIrPayload: training.phaseResearchIrPayload,
      phaseDatasetSeriesPayloads: training.phaseDatasetSeriesPayloads,
      phaseDatasetSnapshotPayload: training.phaseDatasetSnapshotPayload,
      sourceDatasetSeriesPayloads: training.candidate.sourceDatasetSeriesPayloads,
      sourceMaterials: training.candidate.sourceBytes,
    });
    const first = executeValidationChildBacktestV1({
      admittedRunInput: admitted,
      executionConfig: executionConfigV1,
      metricRequestSet: metricRequestSetV1,
      materials: training.phaseMaterials,
    });
    const second = executeValidationChildBacktestV1({
      admittedRunInput: admitted,
      executionConfig: executionConfigV1,
      metricRequestSet: metricRequestSetV1,
      materials: training.phaseMaterials,
    });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.childResultHash.hashDomain).toBe("SYNTRAKE:VALIDATION_CHILD_RESULT:V1");
    expect(first.childResultPayload.validationRunInput.hashDomain).toBe("SYNTRAKE:VALIDATION_RUN_INPUT:V1");
    expect(first.childResultPayload.testPeriod).toEqual(training.validationRunInputPayload.phaseWindow);
    expect(first.childResultHash).toEqual(second.childResultHash);
    expect(first.artifacts.executionTraceBytes.equals(second.artifacts.executionTraceBytes)).toBe(true);

    const runInput: RunInputHashPayloadV1 = {
      schemaVersion: "RUN_INPUT_HASH_PAYLOAD_V1",
      runType: "HISTORICAL_BACKTEST",
      researchEnvironment: "HISTORICAL_BACKTEST",
      researchSourceContext: "PURE_RESEARCH",
      researchSpec: ref("SYNTRAKE:RESEARCH_SPEC:V1", "B".repeat(64)),
      researchIr: training.validationRunInputPayload.phaseResearchIr,
      experiment: training.validationRunInputPayload.subjectExperiment,
      datasetSnapshot: training.validationRunInputPayload.phaseDatasetSnapshot,
      engineId: "HISTORICAL_EXECUTION_ADAPTER",
      engineVersion: "ENGINE_V20260918",
      metricRegistryVersion: "METRIC_REGISTRY_V20260918",
      metricRequestSet: training.validationRunInputPayload.metricRequestSet,
      executionConfig: training.validationRunInputPayload.executionConfig,
      materialPolicies: [
        { policyId: "DATASET_SNAPSHOT", policyVersion: "DATASET_SNAPSHOT_POLICY_V1" },
        { policyId: "EXECUTION_CONFIG", policyVersion: "EXECUTION_CONFIG_HASH_PAYLOAD_V1" },
      ],
    };
    const historical = executeHistoricalBacktestV1({
      runInput,
      runInputHash: hashRefV1({
        hashAlgorithm: "SHA-256",
        hashDomain: "SYNTRAKE:RUN_INPUT:V1",
        hashVersion: "SYNTRAKE_SHA256_V1",
        hashHex: hashRunInputV1(runInput),
      }),
      researchIr: training.phaseResearchIrPayload,
      datasetSeries: training.phaseDatasetSeriesPayloads,
      executionConfig: executionConfigV1,
      metricRequestSet: metricRequestSetV1,
      materials: training.phaseMaterials,
    });
    expect(historical.ok).toBe(true);
    if (!historical.ok) return;
    expect(historical.artifacts.executionTraceBytes.equals(first.artifacts.executionTraceBytes)).toBe(true);
    expect(hashResultV1(historical.resultPayload)).not.toBe(first.childResultHash.hashHex);
    expect(historical.resultPayload.runInput.hashDomain).toBe("SYNTRAKE:RUN_INPUT:V1");
  });

  it("rejects corrupted source material and mismatched phase snapshots", () => {
    const training = validationRunInput("TRAINING");
    const corrupted = Buffer.from(training.candidate.sourceBytes[0]!.toString("utf8").replace("105", "999"), "utf8");
    expect(() => admitValidationRunInputV1({
      validationProtocolCandidate: training.candidate,
      validationRunInput: training.validationRunInputPayload,
      phaseResearchIrPayload: training.phaseResearchIrPayload,
      phaseDatasetSeriesPayloads: training.phaseDatasetSeriesPayloads,
      phaseDatasetSnapshotPayload: training.phaseDatasetSnapshotPayload,
      sourceDatasetSeriesPayloads: training.candidate.sourceDatasetSeriesPayloads,
      sourceMaterials: [corrupted, training.candidate.sourceBytes[1]!],
    })).toThrow();

    expect(() => admitValidationRunInputV1({
      validationProtocolCandidate: training.candidate,
      validationRunInput: training.validationRunInputPayload,
      phaseResearchIrPayload: training.phaseResearchIrPayload,
      phaseDatasetSeriesPayloads: validationRunInput("EVALUATION").phaseDatasetSeriesPayloads,
      phaseDatasetSnapshotPayload: training.phaseDatasetSnapshotPayload,
      sourceDatasetSeriesPayloads: training.candidate.sourceDatasetSeriesPayloads,
      sourceMaterials: training.candidate.sourceBytes,
    })).toThrow("VALIDATION_PHASE_DATASET_SERIES_MISMATCH");
  });
});
