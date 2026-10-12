import fs from "node:fs";
import path from "node:path";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");
const url = process.env.PG17_RECONCILIATION_URL ?? "";
const runPg = url ? describe : describe.skip;
const migrationName = "20261012180000_investing_i5_rl9c3b2a_embargo_fence_foundation.sql";
const files = fs.readdirSync(path.join(root, "supabase", "migrations"))
  .filter(name => name.endsWith(".sql")
    && name >= "20260825120000_investing_genesis_i2_authority_materialization.sql"
    && name <= migrationName)
  .sort();
const fence = "investing.research_blind_truth_embargo_fences_v1";
let db: Pool | null = null;

runPg("RL-9C3B2A: PostgreSQL 17 embargo fence foundation (NOT full resolver gate)", () => {
  beforeAll(async () => {
    db = new Pool({ connectionString: url, max: 2 });
    for (const name of files) {
      await db.query(fs.readFileSync(path.join(root, "supabase", "migrations", name), "utf8"));
    }
  }, 180_000);
  afterAll(async () => {
    await db?.end();
    db = null;
  });

  it("replays through C3B2A after C3B1 registration admission lock", async () => {
    expect(files.at(-1)).toBe(migrationName);
    const {rows} = await db!.query(`
      select has_function_privilege('investing_app',
        'investing.persist_research_blind_truth_registration_v1(text,jsonb)',
        'EXECUTE') as registration_open,
        (select count(*)::integer from investing.research_blind_truth_registrations_scientific_identities) as registrations,
        (select count(*)::integer from ${fence}) as fences
    `);
    expect(rows[0]).toEqual({registration_open:false,registrations:0,fences:0});
  });

  it("proves RLS FORCE and separate table ownership", async () => {
    const {rows} = await db!.query(`
      select pg_get_userbyid(c.relowner) as owner,
        c.relrowsecurity as rls, c.relforcerowsecurity as forced,
        (select count(*)::integer from pg_catalog.pg_policy
           where polrelid=c.oid) as policies
      from pg_catalog.pg_class c
      where c.oid='${fence}'::regclass
    `);
    expect(rows[0]).toEqual({owner:"investing_owner",rls:true,forced:true,policies:2});
  });

  it("restricts physical fence table privileges to internal writer; no frontend role access", async () => {
    const {rows} = await db!.query(`
      select role_name,
        has_table_privilege(role_name, '${fence}', 'SELECT') as can_select,
        has_table_privilege(role_name, '${fence}', 'INSERT') as can_insert,
        has_table_privilege(role_name, '${fence}', 'UPDATE') as can_update,
        has_table_privilege(role_name, '${fence}', 'DELETE') as can_delete
      from (values ('anon'),('authenticated'),('service_role'),
            ('investing_app'),('investing_rl9_writer')) r(role_name)
    `);
    for (const row of rows) {
      expect(row.can_update).toBe(false);
      expect(row.can_delete).toBe(false);
      if (row.role_name === "investing_rl9_writer") {
        expect(row.can_select).toBe(true);
        expect(row.can_insert).toBe(true);
      } else {
        expect(row.can_select).toBe(false);
        expect(row.can_insert).toBe(false);
      }
    }
  });

  it("installs the verified AFTER INSERT registration trigger and append-only fence", async () => {
    const {rows} = await db!.query(`
      select tgname, (tgtype & 2) = 0 as is_after,
        (tgtype & 4) <> 0 as is_insert,
        tgenabled
      from pg_catalog.pg_trigger
      where tgrelid='investing.research_blind_truth_registrations_scientific_identities'::regclass
        and tgname='research_blind_truth_registration_embargo_fence_v1'
        and not tgisinternal
    `);
    expect(rows).toEqual([{tgname:"research_blind_truth_registration_embargo_fence_v1",
      is_after:true,is_insert:true,tgenabled:"O"}]);
    const a=await db!.query(`
      select tgname from pg_catalog.pg_trigger
      where tgrelid='${fence}'::regclass
        and tgname='research_blind_truth_embargo_fences_append_only_v1'
    `);
    expect(a.rows).toHaveLength(1);
  });

  it("trigger function is writer-owned, SECURITY DEFINER and immutable search_path", async () => {
    const {rows} = await db!.query(`
      select pg_get_userbyid(p.proowner) as owner, p.prosecdef as security_definer,
        p.proconfig as configuration,
        pg_get_functiondef(p.oid) as body
      from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
      where n.nspname='investing' and p.proname='rl9c3b2a_fence_registration_v1'
    `);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.owner).toBe("investing_rl9_writer");
    expect(rows[0]!.security_definer).toBe(true);
    expect(rows[0]!.configuration).toContain("search_path=pg_catalog");
    expect(String(rows[0]!.body)).toContain("new.canonical_payload");
    expect(String(rows[0]!.body).toLowerCase()).toContain("insert into investing.research_blind_truth_embargo_fences_v1");
  });

  it("permits the owning installer role to attach trigger while denying frontend/service EXECUTE", async () => {
    const {rows}=await db!.query(`
      select role_name, has_function_privilege(
        role_name,'investing.rl9c3b2a_fence_registration_v1()','EXECUTE'
      ) as can_execute
      from (values ('investing_owner'),('investing_app'),('service_role'),
            ('anon'),('authenticated')) v(role_name)
    `);
    expect(rows).toEqual([
      {role_name:"investing_owner",can_execute:true},
      {role_name:"investing_app",can_execute:false},
      {role_name:"service_role",can_execute:false},
      {role_name:"anon",can_execute:false},
      {role_name:"authenticated",can_execute:false},
    ]);
  });

  it("actual app role is denied registration and direct fence reads/writes", async () => {
    const client=await db!.connect();
    try {
      await client.query("begin");
      await client.query("set local role investing_app");
      await expect(client.query(
        "select investing.persist_research_blind_truth_registration_v1(repeat('A',64),'{}'::jsonb)"
      )).rejects.toMatchObject({code:"42501"});
      await client.query("rollback");
      await client.query("begin");
      await client.query("set local role investing_app");
      await expect(client.query(`select * from ${fence}`)).rejects.toMatchObject({code:"42501"});
      await client.query("rollback");
      await client.query("begin");
      await client.query("set local role investing_app");
      await expect(client.query(`insert into ${fence} default values`)).rejects.toMatchObject({code:"42501"});
      await client.query("rollback");
    } finally {
      await client.query("rollback").catch(()=>undefined);
      client.release();
    }
  });

  it("writer SELECT policy rejects an absent or mismatched tenant context", async () => {
    const client=await db!.connect();
    try {
      await client.query("begin");
      await client.query("set local role investing_rl9_writer");
      const missing=await client.query(`select count(*)::int as n from ${fence}`);
      expect(missing.rows[0].n).toBe(0);
      await client.query("select set_config('syntrake.investing.tenant_id','11111111-1111-4111-8111-111111111111',true)");
      const unrelated=await client.query(`select count(*)::int as n from ${fence}`);
      expect(unrelated.rows[0].n).toBe(0);
      await client.query("rollback");
    } finally {
      await client.query("rollback").catch(()=>undefined);
      client.release();
    }
  });

  it("constrains the canonical scope hash, forbids confidential payload columns and append-only mutation", async () => {
    const {rows}=await db!.query(`
      select column_name from information_schema.columns
      where table_schema='investing'
        and table_name='research_blind_truth_embargo_fences_v1'
        and column_name ~* '(plaintext|ciphertext|secret|credential|locator|salt|hmac|key)'
    `);
    expect(rows).toEqual([]);
    const checks=await db!.query(`
      select pg_get_constraintdef(c.oid) as definition from pg_catalog.pg_constraint c
      where c.conrelid='${fence}'::regclass and c.conname='rl9c3b2a_canonical_scope_check'
    `);
    expect(checks.rows).toHaveLength(1);
    expect(checks.rows[0].definition).toContain("rl9b_holdout_scope_valid_v1");
    expect(checks.rows[0].definition).toContain("rl8c_sha256_hex_v1");
  });

  it("does not leak temporary writer/owner SET or CREATE capability to managed postgres", async () => {
    const {rows}=await db!.query(`
      select exists(
        select 1 from pg_catalog.pg_auth_members m
        where m.member='postgres'::regrole
          and m.roleid in ('investing_owner'::regrole,'investing_rl9_writer'::regrole)
          and (m.set_option or m.inherit_option)
      ) as effective_grant,
      has_schema_privilege('investing_rl9_writer','investing','CREATE') as writer_create
    `);
    expect(rows[0]).toEqual({effective_grant:false,writer_create:false});
  });
});
