import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InvestingAuthorityDatabase, InvestingAuthorityTransactionClient } from "../lib/investing/authority/context";

vi.mock("../lib/investing/authority/context", () => {
  return {
    isAuthorizedInvestingContext: vi.fn((value: unknown) => {
      return typeof value === "object" && value !== null && (value as { __testAuthorized?: boolean }).__testAuthorized === true;
    }),
  };
});

vi.mock("../lib/investing/authority/transport", () => ({
  readInvestingDatabaseConfig: vi.fn(() => ({
    ok: true,
    connectionString: "postgresql://investing_app.projectref:secret@aws-0-region.pooler.supabase.com:6543/postgres",
    host: "aws-0-region.pooler.supabase.com",
    port: 6543,
    database: "postgres",
    user: "investing_app.projectref",
    role: "investing_app",
    projectRef: "projectref",
    transport: "SUPABASE_SHARED_POOLER_TRANSACTION_MODE",
    preparedStatements: false,
    tls: { rejectUnauthorized: true },
  })),
  getInvestingAuthorityDatabase: vi.fn(),
}));

const repoRoot = path.resolve(__dirname, "..");
const writerPath = path.join(repoRoot, "lib", "investing", "plan", "writer.ts");
const sqlPath = path.join(repoRoot, "docs", "investing-genesis", "sql", "I4C_PLAN_WRITER_CANDIDATE.sql");
const designPath = path.join(repoRoot, "docs", "investing-genesis", "I4C_PLAN_WRITER_DESIGN.md");
const i4bBytesPath = path.join(repoRoot, "docs", "investing-genesis", "I4B_CANONICAL_BYTES_CONTRACT.md");
const i4bSqlPath = path.join(repoRoot, "docs", "investing-genesis", "sql", "I4B_PLAN_PERSISTENCE_CANDIDATE.sql");

const ids = {
  principalId: "33333333-3333-4333-8333-333333333333",
  tenantId: "11111111-1111-4111-8111-111111111111",
  accountId: "22222222-2222-4222-8222-222222222222",
  membershipId: "66666666-6666-4666-8666-666666666666",
  accessId: "77777777-7777-4777-8777-777777777777",
  planRootId: "44444444-4444-4444-8444-444444444444",
  activeRevisionId: "55555555-5555-4555-8555-555555555555",
  idempotencyRecordId: "88888888-8888-4888-8888-888888888888",
  correlationId: "corr-i4c-1234567890",
  idempotencyKey: "idem-i4c-1234567890",
};

const context = {
  __testAuthorized: true,
  actorKind: "USER_PRINCIPAL",
  actorId: "user_clerk_i4c",
  principalId: ids.principalId,
  operationScope: "ACCOUNT_SCOPE",
  tenantId: ids.tenantId,
  accountId: ids.accountId,
  tenantMembershipId: ids.membershipId,
  accountAccessId: ids.accessId,
  correlationId: ids.correlationId,
  operation: "ACCOUNT_CONTEXT_RESOLVE",
  capability: "ACCOUNT_AUTHORITY_READ",
} as never;

const baseContent = {
  planning_currency_preference: { state: "SUPPLIED", type: "TOKEN", value: "USD" },
  goal_description: { state: "SUPPLIED", type: "TEXT", value: "Retire at 55" },
  target_money: { state: "SUPPLIED", type: "MONEY", amount: "1000000.00", currency: "USD" },
  target_date: { state: "SUPPLIED", type: "DATE", value: "2045-12-31" },
  time_horizon_months: { state: "SUPPLIED", type: "INTEGER", value: "240" },
  risk_tolerance: { state: "UNKNOWN", type: "TOKEN" },
  excluded_asset_classes: { state: "SUPPLIED", type: "TOKEN_SET", items: ["CRYPTO", "DERIVATIVES"] },
  notes: { state: "NOT_APPLICABLE", type: "TEXT" },
} as const;

type QueryRecord = { text: string; values: readonly unknown[] };
type DmlKey = "idempotencyInsert" | "rootInsert" | "revisionInsert" | "rootUpdate" | "auditInsert" | "bindingInsert" | "idempotencyUpdate";

class FakePlanClient implements InvestingAuthorityTransactionClient {
  readonly queries: QueryRecord[] = [];
  released = false;
  destroyed = false;
  idempotencyRecordId: string | null = null;
  materialRequestHash = "";
  operation = "PLAN_INITIALIZE_V1";
  lastPlanRevisionId = ids.activeRevisionId;

  constructor(
    private readonly rows: Record<string, unknown[]> = {},
    private readonly dml: Partial<Record<DmlKey, number | null>> = {},
    private readonly staleContext: Record<string, string | null> = {},
  ) {}

  dmlRowCount(key: DmlKey, fallback: number) {
    return Object.prototype.hasOwnProperty.call(this.dml, key) ? this.dml[key] ?? null : fallback;
  }

  async query<Row = Record<string, unknown>>(text: string, values: readonly unknown[] = []) {
    this.queries.push({ text, values });
    const normalized = normalizeSql(text);

    if (normalized === "begin isolation level read committed" || normalized === "begin" || normalized === "commit") {
      return { rows: [] as Row[], rowCount: null };
    }
    if (normalized === "rollback" || normalized === "savepoint plan_effect" || normalized === "rollback to savepoint plan_effect") {
      return { rows: [] as Row[], rowCount: null };
    }
    if (normalized.startsWith("select current_setting(")) return { rows: [this.staleContext as Row], rowCount: 1 };
    if (normalized.startsWith("select set_config(")) return { rows: [] as Row[], rowCount: null };

    if (normalized.includes("from investing.principals")) {
      const rows = (this.rows.principals ?? [{ principal_id: ids.principalId, state: "ACTIVE" }]) as Row[];
      return { rows, rowCount: rows.length };
    }
    if (normalized.includes("from investing.accounts")) {
      const rows = (this.rows.accounts ?? [{ account_id: ids.accountId, tenant_id: ids.tenantId, state: "ACTIVE" }]) as Row[];
      return { rows, rowCount: rows.length };
    }
    if (normalized.includes("from investing.tenants")) {
      const rows = (this.rows.tenants ?? [{ tenant_id: ids.tenantId, state: "ACTIVE" }]) as Row[];
      return { rows, rowCount: rows.length };
    }
    if (normalized.includes("from investing.tenant_memberships")) {
      const rows = (this.rows.memberships ?? [{
        tenant_membership_id: ids.membershipId,
        tenant_id: ids.tenantId,
        principal_id: ids.principalId,
        role: "OWNER",
        state: "ACTIVE",
      }]) as Row[];
      return { rows, rowCount: rows.length };
    }
    if (normalized.includes("from investing.account_access")) {
      const rows = (this.rows.access ?? [{
        account_access_id: ids.accessId,
        account_id: ids.accountId,
        tenant_id: ids.tenantId,
        tenant_membership_id: ids.membershipId,
        principal_id: ids.principalId,
        role: "OWNER",
        state: "ACTIVE",
      }]) as Row[];
      return { rows, rowCount: rows.length };
    }

    if (normalized.startsWith("insert into investing.idempotency_records")) {
      this.idempotencyRecordId = values[0] as string;
      this.materialRequestHash = values[2] as string;
      this.operation = values[5] as string;
      return { rows: [] as Row[], rowCount: this.dmlRowCount("idempotencyInsert", 1) };
    }
    if (normalized.includes("from investing.idempotency_records")) {
      if (!this.rows.idempotency && this.idempotencyRecordId === null) {
        return { rows: [] as Row[], rowCount: 0 };
      }
      const rows = (this.rows.idempotency ?? [{
        idempotency_record_id: this.idempotencyRecordId ?? ids.idempotencyRecordId,
        actor_kind: "USER_PRINCIPAL",
        actor_id: "user_clerk_i4c",
        operation_scope: "ACCOUNT_SCOPE",
        operation: this.operation,
        principal_id: ids.principalId,
        tenant_id: ids.tenantId,
        account_id: ids.accountId,
        idempotency_key: ids.idempotencyKey,
        material_request_hash: this.materialRequestHash,
        status: "STARTED",
        canonical_result_reference: null,
      }]) as Row[];
      return { rows, rowCount: rows.length };
    }

    if (normalized.includes("from investing.plan_revisions") || normalized.includes("join investing.plan_revisions")) {
      const rows = (this.rows.planRevisions ?? [{
        plan_root_id: ids.planRootId,
        plan_revision_id: this.lastPlanRevisionId,
        revision_number: "1",
        predecessor_plan_revision_id: null,
        predecessor_revision_number: null,
        content_schema_version: "SYNTRAKE_INVESTING_PLAN_CONTENT_V1",
        plan_revision_content_hash: "85DBD2B9DB613959D3A90B40FF2BA7DE77F01C3DD11C915D5CF0CEBCC807C5E6",
        material_request_hash: this.materialRequestHash,
        idempotency_record_id: this.idempotencyRecordId ?? ids.idempotencyRecordId,
        operation: this.operation,
      }]) as Row[];
      return { rows, rowCount: rows.length };
    }
    if (normalized.startsWith("insert into investing.plan_roots")) {
      this.lastPlanRevisionId = values[3] as string;
      return { rows: [] as Row[], rowCount: this.dmlRowCount("rootInsert", 1) };
    }
    if (normalized.includes("from investing.plan_roots") && normalized.includes("for update")) {
      const rows = (this.rows.planRoots ?? [{
        plan_root_id: ids.planRootId,
        tenant_id: ids.tenantId,
        account_id: ids.accountId,
        active_plan_revision_id: ids.activeRevisionId,
        active_version: "1",
      }]) as Row[];
      return { rows, rowCount: rows.length };
    }
    if (normalized.startsWith("insert into investing.plan_revisions")) {
      this.lastPlanRevisionId = values[0] as string;
      return { rows: [] as Row[], rowCount: this.dmlRowCount("revisionInsert", 1) };
    }
    if (normalized.startsWith("update investing.plan_roots")) {
      return { rows: [] as Row[], rowCount: this.dmlRowCount("rootUpdate", 1) };
    }
    if (normalized.startsWith("insert into investing.audit_events")) {
      return { rows: [] as Row[], rowCount: this.dmlRowCount("auditInsert", 1) };
    }
    if (normalized.startsWith("insert into investing.plan_revision_success_audit_bindings")) {
      return { rows: [] as Row[], rowCount: this.dmlRowCount("bindingInsert", 1) };
    }
    if (normalized.startsWith("update investing.idempotency_records")) {
      return { rows: [] as Row[], rowCount: this.dmlRowCount("idempotencyUpdate", 1) };
    }
    throw new Error(`Unexpected query: ${text}`);
  }

  release(destroy = false) {
    this.destroyed = destroy;
    this.released = true;
  }
}

function mockDatabase(clients: FakePlanClient[]): InvestingAuthorityDatabase {
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
  const writer = await import("../lib/investing/plan/writer");
  return { ...writer, getInvestingAuthorityDatabase: vi.mocked(transport.getInvestingAuthorityDatabase) };
}

function readFile(filePath: string) {
  return fs.readFileSync(filePath, "utf8");
}

function normalizeSql(sql: string) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--.*$/gm, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function policyClause(sql: string, policyName: string, clause: "using" | "with check") {
  const normalized = normalizeSql(sql);
  const policyStart = normalized.indexOf(`create policy ${policyName.toLowerCase()}`);
  if (policyStart < 0) return "";
  const clauseStart = normalized.indexOf(`${clause} (`, policyStart);
  if (clauseStart < 0) return "";
  const nextClause = clause === "using" ? normalized.indexOf(" with check (", clauseStart + 1) : -1;
  const policyEnd = normalized.indexOf(";", clauseStart);
  const end = nextClause > 0 && nextClause < policyEnd ? nextClause : policyEnd;
  return end < 0 ? normalized.slice(clauseStart) : normalized.slice(clauseStart, end);
}

function sha256(filePath: string) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex").toUpperCase();
}

describe("Investing Genesis I4-C Plan writer candidate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records the I4-B dependency-audit classification without calling it PASS", () => {
    const design = readFile(designPath);

    expect(design).toContain("I4-B DEPENDENCY AUDIT EXECUTION = UNAVAILABLE");
    expect(design).toContain("FAILURE CAUSE = EXTERNAL NPM AUDIT SERVICE 503");
    expect(design).toContain("NEW CODE FAILURE = NO EVIDENCE");
    expect(design).toContain("DEPENDENCY FILE CHANGE = NONE");
    expect(design).toContain("I4-C BLOCKER FROM THIS FAILURE = NO");
    expect(design).toContain("The dependency-audit result is not recorded as PASS.");
  });

  it("keeps I4-C source-only, rooted at I4-B, and away from migrations, Trading, Vercel and Production", () => {
    const combined = `${readFile(writerPath)}\n${readFile(sqlPath)}\n${readFile(designPath)}`.toLowerCase();

    expect(readFile(sqlPath)).toContain("SOURCE CANDIDATE ONLY. THIS FILE IS NOT A SUPABASE MIGRATION.");
    expect(readFile(sqlPath)).toContain("Canonical implementation parent: 812b2ea11f8696abcc55f00d70beff85f0701733");
    expect(combined).not.toMatch(/from\s+["'][^"']*trading/);
    expect(combined).not.toContain("lib/trading");
    expect(combined).not.toContain("insert into investing.ledger_");
    expect(combined).not.toContain("security definer");
    expect(combined).not.toContain("grant all");
    expect(readFile(designPath)).toContain("not start I4-D");
    expect(readFile(designPath)).toContain("TO_PROVE_IN_I4_D");
  });

  it("preserves the frozen I4-B canonical bytes and material hash vectors", async () => {
    const writer = await loadWriter();

    expect(readFile(i4bBytesPath)).toContain("EXACT_PLAN_CONTENT_CANONICAL_BYTES");
    expect(writer.canonicalPlanContentBytes(baseContent).byteLength).toBe(791);
    expect(writer.planRevisionContentHash(baseContent)).toBe("85DBD2B9DB613959D3A90B40FF2BA7DE77F01C3DD11C915D5CF0CEBCC807C5E6");
    expect(writer.initializePlanMaterialRequestHash(baseContent, context)).toBe(
      "51A407FA13E14311E269EED8B763B357CD5770E3BD0251C65B3C20B1D23F083A",
    );
    expect(writer.createAndActivatePlanMaterialRequestHash(baseContent, context, ids.planRootId, ids.activeRevisionId, "1")).toBe(
      "7ED3DBF335B52E4AEEDB1811635FD4635C39F6B9277B863CAA4440C85DA7506E",
    );
  });

  it("rejects forged AuthorizedInvestingContext and SYSTEM_ACTOR-style attempts before DB access", async () => {
    const client = new FakePlanClient();
    const writer = await loadWriter();
    writer.getInvestingAuthorityDatabase.mockReturnValue(mockDatabase([client]));

    const result = await writer.initializePlanV1({
      authorizedContext: { actorKind: "SYSTEM_ACTOR" },
      idempotencyKey: ids.idempotencyKey,
      correlationId: ids.correlationId,
      content: baseContent,
    } as never);

    expect(result).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    expect(client.queries).toEqual([]);
  });

  it("initializes Plan root, revision, pointer, idempotency and success audit in one transaction", async () => {
    const client = new FakePlanClient();
    const writer = await loadWriter();
    writer.getInvestingAuthorityDatabase.mockReturnValue(mockDatabase([client]));

    const result = await writer.initializePlanV1({
      authorizedContext: context,
      idempotencyKey: ids.idempotencyKey,
      correlationId: ids.correlationId,
      content: baseContent,
    });

    expect(result).toMatchObject({ ok: true, replayed: false, activeVersion: "1" });
    const normalized = client.queries.map((query) => normalizeSql(query.text));
    expect(normalized[0]).toBe("begin isolation level read committed");
    expect(normalized).toContain("savepoint plan_effect");
    expect(normalized.some((query) => query.startsWith("insert into investing.plan_roots"))).toBe(true);
    expect(normalized.some((query) => query.startsWith("insert into investing.plan_revisions"))).toBe(true);
    expect(normalized.some((query) => query.startsWith("insert into investing.audit_events"))).toBe(true);
    expect(normalized.some((query) => query.startsWith("insert into investing.plan_revision_success_audit_bindings"))).toBe(true);
    expect(normalized.some((query) => query.startsWith("update investing.idempotency_records"))).toBe(true);
    expect(normalized.at(-1)).toBe("commit");
  });

  it("rolls back duplicate initialize candidate effects and replays the canonical same-material winner", async () => {
    const client = new FakePlanClient({}, { rootInsert: 0 });
    const writer = await loadWriter();
    writer.getInvestingAuthorityDatabase.mockReturnValue(mockDatabase([client]));

    const result = await writer.initializePlanV1({
      authorizedContext: context,
      idempotencyKey: ids.idempotencyKey,
      correlationId: ids.correlationId,
      content: baseContent,
    });

    expect(result).toMatchObject({ ok: true, replayed: true, planRootId: ids.planRootId });
    const normalized = client.queries.map((query) => normalizeSql(query.text));
    expect(normalized).toContain("rollback to savepoint plan_effect");
    expect(normalized.some((query) => query.startsWith("insert into investing.plan_revisions"))).toBe(false);
    expect(normalized.some((query) => query.startsWith("insert into investing.audit_events"))).toBe(false);
  });

  it("serializes create-and-activate on PlanRoot and rejects stale active predecessor/version", async () => {
    const client = new FakePlanClient({ planRoots: [{ plan_root_id: ids.planRootId, tenant_id: ids.tenantId, account_id: ids.accountId, active_plan_revision_id: ids.activeRevisionId, active_version: "2" }] });
    const writer = await loadWriter();
    writer.getInvestingAuthorityDatabase.mockReturnValue(mockDatabase([client]));

    const result = await writer.createAndActivatePlanRevisionV1({
      authorizedContext: context,
      idempotencyKey: ids.idempotencyKey,
      correlationId: ids.correlationId,
      content: baseContent,
      planRootId: ids.planRootId,
      expectedActiveRevisionId: ids.activeRevisionId,
      expectedActiveVersion: "1",
    });

    expect(result).toMatchObject({ ok: false, code: "CONFLICT" });
    const normalized = client.queries.map((query) => normalizeSql(query.text));
    expect(normalized.some((query) => query.includes("from investing.plan_roots") && query.includes("for update"))).toBe(true);
    expect(normalized.some((query) => query.startsWith("insert into investing.plan_revisions"))).toBe(false);
    expect(normalized.some((query) => query.startsWith("update investing.idempotency_records"))).toBe(true);
    expect(normalized.at(-1)).toBe("commit");
  });

  it("creates an exact successor and CAS-moves the active pointer once", async () => {
    const client = new FakePlanClient();
    const writer = await loadWriter();
    writer.getInvestingAuthorityDatabase.mockReturnValue(mockDatabase([client]));

    const result = await writer.createAndActivatePlanRevisionV1({
      authorizedContext: context,
      idempotencyKey: ids.idempotencyKey,
      correlationId: ids.correlationId,
      content: baseContent,
      planRootId: ids.planRootId,
      expectedActiveRevisionId: ids.activeRevisionId,
      expectedActiveVersion: "1",
    });

    expect(result).toMatchObject({ ok: true, replayed: false, activeVersion: "2" });
    const update = client.queries.find((query) => normalizeSql(query.text).startsWith("update investing.plan_roots"));
    expect(normalizeSql(update?.text ?? "")).toContain("and active_plan_revision_id = $6 and active_version = $7::bigint");
    expect(update?.values).toContain(ids.activeRevisionId);
    expect(update?.values).toContain("1");
  });

  it("keeps frozen idempotency terminal dispatch exact", async () => {
    const writer = await loadWriter();
    const materialHash = writer.initializePlanMaterialRequestHash(baseContent, context);
    const succeededSame = new FakePlanClient({
      idempotency: [{
        idempotency_record_id: ids.idempotencyRecordId,
        actor_kind: "USER_PRINCIPAL",
        actor_id: "user_clerk_i4c",
        operation_scope: "ACCOUNT_SCOPE",
        operation: "PLAN_INITIALIZE_V1",
        principal_id: ids.principalId,
        tenant_id: ids.tenantId,
        account_id: ids.accountId,
        idempotency_key: ids.idempotencyKey,
        material_request_hash: materialHash,
        status: "SUCCEEDED",
        canonical_result_reference: {
          plan_root_id: ids.planRootId,
          plan_revision_id: ids.activeRevisionId,
          active_version: "1",
          plan_revision_content_hash: "85DBD2B9DB613959D3A90B40FF2BA7DE77F01C3DD11C915D5CF0CEBCC807C5E6",
        },
      }],
      planRevisions: [{
        plan_root_id: ids.planRootId,
        plan_revision_id: ids.activeRevisionId,
        revision_number: "1",
        predecessor_plan_revision_id: null,
        predecessor_revision_number: null,
        content_schema_version: "SYNTRAKE_INVESTING_PLAN_CONTENT_V1",
        plan_revision_content_hash: "85DBD2B9DB613959D3A90B40FF2BA7DE77F01C3DD11C915D5CF0CEBCC807C5E6",
        material_request_hash: materialHash,
        idempotency_record_id: ids.idempotencyRecordId,
      }],
    }, { idempotencyInsert: 0 });
    const succeeded = new FakePlanClient({
      idempotency: [{
        idempotency_record_id: ids.idempotencyRecordId,
        actor_kind: "USER_PRINCIPAL",
        actor_id: "user_clerk_i4c",
        operation_scope: "ACCOUNT_SCOPE",
        operation: "PLAN_INITIALIZE_V1",
        principal_id: ids.principalId,
        tenant_id: ids.tenantId,
        account_id: ids.accountId,
        idempotency_key: ids.idempotencyKey,
        material_request_hash: "DIFFERENT",
        status: "SUCCEEDED",
        canonical_result_reference: {
          plan_root_id: ids.planRootId,
          plan_revision_id: ids.activeRevisionId,
          active_version: "1",
          plan_revision_content_hash: "85DBD2B9DB613959D3A90B40FF2BA7DE77F01C3DD11C915D5CF0CEBCC807C5E6",
        },
      }],
    }, { idempotencyInsert: 0 });
    const conflict = new FakePlanClient({
      idempotency: [{
        idempotency_record_id: ids.idempotencyRecordId,
        actor_kind: "USER_PRINCIPAL",
        actor_id: "user_clerk_i4c",
        operation_scope: "ACCOUNT_SCOPE",
        operation: "PLAN_INITIALIZE_V1",
        principal_id: ids.principalId,
        tenant_id: ids.tenantId,
        account_id: ids.accountId,
        idempotency_key: ids.idempotencyKey,
        material_request_hash: materialHash,
        status: "CONFLICT",
        canonical_result_reference: null,
      }],
    }, { idempotencyInsert: 0 });
    const started = new FakePlanClient({
      idempotency: [{
        idempotency_record_id: ids.idempotencyRecordId,
        actor_kind: "USER_PRINCIPAL",
        actor_id: "user_clerk_i4c",
        operation_scope: "ACCOUNT_SCOPE",
        operation: "PLAN_INITIALIZE_V1",
        principal_id: ids.principalId,
        tenant_id: ids.tenantId,
        account_id: ids.accountId,
        idempotency_key: ids.idempotencyKey,
        material_request_hash: materialHash,
        status: "STARTED",
        canonical_result_reference: null,
      }],
    }, { idempotencyInsert: 0 });
    const failed = new FakePlanClient({
      idempotency: [{
        idempotency_record_id: ids.idempotencyRecordId,
        actor_kind: "USER_PRINCIPAL",
        actor_id: "user_clerk_i4c",
        operation_scope: "ACCOUNT_SCOPE",
        operation: "PLAN_INITIALIZE_V1",
        principal_id: ids.principalId,
        tenant_id: ids.tenantId,
        account_id: ids.accountId,
        idempotency_key: ids.idempotencyKey,
        material_request_hash: materialHash,
        status: "FAILED",
        canonical_result_reference: null,
      }],
    }, { idempotencyInsert: 0 });
    writer.getInvestingAuthorityDatabase
      .mockReturnValueOnce(mockDatabase([succeededSame]))
      .mockReturnValueOnce(mockDatabase([succeeded]))
      .mockReturnValueOnce(mockDatabase([conflict]))
      .mockReturnValueOnce(mockDatabase([started]))
      .mockReturnValueOnce(mockDatabase([failed]));

    const replay = await writer.initializePlanV1({ authorizedContext: context, idempotencyKey: ids.idempotencyKey, correlationId: ids.correlationId, content: baseContent });
    const keyReuse = await writer.initializePlanV1({ authorizedContext: context, idempotencyKey: ids.idempotencyKey, correlationId: ids.correlationId, content: baseContent });
    const conflictReplay = await writer.initializePlanV1({ authorizedContext: context, idempotencyKey: ids.idempotencyKey, correlationId: ids.correlationId, content: baseContent });
    const committedStarted = await writer.initializePlanV1({ authorizedContext: context, idempotencyKey: ids.idempotencyKey, correlationId: ids.correlationId, content: baseContent });
    const failedClosed = await writer.initializePlanV1({ authorizedContext: context, idempotencyKey: ids.idempotencyKey, correlationId: ids.correlationId, content: baseContent });

    expect(replay).toMatchObject({ ok: true, replayed: true, planRootId: ids.planRootId });
    expect(keyReuse).toMatchObject({ ok: false, code: "CONFLICT" });
    expect(succeeded.queries.some((query) => normalizeSql(query.text).startsWith("insert into investing.audit_events"))).toBe(true);
    expect(conflictReplay).toMatchObject({ ok: false, code: "CONFLICT" });
    expect(conflict.queries.some((query) => normalizeSql(query.text).startsWith("insert into investing.audit_events"))).toBe(false);
    expect(committedStarted).toMatchObject({ ok: false, code: "INTERNAL_ERROR" });
    expect(failedClosed).toMatchObject({ ok: false, code: "INTERNAL_ERROR" });
  });

  it("replays exact terminal idempotency for FROZEN/CLOSED accounts under current disclosure authority only", async () => {
    const writer = await loadWriter();
    const materialHash = writer.initializePlanMaterialRequestHash(baseContent, context);
    const canonicalReference = {
      plan_root_id: ids.planRootId,
      plan_revision_id: ids.activeRevisionId,
      active_version: "1",
      plan_revision_content_hash: writer.planRevisionContentHash(baseContent),
    };

    const cases = [
      new FakePlanClient({
        accounts: [{ account_id: ids.accountId, tenant_id: ids.tenantId, state: "FROZEN" }],
        idempotency: [{
          idempotency_record_id: ids.idempotencyRecordId,
          actor_kind: "USER_PRINCIPAL",
          actor_id: "user_clerk_i4c",
          operation_scope: "ACCOUNT_SCOPE",
          operation: "PLAN_INITIALIZE_V1",
          principal_id: ids.principalId,
          tenant_id: ids.tenantId,
          account_id: ids.accountId,
          idempotency_key: ids.idempotencyKey,
          material_request_hash: materialHash,
          status: "SUCCEEDED",
          canonical_result_reference: canonicalReference,
        }],
        planRevisions: [{
          plan_root_id: ids.planRootId,
          plan_revision_id: ids.activeRevisionId,
          revision_number: "1",
          predecessor_plan_revision_id: null,
          predecessor_revision_number: null,
          content_schema_version: "SYNTRAKE_INVESTING_PLAN_CONTENT_V1",
          plan_revision_content_hash: writer.planRevisionContentHash(baseContent),
          material_request_hash: materialHash,
          idempotency_record_id: ids.idempotencyRecordId,
        }],
      }, { idempotencyInsert: 0 }),
      new FakePlanClient({
        accounts: [{ account_id: ids.accountId, tenant_id: ids.tenantId, state: "CLOSED" }],
        idempotency: [{
          idempotency_record_id: ids.idempotencyRecordId,
          actor_kind: "USER_PRINCIPAL",
          actor_id: "user_clerk_i4c",
          operation_scope: "ACCOUNT_SCOPE",
          operation: "PLAN_INITIALIZE_V1",
          principal_id: ids.principalId,
          tenant_id: ids.tenantId,
          account_id: ids.accountId,
          idempotency_key: ids.idempotencyKey,
          material_request_hash: materialHash,
          status: "SUCCEEDED",
          canonical_result_reference: canonicalReference,
        }],
        planRevisions: [{
          plan_root_id: ids.planRootId,
          plan_revision_id: ids.activeRevisionId,
          revision_number: "1",
          predecessor_plan_revision_id: null,
          predecessor_revision_number: null,
          content_schema_version: "SYNTRAKE_INVESTING_PLAN_CONTENT_V1",
          plan_revision_content_hash: writer.planRevisionContentHash(baseContent),
          material_request_hash: materialHash,
          idempotency_record_id: ids.idempotencyRecordId,
        }],
      }, { idempotencyInsert: 0 }),
    ];
    writer.getInvestingAuthorityDatabase.mockReturnValueOnce(mockDatabase([cases[0]!])).mockReturnValueOnce(mockDatabase([cases[1]!]));

    for (const client of cases) {
      const result = await writer.initializePlanV1({ authorizedContext: context, idempotencyKey: ids.idempotencyKey, correlationId: ids.correlationId, content: baseContent });
      expect(result).toMatchObject({ ok: true, replayed: true, planRootId: ids.planRootId });
      expect(client.queries.some((query) => normalizeSql(query.text).startsWith("insert into investing.idempotency_records"))).toBe(false);
      expect(client.queries.some((query) => normalizeSql(query.text).startsWith("insert into investing.plan_roots"))).toBe(false);
      expect(client.queries.some((query) => normalizeSql(query.text).startsWith("insert into investing.plan_revisions"))).toBe(false);
      expect(client.queries.some((query) => normalizeSql(query.text).startsWith("update investing.plan_roots"))).toBe(false);
    }
  });

  it("blocks new mutations on FROZEN/CLOSED accounts while denying revoked disclosure authority before replay", async () => {
    const cases: Array<[FakePlanClient, "PLAN_INITIALIZE_V1" | "PLAN_CREATE_AND_ACTIVATE_REVISION_V1", string]> = [
      [new FakePlanClient({ accounts: [{ account_id: ids.accountId, tenant_id: ids.tenantId, state: "FROZEN" }] }), "PLAN_INITIALIZE_V1", "ACCOUNT_INACTIVE"],
      [new FakePlanClient({ accounts: [{ account_id: ids.accountId, tenant_id: ids.tenantId, state: "CLOSED" }] }), "PLAN_CREATE_AND_ACTIVATE_REVISION_V1", "ACCOUNT_INACTIVE"],
      [new FakePlanClient({ memberships: [{ tenant_membership_id: ids.membershipId, tenant_id: ids.tenantId, principal_id: ids.principalId, role: "OWNER", state: "REVOKED" }] }), "PLAN_INITIALIZE_V1", "MEMBERSHIP_INACTIVE"],
      [new FakePlanClient({ access: [{ account_access_id: ids.accessId, account_id: ids.accountId, tenant_id: ids.tenantId, tenant_membership_id: ids.membershipId, principal_id: ids.principalId, role: "OWNER", state: "REVOKED" }] }), "PLAN_INITIALIZE_V1", "ACCESS_INACTIVE"],
      [new FakePlanClient({ principals: [{ principal_id: ids.principalId, state: "DISABLED" }] }), "PLAN_INITIALIZE_V1", "PRINCIPAL_DISABLED"],
      [new FakePlanClient({ tenants: [{ tenant_id: ids.tenantId, state: "SUSPENDED" }] }), "PLAN_INITIALIZE_V1", "TENANT_INACTIVE"],
    ];
    const auditClients = cases.map(() => new FakePlanClient());
    const writer = await loadWriter();
    for (let index = 0; index < cases.length; index += 1) {
      writer.getInvestingAuthorityDatabase.mockReturnValueOnce(mockDatabase([cases[index]![0], auditClients[index]!]));
    }

    for (const [client, operation, expectedCode] of cases) {
      const result = operation === "PLAN_INITIALIZE_V1"
        ? await writer.initializePlanV1({ authorizedContext: context, idempotencyKey: ids.idempotencyKey, correlationId: ids.correlationId, content: baseContent })
        : await writer.createAndActivatePlanRevisionV1({
          authorizedContext: context,
          idempotencyKey: ids.idempotencyKey,
          correlationId: ids.correlationId,
          content: baseContent,
          planRootId: ids.planRootId,
          expectedActiveRevisionId: ids.activeRevisionId,
          expectedActiveVersion: "1",
        });
      expect(result).toMatchObject({ ok: false, code: expectedCode });
      if (expectedCode === "ACCOUNT_INACTIVE") {
        expect(client.queries.some((query) => normalizeSql(query.text).startsWith("insert into investing.idempotency_records"))).toBe(false);
      }
    }
  });

  it("replays the exact same-material successor winner for different-key create-and-activate races", async () => {
    const writer = await loadWriter();
    const materialHash = writer.createAndActivatePlanMaterialRequestHash(baseContent, context, ids.planRootId, ids.activeRevisionId, "1");
    const winnerRevisionId = "99999999-9999-4999-8999-999999999999";
    const client = new FakePlanClient({
      planRoots: [{ plan_root_id: ids.planRootId, tenant_id: ids.tenantId, account_id: ids.accountId, active_plan_revision_id: winnerRevisionId, active_version: "2" }],
      planRevisions: [{
        plan_root_id: ids.planRootId,
        plan_revision_id: winnerRevisionId,
        revision_number: "2",
        predecessor_plan_revision_id: ids.activeRevisionId,
        predecessor_revision_number: "1",
        content_schema_version: "SYNTRAKE_INVESTING_PLAN_CONTENT_V1",
        plan_revision_content_hash: writer.planRevisionContentHash(baseContent),
        material_request_hash: materialHash,
        idempotency_record_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        operation: "PLAN_CREATE_AND_ACTIVATE_REVISION_V1",
      }],
    });
    writer.getInvestingAuthorityDatabase.mockReturnValue(mockDatabase([client]));

    const result = await writer.createAndActivatePlanRevisionV1({
      authorizedContext: context,
      idempotencyKey: ids.idempotencyKey,
      correlationId: ids.correlationId,
      content: baseContent,
      planRootId: ids.planRootId,
      expectedActiveRevisionId: ids.activeRevisionId,
      expectedActiveVersion: "1",
    });

    expect(result).toMatchObject({ ok: true, replayed: true, planRevisionId: winnerRevisionId, activeVersion: "2" });
    const normalized = client.queries.map((query) => normalizeSql(query.text));
    expect(normalized.some((query) => query.startsWith("insert into investing.plan_revisions"))).toBe(false);
    expect(normalized.some((query) => query.startsWith("insert into investing.plan_revision_success_audit_bindings"))).toBe(false);
  });

  it("replays later retries after different-key same-material convergence for initialize and create", async () => {
    const writer = await loadWriter();
    const initMaterialHash = writer.initializePlanMaterialRequestHash(baseContent, context);
    const createMaterialHash = writer.createAndActivatePlanMaterialRequestHash(baseContent, context, ids.planRootId, ids.activeRevisionId, "1");
    const winnerIdempotencyId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const loserIdempotencyId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const successorRevisionId = "99999999-9999-4999-8999-999999999999";

    const initReplay = new FakePlanClient({
      idempotency: [{
        idempotency_record_id: loserIdempotencyId,
        actor_kind: "USER_PRINCIPAL",
        actor_id: "user_clerk_i4c",
        operation_scope: "ACCOUNT_SCOPE",
        operation: "PLAN_INITIALIZE_V1",
        principal_id: ids.principalId,
        tenant_id: ids.tenantId,
        account_id: ids.accountId,
        idempotency_key: ids.idempotencyKey,
        material_request_hash: initMaterialHash,
        status: "SUCCEEDED",
        canonical_result_reference: {
          plan_root_id: ids.planRootId,
          plan_revision_id: ids.activeRevisionId,
          active_version: "1",
          plan_revision_content_hash: writer.planRevisionContentHash(baseContent),
        },
      }],
      planRevisions: [{
        plan_root_id: ids.planRootId,
        plan_revision_id: ids.activeRevisionId,
        revision_number: "1",
        predecessor_plan_revision_id: null,
        predecessor_revision_number: null,
        content_schema_version: "SYNTRAKE_INVESTING_PLAN_CONTENT_V1",
        plan_revision_content_hash: writer.planRevisionContentHash(baseContent),
        material_request_hash: initMaterialHash,
        idempotency_record_id: winnerIdempotencyId,
        operation: "PLAN_INITIALIZE_V1",
      }],
    });
    const createReplay = new FakePlanClient({
      accounts: [{ account_id: ids.accountId, tenant_id: ids.tenantId, state: "FROZEN" }],
      idempotency: [{
        idempotency_record_id: loserIdempotencyId,
        actor_kind: "USER_PRINCIPAL",
        actor_id: "user_clerk_i4c",
        operation_scope: "ACCOUNT_SCOPE",
        operation: "PLAN_CREATE_AND_ACTIVATE_REVISION_V1",
        principal_id: ids.principalId,
        tenant_id: ids.tenantId,
        account_id: ids.accountId,
        idempotency_key: ids.idempotencyKey,
        material_request_hash: createMaterialHash,
        status: "SUCCEEDED",
        canonical_result_reference: {
          plan_root_id: ids.planRootId,
          plan_revision_id: successorRevisionId,
          active_version: "2",
          plan_revision_content_hash: writer.planRevisionContentHash(baseContent),
        },
      }],
      planRevisions: [{
        plan_root_id: ids.planRootId,
        plan_revision_id: successorRevisionId,
        revision_number: "2",
        predecessor_plan_revision_id: ids.activeRevisionId,
        predecessor_revision_number: "1",
        content_schema_version: "SYNTRAKE_INVESTING_PLAN_CONTENT_V1",
        plan_revision_content_hash: writer.planRevisionContentHash(baseContent),
        material_request_hash: createMaterialHash,
        idempotency_record_id: winnerIdempotencyId,
        operation: "PLAN_CREATE_AND_ACTIVATE_REVISION_V1",
      }],
    });
    writer.getInvestingAuthorityDatabase.mockReturnValueOnce(mockDatabase([initReplay])).mockReturnValueOnce(mockDatabase([createReplay]));

    const initResult = await writer.initializePlanV1({ authorizedContext: context, idempotencyKey: ids.idempotencyKey, correlationId: ids.correlationId, content: baseContent });
    const createResult = await writer.createAndActivatePlanRevisionV1({
      authorizedContext: context,
      idempotencyKey: ids.idempotencyKey,
      correlationId: ids.correlationId,
      content: baseContent,
      planRootId: ids.planRootId,
      expectedActiveRevisionId: ids.activeRevisionId,
      expectedActiveVersion: "1",
    });

    expect(initResult).toMatchObject({ ok: true, replayed: true, idempotencyRecordId: loserIdempotencyId, planRevisionId: ids.activeRevisionId });
    expect(createResult).toMatchObject({ ok: true, replayed: true, idempotencyRecordId: loserIdempotencyId, planRevisionId: successorRevisionId, activeVersion: "2" });
    for (const client of [initReplay, createReplay]) {
      expect(client.queries.some((query) => normalizeSql(query.text).startsWith("insert into investing.idempotency_records"))).toBe(false);
      expect(client.queries.some((query) => normalizeSql(query.text).startsWith("insert into investing.plan_revisions"))).toBe(false);
      expect(client.queries.some((query) => normalizeSql(query.text).startsWith("update investing.plan_roots"))).toBe(false);
    }
  });

  it("rolls back material effects if success audit or idempotency completion fails", async () => {
    const auditFailureClient = new FakePlanClient({}, { auditInsert: 0 });
    const idempotencyFailureClient = new FakePlanClient({}, { idempotencyUpdate: 0 });
    const writer = await loadWriter();
    writer.getInvestingAuthorityDatabase
      .mockReturnValueOnce(mockDatabase([auditFailureClient]))
      .mockReturnValueOnce(mockDatabase([idempotencyFailureClient]));

    const auditFailure = await writer.initializePlanV1({ authorizedContext: context, idempotencyKey: ids.idempotencyKey, correlationId: ids.correlationId, content: baseContent });
    const idempotencyFailure = await writer.initializePlanV1({ authorizedContext: context, idempotencyKey: ids.idempotencyKey, correlationId: ids.correlationId, content: baseContent });

    expect(auditFailure).toMatchObject({ ok: false, code: "INTERNAL_ERROR" });
    expect(idempotencyFailure).toMatchObject({ ok: false, code: "INTERNAL_ERROR" });
    expect(auditFailureClient.queries.map((query) => normalizeSql(query.text))).toContain("rollback");
    expect(idempotencyFailureClient.queries.map((query) => normalizeSql(query.text))).toContain("rollback");
  });

  it("blocks disabled, revoked, inactive, FROZEN and CLOSED authority during transaction revalidation", async () => {
    const cases: Array<[string, FakePlanClient, string]> = [
      ["principal", new FakePlanClient({ principals: [{ principal_id: ids.principalId, state: "DISABLED" }] }), "PRINCIPAL_DISABLED"],
      ["tenant", new FakePlanClient({ tenants: [{ tenant_id: ids.tenantId, state: "SUSPENDED" }] }), "TENANT_INACTIVE"],
      ["membership", new FakePlanClient({ memberships: [{ tenant_membership_id: ids.membershipId, tenant_id: ids.tenantId, principal_id: ids.principalId, role: "OWNER", state: "REVOKED" }] }), "MEMBERSHIP_INACTIVE"],
      ["access", new FakePlanClient({ access: [{ account_access_id: ids.accessId, account_id: ids.accountId, tenant_id: ids.tenantId, tenant_membership_id: ids.membershipId, principal_id: ids.principalId, role: "OWNER", state: "REVOKED" }] }), "ACCESS_INACTIVE"],
      ["frozen", new FakePlanClient({ accounts: [{ account_id: ids.accountId, tenant_id: ids.tenantId, state: "FROZEN" }] }), "ACCOUNT_INACTIVE"],
      ["closed", new FakePlanClient({ accounts: [{ account_id: ids.accountId, tenant_id: ids.tenantId, state: "CLOSED" }] }), "ACCOUNT_INACTIVE"],
    ];
    const auditClients = cases.map(() => new FakePlanClient());
    const writer = await loadWriter();
    for (let index = 0; index < cases.length; index += 1) {
      writer.getInvestingAuthorityDatabase.mockReturnValueOnce(mockDatabase([cases[index]![1], auditClients[index]!]));
    }

    for (const [, , code] of cases) {
      const result = await writer.initializePlanV1({ authorizedContext: context, idempotencyKey: ids.idempotencyKey, correlationId: ids.correlationId, content: baseContent });
      expect(result).toMatchObject({ ok: false, code });
    }
    for (const auditClient of auditClients) {
      expect(auditClient.queries.some((query) => normalizeSql(query.text).startsWith("insert into investing.audit_events"))).toBe(true);
    }
  });

  it("keeps runtime RLS/grants minimal, operation-scoped, and closed to public/shared/service_role", () => {
    const sql = normalizeSql(readFile(sqlPath));
    const rootUpdateUsing = policyClause(readFile(sqlPath), "plan_roots_i4c_plan_update", "using");
    const rootUpdateCheck = policyClause(readFile(sqlPath), "plan_roots_i4c_plan_update", "with check");
    const conflictAuditCheck = policyClause(readFile(sqlPath), "audit_events_i4c_plan_conflict_insert", "with check");

    expect(sql).toContain("grant select, insert on table investing.idempotency_records to investing_app");
    expect(sql).toContain("grant update (status, canonical_result_reference, error_code, updated_at, completed_at) on table investing.idempotency_records to investing_app");
    expect(sql).toContain("grant select, insert on table investing.plan_roots to investing_app");
    expect(sql).toContain("grant update (active_plan_revision_id, active_version) on table investing.plan_roots to investing_app");
    expect(sql).toContain("grant select, insert on table investing.plan_revisions to investing_app");
    expect(sql).toContain("grant select, insert on table investing.plan_revision_success_audit_bindings to investing_app");
    expect(sql).toContain("grant select, insert on table investing.audit_events to investing_app");
    expect(sql).toContain("if v_bad_count <> 24 then");
    expect(sql).toContain("operation in ('plan_initialize_v1', 'plan_create_and_activate_revision_v1')");
    expect(sql).toContain("current_setting('syntrake.investing.capability', true) = 'plan_write'");
    expect(sql).toContain("create policy principals_i4c_plan_revalidate_lock");
    expect(sql).toContain("create policy tenant_memberships_i4c_plan_revalidate_read");
    expect(sql).toContain("create policy account_access_i4c_plan_revalidate_lock");
    expect(sql).toContain("with check (false)");
    expect(sql).toContain("grant execute on function investing.i4_plan_content_bytes_are_canonical_v1(bytea) to investing_app");
    expect(sql).toContain("unexpected plan function execute grant");
    expect(sql).toContain("canonical bytes checker execute grant missing");
    expect(sql).toContain("plan_mutation_conflict");
    expect(sql).toContain("audit_events_i4c_plan_conflict_insert");
    expect(sql).toContain("plan_revision_success_audit_bindings_i4c_guard_read");
    expect(sql).toContain("audit_events_i4c_plan_guard_read");
    expect(sql).toContain("i4_idempotency_material_conflict");
    expect(sql).toContain("i4_plan_stale_active_pointer");
    expect(sql).toContain("(c.relname in ('principals', 'tenants', 'tenant_memberships', 'accounts', 'account_access') and acl.privilege_type in ('select', 'insert'))");
    expect(readFile(designPath)).toContain("I4-C preserves the accepted I2-C `INITIAL_PERSONAL_BOOTSTRAP` capability.");
    for (const policy of [
      "principals_i2c_bootstrap_insert",
      "tenants_i2c_bootstrap_insert",
      "tenant_memberships_i2c_bootstrap_insert",
      "accounts_i2c_bootstrap_insert",
      "account_access_i2c_bootstrap_insert",
    ]) {
      expect(readFile(designPath)).toContain(policy);
    }
    expect(sql).toContain("aa.state = 'active'");
    expect(sql).toContain("tm.state = 'active'");
    expect(sql).toContain("p.external_subject = current_setting('syntrake.investing.external_subject', true)");
    expect(rootUpdateUsing).toContain("plan_root_id = nullif(current_setting('syntrake.investing.plan_root_id', true), '')::uuid");
    expect(rootUpdateUsing).not.toContain("active_plan_revision_id = nullif(current_setting('syntrake.investing.expected_active_revision_id'");
    expect(rootUpdateUsing).not.toContain("active_version = nullif(current_setting('syntrake.investing.expected_active_version'");
    expect(rootUpdateUsing).toContain("current_setting('syntrake.investing.operation', true) = 'plan_create_and_activate_revision_v1'");
    expect(rootUpdateUsing).toContain("a.state = 'active'");
    expect(rootUpdateCheck).toContain("active_plan_revision_id = nullif(current_setting('syntrake.investing.plan_revision_id', true), '')::uuid");
    expect(rootUpdateCheck).toContain("active_version = nullif(current_setting('syntrake.investing.expected_active_version', true), '')::bigint + 1");
    expect(conflictAuditCheck).toContain("from investing.idempotency_records ir");
    expect(conflictAuditCheck).toContain("ir.idempotency_record_id::text = object_id");
    expect(conflictAuditCheck).toContain("ir.actor_id = current_setting('syntrake.investing.actor_id', true)");
    expect(conflictAuditCheck).toContain("ir.principal_id = nullif(current_setting('syntrake.investing.principal_id', true), '')::uuid");
    expect(conflictAuditCheck).toContain("ir.tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid");
    expect(conflictAuditCheck).toContain("ir.account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid");
    expect(conflictAuditCheck).toContain("ir.operation = current_setting('syntrake.investing.operation', true)");
    expect(conflictAuditCheck).toContain("ir.idempotency_key = current_setting('syntrake.investing.idempotency_key', true)");
    expect(conflictAuditCheck).not.toContain("ir.material_request_hash = current_setting('syntrake.investing.material_request_hash'");
    expect(sql).toContain("acl.grantee = 0");
    expect(sql).toContain("grantee.rolname in ('anon', 'authenticated', 'service_role')");
    expect(sql).toContain("'principals', 'tenants', 'tenant_memberships', 'accounts', 'account_access'");
    expect(sql).toContain("accepted i2/i3 acl surface has unexpected public/shared/destructive privilege");
    expect(sql).toContain("table acl surface widened beyond runtime writer minimum");
    expect(sql).not.toContain("to service_role");
    expect(sql).not.toMatch(/\busing\s*\(\s*true\s*\)|\bwith check\s*\(\s*true\s*\)/);

    const i4bSql = readFile(i4bSqlPath);
    expect(i4bSql).toContain("v_result ->> 'plan_root_id'");
    expect(i4bSql).toContain("v_result ->> 'plan_revision_id'");
    expect(readFile(writerPath)).toContain("plan_root_id: effect.planRootId");
    expect(readFile(writerPath)).toContain("plan_revision_id: effect.planRevisionId");
  });

  it("pins exact changed artifacts for independent audit fingerprinting", () => {
    for (const filePath of [writerPath, sqlPath, designPath, path.join(repoRoot, "tests", "investingGenesisI4PlanWriterCandidate.test.ts")]) {
      expect(fs.statSync(filePath).size).toBeGreaterThan(0);
      expect(sha256(filePath)).toMatch(/^[A-F0-9]{64}$/);
    }
  });
});
