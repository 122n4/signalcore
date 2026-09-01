import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..");
const candidatePath = path.join(
  repoRoot,
  "docs",
  "investing-genesis",
  "sql",
  "I3A_ACCOUNTING_FOUNDATIONS_CANDIDATE.sql",
);

function readCandidate() {
  return fs.readFileSync(candidatePath, "utf8");
}

function stripSqlComments(sql: string) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--.*$/gm, "");
}

function normalizeSql(sql: string) {
  return stripSqlComments(sql).replace(/\s+/g, " ").trim().toLowerCase();
}

describe("Investing Genesis I3-A accounting foundations source candidate", () => {
  it("is explicitly source-only and does not pretend to be an applied Supabase migration", () => {
    const raw = readCandidate();
    const normalized = normalizeSql(raw);

    expect(raw).toContain("SOURCE CANDIDATE ONLY. THIS FILE IS NOT A SUPABASE MIGRATION.");
    expect(raw).toContain("Canonical parent: 33dddc730885b9940f3321dfff3d21562d3410a2");
    expect(raw).toContain("Design core:      6acabcaddf3135138c8194a84dd7d9798a133923");
    expect(raw).toContain("Do not copy this file into supabase/migrations under an invented timestamp.");

    expect(normalized).not.toContain("security definer");
    expect(normalized).not.toContain("trading.");
    expect(normalized).not.toMatch(/\bgrant all\b/);
    expect(normalized).not.toMatch(/\bgrant\b[^;]*\bto service_role\b/);
    expect(normalized).not.toMatch(/\bgrant\b[^;]*\bto anon\b/);
    expect(normalized).not.toMatch(/\bgrant\b[^;]*\bto authenticated\b/);
    expect(normalized).not.toMatch(/\bgrant\b[^;]*\bto investing_app\b/);
  });

  it("creates only the closed I3-A table inventory and leaves Position derived", () => {
    const normalized = normalizeSql(readCandidate());
    const tables = [
      "i3_instruments",
      "i3_accounting_mutexes",
      "i3_accounting_genesis_anchors",
      "i3_fills",
      "i3_acquisition_lot_origins",
      "i3_accounting_revisions",
      "i3_lot_consumption_allocations",
      "i3_accounting_revision_seals",
    ];

    for (const table of tables) {
      expect(normalized).toContain(`create table investing.${table}`);
      expect(normalized).toContain(`alter table investing.${table} enable row level security`);
      expect(normalized).toContain(`alter table investing.${table} force row level security`);
      expect(normalized).toContain(`revoke all on table investing.${table} from public, anon, authenticated, service_role, investing_app`);
    }

    expect(normalized).not.toContain("create table investing.i3_positions");
    expect(normalized).not.toContain("create table investing.positions");
    expect(normalized).toContain("unexpected i3 table inventory");
  });

  it("extends only the idempotency vocabulary needed by the future internal paper-fill operation", () => {
    const normalized = normalizeSql(readCandidate());

    expect(normalized).toContain("'initial_personal_bootstrap'");
    expect(normalized).toContain("'initial_paper_cash_funding'");
    expect(normalized).toContain("'i3_internal_paper_fill_accounting_v1'");
    expect(normalized).toContain("canonical i2 idempotency operation vocabulary is missing or unexpected");
    expect(normalized).toContain("i3 idempotency operation vocabulary missing");

    expect(normalized).not.toContain("create policy");
    expect(normalized).toContain("i3 runtime rls policies must not exist before the atomic writer slice");
    expect(normalized).toContain("i3 tables expose runtime/shared privileges before atomic writer slice");
  });

  it("pins bounded decimal persistence and a fail-closed no-implicit-rounding V1", () => {
    const normalized = normalizeSql(readCandidate());

    expect(normalized).toContain("quantity numeric(28, 8) not null");
    expect(normalized).toContain("unit_price numeric(24, 8) not null");
    expect(normalized).toContain("gross_consideration numeric(24, 8) not null");
    expect(normalized).toContain("fee_amount numeric(24, 8) not null");
    expect(normalized).toContain("allocated_cost_basis numeric(24, 8) not null");
    expect(normalized).toContain("realized_result numeric(24, 8) not null");

    expect(normalized).toContain("pg_catalog.scale(pg_catalog.trim_scale(quantity * unit_price)) <= 8");
    expect(normalized).toContain("gross_consideration = quantity * unit_price");
    expect(normalized).toContain("gross_consideration + fee_amount <= 9999999999999999.99999999::numeric");

    expect(normalized).toContain("i3_is_canonical_quantity_v1");
    expect(normalized).toContain("i3_is_canonical_positive_money_v1");
    expect(normalized).toContain("i3_is_canonical_nonnegative_money_v1");
    expect(normalized).not.toMatch(/\bnumeric\s+not null/);
  });

  it("keeps the initial capability DEMO/SIMULATED, base-currency-only and without implicit FX", () => {
    const normalized = normalizeSql(readCandidate());

    expect(normalized).toContain("source = 'synthetic_i3_rehearsal'");
    expect(normalized).toContain("value_origin = 'simulated'");
    expect(normalized).toContain("freshness = 'not_applicable'");
    expect(normalized).toContain("context = 'demo'");
    expect(normalized).toContain("i3 v1 fill is base-currency-only and implicit fx is forbidden");
    expect(normalized).toContain("i3 v1 fill currency must equal canonical instrument primary currency");
    expect(normalized).not.toContain("value_origin = 'real'");
  });

  it("uses persisted canonical mutex scopes without storing financial truth in the mutex row", () => {
    const normalized = normalizeSql(readCandidate());

    expect(normalized).toContain("account_currency_cash_scope");
    expect(normalized).toContain("account_instrument_accounting_scope");
    expect(normalized).toContain("i3_accounting_mutexes_cash_scope_idx");
    expect(normalized).toContain("i3_accounting_mutexes_instrument_scope_idx");
    expect(normalized).toContain("i3_accounting_mutexes_guard_update_delete");

    const mutexStart = normalized.indexOf("create table investing.i3_accounting_mutexes");
    const mutexEnd = normalized.indexOf("create unique index i3_accounting_mutexes_cash_scope_idx", mutexStart);
    const mutexSlice = normalized.slice(mutexStart, mutexEnd);

    expect(mutexSlice).not.toContain("quantity");
    expect(mutexSlice).not.toContain("cash_balance");
    expect(mutexSlice).not.toContain("pnl");
    expect(mutexSlice).not.toContain("cost_basis");
    expect(mutexSlice).not.toContain("market_value");
  });

  it("anchors KNOWN_ZERO eligibility to the actual account genesis identity and time", () => {
    const normalized = normalizeSql(readCandidate());

    expect(normalized).toContain("i3_accounting_genesis_anchors_one_per_account_key");
    expect(normalized).toContain("origin_operation = 'initial_personal_bootstrap'");
    expect(normalized).toContain("source = 'paper_account_genesis'");
    expect(normalized).toContain("new.principal_id <> v_initial_principal_id");
    expect(normalized).toContain("new.actor_id <> v_external_subject");
    expect(normalized).toContain("new.effective_at <> v_account_created_at");
    expect(normalized).toContain("i3 fill requires a complete canonical accounting genesis anchor");
  });

  it("pins immutable Fill semantic identity and deterministic event ordering evidence", () => {
    const normalized = normalizeSql(readCandidate());

    expect(normalized).toContain("i3_fills_semantic_source_key");
    expect(normalized).toContain("unique (tenant_id, account_id, source, source_reference)");
    expect(normalized).toContain("i3_fills_source_sequence_key");
    expect(normalized).toContain("source_sequence bigint not null");
    expect(normalized).toContain("effective_at, source_sequence, source_reference, fill_id");
    expect(normalized).toContain("operation = 'i3_internal_paper_fill_accounting_v1'");
    expect(normalized).toContain("i3_fills_one_per_idempotency_key");
    expect(normalized).toContain("canonical started idempotency material tuple");
    expect(normalized).toContain("active canonical authority graph");

    expect(normalized).toContain("create trigger i3_fills_guard_insert before insert on investing.i3_fills");
    expect(normalized).toContain("create trigger i3_fills_guard_update_delete before update or delete on investing.i3_fills");
    expect(normalized).not.toContain("before insert or update or delete on investing.i3_fills");
  });

  it("creates one immutable lot origin per BUY and orders FIFO by economic source evidence rather than UUID arrival", () => {
    const normalized = normalizeSql(readCandidate());

    expect(normalized).toContain("i3_acquisition_lot_origins_one_per_buy_key");
    expect(normalized).toContain("i3 acquisition lot origin requires a canonical buy fill");
    expect(normalized).toContain("acquisition_source_sequence bigint not null");
    expect(normalized).toContain("acquisition_source_reference text not null");
    expect(normalized).toContain("new.acquisition_source_sequence <> v_fill.source_sequence");
    expect(normalized).toContain("new.acquisition_source_reference <> v_fill.source_reference");
    expect(normalized).toContain("effective_at, acquisition_source_sequence, acquisition_source_reference, lot_origin_id");
  });

  it("keeps accounting revisions immutable, sealed and linearly superseded without branch escape hatches", () => {
    const normalized = normalizeSql(readCandidate());

    expect(normalized).toContain("revision_kind = 'disposal_fifo_v1'");
    expect(normalized).toContain("methodology_id = 'fifo_v1' and methodology_version = 1");
    expect(normalized).toContain("i3_accounting_revisions_one_root_per_disposal_idx");
    expect(normalized).toContain("i3_accounting_revisions_one_child_per_revision_idx");
    expect(normalized).toContain("must supersede exactly the current sealed canonical leaf");
    expect(normalized).toContain("i3 accounting revision cannot commit without exactly one immutable seal");
    expect(normalized).toContain("deferrable initially deferred");
    expect(normalized).toContain("sealed accounting revision cannot accept later allocations");
  });

  it("reconciles SELL allocation quantity/proceeds/fee and pins exact proportional no-rounding allocation arithmetic", () => {
    const normalized = normalizeSql(readCandidate());

    expect(normalized).toContain("unique (accounting_revision_id, disposal_fill_id, lot_origin_id)");
    expect(normalized).toContain("realized_result = allocated_gross_proceeds - allocated_disposal_fee - allocated_cost_basis");
    expect(normalized).toContain("allocated_cost_basis * v_lot.acquired_quantity <> v_lot_basis * new.consumed_quantity");
    expect(normalized).toContain("allocated_gross_proceeds * v_sell.quantity <> v_sell.gross_consideration * new.consumed_quantity");
    expect(normalized).toContain("allocated_disposal_fee * v_sell.quantity <> v_sell.fee_amount * new.consumed_quantity");
    expect(normalized).toContain("incomplete sell allocation reconciliation");
    expect(normalized).toContain("overconsumed lot origin within revision");
  });

  it("requires each new Fill to have its accounting effect in the same commit but deliberately does not claim ledger atomicity yet", () => {
    const normalized = normalizeSql(readCandidate());

    expect(normalized).toContain("i3 buy fill cannot commit without exactly one acquisition lot origin");
    expect(normalized).toContain("i3 sell fill cannot commit without exactly one sealed initial accounting revision");
    expect(normalized).toContain("create constraint trigger i3_fills_require_accounting_effect");

    expect(normalized).not.toContain("securities_book_cost_asset");
    expect(normalized).not.toContain("trading_fee_expense");
    expect(normalized).not.toContain("realized_gain_loss");
    expect(normalized).not.toContain("dividend_income");
    expect(normalized).not.toContain("select ... for update");
  });
});
