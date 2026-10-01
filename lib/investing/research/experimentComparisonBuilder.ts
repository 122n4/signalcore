import { canonicalDateV1, canonicalDecimalV1, canonicalIntegerV1, hashRefV1, i5ResearchInternalCanonicalJsonBytesV1, type CanonicalJsonValue, type HashRefV1 } from "./canonical";
import { hashExperimentParametersV1, type ExperimentParametersCandidateV1 } from "./experimentParameters";
import { canonicalExperimentComparisonProtocolV1, hashExperimentComparisonProtocolV1, robustnessComparisonPolicyV1, type DirectionalComparisonMetricIdV1, type ExperimentComparisonProtocolV1 } from "./experimentComparison";
import { classifyRobustnessV1, type ComparisonFailClosedErrorV1, type RobustnessDiagnosticV1 } from "./experimentComparisonClassification";
import { compareExactMetricObservationV1, directionalMetricDeltaSignV1, type ExactMetricDeltaV1, type ExactMetricObservationV1 } from "./experimentComparisonEvidence";
import { canonicalExperimentComparisonResultV1, type ComparisonProtocolHashRefV1, type ExperimentComparisonResultV1, type ParameterDeltaV1, type ScientificInputDeltaV1 } from "./experimentComparisonResult";

export type VerifiedComparisonExperimentNodeV1 = Readonly<{
  experiment: HashRefV1;
  parentExperiment: HashRefV1 | null;
  tenantAuthority: string;
  investigationId: string;
  researchIrFamily: string;
  relation: "BASELINE" | "VARIANT";
  ambiguousParentEvidence?: boolean;
}>;

export type VerifiedScientificInputFingerprintV1 = Readonly<{
  datasetSnapshot: HashRefV1;
  executionConfig: HashRefV1;
  metricRequestSet: HashRefV1;
  engine: string;
  metricRegistry: "METRIC_REGISTRY_V20260927";
  benchmark: string;
  evaluationPeriod: string;
  validationProtocol: HashRefV1;
  validationResult: HashRefV1;
}>;

export type VerifiedFoldMetricEvidenceV1 = Readonly<{
  foldId: string;
  inSample: ExactMetricObservationV1;
  outOfSample: ExactMetricObservationV1;
}>;

export type VerifiedNeighborhoodMetricEvidenceV1 = Readonly<{
  experiment: HashRefV1;
  observation: ExactMetricObservationV1 | null;
  unavailableReason?: "MISSING_METRIC" | "METRIC_UNAVAILABLE_ON_ONE_SIDE";
}>;

export type VerifiedCostEvidenceV1 = Readonly<{
  explicitFeeReferenceSeries: readonly string[];
  explicitFeeSubjectSeries: readonly string[];
  slippageReferenceSeries: readonly string[];
  slippageSubjectSeries: readonly string[];
}> | null;

export type VerifiedComparisonEvidenceV1 = Readonly<{
  protocol: ComparisonProtocolHashRefV1;
  protocolPayload: ExperimentComparisonProtocolV1;
  reference: VerifiedComparisonExperimentNodeV1;
  subject: VerifiedComparisonExperimentNodeV1;
  lineageNodes: readonly VerifiedComparisonExperimentNodeV1[];
  referenceScientificInputs: VerifiedScientificInputFingerprintV1;
  subjectScientificInputs: VerifiedScientificInputFingerprintV1;
  referenceExperimentParameters: ExperimentParametersCandidateV1;
  subjectExperimentParameters: ExperimentParametersCandidateV1;
  metricObservations: readonly Readonly<{ reference: ExactMetricObservationV1; subject: ExactMetricObservationV1 }>[];
  foldEvidence: readonly VerifiedFoldMetricEvidenceV1[];
  neighborhoodEvidence: readonly VerifiedNeighborhoodMetricEvidenceV1[];
  costEvidence: VerifiedCostEvidenceV1;
  eventMetricEvidence: Readonly<{ tradeCount: ExactMetricObservationV1; rebalanceCount: ExactMetricObservationV1 }>;
}>;

export function buildExperimentComparisonResultV1(input: VerifiedComparisonEvidenceV1): ExperimentComparisonResultV1 {
  const protocolFailure = verifyProtocolBinding(input);
  const protocol = canonicalExperimentComparisonProtocolV1(input.protocolPayload) as CanonicalProtocol;
  if (protocolFailure !== null) return failClosedResult(input.protocol, protocolFailure);
  const primaryMetricId = protocol.primaryMetricId as DirectionalComparisonMetricIdV1;
  const lineageFailure = deriveLineageFailure(input.reference, input.subject, input.lineageNodes);
  const parameter = deriveParameterDeltas(input.referenceExperimentParameters, input.subjectExperimentParameters);
  const scientificInputDelta = deriveScientificInputDelta(input, protocol, parameter);
  const validationProtocolMismatch = scientificInputDelta.some((delta) => delta.field === "VALIDATION_PROTOCOL");
  const scientificMismatch = scientificInputDelta.some((delta) => materialScientificInputFields.has(delta.field));
  const metricDeltas = deriveMetricDeltas(input.metricObservations, protocol);
  const primaryMetric = input.metricObservations.find((pair) => pair.reference.metricId === primaryMetricId);
  const primaryOutcome = primaryMetric === undefined ? null : compareExactMetricObservationV1(primaryMetric.reference, primaryMetric.subject);
  const aggregateOosOrientedDeltaSign = primaryOutcome === null ? null : directionalMetricDeltaSignV1(primaryOutcome, primaryMetricId);
  const metricUnavailable = primaryOutcome === null || aggregateOosOrientedDeltaSign === null;
  const validation = deriveValidationEvidence(input.foldEvidence, primaryMetricId, aggregateOosOrientedDeltaSign ?? 0);
  const neighborhood = deriveNeighborhoodEvidence(input.neighborhoodEvidence, protocol, primaryMetric);
  const concentration = deriveConcentrationEvidence(input.eventMetricEvidence, validation.foldSigns);
  const cost = deriveCostEvidence(input.costEvidence);
  const diagnostics = deriveDiagnostics(cost.evidence, neighborhood.evidence, concentration, validation.incomplete || metricUnavailable, cost.failure);
  const failure = protocolFailure ?? lineageFailure ?? parameter.failure ?? cost.failure ?? (validation.incomplete ? "CORRUPTED_EVIDENCE" : null) ?? (scientificMismatch ? "INCOMPATIBLE_SCIENTIFIC_INPUTS" : null) ?? (validationProtocolMismatch ? "INCOMPARABLE_VALIDATION_PROTOCOL" : null);
  const decision = classifyRobustnessV1({
    primaryMetricId,
    completeFoldCount: Number(BigInt(validation.evidence.completeFoldCount)),
    neighborhoodMemberCount: neighborhood.evidence.state === "AVAILABLE" ? Number(BigInt(neighborhood.evidence.neighborhoodMemberCount)) : 0,
    requiredMetricAvailable: !metricUnavailable,
    aggregateOosOrientedDeltaSign: Number(validation.evidence.aggregateOosOrientedDeltaSign) as -1 | 0 | 1,
    degradedFoldCount: Number(BigInt(validation.evidence.degradedFoldCount)),
    nonDegradedFoldCount: Number(BigInt(validation.evidence.nonDegradedFoldCount)),
    degradedMemberCount: neighborhood.evidence.state === "AVAILABLE" ? Number(BigInt(neighborhood.evidence.degradedMemberCount)) : 0,
    improvedOrEqualMemberCount: neighborhood.evidence.state === "AVAILABLE" ? Number(BigInt(neighborhood.evidence.improvedOrEqualMemberCount)) : 0,
    diagnostics,
    failure,
  });
  const result: ExperimentComparisonResultV1 = Object.freeze({
    schemaVersion: "EXPERIMENT_COMPARISON_RESULT_V1",
    protocol: input.protocol,
    parameterDeltas: parameter.deltas,
    scientificInputDelta,
    metricDeltas,
    validationEvidence: validation.evidence,
    costEvidence: cost.evidence,
    neighborhoodEvidence: neighborhood.evidence,
    concentrationEvidence: concentration,
    diagnostics: decision.diagnostics,
    classification: decision.classification,
    failure: decision.failure,
  });
  canonicalExperimentComparisonResultV1(result);
  return result;
}

function failClosedResult(protocol: ComparisonProtocolHashRefV1, failure: ComparisonFailClosedErrorV1): ExperimentComparisonResultV1 {
  const result: ExperimentComparisonResultV1 = Object.freeze({
    schemaVersion: "EXPERIMENT_COMPARISON_RESULT_V1",
    protocol,
    parameterDeltas: [],
    scientificInputDelta: [],
    metricDeltas: [],
    validationEvidence: { completeFoldCount: "0", degradedFoldCount: "0", nonDegradedFoldCount: "0", aggregateOosOrientedDeltaSign: "0" as const },
    costEvidence: { state: "UNAVAILABLE" as const, reason: "MISSING_EXACT_COST_EVIDENCE" as const },
    neighborhoodEvidence: { state: "UNAVAILABLE" as const, reason: "INSUFFICIENT_PARAMETER_NEIGHBORHOOD" as const },
    concentrationEvidence: { state: "AVAILABLE" as const, tradeCount: "0", rebalanceCount: "0", foldDirectionConcentration: false },
    diagnostics: ["INSUFFICIENT_PARAMETER_NEIGHBORHOOD", "MISSING_EXACT_COST_EVIDENCE", "METRIC_UNAVAILABLE"] as const,
    classification: null,
    failure,
  });
  canonicalExperimentComparisonResultV1(result);
  return result;
}

type CanonicalProtocol = CanonicalJsonValue & {
  referenceExperiment: HashRefV1;
  subjectExperiment: HashRefV1;
  referenceExperimentParameters: HashRefV1;
  subjectExperimentParameters: HashRefV1;
  referenceResult: HashRefV1;
  subjectResult: HashRefV1;
  referenceValidationResult: HashRefV1;
  subjectValidationResult: HashRefV1;
  metricRegistryVersion: "METRIC_REGISTRY_V20260927";
  primaryMetricId: string;
  comparisonMetricIds: readonly string[];
  neighborhoodExperimentRefs: readonly HashRefV1[];
};

const materialScientificInputFields = new Set(["DATASET_SNAPSHOT", "EXECUTION_CONFIG", "METRIC_REQUEST_SET", "ENGINE", "METRIC_REGISTRY", "BENCHMARK", "EVALUATION_PERIOD"]);

function verifyProtocolBinding(input: VerifiedComparisonEvidenceV1): ComparisonFailClosedErrorV1 | null {
  if (hashExperimentComparisonProtocolV1(input.protocolPayload) !== input.protocol.hashHex) return "CORRUPTED_EVIDENCE";
  const protocol = canonicalExperimentComparisonProtocolV1(input.protocolPayload) as CanonicalProtocol;
  if (!sameRef(protocol.referenceExperiment, input.reference.experiment) || !sameRef(protocol.subjectExperiment, input.subject.experiment)) return "CORRUPTED_EVIDENCE";
  if (hashExperimentParametersV1(input.referenceExperimentParameters) !== protocol.referenceExperimentParameters.hashHex) return "CORRUPTED_EVIDENCE";
  if (hashExperimentParametersV1(input.subjectExperimentParameters) !== protocol.subjectExperimentParameters.hashHex) return "CORRUPTED_EVIDENCE";
  if (protocol.metricRegistryVersion !== "METRIC_REGISTRY_V20260927") return "INCOMPATIBLE_METRIC_VERSIONS";
  for (const pair of input.metricObservations) {
    if (!protocol.comparisonMetricIds.includes(pair.reference.metricId) || pair.reference.metricId !== pair.subject.metricId) return "CORRUPTED_EVIDENCE";
  }
  if (!input.metricObservations.some((pair) => pair.reference.metricId === protocol.primaryMetricId)) return "CORRUPTED_EVIDENCE";
  const protocolNeighborhood = new Set(protocol.neighborhoodExperimentRefs.map((ref) => ref.hashHex));
  if (input.neighborhoodEvidence.length !== protocolNeighborhood.size) return "CORRUPTED_EVIDENCE";
  for (const member of input.neighborhoodEvidence) if (!protocolNeighborhood.has(hashRefV1(member.experiment).hashHex)) return "CORRUPTED_EVIDENCE";
  return null;
}

function deriveLineageFailure(reference: VerifiedComparisonExperimentNodeV1, subject: VerifiedComparisonExperimentNodeV1, lineageNodes: readonly VerifiedComparisonExperimentNodeV1[]): ComparisonFailClosedErrorV1 | null {
  const ref = hashRefV1(reference.experiment);
  const subj = hashRefV1(subject.experiment);
  if (ref.hashHex === subj.hashHex) return "INCOMPARABLE_LINEAGE";
  if (reference.tenantAuthority !== subject.tenantAuthority || reference.investigationId !== subject.investigationId || reference.researchIrFamily !== subject.researchIrFamily) return "INCOMPARABLE_LINEAGE";
  if (subject.relation !== "VARIANT") return "INCOMPARABLE_LINEAGE";
  if (lineageNodes.length < 2) return "INCOMPARABLE_LINEAGE";
  const canonical = lineageNodes.map((node) => ({ ...node, experiment: hashRefV1(node.experiment), parentExperiment: node.parentExperiment === null ? null : hashRefV1(node.parentExperiment) }));
  if (canonical[0]!.experiment.hashHex !== subj.hashHex || canonical[canonical.length - 1]!.experiment.hashHex !== ref.hashHex) return "INCOMPARABLE_LINEAGE";
  if (new Set(canonical.map((node) => node.experiment.hashHex)).size !== canonical.length) return "INCOMPARABLE_LINEAGE";
  for (let index = 0; index < canonical.length; index += 1) {
    const node = canonical[index]!;
    if (node.ambiguousParentEvidence === true) return "INCOMPARABLE_LINEAGE";
    if (node.tenantAuthority !== reference.tenantAuthority || node.investigationId !== reference.investigationId || node.researchIrFamily !== reference.researchIrFamily) return "INCOMPARABLE_LINEAGE";
    if (index < canonical.length - 1) {
      const parent = canonical[index + 1]!;
      if (node.relation !== "VARIANT" || node.parentExperiment?.hashHex !== parent.experiment.hashHex) return "INCOMPARABLE_LINEAGE";
    } else if (node.relation !== reference.relation || (node.relation === "BASELINE" && node.parentExperiment !== null)) {
      return "INCOMPARABLE_LINEAGE";
    }
  }
  return null;
}

function deriveScientificInputDelta(input: VerifiedComparisonEvidenceV1, protocol: CanonicalProtocol, parameter: { referenceResolvedResearchIr: HashRefV1; subjectResolvedResearchIr: HashRefV1 }): ScientificInputDeltaV1[] {
  const fields: readonly [ScientificInputDeltaV1["field"], string, string][] = [
    ["EXPERIMENT", protocol.referenceExperiment.hashHex, protocol.subjectExperiment.hashHex],
    ["EXPERIMENT_PARAMETERS", protocol.referenceExperimentParameters.hashHex, protocol.subjectExperimentParameters.hashHex],
    ["RESOLVED_RESEARCH_IR", parameter.referenceResolvedResearchIr.hashHex, parameter.subjectResolvedResearchIr.hashHex],
    ["DATASET_SNAPSHOT", hashRefV1(input.referenceScientificInputs.datasetSnapshot).hashHex, hashRefV1(input.subjectScientificInputs.datasetSnapshot).hashHex],
    ["EXECUTION_CONFIG", hashRefV1(input.referenceScientificInputs.executionConfig).hashHex, hashRefV1(input.subjectScientificInputs.executionConfig).hashHex],
    ["METRIC_REQUEST_SET", hashRefV1(input.referenceScientificInputs.metricRequestSet).hashHex, hashRefV1(input.subjectScientificInputs.metricRequestSet).hashHex],
    ["ENGINE", input.referenceScientificInputs.engine, input.subjectScientificInputs.engine],
    ["METRIC_REGISTRY", input.referenceScientificInputs.metricRegistry, input.subjectScientificInputs.metricRegistry],
    ["BENCHMARK", input.referenceScientificInputs.benchmark, input.subjectScientificInputs.benchmark],
    ["EVALUATION_PERIOD", input.referenceScientificInputs.evaluationPeriod, input.subjectScientificInputs.evaluationPeriod],
    ["VALIDATION_PROTOCOL", hashRefV1(input.referenceScientificInputs.validationProtocol).hashHex, hashRefV1(input.subjectScientificInputs.validationProtocol).hashHex],
    ["VALIDATION_RESULT", protocol.referenceValidationResult.hashHex, protocol.subjectValidationResult.hashHex],
  ];
  return fields.flatMap(([field, referenceValue, subjectValue]) => referenceValue === subjectValue ? [] : [Object.freeze({ field, referenceValue, subjectValue })]);
}

function deriveParameterDeltas(reference: ExperimentParametersCandidateV1, subject: ExperimentParametersCandidateV1): { readonly deltas: readonly ParameterDeltaV1[]; readonly failure: ComparisonFailClosedErrorV1 | null; readonly referenceResolvedResearchIr: HashRefV1; readonly subjectResolvedResearchIr: HashRefV1 } {
  try {
    hashExperimentParametersV1(reference);
    hashExperimentParametersV1(subject);
    const referenceResolvedResearchIr = hashRefV1(reference.resolvedResearchIr.ref);
    const subjectResolvedResearchIr = hashRefV1(subject.resolvedResearchIr.ref);
    const referencePipeline = canonicalPipeline(reference.resolvedResearchIr.payload);
    const subjectPipeline = canonicalPipeline(subject.resolvedResearchIr.payload);
    if (referencePipeline.length !== subjectPipeline.length) return { deltas: [], failure: "INCOMPARABLE_PARAMETER_STRUCTURE", referenceResolvedResearchIr, subjectResolvedResearchIr };
    const deltas: ParameterDeltaV1[] = [];
    for (let index = 0; index < referencePipeline.length; index += 1) {
      const left = referencePipeline[index]!;
      const right = subjectPipeline[index]!;
      if (operationType(left) !== operationType(right)) return { deltas: [], failure: "INCOMPARABLE_PARAMETER_STRUCTURE", referenceResolvedResearchIr, subjectResolvedResearchIr };
      deltas.push(...deriveOperationDelta(String(index), left, right));
    }
    return { deltas, failure: null, referenceResolvedResearchIr, subjectResolvedResearchIr };
  } catch {
    const ref = safeRef(reference.resolvedResearchIr.ref);
    const subj = safeRef(subject.resolvedResearchIr.ref);
    return { deltas: [], failure: "INCOMPARABLE_PARAMETER_STRUCTURE", referenceResolvedResearchIr: ref, subjectResolvedResearchIr: subj };
  }
}

function deriveOperationDelta(index: string, left: CanonicalJsonValue, right: CanonicalJsonValue): ParameterDeltaV1[] {
  const lhs = objectValue(left);
  const rhs = objectValue(right);
  const type = operationType(left);
  if (type === "TAKE") return lhs.count === rhs.count ? [] : [Object.freeze({ kind: "TAKE_COUNT_DELTA", pipelineOperationIndex: index, operationType: "TAKE", path: ["count"] as const, referenceValue: String(lhs.count), subjectValue: String(rhs.count) })];
  if (type === "REBALANCE") return lhs.schedule === rhs.schedule ? [] : [Object.freeze({ kind: "REBALANCE_SCHEDULE_DELTA", pipelineOperationIndex: index, operationType: "REBALANCE", path: ["schedule"] as const, referenceValue: String(lhs.schedule), subjectValue: String(rhs.schedule) })];
  if (type === "WEIGHT") return deriveWeightDeltas(index, lhs, rhs);
  if (type === "FILTER" || type === "ENTER" || type === "EXIT") return deriveExpressionDeltas(index, type, (lhs.predicate ?? lhs.condition) as CanonicalJsonValue, (rhs.predicate ?? rhs.condition) as CanonicalJsonValue);
  if (i5ResearchInternalCanonicalJsonBytesV1(left).equals(i5ResearchInternalCanonicalJsonBytesV1(right))) return [];
  throw new Error("INCOMPARABLE_PARAMETER_STRUCTURE");
}

function deriveWeightDeltas(index: string, left: Readonly<Record<string, CanonicalJsonValue>>, right: Readonly<Record<string, CanonicalJsonValue>>): ParameterDeltaV1[] {
  if (left.method !== right.method) throw new Error("INCOMPARABLE_PARAMETER_STRUCTURE");
  if (left.method === "EQUAL") return [];
  const lhs = arrayValue(left.targets).map(objectValue).sort((a, b) => byteCompare(String(a.instrumentId), String(b.instrumentId)));
  const rhs = arrayValue(right.targets).map(objectValue).sort((a, b) => byteCompare(String(a.instrumentId), String(b.instrumentId)));
  if (lhs.length !== rhs.length) throw new Error("INCOMPARABLE_PARAMETER_STRUCTURE");
  const deltas: ParameterDeltaV1[] = [];
  for (let i = 0; i < lhs.length; i += 1) {
    const l = lhs[i]!;
    const r = rhs[i]!;
    if (l.instrumentId !== r.instrumentId) throw new Error("INCOMPARABLE_PARAMETER_STRUCTURE");
    if (l.weight !== r.weight) deltas.push(Object.freeze({ kind: "FIXED_TARGET_WEIGHT_DELTA", pipelineOperationIndex: index, operationType: "WEIGHT", path: ["targets", String(l.instrumentId), "weight"] as const, instrumentId: String(l.instrumentId), referenceValue: String(l.weight), subjectValue: String(r.weight) }));
  }
  return deltas;
}

function deriveExpressionDeltas(index: string, operationTypeValue: "FILTER" | "ENTER" | "EXIT", left: CanonicalJsonValue, right: CanonicalJsonValue, path: readonly string[] = []): ParameterDeltaV1[] {
  const lhs = objectValue(left);
  const rhs = objectValue(right);
  if (lhs.type !== rhs.type) throw new Error("INCOMPARABLE_PARAMETER_STRUCTURE");
  if (lhs.type === "COMPARE") {
    const leftRight = objectValue(lhs.right);
    const rightRight = objectValue(rhs.right);
    const comparableLeft = { ...lhs, right: { ...leftRight, value: "__VALUE__" } };
    const comparableRight = { ...rhs, right: { ...rightRight, value: "__VALUE__" } };
    if (!i5ResearchInternalCanonicalJsonBytesV1(comparableLeft).equals(i5ResearchInternalCanonicalJsonBytesV1(comparableRight))) throw new Error("INCOMPARABLE_PARAMETER_STRUCTURE");
    if (leftRight.value !== rightRight.value) {
      const literalType = String(leftRight.type);
      if (literalType !== "DECIMAL" && literalType !== "INTEGER" && literalType !== "DATE") throw new Error("INCOMPARABLE_PARAMETER_STRUCTURE");
      return [Object.freeze({ kind: "COMPARE_LITERAL_VALUE_DELTA", pipelineOperationIndex: index, operationType: operationTypeValue, expressionPath: [...path, "right", "value"], literalType, referenceValue: String(leftRight.value), subjectValue: String(rightRight.value) })];
    }
    return [];
  }
  if (lhs.type === "AND" || lhs.type === "OR") {
    const lClauses = arrayValue(lhs.clauses);
    const rClauses = arrayValue(rhs.clauses);
    if (lClauses.length !== rClauses.length) throw new Error("INCOMPARABLE_PARAMETER_STRUCTURE");
    return lClauses.flatMap((clause, clauseIndex) => deriveExpressionDeltas(index, operationTypeValue, clause, rClauses[clauseIndex]!, [...path, "clauses", String(clauseIndex)]));
  }
  if (lhs.type === "NOT") return deriveExpressionDeltas(index, operationTypeValue, lhs.clause, rhs.clause, [...path, "clause"]);
  throw new Error("INCOMPARABLE_PARAMETER_STRUCTURE");
}

function deriveMetricDeltas(input: readonly Readonly<{ reference: ExactMetricObservationV1; subject: ExactMetricObservationV1 }>[], protocol: CanonicalProtocol): readonly ExactMetricDeltaV1[] {
  const admitted = new Set(protocol.comparisonMetricIds);
  const deltas = input.flatMap((pair) => {
    if (!admitted.has(pair.reference.metricId)) throw new Error("CORRUPTED_EVIDENCE");
    const outcome = compareExactMetricObservationV1(pair.reference, pair.subject);
    return outcome.state === "AVAILABLE" ? [outcome.delta] : [];
  });
  deltas.sort((a, b) => byteCompare(a.metricId, b.metricId));
  return Object.freeze(deltas);
}

function deriveValidationEvidence(folds: readonly VerifiedFoldMetricEvidenceV1[], primaryMetricId: DirectionalComparisonMetricIdV1, aggregateOosOrientedDeltaSign: -1 | 0 | 1): { evidence: ExperimentComparisonResultV1["validationEvidence"]; foldSigns: readonly (-1 | 0 | 1)[]; incomplete: boolean } {
  const signs: (-1 | 0 | 1)[] = [];
  const seen = new Set<string>();
  let incomplete = false;
  for (const fold of [...folds].sort((a, b) => byteCompare(a.foldId, b.foldId))) {
    if (seen.has(fold.foldId)) incomplete = true;
    seen.add(fold.foldId);
    const outcome = compareExactMetricObservationV1(fold.inSample, fold.outOfSample);
    if (fold.inSample.metricId !== primaryMetricId || outcome.state !== "AVAILABLE" || outcome.delta.orientedDeltaSign === null) incomplete = true;
    else signs.push(outcome.delta.orientedDeltaSign);
  }
  const degradedFoldCount = signs.filter((sign) => sign < 0).length;
  return {
    evidence: Object.freeze({ completeFoldCount: String(signs.length), degradedFoldCount: String(degradedFoldCount), nonDegradedFoldCount: String(signs.length - degradedFoldCount), aggregateOosOrientedDeltaSign: String(aggregateOosOrientedDeltaSign) as "-1" | "0" | "1" }),
    foldSigns: Object.freeze(signs),
    incomplete,
  };
}

function deriveNeighborhoodEvidence(members: readonly VerifiedNeighborhoodMetricEvidenceV1[], protocol: CanonicalProtocol, primary: Readonly<{ reference: ExactMetricObservationV1; subject: ExactMetricObservationV1 }> | undefined): { evidence: ExperimentComparisonResultV1["neighborhoodEvidence"]; unavailableCount: number } {
  if (primary === undefined) return { evidence: Object.freeze({ state: "UNAVAILABLE", reason: "INSUFFICIENT_PARAMETER_NEIGHBORHOOD" }), unavailableCount: members.length };
  const required = new Set(protocol.neighborhoodExperimentRefs.map((ref) => ref.hashHex));
  let unavailableCount = 0;
  let degradedMemberCount = 0;
  let improvedOrEqualMemberCount = 0;
  for (const member of members) {
    if (!required.delete(hashRefV1(member.experiment).hashHex)) throw new Error("CORRUPTED_EVIDENCE");
    if (member.observation === null) {
      unavailableCount += 1;
      continue;
    }
    const outcome = compareExactMetricObservationV1(primary.reference, member.observation);
    if (outcome.state !== "AVAILABLE" || outcome.delta.orientedDeltaSign === null) {
      unavailableCount += 1;
    } else if (outcome.delta.orientedDeltaSign < 0) degradedMemberCount += 1;
    else improvedOrEqualMemberCount += 1;
  }
  if (required.size > 0 || unavailableCount > 0 || members.length < robustnessComparisonPolicyV1.minimumNeighborhoodMembers) return { evidence: Object.freeze({ state: "UNAVAILABLE", reason: "INSUFFICIENT_PARAMETER_NEIGHBORHOOD" }), unavailableCount };
  return { evidence: Object.freeze({ state: "AVAILABLE", neighborhoodMemberCount: String(members.length), degradedMemberCount: String(degradedMemberCount), improvedOrEqualMemberCount: String(improvedOrEqualMemberCount) }), unavailableCount };
}

function deriveConcentrationEvidence(eventMetricEvidence: VerifiedComparisonEvidenceV1["eventMetricEvidence"], foldSigns: readonly (-1 | 0 | 1)[]): ExperimentComparisonResultV1["concentrationEvidence"] {
  const tradeCount = eventMetricEvidence.tradeCount.state === "VALUE" && eventMetricEvidence.tradeCount.canonicalDecimal !== null ? eventMetricEvidence.tradeCount.canonicalDecimal : "0";
  const rebalanceCount = eventMetricEvidence.rebalanceCount.state === "VALUE" && eventMetricEvidence.rebalanceCount.canonicalDecimal !== null ? eventMetricEvidence.rebalanceCount.canonicalDecimal : "0";
  const positive = foldSigns.filter((sign) => sign > 0).length;
  const negative = foldSigns.filter((sign) => sign < 0).length;
  const zero = foldSigns.filter((sign) => sign === 0).length;
  return Object.freeze({ state: "AVAILABLE", tradeCount, rebalanceCount, foldDirectionConcentration: foldSigns.length > 0 && Math.max(positive, negative, zero) >= Math.ceil(foldSigns.length * 0.8) });
}

function deriveCostEvidence(input: VerifiedCostEvidenceV1): { evidence: ExperimentComparisonResultV1["costEvidence"]; failure: ComparisonFailClosedErrorV1 | null } {
  if (input === null) return { evidence: Object.freeze({ state: "UNAVAILABLE", reason: "MISSING_EXACT_COST_EVIDENCE" }), failure: null };
  try {
    const explicitFeeTotalReference = finalMonotonic(input.explicitFeeReferenceSeries);
    const explicitFeeTotalSubject = finalMonotonic(input.explicitFeeSubjectSeries);
    const slippageCostTotalReference = finalMonotonic(input.slippageReferenceSeries);
    const slippageCostTotalSubject = finalMonotonic(input.slippageSubjectSeries);
    return { evidence: Object.freeze({ state: "AVAILABLE", explicitFeeTotalReference, explicitFeeTotalSubject, slippageCostTotalReference, slippageCostTotalSubject }), failure: null };
  } catch {
    return { evidence: Object.freeze({ state: "UNAVAILABLE", reason: "MISSING_EXACT_COST_EVIDENCE" }), failure: "CORRUPTED_EVIDENCE" };
  }
}

function deriveDiagnostics(costEvidence: ExperimentComparisonResultV1["costEvidence"], neighborhoodEvidence: ExperimentComparisonResultV1["neighborhoodEvidence"], concentrationEvidence: ExperimentComparisonResultV1["concentrationEvidence"], metricUnavailable: boolean, costFailure: ComparisonFailClosedErrorV1 | null): readonly RobustnessDiagnosticV1[] {
  const diagnostics = new Set<RobustnessDiagnosticV1>();
  if (metricUnavailable) diagnostics.add("METRIC_UNAVAILABLE");
  if (costEvidence.state === "UNAVAILABLE") diagnostics.add("MISSING_EXACT_COST_EVIDENCE");
  if (neighborhoodEvidence.state === "UNAVAILABLE" || BigInt(neighborhoodEvidence.neighborhoodMemberCount) < robustnessComparisonPolicyV1.minimumNeighborhoodMembers) diagnostics.add("INSUFFICIENT_PARAMETER_NEIGHBORHOOD");
  if (concentrationEvidence.state === "AVAILABLE") {
    if (BigInt(concentrationEvidence.tradeCount) < BigInt(robustnessComparisonPolicyV1.minimumTradeCount) || BigInt(concentrationEvidence.rebalanceCount) < BigInt(robustnessComparisonPolicyV1.minimumRebalanceCount)) diagnostics.add("LOW_EVENT_COUNT_DEPENDENCE");
    if (concentrationEvidence.foldDirectionConcentration) diagnostics.add("FOLD_DIRECTION_CONCENTRATION");
  }
  if (costFailure !== null) diagnostics.add("MISSING_EXACT_COST_EVIDENCE");
  return Object.freeze([...diagnostics].sort(byteCompare));
}

function canonicalPipeline(input: ExperimentParametersCandidateV1["resolvedResearchIr"]["payload"]): readonly CanonicalJsonValue[] {
  return input.pipeline.map(canonicalOperationForDelta);
}

function canonicalOperationForDelta(input: ExperimentParametersCandidateV1["resolvedResearchIr"]["payload"]["pipeline"][number]): CanonicalJsonValue {
  if (input.type === "TAKE") return { type: "TAKE", count: canonicalIntegerV1(input.count, { min: "1", max: "10000", allowNegative: false }) };
  if (input.type === "REBALANCE") return { type: "REBALANCE", schedule: input.schedule };
  if (input.type === "WEIGHT") {
    if (input.method === "EQUAL") return { type: "WEIGHT", method: "EQUAL" };
    return {
      type: "WEIGHT",
      method: "FIXED_TARGETS",
      targets: input.targets.map((target) => ({
        instrumentId: target.instrumentId,
        weight: canonicalDecimalV1(target.weight, { allowNegative: false, min: "0", max: "1", maxIntegerDigits: 1, maxScale: 8 }),
      })).sort((a, b) => byteCompare(a.instrumentId, b.instrumentId)),
    };
  }
  if (input.type === "FILTER") return { type: "FILTER", predicate: canonicalExpressionForDelta(input.predicate) };
  if (input.type === "ENTER") return { type: "ENTER", condition: canonicalExpressionForDelta(input.condition) };
  if (input.type === "EXIT") return { type: "EXIT", condition: canonicalExpressionForDelta(input.condition) };
  return input as CanonicalJsonValue;
}

function canonicalExpressionForDelta(input: Extract<ExperimentParametersCandidateV1["resolvedResearchIr"]["payload"]["pipeline"][number], { type: "FILTER" }>["predicate"]): CanonicalJsonValue {
  if (input.type === "COMPARE") {
    const right = input.right.type === "DECIMAL"
      ? { ...input.right, value: canonicalDecimalV1(input.right.value, input.right.unit === "RATIO" ? { allowNegative: true, min: "-1", max: "100", maxIntegerDigits: 3, maxScale: 8 } : { allowNegative: false, min: "0", max: "9999999999999999.99999999", maxIntegerDigits: 16, maxScale: 8 }) }
      : input.right.type === "INTEGER"
        ? { ...input.right, value: canonicalIntegerV1(input.right.value, { min: "0", max: "1000000000000", allowNegative: false }) }
        : input.right.type === "DATE"
          ? { ...input.right, value: canonicalDateV1(input.right.value) }
          : input.right;
    return { ...input, right } as CanonicalJsonValue;
  }
  if (input.type === "AND" || input.type === "OR") return { type: input.type, clauses: input.clauses.map(canonicalExpressionForDelta) };
  if (input.type === "NOT") return { type: "NOT", clause: canonicalExpressionForDelta(input.clause) };
  return input;
}

function finalMonotonic(values: readonly string[]): string {
  if (values.length === 0) throw new Error("missing cost");
  let previous = "";
  for (const value of values) {
    if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/u.test(value)) throw new Error("bad cost");
    if (previous !== "" && decimalCompare(value, previous) < 0) throw new Error("non-monotonic cost");
    previous = value;
  }
  return previous;
}

function decimalCompare(left: string, right: string): number {
  const [lw = "", lf = ""] = left.split(".");
  const [rw = "", rf = ""] = right.split(".");
  if (BigInt(lw) !== BigInt(rw)) return BigInt(lw) > BigInt(rw) ? 1 : -1;
  const scale = Math.max(lf.length, rf.length);
  const li = BigInt(lf.padEnd(scale, "0") || "0");
  const ri = BigInt(rf.padEnd(scale, "0") || "0");
  return li === ri ? 0 : li > ri ? 1 : -1;
}

function safeRef(input: HashRefV1): HashRefV1 {
  try { return hashRefV1(input); } catch { return input; }
}

function sameRef(left: HashRefV1, right: HashRefV1): boolean { return hashRefV1(left).hashHex === hashRefV1(right).hashHex && hashRefV1(left).hashDomain === hashRefV1(right).hashDomain; }
function operationType(value: CanonicalJsonValue): string { return String(objectValue(value).type); }
function objectValue(value: CanonicalJsonValue): Readonly<Record<string, CanonicalJsonValue>> { if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("INCOMPARABLE_PARAMETER_STRUCTURE"); return value as Readonly<Record<string, CanonicalJsonValue>>; }
function arrayValue(value: CanonicalJsonValue): readonly CanonicalJsonValue[] { if (!Array.isArray(value)) throw new Error("INCOMPARABLE_PARAMETER_STRUCTURE"); return value; }
function byteCompare(a: string, b: string): number { return Buffer.from(a, "utf8").compare(Buffer.from(b, "utf8")); }
