import fs from "node:fs";
import path from "node:path";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");
const sqlDirectory = path.join(root, "supabase", "migrations");
const url = process.env.PG17_RECONCILIATION_URL ?? "";
const runPg = url ? describe : describe.skip;
const migration = "20261012183000_investing_i5_rl9c3b2b2_denied_read_journal.sql";
const migrations = fs.readdirSync(sqlDirectory)
  .filter(name => name.endsWith(".sql") &&
    name >= "20260825120000_investing_genesis_i2_authority_materialization.sql" &&
    name <= migration)
  .sort();
const table = "investing.research_blind_truth_denied_read_attempts_v1";
const functionName = "investing.rl9c3b2b2_record_unproven_read_v1(text)";
const tenantA = "11111111-1111-4111-8111-111111111111";
const tenantB = "22222222-2222-4222-8222-222222222222";
const principalA = "33333333-3333-4333-8333-333333333333";
const membershipA = "44444444-4444-4444-8444-444444444444";
const investigationA = "55555555-5555-4555-8555-555555555555";
const sha = "A".repeat(64);
let db: Pool | null = null;

async function setAppContext(client: PoolClient, tenant = tenantA, operation = "RESEARCH_EXECUTION_RUN_V1") {
  await client.query("set local role investing_app");
  const entries = {
    tenant_id: tenant,
    principal_id: principalA,
    tenant_membership_id: membershipA,
    research_investigation_id: investigationA,
    actor_kind: "USER_PRINCIPAL",
    operation,
    capability: "RESEARCH_EXECUTE",
    operation_scope: "TENANT_SCOPE",
    source_context: "PURE_RESEARCH",
  };
  for (const [key, value] of Object.entries(entries)) {
    await client.query("select set_config($1,$2,true)", ["syntrake.investing." + key, value]);
  }
}

runPg("RL-9C3B2B2: PostgreSQL 17 blocked-read journal (NOT an access authorizer)", () => {
  beforeAll(async () => {
    db = new Pool({ connectionString: url, max: 4 });
    for (const name of migrations) {
      await db.query(fs.readFileSync(path.join(sqlDirectory, name), "utf8"));
    }
  }, 180_000);
  afterAll(async () => { await db?.end(); db = null; });

  it("replays through C3B2B2 with registration still locked and no registered holdouts", async () => {
    expect(migrations.at(-1)).toBe(migration);
    const result = await db!.query(`
      select has_function_privilege('investing_app',
          'investing.persist_research_blind_truth_registration_v1(text,jsonb)',
          'EXECUTE') as registration_open,
        (select count(*)::int from investing.research_blind_truth_registrations_scientific_identities) as registrations,
        (select count(*)::int from investing.research_blind_truth_embargo_fences_v1) as fences,
        (select count(*)::int from ${table}) as attempts`);
    expect(result.rows[0]).toEqual({
      registration_open: false, registrations: 0, fences: 0, attempts: 0,
    });
  });

  it("creates a FORCE RLS append-only journal with no application/service table grants", async () => {
    const found = await db!.query(`
      select pg_get_userbyid(c.relowner) as owner, c.relrowsecurity as rls,
             c.relforcerowsecurity as forced
        from pg_catalog.pg_class c where c.oid='${table}'::regclass`);
    expect(found.rows).toEqual([{ owner: "investing_owner", rls: true, forced: true }]);
    const grant = await db!.query(`
      select role_name,
        has_table_privilege(role_name, '${table}', 'SELECT') as select_allowed,
        has_table_privilege(role_name, '${table}', 'INSERT') as insert_allowed
      from (values ('anon'),('authenticated'),('service_role'),('investing_app'),('investing_rl9_writer')) v(role_name)`);
    expect(grant.rows).toEqual([
      { role_name: "anon", select_allowed: false, insert_allowed: false },
      { role_name: "authenticated", select_allowed: false, insert_allowed: false },
      { role_name: "service_role", select_allowed: false, insert_allowed: false },
      { role_name: "investing_app", select_allowed: false, insert_allowed: false },
      { role_name: "investing_rl9_writer", select_allowed: true, insert_allowed: true },
    ]);
    const triggers = await db!.query(`
      select tgname from pg_catalog.pg_trigger where tgrelid='${table}'::regclass
      and tgname='research_blind_truth_denied_reads_append_only_v1' and not tgisinternal`);
    expect(triggers.rows).toHaveLength(1);
  });

  it("allows only the app to call the DENIAL recorder; no direct registration or secret access", async () => {
    const res=await db!.query(`
      select role_name, has_function_privilege(role_name, '${functionName}', 'EXECUTE') as allowed
      from (values ('investing_app'),('anon'),('authenticated'),('service_role')) r(role_name)`);
    expect(res.rows).toEqual([
      { role_name: "investing_app", allowed: true },
      { role_name: "anon", allowed: false },
      { role_name: "authenticated", allowed: false },
      { role_name: "service_role", allowed: false },
    ]);
  });

  it("commits an actual blocked attempt under investing_app but exposes no byte-reading API", async () => {
    const client = await db!.connect();
    try {
      await client.query("begin");
      await setAppContext(client);
      const result=await client.query(
        "select investing.rl9c3b2b2_record_unproven_read_v1($1) as decision",[sha]);
      expect(result.rows).toEqual([{ decision: "UNPROVEN_NOT_AUTHORIZED" }]);
      await client.query("commit");
    } finally {
      await client.query("rollback").catch(()=>undefined); client.release();
    }
    const attempts=await db!.query(`select tenant_id::text, series_hash_hex,decision
          from ${table} order by recorded_at`);
    expect(attempts.rows).toEqual([{
      tenant_id: tenantA, series_hash_hex: sha, decision: "UNPROVEN_NOT_AUTHORIZED",
    }]);
  });

  it("fails closed on missing context, wrong operation, bad series ref and direct app table access", async () => {
    const client=await db!.connect();
    try {
      await client.query("begin");
      await client.query("set local role investing_app");
      await expect(client.query(
        "select investing.rl9c3b2b2_record_unproven_read_v1($1)",[sha]))
        .rejects.toMatchObject({ code: "P0001" });
      await client.query("rollback");
      await client.query("begin");
      await setAppContext(client, tenantA, "RESEARCH_MUTATE_UNRELATED");
      await expect(client.query(
        "select investing.rl9c3b2b2_record_unproven_read_v1($1)",[sha]))
        .rejects.toMatchObject({ code: "P0001" });
      await client.query("rollback");
      await client.query("begin");
      await setAppContext(client);
      await expect(client.query(
        "select investing.rl9c3b2b2_record_unproven_read_v1($1)",["not-a-hash"]))
        .rejects.toMatchObject({ code: "P0001" });
      await client.query("rollback");
      await client.query("begin");
      await setAppContext(client);
      await expect(client.query(`select * from ${table}`))
        .rejects.toMatchObject({ code: "42501" });
      await client.query("rollback");
    } finally {
      await client.query("rollback").catch(()=>undefined); client.release();
    }
  });

  it("a denied attempt rolls back with its transaction (not false durable evidence)", async () => {
    const before=await db!.query(`select count(*)::int as n from ${table}`);
    const client=await db!.connect();
    try {
      await client.query("begin");
      await setAppContext(client);
      const answer=await client.query(
        "select investing.rl9c3b2b2_record_unproven_read_v1($1) as decision",[sha]);
      expect(answer.rows[0].decision).toBe("UNPROVEN_NOT_AUTHORIZED");
      await client.query("rollback");
    } finally {
      await client.query("rollback").catch(()=>undefined); client.release();
    }
    const after=await db!.query(`select count(*)::int as n from ${table}`);
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });

  it("has registration BEFORE INSERT locking and both lock paths bound to the same tenant key", async () => {
    const trigger=await db!.query(`
      select (tgtype & 2) <> 0 as before_insert, tgenabled
      from pg_catalog.pg_trigger
      where tgrelid='investing.research_blind_truth_registrations_scientific_identities'::regclass
        and tgname='research_blind_truth_registration_read_lock_v1' and not tgisinternal`);
    expect(trigger.rows).toEqual([{ before_insert: true, tgenabled: "O" }]);
    for (const fn of ["rl9c3b2b2_lock_registration_v1","rl9c3b2b2_record_unproven_read_v1"]) {
      const result=await db!.query(`
        select pg_get_functiondef(p.oid) as source, pg_get_userbyid(p.proowner) as owner, p.proconfig as config
        from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
        where n.nspname='investing' and p.proname=$1`,[fn]);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].source).toContain("pg_advisory_xact_lock(9100332");
      expect(result.rows[0].owner).toBe("investing_rl9_writer");
      expect(result.rows[0].config).toContain("search_path=pg_catalog");
    }
  });

  it("actual PG17 concurrent blocked read waits for its tenant transaction lock", async () => {
    const lockHolder=await db!.connect();
    const readCaller=await db!.connect();
    try {
      await lockHolder.query("begin");
      await lockHolder.query("select pg_advisory_xact_lock(9100332,hashtext($1))",[tenantB]);
      await readCaller.query("begin");
      await setAppContext(readCaller,tenantB,"RESEARCH_VALIDATION_CHILD_EXECUTE_V1");
      let completed=false;
      const pending=readCaller.query(
        "select investing.rl9c3b2b2_record_unproven_read_v1($1) as decision",[sha]
      ).then(res=>{completed=true;return res;});
      await new Promise(resolve=>setTimeout(resolve,100));
      expect(completed).toBe(false);
      await lockHolder.query("commit");
      const result=await pending;
      expect(result.rows[0].decision).toBe("UNPROVEN_NOT_AUTHORIZED");
      await readCaller.query("commit");
    } finally {
      await lockHolder.query("rollback").catch(()=>undefined);
      await readCaller.query("rollback").catch(()=>undefined);
      lockHolder.release();readCaller.release();
    }
    const rows=await db!.query(`select count(*)::int as n from ${table} where tenant_id=$1`,[tenantB]);
    expect(rows.rows[0].n).toBe(1);
  });

  it("enforces per-tenant RLS on the writer role without widening read grants", async () => {
    const client=await db!.connect();
    try {
      await client.query("begin");
      await client.query("set local role investing_rl9_writer");
      for (const [key,value] of Object.entries({
        tenant_id: tenantA, principal_id:principalA, tenant_membership_id:membershipA,
        research_investigation_id:investigationA,
      })) await client.query("select set_config($1,$2,true)",["syntrake.investing."+key,value]);
      const rows=await client.query(`select tenant_id::text as tenant from ${table}`);
      expect(rows.rows).toHaveLength(1);
      expect(rows.rows[0].tenant).toBe(tenantA);
      await client.query("rollback");
    } finally { await client.query("rollback").catch(()=>undefined);client.release(); }
  });

  it("leaves no temporary CREATE or role membership and grants no read ALLOW", async () => {
    const check=await db!.query(`
      select has_schema_privilege('investing_rl9_writer','investing','CREATE') as create_allowed,
        exists (select 1 from pg_catalog.pg_auth_members m
          where m.member='postgres'::regrole
          and m.roleid in ('investing_owner'::regrole,'investing_rl9_writer'::regrole)
          and (m.set_option or m.inherit_option)) as transient_membership`);
    expect(check.rows).toEqual([{ create_allowed: false, transient_membership: false }]);
    const decisions=await db!.query(`select distinct decision from ${table}`);
    expect(decisions.rows).toEqual([{ decision: "UNPROVEN_NOT_AUTHORIZED" }]);
  });
  it("rejects real UPDATE and DELETE of committed blocked-read evidence", async () => {
    const client=await db!.connect();
    try {
      await client.query("begin");
      await expect(client.query(
        `update ${table} set decision='UNPROVEN_NOT_AUTHORIZED' where tenant_id=$1`,[tenantA],
      )).rejects.toMatchObject({ code:"P0001" });
      await client.query("rollback");
      await client.query("begin");
      await expect(client.query(
        `delete from ${table} where tenant_id=$1`,[tenantA],
      )).rejects.toMatchObject({ code:"P0001" });
      await client.query("rollback");
    } finally {
      await client.query("rollback").catch(()=>undefined);
      client.release();
    }
    const row=await db!.query(`select count(*)::int as n from ${table} where tenant_id=$1`,[tenantA]);
    expect(row.rows[0].n).toBe(1);
  });

});
