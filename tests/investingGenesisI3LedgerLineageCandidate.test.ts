import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..");
const candidatePath = path.join(
  repoRoot,
  "docs",
  "investing-genesis",
  "sql",
  "I3B_LEDGER_LINEAGE_CANDIDATE_V3.sql",
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

function functionSlice(sql: string, functionName: string) {
  const normalized = normalizeSql(sql);
  const marker = `create function investing.${functionName.toLowerCase()}()`;
  const start = normalized.indexOf(marker);
  if (start < 0) return "";
  const end = normalized.indexOf("$$;", start);
  return end < 0 ? normalized.slice(start) : normalized.slice(start, end + 3);
}

describe("Investing Genesis I3-B V3 ledger lineage source candidate", () => {
  it("is source-only, pinned to the I3 freeze, and records why both predecessors were rejected", () => {
    const raw = readCandidate();
    const normalized = normalizeSql(raw);

    expect(raw).toContain("SOURCE CANDIDATE ONLY. THIS FILE IS NOT A SUPABASE MIGRATION.");
    expect(raw).toContain("Canonical I3 design freeze: 33dddc730885b9940f3321dfff3d21562d3410a2");
    expect(raw).toContain("I3B_LEDGER_VOCABULARY_CANDIDATE.sql");
    expect(raw).toContain("I3B_LEDGER_LINEAGE_CANDIDATE_V2.sql");

    expect(normalized).not.toContain("security definer");
    expect(normalized).not.toContain("trading.");
    expect(normalized).not.toMatch(/\bgrant\b/);
    expect(normalized).not.toMatch(/\bcreate policy\b|\balter policy\b|\bdrop policy\b/);
  });

  it("does not widen ledger_accounts vocabulary before I3-C", () => {
    const normalized = normalizeSql(readCandidate());

    expect(normalized).toContain("ledger_accounts must remain exact i2 vocabulary");
    expect(normalized).toContain("ledger_accounts vocabulary was broadened before i3-c");
    expect(normalized).not.toContain("alter table investing.ledger_accounts drop constraint");
    expect(normalized).not.toContain("add constraint ledger_accounts_semantics_check");

    expect(normalized).not.toContain("ledger_account_type = 'securities_book_cost_asset'");
    expect(normalized).not.toContain("ledger_account_type = 'trading_fee_expense'");
    expect(normalized).not.toContain("ledger_account_type = 'realized_gain_loss'");
    expect(normalized).not.toContain("ledger_account_type = 'dividend_income'");
  });

  it("fails closed unless the exact eight I2 ledger policies still target only investing_app with read/insert commands", () => {
    const normalized = normalizeSql(readCandidate());

    expect(normalized).toContain("expected exactly 8 canonical i2 ledger policies");
    expect(normalized).toContain("canonical i2 ledger policy inventory/role/cmd drifted");
    expect(normalized).toContain("canonical i2 ledger policy inventory/role/cmd changed");
    expect(normalized).toContain("p.polroles = array[v_investing_app_oid]::oid[]");

    for (const policy of [
      "ledger_accounts_i2_ledger_insert",
      "ledger_accounts_i2_ledger_read",
      "ledger_postings_i2_ledger_insert",
      "ledger_postings_i2_ledger_read",
      "ledger_transaction_seals_i2_ledger_insert",
      "ledger_transaction_seals_i2_ledger_read",
      "ledger_transactions_i2_ledger_insert",
      "ledger_transactions_i2_ledger_read",
    ]) {
      expect(normalized).toContain(policy);
    }
  });

  it("pins the existing investing_app ledger ACL to SELECT+INSERT only and keeps shared roles out", () => {
    const normalized = normalizeSql(readCandidate());

    expect(normalized).toContain("not has_table_privilege('investing_app', format('investing.%i', v_table), 'select')");
    expect(normalized).toContain("not has_table_privilege('investing_app', format('investing.%i', v_table), 'insert')");
    expect(normalized).toContain("has_table_privilege('investing_app', format('investing.%i', v_table), 'update')");
    expect(normalized).toContain("has_table_privilege('investing_app', format('investing.%i', v_table), 'delete')");
    expect(normalized).toContain("x.grantee = 0 or r.rolname in ('anon', 'authenticated', 'service_role')");
    expect(normalized).toContain("shared/public role gained ledger privilege");
  });

  it("adds only nullable I3 lineage columns and exact Fill/revision foreign keys to ledger_transactions", () => {
    const normalized = normalizeSql(readCandidate());

    expect(normalized).toContain("add column i3_fill_id uuid");
    expect(normalized).toContain("add column i3_instrument_id uuid");
    expect(normalized).toContain("add column i3_accounting_revision_id uuid");
    expect(normalized).not.toContain("add column i3_fill_id uuid not null");
    expect(normalized).not.toContain("add column i3_instrument_id uuid not null");
    expect(normalized).not.toContain("add column i3_accounting_revision_id uuid not null");
    expect(normalized).toContain("ledger_transactions_i3_fill_fk");
    expect(normalized).toContain("ledger_transactions_i3_accounting_revision_fk");
    expect(normalized).toContain("i3 lineage columns must remain nullable for canonical i2 rows");
  });

  it("opens only closed DEMO/SIMULATED BUY/SELL transaction vocabulary and keeps funding shape intact", () => {
    const normalized = normalizeSql(readCandidate());

    expect(normalized).toContain("'initial_paper_cash_funding'");
    expect(normalized).toContain("'i3_internal_paper_fill_accounting_v1'");
    expect(normalized).toContain("'i3_internal_paper_buy_v1'");
    expect(normalized).toContain("'i3_internal_paper_sell_v1'");
    expect(normalized).toContain("source = 'synthetic_i3_rehearsal'");
    expect(normalized).toContain("value_origin = 'simulated'");
    expect(normalized).toContain("freshness = 'not_applicable'");
    expect(normalized).toContain("context = 'demo'");
    expect(normalized).toContain("transaction_kind = 'initial_paper_cash_funding' and operation = 'initial_paper_cash_funding'");
  });

  it("preserves the accepted I2 no-correction/no-reversal guard instead of replacing it prematurely", () => {
    const normalized = normalizeSql(readCandidate());

    expect(normalized).toContain("ledger_transactions_initial_funding_link_check");
    expect(normalized).toContain("i2 initial-capability reversal/correction guard missing");
    expect(normalized).not.toContain("drop constraint ledger_transactions_initial_funding_link_check");
    expect(normalized).not.toContain("ledger_transactions_initial_capability_link_check");
  });

  it("enforces one I3 ledger transaction per canonical Fill", () => {
    const normalized = normalizeSql(readCandidate());

    expect(normalized).toContain("create unique index ledger_transactions_i3_fill_semantic_idx");
    expect(normalized).toContain("on investing.ledger_transactions (i3_fill_id)");
    expect(normalized).toContain("where transaction_kind in ( 'i3_internal_paper_buy_v1', 'i3_internal_paper_sell_v1' )");
    expect(normalized).toContain("i3 fill semantic uniqueness index missing");
  });

  it("makes BUY/SELL lineage match the exact canonical Fill side and material tuple", () => {
    const guard = functionSlice(readCandidate(), "i3_ledger_transaction_lineage_guard");

    expect(guard).toContain("v_expected_side");
    expect(guard).toContain("v_fill.side <> v_expected_side");
    expect(guard).toContain("v_fill.idempotency_record_id is distinct from new.idempotency_record_id");
    expect(guard).toContain("v_fill.principal_id is distinct from new.principal_id");
    expect(guard).toContain("v_fill.actor_id is distinct from new.actor_id");
    expect(guard).toContain("v_fill.operation is distinct from new.operation");
    expect(guard).toContain("v_fill.correlation_id is distinct from new.correlation_id");
    expect(guard).toContain("v_fill.material_request_hash is distinct from new.material_request_hash");
    expect(guard).toContain("v_fill.effective_at is distinct from new.effective_at");
    expect(guard).toContain("v_fill.source_reference is distinct from new.source_reference");
    expect(guard).toContain("material lineage does not exactly match canonical fill");
  });

  it("requires the initial SELL ledger transaction to reference exactly one sealed root AccountingRevision for that SELL", () => {
    const guard = functionSlice(readCandidate(), "i3_ledger_transaction_lineage_guard");

    expect(guard).toContain("r.accounting_revision_id = new.i3_accounting_revision_id");
    expect(guard).toContain("r.disposal_fill_id = new.i3_fill_id");
    expect(guard).toContain("v_revision.supersedes_accounting_revision_id is not null");
    expect(guard).toContain("must reference the root accountingrevision");
    expect(guard).toContain("v_revision_seal_count <> 1");
    expect(guard).toContain("requires exactly one immutable seal on the referenced root accountingrevision");
  });

  it("keeps the existing I2 funding path fail-stable by returning before any I3 lookup", () => {
    const guard = functionSlice(readCandidate(), "i3_ledger_transaction_lineage_guard");
    const fundingReturn = guard.indexOf("if new.transaction_kind = 'initial_paper_cash_funding' then return new; end if;");
    const fillLookup = guard.indexOf("from investing.i3_fills f");

    expect(fundingReturn).toBeGreaterThanOrEqual(0);
    expect(fillLookup).toBeGreaterThan(fundingReturn);
  });

  it("keeps I3 ledger runtime impossible until I3-C: no new ledger policy/grant and I2 seal guard remains I2-only", () => {
    const normalized = normalizeSql(readCandidate());

    expect(normalized).not.toMatch(/\bcreate policy\b|\balter policy\b|\bdrop policy\b/);
    expect(normalized).not.toMatch(/\bgrant\b/);
    expect(normalized).toContain("i2 ledger transaction insert policy is not closed to funding");
    expect(normalized).toContain("i2 transaction insert policy was widened");
    expect(normalized).toContain("exact i2-only ledger seal guard not found");
    expect(normalized).toContain("i2-only seal guard was unexpectedly relaxed");
    expect(normalized).not.toContain("create or replace function investing.i2_ledger_seal_guard");
    expect(normalized).not.toContain("create function investing.i2_ledger_seal_guard");
  });
});
