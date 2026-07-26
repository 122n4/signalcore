import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createProductionInvestingIdentityScopeResolverV1 } from
  "@/lib/investing/identity/infrastructure/factory.server";

const databaseUrl = process.env.INVESTING_5BR_TEST_DATABASE_URL;
const pgDescribe = databaseUrl ? describe : describe.skip;
const configured = databaseUrl ?? "postgresql://invalid/not-configured";
const permissions = [
  "investing:read",
  "investing:create",
  "investing:verify",
  "investing:replay",
] as const;

pgDescribe("FASE 5B-R real PostgreSQL/RLS vertical", () => {
  const admin = new pg.Pool({ connectionString: configured });
  let sessionUser: string | null = null;
  let sessionReads = 0;
  const resolver = createProductionInvestingIdentityScopeResolverV1({
    connectionString: configured,
    readUser: async () => {
      sessionReads += 1;
      return sessionUser;
    },
  });

  async function reset() {
    await admin.query("delete from public.investing_accounts");
    await admin.query("delete from public.investing_tenant_memberships");
    await admin.query("delete from public.investing_tenants");
    await admin.query(`
      insert into public.investing_tenants(id,owner_user_id,kind,status) values
      ('10000000-0000-4000-8000-000000000001','owner-a','personal','active'),
      ('20000000-0000-4000-8000-000000000002','owner-b','personal','active')
    `);
    await admin.query(`
      insert into public.investing_tenant_memberships(
        id,tenant_id,user_id,role,permissions,status
      ) values
      ('11000000-0000-4000-8000-000000000001',
       '10000000-0000-4000-8000-000000000001','owner-a','owner',$1,'active'),
      ('22000000-0000-4000-8000-000000000002',
       '20000000-0000-4000-8000-000000000002','owner-b','owner',$1,'active')
    `, [permissions]);
    await admin.query(`
      insert into public.investing_accounts(
        id,user_id,owner_user_id,tenant_id,portfolio_id,
        base_currency,environment,status
      ) values
      ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','owner-a','owner-a',
       '10000000-0000-4000-8000-000000000001','portfolio-a','EUR','paper','active'),
      ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','owner-b','owner-b',
       '20000000-0000-4000-8000-000000000002','portfolio-b','EUR','paper','active')
    `);
  }

  async function resolveAs(
    user: string | null,
    operation: "get_run" | "verify_run" = "get_run",
  ) {
    sessionUser = user;
    return resolver.resolve(operation);
  }

  beforeAll(reset);
  afterAll(async () => admin.end());

  it("resolves A and B only to their persisted scopes", async () => {
    await expect(resolveAs("owner-a")).resolves.toMatchObject({
      ownerId: "owner-a",
      portfolioId: "portfolio-a",
      accountId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      permissions,
    });
    await expect(resolveAs("owner-b")).resolves.toMatchObject({
      ownerId: "owner-b",
      portfolioId: "portfolio-b",
    });
  });

  it("blocks no session and absent membership without enumeration", async () => {
    await expect(resolveAs(null))
      .rejects.toThrow("identity_scope_not_authorized");
    await expect(resolveAs("owner-c"))
      .rejects.toThrow("identity_scope_not_authorized");
    expect(sessionReads).toBeGreaterThanOrEqual(2);
  });

  it.each(["inactive", "revoked"] as const)(
    "blocks a %s membership",
    async (status) => {
      await reset();
      await admin.query(
        `update investing_tenant_memberships
         set status=$1, revoked_at=case when $1='revoked' then now() else null end
         where user_id='owner-a'`,
        [status],
      );
      await expect(resolveAs("owner-a"))
        .rejects.toThrow("identity_scope_not_authorized");
    },
  );

  it("blocks inactive tenant/account and rejects missing permission at write", async () => {
    await reset();
    await admin.query(
      "update investing_tenants set status='inactive' where owner_user_id='owner-a'",
    );
    await expect(resolveAs("owner-a"))
      .rejects.toThrow("identity_scope_not_authorized");

    await reset();
    await admin.query(
      "update investing_accounts set status='suspended' where owner_user_id='owner-a'",
    );
    await expect(resolveAs("owner-a"))
      .rejects.toThrow("identity_scope_not_authorized");

    await reset();
    await expect(admin.query(
      `update investing_tenant_memberships
       set permissions=array['investing:read','investing:create',
                             'investing:replay','investing:replay']
       where user_id='owner-a'`,
    )).rejects.toThrow();
  });

  it("enforces the composite account tenant/owner binding transactionally", async () => {
    await reset();
    await admin.query("begin");
    try {
      await admin.query(
        `update investing_accounts set tenant_id=tenant_id,
         owner_user_id=owner_user_id where owner_user_id='owner-a'`,
      );
      await expect(admin.query(
        `update investing_accounts
         set tenant_id='20000000-0000-4000-8000-000000000002'
         where owner_user_id='owner-a'`,
      )).rejects.toThrow();
    } finally {
      await admin.query("rollback");
    }
    const account = await admin.query(
      `select owner_user_id,tenant_id::text
       from investing_accounts where user_id='owner-a'`,
    );
    expect(account.rows).toEqual([{
      owner_user_id: "owner-a",
      tenant_id: "10000000-0000-4000-8000-000000000001",
    }]);

    await expect(admin.query(`
      insert into investing_accounts(
        id,user_id,owner_user_id,tenant_id,portfolio_id,
        base_currency,environment,status
      ) values(
        'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        'owner-a','owner-a',
        '20000000-0000-4000-8000-000000000002',
        'portfolio-cross','EUR','paper','active'
      )
    `)).rejects.toThrow();
    await expect(admin.query(
      `update investing_accounts
       set user_id='owner-b',owner_user_id='owner-b'
       where owner_user_id='owner-a'`,
    )).rejects.toThrow();
  });

  it("normalizes anon to zero grants and authenticated to SELECT only", async () => {
    const grants = await admin.query<{
      grantee: string;
      privileges: string;
    }>(`
      select grantee, array_agg(distinct privilege_type order by privilege_type)
        privileges
      from information_schema.role_table_grants
      where table_schema='public'
        and table_name in (
          'investing_tenants','investing_tenant_memberships',
          'investing_accounts','investing_engine_runs',
          'investing_engine_artifacts','investing_engine_phase_summaries',
          'investing_engine_reason_evidence',
          'investing_engine_shadow_packages',
          'investing_engine_idempotency_keys'
        )
        and grantee in ('anon','authenticated')
      group by grantee
      order by grantee
    `);
    expect(grants.rows).toEqual([{
      grantee: "authenticated",
      privileges: "{SELECT}",
    }]);
    const sequenceGrants = await admin.query(`
      select 1
      from information_schema.role_usage_grants
      where object_schema='public'
        and grantee in ('anon','authenticated')
        and object_name like 'investing_engine_%'
    `);
    expect(sequenceGrants.rowCount).toBe(0);
  });

  it("rejects additional or ambiguous personal memberships", async () => {
    await reset();
    await expect(admin.query(
      `insert into investing_tenant_memberships(
         tenant_id,user_id,role,permissions,status
       ) values(
         '10000000-0000-4000-8000-000000000001',
         'owner-a','owner',$1,'active'
       )`,
      [permissions],
    )).rejects.toThrow();
    await expect(admin.query(
      `insert into investing_tenant_memberships(
         tenant_id,user_id,role,permissions,status
       ) values(
         '10000000-0000-4000-8000-000000000001',
         'owner-b','owner',$1,'active'
       )`,
      [permissions],
    )).rejects.toThrow();
  });

  it("fails uniformly when the production directory dependency is unavailable", async () => {
    const unavailable = createProductionInvestingIdentityScopeResolverV1({
      connectionString:
        "postgresql://postgres:postgres@127.0.0.1:1/unavailable?connect_timeout=1",
      readUser: async () => "owner-a",
    });
    await expect(unavailable.resolve("get_run"))
      .rejects.toThrow("identity_scope_not_authorized");
  });

  it("performs zero writes during directory and resolver reads", async () => {
    await reset();
    const before = await admin.query(`
      select md5(string_agg(payload, '|' order by payload)) fingerprint
      from (
        select row_to_json(t)::text payload from investing_tenants t
        union all
        select row_to_json(m)::text from investing_tenant_memberships m
        union all
        select row_to_json(a)::text from investing_accounts a
        union all
        select row_to_json(r)::text from investing_engine_runs r
        union all
        select row_to_json(a)::text from investing_engine_artifacts a
        union all
        select row_to_json(s)::text from investing_engine_phase_summaries s
        union all
        select row_to_json(e)::text from investing_engine_reason_evidence e
        union all
        select row_to_json(s)::text from investing_engine_shadow_packages s
        union all
        select row_to_json(i)::text from investing_engine_idempotency_keys i
      ) rows
    `);
    await resolveAs("owner-a");
    const after = await admin.query(`
      select md5(string_agg(payload, '|' order by payload)) fingerprint
      from (
        select row_to_json(t)::text payload from investing_tenants t
        union all
        select row_to_json(m)::text from investing_tenant_memberships m
        union all
        select row_to_json(a)::text from investing_accounts a
        union all
        select row_to_json(r)::text from investing_engine_runs r
        union all
        select row_to_json(a)::text from investing_engine_artifacts a
        union all
        select row_to_json(s)::text from investing_engine_phase_summaries s
        union all
        select row_to_json(e)::text from investing_engine_reason_evidence e
        union all
        select row_to_json(s)::text from investing_engine_shadow_packages s
        union all
        select row_to_json(i)::text from investing_engine_idempotency_keys i
      ) rows
    `);
    expect(after.rows[0]).toEqual(before.rows[0]);
  });
});
