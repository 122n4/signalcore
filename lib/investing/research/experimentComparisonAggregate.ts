import { classifyRobustnessV1, type ComparisonFailClosedErrorV1, type RobustnessDecisionV1, type RobustnessDiagnosticV1 } from "./experimentComparisonClassification";
import { deriveFoldStabilityEvidenceV1, deriveNeighborhoodStabilityEvidenceV1, type SignedEvidenceV1 } from "./experimentComparisonStability";
import type { DirectionalComparisonMetricIdV1 } from "./experimentComparison";

export type ExperimentComparisonAggregateInputV1 = Readonly<{
  primaryMetricId: DirectionalComparisonMetricIdV1;
  aggregateOosOrientedDeltaSign: -1 | 0 | 1 | null;
  folds: readonly SignedEvidenceV1[];
  neighborhoodMembers: readonly SignedEvidenceV1[];
  diagnostics: readonly RobustnessDiagnosticV1[];
  failure: ComparisonFailClosedErrorV1 | null;
}>;

export type ExperimentComparisonAggregateV1 = Readonly<{
  decision: RobustnessDecisionV1;
  completeFoldCount: number;
  degradedFoldCount: number;
  nonDegradedFoldCount: number;
  neighborhoodMemberCount: number;
  degradedMemberCount: number;
  improvedOrEqualMemberCount: number;
}>;

export function aggregateExperimentComparisonV1(input: ExperimentComparisonAggregateInputV1): ExperimentComparisonAggregateV1 {
  const foldEvidence = deriveFoldStabilityEvidenceV1(input.folds);
  const neighborhoodEvidence = deriveNeighborhoodStabilityEvidenceV1(input.neighborhoodMembers);
  const diagnostics = new Set<RobustnessDiagnosticV1>(input.diagnostics);

  if (input.aggregateOosOrientedDeltaSign === null) diagnostics.add("METRIC_UNAVAILABLE");
  if (foldEvidence.completeFoldCount < 3) diagnostics.add("INCOMPLETE_VALIDATION");
  if (neighborhoodEvidence.neighborhoodMemberCount < 3) diagnostics.add("INSUFFICIENT_PARAMETER_NEIGHBORHOOD");
  if (foldEvidence.foldDirectionConcentration) diagnostics.add("FOLD_DIRECTION_CONCENTRATION");

  const decision = classifyRobustnessV1({
    primaryMetricId: input.primaryMetricId,
    completeFoldCount: foldEvidence.completeFoldCount,
    neighborhoodMemberCount: neighborhoodEvidence.neighborhoodMemberCount,
    requiredMetricAvailable: input.aggregateOosOrientedDeltaSign !== null,
    aggregateOosOrientedDeltaSign: input.aggregateOosOrientedDeltaSign ?? 0,
    degradedFoldCount: foldEvidence.degradedFoldCount,
    nonDegradedFoldCount: foldEvidence.nonDegradedFoldCount,
    degradedMemberCount: neighborhoodEvidence.degradedMemberCount,
    improvedOrEqualMemberCount: neighborhoodEvidence.improvedOrEqualMemberCount,
    diagnostics: [...diagnostics],
    failure: input.failure,
  });

  return Object.freeze({
    decision,
    completeFoldCount: foldEvidence.completeFoldCount,
    degradedFoldCount: foldEvidence.degradedFoldCount,
    nonDegradedFoldCount: foldEvidence.nonDegradedFoldCount,
    neighborhoodMemberCount: neighborhoodEvidence.neighborhoodMemberCount,
    degradedMemberCount: neighborhoodEvidence.degradedMemberCount,
    improvedOrEqualMemberCount: neighborhoodEvidence.improvedOrEqualMemberCount,
  });
}
