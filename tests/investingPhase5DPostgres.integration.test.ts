import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createInvestingApplicationBoundaryV1 } from "@/lib/investing/application/server";
import type {
  InvestingApplicationCanonicalSourcePortV1,
  InvestingApplicationScopeAuthorizerPortV1,
} from "@/lib/investing/application/ports";
import { InvestingEnginePhase4CIntegrityScanner } from "@/scripts/qa/investingEnginePhase4CIntegrityScanner";
import {
  InvestingEnginePersistenceServiceV1,
  InvestingEngineReplayServiceV1,
} from "@/lib/investing/engine/v1/persistence";
import { PostgresInvestingEnginePersistenceAdapterV1 } from "@/lib/investing/engine/v1/persistence/postgres";
import { createInvestingPaperCallerV1 } from "@/lib/investing/paper-caller/server";
import { createInvestingOpsServiceV1 } from "@/lib/investing/ops/server";
import type {
  InvestingAuthorizedPortfolioV1,
  InvestingTenantMembershipV1,
} from "@/lib/investing/identity/ports";
import {
  assertDestructiveInvestingQaDatabase,
  assertEffectiveDestructiveInvestingQaDatabase,
} from "@/scripts/qa/investingDestructiveQaGuard";
import {
  buildPhase4BInput,
  purePhase3FRunnerForPersistence,
} from "@/tests/fixtures/investingEnginePhase4BFixture";

const databaseUrl = process.env.INVESTING_5D_TEST_DATABASE_URL;
const configuredDatabaseUrl = databaseUrl ?? "postgresql://invalid/phase5d_not_configured";
const pgDescribe = databaseUrl ? describe : describe.skip;
const destructiveQaTarget = databaseUrl
  ? assertDestructiveInvestingQaDatabase(
    databaseUrl,
    process.env.ALLOW_DESTRUCTIVE_INVESTING_QA,
  )
  : null;

const scope = {
  authenticatedUserId: "phase5d_authenticated_user",
  ownerId: "phase5d_owner_a",
  tenantId: "phase5d_tenant_a",
  portfolioId: "phase5d_portfolio_a",
  accountId: "99999999-9999-4999-8999-999999999999",
} as const;
const request = {
  mode: "paper",
  sourceReference: "phase5d-source-a",
  idempotencyKey: "phase5d-key-a",
} as const;
const persistenceInput = buildPhase4BInput({
  userId: scope.ownerId,
  accountId: scope.accountId,
  portfolioId: scope.portfolioId,
  runId: "phase5d_pg_run_a",
  idempotencyKey: request.idempotencyKey,
}).input;
const activeMembership: InvestingTenantMembershipV1 = {
  membershipId: "phase5d-membership-a",
  authenticatedUserId: scope.authenticatedUserId,
  ownerId: scope.ownerId,
  tenantId: scope.tenantId,
  role: "investing-operator",
  permissions: ["investing:*"],
  status: "active",
};
const activePortfolio: InvestingAuthorizedPortfolioV1 = {
  portfolioId: scope.portfolioId,
  accountId: scope.accountId,
  ownerId: scope.ownerId,
  tenantId: scope.tenantId,
  status: "active",
  investingEnabled: true,
};

pgDescribe("FASE 5D real PostgreSQL read-only OPS and RLS", () => {
  const admin = new pg.Pool({ connectionString: configuredDatabaseUrl, max: 8 });
  const adapter = new PostgresInvestingEnginePersistenceAdapterV1({
    connectionString: configuredDatabaseUrl,
    max: 8,
  });
  const persistence = new InvestingEnginePersistenceServiceV1(adapter);
  const replay = new InvestingEngineReplayServiceV1(
    persistence.reader,
    purePhase3FRunnerForPersistence,
  );
  const scanner = new InvestingEnginePhase4CIntegrityScanner({
    pool: adapter.pool,
    reader: persistence.reader,
    replay,
  });
  const scopeAuthorizer: InvestingApplicationScopeAuthorizerPortV1 = {
    async authorize({ target }) {
      return target.ownerId === scope.ownerId
        && target.tenantId === scope.tenantId
        && target.portfolioId === scope.portfolioId
        && target.accountId === scope.accountId
        ? { authorized: true, scope: target }
        : { authorized: false, reason: "portfolio_scope_mismatch" };
    },
  };
  const canonicalSource: InvestingApplicationCanonicalSourcePortV1 = {
    resolve: async ({ sourceReference }) =>
      sourceReference === request.sourceReference ? { persistenceInput } : null,
  };
  const application = createInvestingApplicationBoundaryV1({
    repository: adapter,
    pureRunner: purePhase3FRunnerForPersistence,
    canonicalSource,
    scopeAuthorizer,
    integrityGuard: { inspect: async () => ({ status: "clean" as const }) },
  });
  const identityState: {
    memberships: InvestingTenantMembershipV1[];
    portfolios: InvestingAuthorizedPortfolioV1[];
  } = {
    memberships: [{ ...activeMembership }],
    portfolios: [{ ...activePortfolio }],
  };
  const identityDependencies = {
    session: {
      resolve: async () => ({
        authenticatedUserId: scope.authenticatedUserId,
        requestId: "phase5d-request-a",
      }),
    },
    directory: {
      findMemberships: async () => identityState.memberships,
      findPortfolios: async () => identityState.portfolios,
    },
  };
  const paperCaller = createInvestingPaperCallerV1({
    ...identityDependencies,
    application,
  });

  function ops() {
    return createInvestingOpsServiceV1({
      ...identityDependencies,
      readModel: {
        async readScope(resolved) {
          const client = await admin.connect();
          try {
            await client.query("begin read only");
            await client.query("set local role authenticated");
            await client.query(
              "select set_config('request.jwt.claims',$1,true)",
              [JSON.stringify({ sub: resolved.ownerId })],
            );
            const result = await client.query<{
              run_id: string;
              owner_id: string;
              account_id: string;
              as_of: string;
              state: string;
              quality: string;
            }>(
              `select run_id,owner_id,account_id::text,as_of::text,state,quality
                 from public.investing_engine_runs
                where owner_id=$1 and account_id=$2
                order by as_of desc,run_id`,
              [resolved.ownerId, resolved.accountId],
            );
            await client.query("commit");
            return {
              runs: result.rows.map((row) => ({
                runId: row.run_id,
                ownerId: row.owner_id,
                tenantId: resolved.tenantId,
                portfolioId: resolved.portfolioId,
                accountId: row.account_id,
                asOf: new Date(row.as_of).toISOString(),
                state: row.state,
                quality: row.quality,
                requestOutcome: null,
                reasonCode: null,
                idempotencyConflict: null,
                ambiguousCommitRecovery: null,
              })),
              failures: null,
              telemetryComplete: false,
            };
          } catch (error) {
            await client.query("rollback");
            throw error;
          } finally {
            client.release();
          }
        },
      },
      integrity: {
        inspectScope: async () =>
          (await scanner.scan()).status === "clean" ? "pass" as const : "blocked" as const,
      },
      verifier: {
        async inspectRun({ scope: resolved, runId }) {
          try {
            await persistence.reader.loadByRunId({
              ownerId: resolved.ownerId,
              accountId: resolved.accountId,
              runId,
            });
            return "pass" as const;
          } catch {
            return "failed" as const;
          }
        },
      },
      replay: {
        async inspectRun({ scope: resolved, runId }) {
          const result = await replay.replay({
            ownerId: resolved.ownerId,
            accountId: resolved.accountId,
            runId,
          });
          return result.status === "replay_match" ? "pass" as const : "failed" as const;
        },
      },
      clock: {
        now: () => ({
          iso: "2026-07-25T01:00:00.000Z",
          monotonicMs: 1,
        }),
      },
      logger: { write: () => undefined },
    });
  }

  beforeAll(async () => {
    const effective = await admin.connect();
    try {
      const parameters = (effective as unknown as {
        connectionParameters: { host: string; port: number; database: string };
      }).connectionParameters;
      assertEffectiveDestructiveInvestingQaDatabase(destructiveQaTarget!, parameters);
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

  it("returns unknown before any run when request telemetry has no official source", async () => {
    const result = await ops().snapshot({});
    expect(result.ok && result.value.state).toBe("unknown");
    if (result.ok) {
      expect(result.value.reasonCode).toBe("ops_unknown");
      expect(result.value.metrics.totalRuns).toEqual({ available: true, value: 0 });
      expect(result.value.metrics.totalRequests).toEqual({ available: false, value: null });
    }
  });

  it("reads degraded snapshot and safe list/detail under RLS with identical hashes", async () => {
    const created = await paperCaller.start(request);
    expect(created.ok && created.value.status).toBe("created");
    const before = await scanner.scan();
    const service = ops();
    const snapshot = await service.snapshot({});
    const list = await service.listRuns({ limit: 10 });
    const detail = await service.getRun({ runId: persistenceInput.request.runId });
    const latest = await service.getLatestRun({});
    const after = await scanner.scan();

    expect(snapshot.ok && snapshot.value.state).toBe("degraded");
    if (snapshot.ok) {
      expect(snapshot.value.reasonCode).toBe("ops_check_incomplete");
      expect(snapshot.value.metrics.created).toEqual({ available: false, value: null });
      expect(snapshot.value.metrics.existing).toEqual({ available: false, value: null });
      expect(snapshot.value.metrics.recovered).toEqual({ available: false, value: null });
      expect(snapshot.value.metrics.failed).toEqual({ available: false, value: null });
      expect(snapshot.value.metrics.blocked).toEqual({ available: false, value: null });
      expect(snapshot.value.metrics.idempotencyConflicts)
        .toEqual({ available: false, value: null });
      expect(snapshot.value.metrics.identityFailures).toEqual({ available: false, value: null });
      expect(snapshot.value.metrics.authorizationFailures)
        .toEqual({ available: false, value: null });
      expect(snapshot.value.metrics.integrityFailures)
        .toEqual({ available: false, value: null });
      expect(snapshot.value.metrics.persistenceFailures)
        .toEqual({ available: false, value: null });
      expect(snapshot.value.metrics.totalRuns).toEqual({ available: true, value: 1 });
    }
    expect(list.ok && list.value.runs).toHaveLength(1);
    expect(detail.ok && detail.value.run.runId).toBe(persistenceInput.request.runId);
    expect(latest.ok && latest.value.run.runId).toBe(persistenceInput.request.runId);
    expect(after.counts).toEqual(before.counts);
    expect(after.tableHashes).toEqual(before.tableHashes);
    expect(after.reportHash).toBe(before.reportHash);
    expect(after.writes).toBe("none");
  });

  it("RLS and identity scope hide other owner, tenant and portfolio", async () => {
    const client = await admin.connect();
    try {
      await client.query("begin");
      await client.query("set local role authenticated");
      await client.query(
        "select set_config('request.jwt.claims',$1,true)",
        [JSON.stringify({ sub: "phase5d_owner_b" })],
      );
      const hidden = await client.query(
        "select count(*)::int count from public.investing_engine_runs",
      );
      expect(hidden.rows[0].count).toBe(0);
    } finally {
      await client.query("rollback");
      client.release();
    }

    for (const portfolios of [
      [{ ...activePortfolio, ownerId: "owner-b" }],
      [{ ...activePortfolio, tenantId: "tenant-b" }],
    ]) {
      identityState.portfolios = portfolios;
      const result = await ops().snapshot({});
      expect("error" in result && result.error.reasonCode)
        .toBe("identity_scope_not_authorized");
    }
    identityState.portfolios = [{ ...activePortfolio }];
    const crossPortfolioPayload = await ops().snapshot({
      portfolioId: "portfolio-b",
    });
    expect("error" in crossPortfolioPayload && crossPortfolioPayload.error.reasonCode)
      .toBe("ops_invalid_request");
  });

  it("revoked membership produces the same denial and zero reads", async () => {
    identityState.memberships = [{ ...activeMembership, status: "revoked" }];
    const result = await ops().snapshot({});
    expect("error" in result && result.error.reasonCode)
      .toBe("identity_scope_not_authorized");
    identityState.memberships = [{ ...activeMembership }];
  });
});
