import { createHash, randomUUID } from "node:crypto";
import {
  isAuthorizedInvestingContext,
  type AuthorizedInvestingContext,
  type InvestingAuthorityDatabase,
  type InvestingAuthorityQueryResult,
  type InvestingAuthorityTransactionClient,
} from "../authority/context";
import { getInvestingAuthorityDatabase, readInvestingDatabaseConfig } from "../authority/transport";

const contentSchemaVersion = "SYNTRAKE_INVESTING_PLAN_CONTENT_V1";
const contentHashDomain = "SYNTRAKE_INVESTING_I4_PLAN_REVISION_CONTENT_V1";
const materialHashDomain = "SYNTRAKE_INVESTING_I4_PLAN_MUTATION_REQUEST_V1";
const planWriteCapability = "PLAN_WRITE";
const initializeOperation = "PLAN_INITIALIZE_V1";
const createAndActivateOperation = "PLAN_CREATE_AND_ACTIVATE_REVISION_V1";
const maxBigintText = "9223372036854775807";

const canonicalUuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const correlationPattern = /^[\s\S]{16,512}$/;
const idempotencyKeyPattern = /^[\s\S]{16,512}$/;

const fieldOrder = [
  "planning_currency_preference",
  "goal_description",
  "target_money",
  "target_date",
  "time_horizon_months",
  "risk_tolerance",
  "excluded_asset_classes",
  "notes",
] as const;

const fieldTypes = {
  planning_currency_preference: "TOKEN",
  goal_description: "TEXT",
  target_money: "MONEY",
  target_date: "DATE",
  time_horizon_months: "INTEGER",
  risk_tolerance: "TOKEN",
  excluded_asset_classes: "TOKEN_SET",
  notes: "TEXT",
} as const;

const acceptedCurrencies = new Set(["USD", "EUR", "GBP", "CHF", "CAD", "AUD", "JPY"]);
const acceptedRiskTokens = new Set(["CONSERVATIVE", "BALANCED", "GROWTH", "AGGRESSIVE"]);
const acceptedAssetClasses = new Set(["CASH", "BONDS", "EQUITIES", "FUNDS", "CRYPTO", "DERIVATIVES"]);

type PlanFieldName = (typeof fieldOrder)[number];
type PlanFieldType = (typeof fieldTypes)[PlanFieldName];
export type PlanFieldState = "SUPPLIED" | "NOT_SUPPLIED" | "UNKNOWN" | "DECLINED" | "NOT_APPLICABLE";

export type PlanFieldValue = Readonly<{
  state: PlanFieldState;
  type: PlanFieldType;
  value?: string;
  amount?: string;
  currency?: string;
  items?: readonly string[];
}>;

export type PlanContentV1 = Readonly<Record<PlanFieldName, PlanFieldValue>>;

export type InitializePlanV1Input = Readonly<{
  authorizedContext: AuthorizedInvestingContext;
  idempotencyKey: string;
  correlationId: string;
  content: PlanContentV1;
}>;

export type CreateAndActivatePlanRevisionV1Input = InitializePlanV1Input &
  Readonly<{
    planRootId: string;
    expectedActiveRevisionId: string;
    expectedActiveVersion: string;
  }>;

export type PlanMutationSuccess = Readonly<{
  ok: true;
  replayed: boolean;
  planRootId: string;
  planRevisionId: string;
  activeVersion: string;
  planRevisionContentHash: string;
  idempotencyRecordId: string;
}>;

export type PlanMutationFailureCode =
  | "VALIDATION_ERROR"
  | "UNAVAILABLE"
  | "FORBIDDEN_OR_NOT_FOUND"
  | "PRINCIPAL_DISABLED"
  | "TENANT_INACTIVE"
  | "MEMBERSHIP_INACTIVE"
  | "ACCESS_INACTIVE"
  | "ACCOUNT_INACTIVE"
  | "CONFLICT"
  | "INTERNAL_ERROR";

export type PlanMutationFailure = Readonly<{
  ok: false;
  code: PlanMutationFailureCode;
}>;

export type PlanMutationResult = PlanMutationSuccess | PlanMutationFailure;

type WorkSuccess = PlanMutationSuccess & { commitFailure?: false; destroyClient?: false };
type WorkFailure = PlanMutationFailure & { commitFailure?: boolean; destroyClient?: boolean; denialAudit?: PlanDenialAuditDraft };
type WorkResult = WorkSuccess | WorkFailure;

type AuthorityAccountRow = {
  account_id: string;
  tenant_id: string;
  state: "ACTIVE" | "FROZEN" | "CLOSED";
};
type AuthorityPrincipalRow = { principal_id: string; state: "ACTIVE" | "DISABLED" };
type AuthorityTenantRow = { tenant_id: string; state: "ACTIVE" | "SUSPENDED" | "CLOSED" };
type AuthorityMembershipRow = {
  tenant_membership_id: string;
  tenant_id: string;
  principal_id: string;
  role: "OWNER";
  state: "ACTIVE" | "REVOKED";
};
type AuthorityAccessRow = {
  account_access_id: string;
  account_id: string;
  tenant_id: string;
  tenant_membership_id: string;
  principal_id: string;
  role: "OWNER";
  state: "ACTIVE" | "REVOKED";
};
type IdempotencyRow = {
  idempotency_record_id: string;
  actor_kind: "USER_PRINCIPAL";
  actor_id: string;
  operation_scope: "ACCOUNT_SCOPE";
  operation: typeof initializeOperation | typeof createAndActivateOperation;
  principal_id: string;
  tenant_id: string;
  account_id: string;
  idempotency_key: string;
  material_request_hash: string;
  status: "STARTED" | "SUCCEEDED" | "FAILED" | "CONFLICT";
  canonical_result_reference: unknown;
};
type PlanRootRow = {
  plan_root_id: string;
  tenant_id: string;
  account_id: string;
  active_plan_revision_id: string;
  active_version: string;
};
type PlanRevisionReplayRow = {
  plan_root_id: string;
  plan_revision_id: string;
  revision_number: string;
  predecessor_plan_revision_id?: string | null;
  predecessor_revision_number?: string | null;
  content_schema_version?: string;
  plan_revision_content_hash: string;
  material_request_hash?: string;
  idempotency_record_id: string;
  operation?: typeof initializeOperation | typeof createAndActivateOperation;
};
type PlanDenialAuditDraft = {
  correlationId: string;
  actorId: string;
  principalId: string;
  tenantId: string;
  accountId: string;
  reasonCode: "PRINCIPAL_DISABLED" | "TENANT_INACTIVE" | "MEMBERSHIP_INACTIVE" | "ACCESS_INACTIVE" | "ACCOUNT_INACTIVE" | "AUTHORITY_TUPLE_MISMATCH";
  outcome: "DENIED" | "FAILED";
  operation: typeof initializeOperation | typeof createAndActivateOperation;
};
type PlanConflictAuditDraft = {
  correlationId: string;
  actorId: string;
  principalId: string;
  tenantId: string;
  accountId: string;
  operation: typeof initializeOperation | typeof createAndActivateOperation;
  idempotencyRecordId: string;
  idempotencyKey: string;
  materialRequestHash: string;
  reasonCode: string;
  planRootId?: string;
  expectedActiveRevisionId?: string;
  expectedActiveVersion?: string;
  observedActiveRevisionId?: string;
  observedActiveVersion?: string;
  winnerPlanRevisionId?: string;
  winnerMaterialRequestHash?: string;
  winnerContentHash?: string;
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
  "syntrake.investing.correlation_id",
  "syntrake.investing.idempotency_key",
  "syntrake.investing.idempotency_record_id",
  "syntrake.investing.material_request_hash",
  "syntrake.investing.plan_root_id",
  "syntrake.investing.plan_revision_id",
  "syntrake.investing.plan_revision_content_hash",
  "syntrake.investing.expected_active_revision_id",
  "syntrake.investing.expected_active_version",
] as const;

export async function initializePlanV1(
  input: InitializePlanV1Input,
  env: Record<string, string | undefined> = process.env,
): Promise<PlanMutationResult> {
  const prepared = prepareBaseInput(input, initializeOperation, env);
  if (prepared.ok === false) return prepared;

  return withPlanTransaction(prepared.database, async (client) => {
    const contextReady = await prepareTransaction(client, input.authorizedContext, prepared, initializeOperation);
    if (contextReady.ok === false) return contextReady;

    const authority = await lockAndRevalidatePlanAuthority(client, input.authorizedContext, initializeOperation, prepared.correlationId, {
      allowHistoricalAccountState: true,
    });
    if (authority.ok === false) return authority;

    const replayCandidate = await findExistingIdempotency(client, input.authorizedContext, {
      operation: initializeOperation,
      idempotencyKey: prepared.idempotencyKey,
      materialRequestHash: prepared.materialRequestHash,
    });
    if (replayCandidate.ok === false) return replayCandidate;
    if (replayCandidate.row) {
      if (authority.account?.state !== "ACTIVE" && !isExactTerminalReplay(replayCandidate.row, prepared.materialRequestHash)) {
        return authorityDenial(input.authorizedContext, initializeOperation, prepared.correlationId, "ACCOUNT_INACTIVE", "DENIED");
      }
      return dispatchExistingIdempotency(client, input.authorizedContext, replayCandidate.row, {
        operation: initializeOperation,
        correlationId: prepared.correlationId,
        idempotencyKey: prepared.idempotencyKey,
        materialRequestHash: prepared.materialRequestHash,
      });
    }
    if (authority.account?.state !== "ACTIVE") {
      return authorityDenial(input.authorizedContext, initializeOperation, prepared.correlationId, "ACCOUNT_INACTIVE", "DENIED");
    }

    const idempotency = await lockOrCreateIdempotency(client, input.authorizedContext, {
      operation: initializeOperation,
      idempotencyKey: prepared.idempotencyKey,
      correlationId: prepared.correlationId,
      materialRequestHash: prepared.materialRequestHash,
    });
    if (idempotency.ok === false) return idempotency;
    if (idempotency.existing) {
      return dispatchExistingIdempotency(client, input.authorizedContext, idempotency.row, {
        operation: initializeOperation,
        correlationId: prepared.correlationId,
        idempotencyKey: prepared.idempotencyKey,
        materialRequestHash: prepared.materialRequestHash,
      });
    }

    await client.query("savepoint plan_effect");
    const planRootId = randomUUID();
    const planRevisionId = randomUUID();
    await setTransactionContext(client, { plan_root_id: planRootId, plan_revision_id: planRevisionId });

    const rootInsert = await client.query(
      [
        "insert into investing.plan_roots (",
        "plan_root_id, tenant_id, account_id, active_plan_revision_id, active_version, created_by_principal_id,",
        "created_tenant_membership_id, created_account_access_id, created_idempotency_record_id",
        ") values ($1, $2, $3, $4, 1, $5, $6, $7, $8)",
        "on conflict (tenant_id, account_id) do nothing",
      ].join(" "),
      [
        planRootId,
        input.authorizedContext.tenantId,
        input.authorizedContext.accountId,
        planRevisionId,
        input.authorizedContext.principalId,
        input.authorizedContext.tenantMembershipId,
        input.authorizedContext.accountAccessId,
        idempotency.row.idempotency_record_id,
      ],
    );
    if (rootInsert.rowCount !== 0 && rootInsert.rowCount !== 1) return fail("INTERNAL_ERROR");
    if (rootInsert.rowCount === 0) {
      await client.query("rollback to savepoint plan_effect");
      return resolveInitializeRootRace(client, input.authorizedContext, {
        idempotencyRecordId: idempotency.row.idempotency_record_id,
        idempotencyKey: prepared.idempotencyKey,
        correlationId: prepared.correlationId,
        materialRequestHash: prepared.materialRequestHash,
        contentHash: prepared.planRevisionContentHash,
      });
    }

    const revisionInsert = await insertPlanRevision(client, input.authorizedContext, {
      planRootId,
      planRevisionId,
      revisionNumber: "1",
      predecessorPlanRevisionId: null,
      predecessorRevisionNumber: null,
      operation: initializeOperation,
      idempotencyRecordId: idempotency.row.idempotency_record_id,
      materialRequestHash: prepared.materialRequestHash,
      correlationId: prepared.correlationId,
      contentBytes: prepared.canonicalContentBytes,
      contentHash: prepared.planRevisionContentHash,
    });
    if (revisionInsert.ok === false) return revisionInsert;

    const audit = await insertSuccessAuditAndBinding(client, input.authorizedContext, {
      planRootId,
      planRevisionId,
      revisionNumber: "1",
      predecessorPlanRevisionId: null,
      predecessorRevisionNumber: null,
      operation: initializeOperation,
      idempotencyRecordId: idempotency.row.idempotency_record_id,
      materialRequestHash: prepared.materialRequestHash,
      correlationId: prepared.correlationId,
      contentHash: prepared.planRevisionContentHash,
    });
    if (audit.ok === false) return audit;

    return terminalSuccess(client, idempotency.row.idempotency_record_id, {
      planRootId,
      planRevisionId,
      activeVersion: "1",
      planRevisionContentHash: prepared.planRevisionContentHash,
    }, false);
  });
}

export async function createAndActivatePlanRevisionV1(
  input: CreateAndActivatePlanRevisionV1Input,
  env: Record<string, string | undefined> = process.env,
): Promise<PlanMutationResult> {
  const prepared = prepareBaseInput(input, createAndActivateOperation, env);
  if (prepared.ok === false) return prepared;
  if (!canonicalUuidPattern.test(input.planRootId) || !canonicalUuidPattern.test(input.expectedActiveRevisionId)) {
    return fail("VALIDATION_ERROR");
  }
  if (!isCanonicalActiveVersion(input.expectedActiveVersion)) return fail("VALIDATION_ERROR");

  return withPlanTransaction(prepared.database, async (client) => {
    const contextReady = await prepareTransaction(client, input.authorizedContext, prepared, createAndActivateOperation, {
      plan_root_id: input.planRootId,
      expected_active_revision_id: input.expectedActiveRevisionId,
      expected_active_version: input.expectedActiveVersion,
    });
    if (contextReady.ok === false) return contextReady;

    const authority = await lockAndRevalidatePlanAuthority(client, input.authorizedContext, createAndActivateOperation, prepared.correlationId, {
      allowHistoricalAccountState: true,
    });
    if (authority.ok === false) return authority;

    const replayCandidate = await findExistingIdempotency(client, input.authorizedContext, {
      operation: createAndActivateOperation,
      idempotencyKey: prepared.idempotencyKey,
      materialRequestHash: prepared.materialRequestHash,
    });
    if (replayCandidate.ok === false) return replayCandidate;
    if (replayCandidate.row) {
      if (authority.account?.state !== "ACTIVE" && !isExactTerminalReplay(replayCandidate.row, prepared.materialRequestHash)) {
        return authorityDenial(input.authorizedContext, createAndActivateOperation, prepared.correlationId, "ACCOUNT_INACTIVE", "DENIED");
      }
      return dispatchExistingIdempotency(client, input.authorizedContext, replayCandidate.row, {
        operation: createAndActivateOperation,
        correlationId: prepared.correlationId,
        idempotencyKey: prepared.idempotencyKey,
        materialRequestHash: prepared.materialRequestHash,
      });
    }
    if (authority.account?.state !== "ACTIVE") {
      return authorityDenial(input.authorizedContext, createAndActivateOperation, prepared.correlationId, "ACCOUNT_INACTIVE", "DENIED");
    }

    const idempotency = await lockOrCreateIdempotency(client, input.authorizedContext, {
      operation: createAndActivateOperation,
      idempotencyKey: prepared.idempotencyKey,
      correlationId: prepared.correlationId,
      materialRequestHash: prepared.materialRequestHash,
    });
    if (idempotency.ok === false) return idempotency;
    if (idempotency.existing) {
      return dispatchExistingIdempotency(client, input.authorizedContext, idempotency.row, {
        operation: createAndActivateOperation,
        correlationId: prepared.correlationId,
        idempotencyKey: prepared.idempotencyKey,
        materialRequestHash: prepared.materialRequestHash,
      });
    }

    const root = await expectExactlyOne(
      client.query<PlanRootRow>(
        [
          "select plan_root_id, tenant_id, account_id, active_plan_revision_id, active_version::text as active_version",
          "from investing.plan_roots",
          "where tenant_id = $1 and account_id = $2 and plan_root_id = $3 for update",
        ].join(" "),
        [input.authorizedContext.tenantId, input.authorizedContext.accountId, input.planRootId],
      ),
      "CONFLICT",
    );
    if (root.ok === false) return root;
    if (
      root.row.active_plan_revision_id !== input.expectedActiveRevisionId ||
      root.row.active_version !== input.expectedActiveVersion
    ) {
      const replay = await resolveCreateAndActivateStaleRace(client, input.authorizedContext, {
        planRootId: input.planRootId,
        expectedActiveRevisionId: input.expectedActiveRevisionId,
        expectedActiveVersion: input.expectedActiveVersion,
        observedActiveRevisionId: root.row.active_plan_revision_id,
        observedActiveVersion: root.row.active_version,
        idempotencyRecordId: idempotency.row.idempotency_record_id,
        idempotencyKey: prepared.idempotencyKey,
        correlationId: prepared.correlationId,
        materialRequestHash: prepared.materialRequestHash,
        contentHash: prepared.planRevisionContentHash,
      });
      if (replay.ok === true || replay.code !== "CONFLICT") return replay;
      return terminalConflict(client, {
        correlationId: prepared.correlationId,
        actorId: input.authorizedContext.actorId,
        principalId: input.authorizedContext.principalId,
        tenantId: input.authorizedContext.tenantId,
        accountId: input.authorizedContext.accountId,
        operation: createAndActivateOperation,
        idempotencyRecordId: idempotency.row.idempotency_record_id,
        idempotencyKey: prepared.idempotencyKey,
        materialRequestHash: prepared.materialRequestHash,
        reasonCode: "I4_PLAN_STALE_ACTIVE_POINTER",
        planRootId: input.planRootId,
        expectedActiveRevisionId: input.expectedActiveRevisionId,
        expectedActiveVersion: input.expectedActiveVersion,
        observedActiveRevisionId: root.row.active_plan_revision_id,
        observedActiveVersion: root.row.active_version,
      });
    }

    const nextVersion = incrementActiveVersion(input.expectedActiveVersion);
    if (!nextVersion) return fail("INTERNAL_ERROR");
    const planRevisionId = randomUUID();
    await setTransactionContext(client, { plan_revision_id: planRevisionId });

    const revisionInsert = await insertPlanRevision(client, input.authorizedContext, {
      planRootId: input.planRootId,
      planRevisionId,
      revisionNumber: nextVersion,
      predecessorPlanRevisionId: input.expectedActiveRevisionId,
      predecessorRevisionNumber: input.expectedActiveVersion,
      operation: createAndActivateOperation,
      idempotencyRecordId: idempotency.row.idempotency_record_id,
      materialRequestHash: prepared.materialRequestHash,
      correlationId: prepared.correlationId,
      contentBytes: prepared.canonicalContentBytes,
      contentHash: prepared.planRevisionContentHash,
    });
    if (revisionInsert.ok === false) return revisionInsert;

    const moved = await client.query(
      [
        "update investing.plan_roots",
        "set active_plan_revision_id = $4, active_version = $5::bigint",
        "where tenant_id = $1 and account_id = $2 and plan_root_id = $3",
        "and active_plan_revision_id = $6 and active_version = $7::bigint",
      ].join(" "),
      [
        input.authorizedContext.tenantId,
        input.authorizedContext.accountId,
        input.planRootId,
        planRevisionId,
        nextVersion,
        input.expectedActiveRevisionId,
        input.expectedActiveVersion,
      ],
    );
    if (moved.rowCount === 0) return terminalConflict(client, {
      correlationId: prepared.correlationId,
      actorId: input.authorizedContext.actorId,
      principalId: input.authorizedContext.principalId,
      tenantId: input.authorizedContext.tenantId,
      accountId: input.authorizedContext.accountId,
      operation: createAndActivateOperation,
      idempotencyRecordId: idempotency.row.idempotency_record_id,
      idempotencyKey: prepared.idempotencyKey,
      materialRequestHash: prepared.materialRequestHash,
      reasonCode: "I4_PLAN_STALE_ACTIVE_POINTER_AFTER_INSERT",
      planRootId: input.planRootId,
      expectedActiveRevisionId: input.expectedActiveRevisionId,
      expectedActiveVersion: input.expectedActiveVersion,
    });
    if (moved.rowCount !== 1) return fail("INTERNAL_ERROR");

    const audit = await insertSuccessAuditAndBinding(client, input.authorizedContext, {
      planRootId: input.planRootId,
      planRevisionId,
      revisionNumber: nextVersion,
      predecessorPlanRevisionId: input.expectedActiveRevisionId,
      predecessorRevisionNumber: input.expectedActiveVersion,
      operation: createAndActivateOperation,
      idempotencyRecordId: idempotency.row.idempotency_record_id,
      materialRequestHash: prepared.materialRequestHash,
      correlationId: prepared.correlationId,
      contentHash: prepared.planRevisionContentHash,
    });
    if (audit.ok === false) return audit;

    return terminalSuccess(client, idempotency.row.idempotency_record_id, {
      planRootId: input.planRootId,
      planRevisionId,
      activeVersion: nextVersion,
      planRevisionContentHash: prepared.planRevisionContentHash,
    }, false);
  });
}

export function planRevisionContentHash(content: PlanContentV1) {
  return sha256(Buffer.concat([Buffer.from(`${contentHashDomain}\0`, "utf8"), canonicalPlanContentBytes(content)]));
}

export function initializePlanMaterialRequestHash(content: PlanContentV1, context: AuthorizedInvestingContext) {
  return sha256(
    Buffer.from(
      [
        materialHashDomain,
        initializeOperation,
        `tenant=${context.tenantId}`,
        `account=${context.accountId}`,
        `principal=${context.principalId}`,
        `content=${planRevisionContentHash(content)}`,
        "activation=CREATE_ROOT_CREATE_INITIAL_REVISION_ACTIVATE",
      ].join("\0"),
      "utf8",
    ),
  );
}

export function createAndActivatePlanMaterialRequestHash(
  content: PlanContentV1,
  context: AuthorizedInvestingContext,
  planRootId: string,
  expectedActiveRevisionId: string,
  expectedActiveVersion: string,
) {
  return sha256(
    Buffer.from(
      [
        materialHashDomain,
        createAndActivateOperation,
        `tenant=${context.tenantId}`,
        `account=${context.accountId}`,
        `principal=${context.principalId}`,
        `plan_root=${planRootId}`,
        `expected_active_revision=${expectedActiveRevisionId}`,
        `expected_active_version=${expectedActiveVersion}`,
        `content=${planRevisionContentHash(content)}`,
        "activation=CREATE_REVISION_AND_ACTIVATE_ATOMICALLY",
      ].join("\0"),
      "utf8",
    ),
  );
}

export function canonicalPlanContentBytes(content: PlanContentV1): Buffer {
  if (!content || typeof content !== "object") throw new Error("invalid plan content");
  const chunks = [
    Buffer.from(
      `SYNTRAKE-CANONICAL-PLAN-CONTENT-V1\ncontent_schema_version=${contentSchemaVersion}\nfield_count=8\n`,
      "utf8",
    ),
  ];

  for (const field of fieldOrder) {
    const value = canonicalFieldValueBytes(field, content[field]);
    chunks.push(Buffer.from(`field=${field}\nstate=${content[field]?.state}\ntype=${fieldTypes[field]}\nvalue_length=${value.length}\n`, "utf8"));
    chunks.push(value);
    chunks.push(Buffer.from("\nend_field\n", "utf8"));
  }

  const bytes = Buffer.concat(chunks);
  if (bytes.length === 0 || bytes.length > 32768) throw new Error("canonical content bytes out of bounds");
  return bytes;
}

function canonicalFieldValueBytes(field: PlanFieldName, value: PlanFieldValue | undefined) {
  if (!value || value.type !== fieldTypes[field]) throw new Error("field type mismatch");
  if (!["SUPPLIED", "NOT_SUPPLIED", "UNKNOWN", "DECLINED", "NOT_APPLICABLE"].includes(value.state)) {
    throw new Error("field state mismatch");
  }
  if (value.state !== "SUPPLIED") {
    if (value.value !== undefined || value.amount !== undefined || value.currency !== undefined || value.items !== undefined) {
      throw new Error("non-supplied state cannot carry value payload");
    }
    return Buffer.alloc(0);
  }

  if (field === "planning_currency_preference") return tokenBytes(value.value, acceptedCurrencies);
  if (field === "risk_tolerance") return tokenBytes(value.value, acceptedRiskTokens);
  if (field === "goal_description") return textBytes(value.value, 4096);
  if (field === "notes") return textBytes(value.value, 8192);
  if (field === "target_money") return moneyBytes(value);
  if (field === "target_date") return dateBytes(value.value);
  if (field === "time_horizon_months") return integerBytes(value.value);
  return tokenSetBytes(value.items);
}

function prepareBaseInput(
  input: InitializePlanV1Input,
  operation: typeof initializeOperation | typeof createAndActivateOperation,
  env: Record<string, string | undefined>,
): (Readonly<{
  ok: true;
  database: InvestingAuthorityDatabase;
  idempotencyKey: string;
  correlationId: string;
  canonicalContentBytes: Buffer;
  planRevisionContentHash: string;
  materialRequestHash: string;
}> | PlanMutationFailure) {
  if (!isAuthorizedInvestingContext(input.authorizedContext)) return fail("VALIDATION_ERROR");
  if (input.authorizedContext.actorKind !== "USER_PRINCIPAL") return fail("VALIDATION_ERROR");
  if (!idempotencyKeyPattern.test(input.idempotencyKey) || !correlationPattern.test(input.correlationId)) {
    return fail("VALIDATION_ERROR");
  }
  if (!canonicalUuidPattern.test(input.authorizedContext.principalId) ||
    !canonicalUuidPattern.test(input.authorizedContext.tenantId) ||
    !canonicalUuidPattern.test(input.authorizedContext.accountId) ||
    !canonicalUuidPattern.test(input.authorizedContext.tenantMembershipId) ||
    !canonicalUuidPattern.test(input.authorizedContext.accountAccessId)) {
    return fail("VALIDATION_ERROR");
  }

  const config = readInvestingDatabaseConfig(env);
  if (config.ok === false) return fail("INTERNAL_ERROR");

  let database: InvestingAuthorityDatabase;
  try {
    database = getInvestingAuthorityDatabase(env);
  } catch {
    return fail("INTERNAL_ERROR");
  }

  try {
    const canonicalContentBytes = canonicalPlanContentBytes(input.content);
    const planRevisionContentHashValue = planRevisionContentHash(input.content);
    const materialRequestHash = operation === initializeOperation
      ? initializePlanMaterialRequestHash(input.content, input.authorizedContext)
      : createAndActivatePlanMaterialRequestHash(
          input.content,
          input.authorizedContext,
          (input as CreateAndActivatePlanRevisionV1Input).planRootId,
          (input as CreateAndActivatePlanRevisionV1Input).expectedActiveRevisionId,
          (input as CreateAndActivatePlanRevisionV1Input).expectedActiveVersion,
        );

    return {
      ok: true,
      database,
      idempotencyKey: input.idempotencyKey,
      correlationId: input.correlationId,
      canonicalContentBytes,
      planRevisionContentHash: planRevisionContentHashValue,
      materialRequestHash,
    };
  } catch {
    return fail("VALIDATION_ERROR");
  }
}

async function prepareTransaction(
  client: InvestingAuthorityTransactionClient,
  context: AuthorizedInvestingContext,
  prepared: { idempotencyKey: string; correlationId: string; materialRequestHash: string; planRevisionContentHash: string },
  operation: typeof initializeOperation | typeof createAndActivateOperation,
  extra: Record<string, string> = {},
): Promise<WorkResult> {
  if (await hasStaleTransactionContext(client)) return { ...fail("INTERNAL_ERROR"), destroyClient: true };
  await setTransactionContext(client, {
    actor_kind: "USER_PRINCIPAL",
    actor_id: context.actorId,
    external_provider: "CLERK",
    external_subject: context.actorId,
    principal_id: context.principalId,
    tenant_id: context.tenantId,
    account_id: context.accountId,
    tenant_membership_id: context.tenantMembershipId,
    account_access_id: context.accountAccessId,
    operation,
    capability: planWriteCapability,
    correlation_id: prepared.correlationId,
    idempotency_key: prepared.idempotencyKey,
    material_request_hash: prepared.materialRequestHash,
    plan_revision_content_hash: prepared.planRevisionContentHash,
    ...extra,
  });
  return { ok: true, replayed: false, planRootId: "", planRevisionId: "", activeVersion: "", planRevisionContentHash: "", idempotencyRecordId: "" };
}

async function lockAndRevalidatePlanAuthority(
  client: InvestingAuthorityTransactionClient,
  context: AuthorizedInvestingContext,
  operation: typeof initializeOperation | typeof createAndActivateOperation,
  correlationId: string,
  options: { allowHistoricalAccountState?: boolean } = {},
): Promise<WorkResult & { account?: AuthorityAccountRow }> {
  const principal = await expectExactlyOne(
    client.query<AuthorityPrincipalRow>(
      "select principal_id, state from investing.principals where principal_id = $1 and external_provider = 'CLERK' and external_subject = $2 for update",
      [context.principalId, context.actorId],
    ),
    "FORBIDDEN_OR_NOT_FOUND",
  );
  if (principal.ok === false) return principal;
  if (principal.row.state !== "ACTIVE") return authorityDenial(context, operation, correlationId, "PRINCIPAL_DISABLED", "DENIED");

  const account = await expectExactlyOne(
    client.query<AuthorityAccountRow>(
      "select account_id, tenant_id, state from investing.accounts where account_id = $1 and tenant_id = $2 for update",
      [context.accountId, context.tenantId],
    ),
    "FORBIDDEN_OR_NOT_FOUND",
  );
  if (account.ok === false) return account;
  if (account.row.state !== "ACTIVE" && !options.allowHistoricalAccountState) {
    return authorityDenial(context, operation, correlationId, "ACCOUNT_INACTIVE", "DENIED");
  }

  const tenant = await expectExactlyOne(
    client.query<AuthorityTenantRow>("select tenant_id, state from investing.tenants where tenant_id = $1 for update", [context.tenantId]),
    "INTERNAL_ERROR",
  );
  if (tenant.ok === false) return tenant;
  if (tenant.row.state !== "ACTIVE") return authorityDenial(context, operation, correlationId, "TENANT_INACTIVE", "DENIED");

  const membership = await expectExactlyOne(
    client.query<AuthorityMembershipRow>(
      [
        "select tenant_membership_id, tenant_id, principal_id, role, state from investing.tenant_memberships",
        "where tenant_membership_id = $1 and tenant_id = $2 and principal_id = $3 and role = 'OWNER' for update",
      ].join(" "),
      [context.tenantMembershipId, context.tenantId, context.principalId],
    ),
    "MEMBERSHIP_INACTIVE",
  );
  if (membership.ok === false) return membership;
  if (membership.row.state !== "ACTIVE") return authorityDenial(context, operation, correlationId, "MEMBERSHIP_INACTIVE", "DENIED");

  const access = await expectExactlyOne(
    client.query<AuthorityAccessRow>(
      [
        "select account_access_id, account_id, tenant_id, tenant_membership_id, principal_id, role, state",
        "from investing.account_access",
        "where account_access_id = $1 and account_id = $2 and tenant_id = $3",
        "and tenant_membership_id = $4 and principal_id = $5 and role = 'OWNER' for update",
      ].join(" "),
      [context.accountAccessId, context.accountId, context.tenantId, context.tenantMembershipId, context.principalId],
    ),
    "ACCESS_INACTIVE",
  );
  if (access.ok === false) return access;
  if (access.row.state !== "ACTIVE") return authorityDenial(context, operation, correlationId, "ACCESS_INACTIVE", "DENIED");

  if (
    account.row.tenant_id !== tenant.row.tenant_id ||
    membership.row.tenant_id !== tenant.row.tenant_id ||
    membership.row.principal_id !== principal.row.principal_id ||
    access.row.tenant_id !== tenant.row.tenant_id ||
    access.row.account_id !== account.row.account_id ||
    access.row.principal_id !== principal.row.principal_id ||
    access.row.tenant_membership_id !== membership.row.tenant_membership_id
  ) {
    return authorityDenial(context, operation, correlationId, "AUTHORITY_TUPLE_MISMATCH", "FAILED");
  }

  return { ok: true, replayed: false, account: account.row, planRootId: "", planRevisionId: "", activeVersion: "", planRevisionContentHash: "", idempotencyRecordId: "" };
}

async function findExistingIdempotency(
  client: InvestingAuthorityTransactionClient,
  context: AuthorizedInvestingContext,
  input: {
    operation: typeof initializeOperation | typeof createAndActivateOperation;
    idempotencyKey: string;
    materialRequestHash: string;
  },
): Promise<{ ok: true; row: IdempotencyRow | null } | WorkFailure> {
  const selected = await client.query<IdempotencyRow>(
    [
      "select idempotency_record_id, actor_kind, actor_id, operation_scope, operation, principal_id, tenant_id, account_id,",
      "idempotency_key, material_request_hash, status, canonical_result_reference",
      "from investing.idempotency_records",
      "where actor_kind = 'USER_PRINCIPAL' and actor_id = $1 and principal_id = $2",
      "and tenant_id = $3 and account_id = $4 and operation_scope = 'ACCOUNT_SCOPE' and operation = $5",
      "and idempotency_key = $6",
    ].join(" "),
    [context.actorId, context.principalId, context.tenantId, context.accountId, input.operation, input.idempotencyKey],
  );
  if (selected.rows.length > 1) return fail("INTERNAL_ERROR");
  if (selected.rows.length === 0) return { ok: true, row: null };
  const row = selected.rows[0]!;
  await setTransactionContext(client, { idempotency_record_id: row.idempotency_record_id });
  if (!idempotencyBelongsToContext(row, context, input.operation, input.idempotencyKey)) return fail("CONFLICT");
  return { ok: true, row };
}

async function lockOrCreateIdempotency(
  client: InvestingAuthorityTransactionClient,
  context: AuthorizedInvestingContext,
  input: {
    operation: typeof initializeOperation | typeof createAndActivateOperation;
    idempotencyKey: string;
    correlationId: string;
    materialRequestHash: string;
  },
): Promise<
  | { ok: true; existing: boolean; row: IdempotencyRow }
  | WorkFailure
> {
  const candidateId = randomUUID();
  await setTransactionContext(client, { idempotency_record_id: candidateId });
  const inserted = await client.query(
    [
      "insert into investing.idempotency_records (",
      "idempotency_record_id, idempotency_key, material_request_hash, correlation_id,",
      "actor_kind, actor_id, operation_scope, operation, principal_id, tenant_id, account_id, status",
      ") values ($1, $2, $3, $4, 'USER_PRINCIPAL', $5, 'ACCOUNT_SCOPE', $6, $7, $8, $9, 'STARTED')",
      "on conflict (actor_kind, actor_id, operation_scope, operation, idempotency_key) do nothing",
    ].join(" "),
    [candidateId, input.idempotencyKey, input.materialRequestHash, input.correlationId, context.actorId, input.operation, context.principalId, context.tenantId, context.accountId],
  );
  if (inserted.rowCount !== 0 && inserted.rowCount !== 1) return fail("INTERNAL_ERROR");

  if (inserted.rowCount === 0) {
    const existing = await findExistingIdempotency(client, context, {
      operation: input.operation,
      idempotencyKey: input.idempotencyKey,
      materialRequestHash: input.materialRequestHash,
    });
    if (existing.ok === false) return existing;
    if (!existing.row) return fail("CONFLICT");
    return { ok: true, existing: true, row: existing.row };
  }

  const selected = await client.query<IdempotencyRow>(
    [
      "select idempotency_record_id, actor_kind, actor_id, operation_scope, operation, principal_id, tenant_id, account_id,",
      "idempotency_key, material_request_hash, status, canonical_result_reference",
      "from investing.idempotency_records",
      "where idempotency_record_id = $1 and actor_kind = 'USER_PRINCIPAL' and actor_id = $2 and principal_id = $3",
      "and tenant_id = $4 and account_id = $5 and operation_scope = 'ACCOUNT_SCOPE' and operation = $6",
      "and idempotency_key = $7 and status = 'STARTED' for update",
    ].join(" "),
    [candidateId, context.actorId, context.principalId, context.tenantId, context.accountId, input.operation, input.idempotencyKey],
  );
  if (selected.rows.length > 1) return fail("INTERNAL_ERROR");
  if (selected.rows.length === 0) return fail("INTERNAL_ERROR");
  const row = selected.rows[0]!;
  await setTransactionContext(client, { idempotency_record_id: row.idempotency_record_id });

  if (!idempotencyBelongsToContext(row, context, input.operation, input.idempotencyKey)) return fail("CONFLICT");
  if (row.idempotency_record_id !== candidateId || row.status !== "STARTED" || row.material_request_hash !== input.materialRequestHash) {
    return fail("INTERNAL_ERROR");
  }

  return { ok: true, existing: false, row };
}

async function insertPlanRevision(
  client: InvestingAuthorityTransactionClient,
  context: AuthorizedInvestingContext,
  input: {
    planRootId: string;
    planRevisionId: string;
    revisionNumber: string;
    predecessorPlanRevisionId: string | null;
    predecessorRevisionNumber: string | null;
    operation: typeof initializeOperation | typeof createAndActivateOperation;
    idempotencyRecordId: string;
    materialRequestHash: string;
    correlationId: string;
    contentBytes: Buffer;
    contentHash: string;
  },
): Promise<WorkResult> {
  const inserted = await client.query(
    [
      "insert into investing.plan_revisions (",
      "plan_revision_id, tenant_id, account_id, plan_root_id, revision_number, predecessor_plan_revision_id,",
      "predecessor_revision_number, content_schema_version, canonical_content_bytes, plan_revision_content_hash,",
      "actor_kind, actor_id, principal_id, tenant_membership_id, account_access_id, operation_scope, operation,",
      "capability, correlation_id, idempotency_record_id, material_request_hash",
      ") values ($1, $2, $3, $4, $5::bigint, $6, $7::bigint, $8, $9, $10, 'USER_PRINCIPAL', $11, $12, $13, $14, 'ACCOUNT_SCOPE', $15, $16, $17, $18, $19)",
    ].join(" "),
    [
      input.planRevisionId,
      context.tenantId,
      context.accountId,
      input.planRootId,
      input.revisionNumber,
      input.predecessorPlanRevisionId,
      input.predecessorRevisionNumber,
      contentSchemaVersion,
      input.contentBytes,
      input.contentHash,
      context.actorId,
      context.principalId,
      context.tenantMembershipId,
      context.accountAccessId,
      input.operation,
      planWriteCapability,
      input.correlationId,
      input.idempotencyRecordId,
      input.materialRequestHash,
    ],
  );
  if (inserted.rowCount !== 1) return fail("INTERNAL_ERROR");
  return { ok: true, replayed: false, planRootId: input.planRootId, planRevisionId: input.planRevisionId, activeVersion: input.revisionNumber, planRevisionContentHash: input.contentHash, idempotencyRecordId: input.idempotencyRecordId };
}

async function insertSuccessAuditAndBinding(
  client: InvestingAuthorityTransactionClient,
  context: AuthorizedInvestingContext,
  input: {
    planRootId: string;
    planRevisionId: string;
    revisionNumber: string;
    predecessorPlanRevisionId: string | null;
    predecessorRevisionNumber: string | null;
    operation: typeof initializeOperation | typeof createAndActivateOperation;
    idempotencyRecordId: string;
    materialRequestHash: string;
    correlationId: string;
    contentHash: string;
  },
): Promise<WorkResult> {
  const auditEventId = randomUUID();
  const audit = await client.query(
    [
      "insert into investing.audit_events (",
      "audit_event_id, correlation_id, actor_kind, actor_id, principal_id, operation_scope, tenant_id, account_id,",
      "action, object_type, object_id, outcome, reason_code, evidence, occurred_at",
      ") values ($1, $2, 'USER_PRINCIPAL', $3, $4, 'ACCOUNT_SCOPE', $5, $6, $7, 'PLAN_REVISION', $8, 'SUCCEEDED', null, $9::jsonb, transaction_timestamp())",
    ].join(" "),
    [
      auditEventId,
      input.correlationId,
      context.actorId,
      context.principalId,
      context.tenantId,
      context.accountId,
      input.operation === initializeOperation ? "PLAN_INITIALIZATION_SUCCEEDED" : "PLAN_REVISION_ACTIVATED",
      input.planRevisionId,
      JSON.stringify({
        tenant_id: context.tenantId,
        account_id: context.accountId,
        tenant_membership_id: context.tenantMembershipId,
        account_access_id: context.accountAccessId,
        plan_root_id: input.planRootId,
        plan_revision_id: input.planRevisionId,
        predecessor_plan_revision_id: input.predecessorPlanRevisionId ?? "",
        predecessor_revision_number: input.predecessorRevisionNumber ?? "",
        revision_number: input.revisionNumber,
        content_schema_version: contentSchemaVersion,
        plan_revision_content_hash: input.contentHash,
        idempotency_record_id: input.idempotencyRecordId,
        material_request_hash: input.materialRequestHash,
        operation: input.operation,
      }),
    ],
  );
  if (audit.rowCount !== 1) return fail("INTERNAL_ERROR");

  const binding = await client.query(
    [
      "insert into investing.plan_revision_success_audit_bindings (",
      "tenant_id, account_id, plan_root_id, plan_revision_id, predecessor_plan_revision_id, predecessor_revision_number,",
      "principal_id, tenant_membership_id, account_access_id, actor_kind, actor_id, operation_scope, operation,",
      "idempotency_record_id, material_request_hash, correlation_id, audit_event_id",
      ") values ($1, $2, $3, $4, $5, $6::bigint, $7, $8, $9, 'USER_PRINCIPAL', $10, 'ACCOUNT_SCOPE', $11, $12, $13, $14, $15)",
    ].join(" "),
    [
      context.tenantId,
      context.accountId,
      input.planRootId,
      input.planRevisionId,
      input.predecessorPlanRevisionId,
      input.predecessorRevisionNumber,
      context.principalId,
      context.tenantMembershipId,
      context.accountAccessId,
      context.actorId,
      input.operation,
      input.idempotencyRecordId,
      input.materialRequestHash,
      input.correlationId,
      auditEventId,
    ],
  );
  if (binding.rowCount !== 1) return fail("INTERNAL_ERROR");
  return { ok: true, replayed: false, planRootId: input.planRootId, planRevisionId: input.planRevisionId, activeVersion: input.revisionNumber, planRevisionContentHash: input.contentHash, idempotencyRecordId: input.idempotencyRecordId };
}

async function resolveInitializeRootRace(
  client: InvestingAuthorityTransactionClient,
  context: AuthorizedInvestingContext,
  input: {
    idempotencyRecordId: string;
    idempotencyKey: string;
    correlationId: string;
    materialRequestHash: string;
    contentHash: string;
  },
): Promise<WorkResult> {
  const winner = await client.query<PlanRevisionReplayRow>(
    [
      "select pr.plan_root_id, pr.plan_revision_id, pr.revision_number::text as revision_number,",
      "pr.content_schema_version, pr.plan_revision_content_hash, pr.material_request_hash, pr.idempotency_record_id",
      "from investing.plan_roots root",
      "join investing.plan_revisions pr on pr.tenant_id = root.tenant_id and pr.account_id = root.account_id",
      "and pr.plan_root_id = root.plan_root_id and pr.plan_revision_id = root.active_plan_revision_id",
      "where root.tenant_id = nullif(current_setting('syntrake.investing.tenant_id', true), '')::uuid",
      "and root.account_id = nullif(current_setting('syntrake.investing.account_id', true), '')::uuid",
    ].join(" "),
  );
  if (winner.rows.length !== 1) return fail("INTERNAL_ERROR");
  const row = winner.rows[0]!;
  if (
    row.revision_number !== "1" ||
    row.content_schema_version !== contentSchemaVersion ||
    row.plan_revision_content_hash !== input.contentHash ||
    row.material_request_hash !== input.materialRequestHash
  ) {
    return terminalConflict(client, {
      correlationId: input.correlationId,
      actorId: context.actorId,
      principalId: context.principalId,
      tenantId: context.tenantId,
      accountId: context.accountId,
      operation: initializeOperation,
      idempotencyRecordId: input.idempotencyRecordId,
      idempotencyKey: input.idempotencyKey,
      materialRequestHash: input.materialRequestHash,
      reasonCode: "I4_INITIAL_PLAN_ROOT_MATERIAL_CONFLICT",
      winnerPlanRevisionId: row.plan_revision_id,
      winnerMaterialRequestHash: row.material_request_hash,
      winnerContentHash: row.plan_revision_content_hash,
    });
  }
  return terminalSuccess(client, input.idempotencyRecordId, {
    planRootId: row.plan_root_id,
    planRevisionId: row.plan_revision_id,
    activeVersion: row.revision_number,
    planRevisionContentHash: row.plan_revision_content_hash,
  }, true);
}

async function resolveCreateAndActivateStaleRace(
  client: InvestingAuthorityTransactionClient,
  context: AuthorizedInvestingContext,
  input: {
    planRootId: string;
    expectedActiveRevisionId: string;
    expectedActiveVersion: string;
    observedActiveRevisionId: string;
    observedActiveVersion: string;
    idempotencyRecordId: string;
    idempotencyKey: string;
    correlationId: string;
    materialRequestHash: string;
    contentHash: string;
  },
): Promise<WorkResult> {
  const expectedSuccessorVersion = incrementActiveVersion(input.expectedActiveVersion);
  if (!expectedSuccessorVersion || input.observedActiveVersion !== expectedSuccessorVersion) return fail("CONFLICT");

  const winner = await client.query<PlanRevisionReplayRow>(
    [
      "select plan_root_id, plan_revision_id, revision_number::text as revision_number,",
      "predecessor_plan_revision_id, predecessor_revision_number::text as predecessor_revision_number,",
      "content_schema_version, plan_revision_content_hash, material_request_hash, idempotency_record_id",
      "from investing.plan_revisions",
      "where tenant_id = $1 and account_id = $2 and plan_root_id = $3 and plan_revision_id = $4",
      "and revision_number = $5::bigint",
    ].join(" "),
    [context.tenantId, context.accountId, input.planRootId, input.observedActiveRevisionId, expectedSuccessorVersion],
  );
  if (winner.rows.length !== 1) return fail("CONFLICT");
  const row = winner.rows[0]!;
  if (
    row.plan_root_id !== input.planRootId ||
    row.revision_number !== expectedSuccessorVersion ||
    row.predecessor_plan_revision_id !== input.expectedActiveRevisionId ||
    row.predecessor_revision_number !== input.expectedActiveVersion ||
    row.content_schema_version !== contentSchemaVersion ||
    row.material_request_hash !== input.materialRequestHash ||
    row.plan_revision_content_hash !== input.contentHash
  ) {
    return fail("CONFLICT");
  }

  // Exact replay is handled earlier by the original idempotency key. A fresh
  // idempotency record that arrives after another writer advanced the same
  // predecessor is a stale writer and must lose, even when material bytes match.
  return fail("CONFLICT");
}

async function dispatchExistingIdempotency(
  client: InvestingAuthorityTransactionClient,
  context: AuthorizedInvestingContext,
  row: IdempotencyRow,
  input: {
    operation: typeof initializeOperation | typeof createAndActivateOperation;
    correlationId: string;
    idempotencyKey: string;
    materialRequestHash: string;
  },
): Promise<WorkResult> {
  if (row.status === "SUCCEEDED") {
    if (row.material_request_hash !== input.materialRequestHash) {
      const conflictWritten = await insertConflictAudit(client, {
        correlationId: input.correlationId,
        actorId: context.actorId,
        principalId: context.principalId,
        tenantId: context.tenantId,
        accountId: context.accountId,
        operation: input.operation,
        idempotencyRecordId: row.idempotency_record_id,
        idempotencyKey: input.idempotencyKey,
        materialRequestHash: input.materialRequestHash,
        reasonCode: "I4_IDEMPOTENCY_MATERIAL_CONFLICT",
      });
      if (!conflictWritten) return fail("INTERNAL_ERROR");
      return { ...fail("CONFLICT"), commitFailure: true };
    }
    const reference = parsePlanReference(row.canonical_result_reference);
    if (!reference) return fail("INTERNAL_ERROR");
    await setTransactionContext(client, { plan_root_id: reference.planRootId, plan_revision_id: reference.planRevisionId });
    const current = await expectExactlyOne(
      client.query<PlanRevisionReplayRow>(
        [
          "select plan_root_id, plan_revision_id, revision_number::text as revision_number,",
          "predecessor_plan_revision_id, predecessor_revision_number::text as predecessor_revision_number,",
          "content_schema_version, plan_revision_content_hash, material_request_hash, idempotency_record_id, operation",
          "from investing.plan_revisions",
          "where tenant_id = $1 and account_id = $2 and plan_root_id = $3 and plan_revision_id = $4",
        ].join(" "),
        [row.tenant_id, row.account_id, reference.planRootId, reference.planRevisionId],
      ),
      "INTERNAL_ERROR",
    );
    if (current.ok === false) return current;
    if (
      current.row.revision_number !== reference.activeVersion ||
      current.row.content_schema_version !== contentSchemaVersion ||
      current.row.plan_revision_content_hash !== reference.planRevisionContentHash ||
      current.row.material_request_hash !== row.material_request_hash ||
      !isReplayableCanonicalRevision(current.row, row)
    ) {
      return fail("INTERNAL_ERROR");
    }
    return {
      ok: true,
      replayed: true,
      planRootId: reference.planRootId,
      planRevisionId: reference.planRevisionId,
      activeVersion: reference.activeVersion,
      planRevisionContentHash: reference.planRevisionContentHash,
      idempotencyRecordId: row.idempotency_record_id,
    };
  }
  if (row.status === "CONFLICT") return fail("CONFLICT");
  if (row.status === "STARTED") return fail("INTERNAL_ERROR");
  return fail("INTERNAL_ERROR");
}

async function terminalSuccess(
  client: InvestingAuthorityTransactionClient,
  idempotencyRecordId: string,
  effect: Omit<PlanMutationSuccess, "ok" | "replayed" | "idempotencyRecordId">,
  replayed: boolean,
): Promise<WorkResult> {
  const reference = {
    plan_root_id: effect.planRootId,
    plan_revision_id: effect.planRevisionId,
    active_version: effect.activeVersion,
    plan_revision_content_hash: effect.planRevisionContentHash,
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
  return { ok: true, replayed, idempotencyRecordId, ...effect };
}

async function terminalConflict(
  client: InvestingAuthorityTransactionClient,
  audit: PlanConflictAuditDraft,
): Promise<WorkResult> {
  const conflictWritten = await insertConflictAudit(client, audit);
  if (!conflictWritten) return fail("INTERNAL_ERROR");
  const updated = await client.query(
    [
      "update investing.idempotency_records",
      "set status = 'CONFLICT', canonical_result_reference = null, error_code = $2,",
      "updated_at = transaction_timestamp(), completed_at = transaction_timestamp()",
      "where idempotency_record_id = $1 and status = 'STARTED'",
    ].join(" "),
    [audit.idempotencyRecordId, audit.reasonCode],
  );
  if (updated.rowCount !== 1) return fail("INTERNAL_ERROR");
  return { ...fail("CONFLICT"), commitFailure: true };
}

async function insertConflictAudit(
  client: InvestingAuthorityTransactionClient,
  audit: PlanConflictAuditDraft,
) {
  const inserted = await client.query(
    [
      "insert into investing.audit_events (",
      "correlation_id, actor_kind, actor_id, principal_id, operation_scope, tenant_id, account_id,",
      "action, object_type, object_id, outcome, reason_code, evidence, occurred_at",
      ") values ($1, 'USER_PRINCIPAL', $2, $3, 'ACCOUNT_SCOPE', $4, $5, 'PLAN_MUTATION_CONFLICT', 'IDEMPOTENCY_RECORD', $6, 'CONFLICT', $7, $8::jsonb, transaction_timestamp())",
    ].join(" "),
    [
      audit.correlationId,
      audit.actorId,
      audit.principalId,
      audit.tenantId,
      audit.accountId,
      audit.idempotencyRecordId,
      audit.reasonCode,
      JSON.stringify({
        operation: audit.operation,
        idempotency_record_id: audit.idempotencyRecordId,
        idempotency_key: audit.idempotencyKey,
        material_request_hash: audit.materialRequestHash,
        plan_root_id: audit.planRootId ?? "",
        expected_active_revision_id: audit.expectedActiveRevisionId ?? "",
        expected_active_version: audit.expectedActiveVersion ?? "",
        observed_active_revision_id: audit.observedActiveRevisionId ?? "",
        observed_active_version: audit.observedActiveVersion ?? "",
        winner_plan_revision_id: audit.winnerPlanRevisionId ?? "",
        winner_material_request_hash: audit.winnerMaterialRequestHash ?? "",
        winner_content_hash: audit.winnerContentHash ?? "",
        conflict_reason: audit.reasonCode,
      }),
    ],
  );
  return inserted.rowCount === 1;
}

async function withPlanTransaction(
  database: InvestingAuthorityDatabase,
  work: (client: InvestingAuthorityTransactionClient) => Promise<WorkResult>,
): Promise<PlanMutationResult> {
  let client: InvestingAuthorityTransactionClient | null = null;
  let result: WorkResult = fail("INTERNAL_ERROR");
  let destroyClient = false;
  let cleanupFailed = false;

  try {
    client = await database.connect();
    await client.query("begin isolation level read committed");
    result = await work(client);
    destroyClient = result.ok === false && result.destroyClient === true;
    if (result.ok || (result.ok === false && result.commitFailure === true)) {
      await client.query("commit");
    } else {
      try {
        await client.query("rollback");
      } catch {
        cleanupFailed = true;
        destroyClient = true;
      }
    }
  } catch {
    if (client) {
      try {
        await client.query("rollback");
      } catch {
        destroyClient = true;
      }
    }
    cleanupFailed = true;
    result = fail("INTERNAL_ERROR");
  }

  if (client) {
    try {
      await client.release(destroyClient || cleanupFailed);
    } catch {
      cleanupFailed = true;
    }
  }

  if (result.ok === false && result.denialAudit) {
    const auditWritten = await writePlanDenialAudit(database, result.denialAudit);
    if (!auditWritten) return fail("INTERNAL_ERROR");
  }

  return cleanupFailed ? fail("INTERNAL_ERROR") : stripWorkFlags(result);
}

async function writePlanDenialAudit(database: InvestingAuthorityDatabase, audit: PlanDenialAuditDraft) {
  let client: InvestingAuthorityTransactionClient | null = null;
  let destroyClient = false;
  try {
    client = await database.connect();
    await client.query("begin");
    if (await hasStaleTransactionContext(client)) {
      destroyClient = true;
      throw new Error("STALE_INVESTING_TRANSACTION_CONTEXT");
    }
    await setTransactionContext(client, {
      actor_kind: "USER_PRINCIPAL",
      actor_id: audit.actorId,
      external_provider: "CLERK",
      external_subject: audit.actorId,
      principal_id: audit.principalId,
      tenant_id: audit.tenantId,
      account_id: audit.accountId,
      operation: audit.operation,
      capability: planWriteCapability,
      correlation_id: audit.correlationId,
    });
    await client.query(
      [
        "insert into investing.audit_events (",
        "correlation_id, actor_kind, actor_id, principal_id, operation_scope, tenant_id, account_id,",
        "action, object_type, object_id, outcome, reason_code, evidence, occurred_at",
        ") values ($1, 'USER_PRINCIPAL', $2, $3, 'ACCOUNT_SCOPE', $4, $5::uuid, 'AUTHORITY_ACCESS_DENIED', 'ACCOUNT', $5::uuid::text, $6, $7, $8::jsonb, transaction_timestamp())",
      ].join(" "),
      [
        audit.correlationId,
        audit.actorId,
        audit.principalId,
        audit.tenantId,
        audit.accountId,
        audit.outcome,
        audit.reasonCode,
        JSON.stringify({ operation: audit.operation, denial_stage: audit.reasonCode }),
      ],
    );
    await client.query("commit");
    return true;
  } catch {
    if (client) {
      try {
        await client.query("rollback");
      } catch {
        destroyClient = true;
      }
    }
    return false;
  } finally {
    if (client) {
      try {
        await client.release(destroyClient);
      } catch {
        return false;
      }
    }
  }
}

function authorityDenial(
  context: AuthorizedInvestingContext,
  operation: typeof initializeOperation | typeof createAndActivateOperation,
  correlationId: string,
  reasonCode: PlanDenialAuditDraft["reasonCode"],
  outcome: PlanDenialAuditDraft["outcome"],
): WorkFailure {
  const code: PlanMutationFailureCode = reasonCode === "AUTHORITY_TUPLE_MISMATCH" ? "INTERNAL_ERROR" : reasonCode;
  return {
    ...fail(code),
    denialAudit: {
      correlationId,
      actorId: context.actorId,
      principalId: context.principalId,
      tenantId: context.tenantId,
      accountId: context.accountId,
      reasonCode,
      outcome,
      operation,
    },
  };
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
  values: Record<string, string>,
) {
  for (const [key, value] of Object.entries(values)) {
    await client.query("select set_config($1, $2, true)", [`syntrake.investing.${key}`, value]);
  }
}

async function expectExactlyOne<Row>(
  query: Promise<InvestingAuthorityQueryResult<Row>>,
  emptyCode: PlanMutationFailureCode,
): Promise<{ ok: true; row: Row } | WorkFailure> {
  const result = await query;
  if (result.rows.length === 0) return fail(emptyCode);
  if (result.rows.length > 1) return fail("INTERNAL_ERROR");
  return { ok: true, row: result.rows[0]! };
}

function parsePlanReference(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.plan_root_id !== "string" || !canonicalUuidPattern.test(record.plan_root_id)) return null;
  if (typeof record.plan_revision_id !== "string" || !canonicalUuidPattern.test(record.plan_revision_id)) return null;
  if (typeof record.active_version !== "string" || !isCanonicalActiveVersion(record.active_version)) return null;
  if (typeof record.plan_revision_content_hash !== "string" || !/^[A-F0-9]{64}$/.test(record.plan_revision_content_hash)) return null;
  return {
    planRootId: record.plan_root_id,
    planRevisionId: record.plan_revision_id,
    activeVersion: record.active_version,
    planRevisionContentHash: record.plan_revision_content_hash,
  };
}

function idempotencyBelongsToContext(
  row: IdempotencyRow,
  context: AuthorizedInvestingContext,
  operation: typeof initializeOperation | typeof createAndActivateOperation,
  idempotencyKey: string,
) {
  return row.actor_kind === "USER_PRINCIPAL" &&
    row.actor_id === context.actorId &&
    row.principal_id === context.principalId &&
    row.tenant_id === context.tenantId &&
    row.account_id === context.accountId &&
    row.operation_scope === "ACCOUNT_SCOPE" &&
    row.operation === operation &&
    row.idempotency_key === idempotencyKey;
}

function isReplayableCanonicalRevision(revision: PlanRevisionReplayRow, row: IdempotencyRow) {
  if (revision.idempotency_record_id === row.idempotency_record_id) return true;
  if (revision.operation !== row.operation) return false;
  if (row.operation === initializeOperation) {
    return revision.revision_number === "1" &&
      revision.predecessor_plan_revision_id == null &&
      revision.predecessor_revision_number == null;
  }
  const predecessorVersion = decrementActiveVersion(revision.revision_number);
  return predecessorVersion !== null &&
    revision.predecessor_plan_revision_id != null &&
    revision.predecessor_revision_number === predecessorVersion;
}

function isExactTerminalReplay(row: IdempotencyRow, materialRequestHash: string) {
  return row.status === "SUCCEEDED" && row.material_request_hash === materialRequestHash;
}

function decrementActiveVersion(value: string) {
  if (!isCanonicalActiveVersion(value) || value === "1") return null;
  const digits = value.split("").map((digit) => digit.charCodeAt(0) - 48);
  let index = digits.length - 1;
  while (index >= 0) {
    if (digits[index]! > 0) {
      digits[index] = digits[index]! - 1;
      break;
    }
    digits[index] = 9;
    index -= 1;
  }
  while (digits.length > 1 && digits[0] === 0) digits.shift();
  return digits.join("");
}

function tokenBytes(value: string | undefined, allowed: Set<string>) {
  if (value === undefined || !allowed.has(value)) throw new Error("invalid token");
  return Buffer.from(value, "utf8");
}

function textBytes(value: string | undefined, maxBytes: number) {
  if (value === undefined) throw new Error("missing text");
  rejectMalformedScalarText(value);
  const normalized = value.normalize("NFC");
  rejectMalformedScalarText(normalized);
  const byteLength = Buffer.byteLength(normalized, "utf8");
  if (byteLength < 1 || byteLength > maxBytes) throw new Error("text byte length out of bounds");
  return Buffer.from(normalized, "utf8");
}

function moneyBytes(value: PlanFieldValue) {
  if (value.amount === undefined || value.currency === undefined || !acceptedCurrencies.has(value.currency)) {
    throw new Error("invalid money");
  }
  return Buffer.from(`amount=${canonicalDecimal(value.amount)}\ncurrency=${value.currency}`, "utf8");
}

function dateBytes(value: string | undefined) {
  if (value === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("invalid date");
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day));
  if (year! < 1900 || year! > 2200 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month! - 1 || date.getUTCDate() !== day) {
    throw new Error("invalid date");
  }
  return Buffer.from(value, "utf8");
}

function integerBytes(value: string | undefined) {
  if (value === undefined || !/^(0|[1-9][0-9]*)$/.test(value)) throw new Error("invalid integer");
  const parsed = Number(value);
  if (parsed < 0 || parsed > 1200 || String(parsed) !== value) throw new Error("invalid integer");
  return Buffer.from(value, "utf8");
}

function tokenSetBytes(items: readonly string[] | undefined) {
  if (!items || items.length > 16) throw new Error("invalid token set");
  const seen = new Set<string>();
  for (const item of items) {
    if (!acceptedAssetClasses.has(item) || seen.has(item)) throw new Error("invalid token set");
    seen.add(item);
  }
  const value = [...items].sort((left, right) => Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"))).join("\n");
  if (Buffer.byteLength(value, "utf8") > 512) throw new Error("invalid token set");
  return Buffer.from(value, "utf8");
}

function canonicalDecimal(value: string) {
  if (!/^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(value)) throw new Error("invalid decimal");
  const [whole, fraction = ""] = value.split(".");
  const canonicalFraction = fraction.replace(/0+$/, "");
  if (whole!.length > 16 || canonicalFraction.length > 2) throw new Error("decimal out of bounds");
  return canonicalFraction === "" ? whole! : `${whole}.${canonicalFraction}`;
}

function rejectMalformedScalarText(value: string) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new Error("malformed unicode surrogate");
      index += 1;
      continue;
    }
    if (code >= 0xdc00 && code <= 0xdfff) throw new Error("malformed unicode surrogate");
    if (code < 0x20 || code === 0x7f) throw new Error("control character rejected");
  }
}

function isCanonicalActiveVersion(value: string) {
  return /^[1-9][0-9]*$/.test(value) &&
    (value.length < maxBigintText.length || (value.length === maxBigintText.length && value <= maxBigintText));
}

function incrementActiveVersion(value: string) {
  if (!isCanonicalActiveVersion(value)) return null;

  let carry = 1;
  let next = "";
  for (let index = value.length - 1; index >= 0; index -= 1) {
    const digit = value.charCodeAt(index) - 48 + carry;
    if (digit >= 10) {
      next = `0${next}`;
      carry = 1;
    } else {
      next = `${digit}${next}`;
      carry = 0;
    }
  }
  if (carry === 1) next = `1${next}`;

  return isCanonicalActiveVersion(next) ? next : null;
}

function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex").toUpperCase();
}

function fail(code: PlanMutationFailureCode): WorkFailure {
  return { ok: false, code };
}

function stripWorkFlags(result: WorkResult): PlanMutationResult {
  if (result.ok === true) return result;
  return { ok: false, code: result.code };
}
