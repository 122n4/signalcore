import "server-only";

import { randomUUID } from "node:crypto";
import {
  isAuthorizedResearchMaterialRevisionCreateContext,
  type AuthorizedResearchMaterialRevisionCreateContext,
  type InvestingAuthorityTransactionClient,
  type ResearchMaterialRevisionCreateOperation,
} from "../authority/context";
import { getInvestingAuthorityDatabase } from "../authority/transport";
import {
  draftRevisionCreateMaterialIdentityV1,
  hypothesisRevisionCreateMaterialIdentityV1,
  type ExpectedResearchMaterialPointersV1,
  type ExpectedResearchMaterialRootV1,
  type ResearchMaterialScopeEvidenceV1,
} from "./materialRequest";
import {
  applyA3PointerEffectV1,
  canonicalHypothesisHashPayloadV1,
  canonicalResearchDraftHashPayloadV1,
  emptyInvestigationPointersV1,
  hashHypothesisV1,
  hashResearchDraftV1,
  type HypothesisHashPayloadInputV1,
  type InvestigationPointersV1,
  type ResearchDraftHashPayloadInputV1,
} from "./semantic";

const draftOperation = "RESEARCH_DRAFT_REVISION_CREATE_V1";
const hypothesisOperation = "RESEARCH_HYPOTHESIS_REVISION_CREATE_V1";
const capability = "RESEARCH_MUTATE";

export type CreateResearchDraftRevisionV1Input = Readonly<{
  authorizedContext: AuthorizedResearchMaterialRevisionCreateContext & { operation: typeof draftOperation };
  expectedRoot: ExpectedResearchMaterialRootV1;
  expectedPointers: ExpectedResearchMaterialPointersV1;
  draft: ResearchDraftHashPayloadInputV1;
  idempotencyKey: string;
  correlationId: string;
}>;

export type CreateResearchHypothesisRevisionV1Input = Readonly<{
  authorizedContext: AuthorizedResearchMaterialRevisionCreateContext & { operation: typeof hypothesisOperation };
  expectedRoot: ExpectedResearchMaterialRootV1;
  expectedPointers: ExpectedResearchMaterialPointersV1;
  hypothesis: HypothesisHashPayloadInputV1;
  idempotencyKey: string;
  correlationId: string;
}>;

export type ResearchMaterialRevisionCreateSuccess = Readonly<{
  ok: true;
  replayed: boolean;
  researchInvestigationId: string;
  materialKind: "DRAFT" | "HYPOTHESIS";
  materialRootId: string;
  materialRevisionId: string;
  materialRevisionNumber: string;
  materialHash: string;
  materialRequestHash: string;
  pointerVersion: string;
  pointers: InvestigationPointersV1;
  idempotencyRecordId: string;
}>;

export type ResearchMaterialRevisionCreateFailureCode =
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

export type ResearchMaterialRevisionCreateFailure = Readonly<{
  ok: false;
  code: ResearchMaterialRevisionCreateFailureCode;
}>;

export type ResearchMaterialRevisionCreateResult =
  | ResearchMaterialRevisionCreateSuccess
  | ResearchMaterialRevisionCreateFailure;

type CreateInput = CreateResearchDraftRevisionV1Input | CreateResearchHypothesisRevisionV1Input;

type PreparedInput = {
  operation: ResearchMaterialRevisionCreateOperation;
  materialKind: "DRAFT" | "HYPOTHESIS";
  idempotencyKey: string;
  correlationId: string;
  payloadJson: string;
  materialHash: string;
  materialRequestHash: string;
};

type IdempotencyRow = {
  idempotency_record_id: string;
  actor_kind: "USER_PRINCIPAL";
  actor_id: string;
  operation_scope: "TENANT_SCOPE" | "ACCOUNT_SCOPE";
  operation: ResearchMaterialRevisionCreateOperation;
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

type PointerRow = {
  research_investigation_id: string;
  active_draft_revision_id: string | null;
  active_hypothesis_revision_id: string | null;
  active_spec_revision_id: string | null;
  active_experiment_id: string | null;
  pointer_version: string;
};

type RootRow = {
  material_root_id: string;
  material_kind: "DRAFT" | "HYPOTHESIS";
  research_investigation_id: string;
};

type HeadRow = {
  material_revision_id: string;
  revision_number: string;
};

type RevisionRow = {
  material_revision_id: string;
  material_root_id: string;
  material_kind: "DRAFT" | "HYPOTHESIS";
  revision_number: string;
  material_hash: string;
  material_request_hash: string;
  idempotency_record_id: string;
  canonical_payload: unknown;
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
  "syntrake.investing.material_root_id",
  "syntrake.investing.material_revision_id",
  "syntrake.investing.material_kind",
] as const;

export async function createResearchDraftRevisionV1(
  input: CreateResearchDraftRevisionV1Input,
  env: Record<string, string | undefined> = process.env,
): Promise<ResearchMaterialRevisionCreateResult> {
  return createResearchMaterialRevisionV1(input, env);
}

export async function createResearchHypothesisRevisionV1(
  input: CreateResearchHypothesisRevisionV1Input,
  env: Record<string, string | undefined> = process.env,
): Promise<ResearchMaterialRevisionCreateResult> {
  return createResearchMaterialRevisionV1(input, env);
}

async function createResearchMaterialRevisionV1(
  input: CreateInput,
  env: Record<string, string | undefined>,
): Promise<ResearchMaterialRevisionCreateResult> {
  if (!isAuthorizedResearchMaterialRevisionCreateContext(input.authorizedContext)) {
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

      const pointer = await lockOrCreatePointerState(client, input.authorizedContext);
      if (pointer.ok === false) return pointer;
      if (!expectedPointersMatch(pointer.row, input.expectedPointers)) return fail("CONFLICT");

      const idempotency = await lockOrCreateIdempotency(client, input.authorizedContext, prepared);
      if (idempotency.ok === false) return idempotency;
      if (idempotency.existing) {
        return dispatchExistingIdempotency(client, input.authorizedContext, prepared, idempotency.row);
      }

      await setTransactionConfig(client, "material_kind", prepared.materialKind);
      const root = await lockOrCreateRoot(client, input.authorizedContext, prepared, input.expectedRoot, pointer.row);
      if (root.ok === false) return root;

      const materialRevisionId = randomUUID();
      await setTransactionConfig(client, "material_root_id", root.root.material_root_id);
      await setTransactionConfig(client, "material_revision_id", materialRevisionId);

      const inserted = await insertRevision(client, input, prepared, idempotency.row.idempotency_record_id, root, materialRevisionId);
      if (inserted.ok === false) return inserted;

      const nextPointers = applyA3PointerEffectV1({
        kind: prepared.materialKind === "DRAFT" ? "DRAFT_REVISION" : "HYPOTHESIS_REVISION",
        predecessor: pointerToSemantic(pointer.row),
        ...(prepared.materialKind === "DRAFT" ? { newDraft: materialRevisionId } : { newHypothesis: materialRevisionId }),
      });
      const nextVersion = String(BigInt(pointer.row.pointer_version) + BigInt(1));
      const advanced = await updatePointerState(client, input.authorizedContext, pointer.row, nextPointers, nextVersion);
      if (advanced.ok === false) return advanced;

      return completeIdempotency(client, idempotency.row.idempotency_record_id, {
        replayed: false,
        researchInvestigationId: input.authorizedContext.researchInvestigationId,
        materialKind: prepared.materialKind,
        materialRootId: root.root.material_root_id,
        materialRevisionId,
        materialRevisionNumber: root.nextRevisionNumber,
        materialHash: prepared.materialHash,
        materialRequestHash: prepared.materialRequestHash,
        pointerVersion: nextVersion,
        pointers: nextPointers,
      });
    });
  } catch {
    return fail("UNAVAILABLE");
  }
}

function prepareInput(input: CreateInput): PreparedInput | null {
  if (!validOpaque(input.idempotencyKey, 16, 512) || !validOpaque(input.correlationId, 16, 512)) return null;
  try {
    if (input.authorizedContext.operation === draftOperation && "draft" in input) {
      const materialHash = hashResearchDraftV1(input.draft);
      const content = {
        ref: { hashAlgorithm: "SHA-256", hashDomain: "SYNTRAKE:RESEARCH_DRAFT:V1", hashVersion: "SYNTRAKE_SHA256_V1", hashHex: materialHash },
        payload: input.draft,
      } as const;
      const identity = draftRevisionCreateMaterialIdentityV1(scopeEvidence(input.authorizedContext), {
        operation: draftOperation,
        idempotencyKey: input.idempotencyKey,
        correlationId: input.correlationId,
        investigationId: input.authorizedContext.researchInvestigationId,
        expectedPointers: input.expectedPointers,
        expectedRoot: input.expectedRoot,
        content,
      });
      return {
        operation: draftOperation,
        materialKind: "DRAFT",
        idempotencyKey: input.idempotencyKey,
        correlationId: input.correlationId,
        payloadJson: JSON.stringify(canonicalResearchDraftHashPayloadV1(input.draft)),
        materialHash,
        materialRequestHash: identity.materialRequestHash,
      };
    }
    if (input.authorizedContext.operation === hypothesisOperation && "hypothesis" in input) {
      const materialHash = hashHypothesisV1(input.hypothesis);
      const content = {
        ref: { hashAlgorithm: "SHA-256", hashDomain: "SYNTRAKE:HYPOTHESIS:V1", hashVersion: "SYNTRAKE_SHA256_V1", hashHex: materialHash },
        payload: input.hypothesis,
      } as const;
      const identity = hypothesisRevisionCreateMaterialIdentityV1(scopeEvidence(input.authorizedContext), {
        operation: hypothesisOperation,
        idempotencyKey: input.idempotencyKey,
        correlationId: input.correlationId,
        investigationId: input.authorizedContext.researchInvestigationId,
        expectedPointers: input.expectedPointers,
        expectedRoot: input.expectedRoot,
        content,
      });
      return {
        operation: hypothesisOperation,
        materialKind: "HYPOTHESIS",
        idempotencyKey: input.idempotencyKey,
        correlationId: input.correlationId,
        payloadJson: JSON.stringify(canonicalHypothesisHashPayloadV1(input.hypothesis)),
        materialHash,
        materialRequestHash: identity.materialRequestHash,
      };
    }
  } catch {
    return null;
  }
  return null;
}

function scopeEvidence(context: AuthorizedResearchMaterialRevisionCreateContext): ResearchMaterialScopeEvidenceV1 {
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
  context: AuthorizedResearchMaterialRevisionCreateContext,
): Promise<{ ok: true; parent: InvestigationRow } | ResearchMaterialRevisionCreateFailure> {
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
    client.query<TenantRow>("select tenant_id, state from investing.tenants where tenant_id = $1 for update", [context.tenantId]),
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

async function lockOrCreatePointerState(
  client: InvestingAuthorityTransactionClient,
  context: AuthorizedResearchMaterialRevisionCreateContext,
): Promise<{ ok: true; row: PointerRow } | ResearchMaterialRevisionCreateFailure> {
  const inserted = await client.query(
    [
      "insert into investing.research_material_pointer_states (",
      "research_investigation_id, tenant_id, account_id, principal_id, actor_kind, actor_id, tenant_membership_id,",
      "account_access_id, operation_scope, source_context, active_draft_revision_id, active_hypothesis_revision_id,",
      "active_spec_revision_id, active_experiment_id, pointer_version",
      ") values ($1, $2, $3, $4, 'USER_PRINCIPAL', $5, $6, $7, $8, $9, null, null, null, null, 0)",
      "on conflict (research_investigation_id) do nothing",
    ].join(" "),
    [
      context.researchInvestigationId,
      context.tenantId,
      "accountId" in context ? context.accountId : null,
      context.principalId,
      context.actorId,
      context.tenantMembershipId,
      "accountAccessId" in context ? context.accountAccessId : null,
      context.operationScope,
      context.sourceContext,
    ],
  );
  if (inserted.rowCount !== 0 && inserted.rowCount !== 1) return fail("INTERNAL_ERROR");
  const selected = await client.query<PointerRow>(
    [
      "select research_investigation_id, active_draft_revision_id, active_hypothesis_revision_id,",
      "active_spec_revision_id, active_experiment_id, pointer_version::text",
      "from investing.research_material_pointer_states",
      "where research_investigation_id = $1 and tenant_id = $2 and principal_id = $3",
      context.operationScope === "TENANT_SCOPE" ? "and account_id is null" : "and account_id = $4",
      "for update",
    ].join(" "),
    context.operationScope === "TENANT_SCOPE"
      ? [context.researchInvestigationId, context.tenantId, context.principalId]
      : [context.researchInvestigationId, context.tenantId, context.principalId, context.accountId],
  );
  if (selected.rows.length !== 1) return fail("INTERNAL_ERROR");
  return { ok: true, row: selected.rows[0]! };
}

async function lockOrCreateRoot(
  client: InvestingAuthorityTransactionClient,
  context: AuthorizedResearchMaterialRevisionCreateContext,
  prepared: PreparedInput,
  expectedRoot: ExpectedResearchMaterialRootV1,
  pointer: PointerRow,
): Promise<{ ok: true; root: RootRow; nextRevisionNumber: string; predecessorRevisionId: string | null } | ResearchMaterialRevisionCreateFailure> {
  const selected = await client.query<RootRow>(
    [
      "select material_root_id, material_kind, research_investigation_id",
      "from investing.research_material_roots",
      "where research_investigation_id = $1 and material_kind = $2 for update",
    ].join(" "),
    [context.researchInvestigationId, prepared.materialKind],
  );
  if (selected.rows.length > 1) return fail("INTERNAL_ERROR");
  const activeRevisionId = prepared.materialKind === "DRAFT" ? pointer.active_draft_revision_id : pointer.active_hypothesis_revision_id;

  if (selected.rows.length === 0) {
    if (expectedRoot.state !== "ABSENT" || activeRevisionId !== null) return fail("CONFLICT");
    const materialRootId = randomUUID();
    await setTransactionConfig(client, "material_root_id", materialRootId);
    const inserted = await client.query(
      [
        "insert into investing.research_material_roots (",
        "material_root_id, research_investigation_id, tenant_id, account_id, principal_id, actor_kind, actor_id,",
        "tenant_membership_id, account_access_id, operation_scope, source_context, material_kind, created_by_operation",
        ") values ($1, $2, $3, $4, $5, 'USER_PRINCIPAL', $6, $7, $8, $9, $10, $11, $12)",
      ].join(" "),
      [
        materialRootId,
        context.researchInvestigationId,
        context.tenantId,
        "accountId" in context ? context.accountId : null,
        context.principalId,
        context.actorId,
        context.tenantMembershipId,
        "accountAccessId" in context ? context.accountAccessId : null,
        context.operationScope,
        context.sourceContext,
        prepared.materialKind,
        prepared.operation,
      ],
    );
    if (inserted.rowCount !== 1) return fail("INTERNAL_ERROR");
    return { ok: true, root: { material_root_id: materialRootId, material_kind: prepared.materialKind, research_investigation_id: context.researchInvestigationId }, nextRevisionNumber: "1", predecessorRevisionId: null };
  }

  const root = selected.rows[0]!;
  if (expectedRoot.state !== "PRESENT" || expectedRoot.rootId !== root.material_root_id || activeRevisionId === null) return fail("CONFLICT");
  const head = await exactlyOne(
    client.query<HeadRow>(
      [
        "select material_revision_id, revision_number::text",
        "from investing.research_material_revisions",
        "where material_revision_id = $1 and material_root_id = $2 and material_kind = $3 and research_investigation_id = $4 for update",
      ].join(" "),
      [activeRevisionId, root.material_root_id, prepared.materialKind, context.researchInvestigationId],
    ),
    "CONFLICT",
  );
  if (head.ok === false) return head;
  if (expectedRoot.headRevisionId !== head.row.material_revision_id || expectedRoot.headRevisionNumber !== head.row.revision_number) return fail("CONFLICT");
  return {
    ok: true,
    root,
    nextRevisionNumber: String(BigInt(head.row.revision_number) + BigInt(1)),
    predecessorRevisionId: head.row.material_revision_id,
  };
}

async function insertRevision(
  client: InvestingAuthorityTransactionClient,
  input: CreateInput,
  prepared: PreparedInput,
  idempotencyRecordId: string,
  root: { root: RootRow; nextRevisionNumber: string; predecessorRevisionId: string | null },
  materialRevisionId: string,
): Promise<{ ok: true } | ResearchMaterialRevisionCreateFailure> {
  const inserted = await client.query(
    [
      "insert into investing.research_material_revisions (",
      "material_revision_id, material_root_id, research_investigation_id, tenant_id, account_id, principal_id, actor_kind, actor_id,",
      "tenant_membership_id, account_access_id, operation_scope, operation, capability, source_context, material_kind,",
      "revision_number, predecessor_revision_id, payload_schema_version, canonical_payload, material_hash, material_request_hash,",
      "idempotency_record_id, idempotency_key, correlation_id",
      ") values ($1, $2, $3, $4, $5, $6, 'USER_PRINCIPAL', $7, $8, $9, $10, $11, $12, $13, $14,",
      "$15::bigint, $16, $17, $18::jsonb, $19, $20, $21, $22, $23)",
    ].join(" "),
    [
      materialRevisionId,
      root.root.material_root_id,
      input.authorizedContext.researchInvestigationId,
      input.authorizedContext.tenantId,
      "accountId" in input.authorizedContext ? input.authorizedContext.accountId : null,
      input.authorizedContext.principalId,
      input.authorizedContext.actorId,
      input.authorizedContext.tenantMembershipId,
      "accountAccessId" in input.authorizedContext ? input.authorizedContext.accountAccessId : null,
      input.authorizedContext.operationScope,
      prepared.operation,
      capability,
      input.authorizedContext.sourceContext,
      prepared.materialKind,
      root.nextRevisionNumber,
      root.predecessorRevisionId,
      prepared.materialKind === "DRAFT" ? "RESEARCH_DRAFT_HASH_PAYLOAD_V1" : "HYPOTHESIS_HASH_PAYLOAD_V1",
      prepared.payloadJson,
      prepared.materialHash,
      prepared.materialRequestHash,
      idempotencyRecordId,
      prepared.idempotencyKey,
      prepared.correlationId,
    ],
  );
  return inserted.rowCount === 1 ? { ok: true } : fail("INTERNAL_ERROR");
}

async function updatePointerState(
  client: InvestingAuthorityTransactionClient,
  context: AuthorizedResearchMaterialRevisionCreateContext,
  previous: PointerRow,
  next: InvestigationPointersV1,
  nextVersion: string,
): Promise<{ ok: true } | ResearchMaterialRevisionCreateFailure> {
  const updated = await client.query(
    [
      "update investing.research_material_pointer_states",
      "set active_draft_revision_id = $2, active_hypothesis_revision_id = $3, active_spec_revision_id = null, active_experiment_id = null,",
      "pointer_version = $4::bigint, updated_at = transaction_timestamp(), updated_by_operation = $5",
      "where research_investigation_id = $1 and pointer_version = $6::bigint",
      "and active_draft_revision_id is not distinct from $7",
      "and active_hypothesis_revision_id is not distinct from $8",
      "and active_spec_revision_id is null and active_experiment_id is null",
    ].join(" "),
    [
      context.researchInvestigationId,
      next.activeDraft,
      next.activeHypothesis,
      nextVersion,
      context.operation,
      previous.pointer_version,
      previous.active_draft_revision_id,
      previous.active_hypothesis_revision_id,
    ],
  );
  return updated.rowCount === 1 ? { ok: true } : fail("CONFLICT");
}

async function findExistingIdempotency(
  client: InvestingAuthorityTransactionClient,
  context: AuthorizedResearchMaterialRevisionCreateContext,
  prepared: PreparedInput,
): Promise<{ ok: true; row: IdempotencyRow | null } | ResearchMaterialRevisionCreateFailure> {
  const accountPredicate = context.operationScope === "TENANT_SCOPE" ? "account_id is null" : "account_id = $5";
  const values =
    context.operationScope === "TENANT_SCOPE"
      ? [context.actorId, context.principalId, context.tenantId, prepared.operation, prepared.idempotencyKey]
      : [context.actorId, context.principalId, context.tenantId, prepared.operation, context.accountId, prepared.idempotencyKey];
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
  return idempotencyBelongsToContext(row, context, prepared)
    ? { ok: true, row }
    : fail("CONFLICT");
}

async function lockOrCreateIdempotency(
  client: InvestingAuthorityTransactionClient,
  context: AuthorizedResearchMaterialRevisionCreateContext,
  prepared: PreparedInput,
): Promise<{ ok: true; existing: boolean; row: IdempotencyRow } | ResearchMaterialRevisionCreateFailure> {
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
      prepared.operation,
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
  if (!created.row || created.row.idempotency_record_id !== candidateId || created.row.status !== "STARTED") return fail("INTERNAL_ERROR");
  return { ok: true, existing: false, row: created.row };
}

async function dispatchExistingIdempotency(
  client: InvestingAuthorityTransactionClient,
  context: AuthorizedResearchMaterialRevisionCreateContext,
  prepared: PreparedInput,
  row: IdempotencyRow,
): Promise<ResearchMaterialRevisionCreateResult> {
  if (!idempotencyBelongsToContext(row, context, prepared)) return fail("CONFLICT");
  if (row.material_request_hash !== prepared.materialRequestHash) return fail("CONFLICT");
  if (row.status === "STARTED") {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      const next = await findExistingIdempotency(client, context, prepared);
      if (next.ok === false) return next;
      if (next.row && next.row.status !== "STARTED") return dispatchExistingIdempotency(client, context, prepared, next.row);
    }
  }
  if (row.status !== "SUCCEEDED") return fail("INTERNAL_ERROR");
  const reference = parseReference(row.canonical_result_reference);
  if (!reference) return fail("INTERNAL_ERROR");
  const revision = await exactlyOne(
    client.query<RevisionRow>(
      [
        "select material_revision_id, material_root_id, material_kind, revision_number::text, material_hash, material_request_hash, idempotency_record_id, canonical_payload",
        "from investing.research_material_revisions",
        "where material_revision_id = $1 and research_investigation_id = $2 and tenant_id = $3",
        context.operationScope === "TENANT_SCOPE" ? "and account_id is null" : "and account_id = $4",
      ].join(" "),
      context.operationScope === "TENANT_SCOPE"
        ? [reference.materialRevisionId, context.researchInvestigationId, context.tenantId]
        : [reference.materialRevisionId, context.researchInvestigationId, context.tenantId, context.accountId],
    ),
    "INTERNAL_ERROR",
  );
  if (revision.ok === false) return revision;
  if (
    revision.row.material_request_hash !== prepared.materialRequestHash ||
    revision.row.material_hash !== prepared.materialHash ||
    revision.row.idempotency_record_id !== row.idempotency_record_id
  ) {
    return fail("INTERNAL_ERROR");
  }
  return { ok: true, replayed: true, idempotencyRecordId: row.idempotency_record_id, ...reference };
}

async function completeIdempotency(
  client: InvestingAuthorityTransactionClient,
  idempotencyRecordId: string,
  input: Omit<ResearchMaterialRevisionCreateSuccess, "ok" | "idempotencyRecordId">,
): Promise<ResearchMaterialRevisionCreateResult> {
  const reference = {
    researchInvestigationId: input.researchInvestigationId,
    materialKind: input.materialKind,
    materialRootId: input.materialRootId,
    materialRevisionId: input.materialRevisionId,
    materialRevisionNumber: input.materialRevisionNumber,
    materialHash: input.materialHash,
    materialRequestHash: input.materialRequestHash,
    pointerVersion: input.pointerVersion,
    pointers: input.pointers,
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

function expectedPointersMatch(row: PointerRow, expected: ExpectedResearchMaterialPointersV1) {
  return (
    row.pointer_version === expected.expectedActivePointerVersion &&
    row.active_draft_revision_id === expected.expectedResearchDraftRevisionId &&
    row.active_hypothesis_revision_id === expected.expectedHypothesisRevisionId &&
    row.active_spec_revision_id === expected.expectedResearchSpecRevisionId &&
    row.active_experiment_id === expected.expectedExperimentId
  );
}

function pointerToSemantic(row: PointerRow): InvestigationPointersV1 {
  const empty = emptyInvestigationPointersV1();
  return {
    ...empty,
    activeDraft: row.active_draft_revision_id,
    activeHypothesis: row.active_hypothesis_revision_id,
  };
}

async function withTransaction(
  connection: Promise<InvestingAuthorityTransactionClient>,
  work: (client: InvestingAuthorityTransactionClient) => Promise<ResearchMaterialRevisionCreateResult & { destroyClient?: boolean }>,
): Promise<ResearchMaterialRevisionCreateResult> {
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
        // Transaction already committed or failed closed.
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
  context: AuthorizedResearchMaterialRevisionCreateContext,
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
  await setTransactionConfig(client, "operation", context.operation);
  await setTransactionConfig(client, "capability", capability);
  await setTransactionConfig(client, "operation_scope", context.operationScope);
  await setTransactionConfig(client, "source_context", context.sourceContext);
  await setTransactionConfig(client, "correlation_id", prepared.correlationId);
  await setTransactionConfig(client, "idempotency_key", prepared.idempotencyKey);
  await setTransactionConfig(client, "material_request_hash", prepared.materialRequestHash);
  await setTransactionConfig(client, "research_investigation_id", context.researchInvestigationId);
}

async function setTransactionConfig(client: InvestingAuthorityTransactionClient, key: string, value: string) {
  await client.query("select set_config($1, $2, true)", [`syntrake.investing.${key}`, value]);
}

async function exactlyOne<Row>(
  query: Promise<{ rows: Row[] }>,
  emptyCode: ResearchMaterialRevisionCreateFailureCode,
): Promise<{ ok: true; row: Row } | ResearchMaterialRevisionCreateFailure> {
  const result = await query;
  if (result.rows.length === 0) return fail(emptyCode);
  if (result.rows.length > 1) return fail("INTERNAL_ERROR");
  return { ok: true, row: result.rows[0]! };
}

function idempotencyBelongsToContext(
  row: IdempotencyRow,
  context: AuthorizedResearchMaterialRevisionCreateContext,
  prepared: PreparedInput,
) {
  return (
    row.actor_kind === "USER_PRINCIPAL" &&
    row.actor_id === context.actorId &&
    row.principal_id === context.principalId &&
    row.tenant_id === context.tenantId &&
    row.operation_scope === context.operationScope &&
    row.operation === prepared.operation &&
    row.idempotency_key === prepared.idempotencyKey &&
    (context.operationScope === "TENANT_SCOPE" ? row.account_id === null : row.account_id === context.accountId)
  );
}

function parentMatchesContext(row: InvestigationRow, context: AuthorizedResearchMaterialRevisionCreateContext) {
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

function parseReference(value: unknown): Omit<ResearchMaterialRevisionCreateSuccess, "ok" | "replayed" | "idempotencyRecordId"> | null {
  if (!value || typeof value !== "object") return null;
  const reference = value as Partial<Omit<ResearchMaterialRevisionCreateSuccess, "ok" | "replayed" | "idempotencyRecordId">>;
  return typeof reference.materialRevisionId === "string" &&
    typeof reference.materialRootId === "string" &&
    typeof reference.researchInvestigationId === "string" &&
    typeof reference.materialRevisionNumber === "string" &&
    typeof reference.materialHash === "string" &&
    typeof reference.materialRequestHash === "string" &&
    typeof reference.pointerVersion === "string" &&
    (reference.materialKind === "DRAFT" || reference.materialKind === "HYPOTHESIS") &&
    typeof reference.pointers === "object" &&
    reference.pointers !== null
    ? reference as Omit<ResearchMaterialRevisionCreateSuccess, "ok" | "replayed" | "idempotencyRecordId">
    : null;
}

function validOpaque(value: string, min: number, max: number) {
  const bytes = Buffer.byteLength(value, "utf8");
  return bytes >= min && bytes <= max;
}

function fail(code: ResearchMaterialRevisionCreateFailureCode): ResearchMaterialRevisionCreateFailure {
  return { ok: false, code };
}
