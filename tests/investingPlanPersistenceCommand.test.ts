import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  CANONICAL_INVESTING_PLAN_AUTHORING_INTENT_REASON_CODES,
  buildCanonicalInvestingPlanAuthoringIntentV1,
  hashCanonicalInvestingPlanAuthoringIntentV1,
  type CanonicalInvestingPlanAuthoringIntentInputV1,
  type CanonicalInvestingPlanAuthoringIntentV1,
} from "@/lib/investing/authority/planAuthoringIntent";
import {
  CANONICAL_INVESTING_PLAN_PERSISTENCE_COMMAND_CONTRACT_VERSION,
  CANONICAL_INVESTING_PLAN_PERSISTENCE_COMMAND_OPERATION,
  CANONICAL_INVESTING_PLAN_PERSISTENCE_FUTURE_TRANSACTION_ORDER,
  buildCanonicalInvestingPlanPersistenceCommandV1,
  hashCanonicalInvestingPlanPersistenceCommandV1,
  hashCanonicalInvestingPlanPersistenceSemanticRequestV1,
  type CanonicalInvestingPlanPersistenceExpectedHeadV1,
} from "@/lib/investing/authority/planPersistenceCommand";

const AUTHORED_AT = "2026-07-10T12:00:00.000Z";
const EXPECTED_HEAD = {
  revisionId: "abcdefab-cdef-4abc-8def-abcdefabcdef",
  revisionNumber: 7,
  authoringFingerprint: "a".repeat(64),
} satisfies NonNullable<CanonicalInvestingPlanPersistenceExpectedHeadV1>;

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function a1Input(
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

function a1(overrides: Partial<CanonicalInvestingPlanAuthoringIntentInputV1> = {}) {
  return buildCanonicalInvestingPlanAuthoringIntentV1(a1Input(overrides));
}

function command(
  overrides: {
    authoringIntent?: unknown;
    idempotencyKey?: unknown;
    expectedHead?: unknown;
  } = {},
) {
  const has = (key: string) => Object.prototype.hasOwnProperty.call(overrides, key);
  return buildCanonicalInvestingPlanPersistenceCommandV1({
    authoringIntent: (has("authoringIntent") ? overrides.authoringIntent : a1()) as CanonicalInvestingPlanAuthoringIntentV1,
    idempotencyKey: (has("idempotencyKey") ? overrides.idempotencyKey : "persist_1") as string,
    expectedHead: (has("expectedHead") ? overrides.expectedHead : null) as CanonicalInvestingPlanPersistenceExpectedHeadV1,
  });
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function rehashAuthoringIntent(intent: any) {
  const draft = clone(intent);
  delete draft.authoringFingerprint;
  intent.authoringFingerprint = hashCanonicalInvestingPlanAuthoringIntentV1(draft);
  return intent;
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

describe("canonical investing plan persistence command boundary", () => {
  it("builds the canonical unavailable append-and-advance command for null expectedHead", () => {
    const intent = a1();
    const built = command({ authoringIntent: intent });

    expect(built).toEqual({
      contractVersion: CANONICAL_INVESTING_PLAN_PERSISTENCE_COMMAND_CONTRACT_VERSION,
      operation: CANONICAL_INVESTING_PLAN_PERSISTENCE_COMMAND_OPERATION,
      scope: {
        userId: "user_123",
        tenantId: "tenant_123",
        portfolioId: "portfolio_123",
        accountId: "account_123",
        environment: "paper",
        accountBaseCurrency: "EUR",
      },
      authoringLineage: {
        membershipId: "membership_123",
        authoringContractVersion: "canonical-investing-plan-authoring-intent/v1",
        authoredAt: AUTHORED_AT,
        authoringFingerprint: intent.authoringFingerprint,
      },
      explicitIntent: {
        objective: "growth",
        riskProfile: "Balanced",
        horizon: "Medium",
      },
      authorityState: {
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
      },
      idempotency: {
        key: "persist_1",
        semanticRequestFingerprint: built.idempotency.semanticRequestFingerprint,
      },
      expectedHead: null,
      persistenceAuthority: {
        availability: "UNAVAILABLE",
        databaseWriteAuthorized: false,
      },
      commandFingerprint: built.commandFingerprint,
    });
    expect(built.idempotency.semanticRequestFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(built.commandFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(hashCanonicalInvestingPlanPersistenceCommandV1(built)).toBe(built.commandFingerprint);
    expect(JSON.stringify(built)).not.toContain("persistedAt");
    expect(JSON.stringify(built)).not.toContain("previousRevisionId");
    expect(JSON.stringify(built)).not.toContain("newRevisionNumber");
  });

  it("accepts a valid canonical expectedHead as concurrency expectation only", () => {
    const built = command({ expectedHead: EXPECTED_HEAD });
    expect(built.expectedHead).toEqual(EXPECTED_HEAD);
    expect(built.persistenceAuthority).toEqual({
      availability: "UNAVAILABLE",
      databaseWriteAuthorized: false,
    });
    expect(JSON.stringify(built)).not.toContain("currentAuthorization");
    expect(JSON.stringify(built)).not.toContain("serverVerified");
    expect(JSON.stringify(built)).not.toContain("ownershipVerified");
  });

  it("independently revalidates raw A1 contract shape and recomputed authoring fingerprint", () => {
    const intent = clone(a1()) as any;
    expect(command({ authoringIntent: intent }).authoringLineage.authoringFingerprint)
      .toBe(intent.authoringFingerprint);

    const wrongVersion = clone(intent) as any;
    wrongVersion.contractVersion = "canonical-investing-plan-authoring-intent/v2";
    wrongVersion.authoringFingerprint = hashCanonicalInvestingPlanAuthoringIntentV1({
      ...wrongVersion,
      authoringFingerprint: undefined,
    });
    expect(() => command({ authoringIntent: wrongVersion })).toThrow(/authoring_contract_version_invalid/);

    const mismatch = clone(intent) as any;
    mismatch.explicitIntent.objective = "income";
    expect(() => command({ authoringIntent: mismatch })).toThrow(/authoring_fingerprint_mismatch/);
  });

  it("rejects hostile raw A1 roots before trusting TypeScript shape", () => {
    const intent = clone(a1()) as any;
    intent.extra = true;
    expect(() => command({ authoringIntent: intent })).toThrow(/authoring_intent_closed_invalid/);

    const symbolRoot = clone(a1()) as any;
    symbolRoot[Symbol("hidden")] = true;
    expect(() => command({ authoringIntent: symbolRoot })).toThrow(/authoring_intent_closed_invalid/);

    const nonEnumerable = clone(a1()) as any;
    Object.defineProperty(nonEnumerable, "hidden", { value: true, enumerable: false });
    expect(() => command({ authoringIntent: nonEnumerable })).toThrow(/authoring_intent_closed_invalid/);

    let getterCalls = 0;
    const accessor = clone(a1()) as any;
    Object.defineProperty(accessor, "contractVersion", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return "canonical-investing-plan-authoring-intent/v1";
      },
    });
    expect(() => command({ authoringIntent: accessor })).toThrow(/authoring_intent_closed_invalid/);
    expect(getterCalls).toBe(0);

    class IntentFixture {
      contractVersion = a1().contractVersion;
      authorityScope = a1().authorityScope;
      explicitIntent = a1().explicitIntent;
      constraintAuthoring = a1().constraintAuthoring;
      financialMethodology = a1().financialMethodology;
      suitability = a1().suitability;
      mandateEligibility = false;
      recommendationEligibility = false;
      runtimeActivationEligibility = false;
      reasonCodes = a1().reasonCodes;
      authoredAt = a1().authoredAt;
      authoringFingerprint = a1().authoringFingerprint;
    }
    expect(() => command({ authoringIntent: new IntentFixture() })).toThrow(/authoring_intent_closed_invalid/);

    const prototype = clone(a1()) as any;
    Object.setPrototypeOf(prototype, { hidden: true });
    expect(() => command({ authoringIntent: prototype })).toThrow(/authoring_intent_closed_invalid/);
  });

  it("accepts null-prototype canonical records after ordinary data closure", () => {
    const intent = a1();
    const nullProtoIntent = Object.assign(Object.create(null), {
      contractVersion: intent.contractVersion,
      authorityScope: Object.assign(Object.create(null), intent.authorityScope),
      explicitIntent: Object.assign(Object.create(null), intent.explicitIntent),
      constraintAuthoring: Object.assign(Object.create(null), intent.constraintAuthoring),
      financialMethodology: Object.assign(Object.create(null), intent.financialMethodology),
      suitability: Object.assign(Object.create(null), intent.suitability),
      mandateEligibility: intent.mandateEligibility,
      recommendationEligibility: intent.recommendationEligibility,
      runtimeActivationEligibility: intent.runtimeActivationEligibility,
      reasonCodes: [...intent.reasonCodes],
      authoredAt: intent.authoredAt,
      authoringFingerprint: intent.authoringFingerprint,
    });

    expect(command({ authoringIntent: nullProtoIntent }).authoringLineage.authoringFingerprint)
      .toBe(intent.authoringFingerprint);
  });

  it("requires exact nested A1 closure", () => {
    const cases: Array<[string, (intent: any) => void, RegExp]> = [
      ["authorityScope", (intent) => { intent.authorityScope.role = "owner"; }, /authority_scope_closed_invalid/],
      ["explicitIntent", (intent) => { intent.explicitIntent.timeframeMonths = 36; }, /explicit_intent_closed_invalid/],
      ["constraintAuthoring", (intent) => { intent.constraintAuthoring.source = "client"; }, /constraint_authoring_closed_invalid/],
      ["financialMethodology", (intent) => { intent.financialMethodology.reason = "approved"; }, /financial_methodology_closed_invalid/],
      ["suitability", (intent) => { intent.suitability.reason = "approved"; }, /suitability_closed_invalid/],
    ];

    for (const [label, mutate, expected] of cases) {
      const intent = clone(a1()) as any;
      mutate(intent);
      expect(() => command({ authoringIntent: intent }), label).toThrow(expected);
    }
  });

  it("requires exact ordinary reasonCodes array semantics", () => {
    const validReasons = [...CANONICAL_INVESTING_PLAN_AUTHORING_INTENT_REASON_CODES];
    const cases: Array<[string, (intent: any) => void]> = [
      ["sparse", (intent) => {
        const reasons = [...validReasons];
        delete (reasons as any)[1];
        intent.reasonCodes = reasons;
      }],
      ["accessor index", (intent) => {
        const reasons = [...validReasons];
        Object.defineProperty(reasons, "0", {
          enumerable: true,
          get() {
            throw new Error("getter invoked");
          },
        });
        intent.reasonCodes = reasons;
      }],
      ["decorated", (intent) => {
        const reasons = [...validReasons] as any;
        reasons.future = "BUY";
        intent.reasonCodes = reasons;
      }],
      ["replaced prototype", (intent) => {
        const reasons = [...validReasons];
        Object.setPrototypeOf(reasons, { hidden: true });
        intent.reasonCodes = reasons;
      }],
      ["reordered", (intent) => {
        intent.reasonCodes = [...validReasons].reverse();
        intent.authoringFingerprint = hashCanonicalInvestingPlanAuthoringIntentV1({
          ...intent,
          authoringFingerprint: undefined,
        });
      }],
      ["duplicate", (intent) => {
        intent.reasonCodes = [validReasons[0], validReasons[0], ...validReasons.slice(2)];
        intent.authoringFingerprint = hashCanonicalInvestingPlanAuthoringIntentV1({
          ...intent,
          authoringFingerprint: undefined,
        });
      }],
    ];

    for (const [label, mutate] of cases) {
      const intent = clone(a1()) as any;
      mutate(intent);
      expect(() => command({ authoringIntent: intent }), label).toThrow(/reason_codes_invalid|fingerprint_mismatch/);
    }
  });

  it("rejects fully re-hashed forbidden A1 semantics because hash integrity is not authority", () => {
    const cases: Array<[string, (intent: any) => void, RegExp]> = [
      ["methodology", (intent) => { intent.financialMethodology.authority = "ACCEPTED"; }, /financial_methodology_authority_invalid/],
      ["suitability", (intent) => { intent.suitability.authority = "ACCEPTED"; }, /suitability_authority_invalid/],
      ["mandate", (intent) => { intent.mandateEligibility = true; }, /mandate_eligibility_invalid/],
      ["recommendation", (intent) => { intent.recommendationEligibility = true; }, /recommendation_eligibility_invalid/],
      ["runtime", (intent) => { intent.runtimeActivationEligibility = true; }, /runtime_activation_eligibility_invalid/],
      ["constraint availability", (intent) => { intent.constraintAuthoring.availability = "AVAILABLE"; }, /constraint_authoring_availability_invalid/],
      ["constraint declarations", (intent) => { intent.constraintAuthoring.declarations = []; }, /constraint_authoring_declarations_invalid/],
    ];

    for (const [label, mutate, expected] of cases) {
      const intent = clone(a1()) as any;
      mutate(intent);
      rehashAuthoringIntent(intent);
      expect(hashCanonicalInvestingPlanAuthoringIntentV1(intent), label).toBe(intent.authoringFingerprint);
      expect(() => command({ authoringIntent: intent }), label).toThrow(expected);
    }
  });

  it("validates opaque idempotency key shape without trimming, normalization or fallback", () => {
    expect(command({ idempotencyKey: "A1234567" }).idempotency.key).toBe("A1234567");
    expect(command({ idempotencyKey: `K${"a".repeat(127)}` }).idempotency.key).toHaveLength(128);

    for (const idempotencyKey of [
      "",
      "       ",
      "A123456",
      `K${"a".repeat(128)}`,
      " key12345",
      "key12345 ",
      "key/12345",
      "key?12345",
      undefined,
    ]) {
      expect(() => command({ idempotencyKey }), String(idempotencyKey)).toThrow(/idempotency_key_invalid/);
    }

    const input = {
      authoringIntent: a1(),
      expectedHead: null,
    };
    expect(() => buildCanonicalInvestingPlanPersistenceCommandV1(input as any)).toThrow(/command_input_closed_invalid/);
    expect(() => buildCanonicalInvestingPlanPersistenceCommandV1({ ...input, idempotencyKey: "persist_1", extra: true } as any))
      .toThrow(/command_input_closed_invalid/);
  });

  it("validates expectedHead as a closed optimistic concurrency expectation", () => {
    expect(command({ expectedHead: null }).expectedHead).toBeNull();
    expect(command({ expectedHead: EXPECTED_HEAD }).expectedHead).toEqual(EXPECTED_HEAD);

    const cases: Array<[string, any, RegExp]> = [
      ["malformed uuid", { revisionId: "not-a-uuid" }, /revision_id_invalid/],
      ["uppercase uuid", { revisionId: EXPECTED_HEAD.revisionId.toUpperCase() }, /revision_id_invalid/],
      ["zero", { revisionNumber: 0 }, /revision_number_invalid/],
      ["negative", { revisionNumber: -1 }, /revision_number_invalid/],
      ["float", { revisionNumber: 1.5 }, /revision_number_invalid/],
      ["string", { revisionNumber: "1" }, /revision_number_invalid/],
      ["unsafe", { revisionNumber: Number.MAX_SAFE_INTEGER + 1 }, /revision_number_invalid/],
      ["bad fingerprint", { authoringFingerprint: "abc" }, /authoring_fingerprint_invalid/],
      ["uppercase fingerprint", { authoringFingerprint: "A".repeat(64) }, /authoring_fingerprint_invalid/],
      ["extra", { active: true }, /expected_head_closed_invalid/],
    ];

    for (const [label, patch, expected] of cases) {
      expect(() => command({ expectedHead: { ...EXPECTED_HEAD, ...patch } }), label).toThrow(expected);
    }

    let getterCalls = 0;
    const accessor = { ...EXPECTED_HEAD };
    Object.defineProperty(accessor, "revisionNumber", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return 7;
      },
    });
    expect(() => command({ expectedHead: accessor })).toThrow(/expected_head_closed_invalid/);
    expect(getterCalls).toBe(0);
  });

  it("keeps semantic retry fingerprint distinct from exact command lineage", () => {
    const intentA = a1({
      authorityScope: { ...a1Input().authorityScope, membershipId: "membership_A" },
      authoredAt: "2026-07-10T12:00:00.000Z",
    });
    const intentB = a1({
      authorityScope: { ...a1Input().authorityScope, membershipId: "membership_B" },
      authoredAt: "2026-07-11T12:00:00.000Z",
    });
    const commandA = command({ authoringIntent: intentA, expectedHead: EXPECTED_HEAD, idempotencyKey: "retry_01" });
    const commandB = command({ authoringIntent: intentB, expectedHead: EXPECTED_HEAD, idempotencyKey: "retry_01" });

    expect(intentA.authoringFingerprint).not.toBe(intentB.authoringFingerprint);
    expect(commandA.commandFingerprint).not.toBe(commandB.commandFingerprint);
    expect(commandA.idempotency.semanticRequestFingerprint).toBe(commandB.idempotency.semanticRequestFingerprint);
    expect(hashCanonicalInvestingPlanPersistenceSemanticRequestV1({
      authoringIntent: intentA,
      expectedHead: EXPECTED_HEAD,
    })).toBe(commandA.idempotency.semanticRequestFingerprint);
  });

  it("keeps idempotency key out of semantic payload hash but inside command integrity", () => {
    const first = command({ idempotencyKey: "retry_01", expectedHead: EXPECTED_HEAD });
    const second = command({ idempotencyKey: "retry_02", expectedHead: EXPECTED_HEAD });

    expect(first.idempotency.semanticRequestFingerprint).toBe(second.idempotency.semanticRequestFingerprint);
    expect(first.commandFingerprint).not.toBe(second.commandFingerprint);
  });

  it("changes semanticRequestFingerprint for every material semantic axis", () => {
    const base = command({ expectedHead: EXPECTED_HEAD }).idempotency.semanticRequestFingerprint;
    const cases: Array<[string, CanonicalInvestingPlanAuthoringIntentInputV1 | null, CanonicalInvestingPlanPersistenceExpectedHeadV1]> = [
      ["user", a1Input({ authorityScope: { ...a1Input().authorityScope, userId: "user_other" } }), EXPECTED_HEAD],
      ["tenant", a1Input({ authorityScope: { ...a1Input().authorityScope, tenantId: "tenant_other" } }), EXPECTED_HEAD],
      ["portfolio", a1Input({ authorityScope: { ...a1Input().authorityScope, portfolioId: "portfolio_other" } }), EXPECTED_HEAD],
      ["account", a1Input({ authorityScope: { ...a1Input().authorityScope, accountId: "account_other" } }), EXPECTED_HEAD],
      ["environment", a1Input({ authorityScope: { ...a1Input().authorityScope, environment: "simulation" } }), EXPECTED_HEAD],
      ["currency", a1Input({ authorityScope: { ...a1Input().authorityScope, accountBaseCurrency: "USD" } }), EXPECTED_HEAD],
      ["objective", a1Input({ explicitIntent: { ...a1Input().explicitIntent, objective: "income" } }), EXPECTED_HEAD],
      ["risk", a1Input({ explicitIntent: { ...a1Input().explicitIntent, riskProfile: "Aggressive" } }), EXPECTED_HEAD],
      ["horizon", a1Input({ explicitIntent: { ...a1Input().explicitIntent, horizon: "Long" } }), EXPECTED_HEAD],
      ["head id", null, { ...EXPECTED_HEAD, revisionId: "bcdefabc-defa-4bcd-8efa-bcdefabcdefa" }],
      ["head number", null, { ...EXPECTED_HEAD, revisionNumber: 8 }],
      ["head fingerprint", null, { ...EXPECTED_HEAD, authoringFingerprint: "b".repeat(64) }],
    ];

    for (const [label, input, expectedHead] of cases) {
      const built = command({
        authoringIntent: input ? buildCanonicalInvestingPlanAuthoringIntentV1(input) : a1(),
        expectedHead,
      });
      expect(built.idempotency.semanticRequestFingerprint, label).not.toBe(base);
    }
  });

  it("recomputes commandFingerprint deterministically and changes on material command mutations", () => {
    const built = command({ expectedHead: EXPECTED_HEAD });
    expect(command({ expectedHead: EXPECTED_HEAD }).commandFingerprint).toBe(built.commandFingerprint);
    expect(hashCanonicalInvestingPlanPersistenceCommandV1(built)).toBe(built.commandFingerprint);

    const cases: Array<[string, (draft: any) => void]> = [
      ["scope", (draft) => { draft.scope.userId = "user_other"; }],
      ["membership", (draft) => { draft.authoringLineage.membershipId = "membership_other"; }],
      ["authoredAt", (draft) => { draft.authoringLineage.authoredAt = "2026-07-12T12:00:00.000Z"; }],
      ["authoring fingerprint", (draft) => { draft.authoringLineage.authoringFingerprint = "c".repeat(64); }],
      ["intent", (draft) => { draft.explicitIntent.objective = "income"; }],
      ["authority state", (draft) => { draft.authorityState.reasonCodes = [...draft.authorityState.reasonCodes].reverse(); }],
      ["idempotency key", (draft) => { draft.idempotency.key = "retry_02"; }],
      ["semantic fingerprint", (draft) => { draft.idempotency.semanticRequestFingerprint = "d".repeat(64); }],
      ["expected head", (draft) => { draft.expectedHead.revisionNumber = 8; }],
      ["persistence authority", (draft) => { draft.persistenceAuthority.databaseWriteAuthorized = true; }],
    ];

    for (const [label, mutate] of cases) {
      const draft = clone(built) as any;
      mutate(draft);
      expect(hashCanonicalInvestingPlanPersistenceCommandV1(draft), label).not.toBe(built.commandFingerprint);
    }
  });

  it("returns a deeply frozen command output", () => {
    const built = command({ expectedHead: EXPECTED_HEAD });
    assertFrozenClosed(built);
    expect(() => ((built.scope as any).userId = "user_other")).toThrow();
  });

  it("keeps A3A pure and isolated from persistence, routes and downstream authority", () => {
    const moduleSource = source("lib/investing/authority/planPersistenceCommand.ts");
    for (const forbidden of [
      "Date.now",
      "new Date",
      "Supabase",
      "getSupabaseAdmin",
      "getInvestingSupabaseAdmin",
      ".from(\"plans\")",
      ".from('plans')",
      "investing_plan_revisions",
      "investing_plan_heads",
      ".insert(",
      ".update(",
      ".delete(",
      ".upsert(",
      ".rpc(",
      "planToMandateTranslation",
      "mandateIntent",
      "policyMethodology",
      "suitabilityReadiness",
      "suitabilityEvidenceAuthority",
      "recommendationSuitabilityAuthority",
      "mandateAuthority",
      "mandateAuthorityComposition",
      "engineMandateAdapterReadiness",
      "Phase3C",
      "Phase3D",
      "Phase3E",
      "Phase3F",
      "runtimeAdapter",
      "engineV1CustomerBridge",
      "executionPlan",
      "customerDecision",
      "dailyCycle",
      "dashboard",
      "persistentPaper",
      "broker",
      "Trading",
      "Research Lab",
      "NextResponse",
    ]) {
      expect(moduleSource, forbidden).not.toContain(forbidden);
    }
  });

  it("documents future idempotency replay before expected-head conflict and fresh write authorization", () => {
    const moduleSource = source("lib/investing/authority/planPersistenceCommand.ts");
    expect(CANONICAL_INVESTING_PLAN_PERSISTENCE_FUTURE_TRANSACTION_ORDER[0]).toContain("fresh authorization");
    expect(CANONICAL_INVESTING_PLAN_PERSISTENCE_FUTURE_TRANSACTION_ORDER[2]).toContain("idempotency key");
    expect(CANONICAL_INVESTING_PLAN_PERSISTENCE_FUTURE_TRANSACTION_ORDER[3]).toContain("replay");
    expect(CANONICAL_INVESTING_PLAN_PERSISTENCE_FUTURE_TRANSACTION_ORDER[5]).toContain("expectedHead");
    expect(moduleSource.indexOf("check idempotency replay before expected-head conflict"))
      .toBeLessThan(moduleSource.indexOf("original write advances the head"));
  });

  it("keeps route, dashboard, daily-cycle and Phase3C activation surfaces closed outside A3A", () => {
    const investingPlanRoute = source("app/api/investing/plan/route.ts");
    const plansRoute = source("app/api/plans/route.ts");
    const dailyCycle = source("lib/investing/server/dailyCycle.ts");
    const dashboard = source("lib/investing/server/dashboard.ts");
    const phase3cIsolation = source("tests/investingEnginePhase3CIsolation.test.ts");

    expect(investingPlanRoute).toContain("export async function GET");
    expect(investingPlanRoute).not.toContain("export async function POST");
    expect(plansRoute).toContain("investing_plan_authoring_not_accepted");
    expect(dailyCycle).toContain("investing_daily_cycle_authority_unavailable");
    expect(dashboard).toContain("function hasAcceptedCanonicalDecisionAuthority");
    expect(dashboard).toContain("return false;");
    expect(phase3cIsolation).toContain("FASE 3C source and IO isolation");
  });
});
