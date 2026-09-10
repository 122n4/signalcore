import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  isAuthorizedInvestingContext,
  resolveAuthorizedResearchInvestigationCreateContext,
  type InvestingAuthorityTransactionClient,
} from "../lib/investing/authority/context";
import { resolveVerifiedClerkIdentity } from "../lib/investing/authority/clerk";
import { getInvestingAuthorityDatabase } from "../lib/investing/authority/transport";

vi.mock("../lib/investing/authority/clerk", () => ({
  resolveVerifiedClerkIdentity: vi.fn(),
}));

vi.mock("../lib/investing/authority/transport", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/investing/authority/transport")>();
  return {
    ...actual,
    getInvestingAuthorityDatabase: vi.fn(),
  };
});

type QueryRecord = {
  text: string;
  values: readonly unknown[];
};

type FailureMode = "connect" | "query" | "rollback" | "release";

const ids = {
  principalId: "11111111-1111-4111-8111-111111111111",
  otherPrincipalId: "66666666-6666-4666-8666-666666666666",
  tenantId: "22222222-2222-4222-8222-222222222222",
  otherTenantId: "77777777-7777-4777-8777-777777777777",
  accountId: "33333333-3333-4333-8333-333333333333",
  otherAccountId: "88888888-8888-4888-8888-888888888888",
  membershipId: "44444444-4444-4444-8444-444444444444",
  otherMembershipId: "99999999-9999-4999-8999-999999999999",
  accessId: "55555555-5555-4555-8555-555555555555",
  otherAccessId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  correlationId: "corr-i5-runtime-0001",
};

const defaultRows = {
  principals: [{ principal_id: ids.principalId, state: "ACTIVE" }],
  accounts: [{ account_id: ids.accountId, tenant_id: ids.tenantId, state: "ACTIVE" }],
  tenants: [{ tenant_id: ids.tenantId, state: "ACTIVE" }],
  memberships: [
    {
      tenant_membership_id: ids.membershipId,
      tenant_id: ids.tenantId,
      principal_id: ids.principalId,
      state: "ACTIVE",
    },
  ],
  access: [
    {
      account_access_id: ids.accessId,
      account_id: ids.accountId,
      tenant_id: ids.tenantId,
      tenant_membership_id: ids.membershipId,
      principal_id: ids.principalId,
      state: "ACTIVE",
    },
  ],
};

class FakeResearchAuthorityClient implements InvestingAuthorityTransactionClient {
  readonly queries: QueryRecord[] = [];
  released = false;
  destroyed = false;

  constructor(
    private readonly rows: Record<string, unknown[]> = {},
    private readonly staleContext: Record<string, string | null> = {},
    private readonly failureMode?: FailureMode,
  ) {}

  async query<Row = Record<string, unknown>>(text: string, values: readonly unknown[] = []) {
    this.queries.push({ text, values });
    const normalized = text.replace(/\s+/g, " ").trim().toLowerCase();

    if (
      this.failureMode === "query" &&
      (normalized.includes("from investing.principals") ||
        normalized.startsWith("insert into investing.pre_authority_audit_events") ||
        normalized.startsWith("insert into investing.audit_events"))
    ) {
      throw new Error("query failed");
    }

    if (normalized === "begin" || normalized === "commit" || normalized === "rollback") {
      if (this.failureMode === "rollback" && normalized === "rollback") throw new Error("rollback failed");
      return { rows: [] as Row[], rowCount: null };
    }

    if (normalized.startsWith("select current_setting(")) {
      return { rows: [this.staleContext as Row], rowCount: 1 };
    }

    if (normalized.startsWith("select set_config(")) {
      return { rows: [] as Row[], rowCount: null };
    }

    if (normalized.startsWith("insert into investing.pre_authority_audit_events")) {
      return { rows: [] as Row[], rowCount: 1 };
    }

    if (normalized.startsWith("insert into investing.audit_events")) {
      return { rows: [] as Row[], rowCount: 1 };
    }

    if (normalized.includes("from investing.principals")) {
      const rows = (this.rows.principals ?? defaultRows.principals) as Row[];
      return { rows, rowCount: rows.length };
    }

    if (normalized.includes("from investing.accounts")) {
      const rows = (this.rows.accounts ?? defaultRows.accounts) as Row[];
      return { rows, rowCount: rows.length };
    }

    if (normalized.includes("from investing.tenants")) {
      const rows = (this.rows.tenants ?? defaultRows.tenants) as Row[];
      return { rows, rowCount: rows.length };
    }

    if (normalized.includes("from investing.tenant_memberships")) {
      const rows = (this.rows.memberships ?? defaultRows.memberships) as Row[];
      return { rows, rowCount: rows.length };
    }

    if (normalized.includes("from investing.account_access")) {
      const rows = (this.rows.access ?? defaultRows.access) as Row[];
      return { rows, rowCount: rows.length };
    }

    throw new Error(`Unexpected query: ${text}`);
  }

  release(destroy = false) {
    this.destroyed = destroy;
    if (this.failureMode === "release") throw new Error("release failed");
    this.released = true;
  }
}

function mockClerkOk() {
  vi.mocked(resolveVerifiedClerkIdentity).mockResolvedValue({
    ok: true,
    externalProvider: "CLERK",
    externalSubject: "user_clerk_123",
  });
}

function mockDatabaseSequence(clients: (FakeResearchAuthorityClient | null)[]) {
  let index = 0;
  vi.mocked(getInvestingAuthorityDatabase).mockReturnValue({
    connect: async () => {
      const client = clients[index++];
      if (!client) throw new Error("connect failed");
      return client;
    },
  });
}

async function resolveWith(
  command: Record<string, unknown>,
  rows: Record<string, unknown[]> = {},
  staleContext: Record<string, string | null> = {},
  failureMode?: FailureMode,
) {
  const client = failureMode === "connect" ? null : new FakeResearchAuthorityClient(rows, staleContext, failureMode);
  const auditClient = new FakeResearchAuthorityClient();
  mockClerkOk();
  mockDatabaseSequence([client, auditClient]);
  const result = await resolveAuthorizedResearchInvestigationCreateContext(command as never);
  return { result, client, auditClient };
}

function setConfigValues(client: FakeResearchAuthorityClient | null) {
  return (client?.queries ?? [])
    .filter((query) => query.text.includes("set_config($1, $2, true)"))
    .map((query) => query.values);
}

describe("Investing Genesis I5 Research investigation create authority runtime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps PURE_RESEARCH to TENANT_SCOPE authority without account access", async () => {
    const { result, client } = await resolveWith({
      sourceContext: "PURE_RESEARCH",
      tenantId: ids.tenantId,
      correlationId: ids.correlationId,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected Research tenant authority");
    expect(result.context).toMatchObject({
      operationScope: "TENANT_SCOPE",
      operation: "RESEARCH_INVESTIGATION_CREATE_V1",
      capability: "RESEARCH_MUTATE",
      sourceContext: "PURE_RESEARCH",
      tenantId: ids.tenantId,
      tenantMembershipId: ids.membershipId,
    });
    expect("accountId" in result.context).toBe(false);
    expect(isAuthorizedInvestingContext(result.context)).toBe(true);
    expect(client?.queries.some((query) => query.text.includes("from investing.accounts"))).toBe(false);
    expect(client?.queries.some((query) => query.text.includes("from investing.account_access"))).toBe(false);
    expect(setConfigValues(client)).toContainEqual(["syntrake.investing.operation_scope", "TENANT_SCOPE"]);
    expect(setConfigValues(client).some((values) => values[0] === "syntrake.investing.account_id")).toBe(false);
  });

  it("maps TEST_PORTFOLIO to TENANT_SCOPE authority", async () => {
    const { result } = await resolveWith({
      sourceContext: "TEST_PORTFOLIO",
      tenantId: ids.tenantId,
      correlationId: ids.correlationId,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.context.operationScope).toBe("TENANT_SCOPE");
      expect("sourceContext" in result.context).toBe(true);
      if (!("sourceContext" in result.context)) throw new Error("expected Research context");
      expect(result.context.sourceContext).toBe("TEST_PORTFOLIO");
    }
  });

  it("maps USER_PORTFOLIO to ACCOUNT_SCOPE authority and derives tenant from Account", async () => {
    const { result, client } = await resolveWith({
      sourceContext: "USER_PORTFOLIO",
      accountId: ids.accountId,
      correlationId: ids.correlationId,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected Research account authority");
    expect(result.context).toMatchObject({
      operationScope: "ACCOUNT_SCOPE",
      operation: "RESEARCH_INVESTIGATION_CREATE_V1",
      capability: "RESEARCH_MUTATE",
      sourceContext: "USER_PORTFOLIO",
      tenantId: ids.tenantId,
      accountId: ids.accountId,
      accountAccessId: ids.accessId,
    });
    expect(isAuthorizedInvestingContext(result.context)).toBe(true);
    expect(setConfigValues(client)).toContainEqual(["syntrake.investing.account_id", ids.accountId]);
    expect(setConfigValues(client)).toContainEqual(["syntrake.investing.tenant_id", ids.tenantId]);
  });

  it.each([
    ["PURE_RESEARCH + accountId", { sourceContext: "PURE_RESEARCH", tenantId: ids.tenantId, accountId: ids.accountId, correlationId: ids.correlationId }],
    ["TEST_PORTFOLIO + accountId", { sourceContext: "TEST_PORTFOLIO", tenantId: ids.tenantId, accountId: ids.accountId, correlationId: ids.correlationId }],
    ["USER_PORTFOLIO missing accountId", { sourceContext: "USER_PORTFOLIO", correlationId: ids.correlationId }],
    ["USER_PORTFOLIO unexpected tenantId", { sourceContext: "USER_PORTFOLIO", accountId: ids.accountId, tenantId: ids.tenantId, correlationId: ids.correlationId }],
    ["unknown sourceContext", { sourceContext: "DOMAIN_SCOPE", tenantId: ids.tenantId, correlationId: ids.correlationId }],
    ["malformed selector", { sourceContext: "PURE_RESEARCH", tenantId: "not-a-uuid", correlationId: ids.correlationId }],
    ["missing selector", { sourceContext: "PURE_RESEARCH", correlationId: ids.correlationId }],
    ["operation_scope injection", { sourceContext: "PURE_RESEARCH", tenantId: ids.tenantId, operation_scope: "TENANT_SCOPE", correlationId: ids.correlationId }],
    ["operation injection", { sourceContext: "PURE_RESEARCH", tenantId: ids.tenantId, operation: "RESEARCH_INVESTIGATION_CREATE_V1", correlationId: ids.correlationId }],
    ["capability injection", { sourceContext: "PURE_RESEARCH", tenantId: ids.tenantId, capability: "RESEARCH_MUTATE", correlationId: ids.correlationId }],
    ["principal injection", { sourceContext: "PURE_RESEARCH", tenantId: ids.tenantId, principalId: ids.principalId, correlationId: ids.correlationId }],
    ["actor injection", { sourceContext: "PURE_RESEARCH", tenantId: ids.tenantId, actorId: "user_clerk_123", correlationId: ids.correlationId }],
    ["authority evidence injection", { sourceContext: "PURE_RESEARCH", tenantId: ids.tenantId, authorizedContext: {}, correlationId: ids.correlationId }],
  ])("rejects strict public command boundary: %s", async (_label, command) => {
    const client = new FakeResearchAuthorityClient();
    mockClerkOk();
    mockDatabaseSequence([client]);

    const result = await resolveAuthorizedResearchInvestigationCreateContext(command as never);

    expect(result).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    expect(resolveVerifiedClerkIdentity).not.toHaveBeenCalled();
    expect(client.queries).toEqual([]);
  });

  it.each([
    ["zero Principal", { principals: [] }, "FORBIDDEN_OR_NOT_FOUND"],
    ["duplicate Principal", { principals: [defaultRows.principals[0], { principal_id: ids.otherPrincipalId, state: "ACTIVE" }] }, "INTERNAL_ERROR"],
    ["disabled Principal", { principals: [{ principal_id: ids.principalId, state: "DISABLED" }] }, "PRINCIPAL_DISABLED"],
    ["zero Tenant", { tenants: [] }, "FORBIDDEN_OR_NOT_FOUND"],
    ["duplicate Tenant selector", { tenants: [defaultRows.tenants[0], { tenant_id: ids.tenantId, state: "ACTIVE" }] }, "INTERNAL_ERROR"],
    ["inactive Tenant", { tenants: [{ tenant_id: ids.tenantId, state: "SUSPENDED" }] }, "TENANT_INACTIVE"],
    ["missing Membership", { memberships: [] }, "MEMBERSHIP_INACTIVE"],
    ["duplicate active Membership", { memberships: [defaultRows.memberships[0], { ...defaultRows.memberships[0], tenant_membership_id: ids.otherMembershipId }] }, "INTERNAL_ERROR"],
    ["wrong Principal Membership", { memberships: [{ ...defaultRows.memberships[0], principal_id: ids.otherPrincipalId }] }, "INTERNAL_ERROR"],
    ["cross-Tenant Membership", { memberships: [{ ...defaultRows.memberships[0], tenant_id: ids.otherTenantId }] }, "INTERNAL_ERROR"],
  ])("fails closed for TENANT_SCOPE authority negative: %s", async (_label, rows, code) => {
    const { result } = await resolveWith({
      sourceContext: "PURE_RESEARCH",
      tenantId: ids.tenantId,
      correlationId: ids.correlationId,
    }, rows);

    expect(result).toMatchObject({ ok: false, code });
    expect(isAuthorizedInvestingContext(result)).toBe(false);
  });

  it.each([
    ["zero Account", { accounts: [] }, "FORBIDDEN_OR_NOT_FOUND"],
    ["duplicate Account selector", { accounts: [defaultRows.accounts[0], { account_id: ids.accountId, tenant_id: ids.tenantId, state: "ACTIVE" }] }, "INTERNAL_ERROR"],
    ["inactive Account", { accounts: [{ account_id: ids.accountId, tenant_id: ids.tenantId, state: "FROZEN" }] }, "ACCOUNT_INACTIVE"],
    ["missing AccountAccess", { access: [] }, "ACCESS_INACTIVE"],
    ["duplicate active AccountAccess", { access: [defaultRows.access[0], { ...defaultRows.access[0], account_access_id: ids.otherAccessId }] }, "INTERNAL_ERROR"],
    ["revoked AccountAccess", { access: [] }, "ACCESS_INACTIVE"],
    ["AccountAccess tuple mismatch", { access: [{ ...defaultRows.access[0], tenant_membership_id: ids.otherMembershipId }] }, "INTERNAL_ERROR"],
    ["cross-principal", { access: [{ ...defaultRows.access[0], principal_id: ids.otherPrincipalId }] }, "INTERNAL_ERROR"],
    ["cross-tenant", { accounts: [{ account_id: ids.accountId, tenant_id: ids.otherTenantId, state: "ACTIVE" }] }, "INTERNAL_ERROR"],
    ["cross-account", { access: [{ ...defaultRows.access[0], account_id: ids.otherAccountId }] }, "INTERNAL_ERROR"],
  ])("fails closed for ACCOUNT_SCOPE authority negative: %s", async (_label, rows, code) => {
    const { result } = await resolveWith({
      sourceContext: "USER_PORTFOLIO",
      accountId: ids.accountId,
      correlationId: ids.correlationId,
    }, rows);

    expect(result).toMatchObject({ ok: false, code });
    expect(isAuthorizedInvestingContext(result)).toBe(false);
  });

  it.each([
    ["stale TENANT_SCOPE", { c11: "TENANT_SCOPE" }],
    ["stale ACCOUNT_SCOPE", { c11: "ACCOUNT_SCOPE" }],
    ["stale matching account", { c6: ids.accountId }],
    ["stale unrelated account", { c6: ids.otherAccountId }],
    ["stale tenant", { c5: ids.tenantId }],
    ["stale principal", { c4: ids.principalId }],
    ["stale operation", { c9: "ACCOUNT_CONTEXT_RESOLVE" }],
    ["stale capability", { c10: "ACCOUNT_AUTHORITY_READ" }],
  ])("fails preflight for stale transaction context: %s", async (_label, staleContext) => {
    const { result, client, auditClient } = await resolveWith({
      sourceContext: "PURE_RESEARCH",
      tenantId: ids.tenantId,
      correlationId: ids.correlationId,
    }, {}, staleContext);

    expect(result).toMatchObject({ ok: false, code: "INTERNAL_ERROR" });
    expect(client?.destroyed).toBe(true);
    expect(client?.queries.map((query) => query.text.toLowerCase())).toContain("rollback");
    const auditInsert = auditClient.queries.find((query) => query.text.includes("insert into investing.pre_authority_audit_events"));
    expect(auditInsert?.values).toContain("RESEARCH_INVESTIGATION_CREATE_V1");
    expect(auditInsert?.values).toContain("TENANT_SCOPE");
    expect(auditInsert?.values).toContain("STALE_TRANSACTION_CONTEXT");
  });

  it("never falls back to TENANT_SCOPE when USER_PORTFOLIO account authority fails", async () => {
    const { result, client } = await resolveWith({
      sourceContext: "USER_PORTFOLIO",
      accountId: ids.accountId,
      correlationId: ids.correlationId,
    }, { access: [] });

    expect(result).toMatchObject({ ok: false, code: "ACCESS_INACTIVE" });
    expect(setConfigValues(client)).toContainEqual(["syntrake.investing.operation_scope", "ACCOUNT_SCOPE"]);
    expect(setConfigValues(client)).not.toContainEqual(["syntrake.investing.operation_scope", "TENANT_SCOPE"]);
  });
});
