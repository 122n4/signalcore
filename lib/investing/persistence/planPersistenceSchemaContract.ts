import { canonicalSha256, deepFreezeCanonical } from "@/lib/investing/engine/v1/canonical";

export const CANONICAL_INVESTING_PLAN_PERSISTENCE_SCHEMA_CONTRACT_VERSION =
  "canonical-investing-plan-persistence-schema-contract/v1" as const;

export const CANONICAL_INVESTING_PLAN_PERSISTENCE_SCHEMA_FUTURE_TRANSACTION_ORDER = Object.freeze([
  "FRESH_SERVER_AUTHORIZATION",
  "REVALIDATE_ACTIVE_MEMBERSHIP_OWNER_CREATE_PERMISSION",
  "LOCK_CANONICAL_ACCOUNT_ROW_FOR_UPDATE",
  "LOOKUP_IDEMPOTENCY_KEY",
  "REPLAY_IF_SEMANTIC_FINGERPRINT_MATCHES",
  "FAIL_IF_IDEMPOTENCY_PAYLOAD_MISMATCH",
  "REVALIDATE_ACCOUNT_STATUS_ENVIRONMENT_AND_CURRENCY_ONLY_FOR_NEW_IDEMPOTENCY",
  "VALIDATE_EXPECTED_HEAD_ONLY_FOR_NEW_IDEMPOTENCY",
  "DERIVE_NEXT_REVISION_NUMBER_AND_PREVIOUS_REVISION",
  "INSERT_IMMUTABLE_REVISION",
  "INSERT_OR_ADVANCE_SINGLE_HEAD_AND_UPDATE_TIMESTAMP",
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
    readonly replayBeforeMutableWriteEligibility: true;
    readonly sameScopeKeySameSemanticFingerprint: "REPLAY_STORED_RESULT";
    readonly sameScopeKeyDifferentSemanticFingerprint: "FAIL";
    readonly mismatchError: "investing_plan_idempotency_payload_mismatch";
    readonly replayCreatesRevision: false;
    readonly replayAdvancesHead: false;
    readonly replayUpdatesHeadTimestamp: false;
    readonly replayGeneratesPersistenceTimestamp: false;
    readonly replayGeneratesPersistenceTxid: false;
    readonly membershipIdInRetryUniqueness: false;
  };
  readonly newPersistenceWriteEligibility: {
    readonly appliesOnlyWhenIdempotencyKeyIsNew: true;
    readonly replayBypassesMutableWriteEligibility: true;
    readonly checks: readonly string[];
  };
  readonly headMutationSemantics: {
    readonly insertOrAdvanceOperation: "INSERT_OR_ADVANCE_SINGLE_HEAD_AND_UPDATE_TIMESTAMP";
    readonly newRevisionSetsUpdatedAt: "CURRENT_DB_PERSISTENCE_TRANSACTION_TIMESTAMP";
    readonly replayPreservesOriginalHeadTimestamp: true;
    readonly replayPreservesCurrentRevision: true;
    readonly replayPreservesCurrentRevisionNumber: true;
  };
  readonly transactionLineage: {
    readonly newPersistenceSameTransactionTimestampColumns: readonly [
      "investing_plan_revisions.persisted_at",
      "investing_plan_heads.updated_at",
      "investing_plan_idempotency_keys.created_at",
    ];
    readonly newPersistenceSameTransactionIdColumns: readonly [
      "investing_plan_revisions.persistence_txid",
      "investing_plan_idempotency_keys.persistence_txid",
    ];
    readonly replayReturnsStoredLineage: true;
    readonly replayGeneratesNewTimestampOrTxid: false;
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

type CanonicalInvestingPlanPersistenceColumnTypeV1 = "uuid" | "text" | "bigint" | "timestamptz";

type CanonicalInvestingPlanPersistenceColumnDefaultV1 =
  | "NONE"
  | "DB_GENERATED_UUID"
  | "DB_PERSISTENCE_TIMESTAMP"
  | "DB_TRANSACTION_ID";

type CanonicalInvestingPlanPersistenceColumnDefaultAuthorityV1 =
  | "NO_DEFAULT"
  | "OPERATIONAL_METADATA_ONLY";

type CanonicalInvestingPlanPersistenceColumnDefinitionV1 = {
  readonly name: string;
  readonly type: CanonicalInvestingPlanPersistenceColumnTypeV1;
  readonly nullable: boolean;
  readonly default: CanonicalInvestingPlanPersistenceColumnDefaultV1;
  readonly defaultAuthority: CanonicalInvestingPlanPersistenceColumnDefaultAuthorityV1;
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
  readonly columnDefinitions: readonly CanonicalInvestingPlanPersistenceColumnDefinitionV1[];
  readonly constraints: Record<string, unknown>;
  readonly immutability: Record<string, unknown>;
};

const SHA256_LOWERCASE = "^[0-9a-f]{64}$";
const IDEMPOTENCY_KEY_PATTERN = "^[A-Za-z0-9][A-Za-z0-9_.:-]{7,127}$";
const CANONICAL_UUID_LOWERCASE =
  "^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$";
const PORTFOLIO_ID_PATTERN = "^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$";

const RESTRICT_CANONICAL_PLAN_REFERENTIAL_ACTIONS = {
  onDelete: "RESTRICT",
  onUpdate: "NO_ACTION",
  deferrable: false,
  destructiveParentDeletePreventedByPlanHistory: true,
} as const;

const NO_DEFAULT = {
  default: "NONE",
  defaultAuthority: "NO_DEFAULT",
} as const;

const OPERATIONAL_METADATA_DEFAULT = {
  defaultAuthority: "OPERATIONAL_METADATA_ONLY",
} as const;

const REVISION_COLUMN_DEFINITIONS = [
  { name: "id", type: "uuid", nullable: false, default: "DB_GENERATED_UUID", defaultAuthority: "OPERATIONAL_METADATA_ONLY" },
  { name: "tenant_id", type: "uuid", nullable: false, ...NO_DEFAULT },
  { name: "owner_user_id", type: "text", nullable: false, ...NO_DEFAULT },
  { name: "portfolio_id", type: "text", nullable: false, ...NO_DEFAULT },
  { name: "account_id", type: "uuid", nullable: false, ...NO_DEFAULT },
  { name: "environment", type: "text", nullable: false, ...NO_DEFAULT },
  { name: "account_base_currency", type: "text", nullable: false, ...NO_DEFAULT },
  { name: "revision_number", type: "bigint", nullable: false, ...NO_DEFAULT },
  { name: "previous_revision_id", type: "uuid", nullable: true, ...NO_DEFAULT },
  { name: "authoring_membership_id", type: "uuid", nullable: false, ...NO_DEFAULT },
  { name: "authoring_contract_version", type: "text", nullable: false, ...NO_DEFAULT },
  { name: "authoring_fingerprint", type: "text", nullable: false, ...NO_DEFAULT },
  { name: "authored_at", type: "timestamptz", nullable: false, ...NO_DEFAULT },
  { name: "objective", type: "text", nullable: false, ...NO_DEFAULT },
  { name: "risk_profile", type: "text", nullable: false, ...NO_DEFAULT },
  { name: "horizon", type: "text", nullable: false, ...NO_DEFAULT },
  { name: "command_contract_version", type: "text", nullable: false, ...NO_DEFAULT },
  { name: "operation", type: "text", nullable: false, ...NO_DEFAULT },
  { name: "command_fingerprint", type: "text", nullable: false, ...NO_DEFAULT },
  { name: "semantic_request_fingerprint", type: "text", nullable: false, ...NO_DEFAULT },
  { name: "idempotency_key", type: "text", nullable: false, ...NO_DEFAULT },
  { name: "expected_head_revision_id", type: "uuid", nullable: true, ...NO_DEFAULT },
  { name: "expected_head_revision_number", type: "bigint", nullable: true, ...NO_DEFAULT },
  { name: "expected_head_authoring_fingerprint", type: "text", nullable: true, ...NO_DEFAULT },
  {
    name: "persisted_at",
    type: "timestamptz",
    nullable: false,
    default: "DB_PERSISTENCE_TIMESTAMP",
    ...OPERATIONAL_METADATA_DEFAULT,
  },
  {
    name: "persistence_txid",
    type: "bigint",
    nullable: false,
    default: "DB_TRANSACTION_ID",
    ...OPERATIONAL_METADATA_DEFAULT,
  },
] as const;

const HEAD_COLUMN_DEFINITIONS = [
  { name: "tenant_id", type: "uuid", nullable: false, ...NO_DEFAULT },
  { name: "owner_user_id", type: "text", nullable: false, ...NO_DEFAULT },
  { name: "portfolio_id", type: "text", nullable: false, ...NO_DEFAULT },
  { name: "account_id", type: "uuid", nullable: false, ...NO_DEFAULT },
  { name: "environment", type: "text", nullable: false, ...NO_DEFAULT },
  { name: "current_revision_id", type: "uuid", nullable: false, ...NO_DEFAULT },
  { name: "current_revision_number", type: "bigint", nullable: false, ...NO_DEFAULT },
  {
    name: "updated_at",
    type: "timestamptz",
    nullable: false,
    default: "DB_PERSISTENCE_TIMESTAMP",
    ...OPERATIONAL_METADATA_DEFAULT,
  },
] as const;

const IDEMPOTENCY_COLUMN_DEFINITIONS = [
  { name: "tenant_id", type: "uuid", nullable: false, ...NO_DEFAULT },
  { name: "owner_user_id", type: "text", nullable: false, ...NO_DEFAULT },
  { name: "portfolio_id", type: "text", nullable: false, ...NO_DEFAULT },
  { name: "account_id", type: "uuid", nullable: false, ...NO_DEFAULT },
  { name: "environment", type: "text", nullable: false, ...NO_DEFAULT },
  { name: "idempotency_key", type: "text", nullable: false, ...NO_DEFAULT },
  { name: "semantic_request_fingerprint", type: "text", nullable: false, ...NO_DEFAULT },
  { name: "original_command_fingerprint", type: "text", nullable: false, ...NO_DEFAULT },
  { name: "result_revision_id", type: "uuid", nullable: false, ...NO_DEFAULT },
  { name: "result_revision_number", type: "bigint", nullable: false, ...NO_DEFAULT },
  {
    name: "created_at",
    type: "timestamptz",
    nullable: false,
    default: "DB_PERSISTENCE_TIMESTAMP",
    ...OPERATIONAL_METADATA_DEFAULT,
  },
  {
    name: "persistence_txid",
    type: "bigint",
    nullable: false,
    default: "DB_TRANSACTION_ID",
    ...OPERATIONAL_METADATA_DEFAULT,
  },
] as const;

function columnNames(definitions: readonly CanonicalInvestingPlanPersistenceColumnDefinitionV1[]) {
  return definitions.map((definition) => definition.name);
}

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
      columns: columnNames(REVISION_COLUMN_DEFINITIONS),
      columnDefinitions: REVISION_COLUMN_DEFINITIONS,
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
          ...RESTRICT_CANONICAL_PLAN_REFERENTIAL_ACTIONS,
          provesFullAccountScope: true,
          accountIdAloneOwnershipProof: false,
        },
        authoringMembershipForeignKey: {
          local: ["authoring_membership_id", "tenant_id", "owner_user_id"],
          references: {
            table: "investing_tenant_memberships",
            columns: ["id", "tenant_id", "user_id"],
          },
          ...RESTRICT_CANONICAL_PLAN_REFERENTIAL_ACTIONS,
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
          dbDefault: false,
          writerDerived: true,
          revisionOneRequiresPreviousNull: "TRANSACTION_INVARIANT",
          laterRevisionRequiresFormerHeadAsPrevious: "TRANSACTION_INVARIANT",
          laterRevisionPreviousNumberDelta: "N_MINUS_1_TRANSACTION_INVARIANT",
          checkConstraintAloneSufficientForCrossRowChain: false,
        },
        previousRevision: {
          nullableOnlyForRevisionOne: true,
          sameAccountCompositeForeignKeyRequired: true,
          previousRevisionForeignKey: {
            local: ["previous_revision_id", "account_id"],
            references: {
              table: "investing_plan_revisions",
              columns: ["id", "account_id"],
            },
            ...RESTRICT_CANONICAL_PLAN_REFERENTIAL_ACTIONS,
            preventsCrossAccountPreviousPointer: true,
          },
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
          samePreviousRevisionAccountIdentity: ["id", "account_id"],
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
      columns: columnNames(HEAD_COLUMN_DEFINITIONS),
      columnDefinitions: HEAD_COLUMN_DEFINITIONS,
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
          ...RESTRICT_CANONICAL_PLAN_REFERENTIAL_ACTIONS,
        },
        currentRevisionForeignKey: {
          local: ["current_revision_id", "account_id", "current_revision_number"],
          references: {
            table: "investing_plan_revisions",
            columns: ["id", "account_id", "revision_number"],
          },
          ...RESTRICT_CANONICAL_PLAN_REFERENTIAL_ACTIONS,
          preventsCrossAccountRevisionPointer: true,
        },
        duplicatedCurrentAuthoringFingerprint: false,
        expectedHeadProducedByJoiningCurrentRevision: true,
        updatedAt: {
          insertDefault: "DB_PERSISTENCE_TIMESTAMP",
          advanceSets: "CURRENT_DB_PERSISTENCE_TRANSACTION_TIMESTAMP",
          replayMutates: false,
          replayPreservesOriginalValue: true,
        },
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
      columns: columnNames(IDEMPOTENCY_COLUMN_DEFINITIONS),
      columnDefinitions: IDEMPOTENCY_COLUMN_DEFINITIONS,
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
        scopeForeignKey: {
          local: ["tenant_id", "owner_user_id", "portfolio_id", "account_id", "environment"],
          references: {
            table: "investing_accounts",
            columns: ["tenant_id", "owner_user_id", "portfolio_id", "id", "environment"],
          },
          ...RESTRICT_CANONICAL_PLAN_REFERENTIAL_ACTIONS,
          provesFullAccountScope: true,
          accountIdAloneOwnershipProof: false,
        },
        resultRevisionForeignKey: {
          local: ["result_revision_id", "account_id", "result_revision_number"],
          references: {
            table: "investing_plan_revisions",
            columns: ["id", "account_id", "revision_number"],
          },
          ...RESTRICT_CANONICAL_PLAN_REFERENTIAL_ACTIONS,
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
    replayBeforeMutableWriteEligibility: true,
    sameScopeKeySameSemanticFingerprint: "REPLAY_STORED_RESULT",
    sameScopeKeyDifferentSemanticFingerprint: "FAIL",
    mismatchError: "investing_plan_idempotency_payload_mismatch",
    replayCreatesRevision: false,
    replayAdvancesHead: false,
    replayUpdatesHeadTimestamp: false,
    replayGeneratesPersistenceTimestamp: false,
    replayGeneratesPersistenceTxid: false,
    membershipIdInRetryUniqueness: false,
  },
  newPersistenceWriteEligibility: {
    appliesOnlyWhenIdempotencyKeyIsNew: true,
    replayBypassesMutableWriteEligibility: true,
    checks: [
      "account_active",
      "environment_paper_or_simulation",
      "current_account_base_currency_matches_command_currency",
    ],
  },
  headMutationSemantics: {
    insertOrAdvanceOperation: "INSERT_OR_ADVANCE_SINGLE_HEAD_AND_UPDATE_TIMESTAMP",
    newRevisionSetsUpdatedAt: "CURRENT_DB_PERSISTENCE_TRANSACTION_TIMESTAMP",
    replayPreservesOriginalHeadTimestamp: true,
    replayPreservesCurrentRevision: true,
    replayPreservesCurrentRevisionNumber: true,
  },
  transactionLineage: {
    newPersistenceSameTransactionTimestampColumns: [
      "investing_plan_revisions.persisted_at",
      "investing_plan_heads.updated_at",
      "investing_plan_idempotency_keys.created_at",
    ],
    newPersistenceSameTransactionIdColumns: [
      "investing_plan_revisions.persistence_txid",
      "investing_plan_idempotency_keys.persistence_txid",
    ],
    replayReturnsStoredLineage: true,
    replayGeneratesNewTimestampOrTxid: false,
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
    allowedOperationalDefaults: [
      "uuid_primary_identifiers",
      "persisted_at",
      "created_at",
      "updated_at",
      "persistence_txid",
    ],
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
