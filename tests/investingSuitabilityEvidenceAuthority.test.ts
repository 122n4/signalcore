import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  CANONICAL_INVESTING_SUITABILITY_EVIDENCE_AUTHORITY_REASON_CODES,
  assessCanonicalInvestingSuitabilityEvidenceAuthorityV1,
  hashCanonicalInvestingSuitabilityEvidenceAuthorityV1,
} from "@/lib/investing/authority/suitabilityEvidenceAuthority";
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
  assessCanonicalInvestingSuitabilityReadinessV1,
  hashCanonicalInvestingSuitabilityReadinessV1,
} from "@/lib/investing/authority/suitabilityReadiness";
import type { CanonicalInvestingPlan } from "@/lib/investing/server/plan";

const AUTHORED_AT = "2026-05-10T12:00:00.000Z";
const POLICY_ASSESSED_AT = "2026-05-10T13:00:00.000Z";
const READINESS_ASSESSED_AT = "2026-05-10T14:00:00.000Z";
const EVIDENCE_ASSESSED_AT = "2026-05-10T15:00:00.000Z";

function canonicalPlan(overrides: Partial<CanonicalInvestingPlan> = {}): CanonicalInvestingPlan {
  return {
    id: "plan_123",
    mode: "investing",
    status: "active",
    version: 7,
    label: "Long-term plan",
    intent: "Invest over time",
    summary: "Free text is not suitability authority.",
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

function evidenceAuthority(
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

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function recomputePolicyAssessmentFingerprint(assessment: any) {
  assessment.assessmentFingerprint = hashCanonicalInvestingPolicyMethodologyAssessmentV1(assessment);
}

function recomputeReadinessFingerprint(readiness: any) {
  readiness.assessmentFingerprint = hashCanonicalInvestingSuitabilityReadinessV1(readiness);
}

function selfConsistentForgedUpstreamChain(mutateIntent: (intent: any) => void) {
  const intent = clone(genuineIntent()) as any;
  mutateIntent(intent);
  intent.lineage.intentFingerprint = hashCanonicalInvestingMandateIntentV1(intent);

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

  return { intent, policy, readiness };
}

function expectArrayRejected(reasonCodes: unknown, pattern = /reason_codes_invalid/) {
  const intent = genuineIntent();
  const policy = clone(genuinePolicyAssessment(intent)) as any;
  const readiness = clone(genuineReadiness(intent, policy)) as any;
  policy.methodology.reasonCodes = reasonCodes;
  expect(() => {
    assessCanonicalInvestingSuitabilityEvidenceAuthorityV1({
      intent,
      policyMethodologyAssessment: policy,
      suitabilityReadiness: readiness,
      assessedAt: EVIDENCE_ASSESSED_AT,
    });
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

describe("canonical suitability evidence authority boundary", () => {
  it("produces the B2B2 evidence/provenance authority object from genuine B1, B2A and B2B1 while remaining unavailable", () => {
    const intent = genuineIntent();
    const policy = genuinePolicyAssessment(intent);
    const readiness = genuineReadiness(intent, policy);
    const result = evidenceAuthority(intent, policy, readiness);

    expect(result.contractVersion).toBe("canonical-investing-suitability-evidence-authority/v1");
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
    });
    expect(result.sourceAuthority).toEqual({
      knowledgeExperience: { availability: "UNAVAILABLE", acceptedSource: null },
      financialSituation: { availability: "UNAVAILABLE", acceptedSource: null },
      lossBearingCapacity: { availability: "UNAVAILABLE", acceptedSource: null },
      riskTolerance: { availability: "UNAVAILABLE", acceptedSource: null },
      sustainabilityPreferences: { applicability: "UNRESOLVED", acceptedSource: null },
    });
    expect(result.reliabilityAuthority).toEqual({ availability: "UNAVAILABLE", methodology: null });
    expect(result.regulatoryClassificationAuthority).toEqual({
      availability: "UNRESOLVED",
      classification: null,
      source: null,
    });
    expect(result.evidenceProvenanceAuthority).toEqual({
      availability: "UNAVAILABLE",
      reasonCodes: CANONICAL_INVESTING_SUITABILITY_EVIDENCE_AUTHORITY_REASON_CODES,
    });
    expect(result.evidenceAuthorityFingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it("exposes no suitability score, recommendation, mandate or execution fields", () => {
    const serialized = JSON.stringify(evidenceAuthority());
    for (const forbidden of [
      "suitable",
      "unsuitable",
      "suitabilityScore",
      "score",
      "percentage",
      "probability",
      "expectedReturn",
      "targetReturn",
      "recommendation",
      "CanonicalMandateV1",
      "allocation",
      "execution",
      "BUY",
      "SELL",
      "HOLD",
      "retail",
      "professional",
      "experienced",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("rejects forged B1, B2A and B2B1 fingerprints", () => {
    const forgedIntent = clone(genuineIntent()) as any;
    forgedIntent.lineage.intentFingerprint = "0".repeat(64);
    expect(() => evidenceAuthority(forgedIntent)).toThrow(/intent_fingerprint_mismatch/);

    const intent = genuineIntent();
    const forgedPolicy = clone(genuinePolicyAssessment(intent)) as any;
    forgedPolicy.assessmentFingerprint = "0".repeat(64);
    expect(() => evidenceAuthority(intent, forgedPolicy)).toThrow(/policy_methodology_fingerprint_mismatch/);

    const policy = genuinePolicyAssessment(intent);
    const forgedReadiness = clone(genuineReadiness(intent, policy)) as any;
    forgedReadiness.assessmentFingerprint = "0".repeat(64);
    expect(() => evidenceAuthority(intent, policy, forgedReadiness)).toThrow(/readiness_fingerprint_mismatch/);
  });

  it("rejects exact authority mismatches across B1, B2A and B2B1", () => {
    const cases: Array<[string, (policy: any, readiness: any) => void, RegExp]> = [
      ["user", (policy) => { policy.intent.authority.userId = "user_other"; recomputePolicyAssessmentFingerprint(policy); }, /userId_mismatch/],
      ["tenant", (policy) => { policy.intent.authority.tenantId = "tenant_other"; recomputePolicyAssessmentFingerprint(policy); }, /tenantId_mismatch/],
      ["membership", (policy) => { policy.intent.authority.membershipId = "membership_other"; recomputePolicyAssessmentFingerprint(policy); }, /membershipId_mismatch/],
      ["portfolio", (policy) => { policy.intent.authority.portfolioId = "portfolio_other"; recomputePolicyAssessmentFingerprint(policy); }, /portfolioId_mismatch/],
      ["account", (policy) => { policy.intent.authority.accountId = "account_other"; recomputePolicyAssessmentFingerprint(policy); }, /accountId_mismatch/],
      ["environment", (policy) => { policy.intent.authority.environment = "simulation"; recomputePolicyAssessmentFingerprint(policy); }, /environment_mismatch/],
      ["currency", (policy) => { policy.intent.authority.accountBaseCurrency = "USD"; recomputePolicyAssessmentFingerprint(policy); }, /accountBaseCurrency_mismatch/],
      ["readiness user", (_policy, readiness) => { readiness.authority.userId = "user_other"; recomputeReadinessFingerprint(readiness); }, /userId_mismatch/],
    ];

    for (const [label, mutate, expected] of cases) {
      const intent = genuineIntent();
      const policy = clone(genuinePolicyAssessment(intent)) as any;
      const readiness = clone(genuineReadiness(intent, policy)) as any;
      mutate(policy, readiness);
      expect(() => evidenceAuthority(intent, policy, readiness), label).toThrow(expected);
    }
  });

  it("rejects plan lineage and semantic fingerprint mismatches", () => {
    const cases: Array<[string, (readiness: any) => void, RegExp]> = [
      ["planId", (readiness) => { readiness.lineage.planId = "plan_other"; }, /plan_id_mismatch/],
      ["version", (readiness) => { readiness.lineage.planVersion = 8; }, /plan_version_mismatch/],
      ["activatedAt", (readiness) => { readiness.lineage.activatedAt = "2026-05-10T10:01:00.000Z"; }, /plan_activated_at_mismatch/],
      ["updatedAt", (readiness) => { readiness.lineage.updatedAt = "2026-05-10T11:01:00.000Z"; }, /plan_updated_at_mismatch/],
      ["schema", (readiness) => { readiness.lineage.structuredSchemaVersion = 2; }, /plan_schema_invalid|plan_schema_mismatch/],
      ["semantic", (readiness) => { readiness.lineage.planSemanticFingerprint = "0".repeat(64); }, /plan_semantic_fingerprint_mismatch/],
      ["intent", (readiness) => { readiness.lineage.intentFingerprint = "0".repeat(64); }, /b2b1_intent_fingerprint_lineage_mismatch/],
      ["policy", (readiness) => { readiness.lineage.policyMethodologyAssessmentFingerprint = "0".repeat(64); }, /b2b1_policy_fingerprint_lineage_mismatch/],
    ];

    for (const [label, mutate, expected] of cases) {
      const intent = genuineIntent();
      const policy = genuinePolicyAssessment(intent);
      const readiness = clone(genuineReadiness(intent, policy)) as any;
      mutate(readiness);
      if (label !== "schema") recomputeReadinessFingerprint(readiness);
      expect(() => evidenceAuthority(intent, policy, readiness), label).toThrow(expected);
    }
  });

  it("rejects temporal inversions at every stage and accepts equality timestamps", () => {
    const equalIntent = genuineIntent({ authoredAt: "2026-05-10T12:00:00.000Z" });
    const equalPolicy = genuinePolicyAssessment(equalIntent, "2026-05-10T12:00:00.000Z");
    const equalReadiness = genuineReadiness(equalIntent, equalPolicy, "2026-05-10T12:00:00.000Z");
    expect(() => evidenceAuthority(equalIntent, equalPolicy, equalReadiness, "2026-05-10T12:00:00.000Z")).not.toThrow();

    const intent = genuineIntent();
    const policy = genuinePolicyAssessment(intent, "2026-05-10T13:00:00.000Z");
    const readiness = genuineReadiness(intent, policy, "2026-05-10T14:00:00.000Z");
    expect(() => evidenceAuthority(intent, policy, readiness, "2026-05-10T13:59:59.999Z"))
      .toThrow(/temporal_lineage_invalid/);

    const authoredAfterPolicy = genuineIntent({ authoredAt: "2026-05-10T13:00:00.001Z" });
    const policyAtAuthored = genuinePolicyAssessment(authoredAfterPolicy, "2026-05-10T13:00:00.001Z");
    const readinessAfterForgedPolicy = clone(genuineReadiness(authoredAfterPolicy, policyAtAuthored, "2026-05-10T14:00:00.000Z")) as any;
    const policyBeforeAuthored = clone(policyAtAuthored) as any;
    policyBeforeAuthored.assessedAt = "2026-05-10T13:00:00.000Z";
    recomputePolicyAssessmentFingerprint(policyBeforeAuthored);
    readinessAfterForgedPolicy.lineage.policyMethodologyAssessmentFingerprint = policyBeforeAuthored.assessmentFingerprint;
    recomputeReadinessFingerprint(readinessAfterForgedPolicy);
    expect(() => evidenceAuthority(authoredAfterPolicy, policyBeforeAuthored, readinessAfterForgedPolicy))
      .toThrow(/temporal_lineage_invalid/);

    const readinessBeforePolicy = clone(readiness) as any;
    readinessBeforePolicy.assessedAt = "2026-05-10T12:59:59.999Z";
    recomputeReadinessFingerprint(readinessBeforePolicy);
    expect(() => evidenceAuthority(intent, policy, readinessBeforePolicy)).toThrow(/temporal_lineage_invalid/);
  });

  it("rejects fully rehashed upstream Plan temporal forgeries before producing B2B2 evidence authority", () => {
    const expected = /upstream_plan_temporal_lineage_invalid/;
    const cases: Array<[string, (intent: any) => void]> = [
      [
        "plan activated after updated",
        (intent) => {
          intent.plan.activatedAt = "2026-05-10T11:30:00.000Z";
          intent.plan.updatedAt = "2026-05-10T11:00:00.000Z";
          intent.lineage.authoredAt = "2026-05-10T12:00:00.000Z";
        },
      ],
      [
        "plan updated after B1 authored",
        (intent) => {
          intent.plan.activatedAt = "2026-05-10T10:00:00.000Z";
          intent.plan.updatedAt = "2026-05-10T12:00:00.001Z";
          intent.lineage.authoredAt = "2026-05-10T12:00:00.000Z";
        },
      ],
      [
        "plan activated after B1 authored",
        (intent) => {
          intent.plan.activatedAt = "2026-05-10T12:00:00.001Z";
          intent.plan.updatedAt = "2026-05-10T12:00:00.002Z";
          intent.lineage.authoredAt = "2026-05-10T12:00:00.000Z";
        },
      ],
    ];

    for (const [label, mutate] of cases) {
      const { intent, policy, readiness } = selfConsistentForgedUpstreamChain(mutate);
      expect(hashCanonicalInvestingMandateIntentV1(intent), label).toBe(intent.lineage.intentFingerprint);
      expect(hashCanonicalInvestingPolicyMethodologyAssessmentV1(policy), label).toBe(policy.assessmentFingerprint);
      expect(hashCanonicalInvestingSuitabilityReadinessV1(readiness), label).toBe(readiness.assessmentFingerprint);
      expect(() => evidenceAuthority(intent, policy, readiness), label).toThrow(expected);
    }
  });

  it("accepts equality for upstream Plan temporal lineage when accepted B1 can produce it", () => {
    const equalityAt = "2026-05-10T12:00:00.000Z";
    const plan = canonicalPlan({
      activatedAt: equalityAt,
      updatedAt: equalityAt,
    });
    const intent = genuineIntent({
      planAssessment: planAssessment(plan),
      authoredAt: equalityAt,
    });
    const policy = genuinePolicyAssessment(intent, equalityAt);
    const readiness = genuineReadiness(intent, policy, equalityAt);

    expect(() => evidenceAuthority(intent, policy, readiness, equalityAt)).not.toThrow();
  });

  it("keeps reason-code order and fingerprints deterministic", () => {
    const first = evidenceAuthority();
    const second = evidenceAuthority();
    expect(first.evidenceProvenanceAuthority.reasonCodes).toEqual([
      "SUITABILITY_EVIDENCE_SOURCE_AUTHORITY_NOT_ACCEPTED",
      "KNOWLEDGE_EXPERIENCE_SOURCE_AUTHORITY_UNAVAILABLE",
      "FINANCIAL_SITUATION_SOURCE_AUTHORITY_UNAVAILABLE",
      "LOSS_BEARING_CAPACITY_SOURCE_AUTHORITY_UNAVAILABLE",
      "RISK_TOLERANCE_SOURCE_AUTHORITY_UNAVAILABLE",
      "EVIDENCE_RELIABILITY_AUTHORITY_NOT_ACCEPTED",
      "REGULATORY_CLASSIFICATION_SOURCE_AUTHORITY_UNRESOLVED",
      "SUSTAINABILITY_PREFERENCES_SOURCE_AUTHORITY_UNRESOLVED",
    ]);
    expect(new Set(first.evidenceProvenanceAuthority.reasonCodes).size).toBe(first.evidenceProvenanceAuthority.reasonCodes.length);
    expect(second.evidenceAuthorityFingerprint).toBe(first.evidenceAuthorityFingerprint);
    expect(hashCanonicalInvestingSuitabilityEvidenceAuthorityV1(first)).toBe(first.evidenceAuthorityFingerprint);

    const changedAuthority = evidenceAuthority(genuineIntent({
      tenant: { ...validMandateIntentInput().tenant, membershipId: "membership_changed" },
    }));
    const changedTime = evidenceAuthority(genuineIntent(), genuinePolicyAssessment(), genuineReadiness(), "2026-05-10T15:01:00.000Z");
    const changedState = clone(first) as any;
    changedState.sourceAuthority.riskTolerance.acceptedSource = "client_declaration";

    expect(changedAuthority.evidenceAuthorityFingerprint).not.toBe(first.evidenceAuthorityFingerprint);
    expect(changedTime.evidenceAuthorityFingerprint).not.toBe(first.evidenceAuthorityFingerprint);
    expect(hashCanonicalInvestingSuitabilityEvidenceAuthorityV1(changedState)).not.toBe(first.evidenceAuthorityFingerprint);
  });

  it("returns a recursively frozen closed assessment", () => {
    assertFrozenClosed(evidenceAuthority());
  });

  it("rejects symbols, non-enumerables, accessors and class instances without invoking getters", () => {
    const symbolRoot = {
      intent: clone(genuineIntent()),
      policyMethodologyAssessment: clone(genuinePolicyAssessment()),
      suitabilityReadiness: clone(genuineReadiness()),
      assessedAt: EVIDENCE_ASSESSED_AT,
    } as any;
    symbolRoot[Symbol("futureSuitability")] = { suitable: true };
    expect(() => assessCanonicalInvestingSuitabilityEvidenceAuthorityV1(symbolRoot)).toThrow(/closed_invalid/);

    const nestedSymbol = {
      intent: clone(genuineIntent()),
      policyMethodologyAssessment: clone(genuinePolicyAssessment()),
      suitabilityReadiness: clone(genuineReadiness()),
      assessedAt: EVIDENCE_ASSESSED_AT,
    } as any;
    nestedSymbol.suitabilityReadiness.evidence[Symbol("hidden")] = { decision: "BUY" };
    expect(() => assessCanonicalInvestingSuitabilityEvidenceAuthorityV1(nestedSymbol)).toThrow(/closed_invalid/);

    const nonEnumerable = {
      intent: clone(genuineIntent()),
      policyMethodologyAssessment: clone(genuinePolicyAssessment()),
      suitabilityReadiness: clone(genuineReadiness()),
      assessedAt: EVIDENCE_ASSESSED_AT,
    } as any;
    Object.defineProperty(nonEnumerable.suitabilityReadiness.evidence, "futureAuthority", {
      value: { recommendation: "BUY" },
      enumerable: false,
    });
    expect(() => assessCanonicalInvestingSuitabilityEvidenceAuthorityV1(nonEnumerable)).toThrow(/closed_invalid/);

    let getterCalls = 0;
    const accessor = {
      intent: clone(genuineIntent()),
      policyMethodologyAssessment: clone(genuinePolicyAssessment()),
      suitabilityReadiness: clone(genuineReadiness()),
      assessedAt: EVIDENCE_ASSESSED_AT,
    } as any;
    Object.defineProperty(accessor.suitabilityReadiness.knownIntent, "riskProfile", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return "Balanced";
      },
    });
    expect(() => assessCanonicalInvestingSuitabilityEvidenceAuthorityV1(accessor)).toThrow(/closed_invalid/);
    expect(getterCalls).toBe(0);

    class SuitabilityEvidenceInput {
      intent = clone(genuineIntent());
      policyMethodologyAssessment = clone(genuinePolicyAssessment());
      suitabilityReadiness = clone(genuineReadiness());
      assessedAt = EVIDENCE_ASSESSED_AT;
    }
    expect(() => assessCanonicalInvestingSuitabilityEvidenceAuthorityV1(new SuitabilityEvidenceInput() as any)).toThrow(/closed_invalid/);
  });

  it("rejects malicious, altered, sparse and accessor reason-code arrays without invoking caller-controlled behavior", () => {
    const validReasons = [...genuinePolicyAssessment().methodology.reasonCodes];

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

    const alteredPrototypeArray = [...validReasons];
    Object.setPrototypeOf(alteredPrototypeArray, Object.create(Array.prototype));
    expectArrayRejected(alteredPrototypeArray);

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

    let prototypeGetterCalls = 0;
    const getterPrototype = Object.create(Array.prototype);
    Object.defineProperty(getterPrototype, "map", {
      get() {
        prototypeGetterCalls += 1;
        throw new Error("getter_should_not_execute");
      },
    });
    const getterPrototypeArray = [...validReasons];
    Object.setPrototypeOf(getterPrototypeArray, getterPrototype);
    expectArrayRejected(getterPrototypeArray);
    expect(prototypeGetterCalls).toBe(0);

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

  it("does not infer source authority from plan, account, portfolio, legacy settings or policy surfaces", () => {
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
    const result = evidenceAuthority(intent, policy, readiness);
    const serialized = JSON.stringify(result);

    expect(result.knownIntent.riskProfile).toBe("Aggressive");
    expect(result.sourceAuthority.riskTolerance).toEqual({ availability: "UNAVAILABLE", acceptedSource: null });
    expect(result.sourceAuthority.lossBearingCapacity).toEqual({ availability: "UNAVAILABLE", acceptedSource: null });
    expect(result.sourceAuthority.financialSituation).toEqual({ availability: "UNAVAILABLE", acceptedSource: null });
    expect(result.regulatoryClassificationAuthority).toEqual({ availability: "UNRESOLVED", classification: null, source: null });
    expect(serialized).not.toContain("monthlyContribution");
    expect(serialized).not.toContain("targetAmount");
    expect(serialized).not.toContain("goal_amount");
    expect(serialized).not.toContain("user_settings");
    expect(serialized).not.toContain("currentTotal");
    expect(serialized).not.toContain("portfolioNav");
    expect(serialized).not.toContain("accountCash");
    expect(serialized).not.toContain("domicile");
    expect(serialized).not.toContain("retail");
    expect(serialized).not.toContain("professional");
    expect(serialized).not.toContain("experienced");
    expect(serialized).not.toContain("sustainability preference");
  });

  it("quarantines legacy suitability, UI, risk policy, portfolio, Trading and Research dependencies", () => {
    const moduleSource = source("lib/investing/authority/suitabilityEvidenceAuthority.ts");
    for (const forbidden of [
      "app/api/daily-bundle",
      "app/api/user-settings",
      "OfflineSetup",
      "localStorage",
      "lib/signalcore/riskPolicy",
      "deriveRiskPolicy",
      "computeSuitabilityGate",
      "suitabilityStatus",
      "user_settings",
      "investing_ui_state",
      "portfolio_items",
      "account cash",
      "holdings",
      "market quotes",
      "@/lib/trading",
      "lib/trading",
      "Research",
      "CanonicalMandateV1",
      "maxSinglePositionPct",
      "maxTop5Pct",
      "target allocation",
      "recommendation",
    ]) {
      expect(moduleSource, forbidden).not.toContain(forbidden);
    }
  });
});
