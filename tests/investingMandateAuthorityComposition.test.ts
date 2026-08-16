import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  CANONICAL_INVESTING_MANDATE_AUTHORITY_COMPOSITION_REASON_CODES,
  composeCanonicalInvestingMandateAuthorityV1,
  hashCanonicalInvestingMandateAuthorityCompositionV1,
} from "@/lib/investing/authority/mandateAuthorityComposition";
import {
  hashCanonicalInvestingMandateIntentV1,
  sealCanonicalInvestingMandateIntentV1,
  type CanonicalInvestingMandateIntentInputV1,
} from "@/lib/investing/authority/mandateIntent";
import {
  assessCanonicalInvestingPolicyMethodologyV1,
  hashCanonicalInvestingPolicyMethodologyAssessmentV1,
} from "@/lib/investing/authority/policyMethodology";
import {
  assessCanonicalPlanToMandateTranslationV1,
  hashCanonicalPlanToMandateTranslationAssessmentV1,
} from "@/lib/investing/authority/planToMandateTranslation";
import {
  assessCanonicalInvestingRecommendationSuitabilityAuthorityV1,
  hashCanonicalInvestingRecommendationSuitabilityAuthorityV1,
} from "@/lib/investing/authority/recommendationSuitabilityAuthority";
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
const COMPOSITION_ASSESSED_AT = "2026-05-10T17:00:00.000Z";

function canonicalPlan(overrides: Partial<CanonicalInvestingPlan> = {}): CanonicalInvestingPlan {
  return {
    id: "plan_123",
    mode: "investing",
    status: "active",
    version: 7,
    label: "Long-term plan",
    intent: "Invest over time",
    summary: "Free text is not mandate authority.",
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
    // Future production callers must source accountBaseCurrency from server-verified Investing account scope.
    accountBaseCurrency: currency,
  });
}

function validMandateIntentInput(
  overrides: Partial<CanonicalInvestingMandateIntentInputV1> = {},
): CanonicalInvestingMandateIntentInputV1 {
  const assessment = overrides.planAssessment ?? planAssessment();
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
      baseCurrency: assessment.account.baseCurrency ?? "EUR",
    },
    planAssessment: assessment,
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

function genuineRecommendationAuthority(
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

function genuineChain(args: { plan?: CanonicalInvestingPlan; authoredAt?: string } = {}) {
  const translation = planAssessment(args.plan);
  const intent = genuineIntent({
    planAssessment: translation,
    authoredAt: args.authoredAt ?? AUTHORED_AT,
  });
  const policy = genuinePolicyAssessment(intent);
  const readiness = genuineReadiness(intent, policy);
  const evidence = genuineEvidenceAuthority(intent, policy, readiness);
  const recommendation = genuineRecommendationAuthority(intent, policy, readiness, evidence);
  return { translation, intent, policy, readiness, evidence, recommendation };
}

function composeFromChain(
  chain = genuineChain(),
  assessedAt = COMPOSITION_ASSESSED_AT,
) {
  return composeCanonicalInvestingMandateAuthorityV1({
    planTranslationAssessment: chain.translation,
    intent: chain.intent,
    policyMethodologyAssessment: chain.policy,
    suitabilityReadiness: chain.readiness,
    suitabilityEvidenceAuthority: chain.evidence,
    recommendationSuitabilityAuthority: chain.recommendation,
    assessedAt,
  });
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function recomputeTranslationFingerprint(translation: any) {
  translation.translationFingerprint = hashCanonicalPlanToMandateTranslationAssessmentV1(translation);
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

function recomputeRecommendationFingerprint(recommendation: any) {
  recommendation.authorityFingerprint =
    hashCanonicalInvestingRecommendationSuitabilityAuthorityV1(recommendation);
}

function fullyRehashedChain(mutate: (chain: any) => void) {
  const chain = clone(genuineChain()) as any;
  mutate(chain);

  recomputeTranslationFingerprint(chain.translation);
  recomputeIntentFingerprint(chain.intent);

  chain.policy.intent.intentFingerprint = chain.intent.lineage.intentFingerprint;
  chain.policy.intent.authority = clone(chain.intent.authority);
  chain.policy.intent.plan = clone(chain.intent.plan);
  chain.policy.intent.declaredIntent = clone(chain.intent.intent);
  recomputePolicyAssessmentFingerprint(chain.policy);

  chain.readiness.authority = clone(chain.intent.authority);
  chain.readiness.lineage = {
    planId: chain.intent.plan.planId,
    planVersion: chain.intent.plan.planVersion,
    activatedAt: chain.intent.plan.activatedAt,
    updatedAt: chain.intent.plan.updatedAt,
    structuredSchemaVersion: chain.intent.plan.structuredSchemaVersion,
    planSemanticFingerprint: chain.intent.plan.semanticFingerprint,
    intentFingerprint: chain.intent.lineage.intentFingerprint,
    policyMethodologyAssessmentFingerprint: chain.policy.assessmentFingerprint,
  };
  chain.readiness.knownIntent = clone(chain.intent.intent);
  recomputeReadinessFingerprint(chain.readiness);

  chain.evidence.authority = clone(chain.intent.authority);
  chain.evidence.lineage = {
    planId: chain.intent.plan.planId,
    planVersion: chain.intent.plan.planVersion,
    activatedAt: chain.intent.plan.activatedAt,
    updatedAt: chain.intent.plan.updatedAt,
    structuredSchemaVersion: chain.intent.plan.structuredSchemaVersion,
    planSemanticFingerprint: chain.intent.plan.semanticFingerprint,
    intentFingerprint: chain.intent.lineage.intentFingerprint,
    policyMethodologyAssessmentFingerprint: chain.policy.assessmentFingerprint,
    suitabilityReadinessAssessmentFingerprint: chain.readiness.assessmentFingerprint,
  };
  chain.evidence.knownIntent = clone(chain.intent.intent);
  recomputeEvidenceAuthorityFingerprint(chain.evidence);

  chain.recommendation.authority = clone(chain.intent.authority);
  chain.recommendation.lineage = {
    planId: chain.intent.plan.planId,
    planVersion: chain.intent.plan.planVersion,
    activatedAt: chain.intent.plan.activatedAt,
    updatedAt: chain.intent.plan.updatedAt,
    structuredSchemaVersion: chain.intent.plan.structuredSchemaVersion,
    planSemanticFingerprint: chain.intent.plan.semanticFingerprint,
    intentFingerprint: chain.intent.lineage.intentFingerprint,
    policyMethodologyAssessmentFingerprint: chain.policy.assessmentFingerprint,
    suitabilityReadinessAssessmentFingerprint: chain.readiness.assessmentFingerprint,
    suitabilityEvidenceAuthorityFingerprint: chain.evidence.evidenceAuthorityFingerprint,
  };
  chain.recommendation.knownIntent = clone(chain.intent.intent);
  recomputeRecommendationFingerprint(chain.recommendation);

  return chain;
}

function setPlanTimes(chain: any, activatedAt: string, updatedAt: string, authoredAt: string) {
  chain.translation.sourcePlan.activatedAt = activatedAt;
  chain.translation.sourcePlan.updatedAt = updatedAt;
  chain.translation.sourcePlan.semanticFingerprint = "a".repeat(64);
  chain.intent.plan.activatedAt = activatedAt;
  chain.intent.plan.updatedAt = updatedAt;
  chain.intent.plan.semanticFingerprint = "a".repeat(64);
  chain.intent.lineage.authoredAt = authoredAt;
}

function expectArrayRejected(reasonCodes: unknown, pattern = /reason_codes_invalid|mismatch/) {
  const chain = clone(genuineChain()) as any;
  chain.policy.methodology.reasonCodes = reasonCodes;
  expect(() => composeFromChain(chain)).toThrow(pattern);
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

describe("canonical mandate authority composition boundary", () => {
  it("composes a closed unavailable A2.3C artifact from genuine A2.3A/B1/B2A/B2B1/B2B2/B2B3 inputs", () => {
    const chain = genuineChain();
    const result = composeFromChain(chain);

    expect(result.contractVersion).toBe("canonical-investing-mandate-authority-composition/v1");
    expect(result.authority).toEqual(chain.intent.authority);
    expect(result.lineage).toEqual({
      planId: chain.intent.plan.planId,
      planVersion: chain.intent.plan.planVersion,
      activatedAt: chain.intent.plan.activatedAt,
      updatedAt: chain.intent.plan.updatedAt,
      structuredSchemaVersion: chain.intent.plan.structuredSchemaVersion,
      planSemanticFingerprint: chain.intent.plan.semanticFingerprint,
      planToMandateTranslationFingerprint: chain.translation.translationFingerprint,
      intentFingerprint: chain.intent.lineage.intentFingerprint,
      policyMethodologyAssessmentFingerprint: chain.policy.assessmentFingerprint,
      suitabilityReadinessAssessmentFingerprint: chain.readiness.assessmentFingerprint,
      suitabilityEvidenceAuthorityFingerprint: chain.evidence.evidenceAuthorityFingerprint,
      recommendationSuitabilityAuthorityFingerprint: chain.recommendation.authorityFingerprint,
    });
    expect(result.knownIntent).toEqual(chain.intent.intent);
    expect(result.compositionBasis).toEqual({
      planToMandateTranslation: { availability: "UNAVAILABLE", mandate: null },
      policyMethodology: { availability: "UNAVAILABLE", financialAuthority: "NOT_ACCEPTED", declarations: null },
      recommendationSuitability: { availability: "UNAVAILABLE", authority: "NOT_ACCEPTED", determination: null },
    });
    expect(result.mandateAuthority).toEqual({
      availability: "UNAVAILABLE",
      authority: "NOT_ACCEPTED",
      mandate: null,
      reasonCodes: CANONICAL_INVESTING_MANDATE_AUTHORITY_COMPOSITION_REASON_CODES,
    });
    expect(result.compositionFingerprint).toMatch(/^[a-f0-9]{64}$/);
    assertFrozenClosed(result);
  });

  it("never constructs mandate, recommendation, suitability, allocation or execution authority", () => {
    const result = composeFromChain();
    const serialized = JSON.stringify(result);

    expect(result.mandateAuthority.mandate).toBeNull();
    for (const forbidden of [
      "CanonicalMandateV1",
      "suitabilityScore",
      "score",
      "targetAmount",
      "monthlyContribution",
      "timeframeMonths",
      "constraints\":[]",
      "allocation",
      "rebalance",
      "targetPosition",
      "brokerInstruction",
      "allowExecution",
      "BUY",
      "SELL",
      "HOLD",
      "ENTER",
      "REDUCE",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("keeps exact reason ordering, frozen constants and deterministic fingerprints", () => {
    const first = composeFromChain();
    const second = composeFromChain();

    expect(CANONICAL_INVESTING_MANDATE_AUTHORITY_COMPOSITION_REASON_CODES).toEqual([
      "CANONICAL_MANDATE_AUTHORITY_NOT_ACCEPTED",
      "PLAN_TO_MANDATE_TRANSLATION_UNAVAILABLE",
      "FINANCIAL_POLICY_METHODOLOGY_AUTHORITY_UNAVAILABLE",
      "RECOMMENDATION_SUITABILITY_AUTHORITY_NOT_ACCEPTED",
      "CANONICAL_MANDATE_NOT_COMPOSED",
    ]);
    expect(Object.isFrozen(CANONICAL_INVESTING_MANDATE_AUTHORITY_COMPOSITION_REASON_CODES)).toBe(true);
    expect(() => {
      (CANONICAL_INVESTING_MANDATE_AUTHORITY_COMPOSITION_REASON_CODES as unknown as string[]).push("X");
    }).toThrow();
    expect(new Set(first.mandateAuthority.reasonCodes).size).toBe(first.mandateAuthority.reasonCodes.length);
    expect(second.compositionFingerprint).toBe(first.compositionFingerprint);
    expect(hashCanonicalInvestingMandateAuthorityCompositionV1(first)).toBe(first.compositionFingerprint);
    expect(composeFromChain(undefined, "2026-05-10T17:01:00.000Z").compositionFingerprint)
      .not.toBe(first.compositionFingerprint);
  });

  it("rejects forged lower canonical fingerprints and lineage mismatches", () => {
    const chain = genuineChain();

    const badTranslation = clone(chain) as any;
    badTranslation.translation.translationFingerprint = "0".repeat(64);
    expect(() => composeFromChain(badTranslation)).toThrow(/plan_translation_fingerprint_mismatch/);

    const badIntent = clone(chain) as any;
    badIntent.intent.lineage.intentFingerprint = "0".repeat(64);
    expect(() => composeFromChain(badIntent)).toThrow(/intent_fingerprint_mismatch/);

    const badPolicy = clone(chain) as any;
    badPolicy.policy.assessmentFingerprint = "0".repeat(64);
    expect(() => composeFromChain(badPolicy)).toThrow(/policy_methodology_fingerprint_mismatch|policy_methodology_mismatch/);

    const badReadiness = clone(chain) as any;
    badReadiness.readiness.assessmentFingerprint = "0".repeat(64);
    expect(() => composeFromChain(badReadiness)).toThrow(/suitability_readiness_mismatch/);

    const badEvidence = clone(chain) as any;
    badEvidence.evidence.evidenceAuthorityFingerprint = "0".repeat(64);
    expect(() => composeFromChain(badEvidence)).toThrow(/suitability_evidence_mismatch/);

    const badRecommendation = clone(chain) as any;
    badRecommendation.recommendation.authorityFingerprint = "0".repeat(64);
    expect(() => composeFromChain(badRecommendation)).toThrow(/recommendation_suitability_mismatch/);
  });

  it("rejects fully rehashed authority-bearing upstream forgeries", () => {
    const cases: Array<[string, (chain: any) => void, RegExp]> = [
      [
        "B1 policy available",
        (chain) => {
          chain.intent.policy.availability = "AVAILABLE";
          chain.intent.policy.declarations = [];
        },
        /intent_policy_availability_invalid/,
      ],
      [
        "B2A methodology available",
        (chain) => {
          chain.policy.methodology.availability = "AVAILABLE";
          chain.policy.technicalPolicyIdentity.financialAuthority = "ACCEPTED";
          chain.policy.methodology.declarations = [];
        },
        /policy_methodology_mismatch/,
      ],
      [
        "B2B1 readiness available",
        (chain) => {
          chain.readiness.readiness.availability = "AVAILABLE";
        },
        /suitability_readiness_mismatch/,
      ],
      [
        "B2B2 accepted source authority",
        (chain) => {
          chain.evidence.sourceAuthority.knowledgeExperience.acceptedSource = "profile_questionnaire";
        },
        /suitability_evidence_mismatch/,
      ],
      [
        "B2B3 accepted recommendation suitability",
        (chain) => {
          chain.recommendation.recommendationSuitabilityAuthority.availability = "AVAILABLE";
          chain.recommendation.recommendationSuitabilityAuthority.authority = "ACCEPTED";
          chain.recommendation.recommendationSuitabilityAuthority.determination = { decision: "BUY" };
        },
        /recommendation_suitability_mismatch/,
      ],
    ];

    for (const [label, mutate, expected] of cases) {
      const forged = fullyRehashedChain(mutate);
      expect(() => composeFromChain(forged), label).toThrow(expected);
    }
  });

  it("rejects complete self-consistent upstream Plan temporal forgeries and accepts equality", () => {
    const expected = /upstream_plan_temporal_lineage_invalid/;
    const cases: Array<[string, string, string, string]> = [
      [
        "activated after updated",
        "2026-05-10T11:30:00.000Z",
        "2026-05-10T11:00:00.000Z",
        AUTHORED_AT,
      ],
      [
        "updated after authored",
        "2026-05-10T10:00:00.000Z",
        "2026-05-10T12:00:00.001Z",
        AUTHORED_AT,
      ],
      [
        "activated after authored",
        "2026-05-10T12:00:00.001Z",
        "2026-05-10T12:00:00.002Z",
        AUTHORED_AT,
      ],
    ];

    for (const [label, activatedAt, updatedAt, authoredAt] of cases) {
      const forged = fullyRehashedChain((chain) => setPlanTimes(chain, activatedAt, updatedAt, authoredAt));
      expect(hashCanonicalInvestingMandateIntentV1(forged.intent), label).toBe(forged.intent.lineage.intentFingerprint);
      expect(hashCanonicalInvestingPolicyMethodologyAssessmentV1(forged.policy), label).toBe(forged.policy.assessmentFingerprint);
      expect(hashCanonicalInvestingSuitabilityReadinessV1(forged.readiness), label).toBe(forged.readiness.assessmentFingerprint);
      expect(hashCanonicalInvestingSuitabilityEvidenceAuthorityV1(forged.evidence), label).toBe(forged.evidence.evidenceAuthorityFingerprint);
      expect(hashCanonicalInvestingRecommendationSuitabilityAuthorityV1(forged.recommendation), label)
        .toBe(forged.recommendation.authorityFingerprint);
      expect(() => composeFromChain(forged), label).toThrow(expected);
    }

    const equalityAt = "2026-05-10T12:00:00.000Z";
    const equalityPlan = canonicalPlan({ activatedAt: equalityAt, updatedAt: equalityAt });
    const equalityTranslation = planAssessment(equalityPlan);
    const equalityIntent = genuineIntent({ planAssessment: equalityTranslation, authoredAt: equalityAt });
    const equalityPolicy = genuinePolicyAssessment(equalityIntent, equalityAt);
    const equalityReadiness = genuineReadiness(equalityIntent, equalityPolicy, equalityAt);
    const equalityEvidence = genuineEvidenceAuthority(equalityIntent, equalityPolicy, equalityReadiness, equalityAt);
    const equalityRecommendation = genuineRecommendationAuthority(
      equalityIntent,
      equalityPolicy,
      equalityReadiness,
      equalityEvidence,
      equalityAt,
    );
    expect(() => composeFromChain({
      translation: equalityTranslation,
      intent: equalityIntent,
      policy: equalityPolicy,
      readiness: equalityReadiness,
      evidence: equalityEvidence,
      recommendation: equalityRecommendation,
    }, equalityAt)).not.toThrow();
  });

  it("rejects temporal inversions after B1", () => {
    const chain = genuineChain();
    expect(() => composeFromChain(chain, "2026-05-10T15:59:59.999Z")).toThrow(/temporal_lineage_invalid/);

    const beforePolicy = clone(chain) as any;
    beforePolicy.readiness.assessedAt = "2026-05-10T12:59:59.999Z";
    recomputeReadinessFingerprint(beforePolicy.readiness);
    expect(() => composeFromChain(beforePolicy)).toThrow();
  });

  it("fails closed on unknown fields, accessors, non-enumerables, symbols and class instances", () => {
    const root = { ...genuineChain(), extra: "decision" } as any;
    expect(() => composeCanonicalInvestingMandateAuthorityV1({
      planTranslationAssessment: root.translation,
      intent: root.intent,
      policyMethodologyAssessment: root.policy,
      suitabilityReadiness: root.readiness,
      suitabilityEvidenceAuthority: root.evidence,
      recommendationSuitabilityAuthority: root.recommendation,
      assessedAt: COMPOSITION_ASSESSED_AT,
      futureDecisionNode: { decision: "BUY" },
    } as any)).toThrow(/input_closed_invalid/);

    const chainWithUnknownNested = clone(genuineChain()) as any;
    chainWithUnknownNested.recommendation.futureDecisionNode = { decision: "BUY", allowExecution: true };
    expect(() => composeFromChain(chainWithUnknownNested)).toThrow(/recommendation_suitability_mismatch/);

    const withAccessor = clone(genuineChain()) as any;
    let getterCalled = false;
    Object.defineProperty(withAccessor.intent.policy, "declarations", {
      enumerable: true,
      get() {
        getterCalled = true;
        return null;
      },
    });
    expect(() => composeFromChain(withAccessor)).toThrow(/intent_policy_closed_invalid/);
    expect(getterCalled).toBe(false);

    const withNonEnumerable = clone(genuineChain()) as any;
    Object.defineProperty(withNonEnumerable.intent.authority, "decision", {
      value: "BUY",
      enumerable: false,
    });
    expect(() => composeFromChain(withNonEnumerable)).toThrow(/authority_closed_invalid/);

    const withSymbol = clone(genuineChain()) as any;
    Object.defineProperty(withSymbol.intent.authority, Symbol("decision"), {
      value: "BUY",
      enumerable: true,
    });
    expect(() => composeFromChain(withSymbol)).toThrow(/authority_closed_invalid/);

    class IntentLike {
      contractVersion = clone(genuineChain()).intent.contractVersion;
      authority = clone(genuineChain()).intent.authority;
      plan = clone(genuineChain()).intent.plan;
      intent = clone(genuineChain()).intent.intent;
      policy = clone(genuineChain()).intent.policy;
      lineage = clone(genuineChain()).intent.lineage;
    }
    const withClass = clone(genuineChain()) as any;
    withClass.intent = new IntentLike();
    expect(() => composeFromChain(withClass)).toThrow(/intent_closed_invalid/);
  });

  it("fails closed on decorated, subclassed, sparse, accessor and replaced-prototype arrays without invoking array methods", () => {
    expectArrayRejected(["CANONICAL_POLICY_METHODOLOGY_NOT_ACCEPTED", "ENGINE_TECHNICAL_POLICY_NOT_FINANCIAL_AUTHORITY"]);

    const decorated = [
      "CANONICAL_POLICY_METHODOLOGY_NOT_ACCEPTED",
      "ENGINE_TECHNICAL_POLICY_NOT_FINANCIAL_AUTHORITY",
      "PLAN_GUARDRAIL_MAPPING_NOT_ACCEPTED",
    ];
    (decorated as any).futureDecision = "BUY";
    expectArrayRejected(decorated);

    class ReasonArray extends Array<string> {
      map(): never {
        throw new Error("map_called");
      }
    }
    const subclassed = new ReasonArray(
      "CANONICAL_POLICY_METHODOLOGY_NOT_ACCEPTED",
      "ENGINE_TECHNICAL_POLICY_NOT_FINANCIAL_AUTHORITY",
      "PLAN_GUARDRAIL_MAPPING_NOT_ACCEPTED",
    );
    expectArrayRejected(subclassed, /reason_codes_invalid|mismatch/);

    const sparse = [
      "CANONICAL_POLICY_METHODOLOGY_NOT_ACCEPTED",
      "ENGINE_TECHNICAL_POLICY_NOT_FINANCIAL_AUTHORITY",
      "PLAN_GUARDRAIL_MAPPING_NOT_ACCEPTED",
    ];
    delete sparse[1];
    expectArrayRejected(sparse);

    const accessor = [
      "CANONICAL_POLICY_METHODOLOGY_NOT_ACCEPTED",
      "ENGINE_TECHNICAL_POLICY_NOT_FINANCIAL_AUTHORITY",
      "PLAN_GUARDRAIL_MAPPING_NOT_ACCEPTED",
    ];
    let accessorCalled = false;
    Object.defineProperty(accessor, "1", {
      enumerable: true,
      get() {
        accessorCalled = true;
        return "ENGINE_TECHNICAL_POLICY_NOT_FINANCIAL_AUTHORITY";
      },
    });
    expectArrayRejected(accessor);
    expect(accessorCalled).toBe(false);

    const replacedProto = [
      "CANONICAL_POLICY_METHODOLOGY_NOT_ACCEPTED",
      "ENGINE_TECHNICAL_POLICY_NOT_FINANCIAL_AUTHORITY",
      "PLAN_GUARDRAIL_MAPPING_NOT_ACCEPTED",
    ];
    Object.setPrototypeOf(replacedProto, { map: () => { throw new Error("map_called"); } });
    expectArrayRejected(replacedProto);
  });

  it("does not import legacy authority builders or non-canonical runtime surfaces", () => {
    const implementation = source("lib/investing/authority/mandateAuthorityComposition.ts");
    for (const forbidden of [
      "sealCanonicalInvestingMandateAuthorityV1",
      "getPlanDerivedMandateAuthorityUnavailableV1",
      "runtimeAdapter",
      "daily-bundle",
      "user_settings",
      "OfflineSetup",
      "persistentPaper",
      "phase3c",
      "phase3d",
      "phase3e",
      "phase3f",
      "trading",
      "research",
    ]) {
      expect(implementation).not.toContain(forbidden);
    }
  });
});
