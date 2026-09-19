import {
  admitScientificRunInputV1,
  hashDatasetSeriesV1,
  hashDatasetSnapshotV1,
  hashExecutionConfigV1,
  hashExperimentV1,
  hashHypothesisV1,
  hashMetricRequestSetV1,
  hashRefV1,
  hashResearchDraftV1,
  hashResearchIrV1,
  hashResearchSpecV1,
  type DatasetSeriesHashPayloadV1,
  type DatasetSnapshotHashPayloadV1,
  type ExecutionConfigHashPayloadV1,
  type HashRefV1,
  type HypothesisHashPayloadInputV1,
  type MetricRequestSetHashPayloadV1,
  type ResearchDraftHashPayloadInputV1,
  type ResearchSpecCandidateInputV1,
  type RunInputHashPayloadV1,
} from "../../lib/investing/research";
import {
  i5BaselineCandidateV1,
  i5ExperimentBaseResearchIrV1,
} from "./investingI5ExperimentScientificFixtures";

export const datasetSeriesV1: DatasetSeriesHashPayloadV1 = {
  schemaVersion: "DATASET_SERIES_HASH_PAYLOAD_V1",
  providerDatasetId: "NASDAQ_DAILY_ADJUSTED",
  providerDatasetVersion: "V20260918",
  instrumentId: "US:AAPL",
  fieldId: "ADJUSTED_CLOSE",
  fieldVersion: "PRICE_FIELD_V1",
  frequency: "DAILY",
  timezone: "America/New_York",
  calendar: "XNYS_TRADING_CALENDAR_V1",
  currency: "USD",
  coverageStart: "2020-01-31",
  coverageEnd: "2024-12-31",
  observationCount: "1234",
  contentSha256: "0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF",
};

export const secondDatasetSeriesV1: DatasetSeriesHashPayloadV1 = {
  ...datasetSeriesV1,
  instrumentId: "US:MSFT",
  contentSha256: "ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789",
};

export const researchDraftV1: ResearchDraftHashPayloadInputV1 = {
  schemaVersion: "RESEARCH_DRAFT_HASH_PAYLOAD_V1",
  rawIntent: "Evaluate large-cap momentum on immutable historical daily prices.",
  interpretedObjective: { state: "USER_SUPPLIED", value: "Backtest large-cap momentum with fixed historical inputs." },
  constraints: [
    { state: "USER_SUPPLIED", value: "PURE_RESEARCH only; no account context." },
  ],
};

export const hypothesisV1: HypothesisHashPayloadInputV1 = {
  schemaVersion: "HYPOTHESIS_HASH_PAYLOAD_V1",
  statement: "Twelve-month momentum ranks outperform a no-trade benchmark over the fixed window.",
  nullHypothesis: "Momentum ranks do not outperform the benchmark over the fixed window.",
  rationale: "The fixture binds hypothesis identity without claiming execution results.",
  falsifiable: true,
  measurable: true,
  observableDefinitionRequirements: [],
};

export function ref(hashDomain: HashRefV1["hashDomain"], hashHex: string): HashRefV1 {
  return hashRefV1({ hashAlgorithm: "SHA-256", hashDomain, hashVersion: "SYNTRAKE_SHA256_V1", hashHex });
}

export function datasetSnapshotV1(): DatasetSnapshotHashPayloadV1 {
  return {
    schemaVersion: "DATASET_SNAPSHOT_HASH_PAYLOAD_V1",
    snapshotPolicy: "DATASET_SNAPSHOT_POLICY_V1",
    series: [
      ref("SYNTRAKE:DATASET_SERIES:V1", hashDatasetSeriesV1(secondDatasetSeriesV1)),
      ref("SYNTRAKE:DATASET_SERIES:V1", hashDatasetSeriesV1(datasetSeriesV1)),
    ],
  };
}

export const metricRequestSetV1: MetricRequestSetHashPayloadV1 = {
  schemaVersion: "METRIC_REQUEST_SET_HASH_PAYLOAD_V1",
  metricRegistryVersion: "METRIC_REGISTRY_V20260918",
  requests: [
    { metricId: "MAX_DRAWDOWN", metricVersion: "METRIC_V1" },
    { metricId: "TOTAL_RETURN", metricVersion: "METRIC_V1" },
  ],
};

export const executionConfigV1: ExecutionConfigHashPayloadV1 = {
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

export function researchSpecV1(): ResearchSpecCandidateInputV1 {
  return {
    schemaVersion: "RESEARCH_SPEC_CANDIDATE_V1",
    sourceDraft: { ref: ref("SYNTRAKE:RESEARCH_DRAFT:V1", hashResearchDraftV1(researchDraftV1)), payload: researchDraftV1 },
    hypothesisBinding: {
      kind: "EXPLICIT_HYPOTHESIS",
      hypothesis: { ref: ref("SYNTRAKE:HYPOTHESIS:V1", hashHypothesisV1(hypothesisV1)), payload: hypothesisV1 },
    },
    objective: { state: "USER_SUPPLIED", value: "Backtest large-cap momentum with fixed historical inputs." },
    status: "CANDIDATE_ONLY",
  };
}

export function runInputV1(): RunInputHashPayloadV1 {
  const spec = researchSpecV1();
  const experiment = i5BaselineCandidateV1("91000000-0000-4000-8000-000000000071");
  const snapshot = datasetSnapshotV1();
  return {
    schemaVersion: "RUN_INPUT_HASH_PAYLOAD_V1",
    runType: "HISTORICAL_BACKTEST",
    researchEnvironment: "HISTORICAL_BACKTEST",
    researchSourceContext: "PURE_RESEARCH",
    researchSpec: ref("SYNTRAKE:RESEARCH_SPEC:V1", hashResearchSpecV1(spec)),
    researchIr: ref("SYNTRAKE:RESEARCH_IR:V1", hashResearchIrV1(i5ExperimentBaseResearchIrV1)),
    experiment: ref("SYNTRAKE:EXPERIMENT:V1", hashExperimentV1(experiment)),
    datasetSnapshot: ref("SYNTRAKE:DATASET_SNAPSHOT:V1", hashDatasetSnapshotV1(snapshot)),
    engineId: "HISTORICAL_EXECUTION_ADAPTER",
    engineVersion: executionConfigV1.engineCompatibilityVersion,
    metricRegistryVersion: metricRequestSetV1.metricRegistryVersion,
    metricRequestSet: ref("SYNTRAKE:METRIC_REQUEST_SET:V1", hashMetricRequestSetV1(metricRequestSetV1)),
    executionConfig: ref("SYNTRAKE:EXECUTION_CONFIG:V1", hashExecutionConfigV1(executionConfigV1)),
    deterministicSeed: "dataset-run-seed-001",
    materialPolicies: [
      { policyId: "DATASET_SNAPSHOT", policyVersion: "DATASET_SNAPSHOT_POLICY_V1" },
      { policyId: "EXECUTION_CONFIG", policyVersion: "EXECUTION_CONFIG_HASH_PAYLOAD_V1" },
    ],
  };
}

export function scientificRunInputCandidateV1() {
  return {
    runInput: runInputV1(),
    researchSpec: researchSpecV1(),
    researchIr: i5ExperimentBaseResearchIrV1,
    experiment: i5BaselineCandidateV1("91000000-0000-4000-8000-000000000071"),
    datasetSnapshot: datasetSnapshotV1(),
    metricRequestSet: metricRequestSetV1,
    executionConfig: executionConfigV1,
  };
}

export function admittedRunInputRefV1() {
  return admitScientificRunInputV1(scientificRunInputCandidateV1()).runInputHash;
}
