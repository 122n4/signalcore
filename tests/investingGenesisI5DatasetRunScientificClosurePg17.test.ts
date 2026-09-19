import fs from "node:fs";
import path from "node:path";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  canonicalDatasetSeriesHashPayloadV1,
  canonicalDatasetSnapshotHashPayloadV1,
  canonicalExecutionConfigHashPayloadV1,
  canonicalMetricRequestSetHashPayloadV1,
  canonicalRunInputHashPayloadV1,
  hashDatasetSeriesV1,
  hashDatasetSnapshotV1,
  hashExecutionConfigV1,
  hashExperimentV1,
  hashMetricRequestSetV1,
  hashRefV1,
  hashResearchIrV1,
  hashResearchSpecV1,
} from "../lib/investing/research";
import { hashRunInputV1 } from "../lib/investing/research/canonical";
import { canonicalResearchSpecHashPayloadV1 } from "../lib/investing/research/semantic";
import {
  datasetSeriesV1,
  datasetSnapshotV1,
  executionConfigV1,
  metricRequestSetV1,
  researchSpecV1,
  runInputV1,
  scientificRunInputCandidateV1,
  secondDatasetSeriesV1,
} from "./support/investingI5DatasetRunScientificFixtures";

const repoRoot = path.resolve(__dirname, "..");
const connectionString = process.env.PG17_RECONCILIATION_URL ?? "";
const maybeDescribe = connectionString ? describe : describe.skip;

const repairMigration = "supabase/migrations/20260823000000_reconcile_zero_genesis_journal_residual.sql";
const productionResidualSha256 = "5833faf5ca3ab62250f460c1e35ede4b30e20caa58ba87c7b34a4563eb615248";
const closureMigration = "supabase/migrations/20260918170000_investing_i5_dataset_run_scientific_closure.sql";
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
  closureMigration,
] as const;

const ids = {
  principal: "10000000-0000-4000-8000-000000000091",
  wrongPrincipal: "10000000-0000-4000-8000-000000000092",
  tenant: "20000000-0000-4000-8000-000000000091",
  wrongTenant: "20000000-0000-4000-8000-000000000092",
  membership: "30000000-0000-4000-8000-000000000091",
  wrongMembership: "30000000-0000-4000-8000-000000000092",
  account: "40000000-0000-4000-8000-000000000091",
  accountAccess: "50000000-0000-4000-8000-000000000091",
  investigation: "60000000-0000-4000-8000-000000000091",
  draftRoot: "70000000-0000-4000-8000-000000000091",
  hypothesisRoot: "70000000-0000-4000-8000-000000000092",
  specRoot: "70000000-0000-4000-8000-000000000093",
  draftRevision: "80000000-0000-4000-8000-000000000091",
  hypothesisRevision: "80000000-0000-4000-8000-000000000092",
  specRevision: "80000000-0000-4000-8000-000000000093",
  experiment: "91000000-0000-4000-8000-000000000071",
};

const hex = {
  material: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  draft: "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
  hypothesis: "CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC",
  specMaterial: "DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD",
  rollback: "EEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE",
  wrongIr: "1111111111111111111111111111111111111111111111111111111111111111",
  wrongDatasetSnapshot: "2222222222222222222222222222222222222222222222222222222222222222",
  wrongMetricRequestSet: "3333333333333333333333333333333333333333333333333333333333333333",
  wrongExecutionConfig: "4444444444444444444444444444444444444444444444444444444444444444",
};

let pool: Pool;
let client: PoolClient;

function readSql(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function json(value: unknown) {
  return JSON.stringify(value);
}

function hashes() {
  const candidate = scientificRunInputCandidateV1();
  return {
    datasetSeries: [hashDatasetSeriesV1(datasetSeriesV1), hashDatasetSeriesV1(secondDatasetSeriesV1)].sort(),
    datasetSnapshot: hashDatasetSnapshotV1(datasetSnapshotV1()),
    metricRequestSet: hashMetricRequestSetV1(metricRequestSetV1),
    executionConfig: hashExecutionConfigV1(executionConfigV1),
    researchSpec: hashResearchSpecV1(researchSpecV1()),
    researchIr: hashResearchIrV1(candidate.researchIr),
    experiment: hashExperimentV1(candidate.experiment),
    runInput: hashRunInputV1(runInputV1()),
  };
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

async function applyPredecessorsOnly() {
  const fingerprint = await residualFingerprint();
  await client.query(readSql(repairMigration).replaceAll(productionResidualSha256, fingerprint));
  for (const migration of migrations.filter((migration) => migration !== closureMigration)) await client.query(readSql(migration));
}

async function seedAuthorityFixture() {
  const h = hashes();
  await client.query("insert into investing.principals (principal_id, external_provider, external_subject) values ($1, 'CLERK', 'pg17-dataset-run')", [ids.principal]);
  await client.query("insert into investing.principals (principal_id, external_provider, external_subject) values ($1, 'CLERK', 'pg17-dataset-run-wrong')", [ids.wrongPrincipal]);
  await client.query("insert into investing.tenants (tenant_id) values ($1)", [ids.tenant]);
  await client.query("insert into investing.tenants (tenant_id) values ($1)", [ids.wrongTenant]);
  await client.query("insert into investing.tenant_memberships (tenant_membership_id, tenant_id, principal_id) values ($1, $2, $3)", [ids.membership, ids.tenant, ids.principal]);
  await client.query("insert into investing.tenant_memberships (tenant_membership_id, tenant_id, principal_id) values ($1, $2, $3)", [ids.wrongMembership, ids.wrongTenant, ids.wrongPrincipal]);
  await client.query("insert into investing.accounts (account_id, tenant_id, initial_tenant_membership_id, initial_principal_id, base_currency) values ($1, $2, $3, $4, 'USD')", [ids.account, ids.tenant, ids.membership, ids.principal]);
  await client.query("insert into investing.account_access (account_access_id, account_id, tenant_id, tenant_membership_id, principal_id) values ($1, $2, $3, $4, $5)", [ids.accountAccess, ids.account, ids.tenant, ids.membership, ids.principal]);
  await client.query(`
    insert into investing.idempotency_records (
      idempotency_record_id, idempotency_key, material_request_hash, correlation_id, actor_kind, actor_id,
      operation_scope, operation, principal_id, tenant_id, account_id, status, completed_at
    ) values
      ('a1000000-0000-4000-8000-000000000091', 'idem-investigation', $1, 'corr-investigation', 'USER_PRINCIPAL', 'pg17-dataset-run', 'TENANT_SCOPE', 'RESEARCH_INVESTIGATION_CREATE_V1', $2, $3, null, 'SUCCEEDED', now()),
      ('a2000000-0000-4000-8000-000000000091', 'idem-draft', $4, 'corr-draft', 'USER_PRINCIPAL', 'pg17-dataset-run', 'TENANT_SCOPE', 'RESEARCH_DRAFT_REVISION_CREATE_V1', $2, $3, null, 'SUCCEEDED', now()),
      ('a3000000-0000-4000-8000-000000000091', 'idem-hypothesis', $5, 'corr-hypothesis', 'USER_PRINCIPAL', 'pg17-dataset-run', 'TENANT_SCOPE', 'RESEARCH_HYPOTHESIS_REVISION_CREATE_V1', $2, $3, null, 'SUCCEEDED', now()),
      ('a4000000-0000-4000-8000-000000000091', 'idem-spec', $6, 'corr-spec', 'USER_PRINCIPAL', 'pg17-dataset-run', 'TENANT_SCOPE', 'RESEARCH_SPEC_REVISION_CREATE_V1', $2, $3, null, 'SUCCEEDED', now()),
      ('a5000000-0000-4000-8000-000000000091', 'idem-experiment', $1, 'corr-experiment', 'USER_PRINCIPAL', 'pg17-dataset-run', 'TENANT_SCOPE', 'RESEARCH_EXPERIMENT_BASELINE_CREATE_V1', $2, $3, null, 'SUCCEEDED', now())
  `, [hex.material, ids.principal, ids.tenant, hex.draft, hex.hypothesis, hex.specMaterial]);
  await client.query(`
    insert into investing.research_investigations (
      research_investigation_id, tenant_id, account_id, principal_id, actor_kind, actor_id,
      tenant_membership_id, account_access_id, operation_scope, operation, capability, source_context,
      material_request_hash, idempotency_record_id, idempotency_key, correlation_id
    ) values ($1, $2, null, $3, 'USER_PRINCIPAL', 'pg17-dataset-run', $4, null, 'TENANT_SCOPE', 'RESEARCH_INVESTIGATION_CREATE_V1', 'RESEARCH_MUTATE', 'PURE_RESEARCH', $5, 'a1000000-0000-4000-8000-000000000091', 'idem-investigation', 'corr-investigation')
  `, [ids.investigation, ids.tenant, ids.principal, ids.membership, hex.material]);
  await client.query(`
    insert into investing.research_material_roots (
      material_root_id, research_investigation_id, tenant_id, account_id, principal_id, actor_kind, actor_id,
      tenant_membership_id, account_access_id, operation_scope, source_context, material_kind, created_by_operation
    ) values
      ($1, $2, $3, null, $4, 'USER_PRINCIPAL', 'pg17-dataset-run', $5, null, 'TENANT_SCOPE', 'PURE_RESEARCH', 'DRAFT', 'RESEARCH_DRAFT_REVISION_CREATE_V1'),
      ($6, $2, $3, null, $4, 'USER_PRINCIPAL', 'pg17-dataset-run', $5, null, 'TENANT_SCOPE', 'PURE_RESEARCH', 'HYPOTHESIS', 'RESEARCH_HYPOTHESIS_REVISION_CREATE_V1'),
      ($7, $2, $3, null, $4, 'USER_PRINCIPAL', 'pg17-dataset-run', $5, null, 'TENANT_SCOPE', 'PURE_RESEARCH', 'RESEARCH_SPEC', 'RESEARCH_SPEC_REVISION_CREATE_V1')
  `, [ids.draftRoot, ids.investigation, ids.tenant, ids.principal, ids.membership, ids.hypothesisRoot, ids.specRoot]);
  await client.query(`
    insert into investing.research_material_revisions (
      material_revision_id, material_root_id, research_investigation_id, tenant_id, account_id, principal_id, actor_kind, actor_id,
      tenant_membership_id, account_access_id, operation_scope, operation, capability, source_context, material_kind, revision_number,
      predecessor_revision_id, payload_schema_version, canonical_payload, material_hash, material_request_hash, idempotency_record_id, idempotency_key, correlation_id
    ) values
      ($1, $2, $3, $4, null, $5, 'USER_PRINCIPAL', 'pg17-dataset-run', $6, null, 'TENANT_SCOPE', 'RESEARCH_DRAFT_REVISION_CREATE_V1', 'RESEARCH_MUTATE', 'PURE_RESEARCH', 'DRAFT', 1, null, 'RESEARCH_DRAFT_HASH_PAYLOAD_V1', '{"schemaVersion":"RESEARCH_DRAFT_HASH_PAYLOAD_V1"}'::jsonb, $7, $7, 'a2000000-0000-4000-8000-000000000091', 'idem-draft', 'corr-draft'),
      ($8, $9, $3, $4, null, $5, 'USER_PRINCIPAL', 'pg17-dataset-run', $6, null, 'TENANT_SCOPE', 'RESEARCH_HYPOTHESIS_REVISION_CREATE_V1', 'RESEARCH_MUTATE', 'PURE_RESEARCH', 'HYPOTHESIS', 1, null, 'HYPOTHESIS_HASH_PAYLOAD_V1', '{"schemaVersion":"HYPOTHESIS_HASH_PAYLOAD_V1"}'::jsonb, $10, $10, 'a3000000-0000-4000-8000-000000000091', 'idem-hypothesis', 'corr-hypothesis')
  `, [ids.draftRevision, ids.draftRoot, ids.investigation, ids.tenant, ids.principal, ids.membership, hex.draft, ids.hypothesisRevision, ids.hypothesisRoot, hex.hypothesis]);
  await client.query(`
    insert into investing.research_spec_revisions (
      research_spec_revision_id, material_root_id, research_investigation_id, tenant_id, account_id, principal_id, actor_kind, actor_id,
      tenant_membership_id, account_access_id, operation_scope, source_context, operation, capability, revision_number, predecessor_revision_id,
      source_draft_revision_id, source_draft_material_hash, hypothesis_revision_id, hypothesis_material_hash, candidate_schema_version, candidate_status,
      canonical_candidate, material_request_hash, idempotency_record_id, idempotency_key, correlation_id
    ) values (
      $1, $2, $3, $4, null, $5, 'USER_PRINCIPAL', 'pg17-dataset-run', $6, null, 'TENANT_SCOPE', 'PURE_RESEARCH',
      'RESEARCH_SPEC_REVISION_CREATE_V1', 'RESEARCH_MUTATE', 1, null, $7, $8, $9, $10, 'RESEARCH_SPEC_CANDIDATE_V1', 'CANDIDATE_ONLY',
      $11::jsonb, $12, 'a4000000-0000-4000-8000-000000000091', 'idem-spec', 'corr-spec'
    )
  `, [
    ids.specRevision, ids.specRoot, ids.investigation, ids.tenant, ids.principal, ids.membership,
    ids.draftRevision, hex.draft, ids.hypothesisRevision, hex.hypothesis, json({ schemaVersion: "RESEARCH_SPEC_CANDIDATE_V1", status: "CANDIDATE_ONLY" }), hex.specMaterial,
  ]);
  await client.query(`
    insert into investing.research_experiments (
      research_experiment_id, research_investigation_id, tenant_id, account_id, principal_id, actor_kind, actor_id,
      tenant_membership_id, account_access_id, operation_scope, source_context, operation, capability, relation,
      parent_experiment_id, research_spec_revision_id, research_ir_hash_algorithm, research_ir_hash_domain, research_ir_hash_version, research_ir_hash_hex,
      experiment_hash_algorithm, experiment_hash_domain, experiment_hash_version, experiment_hash_hex,
      experiment_parameters_hash_algorithm, experiment_parameters_hash_domain, experiment_parameters_hash_version, experiment_parameters_hash_hex,
      material_request_hash, idempotency_record_id, idempotency_key, correlation_id
    ) values (
      $1, $2, $3, null, $4, 'USER_PRINCIPAL', 'pg17-dataset-run', $5, null, 'TENANT_SCOPE', 'PURE_RESEARCH',
      'RESEARCH_EXPERIMENT_BASELINE_CREATE_V1', 'RESEARCH_MUTATE', 'BASELINE', null, $6,
      'SHA-256', 'SYNTRAKE:RESEARCH_IR:V1', 'SYNTRAKE_SHA256_V1', $7,
      'SHA-256', 'SYNTRAKE:EXPERIMENT:V1', 'SYNTRAKE_SHA256_V1', $8,
      null, null, null, null, $9, 'a5000000-0000-4000-8000-000000000091', 'idem-experiment', 'corr-experiment'
    )
  `, [ids.experiment, ids.investigation, ids.tenant, ids.principal, ids.membership, ids.specRevision, h.researchIr, h.experiment, hex.material]);
}

async function setAppContext(overrides: Record<string, string> = {}) {
  const h = hashes();
  await client.query("set local role investing_app");
  const values = {
    operation: "RESEARCH_RUN_INPUT_SCIENTIFIC_CREATE_V1",
    capability: "RESEARCH_MUTATE",
    operation_scope: "TENANT_SCOPE",
    source_context: "PURE_RESEARCH",
    tenant_id: ids.tenant,
    principal_id: ids.principal,
    tenant_membership_id: ids.membership,
    account_id: "",
    account_access_id: "",
    research_ir_hash_hex: h.researchIr,
    experiment_hash_hex: h.experiment,
    dataset_snapshot_hash_hex: h.datasetSnapshot,
    metric_registry_version: metricRequestSetV1.metricRegistryVersion,
    metric_request_set_hash_hex: h.metricRequestSet,
    engine_version: executionConfigV1.engineCompatibilityVersion,
    execution_config_hash_hex: h.executionConfig,
    research_spec_hash_hex: h.researchSpec,
    run_input_hash_hex: h.runInput,
    ...overrides,
  };
  for (const [key, value] of Object.entries(values)) {
    await client.query("select set_config($1, $2, true)", [`syntrake.investing.${key}`, value]);
  }
}

async function expectRollback(work: () => Promise<void>, pattern: RegExp) {
  let error: unknown;
  await client.query("begin");
  try {
    await setAppContext();
    await work();
  } catch (caught) {
    error = caught;
  } finally {
    await client.query("rollback").catch(() => undefined);
  }
  expect(error).toBeInstanceOf(Error);
  expect((error as Error).message).toMatch(pattern);
}

async function insertDatasetSeries(hashHex: string, payload: unknown, id: string) {
  await client.query("select set_config($1, $2, true)", ["syntrake.investing.dataset_series_hash_hex", hashHex]);
  await client.query(`
    insert into investing.dataset_series_scientific_identities (
      dataset_series_identity_id, tenant_id, account_id, principal_id, tenant_membership_id, operation, capability, operation_scope, source_context,
      hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload
    ) values ($1, $2, null, $3, $4, 'RESEARCH_RUN_INPUT_SCIENTIFIC_CREATE_V1', 'RESEARCH_MUTATE', 'TENANT_SCOPE', 'PURE_RESEARCH',
      'SHA-256', 'SYNTRAKE:DATASET_SERIES:V1', 'SYNTRAKE_SHA256_V1', $5, $6::jsonb)
    on conflict do nothing
  `, [id, ids.tenant, ids.principal, ids.membership, hashHex, json(payload)]);
}

async function insertScientificIdentities(idSuffix = "091") {
  const h = hashes();
  await insertDatasetSeries(h.datasetSeries[0]!, canonicalDatasetSeriesHashPayloadV1(secondDatasetSeriesV1), `b1000000-0000-4000-8000-000000000${idSuffix}`);
  await insertDatasetSeries(h.datasetSeries[1]!, canonicalDatasetSeriesHashPayloadV1(datasetSeriesV1), `b2000000-0000-4000-8000-000000000${idSuffix}`);
  await client.query(`
    insert into investing.dataset_snapshots_scientific_identities (
      dataset_snapshot_identity_id, tenant_id, account_id, principal_id, tenant_membership_id, operation, capability, operation_scope, source_context,
      hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload
    ) values ($1, $2, null, $3, $4, 'RESEARCH_RUN_INPUT_SCIENTIFIC_CREATE_V1', 'RESEARCH_MUTATE', 'TENANT_SCOPE', 'PURE_RESEARCH',
      'SHA-256', 'SYNTRAKE:DATASET_SNAPSHOT:V1', 'SYNTRAKE_SHA256_V1', $5, $6::jsonb)
    on conflict do nothing
  `, [`b3000000-0000-4000-8000-000000000${idSuffix}`, ids.tenant, ids.principal, ids.membership, h.datasetSnapshot, json(canonicalDatasetSnapshotHashPayloadV1(datasetSnapshotV1()))]);
  await client.query(`
    insert into investing.metric_request_sets_scientific_identities (
      metric_request_set_identity_id, tenant_id, account_id, principal_id, tenant_membership_id, operation, capability, operation_scope, source_context,
      metric_registry_version, hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload
    ) values ($1, $2, null, $3, $4, 'RESEARCH_RUN_INPUT_SCIENTIFIC_CREATE_V1', 'RESEARCH_MUTATE', 'TENANT_SCOPE', 'PURE_RESEARCH',
      $5, 'SHA-256', 'SYNTRAKE:METRIC_REQUEST_SET:V1', 'SYNTRAKE_SHA256_V1', $6, $7::jsonb)
    on conflict do nothing
  `, [`b4000000-0000-4000-8000-000000000${idSuffix}`, ids.tenant, ids.principal, ids.membership, metricRequestSetV1.metricRegistryVersion, h.metricRequestSet, json(canonicalMetricRequestSetHashPayloadV1(metricRequestSetV1))]);
  await client.query(`
    insert into investing.execution_configs_scientific_identities (
      execution_config_identity_id, tenant_id, account_id, principal_id, tenant_membership_id, operation, capability, operation_scope, source_context,
      engine_compatibility_version, hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload
    ) values ($1, $2, null, $3, $4, 'RESEARCH_RUN_INPUT_SCIENTIFIC_CREATE_V1', 'RESEARCH_MUTATE', 'TENANT_SCOPE', 'PURE_RESEARCH',
      $5, 'SHA-256', 'SYNTRAKE:EXECUTION_CONFIG:V1', 'SYNTRAKE_SHA256_V1', $6, $7::jsonb)
    on conflict do nothing
  `, [`b5000000-0000-4000-8000-000000000${idSuffix}`, ids.tenant, ids.principal, ids.membership, executionConfigV1.engineCompatibilityVersion, h.executionConfig, json(canonicalExecutionConfigHashPayloadV1(executionConfigV1))]);
  await client.query(`
    insert into investing.research_specs_scientific_identities (
      research_spec_identity_id, tenant_id, account_id, principal_id, tenant_membership_id, operation, capability, operation_scope, source_context,
      research_spec_revision_id, source_draft_hash_hex, hypothesis_hash_hex, hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload
    ) values ($1, $2, null, $3, $4, 'RESEARCH_RUN_INPUT_SCIENTIFIC_CREATE_V1', 'RESEARCH_MUTATE', 'TENANT_SCOPE', 'PURE_RESEARCH',
      $5, $6, $7, 'SHA-256', 'SYNTRAKE:RESEARCH_SPEC:V1', 'SYNTRAKE_SHA256_V1', $8, $9::jsonb)
    on conflict do nothing
  `, [`b6000000-0000-4000-8000-000000000${idSuffix}`, ids.tenant, ids.principal, ids.membership, ids.specRevision, hex.draft, hex.hypothesis, h.researchSpec, json(canonicalResearchSpecHashPayloadV1(researchSpecV1()))]);
  await client.query(`
    insert into investing.run_inputs_scientific_identities (
      run_input_identity_id, tenant_id, account_id, principal_id, tenant_membership_id, research_investigation_id, research_experiment_id, research_spec_revision_id,
      operation, capability, operation_scope, source_context, research_spec_hash_hex, research_ir_hash_hex, experiment_hash_hex, dataset_snapshot_hash_hex,
      metric_registry_version, metric_request_set_hash_hex, engine_version, execution_config_hash_hex, hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload
    ) values ($1, $2, null, $3, $4, $5, $6, $7, 'RESEARCH_RUN_INPUT_SCIENTIFIC_CREATE_V1', 'RESEARCH_MUTATE', 'TENANT_SCOPE', 'PURE_RESEARCH',
      $8, $9, $10, $11, $12, $13, $14, $15, 'SHA-256', 'SYNTRAKE:RUN_INPUT:V1', 'SYNTRAKE_SHA256_V1', $16, $17::jsonb)
  `, [
    `b7000000-0000-4000-8000-000000000${idSuffix}`, ids.tenant, ids.principal, ids.membership, ids.investigation, ids.experiment, ids.specRevision,
    h.researchSpec, h.researchIr, h.experiment, h.datasetSnapshot, metricRequestSetV1.metricRegistryVersion, h.metricRequestSet,
    executionConfigV1.engineCompatibilityVersion, h.executionConfig, h.runInput, json(canonicalRunInputHashPayloadV1(runInputV1())),
  ]);
}

type RunInputProbeOverrides = Partial<Record<"researchSpec" | "researchIr" | "experiment" | "datasetSnapshot" | "metricRequestSet" | "executionConfig", string>>;

async function insertRunInputProbe(input: { id: string; hashHex: string; payload: unknown; overrides?: RunInputProbeOverrides }) {
  const h = { ...hashes(), ...input.overrides };
  await client.query("select set_config($1, $2, true)", ["syntrake.investing.run_input_hash_hex", input.hashHex]);
  await client.query(`
    insert into investing.run_inputs_scientific_identities (
      run_input_identity_id, tenant_id, account_id, principal_id, tenant_membership_id, research_investigation_id, research_experiment_id, research_spec_revision_id,
      operation, capability, operation_scope, source_context, research_spec_hash_hex, research_ir_hash_hex, experiment_hash_hex, dataset_snapshot_hash_hex,
      metric_registry_version, metric_request_set_hash_hex, engine_version, execution_config_hash_hex, hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload
    ) values ($1, $2, null, $3, $4, $5, $6, $7, 'RESEARCH_RUN_INPUT_SCIENTIFIC_CREATE_V1', 'RESEARCH_MUTATE', 'TENANT_SCOPE', 'PURE_RESEARCH',
      $8, $9, $10, $11, $12, $13, $14, $15, 'SHA-256', 'SYNTRAKE:RUN_INPUT:V1', 'SYNTRAKE_SHA256_V1', $16, $17::jsonb)
  `, [
    input.id, ids.tenant, ids.principal, ids.membership, ids.investigation, ids.experiment, ids.specRevision,
    h.researchSpec, h.researchIr, h.experiment, h.datasetSnapshot, metricRequestSetV1.metricRegistryVersion, h.metricRequestSet,
    executionConfigV1.engineCompatibilityVersion, h.executionConfig, input.hashHex, json(input.payload),
  ]);
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

  it("applies canonical migrations through Dataset/Run scientific closure with validated tenant-only RLS", async () => {
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
      select grantee, privilege_type
      from information_schema.role_table_grants
      where table_schema = 'investing'
        and table_name = any($1::text[])
        and (grantee <> 'investing_app' or privilege_type not in ('SELECT','INSERT'))
    `, [tables]);
    expect(badGrants.rowCount).toBe(0);
    const checks = await client.query<{ convalidated: boolean }>(`
      select convalidated
      from pg_catalog.pg_constraint con
      join pg_catalog.pg_class c on c.oid = con.conrelid
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'investing'
        and c.relname = any($1::text[])
        and con.contype in ('c','f')
    `, [tables]);
    expect(checks.rows.length).toBeGreaterThan(24);
    expect(checks.rows.every((row) => row.convalidated)).toBe(true);
    const policies = await client.query<{ qual: string | null; with_check: string | null }>(`
      select qual, with_check
      from pg_catalog.pg_policies
      where schemaname = 'investing' and tablename = any($1::text[])
    `, [tables]);
    expect(policies.rows.length).toBe(12);
    for (const policy of policies.rows) {
      const text = `${policy.qual ?? ""} ${policy.with_check ?? ""}`;
      expect(text).toMatch(/tenant_membership_id/);
      expect(text).toMatch(/RESEARCH_RUN_INPUT_SCIENTIFIC_CREATE_V1/);
      expect(text).toMatch(/RESEARCH_MUTATE/);
      expect(text).toMatch(/account_access_id/);
    }
  }, 20_000);

  it("fails closed when predecessor scientific tables already exist", async () => {
    await resetDisposableDatabase();
    await applyPredecessorsOnly();
    await client.query("create table investing.dataset_series_scientific_identities (dataset_series_identity_id uuid primary key)");
    let migrationError: unknown;
    await client.query("begin");
    try {
      await client.query(readSql(closureMigration));
    } catch (error) {
      migrationError = error;
    } finally {
      await client.query("rollback").catch(() => undefined);
    }
    expect(migrationError).toBeInstanceOf(Error);
    expect((migrationError as Error).message).toMatch(/scientific identity tables must not already exist/i);
  }, 20_000);

  it("rejects malformed envelopes and non-tenant scientific contexts without relying on writers", async () => {
    await resetDisposableDatabase();
    await applyCanonicalChain();
    await seedAuthorityFixture();
    await expectRollback(async () => {
      await client.query(`
        insert into investing.dataset_series_scientific_identities (
          dataset_series_identity_id, tenant_id, account_id, principal_id, tenant_membership_id, operation, capability, operation_scope, source_context,
          hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload
        ) values ('c1000000-0000-4000-8000-000000000091', $1, null, $2, $3, 'RESEARCH_RUN_INPUT_SCIENTIFIC_CREATE_V1', 'RESEARCH_MUTATE',
          'TENANT_SCOPE', 'PURE_RESEARCH', 'SHA-256', 'SYNTRAKE:DATASET_SERIES:V1', 'SYNTRAKE_SHA256_V1', $4, '{"schemaVersion":"DATASET_SERIES_HASH_PAYLOAD_V1"}'::jsonb)
      `, [ids.tenant, ids.principal, ids.membership, hashes().datasetSeries[0]!]);
    }, /row-level security|violates/);
    await expectRollback(async () => {
      await client.query("select set_config($1, $2, true)", ["syntrake.investing.dataset_series_hash_hex", hashes().datasetSeries[0]!]);
      await client.query(`
        insert into investing.dataset_series_scientific_identities (
          dataset_series_identity_id, tenant_id, account_id, principal_id, tenant_membership_id, operation, capability, operation_scope, source_context,
          hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload
        ) values ('c2000000-0000-4000-8000-000000000091', $1, null, $2, $3, 'RESEARCH_RUN_INPUT_SCIENTIFIC_CREATE_V1', 'RESEARCH_MUTATE',
          'TENANT_SCOPE', 'PURE_RESEARCH', 'SHA-256', 'SYNTRAKE:DATASET_SNAPSHOT:V1', 'SYNTRAKE_SHA256_V1', $4, '{"schemaVersion":"DATASET_SERIES_HASH_PAYLOAD_V1"}'::jsonb)
      `, [ids.tenant, ids.principal, ids.membership, hashes().datasetSeries[0]!]);
    }, /dataset_series_hash_envelope_check/i);
    await expectRollback(async () => {
      await client.query("select set_config($1, $2, true)", ["syntrake.investing.operation_scope", "ACCOUNT_SCOPE"]);
      await insertDatasetSeries(hashes().datasetSeries[0]!, canonicalDatasetSeriesHashPayloadV1(datasetSeriesV1), "c3000000-0000-4000-8000-000000000091");
    }, /row-level security|dataset_series_scope_shape_check|operation_scope/i);
    await expectRollback(async () => {
      await client.query("select set_config($1, $2, true)", ["syntrake.investing.source_context", "USER_PORTFOLIO"]);
      await insertDatasetSeries(hashes().datasetSeries[0]!, canonicalDatasetSeriesHashPayloadV1(datasetSeriesV1), "c4000000-0000-4000-8000-000000000091");
    }, /row-level security|source_context/i);
    await expectRollback(async () => {
      await client.query("select set_config($1, $2, true)", ["syntrake.investing.account_id", ids.account]);
      await insertDatasetSeries(hashes().datasetSeries[0]!, canonicalDatasetSeriesHashPayloadV1(datasetSeriesV1), "c5000000-0000-4000-8000-000000000091");
    }, /row-level security|account/i);
  }, 20_000);

  it("persists the tenant-only RunInput scientific matrix and preserves rollback/idempotent uniqueness", async () => {
    await resetDisposableDatabase();
    await applyCanonicalChain();
    await seedAuthorityFixture();
    const changedSeriesHash = hashDatasetSeriesV1({
      ...datasetSeriesV1,
      contentSha256: "FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF",
    });
    const changedSnapshotHash = hashDatasetSnapshotV1({
      ...datasetSnapshotV1(),
      series: [
        hashRefV1({ hashAlgorithm: "SHA-256", hashDomain: "SYNTRAKE:DATASET_SERIES:V1", hashVersion: "SYNTRAKE_SHA256_V1", hashHex: changedSeriesHash }),
        hashRefV1({ hashAlgorithm: "SHA-256", hashDomain: "SYNTRAKE:DATASET_SERIES:V1", hashVersion: "SYNTRAKE_SHA256_V1", hashHex: hashes().datasetSeries[1]! }),
      ],
    });
    expect(changedSeriesHash).not.toBe(hashes().datasetSeries[1]);
    expect(changedSnapshotHash).not.toBe(hashes().datasetSnapshot);
    expect(() => hashMetricRequestSetV1({ ...metricRequestSetV1, requests: [...metricRequestSetV1.requests, metricRequestSetV1.requests[0]!] })).toThrow(
      "duplicate MetricRequestSet request",
    );
    expect(() => hashExecutionConfigV1({ ...executionConfigV1, fillPolicy: "DEFAULT" })).toThrow("BEHAVIOR_VERSION_NOT_IMMUTABLE");
    expect(() => hashDatasetSeriesV1({ ...datasetSeriesV1, providerDatasetVersion: "LATEST" })).toThrow("BEHAVIOR_VERSION_NOT_IMMUTABLE");
    await client.query("begin");
    await setAppContext();
    await insertScientificIdentities();
    const visible = await client.query<{ count: string }>("select count(*) from investing.run_inputs_scientific_identities");
    expect(visible.rows[0]?.count).toBe("1");
    const series = await client.query<{ hash_hex: string }>("select hash_hex from investing.dataset_series_scientific_identities order by hash_hex");
    expect(series.rows.map((row) => row.hash_hex)).toEqual(hashes().datasetSeries);
    const persistedRunInput = await client.query<{ hash_hex: string; canonical_payload: unknown }>("select hash_hex, canonical_payload from investing.run_inputs_scientific_identities");
    expect(persistedRunInput.rows).toHaveLength(1);
    expect(hashRunInputV1(persistedRunInput.rows[0]!.canonical_payload as never)).toBe(persistedRunInput.rows[0]!.hash_hex);
    await client.query("commit");

    await expectRollback(() => insertScientificIdentities("092"), /run_inputs_scientific_identity_key/i);
    await expectRollback(async () => {
      await client.query("select set_config($1, $2, true)", ["syntrake.investing.research_ir_hash_hex", hex.wrongIr]);
      await insertRunInputProbe({
        id: "d0100000-0000-4000-8000-000000000091",
        hashHex: hex.wrongIr,
        payload: canonicalRunInputHashPayloadV1(runInputV1()),
        overrides: { researchIr: hex.wrongIr },
      });
    }, /run_inputs_research_ir_payload_binding_check/i);
    await expectRollback(async () => {
      await client.query("select set_config($1, $2, true)", ["syntrake.investing.dataset_snapshot_hash_hex", hex.wrongDatasetSnapshot]);
      await insertRunInputProbe({
        id: "d0200000-0000-4000-8000-000000000091",
        hashHex: hex.wrongDatasetSnapshot,
        payload: canonicalRunInputHashPayloadV1(runInputV1()),
        overrides: { datasetSnapshot: hex.wrongDatasetSnapshot },
      });
    }, /run_inputs_dataset_snapshot_payload_binding_check/i);
    await expectRollback(async () => {
      await client.query("select set_config($1, $2, true)", ["syntrake.investing.metric_request_set_hash_hex", hex.wrongMetricRequestSet]);
      await insertRunInputProbe({
        id: "d0300000-0000-4000-8000-000000000091",
        hashHex: hex.wrongMetricRequestSet,
        payload: canonicalRunInputHashPayloadV1(runInputV1()),
        overrides: { metricRequestSet: hex.wrongMetricRequestSet },
      });
    }, /run_inputs_metric_request_payload_binding_check/i);
    await expectRollback(async () => {
      await client.query("select set_config($1, $2, true)", ["syntrake.investing.execution_config_hash_hex", hex.wrongExecutionConfig]);
      await insertRunInputProbe({
        id: "d0400000-0000-4000-8000-000000000091",
        hashHex: hex.wrongExecutionConfig,
        payload: canonicalRunInputHashPayloadV1(runInputV1()),
        overrides: { executionConfig: hex.wrongExecutionConfig },
      });
    }, /run_inputs_execution_config_payload_binding_check/i);
    await expectRollback(async () => {
      await client.query("select set_config($1, $2, true)", ["syntrake.investing.run_input_hash_hex", hex.rollback]);
      await insertRunInputProbe({
        id: "d1000000-0000-4000-8000-000000000091",
        hashHex: hex.rollback,
        payload: {
          schemaVersion: "RUN_INPUT_HASH_PAYLOAD_V1",
          researchSourceContext: "PURE_RESEARCH",
          metricRegistryVersion: metricRequestSetV1.metricRegistryVersion,
          engineVersion: executionConfigV1.engineCompatibilityVersion,
        },
      });
      throw new Error("rollback probe");
    }, /rollback probe/);
    const afterRollback = await client.query<{ count: string }>("select count(*) from investing.run_inputs_scientific_identities where hash_hex = $1", [hex.rollback]);
    expect(afterRollback.rows[0]?.count).toBe("0");

    await client.query("begin");
    await setAppContext({ tenant_id: ids.wrongTenant, principal_id: ids.wrongPrincipal, tenant_membership_id: ids.wrongMembership });
    const isolated = await client.query<{ count: string }>("select count(*) from investing.run_inputs_scientific_identities");
    expect(isolated.rows[0]?.count).toBe("0");
    await client.query("rollback");
    await expectRollback(async () => {
      await client.query("select set_config($1, $2, true)", ["syntrake.investing.principal_id", ids.wrongPrincipal]);
      await client.query("select set_config($1, $2, true)", ["syntrake.investing.tenant_membership_id", ids.wrongMembership]);
      await insertDatasetSeries(hashes().datasetSeries[0]!, canonicalDatasetSeriesHashPayloadV1(datasetSeriesV1), "d2000000-0000-4000-8000-000000000091");
    }, /row-level security|violates/);
    await expectRollback(async () => {
      await client.query("select set_config($1, $2, true)", ["syntrake.investing.source_context", "TEST_PORTFOLIO"]);
      await insertRunInputProbe({
        id: "d3000000-0000-4000-8000-000000000091",
        hashHex: hashes().runInput,
        payload: canonicalRunInputHashPayloadV1(runInputV1()),
      });
    }, /row-level security|source_context/i);
  }, 20_000);
});
