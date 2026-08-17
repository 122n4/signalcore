import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260719120000_investing_financial_architecture.sql"),
  "utf8",
);
const containment = readFileSync(
  join(process.cwd(), "supabase/migrations/20260719170000_investing_phase0_containment.sql"),
  "utf8",
);
const marketSnapshots = readFileSync(
  join(process.cwd(), "supabase/migrations/20260810120000_investing_market_snapshots.sql"),
  "utf8",
);

describe("investing financial migration", () => {
  it("keeps DB security hardening after recovered production history", () => {
    const migrationRoot = join(process.cwd(), "supabase/migrations");
    const migrations = readdirSync(migrationRoot)
      .filter((name) => name.endsWith(".sql"))
      .sort();
    const versions = migrations.map((name) => name.split("_")[0]);
    expect(new Set(versions).size).toBe(versions.length);

    const recoveredProductionMax = "20260812132000";
    const phase1 = "20260812133000_investing_db_security_hardening_phase1.sql";
    expect(migrations).toContain("20260812132000_drop_broken_remote_investing_onboarding_rpcs.sql");
    expect(migrations).toContain(phase1);
    expect(migrations.indexOf("20260812132000_drop_broken_remote_investing_onboarding_rpcs.sql")).toBeLessThan(
      migrations.indexOf(phase1),
    );
    expect(phase1.split("_")[0] > recoveredProductionMax).toBe(true);
  });

  it("defines required accounting tables and append-only guards", () => {
    for (const table of [
      "investing_accounts",
      "investing_cash_balances",
      "investing_cash_movements",
      "investing_orders",
      "investing_fills",
      "investing_fees",
      "investing_positions",
      "investing_corporate_actions",
      "investing_ledger_transactions",
      "investing_ledger_entries",
      "investing_reconciliation_runs",
      "investing_reconciliation_items",
    ]) {
      expect(migration).toContain(`create table if not exists public.${table}`);
    }
    expect(migration).toContain("investing_block_append_only");
  });

  it("defines transactional RPCs for daily cycles, approvals, ledger and blocked live attempts", () => {
    expect(migration).toContain("create or replace function public.investing_record_daily_cycle");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("create or replace function public.investing_record_approval");
    expect(migration).toContain("create or replace function public.investing_record_ledger_transaction");
    expect(migration).toContain("create or replace function public.investing_record_live_blocked_attempt");
  });

  it("revokes legacy RPCs, restricts v2 RPCs to service role and blocks Live persistence", () => {
    for (const rpc of [
      "investing_record_ledger_transaction",
      "investing_record_daily_cycle",
      "investing_record_approval",
      "investing_record_live_blocked_attempt",
    ]) {
      expect(containment).toContain(`raise exception 'investing_legacy_rpc_disabled'`);
      expect(containment).toMatch(new RegExp(`revoke all on function public\\.${rpc}\\(`));
    }
    for (const rpc of ["investing_record_daily_cycle_v2", "investing_record_approval_v2", "investing_record_live_blocked_attempt_v2"]) {
      expect(containment).toMatch(new RegExp(`revoke all on function public\\.${rpc}\\([^;]+ from public, anon, authenticated;`));
      expect(containment).toMatch(new RegExp(`grant execute on function public\\.${rpc}\\([^;]+ to service_role;`));
    }
    expect(containment).toContain("investing_accounts_environment_non_live_check");
    expect(containment).toContain("investing_orders_environment_non_live_check");
    expect(containment).toContain("message = 'investing_live_execution_blocked'");
  });

  it("defines immutable market snapshots for replayable Investing decisions", () => {
    expect(marketSnapshots).toContain("create table if not exists public.investing_market_snapshots");
    expect(marketSnapshots).toContain("create table if not exists public.investing_market_snapshot_items");
    expect(marketSnapshots).toContain("create or replace function public.investing_record_market_snapshot_v1");
    expect(marketSnapshots).toContain("investing_market_snapshots_block_update");
    expect(marketSnapshots).toContain("investing_market_snapshot_items_block_update");
    expect(marketSnapshots).toMatch(/grant execute on function public\.investing_record_market_snapshot_v1\([^;]+to service_role;/);
    expect(marketSnapshots).toContain("canonical_payload->>'snapshotHash' = snapshot_hash");
  });
});
