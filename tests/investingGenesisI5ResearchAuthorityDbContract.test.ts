import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..");
const migrationPath = path.join(
  repoRoot,
  "supabase",
  "migrations",
  "20260909100000_investing_i5_research_authority_audit_contract.sql",
);
const i2bMigrationPath = path.join(
  repoRoot,
  "supabase",
  "migrations",
  "20260825123000_investing_genesis_i2_authorized_context.sql",
);
const i2LedgerMigrationPath = path.join(
  repoRoot,
  "supabase",
  "migrations",
  "20260831221500_investing_genesis_i2_ledger_schema.sql",
);

function read(filePath: string) {
  return fs.readFileSync(filePath, "utf8");
}

function normalize(value: string) {
  return value.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--.*$/gm, "").replace(/\s+/g, " ").trim().toLowerCase();
}

function sliceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

describe("Investing Genesis I5 Research authority DB audit contract", () => {
  it("extends only the canonical audit contract surface and leaves runtime/persistence untouched", () => {
    const normalized = normalize(read(migrationPath));

    expect(normalized).toContain("alter table investing.pre_authority_audit_events");
    expect(normalized).toContain("create policy pre_authority_audit_events_i2b_i5_insert");
    expect(normalized).toContain("create policy audit_events_i5_research_investigation_create_denial_insert");
    expect(normalized).not.toContain("create table investing.research");
    expect(normalized).not.toContain("research_investigations");
    expect(normalized).not.toContain("research_drafts");
    expect(normalized).not.toContain("research_hypotheses");
    expect(normalized).not.toContain("dataset_snapshot");
    expect(normalized).not.toMatch(/create\s+(or\s+replace\s+)?function/);
    expect(normalized).not.toMatch(/create\s+(or\s+replace\s+)?function[\s\S]*security\s+definer/);
    expect(normalized).not.toContain("trading.");
    expect(normalized).not.toContain("plan_revisions");
  });

  it("preserves the exact I2 account-context pre-authority triples while adding closed I5 triples", () => {
    const normalized = normalize(read(migrationPath));
    const tableConstraint = sliceBetween(
      normalized,
      "add constraint pre_authority_audit_events_semantic_triple_check",
      "drop policy pre_authority_audit_events_i2b_insert",
    );

    for (const expected of [
      "operation = 'account_context_resolve' and operation_scope = 'account_scope' and selector_kind = 'account_id'",
      "resolution_stage = 'principal_lookup' and reason_code = 'zero_principal' and outcome = 'denied'",
      "resolution_stage = 'principal_lookup' and reason_code = 'duplicate_principal' and outcome = 'error'",
      "resolution_stage = 'principal_state' and reason_code = 'principal_disabled' and outcome = 'denied'",
      "resolution_stage = 'account_selector_lookup' and reason_code = 'account_selector_not_accessible' and outcome = 'denied'",
      "resolution_stage = 'account_selector_lookup' and reason_code = 'duplicate_account_selector' and outcome = 'error'",
      "resolution_stage = 'transaction_context_preflight' and reason_code = 'stale_transaction_context' and outcome = 'error'",
    ]) {
      expect(tableConstraint).toContain(expected);
    }

    expect(tableConstraint).toContain(
      "operation = 'research_investigation_create_v1' and operation_scope = 'tenant_scope' and selector_kind = 'tenant_id'",
    );
    expect(tableConstraint).toContain(
      "operation = 'research_investigation_create_v1' and operation_scope = 'account_scope' and selector_kind = 'account_id'",
    );
    expect(tableConstraint).toContain("resolution_stage = 'tenant_selector_lookup'");
    expect(tableConstraint).toContain("reason_code = 'tenant_selector_not_accessible'");
    expect(tableConstraint).toContain("reason_code = 'duplicate_tenant_selector'");
    expect(tableConstraint).toContain("resolution_stage = 'tenant_membership_lookup'");
    expect(tableConstraint).toContain("resolution_stage = 'account_state'");
    expect(tableConstraint).toContain("resolution_stage = 'account_access_lookup'");
    expect(tableConstraint).toContain("reason_code = 'account_inactive'");
    expect(tableConstraint).toContain("reason_code = 'access_inactive'");

    expect(tableConstraint).not.toContain(
      "operation = 'research_investigation_create_v1' and operation_scope = 'tenant_scope' and selector_kind = 'account_id'",
    );
    expect(tableConstraint).not.toContain(
      "operation = 'account_context_resolve' and operation_scope = 'tenant_scope'",
    );
  });

  it("uses one exact pre-authority INSERT policy instead of broad OR semantics", () => {
    const normalized = normalize(read(migrationPath));
    const policy = sliceBetween(
      normalized,
      "create policy pre_authority_audit_events_i2b_i5_insert",
      "create policy audit_events_i5_research_investigation_create_denial_insert",
    );

    expect(policy).toContain("for insert");
    expect(policy).toContain("to investing_app");
    expect(policy).toContain("operation = 'account_context_resolve'");
    expect(policy).toContain("operation_scope = 'account_scope'");
    expect(policy).toContain("selector_kind = 'account_id'");
    expect(policy).toContain("current_setting('syntrake.investing.operation', true) = 'research_investigation_create_v1'");
    expect(policy).toContain("current_setting('syntrake.investing.capability', true) = 'research_mutate'");
    expect(policy).toContain("operation = 'research_investigation_create_v1'");
    expect(policy).toContain("operation_scope = 'tenant_scope' and selector_kind = 'tenant_id'");
    expect(policy).toContain("operation_scope = 'account_scope' and selector_kind = 'account_id'");
    expect(policy).not.toMatch(/operation\s+is\s+not\s+null/);
    expect(policy).not.toMatch(/operation_scope\s+is\s+not\s+null/);
    expect(policy).not.toMatch(/selector_kind\s+is\s+not\s+null/);
    expect(policy).not.toMatch(/\bwith check\s*\(\s*true\s*\)/);
  });

  it("adds a disjoint canonical Research denial policy with exact tenant and account scope semantics", () => {
    const normalized = normalize(read(migrationPath));
    const policy = sliceBetween(normalized, "create policy audit_events_i5_research_investigation_create_denial_insert", "reset role;");

    expect(policy).toContain("current_setting('syntrake.investing.operation', true) = 'research_investigation_create_v1'");
    expect(policy).toContain("current_setting('syntrake.investing.capability', true) = 'research_mutate'");
    expect(policy).toContain("actor_kind = 'user_principal'");
    expect(policy).toContain("principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid");
    expect(policy).toContain("action = 'authority_access_denied'");
    expect(policy).toContain("evidence ->> 'operation' = 'research_investigation_create_v1'");
    expect(policy).toContain("evidence ->> 'capability' = 'research_mutate'");
    expect(policy).toContain("operation_scope = 'tenant_scope'");
    expect(policy).toContain("account_id is null");
    expect(policy).toContain("object_type = 'tenant'");
    expect(policy).toContain("object_id = tenant_id::text");
    expect(policy).toContain("source_context' in ('pure_research', 'test_portfolio')");
    expect(policy).toContain("operation_scope = 'account_scope'");
    expect(policy).toContain("account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid");
    expect(policy).toContain("object_type = 'account'");
    expect(policy).toContain("source_context' = 'user_portfolio'");
    expect(policy).toContain("from investing.principals p");
    expect(policy).toContain("from investing.tenants t");
    expect(policy).toContain("join investing.accounts a");
    expect(policy).not.toContain("to service_role");
    expect(policy).not.toMatch(/\bwith check\s*\(\s*true\s*\)/);
  });

  it("keeps shared roles out, investing_app scoped, and RLS/FORCE RLS postconditioned", () => {
    const normalized = normalize(read(migrationPath));

    expect(normalized).toContain("pol.polcmd <> 'a'");
    expect(normalized).toContain("pol.polroles <> array[(select oid from pg_catalog.pg_roles where rolname = 'investing_app')]");
    expect(normalized).toContain("shared roles must not gain audit table privileges");
    expect(normalized).toContain("grantee in ('public', 'anon', 'authenticated', 'service_role')");
    expect(normalized).toContain("investing_app gained forbidden audit table privileges");
    expect(normalized).toContain("not c.relrowsecurity");
    expect(normalized).toContain("not c.relforcerowsecurity");
    expect(normalized).toContain("audit tables must remain owner/rls/force rls protected");
  });

  it("scopes policy inventory checks to owned audit tables so accepted ledger policies are not false rejected", () => {
    const normalized = normalize(read(migrationPath));
    const ledger = normalize(read(i2LedgerMigrationPath));
    const postcondition = sliceBetween(normalized, "do $$ declare v_bad_count integer; v_policy_expr text;", "select pg_catalog.regexp_replace");

    expect(ledger).toContain("create policy idempotency_records_i2_ledger_read");
    expect(ledger).toContain("create policy ledger_transactions_i2_ledger_insert");
    expect(postcondition).toContain("c.relname in ('pre_authority_audit_events', 'audit_events')");
    expect(postcondition).toContain("unexpected policy on owned audit tables");
    expect(postcondition).toContain("expected exact pre-authority audit policy");
    expect(postcondition).toContain("expected exact canonical audit policies");
    expect(postcondition).not.toContain("idempotency_records_i2_ledger_read");
    expect(postcondition).not.toContain("ledger_accounts_i2_ledger_read");
    expect(postcondition).not.toContain("ledger_transactions_i2_ledger_insert");
  });

  it("does not edit the accepted I2-B migration and intentionally supersedes only by additive migration", () => {
    const i2b = normalize(read(i2bMigrationPath));
    const i5 = normalize(read(migrationPath));

    expect(i2b).toContain("create policy pre_authority_audit_events_i2b_insert");
    expect(i2b).toContain("check (operation = 'account_context_resolve')");
    expect(i2b).toContain("check (operation_scope = 'account_scope')");
    expect(i2b).toContain("check (selector_kind = 'account_id')");
    expect(i5).toContain("drop policy pre_authority_audit_events_i2b_insert");
    expect(i5).toContain("create policy pre_authority_audit_events_i2b_i5_insert");
  });
});
