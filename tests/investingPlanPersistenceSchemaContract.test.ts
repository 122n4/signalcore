import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  CANONICAL_INVESTING_PLAN_PERSISTENCE_SCHEMA_CONTRACT_VERSION,
  CANONICAL_INVESTING_PLAN_PERSISTENCE_SCHEMA_FUTURE_TRANSACTION_ORDER,
  getCanonicalInvestingPlanPersistenceSchemaContractV1,
  hashCanonicalInvestingPlanPersistenceSchemaContractV1,
} from "@/lib/investing/persistence/planPersistenceSchemaContract";
import { CANONICAL_INVESTING_PLAN_PERSISTENCE_COMMAND_CONTRACT_VERSION } from "@/lib/investing/authority/planPersistenceCommand";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function table(name: string) {
  const found = getCanonicalInvestingPlanPersistenceSchemaContractV1().canonicalTables.find(
    (entry) => entry.name === name,
  );
  expect(found, name).toBeDefined();
  return found!;
}

const SCOPE_COLUMNS = ["tenant_id", "owner_user_id", "portfolio_id", "account_id", "environment"];

const EXACT_ACCOUNT_SCOPE_FOREIGN_KEY = {
  local: SCOPE_COLUMNS,
  references: {
    table: "investing_accounts",
    columns: ["tenant_id", "owner_user_id", "portfolio_id", "id", "environment"],
  },
  provesFullAccountScope: true,
  accountIdAloneOwnershipProof: false,
};

function column(tableName: string, columnName: string) {
  const found = table(tableName).columnDefinitions.find((entry) => entry.name === columnName);
  expect(found, `${tableName}.${columnName}`).toBeDefined();
  return found!;
}

function expectColumnsHaveClosedDefinitions(tableName: string) {
  const canonicalTable = table(tableName);
  expect(canonicalTable.columnDefinitions.map((entry) => entry.name)).toEqual(canonicalTable.columns);
  expect(new Set(canonicalTable.columnDefinitions.map((entry) => entry.name)).size)
    .toBe(canonicalTable.columnDefinitions.length);
  for (const definition of canonicalTable.columnDefinitions) {
    expect(["uuid", "text", "bigint", "timestamptz"], definition.name).toContain(definition.type);
    expect(typeof definition.nullable, definition.name).toBe("boolean");
    expect(["NONE", "DB_GENERATED_UUID", "DB_PERSISTENCE_TIMESTAMP", "DB_TRANSACTION_ID"], definition.name)
      .toContain(definition.default);
    expect(["NO_DEFAULT", "OPERATIONAL_METADATA_ONLY"], definition.name)
      .toContain(definition.defaultAuthority);
    expect(definition.default === "NONE", definition.name)
      .toBe(definition.defaultAuthority === "NO_DEFAULT");
  }
}

function hasClosedIdempotencyScope(candidate: any) {
  return JSON.stringify(candidate.constraints.scopeForeignKey ?? null)
    === JSON.stringify(EXACT_ACCOUNT_SCOPE_FOREIGN_KEY);
}

function assertFrozenClosed(value: unknown, path = "$", seen = new WeakSet<object>()) {
  if (!value || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  expect(Object.isFrozen(value), path).toBe(true);
  for (const key of Reflect.ownKeys(value)) {
    expect(typeof key, path).toBe("string");
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    expect(descriptor, `${path}.${String(key)}`).toBeDefined();
    expect("value" in descriptor!, `${path}.${String(key)}`).toBe(true);
    if (Array.isArray(value) && key === "length") {
      expect(descriptor!.enumerable, `${path}.length`).toBe(false);
      continue;
    }
    expect(descriptor!.enumerable, `${path}.${String(key)}`).toBe(true);
    assertFrozenClosed(descriptor!.value, `${path}.${String(key)}`, seen);
  }
}

describe("canonical investing plan persistence schema contract", () => {
  it("is a closed design-only contract with persistence unavailable", () => {
    const contract = getCanonicalInvestingPlanPersistenceSchemaContractV1();

    expect(contract.contractVersion).toBe(CANONICAL_INVESTING_PLAN_PERSISTENCE_SCHEMA_CONTRACT_VERSION);
    expect(contract.implementationStatus).toBe("DESIGN_ONLY");
    expect(contract.migration.authorized).toBe(false);
    expect(contract.migration.applied).toBe(false);
    expect(contract.writer.accepted).toBe(false);
    expect(contract.persistence).toEqual({
      availability: "UNAVAILABLE",
      databaseWriteAuthorized: false,
    });
    expect(contract.schemaFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(hashCanonicalInvestingPlanPersistenceSchemaContractV1(contract)).toBe(contract.schemaFingerprint);
    assertFrozenClosed(contract);
    expect(() => ((contract.persistence as any).databaseWriteAuthorized = true)).toThrow();
  });

  it("declares exactly the three future canonical tables and keeps legacy plans outside authority", () => {
    const contract = getCanonicalInvestingPlanPersistenceSchemaContractV1();
    expect(contract.canonicalTables.map((entry) => entry.name)).toEqual([
      "investing_plan_revisions",
      "investing_plan_heads",
      "investing_plan_idempotency_keys",
    ]);
    expect(contract.canonicalTables).toHaveLength(3);
    expect(contract.canonicalTables.map((entry) => entry.role)).toEqual([
      "IMMUTABLE_APPEND_ONLY_HISTORY",
      "SINGLE_CURRENT_HEAD_PER_ACCOUNT",
      "IMMUTABLE_RETRY_RESULT",
    ]);
    expect(contract.canonicalTables.map((entry) => entry.name)).not.toContain("plans");
    expect(contract.legacyIsolation).toMatchObject({
      legacyTable: "plans",
      legacyMigration: "FORBIDDEN_BY_INFERENCE",
      automaticBackfill: false,
      canonicalReadFallbackToLegacy: false,
      canonicalWriteToLegacy: false,
      legacyRowsGrantAuthority: false,
      canonicalTable: false,
      foreignKeysToCanonicalTables: false,
      triggersConnectingCanonicalTables: false,
    });
    expect(contract.legacyIsolation.forbiddenTranslations).toEqual([
      "legacy_timeframeMonths_to_horizon",
      "legacy_risk_to_return",
      "legacy_target_to_recommendation",
      "legacy_payload_to_canonical_authoring",
    ]);
  });

  it("requires canonical account scope and supporting relational ownership keys", () => {
    const contract = getCanonicalInvestingPlanPersistenceSchemaContractV1();
    expect(contract.canonicalScope.fields).toEqual([
      "tenant_id",
      "owner_user_id",
      "portfolio_id",
      "account_id",
      "environment",
    ]);
    expect(contract.canonicalScope.accountIdAloneOwnershipProof).toBe(false);
    expect(contract.canonicalScope.accountBaseCurrencyInAccountForeignKey).toBe(false);
    expect(contract.supportingKeys.investingAccounts.requiredUnique).toEqual([
      "tenant_id",
      "owner_user_id",
      "portfolio_id",
      "id",
      "environment",
    ]);
    expect(contract.supportingKeys.investingAccounts.includesEnvironment).toBe(true);
    expect(contract.supportingKeys.investingAccounts.includesBaseCurrency).toBe(false);
    expect(contract.supportingKeys.investingAccounts.authority).toBe("RELATIONAL_INTEGRITY_NOT_AUTHORITY");
    expect(contract.supportingKeys.investingTenantMemberships.requiredUnique).toEqual([
      "id",
      "tenant_id",
      "user_id",
    ]);
    expect(contract.supportingKeys.investingTenantMemberships.revisionForeignKey).toEqual({
      local: ["authoring_membership_id", "tenant_id", "owner_user_id"],
      referenced: ["id", "tenant_id", "user_id"],
    });
    expect(table("investing_plan_revisions").constraints.authoringMembershipForeignKey).toMatchObject({
      provesSameTenantUser: true,
    });
  });

  it("specifies revision history columns, intent enums, lineage hashes and immutable semantics", () => {
    const revisions = table("investing_plan_revisions");
    expect(revisions.columns).toEqual([
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
    ]);
    expect(revisions.constraints.environment).toMatchObject({
      allowed: ["paper", "simulation"],
      liveAllowed: false,
      default: null,
    });
    expect(revisions.constraints.accountBaseCurrency).toMatchObject({
      pattern: "^[A-Z]{3}$",
      default: null,
      eurDefault: false,
      storedAsHistoricalTruth: true,
      includedInAccountForeignKey: false,
    });
    expect(revisions.constraints.portfolioId).toMatchObject({
      pattern: "^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$",
      default: null,
    });
    expect(revisions.constraints.ownerUserId).toMatchObject({
      serverIdentity: true,
      nonEmpty: true,
      clientDefault: false,
    });
    expect(revisions.constraints.explicitIntent).toEqual({
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
    });
    expect(revisions.constraints.contractLineage).toMatchObject({
      authoringContractVersion: "canonical-investing-plan-authoring-intent/v1",
      commandContractVersion: CANONICAL_INVESTING_PLAN_PERSISTENCE_COMMAND_CONTRACT_VERSION,
      operation: "APPEND_REVISION_AND_ADVANCE_HEAD",
      hashFields: {
        authoring_fingerprint: "^[0-9a-f]{64}$",
        command_fingerprint: "^[0-9a-f]{64}$",
        semantic_request_fingerprint: "^[0-9a-f]{64}$",
      },
    });
    expect(revisions.constraints.idempotencyKey).toEqual({
      pattern: "^[A-Za-z0-9][A-Za-z0-9_.:-]{7,127}$",
      trimming: false,
      default: null,
    });
    expect(JSON.stringify(revisions.constraints.explicitIntent)).not.toContain("timeframeMonths\":true");
    expect(revisions.immutability).toMatchObject({
      appendOnly: true,
      insertViaWriterOnly: true,
      updateForbidden: true,
      deleteForbidden: true,
      immutableGuardRequired: true,
    });
  });

  it("captures revision numbering, previous revision and expected-head transaction invariants", () => {
    const revisions = table("investing_plan_revisions");
    expect(revisions.constraints.revisionNumber).toMatchObject({
      positiveBigint: true,
      minimum: "1",
      clientGenerated: false,
      revisionOneRequiresPreviousNull: "TRANSACTION_INVARIANT",
      laterRevisionRequiresFormerHeadAsPrevious: "TRANSACTION_INVARIANT",
      laterRevisionPreviousNumberDelta: "N_MINUS_1_TRANSACTION_INVARIANT",
      checkConstraintAloneSufficientForCrossRowChain: false,
    });
    expect(revisions.constraints.previousRevision).toMatchObject({
      nullableOnlyForRevisionOne: true,
      sameAccountCompositeForeignKeyRequired: true,
      previousRevisionForeignKey: {
        local: ["previous_revision_id", "account_id"],
        references: {
          table: "investing_plan_revisions",
          columns: ["id", "account_id"],
        },
        preventsCrossAccountPreviousPointer: true,
      },
      exactNumberArithmeticIsTransactionInvariant: true,
    });
    expect(revisions.constraints.expectedHead).toEqual({
      allOrNone: [
        "expected_head_revision_id",
        "expected_head_revision_number",
        "expected_head_authoring_fingerprint",
      ],
      nullableAsSet: true,
      nonNullRevisionIdPattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
      nonNullRevisionNumberMinimum: "1",
      nonNullAuthoringFingerprintPattern: "^[0-9a-f]{64}$",
      recordsConcurrencyExpectationOnly: true,
      correctnessProvenByFutureTransaction: true,
    });
    expect(revisions.constraints.uniqueness).toEqual({
      accountRevisionNumber: ["account_id", "revision_number"],
      samePreviousRevisionAccountIdentity: ["id", "account_id"],
      sameRevisionIdentityForHead: ["id", "account_id", "revision_number"],
      authoringFingerprintGloballyUnique: false,
    });
  });

  it("defines a single current head without active-row aliases or duplicated mutable fingerprint truth", () => {
    const heads = table("investing_plan_heads");
    expect(heads.columns).toEqual([
      "tenant_id",
      "owner_user_id",
      "portfolio_id",
      "account_id",
      "environment",
      "current_revision_id",
      "current_revision_number",
      "updated_at",
    ]);
    expect(heads.columns).not.toContain("is_active");
    expect(heads.columns).not.toContain("active");
    expect(heads.columns).not.toContain("current_authoring_fingerprint");
    expect(heads.constraints).toMatchObject({
      oneRowPerAccount: true,
      accountIdPrimaryKeyOrEquivalent: true,
      hasIsActiveField: false,
      allowsMultipleActiveRevisions: false,
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
    });
    expect(heads.immutability).toMatchObject({
      insertViaWriterOnly: true,
      updateViaWriterOnly: true,
      deleteForbiddenNormalOperation: true,
      mutablePointerStateOnly: true,
    });
  });

  it("defines durable idempotency identity, result integrity and replay semantics", () => {
    const idempotency = table("investing_plan_idempotency_keys");
    const contract = getCanonicalInvestingPlanPersistenceSchemaContractV1();
    expect(idempotency.columns).toEqual([
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
    ]);
    expect(idempotency.constraints.uniqueIdentity).toEqual([
      "tenant_id",
      "owner_user_id",
      "portfolio_id",
      "account_id",
      "environment",
      "idempotency_key",
    ]);
    expect(idempotency.constraints.membershipIdInUniqueIdentity).toBe(false);
    expect(idempotency.constraints).toMatchObject({
      idempotencyKeyPattern: "^[A-Za-z0-9][A-Za-z0-9_.:-]{7,127}$",
      semanticRequestFingerprintPattern: "^[0-9a-f]{64}$",
      originalCommandFingerprintPattern: "^[0-9a-f]{64}$",
      scopeForeignKey: EXACT_ACCOUNT_SCOPE_FOREIGN_KEY,
      resultRevisionForeignKey: {
        local: ["result_revision_id", "account_id", "result_revision_number"],
        references: {
          table: "investing_plan_revisions",
          columns: ["id", "account_id", "revision_number"],
        },
        preventsCrossAccountResultPointer: true,
      },
    });
    expect(idempotency.immutability).toMatchObject({
      appendOnly: true,
      insertViaWriterOnly: true,
      updateForbidden: true,
      deleteForbidden: true,
    });
    expect(contract.retrySemantics).toEqual({
      replayBeforeExpectedHeadConflict: true,
      sameScopeKeySameSemanticFingerprint: "REPLAY_STORED_RESULT",
      sameScopeKeyDifferentSemanticFingerprint: "FAIL",
      mismatchError: "investing_plan_idempotency_payload_mismatch",
      replayCreatesRevision: false,
      membershipIdInRetryUniqueness: false,
    });
  });

  it("closes idempotency account scope independently of the result revision pointer", () => {
    const idempotency = table("investing_plan_idempotency_keys");

    expect(idempotency.constraints.scopeForeignKey).toEqual(EXACT_ACCOUNT_SCOPE_FOREIGN_KEY);
    expect((idempotency.constraints.scopeForeignKey as any).accountIdAloneOwnershipProof).toBe(false);
    expect((idempotency.constraints.scopeForeignKey as any).local).toEqual(SCOPE_COLUMNS);
    expect(hasClosedIdempotencyScope(idempotency)).toBe(true);

    const resultOnlyDesign = clone(idempotency) as any;
    delete resultOnlyDesign.constraints.scopeForeignKey;
    expect(resultOnlyDesign.constraints.resultRevisionForeignKey).toEqual({
      local: ["result_revision_id", "account_id", "result_revision_number"],
      references: {
        table: "investing_plan_revisions",
        columns: ["id", "account_id", "revision_number"],
      },
      preventsCrossAccountResultPointer: true,
    });
    expect(hasClosedIdempotencyScope(resultOnlyDesign)).toBe(false);
  });

  it("declares exact previous-revision relational closure without replacing transaction invariants", () => {
    const revisions = table("investing_plan_revisions");

    expect(revisions.constraints.uniqueness).toMatchObject({
      samePreviousRevisionAccountIdentity: ["id", "account_id"],
      sameRevisionIdentityForHead: ["id", "account_id", "revision_number"],
    });
    expect(revisions.constraints.previousRevision).toMatchObject({
      nullableOnlyForRevisionOne: true,
      previousRevisionForeignKey: {
        local: ["previous_revision_id", "account_id"],
        references: {
          table: "investing_plan_revisions",
          columns: ["id", "account_id"],
        },
        preventsCrossAccountPreviousPointer: true,
      },
      exactNumberArithmeticIsTransactionInvariant: true,
    });
    expect(revisions.constraints.revisionNumber).toMatchObject({
      revisionOneRequiresPreviousNull: "TRANSACTION_INVARIANT",
      laterRevisionRequiresFormerHeadAsPrevious: "TRANSACTION_INVARIANT",
      laterRevisionPreviousNumberDelta: "N_MINUS_1_TRANSACTION_INVARIANT",
      checkConstraintAloneSufficientForCrossRowChain: false,
    });
    expect(revisions.columns).not.toContain("previous_revision_number");
  });

  it("declares explicit type, nullability and default semantics for every canonical column", () => {
    expectColumnsHaveClosedDefinitions("investing_plan_revisions");
    expectColumnsHaveClosedDefinitions("investing_plan_heads");
    expectColumnsHaveClosedDefinitions("investing_plan_idempotency_keys");

    for (const tableName of [
      "investing_plan_revisions",
      "investing_plan_heads",
      "investing_plan_idempotency_keys",
    ]) {
      for (const scopeColumn of SCOPE_COLUMNS) {
        expect(column(tableName, scopeColumn).nullable, `${tableName}.${scopeColumn}`).toBe(false);
        expect(column(tableName, scopeColumn).default, `${tableName}.${scopeColumn}`).toBe("NONE");
      }
    }

    for (const intentColumn of ["objective", "risk_profile", "horizon"]) {
      expect(column("investing_plan_revisions", intentColumn)).toMatchObject({
        type: "text",
        nullable: false,
        default: "NONE",
      });
    }

    for (const [tableName, fingerprintColumns] of [
      [
        "investing_plan_revisions",
        ["authoring_fingerprint", "command_fingerprint", "semantic_request_fingerprint"],
      ],
      [
        "investing_plan_idempotency_keys",
        ["semantic_request_fingerprint", "original_command_fingerprint"],
      ],
    ] as const) {
      for (const fingerprintColumn of fingerprintColumns) {
        expect(column(tableName, fingerprintColumn)).toMatchObject({
          type: "text",
          nullable: false,
          default: "NONE",
        });
      }
    }

    for (const expectedHeadColumn of [
      "expected_head_revision_id",
      "expected_head_revision_number",
      "expected_head_authoring_fingerprint",
    ]) {
      expect(column("investing_plan_revisions", expectedHeadColumn)).toMatchObject({
        nullable: true,
        default: "NONE",
      });
    }
    expect(table("investing_plan_revisions").constraints.expectedHead).toMatchObject({
      allOrNone: [
        "expected_head_revision_id",
        "expected_head_revision_number",
        "expected_head_authoring_fingerprint",
      ],
      nullableAsSet: true,
    });
  });

  it("keeps financial and authoring truth free of database defaults", () => {
    const financialAndIntentColumns = [
      "account_base_currency",
      "environment",
      "objective",
      "risk_profile",
      "horizon",
      "revision_number",
      "authoring_fingerprint",
      "command_fingerprint",
      "semantic_request_fingerprint",
    ];

    for (const columnName of financialAndIntentColumns) {
      expect(column("investing_plan_revisions", columnName), columnName).toMatchObject({
        default: "NONE",
        defaultAuthority: "NO_DEFAULT",
      });
    }
    expect(column("investing_plan_revisions", "revision_number")).toMatchObject({
      type: "bigint",
      nullable: false,
      default: "NONE",
    });
    expect(table("investing_plan_revisions").constraints.revisionNumber).toMatchObject({
      clientGenerated: false,
      dbDefault: false,
      writerDerived: true,
    });

    const dbDefaults = getCanonicalInvestingPlanPersistenceSchemaContractV1()
      .canonicalTables.flatMap((entry) => entry.columnDefinitions.map((definition) => definition.default));
    expect(dbDefaults).not.toContain("EUR");
    expect(dbDefaults).not.toContain("paper");
    expect(dbDefaults).not.toContain("Balanced");
    expect(dbDefaults).not.toContain("Medium");
    expect(dbDefaults).not.toContain("growth");
  });

  it("limits database defaults to approved operational metadata columns only", () => {
    const defaultsByColumn = getCanonicalInvestingPlanPersistenceSchemaContractV1()
      .canonicalTables.flatMap((entry) =>
        entry.columnDefinitions
          .filter((definition) => definition.default !== "NONE")
          .map((definition) => `${entry.name}.${definition.name}:${definition.default}`),
      );

    expect(defaultsByColumn).toEqual([
      "investing_plan_revisions.id:DB_GENERATED_UUID",
      "investing_plan_revisions.persisted_at:DB_PERSISTENCE_TIMESTAMP",
      "investing_plan_revisions.persistence_txid:DB_TRANSACTION_ID",
      "investing_plan_heads.updated_at:DB_PERSISTENCE_TIMESTAMP",
      "investing_plan_idempotency_keys.created_at:DB_PERSISTENCE_TIMESTAMP",
      "investing_plan_idempotency_keys.persistence_txid:DB_TRANSACTION_ID",
    ]);
  });

  it("requires account-row locking and idempotency replay before expected-head CAS", () => {
    const contract = getCanonicalInvestingPlanPersistenceSchemaContractV1();
    expect(contract.lockStrategy).toEqual({
      strategy: "ACCOUNT_ROW_FOR_UPDATE",
      locksExactScope: ["tenant_id", "owner_user_id", "portfolio_id", "account_id", "environment"],
      requiresExistingHead: false,
      advisoryLocksRequired: false,
    });
    expect(contract.transactionOrder).toEqual(CANONICAL_INVESTING_PLAN_PERSISTENCE_SCHEMA_FUTURE_TRANSACTION_ORDER);
    expect(contract.transactionOrder).toEqual([
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
    ]);
    const order = contract.transactionOrder;
    expect(order.indexOf("FRESH_SERVER_AUTHORIZATION")).toBe(0);
    expect(order.indexOf("REVALIDATE_ACTIVE_MEMBERSHIP_OWNER_CREATE_PERMISSION"))
      .toBeLessThan(order.indexOf("LOCK_CANONICAL_ACCOUNT_ROW_FOR_UPDATE"));
    expect(order.indexOf("LOCK_CANONICAL_ACCOUNT_ROW_FOR_UPDATE"))
      .toBeLessThan(order.indexOf("LOOKUP_IDEMPOTENCY_KEY"));
    expect(order.indexOf("LOOKUP_IDEMPOTENCY_KEY"))
      .toBeLessThan(order.indexOf("VALIDATE_EXPECTED_HEAD_ONLY_FOR_NEW_IDEMPOTENCY"));
    expect(order.indexOf("REPLAY_IF_SEMANTIC_FINGERPRINT_MATCHES"))
      .toBeLessThan(order.indexOf("VALIDATE_EXPECTED_HEAD_ONLY_FOR_NEW_IDEMPOTENCY"));
    expect(order.indexOf("FAIL_IF_IDEMPOTENCY_PAYLOAD_MISMATCH"))
      .toBeLessThan(order.indexOf("VALIDATE_EXPECTED_HEAD_ONLY_FOR_NEW_IDEMPOTENCY"));
    expect(order.indexOf("VALIDATE_EXPECTED_HEAD_ONLY_FOR_NEW_IDEMPOTENCY"))
      .toBeLessThan(order.indexOf("INSERT_IMMUTABLE_REVISION"));
    expect(order.indexOf("INSERT_IMMUTABLE_REVISION"))
      .toBeLessThan(order.indexOf("INSERT_OR_ADVANCE_SINGLE_HEAD"));
    expect(order.indexOf("INSERT_OR_ADVANCE_SINGLE_HEAD")).toBeLessThan(order.indexOf("COMMIT"));
  });

  it("keeps fresh authorization and current account currency verification separate from fingerprint capability", () => {
    const contract = getCanonicalInvestingPlanPersistenceSchemaContractV1();
    expect(contract.freshAuthorization).toMatchObject({
      required: true,
      a1FingerprintAuthorization: false,
      a3aCommandFingerprintAuthorization: false,
      idempotencyKeyAuthorization: false,
      serviceRoleAuthorization: false,
    });
    expect(contract.freshAuthorization.requiredChecks).toEqual([
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
    ]);
    expect(table("investing_plan_revisions").constraints.accountBaseCurrency).toMatchObject({
      storedAsHistoricalTruth: true,
      includedInAccountForeignKey: false,
    });
  });

  it("documents the future service-role choke point, RLS and closed direct privilege model", () => {
    const contract = getCanonicalInvestingPlanPersistenceSchemaContractV1();
    expect(contract.writer.futureChokePoint).toMatchObject({
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
    });
    expect(contract.privileges.anon).toEqual({
      select: false,
      directInsert: false,
      directUpdate: false,
      directDelete: false,
    });
    expect(contract.privileges.authenticated).toEqual({
      select: false,
      directInsert: false,
      directUpdate: false,
      directDelete: false,
    });
    expect(contract.privileges.serviceRole).toEqual({
      select: true,
      directInsert: false,
      directUpdate: false,
      directDelete: false,
    });
    expect(contract.rls).toEqual({
      enabled: true,
      forced: true,
      directAnonPolicies: false,
      directAuthenticatedPolicies: false,
      futureDirectDataApiExposureRequiresSeparateAudit: true,
    });
  });

  it("forbids financial defaults and preserves non-destructive rollback semantics", () => {
    const contract = getCanonicalInvestingPlanPersistenceSchemaContractV1();
    expect(contract.defaultPolicy.forbiddenFinancialDefaults).toEqual([
      "EUR",
      "paper",
      "Balanced",
      "Medium",
      "growth",
      "0",
      "[]",
      "{}",
    ]);
    expect(contract.defaultPolicy.allowedOperationalDefaults).toEqual([
      "uuid_primary_identifiers",
      "persisted_at",
      "created_at",
      "persistence_txid",
    ]);
    expect(contract.migration).toMatchObject({
      authorized: false,
      applied: false,
      additiveOnly: true,
    });
    expect(contract.rollback).toEqual({
      beforeCanonicalWritesObjectsMayBeRemovedOnlyWithExplicitAuthorization: true,
      afterCanonicalWritesDestructiveRollbackAutomatic: false,
      afterCanonicalWritesRequiresSeparateAuthorizationAndPreservationPlan: true,
    });
  });

  it("makes schemaFingerprint deterministic and sensitive to material contract semantics", () => {
    const contract = getCanonicalInvestingPlanPersistenceSchemaContractV1();
    expect(getCanonicalInvestingPlanPersistenceSchemaContractV1().schemaFingerprint).toBe(contract.schemaFingerprint);
    expect(hashCanonicalInvestingPlanPersistenceSchemaContractV1(contract)).toBe(contract.schemaFingerprint);

    const cases: Array<[string, (draft: any) => void]> = [
      ["table identity", (draft) => { draft.canonicalTables[0].name = "investing_plan_revisions_v2"; }],
      ["transaction order", (draft) => { draft.transactionOrder = [...draft.transactionOrder].reverse(); }],
      ["rls", (draft) => { draft.rls.forced = false; }],
      ["grants", (draft) => { draft.privileges.authenticated.select = true; }],
      ["lock strategy", (draft) => { draft.lockStrategy.strategy = "HEAD_ROW_FOR_UPDATE"; }],
      ["legacy fallback", (draft) => { draft.legacyIsolation.canonicalReadFallbackToLegacy = true; }],
      [
        "tenant_id type",
        (draft) => {
          draft.canonicalTables[0].columnDefinitions.find((entry: any) => entry.name === "tenant_id").type = "text";
        },
      ],
      [
        "revision_number type",
        (draft) => {
          draft.canonicalTables[0].columnDefinitions.find((entry: any) => entry.name === "revision_number").type = "text";
        },
      ],
      [
        "environment nullability",
        (draft) => {
          draft.canonicalTables[0].columnDefinitions.find((entry: any) => entry.name === "environment").nullable = true;
        },
      ],
      [
        "account_base_currency financial default",
        (draft) => {
          draft.canonicalTables[0].columnDefinitions.find(
            (entry: any) => entry.name === "account_base_currency",
          ).default = "EUR";
        },
      ],
      [
        "expected_head nullability",
        (draft) => {
          draft.canonicalTables[0].columnDefinitions.find(
            (entry: any) => entry.name === "expected_head_revision_id",
          ).nullable = false;
        },
      ],
      [
        "persisted_at default semantics",
        (draft) => {
          draft.canonicalTables[0].columnDefinitions.find((entry: any) => entry.name === "persisted_at").default = "NONE";
        },
      ],
    ];

    for (const [label, mutate] of cases) {
      const draft = clone(contract) as any;
      mutate(draft);
      expect(hashCanonicalInvestingPlanPersistenceSchemaContractV1(draft), label)
        .not.toBe(contract.schemaFingerprint);
    }
  });

  it("keeps A3B source pure: no executable SQL, runtime inputs, persistence clients or downstream authority imports", () => {
    const moduleSource = source("lib/investing/persistence/planPersistenceSchemaContract.ts");
    for (const forbidden of [
      "Date.now",
      "new Date",
      "process.env",
      "fetch(",
      "Supabase",
      "getSupabaseAdmin",
      "getInvestingSupabaseAdmin",
      ".from(",
      ".rpc(",
      "NextResponse",
      "planToMandateTranslation",
      "mandateIntent",
      "policyMethodology",
      "suitabilityReadiness",
      "suitabilityEvidenceAuthority",
      "recommendationSuitabilityAuthority",
      "mandateAuthority",
      "mandateAuthorityComposition",
      "engineMandateAdapterReadiness",
      "Phase3C",
      "Phase3D",
      "Phase3E",
      "Phase3F",
      "runtimeAdapter",
      "engineV1CustomerBridge",
      "persistentPaper",
      "broker",
      "Trading",
      "Research Lab",
    ]) {
      expect(moduleSource, forbidden).not.toContain(forbidden);
    }
    for (const sqlStatement of [
      /\bCREATE\s+TABLE\b/i,
      /\bALTER\s+TABLE\b/i,
      /\bCREATE\s+FUNCTION\b/i,
      /\bCREATE\s+TRIGGER\b/i,
      /\bCREATE\s+INDEX\b/i,
      /\bGRANT\s+/i,
      /\bREVOKE\s+/i,
      /\bSELECT\s+.+\s+FROM\b/i,
      /\bVALUES\s*\(/i,
    ]) {
      expect(moduleSource, String(sqlStatement)).not.toMatch(sqlStatement);
    }
  });

  it("keeps A3A command and existing route/dashboard/daily-cycle/Phase3C surfaces closed", () => {
    const a3a = source("lib/investing/authority/planPersistenceCommand.ts");
    const investingPlanRoute = source("app/api/investing/plan/route.ts");
    const plansRoute = source("app/api/plans/route.ts");
    const dailyCycle = source("lib/investing/server/dailyCycle.ts");
    const dashboard = source("lib/investing/server/dashboard.ts");
    const phase3cIsolation = source("tests/investingEnginePhase3CIsolation.test.ts");

    expect(a3a).toContain('availability: "UNAVAILABLE"');
    expect(a3a).toContain("databaseWriteAuthorized: false");
    expect(investingPlanRoute).toContain("export async function GET");
    expect(investingPlanRoute).not.toContain("export async function POST");
    expect(plansRoute).toContain("investing_plan_authoring_not_accepted");
    expect(dailyCycle).toContain("investing_daily_cycle_authority_unavailable");
    expect(dashboard).toContain("function hasAcceptedCanonicalDecisionAuthority");
    expect(dashboard).toContain("return false;");
    expect(phase3cIsolation).toContain("FASE 3C source and IO isolation");
  });
});
