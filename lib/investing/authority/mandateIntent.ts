import {
  CANONICAL_PLAN_TO_MANDATE_TRANSLATION_CONTRACT_VERSION,
  CANONICAL_PLAN_TO_MANDATE_TRANSLATION_REASON_CODES,
  type CanonicalPlanToMandateTranslationAssessmentV1,
  type CanonicalPlanToMandateTranslationReasonCodeV1,
} from "@/lib/investing/authority/planToMandateTranslation";
import {
  canonicalSha256,
  deepFreezeCanonical,
  normalizeIsoTimestamp,
} from "@/lib/investing/engine/v1/canonical";
import type { InvestingAccountScope, InvestingTenantContext } from "@/lib/investing/server/authz";

export const CANONICAL_INVESTING_MANDATE_INTENT_CONTRACT_VERSION =
  "canonical-investing-mandate-intent/v1" as const;

export type CanonicalInvestingMandateIntentObjectiveV1 =
  | "preservation"
  | "growth"
  | "income"
  | "balanced";

export type CanonicalInvestingMandateIntentRiskProfileV1 =
  | "Conservative"
  | "Balanced"
  | "Aggressive";

export type CanonicalInvestingMandateIntentHorizonV1 = "Short" | "Medium" | "Long";

export type CanonicalInvestingMandateIntentExplicitInputV1 = {
  readonly objective: CanonicalInvestingMandateIntentObjectiveV1;
  readonly riskProfile: CanonicalInvestingMandateIntentRiskProfileV1;
  readonly horizon: CanonicalInvestingMandateIntentHorizonV1;
};

export type CanonicalInvestingMandateIntentInputV1 = {
  readonly tenant: InvestingTenantContext;
  readonly account: InvestingAccountScope;
  readonly planAssessment: CanonicalPlanToMandateTranslationAssessmentV1;
  readonly intent: CanonicalInvestingMandateIntentExplicitInputV1;
  readonly authoredAt: string;
};

export type CanonicalInvestingMandateIntentV1 = {
  readonly contractVersion: typeof CANONICAL_INVESTING_MANDATE_INTENT_CONTRACT_VERSION;
  readonly authority: {
    readonly userId: string;
    readonly tenantId: string;
    readonly membershipId: string;
    readonly portfolioId: string;
    readonly accountId: string;
    readonly environment: "paper" | "simulation";
    readonly accountBaseCurrency: string;
  };
  readonly plan: {
    readonly planId: string;
    readonly planVersion: number;
    readonly activatedAt: string;
    readonly updatedAt: string;
    readonly structuredSchemaVersion: 1;
    readonly semanticFingerprint: string;
  };
  readonly intent: CanonicalInvestingMandateIntentExplicitInputV1;
  readonly policy: {
    readonly availability: "UNAVAILABLE";
    readonly reason: "canonical_policy_methodology_not_accepted";
    readonly declarations: null;
  };
  readonly lineage: {
    readonly authoredAt: string;
    readonly intentFingerprint: string;
  };
};

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const SHA256_LOWERCASE_PATTERN = /^[a-f0-9]{64}$/;

const ROOT_INPUT_KEYS = ["tenant", "account", "planAssessment", "intent", "authoredAt"] as const;
const TENANT_KEYS = ["userId", "tenantId", "membershipId", "role", "permissions"] as const;
const ACCOUNT_KEYS = [
  "id",
  "userId",
  "ownerUserId",
  "tenantId",
  "portfolioId",
  "environment",
  "status",
  "baseCurrency",
] as const;
const ASSESSMENT_KEYS = [
  "contractVersion",
  "sourcePlan",
  "account",
  "availability",
  "reasonCodes",
  "compatibleSemantics",
  "mandate",
  "translationFingerprint",
] as const;
const SOURCE_PLAN_KEYS = [
  "planId",
  "planVersion",
  "activatedAt",
  "updatedAt",
  "structuredSchemaVersion",
  "semanticFingerprint",
] as const;
const ASSESSMENT_ACCOUNT_KEYS = ["baseCurrency"] as const;
const COMPATIBLE_SEMANTICS_KEYS = ["objective", "riskProfile", "horizon", "baseCurrency", "constraints"] as const;
const INTENT_KEYS = ["objective", "riskProfile", "horizon"] as const;

const OBJECTIVES = new Set(["preservation", "growth", "income", "balanced"]);
const RISK_PROFILES = new Set(["Conservative", "Balanced", "Aggressive"]);
const HORIZONS = new Set(["Short", "Medium", "Long"]);
const DISALLOWED_PLAN_ASSESSMENT_REASONS = new Set<CanonicalPlanToMandateTranslationReasonCodeV1>([
  "PLAN_UNAVAILABLE",
  "PLAN_NOT_ACTIVE",
  "PLAN_ACTIVATION_UNAVAILABLE",
  "STRUCTURED_PLAN_UNAVAILABLE",
  "STRUCTURED_SCHEMA_UNSUPPORTED",
  "OBJECTIVE_MISSING",
  "OBJECTIVE_UNSUPPORTED",
  "RISK_PROFILE_MISSING",
  "BASE_CURRENCY_UNAVAILABLE",
  "EXPECTED_PLAN_SEMANTIC_FINGERPRINT_INVALID",
  "PLAN_SOURCE_CHANGED",
]);

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
  assert(Array.isArray(value), code);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  assert(Boolean(lengthDescriptor) && "value" in lengthDescriptor && lengthDescriptor.enumerable === false, code);

  for (const key of Reflect.ownKeys(value)) {
    assert(typeof key === "string", code);
    if (key === "length") continue;
    assert(/^(0|[1-9]\d*)$/.test(key), code);
    const index = Number(key);
    assert(Number.isSafeInteger(index) && index >= 0 && index < value.length, code);
    const descriptor = descriptors[key];
    assert(Boolean(descriptor), code);
    assert(descriptor.enumerable === true, code);
    assert("value" in descriptor, code);
  }

  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[String(index)];
    assert(Boolean(descriptor) && descriptor.enumerable === true && "value" in descriptor, code);
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

function assertSafePositiveVersion(value: unknown): asserts value is number {
  assert(
    typeof value === "number" &&
      Number.isFinite(value) &&
      Number.isSafeInteger(value) &&
      value > 0,
    "investing_mandate_intent_plan_version_invalid",
  );
}

function assertTimestamp(value: unknown, code: string): asserts value is string {
  assert(typeof value === "string", code);
  assert(normalizeIsoTimestamp(value) === value, code);
}

function assertSha256(value: unknown, code: string): asserts value is string {
  assert(typeof value === "string" && SHA256_LOWERCASE_PATTERN.test(value), code);
}

function materializeStringArray(value: unknown, code: string) {
  assertClosedDataArray(value, code);
  return value.map((entry) => {
    assert(typeof entry === "string", code);
    return entry;
  });
}

function materializeTenant(value: unknown) {
  assertClosedDataRecord(value, TENANT_KEYS, "investing_mandate_intent_tenant_closed_invalid");
  const permissions = materializeStringArray(readDataField(value, "permissions"), "investing_mandate_intent_permissions_invalid");
  const tenant = {
    userId: readDataField(value, "userId"),
    tenantId: readDataField(value, "tenantId"),
    membershipId: readDataField(value, "membershipId"),
    role: readDataField(value, "role"),
    permissions,
  };

  assertId(tenant.userId, "investing_mandate_intent_user_id_invalid");
  assertId(tenant.tenantId, "investing_mandate_intent_tenant_id_invalid");
  assertId(tenant.membershipId, "investing_mandate_intent_membership_id_invalid");
  assert(typeof tenant.role === "string" && tenant.role.length > 0, "investing_mandate_intent_role_invalid");
  return tenant;
}

function materializeAccount(value: unknown) {
  assertClosedDataRecord(value, ACCOUNT_KEYS, "investing_mandate_intent_account_closed_invalid");
  const account = {
    id: readDataField(value, "id"),
    userId: readDataField(value, "userId"),
    ownerUserId: readDataField(value, "ownerUserId"),
    tenantId: readDataField(value, "tenantId"),
    portfolioId: readDataField(value, "portfolioId"),
    environment: readDataField(value, "environment"),
    status: readDataField(value, "status"),
    baseCurrency: readDataField(value, "baseCurrency"),
  };

  assertId(account.id, "investing_mandate_intent_account_id_invalid");
  assertId(account.userId, "investing_mandate_intent_account_user_id_invalid");
  assertId(account.ownerUserId, "investing_mandate_intent_account_owner_id_invalid");
  assertId(account.tenantId, "investing_mandate_intent_account_tenant_id_invalid");
  assertId(account.portfolioId, "investing_mandate_intent_portfolio_id_invalid");
  assert(account.environment === "paper" || account.environment === "simulation", "investing_mandate_intent_environment_invalid");
  assert(account.status === "active", "investing_mandate_intent_account_inactive");
  assertCurrency(account.baseCurrency, "investing_mandate_intent_account_currency_invalid");
  return account as {
    id: string;
    userId: string;
    ownerUserId: string;
    tenantId: string;
    portfolioId: string;
    environment: "paper" | "simulation";
    status: "active";
    baseCurrency: string;
  };
}

function materializePlanAssessment(value: unknown) {
  assertClosedDataRecord(value, ASSESSMENT_KEYS, "investing_mandate_intent_assessment_closed_invalid");
  assert(
    readDataField(value, "contractVersion") === CANONICAL_PLAN_TO_MANDATE_TRANSLATION_CONTRACT_VERSION,
    "investing_mandate_intent_assessment_contract_invalid",
  );
  assert(readDataField(value, "availability") === "UNAVAILABLE", "investing_mandate_intent_assessment_availability_invalid");
  assert(readDataField(value, "mandate") === null, "investing_mandate_intent_assessment_mandate_invalid");
  assertSha256(readDataField(value, "translationFingerprint"), "investing_mandate_intent_translation_fingerprint_invalid");

  const sourcePlan = readDataField(value, "sourcePlan");
  assertClosedDataRecord(sourcePlan, SOURCE_PLAN_KEYS, "investing_mandate_intent_source_plan_closed_invalid");
  const sourcePlanMaterialized = {
    planId: readDataField(sourcePlan, "planId"),
    planVersion: readDataField(sourcePlan, "planVersion"),
    activatedAt: readDataField(sourcePlan, "activatedAt"),
    updatedAt: readDataField(sourcePlan, "updatedAt"),
    structuredSchemaVersion: readDataField(sourcePlan, "structuredSchemaVersion"),
    semanticFingerprint: readDataField(sourcePlan, "semanticFingerprint"),
  };
  assertId(sourcePlanMaterialized.planId, "investing_mandate_intent_plan_id_invalid");
  assertSafePositiveVersion(sourcePlanMaterialized.planVersion);
  assertTimestamp(sourcePlanMaterialized.activatedAt, "investing_mandate_intent_plan_activated_at_invalid");
  assertTimestamp(sourcePlanMaterialized.updatedAt, "investing_mandate_intent_plan_updated_at_invalid");
  assert(
    sourcePlanMaterialized.structuredSchemaVersion === 1,
    "investing_mandate_intent_structured_schema_invalid",
  );
  assertSha256(
    sourcePlanMaterialized.semanticFingerprint,
    "investing_mandate_intent_plan_semantic_fingerprint_invalid",
  );

  const assessmentAccount = readDataField(value, "account");
  assertClosedDataRecord(assessmentAccount, ASSESSMENT_ACCOUNT_KEYS, "investing_mandate_intent_assessment_account_closed_invalid");
  const assessmentBaseCurrency = readDataField(assessmentAccount, "baseCurrency");
  assertCurrency(assessmentBaseCurrency, "investing_mandate_intent_assessment_currency_invalid");

  const compatibleSemantics = readDataField(value, "compatibleSemantics");
  assertClosedDataRecord(
    compatibleSemantics,
    COMPATIBLE_SEMANTICS_KEYS,
    "investing_mandate_intent_compatible_semantics_closed_invalid",
  );
  const compatible = {
    objective: readDataField(compatibleSemantics, "objective"),
    riskProfile: readDataField(compatibleSemantics, "riskProfile"),
    horizon: readDataField(compatibleSemantics, "horizon"),
    baseCurrency: readDataField(compatibleSemantics, "baseCurrency"),
    constraints: readDataField(compatibleSemantics, "constraints"),
  };
  assert(typeof compatible.objective === "string" && OBJECTIVES.has(compatible.objective), "investing_mandate_intent_plan_objective_unavailable");
  assert(typeof compatible.riskProfile === "string" && RISK_PROFILES.has(compatible.riskProfile), "investing_mandate_intent_plan_risk_unavailable");
  assert(compatible.horizon === null, "investing_mandate_intent_assessment_horizon_invalid");
  assert(compatible.baseCurrency === assessmentBaseCurrency, "investing_mandate_intent_assessment_currency_mismatch");
  assert(compatible.constraints === null, "investing_mandate_intent_assessment_constraints_invalid");

  const reasonCodes = materializeStringArray(readDataField(value, "reasonCodes"), "investing_mandate_intent_reason_codes_invalid");
  const knownReasons = new Set(CANONICAL_PLAN_TO_MANDATE_TRANSLATION_REASON_CODES);
  for (const reason of reasonCodes) {
    assert(knownReasons.has(reason as CanonicalPlanToMandateTranslationReasonCodeV1), "investing_mandate_intent_reason_code_unknown");
    assert(
      !DISALLOWED_PLAN_ASSESSMENT_REASONS.has(reason as CanonicalPlanToMandateTranslationReasonCodeV1),
      `investing_mandate_intent_plan_assessment_blocked:${reason}`,
    );
  }

  return {
    sourcePlan: sourcePlanMaterialized as {
      planId: string;
      planVersion: number;
      activatedAt: string;
      updatedAt: string;
      structuredSchemaVersion: 1;
      semanticFingerprint: string;
    },
    accountBaseCurrency: assessmentBaseCurrency,
    compatible: compatible as {
      objective: CanonicalInvestingMandateIntentObjectiveV1;
      riskProfile: CanonicalInvestingMandateIntentRiskProfileV1;
      horizon: null;
      baseCurrency: string;
      constraints: null;
    },
  };
}

function materializeExplicitIntent(value: unknown): CanonicalInvestingMandateIntentExplicitInputV1 {
  assertClosedDataRecord(value, INTENT_KEYS, "investing_mandate_intent_explicit_intent_closed_invalid");
  const objective = readDataField(value, "objective");
  const riskProfile = readDataField(value, "riskProfile");
  const horizon = readDataField(value, "horizon");

  assert(typeof objective === "string" && OBJECTIVES.has(objective), "investing_mandate_intent_objective_invalid");
  assert(typeof riskProfile === "string" && RISK_PROFILES.has(riskProfile), "investing_mandate_intent_risk_invalid");
  assert(typeof horizon === "string" && HORIZONS.has(horizon), "investing_mandate_intent_horizon_invalid");
  return {
    objective: objective as CanonicalInvestingMandateIntentObjectiveV1,
    riskProfile: riskProfile as CanonicalInvestingMandateIntentRiskProfileV1,
    horizon: horizon as CanonicalInvestingMandateIntentHorizonV1,
  };
}

function assertTemporalLineage(activatedAt: string, updatedAt: string, authoredAt: string) {
  assert(activatedAt <= updatedAt, "investing_mandate_intent_temporal_lineage_invalid");
  assert(updatedAt <= authoredAt, "investing_mandate_intent_temporal_lineage_invalid");
  assert(activatedAt <= authoredAt, "investing_mandate_intent_temporal_lineage_invalid");
}

function intentFingerprintInput(intent: Omit<CanonicalInvestingMandateIntentV1, "lineage"> & {
  readonly lineage: { readonly authoredAt: string };
}) {
  return {
    contractVersion: intent.contractVersion,
    authority: intent.authority,
    plan: {
      planId: intent.plan.planId,
      planVersion: String(intent.plan.planVersion),
      activatedAt: intent.plan.activatedAt,
      updatedAt: intent.plan.updatedAt,
      structuredSchemaVersion: String(intent.plan.structuredSchemaVersion),
      semanticFingerprint: intent.plan.semanticFingerprint,
    },
    intent: intent.intent,
    policy: {
      availability: intent.policy.availability,
      reason: intent.policy.reason,
    },
    lineage: {
      authoredAt: intent.lineage.authoredAt,
    },
  };
}

function hashCanonicalInvestingMandateIntentDraftV1(
  intent: Omit<CanonicalInvestingMandateIntentV1, "lineage"> & {
    readonly lineage: { readonly authoredAt: string };
  },
) {
  return canonicalSha256(intentFingerprintInput(intent));
}

export function hashCanonicalInvestingMandateIntentV1(intent: CanonicalInvestingMandateIntentV1) {
  return hashCanonicalInvestingMandateIntentDraftV1({
    ...intent,
    lineage: {
      authoredAt: intent.lineage.authoredAt,
    },
  });
}

export function sealCanonicalInvestingMandateIntentV1(
  input: CanonicalInvestingMandateIntentInputV1,
): CanonicalInvestingMandateIntentV1 {
  assertClosedDataRecord(input, ROOT_INPUT_KEYS, "investing_mandate_intent_input_closed_invalid");

  const tenant = materializeTenant(readDataField(input, "tenant"));
  const account = materializeAccount(readDataField(input, "account"));
  const assessment = materializePlanAssessment(readDataField(input, "planAssessment"));
  const explicitIntent = materializeExplicitIntent(readDataField(input, "intent"));
  const authoredAt = readDataField(input, "authoredAt");
  assertTimestamp(authoredAt, "investing_mandate_intent_authored_at_invalid");

  assert(tenant.userId === account.userId, "investing_mandate_intent_account_user_mismatch");
  assert(tenant.userId === account.ownerUserId, "investing_mandate_intent_account_owner_mismatch");
  assert(tenant.tenantId === account.tenantId, "investing_mandate_intent_account_tenant_mismatch");
  assert(account.baseCurrency === assessment.accountBaseCurrency, "investing_mandate_intent_account_assessment_currency_mismatch");
  assert(
    assessment.compatible.objective === explicitIntent.objective,
    "investing_mandate_intent_objective_plan_mismatch",
  );
  assert(
    assessment.compatible.riskProfile === explicitIntent.riskProfile,
    "investing_mandate_intent_risk_plan_mismatch",
  );
  assertTemporalLineage(assessment.sourcePlan.activatedAt, assessment.sourcePlan.updatedAt, authoredAt);

  const draft = {
    contractVersion: CANONICAL_INVESTING_MANDATE_INTENT_CONTRACT_VERSION,
    authority: {
      userId: tenant.userId,
      tenantId: tenant.tenantId,
      membershipId: tenant.membershipId,
      portfolioId: account.portfolioId,
      accountId: account.id,
      environment: account.environment,
      accountBaseCurrency: account.baseCurrency,
    },
    plan: assessment.sourcePlan,
    intent: explicitIntent,
    policy: {
      availability: "UNAVAILABLE",
      reason: "canonical_policy_methodology_not_accepted",
      declarations: null,
    },
    lineage: {
      authoredAt,
    },
  } satisfies Omit<CanonicalInvestingMandateIntentV1, "lineage"> & {
    readonly lineage: { readonly authoredAt: string };
  };

  const sealed = {
    ...draft,
    lineage: {
      authoredAt,
      intentFingerprint: hashCanonicalInvestingMandateIntentDraftV1(draft),
    },
  } satisfies CanonicalInvestingMandateIntentV1;

  assert(
    hashCanonicalInvestingMandateIntentV1(sealed) === sealed.lineage.intentFingerprint,
    "investing_mandate_intent_fingerprint_mismatch",
  );
  return deepFreezeCanonical(sealed) as CanonicalInvestingMandateIntentV1;
}
