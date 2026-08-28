import { createHash } from "node:crypto";
import { resolveVerifiedClerkIdentity } from "./clerk";
import { getInvestingAuthorityDatabase } from "./transport";

const authorizedInvestingContextRuntimeBrand = Symbol("AuthorizedInvestingContext");
const accountContextResolveOperation = "ACCOUNT_CONTEXT_RESOLVE";
const accountAuthorityReadCapability = "ACCOUNT_AUTHORITY_READ";
const preAuthorityExternalSubjectHashDomain = "SYNTRAKE_INVESTING_I2B_EXTERNAL_SUBJECT_V1";
const preAuthoritySelectorHashDomain = "SYNTRAKE_INVESTING_I2B_SELECTOR_V1";

type Brand = {
  readonly __authorizedInvestingContext: "AuthorizedInvestingContext";
};

export type InvestingActorKind = "USER_PRINCIPAL" | "SYSTEM_ACTOR";
export type InvestingOperationScope = "ACCOUNT_SCOPE";
export type InvestingCapability = typeof accountAuthorityReadCapability;

export type InvestingAuthorityFailureCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN_OR_NOT_FOUND"
  | "PRINCIPAL_DISABLED"
  | "TENANT_INACTIVE"
  | "MEMBERSHIP_INACTIVE"
  | "ACCOUNT_INACTIVE"
  | "ACCESS_INACTIVE"
  | "VALIDATION_ERROR"
  | "INTERNAL_ERROR";

export type AuthorizedInvestingContext = Readonly<
  Brand & {
    actorKind: "USER_PRINCIPAL";
    actorId: string;
    principalId: string;
    operationScope: "ACCOUNT_SCOPE";
    tenantId: string;
    accountId: string;
    tenantMembershipId: string;
    accountAccessId: string;
    correlationId: string;
    operation: typeof accountContextResolveOperation;
    capability: InvestingCapability;
  }
>;

export type InvestingAuthoritySuccess = {
  ok: true;
  context: AuthorizedInvestingContext;
};

export type InvestingAuthorityFailure = {
  ok: false;
  code: InvestingAuthorityFailureCode;
  externalCode: "UNAUTHENTICATED" | "FORBIDDEN_OR_NOT_FOUND" | "INTERNAL_ERROR";
};

export type InvestingAuthorityResult = InvestingAuthoritySuccess | InvestingAuthorityFailure;

export type PreAuthorityAuditOutcome = "DENIED" | "ERROR";
export type PreAuthorityAuditResolutionStage =
  | "PRINCIPAL_LOOKUP"
  | "PRINCIPAL_STATE"
  | "ACCOUNT_SELECTOR_LOOKUP"
  | "TRANSACTION_CONTEXT_PREFLIGHT";

type PreAuthorityAuditDraft = {
  externalProvider: "CLERK";
  externalSubjectHash: string;
  correlationId: string;
  operation: typeof accountContextResolveOperation;
  operationScope: "ACCOUNT_SCOPE";
  selectorKind: "ACCOUNT_ID";
  selectorHash: string;
  resolutionStage: PreAuthorityAuditResolutionStage;
  outcome: PreAuthorityAuditOutcome;
  reasonCode:
    | "ZERO_PRINCIPAL"
    | "DUPLICATE_PRINCIPAL"
    | "PRINCIPAL_DISABLED"
    | "ACCOUNT_SELECTOR_NOT_ACCESSIBLE"
    | "DUPLICATE_ACCOUNT_SELECTOR"
    | "STALE_TRANSACTION_CONTEXT";
};

type CanonicalDenialAuditDraft = {
  correlationId: string;
  actorKind: "USER_PRINCIPAL";
  actorId: string;
  principalId: string;
  operationScope: "ACCOUNT_SCOPE";
  tenantId: string;
  accountId: string;
  action: "AUTHORITY_ACCESS_DENIED";
  objectType: "ACCOUNT";
  objectId: string;
  outcome: "DENIED" | "FAILED";
  reasonCode:
    | "TENANT_INACTIVE"
    | "MEMBERSHIP_INACTIVE"
    | "ACCESS_INACTIVE"
    | "DUPLICATE_ACTIVE_MEMBERSHIP"
    | "DUPLICATE_ACTIVE_ACCOUNT_ACCESS"
    | "AUTHORITY_TUPLE_MISMATCH";
  evidence: Record<string, string>;
};

export type InvestingAuthorityQueryResult<Row> = {
  rows: Row[];
};

export type InvestingAuthorityTransactionClient = {
  query<Row = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<InvestingAuthorityQueryResult<Row>>;
  release(destroy?: boolean): void | Promise<void>;
};

export type InvestingAuthorityDatabase = {
  connect(): Promise<InvestingAuthorityTransactionClient>;
};

export type ResolveAuthorizedInvestingAccountContextInput = {
  accountId: string;
  correlationId: string;
};

type PrincipalRow = {
  principal_id: string;
  state: "ACTIVE" | "DISABLED";
};

type AccountRow = {
  account_id: string;
  tenant_id: string;
  state: "ACTIVE" | "FROZEN" | "CLOSED";
};

type TenantRow = {
  tenant_id: string;
  state: "ACTIVE" | "SUSPENDED" | "CLOSED";
};

type MembershipRow = {
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

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const forbiddenClientAuthorityFields = new Set([
  "userId",
  "tenantId",
  "principalId",
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
] as const;

export function isAuthorizedInvestingContext(value: unknown): value is AuthorizedInvestingContext {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { [authorizedInvestingContextRuntimeBrand]?: boolean })[
      authorizedInvestingContextRuntimeBrand
    ] === true
  );
}

export async function resolveAuthorizedInvestingAccountContext(
  input: ResolveAuthorizedInvestingAccountContextInput,
): Promise<InvestingAuthorityResult> {
  const forbiddenFieldFailure = rejectClientAuthorityFields(input);
  if (forbiddenFieldFailure) return forbiddenFieldFailure;

  if (!uuidPattern.test(input.accountId) || !isValidCorrelationId(input.correlationId)) {
    return fail("VALIDATION_ERROR");
  }

  const verifiedAuth = await resolveVerifiedClerkIdentity();
  if (verifiedAuth.ok === false) return fail(verifiedAuth.code);

  let database: InvestingAuthorityDatabase;
  try {
    database = getInvestingAuthorityDatabase();
  } catch {
    return fail("INTERNAL_ERROR");
  }

  const preAuthorityAuditBase = {
    externalProvider: verifiedAuth.externalProvider,
    externalSubjectHash: hashPreAuthorityAuditValue(
      preAuthorityExternalSubjectHashDomain,
      verifiedAuth.externalProvider,
      verifiedAuth.externalSubject,
    ),
    correlationId: input.correlationId,
    operation: accountContextResolveOperation,
    operationScope: "ACCOUNT_SCOPE",
    selectorKind: "ACCOUNT_ID",
    selectorHash: hashPreAuthorityAuditValue(
      preAuthoritySelectorHashDomain,
      "ACCOUNT_ID",
      input.accountId,
    ),
  } as const;

  const transaction = await withAuthorityTransaction(database, async (client) => {
    const staleContext = await hasStaleTransactionContext(client);
    if (staleContext) {
      return {
        ...preAuthorityFailure("INTERNAL_ERROR", {
          ...preAuthorityAuditBase,
          resolutionStage: "TRANSACTION_CONTEXT_PREFLIGHT",
          outcome: "ERROR",
          reasonCode: "STALE_TRANSACTION_CONTEXT",
        }),
        destroyClient: true,
      };
    }

    await setTransactionContext(client, {
      actor_kind: "USER_PRINCIPAL",
      actor_id: verifiedAuth.externalSubject,
      external_provider: verifiedAuth.externalProvider,
      external_subject: verifiedAuth.externalSubject,
      account_id: input.accountId,
      operation: accountContextResolveOperation,
      capability: accountAuthorityReadCapability,
      correlation_id: input.correlationId,
    });

    const principals = await client.query<PrincipalRow>(
      "select principal_id, state from investing.principals where external_provider = $1 and external_subject = $2",
      [verifiedAuth.externalProvider, verifiedAuth.externalSubject],
    );
    const principal = expectExactlyOneRows(principals.rows, "FORBIDDEN_OR_NOT_FOUND");
    if (principal.ok === false) {
      return preAuthorityFailure(principal.code, {
        ...preAuthorityAuditBase,
        resolutionStage: "PRINCIPAL_LOOKUP",
        outcome: principals.rows.length === 0 ? "DENIED" : "ERROR",
        reasonCode: principals.rows.length === 0 ? "ZERO_PRINCIPAL" : "DUPLICATE_PRINCIPAL",
      });
    }
    if (principal.row.state !== "ACTIVE") {
      return preAuthorityFailure("PRINCIPAL_DISABLED", {
        ...preAuthorityAuditBase,
        resolutionStage: "PRINCIPAL_STATE",
        outcome: "DENIED",
        reasonCode: "PRINCIPAL_DISABLED",
      });
    }

    await setTransactionContext(client, { principal_id: principal.row.principal_id });

    const accounts = await client.query<AccountRow>(
      "select account_id, tenant_id, state from investing.accounts where account_id = $1",
      [input.accountId],
    );
    const account = expectExactlyOneRows(accounts.rows, "FORBIDDEN_OR_NOT_FOUND");
    if (account.ok === false) {
      return preAuthorityFailure(account.code, {
        ...preAuthorityAuditBase,
        resolutionStage: "ACCOUNT_SELECTOR_LOOKUP",
        outcome: accounts.rows.length === 0 ? "DENIED" : "ERROR",
        reasonCode: accounts.rows.length === 0 ? "ACCOUNT_SELECTOR_NOT_ACCESSIBLE" : "DUPLICATE_ACCOUNT_SELECTOR",
      });
    }

    await setTransactionContext(client, { tenant_id: account.row.tenant_id });

    const membership = await expectExactlyOne(
      client.query<MembershipRow>(
        [
          "select tenant_membership_id, tenant_id, principal_id, state",
          "from investing.tenant_memberships",
          "where principal_id = $1 and tenant_id = $2 and role = 'OWNER' and state = 'ACTIVE'",
        ].join(" "),
        [principal.row.principal_id, account.row.tenant_id],
      ),
      "MEMBERSHIP_INACTIVE",
    );
    if (membership.ok === false) {
      if (membership.code === "INTERNAL_ERROR") {
        return canonicalDenialFailure("INTERNAL_ERROR", {
          correlationId: input.correlationId,
          actorKind: "USER_PRINCIPAL",
          actorId: verifiedAuth.externalSubject,
          principalId: principal.row.principal_id,
          operationScope: "ACCOUNT_SCOPE",
          tenantId: account.row.tenant_id,
          accountId: account.row.account_id,
          action: "AUTHORITY_ACCESS_DENIED",
          objectType: "ACCOUNT",
          objectId: account.row.account_id,
          outcome: "FAILED",
          reasonCode: "DUPLICATE_ACTIVE_MEMBERSHIP",
          evidence: { denial_stage: "TENANT_MEMBERSHIP_LOOKUP" },
        });
      }
      return canonicalDenialFailure("MEMBERSHIP_INACTIVE", {
        correlationId: input.correlationId,
        actorKind: "USER_PRINCIPAL",
        actorId: verifiedAuth.externalSubject,
        principalId: principal.row.principal_id,
        operationScope: "ACCOUNT_SCOPE",
        tenantId: account.row.tenant_id,
        accountId: account.row.account_id,
        action: "AUTHORITY_ACCESS_DENIED",
        objectType: "ACCOUNT",
        objectId: account.row.account_id,
        outcome: "DENIED",
        reasonCode: "MEMBERSHIP_INACTIVE",
        evidence: { denial_stage: "TENANT_MEMBERSHIP_LOOKUP" },
      });
    }

    await setTransactionContext(client, { tenant_membership_id: membership.row.tenant_membership_id });

    const access = await expectExactlyOne(
      client.query<AccountAccessRow>(
        [
          "select account_access_id, account_id, tenant_id, tenant_membership_id, principal_id, state",
          "from investing.account_access",
          "where account_id = $1",
          "and tenant_id = $2",
          "and tenant_membership_id = $3",
          "and principal_id = $4",
          "and role = 'OWNER'",
          "and state = 'ACTIVE'",
        ].join(" "),
        [
          account.row.account_id,
          account.row.tenant_id,
          membership.row.tenant_membership_id,
          principal.row.principal_id,
        ],
      ),
      "ACCESS_INACTIVE",
    );
    if (access.ok === false) {
      if (access.code === "INTERNAL_ERROR") {
        return canonicalDenialFailure("INTERNAL_ERROR", {
          correlationId: input.correlationId,
          actorKind: "USER_PRINCIPAL",
          actorId: verifiedAuth.externalSubject,
          principalId: principal.row.principal_id,
          operationScope: "ACCOUNT_SCOPE",
          tenantId: account.row.tenant_id,
          accountId: account.row.account_id,
          action: "AUTHORITY_ACCESS_DENIED",
          objectType: "ACCOUNT",
          objectId: account.row.account_id,
          outcome: "FAILED",
          reasonCode: "DUPLICATE_ACTIVE_ACCOUNT_ACCESS",
          evidence: { denial_stage: "ACCOUNT_ACCESS_LOOKUP" },
        });
      }
      return canonicalDenialFailure("ACCESS_INACTIVE", {
        correlationId: input.correlationId,
        actorKind: "USER_PRINCIPAL",
        actorId: verifiedAuth.externalSubject,
        principalId: principal.row.principal_id,
        operationScope: "ACCOUNT_SCOPE",
        tenantId: account.row.tenant_id,
        accountId: account.row.account_id,
        action: "AUTHORITY_ACCESS_DENIED",
        objectType: "ACCOUNT",
        objectId: account.row.account_id,
        outcome: "DENIED",
        reasonCode: "ACCESS_INACTIVE",
        evidence: { denial_stage: "ACCOUNT_ACCESS_LOOKUP" },
      });
    }

    await setTransactionContext(client, { account_access_id: access.row.account_access_id });

    const tenant = await expectExactlyOne(
      client.query<TenantRow>("select tenant_id, state from investing.tenants where tenant_id = $1", [
        account.row.tenant_id,
      ]),
      "INTERNAL_ERROR",
    );
    if (tenant.ok === false) return tenant;
    if (tenant.row.state !== "ACTIVE") {
      return canonicalDenialFailure("TENANT_INACTIVE", {
        correlationId: input.correlationId,
        actorKind: "USER_PRINCIPAL",
        actorId: verifiedAuth.externalSubject,
        principalId: principal.row.principal_id,
        operationScope: "ACCOUNT_SCOPE",
        tenantId: account.row.tenant_id,
        accountId: account.row.account_id,
        action: "AUTHORITY_ACCESS_DENIED",
        objectType: "ACCOUNT",
        objectId: account.row.account_id,
        outcome: "DENIED",
        reasonCode: "TENANT_INACTIVE",
        evidence: { denial_stage: "TENANT_LOOKUP" },
      });
    }

    const tupleFailure = validateTupleConsistency({
      principal: principal.row,
      tenant: tenant.row,
      account: account.row,
      membership: membership.row,
      access: access.row,
    });
    if (tupleFailure) {
      return canonicalDenialFailure("INTERNAL_ERROR", {
        correlationId: input.correlationId,
        actorKind: "USER_PRINCIPAL",
        actorId: verifiedAuth.externalSubject,
        principalId: principal.row.principal_id,
        operationScope: "ACCOUNT_SCOPE",
        tenantId: account.row.tenant_id,
        accountId: account.row.account_id,
        action: "AUTHORITY_ACCESS_DENIED",
        objectType: "ACCOUNT",
        objectId: account.row.account_id,
        outcome: "FAILED",
        reasonCode: "AUTHORITY_TUPLE_MISMATCH",
        evidence: { denial_stage: "AUTHORITY_TUPLE_VALIDATION" },
      });
    }

    return {
      ok: true,
      context: brandAuthorizedContext({
        actorKind: "USER_PRINCIPAL",
        actorId: verifiedAuth.externalSubject,
        principalId: principal.row.principal_id,
        operationScope: "ACCOUNT_SCOPE",
        tenantId: account.row.tenant_id,
        accountId: account.row.account_id,
        tenantMembershipId: membership.row.tenant_membership_id,
        accountAccessId: access.row.account_access_id,
        correlationId: input.correlationId,
        operation: accountContextResolveOperation,
        capability: accountAuthorityReadCapability,
      }),
    };
  });

  if (transaction.preAuthorityAudit) {
    const auditWritten = await writePreAuthorityAudit(database, transaction.preAuthorityAudit);
    if (!auditWritten) return fail("INTERNAL_ERROR");
  }

  if (transaction.canonicalDenialAudit) {
    const auditWritten = await writeCanonicalDenialAudit(database, transaction.canonicalDenialAudit);
    if (!auditWritten) return fail("INTERNAL_ERROR");
  }

  return transaction.result;
}

function rejectClientAuthorityFields(input: ResolveAuthorizedInvestingAccountContextInput) {
  for (const key of Object.keys(input)) {
    if (forbiddenClientAuthorityFields.has(key)) return fail("FORBIDDEN_OR_NOT_FOUND");
  }

  return null;
}

function isValidCorrelationId(value: string) {
  return value.length >= 16 && value.length <= 512;
}

async function withAuthorityTransaction(
  database: InvestingAuthorityDatabase,
  work: (client: InvestingAuthorityTransactionClient) => Promise<AuthorityWorkResult>,
): Promise<AuthorityTransactionResult> {
  let client: InvestingAuthorityTransactionClient | null = null;
  let result: AuthorityWorkResult = fail("INTERNAL_ERROR");
  let destroyClient = false;
  let cleanupFailed = false;

  try {
    client = await database.connect();
    await client.query("begin");
    result = await work(client);
    destroyClient = result.destroyClient === true;
    if (result.ok) {
      await client.query("commit");
    } else {
      try {
        await client.query("rollback");
      } catch {
        destroyClient = true;
        cleanupFailed = true;
        result = preserveAuditEvidence(fail("INTERNAL_ERROR"), result);
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
    result = preserveAuditEvidence(fail("INTERNAL_ERROR"), result);
  }

  if (client) {
    try {
      await client.release(destroyClient || cleanupFailed);
    } catch {
      cleanupFailed = true;
      result = preserveAuditEvidence(fail("INTERNAL_ERROR"), result);
    }
  }

  return {
    result: cleanupFailed ? fail("INTERNAL_ERROR") : stripPreAuthorityAudit(result),
    preAuthorityAudit: result.preAuthorityAudit,
    canonicalDenialAudit: result.canonicalDenialAudit,
  };
}

type AuthorityWorkResult = (InvestingAuthoritySuccess & {
  preAuthorityAudit?: undefined;
  canonicalDenialAudit?: undefined;
  destroyClient?: boolean;
}) | (InvestingAuthorityFailure & {
  preAuthorityAudit?: PreAuthorityAuditDraft;
  canonicalDenialAudit?: CanonicalDenialAuditDraft;
  destroyClient?: boolean;
});

type AuthorityTransactionResult = {
  result: InvestingAuthorityResult;
  preAuthorityAudit?: PreAuthorityAuditDraft;
  canonicalDenialAudit?: CanonicalDenialAuditDraft;
};

function preserveAuditEvidence(
  next: InvestingAuthorityFailure,
  previous: AuthorityWorkResult,
): AuthorityWorkResult {
  return {
    ...next,
    preAuthorityAudit: previous.preAuthorityAudit,
    canonicalDenialAudit: previous.canonicalDenialAudit,
  };
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
  emptyCode: InvestingAuthorityFailureCode,
): Promise<{ ok: true; row: Row } | InvestingAuthorityFailure> {
  const result = await query;
  return expectExactlyOneRows(result.rows, emptyCode);
}

function expectExactlyOneRows<Row>(
  rows: Row[],
  emptyCode: InvestingAuthorityFailureCode,
): { ok: true; row: Row } | InvestingAuthorityFailure {
  if (rows.length === 0) return fail(emptyCode);
  if (rows.length > 1) return fail("INTERNAL_ERROR");
  return { ok: true, row: rows[0] };
}

function validateTupleConsistency(input: {
  principal: PrincipalRow;
  tenant: TenantRow;
  account: AccountRow;
  membership: MembershipRow;
  access: AccountAccessRow;
}): InvestingAuthorityFailure | null {
  if (input.membership.principal_id !== input.principal.principal_id) return fail("INTERNAL_ERROR");
  if (input.membership.tenant_id !== input.tenant.tenant_id) return fail("INTERNAL_ERROR");
  if (input.account.tenant_id !== input.tenant.tenant_id) return fail("INTERNAL_ERROR");
  if (input.access.principal_id !== input.principal.principal_id) return fail("INTERNAL_ERROR");
  if (input.access.tenant_id !== input.tenant.tenant_id) return fail("INTERNAL_ERROR");
  if (input.access.account_id !== input.account.account_id) return fail("INTERNAL_ERROR");
  if (input.access.tenant_membership_id !== input.membership.tenant_membership_id) {
    return fail("INTERNAL_ERROR");
  }

  return null;
}

function brandAuthorizedContext(
  context: Omit<AuthorizedInvestingContext, keyof Brand>,
): AuthorizedInvestingContext {
  return Object.freeze({
    ...context,
    __authorizedInvestingContext: "AuthorizedInvestingContext",
    [authorizedInvestingContextRuntimeBrand]: true,
  }) as AuthorizedInvestingContext;
}

function fail(code: InvestingAuthorityFailureCode): InvestingAuthorityFailure {
  return {
    ok: false,
    code,
    externalCode: code === "UNAUTHENTICATED" ? "UNAUTHENTICATED" : collapseExternalFailure(code),
  };
}

function preAuthorityFailure(
  code: InvestingAuthorityFailureCode,
  preAuthorityAudit: PreAuthorityAuditDraft,
): AuthorityWorkResult {
  return {
    ...fail(code),
    preAuthorityAudit,
  };
}

function canonicalDenialFailure(
  code: "TENANT_INACTIVE" | "MEMBERSHIP_INACTIVE" | "ACCESS_INACTIVE" | "INTERNAL_ERROR",
  canonicalDenialAudit: CanonicalDenialAuditDraft,
): AuthorityWorkResult {
  return {
    ...fail(code),
    canonicalDenialAudit,
  };
}

function stripPreAuthorityAudit(result: AuthorityWorkResult): InvestingAuthorityResult {
  if (!result.preAuthorityAudit && !result.canonicalDenialAudit) return result;
  return "code" in result ? fail(result.code) : result;
}

export function hashPreAuthorityAuditValue(domain: string, kind: string, value: string) {
  return createHash("sha256").update(domain).update("\0").update(kind).update("\0").update(value).digest("hex");
}

async function writePreAuthorityAudit(
  database: InvestingAuthorityDatabase,
  audit: PreAuthorityAuditDraft,
): Promise<boolean> {
  let client: InvestingAuthorityTransactionClient | null = null;
  let destroyClient = false;

  try {
    client = await database.connect();
    await client.query("begin");
    const staleContext = await hasStaleTransactionContext(client);
    if (staleContext) {
      destroyClient = true;
      throw new Error("STALE_INVESTING_TRANSACTION_CONTEXT");
    }
    await client.query(
      [
        "insert into investing.pre_authority_audit_events (",
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
        // The original authority denial remains fail-closed even if audit cleanup fails.
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

async function writeCanonicalDenialAudit(
  database: InvestingAuthorityDatabase,
  audit: CanonicalDenialAuditDraft,
): Promise<boolean> {
  let client: InvestingAuthorityTransactionClient | null = null;
  let destroyClient = false;

  try {
    client = await database.connect();
    await client.query("begin");
    const staleContext = await hasStaleTransactionContext(client);
    if (staleContext) {
      destroyClient = true;
      throw new Error("STALE_INVESTING_TRANSACTION_CONTEXT");
    }
    await setTransactionContext(client, {
      actor_kind: audit.actorKind,
      actor_id: audit.actorId,
      external_provider: "CLERK",
      external_subject: audit.actorId,
      principal_id: audit.principalId,
      tenant_id: audit.tenantId,
      account_id: audit.accountId,
      operation: accountContextResolveOperation,
      capability: accountAuthorityReadCapability,
      correlation_id: audit.correlationId,
    });
    await client.query(
      [
        "insert into investing.audit_events (",
        "correlation_id, actor_kind, actor_id, principal_id, operation_scope, tenant_id, account_id,",
        "action, object_type, object_id, outcome, reason_code, evidence, occurred_at",
        ") values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, transaction_timestamp())",
      ].join(" "),
      [
        audit.correlationId,
        audit.actorKind,
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
        // The original authority denial remains fail-closed even if audit cleanup fails.
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

function collapseExternalFailure(
  code: Exclude<InvestingAuthorityFailureCode, "UNAUTHENTICATED">,
): "FORBIDDEN_OR_NOT_FOUND" | "INTERNAL_ERROR" {
  return code === "INTERNAL_ERROR" ? "INTERNAL_ERROR" : "FORBIDDEN_OR_NOT_FOUND";
}
