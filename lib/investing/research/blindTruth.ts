import {
  canonicalDateV1,
  canonicalDecimalV1,
  canonicalIntegerV1,
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
import {
  canonicalExecutionConfigHashPayloadV1,
  canonicalMetricRequestSetHashPayloadV1,
  hashExecutionConfigV1,
  hashMetricRequestSetV1,
  type ExecutionConfigHashPayloadV1,
  type MetricRequestSetHashPayloadV1,
} from "./executionMaterials";
import { assertEngineV2ExecutionConfig, assertEngineV2MetricRequestSet } from "./engineV2ScientificProfile";
import { compareRationalV1, decimalStringToRationalV1 } from "./exactRational";
import { assertMetricResultRecordV2 } from "./researchMetrics";
import {
  scientificPromotionProtocolDomainV1,
  scientificPromotionTransitionDomainV1,
  type ScientificPromotionHashRefV1,
} from "./scientificPromotion";
import {
  validationAssessmentMetricNumericKindV1,
  type CanonicalAssessmentNumericV1,
  type ValidationAssessmentOperatorV1,
  type ValidationAssessmentThresholdV1,
} from "./validationAssessment";

export const blindTruthProtocolTokenV1 = "BLIND_TRUTH_PROTOCOL_V20261009" as const;
export const blindTruthCommitmentAlgorithmV1 = "SHA256_DOMAIN_SEPARATED_SALTED_V1" as const;
export const blindTruthCommitmentDomainV1 = "SYNTRAKE:BLIND_TRUTH_HOLDOUT_COMMITMENT:V1" as const;
export const blindTruthHoldoutScopeDigestDomainV1 = "SYNTRAKE:BLIND_TRUTH_HOLDOUT_SCOPE:V1" as const;
export const blindTruthReuseFingerprintAlgorithmV1 = "HMAC_SHA256_DOMAIN_SEPARATED_V1" as const;
export const blindTruthEvaluatorBehaviorVersionV1 = "BLIND_TRUTH_EVALUATOR_V1" as const;
export const blindTruthVaultFormatVersionV1 = "BLIND_TRUTH_VAULT_FORMAT_V1" as const;

export const blindTruthProtocolDomainV1 = "SYNTRAKE:BLIND_TRUTH_PROTOCOL:V1" as const;
export const blindTruthRegistrationDomainV1 = "SYNTRAKE:BLIND_TRUTH_REGISTRATION:V1" as const;
export const blindTruthVaultSealDomainV1 = "SYNTRAKE:BLIND_TRUTH_VAULT_SEAL:V1" as const;
export const blindTruthEvaluationDomainV1 = "SYNTRAKE:BLIND_TRUTH_EVALUATION:V1" as const;
export const blindTruthRevealResultEventDomainV1 = "SYNTRAKE:BLIND_TRUTH_REVEAL_RESULT_EVENT:V1" as const;

export type BlindTruthLocalHashDomainV1 =
  | typeof blindTruthProtocolDomainV1
  | typeof blindTruthRegistrationDomainV1
  | typeof blindTruthVaultSealDomainV1
  | typeof blindTruthEvaluationDomainV1
  | typeof blindTruthRevealResultEventDomainV1;

export type BlindTruthHashRefV1<D extends BlindTruthLocalHashDomainV1 = BlindTruthLocalHashDomainV1> = Readonly<{
  hashAlgorithm: "SHA-256";
  hashDomain: D;
  hashVersion: "SYNTRAKE_SHA256_V1";
  hashHex: CanonicalSha256HexV1;
}>;

export const blindTruthOutcomeVocabularyV1 = Object.freeze([
  "PASS",
  "FAIL",
  "INSUFFICIENT_EVIDENCE",
] as const);
export type BlindTruthOutcomeV1 = (typeof blindTruthOutcomeVocabularyV1)[number];

export const blindTruthEventStateVocabularyV1 = Object.freeze([
  "REVEAL_STARTED",
  "REVEAL_COMPLETED",
  "REVEAL_FAILED_CLOSED",
] as const);
export type BlindTruthEventStateV1 = (typeof blindTruthEventStateVocabularyV1)[number];

export const blindTruthReasonVocabularyV1 = Object.freeze([
  "AUTHORITY_FAILURE",
  "WRONG_TENANT",
  "WRONG_INVESTIGATION",
  "WRONG_SUBJECT",
  "WRONG_PROMOTION_STATE",
  "STALE_PROMOTION_TRANSITION",
  "SUPERSEDED_PROMOTION_AUTHORITY",
  "DIVERGENT_EXISTING_IDENTITY",
  "REGISTRATION_ALREADY_EXISTS",
  "VAULT_SEAL_ALREADY_EXISTS",
  "EVALUATION_ALREADY_EXISTS",
  "REVEAL_ALREADY_STARTED",
  "FINAL_EVENT_ALREADY_EXISTS",
  "MISSING_VAULT_CAPABILITY",
  "VAULT_UNAVAILABLE",
  "ANTI_REUSE_INDEX_UNAVAILABLE",
  "ANTI_REUSE_KEY_ROTATION_INCOMPLETE",
  "HOLDOUT_REUSE_DETECTED",
  "HOLDOUT_ALREADY_EXPOSED",
  "EMBARGO_VIOLATION",
  "ACCESS_AUDIT_UNAVAILABLE",
  "MALFORMED_COMMITMENT",
  "COMMITMENT_MISMATCH",
  "PLAINTEXT_LENGTH_MISMATCH",
  "HOLDOUT_SCOPE_MISMATCH",
  "PROVIDER_VERSION_MISMATCH",
  "MALFORMED_HOLDOUT",
  "INCOMPATIBLE_ENGINE_VERSION",
  "INCOMPATIBLE_METRIC_REGISTRY",
  "INCOMPATIBLE_CRITERIA",
  "WRONG_HASHREF_DOMAIN",
  "MALFORMED_HASHREF",
  "AMBIGUOUS_EVENT_CHAIN",
] as const);
export type BlindTruthReasonV1 = (typeof blindTruthReasonVocabularyV1)[number];

export type BlindTruthEvaluatorProfileV1 = Readonly<{
  engineId: "HISTORICAL_EXECUTION_ADAPTER";
  engineVersion: "ENGINE_V20260926";
  metricRegistryVersion: "METRIC_REGISTRY_V20260927";
  metricResultArtifactSchemaVersion: "METRIC_RESULT_SET_V2";
  blindTruthEvaluatorBehaviorVersion: "BLIND_TRUTH_EVALUATOR_V1";
}>;

export type BlindTruthHoldoutScopeV1 = Readonly<{
  schemaVersion: "BLIND_TRUTH_HOLDOUT_SCOPE_V1";
  providerId: string;
  providerDatasetId: string;
  providerDatasetVersion: string;
  markets: readonly string[];
  frequency: string;
  fields: readonly string[];
  coverageStart: string;
  coverageEnd: string;
  calendarId: string;
  timezone: string;
}>;

export type BlindTruthCriterionV1 = Readonly<{
  criterionId: string;
  criterionVersion: "CRITERION_V1";
  required: boolean;
  metricId: string;
  metricVersion: "METRIC_V2";
  operator: ValidationAssessmentOperatorV1;
  threshold: ValidationAssessmentThresholdV1;
}>;

export type BlindTruthScientificCandidateKeyV1 = Readonly<{
  subjectExperiment: HashRefV1;
  subjectExperimentParameters: HashRefV1;
  subjectResearchIr: HashRefV1;
}>;

export type BlindTruthRegistrationV1 = Readonly<{
  schemaVersion: "BLIND_TRUTH_REGISTRATION_V1";
  protocol: BlindTruthHashRefV1<typeof blindTruthProtocolDomainV1>;
  subjectExperiment: HashRefV1;
  subjectExperimentParameters: HashRefV1;
  subjectResearchIr: HashRefV1;
  promotionProtocol: ScientificPromotionHashRefV1<typeof scientificPromotionProtocolDomainV1>;
  promotionTransition: ScientificPromotionHashRefV1<typeof scientificPromotionTransitionDomainV1>;
  hypothesis: HashRefV1;
  metricRequestSet: HashRefV1;
  executionConfig: HashRefV1;
  blindTruthCriteria: readonly BlindTruthCriterionV1[];
  holdoutScope: BlindTruthHoldoutScopeV1;
  evaluatorProfile: BlindTruthEvaluatorProfileV1;
}>;

export type BlindTruthVaultSealV1 = Readonly<{
  schemaVersion: "BLIND_TRUTH_VAULT_SEAL_V1";
  protocol: BlindTruthHashRefV1<typeof blindTruthProtocolDomainV1>;
  registration: BlindTruthHashRefV1<typeof blindTruthRegistrationDomainV1>;
  holdoutScopeDigest: CanonicalSha256HexV1;
  commitmentAlgorithm: typeof blindTruthCommitmentAlgorithmV1;
  commitmentHash: CanonicalSha256HexV1;
  declaredPlaintextByteLength: string;
  vaultFormatVersion: typeof blindTruthVaultFormatVersionV1;
}>;

export type BlindTruthEvaluationV1 = Readonly<{
  schemaVersion: "BLIND_TRUTH_EVALUATION_V1";
  protocol: BlindTruthHashRefV1<typeof blindTruthProtocolDomainV1>;
  registration: BlindTruthHashRefV1<typeof blindTruthRegistrationDomainV1>;
  vaultSeal: BlindTruthHashRefV1<typeof blindTruthVaultSealDomainV1>;
  evaluatorProfile: BlindTruthEvaluatorProfileV1;
}>;

export type BlindTruthCriterionStatusV1 = "PASS" | "FAIL" | "INSUFFICIENT_EVIDENCE";

export type BlindTruthCriterionOutcomeV1 = Readonly<{
  criterionId: string;
  criterionVersion: "CRITERION_V1";
  required: boolean;
  metricId: string;
  metricVersion: "METRIC_V2";
  status: BlindTruthCriterionStatusV1;
  observedValue: CanonicalAssessmentNumericV1 | null;
}>;

export type BlindTruthResultV1 = Readonly<{
  registration: BlindTruthHashRefV1<typeof blindTruthRegistrationDomainV1>;
  vaultSeal: BlindTruthHashRefV1<typeof blindTruthVaultSealDomainV1>;
  evaluation: BlindTruthHashRefV1<typeof blindTruthEvaluationDomainV1>;
  revealedDatasetSnapshot: HashRefV1;
  revealedDatasetSeries: readonly HashRefV1[];
  observedMetricResults: readonly CanonicalJsonValue[];
  criterionOutcomes: readonly BlindTruthCriterionOutcomeV1[];
  overallOutcome: BlindTruthOutcomeV1;
}>;

export type BlindTruthRevealResultEventV1 = Readonly<{
  schemaVersion: "BLIND_TRUTH_REVEAL_RESULT_EVENT_V1";
  protocol: BlindTruthHashRefV1<typeof blindTruthProtocolDomainV1>;
  registration: BlindTruthHashRefV1<typeof blindTruthRegistrationDomainV1>;
  vaultSeal: BlindTruthHashRefV1<typeof blindTruthVaultSealDomainV1>;
  evaluation: BlindTruthHashRefV1<typeof blindTruthEvaluationDomainV1>;
  predecessorEvent: BlindTruthHashRefV1<typeof blindTruthRevealResultEventDomainV1> | null;
  eventState: BlindTruthEventStateV1;
  reason: BlindTruthReasonV1 | null;
  result: BlindTruthResultV1 | null;
}>;

export type BlindTruthProtocolV1 = Readonly<{
  schemaVersion: "BLIND_TRUTH_PROTOCOL_V1";
  protocolId: typeof blindTruthProtocolTokenV1;
  commitmentAlgorithm: typeof blindTruthCommitmentAlgorithmV1;
  commitmentDomain: typeof blindTruthCommitmentDomainV1;
  reuseFingerprintAlgorithm: typeof blindTruthReuseFingerprintAlgorithmV1;
  evaluatorBehaviorVersion: typeof blindTruthEvaluatorBehaviorVersionV1;
  allowedOutcomeVocabulary: readonly BlindTruthOutcomeV1[];
  eventStateVocabulary: readonly BlindTruthEventStateV1[];
  reasonVocabulary: readonly BlindTruthReasonV1[];
}>;

const protocolKeys = new Set([
  "schemaVersion",
  "protocolId",
  "commitmentAlgorithm",
  "commitmentDomain",
  "reuseFingerprintAlgorithm",
  "evaluatorBehaviorVersion",
  "allowedOutcomeVocabulary",
  "eventStateVocabulary",
  "reasonVocabulary",
]);
const evaluatorProfileKeys = new Set([
  "engineId",
  "engineVersion",
  "metricRegistryVersion",
  "metricResultArtifactSchemaVersion",
  "blindTruthEvaluatorBehaviorVersion",
]);
const holdoutScopeKeys = new Set([
  "schemaVersion",
  "providerId",
  "providerDatasetId",
  "providerDatasetVersion",
  "markets",
  "frequency",
  "fields",
  "coverageStart",
  "coverageEnd",
  "calendarId",
  "timezone",
]);
const criterionKeys = new Set([
  "criterionId",
  "criterionVersion",
  "required",
  "metricId",
  "metricVersion",
  "operator",
  "threshold",
]);
const registrationKeys = new Set([
  "schemaVersion",
  "protocol",
  "subjectExperiment",
  "subjectExperimentParameters",
  "subjectResearchIr",
  "promotionProtocol",
  "promotionTransition",
  "hypothesis",
  "metricRequestSet",
  "executionConfig",
  "blindTruthCriteria",
  "holdoutScope",
  "evaluatorProfile",
]);
const vaultSealKeys = new Set([
  "schemaVersion",
  "protocol",
  "registration",
  "holdoutScopeDigest",
  "commitmentAlgorithm",
  "commitmentHash",
  "declaredPlaintextByteLength",
  "vaultFormatVersion",
]);
const evaluationKeys = new Set(["schemaVersion", "protocol", "registration", "vaultSeal", "evaluatorProfile"]);
const criterionOutcomeKeys = new Set([
  "criterionId",
  "criterionVersion",
  "required",
  "metricId",
  "metricVersion",
  "status",
  "observedValue",
]);
const resultKeys = new Set([
  "registration",
  "vaultSeal",
  "evaluation",
  "revealedDatasetSnapshot",
  "revealedDatasetSeries",
  "observedMetricResults",
  "criterionOutcomes",
  "overallOutcome",
]);
const eventKeys = new Set([
  "schemaVersion",
  "protocol",
  "registration",
  "vaultSeal",
  "evaluation",
  "predecessorEvent",
  "eventState",
  "reason",
  "result",
]);
const localHashRefKeys = new Set(["hashAlgorithm", "hashDomain", "hashVersion", "hashHex"]);
const assessmentNumericKeys = new Set(["kind", "value"]);
const scalarThresholdKeys = new Set(["kind", "value"]);
const rangeThresholdKeys = new Set(["kind", "lower", "upper"]);
const scalarOperators = new Set<ValidationAssessmentOperatorV1>(["LT", "LTE", "EQ", "GTE", "GT"]);
const rangeOperators = new Set<ValidationAssessmentOperatorV1>(["BETWEEN_INCLUSIVE", "OUTSIDE_EXCLUSIVE"]);
const eventStateSet = new Set<string>(blindTruthEventStateVocabularyV1);
const reasonSet = new Set<string>(blindTruthReasonVocabularyV1);
const outcomeSet = new Set<string>(blindTruthOutcomeVocabularyV1);
const mutableAliases = new Set(["latest", "current", "stable", "production", "default", "active", "rolling"]);

export function canonicalBlindTruthProtocolV1(): BlindTruthProtocolV1 {
  const payload: BlindTruthProtocolV1 = {
    schemaVersion: "BLIND_TRUTH_PROTOCOL_V1",
    protocolId: blindTruthProtocolTokenV1,
    commitmentAlgorithm: blindTruthCommitmentAlgorithmV1,
    commitmentDomain: blindTruthCommitmentDomainV1,
    reuseFingerprintAlgorithm: blindTruthReuseFingerprintAlgorithmV1,
    evaluatorBehaviorVersion: blindTruthEvaluatorBehaviorVersionV1,
    allowedOutcomeVocabulary: [...blindTruthOutcomeVocabularyV1],
    eventStateVocabulary: [...blindTruthEventStateVocabularyV1],
    reasonVocabulary: [...blindTruthReasonVocabularyV1],
  };
  assertClosedPlainObject(payload, protocolKeys, "BlindTruthProtocol");
  return payload;
}

export function canonicalBlindTruthProtocolBytesV1(): Buffer {
  return i5ResearchInternalCanonicalJsonBytesV1(canonicalBlindTruthProtocolV1() as unknown as CanonicalJsonValue);
}

export function hashBlindTruthProtocolV1(): BlindTruthHashRefV1<typeof blindTruthProtocolDomainV1> {
  return localHashRefV1(
    blindTruthProtocolDomainV1,
    sha256HexV1(blindTruthPreimageV1(blindTruthProtocolDomainV1, canonicalBlindTruthProtocolV1())),
  );
}

export function canonicalBlindTruthEvaluatorProfileV1(input: BlindTruthEvaluatorProfileV1): BlindTruthEvaluatorProfileV1 {
  assertClosedPlainObject(input, evaluatorProfileKeys, "BlindTruthEvaluatorProfile");
  if (
    input.engineId !== "HISTORICAL_EXECUTION_ADAPTER" ||
    input.engineVersion !== "ENGINE_V20260926" ||
    input.metricRegistryVersion !== "METRIC_REGISTRY_V20260927" ||
    input.metricResultArtifactSchemaVersion !== "METRIC_RESULT_SET_V2" ||
    input.blindTruthEvaluatorBehaviorVersion !== blindTruthEvaluatorBehaviorVersionV1
  ) throw new Error("INCOMPATIBLE_ENGINE_VERSION");
  return {
    engineId: input.engineId,
    engineVersion: input.engineVersion,
    metricRegistryVersion: input.metricRegistryVersion,
    metricResultArtifactSchemaVersion: input.metricResultArtifactSchemaVersion,
    blindTruthEvaluatorBehaviorVersion: input.blindTruthEvaluatorBehaviorVersion,
  };
}

export function canonicalBlindTruthHoldoutScopeV1(input: BlindTruthHoldoutScopeV1): BlindTruthHoldoutScopeV1 {
  assertClosedPlainObject(input, holdoutScopeKeys, "BlindTruthHoldoutScope");
  if (input.schemaVersion !== "BLIND_TRUTH_HOLDOUT_SCOPE_V1") throw new Error("MALFORMED_HOLDOUT");
  const coverageStart = canonicalDateV1(input.coverageStart);
  const coverageEnd = canonicalDateV1(input.coverageEnd);
  if (coverageStart > coverageEnd) throw new Error("HOLDOUT_SCOPE_MISMATCH");
  const markets = canonicalSortedUniqueStrings(input.markets, "markets", (value) =>
    canonicalTextV1(value, { minBytes: 1, maxBytes: 256 }));
  const fields = canonicalSortedUniqueStrings(input.fields, "fields", (value) => immutableBehaviorTokenV1(value));
  return {
    schemaVersion: input.schemaVersion,
    providerId: stableBehaviorToken(input.providerId, "providerId"),
    providerDatasetId: stableBehaviorToken(input.providerDatasetId, "providerDatasetId"),
    providerDatasetVersion: stableBehaviorToken(input.providerDatasetVersion, "providerDatasetVersion"),
    markets,
    frequency: stableBehaviorToken(input.frequency, "frequency"),
    fields,
    coverageStart,
    coverageEnd,
    calendarId: stableBehaviorToken(input.calendarId, "calendarId"),
    timezone: canonicalTextV1(input.timezone, { minBytes: 1, maxBytes: 128 }),
  };
}

export function canonicalBlindTruthHoldoutScopeBytesV1(input: BlindTruthHoldoutScopeV1): Buffer {
  return i5ResearchInternalCanonicalJsonBytesV1(canonicalBlindTruthHoldoutScopeV1(input) as unknown as CanonicalJsonValue);
}

export function blindTruthHoldoutScopeDigestV1(input: BlindTruthHoldoutScopeV1): CanonicalSha256HexV1 {
  return sha256HexV1(Buffer.concat([
    Buffer.from(`${blindTruthHoldoutScopeDigestDomainV1}\n`, "utf8"),
    canonicalBlindTruthHoldoutScopeBytesV1(input),
  ]));
}

export function canonicalBlindTruthCriterionV1(input: BlindTruthCriterionV1): BlindTruthCriterionV1 {
  assertClosedPlainObject(input, criterionKeys, "BlindTruthCriterion");
  if (!/^[A-Z][A-Z0-9_]{2,63}$/u.test(input.criterionId)) throw new Error("INCOMPATIBLE_CRITERIA");
  if (input.criterionVersion !== "CRITERION_V1") throw new Error("INCOMPATIBLE_CRITERIA");
  if (typeof input.required !== "boolean") throw new Error("INCOMPATIBLE_CRITERIA");
  validationAssessmentMetricNumericKindV1(input.metricId);
  if (input.metricVersion !== "METRIC_V2") throw new Error("INCOMPATIBLE_CRITERIA");
  const operator = canonicalBlindTruthOperatorV1(input.operator);
  const threshold = canonicalBlindTruthThresholdV1(input.threshold, input.metricId, operator);
  return {
    criterionId: input.criterionId,
    criterionVersion: input.criterionVersion,
    required: input.required,
    metricId: input.metricId,
    metricVersion: input.metricVersion,
    operator,
    threshold,
  };
}

export function canonicalBlindTruthCriteriaV1(input: readonly BlindTruthCriterionV1[]): readonly BlindTruthCriterionV1[] {
  if (!Array.isArray(input) || input.length < 1) throw new Error("INCOMPATIBLE_CRITERIA");
  const criteria = input.map(canonicalBlindTruthCriterionV1).sort((left, right) =>
    compareStrings(`${left.criterionId}\n${left.criterionVersion}`, `${right.criterionId}\n${right.criterionVersion}`));
  rejectDuplicateByKey(criteria, (criterion) => `${criterion.criterionId}\n${criterion.criterionVersion}`, "INCOMPATIBLE_CRITERIA");
  if (!criteria.some((criterion) => criterion.required)) throw new Error("INCOMPATIBLE_CRITERIA");
  return Object.freeze(criteria);
}

export function blindTruthScientificCandidateKeyV1(input: BlindTruthRegistrationV1): BlindTruthScientificCandidateKeyV1 {
  const registration = canonicalBlindTruthRegistrationV1(input);
  return {
    subjectExperiment: registration.subjectExperiment,
    subjectExperimentParameters: registration.subjectExperimentParameters,
    subjectResearchIr: registration.subjectResearchIr,
  };
}

export function canonicalBlindTruthRegistrationV1(input: BlindTruthRegistrationV1): BlindTruthRegistrationV1 {
  assertClosedPlainObject(input, registrationKeys, "BlindTruthRegistration");
  if (input.schemaVersion !== "BLIND_TRUTH_REGISTRATION_V1") throw new Error("MALFORMED_HOLDOUT");
  const protocol = canonicalBlindTruthLocalRefV1(input.protocol, blindTruthProtocolDomainV1);
  if (!sameRef(protocol, hashBlindTruthProtocolV1())) throw new Error("INCOMPATIBLE_PROTOCOL_VERSION");
  return {
    schemaVersion: input.schemaVersion,
    protocol,
    subjectExperiment: canonicalStandardRefV1(input.subjectExperiment, "SYNTRAKE:EXPERIMENT:V1"),
    subjectExperimentParameters: canonicalStandardRefV1(input.subjectExperimentParameters, "SYNTRAKE:EXPERIMENT_PARAMETERS:V1"),
    subjectResearchIr: canonicalStandardRefV1(input.subjectResearchIr, "SYNTRAKE:RESEARCH_IR:V1"),
    promotionProtocol: canonicalPromotionRefV1(input.promotionProtocol, scientificPromotionProtocolDomainV1),
    promotionTransition: canonicalPromotionRefV1(input.promotionTransition, scientificPromotionTransitionDomainV1),
    hypothesis: canonicalStandardRefV1(input.hypothesis, "SYNTRAKE:HYPOTHESIS:V1"),
    metricRequestSet: canonicalStandardRefV1(input.metricRequestSet, "SYNTRAKE:METRIC_REQUEST_SET:V1"),
    executionConfig: canonicalStandardRefV1(input.executionConfig, "SYNTRAKE:EXECUTION_CONFIG:V1"),
    blindTruthCriteria: canonicalBlindTruthCriteriaV1(input.blindTruthCriteria),
    holdoutScope: canonicalBlindTruthHoldoutScopeV1(input.holdoutScope),
    evaluatorProfile: canonicalBlindTruthEvaluatorProfileV1(input.evaluatorProfile),
  };
}

export function canonicalBlindTruthRegistrationBytesV1(input: BlindTruthRegistrationV1): Buffer {
  return i5ResearchInternalCanonicalJsonBytesV1(canonicalBlindTruthRegistrationV1(input) as unknown as CanonicalJsonValue);
}

export function hashBlindTruthRegistrationV1(input: BlindTruthRegistrationV1): BlindTruthHashRefV1<typeof blindTruthRegistrationDomainV1> {
  return localHashRefV1(
    blindTruthRegistrationDomainV1,
    sha256HexV1(blindTruthPreimageV1(blindTruthRegistrationDomainV1, canonicalBlindTruthRegistrationV1(input))),
  );
}

export function assertBlindTruthRegistrationMetricRequestSetV1(input: Readonly<{
  registration: BlindTruthRegistrationV1;
  metricRequestSet: MetricRequestSetHashPayloadV1;
}>): void {
  assertClosedPlainObject(input, new Set(["registration", "metricRequestSet"]), "BlindTruthMetricRequestSetBinding");
  const registration = canonicalBlindTruthRegistrationV1(input.registration);
  const payload = canonicalMetricRequestSetHashPayloadV1(input.metricRequestSet) as unknown as MetricRequestSetHashPayloadV1;
  assertEngineV2MetricRequestSet(input.metricRequestSet);
  if (payload.metricRegistryVersion !== registration.evaluatorProfile.metricRegistryVersion) {
    throw new Error("INCOMPATIBLE_METRIC_REGISTRY");
  }
  const actualRef = standardRefFromHash("SYNTRAKE:METRIC_REQUEST_SET:V1", hashMetricRequestSetV1(input.metricRequestSet));
  if (!sameRef(actualRef, registration.metricRequestSet)) throw new Error("WRONG_SUBJECT");
  const requests = new Set(payload.requests.map((request) => `${request.metricId}\n${request.metricVersion}`));
  for (const criterion of registration.blindTruthCriteria) {
    if (!requests.has(`${criterion.metricId}\n${criterion.metricVersion}`)) throw new Error("INCOMPATIBLE_CRITERIA");
  }
}

export function assertBlindTruthRegistrationExecutionConfigV1(input: Readonly<{
  registration: BlindTruthRegistrationV1;
  executionConfig: ExecutionConfigHashPayloadV1;
}>): void {
  assertClosedPlainObject(input, new Set(["registration", "executionConfig"]), "BlindTruthExecutionConfigBinding");
  const registration = canonicalBlindTruthRegistrationV1(input.registration);
  const payload = canonicalExecutionConfigHashPayloadV1(input.executionConfig) as unknown as ExecutionConfigHashPayloadV1;
  const actualRef = standardRefFromHash("SYNTRAKE:EXECUTION_CONFIG:V1", hashExecutionConfigV1(input.executionConfig));
  if (!sameRef(actualRef, registration.executionConfig)) throw new Error("WRONG_SUBJECT");
  if (payload.engineCompatibilityVersion !== registration.evaluatorProfile.engineVersion) {
    throw new Error("INCOMPATIBLE_ENGINE_VERSION");
  }
  assertEngineV2ExecutionConfig(input.executionConfig);
}

export function canonicalBlindTruthVaultSealV1(input: BlindTruthVaultSealV1): BlindTruthVaultSealV1 {
  assertClosedPlainObject(input, vaultSealKeys, "BlindTruthVaultSeal");
  if (input.schemaVersion !== "BLIND_TRUTH_VAULT_SEAL_V1") throw new Error("MALFORMED_COMMITMENT");
  const protocol = canonicalBlindTruthLocalRefV1(input.protocol, blindTruthProtocolDomainV1);
  if (!sameRef(protocol, hashBlindTruthProtocolV1())) throw new Error("INCOMPATIBLE_PROTOCOL_VERSION");
  if (input.commitmentAlgorithm !== blindTruthCommitmentAlgorithmV1) throw new Error("MALFORMED_COMMITMENT");
  if (input.vaultFormatVersion !== blindTruthVaultFormatVersionV1) throw new Error("MALFORMED_COMMITMENT");
  return {
    schemaVersion: input.schemaVersion,
    protocol,
    registration: canonicalBlindTruthLocalRefV1(input.registration, blindTruthRegistrationDomainV1),
    holdoutScopeDigest: canonicalSha256HexV1(input.holdoutScopeDigest),
    commitmentAlgorithm: input.commitmentAlgorithm,
    commitmentHash: canonicalSha256HexV1(input.commitmentHash),
    declaredPlaintextByteLength: canonicalIntegerV1(input.declaredPlaintextByteLength, { min: "1", allowNegative: false }),
    vaultFormatVersion: input.vaultFormatVersion,
  };
}

export function canonicalBlindTruthVaultSealBytesV1(input: BlindTruthVaultSealV1): Buffer {
  return i5ResearchInternalCanonicalJsonBytesV1(canonicalBlindTruthVaultSealV1(input) as unknown as CanonicalJsonValue);
}

export function hashBlindTruthVaultSealV1(input: BlindTruthVaultSealV1): BlindTruthHashRefV1<typeof blindTruthVaultSealDomainV1> {
  return localHashRefV1(
    blindTruthVaultSealDomainV1,
    sha256HexV1(blindTruthPreimageV1(blindTruthVaultSealDomainV1, canonicalBlindTruthVaultSealV1(input))),
  );
}

export function assertBlindTruthVaultSealBindingsV1(input: Readonly<{
  registration: BlindTruthRegistrationV1;
  vaultSeal: BlindTruthVaultSealV1;
}>): void {
  assertClosedPlainObject(input, new Set(["registration", "vaultSeal"]), "BlindTruthVaultSealBinding");
  const registration = canonicalBlindTruthRegistrationV1(input.registration);
  const vaultSeal = canonicalBlindTruthVaultSealV1(input.vaultSeal);
  if (!sameRef(vaultSeal.registration, hashBlindTruthRegistrationV1(registration))) throw new Error("WRONG_SUBJECT");
  if (!sameRef(vaultSeal.protocol, registration.protocol)) throw new Error("INCOMPATIBLE_PROTOCOL_VERSION");
  if (vaultSeal.holdoutScopeDigest !== blindTruthHoldoutScopeDigestV1(registration.holdoutScope)) {
    throw new Error("HOLDOUT_SCOPE_MISMATCH");
  }
}

export function canonicalBlindTruthEvaluationV1(input: BlindTruthEvaluationV1): BlindTruthEvaluationV1 {
  assertClosedPlainObject(input, evaluationKeys, "BlindTruthEvaluation");
  if (input.schemaVersion !== "BLIND_TRUTH_EVALUATION_V1") throw new Error("INCOMPATIBLE_CRITERIA");
  const protocol = canonicalBlindTruthLocalRefV1(input.protocol, blindTruthProtocolDomainV1);
  if (!sameRef(protocol, hashBlindTruthProtocolV1())) throw new Error("INCOMPATIBLE_PROTOCOL_VERSION");
  return {
    schemaVersion: input.schemaVersion,
    protocol,
    registration: canonicalBlindTruthLocalRefV1(input.registration, blindTruthRegistrationDomainV1),
    vaultSeal: canonicalBlindTruthLocalRefV1(input.vaultSeal, blindTruthVaultSealDomainV1),
    evaluatorProfile: canonicalBlindTruthEvaluatorProfileV1(input.evaluatorProfile),
  };
}

export function canonicalBlindTruthEvaluationBytesV1(input: BlindTruthEvaluationV1): Buffer {
  return i5ResearchInternalCanonicalJsonBytesV1(canonicalBlindTruthEvaluationV1(input) as unknown as CanonicalJsonValue);
}

export function hashBlindTruthEvaluationV1(input: BlindTruthEvaluationV1): BlindTruthHashRefV1<typeof blindTruthEvaluationDomainV1> {
  return localHashRefV1(
    blindTruthEvaluationDomainV1,
    sha256HexV1(blindTruthPreimageV1(blindTruthEvaluationDomainV1, canonicalBlindTruthEvaluationV1(input))),
  );
}

export function assertBlindTruthEvaluationBindingsV1(input: Readonly<{
  registration: BlindTruthRegistrationV1;
  vaultSeal: BlindTruthVaultSealV1;
  evaluation: BlindTruthEvaluationV1;
}>): void {
  assertClosedPlainObject(input, new Set(["registration", "vaultSeal", "evaluation"]), "BlindTruthEvaluationBinding");
  const registration = canonicalBlindTruthRegistrationV1(input.registration);
  const vaultSeal = canonicalBlindTruthVaultSealV1(input.vaultSeal);
  const evaluation = canonicalBlindTruthEvaluationV1(input.evaluation);
  assertBlindTruthVaultSealBindingsV1({ registration, vaultSeal });
  if (!sameRef(evaluation.registration, hashBlindTruthRegistrationV1(registration))) throw new Error("WRONG_SUBJECT");
  if (!sameRef(evaluation.vaultSeal, hashBlindTruthVaultSealV1(vaultSeal))) throw new Error("WRONG_SUBJECT");
  if (!sameRef(evaluation.protocol, registration.protocol)) throw new Error("INCOMPATIBLE_PROTOCOL_VERSION");
  if (!sameCanonical(evaluation.evaluatorProfile, registration.evaluatorProfile)) throw new Error("INCOMPATIBLE_ENGINE_VERSION");
}

export function canonicalBlindTruthCriterionOutcomeV1(input: BlindTruthCriterionOutcomeV1): BlindTruthCriterionOutcomeV1 {
  assertClosedPlainObject(input, criterionOutcomeKeys, "BlindTruthCriterionOutcome");
  if (!/^[A-Z][A-Z0-9_]{2,63}$/u.test(input.criterionId)) throw new Error("INCOMPATIBLE_CRITERIA");
  if (input.criterionVersion !== "CRITERION_V1" || typeof input.required !== "boolean") throw new Error("INCOMPATIBLE_CRITERIA");
  validationAssessmentMetricNumericKindV1(input.metricId);
  if (input.metricVersion !== "METRIC_V2") throw new Error("INCOMPATIBLE_CRITERIA");
  if (!outcomeSet.has(input.status)) throw new Error("INCOMPATIBLE_CRITERIA");
  const observedValue = input.observedValue === null ? null : canonicalAssessmentNumericForMetricV1(input.observedValue, input.metricId);
  if ((input.status === "PASS" || input.status === "FAIL") && observedValue === null) throw new Error("INCOMPATIBLE_CRITERIA");
  if (input.status === "INSUFFICIENT_EVIDENCE" && observedValue !== null) throw new Error("INCOMPATIBLE_CRITERIA");
  return {
    criterionId: input.criterionId,
    criterionVersion: input.criterionVersion,
    required: input.required,
    metricId: input.metricId,
    metricVersion: input.metricVersion,
    status: input.status,
    observedValue,
  };
}

export function deriveBlindTruthOverallOutcomeV1(input: readonly BlindTruthCriterionOutcomeV1[]): BlindTruthOutcomeV1 {
  if (!Array.isArray(input) || input.length < 1) throw new Error("INCOMPATIBLE_CRITERIA");
  const outcomes = input.map(canonicalBlindTruthCriterionOutcomeV1);
  const required = outcomes.filter((outcome) => outcome.required);
  if (required.length < 1) throw new Error("INCOMPATIBLE_CRITERIA");
  if (required.some((outcome) => outcome.status === "FAIL")) return "FAIL";
  if (required.some((outcome) => outcome.status === "INSUFFICIENT_EVIDENCE")) return "INSUFFICIENT_EVIDENCE";
  if (required.every((outcome) => outcome.status === "PASS")) return "PASS";
  throw new Error("INCOMPATIBLE_CRITERIA");
}

export function canonicalBlindTruthResultV1(input: BlindTruthResultV1): BlindTruthResultV1 {
  assertClosedPlainObject(input, resultKeys, "BlindTruthResult");
  const revealedDatasetSnapshot = canonicalStandardRefV1(input.revealedDatasetSnapshot, "SYNTRAKE:DATASET_SNAPSHOT:V1");
  if (!Array.isArray(input.revealedDatasetSeries) || input.revealedDatasetSeries.length < 1) throw new Error("MALFORMED_HOLDOUT");
  const revealedDatasetSeries = input.revealedDatasetSeries
    .map((entry) => canonicalStandardRefV1(entry, "SYNTRAKE:DATASET_SERIES:V1"))
    .sort(compareRefs);
  rejectDuplicateByKey(revealedDatasetSeries, refKey, "MALFORMED_HOLDOUT");

  if (!Array.isArray(input.observedMetricResults) || input.observedMetricResults.length < 1) throw new Error("INCOMPATIBLE_CRITERIA");
  const observedMetricResults = input.observedMetricResults.map(canonicalBlindTruthMetricRecordV2).sort((left, right) =>
    compareStrings(metricRecordId(left), metricRecordId(right)));
  rejectDuplicateByKey(observedMetricResults, metricRecordId, "INCOMPATIBLE_CRITERIA");

  if (!Array.isArray(input.criterionOutcomes) || input.criterionOutcomes.length < 1) throw new Error("INCOMPATIBLE_CRITERIA");
  const criterionOutcomes = input.criterionOutcomes.map(canonicalBlindTruthCriterionOutcomeV1).sort((left, right) =>
    compareStrings(`${left.criterionId}\n${left.criterionVersion}`, `${right.criterionId}\n${right.criterionVersion}`));
  rejectDuplicateByKey(criterionOutcomes, (outcome) => `${outcome.criterionId}\n${outcome.criterionVersion}`, "INCOMPATIBLE_CRITERIA");

  const records = new Map(observedMetricResults.map((record) => [metricRecordId(record), record]));
  for (const outcome of criterionOutcomes) {
    const record = records.get(outcome.metricId);
    if (!record) throw new Error("INCOMPATIBLE_CRITERIA");
    assertOutcomeMatchesMetricRecord(outcome, record);
  }

  const overallOutcome = deriveBlindTruthOverallOutcomeV1(criterionOutcomes);
  if (input.overallOutcome !== overallOutcome) throw new Error("INCOMPATIBLE_CRITERIA");

  return {
    registration: canonicalBlindTruthLocalRefV1(input.registration, blindTruthRegistrationDomainV1),
    vaultSeal: canonicalBlindTruthLocalRefV1(input.vaultSeal, blindTruthVaultSealDomainV1),
    evaluation: canonicalBlindTruthLocalRefV1(input.evaluation, blindTruthEvaluationDomainV1),
    revealedDatasetSnapshot,
    revealedDatasetSeries,
    observedMetricResults,
    criterionOutcomes,
    overallOutcome,
  };
}

export function assertBlindTruthResultMatchesRegistrationV1(input: Readonly<{
  registration: BlindTruthRegistrationV1;
  result: BlindTruthResultV1;
}>): void {
  assertClosedPlainObject(input, new Set(["registration", "result"]), "BlindTruthResultRegistrationBinding");
  const registration = canonicalBlindTruthRegistrationV1(input.registration);
  const result = canonicalBlindTruthResultV1(input.result);
  if (!sameRef(result.registration, hashBlindTruthRegistrationV1(registration))) throw new Error("WRONG_SUBJECT");
  if (result.criterionOutcomes.length !== registration.blindTruthCriteria.length) throw new Error("INCOMPATIBLE_CRITERIA");

  const outcomes = new Map(result.criterionOutcomes.map((outcome) => [`${outcome.criterionId}\n${outcome.criterionVersion}`, outcome]));
  const records = new Map(result.observedMetricResults.map((record) => [metricRecordId(record), record]));
  for (const criterion of registration.blindTruthCriteria) {
    const outcome = outcomes.get(`${criterion.criterionId}\n${criterion.criterionVersion}`);
    if (!outcome) throw new Error("INCOMPATIBLE_CRITERIA");
    if (
      outcome.required !== criterion.required ||
      outcome.metricId !== criterion.metricId ||
      outcome.metricVersion !== criterion.metricVersion
    ) throw new Error("INCOMPATIBLE_CRITERIA");
    const record = records.get(criterion.metricId);
    if (!record) throw new Error("INCOMPATIBLE_CRITERIA");
    const expected = criterionStatusFromMetricRecord(criterion, record);
    if (outcome.status !== expected.status || !sameCanonical(outcome.observedValue, expected.observedValue)) {
      throw new Error("INCOMPATIBLE_CRITERIA");
    }
  }
  if (result.overallOutcome !== deriveBlindTruthOverallOutcomeV1(result.criterionOutcomes)) {
    throw new Error("INCOMPATIBLE_CRITERIA");
  }
}

export function canonicalBlindTruthRevealResultEventV1(input: BlindTruthRevealResultEventV1): BlindTruthRevealResultEventV1 {
  assertClosedPlainObject(input, eventKeys, "BlindTruthRevealResultEvent");
  if (input.schemaVersion !== "BLIND_TRUTH_REVEAL_RESULT_EVENT_V1") throw new Error("AMBIGUOUS_EVENT_CHAIN");
  const protocol = canonicalBlindTruthLocalRefV1(input.protocol, blindTruthProtocolDomainV1);
  if (!sameRef(protocol, hashBlindTruthProtocolV1())) throw new Error("INCOMPATIBLE_PROTOCOL_VERSION");
  if (!eventStateSet.has(input.eventState)) throw new Error("AMBIGUOUS_EVENT_CHAIN");
  const registration = canonicalBlindTruthLocalRefV1(input.registration, blindTruthRegistrationDomainV1);
  const vaultSeal = canonicalBlindTruthLocalRefV1(input.vaultSeal, blindTruthVaultSealDomainV1);
  const evaluation = canonicalBlindTruthLocalRefV1(input.evaluation, blindTruthEvaluationDomainV1);
  const predecessorEvent = input.predecessorEvent === null
    ? null
    : canonicalBlindTruthLocalRefV1(input.predecessorEvent, blindTruthRevealResultEventDomainV1);

  let reason: BlindTruthReasonV1 | null = null;
  let result: BlindTruthResultV1 | null = null;
  if (input.eventState === "REVEAL_STARTED") {
    if (predecessorEvent !== null || input.reason !== null || input.result !== null) throw new Error("AMBIGUOUS_EVENT_CHAIN");
  } else if (input.eventState === "REVEAL_COMPLETED") {
    if (predecessorEvent === null || input.reason !== null || input.result === null) throw new Error("AMBIGUOUS_EVENT_CHAIN");
    result = canonicalBlindTruthResultV1(input.result);
    if (
      !sameRef(result.registration, registration) ||
      !sameRef(result.vaultSeal, vaultSeal) ||
      !sameRef(result.evaluation, evaluation)
    ) throw new Error("WRONG_SUBJECT");
  } else {
    if (predecessorEvent === null || input.result !== null || input.reason === null || !reasonSet.has(input.reason)) {
      throw new Error("AMBIGUOUS_EVENT_CHAIN");
    }
    reason = input.reason;
  }

  return {
    schemaVersion: input.schemaVersion,
    protocol,
    registration,
    vaultSeal,
    evaluation,
    predecessorEvent,
    eventState: input.eventState,
    reason,
    result,
  };
}

export function canonicalBlindTruthRevealResultEventBytesV1(input: BlindTruthRevealResultEventV1): Buffer {
  return i5ResearchInternalCanonicalJsonBytesV1(canonicalBlindTruthRevealResultEventV1(input) as unknown as CanonicalJsonValue);
}

export function hashBlindTruthRevealResultEventV1(input: BlindTruthRevealResultEventV1): BlindTruthHashRefV1<typeof blindTruthRevealResultEventDomainV1> {
  return localHashRefV1(
    blindTruthRevealResultEventDomainV1,
    sha256HexV1(blindTruthPreimageV1(blindTruthRevealResultEventDomainV1, canonicalBlindTruthRevealResultEventV1(input))),
  );
}

export function assertBlindTruthEventPredecessorRelationV1(input: Readonly<{
  predecessor: BlindTruthRevealResultEventV1;
  event: BlindTruthRevealResultEventV1;
}>): void {
  assertClosedPlainObject(input, new Set(["predecessor", "event"]), "BlindTruthEventPredecessorRelation");
  const predecessor = canonicalBlindTruthRevealResultEventV1(input.predecessor);
  const event = canonicalBlindTruthRevealResultEventV1(input.event);
  if (predecessor.eventState !== "REVEAL_STARTED") throw new Error("AMBIGUOUS_EVENT_CHAIN");
  if (event.eventState !== "REVEAL_COMPLETED" && event.eventState !== "REVEAL_FAILED_CLOSED") {
    throw new Error("AMBIGUOUS_EVENT_CHAIN");
  }
  if (!sameRef(event.predecessorEvent, hashBlindTruthRevealResultEventV1(predecessor))) {
    throw new Error("AMBIGUOUS_EVENT_CHAIN");
  }
  if (
    !sameRef(event.protocol, predecessor.protocol) ||
    !sameRef(event.registration, predecessor.registration) ||
    !sameRef(event.vaultSeal, predecessor.vaultSeal) ||
    !sameRef(event.evaluation, predecessor.evaluation)
  ) throw new Error("AMBIGUOUS_EVENT_CHAIN");
}

function canonicalBlindTruthOperatorV1(input: ValidationAssessmentOperatorV1): ValidationAssessmentOperatorV1 {
  if (!scalarOperators.has(input) && !rangeOperators.has(input)) throw new Error("INCOMPATIBLE_CRITERIA");
  return input;
}

function canonicalBlindTruthThresholdV1(
  input: ValidationAssessmentThresholdV1,
  metricId: string,
  operator: ValidationAssessmentOperatorV1,
): ValidationAssessmentThresholdV1 {
  if (scalarOperators.has(operator)) {
    assertClosedPlainObject(input, scalarThresholdKeys, "BlindTruthThreshold");
    if (input.kind !== "SCALAR" || !("value" in input)) throw new Error("INCOMPATIBLE_CRITERIA");
    return { kind: "SCALAR", value: canonicalAssessmentNumericForMetricV1(input.value, metricId) };
  }
  assertClosedPlainObject(input, rangeThresholdKeys, "BlindTruthThreshold");
  if (input.kind !== "RANGE" || !("lower" in input) || !("upper" in input)) throw new Error("INCOMPATIBLE_CRITERIA");
  const lower = canonicalAssessmentNumericForMetricV1(input.lower, metricId);
  const upper = canonicalAssessmentNumericForMetricV1(input.upper, metricId);
  if (compareAssessmentNumeric(lower, upper) > 0) throw new Error("INCOMPATIBLE_CRITERIA");
  return { kind: "RANGE", lower, upper };
}

function canonicalAssessmentNumericForMetricV1(
  input: CanonicalAssessmentNumericV1,
  metricId: string,
): CanonicalAssessmentNumericV1 {
  assertClosedPlainObject(input, assessmentNumericKeys, "BlindTruthNumeric");
  const expectedKind = validationAssessmentMetricNumericKindV1(metricId);
  if (input.kind !== expectedKind) throw new Error("INCOMPATIBLE_CRITERIA");
  if (input.kind === "INTEGER") {
    return { kind: "INTEGER", value: canonicalIntegerV1(input.value, { min: "0", allowNegative: false }) };
  }
  return { kind: "RATIO", value: canonicalDecimalV1(input.value, { maxScale: 18 }) };
}

function canonicalBlindTruthMetricRecordV2(input: CanonicalJsonValue): CanonicalJsonValue {
  assertMetricResultRecordV2(input);
  const record = input as Record<string, unknown>;
  const common = {
    metricId: String(record.metricId),
    metricVersion: "METRIC_V2",
    registryVersion: "METRIC_REGISTRY_V20260927",
    annualizationBasis: "TRADING_SESSIONS_PER_YEAR_252",
    riskFreeSessionReturn: "0",
    minimumAcceptableSessionReturn: "0",
    arithmetic: "EXACT_RATIONAL_WITH_DETERMINISTIC_BIGINT_ROOT_POWER_V1",
    rounding: "RESEARCH_RATIO_OUTPUT_V1_SCALE_18_ROUND_HALF_EVEN",
  } as const;
  if (record.status === "AVAILABLE") {
    return { ...common, status: "AVAILABLE", value: String(record.value) };
  }
  return { ...common, status: "UNAVAILABLE", reason: String(record.reason) };
}

function criterionStatusFromMetricRecord(
  criterion: BlindTruthCriterionV1,
  record: CanonicalJsonValue,
): Readonly<{ status: BlindTruthCriterionStatusV1; observedValue: CanonicalAssessmentNumericV1 | null }> {
  const row = record as Record<string, unknown>;
  if (row.status === "UNAVAILABLE") return { status: "INSUFFICIENT_EVIDENCE", observedValue: null };
  const observedValue = canonicalAssessmentNumericForMetricV1(
    { kind: validationAssessmentMetricNumericKindV1(criterion.metricId), value: String(row.value) } as CanonicalAssessmentNumericV1,
    criterion.metricId,
  );
  return {
    status: thresholdPasses(observedValue, criterion.operator, criterion.threshold) ? "PASS" : "FAIL",
    observedValue,
  };
}

function assertOutcomeMatchesMetricRecord(outcome: BlindTruthCriterionOutcomeV1, record: CanonicalJsonValue): void {
  const row = record as Record<string, unknown>;
  if (row.status === "UNAVAILABLE") {
    if (outcome.status !== "INSUFFICIENT_EVIDENCE" || outcome.observedValue !== null) throw new Error("INCOMPATIBLE_CRITERIA");
    return;
  }
  const observedValue = canonicalAssessmentNumericForMetricV1(
    { kind: validationAssessmentMetricNumericKindV1(outcome.metricId), value: String(row.value) } as CanonicalAssessmentNumericV1,
    outcome.metricId,
  );
  if (outcome.status === "INSUFFICIENT_EVIDENCE" || !sameCanonical(outcome.observedValue, observedValue)) {
    throw new Error("INCOMPATIBLE_CRITERIA");
  }
}

function thresholdPasses(
  observed: CanonicalAssessmentNumericV1,
  operator: ValidationAssessmentOperatorV1,
  threshold: ValidationAssessmentThresholdV1,
): boolean {
  if (threshold.kind === "SCALAR") {
    const cmp = compareAssessmentNumeric(observed, threshold.value);
    if (operator === "LT") return cmp < 0;
    if (operator === "LTE") return cmp <= 0;
    if (operator === "EQ") return cmp === 0;
    if (operator === "GTE") return cmp >= 0;
    if (operator === "GT") return cmp > 0;
    throw new Error("INCOMPATIBLE_CRITERIA");
  }
  const lower = compareAssessmentNumeric(observed, threshold.lower);
  const upper = compareAssessmentNumeric(observed, threshold.upper);
  if (operator === "BETWEEN_INCLUSIVE") return lower >= 0 && upper <= 0;
  if (operator === "OUTSIDE_EXCLUSIVE") return lower < 0 || upper > 0;
  throw new Error("INCOMPATIBLE_CRITERIA");
}

function compareAssessmentNumeric(left: CanonicalAssessmentNumericV1, right: CanonicalAssessmentNumericV1): -1 | 0 | 1 {
  if (left.kind !== right.kind) throw new Error("INCOMPATIBLE_CRITERIA");
  return compareRationalV1(decimalStringToRationalV1(left.value), decimalStringToRationalV1(right.value));
}

function stableBehaviorToken(value: string, name: string): string {
  const token = immutableBehaviorTokenV1(value);
  if (mutableAliases.has(value.toLowerCase())) throw new Error(`MALFORMED_HOLDOUT:${name}`);
  return token;
}

function canonicalSortedUniqueStrings<T extends string>(
  input: readonly string[],
  name: string,
  canonicalize: (value: string) => T,
): readonly T[] {
  if (!Array.isArray(input) || input.length < 1) throw new Error(`MALFORMED_HOLDOUT:${name}`);
  const values = input.map(canonicalize).sort(compareStrings);
  rejectDuplicateByKey(values, (value) => value, `MALFORMED_HOLDOUT:${name}`);
  return Object.freeze(values);
}

function canonicalStandardRefV1(input: HashRefV1, expectedDomain: HashRefV1["hashDomain"]): HashRefV1 {
  const ref = hashRefV1(input);
  if (ref.hashDomain !== expectedDomain) throw new Error("WRONG_HASHREF_DOMAIN");
  return ref;
}

function standardRefFromHash(domain: HashRefV1["hashDomain"], hashHex: string): HashRefV1 {
  return hashRefV1({
    hashAlgorithm: "SHA-256",
    hashDomain: domain,
    hashVersion: "SYNTRAKE_SHA256_V1",
    hashHex,
  });
}

function canonicalPromotionRefV1<D extends typeof scientificPromotionProtocolDomainV1 | typeof scientificPromotionTransitionDomainV1>(
  input: ScientificPromotionHashRefV1<D>,
  expectedDomain: D,
): ScientificPromotionHashRefV1<D> {
  assertClosedPlainObject(input, localHashRefKeys, "ScientificPromotionHashRef");
  if (input.hashAlgorithm !== "SHA-256" || input.hashVersion !== "SYNTRAKE_SHA256_V1") throw new Error("MALFORMED_HASHREF");
  if (input.hashDomain !== expectedDomain) throw new Error("WRONG_HASHREF_DOMAIN");
  return {
    hashAlgorithm: "SHA-256",
    hashDomain: expectedDomain,
    hashVersion: "SYNTRAKE_SHA256_V1",
    hashHex: canonicalSha256HexV1(input.hashHex),
  };
}

function canonicalBlindTruthLocalRefV1<D extends BlindTruthLocalHashDomainV1>(
  input: BlindTruthHashRefV1<D>,
  expectedDomain: D,
): BlindTruthHashRefV1<D> {
  assertClosedPlainObject(input, localHashRefKeys, "BlindTruthHashRef");
  if (input.hashAlgorithm !== "SHA-256" || input.hashVersion !== "SYNTRAKE_SHA256_V1") throw new Error("MALFORMED_HASHREF");
  if (input.hashDomain !== expectedDomain) throw new Error("WRONG_HASHREF_DOMAIN");
  return localHashRefV1(expectedDomain, canonicalSha256HexV1(input.hashHex));
}

function localHashRefV1<D extends BlindTruthLocalHashDomainV1>(
  hashDomain: D,
  hashHex: CanonicalSha256HexV1,
): BlindTruthHashRefV1<D> {
  return {
    hashAlgorithm: "SHA-256",
    hashDomain,
    hashVersion: "SYNTRAKE_SHA256_V1",
    hashHex,
  };
}

function blindTruthPreimageV1(domain: BlindTruthLocalHashDomainV1, payload: unknown): Buffer {
  return Buffer.concat([
    Buffer.from(`${domain}\n`, "utf8"),
    i5ResearchInternalCanonicalJsonBytesV1(payload as CanonicalJsonValue),
  ]);
}

function metricRecordId(input: CanonicalJsonValue): string {
  const record = input as Record<string, unknown>;
  return String(record.metricId);
}

function refKey(input: Readonly<{ hashAlgorithm: string; hashDomain: string; hashVersion: string; hashHex: string }>): string {
  return `${input.hashAlgorithm}\n${input.hashDomain}\n${input.hashVersion}\n${input.hashHex}`;
}

function compareRefs(
  left: Readonly<{ hashHex: string }>,
  right: Readonly<{ hashHex: string }>,
): number {
  return compareStrings(left.hashHex, right.hashHex);
}

function compareStrings(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function rejectDuplicateByKey<T>(values: readonly T[], key: (value: T) => string, reason: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    const identity = key(value);
    if (seen.has(identity)) throw new Error(reason);
    seen.add(identity);
  }
}

function sameRef(
  left: Readonly<{ hashAlgorithm: string; hashDomain: string; hashVersion: string; hashHex: string }> | null,
  right: Readonly<{ hashAlgorithm: string; hashDomain: string; hashVersion: string; hashHex: string }> | null,
): boolean {
  if (left === null || right === null) return left === right;
  return refKey(left) === refKey(right);
}

function sameCanonical(left: unknown, right: unknown): boolean {
  return i5ResearchInternalCanonicalJsonBytesV1(left as CanonicalJsonValue).equals(
    i5ResearchInternalCanonicalJsonBytesV1(right as CanonicalJsonValue),
  );
}

function assertClosedPlainObject(value: unknown, allowedKeys: ReadonlySet<string>, name: string): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error(`${name}:MALFORMED`);
  }
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) throw new Error(`${name}:UNDECLARED_FIELD:${key}`);
    if ((value as Record<string, unknown>)[key] === undefined) throw new Error(`${name}:UNDEFINED_FIELD:${key}`);
  }
  for (const key of allowedKeys) {
    if (!Object.hasOwn(value, key)) throw new Error(`${name}:MISSING_FIELD:${key}`);
  }
}
