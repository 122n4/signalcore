import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  CANONICAL_INVESTING_RECOMMENDATION_SUITABILITY_AUTHORITY_REASON_CODES,
  assessCanonicalInvestingRecommendationSuitabilityAuthorityV1,
  hashCanonicalInvestingRecommendationSuitabilityAuthorityV1,
} from "@/lib/investing/authority/recommendationSuitabilityAuthority";
import {
  hashCanonicalInvestingMandateIntentV1,
  sealCanonicalInvestingMandateIntentV1,
  type CanonicalInvestingMandateIntentInputV1,
} from "@/lib/investing/authority/mandateIntent";
import {
  assessCanonicalInvestingPolicyMethodologyV1,
  hashCanonicalInvestingPolicyMethodologyAssessmentV1,
} from "@/lib/investing/authority/policyMethodology";
import { assessCanonicalPlanToMandateTranslationV1 } from "@/lib/investing/authority/planToMandateTranslation";
import {
  assessCanonicalInvestingSuitabilityEvidenceAuthorityV1,
  hashCanonicalInvestingSuitabilityEvidenceAuthorityV1,
} from "@/lib/investing/authority/suitabilityEvidenceAuthority";
import {
  assessCanonicalInvestingSuitabilityReadinessV1,
  hashCanonicalInvestingSuitabilityReadinessV1,
} from "@/lib/investing/authority/suitabilityReadiness";
import type { CanonicalInvestingPlan } from "@/lib/investing/server/plan";

const AUTHORED_AT = "2026-05-10T12:00:00.000Z";
const POLICY_ASSESSED_AT = "2026-05-10T13:00:00.000Z";
const READINESS_ASSESSED_AT = "2026-05-10T14:00:00.000Z";
const EVIDENCE_ASSESSED_AT = "2026-05-10T15:00:00.000Z";
const RECOMMENDATION_ASSESSED_AT = "2026-05-10T16:00:00.000Z";

function canonicalPlan(overrides: Partial<CanonicalInvestingPlan> = {}): CanonicalInvestingPlan {
  return {
    id: "plan_123",
    mode: "investing",
    status: "active",
    version: 7,
    label: "Long-term plan",
    intent: "Invest over time",
    summary: "Free text is not recommendation suitability authority.",
    activatedAt: "2026-05-10T10:00:00.000Z",
    updatedAt: "2026-05-10T11:00:00.000Z",
    structured: {
      availability: "AVAILABLE",
      schemaVersion: 1,
      reason: null,
      objective: {
        type: "growth",
        targetAmount: { amount: 100000, currency: "EUR" },
        timeframeMonths: 120,
        monthlyContribution: { amount: 250, currency: "EUR" },
      },
      risk: { profile: "Balanced" },
    },
    ...overrides,
  };
}

function planAssessment(plan: CanonicalInvestingPlan = canonicalPlan(), currency = "EUR") {
  return assessCanonicalPlanToMandateTranslationV1({
    planState: { availability: "AVAILABLE", reason: null, value: plan },
    accountBaseCurrency: currency,
  });
}

function validMandateIntentInput(
  overrides: Partial<CanonicalInvestingMandateIntentInputV1> = {},
): CanonicalInvestingMandateIntentInputV1 {
  return {
    tenant: {
      userId: "user_123",
      tenantId: "tenant_123",
      membershipId: "membership_123",
      role: "owner",
      permissions: ["investing:read"],
    },
    account: {
      id: "account_123",
      userId: "user_123",
      ownerUserId: "user_123",
      tenantId: "tenant_123",
      portfolioId: "portfolio_123",
      environment: "paper",
      status: "active",
      baseCurrency: "EUR",
    },
    planAssessment: planAssessment(),
    intent: {
      objective: "growth",
      riskProfile: "Balanced",
      horizon: "Medium",
    },
    authoredAt: AUTHORED_AT,
    ...overrides,
  };
}

function genuineIntent(overrides: Partial<CanonicalInvestingMandateIntentInputV1> = {}) {
  return sealCanonicalInvestingMandateIntentV1(validMandateIntentInput(overrides));
}

function genuinePolicyAssessment(intent = genuineIntent(), assessedAt = POLICY_ASSESSED_AT) {
  return assessCanonicalInvestingPolicyMethodologyV1({ intent, assessedAt });
}

function genuineReadiness(
  intent = genuineIntent(),
  policyMethodologyAssessment = genuinePolicyAssessment(intent),
  assessedAt = READINESS_ASSESSED_AT,
) {
  return assessCanonicalInvestingSuitabilityReadinessV1({
    intent,
    policyMethodologyAssessment,
    assessedAt,
  });
}

function genuineEvidenceAuthority(
  intent = genuineIntent(),
  policyMethodologyAssessment = genuinePolicyAssessment(intent),
  suitabilityReadiness = genuineReadiness(intent, policyMethodologyAssessment),
  assessedAt = EVIDENCE_ASSESSED_AT,
) {
  return assessCanonicalInvestingSuitabilityEvidenceAuthorityV1({
    intent,
    policyMethodologyAssessment,
    suitabilityReadiness,
    assessedAt,
  });
}

function recommendationAuthority(
  intent = genuineIntent(),
  policyMethodologyAssessment = genuinePolicyAssessment(intent),
  suitabilityReadiness = genuineReadiness(intent, policyMethodologyAssessment),
  suitabilityEvidenceAuthority = genuineEvidenceAuthority(intent, policyMethodologyAssessment, suitabilityReadiness),
  assessedAt = RECOMMENDATION_ASSESSED_AT,
) {
  return assessCanonicalInvestingRecommendationSuitabilityAuthorityV1({
    intent,
    policyMethodologyAssessment,
    suitabilityReadiness,
    suitabilityEvidenceAuthority,
    assessedAt,
  });
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function recomputeIntentFingerprint(intent: any) {
  intent.lineage.intentFingerprint = hashCanonicalInvestingMandateIntentV1(intent);
}

function recomputePolicyAssessmentFingerprint(assessment: any) {
  assessment.assessmentFingerprint = hashCanonicalInvestingPolicyMethodologyAssessmentV1(assessment);
}

function recomputeReadinessFingerprint(readiness: any) {
  readiness.assessmentFingerprint = hashCanonicalInvestingSuitabilityReadinessV1(readiness);
}

function recomputeEvidenceAuthorityFingerprint(evidenceAuthority: any) {
  evidenceAuthority.evidenceAuthorityFingerprint =
    hashCanonicalInvestingSuitabilityEvidenceAuthorityV1(evidenceAuthority);
}

function genuineChain() {
  const intent = genuineIntent();
  const policy = genuinePolicyAssessment(intent);
  const readiness = genuineReadiness(intent, policy);
  const evidence = genuineEvidenceAuthority(intent, policy, readiness);
  return { intent, policy, readiness, evidence };
}

function propagatePolicyToDownstream(intent: any, policy: any, readiness: any, evidence: any) {
  readiness.lineage.policyMethodologyAssessmentFingerprint = policy.assessmentFingerprint;
  recomputeReadinessFingerprint(readiness);
  evidence.lineage.policyMethodologyAssessmentFingerprint = policy.assessmentFingerprint;
  evidence.lineage.suitabilityReadinessAssessmentFingerprint = readiness.assessmentFingerprint;
  recomputeEvidenceAuthorityFingerprint(evidence);
}

function selfConsistentForgedUpstreamChain(mutateIntent: (intent: any) => void) {
  const intent = clone(genuineIntent()) as any;
  mutateIntent(intent);
  recomputeIntentFingerprint(intent);

  const policy = clone(genuinePolicyAssessment()) as any;
  policy.intent.intentFingerprint = intent.lineage.intentFingerprint;
  policy.intent.authority = clone(intent.authority);
  policy.intent.plan = clone(intent.plan);
  policy.intent.declaredIntent = clone(intent.intent);
  recomputePolicyAssessmentFingerprint(policy);

  const readiness = clone(genuineReadiness()) as any;
  readiness.authority = clone(intent.authority);
  readiness.lineage = {
    planId: intent.plan.planId,
    planVersion: intent.plan.planVersion,
    activatedAt: intent.plan.activatedAt,
    updatedAt: intent.plan.updatedAt,
    structuredSchemaVersion: intent.plan.structuredSchemaVersion,
    planSemanticFingerprint: intent.plan.semanticFingerprint,
    intentFingerprint: intent.lineage.intentFingerprint,
    policyMethodologyAssessmentFingerprint: policy.assessmentFingerprint,
  };
  readiness.knownIntent = clone(intent.intent);
  recomputeReadinessFingerprint(readiness);

  const evidence = clone(genuineEvidenceAuthority()) as any;
  evidence.authority = clone(intent.authority);
  evidence.lineage = {
    planId: intent.plan.planId,
    planVersion: intent.plan.planVersion,
    activatedAt: intent.plan.activatedAt,
    updatedAt: intent.plan.updatedAt,
    structuredSchemaVersion: intent.plan.structuredSchemaVersion,
    planSemanticFingerprint: intent.plan.semanticFingerprint,
    intentFingerprint: intent.lineage.intentFingerprint,
    policyMethodologyAssessmentFingerprint: policy.assessmentFingerprint,
    suitabilityReadinessAssessmentFingerprint: readiness.assessmentFingerprint,
  };
  evidence.knownIntent = clone(intent.intent);
  recomputeEvidenceAuthorityFingerprint(evidence);

  return { intent, policy, readiness, evidence };
}

function expectArrayRejected(reasonCodes: unknown, pattern = /reason_codes_invalid/) {
  const { intent, policy, readiness, evidence } = genuineChain();
  const forgedEvidence = clone(evidence) as any;
  forgedEvidence.evidenceProvenanceAuthority.reasonCodes = reasonCodes;
  expect(() => {
    recommendationAuthority(intent, policy, readiness, forgedEvidence);
  }).toThrow(pattern);
}

function assertFrozenClosed(value: unknown, path = "$", seen = new WeakSet<object>()) {
  if (!value || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  expect(Object.isFrozen(value), path).toBe(true);
  for (const key of Reflect.ownKeys(value)) {
    expect(typeof key, path).toBe("string");
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    expect(descriptor, `${path}.${String(key)}`).toBeDefined();
    expect("value" in descriptor!, `${path}.${String(key)}`).toBe(true);
    if (Array.isArray(value) && key === "length") {
      expect(descriptor!.enumerable, `${path}.length`).toBe(false);
      continue;
    }
    expect(descriptor!.enumerable, `${path}.${String(key)}`).toBe(true);
    assertFrozenClosed(descriptor!.value, `${path}.${String(key)}`, seen);
  }
}

describe("canonical recommendation suitability authority boundary", () => {
  it("produces B2B3 from a genuine B1/B2A/B2B1/B2B2 chain while remaining unavailable and not accepted", () => {
    const { intent, policy, readiness, evidence } = genuineChain();
    const result = recommendationAuthority(intent, policy, readiness, evidence);

    expect(result.contractVersion).toBe("canonical-investing-recommendation-suitability-authority/v1");
    expect(result.authority).toEqual(intent.authority);
    expect(result.lineage).toEqual({
      planId: intent.plan.planId,
      planVersion: intent.plan.planVersion,
      activatedAt: intent.plan.activatedAt,
      updatedAt: intent.plan.updatedAt,
      structuredSchemaVersion: intent.plan.structuredSchemaVersion,
      planSemanticFingerprint: intent.plan.semanticFingerprint,
      intentFingerprint: intent.lineage.intentFingerprint,
      policyMethodologyAssessmentFingerprint: policy.assessmentFingerprint,
      suitabilityReadinessAssessmentFingerprint: readiness.assessmentFingerprint,
      suitabilityEvidenceAuthorityFingerprint: evidence.evidenceAuthorityFingerprint,
    });
    expect(result.knownIntent).toEqual(intent.intent);
    expect(result.authorityBasis).toEqual({
      policyMethodology: { availability: "UNAVAILABLE", financialAuthority: "NOT_ACCEPTED" },
      suitabilityReadiness: { availability: "UNAVAILABLE" },
      evidenceProvenance: { availability: "UNAVAILABLE" },
      reliability: { availability: "UNAVAILABLE" },
      regulatoryClassification: { availability: "UNRESOLVED" },
      sustainabilityPreferences: { applicability: "UNRESOLVED" },
    });
    expect(result.recommendationSuitabilityAuthority).toEqual({
      availability: "UNAVAILABLE",
      authority: "NOT_ACCEPTED",
      determination: null,
      reasonCodes: CANONICAL_INVESTING_RECOMMENDATION_SUITABILITY_AUTHORITY_REASON_CODES,
    });
    expect(result.authorityFingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it("exposes no score, probability, target return, mandate, allocation, recommendation or execution authority", () => {
    const result = recommendationAuthority();
    const serialized = JSON.stringify(result);

    expect(result.recommendationSuitabilityAuthority.determination).toBeNull();
    for (const forbidden of [
      "suitabilityScore",
      "score",
      "probability",
      "targetReturn",
      "expectedReturn",
      "mandate",
      "allocation",
      "execution",
      "allowExecution",
      "brokerInstruction",
      "BUY",
      "SELL",
      "HOLD",
      "ENTER",
      "REDUCE",
      "eligible",
      "ineligible",
      "conditionally suitable",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("keeps exact reason-code order, duplicate-free runtime-frozen constants and deterministic fingerprints", () => {
    const first = recommendationAuthority();
    const second = recommendationAuthority();

    expect(CANONICAL_INVESTING_RECOMMENDATION_SUITABILITY_AUTHORITY_REASON_CODES).toEqual([
      "RECOMMENDATION_SUITABILITY_AUTHORITY_NOT_ACCEPTED",
      "FINANCIAL_POLICY_METHODOLOGY_AUTHORITY_UNAVAILABLE",
      "SUITABILITY_READINESS_UNAVAILABLE",
      "SUITABILITY_EVIDENCE_AUTHORITY_UNAVAILABLE",
      "EVIDENCE_RELIABILITY_AUTHORITY_UNAVAILABLE",
      "REGULATORY_CLASSIFICATION_AUTHORITY_UNRESOLVED",
      "SUSTAINABILITY_PREFERENCES_APPLICABILITY_UNRESOLVED",
      "SUITABILITY_DETERMINATION_NOT_PERFORMED",
    ]);
    expect(Object.isFrozen(CANONICAL_INVESTING_RECOMMENDATION_SUITABILITY_AUTHORITY_REASON_CODES)).toBe(true);
    expect(() => {
      (CANONICAL_INVESTING_RECOMMENDATION_SUITABILITY_AUTHORITY_REASON_CODES as unknown as string[]).push("X");
    }).toThrow();
    expect(new Set(first.recommendationSuitabilityAuthority.reasonCodes).size)
      .toBe(first.recommendationSuitabilityAuthority.reasonCodes.length);
    expect(second.authorityFingerprint).toBe(first.authorityFingerprint);
    expect(hashCanonicalInvestingRecommendationSuitabilityAuthorityV1(first)).toBe(first.authorityFingerprint);

    const changedAuthorityIntent = genuineIntent({
      tenant: { ...validMandateIntentInput().tenant, membershipId: "membership_changed" },
    });
    const changedAuthorityPolicy = genuinePolicyAssessment(changedAuthorityIntent);
    const changedAuthorityReadiness = genuineReadiness(changedAuthorityIntent, changedAuthorityPolicy);
    const changedAuthorityEvidence = genuineEvidenceAuthority(
      changedAuthorityIntent,
      changedAuthorityPolicy,
      changedAuthorityReadiness,
    );
    const changedAuthority = recommendationAuthority(
      changedAuthorityIntent,
      changedAuthorityPolicy,
      changedAuthorityReadiness,
      changedAuthorityEvidence,
    );
    const changedTime = recommendationAuthority(undefined, undefined, undefined, undefined, "2026-05-10T16:01:00.000Z");

    expect(changedAuthority.authorityFingerprint).not.toBe(first.authorityFingerprint);
    expect(changedTime.authorityFingerprint).not.toBe(first.authorityFingerprint);

    const changedState = clone(first) as any;
    changedState.authorityBasis.suitabilityReadiness.availability = "AVAILABLE";
    expect(hashCanonicalInvestingRecommendationSuitabilityAuthorityV1(changedState)).not.toBe(first.authorityFingerprint);
  });

  it("rejects forged B1, B2A, B2B1 and B2B2 fingerprints", () => {
    const { intent, policy, readiness, evidence } = genuineChain();

    const forgedIntent = clone(intent) as any;
    forgedIntent.lineage.intentFingerprint = "0".repeat(64);
    expect(() => recommendationAuthority(forgedIntent)).toThrow(/intent_fingerprint_mismatch/);

    const forgedPolicy = clone(policy) as any;
    forgedPolicy.assessmentFingerprint = "0".repeat(64);
    expect(() => recommendationAuthority(intent, forgedPolicy)).toThrow(/policy_methodology_fingerprint_mismatch/);

    const forgedReadiness = clone(readiness) as any;
    forgedReadiness.assessmentFingerprint = "0".repeat(64);
    expect(() => recommendationAuthority(intent, policy, forgedReadiness)).toThrow(/readiness_fingerprint_mismatch/);

    const forgedEvidence = clone(evidence) as any;
    forgedEvidence.evidenceAuthorityFingerprint = "0".repeat(64);
    expect(() => recommendationAuthority(intent, policy, readiness, forgedEvidence)).toThrow(/evidence_authority_fingerprint_mismatch/);
  });

  it("rejects exact authority mismatches across every upstream layer", () => {
    const cases: Array<[string, (policy: any, readiness: any, evidence: any) => void, RegExp]> = [
      ["user", (policy) => { policy.intent.authority.userId = "user_other"; recomputePolicyAssessmentFingerprint(policy); }, /userId_mismatch/],
      ["tenant", (policy) => { policy.intent.authority.tenantId = "tenant_other"; recomputePolicyAssessmentFingerprint(policy); }, /tenantId_mismatch/],
      ["membership", (policy) => { policy.intent.authority.membershipId = "membership_other"; recomputePolicyAssessmentFingerprint(policy); }, /membershipId_mismatch/],
      ["portfolio", (policy) => { policy.intent.authority.portfolioId = "portfolio_other"; recomputePolicyAssessmentFingerprint(policy); }, /portfolioId_mismatch/],
      ["account", (policy) => { policy.intent.authority.accountId = "account_other"; recomputePolicyAssessmentFingerprint(policy); }, /accountId_mismatch/],
      ["environment", (policy) => { policy.intent.authority.environment = "simulation"; recomputePolicyAssessmentFingerprint(policy); }, /environment_mismatch/],
      ["currency", (policy) => { policy.intent.authority.accountBaseCurrency = "USD"; recomputePolicyAssessmentFingerprint(policy); }, /accountBaseCurrency_mismatch/],
      ["readiness", (_policy, readiness) => { readiness.authority.userId = "user_other"; recomputeReadinessFingerprint(readiness); }, /userId_mismatch/],
      ["evidence", (_policy, _readiness, evidence) => { evidence.authority.userId = "user_other"; recomputeEvidenceAuthorityFingerprint(evidence); }, /userId_mismatch/],
    ];

    for (const [label, mutate, expected] of cases) {
      const { intent, policy, readiness, evidence } = genuineChain();
      const policyCopy = clone(policy) as any;
      const readinessCopy = clone(readiness) as any;
      const evidenceCopy = clone(evidence) as any;
      mutate(policyCopy, readinessCopy, evidenceCopy);
      expect(() => recommendationAuthority(intent, policyCopy, readinessCopy, evidenceCopy), label)
        .toThrow(expected);
    }
  });

  it("rejects plan, intent and fingerprint-lineage mismatches", () => {
    const cases: Array<[string, (readiness: any, evidence: any) => void, RegExp]> = [
      ["planId", (readiness) => { readiness.lineage.planId = "plan_other"; recomputeReadinessFingerprint(readiness); }, /plan_id_mismatch/],
      ["version", (readiness) => { readiness.lineage.planVersion = 8; recomputeReadinessFingerprint(readiness); }, /plan_version_mismatch/],
      ["activatedAt", (readiness) => { readiness.lineage.activatedAt = "2026-05-10T10:01:00.000Z"; recomputeReadinessFingerprint(readiness); }, /plan_activated_at_mismatch/],
      ["updatedAt", (readiness) => { readiness.lineage.updatedAt = "2026-05-10T11:01:00.000Z"; recomputeReadinessFingerprint(readiness); }, /plan_updated_at_mismatch/],
      ["schema", (readiness) => { readiness.lineage.structuredSchemaVersion = 2; }, /plan_schema_invalid/],
      ["semantic", (readiness) => { readiness.lineage.planSemanticFingerprint = "0".repeat(64); recomputeReadinessFingerprint(readiness); }, /plan_semantic_fingerprint_mismatch/],
      ["objective", (readiness) => { readiness.knownIntent.objective = "income"; recomputeReadinessFingerprint(readiness); }, /objective_mismatch/],
      ["riskProfile", (readiness) => { readiness.knownIntent.riskProfile = "Conservative"; recomputeReadinessFingerprint(readiness); }, /risk_profile_mismatch/],
      ["horizon", (readiness) => { readiness.knownIntent.horizon = "Long"; recomputeReadinessFingerprint(readiness); }, /horizon_mismatch/],
      ["b2b1 intent fingerprint", (readiness) => { readiness.lineage.intentFingerprint = "0".repeat(64); recomputeReadinessFingerprint(readiness); }, /b2b1_intent_fingerprint_lineage_mismatch/],
      ["b2b2 readiness fingerprint", (_readiness, evidence) => { evidence.lineage.suitabilityReadinessAssessmentFingerprint = "0".repeat(64); recomputeEvidenceAuthorityFingerprint(evidence); }, /b2b2_readiness_fingerprint_lineage_mismatch/],
    ];

    for (const [label, mutate, expected] of cases) {
      const { intent, policy, readiness, evidence } = genuineChain();
      const readinessCopy = clone(readiness) as any;
      const evidenceCopy = clone(evidence) as any;
      mutate(readinessCopy, evidenceCopy);
      if (label !== "b2b2 readiness fingerprint") {
        evidenceCopy.lineage.suitabilityReadinessAssessmentFingerprint = readinessCopy.assessmentFingerprint;
        recomputeEvidenceAuthorityFingerprint(evidenceCopy);
      }
      expect(() => recommendationAuthority(intent, policy, readinessCopy, evidenceCopy), label)
        .toThrow(expected);
    }
  });

  it("rejects complete temporal inversions and accepts equality across the full chain", () => {
    const equalityAt = "2026-05-10T12:00:00.000Z";
    const plan = canonicalPlan({ activatedAt: equalityAt, updatedAt: equalityAt });
    const equalIntent = genuineIntent({ planAssessment: planAssessment(plan), authoredAt: equalityAt });
    const equalPolicy = genuinePolicyAssessment(equalIntent, equalityAt);
    const equalReadiness = genuineReadiness(equalIntent, equalPolicy, equalityAt);
    const equalEvidence = genuineEvidenceAuthority(equalIntent, equalPolicy, equalReadiness, equalityAt);
    expect(() => recommendationAuthority(equalIntent, equalPolicy, equalReadiness, equalEvidence, equalityAt)).not.toThrow();

    const { intent, policy, readiness, evidence } = genuineChain();
    expect(() => recommendationAuthority(intent, policy, readiness, evidence, "2026-05-10T14:59:59.999Z"))
      .toThrow(/temporal_lineage_invalid/);

    const readinessBeforePolicy = clone(readiness) as any;
    readinessBeforePolicy.assessedAt = "2026-05-10T12:59:59.999Z";
    recomputeReadinessFingerprint(readinessBeforePolicy);
    const evidenceAfterReadiness = clone(evidence) as any;
    evidenceAfterReadiness.lineage.suitabilityReadinessAssessmentFingerprint = readinessBeforePolicy.assessmentFingerprint;
    recomputeEvidenceAuthorityFingerprint(evidenceAfterReadiness);
    expect(() => recommendationAuthority(intent, policy, readinessBeforePolicy, evidenceAfterReadiness))
      .toThrow(/temporal_lineage_invalid/);

    const evidenceBeforeReadiness = clone(evidence) as any;
    evidenceBeforeReadiness.assessedAt = "2026-05-10T13:59:59.999Z";
    recomputeEvidenceAuthorityFingerprint(evidenceBeforeReadiness);
    expect(() => recommendationAuthority(intent, policy, readiness, evidenceBeforeReadiness))
      .toThrow(/temporal_lineage_invalid/);
  });

  it("rejects fully rehashed upstream Plan temporal forgeries", () => {
    const expected = /upstream_plan_temporal_lineage_invalid/;
    const cases: Array<[string, (intent: any) => void]> = [
      ["activated after updated", (intent) => {
        intent.plan.activatedAt = "2026-05-10T11:30:00.000Z";
        intent.plan.updatedAt = "2026-05-10T11:00:00.000Z";
      }],
      ["updated after authored", (intent) => {
        intent.plan.updatedAt = "2026-05-10T12:00:00.001Z";
      }],
      ["activated after authored", (intent) => {
        intent.plan.activatedAt = "2026-05-10T12:00:00.001Z";
        intent.plan.updatedAt = "2026-05-10T12:00:00.002Z";
      }],
    ];

    for (const [label, mutate] of cases) {
      const { intent, policy, readiness, evidence } = selfConsistentForgedUpstreamChain(mutate);
      expect(hashCanonicalInvestingMandateIntentV1(intent), label).toBe(intent.lineage.intentFingerprint);
      expect(hashCanonicalInvestingPolicyMethodologyAssessmentV1(policy), label).toBe(policy.assessmentFingerprint);
      expect(hashCanonicalInvestingSuitabilityReadinessV1(readiness), label).toBe(readiness.assessmentFingerprint);
      expect(hashCanonicalInvestingSuitabilityEvidenceAuthorityV1(evidence), label).toBe(evidence.evidenceAuthorityFingerprint);
      expect(() => recommendationAuthority(intent, policy, readiness, evidence), label).toThrow(expected);
    }
  });

  it("rejects fully rehashed B2A claims of accepted financial authority or available methodology", () => {
    const cases: Array<[string, (policy: any) => void, RegExp]> = [
      ["financialAuthority", (policy) => { policy.technicalPolicyIdentity.financialAuthority = "ACCEPTED"; }, /technical_policy_financial_authority_invalid/],
      ["classification", (policy) => { policy.technicalPolicyIdentity.classification = "FINANCIAL_POLICY"; }, /technical_policy_classification_invalid/],
      ["available methodology", (policy) => { policy.methodology.availability = "AVAILABLE"; }, /methodology_availability_invalid/],
      ["specification", (policy) => { policy.methodology.specification = { rules: [] }; }, /methodology_specification_invalid/],
      ["declarations", (policy) => { policy.methodology.declarations = []; }, /methodology_declarations_invalid/],
    ];

    for (const [label, mutate, expected] of cases) {
      const { intent, policy, readiness, evidence } = genuineChain();
      const policyCopy = clone(policy) as any;
      const readinessCopy = clone(readiness) as any;
      const evidenceCopy = clone(evidence) as any;
      mutate(policyCopy);
      recomputePolicyAssessmentFingerprint(policyCopy);
      propagatePolicyToDownstream(intent, policyCopy, readinessCopy, evidenceCopy);
      expect(() => recommendationAuthority(intent, policyCopy, readinessCopy, evidenceCopy), label)
        .toThrow(expected);
    }
  });

  it("rejects fully rehashed B2B1 available evidence/readiness/regulatory states", () => {
    const cases: Array<[string, (readiness: any) => void, RegExp]> = [
      ["readiness", (readiness) => { readiness.readiness.availability = "AVAILABLE"; }, /readiness_state_availability_invalid/],
      ["riskTolerance", (readiness) => { readiness.evidence.riskTolerance.availability = "AVAILABLE"; }, /risk_tolerance_availability_invalid/],
      ["loss", (readiness) => { readiness.evidence.lossBearingCapacity.availability = "AVAILABLE"; }, /loss_availability_invalid/],
      ["financial", (readiness) => { readiness.evidence.financialSituation.availability = "AVAILABLE"; }, /financial_availability_invalid/],
      ["knowledge", (readiness) => { readiness.evidence.knowledgeExperience.availability = "AVAILABLE"; }, /knowledge_availability_invalid/],
      ["sustainability", (readiness) => { readiness.evidence.sustainabilityPreferences.availability = "APPLICABILITY_RESOLVED"; }, /sustainability_availability_invalid/],
      ["regulatory", (readiness) => { readiness.regulatoryApplicability.classification = "retail"; }, /regulatory_classification_invalid/],
      ["reliability", (readiness) => { readiness.reliability.methodology = "client_attestation/v1"; }, /reliability_methodology_invalid/],
    ];

    for (const [label, mutate, expected] of cases) {
      const { intent, policy, readiness, evidence } = genuineChain();
      const readinessCopy = clone(readiness) as any;
      const evidenceCopy = clone(evidence) as any;
      mutate(readinessCopy);
      recomputeReadinessFingerprint(readinessCopy);
      evidenceCopy.lineage.suitabilityReadinessAssessmentFingerprint = readinessCopy.assessmentFingerprint;
      recomputeEvidenceAuthorityFingerprint(evidenceCopy);
      expect(() => recommendationAuthority(intent, policy, readinessCopy, evidenceCopy), label)
        .toThrow(expected);
    }
  });

  it("rejects fully rehashed B2B2 accepted source, reliability, regulatory and provenance authority claims", () => {
    const cases: Array<[string, (evidence: any) => void, RegExp]> = [
      ["user settings", (evidence) => { evidence.sourceAuthority.riskTolerance.acceptedSource = "user_settings"; }, /accepted_source_invalid/],
      ["portfolio", (evidence) => { evidence.sourceAuthority.financialSituation.acceptedSource = "portfolio"; }, /accepted_source_invalid/],
      ["regulatory classification", (evidence) => { evidence.regulatoryClassificationAuthority.classification = "retail"; }, /regulatory_authority_classification_invalid/],
      ["regulatory source", (evidence) => { evidence.regulatoryClassificationAuthority.source = "account"; }, /regulatory_authority_source_invalid/],
      ["reliability methodology", (evidence) => { evidence.reliabilityAuthority.methodology = "client_attestation/v1"; }, /reliability_authority_methodology_invalid/],
      ["available provenance", (evidence) => { evidence.evidenceProvenanceAuthority.availability = "AVAILABLE"; }, /evidence_provenance_availability_invalid/],
      ["sustainability source", (evidence) => { evidence.sourceAuthority.sustainabilityPreferences.acceptedSource = "user_settings"; }, /sustainability_source_invalid/],
    ];

    for (const [label, mutate, expected] of cases) {
      const { intent, policy, readiness, evidence } = genuineChain();
      const evidenceCopy = clone(evidence) as any;
      mutate(evidenceCopy);
      recomputeEvidenceAuthorityFingerprint(evidenceCopy);
      expect(() => recommendationAuthority(intent, policy, readiness, evidenceCopy), label)
        .toThrow(expected);
    }
  });

  it("rejects root/nested symbols, non-enumerables, accessors and class instances without invoking getters", () => {
    const { intent, policy, readiness, evidence } = genuineChain();
    const symbolRoot = {
      intent: clone(intent),
      policyMethodologyAssessment: clone(policy),
      suitabilityReadiness: clone(readiness),
      suitabilityEvidenceAuthority: clone(evidence),
      assessedAt: RECOMMENDATION_ASSESSED_AT,
    } as any;
    symbolRoot[Symbol("futureAuthority")] = { decision: "BUY" };
    expect(() => assessCanonicalInvestingRecommendationSuitabilityAuthorityV1(symbolRoot)).toThrow(/closed_invalid/);

    const nestedSymbol = clone(symbolRoot) as any;
    delete nestedSymbol[Object.getOwnPropertySymbols(nestedSymbol)[0]];
    nestedSymbol.suitabilityEvidenceAuthority.sourceAuthority[Symbol("hidden")] = { allowExecution: true };
    expect(() => assessCanonicalInvestingRecommendationSuitabilityAuthorityV1(nestedSymbol)).toThrow(/closed_invalid/);

    const nonEnumerable = clone(symbolRoot) as any;
    delete nonEnumerable[Object.getOwnPropertySymbols(nonEnumerable)[0]];
    Object.defineProperty(nonEnumerable.suitabilityReadiness.evidence, "futureDecision", {
      value: { decision: "BUY" },
      enumerable: false,
    });
    expect(() => assessCanonicalInvestingRecommendationSuitabilityAuthorityV1(nonEnumerable)).toThrow(/closed_invalid/);

    let getterCalls = 0;
    const accessor = clone(symbolRoot) as any;
    delete accessor[Object.getOwnPropertySymbols(accessor)[0]];
    Object.defineProperty(accessor.suitabilityEvidenceAuthority.knownIntent, "riskProfile", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return "Balanced";
      },
    });
    expect(() => assessCanonicalInvestingRecommendationSuitabilityAuthorityV1(accessor)).toThrow(/closed_invalid/);
    expect(getterCalls).toBe(0);

    class RecommendationSuitabilityInput {
      intent = clone(intent);
      policyMethodologyAssessment = clone(policy);
      suitabilityReadiness = clone(readiness);
      suitabilityEvidenceAuthority = clone(evidence);
      assessedAt = RECOMMENDATION_ASSESSED_AT;
    }
    expect(() => assessCanonicalInvestingRecommendationSuitabilityAuthorityV1(new RecommendationSuitabilityInput() as any))
      .toThrow(/closed_invalid/);
  });

  it("rejects subclass, altered, sparse and accessor arrays without invoking caller-controlled map behavior", () => {
    const validReasons = [...genuineEvidenceAuthority().evidenceProvenanceAuthority.reasonCodes];

    class EvilArray extends Array<string> {}
    expectArrayRejected(new EvilArray(...validReasons));

    let subclassMapCalls = 0;
    class EvilMapArray extends Array<string> {
      override map<U>(callbackfn: (value: string, index: number, array: string[]) => U, thisArg?: unknown): U[] {
        subclassMapCalls += 1;
        return super.map(callbackfn, thisArg);
      }
    }
    expectArrayRejected(new EvilMapArray(...validReasons));
    expect(subclassMapCalls).toBe(0);

    let prototypeMapCalls = 0;
    const mapPrototype = Object.create(Array.prototype);
    mapPrototype.map = () => {
      prototypeMapCalls += 1;
      throw new Error("should_not_execute");
    };
    const prototypeMapArray = [...validReasons];
    Object.setPrototypeOf(prototypeMapArray, mapPrototype);
    expectArrayRejected(prototypeMapArray);
    expect(prototypeMapCalls).toBe(0);

    const alteredPrototypeArray = [...validReasons];
    Object.setPrototypeOf(alteredPrototypeArray, Object.create(Array.prototype));
    expectArrayRejected(alteredPrototypeArray);

    const sparse = new Array(validReasons.length);
    sparse[0] = validReasons[0];
    sparse[2] = validReasons[2];
    expectArrayRejected(sparse);

    let indexGetterCalls = 0;
    const accessorIndex = [...validReasons];
    Object.defineProperty(accessorIndex, "0", {
      enumerable: true,
      get() {
        indexGetterCalls += 1;
        return validReasons[0];
      },
    });
    expectArrayRejected(accessorIndex);
    expect(indexGetterCalls).toBe(0);
  });

  it("returns a recursively frozen closed assessment", () => {
    assertFrozenClosed(recommendationAuthority());
  });

  it("does not infer recommendation suitability from intent risk, plan amounts, account currency, membership, technical policy or legacy authority surfaces", () => {
    const richPlan = canonicalPlan({
      structured: {
        ...canonicalPlan().structured,
        objective: {
          type: "growth",
          targetAmount: { amount: 999999, currency: "EUR" },
          timeframeMonths: 360,
          monthlyContribution: { amount: 12000, currency: "EUR" },
        },
        risk: { profile: "Aggressive" },
      },
    });
    const intent = genuineIntent({
      planAssessment: planAssessment(richPlan),
      intent: { objective: "growth", riskProfile: "Aggressive", horizon: "Long" },
    });
    const policy = genuinePolicyAssessment(intent);
    const readiness = genuineReadiness(intent, policy);
    const evidence = genuineEvidenceAuthority(intent, policy, readiness);
    const result = recommendationAuthority(intent, policy, readiness, evidence);
    const serialized = JSON.stringify(result);

    expect(result.knownIntent.riskProfile).toBe("Aggressive");
    expect(result.recommendationSuitabilityAuthority).toMatchObject({
      availability: "UNAVAILABLE",
      authority: "NOT_ACCEPTED",
      determination: null,
    });
    expect(result.authorityBasis.policyMethodology).toEqual({
      availability: "UNAVAILABLE",
      financialAuthority: "NOT_ACCEPTED",
    });
    for (const forbidden of [
      "riskTolerance",
      "lossBearingCapacity",
      "financialSituation",
      "targetAmount",
      "monthlyContribution",
      "portfolioNav",
      "accountCash",
      "domicile",
      "retail",
      "professional",
      "owner",
      "client_attestation",
      "legacySuitability",
      "suitabilityScore",
      "allowExecution",
      "paper_authority",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }

    const pollutedInput = {
      intent: clone(intent),
      policyMethodologyAssessment: clone(policy),
      suitabilityReadiness: clone(readiness),
      suitabilityEvidenceAuthority: clone(evidence),
      assessedAt: RECOMMENDATION_ASSESSED_AT,
      legacySuitability: { score: 100, determination: "suitable" },
      actionGate: { allowExecution: true },
      portfolio: { nav: 1000000, cash: 500000 },
    } as any;
    expect(() => assessCanonicalInvestingRecommendationSuitabilityAuthorityV1(pollutedInput))
      .toThrow(/input_closed_invalid/);
  });

  it("quarantines daily-bundle, UI, persistence, legacy suitability, Trading and Research dependencies", () => {
    const moduleSource = source("lib/investing/authority/recommendationSuitabilityAuthority.ts");
    for (const forbidden of [
      "app/api/daily-bundle",
      "computeSuitabilityGate",
      "mergeActionGateWithSuitability",
      "ActionGate",
      "user_settings",
      "OfflineSetup",
      "localStorage",
      "portfolio_items",
      "account cash",
      "market quotes",
      "market prices",
      "profileBenchmark",
      "deriveRiskPolicy",
      "phase3d",
      "@/lib/trading",
      "lib/trading",
      "Research",
      "daily_bundle",
      "CanonicalMandateV1",
    ]) {
      expect(moduleSource, forbidden).not.toContain(forbidden);
    }
  });
});
