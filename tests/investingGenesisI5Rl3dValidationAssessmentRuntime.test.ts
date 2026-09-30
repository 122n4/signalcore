import { describe, expect, it } from "vitest";
import { artifactDescriptorV1, canonicalJsonlArtifactBytesV1 } from "../lib/investing/research/resultArtifacts";
import {
  assertValidationAssessmentResultMatchesProtocolV1,
  buildValidationAssessmentResultV1,
  canonicalValidationAssessmentProtocolV1,
  canonicalValidationAssessmentResultV1,
  hashValidationAssessmentProtocolV1,
  hashValidationAssessmentResultV1,
  validationAssessmentMetricNumericKindV1,
  type ValidationAssessmentCriterionV1,
  type ValidationAssessmentEvidenceRequirementV1,
  type ValidationAssessmentProtocolV1,
} from "../lib/investing/research/validationAssessment";
import {
  canonicalSha256HexV1,
  hashDomainStateV1,
  hashRefV1,
  type HashDomainV1,
  type HashRefV1,
  type CanonicalJsonValue,
} from "../lib/investing/research/canonical";

function ref(domain: HashDomainV1, char: string): HashRefV1 {
  return hashRefV1({
    hashAlgorithm: "SHA-256",
    hashDomain: domain,
    hashVersion: "SYNTRAKE_SHA256_V1",
    hashHex: canonicalSha256HexV1(char.repeat(64)),
  });
}

const validationProtocol = ref("SYNTRAKE:VALIDATION_PROTOCOL:V1", "A");
const experiment = ref("SYNTRAKE:EXPERIMENT:V1", "B");
const researchIr = ref("SYNTRAKE:RESEARCH_IR:V1", "C");
const validationResult = ref("SYNTRAKE:VALIDATION_RESULT:V1", "D");
function assessmentProtocolRef(p: ValidationAssessmentProtocolV1): HashRefV1 {
  return hashRefV1({
    hashAlgorithm: "SHA-256",
    hashDomain: "SYNTRAKE:VALIDATION_ASSESSMENT_PROTOCOL:V1",
    hashVersion: "SYNTRAKE_SHA256_V1",
    hashHex: hashValidationAssessmentProtocolV1(p),
  });
}
const baseResult = ref("SYNTRAKE:RESULT:V1", "F");

function requirement(
  scope: ValidationAssessmentCriterionV1["observationScope"] = { kind: "AGGREGATE" },
): ValidationAssessmentEvidenceRequirementV1 {
  return {
    requirementId: "PRIMARY_METRIC_EVIDENCE",
    artifactClass: "METRIC_RESULT_SET_DESCRIPTOR_V2",
    sourceLineage: {
      validationProtocol,
      subjectExperiment: experiment,
      subjectResearchIr: researchIr,
      observationScope: scope,
      artifactOwnerClass: scope.kind === "AGGREGATE" ? "EXECUTION_RESULT" : "VALIDATION_CHILD",
    },
    metricIdentity: { metricId: "TOTAL_RETURN", metricVersion: "METRIC_V2" },
    cardinality:
      scope.kind === "ALL_EVALUATION_FOLDS" || scope.kind === "ALL_TRAINING_FOLDS"
        ? "ONE_PER_SELECTED_OBSERVATION"
        : "EXACTLY_ONE",
    missingEvidencePolicy: "MISSING_IS_INSUFFICIENT_EVIDENCE",
  };
}

function criterion(overrides: Partial<ValidationAssessmentCriterionV1> = {}): ValidationAssessmentCriterionV1 {
  const scope = overrides.observationScope ?? { kind: "AGGREGATE" as const };
  return {
    criterionId: "TOTAL_RETURN_MINIMUM",
    criterionVersion: "CRITERION_V1",
    required: true,
    metricId: "TOTAL_RETURN",
    metricVersion: "METRIC_V2",
    evidenceSource: "METRIC_RESULT_SET_DESCRIPTOR_V2",
    observationScope: scope,
    observationAggregation:
      scope.kind === "AGGREGATE" || scope.kind === "FOLD_PHASE"
        ? "SINGLE_OBSERVATION"
        : "ALL_SELECTED_OBSERVATIONS_PASS",
    operator: "GTE",
    threshold: { kind: "SCALAR", value: { kind: "RATIO", value: "0.05" } },
    unavailablePolicy: "UNAVAILABLE_IS_INSUFFICIENT_EVIDENCE",
    evidenceRequirements: [requirement(scope)],
    ...overrides,
  };
}

function protocol(criteria: readonly ValidationAssessmentCriterionV1[] = [criterion()]): ValidationAssessmentProtocolV1 {
  const union = new Map<string, ValidationAssessmentEvidenceRequirementV1>();
  for (const item of criteria) for (const req of item.evidenceRequirements) union.set(req.requirementId, req);
  return {
    schemaVersion: "VALIDATION_ASSESSMENT_PROTOCOL_V1",
    assessmentMethodology: "VALIDATION_ASSESSMENT_METHODOLOGY_V20260929",
    validationProtocol,
    subjectExperiment: experiment,
    subjectResearchIr: researchIr,
    metricRegistryVersion: "METRIC_REGISTRY_V20260927",
    criteria,
    requiredEvidenceRequirements: [...union.values()],
    missingEvidenceSemantics: "REQUIRED_EVIDENCE_MISSING_IS_INSUFFICIENT_EVIDENCE_V1",
    aggregationRule: "ALL_REQUIRED_CRITERIA_PASS_V1",
  };
}

function metricRecord(
  metricId = "TOTAL_RETURN",
  status: "AVAILABLE" | "UNAVAILABLE" = "AVAILABLE",
  value = "0.1",
): Record<string, CanonicalJsonValue> {
  const base = {
    metricId,
    metricVersion: "METRIC_V2",
    registryVersion: "METRIC_REGISTRY_V20260927",
    annualizationBasis: "TRADING_SESSIONS_PER_YEAR_252",
    riskFreeSessionReturn: "0",
    minimumAcceptableSessionReturn: "0",
    arithmetic: "EXACT_RATIONAL_WITH_DETERMINISTIC_BIGINT_ROOT_POWER_V1",
    rounding: "RESEARCH_RATIO_OUTPUT_V1_SCALE_18_ROUND_HALF_EVEN",
  };
  return status === "AVAILABLE"
    ? { ...base, status, value }
    : { ...base, status, reason: "INSUFFICIENT_OBSERVATIONS" };
}

function aggregateEvidence(records: readonly CanonicalJsonValue[] = [metricRecord()]) {
  const bytes = canonicalJsonlArtifactBytesV1(records);
  return {
    validationResult,
    validationChildResults: [],
    metricResultSets: [
      {
        artifactOwnerClass: "EXECUTION_RESULT" as const,
        observationIdentity: { kind: "AGGREGATE" as const },
        ownerResult: baseResult,
        descriptor: artifactDescriptorV1("METRIC_RESULT_SET_V2", bytes, records.length),
        contentBytes: bytes,
      },
    ],
    evidenceObjects: [],
  };
}

describe("I5 RL-3D Validation Assessment V1 runtime", () => {
  it("admits exactly the two frozen scientific domains", () => {
    expect(hashDomainStateV1("SYNTRAKE:VALIDATION_ASSESSMENT_PROTOCOL:V1")).toBe("OWNER_PAYLOAD_EXACT");
    expect(hashDomainStateV1("SYNTRAKE:VALIDATION_ASSESSMENT_RESULT:V1")).toBe("OWNER_PAYLOAD_EXACT");
  });

  it("canonicalizes criterion ordering and hashes owner payload deterministically", () => {
    const first = criterion({ criterionId: "ZZZ_CRITERION" });
    const second = criterion({
      criterionId: "AAA_CRITERION",
      evidenceRequirements: [{ ...requirement(), requirementId: "AAA_METRIC_EVIDENCE" }],
    });
    const input = protocol([first, second]);
    const canonical = canonicalValidationAssessmentProtocolV1(input) as unknown as {
      criteria: readonly { criterionId: string }[];
    };
    expect(canonical.criteria.map((item) => item.criterionId)).toEqual(["AAA_CRITERION", "ZZZ_CRITERION"]);
    expect(hashValidationAssessmentProtocolV1(input)).toMatch(/^[0-9A-F]{64}$/);
    expect(hashValidationAssessmentProtocolV1(input)).toBe(
      hashValidationAssessmentProtocolV1({ ...input, criteria: [second, first] }),
    );
  });

  it("rejects empty/all-optional criteria and divergent evidence-union authority", () => {
    expect(() => canonicalValidationAssessmentProtocolV1(protocol([]))).toThrow(
      "VALIDATION_ASSESSMENT_CRITERIA_EMPTY",
    );
    expect(() =>
      canonicalValidationAssessmentProtocolV1(protocol([criterion({ required: false })])),
    ).toThrow("VALIDATION_ASSESSMENT_REQUIRED_CRITERION_MISSING");
    expect(() =>
      canonicalValidationAssessmentProtocolV1({
        ...protocol(),
        requiredEvidenceRequirements: [{ ...requirement(), requirementId: "DIFFERENT_REQUIREMENT" }],
      }),
    ).toThrow("VALIDATION_ASSESSMENT_EVIDENCE_UNION_MISMATCH");
  });

  it("enforces compatibility matrix and metric kind authority", () => {
    expect(() =>
      canonicalValidationAssessmentProtocolV1(
        protocol([
          criterion({
            evidenceRequirements: [
              {
                ...requirement(),
                sourceLineage: { ...requirement().sourceLineage, artifactOwnerClass: "VALIDATION_CHILD" },
              },
            ],
          }),
        ]),
      ),
    ).toThrow("VALIDATION_ASSESSMENT_COMPATIBILITY_MATRIX_VIOLATION");
    expect(validationAssessmentMetricNumericKindV1("TRADE_COUNT")).toBe("INTEGER");
    expect(validationAssessmentMetricNumericKindV1("SHARPE_RATIO")).toBe("RATIO");
    expect(() =>
      canonicalValidationAssessmentProtocolV1(
        protocol([
          criterion({
            threshold: { kind: "SCALAR", value: { kind: "INTEGER", value: "1" } },
          }),
        ]),
      ),
    ).toThrow("VALIDATION_ASSESSMENT_NUMERIC_KIND_MISMATCH");
  });

  it("rejects non-canonical ratio thresholds instead of silently rounding", () => {
    expect(() =>
      canonicalValidationAssessmentProtocolV1(
        protocol([
          criterion({
            threshold: { kind: "SCALAR", value: { kind: "RATIO", value: "0.0500" } },
          }),
        ]),
      ),
    ).toThrow("VALIDATION_ASSESSMENT_RATIO_NOT_CANONICAL");
  });

  it("produces PASS from verified V2 artifact bytes and exact threshold comparison", () => {
    const p = protocol();
    const result = buildValidationAssessmentResultV1({
      protocol: p,
      assessmentProtocol: assessmentProtocolRef(p),
      evidence: aggregateEvidence(),
    });
    expect(result.outcome).toBe("PASS");
    expect(result.criterionOutcomes[0]!.observationOutcomes[0]!.observedValue).toEqual({
      kind: "RATIO",
      value: "0.1",
    });
    expect(result.consumedEvidence.map((item) => item.kind)).toEqual([
      "METRIC_RESULT_SET_DESCRIPTOR_V2",
      "VALIDATION_RESULT",
    ]);
    expect(hashValidationAssessmentResultV1(result)).toMatch(/^[0-9A-F]{64}$/);
  });

  it("produces FAIL when the exact metric is below threshold", () => {
    const p = protocol();
    const result = buildValidationAssessmentResultV1({
      protocol: p,
      assessmentProtocol: assessmentProtocolRef(p),
      evidence: aggregateEvidence([metricRecord("TOTAL_RETURN", "AVAILABLE", "0.01")]),
    });
    expect(result.outcome).toBe("FAIL");
    expect(result.criterionOutcomes[0]!.observationOutcomes[0]!.reasonCode).toBe(
      "CRITERION_THRESHOLD_FAILED",
    );
  });

  it("maps accepted UNAVAILABLE evidence to the frozen unavailable policy", () => {
    const insufficientProtocol = protocol();
    const insufficient = buildValidationAssessmentResultV1({
      protocol: insufficientProtocol,
      assessmentProtocol: assessmentProtocolRef(insufficientProtocol),
      evidence: aggregateEvidence([metricRecord("TOTAL_RETURN", "UNAVAILABLE")]),
    });
    expect(insufficient.outcome).toBe("INSUFFICIENT_EVIDENCE");
    expect(insufficient.criterionOutcomes[0]!.observationOutcomes[0]!.reasonCode).toBe(
      "METRIC_UNAVAILABLE",
    );

    const failProtocol = protocol([criterion({ unavailablePolicy: "UNAVAILABLE_IS_FAIL" })]);
    const fail = buildValidationAssessmentResultV1({
      protocol: failProtocol,
      assessmentProtocol: assessmentProtocolRef(failProtocol),
      evidence: aggregateEvidence([metricRecord("TOTAL_RETURN", "UNAVAILABLE")]),
    });
    expect(fail.outcome).toBe("FAIL");

    expect(() => {
      const unavailableProtocol = protocol([
        criterion({ unavailablePolicy: "UNAVAILABLE_NOT_ADMITTED" }),
      ]);
      return buildValidationAssessmentResultV1({
        protocol: unavailableProtocol,
        assessmentProtocol: assessmentProtocolRef(unavailableProtocol),
        evidence: aggregateEvidence([metricRecord("TOTAL_RETURN", "UNAVAILABLE")]),
      });
    }).toThrow("VALIDATION_ASSESSMENT_UNAVAILABLE_NOT_ADMITTED");
  });

  it("fails closed on artifact corruption, wrong registry and duplicate metric identity", () => {
    const evidence = aggregateEvidence();
    const corrupted = {
      ...evidence,
      metricResultSets: evidence.metricResultSets.map((item) => ({
        ...item,
        contentBytes: Buffer.from(item.contentBytes.toString("utf8") + "x"),
      })),
    };
    const baseProtocol = protocol();
    expect(() =>
      buildValidationAssessmentResultV1({
        protocol: baseProtocol,
        assessmentProtocol: assessmentProtocolRef(baseProtocol),
        evidence: corrupted,
      }),
    ).toThrow("VALIDATION_ASSESSMENT_METRIC_ARTIFACT_INTEGRITY_FAILURE");

    const wrong = { ...metricRecord(), registryVersion: "METRIC_REGISTRY_V20260918" };
    expect(() =>
      buildValidationAssessmentResultV1({
        protocol: baseProtocol,
        assessmentProtocol: assessmentProtocolRef(baseProtocol),
        evidence: aggregateEvidence([wrong]),
      }),
    ).toThrow("VALIDATION_ASSESSMENT_METRIC_RECORD_INCOMPATIBLE");

    expect(() =>
      buildValidationAssessmentResultV1({
        protocol: baseProtocol,
        assessmentProtocol: assessmentProtocolRef(baseProtocol),
        evidence: aggregateEvidence([metricRecord(), metricRecord()]),
      }),
    ).toThrow("VALIDATION_ASSESSMENT_METRIC_RECORD_DUPLICATE");
  });

  it("aggregates selected fold observations without hidden scoring", () => {
    const scope = { kind: "ALL_EVALUATION_FOLDS" as const };
    const p = protocol([
      criterion({ observationScope: scope, evidenceRequirements: [requirement(scope)] }),
    ]);
    const child1 = ref("SYNTRAKE:VALIDATION_CHILD_RESULT:V1", "1");
    const child2 = ref("SYNTRAKE:VALIDATION_CHILD_RESULT:V1", "2");
    const bytes1 = canonicalJsonlArtifactBytesV1([
      metricRecord("TOTAL_RETURN", "AVAILABLE", "0.1"),
    ]);
    const bytes2 = canonicalJsonlArtifactBytesV1([
      metricRecord("TOTAL_RETURN", "AVAILABLE", "0.01"),
    ]);
    const result = buildValidationAssessmentResultV1({
      protocol: p,
      assessmentProtocol: assessmentProtocolRef(p),
      evidence: {
        validationResult,
        validationChildResults: [
          { ref: child1, foldOrdinal: "0", phase: "EVALUATION" },
          { ref: child2, foldOrdinal: "1", phase: "EVALUATION" },
        ],
        metricResultSets: [
          {
            artifactOwnerClass: "VALIDATION_CHILD",
            observationIdentity: { kind: "FOLD_PHASE", foldOrdinal: "0", phase: "EVALUATION" },
            ownerResult: child1,
            descriptor: artifactDescriptorV1("METRIC_RESULT_SET_V2", bytes1, 1),
            contentBytes: bytes1,
          },
          {
            artifactOwnerClass: "VALIDATION_CHILD",
            observationIdentity: { kind: "FOLD_PHASE", foldOrdinal: "1", phase: "EVALUATION" },
            ownerResult: child2,
            descriptor: artifactDescriptorV1("METRIC_RESULT_SET_V2", bytes2, 1),
            contentBytes: bytes2,
          },
        ],
        evidenceObjects: [],
      },
    });
    expect(result.outcome).toBe("FAIL");
    expect(result.criterionOutcomes[0]!.observationOutcomes.map((item) => item.status)).toEqual([
      "PASS",
      "FAIL",
    ]);
  });

  it("never converts missing evidence into mathematical zero", () => {
    const p = protocol();
    const result = buildValidationAssessmentResultV1({
      protocol: p,
      assessmentProtocol: assessmentProtocolRef(p),
      evidence: { ...aggregateEvidence(), metricResultSets: [] },
    });
    expect(result.outcome).toBe("INSUFFICIENT_EVIDENCE");
    expect(result.criterionOutcomes[0]!.observationOutcomes[0]!.observedValue).toBeNull();
    expect(result.criterionOutcomes[0]!.observationOutcomes[0]!.reasonCode).toBe(
      "REQUIRED_EVIDENCE_MISSING",
    );
  });
  it("fails closed on tampered Result observation identity, reason, status and Protocol drift", () => {
    const p = protocol();
    const valid = buildValidationAssessmentResultV1({
      protocol: p,
      assessmentProtocol: assessmentProtocolRef(p),
      evidence: aggregateEvidence(),
    });

    const invalidIdentity = structuredClone(valid) as any;
    invalidIdentity.criterionOutcomes[0].observationOutcomes[0].observationIdentity = {
      kind: "ALL_EVALUATION_FOLDS",
    };
    expect(() => canonicalValidationAssessmentResultV1(invalidIdentity)).toThrow(
      "VALIDATION_ASSESSMENT_OBSERVATION_IDENTITY_INVALID",
    );

    const invalidReason = structuredClone(valid) as any;
    invalidReason.criterionOutcomes[0].observationOutcomes[0].status = "FAIL";
    invalidReason.criterionOutcomes[0].observationOutcomes[0].reasonCode = "CALLER_OVERRIDE";
    expect(() => canonicalValidationAssessmentResultV1(invalidReason)).toThrow(
      "VALIDATION_ASSESSMENT_REASON_CODE_INVALID",
    );

    const invalidStatus = structuredClone(valid) as any;
    invalidStatus.criterionOutcomes[0].status = "FAIL";
    expect(() => canonicalValidationAssessmentResultV1(invalidStatus)).toThrow(
      "VALIDATION_ASSESSMENT_CRITERION_STATUS_DRIFT",
    );

    const driftedProtocol = protocol([
      criterion({
        threshold: { kind: "SCALAR", value: { kind: "RATIO", value: "0.06" } },
      }),
    ]);
    expect(() =>
      assertValidationAssessmentResultMatchesProtocolV1({
        protocol: driftedProtocol,
        result: valid,
      }),
    ).toThrow("VALIDATION_ASSESSMENT_RESULT_PROTOCOL_LINEAGE_MISMATCH");
  });

});
