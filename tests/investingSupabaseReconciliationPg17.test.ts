import fs from "node:fs";
import path from "node:path";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..");
const connectionString = process.env.PG17_RECONCILIATION_URL ?? "";
const repairMigration = "supabase/migrations/20260823000000_reconcile_zero_genesis_journal_residual.sql";
const productionResidualSha256 = "5833faf5ca3ab62250f460c1e35ede4b30e20caa58ba87c7b34a4563eb615248";
const genesisAndI5 = [
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
] as const;

let pool: Pool;
let client: PoolClient;

function readSql(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

async function applySql(relativePath: string) {
  try {
    await client.query(readSql(relativePath));
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`PG17 reconciliation rehearsal failed for ${relativePath}: ${message}`);
  }
}

async function applyRepairWithExpectedFingerprint(expectedFingerprint = productionResidualSha256) {
  const sql = readSql(repairMigration).replaceAll(productionResidualSha256, expectedFingerprint);
  try {
    await client.query(sql);
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`PG17 reconciliation rehearsal failed for ${repairMigration}: ${message}`);
  }
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

async function dropRoleIfPresent(role: "investing_app" | "investing_owner") {
  const exists = await client.query<{ exists: boolean }>(
    "select exists(select 1 from pg_roles where rolname = $1) as exists",
    [role],
  );
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
      if not exists (select 1 from pg_roles where rolname = 'anon') then
        create role anon nologin;
      end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then
        create role authenticated nologin;
      end if;
      if not exists (select 1 from pg_roles where rolname = 'service_role') then
        create role service_role nologin;
      end if;
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
    create table public.setup_status (
      user_id text primary key,
      completed boolean not null default false,
      mode text not null default 'offline',
      updated_at timestamptz not null default now()
    );
    create table public.trading_followed_positions (mode text);
    create table public.user_settings (
      active_mode text default 'trading',
      setup_mode text,
      modes jsonb not null default '{}'::jsonb
    );

    alter table public.setup_status enable row level security;
    grant all privileges on table public.setup_status to service_role;

    alter table public.plans
      add constraint plans_mode_check check (mode in ('trading','forex','crypto'));
    alter table public.portfolio_items
      add constraint portfolio_items_mode_check check (mode in ('trading','forex','crypto'));

    insert into public.journal_entries (user_id, mode, type, title, details, created_at)
    values ('pg17-control', 'trading', 'control_event', 'control', '{}'::jsonb, timestamptz '2026-09-05 13:59:11+00');
  `);
}

async function insertSyntheticResidual() {
  await client.query(`
    insert into public.journal_entries (user_id, mode, type, title, details, created_at)
    values (
      'pg17-synthetic-residual',
      'investing',
      'conversion_event',
      'synthetic retired Investing residual',
      '{"synthetic":true}'::jsonb,
      timestamptz '2026-09-05 13:59:12.762+00'
    )
  `);
}

async function assertGuardIsValidated() {
  const result = await client.query<{ count: number }>(`
    select count(*)::int as count
    from pg_constraint c
    where c.conrelid = 'public.journal_entries'::regclass
      and c.conname = 'journal_entries_no_retired_investing_mode_check'
      and c.contype = 'c'
      and c.convalidated
  `);
  expect(result.rows[0]?.count).toBe(1);
}

async function assertInvestingJournalWriteBlocked() {
  await expect(
    client.query(`
      insert into public.journal_entries (user_id, mode, type, title, details, created_at)
      values ('pg17-probe', 'investing', 'probe', 'probe', '{}'::jsonb, now())
    `),
  ).rejects.toThrow(/journal_entries_no_retired_investing_mode_check/i);
}

beforeAll(async () => {
  if (!connectionString) return;
  pool = new Pool({ connectionString, max: 1 });
  client = await pool.connect();
});

beforeEach(async () => {
  if (!connectionString) return;
  await resetDisposableDatabase();
});

afterAll(async () => {
  if (!connectionString) return;
  await resetDisposableDatabase().catch(() => undefined);
  client?.release();
  await pool?.end();
});

(connectionString ? describe : describe.skip)("Investing Supabase reconciliation PostgreSQL 17 rehearsal", () => {
  it("keeps an already-clean Zero-Genesis boundary clean and installs the recurrence guard", async () => {
    const version = await client.query<{ server_version: string }>("show server_version");
    expect(version.rows[0]?.server_version.startsWith("17.")).toBe(true);

    await applyRepairWithExpectedFingerprint();

    const residual = await client.query<{ count: number }>(`
      select count(*)::int as count
      from public.journal_entries
      where lower(coalesce(mode,'')) = 'investing'
    `);
    expect(residual.rows[0]?.count).toBe(0);
    await assertGuardIsValidated();
    await assertInvestingJournalWriteBlocked();
  });

  it("fails closed when non-sensitive identity matches but full-row fingerprint does not", async () => {
    await insertSyntheticResidual();

    await expect(client.query(readSql(repairMigration))).rejects.toThrow(/full-row SHA-256 fingerprint mismatch/i);
    await client.query("rollback");

    const residual = await client.query<{ count: number }>(`
      select count(*)::int as count
      from public.journal_entries
      where lower(coalesce(mode,'')) = 'investing'
    `);
    expect(residual.rows[0]?.count).toBe(1);

    const guard = await client.query<{ count: number }>(`
      select count(*)::int as count
      from pg_constraint
      where conrelid = 'public.journal_entries'::regclass
        and conname = 'journal_entries_no_retired_investing_mode_check'
    `);
    expect(guard.rows[0]?.count).toBe(0);
  });

  it("removes only the fingerprint-pinned residual, preserves unrelated rows, blocks recurrence, and replays current Genesis/I5", async () => {
    await insertSyntheticResidual();
    const syntheticFingerprint = await residualFingerprint();
    expect(syntheticFingerprint).not.toBe(productionResidualSha256);

    await applyRepairWithExpectedFingerprint(syntheticFingerprint);

    const journal = await client.query<{ mode: string; type: string }>(`
      select mode, type
      from public.journal_entries
      order by created_at, id
    `);
    expect(journal.rows).toEqual([{ mode: "trading", type: "control_event" }]);
    await assertGuardIsValidated();
    await assertInvestingJournalWriteBlocked();

    for (const migration of genesisAndI5) {
      await applySql(migration);
    }

    const authority = await client.query<{
      schema_owner: string;
      owner_exists: boolean;
      app_exists: boolean;
      app_usage: boolean;
      service_usage: boolean;
    }>(`
      select
        pg_get_userbyid(n.nspowner) as schema_owner,
        exists(select 1 from pg_roles where rolname = 'investing_owner') as owner_exists,
        exists(select 1 from pg_roles where rolname = 'investing_app') as app_exists,
        has_schema_privilege('investing_app', 'investing', 'USAGE') as app_usage,
        has_schema_privilege('service_role', 'investing', 'USAGE') as service_usage
      from pg_namespace n
      where n.nspname = 'investing'
    `);

    expect(authority.rows).toEqual([
      {
        schema_owner: "investing_owner",
        owner_exists: true,
        app_exists: true,
        app_usage: true,
        service_usage: false,
      },
    ]);

    const requiredRelations = [
      "principals",
      "tenants",
      "tenant_memberships",
      "accounts",
      "account_access",
      "idempotency_records",
      "audit_events",
      "pre_authority_audit_events",
      "ledger_accounts",
      "ledger_transactions",
      "ledger_postings",
      "ledger_transaction_seals",
      "research_investigations",
      "research_drafts",
      "research_material_revisions",
      "research_spec_revisions",
    ];

    const relations = await client.query<{ relname: string; rls: boolean; force_rls: boolean; owner: string }>(`
      select
        c.relname,
        c.relrowsecurity as rls,
        c.relforcerowsecurity as force_rls,
        pg_get_userbyid(c.relowner) as owner
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'investing'
        and c.relname = any($1::text[])
      order by c.relname
    `, [requiredRelations]);

    expect(relations.rows.map((row) => row.relname).sort()).toEqual([...requiredRelations].sort());
    for (const relation of relations.rows) {
      expect(relation.owner, relation.relname).toBe("investing_owner");
      expect(relation.rls, relation.relname).toBe(true);
      expect(relation.force_rls, relation.relname).toBe(true);
    }
  });
});
