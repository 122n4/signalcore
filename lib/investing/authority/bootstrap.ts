import { createHash, randomUUID } from "node:crypto";
import { resolveVerifiedClerkIdentity } from "./clerk";
import {
  type InvestingAuthorityDatabase,
  type InvestingAuthorityQueryResult,
  type InvestingAuthorityTransactionClient,
} from "./context";
import { getInvestingAuthorityDatabase } from "./transport";

const bootstrapOperation = "INITIAL_PERSONAL_BOOTSTRAP";
const bootstrapCapability = "AUTHORITY_BOOTSTRAP";
const materialHashDomain = "SYNTRAKE_INVESTING_I2C_BOOTSTRAP_MATERIAL_V1";
const bootstrapPreAuthoritySubjectHashDomain = "SYNTRAKE_INVESTING_I2C_EXTERNAL_SUBJECT_V1";
const bootstrapPreAuthoritySelectorHashDomain = "SYNTRAKE_INVESTING_I2C_IDEMPOTENCY_KEY_V1";

type BootstrapFailureCode =
  | "UNAUTHENTICATED"
  | "VALIDATION_ERROR"
  | "PRINCIPAL_DISABLED"
  | "TENANT_INACTIVE"
  | "MEMBERSHIP_INACTIVE"
  | "ACCOUNT_INACTIVE"
  | "ACCESS_INACTIVE"
  | "CONFLICT"
  | "INTERNAL_ERROR";

export type BootstrapInitialPersonalAccountInput = {
  idempotencyKey: string;
  correlationId: string;
  baseCurrency: string;
};

export type BootstrapInitialPersonalAccountSuccess = {
  ok: true;
  replayed: boolean;
  principalId: string;
  tenantId: string;
  tenantMembershipId: string;
  accountId: string;
  accountAccessId: string;
  baseCurrency: string;
  idempotencyRecordId: string;
};

export type BootstrapInitialPersonalAccountFailure = {
  ok: false;
  code: BootstrapFailureCode;
  externalCode: "UNAUTHENTICATED" | "FORBIDDEN_OR_NOT_FOUND" | "INTERNAL_ERROR";
};

export type BootstrapInitialPersonalAccountResult =
  | BootstrapInitialPersonalAccountSuccess
  | BootstrapInitialPersonalAccountFailure;

type PrincipalRow = {
  principal_id: string;
  state: "ACTIVE" | "DISABLED";
};

type IdempotencyRow = {
  idempotency_record_id: string;
  material_request_hash: string;
  status: "STARTED" | "SUCCEEDED" | "FAILED" | "CONFLICT";
  canonical_result_reference: BootstrapCanonicalReference | null;
};

type AccountRow = {
  account_id: string;
  tenant_id: string;
  initial_tenant_membership_id: string;
  initial_principal_id: string;
  account_origin: "INITIAL_PERSONAL_BOOTSTRAP";
  base_currency: string;
  state: "ACTIVE" | "FROZEN" | "CLOSED";
};

type TenantRow = {
  tenant_id: string;
  state: "ACTIVE" | "SUSPENDED" | "CLOSED";
};

type TenantMembershipRow = {
  tenant_membership_id: string;
  tenant_id: string;
  principal_id: string;
  state: "ACTIVE" | "REVOKED";
};

type AccountAccessRow = {
  account_access_id: string;
  account_id: string;
  tenant_id: string;
  tenant_membership_id: string;
  principal_id: string;
  state: "ACTIVE" | "REVOKED";
};

type BootstrapCanonicalReference = {
  principalId: string;
  tenantId: string;
  tenantMembershipId: string;
  accountId: string;
  accountAccessId: string;
  baseCurrency: string;
};

type BootstrapPreAuthorityAuditDraft = {
  externalProvider: "CLERK";
  externalSubjectHash: string;
  correlationId: string;
  operation: typeof bootstrapOperation;
  operationScope: "DOMAIN_SCOPE";
  selectorKind: "IDEMPOTENCY_KEY";
  selectorHash: string;
  resolutionStage: "INPUT_VALIDATION" | "TRANSACTION_CONTEXT_PREFLIGHT" | "BOOTSTRAP_INTERNAL";
  outcome: "DENIED" | "ERROR";
  reasonCode: "VALIDATION_ERROR" | "STALE_TRANSACTION_CONTEXT" | "BOOTSTRAP_INTERNAL_ERROR";
};

type CanonicalBootstrapAuditDraft = {
  correlationId: string;
  actorId: string;
  principalId: string;
  operationScope: "DOMAIN_SCOPE" | "ACCOUNT_SCOPE";
  tenantId: string | null;
  accountId: string | null;
  action: "AUTHORITY_BOOTSTRAP_SUCCEEDED" | "AUTHORITY_BOOTSTRAP_FAILED";
  objectType: "PRINCIPAL" | "ACCOUNT" | "IDEMPOTENCY_RECORD";
  objectId: string;
  outcome: "SUCCEEDED" | "DENIED" | "CONFLICT" | "FAILED";
  reasonCode:
    | null
    | "PRINCIPAL_DISABLED"
    | "TENANT_INACTIVE"
    | "MEMBERSHIP_INACTIVE"
    | "ACCOUNT_INACTIVE"
    | "ACCESS_INACTIVE"
    | "BOOTSTRAP_INTERNAL_ERROR"
    | "DUPLICATE_INITIAL_ACCOUNT_CORRUPTION"
    | "INITIAL_BOOTSTRAP_MATERIAL_CONFLICT"
    | "PARTIAL_AUTHORITY_GRAPH"
    | "AUTHORITY_TUPLE_MISMATCH"
    | "IDEMPOTENCY_CONFLICT"
    | "IDEMPOTENCY_IN_PROGRESS"
    | "IDEMPOTENCY_FAILED";
  evidence: Record<string, string>;
};

type BootstrapWorkResult =
  | (BootstrapInitialPersonalAccountSuccess & { preAuthorityAudit?: undefined; canonicalAudit?: CanonicalBootstrapAuditDraft })
  | (BootstrapInitialPersonalAccountFailure & {
      preAuthorityAudit?: BootstrapPreAuthorityAuditDraft;
      canonicalAudit?: CanonicalBootstrapAuditDraft;
      destroyClient?: boolean;
      commitFailure?: boolean;
    });

type BootstrapUnexpectedAudit = {
  preAuthorityAudit?: BootstrapPreAuthorityAuditDraft;
  canonicalAudit?: CanonicalBootstrapAuditDraft;
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const forbiddenClientAuthorityFields = new Set([
  "userId",
  "tenantId",
  "principalId",
  "accountId",
  "tenantMembershipId",
  "accountAccessId",
  "operation",
  "capability",
  "database",
  "clerkAuth",
  "authorizedContext",
  "AuthorizedInvestingContext",
  "context",
  "service_role",
  "serviceRole",
]);

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
  "syntrake.investing.base_currency",
  "syntrake.investing.candidate_tenant_id",
  "syntrake.investing.candidate_tenant_membership_id",
  "syntrake.investing.candidate_account_id",
  "syntrake.investing.candidate_account_access_id",
] as const;

export async function bootstrapInitialPersonalInvestingAccount(
  input: BootstrapInitialPersonalAccountInput,
): Promise<BootstrapInitialPersonalAccountResult> {
  const forbiddenFieldFailure = rejectClientAuthorityFields(input);
  if (forbiddenFieldFailure) return forbiddenFieldFailure;

  const verifiedAuth = await resolveVerifiedClerkIdentity();
  if (verifiedAuth.ok === false) return fail(verifiedAuth.code);

  const normalizedBaseCurrency = normalizeBaseCurrency(input.baseCurrency);
  if (
    !normalizedBaseCurrency ||
    !isValidCorrelationId(input.correlationId) ||
    !isValidIdempotencyKey(input.idempotencyKey)
  ) {
    return writeBestEffortPreAuthorityFailure(
      fail("VALIDATION_ERROR"),
      createBootstrapPreAuthorityAudit({
        externalSubject: verifiedAuth.externalSubject,
        idempotencyKey: String(input.idempotencyKey ?? ""),
        correlationId: auditCorrelationId(input.correlationId),
        resolutionStage: "INPUT_VALIDATION",
        outcome: "DENIED",
        reasonCode: "VALIDATION_ERROR",
      }),
    );
  }

  let database: InvestingAuthorityDatabase;
  try {
    database = getInvestingAuthorityDatabase();
  } catch {
    return fail("INTERNAL_ERROR");
  }

  const materialRequestHash = hashMaterialRequest({
    externalProvider: verifiedAuth.externalProvider,
    externalSubject: verifiedAuth.externalSubject,
    baseCurrency: normalizedBaseCurrency,
  });

  let durablePrincipalForUnexpectedAudit: { principalId: string } | null = null;
  const preAuthorityInternalFailureAudit = () =>
    createBootstrapPreAuthorityAudit({
      externalSubject: verifiedAuth.externalSubject,
      idempotencyKey: input.idempotencyKey,
      correlationId: input.correlationId,
      resolutionStage: "BOOTSTRAP_INTERNAL",
      outcome: "ERROR",
      reasonCode: "BOOTSTRAP_INTERNAL_ERROR",
    });
  const unexpectedFailureAudit = (): BootstrapUnexpectedAudit =>
    durablePrincipalForUnexpectedAudit
      ? {
          canonicalAudit: canonicalCorruptGraphAudit({
            correlationId: input.correlationId,
            actorId: verifiedAuth.externalSubject,
            principalId: durablePrincipalForUnexpectedAudit.principalId,
            reasonCode: "BOOTSTRAP_INTERNAL_ERROR",
            evidence: { failure_stage: "unexpected_bootstrap_failure_after_durable_principal" },
          }),
        }
      : { preAuthorityAudit: preAuthorityInternalFailureAudit() };

  const transaction = await withBootstrapTransaction(database, async (client) => {
    const staleContext = await hasStaleTransactionContext(client);
    if (staleContext) {
      return {
        ...fail("INTERNAL_ERROR"),
        destroyClient: true,
        preAuthorityAudit: createBootstrapPreAuthorityAudit({
          externalSubject: verifiedAuth.externalSubject,
          idempotencyKey: input.idempotencyKey,
          correlationId: auditCorrelationId(input.correlationId),
          resolutionStage: "TRANSACTION_CONTEXT_PREFLIGHT",
          outcome: "ERROR",
          reasonCode: "STALE_TRANSACTION_CONTEXT",
        }),
      };
    }

    await setTransactionContext(client, {
      actor_kind: "USER_PRINCIPAL",
      actor_id: verifiedAuth.externalSubject,
      external_provider: verifiedAuth.externalProvider,
      external_subject: verifiedAuth.externalSubject,
      operation: bootstrapOperation,
      capability: bootstrapCapability,
      correlation_id: input.correlationId,
      idempotency_key: input.idempotencyKey,
      material_request_hash: materialRequestHash,
      base_currency: normalizedBaseCurrency,
    });

    const principalInsert = await client.query(
      [
        "insert into investing.principals (external_provider, external_subject)",
        "values ($1, $2)",
        "on conflict (external_provider, external_subject) do nothing",
      ].join(" "),
      [verifiedAuth.externalProvider, verifiedAuth.externalSubject],
    );
    const principalInsertCheck = expectDmlZeroOrOne(principalInsert);
    if (principalInsertCheck.ok === false) return principalInsertCheck;

    const principal = await expectExactlyOne(
      client.query<PrincipalRow>(
        [
          "select principal_id, state",
          "from investing.principals",
          "where external_provider = $1 and external_subject = $2",
        ].join(" "),
        [verifiedAuth.externalProvider, verifiedAuth.externalSubject],
      ),
      "INTERNAL_ERROR",
    );
    if (principal.ok === false) return principal;

    if (principalInsertCheck.inserted === false) {
      durablePrincipalForUnexpectedAudit = { principalId: principal.row.principal_id };
    }

    await setTransactionContext(client, {
      principal_id: principal.row.principal_id,
    });

    if (principal.row.state !== "ACTIVE") {
      return canonicalFailure("PRINCIPAL_DISABLED", {
        correlationId: input.correlationId,
        actorId: verifiedAuth.externalSubject,
        principalId: principal.row.principal_id,
        operationScope: "DOMAIN_SCOPE",
        tenantId: null,
        accountId: null,
        action: "AUTHORITY_BOOTSTRAP_FAILED",
        objectType: "PRINCIPAL",
        objectId: principal.row.principal_id,
        outcome: "DENIED",
        reasonCode: "PRINCIPAL_DISABLED",
        evidence: { principal_state: principal.row.state },
      });
    }

    const idempotencyRecordId = randomUUID();
    const idemInsert = await client.query(
      [
        "insert into investing.idempotency_records (",
        "idempotency_record_id, idempotency_key, material_request_hash, correlation_id,",
        "actor_kind, actor_id, operation_scope, operation, principal_id, status",
        ") values ($1, $2, $3, $4, 'USER_PRINCIPAL', $5, 'DOMAIN_SCOPE', $6, $7, 'STARTED')",
        "on conflict (actor_kind, actor_id, operation_scope, operation, idempotency_key) do nothing",
      ].join(" "),
      [
        idempotencyRecordId,
        input.idempotencyKey,
        materialRequestHash,
        input.correlationId,
        verifiedAuth.externalSubject,
        bootstrapOperation,
        principal.row.principal_id,
      ],
    );
    const idemInsertCheck = expectDmlZeroOrOne(idemInsert);
    if (idemInsertCheck.ok === false) return idemInsertCheck;

    const idempotency = await expectExactlyOne(
      client.query<IdempotencyRow>(
        [
          "select idempotency_record_id, material_request_hash, status, canonical_result_reference",
          "from investing.idempotency_records",
          "where actor_kind = 'USER_PRINCIPAL'",
          "and actor_id = $1",
          "and operation_scope = 'DOMAIN_SCOPE'",
          "and operation = $2",
          "and idempotency_key = $3",
        ].join(" "),
        [verifiedAuth.externalSubject, bootstrapOperation, input.idempotencyKey],
      ),
      "INTERNAL_ERROR",
    );
    if (idempotency.ok === false) return idempotency;

    await setTransactionContext(client, {
      idempotency_record_id: idempotency.row.idempotency_record_id,
    });

    if (idemInsertCheck.inserted === false) {
      return await dispatchExistingIdempotency(client, {
        idempotency: idempotency.row,
        materialRequestHash,
        expectedBaseCurrency: normalizedBaseCurrency,
        correlationId: input.correlationId,
        actorId: verifiedAuth.externalSubject,
        principalId: principal.row.principal_id,
      });
    }

    if (idempotency.row.idempotency_record_id !== idempotencyRecordId || idempotency.row.status !== "STARTED") {
      return fail("INTERNAL_ERROR");
    }

    const auditContext = {
      correlationId: input.correlationId,
      actorId: verifiedAuth.externalSubject,
    };
    const existingGraph = await inspectInitialGraph(client, principal.row.principal_id, auditContext);
    if (existingGraph.ok === false) {
      return canonicalFailure(graphAuditFailureCode(existingGraph.audit), existingGraph.audit);
    }

    if (existingGraph.graph) {
      if (existingGraph.graph.account.base_currency !== normalizedBaseCurrency) {
        return withIdempotencyTerminal(
          client,
          idempotencyRecordId,
          "CONFLICT",
          null,
          canonicalIdempotencyConflictAudit({
            correlationId: input.correlationId,
            actorId: verifiedAuth.externalSubject,
            principalId: principal.row.principal_id,
            idempotencyRecordId,
            reasonCode: "IDEMPOTENCY_CONFLICT",
            evidence: { reason: "existing_initial_account_material_differs" },
          }),
        );
      }

      const reference = graphReference(existingGraph.graph);
      return completeSuccess(client, {
        idempotencyRecordId,
        correlationId: input.correlationId,
        actorId: verifiedAuth.externalSubject,
        reference,
        replayed: true,
      });
    }

    const candidates = {
      tenantId: randomUUID(),
      tenantMembershipId: randomUUID(),
      accountId: randomUUID(),
      accountAccessId: randomUUID(),
    };

    await setTransactionContext(client, {
      candidate_tenant_id: candidates.tenantId,
      candidate_tenant_membership_id: candidates.tenantMembershipId,
      candidate_account_id: candidates.accountId,
      candidate_account_access_id: candidates.accountAccessId,
    });

    await client.query("savepoint candidate_graph");
    const tenantInsert = await client.query(
      "insert into investing.tenants (tenant_id) values ($1)",
      [candidates.tenantId],
    );
    const tenantInsertCheck = expectDmlExactlyOne(tenantInsert);
    if (tenantInsertCheck.ok === false) return tenantInsertCheck;

    const membershipInsert = await client.query(
      [
        "insert into investing.tenant_memberships (tenant_membership_id, tenant_id, principal_id, role, state)",
        "values ($1, $2, $3, 'OWNER', 'ACTIVE')",
      ].join(" "),
      [candidates.tenantMembershipId, candidates.tenantId, principal.row.principal_id],
    );
    const membershipInsertCheck = expectDmlExactlyOne(membershipInsert);
    if (membershipInsertCheck.ok === false) return membershipInsertCheck;

    const accountInsert = await client.query(
      [
        "insert into investing.accounts (",
        "account_id, tenant_id, initial_tenant_membership_id, initial_principal_id,",
        "account_kind, account_origin, base_currency, state",
        ") values ($1, $2, $3, $4, 'PERSONAL', 'INITIAL_PERSONAL_BOOTSTRAP', $5, 'ACTIVE')",
        "on conflict (initial_principal_id)",
        "where account_origin = 'INITIAL_PERSONAL_BOOTSTRAP'",
        "do nothing",
      ].join(" "),
      [
        candidates.accountId,
        candidates.tenantId,
        candidates.tenantMembershipId,
        principal.row.principal_id,
        normalizedBaseCurrency,
      ],
    );
    const accountInsertCheck = expectDmlZeroOrOne(accountInsert);
    if (accountInsertCheck.ok === false) return accountInsertCheck;

    if (accountInsertCheck.inserted === false) {
      await client.query("rollback to savepoint candidate_graph");
      const replayGraph = await inspectInitialGraph(client, principal.row.principal_id, auditContext);
      if (replayGraph.ok === false) {
        return canonicalFailure(graphAuditFailureCode(replayGraph.audit), replayGraph.audit);
      }
      if (!replayGraph.graph || replayGraph.graph.account.base_currency !== normalizedBaseCurrency) {
        return withIdempotencyTerminal(
          client,
          idempotencyRecordId,
          "CONFLICT",
          null,
          canonicalIdempotencyConflictAudit({
            correlationId: input.correlationId,
            actorId: verifiedAuth.externalSubject,
            principalId: principal.row.principal_id,
            idempotencyRecordId,
            reasonCode: "INITIAL_BOOTSTRAP_MATERIAL_CONFLICT",
            evidence: { reason: "account_conflict_winner_not_equivalent" },
          }),
        );
      }
      return completeSuccess(client, {
        idempotencyRecordId,
        correlationId: input.correlationId,
        actorId: verifiedAuth.externalSubject,
        reference: graphReference(replayGraph.graph),
        replayed: true,
      });
    }

    const accessInsert = await client.query(
      [
        "insert into investing.account_access (",
        "account_access_id, account_id, tenant_id, tenant_membership_id, principal_id, role, state",
        ") values ($1, $2, $3, $4, $5, 'OWNER', 'ACTIVE')",
      ].join(" "),
      [
        candidates.accountAccessId,
        candidates.accountId,
        candidates.tenantId,
        candidates.tenantMembershipId,
        principal.row.principal_id,
      ],
    );
    const accessInsertCheck = expectDmlExactlyOne(accessInsert);
    if (accessInsertCheck.ok === false) return accessInsertCheck;

    const reference: BootstrapCanonicalReference = {
      principalId: principal.row.principal_id,
      tenantId: candidates.tenantId,
      tenantMembershipId: candidates.tenantMembershipId,
      accountId: candidates.accountId,
      accountAccessId: candidates.accountAccessId,
      baseCurrency: normalizedBaseCurrency,
    };

    return completeSuccess(client, {
      idempotencyRecordId,
      correlationId: input.correlationId,
      actorId: verifiedAuth.externalSubject,
      reference,
      replayed: false,
    });
  }, unexpectedFailureAudit);

  if (transaction.preAuthorityAudit) {
    const audited = await writeBootstrapPreAuthorityAudit(database, transaction.preAuthorityAudit);
    if (!audited) return fail("INTERNAL_ERROR");
  }

  if (transaction.canonicalAudit) {
    const audited = await writeCanonicalBootstrapAudit(database, transaction.canonicalAudit);
    if (!audited) return fail("INTERNAL_ERROR");
  }

  return transaction.result;
}

async function completeSuccess(
  client: InvestingAuthorityTransactionClient,
  input: {
    idempotencyRecordId: string;
    correlationId: string;
    actorId: string;
    reference: BootstrapCanonicalReference;
    replayed: boolean;
  },
): Promise<BootstrapWorkResult> {
  const updated = await client.query(
    [
      "update investing.idempotency_records",
      "set status = 'SUCCEEDED',",
      "canonical_result_reference = $2::jsonb,",
      "error_code = null, updated_at = transaction_timestamp(), completed_at = transaction_timestamp()",
      "where idempotency_record_id = $1 and status = 'STARTED'",
    ].join(" "),
    [input.idempotencyRecordId, JSON.stringify(input.reference)],
  );
  const updateCheck = expectDmlExactlyOne(updated);
  if (updateCheck.ok === false) return updateCheck;

  await setTransactionContext(client, {
    tenant_id: input.reference.tenantId,
    account_id: input.reference.accountId,
    tenant_membership_id: input.reference.tenantMembershipId,
    account_access_id: input.reference.accountAccessId,
  });

  await insertCanonicalBootstrapAudit(client, {
    correlationId: input.correlationId,
    actorId: input.actorId,
    principalId: input.reference.principalId,
    operationScope: "ACCOUNT_SCOPE",
    tenantId: input.reference.tenantId,
    accountId: input.reference.accountId,
    action: "AUTHORITY_BOOTSTRAP_SUCCEEDED",
    objectType: "ACCOUNT",
    objectId: input.reference.accountId,
    outcome: "SUCCEEDED",
    reasonCode: null,
    evidence: { replayed: String(input.replayed) },
  });

  return {
    ok: true,
    replayed: input.replayed,
    ...input.reference,
    idempotencyRecordId: input.idempotencyRecordId,
  };
}

async function withIdempotencyTerminal(
  client: InvestingAuthorityTransactionClient,
  idempotencyRecordId: string,
  status: "CONFLICT",
  reference: BootstrapCanonicalReference | null,
  audit: CanonicalBootstrapAuditDraft,
): Promise<BootstrapWorkResult> {
  const updated = await client.query(
    [
      "update investing.idempotency_records",
      "set status = $2, canonical_result_reference = $3::jsonb,",
      "error_code = $4, updated_at = transaction_timestamp(), completed_at = transaction_timestamp()",
      "where idempotency_record_id = $1 and status = 'STARTED'",
    ].join(" "),
    [idempotencyRecordId, status, JSON.stringify(reference), audit.reasonCode],
  );
  const updateCheck = expectDmlExactlyOne(updated);
  if (updateCheck.ok === false) return updateCheck;

  await insertCanonicalBootstrapAudit(client, audit);

  return {
    ...fail("CONFLICT"),
    commitFailure: true,
  };
}

async function dispatchExistingIdempotency(client: InvestingAuthorityTransactionClient, input: {
  idempotency: IdempotencyRow;
  materialRequestHash: string;
  expectedBaseCurrency: string;
  correlationId: string;
  actorId: string;
  principalId: string;
}): Promise<BootstrapWorkResult> {
  const { idempotency, materialRequestHash } = input;

  if (idempotency.status === "SUCCEEDED") {
    if (idempotency.material_request_hash !== materialRequestHash) {
      const audit = canonicalIdempotencyConflictAudit({
        correlationId: input.correlationId,
        actorId: input.actorId,
        principalId: input.principalId,
        idempotencyRecordId: idempotency.idempotency_record_id,
        reasonCode: "IDEMPOTENCY_CONFLICT",
        evidence: { status: idempotency.status },
      });
      await insertCanonicalBootstrapAudit(client, audit);
      return { ...fail("CONFLICT"), commitFailure: true };
    }
    if (!isBootstrapCanonicalReference(idempotency.canonical_result_reference)) {
      return fail("INTERNAL_ERROR");
    }
    const replayValidation = await validateCanonicalReplayReference(client, {
      reference: idempotency.canonical_result_reference,
      principalId: input.principalId,
      expectedBaseCurrency: input.expectedBaseCurrency,
    });
    if (replayValidation.ok === false) return replayValidation;
    await insertCanonicalBootstrapAudit(client, {
      correlationId: input.correlationId,
      actorId: input.actorId,
      principalId: input.principalId,
      operationScope: "ACCOUNT_SCOPE",
      tenantId: idempotency.canonical_result_reference.tenantId,
      accountId: idempotency.canonical_result_reference.accountId,
      action: "AUTHORITY_BOOTSTRAP_SUCCEEDED",
      objectType: "ACCOUNT",
      objectId: idempotency.canonical_result_reference.accountId,
      outcome: "SUCCEEDED",
      reasonCode: null,
      evidence: { replayed: "true", idempotency_record_id: idempotency.idempotency_record_id },
    });
    return {
      ok: true,
      replayed: true,
      ...idempotency.canonical_result_reference,
      idempotencyRecordId: idempotency.idempotency_record_id,
    };
  }

  if (idempotency.status === "CONFLICT") {
    const audit = canonicalIdempotencyConflictAudit({
      correlationId: input.correlationId,
      actorId: input.actorId,
      principalId: input.principalId,
      idempotencyRecordId: idempotency.idempotency_record_id,
      reasonCode: "IDEMPOTENCY_CONFLICT",
      evidence: { status: idempotency.status },
    });
    await insertCanonicalBootstrapAudit(client, audit);
    return { ...fail("CONFLICT"), commitFailure: true };
  }

  if (idempotency.status === "STARTED") {
    const audit = canonicalIdempotencyConflictAudit({
      correlationId: input.correlationId,
      actorId: input.actorId,
      principalId: input.principalId,
      idempotencyRecordId: idempotency.idempotency_record_id,
      reasonCode: "IDEMPOTENCY_IN_PROGRESS",
      evidence: { status: idempotency.status },
    });
    await insertCanonicalBootstrapAudit(client, audit);
    return { ...fail("INTERNAL_ERROR"), commitFailure: true };
  }

  const audit = canonicalIdempotencyConflictAudit({
    correlationId: input.correlationId,
    actorId: input.actorId,
    principalId: input.principalId,
    idempotencyRecordId: idempotency.idempotency_record_id,
    reasonCode: "IDEMPOTENCY_FAILED",
    evidence: { status: idempotency.status },
  });
  await insertCanonicalBootstrapAudit(client, audit);
  return { ...fail("INTERNAL_ERROR"), commitFailure: true };
}

async function inspectInitialGraph(
  client: InvestingAuthorityTransactionClient,
  principalId: string,
  auditContext: { correlationId: string; actorId: string },
): Promise<
  | { ok: true; graph: null | { tenant: TenantRow; membership: TenantMembershipRow; account: AccountRow; access: AccountAccessRow } }
  | { ok: false; audit: CanonicalBootstrapAuditDraft }
> {
  const accounts = await client.query<AccountRow>(
    [
      "select account_id, tenant_id, initial_tenant_membership_id, initial_principal_id, account_origin, base_currency, state",
      "from investing.accounts",
      "where initial_principal_id = $1",
      "and account_origin = 'INITIAL_PERSONAL_BOOTSTRAP'",
    ].join(" "),
    [principalId],
  );
  if (accounts.rows.length > 1) {
    return corruptGraphAudit(principalId, "DUPLICATE_INITIAL_ACCOUNT_CORRUPTION", auditContext);
  }

  const memberships = await client.query<TenantMembershipRow>(
    [
      "select tenant_membership_id, tenant_id, principal_id, state",
      "from investing.tenant_memberships",
      "where principal_id = $1",
      "and role = 'OWNER'",
    ].join(" "),
    [principalId],
  );
  const activeMemberships = memberships.rows.filter((row) => row.state === "ACTIVE");

  if (accounts.rows.length === 0) {
    if (memberships.rows.length > 0) {
      return corruptGraphAudit(principalId, "PARTIAL_AUTHORITY_GRAPH", auditContext);
    }
    return { ok: true, graph: null };
  }

  const account = accounts.rows[0]!;
  await setTransactionContext(client, {
    tenant_id: account.tenant_id,
    account_id: account.account_id,
  });

  if (account.state !== "ACTIVE") {
    return graphStateAudit(principalId, account.tenant_id, account.account_id, "ACCOUNT_INACTIVE", {
      account_state: account.state,
    }, auditContext);
  }

  if (activeMemberships.length !== 1) {
    return graphStateAudit(principalId, account.tenant_id, account.account_id, "MEMBERSHIP_INACTIVE", {
      active_membership_count: String(activeMemberships.length),
    }, auditContext);
  }
  const membership = activeMemberships[0]!;
  await setTransactionContext(client, { tenant_membership_id: membership.tenant_membership_id });

  const accesses = await client.query<AccountAccessRow>(
    [
      "select account_access_id, account_id, tenant_id, tenant_membership_id, principal_id, state",
      "from investing.account_access",
      "where account_id = $1",
      "and tenant_id = $2",
      "and principal_id = $3",
      "and role = 'OWNER'",
    ].join(" "),
    [account.account_id, account.tenant_id, principalId],
  );
  const activeAccesses = accesses.rows.filter((row) => row.state === "ACTIVE");
  if (activeAccesses.length !== 1) {
    return graphStateAudit(principalId, account.tenant_id, account.account_id, "ACCESS_INACTIVE", {
      active_access_count: String(activeAccesses.length),
    }, auditContext);
  }
  const access = activeAccesses[0]!;
  await setTransactionContext(client, { account_access_id: access.account_access_id });

  const tenants = await client.query<TenantRow>(
    "select tenant_id, state from investing.tenants where tenant_id = $1",
    [account.tenant_id],
  );
  if (tenants.rows.length !== 1) return corruptGraphAudit(principalId, "AUTHORITY_TUPLE_MISMATCH", auditContext);
  const tenant = tenants.rows[0]!;

  if (tenant.state !== "ACTIVE") {
    return graphStateAudit(principalId, account.tenant_id, account.account_id, "TENANT_INACTIVE", {
      tenant_state: tenant.state,
    }, auditContext);
  }

  if (
    account.initial_principal_id !== principalId ||
    account.initial_tenant_membership_id !== membership.tenant_membership_id ||
    membership.tenant_id !== tenant.tenant_id ||
    membership.principal_id !== principalId ||
    access.account_id !== account.account_id ||
    access.tenant_id !== tenant.tenant_id ||
    access.tenant_membership_id !== membership.tenant_membership_id ||
    access.principal_id !== principalId
  ) {
    return corruptGraphAudit(principalId, "AUTHORITY_TUPLE_MISMATCH", auditContext);
  }

  return { ok: true, graph: { tenant, membership, account, access } };
}

async function validateCanonicalReplayReference(
  client: InvestingAuthorityTransactionClient,
  input: {
    reference: BootstrapCanonicalReference;
    principalId: string;
    expectedBaseCurrency: string;
  },
): Promise<{ ok: true } | BootstrapInitialPersonalAccountFailure> {
  const { reference } = input;
  if (reference.principalId !== input.principalId || reference.baseCurrency !== input.expectedBaseCurrency) {
    return fail("INTERNAL_ERROR");
  }

  await setTransactionContext(client, {
    tenant_id: reference.tenantId,
    account_id: reference.accountId,
    tenant_membership_id: reference.tenantMembershipId,
    account_access_id: reference.accountAccessId,
  });

  const account = await expectExactlyOne(
    client.query<AccountRow>(
      [
        "select account_id, tenant_id, initial_tenant_membership_id, initial_principal_id, account_origin, base_currency, state",
        "from investing.accounts",
        "where account_id = $1",
        "and tenant_id = $2",
        "and initial_principal_id = $3",
        "and account_origin = 'INITIAL_PERSONAL_BOOTSTRAP'",
      ].join(" "),
      [reference.accountId, reference.tenantId, input.principalId],
    ),
    "INTERNAL_ERROR",
  );
  if (account.ok === false) return account;

  const membership = await expectExactlyOne(
    client.query<TenantMembershipRow>(
      [
        "select tenant_membership_id, tenant_id, principal_id, state",
        "from investing.tenant_memberships",
        "where tenant_membership_id = $1",
        "and tenant_id = $2",
        "and principal_id = $3",
        "and role = 'OWNER'",
      ].join(" "),
      [reference.tenantMembershipId, reference.tenantId, input.principalId],
    ),
    "INTERNAL_ERROR",
  );
  if (membership.ok === false) return membership;

  const access = await expectExactlyOne(
    client.query<AccountAccessRow>(
      [
        "select account_access_id, account_id, tenant_id, tenant_membership_id, principal_id, state",
        "from investing.account_access",
        "where account_access_id = $1",
        "and account_id = $2",
        "and tenant_id = $3",
        "and tenant_membership_id = $4",
        "and principal_id = $5",
        "and role = 'OWNER'",
      ].join(" "),
      [
        reference.accountAccessId,
        reference.accountId,
        reference.tenantId,
        reference.tenantMembershipId,
        input.principalId,
      ],
    ),
    "INTERNAL_ERROR",
  );
  if (access.ok === false) return access;

  const tenant = await expectExactlyOne(
    client.query<TenantRow>("select tenant_id, state from investing.tenants where tenant_id = $1", [
      reference.tenantId,
    ]),
    "INTERNAL_ERROR",
  );
  if (tenant.ok === false) return tenant;

  if (
    account.row.account_id !== reference.accountId ||
    account.row.tenant_id !== reference.tenantId ||
    account.row.initial_principal_id !== input.principalId ||
    account.row.state !== "ACTIVE" ||
    account.row.base_currency !== input.expectedBaseCurrency ||
    account.row.initial_tenant_membership_id !== reference.tenantMembershipId ||
    account.row.account_origin !== "INITIAL_PERSONAL_BOOTSTRAP" ||
    membership.row.tenant_membership_id !== reference.tenantMembershipId ||
    membership.row.tenant_id !== reference.tenantId ||
    membership.row.principal_id !== input.principalId ||
    membership.row.state !== "ACTIVE" ||
    access.row.account_access_id !== reference.accountAccessId ||
    access.row.account_id !== reference.accountId ||
    access.row.tenant_id !== reference.tenantId ||
    access.row.tenant_membership_id !== reference.tenantMembershipId ||
    access.row.principal_id !== input.principalId ||
    access.row.state !== "ACTIVE" ||
    tenant.row.tenant_id !== reference.tenantId ||
    tenant.row.state !== "ACTIVE"
  ) {
    return fail("INTERNAL_ERROR");
  }

  return { ok: true };
}

function graphReference(graph: {
  tenant: TenantRow;
  membership: TenantMembershipRow;
  account: AccountRow;
  access: AccountAccessRow;
}): BootstrapCanonicalReference {
  return {
    principalId: graph.membership.principal_id,
    tenantId: graph.tenant.tenant_id,
    tenantMembershipId: graph.membership.tenant_membership_id,
    accountId: graph.account.account_id,
    accountAccessId: graph.access.account_access_id,
    baseCurrency: graph.account.base_currency,
  };
}

function corruptGraphAudit(
  principalId: string,
  reasonCode: "DUPLICATE_INITIAL_ACCOUNT_CORRUPTION" | "PARTIAL_AUTHORITY_GRAPH" | "AUTHORITY_TUPLE_MISMATCH",
  auditContext: { correlationId: string; actorId: string },
) {
  return {
    ok: false as const,
    audit: canonicalCorruptGraphAudit({
      correlationId: auditContext.correlationId,
      actorId: auditContext.actorId,
      principalId,
      reasonCode,
      evidence: { reason: reasonCode },
    }),
  };
}

function graphStateAudit(
  principalId: string,
  tenantId: string,
  accountId: string,
  reasonCode: "TENANT_INACTIVE" | "MEMBERSHIP_INACTIVE" | "ACCOUNT_INACTIVE" | "ACCESS_INACTIVE",
  evidence: Record<string, string>,
  auditContext: { correlationId: string; actorId: string },
) {
  return {
    ok: false as const,
    audit: {
      correlationId: auditContext.correlationId,
      actorId: auditContext.actorId,
      principalId,
      operationScope: "ACCOUNT_SCOPE" as const,
      tenantId,
      accountId,
      action: "AUTHORITY_BOOTSTRAP_FAILED" as const,
      objectType: "ACCOUNT" as const,
      objectId: accountId,
      outcome: "DENIED" as const,
      reasonCode,
      evidence,
    },
  };
}

function canonicalIdempotencyConflictAudit(input: {
  correlationId: string;
  actorId: string;
  principalId: string;
  idempotencyRecordId: string;
  reasonCode:
    | "IDEMPOTENCY_CONFLICT"
    | "IDEMPOTENCY_IN_PROGRESS"
    | "IDEMPOTENCY_FAILED"
    | "INITIAL_BOOTSTRAP_MATERIAL_CONFLICT";
  evidence: Record<string, string>;
}): CanonicalBootstrapAuditDraft {
  return {
    correlationId: input.correlationId,
    actorId: input.actorId,
    principalId: input.principalId,
    operationScope: "DOMAIN_SCOPE",
    tenantId: null,
    accountId: null,
    action: "AUTHORITY_BOOTSTRAP_FAILED",
    objectType: "IDEMPOTENCY_RECORD",
    objectId: input.idempotencyRecordId,
    outcome:
      input.reasonCode === "IDEMPOTENCY_CONFLICT" ||
      input.reasonCode === "INITIAL_BOOTSTRAP_MATERIAL_CONFLICT"
        ? "CONFLICT"
        : "FAILED",
    reasonCode: input.reasonCode,
    evidence: input.evidence,
  };
}

function canonicalCorruptGraphAudit(input: {
  correlationId: string;
  actorId: string;
  principalId: string;
  reasonCode:
    | "BOOTSTRAP_INTERNAL_ERROR"
    | "DUPLICATE_INITIAL_ACCOUNT_CORRUPTION"
    | "PARTIAL_AUTHORITY_GRAPH"
    | "AUTHORITY_TUPLE_MISMATCH";
  evidence: Record<string, string>;
}): CanonicalBootstrapAuditDraft {
  return {
    correlationId: input.correlationId,
    actorId: input.actorId,
    principalId: input.principalId,
    operationScope: "DOMAIN_SCOPE",
    tenantId: null,
    accountId: null,
    action: "AUTHORITY_BOOTSTRAP_FAILED",
    objectType: "PRINCIPAL",
    objectId: input.principalId,
    outcome: "FAILED",
    reasonCode: input.reasonCode,
    evidence: input.evidence,
  };
}

function graphAuditFailureCode(audit: CanonicalBootstrapAuditDraft): BootstrapFailureCode {
  if (
    audit.reasonCode === "TENANT_INACTIVE" ||
    audit.reasonCode === "MEMBERSHIP_INACTIVE" ||
    audit.reasonCode === "ACCOUNT_INACTIVE" ||
    audit.reasonCode === "ACCESS_INACTIVE"
  ) {
    return audit.reasonCode;
  }
  if (audit.reasonCode === "IDEMPOTENCY_CONFLICT" || audit.reasonCode === "INITIAL_BOOTSTRAP_MATERIAL_CONFLICT") {
    return "CONFLICT";
  }
  return "INTERNAL_ERROR";
}

async function withBootstrapTransaction(
  database: InvestingAuthorityDatabase,
  work: (client: InvestingAuthorityTransactionClient) => Promise<BootstrapWorkResult>,
  unexpectedAudit: () => BootstrapUnexpectedAudit,
): Promise<{ result: BootstrapInitialPersonalAccountResult; preAuthorityAudit?: BootstrapPreAuthorityAuditDraft; canonicalAudit?: CanonicalBootstrapAuditDraft }> {
  let client: InvestingAuthorityTransactionClient | null = null;
  let result: BootstrapWorkResult = fail("INTERNAL_ERROR");
  let destroyClient = false;
  let cleanupFailed = false;

  try {
    client = await database.connect();
    await client.query("begin isolation level read committed");
    result = await work(client);
    if (result.ok === false && result.commitFailure !== true && !result.preAuthorityAudit && !result.canonicalAudit) {
      result = preserveAuditEvidence(result, result, unexpectedAudit());
    }
    destroyClient = result.ok === false && result.destroyClient === true;
    if (result.ok || (result.ok === false && result.commitFailure === true)) {
      await client.query("commit");
    } else {
      try {
        await client.query("rollback");
    } catch {
        destroyClient = true;
        cleanupFailed = true;
        result = preserveAuditEvidence(fail("INTERNAL_ERROR"), result, unexpectedAudit());
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
    result = preserveAuditEvidence(fail("INTERNAL_ERROR"), result, unexpectedAudit());
  }

  if (client) {
    try {
      await client.release(destroyClient || cleanupFailed);
    } catch {
      cleanupFailed = true;
      result = preserveAuditEvidence(fail("INTERNAL_ERROR"), result, unexpectedAudit());
    }
  }

  return {
    result: cleanupFailed ? fail("INTERNAL_ERROR") : stripAudit(result),
    preAuthorityAudit: result.preAuthorityAudit,
    canonicalAudit: result.canonicalAudit,
  };
}

async function writeBootstrapPreAuthorityAudit(
  database: InvestingAuthorityDatabase,
  audit: BootstrapPreAuthorityAuditDraft,
): Promise<boolean> {
  let client: InvestingAuthorityTransactionClient | null = null;
  let destroyClient = false;

  try {
    client = await database.connect();
    await client.query("begin isolation level read committed");
    const staleContext = await hasStaleTransactionContext(client);
    if (staleContext) {
      destroyClient = true;
      throw new Error("STALE_INVESTING_TRANSACTION_CONTEXT");
    }
    await setTransactionContext(client, {
      operation: bootstrapOperation,
      capability: bootstrapCapability,
    });
    await client.query(
      [
        "insert into investing.bootstrap_pre_authority_audit_events (",
        "external_provider, external_subject_hash, correlation_id, operation, operation_scope,",
        "selector_kind, selector_hash, resolution_stage, outcome, reason_code, occurred_at",
        ") values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, transaction_timestamp())",
      ].join(" "),
      [
        audit.externalProvider,
        audit.externalSubjectHash,
        audit.correlationId,
        audit.operation,
        audit.operationScope,
        audit.selectorKind,
        audit.selectorHash,
        audit.resolutionStage,
        audit.outcome,
        audit.reasonCode,
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

async function writeCanonicalBootstrapAudit(
  database: InvestingAuthorityDatabase,
  audit: CanonicalBootstrapAuditDraft,
): Promise<boolean> {
  let client: InvestingAuthorityTransactionClient | null = null;
  let destroyClient = false;

  try {
    client = await database.connect();
    await client.query("begin isolation level read committed");
    const staleContext = await hasStaleTransactionContext(client);
    if (staleContext) {
      destroyClient = true;
      throw new Error("STALE_INVESTING_TRANSACTION_CONTEXT");
    }
    await setTransactionContext(client, {
      actor_kind: "USER_PRINCIPAL",
      actor_id: audit.actorId,
      external_provider: "CLERK",
      external_subject: audit.actorId,
      principal_id: audit.principalId,
      operation: bootstrapOperation,
      capability: bootstrapCapability,
      correlation_id: audit.correlationId,
      ...(audit.tenantId ? { tenant_id: audit.tenantId } : {}),
      ...(audit.accountId ? { account_id: audit.accountId } : {}),
      ...(audit.objectType === "IDEMPOTENCY_RECORD" ? { idempotency_record_id: audit.objectId } : {}),
    });
    await client.query(
      [
        "insert into investing.audit_events (",
        "correlation_id, actor_kind, actor_id, principal_id, operation_scope, tenant_id, account_id,",
        "action, object_type, object_id, outcome, reason_code, evidence, occurred_at",
        ") values ($1, 'USER_PRINCIPAL', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, transaction_timestamp())",
      ].join(" "),
      [
        audit.correlationId,
        audit.actorId,
        audit.principalId,
        audit.operationScope,
        audit.tenantId,
        audit.accountId,
        audit.action,
        audit.objectType,
        audit.objectId,
        audit.outcome,
        audit.reasonCode,
        JSON.stringify(audit.evidence),
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

async function insertCanonicalBootstrapAudit(
  client: InvestingAuthorityTransactionClient,
  audit: CanonicalBootstrapAuditDraft,
) {
  await client.query(
    [
      "insert into investing.audit_events (",
      "correlation_id, actor_kind, actor_id, principal_id, operation_scope, tenant_id, account_id,",
      "action, object_type, object_id, outcome, reason_code, evidence, occurred_at",
      ") values ($1, 'USER_PRINCIPAL', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, transaction_timestamp())",
    ].join(" "),
    [
      audit.correlationId,
      audit.actorId,
      audit.principalId,
      audit.operationScope,
      audit.tenantId,
      audit.accountId,
      audit.action,
      audit.objectType,
      audit.objectId,
      audit.outcome,
      audit.reasonCode,
      JSON.stringify(audit.evidence),
    ],
  );
}

async function writeBestEffortPreAuthorityFailure(
  failure: BootstrapInitialPersonalAccountFailure,
  audit: BootstrapPreAuthorityAuditDraft,
) {
  try {
    const database = getInvestingAuthorityDatabase();
    const audited = await writeBootstrapPreAuthorityAudit(database, audit);
    return audited ? failure : fail("INTERNAL_ERROR");
  } catch {
    return fail("INTERNAL_ERROR");
  }
}

async function hasStaleTransactionContext(client: InvestingAuthorityTransactionClient) {
  const result = await client.query<Record<string, string | null>>(
    `select ${transactionContextKeys
      .map((key, index) => `current_setting('${key}', true) as c${index}`)
      .join(", ")}`,
  );
  const row = result.rows[0] ?? {};
  const staleValue = Object.values(row).find((value) => value !== null && value !== "");
  return staleValue !== undefined;
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
  emptyCode: BootstrapFailureCode,
): Promise<{ ok: true; row: Row } | BootstrapInitialPersonalAccountFailure> {
  const result = await query;
  if (result.rows.length === 0) return fail(emptyCode);
  if (result.rows.length > 1) return fail("INTERNAL_ERROR");
  return { ok: true, row: result.rows[0]! };
}

function expectDmlExactlyOne(
  result: InvestingAuthorityQueryResult<unknown>,
): { ok: true } | BootstrapInitialPersonalAccountFailure {
  if (result.rowCount === 1) return { ok: true as const };
  return fail("INTERNAL_ERROR");
}

function expectDmlZeroOrOne(
  result: InvestingAuthorityQueryResult<unknown>,
): { ok: true; inserted: boolean } | BootstrapInitialPersonalAccountFailure {
  if (result.rowCount === 1) return { ok: true as const, inserted: true };
  if (result.rowCount === 0) return { ok: true as const, inserted: false };
  return fail("INTERNAL_ERROR");
}

function preserveAuditEvidence(
  next: BootstrapInitialPersonalAccountFailure,
  previous: BootstrapWorkResult,
  fallback: BootstrapUnexpectedAudit = {},
): BootstrapWorkResult {
  return {
    ...next,
    preAuthorityAudit: previous.preAuthorityAudit ?? fallback.preAuthorityAudit,
    canonicalAudit: previous.canonicalAudit ?? fallback.canonicalAudit,
  };
}

function canonicalFailure(code: BootstrapFailureCode, canonicalAudit: CanonicalBootstrapAuditDraft): BootstrapWorkResult {
  return {
    ...fail(code),
    canonicalAudit,
  };
}

function fail(code: BootstrapFailureCode): BootstrapInitialPersonalAccountFailure {
  return {
    ok: false,
    code,
    externalCode: code === "UNAUTHENTICATED" ? "UNAUTHENTICATED" : collapseExternalFailure(code),
  };
}

function collapseExternalFailure(code: BootstrapFailureCode) {
  if (code === "UNAUTHENTICATED") return "UNAUTHENTICATED";
  if (code === "INTERNAL_ERROR") return "INTERNAL_ERROR";
  return "FORBIDDEN_OR_NOT_FOUND";
}

function stripAudit(result: BootstrapWorkResult): BootstrapInitialPersonalAccountResult {
  if (!result.preAuthorityAudit && !result.canonicalAudit) return result;
  return "code" in result ? fail(result.code) : result;
}

function rejectClientAuthorityFields(input: Record<string, unknown>): BootstrapInitialPersonalAccountFailure | null {
  for (const key of Object.keys(input)) {
    if (forbiddenClientAuthorityFields.has(key)) return fail("VALIDATION_ERROR");
  }
  return null;
}

function normalizeBaseCurrency(value: string) {
  const normalized = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(normalized) ? normalized : null;
}

function isValidCorrelationId(value: string) {
  return typeof value === "string" && value.length >= 16 && value.length <= 512;
}

function auditCorrelationId(value: unknown) {
  return typeof value === "string" && isValidCorrelationId(value) ? value : `audit-${randomUUID()}`;
}

function isValidIdempotencyKey(value: string) {
  return typeof value === "string" && value.length >= 16 && value.length <= 512;
}

function hashMaterialRequest(input: {
  externalProvider: "CLERK";
  externalSubject: string;
  baseCurrency: string;
}) {
  return createHash("sha256")
    .update(materialHashDomain)
    .update("\0")
    .update(input.externalProvider)
    .update("\0")
    .update(input.externalSubject)
    .update("\0")
    .update(input.baseCurrency)
    .digest("hex")
    .toUpperCase();
}

function createBootstrapPreAuthorityAudit(input: {
  externalSubject: string;
  idempotencyKey: string;
  correlationId: string;
  resolutionStage: BootstrapPreAuthorityAuditDraft["resolutionStage"];
  outcome: BootstrapPreAuthorityAuditDraft["outcome"];
  reasonCode: BootstrapPreAuthorityAuditDraft["reasonCode"];
}): BootstrapPreAuthorityAuditDraft {
  return {
    externalProvider: "CLERK",
    externalSubjectHash: hashAuditValue(
      bootstrapPreAuthoritySubjectHashDomain,
      "EXTERNAL_SUBJECT",
      input.externalSubject,
    ),
    correlationId: input.correlationId,
    operation: bootstrapOperation,
    operationScope: "DOMAIN_SCOPE",
    selectorKind: "IDEMPOTENCY_KEY",
    selectorHash: hashAuditValue(bootstrapPreAuthoritySelectorHashDomain, "IDEMPOTENCY_KEY", input.idempotencyKey),
    resolutionStage: input.resolutionStage,
    outcome: input.outcome,
    reasonCode: input.reasonCode,
  };
}

function hashAuditValue(domain: string, kind: string, value: string) {
  return createHash("sha256").update(domain).update("\0").update(kind).update("\0").update(value).digest("hex");
}

function isBootstrapCanonicalReference(value: unknown): value is BootstrapCanonicalReference {
  if (!value || typeof value !== "object") return false;
  const reference = value as Partial<Record<keyof BootstrapCanonicalReference, unknown>>;
  return (
    typeof reference.principalId === "string" &&
    uuidPattern.test(reference.principalId) &&
    typeof reference.tenantId === "string" &&
    uuidPattern.test(reference.tenantId) &&
    typeof reference.tenantMembershipId === "string" &&
    uuidPattern.test(reference.tenantMembershipId) &&
    typeof reference.accountId === "string" &&
    uuidPattern.test(reference.accountId) &&
    typeof reference.accountAccessId === "string" &&
    uuidPattern.test(reference.accountAccessId) &&
    typeof reference.baseCurrency === "string" &&
    /^[A-Z]{3}$/.test(reference.baseCurrency)
  );
}
