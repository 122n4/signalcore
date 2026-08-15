import {
  CANONICAL_INVESTING_MANDATE_INTENT_CONTRACT_VERSION,
  hashCanonicalInvestingMandateIntentV1,
  type CanonicalInvestingMandateIntentHorizonV1,
  type CanonicalInvestingMandateIntentObjectiveV1,
  type CanonicalInvestingMandateIntentRiskProfileV1,
  type CanonicalInvestingMandateIntentV1,
} from "@/lib/investing/authority/mandateIntent";
import {
  canonicalSha256,
  deepFreezeCanonical,
  normalizeIsoTimestamp,
  type CanonicalDecimal,
} from "@/lib/investing/engine/v1/canonical";
import {
  INVESTING_TECHNICAL_POLICY_DEFINITION_HASH_V1,
  TECHNICAL_INVESTING_POLICY_VERSION_V1,
  type TechnicalInvestingPolicyMetricV1,
} from "@/lib/investing/engine/v1/policyDefinition";

export const CANONICAL_INVESTING_POLICY_METHODOLOGY_ASSESSMENT_CONTRACT_VERSION =
  "canonical-investing-policy-methodology-assessment/v1" as const;

export const CANONICAL_INVESTING_POLICY_METHODOLOGY_REASON_CODES = [
  "CANONICAL_POLICY_METHODOLOGY_NOT_ACCEPTED",
  "ENGINE_TECHNICAL_POLICY_NOT_FINANCIAL_AUTHORITY",
  "PLAN_GUARDRAIL_MAPPING_NOT_ACCEPTED",
] as const;

export type CanonicalInvestingPolicyMethodologyReasonCodeV1 =
  (typeof CANONICAL_INVESTING_POLICY_METHODOLOGY_REASON_CODES)[number];

export type CanonicalInvestingPolicyMetricV1 = TechnicalInvestingPolicyMetricV1;

export type CanonicalInvestingPolicyLimitScopeV1 =
  | "instrument"
  | "asset_class"
  | "currency"
  | "cash"
  | "total_exposure"
  | "risk_score";

export type CanonicalInvestingPolicyDeclarationV1 = {
  readonly metric: CanonicalInvestingPolicyMetricV1;
  readonly scope: CanonicalInvestingPolicyLimitScopeV1;
  readonly subject: string | null;
  readonly kind: "hard" | "soft";
  readonly limit: CanonicalDecimal;
};

export const CANONICAL_INVESTING_POLICY_DECLARATION_FIELDS = [
  "metric",
  "scope",
  "subject",
  "kind",
  "limit",
] as const;

export type CanonicalInvestingPolicyMethodologyAssessmentInputV1 = {
  readonly intent: CanonicalInvestingMandateIntentV1;
  readonly assessedAt: string;
};

export type CanonicalInvestingPolicyMethodologyAssessmentV1 = {
  readonly contractVersion: typeof CANONICAL_INVESTING_POLICY_METHODOLOGY_ASSESSMENT_CONTRACT_VERSION;
  readonly intent: {
    readonly intentFingerprint: string;
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
    readonly declaredIntent: {
      readonly objective: CanonicalInvestingMandateIntentObjectiveV1;
      readonly riskProfile: CanonicalInvestingMandateIntentRiskProfileV1;
      readonly horizon: CanonicalInvestingMandateIntentHorizonV1;
    };
  };
  readonly technicalPolicyIdentity: {
    readonly policyVersion: typeof TECHNICAL_INVESTING_POLICY_VERSION_V1;
    readonly definitionHash: string;
    readonly classification: "TECHNICAL_ENGINE_POLICY";
    readonly financialAuthority: "NOT_ACCEPTED";
  };
  readonly methodology: {
    readonly availability: "UNAVAILABLE";
    readonly reasonCodes: readonly CanonicalInvestingPolicyMethodologyReasonCodeV1[];
    readonly specification: null;
    readonly declarations: null;
  };
  readonly assessedAt: string;
  readonly assessmentFingerprint: string;
};

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const SHA256_LOWERCASE_PATTERN = /^[a-f0-9]{64}$/;

const ROOT_INPUT_KEYS = ["intent", "assessedAt"] as const;
const INTENT_ROOT_KEYS = ["contractVersion", "authority", "plan", "intent", "policy", "lineage"] as const;
const AUTHORITY_KEYS = [
  "userId",
  "tenantId",
  "membershipId",
  "portfolioId",
  "accountId",
  "environment",
  "accountBaseCurrency",
] as const;
const PLAN_KEYS = [
  "planId",
  "planVersion",
  "activatedAt",
  "updatedAt",
  "structuredSchemaVersion",
  "semanticFingerprint",
] as const;
const INTENT_KEYS = ["objective", "riskProfile", "horizon"] as const;
const POLICY_KEYS = ["availability", "reason", "declarations"] as const;
const LINEAGE_KEYS = ["authoredAt", "intentFingerprint"] as const;

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

function assertSha256(value: unknown, code: string): asserts value is string {
  assert(typeof value === "string" && SHA256_LOWERCASE_PATTERN.test(value), code);
}

function assertTimestamp(value: unknown, code: string): asserts value is string {
  assert(typeof value === "string", code);
  assert(normalizeIsoTimestamp(value) === value, code);
}

function assertSafePositiveVersion(value: unknown): asserts value is number {
  assert(
    typeof value === "number" &&
      Number.isFinite(value) &&
      Number.isSafeInteger(value) &&
      value > 0,
    "investing_policy_methodology_plan_version_invalid",
  );
}

function materializeIntent(value: unknown): CanonicalInvestingMandateIntentV1 {
  assertClosedDataRecord(value, INTENT_ROOT_KEYS, "investing_policy_methodology_intent_closed_invalid");
  assert(
    readDataField(value, "contractVersion") === CANONICAL_INVESTING_MANDATE_INTENT_CONTRACT_VERSION,
    "investing_policy_methodology_intent_contract_invalid",
  );

  const authority = readDataField(value, "authority");
  assertClosedDataRecord(authority, AUTHORITY_KEYS, "investing_policy_methodology_authority_closed_invalid");
  const authorityMaterialized = {
    userId: readDataField(authority, "userId"),
    tenantId: readDataField(authority, "tenantId"),
    membershipId: readDataField(authority, "membershipId"),
    portfolioId: readDataField(authority, "portfolioId"),
    accountId: readDataField(authority, "accountId"),
    environment: readDataField(authority, "environment"),
    accountBaseCurrency: readDataField(authority, "accountBaseCurrency"),
  };
  assertId(authorityMaterialized.userId, "investing_policy_methodology_user_id_invalid");
  assertId(authorityMaterialized.tenantId, "investing_policy_methodology_tenant_id_invalid");
  assertId(authorityMaterialized.membershipId, "investing_policy_methodology_membership_id_invalid");
  assertId(authorityMaterialized.portfolioId, "investing_policy_methodology_portfolio_id_invalid");
  assertId(authorityMaterialized.accountId, "investing_policy_methodology_account_id_invalid");
  assert(
    authorityMaterialized.environment === "paper" || authorityMaterialized.environment === "simulation",
    "investing_policy_methodology_environment_invalid",
  );
  assertCurrency(authorityMaterialized.accountBaseCurrency, "investing_policy_methodology_currency_invalid");

  const plan = readDataField(value, "plan");
  assertClosedDataRecord(plan, PLAN_KEYS, "investing_policy_methodology_plan_closed_invalid");
  const planMaterialized = {
    planId: readDataField(plan, "planId"),
    planVersion: readDataField(plan, "planVersion"),
    activatedAt: readDataField(plan, "activatedAt"),
    updatedAt: readDataField(plan, "updatedAt"),
    structuredSchemaVersion: readDataField(plan, "structuredSchemaVersion"),
    semanticFingerprint: readDataField(plan, "semanticFingerprint"),
  };
  assertId(planMaterialized.planId, "investing_policy_methodology_plan_id_invalid");
  assertSafePositiveVersion(planMaterialized.planVersion);
  assertTimestamp(planMaterialized.activatedAt, "investing_policy_methodology_plan_activated_at_invalid");
  assertTimestamp(planMaterialized.updatedAt, "investing_policy_methodology_plan_updated_at_invalid");
  assert(
    planMaterialized.structuredSchemaVersion === 1,
    "investing_policy_methodology_plan_schema_invalid",
  );
  assertSha256(
    planMaterialized.semanticFingerprint,
    "investing_policy_methodology_plan_semantic_fingerprint_invalid",
  );

  const intent = readDataField(value, "intent");
  assertClosedDataRecord(intent, INTENT_KEYS, "investing_policy_methodology_declared_intent_closed_invalid");
  const declaredIntent = {
    objective: readDataField(intent, "objective"),
    riskProfile: readDataField(intent, "riskProfile"),
    horizon: readDataField(intent, "horizon"),
  };
  assert(
    typeof declaredIntent.objective === "string" && OBJECTIVES.has(declaredIntent.objective),
    "investing_policy_methodology_objective_invalid",
  );
  assert(
    typeof declaredIntent.riskProfile === "string" && RISK_PROFILES.has(declaredIntent.riskProfile),
    "investing_policy_methodology_risk_invalid",
  );
  assert(
    typeof declaredIntent.horizon === "string" && HORIZONS.has(declaredIntent.horizon),
    "investing_policy_methodology_horizon_invalid",
  );

  const policy = readDataField(value, "policy");
  assertClosedDataRecord(policy, POLICY_KEYS, "investing_policy_methodology_intent_policy_closed_invalid");
  assert(
    readDataField(policy, "availability") === "UNAVAILABLE",
    "investing_policy_methodology_intent_policy_availability_invalid",
  );
  assert(
    readDataField(policy, "reason") === "canonical_policy_methodology_not_accepted",
    "investing_policy_methodology_intent_policy_reason_invalid",
  );
  assert(
    readDataField(policy, "declarations") === null,
    "investing_policy_methodology_intent_policy_declarations_invalid",
  );

  const lineage = readDataField(value, "lineage");
  assertClosedDataRecord(lineage, LINEAGE_KEYS, "investing_policy_methodology_lineage_closed_invalid");
  const authoredAt = readDataField(lineage, "authoredAt");
  const intentFingerprint = readDataField(lineage, "intentFingerprint");
  assertTimestamp(authoredAt, "investing_policy_methodology_authored_at_invalid");
  assertSha256(intentFingerprint, "investing_policy_methodology_intent_fingerprint_invalid");

  const materialized = {
    contractVersion: CANONICAL_INVESTING_MANDATE_INTENT_CONTRACT_VERSION,
    authority: authorityMaterialized as CanonicalInvestingMandateIntentV1["authority"],
    plan: planMaterialized as CanonicalInvestingMandateIntentV1["plan"],
    intent: declaredIntent as CanonicalInvestingMandateIntentV1["intent"],
    policy: {
      availability: "UNAVAILABLE",
      reason: "canonical_policy_methodology_not_accepted",
      declarations: null,
    },
    lineage: {
      authoredAt,
      intentFingerprint,
    },
  } satisfies CanonicalInvestingMandateIntentV1;

  assert(
    hashCanonicalInvestingMandateIntentV1(materialized) === materialized.lineage.intentFingerprint,
    "investing_policy_methodology_intent_fingerprint_mismatch",
  );
  return materialized;
}

function assessmentFingerprintInput(
  assessment: Omit<CanonicalInvestingPolicyMethodologyAssessmentV1, "assessmentFingerprint">,
) {
  return {
    ...assessment,
    intent: {
      ...assessment.intent,
      plan: {
        ...assessment.intent.plan,
        planVersion: String(assessment.intent.plan.planVersion),
        structuredSchemaVersion: String(assessment.intent.plan.structuredSchemaVersion),
      },
    },
  };
}

export function hashCanonicalInvestingPolicyMethodologyAssessmentV1(
  assessment:
    | CanonicalInvestingPolicyMethodologyAssessmentV1
    | Omit<CanonicalInvestingPolicyMethodologyAssessmentV1, "assessmentFingerprint">,
) {
  const hashable: Record<string, unknown> = { ...assessment };
  delete hashable.assessmentFingerprint;
  return canonicalSha256(
    assessmentFingerprintInput(
      hashable as Omit<CanonicalInvestingPolicyMethodologyAssessmentV1, "assessmentFingerprint">,
    ),
  );
}

export function assessCanonicalInvestingPolicyMethodologyV1(
  input: CanonicalInvestingPolicyMethodologyAssessmentInputV1,
): CanonicalInvestingPolicyMethodologyAssessmentV1 {
  assertClosedDataRecord(input, ROOT_INPUT_KEYS, "investing_policy_methodology_input_closed_invalid");
  const intent = materializeIntent(readDataField(input, "intent"));
  const assessedAt = readDataField(input, "assessedAt");
  assertTimestamp(assessedAt, "investing_policy_methodology_assessed_at_invalid");

  const draft = {
    contractVersion: CANONICAL_INVESTING_POLICY_METHODOLOGY_ASSESSMENT_CONTRACT_VERSION,
    intent: {
      intentFingerprint: intent.lineage.intentFingerprint,
      authority: intent.authority,
      plan: intent.plan,
      declaredIntent: intent.intent,
    },
    technicalPolicyIdentity: {
      policyVersion: TECHNICAL_INVESTING_POLICY_VERSION_V1,
      definitionHash: INVESTING_TECHNICAL_POLICY_DEFINITION_HASH_V1,
      classification: "TECHNICAL_ENGINE_POLICY",
      financialAuthority: "NOT_ACCEPTED",
    },
    methodology: {
      availability: "UNAVAILABLE",
      reasonCodes: CANONICAL_INVESTING_POLICY_METHODOLOGY_REASON_CODES,
      specification: null,
      declarations: null,
    },
    assessedAt,
  } satisfies Omit<CanonicalInvestingPolicyMethodologyAssessmentV1, "assessmentFingerprint">;

  const assessment = {
    ...draft,
    assessmentFingerprint: hashCanonicalInvestingPolicyMethodologyAssessmentV1(draft),
  } satisfies CanonicalInvestingPolicyMethodologyAssessmentV1;

  return deepFreezeCanonical(assessment) as CanonicalInvestingPolicyMethodologyAssessmentV1;
}
