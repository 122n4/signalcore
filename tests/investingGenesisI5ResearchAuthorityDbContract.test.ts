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

const pg17EvidenceRegex = {
  i2bOperation:
    /coalesce\s*\(\s*\(*\s*evidence\s*->>\s*'operation'\s*\)*\s*,\s*''\s*\)\s*<>\s*'research_investigation_create_v1'/,
  i2bCapability: /coalesce\s*\(\s*\(*\s*evidence\s*->>\s*'capability'\s*\)*\s*,\s*''\s*\)\s*<>\s*'research_mutate'/,
  i5Operation: /\(*\s*evidence\s*->>\s*'operation'\s*\)*\s*=\s*'research_investigation_create_v1'/,
  i5Capability: /\(*\s*evidence\s*->>\s*'capability'\s*\)*\s*=\s*'research_mutate'/,
};

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
  operationScope?: "ACCOUNT_SCOPE" | "TENANT_SCOPE" | "DOMAIN_SCOPE" | "UNKNOWN_SCOPE";
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

type PreAuthorityAuditRow = {
  externalProvider: "CLERK";
  externalSubjectHash: string;
  correlationId: string;
  operation: "ACCOUNT_CONTEXT_RESOLVE" | "RESEARCH_INVESTIGATION_CREATE_V1";
  operationScope: "ACCOUNT_SCOPE" | "TENANT_SCOPE" | "DOMAIN_SCOPE";
  selectorKind: "ACCOUNT_ID" | "TENANT_ID";
  selectorHash: string;
  resolutionStage: string;
  outcome: "DENIED" | "ERROR" | "SUCCEEDED";
  reasonCode: string;
};

type AuthorityGraph = {
  principal: {
    principalId: string;
    externalProvider: "CLERK";
    externalSubject: string;
    state: "ACTIVE" | "DISABLED";
  };
  tenant: {
    tenantId: string;
    state: "ACTIVE" | "SUSPENDED" | "CLOSED";
  };
  membership: {
    tenantMembershipId: string;
    tenantId: string;
    principalId: string;
    role: "OWNER";
    state: "ACTIVE" | "REVOKED";
  };
  account: {
    accountId: string;
    tenantId: string;
    initialTenantMembershipId: string;
    initialPrincipalId: string;
    state: "ACTIVE" | "FROZEN" | "CLOSED";
  };
  accountAccess: {
    accountAccessId: string;
    accountId: string;
    tenantId: string;
    tenantMembershipId: string;
    principalId: string;
    role: "OWNER";
    state: "ACTIVE" | "REVOKED";
  };
};

const modelIds = {
  principalId: "11111111-1111-4111-8111-111111111111",
  tenantId: "22222222-2222-4222-8222-222222222222",
  accountId: "33333333-3333-4333-8333-333333333333",
  tenantMembershipId: "66666666-6666-4666-8666-666666666666",
  accountAccessId: "77777777-7777-4777-8777-777777777777",
};

const i2bSession: SessionContext = {
  operation: "ACCOUNT_CONTEXT_RESOLVE",
  capability: "ACCOUNT_AUTHORITY_READ",
  operationScope: "ACCOUNT_SCOPE",
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
  operationScope: "ACCOUNT_SCOPE",
};

const i2cSession: SessionContext = {
  ...i2bSession,
  operation: "INITIAL_PERSONAL_BOOTSTRAP",
  capability: "AUTHORITY_BOOTSTRAP",
  operationScope: "DOMAIN_SCOPE",
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

const cleanPreAuthoritySession: SessionContext = {
  ...i2bSession,
  operation: undefined,
  capability: undefined,
};

const i2cBootstrapRow: AuditRow = {
  ...i2bAccountDenialRow,
  action: "AUTHORITY_BOOTSTRAP_FAILED",
  objectType: "ACCOUNT",
  outcome: "DENIED",
  reasonCode: "ACCESS_INACTIVE",
};

const validI2bPreAuthorityRow: PreAuthorityAuditRow = {
  externalProvider: "CLERK",
  externalSubjectHash: "a".repeat(64),
  correlationId: "correlation-id-123456",
  operation: "ACCOUNT_CONTEXT_RESOLVE",
  operationScope: "ACCOUNT_SCOPE",
  selectorKind: "ACCOUNT_ID",
  selectorHash: "b".repeat(64),
  resolutionStage: "ACCOUNT_SELECTOR_LOOKUP",
  outcome: "DENIED",
  reasonCode: "ACCOUNT_SELECTOR_NOT_ACCESSIBLE",
};

const validI5PreAuthorityRow: PreAuthorityAuditRow = {
  ...validI2bPreAuthorityRow,
  operation: "RESEARCH_INVESTIGATION_CREATE_V1",
  operationScope: "ACCOUNT_SCOPE",
  selectorKind: "ACCOUNT_ID",
  resolutionStage: "ACCOUNT_ACCESS_LOOKUP",
  reasonCode: "ACCESS_INACTIVE",
};

const validI5TenantPreAuthorityRow: PreAuthorityAuditRow = {
  ...validI2bPreAuthorityRow,
  operation: "RESEARCH_INVESTIGATION_CREATE_V1",
  operationScope: "TENANT_SCOPE",
  selectorKind: "TENANT_ID",
  resolutionStage: "TENANT_SELECTOR_LOOKUP",
  reasonCode: "TENANT_SELECTOR_NOT_ACCESSIBLE",
};

const authorityGraph: AuthorityGraph = {
  principal: {
    principalId: modelIds.principalId,
    externalProvider: "CLERK",
    externalSubject: "user_clerk_123",
    state: "ACTIVE",
  },
  tenant: {
    tenantId: modelIds.tenantId,
    state: "ACTIVE",
  },
  membership: {
    tenantMembershipId: modelIds.tenantMembershipId,
    tenantId: modelIds.tenantId,
    principalId: modelIds.principalId,
    role: "OWNER",
    state: "ACTIVE",
  },
  account: {
    accountId: modelIds.accountId,
    tenantId: modelIds.tenantId,
    initialTenantMembershipId: modelIds.tenantMembershipId,
    initialPrincipalId: modelIds.principalId,
    state: "ACTIVE",
  },
  accountAccess: {
    accountAccessId: modelIds.accountAccessId,
    accountId: modelIds.accountId,
    tenantId: modelIds.tenantId,
    tenantMembershipId: modelIds.tenantMembershipId,
    principalId: modelIds.principalId,
    role: "OWNER",
    state: "ACTIVE",
  },
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
  const isExactI2bSession =
    session.operation === "ACCOUNT_CONTEXT_RESOLVE" && session.capability === "ACCOUNT_AUTHORITY_READ";
  const isResearchShapedEvidence =
    row.evidence.operation === "RESEARCH_INVESTIGATION_CREATE_V1" ||
    row.evidence.capability === "RESEARCH_MUTATE" ||
    Object.hasOwn(row.evidence, "source_context");
  return isExactI2bSession && !isResearchShapedEvidence && oldI2bDenialPolicy(row, session);
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
      session.operationScope === "TENANT_SCOPE" &&
      row.tenantId === session.tenantId &&
      (session.accountId ?? "") === "" &&
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
    session.operationScope === "ACCOUNT_SCOPE" &&
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

function principalReadPolicy(graph: AuthorityGraph, session: SessionContext) {
  return (
    graph.principal.externalProvider === session.externalProvider &&
    graph.principal.externalSubject === session.externalSubject
  );
}

function oldI2bAccountReadPolicy(graph: AuthorityGraph, session: SessionContext) {
  return (
    graph.account.accountId === session.accountId &&
    graph.account.initialPrincipalId === session.principalId &&
    graph.account.initialTenantMembershipId !== "" &&
    graph.principal.principalId === graph.account.initialPrincipalId &&
    graph.principal.externalProvider === session.externalProvider &&
    graph.principal.externalSubject === session.externalSubject &&
    graph.principal.state === "ACTIVE"
  );
}

function correctedI2bAccountReadPolicy(graph: AuthorityGraph, session: SessionContext) {
  return (
    session.operation === "ACCOUNT_CONTEXT_RESOLVE" &&
    session.capability === "ACCOUNT_AUTHORITY_READ" &&
    oldI2bAccountReadPolicy(graph, session)
  );
}

function oldI2bTenantReadPolicy(graph: AuthorityGraph, session: SessionContext) {
  return (
    graph.tenant.tenantId === session.tenantId &&
    graph.account.accountId === session.accountId &&
    graph.account.tenantId === graph.tenant.tenantId &&
    graph.account.initialPrincipalId === session.principalId &&
    graph.principal.principalId === graph.account.initialPrincipalId &&
    graph.principal.externalProvider === session.externalProvider &&
    graph.principal.externalSubject === session.externalSubject &&
    graph.principal.state === "ACTIVE"
  );
}

function correctedI2bTenantReadPolicy(graph: AuthorityGraph, session: SessionContext) {
  return (
    session.operation === "ACCOUNT_CONTEXT_RESOLVE" &&
    session.capability === "ACCOUNT_AUTHORITY_READ" &&
    oldI2bTenantReadPolicy(graph, session)
  );
}

function oldI2bTenantMembershipReadPolicy(graph: AuthorityGraph, session: SessionContext) {
  return (
    graph.membership.tenantId === session.tenantId &&
    graph.membership.role === "OWNER" &&
    graph.membership.state === "ACTIVE" &&
    graph.principal.principalId === graph.membership.principalId &&
    graph.principal.externalProvider === session.externalProvider &&
    graph.principal.externalSubject === session.externalSubject &&
    graph.principal.state === "ACTIVE"
  );
}

function correctedI2bTenantMembershipReadPolicy(graph: AuthorityGraph, session: SessionContext) {
  return (
    session.operation === "ACCOUNT_CONTEXT_RESOLVE" &&
    session.capability === "ACCOUNT_AUTHORITY_READ" &&
    oldI2bTenantMembershipReadPolicy(graph, session)
  );
}

function oldI2bAccountAccessReadPolicy(graph: AuthorityGraph, session: SessionContext) {
  return (
    graph.accountAccess.accountId === session.accountId &&
    graph.accountAccess.tenantId === session.tenantId &&
    graph.accountAccess.role === "OWNER" &&
    graph.accountAccess.state === "ACTIVE" &&
    graph.principal.externalProvider === session.externalProvider &&
    graph.principal.externalSubject === session.externalSubject &&
    graph.principal.state === "ACTIVE" &&
    graph.membership.principalId === graph.principal.principalId &&
    graph.membership.tenantId === graph.accountAccess.tenantId &&
    graph.membership.tenantMembershipId === graph.accountAccess.tenantMembershipId &&
    graph.membership.role === "OWNER" &&
    graph.membership.state === "ACTIVE"
  );
}

function correctedI2bAccountAccessReadPolicy(graph: AuthorityGraph, session: SessionContext) {
  return (
    session.operation === "ACCOUNT_CONTEXT_RESOLVE" &&
    session.capability === "ACCOUNT_AUTHORITY_READ" &&
    oldI2bAccountAccessReadPolicy(graph, session)
  );
}

function i2cTenantReadPolicy(graph: AuthorityGraph, session: SessionContext) {
  return (
    session.operation === "INITIAL_PERSONAL_BOOTSTRAP" &&
    session.capability === "AUTHORITY_BOOTSTRAP" &&
    graph.tenant.tenantId === session.tenantId &&
    graph.principal.principalId === session.principalId &&
    graph.principal.externalProvider === session.externalProvider &&
    graph.principal.externalSubject === session.externalSubject &&
    graph.principal.state === "ACTIVE"
  );
}

function i2cTenantMembershipReadPolicy(graph: AuthorityGraph, session: SessionContext) {
  return (
    session.operation === "INITIAL_PERSONAL_BOOTSTRAP" &&
    session.capability === "AUTHORITY_BOOTSTRAP" &&
    graph.membership.principalId === session.principalId &&
    graph.membership.role === "OWNER" &&
    graph.principal.principalId === graph.membership.principalId &&
    graph.principal.externalProvider === session.externalProvider &&
    graph.principal.externalSubject === session.externalSubject
  );
}

function i2cAccountReadPolicy(graph: AuthorityGraph, session: SessionContext) {
  return (
    session.operation === "INITIAL_PERSONAL_BOOTSTRAP" &&
    session.capability === "AUTHORITY_BOOTSTRAP" &&
    graph.account.initialPrincipalId === session.principalId &&
    graph.principal.principalId === graph.account.initialPrincipalId &&
    graph.principal.externalProvider === session.externalProvider &&
    graph.principal.externalSubject === session.externalSubject
  );
}

function i2cAccountAccessReadPolicy(graph: AuthorityGraph, session: SessionContext) {
  return (
    session.operation === "INITIAL_PERSONAL_BOOTSTRAP" &&
    session.capability === "AUTHORITY_BOOTSTRAP" &&
    graph.accountAccess.principalId === session.principalId &&
    graph.accountAccess.role === "OWNER" &&
    graph.account.accountId === graph.accountAccess.accountId &&
    graph.account.tenantId === graph.accountAccess.tenantId &&
    graph.account.initialPrincipalId === graph.accountAccess.principalId
  );
}

function i5TenantReadPolicy(graph: AuthorityGraph, session: SessionContext) {
  return (
    session.operation === "RESEARCH_INVESTIGATION_CREATE_V1" &&
    session.capability === "RESEARCH_MUTATE" &&
    session.operationScope === "TENANT_SCOPE" &&
    (session.accountId ?? "") === "" &&
    graph.tenant.tenantId === session.tenantId &&
    graph.principal.principalId === session.principalId &&
    graph.principal.externalProvider === session.externalProvider &&
    graph.principal.externalSubject === session.externalSubject &&
    graph.principal.state === "ACTIVE" &&
    graph.membership.principalId === graph.principal.principalId &&
    graph.membership.tenantId === graph.tenant.tenantId &&
    graph.membership.role === "OWNER"
  );
}

function i5TenantMembershipReadPolicy(graph: AuthorityGraph, session: SessionContext) {
  return (
    session.operation === "RESEARCH_INVESTIGATION_CREATE_V1" &&
    session.capability === "RESEARCH_MUTATE" &&
    session.operationScope === "TENANT_SCOPE" &&
    (session.accountId ?? "") === "" &&
    graph.membership.tenantId === session.tenantId &&
    graph.membership.principalId === session.principalId &&
    graph.membership.role === "OWNER" &&
    graph.principal.principalId === graph.membership.principalId &&
    graph.principal.externalProvider === session.externalProvider &&
    graph.principal.externalSubject === session.externalSubject &&
    graph.principal.state === "ACTIVE"
  );
}

function i5AccountReadPolicy(graph: AuthorityGraph, session: SessionContext) {
  return (
    session.operation === "RESEARCH_INVESTIGATION_CREATE_V1" &&
    session.capability === "RESEARCH_MUTATE" &&
    session.operationScope === "ACCOUNT_SCOPE" &&
    (session.accountId ?? "") !== "" &&
    graph.account.accountId === session.accountId &&
    graph.account.initialPrincipalId === session.principalId &&
    graph.principal.principalId === graph.account.initialPrincipalId &&
    graph.principal.externalProvider === session.externalProvider &&
    graph.principal.externalSubject === session.externalSubject &&
    graph.principal.state === "ACTIVE"
  );
}

function i5AccountScopeTenantReadPolicy(graph: AuthorityGraph, session: SessionContext) {
  return (
    session.operation === "RESEARCH_INVESTIGATION_CREATE_V1" &&
    session.capability === "RESEARCH_MUTATE" &&
    session.operationScope === "ACCOUNT_SCOPE" &&
    (session.accountId ?? "") !== "" &&
    graph.tenant.tenantId === session.tenantId &&
    graph.account.accountId === session.accountId &&
    graph.account.tenantId === graph.tenant.tenantId &&
    graph.account.initialPrincipalId === session.principalId
  );
}

function i5AccountScopeTenantMembershipReadPolicy(graph: AuthorityGraph, session: SessionContext) {
  return (
    session.operation === "RESEARCH_INVESTIGATION_CREATE_V1" &&
    session.capability === "RESEARCH_MUTATE" &&
    session.operationScope === "ACCOUNT_SCOPE" &&
    (session.accountId ?? "") !== "" &&
    graph.membership.tenantId === session.tenantId &&
    graph.membership.principalId === session.principalId &&
    graph.membership.role === "OWNER" &&
    graph.account.accountId === session.accountId &&
    graph.account.tenantId === graph.membership.tenantId &&
    graph.account.initialPrincipalId === graph.membership.principalId
  );
}

function i5AccountAccessReadPolicy(graph: AuthorityGraph, session: SessionContext) {
  return (
    session.operation === "RESEARCH_INVESTIGATION_CREATE_V1" &&
    session.capability === "RESEARCH_MUTATE" &&
    session.operationScope === "ACCOUNT_SCOPE" &&
    (session.accountId ?? "") !== "" &&
    graph.accountAccess.accountId === session.accountId &&
    graph.accountAccess.tenantId === session.tenantId &&
    graph.accountAccess.principalId === session.principalId &&
    graph.accountAccess.role === "OWNER" &&
    graph.account.accountId === graph.accountAccess.accountId &&
    graph.account.tenantId === graph.accountAccess.tenantId &&
    graph.account.initialPrincipalId === graph.accountAccess.principalId &&
    graph.membership.tenantMembershipId === graph.accountAccess.tenantMembershipId &&
    graph.membership.tenantId === graph.accountAccess.tenantId &&
    graph.membership.principalId === graph.accountAccess.principalId &&
    graph.membership.role === "OWNER"
  );
}

function effectiveAccountReadPolicy(graph: AuthorityGraph, session: SessionContext) {
  return (
    correctedI2bAccountReadPolicy(graph, session) ||
    i2cAccountReadPolicy(graph, session) ||
    i5AccountReadPolicy(graph, session)
  );
}

function effectiveTenantReadPolicy(graph: AuthorityGraph, session: SessionContext) {
  return (
    correctedI2bTenantReadPolicy(graph, session) ||
    i2cTenantReadPolicy(graph, session) ||
    i5TenantReadPolicy(graph, session) ||
    i5AccountScopeTenantReadPolicy(graph, session)
  );
}

function effectiveTenantMembershipReadPolicy(graph: AuthorityGraph, session: SessionContext) {
  return (
    correctedI2bTenantMembershipReadPolicy(graph, session) ||
    i2cTenantMembershipReadPolicy(graph, session) ||
    i5TenantMembershipReadPolicy(graph, session) ||
    i5AccountScopeTenantMembershipReadPolicy(graph, session)
  );
}

function effectiveAccountAccessReadPolicy(graph: AuthorityGraph, session: SessionContext) {
  return (
    correctedI2bAccountAccessReadPolicy(graph, session) ||
    i2cAccountAccessReadPolicy(graph, session) ||
    i5AccountAccessReadPolicy(graph, session)
  );
}

function i5AccountScopeCompleteGraphVisible(graph: AuthorityGraph, session: SessionContext) {
  return (
    principalReadPolicy(graph, session) &&
    effectiveAccountReadPolicy(graph, session) &&
    effectiveTenantReadPolicy(graph, session) &&
    effectiveTenantMembershipReadPolicy(graph, session) &&
    effectiveAccountAccessReadPolicy(graph, session)
  );
}

function i5TenantScopeAuditAllowed(row: AuditRow, session: SessionContext, graph: AuthorityGraph) {
  const tenantVisible = effectiveTenantReadPolicy(graph, session);
  const membershipVisible =
    effectiveTenantMembershipReadPolicy(graph, session);
  return i5ResearchDenialPolicy(row, session) && tenantVisible && membershipVisible;
}

function commonPreAuthorityChecks(row: PreAuthorityAuditRow) {
  return (
    row.externalProvider === "CLERK" &&
    (row.outcome === "DENIED" || row.outcome === "ERROR") &&
    /^[0-9a-f]{64}$/.test(row.externalSubjectHash) &&
    /^[0-9a-f]{64}$/.test(row.selectorHash) &&
    row.correlationId.length >= 16 &&
    row.correlationId.length <= 512
  );
}

function oldPreAuthorityPolicy(row: PreAuthorityAuditRow, session: SessionContext) {
  return (
    commonPreAuthorityChecks(row) &&
    ((row.operation === "ACCOUNT_CONTEXT_RESOLVE" &&
      row.operationScope === "ACCOUNT_SCOPE" &&
      row.selectorKind === "ACCOUNT_ID") ||
      (session.operation === "RESEARCH_INVESTIGATION_CREATE_V1" &&
        session.capability === "RESEARCH_MUTATE" &&
        row.operation === "RESEARCH_INVESTIGATION_CREATE_V1" &&
        ((session.operationScope === "TENANT_SCOPE" &&
          row.operationScope === "TENANT_SCOPE" &&
          row.selectorKind === "TENANT_ID") ||
          (session.operationScope === "ACCOUNT_SCOPE" &&
            row.operationScope === "ACCOUNT_SCOPE" &&
            row.selectorKind === "ACCOUNT_ID"))))
  );
}

function correctedPreAuthorityPolicy(row: PreAuthorityAuditRow, session: SessionContext) {
  const cleanI2bPreAuthoritySession = (session.operation ?? "") === "" && (session.capability ?? "") === "";
  return (
    commonPreAuthorityChecks(row) &&
    ((cleanI2bPreAuthoritySession &&
      row.operation === "ACCOUNT_CONTEXT_RESOLVE" &&
      row.operationScope === "ACCOUNT_SCOPE" &&
      row.selectorKind === "ACCOUNT_ID") ||
      (session.operation === "RESEARCH_INVESTIGATION_CREATE_V1" &&
        session.capability === "RESEARCH_MUTATE" &&
        row.operation === "RESEARCH_INVESTIGATION_CREATE_V1" &&
        ((session.operationScope === "TENANT_SCOPE" &&
          row.operationScope === "TENANT_SCOPE" &&
          row.selectorKind === "TENANT_ID") ||
          (session.operationScope === "ACCOUNT_SCOPE" &&
            row.operationScope === "ACCOUNT_SCOPE" &&
            row.selectorKind === "ACCOUNT_ID"))))
  );
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
    expect(policy).toContain("coalesce(current_setting('syntrake.investing.operation', true), '') = ''");
    expect(policy).toContain("coalesce(current_setting('syntrake.investing.capability', true), '') = ''");
    expect(policy).toContain("operation = 'account_context_resolve'");
    expect(policy).toContain("operation_scope = 'account_scope'");
    expect(policy).toContain("selector_kind = 'account_id'");
    expect(policy).toContain("current_setting('syntrake.investing.operation', true) = 'research_investigation_create_v1'");
    expect(policy).toContain("current_setting('syntrake.investing.capability', true) = 'research_mutate'");
    expect(policy).toContain("operation = 'research_investigation_create_v1'");
    expect(policy).toContain("current_setting('syntrake.investing.operation_scope', true) = 'tenant_scope'");
    expect(policy).toContain("operation_scope = 'tenant_scope' and selector_kind = 'tenant_id'");
    expect(policy).toContain("current_setting('syntrake.investing.operation_scope', true) = 'account_scope'");
    expect(policy).toContain("operation_scope = 'account_scope' and selector_kind = 'account_id'");
    expect(policy).not.toMatch(/operation\s+is\s+not\s+null/);
    expect(policy).not.toMatch(/operation_scope\s+is\s+not\s+null/);
    expect(policy).not.toMatch(/selector_kind\s+is\s+not\s+null/);
    expect(policy).not.toMatch(/\bwith check\s*\(\s*true\s*\)/);
  });

  it("models pre-authority policy algebra and closes Research-to-I2-B operation confusion", () => {
    expect(correctedPreAuthorityPolicy(validI2bPreAuthorityRow, cleanPreAuthoritySession)).toBe(true);
    expect(correctedPreAuthorityPolicy(validI2bPreAuthorityRow, { ...cleanPreAuthoritySession, operation: "" })).toBe(true);
    expect(correctedPreAuthorityPolicy(validI2bPreAuthorityRow, { ...cleanPreAuthoritySession, capability: "" })).toBe(true);
    expect(correctedPreAuthorityPolicy(validI5PreAuthorityRow, i5Session)).toBe(true);
    expect(
      correctedPreAuthorityPolicy(validI5TenantPreAuthorityRow, {
        ...i5Session,
        operationScope: "TENANT_SCOPE",
        accountId: undefined,
      }),
    ).toBe(true);
    expect(oldPreAuthorityPolicy(validI2bPreAuthorityRow, i5Session)).toBe(true);
    expect(correctedPreAuthorityPolicy(validI2bPreAuthorityRow, i5Session)).toBe(false);
    expect(correctedPreAuthorityPolicy(validI5PreAuthorityRow, { ...i5Session, operationScope: "TENANT_SCOPE" })).toBe(false);
    expect(correctedPreAuthorityPolicy(validI5TenantPreAuthorityRow, i5Session)).toBe(false);
    expect(correctedPreAuthorityPolicy(validI5PreAuthorityRow, { ...i5Session, operationScope: undefined })).toBe(false);
    expect(correctedPreAuthorityPolicy(validI5PreAuthorityRow, { ...i5Session, operationScope: "UNKNOWN_SCOPE" })).toBe(false);

    for (const session of [
      { ...i2bSession, operation: "RESEARCH_INVESTIGATION_CREATE_V1", capability: "ACCOUNT_AUTHORITY_READ" },
      { ...i2bSession, operation: "ACCOUNT_CONTEXT_RESOLVE", capability: "RESEARCH_MUTATE" },
      i2cSession,
      { ...i2bSession, operation: "UNRELATED_OPERATION", capability: "UNRELATED_CAPABILITY" },
      { ...i2bSession, operation: "ACCOUNT_CONTEXT_RESOLVE", capability: "ACCOUNT_AUTHORITY_READ" },
    ]) {
      expect(correctedPreAuthorityPolicy(validI2bPreAuthorityRow, session)).toBe(false);
    }

    expect(correctedPreAuthorityPolicy(validI5PreAuthorityRow, cleanPreAuthoritySession)).toBe(false);
  });

  it("adds a disjoint canonical Research denial policy with exact tenant and account scope semantics", () => {
    const normalized = normalize(read(migrationPath));
    const i2bPolicy = sliceBetween(
      normalized,
      "create policy audit_events_i2b_authority_denial_insert",
      "create policy audit_events_i5_research_investigation_create_denial_insert",
    );
    const policy = sliceBetween(normalized, "create policy audit_events_i5_research_investigation_create_denial_insert", "reset role;");

    expect(i2bPolicy).toContain("current_setting('syntrake.investing.operation', true) = 'account_context_resolve'");
    expect(i2bPolicy).toContain("current_setting('syntrake.investing.capability', true) = 'account_authority_read'");
    expect(i2bPolicy).toContain("coalesce(evidence ->> 'operation', '') <> 'research_investigation_create_v1'");
    expect(i2bPolicy).toContain("coalesce(evidence ->> 'capability', '') <> 'research_mutate'");
    expect(i2bPolicy).toContain("not (evidence ? 'source_context')");
    expect(i2bPolicy).not.toContain("is distinct from 'research_investigation_create_v1'");
    expect(i2bPolicy).not.toContain("is distinct from 'research_mutate'");
    expect(policy).toContain("current_setting('syntrake.investing.operation', true) = 'research_investigation_create_v1'");
    expect(policy).toContain("current_setting('syntrake.investing.capability', true) = 'research_mutate'");
    expect(policy).toContain("actor_kind = 'user_principal'");
    expect(policy).toContain("principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid");
    expect(policy).toContain("action = 'authority_access_denied'");
    expect(policy).toContain("evidence ->> 'operation' = 'research_investigation_create_v1'");
    expect(policy).toContain("evidence ->> 'capability' = 'research_mutate'");
    expect(policy).toContain("operation_scope = 'tenant_scope'");
    expect(policy).toContain("current_setting('syntrake.investing.operation_scope', true) = 'tenant_scope'");
    expect(policy).toContain("coalesce(current_setting('syntrake.investing.account_id', true), '') = ''");
    expect(policy).toContain("account_id is null");
    expect(policy).toContain("object_type = 'tenant'");
    expect(policy).toContain("object_id = tenant_id::text");
    expect(policy).toContain("source_context' in ('pure_research', 'test_portfolio')");
    expect(policy).toContain("operation_scope = 'account_scope'");
    expect(policy).toContain("current_setting('syntrake.investing.operation_scope', true) = 'account_scope'");
    expect(policy).toContain("account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid");
    expect(policy).toContain("object_type = 'account'");
    expect(policy).toContain("source_context' = 'user_portfolio'");
    expect(policy).toContain("from investing.principals p");
    expect(policy).toContain("from investing.tenants t");
    expect(policy).toContain("join investing.accounts a");
    expect(policy).not.toContain("to service_role");
    expect(policy).not.toMatch(/\bwith check\s*\(\s*true\s*\)/);
  });

  it("adds exact Research tenant-scope read substrate without synthetic account authority", () => {
    const normalized = normalize(read(migrationPath));
    const i2bAccountPolicy = sliceBetween(
      normalized,
      "create policy accounts_i2b_authority_read",
      "drop policy tenants_i2b_authority_read",
    );
    const i2bTenantPolicy = sliceBetween(
      normalized,
      "create policy tenants_i2b_authority_read",
      "drop policy tenant_memberships_i2b_authority_read",
    );
    const i2bMembershipPolicy = sliceBetween(
      normalized,
      "create policy tenant_memberships_i2b_authority_read",
      "create policy tenants_i5_research_authority_read",
    );
    const tenantPolicy = sliceBetween(
      normalized,
      "create policy tenants_i5_research_authority_read",
      "create policy tenant_memberships_i5_research_authority_read",
    );
    const membershipPolicy = sliceBetween(
      normalized,
      "create policy tenant_memberships_i5_research_authority_read",
      "create policy accounts_i5_research_account_authority_read",
    );
    const i2bAccountAccessPolicy = sliceBetween(
      normalized,
      "create policy account_access_i2b_authority_read",
      "create policy tenants_i5_research_authority_read",
    );

    expect(normalized).toContain("drop policy accounts_i2b_authority_read on investing.accounts");
    expect(normalized).toContain("drop policy tenants_i2b_authority_read on investing.tenants");
    expect(normalized).toContain("drop policy tenant_memberships_i2b_authority_read on investing.tenant_memberships");
    expect(normalized).toContain("drop policy account_access_i2b_authority_read on investing.account_access");
    for (const policy of [i2bAccountPolicy, i2bTenantPolicy, i2bMembershipPolicy, i2bAccountAccessPolicy]) {
      expect(policy).toContain("for select");
      expect(policy).toContain("to investing_app");
      expect(policy).toContain("current_setting('syntrake.investing.operation', true) = 'account_context_resolve'");
      expect(policy).toContain("current_setting('syntrake.investing.capability', true) = 'account_authority_read'");
      expect(policy).toContain("p.state = 'active'");
      expect(policy).not.toContain("research_investigation_create_v1");
      expect(policy).not.toContain("research_mutate");
      expect(policy).not.toContain("to service_role");
    }
    for (const policy of [i2bTenantPolicy, i2bMembershipPolicy, i2bAccountAccessPolicy]) {
      expect(policy).toContain("nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid");
    }
    expect(i2bMembershipPolicy).toContain("role = 'owner'");

    for (const policy of [tenantPolicy, membershipPolicy]) {
      expect(policy).toContain("for select");
      expect(policy).toContain("to investing_app");
      expect(policy).toContain("current_setting('syntrake.investing.operation', true) = 'research_investigation_create_v1'");
      expect(policy).toContain("current_setting('syntrake.investing.capability', true) = 'research_mutate'");
      expect(policy).toContain("current_setting('syntrake.investing.operation_scope', true) = 'tenant_scope'");
      expect(policy).toContain("coalesce(current_setting('syntrake.investing.account_id', true), '') = ''");
      expect(policy).toContain("nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid");
      expect(policy).toContain("nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid");
      expect(policy).toContain("role = 'owner'");
      expect(policy).toContain("p.state = 'active'");
      expect(policy).not.toContain("account_id = nullif");
      expect(policy).not.toContain("to service_role");
    }

    expect(tenantPolicy).toContain("join investing.tenant_memberships tm");
    expect(tenantPolicy).toContain("tm.principal_id = p.principal_id");
    expect(tenantPolicy).toContain("tm.tenant_id = tenants.tenant_id");
    expect(membershipPolicy).toContain("p.principal_id = tenant_memberships.principal_id");
    expect(normalized).toContain("tenants_i5_research_authority_read");
    expect(normalized).toContain("tenant_memberships_i5_research_authority_read");
    expect(normalized).toContain("expected exact research tenant-scope read policies");
    expect(normalized).toContain("expected exact i2-b account-context read policies");
    expect(normalized).toContain("shared roles must not gain tenant authority read privileges");
  });

  it("adds exact Research account-scope read substrate with lifecycle-visible graph binding", () => {
    const normalized = normalize(read(migrationPath));
    const accountPolicy = sliceBetween(
      normalized,
      "create policy accounts_i5_research_account_authority_read",
      "create policy tenants_i5_research_account_authority_read",
    );
    const tenantPolicy = sliceBetween(
      normalized,
      "create policy tenants_i5_research_account_authority_read",
      "create policy tenant_memberships_i5_research_account_authority_read",
    );
    const membershipPolicy = sliceBetween(
      normalized,
      "create policy tenant_memberships_i5_research_account_authority_read",
      "create policy account_access_i5_research_account_authority_read",
    );
    const accessPolicy = sliceBetween(
      normalized,
      "create policy account_access_i5_research_account_authority_read",
      "drop policy audit_events_i2b_authority_denial_insert",
    );

    for (const policy of [accountPolicy, tenantPolicy, membershipPolicy, accessPolicy]) {
      expect(policy).toContain("for select");
      expect(policy).toContain("to investing_app");
      expect(policy).toContain("current_setting('syntrake.investing.operation', true) = 'research_investigation_create_v1'");
      expect(policy).toContain("current_setting('syntrake.investing.capability', true) = 'research_mutate'");
      expect(policy).toContain("current_setting('syntrake.investing.operation_scope', true) = 'account_scope'");
      expect(policy).toContain("coalesce(current_setting('syntrake.investing.account_id', true), '') <> ''");
      expect(policy).not.toContain("capability', true) = 'account_authority_read'");
      expect(policy).not.toContain("to service_role");
    }

    expect(accountPolicy).toContain("account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid");
    expect(accountPolicy).toContain("initial_principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid");
    expect(accountPolicy).not.toContain("accounts.state = 'active'");
    expect(tenantPolicy).toContain("a.account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid");
    expect(tenantPolicy).toContain("a.tenant_id = tenants.tenant_id");
    expect(tenantPolicy).not.toContain("t.state = 'active'");
    expect(membershipPolicy).toContain("principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid");
    expect(membershipPolicy).toContain("role = 'owner'");
    expect(membershipPolicy).not.toContain("state = 'active'");
    expect(accessPolicy).toContain("principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid");
    expect(accessPolicy).toContain("tm.tenant_membership_id = account_access.tenant_membership_id");
    expect(accessPolicy).toContain("tm.role = 'owner'");
    expect(accessPolicy).not.toContain("account_access.state = 'active'");
    expect(normalized).toContain("expected exact research account-scope read policies");
  });

  it("models effective tenant read policy OR-composition and isolates stale Research account GUCs", () => {
    const tenantSession = { ...i5Session, operationScope: "TENANT_SCOPE" as const, accountId: undefined };
    const matchingAccountResearchSession = { ...i5Session, operationScope: "TENANT_SCOPE" as const, accountId: modelIds.accountId };
    const unrelatedAccountResearchSession = {
      ...i5Session,
      operationScope: "TENANT_SCOPE" as const,
      accountId: "44444444-4444-4444-8444-444444444444",
    };

    expect(oldI2bTenantReadPolicy(authorityGraph, matchingAccountResearchSession)).toBe(true);
    expect(oldI2bTenantMembershipReadPolicy(authorityGraph, matchingAccountResearchSession)).toBe(true);
    expect(correctedI2bTenantReadPolicy(authorityGraph, matchingAccountResearchSession)).toBe(false);
    expect(correctedI2bTenantMembershipReadPolicy(authorityGraph, matchingAccountResearchSession)).toBe(false);
    expect(i5TenantReadPolicy(authorityGraph, matchingAccountResearchSession)).toBe(false);
    expect(i5TenantMembershipReadPolicy(authorityGraph, matchingAccountResearchSession)).toBe(false);
    expect(i5AccountReadPolicy(authorityGraph, matchingAccountResearchSession)).toBe(false);
    expect(i5AccountScopeTenantReadPolicy(authorityGraph, matchingAccountResearchSession)).toBe(false);
    expect(i5AccountScopeTenantMembershipReadPolicy(authorityGraph, matchingAccountResearchSession)).toBe(false);
    expect(i5AccountAccessReadPolicy(authorityGraph, matchingAccountResearchSession)).toBe(false);
    expect(correctedI2bTenantReadPolicy(authorityGraph, unrelatedAccountResearchSession)).toBe(false);
    expect(correctedI2bTenantMembershipReadPolicy(authorityGraph, unrelatedAccountResearchSession)).toBe(false);
    expect(i5TenantReadPolicy(authorityGraph, unrelatedAccountResearchSession)).toBe(false);
    expect(i5TenantMembershipReadPolicy(authorityGraph, unrelatedAccountResearchSession)).toBe(false);
    expect(i5AccountReadPolicy(authorityGraph, unrelatedAccountResearchSession)).toBe(false);
    expect(i5AccountAccessReadPolicy(authorityGraph, unrelatedAccountResearchSession)).toBe(false);
    expect(i5TenantReadPolicy(authorityGraph, tenantSession)).toBe(true);
    expect(i5TenantMembershipReadPolicy(authorityGraph, tenantSession)).toBe(true);
    expect(correctedI2bTenantReadPolicy(authorityGraph, i2bSession)).toBe(true);
    expect(correctedI2bTenantMembershipReadPolicy(authorityGraph, i2bSession)).toBe(true);
  });

  it("models complete Research USER_PORTFOLIO account-scope graph and tuple isolation", () => {
    const accountSession = { ...i5Session };
    const tenantScopeSession = { ...i5Session, operationScope: "TENANT_SCOPE" as const, accountId: undefined };
    const missingScopeSession = { ...i5Session, operationScope: undefined };
    const unknownScopeSession = { ...i5Session, operationScope: "UNKNOWN_SCOPE" as const };

    expect(i5AccountScopeCompleteGraphVisible(authorityGraph, accountSession)).toBe(true);
    expect(effectiveAccountReadPolicy(authorityGraph, accountSession)).toBe(true);
    expect(effectiveTenantReadPolicy(authorityGraph, accountSession)).toBe(true);
    expect(effectiveTenantMembershipReadPolicy(authorityGraph, accountSession)).toBe(true);
    expect(effectiveAccountAccessReadPolicy(authorityGraph, accountSession)).toBe(true);

    for (const lifecycleGraph of [
      { ...authorityGraph, account: { ...authorityGraph.account, state: "FROZEN" as const } },
      { ...authorityGraph, tenant: { ...authorityGraph.tenant, state: "SUSPENDED" as const } },
      { ...authorityGraph, membership: { ...authorityGraph.membership, state: "REVOKED" as const } },
      { ...authorityGraph, accountAccess: { ...authorityGraph.accountAccess, state: "REVOKED" as const } },
    ]) {
      expect(i5AccountScopeCompleteGraphVisible(lifecycleGraph, accountSession)).toBe(true);
    }

    expect(
      i5AccountScopeCompleteGraphVisible(
        { ...authorityGraph, account: { ...authorityGraph.account, initialPrincipalId: "44444444-4444-4444-8444-444444444444" } },
        accountSession,
      ),
    ).toBe(false);
    expect(
      i5AccountScopeCompleteGraphVisible(
        { ...authorityGraph, account: { ...authorityGraph.account, tenantId: "55555555-5555-4555-8555-555555555555" } },
        accountSession,
      ),
    ).toBe(false);
    expect(
      i5AccountScopeCompleteGraphVisible(
        { ...authorityGraph, membership: { ...authorityGraph.membership, tenantId: "55555555-5555-4555-8555-555555555555" } },
        accountSession,
      ),
    ).toBe(false);
    expect(
      i5AccountScopeCompleteGraphVisible(
        { ...authorityGraph, membership: { ...authorityGraph.membership, principalId: "44444444-4444-4444-8444-444444444444" } },
        accountSession,
      ),
    ).toBe(false);
    expect(
      i5AccountScopeCompleteGraphVisible(
        { ...authorityGraph, accountAccess: { ...authorityGraph.accountAccess, principalId: "44444444-4444-4444-8444-444444444444" } },
        accountSession,
      ),
    ).toBe(false);
    expect(
      i5AccountScopeCompleteGraphVisible(
        { ...authorityGraph, accountAccess: { ...authorityGraph.accountAccess, tenantMembershipId: "88888888-8888-4888-8888-888888888888" } },
        accountSession,
      ),
    ).toBe(false);
    expect(i5AccountScopeCompleteGraphVisible(authorityGraph, tenantScopeSession)).toBe(false);
    expect(i5AccountScopeCompleteGraphVisible(authorityGraph, missingScopeSession)).toBe(false);
    expect(i5AccountScopeCompleteGraphVisible(authorityGraph, unknownScopeSession)).toBe(false);
    expect(i5AccountScopeCompleteGraphVisible(authorityGraph, { ...accountSession, accountId: undefined })).toBe(false);
    expect(i5AccountScopeCompleteGraphVisible(authorityGraph, { ...accountSession, accountId: "44444444-4444-4444-8444-444444444444" })).toBe(false);
    expect(i5AccountReadPolicy(authorityGraph, { ...accountSession, capability: "ACCOUNT_AUTHORITY_READ" })).toBe(false);
    expect(i5AccountReadPolicy(authorityGraph, { ...accountSession, operation: "ACCOUNT_CONTEXT_RESOLVE" })).toBe(false);
    expect(correctedI2bAccountReadPolicy(authorityGraph, i2bSession)).toBe(true);
    expect(correctedI2bAccountAccessReadPolicy(authorityGraph, i2bSession)).toBe(true);
    expect(i5AccountReadPolicy(authorityGraph, i2bSession)).toBe(false);
  });

  it("models Research tenant-scope audit without account GUC and fails closed across principal and scope boundaries", () => {
    const tenantDenialRow = {
      ...i2bAccountDenialRow,
      operationScope: "TENANT_SCOPE",
      tenantId: modelIds.tenantId,
      accountId: null,
      objectType: "TENANT",
      objectId: modelIds.tenantId,
      reasonCode: "TENANT_INACTIVE",
      evidence: {
        operation: "RESEARCH_INVESTIGATION_CREATE_V1",
        capability: "RESEARCH_MUTATE",
        source_context: "PURE_RESEARCH",
      },
    } satisfies AuditRow;
    const tenantSession = { ...i5Session, operationScope: "TENANT_SCOPE" as const, accountId: undefined };

    expect(i5TenantScopeAuditAllowed(tenantDenialRow, tenantSession, authorityGraph)).toBe(true);
    expect(
      i5TenantScopeAuditAllowed(
        { ...tenantDenialRow, evidence: { ...tenantDenialRow.evidence, source_context: "TEST_PORTFOLIO" } },
        tenantSession,
        authorityGraph,
      ),
    ).toBe(true);
    expect(i5TenantScopeAuditAllowed(tenantDenialRow, { ...tenantSession, accountId: modelIds.accountId }, authorityGraph)).toBe(false);
    expect(
      i5TenantScopeAuditAllowed(
        tenantDenialRow,
        { ...tenantSession, accountId: "44444444-4444-4444-8444-444444444444" },
        authorityGraph,
      ),
    ).toBe(false);
    expect(i5TenantScopeAuditAllowed(tenantDenialRow, { ...tenantSession, operation: "ACCOUNT_CONTEXT_RESOLVE" }, authorityGraph)).toBe(false);
    expect(i5TenantScopeAuditAllowed(tenantDenialRow, { ...tenantSession, capability: "ACCOUNT_AUTHORITY_READ" }, authorityGraph)).toBe(false);
    expect(i5TenantScopeAuditAllowed(tenantDenialRow, { ...tenantSession, operationScope: undefined }, authorityGraph)).toBe(false);
    expect(i5TenantScopeAuditAllowed(tenantDenialRow, { ...tenantSession, operationScope: "UNKNOWN_SCOPE" }, authorityGraph)).toBe(false);
    expect(i5TenantScopeAuditAllowed(tenantDenialRow, i2cSession, authorityGraph)).toBe(false);
    expect(
      i5TenantScopeAuditAllowed(tenantDenialRow, { ...tenantSession, principalId: "44444444-4444-4444-8444-444444444444" }, authorityGraph),
    ).toBe(false);
    expect(
      i5TenantScopeAuditAllowed({ ...tenantDenialRow, tenantId: "55555555-5555-4555-8555-555555555555" }, tenantSession, authorityGraph),
    ).toBe(false);

    const userPortfolioRow = {
      ...tenantDenialRow,
      operationScope: "ACCOUNT_SCOPE",
      accountId: modelIds.accountId,
      objectType: "ACCOUNT",
      objectId: modelIds.accountId,
      evidence: { ...tenantDenialRow.evidence, source_context: "USER_PORTFOLIO" },
    } satisfies AuditRow;
    expect(i5ResearchDenialPolicy(userPortfolioRow, tenantSession)).toBe(false);
    expect(i5ResearchDenialPolicy(userPortfolioRow, { ...tenantSession, accountId: modelIds.accountId })).toBe(false);
    expect(i5ResearchDenialPolicy(userPortfolioRow, { ...i5Session, operationScope: "ACCOUNT_SCOPE", accountId: modelIds.accountId })).toBe(true);
    expect(i5ResearchDenialPolicy(tenantDenialRow, { ...i5Session, operationScope: "ACCOUNT_SCOPE", accountId: modelIds.accountId })).toBe(false);
  });

  it("accepts PostgreSQL 17-normalized evidence expressions without weakening operator/value checks", () => {
    expect("coalesce((evidence ->> 'operation'), '') <> 'research_investigation_create_v1'").toMatch(
      pg17EvidenceRegex.i2bOperation,
    );
    expect("coalesce((evidence ->> 'capability'), '') <> 'research_mutate'").toMatch(pg17EvidenceRegex.i2bCapability);
    expect("((evidence ->> 'operation') = 'research_investigation_create_v1')").toMatch(pg17EvidenceRegex.i5Operation);
    expect("((evidence ->> 'capability') = 'research_mutate')").toMatch(pg17EvidenceRegex.i5Capability);

    for (const malformed of [
      ["coalesce((evidence ->> 'operation'), '') = 'research_investigation_create_v1'", pg17EvidenceRegex.i2bOperation],
      ["coalesce((evidence ->> 'wrong_key'), '') <> 'research_investigation_create_v1'", pg17EvidenceRegex.i2bOperation],
      ["coalesce((evidence ->> 'capability'), '') <> 'wrong_capability'", pg17EvidenceRegex.i2bCapability],
      ["((evidence ->> 'operation') <> 'research_investigation_create_v1')", pg17EvidenceRegex.i5Operation],
      ["((evidence ->> 'capability') = 'account_authority_read')", pg17EvidenceRegex.i5Capability],
      ["'research_investigation_create_v1'", pg17EvidenceRegex.i5Operation],
    ] as const) {
      expect(malformed[0]).not.toMatch(malformed[1]);
    }
  });

  it("models the effective permissive RLS algebra and fails closed for mixed authority tokens", () => {
    const validI2bRow = { ...i2bAccountDenialRow };
    const validI5AccountRow: AuditRow = {
      ...i2bAccountDenialRow,
      evidence: {
        operation: "RESEARCH_INVESTIGATION_CREATE_V1",
        capability: "RESEARCH_MUTATE",
        source_context: "USER_PORTFOLIO",
      },
    };

    expect(correctedI2bDenialPolicy(validI2bRow, i2bSession)).toBe(true);
    expect(permissiveInsertAllowed(validI2bRow, i2bSession, correctedI2bDenialPolicy)).toBe(true);
    expect(permissiveInsertAllowed(validI5AccountRow, i5Session, correctedI2bDenialPolicy)).toBe(true);
    expect(permissiveInsertAllowed(i2cBootstrapRow, i2cSession, correctedI2bDenialPolicy)).toBe(true);
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

    for (const session of [
      { ...i2bSession, operation: "RESEARCH_INVESTIGATION_CREATE_V1", capability: "ACCOUNT_AUTHORITY_READ" },
      { ...i2bSession, operation: "ACCOUNT_CONTEXT_RESOLVE", capability: "RESEARCH_MUTATE" },
      { ...i2bSession, operation: "RESEARCH_INVESTIGATION_CREATE_V1", capability: undefined },
      { ...i2bSession, operation: undefined, capability: "RESEARCH_MUTATE" },
      { ...i2bSession, operation: undefined, capability: undefined },
    ]) {
      expect(oldI2bDenialPolicy(validI2bRow, session)).toBe(true);
      expect(i5ResearchDenialPolicy(validI2bRow, session)).toBe(false);
      expect(permissiveInsertAllowed(validI2bRow, session, correctedI2bDenialPolicy)).toBe(false);
    }

    expect(permissiveInsertAllowed(validI5AccountRow, i2bSession, correctedI2bDenialPolicy)).toBe(false);
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
    expect(normalized).toContain("coalesce(current_setting('syntrake.investing.operation', true), '') = ''");
    expect(normalized).toContain("coalesce(current_setting('syntrake.investing.capability', true), '') = ''");
    expect(normalized).toContain("i2-b denial policy must not rely on broad not-research fallback");
    expect(normalized).not.toContain("is distinct from 'research_investigation_create_v1'");
    expect(normalized).not.toContain("is distinct from 'research_mutate'");
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
