import { hashRefV1, type HashRefV1 } from "./canonical";
import { canonicalExperimentComparisonResultV1, type ComparisonProtocolHashRefV1, type ExperimentComparisonResultV1, type ParameterDeltaV1, type ScientificInputDeltaV1 } from "./experimentComparisonResult";
import { robustnessComparisonPolicyV1, type DirectionalComparisonMetricIdV1 } from "./experimentComparison";
import { classifyRobustnessV1, type ComparisonFailClosedErrorV1, type RobustnessDiagnosticV1 } from "./experimentComparisonClassification";
import { compareExactMetricObservationV1, directionalMetricDeltaSignV1, type ExactMetricDeltaV1, type ExactMetricObservationV1 } from "./experimentComparisonEvidence";

export type VerifiedComparisonExperimentNodeV1 = Readonly<{
  experiment: HashRefV1;
  tenantAuthority: string;
  investigationId: string;
  researchIrFamily: string;
  relation: "BASELINE" | "VARIANT";
}>;

export type VerifiedScientificInputFingerprintV1 = Readonly<{
  datasetSnapshot: string;
  executionConfig: string;
  metricRequestSet: string;
  engine: string;
  metricRegistry: "METRIC_REGISTRY_V20260927";
  benchmark: string;
  evaluationPeriod: string;
  validationProtocol: string;
}>;

export type ComparableParameterOperationV1 =
  | Readonly<{ type: "FILTER" | "ENTER" | "EXIT"; expressionPath: readonly string[]; literalType: "DECIMAL" | "INTEGER" | "DATE"; literalValue: string }>
  | Readonly<{ type: "TAKE"; count: string }>
  | Readonly<{ type: "WEIGHT"; targets: readonly Readonly<{ instrumentId: string; weight: string }>[] }>
  | Readonly<{ type: "REBALANCE"; schedule: "DAILY" | "WEEKLY" | "MONTHLY" | "QUARTERLY" | "ANNUAL" }>;

export type VerifiedComparisonEvidenceV1 = Readonly<{
  protocol: ComparisonProtocolHashRefV1;
  reference: VerifiedComparisonExperimentNodeV1;
  subject: VerifiedComparisonExperimentNodeV1;
  subjectAncestry: readonly HashRefV1[];
  ambiguousAncestry?: boolean;
  referenceScientificInputs: VerifiedScientificInputFingerprintV1;
  subjectScientificInputs: VerifiedScientificInputFingerprintV1;
  referenceParameters: readonly ComparableParameterOperationV1[];
  subjectParameters: readonly ComparableParameterOperationV1[];
  metricObservations: readonly Readonly<{ reference: ExactMetricObservationV1; subject: ExactMetricObservationV1 }>[];
  primaryMetricId: DirectionalComparisonMetricIdV1;
  foldSigns: readonly (-1 | 0 | 1)[];
  neighborhoodSigns: readonly (-1 | 0 | 1)[];
  costEvidence: ExperimentComparisonResultV1["costEvidence"];
  concentrationEvidence: ExperimentComparisonResultV1["concentrationEvidence"];
}>;

export function buildExperimentComparisonResultV1(input: VerifiedComparisonEvidenceV1): ExperimentComparisonResultV1 {
  const lineageFailure = deriveLineageFailure(input.reference, input.subject, input.subjectAncestry, input.ambiguousAncestry === true);
  const scientificInputDelta = deriveScientificInputDelta(input.referenceScientificInputs, input.subjectScientificInputs);
  const validationProtocolMismatch = scientificInputDelta.some((delta) => delta.field === "VALIDATION_PROTOCOL");
  const scientificMismatch = scientificInputDelta.some((delta) => delta.field !== "VALIDATION_PROTOCOL");
  const parameter = deriveParameterDeltas(input.referenceParameters, input.subjectParameters);
  const metricDeltas = deriveMetricDeltas(input.metricObservations);
  const primaryMetric = input.metricObservations.find((pair) => pair.reference.metricId === input.primaryMetricId);
  const primaryOutcome = primaryMetric === undefined ? null : compareExactMetricObservationV1(primaryMetric.reference, primaryMetric.subject);
  const aggregateOosOrientedDeltaSign = primaryOutcome === null ? null : directionalMetricDeltaSignV1(primaryOutcome, input.primaryMetricId);
  const metricUnavailable = primaryOutcome === null || aggregateOosOrientedDeltaSign === null;
  const validationEvidence = deriveValidationEvidence(input.foldSigns, aggregateOosOrientedDeltaSign ?? 0);
  const neighborhoodEvidence = deriveNeighborhoodEvidence(input.neighborhoodSigns);
  const diagnostics = deriveDiagnostics(input.costEvidence, neighborhoodEvidence, input.concentrationEvidence, metricUnavailable);
  const failure = lineageFailure ?? parameter.failure ?? (scientificMismatch ? "INCOMPATIBLE_SCIENTIFIC_INPUTS" : null) ?? (validationProtocolMismatch ? "INCOMPARABLE_VALIDATION_PROTOCOL" : null);
  const decision = classifyRobustnessV1({
    primaryMetricId: input.primaryMetricId,
    completeFoldCount: Number(BigInt(validationEvidence.completeFoldCount)),
    neighborhoodMemberCount: neighborhoodEvidence.state === "AVAILABLE" ? Number(BigInt(neighborhoodEvidence.neighborhoodMemberCount)) : 0,
    requiredMetricAvailable: !metricUnavailable,
    aggregateOosOrientedDeltaSign: Number(validationEvidence.aggregateOosOrientedDeltaSign) as -1 | 0 | 1,
    degradedFoldCount: Number(BigInt(validationEvidence.degradedFoldCount)),
    nonDegradedFoldCount: Number(BigInt(validationEvidence.nonDegradedFoldCount)),
    degradedMemberCount: neighborhoodEvidence.state === "AVAILABLE" ? Number(BigInt(neighborhoodEvidence.degradedMemberCount)) : 0,
    improvedOrEqualMemberCount: neighborhoodEvidence.state === "AVAILABLE" ? Number(BigInt(neighborhoodEvidence.improvedOrEqualMemberCount)) : 0,
    diagnostics,
    failure,
  });
  const result: ExperimentComparisonResultV1 = Object.freeze({
    schemaVersion: "EXPERIMENT_COMPARISON_RESULT_V1",
    protocol: input.protocol,
    parameterDeltas: parameter.deltas,
    scientificInputDelta,
    metricDeltas,
    validationEvidence,
    costEvidence: input.costEvidence,
    neighborhoodEvidence,
    concentrationEvidence: input.concentrationEvidence,
    diagnostics: decision.diagnostics,
    classification: decision.classification,
    failure: decision.failure,
  });
  canonicalExperimentComparisonResultV1(result);
  return result;
}

function deriveLineageFailure(
  reference: VerifiedComparisonExperimentNodeV1,
  subject: VerifiedComparisonExperimentNodeV1,
  subjectAncestry: readonly HashRefV1[],
  ambiguous: boolean,
): ComparisonFailClosedErrorV1 | null {
  if (ambiguous) return "INCOMPARABLE_LINEAGE";
  const ref = hashRefV1(reference.experiment);
  const subj = hashRefV1(subject.experiment);
  if (ref.hashHex === subj.hashHex) return "INCOMPARABLE_LINEAGE";
  if (reference.tenantAuthority !== subject.tenantAuthority || reference.investigationId !== subject.investigationId || reference.researchIrFamily !== subject.researchIrFamily) return "INCOMPARABLE_LINEAGE";
  if (subject.relation !== "VARIANT") return "INCOMPARABLE_LINEAGE";
  if (reference.relation !== "BASELINE" && reference.relation !== "VARIANT") return "INCOMPARABLE_LINEAGE";
  const ancestry = subjectAncestry.map(hashRefV1);
  if (new Set(ancestry.map((entry) => entry.hashHex)).size !== ancestry.length) return "INCOMPARABLE_LINEAGE";
  return ancestry.some((entry) => entry.hashHex === ref.hashHex) ? null : "INCOMPARABLE_LINEAGE";
}

function deriveScientificInputDelta(reference: VerifiedScientificInputFingerprintV1, subject: VerifiedScientificInputFingerprintV1): ScientificInputDeltaV1[] {
  const fields: readonly [ScientificInputDeltaV1["field"], keyof VerifiedScientificInputFingerprintV1][] = [
    ["DATASET_SNAPSHOT", "datasetSnapshot"],
    ["EXECUTION_CONFIG", "executionConfig"],
    ["METRIC_REQUEST_SET", "metricRequestSet"],
    ["ENGINE", "engine"],
    ["METRIC_REGISTRY", "metricRegistry"],
    ["BENCHMARK", "benchmark"],
    ["EVALUATION_PERIOD", "evaluationPeriod"],
    ["VALIDATION_PROTOCOL", "validationProtocol"],
  ];
  return fields.flatMap(([field, key]) => reference[key] === subject[key] ? [] : [Object.freeze({ field, referenceValue: reference[key], subjectValue: subject[key] })]);
}

function deriveParameterDeltas(reference: readonly ComparableParameterOperationV1[], subject: readonly ComparableParameterOperationV1[]): { readonly deltas: readonly ParameterDeltaV1[]; readonly failure: ComparisonFailClosedErrorV1 | null } {
  if (reference.length !== subject.length) return { deltas: [], failure: "INCOMPARABLE_PARAMETER_STRUCTURE" };
  const deltas: ParameterDeltaV1[] = [];
  for (let index = 0; index < reference.length; index += 1) {
    const left = reference[index]!;
    const right = subject[index]!;
    if (left.type !== right.type) return { deltas: [], failure: "INCOMPARABLE_PARAMETER_STRUCTURE" };
    const pipelineOperationIndex = String(index);
    switch (left.type) {
      case "FILTER":
      case "ENTER":
      case "EXIT": {
        const rhs = right as typeof left;
        if (pathKey(left.expressionPath) !== pathKey(rhs.expressionPath) || left.literalType !== rhs.literalType) return { deltas: [], failure: "INCOMPARABLE_PARAMETER_STRUCTURE" };
        if (left.literalValue !== rhs.literalValue) deltas.push(Object.freeze({ kind: "COMPARE_LITERAL_VALUE_DELTA", pipelineOperationIndex, operationType: left.type, expressionPath: left.expressionPath, literalType: left.literalType, referenceValue: left.literalValue, subjectValue: rhs.literalValue }));
        break;
      }
      case "TAKE":
        if (left.count !== (right as typeof left).count) deltas.push(Object.freeze({ kind: "TAKE_COUNT_DELTA", pipelineOperationIndex, operationType: "TAKE", path: ["count"] as const, referenceValue: left.count, subjectValue: (right as typeof left).count }));
        break;
      case "WEIGHT": {
        const rhs = right as typeof left;
        const lhsTargets = [...left.targets].sort((a, b) => byteCompare(a.instrumentId, b.instrumentId));
        const rhsTargets = [...rhs.targets].sort((a, b) => byteCompare(a.instrumentId, b.instrumentId));
        if (lhsTargets.length !== rhsTargets.length) return { deltas: [], failure: "INCOMPARABLE_PARAMETER_STRUCTURE" };
        for (let targetIndex = 0; targetIndex < lhsTargets.length; targetIndex += 1) {
          const lhs = lhsTargets[targetIndex]!;
          const rhsTarget = rhsTargets[targetIndex]!;
          if (lhs.instrumentId !== rhsTarget.instrumentId) return { deltas: [], failure: "INCOMPARABLE_PARAMETER_STRUCTURE" };
          if (lhs.weight !== rhsTarget.weight) deltas.push(Object.freeze({ kind: "FIXED_TARGET_WEIGHT_DELTA", pipelineOperationIndex, operationType: "WEIGHT", path: ["targets", lhs.instrumentId, "weight"] as const, instrumentId: lhs.instrumentId, referenceValue: lhs.weight, subjectValue: rhsTarget.weight }));
        }
        break;
      }
      case "REBALANCE":
        if (left.schedule !== (right as typeof left).schedule) deltas.push(Object.freeze({ kind: "REBALANCE_SCHEDULE_DELTA", pipelineOperationIndex, operationType: "REBALANCE", path: ["schedule"] as const, referenceValue: left.schedule, subjectValue: (right as typeof left).schedule }));
        break;
      default:
        return { deltas: [], failure: "INCOMPARABLE_PARAMETER_STRUCTURE" };
    }
  }
  return { deltas, failure: null };
}

function deriveMetricDeltas(input: readonly Readonly<{ reference: ExactMetricObservationV1; subject: ExactMetricObservationV1 }>[]): readonly ExactMetricDeltaV1[] {
  const deltas = input.flatMap((pair) => {
    const outcome = compareExactMetricObservationV1(pair.reference, pair.subject);
    return outcome.state === "AVAILABLE" ? [outcome.delta] : [];
  });
  deltas.sort((a, b) => byteCompare(a.metricId, b.metricId));
  return Object.freeze(deltas);
}

function deriveValidationEvidence(foldSigns: readonly (-1 | 0 | 1)[], aggregateOosOrientedDeltaSign: -1 | 0 | 1): ExperimentComparisonResultV1["validationEvidence"] {
  const completeFoldCount = foldSigns.length;
  const degradedFoldCount = foldSigns.filter((sign) => sign < 0).length;
  return Object.freeze({
    completeFoldCount: String(completeFoldCount),
    degradedFoldCount: String(degradedFoldCount),
    nonDegradedFoldCount: String(completeFoldCount - degradedFoldCount),
    aggregateOosOrientedDeltaSign: String(aggregateOosOrientedDeltaSign) as "-1" | "0" | "1",
  });
}

function deriveNeighborhoodEvidence(signs: readonly (-1 | 0 | 1)[]): ExperimentComparisonResultV1["neighborhoodEvidence"] {
  if (signs.length === 0) return Object.freeze({ state: "UNAVAILABLE", reason: "INSUFFICIENT_PARAMETER_NEIGHBORHOOD" });
  const degradedMemberCount = signs.filter((sign) => sign < 0).length;
  return Object.freeze({
    state: "AVAILABLE",
    neighborhoodMemberCount: String(signs.length),
    degradedMemberCount: String(degradedMemberCount),
    improvedOrEqualMemberCount: String(signs.length - degradedMemberCount),
  });
}

function deriveDiagnostics(
  costEvidence: ExperimentComparisonResultV1["costEvidence"],
  neighborhoodEvidence: ExperimentComparisonResultV1["neighborhoodEvidence"],
  concentrationEvidence: ExperimentComparisonResultV1["concentrationEvidence"],
  metricUnavailable: boolean,
): readonly RobustnessDiagnosticV1[] {
  const diagnostics = new Set<RobustnessDiagnosticV1>();
  if (metricUnavailable) diagnostics.add("METRIC_UNAVAILABLE");
  if (costEvidence.state === "UNAVAILABLE") diagnostics.add("MISSING_EXACT_COST_EVIDENCE");
  if (neighborhoodEvidence.state === "UNAVAILABLE" || BigInt(neighborhoodEvidence.neighborhoodMemberCount) < robustnessComparisonPolicyV1.minimumNeighborhoodMembers) diagnostics.add("INSUFFICIENT_PARAMETER_NEIGHBORHOOD");
  if (concentrationEvidence.state === "UNAVAILABLE") diagnostics.add("UNSUPPORTED_CONCENTRATION_EVIDENCE");
  if (concentrationEvidence.state === "AVAILABLE") {
    if (BigInt(concentrationEvidence.tradeCount) < BigInt(robustnessComparisonPolicyV1.minimumTradeCount) || BigInt(concentrationEvidence.rebalanceCount) < BigInt(robustnessComparisonPolicyV1.minimumRebalanceCount)) diagnostics.add("LOW_EVENT_COUNT_DEPENDENCE");
    if (concentrationEvidence.foldDirectionConcentration) diagnostics.add("FOLD_DIRECTION_CONCENTRATION");
  }
  return Object.freeze([...diagnostics].sort(byteCompare));
}

function pathKey(path: readonly string[]): string { return path.join("\u0000"); }
function byteCompare(a: string, b: string): number { return Buffer.from(a, "utf8").compare(Buffer.from(b, "utf8")); }
