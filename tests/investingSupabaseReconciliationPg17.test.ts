import fs from "node:fs";
import { createHash } from "node:crypto";
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
  "supabase/migrations/20260915150000_investing_i5_experiment_baseline_persistence.sql",
  "supabase/migrations/20260916194400_investing_i5_experiment_variant_persistence.sql",
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

const hashA = "A".repeat(64);
const hashB = "B".repeat(64);
const hashC = "C".repeat(64);
const hashD = "D".repeat(64);
const hashE = "E".repeat(64);
const hashF = "F".repeat(64);

type LabScope = "TENANT_SCOPE" | "ACCOUNT_SCOPE";

type LabFixture = {
  actorId: string;
  principalId: string;
  tenantId: string;
  tenantMembershipId: string;
  accountId: string | null;
  accountAccessId: string | null;
  sourceContext: "PURE_RESEARCH" | "USER_PORTFOLIO";
  investigationId: string;
  otherInvestigationId: string;
  draftRootId: string;
  draftRevisionId: string;
  nextDraftRevisionId: string;
  hypothesisRootId: string;
  hypothesisRevisionId: string;
  nextHypothesisRevisionId: string;
  specRootId: string;
  specRevisionId: string;
  nextSpecRevisionId: string;
  experimentId: string;
  idempotencyRecordId: string;
  idempotencyKey: string;
  correlationId: string;
  materialRequestHash: string;
};

function experimentFixtureMaterialRequestHash(scope: LabScope, suffix: string, specHasHypothesis: boolean) {
  const dependencyMode = specHasHypothesis ? "DEPENDENT" : "INDEPENDENT";
  return createHash("sha256")
    .update(`PG17_EXPERIMENT_BASELINE_FIXTURE_V1|${scope}|${suffix}|${dependencyMode}`)
    .digest("hex")
    .toUpperCase();
}

function variantFixtureMaterialRequestHash(scope: LabScope, suffix: string, parentExperimentId: string, expectedExperimentId: string) {
  return createHash("sha256")
    .update(`PG17_EXPERIMENT_VARIANT_FIXTURE_V1|${scope}|${suffix}|${parentExperimentId}|${expectedExperimentId}`)
    .digest("hex")
    .toUpperCase();
}

function fixture(scope: LabScope, suffix: string, specHasHypothesis: boolean): LabFixture {
  const accountScope = scope === "ACCOUNT_SCOPE";
  const tail = suffix.padStart(12, "0").slice(-12);
  return {
    actorId: `pg17-i5-${suffix}`,
    principalId: `10000000-0000-4000-8000-${tail}`,
    tenantId: `20000000-0000-4000-8000-${tail}`,
    tenantMembershipId: `30000000-0000-4000-8000-${tail}`,
    accountId: accountScope ? `40000000-0000-4000-8000-${tail}` : null,
    accountAccessId: accountScope ? `50000000-0000-4000-8000-${tail}` : null,
    sourceContext: accountScope ? "USER_PORTFOLIO" : "PURE_RESEARCH",
    investigationId: `60000000-0000-4000-8000-${tail}`,
    otherInvestigationId: `61000000-0000-4000-8000-${tail}`,
    draftRootId: `70000000-0000-4000-8000-${tail}`,
    draftRevisionId: `71000000-0000-4000-8000-${tail}`,
    nextDraftRevisionId: `72000000-0000-4000-8000-${tail}`,
    hypothesisRootId: `80000000-0000-4000-8000-${tail}`,
    hypothesisRevisionId: `81000000-0000-4000-8000-${tail}`,
    nextHypothesisRevisionId: `82000000-0000-4000-8000-${tail}`,
    specRootId: `90000000-0000-4000-8000-${tail}`,
    specRevisionId: `91000000-0000-4000-8000-${tail}`,
    nextSpecRevisionId: `92000000-0000-4000-8000-${tail}`,
    experimentId: `a0000000-0000-4000-8000-${tail}`,
    idempotencyRecordId: `b0000000-0000-4000-8000-${tail}`,
    idempotencyKey: `idem-pg17-i5-${suffix}-0001`,
    correlationId: `corr-pg17-i5-${suffix}-0001`,
    materialRequestHash: experimentFixtureMaterialRequestHash(scope, suffix, specHasHypothesis),
  };
}

async function applyGenesisAndI5() {
  await insertSyntheticResidual();
  const syntheticFingerprint = await residualFingerprint();
  await applyRepairWithExpectedFingerprint(syntheticFingerprint);
  for (const migration of genesisAndI5) await applySql(migration);
}

async function seedLabFixture(row: LabFixture, specHasHypothesis: boolean) {
  const fixtureTail = row.principalId.slice(-12);
  const accountColumns = row.accountId === null
    ? { accountId: "null", accountAccessId: "null" }
    : { accountId: `'${row.accountId}'`, accountAccessId: `'${row.accountAccessId}'` };
  const specBinding = specHasHypothesis
    ? `'${row.hypothesisRevisionId}', '${hashC}', 'RESEARCH_SPEC_CANDIDATE_V1', 'CANDIDATE_ONLY', jsonb_build_object('schemaVersion','RESEARCH_SPEC_CANDIDATE_V1','status','CANDIDATE_ONLY','sourceDraft',jsonb_build_object('hashHex','${hashB}'),'hypothesisBinding',jsonb_build_object('kind','EXPLICIT_HYPOTHESIS','hypothesis',jsonb_build_object('hashHex','${hashC}')))`
    : `null, null, 'RESEARCH_SPEC_CANDIDATE_V1', 'CANDIDATE_ONLY', jsonb_build_object('schemaVersion','RESEARCH_SPEC_CANDIDATE_V1','status','CANDIDATE_ONLY','sourceDraft',jsonb_build_object('hashHex','${hashB}'),'hypothesisBinding',jsonb_build_object('kind','NO_HYPOTHESIS'))`;

  await client.query(`
    insert into investing.principals (principal_id, external_provider, external_subject)
    values ('${row.principalId}', 'CLERK', '${row.actorId}');
    insert into investing.tenants (tenant_id) values ('${row.tenantId}');
    insert into investing.tenant_memberships (tenant_membership_id, tenant_id, principal_id)
    values ('${row.tenantMembershipId}', '${row.tenantId}', '${row.principalId}');
    ${row.accountId === null ? "" : `
      insert into investing.accounts (account_id, tenant_id, initial_tenant_membership_id, initial_principal_id, base_currency)
      values ('${row.accountId}', '${row.tenantId}', '${row.tenantMembershipId}', '${row.principalId}', 'USD');
      insert into investing.account_access (account_access_id, account_id, tenant_id, tenant_membership_id, principal_id)
      values ('${row.accountAccessId}', '${row.accountId}', '${row.tenantId}', '${row.tenantMembershipId}', '${row.principalId}');
    `}
    insert into investing.idempotency_records (
      idempotency_record_id, idempotency_key, material_request_hash, correlation_id, actor_kind, actor_id,
      operation_scope, operation, principal_id, tenant_id, account_id, status, completed_at
    ) values
      ('c1000000-0000-4000-8000-${fixtureTail}', 'idem-investigation-${row.principalId.slice(-1)}-0001', '${hashA}', 'corr-investigation-${row.principalId.slice(-1)}-0001', 'USER_PRINCIPAL', '${row.actorId}', '${row.accountId === null ? "TENANT_SCOPE" : "ACCOUNT_SCOPE"}', 'RESEARCH_INVESTIGATION_CREATE_V1', '${row.principalId}', '${row.tenantId}', ${accountColumns.accountId}, 'SUCCEEDED', timestamptz '2026-09-16 00:00:00+00'),
      ('c1100000-0000-4000-8000-${fixtureTail}', 'idem-other-${row.principalId.slice(-1)}-0001', '${hashA}', 'corr-other-${row.principalId.slice(-1)}-0001', 'USER_PRINCIPAL', '${row.actorId}', '${row.accountId === null ? "TENANT_SCOPE" : "ACCOUNT_SCOPE"}', 'RESEARCH_INVESTIGATION_CREATE_V1', '${row.principalId}', '${row.tenantId}', ${accountColumns.accountId}, 'SUCCEEDED', timestamptz '2026-09-16 00:00:00+00'),
      ('c2000000-0000-4000-8000-${fixtureTail}', 'idem-draft-${row.principalId.slice(-1)}-0001', '${hashB}', 'corr-draft-${row.principalId.slice(-1)}-0001', 'USER_PRINCIPAL', '${row.actorId}', '${row.accountId === null ? "TENANT_SCOPE" : "ACCOUNT_SCOPE"}', 'RESEARCH_DRAFT_REVISION_CREATE_V1', '${row.principalId}', '${row.tenantId}', ${accountColumns.accountId}, 'SUCCEEDED', timestamptz '2026-09-16 00:00:00+00'),
      ('c3000000-0000-4000-8000-${fixtureTail}', 'idem-hypothesis-${row.principalId.slice(-1)}-0001', '${hashC}', 'corr-hypothesis-${row.principalId.slice(-1)}-0001', 'USER_PRINCIPAL', '${row.actorId}', '${row.accountId === null ? "TENANT_SCOPE" : "ACCOUNT_SCOPE"}', 'RESEARCH_HYPOTHESIS_REVISION_CREATE_V1', '${row.principalId}', '${row.tenantId}', ${accountColumns.accountId}, 'SUCCEEDED', timestamptz '2026-09-16 00:00:00+00'),
      ('c4000000-0000-4000-8000-${fixtureTail}', 'idem-spec-${row.principalId.slice(-1)}-0001', '${hashD}', 'corr-spec-${row.principalId.slice(-1)}-0001', 'USER_PRINCIPAL', '${row.actorId}', '${row.accountId === null ? "TENANT_SCOPE" : "ACCOUNT_SCOPE"}', 'RESEARCH_SPEC_REVISION_CREATE_V1', '${row.principalId}', '${row.tenantId}', ${accountColumns.accountId}, 'SUCCEEDED', timestamptz '2026-09-16 00:00:00+00'),
      ('c5000000-0000-4000-8000-${fixtureTail}', 'idem-next-draft-${row.principalId.slice(-1)}-0001', '${hashD}', 'corr-next-draft-${row.principalId.slice(-1)}-0001', 'USER_PRINCIPAL', '${row.actorId}', '${row.accountId === null ? "TENANT_SCOPE" : "ACCOUNT_SCOPE"}', 'RESEARCH_DRAFT_REVISION_CREATE_V1', '${row.principalId}', '${row.tenantId}', ${accountColumns.accountId}, 'SUCCEEDED', timestamptz '2026-09-16 00:00:00+00'),
      ('c6000000-0000-4000-8000-${fixtureTail}', 'idem-next-hypothesis-${row.principalId.slice(-1)}-0001', '${hashE}', 'corr-next-hypothesis-${row.principalId.slice(-1)}-0001', 'USER_PRINCIPAL', '${row.actorId}', '${row.accountId === null ? "TENANT_SCOPE" : "ACCOUNT_SCOPE"}', 'RESEARCH_HYPOTHESIS_REVISION_CREATE_V1', '${row.principalId}', '${row.tenantId}', ${accountColumns.accountId}, 'SUCCEEDED', timestamptz '2026-09-16 00:00:00+00'),
      ('c7000000-0000-4000-8000-${fixtureTail}', 'idem-next-spec-${row.principalId.slice(-1)}-0001', '${hashF}', 'corr-next-spec-${row.principalId.slice(-1)}-0001', 'USER_PRINCIPAL', '${row.actorId}', '${row.accountId === null ? "TENANT_SCOPE" : "ACCOUNT_SCOPE"}', 'RESEARCH_SPEC_REVISION_CREATE_V1', '${row.principalId}', '${row.tenantId}', ${accountColumns.accountId}, 'SUCCEEDED', timestamptz '2026-09-16 00:00:00+00');
    insert into investing.research_investigations (
      research_investigation_id, tenant_id, account_id, principal_id, actor_kind, actor_id,
      tenant_membership_id, account_access_id, operation_scope, operation, capability, source_context,
      material_request_hash, idempotency_record_id, idempotency_key, correlation_id
    ) values
      ('${row.investigationId}', '${row.tenantId}', ${accountColumns.accountId}, '${row.principalId}', 'USER_PRINCIPAL', '${row.actorId}',
       '${row.tenantMembershipId}', ${accountColumns.accountAccessId}, '${row.accountId === null ? "TENANT_SCOPE" : "ACCOUNT_SCOPE"}',
       'RESEARCH_INVESTIGATION_CREATE_V1', 'RESEARCH_MUTATE', '${row.sourceContext}', '${hashA}', 'c1000000-0000-4000-8000-${fixtureTail}', 'idem-investigation-${row.principalId.slice(-1)}-0001', 'corr-investigation-${row.principalId.slice(-1)}-0001'),
      ('${row.otherInvestigationId}', '${row.tenantId}', ${accountColumns.accountId}, '${row.principalId}', 'USER_PRINCIPAL', '${row.actorId}',
       '${row.tenantMembershipId}', ${accountColumns.accountAccessId}, '${row.accountId === null ? "TENANT_SCOPE" : "ACCOUNT_SCOPE"}',
       'RESEARCH_INVESTIGATION_CREATE_V1', 'RESEARCH_MUTATE', '${row.sourceContext}', '${hashA}', 'c1100000-0000-4000-8000-${fixtureTail}', 'idem-other-${row.principalId.slice(-1)}-0001', 'corr-other-${row.principalId.slice(-1)}-0001')
      on conflict do nothing;
    insert into investing.research_material_roots (
      material_root_id, research_investigation_id, tenant_id, account_id, principal_id, actor_kind, actor_id,
      tenant_membership_id, account_access_id, operation_scope, source_context, material_kind, created_by_operation
    ) values
      ('${row.draftRootId}', '${row.investigationId}', '${row.tenantId}', ${accountColumns.accountId}, '${row.principalId}', 'USER_PRINCIPAL', '${row.actorId}', '${row.tenantMembershipId}', ${accountColumns.accountAccessId}, '${row.accountId === null ? "TENANT_SCOPE" : "ACCOUNT_SCOPE"}', '${row.sourceContext}', 'DRAFT', 'RESEARCH_DRAFT_REVISION_CREATE_V1'),
      ('${row.hypothesisRootId}', '${row.investigationId}', '${row.tenantId}', ${accountColumns.accountId}, '${row.principalId}', 'USER_PRINCIPAL', '${row.actorId}', '${row.tenantMembershipId}', ${accountColumns.accountAccessId}, '${row.accountId === null ? "TENANT_SCOPE" : "ACCOUNT_SCOPE"}', '${row.sourceContext}', 'HYPOTHESIS', 'RESEARCH_HYPOTHESIS_REVISION_CREATE_V1'),
      ('${row.specRootId}', '${row.investigationId}', '${row.tenantId}', ${accountColumns.accountId}, '${row.principalId}', 'USER_PRINCIPAL', '${row.actorId}', '${row.tenantMembershipId}', ${accountColumns.accountAccessId}, '${row.accountId === null ? "TENANT_SCOPE" : "ACCOUNT_SCOPE"}', '${row.sourceContext}', 'RESEARCH_SPEC', 'RESEARCH_SPEC_REVISION_CREATE_V1');
    insert into investing.research_material_revisions (
      material_revision_id, material_root_id, research_investigation_id, tenant_id, account_id, principal_id, actor_kind, actor_id,
      tenant_membership_id, account_access_id, operation_scope, operation, capability, source_context, material_kind, revision_number,
      predecessor_revision_id, payload_schema_version, canonical_payload, material_hash, material_request_hash, idempotency_record_id, idempotency_key, correlation_id
    ) values
      ('${row.draftRevisionId}', '${row.draftRootId}', '${row.investigationId}', '${row.tenantId}', ${accountColumns.accountId}, '${row.principalId}', 'USER_PRINCIPAL', '${row.actorId}', '${row.tenantMembershipId}', ${accountColumns.accountAccessId}, '${row.accountId === null ? "TENANT_SCOPE" : "ACCOUNT_SCOPE"}', 'RESEARCH_DRAFT_REVISION_CREATE_V1', 'RESEARCH_MUTATE', '${row.sourceContext}', 'DRAFT', 1, null, 'RESEARCH_DRAFT_HASH_PAYLOAD_V1', '{"schemaVersion":"RESEARCH_DRAFT_HASH_PAYLOAD_V1"}'::jsonb, '${hashB}', '${hashB}', 'c2000000-0000-4000-8000-${fixtureTail}', 'idem-draft-${row.principalId.slice(-1)}-0001', 'corr-draft-${row.principalId.slice(-1)}-0001'),
      ('${row.hypothesisRevisionId}', '${row.hypothesisRootId}', '${row.investigationId}', '${row.tenantId}', ${accountColumns.accountId}, '${row.principalId}', 'USER_PRINCIPAL', '${row.actorId}', '${row.tenantMembershipId}', ${accountColumns.accountAccessId}, '${row.accountId === null ? "TENANT_SCOPE" : "ACCOUNT_SCOPE"}', 'RESEARCH_HYPOTHESIS_REVISION_CREATE_V1', 'RESEARCH_MUTATE', '${row.sourceContext}', 'HYPOTHESIS', 1, null, 'HYPOTHESIS_HASH_PAYLOAD_V1', '{"schemaVersion":"HYPOTHESIS_HASH_PAYLOAD_V1"}'::jsonb, '${hashC}', '${hashC}', 'c3000000-0000-4000-8000-${fixtureTail}', 'idem-hypothesis-${row.principalId.slice(-1)}-0001', 'corr-hypothesis-${row.principalId.slice(-1)}-0001'),
      ('${row.nextDraftRevisionId}', '${row.draftRootId}', '${row.investigationId}', '${row.tenantId}', ${accountColumns.accountId}, '${row.principalId}', 'USER_PRINCIPAL', '${row.actorId}', '${row.tenantMembershipId}', ${accountColumns.accountAccessId}, '${row.accountId === null ? "TENANT_SCOPE" : "ACCOUNT_SCOPE"}', 'RESEARCH_DRAFT_REVISION_CREATE_V1', 'RESEARCH_MUTATE', '${row.sourceContext}', 'DRAFT', 2, '${row.draftRevisionId}', 'RESEARCH_DRAFT_HASH_PAYLOAD_V1', '{"schemaVersion":"RESEARCH_DRAFT_HASH_PAYLOAD_V1"}'::jsonb, '${hashD}', '${hashD}', 'c5000000-0000-4000-8000-${fixtureTail}', 'idem-next-draft-${row.principalId.slice(-1)}-0001', 'corr-next-draft-${row.principalId.slice(-1)}-0001'),
      ('${row.nextHypothesisRevisionId}', '${row.hypothesisRootId}', '${row.investigationId}', '${row.tenantId}', ${accountColumns.accountId}, '${row.principalId}', 'USER_PRINCIPAL', '${row.actorId}', '${row.tenantMembershipId}', ${accountColumns.accountAccessId}, '${row.accountId === null ? "TENANT_SCOPE" : "ACCOUNT_SCOPE"}', 'RESEARCH_HYPOTHESIS_REVISION_CREATE_V1', 'RESEARCH_MUTATE', '${row.sourceContext}', 'HYPOTHESIS', 2, '${row.hypothesisRevisionId}', 'HYPOTHESIS_HASH_PAYLOAD_V1', '{"schemaVersion":"HYPOTHESIS_HASH_PAYLOAD_V1"}'::jsonb, '${hashE}', '${hashE}', 'c6000000-0000-4000-8000-${fixtureTail}', 'idem-next-hypothesis-${row.principalId.slice(-1)}-0001', 'corr-next-hypothesis-${row.principalId.slice(-1)}-0001');
    insert into investing.research_spec_revisions (
      research_spec_revision_id, material_root_id, research_investigation_id, tenant_id, account_id, principal_id, actor_kind, actor_id,
      tenant_membership_id, account_access_id, operation_scope, source_context, operation, capability, revision_number, predecessor_revision_id,
      source_draft_revision_id, source_draft_material_hash, hypothesis_revision_id, hypothesis_material_hash, candidate_schema_version, candidate_status,
      canonical_candidate, material_request_hash, idempotency_record_id, idempotency_key, correlation_id
    ) values
      ('${row.specRevisionId}', '${row.specRootId}', '${row.investigationId}', '${row.tenantId}', ${accountColumns.accountId}, '${row.principalId}', 'USER_PRINCIPAL', '${row.actorId}', '${row.tenantMembershipId}', ${accountColumns.accountAccessId}, '${row.accountId === null ? "TENANT_SCOPE" : "ACCOUNT_SCOPE"}', '${row.sourceContext}', 'RESEARCH_SPEC_REVISION_CREATE_V1', 'RESEARCH_MUTATE', 1, null, '${row.draftRevisionId}', '${hashB}', ${specBinding}, '${hashD}', 'c4000000-0000-4000-8000-${fixtureTail}', 'idem-spec-${row.principalId.slice(-1)}-0001', 'corr-spec-${row.principalId.slice(-1)}-0001'),
      ('${row.nextSpecRevisionId}', '${row.specRootId}', '${row.investigationId}', '${row.tenantId}', ${accountColumns.accountId}, '${row.principalId}', 'USER_PRINCIPAL', '${row.actorId}', '${row.tenantMembershipId}', ${accountColumns.accountAccessId}, '${row.accountId === null ? "TENANT_SCOPE" : "ACCOUNT_SCOPE"}', '${row.sourceContext}', 'RESEARCH_SPEC_REVISION_CREATE_V1', 'RESEARCH_MUTATE', 2, '${row.specRevisionId}', '${row.draftRevisionId}', '${hashB}', null, null, 'RESEARCH_SPEC_CANDIDATE_V1', 'CANDIDATE_ONLY', jsonb_build_object('schemaVersion','RESEARCH_SPEC_CANDIDATE_V1','status','CANDIDATE_ONLY','sourceDraft',jsonb_build_object('hashHex','${hashB}'),'hypothesisBinding',jsonb_build_object('kind','NO_HYPOTHESIS')), '${hashF}', 'c7000000-0000-4000-8000-${fixtureTail}', 'idem-next-spec-${row.principalId.slice(-1)}-0001', 'corr-next-spec-${row.principalId.slice(-1)}-0001');
    insert into investing.research_material_pointer_states (
      research_investigation_id, tenant_id, account_id, principal_id, actor_kind, actor_id,
      tenant_membership_id, account_access_id, operation_scope, source_context,
      active_draft_revision_id, active_hypothesis_revision_id, active_spec_revision_id, active_experiment_id, pointer_version
    ) values (
      '${row.investigationId}', '${row.tenantId}', ${accountColumns.accountId}, '${row.principalId}', 'USER_PRINCIPAL', '${row.actorId}',
      '${row.tenantMembershipId}', ${accountColumns.accountAccessId}, '${row.accountId === null ? "TENANT_SCOPE" : "ACCOUNT_SCOPE"}', '${row.sourceContext}',
      '${row.draftRevisionId}', '${row.hypothesisRevisionId}', '${row.specRevisionId}', null, 7
    );
  `);
}

async function withAppContext(row: LabFixture, operation: string, extra: Record<string, string>, work: () => Promise<void>) {
  await client.query("begin");
  try {
    await client.query("set local role investing_app");
    const base: Record<string, string> = {
      actor_kind: "USER_PRINCIPAL",
      actor_id: row.actorId,
      principal_id: row.principalId,
      tenant_id: row.tenantId,
      tenant_membership_id: row.tenantMembershipId,
      operation,
      capability: "RESEARCH_MUTATE",
      operation_scope: row.accountId === null ? "TENANT_SCOPE" : "ACCOUNT_SCOPE",
      source_context: row.sourceContext,
      research_investigation_id: row.investigationId,
      account_id: row.accountId ?? "",
      account_access_id: row.accountAccessId ?? "",
      ...extra,
    };
    for (const [key, value] of Object.entries(base)) {
      if (value !== "") await client.query("select set_config($1, $2, true)", [`syntrake.investing.${key}`, value]);
    }
    await work();
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  }
}

async function createBaselineExperiment(row: LabFixture) {
  await withAppContext(row, "RESEARCH_EXPERIMENT_BASELINE_CREATE_V1", {
    idempotency_record_id: row.idempotencyRecordId,
    idempotency_key: row.idempotencyKey,
    correlation_id: row.correlationId,
    material_request_hash: row.materialRequestHash,
    research_spec_revision_id: row.specRevisionId,
    research_experiment_id: row.experimentId,
  }, async () => {
    await client.query(`
      insert into investing.idempotency_records (
        idempotency_record_id, idempotency_key, material_request_hash, correlation_id, actor_kind, actor_id,
        operation_scope, operation, principal_id, tenant_id, account_id, status
      ) values ($1, $2, $3, $4, 'USER_PRINCIPAL', $5, $6, 'RESEARCH_EXPERIMENT_BASELINE_CREATE_V1', $7, $8, $9, 'STARTED')
    `, [row.idempotencyRecordId, row.idempotencyKey, row.materialRequestHash, row.correlationId, row.actorId, row.accountId === null ? "TENANT_SCOPE" : "ACCOUNT_SCOPE", row.principalId, row.tenantId, row.accountId]);
    const pointer = await client.query("select active_experiment_id from investing.research_material_pointer_states where research_investigation_id = $1", [row.investigationId]);
    expect(pointer.rows).toEqual([{ active_experiment_id: null }]);
    await client.query(`
      insert into investing.research_experiments (
        research_experiment_id, research_investigation_id, tenant_id, account_id, principal_id, actor_kind, actor_id,
        tenant_membership_id, account_access_id, operation_scope, source_context, operation, capability, relation,
        research_spec_revision_id, research_ir_hash_algorithm, research_ir_hash_domain, research_ir_hash_version, research_ir_hash_hex,
        material_request_hash, idempotency_record_id, idempotency_key, correlation_id
      ) values ($1, $2, $3, $4, $5, 'USER_PRINCIPAL', $6, $7, $8, $9, $10, 'RESEARCH_EXPERIMENT_BASELINE_CREATE_V1', 'RESEARCH_MUTATE', 'BASELINE',
        $11, 'SHA-256', 'SYNTRAKE:RESEARCH_IR:V1', 'SYNTRAKE_SHA256_V1', $12, $13, $14, $15, $16)
    `, [row.experimentId, row.investigationId, row.tenantId, row.accountId, row.principalId, row.actorId, row.tenantMembershipId, row.accountAccessId, row.accountId === null ? "TENANT_SCOPE" : "ACCOUNT_SCOPE", row.sourceContext, row.specRevisionId, hashF, row.materialRequestHash, row.idempotencyRecordId, row.idempotencyKey, row.correlationId]);
    const updated = await client.query(`
      update investing.research_material_pointer_states
      set active_experiment_id = $1, pointer_version = pointer_version + 1, updated_by_operation = 'RESEARCH_EXPERIMENT_BASELINE_CREATE_V1'
      where research_investigation_id = $2 and active_spec_revision_id = $3 and active_experiment_id is null
    `, [row.experimentId, row.investigationId, row.specRevisionId]);
    expect(updated.rowCount).toBe(1);
    const resultingPointer = await client.query(
      "select active_experiment_id from investing.research_material_pointer_states where research_investigation_id = $1",
      [row.investigationId],
    );
    expect(resultingPointer.rows).toEqual([{ active_experiment_id: row.experimentId }]);
  });
}

function variantIds(suffix: string) {
  const tail = suffix.padStart(12, "0").slice(-12);
  return {
    experimentId: `a1000000-0000-4000-8000-${tail}`,
    idempotencyRecordId: `b1000000-0000-4000-8000-${tail}`,
    idempotencyKey: `idem-pg17-i5-variant-${suffix}-0001`,
    correlationId: `corr-pg17-i5-variant-${suffix}-0001`,
  };
}

async function createVariantExperiment(
  row: LabFixture,
  input: {
    suffix: string;
    parentExperimentId: string;
    expectedExperimentId: string;
    experimentId?: string;
    materialRequestHash?: string;
    idempotencyKey?: string;
  },
) {
  const ids = variantIds(input.suffix);
  const childId = input.experimentId ?? ids.experimentId;
  const materialRequestHash = input.materialRequestHash ??
    variantFixtureMaterialRequestHash(row.accountId === null ? "TENANT_SCOPE" : "ACCOUNT_SCOPE", input.suffix, input.parentExperimentId, input.expectedExperimentId);
  const before = await client.query<{
    active_draft_revision_id: string | null;
    active_hypothesis_revision_id: string | null;
    active_spec_revision_id: string | null;
    active_experiment_id: string | null;
    pointer_version: string;
  }>(
    "select active_draft_revision_id, active_hypothesis_revision_id, active_spec_revision_id, active_experiment_id, pointer_version::text from investing.research_material_pointer_states where research_investigation_id = $1",
    [row.investigationId],
  );
  const previous = before.rows[0]!;
  await withAppContext(row, "RESEARCH_EXPERIMENT_VARIANT_CREATE_V1", {
    idempotency_record_id: ids.idempotencyRecordId,
    idempotency_key: input.idempotencyKey ?? ids.idempotencyKey,
    correlation_id: ids.correlationId,
    material_request_hash: materialRequestHash,
    research_spec_revision_id: row.specRevisionId,
    research_ir_hash_hex: hashF,
    expected_experiment_id: input.expectedExperimentId,
    parent_experiment_id: input.parentExperimentId,
    research_experiment_id: childId,
    next_experiment_id: childId,
  }, async () => {
    await client.query(`
      insert into investing.idempotency_records (
        idempotency_record_id, idempotency_key, material_request_hash, correlation_id, actor_kind, actor_id,
        operation_scope, operation, principal_id, tenant_id, account_id, status
      ) values ($1, $2, $3, $4, 'USER_PRINCIPAL', $5, $6, 'RESEARCH_EXPERIMENT_VARIANT_CREATE_V1', $7, $8, $9, 'STARTED')
    `, [ids.idempotencyRecordId, input.idempotencyKey ?? ids.idempotencyKey, materialRequestHash, ids.correlationId, row.actorId, row.accountId === null ? "TENANT_SCOPE" : "ACCOUNT_SCOPE", row.principalId, row.tenantId, row.accountId]);
    await client.query(`
      insert into investing.research_experiments (
        research_experiment_id, research_investigation_id, tenant_id, account_id, principal_id, actor_kind, actor_id,
        tenant_membership_id, account_access_id, operation_scope, source_context, operation, capability, relation,
        parent_experiment_id, research_spec_revision_id, research_ir_hash_algorithm, research_ir_hash_domain, research_ir_hash_version,
        research_ir_hash_hex, material_request_hash, idempotency_record_id, idempotency_key, correlation_id
      ) values ($1, $2, $3, $4, $5, 'USER_PRINCIPAL', $6, $7, $8, $9, $10,
        'RESEARCH_EXPERIMENT_VARIANT_CREATE_V1', 'RESEARCH_MUTATE', 'VARIANT', $11, $12,
        'SHA-256', 'SYNTRAKE:RESEARCH_IR:V1', 'SYNTRAKE_SHA256_V1', $13, $14, $15, $16, $17)
    `, [childId, row.investigationId, row.tenantId, row.accountId, row.principalId, row.actorId, row.tenantMembershipId, row.accountAccessId, row.accountId === null ? "TENANT_SCOPE" : "ACCOUNT_SCOPE", row.sourceContext, input.parentExperimentId, row.specRevisionId, hashF, materialRequestHash, ids.idempotencyRecordId, input.idempotencyKey ?? ids.idempotencyKey, ids.correlationId]);
    const updated = await client.query(`
      update investing.research_material_pointer_states
      set active_experiment_id = $1, pointer_version = pointer_version + 1, updated_by_operation = 'RESEARCH_EXPERIMENT_VARIANT_CREATE_V1'
      where research_investigation_id = $2
        and pointer_version = $3
        and active_spec_revision_id = $4
        and active_experiment_id = $5
    `, [childId, row.investigationId, previous.pointer_version, row.specRevisionId, input.expectedExperimentId]);
    expect(updated.rowCount).toBe(1);
    await client.query(`
      update investing.idempotency_records
      set status = 'SUCCEEDED',
          canonical_result_reference = $2::jsonb,
          completed_at = transaction_timestamp(),
          updated_at = transaction_timestamp()
      where idempotency_record_id = $1 and status = 'STARTED'
    `, [ids.idempotencyRecordId, JSON.stringify({
      replayed: false,
      researchInvestigationId: row.investigationId,
      researchExperimentId: childId,
      parentExperimentId: input.parentExperimentId,
      researchSpecRevisionId: row.specRevisionId,
      relation: "VARIANT",
      researchIrHashHex: hashF,
      materialRequestHash,
      pointerVersion: String(BigInt(previous.pointer_version) + BigInt(1)),
    })]);
  });
  return {
    ...ids,
    experimentId: childId,
    materialRequestHash,
    previousPointerVersion: previous.pointer_version,
    nextPointerVersion: String(BigInt(previous.pointer_version) + BigInt(1)),
  };
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

describe("Investing Supabase reconciliation PostgreSQL 17 readiness", () => {
  it("records BLOCKED when PG17_RECONCILIATION_URL is absent", () => {
    expect(connectionString ? "READY - PG17 WILL EXECUTE" : "BLOCKED - PG17 NOT EXECUTED").toMatch(
      /^(READY - PG17 WILL EXECUTE|BLOCKED - PG17 NOT EXECUTED)$/u,
    );
  });
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
      "research_experiments",
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

  it("executes Experiment BASELINE RLS transitions across tenant/account scopes and invalidation matrix", async () => {
    await applyGenesisAndI5();

    const tenantIndependent = fixture("TENANT_SCOPE", "101", false);
    const tenantDependent = fixture("TENANT_SCOPE", "102", true);
    const accountIndependent = fixture("ACCOUNT_SCOPE", "103", false);
    for (const row of [tenantIndependent, tenantDependent, accountIndependent]) {
      await seedLabFixture(row, row === tenantDependent);
    }

    for (const row of [tenantIndependent, accountIndependent]) {
      await withAppContext(row, "RESEARCH_EXPERIMENT_BASELINE_CREATE_V1", {
        research_spec_revision_id: row.specRevisionId,
      }, async () => {
        const selector = await client.query("select research_investigation_id from investing.research_investigations where research_investigation_id = $1", [row.investigationId]);
        expect(selector.rowCount).toBe(1);
      });

      await createBaselineExperiment(row);

      await withAppContext(row, "RESEARCH_EXPERIMENT_BASELINE_CREATE_V1", {
        idempotency_record_id: row.idempotencyRecordId,
        idempotency_key: row.idempotencyKey,
        correlation_id: row.correlationId,
        material_request_hash: row.materialRequestHash,
        research_spec_revision_id: row.specRevisionId,
        research_experiment_id: row.experimentId,
      }, async () => {
        const fullParent = await client.query("select research_investigation_id from investing.research_investigations where research_investigation_id = $1", [row.investigationId]);
        expect(fullParent.rowCount).toBe(1);
        const replay = await client.query("select research_experiment_id from investing.research_experiments where research_experiment_id = $1", [row.experimentId]);
        expect(replay.rows).toEqual([{ research_experiment_id: row.experimentId }]);
        await client.query(`
          insert into investing.idempotency_records (
            idempotency_record_id, idempotency_key, material_request_hash, correlation_id, actor_kind, actor_id,
            operation_scope, operation, principal_id, tenant_id, account_id, status
          ) values ($1, $2, $3, $4, 'USER_PRINCIPAL', $5, $6, 'RESEARCH_EXPERIMENT_BASELINE_CREATE_V1', $7, $8, $9, 'STARTED')
          on conflict (actor_kind, actor_id, operation_scope, operation, idempotency_key) do nothing
        `, [row.idempotencyRecordId, row.idempotencyKey, row.materialRequestHash, row.correlationId, row.actorId, row.accountId === null ? "TENANT_SCOPE" : "ACCOUNT_SCOPE", row.principalId, row.tenantId, row.accountId]);
        const duplicate = await client.query("select count(*)::int as count from investing.research_experiments where material_request_hash = $1", [row.materialRequestHash]);
        expect(duplicate.rows[0]?.count).toBe(1);
      });
    }

    await createBaselineExperiment(tenantDependent);

    await withAppContext(tenantIndependent, "RESEARCH_EXPERIMENT_BASELINE_CREATE_V1", {
      idempotency_record_id: "b9000000-0000-4000-8000-000000000101",
      idempotency_key: "idem-pg17-cross-spec-0001",
      correlation_id: "corr-pg17-cross-spec-0001",
      material_request_hash: hashC,
      research_spec_revision_id: tenantDependent.specRevisionId,
      research_experiment_id: "a9000000-0000-4000-8000-000000000101",
    }, async () => {
      const spec = await client.query("select research_spec_revision_id from investing.research_spec_revisions where research_spec_revision_id = $1", [tenantDependent.specRevisionId]);
      expect(spec.rowCount).toBe(0);
    });

    await withAppContext(tenantIndependent, "RESEARCH_EXPERIMENT_BASELINE_CREATE_V1", {
      research_spec_revision_id: tenantIndependent.nextSpecRevisionId,
    }, async () => {
      const pointer = await client.query("select active_experiment_id from investing.research_material_pointer_states where research_investigation_id = $1 and active_spec_revision_id = $2", [tenantIndependent.investigationId, tenantIndependent.nextSpecRevisionId]);
      expect(pointer.rowCount).toBe(0);
    });

    await withAppContext(tenantIndependent, "RESEARCH_SPEC_REVISION_CREATE_V1", {
      expected_experiment_id: tenantIndependent.experimentId,
      next_experiment_id: "-",
      research_spec_revision_id: tenantIndependent.nextSpecRevisionId,
    }, async () => {
      const pointer = await client.query("select active_experiment_id from investing.research_material_pointer_states where research_investigation_id = $1", [tenantIndependent.investigationId]);
      expect(pointer.rows).toEqual([{ active_experiment_id: tenantIndependent.experimentId }]);
      const updated = await client.query(`
        update investing.research_material_pointer_states
        set active_spec_revision_id = $1, active_experiment_id = null, pointer_version = pointer_version + 1, updated_by_operation = 'RESEARCH_SPEC_REVISION_CREATE_V1'
        where research_investigation_id = $2
      `, [tenantIndependent.nextSpecRevisionId, tenantIndependent.investigationId]);
      expect(updated.rowCount).toBe(1);
      const resultingPointer = await client.query(
        "select active_spec_revision_id, active_experiment_id from investing.research_material_pointer_states where research_investigation_id = $1",
        [tenantIndependent.investigationId],
      );
      expect(resultingPointer.rows).toEqual([{ active_spec_revision_id: tenantIndependent.nextSpecRevisionId, active_experiment_id: null }]);
    });

    await withAppContext(accountIndependent, "RESEARCH_DRAFT_REVISION_CREATE_V1", {
      expected_experiment_id: accountIndependent.experimentId,
      next_experiment_id: "-",
      research_spec_revision_id: "-",
    }, async () => {
      const updated = await client.query(`
        update investing.research_material_pointer_states
        set active_draft_revision_id = $1, active_spec_revision_id = null, active_experiment_id = null,
          pointer_version = pointer_version + 1, updated_by_operation = 'RESEARCH_DRAFT_REVISION_CREATE_V1'
        where research_investigation_id = $2
      `, [accountIndependent.nextDraftRevisionId, accountIndependent.investigationId]);
      expect(updated.rowCount).toBe(1);
    });

    await withAppContext(tenantDependent, "RESEARCH_HYPOTHESIS_REVISION_CREATE_V1", {
      expected_experiment_id: tenantDependent.experimentId,
      next_experiment_id: "-",
      research_spec_revision_id: "-",
    }, async () => {
      const updated = await client.query(`
        update investing.research_material_pointer_states
        set active_hypothesis_revision_id = $1, active_spec_revision_id = null, active_experiment_id = null,
          pointer_version = pointer_version + 1, updated_by_operation = 'RESEARCH_HYPOTHESIS_REVISION_CREATE_V1'
        where research_investigation_id = $2
      `, [tenantDependent.nextHypothesisRevisionId, tenantDependent.investigationId]);
      expect(updated.rowCount).toBe(1);
    });

    const preserve = fixture("TENANT_SCOPE", "104", false);
    await seedLabFixture(preserve, false);
    await createBaselineExperiment(preserve);
    await withAppContext(preserve, "RESEARCH_HYPOTHESIS_REVISION_CREATE_V1", {
      expected_experiment_id: preserve.experimentId,
      next_experiment_id: preserve.experimentId,
      research_spec_revision_id: preserve.specRevisionId,
    }, async () => {
      const updated = await client.query(`
        update investing.research_material_pointer_states
        set active_hypothesis_revision_id = $1, active_spec_revision_id = $2, active_experiment_id = $3,
          pointer_version = pointer_version + 1, updated_by_operation = 'RESEARCH_HYPOTHESIS_REVISION_CREATE_V1'
        where research_investigation_id = $4
      `, [preserve.nextHypothesisRevisionId, preserve.specRevisionId, preserve.experimentId, preserve.investigationId]);
      expect(updated.rowCount).toBe(1);
      const pointer = await client.query("select active_spec_revision_id, active_experiment_id from investing.research_material_pointer_states where research_investigation_id = $1", [preserve.investigationId]);
      expect(pointer.rows).toEqual([{ active_spec_revision_id: preserve.specRevisionId, active_experiment_id: preserve.experimentId }]);
    });

    await withAppContext(preserve, "RESEARCH_HYPOTHESIS_REVISION_CREATE_V1", {
      expected_experiment_id: preserve.experimentId,
      next_experiment_id: preserve.experimentId,
      research_spec_revision_id: preserve.specRevisionId,
      account_id: accountIndependent.accountId ?? "",
      account_access_id: accountIndependent.accountAccessId ?? "",
    }, async () => {
      const forbidden = await client.query("select research_experiment_id from investing.research_experiments where research_experiment_id = $1", [preserve.experimentId]);
      expect(forbidden.rowCount).toBe(0);
    });
  });

  it("executes Experiment VARIANT persistence across tenant/account scopes, lineage and invalidation matrix", async () => {
    await applyGenesisAndI5();

    const tenant = fixture("TENANT_SCOPE", "201", false);
    const account = fixture("ACCOUNT_SCOPE", "202", false);
    const chain = fixture("TENANT_SCOPE", "203", false);
    const dependent = fixture("TENANT_SCOPE", "204", true);
    const independent = fixture("TENANT_SCOPE", "205", false);
    const specClear = fixture("TENANT_SCOPE", "206", false);
    const crossTenant = fixture("TENANT_SCOPE", "207", false);
    const crossAccount = fixture("ACCOUNT_SCOPE", "208", false);
    for (const row of [tenant, account, chain, dependent, independent, specClear, crossTenant, crossAccount]) {
      await seedLabFixture(row, row === dependent);
      await createBaselineExperiment(row);
    }

    const tenantVariant = await createVariantExperiment(tenant, {
      suffix: "201",
      parentExperimentId: tenant.experimentId,
      expectedExperimentId: tenant.experimentId,
    });
    const tenantPointer = await client.query<{
      active_draft_revision_id: string | null;
      active_hypothesis_revision_id: string | null;
      active_spec_revision_id: string | null;
      active_experiment_id: string | null;
      pointer_version: string;
      updated_by_operation: string | null;
    }>("select active_draft_revision_id, active_hypothesis_revision_id, active_spec_revision_id, active_experiment_id, pointer_version::text, updated_by_operation from investing.research_material_pointer_states where research_investigation_id = $1", [tenant.investigationId]);
    expect(tenantPointer.rows).toEqual([{
      active_draft_revision_id: tenant.draftRevisionId,
      active_hypothesis_revision_id: tenant.hypothesisRevisionId,
      active_spec_revision_id: tenant.specRevisionId,
      active_experiment_id: tenantVariant.experimentId,
      pointer_version: "9",
      updated_by_operation: "RESEARCH_EXPERIMENT_VARIANT_CREATE_V1",
    }]);
    const tenantChild = await client.query(`
      select relation, parent_experiment_id, research_investigation_id, research_spec_revision_id,
        research_ir_hash_algorithm, research_ir_hash_domain, research_ir_hash_version, research_ir_hash_hex
      from investing.research_experiments
      where research_experiment_id = $1
    `, [tenantVariant.experimentId]);
    expect(tenantChild.rows).toEqual([{
      relation: "VARIANT",
      parent_experiment_id: tenant.experimentId,
      research_investigation_id: tenant.investigationId,
      research_spec_revision_id: tenant.specRevisionId,
      research_ir_hash_algorithm: "SHA-256",
      research_ir_hash_domain: "SYNTRAKE:RESEARCH_IR:V1",
      research_ir_hash_version: "SYNTRAKE_SHA256_V1",
      research_ir_hash_hex: hashF,
    }]);

    const accountVariant = await createVariantExperiment(account, {
      suffix: "202",
      parentExperimentId: account.experimentId,
      expectedExperimentId: account.experimentId,
    });
    await withAppContext(account, "RESEARCH_EXPERIMENT_VARIANT_CREATE_V1", {
      parent_experiment_id: account.experimentId,
      expected_experiment_id: account.experimentId,
      research_experiment_id: accountVariant.experimentId,
      research_spec_revision_id: account.specRevisionId,
      research_ir_hash_hex: hashF,
      material_request_hash: accountVariant.materialRequestHash,
      idempotency_record_id: accountVariant.idempotencyRecordId,
      idempotency_key: accountVariant.idempotencyKey,
    }, async () => {
      const accountRows = await client.query("select account_id from investing.accounts where account_id = $1", [account.accountId]);
      const accessRows = await client.query("select account_access_id from investing.account_access where account_access_id = $1", [account.accountAccessId]);
      expect(accountRows.rowCount).toBe(1);
      expect(accessRows.rowCount).toBe(1);
    });

    const e1 = await createVariantExperiment(chain, {
      suffix: "2031",
      parentExperimentId: chain.experimentId,
      expectedExperimentId: chain.experimentId,
    });
    const e2 = await createVariantExperiment(chain, {
      suffix: "2032",
      parentExperimentId: e1.experimentId,
      expectedExperimentId: e1.experimentId,
    });
    const family = await client.query("select parent_experiment_id, research_spec_revision_id, research_ir_hash_hex from investing.research_experiments where research_experiment_id = $1", [e2.experimentId]);
    expect(family.rows).toEqual([{ parent_experiment_id: e1.experimentId, research_spec_revision_id: chain.specRevisionId, research_ir_hash_hex: hashF }]);

    await withAppContext(chain, "RESEARCH_EXPERIMENT_VARIANT_CREATE_V1", {
      parent_experiment_id: chain.experimentId,
      expected_experiment_id: e2.experimentId,
      research_experiment_id: "a1990000-0000-4000-8000-000000002039",
      research_spec_revision_id: chain.specRevisionId,
      research_ir_hash_hex: hashF,
      material_request_hash: "9".repeat(64),
      idempotency_record_id: "b1990000-0000-4000-8000-000000002039",
      idempotency_key: "idem-pg17-i5-distinct-parent-pointer",
    }, async () => {
      const parentVisible = await client.query("select research_experiment_id from investing.research_experiments where research_experiment_id = $1", [chain.experimentId]);
      const pointerVisible = await client.query("select active_experiment_id from investing.research_material_pointer_states where research_investigation_id = $1 and active_experiment_id = $2", [chain.investigationId, e2.experimentId]);
      expect(parentVisible.rowCount).toBe(1);
      expect(pointerVisible.rowCount).toBe(1);
    });

    const missingParent = createVariantExperiment(tenant, {
      suffix: "209",
      parentExperimentId: "a9000000-0000-4000-8000-000000000209",
      expectedExperimentId: tenantVariant.experimentId,
    });
    await expect(missingParent).rejects.not.toThrow(/22P02/);

    for (const [suffix, parentExperimentId] of [["210", crossTenant.experimentId], ["211", crossAccount.experimentId]] as const) {
      await expect(createVariantExperiment(tenant, {
        suffix,
        parentExperimentId,
        expectedExperimentId: tenantVariant.experimentId,
      })).rejects.not.toThrow(/22P02/);
    }

    await client.query(`
      insert into investing.idempotency_records (
        idempotency_record_id, idempotency_key, material_request_hash, correlation_id, actor_kind, actor_id,
        operation_scope, operation, principal_id, tenant_id, account_id, status, completed_at
      ) values (
        'b3000000-0000-4000-8000-000000000201', 'idem-wrong-spec-parent-0001', repeat('3', 64),
        'corr-wrong-spec-parent-0001', 'USER_PRINCIPAL', $1, 'TENANT_SCOPE', 'RESEARCH_EXPERIMENT_BASELINE_CREATE_V1',
        $2, $3, null, 'SUCCEEDED', timestamptz '2026-09-16 00:00:00+00'
      );
      insert into investing.research_experiments (
        research_experiment_id, research_investigation_id, tenant_id, account_id, principal_id, actor_kind, actor_id,
        tenant_membership_id, account_access_id, operation_scope, source_context, operation, capability, relation,
        parent_experiment_id, research_spec_revision_id, research_ir_hash_algorithm, research_ir_hash_domain, research_ir_hash_version,
        research_ir_hash_hex, material_request_hash, idempotency_record_id, idempotency_key, correlation_id
      ) values (
        'a3000000-0000-4000-8000-000000000201', $4, $3, null, $2, 'USER_PRINCIPAL', $1, $5, null,
        'TENANT_SCOPE', 'PURE_RESEARCH', 'RESEARCH_EXPERIMENT_BASELINE_CREATE_V1', 'RESEARCH_MUTATE', 'BASELINE',
        null, $6, 'SHA-256', 'SYNTRAKE:RESEARCH_IR:V1', 'SYNTRAKE_SHA256_V1', $7, repeat('3', 64),
        'b3000000-0000-4000-8000-000000000201', 'idem-wrong-spec-parent-0001', 'corr-wrong-spec-parent-0001'
      )
    `, [tenant.actorId, tenant.principalId, tenant.tenantId, tenant.investigationId, tenant.tenantMembershipId, tenant.nextSpecRevisionId, hashF]);
    await expect(createVariantExperiment(tenant, {
      suffix: "218",
      parentExperimentId: "a3000000-0000-4000-8000-000000000201",
      expectedExperimentId: tenantVariant.experimentId,
    })).rejects.not.toThrow(/22P02/);

    await client.query("update investing.research_experiments set research_ir_hash_hex = $1 where research_experiment_id = $2", [hashE, crossTenant.experimentId]);
    await expect(createVariantExperiment(crossTenant, {
      suffix: "212",
      parentExperimentId: crossTenant.experimentId,
      expectedExperimentId: crossTenant.experimentId,
    })).rejects.not.toThrow(/22P02/);

    await expect(createVariantExperiment(tenant, {
      suffix: "213",
      parentExperimentId: tenant.experimentId,
      expectedExperimentId: tenant.experimentId,
    })).rejects.not.toThrow(/22P02/);

    await withAppContext(tenant, "RESEARCH_EXPERIMENT_VARIANT_CREATE_V1", {
      parent_experiment_id: tenant.experimentId,
      expected_experiment_id: tenantVariant.experimentId,
      research_experiment_id: "a2140000-0000-4000-8000-000000000214",
      research_spec_revision_id: tenant.nextSpecRevisionId,
      research_ir_hash_hex: hashF,
      material_request_hash: "8".repeat(64),
      idempotency_record_id: "b2140000-0000-4000-8000-000000000214",
      idempotency_key: "idem-pg17-wrong-active-spec",
    }, async () => {
      const badSpecUpdate = await client.query(`
        update investing.research_material_pointer_states
        set active_experiment_id = $1, pointer_version = pointer_version + 1, updated_by_operation = 'RESEARCH_EXPERIMENT_VARIANT_CREATE_V1'
        where research_investigation_id = $2 and active_spec_revision_id = $3 and active_experiment_id = $4
      `, ["a2140000-0000-4000-8000-000000000214", tenant.investigationId, tenant.nextSpecRevisionId, tenantVariant.experimentId]);
      expect(badSpecUpdate.rowCount).toBe(0);
    });

    await withAppContext(tenant, "RESEARCH_EXPERIMENT_VARIANT_CREATE_V1", {
      parent_experiment_id: tenant.experimentId,
      expected_experiment_id: tenantVariant.experimentId,
      research_experiment_id: "a2190000-0000-4000-8000-000000000219",
      research_spec_revision_id: tenant.specRevisionId,
      research_ir_hash_hex: hashF,
      material_request_hash: "2".repeat(64),
      idempotency_record_id: "b2190000-0000-4000-8000-000000000219",
      idempotency_key: "idem-pg17-wrong-pointer-version",
    }, async () => {
      const wrongVersion = await client.query(`
        update investing.research_material_pointer_states
        set active_experiment_id = $1, pointer_version = pointer_version + 1, updated_by_operation = 'RESEARCH_EXPERIMENT_VARIANT_CREATE_V1'
        where research_investigation_id = $2 and pointer_version = 1 and active_spec_revision_id = $3 and active_experiment_id = $4
      `, ["a2190000-0000-4000-8000-000000000219", tenant.investigationId, tenant.specRevisionId, tenantVariant.experimentId]);
      expect(wrongVersion.rowCount).toBe(0);
    });

    await withAppContext(tenant, "RESEARCH_EXPERIMENT_BASELINE_CREATE_V1", {
      parent_experiment_id: tenant.experimentId,
      research_experiment_id: "a2150000-0000-4000-8000-000000000215",
      research_spec_revision_id: tenant.specRevisionId,
      material_request_hash: "7".repeat(64),
      idempotency_record_id: "b2150000-0000-4000-8000-000000000215",
      idempotency_key: "idem-pg17-invalid-operation",
    }, async () => {
      await expect(client.query(`
        insert into investing.research_experiments (
          research_experiment_id, research_investigation_id, tenant_id, account_id, principal_id, actor_kind, actor_id,
          tenant_membership_id, account_access_id, operation_scope, source_context, operation, capability, relation,
          parent_experiment_id, research_spec_revision_id, research_ir_hash_algorithm, research_ir_hash_domain, research_ir_hash_version,
          research_ir_hash_hex, material_request_hash, idempotency_record_id, idempotency_key, correlation_id
        ) values ('a2150000-0000-4000-8000-000000000215', $1, $2, $3, $4, 'USER_PRINCIPAL', $5, $6, $7, $8, $9,
          'RESEARCH_EXPERIMENT_BASELINE_CREATE_V1', 'RESEARCH_MUTATE', 'VARIANT', $10, $11, 'SHA-256', 'SYNTRAKE:RESEARCH_IR:V1',
          'SYNTRAKE_SHA256_V1', $12, $13, $14, $15, 'corr-invalid-operation')
      `, [tenant.investigationId, tenant.tenantId, tenant.accountId, tenant.principalId, tenant.actorId, tenant.tenantMembershipId, tenant.accountAccessId, "TENANT_SCOPE", tenant.sourceContext, tenant.experimentId, tenant.specRevisionId, hashF, "7".repeat(64), "b2150000-0000-4000-8000-000000000215", "idem-pg17-invalid-operation"])).rejects.not.toThrow(/22P02/);
    });

    await expect(client.query(`
      insert into investing.research_experiments (
        research_experiment_id, research_investigation_id, tenant_id, account_id, principal_id, actor_kind, actor_id,
        tenant_membership_id, account_access_id, operation_scope, source_context, operation, capability, relation,
        parent_experiment_id, research_spec_revision_id, research_ir_hash_algorithm, research_ir_hash_domain, research_ir_hash_version,
        research_ir_hash_hex, material_request_hash, idempotency_record_id, idempotency_key, correlation_id
      )
      select gen_random_uuid(), research_investigation_id, tenant_id, account_id, principal_id, actor_kind, actor_id,
        tenant_membership_id, account_access_id, operation_scope, source_context, operation, capability, 'BASELINE',
        research_experiment_id, research_spec_revision_id, research_ir_hash_algorithm, research_ir_hash_domain, research_ir_hash_version,
        research_ir_hash_hex, repeat('6', 64), idempotency_record_id, 'shape-baseline-parent', 'shape-baseline-parent'
      from investing.research_experiments
      where research_experiment_id = $1
    `, [tenant.experimentId])).rejects.toThrow();
    await expect(client.query(`
      insert into investing.research_experiments (
        research_experiment_id, research_investigation_id, tenant_id, account_id, principal_id, actor_kind, actor_id,
        tenant_membership_id, account_access_id, operation_scope, source_context, operation, capability, relation,
        parent_experiment_id, research_spec_revision_id, research_ir_hash_algorithm, research_ir_hash_domain, research_ir_hash_version,
        research_ir_hash_hex, material_request_hash, idempotency_record_id, idempotency_key, correlation_id
      )
      select gen_random_uuid(), research_investigation_id, tenant_id, account_id, principal_id, actor_kind, actor_id,
        tenant_membership_id, account_access_id, operation_scope, source_context, 'RESEARCH_EXPERIMENT_VARIANT_CREATE_V1',
        capability, 'VARIANT', null, research_spec_revision_id, research_ir_hash_algorithm, research_ir_hash_domain,
        research_ir_hash_version, research_ir_hash_hex, repeat('5', 64), idempotency_record_id, 'shape-variant-null', 'shape-variant-null'
      from investing.research_experiments
      where research_experiment_id = $1
    `, [tenant.experimentId])).rejects.toThrow();

    await withAppContext(tenant, "RESEARCH_EXPERIMENT_VARIANT_CREATE_V1", {
      parent_experiment_id: tenant.experimentId,
      expected_experiment_id: tenantVariant.experimentId,
      research_experiment_id: tenantVariant.experimentId,
      research_spec_revision_id: tenant.specRevisionId,
      research_ir_hash_hex: hashF,
      material_request_hash: tenantVariant.materialRequestHash,
      idempotency_record_id: tenantVariant.idempotencyRecordId,
      idempotency_key: tenantVariant.idempotencyKey,
    }, async () => {
      const replay = await client.query("select canonical_result_reference->>'researchExperimentId' as id from investing.idempotency_records where idempotency_key = $1", [tenantVariant.idempotencyKey]);
      expect(replay.rows).toEqual([{ id: tenantVariant.experimentId }]);
      const visible = await client.query("select count(*)::int as count from investing.research_experiments");
      expect(visible.rows[0]?.count).toBeLessThan(3);
    });
    await withAppContext(tenant, "RESEARCH_EXPERIMENT_VARIANT_CREATE_V1", {
      parent_experiment_id: tenant.experimentId,
      expected_experiment_id: tenantVariant.experimentId,
      research_experiment_id: "a2160000-0000-4000-8000-000000000216",
      research_spec_revision_id: tenant.specRevisionId,
      research_ir_hash_hex: hashF,
      material_request_hash: "4".repeat(64),
      idempotency_record_id: "b2160000-0000-4000-8000-000000000216",
      idempotency_key: tenantVariant.idempotencyKey,
    }, async () => {
      const existing = await client.query("select material_request_hash from investing.idempotency_records where idempotency_key = $1", [tenantVariant.idempotencyKey]);
      expect(existing.rows).toEqual([{ material_request_hash: tenantVariant.materialRequestHash }]);
    });
    await expect(createVariantExperiment(tenant, {
      suffix: "217",
      parentExperimentId: tenant.experimentId,
      expectedExperimentId: tenantVariant.experimentId,
    })).rejects.not.toThrow(/22P02/);

    const activeDependent = await createVariantExperiment(dependent, {
      suffix: "204",
      parentExperimentId: dependent.experimentId,
      expectedExperimentId: dependent.experimentId,
    });
    await withAppContext(dependent, "RESEARCH_HYPOTHESIS_REVISION_CREATE_V1", {
      expected_experiment_id: activeDependent.experimentId,
      next_experiment_id: "-",
      research_spec_revision_id: "-",
    }, async () => {
      const updated = await client.query(`
        update investing.research_material_pointer_states
        set active_hypothesis_revision_id = $1, active_spec_revision_id = null, active_experiment_id = null,
          pointer_version = pointer_version + 1, updated_by_operation = 'RESEARCH_HYPOTHESIS_REVISION_CREATE_V1'
        where research_investigation_id = $2
      `, [dependent.nextHypothesisRevisionId, dependent.investigationId]);
      expect(updated.rowCount).toBe(1);
    });

    const activeIndependent = await createVariantExperiment(independent, {
      suffix: "205",
      parentExperimentId: independent.experimentId,
      expectedExperimentId: independent.experimentId,
    });
    await withAppContext(independent, "RESEARCH_HYPOTHESIS_REVISION_CREATE_V1", {
      expected_experiment_id: activeIndependent.experimentId,
      next_experiment_id: activeIndependent.experimentId,
      research_spec_revision_id: independent.specRevisionId,
    }, async () => {
      const updated = await client.query(`
        update investing.research_material_pointer_states
        set active_hypothesis_revision_id = $1, active_spec_revision_id = $2, active_experiment_id = $3,
          pointer_version = pointer_version + 1, updated_by_operation = 'RESEARCH_HYPOTHESIS_REVISION_CREATE_V1'
        where research_investigation_id = $4
      `, [independent.nextHypothesisRevisionId, independent.specRevisionId, activeIndependent.experimentId, independent.investigationId]);
      expect(updated.rowCount).toBe(1);
    });

    const activeSpecClear = await createVariantExperiment(specClear, {
      suffix: "206",
      parentExperimentId: specClear.experimentId,
      expectedExperimentId: specClear.experimentId,
    });
    await withAppContext(specClear, "RESEARCH_SPEC_REVISION_CREATE_V1", {
      expected_experiment_id: activeSpecClear.experimentId,
      next_experiment_id: "-",
      research_spec_revision_id: specClear.nextSpecRevisionId,
    }, async () => {
      const updated = await client.query(`
        update investing.research_material_pointer_states
        set active_spec_revision_id = $1, active_experiment_id = null, pointer_version = pointer_version + 1,
          updated_by_operation = 'RESEARCH_SPEC_REVISION_CREATE_V1'
        where research_investigation_id = $2
      `, [specClear.nextSpecRevisionId, specClear.investigationId]);
      expect(updated.rowCount).toBe(1);
    });

    await withAppContext(tenant, "RESEARCH_DRAFT_REVISION_CREATE_V1", {
      expected_experiment_id: tenantVariant.experimentId,
      next_experiment_id: "-",
      research_spec_revision_id: "-",
    }, async () => {
      const updated = await client.query(`
        update investing.research_material_pointer_states
        set active_draft_revision_id = $1, active_spec_revision_id = null, active_experiment_id = null,
          pointer_version = pointer_version + 1, updated_by_operation = 'RESEARCH_DRAFT_REVISION_CREATE_V1'
        where research_investigation_id = $2
      `, [tenant.nextDraftRevisionId, tenant.investigationId]);
      expect(updated.rowCount).toBe(1);
    });

    await client.query("begin");
    await client.query("set local role investing_app");
    await client.query("select set_config('syntrake.investing.operation', '', true)");
    await expect(client.query("select count(*) from investing.research_experiments")).resolves.toBeDefined();
    await client.query("rollback");

    await client.query("begin");
    await client.query("set local role investing_app");
    await client.query("select set_config('syntrake.investing.operation', 'RESEARCH_EXPERIMENT_VARIANT_CREATE_V1', true)");
    const stale = await client.query("select count(*)::int as count from investing.research_experiments");
    expect(stale.rows).toEqual([{ count: 0 }]);
    await client.query("rollback");
  });
});
