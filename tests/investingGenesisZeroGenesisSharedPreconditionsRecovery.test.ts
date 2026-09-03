import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..");
const migrationsDir = path.join(repoRoot, "supabase", "migrations");
const recoveryName = "20260822140500_recover_zero_genesis_shared_preconditions.sql";
const zeroBoundaryName = "20260822141129_assert_investing_runtime_zero_genesis_boundary.sql";
const modeConstraintName = "20260822143442_remove_retired_investing_from_shared_mode_constraints.sql";
const publicAclName = "20260822223021_revoke_legacy_public_function_execute_for_investing_isolation.sql";

function readMigration(name: string) {
  return fs.readFileSync(path.join(migrationsDir, name), "utf8");
}

function stripSqlComments(sql: string) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--.*$/gm, "");
}

function normalizeSql(sql: string) {
  return stripSqlComments(sql).replace(/\s+/g, " ").trim().toLowerCase();
}

function sliceBetween(sql: string, start: string, end: string) {
  const normalized = normalizeSql(sql);
  const startIndex = normalized.indexOf(start.toLowerCase());
  expect(startIndex).toBeGreaterThanOrEqual(0);
  const endIndex = normalized.indexOf(end.toLowerCase(), startIndex + start.length);
  expect(endIndex).toBeGreaterThan(startIndex);
  return normalized.slice(startIndex, endIndex);
}

describe("Investing Genesis Zero Genesis shared-precondition recovery", () => {
  it("is ordered after residual teardown and before every consumer of the recovered state", () => {
    const migrationNames = fs.readdirSync(migrationsDir).filter((entry) => /^\d{14}_.+\.sql$/.test(entry)).sort();

    expect(migrationNames).toContain(recoveryName);
    expect(recoveryName > "20260822140357_remove_capitalized_investing_portfolio_residuals.sql").toBe(true);
    expect(recoveryName < zeroBoundaryName).toBe(true);
    expect(recoveryName < modeConstraintName).toBe(true);
    expect(recoveryName < publicAclName).toBe(true);
  });

  it("recovers the exact setup_status shape observed in canonical Production and fails closed on drift", () => {
    const sql = normalizeSql(readMigration(recoveryName));

    expect(sql).toContain("if v_setup_oid is null then");
    expect(sql).toContain("create table public.setup_status");
    expect(sql).toContain("user_id text primary key");
    expect(sql).toContain("completed boolean not null default false");
    expect(sql).toContain("mode text");
    expect(sql).toContain("updated_at timestamptz default now()");
    expect(sql).toContain("alter table public.setup_status enable row level security");
    expect(sql).toContain("grant all privileges on table public.setup_status to service_role");
    expect(sql).toContain("c.relowner = 'postgres'::regrole");
    expect(sql).toContain("c.relrowsecurity");
    expect(sql).toContain("not c.relforcerowsecurity");
    expect(sql).toContain("public.setup_status must contain exactly four columns");
    expect(sql).toContain("public.setup_status must not have rls policies");
    expect(sql).toContain("public.setup_status has an unexpected grantee");
    expect(sql).toContain("service_role lacks % on public.setup_status");
    expect(sql).toContain("raise exception");
  });

  it("creates set_updated_at only when absent, preserving both clean-replay preflight and already-isolated Production", () => {
    const raw = readMigration(recoveryName);
    const sql = normalizeSql(raw);
    const creationBlock = sliceBetween(raw, "if v_function_oid is null then", "v_created_function := true");

    expect(sql).not.toMatch(/\bcreate\s+or\s+replace\s+function\b/);
    expect(creationBlock).toContain("create function public.set_updated_at()");
    expect(creationBlock).toContain("returns trigger");
    expect(creationBlock).toContain("language plpgsql");
    expect(creationBlock).toContain("new.updated_at = now()");
    expect(creationBlock).toContain("return new");
    expect(creationBlock).toContain(
      "grant execute on function public.set_updated_at() to public, postgres, anon, authenticated, service_role",
    );
    expect(sql).toContain("p.proowner = 'postgres'::regrole");
    expect(sql).toContain("not p.prosecdef");
    expect(sql).toContain("public.set_updated_at() semantics differ from canonical production");
    expect(sql).toContain("public.set_updated_at() has an unexpected execute grantee");
    expect(sql).toContain("newly recovered public.set_updated_at() lacks the historical public execute precondition");

    const outsideCreationBlock = sql.replace(creationBlock, "");
    expect(outsideCreationBlock).not.toContain("grant execute on function public.set_updated_at() to public");
  });

  it("supplies the exact mode-check names required by the later migration without inventing a historical Investing constraint", () => {
    const sql = normalizeSql(readMigration(recoveryName));
    const canonicalConstraintLiteral =
      "check (mode = any (array[''trading''::text, ''forex''::text, ''crypto''::text]))";

    expect(sql).toContain("add constraint plans_mode_check check (mode in ('trading','forex','crypto'))");
    expect(sql).toContain("add constraint portfolio_items_mode_check check (mode in ('trading','forex','crypto'))");
    expect(sql).toContain(canonicalConstraintLiteral);
    expect(sql).toContain("existing plans_mode_check is not the canonical post-genesis definition");
    expect(sql).toContain("existing portfolio_items_mode_check is not the canonical post-genesis definition");
    expect(sql).toContain("plans_mode_check postcondition failed");
    expect(sql).toContain("portfolio_items_mode_check postcondition failed");
    expect(sql).not.toContain("'investing'");
  });

  it("does not mutate shared rows or destructively rewrite existing preconditions", () => {
    const sql = stripSqlComments(readMigration(recoveryName));

    expect(sql).not.toMatch(/\binsert\s+into\b/i);
    expect(sql).not.toMatch(/\bupdate\s+public\./i);
    expect(sql).not.toMatch(/\bdelete\s+from\b/i);
    expect(sql).not.toMatch(/\btruncate\s+(?:table\s+)?public\./i);
    expect(sql).not.toMatch(/\bdrop\s+(?:table|function|constraint)\b/i);
    expect(sql).not.toMatch(/\brevoke\b/i);
    expect(sql).not.toMatch(/\balter\s+function\b/i);
  });

  it("covers the exact missing objects consumed by the existing fail-closed migrations", () => {
    const recovery = normalizeSql(readMigration(recoveryName));
    const zeroBoundary = normalizeSql(readMigration(zeroBoundaryName));
    const modeMigration = normalizeSql(readMigration(modeConstraintName));
    const publicAcl = normalizeSql(readMigration(publicAclName));

    expect(zeroBoundary).toContain("from public.setup_status");
    expect(recovery).toContain("public.setup_status");

    expect(modeMigration).toContain("drop constraint plans_mode_check");
    expect(modeMigration).toContain("drop constraint portfolio_items_mode_check");
    expect(recovery).toContain("add constraint plans_mode_check");
    expect(recovery).toContain("add constraint portfolio_items_mode_check");

    expect(publicAcl).toContain("public.set_updated_at()");
    expect(publicAcl).toContain("public execute missing");
    expect(recovery).toContain("public.set_updated_at()");
  });
});
