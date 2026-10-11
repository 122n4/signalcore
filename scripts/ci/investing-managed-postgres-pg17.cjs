"use strict";
// Full-chain PostgreSQL 17 rehearsal under a Supabase-like (non-superuser,
// CREATEROLE) migration executor. CI-only: never run against a live database.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { Client } = require("pg");
const url = process.env.PG17_MANAGED_RECONCILIATION_URL;
assert.equal(process.env.GITHUB_ACTIONS, "true", "CI only");
assert.equal(process.env.CI, "true", "CI only");
assert.ok(url, "missing disposable database URL");
const parsed = new URL(url);
assert.equal(parsed.hostname, "127.0.0.1", "refusing remote database");
assert.equal(parsed.port, "5432");
assert.equal(parsed.username, "postgres");
assert.equal(parsed.pathname, "/postgres");
const root = path.resolve(__dirname, "../..");
const migrations = fs.readdirSync(path.join(root, "supabase/migrations"))
  .filter(name => name.endsWith(".sql") &&
    name >= "20260825120000_investing_genesis_i2_authority_materialization.sql" &&
    name <= "20261010183000_investing_i5_rl9b2_blind_truth_public_metadata_writers.sql")
  .sort();
assert.ok(migrations.length >= 34, "incomplete Genesis baseline");
assert.equal(migrations[migrations.length-1], "20261010183000_investing_i5_rl9b2_blind_truth_public_metadata_writers.sql");
async function main() {
  const bootstrapUrl = process.env.PG17_BOOTSTRAP_ADMIN_URL;
assert.ok(bootstrapUrl, "missing privileged CI bootstrap URL");
const adminTarget = new URL(bootstrapUrl);
assert.equal(adminTarget.hostname, "127.0.0.1");
assert.equal(adminTarget.port, "5432");
assert.equal(adminTarget.pathname, "/postgres");
assert.equal(adminTarget.username, "bootstrap_admin");
const bootstrap = new Client({connectionString:bootstrapUrl});
  await bootstrap.connect();
  try {
    const pre = await bootstrap.query("select current_user, rolsuper from pg_roles where rolname = current_user");
    assert.equal(pre.rows[0].current_user, "bootstrap_admin");
    assert.equal(pre.rows[0].rolsuper, true, "initial Docker role must be superuser");
    const schema = await bootstrap.query("select exists(select 1 from pg_namespace where nspname='investing') as present");
    assert.equal(schema.rows[0].present, false, "disposable database must be pristine");
    for (const role of ["anon","authenticated","service_role"]) {
      await bootstrap.query("create role " + role + " nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls");
    }
    await bootstrap.query("create role postgres login password 'postgres' inherit nosuperuser createdb createrole noreplication nobypassrls");
    // Managed Supabase postgres inherits pg_read_all_data; the accepted I2
    // Ledger prestate requires schema USAGE while remaining non-superuser.
    // This is administrative replay authority, never app/writer authority.
    await bootstrap.query("grant pg_read_all_data to postgres");
    await bootstrap.query("alter database postgres owner to postgres");
    await bootstrap.query("create schema extensions authorization postgres");
    await bootstrap.query("create extension pgcrypto with schema extensions");
    // All migrations connect as non-superuser postgres. Bootstrap admin is never reused.
  } finally { await bootstrap.end(); }
  const client = new Client({connectionString:url});
  await client.connect();
  try {
    const role = await client.query("select current_user, rolsuper, rolcreatedb, rolcreaterole from pg_roles where rolname=current_user");
    assert.deepEqual(role.rows[0], {current_user:"postgres", rolsuper:false, rolcreatedb:true, rolcreaterole:true});
    const dataRole = await client.query("select pg_has_role('postgres','pg_read_all_data','USAGE') as has_read_all_data");
    assert.equal(dataRole.rows[0].has_read_all_data,true,"managed schema USAGE capability missing");
    for (const name of migrations) {
      const sql = fs.readFileSync(path.join(root,"supabase/migrations",name),"utf8");
      assert.ok(sql.startsWith("begin;") && sql.trimEnd().endsWith("commit;"),"migration must be transactional "+name);
      try { await client.query(sql); }
      catch(e) { console.error("MANAGED_ROLE_REPLAY_FAIL "+name+" SQLSTATE="+(e.code||"UNKNOWN")); throw e; }
      console.log("MANAGED_ROLE_REPLAY_PASS "+name);
    }
    const result = await client.query([
      "select (select rolsuper from pg_roles where rolname='postgres') as superuser,",
      "(select rolcreaterole from pg_roles where rolname='postgres') as can_create_roles,",
      "has_schema_privilege('investing_rl9_writer','investing','CREATE') as writer_can_create,",
      "pg_has_role('postgres','investing_rl9_writer','SET') as postgres_can_set_writer,",
      "pg_has_role('postgres','investing_rl9_writer','USAGE') as postgres_inherits_writer,",
      "(select count(*)::integer from pg_auth_members m where m.roleid='investing_rl9_writer'::regrole",
      "and m.member='postgres'::regrole and m.admin_option and not m.set_option and not m.inherit_option) as admin_only_grants,",
      "(select count(*)::integer from pg_auth_members m where m.roleid='investing_rl9_writer'::regrole",
      "and (m.member <> 'postgres'::regrole or m.set_option or m.inherit_option or not m.admin_option)) as forbidden_writer_grants,",
      "(select count(*)::integer from pg_class c join pg_namespace n on n.oid=c.relnamespace",
      "where n.nspname='investing' and c.relname like 'research_blind_truth_%_scientific_identities'",
      "and c.relrowsecurity and c.relforcerowsecurity) as rls_relations"
    ].join("\n"));
    const v = result.rows[0];
    assert.equal(v.superuser,false);
    assert.equal(v.can_create_roles,true);
    assert.equal(v.writer_can_create,false);
    assert.equal(v.postgres_can_set_writer,false);
    assert.equal(v.postgres_inherits_writer,false);
    assert.equal(v.admin_only_grants,1,"automatic ADMIN-only membership not preserved");
    assert.equal(v.forbidden_writer_grants,0);
    assert.equal(v.rls_relations,5);
    console.log("MANAGED_ROLE_REPLAY_PASS exact role/RLS/ACL invariants");
  } finally { await client.end(); }
}
main().catch(e=>{console.error(e);process.exitCode=1;});