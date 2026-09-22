import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  admitValidationProtocolV1,
  assertExecutionConfigBoundToValidationProtocolV1,
  assertOnlyResearchIrTestPeriodChangedV1,
  canonicalDatasetSeriesMaterialBytesV1,
  canonicalValidationProtocolBytesV1,
  deriveValidationPhaseResearchIrV1,
  hashDatasetSeriesV1,
  hashDatasetSnapshotV1,
  hashDomainStateV1,
  hashExecutionConfigV1,
  hashExperimentV1,
  hashMetricRequestSetV1,
  hashResearchIrV1,
  hashValidationProtocolV1,
  sha256HexV1,
  sliceValidationDatasetSeriesPrefixV1,
  type DatasetSeriesHashPayloadV1,
  type DatasetSeriesObservationV1,
  type ValidationProtocolCandidateV1,
  type ValidationFoldV1,
  type ValidationModeV1,
  type ValidationProtocolHashPayloadV1,
} from "../lib/investing/research";
import {
  datasetSeriesV1,
  datasetSnapshotV1,
  executionConfigV1,
  metricRequestSetV1,
  ref,
} from "./support/investingI5DatasetRunScientificFixtures";
import {
  i5BaselineCandidateV1,
  i5ExperimentBaseResearchIrV1,
} from "./support/investingI5ExperimentScientificFixtures";
import { ownerStructuredHashPreimageV1 } from "../lib/investing/research/scientificPreimage";

const experiment = i5BaselineCandidateV1("91000000-0000-4000-8000-000000000071");
const subjectResearchIr = ref("SYNTRAKE:RESEARCH_IR:V1", hashResearchIrV1(i5ExperimentBaseResearchIrV1));
const subjectExperiment = ref("SYNTRAKE:EXPERIMENT:V1", hashExperimentV1(experiment));
const sourceDatasetSnapshot = ref("SYNTRAKE:DATASET_SNAPSHOT:V1", hashDatasetSnapshotV1(datasetSnapshotV1()));
const metricRequestSet = ref("SYNTRAKE:METRIC_REQUEST_SET:V1", hashMetricRequestSetV1(metricRequestSetV1));
const executionConfig = ref("SYNTRAKE:EXECUTION_CONFIG:V1", hashExecutionConfigV1(executionConfigV1));

const holdoutFolds: readonly ValidationFoldV1[] = [
  {
    ordinal: "0",
    trainingWindow: { startDate: "2020-01-31", endDate: "2020-02-07" },
    evaluationWindow: { startDate: "2020-02-10", endDate: "2020-02-14" },
  },
];

const rollingFolds: readonly ValidationFoldV1[] = [
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
];

const expandingFolds: readonly ValidationFoldV1[] = [
  rollingFolds[0]!,
  {
    ordinal: "1",
    trainingWindow: { startDate: "2020-01-31", endDate: "2020-02-06" },
    evaluationWindow: { startDate: "2020-02-07", endDate: "2020-02-10" },
  },
];

const materialObservations: readonly DatasetSeriesObservationV1[] = [
  { date: "2020-01-31", value: "100.00" },
  { date: "2020-02-03", value: "101.00" },
  { date: "2020-02-04", value: "102.00" },
  { date: "2020-02-05", value: "103.00" },
  { date: "2020-02-06", value: "104.00" },
  { date: "2020-02-07", value: "105.00" },
  { date: "2020-02-10", value: "106.00" },
];

function protocol(validationMode: ValidationModeV1, folds: readonly ValidationFoldV1[]): ValidationProtocolHashPayloadV1 {
  return {
    schemaVersion: "VALIDATION_PROTOCOL_HASH_PAYLOAD_V1",
    methodology: "VALIDATION_METHODOLOGY_V1",
    boundaryPolicy: "EXACT_XNYS_SESSION_BOUNDARIES_V1",
    missingDataSemantics: "INHERIT_EXECUTION_CONFIG_EXACT_V1",
    sourceMaterialPolicy: "PREFIX_TO_PHASE_END_NO_FUTURE_DATA_V1",
    subjectExperiment,
    subjectResearchIr,
    sourceDatasetSnapshot,
    engineId: "HISTORICAL_EXECUTION_ADAPTER",
    engineVersion: executionConfigV1.engineCompatibilityVersion,
    metricRegistryVersion: metricRequestSetV1.metricRegistryVersion,
    metricRequestSet,
    executionConfig,
    validationMode,
    folds,
  };
}

function materialSeries(): { series: DatasetSeriesHashPayloadV1; bytes: Buffer } {
  const bytes = canonicalDatasetSeriesMaterialBytesV1(materialObservations);
  return {
    bytes,
    series: {
      ...datasetSeriesV1,
      coverageEnd: "2020-02-10",
      observationCount: String(materialObservations.length),
      contentSha256: sha256HexV1(bytes),
    },
  };
}

function validationCandidate(
  overrides: Partial<ValidationProtocolCandidateV1> & { protocol?: ValidationProtocolHashPayloadV1 } = {},
): ValidationProtocolCandidateV1 {
  return {
    protocol: protocol("CHRONOLOGICAL_HOLDOUT", holdoutFolds),
    subjectExperimentCandidate: experiment,
    subjectResearchIrPayload: i5ExperimentBaseResearchIrV1,
    sourceDatasetSnapshotPayload: datasetSnapshotV1(),
    metricRequestSetPayload: metricRequestSetV1,
    executionConfigPayload: executionConfigV1,
    ...overrides,
  };
}

const goldenVectors = [
  {
    name: "chronological holdout",
    payload: protocol("CHRONOLOGICAL_HOLDOUT", holdoutFolds),
    expectedBytes: "{\"boundaryPolicy\":\"EXACT_XNYS_SESSION_BOUNDARIES_V1\",\"engineId\":\"HISTORICAL_EXECUTION_ADAPTER\",\"engineVersion\":\"ENGINE_V20260918\",\"executionConfig\":{\"hashAlgorithm\":\"SHA-256\",\"hashDomain\":\"SYNTRAKE:EXECUTION_CONFIG:V1\",\"hashHex\":\"B72AC58668D720FA6783328CCC14516E01A49DE021B919F9CD5390A60E561210\",\"hashVersion\":\"SYNTRAKE_SHA256_V1\"},\"folds\":[{\"evaluationWindow\":{\"endDate\":\"2020-02-14\",\"startDate\":\"2020-02-10\"},\"ordinal\":\"0\",\"trainingWindow\":{\"endDate\":\"2020-02-07\",\"startDate\":\"2020-01-31\"}}],\"methodology\":\"VALIDATION_METHODOLOGY_V1\",\"metricRegistryVersion\":\"METRIC_REGISTRY_V20260918\",\"metricRequestSet\":{\"hashAlgorithm\":\"SHA-256\",\"hashDomain\":\"SYNTRAKE:METRIC_REQUEST_SET:V1\",\"hashHex\":\"547B5615C8893BB5B73B7912BD668A4CD013013923D184D5F9CCA6B27D1A2EC2\",\"hashVersion\":\"SYNTRAKE_SHA256_V1\"},\"missingDataSemantics\":\"INHERIT_EXECUTION_CONFIG_EXACT_V1\",\"schemaVersion\":\"VALIDATION_PROTOCOL_HASH_PAYLOAD_V1\",\"sourceDatasetSnapshot\":{\"hashAlgorithm\":\"SHA-256\",\"hashDomain\":\"SYNTRAKE:DATASET_SNAPSHOT:V1\",\"hashHex\":\"61BF6FE8CA033A410CFB93E5B4AEAA84C2DE6BD1A29A35A592D5CF8479DFA15E\",\"hashVersion\":\"SYNTRAKE_SHA256_V1\"},\"sourceMaterialPolicy\":\"PREFIX_TO_PHASE_END_NO_FUTURE_DATA_V1\",\"subjectExperiment\":{\"hashAlgorithm\":\"SHA-256\",\"hashDomain\":\"SYNTRAKE:EXPERIMENT:V1\",\"hashHex\":\"C4FAB4B08CE5CD499AADD03BD5F3461117E3C271B6128E7750B5D38C3CB73337\",\"hashVersion\":\"SYNTRAKE_SHA256_V1\"},\"subjectResearchIr\":{\"hashAlgorithm\":\"SHA-256\",\"hashDomain\":\"SYNTRAKE:RESEARCH_IR:V1\",\"hashHex\":\"265D8F6AAC35DB919EC130EE978F1831383E74BC2F625230D61EB81C0F27B44F\",\"hashVersion\":\"SYNTRAKE_SHA256_V1\"},\"validationMode\":\"CHRONOLOGICAL_HOLDOUT\"}",
    expectedHash: "0C58935851B3EB664D20DC0829C1B30237964E73874332BE967E371DCEDCB295",
  },
  {
    name: "IS/OOS split",
    payload: protocol("IS_OOS_SPLIT", holdoutFolds),
    expectedBytes: "{\"boundaryPolicy\":\"EXACT_XNYS_SESSION_BOUNDARIES_V1\",\"engineId\":\"HISTORICAL_EXECUTION_ADAPTER\",\"engineVersion\":\"ENGINE_V20260918\",\"executionConfig\":{\"hashAlgorithm\":\"SHA-256\",\"hashDomain\":\"SYNTRAKE:EXECUTION_CONFIG:V1\",\"hashHex\":\"B72AC58668D720FA6783328CCC14516E01A49DE021B919F9CD5390A60E561210\",\"hashVersion\":\"SYNTRAKE_SHA256_V1\"},\"folds\":[{\"evaluationWindow\":{\"endDate\":\"2020-02-14\",\"startDate\":\"2020-02-10\"},\"ordinal\":\"0\",\"trainingWindow\":{\"endDate\":\"2020-02-07\",\"startDate\":\"2020-01-31\"}}],\"methodology\":\"VALIDATION_METHODOLOGY_V1\",\"metricRegistryVersion\":\"METRIC_REGISTRY_V20260918\",\"metricRequestSet\":{\"hashAlgorithm\":\"SHA-256\",\"hashDomain\":\"SYNTRAKE:METRIC_REQUEST_SET:V1\",\"hashHex\":\"547B5615C8893BB5B73B7912BD668A4CD013013923D184D5F9CCA6B27D1A2EC2\",\"hashVersion\":\"SYNTRAKE_SHA256_V1\"},\"missingDataSemantics\":\"INHERIT_EXECUTION_CONFIG_EXACT_V1\",\"schemaVersion\":\"VALIDATION_PROTOCOL_HASH_PAYLOAD_V1\",\"sourceDatasetSnapshot\":{\"hashAlgorithm\":\"SHA-256\",\"hashDomain\":\"SYNTRAKE:DATASET_SNAPSHOT:V1\",\"hashHex\":\"61BF6FE8CA033A410CFB93E5B4AEAA84C2DE6BD1A29A35A592D5CF8479DFA15E\",\"hashVersion\":\"SYNTRAKE_SHA256_V1\"},\"sourceMaterialPolicy\":\"PREFIX_TO_PHASE_END_NO_FUTURE_DATA_V1\",\"subjectExperiment\":{\"hashAlgorithm\":\"SHA-256\",\"hashDomain\":\"SYNTRAKE:EXPERIMENT:V1\",\"hashHex\":\"C4FAB4B08CE5CD499AADD03BD5F3461117E3C271B6128E7750B5D38C3CB73337\",\"hashVersion\":\"SYNTRAKE_SHA256_V1\"},\"subjectResearchIr\":{\"hashAlgorithm\":\"SHA-256\",\"hashDomain\":\"SYNTRAKE:RESEARCH_IR:V1\",\"hashHex\":\"265D8F6AAC35DB919EC130EE978F1831383E74BC2F625230D61EB81C0F27B44F\",\"hashVersion\":\"SYNTRAKE_SHA256_V1\"},\"validationMode\":\"IS_OOS_SPLIT\"}",
    expectedHash: "78D2BC75A862CCCC620713F0185581B545948709656392331DEE747379A60F89",
  },
  {
    name: "rolling walk-forward",
    payload: protocol("ROLLING_WALK_FORWARD", rollingFolds),
    expectedBytes: "{\"boundaryPolicy\":\"EXACT_XNYS_SESSION_BOUNDARIES_V1\",\"engineId\":\"HISTORICAL_EXECUTION_ADAPTER\",\"engineVersion\":\"ENGINE_V20260918\",\"executionConfig\":{\"hashAlgorithm\":\"SHA-256\",\"hashDomain\":\"SYNTRAKE:EXECUTION_CONFIG:V1\",\"hashHex\":\"B72AC58668D720FA6783328CCC14516E01A49DE021B919F9CD5390A60E561210\",\"hashVersion\":\"SYNTRAKE_SHA256_V1\"},\"folds\":[{\"evaluationWindow\":{\"endDate\":\"2020-02-06\",\"startDate\":\"2020-02-05\"},\"ordinal\":\"0\",\"trainingWindow\":{\"endDate\":\"2020-02-04\",\"startDate\":\"2020-01-31\"}},{\"evaluationWindow\":{\"endDate\":\"2020-02-10\",\"startDate\":\"2020-02-07\"},\"ordinal\":\"1\",\"trainingWindow\":{\"endDate\":\"2020-02-06\",\"startDate\":\"2020-02-04\"}}],\"methodology\":\"VALIDATION_METHODOLOGY_V1\",\"metricRegistryVersion\":\"METRIC_REGISTRY_V20260918\",\"metricRequestSet\":{\"hashAlgorithm\":\"SHA-256\",\"hashDomain\":\"SYNTRAKE:METRIC_REQUEST_SET:V1\",\"hashHex\":\"547B5615C8893BB5B73B7912BD668A4CD013013923D184D5F9CCA6B27D1A2EC2\",\"hashVersion\":\"SYNTRAKE_SHA256_V1\"},\"missingDataSemantics\":\"INHERIT_EXECUTION_CONFIG_EXACT_V1\",\"schemaVersion\":\"VALIDATION_PROTOCOL_HASH_PAYLOAD_V1\",\"sourceDatasetSnapshot\":{\"hashAlgorithm\":\"SHA-256\",\"hashDomain\":\"SYNTRAKE:DATASET_SNAPSHOT:V1\",\"hashHex\":\"61BF6FE8CA033A410CFB93E5B4AEAA84C2DE6BD1A29A35A592D5CF8479DFA15E\",\"hashVersion\":\"SYNTRAKE_SHA256_V1\"},\"sourceMaterialPolicy\":\"PREFIX_TO_PHASE_END_NO_FUTURE_DATA_V1\",\"subjectExperiment\":{\"hashAlgorithm\":\"SHA-256\",\"hashDomain\":\"SYNTRAKE:EXPERIMENT:V1\",\"hashHex\":\"C4FAB4B08CE5CD499AADD03BD5F3461117E3C271B6128E7750B5D38C3CB73337\",\"hashVersion\":\"SYNTRAKE_SHA256_V1\"},\"subjectResearchIr\":{\"hashAlgorithm\":\"SHA-256\",\"hashDomain\":\"SYNTRAKE:RESEARCH_IR:V1\",\"hashHex\":\"265D8F6AAC35DB919EC130EE978F1831383E74BC2F625230D61EB81C0F27B44F\",\"hashVersion\":\"SYNTRAKE_SHA256_V1\"},\"validationMode\":\"ROLLING_WALK_FORWARD\"}",
    expectedHash: "030D16DB78E37254FCCCC2AEB1C5369E81BE85FE78A83C38EB8930620E698B1D",
  },
  {
    name: "expanding walk-forward",
    payload: protocol("EXPANDING_WALK_FORWARD", expandingFolds),
    expectedBytes: "{\"boundaryPolicy\":\"EXACT_XNYS_SESSION_BOUNDARIES_V1\",\"engineId\":\"HISTORICAL_EXECUTION_ADAPTER\",\"engineVersion\":\"ENGINE_V20260918\",\"executionConfig\":{\"hashAlgorithm\":\"SHA-256\",\"hashDomain\":\"SYNTRAKE:EXECUTION_CONFIG:V1\",\"hashHex\":\"B72AC58668D720FA6783328CCC14516E01A49DE021B919F9CD5390A60E561210\",\"hashVersion\":\"SYNTRAKE_SHA256_V1\"},\"folds\":[{\"evaluationWindow\":{\"endDate\":\"2020-02-06\",\"startDate\":\"2020-02-05\"},\"ordinal\":\"0\",\"trainingWindow\":{\"endDate\":\"2020-02-04\",\"startDate\":\"2020-01-31\"}},{\"evaluationWindow\":{\"endDate\":\"2020-02-10\",\"startDate\":\"2020-02-07\"},\"ordinal\":\"1\",\"trainingWindow\":{\"endDate\":\"2020-02-06\",\"startDate\":\"2020-01-31\"}}],\"methodology\":\"VALIDATION_METHODOLOGY_V1\",\"metricRegistryVersion\":\"METRIC_REGISTRY_V20260918\",\"metricRequestSet\":{\"hashAlgorithm\":\"SHA-256\",\"hashDomain\":\"SYNTRAKE:METRIC_REQUEST_SET:V1\",\"hashHex\":\"547B5615C8893BB5B73B7912BD668A4CD013013923D184D5F9CCA6B27D1A2EC2\",\"hashVersion\":\"SYNTRAKE_SHA256_V1\"},\"missingDataSemantics\":\"INHERIT_EXECUTION_CONFIG_EXACT_V1\",\"schemaVersion\":\"VALIDATION_PROTOCOL_HASH_PAYLOAD_V1\",\"sourceDatasetSnapshot\":{\"hashAlgorithm\":\"SHA-256\",\"hashDomain\":\"SYNTRAKE:DATASET_SNAPSHOT:V1\",\"hashHex\":\"61BF6FE8CA033A410CFB93E5B4AEAA84C2DE6BD1A29A35A592D5CF8479DFA15E\",\"hashVersion\":\"SYNTRAKE_SHA256_V1\"},\"sourceMaterialPolicy\":\"PREFIX_TO_PHASE_END_NO_FUTURE_DATA_V1\",\"subjectExperiment\":{\"hashAlgorithm\":\"SHA-256\",\"hashDomain\":\"SYNTRAKE:EXPERIMENT:V1\",\"hashHex\":\"C4FAB4B08CE5CD499AADD03BD5F3461117E3C271B6128E7750B5D38C3CB73337\",\"hashVersion\":\"SYNTRAKE_SHA256_V1\"},\"subjectResearchIr\":{\"hashAlgorithm\":\"SHA-256\",\"hashDomain\":\"SYNTRAKE:RESEARCH_IR:V1\",\"hashHex\":\"265D8F6AAC35DB919EC130EE978F1831383E74BC2F625230D61EB81C0F27B44F\",\"hashVersion\":\"SYNTRAKE_SHA256_V1\"},\"validationMode\":\"EXPANDING_WALK_FORWARD\"}",
    expectedHash: "FEB6E896D070EF00A5DB6EA2BF8F9E5D054D4789797BDAC4A97F1C7884C13272",
  },
] as const;

describe("I5 RL-3A Validation Protocol owner contract", () => {
  it("admits only the Validation Protocol owner payload hash domain", () => {
    expect(hashDomainStateV1("SYNTRAKE:VALIDATION_PROTOCOL:V1")).toBe("OWNER_PAYLOAD_EXACT");
    expect(() => hashDomainStateV1("SYNTRAKE:VALIDATION_RESULT:V1" as never)).toThrow("unknown hash domain");
    expect(() => hashDomainStateV1("SYNTRAKE:VALIDATION_CHILD_RESULT:V1" as never)).toThrow("unknown hash domain");
  });

  it.each(goldenVectors)("matches the golden vector for $name", ({ payload, expectedBytes, expectedHash }) => {
    const bytes = canonicalValidationProtocolBytesV1(payload).toString("utf8");
    expect(bytes).toBe(expectedBytes);
    expect(hashValidationProtocolV1(payload)).toBe(expectedHash);
  });

  it("admits a Validation Protocol only after proving exact scientific lineage and material refs", () => {
    const admitted = admitValidationProtocolV1(validationCandidate());
    expect(admitted.protocol).toEqual(JSON.parse(goldenVectors[0]!.expectedBytes));
    expect(admitted.validationProtocol).toEqual({
      hashAlgorithm: "SHA-256",
      hashDomain: "SYNTRAKE:VALIDATION_PROTOCOL:V1",
      hashVersion: "SYNTRAKE_SHA256_V1",
      hashHex: goldenVectors[0]!.expectedHash,
    });
    expect(Object.isFrozen(admitted)).toBe(true);
    expect(Object.isFrozen(admitted.protocol)).toBe(true);
    expect(Object.isFrozen(admitted.validationProtocol)).toBe(true);
    expect(Object.isFrozen((admitted.protocol as Record<string, unknown>).subjectExperiment)).toBe(true);
    expect(Object.isFrozen((admitted.protocol as Record<string, unknown>).subjectResearchIr)).toBe(true);
    expect(Object.isFrozen((admitted.protocol as Record<string, unknown>).sourceDatasetSnapshot)).toBe(true);
    expect(Object.isFrozen((admitted.protocol as Record<string, unknown>).metricRequestSet)).toBe(true);
    expect(Object.isFrozen((admitted.protocol as Record<string, unknown>).executionConfig)).toBe(true);
    expect(Object.isFrozen((admitted.protocol as Record<string, unknown>).folds)).toBe(true);
    expect(Object.isFrozen((admitted.protocol as { folds: readonly unknown[] }).folds[0])).toBe(true);
    expect(Object.isFrozen((admitted.protocol as { folds: readonly { trainingWindow: unknown }[] }).folds[0]!.trainingWindow)).toBe(true);
    expect(Object.isFrozen((admitted.protocol as { folds: readonly { evaluationWindow: unknown }[] }).folds[0]!.evaluationWindow)).toBe(true);
    expect(() => {
      (admitted.protocol as { engineVersion: string }).engineVersion = "MUTATED";
    }).toThrow();
    expect(() => {
      (admitted.protocol as { subjectExperiment: { hashHex: string } }).subjectExperiment.hashHex = "F".repeat(64);
    }).toThrow();
    expect(() => {
      (admitted.protocol as { folds: { trainingWindow: { startDate: string } }[] }).folds[0]!.trainingWindow.startDate = "2020-01-01";
    }).toThrow();
    expect(admitted.validationProtocol.hashHex).toBe(goldenVectors[0]!.expectedHash);
    expect(admitted.validationProtocol.hashHex).toBe(
      sha256HexV1(ownerStructuredHashPreimageV1("SYNTRAKE:VALIDATION_PROTOCOL:V1", admitted.protocol)),
    );
  });

  it("rejects stateful accessors and symbol keys before admitting an identity", () => {
    let reads = 0;
    const accessorProtocol = { ...protocol("CHRONOLOGICAL_HOLDOUT", holdoutFolds) };
    Object.defineProperty(accessorProtocol, "engineVersion", {
      enumerable: true,
      get() {
        reads += 1;
        return reads === 1 ? "ENGINE_V20260918" : "MUTATED";
      },
    });
    const symbolProtocol = { ...protocol("CHRONOLOGICAL_HOLDOUT", holdoutFolds) };
    Object.defineProperty(symbolProtocol, Symbol("hidden"), {
      enumerable: true,
      value: "MUTATED",
    });

    expect(() => admitValidationProtocolV1(validationCandidate({
      protocol: accessorProtocol as unknown as ValidationProtocolHashPayloadV1,
    }))).toThrow("VALIDATION_CANONICAL_DATA_PROPERTY_REQUIRED");
    expect(reads).toBe(0);
    expect(() => admitValidationProtocolV1(validationCandidate({
      protocol: symbolProtocol as unknown as ValidationProtocolHashPayloadV1,
    }))).toThrow("VALIDATION_CANONICAL_STRING_KEY_REQUIRED");
  });

  it("does not reread nested protocol HashRefs after canonical admission payload construction", () => {
    let hashHexReads = 0;
    const experimentProofHash = hashExperimentV1(experiment);
    const statefulSubjectExperiment = {
      hashAlgorithm: "SHA-256",
      hashDomain: "SYNTRAKE:EXPERIMENT:V1",
      hashVersion: "SYNTRAKE_SHA256_V1",
    };
    Object.defineProperty(statefulSubjectExperiment, "hashHex", {
      enumerable: true,
      get() {
        hashHexReads += 1;
        return hashHexReads <= 2 ? "A".repeat(64) : experimentProofHash;
      },
    });

    expect(() => admitValidationProtocolV1(validationCandidate({
      protocol: {
        ...protocol("CHRONOLOGICAL_HOLDOUT", holdoutFolds),
        subjectExperiment: statefulSubjectExperiment as unknown as ValidationProtocolHashPayloadV1["subjectExperiment"],
      },
    }))).toThrow("ValidationProtocol Experiment HashRef mismatch");
    expect(hashHexReads).toBe(2);
  });

  it("uses one canonical Experiment proof snapshot for both hash and Research IR lineage", () => {
    let researchIrReads = 0;
    const statefulResearchIr = {
      hashAlgorithm: "SHA-256",
      hashDomain: "SYNTRAKE:RESEARCH_IR:V1",
      hashVersion: "SYNTRAKE_SHA256_V1",
    };
    Object.defineProperty(statefulResearchIr, "hashHex", {
      enumerable: true,
      get() {
        researchIrReads += 1;
        return researchIrReads <= 2 ? subjectResearchIr.hashHex : "B".repeat(64);
      },
    });
    const statefulExperiment = {
      ...experiment,
      researchIr: statefulResearchIr as unknown as typeof experiment.researchIr,
    };

    const admitted = admitValidationProtocolV1(validationCandidate({ subjectExperimentCandidate: statefulExperiment }));
    expect(admitted.validationProtocol.hashHex).toBe(goldenVectors[0]!.expectedHash);
    expect(researchIrReads).toBe(2);
  });

  it("uses one canonical MetricRequestSet proof snapshot for hash and registry compatibility", () => {
    let registryReads = 0;
    const statefulMetricRequestSet = { ...metricRequestSetV1 };
    Object.defineProperty(statefulMetricRequestSet, "metricRegistryVersion", {
      enumerable: true,
      get() {
        registryReads += 1;
        return registryReads <= 2 ? "METRIC_REGISTRY_V20260918" : "METRIC_REGISTRY_V20260918_PATCH1";
      },
    });

    const admitted = admitValidationProtocolV1(validationCandidate({ metricRequestSetPayload: statefulMetricRequestSet }));
    expect(admitted.validationProtocol.hashHex).toBe(goldenVectors[0]!.expectedHash);
    expect(registryReads).toBe(2);
  });

  it("uses one canonical ExecutionConfig proof snapshot for hash and engine compatibility", () => {
    let engineReads = 0;
    const statefulExecutionConfig = { ...executionConfigV1 };
    Object.defineProperty(statefulExecutionConfig, "engineCompatibilityVersion", {
      enumerable: true,
      get() {
        engineReads += 1;
        return engineReads <= 2 ? "ENGINE_V20260918" : "ENGINE_V20260918_PATCH1";
      },
    });

    const admitted = admitValidationProtocolV1(validationCandidate({ executionConfigPayload: statefulExecutionConfig }));
    expect(admitted.validationProtocol.hashHex).toBe(goldenVectors[0]!.expectedHash);
    expect(engineReads).toBe(2);
  });

  it("derives phase Research IR from the canonical snapshot instead of rereading raw input", () => {
    let currencyReads = 0;
    const statefulResearchIr = { ...i5ExperimentBaseResearchIrV1 };
    Object.defineProperty(statefulResearchIr, "valuationCurrency", {
      enumerable: true,
      get() {
        currencyReads += 1;
        return currencyReads <= 2 ? "USD" : "EUR";
      },
    });

    const derived = deriveValidationPhaseResearchIrV1(statefulResearchIr, { startDate: "2020-02-05", endDate: "2020-02-06" });
    expect(derived.valuationCurrency).toBe("USD");
    expect(derived.testPeriod).toEqual({ startDate: "2020-02-05", endDate: "2020-02-06" });
    expect(currencyReads).toBe(2);
  });

  it("slices DatasetSeries material from the canonical source snapshot instead of rereading raw input", () => {
    const source = materialSeries();
    let coverageEndReads = 0;
    const statefulSeries = { ...source.series };
    Object.defineProperty(statefulSeries, "coverageEnd", {
      enumerable: true,
      get() {
        coverageEndReads += 1;
        return coverageEndReads <= 2 ? "2020-02-10" : "2020-02-06";
      },
    });

    const sliced = sliceValidationDatasetSeriesPrefixV1(statefulSeries, source.bytes, "2020-02-06");
    expect(sliced.series.coverageStart).toBe(source.series.coverageStart);
    expect(sliced.series.coverageEnd).toBe("2020-02-06");
    expect(sliced.observations.at(-1)?.date).toBe("2020-02-06");
    expect(coverageEndReads).toBe(2);
  });

  it("rejects admission when the Experiment proof or Experiment to Research IR lineage does not match", () => {
    const alternateResearchIr = {
      ...i5ExperimentBaseResearchIrV1,
      testPeriod: { startDate: "2020-02-05", endDate: "2020-02-06" },
    };
    expect(() => admitValidationProtocolV1(validationCandidate({
      protocol: { ...protocol("CHRONOLOGICAL_HOLDOUT", holdoutFolds), subjectExperiment: ref("SYNTRAKE:EXPERIMENT:V1", "A".repeat(64)) },
    }))).toThrow("ValidationProtocol Experiment HashRef mismatch");
    expect(() => admitValidationProtocolV1(validationCandidate({
      protocol: {
        ...protocol("CHRONOLOGICAL_HOLDOUT", holdoutFolds),
        subjectResearchIr: ref("SYNTRAKE:RESEARCH_IR:V1", hashResearchIrV1(alternateResearchIr)),
      },
      subjectResearchIrPayload: alternateResearchIr,
    }))).toThrow("ValidationProtocol Experiment Research IR HashRef mismatch");
  });

  it("rejects admission when Research IR, DatasetSnapshot, MetricRequestSet or ExecutionConfig proofs do not match", () => {
    expect(() => admitValidationProtocolV1(validationCandidate({
      subjectResearchIrPayload: {
        ...i5ExperimentBaseResearchIrV1,
        testPeriod: { startDate: "2020-02-05", endDate: "2020-02-06" },
      },
    }))).toThrow("ValidationProtocol Research IR HashRef mismatch");
    expect(() => admitValidationProtocolV1(validationCandidate({
      protocol: { ...protocol("CHRONOLOGICAL_HOLDOUT", holdoutFolds), sourceDatasetSnapshot: ref("SYNTRAKE:DATASET_SNAPSHOT:V1", "C".repeat(64)) },
    }))).toThrow("ValidationProtocol DatasetSnapshot HashRef mismatch");
    expect(() => admitValidationProtocolV1(validationCandidate({
      protocol: { ...protocol("CHRONOLOGICAL_HOLDOUT", holdoutFolds), metricRequestSet: ref("SYNTRAKE:METRIC_REQUEST_SET:V1", "D".repeat(64)) },
    }))).toThrow("ValidationProtocol MetricRequestSet HashRef mismatch");
    expect(() => admitValidationProtocolV1(validationCandidate({
      protocol: { ...protocol("CHRONOLOGICAL_HOLDOUT", holdoutFolds), executionConfig: ref("SYNTRAKE:EXECUTION_CONFIG:V1", "E".repeat(64)) },
    }))).toThrow("ValidationProtocol ExecutionConfig HashRef mismatch");
  });

  it("rejects admission when engine or metric registry compatibility diverges from current V1 closure", () => {
    const metricRequestSetPatch = { ...metricRequestSetV1, metricRegistryVersion: "METRIC_REGISTRY_V20260918_PATCH1" };
    const executionConfigPatch = { ...executionConfigV1, engineCompatibilityVersion: "ENGINE_V20260918_PATCH1" };
    expect(() => admitValidationProtocolV1(validationCandidate({
      protocol: { ...protocol("CHRONOLOGICAL_HOLDOUT", holdoutFolds), metricRegistryVersion: "METRIC_REGISTRY_V20260918_PATCH1" },
    }))).toThrow("VALIDATION_METRIC_REGISTRY_VERSION_UNSUPPORTED");
    expect(() => admitValidationProtocolV1(validationCandidate({
      protocol: {
        ...protocol("CHRONOLOGICAL_HOLDOUT", holdoutFolds),
        metricRequestSet: ref("SYNTRAKE:METRIC_REQUEST_SET:V1", hashMetricRequestSetV1(metricRequestSetPatch)),
      },
      metricRequestSetPayload: metricRequestSetPatch,
    }))).toThrow("VALIDATION_METRIC_REGISTRY_VERSION_MISMATCH");
    expect(() => admitValidationProtocolV1(validationCandidate({
      protocol: { ...protocol("CHRONOLOGICAL_HOLDOUT", holdoutFolds), engineVersion: "ENGINE_V20260918_PATCH1" },
    }))).toThrow("VALIDATION_ENGINE_VERSION_UNSUPPORTED");
    expect(() => admitValidationProtocolV1(validationCandidate({
      protocol: {
        ...protocol("CHRONOLOGICAL_HOLDOUT", holdoutFolds),
        executionConfig: ref("SYNTRAKE:EXECUTION_CONFIG:V1", hashExecutionConfigV1(executionConfigPatch)),
      },
      executionConfigPayload: executionConfigPatch,
    }))).toThrow("VALIDATION_ENGINE_VERSION_MISMATCH");
    expect(() => admitValidationProtocolV1(validationCandidate({
      protocol: { ...protocol("CHRONOLOGICAL_HOLDOUT", holdoutFolds), engineId: "HISTORICAL_EXECUTION_ADAPTER_V2" },
    }))).toThrow("VALIDATION_ENGINE_ID_UNSUPPORTED");
  });

  it("is deterministic across input object key insertion order", () => {
    const ordered = protocol("CHRONOLOGICAL_HOLDOUT", holdoutFolds);
    const reordered = {
      folds: holdoutFolds,
      validationMode: "CHRONOLOGICAL_HOLDOUT",
      executionConfig,
      metricRequestSet,
      metricRegistryVersion: metricRequestSetV1.metricRegistryVersion,
      engineVersion: executionConfigV1.engineCompatibilityVersion,
      engineId: "HISTORICAL_EXECUTION_ADAPTER",
      sourceDatasetSnapshot,
      subjectResearchIr,
      subjectExperiment,
      sourceMaterialPolicy: "PREFIX_TO_PHASE_END_NO_FUTURE_DATA_V1",
      missingDataSemantics: "INHERIT_EXECUTION_CONFIG_EXACT_V1",
      boundaryPolicy: "EXACT_XNYS_SESSION_BOUNDARIES_V1",
      methodology: "VALIDATION_METHODOLOGY_V1",
      schemaVersion: "VALIDATION_PROTOCOL_HASH_PAYLOAD_V1",
    } as ValidationProtocolHashPayloadV1;
    expect(canonicalValidationProtocolBytesV1(reordered).equals(canonicalValidationProtocolBytesV1(ordered))).toBe(true);
    expect(hashValidationProtocolV1(reordered)).toBe(hashValidationProtocolV1(ordered));
  });

  it("changes identity when any scientific binding or validation mode changes", () => {
    const base = protocol("CHRONOLOGICAL_HOLDOUT", holdoutFolds);
    const baseHash = hashValidationProtocolV1(base);
    expect(hashValidationProtocolV1({ ...base, validationMode: "IS_OOS_SPLIT" })).not.toBe(baseHash);
    expect(hashValidationProtocolV1({ ...base, engineVersion: "ENGINE_V20260918_PATCH1" })).not.toBe(baseHash);
    expect(hashValidationProtocolV1({ ...base, subjectExperiment: ref("SYNTRAKE:EXPERIMENT:V1", "A".repeat(64)) })).not.toBe(baseHash);
    expect(hashValidationProtocolV1({ ...base, sourceDatasetSnapshot: ref("SYNTRAKE:DATASET_SNAPSHOT:V1", "B".repeat(64)) })).not.toBe(baseHash);
    expect(hashValidationProtocolV1({ ...base, metricRequestSet: ref("SYNTRAKE:METRIC_REQUEST_SET:V1", "C".repeat(64)) })).not.toBe(baseHash);
    expect(hashValidationProtocolV1({ ...base, executionConfig: ref("SYNTRAKE:EXECUTION_CONFIG:V1", "D".repeat(64)) })).not.toBe(baseHash);
  });

  it("fails closed on fold ordering, calendar boundaries, overlap and walk-forward drift", () => {
    expect(() => canonicalValidationProtocolBytesV1(protocol("CHRONOLOGICAL_HOLDOUT", rollingFolds))).toThrow("exactly one fold");
    expect(() => canonicalValidationProtocolBytesV1(protocol("ROLLING_WALK_FORWARD", holdoutFolds))).toThrow("at least two folds");
    expect(() => canonicalValidationProtocolBytesV1(protocol("IS_OOS_SPLIT", [{
      ...holdoutFolds[0]!,
      evaluationWindow: { startDate: "2020-02-11", endDate: "2020-02-14" },
    }]))).toThrow("VALIDATION_OOS_NOT_CONTIGUOUS");
    expect(() => canonicalValidationProtocolBytesV1(protocol("CHRONOLOGICAL_HOLDOUT", [{
      ...holdoutFolds[0]!,
      evaluationWindow: { startDate: "2020-02-08", endDate: "2020-02-14" },
    }]))).toThrow("VALIDATION_WINDOW_BOUNDARY_NOT_XNYS_SESSION");
    expect(() => canonicalValidationProtocolBytesV1(protocol("CHRONOLOGICAL_HOLDOUT", [{
      ...holdoutFolds[0]!,
      trainingWindow: { startDate: "2020-02-07", endDate: "2020-02-10" },
    }]))).toThrow("VALIDATION_TRAIN_EVAL_OVERLAP");
    expect(() => canonicalValidationProtocolBytesV1(protocol("ROLLING_WALK_FORWARD", [
      rollingFolds[0]!,
      { ...rollingFolds[1]!, ordinal: "0" },
    ]))).toThrow("VALIDATION_FOLD_DUPLICATE_ORDINAL");
    expect(() => canonicalValidationProtocolBytesV1(protocol("ROLLING_WALK_FORWARD", [
      rollingFolds[0]!,
      { ...rollingFolds[1]!, ordinal: "2" },
    ]))).toThrow("VALIDATION_FOLD_ORDINAL_GAP");
    expect(() => canonicalValidationProtocolBytesV1(protocol("ROLLING_WALK_FORWARD", [
      rollingFolds[0]!,
      { ...rollingFolds[1]!, trainingWindow: { startDate: "2020-02-03", endDate: "2020-02-06" } },
    ]))).toThrow("VALIDATION_ROLLING_TRAINING_SIZE_DRIFT");
    expect(() => canonicalValidationProtocolBytesV1(protocol("EXPANDING_WALK_FORWARD", [
      expandingFolds[0]!,
      { ...expandingFolds[1]!, trainingWindow: { startDate: "2020-02-03", endDate: "2020-02-06" } },
    ]))).toThrow("VALIDATION_EXPANDING_TRAIN_START_DRIFT");
  });

  it("rejects mutable behavior aliases, undeclared fields and wrong HashRef domains", () => {
    const base = protocol("CHRONOLOGICAL_HOLDOUT", holdoutFolds);
    expect(() => canonicalValidationProtocolBytesV1({ ...base, engineVersion: "CURRENT" })).toThrow("BEHAVIOR_VERSION_NOT_IMMUTABLE");
    expect(() => canonicalValidationProtocolBytesV1({ ...base, unexpected: true } as unknown as ValidationProtocolHashPayloadV1)).toThrow("undeclared field unexpected");
    expect(() => canonicalValidationProtocolBytesV1({ ...base, subjectExperiment: subjectResearchIr })).toThrow("wrong-domain HashRefV1");
    expect(() => canonicalValidationProtocolBytesV1({ ...base, folds: [{ ...holdoutFolds[0]!, trainingWindow: null }] } as unknown as ValidationProtocolHashPayloadV1)).toThrow("expected closed plain object");
  });

  it("derives phase Research IR by changing only testPeriod", () => {
    const derived = deriveValidationPhaseResearchIrV1(i5ExperimentBaseResearchIrV1, { startDate: "2020-02-05", endDate: "2020-02-06" });
    expect(derived.testPeriod).toEqual({ startDate: "2020-02-05", endDate: "2020-02-06" });
    expect(derived.pipeline).toEqual(i5ExperimentBaseResearchIrV1.pipeline);
    expect(() => assertOnlyResearchIrTestPeriodChangedV1(i5ExperimentBaseResearchIrV1, {
      ...derived,
      valuationCurrency: "EUR",
    })).toThrow("VALIDATION_PHASE_RESEARCH_IR_DRIFT");
  });

  it("slices verified DatasetSeries material by prefix without future observations", () => {
    const source = materialSeries();
    const sliced = sliceValidationDatasetSeriesPrefixV1(source.series, source.bytes, "2020-02-06");
    expect(sliced.observations.map((observation) => observation.date)).toEqual([
      "2020-01-31",
      "2020-02-03",
      "2020-02-04",
      "2020-02-05",
      "2020-02-06",
    ]);
    expect(sliced.series.coverageEnd).toBe("2020-02-06");
    expect(sliced.series.observationCount).toBe("5");
    expect(sliced.series.contentSha256).toBe(sha256HexV1(sliced.bytes));
    expect(hashDatasetSeriesV1(sliced.series)).not.toBe(hashDatasetSeriesV1(source.series));
    expect(sliced.bytes.toString("utf8")).not.toContain("2020-02-07");
    expect(sliced.bytes.toString("utf8")).not.toContain("2020-02-10");
  });

  it("fails closed on malformed material, hash mismatch and empty prefixes", () => {
    const source = materialSeries();
    expect(() => sliceValidationDatasetSeriesPrefixV1(source.series, Buffer.from(`${source.bytes.toString("utf8").trimEnd()}\r\n`, "utf8"), "2020-02-06")).toThrow("DATASET_MATERIAL_SCHEMA_INVALID");
    expect(() => sliceValidationDatasetSeriesPrefixV1({ ...source.series, contentSha256: "F".repeat(64) }, source.bytes, "2020-02-06")).toThrow("DATASET_MATERIAL_HASH_MISMATCH");
    expect(() => sliceValidationDatasetSeriesPrefixV1(source.series, source.bytes, "2020-01-30")).toThrow("VALIDATION_PREFIX_EMPTY");
    expect(() => sliceValidationDatasetSeriesPrefixV1(source.series, source.bytes, "2020-02-08")).toThrow("VALIDATION_PHASE_END_NOT_XNYS_SESSION");
  });

  it("fails closed when phase end is outside coverage or missing from otherwise valid material", () => {
    const coveredObservations = materialObservations.slice(0, 5);
    const coveredBytes = canonicalDatasetSeriesMaterialBytesV1(coveredObservations);
    const coveredSeries = {
      ...datasetSeriesV1,
      coverageEnd: "2020-02-06",
      observationCount: String(coveredObservations.length),
      contentSha256: sha256HexV1(coveredBytes),
    };
    const missingEndObservations = materialObservations.filter((observation) => observation.date !== "2020-02-06");
    const missingEndBytes = canonicalDatasetSeriesMaterialBytesV1(missingEndObservations);
    const missingEndSeries = {
      ...datasetSeriesV1,
      coverageEnd: "2020-02-10",
      observationCount: String(missingEndObservations.length),
      contentSha256: sha256HexV1(missingEndBytes),
    };
    expect(() => sliceValidationDatasetSeriesPrefixV1(coveredSeries, coveredBytes, "2020-02-07")).toThrow("VALIDATION_PHASE_END_OUTSIDE_SOURCE_COVERAGE");
    expect(() => sliceValidationDatasetSeriesPrefixV1(missingEndSeries, missingEndBytes, "2020-02-06")).toThrow("VALIDATION_PHASE_END_MATERIAL_MISSING");
  });

  it("binds the exact ExecutionConfig hash and missing-data policy", () => {
    const base = protocol("CHRONOLOGICAL_HOLDOUT", holdoutFolds);
    expect(() => assertExecutionConfigBoundToValidationProtocolV1(base, executionConfigV1)).not.toThrow();
    expect(() => assertExecutionConfigBoundToValidationProtocolV1({ ...base, executionConfig: ref("SYNTRAKE:EXECUTION_CONFIG:V1", "E".repeat(64)) }, executionConfigV1)).toThrow("VALIDATION_EXECUTION_CONFIG_HASH_MISMATCH");
  });

  it("keeps the RL-3A slice independent from trading, persistence, API and UI surfaces", () => {
    const source = readFileSync("lib/investing/research/validationProtocol.ts", "utf8").toLowerCase();
    for (const forbidden of ["lib/trading", "portfolio", "accounting", "broker", "paper", "capital", "supabase", "api/", "react"]) {
      expect(source).not.toContain(forbidden);
    }
  });
});
