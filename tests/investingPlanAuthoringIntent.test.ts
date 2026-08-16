import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  CANONICAL_INVESTING_PLAN_AUTHORING_INTENT_REASON_CODES,
  buildCanonicalInvestingPlanAuthoringIntentV1,
  hashCanonicalInvestingPlanAuthoringIntentV1,
  type CanonicalInvestingPlanAuthoringIntentInputV1,
} from "@/lib/investing/authority/planAuthoringIntent";

const AUTHORED_AT = "2026-06-10T12:00:00.000Z";

function validInput(
  overrides: Partial<CanonicalInvestingPlanAuthoringIntentInputV1> = {},
): CanonicalInvestingPlanAuthoringIntentInputV1 {
  return {
    authorityScope: {
      userId: "user_123",
      tenantId: "tenant_123",
      membershipId: "membership_123",
      portfolioId: "portfolio_123",
      accountId: "account_123",
      environment: "paper",
      accountBaseCurrency: "EUR",
    },
    explicitIntent: {
      objective: "growth",
      riskProfile: "Balanced",
      horizon: "Medium",
    },
    authoredAt: AUTHORED_AT,
    ...overrides,
  };
}

function build(input = validInput()) {
  return buildCanonicalInvestingPlanAuthoringIntentV1(input);
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

describe("canonical investing plan authoring intent boundary", () => {
  it("materializes only explicit scope, explicit intent and unavailable authoring authority", () => {
    const intent = build();

    expect(intent).toEqual({
      contractVersion: "canonical-investing-plan-authoring-intent/v1",
      authorityScope: validInput().authorityScope,
      explicitIntent: validInput().explicitIntent,
      constraintAuthoring: {
        availability: "UNAVAILABLE",
        declarations: null,
      },
      financialMethodology: {
        authority: "NOT_ACCEPTED",
      },
      suitability: {
        authority: "NOT_ACCEPTED",
      },
      mandateEligibility: false,
      recommendationEligibility: false,
      runtimeActivationEligibility: false,
      reasonCodes: CANONICAL_INVESTING_PLAN_AUTHORING_INTENT_REASON_CODES,
      authoredAt: AUTHORED_AT,
      authoringFingerprint: intent.authoringFingerprint,
    });
    expect(intent.authoringFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(hashCanonicalInvestingPlanAuthoringIntentV1(intent)).toBe(intent.authoringFingerprint);
  });

  it("does not infer defaults, constraints, financial fields, suitability, mandate, recommendation or runtime authority", () => {
    const serialized = JSON.stringify(build());

    for (const forbidden of [
      "targetAmount",
      "targetCapital",
      "monthlyContribution",
      "timeframeMonths",
      "amount",
      "return",
      "expectedReturn",
      "probability",
      "score",
      "suitable",
      "recommendedPositionPct",
      "BUY",
      "SELL",
      "ENTER",
      "allowExecution",
      "serverVerifiedScope",
      "authorized",
      "ownership",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(build().constraintAuthoring.declarations).toBeNull();
  });

  it("rejects missing root, scope and explicit intent fields instead of defaulting them", () => {
    const cases: Array<[string, (input: any) => void, RegExp]> = [
      ["authorityScope", (input) => { delete input.authorityScope; }, /input_closed_invalid/],
      ["explicitIntent", (input) => { delete input.explicitIntent; }, /input_closed_invalid/],
      ["authoredAt", (input) => { delete input.authoredAt; }, /input_closed_invalid/],
      ["userId", (input) => { delete input.authorityScope.userId; }, /authority_scope_closed_invalid/],
      ["tenantId", (input) => { delete input.authorityScope.tenantId; }, /authority_scope_closed_invalid/],
      ["membershipId", (input) => { delete input.authorityScope.membershipId; }, /authority_scope_closed_invalid/],
      ["portfolioId", (input) => { delete input.authorityScope.portfolioId; }, /authority_scope_closed_invalid/],
      ["accountId", (input) => { delete input.authorityScope.accountId; }, /authority_scope_closed_invalid/],
      ["environment", (input) => { delete input.authorityScope.environment; }, /authority_scope_closed_invalid/],
      ["accountBaseCurrency", (input) => { delete input.authorityScope.accountBaseCurrency; }, /authority_scope_closed_invalid/],
      ["objective", (input) => { delete input.explicitIntent.objective; }, /explicit_intent_closed_invalid/],
      ["riskProfile", (input) => { delete input.explicitIntent.riskProfile; }, /explicit_intent_closed_invalid/],
      ["horizon", (input) => { delete input.explicitIntent.horizon; }, /explicit_intent_closed_invalid/],
    ];

    for (const [label, mutate, expected] of cases) {
      const input = clone(validInput()) as any;
      mutate(input);
      expect(() => buildCanonicalInvestingPlanAuthoringIntentV1(input), label).toThrow(expected);
    }
  });

  it("rejects unknown and case-approximated objectives, risk profiles and horizons", () => {
    const cases: Array<[string, (input: any) => void, RegExp]> = [
      ["objective unknown", (input) => { input.explicitIntent.objective = "speculation"; }, /objective_invalid/],
      ["objective case", (input) => { input.explicitIntent.objective = "Growth"; }, /objective_invalid/],
      ["objective upper", (input) => { input.explicitIntent.objective = "GROWTH"; }, /objective_invalid/],
      ["risk unknown", (input) => { input.explicitIntent.riskProfile = "Moderate"; }, /risk_profile_invalid/],
      ["risk lower", (input) => { input.explicitIntent.riskProfile = "balanced"; }, /risk_profile_invalid/],
      ["risk upper", (input) => { input.explicitIntent.riskProfile = "BALANCED"; }, /risk_profile_invalid/],
      ["horizon unknown", (input) => { input.explicitIntent.horizon = "VeryLong"; }, /horizon_invalid/],
      ["horizon lower", (input) => { input.explicitIntent.horizon = "medium"; }, /horizon_invalid/],
      ["horizon upper", (input) => { input.explicitIntent.horizon = "MEDIUM"; }, /horizon_invalid/],
    ];

    for (const [label, mutate, expected] of cases) {
      const input = clone(validInput()) as any;
      mutate(input);
      expect(() => buildCanonicalInvestingPlanAuthoringIntentV1(input), label).toThrow(expected);
    }
  });

  it("rejects timeframe-style horizon inputs and future duration aliases", () => {
    const cases: Array<[string, (input: any) => void, RegExp]> = [
      ["numeric horizon", (input) => { input.explicitIntent.horizon = 36; }, /horizon_invalid/],
      ["36 string", (input) => { input.explicitIntent.horizon = "36"; }, /horizon_invalid/],
      ["36 months", (input) => { input.explicitIntent.horizon = "36 months"; }, /horizon_invalid/],
      ["months extra", (input) => { input.explicitIntent.months = 36; }, /explicit_intent_closed_invalid/],
      ["years extra", (input) => { input.explicitIntent.years = 3; }, /explicit_intent_closed_invalid/],
      ["timeframeMonths extra", (input) => { input.explicitIntent.timeframeMonths = 36; }, /explicit_intent_closed_invalid/],
    ];

    for (const [label, mutate, expected] of cases) {
      const input = clone(validInput()) as any;
      mutate(input);
      expect(() => buildCanonicalInvestingPlanAuthoringIntentV1(input), label).toThrow(expected);
    }
  });

  it("accepts only paper or simulation environments and exact uppercase ISO account currency", () => {
    expect(build(validInput({ authorityScope: { ...validInput().authorityScope, environment: "simulation" } })).authorityScope.environment)
      .toBe("simulation");

    for (const [label, value] of [
      ["trading", "trading"],
      ["live", "live"],
      ["upper paper", "PAPER"],
      ["lower currency", "eur"],
      ["long currency", "EURO"],
      ["short currency", "EU"],
      ["missing currency", ""],
    ]) {
      const input = clone(validInput()) as any;
      if (label.includes("currency")) input.authorityScope.accountBaseCurrency = value;
      else input.authorityScope.environment = value;
      expect(() => buildCanonicalInvestingPlanAuthoringIntentV1(input), label)
        .toThrow(/environment_invalid|account_base_currency_invalid/);
    }
  });

  it("requires normalized canonical authoredAt and never normalizes caller timestamps", () => {
    for (const authoredAt of [
      "2026-06-10T12:00:00+01:00",
      "2026-06-10T12:00:00Z",
      "2026-06-10 12:00:00.000Z",
      "not-a-date",
      123,
    ]) {
      const input = clone(validInput()) as any;
      input.authoredAt = authoredAt;
      expect(() => buildCanonicalInvestingPlanAuthoringIntentV1(input), String(authoredAt))
        .toThrow(/authored_at_invalid|canonical_timestamp/);
    }
  });

  it("rejects extra root, authorityScope and explicitIntent fields", () => {
    const cases: Array<[string, (input: any) => void, RegExp]> = [
      ["root", (input) => { input.futureAuthoring = { targetAmount: 1000 }; }, /input_closed_invalid/],
      ["scope", (input) => { input.authorityScope.role = "owner"; }, /authority_scope_closed_invalid/],
      ["intent", (input) => { input.explicitIntent.targetReturn = "10%"; }, /explicit_intent_closed_invalid/],
    ];

    for (const [label, mutate, expected] of cases) {
      const input = clone(validInput()) as any;
      mutate(input);
      expect(() => buildCanonicalInvestingPlanAuthoringIntentV1(input), label).toThrow(expected);
    }
  });

  it("rejects symbols and non-enumerable properties at every data boundary", () => {
    const symbolRoot = clone(validInput()) as any;
    symbolRoot[Symbol("hidden")] = "x";
    expect(() => buildCanonicalInvestingPlanAuthoringIntentV1(symbolRoot)).toThrow(/input_closed_invalid/);

    const symbolScope = clone(validInput()) as any;
    symbolScope.authorityScope[Symbol("tenantAuthority")] = "x";
    expect(() => buildCanonicalInvestingPlanAuthoringIntentV1(symbolScope)).toThrow(/authority_scope_closed_invalid/);

    const symbolIntent = clone(validInput()) as any;
    symbolIntent.explicitIntent[Symbol("decision")] = "BUY";
    expect(() => buildCanonicalInvestingPlanAuthoringIntentV1(symbolIntent)).toThrow(/explicit_intent_closed_invalid/);

    const nonEnumerable = clone(validInput()) as any;
    Object.defineProperty(nonEnumerable.explicitIntent, "futureAuthority", {
      value: { allowExecution: true },
      enumerable: false,
    });
    expect(() => buildCanonicalInvestingPlanAuthoringIntentV1(nonEnumerable)).toThrow(/explicit_intent_closed_invalid/);
  });

  it("rejects accessors without invoking getters", () => {
    let rootGetterCalls = 0;
    const rootAccessor = clone(validInput()) as any;
    Object.defineProperty(rootAccessor, "authoredAt", {
      enumerable: true,
      get() {
        rootGetterCalls += 1;
        return AUTHORED_AT;
      },
    });
    expect(() => buildCanonicalInvestingPlanAuthoringIntentV1(rootAccessor)).toThrow(/input_closed_invalid/);
    expect(rootGetterCalls).toBe(0);

    let scopeGetterCalls = 0;
    const scopeAccessor = clone(validInput()) as any;
    Object.defineProperty(scopeAccessor.authorityScope, "accountBaseCurrency", {
      enumerable: true,
      get() {
        scopeGetterCalls += 1;
        return "EUR";
      },
    });
    expect(() => buildCanonicalInvestingPlanAuthoringIntentV1(scopeAccessor)).toThrow(/authority_scope_closed_invalid/);
    expect(scopeGetterCalls).toBe(0);

    let intentGetterCalls = 0;
    const intentAccessor = clone(validInput()) as any;
    Object.defineProperty(intentAccessor.explicitIntent, "objective", {
      enumerable: true,
      get() {
        intentGetterCalls += 1;
        return "growth";
      },
    });
    expect(() => buildCanonicalInvestingPlanAuthoringIntentV1(intentAccessor)).toThrow(/explicit_intent_closed_invalid/);
    expect(intentGetterCalls).toBe(0);
  });

  it("rejects class instances, arrays and unexpected prototypes but accepts null-prototype records", () => {
    class Scope {
      userId = "user_123";
      tenantId = "tenant_123";
      membershipId = "membership_123";
      portfolioId = "portfolio_123";
      accountId = "account_123";
      environment = "paper";
      accountBaseCurrency = "EUR";
    }
    const classScope = clone(validInput()) as any;
    classScope.authorityScope = new Scope();
    expect(() => buildCanonicalInvestingPlanAuthoringIntentV1(classScope)).toThrow(/authority_scope_closed_invalid/);

    const arrayIntent = clone(validInput()) as any;
    arrayIntent.explicitIntent = ["growth", "Balanced", "Medium"];
    expect(() => buildCanonicalInvestingPlanAuthoringIntentV1(arrayIntent)).toThrow(/explicit_intent_closed_invalid/);

    const alteredPrototype = clone(validInput()) as any;
    Object.setPrototypeOf(alteredPrototype.explicitIntent, { hidden: true });
    expect(() => buildCanonicalInvestingPlanAuthoringIntentV1(alteredPrototype)).toThrow(/explicit_intent_closed_invalid/);

    const nullRoot = Object.assign(Object.create(null), {
      authorityScope: Object.assign(Object.create(null), validInput().authorityScope),
      explicitIntent: Object.assign(Object.create(null), validInput().explicitIntent),
      authoredAt: AUTHORED_AT,
    });
    expect(buildCanonicalInvestingPlanAuthoringIntentV1(nullRoot as any).authoringFingerprint)
      .toBe(build().authoringFingerprint);
  });

  it("returns a recursively frozen closed artifact and frozen fixed reason codes", () => {
    const intent = build();
    assertFrozenClosed(intent);
    expect(Object.isFrozen(CANONICAL_INVESTING_PLAN_AUTHORING_INTENT_REASON_CODES)).toBe(true);
    expect(intent.reasonCodes).toEqual([
      "CANONICAL_CONSTRAINT_AUTHORING_NOT_DEFINED",
      "FINANCIAL_METHODOLOGY_AUTHORITY_NOT_ACCEPTED",
      "SUITABILITY_AUTHORITY_NOT_ACCEPTED",
      "CANONICAL_MANDATE_NOT_ELIGIBLE",
      "RECOMMENDATION_NOT_ELIGIBLE",
      "RUNTIME_ACTIVATION_NOT_ELIGIBLE",
    ]);
    expect(new Set(intent.reasonCodes).size).toBe(intent.reasonCodes.length);
    expect(() => (intent.reasonCodes as string[]).push("RUNTIME_ACTIVATION_ELIGIBLE")).toThrow();
  });

  it("keeps fingerprints deterministic and sensitive to every scoped input axis", () => {
    const first = build();
    expect(build().authoringFingerprint).toBe(first.authoringFingerprint);

    const cases: Array<[string, Partial<CanonicalInvestingPlanAuthoringIntentInputV1>]> = [
      ["objective", { explicitIntent: { ...validInput().explicitIntent, objective: "income" } }],
      ["riskProfile", { explicitIntent: { ...validInput().explicitIntent, riskProfile: "Aggressive" } }],
      ["horizon", { explicitIntent: { ...validInput().explicitIntent, horizon: "Long" } }],
      ["user", { authorityScope: { ...validInput().authorityScope, userId: "user_other" } }],
      ["tenant", { authorityScope: { ...validInput().authorityScope, tenantId: "tenant_other" } }],
      ["membership", { authorityScope: { ...validInput().authorityScope, membershipId: "membership_other" } }],
      ["portfolio", { authorityScope: { ...validInput().authorityScope, portfolioId: "portfolio_other" } }],
      ["account", { authorityScope: { ...validInput().authorityScope, accountId: "account_other" } }],
      ["environment", { authorityScope: { ...validInput().authorityScope, environment: "simulation" } }],
      ["currency", { authorityScope: { ...validInput().authorityScope, accountBaseCurrency: "USD" } }],
      ["authoredAt", { authoredAt: "2026-06-10T12:00:01.000Z" }],
    ];

    for (const [label, overrides] of cases) {
      expect(build(validInput(overrides)).authoringFingerprint, label).not.toBe(first.authoringFingerprint);
    }
  });

  it("commits the fingerprint to every material output field, including reason-code order", () => {
    const original = build();
    const cases: Array<[string, (draft: any) => void]> = [
      ["contractVersion", (draft) => { draft.contractVersion = "canonical-investing-plan-authoring-intent/v2"; }],
      ["scope user", (draft) => { draft.authorityScope.userId = "user_other"; }],
      ["intent objective", (draft) => { draft.explicitIntent.objective = "income"; }],
      ["constraint availability", (draft) => { draft.constraintAuthoring.availability = "AVAILABLE"; }],
      ["constraint declarations", (draft) => { draft.constraintAuthoring.declarations = []; }],
      ["financial methodology", (draft) => { draft.financialMethodology.authority = "ACCEPTED"; }],
      ["suitability", (draft) => { draft.suitability.authority = "ACCEPTED"; }],
      ["mandate", (draft) => { draft.mandateEligibility = true; }],
      ["recommendation", (draft) => { draft.recommendationEligibility = true; }],
      ["runtime", (draft) => { draft.runtimeActivationEligibility = true; }],
      ["reason subset", (draft) => { draft.reasonCodes = draft.reasonCodes.slice(1); }],
      ["reason reordered", (draft) => { draft.reasonCodes = [...draft.reasonCodes].reverse(); }],
      ["authoredAt", (draft) => { draft.authoredAt = "2026-06-10T12:00:01.000Z"; }],
    ];

    for (const [label, mutate] of cases) {
      const draft = clone(original) as any;
      delete draft.authoringFingerprint;
      mutate(draft);
      expect(hashCanonicalInvestingPlanAuthoringIntentV1(draft), label).not.toBe(original.authoringFingerprint);
    }
  });

  it("documents that fingerprint lineage is not tenant authorization or current ownership proof", () => {
    const moduleSource = source("lib/investing/authority/planAuthoringIntent.ts");
    const serialized = JSON.stringify(build());

    expect(moduleSource).toContain("this fingerprint is not authentication or authorization");
    expect(moduleSource).toContain("accountBaseCurrency from server-verified Investing account scope, never client input");
    expect(serialized).not.toContain("serverVerifiedScope");
    expect(serialized).not.toContain("authorized");
    expect(serialized).not.toContain("ownership");
  });

  it("does not import or invoke older financial authority, runtime, UI, API, database, Trading or Research surfaces", () => {
    const moduleSource = source("lib/investing/authority/planAuthoringIntent.ts");
    for (const forbidden of [
      "mandateAuthority",
      "mandateAuthorityComposition",
      "engineMandateAdapterReadiness",
      "recommendationSuitabilityAuthority",
      "suitabilityReadiness",
      "suitabilityEvidenceAuthority",
      "Phase3C",
      "Phase3D",
      "Phase3E",
      "Phase3F",
      "runtimeAdapter",
      "bridge",
      "executionPlan",
      "customerDecision",
      "dailyCycle",
      "dashboard",
      "persistentPaper",
      "broker",
      "Trading",
      "Research Lab",
      "Supabase",
      "Clerk",
      "NextResponse",
      "getSupabase",
      "process.env",
      "Date.now",
      "new Date",
    ]) {
      expect(moduleSource, forbidden).not.toContain(forbidden);
    }
  });

  it("keeps route and dashboard activation surfaces closed outside this contract", () => {
    const investingPlanRoute = source("app/api/investing/plan/route.ts");
    const plansRoute = source("app/api/plans/route.ts");
    const dailyCycle = source("lib/investing/server/dailyCycle.ts");
    const dashboard = source("lib/investing/server/dashboard.ts");

    expect(investingPlanRoute).toContain("export async function GET");
    expect(investingPlanRoute).not.toContain("export async function POST");
    expect(plansRoute).toContain("investing_plan_authoring_not_accepted");
    expect(dailyCycle).toContain("investing_daily_cycle_authority_unavailable");
    expect(dashboard).toContain("function hasAcceptedCanonicalDecisionAuthority");
    expect(dashboard).toContain("return false;");
  });
});
