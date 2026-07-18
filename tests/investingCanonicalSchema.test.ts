import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260707190000_create_investing_core_tables.sql",
);
const auditMigrationPath = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260717110000_create_investing_audit_tables.sql",
);

describe("investing canonical schema migration", () => {
  const sql = readFileSync(migrationPath, "utf8").toLowerCase();
  const auditSql = readFileSync(auditMigrationPath, "utf8").toLowerCase();

  it("versions the investing runtime sources of truth", () => {
    for (const table of ["user_settings", "plans", "portfolio_items", "daily_snapshots", "journal_entries"]) {
      expect(sql).toContain(`public.${table}`);
      expect(sql).toContain(`create table if not exists public.${table}`);
    }
  });

  it("keeps legacy portfolio tables explicitly marked as compatibility", () => {
    expect(sql).toContain("compatibility tables only");
    expect(sql).toContain("create table if not exists public.portfolios");
    expect(sql).toContain("create table if not exists public.portfolio_meta");
  });

  it("supports the upsert contracts used by the app", () => {
    expect(sql).toContain("portfolio_items_user_mode_symbol_uidx");
    expect(sql).toContain("daily_snapshots_user_mode_day_uidx");
    expect(sql).toContain("portfolios_user_mode_uidx");
  });

  it("enables RLS on all user-owned investing tables", () => {
    for (const table of [
      "user_settings",
      "plans",
      "portfolio_items",
      "daily_snapshots",
      "journal_entries",
      "portfolios",
      "portfolio_meta",
    ]) {
      expect(sql).toContain(`alter table if exists public.${table} enable row level security`);
    }
  });

  it("scopes investing policies to the authenticated JWT subject", () => {
    for (const policy of [
      "user_settings_select_own",
      "plans_select_own",
      "portfolio_items_select_own",
      "daily_snapshots_select_own",
      "journal_entries_select_own",
      "portfolios_select_own",
      "portfolio_meta_select_own",
    ]) {
      expect(sql).toContain(policy);
    }

    expect(sql).toContain("user_id = (auth.jwt() ->> 'sub')");
  });

  it("adds institutional audit tables for mandate snapshots and rebalance ledger", () => {
    expect(auditSql).toContain("create table if not exists public.investing_mandate_snapshots");
    expect(auditSql).toContain("create table if not exists public.investing_rebalance_ledger");
    expect(auditSql).toContain("create table if not exists public.investing_reconciliation_ledger");
    expect(auditSql).toContain("create table if not exists public.investing_research_snapshots");
    expect(auditSql).toContain("create table if not exists public.investing_execution_queue");
    expect(auditSql).toContain("create table if not exists public.investing_execution_approvals");
    expect(auditSql).toContain("investing_mandate_snapshots_user_mode_day_fingerprint_uidx");
    expect(auditSql).toContain("investing_rebalance_ledger_user_mode_day_fingerprint_uidx");
    expect(auditSql).toContain("investing_reconciliation_ledger_user_mode_fingerprint_uidx");
    expect(auditSql).toContain("investing_research_snapshots_user_mode_day_fingerprint_uidx");
    expect(auditSql).toContain("investing_execution_queue_user_mode_day_fingerprint_uidx");
    expect(auditSql).toContain("investing_execution_approvals_user_mode_decided_idx");
    expect(auditSql).toContain("governance_policy jsonb");
    expect(auditSql).toContain("alter table if exists public.investing_mandate_snapshots enable row level security");
    expect(auditSql).toContain("alter table if exists public.investing_rebalance_ledger enable row level security");
    expect(auditSql).toContain("alter table if exists public.investing_reconciliation_ledger enable row level security");
    expect(auditSql).toContain("alter table if exists public.investing_research_snapshots enable row level security");
    expect(auditSql).toContain("alter table if exists public.investing_execution_queue enable row level security");
    expect(auditSql).toContain("alter table if exists public.investing_execution_approvals enable row level security");
    expect(auditSql).toContain("investing_mandate_snapshots_select_own");
    expect(auditSql).toContain("investing_rebalance_ledger_select_own");
    expect(auditSql).toContain("investing_reconciliation_ledger_select_own");
    expect(auditSql).toContain("investing_research_snapshots_select_own");
    expect(auditSql).toContain("investing_execution_queue_select_own");
    expect(auditSql).toContain("investing_execution_approvals_select_own");
  });
});
