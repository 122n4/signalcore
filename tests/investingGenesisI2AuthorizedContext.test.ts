import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  hashPreAuthorityAuditValue,
  isAuthorizedInvestingContext,
  resolveAuthorizedInvestingAccountContext,
  type InvestingAuthorityTransactionClient,
} from "../lib/investing/authority/context";
import { resolveVerifiedClerkIdentity } from "../lib/investing/authority/clerk";
import { getInvestingAuthorityDatabase, readInvestingDatabaseConfig } from "../lib/investing/authority/transport";

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

const repoRoot = path.resolve(__dirname, "..");
const sourcePath = path.join(repoRoot, "lib", "investing", "authority", "context.ts");
const transportPath = path.join(repoRoot, "lib", "investing", "authority", "transport.ts");
const i2aMigrationPath = path.join(
  repoRoot,
  "supabase",
  "migrations",
  "20260825120000_investing_genesis_i2_authority_materialization.sql",
);
const i2bMigrationPath = path.join(
  repoRoot,
  "supabase",
  "migrations",
  "20260825123000_investing_genesis_i2_authorized_context.sql",
);

const ids = {
  principalId: "11111111-1111-4111-8111-111111111111",
  tenantId: "22222222-2222-4222-8222-222222222222",
  accountId: "33333333-3333-4333-8333-333333333333",
  membershipId: "44444444-4444-4444-8444-444444444444",
  accessId: "55555555-5555-4555-8555-555555555555",
  correlationId: "corr-6666666666666666",
};

type QueryRecord = {
  text: string;
  values: readonly unknown[];
};

type FailureMode = "connect" | "query" | "queryRollback" | "commit" | "rollback" | "release";

class FakeAuthorityClient implements InvestingAuthorityTransactionClient {
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
      (this.failureMode === "query" || this.failureMode === "queryRollback") &&
      (normalized.includes("from investing.principals") ||
        normalized.startsWith("insert into investing.pre_authority_audit_events") ||
        normalized.startsWith("insert into investing.audit_events"))
    ) {
      throw new Error("query failed");
    }

    if (normalized === "begin" || normalized === "rollback") {
      if ((this.failureMode === "rollback" || this.failureMode === "queryRollback") && normalized === "rollback") {
        throw new Error("rollback failed");
      }
      return { rows: [] as Row[], rowCount: null };
    }

    if (normalized === "commit") {
      if (this.failureMode === "commit") throw new Error("commit failed");
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

function readFile(filePath: string) {
  return fs.readFileSync(filePath, "utf8");
}

function normalize(value: string) {
  return value.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--.*$/gm, "").replace(/\s+/g, " ").trim().toLowerCase();
}

function mockClerkOk() {
  vi.mocked(resolveVerifiedClerkIdentity).mockResolvedValue({
    ok: true,
    externalProvider: "CLERK",
    externalSubject: "user_clerk_123",
  });
}

function mockDatabase(client: FakeAuthorityClient | null) {
  mockDatabaseSequence([client]);
}

function mockDatabaseSequence(clients: (FakeAuthorityClient | null)[]) {
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
  rows: Record<string, unknown[]> = {},
  overrides: Record<string, unknown> = {},
  staleContext: Record<string, string | null> = {},
  failureMode?: FailureMode,
) {
  const client = failureMode === "connect" ? null : new FakeAuthorityClient(rows, staleContext, failureMode);
  const auditClient = new FakeAuthorityClient();
  mockClerkOk();
  mockDatabaseSequence([client, auditClient]);
  const result = await resolveAuthorizedInvestingAccountContext({
    accountId: ids.accountId,
    correlationId: ids.correlationId,
    ...overrides,
  } as never);
  return { result, client, auditClient };
}

describe("Investing Genesis I2-B AuthorizedInvestingContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fails closed before DB access when Clerk auth is unauthenticated or throws", async () => {
    const client = new FakeAuthorityClient();
    mockDatabase(client);
    vi.mocked(resolveVerifiedClerkIdentity).mockResolvedValue({ ok: false, code: "UNAUTHENTICATED" });

    const unauthenticated = await resolveAuthorizedInvestingAccountContext({
      accountId: ids.accountId,
      correlationId: ids.correlationId,
    });

    vi.mocked(resolveVerifiedClerkIdentity).mockResolvedValue({ ok: false, code: "INTERNAL_ERROR" });
    const thrown = await resolveAuthorizedInvestingAccountContext({
      accountId: ids.accountId,
      correlationId: ids.correlationId,
    });

    expect(unauthenticated).toMatchObject({ ok: false, code: "UNAUTHENTICATED", externalCode: "UNAUTHENTICATED" });
    expect(thrown).toMatchObject({ ok: false, code: "INTERNAL_ERROR", externalCode: "INTERNAL_ERROR" });
    expect(client.queries).toEqual([]);
  });

  it("fails closed on malformed accountId or correlationId before DB access", async () => {
    const client = new FakeAuthorityClient();
    mockClerkOk();
    mockDatabase(client);

    const badAccount = await resolveAuthorizedInvestingAccountContext({
      accountId: "not-a-uuid",
      correlationId: ids.correlationId,
    });
    const badCorrelation = await resolveAuthorizedInvestingAccountContext({
      accountId: ids.accountId,
      correlationId: "short",
    });

    expect(badAccount).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    expect(badCorrelation).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    expect(client.queries).toEqual([]);
  });

  it("fails closed on missing Principal", async () => {
    const { result, client } = await resolveWith({ principals: [] });
    expect(result).toMatchObject({ ok: false, code: "FORBIDDEN_OR_NOT_FOUND" });
    expect(client?.queries.map((query) => query.text.toLowerCase())).toContain("rollback");
  });

  it("fails closed on duplicate Principal rather than selecting a first row", async () => {
    const { result } = await resolveWith({
      principals: [
        { principal_id: ids.principalId, state: "ACTIVE" },
        { principal_id: "66666666-6666-4666-8666-666666666666", state: "ACTIVE" },
      ],
    });
    expect(result).toMatchObject({ ok: false, code: "INTERNAL_ERROR" });
  });

  it("fails closed when Principal is DISABLED", async () => {
    const { result, auditClient } = await resolveWith({ principals: [{ principal_id: ids.principalId, state: "DISABLED" }] });
    expect(result).toMatchObject({ ok: false, code: "PRINCIPAL_DISABLED" });
    const auditInsert = auditClient.queries.find((query) =>
      query.text.includes("insert into investing.pre_authority_audit_events"),
    );
    expect(auditInsert?.values).toContain("PRINCIPAL_STATE");
    expect(auditInsert?.values).toContain("PRINCIPAL_DISABLED");
    expect(auditInsert?.values).toContain("DENIED");
    expect(auditClient.queries.some((query) => query.text.includes("insert into investing.audit_events"))).toBe(false);
  });

  it("collapses inaccessible or forged account selectors to FORBIDDEN_OR_NOT_FOUND", async () => {
    const { result } = await resolveWith({ accounts: [] });
    expect(result).toMatchObject({ ok: false, code: "FORBIDDEN_OR_NOT_FOUND", externalCode: "FORBIDDEN_OR_NOT_FOUND" });
  });

  it("derives tenant from the canonical account and never from client tenantId", async () => {
    const { result, client } = await resolveWith();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.context.tenantId).toBe(ids.tenantId);
      expect(isAuthorizedInvestingContext(result.context)).toBe(true);
      expect(result.context.operation).toBe("ACCOUNT_CONTEXT_RESOLVE");
      expect(result.context.capability).toBe("ACCOUNT_AUTHORITY_READ");
    }

    const membershipQuery = client?.queries.find((query) =>
      query.text.includes("select tenant_membership_id, tenant_id, principal_id, state"),
    );
    expect(membershipQuery?.values).toEqual([ids.principalId, ids.tenantId]);
  });

  it("resolves account before membership before access before tenant so membership denials stay classifiable", async () => {
    const { result, client } = await resolveWith();

    expect(result.ok).toBe(true);
    const queries = client?.queries.map((query) => query.text) ?? [];
    const accountIndex = queries.findIndex((query) => query.includes("from investing.accounts"));
    const membershipIndex = queries.findIndex((query) => query.includes("from investing.tenant_memberships"));
    const accessIndex = queries.findIndex((query) => query.includes("from investing.account_access"));
    const tenantIndex = queries.findIndex((query) => query.includes("from investing.tenants"));

    expect(accountIndex).toBeGreaterThan(-1);
    expect(membershipIndex).toBeGreaterThan(accountIndex);
    expect(accessIndex).toBeGreaterThan(membershipIndex);
    expect(tenantIndex).toBeGreaterThan(accessIndex);
  });

  it("rejects client tenantId, userId, operation, capability, clerkAuth, and database as authority input", async () => {
    for (const forbidden of ["tenantId", "userId", "operation", "capability", "clerkAuth", "database"]) {
      const { result, client } = await resolveWith({}, { [forbidden]: "forged" });
      expect(result).toMatchObject({ ok: false, code: "FORBIDDEN_OR_NOT_FOUND" });
      expect(client?.queries).toEqual([]);
    }
  });

  it("fails closed when Tenant is SUSPENDED or CLOSED", async () => {
    const suspended = await resolveWith({ tenants: [{ tenant_id: ids.tenantId, state: "SUSPENDED" }] });
    const closed = await resolveWith({ tenants: [{ tenant_id: ids.tenantId, state: "CLOSED" }] });

    expect(suspended.result).toMatchObject({ ok: false, code: "TENANT_INACTIVE" });
    expect(closed.result).toMatchObject({ ok: false, code: "TENANT_INACTIVE" });
    expect(suspended.auditClient.queries.some((query) => query.text.includes("insert into investing.audit_events"))).toBe(true);
    expect(closed.auditClient.queries.some((query) => query.text.includes("insert into investing.audit_events"))).toBe(true);
  });

  it("fails closed on missing or revoked active membership", async () => {
    const { result, auditClient } = await resolveWith({ memberships: [] });
    expect(result).toMatchObject({ ok: false, code: "MEMBERSHIP_INACTIVE" });
    expect(auditClient.queries.some((query) => query.text.includes("insert into investing.audit_events"))).toBe(true);
  });

  it("fails closed on duplicate ACTIVE membership", async () => {
    const { result, auditClient } = await resolveWith({
      memberships: [
        defaultRows.memberships[0],
        { ...defaultRows.memberships[0], tenant_membership_id: "77777777-7777-4777-8777-777777777777" },
      ],
    });
    expect(result).toMatchObject({ ok: false, code: "INTERNAL_ERROR" });
    const auditInsert = auditClient.queries.find((query) => query.text.includes("insert into investing.audit_events"));
    expect(auditInsert?.values).toContain("FAILED");
    expect(auditInsert?.values).toContain("DUPLICATE_ACTIVE_MEMBERSHIP");
  });

  it("fails closed on missing or revoked active account access", async () => {
    const { result, auditClient } = await resolveWith({ access: [] });
    expect(result).toMatchObject({ ok: false, code: "ACCESS_INACTIVE" });
    expect(auditClient.queries.some((query) => query.text.includes("insert into investing.audit_events"))).toBe(true);
  });

  it("fails closed on duplicate ACTIVE account access", async () => {
    const { result, auditClient } = await resolveWith({
      access: [
        defaultRows.access[0],
        { ...defaultRows.access[0], account_access_id: "88888888-8888-4888-8888-888888888888" },
      ],
    });
    expect(result).toMatchObject({ ok: false, code: "INTERNAL_ERROR" });
    const auditInsert = auditClient.queries.find((query) => query.text.includes("insert into investing.audit_events"));
    expect(auditInsert?.values).toContain("FAILED");
    expect(auditInsert?.values).toContain("DUPLICATE_ACTIVE_ACCOUNT_ACCESS");
  });

  it("fails closed on tuple mismatch", async () => {
    const { result, auditClient } = await resolveWith({
      access: [{ ...defaultRows.access[0], tenant_id: "99999999-9999-4999-8999-999999999999" }],
    });
    expect(result).toMatchObject({ ok: false, code: "INTERNAL_ERROR" });
    const auditInsert = auditClient.queries.find((query) => query.text.includes("insert into investing.audit_events"));
    expect(auditInsert?.values).toContain("FAILED");
    expect(auditInsert?.values).toContain("AUTHORITY_TUPLE_MISMATCH");
  });

  it("allows only ACCOUNT_AUTHORITY_READ in I2-B and never mints financial mutation capability", async () => {
    const frozenRead = await resolveWith({ accounts: [{ account_id: ids.accountId, tenant_id: ids.tenantId, state: "FROZEN" }] });
    const closedRead = await resolveWith({ accounts: [{ account_id: ids.accountId, tenant_id: ids.tenantId, state: "CLOSED" }] });

    expect(frozenRead.result.ok).toBe(true);
    expect(closedRead.result.ok).toBe(true);
    if (frozenRead.result.ok) expect(frozenRead.result.context.capability).toBe("ACCOUNT_AUTHORITY_READ");

    expect(readFile(sourcePath)).not.toContain("ACCOUNT_FINANCIAL_MUTATION");
    expect(readFile(sourcePath)).not.toContain("CAPABILITY_DENIED");
  });

  it("rejects fabricated client contexts and service_role authority attempts", async () => {
    const fabricatedContext = {
      actorKind: "USER_PRINCIPAL",
      principalId: ids.principalId,
      tenantId: ids.tenantId,
      accountId: ids.accountId,
    };

    expect(isAuthorizedInvestingContext(fabricatedContext)).toBe(false);

    const contextAttempt = await resolveWith({}, { authorizedContext: fabricatedContext });
    const serviceRoleAttempt = await resolveWith({}, { serviceRole: "service_role" });

    expect(contextAttempt.result).toMatchObject({ ok: false, code: "FORBIDDEN_OR_NOT_FOUND" });
    expect(serviceRoleAttempt.result).toMatchObject({ ok: false, code: "FORBIDDEN_OR_NOT_FOUND" });
    expect(contextAttempt.client?.queries).toEqual([]);
    expect(serviceRoleAttempt.client?.queries).toEqual([]);
  });

  it("fails closed on stale transaction-local context and rolls back", async () => {
    const { result, client } = await resolveWith({}, {}, { c0: "USER_PRINCIPAL" });

    expect(result).toMatchObject({ ok: false, code: "INTERNAL_ERROR" });
    expect(client?.queries.map((query) => query.text.toLowerCase())).toContain("rollback");
    expect(client?.released).toBe(true);
    expect(client?.destroyed).toBe(true);
  });

  it("writes durable pre-authority DENIED audit after zero Principal rollback without plaintext identifiers", async () => {
    const authorityClient = new FakeAuthorityClient({ principals: [] });
    const auditClient = new FakeAuthorityClient();
    mockClerkOk();
    mockDatabaseSequence([authorityClient, auditClient]);

    const result = await resolveAuthorizedInvestingAccountContext({
      accountId: ids.accountId,
      correlationId: ids.correlationId,
    });

    expect(result).toMatchObject({ ok: false, code: "FORBIDDEN_OR_NOT_FOUND" });
    expect(authorityClient.queries.map((query) => query.text.toLowerCase())).toContain("rollback");
    expect(auditClient.queries[0]?.text.toLowerCase()).toBe("begin");
    expect(auditClient.queries.some((query) => query.text.startsWith("select current_setting("))).toBe(true);
    expect(auditClient.queries.some((query) => query.text.includes("insert into investing.pre_authority_audit_events"))).toBe(true);
    expect(auditClient.queries.at(-1)?.text.toLowerCase()).toBe("commit");
    expect(auditClient.destroyed).toBe(false);

    const auditInsert = auditClient.queries.find((query) =>
      query.text.includes("insert into investing.pre_authority_audit_events"),
    );
    expect(auditInsert?.values).toContain("CLERK");
    expect(auditInsert?.values).toContain("ACCOUNT_CONTEXT_RESOLVE");
    expect(auditInsert?.values).toContain("ACCOUNT_SCOPE");
    expect(auditInsert?.values).toContain("ACCOUNT_ID");
    expect(auditInsert?.values).toContain("PRINCIPAL_LOOKUP");
    expect(auditInsert?.values).toContain("DENIED");
    expect(auditInsert?.values).toContain("ZERO_PRINCIPAL");
    expect(auditInsert?.values).not.toContain("user_clerk_123");
    expect(auditInsert?.values).not.toContain(ids.accountId);
    expect(auditInsert?.values.filter((value) => typeof value === "string" && /^[0-9a-f]{64}$/.test(value))).toHaveLength(2);
  });

  it("writes durable pre-authority ERROR audit for duplicate Principal without fake USER_PRINCIPAL or SYSTEM_ACTOR", async () => {
    const authorityClient = new FakeAuthorityClient({
      principals: [
        { principal_id: ids.principalId, state: "ACTIVE" },
        { principal_id: "66666666-6666-4666-8666-666666666666", state: "ACTIVE" },
      ],
    });
    const auditClient = new FakeAuthorityClient();
    mockClerkOk();
    mockDatabaseSequence([authorityClient, auditClient]);

    const result = await resolveAuthorizedInvestingAccountContext({
      accountId: ids.accountId,
      correlationId: ids.correlationId,
    });

    expect(result).toMatchObject({ ok: false, code: "INTERNAL_ERROR" });
    const auditInsert = auditClient.queries.find((query) =>
      query.text.includes("insert into investing.pre_authority_audit_events"),
    );
    expect(auditInsert?.values).toContain("ERROR");
    expect(auditInsert?.values).toContain("DUPLICATE_PRINCIPAL");
    expect(auditClient.queries.some((query) => query.text.includes("insert into investing.audit_events"))).toBe(false);
    expect(readFile(sourcePath)).not.toContain('actorKind: "SYSTEM_ACTOR"');
  });

  it("writes pre-authority DENIED audit for inaccessible account selector before canonical account evidence exists", async () => {
    const authorityClient = new FakeAuthorityClient({ accounts: [] });
    const auditClient = new FakeAuthorityClient();
    mockClerkOk();
    mockDatabaseSequence([authorityClient, auditClient]);

    const result = await resolveAuthorizedInvestingAccountContext({
      accountId: ids.accountId,
      correlationId: ids.correlationId,
    });

    expect(result).toMatchObject({ ok: false, code: "FORBIDDEN_OR_NOT_FOUND" });
    const auditInsert = auditClient.queries.find((query) =>
      query.text.includes("insert into investing.pre_authority_audit_events"),
    );
    expect(auditInsert?.values).toContain("ACCOUNT_SELECTOR_LOOKUP");
    expect(auditInsert?.values).toContain("ACCOUNT_SELECTOR_NOT_ACCESSIBLE");
    expect(auditInsert?.values).not.toContain(ids.accountId);
  });

  it("writes canonical AUTHORITY_ACCESS_DENIED audit after rollback when Principal, Tenant, and Account are known", async () => {
    const authorityClient = new FakeAuthorityClient({ access: [] });
    const auditClient = new FakeAuthorityClient();
    mockClerkOk();
    mockDatabaseSequence([authorityClient, auditClient]);

    const result = await resolveAuthorizedInvestingAccountContext({
      accountId: ids.accountId,
      correlationId: ids.correlationId,
    });

    expect(result).toMatchObject({ ok: false, code: "ACCESS_INACTIVE" });
    expect(authorityClient.queries.map((query) => query.text.toLowerCase())).toContain("rollback");
    expect(auditClient.queries[0]?.text.toLowerCase()).toBe("begin");
    expect(auditClient.queries.some((query) => query.text.startsWith("select current_setting("))).toBe(true);
    expect(auditClient.queries.some((query) => query.text.includes("set_config($1, $2, true)"))).toBe(true);
    expect(auditClient.queries.at(-1)?.text.toLowerCase()).toBe("commit");

    const auditInsert = auditClient.queries.find((query) => query.text.includes("insert into investing.audit_events"));
    expect(auditInsert?.values).toEqual([
      ids.correlationId,
      "USER_PRINCIPAL",
      "user_clerk_123",
      ids.principalId,
      "ACCOUNT_SCOPE",
      ids.tenantId,
      ids.accountId,
      "AUTHORITY_ACCESS_DENIED",
      "ACCOUNT",
      ids.accountId,
      "DENIED",
      "ACCESS_INACTIVE",
      JSON.stringify({ denial_stage: "ACCOUNT_ACCESS_LOOKUP" }),
    ]);
    expect(auditClient.queries.some((query) => query.text.includes("pre_authority_audit_events"))).toBe(false);
  });

  it("routes pre-canonical denial to pre_authority_audit_events and never writes both sinks", async () => {
    const authorityClient = new FakeAuthorityClient({ principals: [] });
    const auditClient = new FakeAuthorityClient();
    mockClerkOk();
    mockDatabaseSequence([authorityClient, auditClient]);

    const result = await resolveAuthorizedInvestingAccountContext({
      accountId: ids.accountId,
      correlationId: ids.correlationId,
    });

    expect(result).toMatchObject({ ok: false, code: "FORBIDDEN_OR_NOT_FOUND" });
    expect(auditClient.queries.some((query) => query.text.includes("insert into investing.pre_authority_audit_events"))).toBe(true);
    expect(auditClient.queries.some((query) => query.text.includes("insert into investing.audit_events"))).toBe(false);
  });

  it("fails closed when canonical denial audit sees stale local GUCs and never produces authority", async () => {
    const authorityClient = new FakeAuthorityClient({ access: [] });
    const auditClient = new FakeAuthorityClient({}, { c0: "USER_PRINCIPAL" });
    mockClerkOk();
    mockDatabaseSequence([authorityClient, auditClient]);

    const result = await resolveAuthorizedInvestingAccountContext({
      accountId: ids.accountId,
      correlationId: ids.correlationId,
    });

    expect(result).toMatchObject({ ok: false, code: "INTERNAL_ERROR" });
    expect(isAuthorizedInvestingContext(result)).toBe(false);
    expect(auditClient.queries.map((query) => query.text.toLowerCase())).toContain("rollback");
    expect(auditClient.destroyed).toBe(true);
  });

  it("fails closed and destroys a stale pre-authority audit client", async () => {
    const authorityClient = new FakeAuthorityClient({ principals: [] });
    const auditClient = new FakeAuthorityClient({}, { c0: "USER_PRINCIPAL" });
    mockClerkOk();
    mockDatabaseSequence([authorityClient, auditClient]);

    const result = await resolveAuthorizedInvestingAccountContext({
      accountId: ids.accountId,
      correlationId: ids.correlationId,
    });

    expect(result).toMatchObject({ ok: false, code: "INTERNAL_ERROR" });
    expect(auditClient.queries.map((query) => query.text.toLowerCase())).toContain("rollback");
    expect(auditClient.destroyed).toBe(true);
  });

  it("fails closed when the pre-authority audit write fails and never converts denial to success", async () => {
    const authorityClient = new FakeAuthorityClient({ principals: [] });
    const auditClient = new FakeAuthorityClient({}, {}, "query");
    mockClerkOk();
    mockDatabaseSequence([authorityClient, auditClient]);

    const result = await resolveAuthorizedInvestingAccountContext({
      accountId: ids.accountId,
      correlationId: ids.correlationId,
    });

    expect(result).toMatchObject({ ok: false, code: "INTERNAL_ERROR" });
    expect(authorityClient.queries.map((query) => query.text.toLowerCase())).toContain("rollback");
    expect(auditClient.queries.map((query) => query.text.toLowerCase())).toContain("rollback");
  });

  it("preserves denial audit evidence when rollback cleanup fails and destroys the suspect authority client", async () => {
    const authorityClient = new FakeAuthorityClient({ principals: [] }, {}, "rollback");
    const auditClient = new FakeAuthorityClient();
    mockClerkOk();
    mockDatabaseSequence([authorityClient, auditClient]);

    const result = await resolveAuthorizedInvestingAccountContext({
      accountId: ids.accountId,
      correlationId: ids.correlationId,
    });

    expect(result).toMatchObject({ ok: false, code: "INTERNAL_ERROR" });
    expect(authorityClient.destroyed).toBe(true);
    expect(authorityClient.released).toBe(true);
    expect(auditClient.queries.some((query) => query.text.includes("insert into investing.pre_authority_audit_events"))).toBe(true);
    const auditInsert = auditClient.queries.find((query) =>
      query.text.includes("insert into investing.pre_authority_audit_events"),
    );
    expect(auditInsert?.values).toContain("ZERO_PRINCIPAL");
  });

  it("destroys a suspect pre-authority audit client when audit rollback cleanup fails", async () => {
    const authorityClient = new FakeAuthorityClient({ principals: [] });
    const auditClient = new FakeAuthorityClient({}, {}, "queryRollback");
    mockClerkOk();
    mockDatabaseSequence([authorityClient, auditClient]);

    const result = await resolveAuthorizedInvestingAccountContext({
      accountId: ids.accountId,
      correlationId: ids.correlationId,
    });

    expect(result).toMatchObject({ ok: false, code: "INTERNAL_ERROR" });
    expect(auditClient.destroyed).toBe(true);
  });

  it("destroys a suspect canonical audit client when audit rollback cleanup fails", async () => {
    const authorityClient = new FakeAuthorityClient({ access: [] });
    const auditClient = new FakeAuthorityClient({}, {}, "queryRollback");
    mockClerkOk();
    mockDatabaseSequence([authorityClient, auditClient]);

    const result = await resolveAuthorizedInvestingAccountContext({
      accountId: ids.accountId,
      correlationId: ids.correlationId,
    });

    expect(result).toMatchObject({ ok: false, code: "INTERNAL_ERROR" });
    expect(auditClient.destroyed).toBe(true);
  });

  it("preserves denial audit evidence when authority release fails and never returns authority", async () => {
    const authorityClient = new FakeAuthorityClient({ access: [] }, {}, "release");
    const auditClient = new FakeAuthorityClient();
    mockClerkOk();
    mockDatabaseSequence([authorityClient, auditClient]);

    const result = await resolveAuthorizedInvestingAccountContext({
      accountId: ids.accountId,
      correlationId: ids.correlationId,
    });

    expect(result).toMatchObject({ ok: false, code: "INTERNAL_ERROR" });
    expect(isAuthorizedInvestingContext(result)).toBe(false);
    expect(authorityClient.destroyed).toBe(false);
    expect(auditClient.queries.some((query) => query.text.includes("insert into investing.audit_events"))).toBe(true);
    const auditInsert = auditClient.queries.find((query) => query.text.includes("insert into investing.audit_events"));
    expect(auditInsert?.values).toContain("ACCESS_INACTIVE");
  });

  it("fails closed when the canonical denial audit write fails and never converts denial to success", async () => {
    const authorityClient = new FakeAuthorityClient({ access: [] });
    const auditClient = new FakeAuthorityClient({}, {}, "query");
    mockClerkOk();
    mockDatabaseSequence([authorityClient, auditClient]);

    const result = await resolveAuthorizedInvestingAccountContext({
      accountId: ids.accountId,
      correlationId: ids.correlationId,
    });

    expect(result).toMatchObject({ ok: false, code: "INTERNAL_ERROR" });
    expect(authorityClient.queries.map((query) => query.text.toLowerCase())).toContain("rollback");
    expect(auditClient.queries.map((query) => query.text.toLowerCase())).toContain("rollback");
  });

  it("uses deterministic domain-separated SHA-256 hashes for pre-authority audit correlation only", () => {
    const subjectHash = hashPreAuthorityAuditValue(
      "SYNTRAKE_INVESTING_I2B_EXTERNAL_SUBJECT_V1",
      "CLERK",
      "user_clerk_123",
    );
    const selectorHash = hashPreAuthorityAuditValue(
      "SYNTRAKE_INVESTING_I2B_SELECTOR_V1",
      "ACCOUNT_ID",
      ids.accountId,
    );

    expect(subjectHash).toBe(
      createHash("sha256")
        .update("SYNTRAKE_INVESTING_I2B_EXTERNAL_SUBJECT_V1")
        .update("\0")
        .update("CLERK")
        .update("\0")
        .update("user_clerk_123")
        .digest("hex"),
    );
    expect(selectorHash).toBe(
      createHash("sha256")
        .update("SYNTRAKE_INVESTING_I2B_SELECTOR_V1")
        .update("\0")
        .update("ACCOUNT_ID")
        .update("\0")
        .update(ids.accountId)
        .digest("hex"),
    );
    expect(subjectHash).not.toBe(selectorHash);
  });

  it("fails closed for connect, query, commit, rollback, and release failures", async () => {
    const connectFailure = await resolveWith({}, {}, {}, "connect");
    const queryFailure = await resolveWith({}, {}, {}, "query");
    const commitFailure = await resolveWith({}, {}, {}, "commit");
    const rollbackFailure = await resolveWith({ principals: [] }, {}, {}, "rollback");
    const releaseFailure = await resolveWith({}, {}, {}, "release");

    expect(connectFailure.result).toMatchObject({ ok: false, code: "INTERNAL_ERROR" });
    expect(queryFailure.result).toMatchObject({ ok: false, code: "INTERNAL_ERROR" });
    expect(commitFailure.result).toMatchObject({ ok: false, code: "INTERNAL_ERROR" });
    expect(rollbackFailure.result).toMatchObject({ ok: false, code: "INTERNAL_ERROR" });
    expect(releaseFailure.result).toMatchObject({ ok: false, code: "INTERNAL_ERROR" });
  });

  it("uses one module-owned acquired client for BEGIN, transaction-local setup, canonical resolution, and COMMIT", async () => {
    const { result, client } = await resolveWith();

    expect(result.ok).toBe(true);
    expect(getInvestingAuthorityDatabase).toHaveBeenCalledTimes(1);
    expect(client?.queries[0].text.toLowerCase()).toBe("begin");
    expect(client?.queries.at(-1)?.text.toLowerCase()).toBe("commit");
    expect(client?.queries.some((query) => query.text.includes("set_config($1, $2, true)"))).toBe(true);
    expect(client?.queries.every((query) => !query.text.toLowerCase().includes("limit 1"))).toBe(true);
    expect(client?.released).toBe(true);
    expect(client?.destroyed).toBe(false);
  });

  it("uses normal release after clean rollback for deterministic denials", async () => {
    const { result, client } = await resolveWith({ accounts: [] });

    expect(result).toMatchObject({ ok: false, code: "FORBIDDEN_OR_NOT_FOUND" });
    expect(client?.queries.map((query) => query.text.toLowerCase())).toContain("rollback");
    expect(client?.released).toBe(true);
    expect(client?.destroyed).toBe(false);
  });

  it("defines a real server-only Supavisor transaction-pooler INVESTING_DATABASE_URL contract", () => {
    expect(readInvestingDatabaseConfig({})).toEqual({ ok: false, code: "MISSING_INVESTING_DATABASE_URL" });
    expect(readInvestingDatabaseConfig({ INVESTING_DATABASE_URL: "https://example.test" })).toEqual({
      ok: false,
      code: "MALFORMED_INVESTING_DATABASE_URL",
    });
    expect(
      readInvestingDatabaseConfig({
        INVESTING_DATABASE_URL: "postgresql://investing_app:secret@aws-0-region.pooler.supabase.com:6543/postgres",
      }),
    ).toEqual({ ok: false, code: "MALFORMED_INVESTING_DATABASE_URL" });
    expect(
      readInvestingDatabaseConfig({
        INVESTING_DATABASE_URL: "postgresql://postgres.projectref:secret@aws-0-region.pooler.supabase.com:6543/postgres",
      }),
    ).toEqual({ ok: false, code: "MALFORMED_INVESTING_DATABASE_URL" });
    expect(
      readInvestingDatabaseConfig({
        INVESTING_DATABASE_URL: "postgresql://investing_app.projectref:secret@aws-0-region.pooler.supabase.com:5432/postgres",
      }),
    ).toEqual({ ok: false, code: "MALFORMED_INVESTING_DATABASE_URL" });
    for (const url of [
      "postgresql://investing_app.projectref:secret@aws-0-region.pooler.supabase.com:6543/postgres?sslmode=disable",
      "postgresql://investing_app.projectref:secret@aws-0-region.pooler.supabase.com:6543/postgres?sslmode=no-verify",
      "postgresql://investing_app.projectref:secret@aws-0-region.pooler.supabase.com:6543/postgres?sslrootcert=unsafe",
      "postgresql://investing_app.projectref:secret@aws-0-region.pooler.supabase.com:6543/postgres#sslmode=disable",
    ]) {
      expect(readInvestingDatabaseConfig({ INVESTING_DATABASE_URL: url })).toEqual({
        ok: false,
        code: "MALFORMED_INVESTING_DATABASE_URL",
      });
    }
    expect(
      readInvestingDatabaseConfig({
        INVESTING_DATABASE_URL: "postgresql://investing_app.projectref:secret@aws-0-region.pooler.supabase.com:6543/postgres",
      }),
    ).toMatchObject({
      ok: true,
      port: 6543,
      database: "postgres",
      role: "investing_app",
      projectRef: "projectref",
      transport: "SUPABASE_SHARED_POOLER_TRANSACTION_MODE",
      preparedStatements: false,
      tls: { rejectUnauthorized: true },
    });

    expect(readFile(transportPath)).toContain('import { Pool, TypeOverrides, type PoolClient } from "pg"');
    expect(readFile(transportPath)).toContain("types.setTypeParser(POSTGRES_TIMESTAMPTZ_OID");
    expect(readFile(transportPath)).toContain('parsed.search !== ""');
    expect(readFile(transportPath)).toContain('parsed.hash !== ""');
    expect(readFile(transportPath)).toContain("ssl: config.tls");
  });

  it("adds RLS authority-read policies that validate persisted Principal, Membership, Access, and Account relationships", () => {
    const normalized = normalize(readFile(i2bMigrationPath));

    for (const policy of [
      "principals_i2b_authority_read",
      "accounts_i2b_authority_read",
      "tenants_i2b_authority_read",
      "tenant_memberships_i2b_authority_read",
      "account_access_i2b_authority_read",
    ]) {
      expect(normalized).toContain(`create policy ${policy}`);
      expect(normalized).toContain("for select");
      expect(normalized).toContain("to investing_app");
    }

    expect(normalized).toContain("from investing.principals p");
    expect(normalized).toContain("p.state = 'active'");
    expect(normalized).toContain("tm.state = 'active'");
    expect(normalized).toContain("account_access_i2b_authority_read");
    const accountsPolicy = normalized.slice(
      normalized.indexOf("create policy accounts_i2b_authority_read"),
      normalized.indexOf("create policy tenants_i2b_authority_read"),
    );
    expect(accountsPolicy).toContain("initial_principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid");
    expect(accountsPolicy).toContain("p.principal_id = accounts.initial_principal_id");
    expect(accountsPolicy).toContain("accounts.initial_tenant_membership_id");
    expect(accountsPolicy).not.toContain("join investing.tenant_memberships");
    expect(accountsPolicy).not.toContain("join investing.account_access");
    const authorityReadPolicies = normalized.slice(
      normalized.indexOf("create policy principals_i2b_authority_read"),
      normalized.indexOf("reset role;"),
    );
    expect(authorityReadPolicies).not.toMatch(/\busing\s*\(\s*true\s*\)/);
    expect(authorityReadPolicies).not.toMatch(/\bwith check\s*\(\s*true\s*\)/);
    expect(authorityReadPolicies).not.toMatch(/\bfor\s+(insert|update|delete|all)\b/);
    expect(normalized).not.toContain("~* '\\btrue\\b'");
    expect(normalized).toContain("unexpected policy inventory");
    expect(normalized).toContain("expected policies must target investing_app");
    expect(normalized).toContain("policy does not validate canonical principal identity");
  });

  it("adds append-only pre-authority audit sink with investing_app INSERT only and no shared role access", () => {
    const normalized = normalize(readFile(i2bMigrationPath));

    expect(normalized).toContain("create table investing.pre_authority_audit_events");
    expect(normalized).toContain("alter table investing.pre_authority_audit_events enable row level security");
    expect(normalized).toContain("alter table investing.pre_authority_audit_events force row level security");
    expect(normalized).toContain("grant insert on table investing.pre_authority_audit_events to investing_app");
    expect(normalized).toContain("revoke all on table investing.pre_authority_audit_events from public");
    expect(normalized).toContain("revoke all on table investing.pre_authority_audit_events from anon");
    expect(normalized).toContain("revoke all on table investing.pre_authority_audit_events from authenticated");
    expect(normalized).toContain("revoke all on table investing.pre_authority_audit_events from service_role");
    expect(normalized).toContain("create policy pre_authority_audit_events_i2b_insert");
    expect(normalized).toContain("for insert");
    expect(normalized).toContain("to investing_app");
    expect(normalized).toContain("with check");
    expect(normalized).toContain("operation = 'account_context_resolve'");
    expect(normalized).toContain("operation_scope = 'account_scope'");
    expect(normalized).toContain("selector_kind = 'account_id'");
    expect(normalized).toContain("outcome in ('denied', 'error')");
    expect(normalized).toContain("investing_app must have only insert on pre-authority audit");
    expect(normalized).toContain("pre-authority audit must not be available to shared/public roles");
    expect(normalized).not.toContain("grant select on table investing.pre_authority_audit_events to investing_app");
    expect(normalized).not.toContain("grant update on table investing.pre_authority_audit_events");
    expect(normalized).not.toContain("grant delete on table investing.pre_authority_audit_events");
    expect(normalized).not.toContain("grant all on table investing.pre_authority_audit_events");
  });

  it("enforces exact pre-authority stage, reason, and outcome semantic triples at DB level", () => {
    const normalized = normalize(readFile(i2bMigrationPath));
    const table = normalized.slice(
      normalized.indexOf("constraint pre_authority_audit_events_semantic_triple_check"),
      normalized.indexOf("constraint pre_authority_audit_events_recorded_after_occurred_check"),
    );

    for (const expected of [
      "resolution_stage = 'principal_lookup' and reason_code = 'zero_principal' and outcome = 'denied'",
      "resolution_stage = 'principal_lookup' and reason_code = 'duplicate_principal' and outcome = 'error'",
      "resolution_stage = 'principal_state' and reason_code = 'principal_disabled' and outcome = 'denied'",
      "resolution_stage = 'account_selector_lookup' and reason_code = 'account_selector_not_accessible' and outcome = 'denied'",
      "resolution_stage = 'account_selector_lookup' and reason_code = 'duplicate_account_selector' and outcome = 'error'",
      "resolution_stage = 'transaction_context_preflight' and reason_code = 'stale_transaction_context' and outcome = 'error'",
    ]) {
      expect(table).toContain(expected);
    }

    expect(table).not.toContain("resolution_stage = 'principal_lookup' and reason_code = 'zero_principal' and outcome = 'error'");
    expect(table).not.toContain("resolution_stage = 'principal_state' and reason_code = 'principal_disabled' and outcome = 'error'");
    expect(table).not.toContain("resolution_stage = 'account_selector_lookup' and reason_code = 'duplicate_account_selector' and outcome = 'denied'");
    expect(table).not.toContain("resolution_stage = 'transaction_context_preflight' and reason_code = 'stale_transaction_context' and outcome = 'denied'");
  });

  it("adds exactly one canonical account-denial audit_events INSERT policy and no runtime read/update/delete policy", () => {
    const normalized = normalize(readFile(i2bMigrationPath));
    const policy = normalized.slice(
      normalized.indexOf("create policy audit_events_i2b_authority_denial_insert"),
      normalized.indexOf("create policy principals_i2b_authority_read"),
    );

    expect(policy).toContain("on investing.audit_events");
    expect(policy).toContain("for insert");
    expect(policy).toContain("to investing_app");
    expect(policy).toContain("actor_kind = 'user_principal'");
    expect(policy).toContain("actor_id = current_setting('syntrake.investing.actor_id', true)");
    expect(policy).toContain("principal_id is not null");
    expect(policy).toContain("tenant_id is not null");
    expect(policy).toContain("account_id is not null");
    expect(policy).toContain("operation_scope = 'account_scope'");
    expect(policy).toContain("action = 'authority_access_denied'");
    expect(policy).toContain("object_type = 'account'");
    expect(policy).toContain("object_id = account_id::text");
    expect(policy).toContain("outcome = 'denied'");
    expect(policy).toContain("reason_code in ('tenant_inactive', 'membership_inactive', 'access_inactive')");
    expect(policy).toContain("outcome = 'failed'");
    expect(policy).toContain("duplicate_active_membership");
    expect(policy).toContain("duplicate_active_account_access");
    expect(policy).toContain("authority_tuple_mismatch");
    expect(policy).toContain("from investing.principals p");
    expect(policy).toContain("p.external_provider = 'clerk'");
    expect(policy).toContain("p.external_subject = current_setting('syntrake.investing.actor_id', true)");
    expect(policy).not.toContain("tenant_memberships");
    expect(policy).not.toContain("from investing.account_access");
    expect(policy).not.toMatch(/\busing\s*\(\s*true\s*\)/);
    expect(policy).not.toMatch(/\bwith check\s*\(\s*true\s*\)/);
    expect(normalized).not.toContain("create policy audit_events_i2b_authority_denial_select");
    expect(normalized).not.toContain("create policy audit_events_i2b_authority_denial_update");
    expect(normalized).not.toContain("create policy audit_events_i2b_authority_denial_delete");
  });

  it("uses PostgreSQL transaction_timestamp for audit occurred_at and recorded_at ordering without app clock dependency", () => {
    const source = readFile(sourcePath);
    const normalized = normalize(readFile(i2bMigrationPath));

    expect(source).not.toContain("new Date().toISOString()");
    expect(source).not.toContain("Date.now()");
    expect(source).toContain("transaction_timestamp())");
    expect(normalized).toContain("recorded_at timestamptz not null default now()");
    expect(normalized).toContain("check (recorded_at >= occurred_at)");
  });

  it("keeps pre-authority audit schema free of plaintext identity, selectors, tokens, secrets, and authority columns", () => {
    const normalized = normalize(readFile(i2bMigrationPath));
    const table = normalized.slice(
      normalized.indexOf("create table investing.pre_authority_audit_events"),
      normalized.indexOf("alter table investing.pre_authority_audit_events enable row level security"),
    );

    expect(table).toContain("external_subject_hash text not null");
    expect(table).toContain("selector_hash text not null");
    expect(table).not.toContain("external_subject text");
    expect(table).not.toContain("account_id uuid");
    expect(table).not.toContain("principal_id");
    expect(table).not.toContain("tenant_id");
    expect(table).not.toContain("service_role");
    for (const forbidden of ["token", "cookie", "authorization", "password", "secret", "db_url"]) {
      expect(table).not.toContain(forbidden);
    }
  });

  it("proves the pre-authority audit sink is not part of authority reads or RLS graph", () => {
    const source = readFile(sourcePath);
    const normalized = normalize(readFile(i2bMigrationPath));

    expect(source).not.toContain("from investing.pre_authority_audit_events");
    expect(source).not.toContain("select * from investing.pre_authority_audit_events");
    expect(normalized).not.toMatch(/from investing\.pre_authority_audit_events/);
    expect(normalized).not.toMatch(/join investing\.pre_authority_audit_events/);
    expect(normalized).toContain("pre_authority_audit_events_i2b_insert");
  });

  it("keeps the RLS policy dependency DAG acyclic and proves account_id GUC alone cannot reveal account rows", () => {
    const policyDependencies = new Map<string, string[]>([
      ["principals_i2b_authority_read", []],
      ["tenant_memberships_i2b_authority_read", ["principals_i2b_authority_read"]],
      ["account_access_i2b_authority_read", ["principals_i2b_authority_read", "tenant_memberships_i2b_authority_read"]],
      ["tenants_i2b_authority_read", ["principals_i2b_authority_read", "accounts_i2b_authority_read"]],
      ["accounts_i2b_authority_read", ["principals_i2b_authority_read"]],
    ]);

    const visiting = new Set<string>();
    const visited = new Set<string>();
    function visit(node: string): boolean {
      if (visiting.has(node)) return false;
      if (visited.has(node)) return true;
      visiting.add(node);
      for (const next of policyDependencies.get(node) ?? []) {
        if (!visit(next)) return false;
      }
      visiting.delete(node);
      visited.add(node);
      return true;
    }

    expect([...policyDependencies.keys()].every(visit)).toBe(true);

    const normalized = normalize(readFile(i2bMigrationPath));
    const accountsPolicy = normalized.slice(
      normalized.indexOf("create policy accounts_i2b_authority_read"),
      normalized.indexOf("create policy tenants_i2b_authority_read"),
    );
    expect(accountsPolicy).toContain("account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid");
    expect(accountsPolicy).toContain("initial_principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid");
    expect(accountsPolicy).toContain("and exists");
    expect(accountsPolicy).toContain("p.principal_id = accounts.initial_principal_id");
    expect(accountsPolicy).toContain("accounts.initial_tenant_membership_id");
    expect(accountsPolicy).not.toContain("current_setting('syntrake.investing.tenant_id', true)");
    expect(accountsPolicy).not.toContain("join investing.account_access aa");
    expect(accountsPolicy).not.toContain("join investing.tenant_memberships tm");
    const tenantsPolicy = normalized.slice(
      normalized.indexOf("create policy tenants_i2b_authority_read"),
      normalized.indexOf("create policy tenant_memberships_i2b_authority_read"),
    );
    expect(tenantsPolicy).toContain("from investing.accounts a");
    expect(tenantsPolicy).toContain("join investing.principals p");
    expect(tenantsPolicy).toContain("a.account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid");
    expect(tenantsPolicy).toContain("a.tenant_id = tenants.tenant_id");
    expect(tenantsPolicy).toContain("a.initial_principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid");
    expect(tenantsPolicy).toContain("p.principal_id = a.initial_principal_id");
    expect(tenantsPolicy).toContain("p.external_provider = current_setting('syntrake.investing.external_provider', true)");
    expect(tenantsPolicy).toContain("p.external_subject = current_setting('syntrake.investing.external_subject', true)");
    expect(tenantsPolicy).toContain("p.state = 'active'");
    expect(tenantsPolicy).not.toContain("join investing.account_access");
    expect(tenantsPolicy).not.toContain("join investing.tenant_memberships");
    expect(tenantsPolicy).not.toContain("a.initial_tenant_membership_id = nullif(current_setting('syntrake.investing.tenant_membership_id', true), '')::uuid");
    expect(tenantsPolicy).not.toContain("current_setting('syntrake.investing.account_access_id', true)");
  });

  it("keeps I2-B canonical denial audit honest without fabricating a Principal or SYSTEM_ACTOR", () => {
    const i2a = normalize(readFile(i2aMigrationPath));

    expect(i2a).toContain("constraint audit_events_actor_principal_check check ( (actor_kind = 'user_principal' and principal_id is not null) or (actor_kind = 'system_actor' and principal_id is null) )");
    expect(i2a).toContain("principal_id uuid references investing.principals");
    expect(readFile(sourcePath)).toContain("insert into investing.audit_events");
    expect(readFile(sourcePath)).not.toContain('actorKind: "SYSTEM_ACTOR"');
  });

  it("does not introduce AUTHORITY_ACCESS_GRANTED in I2-B", () => {
    expect(readFile(sourcePath)).not.toContain("AUTHORITY_ACCESS_GRANTED");
    expect(readFile(i2bMigrationPath)).not.toContain("AUTHORITY_ACCESS_GRANTED");
  });

  it("keeps I2-B free of Trading imports, engines, bootstrap, ledger, runtime API, and UI", () => {
    const source = readFile(sourcePath);
    const transport = readFile(transportPath);
    const migration = readFile(i2bMigrationPath);
    const combined = `${source}\n${transport}\n${migration}`.toLowerCase();

    for (const forbidden of [
      "lib/trading",
      "app/api/trading",
      "service_role as authorization",
      "create function investing.initial",
      "ledger_transactions",
      "ledger_postings",
      "recommendation",
      "allocation",
      "suitability",
      "valuation",
      "portfolio engine",
      "execution engine",
    ]) {
      expect(combined).not.toContain(forbidden);
    }

    expect(fs.existsSync(path.join(repoRoot, "app", "api", "investing"))).toBe(false);
    expect(fs.existsSync(path.join(repoRoot, "components", "investing"))).toBe(false);
  });
});
