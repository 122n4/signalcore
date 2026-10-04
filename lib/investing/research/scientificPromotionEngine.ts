import {
  assertHashRefDomainV1,
  canonicalRunInputHashPayloadV1,
  hashRefV1,
  hashRunInputV1,
  i5ResearchInternalCanonicalJsonBytesV1,
  sha256HexV1,
  type CanonicalJsonValue,
  type HashDomainV1,
  type HashRefV1,
  type RunInputHashPayloadV1,
} from "./canonical";
import {
  canonicalResultHashPayloadV1,
  hashResultV1,
  type ResultHashPayloadV1,
} from "./resultArtifacts";
import {
  hashResearchExecutionEvidenceObjectV1,
  type ResearchExecutionEvidenceObjectV1,
} from "./evidenceObject";
import {
  canonicalValidationProtocolHashPayloadV1,
  hashValidationProtocolV1,
  type ValidationProtocolHashPayloadV1,
} from "./validationProtocol";
import {
  canonicalValidationResultHashPayloadV1,
  hashValidationResultV1,
  type ValidationResultHashPayloadV1,
} from "./validationAggregate";
import {
  canonicalValidationAssessmentProtocolV1,
  canonicalValidationAssessmentResultV1,
  hashValidationAssessmentProtocolV1,
  hashValidationAssessmentResultV1,
  type ConsumedEvidenceV1,
  type ValidationAssessmentProtocolV1,
  type ValidationAssessmentResultV1,
} from "./validationAssessment";
import {
  canonicalExperimentComparisonProtocolV1,
  hashExperimentComparisonProtocolV1,
  type ExperimentComparisonProtocolV1,
} from "./experimentComparison";
import {
  canonicalExperimentComparisonResultV1,
  hashExperimentComparisonResultV1,
  type ExperimentComparisonResultV1,
} from "./experimentComparisonResult";
import {
  assertScientificPromotionAssessmentCompatibilityV1,
  assertScientificPromotionPredecessorRelationV1,
  assertScientificPromotionRl7CompatibilityV1,
  canonicalScientificPromotionEvidenceSnapshotV1,
  canonicalScientificPromotionSubjectV1,
  canonicalScientificPromotionTransitionV1,
  evaluateScientificPromotionStageAV1,
  gateEvidenceForScientificPromotionV1,
  hashScientificPromotionProtocolV1,
  hashScientificPromotionTransitionV1,
  scientificPromotionGateVocabularyV1,
  type ScientificPromotionEvidenceSnapshotV1,
  type ScientificPromotionGateOutcomeV1,
  type ScientificPromotionGateStatusV1,
  type ScientificPromotionReasonV1,
  type ScientificPromotionStageAResultStateV1,
  type ScientificPromotionStageASourceStateV1,
  type ScientificPromotionSubjectV1,
  type ScientificPromotionTransitionV1,
} from "./scientificPromotion";

type HashRefForDomainV1 = HashRefV1;

type ResolvedPayloadV1<P> = Readonly<{
  ref: HashRefForDomainV1;
  payload: P;
}>;

export type ScientificPromotionAuthorityVerdictV1 =
  | Readonly<{ status: "VERIFIED" }>
  | Readonly<{ status: "FAIL_CLOSED"; reason: "WRONG_TENANT" | "WRONG_INVESTIGATION" | "UNAUTHORIZED_EVIDENCE" | "AUTHORITY_FAILURE" }>;

export type ScientificPromotionResolvedEvidenceV1 = Readonly<{
  predecessor: ScientificPromotionTransitionV1;
  authority: ScientificPromotionAuthorityVerdictV1;
  subject: ScientificPromotionSubjectV1;
  runInput: ResolvedPayloadV1<RunInputHashPayloadV1>;
  result: ResolvedPayloadV1<ResultHashPayloadV1>;
  evidenceObject: Readonly<{ ref: HashRefForDomainV1; object: ResearchExecutionEvidenceObjectV1 }> | null;
  validationProtocol: ResolvedPayloadV1<ValidationProtocolHashPayloadV1>;
  validationResult: ResolvedPayloadV1<ValidationResultHashPayloadV1>;
  validationAssessmentProtocol: ResolvedPayloadV1<ValidationAssessmentProtocolV1> | null;
  validationAssessmentResult: ResolvedPayloadV1<ValidationAssessmentResultV1> | null;
  robustness: Readonly<{
    protocolRef: HashRefForDomainV1;
    protocol: ExperimentComparisonProtocolV1;
    resultRef: HashRefForDomainV1;
    result: ExperimentComparisonResultV1;
  }> | null;
}>;

export type ScientificPromotionEvaluationPlanV1 =
  | Readonly<{ kind: "FAIL_CLOSED"; reason: ScientificPromotionReasonV1 }>
  | Readonly<{
      kind: "AUTHORITATIVE_PLAN";
      stageA: Readonly<{ transition: ScientificPromotionTransitionV1; transitionRef: ReturnType<typeof hashScientificPromotionTransitionV1> }>;
      closure: null | Readonly<{ transition: ScientificPromotionTransitionV1; transitionRef: ReturnType<typeof hashScientificPromotionTransitionV1> }>;
    }>;

const inputKeys = new Set([
  "predecessor", "authority", "subject", "runInput", "result", "evidenceObject", "validationProtocol", "validationResult",
  "validationAssessmentProtocol", "validationAssessmentResult", "robustness",
]);
const authorityKeys = new Set(["status", "reason"]);
const payloadKeys = new Set(["ref", "payload"]);
const evidenceObjectKeys = new Set(["ref", "object"]);
const robustnessKeys = new Set(["protocolRef", "protocol", "resultRef", "result"]);
const stageASourceStates = new Set<string>(["EXECUTED", "INSUFFICIENT_EVIDENCE", "PROMOTION_ELIGIBLE", "REJECTED"] satisfies ScientificPromotionStageASourceStateV1[]);

export function evaluateScientificPromotionV1(input: ScientificPromotionResolvedEvidenceV1): ScientificPromotionEvaluationPlanV1 {
  try {
    assertClosed(input, inputKeys, "ScientificPromotionResolvedEvidence");
    assertClosed(input.authority, input.authority.status === "VERIFIED" ? new Set(["status"]) : authorityKeys, "ScientificPromotionAuthorityVerdict");
    if (input.authority.status !== "VERIFIED") return fail(input.authority.reason);

    const subject = canonicalScientificPromotionSubjectV1(input.subject);
    const predecessor = canonicalScientificPromotionTransitionV1(input.predecessor) as unknown as ScientificPromotionTransitionV1;
    if (!stageASourceStates.has(predecessor.resultingState)) return fail("FORBIDDEN_TRANSITION");
    if (!sameCanonical(predecessor.protocol, hashScientificPromotionProtocolV1())) return fail("INCOMPATIBLE_PROTOCOL_VERSION");
    if (!sameCanonical(predecessor.subject, subject)) return fail("WRONG_LINEAGE");

    const runInputRef = verifiedPayloadRef(input.runInput, "SYNTRAKE:RUN_INPUT:V1", hashRunInputV1(input.runInput.payload));
    const runInput = canonicalRunInputHashPayloadV1(input.runInput.payload) as unknown as RunInputHashPayloadV1;
    const resultRef = verifiedPayloadRef(input.result, "SYNTRAKE:RESULT:V1", hashResultV1(input.result.payload));
    const result = canonicalResultHashPayloadV1(input.result.payload) as unknown as ResultHashPayloadV1;
    const validationProtocolRef = verifiedPayloadRef(input.validationProtocol, "SYNTRAKE:VALIDATION_PROTOCOL:V1", hashValidationProtocolV1(input.validationProtocol.payload));
    const validationProtocol = canonicalValidationProtocolHashPayloadV1(input.validationProtocol.payload) as unknown as ValidationProtocolHashPayloadV1;
    const validationResultRef = verifiedPayloadRef(input.validationResult, "SYNTRAKE:VALIDATION_RESULT:V1", hashValidationResultV1(input.validationResult.payload));
    const validationResult = canonicalValidationResultHashPayloadV1(input.validationResult.payload) as unknown as ValidationResultHashPayloadV1;

    if (input.validationAssessmentProtocol === null || input.validationAssessmentResult === null) return fail("MISSING_VALIDATION_ASSESSMENT_AUTHORITY");
    const assessmentProtocolRef = verifiedPayloadRef(input.validationAssessmentProtocol, "SYNTRAKE:VALIDATION_ASSESSMENT_PROTOCOL:V1", hashValidationAssessmentProtocolV1(input.validationAssessmentProtocol.payload));
    const assessmentProtocol = canonicalValidationAssessmentProtocolV1(input.validationAssessmentProtocol.payload) as unknown as ValidationAssessmentProtocolV1;
    const assessmentResultRef = verifiedPayloadRef(input.validationAssessmentResult, "SYNTRAKE:VALIDATION_ASSESSMENT_RESULT:V1", hashValidationAssessmentResultV1(input.validationAssessmentResult.payload));
    const assessmentResult = canonicalValidationAssessmentResultV1(input.validationAssessmentResult.payload) as unknown as ValidationAssessmentResultV1;

    const evidenceObjectRef = input.evidenceObject === null ? null : verifyEvidenceObject(input.evidenceObject);
    const robustnessPair = verifyRobustnessShape(input.robustness);

    assertExecutionLineage({ subject, runInput, runInputRef, result, resultRef, evidenceObject: input.evidenceObject?.object ?? null, validationProtocol, validationProtocolRef, validationResult });

    const evidenceSnapshot = canonicalScientificPromotionEvidenceSnapshotV1({
      runInput: runInputRef,
      result: resultRef,
      evidenceObject: evidenceObjectRef,
      validationProtocol: validationProtocolRef,
      validationResult: validationResultRef,
      validationAssessmentProtocol: assessmentProtocolRef,
      validationAssessmentResult: assessmentResultRef,
      robustnessComparisonProtocol: robustnessPair?.protocolRef ?? null,
      robustnessComparisonResult: robustnessPair?.resultRef ?? null,
    });

    const consumedEvidence = assertAssessment({ assessmentProtocol, assessmentResult, subject, evidenceSnapshot });
    const rl7Outcome = robustnessPair === null ? "INSUFFICIENT_EVIDENCE" : assertRl7({ robustnessPair, subject, evidenceSnapshot });
    const gateOutcomes = buildGateOutcomes({ subject, evidenceSnapshot, assessmentResult, rl7Outcome, evidenceObjectPresent: evidenceObjectRef !== null, consumedEvidence });
    const requestedState = deriveRequestedState(gateOutcomes, assessmentResult.outcome, rl7Outcome);
    const decision = evaluateScientificPromotionStageAV1({
      predecessorState: predecessor.resultingState,
      requestedState,
      gateOutcomes,
      assessmentOutcome: assessmentResult.outcome,
      rl7Outcome,
      failClosedReason: null,
    });
    if (decision.kind === "FAIL_CLOSED") return fail(decision.reason);

    const stageATransition = canonicalScientificPromotionTransitionV1({
      schemaVersion: "SCIENTIFIC_PROMOTION_TRANSITION_V1",
      protocol: hashScientificPromotionProtocolV1(),
      subject,
      predecessorTransition: hashScientificPromotionTransitionV1(input.predecessor),
      predecessorState: predecessor.resultingState,
      resultingState: decision.resultingState,
      evidenceSnapshot,
      gateOutcomes,
      transitionReasons: decision.reasons,
      supersedes: null,
      rejectedTransition: null,
      supersededByChain: null,
    }) as unknown as ScientificPromotionTransitionV1;
    const stageARef = hashScientificPromotionTransitionV1(stageATransition);
    const closure = buildClosure(stageATransition, stageARef);
    return deepFreeze({
      kind: "AUTHORITATIVE_PLAN",
      stageA: { transition: stageATransition, transitionRef: stageARef },
      closure,
    });
  } catch (error) {
    return fail(reasonFromError(error));
  }
}

function verifiedPayloadRef<D extends HashDomainV1, P>(bundle: ResolvedPayloadV1<P>, domain: D, hashHex: string): HashRefForDomainV1 {
  assertClosed(bundle, payloadKeys, "ResolvedPayload");
  const ref = hashRefV1(bundle.ref);
  assertHashRefDomainV1(ref, domain);
  if (ref.hashHex !== hashHex) throw new Error("CORRUPTED_EVIDENCE");
  return ref as HashRefForDomainV1;
}

function verifyEvidenceObject(bundle: Readonly<{ ref: HashRefForDomainV1; object: ResearchExecutionEvidenceObjectV1 }>): HashRefForDomainV1 {
  assertClosed(bundle, evidenceObjectKeys, "ResolvedEvidenceObject");
  const ref = hashRefV1(bundle.ref);
  assertHashRefDomainV1(ref, "SYNTRAKE:EVIDENCE_OBJECT:V1");
  if (!sameCanonical(bundle.object.evidenceHash, ref)) throw new Error("CORRUPTED_EVIDENCE");
  if (hashResearchExecutionEvidenceObjectV1(bundle.object.descriptor, bundle.object.contentBytes) !== ref.hashHex) throw new Error("CORRUPTED_EVIDENCE");
  if (sha256HexV1(bundle.object.contentBytes) !== bundle.object.contentSha256) throw new Error("CORRUPTED_EVIDENCE");
  const contentBytes = i5ResearchInternalCanonicalJsonBytesV1(bundle.object.content as unknown as CanonicalJsonValue);
  if (!Buffer.from(contentBytes).equals(Buffer.from(bundle.object.contentBytes))) throw new Error("CORRUPTED_EVIDENCE");
  return ref as HashRefForDomainV1;
}

function verifyRobustnessShape(input: ScientificPromotionResolvedEvidenceV1["robustness"]): ScientificPromotionResolvedEvidenceV1["robustness"] {
  if (input === null) return null;
  assertClosed(input, robustnessKeys, "ResolvedRobustness");
  const protocolRef = hashRefV1(input.protocolRef);
  const resultRef = hashRefV1(input.resultRef);
  assertHashRefDomainV1(protocolRef, "SYNTRAKE:EXPERIMENT_COMPARISON_PROTOCOL:V1");
  assertHashRefDomainV1(resultRef, "SYNTRAKE:EXPERIMENT_COMPARISON_RESULT:V1");
  canonicalExperimentComparisonProtocolV1(input.protocol);
  canonicalExperimentComparisonResultV1(input.result);
  if (hashExperimentComparisonProtocolV1(input.protocol) !== protocolRef.hashHex) throw new Error("INCOMPATIBLE_PROTOCOL_VERSION");
  if (hashExperimentComparisonResultV1(input.result) !== resultRef.hashHex) throw new Error("INCOMPATIBLE_PROTOCOL_VERSION");
  return { ...input, protocolRef: protocolRef as HashRefForDomainV1, resultRef: resultRef as HashRefForDomainV1 };
}

function assertExecutionLineage(input: Readonly<{
  subject: ScientificPromotionSubjectV1;
  runInput: RunInputHashPayloadV1;
  runInputRef: HashRefV1;
  result: ResultHashPayloadV1;
  resultRef: HashRefV1;
  evidenceObject: ResearchExecutionEvidenceObjectV1 | null;
  validationProtocol: ValidationProtocolHashPayloadV1;
  validationProtocolRef: HashRefV1;
  validationResult: ValidationResultHashPayloadV1;
}>): void {
  if (input.runInput.metricRegistryVersion !== "METRIC_REGISTRY_V20260927") throw new Error("INCOMPATIBLE_METRIC_REGISTRY");
  if (!sameCanonical(input.runInput.experiment, input.subject.subjectExperiment) || !sameCanonical(input.runInput.researchIr, input.subject.subjectResearchIr)) throw new Error("WRONG_LINEAGE");
  if (!sameCanonical(input.result.runInput, input.runInputRef)) throw new Error("WRONG_LINEAGE");
  if (input.result.engineId !== input.runInput.engineId || input.result.engineVersion !== input.runInput.engineVersion) throw new Error("INCOMPATIBLE_ENGINE_VERSION");
  if (!sameCanonical(input.validationProtocol.subjectExperiment, input.subject.subjectExperiment) || !sameCanonical(input.validationProtocol.subjectResearchIr, input.subject.subjectResearchIr)) throw new Error("WRONG_LINEAGE");
  if (input.validationProtocol.engineId !== input.runInput.engineId || input.validationProtocol.engineVersion !== input.runInput.engineVersion) throw new Error("INCOMPATIBLE_ENGINE_VERSION");
  if (input.validationProtocol.metricRegistryVersion !== input.runInput.metricRegistryVersion) throw new Error("INCOMPATIBLE_METRIC_REGISTRY");
  if (!sameCanonical(input.validationProtocol.metricRequestSet, input.runInput.metricRequestSet) || !sameCanonical(input.validationProtocol.executionConfig, input.runInput.executionConfig)) throw new Error("WRONG_LINEAGE");
  if (!sameCanonical(input.validationResult.validationProtocol, input.validationProtocolRef) || !sameCanonical(input.validationResult.subjectExperiment, input.subject.subjectExperiment)) throw new Error("WRONG_LINEAGE");
  if (input.evidenceObject !== null) {
    const content = input.evidenceObject.content;
    if (!sameCanonical(content.runInput, input.runInputRef) || !sameCanonical(content.result, input.resultRef) || !sameCanonical(content.experiment, input.subject.subjectExperiment) || !sameCanonical(content.researchIr, input.subject.subjectResearchIr)) throw new Error("WRONG_LINEAGE");
    if (content.metricRegistryVersion !== input.runInput.metricRegistryVersion) throw new Error("INCOMPATIBLE_METRIC_REGISTRY");
    if (content.engineId !== input.result.engineId || content.engineVersion !== input.result.engineVersion) throw new Error("INCOMPATIBLE_ENGINE_VERSION");
  }
}

function assertAssessment(input: Readonly<{ assessmentProtocol: ValidationAssessmentProtocolV1; assessmentResult: ValidationAssessmentResultV1; subject: ScientificPromotionSubjectV1; evidenceSnapshot: ScientificPromotionEvidenceSnapshotV1 }>): readonly ConsumedEvidenceV1[] {
  const consumed = assertScientificPromotionAssessmentCompatibilityV1(input);
  if (!consumed.some((item) => item.kind === "METRIC_RESULT_SET_DESCRIPTOR_V2")) throw new Error("MISSING_METRIC_RESULT_SET");
  return consumed;
}

function assertRl7(input: Readonly<{ robustnessPair: NonNullable<ScientificPromotionResolvedEvidenceV1["robustness"]>; subject: ScientificPromotionSubjectV1; evidenceSnapshot: ScientificPromotionEvidenceSnapshotV1 }>): "PERMIT_FURTHER_EVALUATION" | "INSUFFICIENT_EVIDENCE" | "VALIDATION_FAILED" | "FAIL_CLOSED" {
  const outcome = assertScientificPromotionRl7CompatibilityV1({
    comparisonProtocol: input.robustnessPair.protocol,
    comparisonResult: input.robustnessPair.result,
    subject: input.subject,
    evidenceSnapshot: input.evidenceSnapshot,
  });
  if (outcome === "FAIL_CLOSED") throw new Error("UNKNOWN_RL7_CLASSIFICATION");
  return outcome;
}

function buildGateOutcomes(input: Readonly<{
  subject: ScientificPromotionSubjectV1;
  evidenceSnapshot: ScientificPromotionEvidenceSnapshotV1;
  assessmentResult: ValidationAssessmentResultV1;
  rl7Outcome: "PERMIT_FURTHER_EVALUATION" | "INSUFFICIENT_EVIDENCE" | "VALIDATION_FAILED" | "FAIL_CLOSED";
  evidenceObjectPresent: boolean;
  consumedEvidence: readonly ConsumedEvidenceV1[];
}>): readonly ScientificPromotionGateOutcomeV1[] {
  const missingCompleteness = [
    ...(input.evidenceObjectPresent ? [] : ["MISSING_EVIDENCE_OBJECT" as const]),
    ...(input.evidenceSnapshot.robustnessComparisonProtocol !== null && input.evidenceSnapshot.robustnessComparisonResult !== null ? [] : ["MISSING_RL7_COMPARISON" as const]),
  ].sort(byteCompare);
  const metricEvidencePresent = input.consumedEvidence.some((item) => item.kind === "METRIC_RESULT_SET_DESCRIPTOR_V2");
  return scientificPromotionGateVocabularyV1.map((gateId): ScientificPromotionGateOutcomeV1 => {
    let status: ScientificPromotionGateStatusV1 = "PASS";
    let reasons: readonly ScientificPromotionReasonV1[] = [];
    if (gateId === "GATE_EVIDENCE_COMPLETENESS" && missingCompleteness.length > 0) {
      status = "INSUFFICIENT_EVIDENCE";
      reasons = missingCompleteness;
    } else if (gateId === "GATE_EVIDENCE_OBJECT_BINDING" && !input.evidenceObjectPresent) {
      status = "PASS";
      reasons = [];
    } else if (gateId === "GATE_VALIDATION_ASSESSMENT") {
      if (input.assessmentResult.outcome === "FAIL") { status = "FAIL"; reasons = ["FAILED_VALIDATION"]; }
      if (input.assessmentResult.outcome === "INSUFFICIENT_EVIDENCE") { status = "INSUFFICIENT_EVIDENCE"; reasons = ["INCOMPLETE_VALIDATION"]; }
    } else if (gateId === "GATE_METRIC_RESULT_SET_V2" && !metricEvidencePresent) {
      status = "INCOMPATIBLE_EVIDENCE";
      reasons = ["MISSING_METRIC_RESULT_SET"];
    } else if (gateId === "GATE_RL7_ROBUSTNESS_COMPARISON") {
      if (input.rl7Outcome === "INSUFFICIENT_EVIDENCE") {
        status = input.evidenceSnapshot.robustnessComparisonProtocol === null ? "PASS" : "INSUFFICIENT_EVIDENCE";
        reasons = input.evidenceSnapshot.robustnessComparisonProtocol === null ? [] : ["INSUFFICIENT_RL7_EVIDENCE"];
      } else if (input.rl7Outcome === "VALIDATION_FAILED") {
        status = "FAIL";
        reasons = ["FAILED_ROBUSTNESS_GATE"];
      }
    }
    return deepFreeze({
      gateId,
      status,
      reasons,
      evidence: gateEvidenceForScientificPromotionV1({ protocol: hashScientificPromotionProtocolV1(), subject: input.subject, evidenceSnapshot: input.evidenceSnapshot, gateId }),
    });
  });
}

function deriveRequestedState(
  gateOutcomes: readonly ScientificPromotionGateOutcomeV1[],
  assessmentOutcome: ValidationAssessmentResultV1["outcome"],
  rl7Outcome: "PERMIT_FURTHER_EVALUATION" | "INSUFFICIENT_EVIDENCE" | "VALIDATION_FAILED" | "FAIL_CLOSED",
): ScientificPromotionStageAResultStateV1 {
  if (assessmentOutcome === "INSUFFICIENT_EVIDENCE" || rl7Outcome === "INSUFFICIENT_EVIDENCE" || gateOutcomes.some((gate) => gate.status === "INSUFFICIENT_EVIDENCE" || gate.status === "UNAVAILABLE")) return "INSUFFICIENT_EVIDENCE";
  if (assessmentOutcome === "FAIL" || rl7Outcome === "VALIDATION_FAILED" || gateOutcomes.some((gate) => gate.status === "FAIL")) return "VALIDATION_FAILED";
  return "VALIDATION_PASSED";
}

type ScientificPromotionClosurePlanV1 = Extract<ScientificPromotionEvaluationPlanV1, { kind: "AUTHORITATIVE_PLAN" }>["closure"];

function buildClosure(stageA: ScientificPromotionTransitionV1, stageARef: ReturnType<typeof hashScientificPromotionTransitionV1>): ScientificPromotionClosurePlanV1 {
  if (stageA.resultingState === "INSUFFICIENT_EVIDENCE") return null;
  const closure = canonicalScientificPromotionTransitionV1({
    ...stageA,
    predecessorTransition: stageARef,
    predecessorState: stageA.resultingState,
    resultingState: stageA.resultingState === "VALIDATION_PASSED" ? "PROMOTION_ELIGIBLE" : "REJECTED",
    transitionReasons: stageA.resultingState === "VALIDATION_PASSED" ? [] : stageA.transitionReasons,
    rejectedTransition: stageA.resultingState === "VALIDATION_FAILED" ? stageARef : null,
  }) as unknown as ScientificPromotionTransitionV1;
  assertScientificPromotionPredecessorRelationV1({ predecessor: stageA, transition: closure });
  return deepFreeze({ transition: closure, transitionRef: hashScientificPromotionTransitionV1(closure) });
}

function fail(reason: ScientificPromotionReasonV1): ScientificPromotionEvaluationPlanV1 {
  return deepFreeze({ kind: "FAIL_CLOSED", reason });
}

function reasonFromError(error: unknown): ScientificPromotionReasonV1 {
  const message = error instanceof Error ? error.message : String(error);
  const known: readonly ScientificPromotionReasonV1[] = [
    "WRONG_TENANT", "WRONG_INVESTIGATION", "UNAUTHORIZED_EVIDENCE", "AUTHORITY_FAILURE", "WRONG_LINEAGE", "CORRUPTED_EVIDENCE",
    "INCOMPATIBLE_ENGINE_VERSION", "INCOMPATIBLE_METRIC_REGISTRY", "INCOMPATIBLE_PROTOCOL_VERSION", "INCOMPATIBLE_SCHEMA_VERSION",
    "INCOMPATIBLE_VALIDATION_ASSESSMENT", "MISSING_VALIDATION_ASSESSMENT_AUTHORITY", "MISSING_METRIC_RESULT_SET", "MISSING_RESULT",
    "MISSING_VALIDATION_RESULT", "MISSING_RL7_COMPARISON", "MALFORMED_TRANSITION", "FORBIDDEN_TRANSITION", "MALFORMED_HASHREF",
    "WRONG_HASHREF_DOMAIN", "UNKNOWN_RL7_CLASSIFICATION", "UNKNOWN_STATE", "UNKNOWN_GATE", "MALFORMED_PROTOCOL", "INCOMPATIBLE_ARTIFACT_SCHEMA",
  ];
  for (const reason of known) if (message.includes(reason)) return reason;
  if (message.includes("HashRef domain")) return "WRONG_HASHREF_DOMAIN";
  if (message.includes("VALIDATION_ASSESSMENT")) return "INCOMPATIBLE_VALIDATION_ASSESSMENT";
  if (message.includes("COMPARISON") || message.includes("ROBUSTNESS")) return "UNKNOWN_RL7_CLASSIFICATION";
  if (message.includes("RESULT") || message.includes("EVIDENCE")) return "CORRUPTED_EVIDENCE";
  return "MALFORMED_PROTOCOL";
}

function sameCanonical(left: unknown, right: unknown): boolean {
  return i5ResearchInternalCanonicalJsonBytesV1(left as CanonicalJsonValue).equals(i5ResearchInternalCanonicalJsonBytesV1(right as CanonicalJsonValue));
}

function byteCompare(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function assertClosed(value: unknown, allowed: ReadonlySet<string>, label: string): void {
  if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error(`${label} must be a plain object`);
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) throw new Error(`${label} contains unknown key: ${key}`);
    if (record[key] === undefined) throw new Error(`${label} contains undefined: ${key}`);
  }
  for (const key of allowed) if (!Object.hasOwn(record, key)) throw new Error(`${label} missing key: ${key}`);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
