import {
  CANONICAL_INVESTING_MANDATE_INTENT_CONTRACT_VERSION,
  hashCanonicalInvestingMandateIntentV1,
  type CanonicalInvestingMandateIntentHorizonV1,
  type CanonicalInvestingMandateIntentObjectiveV1,
  type CanonicalInvestingMandateIntentRiskProfileV1,
  type CanonicalInvestingMandateIntentV1,
} from "@/lib/investing/authority/mandateIntent";
import {
  CANONICAL_INVESTING_POLICY_METHODOLOGY_ASSESSMENT_CONTRACT_VERSION,
  CANONICAL_INVESTING_POLICY_METHODOLOGY_REASON_CODES,
  hashCanonicalInvestingPolicyMethodologyAssessmentV1,
  type CanonicalInvestingPolicyMethodologyAssessmentV1,
  type CanonicalInvestingPolicyMethodologyReasonCodeV1,
} from "@/lib/investing/authority/policyMethodology";
import {
  canonicalSha256,
  deepFreezeCanonical,
  normalizeIsoTimestamp,
} from "@/lib/investing/engine/v1/canonical";
import {
  INVESTING_TECHNICAL_POLICY_DEFINITION_HASH_V1,
  TECHNICAL_INVESTING_POLICY_VERSION_V1,
} from "@/lib/investing/engine/v1/policyDefinition";

export const CANONICAL_INVESTING_SUITABILITY_READINESS_CONTRACT_VERSION =
  "canonical-investing-suitability-readiness/v1" as const;

export const CANONICAL_INVESTING_SUITABILITY_READINESS_REASON_CODES = [
  "RECOMMENDATION_SUITABILITY_AUTHORITY_NOT_ACCEPTED",
  "KNOWLEDGE_EXPERIENCE_EVIDENCE_UNAVAILABLE",
  "FINANCIAL_SITUATION_EVIDENCE_UNAVAILABLE",
  "LOSS_BEARING_CAPACITY_EVIDENCE_UNAVAILABLE",
  "RISK_TOLERANCE_EVIDENCE_UNAVAILABLE",
  "EVIDENCE_RELIABILITY_METHODOLOGY_NOT_ACCEPTED",
  "REGULATORY_SERVICE_CLASSIFICATION_UNRESOLVED",
  "SUSTAINABILITY_PREFERENCES_APPLICABILITY_UNRESOLVED",
] as const;

export type CanonicalInvestingSuitabilityReadinessReasonCodeV1 =
  (typeof CANONICAL_INVESTING_SUITABILITY_READINESS_REASON_CODES)[number];

export type CanonicalInvestingSuitabilityReadinessInputV1 = {
  readonly intent: CanonicalInvestingMandateIntentV1;
  readonly policyMethodologyAssessment: CanonicalInvestingPolicyMethodologyAssessmentV1;
  readonly assessedAt: string;
};

export type CanonicalInvestingSuitabilityEvidenceDomainV1 = {
  readonly availability: "UNAVAILABLE";
  readonly source: null;
  readonly asOf: null;
};

export type CanonicalInvestingSuitabilityReadinessV1 = {
  readonly contractVersion: typeof CANONICAL_INVESTING_SUITABILITY_READINESS_CONTRACT_VERSION;
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
    readonly intentFingerprint: string;
    readonly policyMethodologyAssessmentFingerprint: string;
  };
  readonly knownIntent: {
    readonly objective: CanonicalInvestingMandateIntentObjectiveV1;
    readonly riskProfile: CanonicalInvestingMandateIntentRiskProfileV1;
    readonly horizon: CanonicalInvestingMandateIntentHorizonV1;
  };
  readonly evidence: {
    readonly knowledgeExperience: CanonicalInvestingSuitabilityEvidenceDomainV1;
    readonly financialSituation: CanonicalInvestingSuitabilityEvidenceDomainV1;
    readonly lossBearingCapacity: CanonicalInvestingSuitabilityEvidenceDomainV1;
    readonly riskTolerance: CanonicalInvestingSuitabilityEvidenceDomainV1;
    readonly sustainabilityPreferences: {
      readonly availability: "APPLICABILITY_UNRESOLVED";
      readonly source: null;
      readonly asOf: null;
    };
  };
  readonly reliability: {
    readonly availability: "UNAVAILABLE";
    readonly methodology: null;
  };
  readonly regulatoryApplicability: {
    readonly availability: "UNRESOLVED";
    readonly classification: null;
  };
  readonly readiness: {
    readonly availability: "UNAVAILABLE";
    readonly reasonCodes: readonly CanonicalInvestingSuitabilityReadinessReasonCodeV1[];
  };
  readonly assessedAt: string;
  readonly assessmentFingerprint: string;
};

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const SHA256_LOWERCASE_PATTERN = /^[a-f0-9]{64}$/;

const ROOT_INPUT_KEYS = ["intent", "policyMethodologyAssessment", "assessedAt"] as const;
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
const POLICY_ASSESSMENT_ROOT_KEYS = [
  "contractVersion",
  "intent",
  "technicalPolicyIdentity",
  "methodology",
  "assessedAt",
  "assessmentFingerprint",
] as const;
const POLICY_ASSESSMENT_INTENT_KEYS = ["intentFingerprint", "authority", "plan", "declaredIntent"] as const;
const TECHNICAL_POLICY_IDENTITY_KEYS = [
  "policyVersion",
  "definitionHash",
  "classification",
  "financialAuthority",
] as const;
const METHODOLOGY_KEYS = ["availability", "reasonCodes", "specification", "declarations"] as const;

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
    "investing_suitability_readiness_plan_version_invalid",
  );
}

function materializeStringArray(value: unknown, code: string) {
  assertClosedDataArray(value, code);
  return value.map((entry) => {
    assert(typeof entry === "string", code);
    return entry;
  });
}

function materializeAuthority(value: unknown, codePrefix: string) {
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
  assert(
    authority.environment === "paper" || authority.environment === "simulation",
    `${codePrefix}_environment_invalid`,
  );
  assertCurrency(authority.accountBaseCurrency, `${codePrefix}_currency_invalid`);
  return authority as CanonicalInvestingMandateIntentV1["authority"];
}

function materializePlan(value: unknown, codePrefix: string) {
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
  assertSafePositiveVersion(plan.planVersion);
  assertTimestamp(plan.activatedAt, `${codePrefix}_plan_activated_at_invalid`);
  assertTimestamp(plan.updatedAt, `${codePrefix}_plan_updated_at_invalid`);
  assert(plan.structuredSchemaVersion === 1, `${codePrefix}_plan_schema_invalid`);
  assertSha256(plan.semanticFingerprint, `${codePrefix}_plan_semantic_fingerprint_invalid`);
  return plan as CanonicalInvestingMandateIntentV1["plan"];
}

function materializeKnownIntent(value: unknown, codePrefix: string) {
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
  assertClosedDataRecord(value, INTENT_ROOT_KEYS, "investing_suitability_readiness_intent_closed_invalid");
  assert(
    readDataField(value, "contractVersion") === CANONICAL_INVESTING_MANDATE_INTENT_CONTRACT_VERSION,
    "investing_suitability_readiness_intent_contract_invalid",
  );

  const policy = readDataField(value, "policy");
  assertClosedDataRecord(policy, INTENT_POLICY_KEYS, "investing_suitability_readiness_intent_policy_closed_invalid");
  assert(
    readDataField(policy, "availability") === "UNAVAILABLE",
    "investing_suitability_readiness_intent_policy_availability_invalid",
  );
  assert(
    readDataField(policy, "reason") === "canonical_policy_methodology_not_accepted",
    "investing_suitability_readiness_intent_policy_reason_invalid",
  );
  assert(
    readDataField(policy, "declarations") === null,
    "investing_suitability_readiness_intent_policy_declarations_invalid",
  );

  const lineage = readDataField(value, "lineage");
  assertClosedDataRecord(lineage, INTENT_LINEAGE_KEYS, "investing_suitability_readiness_intent_lineage_closed_invalid");
  const authoredAt = readDataField(lineage, "authoredAt");
  const intentFingerprint = readDataField(lineage, "intentFingerprint");
  assertTimestamp(authoredAt, "investing_suitability_readiness_intent_authored_at_invalid");
  assertSha256(intentFingerprint, "investing_suitability_readiness_intent_fingerprint_invalid");

  const materialized = {
    contractVersion: CANONICAL_INVESTING_MANDATE_INTENT_CONTRACT_VERSION,
    authority: materializeAuthority(readDataField(value, "authority"), "investing_suitability_readiness_intent"),
    plan: materializePlan(readDataField(value, "plan"), "investing_suitability_readiness_intent"),
    intent: materializeKnownIntent(readDataField(value, "intent"), "investing_suitability_readiness_intent"),
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
    "investing_suitability_readiness_intent_fingerprint_mismatch",
  );
  return materialized;
}

function materializePolicyMethodologyAssessment(value: unknown): CanonicalInvestingPolicyMethodologyAssessmentV1 {
  assertClosedDataRecord(
    value,
    POLICY_ASSESSMENT_ROOT_KEYS,
    "investing_suitability_readiness_policy_methodology_closed_invalid",
  );
  assert(
    readDataField(value, "contractVersion") === CANONICAL_INVESTING_POLICY_METHODOLOGY_ASSESSMENT_CONTRACT_VERSION,
    "investing_suitability_readiness_policy_methodology_contract_invalid",
  );

  const assessmentIntent = readDataField(value, "intent");
  assertClosedDataRecord(
    assessmentIntent,
    POLICY_ASSESSMENT_INTENT_KEYS,
    "investing_suitability_readiness_policy_methodology_intent_closed_invalid",
  );
  const intentFingerprint = readDataField(assessmentIntent, "intentFingerprint");
  assertSha256(intentFingerprint, "investing_suitability_readiness_policy_methodology_intent_fingerprint_invalid");

  const technicalPolicyIdentity = readDataField(value, "technicalPolicyIdentity");
  assertClosedDataRecord(
    technicalPolicyIdentity,
    TECHNICAL_POLICY_IDENTITY_KEYS,
    "investing_suitability_readiness_technical_policy_identity_closed_invalid",
  );
  assert(
    readDataField(technicalPolicyIdentity, "policyVersion") === TECHNICAL_INVESTING_POLICY_VERSION_V1,
    "investing_suitability_readiness_technical_policy_version_invalid",
  );
  assert(
    readDataField(technicalPolicyIdentity, "definitionHash") === INVESTING_TECHNICAL_POLICY_DEFINITION_HASH_V1,
    "investing_suitability_readiness_technical_policy_definition_hash_invalid",
  );
  assert(
    readDataField(technicalPolicyIdentity, "classification") === "TECHNICAL_ENGINE_POLICY",
    "investing_suitability_readiness_technical_policy_classification_invalid",
  );
  assert(
    readDataField(technicalPolicyIdentity, "financialAuthority") === "NOT_ACCEPTED",
    "investing_suitability_readiness_technical_policy_financial_authority_invalid",
  );

  const methodology = readDataField(value, "methodology");
  assertClosedDataRecord(methodology, METHODOLOGY_KEYS, "investing_suitability_readiness_methodology_closed_invalid");
  const reasonCodes = materializeStringArray(
    readDataField(methodology, "reasonCodes"),
    "investing_suitability_readiness_methodology_reason_codes_invalid",
  );
  assert(
    readDataField(methodology, "availability") === "UNAVAILABLE",
    "investing_suitability_readiness_methodology_availability_invalid",
  );
  assert(
    reasonCodes.length === CANONICAL_INVESTING_POLICY_METHODOLOGY_REASON_CODES.length &&
      CANONICAL_INVESTING_POLICY_METHODOLOGY_REASON_CODES.every((reason, index) => reasonCodes[index] === reason),
    "investing_suitability_readiness_methodology_reason_codes_invalid",
  );
  assert(
    readDataField(methodology, "specification") === null,
    "investing_suitability_readiness_methodology_specification_invalid",
  );
  assert(
    readDataField(methodology, "declarations") === null,
    "investing_suitability_readiness_methodology_declarations_invalid",
  );

  const assessedAt = readDataField(value, "assessedAt");
  const assessmentFingerprint = readDataField(value, "assessmentFingerprint");
  assertTimestamp(assessedAt, "investing_suitability_readiness_policy_methodology_assessed_at_invalid");
  assertSha256(assessmentFingerprint, "investing_suitability_readiness_policy_methodology_fingerprint_invalid");

  const materialized = {
    contractVersion: CANONICAL_INVESTING_POLICY_METHODOLOGY_ASSESSMENT_CONTRACT_VERSION,
    intent: {
      intentFingerprint,
      authority: materializeAuthority(
        readDataField(assessmentIntent, "authority"),
        "investing_suitability_readiness_policy_methodology",
      ),
      plan: materializePlan(readDataField(assessmentIntent, "plan"), "investing_suitability_readiness_policy_methodology"),
      declaredIntent: materializeKnownIntent(
        readDataField(assessmentIntent, "declaredIntent"),
        "investing_suitability_readiness_policy_methodology",
      ),
    },
    technicalPolicyIdentity: {
      policyVersion: TECHNICAL_INVESTING_POLICY_VERSION_V1,
      definitionHash: INVESTING_TECHNICAL_POLICY_DEFINITION_HASH_V1,
      classification: "TECHNICAL_ENGINE_POLICY",
      financialAuthority: "NOT_ACCEPTED",
    },
    methodology: {
      availability: "UNAVAILABLE",
      reasonCodes: reasonCodes as readonly CanonicalInvestingPolicyMethodologyReasonCodeV1[],
      specification: null,
      declarations: null,
    },
    assessedAt,
    assessmentFingerprint,
  } satisfies CanonicalInvestingPolicyMethodologyAssessmentV1;

  assert(
    hashCanonicalInvestingPolicyMethodologyAssessmentV1(materialized) === materialized.assessmentFingerprint,
    "investing_suitability_readiness_policy_methodology_fingerprint_mismatch",
  );
  return materialized;
}

function assertSame(value: unknown, expected: unknown, code: string) {
  assert(value === expected, code);
}

function assertLineageConsistency(
  intent: CanonicalInvestingMandateIntentV1,
  assessment: CanonicalInvestingPolicyMethodologyAssessmentV1,
) {
  assertSame(assessment.intent.intentFingerprint, intent.lineage.intentFingerprint, "investing_suitability_readiness_intent_fingerprint_lineage_mismatch");
  assertSame(assessment.intent.authority.userId, intent.authority.userId, "investing_suitability_readiness_user_mismatch");
  assertSame(assessment.intent.authority.tenantId, intent.authority.tenantId, "investing_suitability_readiness_tenant_mismatch");
  assertSame(assessment.intent.authority.membershipId, intent.authority.membershipId, "investing_suitability_readiness_membership_mismatch");
  assertSame(assessment.intent.authority.portfolioId, intent.authority.portfolioId, "investing_suitability_readiness_portfolio_mismatch");
  assertSame(assessment.intent.authority.accountId, intent.authority.accountId, "investing_suitability_readiness_account_mismatch");
  assertSame(assessment.intent.authority.environment, intent.authority.environment, "investing_suitability_readiness_environment_mismatch");
  assertSame(assessment.intent.authority.accountBaseCurrency, intent.authority.accountBaseCurrency, "investing_suitability_readiness_currency_mismatch");
  assertSame(assessment.intent.plan.planId, intent.plan.planId, "investing_suitability_readiness_plan_id_mismatch");
  assertSame(assessment.intent.plan.planVersion, intent.plan.planVersion, "investing_suitability_readiness_plan_version_mismatch");
  assertSame(assessment.intent.plan.activatedAt, intent.plan.activatedAt, "investing_suitability_readiness_plan_activated_at_mismatch");
  assertSame(assessment.intent.plan.updatedAt, intent.plan.updatedAt, "investing_suitability_readiness_plan_updated_at_mismatch");
  assertSame(assessment.intent.plan.structuredSchemaVersion, intent.plan.structuredSchemaVersion, "investing_suitability_readiness_plan_schema_mismatch");
  assertSame(assessment.intent.plan.semanticFingerprint, intent.plan.semanticFingerprint, "investing_suitability_readiness_plan_semantic_fingerprint_mismatch");
  assertSame(assessment.intent.declaredIntent.objective, intent.intent.objective, "investing_suitability_readiness_objective_mismatch");
  assertSame(assessment.intent.declaredIntent.riskProfile, intent.intent.riskProfile, "investing_suitability_readiness_risk_profile_mismatch");
  assertSame(assessment.intent.declaredIntent.horizon, intent.intent.horizon, "investing_suitability_readiness_horizon_mismatch");
}

function assertTemporalLineage(authoredAt: string, policyAssessedAt: string, assessedAt: string) {
  assert(authoredAt <= policyAssessedAt, "investing_suitability_readiness_temporal_lineage_invalid");
  assert(policyAssessedAt <= assessedAt, "investing_suitability_readiness_temporal_lineage_invalid");
}

function unavailableEvidence(): CanonicalInvestingSuitabilityEvidenceDomainV1 {
  return {
    availability: "UNAVAILABLE",
    source: null,
    asOf: null,
  };
}

function readinessFingerprintInput(
  readiness: Omit<CanonicalInvestingSuitabilityReadinessV1, "assessmentFingerprint">,
) {
  return {
    ...readiness,
    lineage: {
      ...readiness.lineage,
      planVersion: String(readiness.lineage.planVersion),
      structuredSchemaVersion: String(readiness.lineage.structuredSchemaVersion),
    },
  };
}

export function hashCanonicalInvestingSuitabilityReadinessV1(
  readiness:
    | CanonicalInvestingSuitabilityReadinessV1
    | Omit<CanonicalInvestingSuitabilityReadinessV1, "assessmentFingerprint">,
) {
  const hashable: Record<string, unknown> = { ...readiness };
  delete hashable.assessmentFingerprint;
  return canonicalSha256(
    readinessFingerprintInput(
      hashable as Omit<CanonicalInvestingSuitabilityReadinessV1, "assessmentFingerprint">,
    ),
  );
}

export function assessCanonicalInvestingSuitabilityReadinessV1(
  input: CanonicalInvestingSuitabilityReadinessInputV1,
): CanonicalInvestingSuitabilityReadinessV1 {
  assertClosedDataRecord(input, ROOT_INPUT_KEYS, "investing_suitability_readiness_input_closed_invalid");
  const intent = materializeIntent(readDataField(input, "intent"));
  const policyMethodologyAssessment = materializePolicyMethodologyAssessment(
    readDataField(input, "policyMethodologyAssessment"),
  );
  const assessedAt = readDataField(input, "assessedAt");
  assertTimestamp(assessedAt, "investing_suitability_readiness_assessed_at_invalid");
  assertLineageConsistency(intent, policyMethodologyAssessment);
  assertTemporalLineage(intent.lineage.authoredAt, policyMethodologyAssessment.assessedAt, assessedAt);

  const draft = {
    contractVersion: CANONICAL_INVESTING_SUITABILITY_READINESS_CONTRACT_VERSION,
    authority: intent.authority,
    lineage: {
      planId: intent.plan.planId,
      planVersion: intent.plan.planVersion,
      activatedAt: intent.plan.activatedAt,
      updatedAt: intent.plan.updatedAt,
      structuredSchemaVersion: intent.plan.structuredSchemaVersion,
      planSemanticFingerprint: intent.plan.semanticFingerprint,
      intentFingerprint: intent.lineage.intentFingerprint,
      policyMethodologyAssessmentFingerprint: policyMethodologyAssessment.assessmentFingerprint,
    },
    knownIntent: intent.intent,
    evidence: {
      knowledgeExperience: unavailableEvidence(),
      financialSituation: unavailableEvidence(),
      lossBearingCapacity: unavailableEvidence(),
      riskTolerance: unavailableEvidence(),
      sustainabilityPreferences: {
        availability: "APPLICABILITY_UNRESOLVED",
        source: null,
        asOf: null,
      },
    },
    reliability: {
      availability: "UNAVAILABLE",
      methodology: null,
    },
    regulatoryApplicability: {
      availability: "UNRESOLVED",
      classification: null,
    },
    readiness: {
      availability: "UNAVAILABLE",
      reasonCodes: CANONICAL_INVESTING_SUITABILITY_READINESS_REASON_CODES,
    },
    assessedAt,
  } satisfies Omit<CanonicalInvestingSuitabilityReadinessV1, "assessmentFingerprint">;

  const readiness = {
    ...draft,
    assessmentFingerprint: hashCanonicalInvestingSuitabilityReadinessV1(draft),
  } satisfies CanonicalInvestingSuitabilityReadinessV1;

  return deepFreezeCanonical(readiness) as CanonicalInvestingSuitabilityReadinessV1;
}
