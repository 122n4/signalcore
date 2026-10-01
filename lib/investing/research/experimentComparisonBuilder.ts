import { canonicalDateV1, canonicalDecimalV1, canonicalIntegerV1, hashRefV1, i5ResearchInternalCanonicalJsonBytesV1, sha256HexV1, type CanonicalJsonValue, type HashRefV1 } from "./canonical";
import { hashExperimentParametersV1, type ExperimentParametersCandidateV1 } from "./experimentParameters";
import { canonicalExperimentComparisonProtocolV1, hashExperimentComparisonProtocolV1, robustnessComparisonPolicyV1, type DirectionalComparisonMetricIdV1, type ExperimentComparisonProtocolV1 } from "./experimentComparison";
import { classifyRobustnessV1, type ComparisonFailClosedErrorV1, type RobustnessDiagnosticV1 } from "./experimentComparisonClassification";
import { compareExactMetricObservationV1, directionalMetricDeltaSignV1, type ExactMetricDeltaV1, type ExactMetricObservationV1 } from "./experimentComparisonEvidence";
import { canonicalExperimentComparisonResultV1, hashExperimentComparisonResultV1, type ComparisonProtocolHashRefV1, type ExperimentComparisonResultV1, type ParameterDeltaV1, type ScientificInputDeltaV1 } from "./experimentComparisonResult";
import { deriveFoldStabilityEvidenceV1 } from "./experimentComparisonStability";
import { canonicalJsonlArtifactBytesV1, hashResultV1, type ResultHashPayloadV1 } from "./resultArtifacts";
import { compareRationalV1, decimalStringToRationalV1, reduceRationalV1, subtractRationalV1, type ExactRationalV1 } from "./exactRational";

export type VerifiedComparisonExperimentNodeV1 = Readonly<{
  experiment: HashRefV1;
  parentExperiment: HashRefV1 | null;
  tenantAuthority: string;
  investigationId: string;
  researchIrFamily: string;
  relation: "BASELINE" | "VARIANT";
  acceptedPersistenceProof: Readonly<{
    source: "SERVER_PERSISTENCE_PROJECTION_V1";
    experiment: HashRefV1;
    parentExperiment: HashRefV1 | null;
    tenantAuthority: string;
    investigationId: string;
    researchIrFamily: string;
    relation: "BASELINE" | "VARIANT";
  }>;
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
  validationResult: HashRefV1;
  inSample: ExactMetricObservationV1;
  outOfSample: ExactMetricObservationV1;
  subjectOos: ExactMetricObservationV1;
}>;

export type VerifiedNeighborhoodMetricEvidenceV1 = Readonly<{
  experiment: HashRefV1;
  resultProof: VerifiedMetricResultSetProofV1;
  unavailableReason?: "MISSING_METRIC" | "METRIC_UNAVAILABLE_ON_ONE_SIDE";
}>;

export type VerifiedMetricResultSetProofV1 = Readonly<{
  result: HashRefV1;
  resultPayload: ResultHashPayloadV1;
  metricRecords: readonly ExactMetricObservationV1[];
}>;

export type VerifiedCostEvidenceV1 = Readonly<{
  referenceResult: HashRefV1;
  subjectResult: HashRefV1;
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
  referenceResultProof: VerifiedMetricResultSetProofV1;
  subjectResultProof: VerifiedMetricResultSetProofV1;
  referenceExperimentParameters: ExperimentParametersCandidateV1;
  subjectExperimentParameters: ExperimentParametersCandidateV1;
  foldEvidence: readonly VerifiedFoldMetricEvidenceV1[];
  neighborhoodEvidence: readonly VerifiedNeighborhoodMetricEvidenceV1[];
  costEvidence: VerifiedCostEvidenceV1;
  eventMetricEvidence: Readonly<{ result: HashRefV1; tradeCount: ExactMetricObservationV1; rebalanceCount: ExactMetricObservationV1 }>;
}>;

export type PreparedExperimentComparisonPersistenceV1 = Readonly<{
  protocolHash: string;
  resultHash: string;
  protocolPayloadBytes: string;
  resultPayloadBytes: string;
  sql: Readonly<{
    protocol: Readonly<{ hashHex: string; canonicalPayload: string }>;
    result: Readonly<{ protocolHashHex: string; hashHex: string; canonicalPayload: string }>;
  }>;
}>;

export type ExperimentComparisonPersistenceSinkV1 = Readonly<{
  persistExperimentComparisonV1(input: PreparedExperimentComparisonPersistenceV1): Promise<void>;
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
  const metricObservations = deriveProtocolMetricPairs(input.referenceResultProof, input.subjectResultProof, protocol);
  const metricDeltas = deriveMetricDeltas(metricObservations.pairs, protocol);
  const missingConfiguredMetric = metricObservations.missingMetric;
  const primaryMetric = metricObservations.pairs.find((pair) => pair.reference.metricId === primaryMetricId);
  const primaryOutcome = primaryMetric === undefined ? null : compareExactMetricObservationV1(primaryMetric.reference, primaryMetric.subject);
  const aggregateOosOrientedDeltaSign = primaryOutcome === null ? null : directionalMetricDeltaSignV1(primaryOutcome, primaryMetricId);
  const metricUnavailable = primaryOutcome === null || aggregateOosOrientedDeltaSign === null || missingConfiguredMetric;
  const validation = deriveValidationEvidence(input.foldEvidence, primaryMetricId, aggregateOosOrientedDeltaSign ?? 0);
  const neighborhood = deriveNeighborhoodEvidence(input.neighborhoodEvidence, protocol, primaryMetric);
  const concentration = deriveConcentrationEvidence(input.eventMetricEvidence, validation.outcomeSigns);
  const cost = deriveCostEvidence(input.costEvidence);
  const diagnostics = deriveDiagnostics(cost.evidence, neighborhood.evidence, concentration, validation.incomplete, metricUnavailable, missingConfiguredMetric, cost.failure);
  const failure = protocolFailure ?? lineageFailure ?? parameter.failure ?? cost.failure ?? (scientificMismatch ? "INCOMPATIBLE_SCIENTIFIC_INPUTS" : null) ?? (validationProtocolMismatch ? "INCOMPARABLE_VALIDATION_PROTOCOL" : null);
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

export function prepareExperimentComparisonPersistenceV1(input: VerifiedComparisonEvidenceV1): PreparedExperimentComparisonPersistenceV1 {
  const protocolPayload = canonicalExperimentComparisonProtocolV1(input.protocolPayload);
  const protocolHash = hashExperimentComparisonProtocolV1(input.protocolPayload);
  if (protocolHash !== input.protocol.hashHex) throw new Error("CORRUPTED_EVIDENCE");
  const result = buildExperimentComparisonResultV1(input);
  const resultPayload = canonicalExperimentComparisonResultV1(result);
  const resultHash = hashExperimentComparisonResultV1(result);
  const protocolPayloadBytes = i5ResearchInternalCanonicalJsonBytesV1(protocolPayload).toString("utf8");
  const resultPayloadBytes = i5ResearchInternalCanonicalJsonBytesV1(resultPayload).toString("utf8");
  return Object.freeze({
    protocolHash,
    resultHash,
    protocolPayloadBytes,
    resultPayloadBytes,
    sql: Object.freeze({
      protocol: Object.freeze({ hashHex: protocolHash, canonicalPayload: protocolPayloadBytes }),
      result: Object.freeze({ protocolHashHex: protocolHash, hashHex: resultHash, canonicalPayload: resultPayloadBytes }),
    }),
  });
}

export async function persistExperimentComparisonV1(input: VerifiedComparisonEvidenceV1, sink: ExperimentComparisonPersistenceSinkV1): Promise<PreparedExperimentComparisonPersistenceV1> {
  const prepared = prepareExperimentComparisonPersistenceV1(input);
  await sink.persistExperimentComparisonV1(prepared);
  return prepared;
}

function failClosedResult(protocol: ComparisonProtocolHashRefV1, failure: ComparisonFailClosedErrorV1): ExperimentComparisonResultV1 {
  const result: ExperimentComparisonResultV1 = Object.freeze({
    schemaVersion: "EXPERIMENT_COMPARISON_RESULT_V1",
    protocol,
    parameterDeltas: [],
    scientificInputDelta: [],
    metricDeltas: [],
    validationEvidence: { completeFoldCount: "0", degradedFoldCount: "0", nonDegradedFoldCount: "0", aggregateOosOrientedDeltaSign: "0" as const, foldMin: null, foldMax: null, foldRange: null },
    costEvidence: { state: "UNAVAILABLE" as const, reason: "MISSING_EXACT_COST_EVIDENCE" as const },
    neighborhoodEvidence: { state: "UNAVAILABLE" as const, reason: "INSUFFICIENT_PARAMETER_NEIGHBORHOOD" as const, availableMemberCount: "0", unavailableMemberCount: "0", unavailableReasons: [] },
    concentrationEvidence: { state: "UNAVAILABLE" as const, reason: "UNSUPPORTED_CONCENTRATION_EVIDENCE" as const },
    diagnostics: ["INSUFFICIENT_PARAMETER_NEIGHBORHOOD", "MISSING_EXACT_COST_EVIDENCE", "METRIC_UNAVAILABLE", "UNSUPPORTED_CONCENTRATION_EVIDENCE"] as const,
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
  if (!hasDomain(input.protocol, "SYNTRAKE:EXPERIMENT_COMPARISON_PROTOCOL:V1")) return "CORRUPTED_EVIDENCE";
  if (!sameRef(protocol.referenceExperiment, input.reference.experiment) || !sameRef(protocol.subjectExperiment, input.subject.experiment)) return "CORRUPTED_EVIDENCE";
  if (!hasDomain(input.reference.experiment, "SYNTRAKE:EXPERIMENT:V1") || !hasDomain(input.subject.experiment, "SYNTRAKE:EXPERIMENT:V1")) return "CORRUPTED_EVIDENCE";
  if (!hasDomain(input.referenceScientificInputs.datasetSnapshot, "SYNTRAKE:DATASET_SNAPSHOT:V1")) return "CORRUPTED_EVIDENCE";
  if (!hasDomain(input.referenceScientificInputs.executionConfig, "SYNTRAKE:EXECUTION_CONFIG:V1")) return "CORRUPTED_EVIDENCE";
  if (!hasDomain(input.referenceScientificInputs.metricRequestSet, "SYNTRAKE:METRIC_REQUEST_SET:V1")) return "CORRUPTED_EVIDENCE";
  if (!hasDomain(input.referenceScientificInputs.validationProtocol, "SYNTRAKE:VALIDATION_PROTOCOL:V1")) return "CORRUPTED_EVIDENCE";
  if (!hasDomain(input.subjectScientificInputs.datasetSnapshot, "SYNTRAKE:DATASET_SNAPSHOT:V1")) return "CORRUPTED_EVIDENCE";
  if (!hasDomain(input.subjectScientificInputs.executionConfig, "SYNTRAKE:EXECUTION_CONFIG:V1")) return "CORRUPTED_EVIDENCE";
  if (!hasDomain(input.subjectScientificInputs.metricRequestSet, "SYNTRAKE:METRIC_REQUEST_SET:V1")) return "CORRUPTED_EVIDENCE";
  if (!hasDomain(input.subjectScientificInputs.validationProtocol, "SYNTRAKE:VALIDATION_PROTOCOL:V1")) return "CORRUPTED_EVIDENCE";
  if (!hasDomain(input.referenceScientificInputs.validationResult, "SYNTRAKE:VALIDATION_RESULT:V1")) return "CORRUPTED_EVIDENCE";
  if (!hasDomain(input.subjectScientificInputs.validationResult, "SYNTRAKE:VALIDATION_RESULT:V1")) return "CORRUPTED_EVIDENCE";
  if (hashExperimentParametersV1(input.referenceExperimentParameters) !== protocol.referenceExperimentParameters.hashHex) return "CORRUPTED_EVIDENCE";
  if (hashExperimentParametersV1(input.subjectExperimentParameters) !== protocol.subjectExperimentParameters.hashHex) return "CORRUPTED_EVIDENCE";
  if (protocol.metricRegistryVersion !== "METRIC_REGISTRY_V20260927") return "INCOMPATIBLE_METRIC_VERSIONS";
  if (!verifyMetricResultSetProof(input.referenceResultProof, protocol.referenceResult)) return "CORRUPTED_EVIDENCE";
  if (!verifyMetricResultSetProof(input.subjectResultProof, protocol.subjectResult)) return "CORRUPTED_EVIDENCE";
  if (duplicateMetricRecords(input.referenceResultProof.metricRecords) || duplicateMetricRecords(input.subjectResultProof.metricRecords)) return "CORRUPTED_EVIDENCE";
  for (const fold of input.foldEvidence) if (!sameRef(fold.validationResult, protocol.subjectValidationResult)) return "CORRUPTED_EVIDENCE";
  if (input.costEvidence !== null && (!sameRef(input.costEvidence.referenceResult, protocol.referenceResult) || !sameRef(input.costEvidence.subjectResult, protocol.subjectResult))) return "CORRUPTED_EVIDENCE";
  if (!sameRef(input.eventMetricEvidence.result, protocol.subjectResult)) return "CORRUPTED_EVIDENCE";
  if (input.eventMetricEvidence.tradeCount.metricId !== "TRADE_COUNT" || input.eventMetricEvidence.rebalanceCount.metricId !== "REBALANCE_COUNT") return "CORRUPTED_EVIDENCE";
  if (!sameMetricRecord(input.eventMetricEvidence.tradeCount, input.subjectResultProof.metricRecords.find((record) => record.metricId === "TRADE_COUNT"))) return "CORRUPTED_EVIDENCE";
  if (!sameMetricRecord(input.eventMetricEvidence.rebalanceCount, input.subjectResultProof.metricRecords.find((record) => record.metricId === "REBALANCE_COUNT"))) return "CORRUPTED_EVIDENCE";
  const protocolNeighborhood = new Set(protocol.neighborhoodExperimentRefs.map((ref) => ref.hashHex));
  if (input.neighborhoodEvidence.length !== protocolNeighborhood.size) return "CORRUPTED_EVIDENCE";
  for (const member of input.neighborhoodEvidence) {
    if (!protocolNeighborhood.has(hashRefV1(member.experiment).hashHex)) return "CORRUPTED_EVIDENCE";
    if (!verifyMetricResultSetProof(member.resultProof, member.resultProof.result)) return "CORRUPTED_EVIDENCE";
    if (hashRefV1(member.experiment).hashHex !== protocol.subjectExperiment.hashHex && sameRef(member.resultProof.result, protocol.subjectResult)) return "CORRUPTED_EVIDENCE";
  }
  return null;
}

function verifyMetricResultSetProof(proof: VerifiedMetricResultSetProofV1, expectedResult: HashRefV1): boolean {
  try {
    if (!sameRef(proof.result, expectedResult)) return false;
    if (hashResultV1(proof.resultPayload) !== hashRefV1(expectedResult).hashHex) return false;
    if (proof.resultPayload.metricResultSet.artifactSchemaVersion !== "METRIC_RESULT_SET_V2") return false;
    const bytes = canonicalJsonlArtifactBytesV1(proof.metricRecords as unknown as readonly CanonicalJsonValue[]);
    if (proof.resultPayload.metricResultSet.contentSha256 !== i5ResearchInternalSha256(bytes)) return false;
    if (proof.resultPayload.metricResultSet.contentByteLength !== String(bytes.length)) return false;
    if (proof.resultPayload.metricResultSet.recordCount !== String(proof.metricRecords.length)) return false;
    for (const record of proof.metricRecords) assertMetricRecordV2(record);
    return true;
  } catch {
    return false;
  }
}

function i5ResearchInternalSha256(bytes: Buffer): string { return sha256HexV1(bytes); }

function assertMetricRecordV2(record: ExactMetricObservationV1): void {
  if (record.metricVersion !== "METRIC_V2" || record.registryVersion !== "METRIC_REGISTRY_V20260927" || record.artifactSchemaVersion !== "METRIC_RESULT_SET_V2") throw new Error("INCOMPATIBLE_METRIC_VERSIONS");
  if (record.state === "VALUE" && record.canonicalDecimal === null) throw new Error("VALUE_WITHOUT_CANONICAL_DECIMAL");
  if (record.state === "MISSING" && record.canonicalDecimal !== null) throw new Error("MISSING_WITH_CANONICAL_DECIMAL");
}

function duplicateMetricRecords(records: readonly ExactMetricObservationV1[]): boolean {
  const seen = new Set<string>();
  for (const record of records) {
    assertMetricRecordV2(record);
    if (seen.has(record.metricId)) return true;
    seen.add(record.metricId);
  }
  return false;
}

function sameMetricRecord(left: ExactMetricObservationV1, right: ExactMetricObservationV1 | undefined): boolean {
  return right !== undefined &&
    left.metricId === right.metricId &&
    left.metricVersion === right.metricVersion &&
    left.registryVersion === right.registryVersion &&
    left.artifactSchemaVersion === right.artifactSchemaVersion &&
    left.state === right.state &&
    left.canonicalDecimal === right.canonicalDecimal;
}

function deriveLineageFailure(reference: VerifiedComparisonExperimentNodeV1, subject: VerifiedComparisonExperimentNodeV1, lineageNodes: readonly VerifiedComparisonExperimentNodeV1[]): ComparisonFailClosedErrorV1 | null {
  for (const node of [reference, subject, ...lineageNodes]) if (!nodeMatchesAcceptedPersistence(node)) return "INCOMPARABLE_LINEAGE";
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

function nodeMatchesAcceptedPersistence(node: VerifiedComparisonExperimentNodeV1): boolean {
  const proof = node.acceptedPersistenceProof;
  return sameRef(node.experiment, proof.experiment) &&
    ((node.parentExperiment === null && proof.parentExperiment === null) || (node.parentExperiment !== null && proof.parentExperiment !== null && sameRef(node.parentExperiment, proof.parentExperiment))) &&
    node.tenantAuthority === proof.tenantAuthority &&
    node.investigationId === proof.investigationId &&
    node.researchIrFamily === proof.researchIrFamily &&
    node.relation === proof.relation;
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

function deriveProtocolMetricPairs(referenceProof: VerifiedMetricResultSetProofV1, subjectProof: VerifiedMetricResultSetProofV1, protocol: CanonicalProtocol): { pairs: readonly Readonly<{ reference: ExactMetricObservationV1; subject: ExactMetricObservationV1 }>[]; missingMetric: boolean } {
  const referenceRecords = new Map(referenceProof.metricRecords.map((record) => [record.metricId, record]));
  const subjectRecords = new Map(subjectProof.metricRecords.map((record) => [record.metricId, record]));
  const pairs: Readonly<{ reference: ExactMetricObservationV1; subject: ExactMetricObservationV1 }>[] = [];
  let missingMetric = false;
  for (const metricId of protocol.comparisonMetricIds) {
    const reference = referenceRecords.get(metricId as ExactMetricObservationV1["metricId"]);
    const subject = subjectRecords.get(metricId as ExactMetricObservationV1["metricId"]);
    if (reference === undefined || subject === undefined) {
      missingMetric = true;
      continue;
    }
    pairs.push(Object.freeze({ reference, subject }));
  }
  return { pairs: Object.freeze(pairs), missingMetric };
}

function deriveValidationEvidence(folds: readonly VerifiedFoldMetricEvidenceV1[], primaryMetricId: DirectionalComparisonMetricIdV1, aggregateOosOrientedDeltaSign: -1 | 0 | 1): { evidence: ExperimentComparisonResultV1["validationEvidence"]; foldSigns: readonly (-1 | 0 | 1)[]; outcomeSigns: readonly (-1 | 0 | 1)[]; incomplete: boolean } {
  const signs: (-1 | 0 | 1)[] = [];
  const outcomeSigns: (-1 | 0 | 1)[] = [];
  const deltas: ExactRationalV1[] = [];
  const seen = new Set<string>();
  let incomplete = false;
  for (const fold of [...folds].sort((a, b) => byteCompare(a.foldId, b.foldId))) {
    if (seen.has(fold.foldId)) incomplete = true;
    seen.add(fold.foldId);
    const outcome = compareExactMetricObservationV1(fold.inSample, fold.outOfSample);
    if (fold.inSample.metricId !== primaryMetricId || outcome.state !== "AVAILABLE" || outcome.delta.orientedDeltaSign === null || outcome.delta.orientedDelta === null) incomplete = true;
    else {
      signs.push(outcome.delta.orientedDeltaSign);
      if (fold.subjectOos.metricId !== primaryMetricId || fold.subjectOos.state !== "VALUE" || fold.subjectOos.canonicalDecimal === null) incomplete = true;
      else outcomeSigns.push(compareRationalV1(decimalStringToRationalV1(fold.subjectOos.canonicalDecimal), { numerator: 0n, denominator: 1n }));
      deltas.push(recordToRational(outcome.delta.orientedDelta));
    }
  }
  const degradedFoldCount = signs.filter((sign) => sign < 0).length;
  const sorted = [...deltas].sort(compareRationalV1);
  const foldMin = sorted[0] ?? null;
  const foldMax = sorted[sorted.length - 1] ?? null;
  return {
    evidence: Object.freeze({ completeFoldCount: String(signs.length), degradedFoldCount: String(degradedFoldCount), nonDegradedFoldCount: String(signs.length - degradedFoldCount), aggregateOosOrientedDeltaSign: String(aggregateOosOrientedDeltaSign) as "-1" | "0" | "1", foldMin: foldMin === null ? null : rationalRecord(foldMin), foldMax: foldMax === null ? null : rationalRecord(foldMax), foldRange: foldMin === null || foldMax === null ? null : rationalRecord(subtractRationalV1(foldMax, foldMin)) }),
    foldSigns: Object.freeze(signs),
    outcomeSigns: Object.freeze(outcomeSigns),
    incomplete,
  };
}

function deriveNeighborhoodEvidence(members: readonly VerifiedNeighborhoodMetricEvidenceV1[], protocol: CanonicalProtocol, primary: Readonly<{ reference: ExactMetricObservationV1; subject: ExactMetricObservationV1 }> | undefined): { evidence: ExperimentComparisonResultV1["neighborhoodEvidence"]; unavailableCount: number } {
  if (primary === undefined) return { evidence: Object.freeze({ state: "UNAVAILABLE", reason: "INSUFFICIENT_PARAMETER_NEIGHBORHOOD", availableMemberCount: "0", unavailableMemberCount: String(members.length), unavailableReasons: ["MISSING_METRIC"] }), unavailableCount: members.length };
  const required = new Set(protocol.neighborhoodExperimentRefs.map((ref) => ref.hashHex));
  let unavailableCount = 0;
  const unavailableReasons: string[] = [];
  let degradedMemberCount = 0;
  let improvedOrEqualMemberCount = 0;
  const deltas: ExactRationalV1[] = [];
  for (const member of members) {
    if (!required.delete(hashRefV1(member.experiment).hashHex)) throw new Error("CORRUPTED_EVIDENCE");
    const memberObservation = member.resultProof.metricRecords.find((record) => record.metricId === primary.reference.metricId) ?? null;
    if (memberObservation === null) {
      unavailableCount += 1;
      unavailableReasons.push(member.unavailableReason ?? "MISSING_METRIC");
      continue;
    }
    const outcome = compareExactMetricObservationV1(primary.reference, memberObservation);
    if (outcome.state !== "AVAILABLE" || outcome.delta.orientedDeltaSign === null || outcome.delta.orientedDelta === null) {
      unavailableCount += 1;
      unavailableReasons.push(outcome.state === "UNAVAILABLE" ? outcome.reason : "METRIC_UNAVAILABLE_ON_ONE_SIDE");
    } else if (outcome.delta.orientedDeltaSign < 0) degradedMemberCount += 1;
    else improvedOrEqualMemberCount += 1;
    if (outcome.state === "AVAILABLE" && outcome.delta.orientedDelta !== null) deltas.push(recordToRational(outcome.delta.orientedDelta));
  }
  if (required.size > 0 || unavailableCount > 0 || members.length < robustnessComparisonPolicyV1.minimumNeighborhoodMembers) return { evidence: Object.freeze({ state: "UNAVAILABLE", reason: "INSUFFICIENT_PARAMETER_NEIGHBORHOOD", availableMemberCount: String(members.length - unavailableCount), unavailableMemberCount: String(unavailableCount + required.size), unavailableReasons }), unavailableCount };
  const sorted = [...deltas].sort(compareRationalV1);
  const min = sorted[0] ?? { numerator: 0n, denominator: 1n };
  const max = sorted[sorted.length - 1] ?? { numerator: 0n, denominator: 1n };
  return { evidence: Object.freeze({ state: "AVAILABLE", neighborhoodMemberCount: String(members.length), availableMemberCount: String(members.length), unavailableMemberCount: "0", unavailableReasons, degradedMemberCount: String(degradedMemberCount), improvedOrEqualMemberCount: String(improvedOrEqualMemberCount), neighborhoodMin: rationalRecord(min), neighborhoodMax: rationalRecord(max), neighborhoodSpread: rationalRecord(subtractRationalV1(max, min)) }), unavailableCount };
}

function deriveConcentrationEvidence(eventMetricEvidence: VerifiedComparisonEvidenceV1["eventMetricEvidence"], foldSigns: readonly (-1 | 0 | 1)[]): ExperimentComparisonResultV1["concentrationEvidence"] {
  if (eventMetricEvidence.tradeCount.metricId !== "TRADE_COUNT" || eventMetricEvidence.rebalanceCount.metricId !== "REBALANCE_COUNT") return Object.freeze({ state: "UNAVAILABLE", reason: "UNSUPPORTED_CONCENTRATION_EVIDENCE" });
  if (eventMetricEvidence.tradeCount.state !== "VALUE" || eventMetricEvidence.rebalanceCount.state !== "VALUE" || eventMetricEvidence.tradeCount.canonicalDecimal === null || eventMetricEvidence.rebalanceCount.canonicalDecimal === null) return Object.freeze({ state: "UNAVAILABLE", reason: "UNSUPPORTED_CONCENTRATION_EVIDENCE" });
  const frozen = deriveFoldStabilityEvidenceV1(foldSigns.map((sign, index) => ({ id: `fold-${index}`, orientedDeltaSign: sign })));
  return Object.freeze({ state: "AVAILABLE", tradeCount: canonicalIntegerV1(eventMetricEvidence.tradeCount.canonicalDecimal, { min: "0", max: "1000000000000", allowNegative: false }), rebalanceCount: canonicalIntegerV1(eventMetricEvidence.rebalanceCount.canonicalDecimal, { min: "0", max: "1000000000000", allowNegative: false }), foldDirectionConcentration: frozen.foldDirectionConcentration });
}

function deriveCostEvidence(input: VerifiedCostEvidenceV1): { evidence: ExperimentComparisonResultV1["costEvidence"]; failure: ComparisonFailClosedErrorV1 | null } {
  if (input === null) return { evidence: Object.freeze({ state: "UNAVAILABLE", reason: "MISSING_EXACT_COST_EVIDENCE" }), failure: null };
  try {
    const explicitFeeTotalReference = finalMonotonic(input.explicitFeeReferenceSeries);
    const explicitFeeTotalSubject = finalMonotonic(input.explicitFeeSubjectSeries);
    const slippageCostTotalReference = finalMonotonic(input.slippageReferenceSeries);
    const slippageCostTotalSubject = finalMonotonic(input.slippageSubjectSeries);
    const costTotalReference = addDecimal(explicitFeeTotalReference, slippageCostTotalReference);
    const costTotalSubject = addDecimal(explicitFeeTotalSubject, slippageCostTotalSubject);
    return { evidence: Object.freeze({ state: "AVAILABLE", explicitFeeTotalReference, explicitFeeTotalSubject, slippageCostTotalReference, slippageCostTotalSubject, costTotalReference, costTotalSubject, costDelta: subtractDecimal(costTotalSubject, costTotalReference) }), failure: null };
  } catch {
    return { evidence: Object.freeze({ state: "UNAVAILABLE", reason: "MISSING_EXACT_COST_EVIDENCE" }), failure: "CORRUPTED_EVIDENCE" };
  }
}

function deriveDiagnostics(costEvidence: ExperimentComparisonResultV1["costEvidence"], neighborhoodEvidence: ExperimentComparisonResultV1["neighborhoodEvidence"], concentrationEvidence: ExperimentComparisonResultV1["concentrationEvidence"], validationIncomplete: boolean, metricUnavailable: boolean, missingConfiguredMetric: boolean, costFailure: ComparisonFailClosedErrorV1 | null): readonly RobustnessDiagnosticV1[] {
  const diagnostics = new Set<RobustnessDiagnosticV1>();
  if (validationIncomplete) diagnostics.add("INCOMPLETE_VALIDATION");
  if (metricUnavailable) diagnostics.add("METRIC_UNAVAILABLE");
  if (missingConfiguredMetric) diagnostics.add("MISSING_METRIC");
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

function recordToRational(value: Readonly<{ numerator: string; denominator: string }>): ExactRationalV1 {
  return reduceRationalV1({ numerator: BigInt(value.numerator), denominator: BigInt(value.denominator) });
}

function rationalRecord(value: ExactRationalV1): Readonly<{ numerator: string; denominator: string }> {
  const reduced = reduceRationalV1(value);
  return Object.freeze({ numerator: reduced.numerator.toString(), denominator: reduced.denominator.toString() });
}

function addDecimal(left: string, right: string): string {
  const { leftInt, rightInt, scale } = alignDecimals(left, right);
  return scaledToDecimal(leftInt + rightInt, scale);
}

function subtractDecimal(left: string, right: string): string {
  const { leftInt, rightInt, scale } = alignDecimals(left, right);
  return scaledToDecimal(leftInt - rightInt, scale);
}

function alignDecimals(left: string, right: string): { leftInt: bigint; rightInt: bigint; scale: number } {
  const [lw = "", lf = ""] = left.split(".");
  const [rw = "", rf = ""] = right.split(".");
  const scale = Math.max(lf.length, rf.length);
  const leftInt = BigInt(`${lw}${lf.padEnd(scale, "0")}`);
  const rightInt = BigInt(`${rw}${rf.padEnd(scale, "0")}`);
  return { leftInt, rightInt, scale };
}

function scaledToDecimal(value: bigint, scale: number): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  if (scale === 0) return `${negative ? "-" : ""}${abs.toString()}`;
  const raw = abs.toString().padStart(scale + 1, "0");
  const whole = raw.slice(0, -scale);
  const fraction = raw.slice(-scale).replace(/0+$/u, "");
  return `${negative ? "-" : ""}${fraction === "" ? whole : `${whole}.${fraction}`}`;
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
function hasDomain(ref: Readonly<{ hashAlgorithm: "SHA-256"; hashDomain: string; hashVersion: "SYNTRAKE_SHA256_V1"; hashHex: string }>, domain: HashRefV1["hashDomain"]): boolean { try { return hashRefV1(ref as HashRefV1).hashDomain === domain; } catch { return false; } }
function operationType(value: CanonicalJsonValue): string { return String(objectValue(value).type); }
function objectValue(value: CanonicalJsonValue): Readonly<Record<string, CanonicalJsonValue>> { if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("INCOMPARABLE_PARAMETER_STRUCTURE"); return value as Readonly<Record<string, CanonicalJsonValue>>; }
function arrayValue(value: CanonicalJsonValue): readonly CanonicalJsonValue[] { if (!Array.isArray(value)) throw new Error("INCOMPARABLE_PARAMETER_STRUCTURE"); return value; }
function byteCompare(a: string, b: string): number { return Buffer.from(a, "utf8").compare(Buffer.from(b, "utf8")); }
