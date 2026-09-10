import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AuthorizedInvestingContext,
  InvestingAuthorityDatabase,
  InvestingAuthorityTransactionClient,
} from "../lib/investing/authority/context";
import { investigationCreateMaterialIdentityV1 } from "../lib/investing/research/materialRequest";

vi.mock("server-only", () => ({}));

vi.mock("../lib/investing/authority/context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/investing/authority/context")>();
  return {
    ...actual,
    isAuthorizedResearchInvestigationCreateContext: vi.fn((value: unknown) => {
      const context = value as Record<string, unknown> | null;
      return (
        typeof value === "object" &&
        value !== null &&
        context?.__testResearchAuthorized === true &&
        context.operation === "RESEARCH_INVESTIGATION_CREATE_V1" &&
        context.capability === "RESEARCH_MUTATE" &&
        (context.operationScope === "TENANT_SCOPE" || context.operationScope === "ACCOUNT_SCOPE")
      );
    }),
    resolveAuthorizedResearchInvestigationCreateContext: vi.fn(),
  };
});

vi.mock("../lib/investing/authority/transport", () => ({
  getInvestingAuthorityDatabase: vi.fn(),
}));

const repoRoot = path.resolve(__dirname, "..");
const migrationPath = path.join(
  repoRoot,
  "supabase",
  "migrations",
  "20260910120000_investing_i5_a1_research_investigation_persistence.sql",
);

const ids = {
  principalId: "11111111-1111-4111-8111-111111111111",
  tenantId: "22222222-2222-4222-8222-222222222222",
  otherTenantId: "77777777-7777-4777-8777-777777777777",
  accountId: "33333333-3333-4333-8333-333333333333",
  otherAccountId: "88888888-8888-4888-8888-888888888888",
  membershipId: "44444444-4444-4444-8444-444444444444",
  accessId: "55555555-5555-4555-8555-555555555555",
  idempotencyKey: "idem-i5-a1-0000001",
  otherIdempotencyKey: "idem-i5-a1-0000002",
  correlationId: "corr-i5-a1-0000001",
};

type QueryRecord = { text: string; values: readonly unknown[] };
type Row = Record<string, unknown>;
type DmlKey = "idempotencyInsert" | "investigationInsert" | "idempotencyUpdate";

type FakeState = {
  idempotency: Row[];
  investigations: Row[];
  reservations?: Map<string, Row>;
};

const tenantContextValue = {
  __testResearchAuthorized: true,
  actorKind: "USER_PRINCIPAL",
  actorId: "user_clerk_i5_a1",
  principalId: ids.principalId,
  operationScope: "TENANT_SCOPE",
  tenantId: ids.tenantId,
  tenantMembershipId: ids.membershipId,
  correlationId: ids.correlationId,
  operation: "RESEARCH_INVESTIGATION_CREATE_V1",
  capability: "RESEARCH_MUTATE",
  sourceContext: "PURE_RESEARCH",
};

const testPortfolioContext = {
  ...tenantContextValue,
  sourceContext: "TEST_PORTFOLIO",
} as never;

const tenantContext = tenantContextValue as never;

const accountContext = {
  __testResearchAuthorized: true,
  actorKind: "USER_PRINCIPAL",
  actorId: "user_clerk_i5_a1",
  principalId: ids.principalId,
  operationScope: "ACCOUNT_SCOPE",
  tenantId: ids.tenantId,
  accountId: ids.accountId,
  tenantMembershipId: ids.membershipId,
  accountAccessId: ids.accessId,
  correlationId: ids.correlationId,
  operation: "RESEARCH_INVESTIGATION_CREATE_V1",
  capability: "RESEARCH_MUTATE",
  sourceContext: "USER_PORTFOLIO",
} as never;

class FakeResearchPersistenceClient implements InvestingAuthorityTransactionClient {
  readonly queries: QueryRecord[] = [];
  readonly config = new Map<string, string>();
  released = false;
  destroyed = false;
  private pendingIdempotency: Row[] = [];
  private pendingInvestigations: Row[] = [];
  private pendingUpdates: Array<{ id: string; reference: unknown }> = [];

  constructor(
    readonly state: FakeState = { idempotency: [], investigations: [] },
    private readonly rows: Record<string, Row[]> = {},
    private readonly dml: Partial<Record<DmlKey, number | null>> = {},
    private readonly staleContext: Row = {},
  ) {}

  async query<T = Row>(text: string, values: readonly unknown[] = []) {
    this.queries.push({ text, values });
    const sql = normalizeSql(text);

    if (sql === "begin") return { rows: [] as T[], rowCount: null };
    if (sql === "rollback") {
      for (const row of this.pendingIdempotency) {
        this.reservations().delete(this.idempotencyKey(row));
      }
      this.pendingIdempotency = [];
      this.pendingInvestigations = [];
      this.pendingUpdates = [];
      return { rows: [] as T[], rowCount: null };
    }
    if (sql === "commit") {
      this.state.idempotency.push(...this.pendingIdempotency);
      this.state.investigations.push(...this.pendingInvestigations);
      for (const update of this.pendingUpdates) {
        const row = this.state.idempotency.find((entry) => entry.idempotency_record_id === update.id);
        if (row) {
          row.status = "SUCCEEDED";
          row.canonical_result_reference = update.reference;
          row.completed_at = "now";
        }
      }
      for (const row of this.pendingIdempotency) {
        this.reservations().delete(this.idempotencyKey(row));
      }
      this.pendingIdempotency = [];
      this.pendingInvestigations = [];
      this.pendingUpdates = [];
      return { rows: [] as T[], rowCount: null };
    }
    if (sql.startsWith("select current_setting(")) return { rows: [this.staleContext as T], rowCount: 1 };
    if (sql.startsWith("select set_config(")) {
      this.config.set(values[0] as string, values[1] as string);
      return { rows: [] as T[], rowCount: null };
    }
    if (sql.includes("from investing.principals")) return rows<T>(this.rows.principals ?? [{ principal_id: ids.principalId, state: "ACTIVE" }]);
    if (sql.includes("from investing.tenants")) return rows<T>(this.rows.tenants ?? [{ tenant_id: ids.tenantId, state: "ACTIVE" }]);
    if (sql.includes("from investing.tenant_memberships")) {
      return rows<T>(this.rows.memberships ?? [{ tenant_membership_id: ids.membershipId, tenant_id: ids.tenantId, principal_id: ids.principalId, state: "ACTIVE" }]);
    }
    if (sql.includes("from investing.accounts")) return rows<T>(this.rows.accounts ?? [{ account_id: ids.accountId, tenant_id: ids.tenantId, state: "ACTIVE" }]);
    if (sql.includes("from investing.account_access")) {
      return rows<T>(this.rows.access ?? [{ account_access_id: ids.accessId, account_id: ids.accountId, tenant_id: ids.tenantId, tenant_membership_id: ids.membershipId, principal_id: ids.principalId, state: "ACTIVE" }]);
    }
    if (sql.startsWith("select idempotency_record_id") && sql.includes("from investing.idempotency_records")) {
      const key = this.idempotencyKeyFromQuery(values);
      let row = [...this.state.idempotency, ...this.pendingIdempotency].find((entry) => this.idempotencyKey(entry) === key);
      if (!row && this.reservations().has(key)) {
        row = await this.waitForCommittedIdempotency(key);
      }
      return rows<T>(row ? [row] : []);
    }
    if (sql.startsWith("insert into investing.idempotency_records")) {
      const row = {
        idempotency_record_id: values[0],
        idempotency_key: values[1],
        material_request_hash: values[2],
        correlation_id: values[3],
        actor_kind: "USER_PRINCIPAL",
        actor_id: values[4],
        operation_scope: values[5],
        operation: values[6],
        principal_id: values[7],
        tenant_id: values[8],
        account_id: values[9],
        status: "STARTED",
        canonical_result_reference: null,
      };
      const key = this.idempotencyKey(row);
      const keyConflict =
        [...this.state.idempotency, ...this.pendingIdempotency].some((entry) => this.idempotencyKey(entry) === key) ||
        this.reservations().has(key);
      if (keyConflict) return { rows: [] as T[], rowCount: 0 };
      this.reservations().set(key, row);
      this.pendingIdempotency.push(row);
      return { rows: [] as T[], rowCount: this.dmlRowCount("idempotencyInsert", 1) };
    }
    if (sql.startsWith("insert into investing.research_investigations")) {
      this.pendingInvestigations.push({
        research_investigation_id: values[0],
        tenant_id: values[1],
        account_id: values[2],
        principal_id: values[3],
        actor_kind: "USER_PRINCIPAL",
        actor_id: values[4],
        tenant_membership_id: values[5],
        account_access_id: values[6],
        operation_scope: values[7],
        operation: values[8],
        capability: values[9],
        source_context: values[10],
        material_request_hash: values[11],
        idempotency_record_id: values[12],
        idempotency_key: values[13],
        correlation_id: values[14],
      });
      return { rows: [] as T[], rowCount: this.dmlRowCount("investigationInsert", 1) };
    }
    if (sql.startsWith("update investing.idempotency_records")) {
      this.pendingUpdates.push({ id: values[0] as string, reference: JSON.parse(values[1] as string) });
      return { rows: [] as T[], rowCount: this.dmlRowCount("idempotencyUpdate", 1) };
    }
    if (sql.startsWith("select research_investigation_id") && sql.includes("from investing.research_investigations")) {
      const row = [...this.state.investigations, ...this.pendingInvestigations].find((entry) => {
        const accountMatches = values.length === 2 ? entry.account_id === null : entry.account_id === values[2];
        return entry.research_investigation_id === values[0] && entry.tenant_id === values[1] && accountMatches;
      });
      return rows<T>(row ? [row] : []);
    }
    throw new Error(`Unexpected query: ${text}`);
  }

  release(destroy = false) {
    this.destroyed = destroy;
    this.released = true;
  }

  private dmlRowCount(key: DmlKey, fallback: number) {
    return Object.prototype.hasOwnProperty.call(this.dml, key) ? this.dml[key] ?? null : fallback;
  }

  private reservations() {
    this.state.reservations ??= new Map<string, Row>();
    return this.state.reservations;
  }

  private idempotencyKey(row: Row) {
    return [
      row.actor_kind,
      row.actor_id,
      row.operation_scope,
      row.operation,
      row.idempotency_key,
    ].join("\0");
  }

  private idempotencyKeyFromQuery(values: readonly unknown[]) {
    return ["USER_PRINCIPAL", values[0], values.length === 5 ? "TENANT_SCOPE" : "ACCOUNT_SCOPE", values[3], values.at(-1)].join("\0");
  }

  private async waitForCommittedIdempotency(key: string) {
    for (let index = 0; index < 50; index += 1) {
      const row = this.state.idempotency.find((entry) => this.idempotencyKey(entry) === key);
      if (row) return row;
      await new Promise((resolve) => setTimeout(resolve, 1));
    }
    return undefined;
  }
}

function rows<T>(source: Row[]) {
  return { rows: source as T[], rowCount: source.length };
}

function mockDatabase(clients: FakeResearchPersistenceClient[]): InvestingAuthorityDatabase {
  return {
    connect: vi.fn(async () => {
      const client = clients.shift();
      if (!client) throw new Error("no fake client");
      return client;
    }),
  };
}

async function loadWriter() {
  const transport = await import("../lib/investing/authority/transport");
  const writer = await import("../lib/investing/research/investigationWriter");
  return { ...writer, getInvestingAuthorityDatabase: vi.mocked(transport.getInvestingAuthorityDatabase) };
}

async function loadService() {
  const authority = await import("../lib/investing/authority/context");
  const writer = await import("../lib/investing/research/investigationWriter");
  const service = await import("../lib/investing/research/investigationService");
  return {
    ...service,
    resolveAuthorizedResearchInvestigationCreateContext: vi.mocked(authority.resolveAuthorizedResearchInvestigationCreateContext),
    createResearchInvestigationV1: vi.spyOn(writer, "createResearchInvestigationV1"),
  };
}

function normalizeSql(sql: string) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--.*$/gm, "").replace(/\s+/g, " ").trim().toLowerCase();
}

function readMigration() {
  return fs.readFileSync(migrationPath, "utf8");
}

type PolicySnapshot = {
  tablename: string;
  policyname: string;
  cmd: "SELECT" | "INSERT";
  roles: readonly string[];
  qual: string;
  with_check: string;
};

const canonicalI5PolicySnapshots: PolicySnapshot[] = [
  {
    tablename: "pre_authority_audit_events",
    policyname: "pre_authority_audit_events_i2b_i5_insert",
    cmd: "INSERT",
    roles: ["investing_app"],
    qual: "",
    with_check: "RESEARCH_INVESTIGATION_CREATE_V1 RESEARCH_MUTATE TENANT_SCOPE ACCOUNT_SCOPE selector_kind",
  },
  {
    tablename: "audit_events",
    policyname: "audit_events_i5_research_investigation_create_denial_insert",
    cmd: "INSERT",
    roles: ["investing_app"],
    qual: "",
    with_check: "RESEARCH_INVESTIGATION_CREATE_V1 RESEARCH_MUTATE AUTHORITY_ACCESS_DENIED operation_scope",
  },
  {
    tablename: "tenants",
    policyname: "tenants_i5_research_authority_read",
    cmd: "SELECT",
    roles: ["investing_app"],
    qual: "RESEARCH_INVESTIGATION_CREATE_V1 RESEARCH_MUTATE TENANT_SCOPE tenant_id",
    with_check: "",
  },
  {
    tablename: "tenant_memberships",
    policyname: "tenant_memberships_i5_research_authority_read",
    cmd: "SELECT",
    roles: ["investing_app"],
    qual: "RESEARCH_INVESTIGATION_CREATE_V1 RESEARCH_MUTATE TENANT_SCOPE tenant_id principal_id OWNER",
    with_check: "",
  },
  {
    tablename: "accounts",
    policyname: "accounts_i5_research_account_authority_read",
    cmd: "SELECT",
    roles: ["investing_app"],
    qual: "RESEARCH_INVESTIGATION_CREATE_V1 RESEARCH_MUTATE ACCOUNT_SCOPE account_id initial_principal_id",
    with_check: "",
  },
  {
    tablename: "tenants",
    policyname: "tenants_i5_research_account_authority_read",
    cmd: "SELECT",
    roles: ["investing_app"],
    qual: "RESEARCH_INVESTIGATION_CREATE_V1 RESEARCH_MUTATE ACCOUNT_SCOPE account_id tenant_id",
    with_check: "",
  },
  {
    tablename: "tenant_memberships",
    policyname: "tenant_memberships_i5_research_account_authority_read",
    cmd: "SELECT",
    roles: ["investing_app"],
    qual: "RESEARCH_INVESTIGATION_CREATE_V1 RESEARCH_MUTATE ACCOUNT_SCOPE account_id tenant_id principal_id OWNER",
    with_check: "",
  },
  {
    tablename: "account_access",
    policyname: "account_access_i5_research_account_authority_read",
    cmd: "SELECT",
    roles: ["investing_app"],
    qual: "RESEARCH_INVESTIGATION_CREATE_V1 RESEARCH_MUTATE ACCOUNT_SCOPE account_id tenant_id principal_id tenant_membership_id OWNER",
    with_check: "",
  },
];

function canonicalPrestatePolicyCount(policies: readonly PolicySnapshot[]) {
  return policies.filter((policy) => {
    if (policy.roles.length !== 1 || policy.roles[0] !== "investing_app") return false;
    const qual = policy.qual.toLowerCase();
    const check = policy.with_check.toLowerCase();
    if (
      policy.tablename === "pre_authority_audit_events" &&
      policy.policyname === "pre_authority_audit_events_i2b_i5_insert" &&
      policy.cmd === "INSERT"
    ) {
      return ["research_investigation_create_v1", "research_mutate", "tenant_scope", "account_scope", "selector_kind"].every((needle) => check.includes(needle));
    }
    if (
      policy.tablename === "audit_events" &&
      policy.policyname === "audit_events_i5_research_investigation_create_denial_insert" &&
      policy.cmd === "INSERT"
    ) {
      return ["research_investigation_create_v1", "research_mutate", "authority_access_denied", "operation_scope"].every((needle) => check.includes(needle));
    }
    if (policy.cmd !== "SELECT") return false;
    const policyExpectations: Record<string, string[]> = {
      tenants_i5_research_authority_read: ["research_investigation_create_v1", "research_mutate", "tenant_scope", "tenant_id"],
      tenant_memberships_i5_research_authority_read: ["research_investigation_create_v1", "research_mutate", "tenant_scope", "tenant_id", "principal_id", "owner"],
      accounts_i5_research_account_authority_read: ["research_investigation_create_v1", "research_mutate", "account_scope", "account_id", "initial_principal_id"],
      tenants_i5_research_account_authority_read: ["research_investigation_create_v1", "research_mutate", "account_scope", "account_id", "tenant_id"],
      tenant_memberships_i5_research_account_authority_read: ["research_investigation_create_v1", "research_mutate", "account_scope", "account_id", "tenant_id", "principal_id", "owner"],
      account_access_i5_research_account_authority_read: ["research_investigation_create_v1", "research_mutate", "account_scope", "account_id", "tenant_id", "principal_id", "tenant_membership_id", "owner"],
    };
    return (policyExpectations[policy.policyname] ?? []).every((needle) => qual.includes(needle));
  }).length;
}

function operationTokenCount(constraint: string) {
  return Array.from(constraint.matchAll(/'([A-Z0-9_]+)'/g)).length;
}

describe("Investing Genesis I5-A1 Research Investigation persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("persists PURE_RESEARCH and TEST_PORTFOLIO investigations in TENANT_SCOPE with no account identifiers", async () => {
    const writer = await loadWriter();
    for (const context of [tenantContext, testPortfolioContext]) {
      const client = new FakeResearchPersistenceClient();
      writer.getInvestingAuthorityDatabase.mockReturnValueOnce(mockDatabase([client]));

      const result = await writer.createResearchInvestigationV1({
        authorizedContext: context,
        idempotencyKey: ids.idempotencyKey,
        correlationId: ids.correlationId,
      });

      expect(result).toMatchObject({ ok: true, replayed: false });
      expect(client.state.investigations).toHaveLength(1);
      expect(client.state.investigations[0]).toMatchObject({
        tenant_id: ids.tenantId,
        account_id: null,
        account_access_id: null,
        operation_scope: "TENANT_SCOPE",
        operation: "RESEARCH_INVESTIGATION_CREATE_V1",
        capability: "RESEARCH_MUTATE",
        source_context: (context as { sourceContext: string }).sourceContext,
      });
      expect(client.config.get("syntrake.investing.account_id")).toBeUndefined();
    }
  });

  it("persists USER_PORTFOLIO investigations in ACCOUNT_SCOPE with the authorized account", async () => {
    const client = new FakeResearchPersistenceClient();
    const writer = await loadWriter();
    writer.getInvestingAuthorityDatabase.mockReturnValue(mockDatabase([client]));

    const result = await writer.createResearchInvestigationV1({
      authorizedContext: accountContext,
      idempotencyKey: ids.idempotencyKey,
      correlationId: ids.correlationId,
    });

    expect(result).toMatchObject({ ok: true, replayed: false });
    expect(client.state.investigations[0]).toMatchObject({
      tenant_id: ids.tenantId,
      account_id: ids.accountId,
      account_access_id: ids.accessId,
      operation_scope: "ACCOUNT_SCOPE",
      source_context: "USER_PORTFOLIO",
    });
    expect(client.config.get("syntrake.investing.account_id")).toBe(ids.accountId);
  });

  it.each([
    ["missing account in USER_PORTFOLIO", { accounts: [] }, "FORBIDDEN_OR_NOT_FOUND"],
    ["inactive account in USER_PORTFOLIO", { accounts: [{ account_id: ids.accountId, tenant_id: ids.tenantId, state: "FROZEN" }] }, "ACCOUNT_INACTIVE"],
    ["revoked membership", { memberships: [{ tenant_membership_id: ids.membershipId, tenant_id: ids.tenantId, principal_id: ids.principalId, state: "REVOKED" }] }, "MEMBERSHIP_INACTIVE"],
    ["revoked account access", { access: [{ account_access_id: ids.accessId, account_id: ids.accountId, tenant_id: ids.tenantId, tenant_membership_id: ids.membershipId, principal_id: ids.principalId, state: "REVOKED" }] }, "ACCESS_INACTIVE"],
    ["cross tenant account", { accounts: [{ account_id: ids.accountId, tenant_id: ids.otherTenantId, state: "ACTIVE" }] }, "INTERNAL_ERROR"],
    ["cross account access", { access: [{ account_access_id: ids.accessId, account_id: ids.otherAccountId, tenant_id: ids.tenantId, tenant_membership_id: ids.membershipId, principal_id: ids.principalId, state: "ACTIVE" }] }, "INTERNAL_ERROR"],
  ])("revalidates authority inside the write transaction: %s", async (_label, tableRows, code) => {
    const client = new FakeResearchPersistenceClient({ idempotency: [], investigations: [] }, tableRows as Record<string, Row[]>);
    const writer = await loadWriter();
    writer.getInvestingAuthorityDatabase.mockReturnValue(mockDatabase([client]));

    const result = await writer.createResearchInvestigationV1({
      authorizedContext: accountContext,
      idempotencyKey: ids.idempotencyKey,
      correlationId: ids.correlationId,
    });

    expect(result).toMatchObject({ ok: false, code });
    expect(client.state.idempotency).toHaveLength(0);
    expect(client.state.investigations).toHaveLength(0);
    expect(client.queries.map((query) => normalizeSql(query.text))).toContain("rollback");
  });

  it("replays the same idempotency key and material to the same investigation", async () => {
    const state = { idempotency: [], investigations: [] };
    const firstClient = new FakeResearchPersistenceClient(state);
    const secondClient = new FakeResearchPersistenceClient(state);
    const writer = await loadWriter();
    writer.getInvestingAuthorityDatabase.mockReturnValueOnce(mockDatabase([firstClient])).mockReturnValueOnce(mockDatabase([secondClient]));

    const first = await writer.createResearchInvestigationV1({ authorizedContext: tenantContext, idempotencyKey: ids.idempotencyKey, correlationId: ids.correlationId });
    const second = await writer.createResearchInvestigationV1({ authorizedContext: tenantContext, idempotencyKey: ids.idempotencyKey, correlationId: ids.correlationId });

    expect(first).toMatchObject({ ok: true, replayed: false });
    expect(second).toMatchObject({ ok: true, replayed: true });
    expect(state.investigations).toHaveLength(1);
    expect(second.ok && first.ok && second.investigationId === first.investigationId).toBe(true);
  });

  it("converges concurrent creates with the same key and same material to one Investigation", async () => {
    const state: FakeState = { idempotency: [], investigations: [], reservations: new Map() };
    const firstClient = new FakeResearchPersistenceClient(state);
    const secondClient = new FakeResearchPersistenceClient(state);
    const writer = await loadWriter();
    writer.getInvestingAuthorityDatabase.mockReturnValueOnce(mockDatabase([firstClient])).mockReturnValueOnce(mockDatabase([secondClient]));

    const [first, second] = await Promise.all([
      writer.createResearchInvestigationV1({ authorizedContext: tenantContext, idempotencyKey: ids.idempotencyKey, correlationId: ids.correlationId }),
      writer.createResearchInvestigationV1({ authorizedContext: tenantContext, idempotencyKey: ids.idempotencyKey, correlationId: ids.correlationId }),
    ]);

    expect([first, second].filter((result) => result.ok && result.replayed === false)).toHaveLength(1);
    expect([first, second].filter((result) => result.ok && result.replayed === true)).toHaveLength(1);
    expect(first.ok && second.ok && first.investigationId === second.investigationId).toBe(true);
    expect(state.idempotency).toHaveLength(1);
    expect(state.investigations).toHaveLength(1);
    expect(secondClient.queries.some((query) => normalizeSql(query.text).includes("on conflict"))).toBe(true);
  });

  it("rejects the same idempotency key with different material and creates no second investigation", async () => {
    const state = { idempotency: [], investigations: [] };
    const firstClient = new FakeResearchPersistenceClient(state);
    const secondClient = new FakeResearchPersistenceClient(state);
    const writer = await loadWriter();
    writer.getInvestingAuthorityDatabase.mockReturnValueOnce(mockDatabase([firstClient])).mockReturnValueOnce(mockDatabase([secondClient]));

    await writer.createResearchInvestigationV1({ authorizedContext: tenantContext, idempotencyKey: ids.idempotencyKey, correlationId: ids.correlationId });
    const conflict = await writer.createResearchInvestigationV1({
      authorizedContext: testPortfolioContext,
      idempotencyKey: ids.idempotencyKey,
      correlationId: ids.correlationId,
    });

    expect(conflict).toEqual({ ok: false, code: "CONFLICT" });
    expect(state.idempotency).toHaveLength(1);
    expect(state.investigations).toHaveLength(1);
  });

  it("keeps materialRequestHash invariant to idempotencyKey and correlationId metadata", () => {
    const scope = {
      actorKind: "USER_PRINCIPAL",
      actorId: "user_clerk_i5_a1",
      principalId: ids.principalId,
      operationScope: "TENANT_SCOPE",
      tenantId: ids.tenantId,
      sourceContext: "PURE_RESEARCH",
    } as const;
    const first = investigationCreateMaterialIdentityV1(scope, {
      operation: "RESEARCH_INVESTIGATION_CREATE_V1",
      idempotencyKey: ids.idempotencyKey,
      correlationId: ids.correlationId,
    });
    const second = investigationCreateMaterialIdentityV1(scope, {
      operation: "RESEARCH_INVESTIGATION_CREATE_V1",
      idempotencyKey: ids.otherIdempotencyKey,
      correlationId: "corr-i5-a1-0000002",
    });

    expect(second.materialRequestHash).toBe(first.materialRequestHash);
  });

  it("uses the canonical I5 material identity contract for persistence hashing", async () => {
    const client = new FakeResearchPersistenceClient();
    const writer = await loadWriter();
    writer.getInvestingAuthorityDatabase.mockReturnValue(mockDatabase([client]));

    const result = await writer.createResearchInvestigationV1({
      authorizedContext: accountContext,
      idempotencyKey: ids.idempotencyKey,
      correlationId: ids.correlationId,
    });
    const expected = investigationCreateMaterialIdentityV1({
      actorKind: "USER_PRINCIPAL",
      actorId: "user_clerk_i5_a1",
      principalId: ids.principalId,
      operationScope: "ACCOUNT_SCOPE",
      tenantId: ids.tenantId,
      accountId: ids.accountId,
      sourceContext: "USER_PORTFOLIO",
    }, {
      operation: "RESEARCH_INVESTIGATION_CREATE_V1",
      idempotencyKey: "metadata-only-does-not-change-material",
      correlationId: "metadata-only-correlation",
    });

    expect(result).toMatchObject({ ok: true, materialRequestHash: expected.materialRequestHash });
  });

  it("rolls back both investigation and idempotency effects when completion fails", async () => {
    const client = new FakeResearchPersistenceClient({ idempotency: [], investigations: [] }, {}, { idempotencyUpdate: 0 });
    const writer = await loadWriter();
    writer.getInvestingAuthorityDatabase.mockReturnValue(mockDatabase([client]));

    const result = await writer.createResearchInvestigationV1({
      authorizedContext: tenantContext,
      idempotencyKey: ids.idempotencyKey,
      correlationId: ids.correlationId,
    });

    expect(result).toEqual({ ok: false, code: "INTERNAL_ERROR" });
    expect(client.state.idempotency).toHaveLength(0);
    expect(client.state.investigations).toHaveLength(0);
    expect(client.queries.map((query) => normalizeSql(query.text))).toContain("rollback");
  });

  it("rejects wrong branded authority, wrong operation, wrong capability, and I2 contexts before DB access", async () => {
    const client = new FakeResearchPersistenceClient();
    const writer = await loadWriter();
    writer.getInvestingAuthorityDatabase.mockReturnValue(mockDatabase([client]));

    const forgedCases = [
      { ...tenantContextValue, __testResearchAuthorized: false },
      { ...tenantContextValue, operation: "ACCOUNT_CONTEXT_RESOLVE" },
      { ...tenantContextValue, capability: "ACCOUNT_AUTHORITY_READ" },
      { actorKind: "USER_PRINCIPAL", operation: "ACCOUNT_CONTEXT_RESOLVE", capability: "ACCOUNT_AUTHORITY_READ" },
    ];

    for (const authorizedContext of forgedCases) {
      const result = await writer.createResearchInvestigationV1({
        authorizedContext: authorizedContext as never,
        idempotencyKey: ids.idempotencyKey,
        correlationId: ids.correlationId,
      });
      expect(result).toEqual({ ok: false, code: "VALIDATION_ERROR" });
    }
    expect(client.queries).toEqual([]);
  });

  it("has compile-time evidence that I2 context cannot be supplied to the I5 writer", async () => {
    const writer = await loadWriter();
    const i2Context = {
      actorKind: "USER_PRINCIPAL",
      actorId: "user_clerk_i5_a1",
      principalId: ids.principalId,
      operationScope: "ACCOUNT_SCOPE",
      tenantId: ids.tenantId,
      accountId: ids.accountId,
      tenantMembershipId: ids.membershipId,
      accountAccessId: ids.accessId,
      correlationId: ids.correlationId,
      operation: "ACCOUNT_CONTEXT_RESOLVE",
      capability: "ACCOUNT_AUTHORITY_READ",
    } as AuthorizedInvestingContext;

    void i2Context;
    // @ts-expect-error I2 authority proof is not accepted by the Research Investigation writer.
    void writer.createResearchInvestigationV1({ authorizedContext: i2Context, idempotencyKey: ids.idempotencyKey, correlationId: ids.correlationId });
  });

  it("keeps the public service parser closed and rejects authority injection", async () => {
    const service = await loadService();
    service.resolveAuthorizedResearchInvestigationCreateContext.mockResolvedValue({ ok: true, context: tenantContext });

    for (const command of [
      { sourceContext: "PURE_RESEARCH", tenantId: ids.tenantId, idempotencyKey: ids.idempotencyKey, correlationId: ids.correlationId, principalId: ids.principalId },
      { sourceContext: "PURE_RESEARCH", tenantId: ids.tenantId, idempotencyKey: ids.idempotencyKey, correlationId: ids.correlationId, rawIntent: "belongs in I5-A2 draft" },
      { sourceContext: "USER_PORTFOLIO", idempotencyKey: ids.idempotencyKey, correlationId: ids.correlationId },
      { sourceContext: "USER_PORTFOLIO", accountId: ids.accountId, tenantId: ids.tenantId, idempotencyKey: ids.idempotencyKey, correlationId: ids.correlationId },
    ]) {
      const result = await service.createResearchInvestigationForCurrentUserV1(command);
      expect(result).toEqual({ ok: false, code: "VALIDATION_ERROR" });
    }
    expect(service.resolveAuthorizedResearchInvestigationCreateContext).not.toHaveBeenCalled();
  });

  it("routes USER_PORTFOLIO only to account authority and never falls back to TENANT_SCOPE", async () => {
    const service = await loadService();
    service.resolveAuthorizedResearchInvestigationCreateContext.mockResolvedValue({
      ok: false,
      code: "ACCESS_INACTIVE",
      externalCode: "INTERNAL_ERROR",
    });

    const result = await service.createResearchInvestigationForCurrentUserV1({
      sourceContext: "USER_PORTFOLIO",
      accountId: ids.accountId,
      idempotencyKey: ids.idempotencyKey,
      correlationId: ids.correlationId,
    });

    expect(result).toMatchObject({ ok: false, code: "ACCESS_INACTIVE" });
    expect(service.resolveAuthorizedResearchInvestigationCreateContext).toHaveBeenCalledWith({
      sourceContext: "USER_PORTFOLIO",
      accountId: ids.accountId,
      correlationId: ids.correlationId,
    });
    expect(service.resolveAuthorizedResearchInvestigationCreateContext).not.toHaveBeenCalledWith(expect.objectContaining({ tenantId: expect.any(String) }));
  });

  it("pins SQL authority, RLS, grants, and legacy exclusions for independent PG17 rehearsal", () => {
    const rawSql = readMigration();
    const sql = normalizeSql(readMigration());

    expect(sql.startsWith("begin;")).toBe(true);
    expect(sql.endsWith("commit;")).toBe(true);
    expect(sql).toContain("if current_user <> 'postgres' then");
    expect(sql).not.toContain("session_user in ('anon', 'authenticated', 'service_role', 'investing_app')");
    expect(sql).toContain("set local role investing_owner");
    expect(sql).toContain("c.relkind in ('r', 'p')");
    expect(sql).toContain("c.relowner = 'investing_owner'::regrole");
    expect(sql).toContain("c.relrowsecurity");
    expect(sql).toContain("c.relforcerowsecurity");
    expect(sql).toContain("if v_relation_count <> 8 then");
    for (const table of [
      "principals",
      "tenants",
      "tenant_memberships",
      "accounts",
      "account_access",
      "idempotency_records",
      "audit_events",
      "pre_authority_audit_events",
    ]) {
      expect(sql).toContain(`'${table}'`);
    }
    expect(rawSql).not.toMatch(/research_authority_sessions|research_authority_denials|research_authority_sessions_operation_check/);
    expect(sql).toContain("v_constraint_count <> 1");
    expect(sql).toContain("v_operation_constraint is null");
    expect(sql).toContain("v_operation_constraint !~ 'initial_personal_bootstrap'");
    expect(sql).toContain("v_operation_constraint !~ 'initial_paper_cash_funding'");
    expect(sql).toContain("v_operation_constraint ~ 'research_investigation_create_v1'");
    expect(sql).toContain("v_operation_token_count <> 2");
    for (const policy of [
      "pre_authority_audit_events_i2b_i5_insert",
      "audit_events_i5_research_investigation_create_denial_insert",
      "tenants_i5_research_authority_read",
      "tenant_memberships_i5_research_authority_read",
      "accounts_i5_research_account_authority_read",
      "tenants_i5_research_account_authority_read",
      "tenant_memberships_i5_research_account_authority_read",
      "account_access_i5_research_account_authority_read",
    ]) {
      expect(sql).toContain(`'${policy}'`);
    }
    expect(sql).toContain("cmd = 'insert'");
    expect(sql).toContain("cmd = 'select'");
    expect(sql).toContain("with_check ~ 'research_investigation_create_v1'");
    expect(sql).toContain("qual ~ 'research_investigation_create_v1'");
    expect(sql).toContain("qual ~ 'research_mutate'");
    expect(sql).toContain("qual ~ 'account_scope'");
    expect(sql).toContain("if v_policy_count <> 8 then");
    const accountAccessPrestate = sql.slice(
      sql.indexOf("tablename = 'account_access'"),
      sql.indexOf("if v_policy_count <> 8 then"),
    );
    expect(accountAccessPrestate).toContain("policyname = 'account_access_i5_research_account_authority_read'");
    expect(accountAccessPrestate).toContain("qual ~ 'tenant_membership_id'");
    expect(accountAccessPrestate).toContain("qual ~ 'owner'");
    expect(accountAccessPrestate).not.toContain("qual ~ 'active'");
    expect(sql).toContain("add constraint account_access_identity_tuple_key unique (account_access_id, account_id, tenant_id, tenant_membership_id, principal_id)");
    expect(sql).toContain("create table investing.research_investigations");
    expect(sql).toContain("constraint research_investigations_account_access_tuple_fk foreign key (account_access_id, account_id, tenant_id, tenant_membership_id, principal_id)");
    expect(sql).toContain("alter table investing.research_investigations enable row level security");
    expect(sql).toContain("alter table investing.research_investigations force row level security");
    expect(sql).toContain("grant select, insert on table investing.research_investigations to investing_app");
    expect(sql).toContain("create policy research_investigations_i5_create_insert");
    expect(sql).toContain("create policy research_investigations_i5_create_read");
    expect(sql).toContain("create policy idempotency_records_i5_research_investigation_create_insert");
    expect(sql).toContain("create policy idempotency_records_i5_research_investigation_create_update");
    expect(sql).toContain("operation = 'research_investigation_create_v1'");
    expect(sql).toContain("capability = 'research_mutate'");
    expect(sql).toContain("operation_scope = 'tenant_scope'");
    expect(sql).toContain("account_id is null");
    expect(sql).toContain("operation_scope = 'account_scope'");
    expect(sql).toContain("account_id::text = current_setting('syntrake.investing.account_id', true)");
    expect(sql).toContain("if v_bad_grants <> 0 then");
    expect(sql).toContain("p.prosecdef");
    expect(rawSql).not.toMatch(/initial_question|initialQuestion|rawIntent|content_schema_version|research_initial_question_hash/);
    expect(sql).not.toContain("investing_research_");
    expect(sql).not.toContain("public.research_lab_state");
    expect(sql).not.toContain("public.research_lab_runs");
    expect(sql).not.toContain("public.research_lab_decisions");
    expect(sql).not.toContain("to service_role");
    expect(sql).not.toMatch(/\busing\s*\(\s*true\s*\)|\bwith check\s*\(\s*true\s*\)/);
  });

  it("models the canonical I5 prestate policy count as exactly eight lifecycle-aware policies", () => {
    expect(canonicalPrestatePolicyCount(canonicalI5PolicySnapshots)).toBe(8);
    const accountAccess = canonicalI5PolicySnapshots.find((policy) => policy.policyname === "account_access_i5_research_account_authority_read");

    expect(accountAccess?.qual.toLowerCase()).toContain("tenant_membership_id");
    expect(accountAccess?.qual.toLowerCase()).toContain("owner");
    expect(accountAccess?.qual.toLowerCase()).not.toContain("active");
  });

  it("models missing or materially altered predecessor I5 policies as prestate failures", () => {
    const missingAccessPolicy = canonicalI5PolicySnapshots.filter((policy) => policy.policyname !== "account_access_i5_research_account_authority_read");
    const alteredOperation = canonicalI5PolicySnapshots.map((policy) =>
      policy.policyname === "tenants_i5_research_authority_read"
        ? { ...policy, qual: policy.qual.replace("RESEARCH_INVESTIGATION_CREATE_V1", "ACCOUNT_CONTEXT_RESOLVE") }
        : policy,
    );
    const alteredScope = canonicalI5PolicySnapshots.map((policy) =>
      policy.policyname === "accounts_i5_research_account_authority_read"
        ? { ...policy, qual: policy.qual.replace("ACCOUNT_SCOPE", "TENANT_SCOPE") }
        : policy,
    );
    const alteredRole = canonicalI5PolicySnapshots.map((policy) =>
      policy.policyname === "pre_authority_audit_events_i2b_i5_insert"
        ? { ...policy, roles: ["authenticated"] }
        : policy,
    );

    expect(canonicalPrestatePolicyCount(missingAccessPolicy)).toBe(7);
    expect(canonicalPrestatePolicyCount(alteredOperation)).toBe(7);
    expect(canonicalPrestatePolicyCount(alteredScope)).toBe(7);
    expect(canonicalPrestatePolicyCount(alteredRole)).toBe(7);
  });

  it("models idempotency operation prestate as exact and fails with a third unexpected token", () => {
    const canonicalConstraint = "CHECK (operation IN ('INITIAL_PERSONAL_BOOTSTRAP', 'INITIAL_PAPER_CASH_FUNDING'))";
    const driftedConstraint = "CHECK (operation IN ('INITIAL_PERSONAL_BOOTSTRAP', 'INITIAL_PAPER_CASH_FUNDING', 'SOMETHING_ELSE'))";

    expect(operationTokenCount(canonicalConstraint)).toBe(2);
    expect(operationTokenCount(driftedConstraint)).toBe(3);
  });
});
