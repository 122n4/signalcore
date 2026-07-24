import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createInvestingApplicationBoundaryV1 } from "@/lib/investing/application/server";
import type {
  InvestingApplicationCanonicalSourcePortV1,
  InvestingApplicationScopeAuthorizerPortV1,
} from "@/lib/investing/application/ports";
import { createInvestingIdentityGatewayV1 } from "@/lib/investing/identity/server";
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

const databaseUrl = process.env.INVESTING_5B_TEST_DATABASE_URL;
const configuredDatabaseUrl =
  databaseUrl ?? "postgresql://invalid/phase5b_not_configured";
const pgDescribe = databaseUrl ? describe : describe.skip;
const destructiveQaTarget = databaseUrl
  ? assertDestructiveInvestingQaDatabase(
    databaseUrl,
    process.env.ALLOW_DESTRUCTIVE_INVESTING_QA,
  )
  : null;

const scope = {
  authenticatedUserId: "phase5b_authenticated_user",
  ownerId: "phase5b_owner_a",
  tenantId: "phase5b_tenant_a",
  portfolioId: "phase5b_portfolio_a",
  accountId: "77777777-7777-4777-8777-777777777777",
} as const;

const persistenceInput = buildPhase4BInput({
  userId: scope.ownerId,
  accountId: scope.accountId,
  portfolioId: scope.portfolioId,
  runId: "phase5b_pg_run_a",
  idempotencyKey: "phase5b-pg-key-a",
}).input;

pgDescribe("FASE 5B real PostgreSQL identity, 5A and RLS integration", () => {
  const admin = new pg.Pool({ connectionString: configuredDatabaseUrl, max: 4 });
  const adapter = new PostgresInvestingEnginePersistenceAdapterV1({
    connectionString: configuredDatabaseUrl,
    max: 4,
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
      return sourceReference === "phase5b-source-a"
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
  const gateway = createInvestingIdentityGatewayV1({
    session: {
      resolve: async () => ({
        authenticatedUserId: scope.authenticatedUserId,
        requestId: "phase5b-request-a",
      }),
    },
    directory: {
      findMemberships: async () => [{
        membershipId: "phase5b-membership-a",
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

  it("persists through 5A, retries exactly and enforces owner RLS", async () => {
    const expected =
      new InvestingEnginePersistenceVerifierV1().verifyInput(persistenceInput).manifest;
    const first = await gateway.createCanonicalRun({
      sourceReference: "phase5b-source-a",
      idempotencyKey: "phase5b-pg-key-a",
    });
    const retry = await gateway.createCanonicalRun({
      sourceReference: "phase5b-source-a",
      idempotencyKey: "phase5b-pg-key-a",
    });
    expect(first.ok && first.value.status).toBe("created");
    expect(retry.ok && retry.value.status).toBe("existing");
    expect(first.ok && first.value.run.manifestHash).toBe(expected.manifestHash);

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
        [JSON.stringify({ sub: "phase5b_owner_b" })],
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
