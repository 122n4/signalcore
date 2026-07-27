import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { canonicalDecimalFromString } from "@/lib/investing/engine/v1";
import {
  InvestingEnginePersistenceServiceV1,
} from "@/lib/investing/engine/v1/persistence";
import { PostgresInvestingEnginePersistenceAdapterV1 } from
  "@/lib/investing/engine/v1/persistence/postgres";
import {
  createInvestingUiServerLoadersV1,
} from "@/lib/investing/ui/server/loader.server";
import {
  assertDestructiveInvestingQaDatabase,
  assertEffectiveDestructiveInvestingQaDatabase,
} from "@/scripts/qa/investingDestructiveQaGuard";
import { buildPhase4BInput } from
  "@/tests/fixtures/investingEnginePhase4BFixture";

const databaseUrl = process.env.INVESTING_5F_TEST_DATABASE_URL;
const configuredDatabaseUrl = databaseUrl ?? "postgresql://invalid/phase5f_not_configured";
const pgDescribe = databaseUrl ? describe : describe.skip;
const destructiveQaTarget = databaseUrl
  ? assertDestructiveInvestingQaDatabase(
      databaseUrl,
      process.env.ALLOW_DESTRUCTIVE_INVESTING_QA,
    )
  : null;

const tenantA = "71000000-0000-4000-8000-000000000001";
const tenantB = "72000000-0000-4000-8000-000000000002";
const membershipA = "73000000-0000-4000-8000-000000000001";
const membershipB = "74000000-0000-4000-8000-000000000002";
const ownerA = "user_phase5f_owner_A";
const ownerB = "user_phase5f_owner_B";
const ownerC = "user_phase5f_owner_C";
const accountA = "75000000-0000-4000-8000-000000000001";
const accountB = "76000000-0000-4000-8000-000000000002";
const portfolioA = "phase5f_portfolio_a";
const portfolioB = "phase5f_portfolio_b";
const permissions = [
  "investing:read",
  "investing:create",
  "investing:verify",
  "investing:replay",
] as const;

const inputA = buildPhase4BInput({
  userId: ownerA,
  accountId: accountA,
  portfolioId: portfolioA,
  runId: "phase5f_run_a",
  idempotencyKey: "phase5f-key-a",
}).input;
const inputB = buildPhase4BInput({
  userId: ownerB,
  accountId: accountB,
  portfolioId: portfolioB,
  runId: "phase5f_run_b",
  idempotencyKey: "phase5f-key-b",
  cash: "37000.00",
  modelOverrides: {
    SPY: { commissionBps: canonicalDecimalFromString("7") },
    VWCE: { commissionBps: canonicalDecimalFromString("9") },
  },
}).input;

pgDescribe("FASE 5F PostgreSQL rollout A/B", () => {
  const admin = new pg.Pool({ connectionString: configuredDatabaseUrl, max: 8 });
  const adapter = new PostgresInvestingEnginePersistenceAdapterV1({
    connectionString: configuredDatabaseUrl,
    max: 8,
  });
  const persistence = new InvestingEnginePersistenceServiceV1(adapter);
  const clock = {
    now: () => ({ iso: "2026-07-27T12:00:00.000Z", monotonicMs: 1 }),
  };
  const loaders = (
    user: string,
    mode: unknown,
    allowedUserIds: unknown,
    connectionString = configuredDatabaseUrl,
  ) => createInvestingUiServerLoadersV1({
    connectionString,
    readUser: async () => user,
    clock,
    rollout: {
      readEnvironment: () => ({ mode, allowedUserIds }),
    },
  });

  async function fingerprint() {
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
    const tableFingerprints = await Promise.all(tables.map(async (table) => {
      const result = await admin.query<{ count: string; hash: string }>(
        `select count(*)::text count,
                md5(coalesce(string_agg(
                  row_data.xmin::text || ':' || row_to_json(row_data)::text,
                  '|' order by row_to_json(row_data)::text
                ), '')) hash
           from public.${table} row_data`,
      );
      return [table, result.rows[0]] as const;
    }));
    const sequences = await admin.query<{ hash: string }>(
      `select md5(coalesce(string_agg(
                sequencename || ':' || coalesce(last_value::text, 'null'),
                '|' order by sequencename
              ), '')) hash
         from pg_sequences
        where schemaname='public'
          and sequencename like 'investing_engine_%'`,
    );
    return Object.fromEntries([
      ...tableFingerprints,
      ["investing_engine_sequences", sequences.rows[0]],
    ]);
  }

  beforeAll(async () => {
    const effective = await admin.connect();
    try {
      const parameters = (effective as unknown as {
        connectionParameters: { host?: string; port?: number; database?: string };
      }).connectionParameters;
      assertEffectiveDestructiveInvestingQaDatabase(
        {
          host: parameters.host ?? "",
          port: parameters.port ?? 0,
          database: parameters.database ?? "",
        },
        destructiveQaTarget!,
      );
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
       values($1,$2,'personal','active'),($3,$4,'personal','active')`,
      [tenantA, ownerA, tenantB, ownerB],
    );
    await admin.query(
      `insert into public.investing_tenant_memberships(
         id,tenant_id,user_id,role,permissions,status
       ) values($1,$2,$3,'owner',$4,'active'),($5,$6,$7,'owner',$4,'active')`,
      [membershipA, tenantA, ownerA, permissions, membershipB, tenantB, ownerB],
    );
    await admin.query(
      `insert into public.investing_accounts(
         id,user_id,owner_user_id,tenant_id,portfolio_id,
         base_currency,environment,status
       ) values
         ($1,$2,$2,$3,$4,'EUR','paper','active'),
         ($5,$6,$6,$7,$8,'EUR','paper','active')`,
      [accountA, ownerA, tenantA, portfolioA, accountB, ownerB, tenantB, portfolioB],
    );
    await persistence.persist(inputA);
    await persistence.persist(inputB);
  }, 60_000);

  afterAll(async () => {
    await adapter.close();
    await admin.end();
  });

  it("allows A through the real runtime and blocks B before an unreachable DB", async () => {
    const before = await fingerprint();
    const allowed = `${ownerA}`;
    const allowedA = loaders(ownerA, "allowlist", allowed);
    const dashboardA = await allowedA.loadDashboard();
    const runsA = await allowedA.loadRuns();
    const detailA = await allowedA.loadRun("phase5f_run_a");
    const blockedB = await loaders(
      ownerB,
      "allowlist",
      allowed,
      "postgresql://127.0.0.1:1/phase5f_unreachable_qa",
    ).loadDashboard();
    expect(dashboardA.kind === "ready"
      && dashboardA.metrics.find((metric) => metric.key === "totalRuns")?.displayValue)
      .toBe("1");
    expect(runsA.kind === "ready" && runsA.runs.map((run) => run.runId))
      .toEqual(["phase5f_run_a"]);
    expect(detailA).toMatchObject({ kind: "ready" });
    expect(blockedB).toMatchObject({ kind: "unauthorized" });
    expect(await fingerprint()).toEqual(before);
  }, 60_000);

  it("allows B after configuration change without mixing A and B", async () => {
    const before = await fingerprint();
    const allowed = `${ownerA}, ${ownerB}`;
    const runsA = await loaders(ownerA, "allowlist", allowed).loadRuns();
    const runsB = await loaders(ownerB, "allowlist", allowed).loadRuns();
    expect(runsA.kind === "ready" && runsA.runs.map((run) => run.runId))
      .toEqual(["phase5f_run_a"]);
    expect(runsB.kind === "ready" && runsB.runs.map((run) => run.runId))
      .toEqual(["phase5f_run_b"]);
    expect(await fingerprint()).toEqual(before);
  }, 60_000);

  it("keeps cross-scope and missing detail indistinguishable", async () => {
    const before = await fingerprint();
    const allowed = `${ownerA},${ownerB}`;
    const ownerLoaders = loaders(ownerA, "allowlist", allowed);
    const cross = await ownerLoaders.loadRun("phase5f_run_b");
    const missing = await ownerLoaders.loadRun("phase5f_missing");
    expect(cross).toEqual(missing);
    expect(cross).toMatchObject({ kind: "not_found" });
    expect(await fingerprint()).toEqual(before);
  }, 60_000);

  it("keeps allowlisted C subject to official identity and RLS", async () => {
    const before = await fingerprint();
    const dashboard = await loaders(
      ownerC,
      "allowlist",
      `${ownerA},${ownerB},${ownerC}`,
    ).loadDashboard();
    expect(dashboard).toMatchObject({ kind: "unauthorized" });
    expect(await fingerprint()).toEqual(before);
  }, 60_000);

  it("implements off and on while preserving revocation and zero writes", async () => {
    const offBefore = await fingerprint();
    const unreachable = "postgresql://127.0.0.1:1/phase5f_unreachable_qa";
    await expect(loaders(ownerA, "off", ownerA, unreachable).loadDashboard())
      .resolves.toMatchObject({ kind: "unauthorized" });
    await expect(loaders(ownerB, "off", ownerB, unreachable).loadDashboard())
      .resolves.toMatchObject({ kind: "unauthorized" });
    expect(await fingerprint()).toEqual(offBefore);

    const onBefore = await fingerprint();
    await expect(loaders(ownerB, "on", "").loadDashboard())
      .resolves.toMatchObject({ kind: "ready" });
    expect(await fingerprint()).toEqual(onBefore);

    await admin.query(
      `update public.investing_tenant_memberships
          set status='revoked',
              revoked_at=statement_timestamp(),
              updated_at=statement_timestamp()
        where id=$1`,
      [membershipA],
    );
    const revokedBefore = await fingerprint();
    await expect(loaders(ownerA, "on", "").loadDashboard())
      .resolves.toMatchObject({ kind: "unauthorized" });
    expect(await fingerprint()).toEqual(revokedBefore);
  }, 60_000);
});
