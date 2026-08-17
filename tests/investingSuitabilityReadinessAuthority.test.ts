import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  CANONICAL_INVESTING_SUITABILITY_READINESS_REASON_CODES,
  assessCanonicalInvestingSuitabilityReadinessV1,
  hashCanonicalInvestingSuitabilityReadinessV1,
} from "@/lib/investing/authority/suitabilityReadiness";
import {
  assessCanonicalInvestingPolicyMethodologyV1,
  hashCanonicalInvestingPolicyMethodologyAssessmentV1,
} from "@/lib/investing/authority/policyMethodology";
import {
  sealCanonicalInvestingMandateIntentV1,
  type CanonicalInvestingMandateIntentInputV1,
} from "@/lib/investing/authority/mandateIntent";
import { assessCanonicalPlanToMandateTranslationV1 } from "@/lib/investing/authority/planToMandateTranslation";
import {
  INVESTING_TECHNICAL_POLICY_DEFINITION_HASH_V1,
  TECHNICAL_INVESTING_POLICY_VERSION_V1,
} from "@/lib/investing/engine/v1/phase3d";
import type { CanonicalInvestingPlan } from "@/lib/investing/server/plan";

const AUTHORED_AT = "2026-05-10T12:00:00.000Z";
const POLICY_ASSESSED_AT = "2026-05-10T13:00:00.000Z";
const SUITABILITY_ASSESSED_AT = "2026-05-10T14:00:00.000Z";

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

function readiness(
  intent = genuineIntent(),
  policyMethodologyAssessment = genuinePolicyAssessment(intent),
  assessedAt = SUITABILITY_ASSESSED_AT,
) {
  return assessCanonicalInvestingSuitabilityReadinessV1({
    intent,
    policyMethodologyAssessment,
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

function expectMethodologyReasonCodesRejected(reasonCodes: unknown, pattern: RegExp = /methodology_reason_codes_invalid/) {
  const intent = genuineIntent();
  const assessment = clone(genuinePolicyAssessment(intent)) as any;
  assessment.methodology.reasonCodes = reasonCodes;
  expect(() => readiness(intent, assessment)).toThrow(pattern);
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

describe("canonical suitability readiness authority boundary", () => {
  it("produces the B2B1 readiness object from genuine accepted B1 and B2A while remaining unavailable", () => {
    const intent = genuineIntent();
    const policyMethodologyAssessment = genuinePolicyAssessment(intent);
    const result = readiness(intent, policyMethodologyAssessment);

    expect(result.contractVersion).toBe("canonical-investing-suitability-readiness/v1");
    expect(result.authority).toEqual(intent.authority);
    expect(result.lineage).toEqual({
      planId: intent.plan.planId,
      planVersion: intent.plan.planVersion,
      activatedAt: intent.plan.activatedAt,
      updatedAt: intent.plan.updatedAt,
      structuredSchemaVersion: intent.plan.structuredSchemaVersion,
      planSemanticFingerprint: intent.plan.semanticFingerprint,
      intentFingerprint: intent.lineage.intentFingerprint,
      policyMethodologyAssessmentFingerprint: policyMethodologyAssessment.assessmentFingerprint,
    });
    expect(result.knownIntent).toEqual(intent.intent);
    expect(result.evidence).toEqual({
      knowledgeExperience: { availability: "UNAVAILABLE", source: null, asOf: null },
      financialSituation: { availability: "UNAVAILABLE", source: null, asOf: null },
      lossBearingCapacity: { availability: "UNAVAILABLE", source: null, asOf: null },
      riskTolerance: { availability: "UNAVAILABLE", source: null, asOf: null },
      sustainabilityPreferences: { availability: "APPLICABILITY_UNRESOLVED", source: null, asOf: null },
    });
    expect(result.reliability).toEqual({ availability: "UNAVAILABLE", methodology: null });
    expect(result.regulatoryApplicability).toEqual({ availability: "UNRESOLVED", classification: null });
    expect(result.readiness).toEqual({
      availability: "UNAVAILABLE",
      reasonCodes: CANONICAL_INVESTING_SUITABILITY_READINESS_REASON_CODES,
    });
    expect(result.assessmentFingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it("never infers suitability evidence from B1 intent, plan goal fields, account currency, cash or portfolio facts", () => {
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
    const result = readiness(intent);
    const serialized = JSON.stringify(result);

    expect(result.knownIntent.riskProfile).toBe("Aggressive");
    expect(result.knownIntent.horizon).toBe("Long");
    expect(result.evidence.riskTolerance).toEqual({ availability: "UNAVAILABLE", source: null, asOf: null });
    expect(result.evidence.lossBearingCapacity).toEqual({ availability: "UNAVAILABLE", source: null, asOf: null });
    expect(result.evidence.financialSituation).toEqual({ availability: "UNAVAILABLE", source: null, asOf: null });
    expect(result.evidence.knowledgeExperience).toEqual({ availability: "UNAVAILABLE", source: null, asOf: null });
    expect(result.evidence.sustainabilityPreferences).toEqual({
      availability: "APPLICABILITY_UNRESOLVED",
      source: null,
      asOf: null,
    });
    expect(result.regulatoryApplicability.classification).toBeNull();
    expect(serialized).not.toContain("monthlyContribution");
    expect(serialized).not.toContain("targetAmount");
    expect(serialized).not.toContain("portfolioNav");
    expect(serialized).not.toContain("accountCash");
    expect(serialized).not.toContain("experienced");
    expect(serialized).not.toContain("retail");
    expect(serialized).not.toContain("professional");
    expect(serialized).not.toContain("suitable");
    expect(serialized).not.toContain("score");
  });

  it("recomputes B1 and B2A fingerprints and rejects forged or tampered material", () => {
    const forgedIntent = clone(genuineIntent()) as any;
    forgedIntent.lineage.intentFingerprint = "0".repeat(64);
    expect(() => readiness(forgedIntent)).toThrow(/intent_fingerprint_mismatch/);

    const tamperedIntent = clone(genuineIntent()) as any;
    tamperedIntent.intent.riskProfile = "Conservative";
    expect(() => readiness(tamperedIntent)).toThrow(/intent_fingerprint_mismatch/);

    const intent = genuineIntent();
    const forgedAssessment = clone(genuinePolicyAssessment(intent)) as any;
    forgedAssessment.assessmentFingerprint = "0".repeat(64);
    expect(() => readiness(intent, forgedAssessment)).toThrow(/policy_methodology_fingerprint_mismatch/);

    const tamperedAssessment = clone(genuinePolicyAssessment(intent)) as any;
    tamperedAssessment.intent.declaredIntent.horizon = "Long";
    expect(() => readiness(intent, tamperedAssessment)).toThrow(/policy_methodology_fingerprint_mismatch/);
  });

  it("rejects every exact B1/B2A lineage mismatch even when the B2A fingerprint is internally valid", () => {
    const cases: Array<[string, (assessment: any) => void, RegExp]> = [
      ["user", (assessment) => { assessment.intent.authority.userId = "user_other"; }, /user_mismatch/],
      ["tenant", (assessment) => { assessment.intent.authority.tenantId = "tenant_other"; }, /tenant_mismatch/],
      ["membership", (assessment) => { assessment.intent.authority.membershipId = "membership_other"; }, /membership_mismatch/],
      ["portfolio", (assessment) => { assessment.intent.authority.portfolioId = "portfolio_other"; }, /portfolio_mismatch/],
      ["account", (assessment) => { assessment.intent.authority.accountId = "account_other"; }, /account_mismatch/],
      ["environment", (assessment) => { assessment.intent.authority.environment = "simulation"; }, /environment_mismatch/],
      ["currency", (assessment) => { assessment.intent.authority.accountBaseCurrency = "USD"; }, /currency_mismatch/],
      ["planId", (assessment) => { assessment.intent.plan.planId = "plan_other"; }, /plan_id_mismatch/],
      ["planVersion", (assessment) => { assessment.intent.plan.planVersion = 8; }, /plan_version_mismatch/],
      ["activatedAt", (assessment) => { assessment.intent.plan.activatedAt = "2026-05-10T10:01:00.000Z"; }, /plan_activated_at_mismatch/],
      ["updatedAt", (assessment) => { assessment.intent.plan.updatedAt = "2026-05-10T11:01:00.000Z"; }, /plan_updated_at_mismatch/],
      ["schema", (assessment) => { assessment.intent.plan.structuredSchemaVersion = 2; }, /plan_schema_invalid|plan_schema_mismatch/],
      ["semantic", (assessment) => { assessment.intent.plan.semanticFingerprint = "0".repeat(64); }, /plan_semantic_fingerprint_mismatch/],
      ["objective", (assessment) => { assessment.intent.declaredIntent.objective = "income"; }, /objective_mismatch/],
      ["riskProfile", (assessment) => { assessment.intent.declaredIntent.riskProfile = "Conservative"; }, /risk_profile_mismatch/],
      ["horizon", (assessment) => { assessment.intent.declaredIntent.horizon = "Long"; }, /horizon_mismatch/],
      ["intentFingerprint", (assessment) => { assessment.intent.intentFingerprint = "0".repeat(64); }, /intent_fingerprint_lineage_mismatch/],
    ];

    for (const [label, mutate, expected] of cases) {
      const intent = genuineIntent();
      const assessment = clone(genuinePolicyAssessment(intent)) as any;
      mutate(assessment);
      if (label !== "schema") recomputePolicyAssessmentFingerprint(assessment);
      expect(() => readiness(intent, assessment), label).toThrow(expected);
    }
  });

  it("requires the exact B2A unavailable technical policy methodology state", () => {
    const cases: Array<[string, (assessment: any) => void, RegExp]> = [
      ["policy version", (assessment) => { assessment.technicalPolicyIdentity.policyVersion = "risk-policy/v2"; }, /technical_policy_version_invalid/],
      ["definition hash", (assessment) => { assessment.technicalPolicyIdentity.definitionHash = "0".repeat(64); }, /technical_policy_definition_hash_invalid/],
      ["classification", (assessment) => { assessment.technicalPolicyIdentity.classification = "FINANCIAL_POLICY"; }, /technical_policy_classification_invalid/],
      ["financial authority", (assessment) => { assessment.technicalPolicyIdentity.financialAuthority = "ACCEPTED"; }, /technical_policy_financial_authority_invalid/],
      ["available methodology", (assessment) => { assessment.methodology.availability = "AVAILABLE"; }, /methodology_availability_invalid/],
      ["specification", (assessment) => { assessment.methodology.specification = { rules: [] }; }, /methodology_specification_invalid/],
      ["declarations", (assessment) => { assessment.methodology.declarations = []; }, /methodology_declarations_invalid/],
      ["reason order", (assessment) => { assessment.methodology.reasonCodes = ["ENGINE_TECHNICAL_POLICY_NOT_FINANCIAL_AUTHORITY"]; }, /methodology_reason_codes_invalid/],
    ];

    for (const [label, mutate, expected] of cases) {
      const intent = genuineIntent();
      const assessment = clone(genuinePolicyAssessment(intent)) as any;
      mutate(assessment);
      expect(() => readiness(intent, assessment), label).toThrow(expected);
    }

    expect(genuinePolicyAssessment().technicalPolicyIdentity).toEqual({
      policyVersion: TECHNICAL_INVESTING_POLICY_VERSION_V1,
      definitionHash: INVESTING_TECHNICAL_POLICY_DEFINITION_HASH_V1,
      classification: "TECHNICAL_ENGINE_POLICY",
      financialAuthority: "NOT_ACCEPTED",
    });
  });

  it("rejects non-canonical reason-code arrays without dispatching caller-controlled map behavior", () => {
    const validReasons = [...genuinePolicyAssessment().methodology.reasonCodes];

    class EvilArray extends Array<string> {}
    expectMethodologyReasonCodesRejected(new EvilArray(...validReasons));

    let subclassMapCalls = 0;
    class EvilMapArray extends Array<string> {
      override map<U>(callbackfn: (value: string, index: number, array: string[]) => U, thisArg?: unknown): U[] {
        subclassMapCalls += 1;
        return super.map(callbackfn, thisArg);
      }
    }
    expectMethodologyReasonCodesRejected(new EvilMapArray(...validReasons));
    expect(subclassMapCalls).toBe(0);

    const alteredPrototypeArray = [...validReasons];
    Object.setPrototypeOf(alteredPrototypeArray, Object.create(Array.prototype));
    expectMethodologyReasonCodesRejected(alteredPrototypeArray);

    let prototypeMapCalls = 0;
    const mapPrototype = Object.create(Array.prototype);
    mapPrototype.map = () => {
      prototypeMapCalls += 1;
      throw new Error("should_not_execute");
    };
    const prototypeMapArray = [...validReasons];
    Object.setPrototypeOf(prototypeMapArray, mapPrototype);
    let prototypeMapError: unknown;
    try {
      expectMethodologyReasonCodesRejected(prototypeMapArray);
    } catch (error) {
      prototypeMapError = error;
    }
    expect(prototypeMapError).toBeUndefined();
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
    expectMethodologyReasonCodesRejected(getterPrototypeArray);
    expect(prototypeGetterCalls).toBe(0);

    const intent = genuineIntent();
    const canonicalAssessment = clone(genuinePolicyAssessment(intent)) as any;
    canonicalAssessment.methodology.reasonCodes = [...validReasons];
    expect(() => readiness(intent, canonicalAssessment)).not.toThrow();
  });

  it("continues to reject sparse, accessor and extra-property reason-code arrays without invoking accessors", () => {
    const validReasons = [...genuinePolicyAssessment().methodology.reasonCodes];

    const sparse = new Array(validReasons.length);
    sparse[0] = validReasons[0];
    sparse[2] = validReasons[2];
    expectMethodologyReasonCodesRejected(sparse);

    let indexGetterCalls = 0;
    const accessorIndex = [...validReasons];
    Object.defineProperty(accessorIndex, "0", {
      enumerable: true,
      get() {
        indexGetterCalls += 1;
        return validReasons[0];
      },
    });
    expectMethodologyReasonCodesRejected(accessorIndex);
    expect(indexGetterCalls).toBe(0);

    const symbolExtra = [...validReasons] as any;
    symbolExtra[Symbol("hidden")] = "X";
    expectMethodologyReasonCodesRejected(symbolExtra);

    const nonEnumerableExtra = [...validReasons];
    Object.defineProperty(nonEnumerableExtra, "hidden", {
      value: "X",
      enumerable: false,
    });
    expectMethodologyReasonCodesRejected(nonEnumerableExtra);
  });

  it("enforces explicit normalized temporal lineage and accepts equality", () => {
    const equalIntent = genuineIntent({ authoredAt: "2026-05-10T12:00:00.000Z" });
    const equalPolicy = genuinePolicyAssessment(equalIntent, "2026-05-10T12:00:00.000Z");
    expect(() => readiness(equalIntent, equalPolicy, "2026-05-10T12:00:00.000Z")).not.toThrow();

    expect(() => readiness(genuineIntent(), genuinePolicyAssessment(), "2026-05-10T12:59:59.999Z"))
      .toThrow(/temporal_lineage_invalid/);

    const authoredAfterPolicy = genuineIntent({ authoredAt: "2026-05-10T13:00:00.001Z" });
    expect(() => readiness(authoredAfterPolicy, genuinePolicyAssessment(authoredAfterPolicy, "2026-05-10T13:00:00.000Z")))
      .toThrow(/temporal_lineage_invalid/);

    expect(() => readiness(genuineIntent(), genuinePolicyAssessment(), "2026-05-10T14:00:00+01:00"))
      .toThrow(/assessed_at_invalid/);
  });

  it("keeps reason ordering and fingerprints deterministic, and commits to authority, evidence state and timestamp", () => {
    const first = readiness();
    const second = readiness();
    const changedAuthorityIntent = genuineIntent({
      tenant: { ...validMandateIntentInput().tenant, membershipId: "membership_changed" },
    });
    const changedAuthority = readiness(changedAuthorityIntent, genuinePolicyAssessment(changedAuthorityIntent));
    const changedTime = readiness(genuineIntent(), genuinePolicyAssessment(), "2026-05-10T14:01:00.000Z");
    const changedEvidence = clone(first) as any;
    changedEvidence.evidence.riskTolerance.availability = "AVAILABLE";

    expect(first.readiness.reasonCodes).toEqual([
      "RECOMMENDATION_SUITABILITY_AUTHORITY_NOT_ACCEPTED",
      "KNOWLEDGE_EXPERIENCE_EVIDENCE_UNAVAILABLE",
      "FINANCIAL_SITUATION_EVIDENCE_UNAVAILABLE",
      "LOSS_BEARING_CAPACITY_EVIDENCE_UNAVAILABLE",
      "RISK_TOLERANCE_EVIDENCE_UNAVAILABLE",
      "EVIDENCE_RELIABILITY_METHODOLOGY_NOT_ACCEPTED",
      "REGULATORY_SERVICE_CLASSIFICATION_UNRESOLVED",
      "SUSTAINABILITY_PREFERENCES_APPLICABILITY_UNRESOLVED",
    ]);
    expect(new Set(first.readiness.reasonCodes).size).toBe(first.readiness.reasonCodes.length);
    expect(second.assessmentFingerprint).toBe(first.assessmentFingerprint);
    expect(hashCanonicalInvestingSuitabilityReadinessV1(first)).toBe(first.assessmentFingerprint);
    expect(changedAuthority.assessmentFingerprint).not.toBe(first.assessmentFingerprint);
    expect(changedTime.assessmentFingerprint).not.toBe(first.assessmentFingerprint);
    expect(hashCanonicalInvestingSuitabilityReadinessV1(changedEvidence)).not.toBe(first.assessmentFingerprint);
  });

  it("rejects symbols, non-enumerables, accessors and class instances without invoking getters", () => {
    const symbolRoot = { intent: clone(genuineIntent()), policyMethodologyAssessment: clone(genuinePolicyAssessment()), assessedAt: SUITABILITY_ASSESSED_AT } as any;
    symbolRoot[Symbol("futureSuitability")] = { suitable: true };
    expect(() => assessCanonicalInvestingSuitabilityReadinessV1(symbolRoot)).toThrow(/closed_invalid/);

    const nonEnumerable = { intent: clone(genuineIntent()), policyMethodologyAssessment: clone(genuinePolicyAssessment()), assessedAt: SUITABILITY_ASSESSED_AT } as any;
    Object.defineProperty(nonEnumerable.intent.intent, "futureAuthority", {
      value: { decision: "BUY" },
      enumerable: false,
    });
    expect(() => assessCanonicalInvestingSuitabilityReadinessV1(nonEnumerable)).toThrow(/closed_invalid/);

    let getterCalls = 0;
    const accessor = { intent: clone(genuineIntent()), policyMethodologyAssessment: clone(genuinePolicyAssessment()), assessedAt: SUITABILITY_ASSESSED_AT } as any;
    Object.defineProperty(accessor.policyMethodologyAssessment.intent.declaredIntent, "riskProfile", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return "Balanced";
      },
    });
    expect(() => assessCanonicalInvestingSuitabilityReadinessV1(accessor)).toThrow(/closed_invalid/);
    expect(getterCalls).toBe(0);

    class SuitabilityInput {
      intent = clone(genuineIntent());
      policyMethodologyAssessment = clone(genuinePolicyAssessment());
      assessedAt = SUITABILITY_ASSESSED_AT;
    }
    expect(() => assessCanonicalInvestingSuitabilityReadinessV1(new SuitabilityInput() as any)).toThrow(/closed_invalid/);
  });

  it("returns a recursively frozen closed readiness assessment", () => {
    assertFrozenClosed(readiness());
  });

  it("rejects raw or future sensitive suitability evidence instead of defaulting it into the contract", () => {
    const input = {
      intent: clone(genuineIntent()),
      policyMethodologyAssessment: clone(genuinePolicyAssessment()),
      assessedAt: SUITABILITY_ASSESSED_AT,
      clientQuestionnaire: {
        knowledge: "experienced",
        income: 100000,
        liquidAssets: 250000,
        lossCapacity: "high",
      },
    } as any;
    expect(() => assessCanonicalInvestingSuitabilityReadinessV1(input)).toThrow(/input_closed_invalid/);
  });

  it("keeps daily-cycle and dashboard decision authority closed", () => {
    const dailyCycle = source("lib/investing/server/dailyCycle.ts");
    const dashboard = source("lib/investing/server/dashboard.ts");

    expect(dailyCycle).toContain("investing_daily_cycle_authority_unavailable");
    expect(dashboard).toContain("function hasAcceptedCanonicalDecisionAuthority");
    expect(dashboard).toContain("return false;");
  });

  it("quarantines legacy suitability labels, persistence, methodology defaults and Trading authority", () => {
    const moduleSource = source("lib/investing/authority/suitabilityReadiness.ts");
    const architectureSource = source("tests/investingArchitectureIsolation.test.ts");

    for (const forbidden of [
      "buildMandatePolicy",
      "lib/investing/mandate",
      "lib/investing/governance",
      "suitabilityStatus",
      "autonomyStatus",
      "executionClearance",
      "maxDeployablePct",
      "lib/investing/benchmark",
      "lib/investing/costs",
      "lib/investing/construction",
      "lib/investing/execution",
      "user_settings",
      "investing_ui_state",
      "broker_connection",
      "investing_mandate_snapshots",
      "investing_policy_v2",
      "daily_snapshot_v4",
      "OfflineSetup",
      "phase3c/authoring",
      "@/lib/trading",
      "lib/trading",
      "maxSinglePositionPct",
      "maxTop5Pct",
      "maximum_instrument_weight",
      "0.25",
      "0.35",
      "0.50",
      "55/25/10/10",
      "80/10/5/5",
      "60/40",
      "rebalance",
      "recommended allocation",
      "target portfolio",
    ]) {
      expect(moduleSource, forbidden).not.toContain(forbidden);
    }
    expect(architectureSource).toContain("investing");
  });
});
