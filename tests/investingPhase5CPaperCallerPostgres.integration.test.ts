import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createInvestingApplicationBoundaryV1 } from "@/lib/investing/application/server";
import type {
  InvestingApplicationCanonicalSourcePortV1,
  InvestingApplicationScopeAuthorizerPortV1,
} from "@/lib/investing/application/ports";
import { createInvestingPaperCallerV1 } from "@/lib/investing/paper-caller/server";
import { InvestingEnginePersistenceVerifierV1 } from "@/lib/investing/engine/v1/persistence";
import { PostgresInvestingEnginePersistenceAdapterV1 } from "@/lib/investing/engine/v1/persistence/postgres";
import {
  assertDestructiveInvestingQaDatabase,
  assertEffectiveDestructiveInvestingQaDatabase,
} from "@/scripts/qa/investingDestructiveQaGuard";
import {
  buildPhase4BInput,
  purePhase3FRunnerForPersistence,
} from "@/tests/fixtures/investingEnginePhase4BFixture";

const databaseUrl = process.env.INVESTING_5C_TEST_DATABASE_URL;
const configuredDatabaseUrl =
  databaseUrl ?? "postgresql://invalid/phase5c_not_configured";
const pgDescribe = databaseUrl ? describe : describe.skip;
const destructiveQaTarget = databaseUrl
  ? assertDestructiveInvestingQaDatabase(
    databaseUrl,
    process.env.ALLOW_DESTRUCTIVE_INVESTING_QA,
  )
  : null;

const scope = {
  authenticatedUserId: "phase5c_authenticated_user",
  ownerId: "phase5c_owner_a",
  tenantId: "phase5c_tenant_a",
  portfolioId: "phase5c_portfolio_a",
  accountId: "88888888-8888-4888-8888-888888888888",
} as const;
const request = {
  mode: "paper",
  sourceReference: "phase5c-source-a",
  idempotencyKey: "phase5c-paper-key-a",
} as const;
const persistenceInput = buildPhase4BInput({
  userId: scope.ownerId,
  accountId: scope.accountId,
  portfolioId: scope.portfolioId,
  runId: "phase5c_pg_run_a",
  idempotencyKey: request.idempotencyKey,
}).input;

pgDescribe("FASE 5C real PostgreSQL Paper caller, concurrency and RLS", () => {
  const admin = new pg.Pool({ connectionString: configuredDatabaseUrl, max: 8 });
  const adapter = new PostgresInvestingEnginePersistenceAdapterV1({
    connectionString: configuredDatabaseUrl,
    max: 8,
  });
  const scopeAuthorizer: InvestingApplicationScopeAuthorizerPortV1 = {
    async authorize({ target }) {
      if (
        target.ownerId !== scope.ownerId
        || target.tenantId !== scope.tenantId
        || target.portfolioId !== scope.portfolioId
        || target.accountId !== scope.accountId
      ) {
        return { authorized: false, reason: "portfolio_scope_mismatch" };
      }
      const account = await admin.query(
        `select 1 from public.investing_accounts
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
      return sourceReference === request.sourceReference
        ? { persistenceInput }
        : null;
    },
  };
  const application = createInvestingApplicationBoundaryV1({
    repository: adapter,
    pureRunner: purePhase3FRunnerForPersistence,
    canonicalSource,
    scopeAuthorizer,
    integrityGuard: { inspect: async () => ({ status: "clean" as const }) },
  });
  const caller = createInvestingPaperCallerV1({
    session: {
      resolve: async () => ({
        authenticatedUserId: scope.authenticatedUserId,
        requestId: "phase5c-request-a",
      }),
    },
    directory: {
      findMemberships: async () => [{
        membershipId: "phase5c-membership-a",
        authenticatedUserId: scope.authenticatedUserId,
        ownerId: scope.ownerId,
        tenantId: scope.tenantId,
        role: "investing-operator",
        permissions: ["investing:*"] as const,
        status: "active" as const,
      }],
      findPortfolios: async () => [{
        portfolioId: scope.portfolioId,
        accountId: scope.accountId,
        ownerId: scope.ownerId,
        tenantId: scope.tenantId,
        status: "active" as const,
        investingEnabled: true,
      }],
    },
    application,
  });

  beforeAll(async () => {
    const effective = await admin.connect();
    try {
      const parameters = (effective as unknown as {
        connectionParameters: { host: string; port: number; database: string };
      }).connectionParameters;
      assertEffectiveDestructiveInvestingQaDatabase(destructiveQaTarget!, {
        host: parameters.host,
        port: parameters.port,
        database: parameters.database,
      });
    } finally {
      effective.release();
    }
    await admin.query(
      `insert into public.investing_accounts(
         id,user_id,portfolio_id,base_currency,environment,status
       ) values($1,$2,$3,'EUR','paper','active')
       on conflict(id) do nothing`,
      [scope.accountId, scope.ownerId, scope.portfolioId],
    );
  });

  afterAll(async () => {
    await adapter.close();
    await admin.end();
  });

  it("writes once under concurrency, retries exactly and enforces owner RLS", async () => {
    const expected =
      new InvestingEnginePersistenceVerifierV1().verifyInput(persistenceInput).manifest;
    const concurrent = await Promise.all(
      Array.from({ length: 4 }, () => caller.start(request)),
    );
    const retry = await caller.start(request);
    const statuses = concurrent.map((result) => result.ok && result.value.status);
    expect(statuses.filter((status) => status === "created")).toHaveLength(1);
    expect(statuses.filter((status) => status === "existing")).toHaveLength(3);
    expect(retry.ok && retry.value.status).toBe("existing");
    expect(concurrent[0].ok && concurrent[0].value.run.manifestHash)
      .toBe(expected.manifestHash);

    const persisted = await admin.query(
      "select count(*)::int count from public.investing_engine_runs where run_id=$1",
      [persistenceInput.request.runId],
    );
    expect(persisted.rows[0].count).toBe(1);

    const client = await admin.connect();
    try {
      await client.query("begin");
      await client.query("set local role authenticated");
      await client.query(
        "select set_config('request.jwt.claims',$1,true)",
        [JSON.stringify({ sub: scope.ownerId })],
      );
      const own = await client.query(
        "select count(*)::int count from public.investing_engine_runs where run_id=$1",
        [persistenceInput.request.runId],
      );
      await client.query(
        "select set_config('request.jwt.claims',$1,true)",
        [JSON.stringify({ sub: "phase5c_owner_b" })],
      );
      const other = await client.query(
        "select count(*)::int count from public.investing_engine_runs where run_id=$1",
        [persistenceInput.request.runId],
      );
      expect(own.rows[0].count).toBe(1);
      expect(other.rows[0].count).toBe(0);
    } finally {
      await client.query("rollback");
      client.release();
    }
  });
});
