import {
  hashRefV1,
  hashRunInputV1,
  type CanonicalSha256HexV1,
  type HashRefV1,
  type RunInputHashPayloadV1,
} from "./canonical";
import {
  hashDatasetSnapshotV1,
  hashExecutionConfigV1,
  hashMetricRequestSetV1,
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
  const datasetSnapshot = ref("SYNTRAKE:DATASET_SNAPSHOT:V1", hashDatasetSnapshotV1(input.datasetSnapshot));
  const metricRequestSet = ref("SYNTRAKE:METRIC_REQUEST_SET:V1", hashMetricRequestSetV1(input.metricRequestSet));
  const executionConfig = ref("SYNTRAKE:EXECUTION_CONFIG:V1", hashExecutionConfigV1(input.executionConfig));

  assertSameRef(input.runInput.researchSpec, researchSpec, "ResearchSpec");
  assertSameRef(input.runInput.researchIr, researchIr, "Research IR");
  assertSameRef(input.runInput.experiment, experiment, "Experiment");
  assertSameRef(input.runInput.datasetSnapshot, datasetSnapshot, "DatasetSnapshot");
  assertSameRef(input.runInput.metricRequestSet, metricRequestSet, "MetricRequestSet");
  assertSameRef(input.runInput.executionConfig, executionConfig, "ExecutionConfig");
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

  const runInputHash = hashRunInputV1(input.runInput);
  return Object.freeze({ runInput: input.runInput, runInputHash: ref("SYNTRAKE:RUN_INPUT:V1", runInputHash) });
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
