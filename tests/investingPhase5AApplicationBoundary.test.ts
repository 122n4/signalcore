import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  INVESTING_APPLICATION_CONTEXT_VERSION,
  INVESTING_APPLICATION_CREATE_RUN_VERSION,
  INVESTING_APPLICATION_LATEST_QUERY_VERSION,
  INVESTING_APPLICATION_RUN_QUERY_VERSION,
  type InvestingApplicationContextV1,
  type InvestingApplicationOperationV1,
} from "@/lib/investing/application";
import { InvestingApplicationErrorV1 } from "@/lib/investing/application/errors";
import { createInvestingApplicationBoundaryV1 } from "@/lib/investing/application/server";
import type {
  InvestingApplicationCanonicalSourcePortV1,
  InvestingApplicationIntegrityGuardPortV1,
  InvestingApplicationScopeAuthorizerPortV1,
} from "@/lib/investing/application/ports";
import type {
  InvestingEngineLoadedPersistenceV1,
  InvestingEnginePersistencePreparedV1,
  InvestingEnginePersistenceRepositoryPortV1,
  InvestingEnginePersistenceTransactionV1,
} from "@/lib/investing/engine/v1/persistence";
import {
  buildPhase4BInput,
  loadedFromPrepared,
  PHASE4B_ACCOUNT_ID,
  purePhase3FRunnerForPersistence,
} from "@/tests/fixtures/investingEnginePhase4BFixture";

const OWNER = "user_phase3f_1";
const TENANT = "tenant_phase5a_1";
const PORTFOLIO = "primary";
const RUN_ID = "run_phase3f_1";

class MemoryRepository implements InvestingEnginePersistenceRepositoryPortV1 {
  loaded: InvestingEngineLoadedPersistenceV1 | null = null;
  beginCount = 0;
  committedWrites = 0;

  findRunByScope = async (selector: { ownerId: string; accountId: string; runId: string }) =>
    this.loaded?.run.identity.ownerId === selector.ownerId
    && this.loaded.run.identity.accountId === selector.accountId
    && this.loaded.run.identity.runId === selector.runId
      ? this.loaded.run
      : null;

  findRunByIdempotency = async (
    selector: { ownerId: string; accountId: string; scope: string; key: string },
  ) =>
    this.loaded?.run.identity.ownerId === selector.ownerId
    && this.loaded.run.identity.accountId === selector.accountId
    && this.loaded.run.idempotencyScope === selector.scope
    && this.loaded.run.idempotencyKey === selector.key
      ? this.loaded.run
      : null;

  findRunByFinalHash = async (
    selector: { ownerId: string; accountId: string; finalResultHash: string },
  ) =>
    this.loaded?.run.identity.ownerId === selector.ownerId
    && this.loaded.run.identity.accountId === selector.accountId
    && this.loaded.run.hashes.final_result === selector.finalResultHash
      ? this.loaded.run
      : null;

  findLatestRun = async (selector: { ownerId: string; accountId: string }) =>
    this.loaded?.run.identity.ownerId === selector.ownerId
    && this.loaded.run.identity.accountId === selector.accountId
      ? this.loaded.run
      : null;

  loadCompleteRun = async () => this.loaded!;

  async beginTransaction(): Promise<InvestingEnginePersistenceTransactionV1> {
    this.beginCount += 1;
    let staged: InvestingEnginePersistencePreparedV1 | null = null;
    return {
      lockIdempotency: async () => undefined,
      lockRunId: async () => undefined,
      findRunByScope: this.findRunByScope,
      findRunByIdempotency: this.findRunByIdempotency,
      findRunByFinalHash: this.findRunByFinalHash,
      findLatestRun: this.findLatestRun,
      loadCompleteRun: this.loadCompleteRun,
      insertRun: async (prepared) => {
        staged = prepared;
      },
      insertArtifacts: async () => undefined,
      insertPhaseSummaries: async () => undefined,
      insertReasonEvidence: async () => undefined,
      insertShadowPackage: async () => undefined,
      insertClaims: async () => undefined,
      assertExpectedCounts: async () => undefined,
      forceDeferredConstraints: async () => undefined,
      commit: async () => {
        if (!staged) throw new Error("missing_staged_run");
        this.loaded = loadedFromPrepared(staged);
        this.committedWrites += 1;
      },
      rollback: async () => {
        staged = null;
      },
    };
  }
}

function context(
  operation: InvestingApplicationOperationV1,
  overrides: Partial<InvestingApplicationContextV1> = {},
): InvestingApplicationContextV1 {
  const command = operation === "create_canonical_run";
  return {
    contractVersion: INVESTING_APPLICATION_CONTEXT_VERSION,
    authenticatedOwnerId: OWNER,
    tenantId: TENANT,
    portfolioId: PORTFOLIO,
    correlationId: `correlation_${operation}`,
    idempotencyKey: command ? "phase5a-idempotency-1" : null,
    requestedOperation: operation,
    applicationVersion: "phase5a-test-v1",
    actorType: command ? "service_operator" : "authenticated_owner",
    executionMode: command
      ? "administrative_canonical_persistence"
      : "internal_validation",
    ...overrides,
  };
}

const target = {
  ownerId: OWNER,
  tenantId: TENANT,
  portfolioId: PORTFOLIO,
  accountId: PHASE4B_ACCOUNT_ID,
} as const;

function command(sourceReference = "validated-source-1") {
  return {
    contractVersion: INVESTING_APPLICATION_CREATE_RUN_VERSION,
    sourceReference,
    target,
  } as const;
}

function runQuery() {
  return {
    contractVersion: INVESTING_APPLICATION_RUN_QUERY_VERSION,
    runId: RUN_ID,
    target,
  } as const;
}

function latestQuery() {
  return {
    contractVersion: INVESTING_APPLICATION_LATEST_QUERY_VERSION,
    target,
  } as const;
}

function setup(args: {
  authorize?: InvestingApplicationScopeAuthorizerPortV1["authorize"];
  inspect?: InvestingApplicationIntegrityGuardPortV1["inspect"];
  resolve?: InvestingApplicationCanonicalSourcePortV1["resolve"];
} = {}) {
  const repository = new MemoryRepository();
  const inputs = new Map([
    [
      "validated-source-1",
      buildPhase4BInput({
        accountId: PHASE4B_ACCOUNT_ID,
        runId: RUN_ID,
        idempotencyKey: "phase5a-idempotency-1",
      }).input,
    ],
    [
      "validated-source-conflict",
      buildPhase4BInput({
        accountId: PHASE4B_ACCOUNT_ID,
        runId: RUN_ID,
        cash: "999",
        idempotencyKey: "phase5a-idempotency-1",
      }).input,
    ],
  ]);
  const scopeAuthorizer: InvestingApplicationScopeAuthorizerPortV1 = {
    authorize: args.authorize ?? (async ({ target: requested }) => ({
      authorized: true,
      scope: requested,
    })),
  };
  const integrityGuard: InvestingApplicationIntegrityGuardPortV1 = {
    inspect: args.inspect ?? (async () => ({ status: "clean" })),
  };
  const canonicalSource: InvestingApplicationCanonicalSourcePortV1 = {
    resolve: args.resolve ?? (async ({ sourceReference }) => {
      const persistenceInput = inputs.get(sourceReference);
      return persistenceInput ? { persistenceInput } : null;
    }),
  };
  const boundary = createInvestingApplicationBoundaryV1({
    repository,
    pureRunner: purePhase3FRunnerForPersistence,
    canonicalSource,
    scopeAuthorizer,
    integrityGuard,
  });
  return { boundary, repository };
}

function failureCode(result: { ok: boolean } & Record<string, unknown>) {
  return result.ok
    ? null
    : (result as unknown as { error: { code: string } }).error.code;
}

describe("FASE 5A internal server-side application boundary", () => {
  it("persists a valid command only through the canonical writer and returns a safe summary", async () => {
    const { boundary, repository } = setup();
    const result = await boundary.createCanonicalRun(
      context("create_canonical_run"),
      command(),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe("created");
    expect(result.value.idempotencyOutcome).toBe("created");
    expect(result.value.run).toMatchObject({
      runId: RUN_ID,
      ownerId: OWNER,
      tenantId: TENANT,
      portfolioId: PORTFOLIO,
      accountId: PHASE4B_ACCOUNT_ID,
      verified: true,
    });
    expect(repository.committedWrites).toBe(1);
    const serialized = JSON.stringify(result.value);
    for (const forbidden of [
      "canonicalPayload",
      "persistenceInput",
      "connectionString",
      "serviceRole",
      "password",
      "secret",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it.each([
    ["owner absent", { authenticatedOwnerId: "" }, "authentication_context_required"],
    ["tenant absent", { tenantId: "" }, "tenant_scope_mismatch"],
    ["portfolio absent", { portfolioId: "" }, "portfolio_scope_mismatch"],
    ["idempotency invalid", { idempotencyKey: " invalid " }, "invalid_request"],
  ] as const)("rejects %s before any write", async (_name, overrides, expected) => {
    const { boundary, repository } = setup();
    const result = await boundary.createCanonicalRun(
      context("create_canonical_run", overrides),
      command(),
    );
    expect(failureCode(result as never)).toBe(expected);
    expect(repository.beginCount).toBe(0);
    expect(repository.committedWrites).toBe(0);
  });

  it.each([
    [
      "owner",
      context("create_canonical_run", { authenticatedOwnerId: "other_owner" }),
      "owner_scope_mismatch",
    ],
    [
      "tenant",
      context("create_canonical_run", { tenantId: "other_tenant" }),
      "tenant_scope_mismatch",
    ],
    [
      "portfolio",
      context("create_canonical_run", { portfolioId: "other_portfolio" }),
      "portfolio_scope_mismatch",
    ],
  ] as const)("rejects a cross-%s target before persistence", async (_name, ctx, expected) => {
    const { boundary, repository } = setup();
    const result = await boundary.createCanonicalRun(ctx, command());
    expect(failureCode(result as never)).toBe(expected);
    expect(repository.beginCount).toBe(0);
  });

  it("rejects an authorizer scope denial before resolving canonical material", async () => {
    let resolved = 0;
    const { boundary, repository } = setup({
      authorize: async () => ({
        authorized: false,
        reason: "portfolio_scope_mismatch",
      }),
      resolve: async () => {
        resolved += 1;
        return null;
      },
    });
    const result = await boundary.createCanonicalRun(
      context("create_canonical_run"),
      command(),
    );
    expect(failureCode(result as never)).toBe("portfolio_scope_mismatch");
    expect(resolved).toBe(0);
    expect(repository.beginCount).toBe(0);
  });

  it("rejects owner and portfolio identifiers supplied only by resolved payload material", async () => {
    const mismatches = [
      buildPhase4BInput({
        userId: "payload_other_owner",
        accountId: PHASE4B_ACCOUNT_ID,
        runId: RUN_ID,
        idempotencyKey: "phase5a-idempotency-1",
      }).input,
      buildPhase4BInput({
        accountId: PHASE4B_ACCOUNT_ID,
        portfolioId: "payload_other_portfolio",
        runId: RUN_ID,
        idempotencyKey: "phase5a-idempotency-1",
      }).input,
    ] as const;
    for (const [index, persistenceInput] of mismatches.entries()) {
      const { boundary, repository } = setup({
        resolve: async () => ({ persistenceInput }),
      });
      const result = await boundary.createCanonicalRun(
        context("create_canonical_run"),
        command(),
      );
      expect(failureCode(result as never)).toBe(
        index === 0 ? "owner_scope_mismatch" : "portfolio_scope_mismatch",
      );
      expect(repository.beginCount).toBe(0);
    }
  });

  it("rejects unknown request versions", async () => {
    const { boundary, repository } = setup();
    const result = await boundary.createCanonicalRun(
      context("create_canonical_run"),
      { ...command(), contractVersion: "investing-application-create-run/v2" },
    );
    expect(failureCode(result as never)).toBe("unsupported_version");
    expect(repository.beginCount).toBe(0);
  });

  it("returns the existing run for the same key and same payload", async () => {
    const { boundary, repository } = setup();
    const first = await boundary.createCanonicalRun(
      context("create_canonical_run"),
      command(),
    );
    const second = await boundary.createCanonicalRun(
      context("create_canonical_run"),
      command(),
    );
    expect(first.ok && first.value.status).toBe("created");
    expect(second.ok && second.value.status).toBe("existing");
    expect(second.ok && second.value.idempotencyOutcome).toBe("existing_same_payload");
    expect(repository.committedWrites).toBe(1);
  });

  it("rejects reuse of an idempotency key with a different payload", async () => {
    const { boundary, repository } = setup();
    await boundary.createCanonicalRun(context("create_canonical_run"), command());
    const conflict = await boundary.createCanonicalRun(
      context("create_canonical_run"),
      command("validated-source-conflict"),
    );
    expect(failureCode(conflict as never)).toBe("idempotency_conflict");
    expect(repository.committedWrites).toBe(1);
  });

  it("fails closed when integrity is blocked", async () => {
    const { boundary, repository } = setup({
      inspect: async () => ({ status: "blocked", reasonCode: "scanner_blocked" }),
    });
    const result = await boundary.createCanonicalRun(
      context("create_canonical_run"),
      command(),
    );
    expect(failureCode(result as never)).toBe("integrity_blocked");
    expect(repository.beginCount).toBe(0);
  });

  it("translates dependency failures without exposing their messages", async () => {
    const { boundary } = setup({
      resolve: async () => {
        throw new Error("postgresql://admin:secret@localhost/database");
      },
    });
    const result = await boundary.createCanonicalRun(
      context("create_canonical_run"),
      command(),
    );
    expect(failureCode(result as never)).toBe("internal_dependency_unavailable");
    expect(JSON.stringify(result)).not.toContain("postgresql");
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  it("rejects Live and execution intent before source resolution or writes", async () => {
    let resolved = 0;
    const { boundary, repository } = setup({
      resolve: async () => {
        resolved += 1;
        return null;
      },
    });
    const result = await boundary.createCanonicalRun(
      { ...context("create_canonical_run"), executionMode: "live" },
      command(),
    );
    expect(failureCode(result as never)).toBe("live_operation_forbidden");
    expect(resolved).toBe(0);
    expect(repository.beginCount).toBe(0);
  });

  it("requires every composition dependency explicitly", () => {
    expect(() => createInvestingApplicationBoundaryV1({
      repository: null,
      pureRunner: purePhase3FRunnerForPersistence,
      canonicalSource: null,
      scopeAuthorizer: null,
      integrityGuard: null,
    } as never)).toThrow(InvestingApplicationErrorV1);
  });

  it("loads latest, verifies and replays through official read services", async () => {
    const { boundary } = setup();
    await boundary.createCanonicalRun(context("create_canonical_run"), command());
    const loaded = await boundary.getRun(context("get_run"), runQuery());
    const latest = await boundary.getLatestRun(
      context("get_latest_run"),
      latestQuery(),
    );
    const verified = await boundary.verifyRun(context("verify_run"), runQuery());
    const replayed = await boundary.replayRun(context("replay_run"), runQuery());
    expect(loaded.ok && loaded.value.status).toBe("complete");
    expect(latest.ok && latest.value.run.runId).toBe(RUN_ID);
    expect(verified.ok && verified.value.status).toBe("verified");
    expect(replayed.ok && replayed.value.status).toBe("replay_match");
    expect(replayed.ok && replayed.value.writes).toBe("none");
  });

  it("is deterministic for repeated queries", async () => {
    const { boundary } = setup();
    await boundary.createCanonicalRun(context("create_canonical_run"), command());
    const first = await boundary.getRun(context("get_run"), runQuery());
    const second = await boundary.getRun(context("get_run"), runQuery());
    expect(first).toEqual(second);
  });
});
