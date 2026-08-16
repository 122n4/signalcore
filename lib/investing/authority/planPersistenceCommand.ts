import {
  CANONICAL_INVESTING_PLAN_AUTHORING_INTENT_CONTRACT_VERSION,
  CANONICAL_INVESTING_PLAN_AUTHORING_INTENT_REASON_CODES,
  hashCanonicalInvestingPlanAuthoringIntentV1,
  type CanonicalInvestingPlanAuthoringIntentReasonCodeV1,
  type CanonicalInvestingPlanAuthoringIntentV1,
} from "@/lib/investing/authority/planAuthoringIntent";
import {
  canonicalSha256,
  deepFreezeCanonical,
  normalizeIsoTimestamp,
} from "@/lib/investing/engine/v1/canonical";

export const CANONICAL_INVESTING_PLAN_PERSISTENCE_COMMAND_CONTRACT_VERSION =
  "canonical-investing-plan-persistence-command/v1" as const;

export const CANONICAL_INVESTING_PLAN_PERSISTENCE_COMMAND_OPERATION =
  "APPEND_REVISION_AND_ADVANCE_HEAD" as const;

export const CANONICAL_INVESTING_PLAN_PERSISTENCE_FUTURE_TRANSACTION_ORDER = Object.freeze([
  "fresh authorization and source revalidation",
  "lock canonical persistence scope",
  "lookup existing scope plus idempotency key",
  "replay original persisted result when existing semanticRequestFingerprint matches",
  "fail idempotency payload mismatch when existing semanticRequestFingerprint differs",
  "validate expectedHead optimistic concurrency only for a new idempotency claim",
  "append immutable revision",
  "advance current head atomically",
  "commit",
] as const);

export type CanonicalInvestingPlanPersistenceExpectedHeadV1 = null | {
  readonly revisionId: string;
  readonly revisionNumber: number;
  readonly authoringFingerprint: string;
};

export type CanonicalInvestingPlanPersistenceCommandInputV1 = {
  readonly authoringIntent: CanonicalInvestingPlanAuthoringIntentV1;
  readonly idempotencyKey: string;
  readonly expectedHead: CanonicalInvestingPlanPersistenceExpectedHeadV1;
};

export type CanonicalInvestingPlanPersistenceCommandV1 = {
  readonly contractVersion: typeof CANONICAL_INVESTING_PLAN_PERSISTENCE_COMMAND_CONTRACT_VERSION;
  readonly operation: typeof CANONICAL_INVESTING_PLAN_PERSISTENCE_COMMAND_OPERATION;
  readonly scope: {
    readonly userId: string;
    readonly tenantId: string;
    readonly portfolioId: string;
    readonly accountId: string;
    readonly environment: "paper" | "simulation";
    readonly accountBaseCurrency: string;
  };
  readonly authoringLineage: {
    readonly membershipId: string;
    readonly authoringContractVersion: typeof CANONICAL_INVESTING_PLAN_AUTHORING_INTENT_CONTRACT_VERSION;
    readonly authoredAt: string;
    readonly authoringFingerprint: string;
  };
  readonly explicitIntent: CanonicalInvestingPlanAuthoringIntentV1["explicitIntent"];
  readonly authorityState: {
    readonly constraintAuthoring: {
      readonly availability: "UNAVAILABLE";
      readonly declarations: null;
    };
    readonly financialMethodology: {
      readonly authority: "NOT_ACCEPTED";
    };
    readonly suitability: {
      readonly authority: "NOT_ACCEPTED";
    };
    readonly mandateEligibility: false;
    readonly recommendationEligibility: false;
    readonly runtimeActivationEligibility: false;
    readonly reasonCodes: readonly CanonicalInvestingPlanAuthoringIntentReasonCodeV1[];
  };
  readonly idempotency: {
    readonly key: string;
    readonly semanticRequestFingerprint: string;
  };
  readonly expectedHead: CanonicalInvestingPlanPersistenceExpectedHeadV1;
  readonly persistenceAuthority: {
    readonly availability: "UNAVAILABLE";
    readonly databaseWriteAuthorized: false;
  };
  readonly commandFingerprint: string;
};

const COMMAND_INPUT_KEYS = ["authoringIntent", "idempotencyKey", "expectedHead"] as const;
const AUTHORING_INTENT_KEYS = [
  "contractVersion",
  "authorityScope",
  "explicitIntent",
  "constraintAuthoring",
  "financialMethodology",
  "suitability",
  "mandateEligibility",
  "recommendationEligibility",
  "runtimeActivationEligibility",
  "reasonCodes",
  "authoredAt",
  "authoringFingerprint",
] as const;
const AUTHORITY_SCOPE_KEYS = [
  "userId",
  "tenantId",
  "membershipId",
  "portfolioId",
  "accountId",
  "environment",
  "accountBaseCurrency",
] as const;
const EXPLICIT_INTENT_KEYS = ["objective", "riskProfile", "horizon"] as const;
const CONSTRAINT_AUTHORING_KEYS = ["availability", "declarations"] as const;
const METHODOLOGY_KEYS = ["authority"] as const;
const EXPECTED_HEAD_KEYS = ["revisionId", "revisionNumber", "authoringFingerprint"] as const;

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const CANONICAL_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256_LOWERCASE_PATTERN = /^[a-f0-9]{64}$/;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{7,127}$/;
const OBJECTIVES = new Set(["preservation", "growth", "income", "balanced"]);
const RISK_PROFILES = new Set(["Conservative", "Balanced", "Aggressive"]);
const HORIZONS = new Set(["Short", "Medium", "Long"]);

function assert(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
}

function isPlainRecordShape(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function assertClosedDataRecord(
  value: unknown,
  allowed: readonly string[],
  code: string,
): asserts value is Record<string, unknown> {
  // This boundary validates ordinary sealed data records after a serialization boundary.
  // It does not claim generic immunity to arbitrary Proxy reflective traps.
  assert(isPlainRecordShape(value), code);
  const allowedSet = new Set(allowed);
  const ownKeys = Reflect.ownKeys(value);
  assert(ownKeys.length === allowed.length, code);

  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of ownKeys) {
    assert(typeof key === "string", code);
    assert(allowedSet.has(key), code);
    const descriptor = descriptors[key];
    assert(Boolean(descriptor), code);
    assert(descriptor.enumerable === true, code);
    assert("value" in descriptor, code);
  }

  for (const key of allowed) {
    const descriptor = descriptors[key];
    assert(Boolean(descriptor), code);
    assert(descriptor.enumerable === true, code);
    assert("value" in descriptor, code);
  }
}

function assertClosedDataArray(value: unknown, code: string): asserts value is readonly unknown[] {
  // This ordinary-array boundary does not invoke array iterators or array methods
  // before descriptor closure, and does not claim generic Proxy immunity.
  assert(Array.isArray(value), code);
  assert(Object.getPrototypeOf(value) === Array.prototype, code);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  assert(Boolean(lengthDescriptor) && "value" in lengthDescriptor && lengthDescriptor.enumerable === false, code);
  const length = lengthDescriptor.value;
  assert(Number.isSafeInteger(length) && length >= 0, code);

  for (const key of Reflect.ownKeys(value)) {
    assert(typeof key === "string", code);
    if (key === "length") continue;
    assert(/^(0|[1-9]\d*)$/.test(key), code);
    const index = Number(key);
    assert(Number.isSafeInteger(index) && index >= 0 && index < length, code);
    const descriptor = descriptors[key];
    assert(Boolean(descriptor), code);
    assert(descriptor.enumerable === true, code);
    assert("value" in descriptor, code);
  }

  for (let index = 0; index < length; index += 1) {
    const descriptor = descriptors[String(index)];
    assert(Boolean(descriptor) && descriptor.enumerable === true && "value" in descriptor, code);
  }
}

function materializeClosedStringArray(value: unknown, code: string) {
  assertClosedDataArray(value, code);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  assert(Boolean(lengthDescriptor) && "value" in lengthDescriptor, code);
  const strings: string[] = [];
  for (let index = 0; index < lengthDescriptor.value; index += 1) {
    const descriptor = descriptors[String(index)];
    assert(Boolean(descriptor) && "value" in descriptor, code);
    assert(typeof descriptor.value === "string", code);
    strings.push(descriptor.value);
  }
  return strings;
}

function readDataField(record: Record<string, unknown>, key: string) {
  return Object.getOwnPropertyDescriptor(record, key)?.value;
}

function assertId(value: unknown, code: string): asserts value is string {
  assert(typeof value === "string" && ID_PATTERN.test(value), code);
}

function assertCurrency(value: unknown, code: string): asserts value is string {
  assert(typeof value === "string" && CURRENCY_PATTERN.test(value), code);
}

function assertTimestamp(value: unknown, code: string): asserts value is string {
  assert(typeof value === "string", code);
  assert(normalizeIsoTimestamp(value) === value, code);
}

function assertSha256(value: unknown, code: string): asserts value is string {
  assert(typeof value === "string" && SHA256_LOWERCASE_PATTERN.test(value), code);
}

function materializeAuthorityScope(value: unknown): CanonicalInvestingPlanAuthoringIntentV1["authorityScope"] {
  assertClosedDataRecord(value, AUTHORITY_SCOPE_KEYS, "investing_plan_persistence_authority_scope_closed_invalid");
  const scope = {
    userId: readDataField(value, "userId"),
    tenantId: readDataField(value, "tenantId"),
    membershipId: readDataField(value, "membershipId"),
    portfolioId: readDataField(value, "portfolioId"),
    accountId: readDataField(value, "accountId"),
    environment: readDataField(value, "environment"),
    accountBaseCurrency: readDataField(value, "accountBaseCurrency"),
  };

  assertId(scope.userId, "investing_plan_persistence_user_id_invalid");
  assertId(scope.tenantId, "investing_plan_persistence_tenant_id_invalid");
  assertId(scope.membershipId, "investing_plan_persistence_membership_id_invalid");
  assertId(scope.portfolioId, "investing_plan_persistence_portfolio_id_invalid");
  assertId(scope.accountId, "investing_plan_persistence_account_id_invalid");
  assert(
    scope.environment === "paper" || scope.environment === "simulation",
    "investing_plan_persistence_environment_invalid",
  );
  assertCurrency(scope.accountBaseCurrency, "investing_plan_persistence_account_base_currency_invalid");
  return scope as CanonicalInvestingPlanAuthoringIntentV1["authorityScope"];
}

function materializeExplicitIntent(value: unknown): CanonicalInvestingPlanAuthoringIntentV1["explicitIntent"] {
  assertClosedDataRecord(value, EXPLICIT_INTENT_KEYS, "investing_plan_persistence_explicit_intent_closed_invalid");
  const intent = {
    objective: readDataField(value, "objective"),
    riskProfile: readDataField(value, "riskProfile"),
    horizon: readDataField(value, "horizon"),
  };

  assert(typeof intent.objective === "string" && OBJECTIVES.has(intent.objective), "investing_plan_persistence_objective_invalid");
  assert(typeof intent.riskProfile === "string" && RISK_PROFILES.has(intent.riskProfile), "investing_plan_persistence_risk_profile_invalid");
  assert(typeof intent.horizon === "string" && HORIZONS.has(intent.horizon), "investing_plan_persistence_horizon_invalid");
  return intent as CanonicalInvestingPlanAuthoringIntentV1["explicitIntent"];
}

function materializeConstraintAuthoring(value: unknown) {
  assertClosedDataRecord(value, CONSTRAINT_AUTHORING_KEYS, "investing_plan_persistence_constraint_authoring_closed_invalid");
  assert(readDataField(value, "availability") === "UNAVAILABLE", "investing_plan_persistence_constraint_authoring_availability_invalid");
  assert(readDataField(value, "declarations") === null, "investing_plan_persistence_constraint_authoring_declarations_invalid");
  return { availability: "UNAVAILABLE", declarations: null } as const;
}

function materializeNotAcceptedAuthority(value: unknown, codePrefix: string) {
  assertClosedDataRecord(value, METHODOLOGY_KEYS, `${codePrefix}_closed_invalid`);
  assert(readDataField(value, "authority") === "NOT_ACCEPTED", `${codePrefix}_authority_invalid`);
  return { authority: "NOT_ACCEPTED" } as const;
}

function materializeReasonCodes(value: unknown) {
  const reasons = materializeClosedStringArray(value, "investing_plan_persistence_reason_codes_invalid");
  assert(reasons.length === CANONICAL_INVESTING_PLAN_AUTHORING_INTENT_REASON_CODES.length, "investing_plan_persistence_reason_codes_invalid");
  const seen = new Set<string>();
  for (let index = 0; index < CANONICAL_INVESTING_PLAN_AUTHORING_INTENT_REASON_CODES.length; index += 1) {
    const reason = reasons[index];
    assert(!seen.has(reason), "investing_plan_persistence_reason_codes_invalid");
    seen.add(reason);
    assert(
      reason === CANONICAL_INVESTING_PLAN_AUTHORING_INTENT_REASON_CODES[index],
      "investing_plan_persistence_reason_codes_invalid",
    );
  }
  return reasons as readonly CanonicalInvestingPlanAuthoringIntentReasonCodeV1[];
}

function materializeAuthoringIntent(value: unknown): CanonicalInvestingPlanAuthoringIntentV1 {
  assertClosedDataRecord(value, AUTHORING_INTENT_KEYS, "investing_plan_persistence_authoring_intent_closed_invalid");
  assert(
    readDataField(value, "contractVersion") === CANONICAL_INVESTING_PLAN_AUTHORING_INTENT_CONTRACT_VERSION,
    "investing_plan_persistence_authoring_contract_version_invalid",
  );
  const authorityScope = materializeAuthorityScope(readDataField(value, "authorityScope"));
  const explicitIntent = materializeExplicitIntent(readDataField(value, "explicitIntent"));
  const constraintAuthoring = materializeConstraintAuthoring(readDataField(value, "constraintAuthoring"));
  const financialMethodology = materializeNotAcceptedAuthority(
    readDataField(value, "financialMethodology"),
    "investing_plan_persistence_financial_methodology",
  );
  const suitability = materializeNotAcceptedAuthority(
    readDataField(value, "suitability"),
    "investing_plan_persistence_suitability",
  );
  assert(readDataField(value, "mandateEligibility") === false, "investing_plan_persistence_mandate_eligibility_invalid");
  assert(readDataField(value, "recommendationEligibility") === false, "investing_plan_persistence_recommendation_eligibility_invalid");
  assert(readDataField(value, "runtimeActivationEligibility") === false, "investing_plan_persistence_runtime_activation_eligibility_invalid");
  const reasonCodes = materializeReasonCodes(readDataField(value, "reasonCodes"));
  const authoredAt = readDataField(value, "authoredAt");
  assertTimestamp(authoredAt, "investing_plan_persistence_authored_at_invalid");
  const authoringFingerprint = readDataField(value, "authoringFingerprint");
  assertSha256(authoringFingerprint, "investing_plan_persistence_authoring_fingerprint_invalid");

  const materialized = {
    contractVersion: CANONICAL_INVESTING_PLAN_AUTHORING_INTENT_CONTRACT_VERSION,
    authorityScope,
    explicitIntent,
    constraintAuthoring,
    financialMethodology,
    suitability,
    mandateEligibility: false,
    recommendationEligibility: false,
    runtimeActivationEligibility: false,
    reasonCodes,
    authoredAt,
    authoringFingerprint,
  } satisfies CanonicalInvestingPlanAuthoringIntentV1;

  assert(
    hashCanonicalInvestingPlanAuthoringIntentV1(materialized) === authoringFingerprint,
    "investing_plan_persistence_authoring_fingerprint_mismatch",
  );
  return materialized;
}

function materializeIdempotencyKey(value: unknown) {
  assert(
    typeof value === "string" && IDEMPOTENCY_KEY_PATTERN.test(value),
    "investing_plan_persistence_idempotency_key_invalid",
  );
  return value;
}

function materializeExpectedHead(value: unknown): CanonicalInvestingPlanPersistenceExpectedHeadV1 {
  if (value === null) return null;
  assertClosedDataRecord(value, EXPECTED_HEAD_KEYS, "investing_plan_persistence_expected_head_closed_invalid");
  const revisionId = readDataField(value, "revisionId");
  const revisionNumber = readDataField(value, "revisionNumber");
  const authoringFingerprint = readDataField(value, "authoringFingerprint");

  assert(typeof revisionId === "string" && CANONICAL_UUID_PATTERN.test(revisionId), "investing_plan_persistence_expected_head_revision_id_invalid");
  assert(
    typeof revisionNumber === "number" &&
      Number.isFinite(revisionNumber) &&
      Number.isSafeInteger(revisionNumber) &&
      revisionNumber >= 1,
    "investing_plan_persistence_expected_head_revision_number_invalid",
  );
  assertSha256(authoringFingerprint, "investing_plan_persistence_expected_head_authoring_fingerprint_invalid");
  return { revisionId, revisionNumber, authoringFingerprint };
}

function expectedHeadFingerprintInput(expectedHead: CanonicalInvestingPlanPersistenceExpectedHeadV1) {
  if (expectedHead === null) return null;
  return {
    revisionId: expectedHead.revisionId,
    revisionNumber: String(expectedHead.revisionNumber),
    authoringFingerprint: expectedHead.authoringFingerprint,
  };
}

function authorityStateFromAuthoringIntent(intent: CanonicalInvestingPlanAuthoringIntentV1) {
  return {
    constraintAuthoring: intent.constraintAuthoring,
    financialMethodology: intent.financialMethodology,
    suitability: intent.suitability,
    mandateEligibility: intent.mandateEligibility,
    recommendationEligibility: intent.recommendationEligibility,
    runtimeActivationEligibility: intent.runtimeActivationEligibility,
    reasonCodes: intent.reasonCodes,
  };
}

function semanticRequestFingerprintInput(
  authoringIntent: CanonicalInvestingPlanAuthoringIntentV1,
  expectedHead: CanonicalInvestingPlanPersistenceExpectedHeadV1,
) {
  return {
    contractVersion: CANONICAL_INVESTING_PLAN_PERSISTENCE_COMMAND_CONTRACT_VERSION,
    operation: CANONICAL_INVESTING_PLAN_PERSISTENCE_COMMAND_OPERATION,
    authoringContractVersion: authoringIntent.contractVersion,
    scope: {
      userId: authoringIntent.authorityScope.userId,
      tenantId: authoringIntent.authorityScope.tenantId,
      portfolioId: authoringIntent.authorityScope.portfolioId,
      accountId: authoringIntent.authorityScope.accountId,
      environment: authoringIntent.authorityScope.environment,
      accountBaseCurrency: authoringIntent.authorityScope.accountBaseCurrency,
    },
    explicitIntent: authoringIntent.explicitIntent,
    authorityState: authorityStateFromAuthoringIntent(authoringIntent),
    expectedHead: expectedHeadFingerprintInput(expectedHead),
  };
}

export function hashCanonicalInvestingPlanPersistenceSemanticRequestV1(
  input: Pick<CanonicalInvestingPlanPersistenceCommandInputV1, "authoringIntent" | "expectedHead">,
) {
  const authoringIntent = materializeAuthoringIntent(input.authoringIntent);
  const expectedHead = materializeExpectedHead(input.expectedHead);
  return canonicalSha256(semanticRequestFingerprintInput(authoringIntent, expectedHead));
}

function commandFingerprintInput(
  command: Omit<CanonicalInvestingPlanPersistenceCommandV1, "commandFingerprint">,
) {
  return {
    contractVersion: command.contractVersion,
    operation: command.operation,
    scope: command.scope,
    authoringLineage: command.authoringLineage,
    explicitIntent: command.explicitIntent,
    authorityState: command.authorityState,
    idempotency: command.idempotency,
    expectedHead: expectedHeadFingerprintInput(command.expectedHead),
    persistenceAuthority: command.persistenceAuthority,
  };
}

export function hashCanonicalInvestingPlanPersistenceCommandV1(
  command:
    | CanonicalInvestingPlanPersistenceCommandV1
    | Omit<CanonicalInvestingPlanPersistenceCommandV1, "commandFingerprint">,
) {
  return canonicalSha256(commandFingerprintInput(command));
}

export function buildCanonicalInvestingPlanPersistenceCommandV1(
  input: CanonicalInvestingPlanPersistenceCommandInputV1,
): CanonicalInvestingPlanPersistenceCommandV1 {
  assertClosedDataRecord(input, COMMAND_INPUT_KEYS, "investing_plan_persistence_command_input_closed_invalid");
  const authoringIntent = materializeAuthoringIntent(readDataField(input, "authoringIntent"));
  const idempotencyKey = materializeIdempotencyKey(readDataField(input, "idempotencyKey"));
  const expectedHead = materializeExpectedHead(readDataField(input, "expectedHead"));
  const semanticRequestFingerprint = canonicalSha256(
    semanticRequestFingerprintInput(authoringIntent, expectedHead),
  );

  // Persistence is intentionally unavailable in A3A. The command describes the
  // future operation contract only. Actual writes must re-authorize fresh, then
  // check idempotency replay before expected-head conflict because a successful
  // original write advances the head that an exact retry still names.
  const draft = {
    contractVersion: CANONICAL_INVESTING_PLAN_PERSISTENCE_COMMAND_CONTRACT_VERSION,
    operation: CANONICAL_INVESTING_PLAN_PERSISTENCE_COMMAND_OPERATION,
    scope: {
      userId: authoringIntent.authorityScope.userId,
      tenantId: authoringIntent.authorityScope.tenantId,
      portfolioId: authoringIntent.authorityScope.portfolioId,
      accountId: authoringIntent.authorityScope.accountId,
      environment: authoringIntent.authorityScope.environment,
      accountBaseCurrency: authoringIntent.authorityScope.accountBaseCurrency,
    },
    authoringLineage: {
      membershipId: authoringIntent.authorityScope.membershipId,
      authoringContractVersion: authoringIntent.contractVersion,
      authoredAt: authoringIntent.authoredAt,
      authoringFingerprint: authoringIntent.authoringFingerprint,
    },
    explicitIntent: authoringIntent.explicitIntent,
    authorityState: authorityStateFromAuthoringIntent(authoringIntent),
    idempotency: {
      key: idempotencyKey,
      semanticRequestFingerprint,
    },
    expectedHead,
    persistenceAuthority: {
      availability: "UNAVAILABLE",
      databaseWriteAuthorized: false,
    },
  } satisfies Omit<CanonicalInvestingPlanPersistenceCommandV1, "commandFingerprint">;

  const sealed = {
    ...draft,
    commandFingerprint: hashCanonicalInvestingPlanPersistenceCommandV1(draft),
  } satisfies CanonicalInvestingPlanPersistenceCommandV1;

  return deepFreezeCanonical(sealed) as CanonicalInvestingPlanPersistenceCommandV1;
}
