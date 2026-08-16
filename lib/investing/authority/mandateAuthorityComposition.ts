import {
  CANONICAL_INVESTING_MANDATE_INTENT_CONTRACT_VERSION,
  hashCanonicalInvestingMandateIntentV1,
  type CanonicalInvestingMandateIntentHorizonV1,
  type CanonicalInvestingMandateIntentObjectiveV1,
  type CanonicalInvestingMandateIntentRiskProfileV1,
  type CanonicalInvestingMandateIntentV1,
} from "@/lib/investing/authority/mandateIntent";
import {
  assessCanonicalInvestingPolicyMethodologyV1,
  type CanonicalInvestingPolicyMethodologyAssessmentV1,
} from "@/lib/investing/authority/policyMethodology";
import {
  CANONICAL_PLAN_TO_MANDATE_TRANSLATION_CONTRACT_VERSION,
  CANONICAL_PLAN_TO_MANDATE_TRANSLATION_REASON_CODES,
  hashCanonicalPlanToMandateTranslationAssessmentV1,
  type CanonicalPlanToMandateTranslationAssessmentV1,
  type CanonicalPlanToMandateTranslationReasonCodeV1,
} from "@/lib/investing/authority/planToMandateTranslation";
import {
  assessCanonicalInvestingRecommendationSuitabilityAuthorityV1,
  type CanonicalInvestingRecommendationSuitabilityAuthorityV1,
} from "@/lib/investing/authority/recommendationSuitabilityAuthority";
import {
  assessCanonicalInvestingSuitabilityEvidenceAuthorityV1,
  type CanonicalInvestingSuitabilityEvidenceAuthorityV1,
} from "@/lib/investing/authority/suitabilityEvidenceAuthority";
import {
  assessCanonicalInvestingSuitabilityReadinessV1,
  type CanonicalInvestingSuitabilityReadinessV1,
} from "@/lib/investing/authority/suitabilityReadiness";
import {
  canonicalSha256,
  deepFreezeCanonical,
  normalizeIsoTimestamp,
} from "@/lib/investing/engine/v1/canonical";

export const CANONICAL_INVESTING_MANDATE_AUTHORITY_COMPOSITION_CONTRACT_VERSION =
  "canonical-investing-mandate-authority-composition/v1" as const;

export const CANONICAL_INVESTING_MANDATE_AUTHORITY_COMPOSITION_REASON_CODES = Object.freeze([
  "CANONICAL_MANDATE_AUTHORITY_NOT_ACCEPTED",
  "PLAN_TO_MANDATE_TRANSLATION_UNAVAILABLE",
  "FINANCIAL_POLICY_METHODOLOGY_AUTHORITY_UNAVAILABLE",
  "RECOMMENDATION_SUITABILITY_AUTHORITY_NOT_ACCEPTED",
  "CANONICAL_MANDATE_NOT_COMPOSED",
] as const);

export type CanonicalInvestingMandateAuthorityCompositionReasonCodeV1 =
  (typeof CANONICAL_INVESTING_MANDATE_AUTHORITY_COMPOSITION_REASON_CODES)[number];

export type CanonicalInvestingMandateAuthorityCompositionInputV1 = {
  readonly planTranslationAssessment: CanonicalPlanToMandateTranslationAssessmentV1;
  readonly intent: CanonicalInvestingMandateIntentV1;
  readonly policyMethodologyAssessment: CanonicalInvestingPolicyMethodologyAssessmentV1;
  readonly suitabilityReadiness: CanonicalInvestingSuitabilityReadinessV1;
  readonly suitabilityEvidenceAuthority: CanonicalInvestingSuitabilityEvidenceAuthorityV1;
  readonly recommendationSuitabilityAuthority: CanonicalInvestingRecommendationSuitabilityAuthorityV1;
  readonly assessedAt: string;
};

export type CanonicalInvestingMandateAuthorityCompositionV1 = {
  readonly contractVersion: typeof CANONICAL_INVESTING_MANDATE_AUTHORITY_COMPOSITION_CONTRACT_VERSION;
  readonly authority: {
    readonly userId: string;
    readonly tenantId: string;
    readonly membershipId: string;
    readonly portfolioId: string;
    readonly accountId: string;
    readonly environment: "paper" | "simulation";
    readonly accountBaseCurrency: string;
  };
  readonly lineage: {
    readonly planId: string;
    readonly planVersion: number;
    readonly activatedAt: string;
    readonly updatedAt: string;
    readonly structuredSchemaVersion: 1;
    readonly planSemanticFingerprint: string;
    readonly planToMandateTranslationFingerprint: string;
    readonly intentFingerprint: string;
    readonly policyMethodologyAssessmentFingerprint: string;
    readonly suitabilityReadinessAssessmentFingerprint: string;
    readonly suitabilityEvidenceAuthorityFingerprint: string;
    readonly recommendationSuitabilityAuthorityFingerprint: string;
  };
  readonly knownIntent: {
    readonly objective: CanonicalInvestingMandateIntentObjectiveV1;
    readonly riskProfile: CanonicalInvestingMandateIntentRiskProfileV1;
    readonly horizon: CanonicalInvestingMandateIntentHorizonV1;
  };
  readonly compositionBasis: {
    readonly planToMandateTranslation: {
      readonly availability: "UNAVAILABLE";
      readonly mandate: null;
    };
    readonly policyMethodology: {
      readonly availability: "UNAVAILABLE";
      readonly financialAuthority: "NOT_ACCEPTED";
      readonly declarations: null;
    };
    readonly recommendationSuitability: {
      readonly availability: "UNAVAILABLE";
      readonly authority: "NOT_ACCEPTED";
      readonly determination: null;
    };
  };
  readonly mandateAuthority: {
    readonly availability: "UNAVAILABLE";
    readonly authority: "NOT_ACCEPTED";
    readonly mandate: null;
    readonly reasonCodes: readonly CanonicalInvestingMandateAuthorityCompositionReasonCodeV1[];
  };
  readonly assessedAt: string;
  readonly compositionFingerprint: string;
};

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const SHA256_LOWERCASE_PATTERN = /^[a-f0-9]{64}$/;

const ROOT_INPUT_KEYS = [
  "planTranslationAssessment",
  "intent",
  "policyMethodologyAssessment",
  "suitabilityReadiness",
  "suitabilityEvidenceAuthority",
  "recommendationSuitabilityAuthority",
  "assessedAt",
] as const;
const PLAN_TRANSLATION_ROOT_KEYS = [
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
const TRANSLATION_ACCOUNT_KEYS = ["baseCurrency"] as const;
const COMPATIBLE_SEMANTICS_KEYS = ["objective", "riskProfile", "horizon", "baseCurrency", "constraints"] as const;
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
const INTENT_POLICY_KEYS = ["availability", "reason", "declarations"] as const;
const INTENT_LINEAGE_KEYS = ["authoredAt", "intentFingerprint"] as const;

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
  // This boundary validates ordinary sealed data arrays after a serialization boundary.
  // It does not claim generic immunity to arbitrary Proxy reflective traps.
  assert(Array.isArray(value), code);
  assert(Object.getPrototypeOf(value) === Array.prototype, code);
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

function readRequiredDataField(value: unknown, key: string, code: string) {
  assert(isPlainRecordShape(value), code);
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  assert(Boolean(descriptor) && descriptor.enumerable === true && "value" in descriptor, code);
  return descriptor.value;
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

function assertSafePositiveVersion(value: unknown, code: string): asserts value is number {
  assert(
    typeof value === "number" &&
      Number.isFinite(value) &&
      Number.isSafeInteger(value) &&
      value > 0,
    code,
  );
}

function materializeStringArray(value: unknown, code: string) {
  assertClosedDataArray(value, code);
  const output: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    assert(Boolean(descriptor) && descriptor.enumerable === true && "value" in descriptor, code);
    const entry = descriptor.value;
    assert(typeof entry === "string", code);
    output.push(entry);
  }
  return output;
}

function materializeAuthority(value: unknown, codePrefix: string): CanonicalInvestingMandateIntentV1["authority"] {
  assertClosedDataRecord(value, AUTHORITY_KEYS, `${codePrefix}_authority_closed_invalid`);
  const authority = {
    userId: readDataField(value, "userId"),
    tenantId: readDataField(value, "tenantId"),
    membershipId: readDataField(value, "membershipId"),
    portfolioId: readDataField(value, "portfolioId"),
    accountId: readDataField(value, "accountId"),
    environment: readDataField(value, "environment"),
    accountBaseCurrency: readDataField(value, "accountBaseCurrency"),
  };
  assertId(authority.userId, `${codePrefix}_user_id_invalid`);
  assertId(authority.tenantId, `${codePrefix}_tenant_id_invalid`);
  assertId(authority.membershipId, `${codePrefix}_membership_id_invalid`);
  assertId(authority.portfolioId, `${codePrefix}_portfolio_id_invalid`);
  assertId(authority.accountId, `${codePrefix}_account_id_invalid`);
  assert(authority.environment === "paper" || authority.environment === "simulation", `${codePrefix}_environment_invalid`);
  assertCurrency(authority.accountBaseCurrency, `${codePrefix}_currency_invalid`);
  return authority as CanonicalInvestingMandateIntentV1["authority"];
}

function materializePlan(value: unknown, codePrefix: string): CanonicalInvestingMandateIntentV1["plan"] {
  assertClosedDataRecord(value, PLAN_KEYS, `${codePrefix}_plan_closed_invalid`);
  const plan = {
    planId: readDataField(value, "planId"),
    planVersion: readDataField(value, "planVersion"),
    activatedAt: readDataField(value, "activatedAt"),
    updatedAt: readDataField(value, "updatedAt"),
    structuredSchemaVersion: readDataField(value, "structuredSchemaVersion"),
    semanticFingerprint: readDataField(value, "semanticFingerprint"),
  };
  assertId(plan.planId, `${codePrefix}_plan_id_invalid`);
  assertSafePositiveVersion(plan.planVersion, `${codePrefix}_plan_version_invalid`);
  assertTimestamp(plan.activatedAt, `${codePrefix}_plan_activated_at_invalid`);
  assertTimestamp(plan.updatedAt, `${codePrefix}_plan_updated_at_invalid`);
  assert(plan.structuredSchemaVersion === 1, `${codePrefix}_plan_schema_invalid`);
  assertSha256(plan.semanticFingerprint, `${codePrefix}_plan_semantic_fingerprint_invalid`);
  return plan as CanonicalInvestingMandateIntentV1["plan"];
}

function materializeKnownIntent(value: unknown, codePrefix: string): CanonicalInvestingMandateIntentV1["intent"] {
  assertClosedDataRecord(value, INTENT_KEYS, `${codePrefix}_intent_closed_invalid`);
  const intent = {
    objective: readDataField(value, "objective"),
    riskProfile: readDataField(value, "riskProfile"),
    horizon: readDataField(value, "horizon"),
  };
  assert(typeof intent.objective === "string" && OBJECTIVES.has(intent.objective), `${codePrefix}_objective_invalid`);
  assert(typeof intent.riskProfile === "string" && RISK_PROFILES.has(intent.riskProfile), `${codePrefix}_risk_invalid`);
  assert(typeof intent.horizon === "string" && HORIZONS.has(intent.horizon), `${codePrefix}_horizon_invalid`);
  return intent as CanonicalInvestingMandateIntentV1["intent"];
}

function materializeIntent(value: unknown): CanonicalInvestingMandateIntentV1 {
  assertClosedDataRecord(value, INTENT_ROOT_KEYS, "investing_mandate_authority_composition_intent_closed_invalid");
  assert(
    readDataField(value, "contractVersion") === CANONICAL_INVESTING_MANDATE_INTENT_CONTRACT_VERSION,
    "investing_mandate_authority_composition_intent_contract_invalid",
  );

  const policy = readDataField(value, "policy");
  assertClosedDataRecord(policy, INTENT_POLICY_KEYS, "investing_mandate_authority_composition_intent_policy_closed_invalid");
  assert(readDataField(policy, "availability") === "UNAVAILABLE", "investing_mandate_authority_composition_intent_policy_availability_invalid");
  assert(readDataField(policy, "reason") === "canonical_policy_methodology_not_accepted", "investing_mandate_authority_composition_intent_policy_reason_invalid");
  assert(readDataField(policy, "declarations") === null, "investing_mandate_authority_composition_intent_policy_declarations_invalid");

  const lineage = readDataField(value, "lineage");
  assertClosedDataRecord(lineage, INTENT_LINEAGE_KEYS, "investing_mandate_authority_composition_intent_lineage_closed_invalid");
  const authoredAt = readDataField(lineage, "authoredAt");
  const intentFingerprint = readDataField(lineage, "intentFingerprint");
  assertTimestamp(authoredAt, "investing_mandate_authority_composition_intent_authored_at_invalid");
  assertSha256(intentFingerprint, "investing_mandate_authority_composition_intent_fingerprint_invalid");

  const materialized = {
    contractVersion: CANONICAL_INVESTING_MANDATE_INTENT_CONTRACT_VERSION,
    authority: materializeAuthority(readDataField(value, "authority"), "investing_mandate_authority_composition_intent"),
    plan: materializePlan(readDataField(value, "plan"), "investing_mandate_authority_composition_intent"),
    intent: materializeKnownIntent(readDataField(value, "intent"), "investing_mandate_authority_composition_intent"),
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
    "investing_mandate_authority_composition_intent_fingerprint_mismatch",
  );
  return materialized;
}

function materializePlanTranslationAssessment(value: unknown): CanonicalPlanToMandateTranslationAssessmentV1 {
  assertClosedDataRecord(
    value,
    PLAN_TRANSLATION_ROOT_KEYS,
    "investing_mandate_authority_composition_plan_translation_closed_invalid",
  );
  assert(
    readDataField(value, "contractVersion") === CANONICAL_PLAN_TO_MANDATE_TRANSLATION_CONTRACT_VERSION,
    "investing_mandate_authority_composition_plan_translation_contract_invalid",
  );
  assert(readDataField(value, "availability") === "UNAVAILABLE", "investing_mandate_authority_composition_plan_translation_availability_invalid");
  assert(readDataField(value, "mandate") === null, "investing_mandate_authority_composition_plan_translation_mandate_invalid");

  const sourcePlan = readDataField(value, "sourcePlan");
  assertClosedDataRecord(sourcePlan, SOURCE_PLAN_KEYS, "investing_mandate_authority_composition_plan_translation_source_plan_closed_invalid");
  const sourcePlanMaterialized = {
    planId: readDataField(sourcePlan, "planId"),
    planVersion: readDataField(sourcePlan, "planVersion"),
    activatedAt: readDataField(sourcePlan, "activatedAt"),
    updatedAt: readDataField(sourcePlan, "updatedAt"),
    structuredSchemaVersion: readDataField(sourcePlan, "structuredSchemaVersion"),
    semanticFingerprint: readDataField(sourcePlan, "semanticFingerprint"),
  };
  assertId(sourcePlanMaterialized.planId, "investing_mandate_authority_composition_plan_translation_plan_id_invalid");
  assertSafePositiveVersion(sourcePlanMaterialized.planVersion, "investing_mandate_authority_composition_plan_translation_plan_version_invalid");
  assertTimestamp(sourcePlanMaterialized.activatedAt, "investing_mandate_authority_composition_plan_translation_plan_activated_at_invalid");
  assertTimestamp(sourcePlanMaterialized.updatedAt, "investing_mandate_authority_composition_plan_translation_plan_updated_at_invalid");
  assert(sourcePlanMaterialized.structuredSchemaVersion === 1, "investing_mandate_authority_composition_plan_translation_schema_invalid");
  assertSha256(sourcePlanMaterialized.semanticFingerprint, "investing_mandate_authority_composition_plan_translation_plan_semantic_fingerprint_invalid");

  const account = readDataField(value, "account");
  assertClosedDataRecord(account, TRANSLATION_ACCOUNT_KEYS, "investing_mandate_authority_composition_plan_translation_account_closed_invalid");
  const baseCurrency = readDataField(account, "baseCurrency");
  assertCurrency(baseCurrency, "investing_mandate_authority_composition_plan_translation_currency_invalid");

  const compatibleSemantics = readDataField(value, "compatibleSemantics");
  assertClosedDataRecord(
    compatibleSemantics,
    COMPATIBLE_SEMANTICS_KEYS,
    "investing_mandate_authority_composition_plan_translation_semantics_closed_invalid",
  );
  const objective = readDataField(compatibleSemantics, "objective");
  const riskProfile = readDataField(compatibleSemantics, "riskProfile");
  assert(typeof objective === "string" && OBJECTIVES.has(objective), "investing_mandate_authority_composition_plan_translation_objective_invalid");
  assert(typeof riskProfile === "string" && RISK_PROFILES.has(riskProfile), "investing_mandate_authority_composition_plan_translation_risk_invalid");
  assert(readDataField(compatibleSemantics, "horizon") === null, "investing_mandate_authority_composition_plan_translation_horizon_invalid");
  assert(readDataField(compatibleSemantics, "baseCurrency") === baseCurrency, "investing_mandate_authority_composition_plan_translation_currency_mismatch");
  assert(readDataField(compatibleSemantics, "constraints") === null, "investing_mandate_authority_composition_plan_translation_constraints_invalid");

  const reasonCodes = materializeStringArray(
    readDataField(value, "reasonCodes"),
    "investing_mandate_authority_composition_plan_translation_reason_codes_invalid",
  );
  const knownReasons = new Set(CANONICAL_PLAN_TO_MANDATE_TRANSLATION_REASON_CODES);
  assert(new Set(reasonCodes).size === reasonCodes.length, "investing_mandate_authority_composition_plan_translation_reason_codes_not_unique");
  const canonicalReasonCodes = CANONICAL_PLAN_TO_MANDATE_TRANSLATION_REASON_CODES.filter((reason) =>
    reasonCodes.includes(reason),
  );
  assert(
    canonicalReasonCodes.length === reasonCodes.length &&
      canonicalReasonCodes.every((reason, index) => reasonCodes[index] === reason),
    "investing_mandate_authority_composition_plan_translation_reason_codes_not_canonical",
  );
  assert(
    reasonCodes.includes("HORIZON_EXPLICIT_AUTHORING_REQUIRED"),
    "investing_mandate_authority_composition_plan_translation_horizon_reason_required",
  );
  for (const reason of reasonCodes) {
    assert(knownReasons.has(reason as CanonicalPlanToMandateTranslationReasonCodeV1), "investing_mandate_authority_composition_plan_translation_reason_code_unknown");
    assert(
      !DISALLOWED_PLAN_ASSESSMENT_REASONS.has(reason as CanonicalPlanToMandateTranslationReasonCodeV1),
      `investing_mandate_authority_composition_plan_translation_blocked:${reason}`,
    );
  }

  const translationFingerprint = readDataField(value, "translationFingerprint");
  assertSha256(translationFingerprint, "investing_mandate_authority_composition_plan_translation_fingerprint_invalid");

  const materialized = {
    contractVersion: CANONICAL_PLAN_TO_MANDATE_TRANSLATION_CONTRACT_VERSION,
    sourcePlan: sourcePlanMaterialized as CanonicalPlanToMandateTranslationAssessmentV1["sourcePlan"],
    account: {
      baseCurrency,
    },
    availability: "UNAVAILABLE",
    reasonCodes: reasonCodes as readonly CanonicalPlanToMandateTranslationReasonCodeV1[],
    compatibleSemantics: {
      objective: objective as CanonicalInvestingMandateIntentObjectiveV1,
      riskProfile: riskProfile as CanonicalInvestingMandateIntentRiskProfileV1,
      horizon: null,
      baseCurrency,
      constraints: null,
    },
    mandate: null,
    translationFingerprint,
  } satisfies CanonicalPlanToMandateTranslationAssessmentV1;

  assert(
    hashCanonicalPlanToMandateTranslationAssessmentV1(materialized) === materialized.translationFingerprint,
    "investing_mandate_authority_composition_plan_translation_fingerprint_mismatch",
  );
  return materialized;
}

function assertCanonicalDataEqual(actual: unknown, expected: unknown, code: string, path = "$"): void {
  if (expected === null || typeof expected !== "object") {
    assert(actual === expected, `${code}:${path}`);
    return;
  }

  if (Array.isArray(expected)) {
    assertClosedDataArray(actual, `${code}:${path}`);
    assert(actual.length === expected.length, `${code}:${path}`);
    const descriptors = Object.getOwnPropertyDescriptors(actual);
    for (let index = 0; index < expected.length; index += 1) {
      const descriptor = descriptors[String(index)];
      assert(Boolean(descriptor) && descriptor.enumerable === true && "value" in descriptor, `${code}:${path}`);
      assertCanonicalDataEqual(descriptor.value, expected[index], code, `${path}[${index}]`);
    }
    return;
  }

  assert(isPlainRecordShape(expected), `${code}:${path}`);
  const expectedKeys = Object.keys(expected);
  assertClosedDataRecord(actual, expectedKeys, `${code}:${path}`);
  for (const key of expectedKeys) {
    assertCanonicalDataEqual(readDataField(actual, key), (expected as Record<string, unknown>)[key], code, `${path}.${key}`);
  }
}

function assertSame(value: unknown, expected: unknown, code: string) {
  assert(value === expected, code);
}

function assertAuthorityConsistency(
  intent: CanonicalInvestingMandateIntentV1,
  policy: CanonicalInvestingPolicyMethodologyAssessmentV1,
  readiness: CanonicalInvestingSuitabilityReadinessV1,
  evidenceAuthority: CanonicalInvestingSuitabilityEvidenceAuthorityV1,
  recommendation: CanonicalInvestingRecommendationSuitabilityAuthorityV1,
) {
  for (const key of AUTHORITY_KEYS) {
    assertSame(policy.intent.authority[key], intent.authority[key], `investing_mandate_authority_composition_${key}_mismatch`);
    assertSame(readiness.authority[key], intent.authority[key], `investing_mandate_authority_composition_${key}_mismatch`);
    assertSame(evidenceAuthority.authority[key], intent.authority[key], `investing_mandate_authority_composition_${key}_mismatch`);
    assertSame(recommendation.authority[key], intent.authority[key], `investing_mandate_authority_composition_${key}_mismatch`);
  }
}

function assertPlanTranslationConsistency(
  translation: CanonicalPlanToMandateTranslationAssessmentV1,
  intent: CanonicalInvestingMandateIntentV1,
) {
  assertSame(translation.sourcePlan.planId, intent.plan.planId, "investing_mandate_authority_composition_translation_plan_id_mismatch");
  assertSame(translation.sourcePlan.planVersion, intent.plan.planVersion, "investing_mandate_authority_composition_translation_plan_version_mismatch");
  assertSame(translation.sourcePlan.activatedAt, intent.plan.activatedAt, "investing_mandate_authority_composition_translation_plan_activated_at_mismatch");
  assertSame(translation.sourcePlan.updatedAt, intent.plan.updatedAt, "investing_mandate_authority_composition_translation_plan_updated_at_mismatch");
  assertSame(translation.sourcePlan.structuredSchemaVersion, intent.plan.structuredSchemaVersion, "investing_mandate_authority_composition_translation_plan_schema_mismatch");
  assertSame(translation.sourcePlan.semanticFingerprint, intent.plan.semanticFingerprint, "investing_mandate_authority_composition_translation_plan_semantic_fingerprint_mismatch");
  assertSame(translation.account.baseCurrency, intent.authority.accountBaseCurrency, "investing_mandate_authority_composition_translation_currency_mismatch");
  assertSame(translation.compatibleSemantics.objective, intent.intent.objective, "investing_mandate_authority_composition_translation_objective_mismatch");
  assertSame(translation.compatibleSemantics.riskProfile, intent.intent.riskProfile, "investing_mandate_authority_composition_translation_risk_profile_mismatch");
  assertSame(translation.compatibleSemantics.horizon, null, "investing_mandate_authority_composition_translation_horizon_mismatch");
  assertSame(translation.compatibleSemantics.constraints, null, "investing_mandate_authority_composition_translation_constraints_mismatch");
}

function assertPlanLineageConsistency(
  intent: CanonicalInvestingMandateIntentV1,
  policy: CanonicalInvestingPolicyMethodologyAssessmentV1,
  readiness: CanonicalInvestingSuitabilityReadinessV1,
  evidenceAuthority: CanonicalInvestingSuitabilityEvidenceAuthorityV1,
  recommendation: CanonicalInvestingRecommendationSuitabilityAuthorityV1,
) {
  assertSame(policy.intent.intentFingerprint, intent.lineage.intentFingerprint, "investing_mandate_authority_composition_b2a_intent_fingerprint_lineage_mismatch");
  assertSame(readiness.lineage.intentFingerprint, intent.lineage.intentFingerprint, "investing_mandate_authority_composition_b2b1_intent_fingerprint_lineage_mismatch");
  assertSame(readiness.lineage.policyMethodologyAssessmentFingerprint, policy.assessmentFingerprint, "investing_mandate_authority_composition_b2b1_policy_fingerprint_lineage_mismatch");
  assertSame(evidenceAuthority.lineage.intentFingerprint, intent.lineage.intentFingerprint, "investing_mandate_authority_composition_b2b2_intent_fingerprint_lineage_mismatch");
  assertSame(evidenceAuthority.lineage.policyMethodologyAssessmentFingerprint, policy.assessmentFingerprint, "investing_mandate_authority_composition_b2b2_policy_fingerprint_lineage_mismatch");
  assertSame(evidenceAuthority.lineage.suitabilityReadinessAssessmentFingerprint, readiness.assessmentFingerprint, "investing_mandate_authority_composition_b2b2_readiness_fingerprint_lineage_mismatch");
  assertSame(recommendation.lineage.intentFingerprint, intent.lineage.intentFingerprint, "investing_mandate_authority_composition_b2b3_intent_fingerprint_lineage_mismatch");
  assertSame(recommendation.lineage.policyMethodologyAssessmentFingerprint, policy.assessmentFingerprint, "investing_mandate_authority_composition_b2b3_policy_fingerprint_lineage_mismatch");
  assertSame(recommendation.lineage.suitabilityReadinessAssessmentFingerprint, readiness.assessmentFingerprint, "investing_mandate_authority_composition_b2b3_readiness_fingerprint_lineage_mismatch");
  assertSame(recommendation.lineage.suitabilityEvidenceAuthorityFingerprint, evidenceAuthority.evidenceAuthorityFingerprint, "investing_mandate_authority_composition_b2b3_evidence_fingerprint_lineage_mismatch");

  for (const lineage of [readiness.lineage, evidenceAuthority.lineage, recommendation.lineage]) {
    assertSame(lineage.planId, intent.plan.planId, "investing_mandate_authority_composition_plan_id_mismatch");
    assertSame(lineage.planVersion, intent.plan.planVersion, "investing_mandate_authority_composition_plan_version_mismatch");
    assertSame(lineage.activatedAt, intent.plan.activatedAt, "investing_mandate_authority_composition_plan_activated_at_mismatch");
    assertSame(lineage.updatedAt, intent.plan.updatedAt, "investing_mandate_authority_composition_plan_updated_at_mismatch");
    assertSame(lineage.structuredSchemaVersion, intent.plan.structuredSchemaVersion, "investing_mandate_authority_composition_plan_schema_mismatch");
    assertSame(lineage.planSemanticFingerprint, intent.plan.semanticFingerprint, "investing_mandate_authority_composition_plan_semantic_fingerprint_mismatch");
  }

  assertSame(policy.intent.plan.planId, intent.plan.planId, "investing_mandate_authority_composition_plan_id_mismatch");
  assertSame(policy.intent.plan.planVersion, intent.plan.planVersion, "investing_mandate_authority_composition_plan_version_mismatch");
  assertSame(policy.intent.plan.activatedAt, intent.plan.activatedAt, "investing_mandate_authority_composition_plan_activated_at_mismatch");
  assertSame(policy.intent.plan.updatedAt, intent.plan.updatedAt, "investing_mandate_authority_composition_plan_updated_at_mismatch");
  assertSame(policy.intent.plan.structuredSchemaVersion, intent.plan.structuredSchemaVersion, "investing_mandate_authority_composition_plan_schema_mismatch");
  assertSame(policy.intent.plan.semanticFingerprint, intent.plan.semanticFingerprint, "investing_mandate_authority_composition_plan_semantic_fingerprint_mismatch");
}

function assertKnownIntentConsistency(
  intent: CanonicalInvestingMandateIntentV1,
  policy: CanonicalInvestingPolicyMethodologyAssessmentV1,
  readiness: CanonicalInvestingSuitabilityReadinessV1,
  evidenceAuthority: CanonicalInvestingSuitabilityEvidenceAuthorityV1,
  recommendation: CanonicalInvestingRecommendationSuitabilityAuthorityV1,
) {
  assertSame(policy.intent.declaredIntent.objective, intent.intent.objective, "investing_mandate_authority_composition_objective_mismatch");
  assertSame(policy.intent.declaredIntent.riskProfile, intent.intent.riskProfile, "investing_mandate_authority_composition_risk_profile_mismatch");
  assertSame(policy.intent.declaredIntent.horizon, intent.intent.horizon, "investing_mandate_authority_composition_horizon_mismatch");
  for (const knownIntent of [readiness.knownIntent, evidenceAuthority.knownIntent, recommendation.knownIntent]) {
    assertSame(knownIntent.objective, intent.intent.objective, "investing_mandate_authority_composition_objective_mismatch");
    assertSame(knownIntent.riskProfile, intent.intent.riskProfile, "investing_mandate_authority_composition_risk_profile_mismatch");
    assertSame(knownIntent.horizon, intent.intent.horizon, "investing_mandate_authority_composition_horizon_mismatch");
  }
}

function assertUpstreamPlanTemporalLineage(intent: CanonicalInvestingMandateIntentV1) {
  assert(
    intent.plan.activatedAt <= intent.plan.updatedAt,
    "investing_mandate_authority_composition_upstream_plan_temporal_lineage_invalid",
  );
  assert(
    intent.plan.updatedAt <= intent.lineage.authoredAt,
    "investing_mandate_authority_composition_upstream_plan_temporal_lineage_invalid",
  );
  assert(
    intent.plan.activatedAt <= intent.lineage.authoredAt,
    "investing_mandate_authority_composition_upstream_plan_temporal_lineage_invalid",
  );
}

function assertTemporalLineage(
  intent: CanonicalInvestingMandateIntentV1,
  policy: CanonicalInvestingPolicyMethodologyAssessmentV1,
  readiness: CanonicalInvestingSuitabilityReadinessV1,
  evidenceAuthority: CanonicalInvestingSuitabilityEvidenceAuthorityV1,
  recommendation: CanonicalInvestingRecommendationSuitabilityAuthorityV1,
  assessedAt: string,
) {
  assertUpstreamPlanTemporalLineage(intent);
  assert(intent.lineage.authoredAt <= policy.assessedAt, "investing_mandate_authority_composition_temporal_lineage_invalid");
  assert(policy.assessedAt <= readiness.assessedAt, "investing_mandate_authority_composition_temporal_lineage_invalid");
  assert(readiness.assessedAt <= evidenceAuthority.assessedAt, "investing_mandate_authority_composition_temporal_lineage_invalid");
  assert(evidenceAuthority.assessedAt <= recommendation.assessedAt, "investing_mandate_authority_composition_temporal_lineage_invalid");
  assert(recommendation.assessedAt <= assessedAt, "investing_mandate_authority_composition_temporal_lineage_invalid");
}

function assertUnavailableSemantics(
  translation: CanonicalPlanToMandateTranslationAssessmentV1,
  policy: CanonicalInvestingPolicyMethodologyAssessmentV1,
  recommendation: CanonicalInvestingRecommendationSuitabilityAuthorityV1,
) {
  assert(translation.availability === "UNAVAILABLE", "investing_mandate_authority_composition_translation_available_invalid");
  assert(translation.mandate === null, "investing_mandate_authority_composition_translation_mandate_invalid");
  assert(policy.methodology.availability === "UNAVAILABLE", "investing_mandate_authority_composition_policy_methodology_available_invalid");
  assert(policy.technicalPolicyIdentity.financialAuthority === "NOT_ACCEPTED", "investing_mandate_authority_composition_policy_financial_authority_invalid");
  assert(policy.methodology.declarations === null, "investing_mandate_authority_composition_policy_declarations_invalid");
  assert(recommendation.recommendationSuitabilityAuthority.availability === "UNAVAILABLE", "investing_mandate_authority_composition_recommendation_available_invalid");
  assert(recommendation.recommendationSuitabilityAuthority.authority === "NOT_ACCEPTED", "investing_mandate_authority_composition_recommendation_authority_invalid");
  assert(recommendation.recommendationSuitabilityAuthority.determination === null, "investing_mandate_authority_composition_recommendation_determination_invalid");
}

function compositionFingerprintInput(
  composition:
    | CanonicalInvestingMandateAuthorityCompositionV1
    | Omit<CanonicalInvestingMandateAuthorityCompositionV1, "compositionFingerprint">,
) {
  return {
    contractVersion: composition.contractVersion,
    authority: composition.authority,
    lineage: {
      ...composition.lineage,
      planVersion: String(composition.lineage.planVersion),
      structuredSchemaVersion: String(composition.lineage.structuredSchemaVersion),
    },
    knownIntent: composition.knownIntent,
    compositionBasis: composition.compositionBasis,
    mandateAuthority: composition.mandateAuthority,
    assessedAt: composition.assessedAt,
  };
}

export function hashCanonicalInvestingMandateAuthorityCompositionV1(
  composition:
    | CanonicalInvestingMandateAuthorityCompositionV1
    | Omit<CanonicalInvestingMandateAuthorityCompositionV1, "compositionFingerprint">,
) {
  return canonicalSha256(compositionFingerprintInput(composition));
}

export function composeCanonicalInvestingMandateAuthorityV1(
  input: CanonicalInvestingMandateAuthorityCompositionInputV1,
): CanonicalInvestingMandateAuthorityCompositionV1 {
  assertClosedDataRecord(input, ROOT_INPUT_KEYS, "investing_mandate_authority_composition_input_closed_invalid");

  const planTranslationAssessment = materializePlanTranslationAssessment(
    readDataField(input, "planTranslationAssessment"),
  );
  const intent = materializeIntent(readDataField(input, "intent"));
  assertPlanTranslationConsistency(planTranslationAssessment, intent);

  const policyAssessedAt = readRequiredDataField(
    readDataField(input, "policyMethodologyAssessment"),
    "assessedAt",
    "investing_mandate_authority_composition_policy_methodology_assessed_at_invalid",
  );
  assertTimestamp(policyAssessedAt, "investing_mandate_authority_composition_policy_methodology_assessed_at_invalid");
  const expectedPolicyMethodologyAssessment = assessCanonicalInvestingPolicyMethodologyV1({
    intent,
    assessedAt: policyAssessedAt,
  });
  assertCanonicalDataEqual(
    readDataField(input, "policyMethodologyAssessment"),
    expectedPolicyMethodologyAssessment,
    "investing_mandate_authority_composition_policy_methodology_mismatch",
  );

  const readinessAssessedAt = readRequiredDataField(
    readDataField(input, "suitabilityReadiness"),
    "assessedAt",
    "investing_mandate_authority_composition_suitability_readiness_assessed_at_invalid",
  );
  assertTimestamp(readinessAssessedAt, "investing_mandate_authority_composition_suitability_readiness_assessed_at_invalid");
  const expectedSuitabilityReadiness = assessCanonicalInvestingSuitabilityReadinessV1({
    intent,
    policyMethodologyAssessment: expectedPolicyMethodologyAssessment,
    assessedAt: readinessAssessedAt,
  });
  assertCanonicalDataEqual(
    readDataField(input, "suitabilityReadiness"),
    expectedSuitabilityReadiness,
    "investing_mandate_authority_composition_suitability_readiness_mismatch",
  );
  assertUpstreamPlanTemporalLineage(intent);

  const evidenceAssessedAt = readRequiredDataField(
    readDataField(input, "suitabilityEvidenceAuthority"),
    "assessedAt",
    "investing_mandate_authority_composition_suitability_evidence_assessed_at_invalid",
  );
  assertTimestamp(evidenceAssessedAt, "investing_mandate_authority_composition_suitability_evidence_assessed_at_invalid");
  const expectedSuitabilityEvidenceAuthority = assessCanonicalInvestingSuitabilityEvidenceAuthorityV1({
    intent,
    policyMethodologyAssessment: expectedPolicyMethodologyAssessment,
    suitabilityReadiness: expectedSuitabilityReadiness,
    assessedAt: evidenceAssessedAt,
  });
  assertCanonicalDataEqual(
    readDataField(input, "suitabilityEvidenceAuthority"),
    expectedSuitabilityEvidenceAuthority,
    "investing_mandate_authority_composition_suitability_evidence_mismatch",
  );

  const recommendationAssessedAt = readRequiredDataField(
    readDataField(input, "recommendationSuitabilityAuthority"),
    "assessedAt",
    "investing_mandate_authority_composition_recommendation_suitability_assessed_at_invalid",
  );
  assertTimestamp(recommendationAssessedAt, "investing_mandate_authority_composition_recommendation_suitability_assessed_at_invalid");
  const expectedRecommendationSuitabilityAuthority =
    assessCanonicalInvestingRecommendationSuitabilityAuthorityV1({
      intent,
      policyMethodologyAssessment: expectedPolicyMethodologyAssessment,
      suitabilityReadiness: expectedSuitabilityReadiness,
      suitabilityEvidenceAuthority: expectedSuitabilityEvidenceAuthority,
      assessedAt: recommendationAssessedAt,
    });
  assertCanonicalDataEqual(
    readDataField(input, "recommendationSuitabilityAuthority"),
    expectedRecommendationSuitabilityAuthority,
    "investing_mandate_authority_composition_recommendation_suitability_mismatch",
  );

  const assessedAt = readDataField(input, "assessedAt");
  assertTimestamp(assessedAt, "investing_mandate_authority_composition_assessed_at_invalid");

  assertAuthorityConsistency(
    intent,
    expectedPolicyMethodologyAssessment,
    expectedSuitabilityReadiness,
    expectedSuitabilityEvidenceAuthority,
    expectedRecommendationSuitabilityAuthority,
  );
  assertPlanLineageConsistency(
    intent,
    expectedPolicyMethodologyAssessment,
    expectedSuitabilityReadiness,
    expectedSuitabilityEvidenceAuthority,
    expectedRecommendationSuitabilityAuthority,
  );
  assertKnownIntentConsistency(
    intent,
    expectedPolicyMethodologyAssessment,
    expectedSuitabilityReadiness,
    expectedSuitabilityEvidenceAuthority,
    expectedRecommendationSuitabilityAuthority,
  );
  assertTemporalLineage(
    intent,
    expectedPolicyMethodologyAssessment,
    expectedSuitabilityReadiness,
    expectedSuitabilityEvidenceAuthority,
    expectedRecommendationSuitabilityAuthority,
    assessedAt,
  );
  assertUnavailableSemantics(
    planTranslationAssessment,
    expectedPolicyMethodologyAssessment,
    expectedRecommendationSuitabilityAuthority,
  );

  const draft = {
    contractVersion: CANONICAL_INVESTING_MANDATE_AUTHORITY_COMPOSITION_CONTRACT_VERSION,
    authority: intent.authority,
    lineage: {
      planId: intent.plan.planId,
      planVersion: intent.plan.planVersion,
      activatedAt: intent.plan.activatedAt,
      updatedAt: intent.plan.updatedAt,
      structuredSchemaVersion: intent.plan.structuredSchemaVersion,
      planSemanticFingerprint: intent.plan.semanticFingerprint,
      planToMandateTranslationFingerprint: planTranslationAssessment.translationFingerprint,
      intentFingerprint: intent.lineage.intentFingerprint,
      policyMethodologyAssessmentFingerprint: expectedPolicyMethodologyAssessment.assessmentFingerprint,
      suitabilityReadinessAssessmentFingerprint: expectedSuitabilityReadiness.assessmentFingerprint,
      suitabilityEvidenceAuthorityFingerprint: expectedSuitabilityEvidenceAuthority.evidenceAuthorityFingerprint,
      recommendationSuitabilityAuthorityFingerprint: expectedRecommendationSuitabilityAuthority.authorityFingerprint,
    },
    knownIntent: intent.intent,
    compositionBasis: {
      planToMandateTranslation: {
        availability: "UNAVAILABLE",
        mandate: null,
      },
      policyMethodology: {
        availability: "UNAVAILABLE",
        financialAuthority: "NOT_ACCEPTED",
        declarations: null,
      },
      recommendationSuitability: {
        availability: "UNAVAILABLE",
        authority: "NOT_ACCEPTED",
        determination: null,
      },
    },
    mandateAuthority: {
      availability: "UNAVAILABLE",
      authority: "NOT_ACCEPTED",
      mandate: null,
      reasonCodes: CANONICAL_INVESTING_MANDATE_AUTHORITY_COMPOSITION_REASON_CODES,
    },
    assessedAt,
  } satisfies Omit<CanonicalInvestingMandateAuthorityCompositionV1, "compositionFingerprint">;

  const composition = {
    ...draft,
    compositionFingerprint: hashCanonicalInvestingMandateAuthorityCompositionV1(draft),
  } satisfies CanonicalInvestingMandateAuthorityCompositionV1;

  return deepFreezeCanonical(composition) as CanonicalInvestingMandateAuthorityCompositionV1;
}
