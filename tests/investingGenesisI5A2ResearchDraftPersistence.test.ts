import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AuthorizedInvestingContext,
  InvestingAuthorityDatabase,
  InvestingAuthorityTransactionClient,
} from "../lib/investing/authority/context";
import { draftCreateMaterialIdentityV1 } from "../lib/investing/research/materialRequest";
import {
  canonicalResearchDraftHashPayloadV1,
  hashResearchDraftV1,
  type ResearchDraftHashPayloadInputV1,
} from "../lib/investing/research/semantic";

vi.mock("server-only", () => ({}));

vi.mock("../lib/investing/authority/context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/investing/authority/context")>();
  return {
    ...actual,
    isAuthorizedResearchDraftCreateContext: vi.fn((value: unknown) => {
      const context = value as Record<string, unknown> | null;
      return (
        typeof value === "object" &&
        value !== null &&
        context?.__testDraftAuthorized === true &&
        context.operation === "RESEARCH_DRAFT_CREATE_V1" &&
        context.capability === "RESEARCH_MUTATE" &&
        (context.operationScope === "TENANT_SCOPE" || context.operationScope === "ACCOUNT_SCOPE")
      );
    }),
    resolveAuthorizedResearchDraftCreateContext: vi.fn(),
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
  "20260910130000_investing_i5_a2_research_draft_persistence.sql",
);

const ids = {
  principalId: "11111111-1111-4111-8111-111111111111",
  tenantId: "22222222-2222-4222-8222-222222222222",
  otherTenantId: "77777777-7777-4777-8777-777777777777",
  accountId: "33333333-3333-4333-8333-333333333333",
  otherAccountId: "88888888-8888-4888-8888-888888888888",
  membershipId: "44444444-4444-4444-8444-444444444444",
  accessId: "55555555-5555-4555-8555-555555555555",
  investigationId: "66666666-6666-4666-8666-666666666666",
  idempotencyKey: "idem-i5-a2-0000001",
  otherIdempotencyKey: "idem-i5-a2-0000002",
  correlationId: "corr-i5-a2-0000001",
};

const draftPayload: ResearchDraftHashPayloadInputV1 = {
  schemaVersion: "RESEARCH_DRAFT_HASH_PAYLOAD_V1",
  rawIntent: "Café momentum intent",
  interpretedObjective: {
    state: "USER_SUPPLIED",
    value: "Investigate whether large-cap momentum survives transaction costs.",
  },
  constraints: [
    {
      state: "MATERIAL_UNRESOLVED",
      question: "Which benchmark universe is admissible?",
    },
    {
      state: "CONFIRMATION_REQUIRED",
      question: "Confirm rebalance cadence.",
      proposedValue: "Monthly",
    },
  ],
};

const secondDraftPayload: ResearchDraftHashPayloadInputV1 = {
  ...draftPayload,
  rawIntent: "Different owner intent",
};

type QueryRecord = { text: string; values: readonly unknown[] };
type Row = Record<string, unknown>;
type DmlKey = "idempotencyInsert" | "draftInsert" | "idempotencyUpdate";

type FakeState = {
  idempotency: Row[];
  drafts: Row[];
  reservations?: Map<string, Row>;
};

const tenantContextValue = {
  __testDraftAuthorized: true,
  actorKind: "USER_PRINCIPAL",
  actorId: "user_clerk_i5_a2",
  principalId: ids.principalId,
  operationScope: "TENANT_SCOPE",
  tenantId: ids.tenantId,
  tenantMembershipId: ids.membershipId,
  correlationId: ids.correlationId,
  operation: "RESEARCH_DRAFT_CREATE_V1",
  capability: "RESEARCH_MUTATE",
  sourceContext: "PURE_RESEARCH",
  researchInvestigationId: ids.investigationId,
};

const testPortfolioContext = {
  ...tenantContextValue,
  sourceContext: "TEST_PORTFOLIO",
} as never;

const tenantContext = tenantContextValue as never;

const accountContext = {
  __testDraftAuthorized: true,
  actorKind: "USER_PRINCIPAL",
  actorId: "user_clerk_i5_a2",
  principalId: ids.principalId,
  operationScope: "ACCOUNT_SCOPE",
  tenantId: ids.tenantId,
  accountId: ids.accountId,
  tenantMembershipId: ids.membershipId,
  accountAccessId: ids.accessId,
  correlationId: ids.correlationId,
  operation: "RESEARCH_DRAFT_CREATE_V1",
  capability: "RESEARCH_MUTATE",
  sourceContext: "USER_PORTFOLIO",
  researchInvestigationId: ids.investigationId,
} as never;

class FakeResearchDraftPersistenceClient implements InvestingAuthorityTransactionClient {
  readonly queries: QueryRecord[] = [];
  readonly config = new Map<string, string>();
  released = false;
  destroyed = false;
  private pendingIdempotency: Row[] = [];
  private pendingDrafts: Row[] = [];
  private pendingUpdates: Array<{ id: string; reference: unknown }> = [];

  constructor(
    readonly state: FakeState = { idempotency: [], drafts: [] },
    private readonly tableRows: Record<string, Row[]> = {},
    private readonly dml: Partial<Record<DmlKey, number | null>> = {},
    private readonly staleContext: Row = {},
  ) {}

  async query<T = Row>(text: string, values: readonly unknown[] = []) {
    this.queries.push({ text, values });
    const sql = normalizeSql(text);

    if (sql === "begin") return { rows: [] as T[], rowCount: null };
    if (sql === "rollback") {
      for (const row of this.pendingIdempotency) this.reservations().delete(this.idempotencyKey(row));
      this.pendingIdempotency = [];
      this.pendingDrafts = [];
      this.pendingUpdates = [];
      return { rows: [] as T[], rowCount: null };
    }
    if (sql === "commit") {
      for (const update of this.pendingUpdates) {
        const row = [...this.state.idempotency, ...this.pendingIdempotency].find((entry) => entry.idempotency_record_id === update.id);
        if (row) {
          row.canonical_result_reference = update.reference;
          row.completed_at = "now";
          row.status = "SUCCEEDED";
        }
      }
      this.state.idempotency.push(...this.pendingIdempotency);
      this.state.drafts.push(...this.pendingDrafts);
      for (const row of this.pendingIdempotency) this.reservations().delete(this.idempotencyKey(row));
      this.pendingIdempotency = [];
      this.pendingDrafts = [];
      this.pendingUpdates = [];
      return { rows: [] as T[], rowCount: null };
    }
    if (sql.startsWith("select current_setting(")) return { rows: [this.staleContext as T], rowCount: 1 };
    if (sql.startsWith("select set_config(")) {
      this.config.set(values[0] as string, values[1] as string);
      return { rows: [] as T[], rowCount: null };
    }
    if (sql.includes("from investing.principals")) return rows<T>(this.tableRows.principals ?? [{ principal_id: ids.principalId, state: "ACTIVE" }]);
    if (sql.includes("from investing.tenants")) return rows<T>(this.tableRows.tenants ?? [{ tenant_id: ids.tenantId, state: "ACTIVE" }]);
    if (sql.includes("from investing.tenant_memberships")) {
      return rows<T>(this.tableRows.memberships ?? [{ tenant_membership_id: ids.membershipId, tenant_id: ids.tenantId, principal_id: ids.principalId, state: "ACTIVE" }]);
    }
    if (sql.includes("from investing.accounts")) return rows<T>(this.tableRows.accounts ?? [{ account_id: ids.accountId, tenant_id: ids.tenantId, state: "ACTIVE" }]);
    if (sql.includes("from investing.account_access")) {
      return rows<T>(this.tableRows.access ?? [{ account_access_id: ids.accessId, account_id: ids.accountId, tenant_id: ids.tenantId, tenant_membership_id: ids.membershipId, principal_id: ids.principalId, state: "ACTIVE" }]);
    }
    if (sql.includes("from investing.research_investigations")) {
      const accountId = values.length >= 5 ? values[4] : null;
      const defaultRows = [{
        research_investigation_id: ids.investigationId,
        tenant_id: ids.tenantId,
        account_id: accountId,
        principal_id: ids.principalId,
        actor_kind: "USER_PRINCIPAL",
        actor_id: "user_clerk_i5_a2",
        tenant_membership_id: ids.membershipId,
        account_access_id: accountId ? ids.accessId : null,
        operation_scope: accountId ? "ACCOUNT_SCOPE" : "TENANT_SCOPE",
        source_context: accountId ? "USER_PORTFOLIO" : this.config.get("syntrake.investing.source_context") ?? "PURE_RESEARCH",
      }];
      const selected = (this.tableRows.investigations ?? defaultRows).filter((row) => {
        const accountMatches = accountId === null ? row.account_id === null : row.account_id === accountId;
        return (
          row.research_investigation_id === values[0] &&
          row.tenant_id === ids.tenantId &&
          row.principal_id === ids.principalId &&
          row.actor_id === "user_clerk_i5_a2" &&
          accountMatches
        );
      });
      return rows<T>(selected);
    }
    if (sql.startsWith("select idempotency_record_id") && sql.includes("from investing.idempotency_records")) {
      const key = this.idempotencyKeyFromQuery(values);
      const pendingRow = this.pendingIdempotency.find((entry) => this.idempotencyKey(entry) === key);
      const stateRow = this.state.idempotency.find((entry) => this.idempotencyKey(entry) === key);
      if (stateRow && stateRow.status !== "SUCCEEDED") {
        const draft = this.state.drafts.find((entry) => entry.idempotency_record_id === stateRow.idempotency_record_id);
        if (draft) {
          stateRow.canonical_result_reference = {
            research_draft_id: draft.research_draft_id,
            research_investigation_id: draft.research_investigation_id,
            research_draft_hash: draft.research_draft_hash,
            material_request_hash: draft.material_request_hash,
          };
          stateRow.status = "SUCCEEDED";
        }
      }
      const row =
        stateRow && (stateRow.status !== "SUCCEEDED" || stateRow.canonical_result_reference === null)
          ? await this.waitForCompletedIdempotency(key)
          : stateRow ?? pendingRow;
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
      if (keyConflict) {
        if (this.reservations().has(key) && !this.pendingIdempotency.some((entry) => this.idempotencyKey(entry) === key)) {
          await this.waitForCompletedIdempotency(key);
        }
        return { rows: [] as T[], rowCount: 0 };
      }
      this.reservations().set(key, row);
      this.pendingIdempotency.push(row);
      return { rows: [] as T[], rowCount: this.dmlRowCount("idempotencyInsert", 1) };
    }
    if (sql.startsWith("select research_draft_id") && sql.includes("from investing.research_drafts")) {
      const allDrafts = [...this.state.drafts, ...this.pendingDrafts];
      const row = allDrafts.find((entry) => {
        if (sql.includes("where research_draft_id = $1")) {
          const accountMatches = values.length === 3 ? entry.account_id === null : entry.account_id === values[3];
          return entry.research_draft_id === values[0] && entry.research_investigation_id === values[1] && entry.tenant_id === values[2] && accountMatches;
        }
        const accountMatches = values.length === 2 ? entry.account_id === null : entry.account_id === values[2];
        return entry.research_investigation_id === values[0] && entry.tenant_id === values[1] && accountMatches;
      });
      return rows<T>(row ? [row] : []);
    }
    if (sql.startsWith("insert into investing.research_drafts")) {
      this.pendingDrafts.push({
        research_draft_id: values[0],
        research_investigation_id: values[1],
        tenant_id: values[2],
        account_id: values[3],
        principal_id: values[4],
        actor_kind: "USER_PRINCIPAL",
        actor_id: values[5],
        tenant_membership_id: values[6],
        account_access_id: values[7],
        operation_scope: values[8],
        operation: values[9],
        capability: values[10],
        source_context: values[11],
        draft_schema_version: values[12],
        draft_payload: values[13],
        research_draft_hash: values[14],
        material_request_hash: values[15],
        idempotency_record_id: values[16],
        idempotency_key: values[17],
        correlation_id: values[18],
      });
      return { rows: [] as T[], rowCount: this.dmlRowCount("draftInsert", 1) };
    }
    if (sql.startsWith("update investing.idempotency_records")) {
      this.pendingUpdates.push({ id: values[0] as string, reference: JSON.parse(values[1] as string) });
      return { rows: [] as T[], rowCount: this.dmlRowCount("idempotencyUpdate", 1) };
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
    return [row.actor_kind, row.actor_id, row.operation_scope, row.operation, row.idempotency_key].join("\0");
  }

  private idempotencyKeyFromQuery(values: readonly unknown[]) {
    return ["USER_PRINCIPAL", values[0], values.length === 5 ? "TENANT_SCOPE" : "ACCOUNT_SCOPE", values[3], values.at(-1)].join("\0");
  }

  private async waitForCompletedIdempotency(key: string) {
    for (let index = 0; index < 50; index += 1) {
      const row =
        this.state.idempotency.find((entry) => this.idempotencyKey(entry) === key) ??
        this.reservations().get(key);
      if (row?.status === "SUCCEEDED" && row.canonical_result_reference !== null) return row;
      await new Promise((resolve) => setTimeout(resolve, 1));
    }
    return undefined;
  }
}

function rows<T>(source: Row[]) {
  return { rows: source as T[], rowCount: source.length };
}

function mockDatabase(clients: FakeResearchDraftPersistenceClient[]): InvestingAuthorityDatabase {
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
  const writer = await import("../lib/investing/research/draftWriter");
  return { ...writer, getInvestingAuthorityDatabase: vi.mocked(transport.getInvestingAuthorityDatabase) };
}

async function loadService() {
  const authority = await import("../lib/investing/authority/context");
  const writer = await import("../lib/investing/research/draftWriter");
  const service = await import("../lib/investing/research/draftService");
  return {
    ...service,
    resolveAuthorizedResearchDraftCreateContext: vi.mocked(authority.resolveAuthorizedResearchDraftCreateContext),
    createResearchDraftV1: vi.spyOn(writer, "createResearchDraftV1"),
  };
}

function normalizeSql(sql: string) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--.*$/gm, "").replace(/\s+/g, " ").trim().toLowerCase();
}

function readMigration() {
  return fs.readFileSync(migrationPath, "utf8");
}

describe("Investing Genesis I5-A2 ResearchDraft persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("persists PURE_RESEARCH and TEST_PORTFOLIO drafts in TENANT_SCOPE without account identifiers", async () => {
    const writer = await loadWriter();
    for (const context of [tenantContext, testPortfolioContext]) {
      const client = new FakeResearchDraftPersistenceClient();
      writer.getInvestingAuthorityDatabase.mockReturnValueOnce(mockDatabase([client]));

      const result = await writer.createResearchDraftV1({
        authorizedContext: context,
        draft: draftPayload,
        idempotencyKey: ids.idempotencyKey,
        correlationId: ids.correlationId,
      });

      expect(result).toMatchObject({ ok: true, replayed: false, researchInvestigationId: ids.investigationId });
      expect(client.state.drafts).toHaveLength(1);
      expect(client.state.drafts[0]).toMatchObject({
        tenant_id: ids.tenantId,
        account_id: null,
        account_access_id: null,
        operation_scope: "TENANT_SCOPE",
        operation: "RESEARCH_DRAFT_CREATE_V1",
        capability: "RESEARCH_MUTATE",
        draft_schema_version: "RESEARCH_DRAFT_HASH_PAYLOAD_V1",
        source_context: (context as { sourceContext: string }).sourceContext,
      });
      expect(client.state.drafts[0]?.draft_payload).toBe(JSON.stringify(canonicalResearchDraftHashPayloadV1(draftPayload)));
      expect(client.state.drafts[0]?.research_draft_hash).toBe(hashResearchDraftV1(draftPayload));
    }
  });

  it("persists USER_PORTFOLIO drafts in ACCOUNT_SCOPE with the parent account lineage", async () => {
    const client = new FakeResearchDraftPersistenceClient();
    const writer = await loadWriter();
    writer.getInvestingAuthorityDatabase.mockReturnValue(mockDatabase([client]));

    const result = await writer.createResearchDraftV1({
      authorizedContext: accountContext,
      draft: draftPayload,
      idempotencyKey: ids.idempotencyKey,
      correlationId: ids.correlationId,
    });

    expect(result).toMatchObject({ ok: true, replayed: false });
    expect(client.state.drafts[0]).toMatchObject({
      tenant_id: ids.tenantId,
      account_id: ids.accountId,
      account_access_id: ids.accessId,
      operation_scope: "ACCOUNT_SCOPE",
      source_context: "USER_PORTFOLIO",
    });
  });

  it.each([
    ["nonexistent parent", { investigations: [] }, "FORBIDDEN_OR_NOT_FOUND"],
    ["cross tenant parent", { investigations: [{ research_investigation_id: ids.investigationId, tenant_id: ids.otherTenantId, account_id: null, principal_id: ids.principalId, actor_kind: "USER_PRINCIPAL", actor_id: "user_clerk_i5_a2", tenant_membership_id: ids.membershipId, account_access_id: null, operation_scope: "TENANT_SCOPE", source_context: "PURE_RESEARCH" }] }, "FORBIDDEN_OR_NOT_FOUND"],
    ["wrong principal parent", { investigations: [{ research_investigation_id: ids.investigationId, tenant_id: ids.tenantId, account_id: null, principal_id: "99999999-9999-4999-8999-999999999999", actor_kind: "USER_PRINCIPAL", actor_id: "user_clerk_i5_a2", tenant_membership_id: ids.membershipId, account_access_id: null, operation_scope: "TENANT_SCOPE", source_context: "PURE_RESEARCH" }] }, "FORBIDDEN_OR_NOT_FOUND"],
    ["source/scope mismatch", { investigations: [{ research_investigation_id: ids.investigationId, tenant_id: ids.tenantId, account_id: null, principal_id: ids.principalId, actor_kind: "USER_PRINCIPAL", actor_id: "user_clerk_i5_a2", tenant_membership_id: ids.membershipId, account_access_id: null, operation_scope: "TENANT_SCOPE", source_context: "USER_PORTFOLIO" }] }, "INTERNAL_ERROR"],
  ])("revalidates the parent Investigation binding: %s", async (_label, tableRows, code) => {
    const client = new FakeResearchDraftPersistenceClient({ idempotency: [], drafts: [] }, tableRows as Record<string, Row[]>);
    const writer = await loadWriter();
    writer.getInvestingAuthorityDatabase.mockReturnValue(mockDatabase([client]));

    const result = await writer.createResearchDraftV1({
      authorizedContext: tenantContext,
      draft: draftPayload,
      idempotencyKey: ids.idempotencyKey,
      correlationId: ids.correlationId,
    });

    expect(result).toMatchObject({ ok: false, code });
    expect(client.state.idempotency).toHaveLength(0);
    expect(client.state.drafts).toHaveLength(0);
    expect(client.queries.map((query) => normalizeSql(query.text))).toContain("rollback");
  });

  it("converges concurrent creates with the same key and same material to one Draft", async () => {
    const state: FakeState = { idempotency: [], drafts: [], reservations: new Map() };
    const firstClient = new FakeResearchDraftPersistenceClient(state);
    const secondClient = new FakeResearchDraftPersistenceClient(state);
    const writer = await loadWriter();
    writer.getInvestingAuthorityDatabase.mockReturnValueOnce(mockDatabase([firstClient])).mockReturnValueOnce(mockDatabase([secondClient]));

    const firstCreate = writer.createResearchDraftV1({ authorizedContext: tenantContext, draft: draftPayload, idempotencyKey: ids.idempotencyKey, correlationId: ids.correlationId });
    const secondCreate = (async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      return writer.createResearchDraftV1({ authorizedContext: tenantContext, draft: draftPayload, idempotencyKey: ids.idempotencyKey, correlationId: ids.correlationId });
    })();
    const [first, second] = await Promise.all([firstCreate, secondCreate]);
    expect([first, second].filter((result) => result.ok && result.replayed === false)).toHaveLength(1);
    expect(state.idempotency).toHaveLength(1);
    expect(state.drafts).toHaveLength(1);
  });

  it("replays the same idempotency key and material to the same Draft", async () => {
    const state: FakeState = { idempotency: [], drafts: [] };
    const writer = await loadWriter();
    writer.getInvestingAuthorityDatabase
      .mockReturnValueOnce(mockDatabase([new FakeResearchDraftPersistenceClient(state)]));

    const first = await writer.createResearchDraftV1({ authorizedContext: tenantContext, draft: draftPayload, idempotencyKey: ids.idempotencyKey, correlationId: ids.correlationId });
    const secondClient = new FakeResearchDraftPersistenceClient(state);
    writer.getInvestingAuthorityDatabase.mockReturnValueOnce(mockDatabase([secondClient]));
    const second = await writer.createResearchDraftV1({ authorizedContext: tenantContext, draft: draftPayload, idempotencyKey: ids.idempotencyKey, correlationId: ids.correlationId });

    expect(first).toMatchObject({ ok: true, replayed: false });
    expect(second).toMatchObject({ ok: true, replayed: true });
    expect(first.ok && second.ok && first.researchDraftId === second.researchDraftId).toBe(true);
    expect(state.idempotency).toHaveLength(1);
    expect(state.drafts).toHaveLength(1);
  });

  it("rejects the same idempotency key with different material and leaves only the first Draft", async () => {
    const state: FakeState = { idempotency: [], drafts: [] };
    const writer = await loadWriter();
    writer.getInvestingAuthorityDatabase
      .mockReturnValueOnce(mockDatabase([new FakeResearchDraftPersistenceClient(state)]))
      .mockReturnValueOnce(mockDatabase([new FakeResearchDraftPersistenceClient(state)]));

    await writer.createResearchDraftV1({ authorizedContext: tenantContext, draft: draftPayload, idempotencyKey: ids.idempotencyKey, correlationId: ids.correlationId });
    const conflict = await writer.createResearchDraftV1({
      authorizedContext: tenantContext,
      draft: secondDraftPayload,
      idempotencyKey: ids.idempotencyKey,
      correlationId: ids.correlationId,
    });

    expect(conflict).toEqual({ ok: false, code: "CONFLICT" });
    expect(state.idempotency).toHaveLength(1);
    expect(state.drafts).toHaveLength(1);
  });

  it("rejects a second idempotency key for the same first-Draft-only Investigation", async () => {
    const state: FakeState = { idempotency: [], drafts: [] };
    const writer = await loadWriter();
    writer.getInvestingAuthorityDatabase
      .mockReturnValueOnce(mockDatabase([new FakeResearchDraftPersistenceClient(state)]))
      .mockReturnValueOnce(mockDatabase([new FakeResearchDraftPersistenceClient(state)]));

    await writer.createResearchDraftV1({ authorizedContext: tenantContext, draft: draftPayload, idempotencyKey: ids.idempotencyKey, correlationId: ids.correlationId });
    const conflict = await writer.createResearchDraftV1({
      authorizedContext: tenantContext,
      draft: draftPayload,
      idempotencyKey: ids.otherIdempotencyKey,
      correlationId: ids.correlationId,
    });

    expect(conflict).toEqual({ ok: false, code: "CONFLICT" });
    expect(state.drafts).toHaveLength(1);
  });

  it("keeps scientific and material hashes invariant to idempotencyKey and correlationId metadata", () => {
    const scope = {
      actorKind: "USER_PRINCIPAL",
      actorId: "user_clerk_i5_a2",
      principalId: ids.principalId,
      operationScope: "TENANT_SCOPE",
      tenantId: ids.tenantId,
      sourceContext: "PURE_RESEARCH",
    } as const;
    const content = {
      ref: {
        hashAlgorithm: "SHA-256",
        hashDomain: "SYNTRAKE:RESEARCH_DRAFT:V1",
        hashVersion: "SYNTRAKE_SHA256_V1",
        hashHex: hashResearchDraftV1(draftPayload),
      },
      payload: draftPayload,
    } as const;
    const first = draftCreateMaterialIdentityV1(scope, {
      operation: "RESEARCH_DRAFT_CREATE_V1",
      investigationId: ids.investigationId,
      idempotencyKey: ids.idempotencyKey,
      correlationId: ids.correlationId,
      content,
    });
    const second = draftCreateMaterialIdentityV1(scope, {
      operation: "RESEARCH_DRAFT_CREATE_V1",
      investigationId: ids.investigationId,
      idempotencyKey: ids.otherIdempotencyKey,
      correlationId: "corr-i5-a2-0000002",
      content,
    });

    expect(hashResearchDraftV1({ ...draftPayload, rawIntent: "Cafe\u0301 momentum intent" })).toBe(hashResearchDraftV1(draftPayload));
    expect(second.materialRequestHash).toBe(first.materialRequestHash);
    expect(draftCreateMaterialIdentityV1(scope, { ...firstCommand(content), investigationId: "99999999-9999-4999-8999-999999999999" }).materialRequestHash).not.toBe(first.materialRequestHash);
  });

  it("rejects wrong branded authority, wrong operation, wrong capability, and I2 contexts before DB access", async () => {
    const client = new FakeResearchDraftPersistenceClient();
    const writer = await loadWriter();
    writer.getInvestingAuthorityDatabase.mockReturnValue(mockDatabase([client]));
    const i2Context = {
      actorKind: "USER_PRINCIPAL",
      actorId: "user_clerk_i5_a2",
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

    for (const authorizedContext of [
      { ...tenantContextValue, __testDraftAuthorized: false },
      { ...tenantContextValue, operation: "RESEARCH_INVESTIGATION_CREATE_V1" },
      { ...tenantContextValue, capability: "ACCOUNT_AUTHORITY_READ" },
      i2Context,
    ]) {
      const result = await writer.createResearchDraftV1({
        authorizedContext: authorizedContext as never,
        draft: draftPayload,
        idempotencyKey: ids.idempotencyKey,
        correlationId: ids.correlationId,
      });
      expect(result).toEqual({ ok: false, code: "VALIDATION_ERROR" });
    }
    expect(client.queries).toEqual([]);
  });

  it("keeps the public service parser closed and rejects authority/source injection", async () => {
    const service = await loadService();
    service.resolveAuthorizedResearchDraftCreateContext.mockResolvedValue({ ok: true, context: tenantContext });

    for (const command of [
      { researchInvestigationId: ids.investigationId, draft: draftPayload, idempotencyKey: ids.idempotencyKey, correlationId: ids.correlationId, tenantId: ids.tenantId },
      { researchInvestigationId: ids.investigationId, draft: draftPayload, idempotencyKey: ids.idempotencyKey, correlationId: ids.correlationId, sourceContext: "PURE_RESEARCH" },
      { researchInvestigationId: ids.investigationId, draft: draftPayload, idempotencyKey: ids.idempotencyKey, correlationId: ids.correlationId, operationScope: "TENANT_SCOPE" },
    ]) {
      const result = await service.createResearchDraftForCurrentUserV1(command);
      expect(result).toEqual({ ok: false, code: "VALIDATION_ERROR" });
    }
    expect(service.resolveAuthorizedResearchDraftCreateContext).not.toHaveBeenCalled();
  });

  it("pins SQL transaction, RLS, grants, idempotency vocabulary, and no ResearchDraft rawIntent duplication columns", () => {
    const rawSql = readMigration();
    const sql = normalizeSql(rawSql);

    expect(sql.startsWith("begin;")).toBe(true);
    expect(sql.endsWith("commit;")).toBe(true);
    expect(sql).toContain("if current_user <> 'postgres' then");
    expect(sql).toContain("set local role investing_owner");
    expect(sql).toContain("c.relkind in ('r', 'p')");
    expect(sql).toContain("c.relowner = 'investing_owner'::regrole");
    expect(sql).toContain("c.relrowsecurity");
    expect(sql).toContain("c.relforcerowsecurity");
    expect(sql).toContain("if v_relation_count <> 9 then");
    expect(sql).toContain("v_operation_token_count <> 3");
    expect(sql).toContain("v_operation_token_count <> 4");
    expect(sql).toContain("create table investing.research_drafts");
    expect(sql).toContain("constraint research_drafts_one_per_investigation_key unique (research_investigation_id)");
    expect(sql).toContain("constraint research_drafts_parent_identity_fk foreign key");
    expect(sql).toContain("constraint research_drafts_account_access_tuple_fk foreign key");
    expect(sql).toContain("alter table investing.research_drafts enable row level security");
    expect(sql).toContain("alter table investing.research_drafts force row level security");
    expect(sql).toContain("grant select, insert on table investing.research_drafts to investing_app");
    expect(sql).not.toContain("grant update");
    expect(sql).not.toContain("grant delete");
    for (const policy of [
      "principals_i5_research_draft_authority_read",
      "tenants_i5_research_draft_authority_read",
      "tenant_memberships_i5_research_draft_authority_read",
      "accounts_i5_research_draft_account_authority_read",
      "tenants_i5_research_draft_account_authority_read",
      "tenant_memberships_i5_research_draft_account_authority_read",
      "account_access_i5_research_draft_account_authority_read",
    ]) {
      expect(sql).toContain(`create policy ${policy}`);
      expect(sql).toContain(`policyname = '${policy}'`);
    }
    expect(sql).toContain("create policy research_investigations_i5_draft_create_parent_read");
    expect(sql).toContain("create policy research_drafts_i5_create_insert");
    expect(sql).toContain("create policy research_drafts_i5_create_read");
    expect(sql).toContain("create policy idempotency_records_i5_research_draft_create_insert");
    expect(sql).toContain("create policy idempotency_records_i5_research_draft_create_update");
    expect(sql).toContain("operation = 'research_draft_create_v1'");
    expect(sql).toContain("capability = 'research_mutate'");
    expect(sql).toContain("research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)");
    expect(sql).toContain("research_draft_hash = current_setting('syntrake.investing.research_draft_hash', true)");
    expect(sql).toContain("draft_schema_version = 'research_draft_hash_payload_v1'");
    expect(sql).toContain("draft_payload ->> 'schemaversion' = 'research_draft_hash_payload_v1'");
    expect(sql).toContain("if v_bad_grants <> 0 then");
    expect(sql).toContain("if v_draft_policy_count <> 13 then");
    expect(sql).toContain("p.prosecdef");
    expect(rawSql).not.toMatch(/initial_question|initialQuestion|initial_question_hash|raw_intent|interpreted_objective/);
    expect(sql).not.toContain("to service_role");
    expect(sql).not.toMatch(/\busing\s*\(\s*true\s*\)|\bwith check\s*\(\s*true\s*\)/);
  });

  it("pins Draft Create base authority policies as operation-specific and non-broad", () => {
    const sql = normalizeSql(readMigration());
    const draftPolicyStart = sql.indexOf("create policy principals_i5_research_draft_authority_read");
    const parentPolicyStart = sql.indexOf("create policy research_investigations_i5_draft_create_parent_read");
    const draftAuthorityPolicies = sql.slice(draftPolicyStart, parentPolicyStart);

    expect(draftAuthorityPolicies).toContain("current_setting('syntrake.investing.operation', true) = 'research_draft_create_v1'");
    expect(draftAuthorityPolicies).toContain("current_setting('syntrake.investing.capability', true) = 'research_mutate'");
    expect(draftAuthorityPolicies).toContain("current_setting('syntrake.investing.operation_scope', true) = 'tenant_scope'");
    expect(draftAuthorityPolicies).toContain("current_setting('syntrake.investing.operation_scope', true) = 'account_scope'");
    expect(draftAuthorityPolicies).toContain("account_access_id = nullif(current_setting('syntrake.investing.account_access_id', true), '')::uuid");
    expect(draftAuthorityPolicies).toContain("tenant_membership_id = nullif(current_setting('syntrake.investing.tenant_membership_id', true), '')::uuid");
    expect(draftAuthorityPolicies).not.toContain("research_investigation_create_v1");
    expect(draftAuthorityPolicies).not.toMatch(/operation'\s*,\s*true\)\s+in\s*\(/);
    expect(draftAuthorityPolicies).not.toMatch(/capability'\s*,\s*true\)\s+in\s*\(/);
  });
});

function firstCommand(content: Parameters<typeof draftCreateMaterialIdentityV1>[1]["content"]) {
  return {
    operation: "RESEARCH_DRAFT_CREATE_V1",
    investigationId: ids.investigationId,
    idempotencyKey: ids.idempotencyKey,
    correlationId: ids.correlationId,
    content,
  } as const;
}
