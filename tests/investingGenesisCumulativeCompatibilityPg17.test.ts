import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Pool, TypeOverrides, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../lib/investing/authority/clerk", () => ({
  resolveVerifiedClerkIdentity: vi.fn(),
}));
vi.mock("../lib/investing/authority/transport", () => ({
  getInvestingAuthorityDatabase: vi.fn(),
  readInvestingDatabaseConfig: vi.fn(),
}));

import { resolveVerifiedClerkIdentity } from "../lib/investing/authority/clerk";
import {
  getInvestingAuthorityDatabase,
  readInvestingDatabaseConfig,
} from "../lib/investing/authority/transport";
import { bootstrapInitialPersonalInvestingAccount } from "../lib/investing/authority/bootstrap";
import {
  isAuthorizedInvestingContext,
  resolveAuthorizedInvestingAccountContext,
  resolveAuthorizedResearchDraftCreateContext,
  resolveAuthorizedResearchInvestigationCreateContext,
  type AuthorizedInvestingContext,
  type AuthorizedResearchDraftCreateContext,
  type AuthorizedResearchInvestigationCreateContext,
  type InvestingAuthorityDatabase,
  type InvestingAuthorityTransactionClient,
} from "../lib/investing/authority/context";
import { accountSyntheticI3Fill } from "../lib/investing/accounting/syntheticFill";
import { createResearchInvestigationV1 } from "../lib/investing/research/investigationWriter";
import { createResearchDraftV1 } from "../lib/investing/research/draftWriter";
import {
  canonicalDatasetSeriesMaterialBytesV1,
  hashDatasetSeriesV1,
  hashDatasetSnapshotV1,
  hashExecutionConfigV1,
  hashMetricRequestSetV1,
  hashRefV1,
  hashResearchIrV1,
  sha256HexV1,
  verifyDatasetSeriesMaterialV1,
  type DatasetSeriesHashPayloadV1,
  type ExecutionConfigHashPayloadV1,
  type MetricRequestSetHashPayloadV1,
  type ResearchIrV1,
  type RunInputHashPayloadV1,
} from "../lib/investing/research";
import { hashRunInputV1 } from "../lib/investing/research/canonical";
import { executeResearchRunCommandV1 } from "../lib/investing/research/researchExecutionService";
import {
  createAndActivateInvestingPlanRevisionForAccountV1,
  initializeInvestingPlanForAccountV1,
} from "../lib/investing/plan/service";
import {
  initializePlanV1,
  type PlanContentV1,
} from "../lib/investing/plan/writer";

const repoRoot = path.resolve(__dirname, "..");
const connectionString = process.env.PG17_CUMULATIVE_COMPATIBILITY_URL ?? "";
const demoProjectRef = "local-pg17";
const primarySubject = "user_pg17_cumulative_primary";
const secondarySubject = "user_pg17_cumulative_secondary";
const POSTGRES_TIMESTAMPTZ_OID = 1184;

const canonicalFiles = [
  ["supabase/migrations/20260822140500_recover_zero_genesis_shared_preconditions.sql", "65891aa2b1e2707ba2d27db31114c90b844ad332"],
  ["supabase/migrations/20260822141129_assert_investing_runtime_zero_genesis_boundary.sql", "baf3145375a25f15a19f0ac221fe2e31c1221094"],
  ["supabase/migrations/20260822143241_drop_retired_investing_defaults.sql", "876ca9f510b14aedd1af0b61340e952ae937ac2c"],
  ["supabase/migrations/20260822143442_remove_retired_investing_from_shared_mode_constraints.sql", "f3726ffd4ea93ff421153f5bda5c5069801b3041"],
  ["supabase/migrations/20260822223021_revoke_legacy_public_function_execute_for_investing_isolation.sql", "7f39c917e9bf7ad9eca2d6f33b5e62fc25a4b2f1"],
  ["supabase/migrations/20260825120000_investing_genesis_i2_authority_materialization.sql", "91e40c4335f516829bb9da32819f10b30c66c262"],
  ["supabase/migrations/20260825123000_investing_genesis_i2_authorized_context.sql", "2d1127a991efd2f38ec3db4af1181b17dace059b"],
  ["supabase/migrations/20260828105111_investing_genesis_i2_atomic_personal_bootstrap.sql", "120a0e1b18fa988dda83560a937dc745b84968df"],
  ["supabase/migrations/20260831221500_investing_genesis_i2_ledger_schema.sql", "4d4166410a7c06fd0e452336f223db682b568a32"],
  ["docs/investing-genesis/sql/I3A_ACCOUNTING_FOUNDATIONS_CANDIDATE.sql", "d82e70e6c30fc27f37d61538e2755f1b6fc64b66"],
  ["docs/investing-genesis/sql/I3B_LEDGER_LINEAGE_CANDIDATE_V3.sql", "387e20da2193e06c93abf0a025b72ab2ef3df578"],
  ["docs/investing-genesis/sql/I3C_ATOMIC_FILL_ACCOUNTING_CANDIDATE.sql", "b403a869b26e93279552c5ea6d795f1d89061292"],
  ["docs/investing-genesis/sql/I3C_BUY_AUDIT_NULL_REPAIR_CANDIDATE.sql", "74089d771759c86e2566d44191fa5bc8833a4a73"],
  ["docs/investing-genesis/sql/I4B_PLAN_PERSISTENCE_CANDIDATE.sql", "3f41bbef0f5d0d0ce8be88b3c8a5ffa5a5e561b9"],
] as const;

const historicalI5Migrations = [
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
] as const;

const compatibilityRepairMigration =
  "supabase/migrations/20260921180446_investing_i0_i5_cumulative_compatibility_repair.sql";

const expectedFinalIdempotencyOperations = [
  "I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1",
  "INITIAL_PAPER_CASH_FUNDING",
  "INITIAL_PERSONAL_BOOTSTRAP",
  "PLAN_CREATE_AND_ACTIVATE_REVISION_V1",
  "PLAN_INITIALIZE_V1",
  "RESEARCH_DRAFT_CREATE_V1",
  "RESEARCH_DRAFT_REVISION_CREATE_V1",
  "RESEARCH_EXPERIMENT_BASELINE_CREATE_V1",
  "RESEARCH_EXPERIMENT_VARIANT_CREATE_V1",
  "RESEARCH_HYPOTHESIS_REVISION_CREATE_V1",
  "RESEARCH_INVESTIGATION_CREATE_V1",
  "RESEARCH_SPEC_REVISION_CREATE_V1",
] as const;

const expectedFinalAuditPolicies = [
  { tablename: "audit_events", policyname: "audit_events_i2b_authority_denial_insert", permissive: "PERMISSIVE", cmd: "INSERT", roles: ["investing_app"], qualMarkers: [], checkMarkers: ["AUTHORITY_ACCESS_DENIED", "ACCOUNT_CONTEXT_RESOLVE", "ACCOUNT_AUTHORITY_READ", "operation_scope", "reason_code"] },
  { tablename: "audit_events", policyname: "audit_events_i2c_bootstrap_insert", permissive: "PERMISSIVE", cmd: "INSERT", roles: ["investing_app"], qualMarkers: [], checkMarkers: ["AUTHORITY_BOOTSTRAP_SUCCEEDED", "AUTHORITY_BOOTSTRAP_FAILED", "AUTHORITY_BOOTSTRAP", "INITIAL_PERSONAL_BOOTSTRAP", "DOMAIN_SCOPE"] },
  { tablename: "audit_events", policyname: "audit_events_i3c_buy_null_revision_insert", permissive: "PERMISSIVE", cmd: "INSERT", roles: ["investing_app"], qualMarkers: [], checkMarkers: ["I3_FILL_ACCOUNTING_SUCCEEDED", "I3_FILL", "I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1", "I3_INTERNAL_PAPER_BUY_V1", "accounting_revision_id"] },
  { tablename: "audit_events", policyname: "audit_events_i3c_fill_success_insert", permissive: "PERMISSIVE", cmd: "INSERT", roles: ["investing_app"], qualMarkers: [], checkMarkers: ["I3_FILL_ACCOUNTING_SUCCEEDED", "I3_FILL", "I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1", "ledger_transaction_id", "material_request_hash"] },
  { tablename: "audit_events", policyname: "audit_events_i4c_plan_conflict_insert", permissive: "PERMISSIVE", cmd: "INSERT", roles: ["investing_app"], qualMarkers: [], checkMarkers: ["PLAN_MUTATION_CONFLICT", "IDEMPOTENCY_RECORD", "PLAN_INITIALIZE_V1", "PLAN_CREATE_AND_ACTIVATE_REVISION_V1", "reason_code"] },
  { tablename: "audit_events", policyname: "audit_events_i4c_plan_denial_insert", permissive: "PERMISSIVE", cmd: "INSERT", roles: ["investing_app"], qualMarkers: [], checkMarkers: ["AUTHORITY_ACCESS_DENIED", "PLAN_INITIALIZE_V1", "PLAN_CREATE_AND_ACTIVATE_REVISION_V1", "ACCOUNT_SCOPE", "PRINCIPAL_DISABLED", "TENANT_INACTIVE", "MEMBERSHIP_INACTIVE", "ACCESS_INACTIVE", "ACCOUNT_INACTIVE", "AUTHORITY_TUPLE_MISMATCH"] },
  { tablename: "audit_events", policyname: "audit_events_i4c_plan_guard_read", permissive: "PERMISSIVE", cmd: "SELECT", roles: ["investing_app"], qualMarkers: ["PLAN_INITIALIZE_V1", "PLAN_CREATE_AND_ACTIVATE_REVISION_V1", "PLAN_WRITE", "principal_id", "account_id"], checkMarkers: [] },
  { tablename: "audit_events", policyname: "audit_events_i4c_plan_success_insert", permissive: "PERMISSIVE", cmd: "INSERT", roles: ["investing_app"], qualMarkers: [], checkMarkers: ["PLAN_INITIALIZATION_SUCCEEDED", "PLAN_REVISION_ACTIVATED", "PLAN_REVISION", "PLAN_INITIALIZE_V1", "PLAN_CREATE_AND_ACTIVATE_REVISION_V1"] },
  { tablename: "audit_events", policyname: "audit_events_i5_research_investigation_create_denial_insert", permissive: "PERMISSIVE", cmd: "INSERT", roles: ["investing_app"], qualMarkers: [], checkMarkers: ["RESEARCH_INVESTIGATION_CREATE_V1", "RESEARCH_MUTATE", "AUTHORITY_ACCESS_DENIED", "operation_scope", "source_context"] },
] as const;

const expectedSecurityDefinerFunctions = [
  {
    proname: "enforce_research_execution_run_event_transition",
    owner: "investing_owner",
    language: "plpgsql",
    returnType: "trigger",
    searchPath: ["search_path=investing, pg_temp"],
    triggerName: "research_execution_run_events_transition_trigger",
    triggerRelation: "research_execution_run_events",
    tgtype: 7,
    bodyMarker: "missing previous research execution run event",
  },
  {
    proname: "reject_research_evidence_update_delete",
    owner: "investing_owner",
    language: "plpgsql",
    returnType: "trigger",
    searchPath: ["search_path=investing, pg_temp"],
    triggerName: "research_evidence_append_only_trigger",
    triggerRelation: "research_evidence_objects_scientific_identities",
    tgtype: 27,
    bodyMarker: "research evidence objects are append-only",
  },
] as const;

const allNotSuppliedContent: PlanContentV1 = Object.freeze({
  planning_currency_preference: Object.freeze({ state: "NOT_SUPPLIED", type: "TOKEN" }),
  goal_description: Object.freeze({ state: "NOT_SUPPLIED", type: "TEXT" }),
  target_money: Object.freeze({ state: "NOT_SUPPLIED", type: "MONEY" }),
  target_date: Object.freeze({ state: "NOT_SUPPLIED", type: "DATE" }),
  time_horizon_months: Object.freeze({ state: "NOT_SUPPLIED", type: "INTEGER" }),
  risk_tolerance: Object.freeze({ state: "NOT_SUPPLIED", type: "TOKEN" }),
  excluded_asset_classes: Object.freeze({ state: "NOT_SUPPLIED", type: "TOKEN_SET" }),
  notes: Object.freeze({ state: "NOT_SUPPLIED", type: "TEXT" }),
});

const changedConflictContent: PlanContentV1 = Object.freeze({
  ...allNotSuppliedContent,
  notes: Object.freeze({ state: "SUPPLIED", type: "TEXT", value: "material-conflict-probe" }),
});

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

function ref(hashDomain: ReturnType<typeof hashRefV1>["hashDomain"], hashHex: string) {
  return hashRefV1({ hashAlgorithm: "SHA-256", hashDomain, hashVersion: "SYNTRAKE_SHA256_V1", hashHex });
}

function executableMaterial(instrumentId: string, values: readonly [string, string][]) {
  const bytes = canonicalDatasetSeriesMaterialBytesV1(values.map(([date, value]) => ({ date, value })));
  const series: DatasetSeriesHashPayloadV1 = {
    schemaVersion: "DATASET_SERIES_HASH_PAYLOAD_V1",
    providerDatasetId: "PG17_CUMULATIVE_EXECUTION_FIXTURE",
    providerDatasetVersion: "V20260922",
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

function executableFixture() {
  const aaa = executableMaterial("US:CUMA", [["2025-01-06", "100"], ["2025-01-07", "102"], ["2025-01-08", "104"], ["2025-01-10", "106"]]);
  const bbb = executableMaterial("US:CUMB", [["2025-01-06", "100"], ["2025-01-07", "100"], ["2025-01-08", "100"], ["2025-01-10", "100"]]);
  const researchIr: ResearchIrV1 = {
    schemaVersion: "RESEARCH_IR_HASH_PAYLOAD_V1",
    irVersion: "RESEARCH_IR_V1",
    universe: { type: "EXPLICIT_INSTRUMENTS", instrumentIds: ["US:CUMB", "US:CUMA"] },
    pipeline: [
      { type: "FILTER", predicate: { type: "COMPARE", left: { type: "DATA_FIELD_REF", fieldId: "ADJUSTED_CLOSE", fieldVersion: "I5A_RESEARCH_IR_FIELD_CONTRACT_V1" }, operator: "GT", right: { type: "DECIMAL", value: "0", unit: "VALUATION_CURRENCY_PER_INSTRUMENT" } } },
      { type: "WEIGHT", method: "EQUAL" },
      { type: "REBALANCE", schedule: "DAILY" },
    ],
    benchmark: { type: "BENCHMARK", benchmark: "INSTRUMENT", instrumentId: "US:CUMB" },
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
    metricRegistryVersion: executableMetricRequestSet.metricRegistryVersion,
    metricRequestSet: ref("SYNTRAKE:METRIC_REQUEST_SET:V1", hashMetricRequestSetV1(executableMetricRequestSet)),
    executionConfig: ref("SYNTRAKE:EXECUTION_CONFIG:V1", hashExecutionConfigV1(executableExecutionConfig)),
    materialPolicies: [],
  };
  return { aaa, bbb, researchIr, datasetSnapshot, runInput, runInputHash: hashRunInputV1(runInput), datasetSeries: [aaa.series, bbb.series] };
}

function safeBootstrapFailure(result: unknown) {
  if (typeof result !== "object" || result === null || !("ok" in result) || (result as { ok?: unknown }).ok !== false) {
    return { stage: "UNKNOWN", code: "UNKNOWN", errorClass: "UNEXPECTED_RESULT" };
  }
  const failure = result as { code?: unknown; externalCode?: unknown };
  return {
    stage: "INITIAL_PERSONAL_BOOTSTRAP",
    code: typeof failure.code === "string" ? failure.code : "UNKNOWN",
    errorClass: typeof failure.externalCode === "string" ? failure.externalCode : "UNKNOWN",
  };
}

let adminPool: Pool;
let adminClient: PoolClient;
let currentSubject = primarySubject;
let lastAuthorityDbError: { code: string; message: string } | null = null;

function gitBlobSha(value: Buffer | string) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value, "utf8");
  return createHash("sha1")
    .update(Buffer.from(`blob ${bytes.length}\0`, "utf8"))
    .update(bytes)
    .digest("hex");
}

function readCanonical(relativePath: string, expectedBlobSha: string) {
  const bytes = fs.readFileSync(path.join(repoRoot, relativePath));
  expect(gitBlobSha(bytes), `Git blob drift for ${relativePath}`).toBe(expectedBlobSha);
  return bytes.toString("utf8");
}

async function applyCanonical(relativePath: string, expectedBlobSha: string) {
  const sql = readCanonical(relativePath, expectedBlobSha);
  try {
    await adminClient.query(sql);
  } catch (error) {
    await adminClient.query("rollback").catch(() => undefined);
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`PG17 apply failed for ${relativePath}: ${message}`);
  }
}

async function applySql(relativePath: string) {
  const sql = fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
  try {
    await adminClient.query(sql);
  } catch (error) {
    await adminClient.query("rollback").catch(() => undefined);
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`PG17 apply failed for ${relativePath}: ${message}`);
  }
}

function createAuthorityDatabase(): InvestingAuthorityDatabase {
  return {
    connect: async () => {
      const client = await adminPool.connect();
      await client.query("reset all");
      await client.query("set role investing_app");
      const adapter: InvestingAuthorityTransactionClient = {
        query: async <Row = Record<string, unknown>>(text: string, values: readonly unknown[] = []) => {
          try {
            const result = await client.query<Row>(text, [...values]);
            return { rows: result.rows, rowCount: result.rowCount };
          } catch (error) {
            const pgError = error as { code?: unknown; message?: unknown };
            lastAuthorityDbError = {
              code: typeof pgError.code === "string" ? pgError.code : "UNKNOWN",
              message: typeof pgError.message === "string" ? pgError.message : String(error),
            };
            throw error;
          }
        },
        release: async (destroy = false) => {
          try {
            await client.query("reset role").catch(() => undefined);
            await client.query("reset all").catch(() => undefined);
          } finally {
            client.release(destroy);
          }
        },
      };
      return adapter;
    },
  };
}

async function installSimulatedSharedSubstrate() {
  await adminClient.query(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin;

    create schema extensions;
    create extension pgcrypto with schema extensions;
    grant usage on schema extensions to public, anon, authenticated, service_role;

    create table public.daily_snapshots (mode text default 'trading');
    create table public.journal_entries (mode text default 'trading');
    create table public.paper_trades (mode text default 'trading', updated_at timestamptz not null default now());
    create table public.plans (mode text);
    create table public.portfolio_items (mode text default 'trading');
    create table public.portfolio_meta (mode text);
    create table public.portfolios (mode text default 'trading');
    create table public.trading_followed_positions (mode text);
    create table public.user_settings (
      active_mode text default 'trading',
      setup_mode text,
      modes jsonb not null default '{}'::jsonb
    );

    create table public.marketing_content_items (updated_at timestamptz not null default now());
    create table public.marketing_leads (updated_at timestamptz not null default now());
    create table public.paper_trade_runs (updated_at timestamptz not null default now());
    create table public.paper_trade_user_locks (updated_at timestamptz not null default now());
    create table public.research_lab_state (updated_at timestamptz not null default now());
    create table public.trading_scanner_snapshots (updated_at timestamptz not null default now());

    create function public.acquire_paper_trade_lock(text, text, text, integer, text)
      returns boolean language sql as $$ select true $$;
    create function public.create_paper_trade_cycle(jsonb)
      returns jsonb language sql as $$ select $1 $$;
    create function public.release_paper_trade_lock(text, text, text)
      returns boolean language sql as $$ select true $$;

    create function public.set_marketing_ops_updated_at()
      returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
    create function public.set_paper_trade_runs_updated_at()
      returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
    create function public.set_paper_trade_user_locks_updated_at()
      returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
    create function public.set_paper_trades_updated_at()
      returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
    create function public.set_research_lab_updated_at()
      returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
    create function public.set_trading_scanner_snapshots_updated_at()
      returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;

    create function public.read_paper_trade_history_compact_v1(text, integer, integer)
      returns jsonb language sql as $$ select '[]'::jsonb $$;
    revoke execute on function public.read_paper_trade_history_compact_v1(text, integer, integer) from public;
    grant execute on function public.read_paper_trade_history_compact_v1(text, integer, integer)
      to postgres, anon, authenticated, service_role;

    grant execute on function public.acquire_paper_trade_lock(text, text, text, integer, text)
      to public, postgres, anon, authenticated, service_role;
    grant execute on function public.create_paper_trade_cycle(jsonb)
      to public, postgres, anon, authenticated, service_role;
    grant execute on function public.release_paper_trade_lock(text, text, text)
      to public, postgres, anon, authenticated, service_role;
    grant execute on function public.set_marketing_ops_updated_at()
      to public, postgres, anon, authenticated, service_role;
    grant execute on function public.set_paper_trade_runs_updated_at()
      to public, postgres, anon, authenticated, service_role;
    grant execute on function public.set_paper_trade_user_locks_updated_at()
      to public, postgres, anon, authenticated, service_role;
    grant execute on function public.set_paper_trades_updated_at()
      to public, postgres, anon, authenticated, service_role;
    grant execute on function public.set_research_lab_updated_at()
      to public, postgres, anon, authenticated, service_role;
    grant execute on function public.set_trading_scanner_snapshots_updated_at()
      to public, postgres, anon, authenticated, service_role;

    create trigger set_marketing_content_items_updated_at
      before update on public.marketing_content_items
      for each row execute function public.set_marketing_ops_updated_at();
    create trigger set_marketing_leads_updated_at
      before update on public.marketing_leads
      for each row execute function public.set_marketing_ops_updated_at();
    create trigger set_paper_trade_runs_updated_at
      before update on public.paper_trade_runs
      for each row execute function public.set_paper_trade_runs_updated_at();
    create trigger set_paper_trade_user_locks_updated_at
      before update on public.paper_trade_user_locks
      for each row execute function public.set_paper_trade_user_locks_updated_at();
    create trigger set_paper_trades_updated_at
      before update on public.paper_trades
      for each row execute function public.set_paper_trades_updated_at();
    create trigger set_research_lab_state_updated_at
      before update on public.research_lab_state
      for each row execute function public.set_research_lab_updated_at();
    create trigger set_trading_scanner_snapshots_updated_at
      before update on public.trading_scanner_snapshots
      for each row execute function public.set_trading_scanner_snapshots_updated_at();
  `);
}

async function seedInitialPaperCashFunding(context: AuthorizedInvestingContext, amount: string) {
  const idempotencyRecordId = randomUUID();
  const ledgerTransactionId = randomUUID();
  const cashLedgerAccountId = randomUUID();
  const capitalLedgerAccountId = randomUUID();
  const materialHash = "A".repeat(64);
  const correlationId = "corr-i0-i4-funding-0001";
  const idempotencyKey = "idem-i0-i4-funding-0001";

  await adminClient.query("begin");
  try {
    await adminClient.query(
      `insert into investing.idempotency_records (
        idempotency_record_id, idempotency_key, material_request_hash, correlation_id,
        actor_kind, actor_id, operation_scope, operation, principal_id, tenant_id, account_id, status
      ) values ($1,$2,$3,$4,'USER_PRINCIPAL',$5,'ACCOUNT_SCOPE','INITIAL_PAPER_CASH_FUNDING',$6,$7,$8,'STARTED')`,
      [idempotencyRecordId, idempotencyKey, materialHash, correlationId, context.actorId, context.principalId, context.tenantId, context.accountId],
    );
    await adminClient.query(
      `insert into investing.ledger_accounts (
        ledger_account_id, tenant_id, account_id, currency_code, account_class, normal_side,
        ledger_account_type, ledger_account_code, state
      ) values
        ($1,$2,$3,'EUR','ASSET','DEBIT','CASH_ASSET','CASH_ASSET','ACTIVE'),
        ($4,$2,$3,'EUR','EQUITY','CREDIT','SIMULATED_CAPITAL','SIMULATED_CAPITAL','ACTIVE')`,
      [cashLedgerAccountId, context.tenantId, context.accountId, capitalLedgerAccountId],
    );
    await adminClient.query(
      `insert into investing.ledger_transactions (
        ledger_transaction_id, tenant_id, account_id, actor_kind, actor_id, principal_id,
        operation_scope, operation, transaction_kind, effective_at, correlation_id,
        idempotency_record_id, material_request_hash, source, source_reference,
        value_origin, freshness, context
      ) values (
        $1,$2,$3,'USER_PRINCIPAL',$4,$5,'ACCOUNT_SCOPE','INITIAL_PAPER_CASH_FUNDING',
        'INITIAL_PAPER_CASH_FUNDING',transaction_timestamp(),$6,$7,$8,
        'USER_DECLARED_PAPER_CAPITAL','I0_I4_PG17_DEMO_FUNDING','SIMULATED','NOT_APPLICABLE','DEMO'
      )`,
      [ledgerTransactionId, context.tenantId, context.accountId, context.actorId, context.principalId, correlationId, idempotencyRecordId, materialHash],
    );
    await adminClient.query(
      `insert into investing.ledger_postings (
        ledger_posting_id, ledger_transaction_id, tenant_id, account_id,
        ledger_account_id, currency_code, side, amount
      ) values
        ($1,$2,$3,$4,$5,'EUR','DEBIT',$6::numeric),
        ($7,$2,$3,$4,$8,'EUR','CREDIT',$6::numeric)`,
      [randomUUID(), ledgerTransactionId, context.tenantId, context.accountId, cashLedgerAccountId, amount, randomUUID(), capitalLedgerAccountId],
    );
    await adminClient.query(
      `insert into investing.ledger_transaction_seals (
        ledger_transaction_seal_id, ledger_transaction_id, tenant_id, account_id
      ) values ($1,$2,$3,$4)`,
      [randomUUID(), ledgerTransactionId, context.tenantId, context.accountId],
    );
    await adminClient.query(
      `update investing.idempotency_records
       set status='SUCCEEDED', canonical_result_reference=$2::jsonb,
           updated_at=transaction_timestamp(), completed_at=transaction_timestamp()
       where idempotency_record_id=$1 and status='STARTED'`,
      [idempotencyRecordId, JSON.stringify({ ledgerTransactionId, valueOrigin: "SIMULATED", context: "DEMO" })],
    );
    await adminClient.query("commit");
  } catch (error) {
    await adminClient.query("rollback").catch(() => undefined);
    throw error;
  }
}

async function seedExecutableRunInputForCumulative(
  client: PoolClient,
  ids: { tenantId: string; principalId: string; tenantMembershipId: string; researchInvestigationId: string },
) {
  const fixture = executableFixture();
  const draftRootId = randomUUID();
  const hypothesisRootId = randomUUID();
  const specRootId = randomUUID();
  const draftRevisionId = randomUUID();
  const hypothesisRevisionId = randomUUID();
  const specRevisionId = randomUUID();
  const experimentId = randomUUID();
  const runInputIdentityId = randomUUID();
  const specIdempotencyId = randomUUID();
  const experimentIdempotencyId = randomUUID();
  const draftIdempotencyId = randomUUID();
  const hypothesisIdempotencyId = randomUUID();

  await client.query(
    `insert into investing.idempotency_records (
      idempotency_record_id, idempotency_key, material_request_hash, correlation_id, actor_kind, actor_id,
      operation_scope, operation, principal_id, tenant_id, account_id, status, completed_at
    ) values
      ($1, 'idem-cumulative-spec', $5, 'corr-cumulative-spec', 'USER_PRINCIPAL', $9, 'TENANT_SCOPE', 'RESEARCH_SPEC_REVISION_CREATE_V1', $10, $11, null, 'SUCCEEDED', now()),
      ($2, 'idem-cumulative-experiment', $6, 'corr-cumulative-experiment', 'USER_PRINCIPAL', $9, 'TENANT_SCOPE', 'RESEARCH_EXPERIMENT_BASELINE_CREATE_V1', $10, $11, null, 'SUCCEEDED', now()),
      ($3, 'idem-cumulative-draft', $7, 'corr-cumulative-draft', 'USER_PRINCIPAL', $9, 'TENANT_SCOPE', 'RESEARCH_DRAFT_REVISION_CREATE_V1', $10, $11, null, 'SUCCEEDED', now()),
      ($4, 'idem-cumulative-hypothesis', $8, 'corr-cumulative-hypothesis', 'USER_PRINCIPAL', $9, 'TENANT_SCOPE', 'RESEARCH_HYPOTHESIS_REVISION_CREATE_V1', $10, $11, null, 'SUCCEEDED', now())`,
    [specIdempotencyId, experimentIdempotencyId, draftIdempotencyId, hypothesisIdempotencyId, "C".repeat(64), "D".repeat(64), "E".repeat(64), "F".repeat(64), primarySubject, ids.principalId, ids.tenantId],
  );
  await client.query(
    `insert into investing.research_material_roots (
      material_root_id, research_investigation_id, tenant_id, account_id, principal_id, actor_kind, actor_id,
      tenant_membership_id, account_access_id, operation_scope, source_context, material_kind, created_by_operation
    ) values
      ($1,$4,$5,null,$6,'USER_PRINCIPAL',$7,$8,null,'TENANT_SCOPE','PURE_RESEARCH','DRAFT','RESEARCH_DRAFT_REVISION_CREATE_V1'),
      ($2,$4,$5,null,$6,'USER_PRINCIPAL',$7,$8,null,'TENANT_SCOPE','PURE_RESEARCH','HYPOTHESIS','RESEARCH_HYPOTHESIS_REVISION_CREATE_V1'),
      ($3,$4,$5,null,$6,'USER_PRINCIPAL',$7,$8,null,'TENANT_SCOPE','PURE_RESEARCH','RESEARCH_SPEC','RESEARCH_SPEC_REVISION_CREATE_V1')`,
    [draftRootId, hypothesisRootId, specRootId, ids.researchInvestigationId, ids.tenantId, ids.principalId, primarySubject, ids.tenantMembershipId],
  );
  await client.query(
    `insert into investing.research_material_revisions (
      material_revision_id, material_root_id, research_investigation_id, tenant_id, account_id, principal_id, actor_kind, actor_id,
      tenant_membership_id, account_access_id, operation_scope, operation, capability, source_context, material_kind, revision_number,
      predecessor_revision_id, payload_schema_version, canonical_payload, material_hash, material_request_hash, idempotency_record_id, idempotency_key, correlation_id
    ) values
      ($1,$2,$5,$6,null,$7,'USER_PRINCIPAL',$8,$9,null,'TENANT_SCOPE','RESEARCH_DRAFT_REVISION_CREATE_V1','RESEARCH_MUTATE','PURE_RESEARCH','DRAFT',1,null,'RESEARCH_DRAFT_HASH_PAYLOAD_V1','{"schemaVersion":"RESEARCH_DRAFT_HASH_PAYLOAD_V1"}'::jsonb,$10,$10,$12,'idem-cumulative-draft','corr-cumulative-draft'),
      ($3,$4,$5,$6,null,$7,'USER_PRINCIPAL',$8,$9,null,'TENANT_SCOPE','RESEARCH_HYPOTHESIS_REVISION_CREATE_V1','RESEARCH_MUTATE','PURE_RESEARCH','HYPOTHESIS',1,null,'HYPOTHESIS_HASH_PAYLOAD_V1','{"schemaVersion":"HYPOTHESIS_HASH_PAYLOAD_V1"}'::jsonb,$11,$11,$13,'idem-cumulative-hypothesis','corr-cumulative-hypothesis')`,
    [draftRevisionId, draftRootId, hypothesisRevisionId, hypothesisRootId, ids.researchInvestigationId, ids.tenantId, ids.principalId, primarySubject, ids.tenantMembershipId, "E".repeat(64), "F".repeat(64), draftIdempotencyId, hypothesisIdempotencyId],
  );
  await client.query(
    `insert into investing.research_spec_revisions (
      research_spec_revision_id, material_root_id, research_investigation_id, tenant_id, account_id, principal_id, actor_kind, actor_id,
      tenant_membership_id, account_access_id, operation_scope, source_context, operation, capability, revision_number, predecessor_revision_id,
      source_draft_revision_id, source_draft_material_hash, hypothesis_revision_id, hypothesis_material_hash, candidate_schema_version, candidate_status,
      canonical_candidate, material_request_hash, idempotency_record_id, idempotency_key, correlation_id
    ) values ($1,$2,$3,$4,null,$5,'USER_PRINCIPAL',$6,$7,null,'TENANT_SCOPE','PURE_RESEARCH',
      'RESEARCH_SPEC_REVISION_CREATE_V1','RESEARCH_MUTATE',1,null,$8,$9,$10,$11,'RESEARCH_SPEC_CANDIDATE_V1','CANDIDATE_ONLY',
      '{"schemaVersion":"RESEARCH_SPEC_CANDIDATE_V1"}'::jsonb,$12,$13,'idem-cumulative-spec','corr-cumulative-spec')`,
    [specRevisionId, specRootId, ids.researchInvestigationId, ids.tenantId, ids.principalId, primarySubject, ids.tenantMembershipId, draftRevisionId, "E".repeat(64), hypothesisRevisionId, "F".repeat(64), "C".repeat(64), specIdempotencyId],
  );
  await client.query(
    `insert into investing.research_experiments (
      research_experiment_id, research_investigation_id, tenant_id, account_id, principal_id, actor_kind, actor_id, tenant_membership_id, account_access_id,
      operation_scope, source_context, operation, capability, relation, parent_experiment_id, research_spec_revision_id,
      research_ir_hash_algorithm, research_ir_hash_domain, research_ir_hash_version, research_ir_hash_hex,
      experiment_hash_algorithm, experiment_hash_domain, experiment_hash_version, experiment_hash_hex,
      experiment_parameters_hash_algorithm, experiment_parameters_hash_domain, experiment_parameters_hash_version, experiment_parameters_hash_hex,
      material_request_hash, idempotency_record_id, idempotency_key, correlation_id
    ) values ($1,$2,$3,null,$4,'USER_PRINCIPAL',$5,$6,null,'TENANT_SCOPE','PURE_RESEARCH',
      'RESEARCH_EXPERIMENT_BASELINE_CREATE_V1','RESEARCH_MUTATE','BASELINE',null,$7,
      'SHA-256','SYNTRAKE:RESEARCH_IR:V1','SYNTRAKE_SHA256_V1',$8,
      'SHA-256','SYNTRAKE:EXPERIMENT:V1','SYNTRAKE_SHA256_V1',$9,
      null,null,null,null,$10,$11,'idem-cumulative-experiment','corr-cumulative-experiment')`,
    [experimentId, ids.researchInvestigationId, ids.tenantId, ids.principalId, primarySubject, ids.tenantMembershipId, specRevisionId, fixture.runInput.researchIr.hashHex, fixture.runInput.experiment.hashHex, "D".repeat(64), experimentIdempotencyId],
  );

  for (const series of fixture.datasetSeries) {
    await client.query("insert into investing.dataset_series_scientific_identities (dataset_series_identity_id, tenant_id, account_id, principal_id, tenant_membership_id, operation, capability, operation_scope, source_context, hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload) values (gen_random_uuid(),$1,null,$2,$3,'RESEARCH_RUN_INPUT_SCIENTIFIC_CREATE_V1','RESEARCH_MUTATE','TENANT_SCOPE','PURE_RESEARCH','SHA-256','SYNTRAKE:DATASET_SERIES:V1','SYNTRAKE_SHA256_V1',$4,$5::jsonb) on conflict do nothing", [ids.tenantId, ids.principalId, ids.tenantMembershipId, hashDatasetSeriesV1(series), JSON.stringify(series)]);
  }
  await client.query("insert into investing.dataset_snapshots_scientific_identities (dataset_snapshot_identity_id, tenant_id, account_id, principal_id, tenant_membership_id, operation, capability, operation_scope, source_context, hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload) values (gen_random_uuid(),$1,null,$2,$3,'RESEARCH_RUN_INPUT_SCIENTIFIC_CREATE_V1','RESEARCH_MUTATE','TENANT_SCOPE','PURE_RESEARCH','SHA-256','SYNTRAKE:DATASET_SNAPSHOT:V1','SYNTRAKE_SHA256_V1',$4,$5::jsonb) on conflict do nothing", [ids.tenantId, ids.principalId, ids.tenantMembershipId, fixture.runInput.datasetSnapshot.hashHex, JSON.stringify(fixture.datasetSnapshot)]);
  await client.query("insert into investing.metric_request_sets_scientific_identities (metric_request_set_identity_id, tenant_id, account_id, principal_id, tenant_membership_id, operation, capability, operation_scope, source_context, hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload, metric_registry_version) values (gen_random_uuid(),$1,null,$2,$3,'RESEARCH_RUN_INPUT_SCIENTIFIC_CREATE_V1','RESEARCH_MUTATE','TENANT_SCOPE','PURE_RESEARCH','SHA-256','SYNTRAKE:METRIC_REQUEST_SET:V1','SYNTRAKE_SHA256_V1',$4,$5::jsonb,$6) on conflict do nothing", [ids.tenantId, ids.principalId, ids.tenantMembershipId, fixture.runInput.metricRequestSet.hashHex, JSON.stringify(executableMetricRequestSet), executableMetricRequestSet.metricRegistryVersion]);
  await client.query("insert into investing.execution_configs_scientific_identities (execution_config_identity_id, tenant_id, account_id, principal_id, tenant_membership_id, operation, capability, operation_scope, source_context, hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload, engine_compatibility_version) values (gen_random_uuid(),$1,null,$2,$3,'RESEARCH_RUN_INPUT_SCIENTIFIC_CREATE_V1','RESEARCH_MUTATE','TENANT_SCOPE','PURE_RESEARCH','SHA-256','SYNTRAKE:EXECUTION_CONFIG:V1','SYNTRAKE_SHA256_V1',$4,$5::jsonb,$6) on conflict do nothing", [ids.tenantId, ids.principalId, ids.tenantMembershipId, fixture.runInput.executionConfig.hashHex, JSON.stringify(executableExecutionConfig), executableExecutionConfig.engineCompatibilityVersion]);
  await client.query("insert into investing.research_ir_scientific_identities (research_ir_identity_id, tenant_id, account_id, principal_id, tenant_membership_id, operation, capability, operation_scope, source_context, hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload) values (gen_random_uuid(),$1,null,$2,$3,'RESEARCH_RUN_INPUT_SCIENTIFIC_CREATE_V1','RESEARCH_MUTATE','TENANT_SCOPE','PURE_RESEARCH','SHA-256','SYNTRAKE:RESEARCH_IR:V1','SYNTRAKE_SHA256_V1',$4,$5::jsonb) on conflict do nothing", [ids.tenantId, ids.principalId, ids.tenantMembershipId, fixture.runInput.researchIr.hashHex, JSON.stringify(fixture.researchIr)]);
  await client.query("insert into investing.run_inputs_scientific_identities (run_input_identity_id, tenant_id, account_id, principal_id, tenant_membership_id, research_investigation_id, research_experiment_id, research_spec_revision_id, operation, capability, operation_scope, source_context, research_spec_hash_hex, research_ir_hash_hex, experiment_hash_hex, dataset_snapshot_hash_hex, metric_registry_version, metric_request_set_hash_hex, engine_version, execution_config_hash_hex, hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload) values ($1,$2,null,$3,$4,$5,$6,$7,'RESEARCH_RUN_INPUT_SCIENTIFIC_CREATE_V1','RESEARCH_MUTATE','TENANT_SCOPE','PURE_RESEARCH',$8,$9,$10,$11,$12,$13,$14,$15,'SHA-256','SYNTRAKE:RUN_INPUT:V1','SYNTRAKE_SHA256_V1',$16,$17::jsonb)", [runInputIdentityId, ids.tenantId, ids.principalId, ids.tenantMembershipId, ids.researchInvestigationId, experimentId, specRevisionId, fixture.runInput.researchSpec.hashHex, fixture.runInput.researchIr.hashHex, fixture.runInput.experiment.hashHex, fixture.runInput.datasetSnapshot.hashHex, fixture.runInput.metricRegistryVersion, fixture.runInput.metricRequestSet.hashHex, fixture.runInput.engineVersion, fixture.runInput.executionConfig.hashHex, fixture.runInputHash, JSON.stringify(fixture.runInput)]);

  return { runInputIdentityId, fixture };
}

async function financialSnapshot() {
  const result = await adminClient.query<{ snapshot: Record<string, number> }>(`
    select jsonb_build_object(
      'fills', (select count(*) from investing.i3_fills),
      'ledger_transactions', (select count(*) from investing.ledger_transactions),
      'ledger_postings', (select count(*) from investing.ledger_postings),
      'ledger_seals', (select count(*) from investing.ledger_transaction_seals),
      'accounting_revisions', (select count(*) from investing.i3_accounting_revisions),
      'allocations', (select count(*) from investing.i3_lot_consumption_allocations),
      'revision_seals', (select count(*) from investing.i3_accounting_revision_seals)
    ) as snapshot
  `);
  return result.rows[0]!.snapshot;
}

async function expectInvestingAppStatementDenied(
  label: string,
  statements: readonly { text: string; values?: readonly unknown[] }[],
  setupStatements: readonly { text: string; values?: readonly unknown[] }[] = [],
) {
  let denied = false;
  await adminClient.query("begin");
  try {
    for (const statement of setupStatements) {
      await adminClient.query(statement.text, [...(statement.values ?? [])]);
    }
    await adminClient.query("set local role investing_app");
    for (const statement of statements) {
      await adminClient.query(statement.text, [...(statement.values ?? [])]);
    }
  } catch (error) {
    const code = (error as { code?: string }).code;
    denied = code === "42501" || code === "23514" || code === "23503";
  } finally {
    await adminClient.query("rollback");
  }
  expect(denied, label).toBe(true);
}

async function expectInvestingAppCount(
  label: string,
  setupStatements: readonly { text: string; values?: readonly unknown[] }[],
  countStatement: { text: string; values?: readonly unknown[] },
  expectedCount: number,
  adminSetupStatements: readonly { text: string; values?: readonly unknown[] }[] = [],
) {
  await adminClient.query("begin");
  try {
    for (const statement of adminSetupStatements) {
      await adminClient.query(statement.text, [...(statement.values ?? [])]);
    }
    for (const statement of setupStatements) {
      await adminClient.query(statement.text, [...(statement.values ?? [])]);
    }
    await adminClient.query("set local role investing_app");
    const result = await adminClient.query<{ count: string }>(countStatement.text, [...(countStatement.values ?? [])]);
    expect(Number(result.rows[0]!.count), label).toBe(expectedCount);
  } finally {
    await adminClient.query("rollback");
  }
}

type ReplayVisibilityCounts = {
  accounts: number;
  tenant_memberships: number;
  account_access: number;
  tenants: number;
};

async function measureBootstrapReplayVisibility(
  input: {
    actorId: string;
    principalId: string;
    tenantId: string;
    tenantMembershipId: string;
    accountId: string;
    accountAccessId: string;
    idempotencyRecordId: string;
    idempotencyKey: string;
    materialRequestHash: string;
    baseCurrency: string;
    includeCandidateTenantId: boolean;
  },
): Promise<ReplayVisibilityCounts> {
  const setGuc = async (name: string, value: string) => {
    await adminClient.query("select set_config($1, $2, true)", [name, value]);
  };

  await adminClient.query("begin");
  try {
    await adminClient.query("set local role investing_app");
    await setGuc("syntrake.investing.actor_kind", "USER_PRINCIPAL");
    await setGuc("syntrake.investing.actor_id", input.actorId);
    await setGuc("syntrake.investing.external_provider", "CLERK");
    await setGuc("syntrake.investing.external_subject", input.actorId);
    await setGuc("syntrake.investing.operation", "INITIAL_PERSONAL_BOOTSTRAP");
    await setGuc("syntrake.investing.capability", "AUTHORITY_BOOTSTRAP");
    await setGuc("syntrake.investing.correlation_id", "corr-cumulative-replay-visibility");
    await setGuc("syntrake.investing.idempotency_key", input.idempotencyKey);
    await setGuc("syntrake.investing.idempotency_record_id", input.idempotencyRecordId);
    await setGuc("syntrake.investing.material_request_hash", input.materialRequestHash);
    await setGuc("syntrake.investing.base_currency", input.baseCurrency);
    await setGuc("syntrake.investing.principal_id", input.principalId);
    await setGuc("syntrake.investing.tenant_id", input.tenantId);
    await setGuc("syntrake.investing.account_id", input.accountId);
    await setGuc("syntrake.investing.tenant_membership_id", input.tenantMembershipId);
    await setGuc("syntrake.investing.account_access_id", input.accountAccessId);
    if (input.includeCandidateTenantId) {
      await setGuc("syntrake.investing.candidate_tenant_id", input.tenantId);
    }

    const accounts = await adminClient.query<{ count: string }>(
      `select count(*)::text as count
       from investing.accounts
       where account_id = $1
         and tenant_id = $2
         and initial_principal_id = $3
         and account_origin = 'INITIAL_PERSONAL_BOOTSTRAP'`,
      [input.accountId, input.tenantId, input.principalId],
    );
    const memberships = await adminClient.query<{ count: string }>(
      `select count(*)::text as count
       from investing.tenant_memberships
       where tenant_membership_id = $1
         and tenant_id = $2
         and principal_id = $3
         and role = 'OWNER'`,
      [input.tenantMembershipId, input.tenantId, input.principalId],
    );
    const access = await adminClient.query<{ count: string }>(
      `select count(*)::text as count
       from investing.account_access
       where account_access_id = $1
         and account_id = $2
         and tenant_id = $3
         and tenant_membership_id = $4
         and principal_id = $5
         and role = 'OWNER'`,
      [input.accountAccessId, input.accountId, input.tenantId, input.tenantMembershipId, input.principalId],
    );
    const tenants = await adminClient.query<{ count: string }>(
      "select count(*)::text as count from investing.tenants where tenant_id = $1",
      [input.tenantId],
    );

    return {
      accounts: Number(accounts.rows[0]!.count),
      tenant_memberships: Number(memberships.rows[0]!.count),
      account_access: Number(access.rows[0]!.count),
      tenants: Number(tenants.rows[0]!.count),
    };
  } finally {
    await adminClient.query("rollback");
  }
}

beforeAll(async () => {
  if (!connectionString) return;

  const types = new TypeOverrides();
  types.setTypeParser(POSTGRES_TIMESTAMPTZ_OID, (value: string) => value);
  adminPool = new Pool({ connectionString, max: 16, types });
  adminClient = await adminPool.connect();

  vi.mocked(resolveVerifiedClerkIdentity).mockImplementation(async () => ({
    ok: true,
    externalProvider: "CLERK",
    externalSubject: currentSubject,
  }));

  const database = createAuthorityDatabase();
  vi.mocked(getInvestingAuthorityDatabase).mockImplementation(() => database);
  vi.mocked(readInvestingDatabaseConfig).mockImplementation(() => ({
    ok: true,
    connectionString: "postgresql://investing_app.local-pg17:rehearsal@local.pooler.supabase.com:6543/postgres",
    host: "local.pooler.supabase.com",
    port: 6543,
    database: "postgres",
    user: "investing_app.local-pg17",
    role: "investing_app",
    projectRef: demoProjectRef,
    transport: "SUPABASE_SHARED_POOLER_TRANSACTION_MODE",
    preparedStatements: false,
    tls: { rejectUnauthorized: true },
  }));
});

afterAll(async () => {
  adminClient?.release();
  await adminPool?.end();
});

(connectionString ? describe : describe.skip)("Investing Genesis cumulative compatibility PostgreSQL 17 rehearsal", () => {
  it("replays historical I5, applies the forward repair, and exercises I3/I4/I5-compatible final state", async () => {
    const version = await adminClient.query<{ server_version: string }>("show server_version");
    expect(version.rows[0]!.server_version.startsWith("17.")).toBe(true);

    for (const [doc, sha] of [
      ["docs/investing-genesis/I0_CONSTITUTION.md", "34954aaecf49246a14f4009d4ed68932563e82bd"],
      ["docs/investing-genesis/I1_AUTHORITY_DESIGN.md", "40e07d200f6f810e7d33bea8706a7bf457eeaf80"],
      ["docs/investing-genesis/I1_DB_BOUNDARY_CONTRACT.md", "530af3af827487be4e019fb760102f59a1ba773b"],
      ["docs/investing-genesis/I2_LEDGER_DESIGN.md", "d933e851e3747b9c7314a82645606ddd5e2c49dd"],
      ["docs/investing-genesis/I3_ACCOUNTING_DESIGN.md", "c8c67ba9541cc99ba296b6ac018d2fc02572733c"],
      ["docs/investing-genesis/I3_ACCOUNTING_DESIGN_FREEZE.md", "021fd8b2e62660dfc3580ec4a864b5cf774416ec"],
      ["docs/investing-genesis/I4B_PLAN_PERSISTENCE_DESIGN.md", "d1fbaef043ff566681a5d7225ccb366d1b7de04a"],
      ["docs/investing-genesis/I4C_PLAN_WRITER_DESIGN.md", "7aa65fc2ab1edcd3c1e458a256fd5c595020282e"],
    ] as const) {
      readCanonical(doc, sha);
    }

    await installSimulatedSharedSubstrate();

    for (const [relativePath, expectedSha] of canonicalFiles.slice(0, 5)) {
      await applyCanonical(relativePath, expectedSha);
    }

    const zeroBoundary = await adminClient.query<{ investing_schema: string | null }>(
      "select to_regnamespace('investing')::text as investing_schema",
    );
    expect(zeroBoundary.rows[0]!.investing_schema).toBeNull();

    for (const [relativePath, expectedSha] of canonicalFiles.slice(5, 9)) {
      await applyCanonical(relativePath, expectedSha);
    }

    for (const migration of historicalI5Migrations) {
      await applySql(migration);
    }

    currentSubject = "user_pg17_cumulative_state_a";
    lastAuthorityDbError = null;
    const stateABootstrap = await bootstrapInitialPersonalInvestingAccount({
      idempotencyKey: "idem-cumulative-state-a-bootstrap",
      correlationId: "corr-cumulative-state-a-bootstrap",
      baseCurrency: "EUR",
    });
    expect(stateABootstrap.ok).toBe(false);
    if (stateABootstrap.ok !== false) throw new Error("State A unexpectedly succeeded before forward repair");
    expect(safeBootstrapFailure(stateABootstrap)).toMatchObject({
      stage: "INITIAL_PERSONAL_BOOTSTRAP",
    });
    expect(lastAuthorityDbError).toMatchObject({
      code: "42P17",
    });
    expect(lastAuthorityDbError?.message.toLowerCase()).toContain("infinite recursion");

    await applySql(compatibilityRepairMigration);

    currentSubject = primarySubject;
    const bootstrap = await bootstrapInitialPersonalInvestingAccount({
      idempotencyKey: "idem-i0-i4-bootstrap-0001",
      correlationId: "corr-i0-i4-bootstrap-0001",
      baseCurrency: "EUR",
    });
    if (bootstrap.ok !== true) {
      throw new Error(`I2 bootstrap failed after repair: ${JSON.stringify(safeBootstrapFailure(bootstrap))}`);
    }
    expect(bootstrap.ok).toBe(true);
    expect(bootstrap.replayed).toBe(false);

    const bootstrapIdempotency = await adminClient.query<{ material_request_hash: string }>(
      "select material_request_hash from investing.idempotency_records where idempotency_record_id=$1",
      [bootstrap.idempotencyRecordId],
    );
    expect(bootstrapIdempotency.rows).toHaveLength(1);
    const replayVisibilityProbe = {
      actorId: primarySubject,
      principalId: bootstrap.principalId,
      tenantId: bootstrap.tenantId,
      tenantMembershipId: bootstrap.tenantMembershipId,
      accountId: bootstrap.accountId,
      accountAccessId: bootstrap.accountAccessId,
      idempotencyRecordId: bootstrap.idempotencyRecordId,
      idempotencyKey: "idem-i0-i4-bootstrap-0001",
      materialRequestHash: bootstrapIdempotency.rows[0]!.material_request_hash,
      baseCurrency: "EUR",
    };
    const replayVisibilityWithoutCandidateTenant = await measureBootstrapReplayVisibility({
      ...replayVisibilityProbe,
      includeCandidateTenantId: false,
    });
    expect(replayVisibilityWithoutCandidateTenant).toEqual({
      accounts: 1,
      tenant_memberships: 1,
      account_access: 1,
      tenants: 0,
    });
    const replayVisibility = await measureBootstrapReplayVisibility({
      ...replayVisibilityProbe,
      includeCandidateTenantId: true,
    });
    expect(replayVisibility).toEqual({
      accounts: 1,
      tenant_memberships: 1,
      account_access: 1,
      tenants: 1,
    });

    const bootstrapReplay = await bootstrapInitialPersonalInvestingAccount({
      idempotencyKey: "idem-i0-i4-bootstrap-0001",
      correlationId: "corr-i0-i4-bootstrap-0001",
      baseCurrency: "EUR",
    });
    expect(bootstrapReplay).toEqual({ ...bootstrap, replayed: true });

    const setGuc = (name: string, value: string) => ({
      text: "select set_config($1, $2, true)",
      values: [name, value],
    });
    const researchTenantGucs = [
      setGuc("syntrake.investing.operation", "RESEARCH_INVESTIGATION_CREATE_V1"),
      setGuc("syntrake.investing.capability", "RESEARCH_MUTATE"),
      setGuc("syntrake.investing.operation_scope", "TENANT_SCOPE"),
      setGuc("syntrake.investing.tenant_id", bootstrap.tenantId),
      setGuc("syntrake.investing.principal_id", bootstrap.principalId),
      setGuc("syntrake.investing.account_id", ""),
      setGuc("syntrake.investing.external_provider", "CLERK"),
      setGuc("syntrake.investing.external_subject", primarySubject),
      setGuc("syntrake.investing.actor_id", primarySubject),
    ];
    await expectInvestingAppStatementDenied("wrong candidate tenant id is rejected by I2-C membership WITH CHECK", [
      setGuc("syntrake.investing.operation", "INITIAL_PERSONAL_BOOTSTRAP"),
      setGuc("syntrake.investing.capability", "AUTHORITY_BOOTSTRAP"),
      setGuc("syntrake.investing.candidate_tenant_membership_id", randomUUID()),
      setGuc("syntrake.investing.candidate_tenant_id", randomUUID()),
      setGuc("syntrake.investing.principal_id", bootstrap.principalId),
      setGuc("syntrake.investing.external_provider", "CLERK"),
      setGuc("syntrake.investing.external_subject", primarySubject),
      {
        text: `insert into investing.tenant_memberships
          (tenant_membership_id, tenant_id, principal_id, role, state)
          values (nullif(current_setting('syntrake.investing.candidate_tenant_membership_id', true), '')::uuid,$1,$2,'OWNER','ACTIVE')`,
        values: [bootstrap.tenantId, bootstrap.principalId],
      },
    ]);
    await expectInvestingAppStatementDenied("non-OWNER membership role is rejected by DB contract", [
      setGuc("syntrake.investing.operation", "INITIAL_PERSONAL_BOOTSTRAP"),
      setGuc("syntrake.investing.capability", "AUTHORITY_BOOTSTRAP"),
      setGuc("syntrake.investing.candidate_tenant_membership_id", randomUUID()),
      setGuc("syntrake.investing.candidate_tenant_id", bootstrap.tenantId),
      setGuc("syntrake.investing.principal_id", bootstrap.principalId),
      setGuc("syntrake.investing.external_provider", "CLERK"),
      setGuc("syntrake.investing.external_subject", primarySubject),
      {
        text: `insert into investing.tenant_memberships
          (tenant_membership_id, tenant_id, principal_id, role, state)
          values (nullif(current_setting('syntrake.investing.candidate_tenant_membership_id', true), '')::uuid,$1,$2,'VIEWER','ACTIVE')`,
        values: [bootstrap.tenantId, bootstrap.principalId],
      },
    ]);
    await adminClient.query(
      "update investing.principals set state='DISABLED', disabled_at=transaction_timestamp() where principal_id=$1",
      [bootstrap.principalId],
    );
    try {
      await adminClient.query("begin");
      try {
        for (const statement of researchTenantGucs) {
          await adminClient.query(statement.text, [...statement.values]);
        }
        await adminClient.query("set local role investing_app");
        const disabledPrincipalVisibility = await adminClient.query<{ principal_id: string; state: string }>(
          "select principal_id::text, state from investing.principals where principal_id=$1",
          [bootstrap.principalId],
        );
        expect(disabledPrincipalVisibility.rows).toEqual([{ principal_id: bootstrap.principalId, state: "DISABLED" }]);
      } finally {
        await adminClient.query("rollback");
      }

      const principalDisabledDenial = await resolveAuthorizedResearchInvestigationCreateContext({
        sourceContext: "PURE_RESEARCH",
        tenantId: bootstrap.tenantId,
        correlationId: "corr-cumulative-i5-principal-disabled-negative",
      });
      expect(principalDisabledDenial).toEqual({
        ok: false,
        code: "PRINCIPAL_DISABLED",
        externalCode: "FORBIDDEN_OR_NOT_FOUND",
      });
      const preAuthorityAudit = await adminClient.query<{
        resolution_stage: string;
        reason_code: string;
        outcome: string;
      }>(
        `select resolution_stage, reason_code, outcome
         from investing.pre_authority_audit_events
         where correlation_id='corr-cumulative-i5-principal-disabled-negative'`,
      );
      expect(preAuthorityAudit.rows).toEqual([{
        resolution_stage: "PRINCIPAL_STATE",
        reason_code: "PRINCIPAL_DISABLED",
        outcome: "DENIED",
      }]);
    } finally {
      await adminClient.query(
        "update investing.principals set state='ACTIVE', disabled_at=null where principal_id=$1",
        [bootstrap.principalId],
      );
    }
    await expectInvestingAppCount("inactive tenant is invisible to investing_app authority selector", [
      ...researchTenantGucs,
    ], {
      text: "select count(*)::text as count from investing.tenants where tenant_id=$1",
      values: [bootstrap.tenantId],
    }, 0, [
      { text: "update investing.tenants set state='SUSPENDED', suspended_at=transaction_timestamp(), closed_at=null where tenant_id=$1", values: [bootstrap.tenantId] },
    ]);
    await expectInvestingAppCount("wrong principal cannot see OWNER membership", [
      ...researchTenantGucs.filter((statement) => statement.values?.[0] !== "syntrake.investing.principal_id"),
      setGuc("syntrake.investing.principal_id", randomUUID()),
    ], {
      text: "select count(*)::text as count from investing.tenant_memberships where tenant_membership_id=$1",
      values: [bootstrap.tenantMembershipId],
    }, 0);
    await adminClient.query(
      "update investing.tenant_memberships set state='REVOKED', revoked_at=transaction_timestamp() where tenant_membership_id=$1",
      [bootstrap.tenantMembershipId],
    );
    try {
      const inactiveMembershipDenial = await resolveAuthorizedResearchInvestigationCreateContext({
        sourceContext: "PURE_RESEARCH",
        tenantId: bootstrap.tenantId,
        correlationId: "corr-cumulative-i5-membership-inactive-negative",
      });
      expect(inactiveMembershipDenial).toEqual({
        ok: false,
        code: "MEMBERSHIP_INACTIVE",
        externalCode: "FORBIDDEN_OR_NOT_FOUND",
      });
    } finally {
      await adminClient.query(
        "update investing.tenant_memberships set state='ACTIVE', revoked_at=null where tenant_membership_id=$1",
        [bootstrap.tenantMembershipId],
      );
    }
    await expectInvestingAppCount("account tuple mismatch is invisible to investing_app account selector", [
      setGuc("syntrake.investing.operation", "RESEARCH_INVESTIGATION_CREATE_V1"),
      setGuc("syntrake.investing.capability", "RESEARCH_MUTATE"),
      setGuc("syntrake.investing.operation_scope", "ACCOUNT_SCOPE"),
      setGuc("syntrake.investing.account_id", bootstrap.accountId),
      setGuc("syntrake.investing.principal_id", randomUUID()),
    ], {
      text: "select count(*)::text as count from investing.accounts where account_id=$1",
      values: [bootstrap.accountId],
    }, 0);
    await expectInvestingAppCount("account_access tuple mismatch is invisible to investing_app access selector", [
      setGuc("syntrake.investing.operation", "RESEARCH_DRAFT_CREATE_V1"),
      setGuc("syntrake.investing.capability", "RESEARCH_MUTATE"),
      setGuc("syntrake.investing.operation_scope", "ACCOUNT_SCOPE"),
      setGuc("syntrake.investing.account_id", bootstrap.accountId),
      setGuc("syntrake.investing.tenant_id", bootstrap.tenantId),
      setGuc("syntrake.investing.tenant_membership_id", bootstrap.tenantMembershipId),
      setGuc("syntrake.investing.account_access_id", randomUUID()),
      setGuc("syntrake.investing.principal_id", bootstrap.principalId),
    ], {
      text: "select count(*)::text as count from investing.account_access where account_access_id=$1",
      values: [bootstrap.accountAccessId],
    }, 0);

    const authorityBeforeI3 = await resolveAuthorizedInvestingAccountContext({
      accountId: bootstrap.accountId,
      correlationId: "corr-i0-i4-authority-0001",
    });
    expect(authorityBeforeI3.ok).toBe(true);
    if (authorityBeforeI3.ok !== true) throw new Error("I2 authority resolve failed");
    expect(isAuthorizedInvestingContext(authorityBeforeI3.context)).toBe(true);

    await seedInitialPaperCashFunding(authorityBeforeI3.context, "100000");

    const instrumentId = randomUUID();
    await adminClient.query(
      `insert into investing.i3_instruments (
        instrument_id, asset_class, primary_currency_code, state, source, source_reference, context
      ) values ($1,'SIMPLE_CASH_SECURITY','EUR','ACTIVE','SYNTHETIC_I3_REHEARSAL','I0_I4_PG17_INSTRUMENT','DEMO')`,
      [instrumentId],
    );

    const authority = await resolveAuthorizedInvestingAccountContext({
      accountId: bootstrap.accountId,
      correlationId: "corr-i0-i4-authority-0002",
    });
    expect(authority.ok).toBe(true);
    if (authority.ok !== true) throw new Error("I3 authority resolve failed");
    expect(isAuthorizedInvestingContext(authority.context)).toBe(true);

    const effectiveAt = new Date().toISOString();
    const i3Env = {
      SYNTRAKE_I3_SYNTHETIC_REHEARSAL_ENABLED: "true",
      SYNTRAKE_I3_REHEARSAL_PROJECT_REF: demoProjectRef,
      VERCEL_ENV: "test",
    };
    const buyInput = {
      authorizedContext: authority.context,
      idempotencyKey: "idem-i0-i4-buy-00000001",
      correlationId: "corr-i0-i4-buy-00000001",
      instrumentId,
      side: "BUY" as const,
      quantity: "10",
      unitPrice: "100",
      feeAmount: "5",
      effectiveAt,
      sourceSequence: "1",
      sourceReference: "I0_I4_PG17_BUY_1",
    };
    const buy = await accountSyntheticI3Fill(buyInput, i3Env);
    if (buy.ok !== true) throw new Error("I3 BUY failed");
    expect(buy.replayed).toBe(false);

    const buyReplay = await accountSyntheticI3Fill(buyInput, i3Env);
    expect(buyReplay).toEqual({ ...buy, replayed: true });

    const concurrentSellBase = {
      authorizedContext: authority.context,
      instrumentId,
      side: "SELL" as const,
      quantity: "6",
      unitPrice: "120",
      feeAmount: "2",
      effectiveAt,
    };
    const sellResults = await Promise.all([
      accountSyntheticI3Fill({
        ...concurrentSellBase,
        idempotencyKey: "idem-i0-i4-sell-a-0001",
        correlationId: "corr-i0-i4-sell-a-0001",
        sourceSequence: "2",
        sourceReference: "I0_I4_PG17_SELL_A",
      }, i3Env),
      accountSyntheticI3Fill({
        ...concurrentSellBase,
        idempotencyKey: "idem-i0-i4-sell-b-0001",
        correlationId: "corr-i0-i4-sell-b-0001",
        sourceSequence: "3",
        sourceReference: "I0_I4_PG17_SELL_B",
      }, i3Env),
    ]);
    const sellWinners = sellResults.filter((result) => result.ok);
    const sellLosers = sellResults.filter((result) => !result.ok);
    expect(sellWinners).toHaveLength(1);
    expect(sellLosers).toHaveLength(1);
    if (sellWinners[0]?.ok !== true) throw new Error("I3 concurrent SELL winner missing");
    expect(sellWinners[0].accountingRevisionId).not.toBeNull();
    if (sellLosers[0]?.ok !== false) throw new Error("I3 concurrent SELL loser missing");
    expect(["INSUFFICIENT_POSITION", "ACCOUNTING_REBUILD_REQUIRED"]).toContain(sellLosers[0].code);

    const financialBeforePlan = await financialSnapshot();

    currentSubject = primarySubject;
    const initInput = {
      accountId: bootstrap.accountId,
      idempotencyKey: "idem-i0-i4-plan-init-0001",
      correlationId: "corr-i0-i4-plan-init-0001",
      content: allNotSuppliedContent,
    };
    const initialPlan = await initializeInvestingPlanForAccountV1(initInput);
    expect(initialPlan.ok).toBe(true);
    if (initialPlan.ok !== true) throw new Error("I4 initialize failed");
    expect(initialPlan.replayed).toBe(false);
    expect(initialPlan.activeVersion).toBe("1");

    const initialReplay = await initializeInvestingPlanForAccountV1(initInput);
    expect(initialReplay).toEqual({ ...initialPlan, replayed: true });

    const revisionBase = {
      accountId: bootstrap.accountId,
      planRootId: initialPlan.planRootId,
      expectedActiveRevisionId: initialPlan.planRevisionId,
      expectedActiveVersion: "1",
      content: allNotSuppliedContent,
    };
    const revisionCalls = [
      {
        ...revisionBase,
        idempotencyKey: "idem-i0-i4-plan-r2-a-01",
        correlationId: "corr-i0-i4-plan-r2-a-01",
      },
      {
        ...revisionBase,
        idempotencyKey: "idem-i0-i4-plan-r2-b-01",
        correlationId: "corr-i0-i4-plan-r2-b-01",
      },
    ] as const;
    const revisionResults = await Promise.all(
      revisionCalls.map((input) => createAndActivateInvestingPlanRevisionForAccountV1(input)),
    );
    const revisionWinnerIndex = revisionResults.findIndex((result) => result.ok);
    const revisionLoserIndex = revisionResults.findIndex((result) => !result.ok);
    expect(revisionWinnerIndex).toBeGreaterThanOrEqual(0);
    expect(revisionLoserIndex).toBeGreaterThanOrEqual(0);
    expect(revisionResults.filter((result) => result.ok)).toHaveLength(1);
    expect(revisionResults.filter((result) => !result.ok)).toHaveLength(1);
    const revisionWinner = revisionResults[revisionWinnerIndex]!;
    const revisionLoser = revisionResults[revisionLoserIndex]!;
    if (!revisionWinner.ok || revisionLoser.ok) throw new Error("I4 stale-writer split is invalid");
    expect(revisionWinner.activeVersion).toBe("2");
    expect("code" in revisionLoser ? revisionLoser.code : null).toBe("CONFLICT");

    const winnerInput = revisionCalls[revisionWinnerIndex]!;
    const winnerReplay = await createAndActivateInvestingPlanRevisionForAccountV1(winnerInput);
    expect(winnerReplay).toEqual({ ...revisionWinner, replayed: true });

    const historicalInitReplay = await initializeInvestingPlanForAccountV1(initInput);
    expect(historicalInitReplay).toEqual({ ...initialPlan, replayed: true });

    const activeAfterHistoricalReplay = await adminClient.query<{ active_plan_revision_id: string; active_version: string }>(
      "select active_plan_revision_id::text, active_version::text from investing.plan_roots where plan_root_id=$1",
      [initialPlan.planRootId],
    );
    expect(activeAfterHistoricalReplay.rows[0]).toEqual({
      active_plan_revision_id: revisionWinner.planRevisionId,
      active_version: "2",
    });

    const materialConflict = await createAndActivateInvestingPlanRevisionForAccountV1({
      ...winnerInput,
      content: changedConflictContent,
    });
    expect(materialConflict).toEqual({ ok: false, code: "CONFLICT" });

    const conflictAudits = await adminClient.query<{ count: string }>(
      "select count(*)::text as count from investing.audit_events where action='PLAN_MUTATION_CONFLICT' and account_id=$1",
      [bootstrap.accountId],
    );
    expect(Number(conflictAudits.rows[0]!.count)).toBeGreaterThanOrEqual(2);

    const storedPlanTruth = await adminClient.query<{ revision_count: string; all_not_supplied: boolean }>(`
      select count(*)::text as revision_count,
             bool_and(position('state=SUPPLIED' in convert_from(canonical_content_bytes, 'UTF8')) = 0) as all_not_supplied
      from investing.plan_revisions
      where account_id=$1
    `, [bootstrap.accountId]);
    expect(storedPlanTruth.rows[0]).toEqual({ revision_count: "2", all_not_supplied: true });

    currentSubject = primarySubject;
    const researchContext = await resolveAuthorizedResearchInvestigationCreateContext({
      sourceContext: "PURE_RESEARCH",
      tenantId: bootstrap.tenantId,
      correlationId: "corr-cumulative-i5-research-context",
    });
    expect(researchContext.ok).toBe(true);
    if (researchContext.ok !== true) throw new Error("I5 research authority after repair failed");
    const researchAuthorizedContext =
      researchContext.context as AuthorizedResearchInvestigationCreateContext;

    const researchCreateInput = {
      authorizedContext: researchAuthorizedContext,
      idempotencyKey: "idem-cumulative-i5-investigation-01",
      correlationId: "corr-cumulative-i5-investigation-01",
    };
    const investigation = await createResearchInvestigationV1(researchCreateInput);
    expect(investigation.ok).toBe(true);
    if (investigation.ok !== true) throw new Error("I5 investigation create after repair failed");
    expect(investigation.replayed).toBe(false);

    const investigationRow = await adminClient.query<{
      tenant_id: string;
      account_id: string | null;
      principal_id: string;
      operation: string;
      capability: string;
      source_context: string;
      material_request_hash: string;
      idempotency_record_id: string;
    }>(
      `select tenant_id::text, account_id::text, principal_id::text, operation, capability, source_context,
              material_request_hash, idempotency_record_id::text
       from investing.research_investigations
       where research_investigation_id=$1`,
      [investigation.investigationId],
    );
    expect(investigationRow.rows).toEqual([{
      tenant_id: bootstrap.tenantId,
      account_id: null,
      principal_id: bootstrap.principalId,
      operation: "RESEARCH_INVESTIGATION_CREATE_V1",
      capability: "RESEARCH_MUTATE",
      source_context: "PURE_RESEARCH",
      material_request_hash: investigation.materialRequestHash,
      idempotency_record_id: investigation.idempotencyRecordId,
    }]);

    const investigationReplay = await createResearchInvestigationV1(researchCreateInput);
    expect(investigationReplay).toEqual({ ...investigation, replayed: true });

    const draftContext = await resolveAuthorizedResearchDraftCreateContext({
      researchInvestigationId: investigation.investigationId,
      correlationId: "corr-cumulative-i5-draft-context",
    });
    expect(draftContext.ok).toBe(true);
    if (draftContext.ok !== true) throw new Error(`I5 draft authority after repair failed: ${JSON.stringify(draftContext)}`);
    const draftCreate = await createResearchDraftV1({
      authorizedContext: draftContext.context as AuthorizedResearchDraftCreateContext,
      draft: {
        schemaVersion: "RESEARCH_DRAFT_HASH_PAYLOAD_V1",
        rawIntent: "Cumulative repair PG17 draft probe.",
        interpretedObjective: { state: "USER_SUPPLIED", value: "Verify research draft create after cumulative repair." },
        constraints: [{ state: "USER_SUPPLIED", value: "PURE_RESEARCH tenant-scoped probe." }],
      },
      idempotencyKey: "idem-cumulative-i5-draft-01",
      correlationId: "corr-cumulative-i5-draft-01",
    });
    expect(draftCreate.ok).toBe(true);
    if (draftCreate.ok !== true) throw new Error(`I5 draft create after repair failed: ${JSON.stringify(draftCreate)}`);
    expect(draftCreate.replayed).toBe(false);

    const executableRunInput = await seedExecutableRunInputForCumulative(adminClient, {
      tenantId: bootstrap.tenantId,
      principalId: bootstrap.principalId,
      tenantMembershipId: bootstrap.tenantMembershipId,
      researchInvestigationId: investigation.investigationId,
    });
    const materialBytes = new Map<string, Buffer>([
      [hashDatasetSeriesV1(executableRunInput.fixture.aaa.series), executableRunInput.fixture.aaa.bytes],
      [hashDatasetSeriesV1(executableRunInput.fixture.bbb.series), executableRunInput.fixture.bbb.bytes],
    ]);
    const researchExecution = await executeResearchRunCommandV1({
      researchInvestigationId: investigation.investigationId,
      runInputIdentityId: executableRunInput.runInputIdentityId,
      correlationId: "corr-cumulative-i5-execution-01",
      datasetMaterialProvider: {
        loadSeriesContent: async (seriesRef) => materialBytes.get(seriesRef.hashHex) ?? null,
      },
    });
    expect(researchExecution.ok).toBe(true);
    if (researchExecution.ok !== true) throw new Error(`I5 execution after repair failed: ${JSON.stringify(researchExecution)}`);
    const evidenceCountAfterExecution = await adminClient.query<{ count: string }>(
      "select count(*)::text as count from investing.research_evidence_objects_scientific_identities where result_identity_id=$1",
      [researchExecution.resultIdentityId],
    );
    expect(Number(evidenceCountAfterExecution.rows[0]!.count)).toBeGreaterThan(0);

    currentSubject = secondarySubject;
    const secondaryBootstrap = await bootstrapInitialPersonalInvestingAccount({
      idempotencyKey: "idem-i0-i4-bootstrap-0002",
      correlationId: "corr-i0-i4-bootstrap-0002",
      baseCurrency: "EUR",
    });
    expect(secondaryBootstrap.ok).toBe(true);
    if (secondaryBootstrap.ok !== true) throw new Error("secondary bootstrap failed");

    const crossAccount = await createAndActivateInvestingPlanRevisionForAccountV1({
      accountId: secondaryBootstrap.accountId,
      planRootId: initialPlan.planRootId,
      expectedActiveRevisionId: revisionWinner.planRevisionId,
      expectedActiveVersion: "2",
      idempotencyKey: "idem-i0-i4-cross-account-01",
      correlationId: "corr-i0-i4-cross-account-01",
      content: allNotSuppliedContent,
    });
    expect(crossAccount.ok).toBe(false);

    const firstRootStillOwned = await adminClient.query<{ account_id: string; active_plan_revision_id: string; active_version: string }>(
      "select account_id::text, active_plan_revision_id::text, active_version::text from investing.plan_roots where plan_root_id=$1",
      [initialPlan.planRootId],
    );
    expect(firstRootStillOwned.rows[0]).toEqual({
      account_id: bootstrap.accountId,
      active_plan_revision_id: revisionWinner.planRevisionId,
      active_version: "2",
    });

    currentSubject = primarySubject;
    const denialContextResult = await resolveAuthorizedInvestingAccountContext({
      accountId: bootstrap.accountId,
      correlationId: "corr-i0-i4-denial-context",
    });
    expect(denialContextResult.ok).toBe(true);
    if (denialContextResult.ok !== true) throw new Error("denial context resolution failed");

    await adminClient.query(
      "update investing.principals set state='DISABLED', disabled_at=transaction_timestamp() where principal_id=$1",
      [bootstrap.principalId],
    );
    const writerDenial = await initializePlanV1({
      authorizedContext: denialContextResult.context,
      idempotencyKey: "idem-i0-i4-plan-denial-01",
      correlationId: "corr-i0-i4-plan-denial-01",
      content: allNotSuppliedContent,
    });
    expect(writerDenial).toEqual({ ok: false, code: "PRINCIPAL_DISABLED" });

    const researchDisabledDenial = await resolveAuthorizedResearchInvestigationCreateContext({
      sourceContext: "PURE_RESEARCH",
      tenantId: bootstrap.tenantId,
      correlationId: "corr-cumulative-i5-disabled-denial",
    });
    expect(researchDisabledDenial).toEqual({
      ok: false,
      code: "PRINCIPAL_DISABLED",
      externalCode: "FORBIDDEN_OR_NOT_FOUND",
    });
    const draftDisabledDenial = await resolveAuthorizedResearchDraftCreateContext({
      researchInvestigationId: investigation.investigationId,
      correlationId: "corr-cumulative-i5-draft-disabled-denial",
    });
    expect(draftDisabledDenial).toEqual({
      ok: false,
      code: "PRINCIPAL_DISABLED",
      externalCode: "FORBIDDEN_OR_NOT_FOUND",
    });

    const denialAudit = await adminClient.query<{ count: string }>(
      `select count(*)::text as count from investing.audit_events
       where action='AUTHORITY_ACCESS_DENIED' and reason_code='PRINCIPAL_DISABLED' and account_id=$1`,
      [bootstrap.accountId],
    );
    expect(Number(denialAudit.rows[0]!.count)).toBeGreaterThanOrEqual(1);

    let serviceRoleDenied = false;
    await adminClient.query("begin");
    try {
      await adminClient.query("set local role service_role");
      await adminClient.query("select plan_root_id from investing.plan_roots limit 1");
    } catch (error) {
      serviceRoleDenied = (error as { code?: string }).code === "42501";
    } finally {
      await adminClient.query("rollback");
    }
    expect(serviceRoleDenied).toBe(true);

    let serviceRoleResearchDenied = false;
    await adminClient.query("begin");
    try {
      await adminClient.query("set local role service_role");
      await adminClient.query("select research_investigation_id from investing.research_investigations limit 1");
    } catch (error) {
      serviceRoleResearchDenied = (error as { code?: string }).code === "42501";
    } finally {
      await adminClient.query("rollback");
    }
    expect(serviceRoleResearchDenied).toBe(true);

    const rls = await adminClient.query<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(`
      select c.relname, c.relrowsecurity, c.relforcerowsecurity
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid=c.relnamespace
      where n.nspname='investing'
        and c.relname in ('plan_roots','plan_revisions','plan_revision_success_audit_bindings')
      order by c.relname
    `);
    expect(rls.rows).toHaveLength(3);
    expect(rls.rows.every((row) => row.relrowsecurity && row.relforcerowsecurity)).toBe(true);

    const financialAfterPlan = await financialSnapshot();
    expect(financialAfterPlan).toEqual(financialBeforePlan);

    const finalOperations = await adminClient.query<{ operations: string[] }>(`
      select coalesce(array_agg(m.token order by m.token), array[]::text[]) as operations
      from pg_catalog.pg_constraint con
      join pg_catalog.pg_class c on c.oid = con.conrelid
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      cross join lateral pg_catalog.regexp_matches(
        pg_catalog.pg_get_constraintdef(con.oid, true),
        '''([A-Z0-9_]+)''',
        'g'
      ) as raw_match
      cross join lateral (select raw_match[1]::text as token) as m
      where n.nspname = 'investing'
        and c.relname = 'idempotency_records'
        and con.conname = 'idempotency_records_operation_check'
    `);
    expect(finalOperations.rows[0]!.operations).toEqual([...expectedFinalIdempotencyOperations]);

    const auditPolicies = await adminClient.query<{
      tablename: string;
      policyname: string;
      permissive: string;
      cmd: string;
      roles: string[];
      qual: string | null;
      with_check: string | null;
    }>(`
      select tablename, policyname, permissive, cmd, roles::text[] as roles, qual, with_check
      from pg_catalog.pg_policies
      where schemaname = 'investing'
        and tablename = 'audit_events'
      order by tablename, policyname
    `);
    expect(auditPolicies.rows).toHaveLength(expectedFinalAuditPolicies.length);
    for (const expected of expectedFinalAuditPolicies) {
      const actual = auditPolicies.rows.find((policy) => policy.policyname === expected.policyname);
      expect(actual, expected.policyname).toBeDefined();
      expect(actual).toMatchObject({
        tablename: expected.tablename,
        policyname: expected.policyname,
        permissive: expected.permissive,
        cmd: expected.cmd,
        roles: expected.roles,
      });
      expect(actual!.qual === null).toBe(expected.cmd === "INSERT");
      expect(actual!.with_check === null).toBe(expected.cmd === "SELECT");
      const qual = actual!.qual ?? "";
      const withCheck = actual!.with_check ?? "";
      for (const marker of expected.qualMarkers) expect(qual).toContain(marker);
      for (const marker of expected.checkMarkers) expect(withCheck).toContain(marker);
    }

    const allInvestingTables = await adminClient.query<{ count: string; protected_count: string }>(`
      select count(*)::text as count,
             count(*) filter (where c.relrowsecurity and c.relforcerowsecurity)::text as protected_count
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'investing'
        and c.relkind in ('r', 'p')
    `);
    expect(Number(allInvestingTables.rows[0]!.count)).toBeGreaterThan(0);
    expect(allInvestingTables.rows[0]!.protected_count).toBe(allInvestingTables.rows[0]!.count);

    let invalidTransitionRejected = false;
    await adminClient.query("begin");
    try {
      await adminClient.query(
        `insert into investing.research_execution_run_events
          (research_execution_run_event_id, research_execution_run_id, tenant_id, account_id, principal_id,
           tenant_membership_id, operation, capability, operation_scope, source_context, event_sequence, run_status)
         values
          (gen_random_uuid(), gen_random_uuid(), $1, null, $2, $3,
           'RESEARCH_EXECUTION_RUN_V1', 'RESEARCH_EXECUTE', 'TENANT_SCOPE', 'PURE_RESEARCH', 2, 'STARTED')`,
        [bootstrap.tenantId, bootstrap.principalId, bootstrap.tenantMembershipId],
      );
    } catch (error) {
      invalidTransitionRejected = /missing previous research execution run event|invalid research execution/i.test(String((error as Error).message));
    } finally {
      await adminClient.query("rollback");
    }
    expect(invalidTransitionRejected).toBe(true);

    const evidenceRow = await adminClient.query<{ evidence_identity_id: string }>(
      "select evidence_identity_id::text from investing.research_evidence_objects_scientific_identities where result_identity_id=$1",
      [researchExecution.resultIdentityId],
    );
    expect(evidenceRow.rows.length).toBeGreaterThan(0);

    let evidenceUpdateRejected = false;
    await adminClient.query("begin");
    try {
      await adminClient.query(
        "update investing.research_evidence_objects_scientific_identities set descriptor_kind = descriptor_kind where evidence_identity_id=$1",
        [evidenceRow.rows[0]!.evidence_identity_id],
      );
    } catch (error) {
      evidenceUpdateRejected = /research evidence objects are append-only/i.test(String((error as Error).message));
    } finally {
      await adminClient.query("rollback");
    }
    expect(evidenceUpdateRejected).toBe(true);

    let evidenceDeleteRejected = false;
    await adminClient.query("begin");
    try {
      await adminClient.query(
        "delete from investing.research_evidence_objects_scientific_identities where evidence_identity_id=$1",
        [evidenceRow.rows[0]!.evidence_identity_id],
      );
    } catch (error) {
      evidenceDeleteRejected = /research evidence objects are append-only/i.test(String((error as Error).message));
    } finally {
      await adminClient.query("rollback");
    }
    expect(evidenceDeleteRejected).toBe(true);

    const securityDefiners = await adminClient.query<{
      proname: string;
      owner_name: string;
      language_name: string;
      return_type: string;
      proconfig: string[] | null;
      trigger_name: string;
      trigger_relation: string;
      tgtype: number;
      public_execute: boolean;
      anon_execute: boolean;
      authenticated_execute: boolean;
      service_role_execute: boolean;
      investing_app_execute: boolean;
      function_def: string;
    }>(`
      select
        p.proname,
        owner_role.rolname as owner_name,
        l.lanname as language_name,
        p.prorettype::regtype::text as return_type,
        p.proconfig,
        t.tgname as trigger_name,
        c.relname as trigger_relation,
        t.tgtype::int as tgtype,
        pg_catalog.has_function_privilege('public', p.oid, 'EXECUTE') as public_execute,
        pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
        pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
        pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_execute,
        pg_catalog.has_function_privilege('investing_app', p.oid, 'EXECUTE') as investing_app_execute,
        pg_catalog.pg_get_functiondef(p.oid) as function_def
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      join pg_catalog.pg_roles owner_role on owner_role.oid = p.proowner
      join pg_catalog.pg_language l on l.oid = p.prolang
      join pg_catalog.pg_trigger t on t.tgfoid = p.oid and not t.tgisinternal
      join pg_catalog.pg_class c on c.oid = t.tgrelid
      where n.nspname = 'investing'
        and p.prosecdef
      order by p.proname
    `);
    expect(securityDefiners.rows.map((row) => row.proname)).toEqual(
      expectedSecurityDefinerFunctions.map((fn) => fn.proname).sort(),
    );
    for (const expected of expectedSecurityDefinerFunctions) {
      const actual = securityDefiners.rows.find((row) => row.proname === expected.proname);
      expect(actual, expected.proname).toBeDefined();
      expect(actual).toMatchObject({
        owner_name: expected.owner,
        language_name: expected.language,
        return_type: expected.returnType,
        proconfig: expected.searchPath,
        trigger_name: expected.triggerName,
        trigger_relation: expected.triggerRelation,
        tgtype: expected.tgtype,
        public_execute: false,
        anon_execute: false,
        authenticated_execute: false,
        service_role_execute: false,
        investing_app_execute: false,
      });
      expect(actual!.function_def).toContain(expected.bodyMarker);
    }

    const sharedRoleGrants = await adminClient.query<{ count: string }>(`
      select count(*)::text as count
      from information_schema.role_table_grants
      where table_schema = 'investing'
        and lower(grantee) in ('anon', 'authenticated', 'service_role', 'public')
    `);
    expect(sharedRoleGrants.rows[0]!.count).toBe("0");
  }, 120_000);
});
