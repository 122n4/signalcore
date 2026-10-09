import {
  assertHashRefDomainV1,
  canonicalDateV1,
  canonicalIntegerV1,
  canonicalOpaqueStringV1,
  canonicalSha256HexV1,
  canonicalTextV1,
  hashRefV1,
  i5ResearchInternalCanonicalJsonBytesV1,
  immutableBehaviorTokenV1,
  sha256HexV1,
  type CanonicalJsonValue,
  type CanonicalSha256HexV1,
  type HashRefV1,
} from "./canonical";
import { assertEngineV2ExecutionConfig, assertEngineV2MetricRequestSet } from "./engineV2ScientificProfile";
import { hashExecutionConfigV1, hashMetricRequestSetV1, type ExecutionConfigHashPayloadV1, type MetricRequestSetHashPayloadV1 } from "./executionMaterials";
import { compareRationalV1, decimalStringToRationalV1 } from "./exactRational";
import { assertMetricResultRecordV2 } from "./researchMetrics";
import { validationAssessmentMetricNumericKindV1, type CanonicalAssessmentNumericV1, type ValidationAssessmentOperatorV1, type ValidationAssessmentThresholdV1 } from "./validationAssessment";

export const blindTruthProtocolDomainV1 = "SYNTRAKE:BLIND_TRUTH_PROTOCOL:V1" as const;
export const blindTruthRegistrationDomainV1 = "SYNTRAKE:BLIND_TRUTH_REGISTRATION:V1" as const;
export const blindTruthVaultSealDomainV1 = "SYNTRAKE:BLIND_TRUTH_VAULT_SEAL:V1" as const;
export const blindTruthEvaluationDomainV1 = "SYNTRAKE:BLIND_TRUTH_EVALUATION:V1" as const;
export const blindTruthRevealResultEventDomainV1 = "SYNTRAKE:BLIND_TRUTH_REVEAL_RESULT_EVENT:V1" as const;
export const blindTruthHoldoutScopeDigestDomainV1 = "SYNTRAKE:BLIND_TRUTH_HOLDOUT_SCOPE:V1" as const;
export const blindTruthCommitmentDomainV1 = "SYNTRAKE:BLIND_TRUTH_HOLDOUT_COMMITMENT:V1" as const;

export const blindTruthLocalHashDomainsV1 = Object.freeze([
  blindTruthProtocolDomainV1,
  blindTruthRegistrationDomainV1,
  blindTruthVaultSealDomainV1,
  blindTruthEvaluationDomainV1,
  blindTruthRevealResultEventDomainV1,
] as const);

export type BlindTruthLocalHashDomainV1 = typeof blindTruthLocalHashDomainsV1[number];
type ScientificPromotionHashDomainForBlindTruthV1 = "SYNTRAKE:SCIENTIFIC_PROMOTION_PROTOCOL:V1" | "SYNTRAKE:SCIENTIFIC_PROMOTION_TRANSITION:V1";
export type BlindTruthHashRefV1<D extends BlindTruthLocalHashDomainV1 = BlindTruthLocalHashDomainV1> = Readonly<{ hashAlgorithm: "SHA-256"; hashDomain: D; hashVersion: "SYNTRAKE_SHA256_V1"; hashHex: CanonicalSha256HexV1 }>;
export type BlindTruthOutcomeV1 = "PASS" | "FAIL" | "INSUFFICIENT_EVIDENCE";
export type BlindTruthEventStateV1 = "REVEAL_STARTED" | "REVEAL_COMPLETED" | "REVEAL_FAILED_CLOSED";
export type BlindTruthReasonV1 = typeof blindTruthReasonVocabularyV1[number];
export type BlindTruthOperatorV1 = ValidationAssessmentOperatorV1;

export const blindTruthReasonVocabularyV1 = Object.freeze([
  "AUTHORITY_FAILURE", "WRONG_TENANT", "WRONG_INVESTIGATION", "WRONG_SUBJECT", "WRONG_PROMOTION_STATE",
  "STALE_PROMOTION_TRANSITION", "SUPERSEDED_PROMOTION_AUTHORITY", "DIVERGENT_EXISTING_IDENTITY",
  "REGISTRATION_ALREADY_EXISTS", "VAULT_SEAL_ALREADY_EXISTS", "EVALUATION_ALREADY_EXISTS", "REVEAL_ALREADY_STARTED",
  "FINAL_EVENT_ALREADY_EXISTS", "MISSING_VAULT_CAPABILITY", "VAULT_UNAVAILABLE", "ANTI_REUSE_INDEX_UNAVAILABLE",
  "ANTI_REUSE_KEY_ROTATION_INCOMPLETE", "HOLDOUT_REUSE_DETECTED", "HOLDOUT_ALREADY_EXPOSED", "EMBARGO_VIOLATION",
  "ACCESS_AUDIT_UNAVAILABLE", "MALFORMED_COMMITMENT", "COMMITMENT_MISMATCH", "PLAINTEXT_LENGTH_MISMATCH",
  "HOLDOUT_SCOPE_MISMATCH", "PROVIDER_VERSION_MISMATCH", "MALFORMED_HOLDOUT", "INCOMPATIBLE_ENGINE_VERSION",
  "INCOMPATIBLE_METRIC_REGISTRY", "INCOMPATIBLE_CRITERIA", "WRONG_HASHREF_DOMAIN", "MALFORMED_HASHREF", "AMBIGUOUS_EVENT_CHAIN",
] as const);

const outcomeVocabulary = Object.freeze(["PASS", "FAIL", "INSUFFICIENT_EVIDENCE"] as const);
const eventStateVocabulary = Object.freeze(["REVEAL_STARTED", "REVEAL_COMPLETED", "REVEAL_FAILED_CLOSED"] as const);
const scalarOperators = new Set<BlindTruthOperatorV1>(["LT", "LTE", "EQ", "GTE", "GT"]);
const rangeOperators = new Set<BlindTruthOperatorV1>(["BETWEEN_INCLUSIVE", "OUTSIDE_EXCLUSIVE"]);
const allOperators = new Set<BlindTruthOperatorV1>([...scalarOperators, ...rangeOperators]);
const reasons = new Set<string>(blindTruthReasonVocabularyV1);
const outcomes = new Set<string>(outcomeVocabulary);
const states = new Set<string>(eventStateVocabulary);
const mutableProviderAliases = /^(?:latest|current|stable|default|production|active)$/iu;

export type BlindTruthEvaluatorProfileV1 = Readonly<{ engineId: "HISTORICAL_EXECUTION_ADAPTER"; engineVersion: "ENGINE_V20260926"; metricRegistryVersion: "METRIC_REGISTRY_V20260927"; metricResultArtifactSchemaVersion: "METRIC_RESULT_SET_V2"; blindTruthEvaluatorBehaviorVersion: "BLIND_TRUTH_EVALUATOR_V1" }>;
export type BlindTruthHoldoutScopeV1 = Readonly<{ schemaVersion: "BLIND_TRUTH_HOLDOUT_SCOPE_V1"; providerId: string; providerDatasetId: string; providerDatasetVersion: string; markets: readonly string[]; frequency: string; fields: readonly string[]; coverageStart: string; coverageEnd: string; calendarId: string; timezone: string }>;
export type BlindTruthThresholdV1 = ValidationAssessmentThresholdV1;
export type BlindTruthCriterionV1 = Readonly<{ criterionId: string; criterionVersion: "CRITERION_V1"; required: boolean; metricId: string; metricVersion: "METRIC_V2"; operator: BlindTruthOperatorV1; threshold: BlindTruthThresholdV1 }>;
export type BlindTruthForeignPromotionRefV1<D extends ScientificPromotionHashDomainForBlindTruthV1> = Readonly<{ hashAlgorithm: "SHA-256"; hashDomain: D; hashVersion: "SYNTRAKE_SHA256_V1"; hashHex: CanonicalSha256HexV1 }>;
export type BlindTruthRegistrationV1 = Readonly<{ schemaVersion: "BLIND_TRUTH_REGISTRATION_V1"; protocol: BlindTruthHashRefV1<typeof blindTruthProtocolDomainV1>; subjectExperiment: HashRefV1; subjectExperimentParameters: HashRefV1; subjectResearchIr: HashRefV1; promotionProtocol: BlindTruthForeignPromotionRefV1<"SYNTRAKE:SCIENTIFIC_PROMOTION_PROTOCOL:V1">; promotionTransition: BlindTruthForeignPromotionRefV1<"SYNTRAKE:SCIENTIFIC_PROMOTION_TRANSITION:V1">; hypothesis: HashRefV1; metricRequestSet: HashRefV1; executionConfig: HashRefV1; blindTruthCriteria: readonly BlindTruthCriterionV1[]; holdoutScope: BlindTruthHoldoutScopeV1; evaluatorProfile: BlindTruthEvaluatorProfileV1 }>;
export type BlindTruthVaultSealV1 = Readonly<{ schemaVersion: "BLIND_TRUTH_VAULT_SEAL_V1"; protocol: BlindTruthHashRefV1<typeof blindTruthProtocolDomainV1>; registration: BlindTruthHashRefV1<typeof blindTruthRegistrationDomainV1>; holdoutScopeDigest: CanonicalSha256HexV1; commitmentAlgorithm: "SHA256_DOMAIN_SEPARATED_SALTED_V1"; commitmentHash: CanonicalSha256HexV1; declaredPlaintextByteLength: string; vaultFormatVersion: "BLIND_TRUTH_VAULT_FORMAT_V1" }>;
export type BlindTruthEvaluationV1 = Readonly<{ schemaVersion: "BLIND_TRUTH_EVALUATION_V1"; protocol: BlindTruthHashRefV1<typeof blindTruthProtocolDomainV1>; registration: BlindTruthHashRefV1<typeof blindTruthRegistrationDomainV1>; vaultSeal: BlindTruthHashRefV1<typeof blindTruthVaultSealDomainV1>; evaluatorProfile: BlindTruthEvaluatorProfileV1 }>;
export type BlindTruthMetricResultRecordV1 = Readonly<Record<string, CanonicalJsonValue>>;
export type BlindTruthCriterionOutcomeV1 = Readonly<{ criterionId: string; criterionVersion: "CRITERION_V1"; metricId: string; metricVersion: "METRIC_V2"; status: BlindTruthOutcomeV1; observedMetric: BlindTruthMetricResultRecordV1 | null }>;
export type BlindTruthResultV1 = Readonly<{ registration: BlindTruthHashRefV1<typeof blindTruthRegistrationDomainV1>; vaultSeal: BlindTruthHashRefV1<typeof blindTruthVaultSealDomainV1>; evaluation: BlindTruthHashRefV1<typeof blindTruthEvaluationDomainV1>; revealedDatasetSnapshot: HashRefV1; revealedDatasetSeries: readonly HashRefV1[]; observedMetricResults: readonly BlindTruthMetricResultRecordV1[]; criterionOutcomes: readonly BlindTruthCriterionOutcomeV1[]; overallOutcome: BlindTruthOutcomeV1 }>;
export type BlindTruthRevealResultEventV1 = Readonly<{ schemaVersion: "BLIND_TRUTH_REVEAL_RESULT_EVENT_V1"; protocol: BlindTruthHashRefV1<typeof blindTruthProtocolDomainV1>; registration: BlindTruthHashRefV1<typeof blindTruthRegistrationDomainV1>; vaultSeal: BlindTruthHashRefV1<typeof blindTruthVaultSealDomainV1>; evaluation: BlindTruthHashRefV1<typeof blindTruthEvaluationDomainV1>; predecessorEvent: BlindTruthHashRefV1<typeof blindTruthRevealResultEventDomainV1> | null; eventState: BlindTruthEventStateV1; reason: BlindTruthReasonV1 | null; result: BlindTruthResultV1 | null }>;

export const blindTruthEvaluatorProfileV1: BlindTruthEvaluatorProfileV1 = Object.freeze({ engineId: "HISTORICAL_EXECUTION_ADAPTER", engineVersion: "ENGINE_V20260926", metricRegistryVersion: "METRIC_REGISTRY_V20260927", metricResultArtifactSchemaVersion: "METRIC_RESULT_SET_V2", blindTruthEvaluatorBehaviorVersion: "BLIND_TRUTH_EVALUATOR_V1" });

export function canonicalBlindTruthProtocolV1(): CanonicalJsonValue { return { schemaVersion: "BLIND_TRUTH_PROTOCOL_V1", protocolId: "BLIND_TRUTH_PROTOCOL_V20261009", commitmentAlgorithm: "SHA256_DOMAIN_SEPARATED_SALTED_V1", commitmentDomain: blindTruthCommitmentDomainV1, reuseFingerprintAlgorithm: "HMAC_SHA256_DOMAIN_SEPARATED_NORMALIZED_HOLDOUT_V1", evaluatorBehaviorVersion: "BLIND_TRUTH_EVALUATOR_V1", allowedOutcomeVocabulary: [...outcomeVocabulary], eventStateVocabulary: [...eventStateVocabulary], reasonVocabulary: [...blindTruthReasonVocabularyV1] }; }
export function canonicalBlindTruthProtocolBytesV1(): Buffer { return canonicalBytes(canonicalBlindTruthProtocolV1()); }
export function hashBlindTruthProtocolV1(): BlindTruthHashRefV1<typeof blindTruthProtocolDomainV1> { return localRef(blindTruthProtocolDomainV1, hashLocal(blindTruthProtocolDomainV1, canonicalBlindTruthProtocolV1())); }
export function blindTruthOneShotCandidateKeyV1(input: Pick<BlindTruthRegistrationV1, "subjectExperiment" | "subjectExperimentParameters" | "subjectResearchIr">): CanonicalJsonValue { return { schemaVersion: "BLIND_TRUTH_ONE_SHOT_CANDIDATE_KEY_V1", subjectExperiment: canonicalGlobalRef(input.subjectExperiment, "SYNTRAKE:EXPERIMENT:V1"), subjectExperimentParameters: canonicalGlobalRef(input.subjectExperimentParameters, "SYNTRAKE:EXPERIMENT_PARAMETERS:V1"), subjectResearchIr: canonicalGlobalRef(input.subjectResearchIr, "SYNTRAKE:RESEARCH_IR:V1") }; }

export function canonicalBlindTruthHoldoutScopeV1(input: BlindTruthHoldoutScopeV1): CanonicalJsonValue {
  assertClosed(input, ["schemaVersion", "providerId", "providerDatasetId", "providerDatasetVersion", "markets", "frequency", "fields", "coverageStart", "coverageEnd", "calendarId", "timezone"]);
  if (input.schemaVersion !== "BLIND_TRUTH_HOLDOUT_SCOPE_V1") throw new Error("BLIND_TRUTH_HOLDOUT_SCOPE_SCHEMA_INVALID");
  const start = canonicalDateV1(input.coverageStart);
  const end = canonicalDateV1(input.coverageEnd);
  if (start > end) throw new Error("BLIND_TRUTH_HOLDOUT_SCOPE_WINDOW_INVALID");
  rejectMutableAlias(input.providerDatasetVersion, "PROVIDER_VERSION_MISMATCH");
  const providerDatasetVersion = immutableBehaviorTokenV1(input.providerDatasetVersion);
  return {
    schemaVersion: input.schemaVersion,
    providerId: immutableBehaviorTokenV1(input.providerId),
    providerDatasetId: immutableBehaviorTokenV1(input.providerDatasetId),
    providerDatasetVersion,
    markets: sortedUniqueText(input.markets, "markets"),
    frequency: immutableBehaviorTokenV1(input.frequency),
    fields: sortedUniqueText(input.fields, "fields"),
    coverageStart: start,
    coverageEnd: end,
    calendarId: immutableBehaviorTokenV1(input.calendarId),
    timezone: canonicalTextV1(input.timezone, { minBytes: 1, maxBytes: 128 }),
  };
}
export function blindTruthHoldoutScopeDigestV1(input: BlindTruthHoldoutScopeV1): CanonicalSha256HexV1 { return sha256HexV1(preimage(blindTruthHoldoutScopeDigestDomainV1, canonicalBlindTruthHoldoutScopeV1(input))); }

export function canonicalBlindTruthCriterionV1(input: BlindTruthCriterionV1): CanonicalJsonValue {
  assertClosed(input, ["criterionId", "criterionVersion", "required", "metricId", "metricVersion", "operator", "threshold"]);
  if (input.criterionVersion !== "CRITERION_V1" || input.metricVersion !== "METRIC_V2" || typeof input.required !== "boolean") throw new Error("INCOMPATIBLE_CRITERIA");
  const criterionId = token(input.criterionId, "criterionId");
  const metricId = token(input.metricId, "metricId");
  validationAssessmentMetricNumericKindV1(metricId);
  if (!allOperators.has(input.operator)) throw new Error("INCOMPATIBLE_CRITERIA");
  return { criterionId, criterionVersion: input.criterionVersion, required: input.required, metricId, metricVersion: input.metricVersion, operator: input.operator, threshold: canonicalBlindTruthThresholdV1(input.threshold, metricId, input.operator) };
}
export function canonicalBlindTruthCriteriaV1(input: readonly BlindTruthCriterionV1[]): CanonicalJsonValue[] {
  if (!Array.isArray(input) || input.length === 0) throw new Error("INCOMPATIBLE_CRITERIA");
  const criteria = input.map(canonicalBlindTruthCriterionV1).sort((l, r) => compareStrings(`${field(l, "criterionId")}\n${field(l, "criterionVersion")}`, `${field(r, "criterionId")}\n${field(r, "criterionVersion")}`));
  rejectDuplicateCanonical(criteria, "criterion");
  rejectDuplicateIdentity(criteria, "criterion", "criterionId", "criterionVersion");
  if (!criteria.some((criterion) => (criterion as { required: boolean }).required)) throw new Error("INCOMPATIBLE_CRITERIA");
  return criteria;
}

export function canonicalBlindTruthRegistrationV1(input: BlindTruthRegistrationV1): CanonicalJsonValue {
  assertClosed(input, ["schemaVersion", "protocol", "subjectExperiment", "subjectExperimentParameters", "subjectResearchIr", "promotionProtocol", "promotionTransition", "hypothesis", "metricRequestSet", "executionConfig", "blindTruthCriteria", "holdoutScope", "evaluatorProfile"]);
  if (input.schemaVersion !== "BLIND_TRUTH_REGISTRATION_V1") throw new Error("BLIND_TRUTH_REGISTRATION_SCHEMA_INVALID");
  const protocol = canonicalLocalRef(input.protocol, blindTruthProtocolDomainV1);
  if (!sameRef(protocol, hashBlindTruthProtocolV1())) throw new Error("INCOMPATIBLE_PROTOCOL_VERSION");
  return {
    schemaVersion: input.schemaVersion,
    protocol,
    subjectExperiment: canonicalGlobalRef(input.subjectExperiment, "SYNTRAKE:EXPERIMENT:V1"),
    subjectExperimentParameters: canonicalGlobalRef(input.subjectExperimentParameters, "SYNTRAKE:EXPERIMENT_PARAMETERS:V1"),
    subjectResearchIr: canonicalGlobalRef(input.subjectResearchIr, "SYNTRAKE:RESEARCH_IR:V1"),
    promotionProtocol: canonicalForeignRef(input.promotionProtocol, "SYNTRAKE:SCIENTIFIC_PROMOTION_PROTOCOL:V1"),
    promotionTransition: canonicalForeignRef(input.promotionTransition, "SYNTRAKE:SCIENTIFIC_PROMOTION_TRANSITION:V1"),
    hypothesis: canonicalGlobalRef(input.hypothesis, "SYNTRAKE:HYPOTHESIS:V1"),
    metricRequestSet: canonicalGlobalRef(input.metricRequestSet, "SYNTRAKE:METRIC_REQUEST_SET:V1"),
    executionConfig: canonicalGlobalRef(input.executionConfig, "SYNTRAKE:EXECUTION_CONFIG:V1"),
    blindTruthCriteria: canonicalBlindTruthCriteriaV1(input.blindTruthCriteria),
    holdoutScope: canonicalBlindTruthHoldoutScopeV1(input.holdoutScope),
    evaluatorProfile: canonicalBlindTruthEvaluatorProfileV1(input.evaluatorProfile),
  };
}
export function canonicalBlindTruthRegistrationBytesV1(input: BlindTruthRegistrationV1): Buffer { return canonicalBytes(canonicalBlindTruthRegistrationV1(input)); }
export function hashBlindTruthRegistrationV1(input: BlindTruthRegistrationV1): BlindTruthHashRefV1<typeof blindTruthRegistrationDomainV1> { return localRef(blindTruthRegistrationDomainV1, hashLocal(blindTruthRegistrationDomainV1, canonicalBlindTruthRegistrationV1(input))); }

export function assertBlindTruthMetricRequestSetBindingV1(input: { registration: BlindTruthRegistrationV1; metricRequestSet: MetricRequestSetHashPayloadV1 }): void {
  const canonical = canonicalBlindTruthRegistrationV1(input.registration) as Record<string, CanonicalJsonValue>;
  try { assertEngineV2MetricRequestSet(input.metricRequestSet); } catch { throw new Error("INCOMPATIBLE_METRIC_REGISTRY"); }
  if (input.metricRequestSet.metricRegistryVersion !== "METRIC_REGISTRY_V20260927") throw new Error("INCOMPATIBLE_METRIC_REGISTRY");
  if ((canonical.metricRequestSet as HashRefV1).hashHex !== hashMetricRequestSetV1(input.metricRequestSet)) throw new Error("MISSING_METRIC_RESULT_SET");
  const requested = new Set(input.metricRequestSet.requests.map((request) => `${request.metricId}\n${request.metricVersion}`));
  for (const criterion of canonical.blindTruthCriteria as CanonicalJsonValue[]) {
    const c = criterion as Record<string, CanonicalJsonValue>;
    if (!requested.has(`${c.metricId}\n${c.metricVersion}`)) throw new Error("INCOMPATIBLE_CRITERIA");
  }
}
export function assertBlindTruthExecutionConfigBindingV1(input: { registration: BlindTruthRegistrationV1; executionConfig: ExecutionConfigHashPayloadV1 }): void {
  const canonical = canonicalBlindTruthRegistrationV1(input.registration) as Record<string, CanonicalJsonValue>;
  try { assertEngineV2ExecutionConfig(input.executionConfig); } catch { throw new Error("INCOMPATIBLE_ENGINE_VERSION"); }
  if ((canonical.executionConfig as HashRefV1).hashHex !== hashExecutionConfigV1(input.executionConfig)) throw new Error("INCOMPATIBLE_ENGINE_VERSION");
}

export function canonicalBlindTruthVaultSealV1(input: BlindTruthVaultSealV1): CanonicalJsonValue {
  assertClosed(input, ["schemaVersion", "protocol", "registration", "holdoutScopeDigest", "commitmentAlgorithm", "commitmentHash", "declaredPlaintextByteLength", "vaultFormatVersion"]);
  if (input.schemaVersion !== "BLIND_TRUTH_VAULT_SEAL_V1") throw new Error("BLIND_TRUTH_VAULT_SEAL_SCHEMA_INVALID");
  if (input.commitmentAlgorithm !== "SHA256_DOMAIN_SEPARATED_SALTED_V1") throw new Error("MALFORMED_COMMITMENT");
  if (input.vaultFormatVersion !== "BLIND_TRUTH_VAULT_FORMAT_V1") throw new Error("MALFORMED_HOLDOUT");
  const protocol = canonicalLocalRef(input.protocol, blindTruthProtocolDomainV1);
  if (!sameRef(protocol, hashBlindTruthProtocolV1())) throw new Error("INCOMPATIBLE_PROTOCOL_VERSION");
  return { schemaVersion: input.schemaVersion, protocol, registration: canonicalLocalRef(input.registration, blindTruthRegistrationDomainV1), holdoutScopeDigest: canonicalSha256HexV1(input.holdoutScopeDigest), commitmentAlgorithm: input.commitmentAlgorithm, commitmentHash: canonicalSha256HexV1(input.commitmentHash), declaredPlaintextByteLength: canonicalIntegerV1(input.declaredPlaintextByteLength, { min: "1", allowNegative: false }), vaultFormatVersion: input.vaultFormatVersion };
}
export function assertBlindTruthVaultSealBindingV1(input: { vaultSeal: BlindTruthVaultSealV1; registration: BlindTruthRegistrationV1 }): void {
  const seal = canonicalBlindTruthVaultSealV1(input.vaultSeal) as Record<string, CanonicalJsonValue>;
  const registration = canonicalBlindTruthRegistrationV1(input.registration) as Record<string, CanonicalJsonValue>;
  if (!sameRef(seal.protocol as BlindTruthHashRefV1, registration.protocol as BlindTruthHashRefV1)) throw new Error("INCOMPATIBLE_PROTOCOL_VERSION");
  if (!sameRef(seal.registration as BlindTruthHashRefV1, hashBlindTruthRegistrationV1(input.registration))) throw new Error("DIVERGENT_EXISTING_IDENTITY");
  if (seal.holdoutScopeDigest !== blindTruthHoldoutScopeDigestV1(input.registration.holdoutScope)) throw new Error("HOLDOUT_SCOPE_MISMATCH");
}
export function canonicalBlindTruthVaultSealBytesV1(input: BlindTruthVaultSealV1): Buffer { return canonicalBytes(canonicalBlindTruthVaultSealV1(input)); }
export function hashBlindTruthVaultSealV1(input: BlindTruthVaultSealV1): BlindTruthHashRefV1<typeof blindTruthVaultSealDomainV1> { return localRef(blindTruthVaultSealDomainV1, hashLocal(blindTruthVaultSealDomainV1, canonicalBlindTruthVaultSealV1(input))); }

export function canonicalBlindTruthEvaluationV1(input: BlindTruthEvaluationV1): CanonicalJsonValue {
  assertClosed(input, ["schemaVersion", "protocol", "registration", "vaultSeal", "evaluatorProfile"]);
  if (input.schemaVersion !== "BLIND_TRUTH_EVALUATION_V1") throw new Error("BLIND_TRUTH_EVALUATION_SCHEMA_INVALID");
  const protocol = canonicalLocalRef(input.protocol, blindTruthProtocolDomainV1);
  if (!sameRef(protocol, hashBlindTruthProtocolV1())) throw new Error("INCOMPATIBLE_PROTOCOL_VERSION");
  return { schemaVersion: input.schemaVersion, protocol, registration: canonicalLocalRef(input.registration, blindTruthRegistrationDomainV1), vaultSeal: canonicalLocalRef(input.vaultSeal, blindTruthVaultSealDomainV1), evaluatorProfile: canonicalBlindTruthEvaluatorProfileV1(input.evaluatorProfile) };
}
export function assertBlindTruthEvaluationBindingV1(input: { evaluation: BlindTruthEvaluationV1; registration: BlindTruthRegistrationV1; vaultSeal: BlindTruthVaultSealV1 }): void {
  const evaluation = canonicalBlindTruthEvaluationV1(input.evaluation) as Record<string, CanonicalJsonValue>;
  const registration = canonicalBlindTruthRegistrationV1(input.registration) as Record<string, CanonicalJsonValue>;
  if (!sameRef(evaluation.protocol as BlindTruthHashRefV1, registration.protocol as BlindTruthHashRefV1)) throw new Error("INCOMPATIBLE_PROTOCOL_VERSION");
  if (!sameRef(evaluation.registration as BlindTruthHashRefV1, hashBlindTruthRegistrationV1(input.registration))) throw new Error("DIVERGENT_EXISTING_IDENTITY");
  if (!sameRef(evaluation.vaultSeal as BlindTruthHashRefV1, hashBlindTruthVaultSealV1(input.vaultSeal))) throw new Error("DIVERGENT_EXISTING_IDENTITY");
  if (canonicalKey(evaluation.evaluatorProfile) !== canonicalKey(registration.evaluatorProfile)) throw new Error("INCOMPATIBLE_ENGINE_VERSION");
}
export function canonicalBlindTruthEvaluationBytesV1(input: BlindTruthEvaluationV1): Buffer { return canonicalBytes(canonicalBlindTruthEvaluationV1(input)); }
export function hashBlindTruthEvaluationV1(input: BlindTruthEvaluationV1): BlindTruthHashRefV1<typeof blindTruthEvaluationDomainV1> { return localRef(blindTruthEvaluationDomainV1, hashLocal(blindTruthEvaluationDomainV1, canonicalBlindTruthEvaluationV1(input))); }

export function evaluateBlindTruthCriterionOutcomesV1(criteria: readonly BlindTruthCriterionV1[], observedMetricResults: readonly BlindTruthMetricResultRecordV1[]): BlindTruthCriterionOutcomeV1[] {
  const canonicalCriteria = canonicalBlindTruthCriteriaV1(criteria) as Record<string, CanonicalJsonValue>[];
  const metrics = canonicalObservedMetricResultsV1(observedMetricResults);
  return canonicalCriteria.map((criterion) => {
    const key = `${criterion.metricId}\n${criterion.metricVersion}`;
    const observed = metrics.get(key) ?? null;
    if (observed === null || observed.status === "UNAVAILABLE") return { criterionId: criterion.criterionId as string, criterionVersion: "CRITERION_V1", metricId: criterion.metricId as string, metricVersion: "METRIC_V2", status: "INSUFFICIENT_EVIDENCE", observedMetric: observed };
    const status = compareObservedToCriterion(observed, criterion) ? "PASS" : "FAIL";
    return { criterionId: criterion.criterionId as string, criterionVersion: "CRITERION_V1", metricId: criterion.metricId as string, metricVersion: "METRIC_V2", status, observedMetric: observed };
  });
}
export function blindTruthOverallOutcomeV1(criteria: readonly BlindTruthCriterionV1[], outcomesInput: readonly BlindTruthCriterionOutcomeV1[]): BlindTruthOutcomeV1 {
  const criteriaCanonical = canonicalBlindTruthCriteriaV1(criteria) as Record<string, CanonicalJsonValue>[];
  const outcomesCanonical = canonicalBlindTruthCriterionOutcomesV1(outcomesInput, criteriaCanonical) as Record<string, CanonicalJsonValue>[];
  const required = new Set(criteriaCanonical.filter((c) => c.required === true).map((c) => `${c.criterionId}\n${c.criterionVersion}`));
  const presentRequired = new Set(outcomesCanonical.filter((outcome) => required.has(`${outcome.criterionId}\n${outcome.criterionVersion}`)).map((outcome) => `${outcome.criterionId}\n${outcome.criterionVersion}`));
  if (presentRequired.size !== required.size) throw new Error("INCOMPATIBLE_CRITERIA");
  for (const outcome of outcomesCanonical) if (required.has(`${outcome.criterionId}\n${outcome.criterionVersion}`) && outcome.status === "FAIL") return "FAIL";
  for (const outcome of outcomesCanonical) if (required.has(`${outcome.criterionId}\n${outcome.criterionVersion}`) && outcome.status === "INSUFFICIENT_EVIDENCE") return "INSUFFICIENT_EVIDENCE";
  return "PASS";
}

export function canonicalBlindTruthResultV1(input: BlindTruthResultV1, registration?: BlindTruthRegistrationV1): CanonicalJsonValue {
  assertClosed(input, ["registration", "vaultSeal", "evaluation", "revealedDatasetSnapshot", "revealedDatasetSeries", "observedMetricResults", "criterionOutcomes", "overallOutcome"]);
  const observedMetricResults = [...canonicalObservedMetricResultsV1(input.observedMetricResults).values()];
  let criterionOutcomes = canonicalBlindTruthCriterionOutcomesV1(input.criterionOutcomes);
  if (registration) {
    const derived = evaluateBlindTruthCriterionOutcomesV1(registration.blindTruthCriteria, input.observedMetricResults);
    criterionOutcomes = canonicalBlindTruthCriterionOutcomesV1(input.criterionOutcomes, canonicalBlindTruthCriteriaV1(registration.blindTruthCriteria) as Record<string, CanonicalJsonValue>[]);
    const canonicalDerived = canonicalBlindTruthCriterionOutcomesV1(derived, canonicalBlindTruthCriteriaV1(registration.blindTruthCriteria) as Record<string, CanonicalJsonValue>[]);
    if (canonicalKey(criterionOutcomes) !== canonicalKey(canonicalDerived)) throw new Error("INCOMPATIBLE_CRITERIA");
    const overallOutcome = blindTruthOverallOutcomeV1(registration.blindTruthCriteria, derived);
    if (input.overallOutcome !== overallOutcome) throw new Error("INCOMPATIBLE_CRITERIA");
  }
  if (!outcomes.has(input.overallOutcome)) throw new Error("INCOMPATIBLE_CRITERIA");
  return { registration: canonicalLocalRef(input.registration, blindTruthRegistrationDomainV1), vaultSeal: canonicalLocalRef(input.vaultSeal, blindTruthVaultSealDomainV1), evaluation: canonicalLocalRef(input.evaluation, blindTruthEvaluationDomainV1), revealedDatasetSnapshot: canonicalGlobalRef(input.revealedDatasetSnapshot, "SYNTRAKE:DATASET_SNAPSHOT:V1"), revealedDatasetSeries: canonicalDatasetSeriesRefs(input.revealedDatasetSeries), observedMetricResults, criterionOutcomes, overallOutcome: input.overallOutcome };
}

export function assertBlindTruthResultBindingV1(input: { result: BlindTruthResultV1; registration: BlindTruthRegistrationV1; vaultSeal: BlindTruthVaultSealV1; evaluation: BlindTruthEvaluationV1 }): void {
  const result = canonicalBlindTruthResultV1(input.result, input.registration) as Record<string, CanonicalJsonValue>;
  if (!sameRef(result.registration as BlindTruthHashRefV1, hashBlindTruthRegistrationV1(input.registration))) throw new Error("DIVERGENT_EXISTING_IDENTITY");
  if (!sameRef(result.vaultSeal as BlindTruthHashRefV1, hashBlindTruthVaultSealV1(input.vaultSeal))) throw new Error("DIVERGENT_EXISTING_IDENTITY");
  if (!sameRef(result.evaluation as BlindTruthHashRefV1, hashBlindTruthEvaluationV1(input.evaluation))) throw new Error("DIVERGENT_EXISTING_IDENTITY");
}


export function canonicalBlindTruthRevealResultEventV1(input: BlindTruthRevealResultEventV1, predecessor?: BlindTruthRevealResultEventV1): CanonicalJsonValue {
  assertClosed(input, ["schemaVersion", "protocol", "registration", "vaultSeal", "evaluation", "predecessorEvent", "eventState", "reason", "result"]);
  if (input.schemaVersion !== "BLIND_TRUTH_REVEAL_RESULT_EVENT_V1") throw new Error("BLIND_TRUTH_EVENT_SCHEMA_INVALID");
  if (!states.has(input.eventState)) throw new Error("AMBIGUOUS_EVENT_CHAIN");
  const protocol = canonicalLocalRef(input.protocol, blindTruthProtocolDomainV1);
  if (!sameRef(protocol, hashBlindTruthProtocolV1())) throw new Error("INCOMPATIBLE_PROTOCOL_VERSION");
  const registration = canonicalLocalRef(input.registration, blindTruthRegistrationDomainV1);
  const vaultSeal = canonicalLocalRef(input.vaultSeal, blindTruthVaultSealDomainV1);
  const evaluation = canonicalLocalRef(input.evaluation, blindTruthEvaluationDomainV1);
  const predecessorEvent = input.predecessorEvent === null ? null : canonicalLocalRef(input.predecessorEvent, blindTruthRevealResultEventDomainV1);
  if (input.eventState === "REVEAL_STARTED") {
    if (predecessorEvent !== null || input.reason !== null || input.result !== null) throw new Error("AMBIGUOUS_EVENT_CHAIN");
  } else {
    if (predecessorEvent === null || !predecessor) throw new Error("AMBIGUOUS_EVENT_CHAIN");
    const pred = canonicalBlindTruthRevealResultEventV1(predecessor) as Record<string, CanonicalJsonValue>;
    if (pred.eventState !== "REVEAL_STARTED" || !sameRef(predecessorEvent, hashBlindTruthRevealResultEventV1(predecessor))) throw new Error("AMBIGUOUS_EVENT_CHAIN");
    for (const [name, ref] of [["protocol", protocol], ["registration", registration], ["vaultSeal", vaultSeal], ["evaluation", evaluation]] as const) if (!sameRef(ref, pred[name] as BlindTruthHashRefV1)) throw new Error("DIVERGENT_EXISTING_IDENTITY");
  }
  if (input.eventState === "REVEAL_COMPLETED" && (input.reason !== null || input.result === null)) throw new Error("AMBIGUOUS_EVENT_CHAIN");
  if (input.eventState === "REVEAL_COMPLETED" && input.result !== null) {
    const result = canonicalBlindTruthResultV1(input.result) as Record<string, CanonicalJsonValue>;
    if (!sameRef(result.registration as BlindTruthHashRefV1, registration) || !sameRef(result.vaultSeal as BlindTruthHashRefV1, vaultSeal) || !sameRef(result.evaluation as BlindTruthHashRefV1, evaluation)) throw new Error("DIVERGENT_EXISTING_IDENTITY");
  }
  if (input.eventState === "REVEAL_FAILED_CLOSED" && (input.result !== null || input.reason === null || !reasons.has(input.reason))) throw new Error("AMBIGUOUS_EVENT_CHAIN");
  return { schemaVersion: input.schemaVersion, protocol, registration, vaultSeal, evaluation, predecessorEvent, eventState: input.eventState, reason: input.reason, result: input.result === null ? null : canonicalBlindTruthResultV1(input.result) };
}
export function canonicalBlindTruthRevealResultEventBytesV1(input: BlindTruthRevealResultEventV1, predecessor?: BlindTruthRevealResultEventV1): Buffer { return canonicalBytes(canonicalBlindTruthRevealResultEventV1(input, predecessor)); }
export function hashBlindTruthRevealResultEventV1(input: BlindTruthRevealResultEventV1, predecessor?: BlindTruthRevealResultEventV1): BlindTruthHashRefV1<typeof blindTruthRevealResultEventDomainV1> { return localRef(blindTruthRevealResultEventDomainV1, hashLocal(blindTruthRevealResultEventDomainV1, canonicalBlindTruthRevealResultEventV1(input, predecessor))); }

function canonicalBlindTruthThresholdV1(input: BlindTruthThresholdV1, metricId: string, operator: BlindTruthOperatorV1): CanonicalJsonValue { const numericKind = validationAssessmentMetricNumericKindV1(metricId); if (scalarOperators.has(operator)) { assertClosed(input, ["kind", "value"]); if (input.kind !== "SCALAR") throw new Error("INCOMPATIBLE_CRITERIA"); const value = canonicalAssessmentNumeric(input.value); if (value.kind !== numericKind) throw new Error("INCOMPATIBLE_CRITERIA"); return { kind: "SCALAR", value }; } assertClosed(input, ["kind", "lower", "upper"]); if (input.kind !== "RANGE") throw new Error("INCOMPATIBLE_CRITERIA"); const lower = canonicalAssessmentNumeric(input.lower); const upper = canonicalAssessmentNumeric(input.upper); if (lower.kind !== numericKind || upper.kind !== numericKind || compareNumericValues(numericKind, lower.value, upper.value) > 0) throw new Error("INCOMPATIBLE_CRITERIA"); return { kind: "RANGE", lower, upper }; }
function canonicalBlindTruthEvaluatorProfileV1(input: BlindTruthEvaluatorProfileV1): CanonicalJsonValue { assertClosed(input, ["engineId", "engineVersion", "metricRegistryVersion", "metricResultArtifactSchemaVersion", "blindTruthEvaluatorBehaviorVersion"]); if (input.engineId !== blindTruthEvaluatorProfileV1.engineId || input.engineVersion !== blindTruthEvaluatorProfileV1.engineVersion) throw new Error("INCOMPATIBLE_ENGINE_VERSION"); if (input.metricRegistryVersion !== blindTruthEvaluatorProfileV1.metricRegistryVersion || input.metricResultArtifactSchemaVersion !== blindTruthEvaluatorProfileV1.metricResultArtifactSchemaVersion) throw new Error("INCOMPATIBLE_METRIC_REGISTRY"); if (input.blindTruthEvaluatorBehaviorVersion !== blindTruthEvaluatorProfileV1.blindTruthEvaluatorBehaviorVersion) throw new Error("INCOMPATIBLE_ENGINE_VERSION"); return { ...blindTruthEvaluatorProfileV1 }; }
function canonicalObservedMetricResultsV1(input: readonly BlindTruthMetricResultRecordV1[]): Map<string, Record<string, CanonicalJsonValue>> { if (!Array.isArray(input)) throw new Error("INCOMPATIBLE_METRIC_REGISTRY"); const records = input.map((record) => { assertMetricResultRecordV2(record); return record as Record<string, CanonicalJsonValue>; }).sort((left, right) => compareStrings(`${left.metricId}\n${left.metricVersion}`, `${right.metricId}\n${right.metricVersion}`)); const result = new Map<string, Record<string, CanonicalJsonValue>>(); for (const record of records) { const key = `${record.metricId}\n${record.metricVersion}`; if (result.has(key)) throw new Error("INCOMPATIBLE_METRIC_REGISTRY"); result.set(key, record); } return result; }
function canonicalBlindTruthCriterionOutcomesV1(input: readonly BlindTruthCriterionOutcomeV1[], criteria?: readonly Record<string, CanonicalJsonValue>[]): CanonicalJsonValue[] { if (!Array.isArray(input) || input.length < 1) throw new Error("INCOMPATIBLE_CRITERIA"); const criterionMap = criteria ? new Map(criteria.map((c) => [`${c.criterionId}\n${c.criterionVersion}`, c])) : null; const normalized = input.map((outcome) => { assertClosed(outcome, ["criterionId", "criterionVersion", "metricId", "metricVersion", "status", "observedMetric"]); if (outcome.criterionVersion !== "CRITERION_V1" || outcome.metricVersion !== "METRIC_V2" || !outcomes.has(outcome.status)) throw new Error("INCOMPATIBLE_CRITERIA"); const criterionId = token(outcome.criterionId, "criterionId"); const metricId = token(outcome.metricId, "metricId"); const criterion = criterionMap?.get(`${criterionId}\n${outcome.criterionVersion}`); if (criterionMap && !criterion) throw new Error("INCOMPATIBLE_CRITERIA"); if (criterion && (criterion.metricId !== metricId || criterion.metricVersion !== outcome.metricVersion)) throw new Error("INCOMPATIBLE_CRITERIA"); const observedMetric = outcome.observedMetric === null ? null : canonicalObservedMetricResultsV1([outcome.observedMetric]).values().next().value as Record<string, CanonicalJsonValue>; return { criterionId, criterionVersion: outcome.criterionVersion, metricId, metricVersion: outcome.metricVersion, status: outcome.status, observedMetric }; }).sort((left, right) => compareStrings(`${left.criterionId}\n${left.criterionVersion}`, `${right.criterionId}\n${right.criterionVersion}`)); rejectDuplicateCanonical(normalized, "criterion outcome"); rejectDuplicateIdentity(normalized, "criterion outcome", "criterionId", "criterionVersion"); return normalized; }
function compareObservedToCriterion(observed: Record<string, CanonicalJsonValue>, criterion: Record<string, CanonicalJsonValue>): boolean { if (observed.status !== "AVAILABLE" || typeof observed.value !== "string") return false; const threshold = criterion.threshold as Record<string, CanonicalJsonValue>; const kind = validationAssessmentMetricNumericKindV1(criterion.metricId as string); const cmp = (value: string) => compareNumericValues(kind, observed.value as string, value); if (threshold.kind === "SCALAR") { const value = (threshold.value as CanonicalAssessmentNumericV1).value; switch (criterion.operator) { case "LT": return cmp(value) < 0; case "LTE": return cmp(value) <= 0; case "EQ": return cmp(value) === 0; case "GTE": return cmp(value) >= 0; case "GT": return cmp(value) > 0; default: throw new Error("INCOMPATIBLE_CRITERIA"); } } const lower = (threshold.lower as CanonicalAssessmentNumericV1).value; const upper = (threshold.upper as CanonicalAssessmentNumericV1).value; switch (criterion.operator) { case "BETWEEN_INCLUSIVE": return cmp(lower) >= 0 && cmp(upper) <= 0; case "OUTSIDE_EXCLUSIVE": return cmp(lower) < 0 || cmp(upper) > 0; default: throw new Error("INCOMPATIBLE_CRITERIA"); } }
function canonicalDatasetSeriesRefs(input: readonly HashRefV1[]): HashRefV1[] { if (!Array.isArray(input) || input.length < 1) throw new Error("MALFORMED_HOLDOUT"); const refs = input.map((ref) => canonicalGlobalRef(ref, "SYNTRAKE:DATASET_SERIES:V1")).sort(compareRefs); rejectDuplicateCanonical(refs, "dataset series"); return refs; }
function canonicalAssessmentNumeric(input: CanonicalAssessmentNumericV1): CanonicalAssessmentNumericV1 { assertClosed(input, ["kind", "value"]); if (input.kind !== "INTEGER" && input.kind !== "RATIO") throw new Error("INCOMPATIBLE_CRITERIA"); return { kind: input.kind, value: input.kind === "INTEGER" ? canonicalIntegerV1(input.value, { allowNegative: true }) : canonicalRatio(input.value) }; }
function canonicalRatio(value: string): string { canonicalOpaqueStringV1(value, { minBytes: 1, maxBytes: 128 }); decimalStringToRationalV1(value); return value.includes(".") ? value.replace(/(\.\d*?)0+$/u, "$1").replace(/\.$/u, "") : value; }
function compareNumericValues(kind: "INTEGER" | "RATIO", left: string, right: string): -1 | 0 | 1 { if (kind === "INTEGER") return BigInt(left) === BigInt(right) ? 0 : BigInt(left) < BigInt(right) ? -1 : 1; return compareRationalV1(decimalStringToRationalV1(left), decimalStringToRationalV1(right)); }
function canonicalGlobalRef(input: HashRefV1, domain: HashRefV1["hashDomain"]): HashRefV1 { const ref = hashRefV1(input); assertHashRefDomainV1(ref, domain); return ref; }
function canonicalForeignRef<D extends ScientificPromotionHashDomainForBlindTruthV1>(input: Readonly<{ hashAlgorithm: string; hashDomain: string; hashVersion: string; hashHex: string }>, domain: D): BlindTruthForeignPromotionRefV1<D> { assertClosed(input, ["hashAlgorithm", "hashDomain", "hashVersion", "hashHex"]); if (input.hashAlgorithm !== "SHA-256" || input.hashVersion !== "SYNTRAKE_SHA256_V1" || input.hashDomain !== domain) throw new Error("WRONG_HASHREF_DOMAIN"); return { hashAlgorithm: "SHA-256", hashDomain: domain, hashVersion: "SYNTRAKE_SHA256_V1", hashHex: canonicalSha256HexV1(input.hashHex) }; }
function canonicalLocalRef<D extends BlindTruthLocalHashDomainV1>(input: BlindTruthHashRefV1, domain: D): BlindTruthHashRefV1<D> { assertClosed(input, ["hashAlgorithm", "hashDomain", "hashVersion", "hashHex"]); if (input.hashAlgorithm !== "SHA-256" || input.hashVersion !== "SYNTRAKE_SHA256_V1" || input.hashDomain !== domain) throw new Error("WRONG_HASHREF_DOMAIN"); return localRef(domain, canonicalSha256HexV1(input.hashHex)); }
function localRef<D extends BlindTruthLocalHashDomainV1>(hashDomain: D, hashHex: CanonicalSha256HexV1): BlindTruthHashRefV1<D> { return { hashAlgorithm: "SHA-256", hashDomain, hashVersion: "SYNTRAKE_SHA256_V1", hashHex }; }
function hashLocal(domain: BlindTruthLocalHashDomainV1, payload: CanonicalJsonValue): CanonicalSha256HexV1 { return sha256HexV1(preimage(domain, payload)); }
function preimage(domain: string, payload: CanonicalJsonValue): Buffer { return Buffer.concat([Buffer.from(`${domain}\n`, "utf8"), canonicalBytes(payload)]); }
function canonicalBytes(value: CanonicalJsonValue): Buffer { return i5ResearchInternalCanonicalJsonBytesV1(value); }
function canonicalKey(value: CanonicalJsonValue): string { return canonicalBytes(value).toString("utf8"); }
function field(value: CanonicalJsonValue, key: string): string { return String((value as Record<string, CanonicalJsonValue>)[key]); }
function compareStrings(left: string, right: string): number { return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8")); }
function compareRefs(left: HashRefV1 | BlindTruthHashRefV1, right: HashRefV1 | BlindTruthHashRefV1): number { return compareStrings(`${left.hashDomain}\n${left.hashHex}`, `${right.hashDomain}\n${right.hashHex}`); }
function sameRef(left: HashRefV1 | BlindTruthHashRefV1, right: HashRefV1 | BlindTruthHashRefV1): boolean { return left.hashAlgorithm === right.hashAlgorithm && left.hashDomain === right.hashDomain && left.hashVersion === right.hashVersion && left.hashHex === right.hashHex; }
function token(value: string, name: string): string { if (typeof value !== "string" || !/^[A-Z][A-Z0-9_]{2,127}$/u.test(value)) throw new Error(`invalid ${name}`); return value; }
function rejectMutableAlias(value: string, error: string) { if (mutableProviderAliases.test(value)) throw new Error(error); }
function sortedUniqueText(input: readonly string[], name: string): string[] { if (!Array.isArray(input) || input.length < 1) throw new Error(`${name} required`); const sorted = input.map((value) => canonicalTextV1(value, { minBytes: 1, maxBytes: 256 })).sort(compareStrings); for (let i = 1; i < sorted.length; i += 1) if (sorted[i] === sorted[i - 1]) throw new Error(`duplicate ${name}`); return sorted; }
function rejectDuplicateIdentity(input: readonly CanonicalJsonValue[], label: string, first: string, second: string): void { const seen = new Set<string>(); for (const item of input) { const record = item as Record<string, CanonicalJsonValue>; const key = `${String(record[first])}\n${String(record[second])}`; if (seen.has(key)) throw new Error(`duplicate ${label}`); seen.add(key); } }
function rejectDuplicateCanonical(values: readonly CanonicalJsonValue[], name: string) { const seen = new Set<string>(); for (const value of values) { const key = canonicalKey(value); if (seen.has(key)) throw new Error(`duplicate ${name}`); seen.add(key); } }
function assertClosed(value: unknown, keys: readonly string[]) { if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error("expected closed plain object"); const allowed = new Set(keys); for (const key of Object.keys(value)) { if (!allowed.has(key)) throw new Error(`undeclared field ${key}`); if ((value as Record<string, unknown>)[key] === undefined) throw new Error(`undefined field ${key}`); } for (const key of keys) if (!Object.hasOwn(value, key)) throw new Error(`missing field ${key}`); }
