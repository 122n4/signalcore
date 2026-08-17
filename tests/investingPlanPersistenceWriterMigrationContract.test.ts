import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATION_NAME = "20260817023650_investing_canonical_plan_persistence_writer.sql";
const MIGRATION_PATH = join(process.cwd(), "supabase", "migrations", MIGRATION_NAME);

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function migrationSource() {
  return readFileSync(MIGRATION_PATH, "utf8");
}

function normalizeSql(sql: string) {
  return sql.replace(/\s+/g, " ").toLowerCase();
}

describe("R6-A3D canonical Investing Plan persistence writer migration", () => {
  it("is one new post-A3C prepared migration and does not alter the accepted A3C schema migration", () => {
    const migrations = readdirSync(join(process.cwd(), "supabase", "migrations")).sort();

    expect(migrations).toContain(MIGRATION_NAME);
    expect(MIGRATION_NAME.localeCompare("20260816202000_investing_canonical_plan_persistence_schema.sql"))
      .toBeGreaterThan(0);
    expect(migrationSource()).toContain("-- migration_status: PREPARED_NOT_APPLIED_TO_PRODUCTION");

    const a3c = source("supabase/migrations/20260816202000_investing_canonical_plan_persistence_schema.sql");
    expect(a3c).not.toContain("investing_persist_canonical_plan_v1");
  });

  it("creates the exact server-only writer signature and strictly required canonical hash helpers", () => {
    const sql = normalizeSql(migrationSource());

    expect(sql).toContain("create function public.investing_persist_canonical_plan_v1( p_authorized_user_id text, p_command jsonb )");
    expect(sql).toContain("returns jsonb");
    expect(sql).toContain("language plpgsql");
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = pg_catalog, public");
    expect(sql).toContain("alter function public.investing_persist_canonical_plan_v1(text, jsonb) owner to postgres");
    expect(sql).toContain("grant execute on function public.investing_persist_canonical_plan_v1(text, jsonb) to service_role");
    expect(sql).toContain("revoke all on function public.investing_persist_canonical_plan_v1(text, jsonb) from public, anon, authenticated, service_role");

    expect(sql).toContain("create function public.investing_canonical_json_string_v1(p_value jsonb)");
    expect(sql).toContain("create function public.investing_canonical_sha256_v1(p_value jsonb)");
    expect(sql).toContain("create function public.investing_jsonb_has_exact_keys_v1(p_value jsonb, p_keys text[])");
    expect(sql).toContain("select coalesce(jsonb_typeof(p_value) = 'object', false)");
    expect(sql.match(/create function public\./g)).toHaveLength(4);
  });

  it("keeps service_role off direct Plan table DML while exposing only the writer RPC", () => {
    const sql = normalizeSql(migrationSource());

    expect(sql).toContain("revoke all on table public.investing_plan_revisions from public, anon, authenticated, service_role");
    expect(sql).toContain("revoke all on table public.investing_plan_heads from public, anon, authenticated, service_role");
    expect(sql).toContain("revoke all on table public.investing_plan_idempotency_keys from public, anon, authenticated, service_role");
    expect(sql).toContain("grant select on table public.investing_plan_revisions, public.investing_plan_heads, public.investing_plan_idempotency_keys to service_role");
    expect(sql).not.toMatch(/grant\s+(insert|update|delete|truncate|references|trigger)\s+on\s+table\s+public\.investing_plan_/);
  });

  it("recomputes every accepted canonical fingerprint rather than trusting caller hashes", () => {
    const sql = migrationSource();

    expect(sql).toContain("v_authoring_fingerprint_computed := public.investing_canonical_sha256_v1");
    expect(sql).toContain("v_semantic_fingerprint_computed := public.investing_canonical_sha256_v1");
    expect(sql).toContain("v_command_fingerprint_computed := public.investing_canonical_sha256_v1");
    expect(sql).toContain("investing_plan_persistence_authoring_fingerprint_mismatch");
    expect(sql).toContain("investing_plan_persistence_semantic_fingerprint_mismatch");
    expect(sql).toContain("investing_plan_persistence_command_fingerprint_mismatch");
    expect(sql).toContain("investing_canonical_json_number_not_allowed");
  });

  it("enforces the accepted transaction order including replay before expected-head validation", () => {
    const sql = migrationSource();

    expect(sql.indexOf("from public.investing_plan_idempotency_keys i"))
      .toBeLessThan(sql.indexOf("select h.current_revision_id"));
    expect(sql.indexOf("IDEMPOTENT_REPLAY"))
      .toBeLessThan(sql.indexOf("investing_plan_expected_head_conflict"));
    expect(sql).toContain("for update;");
    expect(sql).toContain("from public.investing_accounts a");
    expect(sql).toContain("v_tx_timestamp timestamptz := pg_catalog.transaction_timestamp()");
    expect(sql).toContain("v_txid bigint := pg_catalog.txid_current()");
    expect(sql).not.toContain("pg_advisory_xact_lock");
  });

  it("fails closed for missing or JSON-null canonical command fields", () => {
    const sql = migrationSource();

    expect(sql).toContain("p_command->>'contractVersion' is null");
    expect(sql).toContain("v_user_id is null");
    expect(sql).toContain("v_scope->>'tenantId' is null");
    expect(sql).toContain("v_explicit_intent->>'objective' is null");
    expect(sql).toContain("v_expected_head->>'revisionId' is null");
    expect(sql).toContain("v_expected_head->'revisionNumber' is null");
  });

  it("does not wire production routes, UI, recommendation, mandate, engine, Paper execution, or legacy plans", () => {
    const migration = migrationSource();
    const route = source("app/api/investing/plan/route.ts");
    const dailyCycle = source("lib/investing/server/dailyCycle.ts");
    const dashboard = source("lib/investing/server/dashboard.ts");

    for (const forbidden of [
      "app/api",
      "NextResponse",
      "buildRecommendation",
      "canonicalMandate",
      "engineMandate",
      "persistentPaper",
      "paper_execute",
      "broker",
      "insert into public.plans",
      "update public.plans",
      "delete from public.plans",
      "alter table public.plans",
    ]) {
      expect(migration, forbidden).not.toContain(forbidden);
    }

    expect(route).toContain("export async function GET");
    expect(route).not.toContain("investing_persist_canonical_plan_v1");
    expect(dailyCycle).not.toContain("investing_persist_canonical_plan_v1");
    expect(dashboard).not.toContain("investing_persist_canonical_plan_v1");
  });
});
