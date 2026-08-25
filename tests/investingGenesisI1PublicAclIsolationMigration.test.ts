import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..");
const migrationsDir = path.join(repoRoot, "supabase", "migrations");
const migrationNamePattern = /^\d{14}_revoke_legacy_public_function_execute_for_investing_isolation\.sql$/;

const expectedRevokeTargets = [
  "public.acquire_paper_trade_lock(text, text, text, integer, text)",
  "public.create_paper_trade_cycle(jsonb)",
  "public.release_paper_trade_lock(text, text, text)",
  "public.set_marketing_ops_updated_at()",
  "public.set_paper_trade_runs_updated_at()",
  "public.set_paper_trade_user_locks_updated_at()",
  "public.set_paper_trades_updated_at()",
  "public.set_research_lab_updated_at()",
  "public.set_trading_scanner_snapshots_updated_at()",
  "public.set_updated_at()",
];

const forbiddenMutationPatterns = [
  /\brevoke\s+execute\s+on\s+all\s+functions\s+in\s+schema\s+public\b/i,
  /\bhas_function_privilege\s*\(\s*'PUBLIC'/i,
  /\bhas_function_privilege\s*\(\s*"PUBLIC"/i,
  /\bfrom\s+anon\b/i,
  /\bfrom\s+authenticated\b/i,
  /\bfrom\s+service_role\b/i,
  /\bfrom\s+postgres\b/i,
  /\bdrop\s+function\b/i,
  /\bcreate\s+(?:or\s+replace\s+)?function\b/i,
  /\balter\s+function\b/i,
  /\bcreate\s+trigger\b/i,
  /\bdrop\s+trigger\b/i,
  /\balter\s+trigger\b/i,
  /\bcreate\s+table\b/i,
  /\balter\s+table\b/i,
  /\bdrop\s+table\b/i,
  /\benable\s+row\s+level\s+security\b/i,
  /\bforce\s+row\s+level\s+security\b/i,
  /\balter\s+database\b/i,
  /\brevoke\s+temp(?:orary)?\b/i,
  /\bgrant\s+temp(?:orary)?\b/i,
];

function readMigration() {
  const matches = fs.readdirSync(migrationsDir).filter((entry) => migrationNamePattern.test(entry));
  expect(matches).toHaveLength(1);
  const migrationPath = path.join(migrationsDir, matches[0]);
  return {
    migrationPath,
    sql: fs.readFileSync(migrationPath, "utf8"),
  };
}

function stripSqlComments(sql: string) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--.*$/gm, "");
}

function normalizeSql(sql: string) {
  return sql.replace(/\s+/g, " ").trim().toLowerCase();
}

function extractPublicRevokes(executableSql: string) {
  return Array.from(
    executableSql.matchAll(/\brevoke\s+execute\s+on\s+function\s+([\s\S]+?)\s+from\s+public\s*;/gi),
    (match) => normalizeSql(match[1]),
  );
}

function assertNoAmbiguousExactSignatureAggregation(sql: string) {
  const executableSql = stripSqlComments(sql);

  expect(executableSql).not.toMatch(/\bselect\s+jsonb_object_agg\s*\(\s*exact_signature\s*,/i);
  expect(executableSql).toMatch(/\bselect\s+jsonb_object_agg\s*\(\s*cs\.exact_signature\s*,/i);
  expect(executableSql).toMatch(/\bcurrent_state\s+as\s*\(/i);
  expect(executableSql).toMatch(/\bfrom\s+current_state\s+cs\b/i);
}

describe("Investing Genesis I1 PUBLIC function ACL isolation migration", () => {
  it("uses one local migration with only the ten exact PUBLIC EXECUTE revocations", () => {
    const { migrationPath, sql } = readMigration();
    const executableSql = stripSqlComments(sql);
    const normalizedSql = normalizeSql(executableSql);
    const revokes = extractPublicRevokes(executableSql);

    expect(path.basename(migrationPath)).toMatch(migrationNamePattern);
    expect(revokes).toHaveLength(10);
    expect(new Set(revokes)).toEqual(new Set(expectedRevokeTargets.map(normalizeSql)));
    for (const target of expectedRevokeTargets) {
      expect(normalizedSql).toContain(normalizeSql(target));
    }
    expect(revokes).not.toContain(normalizeSql("public.read_paper_trade_history_compact_v1(text, integer, integer)"));
  });

  it("does not broaden the migration scope beyond PUBLIC EXECUTE on exact functions", () => {
    const { sql } = readMigration();
    const executableSql = stripSqlComments(sql);

    for (const pattern of forbiddenMutationPatterns) {
      expect(executableSql).not.toMatch(pattern);
    }
    expect(executableSql).not.toMatch(/\bowner\s+to\b/i);
  });

  it("contains fail-closed preflight for exact identities and surviving explicit grants", () => {
    const { sql } = readMigration();
    const normalizedSql = normalizeSql(stripSqlComments(sql));

    expect(normalizedSql).toContain("i1_public_acl_preflight");
    expect(normalizedSql).toContain("raise exception");
    expect(normalizedSql).toContain("match_count <> 1");
    expect(normalizedSql).toContain("oidvectortypes(p.proargtypes)");
    expect(normalizedSql).toContain("aclexplode(coalesce(p.proacl, acldefault('f', p.proowner)))");
    expect(normalizedSql).toContain("acl.grantee = 0");
    expect(normalizedSql).toContain("acl.privilege_type = 'execute'");
    expect(normalizedSql).toContain("'postgres'");
    expect(normalizedSql).toContain("'anon'");
    expect(normalizedSql).toContain("'authenticated'");
    expect(normalizedSql).toContain("'service_role'");
    expect(normalizedSql).toContain("explicit execute");
  });

  it("qualifies CTE columns that would collide with PL/pgSQL variables in PostgreSQL", () => {
    const { sql } = readMigration();

    assertNoAmbiguousExactSignatureAggregation(sql);
  });

  it("preflights trigger dependencies without recreating or altering triggers", () => {
    const { sql } = readMigration();
    const normalizedSql = normalizeSql(stripSqlComments(sql));

    expect(normalizedSql).toContain("set_marketing_content_items_updated_at");
    expect(normalizedSql).toContain("marketing_content_items");
    expect(normalizedSql).toContain("set_marketing_leads_updated_at");
    expect(normalizedSql).toContain("marketing_leads");
    expect(normalizedSql).toContain("set_paper_trade_runs_updated_at");
    expect(normalizedSql).toContain("paper_trade_runs");
    expect(normalizedSql).toContain("set_paper_trade_user_locks_updated_at");
    expect(normalizedSql).toContain("paper_trade_user_locks");
    expect(normalizedSql).toContain("set_paper_trades_updated_at");
    expect(normalizedSql).toContain("paper_trades");
    expect(normalizedSql).toContain("set_research_lab_state_updated_at");
    expect(normalizedSql).toContain("research_lab_state");
    expect(normalizedSql).toContain("set_trading_scanner_snapshots_updated_at");
    expect(normalizedSql).toContain("trading_scanner_snapshots");
    expect(normalizedSql).not.toContain("trg_plans_updated_at");
    expect(normalizedSql).not.toContain("trg_portfolio_updated_at");
    expect(normalizedSql).not.toContain("trg_portfolio_meta_updated_at");
    expect(normalizedSql).not.toContain("trg_portfolios_updated_at");
    expect(normalizedSql).not.toContain("trg_user_settings_updated_at");
    expect(normalizedSql).toContain("t.tgenabled <> 'd'");
    expect(normalizedSql).toContain("not t.tgisinternal");
  });

  it("preserves compact paper history RPC and verifies postconditions", () => {
    const { sql } = readMigration();
    const normalizedSql = normalizeSql(stripSqlComments(sql));

    expect(normalizedSql).toContain("public.read_paper_trade_history_compact_v1(text, integer, integer)");
    expect(normalizedSql).toContain("unexpectedly has public execute");
    expect(normalizedSql).toContain("gained public execute");
    expect(normalizedSql).toContain("i1_public_acl_postcondition");
    expect(normalizedSql).toContain("public still has execute");
    expect(normalizedSql).toContain("role % lost execute");
    expect(normalizedSql).not.toContain("has_function_privilege('public'");
    expect(normalizedSql).not.toContain('has_function_privilege("public"');
    expect(normalizedSql).toContain("owner changed");
    expect(normalizedSql).toContain("security definer/invoker state changed");
    expect(normalizedSql).toContain("current_setting('syntrake.i1_public_acl_pre_state', true)");
  });
});
