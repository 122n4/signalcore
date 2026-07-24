import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createInvestingIdentityGatewayV1 } from "@/lib/investing/identity/server";
import type {
  InvestingAuthenticatedSessionV1,
  InvestingAuthorizedPortfolioV1,
  InvestingTenantMembershipV1,
} from "@/lib/investing/identity/ports";

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

function success(operation: string) {
  return { ok: true, value: { operation } } as never;
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
  const application = {
    createCanonicalRun: vi.fn(async () => success("create_canonical_run")),
    getRun: vi.fn(async () => success("get_run")),
    getLatestRun: vi.fn(async () => success("get_latest_run")),
    verifyRun: vi.fn(async () => success("verify_run")),
    replayRun: vi.fn(async () => success("replay_run")),
  };
  const directory = {
    findMemberships: vi.fn(async () => state.memberships),
    findPortfolios: vi.fn(async () => state.portfolios),
  };
  const gateway = createInvestingIdentityGatewayV1({
    session: { resolve: vi.fn(async () => state.session) },
    directory,
    application,
  });
  return { state, application, directory, gateway };
}

function expectDenied(result: unknown) {
  expect(result).toEqual({
    ok: false,
    correlationId: null,
    error: {
      code: "identity_scope_not_authorized",
      reasonCode: "identity_scope_not_authorized",
    },
  });
}

describe("Investing FASE 5B authenticated identity boundary", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("resolves an authorized user and constructs the complete 5A scope internally", async () => {
    const { gateway, application, directory } = harness();
    const result = await gateway.createCanonicalRun({
      sourceReference: "sealed-source-a",
      idempotencyKey: "idempotency-a",
    });

    expect(result.ok).toBe(true);
    expect(directory.findPortfolios).toHaveBeenCalledWith({
      authenticatedUserId: "user-a",
      ownerId: "owner-a",
      tenantId: "tenant-a",
    });
    expect(application.createCanonicalRun).toHaveBeenCalledWith(
      expect.objectContaining({
        authenticatedOwnerId: "owner-a",
        tenantId: "tenant-a",
        portfolioId: "portfolio-a",
        correlationId: "request-a",
      }),
      expect.objectContaining({
        sourceReference: "sealed-source-a",
        target: {
          ownerId: "owner-a",
          tenantId: "tenant-a",
          portfolioId: "portfolio-a",
          accountId: "account-a",
        },
      }),
    );
  });

  it.each([
    ["ownerId", "owner-b"],
    ["tenantId", "tenant-b"],
    ["portfolioId", "portfolio-b"],
  ])("rejects a payload attempting to override %s", async (key, value) => {
    const { gateway, application } = harness();
    const result = await gateway.createCanonicalRun({
      sourceReference: "sealed-source-a",
      idempotencyKey: "idempotency-a",
      [key]: value,
    });
    expectDenied(result);
    expect(application.createCanonicalRun).not.toHaveBeenCalled();
  });

  it("rejects an absent membership before the 5A boundary", async () => {
    const { state, gateway, application } = harness();
    state.memberships = [];
    expectDenied(await gateway.getRun({ runId: "run-a" }));
    expect(application.getRun).not.toHaveBeenCalled();
  });

  it("rejects revoked and inactive memberships", async () => {
    for (const status of ["revoked", "inactive"] as const) {
      const { state, gateway, application } = harness();
      state.memberships = [{ ...membership, status }];
      expectDenied(await gateway.getRun({ runId: "run-a" }));
      expect(application.getRun).not.toHaveBeenCalled();
    }
  });

  it("rejects a missing portfolio without revealing whether it exists", async () => {
    const { state, gateway, application } = harness();
    state.portfolios = [];
    expectDenied(await gateway.getRun({ runId: "run-a" }));
    expect(application.getRun).not.toHaveBeenCalled();
  });

  it.each([
    ["other owner", { ownerId: "owner-b" }],
    ["other tenant", { tenantId: "tenant-b" }],
    ["inactive portfolio", { status: "inactive" as const }],
    ["disabled portfolio", { investingEnabled: false }],
  ])("rejects a portfolio belonging to an %s", async (_label, override) => {
    const { state, gateway, application } = harness();
    state.portfolios = [{ ...portfolio, ...override }];
    expectDenied(await gateway.getRun({ runId: "run-a" }));
    expect(application.getRun).not.toHaveBeenCalled();
  });

  it("rejects ambiguous membership and portfolio scope", async () => {
    const membershipsHarness = harness();
    membershipsHarness.state.memberships.push({
      ...membership,
      membershipId: "membership-second",
    });
    expectDenied(await membershipsHarness.gateway.getRun({ runId: "run-a" }));

    const portfoliosHarness = harness();
    portfoliosHarness.state.portfolios.push({
      ...portfolio,
      portfolioId: "portfolio-second",
    });
    expectDenied(await portfoliosHarness.gateway.getRun({ runId: "run-a" }));
  });

  it("rejects missing or partial authenticated context", async () => {
    for (const invalid of [
      null,
      { authenticatedUserId: "", requestId: "request-a" },
      { authenticatedUserId: "user-a", requestId: "" },
    ] as const) {
      const { state, gateway, application } = harness();
      state.session = invalid as InvestingAuthenticatedSessionV1 | null;
      expectDenied(await gateway.getRun({ runId: "run-a" }));
      expect(application.getRun).not.toHaveBeenCalled();
    }
  });

  it("requires the permission for the requested operation", async () => {
    const { state, gateway, application } = harness();
    state.memberships = [{
      ...membership,
      permissions: ["investing:read"],
    }];
    expectDenied(await gateway.replayRun({ runId: "run-a" }));
    expect(application.replayRun).not.toHaveBeenCalled();
    expect((await gateway.getRun({ runId: "run-a" })).ok).toBe(true);
  });

  it("delegates every query to the accepted 5A boundary with no scope input", async () => {
    const { gateway, application } = harness();
    await gateway.getRun({ runId: "run-a" });
    await gateway.getLatestRun({});
    await gateway.verifyRun({ runId: "run-a" });
    await gateway.replayRun({ runId: "run-a" });
    expect(application.getRun).toHaveBeenCalledOnce();
    expect(application.getLatestRun).toHaveBeenCalledOnce();
    expect(application.verifyRun).toHaveBeenCalledOnce();
    expect(application.replayRun).toHaveBeenCalledOnce();
  });

  it("returns the same non-disclosing failure for all cross-scope states", async () => {
    const failures = [];
    for (const mutate of [
      (state: ReturnType<typeof harness>["state"]) => { state.memberships = []; },
      (state: ReturnType<typeof harness>["state"]) => {
        state.memberships = [{ ...membership, status: "revoked" }];
      },
      (state: ReturnType<typeof harness>["state"]) => {
        state.portfolios = [{ ...portfolio, tenantId: "tenant-secret" }];
      },
    ]) {
      const instance = harness();
      mutate(instance.state);
      failures.push(await instance.gateway.getRun({ runId: "run-a" }));
    }
    expect(failures[0]).toEqual(failures[1]);
    expect(failures[1]).toEqual(failures[2]);
  });

  it("is deterministic and never reuses caller-provided scope material", async () => {
    const first = harness();
    const second = harness();
    const input = { runId: "run-a" };
    expect(await first.gateway.getRun(input)).toEqual(await second.gateway.getRun(input));
    expect(first.application.getRun.mock.calls[0]).toEqual(
      second.application.getRun.mock.calls[0],
    );
  });

  it("fails closed when official server dependencies throw", async () => {
    const { gateway, directory, application } = harness();
    directory.findMemberships.mockRejectedValueOnce(new Error("directory unavailable"));
    expectDenied(await gateway.getRun({ runId: "run-a" }));
    expect(application.getRun).not.toHaveBeenCalled();
  });
});
