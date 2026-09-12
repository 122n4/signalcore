import "server-only";

import { randomUUID } from "node:crypto";
import {
  isAuthorizedResearchMaterialRevisionCreateContext,
  type AuthorizedResearchMaterialRevisionCreateContext,
  type InvestingAuthorityTransactionClient,
} from "../authority/context";
import { getInvestingAuthorityDatabase } from "../authority/transport";
import {
  researchSpecRevisionCreateMaterialIdentityV1,
  type ExpectedResearchMaterialPointersV1,
  type ExpectedResearchMaterialRootV1,
  type ResearchMaterialScopeEvidenceV1,
} from "./materialRequest";
import {
  applyA3PointerEffectV1,
  canonicalResearchSpecCandidatePayloadV1,
  emptyInvestigationPointersV1,
  type InvestigationPointersV1,
  type ResearchSpecCandidateInputV1,
} from "./semantic";
import { hashRefV1 } from "./canonical";

const specOperation = "RESEARCH_SPEC_REVISION_CREATE_V1";
const capability = "RESEARCH_MUTATE";

export type CreateResearchSpecRevisionV1Input = Readonly<{
  authorizedContext: AuthorizedResearchMaterialRevisionCreateContext & { operation: typeof specOperation };
  expectedRoot: ExpectedResearchMaterialRootV1;
  expectedPointers: ExpectedResearchMaterialPointersV1;
  sourceDraftRevisionId: string;
  hypothesisRevisionId: string | null;
  spec: ResearchSpecCandidateInputV1;
  idempotencyKey: string;
  correlationId: string;
}>;

export type ResearchSpecRevisionCreateSuccess = Readonly<{
  ok: true;
  replayed: boolean;
  researchInvestigationId: string;
  materialRootId: string;
  researchSpecRevisionId: string;
  researchSpecRevisionNumber: string;
  sourceDraftRevisionId: string;
  sourceDraftMaterialHash: string;
  hypothesisRevisionId: string | null;
  hypothesisMaterialHash: string | null;
  materialRequestHash: string;
  pointerVersion: string;
  pointers: InvestigationPointersV1;
  idempotencyRecordId: string;
}>;

export type ResearchSpecRevisionCreateFailureCode =
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

export type ResearchSpecRevisionCreateFailure = Readonly<{
  ok: false;
  code: ResearchSpecRevisionCreateFailureCode;
}>;

export type ResearchSpecRevisionCreateResult =
  | ResearchSpecRevisionCreateSuccess
  | ResearchSpecRevisionCreateFailure;

type PreparedInput = {
  idempotencyKey: string;
  correlationId: string;
  canonicalCandidateJson: string;
  sourceDraftMaterialHash: string;
  hypothesisMaterialHash: string | null;
  materialRequestHash: string;
};

type IdempotencyRow = {
  idempotency_record_id: string;
  actor_kind: "USER_PRINCIPAL";
  actor_id: string;
  operation_scope: "TENANT_SCOPE" | "ACCOUNT_SCOPE";
  operation: typeof specOperation;
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
  material_kind: "RESEARCH_SPEC";
  research_investigation_id: string;
};

type HeadRow = {
  research_spec_revision_id: string;
  revision_number: string;
};

type MaterialRevisionProofRow = {
  material_revision_id: string;
  material_kind: "DRAFT" | "HYPOTHESIS";
  research_investigation_id: string;
  material_hash: string;
};

type SpecRevisionRow = {
  research_spec_revision_id: string;
  material_root_id: string;
  revision_number: string;
  source_draft_revision_id: string;
  source_draft_material_hash: string;
  hypothesis_revision_id: string | null;
  hypothesis_material_hash: string | null;
  material_request_hash: string;
  idempotency_record_id: string;
  canonical_candidate: unknown;
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
  "syntrake.investing.research_spec_revision_id",
] as const;

export async function createResearchSpecRevisionV1(
  input: CreateResearchSpecRevisionV1Input,
  env: Record<string, string | undefined> = process.env,
): Promise<ResearchSpecRevisionCreateResult> {
  if (!isAuthorizedResearchMaterialRevisionCreateContext(input.authorizedContext)) {
    return fail("VALIDATION_ERROR");
  }
  if (input.authorizedContext.operation !== specOperation) return fail("VALIDATION_ERROR");
  const prepared = prepareInput(input);
  if (!prepared) return fail("VALIDATION_ERROR");

  try {
    const database = getInvestingAuthorityDatabase(env);
    return await withTransaction(database.connect(), async (client) => {
      if (await hasStaleTransactionContext(client)) return { ...fail("INTERNAL_ERROR"), destroyClient: true };
      await setPreParentTransactionContext(client, input.authorizedContext);

      const parent = await selectParentBeforeAuthorityScope(client, input.authorizedContext);
      if (parent.ok === false) return parent;
      await setTransactionContext(client, input.authorizedContext, prepared);
      const authority = await revalidateAuthorityAndParent(client, input.authorizedContext, parent.row);
      if (authority.ok === false) return authority;

      const existing = await findExistingIdempotency(client, input.authorizedContext, prepared);
      if (existing.ok === false) return existing;
      if (existing.row) return dispatchExistingIdempotency(client, input.authorizedContext, prepared, existing.row);

      const idempotency = await lockOrCreateIdempotency(client, input.authorizedContext, prepared);
      if (idempotency.ok === false) return idempotency;
      if (idempotency.existing) return dispatchExistingIdempotency(client, input.authorizedContext, prepared, idempotency.row);

      const pointer = await lockOrCreatePointerState(client, input.authorizedContext);
      if (pointer.ok === false) return pointer;
      if (!expectedPointersMatch(pointer.row, input.expectedPointers)) return fail("CONFLICT");
      if (pointer.row.active_draft_revision_id === null || pointer.row.active_draft_revision_id !== input.sourceDraftRevisionId) {
        return fail("CONFLICT");
      }
      if (input.spec.hypothesisBinding.kind === "NO_HYPOTHESIS" && input.hypothesisRevisionId !== null) return fail("CONFLICT");
      if (input.spec.hypothesisBinding.kind === "EXPLICIT_HYPOTHESIS") {
        if (input.hypothesisRevisionId === null || pointer.row.active_hypothesis_revision_id !== input.hypothesisRevisionId) return fail("CONFLICT");
      }
      if (input.spec.hypothesisBinding.kind === "INFER_ACTIVE_HYPOTHESIS") return fail("VALIDATION_ERROR");

      const sourceDraft = await validateMaterialDependency(client, input.authorizedContext, input.sourceDraftRevisionId, "DRAFT", prepared.sourceDraftMaterialHash);
      if (sourceDraft.ok === false) return sourceDraft;
      if (input.hypothesisRevisionId !== null) {
        const hypothesis = await validateMaterialDependency(client, input.authorizedContext, input.hypothesisRevisionId, "HYPOTHESIS", prepared.hypothesisMaterialHash);
        if (hypothesis.ok === false) return hypothesis;
      }

      const root = await lockOrCreateSpecRoot(client, input.authorizedContext, input.expectedRoot, pointer.row);
      if (root.ok === false) return root;

      const researchSpecRevisionId = randomUUID();
      await setTransactionConfig(client, "material_root_id", root.root.material_root_id);
      await setTransactionConfig(client, "research_spec_revision_id", researchSpecRevisionId);

      const inserted = await insertSpecRevision(client, input, prepared, idempotency.row.idempotency_record_id, root, researchSpecRevisionId);
      if (inserted.ok === false) return inserted;

      const semanticPointer = await pointerToSemantic(client, input.authorizedContext, pointer.row);
      if (semanticPointer.ok === false) return semanticPointer;
      const nextPointers = applyA3PointerEffectV1({
        kind: "RESEARCH_SPEC_REVISION",
        predecessor: semanticPointer.pointers,
        newSpec: {
          id: researchSpecRevisionId,
          sourceDraft: input.sourceDraftRevisionId,
          hypothesis: input.hypothesisRevisionId,
        },
      });
      const nextVersion = String(BigInt(pointer.row.pointer_version) + BigInt(1));
      const advanced = await updatePointerState(client, input.authorizedContext, pointer.row, nextPointers, nextVersion);
      if (advanced.ok === false) return advanced;

      return completeIdempotency(client, idempotency.row.idempotency_record_id, {
        replayed: false,
        researchInvestigationId: input.authorizedContext.researchInvestigationId,
        materialRootId: root.root.material_root_id,
        researchSpecRevisionId,
        researchSpecRevisionNumber: root.nextRevisionNumber,
        sourceDraftRevisionId: input.sourceDraftRevisionId,
        sourceDraftMaterialHash: prepared.sourceDraftMaterialHash,
        hypothesisRevisionId: input.hypothesisRevisionId,
        hypothesisMaterialHash: prepared.hypothesisMaterialHash,
        materialRequestHash: prepared.materialRequestHash,
        pointerVersion: nextVersion,
        pointers: nextPointers,
      });
    });
  } catch {
    return fail("UNAVAILABLE");
  }
}

function prepareInput(input: CreateResearchSpecRevisionV1Input): PreparedInput | null {
  if (!validOpaque(input.idempotencyKey, 16, 512) || !validOpaque(input.correlationId, 16, 512)) return null;
  try {
    const sourceDraft = hashRefV1(input.spec.sourceDraft.ref);
    if (sourceDraft.hashDomain !== "SYNTRAKE:RESEARCH_DRAFT:V1") return null;
    let hypothesisMaterialHash: string | null = null;
    if (input.spec.hypothesisBinding.kind === "EXPLICIT_HYPOTHESIS") {
      const hypothesis = hashRefV1(input.spec.hypothesisBinding.hypothesis.ref);
      if (hypothesis.hashDomain !== "SYNTRAKE:HYPOTHESIS:V1") return null;
      hypothesisMaterialHash = hypothesis.hashHex;
    } else if (input.spec.hypothesisBinding.kind === "INFER_ACTIVE_HYPOTHESIS") {
      return null;
    }
    const canonicalCandidateJson = JSON.stringify(canonicalResearchSpecCandidatePayloadV1(input.spec));
    const identity = researchSpecRevisionCreateMaterialIdentityV1(scopeEvidence(input.authorizedContext), {
      operation: specOperation,
      idempotencyKey: input.idempotencyKey,
      correlationId: input.correlationId,
      investigationId: input.authorizedContext.researchInvestigationId,
      expectedPointers: input.expectedPointers,
      expectedRoot: input.expectedRoot,
      sourceDraftRevisionId: input.sourceDraftRevisionId,
      hypothesisRevisionId: input.hypothesisRevisionId,
      content: input.spec,
    });
    return {
      idempotencyKey: input.idempotencyKey,
      correlationId: input.correlationId,
      canonicalCandidateJson,
      sourceDraftMaterialHash: sourceDraft.hashHex,
      hypothesisMaterialHash,
      materialRequestHash: identity.materialRequestHash,
    };
  } catch {
    return null;
  }
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

async function lockOrCreatePointerState(
  client: InvestingAuthorityTransactionClient,
  context: AuthorizedResearchMaterialRevisionCreateContext,
): Promise<{ ok: true; row: PointerRow } | ResearchSpecRevisionCreateFailure> {
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
  if (selected.rows.length !== 1) return fail("CONFLICT");
  if (selected.rows[0]!.active_experiment_id !== null) return fail("CONFLICT");
  return { ok: true, row: selected.rows[0]! };
}

async function validateMaterialDependency(
  client: InvestingAuthorityTransactionClient,
  context: AuthorizedResearchMaterialRevisionCreateContext,
  revisionId: string,
  kind: "DRAFT" | "HYPOTHESIS",
  materialHash: string | null,
): Promise<{ ok: true } | ResearchSpecRevisionCreateFailure> {
  if (materialHash === null) return fail("CONFLICT");
  const selected = await client.query<MaterialRevisionProofRow>(
    [
      "select material_revision_id, material_kind, research_investigation_id, material_hash",
      "from investing.research_material_revisions",
      "where material_revision_id = $1 and material_kind = $2 and research_investigation_id = $3 and material_hash = $4",
      context.operationScope === "TENANT_SCOPE" ? "and account_id is null" : "and account_id = $5",
    ].join(" "),
    context.operationScope === "TENANT_SCOPE"
      ? [revisionId, kind, context.researchInvestigationId, materialHash]
      : [revisionId, kind, context.researchInvestigationId, materialHash, context.accountId],
  );
  return selected.rows.length === 1 ? { ok: true } : fail("CONFLICT");
}

async function lockOrCreateSpecRoot(
  client: InvestingAuthorityTransactionClient,
  context: AuthorizedResearchMaterialRevisionCreateContext,
  expectedRoot: ExpectedResearchMaterialRootV1,
  pointer: PointerRow,
): Promise<{ ok: true; root: RootRow; nextRevisionNumber: string; predecessorRevisionId: string | null } | ResearchSpecRevisionCreateFailure> {
  const selected = await client.query<RootRow>(
    [
      "select material_root_id, material_kind, research_investigation_id",
      "from investing.research_material_roots",
      "where research_investigation_id = $1 and material_kind = 'RESEARCH_SPEC'",
    ].join(" "),
    [context.researchInvestigationId],
  );
  if (selected.rows.length > 1) return fail("INTERNAL_ERROR");
  if (selected.rows.length === 0) {
    if (expectedRoot.state !== "ABSENT" || pointer.active_spec_revision_id !== null) return fail("CONFLICT");
    const materialRootId = randomUUID();
    await setTransactionConfig(client, "material_root_id", materialRootId);
    const inserted = await client.query(
      [
        "insert into investing.research_material_roots (",
        "material_root_id, research_investigation_id, tenant_id, account_id, principal_id, actor_kind, actor_id,",
        "tenant_membership_id, account_access_id, operation_scope, source_context, material_kind, created_by_operation",
        ") values ($1, $2, $3, $4, $5, 'USER_PRINCIPAL', $6, $7, $8, $9, $10, 'RESEARCH_SPEC', $11)",
        "on conflict (research_investigation_id, material_kind) do nothing",
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
        specOperation,
      ],
    );
    if (inserted.rowCount !== 1) return fail("CONFLICT");
    return { ok: true, root: { material_root_id: materialRootId, material_kind: "RESEARCH_SPEC", research_investigation_id: context.researchInvestigationId }, nextRevisionNumber: "1", predecessorRevisionId: null };
  }

  const root = selected.rows[0]!;
  if (expectedRoot.state !== "PRESENT" || expectedRoot.rootId !== root.material_root_id) return fail("CONFLICT");
  await setTransactionConfig(client, "material_root_id", root.material_root_id);
  const actualHead = await exactlyOne(
    client.query<HeadRow>(
      [
        "select research_spec_revision_id, revision_number::text",
        "from investing.research_spec_revisions",
        "where material_root_id = $1 and research_investigation_id = $2",
        "order by revision_number desc, research_spec_revision_id desc",
        "limit 1",
      ].join(" "),
      [root.material_root_id, context.researchInvestigationId],
    ),
    "CONFLICT",
  );
  if (actualHead.ok === false) return actualHead;
  if (
    expectedRoot.headRevisionId !== actualHead.row.research_spec_revision_id ||
    expectedRoot.headRevisionNumber !== actualHead.row.revision_number
  ) {
    return fail("CONFLICT");
  }
  return {
    ok: true,
    root,
    nextRevisionNumber: String(BigInt(actualHead.row.revision_number) + BigInt(1)),
    predecessorRevisionId: actualHead.row.research_spec_revision_id,
  };
}

async function insertSpecRevision(
  client: InvestingAuthorityTransactionClient,
  input: CreateResearchSpecRevisionV1Input,
  prepared: PreparedInput,
  idempotencyRecordId: string,
  root: { root: RootRow; nextRevisionNumber: string; predecessorRevisionId: string | null },
  researchSpecRevisionId: string,
): Promise<{ ok: true } | ResearchSpecRevisionCreateFailure> {
  const inserted = await client.query(
    [
      "insert into investing.research_spec_revisions (",
      "research_spec_revision_id, material_root_id, research_investigation_id, tenant_id, account_id, principal_id, actor_kind, actor_id,",
      "tenant_membership_id, account_access_id, operation_scope, source_context, operation, capability, revision_number, predecessor_revision_id,",
      "source_draft_revision_id, source_draft_material_hash, hypothesis_revision_id, hypothesis_material_hash, candidate_schema_version, candidate_status,",
      "canonical_candidate, material_request_hash, idempotency_record_id, idempotency_key, correlation_id",
      ") values ($1, $2, $3, $4, $5, $6, 'USER_PRINCIPAL', $7, $8, $9, $10, $11, $12, $13, $14::bigint, $15,",
      "$16, $17, $18, $19, 'RESEARCH_SPEC_CANDIDATE_V1', 'CANDIDATE_ONLY', $20::jsonb, $21, $22, $23, $24)",
    ].join(" "),
    [
      researchSpecRevisionId,
      root.root.material_root_id,
      input.authorizedContext.researchInvestigationId,
      input.authorizedContext.tenantId,
      "accountId" in input.authorizedContext ? input.authorizedContext.accountId : null,
      input.authorizedContext.principalId,
      input.authorizedContext.actorId,
      input.authorizedContext.tenantMembershipId,
      "accountAccessId" in input.authorizedContext ? input.authorizedContext.accountAccessId : null,
      input.authorizedContext.operationScope,
      input.authorizedContext.sourceContext,
      specOperation,
      capability,
      root.nextRevisionNumber,
      root.predecessorRevisionId,
      input.sourceDraftRevisionId,
      prepared.sourceDraftMaterialHash,
      input.hypothesisRevisionId,
      prepared.hypothesisMaterialHash,
      prepared.canonicalCandidateJson,
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
): Promise<{ ok: true } | ResearchSpecRevisionCreateFailure> {
  const updated = await client.query(
    [
      "update investing.research_material_pointer_states",
      "set active_spec_revision_id = $2, pointer_version = $3::bigint, updated_at = transaction_timestamp(), updated_by_operation = $4",
      "where research_investigation_id = $1 and pointer_version = $5::bigint",
      "and active_draft_revision_id is not distinct from $6",
      "and active_hypothesis_revision_id is not distinct from $7",
      "and active_spec_revision_id is not distinct from $8",
      "and active_experiment_id is null",
    ].join(" "),
    [
      context.researchInvestigationId,
      next.activeSpec?.id ?? null,
      nextVersion,
      specOperation,
      previous.pointer_version,
      previous.active_draft_revision_id,
      previous.active_hypothesis_revision_id,
      previous.active_spec_revision_id,
    ],
  );
  return updated.rowCount === 1 ? { ok: true } : fail("CONFLICT");
}

async function pointerToSemantic(
  client: InvestingAuthorityTransactionClient,
  context: AuthorizedResearchMaterialRevisionCreateContext,
  row: PointerRow,
): Promise<{ ok: true; pointers: InvestigationPointersV1 } | ResearchSpecRevisionCreateFailure> {
  const empty = emptyInvestigationPointersV1();
  if (row.active_spec_revision_id === null) {
    return { ok: true, pointers: { ...empty, activeDraft: row.active_draft_revision_id, activeHypothesis: row.active_hypothesis_revision_id } };
  }
  const selected = await client.query<SpecRevisionRow>(
    [
      "select research_spec_revision_id, source_draft_revision_id, hypothesis_revision_id",
      "from investing.research_spec_revisions",
      "where research_spec_revision_id = $1 and research_investigation_id = $2 and tenant_id = $3",
      context.operationScope === "TENANT_SCOPE" ? "and account_id is null" : "and account_id = $4",
    ].join(" "),
    context.operationScope === "TENANT_SCOPE"
      ? [row.active_spec_revision_id, context.researchInvestigationId, context.tenantId]
      : [row.active_spec_revision_id, context.researchInvestigationId, context.tenantId, context.accountId],
  );
  if (selected.rows.length !== 1) return fail("INTERNAL_ERROR");
  const spec = selected.rows[0]!;
  return {
    ok: true,
    pointers: {
      ...empty,
      activeDraft: row.active_draft_revision_id,
      activeHypothesis: row.active_hypothesis_revision_id,
      activeSpec: {
        id: spec.research_spec_revision_id,
        sourceDraft: spec.source_draft_revision_id,
        hypothesis: spec.hypothesis_revision_id,
      },
    },
  };
}

async function findExistingIdempotency(
  client: InvestingAuthorityTransactionClient,
  context: AuthorizedResearchMaterialRevisionCreateContext,
  prepared: PreparedInput,
): Promise<{ ok: true; row: IdempotencyRow | null } | ResearchSpecRevisionCreateFailure> {
  const accountPredicate = context.operationScope === "TENANT_SCOPE" ? "account_id is null" : "account_id = $5";
  const values =
    context.operationScope === "TENANT_SCOPE"
      ? [context.actorId, context.principalId, context.tenantId, specOperation, prepared.idempotencyKey]
      : [context.actorId, context.principalId, context.tenantId, specOperation, context.accountId, prepared.idempotencyKey];
  const selected = await client.query<IdempotencyRow>(
    [
      "select idempotency_record_id, actor_kind, actor_id, operation_scope, operation, principal_id, tenant_id, account_id,",
      "idempotency_key, material_request_hash, status, canonical_result_reference",
      "from investing.idempotency_records",
      "where actor_kind = 'USER_PRINCIPAL' and actor_id = $1 and principal_id = $2",
      `and tenant_id = $3 and operation_scope = '${context.operationScope}' and operation = $4 and ${accountPredicate}`,
      `and idempotency_key = $${context.operationScope === "TENANT_SCOPE" ? 5 : 6}`,
    ].join(" "),
    values,
  );
  if (selected.rows.length > 1) return fail("INTERNAL_ERROR");
  if (selected.rows.length === 0) return { ok: true, row: null };
  const row = selected.rows[0]!;
  await setTransactionConfig(client, "idempotency_record_id", row.idempotency_record_id);
  return idempotencyBelongsToContext(row, context, prepared) ? { ok: true, row } : fail("CONFLICT");
}

async function lockOrCreateIdempotency(
  client: InvestingAuthorityTransactionClient,
  context: AuthorizedResearchMaterialRevisionCreateContext,
  prepared: PreparedInput,
): Promise<{ ok: true; existing: boolean; row: IdempotencyRow } | ResearchSpecRevisionCreateFailure> {
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
      specOperation,
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
): Promise<ResearchSpecRevisionCreateResult> {
  if (!idempotencyBelongsToContext(row, context, prepared)) return fail("CONFLICT");
  if (row.material_request_hash !== prepared.materialRequestHash) return fail("CONFLICT");
  if (row.status === "STARTED") return fail("CONFLICT");
  if (row.status !== "SUCCEEDED") return fail("INTERNAL_ERROR");
  const reference = parseReference(row.canonical_result_reference);
  if (!reference) return fail("INTERNAL_ERROR");
  const revision = await exactlyOne(
    client.query<SpecRevisionRow>(
      [
        "select research_spec_revision_id, material_root_id, revision_number::text, source_draft_revision_id, source_draft_material_hash,",
        "hypothesis_revision_id, hypothesis_material_hash, material_request_hash, idempotency_record_id, canonical_candidate",
        "from investing.research_spec_revisions",
        "where research_spec_revision_id = $1 and research_investigation_id = $2 and tenant_id = $3",
        context.operationScope === "TENANT_SCOPE" ? "and account_id is null" : "and account_id = $4",
      ].join(" "),
      context.operationScope === "TENANT_SCOPE"
        ? [reference.researchSpecRevisionId, context.researchInvestigationId, context.tenantId]
        : [reference.researchSpecRevisionId, context.researchInvestigationId, context.tenantId, context.accountId],
    ),
    "INTERNAL_ERROR",
  );
  if (revision.ok === false) return revision;
  if (
    revision.row.material_request_hash !== prepared.materialRequestHash ||
    revision.row.idempotency_record_id !== row.idempotency_record_id
  ) {
    return fail("INTERNAL_ERROR");
  }
  return { ok: true, replayed: true, idempotencyRecordId: row.idempotency_record_id, ...reference };
}

async function completeIdempotency(
  client: InvestingAuthorityTransactionClient,
  idempotencyRecordId: string,
  input: Omit<ResearchSpecRevisionCreateSuccess, "ok" | "idempotencyRecordId">,
): Promise<ResearchSpecRevisionCreateResult> {
  const updated = await client.query(
    [
      "update investing.idempotency_records",
      "set status = 'SUCCEEDED', canonical_result_reference = $2::jsonb, error_code = null,",
      "updated_at = transaction_timestamp(), completed_at = transaction_timestamp()",
      "where idempotency_record_id = $1 and status = 'STARTED'",
    ].join(" "),
    [idempotencyRecordId, JSON.stringify(input)],
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

async function withTransaction(
  connection: Promise<InvestingAuthorityTransactionClient>,
  work: (client: InvestingAuthorityTransactionClient) => Promise<ResearchSpecRevisionCreateResult & { destroyClient?: boolean }>,
): Promise<ResearchSpecRevisionCreateResult> {
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

async function setPreParentTransactionContext(
  client: InvestingAuthorityTransactionClient,
  context: AuthorizedResearchMaterialRevisionCreateContext,
) {
  await setTransactionConfig(client, "actor_kind", "USER_PRINCIPAL");
  await setTransactionConfig(client, "actor_id", context.actorId);
  await setTransactionConfig(client, "external_provider", "CLERK");
  await setTransactionConfig(client, "external_subject", context.actorId);
  await setTransactionConfig(client, "principal_id", context.principalId);
  await setTransactionConfig(client, "operation", specOperation);
  await setTransactionConfig(client, "capability", capability);
  await setTransactionConfig(client, "research_investigation_id", context.researchInvestigationId);
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
  await setTransactionConfig(client, "operation", specOperation);
  await setTransactionConfig(client, "capability", capability);
  await setTransactionConfig(client, "operation_scope", context.operationScope);
  await setTransactionConfig(client, "source_context", context.sourceContext);
  await setTransactionConfig(client, "correlation_id", prepared.correlationId);
  await setTransactionConfig(client, "idempotency_key", prepared.idempotencyKey);
  await setTransactionConfig(client, "material_request_hash", prepared.materialRequestHash);
  await setTransactionConfig(client, "research_investigation_id", context.researchInvestigationId);
}

async function selectParentBeforeAuthorityScope(
  client: InvestingAuthorityTransactionClient,
  context: AuthorizedResearchMaterialRevisionCreateContext,
): Promise<{ ok: true; row: InvestigationRow } | ResearchSpecRevisionCreateFailure> {
  const parent = await exactlyOne(
    client.query<InvestigationRow>(
      [
        "select research_investigation_id, tenant_id, account_id, principal_id, actor_kind, actor_id,",
        "tenant_membership_id, account_access_id, operation_scope, source_context",
        "from investing.research_investigations",
        "where research_investigation_id = $1 and principal_id = $2 and actor_kind = 'USER_PRINCIPAL' and actor_id = $3",
      ].join(" "),
      [context.researchInvestigationId, context.principalId, context.actorId],
    ),
    "FORBIDDEN_OR_NOT_FOUND",
  );
  if (parent.ok === false) return parent;
  return parentMatchesContext(parent.row, context) ? parent : fail("FORBIDDEN_OR_NOT_FOUND");
}

async function revalidateAuthorityAndParent(
  client: InvestingAuthorityTransactionClient,
  context: AuthorizedResearchMaterialRevisionCreateContext,
  parent: InvestigationRow,
): Promise<{ ok: true } | ResearchSpecRevisionCreateFailure> {
  if (!parentMatchesContext(parent, context)) return fail("FORBIDDEN_OR_NOT_FOUND");

  const principal = await exactlyOne(
    client.query<PrincipalRow>(
      "select principal_id, state from investing.principals where principal_id = $1 and external_provider = 'CLERK' and external_subject = $2",
      [context.principalId, context.actorId],
    ),
    "FORBIDDEN_OR_NOT_FOUND",
  );
  if (principal.ok === false) return principal;
  if (principal.row.state !== "ACTIVE") return fail("PRINCIPAL_DISABLED");

  const tenant = await exactlyOne(
    client.query<TenantRow>("select tenant_id, state from investing.tenants where tenant_id = $1", [context.tenantId]),
    "FORBIDDEN_OR_NOT_FOUND",
  );
  if (tenant.ok === false) return tenant;
  if (tenant.row.state !== "ACTIVE") return fail("TENANT_INACTIVE");

  const membership = await exactlyOne(
    client.query<MembershipRow>(
      [
        "select tenant_membership_id, tenant_id, principal_id, state",
        "from investing.tenant_memberships",
        "where tenant_membership_id = $1 and tenant_id = $2 and principal_id = $3 and role = 'OWNER'",
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
        "select account_id, tenant_id, state from investing.accounts where account_id = $1 and tenant_id = $2",
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
          "and tenant_membership_id = $4 and principal_id = $5 and role = 'OWNER'",
        ].join(" "),
        [context.accountAccessId, context.accountId, context.tenantId, context.tenantMembershipId, context.principalId],
      ),
      "ACCESS_INACTIVE",
    );
    if (access.ok === false) return access;
    if (access.row.state !== "ACTIVE") return fail("ACCESS_INACTIVE");
  }

  return { ok: true };
}

async function setTransactionConfig(client: InvestingAuthorityTransactionClient, key: string, value: string) {
  await client.query("select set_config($1, $2, true)", [`syntrake.investing.${key}`, value]);
}

async function exactlyOne<Row>(
  query: Promise<{ rows: Row[] }>,
  emptyCode: ResearchSpecRevisionCreateFailureCode,
): Promise<{ ok: true; row: Row } | ResearchSpecRevisionCreateFailure> {
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
    row.operation === specOperation &&
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

function parseReference(value: unknown): Omit<ResearchSpecRevisionCreateSuccess, "ok" | "replayed" | "idempotencyRecordId"> | null {
  if (!value || typeof value !== "object") return null;
  const reference = value as Partial<Omit<ResearchSpecRevisionCreateSuccess, "ok" | "replayed" | "idempotencyRecordId">>;
  return typeof reference.researchSpecRevisionId === "string" &&
    typeof reference.materialRootId === "string" &&
    typeof reference.researchInvestigationId === "string" &&
    typeof reference.researchSpecRevisionNumber === "string" &&
    typeof reference.sourceDraftRevisionId === "string" &&
    typeof reference.sourceDraftMaterialHash === "string" &&
    (typeof reference.hypothesisRevisionId === "string" || reference.hypothesisRevisionId === null) &&
    (typeof reference.hypothesisMaterialHash === "string" || reference.hypothesisMaterialHash === null) &&
    typeof reference.materialRequestHash === "string" &&
    typeof reference.pointerVersion === "string" &&
    typeof reference.pointers === "object" &&
    reference.pointers !== null
    ? reference as Omit<ResearchSpecRevisionCreateSuccess, "ok" | "replayed" | "idempotencyRecordId">
    : null;
}

function validOpaque(value: string, min: number, max: number) {
  const bytes = Buffer.byteLength(value, "utf8");
  return bytes >= min && bytes <= max;
}

function fail(code: ResearchSpecRevisionCreateFailureCode): ResearchSpecRevisionCreateFailure {
  return { ok: false, code };
}
