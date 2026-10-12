import fs from "node:fs";
import path from "node:path";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");
const url = process.env.PG17_RECONCILIATION_URL ?? "";
const runPg = url ? describe : describe.skip;
const gateMigration = "20261012173000_investing_i5_rl9c3b1_registration_admission_lock.sql";
const b2Migration = "20261010183000_investing_i5_rl9b2_blind_truth_public_metadata_writers.sql";
const sqlPath = path.join(root, "supabase", "migrations");
const predecessors = fs.readdirSync(sqlPath)
  .filter(name => name.endsWith(".sql")
    && name >= "20260825120000_investing_genesis_i2_authority_materialization.sql"
    && name <= b2Migration)
  .sort();
let db: Pool | null = null;

async function appRegistrationEnabled(): Promise<boolean> {
  const { rows } = await db!.query<{ allowed: boolean }>(
    "select has_function_privilege('investing_app', 'investing.persist_research_blind_truth_registration_v1(text,jsonb)', 'EXECUTE') as allowed",
  );
  return rows[0]!.allowed;
}

runPg("RL-9C3B1: PostgreSQL 17 unsupported registration admission lock", () => {
  beforeAll(async () => {
    db = new Pool({ connectionString: url, max: 2 });
    for (const name of predecessors) {
      await db.query(fs.readFileSync(path.join(sqlPath, name), "utf8"));
    }
  }, 180_000);
  afterAll(async () => {
    await db?.end();
    db = null;
  });

  it("proves the prior RL-9B registration writer was reachable by investing_app", async () => {
    expect(await appRegistrationEnabled()).toBe(true);
  });

  it("applies the new migration once on a real isolated PostgreSQL 17 baseline", async () => {
    await db!.query(fs.readFileSync(path.join(sqlPath, gateMigration), "utf8"));
    expect(await appRegistrationEnabled()).toBe(false);
  });

  it("denies the registration writer to every ordinary application role", async () => {
    const { rows } = await db!.query<{
      role_name: string; may_execute: boolean;
    }>(`
      select name as role_name,
             has_function_privilege(name, 'investing.persist_research_blind_truth_registration_v1(text,jsonb)', 'EXECUTE') as may_execute
      from (values ('investing_app'), ('anon'), ('authenticated'), ('service_role')) v(name)
    `);
    expect(rows).toHaveLength(4);
    expect(rows.every(row => row.may_execute === false)).toBe(true);
  });

  it("rejects an actual attempted registration call under investing_app (42501)", async () => {
    const client = await db!.connect();
    try {
      await client.query("begin");
      await client.query("set local role investing_app");
      await expect(
        client.query("select investing.persist_research_blind_truth_registration_v1(repeat('A',64), '{}'::jsonb)"),
      ).rejects.toMatchObject({ code: "42501" });
      await client.query("rollback");
    } finally {
      client.release();
    }
  });

  it("does not alter the original writer owner, SECURITY DEFINER flag, or hash identity law", async () => {
    const { rows } = await db!.query<{
      owner: string; security_definer: boolean; search_path: string[];
    }>(`
      select pg_get_userbyid(p.proowner) as owner,
             p.prosecdef as security_definer,
             p.proconfig as search_path
      from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
      where n.nspname='investing' and p.proname='persist_research_blind_truth_registration_v1'
    `);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.owner).toBe("investing_rl9_writer");
    expect(rows[0]!.security_definer).toBe(true);
    expect(rows[0]!.search_path).toContain("search_path=pg_catalog");
  });

  it("retains the accepted public protocol writer and the existing tenant-bound read grant", async () => {
    const { rows } = await db!.query<{
      protocol_execute: boolean; metadata_read: boolean;
    }>(`
      select has_function_privilege('investing_app','investing.persist_research_blind_truth_protocol_v1(text,jsonb)','EXECUTE') as protocol_execute,
             has_table_privilege('investing_app','investing.research_blind_truth_registrations_scientific_identities','SELECT') as metadata_read
    `);
    expect(rows[0]!).toEqual({ protocol_execute: true, metadata_read: true });
  });

  it("does not leave temporary postgres writer SET/USAGE grants or schema CREATE permission", async () => {
    const { rows } = await db!.query<{
      writer_set: boolean; writer_usage: boolean; schema_create: boolean;
    }>(`
      select exists(
               select 1 from pg_catalog.pg_auth_members m
               where m.member='postgres'::regrole
                 and m.roleid='investing_rl9_writer'::regrole and m.set_option
             ) as writer_set,
             exists(
               select 1 from pg_catalog.pg_auth_members m
               where m.member='postgres'::regrole
                 and m.roleid='investing_rl9_writer'::regrole and m.inherit_option
             ) as writer_usage,
             has_schema_privilege('investing_rl9_writer','investing','CREATE') as schema_create
    `);
    expect(rows[0]!).toEqual({ writer_set: false, writer_usage: false, schema_create: false });
  });

  it("replay is idempotent; registration stays denied", async () => {
    await db!.query(fs.readFileSync(path.join(sqlPath, gateMigration), "utf8"));
    expect(await appRegistrationEnabled()).toBe(false);
  });

  it("does not create a false embargo/secret relation or enable real reveal", async () => {
    const { rows } = await db!.query<{
      exposed: string; registrations_rls: boolean; registrations_force: boolean;
    }>(`
      select coalesce((
        select string_agg(c.relname, ',')
        from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
        where n.nspname='investing' and (c.relname like 'research_blind_truth_embargo%' or c.relname like 'research_blind_truth_secret%')
          and c.relkind in ('r','p','v','m')
      ),'') as exposed,
      c.relrowsecurity as registrations_rls, c.relforcerowsecurity as registrations_force
      from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
      where n.nspname='investing' and c.relname='research_blind_truth_registrations_scientific_identities'
    `);
    expect(rows[0]).toEqual({ exposed: "", registrations_rls: true, registrations_force: true });
  });
});
