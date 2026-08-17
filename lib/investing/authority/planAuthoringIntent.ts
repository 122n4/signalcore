import {
  canonicalSha256,
  deepFreezeCanonical,
  normalizeIsoTimestamp,
} from "@/lib/investing/engine/v1/canonical";

export const CANONICAL_INVESTING_PLAN_AUTHORING_INTENT_CONTRACT_VERSION =
  "canonical-investing-plan-authoring-intent/v1" as const;

export const CANONICAL_INVESTING_PLAN_AUTHORING_INTENT_REASON_CODES = Object.freeze([
  "CANONICAL_CONSTRAINT_AUTHORING_NOT_DEFINED",
  "FINANCIAL_METHODOLOGY_AUTHORITY_NOT_ACCEPTED",
  "SUITABILITY_AUTHORITY_NOT_ACCEPTED",
  "CANONICAL_MANDATE_NOT_ELIGIBLE",
  "RECOMMENDATION_NOT_ELIGIBLE",
  "RUNTIME_ACTIVATION_NOT_ELIGIBLE",
] as const);

export type CanonicalInvestingPlanAuthoringIntentReasonCodeV1 =
  (typeof CANONICAL_INVESTING_PLAN_AUTHORING_INTENT_REASON_CODES)[number];

export type CanonicalInvestingPlanAuthoringIntentInputV1 = {
  readonly authorityScope: {
    readonly userId: string;
    readonly tenantId: string;
    readonly membershipId: string;
    readonly portfolioId: string;
    readonly accountId: string;
    readonly environment: "paper" | "simulation";
    readonly accountBaseCurrency: string;
  };
  readonly explicitIntent: {
    readonly objective: "preservation" | "growth" | "income" | "balanced";
    readonly riskProfile: "Conservative" | "Balanced" | "Aggressive";
    readonly horizon: "Short" | "Medium" | "Long";
  };
  readonly authoredAt: string;
};

export type CanonicalInvestingPlanAuthoringIntentV1 = {
  readonly contractVersion: typeof CANONICAL_INVESTING_PLAN_AUTHORING_INTENT_CONTRACT_VERSION;
  readonly authorityScope: CanonicalInvestingPlanAuthoringIntentInputV1["authorityScope"];
  readonly explicitIntent: CanonicalInvestingPlanAuthoringIntentInputV1["explicitIntent"];
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
  readonly authoredAt: string;
  readonly authoringFingerprint: string;
};

const ROOT_INPUT_KEYS = ["authorityScope", "explicitIntent", "authoredAt"] as const;
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

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
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

function materializeAuthorityScope(value: unknown): CanonicalInvestingPlanAuthoringIntentInputV1["authorityScope"] {
  assertClosedDataRecord(value, AUTHORITY_SCOPE_KEYS, "investing_plan_authoring_intent_authority_scope_closed_invalid");
  const authorityScope = {
    userId: readDataField(value, "userId"),
    tenantId: readDataField(value, "tenantId"),
    membershipId: readDataField(value, "membershipId"),
    portfolioId: readDataField(value, "portfolioId"),
    accountId: readDataField(value, "accountId"),
    environment: readDataField(value, "environment"),
    accountBaseCurrency: readDataField(value, "accountBaseCurrency"),
  };

  assertId(authorityScope.userId, "investing_plan_authoring_intent_user_id_invalid");
  assertId(authorityScope.tenantId, "investing_plan_authoring_intent_tenant_id_invalid");
  assertId(authorityScope.membershipId, "investing_plan_authoring_intent_membership_id_invalid");
  assertId(authorityScope.portfolioId, "investing_plan_authoring_intent_portfolio_id_invalid");
  assertId(authorityScope.accountId, "investing_plan_authoring_intent_account_id_invalid");
  assert(
    authorityScope.environment === "paper" || authorityScope.environment === "simulation",
    "investing_plan_authoring_intent_environment_invalid",
  );
  assertCurrency(authorityScope.accountBaseCurrency, "investing_plan_authoring_intent_account_base_currency_invalid");

  return authorityScope as CanonicalInvestingPlanAuthoringIntentInputV1["authorityScope"];
}

function materializeExplicitIntent(value: unknown): CanonicalInvestingPlanAuthoringIntentInputV1["explicitIntent"] {
  assertClosedDataRecord(value, EXPLICIT_INTENT_KEYS, "investing_plan_authoring_intent_explicit_intent_closed_invalid");
  const explicitIntent = {
    objective: readDataField(value, "objective"),
    riskProfile: readDataField(value, "riskProfile"),
    horizon: readDataField(value, "horizon"),
  };

  assert(
    typeof explicitIntent.objective === "string" && OBJECTIVES.has(explicitIntent.objective),
    "investing_plan_authoring_intent_objective_invalid",
  );
  assert(
    typeof explicitIntent.riskProfile === "string" && RISK_PROFILES.has(explicitIntent.riskProfile),
    "investing_plan_authoring_intent_risk_profile_invalid",
  );
  assert(
    typeof explicitIntent.horizon === "string" && HORIZONS.has(explicitIntent.horizon),
    "investing_plan_authoring_intent_horizon_invalid",
  );

  return explicitIntent as CanonicalInvestingPlanAuthoringIntentInputV1["explicitIntent"];
}

function fingerprintInput(
  intent: Omit<CanonicalInvestingPlanAuthoringIntentV1, "authoringFingerprint">,
) {
  return intent;
}

export function hashCanonicalInvestingPlanAuthoringIntentV1(
  intent:
    | CanonicalInvestingPlanAuthoringIntentV1
    | Omit<CanonicalInvestingPlanAuthoringIntentV1, "authoringFingerprint">,
) {
  const hashable: Record<string, unknown> = { ...intent };
  delete hashable.authoringFingerprint;
  return canonicalSha256(
    fingerprintInput(hashable as Omit<CanonicalInvestingPlanAuthoringIntentV1, "authoringFingerprint">),
  );
}

export function buildCanonicalInvestingPlanAuthoringIntentV1(
  input: CanonicalInvestingPlanAuthoringIntentInputV1,
): CanonicalInvestingPlanAuthoringIntentV1 {
  assertClosedDataRecord(input, ROOT_INPUT_KEYS, "investing_plan_authoring_intent_input_closed_invalid");
  const authorityScope = materializeAuthorityScope(readDataField(input, "authorityScope"));
  const explicitIntent = materializeExplicitIntent(readDataField(input, "explicitIntent"));
  const authoredAt = readDataField(input, "authoredAt");
  assertTimestamp(authoredAt, "investing_plan_authoring_intent_authored_at_invalid");

  // authorityScope is scoping data only; this fingerprint is not authentication or authorization.
  // Future callers must source accountBaseCurrency from server-verified Investing account scope, never client input.
  const draft = {
    contractVersion: CANONICAL_INVESTING_PLAN_AUTHORING_INTENT_CONTRACT_VERSION,
    authorityScope,
    explicitIntent,
    constraintAuthoring: {
      availability: "UNAVAILABLE",
      declarations: null,
    },
    financialMethodology: {
      authority: "NOT_ACCEPTED",
    },
    suitability: {
      authority: "NOT_ACCEPTED",
    },
    mandateEligibility: false,
    recommendationEligibility: false,
    runtimeActivationEligibility: false,
    reasonCodes: CANONICAL_INVESTING_PLAN_AUTHORING_INTENT_REASON_CODES,
    authoredAt,
  } satisfies Omit<CanonicalInvestingPlanAuthoringIntentV1, "authoringFingerprint">;

  const sealed = {
    ...draft,
    authoringFingerprint: hashCanonicalInvestingPlanAuthoringIntentV1(draft),
  } satisfies CanonicalInvestingPlanAuthoringIntentV1;

  return deepFreezeCanonical(sealed) as CanonicalInvestingPlanAuthoringIntentV1;
}
