import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  CANONICAL_INVESTING_POLICY_DECLARATION_FIELDS,
  CANONICAL_INVESTING_POLICY_METHODOLOGY_REASON_CODES,
  assessCanonicalInvestingPolicyMethodologyV1,
  hashCanonicalInvestingPolicyMethodologyAssessmentV1,
} from "@/lib/investing/authority/policyMethodology";
import {
  INVESTING_TECHNICAL_POLICY_DEFINITION_HASH_V1,
  TECHNICAL_INVESTING_POLICY_VERSION_V1,
} from "@/lib/investing/engine/v1/phase3d";
import {
  sealCanonicalInvestingMandateIntentV1,
  type CanonicalInvestingMandateIntentInputV1,
} from "@/lib/investing/authority/mandateIntent";
import { assessCanonicalPlanToMandateTranslationV1 } from "@/lib/investing/authority/planToMandateTranslation";
import type { CanonicalInvestingPlan } from "@/lib/investing/server/plan";

const ASSESSED_AT = "2026-05-10T13:00:00.000Z";

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
    authoredAt: "2026-05-10T12:00:00.000Z",
    ...overrides,
  };
}

function genuineIntent() {
  return sealCanonicalInvestingMandateIntentV1(validMandateIntentInput());
}

function assess(intent = genuineIntent(), assessedAt = ASSESSED_AT) {
  return assessCanonicalInvestingPolicyMethodologyV1({ intent, assessedAt });
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
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

describe("canonical policy methodology authority boundary", () => {
  it("assesses a genuine B1 mandate intent without creating financial methodology authority", () => {
    const intent = genuineIntent();
    const assessment = assess(intent);

    expect(assessment.contractVersion).toBe("canonical-investing-policy-methodology-assessment/v1");
    expect(assessment.intent.intentFingerprint).toBe(intent.lineage.intentFingerprint);
    expect(assessment.intent.authority).toEqual(intent.authority);
    expect(assessment.intent.plan).toEqual(intent.plan);
    expect(assessment.intent.declaredIntent).toEqual(intent.intent);
    expect(assessment.technicalPolicyIdentity).toEqual({
      policyVersion: TECHNICAL_INVESTING_POLICY_VERSION_V1,
      definitionHash: INVESTING_TECHNICAL_POLICY_DEFINITION_HASH_V1,
      classification: "TECHNICAL_ENGINE_POLICY",
      financialAuthority: "NOT_ACCEPTED",
    });
    expect(assessment.methodology).toEqual({
      availability: "UNAVAILABLE",
      reasonCodes: CANONICAL_INVESTING_POLICY_METHODOLOGY_REASON_CODES,
      specification: null,
      declarations: null,
    });
  });

  it("recomputes B1 intent fingerprints and rejects forged or tampered material", () => {
    const tamperCases: Array<[string, (intent: any) => void, RegExp | string]> = [
      ["forged fingerprint", (intent) => { intent.lineage.intentFingerprint = "0".repeat(64); }, /fingerprint_mismatch/],
      ["objective", (intent) => { intent.intent.objective = "income"; }, /fingerprint_mismatch/],
      ["risk", (intent) => { intent.intent.riskProfile = "Aggressive"; }, /fingerprint_mismatch/],
      ["horizon", (intent) => { intent.intent.horizon = "Long"; }, /fingerprint_mismatch/],
      ["account", (intent) => { intent.authority.accountId = "account_other"; }, /fingerprint_mismatch/],
      ["plan lineage", (intent) => { intent.plan.planVersion = 8; }, /fingerprint_mismatch/],
      ["policy availability", (intent) => { intent.policy.availability = "AVAILABLE"; }, /intent_policy_availability_invalid/],
      ["policy reason", (intent) => { intent.policy.reason = "accepted"; }, /intent_policy_reason_invalid/],
      ["policy declarations", (intent) => { intent.policy.declarations = []; }, /intent_policy_declarations_invalid/],
    ];

    for (const [label, mutate, expected] of tamperCases) {
      const intent = clone(genuineIntent()) as any;
      mutate(intent);
      expect(() => assessCanonicalInvestingPolicyMethodologyV1({ intent, assessedAt: ASSESSED_AT }), label)
        .toThrow(expected);
    }
  });

  it("keeps reason ordering and assessment fingerprints deterministic", () => {
    const first = assess();
    const second = assess();
    const changedLineage = assess(sealCanonicalInvestingMandateIntentV1(validMandateIntentInput({
      authoredAt: "2026-05-10T12:01:00.000Z",
    })));
    const changedTime = assess(genuineIntent(), "2026-05-10T13:01:00.000Z");

    expect(first.methodology.reasonCodes).toEqual([
      "CANONICAL_POLICY_METHODOLOGY_NOT_ACCEPTED",
      "ENGINE_TECHNICAL_POLICY_NOT_FINANCIAL_AUTHORITY",
      "PLAN_GUARDRAIL_MAPPING_NOT_ACCEPTED",
    ]);
    expect(new Set(first.methodology.reasonCodes).size).toBe(first.methodology.reasonCodes.length);
    expect(first.assessmentFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(second.assessmentFingerprint).toBe(first.assessmentFingerprint);
    expect(hashCanonicalInvestingPolicyMethodologyAssessmentV1(first)).toBe(first.assessmentFingerprint);
    expect(changedLineage.assessmentFingerprint).not.toBe(first.assessmentFingerprint);
    expect(changedTime.assessmentFingerprint).not.toBe(first.assessmentFingerprint);
    expect(() => assess(genuineIntent(), "2026-05-10T13:00:00+01:00")).toThrow(/assessed_at_invalid/);
  });

  it("rejects symbols, non-enumerables, accessors and class instances before unsafe material reads", () => {
    const symbolRoot = { intent: clone(genuineIntent()), assessedAt: ASSESSED_AT } as any;
    symbolRoot[Symbol("futureAuthority")] = { decision: "BUY" };
    expect(() => assessCanonicalInvestingPolicyMethodologyV1(symbolRoot)).toThrow(/closed_invalid/);

    const nonEnumerable = { intent: clone(genuineIntent()), assessedAt: ASSESSED_AT } as any;
    Object.defineProperty(nonEnumerable.intent.intent, "futureAuthority", {
      value: { allowExecution: true },
      enumerable: false,
    });
    expect(() => assessCanonicalInvestingPolicyMethodologyV1(nonEnumerable)).toThrow(/closed_invalid/);

    let getterCalls = 0;
    const accessor = { intent: clone(genuineIntent()), assessedAt: ASSESSED_AT } as any;
    Object.defineProperty(accessor.intent.intent, "horizon", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return "Medium";
      },
    });
    expect(() => assessCanonicalInvestingPolicyMethodologyV1(accessor)).toThrow(/closed_invalid/);
    expect(getterCalls).toBe(0);

    class IntentFixture {
      objective = "growth";
      riskProfile = "Balanced";
      horizon = "Medium";
    }
    const classInstance = { intent: clone(genuineIntent()), assessedAt: ASSESSED_AT } as any;
    classInstance.intent.intent = new IntentFixture();
    expect(() => assessCanonicalInvestingPolicyMethodologyV1(classInstance)).toThrow(/closed_invalid/);
  });

  it("returns a recursively frozen closed assessment", () => {
    assertFrozenClosed(assess());
  });

  it("defines dormant static declarations without runtime evaluation state", () => {
    expect(CANONICAL_INVESTING_POLICY_DECLARATION_FIELDS).toEqual([
      "metric",
      "scope",
      "subject",
      "kind",
      "limit",
    ]);
    for (const forbidden of ["status", "observed", "evidenceRefs", "reasonCode", "consequence"]) {
      expect(CANONICAL_INVESTING_POLICY_DECLARATION_FIELDS).not.toContain(forbidden);
    }
    expect(assess().methodology.declarations).toBeNull();
  });

  it("does not embed technical defaults, Plan guardrail mappings or legacy authority surfaces", () => {
    const policyMethodology = source("lib/investing/authority/policyMethodology.ts");
    for (const forbidden of [
      "0.25",
      "0.60",
      "0.40",
      "0.10",
      "0.90",
      "0.35",
      "0.75",
      "0.05",
      "0.95",
      "0.50",
      "0.80",
      "0.02",
      "0.98",
      "0.70",
      "maxSinglePositionPct",
      "maxTop5Pct",
      "maximum_instrument_weight",
      "buildMandatePolicy",
      "investing_policy_v2",
      "user_settings",
      "OfflineSetup",
      "daily_snapshot_v4",
      "phase3c/authoring",
      "lib/investing/mandate",
      "investing_mandate_snapshots",
    ]) {
      expect(policyMethodology).not.toContain(forbidden);
    }
  });

  it("does not let Plan guardrails create available policy methodology", () => {
    const guardedPlan = canonicalPlan({
      structured: {
        ...canonicalPlan().structured,
        guardrails: { maxSinglePositionPct: 20, maxTop5Pct: 60 },
      },
    });
    const intent = sealCanonicalInvestingMandateIntentV1(validMandateIntentInput({
      planAssessment: planAssessment(guardedPlan),
    }));
    const assessment = assess(intent);

    expect(assessment.methodology.availability).toBe("UNAVAILABLE");
    expect(assessment.methodology.specification).toBeNull();
    expect(assessment.methodology.declarations).toBeNull();
  });

  it("keeps daily-cycle and dashboard decision authority closed", () => {
    const dailyCycle = source("lib/investing/server/dailyCycle.ts");
    const dashboard = source("lib/investing/server/dashboard.ts");

    expect(dailyCycle).toContain("investing_daily_cycle_authority_unavailable");
    expect(dashboard).toContain("function hasAcceptedCanonicalDecisionAuthority");
    expect(dashboard).toContain("return false;");
  });
});
