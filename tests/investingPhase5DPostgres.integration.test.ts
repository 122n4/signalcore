import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createInvestingApplicationBoundaryV1 } from "@/lib/investing/application/server";
import { canonicalDecimalFromString } from "@/lib/investing/engine/v1";
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
import { createProductionInvestingOpsRuntimeV1 } from
  "@/lib/investing/ops/infrastructure/server";
import { ScopedInvestingOpsIntegrityProjectionV1 } from
  "@/lib/investing/ops/infrastructure/projections.server";
import { createInvestingOpsSoftBudgetV1 } from
  "@/lib/investing/ops/infrastructure/softBudget.server";
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
const tenantA = "51000000-0000-4000-8000-000000000001";
const tenantB = "52000000-0000-4000-8000-000000000002";
const membershipA = "53000000-0000-4000-8000-000000000001";
const membershipB = "54000000-0000-4000-8000-000000000002";
const ownerB = "phase5dr_owner_b";
const accountB = "88888888-8888-4888-8888-888888888888";
const permissions5br = [
  "investing:read",
  "investing:create",
  "investing:verify",
  "investing:replay",
] as const;
const persistenceInput = buildPhase4BInput({
  userId: scope.ownerId,
  accountId: scope.accountId,
  portfolioId: scope.portfolioId,
  runId: "phase5d_pg_run_a",
  idempotencyKey: request.idempotencyKey,
}).input;
const persistenceInputA2 = buildPhase4BInput({
  userId: scope.ownerId,
  accountId: scope.accountId,
  portfolioId: scope.portfolioId,
  runId: "phase5dr_pg_run_a_2",
  idempotencyKey: "phase5dr-key-a-2",
  cash: "25000.00",
}).input;
const persistenceInputB = buildPhase4BInput({
  userId: ownerB,
  accountId: accountB,
  portfolioId: "phase5dr_portfolio_b",
  runId: "phase5dr_pg_run_b",
  idempotencyKey: "phase5dr-key-b",
  cash: "37000.00",
  modelOverrides: {
    SPY: { commissionBps: canonicalDecimalFromString("7") },
    VWCE: { commissionBps: canonicalDecimalFromString("9") },
  },
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

  async function databaseFingerprint() {
    const tables = [
      "investing_tenants",
      "investing_tenant_memberships",
      "investing_accounts",
      "investing_engine_runs",
      "investing_engine_artifacts",
      "investing_engine_phase_summaries",
      "investing_engine_reason_evidence",
      "investing_engine_shadow_packages",
      "investing_engine_idempotency_keys",
    ] as const;
    return Object.fromEntries(await Promise.all(tables.map(async (table) => {
      const result = await admin.query<{ count: string; hash: string }>(
        `select count(*)::text count,
                md5(coalesce(string_agg(
                  fingerprint_row.xmin::text || ':' || row_to_json(fingerprint_row)::text,
                  '|' order by row_to_json(fingerprint_row)::text
                ), '')) hash
           from public.${table} fingerprint_row`,
      );
      return [table, result.rows[0]];
    })));
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
      `truncate
         public.investing_engine_idempotency_keys,
         public.investing_engine_shadow_packages,
         public.investing_engine_reason_evidence,
         public.investing_engine_phase_summaries,
         public.investing_engine_artifacts,
         public.investing_engine_runs
       restart identity cascade`,
    );
    await admin.query(
      `insert into public.investing_tenants(id,owner_user_id,kind,status)
       values($1,$2,'personal','active'),($3,$4,'personal','active')
       on conflict(id) do nothing`,
      [tenantA, scope.ownerId, tenantB, ownerB],
    );
    await admin.query(
      `insert into public.investing_tenant_memberships(
         id,tenant_id,user_id,role,permissions,status
       ) values($1,$2,$3,'owner',$4,'active'),($5,$6,$7,'owner',$4,'active')
       on conflict(id) do nothing`,
      [membershipA, tenantA, scope.ownerId, permissions5br,
        membershipB, tenantB, ownerB],
    );
    await admin.query(
      `insert into public.investing_accounts(
         id,user_id,owner_user_id,tenant_id,portfolio_id,
         base_currency,environment,status
       ) values($1,$2,$2,$4,$3,'EUR','paper','active')
       on conflict(id) do nothing`,
      [scope.accountId, scope.ownerId, scope.portfolioId, tenantA],
    );
    await admin.query(
      `insert into public.investing_accounts(
         id,user_id,owner_user_id,tenant_id,portfolio_id,
         base_currency,environment,status
       ) values($1,$2,$2,$4,$3,'EUR','paper','active')
       on conflict(id) do nothing`,
      [accountB, ownerB, "phase5dr_portfolio_b", tenantB],
    );
  });

  afterAll(async () => {
    await adapter.close();
    await admin.end();
  });

  it("returns unknown before any run when request telemetry has no official source", async () => {
    const result = await ops().snapshot({});
    expect(result).toMatchObject({ ok: true });
    expect(result.ok && result.value.state).toBe("unknown");
    if (result.ok) {
      expect(result.value.reasonCode).toBe("ops_unknown");
      expect(result.value.metrics.totalRuns).toEqual({ available: true, value: 0 });
      expect(result.value.metrics.totalRequests).toEqual({ available: false, value: null });
    }
  });

  it("reads degraded snapshot and safe list/detail under RLS with identical hashes", async () => {
    const created = await paperCaller.start(request);
    expect(created).toMatchObject({ ok: true });
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
  }, 60_000);

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

  it("runs the production 5D-R factory vertically for persisted A and B", async () => {
    await persistence.persist(persistenceInputA2);
    await persistence.persist(persistenceInputB);
    const beforeOps = await databaseFingerprint();
    const runtimeA = createProductionInvestingOpsRuntimeV1({
      connectionString: configuredDatabaseUrl,
      readUser: async () => scope.ownerId,
      pureRunner: purePhase3FRunnerForPersistence,
      clock: {
        now: () => ({ iso: "2026-07-25T01:00:00.000Z", monotonicMs: 1 }),
      },
    });
    const runtimeB = createProductionInvestingOpsRuntimeV1({
      connectionString: configuredDatabaseUrl,
      readUser: async () => ownerB,
      pureRunner: purePhase3FRunnerForPersistence,
      clock: {
        now: () => ({ iso: "2026-07-25T01:00:00.000Z", monotonicMs: 1 }),
      },
    });
    try {
      const aSnapshot = await runtimeA.service.snapshot({});
      const aList = await runtimeA.service.listRuns({ limit: 10 });
      const aDetail = await runtimeA.service.getRun({
        runId: persistenceInput.request.runId,
      });
      const bSnapshot = await runtimeB.service.snapshot({});
      expect(aSnapshot.ok && aSnapshot.value.metrics.totalRuns.value).toBe(2);
      expect(aSnapshot.ok && aSnapshot.value.integrity).toBe("pass");
      expect(aSnapshot.ok && aSnapshot.value.verifier).toBe("pass");
      expect(aSnapshot.ok && aSnapshot.value.replay).toBe("pass");
      expect(aList.ok && aList.value.runs.map((run) => run.runId))
        .toEqual([persistenceInput.request.runId, persistenceInputA2.request.runId]);
      expect(aDetail.ok && aDetail.value.run.runId).toBe(persistenceInput.request.runId);
      expect(bSnapshot.ok && bSnapshot.value.metrics.totalRuns.value).toBe(1);
      expect(await databaseFingerprint()).toEqual(beforeOps);
    } finally {
      await runtimeA.close();
      await runtimeB.close();
    }
  }, 30_000);

  it("cancels a blocked scoped query, rolls back, releases and reuses the pool", async () => {
    const beforeOps = await databaseFingerprint();
    const blocker = await admin.connect();
    await blocker.query("begin");
    await blocker.query(
      "lock table public.investing_engine_runs in access exclusive mode",
    );
    const projection = new ScopedInvestingOpsIntegrityProjectionV1({
      pool: admin,
      pureRunner: purePhase3FRunnerForPersistence,
      timeoutMs: 150,
      budget: createInvestingOpsSoftBudgetV1(150),
    });
    const startedAt = performance.now();
    try {
      await expect(projection.inspectScope({
        contractVersion: "investing-identity-context/v1",
        authenticatedUserId: scope.ownerId,
        ownerId: scope.ownerId,
        tenantId: tenantA,
        portfolioId: scope.portfolioId,
        accountId: scope.accountId,
        role: "owner",
        permissions: permissions5br,
        requestId: "phase5dr-timeout-proof",
      })).resolves.toBe("incomplete");
    } finally {
      await blocker.query("rollback");
      blocker.release();
    }
    const durationMs = performance.now() - startedAt;
    expect(durationMs).toBeGreaterThanOrEqual(100);
    expect(durationMs).toBeLessThan(2_000);
    await expect(admin.query("select 1 result")).resolves.toMatchObject({
      rows: [{ result: 1 }],
    });
    const idleTransactions = await admin.query<{ count: number }>(
      `select count(*)::int count
         from pg_stat_activity
        where datname = current_database()
          and state = 'idle in transaction'`,
    );
    expect(idleTransactions.rows[0].count).toBe(0);
    expect(await databaseFingerprint()).toEqual(beforeOps);
  }, 10_000);
});
