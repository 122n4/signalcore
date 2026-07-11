import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260701110000_enable_rls_on_trading_core_tables.sql",
);

describe("supabase core table hardening", () => {
  it("enables row level security on canonical trading and research tables", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toMatch(/alter table if exists public\.research_lab_state enable row level security;/i);
    expect(sql).toMatch(/alter table if exists public\.research_lab_runs enable row level security;/i);
    expect(sql).toMatch(/alter table if exists public\.research_lab_decisions enable row level security;/i);
    expect(sql).toMatch(/alter table if exists public\.paper_trades enable row level security;/i);
    expect(sql).toMatch(/alter table if exists public\.trading_scanner_snapshots enable row level security;/i);
  });

  it("scopes user-owned paper trades to the authenticated JWT subject", () => {
    const sql = readFileSync(migrationPath, "utf8").toLowerCase();

    for (const action of ["select", "insert", "update", "delete"]) {
      expect(sql).toContain(`paper_trades_${action}_own`);
    }

    expect(sql).toContain("user_id = (auth.jwt() ->> 'sub')");
  });

  it("keeps operational research and scanner mirrors service-role only", () => {
    const sql = readFileSync(migrationPath, "utf8").toLowerCase();

    expect(sql).toContain("service-role only");
    expect(sql).not.toMatch(/create policy .*research_lab_state/i);
    expect(sql).not.toMatch(/create policy .*trading_scanner_snapshots/i);
  });
});
