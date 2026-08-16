import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { hashCanonicalInvestingPlanAuthoringIntentV1 } from "@/lib/investing/authority/planAuthoringIntent";

type TestAuthz = {
  userId: string;
  tenantId: string;
  membershipId: string;
  role: string;
  permissions: string[];
};

type TestAccount = {
  id: string;
  userId: string;
  ownerUserId: string;
  tenantId: string;
  portfolioId: string;
  environment: string;
  status: string;
  baseCurrency: string;
};

const state = vi.hoisted(() => ({
  authz: {
    userId: "server_user",
    tenantId: "server_tenant",
    membershipId: "server_membership",
    role: "owner",
    permissions: ["investing:read", "investing:create", "investing:verify", "investing:replay"],
  } as TestAuthz,
  account: {
    id: "11111111-1111-4111-8111-111111111111",
    userId: "server_user",
    ownerUserId: "server_user",
    tenantId: "server_tenant",
    portfolioId: "server_portfolio",
    environment: "paper",
    status: "active",
    baseCurrency: "USD",
  } as TestAccount,
  requestContextError: null as unknown,
  accountAccessError: null as unknown,
  requestContextCalls: [] as Request[],
  accountAccessCalls: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/investing/server/authz", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/investing/server/authz")>();
  return {
    ...actual,
    requireInvestingRequestContext: vi.fn(async (request: Request) => {
      state.requestContextCalls.push(request);
      if (state.requestContextError) throw state.requestContextError;
      return { ...state.authz, permissions: [...state.authz.permissions] };
    }),
    requireInvestingAccountAccess: vi.fn(async (args: Record<string, unknown>) => {
      state.accountAccessCalls.push(args);
      if (state.accountAccessError) throw state.accountAccessError;
      return { ...state.account };
    }),
  };
});

const { InvestingAuthzError } = await import("@/lib/investing/server/authz");
const { resolveCanonicalInvestingPlanAuthoringIntentForRequestV1 } = await import("@/lib/investing/server/planAuthoring");

const REQUEST = new Request("http://localhost/api/investing/plan-authoring", { method: "POST" });

function rawInput(overrides: Record<string, unknown> = {}) {
  return {
    accountId: "11111111-1111-4111-8111-111111111111",
    explicitIntent: {
      objective: "growth",
      riskProfile: "Balanced",
      horizon: "Medium",
    },
    ...overrides,
  };
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

async function resolve(input: unknown = rawInput(), clock = () => "2026-07-01T12:00:00.000Z") {
  return resolveCanonicalInvestingPlanAuthoringIntentForRequestV1(REQUEST, input, { clock });
}

beforeEach(() => {
  state.authz = {
    userId: "server_user",
    tenantId: "server_tenant",
    membershipId: "server_membership",
    role: "owner",
    permissions: ["investing:read", "investing:create", "investing:verify", "investing:replay"],
  };
  state.account = {
    id: "11111111-1111-4111-8111-111111111111",
    userId: "server_user",
    ownerUserId: "server_user",
    tenantId: "server_tenant",
    portfolioId: "server_portfolio",
    environment: "paper",
    status: "active",
    baseCurrency: "USD",
  };
  state.requestContextError = null;
  state.accountAccessError = null;
  state.requestContextCalls.length = 0;
  state.accountAccessCalls.length = 0;
});

describe("server-authorized canonical plan authoring producer", () => {
  it("produces an R6-A1 artifact for a valid authenticated paper account using only server scope", async () => {
    const artifact = await resolve(rawInput());
    expect(artifact.authorityScope).toEqual({
      userId: "server_user",
      tenantId: "server_tenant",
      membershipId: "server_membership",
      portfolioId: "server_portfolio",
      accountId: "11111111-1111-4111-8111-111111111111",
      environment: "paper",
      accountBaseCurrency: "USD",
    });
  });

  it("rejects client identity extras instead of allowing them to override server scope", async () => {
    for (const key of [
      "authoredAt",
      "createdAt",
      "userId",
      "tenantId",
      "membershipId",
      "portfolioId",
      "environment",
      "accountBaseCurrency",
      "baseCurrency",
      "role",
      "permissions",
      "serverVerifiedScope",
      "authorized",
      "ownership",
    ]) {
      const input = rawInput({ [key]: "client_value" });
      await expect(resolve(input), key).rejects.toMatchObject({
        code: "investing_plan_authoring_request_input_closed_invalid",
      });
    }
    expect(state.requestContextCalls).toHaveLength(0);
    expect(state.accountAccessCalls).toHaveLength(0);
  });

  it("produces an R6-A1 artifact for a valid authenticated simulation account", async () => {
    state.account = {
      ...state.account,
      id: "22222222-2222-4222-8222-222222222222",
      portfolioId: "simulation_portfolio",
      environment: "simulation",
      baseCurrency: "GBP",
    };
    const artifact = await resolve(rawInput({ accountId: "22222222-2222-4222-8222-222222222222" }));

    expect(artifact.authorityScope.environment).toBe("simulation");
    expect(artifact.authorityScope.portfolioId).toBe("simulation_portfolio");
    expect(artifact.authorityScope.accountBaseCurrency).toBe("GBP");
    expect(artifact.explicitIntent).toEqual(rawInput().explicitIntent);
  });

  it("keeps customer intent explicit and lets accepted A1 semantics reject invalid objective, risk and horizon", async () => {
    const valid = await resolve(rawInput({
      explicitIntent: { objective: "income", riskProfile: "Aggressive", horizon: "Long" },
    }));
    expect(valid.explicitIntent).toEqual({ objective: "income", riskProfile: "Aggressive", horizon: "Long" });

    const invalidIntentCases: Array<[string, Record<string, unknown>]> = [
      ["objective", { objective: "Growth", riskProfile: "Balanced", horizon: "Medium" }],
      ["risk", { objective: "growth", riskProfile: "balanced", horizon: "Medium" }],
      ["horizon", { objective: "growth", riskProfile: "Balanced", horizon: "36" }],
      ["numeric horizon", { objective: "growth", riskProfile: "Balanced", horizon: 36 }],
      ["timeframe horizon", { objective: "growth", riskProfile: "Balanced", horizon: "36 months" }],
    ];
    for (const [label, explicitIntent] of invalidIntentCases) {
      await expect(resolve(rawInput({ explicitIntent })), label).rejects.toThrow(
        /objective_invalid|risk_profile_invalid|horizon_invalid/,
      );
    }
  });

  it("rejects timeframeMonths and other extra explicitIntent fields before authorization", async () => {
    for (const explicitIntent of [
      { objective: "growth", riskProfile: "Balanced", horizon: "Medium", timeframeMonths: 36 },
      { objective: "growth", riskProfile: "Balanced" },
    ]) {
      await expect(resolve(rawInput({ explicitIntent }))).rejects.toMatchObject({
        code: "investing_plan_authoring_explicit_intent_closed_invalid",
      });
    }
    expect(state.requestContextCalls).toHaveLength(0);
    expect(state.accountAccessCalls).toHaveLength(0);
  });

  it("generates authoredAt from server time and rejects client authoredAt", async () => {
    const artifact = await resolve(rawInput(), () => "2026-07-02T03:04:05.006Z");
    expect(artifact.authoredAt).toBe("2026-07-02T03:04:05.006Z");

    await expect(resolve(rawInput({ authoredAt: "1999-01-01T00:00:00.000Z" }))).rejects.toMatchObject({
      code: "investing_plan_authoring_request_input_closed_invalid",
    });
  });

  it("requires accountId and rejects malformed UUID selectors before account lookup", async () => {
    await expect(resolve({ explicitIntent: rawInput().explicitIntent })).rejects.toMatchObject({
      code: "investing_plan_authoring_request_input_closed_invalid",
    });

    for (const accountId of [
      "",
      " account ",
      "ACCOUNT",
      "11111111-1111-4111-8111-111111111111 ",
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa".toUpperCase(),
      "11111111-1111-1111-1111-111111111111",
      "not-a-uuid",
    ]) {
      await expect(resolve(rawInput({ accountId })), accountId).rejects.toMatchObject({
        code: "investing_plan_authoring_account_id_invalid",
      });
    }
    expect(state.accountAccessCalls).toHaveLength(0);
  });

  it("rejects hostile raw roots without invoking getters", async () => {
    await expect(resolve(null)).rejects.toMatchObject({ code: "investing_plan_authoring_request_input_closed_invalid" });
    await expect(resolve([rawInput()])).rejects.toMatchObject({ code: "investing_plan_authoring_request_input_closed_invalid" });

    class InputFixture {
      accountId = "11111111-1111-4111-8111-111111111111";
      explicitIntent = rawInput().explicitIntent;
    }
    await expect(resolve(new InputFixture())).rejects.toMatchObject({
      code: "investing_plan_authoring_request_input_closed_invalid",
    });

    const prototypeInput = rawInput();
    Object.setPrototypeOf(prototypeInput, { hidden: true });
    await expect(resolve(prototypeInput)).rejects.toMatchObject({
      code: "investing_plan_authoring_request_input_closed_invalid",
    });

    const symbolInput = rawInput() as any;
    symbolInput[Symbol("hidden")] = true;
    await expect(resolve(symbolInput)).rejects.toMatchObject({
      code: "investing_plan_authoring_request_input_closed_invalid",
    });

    const nonEnumerable = rawInput();
    Object.defineProperty(nonEnumerable, "hidden", { value: true, enumerable: false });
    await expect(resolve(nonEnumerable)).rejects.toMatchObject({
      code: "investing_plan_authoring_request_input_closed_invalid",
    });

    let getterCalls = 0;
    const accessor = rawInput();
    Object.defineProperty(accessor, "accountId", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return "11111111-1111-4111-8111-111111111111";
      },
    });
    await expect(resolve(accessor)).rejects.toMatchObject({
      code: "investing_plan_authoring_request_input_closed_invalid",
    });
    expect(getterCalls).toBe(0);
  });

  it("accepts null-prototype canonical request data", async () => {
    const input = Object.assign(Object.create(null), {
      accountId: "11111111-1111-4111-8111-111111111111",
      explicitIntent: Object.assign(Object.create(null), rawInput().explicitIntent),
    });
    const artifact = await resolve(input);
    expect(artifact.authorityScope.accountId).toBe("11111111-1111-4111-8111-111111111111");
  });

  it("propagates unauthenticated request context failure fail-closed", async () => {
    state.requestContextError = new InvestingAuthzError({ code: "unauthorized", status: 401 });
    await expect(resolve()).rejects.toMatchObject({ code: "unauthorized", status: 401 });
    expect(state.accountAccessCalls).toHaveLength(0);
  });

  it("requires owner role and investing:create, with investing:read alone insufficient", async () => {
    const permissionCases: Array<[string, string, string[]]> = [
      ["non-owner", "member", ["investing:read", "investing:create"]],
      ["missing create", "owner", ["investing:read", "investing:verify"]],
      ["read alone", "owner", ["investing:read"]],
    ];
    for (const [label, role, permissions] of permissionCases) {
      state.authz = { ...state.authz, role, permissions };
      await expect(resolve(), label).rejects.toMatchObject({
        code: "investing_plan_authoring_not_authorized",
        status: 403,
      });
      expect(state.accountAccessCalls).toHaveLength(0);
      state.accountAccessCalls.length = 0;
    }
  });

  it("calls account resolver with server user and tenant, requested account selector, and active-account requirement", async () => {
    await resolve();
    expect(state.accountAccessCalls).toEqual([{
      userId: "server_user",
      tenantId: "server_tenant",
      accountId: "11111111-1111-4111-8111-111111111111",
      requireActive: true,
      route: "/api/investing/plan-authoring",
    }]);
  });

  it("treats accountId as a selector, not ownership evidence, when resolver rejects cross-user accounts", async () => {
    state.accountAccessError = new InvestingAuthzError({
      code: "investing_account_not_found_or_forbidden",
      status: 404,
    });
    await expect(resolve()).rejects.toMatchObject({
      code: "investing_account_not_found_or_forbidden",
      status: 404,
    });
  });

  it("defensively rejects forged account rows returned by an admin-capable resolver", async () => {
    const forgedRows: Array<[string, Partial<TestAccount>, string]> = [
      ["account id", { id: "22222222-2222-4222-8222-222222222222" }, "investing_plan_authoring_account_scope_mismatch"],
      ["user", { userId: "other_user" }, "investing_plan_authoring_account_scope_mismatch"],
      ["owner", { ownerUserId: "victim_user" }, "investing_plan_authoring_account_scope_mismatch"],
      ["tenant", { tenantId: "other_tenant" }, "investing_plan_authoring_account_scope_mismatch"],
      ["status", { status: "closed" }, "investing_plan_authoring_account_not_active"],
      ["live", { environment: "live" }, "investing_plan_authoring_environment_not_accepted"],
      ["unknown environment", { environment: "tracking" }, "investing_plan_authoring_environment_not_accepted"],
      ["lowercase currency", { baseCurrency: "eur" }, "investing_plan_authoring_account_base_currency_invalid"],
      ["invalid currency", { baseCurrency: "EURO" }, "investing_plan_authoring_account_base_currency_invalid"],
      ["missing currency", { baseCurrency: "" }, "investing_plan_authoring_account_base_currency_invalid"],
      ["missing portfolio", { portfolioId: "" }, "investing_plan_authoring_portfolio_id_invalid"],
      ["invalid portfolio", { portfolioId: "bad id" }, "investing_plan_authoring_portfolio_id_invalid"],
    ];
    for (const [label, patch, code] of forgedRows) {
      state.account = { ...state.account, ...patch };
      await expect(resolve(), label).rejects.toMatchObject({ code });
      state.account = {
        id: "11111111-1111-4111-8111-111111111111",
        userId: "server_user",
        ownerUserId: "server_user",
        tenantId: "server_tenant",
        portfolioId: "server_portfolio",
        environment: "paper",
        status: "active",
        baseCurrency: "USD",
      };
    }
  });

  it("does not default EUR, primary portfolio, first account, paper environment, or customer-visible authority", async () => {
    state.account = { ...state.account, portfolioId: "secondary_portfolio", environment: "simulation", baseCurrency: "CHF" };
    const artifact = await resolve();
    const serialized = JSON.stringify(artifact);

    expect(artifact.authorityScope.portfolioId).toBe("secondary_portfolio");
    expect(artifact.authorityScope.environment).toBe("simulation");
    expect(artifact.authorityScope.accountBaseCurrency).toBe("CHF");
    expect(serialized).not.toContain("primary");
    expect(serialized).not.toContain("EUR");
    for (const forbidden of ["targetAmount", "return", "expectedReturn", "probability", "recommendedPositionPct"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("preserves the accepted R6-A1 unavailable contract, fingerprint, and deep freeze", async () => {
    const artifact = await resolve();
    expect(artifact.contractVersion).toBe("canonical-investing-plan-authoring-intent/v1");
    expect(hashCanonicalInvestingPlanAuthoringIntentV1(artifact)).toBe(artifact.authoringFingerprint);
    expect(artifact.constraintAuthoring).toEqual({ availability: "UNAVAILABLE", declarations: null });
    expect(artifact.financialMethodology.authority).toBe("NOT_ACCEPTED");
    expect(artifact.suitability.authority).toBe("NOT_ACCEPTED");
    expect(artifact.mandateEligibility).toBe(false);
    expect(artifact.recommendationEligibility).toBe(false);
    expect(artifact.runtimeActivationEligibility).toBe(false);
    assertFrozenClosed(artifact);
  });

  it("does not embed current authorization, serverVerified, ownership, or future auth proof into the artifact", async () => {
    const serialized = JSON.stringify(await resolve());
    expect(serialized).not.toContain("currentAuthorization");
    expect(serialized).not.toContain("serverVerified");
    expect(serialized).not.toContain("authorized");
    expect(serialized).not.toContain("ownership");
  });

  it("keeps the producer away from Plan writes, DB mutation, Supabase admin clients, and downstream authority surfaces", () => {
    const moduleSource = source("lib/investing/server/planAuthoring.ts");
    for (const forbidden of [
      ".from(\"plans\")",
      ".from('plans')",
      ".insert(",
      ".update(",
      ".delete(",
      ".upsert(",
      ".rpc(",
      "getSupabaseAdmin",
      "getInvestingSupabaseAdmin",
      "mandateAuthority",
      "mandateAuthorityComposition",
      "engineMandateAdapterReadiness",
      "recommendationSuitabilityAuthority",
      "suitabilityReadiness",
      "suitabilityEvidenceAuthority",
      "policyMethodology",
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
    ]) {
      expect(moduleSource, forbidden).not.toContain(forbidden);
    }
    expect(moduleSource).toContain("buildCanonicalInvestingPlanAuthoringIntentV1");
    expect(moduleSource).toContain("requireInvestingRequestContext");
    expect(moduleSource).toContain("requireInvestingAccountAccess");
  });

  it("keeps route and dashboard activation surfaces closed outside this producer", () => {
    const investingPlanRoute = source("app/api/investing/plan/route.ts");
    const plansRoute = source("app/api/plans/route.ts");
    const dailyCycle = source("lib/investing/server/dailyCycle.ts");
    const dashboard = source("lib/investing/server/dashboard.ts");

    expect(investingPlanRoute).toContain("export async function GET");
    expect(investingPlanRoute).not.toContain("export async function POST");
    expect(investingPlanRoute).not.toContain("export async function PUT");
    expect(investingPlanRoute).not.toContain("export async function PATCH");
    expect(investingPlanRoute).not.toContain("export async function DELETE");
    expect(plansRoute).toContain("investing_plan_authoring_not_accepted");
    expect(dailyCycle).toContain("investing_daily_cycle_authority_unavailable");
    expect(dashboard).toContain("function hasAcceptedCanonicalDecisionAuthority");
    expect(dashboard).toContain("return false;");
  });
});
