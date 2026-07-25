import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createInvestingOpsServiceV1 } from "@/lib/investing/ops/server";
import type {
  InvestingAuthorizedPortfolioV1,
  InvestingTenantMembershipV1,
} from "@/lib/investing/identity/ports";
import type {
  InvestingOpsCheckStateV1,
  InvestingOpsResultV1,
} from "@/lib/investing/ops";
import type {
  InvestingOpsReadDatasetV1,
} from "@/lib/investing/ops/ports";

const membership: InvestingTenantMembershipV1 = {
  membershipId: "membership-a",
  authenticatedUserId: "user-a",
  ownerId: "owner-a",
  tenantId: "tenant-a",
  role: "investing-operator",
  permissions: ["investing:read"],
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
const failureScope = {
  ownerId: "owner-a",
  tenantId: "tenant-a",
  portfolioId: "portfolio-a",
  accountId: "account-a",
} as const;

function row(overrides: Record<string, unknown> = {}) {
  return {
    runId: "run-a",
    ownerId: "owner-a",
    tenantId: "tenant-a",
    portfolioId: "portfolio-a",
    accountId: "account-a",
    asOf: "2026-07-25T00:00:00.000Z",
    state: "proposal_ready",
    quality: "good",
    requestOutcome: "created" as const,
    reasonCode: "canonical_run_created",
    idempotencyConflict: false,
    ambiguousCommitRecovery: false,
    ...overrides,
  };
}

function harness() {
  const state: {
    membership: InvestingTenantMembershipV1[];
    portfolios: InvestingAuthorizedPortfolioV1[];
    dataset: InvestingOpsReadDatasetV1;
    integrity: InvestingOpsCheckStateV1;
    verifier: InvestingOpsCheckStateV1;
    replay: InvestingOpsCheckStateV1;
    unavailable: boolean;
  } = {
    membership: [{ ...membership }],
    portfolios: [{ ...portfolio }],
    dataset: { runs: [row()], failures: [], telemetryComplete: true },
    integrity: "pass",
    verifier: "pass",
    replay: "pass",
    unavailable: false,
  };
  let tick = 0;
  const writes = {
    read: 0,
    integrity: 0,
    verifier: 0,
    replay: 0,
    logs: [] as unknown[],
  };
  const service = createInvestingOpsServiceV1({
    session: {
      resolve: async () => ({
        authenticatedUserId: "user-a",
        requestId: "request-a",
      }),
    },
    directory: {
      findMemberships: async () => state.membership,
      findPortfolios: async () => state.portfolios,
    },
    readModel: {
      async readScope() {
        writes.read += 1;
        if (state.unavailable) throw new Error("database unavailable secret=password");
        return state.dataset;
      },
    },
    integrity: {
      async inspectScope() {
        writes.integrity += 1;
        return state.integrity;
      },
    },
    verifier: {
      async inspectRun() {
        writes.verifier += 1;
        return state.verifier;
      },
    },
    replay: {
      async inspectRun() {
        writes.replay += 1;
        return state.replay;
      },
    },
    clock: {
      now: () => ({
        iso: "2026-07-25T01:00:00.000Z",
        monotonicMs: tick++,
      }),
    },
    logger: { write: (event) => { writes.logs.push(event); } },
  });
  return { state, writes, service };
}

function value<T>(result: InvestingOpsResultV1<T>): T {
  if (!result.ok || !("value" in result)) throw new Error("expected success");
  return result.value;
}

function errorCode(result: InvestingOpsResultV1<unknown>) {
  return "error" in result ? result.error.reasonCode : null;
}

describe("Investing FASE 5D internal OPS observability", () => {
  it("returns unknown when empty run data has incomplete telemetry", async () => {
    const { state, service } = harness();
    state.dataset = { runs: [], failures: null, telemetryComplete: false };
    const snapshot = value(await service.snapshot({}));
    expect(snapshot.state).toBe("unknown");
    expect(snapshot.reasonCode).toBe("ops_unknown");
    expect(snapshot.metrics.totalRuns).toEqual({ available: true, value: 0 });
    expect(snapshot.metrics.totalRequests).toEqual({ available: false, value: null });
    expect(snapshot.metrics.latestRunAgeMs).toEqual({ available: false, value: null });
  });

  it("does not let synthetic complete telemetry turn an empty dataset into empty", async () => {
    const { state, service } = harness();
    state.dataset = { runs: [], failures: [], telemetryComplete: true };
    const snapshot = value(await service.snapshot({}));
    expect(snapshot.state).toBe("unknown");
    expect(snapshot.reasonCode).toBe("ops_unknown");
    expect(snapshot.metrics.totalRuns).toEqual({ available: true, value: 0 });
    expect(snapshot.metrics.created).toEqual({ available: false, value: null });
  });

  it("does not let synthetic complete telemetry produce healthy", async () => {
    const snapshot = value(await harness().service.snapshot({}));
    expect(snapshot.state).toBe("degraded");
    expect(snapshot.reasonCode).toBe("ops_check_incomplete");
    expect(snapshot.integrity).toBe("pass");
    expect(snapshot.verifier).toBe("pass");
    expect(snapshot.replay).toBe("pass");
  });

  it.each([
    ["degraded", { replay: "incomplete", expected: "ops_check_incomplete" }],
    ["failed scanner", { integrity: "failed", expected: "ops_integrity_blocked" }],
    ["blocked scanner", { integrity: "blocked", expected: "ops_integrity_blocked" }],
    ["blocked verifier", { verifier: "failed", expected: "ops_verifier_failed" }],
    ["blocked replay", { replay: "failed", expected: "ops_replay_failed" }],
  ])("aggregates %s fail-closed", async (_label, test) => {
    const instance = harness();
    Object.assign(instance.state, test);
    const snapshot = value(await instance.service.snapshot({}));
    expect(snapshot.reasonCode).toBe(test.expected);
    expect(snapshot.state).toBe(test.expected === "ops_check_incomplete" ? "degraded" : "blocked");
  });

  it.each([
    ["integrity", "incomplete"],
    ["integrity", "failed"],
    ["integrity", "blocked"],
    ["verifier", "incomplete"],
    ["verifier", "failed"],
    ["verifier", "blocked"],
    ["replay", "incomplete"],
    ["replay", "failed"],
    ["replay", "blocked"],
  ] as const)("never reports healthy when %s is %s", async (check, checkState) => {
    const instance = harness();
    instance.state[check] = checkState;
    const snapshot = value(await instance.service.snapshot({}));
    expect(snapshot.state).not.toBe("healthy");
    expect(snapshot.reasonCode).not.toBe("ops_healthy");
  });

  it("degrades a populated snapshot when outcome telemetry is unavailable", async () => {
    const instance = harness();
    instance.state.dataset = {
      runs: [row({
        requestOutcome: null,
        reasonCode: null,
        idempotencyConflict: null,
        ambiguousCommitRecovery: null,
      })],
      failures: null,
      telemetryComplete: false,
    };
    const snapshot = value(await instance.service.snapshot({}));
    expect(snapshot.state).toBe("degraded");
    expect(snapshot.reasonCode).toBe("ops_check_incomplete");
    expect(snapshot.metrics.created).toEqual({ available: false, value: null });
    expect(snapshot.metrics.existing).toEqual({ available: false, value: null });
    expect(snapshot.metrics.recovered).toEqual({ available: false, value: null });
    expect(snapshot.metrics.idempotencyConflicts).toEqual({ available: false, value: null });
    expect(snapshot.metrics.identityFailures).toEqual({ available: false, value: null });
  });

  it("returns unknown when an empty dataset cannot be assessed", async () => {
    const instance = harness();
    instance.state.dataset = { runs: [], failures: null, telemetryComplete: false };
    instance.state.integrity = "incomplete";
    const snapshot = value(await instance.service.snapshot({}));
    expect(snapshot.state).toBe("unknown");
    expect(snapshot.reasonCode).toBe("ops_unknown");
  });

  it("lists deterministically, returns latest and exposes safe run detail", async () => {
    const instance = harness();
    instance.state.dataset = {
      runs: [
        row({ runId: "run-old", asOf: "2026-07-24T00:00:00.000Z" }),
        row({ runId: "run-z", asOf: "2026-07-25T00:00:00.000Z" }),
        row({ runId: "run-a", asOf: "2026-07-25T00:00:00.000Z" }),
      ],
      failures: [],
      telemetryComplete: true,
    };
    const list = value(await instance.service.listRuns({ limit: 2 }));
    expect(list.runs.map((run) => run.runId)).toEqual(["run-a", "run-z"]);
    expect(value(await instance.service.getLatestRun({})).run.runId).toBe("run-a");
    const detail = value(await instance.service.getRun({ runId: "run-old" }));
    expect(detail.run).toEqual(expect.objectContaining({
      runId: "run-old",
      verifier: "pass",
      replay: "pass",
    }));
    expect(JSON.stringify(detail)).not.toMatch(/password|token|canonicalPayload|connectionString/u);
  });

  it("ignores synthetic outcomes, conflicts, recovery and failure observations for metrics", async () => {
    const instance = harness();
    instance.state.dataset = {
      runs: [
        row({ runId: "recovered", requestOutcome: "recovered", ambiguousCommitRecovery: true }),
        row({ runId: "conflict", requestOutcome: "failed", idempotencyConflict: true }),
      ],
      failures: [
        {
          scope: failureScope,
          occurredAt: "2026-07-25T00:30:00.000Z",
          kind: "identity",
          reasonCode: "identity_scope_not_authorized",
        },
        {
          scope: failureScope,
          occurredAt: "2026-07-25T00:40:00.000Z",
          kind: "persistence",
          reasonCode: "canonical_persistence_failed",
        },
      ],
      telemetryComplete: true,
    };
    const snapshot = value(await instance.service.snapshot({}));
    for (const metric of [
      "totalRequests",
      "created",
      "existing",
      "recovered",
      "failed",
      "blocked",
      "idempotencyConflicts",
      "identityFailures",
      "authorizationFailures",
      "integrityFailures",
      "persistenceFailures",
    ] as const) {
      expect(snapshot.metrics[metric]).toEqual({ available: false, value: null });
    }
    expect(snapshot.latestFailureReason).toBe("canonical_persistence_failed");
  });

  it("keeps supported persisted-run and clock metrics available", async () => {
    const instance = harness();
    instance.state.dataset = {
      runs: [
        row({ runId: "run-latest", asOf: "2026-07-25T00:00:00.000Z" }),
        row({ runId: "run-old", asOf: "2026-07-23T00:00:00.000Z" }),
      ],
      failures: [],
      telemetryComplete: true,
    };
    const snapshot = value(await instance.service.snapshot({}));
    expect(snapshot.metrics.totalRuns).toEqual({ available: true, value: 2 });
    expect(snapshot.metrics.runsInPeriod).toEqual({ available: true, value: 1 });
    expect(snapshot.metrics.latestRunAgeMs).toEqual({ available: true, value: 3_600_000 });
    expect(snapshot.metrics.generationDurationMs).toEqual({ available: true, value: 1 });
  });

  it.each([
    ["created", true, true],
    ["existing", false, false],
    ["recovered", true, false],
    ["failed", false, true],
    ["blocked", true, false],
  ] as const)(
    "keeps synthetic %s outcome unavailable with conflict=%s and recovery=%s",
    async (requestOutcome, idempotencyConflict, ambiguousCommitRecovery) => {
      const instance = harness();
      instance.state.dataset = {
        runs: [row({
          requestOutcome,
          idempotencyConflict,
          ambiguousCommitRecovery,
        })],
        failures: [],
        telemetryComplete: true,
      };
      const snapshot = value(await instance.service.snapshot({}));
      expect(snapshot.metrics[requestOutcome]).toEqual({ available: false, value: null });
      expect(snapshot.metrics.idempotencyConflicts)
        .toEqual({ available: false, value: null });
      expect(snapshot.metrics.recovered).toEqual({ available: false, value: null });
    },
  );

  it.each(["ownerId", "tenantId", "portfolioId", "accountId", "membershipId", "role", "permissions"])(
    "rejects payload scope override %s before reading data",
    async (key) => {
      const instance = harness();
      const result = await instance.service.snapshot({ [key]: "attacker" });
      expect(result.ok).toBe(false);
      expect(instance.writes.read).toBe(0);
    },
  );

  it("denies revoked membership uniformly with zero reads and writes", async () => {
    const instance = harness();
    instance.state.membership = [{ ...membership, status: "revoked" }];
    const result = await instance.service.snapshot({});
    expect(result).toEqual({
      ok: false,
      correlationId: null,
      error: {
        code: "identity_scope_not_authorized",
        reasonCode: "identity_scope_not_authorized",
      },
    });
    expect(instance.writes.read).toBe(0);
    expect(instance.writes.integrity).toBe(0);
  });

  it("fails closed for cross-scope rows without revealing the resource", async () => {
    for (const override of [
      { ownerId: "owner-secret" },
      { tenantId: "tenant-secret" },
      { portfolioId: "portfolio-secret" },
      { accountId: "account-secret" },
    ]) {
      const instance = harness();
      instance.state.dataset = {
        runs: [row(override)],
        failures: [],
        telemetryComplete: true,
      };
      const result = await instance.service.getRun({ runId: "run-a" });
      expect(errorCode(result)).toBe("ops_dependency_unavailable");
    }
  });

  it("accepts failure observations only for the exact authenticated scope", async () => {
    const instance = harness();
    instance.state.dataset = {
      runs: [row()],
      failures: [{
        scope: failureScope,
        occurredAt: "2026-07-25T00:30:00.000Z",
        kind: "authorization",
        reasonCode: "identity_scope_not_authorized",
      }],
      telemetryComplete: true,
    };
    const snapshot = value(await instance.service.snapshot({}));
    expect(snapshot.metrics.authorizationFailures).toEqual({ available: false, value: null });
    expect(snapshot.latestFailureReason).toBe("identity_scope_not_authorized");
  });

  it.each(["ownerId", "tenantId", "portfolioId", "accountId"] as const)(
    "rejects cross-scope failure observation by %s without exposing it",
    async (key) => {
      const instance = harness();
      instance.state.dataset = {
        runs: [row()],
        failures: [{
          scope: { ...failureScope, [key]: `${key}-secret` },
          occurredAt: "2026-07-25T00:30:00.000Z",
          kind: "authorization",
          reasonCode: "cross_scope_secret_reason",
        }],
        telemetryComplete: true,
      };
      const result = await instance.service.snapshot({});
      expect(errorCode(result)).toBe("ops_dependency_unavailable");
      expect(JSON.stringify(result)).not.toContain("cross_scope_secret_reason");
      expect(JSON.stringify(result)).not.toContain(`${key}-secret`);
    },
  );

  it("rejects an incomplete failure scope instead of filtering it", async () => {
    const instance = harness();
    instance.state.dataset = {
      runs: [row()],
      failures: [{
        scope: {
          ownerId: "owner-a",
          tenantId: "tenant-a",
          portfolioId: "portfolio-a",
        },
        occurredAt: "2026-07-25T00:30:00.000Z",
        kind: "authorization",
        reasonCode: "incomplete_scope_secret_reason",
      } as never],
      telemetryComplete: true,
    };
    const result = await instance.service.snapshot({});
    expect(errorCode(result)).toBe("ops_dependency_unavailable");
    expect(JSON.stringify(result)).not.toContain("incomplete_scope_secret_reason");
  });

  it("does not turn dependency failure into healthy or leak its error", async () => {
    const instance = harness();
    instance.state.unavailable = true;
    const result = await instance.service.snapshot({});
    expect(errorCode(result)).toBe("ops_dependency_unavailable");
    expect(JSON.stringify(result)).not.toMatch(/password|database unavailable/u);
  });

  it("emits fixed structured logs that cannot serialize sensitive inputs", async () => {
    const instance = harness();
    await instance.service.getRun({
      runId: "run-a",
      token: "secret-token",
      password: "secret-password",
    });
    const serialized = JSON.stringify(instance.writes.logs);
    expect(serialized).not.toMatch(/secret-token|secret-password|cookie|connection/u);
    expect(serialized).toContain("ops_invalid_request");
  });

  it("performs only read/check operations and never invokes the Paper caller", async () => {
    const instance = harness();
    await instance.service.snapshot({});
    expect(instance.writes).toMatchObject({
      read: 1,
      integrity: 1,
      verifier: 1,
      replay: 1,
    });
    expect(Object.keys(instance.writes)).not.toContain("createCanonicalRun");
  });
});
