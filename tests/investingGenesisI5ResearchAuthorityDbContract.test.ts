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

type SessionContext = {
  operation?: string;
  capability?: string;
  actorId: string;
  principalId: string;
  tenantId?: string;
  accountId?: string;
  externalProvider: "CLERK";
  externalSubject: string;
};

type AuditRow = {
  actorKind: "USER_PRINCIPAL" | "SYSTEM_ACTOR";
  actorId: string;
  principalId: string | null;
  operationScope: "ACCOUNT_SCOPE" | "TENANT_SCOPE" | "DOMAIN_SCOPE";
  tenantId: string | null;
  accountId: string | null;
  action: string;
  objectType: string;
  objectId: string | null;
  outcome: "DENIED" | "FAILED" | "SUCCEEDED" | "CONFLICT";
  reasonCode: string | null;
  evidence: Record<string, string | undefined>;
};

const modelIds = {
  principalId: "11111111-1111-4111-8111-111111111111",
  tenantId: "22222222-2222-4222-8222-222222222222",
  accountId: "33333333-3333-4333-8333-333333333333",
};

const i2bSession: SessionContext = {
  operation: "ACCOUNT_CONTEXT_RESOLVE",
  capability: "ACCOUNT_AUTHORITY_READ",
  actorId: "user_clerk_123",
  principalId: modelIds.principalId,
  tenantId: modelIds.tenantId,
  accountId: modelIds.accountId,
  externalProvider: "CLERK",
  externalSubject: "user_clerk_123",
};

const i5Session: SessionContext = {
  ...i2bSession,
  operation: "RESEARCH_INVESTIGATION_CREATE_V1",
  capability: "RESEARCH_MUTATE",
};

const i2bAccountDenialRow: AuditRow = {
  actorKind: "USER_PRINCIPAL",
  actorId: "user_clerk_123",
  principalId: modelIds.principalId,
  operationScope: "ACCOUNT_SCOPE",
  tenantId: modelIds.tenantId,
  accountId: modelIds.accountId,
  action: "AUTHORITY_ACCESS_DENIED",
  objectType: "ACCOUNT",
  objectId: modelIds.accountId,
  outcome: "DENIED",
  reasonCode: "ACCESS_INACTIVE",
  evidence: {},
};

function oldI2bDenialPolicy(row: AuditRow, session: SessionContext) {
  return (
    row.actorKind === "USER_PRINCIPAL" &&
    row.actorId === session.actorId &&
    row.principalId !== null &&
    row.tenantId !== null &&
    row.accountId !== null &&
    row.operationScope === "ACCOUNT_SCOPE" &&
    row.action === "AUTHORITY_ACCESS_DENIED" &&
    row.objectType === "ACCOUNT" &&
    row.objectId === row.accountId &&
    ((row.outcome === "DENIED" &&
      ["TENANT_INACTIVE", "MEMBERSHIP_INACTIVE", "ACCESS_INACTIVE"].includes(row.reasonCode ?? "")) ||
      (row.outcome === "FAILED" &&
        ["DUPLICATE_ACTIVE_MEMBERSHIP", "DUPLICATE_ACTIVE_ACCOUNT_ACCESS", "AUTHORITY_TUPLE_MISMATCH"].includes(
          row.reasonCode ?? "",
        ))) &&
    row.principalId === session.principalId &&
    session.externalProvider === "CLERK" &&
    session.externalSubject === session.actorId
  );
}

function correctedI2bDenialPolicy(row: AuditRow, session: SessionContext) {
  const isI5ResearchSession =
    session.operation === "RESEARCH_INVESTIGATION_CREATE_V1" && session.capability === "RESEARCH_MUTATE";
  const isResearchShapedEvidence =
    row.evidence.operation === "RESEARCH_INVESTIGATION_CREATE_V1" ||
    row.evidence.capability === "RESEARCH_MUTATE" ||
    Object.hasOwn(row.evidence, "source_context");
  return !isI5ResearchSession && !isResearchShapedEvidence && oldI2bDenialPolicy(row, session);
}

function i2cBootstrapPolicy(row: AuditRow, session: SessionContext) {
  return (
    session.operation === "INITIAL_PERSONAL_BOOTSTRAP" &&
    session.capability === "AUTHORITY_BOOTSTRAP" &&
    row.actorKind === "USER_PRINCIPAL" &&
    row.actorId === session.actorId &&
    row.principalId === session.principalId &&
    row.action.startsWith("AUTHORITY_BOOTSTRAP_")
  );
}

function i5ResearchDenialPolicy(row: AuditRow, session: SessionContext) {
  if (
    session.operation !== "RESEARCH_INVESTIGATION_CREATE_V1" ||
    session.capability !== "RESEARCH_MUTATE" ||
    row.actorKind !== "USER_PRINCIPAL" ||
    row.actorId !== session.actorId ||
    row.principalId !== session.principalId ||
    row.action !== "AUTHORITY_ACCESS_DENIED" ||
    row.evidence.operation !== "RESEARCH_INVESTIGATION_CREATE_V1" ||
    row.evidence.capability !== "RESEARCH_MUTATE"
  ) {
    return false;
  }

  if (row.operationScope === "TENANT_SCOPE") {
    return (
      row.tenantId === session.tenantId &&
      row.accountId === null &&
      row.objectType === "TENANT" &&
      row.objectId === row.tenantId &&
      (row.evidence.source_context === "PURE_RESEARCH" || row.evidence.source_context === "TEST_PORTFOLIO") &&
      ((row.outcome === "DENIED" && ["TENANT_INACTIVE", "MEMBERSHIP_INACTIVE"].includes(row.reasonCode ?? "")) ||
        (row.outcome === "FAILED" &&
          ["DUPLICATE_ACTIVE_MEMBERSHIP", "AUTHORITY_TUPLE_MISMATCH"].includes(row.reasonCode ?? "")))
    );
  }

  return (
    row.operationScope === "ACCOUNT_SCOPE" &&
    row.tenantId === session.tenantId &&
    row.accountId === session.accountId &&
    row.objectType === "ACCOUNT" &&
    row.objectId === row.accountId &&
    row.evidence.source_context === "USER_PORTFOLIO" &&
    ((row.outcome === "DENIED" &&
      ["TENANT_INACTIVE", "MEMBERSHIP_INACTIVE", "ACCOUNT_INACTIVE", "ACCESS_INACTIVE"].includes(
        row.reasonCode ?? "",
      )) ||
      (row.outcome === "FAILED" &&
        ["DUPLICATE_ACTIVE_MEMBERSHIP", "DUPLICATE_ACTIVE_ACCOUNT_ACCESS", "AUTHORITY_TUPLE_MISMATCH"].includes(
          row.reasonCode ?? "",
        )))
  );
}

function permissiveInsertAllowed(row: AuditRow, session: SessionContext, i2bPolicy: typeof oldI2bDenialPolicy) {
  return i2bPolicy(row, session) || i2cBootstrapPolicy(row, session) || i5ResearchDenialPolicy(row, session);
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

  it("models the permissive RLS algebra and closes the account-scope Research bypass through I2-B", () => {
    const validI2bRow = { ...i2bAccountDenialRow };
    const validI5AccountRow: AuditRow = {
      ...i2bAccountDenialRow,
      evidence: {
        operation: "RESEARCH_INVESTIGATION_CREATE_V1",
        capability: "RESEARCH_MUTATE",
        source_context: "USER_PORTFOLIO",
      },
    };

    expect(permissiveInsertAllowed(validI2bRow, i2bSession, correctedI2bDenialPolicy)).toBe(true);
    expect(permissiveInsertAllowed(validI5AccountRow, i5Session, correctedI2bDenialPolicy)).toBe(true);
    expect(permissiveInsertAllowed(validI5AccountRow, i5Session, oldI2bDenialPolicy)).toBe(true);

    for (const badEvidence of [
      {},
      { operation: "ACCOUNT_CONTEXT_RESOLVE", capability: "RESEARCH_MUTATE", source_context: "USER_PORTFOLIO" },
      { operation: "RESEARCH_INVESTIGATION_CREATE_V1", capability: "ACCOUNT_AUTHORITY_READ", source_context: "USER_PORTFOLIO" },
      { operation: "RESEARCH_INVESTIGATION_CREATE_V1", capability: "RESEARCH_MUTATE" },
      { operation: "RESEARCH_INVESTIGATION_CREATE_V1", capability: "RESEARCH_MUTATE", source_context: "PURE_RESEARCH" },
    ]) {
      const malformedResearchRow = { ...validI5AccountRow, evidence: badEvidence };
      expect(oldI2bDenialPolicy(malformedResearchRow, i5Session)).toBe(true);
      expect(i5ResearchDenialPolicy(malformedResearchRow, i5Session)).toBe(false);
      expect(permissiveInsertAllowed(malformedResearchRow, i5Session, oldI2bDenialPolicy)).toBe(true);
      expect(permissiveInsertAllowed(malformedResearchRow, i5Session, correctedI2bDenialPolicy)).toBe(false);
    }

    expect(
      permissiveInsertAllowed(validI5AccountRow, { ...i5Session, operation: "ACCOUNT_CONTEXT_RESOLVE" }, correctedI2bDenialPolicy),
    ).toBe(false);
    expect(
      permissiveInsertAllowed(validI5AccountRow, { ...i5Session, capability: "ACCOUNT_AUTHORITY_READ" }, correctedI2bDenialPolicy),
    ).toBe(false);
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
    expect(normalized).toContain("pol.polpermissive");
    expect(normalized).toContain("owned audit policies must declare the intended permissive or model");
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
