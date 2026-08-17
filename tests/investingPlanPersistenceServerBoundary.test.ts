import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CanonicalInvestingPlanPersistenceCommandV1 } from "@/lib/investing/authority/planPersistenceCommand";

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

vi.mock("server-only", () => ({}));

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
const {
  parseCanonicalInvestingPlanPersistenceResultV1,
  persistCanonicalInvestingPlanForRequestV1,
} = await import("@/lib/investing/server/planPersistence");

const REQUEST = new Request("http://localhost/api/internal/investing/plan-persistence", { method: "POST" });
const EXPECTED_HEAD = {
  revisionId: "abcdefab-cdef-4abc-8def-abcdefabcdef",
  revisionNumber: 7,
  authoringFingerprint: "a".repeat(64),
};
const PERSISTED_AT = "2026-08-17T03:00:00.123456Z";

function rawInput(overrides: Record<string, unknown> = {}) {
  return {
    accountId: "11111111-1111-4111-8111-111111111111",
    explicitIntent: {
      objective: "growth",
      riskProfile: "Balanced",
      horizon: "Medium",
    },
    idempotencyKey: "persist_1",
    expectedHead: null,
    ...overrides,
  };
}

function writerResult(
  command: CanonicalInvestingPlanPersistenceCommandV1,
  status: "NEW_COMMIT" | "IDEMPOTENT_REPLAY" = "NEW_COMMIT",
) {
  return {
    contractVersion: "canonical-investing-plan-persistence-result/v1",
    status,
    scope: {
      tenantId: command.scope.tenantId,
      ownerUserId: command.scope.userId,
      portfolioId: command.scope.portfolioId,
      accountId: command.scope.accountId,
      environment: command.scope.environment,
    },
    revision: {
      id: "22222222-2222-4222-8222-222222222222",
      revisionNumber: status === "NEW_COMMIT" ? "1" : "7",
      previousRevisionId: status === "NEW_COMMIT" ? null : "33333333-3333-4333-8333-333333333333",
      authoringFingerprint: command.authoringLineage.authoringFingerprint,
      persistedAt: PERSISTED_AT,
      persistenceTxid: "9001",
    },
    head: {
      accountId: command.scope.accountId,
      currentRevisionId: "22222222-2222-4222-8222-222222222222",
      currentRevisionNumber: status === "NEW_COMMIT" ? "1" : "7",
      updatedAt: PERSISTED_AT,
    },
    idempotency: {
      key: command.idempotency.key,
      semanticRequestFingerprint: command.idempotency.semanticRequestFingerprint,
      originalCommandFingerprint: command.commandFingerprint,
      createdAt: PERSISTED_AT,
      persistenceTxid: "9001",
    },
  };
}

function databaseReturning(
  makeData: (command: CanonicalInvestingPlanPersistenceCommandV1) => unknown = (command) => writerResult(command),
) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  return {
    calls,
    database: {
      rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
        calls.push({ fn, args });
        return { data: makeData(args.p_command as CanonicalInvestingPlanPersistenceCommandV1), error: null };
      }),
    },
  };
}

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-17T03:00:00.000Z"));
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

afterEach(() => {
  vi.useRealTimers();
});

describe("server-only canonical investing Plan persistence boundary", () => {
  it("persists a valid paper request through a server-built command and fresh request user RPC identity", async () => {
    const rpc = databaseReturning();
    const result = await persistCanonicalInvestingPlanForRequestV1(REQUEST, rawInput(), { database: rpc.database });

    expect(result.status).toBe("NEW_COMMIT");
    expect(rpc.calls).toHaveLength(1);
    expect(rpc.calls[0].fn).toBe("investing_persist_canonical_plan_v1");
    expect(rpc.calls[0].args.p_authorized_user_id).toBe("server_user");

    const command = rpc.calls[0].args.p_command as CanonicalInvestingPlanPersistenceCommandV1;
    expect(command.scope).toEqual({
      userId: "server_user",
      tenantId: "server_tenant",
      portfolioId: "server_portfolio",
      accountId: "11111111-1111-4111-8111-111111111111",
      environment: "paper",
      accountBaseCurrency: "USD",
    });
    expect(command.authoringLineage.membershipId).toBe("server_membership");
    expect(command.authoringLineage.authoredAt).toBe("2026-08-17T03:00:00.000Z");
    expect(command.idempotency.key).toBe("persist_1");
    expect(command.expectedHead).toBeNull();
    expect(command.persistenceAuthority).toEqual({
      availability: "UNAVAILABLE",
      databaseWriteAuthorized: false,
    });
    expect(JSON.stringify(command)).not.toContain("expectedReturn");
    expect(command.authorityState.mandateEligibility).toBe(false);
    expect(command.authorityState.recommendationEligibility).toBe(false);
    expect(command.authorityState.runtimeActivationEligibility).toBe(false);
  });

  it("persists a valid simulation request and passes expectedHead only as optimistic concurrency evidence", async () => {
    state.account = {
      ...state.account,
      id: "44444444-4444-4444-8444-444444444444",
      portfolioId: "simulation_portfolio",
      environment: "simulation",
      baseCurrency: "GBP",
    };
    const rpc = databaseReturning((command) => writerResult(command, "IDEMPOTENT_REPLAY"));

    const result = await persistCanonicalInvestingPlanForRequestV1(
      REQUEST,
      rawInput({
        accountId: "44444444-4444-4444-8444-444444444444",
        expectedHead: EXPECTED_HEAD,
      }),
      { database: rpc.database },
    );

    const command = rpc.calls[0].args.p_command as CanonicalInvestingPlanPersistenceCommandV1;
    expect(result.status).toBe("IDEMPOTENT_REPLAY");
    expect(command.scope.environment).toBe("simulation");
    expect(command.scope.accountBaseCurrency).toBe("GBP");
    expect(command.expectedHead).toEqual(EXPECTED_HEAD);
    expect(command.expectedHead).not.toHaveProperty("authorized");
  });

  it("rejects client identity, lineage, fingerprint and authority extras before auth or RPC work", async () => {
    for (const key of [
      "userId",
      "tenantId",
      "membershipId",
      "portfolioId",
      "environment",
      "accountBaseCurrency",
      "baseCurrency",
      "role",
      "permissions",
      "authoredAt",
      "authoringFingerprint",
      "semanticRequestFingerprint",
      "commandFingerprint",
      "persistenceAuthority",
      "databaseWriteAuthorized",
      "serverVerifiedScope",
      "ownership",
      "authorized",
      "serviceRole",
      "recommendation",
      "suitability",
      "mandate",
      "targetReturn",
      "probability",
    ]) {
      const rpc = databaseReturning();
      await expect(
        persistCanonicalInvestingPlanForRequestV1(REQUEST, rawInput({ [key]: "client_value" }), {
          database: rpc.database,
        }),
        key,
      ).rejects.toMatchObject({ code: "investing_plan_persistence_server_request_input_closed_invalid" });
      expect(state.requestContextCalls, key).toHaveLength(0);
      expect(state.accountAccessCalls, key).toHaveLength(0);
      expect(rpc.calls, key).toHaveLength(0);
    }
  });

  it("rejects malformed selectors, intent, idempotency and expectedHead before RPC", async () => {
    const cases: Array<[string, unknown, string]> = [
      ["missing account", { ...rawInput(), accountId: undefined }, "investing_plan_persistence_server_account_id_invalid"],
      ["bad account", rawInput({ accountId: "not-a-uuid" }), "investing_plan_persistence_server_account_id_invalid"],
      ["bad intent", rawInput({ explicitIntent: { objective: "Growth", riskProfile: "Balanced", horizon: "Medium" } }), "investing_plan_persistence_server_objective_invalid"],
      ["bad idempotency", rawInput({ idempotencyKey: "short" }), "investing_plan_persistence_server_idempotency_key_invalid"],
      ["bad expectedHead", rawInput({ expectedHead: { ...EXPECTED_HEAD, revisionNumber: "7" } }), "investing_plan_persistence_server_expected_head_revision_number_invalid"],
      ["extra expectedHead", rawInput({ expectedHead: { ...EXPECTED_HEAD, authorizingUserId: "server_user" } }), "investing_plan_persistence_server_expected_head_closed_invalid"],
    ];

    for (const [label, input, code] of cases) {
      const rpc = databaseReturning();
      await expect(
        persistCanonicalInvestingPlanForRequestV1(REQUEST, input, { database: rpc.database }),
        label,
      ).rejects.toMatchObject({ code });
      expect(rpc.calls, label).toHaveLength(0);
    }
  });

  it("rejects hostile object shapes, accessors, inherited keys and symbol keys without invoking getters", async () => {
    const hostileInputs: unknown[] = [];
    class InputFixture {
      accountId = "11111111-1111-4111-8111-111111111111";
      explicitIntent = rawInput().explicitIntent;
      idempotencyKey = "persist_1";
      expectedHead = null;
    }
    hostileInputs.push(new InputFixture());

    const prototype = rawInput();
    Object.setPrototypeOf(prototype, { hidden: true });
    hostileInputs.push(prototype);

    const symbol = rawInput() as Record<PropertyKey, unknown>;
    symbol[Symbol("hidden")] = true;
    hostileInputs.push(symbol);

    const nonEnumerable = rawInput();
    Object.defineProperty(nonEnumerable, "hidden", { value: true, enumerable: false });
    hostileInputs.push(nonEnumerable);

    let getterCalls = 0;
    const accessor = rawInput();
    Object.defineProperty(accessor, "accountId", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return "11111111-1111-4111-8111-111111111111";
      },
    });
    hostileInputs.push(accessor);

    for (const input of hostileInputs) {
      const rpc = databaseReturning();
      await expect(
        persistCanonicalInvestingPlanForRequestV1(REQUEST, input, { database: rpc.database }),
      ).rejects.toMatchObject({ code: "investing_plan_persistence_server_request_input_closed_invalid" });
      expect(rpc.calls).toHaveLength(0);
    }
    expect(getterCalls).toBe(0);
  });

  it("maps auth failures without invoking the writer", async () => {
    const cases: Array<[string, () => void, string, number]> = [
      ["unauthenticated", () => {
        state.requestContextError = new InvestingAuthzError({ code: "unauthorized", status: 401 });
      }, "investing_plan_persistence_unauthenticated", 401],
      ["non-owner", () => {
        state.authz = { ...state.authz, role: "member" };
      }, "investing_plan_persistence_not_authorized", 403],
      ["missing create", () => {
        state.authz = { ...state.authz, permissions: ["investing:read"] };
      }, "investing_plan_persistence_not_authorized", 403],
      ["cross-user account", () => {
        state.accountAccessError = new InvestingAuthzError({
          code: "investing_account_not_found_or_forbidden",
          status: 404,
        });
      }, "investing_plan_persistence_account_not_found_or_forbidden", 404],
      ["inactive account", () => {
        state.account = { ...state.account, status: "suspended" };
      }, "investing_plan_persistence_account_not_active", 403],
      ["live account", () => {
        state.account = { ...state.account, environment: "live" };
      }, "investing_plan_persistence_environment_not_accepted", 403],
    ];

    for (const [label, mutate, code, status] of cases) {
      mutate();
      const rpc = databaseReturning();
      await expect(
        persistCanonicalInvestingPlanForRequestV1(REQUEST, rawInput(), { database: rpc.database }),
        label,
      ).rejects.toMatchObject({ code, status });
      expect(rpc.calls, label).toHaveLength(0);
      state.requestContextError = null;
      state.accountAccessError = null;
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
    }
  });

  it("maps writer conflicts and service failures fail-closed without raw database messages", async () => {
    const cases: Array<[unknown, string, number]> = [
      [{ message: "investing_plan_idempotency_payload_mismatch" }, "investing_plan_idempotency_payload_mismatch", 409],
      [{ message: "investing_plan_expected_head_conflict" }, "investing_plan_expected_head_conflict", 409],
      [{ message: "function public.investing_persist_canonical_plan_v1 does not exist" }, "investing_plan_persistence_writer_unavailable", 503],
      [{ message: "investing_plan_persistence_canonical_command_invalid" }, "investing_plan_persistence_internal_integrity_failure", 503],
      [{ message: "connection refused" }, "investing_plan_persistence_database_unavailable", 503],
    ];

    for (const [error, code, status] of cases) {
      const database = {
        rpc: vi.fn(async () => ({ data: null, error })),
      };
      await expect(
        persistCanonicalInvestingPlanForRequestV1(REQUEST, rawInput(), { database }),
      ).rejects.toMatchObject({ code, status, message: code });
    }
  });

  it("rejects malformed writer results and cross-field invariant mismatches", async () => {
    const validRpc = databaseReturning();
    await persistCanonicalInvestingPlanForRequestV1(REQUEST, rawInput(), { database: validRpc.database });
    const command = validRpc.calls[0].args.p_command as CanonicalInvestingPlanPersistenceCommandV1;

    for (const mutate of [
      (result: any) => { result.extra = true; },
      (result: any) => { result.scope.ownerUserId = "other_user"; },
      (result: any) => { result.revision.authoringFingerprint = "b".repeat(64); },
      (result: any) => { result.head.currentRevisionId = "33333333-3333-4333-8333-333333333333"; },
      (result: any) => { result.idempotency.originalCommandFingerprint = "c".repeat(64); },
      (result: any) => { result.idempotency.persistenceTxid = "9002"; },
      (result: any) => { result.idempotency.createdAt = "2026-08-17T03:00:00.999999Z"; },
    ]) {
      const result = writerResult(command);
      mutate(result);
      expect(() => parseCanonicalInvestingPlanPersistenceResultV1(result, command, "server_user"))
        .toThrow(/investing_plan_persistence_result_/);
    }
  });

  it("accepts idempotent replay with the original persisted authoring and command lineage", async () => {
    const validRpc = databaseReturning();
    await persistCanonicalInvestingPlanForRequestV1(REQUEST, rawInput(), { database: validRpc.database });
    const command = validRpc.calls[0].args.p_command as CanonicalInvestingPlanPersistenceCommandV1;
    const result = writerResult(command, "IDEMPOTENT_REPLAY");
    result.revision.authoringFingerprint = "b".repeat(64);
    result.idempotency.originalCommandFingerprint = "c".repeat(64);

    const parsed = parseCanonicalInvestingPlanPersistenceResultV1(result, command, "server_user");
    expect(parsed.status).toBe("IDEMPOTENT_REPLAY");
    expect(parsed.revision.authoringFingerprint).toBe("b".repeat(64));
    expect(parsed.idempotency.originalCommandFingerprint).toBe("c".repeat(64));
  });

  it("keeps the server boundary isolated from routes, legacy Plan writes and downstream financial authority", () => {
    const moduleSource = source("lib/investing/server/planPersistence.ts");
    const workflowSource = source(".github/workflows/investing-postgres.yml");

    for (const forbidden of [
      "NextResponse",
      "app/api",
      "lib/investing/server/plan.ts",
      "public.plans",
      ".from(\"plans\")",
      ".from('plans')",
      ".insert(",
      ".update(",
      ".delete(",
      ".upsert(",
      "mandateAuthority",
      "recommendationSuitabilityAuthority",
      "engineMandateAdapterReadiness",
      "executionPlan",
      "customerDecision",
      "persistentPaper",
      "broker",
    ]) {
      expect(moduleSource, forbidden).not.toContain(forbidden);
    }
    expect(moduleSource).toContain("resolveCanonicalInvestingPlanAuthoringServerResolutionForRequestV1");
    expect(moduleSource).toContain("buildCanonicalInvestingPlanPersistenceCommandV1");
    expect(moduleSource).toContain("investing_persist_canonical_plan_v1");
    expect(workflowSource).toContain("investingPlanPersistenceWriterPostgres.integration.test.ts");
  });
});
