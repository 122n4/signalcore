import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..");
const migrationPath = path.join(
  repoRoot,
  "supabase",
  "migrations",
  "20260831221500_investing_genesis_i2_ledger_schema.sql",
);

function readMigration() {
  return fs.readFileSync(migrationPath, "utf8");
}

function stripSqlComments(sql: string) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--.*$/gm, "");
}

function normalizeSql(sql: string) {
  return stripSqlComments(sql).replace(/\s+/g, " ").trim().toLowerCase();
}

function policySlice(sql: string, policyName: string) {
  const normalized = normalizeSql(sql);
  const marker = `create policy ${policyName.toLowerCase()}`;
  const start = normalized.indexOf(marker);
  if (start < 0) return "";
  const end = normalized.indexOf(";", start);
  return end < 0 ? normalized.slice(start) : normalized.slice(start, end + 1);
}

describe("Investing Genesis I2 Ledger Schema", () => {
  it("keeps the canonical parent contract narrow and does not introduce runtime/database authority shortcuts", () => {
    const normalized = normalizeSql(readMigration());

    expect(normalized).toContain("current_user <> 'postgres'");
    expect(normalized).toContain("investing_app must have select on idempotency_records");
    expect(normalized).toContain("canonical i2-a idempotency lifecycle update columns mismatch");
    expect(normalized).toContain("set local role investing_owner");
    expect(normalized).toContain("reset role");

    expect(normalized).not.toContain("security definer");
    expect(normalized).not.toMatch(/\bgrant all\b/);
    expect(normalized).not.toMatch(/\bgrant\b[^;]*\bto service_role\b/);
    expect(normalized).not.toMatch(/\bgrant\b[^;]*\bto anon\b/);
    expect(normalized).not.toMatch(/\bgrant\b[^;]*\bto authenticated\b/);
    expect(normalized).not.toMatch(/\bgrant\s+update\b[^;]*\binvesting\.idempotency_records\b/);
    expect(normalized).not.toContain("service_role is authorization");
    expect(normalized).not.toContain("trading.");
    expect(normalized).not.toContain("rehearsal");
  });

  it("keeps the four ledger tables investing_owner-owned, FORCE RLS, and runtime SELECT+INSERT only", () => {
    const normalized = normalizeSql(readMigration());
    const tables = [
      "ledger_accounts",
      "ledger_transactions",
      "ledger_postings",
      "ledger_transaction_seals",
    ];

    for (const table of tables) {
      expect(normalized).toContain(`create table investing.${table}`);
      expect(normalized).toContain(`alter table investing.${table} enable row level security`);
      expect(normalized).toContain(`alter table investing.${table} force row level security`);
      expect(normalized).toContain(`grant select, insert on table investing.${table} to investing_app`);
    }

    expect(normalized).toContain("investing_app must have exactly select+insert on four ledger tables");
    expect(normalized).toContain("ledger tables must not expose column-level mutation grants");
  });

  it("preserves financial storage and initial-funding semantic invariants", () => {
    const normalized = normalizeSql(readMigration());

    expect(normalized).toContain("amount numeric(24, 8) not null");
    expect(normalized).toContain("check (amount > 0)");
    expect(normalized).toContain("transaction_kind = 'initial_paper_cash_funding'");
    expect(normalized).toContain("source = 'user_declared_paper_capital'");
    expect(normalized).toContain("value_origin = 'simulated'");
    expect(normalized).toContain("freshness = 'not_applicable'");
    expect(normalized).toContain("ledger_transactions_initial_funding_semantic_idx");
    expect(normalized).toContain("ledger_accounts_singleton_type_idx");
    expect(normalized).toContain("cash_asset");
    expect(normalized).toContain("simulated_capital");
  });

  it("keeps the append-only seal model and the idempotency-row mutex", () => {
    const normalized = normalizeSql(readMigration());

    expect(normalized).toContain("create constraint trigger ledger_transactions_require_exactly_one_seal");
    expect(normalized).toContain("deferrable initially deferred");
    expect(normalized).toContain("i2 ledger posting is append-only and cannot be updated or deleted");
    expect(normalized).toContain("i2 ledger transaction seal is append-only and cannot be updated or deleted");
    expect(normalized).toMatch(/from investing\.idempotency_records ir[^;]*for update/);
    expect(normalized).not.toMatch(/from investing\.ledger_transactions[^;]*for update/);
  });

  it("adds exactly one I2 ledger UPDATE policy for locking and no new UPDATE grant", () => {
    const sql = readMigration();
    const normalized = normalizeSql(sql);
    const lockPolicy = policySlice(sql, "idempotency_records_i2_ledger_lock");

    expect(lockPolicy).toContain("for update to investing_app");
    expect(lockPolicy).toContain("with check (false)");
    expect(lockPolicy).toContain("initial_paper_cash_funding");
    expect(lockPolicy).toContain("ledger_write");
    expect(lockPolicy).toContain("actor_kind = 'user_principal'");
    expect(lockPolicy).toContain("operation_scope = 'account_scope'");
    expect(lockPolicy).toContain("status = 'started'");
    expect(lockPolicy).toContain("aa.role = 'owner'");
    expect(lockPolicy).toContain("aa.state = 'active'");
    expect(lockPolicy).toContain("tm.role = 'owner'");
    expect(lockPolicy).toContain("tm.state = 'active'");
    expect(lockPolicy).toContain("a.state = 'active'");
    expect(lockPolicy).toContain("t.state = 'active'");
    expect(lockPolicy).toContain("p.state = 'active'");

    expect(normalized).not.toMatch(/\bgrant\s+update\b[^;]*\bon table investing\.idempotency_records\b/);
    expect(normalized).not.toMatch(/\bgrant\s+update\s*\([^)]*\)\s+on table investing\.idempotency_records\b/);
  });

  it("makes lock-policy USING database-verified identical to the I2 ledger read policy and WITH CHECK unconditionally false", () => {
    const normalized = normalizeSql(readMigration());

    expect(normalized).toContain("idempotency_records_i2_ledger_lock");
    expect(normalized).toContain("read_pol.polname = 'idempotency_records_i2_ledger_read'");
    expect(normalized).toContain("lock_pol.polname = 'idempotency_records_i2_ledger_lock'");
    expect(normalized).toContain("lock_pol.polcmd = 'w'");
    expect(normalized).toContain("pg_catalog.pg_get_expr(lock_pol.polqual, lock_pol.polrelid) = pg_catalog.pg_get_expr(read_pol.polqual, read_pol.polrelid)");
    expect(normalized).toContain("pg_catalog.pg_get_expr(lock_pol.polwithcheck, lock_pol.polrelid) = 'false'");
    expect(normalized).toContain("expected exactly 10 investing_app ledger policies");
  });

  it("pins the pre-existing I2-A idempotency lifecycle UPDATE surface instead of widening it", () => {
    const normalized = normalizeSql(readMigration());

    expect(normalized).toContain("investing_app must not have table-level update on idempotency_records");
    expect(normalized).toContain("canonical_result_reference");
    expect(normalized).toContain("completed_at");
    expect(normalized).toContain("error_code");
    expect(normalized).toContain("status");
    expect(normalized).toContain("updated_at");
    expect(normalized).toContain("idempotency lifecycle update columns drifted");
  });

  it("retains exact malformed-state guards needed for the PostgreSQL rehearsal", () => {
    const normalized = normalizeSql(readMigration());

    expect(normalized).toContain("i2 ledger transaction cannot commit without exactly one immutable seal");
    expect(normalized).toContain("i2 ledger seal rejected invalid initial_paper_cash_funding posting shape");
    expect(normalized).toContain("i2 ledger posting cannot be appended after transaction seal");
    expect(normalized).toContain("i2 ledger account immutable identity/economic fields cannot change");
    expect(normalized).toContain("i2 closed ledger account cannot be updated or reopened");
  });
});
