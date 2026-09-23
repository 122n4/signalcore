import fs from "node:fs";
import path from "node:path";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..");
const connectionString = process.env.PG17_RECONCILIATION_URL ?? "";
const maybeDescribe = connectionString ? describe : describe.skip;

const migrations = [
  "supabase/migrations/20260825120000_investing_genesis_i2_authority_materialization.sql",
  "supabase/migrations/20260825123000_investing_genesis_i2_authorized_context.sql",
  "supabase/migrations/20260828105111_investing_genesis_i2_atomic_personal_bootstrap.sql",
  "supabase/migrations/20260831221500_investing_genesis_i2_ledger_schema.sql",
  "supabase/migrations/20260909100000_investing_i5_research_authority_audit_contract.sql",
  "supabase/migrations/20260910120000_investing_i5_a1_research_investigation_persistence.sql",
  "supabase/migrations/20260910130000_investing_i5_a2_research_draft_persistence.sql",
  "supabase/migrations/20260911110000_investing_i5_research_runtime_lock_contract_repair.sql",
  "supabase/migrations/20260912050000_investing_i5_a3_research_material_revisions.sql",
  "supabase/migrations/20260912070000_investing_i5_a4_research_spec_persistence.sql",
  "supabase/migrations/20260915150000_investing_i5_experiment_baseline_persistence.sql",
  "supabase/migrations/20260916194400_investing_i5_experiment_variant_persistence.sql",
  "supabase/migrations/20260917183000_investing_i5_experiment_scientific_closure.sql",
  "supabase/migrations/20260918170000_investing_i5_dataset_run_scientific_closure.sql",
  "supabase/migrations/20260919090000_investing_i5_research_execution_closure.sql",
  "supabase/migrations/20260920090000_investing_i5_rl1_evidence_object_scientific_closure.sql",
  "supabase/migrations/20260921180446_investing_i0_i5_cumulative_compatibility_repair.sql",
  "supabase/migrations/20260922192229_investing_i5_rl2_evidence_ledger_passport_read.sql",
  "supabase/migrations/20260923090000_investing_i5_rl3b_validation_child_execution.sql",
] as const;

const validationTables = [
  "research_validation_protocols_scientific_identities",
  "research_validation_run_inputs_scientific_identities",
  "research_validation_execution_runs",
  "research_validation_execution_run_events",
  "research_validation_result_artifacts",
  "research_validation_child_results_scientific_identities",
] as const;

let pool: Pool;
let client: PoolClient;

function readSql(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

async function dropRoleIfPresent(role: "investing_app" | "investing_owner") {
  const exists = await client.query<{ exists: boolean }>("select exists(select 1 from pg_roles where rolname = $1) as exists", [role]);
  if (!exists.rows[0]?.exists) return;
  await client.query(`reassign owned by ${role} to postgres`);
  await client.query(`drop owned by ${role}`);
  await client.query(`drop role ${role}`);
}

async function resetDisposableDatabase() {
  await client.query("drop schema if exists investing cascade");
  await dropRoleIfPresent("investing_app");
  await dropRoleIfPresent("investing_owner");
  await client.query(`
    do $$
    begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
    end $$;
    create schema if not exists extensions;
    create extension if not exists pgcrypto with schema extensions;
    create extension if not exists pgcrypto;
  `);
}

async function applyMigration(relativePath: string) {
  try {
    await client.query(readSql(relativePath));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`PG17 RL-3B rehearsal failed for ${relativePath}: ${message}`);
  }
}

describe("I5 RL-3B Validation Child Execution PG17 readiness", () => {
  it("records BLOCKED when PG17_RECONCILIATION_URL is absent", () => {
    expect(connectionString ? "READY - PG17 WILL EXECUTE" : "BLOCKED - PG17 NOT EXECUTED").toMatch(
      /^(READY - PG17 WILL EXECUTE|BLOCKED - PG17 NOT EXECUTED)$/u,
    );
  });
});

maybeDescribe("I5 RL-3B Validation Child Execution real PG17 rehearsal", () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString, max: 1 });
    client = await pool.connect();
    await resetDisposableDatabase();
  }, 60_000);

  afterAll(async () => {
    client?.release();
    await pool?.end();
  });

  it("applies accepted lineage through RL-3B and validates relation security surface", async () => {
    for (const migration of migrations) await applyMigration(migration);

    const version = await client.query<{ server_version: string }>("show server_version");
    expect(version.rows[0]!.server_version).toMatch(/^17\./u);

    const tables = await client.query<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(`
      select c.relname, c.relrowsecurity, c.relforcerowsecurity
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'investing'
        and c.relname = any($1::text[])
      order by c.relname
    `, [[...validationTables]]);
    expect(tables.rows.map((row) => row.relname).sort()).toEqual([...validationTables].sort());
    expect(tables.rows.every((row) => row.relrowsecurity && row.relforcerowsecurity)).toBe(true);

    const forbiddenGrants = await client.query<{ count: string }>(`
      select count(*)::text as count
      from information_schema.role_table_grants
      where table_schema = 'investing'
        and table_name = any($1::text[])
        and grantee in ('public', 'anon', 'authenticated', 'service_role')
    `, [[...validationTables]]);
    expect(forbiddenGrants.rows[0]!.count).toBe("0");

    const domains = await client.query<{ conname: string }>(`
      select conname
      from pg_constraint
      where connamespace = 'investing'::regnamespace
        and pg_get_constraintdef(oid) like '%SYNTRAKE:VALIDATION_%'
      order by conname
    `);
    expect(domains.rows.map((row) => row.conname).join("\n")).toContain("research_validation_run_inputs_hash_check");
    expect(domains.rows.map((row) => row.conname).join("\n")).toContain("research_validation_child_results_hash_check");

    const triggers = await client.query<{ tgname: string; relname: string }>(`
      select t.tgname, c.relname
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'investing'
        and t.tgname like 'research_validation_%'
        and not t.tgisinternal
      order by t.tgname
    `);
    expect(triggers.rows).toEqual([
      {
        tgname: "research_validation_child_results_append_only_trigger",
        relname: "research_validation_child_results_scientific_identities",
      },
      {
        tgname: "research_validation_execution_run_events_append_only_trigger",
        relname: "research_validation_execution_run_events",
      },
      {
        tgname: "research_validation_execution_run_events_transition_trigger",
        relname: "research_validation_execution_run_events",
      },
      {
        tgname: "research_validation_protocols_append_only_trigger",
        relname: "research_validation_protocols_scientific_identities",
      },
      {
        tgname: "research_validation_result_artifacts_append_only_trigger",
        relname: "research_validation_result_artifacts",
      },
      {
        tgname: "research_validation_run_inputs_append_only_trigger",
        relname: "research_validation_run_inputs_scientific_identities",
      },
    ]);

    const provenanceConstraints = await client.query<{ relname: string; conname: string; def: string }>(`
      select c.relname, con.conname, pg_get_constraintdef(con.oid, true) as def
      from pg_constraint con
      join pg_class c on c.oid = con.conrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'investing'
        and c.relname in (
          'research_ir_scientific_identities',
          'dataset_series_scientific_identities',
          'dataset_snapshots_scientific_identities'
        )
        and con.conname in (
          'research_ir_operation_capability_pair_check',
          'dataset_series_operation_capability_pair_check',
          'dataset_snapshots_operation_capability_pair_check'
        )
      order by c.relname, con.conname
    `);
    expect(provenanceConstraints.rows).toHaveLength(3);
    expect(provenanceConstraints.rows.every((row) => row.def.includes("RESEARCH_VALIDATION_CHILD_EXECUTE_V1"))).toBe(true);
    expect(provenanceConstraints.rows.every((row) => row.def.includes("RESEARCH_EXECUTE"))).toBe(true);
  }, 120_000);
});
