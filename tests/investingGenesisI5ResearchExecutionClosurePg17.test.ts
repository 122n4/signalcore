import fs from "node:fs";
import path from "node:path";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { resolveVerifiedClerkIdentity } from "../lib/investing/authority/clerk";
import { getInvestingAuthorityDatabase } from "../lib/investing/authority/transport";
import {
  canonicalDatasetSeriesMaterialBytesV1,
  executeHistoricalBacktestV1,
  hashDatasetSeriesV1,
  hashDatasetSnapshotV1,
  hashExecutionConfigV1,
  hashExperimentV1,
  hashMetricRequestSetV1,
  hashRefV1,
  hashResearchIrV1,
  hashResultV1,
  sha256HexV1,
  verifyDatasetSeriesMaterialV1,
  type DatasetSeriesHashPayloadV1,
  type ExecutionConfigHashPayloadV1,
  type MetricRequestSetHashPayloadV1,
  type ResearchIrV1,
  type RunInputHashPayloadV1,
} from "../lib/investing/research";
import { resolveAuthorizedResearchMaterialRevisionCreateContext } from "../lib/investing/authority/context";
import { createScientificRunInputV1 } from "../lib/investing/research/runInputScientificWriter";
import { executeResearchRunCommandV1 } from "../lib/investing/research/researchExecutionService";
import { hashRunInputV1 } from "../lib/investing/research/canonical";
import { scientificRunInputCandidateV1 } from "./support/investingI5DatasetRunScientificFixtures";
import { canonicalResearchSpecCandidatePayloadV1 } from "../lib/investing/research/semantic";

vi.mock("server-only", () => ({}));
vi.mock("../lib/investing/authority/clerk", () => ({ resolveVerifiedClerkIdentity: vi.fn() }));
vi.mock("../lib/investing/authority/transport", () => ({ getInvestingAuthorityDatabase: vi.fn() }));

const repoRoot = path.resolve(__dirname, "..");
const connectionString = process.env.PG17_RECONCILIATION_URL ?? "";
const maybeDescribe = connectionString ? describe : describe.skip;

const repairMigration = "supabase/migrations/20260823000000_reconcile_zero_genesis_journal_residual.sql";
const productionResidualSha256 = "5833faf5ca3ab62250f460c1e35ede4b30e20caa58ba87c7b34a4563eb615248";
const executionClosureMigration = "supabase/migrations/20260919090000_investing_i5_research_execution_closure.sql";
const evidenceClosureMigration = "supabase/migrations/20260920120000_investing_i5_rl1_evidence_object_closure.sql";
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
  evidenceClosureMigration,
] as const;

const ids = {
  principal: "10000000-0000-4000-8000-000000000191",
  tenant: "20000000-0000-4000-8000-000000000191",
  membership: "30000000-0000-4000-8000-000000000191",
  investigation: "60000000-0000-4000-8000-000000000191",
  specRevision: "91000000-0000-4000-8000-000000000071",
  experiment: "91000000-0000-4000-8000-000000000071",
  runInputIdentity: "b7000000-0000-4000-8000-000000000191",
  executableRunInputIdentity: "b7000000-0000-4000-8000-000000000291",
  conflictRunInputIdentity: "b7000000-0000-4000-8000-000000000391",
  draftRoot: "51000000-0000-4000-8000-000000000191",
  hypothesisRoot: "52000000-0000-4000-8000-000000000191",
  specRoot: "53000000-0000-4000-8000-000000000191",
  draftRevision: "54000000-0000-4000-8000-000000000191",
  hypothesisRevision: "55000000-0000-4000-8000-000000000191",
  draftIdempotency: "a4000000-0000-4000-8000-000000000191",
  hypothesisIdempotency: "a5000000-0000-4000-8000-000000000191",
  investigationIdempotency: "a1000000-0000-4000-8000-000000000191",
  specIdempotency: "a2000000-0000-4000-8000-000000000191",
  experimentIdempotency: "a3000000-0000-4000-8000-000000000191",
};

let pool: Pool;
let client: PoolClient;
let lastRealWriterError: string | null = null;
const appRoleProofs: Array<{ current_user: string; current_role: string }> = [];

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
  const candidate = scientificRunInputCandidateV1();
  const researchIrHash = hashResearchIrV1(candidate.researchIr);
  const experimentHash = hashExperimentV1(candidate.experiment);
  const sourceDraftHash = candidate.researchSpec.sourceDraft.ref.hashHex;
  const hypothesisHash = candidate.researchSpec.hypothesisBinding.kind === "EXPLICIT_HYPOTHESIS" ? candidate.researchSpec.hypothesisBinding.hypothesis.ref.hashHex : null;
  await client.query("insert into investing.principals (principal_id, external_provider, external_subject) values ($1, 'CLERK', 'pg17-execution')", [ids.principal]);
  await client.query("insert into investing.tenants (tenant_id) values ($1)", [ids.tenant]);
  await client.query("insert into investing.tenant_memberships (tenant_membership_id, tenant_id, principal_id, role, state) values ($1, $2, $3, 'OWNER', 'ACTIVE')", [ids.membership, ids.tenant, ids.principal]);
  await client.query(`
    insert into investing.idempotency_records (
      idempotency_record_id, idempotency_key, material_request_hash, correlation_id, actor_kind, actor_id,
      operation_scope, operation, principal_id, tenant_id, account_id, status, completed_at
    ) values
      ($1, 'idem-execution-0001', $6, 'corr-execution-0001', 'USER_PRINCIPAL', 'pg17-execution', 'TENANT_SCOPE', 'RESEARCH_INVESTIGATION_CREATE_V1', $11, $12, null, 'SUCCEEDED', now()),
      ($2, 'idem-spec-execution-0001', $7, 'corr-spec-execution-0001', 'USER_PRINCIPAL', 'pg17-execution', 'TENANT_SCOPE', 'RESEARCH_SPEC_REVISION_CREATE_V1', $11, $12, null, 'SUCCEEDED', now()),
      ($3, 'idem-experiment-execution-0001', $8, 'corr-experiment-execution-0001', 'USER_PRINCIPAL', 'pg17-execution', 'TENANT_SCOPE', 'RESEARCH_EXPERIMENT_BASELINE_CREATE_V1', $11, $12, null, 'SUCCEEDED', now()),
      ($4, 'idem-draft-execution-0001', $9, 'corr-draft-execution-0001', 'USER_PRINCIPAL', 'pg17-execution', 'TENANT_SCOPE', 'RESEARCH_DRAFT_REVISION_CREATE_V1', $11, $12, null, 'SUCCEEDED', now()),
      ($5, 'idem-hypothesis-exec-001', $10, 'corr-hypothesis-exec-001', 'USER_PRINCIPAL', 'pg17-execution', 'TENANT_SCOPE', 'RESEARCH_HYPOTHESIS_REVISION_CREATE_V1', $11, $12, null, 'SUCCEEDED', now())
  `, [
    ids.investigationIdempotency, ids.specIdempotency, ids.experimentIdempotency, ids.draftIdempotency, ids.hypothesisIdempotency,
    "A".repeat(64), "C".repeat(64), "D".repeat(64), sourceDraftHash, hypothesisHash ?? "E".repeat(64), ids.principal, ids.tenant,
  ]);
  await client.query(`
    insert into investing.research_investigations (
      research_investigation_id, tenant_id, account_id, principal_id, actor_kind, actor_id, tenant_membership_id, account_access_id,
      operation_scope, operation, capability, source_context, material_request_hash, idempotency_record_id, idempotency_key, correlation_id
    ) values ($1,$2,null,$3,'USER_PRINCIPAL','pg17-execution',$4,null,'TENANT_SCOPE','RESEARCH_INVESTIGATION_CREATE_V1','RESEARCH_MUTATE','PURE_RESEARCH',$5,$6,'idem-execution-0001','corr-execution-0001')
  `, [ids.investigation, ids.tenant, ids.principal, ids.membership, "A".repeat(64), ids.investigationIdempotency]);
  await client.query(`
    insert into investing.research_material_roots (
      material_root_id, research_investigation_id, tenant_id, account_id, principal_id, actor_kind, actor_id,
      tenant_membership_id, account_access_id, operation_scope, source_context, material_kind, created_by_operation
    ) values
      ($1, $4, $5, null, $6, 'USER_PRINCIPAL', 'pg17-execution', $7, null, 'TENANT_SCOPE', 'PURE_RESEARCH', 'DRAFT', 'RESEARCH_DRAFT_REVISION_CREATE_V1'),
      ($2, $4, $5, null, $6, 'USER_PRINCIPAL', 'pg17-execution', $7, null, 'TENANT_SCOPE', 'PURE_RESEARCH', 'HYPOTHESIS', 'RESEARCH_HYPOTHESIS_REVISION_CREATE_V1'),
      ($3, $4, $5, null, $6, 'USER_PRINCIPAL', 'pg17-execution', $7, null, 'TENANT_SCOPE', 'PURE_RESEARCH', 'RESEARCH_SPEC', 'RESEARCH_SPEC_REVISION_CREATE_V1')
  `, [ids.draftRoot, ids.hypothesisRoot, ids.specRoot, ids.investigation, ids.tenant, ids.principal, ids.membership]);
  await client.query(`
    insert into investing.research_material_revisions (
      material_revision_id, material_root_id, research_investigation_id, tenant_id, account_id, principal_id, actor_kind, actor_id,
      tenant_membership_id, account_access_id, operation_scope, operation, capability, source_context, material_kind, revision_number,
      predecessor_revision_id, payload_schema_version, canonical_payload, material_hash, material_request_hash, idempotency_record_id, idempotency_key, correlation_id
    ) values
      ($1, $2, $5, $6, null, $7, 'USER_PRINCIPAL', 'pg17-execution', $8, null, 'TENANT_SCOPE', 'RESEARCH_DRAFT_REVISION_CREATE_V1', 'RESEARCH_MUTATE', 'PURE_RESEARCH', 'DRAFT', 1, null, 'RESEARCH_DRAFT_HASH_PAYLOAD_V1', '{"schemaVersion":"RESEARCH_DRAFT_HASH_PAYLOAD_V1"}'::jsonb, $9, $9, $11, 'idem-draft-execution-0001', 'corr-draft-execution-0001'),
      ($3, $4, $5, $6, null, $7, 'USER_PRINCIPAL', 'pg17-execution', $8, null, 'TENANT_SCOPE', 'RESEARCH_HYPOTHESIS_REVISION_CREATE_V1', 'RESEARCH_MUTATE', 'PURE_RESEARCH', 'HYPOTHESIS', 1, null, 'HYPOTHESIS_HASH_PAYLOAD_V1', '{"schemaVersion":"HYPOTHESIS_HASH_PAYLOAD_V1"}'::jsonb, $10, $10, $12, 'idem-hypothesis-exec-001', 'corr-hypothesis-exec-001')
  `, [
    ids.draftRevision, ids.draftRoot, ids.hypothesisRevision, ids.hypothesisRoot, ids.investigation, ids.tenant, ids.principal, ids.membership,
    sourceDraftHash, hypothesisHash ?? "E".repeat(64), ids.draftIdempotency, ids.hypothesisIdempotency,
  ]);
  await client.query(`
    insert into investing.research_spec_revisions (
      research_spec_revision_id, material_root_id, research_investigation_id, tenant_id, account_id, principal_id, actor_kind, actor_id,
      tenant_membership_id, account_access_id, operation_scope, source_context, operation, capability, revision_number, predecessor_revision_id,
      source_draft_revision_id, source_draft_material_hash, hypothesis_revision_id, hypothesis_material_hash, candidate_schema_version, candidate_status,
      canonical_candidate, material_request_hash, idempotency_record_id, idempotency_key, correlation_id
    ) values ($1, $2, $3, $4, null, $5, 'USER_PRINCIPAL', 'pg17-execution', $6, null, 'TENANT_SCOPE', 'PURE_RESEARCH',
      'RESEARCH_SPEC_REVISION_CREATE_V1', 'RESEARCH_MUTATE', 1, null, $7, $8, $9, $10, 'RESEARCH_SPEC_CANDIDATE_V1', 'CANDIDATE_ONLY',
      $11::jsonb, $12, $13, 'idem-spec-execution-0001', 'corr-spec-execution-0001')
  `, [
    ids.specRevision, ids.specRoot, ids.investigation, ids.tenant, ids.principal, ids.membership,
    ids.draftRevision, sourceDraftHash, ids.hypothesisRevision, hypothesisHash,
    JSON.stringify(canonicalResearchSpecCandidatePayloadV1(candidate.researchSpec)), "C".repeat(64), ids.specIdempotency,
  ]);
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
  `, [ids.experiment, ids.investigation, ids.tenant, ids.principal, ids.membership, ids.specRevision, researchIrHash, experimentHash, "D".repeat(64), ids.experimentIdempotency]);
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

function useRealPgAuthorityTransport() {
  lastRealWriterError = null;
  appRoleProofs.length = 0;
  vi.mocked(resolveVerifiedClerkIdentity).mockResolvedValue({ ok: true, externalProvider: "CLERK", externalSubject: "pg17-execution" });
  vi.mocked(getInvestingAuthorityDatabase).mockReturnValue({
    connect: async () => {
      const pgClient = await pool.connect();
      return {
        query: async <Row = Record<string, unknown>>(text: string, values: readonly unknown[] = []) => {
          try {
            const result = await pgClient.query<Row>(text, values as unknown[]);
            if (values.length === 0 && text.trim().toLowerCase() === "begin") {
              await pgClient.query("set local role investing_app");
              const proof = await pgClient.query<{ current_user: string; current_role: string }>("select current_user, current_role");
              appRoleProofs.push(proof.rows[0]!);
            }
            return { rows: result.rows, rowCount: result.rowCount };
          } catch (error) {
            const pgError = error as { message?: string; code?: string; constraint?: string; detail?: string };
            lastRealWriterError = JSON.stringify({
              code: pgError.code,
              constraint: pgError.constraint,
              detail: pgError.detail,
              message: pgError.message,
              text,
              values,
            });
            console.error("PG17 real writer query failed", {
              code: pgError.code,
              constraint: pgError.constraint,
              detail: pgError.detail,
              message: pgError.message,
              text,
              values,
            });
            throw error;
          }
        },
        release: (destroy?: boolean) => pgClient.release(destroy),
      };
    },
  });
}

function expectAppTransportUsedInvestingApp(startIndex: number) {
  const proofs = appRoleProofs.slice(startIndex);
  expect(proofs.length).toBeGreaterThan(0);
  expect(proofs.every((proof) => proof.current_user === "investing_app" && proof.current_role === "investing_app")).toBe(true);
}

const ref = (hashDomain: Parameters<typeof hashRefV1>[0]["hashDomain"], hashHex: string) =>
  hashRefV1({ hashAlgorithm: "SHA-256", hashDomain, hashVersion: "SYNTRAKE_SHA256_V1", hashHex });

const executableExecutionConfig: ExecutionConfigHashPayloadV1 = {
  schemaVersion: "EXECUTION_CONFIG_HASH_PAYLOAD_V1",
  engineCompatibilityVersion: "ENGINE_V20260918",
  missingDataPolicy: "MISSING_DATA_EXCLUDE_V1",
  fxPolicy: "FX_USD_IDENTITY_V1",
  costsPolicy: "COSTS_ZERO_RESEARCH_V1",
  slippagePolicy: "SLIPPAGE_ZERO_RESEARCH_V1",
  fillPolicy: "CLOSE_TO_CLOSE_V1",
  corporateActionPolicy: "ADJUSTED_PRICE_PROVIDER_V1",
  calendarSessionPolicy: "XNYS_CLOSE_SESSION_V1",
  valuationPolicy: "USD_CLOSE_MARK_V1",
};

const executableMetricRequestSet: MetricRequestSetHashPayloadV1 = {
  schemaVersion: "METRIC_REQUEST_SET_HASH_PAYLOAD_V1",
  metricRegistryVersion: "METRIC_REGISTRY_V20260918",
  requests: [
    { metricId: "TOTAL_RETURN", metricVersion: "METRIC_V1" },
    { metricId: "MAX_DRAWDOWN", metricVersion: "METRIC_V1" },
  ],
};

function executableMaterial(instrumentId: string, values: readonly [string, string][]) {
  const bytes = canonicalDatasetSeriesMaterialBytesV1(values.map(([date, value]) => ({ date, value })));
  const series: DatasetSeriesHashPayloadV1 = {
    schemaVersion: "DATASET_SERIES_HASH_PAYLOAD_V1",
    providerDatasetId: "PG17_EXECUTION_FIXTURE",
    providerDatasetVersion: "V20260920",
    instrumentId,
    fieldId: "ADJUSTED_CLOSE",
    fieldVersion: "PRICE_FIELD_V1",
    frequency: "DAILY",
    timezone: "America/New_York",
    calendar: "XNYS_TRADING_CALENDAR_V1",
    currency: "USD",
    coverageStart: values[0]![0],
    coverageEnd: values.at(-1)![0],
    observationCount: String(values.length),
    contentSha256: sha256HexV1(bytes),
  };
  return { series, bytes, verified: verifyDatasetSeriesMaterialV1(series, bytes) };
}

function executableFixture(changed = false) {
  const aaa = executableMaterial("US:AAA", [["2025-01-06", "100"], ["2025-01-07", changed ? "103" : "102"], ["2025-01-08", "104"], ["2025-01-10", "106"]]);
  const bbb = executableMaterial("US:BBB", [["2025-01-06", "100"], ["2025-01-07", "100"], ["2025-01-08", "100"], ["2025-01-10", "100"]]);
  const researchIr: ResearchIrV1 = {
    schemaVersion: "RESEARCH_IR_HASH_PAYLOAD_V1",
    irVersion: "RESEARCH_IR_V1",
    universe: { type: "EXPLICIT_INSTRUMENTS", instrumentIds: ["US:BBB", "US:AAA"] },
    pipeline: [
      { type: "FILTER", predicate: { type: "COMPARE", left: { type: "DATA_FIELD_REF", fieldId: "ADJUSTED_CLOSE", fieldVersion: "I5A_RESEARCH_IR_FIELD_CONTRACT_V1" }, operator: "GT", right: { type: "DECIMAL", value: "0", unit: "VALUATION_CURRENCY_PER_INSTRUMENT" } } },
      { type: "WEIGHT", method: "EQUAL" },
      { type: "REBALANCE", schedule: "DAILY" },
    ],
    benchmark: { type: "BENCHMARK", benchmark: "INSTRUMENT", instrumentId: "US:BBB" },
    testPeriod: { startDate: "2025-01-06", endDate: "2025-01-10" },
    valuationCurrency: "USD",
    startingCapital: { amount: "1000", currency: "USD", origin: "SIMULATED" },
  };
  const datasetSnapshot = {
    schemaVersion: "DATASET_SNAPSHOT_HASH_PAYLOAD_V1" as const,
    snapshotPolicy: "DATASET_SNAPSHOT_POLICY_V1" as const,
    series: [ref("SYNTRAKE:DATASET_SERIES:V1", hashDatasetSeriesV1(aaa.series)), ref("SYNTRAKE:DATASET_SERIES:V1", hashDatasetSeriesV1(bbb.series))],
  };
  const runInput: RunInputHashPayloadV1 = {
    schemaVersion: "RUN_INPUT_HASH_PAYLOAD_V1",
    runType: "HISTORICAL_BACKTEST",
    researchEnvironment: "HISTORICAL_BACKTEST",
    researchSourceContext: "PURE_RESEARCH",
    researchSpec: ref("SYNTRAKE:RESEARCH_SPEC:V1", "A".repeat(64)),
    researchIr: ref("SYNTRAKE:RESEARCH_IR:V1", hashResearchIrV1(researchIr)),
    experiment: ref("SYNTRAKE:EXPERIMENT:V1", "B".repeat(64)),
    datasetSnapshot: ref("SYNTRAKE:DATASET_SNAPSHOT:V1", hashDatasetSnapshotV1(datasetSnapshot)),
    engineId: "HISTORICAL_EXECUTION_ADAPTER",
    engineVersion: "ENGINE_V20260918",
    metricRegistryVersion: "METRIC_REGISTRY_V20260918",
    metricRequestSet: ref("SYNTRAKE:METRIC_REQUEST_SET:V1", hashMetricRequestSetV1(executableMetricRequestSet)),
    executionConfig: ref("SYNTRAKE:EXECUTION_CONFIG:V1", hashExecutionConfigV1(executableExecutionConfig)),
    materialPolicies: [],
  };
  return { aaa, bbb, researchIr, datasetSnapshot, runInput, runInputHash: hashRunInputV1(runInput), datasetSeries: [aaa.series, bbb.series], materials: [aaa.verified, bbb.verified] };
}

async function seedExecutableRunInput(runInputIdentityId = ids.executableRunInputIdentity, changed = false) {
  const f = executableFixture(changed);
  for (const series of f.datasetSeries) {
    await client.query("insert into investing.dataset_series_scientific_identities (dataset_series_identity_id, tenant_id, account_id, principal_id, tenant_membership_id, operation, capability, operation_scope, source_context, hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload) values (gen_random_uuid(),$1,null,$2,$3,'RESEARCH_RUN_INPUT_SCIENTIFIC_CREATE_V1','RESEARCH_MUTATE','TENANT_SCOPE','PURE_RESEARCH','SHA-256','SYNTRAKE:DATASET_SERIES:V1','SYNTRAKE_SHA256_V1',$4,$5::jsonb) on conflict do nothing", [ids.tenant, ids.principal, ids.membership, hashDatasetSeriesV1(series), JSON.stringify(series)]);
  }
  await client.query("insert into investing.dataset_snapshots_scientific_identities (dataset_snapshot_identity_id, tenant_id, account_id, principal_id, tenant_membership_id, operation, capability, operation_scope, source_context, hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload) values (gen_random_uuid(),$1,null,$2,$3,'RESEARCH_RUN_INPUT_SCIENTIFIC_CREATE_V1','RESEARCH_MUTATE','TENANT_SCOPE','PURE_RESEARCH','SHA-256','SYNTRAKE:DATASET_SNAPSHOT:V1','SYNTRAKE_SHA256_V1',$4,$5::jsonb) on conflict do nothing", [ids.tenant, ids.principal, ids.membership, f.runInput.datasetSnapshot.hashHex, JSON.stringify(f.datasetSnapshot)]);
  await client.query("insert into investing.metric_request_sets_scientific_identities (metric_request_set_identity_id, tenant_id, account_id, principal_id, tenant_membership_id, operation, capability, operation_scope, source_context, hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload, metric_registry_version) values (gen_random_uuid(),$1,null,$2,$3,'RESEARCH_RUN_INPUT_SCIENTIFIC_CREATE_V1','RESEARCH_MUTATE','TENANT_SCOPE','PURE_RESEARCH','SHA-256','SYNTRAKE:METRIC_REQUEST_SET:V1','SYNTRAKE_SHA256_V1',$4,$5::jsonb,$6) on conflict do nothing", [ids.tenant, ids.principal, ids.membership, f.runInput.metricRequestSet.hashHex, JSON.stringify(executableMetricRequestSet), executableMetricRequestSet.metricRegistryVersion]);
  await client.query("insert into investing.execution_configs_scientific_identities (execution_config_identity_id, tenant_id, account_id, principal_id, tenant_membership_id, operation, capability, operation_scope, source_context, hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload, engine_compatibility_version) values (gen_random_uuid(),$1,null,$2,$3,'RESEARCH_RUN_INPUT_SCIENTIFIC_CREATE_V1','RESEARCH_MUTATE','TENANT_SCOPE','PURE_RESEARCH','SHA-256','SYNTRAKE:EXECUTION_CONFIG:V1','SYNTRAKE_SHA256_V1',$4,$5::jsonb,$6) on conflict do nothing", [ids.tenant, ids.principal, ids.membership, f.runInput.executionConfig.hashHex, JSON.stringify(executableExecutionConfig), executableExecutionConfig.engineCompatibilityVersion]);
  await client.query("insert into investing.research_ir_scientific_identities (research_ir_identity_id, tenant_id, account_id, principal_id, tenant_membership_id, operation, capability, operation_scope, source_context, hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload) values (gen_random_uuid(),$1,null,$2,$3,'RESEARCH_RUN_INPUT_SCIENTIFIC_CREATE_V1','RESEARCH_MUTATE','TENANT_SCOPE','PURE_RESEARCH','SHA-256','SYNTRAKE:RESEARCH_IR:V1','SYNTRAKE_SHA256_V1',$4,$5::jsonb) on conflict do nothing", [ids.tenant, ids.principal, ids.membership, f.runInput.researchIr.hashHex, JSON.stringify(f.researchIr)]);
  await client.query("insert into investing.run_inputs_scientific_identities (run_input_identity_id, tenant_id, account_id, principal_id, tenant_membership_id, research_investigation_id, research_experiment_id, research_spec_revision_id, operation, capability, operation_scope, source_context, research_spec_hash_hex, research_ir_hash_hex, experiment_hash_hex, dataset_snapshot_hash_hex, metric_registry_version, metric_request_set_hash_hex, engine_version, execution_config_hash_hex, hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload) values ($1,$2,null,$3,$4,$5,$6,$7,'RESEARCH_RUN_INPUT_SCIENTIFIC_CREATE_V1','RESEARCH_MUTATE','TENANT_SCOPE','PURE_RESEARCH',$8,$9,$10,$11,$12,$13,$14,$15,'SHA-256','SYNTRAKE:RUN_INPUT:V1','SYNTRAKE_SHA256_V1',$16,$17::jsonb)", [runInputIdentityId, ids.tenant, ids.principal, ids.membership, ids.investigation, ids.experiment, ids.specRevision, f.runInput.researchSpec.hashHex, f.runInput.researchIr.hashHex, f.runInput.experiment.hashHex, f.runInput.datasetSnapshot.hashHex, f.runInput.metricRegistryVersion, f.runInput.metricRequestSet.hashHex, f.runInput.engineVersion, f.runInput.executionConfig.hashHex, f.runInputHash, JSON.stringify(f.runInput)]);
  return f;
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

async function expectTransactionRejects(work: () => Promise<void>, pattern: RegExp) {
  await client.query("begin");
  try {
    await work();
  } catch (error) {
    await client.query("rollback");
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(pattern);
    return;
  }
  await client.query("rollback");
  throw new Error("expected transaction to reject");
}

async function insertExecutionRun(runId: string) {
  await client.query("insert into investing.research_execution_runs (research_execution_run_id, tenant_id, account_id, principal_id, tenant_membership_id, research_investigation_id, run_input_identity_id, operation, capability, operation_scope, source_context, engine_id, engine_version) values ($1,$2,null,$3,$4,$5,$6,'RESEARCH_EXECUTION_RUN_V1','RESEARCH_EXECUTE','TENANT_SCOPE','PURE_RESEARCH','HISTORICAL_EXECUTION_ADAPTER','ENGINE_V20260918')", [runId, ids.tenant, ids.principal, ids.membership, ids.investigation, ids.runInputIdentity]);
}

async function insertExecutionEvent(runId: string, sequence: number, status: string, resultId: string | null = null, failureCode: string | null = null) {
  await client.query("insert into investing.research_execution_run_events (research_execution_run_event_id, research_execution_run_id, tenant_id, account_id, principal_id, tenant_membership_id, operation, capability, operation_scope, source_context, event_sequence, run_status, result_identity_id, failure_reason_code) values (gen_random_uuid(),$1,$2,null,$3,$4,'RESEARCH_EXECUTION_RUN_V1','RESEARCH_EXECUTE','TENANT_SCOPE','PURE_RESEARCH',$5,$6,$7,$8)", [runId, ids.tenant, ids.principal, ids.membership, sequence, status, resultId, failureCode]);
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
    useRealPgAuthorityTransport();

    const version = await client.query<{ server_version: string }>("show server_version");
    expect(version.rows[0]!.server_version).toMatch(/^17\./);

    const tables = ["research_ir_scientific_identities", "research_execution_runs", "research_execution_run_events", "research_result_artifacts", "research_results_scientific_identities", "research_evidence_objects_scientific_identities"];
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

    const creationRoleProofStart = appRoleProofs.length;
    const creationCandidate = scientificRunInputCandidateV1();
    const creationAuthority = await resolveAuthorizedResearchMaterialRevisionCreateContext({
      researchInvestigationId: ids.investigation,
      operation: "RESEARCH_RUN_INPUT_SCIENTIFIC_CREATE_V1",
      correlationId: "corr-pg17-runinput-create",
    });
    expect(creationAuthority.ok).toBe(true);
    if (!creationAuthority.ok) throw new Error("creation authority failed");
    const createdRunInput = await createScientificRunInputV1({
      authorizedContext: creationAuthority.context as never,
      researchExperimentId: ids.experiment,
      candidate: creationCandidate,
    });
    if (!createdRunInput.ok) throw new Error(`RunInput create failed: ${(createdRunInput as { code: string }).code}; ${lastRealWriterError ?? "no writer SQL error captured"}`);
    expectAppTransportUsedInvestingApp(creationRoleProofStart);
    const creationResearchIrHash = creationCandidate.runInput.researchIr.hashHex;
    await client.query("begin");
    await setExecutionContext({
      operation: "RESEARCH_RUN_INPUT_SCIENTIFIC_CREATE_V1",
      capability: "RESEARCH_MUTATE",
      research_ir_hash_hex: creationResearchIrHash,
    });
    const creationRead = await client.query<{ hash_hex: string }>("select hash_hex from investing.research_ir_scientific_identities where hash_hex = $1", [creationResearchIrHash]);
    expect(creationRead.rows).toHaveLength(1);
    const creationComponentCounts = [
      await client.query<{ count: string }>("select count(*) from investing.dataset_series_scientific_identities where hash_hex = any($1::text[])", [creationCandidate.datasetSeries.map((series) => hashDatasetSeriesV1(series))]),
      await client.query<{ count: string }>("select count(*) from investing.dataset_snapshots_scientific_identities where hash_hex = $1", [creationCandidate.runInput.datasetSnapshot.hashHex]),
      await client.query<{ count: string }>("select count(*) from investing.metric_request_sets_scientific_identities where hash_hex = $1", [creationCandidate.runInput.metricRequestSet.hashHex]),
      await client.query<{ count: string }>("select count(*) from investing.execution_configs_scientific_identities where hash_hex = $1", [creationCandidate.runInput.executionConfig.hashHex]),
      await client.query<{ count: string }>("select count(*) from investing.research_specs_scientific_identities where hash_hex = $1", [creationCandidate.runInput.researchSpec.hashHex]),
      await client.query<{ count: string }>("select count(*) from investing.run_inputs_scientific_identities where hash_hex = $1", [createdRunInput.runInputHashHex]),
    ].map((result) => result.rows[0]!.count);
    expect(creationComponentCounts).toEqual([
      String(creationCandidate.datasetSeries.length),
      "1",
      "1",
      "1",
      "1",
      "1",
    ]);
    await client.query("commit");
    await client.query("begin");
    await setExecutionContext({ research_ir_hash_hex: creationResearchIrHash });
    const executionRead = await client.query<{ hash_hex: string }>("select hash_hex from investing.research_ir_scientific_identities where hash_hex = $1", [creationResearchIrHash]);
    expect(executionRead.rows).toHaveLength(1);
    await client.query("commit");
    await expectTransactionRejects(async () => {
      await setExecutionContext({
        operation: "RESEARCH_RUN_INPUT_SCIENTIFIC_CREATE_V1",
        capability: "RESEARCH_MUTATE",
        research_ir_hash_hex: creationResearchIrHash,
        tenant_id: "99999999-9999-4999-8999-999999999991",
      });
      const hidden = await client.query("select hash_hex from investing.research_ir_scientific_identities where hash_hex = $1", [creationResearchIrHash]);
      expect(hidden.rows).toHaveLength(1);
    }, /expected|row-level security|violates/i);

    for (const [index, overrides] of [
      { operation: "RESEARCH_RUN_INPUT_SCIENTIFIC_CREATE_V1" },
      { capability: "RESEARCH_MUTATE" },
      { operation_scope: "ACCOUNT_SCOPE" },
      { source_context: "USER_PORTFOLIO" },
      { account_id: "99999999-9999-4999-8999-999999999999" },
      { tenant_id: "99999999-9999-4999-8999-999999999991" },
      { principal_id: "99999999-9999-4999-8999-999999999992" },
      { tenant_membership_id: "99999999-9999-4999-8999-999999999993" },
    ].entries()) {
      await expectTransactionRejects(async () => {
        await setExecutionContext(overrides);
        await insertExecutionRun(`dddddddd-${String(index).padStart(4, "0")}-4000-8000-000000000191`);
      }, /row-level security|invalid input syntax|violates/i);
    }

    await client.query("begin");
    await setExecutionContext({ research_ir_hash_hex: "8".repeat(64) });
    const researchIrPayload = JSON.stringify({ schemaVersion: "RESEARCH_IR_HASH_PAYLOAD_V1", irVersion: "RESEARCH_IR_V1" });
    await client.query("insert into investing.research_ir_scientific_identities (research_ir_identity_id, tenant_id, account_id, principal_id, tenant_membership_id, operation, capability, operation_scope, source_context, hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload) values (gen_random_uuid(),$1,null,$2,$3,'RESEARCH_EXECUTION_RUN_V1','RESEARCH_EXECUTE','TENANT_SCOPE','PURE_RESEARCH','SHA-256','SYNTRAKE:RESEARCH_IR:V1','SYNTRAKE_SHA256_V1',$4,$5::jsonb)", [ids.tenant, ids.principal, ids.membership, "8".repeat(64), researchIrPayload]);
    await client.query("insert into investing.research_ir_scientific_identities (research_ir_identity_id, tenant_id, account_id, principal_id, tenant_membership_id, operation, capability, operation_scope, source_context, hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload) values (gen_random_uuid(),$1,null,$2,$3,'RESEARCH_EXECUTION_RUN_V1','RESEARCH_EXECUTE','TENANT_SCOPE','PURE_RESEARCH','SHA-256','SYNTRAKE:RESEARCH_IR:V1','SYNTRAKE_SHA256_V1',$4,$5::jsonb) on conflict do nothing", [ids.tenant, ids.principal, ids.membership, "8".repeat(64), researchIrPayload]);
    await client.query("commit");
    await expectTransactionRejects(async () => {
      await setExecutionContext({ research_ir_hash_hex: "8".repeat(64) });
      await client.query("insert into investing.research_ir_scientific_identities (research_ir_identity_id, tenant_id, account_id, principal_id, tenant_membership_id, operation, capability, operation_scope, source_context, hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload) values (gen_random_uuid(),$1,null,$2,$3,'RESEARCH_EXECUTION_RUN_V1','RESEARCH_EXECUTE','TENANT_SCOPE','PURE_RESEARCH','SHA-256','SYNTRAKE:RESEARCH_IR:V1','SYNTRAKE_SHA256_V1',$4,$5::jsonb)", [ids.tenant, ids.principal, ids.membership, "8".repeat(64), JSON.stringify({ schemaVersion: "RESEARCH_IR_HASH_PAYLOAD_V1", changed: true })]);
    }, /duplicate key|unique/i);
    await expectTransactionRejects(async () => {
      await setExecutionContext({ research_ir_hash_hex: "9".repeat(64) });
      await client.query("insert into investing.research_ir_scientific_identities (research_ir_identity_id, tenant_id, account_id, principal_id, tenant_membership_id, operation, capability, operation_scope, source_context, hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload) values (gen_random_uuid(),$1,null,$2,$3,'RESEARCH_EXECUTION_RUN_V1','RESEARCH_MUTATE','TENANT_SCOPE','PURE_RESEARCH','SHA-256','SYNTRAKE:RESEARCH_IR:V1','SYNTRAKE_SHA256_V1',$4,$5::jsonb)", [ids.tenant, ids.principal, ids.membership, "9".repeat(64), researchIrPayload]);
    }, /check|row-level security|violates/i);

    const artifactBytes = Buffer.from("{\"x\":\"y\"}\n", "utf8");
    const trace = descriptor("RESEARCH_EXECUTION_TRACE_V1", artifactBytes);
    const valuation = descriptor("RESEARCH_VALUATION_SERIES_V1", artifactBytes);
    const metrics = descriptor("METRIC_RESULT_SET_V1", artifactBytes);
    const artifactIds = ["aaaaaaaa-1000-4000-8000-000000000191", "aaaaaaaa-2000-4000-8000-000000000191", "aaaaaaaa-3000-4000-8000-000000000191"];
    const runA = "aaaaaaaa-0000-4000-8000-000000000191";

    const executable = await seedExecutableRunInput();
    const materialBytes = new Map<string, Buffer>([
      [hashDatasetSeriesV1(executable.aaa.series), executable.aaa.bytes],
      [hashDatasetSeriesV1(executable.bbb.series), executable.bbb.bytes],
    ]);
    const provider = { loadSeriesContent: async (seriesRef: { hashHex: string }) => materialBytes.get(seriesRef.hashHex) ?? null };
    const beforeMissingRuns = await client.query<{ count: string }>("select count(*) from investing.research_execution_runs where run_input_identity_id = $1", [ids.executableRunInputIdentity]);
    const missingRoleProofStart = appRoleProofs.length;
    const missing = await executeResearchRunCommandV1({
      researchInvestigationId: ids.investigation,
      runInputIdentityId: ids.executableRunInputIdentity,
      correlationId: "corr-pg17-exec-missing",
      datasetMaterialProvider: { loadSeriesContent: async () => null },
    });
    expect(missing).toEqual({ ok: false, code: "DATASET_MATERIAL_NOT_FOUND" });
    expectAppTransportUsedInvestingApp(missingRoleProofStart);
    const afterMissingRuns = await client.query<{ count: string }>("select count(*) from investing.research_execution_runs where run_input_identity_id = $1", [ids.executableRunInputIdentity]);
    expect(afterMissingRuns.rows[0]!.count).toBe(beforeMissingRuns.rows[0]!.count);
    const executionRoleProofStart = appRoleProofs.length;
    const firstExecution = await executeResearchRunCommandV1({
      researchInvestigationId: ids.investigation,
      runInputIdentityId: ids.executableRunInputIdentity,
      correlationId: "corr-pg17-exec-first",
      datasetMaterialProvider: provider,
    });
    const secondExecution = await executeResearchRunCommandV1({
      researchInvestigationId: ids.investigation,
      runInputIdentityId: ids.executableRunInputIdentity,
      correlationId: "corr-pg17-exec-second",
      datasetMaterialProvider: provider,
    });
    if (!firstExecution.ok || !secondExecution.ok) {
      throw new Error(`execution failed: first=${JSON.stringify(firstExecution)} second=${JSON.stringify(secondExecution)}; ${lastRealWriterError ?? "no writer SQL error captured"}`);
    }
    expectAppTransportUsedInvestingApp(executionRoleProofStart);
    expect(firstExecution.researchExecutionRunId).not.toBe(secondExecution.researchExecutionRunId);
    expect(firstExecution.resultIdentityId).toBe(secondExecution.resultIdentityId);
    expect(firstExecution.resultHashHex).toBe(secondExecution.resultHashHex);
    expect(firstExecution.evidenceIdentityId).toBe(secondExecution.evidenceIdentityId);
    expect(firstExecution.evidenceHashHex).toBe(secondExecution.evidenceHashHex);

    const evidenceRows = await client.query<{
      evidence_object_identity_id: string;
      run_input_identity_id: string;
      result_identity_id: string;
      content_sha256: string;
      content_byte_length: string;
      actual_content_sha256: string;
      actual_content_byte_length: string;
    }>(
      [
        "select evidence_object_identity_id, run_input_identity_id, result_identity_id, content_sha256, content_byte_length::text,",
        "upper(encode(extensions.digest(content, 'sha256'), 'hex')) as actual_content_sha256,",
        "octet_length(content)::text as actual_content_byte_length",
        "from investing.research_evidence_objects_scientific_identities",
        "where evidence_object_identity_id = $1",
      ].join(" "),
      [firstExecution.evidenceIdentityId],
    );
    expect(evidenceRows.rows).toHaveLength(1);
    expect(evidenceRows.rows[0]!.run_input_identity_id).toBe(ids.executableRunInputIdentity);
    expect(evidenceRows.rows[0]!.result_identity_id).toBe(firstExecution.resultIdentityId);
    expect(evidenceRows.rows[0]!.content_sha256).toBe(evidenceRows.rows[0]!.actual_content_sha256);
    expect(evidenceRows.rows[0]!.content_byte_length).toBe(evidenceRows.rows[0]!.actual_content_byte_length);

    await expect(
      client.query(
        "update investing.research_evidence_objects_scientific_identities set content = content where evidence_object_identity_id = $1",
        [firstExecution.evidenceIdentityId],
      ),
    ).rejects.toThrow(/append-only/u);

    const reusedArtifactRows = await client.query<{ count: string }>(
      "select count(*) from investing.research_result_artifacts where artifact_id in (select execution_trace_artifact_id from investing.research_results_scientific_identities where result_identity_id = $1 union select valuation_series_artifact_id from investing.research_results_scientific_identities where result_identity_id = $1 union select metric_result_set_artifact_id from investing.research_results_scientific_identities where result_identity_id = $1 union select benchmark_series_artifact_id from investing.research_results_scientific_identities where result_identity_id = $1 and benchmark_series_artifact_id is not null)",
      [firstExecution.resultIdentityId],
    );
    expect(reusedArtifactRows.rows[0]!.count).toBe("4");

    const conflictExecutable = await seedExecutableRunInput(ids.conflictRunInputIdentity, true);
    const conflictPure = executeHistoricalBacktestV1({
      runInput: conflictExecutable.runInput,
      runInputHash: ref("SYNTRAKE:RUN_INPUT:V1", conflictExecutable.runInputHash as never),
      researchIr: conflictExecutable.researchIr,
      datasetSeries: conflictExecutable.datasetSeries,
      executionConfig: executableExecutionConfig,
      metricRequestSet: executableMetricRequestSet,
      materials: conflictExecutable.materials,
    });
    expect(conflictPure.ok).toBe(true);
    if (!conflictPure.ok) throw new Error("conflict pure execution failed");
    const conflictHash = hashResultV1(conflictPure.resultPayload);
    const conflictBytes = Buffer.from("{\"conflict\":\"seed\"}\n", "utf8");
    const conflictDescriptor = descriptor("RESEARCH_EXECUTION_TRACE_V1", conflictBytes);
    const conflictArtifactIds = ["dddddddd-1000-4000-8000-000000000191", "dddddddd-2000-4000-8000-000000000191", "dddddddd-3000-4000-8000-000000000191"];
    for (const [index, kind] of ["EXECUTION_TRACE", "VALUATION_SERIES", "METRIC_RESULT_SET"].entries()) {
      await client.query("insert into investing.research_result_artifacts (artifact_id, tenant_id, account_id, principal_id, tenant_membership_id, operation, capability, operation_scope, source_context, artifact_kind, artifact_schema_version, format, content_sha256, content_byte_length, record_count, content) values ($1,$2,null,$3,$4,'RESEARCH_EXECUTION_RUN_V1','RESEARCH_EXECUTE','TENANT_SCOPE','PURE_RESEARCH',$5,$6,$7,$8,$9,$10,$11)", [conflictArtifactIds[index], ids.tenant, ids.principal, ids.membership, kind, conflictDescriptor.artifactSchemaVersion, conflictDescriptor.format, conflictDescriptor.contentSha256, conflictDescriptor.contentByteLength, conflictDescriptor.recordCount, conflictBytes]);
    }
    await client.query("insert into investing.research_results_scientific_identities (result_identity_id, tenant_id, account_id, principal_id, tenant_membership_id, run_input_identity_id, execution_trace_artifact_id, valuation_series_artifact_id, metric_result_set_artifact_id, benchmark_series_artifact_id, operation, capability, operation_scope, source_context, engine_id, engine_version, hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload) values ('dddddddd-4000-4000-8000-000000000191',$1,null,$2,$3,$4,$5,$6,$7,null,'RESEARCH_EXECUTION_RUN_V1','RESEARCH_EXECUTE','TENANT_SCOPE','PURE_RESEARCH','HISTORICAL_EXECUTION_ADAPTER','ENGINE_V20260918','SHA-256','SYNTRAKE:RESULT:V1','SYNTRAKE_SHA256_V1',$8,$9::jsonb)", [ids.tenant, ids.principal, ids.membership, ids.conflictRunInputIdentity, conflictArtifactIds[0], conflictArtifactIds[1], conflictArtifactIds[2], conflictHash, JSON.stringify({ schemaVersion: "RESULT_HASH_PAYLOAD_V1", corrupted: true })]);
    const beforeConflictArtifacts = await client.query<{ count: string }>("select count(*) from investing.research_result_artifacts");
    const conflictMaterialBytes = new Map<string, Buffer>([
      [hashDatasetSeriesV1(conflictExecutable.aaa.series), conflictExecutable.aaa.bytes],
      [hashDatasetSeriesV1(conflictExecutable.bbb.series), conflictExecutable.bbb.bytes],
    ]);
    const conflictRoleProofStart = appRoleProofs.length;
    const conflictResult = await executeResearchRunCommandV1({
      researchInvestigationId: ids.investigation,
      runInputIdentityId: ids.conflictRunInputIdentity,
      correlationId: "corr-pg17-exec-conflict",
      datasetMaterialProvider: { loadSeriesContent: async (seriesRef) => conflictMaterialBytes.get(seriesRef.hashHex) ?? null },
    });
    expect(conflictResult).toEqual({ ok: false, code: "CONFLICT" });
    expectAppTransportUsedInvestingApp(conflictRoleProofStart);
    const afterConflictArtifacts = await client.query<{ count: string }>("select count(*) from investing.research_result_artifacts");
    expect(afterConflictArtifacts.rows[0]!.count).toBe(beforeConflictArtifacts.rows[0]!.count);
    const failedConflictRun = await client.query<{ count: string }>("select count(*) from investing.research_execution_run_events e join investing.research_execution_runs r on r.research_execution_run_id = e.research_execution_run_id where r.run_input_identity_id = $1 and e.run_status = 'FAILED' and e.failure_reason_code = 'CONFLICT'", [ids.conflictRunInputIdentity]);
    expect(failedConflictRun.rows[0]!.count).toBe("1");

    await client.query("begin");
    await setExecutionContext();
    await client.query("insert into investing.research_execution_runs (research_execution_run_id, tenant_id, account_id, principal_id, tenant_membership_id, research_investigation_id, run_input_identity_id, operation, capability, operation_scope, source_context, engine_id, engine_version) values ($1,$2,null,$3,$4,$5,$6,'RESEARCH_EXECUTION_RUN_V1','RESEARCH_EXECUTE','TENANT_SCOPE','PURE_RESEARCH','HISTORICAL_EXECUTION_ADAPTER','ENGINE_V20260918')", [runA, ids.tenant, ids.principal, ids.membership, ids.investigation, ids.runInputIdentity]);
    await client.query("insert into investing.research_execution_run_events (research_execution_run_event_id, research_execution_run_id, tenant_id, account_id, principal_id, tenant_membership_id, operation, capability, operation_scope, source_context, event_sequence, run_status) values (gen_random_uuid(),$1,$2,null,$3,$4,'RESEARCH_EXECUTION_RUN_V1','RESEARCH_EXECUTE','TENANT_SCOPE','PURE_RESEARCH',1,'REGISTERED')", [runA, ids.tenant, ids.principal, ids.membership]);
    await client.query("insert into investing.research_execution_run_events (research_execution_run_event_id, research_execution_run_id, tenant_id, account_id, principal_id, tenant_membership_id, operation, capability, operation_scope, source_context, event_sequence, run_status) values (gen_random_uuid(),$1,$2,null,$3,$4,'RESEARCH_EXECUTION_RUN_V1','RESEARCH_EXECUTE','TENANT_SCOPE','PURE_RESEARCH',2,'STARTED')", [runA, ids.tenant, ids.principal, ids.membership]);
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

    await client.query("begin");
    await setExecutionContext();
    const runFailed = "bbbbbbbb-1000-4000-8000-000000000191";
    await insertExecutionRun(runFailed);
    await insertExecutionEvent(runFailed, 1, "REGISTERED");
    await insertExecutionEvent(runFailed, 2, "STARTED");
    await insertExecutionEvent(runFailed, 3, "FAILED", null, "MISSING_REQUIRED_EXECUTION_PRICE");
    await client.query("commit");

    await expectTransactionRejects(async () => {
      await setExecutionContext();
      const runDirectTerminal = "bbbbbbbb-2000-4000-8000-000000000191";
      await insertExecutionRun(runDirectTerminal);
      await insertExecutionEvent(runDirectTerminal, 1, "REGISTERED");
      await insertExecutionEvent(runDirectTerminal, 3, "SUCCEEDED", resultId);
    }, /missing previous|invalid research execution/i);
    await expectTransactionRejects(async () => {
      await setExecutionContext();
      const runNoRegistered = "bbbbbbbb-3000-4000-8000-000000000191";
      await insertExecutionRun(runNoRegistered);
      await insertExecutionEvent(runNoRegistered, 2, "STARTED");
    }, /missing previous/i);
    await expectTransactionRejects(async () => {
      await setExecutionContext();
      await insertExecutionEvent(runA, 2, "STARTED");
    }, /duplicate key|unique/i);
    await expectTransactionRejects(async () => {
      await setExecutionContext();
      await insertExecutionEvent(runA, 3, "SUCCEEDED", resultId);
    }, /duplicate key|unique/i);
    await expectTransactionRejects(async () => {
      await setExecutionContext();
      const runFailedWithResult = "bbbbbbbb-4000-4000-8000-000000000191";
      await insertExecutionRun(runFailedWithResult);
      await insertExecutionEvent(runFailedWithResult, 1, "REGISTERED");
      await insertExecutionEvent(runFailedWithResult, 2, "STARTED");
      await insertExecutionEvent(runFailedWithResult, 3, "FAILED", resultId, "MISSING_REQUIRED_EXECUTION_PRICE");
    }, /terminal_payload|check/i);
    await expectTransactionRejects(async () => {
      await setExecutionContext();
      const runSucceededWithoutResult = "bbbbbbbb-5000-4000-8000-000000000191";
      await insertExecutionRun(runSucceededWithoutResult);
      await insertExecutionEvent(runSucceededWithoutResult, 1, "REGISTERED");
      await insertExecutionEvent(runSucceededWithoutResult, 2, "STARTED");
      await insertExecutionEvent(runSucceededWithoutResult, 3, "SUCCEEDED");
    }, /terminal_payload|check/i);

    const runB = "bbbbbbbb-0000-4000-8000-000000000191";
    await client.query("begin");
    await setExecutionContext();
    await client.query("insert into investing.research_execution_runs (research_execution_run_id, tenant_id, account_id, principal_id, tenant_membership_id, research_investigation_id, run_input_identity_id, operation, capability, operation_scope, source_context, engine_id, engine_version) values ($1,$2,null,$3,$4,$5,$6,'RESEARCH_EXECUTION_RUN_V1','RESEARCH_EXECUTE','TENANT_SCOPE','PURE_RESEARCH','HISTORICAL_EXECUTION_ADAPTER','ENGINE_V20260918')", [runB, ids.tenant, ids.principal, ids.membership, ids.investigation, ids.runInputIdentity]);
    await client.query("insert into investing.research_execution_run_events (research_execution_run_event_id, research_execution_run_id, tenant_id, account_id, principal_id, tenant_membership_id, operation, capability, operation_scope, source_context, event_sequence, run_status) values (gen_random_uuid(),$1,$2,null,$3,$4,'RESEARCH_EXECUTION_RUN_V1','RESEARCH_EXECUTE','TENANT_SCOPE','PURE_RESEARCH',1,'REGISTERED')", [runB, ids.tenant, ids.principal, ids.membership]);
    await client.query("insert into investing.research_execution_run_events (research_execution_run_event_id, research_execution_run_id, tenant_id, account_id, principal_id, tenant_membership_id, operation, capability, operation_scope, source_context, event_sequence, run_status) values (gen_random_uuid(),$1,$2,null,$3,$4,'RESEARCH_EXECUTION_RUN_V1','RESEARCH_EXECUTE','TENANT_SCOPE','PURE_RESEARCH',2,'STARTED')", [runB, ids.tenant, ids.principal, ids.membership]);
    await client.query("insert into investing.research_execution_run_events (research_execution_run_event_id, research_execution_run_id, tenant_id, account_id, principal_id, tenant_membership_id, operation, capability, operation_scope, source_context, event_sequence, run_status, result_identity_id) values (gen_random_uuid(),$1,$2,null,$3,$4,'RESEARCH_EXECUTION_RUN_V1','RESEARCH_EXECUTE','TENANT_SCOPE','PURE_RESEARCH',3,'SUCCEEDED',$5)", [runB, ids.tenant, ids.principal, ids.membership, resultId]);
    await client.query("commit");
    expect(runA).not.toBe(runB);
    const reused = await client.query<{ count: string }>("select count(*) from investing.research_results_scientific_identities where hash_hex = $1", ["E".repeat(64)]);
    expect(reused.rows[0]!.count).toBe("1");

    const rollbackArtifact = "cccccccc-1000-4000-8000-000000000191";
    const rollbackBytes = Buffer.from("{\"rollback\":\"probe\"}\n", "utf8");
    const rollbackTrace = descriptor("RESEARCH_EXECUTION_TRACE_V1", rollbackBytes);
    await client.query("begin");
    await setExecutionContext();
    await client.query("insert into investing.research_result_artifacts (artifact_id, tenant_id, account_id, principal_id, tenant_membership_id, operation, capability, operation_scope, source_context, artifact_kind, artifact_schema_version, format, content_sha256, content_byte_length, record_count, content) values ($1,$2,null,$3,$4,'RESEARCH_EXECUTION_RUN_V1','RESEARCH_EXECUTE','TENANT_SCOPE','PURE_RESEARCH','EXECUTION_TRACE','RESEARCH_EXECUTION_TRACE_V1','CANONICAL_JSONL_UTF8_LF_FINAL_NEWLINE_V1',$5,$6,1,$7)", [rollbackArtifact, ids.tenant, ids.principal, ids.membership, rollbackTrace.contentSha256, rollbackBytes.length, rollbackBytes]);
    await expect(client.query("insert into investing.research_execution_run_events (research_execution_run_event_id, research_execution_run_id, tenant_id, account_id, principal_id, tenant_membership_id, operation, capability, operation_scope, source_context, event_sequence, run_status) values (gen_random_uuid(),$1,$2,null,$3,$4,'RESEARCH_EXECUTION_RUN_V1','RESEARCH_EXECUTE','TENANT_SCOPE','PURE_RESEARCH',99,'STARTED')", [runB, ids.tenant, ids.principal, ids.membership])).rejects.toThrow(/violates|event_sequence|missing previous research execution run event/i);
    await client.query("rollback");
    const absent = await client.query<{ count: string }>("select count(*) from investing.research_result_artifacts where artifact_id = $1", [rollbackArtifact]);
    expect(absent.rows[0]!.count).toBe("0");
  }, 40_000);
});
