import {
  CANONICAL_INVESTING_MANDATE_AUTHORITY_COMPOSITION_CONTRACT_VERSION,
  CANONICAL_INVESTING_MANDATE_AUTHORITY_COMPOSITION_REASON_CODES,
  hashCanonicalInvestingMandateAuthorityCompositionV1,
  type CanonicalInvestingMandateAuthorityCompositionReasonCodeV1,
  type CanonicalInvestingMandateAuthorityCompositionV1,
} from "@/lib/investing/authority/mandateAuthorityComposition";
import {
  canonicalSha256,
  deepFreezeCanonical,
  normalizeIsoTimestamp,
} from "@/lib/investing/engine/v1/canonical";
import { INVESTING_ENGINE_INPUT_CONTRACT_VERSION } from "@/lib/investing/engine/v1/contracts";

export const CANONICAL_INVESTING_ENGINE_MANDATE_ADAPTER_READINESS_CONTRACT_VERSION =
  "canonical-investing-engine-mandate-adapter-readiness/v1" as const;

export const CANONICAL_INVESTING_ENGINE_MANDATE_ADAPTER_READINESS_REASON_CODES = Object.freeze([
  "ENGINE_MANDATE_ADAPTER_AUTHORITY_NOT_ACCEPTED",
  "CANONICAL_MANDATE_AUTHORITY_UNAVAILABLE",
  "CANONICAL_MANDATE_AUTHORITY_NOT_ACCEPTED",
  "CANONICAL_MANDATE_NOT_COMPOSED",
  "ENGINE_MANDATE_ADAPTATION_NOT_PERFORMED",
  "RUNTIME_ACTIVATION_NOT_PERFORMED",
] as const);

export type CanonicalInvestingEngineMandateAdapterReadinessReasonCodeV1 =
  (typeof CANONICAL_INVESTING_ENGINE_MANDATE_ADAPTER_READINESS_REASON_CODES)[number];

export type CanonicalInvestingEngineMandateAdapterReadinessInputV1 = {
  readonly mandateAuthorityComposition: CanonicalInvestingMandateAuthorityCompositionV1;
  readonly assessedAt: string;
};

export type CanonicalInvestingEngineMandateAdapterReadinessV1 = {
  readonly contractVersion: typeof CANONICAL_INVESTING_ENGINE_MANDATE_ADAPTER_READINESS_CONTRACT_VERSION;
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
    readonly mandateAuthorityCompositionFingerprint: string;
  };
  readonly knownIntent: {
    readonly objective: "preservation" | "growth" | "income" | "balanced";
    readonly riskProfile: "Conservative" | "Balanced" | "Aggressive";
    readonly horizon: "Short" | "Medium" | "Long";
  };
  readonly engineTarget: {
    readonly inputContractVersion: typeof INVESTING_ENGINE_INPUT_CONTRACT_VERSION;
  };
  readonly upstreamAuthority: {
    readonly availability: "UNAVAILABLE";
    readonly authority: "NOT_ACCEPTED";
    readonly mandate: null;
    readonly reasonCodes: readonly CanonicalInvestingMandateAuthorityCompositionReasonCodeV1[];
  };
  readonly adapterReadiness: {
    readonly availability: "UNAVAILABLE";
    readonly authority: "NOT_ACCEPTED";
    readonly adaptedMandate: null;
    readonly canonicalInputEligible: false;
    readonly runtimeActivationEligible: false;
    readonly reasonCodes: readonly CanonicalInvestingEngineMandateAdapterReadinessReasonCodeV1[];
  };
  readonly assessedAt: string;
  readonly adapterFingerprint: string;
};

const ROOT_INPUT_KEYS = ["mandateAuthorityComposition", "assessedAt"] as const;
const COMPOSITION_ROOT_KEYS = [
  "contractVersion",
  "authority",
  "lineage",
  "knownIntent",
  "compositionBasis",
  "mandateAuthority",
  "assessedAt",
  "compositionFingerprint",
] as const;
const AUTHORITY_KEYS = [
  "userId",
  "tenantId",
  "membershipId",
  "portfolioId",
  "accountId",
  "environment",
  "accountBaseCurrency",
] as const;
const LINEAGE_KEYS = [
  "planId",
  "planVersion",
  "activatedAt",
  "updatedAt",
  "structuredSchemaVersion",
  "planSemanticFingerprint",
  "planToMandateTranslationFingerprint",
  "intentFingerprint",
  "policyMethodologyAssessmentFingerprint",
  "suitabilityReadinessAssessmentFingerprint",
  "suitabilityEvidenceAuthorityFingerprint",
  "recommendationSuitabilityAuthorityFingerprint",
] as const;
const KNOWN_INTENT_KEYS = ["objective", "riskProfile", "horizon"] as const;
const COMPOSITION_BASIS_KEYS = [
  "planToMandateTranslation",
  "policyMethodology",
  "recommendationSuitability",
] as const;
const TRANSLATION_BASIS_KEYS = ["availability", "mandate"] as const;
const POLICY_BASIS_KEYS = ["availability", "financialAuthority", "declarations"] as const;
const RECOMMENDATION_BASIS_KEYS = ["availability", "authority", "determination"] as const;
const MANDATE_AUTHORITY_KEYS = ["availability", "authority", "mandate", "reasonCodes"] as const;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const SHA256_LOWERCASE_PATTERN = /^[a-f0-9]{64}$/;
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

function materializeAuthority(value: unknown) {
  assertClosedDataRecord(value, AUTHORITY_KEYS, "investing_engine_mandate_adapter_authority_closed_invalid");
  const authority = {
    userId: readDataField(value, "userId"),
    tenantId: readDataField(value, "tenantId"),
    membershipId: readDataField(value, "membershipId"),
    portfolioId: readDataField(value, "portfolioId"),
    accountId: readDataField(value, "accountId"),
    environment: readDataField(value, "environment"),
    accountBaseCurrency: readDataField(value, "accountBaseCurrency"),
  };
  assertId(authority.userId, "investing_engine_mandate_adapter_user_id_invalid");
  assertId(authority.tenantId, "investing_engine_mandate_adapter_tenant_id_invalid");
  assertId(authority.membershipId, "investing_engine_mandate_adapter_membership_id_invalid");
  assertId(authority.portfolioId, "investing_engine_mandate_adapter_portfolio_id_invalid");
  assertId(authority.accountId, "investing_engine_mandate_adapter_account_id_invalid");
  assert(authority.environment === "paper" || authority.environment === "simulation", "investing_engine_mandate_adapter_environment_invalid");
  assertCurrency(authority.accountBaseCurrency, "investing_engine_mandate_adapter_currency_invalid");
  return authority as CanonicalInvestingEngineMandateAdapterReadinessV1["authority"];
}

function materializeLineage(value: unknown) {
  assertClosedDataRecord(value, LINEAGE_KEYS, "investing_engine_mandate_adapter_lineage_closed_invalid");
  const lineage = {
    planId: readDataField(value, "planId"),
    planVersion: readDataField(value, "planVersion"),
    activatedAt: readDataField(value, "activatedAt"),
    updatedAt: readDataField(value, "updatedAt"),
    structuredSchemaVersion: readDataField(value, "structuredSchemaVersion"),
    planSemanticFingerprint: readDataField(value, "planSemanticFingerprint"),
    planToMandateTranslationFingerprint: readDataField(value, "planToMandateTranslationFingerprint"),
    intentFingerprint: readDataField(value, "intentFingerprint"),
    policyMethodologyAssessmentFingerprint: readDataField(value, "policyMethodologyAssessmentFingerprint"),
    suitabilityReadinessAssessmentFingerprint: readDataField(value, "suitabilityReadinessAssessmentFingerprint"),
    suitabilityEvidenceAuthorityFingerprint: readDataField(value, "suitabilityEvidenceAuthorityFingerprint"),
    recommendationSuitabilityAuthorityFingerprint: readDataField(value, "recommendationSuitabilityAuthorityFingerprint"),
  };
  assertId(lineage.planId, "investing_engine_mandate_adapter_plan_id_invalid");
  assertSafePositiveVersion(lineage.planVersion, "investing_engine_mandate_adapter_plan_version_invalid");
  assertTimestamp(lineage.activatedAt, "investing_engine_mandate_adapter_plan_activated_at_invalid");
  assertTimestamp(lineage.updatedAt, "investing_engine_mandate_adapter_plan_updated_at_invalid");
  assert(lineage.structuredSchemaVersion === 1, "investing_engine_mandate_adapter_plan_schema_invalid");
  assertSha256(lineage.planSemanticFingerprint, "investing_engine_mandate_adapter_plan_semantic_fingerprint_invalid");
  assertSha256(lineage.planToMandateTranslationFingerprint, "investing_engine_mandate_adapter_translation_fingerprint_invalid");
  assertSha256(lineage.intentFingerprint, "investing_engine_mandate_adapter_intent_fingerprint_invalid");
  assertSha256(lineage.policyMethodologyAssessmentFingerprint, "investing_engine_mandate_adapter_policy_fingerprint_invalid");
  assertSha256(lineage.suitabilityReadinessAssessmentFingerprint, "investing_engine_mandate_adapter_readiness_fingerprint_invalid");
  assertSha256(lineage.suitabilityEvidenceAuthorityFingerprint, "investing_engine_mandate_adapter_evidence_fingerprint_invalid");
  assertSha256(lineage.recommendationSuitabilityAuthorityFingerprint, "investing_engine_mandate_adapter_recommendation_fingerprint_invalid");
  return lineage as CanonicalInvestingMandateAuthorityCompositionV1["lineage"];
}

function materializeKnownIntent(value: unknown) {
  assertClosedDataRecord(value, KNOWN_INTENT_KEYS, "investing_engine_mandate_adapter_known_intent_closed_invalid");
  const knownIntent = {
    objective: readDataField(value, "objective"),
    riskProfile: readDataField(value, "riskProfile"),
    horizon: readDataField(value, "horizon"),
  };
  assert(typeof knownIntent.objective === "string" && OBJECTIVES.has(knownIntent.objective), "investing_engine_mandate_adapter_objective_invalid");
  assert(typeof knownIntent.riskProfile === "string" && RISK_PROFILES.has(knownIntent.riskProfile), "investing_engine_mandate_adapter_risk_invalid");
  assert(typeof knownIntent.horizon === "string" && HORIZONS.has(knownIntent.horizon), "investing_engine_mandate_adapter_horizon_invalid");
  return knownIntent as CanonicalInvestingEngineMandateAdapterReadinessV1["knownIntent"];
}

function materializeCompositionBasis(value: unknown) {
  assertClosedDataRecord(value, COMPOSITION_BASIS_KEYS, "investing_engine_mandate_adapter_basis_closed_invalid");

  const translation = readDataField(value, "planToMandateTranslation");
  assertClosedDataRecord(translation, TRANSLATION_BASIS_KEYS, "investing_engine_mandate_adapter_translation_basis_closed_invalid");
  assert(readDataField(translation, "availability") === "UNAVAILABLE", "investing_engine_mandate_adapter_translation_availability_invalid");
  assert(readDataField(translation, "mandate") === null, "investing_engine_mandate_adapter_translation_mandate_invalid");

  const policy = readDataField(value, "policyMethodology");
  assertClosedDataRecord(policy, POLICY_BASIS_KEYS, "investing_engine_mandate_adapter_policy_basis_closed_invalid");
  assert(readDataField(policy, "availability") === "UNAVAILABLE", "investing_engine_mandate_adapter_policy_availability_invalid");
  assert(readDataField(policy, "financialAuthority") === "NOT_ACCEPTED", "investing_engine_mandate_adapter_policy_authority_invalid");
  assert(readDataField(policy, "declarations") === null, "investing_engine_mandate_adapter_policy_declarations_invalid");

  const recommendation = readDataField(value, "recommendationSuitability");
  assertClosedDataRecord(recommendation, RECOMMENDATION_BASIS_KEYS, "investing_engine_mandate_adapter_recommendation_basis_closed_invalid");
  assert(readDataField(recommendation, "availability") === "UNAVAILABLE", "investing_engine_mandate_adapter_recommendation_availability_invalid");
  assert(readDataField(recommendation, "authority") === "NOT_ACCEPTED", "investing_engine_mandate_adapter_recommendation_authority_invalid");
  assert(readDataField(recommendation, "determination") === null, "investing_engine_mandate_adapter_recommendation_determination_invalid");

  return {
    planToMandateTranslation: { availability: "UNAVAILABLE", mandate: null },
    policyMethodology: { availability: "UNAVAILABLE", financialAuthority: "NOT_ACCEPTED", declarations: null },
    recommendationSuitability: { availability: "UNAVAILABLE", authority: "NOT_ACCEPTED", determination: null },
  } satisfies CanonicalInvestingMandateAuthorityCompositionV1["compositionBasis"];
}

function materializeCompositionReasonCodes(value: unknown) {
  assertClosedDataArray(value, "investing_engine_mandate_adapter_upstream_reason_codes_invalid");
  assert(value.length === CANONICAL_INVESTING_MANDATE_AUTHORITY_COMPOSITION_REASON_CODES.length, "investing_engine_mandate_adapter_upstream_reason_codes_invalid");
  const output: CanonicalInvestingMandateAuthorityCompositionReasonCodeV1[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    assert(Boolean(descriptor) && descriptor.enumerable === true && "value" in descriptor, "investing_engine_mandate_adapter_upstream_reason_codes_invalid");
    const expected = CANONICAL_INVESTING_MANDATE_AUTHORITY_COMPOSITION_REASON_CODES[index];
    assert(descriptor.value === expected, "investing_engine_mandate_adapter_upstream_reason_codes_invalid");
    assert(!seen.has(descriptor.value), "investing_engine_mandate_adapter_upstream_reason_codes_invalid");
    seen.add(descriptor.value);
    output.push(descriptor.value);
  }
  return output;
}

function materializeMandateAuthority(value: unknown) {
  assertClosedDataRecord(value, MANDATE_AUTHORITY_KEYS, "investing_engine_mandate_adapter_mandate_authority_closed_invalid");
  assert(readDataField(value, "availability") === "UNAVAILABLE", "investing_engine_mandate_adapter_mandate_availability_invalid");
  assert(readDataField(value, "authority") === "NOT_ACCEPTED", "investing_engine_mandate_adapter_mandate_authority_invalid");
  assert(readDataField(value, "mandate") === null, "investing_engine_mandate_adapter_mandate_invalid");
  return {
    availability: "UNAVAILABLE",
    authority: "NOT_ACCEPTED",
    mandate: null,
    reasonCodes: materializeCompositionReasonCodes(readDataField(value, "reasonCodes")),
  } satisfies CanonicalInvestingMandateAuthorityCompositionV1["mandateAuthority"];
}

function materializeMandateAuthorityComposition(value: unknown) {
  assertClosedDataRecord(value, COMPOSITION_ROOT_KEYS, "investing_engine_mandate_adapter_composition_closed_invalid");
  assert(
    readDataField(value, "contractVersion") === CANONICAL_INVESTING_MANDATE_AUTHORITY_COMPOSITION_CONTRACT_VERSION,
    "investing_engine_mandate_adapter_composition_contract_invalid",
  );
  const assessedAt = readDataField(value, "assessedAt");
  const compositionFingerprint = readDataField(value, "compositionFingerprint");
  assertTimestamp(assessedAt, "investing_engine_mandate_adapter_composition_assessed_at_invalid");
  assertSha256(compositionFingerprint, "investing_engine_mandate_adapter_composition_fingerprint_invalid");

  const materialized = {
    contractVersion: CANONICAL_INVESTING_MANDATE_AUTHORITY_COMPOSITION_CONTRACT_VERSION,
    authority: materializeAuthority(readDataField(value, "authority")),
    lineage: materializeLineage(readDataField(value, "lineage")),
    knownIntent: materializeKnownIntent(readDataField(value, "knownIntent")),
    compositionBasis: materializeCompositionBasis(readDataField(value, "compositionBasis")),
    mandateAuthority: materializeMandateAuthority(readDataField(value, "mandateAuthority")),
    assessedAt,
    compositionFingerprint,
  } satisfies CanonicalInvestingMandateAuthorityCompositionV1;

  assert(
    hashCanonicalInvestingMandateAuthorityCompositionV1(materialized) === materialized.compositionFingerprint,
    "investing_engine_mandate_adapter_composition_fingerprint_mismatch",
  );
  return materialized;
}

function adapterFingerprintInput(
  readiness:
    | CanonicalInvestingEngineMandateAdapterReadinessV1
    | Omit<CanonicalInvestingEngineMandateAdapterReadinessV1, "adapterFingerprint">,
) {
  return {
    contractVersion: readiness.contractVersion,
    authority: readiness.authority,
    lineage: {
      ...readiness.lineage,
      planVersion: String(readiness.lineage.planVersion),
      structuredSchemaVersion: String(readiness.lineage.structuredSchemaVersion),
    },
    knownIntent: readiness.knownIntent,
    engineTarget: readiness.engineTarget,
    upstreamAuthority: readiness.upstreamAuthority,
    adapterReadiness: readiness.adapterReadiness,
    assessedAt: readiness.assessedAt,
  };
}

export function hashCanonicalInvestingEngineMandateAdapterReadinessV1(
  readiness:
    | CanonicalInvestingEngineMandateAdapterReadinessV1
    | Omit<CanonicalInvestingEngineMandateAdapterReadinessV1, "adapterFingerprint">,
) {
  return canonicalSha256(adapterFingerprintInput(readiness));
}

export function assessCanonicalInvestingEngineMandateAdapterReadinessV1(
  input: CanonicalInvestingEngineMandateAdapterReadinessInputV1,
): CanonicalInvestingEngineMandateAdapterReadinessV1 {
  assertClosedDataRecord(input, ROOT_INPUT_KEYS, "investing_engine_mandate_adapter_input_closed_invalid");
  const composition = materializeMandateAuthorityComposition(readDataField(input, "mandateAuthorityComposition"));
  const assessedAt = readDataField(input, "assessedAt");
  assertTimestamp(assessedAt, "investing_engine_mandate_adapter_assessed_at_invalid");

  assert(
    composition.lineage.activatedAt <= composition.lineage.updatedAt,
    "investing_engine_mandate_adapter_temporal_lineage_invalid",
  );
  assert(
    composition.lineage.updatedAt <= composition.assessedAt,
    "investing_engine_mandate_adapter_temporal_lineage_invalid",
  );
  assert(
    composition.assessedAt <= assessedAt,
    "investing_engine_mandate_adapter_temporal_lineage_invalid",
  );

  const draft = {
    contractVersion: CANONICAL_INVESTING_ENGINE_MANDATE_ADAPTER_READINESS_CONTRACT_VERSION,
    authority: composition.authority,
    lineage: {
      planId: composition.lineage.planId,
      planVersion: composition.lineage.planVersion,
      activatedAt: composition.lineage.activatedAt,
      updatedAt: composition.lineage.updatedAt,
      structuredSchemaVersion: composition.lineage.structuredSchemaVersion,
      planSemanticFingerprint: composition.lineage.planSemanticFingerprint,
      mandateAuthorityCompositionFingerprint: composition.compositionFingerprint,
    },
    knownIntent: composition.knownIntent,
    engineTarget: {
      inputContractVersion: INVESTING_ENGINE_INPUT_CONTRACT_VERSION,
    },
    upstreamAuthority: composition.mandateAuthority,
    adapterReadiness: {
      availability: "UNAVAILABLE",
      authority: "NOT_ACCEPTED",
      adaptedMandate: null,
      canonicalInputEligible: false,
      runtimeActivationEligible: false,
      reasonCodes: CANONICAL_INVESTING_ENGINE_MANDATE_ADAPTER_READINESS_REASON_CODES,
    },
    assessedAt,
  } satisfies Omit<CanonicalInvestingEngineMandateAdapterReadinessV1, "adapterFingerprint">;

  const readiness = {
    ...draft,
    adapterFingerprint: hashCanonicalInvestingEngineMandateAdapterReadinessV1(draft),
  } satisfies CanonicalInvestingEngineMandateAdapterReadinessV1;

  return deepFreezeCanonical(readiness) as CanonicalInvestingEngineMandateAdapterReadinessV1;
}
