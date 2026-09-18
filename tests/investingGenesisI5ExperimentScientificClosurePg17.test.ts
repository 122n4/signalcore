import fs from "node:fs";
import path from "node:path";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..");
const connectionString = process.env.PG17_RECONCILIATION_URL ?? "";
const repairMigration = "supabase/migrations/20260823000000_reconcile_zero_genesis_journal_residual.sql";
const productionResidualSha256 = "5833faf5ca3ab62250f460c1e35ede4b30e20caa58ba87c7b34a4563eb615248";
const predecessorMigrations = [
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
const closureMigration = "supabase/migrations/20260917183000_investing_i5_experiment_scientific_closure.sql";

const maybeDescribe = connectionString ? describe : describe.skip;

let pool: Pool;
let client: PoolClient;

const ids = {
  investigation: "60000000-0000-4000-8000-000000000071",
  accountInvestigation: "60000000-0000-4000-8000-000000000081",
  tenant: "20000000-0000-4000-8000-000000000071",
  accountTenant: "20000000-0000-4000-8000-000000000081",
  principal: "10000000-0000-4000-8000-000000000071",
  accountPrincipal: "10000000-0000-4000-8000-000000000081",
  membership: "30000000-0000-4000-8000-000000000071",
  accountMembership: "30000000-0000-4000-8000-000000000081",
  account: "40000000-0000-4000-8000-000000000081",
  accountAccess: "50000000-0000-4000-8000-000000000081",
  wrongAccount: "40000000-0000-4000-8000-000000000082",
  wrongAccountAccess: "50000000-0000-4000-8000-000000000082",
  spec: "91000000-0000-4000-8000-000000000071",
  accountSpec: "91000000-0000-4000-8000-000000000081",
  e0: "a0000000-0000-4000-8000-000000000070",
  e1: "a1000000-0000-4000-8000-000000000071",
  e2: "a2000000-0000-4000-8000-000000000072",
  e3: "a3000000-0000-4000-8000-000000000073",
  duplicate: "a4000000-0000-4000-8000-000000000074",
  rollback: "a5000000-0000-4000-8000-000000000075",
  accountE0: "a6000000-0000-4000-8000-000000000081",
  accountE1: "a7000000-0000-4000-8000-000000000081",
};

const hashes = {
  parentIr: "1111111111111111111111111111111111111111111111111111111111111111",
  e1Ir: "2222222222222222222222222222222222222222222222222222222222222222",
  e2Ir: "3333333333333333333333333333333333333333333333333333333333333333",
  e3Ir: "4444444444444444444444444444444444444444444444444444444444444444",
  e0Experiment: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  e1Experiment: "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
  e2Experiment: "CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC",
  e3Experiment: "DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD",
  p1: "E111111111111111111111111111111111111111111111111111111111111111",
  p2: "E222222222222222222222222222222222222222222222222222222222222222",
  p3: "E333333333333333333333333333333333333333333333333333333333333333",
};

const seedHashes = {
  investigation: "1111111111111111111111111111111111111111111111111111111111111111",
  draft: "2222222222222222222222222222222222222222222222222222222222222222",
  hypothesis: "3333333333333333333333333333333333333333333333333333333333333333",
  spec: "4444444444444444444444444444444444444444444444444444444444444444",
  nextDraft: "5555555555555555555555555555555555555555555555555555555555555555",
  nextHypothesis: "6666666666666666666666666666666666666666666666666666666666666666",
  nextSpec: "7777777777777777777777777777777777777777777777777777777777777777",
};

type Fixture = {
  actorId: string;
  principalId: string;
  tenantId: string;
  tenantMembershipId: string;
  accountId: string | null;
  accountAccessId: string | null;
  sourceContext: "PURE_RESEARCH" | "USER_PORTFOLIO";
  investigationId: string;
  draftRootId: string;
  draftRevisionId: string;
  hypothesisRootId: string;
  hypothesisRevisionId: string;
  specRootId: string;
  specRevisionId: string;
};

const tenantFixture: Fixture = {
  actorId: "pg17-scientific-closure",
  principalId: ids.principal,
  tenantId: ids.tenant,
  tenantMembershipId: ids.membership,
  accountId: null,
  accountAccessId: null,
  sourceContext: "PURE_RESEARCH",
  investigationId: ids.investigation,
  draftRootId: "70000000-0000-4000-8000-000000000071",
  draftRevisionId: "71000000-0000-4000-8000-000000000071",
  hypothesisRootId: "80000000-0000-4000-8000-000000000071",
  hypothesisRevisionId: "81000000-0000-4000-8000-000000000071",
  specRootId: "90000000-0000-4000-8000-000000000071",
  specRevisionId: ids.spec,
};

const accountFixture: Fixture = {
  actorId: "pg17-scientific-closure-account",
  principalId: ids.accountPrincipal,
  tenantId: ids.accountTenant,
  tenantMembershipId: ids.accountMembership,
  accountId: ids.account,
  accountAccessId: ids.accountAccess,
  sourceContext: "USER_PORTFOLIO",
  investigationId: ids.accountInvestigation,
  draftRootId: "70000000-0000-4000-8000-000000000081",
  draftRevisionId: "71000000-0000-4000-8000-000000000081",
  hypothesisRootId: "80000000-0000-4000-8000-000000000081",
  hypothesisRevisionId: "81000000-0000-4000-8000-000000000081",
  specRootId: "90000000-0000-4000-8000-000000000081",
  specRevisionId: ids.accountSpec,
};

function readSql(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function idempotencyRecordIdFor(experimentId: string) {
  return `b${experimentId.slice(1)}`;
}

function materialHashFor(experimentId: string) {
  return experimentId.replace(/[^A-Fa-f0-9]/gu, "").padEnd(64, "0").slice(0, 64).toUpperCase();
}

function scopeFor(fixture: Fixture) {
  return fixture.accountId === null ? "TENANT_SCOPE" : "ACCOUNT_SCOPE";
}

async function applySql(relativePath: string) {
  try {
    await client.query(readSql(relativePath));
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`PG17 scientific closure rehearsal failed for ${relativePath}: ${message}`);
  }
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

async function applyRepair() {
  const fingerprint = await residualFingerprint();
  await client.query(readSql(repairMigration).replaceAll(productionResidualSha256, fingerprint));
}

async function applyPredecessors() {
  await applyRepair();
  for (const migration of predecessorMigrations) await applySql(migration);
}

async function applyClosure() {
  await applyPredecessors();
  await applySql(closureMigration);
}

async function seedAuthorityFixture(fixture: Fixture) {
  const accountId = fixture.accountId === null ? null : fixture.accountId;
  const accountAccessId = fixture.accountAccessId === null ? null : fixture.accountAccessId;
  const scope = scopeFor(fixture);
  await client.query(`
    insert into investing.principals (principal_id, external_provider, external_subject)
    values ($1, 'CLERK', $2)
  `, [fixture.principalId, fixture.actorId]);
  await client.query(`
    insert into investing.tenants (tenant_id) values ($1)
  `, [fixture.tenantId]);
  await client.query(`
    insert into investing.tenant_memberships (tenant_membership_id, tenant_id, principal_id)
    values ($1, $2, $3)
  `, [fixture.tenantMembershipId, fixture.tenantId, fixture.principalId]);
  if (fixture.accountId !== null && fixture.accountAccessId !== null) {
    await client.query(`
      insert into investing.accounts (account_id, tenant_id, initial_tenant_membership_id, initial_principal_id, base_currency)
      values ($1, $2, $3, $4, 'USD')
    `, [fixture.accountId, fixture.tenantId, fixture.tenantMembershipId, fixture.principalId]);
    await client.query(`
      insert into investing.account_access (account_access_id, account_id, tenant_id, tenant_membership_id, principal_id)
      values ($1, $2, $3, $4, $5)
    `, [fixture.accountAccessId, fixture.accountId, fixture.tenantId, fixture.tenantMembershipId, fixture.principalId]);
    await client.query(`
      insert into investing.accounts (account_id, tenant_id, initial_tenant_membership_id, initial_principal_id, base_currency)
      values ($1, $2, $3, $4, 'USD')
    `, [ids.wrongAccount, fixture.tenantId, fixture.tenantMembershipId, fixture.principalId]);
    await client.query(`
      insert into investing.account_access (account_access_id, account_id, tenant_id, tenant_membership_id, principal_id)
      values ($1, $2, $3, $4, $5)
    `, [ids.wrongAccountAccess, ids.wrongAccount, fixture.tenantId, fixture.tenantMembershipId, fixture.principalId]);
  }
  await client.query(`
    insert into investing.idempotency_records (
      idempotency_record_id, idempotency_key, material_request_hash, correlation_id, actor_kind, actor_id,
      operation_scope, operation, principal_id, tenant_id, account_id, status, completed_at
    ) values
      ($1, $2, $3, $4, 'USER_PRINCIPAL', $5, $6, 'RESEARCH_INVESTIGATION_CREATE_V1', $7, $8, $9, 'SUCCEEDED', timestamptz '2026-09-17 00:00:00+00'),
      ($10, $11, $12, $13, 'USER_PRINCIPAL', $5, $6, 'RESEARCH_DRAFT_REVISION_CREATE_V1', $7, $8, $9, 'SUCCEEDED', timestamptz '2026-09-17 00:00:00+00'),
      ($14, $15, $16, $17, 'USER_PRINCIPAL', $5, $6, 'RESEARCH_HYPOTHESIS_REVISION_CREATE_V1', $7, $8, $9, 'SUCCEEDED', timestamptz '2026-09-17 00:00:00+00'),
      ($18, $19, $20, $21, 'USER_PRINCIPAL', $5, $6, 'RESEARCH_SPEC_REVISION_CREATE_V1', $7, $8, $9, 'SUCCEEDED', timestamptz '2026-09-17 00:00:00+00')
  `, [
    `c1000000-0000-4000-8000-${fixture.principalId.slice(-12)}`, `idem-investigation-${fixture.principalId.slice(-12)}`, seedHashes.investigation, `corr-investigation-${fixture.principalId.slice(-12)}`,
    fixture.actorId, scope, fixture.principalId, fixture.tenantId, accountId,
    `c2000000-0000-4000-8000-${fixture.principalId.slice(-12)}`, `idem-draft-${fixture.principalId.slice(-12)}`, seedHashes.draft, `corr-draft-${fixture.principalId.slice(-12)}`,
    `c3000000-0000-4000-8000-${fixture.principalId.slice(-12)}`, `idem-hypothesis-${fixture.principalId.slice(-12)}`, seedHashes.hypothesis, `corr-hypothesis-${fixture.principalId.slice(-12)}`,
    `c4000000-0000-4000-8000-${fixture.principalId.slice(-12)}`, `idem-spec-${fixture.principalId.slice(-12)}`, seedHashes.spec, `corr-spec-${fixture.principalId.slice(-12)}`,
  ]);
  await client.query(`
    insert into investing.research_investigations (
      research_investigation_id, tenant_id, account_id, principal_id, actor_kind, actor_id,
      tenant_membership_id, account_access_id, operation_scope, operation, capability, source_context,
      material_request_hash, idempotency_record_id, idempotency_key, correlation_id
    ) values (
      $1, $2, $3, $4, 'USER_PRINCIPAL', $5, $6, $7, $8,
      'RESEARCH_INVESTIGATION_CREATE_V1', 'RESEARCH_MUTATE', $9, $10, $11, $12, $13
    )
  `, [
    fixture.investigationId, fixture.tenantId, accountId, fixture.principalId, fixture.actorId,
    fixture.tenantMembershipId, accountAccessId, scope, fixture.sourceContext, seedHashes.investigation,
    `c1000000-0000-4000-8000-${fixture.principalId.slice(-12)}`, `idem-investigation-${fixture.principalId.slice(-12)}`, `corr-investigation-${fixture.principalId.slice(-12)}`,
  ]);
  await client.query(`
    insert into investing.research_material_roots (
      material_root_id, research_investigation_id, tenant_id, account_id, principal_id, actor_kind, actor_id,
      tenant_membership_id, account_access_id, operation_scope, source_context, material_kind, created_by_operation
    ) values
      ($1, $2, $3, $4, $5, 'USER_PRINCIPAL', $6, $7, $8, $9, $10, 'DRAFT', 'RESEARCH_DRAFT_REVISION_CREATE_V1'),
      ($11, $2, $3, $4, $5, 'USER_PRINCIPAL', $6, $7, $8, $9, $10, 'HYPOTHESIS', 'RESEARCH_HYPOTHESIS_REVISION_CREATE_V1'),
      ($12, $2, $3, $4, $5, 'USER_PRINCIPAL', $6, $7, $8, $9, $10, 'RESEARCH_SPEC', 'RESEARCH_SPEC_REVISION_CREATE_V1')
  `, [
    fixture.draftRootId, fixture.investigationId, fixture.tenantId, accountId, fixture.principalId, fixture.actorId,
    fixture.tenantMembershipId, accountAccessId, scope, fixture.sourceContext, fixture.hypothesisRootId, fixture.specRootId,
  ]);
  await client.query(`
    insert into investing.research_material_revisions (
      material_revision_id, material_root_id, research_investigation_id, tenant_id, account_id, principal_id, actor_kind, actor_id,
      tenant_membership_id, account_access_id, operation_scope, operation, capability, source_context, material_kind, revision_number,
      predecessor_revision_id, payload_schema_version, canonical_payload, material_hash, material_request_hash, idempotency_record_id, idempotency_key, correlation_id
    ) values
      ($1, $2, $3, $4, $5, $6, 'USER_PRINCIPAL', $7, $8, $9, $10, 'RESEARCH_DRAFT_REVISION_CREATE_V1', 'RESEARCH_MUTATE', $11, 'DRAFT', 1,
       null, 'RESEARCH_DRAFT_HASH_PAYLOAD_V1', '{"schemaVersion":"RESEARCH_DRAFT_HASH_PAYLOAD_V1"}'::jsonb, $12, $12, $13, $14, $15),
      ($16, $17, $3, $4, $5, $6, 'USER_PRINCIPAL', $7, $8, $9, $10, 'RESEARCH_HYPOTHESIS_REVISION_CREATE_V1', 'RESEARCH_MUTATE', $11, 'HYPOTHESIS', 1,
       null, 'HYPOTHESIS_HASH_PAYLOAD_V1', '{"schemaVersion":"HYPOTHESIS_HASH_PAYLOAD_V1"}'::jsonb, $18, $18, $19, $20, $21)
  `, [
    fixture.draftRevisionId, fixture.draftRootId, fixture.investigationId, fixture.tenantId, accountId,
    fixture.principalId, fixture.actorId, fixture.tenantMembershipId, accountAccessId, scope, fixture.sourceContext,
    seedHashes.draft, `c2000000-0000-4000-8000-${fixture.principalId.slice(-12)}`, `idem-draft-${fixture.principalId.slice(-12)}`, `corr-draft-${fixture.principalId.slice(-12)}`,
    fixture.hypothesisRevisionId, fixture.hypothesisRootId, seedHashes.hypothesis,
    `c3000000-0000-4000-8000-${fixture.principalId.slice(-12)}`, `idem-hypothesis-${fixture.principalId.slice(-12)}`, `corr-hypothesis-${fixture.principalId.slice(-12)}`,
  ]);
  await client.query(`
    insert into investing.research_spec_revisions (
      research_spec_revision_id, material_root_id, research_investigation_id, tenant_id, account_id, principal_id, actor_kind, actor_id,
      tenant_membership_id, account_access_id, operation_scope, source_context, operation, capability, revision_number, predecessor_revision_id,
      source_draft_revision_id, source_draft_material_hash, hypothesis_revision_id, hypothesis_material_hash, candidate_schema_version, candidate_status,
      canonical_candidate, material_request_hash, idempotency_record_id, idempotency_key, correlation_id
    ) values (
      $1, $2, $3, $4, $5, $6, 'USER_PRINCIPAL', $7, $8, $9, $10, $11, 'RESEARCH_SPEC_REVISION_CREATE_V1', 'RESEARCH_MUTATE', 1, null,
      $12, $13, $14, $15, 'RESEARCH_SPEC_CANDIDATE_V1', 'CANDIDATE_ONLY',
      jsonb_build_object('schemaVersion','RESEARCH_SPEC_CANDIDATE_V1','status','CANDIDATE_ONLY','sourceDraft',jsonb_build_object('hashHex',$13::text),'hypothesisBinding',jsonb_build_object('kind','EXPLICIT_HYPOTHESIS','hypothesis',jsonb_build_object('hashHex',$15::text))),
      $16, $17, $18, $19
    )
  `, [
    fixture.specRevisionId, fixture.specRootId, fixture.investigationId, fixture.tenantId, accountId,
    fixture.principalId, fixture.actorId, fixture.tenantMembershipId, accountAccessId, scope, fixture.sourceContext,
    fixture.draftRevisionId, seedHashes.draft, fixture.hypothesisRevisionId, seedHashes.hypothesis, seedHashes.spec,
    `c4000000-0000-4000-8000-${fixture.principalId.slice(-12)}`, `idem-spec-${fixture.principalId.slice(-12)}`, `corr-spec-${fixture.principalId.slice(-12)}`,
  ]);
  await client.query(`
    insert into investing.research_material_pointer_states (
      research_investigation_id, tenant_id, account_id, principal_id, actor_kind, actor_id,
      tenant_membership_id, account_access_id, operation_scope, source_context,
      active_draft_revision_id, active_hypothesis_revision_id, active_spec_revision_id, active_experiment_id, pointer_version
    ) values (
      $1, $2, $3, $4, 'USER_PRINCIPAL', $5, $6, $7, $8, $9, $10, $11, $12, null, 7
    )
  `, [
    fixture.investigationId, fixture.tenantId, accountId, fixture.principalId, fixture.actorId,
    fixture.tenantMembershipId, accountAccessId, scope, fixture.sourceContext, fixture.draftRevisionId,
    fixture.hypothesisRevisionId, fixture.specRevisionId,
  ]);
}

function experimentValues(input: {
  id: string;
  relation: "BASELINE" | "VARIANT";
  fixture?: Fixture;
  parentId?: string | null;
  researchIr: string;
  experimentHash?: string | null;
  parametersHash?: string | null;
  material?: string;
  idempotencyRecordId?: string;
}) {
  const fixture = input.fixture ?? tenantFixture;
  const operation = input.relation === "BASELINE" ? "RESEARCH_EXPERIMENT_BASELINE_CREATE_V1" : "RESEARCH_EXPERIMENT_VARIANT_CREATE_V1";
  const idempotencyRecordId = input.idempotencyRecordId ?? idempotencyRecordIdFor(input.id);
  const materialRequestHash = input.material ?? materialHashFor(input.id);
  return [
    input.id,
    fixture.investigationId,
    fixture.tenantId,
    fixture.accountId,
    fixture.principalId,
    "USER_PRINCIPAL",
    fixture.actorId,
    fixture.tenantMembershipId,
    fixture.accountAccessId,
    scopeFor(fixture),
    fixture.sourceContext,
    operation,
    "RESEARCH_MUTATE",
    input.relation,
    input.parentId ?? null,
    fixture.specRevisionId,
    "SHA-256",
    "SYNTRAKE:RESEARCH_IR:V1",
    "SYNTRAKE_SHA256_V1",
    input.researchIr,
    "SHA-256",
    "SYNTRAKE:EXPERIMENT:V1",
    "SYNTRAKE_SHA256_V1",
    input.experimentHash,
    input.relation === "VARIANT" ? "SHA-256" : null,
    input.relation === "VARIANT" ? "SYNTRAKE:EXPERIMENT_PARAMETERS:V1" : null,
    input.relation === "VARIANT" ? "SYNTRAKE_SHA256_V1" : null,
    input.parametersHash ?? null,
    materialRequestHash,
    idempotencyRecordId,
    `idem-${input.id}`,
    `corr-${input.id}`,
  ];
}

async function seedExperimentIdempotency(input: Parameters<typeof experimentValues>[0]) {
  const fixture = input.fixture ?? tenantFixture;
  const operation = input.relation === "BASELINE" ? "RESEARCH_EXPERIMENT_BASELINE_CREATE_V1" : "RESEARCH_EXPERIMENT_VARIANT_CREATE_V1";
  await client.query(`
    insert into investing.idempotency_records (
      idempotency_record_id, idempotency_key, material_request_hash, correlation_id, actor_kind, actor_id,
      operation_scope, operation, principal_id, tenant_id, account_id, status
    ) values ($1, $2, $3, $4, 'USER_PRINCIPAL', $5, $6, $7, $8, $9, $10, 'STARTED')
    on conflict (idempotency_record_id) do nothing
  `, [
    input.idempotencyRecordId ?? idempotencyRecordIdFor(input.id),
    `idem-${input.id}`,
    input.material ?? materialHashFor(input.id),
    `corr-${input.id}`,
    fixture.actorId,
    scopeFor(fixture),
    operation,
    fixture.principalId,
    fixture.tenantId,
    fixture.accountId,
  ]);
}

async function insertExperimentOwner(input: Parameters<typeof experimentValues>[0]) {
  await seedExperimentIdempotency(input);
  await client.query(
    `
      insert into investing.research_experiments (
        research_experiment_id, research_investigation_id, tenant_id, account_id, principal_id, actor_kind, actor_id,
        tenant_membership_id, account_access_id, operation_scope, source_context, operation, capability, relation,
        parent_experiment_id, research_spec_revision_id, research_ir_hash_algorithm, research_ir_hash_domain, research_ir_hash_version, research_ir_hash_hex,
        experiment_hash_algorithm, experiment_hash_domain, experiment_hash_version, experiment_hash_hex,
        experiment_parameters_hash_algorithm, experiment_parameters_hash_domain, experiment_parameters_hash_version, experiment_parameters_hash_hex,
        material_request_hash, idempotency_record_id, idempotency_key, correlation_id
      ) values (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
        $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32
      )
    `,
    experimentValues(input),
  );
}

async function withAppContext(
  fixture: Fixture,
  operation: "RESEARCH_EXPERIMENT_BASELINE_CREATE_V1" | "RESEARCH_EXPERIMENT_VARIANT_CREATE_V1",
  extra: Record<string, string>,
  work: () => Promise<void>,
) {
  await client.query("begin");
  try {
    await client.query("set local role investing_app");
    const base = {
      actor_kind: "USER_PRINCIPAL",
      actor_id: fixture.actorId,
      principal_id: fixture.principalId,
      tenant_id: fixture.tenantId,
      tenant_membership_id: fixture.tenantMembershipId,
      operation,
      capability: "RESEARCH_MUTATE",
      operation_scope: scopeFor(fixture),
      source_context: fixture.sourceContext,
      research_investigation_id: fixture.investigationId,
      research_spec_revision_id: fixture.specRevisionId,
      account_id: fixture.accountId ?? "",
      account_access_id: fixture.accountAccessId ?? "",
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

async function insertExperimentApp(
  input: Parameters<typeof experimentValues>[0],
  gucOverrides: Partial<{
    experimentHash: string;
    parametersHash: string;
    parentExperimentHash: string;
    parentResearchIr: string;
    expectedExperimentId: string;
    accountId: string;
    accountAccessId: string;
  }> = {},
) {
  const fixture = input.fixture ?? tenantFixture;
  const operation = input.relation === "BASELINE" ? "RESEARCH_EXPERIMENT_BASELINE_CREATE_V1" : "RESEARCH_EXPERIMENT_VARIANT_CREATE_V1";
  const idempotencyRecordId = input.idempotencyRecordId ?? idempotencyRecordIdFor(input.id);
  const materialRequestHash = input.material ?? materialHashFor(input.id);
  const expectedExperimentId = gucOverrides.expectedExperimentId ?? input.parentId ?? "";
  await withAppContext(fixture, operation, {
    research_experiment_id: input.id,
    parent_experiment_id: input.parentId ?? "",
    expected_experiment_id: expectedExperimentId,
    material_request_hash: materialRequestHash,
    idempotency_record_id: idempotencyRecordId,
    idempotency_key: `idem-${input.id}`,
    correlation_id: `corr-${input.id}`,
    research_ir_hash_hex: input.researchIr,
    experiment_hash_hex: gucOverrides.experimentHash ?? input.experimentHash ?? "",
    experiment_parameters_hash_hex: gucOverrides.parametersHash ?? input.parametersHash ?? "",
    parent_research_ir_hash_hex: gucOverrides.parentResearchIr ?? hashes.parentIr,
    parent_experiment_hash_hex: gucOverrides.parentExperimentHash ?? hashes.e0Experiment,
    account_id: gucOverrides.accountId ?? fixture.accountId ?? "",
    account_access_id: gucOverrides.accountAccessId ?? fixture.accountAccessId ?? "",
  }, async () => {
    await client.query(`
      insert into investing.idempotency_records (
        idempotency_record_id, idempotency_key, material_request_hash, correlation_id, actor_kind, actor_id,
        operation_scope, operation, principal_id, tenant_id, account_id, status
      ) values ($1, $2, $3, $4, 'USER_PRINCIPAL', $5, $6, $7, $8, $9, $10, 'STARTED')
    `, [idempotencyRecordId, `idem-${input.id}`, materialRequestHash, `corr-${input.id}`, fixture.actorId, scopeFor(fixture), operation, fixture.principalId, fixture.tenantId, fixture.accountId]);
    if (input.relation === "VARIANT") {
      const parent = await client.query("select research_experiment_id from investing.research_experiments where research_experiment_id = $1", [input.parentId]);
      expect(parent.rowCount).toBe(1);
    }
    await insertExperimentOwner(input);
    const updated = await client.query(`
      update investing.research_material_pointer_states
      set active_experiment_id = $1,
          pointer_version = pointer_version + 1,
          updated_by_operation = $2,
          updated_at = transaction_timestamp()
      where research_investigation_id = $3
        and active_spec_revision_id = $4
        and ${input.relation === "BASELINE" ? "active_experiment_id is null" : "active_experiment_id = $5"}
    `, input.relation === "BASELINE"
      ? [input.id, operation, fixture.investigationId, fixture.specRevisionId]
      : [input.id, operation, fixture.investigationId, fixture.specRevisionId, expectedExperimentId]);
    expect(updated.rowCount).toBe(1);
    await client.query(`
      update investing.idempotency_records
      set status = 'SUCCEEDED',
          canonical_result_reference = $2::jsonb,
          completed_at = transaction_timestamp(),
          updated_at = transaction_timestamp()
      where idempotency_record_id = $1 and status = 'STARTED'
    `, [idempotencyRecordId, JSON.stringify({ researchExperimentId: input.id, relation: input.relation })]);
  });
}

maybeDescribe("I5 Experiment scientific closure PG17 rehearsal", () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString });
    client = await pool.connect();
  });

  afterAll(async () => {
    await client?.release();
    await pool?.end();
  });

  it("applies predecessors, fails closed on pre-existing Experiment rows, then applies scientific closure", async () => {
    await resetDisposableDatabase();
    await applyPredecessors();
    await seedAuthorityFixture(tenantFixture);
    await seedExperimentIdempotency({ id: ids.e0, relation: "BASELINE", researchIr: hashes.parentIr, material: materialHashFor(ids.e0) });
    await client.query(`
      insert into investing.research_experiments (
        research_experiment_id, research_investigation_id, tenant_id, principal_id, actor_kind, actor_id,
        tenant_membership_id, operation_scope, source_context, operation, capability, relation,
        research_spec_revision_id, research_ir_hash_algorithm, research_ir_hash_domain, research_ir_hash_version, research_ir_hash_hex,
        material_request_hash, idempotency_record_id, idempotency_key, correlation_id
      ) values (
        '${ids.e0}', '${ids.investigation}', '${ids.tenant}', '${ids.principal}', 'USER_PRINCIPAL', 'pg17-scientific-closure',
        '${ids.membership}', 'TENANT_SCOPE', 'PURE_RESEARCH', 'RESEARCH_EXPERIMENT_BASELINE_CREATE_V1', 'RESEARCH_MUTATE', 'BASELINE',
        '${ids.spec}', 'SHA-256', 'SYNTRAKE:RESEARCH_IR:V1', 'SYNTRAKE_SHA256_V1', '${hashes.parentIr}',
        '${materialHashFor(ids.e0)}', '${idempotencyRecordIdFor(ids.e0)}', 'idem-${ids.e0}', 'corr-${ids.e0}'
      )
    `);
    let migrationError: unknown;
    try {
      await client.query(readSql(closureMigration));
    } catch (error) {
      migrationError = error;
    } finally {
      await client.query("rollback").catch(() => undefined);
    }
    expect(migrationError).toBeInstanceOf(Error);
    expect((migrationError as Error).message).toMatch(/research_experiments must be empty/i);

    await resetDisposableDatabase();
    await applyClosure();
    const columns = await client.query<{ column_name: string; is_nullable: string }>(`
      select column_name, is_nullable
      from information_schema.columns
      where table_schema = 'investing'
        and table_name = 'research_experiments'
        and column_name in ('experiment_hash_algorithm','experiment_hash_domain','experiment_hash_version','experiment_hash_hex')
    `);
    expect(columns.rows.every((row) => row.is_nullable === "NO")).toBe(true);
    const checks = await client.query<{ conname: string; convalidated: boolean }>(`
      select con.conname, con.convalidated
      from pg_catalog.pg_constraint con
      where con.conrelid = 'investing.research_experiments'::regclass
        and con.conname in ('research_experiments_experiment_hash_envelope_check','research_experiments_experiment_parameters_shape_check')
    `);
    expect(checks.rows).toEqual(expect.arrayContaining([
      { conname: "research_experiments_experiment_hash_envelope_check", convalidated: true },
      { conname: "research_experiments_experiment_parameters_shape_check", convalidated: true },
    ]));
    await expect(client.query("select 1 from pg_constraint where conname = 'research_experiments_parent_family_fk' and conrelid = 'investing.research_experiments'::regclass")).resolves.toMatchObject({ rowCount: 0 });
    await expect(client.query("select 1 from pg_class where relname in ('research_experiments_baseline_binding_key','research_experiments_variant_structural_binding_key')")).resolves.toMatchObject({ rowCount: 0 });
    await expect(client.query("select 1 from pg_constraint where conname = 'research_experiments_parent_operational_fk' and conrelid = 'investing.research_experiments'::regclass")).resolves.toMatchObject({ rowCount: 1 });
    await expect(client.query("select 1 from pg_class where relname = 'research_experiments_scientific_identity_key'")).resolves.toMatchObject({ rowCount: 1 });
    await expect(client.query("select relrowsecurity, relforcerowsecurity from pg_class where oid = 'investing.research_experiments'::regclass")).resolves.toMatchObject({ rows: [{ relrowsecurity: true, relforcerowsecurity: true }] });
    await expect(client.query("select 1 from information_schema.role_table_grants where table_schema = 'investing' and table_name = 'research_experiments' and grantee = 'investing_app' and privilege_type not in ('SELECT','INSERT')")).resolves.toMatchObject({ rowCount: 0 });
  });

  it("rejects malformed or missing scientific envelopes at the database layer", async () => {
    await resetDisposableDatabase();
    await applyClosure();
    await seedAuthorityFixture(tenantFixture);
    await expect(insertExperimentOwner({ id: ids.e0, relation: "BASELINE", researchIr: hashes.parentIr, experimentHash: null })).rejects.toThrow(/null value|not-null/i);
    await insertExperimentOwner({ id: ids.e0, relation: "BASELINE", researchIr: hashes.parentIr, experimentHash: hashes.e0Experiment });
    await expect(insertExperimentOwner({ id: ids.e1, relation: "VARIANT", parentId: ids.e0, researchIr: hashes.e1Ir, experimentHash: null, parametersHash: hashes.p1 })).rejects.toThrow(/null value|not-null/i);
    await expect(insertExperimentOwner({ id: ids.e1, relation: "VARIANT", parentId: ids.e0, researchIr: hashes.e1Ir, experimentHash: hashes.e1Experiment, parametersHash: null })).rejects.toThrow(/experiment_parameters_shape/i);
    await expect(insertExperimentOwner({ id: ids.e1, relation: "VARIANT", parentId: ids.e0, researchIr: hashes.e1Ir, experimentHash: "bad", parametersHash: hashes.p1 })).rejects.toThrow(/experiment_hash_envelope/i);
    await expect(insertExperimentOwner({ id: ids.e1, relation: "VARIANT", parentId: ids.e0, researchIr: hashes.e1Ir, experimentHash: hashes.e1Experiment, parametersHash: "bad" })).rejects.toThrow(/experiment_parameters_shape/i);
    await seedExperimentIdempotency({ id: ids.duplicate, relation: "BASELINE", researchIr: hashes.parentIr, experimentHash: hashes.e0Experiment });
    await expect(client.query(`
      insert into investing.research_experiments (
        research_experiment_id, research_investigation_id, tenant_id, principal_id, actor_kind, actor_id, tenant_membership_id,
        operation_scope, source_context, operation, capability, relation, research_spec_revision_id,
        research_ir_hash_algorithm, research_ir_hash_domain, research_ir_hash_version, research_ir_hash_hex,
        experiment_hash_algorithm, experiment_hash_domain, experiment_hash_version, experiment_hash_hex,
        material_request_hash, idempotency_record_id, idempotency_key, correlation_id
      ) values ('${ids.duplicate}', '${ids.investigation}', '${ids.tenant}', '${ids.principal}', 'USER_PRINCIPAL', 'pg17-scientific-closure', '${ids.membership}',
        'TENANT_SCOPE', 'PURE_RESEARCH', 'RESEARCH_EXPERIMENT_BASELINE_CREATE_V1', 'RESEARCH_MUTATE', 'BASELINE', '${ids.spec}',
        'SHA-256', 'SYNTRAKE:RESEARCH_IR:V1', 'SYNTRAKE_SHA256_V1', '${hashes.parentIr}',
        'SHA-256', 'SYNTRAKE:RESEARCH_SPEC:V1', 'SYNTRAKE_SHA256_V1', '${hashes.e0Experiment}',
        '${materialHashFor(ids.duplicate)}', '${idempotencyRecordIdFor(ids.duplicate)}', 'idem-${ids.duplicate}', 'corr-${ids.duplicate}')
    `)).rejects.toThrow(/experiment_hash_envelope/i);
  });

  it("enforces RLS scientific bindings and persists sibling and chained VARIANT scientific identity", async () => {
    await resetDisposableDatabase();
    await applyClosure();
    await seedAuthorityFixture(tenantFixture);
    await seedAuthorityFixture(accountFixture);
    await insertExperimentApp({ id: ids.e0, relation: "BASELINE", researchIr: hashes.parentIr, experimentHash: hashes.e0Experiment });
    await expect(insertExperimentApp(
      { id: "a9000000-0000-4000-8000-000000000090", relation: "BASELINE", researchIr: hashes.parentIr, experimentHash: hashes.e1Experiment },
      { experimentHash: hashes.e0Experiment },
    )).rejects.toThrow(/row-level security/i);
    await insertExperimentApp({ id: ids.e1, relation: "VARIANT", parentId: ids.e0, researchIr: hashes.e1Ir, experimentHash: hashes.e1Experiment, parametersHash: hashes.p1 });
    await insertExperimentApp(
      { id: ids.e2, relation: "VARIANT", parentId: ids.e0, researchIr: hashes.e2Ir, experimentHash: hashes.e2Experiment, parametersHash: hashes.p2 },
      { expectedExperimentId: ids.e1 },
    );
    await insertExperimentApp(
      { id: ids.e3, relation: "VARIANT", parentId: ids.e1, researchIr: hashes.e3Ir, experimentHash: hashes.e3Experiment, parametersHash: hashes.p3 },
      { expectedExperimentId: ids.e2, parentResearchIr: hashes.e1Ir, parentExperimentHash: hashes.e1Experiment },
    );
    await expect(insertExperimentApp(
      { id: "a9100000-0000-4000-8000-000000000091", relation: "VARIANT", parentId: ids.e3, researchIr: hashes.e1Ir, experimentHash: hashes.e2Experiment, parametersHash: hashes.p1 },
      { expectedExperimentId: ids.e3, experimentHash: hashes.e1Experiment, parentResearchIr: hashes.e3Ir, parentExperimentHash: hashes.e3Experiment },
    )).rejects.toThrow(/row-level security/i);
    await expect(insertExperimentApp(
      { id: "a9200000-0000-4000-8000-000000000092", relation: "VARIANT", parentId: ids.e3, researchIr: hashes.e1Ir, experimentHash: "F111111111111111111111111111111111111111111111111111111111111111", parametersHash: hashes.p2 },
      { expectedExperimentId: ids.e3, parametersHash: hashes.p1, parentResearchIr: hashes.e3Ir, parentExperimentHash: hashes.e3Experiment },
    )).rejects.toThrow(/row-level security/i);
    await withAppContext(tenantFixture, "RESEARCH_EXPERIMENT_VARIANT_CREATE_V1", {
      parent_experiment_id: ids.e3,
      parent_research_ir_hash_hex: hashes.e3Ir,
      parent_experiment_hash_hex: hashes.e1Experiment,
      research_experiment_id: ids.e1,
      expected_experiment_id: ids.e3,
      material_request_hash: "9999999999999999999999999999999999999999999999999999999999999999",
      idempotency_record_id: "b9900000-0000-4000-8000-000000000071",
      idempotency_key: "idem-parent-probe",
      correlation_id: "corr-parent-probe",
      research_ir_hash_hex: hashes.e1Ir,
      experiment_hash_hex: hashes.e1Experiment,
      experiment_parameters_hash_hex: hashes.p1,
    }, async () => {
      const visible = await client.query("select research_experiment_id from investing.research_experiments where research_experiment_id = $1", [ids.e0]);
      expect(visible.rows).toHaveLength(0);
    });
    await expect(insertExperimentOwner({
      id: "a9300000-0000-4000-8000-000000000093",
      relation: "VARIANT",
      parentId: "a9900000-0000-4000-8000-000000000099",
      researchIr: hashes.e1Ir,
      experimentHash: "F222222222222222222222222222222222222222222222222222222222222222",
      parametersHash: "F333333333333333333333333333333333333333333333333333333333333333",
    })).rejects.toThrow(/research_experiments_parent_operational_fk|foreign key/i);

    const rows = await client.query<{ research_experiment_id: string; parent_experiment_id: string | null; research_ir_hash_hex: string; experiment_hash_hex: string; experiment_parameters_hash_hex: string | null }>(
      "select research_experiment_id, parent_experiment_id, research_ir_hash_hex, experiment_hash_hex, experiment_parameters_hash_hex from investing.research_experiments order by research_experiment_id",
    );
    expect(rows.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ research_experiment_id: ids.e0, parent_experiment_id: null, research_ir_hash_hex: hashes.parentIr, experiment_hash_hex: hashes.e0Experiment, experiment_parameters_hash_hex: null }),
      expect.objectContaining({ research_experiment_id: ids.e1, parent_experiment_id: ids.e0, research_ir_hash_hex: hashes.e1Ir, experiment_hash_hex: hashes.e1Experiment, experiment_parameters_hash_hex: hashes.p1 }),
      expect.objectContaining({ research_experiment_id: ids.e2, parent_experiment_id: ids.e0, research_ir_hash_hex: hashes.e2Ir, experiment_hash_hex: hashes.e2Experiment, experiment_parameters_hash_hex: hashes.p2 }),
      expect.objectContaining({ research_experiment_id: ids.e3, parent_experiment_id: ids.e1, research_ir_hash_hex: hashes.e3Ir, experiment_hash_hex: hashes.e3Experiment, experiment_parameters_hash_hex: hashes.p3 }),
    ]));
    expect(rows.rows.find((row) => row.research_experiment_id === ids.e1)?.research_ir_hash_hex).not.toBe(rows.rows.find((row) => row.research_experiment_id === ids.e2)?.research_ir_hash_hex);
    expect(rows.rows.find((row) => row.research_experiment_id === ids.e1)?.experiment_parameters_hash_hex).not.toBe(rows.rows.find((row) => row.research_experiment_id === ids.e2)?.experiment_parameters_hash_hex);
    expect(rows.rows.find((row) => row.research_experiment_id === ids.e1)?.experiment_hash_hex).not.toBe(rows.rows.find((row) => row.research_experiment_id === ids.e2)?.experiment_hash_hex);
    await expect(insertExperimentOwner({ id: ids.duplicate, relation: "VARIANT", parentId: ids.e0, researchIr: hashes.e1Ir, experimentHash: hashes.e1Experiment, parametersHash: hashes.p1 })).rejects.toThrow(/duplicate key/i);

    await insertExperimentApp({ fixture: accountFixture, id: ids.accountE0, relation: "BASELINE", researchIr: hashes.parentIr, experimentHash: "ABABABABABABABABABABABABABABABABABABABABABABABABABABABABABABABAB" });
    await insertExperimentApp(
      { fixture: accountFixture, id: ids.accountE1, relation: "VARIANT", parentId: ids.accountE0, researchIr: hashes.e1Ir, experimentHash: "ACACACACACACACACACACACACACACACACACACACACACACACACACACACACACACACAC", parametersHash: hashes.p1 },
      { parentResearchIr: hashes.parentIr, parentExperimentHash: "ABABABABABABABABABABABABABABABABABABABABABABABABABABABABABABABAB" },
    );
    await expect(insertExperimentApp(
      { fixture: accountFixture, id: "a8000000-0000-4000-8000-000000000081", relation: "VARIANT", parentId: ids.accountE1, researchIr: hashes.e2Ir, experimentHash: "ADADADADADADADADADADADADADADADADADADADADADADADADADADADADADADADAD", parametersHash: hashes.p2 },
      { expectedExperimentId: ids.accountE1, parentResearchIr: hashes.e1Ir, parentExperimentHash: "ACACACACACACACACACACACACACACACACACACACACACACACACACACACACACACACAC", accountId: ids.wrongAccount, accountAccessId: ids.wrongAccountAccess },
    )).rejects.toThrow(/row-level security/i);

    const beforeRollbackPointer = await client.query<{ active_experiment_id: string | null; pointer_version: string }>(
      "select active_experiment_id, pointer_version::text from investing.research_material_pointer_states where research_investigation_id = $1",
      [tenantFixture.investigationId],
    );
    await client.query("begin");
    await client.query("set local role investing_app");
    for (const [key, value] of Object.entries({
      actor_kind: "USER_PRINCIPAL",
      actor_id: tenantFixture.actorId,
      principal_id: tenantFixture.principalId,
      tenant_id: tenantFixture.tenantId,
      tenant_membership_id: tenantFixture.tenantMembershipId,
      operation: "RESEARCH_EXPERIMENT_VARIANT_CREATE_V1",
      capability: "RESEARCH_MUTATE",
      operation_scope: "TENANT_SCOPE",
      source_context: "PURE_RESEARCH",
      research_investigation_id: tenantFixture.investigationId,
      research_spec_revision_id: tenantFixture.specRevisionId,
      parent_experiment_id: ids.e3,
      expected_experiment_id: ids.e3,
      research_experiment_id: ids.rollback,
      material_request_hash: materialHashFor(ids.rollback),
      idempotency_record_id: idempotencyRecordIdFor(ids.rollback),
      idempotency_key: `idem-${ids.rollback}`,
      correlation_id: `corr-${ids.rollback}`,
      research_ir_hash_hex: hashes.e3Ir,
      experiment_hash_hex: "EEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE",
      experiment_parameters_hash_hex: hashes.p3,
      parent_research_ir_hash_hex: hashes.e3Ir,
      parent_experiment_hash_hex: hashes.e3Experiment,
    })) {
      await client.query("select set_config($1, $2, true)", [`syntrake.investing.${key}`, value]);
    }
    await client.query(`
      insert into investing.idempotency_records (
        idempotency_record_id, idempotency_key, material_request_hash, correlation_id, actor_kind, actor_id,
        operation_scope, operation, principal_id, tenant_id, account_id, status
      ) values ($1, $2, $3, $4, 'USER_PRINCIPAL', $5, 'TENANT_SCOPE', 'RESEARCH_EXPERIMENT_VARIANT_CREATE_V1', $6, $7, null, 'STARTED')
    `, [idempotencyRecordIdFor(ids.rollback), `idem-${ids.rollback}`, materialHashFor(ids.rollback), `corr-${ids.rollback}`, tenantFixture.actorId, tenantFixture.principalId, tenantFixture.tenantId]);
    await insertExperimentOwner({ id: ids.rollback, relation: "VARIANT", parentId: ids.e3, researchIr: hashes.e3Ir, experimentHash: "EEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE", parametersHash: hashes.p3 });
    const rollbackPointerUpdate = await client.query(`
      update investing.research_material_pointer_states
      set active_experiment_id = $1,
          pointer_version = pointer_version + 1,
          updated_by_operation = 'RESEARCH_EXPERIMENT_VARIANT_CREATE_V1',
          updated_at = transaction_timestamp()
      where research_investigation_id = $2 and active_spec_revision_id = $3 and active_experiment_id = $4
    `, [ids.rollback, tenantFixture.investigationId, tenantFixture.specRevisionId, ids.e3]);
    expect(rollbackPointerUpdate.rowCount).toBe(1);
    await client.query(`
      update investing.idempotency_records
      set status = 'SUCCEEDED',
          canonical_result_reference = $2::jsonb,
          completed_at = transaction_timestamp(),
          updated_at = transaction_timestamp()
      where idempotency_record_id = $1 and status = 'STARTED'
    `, [idempotencyRecordIdFor(ids.rollback), JSON.stringify({ researchExperimentId: ids.rollback })]);
    await client.query("rollback");
    await expect(client.query("select 1 from investing.research_experiments where research_experiment_id = $1", [ids.rollback])).resolves.toMatchObject({ rowCount: 0 });
    await expect(client.query(
      "select active_experiment_id, pointer_version::text from investing.research_material_pointer_states where research_investigation_id = $1",
      [tenantFixture.investigationId],
    )).resolves.toMatchObject({ rows: beforeRollbackPointer.rows });
    await expect(client.query("select 1 from investing.idempotency_records where idempotency_record_id = $1", [idempotencyRecordIdFor(ids.rollback)])).resolves.toMatchObject({ rowCount: 0 });

    expect(ids.e0).not.toBe(ids.e1);
  });
});
