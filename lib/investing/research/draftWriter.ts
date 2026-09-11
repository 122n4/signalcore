import "server-only";

import { randomUUID } from "node:crypto";
import {
  isAuthorizedResearchDraftCreateContext,
  type AuthorizedResearchDraftCreateContext,
  type InvestingAuthorityTransactionClient,
} from "../authority/context";
import { getInvestingAuthorityDatabase } from "../authority/transport";
import { canonicalResearchDraftHashPayloadV1, hashResearchDraftV1, type ResearchDraftHashPayloadInputV1 } from "./semantic";
import {
  draftCreateMaterialIdentityV1,
  type ResearchMaterialScopeEvidenceV1,
} from "./materialRequest";

const operation = "RESEARCH_DRAFT_CREATE_V1";
const capability = "RESEARCH_MUTATE";
const schemaVersion = "RESEARCH_DRAFT_HASH_PAYLOAD_V1";

export type CreateResearchDraftV1Input = Readonly<{
  authorizedContext: AuthorizedResearchDraftCreateContext;
  draft: ResearchDraftHashPayloadInputV1;
  idempotencyKey: string;
  correlationId: string;
}>;

export type ResearchDraftCreateSuccess = Readonly<{
  ok: true;
  replayed: boolean;
  researchDraftId: string;
  researchInvestigationId: string;
  researchDraftHash: string;
  materialRequestHash: string;
  idempotencyRecordId: string;
}>;

export type ResearchDraftCreateFailureCode =
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

export type ResearchDraftCreateFailure = Readonly<{
  ok: false;
  code: ResearchDraftCreateFailureCode;
}>;

export type ResearchDraftCreateResult = ResearchDraftCreateSuccess | ResearchDraftCreateFailure;

type PreparedInput = {
  idempotencyKey: string;
  correlationId: string;
  draftPayloadJson: string;
  researchDraftHash: string;
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

type ResearchDraftRow = {
  research_draft_id: string;
  research_investigation_id: string;
  research_draft_hash: string;
  material_request_hash: string;
  idempotency_record_id: string;
};

type InvestigationRow = {
  research_investigation_id: string;
  tenant_id: string;
  account_id: string | null;
  principal_id: string;
  actor_kind: "USER_PRINCIPAL";
  actor_id: string;
  tenant_membership_id: string;
  account_access_id: string | null;
  operation_scope: "TENANT_SCOPE" | "ACCOUNT_SCOPE";
  source_context: "PURE_RESEARCH" | "TEST_PORTFOLIO" | "USER_PORTFOLIO";
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
  "syntrake.investing.source_context",
  "syntrake.investing.correlation_id",
  "syntrake.investing.idempotency_key",
  "syntrake.investing.idempotency_record_id",
  "syntrake.investing.material_request_hash",
  "syntrake.investing.research_investigation_id",
  "syntrake.investing.research_draft_id",
  "syntrake.investing.research_draft_hash",
] as const;

export async function createResearchDraftV1(
  input: CreateResearchDraftV1Input,
  env: Record<string, string | undefined> = process.env,
): Promise<ResearchDraftCreateResult> {
  if (!isAuthorizedResearchDraftCreateContext(input.authorizedContext)) {
    return fail("VALIDATION_ERROR");
  }
  const prepared = prepareInput(input);
  if (!prepared) return fail("VALIDATION_ERROR");

  try {
    const database = getInvestingAuthorityDatabase(env);
    return await withTransaction(database.connect(), async (client) => {
      if (await hasStaleTransactionContext(client)) return { ...fail("INTERNAL_ERROR"), destroyClient: true };
      await setTransactionContext(client, input.authorizedContext, prepared);

      const authority = await revalidateAuthorityAndParent(client, input.authorizedContext);
      if (authority.ok === false) return authority;

      const existing = await findExistingIdempotency(client, input.authorizedContext, prepared);
      if (existing.ok === false) return existing;
      if (existing.row) return dispatchExistingIdempotency(client, input.authorizedContext, prepared, existing.row);

      const idempotency = await lockOrCreateIdempotency(client, input.authorizedContext, prepared);
      if (idempotency.ok === false) return idempotency;
      if (idempotency.existing) {
        return dispatchExistingIdempotency(client, input.authorizedContext, prepared, idempotency.row);
      }

      const priorDraft = await findDraftForInvestigation(client, input.authorizedContext);
      if (priorDraft.ok === false) return priorDraft;
      if (priorDraft.row) return fail("CONFLICT");

      const researchDraftId = randomUUID();
      await setTransactionConfig(client, "research_draft_id", researchDraftId);
      const inserted = await client.query(
        [
          "insert into investing.research_drafts (",
          "research_draft_id, research_investigation_id, tenant_id, account_id, principal_id, actor_kind, actor_id,",
          "tenant_membership_id, account_access_id, operation_scope, operation, capability, source_context,",
          "draft_schema_version, draft_payload, research_draft_hash, material_request_hash,",
          "idempotency_record_id, idempotency_key, correlation_id",
          ") values ($1, $2, $3, $4, $5, 'USER_PRINCIPAL', $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, $15, $16, $17, $18, $19)",
        ].join(" "),
        [
          researchDraftId,
          input.authorizedContext.researchInvestigationId,
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
          schemaVersion,
          prepared.draftPayloadJson,
          prepared.researchDraftHash,
          prepared.materialRequestHash,
          idempotency.row.idempotency_record_id,
          prepared.idempotencyKey,
          prepared.correlationId,
        ],
      );
      if (inserted.rowCount !== 1) return fail("INTERNAL_ERROR");

      return completeIdempotency(client, idempotency.row.idempotency_record_id, {
        replayed: false,
        researchDraftId,
        researchInvestigationId: input.authorizedContext.researchInvestigationId,
        researchDraftHash: prepared.researchDraftHash,
        materialRequestHash: prepared.materialRequestHash,
      });
    });
  } catch {
    return fail("UNAVAILABLE");
  }
}

function prepareInput(input: CreateResearchDraftV1Input): PreparedInput | null {
  if (!validOpaque(input.idempotencyKey, 16, 512) || !validOpaque(input.correlationId, 16, 512)) return null;
  try {
    const canonicalPayload = canonicalResearchDraftHashPayloadV1(input.draft);
    const researchDraftHash = hashResearchDraftV1(input.draft);
    const identity = draftCreateMaterialIdentityV1(scopeEvidence(input.authorizedContext), {
      operation,
      idempotencyKey: input.idempotencyKey,
      correlationId: input.correlationId,
      investigationId: input.authorizedContext.researchInvestigationId,
      content: {
        ref: {
          hashAlgorithm: "SHA-256",
          hashDomain: "SYNTRAKE:RESEARCH_DRAFT:V1",
          hashVersion: "SYNTRAKE_SHA256_V1",
          hashHex: researchDraftHash,
        },
        payload: input.draft,
      },
    });
    return {
      idempotencyKey: input.idempotencyKey,
      correlationId: input.correlationId,
      draftPayloadJson: JSON.stringify(canonicalPayload),
      researchDraftHash,
      materialRequestHash: identity.materialRequestHash,
    };
  } catch {
    return null;
  }
}

function scopeEvidence(context: AuthorizedResearchDraftCreateContext): ResearchMaterialScopeEvidenceV1 {
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

async function revalidateAuthorityAndParent(
  client: InvestingAuthorityTransactionClient,
  context: AuthorizedResearchDraftCreateContext,
): Promise<{ ok: true; parent: InvestigationRow } | ResearchDraftCreateFailure> {
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

  if (context.operationScope === "ACCOUNT_SCOPE") {
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
  }

  const parent = await exactlyOne(
    client.query<InvestigationRow>(
      [
        "select research_investigation_id, tenant_id, account_id, principal_id, actor_kind, actor_id,",
        "tenant_membership_id, account_access_id, operation_scope, source_context",
        "from investing.research_investigations",
        "where research_investigation_id = $1 and tenant_id = $2 and principal_id = $3 and actor_kind = 'USER_PRINCIPAL' and actor_id = $4",
        context.operationScope === "TENANT_SCOPE" ? "and account_id is null" : "and account_id = $5",
        "for update",
      ].join(" "),
      context.operationScope === "TENANT_SCOPE"
        ? [context.researchInvestigationId, context.tenantId, context.principalId, context.actorId]
        : [context.researchInvestigationId, context.tenantId, context.principalId, context.actorId, context.accountId],
    ),
    "FORBIDDEN_OR_NOT_FOUND",
  );
  if (parent.ok === false) return parent;
  return parentMatchesContext(parent.row, context) ? { ok: true, parent: parent.row } : fail("INTERNAL_ERROR");
}

async function findExistingIdempotency(
  client: InvestingAuthorityTransactionClient,
  context: AuthorizedResearchDraftCreateContext,
  prepared: PreparedInput,
): Promise<{ ok: true; row: IdempotencyRow | null } | ResearchDraftCreateFailure> {
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
  context: AuthorizedResearchDraftCreateContext,
  prepared: PreparedInput,
): Promise<{ ok: true; existing: boolean; row: IdempotencyRow } | ResearchDraftCreateFailure> {
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

async function findDraftForInvestigation(
  client: InvestingAuthorityTransactionClient,
  context: AuthorizedResearchDraftCreateContext,
): Promise<{ ok: true; row: ResearchDraftRow | null } | ResearchDraftCreateFailure> {
  const selected = await client.query<ResearchDraftRow>(
    [
      "select research_draft_id, research_investigation_id, research_draft_hash, material_request_hash, idempotency_record_id",
      "from investing.research_drafts",
      "where research_investigation_id = $1 and tenant_id = $2",
      context.operationScope === "TENANT_SCOPE" ? "and account_id is null" : "and account_id = $3",
      "for update",
    ].join(" "),
    context.operationScope === "TENANT_SCOPE"
      ? [context.researchInvestigationId, context.tenantId]
      : [context.researchInvestigationId, context.tenantId, context.accountId],
  );
  if (selected.rows.length > 1) return fail("INTERNAL_ERROR");
  return { ok: true, row: selected.rows[0] ?? null };
}

async function dispatchExistingIdempotency(
  client: InvestingAuthorityTransactionClient,
  context: AuthorizedResearchDraftCreateContext,
  prepared: PreparedInput,
  row: IdempotencyRow,
): Promise<ResearchDraftCreateResult> {
  if (!idempotencyBelongsToContext(row, context, prepared.idempotencyKey)) return fail("CONFLICT");
  if (row.material_request_hash !== prepared.materialRequestHash) return fail("CONFLICT");
  if (row.status === "STARTED") {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      const next = await findExistingIdempotency(client, context, prepared);
      if (next.ok === false) return next;
      if (next.row && next.row.status !== "STARTED") {
        return dispatchExistingIdempotency(client, context, prepared, next.row);
      }
    }
  }
  if (row.status !== "SUCCEEDED") return fail("INTERNAL_ERROR");
  const reference = parseReference(row.canonical_result_reference);
  if (!reference) return fail("INTERNAL_ERROR");
  await setTransactionConfig(client, "research_draft_id", reference.researchDraftId);
  const draft = await exactlyOne(
    client.query<ResearchDraftRow>(
      [
        "select research_draft_id, research_investigation_id, research_draft_hash, material_request_hash, idempotency_record_id",
        "from investing.research_drafts",
        "where research_draft_id = $1 and research_investigation_id = $2 and tenant_id = $3",
        context.operationScope === "TENANT_SCOPE" ? "and account_id is null" : "and account_id = $4",
      ].join(" "),
      context.operationScope === "TENANT_SCOPE"
        ? [reference.researchDraftId, context.researchInvestigationId, context.tenantId]
        : [reference.researchDraftId, context.researchInvestigationId, context.tenantId, context.accountId],
    ),
    "INTERNAL_ERROR",
  );
  if (draft.ok === false) return draft;
  if (
    draft.row.material_request_hash !== prepared.materialRequestHash ||
    draft.row.research_draft_hash !== prepared.researchDraftHash ||
    draft.row.idempotency_record_id !== row.idempotency_record_id
  ) {
    return fail("INTERNAL_ERROR");
  }
  return {
    ok: true,
    replayed: true,
    researchDraftId: draft.row.research_draft_id,
    researchInvestigationId: draft.row.research_investigation_id,
    researchDraftHash: prepared.researchDraftHash,
    materialRequestHash: prepared.materialRequestHash,
    idempotencyRecordId: row.idempotency_record_id,
  };
}

async function completeIdempotency(
  client: InvestingAuthorityTransactionClient,
  idempotencyRecordId: string,
  input: Omit<ResearchDraftCreateSuccess, "ok" | "idempotencyRecordId">,
): Promise<ResearchDraftCreateResult> {
  const reference = {
    research_draft_id: input.researchDraftId,
    research_investigation_id: input.researchInvestigationId,
    research_draft_hash: input.researchDraftHash,
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
  work: (client: InvestingAuthorityTransactionClient) => Promise<ResearchDraftCreateResult & { destroyClient?: boolean }>,
): Promise<ResearchDraftCreateResult> {
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
  context: AuthorizedResearchDraftCreateContext,
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
  await setTransactionConfig(client, "source_context", context.sourceContext);
  await setTransactionConfig(client, "correlation_id", prepared.correlationId);
  await setTransactionConfig(client, "idempotency_key", prepared.idempotencyKey);
  await setTransactionConfig(client, "material_request_hash", prepared.materialRequestHash);
  await setTransactionConfig(client, "research_investigation_id", context.researchInvestigationId);
  await setTransactionConfig(client, "research_draft_hash", prepared.researchDraftHash);
}

async function setTransactionConfig(client: InvestingAuthorityTransactionClient, key: string, value: string) {
  await client.query("select set_config($1, $2, true)", [`syntrake.investing.${key}`, value]);
}

async function exactlyOne<Row>(
  query: Promise<{ rows: Row[] }>,
  emptyCode: ResearchDraftCreateFailureCode,
): Promise<{ ok: true; row: Row } | ResearchDraftCreateFailure> {
  const result = await query;
  if (result.rows.length === 0) return fail(emptyCode);
  if (result.rows.length > 1) return fail("INTERNAL_ERROR");
  return { ok: true, row: result.rows[0]! };
}

function idempotencyBelongsToContext(
  row: IdempotencyRow,
  context: AuthorizedResearchDraftCreateContext,
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
    (context.operationScope === "TENANT_SCOPE" ? row.account_id === null : row.account_id === context.accountId)
  );
}

function parentMatchesContext(row: InvestigationRow, context: AuthorizedResearchDraftCreateContext) {
  return (
    row.research_investigation_id === context.researchInvestigationId &&
    row.actor_kind === "USER_PRINCIPAL" &&
    row.actor_id === context.actorId &&
    row.principal_id === context.principalId &&
    row.tenant_id === context.tenantId &&
    row.tenant_membership_id === context.tenantMembershipId &&
    row.operation_scope === context.operationScope &&
    row.source_context === context.sourceContext &&
    (context.operationScope === "TENANT_SCOPE"
      ? row.account_id === null && row.account_access_id === null
      : row.account_id === context.accountId && row.account_access_id === context.accountAccessId)
  );
}

function parseReference(value: unknown): { researchDraftId: string } | null {
  if (!value || typeof value !== "object") return null;
  const reference = value as Record<string, unknown>;
  return typeof reference.research_draft_id === "string"
    ? { researchDraftId: reference.research_draft_id }
    : null;
}

function validOpaque(value: string, min: number, max: number) {
  const bytes = Buffer.byteLength(value, "utf8");
  return bytes >= min && bytes <= max;
}

function fail(code: ResearchDraftCreateFailureCode): ResearchDraftCreateFailure {
  return { ok: false, code };
}
