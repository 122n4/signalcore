import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  INVESTING_APPLICATION_CONTEXT_VERSION,
  INVESTING_APPLICATION_CREATE_RUN_VERSION,
  INVESTING_APPLICATION_RUN_QUERY_VERSION,
  type InvestingApplicationContextV1,
  type InvestingApplicationOperationV1,
} from "@/lib/investing/application";
import { createInvestingApplicationBoundaryV1 } from "@/lib/investing/application/server";
import type {
  InvestingApplicationCanonicalSourcePortV1,
  InvestingApplicationScopeAuthorizerPortV1,
} from "@/lib/investing/application/ports";
import {
  InvestingEnginePersistenceServiceV1,
  InvestingEnginePersistenceVerifierV1,
  InvestingEngineReplayServiceV1,
} from "@/lib/investing/engine/v1/persistence";
import { PostgresInvestingEnginePersistenceAdapterV1 } from "@/lib/investing/engine/v1/persistence/postgres";
import {
  assertDestructiveInvestingQaDatabase,
  assertEffectiveDestructiveInvestingQaDatabase,
} from "@/scripts/qa/investingDestructiveQaGuard";
import { InvestingEnginePhase4CIntegrityScanner } from "@/scripts/qa/investingEnginePhase4CIntegrityScanner";
import {
  buildPhase4BInput,
  purePhase3FRunnerForPersistence,
} from "@/tests/fixtures/investingEnginePhase4BFixture";
import { constraint, d } from "@/tests/fixtures/investingEnginePhase3FFixture";

const databaseUrl = process.env.INVESTING_5A_TEST_DATABASE_URL;
const configuredDatabaseUrl = databaseUrl ?? "postgresql://invalid/phase5a_not_configured";
const pgDescribe = databaseUrl ? describe : describe.skip;
const destructiveQaTarget = databaseUrl
  ? assertDestructiveInvestingQaDatabase(
    databaseUrl,
    process.env.ALLOW_DESTRUCTIVE_INVESTING_QA,
  )
  : null;

const scopes = {
  ownerA: {
    ownerId: "phase5a_owner_a",
    tenantId: "phase5a_tenant_a",
    portfolioId: "phase5a_portfolio_a",
    accountId: "44444444-4444-4444-8444-444444444444",
  },
  ownerB: {
    ownerId: "phase5a_owner_b",
    tenantId: "phase5a_tenant_b",
    portfolioId: "phase5a_portfolio_b",
    accountId: "55555555-5555-4555-8555-555555555555",
  },
  portfolioC: {
    ownerId: "phase5a_owner_a",
    tenantId: "phase5a_tenant_a",
    portfolioId: "phase5a_portfolio_c",
    accountId: "66666666-6666-4666-8666-666666666666",
  },
} as const;

type TestScope = Readonly<{
  ownerId: string;
  tenantId: string;
  portfolioId: string;
  accountId: string;
}>;

const sourceInputs = new Map([
  [
    "phase5a-source-a",
    buildPhase4BInput({
      userId: scopes.ownerA.ownerId,
      accountId: scopes.ownerA.accountId,
      portfolioId: scopes.ownerA.portfolioId,
      runId: "phase5a_pg_run_a",
      idempotencyKey: "phase5a-pg-key-a",
    }).input,
  ],
  [
    "phase5a-source-a-conflict",
    buildPhase4BInput({
      userId: scopes.ownerA.ownerId,
      accountId: scopes.ownerA.accountId,
      portfolioId: scopes.ownerA.portfolioId,
      runId: "phase5a_pg_run_a",
      cash: "999",
      idempotencyKey: "phase5a-pg-key-a",
    }).input,
  ],
  [
    "phase5a-source-b",
    buildPhase4BInput({
      userId: scopes.ownerB.ownerId,
      accountId: scopes.ownerB.accountId,
      portfolioId: scopes.ownerB.portfolioId,
      runId: "phase5a_pg_run_b",
      cash: "1200",
      constraints: [constraint({ id: "phase5a_owner_b" })],
      modelOverrides: { VWCE: { commissionBps: d("41") } },
      idempotencyKey: "phase5a-pg-key-b",
    }).input,
  ],
  [
    "phase5a-source-c",
    buildPhase4BInput({
      userId: scopes.portfolioC.ownerId,
      accountId: scopes.portfolioC.accountId,
      portfolioId: scopes.portfolioC.portfolioId,
      runId: "phase5a_pg_run_c",
      cash: "1300",
      constraints: [constraint({ id: "phase5a_portfolio_c" })],
      modelOverrides: { VWCE: { commissionBps: d("42") } },
      idempotencyKey: "phase5a-pg-key-c",
    }).input,
  ],
]);

function context(
  operation: InvestingApplicationOperationV1,
  scope: TestScope,
  idempotencyKey: string | null = null,
): InvestingApplicationContextV1 {
  const command = operation === "create_canonical_run";
  return {
    contractVersion: INVESTING_APPLICATION_CONTEXT_VERSION,
    authenticatedOwnerId: scope.ownerId,
    tenantId: scope.tenantId,
    portfolioId: scope.portfolioId,
    correlationId: `correlation_${operation}_${scope.accountId}`,
    idempotencyKey: command ? idempotencyKey : null,
    requestedOperation: operation,
    applicationVersion: "phase5a-postgres-v1",
    actorType: command ? "service_operator" : "authenticated_owner",
    executionMode: command
      ? "administrative_canonical_persistence"
      : "internal_validation",
  };
}

function command(
  sourceReference: string,
  scope: TestScope,
) {
  return {
    contractVersion: INVESTING_APPLICATION_CREATE_RUN_VERSION,
    sourceReference,
    target: scope,
  } as const;
}

function query(runId: string, scope: TestScope) {
  return {
    contractVersion: INVESTING_APPLICATION_RUN_QUERY_VERSION,
    runId,
    target: scope,
  } as const;
}

function failureCode(result: { ok: boolean; error?: { code: string } }) {
  return result.ok ? null : result.error?.code;
}

pgDescribe("FASE 5A real PostgreSQL application boundary", () => {
  const admin = new pg.Pool({ connectionString: configuredDatabaseUrl, max: 4 });
  const adapter = new PostgresInvestingEnginePersistenceAdapterV1({
    connectionString: configuredDatabaseUrl,
    max: 8,
  });
  const relationships = new Map<string, TestScope>(
    Object.values(scopes).map((scope) => [scope.accountId, scope] as const),
  );
  const scopeAuthorizer: InvestingApplicationScopeAuthorizerPortV1 = {
    async authorize({ target }) {
      const expected = relationships.get(target.accountId);
      if (!expected || expected.ownerId !== target.ownerId) {
        return { authorized: false, reason: "owner_scope_mismatch" };
      }
      if (expected.tenantId !== target.tenantId) {
        return { authorized: false, reason: "tenant_scope_mismatch" };
      }
      if (expected.portfolioId !== target.portfolioId) {
        return { authorized: false, reason: "portfolio_scope_mismatch" };
      }
      const account = await admin.query(
        `select 1
           from public.investing_accounts
          where id=$1 and user_id=$2 and portfolio_id=$3
            and environment='paper' and status='active'`,
        [target.accountId, target.ownerId, target.portfolioId],
      );
      return account.rowCount === 1
        ? { authorized: true, scope: target }
        : { authorized: false, reason: "portfolio_scope_mismatch" };
    },
  };
  const canonicalSource: InvestingApplicationCanonicalSourcePortV1 = {
    async resolve({ sourceReference }) {
      const persistenceInput = sourceInputs.get(sourceReference);
      return persistenceInput ? { persistenceInput } : null;
    },
  };
  const dependencies = {
    repository: adapter,
    pureRunner: purePhase3FRunnerForPersistence,
    canonicalSource,
    scopeAuthorizer,
    integrityGuard: { inspect: async () => ({ status: "clean" as const }) },
  };
  const boundary = createInvestingApplicationBoundaryV1(dependencies);

  beforeAll(async () => {
    const effective = await admin.connect();
    try {
      const connectionParameters = (effective as unknown as {
        connectionParameters: { host: string; port: number; database: string };
      }).connectionParameters;
      assertEffectiveDestructiveInvestingQaDatabase(destructiveQaTarget!, {
        host: connectionParameters.host,
        port: connectionParameters.port,
        database: connectionParameters.database,
      });
    } finally {
      effective.release();
    }
    for (const scope of Object.values(scopes)) {
      await admin.query(
        `insert into public.investing_accounts(
         id,user_id,portfolio_id,base_currency,environment,status
         ) values($1,$2,$3,'EUR','paper','active')
         on conflict(id) do nothing`,
        [scope.accountId, scope.ownerId, scope.portfolioId],
      );
    }
  });

  afterAll(async () => {
    await adapter.close();
    await admin.end();
  });

  it("persists, reads, verifies and replays canonically with exact idempotency", async () => {
    const scope = scopes.ownerA;
    const input = sourceInputs.get("phase5a-source-a")!;
    const expected = new InvestingEnginePersistenceVerifierV1().verifyInput(input).manifest;
    const first = await boundary.createCanonicalRun(
      context("create_canonical_run", scope, "phase5a-pg-key-a"),
      command("phase5a-source-a", scope),
    );
    const retry = await boundary.createCanonicalRun(
      context("create_canonical_run", scope, "phase5a-pg-key-a"),
      command("phase5a-source-a", scope),
    );
    expect(first.ok && first.value.status).toBe("created");
    expect(retry.ok && retry.value.status).toBe("existing");
    expect(first.ok && first.value.run.manifestHash).toBe(expected.manifestHash);
    expect(first.ok && first.value.run.finalResultHash).toBe(expected.finalResultHash);

    const loaded = await boundary.getRun(
      context("get_run", scope),
      query("phase5a_pg_run_a", scope),
    );
    const verified = await boundary.verifyRun(
      context("verify_run", scope),
      query("phase5a_pg_run_a", scope),
    );
    const replayed = await boundary.replayRun(
      context("replay_run", scope),
      query("phase5a_pg_run_a", scope),
    );
    expect(loaded.ok && loaded.value.run.manifestHash).toBe(expected.manifestHash);
    expect(verified.ok && verified.value.status).toBe("verified");
    expect(replayed.ok && replayed.value.status).toBe("replay_match");

    const counts = await admin.query(
      `select
        (select count(*)::int from public.investing_engine_runs where run_id=$1) runs,
        (select count(*)::int from public.investing_engine_artifacts where run_id=$1) artifacts`,
      ["phase5a_pg_run_a"],
    );
    expect(counts.rows[0]).toEqual({ runs: 1, artifacts: 12 });
  });

  it("rejects an idempotency payload conflict without additional rows", async () => {
    const result = await boundary.createCanonicalRun(
      context("create_canonical_run", scopes.ownerA, "phase5a-pg-key-a"),
      command("phase5a-source-a-conflict", scopes.ownerA),
    );
    expect(failureCode(result)).toBe("idempotency_conflict");
    const runs = await admin.query(
      "select count(*)::int count from public.investing_engine_runs where owner_id=$1",
      [scopes.ownerA.ownerId],
    );
    expect(runs.rows[0].count).toBe(1);
  });

  it("blocks cross-owner, cross-tenant and cross-portfolio access before reads or writes", async () => {
    const ownerBCreate = await boundary.createCanonicalRun(
      context("create_canonical_run", scopes.ownerB, "phase5a-pg-key-b"),
      command("phase5a-source-b", scopes.ownerB),
    );
    expect(ownerBCreate.ok && ownerBCreate.value.status).toBe("created");
    const hiddenRun = await boundary.getRun(
      context("get_run", scopes.ownerA),
      query("phase5a_pg_run_b", scopes.ownerA),
    );
    expect(failureCode(hiddenRun)).toBe("run_not_found");
    const ownerBRead = await boundary.getRun(
      context("get_run", scopes.ownerB),
      query("phase5a_pg_run_b", scopes.ownerB),
    );
    expect(ownerBRead.ok && ownerBRead.value.run.ownerId).toBe(scopes.ownerB.ownerId);
    const ownerBManifest = ownerBRead.ok ? ownerBRead.value.run.manifestHash : null;
    const crossOwnerWrite = await boundary.createCanonicalRun(
      context("create_canonical_run", scopes.ownerA, "phase5a-pg-key-b"),
      command("phase5a-source-b", scopes.ownerA),
    );
    expect(failureCode(crossOwnerWrite)).toBe("owner_scope_mismatch");

    const ownerAttempt = {
      ...scopes.ownerA,
      ownerId: scopes.ownerB.ownerId,
      tenantId: scopes.ownerB.tenantId,
    };
    const tenantAttempt = { ...scopes.ownerA, tenantId: scopes.ownerB.tenantId };
    const portfolioAttempt = {
      ...scopes.ownerA,
      portfolioId: scopes.portfolioC.portfolioId,
    };
    for (const [attempt, expected] of [
      [ownerAttempt, "owner_scope_mismatch"],
      [tenantAttempt, "tenant_scope_mismatch"],
      [portfolioAttempt, "portfolio_scope_mismatch"],
    ] as const) {
      const result = await boundary.getRun(
        context("get_run", attempt),
        query("phase5a_pg_run_a", attempt),
      );
      expect(failureCode(result), expected).toBe(expected);
    }
    const count = await admin.query(
      "select count(*)::int count from public.investing_engine_runs",
    );
    expect(count.rows[0].count).toBe(2);
    const ownerBAfter = await boundary.getRun(
      context("get_run", scopes.ownerB),
      query("phase5a_pg_run_b", scopes.ownerB),
    );
    expect(ownerBAfter.ok && ownerBAfter.value.run.manifestHash).toBe(ownerBManifest);
  });

  it("rejects Live before persistence and leaves zero rows for the requested run", async () => {
    const before = await admin.query(
      "select count(*)::int count from public.investing_engine_runs",
    );
    const result = await boundary.createCanonicalRun(
      {
        ...context(
          "create_canonical_run",
          scopes.ownerB,
          "phase5a-pg-key-b",
        ),
        executionMode: "live",
      },
      command("phase5a-source-never-resolved", scopes.ownerB),
    );
    expect(failureCode(result)).toBe("live_operation_forbidden");
    const after = await admin.query(
      "select count(*)::int count from public.investing_engine_runs",
    );
    expect(after.rows[0].count).toBe(before.rows[0].count);
  });

  it("recovers deterministically after commit when the response path is lost", async () => {
    let firstCommit = true;
    const ambiguousAdapter = new PostgresInvestingEnginePersistenceAdapterV1({
      connectionString: configuredDatabaseUrl,
      max: 4,
      onCommit: () => {
        if (firstCommit) {
          firstCommit = false;
          throw new Error("synthetic_response_path_lost");
        }
      },
    });
    try {
      const ambiguousBoundary = createInvestingApplicationBoundaryV1({
        ...dependencies,
        repository: ambiguousAdapter,
      });
      const result = await ambiguousBoundary.createCanonicalRun(
        context(
          "create_canonical_run",
          scopes.portfolioC,
          "phase5a-pg-key-c",
        ),
        command("phase5a-source-c", scopes.portfolioC),
      );
      expect(result.ok && result.value.status, JSON.stringify(result)).toBe("recovered");
      expect(result.ok && result.value.idempotencyOutcome)
        .toBe("recovered_after_ambiguous_commit");
      const retry = await ambiguousBoundary.createCanonicalRun(
        context(
          "create_canonical_run",
          scopes.portfolioC,
          "phase5a-pg-key-c",
        ),
        command("phase5a-source-c", scopes.portfolioC),
      );
      expect(retry.ok && retry.value.status).toBe("existing");
    } finally {
      await ambiguousAdapter.close();
    }
  });

  it("leaves the official integrity scanner clean", async () => {
    const service = new InvestingEnginePersistenceServiceV1(adapter);
    const scanner = new InvestingEnginePhase4CIntegrityScanner({
      pool: adapter.pool,
      reader: service.reader,
      replay: new InvestingEngineReplayServiceV1(
        service.reader,
        purePhase3FRunnerForPersistence,
      ),
    });
    const report = await scanner.scan();
    expect(report.status).toBe("clean");
    expect(report.writes).toBe("none");
    expect(report.runChecks).toHaveLength(3);
    expect(report.runChecks.every((check) => check.replayStatus === "replay_match")).toBe(true);
  });
});
