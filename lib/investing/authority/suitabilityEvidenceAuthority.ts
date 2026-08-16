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
  CANONICAL_INVESTING_SUITABILITY_READINESS_CONTRACT_VERSION,
  CANONICAL_INVESTING_SUITABILITY_READINESS_REASON_CODES,
  hashCanonicalInvestingSuitabilityReadinessV1,
  type CanonicalInvestingSuitabilityReadinessReasonCodeV1,
  type CanonicalInvestingSuitabilityReadinessV1,
} from "@/lib/investing/authority/suitabilityReadiness";
import {
  canonicalSha256,
  deepFreezeCanonical,
  normalizeIsoTimestamp,
} from "@/lib/investing/engine/v1/canonical";
import {
  INVESTING_TECHNICAL_POLICY_DEFINITION_HASH_V1,
  TECHNICAL_INVESTING_POLICY_VERSION_V1,
} from "@/lib/investing/engine/v1/policyDefinition";

export const CANONICAL_INVESTING_SUITABILITY_EVIDENCE_AUTHORITY_CONTRACT_VERSION =
  "canonical-investing-suitability-evidence-authority/v1" as const;

export const CANONICAL_INVESTING_SUITABILITY_EVIDENCE_AUTHORITY_REASON_CODES = Object.freeze([
  "SUITABILITY_EVIDENCE_SOURCE_AUTHORITY_NOT_ACCEPTED",
  "KNOWLEDGE_EXPERIENCE_SOURCE_AUTHORITY_UNAVAILABLE",
  "FINANCIAL_SITUATION_SOURCE_AUTHORITY_UNAVAILABLE",
  "LOSS_BEARING_CAPACITY_SOURCE_AUTHORITY_UNAVAILABLE",
  "RISK_TOLERANCE_SOURCE_AUTHORITY_UNAVAILABLE",
  "EVIDENCE_RELIABILITY_AUTHORITY_NOT_ACCEPTED",
  "REGULATORY_CLASSIFICATION_SOURCE_AUTHORITY_UNRESOLVED",
  "SUSTAINABILITY_PREFERENCES_SOURCE_AUTHORITY_UNRESOLVED",
] as const);

export type CanonicalInvestingSuitabilityEvidenceAuthorityReasonCodeV1 =
  (typeof CANONICAL_INVESTING_SUITABILITY_EVIDENCE_AUTHORITY_REASON_CODES)[number];

export type CanonicalInvestingSuitabilityEvidenceAuthorityInputV1 = {
  readonly intent: CanonicalInvestingMandateIntentV1;
  readonly policyMethodologyAssessment: CanonicalInvestingPolicyMethodologyAssessmentV1;
  readonly suitabilityReadiness: CanonicalInvestingSuitabilityReadinessV1;
  readonly assessedAt: string;
};

export type CanonicalInvestingSuitabilityEvidenceSourceAuthorityDomainV1 = {
  readonly availability: "UNAVAILABLE";
  readonly acceptedSource: null;
};

export type CanonicalInvestingSuitabilityEvidenceAuthorityV1 = {
  readonly contractVersion: typeof CANONICAL_INVESTING_SUITABILITY_EVIDENCE_AUTHORITY_CONTRACT_VERSION;
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
    readonly suitabilityReadinessAssessmentFingerprint: string;
  };
  readonly knownIntent: {
    readonly objective: CanonicalInvestingMandateIntentObjectiveV1;
    readonly riskProfile: CanonicalInvestingMandateIntentRiskProfileV1;
    readonly horizon: CanonicalInvestingMandateIntentHorizonV1;
  };
  readonly sourceAuthority: {
    readonly knowledgeExperience: CanonicalInvestingSuitabilityEvidenceSourceAuthorityDomainV1;
    readonly financialSituation: CanonicalInvestingSuitabilityEvidenceSourceAuthorityDomainV1;
    readonly lossBearingCapacity: CanonicalInvestingSuitabilityEvidenceSourceAuthorityDomainV1;
    readonly riskTolerance: CanonicalInvestingSuitabilityEvidenceSourceAuthorityDomainV1;
    readonly sustainabilityPreferences: {
      readonly applicability: "UNRESOLVED";
      readonly acceptedSource: null;
    };
  };
  readonly reliabilityAuthority: {
    readonly availability: "UNAVAILABLE";
    readonly methodology: null;
  };
  readonly regulatoryClassificationAuthority: {
    readonly availability: "UNRESOLVED";
    readonly classification: null;
    readonly source: null;
  };
  readonly evidenceProvenanceAuthority: {
    readonly availability: "UNAVAILABLE";
    readonly reasonCodes: readonly CanonicalInvestingSuitabilityEvidenceAuthorityReasonCodeV1[];
  };
  readonly assessedAt: string;
  readonly evidenceAuthorityFingerprint: string;
};

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const SHA256_LOWERCASE_PATTERN = /^[a-f0-9]{64}$/;

const ROOT_INPUT_KEYS = ["intent", "policyMethodologyAssessment", "suitabilityReadiness", "assessedAt"] as const;
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
const READINESS_ROOT_KEYS = [
  "contractVersion",
  "authority",
  "lineage",
  "knownIntent",
  "evidence",
  "reliability",
  "regulatoryApplicability",
  "readiness",
  "assessedAt",
  "assessmentFingerprint",
] as const;
const READINESS_LINEAGE_KEYS = [
  "planId",
  "planVersion",
  "activatedAt",
  "updatedAt",
  "structuredSchemaVersion",
  "planSemanticFingerprint",
  "intentFingerprint",
  "policyMethodologyAssessmentFingerprint",
] as const;
const READINESS_EVIDENCE_KEYS = [
  "knowledgeExperience",
  "financialSituation",
  "lossBearingCapacity",
  "riskTolerance",
  "sustainabilityPreferences",
] as const;
const UNAVAILABLE_EVIDENCE_DOMAIN_KEYS = ["availability", "source", "asOf"] as const;
const SUSTAINABILITY_EVIDENCE_DOMAIN_KEYS = ["availability", "source", "asOf"] as const;
const READINESS_RELIABILITY_KEYS = ["availability", "methodology"] as const;
const READINESS_REGULATORY_KEYS = ["availability", "classification"] as const;
const READINESS_STATE_KEYS = ["availability", "reasonCodes"] as const;

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
  // This boundary assumes inputs have already crossed a JSON/plain-data layer;
  // Proxy traps on reflective operations are outside this slice's guarantees.
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
  assert(authority.environment === "paper" || authority.environment === "simulation", `${codePrefix}_environment_invalid`);
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
  assertSafePositiveVersion(plan.planVersion, `${codePrefix}_plan_version_invalid`);
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
  assertClosedDataRecord(value, INTENT_ROOT_KEYS, "investing_suitability_evidence_intent_closed_invalid");
  assert(
    readDataField(value, "contractVersion") === CANONICAL_INVESTING_MANDATE_INTENT_CONTRACT_VERSION,
    "investing_suitability_evidence_intent_contract_invalid",
  );

  const policy = readDataField(value, "policy");
  assertClosedDataRecord(policy, INTENT_POLICY_KEYS, "investing_suitability_evidence_intent_policy_closed_invalid");
  assert(readDataField(policy, "availability") === "UNAVAILABLE", "investing_suitability_evidence_intent_policy_availability_invalid");
  assert(readDataField(policy, "reason") === "canonical_policy_methodology_not_accepted", "investing_suitability_evidence_intent_policy_reason_invalid");
  assert(readDataField(policy, "declarations") === null, "investing_suitability_evidence_intent_policy_declarations_invalid");

  const lineage = readDataField(value, "lineage");
  assertClosedDataRecord(lineage, INTENT_LINEAGE_KEYS, "investing_suitability_evidence_intent_lineage_closed_invalid");
  const authoredAt = readDataField(lineage, "authoredAt");
  const intentFingerprint = readDataField(lineage, "intentFingerprint");
  assertTimestamp(authoredAt, "investing_suitability_evidence_intent_authored_at_invalid");
  assertSha256(intentFingerprint, "investing_suitability_evidence_intent_fingerprint_invalid");

  const materialized = {
    contractVersion: CANONICAL_INVESTING_MANDATE_INTENT_CONTRACT_VERSION,
    authority: materializeAuthority(readDataField(value, "authority"), "investing_suitability_evidence_intent"),
    plan: materializePlan(readDataField(value, "plan"), "investing_suitability_evidence_intent"),
    intent: materializeKnownIntent(readDataField(value, "intent"), "investing_suitability_evidence_intent"),
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
    "investing_suitability_evidence_intent_fingerprint_mismatch",
  );
  return materialized;
}

function materializePolicyMethodologyAssessment(value: unknown): CanonicalInvestingPolicyMethodologyAssessmentV1 {
  assertClosedDataRecord(value, POLICY_ASSESSMENT_ROOT_KEYS, "investing_suitability_evidence_policy_methodology_closed_invalid");
  assert(
    readDataField(value, "contractVersion") === CANONICAL_INVESTING_POLICY_METHODOLOGY_ASSESSMENT_CONTRACT_VERSION,
    "investing_suitability_evidence_policy_methodology_contract_invalid",
  );

  const assessmentIntent = readDataField(value, "intent");
  assertClosedDataRecord(assessmentIntent, POLICY_ASSESSMENT_INTENT_KEYS, "investing_suitability_evidence_policy_methodology_intent_closed_invalid");
  const intentFingerprint = readDataField(assessmentIntent, "intentFingerprint");
  assertSha256(intentFingerprint, "investing_suitability_evidence_policy_methodology_intent_fingerprint_invalid");

  const technicalPolicyIdentity = readDataField(value, "technicalPolicyIdentity");
  assertClosedDataRecord(technicalPolicyIdentity, TECHNICAL_POLICY_IDENTITY_KEYS, "investing_suitability_evidence_technical_policy_identity_closed_invalid");
  assert(readDataField(technicalPolicyIdentity, "policyVersion") === TECHNICAL_INVESTING_POLICY_VERSION_V1, "investing_suitability_evidence_technical_policy_version_invalid");
  assert(readDataField(technicalPolicyIdentity, "definitionHash") === INVESTING_TECHNICAL_POLICY_DEFINITION_HASH_V1, "investing_suitability_evidence_technical_policy_definition_hash_invalid");
  assert(readDataField(technicalPolicyIdentity, "classification") === "TECHNICAL_ENGINE_POLICY", "investing_suitability_evidence_technical_policy_classification_invalid");
  assert(readDataField(technicalPolicyIdentity, "financialAuthority") === "NOT_ACCEPTED", "investing_suitability_evidence_technical_policy_financial_authority_invalid");

  const methodology = readDataField(value, "methodology");
  assertClosedDataRecord(methodology, METHODOLOGY_KEYS, "investing_suitability_evidence_methodology_closed_invalid");
  const reasonCodes = materializeStringArray(
    readDataField(methodology, "reasonCodes"),
    "investing_suitability_evidence_methodology_reason_codes_invalid",
  );
  assert(readDataField(methodology, "availability") === "UNAVAILABLE", "investing_suitability_evidence_methodology_availability_invalid");
  assert(
    reasonCodes.length === CANONICAL_INVESTING_POLICY_METHODOLOGY_REASON_CODES.length &&
      CANONICAL_INVESTING_POLICY_METHODOLOGY_REASON_CODES.every((reason, index) => reasonCodes[index] === reason),
    "investing_suitability_evidence_methodology_reason_codes_invalid",
  );
  assert(readDataField(methodology, "specification") === null, "investing_suitability_evidence_methodology_specification_invalid");
  assert(readDataField(methodology, "declarations") === null, "investing_suitability_evidence_methodology_declarations_invalid");

  const assessedAt = readDataField(value, "assessedAt");
  const assessmentFingerprint = readDataField(value, "assessmentFingerprint");
  assertTimestamp(assessedAt, "investing_suitability_evidence_policy_methodology_assessed_at_invalid");
  assertSha256(assessmentFingerprint, "investing_suitability_evidence_policy_methodology_fingerprint_invalid");

  const materialized = {
    contractVersion: CANONICAL_INVESTING_POLICY_METHODOLOGY_ASSESSMENT_CONTRACT_VERSION,
    intent: {
      intentFingerprint,
      authority: materializeAuthority(readDataField(assessmentIntent, "authority"), "investing_suitability_evidence_policy_methodology"),
      plan: materializePlan(readDataField(assessmentIntent, "plan"), "investing_suitability_evidence_policy_methodology"),
      declaredIntent: materializeKnownIntent(readDataField(assessmentIntent, "declaredIntent"), "investing_suitability_evidence_policy_methodology"),
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
    "investing_suitability_evidence_policy_methodology_fingerprint_mismatch",
  );
  return materialized;
}

function materializeUnavailableEvidenceDomain(value: unknown, codePrefix: string) {
  assertClosedDataRecord(value, UNAVAILABLE_EVIDENCE_DOMAIN_KEYS, `${codePrefix}_closed_invalid`);
  assert(readDataField(value, "availability") === "UNAVAILABLE", `${codePrefix}_availability_invalid`);
  assert(readDataField(value, "source") === null, `${codePrefix}_source_invalid`);
  assert(readDataField(value, "asOf") === null, `${codePrefix}_as_of_invalid`);
  return { availability: "UNAVAILABLE", source: null, asOf: null } as const;
}

function materializeReadiness(value: unknown): CanonicalInvestingSuitabilityReadinessV1 {
  assertClosedDataRecord(value, READINESS_ROOT_KEYS, "investing_suitability_evidence_readiness_closed_invalid");
  assert(
    readDataField(value, "contractVersion") === CANONICAL_INVESTING_SUITABILITY_READINESS_CONTRACT_VERSION,
    "investing_suitability_evidence_readiness_contract_invalid",
  );

  const lineage = readDataField(value, "lineage");
  assertClosedDataRecord(lineage, READINESS_LINEAGE_KEYS, "investing_suitability_evidence_readiness_lineage_closed_invalid");
  const planVersion = readDataField(lineage, "planVersion");
  const structuredSchemaVersion = readDataField(lineage, "structuredSchemaVersion");
  assertSafePositiveVersion(planVersion, "investing_suitability_evidence_readiness_plan_version_invalid");
  assert(structuredSchemaVersion === 1, "investing_suitability_evidence_readiness_plan_schema_invalid");

  const evidence = readDataField(value, "evidence");
  assertClosedDataRecord(evidence, READINESS_EVIDENCE_KEYS, "investing_suitability_evidence_readiness_evidence_closed_invalid");
  const sustainabilityPreferences = readDataField(evidence, "sustainabilityPreferences");
  assertClosedDataRecord(sustainabilityPreferences, SUSTAINABILITY_EVIDENCE_DOMAIN_KEYS, "investing_suitability_evidence_readiness_sustainability_closed_invalid");
  assert(readDataField(sustainabilityPreferences, "availability") === "APPLICABILITY_UNRESOLVED", "investing_suitability_evidence_readiness_sustainability_availability_invalid");
  assert(readDataField(sustainabilityPreferences, "source") === null, "investing_suitability_evidence_readiness_sustainability_source_invalid");
  assert(readDataField(sustainabilityPreferences, "asOf") === null, "investing_suitability_evidence_readiness_sustainability_as_of_invalid");

  const reliability = readDataField(value, "reliability");
  assertClosedDataRecord(reliability, READINESS_RELIABILITY_KEYS, "investing_suitability_evidence_readiness_reliability_closed_invalid");
  assert(readDataField(reliability, "availability") === "UNAVAILABLE", "investing_suitability_evidence_readiness_reliability_availability_invalid");
  assert(readDataField(reliability, "methodology") === null, "investing_suitability_evidence_readiness_reliability_methodology_invalid");

  const regulatoryApplicability = readDataField(value, "regulatoryApplicability");
  assertClosedDataRecord(regulatoryApplicability, READINESS_REGULATORY_KEYS, "investing_suitability_evidence_readiness_regulatory_closed_invalid");
  assert(readDataField(regulatoryApplicability, "availability") === "UNRESOLVED", "investing_suitability_evidence_readiness_regulatory_availability_invalid");
  assert(readDataField(regulatoryApplicability, "classification") === null, "investing_suitability_evidence_readiness_regulatory_classification_invalid");

  const readiness = readDataField(value, "readiness");
  assertClosedDataRecord(readiness, READINESS_STATE_KEYS, "investing_suitability_evidence_readiness_state_closed_invalid");
  const readinessReasonCodes = materializeStringArray(
    readDataField(readiness, "reasonCodes"),
    "investing_suitability_evidence_readiness_reason_codes_invalid",
  );
  assert(readDataField(readiness, "availability") === "UNAVAILABLE", "investing_suitability_evidence_readiness_state_availability_invalid");
  assert(
    readinessReasonCodes.length === CANONICAL_INVESTING_SUITABILITY_READINESS_REASON_CODES.length &&
      CANONICAL_INVESTING_SUITABILITY_READINESS_REASON_CODES.every((reason, index) => readinessReasonCodes[index] === reason),
    "investing_suitability_evidence_readiness_reason_codes_invalid",
  );

  const assessedAt = readDataField(value, "assessedAt");
  const assessmentFingerprint = readDataField(value, "assessmentFingerprint");
  assertTimestamp(assessedAt, "investing_suitability_evidence_readiness_assessed_at_invalid");
  assertSha256(assessmentFingerprint, "investing_suitability_evidence_readiness_fingerprint_invalid");

  const materialized = {
    contractVersion: CANONICAL_INVESTING_SUITABILITY_READINESS_CONTRACT_VERSION,
    authority: materializeAuthority(readDataField(value, "authority"), "investing_suitability_evidence_readiness"),
    lineage: {
      planId: readDataField(lineage, "planId") as string,
      planVersion,
      activatedAt: readDataField(lineage, "activatedAt") as string,
      updatedAt: readDataField(lineage, "updatedAt") as string,
      structuredSchemaVersion,
      planSemanticFingerprint: readDataField(lineage, "planSemanticFingerprint") as string,
      intentFingerprint: readDataField(lineage, "intentFingerprint") as string,
      policyMethodologyAssessmentFingerprint: readDataField(lineage, "policyMethodologyAssessmentFingerprint") as string,
    },
    knownIntent: materializeKnownIntent(readDataField(value, "knownIntent"), "investing_suitability_evidence_readiness"),
    evidence: {
      knowledgeExperience: materializeUnavailableEvidenceDomain(readDataField(evidence, "knowledgeExperience"), "investing_suitability_evidence_readiness_knowledge"),
      financialSituation: materializeUnavailableEvidenceDomain(readDataField(evidence, "financialSituation"), "investing_suitability_evidence_readiness_financial"),
      lossBearingCapacity: materializeUnavailableEvidenceDomain(readDataField(evidence, "lossBearingCapacity"), "investing_suitability_evidence_readiness_loss"),
      riskTolerance: materializeUnavailableEvidenceDomain(readDataField(evidence, "riskTolerance"), "investing_suitability_evidence_readiness_risk_tolerance"),
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
      reasonCodes: readinessReasonCodes as readonly CanonicalInvestingSuitabilityReadinessReasonCodeV1[],
    },
    assessedAt,
    assessmentFingerprint,
  } satisfies CanonicalInvestingSuitabilityReadinessV1;

  assertId(materialized.lineage.planId, "investing_suitability_evidence_readiness_plan_id_invalid");
  assertTimestamp(materialized.lineage.activatedAt, "investing_suitability_evidence_readiness_plan_activated_at_invalid");
  assertTimestamp(materialized.lineage.updatedAt, "investing_suitability_evidence_readiness_plan_updated_at_invalid");
  assertSha256(materialized.lineage.planSemanticFingerprint, "investing_suitability_evidence_readiness_plan_semantic_fingerprint_invalid");
  assertSha256(materialized.lineage.intentFingerprint, "investing_suitability_evidence_readiness_intent_fingerprint_invalid");
  assertSha256(materialized.lineage.policyMethodologyAssessmentFingerprint, "investing_suitability_evidence_readiness_policy_fingerprint_invalid");
  assert(
    hashCanonicalInvestingSuitabilityReadinessV1(materialized) === materialized.assessmentFingerprint,
    "investing_suitability_evidence_readiness_fingerprint_mismatch",
  );
  return materialized;
}

function assertSame(value: unknown, expected: unknown, code: string) {
  assert(value === expected, code);
}

function assertAuthorityConsistency(
  intent: CanonicalInvestingMandateIntentV1,
  policy: CanonicalInvestingPolicyMethodologyAssessmentV1,
  readiness: CanonicalInvestingSuitabilityReadinessV1,
) {
  for (const key of AUTHORITY_KEYS) {
    assertSame(policy.intent.authority[key], intent.authority[key], `investing_suitability_evidence_${key}_mismatch`);
    assertSame(readiness.authority[key], intent.authority[key], `investing_suitability_evidence_${key}_mismatch`);
  }
}

function assertPlanLineageConsistency(
  intent: CanonicalInvestingMandateIntentV1,
  policy: CanonicalInvestingPolicyMethodologyAssessmentV1,
  readiness: CanonicalInvestingSuitabilityReadinessV1,
) {
  assertSame(policy.intent.intentFingerprint, intent.lineage.intentFingerprint, "investing_suitability_evidence_b2a_intent_fingerprint_lineage_mismatch");
  assertSame(readiness.lineage.intentFingerprint, intent.lineage.intentFingerprint, "investing_suitability_evidence_b2b1_intent_fingerprint_lineage_mismatch");
  assertSame(readiness.lineage.policyMethodologyAssessmentFingerprint, policy.assessmentFingerprint, "investing_suitability_evidence_b2b1_policy_fingerprint_lineage_mismatch");
  assertSame(readiness.assessmentFingerprint, hashCanonicalInvestingSuitabilityReadinessV1(readiness), "investing_suitability_evidence_b2b1_readiness_fingerprint_lineage_mismatch");

  assertSame(policy.intent.plan.planId, intent.plan.planId, "investing_suitability_evidence_plan_id_mismatch");
  assertSame(policy.intent.plan.planVersion, intent.plan.planVersion, "investing_suitability_evidence_plan_version_mismatch");
  assertSame(policy.intent.plan.activatedAt, intent.plan.activatedAt, "investing_suitability_evidence_plan_activated_at_mismatch");
  assertSame(policy.intent.plan.updatedAt, intent.plan.updatedAt, "investing_suitability_evidence_plan_updated_at_mismatch");
  assertSame(policy.intent.plan.structuredSchemaVersion, intent.plan.structuredSchemaVersion, "investing_suitability_evidence_plan_schema_mismatch");
  assertSame(policy.intent.plan.semanticFingerprint, intent.plan.semanticFingerprint, "investing_suitability_evidence_plan_semantic_fingerprint_mismatch");

  assertSame(readiness.lineage.planId, intent.plan.planId, "investing_suitability_evidence_plan_id_mismatch");
  assertSame(readiness.lineage.planVersion, intent.plan.planVersion, "investing_suitability_evidence_plan_version_mismatch");
  assertSame(readiness.lineage.activatedAt, intent.plan.activatedAt, "investing_suitability_evidence_plan_activated_at_mismatch");
  assertSame(readiness.lineage.updatedAt, intent.plan.updatedAt, "investing_suitability_evidence_plan_updated_at_mismatch");
  assertSame(readiness.lineage.structuredSchemaVersion, intent.plan.structuredSchemaVersion, "investing_suitability_evidence_plan_schema_mismatch");
  assertSame(readiness.lineage.planSemanticFingerprint, intent.plan.semanticFingerprint, "investing_suitability_evidence_plan_semantic_fingerprint_mismatch");

  assertSame(policy.intent.declaredIntent.objective, intent.intent.objective, "investing_suitability_evidence_objective_mismatch");
  assertSame(policy.intent.declaredIntent.riskProfile, intent.intent.riskProfile, "investing_suitability_evidence_risk_profile_mismatch");
  assertSame(policy.intent.declaredIntent.horizon, intent.intent.horizon, "investing_suitability_evidence_horizon_mismatch");
  assertSame(readiness.knownIntent.objective, intent.intent.objective, "investing_suitability_evidence_objective_mismatch");
  assertSame(readiness.knownIntent.riskProfile, intent.intent.riskProfile, "investing_suitability_evidence_risk_profile_mismatch");
  assertSame(readiness.knownIntent.horizon, intent.intent.horizon, "investing_suitability_evidence_horizon_mismatch");
}

function assertTemporalLineage(authoredAt: string, policyAssessedAt: string, readinessAssessedAt: string, assessedAt: string) {
  assert(authoredAt <= policyAssessedAt, "investing_suitability_evidence_temporal_lineage_invalid");
  assert(policyAssessedAt <= readinessAssessedAt, "investing_suitability_evidence_temporal_lineage_invalid");
  assert(readinessAssessedAt <= assessedAt, "investing_suitability_evidence_temporal_lineage_invalid");
}

function assertUpstreamPlanTemporalLineage(intent: CanonicalInvestingMandateIntentV1) {
  assert(
    intent.plan.activatedAt <= intent.plan.updatedAt,
    "investing_suitability_evidence_upstream_plan_temporal_lineage_invalid",
  );
  assert(
    intent.plan.updatedAt <= intent.lineage.authoredAt,
    "investing_suitability_evidence_upstream_plan_temporal_lineage_invalid",
  );
  assert(
    intent.plan.activatedAt <= intent.lineage.authoredAt,
    "investing_suitability_evidence_upstream_plan_temporal_lineage_invalid",
  );
}

function unavailableSourceAuthorityDomain(): CanonicalInvestingSuitabilityEvidenceSourceAuthorityDomainV1 {
  return {
    availability: "UNAVAILABLE",
    acceptedSource: null,
  };
}

function evidenceAuthorityFingerprintInput(
  assessment: Omit<CanonicalInvestingSuitabilityEvidenceAuthorityV1, "evidenceAuthorityFingerprint">,
) {
  return {
    ...assessment,
    lineage: {
      ...assessment.lineage,
      planVersion: String(assessment.lineage.planVersion),
      structuredSchemaVersion: String(assessment.lineage.structuredSchemaVersion),
    },
  };
}

export function hashCanonicalInvestingSuitabilityEvidenceAuthorityV1(
  assessment:
    | CanonicalInvestingSuitabilityEvidenceAuthorityV1
    | Omit<CanonicalInvestingSuitabilityEvidenceAuthorityV1, "evidenceAuthorityFingerprint">,
) {
  const hashable: Record<string, unknown> = { ...assessment };
  delete hashable.evidenceAuthorityFingerprint;
  return canonicalSha256(
    evidenceAuthorityFingerprintInput(
      hashable as Omit<CanonicalInvestingSuitabilityEvidenceAuthorityV1, "evidenceAuthorityFingerprint">,
    ),
  );
}

export function assessCanonicalInvestingSuitabilityEvidenceAuthorityV1(
  input: CanonicalInvestingSuitabilityEvidenceAuthorityInputV1,
): CanonicalInvestingSuitabilityEvidenceAuthorityV1 {
  assertClosedDataRecord(input, ROOT_INPUT_KEYS, "investing_suitability_evidence_input_closed_invalid");
  const intent = materializeIntent(readDataField(input, "intent"));
  const policyMethodologyAssessment = materializePolicyMethodologyAssessment(readDataField(input, "policyMethodologyAssessment"));
  const suitabilityReadiness = materializeReadiness(readDataField(input, "suitabilityReadiness"));
  const assessedAt = readDataField(input, "assessedAt");
  assertTimestamp(assessedAt, "investing_suitability_evidence_assessed_at_invalid");

  assertAuthorityConsistency(intent, policyMethodologyAssessment, suitabilityReadiness);
  assertPlanLineageConsistency(intent, policyMethodologyAssessment, suitabilityReadiness);
  assertUpstreamPlanTemporalLineage(intent);
  assertTemporalLineage(
    intent.lineage.authoredAt,
    policyMethodologyAssessment.assessedAt,
    suitabilityReadiness.assessedAt,
    assessedAt,
  );

  const draft = {
    contractVersion: CANONICAL_INVESTING_SUITABILITY_EVIDENCE_AUTHORITY_CONTRACT_VERSION,
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
      suitabilityReadinessAssessmentFingerprint: suitabilityReadiness.assessmentFingerprint,
    },
    knownIntent: intent.intent,
    sourceAuthority: {
      knowledgeExperience: unavailableSourceAuthorityDomain(),
      financialSituation: unavailableSourceAuthorityDomain(),
      lossBearingCapacity: unavailableSourceAuthorityDomain(),
      riskTolerance: unavailableSourceAuthorityDomain(),
      sustainabilityPreferences: {
        applicability: "UNRESOLVED",
        acceptedSource: null,
      },
    },
    reliabilityAuthority: {
      availability: "UNAVAILABLE",
      methodology: null,
    },
    regulatoryClassificationAuthority: {
      availability: "UNRESOLVED",
      classification: null,
      source: null,
    },
    evidenceProvenanceAuthority: {
      availability: "UNAVAILABLE",
      reasonCodes: CANONICAL_INVESTING_SUITABILITY_EVIDENCE_AUTHORITY_REASON_CODES,
    },
    assessedAt,
  } satisfies Omit<CanonicalInvestingSuitabilityEvidenceAuthorityV1, "evidenceAuthorityFingerprint">;

  const assessment = {
    ...draft,
    evidenceAuthorityFingerprint: hashCanonicalInvestingSuitabilityEvidenceAuthorityV1(draft),
  } satisfies CanonicalInvestingSuitabilityEvidenceAuthorityV1;

  return deepFreezeCanonical(assessment) as CanonicalInvestingSuitabilityEvidenceAuthorityV1;
}
