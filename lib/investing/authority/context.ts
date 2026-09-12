import { createHash } from "node:crypto";
import { resolveVerifiedClerkIdentity } from "./clerk";
import { getInvestingAuthorityDatabase } from "./transport";

const authorizedInvestingContextRuntimeBrand = Symbol("AuthorizedInvestingContext");
const authorizedResearchInvestigationCreateContextRuntimeBrand = Symbol(
  "AuthorizedResearchInvestigationCreateContext",
);
const authorizedResearchDraftCreateContextRuntimeBrand = Symbol("AuthorizedResearchDraftCreateContext");
const authorizedResearchMaterialRevisionCreateContextRuntimeBrand = Symbol(
  "AuthorizedResearchMaterialRevisionCreateContext",
);
const accountContextResolveOperation = "ACCOUNT_CONTEXT_RESOLVE";
const accountAuthorityReadCapability = "ACCOUNT_AUTHORITY_READ";
const researchInvestigationCreateOperation = "RESEARCH_INVESTIGATION_CREATE_V1";
const researchDraftCreateOperation = "RESEARCH_DRAFT_CREATE_V1";
const researchDraftRevisionCreateOperation = "RESEARCH_DRAFT_REVISION_CREATE_V1";
const researchHypothesisRevisionCreateOperation = "RESEARCH_HYPOTHESIS_REVISION_CREATE_V1";
const researchMutateCapability = "RESEARCH_MUTATE";
const preAuthorityExternalSubjectHashDomain = "SYNTRAKE_INVESTING_I2B_EXTERNAL_SUBJECT_V1";
const preAuthoritySelectorHashDomain = "SYNTRAKE_INVESTING_I2B_SELECTOR_V1";
const researchPreAuthorityExternalSubjectHashDomain = "SYNTRAKE_INVESTING_I5_EXTERNAL_SUBJECT_V1";
const researchPreAuthoritySelectorHashDomain = "SYNTRAKE_INVESTING_I5_SELECTOR_V1";

type InvestingContextBrand = {
  readonly __authorizedInvestingContext: "AuthorizedInvestingContext";
};

type ResearchInvestigationCreateContextBrand = {
  readonly __authorizedResearchInvestigationCreateContext: "AuthorizedResearchInvestigationCreateContext";
};

type ResearchDraftCreateContextBrand = {
  readonly __authorizedResearchDraftCreateContext: "AuthorizedResearchDraftCreateContext";
};

type ResearchMaterialRevisionCreateContextBrand = {
  readonly __authorizedResearchMaterialRevisionCreateContext: "AuthorizedResearchMaterialRevisionCreateContext";
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
  InvestingContextBrand & {
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
    capability: typeof accountAuthorityReadCapability;
  }
>;

export type ResearchSourceContext = "PURE_RESEARCH" | "TEST_PORTFOLIO" | "USER_PORTFOLIO";

export type AuthorizedResearchInvestigationCreateContext = Readonly<
  ResearchInvestigationCreateContextBrand & {
    actorKind: "USER_PRINCIPAL";
    actorId: string;
    principalId: string;
    tenantId: string;
    tenantMembershipId: string;
    correlationId: string;
    operation: typeof researchInvestigationCreateOperation;
    capability: typeof researchMutateCapability;
    sourceContext: ResearchSourceContext;
  } & (
      | {
          operationScope: "TENANT_SCOPE";
          sourceContext: "PURE_RESEARCH" | "TEST_PORTFOLIO";
          accountId?: never;
          accountAccessId?: never;
        }
      | {
          operationScope: "ACCOUNT_SCOPE";
          sourceContext: "USER_PORTFOLIO";
          accountId: string;
          accountAccessId: string;
        }
    )
>;

export type AuthorizedResearchDraftCreateContext = Readonly<
  ResearchDraftCreateContextBrand & {
    actorKind: "USER_PRINCIPAL";
    actorId: string;
    principalId: string;
    tenantId: string;
    tenantMembershipId: string;
    correlationId: string;
    operation: typeof researchDraftCreateOperation;
    capability: typeof researchMutateCapability;
    sourceContext: ResearchSourceContext;
    researchInvestigationId: string;
  } & (
      | {
          operationScope: "TENANT_SCOPE";
          sourceContext: "PURE_RESEARCH" | "TEST_PORTFOLIO";
        }
      | {
          operationScope: "ACCOUNT_SCOPE";
          sourceContext: "USER_PORTFOLIO";
          accountId: string;
          accountAccessId: string;
        }
    )
>;

export type ResearchMaterialRevisionCreateOperation =
  | typeof researchDraftRevisionCreateOperation
  | typeof researchHypothesisRevisionCreateOperation;

export type AuthorizedResearchMaterialRevisionCreateContext = Readonly<
  ResearchMaterialRevisionCreateContextBrand & {
    actorKind: "USER_PRINCIPAL";
    actorId: string;
    principalId: string;
    tenantId: string;
    tenantMembershipId: string;
    correlationId: string;
    operation: ResearchMaterialRevisionCreateOperation;
    capability: typeof researchMutateCapability;
    sourceContext: ResearchSourceContext;
    researchInvestigationId: string;
  } & (
      | {
          operationScope: "TENANT_SCOPE";
          sourceContext: "PURE_RESEARCH" | "TEST_PORTFOLIO";
        }
      | {
          operationScope: "ACCOUNT_SCOPE";
          sourceContext: "USER_PORTFOLIO";
          accountId: string;
          accountAccessId: string;
        }
    )
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
  | "TENANT_SELECTOR_LOOKUP"
  | "TENANT_STATE"
  | "TENANT_MEMBERSHIP_LOOKUP"
  | "ACCOUNT_SELECTOR_LOOKUP"
  | "ACCOUNT_STATE"
  | "ACCOUNT_ACCESS_LOOKUP"
  | "TRANSACTION_CONTEXT_PREFLIGHT";

type PreAuthorityAuditDraft = {
  externalProvider: "CLERK";
  externalSubjectHash: string;
  correlationId: string;
  operation: typeof accountContextResolveOperation | typeof researchInvestigationCreateOperation;
  operationScope: "ACCOUNT_SCOPE" | "TENANT_SCOPE";
  selectorKind: "ACCOUNT_ID" | "TENANT_ID";
  selectorHash: string;
  resolutionStage: PreAuthorityAuditResolutionStage;
  outcome: PreAuthorityAuditOutcome;
  reasonCode:
    | "ZERO_PRINCIPAL"
    | "DUPLICATE_PRINCIPAL"
    | "PRINCIPAL_DISABLED"
    | "TENANT_SELECTOR_NOT_ACCESSIBLE"
    | "DUPLICATE_TENANT_SELECTOR"
    | "TENANT_INACTIVE"
    | "MEMBERSHIP_INACTIVE"
    | "DUPLICATE_ACTIVE_MEMBERSHIP"
    | "ACCOUNT_SELECTOR_NOT_ACCESSIBLE"
    | "DUPLICATE_ACCOUNT_SELECTOR"
    | "ACCOUNT_INACTIVE"
    | "ACCESS_INACTIVE"
    | "DUPLICATE_ACTIVE_ACCOUNT_ACCESS"
    | "AUTHORITY_TUPLE_MISMATCH"
    | "STALE_TRANSACTION_CONTEXT";
};

type ResearchPreAuthorityAuditBase = ReturnType<typeof createResearchPreAuthorityAuditBase>;

type CanonicalDenialAuditDraft = {
  correlationId: string;
  actorKind: "USER_PRINCIPAL";
  actorId: string;
  principalId: string;
  operationScope: "ACCOUNT_SCOPE" | "TENANT_SCOPE";
  tenantId: string;
  accountId: string | null;
  action: "AUTHORITY_ACCESS_DENIED";
  objectType: "ACCOUNT" | "TENANT";
  objectId: string;
  outcome: "DENIED" | "FAILED";
  reasonCode:
    | "TENANT_INACTIVE"
    | "MEMBERSHIP_INACTIVE"
    | "ACCOUNT_INACTIVE"
    | "ACCESS_INACTIVE"
    | "DUPLICATE_ACTIVE_MEMBERSHIP"
    | "DUPLICATE_ACTIVE_ACCOUNT_ACCESS"
    | "AUTHORITY_TUPLE_MISMATCH";
  evidence: Record<string, string>;
};

export type InvestingAuthorityQueryResult<Row> = {
  rows: Row[];
  rowCount: number | null;
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

export type ResolveAuthorizedResearchInvestigationCreateContextInput =
  | {
      sourceContext: "PURE_RESEARCH" | "TEST_PORTFOLIO";
      tenantId: string;
      correlationId: string;
      accountId?: never;
    }
  | {
      sourceContext: "USER_PORTFOLIO";
      accountId: string;
      correlationId: string;
      tenantId?: never;
    };

export type ResolveAuthorizedResearchDraftCreateContextInput = {
  researchInvestigationId: string;
  correlationId: string;
};

export type ResolveAuthorizedResearchMaterialRevisionCreateContextInput = {
  researchInvestigationId: string;
  correlationId: string;
  operation: ResearchMaterialRevisionCreateOperation;
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

type ResearchInvestigationAuthorityRow = {
  research_investigation_id: string;
  tenant_id: string;
  account_id: string | null;
  principal_id: string;
  actor_kind: "USER_PRINCIPAL";
  actor_id: string;
  tenant_membership_id: string;
  account_access_id: string | null;
  operation_scope: "TENANT_SCOPE" | "ACCOUNT_SCOPE";
  source_context: ResearchSourceContext;
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const forbiddenClientAuthorityFields = new Set([
  "userId",
  "tenantId",
  "principalId",
  "operation",
  "capability",
  "operation_scope",
  "operationScope",
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
  "syntrake.investing.operation_scope",
  "syntrake.investing.correlation_id",
  "syntrake.investing.research_investigation_id",
] as const;

export function isAuthorizedInvestingContext(value: unknown): value is AuthorizedInvestingContext {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { [authorizedInvestingContextRuntimeBrand]?: boolean })[
      authorizedInvestingContextRuntimeBrand
    ] === true &&
    (value as Partial<AuthorizedInvestingContext>).operation === accountContextResolveOperation &&
    (value as Partial<AuthorizedInvestingContext>).capability === accountAuthorityReadCapability &&
    (value as Partial<AuthorizedInvestingContext>).operationScope === "ACCOUNT_SCOPE" &&
    typeof (value as Partial<AuthorizedInvestingContext>).accountId === "string" &&
    typeof (value as Partial<AuthorizedInvestingContext>).accountAccessId === "string"
  );
}

export function isAuthorizedResearchInvestigationCreateContext(
  value: unknown,
): value is AuthorizedResearchInvestigationCreateContext {
  if (
    typeof value !== "object" ||
    value === null ||
    (value as { [authorizedResearchInvestigationCreateContextRuntimeBrand]?: boolean })[
      authorizedResearchInvestigationCreateContextRuntimeBrand
    ] !== true ||
    (value as Partial<AuthorizedResearchInvestigationCreateContext>).operation !==
      researchInvestigationCreateOperation ||
    (value as Partial<AuthorizedResearchInvestigationCreateContext>).capability !== researchMutateCapability
  ) {
    return false;
  }

  const context = value as Partial<AuthorizedResearchInvestigationCreateContext>;
  if (
    context.operationScope === "TENANT_SCOPE" &&
    (context.sourceContext === "PURE_RESEARCH" || context.sourceContext === "TEST_PORTFOLIO")
  ) {
    return !("accountId" in context) && !("accountAccessId" in context);
  }

  return (
    context.operationScope === "ACCOUNT_SCOPE" &&
    context.sourceContext === "USER_PORTFOLIO" &&
    typeof context.accountId === "string" &&
    typeof context.accountAccessId === "string"
  );
}

export function isAuthorizedResearchDraftCreateContext(
  value: unknown,
): value is AuthorizedResearchDraftCreateContext {
  if (
    typeof value !== "object" ||
    value === null ||
    (value as { [authorizedResearchDraftCreateContextRuntimeBrand]?: boolean })[
      authorizedResearchDraftCreateContextRuntimeBrand
    ] !== true ||
    (value as Partial<AuthorizedResearchDraftCreateContext>).operation !== researchDraftCreateOperation ||
    (value as Partial<AuthorizedResearchDraftCreateContext>).capability !== researchMutateCapability ||
    typeof (value as Partial<AuthorizedResearchDraftCreateContext>).researchInvestigationId !== "string"
  ) {
    return false;
  }

  const context = value as Partial<AuthorizedResearchDraftCreateContext>;
  if (
    context.operationScope === "TENANT_SCOPE" &&
    (context.sourceContext === "PURE_RESEARCH" || context.sourceContext === "TEST_PORTFOLIO")
  ) {
    return !("accountId" in context) && !("accountAccessId" in context);
  }

  return (
    context.operationScope === "ACCOUNT_SCOPE" &&
    context.sourceContext === "USER_PORTFOLIO" &&
    typeof context.accountId === "string" &&
    typeof context.accountAccessId === "string"
  );
}

export function isAuthorizedResearchMaterialRevisionCreateContext(
  value: unknown,
): value is AuthorizedResearchMaterialRevisionCreateContext {
  if (
    typeof value !== "object" ||
    value === null ||
    (value as { [authorizedResearchMaterialRevisionCreateContextRuntimeBrand]?: boolean })[
      authorizedResearchMaterialRevisionCreateContextRuntimeBrand
    ] !== true ||
    !(
      (value as Partial<AuthorizedResearchMaterialRevisionCreateContext>).operation ===
        researchDraftRevisionCreateOperation ||
      (value as Partial<AuthorizedResearchMaterialRevisionCreateContext>).operation ===
        researchHypothesisRevisionCreateOperation
    ) ||
    (value as Partial<AuthorizedResearchMaterialRevisionCreateContext>).capability !== researchMutateCapability ||
    typeof (value as Partial<AuthorizedResearchMaterialRevisionCreateContext>).researchInvestigationId !== "string"
  ) {
    return false;
  }

  const context = value as Partial<AuthorizedResearchMaterialRevisionCreateContext>;
  if (
    context.operationScope === "TENANT_SCOPE" &&
    (context.sourceContext === "PURE_RESEARCH" || context.sourceContext === "TEST_PORTFOLIO")
  ) {
    return !("accountId" in context) && !("accountAccessId" in context);
  }

  return (
    context.operationScope === "ACCOUNT_SCOPE" &&
    context.sourceContext === "USER_PORTFOLIO" &&
    typeof context.accountId === "string" &&
    typeof context.accountAccessId === "string"
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
      context: brandAuthorizedInvestingContext({
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

  return transaction.result as InvestingAuthorityResult;
}

export async function resolveAuthorizedResearchInvestigationCreateContext(
  input: ResolveAuthorizedResearchInvestigationCreateContextInput,
): Promise<InvestingAuthorityResult | { ok: true; context: AuthorizedResearchInvestigationCreateContext }> {
  const parsed = parseResearchInvestigationCreateInput(input as Record<string, unknown>);
  if (parsed.ok === false) return parsed;

  const verifiedAuth = await resolveVerifiedClerkIdentity();
  if (verifiedAuth.ok === false) return fail(verifiedAuth.code);

  let database: InvestingAuthorityDatabase;
  try {
    database = getInvestingAuthorityDatabase();
  } catch {
    return fail("INTERNAL_ERROR");
  }

  const preAuthorityAuditBase = createResearchPreAuthorityAuditBase({
    externalSubject: verifiedAuth.externalSubject,
    correlationId: parsed.command.correlationId,
    operationScope: parsed.command.operationScope,
    selectorKind: parsed.command.operationScope === "TENANT_SCOPE" ? "TENANT_ID" : "ACCOUNT_ID",
    selectorValue: parsed.command.operationScope === "TENANT_SCOPE" ? parsed.command.tenantId : parsed.command.accountId,
  });

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
      operation: researchInvestigationCreateOperation,
      capability: researchMutateCapability,
      operation_scope: parsed.command.operationScope,
      correlation_id: parsed.command.correlationId,
      ...(parsed.command.operationScope === "TENANT_SCOPE"
        ? { tenant_id: parsed.command.tenantId }
        : { account_id: parsed.command.accountId }),
    });

    const principal = await resolveResearchPrincipal(client, verifiedAuth, preAuthorityAuditBase);
    if (!("row" in principal)) return principal;
    await setTransactionContext(client, { principal_id: principal.row.principal_id });

    if (parsed.command.operationScope === "TENANT_SCOPE") {
      return resolveResearchTenantScope(client, {
        command: parsed.command,
        principal: principal.row,
        actorId: verifiedAuth.externalSubject,
        preAuthorityAuditBase,
      });
    }

    return resolveResearchAccountScope(client, {
      command: parsed.command,
      principal: principal.row,
      actorId: verifiedAuth.externalSubject,
      preAuthorityAuditBase,
    });
  });

  if (transaction.preAuthorityAudit) {
    const auditWritten = await writePreAuthorityAudit(database, transaction.preAuthorityAudit);
    if (!auditWritten) return fail("INTERNAL_ERROR");
  }

  if (transaction.canonicalDenialAudit) {
    const auditWritten = await writeCanonicalDenialAudit(database, transaction.canonicalDenialAudit);
    if (!auditWritten) return fail("INTERNAL_ERROR");
  }

  return transaction.result as InvestingAuthorityResult | { ok: true; context: AuthorizedResearchInvestigationCreateContext };
}

export async function resolveAuthorizedResearchDraftCreateContext(
  input: ResolveAuthorizedResearchDraftCreateContextInput,
): Promise<InvestingAuthorityResult | { ok: true; context: AuthorizedResearchDraftCreateContext }> {
  if (
    input === null ||
    typeof input !== "object" ||
    Object.getPrototypeOf(input) !== Object.prototype ||
    !hasOnlyKeys(input as Record<string, unknown>, ["researchInvestigationId", "correlationId"]) ||
    !uuidPattern.test(input.researchInvestigationId) ||
    !isValidCorrelationId(input.correlationId)
  ) {
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

  const transaction = await withAuthorityTransaction(database, async (client) => {
    if (await hasStaleTransactionContext(client)) return { ...fail("INTERNAL_ERROR"), destroyClient: true };
    await setTransactionContext(client, {
      actor_kind: "USER_PRINCIPAL",
      actor_id: verifiedAuth.externalSubject,
      external_provider: verifiedAuth.externalProvider,
      external_subject: verifiedAuth.externalSubject,
      operation: researchDraftCreateOperation,
      capability: researchMutateCapability,
      correlation_id: input.correlationId,
      research_investigation_id: input.researchInvestigationId,
    });

    const principal = await expectExactlyOne(
      client.query<PrincipalRow>(
        "select principal_id, state from investing.principals where external_provider = $1 and external_subject = $2",
        [verifiedAuth.externalProvider, verifiedAuth.externalSubject],
      ),
      "FORBIDDEN_OR_NOT_FOUND",
    );
    if (principal.ok === false) return principal;
    if (principal.row.state !== "ACTIVE") return fail("PRINCIPAL_DISABLED");
    await setTransactionContext(client, { principal_id: principal.row.principal_id });

    const parent = await expectExactlyOne(
      client.query<ResearchInvestigationAuthorityRow>(
        [
          "select research_investigation_id, tenant_id, account_id, principal_id, actor_kind, actor_id,",
          "tenant_membership_id, account_access_id, operation_scope, source_context",
          "from investing.research_investigations",
          "where research_investigation_id = $1 and principal_id = $2 and actor_kind = 'USER_PRINCIPAL' and actor_id = $3",
        ].join(" "),
        [input.researchInvestigationId, principal.row.principal_id, verifiedAuth.externalSubject],
      ),
      "FORBIDDEN_OR_NOT_FOUND",
    );
    if (parent.ok === false) return parent;
    const row = parent.row;
    await setTransactionContext(client, {
      tenant_id: row.tenant_id,
      tenant_membership_id: row.tenant_membership_id,
      operation_scope: row.operation_scope,
      ...(row.account_id ? { account_id: row.account_id } : {}),
      ...(row.account_access_id ? { account_access_id: row.account_access_id } : {}),
    });

    const tenant = await expectExactlyOne(
      client.query<TenantRow>("select tenant_id, state from investing.tenants where tenant_id = $1", [row.tenant_id]),
      "FORBIDDEN_OR_NOT_FOUND",
    );
    if (tenant.ok === false) return tenant;
    if (tenant.row.state !== "ACTIVE") return fail("TENANT_INACTIVE");

    const membership = await expectExactlyOne(
      client.query<MembershipRow>(
        [
          "select tenant_membership_id, tenant_id, principal_id, state",
          "from investing.tenant_memberships",
          "where tenant_membership_id = $1 and tenant_id = $2 and principal_id = $3 and role = 'OWNER' and state = 'ACTIVE'",
        ].join(" "),
        [row.tenant_membership_id, row.tenant_id, principal.row.principal_id],
      ),
      "MEMBERSHIP_INACTIVE",
    );
    if (membership.ok === false) return membership;

    if (row.operation_scope === "TENANT_SCOPE") {
      if (
        row.account_id !== null ||
        row.account_access_id !== null ||
        (row.source_context !== "PURE_RESEARCH" && row.source_context !== "TEST_PORTFOLIO")
      ) {
        return fail("INTERNAL_ERROR");
      }
      return {
        ok: true,
        context: brandAuthorizedResearchDraftCreateContext({
          actorKind: "USER_PRINCIPAL",
          actorId: verifiedAuth.externalSubject,
          principalId: principal.row.principal_id,
          operationScope: "TENANT_SCOPE",
          tenantId: row.tenant_id,
          tenantMembershipId: row.tenant_membership_id,
          correlationId: input.correlationId,
          operation: researchDraftCreateOperation,
          capability: researchMutateCapability,
          sourceContext: row.source_context,
          researchInvestigationId: row.research_investigation_id,
        }),
      };
    }

    if (
      row.operation_scope !== "ACCOUNT_SCOPE" ||
      row.source_context !== "USER_PORTFOLIO" ||
      row.account_id === null ||
      row.account_access_id === null
    ) {
      return fail("INTERNAL_ERROR");
    }

    const account = await expectExactlyOne(
      client.query<AccountRow>(
        "select account_id, tenant_id, state from investing.accounts where account_id = $1 and tenant_id = $2",
        [row.account_id, row.tenant_id],
      ),
      "FORBIDDEN_OR_NOT_FOUND",
    );
    if (account.ok === false) return account;
    if (account.row.state !== "ACTIVE") return fail("ACCOUNT_INACTIVE");

    const access = await expectExactlyOne(
      client.query<AccountAccessRow>(
        [
          "select account_access_id, account_id, tenant_id, tenant_membership_id, principal_id, state",
          "from investing.account_access",
          "where account_access_id = $1 and account_id = $2 and tenant_id = $3",
          "and tenant_membership_id = $4 and principal_id = $5 and role = 'OWNER' and state = 'ACTIVE'",
        ].join(" "),
        [row.account_access_id, row.account_id, row.tenant_id, row.tenant_membership_id, principal.row.principal_id],
      ),
      "ACCESS_INACTIVE",
    );
    if (access.ok === false) return access;

    if (
      account.row.tenant_id !== tenant.row.tenant_id ||
      membership.row.tenant_id !== tenant.row.tenant_id ||
      membership.row.principal_id !== principal.row.principal_id ||
      access.row.account_id !== account.row.account_id ||
      access.row.tenant_id !== tenant.row.tenant_id ||
      access.row.tenant_membership_id !== membership.row.tenant_membership_id ||
      access.row.principal_id !== principal.row.principal_id
    ) {
      return fail("INTERNAL_ERROR");
    }

    return {
      ok: true,
      context: brandAuthorizedResearchDraftCreateContext({
        actorKind: "USER_PRINCIPAL",
        actorId: verifiedAuth.externalSubject,
        principalId: principal.row.principal_id,
        operationScope: "ACCOUNT_SCOPE",
        tenantId: row.tenant_id,
        accountId: row.account_id,
        tenantMembershipId: row.tenant_membership_id,
        accountAccessId: row.account_access_id,
        correlationId: input.correlationId,
        operation: researchDraftCreateOperation,
        capability: researchMutateCapability,
        sourceContext: "USER_PORTFOLIO",
        researchInvestigationId: row.research_investigation_id,
      }),
    };
  });

  return transaction.result as InvestingAuthorityResult | { ok: true; context: AuthorizedResearchDraftCreateContext };
}

export async function resolveAuthorizedResearchMaterialRevisionCreateContext(
  input: ResolveAuthorizedResearchMaterialRevisionCreateContextInput,
): Promise<InvestingAuthorityResult | { ok: true; context: AuthorizedResearchMaterialRevisionCreateContext }> {
  if (
    input === null ||
    typeof input !== "object" ||
    Object.getPrototypeOf(input) !== Object.prototype ||
    !hasOnlyKeys(input as Record<string, unknown>, ["researchInvestigationId", "correlationId", "operation"]) ||
    !uuidPattern.test(input.researchInvestigationId) ||
    !isValidCorrelationId(input.correlationId) ||
    (input.operation !== researchDraftRevisionCreateOperation &&
      input.operation !== researchHypothesisRevisionCreateOperation)
  ) {
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

  const transaction = await withAuthorityTransaction(database, async (client) => {
    if (await hasStaleTransactionContext(client)) return { ...fail("INTERNAL_ERROR"), destroyClient: true };
    await setTransactionContext(client, {
      actor_kind: "USER_PRINCIPAL",
      actor_id: verifiedAuth.externalSubject,
      external_provider: verifiedAuth.externalProvider,
      external_subject: verifiedAuth.externalSubject,
      operation: input.operation,
      capability: researchMutateCapability,
      correlation_id: input.correlationId,
      research_investigation_id: input.researchInvestigationId,
    });

    const principal = await expectExactlyOne(
      client.query<PrincipalRow>(
        "select principal_id, state from investing.principals where external_provider = $1 and external_subject = $2",
        [verifiedAuth.externalProvider, verifiedAuth.externalSubject],
      ),
      "FORBIDDEN_OR_NOT_FOUND",
    );
    if (principal.ok === false) return principal;
    if (principal.row.state !== "ACTIVE") return fail("PRINCIPAL_DISABLED");
    await setTransactionContext(client, { principal_id: principal.row.principal_id });

    const parent = await expectExactlyOne(
      client.query<ResearchInvestigationAuthorityRow>(
        [
          "select research_investigation_id, tenant_id, account_id, principal_id, actor_kind, actor_id,",
          "tenant_membership_id, account_access_id, operation_scope, source_context",
          "from investing.research_investigations",
          "where research_investigation_id = $1 and principal_id = $2 and actor_kind = 'USER_PRINCIPAL' and actor_id = $3",
        ].join(" "),
        [input.researchInvestigationId, principal.row.principal_id, verifiedAuth.externalSubject],
      ),
      "FORBIDDEN_OR_NOT_FOUND",
    );
    if (parent.ok === false) return parent;
    const row = parent.row;
    await setTransactionContext(client, {
      tenant_id: row.tenant_id,
      tenant_membership_id: row.tenant_membership_id,
      operation_scope: row.operation_scope,
      ...(row.account_id ? { account_id: row.account_id } : {}),
      ...(row.account_access_id ? { account_access_id: row.account_access_id } : {}),
    });

    const tenant = await expectExactlyOne(
      client.query<TenantRow>("select tenant_id, state from investing.tenants where tenant_id = $1", [row.tenant_id]),
      "FORBIDDEN_OR_NOT_FOUND",
    );
    if (tenant.ok === false) return tenant;
    if (tenant.row.state !== "ACTIVE") return fail("TENANT_INACTIVE");

    const membership = await expectExactlyOne(
      client.query<MembershipRow>(
        [
          "select tenant_membership_id, tenant_id, principal_id, state",
          "from investing.tenant_memberships",
          "where tenant_membership_id = $1 and tenant_id = $2 and principal_id = $3 and role = 'OWNER' and state = 'ACTIVE'",
        ].join(" "),
        [row.tenant_membership_id, row.tenant_id, principal.row.principal_id],
      ),
      "MEMBERSHIP_INACTIVE",
    );
    if (membership.ok === false) return membership;

    if (row.operation_scope === "TENANT_SCOPE") {
      if (
        row.account_id !== null ||
        row.account_access_id !== null ||
        (row.source_context !== "PURE_RESEARCH" && row.source_context !== "TEST_PORTFOLIO")
      ) {
        return fail("INTERNAL_ERROR");
      }
      return {
        ok: true,
        context: brandAuthorizedResearchMaterialRevisionCreateContext({
          actorKind: "USER_PRINCIPAL",
          actorId: verifiedAuth.externalSubject,
          principalId: principal.row.principal_id,
          operationScope: "TENANT_SCOPE",
          tenantId: row.tenant_id,
          tenantMembershipId: row.tenant_membership_id,
          correlationId: input.correlationId,
          operation: input.operation,
          capability: researchMutateCapability,
          sourceContext: row.source_context,
          researchInvestigationId: row.research_investigation_id,
        }),
      };
    }

    if (
      row.operation_scope !== "ACCOUNT_SCOPE" ||
      row.source_context !== "USER_PORTFOLIO" ||
      row.account_id === null ||
      row.account_access_id === null
    ) {
      return fail("INTERNAL_ERROR");
    }

    const account = await expectExactlyOne(
      client.query<AccountRow>(
        "select account_id, tenant_id, state from investing.accounts where account_id = $1 and tenant_id = $2",
        [row.account_id, row.tenant_id],
      ),
      "FORBIDDEN_OR_NOT_FOUND",
    );
    if (account.ok === false) return account;
    if (account.row.state !== "ACTIVE") return fail("ACCOUNT_INACTIVE");

    const access = await expectExactlyOne(
      client.query<AccountAccessRow>(
        [
          "select account_access_id, account_id, tenant_id, tenant_membership_id, principal_id, state",
          "from investing.account_access",
          "where account_access_id = $1 and account_id = $2 and tenant_id = $3",
          "and tenant_membership_id = $4 and principal_id = $5 and role = 'OWNER' and state = 'ACTIVE'",
        ].join(" "),
        [row.account_access_id, row.account_id, row.tenant_id, row.tenant_membership_id, principal.row.principal_id],
      ),
      "ACCESS_INACTIVE",
    );
    if (access.ok === false) return access;

    if (
      account.row.tenant_id !== tenant.row.tenant_id ||
      membership.row.tenant_id !== tenant.row.tenant_id ||
      membership.row.principal_id !== principal.row.principal_id ||
      access.row.account_id !== account.row.account_id ||
      access.row.tenant_id !== tenant.row.tenant_id ||
      access.row.tenant_membership_id !== membership.row.tenant_membership_id ||
      access.row.principal_id !== principal.row.principal_id
    ) {
      return fail("INTERNAL_ERROR");
    }

    return {
      ok: true,
      context: brandAuthorizedResearchMaterialRevisionCreateContext({
        actorKind: "USER_PRINCIPAL",
        actorId: verifiedAuth.externalSubject,
        principalId: principal.row.principal_id,
        operationScope: "ACCOUNT_SCOPE",
        tenantId: row.tenant_id,
        accountId: row.account_id,
        tenantMembershipId: row.tenant_membership_id,
        accountAccessId: row.account_access_id,
        correlationId: input.correlationId,
        operation: input.operation,
        capability: researchMutateCapability,
        sourceContext: "USER_PORTFOLIO",
        researchInvestigationId: row.research_investigation_id,
      }),
    };
  });

  return transaction.result as InvestingAuthorityResult | { ok: true; context: AuthorizedResearchMaterialRevisionCreateContext };
}

function rejectClientAuthorityFields(input: ResolveAuthorizedInvestingAccountContextInput) {
  for (const key of Object.keys(input)) {
    if (forbiddenClientAuthorityFields.has(key)) return fail("FORBIDDEN_OR_NOT_FOUND");
  }

  return null;
}

type ParsedResearchInvestigationCreateCommand =
  | {
      sourceContext: "PURE_RESEARCH" | "TEST_PORTFOLIO";
      operationScope: "TENANT_SCOPE";
      tenantId: string;
      correlationId: string;
    }
  | {
      sourceContext: "USER_PORTFOLIO";
      operationScope: "ACCOUNT_SCOPE";
      accountId: string;
      correlationId: string;
    };

function parseResearchInvestigationCreateInput(
  input: Record<string, unknown>,
): { ok: true; command: ParsedResearchInvestigationCreateCommand } | InvestingAuthorityFailure {
  if (input === null || typeof input !== "object" || Object.getPrototypeOf(input) !== Object.prototype) {
    return fail("VALIDATION_ERROR");
  }

  const ownValues: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(input)) {
    if (typeof key !== "string") return fail("VALIDATION_ERROR");
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable || descriptor.value === undefined) {
      return fail("VALIDATION_ERROR");
    }
    ownValues[key] = descriptor.value;
  }

  const sourceContext = ownValues.sourceContext;
  const correlationId = ownValues.correlationId;
  if (typeof sourceContext !== "string" || typeof correlationId !== "string" || !isValidCorrelationId(correlationId)) {
    return fail("VALIDATION_ERROR");
  }

  if (sourceContext === "PURE_RESEARCH" || sourceContext === "TEST_PORTFOLIO") {
    if (!hasOnlyKeys(ownValues, ["sourceContext", "tenantId", "correlationId"])) return fail("VALIDATION_ERROR");
    if (typeof ownValues.tenantId !== "string" || !uuidPattern.test(ownValues.tenantId)) {
      return fail("VALIDATION_ERROR");
    }
    return {
      ok: true,
      command: {
        sourceContext,
        operationScope: "TENANT_SCOPE",
        tenantId: ownValues.tenantId,
        correlationId,
      },
    };
  }

  if (sourceContext === "USER_PORTFOLIO") {
    if (!hasOnlyKeys(ownValues, ["sourceContext", "accountId", "correlationId"])) return fail("VALIDATION_ERROR");
    if (typeof ownValues.accountId !== "string" || !uuidPattern.test(ownValues.accountId)) {
      return fail("VALIDATION_ERROR");
    }
    return {
      ok: true,
      command: {
        sourceContext,
        operationScope: "ACCOUNT_SCOPE",
        accountId: ownValues.accountId,
        correlationId,
      },
    };
  }

  return fail("VALIDATION_ERROR");
}

function hasOnlyKeys(input: Record<string, unknown>, keys: readonly string[]) {
  const allowed = new Set(keys);
  return Object.keys(input).every((key) => allowed.has(key)) && keys.every((key) => Object.hasOwn(input, key));
}

function createResearchPreAuthorityAuditBase(input: {
  externalSubject: string;
  correlationId: string;
  operationScope: "TENANT_SCOPE" | "ACCOUNT_SCOPE";
  selectorKind: "TENANT_ID" | "ACCOUNT_ID";
  selectorValue: string;
}) {
  return {
    externalProvider: "CLERK",
    externalSubjectHash: hashPreAuthorityAuditValue(
      researchPreAuthorityExternalSubjectHashDomain,
      "CLERK",
      input.externalSubject,
    ),
    correlationId: input.correlationId,
    operation: researchInvestigationCreateOperation,
    operationScope: input.operationScope,
    selectorKind: input.selectorKind,
    selectorHash: hashPreAuthorityAuditValue(
      researchPreAuthoritySelectorHashDomain,
      input.selectorKind,
      input.selectorValue,
    ),
  } as const;
}

async function resolveResearchPrincipal(
  client: InvestingAuthorityTransactionClient,
  verifiedAuth: { externalProvider: "CLERK"; externalSubject: string },
  preAuthorityAuditBase: ResearchPreAuthorityAuditBase,
): Promise<{ ok: true; row: PrincipalRow } | AuthorityWorkResult> {
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
  return principal;
}

async function resolveResearchTenantScope(
  client: InvestingAuthorityTransactionClient,
  input: {
    command: Extract<ParsedResearchInvestigationCreateCommand, { operationScope: "TENANT_SCOPE" }>;
    principal: PrincipalRow;
    actorId: string;
    preAuthorityAuditBase: ResearchPreAuthorityAuditBase;
  },
): Promise<AuthorityWorkResult> {
  const tenants = await client.query<TenantRow>(
    "select tenant_id, state from investing.tenants where tenant_id = $1",
    [input.command.tenantId],
  );
  const tenant = expectExactlyOneRows(tenants.rows, "FORBIDDEN_OR_NOT_FOUND");
  if (tenant.ok === false) {
    return preAuthorityFailure(tenant.code, {
      ...input.preAuthorityAuditBase,
      resolutionStage: "TENANT_SELECTOR_LOOKUP",
      outcome: tenants.rows.length === 0 ? "DENIED" : "ERROR",
      reasonCode: tenants.rows.length === 0 ? "TENANT_SELECTOR_NOT_ACCESSIBLE" : "DUPLICATE_TENANT_SELECTOR",
    });
  }

  if (tenant.row.state !== "ACTIVE") {
    return researchCanonicalDenial("TENANT_INACTIVE", {
      command: input.command,
      actorId: input.actorId,
      principalId: input.principal.principal_id,
      tenantId: tenant.row.tenant_id,
      accountId: null,
      objectType: "TENANT",
      objectId: tenant.row.tenant_id,
      outcome: "DENIED",
      reasonCode: "TENANT_INACTIVE",
      evidence: { denial_stage: "TENANT_STATE", tenant_state: tenant.row.state },
    });
  }

  const membership = await expectExactlyOne(
    client.query<MembershipRow>(
      [
        "select tenant_membership_id, tenant_id, principal_id, state",
        "from investing.tenant_memberships",
        "where principal_id = $1 and tenant_id = $2 and role = 'OWNER' and state = 'ACTIVE'",
      ].join(" "),
      [input.principal.principal_id, tenant.row.tenant_id],
    ),
    "MEMBERSHIP_INACTIVE",
  );
  if (membership.ok === false) {
    return researchCanonicalDenial(membership.code === "INTERNAL_ERROR" ? "INTERNAL_ERROR" : "MEMBERSHIP_INACTIVE", {
      command: input.command,
      actorId: input.actorId,
      principalId: input.principal.principal_id,
      tenantId: tenant.row.tenant_id,
      accountId: null,
      objectType: "TENANT",
      objectId: tenant.row.tenant_id,
      outcome: membership.code === "INTERNAL_ERROR" ? "FAILED" : "DENIED",
      reasonCode: membership.code === "INTERNAL_ERROR" ? "DUPLICATE_ACTIVE_MEMBERSHIP" : "MEMBERSHIP_INACTIVE",
      evidence: { denial_stage: "TENANT_MEMBERSHIP_LOOKUP" },
    });
  }

  await setTransactionContext(client, { tenant_membership_id: membership.row.tenant_membership_id });

  if (membership.row.principal_id !== input.principal.principal_id || membership.row.tenant_id !== tenant.row.tenant_id) {
    return researchCanonicalDenial("INTERNAL_ERROR", {
      command: input.command,
      actorId: input.actorId,
      principalId: input.principal.principal_id,
      tenantId: tenant.row.tenant_id,
      accountId: null,
      objectType: "TENANT",
      objectId: tenant.row.tenant_id,
      outcome: "FAILED",
      reasonCode: "AUTHORITY_TUPLE_MISMATCH",
      evidence: { denial_stage: "AUTHORITY_TUPLE_VALIDATION" },
    });
  }

  return {
    ok: true,
    context: brandAuthorizedResearchInvestigationCreateContext({
      actorKind: "USER_PRINCIPAL",
      actorId: input.actorId,
      principalId: input.principal.principal_id,
      operationScope: "TENANT_SCOPE",
      tenantId: tenant.row.tenant_id,
      tenantMembershipId: membership.row.tenant_membership_id,
      correlationId: input.command.correlationId,
      operation: researchInvestigationCreateOperation,
      capability: researchMutateCapability,
      sourceContext: input.command.sourceContext,
    }),
  };
}

async function resolveResearchAccountScope(
  client: InvestingAuthorityTransactionClient,
  input: {
    command: Extract<ParsedResearchInvestigationCreateCommand, { operationScope: "ACCOUNT_SCOPE" }>;
    principal: PrincipalRow;
    actorId: string;
    preAuthorityAuditBase: ResearchPreAuthorityAuditBase;
  },
): Promise<AuthorityWorkResult> {
  const accounts = await client.query<AccountRow>(
    "select account_id, tenant_id, state from investing.accounts where account_id = $1",
    [input.command.accountId],
  );
  const account = expectExactlyOneRows(accounts.rows, "FORBIDDEN_OR_NOT_FOUND");
  if (account.ok === false) {
    return preAuthorityFailure(account.code, {
      ...input.preAuthorityAuditBase,
      resolutionStage: "ACCOUNT_SELECTOR_LOOKUP",
      outcome: accounts.rows.length === 0 ? "DENIED" : "ERROR",
      reasonCode: accounts.rows.length === 0 ? "ACCOUNT_SELECTOR_NOT_ACCESSIBLE" : "DUPLICATE_ACCOUNT_SELECTOR",
    });
  }

  await setTransactionContext(client, { tenant_id: account.row.tenant_id });

  if (account.row.state !== "ACTIVE") {
    return researchCanonicalDenial("ACCOUNT_INACTIVE", {
      command: input.command,
      actorId: input.actorId,
      principalId: input.principal.principal_id,
      tenantId: account.row.tenant_id,
      accountId: account.row.account_id,
      objectType: "ACCOUNT",
      objectId: account.row.account_id,
      outcome: "DENIED",
      reasonCode: "ACCOUNT_INACTIVE",
      evidence: { denial_stage: "ACCOUNT_STATE", account_state: account.row.state },
    });
  }

  const tenant = await expectExactlyOne(
    client.query<TenantRow>("select tenant_id, state from investing.tenants where tenant_id = $1", [
      account.row.tenant_id,
    ]),
    "INTERNAL_ERROR",
  );
  if (tenant.ok === false) return tenant;
  if (tenant.row.state !== "ACTIVE") {
    return researchCanonicalDenial("TENANT_INACTIVE", {
      command: input.command,
      actorId: input.actorId,
      principalId: input.principal.principal_id,
      tenantId: account.row.tenant_id,
      accountId: account.row.account_id,
      objectType: "ACCOUNT",
      objectId: account.row.account_id,
      outcome: "DENIED",
      reasonCode: "TENANT_INACTIVE",
      evidence: { denial_stage: "TENANT_STATE", tenant_state: tenant.row.state },
    });
  }

  const membership = await expectExactlyOne(
    client.query<MembershipRow>(
      [
        "select tenant_membership_id, tenant_id, principal_id, state",
        "from investing.tenant_memberships",
        "where principal_id = $1 and tenant_id = $2 and role = 'OWNER' and state = 'ACTIVE'",
      ].join(" "),
      [input.principal.principal_id, account.row.tenant_id],
    ),
    "MEMBERSHIP_INACTIVE",
  );
  if (membership.ok === false) {
    return researchCanonicalDenial(membership.code === "INTERNAL_ERROR" ? "INTERNAL_ERROR" : "MEMBERSHIP_INACTIVE", {
      command: input.command,
      actorId: input.actorId,
      principalId: input.principal.principal_id,
      tenantId: account.row.tenant_id,
      accountId: account.row.account_id,
      objectType: "ACCOUNT",
      objectId: account.row.account_id,
      outcome: membership.code === "INTERNAL_ERROR" ? "FAILED" : "DENIED",
      reasonCode: membership.code === "INTERNAL_ERROR" ? "DUPLICATE_ACTIVE_MEMBERSHIP" : "MEMBERSHIP_INACTIVE",
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
        input.principal.principal_id,
      ],
    ),
    "ACCESS_INACTIVE",
  );
  if (access.ok === false) {
    return researchCanonicalDenial(access.code === "INTERNAL_ERROR" ? "INTERNAL_ERROR" : "ACCESS_INACTIVE", {
      command: input.command,
      actorId: input.actorId,
      principalId: input.principal.principal_id,
      tenantId: account.row.tenant_id,
      accountId: account.row.account_id,
      objectType: "ACCOUNT",
      objectId: account.row.account_id,
      outcome: access.code === "INTERNAL_ERROR" ? "FAILED" : "DENIED",
      reasonCode: access.code === "INTERNAL_ERROR" ? "DUPLICATE_ACTIVE_ACCOUNT_ACCESS" : "ACCESS_INACTIVE",
      evidence: { denial_stage: "ACCOUNT_ACCESS_LOOKUP" },
    });
  }

  await setTransactionContext(client, { account_access_id: access.row.account_access_id });

  const tupleFailure = validateTupleConsistency({
    principal: input.principal,
    tenant: tenant.row,
    account: account.row,
    membership: membership.row,
    access: access.row,
  });
  if (tupleFailure) {
    return researchCanonicalDenial("INTERNAL_ERROR", {
      command: input.command,
      actorId: input.actorId,
      principalId: input.principal.principal_id,
      tenantId: account.row.tenant_id,
      accountId: account.row.account_id,
      objectType: "ACCOUNT",
      objectId: account.row.account_id,
      outcome: "FAILED",
      reasonCode: "AUTHORITY_TUPLE_MISMATCH",
      evidence: { denial_stage: "AUTHORITY_TUPLE_VALIDATION" },
    });
  }

  return {
    ok: true,
    context: brandAuthorizedResearchInvestigationCreateContext({
      actorKind: "USER_PRINCIPAL",
      actorId: input.actorId,
      principalId: input.principal.principal_id,
      operationScope: "ACCOUNT_SCOPE",
      tenantId: account.row.tenant_id,
      accountId: account.row.account_id,
      tenantMembershipId: membership.row.tenant_membership_id,
      accountAccessId: access.row.account_access_id,
      correlationId: input.command.correlationId,
      operation: researchInvestigationCreateOperation,
      capability: researchMutateCapability,
      sourceContext: "USER_PORTFOLIO",
    }),
  };
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

type AuthorityWorkSuccess = {
  ok: true;
  context:
    | AuthorizedInvestingContext
    | AuthorizedResearchInvestigationCreateContext
    | AuthorizedResearchDraftCreateContext
    | AuthorizedResearchMaterialRevisionCreateContext;
  preAuthorityAudit?: undefined;
  canonicalDenialAudit?: undefined;
  destroyClient?: boolean;
};

type AuthorityWorkResult = AuthorityWorkSuccess | (InvestingAuthorityFailure & {
  preAuthorityAudit?: PreAuthorityAuditDraft;
  canonicalDenialAudit?: CanonicalDenialAuditDraft;
  destroyClient?: boolean;
});

type AuthorityTransactionResult = {
  result: AuthorityWorkSuccess | InvestingAuthorityFailure;
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

function brandAuthorizedInvestingContext(
  context: Omit<AuthorizedInvestingContext, keyof InvestingContextBrand>,
): AuthorizedInvestingContext {
  return Object.freeze({
    ...context,
    __authorizedInvestingContext: "AuthorizedInvestingContext",
    [authorizedInvestingContextRuntimeBrand]: true,
  }) as AuthorizedInvestingContext;
}

function brandAuthorizedResearchInvestigationCreateContext<
  Context extends Omit<AuthorizedResearchInvestigationCreateContext, keyof ResearchInvestigationCreateContextBrand>,
>(context: Context): Context & ResearchInvestigationCreateContextBrand {
  return Object.freeze({
    ...context,
    __authorizedResearchInvestigationCreateContext: "AuthorizedResearchInvestigationCreateContext",
    [authorizedResearchInvestigationCreateContextRuntimeBrand]: true,
  }) as unknown as Context & ResearchInvestigationCreateContextBrand;
}

function brandAuthorizedResearchDraftCreateContext<
  Context extends Omit<AuthorizedResearchDraftCreateContext, keyof ResearchDraftCreateContextBrand>,
>(context: Context): Context & ResearchDraftCreateContextBrand {
  return Object.freeze({
    ...context,
    __authorizedResearchDraftCreateContext: "AuthorizedResearchDraftCreateContext",
    [authorizedResearchDraftCreateContextRuntimeBrand]: true,
  }) as unknown as Context & ResearchDraftCreateContextBrand;
}

function brandAuthorizedResearchMaterialRevisionCreateContext<
  Context extends Omit<AuthorizedResearchMaterialRevisionCreateContext, keyof ResearchMaterialRevisionCreateContextBrand>,
>(context: Context): Context & ResearchMaterialRevisionCreateContextBrand {
  return Object.freeze({
    ...context,
    __authorizedResearchMaterialRevisionCreateContext: "AuthorizedResearchMaterialRevisionCreateContext",
    [authorizedResearchMaterialRevisionCreateContextRuntimeBrand]: true,
  }) as unknown as Context & ResearchMaterialRevisionCreateContextBrand;
}

function researchCanonicalDenial(
  code:
    | "TENANT_INACTIVE"
    | "MEMBERSHIP_INACTIVE"
    | "ACCOUNT_INACTIVE"
    | "ACCESS_INACTIVE"
    | "INTERNAL_ERROR",
  input: {
    command: ParsedResearchInvestigationCreateCommand;
    actorId: string;
    principalId: string;
    tenantId: string;
    accountId: string | null;
    objectType: "TENANT" | "ACCOUNT";
    objectId: string;
    outcome: "DENIED" | "FAILED";
    reasonCode: CanonicalDenialAuditDraft["reasonCode"];
    evidence: Record<string, string>;
  },
): AuthorityWorkResult {
  return canonicalDenialFailure(code, {
    correlationId: input.command.correlationId,
    actorKind: "USER_PRINCIPAL",
    actorId: input.actorId,
    principalId: input.principalId,
    operationScope: input.command.operationScope,
    tenantId: input.tenantId,
    accountId: input.accountId,
    action: "AUTHORITY_ACCESS_DENIED",
    objectType: input.objectType,
    objectId: input.objectId,
    outcome: input.outcome,
    reasonCode: input.reasonCode,
    evidence: {
      ...input.evidence,
      operation: researchInvestigationCreateOperation,
      capability: researchMutateCapability,
      source_context: input.command.sourceContext,
    },
  });
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
  code:
    | "TENANT_INACTIVE"
    | "MEMBERSHIP_INACTIVE"
    | "ACCOUNT_INACTIVE"
    | "ACCESS_INACTIVE"
    | "INTERNAL_ERROR",
  canonicalDenialAudit: CanonicalDenialAuditDraft,
): AuthorityWorkResult {
  return {
    ...fail(code),
    canonicalDenialAudit,
  };
}

function stripPreAuthorityAudit(result: AuthorityWorkResult): AuthorityWorkSuccess | InvestingAuthorityFailure {
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
    if (audit.operation === researchInvestigationCreateOperation) {
      await setTransactionContext(client, {
        operation: researchInvestigationCreateOperation,
        capability: researchMutateCapability,
        operation_scope: audit.operationScope,
      });
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
    const isResearchAudit = audit.evidence.operation === researchInvestigationCreateOperation;
    await setTransactionContext(client, {
      actor_kind: audit.actorKind,
      actor_id: audit.actorId,
      external_provider: "CLERK",
      external_subject: audit.actorId,
      principal_id: audit.principalId,
      tenant_id: audit.tenantId,
      operation: isResearchAudit ? researchInvestigationCreateOperation : accountContextResolveOperation,
      capability: isResearchAudit ? researchMutateCapability : accountAuthorityReadCapability,
      ...(isResearchAudit ? { operation_scope: audit.operationScope } : {}),
      ...(audit.accountId ? { account_id: audit.accountId } : {}),
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
