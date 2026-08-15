import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  assessCanonicalPlanToMandateTranslationV1,
  hashCanonicalPlanSemanticsForMandateTranslationV1,
} from "@/lib/investing/authority/planToMandateTranslation";
import {
  CANONICAL_INVESTING_MANDATE_INTENT_CONTRACT_VERSION,
  hashCanonicalInvestingMandateIntentV1,
  sealCanonicalInvestingMandateIntentV1,
  type CanonicalInvestingMandateIntentInputV1,
} from "@/lib/investing/authority/mandateIntent";
import type { CanonicalInvestingPlan } from "@/lib/investing/server/plan";

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

function planAssessment(plan: CanonicalInvestingPlan = canonicalPlan(), args: { expected?: string | null; currency?: string | null } = {}) {
  return assessCanonicalPlanToMandateTranslationV1({
    planState: { availability: "AVAILABLE", reason: null, value: plan },
    accountBaseCurrency: args.currency ?? "EUR",
    expectedPlanSemanticFingerprint: args.expected,
  });
}

function validInput(overrides: Partial<CanonicalInvestingMandateIntentInputV1> = {}): CanonicalInvestingMandateIntentInputV1 {
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

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function expectRejected(mutator: (input: any) => void, pattern?: RegExp | string) {
  const input = clone(validInput()) as any;
  mutator(input);
  if (pattern) {
    expect(() => sealCanonicalInvestingMandateIntentV1(input)).toThrow(pattern);
  } else {
    expect(() => sealCanonicalInvestingMandateIntentV1(input)).toThrow();
  }
}

function expectFingerprintChange(mutator: (input: any) => void) {
  const base = sealCanonicalInvestingMandateIntentV1(validInput());
  const input = clone(validInput()) as any;
  mutator(input);
  const changed = sealCanonicalInvestingMandateIntentV1(input);
  expect(changed.lineage.intentFingerprint).not.toBe(base.lineage.intentFingerprint);
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

describe("canonical mandate intent contract", () => {
  it("seals deterministic explicit mandate intent without creating a canonical mandate", () => {
    const first = sealCanonicalInvestingMandateIntentV1(validInput());
    const second = sealCanonicalInvestingMandateIntentV1(validInput());

    expect(first.contractVersion).toBe(CANONICAL_INVESTING_MANDATE_INTENT_CONTRACT_VERSION);
    expect(first.lineage.intentFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(second.lineage.intentFingerprint).toBe(first.lineage.intentFingerprint);
    expect(hashCanonicalInvestingMandateIntentV1(first)).toBe(first.lineage.intentFingerprint);
    expect(first.policy).toEqual({
      availability: "UNAVAILABLE",
      reason: "canonical_policy_methodology_not_accepted",
      declarations: null,
    });
    expect(JSON.stringify(first)).not.toContain("mandateSnapshotId");
    expect(JSON.stringify(first)).not.toContain('"constraints"');
  });

  it("changes the fingerprint for every material authority binding", () => {
    const changes: Array<[string, (input: any) => void]> = [
      ["userId", (input) => {
        input.tenant.userId = "user_changed";
        input.account.userId = "user_changed";
        input.account.ownerUserId = "user_changed";
      }],
      ["tenantId", (input) => {
        input.tenant.tenantId = "tenant_changed";
        input.account.tenantId = "tenant_changed";
      }],
      ["membershipId", (input) => { input.tenant.membershipId = "membership_changed"; }],
      ["portfolioId", (input) => { input.account.portfolioId = "portfolio_changed"; }],
      ["accountId", (input) => { input.account.id = "account_changed"; }],
      ["environment", (input) => { input.account.environment = "simulation"; }],
      ["accountBaseCurrency", (input) => {
        input.account.baseCurrency = "USD";
        input.planAssessment.account.baseCurrency = "USD";
        input.planAssessment.compatibleSemantics.baseCurrency = "USD";
      }],
    ];

    for (const [label, mutate] of changes) {
      expect(() => expectFingerprintChange(mutate), label).not.toThrow();
    }
  });

  it("changes the fingerprint for every material Plan lineage and intent field", () => {
    const changes: Array<[string, (input: any) => void]> = [
      ["planId", (input) => { input.planAssessment.sourcePlan.planId = "plan_changed"; }],
      ["planVersion", (input) => { input.planAssessment.sourcePlan.planVersion = 8; }],
      ["activatedAt", (input) => { input.planAssessment.sourcePlan.activatedAt = "2026-05-10T10:01:00.000Z"; }],
      ["updatedAt", (input) => { input.planAssessment.sourcePlan.updatedAt = "2026-05-10T11:01:00.000Z"; }],
      ["schema", (input) => { input.planAssessment.sourcePlan.structuredSchemaVersion = 1; input.planAssessment.sourcePlan.planId = "schema_context_changed"; }],
      ["semantic", (input) => { input.planAssessment.sourcePlan.semanticFingerprint = "0".repeat(64); }],
      ["objective", (input) => {
        const assessment = planAssessment(canonicalPlan({ structured: { ...canonicalPlan().structured, objective: { type: "income" } } }));
        input.planAssessment = assessment;
        input.intent.objective = "income";
      }],
      ["riskProfile", (input) => {
        const assessment = planAssessment(canonicalPlan({ structured: { ...canonicalPlan().structured, risk: { profile: "Aggressive" } } }));
        input.planAssessment = assessment;
        input.intent.riskProfile = "Aggressive";
      }],
      ["horizon", (input) => { input.intent.horizon = "Long"; }],
      ["authoredAt", (input) => { input.authoredAt = "2026-05-10T12:01:00.000Z"; }],
    ];

    for (const [label, mutate] of changes) {
      expect(() => expectFingerprintChange(mutate), label).not.toThrow();
    }
  });

  it("requires exact objective compatibility with the A2.3A Plan semantics", () => {
    expect(sealCanonicalInvestingMandateIntentV1(validInput()).intent.objective).toBe("growth");

    expectRejected((input) => { input.intent.objective = "income"; }, /objective_plan_mismatch/);
    for (const objective of ["Growth", "wealth", "build wealth", "aggressive growth"]) {
      expectRejected((input) => { input.intent.objective = objective; }, /objective_invalid/);
    }

    expect(() => sealCanonicalInvestingMandateIntentV1(validInput({
      planAssessment: planAssessment(canonicalPlan({ structured: { ...canonicalPlan().structured, objective: { type: "retirement" } } })),
    }))).toThrow(/OBJECTIVE_UNSUPPORTED|plan_objective_unavailable/);
  });

  it("requires exact risk compatibility with the A2.3A Plan semantics", () => {
    for (const riskProfile of ["Conservative", "Balanced", "Aggressive"] as const) {
      const plan = canonicalPlan({ structured: { ...canonicalPlan().structured, risk: { profile: riskProfile } } });
      expect(sealCanonicalInvestingMandateIntentV1(validInput({
        planAssessment: planAssessment(plan),
        intent: { ...validInput().intent, riskProfile },
      })).intent.riskProfile).toBe(riskProfile);
    }

    expectRejected((input) => { input.intent.riskProfile = "Aggressive"; }, /risk_plan_mismatch/);
    expectRejected((input) => { input.intent.riskProfile = undefined; }, /risk_invalid/);
    expectRejected((input) => { input.intent.riskProfile = "balanced"; }, /risk_invalid/);
    expect(() => sealCanonicalInvestingMandateIntentV1(validInput({
      planAssessment: planAssessment(canonicalPlan({ structured: { ...canonicalPlan().structured, risk: undefined } })),
    }))).toThrow(/RISK_PROFILE_MISSING|plan_risk_unavailable/);
  });

  it("requires explicit exact horizon and never derives it from timeframeMonths", () => {
    for (const horizon of ["Short", "Medium", "Long"] as const) {
      expect(sealCanonicalInvestingMandateIntentV1(validInput({
        intent: { ...validInput().intent, horizon },
      })).intent.horizon).toBe(horizon);
    }

    for (const horizon of [undefined, null, "short", "medium", "Long term", "120 months"]) {
      expectRejected((input) => { input.intent.horizon = horizon; }, /horizon_invalid/);
    }

    for (const months of [1, 6, 12, 47, 48, 120, 360]) {
      const assessment = planAssessment(canonicalPlan({
        structured: {
          ...canonicalPlan().structured,
          objective: { type: "growth", timeframeMonths: months },
        },
      }));
      expect(() => sealCanonicalInvestingMandateIntentV1(validInput({
        planAssessment: assessment,
        intent: { ...validInput().intent, horizon: "Long" },
      }))).not.toThrow();
      expect(() => sealCanonicalInvestingMandateIntentV1(validInput({
        planAssessment: assessment,
        intent: { ...validInput().intent, horizon: undefined as any },
      }))).toThrow(/horizon_invalid/);
    }
  });

  it("rejects stale, malformed or missing Plan semantic lineage from A2.3A", () => {
    const base = canonicalPlan();
    const staleExpected = hashCanonicalPlanSemanticsForMandateTranslationV1(
      canonicalPlan({ structured: { ...base.structured, objective: { type: "income" } } }),
    );

    expect(() => sealCanonicalInvestingMandateIntentV1(validInput({
      planAssessment: planAssessment(base, { expected: staleExpected }),
    }))).toThrow(/PLAN_SOURCE_CHANGED/);

    expect(() => sealCanonicalInvestingMandateIntentV1(validInput({
      planAssessment: planAssessment(base, { expected: "" }),
    }))).toThrow(/EXPECTED_PLAN_SEMANTIC_FINGERPRINT_INVALID/);

    expectRejected((input) => { input.planAssessment.sourcePlan.semanticFingerprint = null; }, /semantic_fingerprint_invalid/);
    expectRejected((input) => { input.planAssessment.sourcePlan.semanticFingerprint = "A".repeat(64); }, /semantic_fingerprint_invalid/);
  });

  it("rejects account and A2.3A assessment currency mismatch without falling back to Plan currencies", () => {
    expectRejected((input) => { input.planAssessment.account.baseCurrency = "USD"; }, /currency_mismatch/);
    expectRejected((input) => { input.planAssessment.compatibleSemantics.baseCurrency = "USD"; }, /assessment_currency_mismatch/);
    expectRejected((input) => { input.account.baseCurrency = "eur"; }, /account_currency_invalid/);
  });

  it("rejects tenant/account binding mismatches, inactive accounts and Live", () => {
    expectRejected((input) => { input.account.userId = "user_other"; }, /account_user_mismatch/);
    expectRejected((input) => { input.account.ownerUserId = "user_other"; }, /account_owner_mismatch/);
    expectRejected((input) => { input.account.tenantId = "tenant_other"; }, /account_tenant_mismatch/);
    expectRejected((input) => { input.account.status = "closed"; }, /account_inactive/);
    expectRejected((input) => { input.account.environment = "live"; }, /environment_invalid/);

    expect(() => sealCanonicalInvestingMandateIntentV1(validInput())).not.toThrow();
    expect(() => sealCanonicalInvestingMandateIntentV1(validInput({
      account: { ...validInput().account, environment: "simulation" },
    }))).not.toThrow();
  });

  it("enforces normalized temporal lineage and allows timestamp equality", () => {
    expect(() => sealCanonicalInvestingMandateIntentV1(validInput({
      planAssessment: {
        ...planAssessment(),
        sourcePlan: {
          ...planAssessment().sourcePlan,
          updatedAt: "2026-05-10T10:00:00.000Z",
        },
      },
      authoredAt: "2026-05-10T10:00:00.000Z",
    }))).not.toThrow();

    expectRejected((input) => { input.planAssessment.sourcePlan.activatedAt = "2026-05-10T11:00:00.001Z"; }, /temporal_lineage_invalid/);
    expectRejected((input) => { input.authoredAt = "2026-05-10T10:59:59.999Z"; }, /temporal_lineage_invalid/);
    expectRejected((input) => { input.authoredAt = "2026-05-10T12:00:00+01:00"; }, /authored_at_invalid/);
  });

  it("rejects Symbols, non-enumerables, accessors and class instances before material reads", () => {
    expectRejected((input) => { input[Symbol("futureAuthority")] = { decision: "BUY" }; }, /closed_invalid/);
    expectRejected((input) => {
      Object.defineProperty(input.intent, "futureAuthority", { value: { allowExecution: true }, enumerable: false });
    }, /closed_invalid/);

    let getterCalls = 0;
    expectRejected((input) => {
      Object.defineProperty(input.intent, "horizon", {
        enumerable: true,
        get() {
          getterCalls += 1;
          return "Medium";
        },
      });
    }, /closed_invalid/);
    expect(getterCalls).toBe(0);

    class IntentFixture {
      objective = "growth";
      riskProfile = "Balanced";
      horizon = "Medium";
    }
    expectRejected((input) => { input.intent = new IntentFixture(); }, /closed_invalid/);
  });

  it("returns a recursively frozen closed object and keeps policy declarations unavailable", () => {
    const sealed = sealCanonicalInvestingMandateIntentV1(validInput());
    assertFrozenClosed(sealed);
    expect(sealed.policy.availability).toBe("UNAVAILABLE");
    expect(sealed.policy.declarations).toBeNull();
    expect(JSON.stringify(sealed)).not.toContain("maxInstrumentWeight");
    expect(JSON.stringify(sealed)).not.toContain("maxAssetClassWeight");
    expect(JSON.stringify(sealed)).not.toContain("minimumCashWeight");
    expect(JSON.stringify(sealed)).not.toContain("maximumTotalExposure");
    expect(JSON.stringify(sealed)).not.toContain('"status":"pass"');
    expect(JSON.stringify(sealed)).not.toContain('"evidenceRefs"');
  });

  it("keeps A2.3A unavailable and dashboard decision authority closed", () => {
    const assessment = planAssessment();
    expect(assessment.availability).toBe("UNAVAILABLE");
    expect(assessment.mandate).toBeNull();
    expect(assessment.reasonCodes).toEqual(["HORIZON_EXPLICIT_AUTHORING_REQUIRED"]);

    const dashboard = read("lib/investing/server/dashboard.ts");
    expect(dashboard).toContain("function hasAcceptedCanonicalDecisionAuthority");
    expect(dashboard).toContain("return false;");
  });

  it("keeps legacy mandate, defaults, persistence and Trading authority out of the B1 contract", () => {
    const source = read("lib/investing/authority/mandateIntent.ts");

    expect(source).toContain("InvestingTenantContext");
    expect(source).toContain("InvestingAccountScope");
    for (const forbidden of [
      "@/lib/investing/mandate",
      "lib/investing/mandate",
      "phase3c/authoring",
      "OfflineSetup",
      "user_settings",
      "phase3d/policyEngine",
      "buildMandatePolicy",
      "defaultLimits",
      "investing_mandate_snapshots",
      "investing_mandate_intents",
      "investing_mandate_authoring",
      "@/lib/trading",
      "lib/trading",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });
});
