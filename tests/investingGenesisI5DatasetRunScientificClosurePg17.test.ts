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
  `);
  await client.query(`
    do $$
    begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
    end $$;
    create schema if not exists extensions;
    create extension if not exists pgcrypto with schema extensions;
    create table public.daily_snapshots (mode text default 'trading');
    create table public.journal_entries (
      id uuid primary key default gen_random_uuid(),
      user_id text not null,
      mode text,
      type text not null,
      title text not null,
      details jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );
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
    values ('pg17-control', 'trading', 'control_event', 'control', '{}'::jsonb, timestamptz '2026-09-05 13:59:11+00');
    insert into public.journal_entries (user_id, mode, type, title, details, created_at)
    values ('pg17-synthetic-residual', 'investing', 'conversion_event', 'synthetic retired Investing residual', '{"synthetic":true}'::jsonb, timestamptz '2026-09-05 13:59:12.762+00');
  `);
}

async function residualFingerprint() {
  const result = await client.query<{ sha256: string }>(`
    select encode(extensions.digest(to_jsonb(j)::text, 'sha256'), 'hex') as sha256
    from public.journal_entries as j
    where lower(coalesce(mode,'')) = 'investing'
  `);
  expect(result.rows).toHaveLength(1);
  return result.rows[0]!.sha256;
}

async function applyCanonicalChain() {
  const fingerprint = await residualFingerprint();
  await client.query(readSql(repairMigration).replaceAll(productionResidualSha256, fingerprint));
  for (const migration of migrations) await client.query(readSql(migration));
}

maybeDescribe("I5 Dataset/Run scientific closure PG17 rehearsal", () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString });
    client = await pool.connect();
  });

  afterAll(async () => {
    client?.release();
    await pool?.end();
  });

  it("applies canonical migrations through Dataset/Run scientific closure with validated fail-closed constraints", async () => {
    await resetDisposableDatabase();
    await applyCanonicalChain();
    const tables = [
      "dataset_series_scientific_identities",
      "dataset_snapshots_scientific_identities",
      "metric_request_sets_scientific_identities",
      "execution_configs_scientific_identities",
      "research_specs_scientific_identities",
      "run_inputs_scientific_identities",
    ];
    const rls = await client.query<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(`
      select relname, relrowsecurity, relforcerowsecurity
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'investing' and relname = any($1::text[])
      order by relname
    `, [tables]);
    expect(rls.rows).toHaveLength(tables.length);
    expect(rls.rows.every((row) => row.relrowsecurity && row.relforcerowsecurity)).toBe(true);
    const badGrants = await client.query(`
      select 1
      from information_schema.role_table_grants
      where table_schema = 'investing'
        and table_name = any($1::text[])
        and grantee = 'investing_app'
        and privilege_type not in ('SELECT','INSERT')
    `, [tables]);
    expect(badGrants.rowCount).toBe(0);
    const checks = await client.query<{ convalidated: boolean }>(`
      select convalidated
      from pg_catalog.pg_constraint con
      join pg_catalog.pg_class c on c.oid = con.conrelid
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'investing'
        and c.relname = any($1::text[])
        and con.contype = 'c'
    `, [tables]);
    expect(checks.rows.length).toBeGreaterThan(12);
    expect(checks.rows.every((row) => row.convalidated)).toBe(true);
  }, 20_000);

  it("rejects malformed scientific envelopes without relying on writers", async () => {
    await resetDisposableDatabase();
    await applyCanonicalChain();
    await client.query("insert into investing.principals (principal_id, external_provider, external_subject) values ('10000000-0000-4000-8000-000000000091', 'CLERK', 'pg17-dataset-run')");
    await client.query("insert into investing.tenants (tenant_id) values ('20000000-0000-4000-8000-000000000091')");
    await expect(client.query(`
      insert into investing.dataset_series_scientific_identities (
        dataset_series_identity_id, tenant_id, principal_id, operation_scope, source_context,
        hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload
      ) values (
        'a1000000-0000-4000-8000-000000000091',
        '20000000-0000-4000-8000-000000000091',
        '10000000-0000-4000-8000-000000000091',
        'TENANT_SCOPE',
        'PURE_RESEARCH',
        'SHA-256',
        'SYNTRAKE:DATASET_SNAPSHOT:V1',
        'SYNTRAKE_SHA256_V1',
        '87C9363E3E5EF9B055F9DF76FDB51C60EBA2A64D50B78FEB66339EFC06BCF382',
        '{"schemaVersion":"DATASET_SERIES_HASH_PAYLOAD_V1"}'::jsonb
      )
    `)).rejects.toThrow(/dataset_series_hash_envelope_check/i);
    await expect(client.query(`
      insert into investing.metric_request_sets_scientific_identities (
        metric_request_set_identity_id, tenant_id, principal_id, operation_scope, source_context,
        metric_registry_version, hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload
      ) values (
        'a2000000-0000-4000-8000-000000000091',
        '20000000-0000-4000-8000-000000000091',
        '10000000-0000-4000-8000-000000000091',
        'TENANT_SCOPE',
        'PURE_RESEARCH',
        'METRIC_REGISTRY_V20260918',
        'SHA-256',
        'SYNTRAKE:METRIC_REQUEST_SET:V1',
        'SYNTRAKE_SHA256_V1',
        'bad',
        '{"schemaVersion":"METRIC_REQUEST_SET_HASH_PAYLOAD_V1","metricRegistryVersion":"METRIC_REGISTRY_V20260918"}'::jsonb
      )
    `)).rejects.toThrow(/metric_request_sets_hash_envelope_check/i);
  }, 20_000);
});
