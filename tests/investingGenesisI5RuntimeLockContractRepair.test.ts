import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..");
const migrationPath = path.join(
  repoRoot,
  "supabase",
  "migrations",
  "20260911110000_investing_i5_research_runtime_lock_contract_repair.sql",
);
const a2MigrationPath = path.join(
  repoRoot,
  "supabase",
  "migrations",
  "20260910130000_investing_i5_a2_research_draft_persistence.sql",
);
const investigationWriterPath = path.join(repoRoot, "lib", "investing", "research", "investigationWriter.ts");
const draftWriterPath = path.join(repoRoot, "lib", "investing", "research", "draftWriter.ts");

const lockTables = [
  "principals",
  "tenants",
  "tenant_memberships",
  "accounts",
  "account_access",
  "research_investigations",
  "research_drafts",
] as const;

const requestedAuthorityAndParentTables = [
  "principals",
  "tenants",
  "tenant_memberships",
  "accounts",
  "account_access",
  "research_investigations",
] as const;

const lockPolicies = [
  "principals_i5_research_runtime_lock_only",
  "tenants_i5_research_runtime_lock_only",
  "tenant_memberships_i5_research_runtime_lock_only",
  "accounts_i5_research_runtime_lock_only",
  "account_access_i5_research_runtime_lock_only",
  "research_investigations_i5_draft_parent_lock_only",
  "research_drafts_i5_first_draft_lock_only",
] as const;

describe("Investing I5 runtime lock contract repair", () => {
  it("adds only the updated_at column lock capability and preserves migration safety rails", () => {
    const rawSql = read(migrationPath);
    const sql = normalize(rawSql);

    expect(sql.startsWith("begin;")).toBe(true);
    expect(sql.endsWith("commit;")).toBe(true);
    expect(sql).toContain("if current_user <> 'postgres' then");
    expect(sql).toContain("set local role investing_owner");
    expect(sql).toContain("c.relkind in ('r', 'p')");
    expect(sql).toContain("c.relowner = 'investing_owner'::regrole");
    expect(sql).toContain("c.relrowsecurity");
    expect(sql).toContain("c.relforcerowsecurity");
    expect(sql).toContain("v_relation_count <> 6");

    for (const table of lockTables) {
      expect(sql).toContain(`grant update (updated_at) on table investing.${table} to investing_app;`);
      expect(sql).toContain(`'${table}'`);
    }

    for (const table of requestedAuthorityAndParentTables) {
      expect(sql).toContain(`grant update (updated_at) on table investing.${table} to investing_app;`);
    }

    expect(rawSql).not.toMatch(/\bgrant\s+update\s+on\s+table\s+investing\./i);
    expect(rawSql).not.toMatch(/\bgrant\s+update\s*\((?!\s*updated_at\s*\))/i);
    expect(rawSql).not.toMatch(/\bgrant\s+delete\b|\bgrant\s+truncate\b|\bgrant\s+references\b|\bgrant\s+trigger\b/i);
    expect(rawSql).not.toMatch(/\balter\s+policy\b|\bdrop\s+policy\b/i);
    expect(rawSql).not.toMatch(/\bfor\s+all\b/i);
    expect(sql).toContain("v_bad_table_update <> 0");
    expect(sql).toContain("v_lock_column_count <> 7");
    expect(sql).toContain("a.attname <> 'updated_at'");
    expect(sql).toContain("v_bad_update_columns <> 0");
    expect(sql).toContain("v_update_policy_count <> 7");
    expect(sql).toContain("v_bad_lock_policy_count <> 0");
    expect(sql).toContain("p.prosecdef");
    expect(sql).toContain("pg_has_role('investing_app', 'investing_owner', 'member')");
    expect(sql).toContain("pg_has_role('investing_app', 'postgres', 'member')");
    expect(sql).toContain("pg_has_role('investing_app', 'service_role', 'member')");
  });

  it("repairs the canonical A2 research_drafts prestate by adding only updated_at", () => {
    const a2Sql = normalize(read(a2MigrationPath));
    const repairSql = normalize(read(migrationPath));
    const a2DraftsTable = a2Sql.slice(
      a2Sql.indexOf("create table investing.research_drafts"),
      a2Sql.indexOf("alter table investing.research_drafts enable row level security"),
    );

    expect(a2DraftsTable).not.toContain("updated_at");
    expect(repairSql).toContain("v_research_drafts_count <> 1");
    expect(repairSql).toContain("v_research_drafts_updated_at_count <> 0");
    expect(repairSql).toContain("research_drafts.updated_at already exists in predecessor");
    expect(repairSql).toContain(
      "alter table investing.research_drafts add column updated_at timestamptz not null default transaction_timestamp();",
    );
    expect(repairSql).not.toContain("add column if not exists updated_at");
    expect(repairSql).toContain("v_research_drafts_updated_at_count <> 1");
    expect(repairSql).toContain("research_drafts.updated_at definition mismatch");
    expect(repairSql).toContain("pg_catalog.pg_get_expr(d.adbin, d.adrelid) = 'transaction_timestamp()'");

    const addColumn = repairSql.indexOf("alter table investing.research_drafts add column updated_at");
    const draftGrant = repairSql.indexOf("grant update (updated_at) on table investing.research_drafts");
    expect(addColumn).toBeGreaterThanOrEqual(0);
    expect(draftGrant).toBeGreaterThan(addColumn);
  });

  it("keeps blocked roles without table or column mutation privileges", () => {
    const sql = normalize(read(migrationPath));

    expect(sql).toContain("lower(grantee) in ('public', 'anon', 'authenticated', 'service_role')");
    expect(sql).toContain("from information_schema.role_table_grants");
    expect(sql).toContain("from information_schema.column_privileges");
    expect(sql).toContain("privilege_type in ('update', 'delete', 'truncate', 'references', 'trigger')");
    expect(sql).toContain("privilege_type in ('update', 'references')");
    expect(sql).not.toMatch(/\bto public\b|\bto anon\b|\bto authenticated\b|\bto service_role\b/);
  });

  it("creates exactly the expected lock-only UPDATE policies with false WITH CHECK", () => {
    const sql = normalize(read(migrationPath));

    for (const policyName of lockPolicies) {
      const policy = extractPolicy(sql, policyName);

      expect(policy).toContain("for update");
      expect(policy).toContain("to investing_app");
      expect(policy).toContain("with check (false)");
      expect(policy).toContain("current_setting('syntrake.investing.capability', true) = 'research_mutate'");
    }

    expect(extractPolicy(sql, "principals_i5_research_runtime_lock_only")).toContain("principal_id::text = current_setting('syntrake.investing.principal_id', true)");
    expect(extractPolicy(sql, "principals_i5_research_runtime_lock_only")).toContain("external_subject = current_setting('syntrake.investing.actor_id', true)");

    const tenant = extractPolicy(sql, "tenants_i5_research_runtime_lock_only");
    expect(tenant).toContain("tenant_id::text = current_setting('syntrake.investing.tenant_id', true)");
    expect(tenant).toContain("current_setting('syntrake.investing.operation_scope', true) = 'tenant_scope'");
    expect(tenant).toContain("current_setting('syntrake.investing.operation_scope', true) = 'account_scope'");
    expect(tenant).toContain("coalesce(current_setting('syntrake.investing.account_id', true), '') = ''");

    const membership = extractPolicy(sql, "tenant_memberships_i5_research_runtime_lock_only");
    expect(membership).toContain("tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)");
    expect(membership).toContain("principal_id::text = current_setting('syntrake.investing.principal_id', true)");
    expect(membership).toContain("role = 'owner'");

    const account = extractPolicy(sql, "accounts_i5_research_runtime_lock_only");
    expect(account).toContain("current_setting('syntrake.investing.operation_scope', true) = 'account_scope'");
    expect(account).toContain("account_id::text = current_setting('syntrake.investing.account_id', true)");
    expect(account).toContain("initial_principal_id::text = current_setting('syntrake.investing.principal_id', true)");

    const access = extractPolicy(sql, "account_access_i5_research_runtime_lock_only");
    expect(access).toContain("account_access_id::text = current_setting('syntrake.investing.account_access_id', true)");
    expect(access).toContain("tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)");
    expect(access).toContain("principal_id::text = current_setting('syntrake.investing.principal_id', true)");
    expect(access).toContain("role = 'owner'");

    const parent = extractPolicy(sql, "research_investigations_i5_draft_parent_lock_only");
    expect(parent).toContain("current_setting('syntrake.investing.operation', true) = 'research_draft_create_v1'");
    expect(parent).toContain("research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)");
    expect(parent).toContain("tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)");
    expect(parent).toContain("account_access_id::text = current_setting('syntrake.investing.account_access_id', true)");

    const firstDraft = extractPolicy(sql, "research_drafts_i5_first_draft_lock_only");
    expect(firstDraft).toContain("current_setting('syntrake.investing.operation', true) = 'research_draft_create_v1'");
    expect(firstDraft).toContain("research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)");
    expect(firstDraft).toContain("account_access_id::text = current_setting('syntrake.investing.account_access_id', true)");
  });

  it("proves the postcondition inventories only the expected lock-only UPDATE policies", () => {
    const sql = normalize(read(migrationPath));

    expect(sql).toContain("and cmd = 'update'");
    expect(sql).toContain("and roles = array['investing_app']::name[]");
    expect(sql).toContain("and with_check in ('false', '(false)')");
    expect(sql).toContain("and cmd in ('update', 'all')");
    for (const policyName of lockPolicies) {
      expect(sql).toContain(`'${policyName}'`);
    }
  });

  it("backs every canonical A1 authority lock path with an explicit lock-capability grant", () => {
    const writer = normalize(read(investigationWriterPath));
    const migration = normalize(read(migrationPath));

    for (const table of ["principals", "tenants", "tenant_memberships"]) {
      expect(writer).toContain(`from investing.${table}`);
      expect(writer).toContain("for update");
      expect(migration).toContain(`grant update (updated_at) on table investing.${table} to investing_app;`);
    }

    expect(writer).toContain("from investing.accounts");
    expect(writer).toContain("from investing.account_access");
    expect(migration).toContain("grant update (updated_at) on table investing.accounts to investing_app;");
    expect(migration).toContain("grant update (updated_at) on table investing.account_access to investing_app;");
  });

  it("backs canonical A2 authority, parent, and first-draft locks without changing writer semantics", () => {
    const writer = normalize(read(draftWriterPath));
    const migration = normalize(read(migrationPath));

    for (const table of lockTables) {
      expect(writer).toContain(`from investing.${table}`);
      expect(migration).toContain(`grant update (updated_at) on table investing.${table} to investing_app;`);
    }

    expect(writer).toContain("from investing.research_investigations");
    expect(writer).toContain("from investing.research_drafts");
    expect(writer).toContain("for update");
    expect(writer).toContain("if (priordraft.row) return fail(\"conflict\")");
    expect(writer).not.toContain("update investing.research_drafts");
    expect(writer).not.toContain("update investing.research_investigations");
  });

  it("models lock capability as distinct from mutation authority", () => {
    expect(
      canArbitraryUpdate({
        selectPolicyAllowsRow: true,
        columnUpdatePrivilege: "updated_at",
        updatePolicyUsingAllowsRow: true,
        updatePolicyWithCheckAllowsNewRow: false,
        requestedColumn: "updated_at",
      }),
    ).toBe(false);
    expect(
      canArbitraryUpdate({
        selectPolicyAllowsRow: true,
        columnUpdatePrivilege: "updated_at",
        updatePolicyUsingAllowsRow: true,
        updatePolicyWithCheckAllowsNewRow: false,
        requestedColumn: "state",
      }),
    ).toBe(false);
    expect(
      canSelectForUpdate({
        selectPolicyAllowsRow: true,
        updatePolicyUsingAllowsRow: true,
        columnUpdatePrivilege: "updated_at",
      }),
    ).toBe(true);
    expect(
      canSelectForUpdate({
        selectPolicyAllowsRow: false,
        updatePolicyUsingAllowsRow: true,
        columnUpdatePrivilege: "updated_at",
      }),
    ).toBe(false);
    expect(
      canSelectForUpdate({
        selectPolicyAllowsRow: true,
        updatePolicyUsingAllowsRow: false,
        columnUpdatePrivilege: "updated_at",
      }),
    ).toBe(false);
    expect(
      canSelectForUpdate({
        selectPolicyAllowsRow: true,
        updatePolicyUsingAllowsRow: true,
        columnUpdatePrivilege: null,
      }),
    ).toBe(false);
    expect(
      canArbitraryUpdate({
        selectPolicyAllowsRow: true,
        columnUpdatePrivilege: null,
        updatePolicyUsingAllowsRow: true,
        updatePolicyWithCheckAllowsNewRow: true,
        requestedColumn: "updated_at",
      }),
    ).toBe(false);
    expect(
      canArbitraryUpdate({
        selectPolicyAllowsRow: false,
        columnUpdatePrivilege: "updated_at",
        updatePolicyUsingAllowsRow: true,
        updatePolicyWithCheckAllowsNewRow: false,
        requestedColumn: "updated_at",
      }),
    ).toBe(false);
  });
});

function canSelectForUpdate(input: {
  selectPolicyAllowsRow: boolean;
  updatePolicyUsingAllowsRow: boolean;
  columnUpdatePrivilege: "updated_at" | null;
}) {
  return (
    input.selectPolicyAllowsRow &&
    input.updatePolicyUsingAllowsRow &&
    input.columnUpdatePrivilege === "updated_at"
  );
}

function canArbitraryUpdate(input: {
  selectPolicyAllowsRow: boolean;
  columnUpdatePrivilege: "updated_at" | null;
  updatePolicyUsingAllowsRow: boolean;
  updatePolicyWithCheckAllowsNewRow: boolean;
  requestedColumn: string;
}) {
  return (
    input.selectPolicyAllowsRow &&
    input.updatePolicyUsingAllowsRow &&
    input.updatePolicyWithCheckAllowsNewRow &&
    input.columnUpdatePrivilege === input.requestedColumn
  );
}

function read(filePath: string) {
  return fs.readFileSync(filePath, "utf8");
}

function normalize(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function extractPolicy(sql: string, name: string) {
  const start = sql.indexOf(`create policy ${name}`);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = sql.indexOf(";", start);
  expect(end).toBeGreaterThan(start);
  return sql.slice(start, end + 1);
}
