import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260707190000_create_investing_core_tables.sql",
);

describe("investing canonical schema migration", () => {
  const sql = readFileSync(migrationPath, "utf8").toLowerCase();

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
});
