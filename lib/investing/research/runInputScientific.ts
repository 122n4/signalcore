import {
  hashRefV1,
  hashRunInputV1,
  type CanonicalSha256HexV1,
  type HashRefV1,
  type RunInputHashPayloadV1,
} from "./canonical";
import {
  hashDatasetSnapshotV1,
  hashDatasetSeriesV1,
  hashExecutionConfigV1,
  hashMetricRequestSetV1,
  type DatasetSeriesHashPayloadV1,
  type DatasetSnapshotHashPayloadV1,
  type ExecutionConfigHashPayloadV1,
  type MetricRequestSetHashPayloadV1,
} from "./executionMaterials";
import { hashExperimentV1, type ExperimentCandidateV1 } from "./experiment";
import { hashResearchIrV1, type ResearchIrV1 } from "./researchIr";
import { hashResearchSpecV1, type ResearchSpecCandidateInputV1 } from "./semantic";

export type ScientificRunInputCandidateV1 = Readonly<{
  runInput: RunInputHashPayloadV1;
  researchSpec: ResearchSpecCandidateInputV1;
  researchIr: ResearchIrV1;
  experiment: ExperimentCandidateV1;
  datasetSeries: readonly DatasetSeriesHashPayloadV1[];
  datasetSnapshot: DatasetSnapshotHashPayloadV1;
  metricRequestSet: MetricRequestSetHashPayloadV1;
  executionConfig: ExecutionConfigHashPayloadV1;
}>;

export type AdmittedScientificRunInputV1 = Readonly<{
  runInput: RunInputHashPayloadV1;
  runInputHash: HashRefV1;
}>;

export function admitScientificRunInputV1(input: ScientificRunInputCandidateV1): AdmittedScientificRunInputV1 {
  const researchSpec = ref("SYNTRAKE:RESEARCH_SPEC:V1", hashResearchSpecV1(input.researchSpec));
  const researchIr = ref("SYNTRAKE:RESEARCH_IR:V1", hashResearchIrV1(input.researchIr));
  const experiment = ref("SYNTRAKE:EXPERIMENT:V1", hashExperimentV1(input.experiment));
  const datasetSeries = canonicalDatasetSeriesRefs(input.datasetSeries);
  const datasetSnapshot = ref("SYNTRAKE:DATASET_SNAPSHOT:V1", hashDatasetSnapshotV1(input.datasetSnapshot));
  const metricRequestSet = ref("SYNTRAKE:METRIC_REQUEST_SET:V1", hashMetricRequestSetV1(input.metricRequestSet));
  const executionConfig = ref("SYNTRAKE:EXECUTION_CONFIG:V1", hashExecutionConfigV1(input.executionConfig));

  assertSameRef(input.runInput.researchSpec, researchSpec, "ResearchSpec");
  assertSameRef(input.runInput.researchIr, researchIr, "Research IR");
  assertSameRef(input.runInput.experiment, experiment, "Experiment");
  assertSameRef(input.runInput.datasetSnapshot, datasetSnapshot, "DatasetSnapshot");
  assertSameRef(input.runInput.metricRequestSet, metricRequestSet, "MetricRequestSet");
  assertSameRef(input.runInput.executionConfig, executionConfig, "ExecutionConfig");
  assertDatasetSnapshotSeries(datasetSeries, input.datasetSnapshot.series);
  assertSameRef(input.runInput.researchIr, hashRefV1(input.experiment.researchIr), "RunInput Research IR must match Experiment Research IR");

  if (input.metricRequestSet.metricRegistryVersion !== input.runInput.metricRegistryVersion) {
    throw new Error("MetricRequestSet registry must match RunInput metricRegistryVersion");
  }
  if (input.executionConfig.engineCompatibilityVersion !== input.runInput.engineVersion) {
    throw new Error("ExecutionConfig engine compatibility must match RunInput engineVersion");
  }
  if (input.runInput.researchSourceContext === "USER_PORTFOLIO") {
    throw new Error("USER_PORTFOLIO RunInput remains fail-closed until AccountResearchContext owner contract exists");
  }
  if (input.runInput.engineVersion === "ENGINE_V20260926") {
    admitEngineV2ScientificRunInput(input);
  }

  const runInputHash = hashRunInputV1(input.runInput);
  return Object.freeze({ runInput: input.runInput, runInputHash: ref("SYNTRAKE:RUN_INPUT:V1", runInputHash) });
}

function admitEngineV2ScientificRunInput(input: ScientificRunInputCandidateV1): void {
  const runInput = input.runInput;
  if (
    runInput.schemaVersion !== "RUN_INPUT_HASH_PAYLOAD_V1" ||
    runInput.runType !== "HISTORICAL_BACKTEST" ||
    runInput.researchEnvironment !== "HISTORICAL_BACKTEST" ||
    runInput.researchSourceContext !== "PURE_RESEARCH" ||
    runInput.accountResearchContext !== undefined ||
    runInput.engineId !== "HISTORICAL_EXECUTION_ADAPTER" ||
    runInput.metricRegistryVersion !== "METRIC_REGISTRY_V20260918"
  ) throw new Error("UNSUPPORTED_RUN_PROFILE");
  if (runInput.deterministicSeed !== undefined) throw new Error("UNSUPPORTED_V2_DETERMINISTIC_SEED");
  const policies = [...runInput.materialPolicies].sort((a, b) => a.policyId.localeCompare(b.policyId));
  if (
    policies.length !== 2 ||
    policies[0]?.policyId !== "DATASET_SNAPSHOT" ||
    policies[0]?.policyVersion !== "DATASET_SNAPSHOT_POLICY_V1" ||
    policies[1]?.policyId !== "EXECUTION_CONFIG" ||
    policies[1]?.policyVersion !== "EXECUTION_CONFIG_HASH_PAYLOAD_V1"
  ) throw new Error("UNSUPPORTED_V2_MATERIAL_POLICIES");
  const requests = [...input.metricRequestSet.requests].sort((a, b) => a.metricId.localeCompare(b.metricId));
  if (
    input.metricRequestSet.metricRegistryVersion !== "METRIC_REGISTRY_V20260918" ||
    requests.length !== 2 ||
    requests[0]?.metricId !== "MAX_DRAWDOWN" ||
    requests[0]?.metricVersion !== "METRIC_V1" ||
    requests[1]?.metricId !== "TOTAL_RETURN" ||
    requests[1]?.metricVersion !== "METRIC_V1"
  ) throw new Error("UNSUPPORTED_V2_METRIC_REQUEST_SET");
}

export function admittedDatasetSeriesRefsV1(input: ScientificRunInputCandidateV1): readonly HashRefV1[] {
  return canonicalDatasetSeriesRefs(input.datasetSeries);
}

function canonicalDatasetSeriesRefs(series: readonly DatasetSeriesHashPayloadV1[]) {
  if (!Array.isArray(series) || series.length < 1) throw new Error("DatasetSeries payloads required");
  const refs = series.map((payload) => ref("SYNTRAKE:DATASET_SERIES:V1", hashDatasetSeriesV1(payload)));
  const sorted = [...refs].sort((left, right) => left.hashHex < right.hashHex ? -1 : left.hashHex > right.hashHex ? 1 : 0);
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index - 1]!.hashHex === sorted[index]!.hashHex) throw new Error("duplicate DatasetSeries payload");
  }
  return sorted;
}

function assertDatasetSnapshotSeries(proven: readonly HashRefV1[], snapshotSeries: readonly HashRefV1[]) {
  const snapshot = snapshotSeries.map(hashRefV1);
  const sorted = [...snapshot].sort((left, right) => left.hashHex < right.hashHex ? -1 : left.hashHex > right.hashHex ? 1 : 0);
  if (proven.length !== sorted.length) throw new Error("DatasetSnapshot DatasetSeries proof mismatch");
  for (let index = 0; index < proven.length; index += 1) {
    assertSameRef(sorted[index]!, proven[index]!, "DatasetSnapshot DatasetSeries proof");
  }
}

function ref(hashDomain: HashRefV1["hashDomain"], hashHex: CanonicalSha256HexV1) {
  return hashRefV1({ hashAlgorithm: "SHA-256", hashDomain, hashVersion: "SYNTRAKE_SHA256_V1", hashHex });
}

function assertSameRef(actualInput: HashRefV1, expectedInput: HashRefV1, name: string) {
  const actual = hashRefV1(actualInput);
  const expected = hashRefV1(expectedInput);
  if (
    actual.hashAlgorithm !== expected.hashAlgorithm ||
    actual.hashDomain !== expected.hashDomain ||
    actual.hashVersion !== expected.hashVersion ||
    actual.hashHex !== expected.hashHex
  ) {
    throw new Error(`${name} HashRef mismatch`);
  }
}
