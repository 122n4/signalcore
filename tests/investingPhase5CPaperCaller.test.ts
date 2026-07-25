import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createInvestingPaperCallerV1 } from "@/lib/investing/paper-caller/server";
import type {
  InvestingAuthenticatedSessionV1,
  InvestingAuthorizedPortfolioV1,
  InvestingPhase5AApplicationBoundaryPortV1,
  InvestingTenantMembershipV1,
} from "@/lib/investing/identity/ports";
import type { InvestingPaperCallerResultV1 } from "@/lib/investing/paper-caller";

const session: InvestingAuthenticatedSessionV1 = {
  authenticatedUserId: "user-a",
  requestId: "request-a",
};
const membership: InvestingTenantMembershipV1 = {
  membershipId: "membership-a",
  authenticatedUserId: "user-a",
  ownerId: "owner-a",
  tenantId: "tenant-a",
  role: "investing-operator",
  permissions: ["investing:*"],
  status: "active",
};
const portfolio: InvestingAuthorizedPortfolioV1 = {
  portfolioId: "portfolio-a",
  accountId: "account-a",
  ownerId: "owner-a",
  tenantId: "tenant-a",
  status: "active",
  investingEnabled: true,
};
const request = {
  mode: "paper",
  sourceReference: "sealed-source-a",
  idempotencyKey: "paper-request-a",
} as const;

function applicationSuccess(
  status: "created" | "existing" | "recovered" = "created",
) {
  const outcomes = {
    created: ["created", "canonical_run_created"],
    existing: ["existing_same_payload", "canonical_run_existing"],
    recovered: ["recovered_after_ambiguous_commit", "canonical_run_recovered"],
  } as const;
  return {
    ok: true,
    value: {
      contractVersion: "investing-application-response/v1",
      operation: "create_canonical_run",
      correlationId: "request-a",
      status,
      idempotencyOutcome: outcomes[status][0],
      reasonCode: outcomes[status][1],
      run: {},
    },
  } as never;
}

function harness() {
  const state: {
    session: InvestingAuthenticatedSessionV1 | null;
    memberships: InvestingTenantMembershipV1[];
    portfolios: InvestingAuthorizedPortfolioV1[];
  } = {
    session: { ...session },
    memberships: [{ ...membership }],
    portfolios: [{ ...portfolio }],
  };
  const createCanonicalRun = vi.fn<
    InvestingPhase5AApplicationBoundaryPortV1["createCanonicalRun"]
  >(async () => applicationSuccess());
  const application = {
    createCanonicalRun,
    getRun: vi.fn(),
    getLatestRun: vi.fn(),
    verifyRun: vi.fn(),
    replayRun: vi.fn(),
  };
  const caller = createInvestingPaperCallerV1({
    session: { resolve: vi.fn(async () => state.session) },
    directory: {
      findMemberships: vi.fn(async () => state.memberships),
      findPortfolios: vi.fn(async () => state.portfolios),
    },
    application,
  });
  return { state, application, caller };
}

function errorCode(result: InvestingPaperCallerResultV1) {
  return "error" in result ? result.error.code : null;
}

function reasonCode(result: InvestingPaperCallerResultV1) {
  return "error" in result ? result.error.reasonCode : null;
}

function expectNoApplicationWrite(instance: ReturnType<typeof harness>) {
  expect(instance.application.createCanonicalRun).not.toHaveBeenCalled();
}

describe("Investing FASE 5C controlled Paper caller", () => {
  it("starts an authorized Paper run with scope derived only from 5B", async () => {
    const instance = harness();
    const result = await instance.caller.start(request);
    expect(result.ok).toBe(true);
    expect(instance.application.createCanonicalRun).toHaveBeenCalledWith(
      expect.objectContaining({
        authenticatedOwnerId: "owner-a",
        tenantId: "tenant-a",
        portfolioId: "portfolio-a",
        correlationId: "request-a",
        idempotencyKey: "paper-request-a",
        applicationVersion: "investing-phase5c-paper-caller/v1",
      }),
      {
        contractVersion: "investing-application-create-run/v1",
        sourceReference: "sealed-source-a",
        target: {
          ownerId: "owner-a",
          tenantId: "tenant-a",
          portfolioId: "portfolio-a",
          accountId: "account-a",
        },
      },
    );
  });

  it.each([
    ["live"],
    ["real-money"],
    ["broker"],
    ["unknown"],
    [""],
    [null],
    [undefined],
  ])("rejects non-Paper mode %s before the application write boundary", async (mode) => {
    const instance = harness();
    const result = await instance.caller.start({ ...request, mode });
    expect(result).toEqual({
      contractVersion: "investing-paper-caller-error/v1",
      ok: false,
      correlationId: "request-a",
      error: {
        code: "paper_mode_required",
        reasonCode: "paper_mode_required",
      },
    });
    expectNoApplicationWrite(instance);
  });

  it.each(["ownerId", "tenantId", "portfolioId", "accountId"])(
    "rejects payload scope override %s",
    async (key) => {
      const instance = harness();
      const result = await instance.caller.start({ ...request, [key]: "attacker-scope" });
      expect(result.ok).toBe(false);
      expect(errorCode(result)).toBe("invalid_request");
      expectNoApplicationWrite(instance);
    },
  );

  it("resolves authenticated scope before validating Paper mode", async () => {
    const events: string[] = [];
    const instance = harness();
    instance.state.session = null;
    instance.application.createCanonicalRun.mockImplementation(async () => {
      events.push("application");
      return applicationSuccess();
    });
    const result = await instance.caller.start({ ...request, mode: "live" });
    expect(errorCode(result)).toBe("identity_scope_not_authorized");
    expect(events).toEqual([]);
  });

  it("rejects revoked membership with zero application writes", async () => {
    const instance = harness();
    instance.state.memberships = [{ ...membership, status: "revoked" }];
    const result = await instance.caller.start(request);
    expect(errorCode(result)).toBe("identity_scope_not_authorized");
    expectNoApplicationWrite(instance);
  });

  it.each([
    ["owner", { ownerId: "owner-b" }],
    ["tenant", { tenantId: "tenant-b" }],
  ])("rejects cross-%s directory scope", async (_label, override) => {
    const instance = harness();
    instance.state.portfolios = [{ ...portfolio, ...override }];
    const result = await instance.caller.start(request);
    expect(errorCode(result)).toBe("identity_scope_not_authorized");
    expectNoApplicationWrite(instance);
  });

  it("preserves deterministic repeat, concurrency and ambiguous-commit outcomes", async () => {
    const instance = harness();
    let calls = 0;
    instance.application.createCanonicalRun.mockImplementation(async () => {
      calls += 1;
      return applicationSuccess(calls === 1 ? "created" : "existing");
    });
    const [first, concurrent] = await Promise.all([
      instance.caller.start(request),
      instance.caller.start(request),
    ]);
    const retry = await instance.caller.start(request);
    instance.application.createCanonicalRun.mockResolvedValueOnce(
      applicationSuccess("recovered"),
    );
    const recovered = await instance.caller.start(request);

    expect(first.ok && first.value.status).toBe("created");
    expect(concurrent.ok && concurrent.value.status).toBe("existing");
    expect(retry.ok && retry.value.status).toBe("existing");
    expect(recovered.ok && recovered.value.status).toBe("recovered");
    for (const call of instance.application.createCanonicalRun.mock.calls) {
      expect(call[0].idempotencyKey).toBe("paper-request-a");
    }
  });

  it("propagates the canonical integrity failure and does not retry it", async () => {
    const instance = harness();
    instance.application.createCanonicalRun.mockResolvedValueOnce({
      contractVersion: "investing-application-error/v1",
      ok: false,
      correlationId: "request-a",
      error: { code: "integrity_blocked", reasonCode: "integrity_blocked" },
    } as never);
    const result = await instance.caller.start(request);
    expect(reasonCode(result)).toBe("integrity_blocked");
    expect(instance.application.createCanonicalRun).toHaveBeenCalledOnce();
  });

  it("uses explicit deterministic success states and reason codes", async () => {
    for (const expected of [
      ["created", "canonical_run_created"],
      ["existing", "canonical_run_existing"],
      ["recovered", "canonical_run_recovered"],
    ] as const) {
      const instance = harness();
      instance.application.createCanonicalRun.mockResolvedValueOnce(
        applicationSuccess(expected[0]),
      );
      const result = await instance.caller.start(request);
      expect(result.ok && [result.value.status, result.value.reasonCode]).toEqual(expected);
    }
  });
});
