import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..");
const frozenBaselinePath = path.join(repoRoot, "supabase", "baselines", "genesis", "20260822_genesis_baseline.sql");
const frozenBaselineGuidePath = path.join(repoRoot, "supabase", "baselines", "genesis", "AGENTS.md");

const activeRelations = [
  "feature_usage_events",
  "journal_entries",
  "daily_snapshots",
  "trading_scanner_snapshots",
  "marketing_content_items",
  "marketing_leads",
  "research_lab_state",
  "research_lab_runs",
  "research_lab_decisions",
  "trading_followed_positions",
  "paper_trades",
  "paper_trade_user_locks",
  "paper_trade_runs",
];

const legacyExcludedRelations = [
  "plans",
  "portfolio_items",
  "portfolio_meta",
  "portfolios",
  "user_settings",
  "user_alerts",
  "setup_status",
];

const tablePrivilegeMatrix = [
  ["feature_usage_events", "authenticated", "select, insert"],
  ["feature_usage_events", "service_role", "select, insert"],
  ["journal_entries", "authenticated", "select, insert"],
  ["journal_entries", "service_role", "select, insert, update"],
  ["daily_snapshots", "authenticated", "select, insert, update"],
  ["daily_snapshots", "service_role", "select"],
  ["trading_scanner_snapshots", "service_role", "select, insert, update"],
  ["marketing_content_items", "authenticated", "select, insert, update, delete"],
  ["marketing_content_items", "service_role", "select, insert, update, delete"],
  ["marketing_leads", "authenticated", "select, insert, update, delete"],
  ["marketing_leads", "service_role", "select, insert, update, delete"],
  ["research_lab_state", "service_role", "select, insert, update"],
  ["research_lab_runs", "service_role", "select, insert, update"],
  ["research_lab_decisions", "service_role", "select, insert, update"],
  ["trading_followed_positions", "authenticated", "select, insert, update, delete"],
  ["trading_followed_positions", "service_role", "select, insert, update, delete"],
  ["paper_trades", "authenticated", "select, insert, update, delete"],
  ["paper_trades", "service_role", "select, insert, update, delete"],
  ["paper_trade_user_locks", "authenticated", "select"],
  ["paper_trade_user_locks", "service_role", "select, insert, update, delete"],
  ["paper_trade_runs", "authenticated", "select, insert"],
  ["paper_trade_runs", "service_role", "select, insert, update"],
] as const;

function readSql(filePath: string) {
  return fs.readFileSync(filePath, "utf8");
}

function stripSqlComments(sql: string) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--.*$/gm, "");
}

function normalizeSql(sql: string) {
  return stripSqlComments(sql).replace(/\s+/g, " ").trim().toLowerCase();
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sha256(value: string) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex").toUpperCase();
}

describe("Investing Genesis I1 canonical baseline candidate", () => {
  it("freezes the accepted Genesis baseline as a byte-for-byte non-historical baseline artifact", () => {
    const frozen = readSql(frozenBaselinePath);
    const guide = readSql(frozenBaselineGuidePath);

    expect(Buffer.byteLength(frozen, "utf8")).toBe(30972);
    expect(sha256(frozen)).toBe("3C5D599BE90C8808103D7133DF7F0381E704C5936CB531D8825903BF5CCF53FD");
    expect(guide).toContain("NEW DB / I2+");
    expect(guide).toContain("Genesis baseline + migrations post-Genesis");
    expect(guide).toContain("EXISTING PRODUCTION");
    expect(guide).toContain("historical migration lineage real + explicit transition migrations");
    expect(guide).toContain("MUST NOT be presented as a migration historically executed in Production");
    expect(guide).toContain("20260822223021_revoke_legacy_public_function_execute_for_investing_isolation.sql");
    expect(guide).toContain("Do not apply that transition migration as part of a fresh Genesis baseline replay");
  });

  it("represents every active Trading/shared canonical relation", () => {
    const normalized = normalizeSql(readSql(frozenBaselinePath));

    for (const relation of activeRelations) {
      expect(normalized).toMatch(new RegExp(`\\bcreate table public\\.${escapeRegex(relation)}\\b`));
      expect(normalized).toMatch(new RegExp(`\\balter table public\\.${escapeRegex(relation)} enable row level security\\b`));
    }
  });

  it("excludes retired Investing and legacy drift relations from executable baseline SQL", () => {
    const executableSql = normalizeSql(readSql(frozenBaselinePath));

    expect(executableSql).not.toMatch(/\bcreate schema\b[^;]*\binvesting/i);
    expect(executableSql).not.toMatch(/\bcreate (?:table|function|view|materialized view|type)\b[^;]*\binvesting/i);

    for (const relation of legacyExcludedRelations) {
      expect(executableSql).not.toMatch(new RegExp(`\\bcreate table public\\.${escapeRegex(relation)}\\b`));
      expect(executableSql).not.toMatch(new RegExp(`\\balter table public\\.${escapeRegex(relation)}\\b`));
    }
  });

  it("freezes daily_snapshots as strict, non-unique, authenticated-only baseline state", () => {
    const normalized = normalizeSql(readSql(frozenBaselinePath));

    expect(normalized).toContain("create table public.daily_snapshots");
    expect(normalized).toContain("day_key text not null");
    expect(normalized).toContain("snapshot jsonb not null default '{}'::jsonb");
    expect(normalized).toContain("holdings jsonb not null default '[]'::jsonb");
    expect(normalized).toContain("meta jsonb not null default '{}'::jsonb");
    expect(normalized).not.toMatch(/\bunique\s*\(\s*user_id\s*,\s*mode\s*,\s*day_key\s*\)/);
    expect(normalized).not.toMatch(/\bdaily_snapshots\b[^;]*\bto public\b/);
    expect(normalized).toContain("daily_snapshots_select_own");
    expect(normalized).toContain("daily_snapshots_insert_own");
    expect(normalized).toContain("daily_snapshots_update_own");
    expect(normalized).toContain("grant select, insert, update on table public.daily_snapshots to authenticated");
    expect(normalized).toContain("grant select on table public.daily_snapshots to service_role");
  });

  it("freezes journal_entries as explicit typed, titled, detailed Trading state without a type default", () => {
    const normalized = normalizeSql(readSql(frozenBaselinePath));

    expect(normalized).toContain("create table public.journal_entries");
    expect(normalized).toContain("mode text not null default 'trading'");
    expect(normalized).toMatch(/\btype text not null,/);
    expect(normalized).not.toMatch(/\btype text not null default\b/);
    expect(normalized).toContain("title text not null");
    expect(normalized).toContain("details jsonb not null default '{}'::jsonb");
    expect(normalized).not.toMatch(/\bjournal_entries\b[^;]*\bto public\b/);
    expect(normalized).toContain("journal_entries_select_own");
    expect(normalized).toContain("journal_entries_insert_own");
    expect(normalized).toContain("grant select, insert on table public.journal_entries to authenticated");
    expect(normalized).toContain("grant select, insert, update on table public.journal_entries to service_role");
  });

  it("adds all four canonical owner policies for paper_trades", () => {
    const normalized = normalizeSql(readSql(frozenBaselinePath));

    expect(normalized).toContain("paper_trades_select_own");
    expect(normalized).toContain("paper_trades_insert_own");
    expect(normalized).toContain("paper_trades_update_own");
    expect(normalized).toContain("paper_trades_delete_own");
    expect(normalized).toContain("paper_trades for select to authenticated");
    expect(normalized).toContain("paper_trades for insert to authenticated");
    expect(normalized).toContain("paper_trades for update to authenticated");
    expect(normalized).toContain("paper_trades for delete to authenticated");
  });

  it("declares an explicit table privilege contract without anon grants or default ACL reliance", () => {
    const normalized = normalizeSql(readSql(frozenBaselinePath));

    expect(normalized).toContain("revoke all on schema public from public, anon");
    expect(normalized).toContain("grant usage on schema public to authenticated, service_role");
    expect(normalized).not.toMatch(/\bgrant\b[^;]*\bto anon\b/);
    expect(normalized).not.toMatch(/\bgrant all\b/);

    for (const [table, role, privileges] of tablePrivilegeMatrix) {
      expect(normalized).toContain(`grant ${privileges} on table public.${table} to ${role}`);
    }
  });

  it("preserves required upsert conflict targets and active RPC signatures", () => {
    const normalized = normalizeSql(readSql(frozenBaselinePath));

    expect(normalized).toContain("instrument text primary key");
    expect(normalized).toContain("run_id text primary key");
    expect(normalized).toContain("event_id text primary key");
    expect(normalized).toContain("primary key (user_id, lock_scope)");
    expect(normalized).toContain("constraint paper_trades_source_journal_entry_key unique (source_journal_entry_id)");
    expect(normalized).toContain("create unique index paper_trades_user_idempotency_idx");
    expect(normalized).toContain("create unique index trading_followed_positions_one_open_idx");
    expect(normalized).toContain("create function public.acquire_paper_trade_lock(");
    expect(normalized).toContain("create function public.release_paper_trade_lock(");
    expect(normalized).toContain("create function public.create_paper_trade_cycle(p_payload jsonb)");
    expect(normalized).toContain("create function public.read_paper_trade_history_compact_v1(");
  });

  it("requires explicit safe search_path on baseline functions and preserves compact history ACL posture", () => {
    const normalized = normalizeSql(readSql(frozenBaselinePath));

    expect(normalized).toMatch(/create function public\.read_paper_trade_history_compact_v1\([\s\S]*?security definer set search_path = pg_catalog, public/);
    expect(normalized).toContain("revoke all on function public.read_paper_trade_history_compact_v1(text, integer, integer) from public, anon, authenticated");
    expect(normalized).toContain("grant execute on function public.read_paper_trade_history_compact_v1(text, integer, integer) to service_role");
    expect(normalized).not.toContain("create function public.set_updated_at()");

    for (const functionName of [
      "set_trading_scanner_snapshots_updated_at",
      "set_marketing_ops_updated_at",
      "set_research_lab_updated_at",
      "set_paper_trades_updated_at",
      "set_paper_trade_user_locks_updated_at",
      "set_paper_trade_runs_updated_at",
      "acquire_paper_trade_lock",
      "release_paper_trade_lock",
      "create_paper_trade_cycle",
    ]) {
      expect(normalized).toMatch(new RegExp(`create function public\\.${functionName}\\([\\s\\S]*?set search_path = pg_catalog, public`));
    }
  });

  it("keeps trigger functions owner-only and grants only server RPCs to service_role", () => {
    const normalized = normalizeSql(readSql(frozenBaselinePath));

    for (const functionName of [
      "set_trading_scanner_snapshots_updated_at",
      "set_marketing_ops_updated_at",
      "set_research_lab_updated_at",
      "set_paper_trades_updated_at",
      "set_paper_trade_user_locks_updated_at",
      "set_paper_trade_runs_updated_at",
    ]) {
      expect(normalized).toContain(`revoke all on function public.${functionName}() from public, anon, authenticated, service_role`);
      expect(normalized).not.toContain(`grant execute on function public.${functionName}()`);
    }

    expect(normalized).toContain("grant execute on function public.acquire_paper_trade_lock(text, text, text, integer, text) to service_role");
    expect(normalized).toContain("grant execute on function public.release_paper_trade_lock(text, text, text) to service_role");
    expect(normalized).toContain("grant execute on function public.create_paper_trade_cycle(jsonb) to service_role");
    expect(normalized).toContain("grant execute on function public.read_paper_trade_history_compact_v1(text, integer, integer) to service_role");
    expect(normalized).not.toMatch(/\bgrant execute on function\b[^;]*\bto public\b/);
    expect(normalized).not.toMatch(/\bgrant execute on function\b[^;]*\bto anon\b/);
    expect(normalized).not.toMatch(/\bgrant execute on function\b[^;]*\bto authenticated\b/);
  });

  it("classifies ACL isolation as current-catalog transition only, not a fresh-baseline dependency", () => {
    const guide = readSql(frozenBaselineGuidePath);

    expect(guide).toContain("EXISTING PRODUCTION");
    expect(guide).toContain("historical migration lineage real + explicit transition migrations");
    expect(guide).toContain("20260822223021_revoke_legacy_public_function_execute_for_investing_isolation.sql");
    expect(guide).toContain("Do not apply that transition migration as part of a fresh Genesis baseline replay");
  });
});
