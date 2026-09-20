import fs from "node:fs";
import path from "node:path";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..");
const connectionString = process.env.PG17_RECONCILIATION_URL ?? "";
const maybeDescribe = connectionString ? describe : describe.skip;

const repairMigration = "supabase/migrations/20260823000000_reconcile_zero_genesis_journal_residual.sql";
const productionResidualSha256 = "5833faf5ca3ab62250f460c1e35ede4b30e20caa58ba87c7b34a4563eb615248";
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
  "supabase/migrations/20260920160000_investing_i5_rl2_evidence_ledger_passport_read.sql",
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
    drop table if exists public.daily_snapshots cascade;
    drop table if exists public.journal_entries cascade;
    drop table if exists public.paper_trades cascade;
    drop table if exists public.plans cascade;
    drop table if exists public.portfolio_items cascade;
    drop table if exists public.portfolio_meta cascade;
    drop table if exists public.portfolios cascade;
    drop table if exists public.setup_status cascade;
    drop table if exists public.trading_followed_positions cascade;
    drop table if exists public.user_settings cascade;
    do $$
    begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
    end $$;
    create schema if not exists extensions;
    create extension if not exists pgcrypto with schema extensions;
    create table public.daily_snapshots (mode text default 'trading');
    create table public.journal_entries (id uuid primary key default gen_random_uuid(), user_id text not null, mode text, type text not null, title text not null, details jsonb not null default '{}'::jsonb, created_at timestamptz not null default now());
    create table public.paper_trades (mode text default 'trading');
    create table public.plans (mode text);
    create table public.portfolio_items (mode text default 'trading');
    create table public.portfolio_meta (mode text);
    create table public.portfolios (mode text default 'trading');
    create table public.setup_status (user_id text primary key, completed boolean not null default false, mode text not null default 'offline', updated_at timestamptz not null default now());
    create table public.trading_followed_positions (mode text);
    create table public.user_settings (active_mode text default 'trading', setup_mode text, modes jsonb not null default '{}'::jsonb);
    alter table public.setup_status enable row level security;
    grant all privileges on table public.setup_status to service_role;
    alter table public.plans add constraint plans_mode_check check (mode in ('trading','forex','crypto'));
    alter table public.portfolio_items add constraint portfolio_items_mode_check check (mode in ('trading','forex','crypto'));
    insert into public.journal_entries (user_id, mode, type, title, details, created_at)
    values ('pg17-control', 'trading', 'control_event', 'control', '{}'::jsonb, timestamptz '2026-09-05 13:59:11+00'),
      ('pg17-synthetic-residual', 'investing', 'conversion_event', 'synthetic retired Investing residual', '{"synthetic":true}'::jsonb, timestamptz '2026-09-05 13:59:12.762+00');
  `);
}

async function residualFingerprint() {
  const result = await client.query<{ sha256: string }>(`
    select encode(extensions.digest(to_jsonb(j)::text, 'sha256'), 'hex') as sha256
    from public.journal_entries as j
    where lower(coalesce(mode,'')) = 'investing'
  `);
  return result.rows[0]!.sha256;
}

async function applyCanonicalChainThroughRl2() {
  const fingerprint = await residualFingerprint();
  await client.query(readSql(repairMigration).replaceAll(productionResidualSha256, fingerprint));
  for (const migration of migrations) {
    try {
      await client.query(readSql(migration));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`PG17 RL-2 rehearsal failed for ${migration}: ${message}`);
    }
  }
}

maybeDescribe("I5 RL-2 Passport PG17 migration rehearsal", () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString });
    client = await pool.connect();
    await resetDisposableDatabase();
    await applyCanonicalChainThroughRl2();
  }, 120_000);

  afterAll(async () => {
    await client?.release();
    await pool?.end();
  });

  it("proves PostgreSQL 17 and installs RL-2 read authority without Passport persistence", async () => {
    const version = await client.query<{ server_version: string }>("show server_version");
    expect(version.rows[0]?.server_version).toMatch(/^17\./);

    const passportTables = await client.query<{ count: number }>(`
      select count(*)::int as count
      from information_schema.tables
      where table_schema = 'investing'
        and table_name like '%passport%'
    `);
    expect(passportTables.rows[0]?.count).toBe(0);

    const policies = await client.query<{ policyname: string }>(`
      select policyname
      from pg_policies
      where schemaname = 'investing'
        and policyname like 'research_passport_%'
      order by policyname
    `);
    expect(policies.rows.map((row) => row.policyname)).toEqual(
      expect.arrayContaining([
        "research_passport_investigations_select",
        "research_passport_material_revisions_select",
        "research_passport_experiments_select",
        "research_passport_run_inputs_select",
        "research_passport_execution_runs_select",
        "research_passport_results_select",
        "research_passport_evidence_select",
      ]),
    );
  });

  it("proves the Passport read operation runs under investing_app and cannot mutate scientific records", async () => {
    await client.query("begin");
    await client.query("set local role investing_app");
    await client.query("select set_config($1, $2, true)", ["syntrake.investing.operation", "RESEARCH_PASSPORT_READ_V1"]);
    await client.query("select set_config($1, $2, true)", ["syntrake.investing.capability", "RESEARCH_READ"]);
    await client.query("select set_config($1, $2, true)", ["syntrake.investing.operation_scope", "TENANT_SCOPE"]);
    await client.query("select set_config($1, $2, true)", ["syntrake.investing.source_context", "PURE_RESEARCH"]);
    const proof = await client.query<{ current_user: string; current_role: string }>("select current_user, current_role");
    expect(proof.rows[0]).toEqual({ current_user: "investing_app", current_role: "investing_app" });

    await expect(client.query("delete from investing.research_evidence_objects_scientific_identities")).rejects.toThrow();
    await client.query("rollback");
  });
});
