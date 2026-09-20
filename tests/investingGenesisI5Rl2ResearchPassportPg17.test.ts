import fs from "node:fs";
import path from "node:path";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { resolveVerifiedClerkIdentity } from "../lib/investing/authority/clerk";
import { getInvestingAuthorityDatabase } from "../lib/investing/authority/transport";
import { readResearchPassportServiceV1 } from "../lib/investing/research/researchPassportService";

vi.mock("server-only", () => ({}));
vi.mock("../lib/investing/authority/clerk", () => ({ resolveVerifiedClerkIdentity: vi.fn() }));
vi.mock("../lib/investing/authority/transport", () => ({ getInvestingAuthorityDatabase: vi.fn() }));

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
const appRoleProofs: Array<{ current_user: string; current_role: string }> = [];
let lastPgError: unknown = null;

const ids = {
  principal: "10000000-0000-4000-8000-0000000002a1",
  tenant: "20000000-0000-4000-8000-0000000002a1",
  membership: "30000000-0000-4000-8000-0000000002a1",
  account: "40000000-0000-4000-8000-0000000002a1",
  accountAccess: "50000000-0000-4000-8000-0000000002a1",
  investigationA: "60000000-0000-4000-8000-0000000002a1",
  investigationB: "60000000-0000-4000-8000-0000000002b1",
  investigationAccount: "60000000-0000-4000-8000-0000000002c1",
  foreignPrincipal: "10000000-0000-4000-8000-0000000002f1",
  foreignTenant: "20000000-0000-4000-8000-0000000002f1",
  foreignMembership: "30000000-0000-4000-8000-0000000002f1",
  foreignInvestigation: "60000000-0000-4000-8000-0000000002f1",
  draftRoot: "70000000-0000-4000-8000-0000000002a1",
  hypRoot: "70000000-0000-4000-8000-0000000002a2",
  specRoot: "70000000-0000-4000-8000-0000000002a3",
  draft1: "71000000-0000-4000-8000-0000000002a1",
  draft2: "71000000-0000-4000-8000-0000000002a2",
  hyp1: "72000000-0000-4000-8000-0000000002a1",
  spec1: "73000000-0000-4000-8000-0000000002a1",
  spec2: "73000000-0000-4000-8000-0000000002a2",
  specIdentity: "74000000-0000-4000-8000-0000000002a1",
  baseline: "75000000-0000-4000-8000-0000000002a1",
  variant1: "75000000-0000-4000-8000-0000000002a2",
  variant2: "75000000-0000-4000-8000-0000000002a3",
  runInput: "76000000-0000-4000-8000-0000000002a1",
  run1: "77000000-0000-4000-8000-0000000002a1",
  run2: "77000000-0000-4000-8000-0000000002a2",
  runFailed: "77000000-0000-4000-8000-0000000002a3",
  result: "78000000-0000-4000-8000-0000000002a1",
  evidence: "79000000-0000-4000-8000-0000000002a1",
  trace: "7a000000-0000-4000-8000-0000000002a1",
  valuation: "7a000000-0000-4000-8000-0000000002a2",
  metrics: "7a000000-0000-4000-8000-0000000002a3",
};

const h = (c: string) => c.repeat(64).toUpperCase();

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

function useRealPgAppTransport() {
  appRoleProofs.length = 0;
  lastPgError = null;
  vi.mocked(resolveVerifiedClerkIdentity).mockResolvedValue({
    ok: true,
    externalProvider: "CLERK",
    externalSubject: "pg17-rl2",
  });
  vi.mocked(getInvestingAuthorityDatabase).mockReturnValue({
    connect: async () => {
      const pgClient = await pool.connect();
      return {
        query: async <Row = Record<string, unknown>>(text: string, values: readonly unknown[] = []) => {
          try {
            const result = await pgClient.query<Row>(text, values as unknown[]);
            if (text.trim().toLowerCase().startsWith("begin")) {
              await pgClient.query("set local role investing_app");
              const proof = await pgClient.query<{ current_user: string; current_role: string }>("select current_user, current_role");
              appRoleProofs.push(proof.rows[0]!);
            }
            return { rows: result.rows, rowCount: result.rowCount };
          } catch (error) {
            lastPgError = error;
            throw error;
          }
        },
        release: (destroy?: boolean) => pgClient.release(destroy),
      };
    },
  });
}

async function seedCanonicalPassportHistory() {
  await client.query("insert into investing.principals (principal_id, external_provider, external_subject) values ($1, 'CLERK', 'pg17-rl2')", [ids.principal]);
  await client.query("insert into investing.principals (principal_id, external_provider, external_subject) values ($1, 'CLERK', 'pg17-foreign')", [ids.foreignPrincipal]);
  await client.query("insert into investing.tenants (tenant_id) values ($1)", [ids.tenant]);
  await client.query("insert into investing.tenants (tenant_id) values ($1)", [ids.foreignTenant]);
  await client.query("insert into investing.tenant_memberships (tenant_membership_id, tenant_id, principal_id, role, state) values ($1,$2,$3,'OWNER','ACTIVE')", [ids.membership, ids.tenant, ids.principal]);
  await client.query("insert into investing.tenant_memberships (tenant_membership_id, tenant_id, principal_id, role, state) values ($1,$2,$3,'OWNER','ACTIVE')", [ids.foreignMembership, ids.foreignTenant, ids.foreignPrincipal]);
  await client.query("insert into investing.accounts (account_id, tenant_id, initial_tenant_membership_id, initial_principal_id, base_currency) values ($1,$2,$3,$4,'USD')", [ids.account, ids.tenant, ids.membership, ids.principal]);
  await client.query("insert into investing.account_access (account_access_id, account_id, tenant_id, tenant_membership_id, principal_id, role, state) values ($1,$2,$3,$4,$5,'OWNER','ACTIVE')", [ids.accountAccess, ids.account, ids.tenant, ids.membership, ids.principal]);

  await client.query(`
    alter table investing.idempotency_records drop constraint if exists idempotency_records_operation_check;
    alter table investing.idempotency_records add constraint idempotency_records_operation_check check (operation in (
      'INITIAL_PERSONAL_BOOTSTRAP','RESEARCH_INVESTIGATION_CREATE_V1','RESEARCH_DRAFT_REVISION_CREATE_V1',
      'RESEARCH_HYPOTHESIS_REVISION_CREATE_V1','RESEARCH_SPEC_REVISION_CREATE_V1',
      'RESEARCH_EXPERIMENT_BASELINE_CREATE_V1','RESEARCH_EXPERIMENT_VARIANT_CREATE_V1'
    ));
  `);

  const idemRows = [
    ["81000000-0000-4000-8000-0000000002a1", "idem-rl2-investigation-a-0001", "RESEARCH_INVESTIGATION_CREATE_V1", null],
    ["81000000-0000-4000-8000-0000000002b1", "idem-rl2-investigation-b-0001", "RESEARCH_INVESTIGATION_CREATE_V1", null],
    ["81000000-0000-4000-8000-0000000002c1", "idem-rl2-investigation-c-0001", "RESEARCH_INVESTIGATION_CREATE_V1", ids.account],
    ["81000000-0000-4000-8000-0000000002ff", "idem-rl2-foreign-investigation-0001", "RESEARCH_INVESTIGATION_CREATE_V1", null],
    ["81000000-0000-4000-8000-0000000002d1", "idem-rl2-draft-0001", "RESEARCH_DRAFT_REVISION_CREATE_V1", null],
    ["81000000-0000-4000-8000-0000000002d2", "idem-rl2-draft-0002", "RESEARCH_DRAFT_REVISION_CREATE_V1", null],
    ["81000000-0000-4000-8000-0000000002e1", "idem-rl2-hyp-0001", "RESEARCH_HYPOTHESIS_REVISION_CREATE_V1", null],
    ["81000000-0000-4000-8000-0000000002f1", "idem-rl2-spec-0001", "RESEARCH_SPEC_REVISION_CREATE_V1", null],
    ["81000000-0000-4000-8000-0000000002f2", "idem-rl2-spec-0002", "RESEARCH_SPEC_REVISION_CREATE_V1", null],
    ["81000000-0000-4000-8000-0000000002b2", "idem-rl2-baseline-0001", "RESEARCH_EXPERIMENT_BASELINE_CREATE_V1", null],
    ["81000000-0000-4000-8000-0000000002b3", "idem-rl2-variant-0001", "RESEARCH_EXPERIMENT_VARIANT_CREATE_V1", null],
    ["81000000-0000-4000-8000-0000000002b4", "idem-rl2-variant-0002", "RESEARCH_EXPERIMENT_VARIANT_CREATE_V1", null],
  ] as const;
  for (const [id, key, operation, accountId] of idemRows) {
    await client.query(
      "insert into investing.idempotency_records (idempotency_record_id, idempotency_key, material_request_hash, correlation_id, actor_kind, actor_id, operation_scope, operation, principal_id, tenant_id, account_id, status, completed_at) values ($1,$2,$3,$4,'USER_PRINCIPAL','pg17-rl2',$5,$6,$7,$8,$9,'SUCCEEDED',now())",
      [
        id,
        key,
        h("A"),
        `corr-${key}`,
        accountId ? "ACCOUNT_SCOPE" : "TENANT_SCOPE",
        operation,
        key.includes("foreign") ? ids.foreignPrincipal : ids.principal,
        key.includes("foreign") ? ids.foreignTenant : ids.tenant,
        accountId,
      ],
    );
  }

  await client.query(`
    insert into investing.research_investigations (
      research_investigation_id, tenant_id, account_id, principal_id, actor_kind, actor_id, tenant_membership_id, account_access_id,
      operation_scope, operation, capability, source_context, material_request_hash, idempotency_record_id, idempotency_key, correlation_id
    ) values
      ($1,$4,null,$5,'USER_PRINCIPAL','pg17-rl2',$6,null,'TENANT_SCOPE','RESEARCH_INVESTIGATION_CREATE_V1','RESEARCH_MUTATE','PURE_RESEARCH',$7,'81000000-0000-4000-8000-0000000002a1','idem-rl2-investigation-a-0001','corr-idem-rl2-investigation-a-0001'),
      ($2,$4,null,$5,'USER_PRINCIPAL','pg17-rl2',$6,null,'TENANT_SCOPE','RESEARCH_INVESTIGATION_CREATE_V1','RESEARCH_MUTATE','PURE_RESEARCH',$7,'81000000-0000-4000-8000-0000000002b1','idem-rl2-investigation-b-0001','corr-idem-rl2-investigation-b-0001'),
      ($3,$4,$8,$5,'USER_PRINCIPAL','pg17-rl2',$6,$9,'ACCOUNT_SCOPE','RESEARCH_INVESTIGATION_CREATE_V1','RESEARCH_MUTATE','USER_PORTFOLIO',$7,'81000000-0000-4000-8000-0000000002c1','idem-rl2-investigation-c-0001','corr-idem-rl2-investigation-c-0001'),
      ($10,$11,null,$12,'USER_PRINCIPAL','pg17-foreign',$13,null,'TENANT_SCOPE','RESEARCH_INVESTIGATION_CREATE_V1','RESEARCH_MUTATE','PURE_RESEARCH',$7,'81000000-0000-4000-8000-0000000002ff','idem-rl2-foreign-investigation-0001','corr-idem-rl2-foreign-investigation-0001')
  `, [ids.investigationA, ids.investigationB, ids.investigationAccount, ids.tenant, ids.principal, ids.membership, h("A"), ids.account, ids.accountAccess, ids.foreignInvestigation, ids.foreignTenant, ids.foreignPrincipal, ids.foreignMembership]);

  await client.query(`
    insert into investing.research_material_roots (
      material_root_id, research_investigation_id, tenant_id, account_id, principal_id, actor_kind, actor_id,
      tenant_membership_id, account_access_id, operation_scope, source_context, material_kind, created_by_operation
    ) values
      ($1,$4,$5,null,$6,'USER_PRINCIPAL','pg17-rl2',$7,null,'TENANT_SCOPE','PURE_RESEARCH','DRAFT','RESEARCH_DRAFT_REVISION_CREATE_V1'),
      ($2,$4,$5,null,$6,'USER_PRINCIPAL','pg17-rl2',$7,null,'TENANT_SCOPE','PURE_RESEARCH','HYPOTHESIS','RESEARCH_HYPOTHESIS_REVISION_CREATE_V1'),
      ($3,$4,$5,null,$6,'USER_PRINCIPAL','pg17-rl2',$7,null,'TENANT_SCOPE','PURE_RESEARCH','RESEARCH_SPEC','RESEARCH_SPEC_REVISION_CREATE_V1')
  `, [ids.draftRoot, ids.hypRoot, ids.specRoot, ids.investigationA, ids.tenant, ids.principal, ids.membership]);

  await client.query(`
    insert into investing.research_material_revisions (
      material_revision_id, material_root_id, research_investigation_id, tenant_id, account_id, principal_id, actor_kind, actor_id,
      tenant_membership_id, account_access_id, operation_scope, operation, capability, source_context, material_kind, revision_number,
      predecessor_revision_id, payload_schema_version, canonical_payload, material_hash, material_request_hash, idempotency_record_id, idempotency_key, correlation_id
    ) values
      ($1,$4,$6,$7,null,$8,'USER_PRINCIPAL','pg17-rl2',$9,null,'TENANT_SCOPE','RESEARCH_DRAFT_REVISION_CREATE_V1','RESEARCH_MUTATE','PURE_RESEARCH','DRAFT',1,null,'RESEARCH_DRAFT_HASH_PAYLOAD_V1','{"schemaVersion":"RESEARCH_DRAFT_HASH_PAYLOAD_V1"}'::jsonb,$10,$13,'81000000-0000-4000-8000-0000000002d1','idem-rl2-draft-0001','corr-idem-rl2-draft-0001'),
      ($2,$4,$6,$7,null,$8,'USER_PRINCIPAL','pg17-rl2',$9,null,'TENANT_SCOPE','RESEARCH_DRAFT_REVISION_CREATE_V1','RESEARCH_MUTATE','PURE_RESEARCH','DRAFT',2,$1,'RESEARCH_DRAFT_HASH_PAYLOAD_V1','{"schemaVersion":"RESEARCH_DRAFT_HASH_PAYLOAD_V1"}'::jsonb,$11,$13,'81000000-0000-4000-8000-0000000002d2','idem-rl2-draft-0002','corr-idem-rl2-draft-0002'),
      ($3,$5,$6,$7,null,$8,'USER_PRINCIPAL','pg17-rl2',$9,null,'TENANT_SCOPE','RESEARCH_HYPOTHESIS_REVISION_CREATE_V1','RESEARCH_MUTATE','PURE_RESEARCH','HYPOTHESIS',1,null,'HYPOTHESIS_HASH_PAYLOAD_V1','{"schemaVersion":"HYPOTHESIS_HASH_PAYLOAD_V1"}'::jsonb,$12,$13,'81000000-0000-4000-8000-0000000002e1','idem-rl2-hyp-0001','corr-idem-rl2-hyp-0001')
  `, [ids.draft1, ids.draft2, ids.hyp1, ids.draftRoot, ids.hypRoot, ids.investigationA, ids.tenant, ids.principal, ids.membership, h("B"), h("C"), h("D"), h("A")]);

  const specCandidate = (revision: number) => JSON.stringify({
    schemaVersion: "RESEARCH_SPEC_CANDIDATE_V1",
    status: "CANDIDATE_ONLY",
    revision,
    sourceDraft: { hashAlgorithm: "SHA-256", hashDomain: "SYNTRAKE:RESEARCH_DRAFT:V1", hashVersion: "SYNTRAKE_SHA256_V1", hashHex: h("C") },
    hypothesisBinding: { kind: "EXPLICIT_HYPOTHESIS", hypothesis: { hashAlgorithm: "SHA-256", hashDomain: "SYNTRAKE:HYPOTHESIS:V1", hashVersion: "SYNTRAKE_SHA256_V1", hashHex: h("D") } },
  });
  await client.query(`
    insert into investing.research_spec_revisions (
      research_spec_revision_id, material_root_id, research_investigation_id, tenant_id, account_id, principal_id, actor_kind, actor_id,
      tenant_membership_id, account_access_id, operation_scope, source_context, operation, capability, revision_number, predecessor_revision_id,
      source_draft_revision_id, source_draft_material_hash, hypothesis_revision_id, hypothesis_material_hash, candidate_schema_version, candidate_status,
      canonical_candidate, material_request_hash, idempotency_record_id, idempotency_key, correlation_id
    ) values
      ($1,$3,$4,$5,null,$6,'USER_PRINCIPAL','pg17-rl2',$7,null,'TENANT_SCOPE','PURE_RESEARCH','RESEARCH_SPEC_REVISION_CREATE_V1','RESEARCH_MUTATE',1,null,$8,$9,$10,$11,'RESEARCH_SPEC_CANDIDATE_V1','CANDIDATE_ONLY',$12::jsonb,$14,'81000000-0000-4000-8000-0000000002f1','idem-rl2-spec-0001','corr-idem-rl2-spec-0001'),
      ($2,$3,$4,$5,null,$6,'USER_PRINCIPAL','pg17-rl2',$7,null,'TENANT_SCOPE','PURE_RESEARCH','RESEARCH_SPEC_REVISION_CREATE_V1','RESEARCH_MUTATE',2,$1,$8,$9,$10,$11,'RESEARCH_SPEC_CANDIDATE_V1','CANDIDATE_ONLY',$13::jsonb,$14,'81000000-0000-4000-8000-0000000002f2','idem-rl2-spec-0002','corr-idem-rl2-spec-0002')
  `, [ids.spec1, ids.spec2, ids.specRoot, ids.investigationA, ids.tenant, ids.principal, ids.membership, ids.draft2, h("C"), ids.hyp1, h("D"), specCandidate(1), specCandidate(2), h("A")]);

  await client.query(`
    insert into investing.research_specs_scientific_identities (
      research_spec_identity_id, tenant_id, account_id, principal_id, tenant_membership_id, operation, capability, operation_scope, source_context,
      research_spec_revision_id, source_draft_hash_hex, hypothesis_hash_hex, hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload
    ) values ($1,$2,null,$3,$4,'RESEARCH_RUN_INPUT_SCIENTIFIC_CREATE_V1','RESEARCH_MUTATE','TENANT_SCOPE','PURE_RESEARCH',$5,$6,$7,'SHA-256','SYNTRAKE:RESEARCH_SPEC:V1','SYNTRAKE_SHA256_V1',$8,$9::jsonb)
  `, [ids.specIdentity, ids.tenant, ids.principal, ids.membership, ids.spec2, h("C"), h("D"), h("E"), JSON.stringify({ schemaVersion: "RESEARCH_SPEC_HASH_PAYLOAD_V1", sourceDraft: { hashAlgorithm: "SHA-256", hashDomain: "SYNTRAKE:RESEARCH_DRAFT:V1", hashVersion: "SYNTRAKE_SHA256_V1", hashHex: h("C") }, hypothesisBinding: { kind: "EXPLICIT_HYPOTHESIS", hypothesis: { hashAlgorithm: "SHA-256", hashDomain: "SYNTRAKE:HYPOTHESIS:V1", hashVersion: "SYNTRAKE_SHA256_V1", hashHex: h("D") } } })]);

  await client.query(`
    insert into investing.research_experiments (
      research_experiment_id, research_investigation_id, tenant_id, account_id, principal_id, actor_kind, actor_id, tenant_membership_id, account_access_id,
      operation_scope, source_context, operation, capability, relation, parent_experiment_id, research_spec_revision_id,
      research_ir_hash_algorithm, research_ir_hash_domain, research_ir_hash_version, research_ir_hash_hex,
      experiment_hash_algorithm, experiment_hash_domain, experiment_hash_version, experiment_hash_hex,
      experiment_parameters_hash_algorithm, experiment_parameters_hash_domain, experiment_parameters_hash_version, experiment_parameters_hash_hex,
      material_request_hash, idempotency_record_id, idempotency_key, correlation_id
    ) values
      ($1,$4,$5,null,$6,'USER_PRINCIPAL','pg17-rl2',$7,null,'TENANT_SCOPE','PURE_RESEARCH','RESEARCH_EXPERIMENT_BASELINE_CREATE_V1','RESEARCH_MUTATE','BASELINE',null,$8,'SHA-256','SYNTRAKE:RESEARCH_IR:V1','SYNTRAKE_SHA256_V1',$11,'SHA-256','SYNTRAKE:EXPERIMENT:V1','SYNTRAKE_SHA256_V1',$12,null,null,null,null,$14,'81000000-0000-4000-8000-0000000002b2','idem-rl2-baseline-0001','corr-idem-rl2-baseline-0001'),
      ($2,$4,$5,null,$6,'USER_PRINCIPAL','pg17-rl2',$7,null,'TENANT_SCOPE','PURE_RESEARCH','RESEARCH_EXPERIMENT_VARIANT_CREATE_V1','RESEARCH_MUTATE','VARIANT',$1,$9,'SHA-256','SYNTRAKE:RESEARCH_IR:V1','SYNTRAKE_SHA256_V1',$11,'SHA-256','SYNTRAKE:EXPERIMENT:V1','SYNTRAKE_SHA256_V1',$13,'SHA-256','SYNTRAKE:EXPERIMENT_PARAMETERS:V1','SYNTRAKE_SHA256_V1',$15,$16,'81000000-0000-4000-8000-0000000002b3','idem-rl2-variant-0001','corr-idem-rl2-variant-0001'),
      ($3,$4,$5,null,$6,'USER_PRINCIPAL','pg17-rl2',$7,null,'TENANT_SCOPE','PURE_RESEARCH','RESEARCH_EXPERIMENT_VARIANT_CREATE_V1','RESEARCH_MUTATE','VARIANT',$2,$10,'SHA-256','SYNTRAKE:RESEARCH_IR:V1','SYNTRAKE_SHA256_V1',$11,'SHA-256','SYNTRAKE:EXPERIMENT:V1','SYNTRAKE_SHA256_V1',$17,'SHA-256','SYNTRAKE:EXPERIMENT_PARAMETERS:V1','SYNTRAKE_SHA256_V1',$18,$19,'81000000-0000-4000-8000-0000000002b4','idem-rl2-variant-0002','corr-idem-rl2-variant-0002')
  `, [ids.baseline, ids.variant1, ids.variant2, ids.investigationA, ids.tenant, ids.principal, ids.membership, ids.spec1, ids.spec2, ids.spec2, h("F"), h("0"), h("1"), h("A"), h("2"), h("B"), h("9"), h("3"), h("D")]);

  await client.query(`
    insert into investing.research_material_pointer_states (
      research_investigation_id, tenant_id, account_id, principal_id, actor_kind, actor_id, tenant_membership_id, account_access_id,
      operation_scope, source_context, active_draft_revision_id, active_hypothesis_revision_id, active_spec_revision_id, active_experiment_id,
      pointer_version, updated_by_operation
    ) values ($1,$2,null,$3,'USER_PRINCIPAL','pg17-rl2',$4,null,'TENANT_SCOPE','PURE_RESEARCH',$5,$6,$7,$8,5,'RESEARCH_EXPERIMENT_VARIANT_CREATE_V1')
  `, [ids.investigationA, ids.tenant, ids.principal, ids.membership, ids.draft2, ids.hyp1, ids.spec2, ids.variant2]);

  const runInputPayload = JSON.stringify({
    schemaVersion: "RUN_INPUT_HASH_PAYLOAD_V1",
    researchSourceContext: "PURE_RESEARCH",
    metricRegistryVersion: "METRIC_REGISTRY_V20260918",
    engineVersion: "ENGINE_V20260918",
    researchSpec: { hashAlgorithm: "SHA-256", hashDomain: "SYNTRAKE:RESEARCH_SPEC:V1", hashVersion: "SYNTRAKE_SHA256_V1", hashHex: h("E") },
    researchIr: { hashAlgorithm: "SHA-256", hashDomain: "SYNTRAKE:RESEARCH_IR:V1", hashVersion: "SYNTRAKE_SHA256_V1", hashHex: h("F") },
    experiment: { hashAlgorithm: "SHA-256", hashDomain: "SYNTRAKE:EXPERIMENT:V1", hashVersion: "SYNTRAKE_SHA256_V1", hashHex: h("9") },
    datasetSnapshot: { hashAlgorithm: "SHA-256", hashDomain: "SYNTRAKE:DATASET_SNAPSHOT:V1", hashVersion: "SYNTRAKE_SHA256_V1", hashHex: h("3") },
    metricRequestSet: { hashAlgorithm: "SHA-256", hashDomain: "SYNTRAKE:METRIC_REQUEST_SET:V1", hashVersion: "SYNTRAKE_SHA256_V1", hashHex: h("4") },
    executionConfig: { hashAlgorithm: "SHA-256", hashDomain: "SYNTRAKE:EXECUTION_CONFIG:V1", hashVersion: "SYNTRAKE_SHA256_V1", hashHex: h("5") },
  });
  await client.query(`
    insert into investing.run_inputs_scientific_identities (
      run_input_identity_id, tenant_id, account_id, principal_id, tenant_membership_id, research_investigation_id, research_experiment_id, research_spec_revision_id,
      operation, capability, operation_scope, source_context, research_spec_hash_hex, research_ir_hash_hex, experiment_hash_hex, dataset_snapshot_hash_hex,
      metric_registry_version, metric_request_set_hash_hex, engine_version, execution_config_hash_hex, hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload
    ) values ($1,$2,null,$3,$4,$5,$6,$7,'RESEARCH_RUN_INPUT_SCIENTIFIC_CREATE_V1','RESEARCH_MUTATE','TENANT_SCOPE','PURE_RESEARCH',$8,$9,$10,$11,'METRIC_REGISTRY_V20260918',$12,'ENGINE_V20260918',$13,'SHA-256','SYNTRAKE:RUN_INPUT:V1','SYNTRAKE_SHA256_V1',$14,$15::jsonb)
  `, [ids.runInput, ids.tenant, ids.principal, ids.membership, ids.investigationA, ids.variant2, ids.spec2, h("E"), h("F"), h("9"), h("3"), h("4"), h("5"), h("6"), runInputPayload]);

  await client.query(`
    insert into investing.research_execution_runs (research_execution_run_id, tenant_id, account_id, principal_id, tenant_membership_id, research_investigation_id, run_input_identity_id, operation, capability, operation_scope, source_context, engine_id, engine_version)
    values ($1,$4,null,$5,$6,$7,$8,'RESEARCH_EXECUTION_RUN_V1','RESEARCH_EXECUTE','TENANT_SCOPE','PURE_RESEARCH','HISTORICAL_EXECUTION_ADAPTER','ENGINE_V20260918'),
      ($2,$4,null,$5,$6,$7,$8,'RESEARCH_EXECUTION_RUN_V1','RESEARCH_EXECUTE','TENANT_SCOPE','PURE_RESEARCH','HISTORICAL_EXECUTION_ADAPTER','ENGINE_V20260918'),
      ($3,$4,null,$5,$6,$7,$8,'RESEARCH_EXECUTION_RUN_V1','RESEARCH_EXECUTE','TENANT_SCOPE','PURE_RESEARCH','HISTORICAL_EXECUTION_ADAPTER','ENGINE_V20260918')
  `, [ids.run1, ids.run2, ids.runFailed, ids.tenant, ids.principal, ids.membership, ids.investigationA, ids.runInput]);

  await client.query(`
    insert into investing.research_result_artifacts (artifact_id, tenant_id, account_id, principal_id, tenant_membership_id, operation, capability, operation_scope, source_context, artifact_kind, artifact_schema_version, format, content_sha256, content_byte_length, record_count, content)
    values
      ($1,$4,null,$5,$6,'RESEARCH_EXECUTION_RUN_V1','RESEARCH_EXECUTE','TENANT_SCOPE','PURE_RESEARCH','EXECUTION_TRACE','EXECUTION_TRACE_V1','CANONICAL_JSONL_UTF8_LF_FINAL_NEWLINE_V1',upper(encode(extensions.digest(convert_to('{}','UTF8'),'sha256'),'hex')),2,1,convert_to('{}','UTF8')),
      ($2,$4,null,$5,$6,'RESEARCH_EXECUTION_RUN_V1','RESEARCH_EXECUTE','TENANT_SCOPE','PURE_RESEARCH','VALUATION_SERIES','VALUATION_SERIES_V1','CANONICAL_JSONL_UTF8_LF_FINAL_NEWLINE_V1',upper(encode(extensions.digest(convert_to('{}','UTF8'),'sha256'),'hex')),2,1,convert_to('{}','UTF8')),
      ($3,$4,null,$5,$6,'RESEARCH_EXECUTION_RUN_V1','RESEARCH_EXECUTE','TENANT_SCOPE','PURE_RESEARCH','METRIC_RESULT_SET','METRIC_RESULT_SET_V1','CANONICAL_JSONL_UTF8_LF_FINAL_NEWLINE_V1',upper(encode(extensions.digest(convert_to('{}','UTF8'),'sha256'),'hex')),2,1,convert_to('{}','UTF8'))
  `, [ids.trace, ids.valuation, ids.metrics, ids.tenant, ids.principal, ids.membership]);

  await client.query(`
    insert into investing.research_results_scientific_identities (
      result_identity_id, tenant_id, account_id, principal_id, tenant_membership_id, run_input_identity_id,
      execution_trace_artifact_id, valuation_series_artifact_id, metric_result_set_artifact_id, benchmark_series_artifact_id,
      operation, capability, operation_scope, source_context, engine_id, engine_version, hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload
    ) values ($1,$2,null,$3,$4,$5,$6,$7,$8,null,'RESEARCH_EXECUTION_RUN_V1','RESEARCH_EXECUTE','TENANT_SCOPE','PURE_RESEARCH','HISTORICAL_EXECUTION_ADAPTER','ENGINE_V20260918','SHA-256','SYNTRAKE:RESULT:V1','SYNTRAKE_SHA256_V1',$9,'{"schemaVersion":"RESULT_HASH_PAYLOAD_V1"}'::jsonb)
  `, [ids.result, ids.tenant, ids.principal, ids.membership, ids.runInput, ids.trace, ids.valuation, ids.metrics, h("7")]);

  await client.query(`
    insert into investing.research_evidence_objects_scientific_identities (
      evidence_identity_id, tenant_id, account_id, principal_id, tenant_membership_id, run_input_identity_id, result_identity_id,
      descriptor_schema_version, descriptor_kind, descriptor_artifact_schema_version, descriptor_format, content, content_sha256, content_byte_length,
      hash_algorithm, hash_domain, hash_version, hash_hex, operation, capability, operation_scope, source_context
    ) values ($1,$2,null,$3,$4,$5,$6,'EVIDENCE_CONTENT_DESCRIPTOR_V1','RESEARCH_EXECUTION_EVIDENCE','RESEARCH_EXECUTION_EVIDENCE_V1','CANONICAL_JSON_UTF8_V1',convert_to('{"schemaVersion":"RESEARCH_EXECUTION_EVIDENCE_V1"}','UTF8'),upper(encode(extensions.digest(convert_to('{"schemaVersion":"RESEARCH_EXECUTION_EVIDENCE_V1"}','UTF8'),'sha256'),'hex')),50,'SHA-256','SYNTRAKE:EVIDENCE_OBJECT:V1','SYNTRAKE_SHA256_V1',$7,'RESEARCH_EXECUTION_RUN_V1','RESEARCH_EXECUTE','TENANT_SCOPE','PURE_RESEARCH')
  `, [ids.evidence, ids.tenant, ids.principal, ids.membership, ids.runInput, ids.result, h("8")]);

  const insertEvents = `
    insert into investing.research_execution_run_events (research_execution_run_event_id, research_execution_run_id, tenant_id, account_id, principal_id, tenant_membership_id, operation, capability, operation_scope, source_context, event_sequence, run_status, result_identity_id, failure_reason_code)
    values
      (gen_random_uuid(),$1,$4,null,$5,$6,'RESEARCH_EXECUTION_RUN_V1','RESEARCH_EXECUTE','TENANT_SCOPE','PURE_RESEARCH',1,'REGISTERED',null,null),
      (gen_random_uuid(),$1,$4,null,$5,$6,'RESEARCH_EXECUTION_RUN_V1','RESEARCH_EXECUTE','TENANT_SCOPE','PURE_RESEARCH',2,'STARTED',null,null),
      (gen_random_uuid(),$1,$4,null,$5,$6,'RESEARCH_EXECUTION_RUN_V1','RESEARCH_EXECUTE','TENANT_SCOPE','PURE_RESEARCH',3,'SUCCEEDED',$7,null),
      (gen_random_uuid(),$2,$4,null,$5,$6,'RESEARCH_EXECUTION_RUN_V1','RESEARCH_EXECUTE','TENANT_SCOPE','PURE_RESEARCH',1,'REGISTERED',null,null),
      (gen_random_uuid(),$2,$4,null,$5,$6,'RESEARCH_EXECUTION_RUN_V1','RESEARCH_EXECUTE','TENANT_SCOPE','PURE_RESEARCH',2,'STARTED',null,null),
      (gen_random_uuid(),$2,$4,null,$5,$6,'RESEARCH_EXECUTION_RUN_V1','RESEARCH_EXECUTE','TENANT_SCOPE','PURE_RESEARCH',3,'SUCCEEDED',$7,null),
      (gen_random_uuid(),$3,$4,null,$5,$6,'RESEARCH_EXECUTION_RUN_V1','RESEARCH_EXECUTE','TENANT_SCOPE','PURE_RESEARCH',1,'REGISTERED',null,null),
      (gen_random_uuid(),$3,$4,null,$5,$6,'RESEARCH_EXECUTION_RUN_V1','RESEARCH_EXECUTE','TENANT_SCOPE','PURE_RESEARCH',2,'STARTED',null,null),
      (gen_random_uuid(),$3,$4,null,$5,$6,'RESEARCH_EXECUTION_RUN_V1','RESEARCH_EXECUTE','TENANT_SCOPE','PURE_RESEARCH',3,'FAILED',null,'UNSUPPORTED_ENGINE')
  `;
  await client.query(insertEvents, [ids.run1, ids.run2, ids.runFailed, ids.tenant, ids.principal, ids.membership, ids.result]);
}

async function countVisiblePassportSurfaces(overrides: Record<string, string>) {
  await client.query("begin");
  try {
    await client.query("set local role investing_app");
    const values = {
      operation: "RESEARCH_PASSPORT_READ_V1",
      capability: "RESEARCH_READ",
      operation_scope: "TENANT_SCOPE",
      source_context: "PURE_RESEARCH",
      tenant_id: ids.tenant,
      principal_id: ids.principal,
      tenant_membership_id: ids.membership,
      research_investigation_id: ids.investigationA,
      account_id: "",
      account_access_id: "",
      ...overrides,
    };
    for (const [key, value] of Object.entries(values)) {
      await client.query("select set_config($1, $2, true)", [`syntrake.investing.${key}`, value]);
    }
    const result = await client.query<{
      spec_identities: number;
      run_inputs: number;
      execution_runs: number;
      execution_events: number;
      artifacts: number;
      results: number;
      evidence: number;
    }>(`
      select
        (select count(*)::int from investing.research_specs_scientific_identities) as spec_identities,
        (select count(*)::int from investing.run_inputs_scientific_identities) as run_inputs,
        (select count(*)::int from investing.research_execution_runs) as execution_runs,
        (select count(*)::int from investing.research_execution_run_events) as execution_events,
        (select count(*)::int from investing.research_result_artifacts) as artifacts,
        (select count(*)::int from investing.research_results_scientific_identities) as results,
        (select count(*)::int from investing.research_evidence_objects_scientific_identities) as evidence
    `);
    return result.rows[0]!;
  } finally {
    await client.query("rollback").catch(() => undefined);
  }
}

async function countVisibleInvestigations(overrides: Record<string, string>) {
  await client.query("begin");
  try {
    await client.query("set local role investing_app");
    const values = {
      operation: "RESEARCH_PASSPORT_READ_V1",
      capability: "RESEARCH_READ",
      operation_scope: "TENANT_SCOPE",
      source_context: "PURE_RESEARCH",
      tenant_id: ids.tenant,
      principal_id: ids.principal,
      tenant_membership_id: ids.membership,
      research_investigation_id: ids.investigationA,
      account_id: "",
      account_access_id: "",
      ...overrides,
    };
    for (const [key, value] of Object.entries(values)) {
      await client.query("select set_config($1, $2, true)", [`syntrake.investing.${key}`, value]);
    }
    const result = await client.query<{ count: number }>("select count(*)::int as count from investing.research_investigations");
    return result.rows[0]!.count;
  } finally {
    await client.query("rollback").catch(() => undefined);
  }
}

maybeDescribe("I5 RL-2 Passport PG17 migration rehearsal", () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString });
    client = await pool.connect();
    await resetDisposableDatabase();
    await applyCanonicalChainThroughRl2();
    await seedCanonicalPassportHistory();
    useRealPgAppTransport();
  }, 120_000);

  afterAll(async () => {
    await client?.release();
    await pool?.end();
  });

  it("proves PostgreSQL 17 and installs RL-2 read authority without Passport persistence", async () => {
    const version = await client.query<{ server_version: string }>("show server_version");
    console.log(`RL-2 PG17 server_version=${version.rows[0]?.server_version}`);
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
        "research_passport_research_specs_scientific_select",
      ]),
    );
  });

  it("reads the seeded tenant-scoped Passport through the real service and proves history, reuse, failure, and transport role", async () => {
    const first = await readResearchPassportServiceV1({
      researchInvestigationId: ids.investigationA,
      correlationId: "corr-rl2-pg17-read-a",
    });
    const second = await readResearchPassportServiceV1({
      researchInvestigationId: ids.investigationA,
      correlationId: "corr-rl2-pg17-read-a",
    });
    expect(first).toEqual(second);
    if (first.ok !== true) {
      const pg = lastPgError as { message?: string; code?: string; detail?: string; table?: string; constraint?: string } | null;
      throw new Error(`tenant passport read failed: ${JSON.stringify({ first, pg })}`);
    }
    expect(first.passport.transportProof).toEqual({ currentUser: "investing_app", currentRole: "investing_app" });
    expect(appRoleProofs.every((proof) => proof.current_user === "investing_app" && proof.current_role === "investing_app")).toBe(true);
    expect(first.passport.materialLineage.materialRevisions.map((row) => row.materialRevisionId)).toEqual([ids.draft1, ids.draft2, ids.hyp1]);
    expect(first.passport.materialLineage.researchSpecRevisions).toHaveLength(2);
    expect(first.passport.materialLineage.researchSpecRevisions[1]?.scientificIdentity).toMatchObject({
      availability: "MATERIALIZED",
      researchSpec: { hashDomain: "SYNTRAKE:RESEARCH_SPEC:V1", hashHex: h("E") },
    });
    expect(first.passport.experiments.map((row) => [row.researchExperimentId, row.relation, row.parentExperimentId])).toEqual([
      [ids.baseline, "BASELINE", null],
      [ids.variant1, "VARIANT", ids.baseline],
      [ids.variant2, "VARIANT", ids.variant1],
    ]);
    expect(first.passport.executionRuns).toHaveLength(3);
    expect(first.passport.executionRuns.slice(0, 2).map((run) => run.resultIdentityId)).toEqual([ids.result, ids.result]);
    expect(first.passport.evidence).toHaveLength(1);
    expect(first.passport.executionRuns[2]?.terminalState).toBe("FAILED");
    expect(first.passport.executionRuns[2]?.failureReasonCode).toBe("UNSUPPORTED_ENGINE");
    expect(first.passport.ledger.map((event) => event.eventKind)).toEqual(expect.arrayContaining(["RUN_FAILED", "RESULT_AVAILABLE", "EVIDENCE_AVAILABLE"]));
    expect(first.passport.validation.availability).toBe("DEFERRED_RL3");
    expect(first.passport.scientificPromotion.availability).toBe("DEFERRED_RL8");
    expect(first.passport.blindTruth.availability).toBe("DEFERRED_RL9");
    expect(JSON.stringify(first.passport.ledger)).not.toContain("SYNTRAKE:RESEARCH_MATERIAL:V1");
  });

  it("reads account-scoped Passport under exact account authority with no execution evidence", async () => {
    const result = await readResearchPassportServiceV1({
      researchInvestigationId: ids.investigationAccount,
      correlationId: "corr-rl2-pg17-account",
    });
    expect(result.ok).toBe(true);
    if (result.ok !== true) throw new Error("account passport read failed");
    expect(result.passport.investigation.accountBinding).toEqual({
      scope: "ACCOUNT_SCOPE",
      accountId: ids.account,
      accountAccessId: ids.accountAccess,
    });
    expect(result.passport.runInputs).toEqual([]);
    expect(result.passport.executionRuns).toEqual([]);
    expect(result.passport.results).toEqual([]);
    expect(result.passport.evidence).toEqual([]);
    expect(result.passport.validation.availability).toBe("DEFERRED_RL3");
  });

  it("keeps same-owner alternate Investigation readable but denies foreign authority without disclosure", async () => {
    const result = await readResearchPassportServiceV1({
      researchInvestigationId: ids.investigationB,
      correlationId: "corr-rl2-pg17-investigation-b",
    });
    expect(result.ok).toBe(true);
    if (result.ok !== true) throw new Error("isolation control read failed");
    expect(result.passport.investigation.researchInvestigationId).toBe(ids.investigationB);
    expect(result.passport.materialLineage.materialRevisions).toEqual([]);

    const foreign = await readResearchPassportServiceV1({
      researchInvestigationId: ids.foreignInvestigation,
      correlationId: "corr-rl2-pg17-foreign-investigation",
    });
    expect(foreign).toMatchObject({ ok: false, code: "FORBIDDEN_OR_NOT_FOUND", externalCode: "FORBIDDEN_OR_NOT_FOUND" });
    await expect(countVisibleInvestigations({ research_investigation_id: ids.foreignInvestigation })).resolves.toBe(0);
  });

  it("proves the real RL-2 tenant-scope RLS matrix across distinct execution and scientific surfaces", async () => {
    await expect(countVisiblePassportSurfaces({})).resolves.toEqual({
      spec_identities: 1,
      run_inputs: 1,
      execution_runs: 3,
      execution_events: 9,
      artifacts: 3,
      results: 1,
      evidence: 1,
    });
    const invalidContexts: Record<string, string>[] = [
      { operation: "RESEARCH_EXECUTION_RUN_V1" },
      { capability: "RESEARCH_EXECUTE" },
      { tenant_id: "20000000-0000-4000-8000-000000000999" },
      { principal_id: "10000000-0000-4000-8000-000000000999" },
      { tenant_membership_id: "30000000-0000-4000-8000-000000000999" },
      { research_investigation_id: ids.investigationB },
      { operation_scope: "ACCOUNT_SCOPE" },
      { source_context: "TEST_PORTFOLIO" },
      { account_id: ids.account },
      { account_access_id: ids.accountAccess },
      { operation_scope: "ACCOUNT_SCOPE", source_context: "USER_PORTFOLIO", account_id: "40000000-0000-4000-8000-000000000999", account_access_id: ids.accountAccess },
      { operation_scope: "ACCOUNT_SCOPE", source_context: "USER_PORTFOLIO", account_id: ids.account, account_access_id: "50000000-0000-4000-8000-000000000999" },
    ];
    for (const context of invalidContexts) {
      await expect(countVisiblePassportSurfaces(context)).resolves.toEqual({
        spec_identities: 0,
        run_inputs: 0,
        execution_runs: 0,
        execution_events: 0,
        artifacts: 0,
        results: 0,
        evidence: 0,
      });
    }
  });

  it("proves the Passport read operation cannot mutate representative history or scientific records", async () => {
    await client.query("begin");
    await client.query("set local role investing_app");
    await client.query("select set_config($1, $2, true)", ["syntrake.investing.operation", "RESEARCH_PASSPORT_READ_V1"]);
    await client.query("select set_config($1, $2, true)", ["syntrake.investing.capability", "RESEARCH_READ"]);
    await client.query("select set_config($1, $2, true)", ["syntrake.investing.operation_scope", "TENANT_SCOPE"]);
    await client.query("select set_config($1, $2, true)", ["syntrake.investing.source_context", "PURE_RESEARCH"]);
    const proof = await client.query<{ current_user: string; current_role: string }>("select current_user, current_role");
    expect(proof.rows[0]).toEqual({ current_user: "investing_app", current_role: "investing_app" });

    await expect(client.query("insert into investing.research_execution_runs (research_execution_run_id) values (gen_random_uuid())")).rejects.toThrow();
    await expect(client.query("update investing.research_results_scientific_identities set engine_version = engine_version")).rejects.toThrow();
    await expect(client.query("delete from investing.research_evidence_objects_scientific_identities")).rejects.toThrow();
    await expect(client.query("update investing.research_experiments set relation = relation")).rejects.toThrow();
    await client.query("rollback");
  });
});
