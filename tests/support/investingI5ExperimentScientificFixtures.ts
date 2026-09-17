import {
  hashExperimentParametersV1,
  hashExperimentV1,
  hashRefV1,
  hashResearchIrV1,
  type ExperimentBaselineCandidateV1,
  type ExperimentParametersCandidateV1,
  type ExperimentVariantCandidateV1,
  type HashRefV1,
  type ResearchIrV1,
} from "../../lib/investing/research";

const momentumField = {
  type: "DATA_FIELD_REF" as const,
  fieldId: "MOMENTUM_12M" as const,
  fieldVersion: "I5A_RESEARCH_IR_FIELD_CONTRACT_V1" as const,
};

export const i5ExperimentBaseResearchIrV1: ResearchIrV1 = {
  schemaVersion: "RESEARCH_IR_HASH_PAYLOAD_V1",
  irVersion: "RESEARCH_IR_V1",
  universe: { type: "EXPLICIT_INSTRUMENTS", instrumentIds: ["US:MSFT", "US:AAPL"] },
  pipeline: [
    { type: "FILTER", predicate: { type: "COMPARE", left: momentumField, operator: "GT", right: { type: "DECIMAL", value: "0", unit: "RATIO" } } },
    { type: "RANK", field: momentumField, direction: "DESC", missingPolicy: "EXCLUDE" },
    { type: "TAKE", count: "25" },
    {
      type: "WEIGHT",
      method: "FIXED_TARGETS",
      targets: [
        { instrumentId: "US:AAPL", weight: "0.6" },
        { instrumentId: "US:MSFT", weight: "0.4" },
      ],
    },
    { type: "REBALANCE", schedule: "MONTHLY" },
  ],
  benchmark: { type: "BENCHMARK", benchmark: "NONE" },
  testPeriod: { startDate: "2020-01-31", endDate: "2024-12-31" },
  valuationCurrency: "USD",
  startingCapital: { amount: "1000000", currency: "USD", origin: "SIMULATED" },
};

export function i5ExperimentResolvedResearchIrV1(threshold: string, take: string, aapl: string, msft: string): ResearchIrV1 {
  return {
    ...i5ExperimentBaseResearchIrV1,
    pipeline: [
      { type: "FILTER", predicate: { type: "COMPARE", left: momentumField, operator: "GT", right: { type: "DECIMAL", value: threshold, unit: "RATIO" } } },
      i5ExperimentBaseResearchIrV1.pipeline[1]!,
      { type: "TAKE", count: take },
      {
        type: "WEIGHT",
        method: "FIXED_TARGETS",
        targets: [
          { instrumentId: "US:AAPL", weight: aapl },
          { instrumentId: "US:MSFT", weight: msft },
        ],
      },
      { type: "REBALANCE", schedule: "QUARTERLY" },
    ],
  };
}

export function i5Ref(hashDomain: HashRefV1["hashDomain"], hashHex: string): HashRefV1 {
  return hashRefV1({ hashAlgorithm: "SHA-256", hashDomain, hashVersion: "SYNTRAKE_SHA256_V1", hashHex });
}

export function i5ResearchIrRef(payload: ResearchIrV1): HashRefV1 {
  return i5Ref("SYNTRAKE:RESEARCH_IR:V1", hashResearchIrV1(payload));
}

export function i5ExperimentParametersCandidateV1(resolved: ResearchIrV1): ExperimentParametersCandidateV1 {
  return {
    schemaVersion: "EXPERIMENT_PARAMETERS_CANDIDATE_V1",
    parameterizationPolicy: "I5_EXPERIMENT_PARAMETERS_POLICY_V1",
    baseResearchIr: { ref: i5ResearchIrRef(i5ExperimentBaseResearchIrV1), payload: i5ExperimentBaseResearchIrV1 },
    resolvedResearchIr: { ref: i5ResearchIrRef(resolved), payload: resolved },
  };
}

export function i5BaselineCandidateV1(researchSpecRevisionId: string): ExperimentBaselineCandidateV1 {
  return {
    schemaVersion: "EXPERIMENT_BASELINE_CANDIDATE_V1",
    relation: "BASELINE",
    researchSpecRevisionId,
    researchIr: i5ResearchIrRef(i5ExperimentBaseResearchIrV1),
  };
}

export function i5VariantCandidateV1(input: {
  parentExperimentId: string;
  researchSpecRevisionId: string;
  parentExperiment?: HashRefV1;
  resolved?: ResearchIrV1;
}): ExperimentVariantCandidateV1 {
  const baseline = i5BaselineCandidateV1(input.researchSpecRevisionId);
  const resolved = input.resolved ?? i5ExperimentResolvedResearchIrV1("0.15", "10", "0.7", "0.3");
  return {
    schemaVersion: "EXPERIMENT_VARIANT_CANDIDATE_V1",
    relation: "VARIANT",
    parentExperimentId: input.parentExperimentId,
    parentExperiment: input.parentExperiment ?? i5Ref("SYNTRAKE:EXPERIMENT:V1", hashExperimentV1(baseline)),
    parentResearchIr: baseline.researchIr,
    researchSpecRevisionId: input.researchSpecRevisionId,
    researchIr: i5ResearchIrRef(resolved),
    experimentParameters: i5ExperimentParametersCandidateV1(resolved),
  };
}

export function i5ExperimentParametersRef(candidate: ExperimentParametersCandidateV1): HashRefV1 {
  return i5Ref("SYNTRAKE:EXPERIMENT_PARAMETERS:V1", hashExperimentParametersV1(candidate));
}
