import "server-only";

import { randomUUID } from "node:crypto";
import {
  isAuthorizedResearchInvestigationCreateContext,
  type AuthorizedResearchInvestigationCreateContext,
  type InvestingAuthorityTransactionClient,
} from "../authority/context";
import { getInvestingAuthorityDatabase } from "../authority/transport";
import {
  investigationCreateMaterialIdentityV1,
  type ResearchMaterialScopeEvidenceV1,
} from "./materialRequest";

const operation = "RESEARCH_INVESTIGATION_CREATE_V1";
const capability = "RESEARCH_MUTATE";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CreateResearchInvestigationV1Input = Readonly<{
  authorizedContext: AuthorizedResearchInvestigationCreateContext;
  idempotencyKey: string;
  correlationId: string;
}>;

export type ResearchInvestigationCreateSuccess = Readonly<{
  ok: true;
  replayed: boolean;
  investigationId: string;
  materialRequestHash: string;
  idempotencyRecordId: string;
}>;

export type ResearchInvestigationCreateFailureCode =
  | "VALIDATION_ERROR"
  | "UNAVAILABLE"
  | "FORBIDDEN_OR_NOT_FOUND"
  | "PRINCIPAL_DISABLED"
  | "TENANT_INACTIVE"
  | "MEMBERSHIP_INACTIVE"
  | "ACCOUNT_INACTIVE"
  | "ACCESS_INACTIVE"
  | "CONFLICT"
  | "INTERNAL_ERROR";

export type ResearchInvestigationCreateFailure = Readonly<{
  ok: false;
  code: ResearchInvestigationCreateFailureCode;
}>;

export type ResearchInvestigationCreateResult =
  | ResearchInvestigationCreateSuccess
  | ResearchInvestigationCreateFailure;

type PreparedInput = {
  idempotencyKey: string;
  correlationId: string;
  materialRequestHash: string;
};

type IdempotencyRow = {
  idempotency_record_id: string;
  actor_kind: "USER_PRINCIPAL";
  actor_id: string;
  operation_scope: "TENANT_SCOPE" | "ACCOUNT_SCOPE";
  operation: typeof operation;
  principal_id: string;
  tenant_id: string;
  account_id: string | null;
  idempotency_key: string;
  material_request_hash: string;
  status: "STARTED" | "SUCCEEDED" | "FAILED" | "CONFLICT";
  canonical_result_reference: unknown;
};

type InvestigationRow = {
  research_investigation_id: string;
  material_request_hash: string;
  idempotency_record_id: string;
};

type PrincipalRow = { principal_id: string; state: "ACTIVE" | "DISABLED" };
type TenantRow = { tenant_id: string; state: "ACTIVE" | "SUSPENDED" | "CLOSED" };
type AccountRow = { account_id: string; tenant_id: string; state: "ACTIVE" | "FROZEN" | "CLOSED" };
type MembershipRow = {
  tenant_membership_id: string;
  tenant_id: string;
  principal_id: string;
  state: "ACTIVE" | "REVOKED";
};
type AccessRow = {
  account_access_id: string;
  account_id: string;
  tenant_id: string;
  tenant_membership_id: string;
  principal_id: string;
  state: "ACTIVE" | "REVOKED";
};

const transactionContextKeys = [
  "syntrake.investing.actor_kind",
  "syntrake.investing.actor_id",
  "syntrake.investing.external_provider",
  "syntrake.investing.external_subject",
  "syntrake.investing.principal_id",
  "syntrake.investing.tenant_id",
  "syntrake.investing.account_id",
  "syntrake.investing.tenant_membership_id",
  "syntrake.investing.account_access_id",
  "syntrake.investing.operation",
  "syntrake.investing.capability",
  "syntrake.investing.operation_scope",
  "syntrake.investing.correlation_id",
  "syntrake.investing.idempotency_key",
  "syntrake.investing.idempotency_record_id",
  "syntrake.investing.material_request_hash",
  "syntrake.investing.research_investigation_id",
] as const;

export async function createResearchInvestigationV1(
  input: CreateResearchInvestigationV1Input,
  env: Record<string, string | undefined> = process.env,
): Promise<ResearchInvestigationCreateResult> {
  if (!isAuthorizedResearchInvestigationCreateContext(input.authorizedContext)) {
    return fail("VALIDATION_ERROR");
  }
  const prepared = prepareInput(input);
  if (!prepared) return fail("VALIDATION_ERROR");

  try {
    const database = getInvestingAuthorityDatabase(env);
    return await withTransaction(database.connect(), async (client) => {
      if (await hasStaleTransactionContext(client)) return { ...fail("INTERNAL_ERROR"), destroyClient: true };
      await setTransactionContext(client, input.authorizedContext, prepared);

      const authority = await revalidateAuthority(client, input.authorizedContext);
      if (authority.ok === false) return authority;

      const existing = await findExistingIdempotency(client, input.authorizedContext, prepared);
      if (existing.ok === false) return existing;
      if (existing.row) return dispatchExistingIdempotency(client, input.authorizedContext, prepared, existing.row);

      const idempotency = await lockOrCreateIdempotency(client, input.authorizedContext, prepared);
      if (idempotency.ok === false) return idempotency;
      if (idempotency.existing) {
        return dispatchExistingIdempotency(client, input.authorizedContext, prepared, idempotency.row);
      }

      const investigationId = randomUUID();
      await setTransactionConfig(client, "research_investigation_id", investigationId);
      const inserted = await client.query(
        [
          "insert into investing.research_investigations (",
          "research_investigation_id, tenant_id, account_id, principal_id, actor_kind, actor_id,",
          "tenant_membership_id, account_access_id, operation_scope, operation, capability, source_context,",
          "material_request_hash, idempotency_record_id, idempotency_key, correlation_id",
          ") values ($1, $2, $3, $4, 'USER_PRINCIPAL', $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)",
        ].join(" "),
        [
          investigationId,
          input.authorizedContext.tenantId,
          "accountId" in input.authorizedContext ? input.authorizedContext.accountId : null,
          input.authorizedContext.principalId,
          input.authorizedContext.actorId,
          input.authorizedContext.tenantMembershipId,
          "accountAccessId" in input.authorizedContext ? input.authorizedContext.accountAccessId : null,
          input.authorizedContext.operationScope,
          operation,
          capability,
          input.authorizedContext.sourceContext,
          prepared.materialRequestHash,
          idempotency.row.idempotency_record_id,
          prepared.idempotencyKey,
          prepared.correlationId,
        ],
      );
      if (inserted.rowCount !== 1) return fail("INTERNAL_ERROR");

      return completeIdempotency(client, idempotency.row.idempotency_record_id, {
        replayed: false,
        investigationId,
        materialRequestHash: prepared.materialRequestHash,
      });
    });
  } catch {
    return fail("UNAVAILABLE");
  }
}

function prepareInput(input: CreateResearchInvestigationV1Input): PreparedInput | null {
  if (!validOpaque(input.idempotencyKey, 16, 512) || !validOpaque(input.correlationId, 16, 512)) return null;
  try {
    const identity = investigationCreateMaterialIdentityV1(scopeEvidence(input.authorizedContext), {
      operation,
      idempotencyKey: input.idempotencyKey,
      correlationId: input.correlationId,
    });
    return {
      idempotencyKey: input.idempotencyKey,
      correlationId: input.correlationId,
      materialRequestHash: identity.materialRequestHash,
    };
  } catch {
    return null;
  }
}

function scopeEvidence(context: AuthorizedResearchInvestigationCreateContext): ResearchMaterialScopeEvidenceV1 {
  if (context.operationScope === "TENANT_SCOPE") {
    return {
      actorKind: context.actorKind,
      actorId: context.actorId,
      principalId: context.principalId,
      operationScope: "TENANT_SCOPE",
      tenantId: context.tenantId,
      sourceContext: context.sourceContext,
    };
  }
  return {
    actorKind: context.actorKind,
    actorId: context.actorId,
    principalId: context.principalId,
    operationScope: "ACCOUNT_SCOPE",
    tenantId: context.tenantId,
    accountId: context.accountId,
    sourceContext: context.sourceContext,
  };
}

async function revalidateAuthority(
  client: InvestingAuthorityTransactionClient,
  context: AuthorizedResearchInvestigationCreateContext,
): Promise<{ ok: true } | ResearchInvestigationCreateFailure> {
  const principal = await exactlyOne(
    client.query<PrincipalRow>(
      "select principal_id, state from investing.principals where principal_id = $1 and external_provider = 'CLERK' and external_subject = $2 for update",
      [context.principalId, context.actorId],
    ),
    "FORBIDDEN_OR_NOT_FOUND",
  );
  if (principal.ok === false) return principal;
  if (principal.row.state !== "ACTIVE") return fail("PRINCIPAL_DISABLED");

  const tenant = await exactlyOne(
    client.query<TenantRow>("select tenant_id, state from investing.tenants where tenant_id = $1 for update", [
      context.tenantId,
    ]),
    "FORBIDDEN_OR_NOT_FOUND",
  );
  if (tenant.ok === false) return tenant;
  if (tenant.row.state !== "ACTIVE") return fail("TENANT_INACTIVE");

  const membership = await exactlyOne(
    client.query<MembershipRow>(
      [
        "select tenant_membership_id, tenant_id, principal_id, state",
        "from investing.tenant_memberships",
        "where tenant_membership_id = $1 and tenant_id = $2 and principal_id = $3 and role = 'OWNER' for update",
      ].join(" "),
      [context.tenantMembershipId, context.tenantId, context.principalId],
    ),
    "MEMBERSHIP_INACTIVE",
  );
  if (membership.ok === false) return membership;
  if (membership.row.state !== "ACTIVE") return fail("MEMBERSHIP_INACTIVE");

  if (context.operationScope === "TENANT_SCOPE") {
    return membership.row.tenant_id === context.tenantId && membership.row.principal_id === context.principalId
      ? { ok: true }
      : fail("INTERNAL_ERROR");
  }

  const account = await exactlyOne(
    client.query<AccountRow>(
      "select account_id, tenant_id, state from investing.accounts where account_id = $1 and tenant_id = $2 for update",
      [context.accountId, context.tenantId],
    ),
    "FORBIDDEN_OR_NOT_FOUND",
  );
  if (account.ok === false) return account;
  if (account.row.state !== "ACTIVE") return fail("ACCOUNT_INACTIVE");

  const access = await exactlyOne(
    client.query<AccessRow>(
      [
        "select account_access_id, account_id, tenant_id, tenant_membership_id, principal_id, state",
        "from investing.account_access",
        "where account_access_id = $1 and account_id = $2 and tenant_id = $3",
        "and tenant_membership_id = $4 and principal_id = $5 and role = 'OWNER' for update",
      ].join(" "),
      [context.accountAccessId, context.accountId, context.tenantId, context.tenantMembershipId, context.principalId],
    ),
    "ACCESS_INACTIVE",
  );
  if (access.ok === false) return access;
  if (access.row.state !== "ACTIVE") return fail("ACCESS_INACTIVE");

  if (
    account.row.tenant_id !== tenant.row.tenant_id ||
    access.row.account_id !== account.row.account_id ||
    access.row.tenant_id !== tenant.row.tenant_id ||
    access.row.tenant_membership_id !== membership.row.tenant_membership_id ||
    access.row.principal_id !== principal.row.principal_id
  ) {
    return fail("INTERNAL_ERROR");
  }
  return { ok: true };
}

async function findExistingIdempotency(
  client: InvestingAuthorityTransactionClient,
  context: AuthorizedResearchInvestigationCreateContext,
  prepared: PreparedInput,
): Promise<{ ok: true; row: IdempotencyRow | null } | ResearchInvestigationCreateFailure> {
  const accountPredicate = context.operationScope === "TENANT_SCOPE" ? "account_id is null" : "account_id = $5";
  const values =
    context.operationScope === "TENANT_SCOPE"
      ? [context.actorId, context.principalId, context.tenantId, operation, prepared.idempotencyKey]
      : [context.actorId, context.principalId, context.tenantId, operation, context.accountId, prepared.idempotencyKey];
  const selected = await client.query<IdempotencyRow>(
    [
      "select idempotency_record_id, actor_kind, actor_id, operation_scope, operation, principal_id, tenant_id, account_id,",
      "idempotency_key, material_request_hash, status, canonical_result_reference",
      "from investing.idempotency_records",
      "where actor_kind = 'USER_PRINCIPAL' and actor_id = $1 and principal_id = $2",
      `and tenant_id = $3 and operation_scope = '${context.operationScope}' and operation = $4 and ${accountPredicate}`,
      `and idempotency_key = $${context.operationScope === "TENANT_SCOPE" ? 5 : 6} for update`,
    ].join(" "),
    values,
  );
  if (selected.rows.length > 1) return fail("INTERNAL_ERROR");
  if (selected.rows.length === 0) return { ok: true, row: null };
  const row = selected.rows[0]!;
  await setTransactionConfig(client, "idempotency_record_id", row.idempotency_record_id);
  return idempotencyBelongsToContext(row, context, prepared.idempotencyKey)
    ? { ok: true, row }
    : fail("CONFLICT");
}

async function lockOrCreateIdempotency(
  client: InvestingAuthorityTransactionClient,
  context: AuthorizedResearchInvestigationCreateContext,
  prepared: PreparedInput,
): Promise<{ ok: true; existing: boolean; row: IdempotencyRow } | ResearchInvestigationCreateFailure> {
  const candidateId = randomUUID();
  await setTransactionConfig(client, "idempotency_record_id", candidateId);
  const inserted = await client.query(
    [
      "insert into investing.idempotency_records (",
      "idempotency_record_id, idempotency_key, material_request_hash, correlation_id, actor_kind, actor_id,",
      "operation_scope, operation, principal_id, tenant_id, account_id, status",
      ") values ($1, $2, $3, $4, 'USER_PRINCIPAL', $5, $6, $7, $8, $9, $10, 'STARTED')",
      "on conflict (actor_kind, actor_id, operation_scope, operation, idempotency_key) do nothing",
    ].join(" "),
    [
      candidateId,
      prepared.idempotencyKey,
      prepared.materialRequestHash,
      prepared.correlationId,
      context.actorId,
      context.operationScope,
      operation,
      context.principalId,
      context.tenantId,
      "accountId" in context ? context.accountId : null,
    ],
  );
  if (inserted.rowCount !== 0 && inserted.rowCount !== 1) return fail("INTERNAL_ERROR");

  if (inserted.rowCount === 0) {
    const existing = await findExistingIdempotency(client, context, prepared);
    if (existing.ok === false) return existing;
    if (!existing.row) return fail("CONFLICT");
    return { ok: true, existing: true, row: existing.row };
  }

  const created = await findExistingIdempotency(client, context, prepared);
  if (created.ok === false) return created;
  if (!created.row || created.row.idempotency_record_id !== candidateId || created.row.status !== "STARTED") {
    return fail("INTERNAL_ERROR");
  }
  if (created.row.material_request_hash !== prepared.materialRequestHash) return fail("INTERNAL_ERROR");
  return { ok: true, existing: false, row: created.row };
}

async function dispatchExistingIdempotency(
  client: InvestingAuthorityTransactionClient,
  context: AuthorizedResearchInvestigationCreateContext,
  prepared: PreparedInput,
  row: IdempotencyRow,
): Promise<ResearchInvestigationCreateResult> {
  if (!idempotencyBelongsToContext(row, context, prepared.idempotencyKey)) return fail("CONFLICT");
  if (row.material_request_hash !== prepared.materialRequestHash) return fail("CONFLICT");
  if (row.status !== "SUCCEEDED") return fail("INTERNAL_ERROR");
  const reference = parseReference(row.canonical_result_reference);
  if (!reference) return fail("INTERNAL_ERROR");
  await setTransactionConfig(client, "research_investigation_id", reference.investigationId);
  const investigation = await exactlyOne(
    client.query<InvestigationRow>(
      [
        "select research_investigation_id, material_request_hash, idempotency_record_id",
        "from investing.research_investigations",
        "where research_investigation_id = $1 and tenant_id = $2",
        context.operationScope === "TENANT_SCOPE" ? "and account_id is null" : "and account_id = $3",
      ].join(" "),
      context.operationScope === "TENANT_SCOPE"
        ? [reference.investigationId, context.tenantId]
        : [reference.investigationId, context.tenantId, context.accountId],
    ),
    "INTERNAL_ERROR",
  );
  if (investigation.ok === false) return investigation;
  if (
    investigation.row.material_request_hash !== prepared.materialRequestHash ||
    investigation.row.idempotency_record_id !== row.idempotency_record_id
  ) {
    return fail("INTERNAL_ERROR");
  }
  return {
    ok: true,
    replayed: true,
    investigationId: investigation.row.research_investigation_id,
    materialRequestHash: prepared.materialRequestHash,
    idempotencyRecordId: row.idempotency_record_id,
  };
}

async function completeIdempotency(
  client: InvestingAuthorityTransactionClient,
  idempotencyRecordId: string,
  input: Omit<ResearchInvestigationCreateSuccess, "ok" | "idempotencyRecordId">,
): Promise<ResearchInvestigationCreateResult> {
  const reference = {
    research_investigation_id: input.investigationId,
    material_request_hash: input.materialRequestHash,
  };
  const updated = await client.query(
    [
      "update investing.idempotency_records",
      "set status = 'SUCCEEDED', canonical_result_reference = $2::jsonb, error_code = null,",
      "updated_at = transaction_timestamp(), completed_at = transaction_timestamp()",
      "where idempotency_record_id = $1 and status = 'STARTED'",
    ].join(" "),
    [idempotencyRecordId, JSON.stringify(reference)],
  );
  if (updated.rowCount !== 1) return fail("INTERNAL_ERROR");
  return { ok: true, idempotencyRecordId, ...input };
}

async function withTransaction(
  connection: Promise<InvestingAuthorityTransactionClient>,
  work: (client: InvestingAuthorityTransactionClient) => Promise<ResearchInvestigationCreateResult & { destroyClient?: boolean }>,
): Promise<ResearchInvestigationCreateResult> {
  let client: InvestingAuthorityTransactionClient | null = null;
  let destroyClient = false;
  try {
    client = await connection;
    await client.query("begin");
    const result = await work(client);
    destroyClient = result.ok === false && result.destroyClient === true;
    if (result.ok) await client.query("commit");
    else await client.query("rollback");
    return result;
  } catch {
    if (client) {
      try {
        await client.query("rollback");
      } catch {
        destroyClient = true;
      }
    }
    return fail("INTERNAL_ERROR");
  } finally {
    if (client) {
      try {
        await client.release(destroyClient);
      } catch {
        // The transaction has already failed closed or committed before release.
      }
    }
  }
}

async function hasStaleTransactionContext(client: InvestingAuthorityTransactionClient) {
  const result = await client.query<Record<string, string | null>>(
    `select ${transactionContextKeys.map((key, index) => `current_setting('${key}', true) as c${index}`).join(", ")}`,
  );
  const row = result.rows[0] ?? {};
  return Object.values(row).some((value) => value !== null && value !== "");
}

async function setTransactionContext(
  client: InvestingAuthorityTransactionClient,
  context: AuthorizedResearchInvestigationCreateContext,
  prepared: PreparedInput,
) {
  await setTransactionConfig(client, "actor_kind", "USER_PRINCIPAL");
  await setTransactionConfig(client, "actor_id", context.actorId);
  await setTransactionConfig(client, "external_provider", "CLERK");
  await setTransactionConfig(client, "external_subject", context.actorId);
  await setTransactionConfig(client, "principal_id", context.principalId);
  await setTransactionConfig(client, "tenant_id", context.tenantId);
  if ("accountId" in context) await setTransactionConfig(client, "account_id", context.accountId);
  await setTransactionConfig(client, "tenant_membership_id", context.tenantMembershipId);
  if ("accountAccessId" in context) await setTransactionConfig(client, "account_access_id", context.accountAccessId);
  await setTransactionConfig(client, "operation", operation);
  await setTransactionConfig(client, "capability", capability);
  await setTransactionConfig(client, "operation_scope", context.operationScope);
  await setTransactionConfig(client, "correlation_id", prepared.correlationId);
  await setTransactionConfig(client, "idempotency_key", prepared.idempotencyKey);
  await setTransactionConfig(client, "material_request_hash", prepared.materialRequestHash);
}

async function setTransactionConfig(client: InvestingAuthorityTransactionClient, key: string, value: string) {
  await client.query("select set_config($1, $2, true)", [`syntrake.investing.${key}`, value]);
}

async function exactlyOne<Row>(
  query: Promise<{ rows: Row[] }>,
  emptyCode: ResearchInvestigationCreateFailureCode,
): Promise<{ ok: true; row: Row } | ResearchInvestigationCreateFailure> {
  const result = await query;
  if (result.rows.length === 0) return fail(emptyCode);
  if (result.rows.length > 1) return fail("INTERNAL_ERROR");
  return { ok: true, row: result.rows[0]! };
}

function idempotencyBelongsToContext(
  row: IdempotencyRow,
  context: AuthorizedResearchInvestigationCreateContext,
  idempotencyKey: string,
) {
  return (
    row.actor_kind === "USER_PRINCIPAL" &&
    row.actor_id === context.actorId &&
    row.principal_id === context.principalId &&
    row.tenant_id === context.tenantId &&
    row.operation_scope === context.operationScope &&
    row.operation === operation &&
    row.idempotency_key === idempotencyKey &&
    (context.operationScope === "TENANT_SCOPE"
      ? row.account_id === null
      : row.account_id === context.accountId)
  );
}

function parseReference(value: unknown): { investigationId: string } | null {
  if (!value || typeof value !== "object") return null;
  const reference = value as Record<string, unknown>;
  return typeof reference.research_investigation_id === "string" && uuidPattern.test(reference.research_investigation_id)
    ? { investigationId: reference.research_investigation_id }
    : null;
}

function validOpaque(value: string, min: number, max: number) {
  const bytes = Buffer.byteLength(value, "utf8");
  return bytes >= min && bytes <= max;
}

function fail(code: ResearchInvestigationCreateFailureCode): ResearchInvestigationCreateFailure {
  return { ok: false, code };
}
