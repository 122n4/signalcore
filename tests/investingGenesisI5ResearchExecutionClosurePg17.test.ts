import fs from "node:fs";
import path from "node:path";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sha256HexV1 } from "../lib/investing/research";

const repoRoot = path.resolve(__dirname, "..");
const connectionString = process.env.PG17_RECONCILIATION_URL ?? "";
const maybeDescribe = connectionString ? describe : describe.skip;

const repairMigration = "supabase/migrations/20260823000000_reconcile_zero_genesis_journal_residual.sql";
const productionResidualSha256 = "5833faf5ca3ab62250f460c1e35ede4b30e20caa58ba87c7b34a4563eb615248";
const executionClosureMigration = "supabase/migrations/20260919090000_investing_i5_research_execution_closure.sql";
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
  executionClosureMigration,
] as const;

const ids = {
  principal: "10000000-0000-4000-8000-000000000191",
  tenant: "20000000-0000-4000-8000-000000000191",
  membership: "30000000-0000-4000-8000-000000000191",
  investigation: "60000000-0000-4000-8000-000000000191",
  specRevision: "80000000-0000-4000-8000-000000000193",
  experiment: "91000000-0000-4000-8000-000000000071",
  runInputIdentity: "b7000000-0000-4000-8000-000000000191",
  investigationIdempotency: "a1000000-0000-4000-8000-000000000191",
  specIdempotency: "a2000000-0000-4000-8000-000000000191",
  experimentIdempotency: "a3000000-0000-4000-8000-000000000191",
};

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

async function applyCanonicalChain() {
  const fingerprint = await residualFingerprint();
  await client.query(readSql(repairMigration).replaceAll(productionResidualSha256, fingerprint));
  for (const migration of migrations) await client.query(readSql(migration));
}

async function seedRunInputAuthority() {
  await client.query("insert into investing.principals (principal_id, external_provider, external_subject) values ($1, 'CLERK', 'pg17-execution')", [ids.principal]);
  await client.query("insert into investing.tenants (tenant_id) values ($1)", [ids.tenant]);
  await client.query("insert into investing.tenant_memberships (tenant_membership_id, tenant_id, principal_id, role, state) values ($1, $2, $3, 'OWNER', 'ACTIVE')", [ids.membership, ids.tenant, ids.principal]);
  await client.query(`
    insert into investing.idempotency_records (
      idempotency_record_id, idempotency_key, material_request_hash, correlation_id, actor_kind, actor_id,
      operation_scope, operation, principal_id, tenant_id, account_id, status, completed_at
    ) values
      ($1, 'idem-execution-0001', $4, 'corr-execution-0001', 'USER_PRINCIPAL', 'pg17-execution', 'TENANT_SCOPE', 'RESEARCH_INVESTIGATION_CREATE_V1', $7, $8, null, 'SUCCEEDED', now()),
      ($2, 'idem-spec-execution-0001', $5, 'corr-spec-execution-0001', 'USER_PRINCIPAL', 'pg17-execution', 'TENANT_SCOPE', 'RESEARCH_SPEC_REVISION_CREATE_V1', $7, $8, null, 'SUCCEEDED', now()),
      ($3, 'idem-experiment-execution-0001', $6, 'corr-experiment-execution-0001', 'USER_PRINCIPAL', 'pg17-execution', 'TENANT_SCOPE', 'RESEARCH_EXPERIMENT_BASELINE_CREATE_V1', $7, $8, null, 'SUCCEEDED', now())
  `, [ids.investigationIdempotency, ids.specIdempotency, ids.experimentIdempotency, "A".repeat(64), "C".repeat(64), "D".repeat(64), ids.principal, ids.tenant]);
  await client.query(`
    insert into investing.research_investigations (
      research_investigation_id, tenant_id, account_id, principal_id, actor_kind, actor_id, tenant_membership_id, account_access_id,
      operation_scope, operation, capability, source_context, material_request_hash, idempotency_record_id, idempotency_key, correlation_id
    ) values ($1,$2,null,$3,'USER_PRINCIPAL','pg17-execution',$4,null,'TENANT_SCOPE','RESEARCH_INVESTIGATION_CREATE_V1','RESEARCH_MUTATE','PURE_RESEARCH',$5,$6,'idem-execution-0001','corr-execution-0001')
  `, [ids.investigation, ids.tenant, ids.principal, ids.membership, "A".repeat(64), ids.investigationIdempotency]);
  await client.query(`
    insert into investing.research_spec_revisions (
      research_spec_revision_id, material_root_id, research_investigation_id, tenant_id, account_id, principal_id, actor_kind, actor_id,
      tenant_membership_id, account_access_id, operation_scope, source_context, operation, capability, revision_number, predecessor_revision_id,
      source_draft_revision_id, source_draft_material_hash, hypothesis_revision_id, hypothesis_material_hash, candidate_schema_version, candidate_status,
      canonical_candidate, material_request_hash, idempotency_record_id, idempotency_key, correlation_id
    ) values ($1, gen_random_uuid(), $2, $3, null, $4, 'USER_PRINCIPAL', 'pg17-execution', $5, null, 'TENANT_SCOPE', 'PURE_RESEARCH',
      'RESEARCH_SPEC_REVISION_CREATE_V1', 'RESEARCH_MUTATE', 1, null, null, $6, null, null, 'RESEARCH_SPEC_CANDIDATE_V1', 'CANDIDATE_ONLY',
      $7::jsonb, $8, $9, 'idem-spec-execution-0001', 'corr-spec-execution-0001')
  `, [ids.specRevision, ids.investigation, ids.tenant, ids.principal, ids.membership, "B".repeat(64), JSON.stringify({ schemaVersion: "RESEARCH_SPEC_CANDIDATE_V1", status: "CANDIDATE_ONLY" }), "C".repeat(64), ids.specIdempotency]);
  await client.query(`
    insert into investing.research_experiments (
      research_experiment_id, research_investigation_id, tenant_id, account_id, principal_id, actor_kind, actor_id, tenant_membership_id, account_access_id,
      operation_scope, source_context, operation, capability, relation, parent_experiment_id, research_spec_revision_id,
      research_ir_hash_algorithm, research_ir_hash_domain, research_ir_hash_version, research_ir_hash_hex,
      experiment_hash_algorithm, experiment_hash_domain, experiment_hash_version, experiment_hash_hex,
      experiment_parameters_hash_algorithm, experiment_parameters_hash_domain, experiment_parameters_hash_version, experiment_parameters_hash_hex,
      material_request_hash, idempotency_record_id, idempotency_key, correlation_id
    ) values ($1,$2,$3,null,$4,'USER_PRINCIPAL','pg17-execution',$5,null,'TENANT_SCOPE','PURE_RESEARCH',
      'RESEARCH_EXPERIMENT_BASELINE_CREATE_V1','RESEARCH_MUTATE','BASELINE',null,$6,
      'SHA-256','SYNTRAKE:RESEARCH_IR:V1','SYNTRAKE_SHA256_V1',$7,
      'SHA-256','SYNTRAKE:EXPERIMENT:V1','SYNTRAKE_SHA256_V1',$8,
      null,null,null,null,$9,$10,'idem-experiment-execution-0001','corr-experiment-execution-0001')
  `, [ids.experiment, ids.investigation, ids.tenant, ids.principal, ids.membership, ids.specRevision, "1".repeat(64), "2".repeat(64), "D".repeat(64), ids.experimentIdempotency]);
  await client.query(`
    insert into investing.run_inputs_scientific_identities (
      run_input_identity_id, tenant_id, account_id, principal_id, tenant_membership_id, research_investigation_id, research_experiment_id, research_spec_revision_id,
      operation, capability, operation_scope, source_context, research_spec_hash_hex, research_ir_hash_hex, experiment_hash_hex, dataset_snapshot_hash_hex,
      metric_registry_version, metric_request_set_hash_hex, engine_version, execution_config_hash_hex, hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload
    ) values ($1,$2,null,$3,$4,$5,$6,$7,'RESEARCH_RUN_INPUT_SCIENTIFIC_CREATE_V1','RESEARCH_MUTATE','TENANT_SCOPE','PURE_RESEARCH',
      $8,$9,$10,$11,$12,$13,$14,$15,'SHA-256','SYNTRAKE:RUN_INPUT:V1','SYNTRAKE_SHA256_V1',$16,$17::jsonb)
  `, [
    ids.runInputIdentity, ids.tenant, ids.principal, ids.membership, ids.investigation, ids.experiment, ids.specRevision,
    "3".repeat(64), "1".repeat(64), "2".repeat(64), "4".repeat(64), "METRIC_REGISTRY_V20260918", "5".repeat(64), "ENGINE_V20260918", "6".repeat(64), "7".repeat(64),
    JSON.stringify({
      schemaVersion: "RUN_INPUT_HASH_PAYLOAD_V1",
      researchSourceContext: "PURE_RESEARCH",
      metricRegistryVersion: "METRIC_REGISTRY_V20260918",
      engineVersion: "ENGINE_V20260918",
      researchSpec: { hashAlgorithm: "SHA-256", hashDomain: "SYNTRAKE:RESEARCH_SPEC:V1", hashVersion: "SYNTRAKE_SHA256_V1", hashHex: "3".repeat(64) },
      researchIr: { hashAlgorithm: "SHA-256", hashDomain: "SYNTRAKE:RESEARCH_IR:V1", hashVersion: "SYNTRAKE_SHA256_V1", hashHex: "1".repeat(64) },
      experiment: { hashAlgorithm: "SHA-256", hashDomain: "SYNTRAKE:EXPERIMENT:V1", hashVersion: "SYNTRAKE_SHA256_V1", hashHex: "2".repeat(64) },
      datasetSnapshot: { hashAlgorithm: "SHA-256", hashDomain: "SYNTRAKE:DATASET_SNAPSHOT:V1", hashVersion: "SYNTRAKE_SHA256_V1", hashHex: "4".repeat(64) },
      metricRequestSet: { hashAlgorithm: "SHA-256", hashDomain: "SYNTRAKE:METRIC_REQUEST_SET:V1", hashVersion: "SYNTRAKE_SHA256_V1", hashHex: "5".repeat(64) },
      executionConfig: { hashAlgorithm: "SHA-256", hashDomain: "SYNTRAKE:EXECUTION_CONFIG:V1", hashVersion: "SYNTRAKE_SHA256_V1", hashHex: "6".repeat(64) },
    }),
  ]);
}

async function setExecutionContext(overrides: Record<string, string> = {}) {
  await client.query("set local role investing_app");
  const values = {
    operation: "RESEARCH_EXECUTION_RUN_V1",
    capability: "RESEARCH_EXECUTE",
    operation_scope: "TENANT_SCOPE",
    source_context: "PURE_RESEARCH",
    tenant_id: ids.tenant,
    principal_id: ids.principal,
    tenant_membership_id: ids.membership,
    account_id: "",
    account_access_id: "",
    research_ir_hash_hex: "1".repeat(64),
    ...overrides,
  };
  for (const [key, value] of Object.entries(values)) await client.query("select set_config($1, $2, true)", [`syntrake.investing.${key}`, value]);
}

function descriptor(schema: string, bytes: Buffer) {
  return {
    artifactSchemaVersion: schema,
    format: "CANONICAL_JSONL_UTF8_LF_FINAL_NEWLINE_V1",
    contentSha256: sha256HexV1(bytes),
    contentByteLength: String(bytes.length),
    recordCount: "1",
  };
}

describe("I5 Research Execution Closure PG17 static contract", () => {
  it("keeps supplemental SQL evidence for execution closure surfaces", () => {
    const sql = readSql(executionClosureMigration);
    expect(sql).toContain("RESEARCH_EXECUTION_RUN_V1");
    expect(sql).toContain("RESEARCH_EXECUTE");
    expect(sql).toContain("research_execution_run_events_sequence_status_check");
    expect(sql).toContain("extensions.digest(content, 'sha256')");
    expect(sql).toContain("research_execution_read_run_inputs");
  });
});

maybeDescribe("I5 Research Execution Closure real PG17 rehearsal", () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString });
    client = await pool.connect();
  });

  afterAll(async () => {
    client?.release();
    await pool?.end();
  });

  it("installs migration and enforces execution RLS, lifecycle, artifact SHA, Result reuse, and rollback", async () => {
    await resetDisposableDatabase();
    await applyCanonicalChain();
    await seedRunInputAuthority();

    const version = await client.query<{ server_version: string }>("show server_version");
    expect(version.rows[0]!.server_version).toMatch(/^17\./);

    const tables = ["research_ir_scientific_identities", "research_execution_runs", "research_execution_run_events", "research_result_artifacts", "research_results_scientific_identities"];
    const rls = await client.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      "select relrowsecurity, relforcerowsecurity from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace where n.nspname = 'investing' and c.relname = any($1::text[])",
      [tables],
    );
    expect(rls.rows).toHaveLength(tables.length);
    expect(rls.rows.every((row) => row.relrowsecurity && row.relforcerowsecurity)).toBe(true);

    const badGrants = await client.query(
      "select 1 from information_schema.role_table_grants where table_schema = 'investing' and table_name = any($1::text[]) and ((grantee = 'investing_app' and privilege_type not in ('SELECT','INSERT')) or grantee in ('PUBLIC','anon','authenticated','service_role'))",
      [tables],
    );
    expect(badGrants.rowCount).toBe(0);

    const artifactBytes = Buffer.from("{\"x\":\"y\"}\n", "utf8");
    const trace = descriptor("RESEARCH_EXECUTION_TRACE_V1", artifactBytes);
    const valuation = descriptor("RESEARCH_VALUATION_SERIES_V1", artifactBytes);
    const metrics = descriptor("METRIC_RESULT_SET_V1", artifactBytes);
    const artifactIds = ["aaaaaaaa-1000-4000-8000-000000000191", "aaaaaaaa-2000-4000-8000-000000000191", "aaaaaaaa-3000-4000-8000-000000000191"];
    const runA = "aaaaaaaa-0000-4000-8000-000000000191";

    await client.query("begin");
    await setExecutionContext();
    await client.query("insert into investing.research_execution_runs (research_execution_run_id, tenant_id, account_id, principal_id, tenant_membership_id, research_investigation_id, run_input_identity_id, operation, capability, operation_scope, source_context, engine_id, engine_version) values ($1,$2,null,$3,$4,$5,$6,'RESEARCH_EXECUTION_RUN_V1','RESEARCH_EXECUTE','TENANT_SCOPE','PURE_RESEARCH','HISTORICAL_EXECUTION_ADAPTER','ENGINE_V20260918')", [runA, ids.tenant, ids.principal, ids.membership, ids.investigation, ids.runInputIdentity]);
    await client.query("insert into investing.research_execution_run_events (research_execution_run_event_id, research_execution_run_id, tenant_id, account_id, principal_id, tenant_membership_id, operation, capability, operation_scope, source_context, event_sequence, run_status) values (gen_random_uuid(),$1,$2,null,$3,$4,'RESEARCH_EXECUTION_RUN_V1','RESEARCH_EXECUTE','TENANT_SCOPE','PURE_RESEARCH',1,'REGISTERED'), (gen_random_uuid(),$1,$2,null,$3,$4,'RESEARCH_EXECUTION_RUN_V1','RESEARCH_EXECUTE','TENANT_SCOPE','PURE_RESEARCH',2,'STARTED')", [runA, ids.tenant, ids.principal, ids.membership]);
    for (const [index, kind] of ["EXECUTION_TRACE", "VALUATION_SERIES", "METRIC_RESULT_SET"].entries()) {
      const d = [trace, valuation, metrics][index]!;
      await client.query("insert into investing.research_result_artifacts (artifact_id, tenant_id, account_id, principal_id, tenant_membership_id, operation, capability, operation_scope, source_context, artifact_kind, artifact_schema_version, format, content_sha256, content_byte_length, record_count, content) values ($1,$2,null,$3,$4,'RESEARCH_EXECUTION_RUN_V1','RESEARCH_EXECUTE','TENANT_SCOPE','PURE_RESEARCH',$5,$6,$7,$8,$9,$10,$11)", [artifactIds[index], ids.tenant, ids.principal, ids.membership, kind, d.artifactSchemaVersion, d.format, d.contentSha256, d.contentByteLength, d.recordCount, artifactBytes]);
    }
    await client.query("savepoint bad_artifact_probe");
    await expect(client.query("insert into investing.research_result_artifacts (artifact_id, tenant_id, account_id, principal_id, tenant_membership_id, operation, capability, operation_scope, source_context, artifact_kind, artifact_schema_version, format, content_sha256, content_byte_length, record_count, content) values (gen_random_uuid(),$1,null,$2,$3,'RESEARCH_EXECUTION_RUN_V1','RESEARCH_EXECUTE','TENANT_SCOPE','PURE_RESEARCH','EXECUTION_TRACE','RESEARCH_EXECUTION_TRACE_V1','CANONICAL_JSONL_UTF8_LF_FINAL_NEWLINE_V1',$4,999,1,$5)", [ids.tenant, ids.principal, ids.membership, trace.contentSha256, artifactBytes])).rejects.toThrow(/research_result_artifacts_content_check/i);
    await client.query("rollback to savepoint bad_artifact_probe");
    const resultId = "aaaaaaaa-4000-4000-8000-000000000191";
    await client.query("insert into investing.research_results_scientific_identities (result_identity_id, tenant_id, account_id, principal_id, tenant_membership_id, run_input_identity_id, execution_trace_artifact_id, valuation_series_artifact_id, metric_result_set_artifact_id, benchmark_series_artifact_id, operation, capability, operation_scope, source_context, engine_id, engine_version, hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload) values ($1,$2,null,$3,$4,$5,$6,$7,$8,null,'RESEARCH_EXECUTION_RUN_V1','RESEARCH_EXECUTE','TENANT_SCOPE','PURE_RESEARCH','HISTORICAL_EXECUTION_ADAPTER','ENGINE_V20260918','SHA-256','SYNTRAKE:RESULT:V1','SYNTRAKE_SHA256_V1',$9,$10::jsonb)", [resultId, ids.tenant, ids.principal, ids.membership, ids.runInputIdentity, artifactIds[0], artifactIds[1], artifactIds[2], "E".repeat(64), JSON.stringify({ schemaVersion: "RESULT_HASH_PAYLOAD_V1", executionTrace: trace, valuationSeries: valuation, metricResultSet: metrics, benchmark: null })]);
    await client.query("insert into investing.research_execution_run_events (research_execution_run_event_id, research_execution_run_id, tenant_id, account_id, principal_id, tenant_membership_id, operation, capability, operation_scope, source_context, event_sequence, run_status, result_identity_id) values (gen_random_uuid(),$1,$2,null,$3,$4,'RESEARCH_EXECUTION_RUN_V1','RESEARCH_EXECUTE','TENANT_SCOPE','PURE_RESEARCH',3,'SUCCEEDED',$5)", [runA, ids.tenant, ids.principal, ids.membership, resultId]);
    await client.query("commit");

    const runB = "bbbbbbbb-0000-4000-8000-000000000191";
    await client.query("begin");
    await setExecutionContext();
    await client.query("insert into investing.research_execution_runs (research_execution_run_id, tenant_id, account_id, principal_id, tenant_membership_id, research_investigation_id, run_input_identity_id, operation, capability, operation_scope, source_context, engine_id, engine_version) values ($1,$2,null,$3,$4,$5,$6,'RESEARCH_EXECUTION_RUN_V1','RESEARCH_EXECUTE','TENANT_SCOPE','PURE_RESEARCH','HISTORICAL_EXECUTION_ADAPTER','ENGINE_V20260918')", [runB, ids.tenant, ids.principal, ids.membership, ids.investigation, ids.runInputIdentity]);
    await client.query("insert into investing.research_execution_run_events (research_execution_run_event_id, research_execution_run_id, tenant_id, account_id, principal_id, tenant_membership_id, operation, capability, operation_scope, source_context, event_sequence, run_status) values (gen_random_uuid(),$1,$2,null,$3,$4,'RESEARCH_EXECUTION_RUN_V1','RESEARCH_EXECUTE','TENANT_SCOPE','PURE_RESEARCH',1,'REGISTERED'), (gen_random_uuid(),$1,$2,null,$3,$4,'RESEARCH_EXECUTION_RUN_V1','RESEARCH_EXECUTE','TENANT_SCOPE','PURE_RESEARCH',2,'STARTED')", [runB, ids.tenant, ids.principal, ids.membership]);
    await client.query("insert into investing.research_execution_run_events (research_execution_run_event_id, research_execution_run_id, tenant_id, account_id, principal_id, tenant_membership_id, operation, capability, operation_scope, source_context, event_sequence, run_status, result_identity_id) values (gen_random_uuid(),$1,$2,null,$3,$4,'RESEARCH_EXECUTION_RUN_V1','RESEARCH_EXECUTE','TENANT_SCOPE','PURE_RESEARCH',3,'SUCCEEDED',$5)", [runB, ids.tenant, ids.principal, ids.membership, resultId]);
    await client.query("commit");
    expect(runA).not.toBe(runB);
    const reused = await client.query<{ count: string }>("select count(*) from investing.research_results_scientific_identities where hash_hex = $1", ["E".repeat(64)]);
    expect(reused.rows[0]!.count).toBe("1");

    const rollbackArtifact = "cccccccc-1000-4000-8000-000000000191";
    await client.query("begin");
    await setExecutionContext();
    await client.query("insert into investing.research_result_artifacts (artifact_id, tenant_id, account_id, principal_id, tenant_membership_id, operation, capability, operation_scope, source_context, artifact_kind, artifact_schema_version, format, content_sha256, content_byte_length, record_count, content) values ($1,$2,null,$3,$4,'RESEARCH_EXECUTION_RUN_V1','RESEARCH_EXECUTE','TENANT_SCOPE','PURE_RESEARCH','EXECUTION_TRACE','RESEARCH_EXECUTION_TRACE_V1','CANONICAL_JSONL_UTF8_LF_FINAL_NEWLINE_V1',$5,$6,1,$7)", [rollbackArtifact, ids.tenant, ids.principal, ids.membership, trace.contentSha256, artifactBytes.length, artifactBytes]);
    await expect(client.query("insert into investing.research_execution_run_events (research_execution_run_event_id, research_execution_run_id, tenant_id, account_id, principal_id, tenant_membership_id, operation, capability, operation_scope, source_context, event_sequence, run_status) values (gen_random_uuid(),$1,$2,null,$3,$4,'RESEARCH_EXECUTION_RUN_V1','RESEARCH_EXECUTE','TENANT_SCOPE','PURE_RESEARCH',99,'STARTED')", [runB, ids.tenant, ids.principal, ids.membership])).rejects.toThrow(/violates|event_sequence/i);
    await client.query("rollback");
    const absent = await client.query<{ count: string }>("select count(*) from investing.research_result_artifacts where artifact_id = $1", [rollbackArtifact]);
    expect(absent.rows[0]!.count).toBe("0");
  }, 40_000);
});
