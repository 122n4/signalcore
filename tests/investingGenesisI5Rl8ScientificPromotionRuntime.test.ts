import { describe, expect, it } from "vitest";
import { canonicalSha256HexV1, hashDomainStateV1, hashRefV1 } from "../lib/investing/research/canonical";
import {
  canonicalScientificPromotionProtocolV1,
  canonicalScientificPromotionEvidenceAggregateV1,
  canonicalScientificPromotionTransitionV1,
  deriveScientificPromotionEvidenceAggregateFromAcceptedPredecessorsV1,
  evaluateScientificPromotionGatesV1,
  hashScientificPromotionChainKeyV1,
  hashScientificPromotionProtocolV1,
  hashScientificPromotionTransitionV1,
  scientificPromotionGateIdsV1,
  scientificPromotionMetricRegistryVersionV1,
  scientificPromotionProtocolRefV1,
  scientificPromotionProtocolV1,
  scientificPromotionRl7PolicyIdV1,
  type ScientificPromotionEvidenceAggregateV1,
  type ScientificPromotionSubjectV1,
  type ScientificPromotionTransitionV1,
} from "../lib/investing/research/scientificPromotion";

const H = (char: string) => canonicalSha256HexV1(char.repeat(64).slice(0, 64).toUpperCase());
const ref = (domain: Parameters<typeof hashRefV1>[0]["hashDomain"], char: string) => hashRefV1({
  hashAlgorithm: "SHA-256",
  hashDomain: domain,
  hashVersion: "SYNTRAKE_SHA256_V1",
  hashHex: H(char),
});
const metricRef = (char: string) => ({
  hashAlgorithm: "SHA-256" as const,
  hashDomain: "METRIC_RESULT_SET_V2" as const,
  hashVersion: "SYNTRAKE_SHA256_V1" as const,
  hashHex: H(char),
});

function subject(overrides: Partial<ScientificPromotionSubjectV1> = {}): ScientificPromotionSubjectV1 {
  return {
    tenantAuthority: "tenant:alpha",
    investigationId: "44444444-0000-4000-8000-000000000801",
    subjectExperiment: ref("SYNTRAKE:EXPERIMENT:V1", "A"),
    subjectExperimentParameters: ref("SYNTRAKE:EXPERIMENT_PARAMETERS:V1", "B"),
    subjectResearchIr: ref("SYNTRAKE:RESEARCH_IR:V1", "C"),
    subjectRunInput: ref("SYNTRAKE:RUN_INPUT:V1", "D"),
    subjectResult: ref("SYNTRAKE:RESULT:V1", "E"),
    subjectEvidenceObject: ref("SYNTRAKE:EVIDENCE_OBJECT:V1", "F"),
    subjectValidationProtocol: ref("SYNTRAKE:VALIDATION_PROTOCOL:V1", "1"),
    subjectValidationResult: ref("SYNTRAKE:VALIDATION_RESULT:V1", "2"),
    subjectMetricResultSet: metricRef("3"),
    robustnessComparisonProtocol: ref("SYNTRAKE:EXPERIMENT_COMPARISON_PROTOCOL:V1", "4"),
    robustnessComparisonResult: ref("SYNTRAKE:EXPERIMENT_COMPARISON_RESULT:V1", "5"),
    ...overrides,
  };
}

function allPassGates() {
  return scientificPromotionGateIdsV1.map((gateId) => ({ gateId, status: "PASS" as const, reasons: [], evidence: [] }));
}

function aggregate(overrides: Partial<ScientificPromotionEvidenceAggregateV1> = {}): ScientificPromotionEvidenceAggregateV1 {
  const s = subject();
  const protocol = scientificPromotionProtocolRefV1();
  const gateEvidence = {
    GATE_AUTHORITY_AND_TENANCY: { status: "PASS", reasons: [], evidence: [s.subjectResult] },
    GATE_SUBJECT_IDENTITY: { status: "PASS", reasons: [], evidence: [s.subjectExperiment, s.subjectExperimentParameters, s.subjectResearchIr, s.subjectRunInput] },
    GATE_ACCEPTED_EXECUTION_RESULT: { status: "PASS", reasons: [], evidence: [s.subjectResult] },
    GATE_EVIDENCE_OBJECT_BINDING: { status: "PASS", reasons: [], evidence: [s.subjectEvidenceObject, s.subjectResult] },
    GATE_VALIDATION_RESULT: { status: "PASS", reasons: [], evidence: [s.subjectValidationProtocol, s.subjectValidationResult] },
    GATE_METRIC_RESULT_SET_V2: { status: "PASS", reasons: [], evidence: [s.subjectMetricResultSet] },
    GATE_RL7_ROBUSTNESS_COMPARISON: { status: "PASS", reasons: [], evidence: [s.robustnessComparisonProtocol, s.robustnessComparisonResult] },
    GATE_LINEAGE_INTEGRITY: { status: "PASS", reasons: [], evidence: [s.subjectRunInput, s.subjectResult, s.subjectEvidenceObject, s.subjectValidationResult, s.robustnessComparisonResult] },
    GATE_PROTOCOL_COMPATIBILITY: { status: "PASS", reasons: [], evidence: [protocol] },
    GATE_EVIDENCE_COMPLETENESS: { status: "PASS", reasons: [], evidence: [s.subjectResult, s.subjectEvidenceObject, s.subjectValidationResult, s.subjectMetricResultSet, s.robustnessComparisonResult] },
  } satisfies ScientificPromotionEvidenceAggregateV1["gateEvidence"];
  return {
    schemaVersion: "SCIENTIFIC_PROMOTION_EVIDENCE_AGGREGATE_V1",
    authoritySource: "ACCEPTED_PREDECESSOR_PROJECTION_DERIVED",
    tenantAuthority: s.tenantAuthority,
    investigationId: s.investigationId,
    subject: s,
    protocol,
    metricRegistryVersion: scientificPromotionMetricRegistryVersionV1,
    rl7PolicyId: scientificPromotionRl7PolicyIdV1,
    rl7Classification: "ROBUSTNESS_STABLE",
    gateEvidence,
    ...overrides,
  };
}

function acceptedPassportForSubject(s: ScientificPromotionSubjectV1 = subject()) {
  return {
    investigation: { tenantId: "alpha", researchInvestigationId: s.investigationId },
    experiments: [{
      researchExperimentId: "experiment-row",
      experiment: s.subjectExperiment,
      experimentParameters: s.subjectExperimentParameters,
      researchIr: s.subjectResearchIr,
    }],
    runInputs: [{
      runInputIdentityId: "run-input-row",
      runInput: s.subjectRunInput,
      researchIrHashHex: s.subjectResearchIr.hashHex,
      experimentHashHex: s.subjectExperiment.hashHex,
      metricRegistryVersion: scientificPromotionMetricRegistryVersionV1,
    }],
    results: [{
      resultIdentityId: "result-row",
      runInputIdentityId: "run-input-row",
      result: s.subjectResult,
      artifacts: [{ artifactKind: "METRIC_RESULT_SET", artifactSchemaVersion: "METRIC_RESULT_SET_V2" }],
    }],
    evidence: [{
      evidenceIdentityId: "evidence-row",
      resultIdentityId: "result-row",
      runInputIdentityId: "run-input-row",
      evidence: s.subjectEvidenceObject,
    }],
    validation: {
      availability: "AVAILABLE_RL3",
      episodes: [{
        validationProtocol: s.subjectValidationProtocol,
        subjectExperiment: s.subjectExperiment,
        state: "AGGREGATE_AVAILABLE",
        aggregate: { validationResult: s.subjectValidationResult },
      }],
    },
  } as any;
}

function rootTransition(overrides: Partial<ScientificPromotionTransitionV1> = {}): ScientificPromotionTransitionV1 {
  return {
    schemaVersion: "SCIENTIFIC_PROMOTION_TRANSITION_V1",
    protocol: scientificPromotionProtocolRefV1(),
    subject: subject(),
    predecessorState: null,
    resultingState: "PROMOTION_ELIGIBLE",
    gateOutcomes: allPassGates(),
    transitionReasons: [],
    supersedes: null,
    invalidates: null,
    rejectedTransition: null,
    predecessorTransition: null,
    supersededByChain: null,
    ...overrides,
  };
}

describe("I5 RL-8 Scientific Promotion State Machine V1 runtime", () => {
  it("admits the two frozen scientific domains and hashes protocol deterministically", () => {
    expect(hashDomainStateV1("SYNTRAKE:SCIENTIFIC_PROMOTION_PROTOCOL:V1")).toBe("OWNER_PAYLOAD_EXACT");
    expect(hashDomainStateV1("SYNTRAKE:SCIENTIFIC_PROMOTION_TRANSITION:V1")).toBe("OWNER_PAYLOAD_EXACT");
    expect(hashScientificPromotionProtocolV1()).toBe(hashScientificPromotionProtocolV1(scientificPromotionProtocolV1));
    expect(canonicalScientificPromotionProtocolV1(scientificPromotionProtocolV1)).toMatchObject({
      protocolId: "SCIENTIFIC_PROMOTION_PROTOCOL_V20260928",
      rl7Required: true,
      compatibleMetricRegistryVersion: "METRIC_REGISTRY_V20260927",
    });
  });

  it("rejects unknown protocol keys, wrong domains and malformed transitions", () => {
    expect(() => canonicalScientificPromotionProtocolV1({ ...scientificPromotionProtocolV1, extra: true } as any)).toThrow("unknown key");
    expect(() => canonicalScientificPromotionTransitionV1(rootTransition({ protocol: ref("SYNTRAKE:EXPERIMENT:V1", "9") }))).toThrow("wrong-domain");
    expect(() => canonicalScientificPromotionTransitionV1(rootTransition({ predecessorState: "EXECUTED", predecessorTransition: null }))).toThrow("MALFORMED_TRANSITION");
    expect(() => canonicalScientificPromotionTransitionV1(rootTransition({ predecessorState: "EXECUTED", resultingState: "SUPERSEDED", predecessorTransition: ref("SYNTRAKE:SCIENTIFIC_PROMOTION_TRANSITION:V1", "6") }))).toThrow("FORBIDDEN_TRANSITION");
  });

  it("freezes non-circular chain key independent of root transition identity", () => {
    const protocol = scientificPromotionProtocolRefV1();
    const base = subject();
    const key = hashScientificPromotionChainKeyV1(base, protocol);
    const first = hashScientificPromotionTransitionV1(rootTransition({ subject: base }));
    const second = hashScientificPromotionTransitionV1(rootTransition({ subject: base, transitionReasons: ["SUPERSEDED_EVIDENCE"] }));
    expect(first).not.toBe(second);
    expect(hashScientificPromotionChainKeyV1(base, protocol)).toBe(key);
  });

  it("requires all 10 gates to be evidence-derived and mandatory RL-7 ROBUSTNESS_STABLE for PROMOTION_ELIGIBLE", () => {
    const eligible = evaluateScientificPromotionGatesV1({ evidenceAggregate: aggregate() });
    expect(eligible.resultingState).toBe("PROMOTION_ELIGIBLE");
    expect(eligible.gateOutcomes).toHaveLength(10);
    expect(eligible.gateOutcomes.map((gate) => gate.gateId)).toEqual([...scientificPromotionGateIdsV1]);

    const insufficient = aggregate({
      gateEvidence: {
        ...aggregate().gateEvidence,
        GATE_RL7_ROBUSTNESS_COMPARISON: { status: "INSUFFICIENT_EVIDENCE", reasons: ["INSUFFICIENT_RL7_EVIDENCE"], evidence: [] },
      },
      rl7Classification: "ROBUSTNESS_INSUFFICIENT_EVIDENCE",
    });
    expect(evaluateScientificPromotionGatesV1({ evidenceAggregate: insufficient }).resultingState).toBe("INSUFFICIENT_EVIDENCE");

    const failed = aggregate({
      gateEvidence: {
        ...aggregate().gateEvidence,
        GATE_VALIDATION_RESULT: { status: "FAIL", reasons: ["FAILED_VALIDATION"], evidence: [subject().subjectValidationResult] },
      },
    });
    expect(evaluateScientificPromotionGatesV1({ evidenceAggregate: failed }).resultingState).toBe("VALIDATION_FAILED");
  });

  it("rejects syntactically valid forged, wrong-tenant, wrong-Investigation and wrong-lineage evidence aggregates", () => {
    expect(() => canonicalScientificPromotionEvidenceAggregateV1({
      ...aggregate(),
      tenantAuthority: "tenant:forged",
    })).toThrow("WRONG_TENANT");
    expect(() => canonicalScientificPromotionEvidenceAggregateV1({
      ...aggregate(),
      investigationId: "44444444-0000-4000-8000-000000000999",
    })).toThrow("WRONG_INVESTIGATION");
    expect(() => canonicalScientificPromotionEvidenceAggregateV1({
      ...aggregate(),
      gateEvidence: {
        ...aggregate().gateEvidence,
        GATE_ACCEPTED_EXECUTION_RESULT: { status: "PASS", reasons: [], evidence: [ref("SYNTRAKE:RESULT:V1", "9")] },
      },
    })).toThrow("MISSING_RESULT");
    expect(evaluateScientificPromotionGatesV1({
      evidenceAggregate: {
        ...aggregate(),
        protocol: ref("SYNTRAKE:SCIENTIFIC_PROMOTION_PROTOCOL:V1", "9"),
      },
    }).resultingState).toBe(null);
  });

  it("does not promote internally consistent invented HashRefs without accepted predecessor projections", () => {
    const invented = subject({ tenantAuthority: "tenant:alpha" });
    const derived = deriveScientificPromotionEvidenceAggregateFromAcceptedPredecessorsV1({
      passport: { ...acceptedPassportForSubject(invented), results: [], evidence: [] },
      subject: invented,
      rl7: {
        protocol: invented.robustnessComparisonProtocol,
        result: invented.robustnessComparisonResult,
        classification: "ROBUSTNESS_STABLE",
        subjectExperiment: invented.subjectExperiment,
        subjectResult: invented.subjectResult,
        subjectMetricResultSet: invented.subjectMetricResultSet,
      },
    });
    const evaluated = evaluateScientificPromotionGatesV1({ evidenceAggregate: derived });
    expect(evaluated.resultingState).not.toBe("PROMOTION_ELIGIBLE");
    expect(evaluated.gateOutcomes.find((gate) => gate.gateId === "GATE_ACCEPTED_EXECUTION_RESULT")?.status).not.toBe("PASS");
  });

  it("derives PROMOTION_ELIGIBLE only from accepted predecessor projections", () => {
    const s = subject({ tenantAuthority: "tenant:alpha" });
    const derived = deriveScientificPromotionEvidenceAggregateFromAcceptedPredecessorsV1({
      passport: acceptedPassportForSubject(s),
      subject: s,
      rl7: {
        protocol: s.robustnessComparisonProtocol,
        result: s.robustnessComparisonResult,
        classification: "ROBUSTNESS_STABLE",
        subjectExperiment: s.subjectExperiment,
        subjectResult: s.subjectResult,
        subjectMetricResultSet: s.subjectMetricResultSet,
      },
    });
    expect(evaluateScientificPromotionGatesV1({ evidenceAggregate: derived }).resultingState).toBe("PROMOTION_ELIGIBLE");
  });

  it("requires PROMOTION_ELIGIBLE gates to be all PASS", () => {
    const gates = allPassGates();
    expect(() => canonicalScientificPromotionTransitionV1(rootTransition({ gateOutcomes: [{ ...gates[0]!, status: "FAIL", reasons: ["FAILED_VALIDATION"] }, ...gates.slice(1)] }))).toThrow("AUTHORITY_FAILURE");
  });

  it("freezes cross-chain supersession payload without a third scientific domain", () => {
    const successorRoot = ref("SYNTRAKE:SCIENTIFIC_PROMOTION_TRANSITION:V1", "7");
    const transition = rootTransition({
      predecessorState: "PROMOTION_ELIGIBLE",
      resultingState: "SUPERSEDED",
      predecessorTransition: ref("SYNTRAKE:SCIENTIFIC_PROMOTION_TRANSITION:V1", "6"),
      supersededByChain: { successorProtocol: scientificPromotionProtocolRefV1(), successorRootTransition: successorRoot },
    });
    const canonical = canonicalScientificPromotionTransitionV1(transition) as any;
    expect(canonical.supersededByChain.successorRootTransition.hashDomain).toBe("SYNTRAKE:SCIENTIFIC_PROMOTION_TRANSITION:V1");
    expect(() => canonicalScientificPromotionTransitionV1(rootTransition({ supersededByChain: { successorProtocol: scientificPromotionProtocolRefV1(), successorRootTransition: successorRoot } }))).toThrow("MALFORMED_TRANSITION");
  });
});
