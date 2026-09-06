import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Pool, type PoolClient } from "pg";
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
  type AuthorizedInvestingContext,
  type InvestingAuthorityDatabase,
  type InvestingAuthorityTransactionClient,
} from "../lib/investing/authority/context";
import { accountSyntheticI3Fill } from "../lib/investing/accounting/syntheticFill";
import {
  createAndActivateInvestingPlanRevisionForAccountV1,
  initializeInvestingPlanForAccountV1,
} from "../lib/investing/plan/service";
import {
  initializePlanV1,
  type PlanContentV1,
} from "../lib/investing/plan/writer";
import { renderI4cPlanWriterPg17Candidate } from "../lib/investing/plan/pg17Hardening";

const repoRoot = path.resolve(__dirname, "..");
const connectionString = process.env.PG17_REHEARSAL_URL ?? "";
const demoProjectRef = "local-pg17";
const primarySubject = "user_pg17_i0_i4_primary";
const secondarySubject = "user_pg17_i0_i4_secondary";

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

let adminPool: Pool;
let adminClient: PoolClient;
let currentSubject = primarySubject;

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

function createAuthorityDatabase(): InvestingAuthorityDatabase {
  return {
    connect: async () => {
      const client = await adminPool.connect();
      await client.query("reset all");
      await client.query("set role investing_app");
      const adapter: InvestingAuthorityTransactionClient = {
        query: async <Row = Record<string, unknown>>(text: string, values: readonly unknown[] = []) => {
          const result = await client.query<Row>(text, [...values]);
          return { rows: result.rows, rowCount: result.rowCount };
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

beforeAll(async () => {
  if (!connectionString) throw new Error("PG17_REHEARSAL_URL is required");
  adminPool = new Pool({ connectionString, max: 16 });
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

describe("Investing Genesis I0 -> I4 complete PostgreSQL 17 rehearsal", () => {
  it("replays the canonical lineage and exercises authority, accounting, concurrency, Plan CAS, replay, audit and isolation", async () => {
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

    const bootstrap = await bootstrapInitialPersonalInvestingAccount({
      idempotencyKey: "idem-i0-i4-bootstrap-0001",
      correlationId: "corr-i0-i4-bootstrap-0001",
      baseCurrency: "EUR",
    });
    expect(bootstrap.ok).toBe(true);
    if (!bootstrap.ok) throw new Error(`I2 bootstrap failed: ${bootstrap.code}`);
    expect(bootstrap.replayed).toBe(false);

    const bootstrapReplay = await bootstrapInitialPersonalInvestingAccount({
      idempotencyKey: "idem-i0-i4-bootstrap-0001",
      correlationId: "corr-i0-i4-bootstrap-0001",
      baseCurrency: "EUR",
    });
    expect(bootstrapReplay).toEqual({ ...bootstrap, replayed: true });

    const authorityBeforeI3 = await resolveAuthorizedInvestingAccountContext({
      accountId: bootstrap.accountId,
      correlationId: "corr-i0-i4-authority-0001",
    });
    expect(authorityBeforeI3.ok).toBe(true);
    if (!authorityBeforeI3.ok) throw new Error(`I2 authority resolve failed: ${authorityBeforeI3.code}`);
    expect(isAuthorizedInvestingContext(authorityBeforeI3.context)).toBe(true);

    await seedInitialPaperCashFunding(authorityBeforeI3.context, "100000");

    for (const [relativePath, expectedSha] of canonicalFiles.slice(9, 13)) {
      await applyCanonical(relativePath, expectedSha);
    }

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
    if (!authority.ok) throw new Error(`I3 authority resolve failed: ${authority.code}`);
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
    expect(buy.ok).toBe(true);
    if (!buy.ok) throw new Error(`I3 BUY failed: ${buy.code}`);
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

    await applyCanonical(canonicalFiles[13][0], canonicalFiles[13][1]);

    const frozenWriterPath = "docs/investing-genesis/sql/I4C_PLAN_WRITER_CANDIDATE.sql";
    const frozenWriterSql = readCanonical(frozenWriterPath, "d30a02d36acbac46446e7a8eb5bc0ab577f6f3ca");
    const hardenedWriter = renderI4cPlanWriterPg17Candidate(frozenWriterSql);
    expect(hardenedWriter.replacements).toBe(4);
    try {
      await adminClient.query(hardenedWriter.sql);
    } catch (error) {
      await adminClient.query("rollback").catch(() => undefined);
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`PG17 apply failed for hardened I4-C writer: ${message}`);
    }

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
    if (!initialPlan.ok) throw new Error(`I4 initialize failed: ${initialPlan.code}`);
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
    expect(revisionLoser.code).toBe("CONFLICT");

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

    currentSubject = secondarySubject;
    const secondaryBootstrap = await bootstrapInitialPersonalInvestingAccount({
      idempotencyKey: "idem-i0-i4-bootstrap-0002",
      correlationId: "corr-i0-i4-bootstrap-0002",
      baseCurrency: "EUR",
    });
    expect(secondaryBootstrap.ok).toBe(true);
    if (!secondaryBootstrap.ok) throw new Error(`secondary bootstrap failed: ${secondaryBootstrap.code}`);

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
    if (!denialContextResult.ok) throw new Error(`denial context resolution failed: ${denialContextResult.code}`);

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
  }, 120_000);
});
