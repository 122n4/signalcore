import type { DirectionalComparisonMetricIdV1 } from "./experimentComparison";

export type RobustnessClassificationV1 =
  | "ROBUSTNESS_INSUFFICIENT_EVIDENCE"
  | "ROBUSTNESS_UNSTABLE"
  | "ROBUSTNESS_DEGRADED"
  | "ROBUSTNESS_STABLE"
  | "ROBUSTNESS_MIXED";

export type ComparisonFailClosedErrorV1 =
  | "INCOMPARABLE_LINEAGE"
  | "INCOMPARABLE_PARAMETER_STRUCTURE"
  | "INCOMPATIBLE_SCIENTIFIC_INPUTS"
  | "INCOMPATIBLE_METRIC_VERSIONS"
  | "INCOMPARABLE_VALIDATION_PROTOCOL"
  | "CORRUPTED_EVIDENCE"
  | "AUTHORITY_FAILURE";

export type RobustnessDiagnosticV1 =
  | "INSUFFICIENT_EVIDENCE"
  | "MISSING_RESULT"
  | "MISSING_VALIDATION_RESULT"
  | "INCOMPLETE_VALIDATION"
  | "METRIC_UNAVAILABLE"
  | "MISSING_METRIC"
  | "METRIC_UNAVAILABLE_ON_ONE_SIDE"
  | "MISSING_EXACT_COST_EVIDENCE"
  | "UNSUPPORTED_CONCENTRATION_EVIDENCE"
  | "INSUFFICIENT_PARAMETER_NEIGHBORHOOD"
  | "LOW_EVENT_COUNT_DEPENDENCE"
  | "FOLD_DIRECTION_CONCENTRATION";

export type RobustnessDecisionInputV1 = Readonly<{
  primaryMetricId: DirectionalComparisonMetricIdV1;
  completeFoldCount: number;
  neighborhoodMemberCount: number;
  requiredMetricAvailable: boolean;
  aggregateOosOrientedDeltaSign: -1 | 0 | 1;
  degradedFoldCount: number;
  nonDegradedFoldCount: number;
  degradedMemberCount: number;
  improvedOrEqualMemberCount: number;
  diagnostics: readonly RobustnessDiagnosticV1[];
  failure: ComparisonFailClosedErrorV1 | null;
}>;

export type RobustnessDecisionV1 = Readonly<{
  classification: RobustnessClassificationV1 | null;
  failure: ComparisonFailClosedErrorV1 | null;
  diagnostics: readonly RobustnessDiagnosticV1[];
}>;

const insufficient = new Set<RobustnessDiagnosticV1>([
  "INSUFFICIENT_EVIDENCE",
  "MISSING_RESULT",
  "MISSING_VALIDATION_RESULT",
  "INCOMPLETE_VALIDATION",
  "METRIC_UNAVAILABLE",
  "MISSING_METRIC",
  "METRIC_UNAVAILABLE_ON_ONE_SIDE",
  "INSUFFICIENT_PARAMETER_NEIGHBORHOOD",
]);

export function classifyRobustnessV1(input: RobustnessDecisionInputV1): RobustnessDecisionV1 {
  assertNonNegativeInteger(input.completeFoldCount, "completeFoldCount");
  assertNonNegativeInteger(input.neighborhoodMemberCount, "neighborhoodMemberCount");
  assertNonNegativeInteger(input.degradedFoldCount, "degradedFoldCount");
  assertNonNegativeInteger(input.nonDegradedFoldCount, "nonDegradedFoldCount");
  assertNonNegativeInteger(input.degradedMemberCount, "degradedMemberCount");
  assertNonNegativeInteger(input.improvedOrEqualMemberCount, "improvedOrEqualMemberCount");
  if (![ -1, 0, 1 ].includes(input.aggregateOosOrientedDeltaSign)) throw new Error("INVALID_ORIENTED_DELTA_SIGN");
  if (input.degradedFoldCount + input.nonDegradedFoldCount > input.completeFoldCount) throw new Error("FOLD_COUNTS_EXCEED_COMPLETE_FOLDS");
  if (input.degradedMemberCount + input.improvedOrEqualMemberCount > input.neighborhoodMemberCount) throw new Error("MEMBER_COUNTS_EXCEED_NEIGHBORHOOD");

  const diagnostics = canonicalDiagnostics(input.diagnostics);
  if (input.failure !== null) return Object.freeze({ classification: null, failure: input.failure, diagnostics });

  if (
    input.completeFoldCount < 3 ||
    input.neighborhoodMemberCount < 3 ||
    !input.requiredMetricAvailable ||
    diagnostics.some((diagnostic) => insufficient.has(diagnostic))
  ) return Object.freeze({ classification: "ROBUSTNESS_INSUFFICIENT_EVIDENCE", failure: null, diagnostics });

  const foldUnstable = input.degradedFoldCount > input.nonDegradedFoldCount;
  const neighborhoodUnstable = input.degradedMemberCount > input.improvedOrEqualMemberCount;
  if (foldUnstable && neighborhoodUnstable) return Object.freeze({ classification: "ROBUSTNESS_UNSTABLE", failure: null, diagnostics });

  if (input.aggregateOosOrientedDeltaSign < 0 && input.degradedFoldCount > 0 && input.degradedMemberCount > 0) {
    return Object.freeze({ classification: "ROBUSTNESS_DEGRADED", failure: null, diagnostics });
  }

  if (
    input.aggregateOosOrientedDeltaSign >= 0 &&
    input.degradedFoldCount === 0 &&
    input.degradedMemberCount === 0 &&
    !diagnostics.includes("LOW_EVENT_COUNT_DEPENDENCE") &&
    !diagnostics.includes("FOLD_DIRECTION_CONCENTRATION")
  ) return Object.freeze({ classification: "ROBUSTNESS_STABLE", failure: null, diagnostics });

  return Object.freeze({ classification: "ROBUSTNESS_MIXED", failure: null, diagnostics });
}

function canonicalDiagnostics(input: readonly RobustnessDiagnosticV1[]): readonly RobustnessDiagnosticV1[] {
  if (!Array.isArray(input)) throw new Error("DIAGNOSTICS_NOT_ARRAY");
  const output = [...input];
  output.sort((a, b) => Buffer.from(a, "utf8").compare(Buffer.from(b, "utf8")));
  if (new Set(output).size !== output.length) throw new Error("DIAGNOSTICS_DUPLICATE");
  return Object.freeze(output);
}

function assertNonNegativeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(label + " must be a non-negative safe integer");
}
