import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InvestingAuthorityDatabase, InvestingAuthorityTransactionClient } from "../lib/investing/authority/context";

const repoRoot = path.resolve(__dirname, "..");
const migrationPath = path.join(
  repoRoot,
  "supabase",
  "migrations",
  "20260828105111_investing_genesis_i2_atomic_personal_bootstrap.sql",
);
const i2bMigrationPath = path.join(
  repoRoot,
  "supabase",
  "migrations",
  "20260825123000_investing_genesis_i2_authorized_context.sql",
);

const clerkIdentity = {
  ok: true as const,
  externalProvider: "CLERK" as const,
  externalSubject: "user_i2c_bootstrap_subject",
};

const principalId = "11111111-1111-4111-8111-111111111111";
const tenantId = "22222222-2222-4222-8222-222222222222";
const tenantMembershipId = "33333333-3333-4333-8333-333333333333";
const accountId = "44444444-4444-4444-8444-444444444444";
const accountAccessId = "55555555-5555-4555-8555-555555555555";
const idempotencyRecordId = "66666666-6666-4666-8666-666666666666";
const correlationId = "corr-i2c-1234567890";
const idempotencyKey = "idem-i2c-1234567890";

const canonicalReference = {
  principalId,
  tenantId,
  tenantMembershipId,
  accountId,
  accountAccessId,
  baseCurrency: "EUR",
};

type QueryRecord = {
  text: string;
  values: readonly unknown[];
};

type FailureMode = "connect" | "rollback" | "release" | "query" | "auditQuery" | "auditRollback";

class FakeAuthorityClient implements InvestingAuthorityTransactionClient {
  readonly queries: QueryRecord[] = [];

  released = false;
  destroyed = false;
  insertedIdempotencyId = idempotencyRecordId;
  materialRequestHash = "";

  constructor(
    private readonly rows: Record<string, unknown[]> = {},
    private readonly dml: Record<string, number | null> = {},
    private readonly staleContext: Record<string, string | null> = {},
    private readonly failureMode?: FailureMode,
  ) {}

  dmlRowCount(key: string, fallback: number) {
    return Object.prototype.hasOwnProperty.call(this.dml, key) ? this.dml[key] ?? null : fallback;
  }

  async query<Row = Record<string, unknown>>(text: string, values: readonly unknown[] = []) {
    this.queries.push({ text, values });
    const normalized = normalizeSql(text);

    if (this.failureMode === "query" && normalized.includes("from investing.principals")) {
      throw new Error("query failed");
    }
    if (
      this.failureMode === "auditQuery" &&
      (normalized.startsWith("insert into investing.audit_events") ||
        normalized.startsWith("insert into investing.bootstrap_pre_authority_audit_events"))
    ) {
      throw new Error("audit failed");
    }

    if (normalized === "begin isolation level read committed" || normalized === "commit") {
      return { rows: [] as Row[], rowCount: null };
    }
    if (normalized === "rollback" || normalized === "rollback to savepoint candidate_graph") {
      if (this.failureMode === "rollback" || this.failureMode === "auditRollback") {
        throw new Error("rollback failed");
      }
      return { rows: [] as Row[], rowCount: null };
    }
    if (normalized === "savepoint candidate_graph") {
      return { rows: [] as Row[], rowCount: null };
    }
    if (normalized.startsWith("select current_setting(")) {
      return { rows: [this.staleContext as Row], rowCount: 1 };
    }
    if (normalized.startsWith("select set_config(")) {
      return { rows: [] as Row[], rowCount: null };
    }
    if (normalized.startsWith("insert into investing.principals")) {
      return { rows: [] as Row[], rowCount: this.dmlRowCount("principalInsert", 1) };
    }
    if (normalized.includes("from investing.principals")) {
      const rows = (this.rows.principals ?? [{ principal_id: principalId, state: "ACTIVE" }]) as Row[];
      return { rows, rowCount: rows.length };
    }
    if (normalized.startsWith("insert into investing.idempotency_records")) {
      this.insertedIdempotencyId = values[0] as string;
      this.materialRequestHash = values[2] as string;
      return { rows: [] as Row[], rowCount: this.dmlRowCount("idempotencyInsert", 1) };
    }
    if (normalized.includes("from investing.idempotency_records")) {
      const rows = (this.rows.idempotency ??
        [{
          idempotency_record_id: this.insertedIdempotencyId,
          material_request_hash: this.materialRequestHash,
          status: "STARTED",
          canonical_result_reference: null,
        }]) as Row[];
      return { rows, rowCount: rows.length };
    }
    if (normalized.startsWith("update investing.idempotency_records")) {
      return { rows: [] as Row[], rowCount: this.dmlRowCount("idempotencyUpdate", 1) };
    }
    if (normalized.includes("from investing.accounts")) {
      const rows = (this.rows.accounts ?? []) as Row[];
      return { rows, rowCount: rows.length };
    }
    if (normalized.includes("from investing.tenant_memberships")) {
      const rows = (this.rows.memberships ?? []) as Row[];
      return { rows, rowCount: rows.length };
    }
    if (normalized.includes("from investing.account_access")) {
      const rows = (this.rows.access ?? []) as Row[];
      return { rows, rowCount: rows.length };
    }
    if (normalized.includes("from investing.tenants")) {
      const rows = (this.rows.tenants ?? [{ tenant_id: tenantId, state: "ACTIVE" }]) as Row[];
      return { rows, rowCount: rows.length };
    }
    if (normalized.startsWith("insert into investing.tenants")) {
      return { rows: [] as Row[], rowCount: this.dmlRowCount("tenantInsert", 1) };
    }
    if (normalized.startsWith("insert into investing.tenant_memberships")) {
      return { rows: [] as Row[], rowCount: this.dmlRowCount("membershipInsert", 1) };
    }
    if (normalized.startsWith("insert into investing.accounts")) {
      return { rows: [] as Row[], rowCount: this.dmlRowCount("accountInsert", 1) };
    }
    if (normalized.startsWith("insert into investing.account_access")) {
      return { rows: [] as Row[], rowCount: this.dmlRowCount("accessInsert", 1) };
    }
    if (
      normalized.startsWith("insert into investing.audit_events") ||
      normalized.startsWith("insert into investing.bootstrap_pre_authority_audit_events")
    ) {
      return { rows: [] as Row[], rowCount: 1 };
    }

    throw new Error(`Unexpected query: ${text}`);
  }

  release(destroy = false) {
    this.destroyed = destroy;
    if (this.failureMode === "release") throw new Error("release failed");
    this.released = true;
  }
}

function mockDatabase(clients: FakeAuthorityClient[]): InvestingAuthorityDatabase {
  return {
    connect: vi.fn(async () => {
      const client = clients.shift();
      if (!client) throw new Error("no fake client");
      return client;
    }),
  };
}

function overrideQuery(
  client: FakeAuthorityClient,
  implementation: <Row = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ) => Promise<{ rows: Row[]; rowCount: number | null }>,
) {
  client.query = implementation;
}

vi.mock("../lib/investing/authority/clerk", () => ({
  resolveVerifiedClerkIdentity: vi.fn(async () => clerkIdentity),
}));

vi.mock("../lib/investing/authority/transport", () => ({
  getInvestingAuthorityDatabase: vi.fn(),
}));

async function loadBootstrap() {
  const transport = await import("../lib/investing/authority/transport");
  const bootstrapModule = await import("../lib/investing/authority/bootstrap");
  return {
    bootstrapInitialPersonalInvestingAccount: bootstrapModule.bootstrapInitialPersonalInvestingAccount,
    getInvestingAuthorityDatabase: vi.mocked(transport.getInvestingAuthorityDatabase),
  };
}

function readMigration() {
  return fs.readFileSync(migrationPath, "utf8");
}

function readBootstrapSource() {
  return fs.readFileSync(path.join(repoRoot, "lib", "investing", "authority", "bootstrap.ts"), "utf8");
}

function normalizeSql(sql: string) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--.*$/gm, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const idempotencyPolicyGuardPatterns = [
  /current_setting\s*\(\s*'syntrake\.investing\.operation'\s*,\s*true\s*\)\s*=\s*'initial_personal_bootstrap'/,
  /current_setting\s*\(\s*'syntrake\.investing\.capability'\s*,\s*true\s*\)\s*=\s*'authority_bootstrap'/,
  /idempotency_key\s*=\s*current_setting\s*\(\s*'syntrake\.investing\.idempotency_key'\s*,\s*true\s*\)/,
  /p\.principal_id\s*=\s*idempotency_records\.principal_id/,
  /p\.external_provider\s*=\s*'clerk'/,
  /p\.external_subject\s*=\s*current_setting\s*\(\s*'syntrake\.investing\.external_subject'\s*,\s*true\s*\)/,
  /p\.external_subject\s*=\s*idempotency_records\.actor_id/,
  /p\.state\s*=\s*'active'/,
] as const;

const idempotencyUpdateGuardPatterns = [
  /idempotency_record_id\s*=\s*\(\s*nullif\s*\(\s*current_setting\s*\(\s*'syntrake\.investing\.idempotency_record_id'\s*,\s*true\s*\)\s*,\s*''\s*\)\s*\)::uuid/,
  /material_request_hash\s*=\s*current_setting\s*\(\s*'syntrake\.investing\.material_request_hash'\s*,\s*true\s*\)/,
] as const;

function normalizePgPolicyExpression(expression: string) {
  return normalizeSql(expression).replace(/::text/g, "");
}

function idempotencyPostconditionPasses(expression: string) {
  const normalized = normalizePgPolicyExpression(expression);
  return idempotencyPolicyGuardPatterns.every((pattern) => pattern.test(normalized));
}

function idempotencyUpdatePostconditionPasses(expression: string) {
  const normalized = normalizePgPolicyExpression(expression);
  return idempotencyUpdateGuardPatterns.every((pattern) => pattern.test(normalized));
}

type PolicyInfo = {
  name: string;
  command: "select" | "insert" | "update" | "delete" | "all";
  table: string;
  body: string;
  references: string[];
};

function extractPolicies(sql: string) {
  const policies: PolicyInfo[] = [];
  const policyRegex =
    /create policy\s+([a-z0-9_]+)\s+on investing\.([a-z0-9_]+)\s+for\s+(select|insert|update|delete|all)\s+[\s\S]*?(?=\ncreate policy|\nreset role;|\ndo \$\$|$)/gi;

  for (const match of sql.matchAll(policyRegex)) {
    const body = match[0].toLowerCase();
    const references = [
      ...new Set(
        [...body.matchAll(/\b(?:from|join)\s+investing\.([a-z0-9_]+)/g)]
          .map((reference) => reference[1])
          .filter((reference): reference is string => Boolean(reference)),
      ),
    ];

    policies.push({
      name: match[1]?.toLowerCase() ?? "",
      table: match[2]?.toLowerCase() ?? "",
      command: (match[3]?.toLowerCase() ?? "all") as PolicyInfo["command"],
      body,
      references,
    });
  }

  return policies;
}

function buildSelectPoliciesByRelation(policies: PolicyInfo[]) {
  const selectPoliciesByRelation = new Map<string, PolicyInfo[]>();
  for (const policy of policies) {
    if (policy.command !== "select") continue;
    selectPoliciesByRelation.set(policy.table, [...(selectPoliciesByRelation.get(policy.table) ?? []), policy]);
  }
  return selectPoliciesByRelation;
}

function findNestedRlsRelationCycle(policies: PolicyInfo[]) {
  const selectPoliciesByRelation = buildSelectPoliciesByRelation(policies);

  function visit(policy: PolicyInfo, relationPath: string[]): string[] | null {
    for (const reference of policy.references) {
      const existingIndex = relationPath.indexOf(reference);
      if (existingIndex >= 0) return relationPath.slice(existingIndex).concat(reference);

      for (const selectPolicy of selectPoliciesByRelation.get(reference) ?? []) {
        const cycle = visit(selectPolicy, relationPath.concat(reference));
        if (cycle) return cycle;
      }
    }

    return null;
  }

  for (const policy of policies) {
    const cycle = visit(policy, [policy.table]);
    if (cycle) return cycle;
  }

  return null;
}

function directPolicyReferences(policies: PolicyInfo[], policyName: string) {
  return policies.find((policy) => policy.name === policyName)?.references ?? [];
}

function sha256(filePath: string) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex").toUpperCase();
}

function activeGraphRows(baseCurrency = "EUR") {
  return {
    accounts: [
      {
        account_id: accountId,
        tenant_id: tenantId,
        initial_tenant_membership_id: tenantMembershipId,
        initial_principal_id: principalId,
        account_origin: "INITIAL_PERSONAL_BOOTSTRAP",
        base_currency: baseCurrency,
        state: "ACTIVE",
      },
    ],
    memberships: [
      {
        tenant_membership_id: tenantMembershipId,
        tenant_id: tenantId,
        principal_id: principalId,
        state: "ACTIVE",
      },
    ],
    access: [
      {
        account_access_id: accountAccessId,
        account_id: accountId,
        tenant_id: tenantId,
        tenant_membership_id: tenantMembershipId,
        principal_id: principalId,
        state: "ACTIVE",
      },
    ],
    tenants: [{ tenant_id: tenantId, state: "ACTIVE" }],
  };
}

describe("Investing Genesis I2-C atomic personal bootstrap", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("materializes only bootstrap authority policy surface and no ledger, engine, UX, or runtime API", () => {
    const normalized = normalizeSql(readMigration());

    expect(normalized).toContain("create table investing.bootstrap_pre_authority_audit_events");
    expect(normalized).toContain("create policy principals_i2c_bootstrap_insert");
    expect(normalized).toContain("create policy idempotency_records_i2c_bootstrap_insert");
    expect(normalized).toContain("create policy idempotency_records_i2c_bootstrap_update");
    expect(normalized).toContain("create policy accounts_i2c_bootstrap_insert");
    expect(normalized).toContain("create policy audit_events_i2c_bootstrap_insert");

    for (const forbidden of [
      "ledger_transactions",
      "ledger_postings",
      "recommendation",
      "allocation",
      "suitability",
      "valuation",
      "portfolio_engine",
      "execution_engine",
      "select for update",
      "authenticator",
    ]) {
      expect(normalized).not.toContain(forbidden);
    }
    expect(normalized).not.toMatch(/create\s+(or\s+replace\s+)?function\s+investing\./);
  });

  it("uses explicit READ COMMITTED transactions and rowCount for every winner or loser DML decision", () => {
    const source = readBootstrapSource();

    expect(source).toContain('"begin isolation level read committed"');
    expect(source).toContain("result.rowCount === 1");
    expect(source).toContain("result.rowCount === 0");
    expect(source).not.toContain("rows.length === 1");
    expect(source).not.toMatch(/\breturning\b/i);
    expect(source).not.toMatch(/\blimit\s+1\b/i);
  });

  it("keeps idempotency DOMAIN_SCOPE, status-before-hash dispatch, and no FAILED terminal persistence in I2-C", () => {
    const source = readBootstrapSource();
    const normalized = normalizeSql(readMigration());

    expect(source).toContain("operation_scope = 'DOMAIN_SCOPE'");
    expect(source.indexOf('if (idempotency.status === "SUCCEEDED")')).toBeLessThan(
      source.indexOf("idempotency.material_request_hash !== materialRequestHash"),
    );
    expect(source).toContain('if (idempotency.status === "CONFLICT")');
    expect(source).toContain('if (idempotency.status === "STARTED")');
    expect(source).toContain('return { ...fail("INTERNAL_ERROR"), commitFailure: true }');
    expect(source).not.toMatch(/status\s*=\s*["']FAILED["']/);
    expect(normalized).toContain("status in ('succeeded', 'conflict')");
  });

  it("allows a fresh valid bootstrap and writes one success audit after canonical graph creation", async () => {
    const authorityClient = new FakeAuthorityClient();
    const { bootstrapInitialPersonalInvestingAccount, getInvestingAuthorityDatabase } = await loadBootstrap();
    getInvestingAuthorityDatabase.mockReturnValue(mockDatabase([authorityClient]));

    const result = await bootstrapInitialPersonalInvestingAccount({
      idempotencyKey,
      correlationId,
      baseCurrency: "eur",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.replayed).toBe(false);
      expect(result.baseCurrency).toBe("EUR");
    }
    expect(authorityClient.queries.map((query) => normalizeSql(query.text))).toContain(
      "begin isolation level read committed",
    );
    expect(authorityClient.queries.some((query) => normalizeSql(query.text).startsWith("savepoint candidate_graph"))).toBe(
      true,
    );
    expect(authorityClient.queries.some((query) => normalizeSql(query.text).startsWith("insert into investing.audit_events"))).toBe(
      true,
    );
  });

  it("rejects syntactically valid replay references that are not backed by matching canonical rows", async () => {
    const authorityClient = new FakeAuthorityClient(
      {
        ...activeGraphRows("USD"),
        idempotency: [
          {
            idempotency_record_id: idempotencyRecordId,
            material_request_hash: "FILLED_BY_TEST",
            status: "SUCCEEDED",
            canonical_result_reference: canonicalReference,
          },
        ],
      },
      { idempotencyInsert: 0 },
    );
    overrideQuery(authorityClient, async <Row = Record<string, unknown>>(text: string, values: readonly unknown[] = []) => {
      const result = await FakeAuthorityClient.prototype.query.call(authorityClient, text, values);
      if (normalizeSql(text).includes("from investing.idempotency_records")) {
        result.rows = [
          {
            idempotency_record_id: idempotencyRecordId,
            material_request_hash: authorityClient.materialRequestHash,
            status: "SUCCEEDED",
            canonical_result_reference: canonicalReference,
          },
        ] as Row[];
      }
      return result;
    });
    const { bootstrapInitialPersonalInvestingAccount, getInvestingAuthorityDatabase } = await loadBootstrap();
    getInvestingAuthorityDatabase.mockReturnValue(mockDatabase([authorityClient]));

    const result = await bootstrapInitialPersonalInvestingAccount({
      idempotencyKey,
      correlationId,
      baseCurrency: "EUR",
    });

    expect(result).toMatchObject({ ok: false, code: "INTERNAL_ERROR" });
  });

  it.each([
    ["idempotencyInsert", null],
    ["accountInsert", 2],
    ["idempotencyUpdate", null],
  ] as const)("attempts pre-authority audit after non-throwing %s internal failure without durable Principal", async (operation, rowCount) => {
    const authorityClient = new FakeAuthorityClient({}, { [operation]: rowCount });
    const auditClient = new FakeAuthorityClient();
    const { bootstrapInitialPersonalInvestingAccount, getInvestingAuthorityDatabase } = await loadBootstrap();
    getInvestingAuthorityDatabase.mockReturnValue(mockDatabase([authorityClient, auditClient]));

    const result = await bootstrapInitialPersonalInvestingAccount({
      idempotencyKey,
      correlationId,
      baseCurrency: "EUR",
    });

    expect(result).toMatchObject({ ok: false, code: "INTERNAL_ERROR" });
    expect(authorityClient.queries.some((query) => normalizeSql(query.text) === "rollback")).toBe(true);
    expect(
      auditClient.queries.some((query) =>
        normalizeSql(query.text).startsWith("insert into investing.bootstrap_pre_authority_audit_events"),
      ),
    ).toBe(true);
  });

  it.each([
    ["invalid canonical_result_reference shape", { not: "canonical" }],
    ["canonical_result_reference persisted tuple mismatch", { ...canonicalReference, accountId: "77777777-7777-4777-8777-777777777777" }],
  ] as const)("attempts canonical audit after non-throwing %s with a durable Principal", async (_name, reference) => {
    const authorityClient = new FakeAuthorityClient(
      {
        ...activeGraphRows("EUR"),
        idempotency: [
          {
            idempotency_record_id: idempotencyRecordId,
            material_request_hash: "FILLED_BY_TEST",
            status: "SUCCEEDED",
            canonical_result_reference: reference,
          },
        ],
      },
      { principalInsert: 0, idempotencyInsert: 0 },
    );
    overrideQuery(authorityClient, async <Row = Record<string, unknown>>(text: string, values: readonly unknown[] = []) => {
      const result = await FakeAuthorityClient.prototype.query.call(authorityClient, text, values);
      if (normalizeSql(text).includes("from investing.idempotency_records")) {
        result.rows = [
          {
            idempotency_record_id: idempotencyRecordId,
            material_request_hash: authorityClient.materialRequestHash,
            status: "SUCCEEDED",
            canonical_result_reference: reference,
          },
        ] as Row[];
      }
      return result;
    });
    const auditClient = new FakeAuthorityClient();
    const { bootstrapInitialPersonalInvestingAccount, getInvestingAuthorityDatabase } = await loadBootstrap();
    getInvestingAuthorityDatabase.mockReturnValue(mockDatabase([authorityClient, auditClient]));

    const result = await bootstrapInitialPersonalInvestingAccount({
      idempotencyKey,
      correlationId,
      baseCurrency: "EUR",
    });

    expect(result).toMatchObject({ ok: false, code: "INTERNAL_ERROR" });
    expect(authorityClient.queries.some((query) => normalizeSql(query.text) === "rollback")).toBe(true);
    expect(auditClient.queries.some((query) => normalizeSql(query.text).startsWith("insert into investing.audit_events"))).toBe(
      true,
    );
  });

  it("replays only SUCCEEDED idempotency records with the same material hash", async () => {
    const authorityClient = new FakeAuthorityClient(
      {
        ...activeGraphRows("EUR"),
        idempotency: [
          {
            idempotency_record_id: idempotencyRecordId,
            material_request_hash: "FILLED_BY_TEST",
            status: "SUCCEEDED",
            canonical_result_reference: canonicalReference,
          },
        ],
      },
      { idempotencyInsert: 0 },
    );
    const { bootstrapInitialPersonalInvestingAccount, getInvestingAuthorityDatabase } = await loadBootstrap();
    overrideQuery(authorityClient, async <Row = Record<string, unknown>>(text: string, values: readonly unknown[] = []) => {
      const result = await FakeAuthorityClient.prototype.query.call(authorityClient, text, values);
      if (normalizeSql(text).includes("from investing.idempotency_records")) {
        result.rows = [
          {
            idempotency_record_id: idempotencyRecordId,
            material_request_hash: authorityClient.materialRequestHash,
            status: "SUCCEEDED",
            canonical_result_reference: canonicalReference,
          },
        ] as Row[];
      }
      return result;
    });
    const auditClient = new FakeAuthorityClient();
    getInvestingAuthorityDatabase.mockReturnValue(mockDatabase([authorityClient, auditClient]));

    const result = await bootstrapInitialPersonalInvestingAccount({
      idempotencyKey,
      correlationId,
      baseCurrency: "EUR",
    });

    expect(result).toMatchObject({ ok: true, replayed: true, accountId });
    expect(authorityClient.queries.some((query) => normalizeSql(query.text).startsWith("update investing.idempotency_records"))).toBe(
      false,
    );
    expect(auditClient.queries.some((query) => normalizeSql(query.text).startsWith("insert into investing.audit_events"))).toBe(
      false,
    );
    expect(authorityClient.queries.some((query) => normalizeSql(query.text).startsWith("insert into investing.audit_events"))).toBe(
      true,
    );
    const replayAudit = authorityClient.queries.find((query) =>
      normalizeSql(query.text).startsWith("insert into investing.audit_events"),
    );
    expect(replayAudit?.values[0]).toBe(correlationId);
    expect(JSON.parse(replayAudit?.values[11] as string)).toMatchObject({
      replayed: "true",
      idempotency_record_id: idempotencyRecordId,
    });
  });

  it.each([
    ["CONFLICT", "CONFLICT"],
    ["STARTED", "INTERNAL_ERROR"],
    ["FAILED", "INTERNAL_ERROR"],
  ] as const)("does not replay terminal status %s as success even when hashes match", async (status, code) => {
    const authorityClient = new FakeAuthorityClient({}, { idempotencyInsert: 0 });
    overrideQuery(authorityClient, async <Row = Record<string, unknown>>(text: string, values: readonly unknown[] = []) => {
      const result = await FakeAuthorityClient.prototype.query.call(authorityClient, text, values);
      if (normalizeSql(text).includes("from investing.idempotency_records")) {
        result.rows = [
          {
            idempotency_record_id: idempotencyRecordId,
            material_request_hash: authorityClient.materialRequestHash,
            status,
            canonical_result_reference: canonicalReference,
          },
        ] as Row[];
      }
      return result;
    });
    const { bootstrapInitialPersonalInvestingAccount, getInvestingAuthorityDatabase } = await loadBootstrap();
    getInvestingAuthorityDatabase.mockReturnValue(mockDatabase([authorityClient]));

    const result = await bootstrapInitialPersonalInvestingAccount({
      idempotencyKey,
      correlationId,
      baseCurrency: "EUR",
    });

    expect(result).toMatchObject({ ok: false, code });
  });

  it.each([
    ["principalInsert", null],
    ["principalInsert", 2],
    ["idempotencyInsert", null],
    ["idempotencyInsert", 2],
    ["accountInsert", null],
    ["accountInsert", 2],
    ["idempotencyUpdate", null],
    ["idempotencyUpdate", 2],
  ] as const)("fails closed when %s rowCount is %s", async (operation, rowCount) => {
    const authorityClient = new FakeAuthorityClient({}, { [operation]: rowCount });
    const { bootstrapInitialPersonalInvestingAccount, getInvestingAuthorityDatabase } = await loadBootstrap();
    getInvestingAuthorityDatabase.mockReturnValue(mockDatabase([authorityClient]));

    const result = await bootstrapInitialPersonalInvestingAccount({
      idempotencyKey,
      correlationId,
      baseCurrency: "EUR",
    });

    expect(result).toMatchObject({ ok: false, code: "INTERNAL_ERROR" });
  });

  it("rolls back the candidate graph and replays the winner when different-key account conflict resolves to equivalent canonical material", async () => {
    const authorityClient = new FakeAuthorityClient({}, { accountInsert: 0 });
    let rolledBackCandidate = false;
    overrideQuery(authorityClient, async <Row = Record<string, unknown>>(text: string, values: readonly unknown[] = []) => {
      if (normalizeSql(text) === "rollback to savepoint candidate_graph") {
        rolledBackCandidate = true;
      }
      const result = await FakeAuthorityClient.prototype.query.call(authorityClient, text, values);
      if (normalizeSql(text).includes("from investing.accounts")) {
        result.rows = (rolledBackCandidate ? activeGraphRows("EUR").accounts : []) as Row[];
        result.rowCount = result.rows.length;
      }
      if (normalizeSql(text).includes("from investing.tenant_memberships")) {
        result.rows = (rolledBackCandidate ? activeGraphRows("EUR").memberships : []) as Row[];
        result.rowCount = result.rows.length;
      }
      if (normalizeSql(text).includes("from investing.account_access")) {
        result.rows = (rolledBackCandidate ? activeGraphRows("EUR").access : []) as Row[];
        result.rowCount = result.rows.length;
      }
      return result;
    });
    const { bootstrapInitialPersonalInvestingAccount, getInvestingAuthorityDatabase } = await loadBootstrap();
    getInvestingAuthorityDatabase.mockReturnValue(mockDatabase([authorityClient]));

    const result = await bootstrapInitialPersonalInvestingAccount({
      idempotencyKey,
      correlationId,
      baseCurrency: "EUR",
    });

    expect(result).toMatchObject({ ok: true, replayed: true, accountId });
    expect(authorityClient.queries.some((query) => normalizeSql(query.text) === "rollback to savepoint candidate_graph")).toBe(
      true,
    );
  });

  it("denies inactive lifecycle states through canonical audit, never pre-authority audit", async () => {
    const authorityClient = new FakeAuthorityClient({
      ...activeGraphRows("EUR"),
      memberships: [{ tenant_membership_id: tenantMembershipId, tenant_id: tenantId, principal_id: principalId, state: "REVOKED" }],
    });
    const auditClient = new FakeAuthorityClient();
    const { bootstrapInitialPersonalInvestingAccount, getInvestingAuthorityDatabase } = await loadBootstrap();
    getInvestingAuthorityDatabase.mockReturnValue(mockDatabase([authorityClient, auditClient]));

    const result = await bootstrapInitialPersonalInvestingAccount({
      idempotencyKey,
      correlationId,
      baseCurrency: "EUR",
    });

    expect(result).toMatchObject({ ok: false, code: "MEMBERSHIP_INACTIVE" });
    expect(auditClient.queries.some((query) => normalizeSql(query.text).startsWith("insert into investing.audit_events"))).toBe(
      true,
    );
    expect(auditClient.queries.some((query) => normalizeSql(query.text).startsWith("insert into investing.bootstrap_pre_authority_audit_events"))).toBe(
      false,
    );
    expect(authorityClient.queries.some((query) => normalizeSql(query.text).startsWith("update investing.idempotency_records"))).toBe(
      false,
    );
  });

  it("preserves truthful durable audit evidence when unexpected errors occur before or after a durable Principal", async () => {
    const preAuthorityClient = new FakeAuthorityClient({}, {}, {}, "query");
    const preAuthorityAuditClient = new FakeAuthorityClient();
    const durablePrincipalClient = new FakeAuthorityClient({}, { principalInsert: 0 });
    overrideQuery(durablePrincipalClient, async <Row = Record<string, unknown>>(text: string, values: readonly unknown[] = []) => {
      const normalized = normalizeSql(text);
      if (normalized.includes("from investing.principals")) {
        return { rows: [{ principal_id: principalId, state: "ACTIVE" }] as Row[], rowCount: 1 };
      }
      if (normalized.includes("from investing.idempotency_records")) {
        throw new Error("idempotency lookup failed");
      }
      return FakeAuthorityClient.prototype.query.call(durablePrincipalClient, text, values);
    });
    const canonicalAuditClient = new FakeAuthorityClient();
    const { bootstrapInitialPersonalInvestingAccount, getInvestingAuthorityDatabase } = await loadBootstrap();
    getInvestingAuthorityDatabase
      .mockReturnValueOnce(mockDatabase([preAuthorityClient, preAuthorityAuditClient]))
      .mockReturnValueOnce(mockDatabase([durablePrincipalClient, canonicalAuditClient]));

    const beforePrincipal = await bootstrapInitialPersonalInvestingAccount({
      idempotencyKey,
      correlationId,
      baseCurrency: "EUR",
    });
    const afterDurablePrincipal = await bootstrapInitialPersonalInvestingAccount({
      idempotencyKey,
      correlationId,
      baseCurrency: "EUR",
    });

    expect(beforePrincipal).toMatchObject({ ok: false, code: "INTERNAL_ERROR" });
    expect(afterDurablePrincipal).toMatchObject({ ok: false, code: "INTERNAL_ERROR" });
    expect(
      preAuthorityAuditClient.queries.some((query) =>
        normalizeSql(query.text).startsWith("insert into investing.bootstrap_pre_authority_audit_events"),
      ),
    ).toBe(true);
    expect(canonicalAuditClient.queries.some((query) => normalizeSql(query.text).startsWith("insert into investing.audit_events"))).toBe(
      true,
    );
  });

  it("routes validation and stale transaction context to bootstrap pre-authority audit", async () => {
    const validationAuditClient = new FakeAuthorityClient();
    const staleAuthorityClient = new FakeAuthorityClient({}, {}, { c0: "USER_PRINCIPAL" });
    const staleAuditClient = new FakeAuthorityClient();
    const { bootstrapInitialPersonalInvestingAccount, getInvestingAuthorityDatabase } = await loadBootstrap();
    getInvestingAuthorityDatabase
      .mockReturnValueOnce(mockDatabase([validationAuditClient]))
      .mockReturnValueOnce(mockDatabase([staleAuthorityClient, staleAuditClient]));

    const invalid = await bootstrapInitialPersonalInvestingAccount({
      idempotencyKey,
      correlationId,
      baseCurrency: "EURO",
    });
    const stale = await bootstrapInitialPersonalInvestingAccount({
      idempotencyKey,
      correlationId,
      baseCurrency: "EUR",
    });

    expect(invalid).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    expect(stale).toMatchObject({ ok: false, code: "INTERNAL_ERROR" });
    expect(validationAuditClient.queries.some((query) => normalizeSql(query.text).startsWith("insert into investing.bootstrap_pre_authority_audit_events"))).toBe(
      true,
    );
    expect(staleAuthorityClient.destroyed).toBe(true);
    expect(staleAuditClient.queries.some((query) => normalizeSql(query.text).startsWith("insert into investing.bootstrap_pre_authority_audit_events"))).toBe(
      true,
    );
  });

  it("establishes only operation and capability before pre-authority audit insert on a fresh audit client", async () => {
    const validationAuditClient = new FakeAuthorityClient();
    const { bootstrapInitialPersonalInvestingAccount, getInvestingAuthorityDatabase } = await loadBootstrap();
    getInvestingAuthorityDatabase.mockReturnValue(mockDatabase([validationAuditClient]));

    await bootstrapInitialPersonalInvestingAccount({
      idempotencyKey,
      correlationId,
      baseCurrency: "EURO",
    });

    const normalizedQueries = validationAuditClient.queries.map((query) => normalizeSql(query.text));
    const stalePreflightIndex = normalizedQueries.findIndex((query) => query.startsWith("select current_setting("));
    const setConfigIndexes = validationAuditClient.queries
      .map((query, index) => ({ query, index }))
      .filter(({ query }) => normalizeSql(query.text).startsWith("select set_config("));
    const insertIndex = normalizedQueries.findIndex((query) =>
      query.startsWith("insert into investing.bootstrap_pre_authority_audit_events"),
    );

    expect(stalePreflightIndex).toBeGreaterThan(-1);
    expect(insertIndex).toBeGreaterThan(stalePreflightIndex);
    expect(setConfigIndexes).toHaveLength(2);
    expect(setConfigIndexes.every(({ index }) => index > stalePreflightIndex && index < insertIndex)).toBe(true);
    expect(setConfigIndexes.map(({ query }) => query.values[0])).toEqual([
      "syntrake.investing.operation",
      "syntrake.investing.capability",
    ]);
    expect(setConfigIndexes.map(({ query }) => query.values[1])).toEqual([
      "INITIAL_PERSONAL_BOOTSTRAP",
      "AUTHORITY_BOOTSTRAP",
    ]);
  });

  it("uses a generated audit correlation when caller correlation is invalid", async () => {
    const validationAuditClient = new FakeAuthorityClient();
    const { bootstrapInitialPersonalInvestingAccount, getInvestingAuthorityDatabase } = await loadBootstrap();
    getInvestingAuthorityDatabase.mockReturnValue(mockDatabase([validationAuditClient]));

    const result = await bootstrapInitialPersonalInvestingAccount({
      idempotencyKey,
      correlationId: "short",
      baseCurrency: "EUR",
    });

    expect(result).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    const audit = validationAuditClient.queries.find((query) =>
      normalizeSql(query.text).startsWith("insert into investing.bootstrap_pre_authority_audit_events"),
    );
    expect(audit?.values[2]).toMatch(/^audit-[0-9a-f-]{36}$/);
  });

  it("keeps bootstrap RLS policies operation-scoped and semantically exact", () => {
    const normalized = normalizeSql(readMigration());
    const policyNames = [...readMigration().matchAll(/create policy\s+([a-z0-9_]+)/gi)].map((match) => match[1]);
    const i2cPolicyNames = policyNames.filter((name) => name?.includes("_i2c_") || name?.endsWith("_i2c_insert"));

    expect(i2cPolicyNames).toEqual([
      "bootstrap_pre_authority_audit_events_i2c_insert",
      "principals_i2c_bootstrap_insert",
      "idempotency_records_i2c_bootstrap_read",
      "idempotency_records_i2c_bootstrap_insert",
      "idempotency_records_i2c_bootstrap_update",
      "tenants_i2c_bootstrap_insert",
      "tenants_i2c_bootstrap_read",
      "tenant_memberships_i2c_bootstrap_read",
      "tenant_memberships_i2c_bootstrap_insert",
      "accounts_i2c_bootstrap_read",
      "accounts_i2c_bootstrap_insert",
      "account_access_i2c_bootstrap_read",
      "account_access_i2c_bootstrap_insert",
      "audit_events_i2c_bootstrap_insert",
    ]);
    expect(i2cPolicyNames).toHaveLength(14);
    expect(normalized).toContain("expected exactly 14 i2-c policies");
    expect(normalized).toContain("current_setting('syntrake.investing.operation', true) = 'initial_personal_bootstrap'");
    expect(normalized).toContain("current_setting('syntrake.investing.capability', true) = 'authority_bootstrap'");
    expect(normalized).toContain("create policy tenants_i2c_bootstrap_read");
    expect(normalized).toContain("tenant_id = nullif(current_setting('syntrake.investing.candidate_tenant_id', true), '')::uuid");
    expect(normalized).toContain("resolution_stage = 'bootstrap_internal' and reason_code = 'bootstrap_internal_error' and outcome = 'error'");
    expect(normalized).toContain("object_id = current_setting('syntrake.investing.idempotency_record_id', true)");
    expect(normalized).toContain("object_type = 'account' and object_id = account_id::text");
    expect(normalized).toContain("reason_code in ( 'duplicate_initial_account_corruption', 'bootstrap_internal_error', 'partial_authority_graph', 'authority_tuple_mismatch' )");
    expect(normalized.match(/p\.external_subject = idempotency_records\.actor_id/g)?.length).toBeGreaterThanOrEqual(4);
    expect(normalized).toContain("idempotency_key = current_setting('syntrake.investing.idempotency_key', true)");
    expect(normalized).toContain("idempotency_record_id = nullif(current_setting('syntrake.investing.idempotency_record_id', true), '')::uuid");
    expect(normalized).toContain("p.external_provider = 'clerk'");
    expect(normalized).toContain("p.state = 'active'");
    expect(normalized).not.toContain("grant all");
    expect(normalized).not.toMatch(/create\s+(or\s+replace\s+)?function\s+investing\.[^;]*security\s+definer/);
    expect(normalized).not.toContain("to service_role");
  });

  it("keeps I2-C idempotency postconditions tolerant of PostgreSQL 17 deparse noise", () => {
    const normalized = normalizeSql(readMigration());
    const pg17IdempotencyExpression = `
      (current_setting('syntrake.investing.operation'::text, true) = 'initial_personal_bootstrap'::text)
      AND ((current_setting('syntrake.investing.capability'::text, true) = 'authority_bootstrap'::text))
      AND (idempotency_key = current_setting('syntrake.investing.idempotency_key'::text, true))
      AND (EXISTS (
        SELECT 1
        FROM investing.principals p
        WHERE ((p.principal_id = idempotency_records.principal_id)
          AND (p.external_provider = 'CLERK'::text)
          AND (p.external_subject = current_setting('syntrake.investing.external_subject'::text, true))
          AND (p.external_subject = idempotency_records.actor_id)
          AND (p.state = 'ACTIVE'::text))
      ))
    `;
    const pg17UpdateExpression = `
      ((idempotency_record_id = (nullif(current_setting('syntrake.investing.idempotency_record_id'::text, true), ''::text))::uuid)
      AND (material_request_hash = current_setting('syntrake.investing.material_request_hash'::text, true)))
    `;

    expect(normalized).toContain("regexp_replace(");
    expect(normalized).toContain("'::text'");
    expect(normalized).toContain("v_policy_expr !~");
    expect(idempotencyPostconditionPasses(pg17IdempotencyExpression)).toBe(true);
    expect(idempotencyUpdatePostconditionPasses(pg17UpdateExpression)).toBe(true);

    expect(
      idempotencyPostconditionPasses(
        pg17IdempotencyExpression.replace(
          "AND (p.external_subject = idempotency_records.actor_id)",
          "AND (p.external_subject IS NOT NULL)",
        ),
      ),
    ).toBe(false);
    expect(
      idempotencyPostconditionPasses(
        pg17IdempotencyExpression.replace("'authority_bootstrap'::text", "'other_capability'::text"),
      ),
    ).toBe(false);
    expect(
      idempotencyUpdatePostconditionPasses(
        pg17UpdateExpression.replace(
          "idempotency_record_id = (nullif(current_setting('syntrake.investing.idempotency_record_id'::text, true), ''::text))::uuid",
          "true",
        ),
      ),
    ).toBe(false);
    expect(
      idempotencyUpdatePostconditionPasses(
        pg17UpdateExpression.replace("syntrake.investing.idempotency_record_id", "syntrake.investing.other_id"),
      ),
    ).toBe(false);
    expect(
      idempotencyUpdatePostconditionPasses(
        pg17UpdateExpression.replace(", ''::text)", ", 'missing'::text)"),
      ),
    ).toBe(false);
    expect(
      idempotencyUpdatePostconditionPasses(pg17UpdateExpression.replace(")::uuid", ")")),
    ).toBe(false);
    expect(
      idempotencyUpdatePostconditionPasses(
        pg17UpdateExpression.replace(
          "AND (material_request_hash = current_setting('syntrake.investing.material_request_hash'::text, true))",
          "AND (material_request_hash IS NOT NULL)",
        ),
      ),
    ).toBe(false);
  });

  it("keeps the combined I2-B/I2-C nested RLS relation graph acyclic", () => {
    const policies = extractPolicies(`${fs.readFileSync(i2bMigrationPath, "utf8")}\n${readMigration()}`);
    const cycle = findNestedRlsRelationCycle(policies);

    expect(cycle).toBeNull();
    expect(directPolicyReferences(policies, "tenant_memberships_i2c_bootstrap_insert")).toContain("tenants");
    expect(directPolicyReferences(policies, "tenants_i2b_authority_read")).toEqual(["accounts", "principals"]);
    expect(directPolicyReferences(policies, "tenants_i2b_authority_read")).not.toContain("account_access");
    expect(directPolicyReferences(policies, "tenants_i2b_authority_read")).not.toContain("tenant_memberships");
    expect(directPolicyReferences(policies, "account_access_i2b_authority_read")).toContain("tenant_memberships");

    const realPg17RejectedPolicies: PolicyInfo[] = [
      {
        name: "tenant_memberships_i2c_bootstrap_insert",
        command: "insert",
        table: "tenant_memberships",
        body: "",
        references: ["tenants"],
      },
      { name: "tenants_i2b_authority_read", command: "select", table: "tenants", body: "", references: ["account_access"] },
      {
        name: "account_access_i2b_authority_read",
        command: "select",
        table: "account_access",
        body: "",
        references: ["tenant_memberships"],
      },
      {
        name: "tenant_memberships_i2b_authority_read",
        command: "select",
        table: "tenant_memberships",
        body: "",
        references: ["principals"],
      },
      { name: "principals_i2b_authority_read", command: "select", table: "principals", body: "", references: [] },
    ];
    expect(findNestedRlsRelationCycle(realPg17RejectedPolicies)).toEqual([
      "tenant_memberships",
      "tenants",
      "account_access",
      "tenant_memberships",
    ]);
  });

  it("rejects caller-supplied authority fields and never imports Trading or creates engines", () => {
    const source = readBootstrapSource();

    expect(source).toContain('"tenantId"');
    expect(source).toContain('"principalId"');
    expect(source).toContain('"accountId"');
    expect(source).not.toContain("lib/trading");
    expect(source).not.toContain("AUTHORITY_ACCESS_GRANTED");
    expect(source).not.toMatch(/\bservice_role\s+transport\b/i);
  });

  it("records stable local artifact fingerprints for independent review", () => {
    expect(fs.statSync(migrationPath).size).toBeGreaterThan(0);
    expect(sha256(migrationPath)).toMatch(/^[A-F0-9]{64}$/);
    expect(sha256(path.join(repoRoot, "lib", "investing", "authority", "bootstrap.ts"))).toMatch(/^[A-F0-9]{64}$/);
  });
});
