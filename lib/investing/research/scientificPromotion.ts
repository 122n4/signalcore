import {
  assertHashDomainAdmittedForHashingV1,
  assertHashRefDomainV1,
  hashRefV1,
  i5ResearchInternalCanonicalJsonBytesV1,
  sha256HexV1,
  type CanonicalJsonValue,
  type CanonicalSha256HexV1,
  type HashRefV1,
} from "./canonical";

export const scientificPromotionProtocolIdV1 = "SCIENTIFIC_PROMOTION_PROTOCOL_V20260928" as const;
export const scientificPromotionMetricRegistryVersionV1 = "METRIC_REGISTRY_V20260927" as const;
export const scientificPromotionRl7PolicyIdV1 = "ROBUSTNESS_COMPARISON_POLICY_V20260927" as const;

export type ScientificPromotionStateV1 =
  | "DRAFT_RESEARCH"
  | "EXECUTED"
  | "INSUFFICIENT_EVIDENCE"
  | "VALIDATION_FAILED"
  | "VALIDATION_PASSED"
  | "PROMOTION_ELIGIBLE"
  | "REJECTED"
  | "SUPERSEDED"
  | "INVALIDATED";

export type ScientificPromotionGateIdV1 =
  | "GATE_AUTHORITY_AND_TENANCY"
  | "GATE_SUBJECT_IDENTITY"
  | "GATE_ACCEPTED_EXECUTION_RESULT"
  | "GATE_EVIDENCE_OBJECT_BINDING"
  | "GATE_VALIDATION_RESULT"
  | "GATE_METRIC_RESULT_SET_V2"
  | "GATE_RL7_ROBUSTNESS_COMPARISON"
  | "GATE_LINEAGE_INTEGRITY"
  | "GATE_PROTOCOL_COMPATIBILITY"
  | "GATE_EVIDENCE_COMPLETENESS";

export type ScientificPromotionGateStatusV1 =
  | "PASS"
  | "FAIL"
  | "INSUFFICIENT_EVIDENCE"
  | "INCOMPATIBLE_EVIDENCE"
  | "UNAVAILABLE";

export type ScientificPromotionReasonCodeV1 =
  | "MISSING_SUBJECT"
  | "MISSING_RESULT"
  | "MISSING_EVIDENCE_OBJECT"
  | "MISSING_VALIDATION_RESULT"
  | "MISSING_METRIC_RESULT_SET"
  | "MISSING_RL7_COMPARISON"
  | "INCOMPLETE_VALIDATION"
  | "INSUFFICIENT_RL7_EVIDENCE"
  | "FAILED_VALIDATION"
  | "FAILED_ROBUSTNESS_GATE"
  | "INCOMPATIBLE_SCHEMA_VERSION"
  | "INCOMPATIBLE_PROTOCOL_VERSION"
  | "INCOMPATIBLE_METRIC_REGISTRY"
  | "INCOMPATIBLE_ENGINE_VERSION"
  | "INCOMPATIBLE_ARTIFACT_SCHEMA"
  | "WRONG_LINEAGE"
  | "WRONG_TENANT"
  | "WRONG_INVESTIGATION"
  | "WRONG_HASHREF_DOMAIN"
  | "MALFORMED_HASHREF"
  | "MALFORMED_PROTOCOL"
  | "MALFORMED_TRANSITION"
  | "FORBIDDEN_TRANSITION"
  | "DIVERGENT_EXISTING_IDENTITY"
  | "CORRUPTED_EVIDENCE"
  | "UNAUTHORIZED_EVIDENCE"
  | "AUTHORITY_FAILURE"
  | "SUPERSEDED_EVIDENCE"
  | "INVALIDATED_EVIDENCE"
  | "UNKNOWN_GATE"
  | "UNKNOWN_STATE"
  | "UNKNOWN_RL7_CLASSIFICATION";

export type ScientificPromotionSubjectV1 = Readonly<{
  tenantAuthority: string;
  investigationId: string;
  subjectExperiment: HashRefV1;
  subjectExperimentParameters: HashRefV1;
  subjectResearchIr: HashRefV1;
  subjectRunInput: HashRefV1;
  subjectResult: HashRefV1;
  subjectEvidenceObject: HashRefV1;
  subjectValidationProtocol: HashRefV1;
  subjectValidationResult: HashRefV1;
  subjectMetricResultSet: Readonly<{
    hashAlgorithm: "SHA-256";
    hashDomain: "METRIC_RESULT_SET_V2";
    hashVersion: "SYNTRAKE_SHA256_V1";
    hashHex: CanonicalSha256HexV1;
  }>;
  robustnessComparisonProtocol: HashRefV1;
  robustnessComparisonResult: HashRefV1;
}>;

export type ScientificPromotionProtocolV1 = Readonly<{
  schemaVersion: "SCIENTIFIC_PROMOTION_PROTOCOL_V1";
  protocolId: typeof scientificPromotionProtocolIdV1;
  requiredEvidenceClasses: readonly [
    "EXECUTION_RESULT",
    "EVIDENCE_OBJECT",
    "VALIDATION_RESULT",
    "METRIC_RESULT_SET_V2",
    "RL7_EXPERIMENT_COMPARISON_RESULT",
  ];
  compatibleMetricRegistryVersion: typeof scientificPromotionMetricRegistryVersionV1;
  requiredRl7PolicyId: typeof scientificPromotionRl7PolicyIdV1;
  rl7Required: true;
  stateVocabulary: readonly ScientificPromotionStateV1[];
  gateVocabulary: readonly ScientificPromotionGateIdV1[];
  gateStatusVocabulary: readonly ScientificPromotionGateStatusV1[];
  reasonVocabulary: readonly ScientificPromotionReasonCodeV1[];
  decisionPrecedence: readonly string[];
  transitionGraph: readonly { from: ScientificPromotionStateV1; to: ScientificPromotionStateV1 }[];
}>;

export type ScientificPromotionGateOutcomeV1 = Readonly<{
  gateId: ScientificPromotionGateIdV1;
  status: ScientificPromotionGateStatusV1;
  reasons: readonly ScientificPromotionReasonCodeV1[];
  evidence: readonly HashRefV1[];
}>;

export type ScientificPromotionTransitionV1 = Readonly<{
  schemaVersion: "SCIENTIFIC_PROMOTION_TRANSITION_V1";
  protocol: HashRefV1;
  subject: ScientificPromotionSubjectV1;
  predecessorState: ScientificPromotionStateV1 | null;
  resultingState: ScientificPromotionStateV1;
  gateOutcomes: readonly ScientificPromotionGateOutcomeV1[];
  transitionReasons: readonly ScientificPromotionReasonCodeV1[];
  supersedes: HashRefV1 | null;
  invalidates: HashRefV1 | null;
  rejectedTransition: HashRefV1 | null;
  predecessorTransition: HashRefV1 | null;
  supersededByChain: Readonly<{ successorProtocol: HashRefV1; successorRootTransition: HashRefV1 }> | null;
}>;

export const scientificPromotionStatesV1 = Object.freeze([
  "DRAFT_RESEARCH",
  "EXECUTED",
  "INSUFFICIENT_EVIDENCE",
  "VALIDATION_FAILED",
  "VALIDATION_PASSED",
  "PROMOTION_ELIGIBLE",
  "REJECTED",
  "SUPERSEDED",
  "INVALIDATED",
] as const);

export const scientificPromotionGateIdsV1 = Object.freeze([
  "GATE_AUTHORITY_AND_TENANCY",
  "GATE_SUBJECT_IDENTITY",
  "GATE_ACCEPTED_EXECUTION_RESULT",
  "GATE_EVIDENCE_OBJECT_BINDING",
  "GATE_VALIDATION_RESULT",
  "GATE_METRIC_RESULT_SET_V2",
  "GATE_RL7_ROBUSTNESS_COMPARISON",
  "GATE_LINEAGE_INTEGRITY",
  "GATE_PROTOCOL_COMPATIBILITY",
  "GATE_EVIDENCE_COMPLETENESS",
] as const);

export const scientificPromotionTransitionGraphV1 = Object.freeze([
  { from: "DRAFT_RESEARCH", to: "EXECUTED" },
  { from: "EXECUTED", to: "INSUFFICIENT_EVIDENCE" },
  { from: "EXECUTED", to: "VALIDATION_FAILED" },
  { from: "EXECUTED", to: "VALIDATION_PASSED" },
  { from: "INSUFFICIENT_EVIDENCE", to: "INSUFFICIENT_EVIDENCE" },
  { from: "INSUFFICIENT_EVIDENCE", to: "VALIDATION_FAILED" },
  { from: "INSUFFICIENT_EVIDENCE", to: "VALIDATION_PASSED" },
  { from: "VALIDATION_FAILED", to: "REJECTED" },
  { from: "VALIDATION_PASSED", to: "PROMOTION_ELIGIBLE" },
  { from: "VALIDATION_PASSED", to: "REJECTED" },
  { from: "PROMOTION_ELIGIBLE", to: "SUPERSEDED" },
  { from: "PROMOTION_ELIGIBLE", to: "INVALIDATED" },
  { from: "REJECTED", to: "SUPERSEDED" },
  { from: "INVALIDATED", to: "SUPERSEDED" },
] as const satisfies readonly { from: ScientificPromotionStateV1; to: ScientificPromotionStateV1 }[]);

const gateStatuses = Object.freeze(["PASS", "FAIL", "INSUFFICIENT_EVIDENCE", "INCOMPATIBLE_EVIDENCE", "UNAVAILABLE"] as const);
const reasonCodes = Object.freeze([
  "MISSING_SUBJECT",
  "MISSING_RESULT",
  "MISSING_EVIDENCE_OBJECT",
  "MISSING_VALIDATION_RESULT",
  "MISSING_METRIC_RESULT_SET",
  "MISSING_RL7_COMPARISON",
  "INCOMPLETE_VALIDATION",
  "INSUFFICIENT_RL7_EVIDENCE",
  "FAILED_VALIDATION",
  "FAILED_ROBUSTNESS_GATE",
  "INCOMPATIBLE_SCHEMA_VERSION",
  "INCOMPATIBLE_PROTOCOL_VERSION",
  "INCOMPATIBLE_METRIC_REGISTRY",
  "INCOMPATIBLE_ENGINE_VERSION",
  "INCOMPATIBLE_ARTIFACT_SCHEMA",
  "WRONG_LINEAGE",
  "WRONG_TENANT",
  "WRONG_INVESTIGATION",
  "WRONG_HASHREF_DOMAIN",
  "MALFORMED_HASHREF",
  "MALFORMED_PROTOCOL",
  "MALFORMED_TRANSITION",
  "FORBIDDEN_TRANSITION",
  "DIVERGENT_EXISTING_IDENTITY",
  "CORRUPTED_EVIDENCE",
  "UNAUTHORIZED_EVIDENCE",
  "AUTHORITY_FAILURE",
  "SUPERSEDED_EVIDENCE",
  "INVALIDATED_EVIDENCE",
  "UNKNOWN_GATE",
  "UNKNOWN_STATE",
  "UNKNOWN_RL7_CLASSIFICATION",
] as const);

const decisionPrecedence = Object.freeze([
  "FAIL_CLOSED_INTEGRITY_AUTHORITY_LINEAGE_COMPATIBILITY",
  "FAIL_CLOSED_FORBIDDEN_TRANSITION",
  "INSUFFICIENT_EVIDENCE",
  "VALIDATION_FAILED",
  "RL7_MIXED_INSUFFICIENT_EVIDENCE",
  "PROMOTION_ELIGIBLE_WHEN_ALL_GATES_PASS",
] as const);

const protocolKeys = new Set([
  "schemaVersion",
  "protocolId",
  "requiredEvidenceClasses",
  "compatibleMetricRegistryVersion",
  "requiredRl7PolicyId",
  "rl7Required",
  "stateVocabulary",
  "gateVocabulary",
  "gateStatusVocabulary",
  "reasonVocabulary",
  "decisionPrecedence",
  "transitionGraph",
]);
const subjectKeys = new Set([
  "tenantAuthority",
  "investigationId",
  "subjectExperiment",
  "subjectExperimentParameters",
  "subjectResearchIr",
  "subjectRunInput",
  "subjectResult",
  "subjectEvidenceObject",
  "subjectValidationProtocol",
  "subjectValidationResult",
  "subjectMetricResultSet",
  "robustnessComparisonProtocol",
  "robustnessComparisonResult",
]);
const transitionKeys = new Set([
  "schemaVersion",
  "protocol",
  "subject",
  "predecessorState",
  "resultingState",
  "gateOutcomes",
  "transitionReasons",
  "supersedes",
  "invalidates",
  "rejectedTransition",
  "predecessorTransition",
  "supersededByChain",
]);
const gateOutcomeKeys = new Set(["gateId", "status", "reasons", "evidence"]);

export const scientificPromotionProtocolV1: ScientificPromotionProtocolV1 = Object.freeze({
  schemaVersion: "SCIENTIFIC_PROMOTION_PROTOCOL_V1",
  protocolId: scientificPromotionProtocolIdV1,
  requiredEvidenceClasses: [
    "EXECUTION_RESULT",
    "EVIDENCE_OBJECT",
    "VALIDATION_RESULT",
    "METRIC_RESULT_SET_V2",
    "RL7_EXPERIMENT_COMPARISON_RESULT",
  ] as const,
  compatibleMetricRegistryVersion: scientificPromotionMetricRegistryVersionV1,
  requiredRl7PolicyId: scientificPromotionRl7PolicyIdV1,
  rl7Required: true,
  stateVocabulary: scientificPromotionStatesV1,
  gateVocabulary: scientificPromotionGateIdsV1,
  gateStatusVocabulary: gateStatuses,
  reasonVocabulary: reasonCodes,
  decisionPrecedence,
  transitionGraph: scientificPromotionTransitionGraphV1,
});

export function canonicalScientificPromotionProtocolV1(input: ScientificPromotionProtocolV1): CanonicalJsonValue {
  assertClosedPlainObject(input, protocolKeys, "ScientificPromotionProtocol");
  if (input.schemaVersion !== "SCIENTIFIC_PROMOTION_PROTOCOL_V1") throw new Error("MALFORMED_PROTOCOL");
  if (input.protocolId !== scientificPromotionProtocolIdV1) throw new Error("INCOMPATIBLE_PROTOCOL_VERSION");
  if (input.compatibleMetricRegistryVersion !== scientificPromotionMetricRegistryVersionV1) throw new Error("INCOMPATIBLE_METRIC_REGISTRY");
  if (input.requiredRl7PolicyId !== scientificPromotionRl7PolicyIdV1 || input.rl7Required !== true) throw new Error("MISSING_RL7_COMPARISON");
  assertExactList(input.requiredEvidenceClasses, scientificPromotionProtocolV1.requiredEvidenceClasses, "INCOMPATIBLE_EVIDENCE");
  assertExactList(input.stateVocabulary, scientificPromotionStatesV1, "UNKNOWN_STATE");
  assertExactList(input.gateVocabulary, scientificPromotionGateIdsV1, "UNKNOWN_GATE");
  assertExactList(input.gateStatusVocabulary, gateStatuses, "MALFORMED_PROTOCOL");
  assertExactList(input.reasonVocabulary, reasonCodes, "MALFORMED_PROTOCOL");
  assertExactList(input.decisionPrecedence, decisionPrecedence, "MALFORMED_PROTOCOL");
  assertExactTransitions(input.transitionGraph);
  return {
    schemaVersion: input.schemaVersion,
    protocolId: input.protocolId,
    requiredEvidenceClasses: [...input.requiredEvidenceClasses],
    compatibleMetricRegistryVersion: input.compatibleMetricRegistryVersion,
    requiredRl7PolicyId: input.requiredRl7PolicyId,
    rl7Required: true,
    stateVocabulary: [...input.stateVocabulary],
    gateVocabulary: [...input.gateVocabulary],
    gateStatusVocabulary: [...input.gateStatusVocabulary],
    reasonVocabulary: [...input.reasonVocabulary],
    decisionPrecedence: [...input.decisionPrecedence],
    transitionGraph: scientificPromotionTransitionGraphV1.map((entry) => ({ from: entry.from, to: entry.to })),
  };
}

export function hashScientificPromotionProtocolV1(input: ScientificPromotionProtocolV1 = scientificPromotionProtocolV1): CanonicalSha256HexV1 {
  assertHashDomainAdmittedForHashingV1("SYNTRAKE:SCIENTIFIC_PROMOTION_PROTOCOL:V1");
  return sha256HexV1(Buffer.concat([
    Buffer.from("SYNTRAKE:SCIENTIFIC_PROMOTION_PROTOCOL:V1\n", "utf8"),
    i5ResearchInternalCanonicalJsonBytesV1(canonicalScientificPromotionProtocolV1(input)),
  ]));
}

export function scientificPromotionProtocolRefV1(): HashRefV1 {
  return hashRefV1({
    hashAlgorithm: "SHA-256",
    hashDomain: "SYNTRAKE:SCIENTIFIC_PROMOTION_PROTOCOL:V1",
    hashVersion: "SYNTRAKE_SHA256_V1",
    hashHex: hashScientificPromotionProtocolV1(scientificPromotionProtocolV1),
  });
}

export function canonicalScientificPromotionSubjectV1(input: ScientificPromotionSubjectV1): CanonicalJsonValue {
  assertClosedPlainObject(input, subjectKeys, "ScientificPromotionSubject");
  if (typeof input.tenantAuthority !== "string" || input.tenantAuthority.length === 0) throw new Error("AUTHORITY_FAILURE");
  if (typeof input.investigationId !== "string" || input.investigationId.length === 0) throw new Error("WRONG_INVESTIGATION");
  const subjectMetricResultSet = canonicalMetricResultSetRef(input.subjectMetricResultSet);
  return {
    tenantAuthority: input.tenantAuthority,
    investigationId: input.investigationId,
    subjectExperiment: checkedRef(input.subjectExperiment, "SYNTRAKE:EXPERIMENT:V1"),
    subjectExperimentParameters: checkedRef(input.subjectExperimentParameters, "SYNTRAKE:EXPERIMENT_PARAMETERS:V1"),
    subjectResearchIr: checkedRef(input.subjectResearchIr, "SYNTRAKE:RESEARCH_IR:V1"),
    subjectRunInput: checkedRef(input.subjectRunInput, "SYNTRAKE:RUN_INPUT:V1"),
    subjectResult: checkedRef(input.subjectResult, "SYNTRAKE:RESULT:V1"),
    subjectEvidenceObject: checkedRef(input.subjectEvidenceObject, "SYNTRAKE:EVIDENCE_OBJECT:V1"),
    subjectValidationProtocol: checkedRef(input.subjectValidationProtocol, "SYNTRAKE:VALIDATION_PROTOCOL:V1"),
    subjectValidationResult: checkedRef(input.subjectValidationResult, "SYNTRAKE:VALIDATION_RESULT:V1"),
    subjectMetricResultSet,
    robustnessComparisonProtocol: checkedRef(input.robustnessComparisonProtocol, "SYNTRAKE:EXPERIMENT_COMPARISON_PROTOCOL:V1"),
    robustnessComparisonResult: checkedRef(input.robustnessComparisonResult, "SYNTRAKE:EXPERIMENT_COMPARISON_RESULT:V1"),
  };
}

export function hashScientificPromotionChainKeyV1(subject: ScientificPromotionSubjectV1, protocol: HashRefV1): CanonicalSha256HexV1 {
  const protocolRef = checkedRef(protocol, "SYNTRAKE:SCIENTIFIC_PROMOTION_PROTOCOL:V1");
  return sha256HexV1(i5ResearchInternalCanonicalJsonBytesV1({
    schemaVersion: "SCIENTIFIC_PROMOTION_CHAIN_KEY_V1",
    subject: canonicalScientificPromotionSubjectV1(subject),
    protocol: protocolRef,
  }));
}

export function canonicalScientificPromotionTransitionV1(input: ScientificPromotionTransitionV1): CanonicalJsonValue {
  assertClosedPlainObject(input, transitionKeys, "ScientificPromotionTransition");
  if (input.schemaVersion !== "SCIENTIFIC_PROMOTION_TRANSITION_V1") throw new Error("MALFORMED_TRANSITION");
  const protocol = checkedRef(input.protocol, "SYNTRAKE:SCIENTIFIC_PROMOTION_PROTOCOL:V1");
  const predecessorState = input.predecessorState === null ? null : state(input.predecessorState);
  const resultingState = state(input.resultingState);
  if (predecessorState === null) {
    if (input.predecessorTransition !== null) throw new Error("MALFORMED_TRANSITION");
  } else {
    checkedRef(input.predecessorTransition ?? fail("MALFORMED_TRANSITION"), "SYNTRAKE:SCIENTIFIC_PROMOTION_TRANSITION:V1");
    if (!isAdmittedTransition(predecessorState, resultingState)) throw new Error("FORBIDDEN_TRANSITION");
  }
  const gateOutcomes = canonicalGateOutcomes(input.gateOutcomes);
  if (resultingState === "PROMOTION_ELIGIBLE" && input.gateOutcomes.some((gate) => gate.status !== "PASS")) {
    throw new Error("AUTHORITY_FAILURE");
  }
  const supersededByChain = input.supersededByChain === null ? null : canonicalSupersededByChain(input.supersededByChain);
  if (supersededByChain !== null && resultingState !== "SUPERSEDED") throw new Error("MALFORMED_TRANSITION");
  return {
    schemaVersion: input.schemaVersion,
    protocol,
    subject: canonicalScientificPromotionSubjectV1(input.subject),
    predecessorState,
    resultingState,
    gateOutcomes,
    transitionReasons: canonicalReasons(input.transitionReasons),
    supersedes: nullableTransitionRef(input.supersedes),
    invalidates: nullableTransitionRef(input.invalidates),
    rejectedTransition: nullableTransitionRef(input.rejectedTransition),
    predecessorTransition: nullableTransitionRef(input.predecessorTransition),
    supersededByChain,
  };
}

export function hashScientificPromotionTransitionV1(input: ScientificPromotionTransitionV1): CanonicalSha256HexV1 {
  assertHashDomainAdmittedForHashingV1("SYNTRAKE:SCIENTIFIC_PROMOTION_TRANSITION:V1");
  return sha256HexV1(Buffer.concat([
    Buffer.from("SYNTRAKE:SCIENTIFIC_PROMOTION_TRANSITION:V1\n", "utf8"),
    i5ResearchInternalCanonicalJsonBytesV1(canonicalScientificPromotionTransitionV1(input)),
  ]));
}

export function evaluateScientificPromotionGatesV1(input: {
  subject: ScientificPromotionSubjectV1 | null;
  validationPassed: boolean | null;
  metricResultSetSchemaVersion: "METRIC_RESULT_SET_V2" | string | null;
  rl7Classification: "ROBUSTNESS_STABLE" | "ROBUSTNESS_MIXED" | "ROBUSTNESS_DEGRADED" | "ROBUSTNESS_UNSTABLE" | "ROBUSTNESS_INSUFFICIENT_EVIDENCE" | string | null;
}): { resultingState: ScientificPromotionStateV1 | null; gateOutcomes: readonly ScientificPromotionGateOutcomeV1[]; reasons: readonly ScientificPromotionReasonCodeV1[] } {
  const evidence = input.subject ? [input.subject.subjectResult, input.subject.subjectEvidenceObject, input.subject.subjectValidationResult, input.subject.robustnessComparisonResult] : [];
  const outcomes = scientificPromotionGateIdsV1.map((gateId): ScientificPromotionGateOutcomeV1 => ({ gateId, status: "PASS", reasons: [], evidence }));
  const fail = (gateId: ScientificPromotionGateIdV1, status: ScientificPromotionGateStatusV1, reason: ScientificPromotionReasonCodeV1, state: ScientificPromotionStateV1 | null) => ({
    resultingState: state,
    gateOutcomes: outcomes.map((gate) => gate.gateId === gateId ? { ...gate, status, reasons: [reason], evidence: [] } : gate),
    reasons: [reason],
  });
  if (!input.subject) return fail("GATE_SUBJECT_IDENTITY", "UNAVAILABLE", "MISSING_SUBJECT", "INSUFFICIENT_EVIDENCE");
  try { canonicalScientificPromotionSubjectV1(input.subject); } catch { return fail("GATE_SUBJECT_IDENTITY", "INCOMPATIBLE_EVIDENCE", "WRONG_HASHREF_DOMAIN", null); }
  if (input.metricResultSetSchemaVersion !== "METRIC_RESULT_SET_V2") return fail("GATE_METRIC_RESULT_SET_V2", "INCOMPATIBLE_EVIDENCE", "INCOMPATIBLE_ARTIFACT_SCHEMA", null);
  if (input.validationPassed === null) return fail("GATE_VALIDATION_RESULT", "UNAVAILABLE", "MISSING_VALIDATION_RESULT", "INSUFFICIENT_EVIDENCE");
  if (!input.validationPassed) return fail("GATE_VALIDATION_RESULT", "FAIL", "FAILED_VALIDATION", "VALIDATION_FAILED");
  if (input.rl7Classification === null) return fail("GATE_RL7_ROBUSTNESS_COMPARISON", "UNAVAILABLE", "MISSING_RL7_COMPARISON", "INSUFFICIENT_EVIDENCE");
  if (input.rl7Classification === "ROBUSTNESS_MIXED" || input.rl7Classification === "ROBUSTNESS_INSUFFICIENT_EVIDENCE") return fail("GATE_RL7_ROBUSTNESS_COMPARISON", "INSUFFICIENT_EVIDENCE", "INSUFFICIENT_RL7_EVIDENCE", "INSUFFICIENT_EVIDENCE");
  if (input.rl7Classification === "ROBUSTNESS_DEGRADED" || input.rl7Classification === "ROBUSTNESS_UNSTABLE") return fail("GATE_RL7_ROBUSTNESS_COMPARISON", "FAIL", "FAILED_ROBUSTNESS_GATE", "VALIDATION_FAILED");
  if (input.rl7Classification !== "ROBUSTNESS_STABLE") return fail("GATE_RL7_ROBUSTNESS_COMPARISON", "INCOMPATIBLE_EVIDENCE", "UNKNOWN_RL7_CLASSIFICATION", null);
  return { resultingState: "PROMOTION_ELIGIBLE", gateOutcomes: outcomes, reasons: [] };
}

function checkedRef(ref: HashRefV1, domain: Parameters<typeof assertHashRefDomainV1>[1]): HashRefV1 {
  const canonical = hashRefV1(ref);
  assertHashRefDomainV1(canonical, domain);
  return canonical;
}
function nullableTransitionRef(ref: HashRefV1 | null): HashRefV1 | null {
  return ref === null ? null : checkedRef(ref, "SYNTRAKE:SCIENTIFIC_PROMOTION_TRANSITION:V1");
}
function canonicalSupersededByChain(input: ScientificPromotionTransitionV1["supersededByChain"]): CanonicalJsonValue {
  if (input === null) return null;
  assertClosedPlainObject(input, new Set(["successorProtocol", "successorRootTransition"]), "SupersededByChain");
  return {
    successorProtocol: checkedRef(input.successorProtocol, "SYNTRAKE:SCIENTIFIC_PROMOTION_PROTOCOL:V1"),
    successorRootTransition: checkedRef(input.successorRootTransition, "SYNTRAKE:SCIENTIFIC_PROMOTION_TRANSITION:V1"),
  };
}
function canonicalGateOutcomes(input: readonly ScientificPromotionGateOutcomeV1[]): readonly CanonicalJsonValue[] {
  if (!Array.isArray(input) || input.length !== scientificPromotionGateIdsV1.length) throw new Error("UNKNOWN_GATE");
  const seen = new Set<string>();
  const outcomes = input.map((gate) => {
    assertClosedPlainObject(gate, gateOutcomeKeys, "ScientificPromotionGateOutcome");
    const gateId = gateIdValue(gate.gateId);
    if (seen.has(gateId)) throw new Error("UNKNOWN_GATE");
    seen.add(gateId);
    return { gateId, status: gateStatus(gate.status), reasons: canonicalReasons(gate.reasons), evidence: canonicalEvidence(gate.evidence) };
  }).sort((a, b) => byteCompare(String(a.gateId), String(b.gateId)));
  for (const gateId of scientificPromotionGateIdsV1) if (!seen.has(gateId)) throw new Error("UNKNOWN_GATE");
  return outcomes;
}
function canonicalEvidence(input: readonly HashRefV1[]): readonly HashRefV1[] {
  if (!Array.isArray(input)) throw new Error("MALFORMED_TRANSITION");
  const refs = input.map(hashRefV1).sort((a, b) => byteCompare(`${a.hashDomain}:${a.hashHex}`, `${b.hashDomain}:${b.hashHex}`));
  for (let index = 1; index < refs.length; index += 1) if (`${refs[index - 1]!.hashDomain}:${refs[index - 1]!.hashHex}` === `${refs[index]!.hashDomain}:${refs[index]!.hashHex}`) throw new Error("CORRUPTED_EVIDENCE");
  return refs;
}
function canonicalReasons(input: readonly ScientificPromotionReasonCodeV1[]): readonly ScientificPromotionReasonCodeV1[] {
  if (!Array.isArray(input)) throw new Error("MALFORMED_TRANSITION");
  const reasons = input.map(reason).sort(byteCompare);
  if (new Set(reasons).size !== reasons.length) throw new Error("MALFORMED_TRANSITION");
  return reasons;
}
function canonicalMetricResultSetRef(input: ScientificPromotionSubjectV1["subjectMetricResultSet"]): CanonicalJsonValue {
  assertClosedPlainObject(input, new Set(["hashAlgorithm", "hashDomain", "hashVersion", "hashHex"]), "MetricResultSetRef");
  if (input.hashAlgorithm !== "SHA-256" || input.hashDomain !== "METRIC_RESULT_SET_V2" || input.hashVersion !== "SYNTRAKE_SHA256_V1") throw new Error("INCOMPATIBLE_ARTIFACT_SCHEMA");
  if (!/^[0-9A-F]{64}$/u.test(input.hashHex)) throw new Error("MALFORMED_HASHREF");
  return { hashAlgorithm: input.hashAlgorithm, hashDomain: input.hashDomain, hashVersion: input.hashVersion, hashHex: input.hashHex };
}
function isAdmittedTransition(from: ScientificPromotionStateV1, to: ScientificPromotionStateV1) {
  return scientificPromotionTransitionGraphV1.some((transition) => transition.from === from && transition.to === to);
}
function assertExactTransitions(input: readonly { from: ScientificPromotionStateV1; to: ScientificPromotionStateV1 }[]) {
  if (!Array.isArray(input) || input.length !== scientificPromotionTransitionGraphV1.length) throw new Error("FORBIDDEN_TRANSITION");
  const expected = scientificPromotionTransitionGraphV1.map((entry) => `${entry.from}->${entry.to}`).sort();
  const actual = input.map((entry) => `${state(entry.from)}->${state(entry.to)}`).sort();
  assertExactList(actual, expected, "FORBIDDEN_TRANSITION");
}
function assertExactList<T extends string>(actual: readonly T[], expected: readonly T[], error: string) {
  if (!Array.isArray(actual) || actual.length !== expected.length) throw new Error(error);
  for (let index = 0; index < expected.length; index += 1) if (actual[index] !== expected[index]) throw new Error(error);
}
function state(value: string): ScientificPromotionStateV1 {
  if (!(scientificPromotionStatesV1 as readonly string[]).includes(value)) throw new Error("UNKNOWN_STATE");
  return value as ScientificPromotionStateV1;
}
function gateIdValue(value: string): ScientificPromotionGateIdV1 {
  if (!(scientificPromotionGateIdsV1 as readonly string[]).includes(value)) throw new Error("UNKNOWN_GATE");
  return value as ScientificPromotionGateIdV1;
}
function gateStatus(value: string): ScientificPromotionGateStatusV1 {
  if (!(gateStatuses as readonly string[]).includes(value)) throw new Error("MALFORMED_TRANSITION");
  return value as ScientificPromotionGateStatusV1;
}
function reason(value: string): ScientificPromotionReasonCodeV1 {
  if (!(reasonCodes as readonly string[]).includes(value)) throw new Error("MALFORMED_TRANSITION");
  return value as ScientificPromotionReasonCodeV1;
}
function assertClosedPlainObject(value: unknown, allowed: ReadonlySet<string>, label: string): void {
  if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error(`${label} must be a plain object`);
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) throw new Error(`${label} contains unknown key: ${key}`);
    if (record[key] === undefined) throw new Error(`${label} contains undefined: ${key}`);
  }
  for (const key of allowed) if (!Object.hasOwn(record, key)) throw new Error(`${label} missing key: ${key}`);
}
function byteCompare(left: string, right: string): number {
  return Buffer.from(left, "utf8").compare(Buffer.from(right, "utf8"));
}
function fail(message: string): never {
  throw new Error(message);
}
