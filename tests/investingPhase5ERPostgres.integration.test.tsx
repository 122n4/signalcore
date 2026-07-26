import pg from "pg";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  InvestingDashboard,
  InvestingRunCard,
} from "@/components/investing/InvestingRuntimeUi";
import { canonicalDecimalFromString } from "@/lib/investing/engine/v1";
import {
  InvestingEnginePersistenceServiceV1,
} from "@/lib/investing/engine/v1/persistence";
import { PostgresInvestingEnginePersistenceAdapterV1 } from
  "@/lib/investing/engine/v1/persistence/postgres";
import {
  loadInvestingDashboardV1,
  loadInvestingRunV1,
  loadInvestingRunsV1,
} from "@/lib/investing/ui/server/loader.server";
import {
  assertDestructiveInvestingQaDatabase,
  assertEffectiveDestructiveInvestingQaDatabase,
} from "@/scripts/qa/investingDestructiveQaGuard";
import {
  buildPhase4BInput,
} from "@/tests/fixtures/investingEnginePhase4BFixture";

const databaseUrl = process.env.INVESTING_5ER_TEST_DATABASE_URL;
const configuredDatabaseUrl = databaseUrl ?? "postgresql://invalid/phase5er_not_configured";
const pgDescribe = databaseUrl ? describe : describe.skip;
const destructiveQaTarget = databaseUrl
  ? assertDestructiveInvestingQaDatabase(
      databaseUrl,
      process.env.ALLOW_DESTRUCTIVE_INVESTING_QA,
    )
  : null;

const tenantA = "61000000-0000-4000-8000-000000000001";
const tenantB = "62000000-0000-4000-8000-000000000002";
const membershipA = "63000000-0000-4000-8000-000000000001";
const membershipB = "64000000-0000-4000-8000-000000000002";
const ownerA = "phase5er_owner_a";
const ownerB = "phase5er_owner_b";
const ownerC = "phase5er_owner_c";
const accountA = "65000000-0000-4000-8000-000000000001";
const accountB = "66000000-0000-4000-8000-000000000002";
const portfolioA = "phase5er_portfolio_a";
const portfolioB = "phase5er_portfolio_b";
const permissions = [
  "investing:read",
  "investing:create",
  "investing:verify",
  "investing:replay",
] as const;

const inputA1 = buildPhase4BInput({
  userId: ownerA,
  accountId: accountA,
  portfolioId: portfolioA,
  runId: "phase5er_run_a_1",
  idempotencyKey: "phase5er-key-a-1",
}).input;
const inputA2 = buildPhase4BInput({
  userId: ownerA,
  accountId: accountA,
  portfolioId: portfolioA,
  runId: "phase5er_run_a_2",
  idempotencyKey: "phase5er-key-a-2",
  cash: "25000.00",
}).input;
const inputB = buildPhase4BInput({
  userId: ownerB,
  accountId: accountB,
  portfolioId: portfolioB,
  runId: "phase5er_run_b_1",
  idempotencyKey: "phase5er-key-b-1",
  cash: "37000.00",
  modelOverrides: {
    SPY: { commissionBps: canonicalDecimalFromString("7") },
    VWCE: { commissionBps: canonicalDecimalFromString("9") },
  },
}).input;

pgDescribe("FASE 5E-R PostgreSQL UI runtime A/B", () => {
  const admin = new pg.Pool({ connectionString: configuredDatabaseUrl, max: 8 });
  const adapter = new PostgresInvestingEnginePersistenceAdapterV1({
    connectionString: configuredDatabaseUrl,
    max: 8,
  });
  const persistence = new InvestingEnginePersistenceServiceV1(adapter);
  const clock = {
    now: () => ({ iso: "2026-07-26T12:00:00.000Z", monotonicMs: 1 }),
  };
  const options = (user: string) => ({
    connectionString: configuredDatabaseUrl,
    readUser: async () => user,
    clock,
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
    return Object.fromEntries(await Promise.all(tables.map(async (table) => {
      const result = await admin.query<{ count: string; hash: string }>(
        `select count(*)::text count,
                md5(coalesce(string_agg(
                  row_data.xmin::text || ':' || row_to_json(row_data)::text,
                  '|' order by row_to_json(row_data)::text
                ), '')) hash
           from public.${table} row_data`,
      );
      return [table, result.rows[0]];
    })));
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
    await persistence.persist(inputA1);
    await persistence.persist(inputA2);
    await persistence.persist(inputB);
  }, 60_000);

  afterAll(async () => {
    await adapter.close();
    await admin.end();
  });

  it("renders owner A dashboard and history from the real runtime without scope leaks", async () => {
    const before = await fingerprint();
    const dashboard = await loadInvestingDashboardV1(options(ownerA));
    const runs = await loadInvestingRunsV1(options(ownerA));
    expect(dashboard.kind).toBe("ready");
    expect(runs.kind).toBe("ready");
    if (dashboard.kind !== "ready" || runs.kind !== "ready") return;
    expect(dashboard.metrics.find((metric) => metric.key === "totalRuns")?.displayValue).toBe("2");
    expect(runs.runs.map((run) => run.runId)).toEqual([
      "phase5er_run_a_1",
      "phase5er_run_a_2",
    ]);
    const html = renderToStaticMarkup(<InvestingDashboard data={dashboard} />);
    expect(html).not.toMatch(/phase5er_owner_|61000000|65000000|phase5er_portfolio/u);
    expect(html).not.toMatch(/password|token|cookie|postgresql:\/\/|select\s|ops_|identity_/iu);
    expect(await fingerprint()).toEqual(before);
  }, 60_000);

  it("returns real authorized detail and indistinguishable missing/cross-scope states", async () => {
    const before = await fingerprint();
    const own = await loadInvestingRunV1("phase5er_run_a_1", options(ownerA));
    const missing = await loadInvestingRunV1("phase5er_missing", options(ownerA));
    const crossScope = await loadInvestingRunV1("phase5er_run_b_1", options(ownerA));
    expect(own.kind).toBe("ready");
    expect(missing).toEqual(crossScope);
    expect(missing).toEqual({
      kind: "not_found",
      title: "Run não disponível",
      description: "O run não existe ou não está acessível.",
    });
    if (own.kind === "ready") {
      const html = renderToStaticMarkup(<InvestingRunCard run={own.run} />);
      expect(html).not.toMatch(/owner|tenant|account|portfolio|canonicalPayload/iu);
    }
    expect(await fingerprint()).toEqual(before);
  }, 60_000);

  it("isolates owner B from owner A", async () => {
    const before = await fingerprint();
    const dashboard = await loadInvestingDashboardV1(options(ownerB));
    const runs = await loadInvestingRunsV1(options(ownerB));
    expect(dashboard.kind === "ready"
      && dashboard.metrics.find((metric) => metric.key === "totalRuns")?.displayValue).toBe("1");
    expect(runs.kind === "ready" && runs.runs.map((run) => run.runId))
      .toEqual(["phase5er_run_b_1"]);
    expect(await loadInvestingRunV1("phase5er_run_a_1", options(ownerB)))
      .toEqual(await loadInvestingRunV1("phase5er_missing", options(ownerB)));
    expect(await fingerprint()).toEqual(before);
  }, 60_000);

  it("denies a session without membership without enumerating data", async () => {
    const before = await fingerprint();
    const dashboard = await loadInvestingDashboardV1(options(ownerC));
    const runs = await loadInvestingRunsV1(options(ownerC));
    expect(dashboard).toMatchObject({ kind: "unauthorized" });
    expect(runs).toMatchObject({ kind: "unauthorized" });
    expect(JSON.stringify([dashboard, runs])).not.toMatch(/ownerA|ownerB|phase5er_run/u);
    expect(await fingerprint()).toEqual(before);
  }, 60_000);

  it("cuts access immediately after membership revocation and performs zero writes", async () => {
    await admin.query(
      `update public.investing_tenant_memberships
          set status='revoked',
              revoked_at=statement_timestamp(),
              updated_at=statement_timestamp()
        where id=$1`,
      [membershipA],
    );
    const before = await fingerprint();
    const dashboard = await loadInvestingDashboardV1(options(ownerA));
    const detail = await loadInvestingRunV1("phase5er_run_a_1", options(ownerA));
    expect(dashboard).toMatchObject({ kind: "unauthorized" });
    expect(detail).toMatchObject({ kind: "unauthorized" });
    expect(await fingerprint()).toEqual(before);
  }, 60_000);
});
