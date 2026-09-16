import "server-only";

import { randomUUID } from "node:crypto";
import {
  isAuthorizedResearchMaterialRevisionCreateContext,
  type AuthorizedResearchMaterialRevisionCreateContext,
  type InvestingAuthorityTransactionClient,
} from "../authority/context";
import { getInvestingAuthorityDatabase } from "../authority/transport";
import { hashRefV1 } from "./canonical";
import { admitExperimentVariantV1, type AdmittedExperimentVariantV1, type ExperimentVariantCandidateV1 } from "./experiment";
import {
  experimentVariantCreateMaterialIdentityV1,
  type ExpectedResearchMaterialPointersV1,
  type ResearchMaterialScopeEvidenceV1,
} from "./materialRequest";

const operation = "RESEARCH_EXPERIMENT_VARIANT_CREATE_V1";
const capability = "RESEARCH_MUTATE";

export type CreateExperimentVariantV1Input = Readonly<{
  authorizedContext: AuthorizedResearchMaterialRevisionCreateContext & { operation: typeof operation };
  expectedPointers: ExpectedResearchMaterialPointersV1 & {
    expectedResearchSpecRevisionId: string;
    expectedExperimentId: string;
  };
  experiment: ExperimentVariantCandidateV1;
  idempotencyKey: string;
  correlationId: string;
}>;

export type ExperimentVariantCreateSuccess = Readonly<{
  ok: true;
  replayed: boolean;
  researchInvestigationId: string;
  researchExperimentId: string;
  parentExperimentId: string;
  researchSpecRevisionId: string;
  relation: "VARIANT";
  researchIrHashHex: string;
  materialRequestHash: string;
  pointerVersion: string;
  idempotencyRecordId: string;
}>;

export type ExperimentVariantCreateFailureCode =
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

export type ExperimentVariantCreateFailure = Readonly<{ ok: false; code: ExperimentVariantCreateFailureCode }>;
export type ExperimentVariantCreateResult = ExperimentVariantCreateSuccess | ExperimentVariantCreateFailure;

type PreparedInput = {
  idempotencyKey: string;
  correlationId: string;
  admitted: AdmittedExperimentVariantV1;
  materialRequestHash: string;
  expectedExperimentId: string;
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

type PointerRow = {
  research_investigation_id: string;
  active_draft_revision_id: string | null;
  active_hypothesis_revision_id: string | null;
  active_spec_revision_id: string | null;
  active_experiment_id: string | null;
  pointer_version: string;
};

type SpecRow = {
  research_spec_revision_id: string;
  research_investigation_id: string;
};

type PrincipalRow = { principal_id: string; state: "ACTIVE" | "DISABLED" };
type TenantRow = { tenant_id: string; state: "ACTIVE" | "SUSPENDED" | "CLOSED" };
type AccountRow = { account_id: string; tenant_id: string; state: "ACTIVE" | "FROZEN" | "CLOSED" };
type MembershipRow = { tenant_membership_id: string; tenant_id: string; principal_id: string; state: "ACTIVE" | "REVOKED" };
type AccessRow = {
  account_access_id: string;
  account_id: string;
  tenant_id: string;
  tenant_membership_id: string;
  principal_id: string;
  state: "ACTIVE" | "REVOKED";
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

type ExperimentRow = {
  research_experiment_id: string;
  research_investigation_id: string;
  research_spec_revision_id: string;
  relation: "BASELINE" | "VARIANT";
  parent_experiment_id: string | null;
  research_ir_hash_algorithm: string;
  research_ir_hash_domain: string;
  research_ir_hash_version: string;
  research_ir_hash_hex: string;
  material_request_hash: string;
  idempotency_record_id: string;
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
  "syntrake.investing.research_spec_revision_id",
  "syntrake.investing.research_ir_hash_hex",
  "syntrake.investing.expected_experiment_id",
  "syntrake.investing.parent_experiment_id",
  "syntrake.investing.research_experiment_id",
  "syntrake.investing.next_experiment_id",
] as const;

export async function createExperimentVariantV1(
  input: CreateExperimentVariantV1Input,
  env: Record<string, string | undefined> = process.env,
): Promise<ExperimentVariantCreateResult> {
  if (!isAuthorizedResearchMaterialRevisionCreateContext(input.authorizedContext)) return fail("VALIDATION_ERROR");
  if (input.authorizedContext.operation !== operation) return fail("VALIDATION_ERROR");
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

      const pointer = await lockPointerState(client, input.authorizedContext);
      if (pointer.ok === false) return pointer;
      if (!expectedPointersMatch(pointer.row, input.expectedPointers)) return fail("CONFLICT");
      if (pointer.row.active_spec_revision_id === null) return fail("CONFLICT");
      if (pointer.row.active_spec_revision_id !== prepared.admitted.researchSpecRevisionId) return fail("CONFLICT");
      if (input.expectedPointers.expectedResearchSpecRevisionId !== pointer.row.active_spec_revision_id) return fail("CONFLICT");
      if (pointer.row.active_experiment_id === null) return fail("CONFLICT");
      if (pointer.row.active_experiment_id !== input.expectedPointers.expectedExperimentId) return fail("CONFLICT");

      const spec = await validateSpecLineage(client, input.authorizedContext, prepared.admitted.researchSpecRevisionId);
      if (spec.ok === false) return spec;
      const parentExperiment = await validateParentExperimentLineage(client, input.authorizedContext, prepared);
      if (parentExperiment.ok === false) return parentExperiment;

      const researchExperimentId = randomUUID();
      await setTransactionConfig(client, "research_experiment_id", researchExperimentId);
      await setTransactionConfig(client, "next_experiment_id", researchExperimentId);
      await insertExperiment(client, input.authorizedContext, prepared, idempotency.row.idempotency_record_id, researchExperimentId);
      const nextVersion = String(BigInt(pointer.row.pointer_version) + BigInt(1));
      const advanced = await updatePointerState(client, input.authorizedContext, pointer.row, researchExperimentId, nextVersion);
      if (advanced.ok === false) return advanced;

      return completeIdempotency(client, idempotency.row.idempotency_record_id, {
        replayed: false,
        researchInvestigationId: input.authorizedContext.researchInvestigationId,
        researchExperimentId,
        parentExperimentId: prepared.admitted.parentExperimentId,
        researchSpecRevisionId: prepared.admitted.researchSpecRevisionId,
        relation: "VARIANT",
        researchIrHashHex: prepared.admitted.researchIr.hashHex,
        materialRequestHash: prepared.materialRequestHash,
        pointerVersion: nextVersion,
      });
    });
  } catch {
    return fail("UNAVAILABLE");
  }
}

function prepareInput(input: CreateExperimentVariantV1Input): PreparedInput | null {
  if (!validOpaque(input.idempotencyKey, 16, 512) || !validOpaque(input.correlationId, 16, 512)) return null;
  try {
    const admitted = admitExperimentVariantV1(input.experiment);
    const ir = hashRefV1(admitted.researchIr);
    if (ir.hashDomain !== "SYNTRAKE:RESEARCH_IR:V1") return null;
    const identity = experimentVariantCreateMaterialIdentityV1(scopeEvidence(input.authorizedContext), {
      operation,
      idempotencyKey: input.idempotencyKey,
      correlationId: input.correlationId,
      investigationId: input.authorizedContext.researchInvestigationId,
      expectedPointers: input.expectedPointers,
      experiment: input.experiment,
    });
    return {
      idempotencyKey: input.idempotencyKey,
      correlationId: input.correlationId,
      admitted,
      materialRequestHash: identity.materialRequestHash,
      expectedExperimentId: input.expectedPointers.expectedExperimentId,
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

async function lockPointerState(
  client: InvestingAuthorityTransactionClient,
  context: AuthorizedResearchMaterialRevisionCreateContext,
): Promise<{ ok: true; row: PointerRow } | ExperimentVariantCreateFailure> {
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
  return { ok: true, row: selected.rows[0]! };
}

async function validateSpecLineage(
  client: InvestingAuthorityTransactionClient,
  context: AuthorizedResearchMaterialRevisionCreateContext,
  researchSpecRevisionId: string,
): Promise<{ ok: true; row: SpecRow } | ExperimentVariantCreateFailure> {
  return exactlyOne(
    client.query<SpecRow>(
      [
        "select research_spec_revision_id, research_investigation_id",
        "from investing.research_spec_revisions",
        "where research_spec_revision_id = $1 and research_investigation_id = $2 and tenant_id = $3",
        context.operationScope === "TENANT_SCOPE" ? "and account_id is null" : "and account_id = $4",
      ].join(" "),
      context.operationScope === "TENANT_SCOPE"
        ? [researchSpecRevisionId, context.researchInvestigationId, context.tenantId]
        : [researchSpecRevisionId, context.researchInvestigationId, context.tenantId, context.accountId],
    ),
    "CONFLICT",
  );
}

async function validateParentExperimentLineage(
  client: InvestingAuthorityTransactionClient,
  context: AuthorizedResearchMaterialRevisionCreateContext,
  prepared: PreparedInput,
): Promise<{ ok: true; row: ExperimentRow } | ExperimentVariantCreateFailure> {
  const ir = prepared.admitted.researchIr;
  const selected = await exactlyOne(
    client.query<ExperimentRow>(
      [
        "select research_experiment_id, research_investigation_id, research_spec_revision_id, relation, parent_experiment_id,",
        "research_ir_hash_algorithm, research_ir_hash_domain, research_ir_hash_version, research_ir_hash_hex,",
        "material_request_hash, idempotency_record_id",
        "from investing.research_experiments",
        "where research_experiment_id = $1 and research_investigation_id = $2 and tenant_id = $3",
        "and research_spec_revision_id = $4 and research_ir_hash_algorithm = $5 and research_ir_hash_domain = $6",
        "and research_ir_hash_version = $7 and research_ir_hash_hex = $8 and relation in ('BASELINE', 'VARIANT')",
        context.operationScope === "TENANT_SCOPE" ? "and account_id is null" : "and account_id = $9",
      ].join(" "),
      context.operationScope === "TENANT_SCOPE"
        ? [
            prepared.admitted.parentExperimentId,
            context.researchInvestigationId,
            context.tenantId,
            prepared.admitted.researchSpecRevisionId,
            ir.hashAlgorithm,
            ir.hashDomain,
            ir.hashVersion,
            ir.hashHex,
          ]
        : [
            prepared.admitted.parentExperimentId,
            context.researchInvestigationId,
            context.tenantId,
            prepared.admitted.researchSpecRevisionId,
            ir.hashAlgorithm,
            ir.hashDomain,
            ir.hashVersion,
            ir.hashHex,
            context.accountId,
          ],
    ),
    "CONFLICT",
  );
  if (selected.ok === false) return selected;
  return { ok: true, row: selected.row };
}

async function insertExperiment(
  client: InvestingAuthorityTransactionClient,
  context: AuthorizedResearchMaterialRevisionCreateContext,
  prepared: PreparedInput,
  idempotencyRecordId: string,
  researchExperimentId: string,
): Promise<void> {
  const ir = prepared.admitted.researchIr;
  await client.query(
    [
      "insert into investing.research_experiments (",
      "research_experiment_id, research_investigation_id, tenant_id, account_id, principal_id, actor_kind, actor_id,",
      "tenant_membership_id, account_access_id, operation_scope, source_context, operation, capability, relation,",
      "parent_experiment_id, research_spec_revision_id, research_ir_hash_algorithm, research_ir_hash_domain, research_ir_hash_version, research_ir_hash_hex,",
      "material_request_hash, idempotency_record_id, idempotency_key, correlation_id",
      ") values ($1, $2, $3, $4, $5, 'USER_PRINCIPAL', $6, $7, $8, $9, $10, $11, $12, 'VARIANT', $13, $14,",
      "$15, $16, $17, $18, $19, $20, $21, $22)",
    ].join(" "),
    [
      researchExperimentId,
      context.researchInvestigationId,
      context.tenantId,
      "accountId" in context ? context.accountId : null,
      context.principalId,
      context.actorId,
      context.tenantMembershipId,
      "accountAccessId" in context ? context.accountAccessId : null,
      context.operationScope,
      context.sourceContext,
      operation,
      capability,
      prepared.admitted.parentExperimentId,
      prepared.admitted.researchSpecRevisionId,
      ir.hashAlgorithm,
      ir.hashDomain,
      ir.hashVersion,
      ir.hashHex,
      prepared.materialRequestHash,
      idempotencyRecordId,
      prepared.idempotencyKey,
      prepared.correlationId,
    ],
  );
}

async function updatePointerState(
  client: InvestingAuthorityTransactionClient,
  context: AuthorizedResearchMaterialRevisionCreateContext,
  previous: PointerRow,
  researchExperimentId: string,
  nextVersion: string,
): Promise<{ ok: true } | ExperimentVariantCreateFailure> {
  const updated = await client.query(
    [
      "update investing.research_material_pointer_states",
      "set active_experiment_id = $1, pointer_version = $2, updated_at = transaction_timestamp(), updated_by_operation = $3",
      "where research_investigation_id = $4 and pointer_version = $5 and active_experiment_id = $6 and active_spec_revision_id = $7",
      context.operationScope === "TENANT_SCOPE" ? "and account_id is null" : "and account_id = $8",
    ].join(" "),
    context.operationScope === "TENANT_SCOPE"
      ? [researchExperimentId, nextVersion, operation, context.researchInvestigationId, previous.pointer_version, previous.active_experiment_id, previous.active_spec_revision_id]
      : [researchExperimentId, nextVersion, operation, context.researchInvestigationId, previous.pointer_version, previous.active_experiment_id, previous.active_spec_revision_id, context.accountId],
  );
  return updated.rowCount === 1 ? { ok: true } : fail("CONFLICT");
}

async function findExistingIdempotency(
  client: InvestingAuthorityTransactionClient,
  context: AuthorizedResearchMaterialRevisionCreateContext,
  prepared: PreparedInput,
): Promise<{ ok: true; row: IdempotencyRow | null } | ExperimentVariantCreateFailure> {
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
): Promise<{ ok: true; existing: boolean; row: IdempotencyRow } | ExperimentVariantCreateFailure> {
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
  const existing = await findExistingIdempotency(client, context, prepared);
  if (existing.ok === false) return existing;
  if (!existing.row) return fail("CONFLICT");
  return { ok: true, existing: inserted.rowCount === 0, row: existing.row };
}

async function dispatchExistingIdempotency(
  client: InvestingAuthorityTransactionClient,
  context: AuthorizedResearchMaterialRevisionCreateContext,
  prepared: PreparedInput,
  row: IdempotencyRow,
): Promise<ExperimentVariantCreateResult> {
  if (!idempotencyBelongsToContext(row, context, prepared)) return fail("CONFLICT");
  if (row.material_request_hash !== prepared.materialRequestHash) return fail("CONFLICT");
  if (row.status === "STARTED") return fail("CONFLICT");
  if (row.status !== "SUCCEEDED") return fail("INTERNAL_ERROR");
  const reference = parseReference(row.canonical_result_reference);
  if (!reference) return fail("INTERNAL_ERROR");
  await setTransactionConfig(client, "research_experiment_id", reference.researchExperimentId);
  await setTransactionConfig(client, "research_spec_revision_id", reference.researchSpecRevisionId);
  const experiment = await exactlyOne(
    client.query<ExperimentRow>(
      [
        "select research_experiment_id, research_investigation_id, research_spec_revision_id, relation, parent_experiment_id,",
        "research_ir_hash_algorithm, research_ir_hash_domain, research_ir_hash_version, research_ir_hash_hex,",
        "material_request_hash, idempotency_record_id",
        "from investing.research_experiments",
        "where research_experiment_id = $1 and research_investigation_id = $2 and tenant_id = $3",
        context.operationScope === "TENANT_SCOPE" ? "and account_id is null" : "and account_id = $4",
      ].join(" "),
      context.operationScope === "TENANT_SCOPE"
        ? [reference.researchExperimentId, context.researchInvestigationId, context.tenantId]
        : [reference.researchExperimentId, context.researchInvestigationId, context.tenantId, context.accountId],
    ),
    "INTERNAL_ERROR",
  );
  if (experiment.ok === false) return experiment;
  if (
    experiment.row.material_request_hash !== prepared.materialRequestHash ||
    experiment.row.idempotency_record_id !== row.idempotency_record_id ||
    experiment.row.parent_experiment_id !== prepared.admitted.parentExperimentId ||
    experiment.row.research_spec_revision_id !== prepared.admitted.researchSpecRevisionId ||
    experiment.row.relation !== "VARIANT" ||
    experiment.row.research_ir_hash_algorithm !== prepared.admitted.researchIr.hashAlgorithm ||
    experiment.row.research_ir_hash_domain !== prepared.admitted.researchIr.hashDomain ||
    experiment.row.research_ir_hash_version !== prepared.admitted.researchIr.hashVersion ||
    experiment.row.research_ir_hash_hex !== prepared.admitted.researchIr.hashHex
  ) {
    return fail("INTERNAL_ERROR");
  }
  return { ok: true, replayed: true, idempotencyRecordId: row.idempotency_record_id, ...reference };
}

async function completeIdempotency(
  client: InvestingAuthorityTransactionClient,
  idempotencyRecordId: string,
  input: Omit<ExperimentVariantCreateSuccess, "ok" | "idempotencyRecordId">,
): Promise<ExperimentVariantCreateResult> {
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
  work: (client: InvestingAuthorityTransactionClient) => Promise<ExperimentVariantCreateResult & { destroyClient?: boolean }>,
): Promise<ExperimentVariantCreateResult> {
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
  await setTransactionConfig(client, "operation", operation);
  await setTransactionConfig(client, "capability", capability);
  await setTransactionConfig(client, "research_investigation_id", context.researchInvestigationId);
}

async function setTransactionContext(
  client: InvestingAuthorityTransactionClient,
  context: AuthorizedResearchMaterialRevisionCreateContext,
  prepared: PreparedInput,
) {
  await setPreParentTransactionContext(client, context);
  await setTransactionConfig(client, "tenant_id", context.tenantId);
  if ("accountId" in context) await setTransactionConfig(client, "account_id", context.accountId);
  await setTransactionConfig(client, "tenant_membership_id", context.tenantMembershipId);
  if ("accountAccessId" in context) await setTransactionConfig(client, "account_access_id", context.accountAccessId);
  await setTransactionConfig(client, "operation_scope", context.operationScope);
  await setTransactionConfig(client, "source_context", context.sourceContext);
  await setTransactionConfig(client, "correlation_id", prepared.correlationId);
  await setTransactionConfig(client, "idempotency_key", prepared.idempotencyKey);
  await setTransactionConfig(client, "material_request_hash", prepared.materialRequestHash);
  await setTransactionConfig(client, "research_spec_revision_id", prepared.admitted.researchSpecRevisionId);
  await setTransactionConfig(client, "research_ir_hash_hex", prepared.admitted.researchIr.hashHex);
  await setTransactionConfig(client, "expected_experiment_id", prepared.expectedExperimentId);
  await setTransactionConfig(client, "parent_experiment_id", prepared.admitted.parentExperimentId);
}

async function selectParentBeforeAuthorityScope(
  client: InvestingAuthorityTransactionClient,
  context: AuthorizedResearchMaterialRevisionCreateContext,
): Promise<{ ok: true; row: InvestigationRow } | ExperimentVariantCreateFailure> {
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
): Promise<{ ok: true } | ExperimentVariantCreateFailure> {
  if (!parentMatchesContext(parent, context)) return fail("FORBIDDEN_OR_NOT_FOUND");
  const principal = await exactlyOne(client.query<PrincipalRow>("select principal_id, state from investing.principals where principal_id = $1 and external_provider = 'CLERK' and external_subject = $2", [context.principalId, context.actorId]), "FORBIDDEN_OR_NOT_FOUND");
  if (principal.ok === false) return principal;
  if (principal.row.state !== "ACTIVE") return fail("PRINCIPAL_DISABLED");
  const tenant = await exactlyOne(client.query<TenantRow>("select tenant_id, state from investing.tenants where tenant_id = $1", [context.tenantId]), "FORBIDDEN_OR_NOT_FOUND");
  if (tenant.ok === false) return tenant;
  if (tenant.row.state !== "ACTIVE") return fail("TENANT_INACTIVE");
  const membership = await exactlyOne(client.query<MembershipRow>("select tenant_membership_id, tenant_id, principal_id, state from investing.tenant_memberships where tenant_membership_id = $1 and tenant_id = $2 and principal_id = $3 and role = 'OWNER'", [context.tenantMembershipId, context.tenantId, context.principalId]), "MEMBERSHIP_INACTIVE");
  if (membership.ok === false) return membership;
  if (membership.row.state !== "ACTIVE") return fail("MEMBERSHIP_INACTIVE");
  if (context.operationScope === "ACCOUNT_SCOPE") {
    const account = await exactlyOne(client.query<AccountRow>("select account_id, tenant_id, state from investing.accounts where account_id = $1 and tenant_id = $2", [context.accountId, context.tenantId]), "FORBIDDEN_OR_NOT_FOUND");
    if (account.ok === false) return account;
    if (account.row.state !== "ACTIVE") return fail("ACCOUNT_INACTIVE");
    const access = await exactlyOne(client.query<AccessRow>("select account_access_id, account_id, tenant_id, tenant_membership_id, principal_id, state from investing.account_access where account_access_id = $1 and account_id = $2 and tenant_id = $3 and tenant_membership_id = $4 and principal_id = $5 and role = 'OWNER'", [context.accountAccessId, context.accountId, context.tenantId, context.tenantMembershipId, context.principalId]), "ACCESS_INACTIVE");
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
  emptyCode: ExperimentVariantCreateFailureCode,
): Promise<{ ok: true; row: Row } | ExperimentVariantCreateFailure> {
  const result = await query;
  if (result.rows.length === 0) return fail(emptyCode);
  if (result.rows.length > 1) return fail("INTERNAL_ERROR");
  return { ok: true, row: result.rows[0]! };
}

function idempotencyBelongsToContext(row: IdempotencyRow, context: AuthorizedResearchMaterialRevisionCreateContext, prepared: PreparedInput) {
  return (
    row.actor_kind === "USER_PRINCIPAL" &&
    row.actor_id === context.actorId &&
    row.principal_id === context.principalId &&
    row.tenant_id === context.tenantId &&
    row.operation_scope === context.operationScope &&
    row.operation === operation &&
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

function parseReference(value: unknown): Omit<ExperimentVariantCreateSuccess, "ok" | "replayed" | "idempotencyRecordId"> | null {
  if (!value || typeof value !== "object") return null;
  const reference = value as Partial<Omit<ExperimentVariantCreateSuccess, "ok" | "replayed" | "idempotencyRecordId">>;
  return typeof reference.researchExperimentId === "string" &&
    typeof reference.researchInvestigationId === "string" &&
    typeof reference.parentExperimentId === "string" &&
    typeof reference.researchSpecRevisionId === "string" &&
    reference.relation === "VARIANT" &&
    typeof reference.researchIrHashHex === "string" &&
    typeof reference.materialRequestHash === "string" &&
    typeof reference.pointerVersion === "string"
    ? reference as Omit<ExperimentVariantCreateSuccess, "ok" | "replayed" | "idempotencyRecordId">
    : null;
}

function validOpaque(value: string, min: number, max: number) {
  const bytes = Buffer.byteLength(value, "utf8");
  return bytes >= min && bytes <= max;
}

function fail(code: ExperimentVariantCreateFailureCode): ExperimentVariantCreateFailure {
  return { ok: false, code };
}
