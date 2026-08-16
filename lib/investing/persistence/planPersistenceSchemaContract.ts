import { canonicalSha256, deepFreezeCanonical } from "@/lib/investing/engine/v1/canonical";

export const CANONICAL_INVESTING_PLAN_PERSISTENCE_SCHEMA_CONTRACT_VERSION =
  "canonical-investing-plan-persistence-schema-contract/v1" as const;

export const CANONICAL_INVESTING_PLAN_PERSISTENCE_SCHEMA_FUTURE_TRANSACTION_ORDER = Object.freeze([
  "FRESH_SERVER_AUTHORIZATION",
  "REVALIDATE_ACTIVE_MEMBERSHIP_OWNER_CREATE_PERMISSION",
  "LOCK_CANONICAL_ACCOUNT_ROW_FOR_UPDATE",
  "REVALIDATE_ACCOUNT_STATUS_ENVIRONMENT_AND_CURRENCY",
  "LOOKUP_IDEMPOTENCY_KEY",
  "REPLAY_IF_SEMANTIC_FINGERPRINT_MATCHES",
  "FAIL_IF_IDEMPOTENCY_PAYLOAD_MISMATCH",
  "VALIDATE_EXPECTED_HEAD_ONLY_FOR_NEW_IDEMPOTENCY",
  "DERIVE_NEXT_REVISION_NUMBER_AND_PREVIOUS_REVISION",
  "INSERT_IMMUTABLE_REVISION",
  "INSERT_OR_ADVANCE_SINGLE_HEAD",
  "INSERT_IMMUTABLE_IDEMPOTENCY_RESULT",
  "COMMIT",
] as const);

export type CanonicalInvestingPlanPersistenceSchemaContractV1 = {
  readonly contractVersion: typeof CANONICAL_INVESTING_PLAN_PERSISTENCE_SCHEMA_CONTRACT_VERSION;
  readonly implementationStatus: "DESIGN_ONLY";
  readonly migration: {
    readonly authorized: false;
    readonly applied: false;
    readonly additiveOnly: true;
    readonly forbiddenActions: readonly string[];
  };
  readonly writer: {
    readonly accepted: false;
    readonly futureChokePoint: {
      readonly name: "investing_persist_canonical_plan_v1";
      readonly implementation: "NOT_IMPLEMENTED_IN_A3B";
      readonly functionCapabilityIsAuthorization: false;
      readonly serverMustAuthorizeBeforeCall: true;
      readonly execution: {
        readonly security: "DEFINER";
        readonly searchPath: "pg_catalog, public";
        readonly publicExecute: false;
        readonly anonExecute: false;
        readonly authenticatedExecute: false;
        readonly serviceRoleExecute: true;
      };
    };
  };
  readonly persistence: {
    readonly availability: "UNAVAILABLE";
    readonly databaseWriteAuthorized: false;
  };
  readonly canonicalTables: readonly CanonicalInvestingPlanPersistenceTableV1[];
  readonly canonicalScope: {
    readonly authorityScope: "INVESTING_ACCOUNT";
    readonly fields: readonly ["tenant_id", "owner_user_id", "portfolio_id", "account_id", "environment"];
    readonly accountIdAloneOwnershipProof: false;
    readonly accountBaseCurrencyInAccountForeignKey: false;
  };
  readonly supportingKeys: {
    readonly investingAccounts: {
      readonly purpose: "EXACT_ACCOUNT_SCOPE_COMPOSITE_FOREIGN_KEYS";
      readonly requiredUnique: readonly ["tenant_id", "owner_user_id", "portfolio_id", "id", "environment"];
      readonly includesEnvironment: true;
      readonly includesBaseCurrency: false;
      readonly authority: "RELATIONAL_INTEGRITY_NOT_AUTHORITY";
    };
    readonly investingTenantMemberships: {
      readonly purpose: "AUTHORING_MEMBERSHIP_LINEAGE_SAME_TENANT_USER";
      readonly existingKeys: readonly ["PRIMARY_KEY_id", "UNIQUE_tenant_id_user_id"];
      readonly requiredUnique: readonly ["id", "tenant_id", "user_id"];
      readonly revisionForeignKey: {
        readonly local: readonly ["authoring_membership_id", "tenant_id", "owner_user_id"];
        readonly referenced: readonly ["id", "tenant_id", "user_id"];
      };
    };
  };
  readonly legacyIsolation: {
    readonly legacyTable: "plans";
    readonly legacyMigration: "FORBIDDEN_BY_INFERENCE";
    readonly automaticBackfill: false;
    readonly canonicalReadFallbackToLegacy: false;
    readonly canonicalWriteToLegacy: false;
    readonly legacyRowsGrantAuthority: false;
    readonly canonicalTable: false;
    readonly foreignKeysToCanonicalTables: false;
    readonly triggersConnectingCanonicalTables: false;
    readonly forbiddenTranslations: readonly string[];
  };
  readonly lockStrategy: {
    readonly strategy: "ACCOUNT_ROW_FOR_UPDATE";
    readonly locksExactScope: readonly ["tenant_id", "owner_user_id", "portfolio_id", "account_id", "environment"];
    readonly requiresExistingHead: false;
    readonly advisoryLocksRequired: false;
  };
  readonly transactionOrder: typeof CANONICAL_INVESTING_PLAN_PERSISTENCE_SCHEMA_FUTURE_TRANSACTION_ORDER;
  readonly retrySemantics: {
    readonly replayBeforeExpectedHeadConflict: true;
    readonly sameScopeKeySameSemanticFingerprint: "REPLAY_STORED_RESULT";
    readonly sameScopeKeyDifferentSemanticFingerprint: "FAIL";
    readonly mismatchError: "investing_plan_idempotency_payload_mismatch";
    readonly replayCreatesRevision: false;
    readonly membershipIdInRetryUniqueness: false;
  };
  readonly freshAuthorization: {
    readonly required: true;
    readonly a1FingerprintAuthorization: false;
    readonly a3aCommandFingerprintAuthorization: false;
    readonly idempotencyKeyAuthorization: false;
    readonly serviceRoleAuthorization: false;
    readonly requiredChecks: readonly string[];
  };
  readonly rls: {
    readonly enabled: true;
    readonly forced: true;
    readonly directAnonPolicies: false;
    readonly directAuthenticatedPolicies: false;
    readonly futureDirectDataApiExposureRequiresSeparateAudit: true;
  };
  readonly privileges: {
    readonly anon: CanonicalInvestingPlanPersistencePrivilegeV1;
    readonly authenticated: CanonicalInvestingPlanPersistencePrivilegeV1;
    readonly serviceRole: CanonicalInvestingPlanPersistencePrivilegeV1;
  };
  readonly defaultPolicy: {
    readonly forbiddenFinancialDefaults: readonly string[];
    readonly allowedOperationalDefaults: readonly string[];
  };
  readonly rollback: {
    readonly beforeCanonicalWritesObjectsMayBeRemovedOnlyWithExplicitAuthorization: true;
    readonly afterCanonicalWritesDestructiveRollbackAutomatic: false;
    readonly afterCanonicalWritesRequiresSeparateAuthorizationAndPreservationPlan: true;
  };
  readonly schemaFingerprint: string;
};

type CanonicalInvestingPlanPersistencePrivilegeV1 = {
  readonly select: boolean;
  readonly directInsert: false;
  readonly directUpdate: false;
  readonly directDelete: false;
};

type CanonicalInvestingPlanPersistenceTableV1 = {
  readonly name:
    | "investing_plan_revisions"
    | "investing_plan_heads"
    | "investing_plan_idempotency_keys";
  readonly role:
    | "IMMUTABLE_APPEND_ONLY_HISTORY"
    | "SINGLE_CURRENT_HEAD_PER_ACCOUNT"
    | "IMMUTABLE_RETRY_RESULT";
  readonly columns: readonly string[];
  readonly constraints: Record<string, unknown>;
  readonly immutability: Record<string, unknown>;
};

const SHA256_LOWERCASE = "^[0-9a-f]{64}$";
const IDEMPOTENCY_KEY_PATTERN = "^[A-Za-z0-9][A-Za-z0-9_.:-]{7,127}$";
const CANONICAL_UUID_LOWERCASE =
  "^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$";
const PORTFOLIO_ID_PATTERN = "^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$";

const REVISION_COLUMNS = [
  "id",
  "tenant_id",
  "owner_user_id",
  "portfolio_id",
  "account_id",
  "environment",
  "account_base_currency",
  "revision_number",
  "previous_revision_id",
  "authoring_membership_id",
  "authoring_contract_version",
  "authoring_fingerprint",
  "authored_at",
  "objective",
  "risk_profile",
  "horizon",
  "command_contract_version",
  "operation",
  "command_fingerprint",
  "semantic_request_fingerprint",
  "idempotency_key",
  "expected_head_revision_id",
  "expected_head_revision_number",
  "expected_head_authoring_fingerprint",
  "persisted_at",
  "persistence_txid",
] as const;

const HEAD_COLUMNS = [
  "tenant_id",
  "owner_user_id",
  "portfolio_id",
  "account_id",
  "environment",
  "current_revision_id",
  "current_revision_number",
  "updated_at",
] as const;

const IDEMPOTENCY_COLUMNS = [
  "tenant_id",
  "owner_user_id",
  "portfolio_id",
  "account_id",
  "environment",
  "idempotency_key",
  "semantic_request_fingerprint",
  "original_command_fingerprint",
  "result_revision_id",
  "result_revision_number",
  "created_at",
  "persistence_txid",
] as const;

const DRAFT_CONTRACT = {
  contractVersion: CANONICAL_INVESTING_PLAN_PERSISTENCE_SCHEMA_CONTRACT_VERSION,
  implementationStatus: "DESIGN_ONLY",
  migration: {
    authorized: false,
    applied: false,
    additiveOnly: true,
    forbiddenActions: [
      "apply_migration_in_a3b",
      "create_table_in_a3b",
      "create_function_in_a3b",
      "create_trigger_in_a3b",
      "create_rls_policy_in_a3b",
      "grant_or_revoke_privileges_in_a3b",
      "modify_legacy_plans",
      "backfill_legacy_plans",
      "convert_legacy_plans",
    ],
  },
  writer: {
    accepted: false,
    futureChokePoint: {
      name: "investing_persist_canonical_plan_v1",
      implementation: "NOT_IMPLEMENTED_IN_A3B",
      functionCapabilityIsAuthorization: false,
      serverMustAuthorizeBeforeCall: true,
      execution: {
        security: "DEFINER",
        searchPath: "pg_catalog, public",
        publicExecute: false,
        anonExecute: false,
        authenticatedExecute: false,
        serviceRoleExecute: true,
      },
    },
  },
  persistence: {
    availability: "UNAVAILABLE",
    databaseWriteAuthorized: false,
  },
  canonicalTables: [
    {
      name: "investing_plan_revisions",
      role: "IMMUTABLE_APPEND_ONLY_HISTORY",
      columns: REVISION_COLUMNS,
      constraints: {
        primaryIdentity: {
          column: "id",
          dbGeneratedUuid: true,
          clientGenerated: false,
          pattern: CANONICAL_UUID_LOWERCASE,
        },
        scopeForeignKey: {
          local: ["tenant_id", "owner_user_id", "portfolio_id", "account_id", "environment"],
          references: {
            table: "investing_accounts",
            columns: ["tenant_id", "owner_user_id", "portfolio_id", "id", "environment"],
          },
          provesFullAccountScope: true,
          accountIdAloneOwnershipProof: false,
        },
        authoringMembershipForeignKey: {
          local: ["authoring_membership_id", "tenant_id", "owner_user_id"],
          references: {
            table: "investing_tenant_memberships",
            columns: ["id", "tenant_id", "user_id"],
          },
          provesSameTenantUser: true,
        },
        environment: {
          allowed: ["paper", "simulation"],
          liveAllowed: false,
          default: null,
        },
        accountBaseCurrency: {
          pattern: "^[A-Z]{3}$",
          default: null,
          eurDefault: false,
          storedAsHistoricalTruth: true,
          includedInAccountForeignKey: false,
        },
        portfolioId: {
          pattern: PORTFOLIO_ID_PATTERN,
          default: null,
        },
        ownerUserId: {
          serverIdentity: true,
          nonEmpty: true,
          clientDefault: false,
        },
        revisionNumber: {
          positiveBigint: true,
          minimum: "1",
          clientGenerated: false,
          revisionOneRequiresPreviousNull: "TRANSACTION_INVARIANT",
          laterRevisionRequiresFormerHeadAsPrevious: "TRANSACTION_INVARIANT",
          laterRevisionPreviousNumberDelta: "N_MINUS_1_TRANSACTION_INVARIANT",
          checkConstraintAloneSufficientForCrossRowChain: false,
        },
        previousRevision: {
          nullableOnlyForRevisionOne: true,
          sameAccountCompositeForeignKeyRequired: true,
          exactNumberArithmeticIsTransactionInvariant: true,
        },
        explicitIntent: {
          objective: ["preservation", "growth", "income", "balanced"],
          riskProfile: ["Conservative", "Balanced", "Aggressive"],
          horizon: ["Short", "Medium", "Long"],
          forbiddenFields: [
            "timeframeMonths",
            "expectedReturn",
            "allocation",
            "targetCapital",
            "probabilities",
            "inferredConstraints",
            "financialProjection",
          ],
        },
        contractLineage: {
          authoringContractVersion: "canonical-investing-plan-authoring-intent/v1",
          commandContractVersion: "canonical-investing-plan-persistence-command/v1",
          operation: "APPEND_REVISION_AND_ADVANCE_HEAD",
          hashFields: {
            authoring_fingerprint: SHA256_LOWERCASE,
            command_fingerprint: SHA256_LOWERCASE,
            semantic_request_fingerprint: SHA256_LOWERCASE,
          },
        },
        idempotencyKey: {
          pattern: IDEMPOTENCY_KEY_PATTERN,
          trimming: false,
          default: null,
        },
        expectedHead: {
          allOrNone: [
            "expected_head_revision_id",
            "expected_head_revision_number",
            "expected_head_authoring_fingerprint",
          ],
          nullableAsSet: true,
          nonNullRevisionIdPattern: CANONICAL_UUID_LOWERCASE,
          nonNullRevisionNumberMinimum: "1",
          nonNullAuthoringFingerprintPattern: SHA256_LOWERCASE,
          recordsConcurrencyExpectationOnly: true,
          correctnessProvenByFutureTransaction: true,
        },
        uniqueness: {
          accountRevisionNumber: ["account_id", "revision_number"],
          sameRevisionIdentityForHead: ["id", "account_id", "revision_number"],
          authoringFingerprintGloballyUnique: false,
        },
      },
      immutability: {
        appendOnly: true,
        insertViaWriterOnly: true,
        updateForbidden: true,
        deleteForbidden: true,
        immutableGuardRequired: true,
      },
    },
    {
      name: "investing_plan_heads",
      role: "SINGLE_CURRENT_HEAD_PER_ACCOUNT",
      columns: HEAD_COLUMNS,
      constraints: {
        oneRowPerAccount: true,
        accountIdPrimaryKeyOrEquivalent: true,
        hasIsActiveField: false,
        allowsMultipleActiveRevisions: false,
        scopeForeignKey: {
          local: ["tenant_id", "owner_user_id", "portfolio_id", "account_id", "environment"],
          references: {
            table: "investing_accounts",
            columns: ["tenant_id", "owner_user_id", "portfolio_id", "id", "environment"],
          },
        },
        currentRevisionForeignKey: {
          local: ["current_revision_id", "account_id", "current_revision_number"],
          references: {
            table: "investing_plan_revisions",
            columns: ["id", "account_id", "revision_number"],
          },
          preventsCrossAccountRevisionPointer: true,
        },
        duplicatedCurrentAuthoringFingerprint: false,
        expectedHeadProducedByJoiningCurrentRevision: true,
      },
      immutability: {
        appendOnly: false,
        insertViaWriterOnly: true,
        updateViaWriterOnly: true,
        deleteForbiddenNormalOperation: true,
        mutablePointerStateOnly: true,
      },
    },
    {
      name: "investing_plan_idempotency_keys",
      role: "IMMUTABLE_RETRY_RESULT",
      columns: IDEMPOTENCY_COLUMNS,
      constraints: {
        uniqueIdentity: [
          "tenant_id",
          "owner_user_id",
          "portfolio_id",
          "account_id",
          "environment",
          "idempotency_key",
        ],
        membershipIdInUniqueIdentity: false,
        idempotencyKeyPattern: IDEMPOTENCY_KEY_PATTERN,
        semanticRequestFingerprintPattern: SHA256_LOWERCASE,
        originalCommandFingerprintPattern: SHA256_LOWERCASE,
        resultRevisionForeignKey: {
          local: ["result_revision_id", "account_id", "result_revision_number"],
          references: {
            table: "investing_plan_revisions",
            columns: ["id", "account_id", "revision_number"],
          },
          preventsCrossAccountResultPointer: true,
        },
      },
      immutability: {
        appendOnly: true,
        insertViaWriterOnly: true,
        updateForbidden: true,
        deleteForbidden: true,
        immutableGuardRequired: true,
      },
    },
  ],
  canonicalScope: {
    authorityScope: "INVESTING_ACCOUNT",
    fields: ["tenant_id", "owner_user_id", "portfolio_id", "account_id", "environment"],
    accountIdAloneOwnershipProof: false,
    accountBaseCurrencyInAccountForeignKey: false,
  },
  supportingKeys: {
    investingAccounts: {
      purpose: "EXACT_ACCOUNT_SCOPE_COMPOSITE_FOREIGN_KEYS",
      requiredUnique: ["tenant_id", "owner_user_id", "portfolio_id", "id", "environment"],
      includesEnvironment: true,
      includesBaseCurrency: false,
      authority: "RELATIONAL_INTEGRITY_NOT_AUTHORITY",
    },
    investingTenantMemberships: {
      purpose: "AUTHORING_MEMBERSHIP_LINEAGE_SAME_TENANT_USER",
      existingKeys: ["PRIMARY_KEY_id", "UNIQUE_tenant_id_user_id"],
      requiredUnique: ["id", "tenant_id", "user_id"],
      revisionForeignKey: {
        local: ["authoring_membership_id", "tenant_id", "owner_user_id"],
        referenced: ["id", "tenant_id", "user_id"],
      },
    },
  },
  legacyIsolation: {
    legacyTable: "plans",
    legacyMigration: "FORBIDDEN_BY_INFERENCE",
    automaticBackfill: false,
    canonicalReadFallbackToLegacy: false,
    canonicalWriteToLegacy: false,
    legacyRowsGrantAuthority: false,
    canonicalTable: false,
    foreignKeysToCanonicalTables: false,
    triggersConnectingCanonicalTables: false,
    forbiddenTranslations: [
      "legacy_timeframeMonths_to_horizon",
      "legacy_risk_to_return",
      "legacy_target_to_recommendation",
      "legacy_payload_to_canonical_authoring",
    ],
  },
  lockStrategy: {
    strategy: "ACCOUNT_ROW_FOR_UPDATE",
    locksExactScope: ["tenant_id", "owner_user_id", "portfolio_id", "account_id", "environment"],
    requiresExistingHead: false,
    advisoryLocksRequired: false,
  },
  transactionOrder: CANONICAL_INVESTING_PLAN_PERSISTENCE_SCHEMA_FUTURE_TRANSACTION_ORDER,
  retrySemantics: {
    replayBeforeExpectedHeadConflict: true,
    sameScopeKeySameSemanticFingerprint: "REPLAY_STORED_RESULT",
    sameScopeKeyDifferentSemanticFingerprint: "FAIL",
    mismatchError: "investing_plan_idempotency_payload_mismatch",
    replayCreatesRevision: false,
    membershipIdInRetryUniqueness: false,
  },
  freshAuthorization: {
    required: true,
    a1FingerprintAuthorization: false,
    a3aCommandFingerprintAuthorization: false,
    idempotencyKeyAuthorization: false,
    serviceRoleAuthorization: false,
    requiredChecks: [
      "current_request_user",
      "membership_exists",
      "membership_matches_tenant_user",
      "membership_active",
      "membership_role_owner",
      "membership_permission_investing_create",
      "account_exact_scope",
      "account_active",
      "environment_paper_or_simulation",
      "current_account_base_currency_matches_command_currency",
    ],
  },
  rls: {
    enabled: true,
    forced: true,
    directAnonPolicies: false,
    directAuthenticatedPolicies: false,
    futureDirectDataApiExposureRequiresSeparateAudit: true,
  },
  privileges: {
    anon: {
      select: false,
      directInsert: false,
      directUpdate: false,
      directDelete: false,
    },
    authenticated: {
      select: false,
      directInsert: false,
      directUpdate: false,
      directDelete: false,
    },
    serviceRole: {
      select: true,
      directInsert: false,
      directUpdate: false,
      directDelete: false,
    },
  },
  defaultPolicy: {
    forbiddenFinancialDefaults: ["EUR", "paper", "Balanced", "Medium", "growth", "0", "[]", "{}"],
    allowedOperationalDefaults: ["uuid_primary_identifiers", "persisted_at", "created_at", "persistence_txid"],
  },
  rollback: {
    beforeCanonicalWritesObjectsMayBeRemovedOnlyWithExplicitAuthorization: true,
    afterCanonicalWritesDestructiveRollbackAutomatic: false,
    afterCanonicalWritesRequiresSeparateAuthorizationAndPreservationPlan: true,
  },
} satisfies Omit<CanonicalInvestingPlanPersistenceSchemaContractV1, "schemaFingerprint">;

export function hashCanonicalInvestingPlanPersistenceSchemaContractV1(
  contract:
    | CanonicalInvestingPlanPersistenceSchemaContractV1
    | Omit<CanonicalInvestingPlanPersistenceSchemaContractV1, "schemaFingerprint">,
) {
  const hashable: Record<string, unknown> = { ...(contract as Record<string, unknown>) };
  delete hashable.schemaFingerprint;
  return canonicalSha256(hashable);
}

const SEALED_CONTRACT = deepFreezeCanonical({
  ...DRAFT_CONTRACT,
  schemaFingerprint: hashCanonicalInvestingPlanPersistenceSchemaContractV1(DRAFT_CONTRACT),
}) as CanonicalInvestingPlanPersistenceSchemaContractV1;

export function getCanonicalInvestingPlanPersistenceSchemaContractV1() {
  return SEALED_CONTRACT;
}
