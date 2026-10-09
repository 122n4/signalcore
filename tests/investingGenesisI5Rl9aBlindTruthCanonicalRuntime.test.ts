import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  blindTruthEvaluatorProfileV1,
  blindTruthHoldoutScopeDigestV1,
  blindTruthLocalHashDomainsV1,
  blindTruthOneShotCandidateKeyV1,
  blindTruthProtocolDomainV1,
  blindTruthRegistrationDomainV1,
  blindTruthVaultSealDomainV1,
  blindTruthEvaluationDomainV1,
  blindTruthRevealResultEventDomainV1,
  blindTruthOverallOutcomeV1,
  canonicalBlindTruthEvaluationV1,
  canonicalBlindTruthHoldoutScopeV1,
  canonicalBlindTruthProtocolBytesV1,
  canonicalBlindTruthProtocolV1,
  canonicalBlindTruthRegistrationBytesV1,
  canonicalBlindTruthRegistrationV1,
  canonicalBlindTruthResultV1,
  canonicalBlindTruthRevealResultEventV1,
  canonicalBlindTruthVaultSealV1,
  evaluateBlindTruthCriterionOutcomesV1,
  hashBlindTruthEvaluationV1,
  hashBlindTruthProtocolV1,
  hashBlindTruthRegistrationV1,
  hashBlindTruthRevealResultEventV1,
  hashBlindTruthVaultSealV1,
  assertBlindTruthExecutionConfigBindingV1,
  assertBlindTruthEvaluationBindingV1,
  assertBlindTruthMetricRequestSetBindingV1,
  assertBlindTruthResultBindingV1,
  assertBlindTruthCompletedEventBindingV1,
  verifyBlindTruthMetricResultSetArtifactV1,
  selectBlindTruthObservedMetricResultsV1,
  assertBlindTruthVaultSealBindingV1,
  type BlindTruthCriterionV1,
  type BlindTruthRegistrationV1,
  type BlindTruthRevealResultEventV1,
  type BlindTruthResultV1,
} from "../lib/investing/research/blindTruth";
import { canonicalSha256HexV1, hashRefV1, type HashRefV1 } from "../lib/investing/research/canonical";
import { hashExecutionConfigV1, hashMetricRequestSetV1, type ExecutionConfigHashPayloadV1, type MetricRequestSetHashPayloadV1 } from "../lib/investing/research/executionMaterials";
import { artifactDescriptorV1, canonicalJsonlArtifactBytesV1 } from "../lib/investing/research/resultArtifacts";
import { metricRegistryV2Requests } from "../lib/investing/research/researchMetrics";

const h = (c: string) => canonicalSha256HexV1(c.repeat(64));
const ref = (hashDomain: HashRefV1["hashDomain"], c: string): HashRefV1 => hashRefV1({ hashAlgorithm: "SHA-256", hashDomain, hashVersion: "SYNTRAKE_SHA256_V1", hashHex: h(c) });
const localRef = (hashDomain: string, c: string) => ({ hashAlgorithm: "SHA-256" as const, hashDomain, hashVersion: "SYNTRAKE_SHA256_V1" as const, hashHex: h(c) }) as never;
const expectedReasonVocabulary = ["AUTHORITY_FAILURE", "WRONG_TENANT", "WRONG_INVESTIGATION", "WRONG_SUBJECT", "WRONG_PROMOTION_STATE", "STALE_PROMOTION_TRANSITION", "SUPERSEDED_PROMOTION_AUTHORITY", "DIVERGENT_EXISTING_IDENTITY", "REGISTRATION_ALREADY_EXISTS", "VAULT_SEAL_ALREADY_EXISTS", "EVALUATION_ALREADY_EXISTS", "REVEAL_ALREADY_STARTED", "FINAL_EVENT_ALREADY_EXISTS", "MISSING_VAULT_CAPABILITY", "VAULT_UNAVAILABLE", "ANTI_REUSE_INDEX_UNAVAILABLE", "ANTI_REUSE_KEY_ROTATION_INCOMPLETE", "HOLDOUT_REUSE_DETECTED", "HOLDOUT_ALREADY_EXPOSED", "EMBARGO_VIOLATION", "ACCESS_AUDIT_UNAVAILABLE", "MALFORMED_COMMITMENT", "COMMITMENT_MISMATCH", "PLAINTEXT_LENGTH_MISMATCH", "HOLDOUT_SCOPE_MISMATCH", "PROVIDER_VERSION_MISMATCH", "MALFORMED_HOLDOUT", "INCOMPATIBLE_ENGINE_VERSION", "INCOMPATIBLE_METRIC_REGISTRY", "INCOMPATIBLE_CRITERIA", "WRONG_HASHREF_DOMAIN", "MALFORMED_HASHREF", "AMBIGUOUS_EVENT_CHAIN"] as const;
const expectedProtocolBytes = "{\"allowedOutcomeVocabulary\":[\"PASS\",\"FAIL\",\"INSUFFICIENT_EVIDENCE\"],\"commitmentAlgorithm\":\"SHA256_DOMAIN_SEPARATED_SALTED_V1\",\"commitmentDomain\":\"SYNTRAKE:BLIND_TRUTH_HOLDOUT_COMMITMENT:V1\",\"evaluatorBehaviorVersion\":\"BLIND_TRUTH_EVALUATOR_V1\",\"eventStateVocabulary\":[\"REVEAL_STARTED\",\"REVEAL_COMPLETED\",\"REVEAL_FAILED_CLOSED\"],\"protocolId\":\"BLIND_TRUTH_PROTOCOL_V20261009\",\"reasonVocabulary\":[\"AUTHORITY_FAILURE\",\"WRONG_TENANT\",\"WRONG_INVESTIGATION\",\"WRONG_SUBJECT\",\"WRONG_PROMOTION_STATE\",\"STALE_PROMOTION_TRANSITION\",\"SUPERSEDED_PROMOTION_AUTHORITY\",\"DIVERGENT_EXISTING_IDENTITY\",\"REGISTRATION_ALREADY_EXISTS\",\"VAULT_SEAL_ALREADY_EXISTS\",\"EVALUATION_ALREADY_EXISTS\",\"REVEAL_ALREADY_STARTED\",\"FINAL_EVENT_ALREADY_EXISTS\",\"MISSING_VAULT_CAPABILITY\",\"VAULT_UNAVAILABLE\",\"ANTI_REUSE_INDEX_UNAVAILABLE\",\"ANTI_REUSE_KEY_ROTATION_INCOMPLETE\",\"HOLDOUT_REUSE_DETECTED\",\"HOLDOUT_ALREADY_EXPOSED\",\"EMBARGO_VIOLATION\",\"ACCESS_AUDIT_UNAVAILABLE\",\"MALFORMED_COMMITMENT\",\"COMMITMENT_MISMATCH\",\"PLAINTEXT_LENGTH_MISMATCH\",\"HOLDOUT_SCOPE_MISMATCH\",\"PROVIDER_VERSION_MISMATCH\",\"MALFORMED_HOLDOUT\",\"INCOMPATIBLE_ENGINE_VERSION\",\"INCOMPATIBLE_METRIC_REGISTRY\",\"INCOMPATIBLE_CRITERIA\",\"WRONG_HASHREF_DOMAIN\",\"MALFORMED_HASHREF\",\"AMBIGUOUS_EVENT_CHAIN\"],\"reuseFingerprintAlgorithm\":\"HMAC_SHA256_DOMAIN_SEPARATED_NORMALIZED_HOLDOUT_V1\",\"schemaVersion\":\"BLIND_TRUTH_PROTOCOL_V1\"}";
const expectedProtocolHash = "B525A1D24BF0E843F8965915AEA8F0D70400CAD1E7E0E0099617F85521B0FE4C";
const expectedRegistrationHash = "702969B9BAE54F24E4E428D96BC10293B66247C94C935896755D9856C20B768D";
const expectedVaultSealHash = "416171DFD056BD7CA73FE4C51A418E986563BD64781DB6F5BFB5FBF1CBBEE59E";
const expectedEvaluationHash = "B8CFBCD18AD7180DC839A58D1D8390C095400F18F079C3CEF79734BFC3787FC8";
const expectedCompletedEventHash = "E17E59C8CF7B4D4DA71A1B2F52C781BE0B40AC66A6C9B282EA808AAD1DD6E1A6";

const metricRequestSet: MetricRequestSetHashPayloadV1 = { schemaVersion: "METRIC_REQUEST_SET_HASH_PAYLOAD_V1", metricRegistryVersion: "METRIC_REGISTRY_V20260927", requests: [...metricRegistryV2Requests] };
const executionConfig: ExecutionConfigHashPayloadV1 = { schemaVersion: "EXECUTION_CONFIG_HASH_PAYLOAD_V1", engineCompatibilityVersion: "ENGINE_V20260926", missingDataPolicy: "MISSING_DATA_STRICT_RESEARCH_V2", fxPolicy: "FX_USD_IDENTITY_V1", costsPolicy: "COMMISSION_FEES_ZERO_V1", slippagePolicy: "SLIPPAGE_ZERO_RESEARCH_V1", fillPolicy: "NEXT_SESSION_OPEN_V1", corporateActionPolicy: "SYNTHETIC_ADJUSTED_OHLC_PROVIDER_V2", calendarSessionPolicy: "XNYS_OPEN_CLOSE_SESSION_V2", valuationPolicy: "USD_ADJUSTED_CLOSE_MARK_V2" };
const requiredCriterion: BlindTruthCriterionV1 = { criterionId: "TOTAL_RETURN_PASS", criterionVersion: "CRITERION_V1", required: true, metricId: "TOTAL_RETURN", metricVersion: "METRIC_V2", operator: "GTE", threshold: { kind: "SCALAR", value: { kind: "RATIO", value: "0.1" } } };
const optionalCriterion: BlindTruthCriterionV1 = { criterionId: "TRADE_COUNT_DIAGNOSTIC", criterionVersion: "CRITERION_V1", required: false, metricId: "TRADE_COUNT", metricVersion: "METRIC_V2", operator: "GTE", threshold: { kind: "SCALAR", value: { kind: "INTEGER", value: "10" } } };

function registration(overrides: Partial<BlindTruthRegistrationV1> = {}): BlindTruthRegistrationV1 {
  return { schemaVersion: "BLIND_TRUTH_REGISTRATION_V1", protocol: hashBlindTruthProtocolV1(), subjectExperiment: ref("SYNTRAKE:EXPERIMENT:V1", "A"), subjectExperimentParameters: ref("SYNTRAKE:EXPERIMENT_PARAMETERS:V1", "B"), subjectResearchIr: ref("SYNTRAKE:RESEARCH_IR:V1", "C"), promotionProtocol: localRef("SYNTRAKE:SCIENTIFIC_PROMOTION_PROTOCOL:V1", "D"), promotionTransition: localRef("SYNTRAKE:SCIENTIFIC_PROMOTION_TRANSITION:V1", "E"), hypothesis: ref("SYNTRAKE:HYPOTHESIS:V1", "F"), metricRequestSet: ref("SYNTRAKE:METRIC_REQUEST_SET:V1", "1"), executionConfig: ref("SYNTRAKE:EXECUTION_CONFIG:V1", "2"), blindTruthCriteria: [optionalCriterion, requiredCriterion], holdoutScope: { schemaVersion: "BLIND_TRUTH_HOLDOUT_SCOPE_V1", providerId: "PROVIDER_V1", providerDatasetId: "DATASET_V1", providerDatasetVersion: "DATASET_VERSION_20261009", markets: ["EURUSD", "BTCUSD"], frequency: "M1", fields: ["close", "open"], coverageStart: "2026-01-01", coverageEnd: "2026-06-30", calendarId: "CALENDAR_24_7_V1", timezone: "UTC" }, evaluatorProfile: blindTruthEvaluatorProfileV1, ...overrides };
}
function boundRegistration(overrides: Partial<BlindTruthRegistrationV1> = {}): BlindTruthRegistrationV1 { return { ...registration(overrides), metricRequestSet: { ...ref("SYNTRAKE:METRIC_REQUEST_SET:V1", "1"), hashHex: hashMetricRequestSetV1(metricRequestSet) }, executionConfig: { ...ref("SYNTRAKE:EXECUTION_CONFIG:V1", "2"), hashHex: hashExecutionConfigV1(executionConfig) } }; }
function seal(reg = boundRegistration()) { return { schemaVersion: "BLIND_TRUTH_VAULT_SEAL_V1" as const, protocol: hashBlindTruthProtocolV1(), registration: hashBlindTruthRegistrationV1(reg), holdoutScopeDigest: blindTruthHoldoutScopeDigestV1(reg.holdoutScope), commitmentAlgorithm: "SHA256_DOMAIN_SEPARATED_SALTED_V1" as const, commitmentHash: h("9"), declaredPlaintextByteLength: "42", vaultFormatVersion: "BLIND_TRUTH_VAULT_FORMAT_V1" as const }; }
function evaluation(reg = boundRegistration(), s = seal(reg)) { return { schemaVersion: "BLIND_TRUTH_EVALUATION_V1" as const, protocol: hashBlindTruthProtocolV1(), registration: hashBlindTruthRegistrationV1(reg), vaultSeal: hashBlindTruthVaultSealV1(s), evaluatorProfile: blindTruthEvaluatorProfileV1 }; }
const metric = (metricId: "TOTAL_RETURN" | "TRADE_COUNT", status: "AVAILABLE" | "UNAVAILABLE", value: string | null) => ({ metricId, metricVersion: "METRIC_V2", registryVersion: "METRIC_REGISTRY_V20260927", annualizationBasis: "TRADING_SESSIONS_PER_YEAR_252", riskFreeSessionReturn: "0", minimumAcceptableSessionReturn: "0", arithmetic: "EXACT_RATIONAL_WITH_DETERMINISTIC_BIGINT_ROOT_POWER_V1", rounding: "RESEARCH_RATIO_OUTPUT_V1_SCALE_18_ROUND_HALF_EVEN", status, ...(status === "AVAILABLE" ? { value: value! } : { reason: "INSUFFICIENT_OBSERVATIONS" }) });

function verifiedMetricArtifact(records: readonly ReturnType<typeof metric>[] = [metric("TOTAL_RETURN", "AVAILABLE", "0.2"), metric("TRADE_COUNT", "AVAILABLE", "12")]) {
  const contentBytes = canonicalJsonlArtifactBytesV1(records);
  return { descriptor: artifactDescriptorV1("METRIC_RESULT_SET_V2", contentBytes, records.length), contentBytes };
}
function result(reg = boundRegistration()): BlindTruthResultV1 { const s = seal(reg); const e = evaluation(reg, s); const observedMetricResults = [metric("TOTAL_RETURN", "AVAILABLE", "0.2"), metric("TRADE_COUNT", "AVAILABLE", "12")]; const criterionOutcomes = evaluateBlindTruthCriterionOutcomesV1(reg.blindTruthCriteria, observedMetricResults); return { registration: hashBlindTruthRegistrationV1(reg), vaultSeal: hashBlindTruthVaultSealV1(s), evaluation: hashBlindTruthEvaluationV1(e), revealedDatasetSnapshot: ref("SYNTRAKE:DATASET_SNAPSHOT:V1", "7"), revealedDatasetSeries: [ref("SYNTRAKE:DATASET_SERIES:V1", "8")], observedMetricResults, criterionOutcomes, overallOutcome: blindTruthOverallOutcomeV1(reg.blindTruthCriteria, criterionOutcomes) }; }
function started(reg = boundRegistration()): BlindTruthRevealResultEventV1 { const s = seal(reg); const e = evaluation(reg, s); return { schemaVersion: "BLIND_TRUTH_REVEAL_RESULT_EVENT_V1", protocol: hashBlindTruthProtocolV1(), registration: hashBlindTruthRegistrationV1(reg), vaultSeal: hashBlindTruthVaultSealV1(s), evaluation: hashBlindTruthEvaluationV1(e), predecessorEvent: null, eventState: "REVEAL_STARTED", reason: null, result: null }; }

describe("I5 RL-9A Blind Truth canonical runtime", () => {
  it("freezes protocol, five local domains, and deterministic protocol bytes/hash", () => {
    expect(blindTruthLocalHashDomainsV1).toEqual([blindTruthProtocolDomainV1, blindTruthRegistrationDomainV1, blindTruthVaultSealDomainV1, blindTruthEvaluationDomainV1, blindTruthRevealResultEventDomainV1]);
    expect(canonicalBlindTruthProtocolV1()).toEqual({ schemaVersion: "BLIND_TRUTH_PROTOCOL_V1", protocolId: "BLIND_TRUTH_PROTOCOL_V20261009", commitmentAlgorithm: "SHA256_DOMAIN_SEPARATED_SALTED_V1", commitmentDomain: "SYNTRAKE:BLIND_TRUTH_HOLDOUT_COMMITMENT:V1", reuseFingerprintAlgorithm: "HMAC_SHA256_DOMAIN_SEPARATED_NORMALIZED_HOLDOUT_V1", evaluatorBehaviorVersion: "BLIND_TRUTH_EVALUATOR_V1", allowedOutcomeVocabulary: ["PASS", "FAIL", "INSUFFICIENT_EVIDENCE"], eventStateVocabulary: ["REVEAL_STARTED", "REVEAL_COMPLETED", "REVEAL_FAILED_CLOSED"], reasonVocabulary: expectedReasonVocabulary });
    expect(expectedReasonVocabulary).toHaveLength(33);
    expect(canonicalBlindTruthProtocolBytesV1().toString("utf8")).toBe(expectedProtocolBytes);
    expect(hashBlindTruthProtocolV1()).toEqual({ hashAlgorithm: "SHA-256", hashDomain: blindTruthProtocolDomainV1, hashVersion: "SYNTRAKE_SHA256_V1", hashHex: expectedProtocolHash });
  });

  it("canonicalizes registration, criteria and one-shot candidate key without investigation or RL-8 ids", () => {
    const a = registration();
    const b = registration({ blindTruthCriteria: [requiredCriterion, optionalCriterion], holdoutScope: { ...a.holdoutScope, markets: [...a.holdoutScope.markets].reverse(), fields: [...a.holdoutScope.fields].reverse() } });
    expect(canonicalBlindTruthRegistrationBytesV1(a).toString("utf8")).toBe(canonicalBlindTruthRegistrationBytesV1(b).toString("utf8"));
    expect(hashBlindTruthRegistrationV1(a)).toEqual(hashBlindTruthRegistrationV1(b));
    expect(() => canonicalBlindTruthRegistrationV1(registration({ subjectExperiment: ref("SYNTRAKE:RESULT:V1", "A") }))).toThrow();
    expect(() => canonicalBlindTruthRegistrationV1(registration({ blindTruthCriteria: [] }))).toThrow("INCOMPATIBLE_CRITERIA");
    expect(() => canonicalBlindTruthRegistrationV1(registration({ blindTruthCriteria: [{ ...optionalCriterion, criterionId: "SECOND_OPTIONAL" }] }))).toThrow("INCOMPATIBLE_CRITERIA");
    expect(() => canonicalBlindTruthRegistrationV1(registration({ blindTruthCriteria: [requiredCriterion, requiredCriterion] }))).toThrow(/duplicate/);
    expect(() => canonicalBlindTruthRegistrationV1(registration({ blindTruthCriteria: [requiredCriterion, { ...requiredCriterion, threshold: { kind: "SCALAR", value: { kind: "RATIO", value: "0.2" } } }] }))).toThrow(/duplicate/);
    expect(canonicalBlindTruthRegistrationV1(registration({ blindTruthCriteria: [{ ...requiredCriterion, operator: "BETWEEN_INCLUSIVE", threshold: { kind: "RANGE", lower: { kind: "RATIO", value: "0.1" }, upper: { kind: "RATIO", value: "0.3" } } }] }))).toBeTruthy();
    expect(() => canonicalBlindTruthRegistrationV1(registration({ blindTruthCriteria: [{ ...requiredCriterion, threshold: { kind: "RATIO", value: "0.2" } as never }] }))).toThrow("INCOMPATIBLE_CRITERIA");
    expect(() => canonicalBlindTruthRegistrationV1(registration({ blindTruthCriteria: [{ ...requiredCriterion, operator: "BETWEEN_INCLUSIVE", threshold: { kind: "RATIO_RANGE", lower: "0.1", upper: "0.2" } as never }] }))).toThrow("INCOMPATIBLE_CRITERIA");
    expect(() => canonicalBlindTruthRegistrationV1(registration({ blindTruthCriteria: [{ ...requiredCriterion, threshold: { kind: "SCALAR", value: { kind: "RATIO", value: "0.10" } } }] }))).toThrow("INCOMPATIBLE_CRITERIA");
    expect(() => canonicalBlindTruthRegistrationV1(registration({ blindTruthCriteria: [{ ...requiredCriterion, threshold: { kind: "SCALAR", value: { kind: "RATIO", value: "1.0000000000000000001" } } }] }))).toThrow("INCOMPATIBLE_CRITERIA");
    const key = JSON.stringify(blindTruthOneShotCandidateKeyV1(a));
    expect(key).toContain("SYNTRAKE:EXPERIMENT:V1");
    expect(key).not.toContain("promotion");
    expect(key).not.toContain("Investigation");
  });

  it("canonicalizes holdout scope and digest without admitting a sixth HashRef domain", () => {
    const scope = registration().holdoutScope;
    expect(canonicalBlindTruthHoldoutScopeV1(scope)).toMatchObject({ markets: ["BTCUSD", "EURUSD"], fields: ["close", "open"] });
    expect(blindTruthHoldoutScopeDigestV1(scope)).toMatch(/^[0-9A-F]{64}$/);
    expect(() => canonicalBlindTruthHoldoutScopeV1({ ...scope, markets: ["EURUSD", "EURUSD"] })).toThrow(/duplicate/);
    expect(() => canonicalBlindTruthHoldoutScopeV1({ ...scope, coverageStart: "2026-07-01" })).toThrow();
    expect(() => canonicalBlindTruthHoldoutScopeV1({ ...scope, providerDatasetVersion: "latest" })).toThrow("PROVIDER_VERSION_MISMATCH");
  });

  it("binds MetricRequestSet and ExecutionConfig to registration refs", () => {
    const reg = boundRegistration();
    expect(() => assertBlindTruthMetricRequestSetBindingV1({ registration: reg, metricRequestSet })).not.toThrow();
    expect(() => assertBlindTruthExecutionConfigBindingV1({ registration: reg, executionConfig })).not.toThrow();
    expect(() => assertBlindTruthMetricRequestSetBindingV1({ registration: reg, metricRequestSet: { ...metricRequestSet, metricRegistryVersion: "METRIC_REGISTRY_OLD" } })).toThrow("INCOMPATIBLE_METRIC_REGISTRY");
    expect(() => assertBlindTruthExecutionConfigBindingV1({ registration: reg, executionConfig: { ...executionConfig, engineCompatibilityVersion: "ENGINE_OLD" } })).toThrow("INCOMPATIBLE_ENGINE_VERSION");
    expect(() => assertBlindTruthMetricRequestSetBindingV1({ registration: reg, metricRequestSet: { ...metricRequestSet, requests: [{ metricId: "TRADE_COUNT", metricVersion: "METRIC_V2" }] } })).toThrow();
    expect(() => assertBlindTruthExecutionConfigBindingV1({ registration: reg, executionConfig: { ...executionConfig, missingDataPolicy: "MISSING_DATA_POLICY_V1" } })).toThrow("INCOMPATIBLE_ENGINE_VERSION");
    expect(() => assertBlindTruthMetricRequestSetBindingV1({ registration: reg, metricRequestSet: { ...metricRequestSet, requests: metricRequestSet.requests.slice(1) } })).toThrow("INCOMPATIBLE_METRIC_REGISTRY");
  });

  it("binds seal and evaluation without secret material or duplicated config", () => {
    const reg = boundRegistration();
    const s = seal(reg);
    const e = evaluation(reg, s);
    expect(canonicalBlindTruthVaultSealV1(s)).not.toHaveProperty("salt");
    expect(() => assertBlindTruthVaultSealBindingV1({ vaultSeal: s, registration: reg })).not.toThrow();
    expect(() => assertBlindTruthEvaluationBindingV1({ evaluation: e, registration: reg, vaultSeal: s })).not.toThrow();
    expect(canonicalBlindTruthEvaluationV1(e)).not.toHaveProperty("metricRequestSet");
    expect(() => canonicalBlindTruthVaultSealV1({ ...s, commitmentHash: "abc" as never })).toThrow();
    expect(() => assertBlindTruthEvaluationBindingV1({ evaluation: { ...e, evaluatorProfile: { ...blindTruthEvaluatorProfileV1, engineVersion: "ENGINE_OLD" as never } }, registration: reg, vaultSeal: s })).toThrow();
    expect(() => canonicalBlindTruthVaultSealV1({ ...s, protocol: localRef("SYNTRAKE:BLIND_TRUTH_PROTOCOL:V1", "3") })).toThrow("INCOMPATIBLE_PROTOCOL_VERSION");
    expect(() => canonicalBlindTruthEvaluationV1({ ...e, protocol: localRef("SYNTRAKE:BLIND_TRUTH_PROTOCOL:V1", "4") })).toThrow("INCOMPATIBLE_PROTOCOL_VERSION");
  });

  it("computes result outcomes with required precedence and Dataset domains", () => {
    const reg = boundRegistration();
    const pass = result(reg);
    expect(canonicalBlindTruthResultV1(pass, reg)).toMatchObject({ overallOutcome: "PASS" });
    const failOutcomes = evaluateBlindTruthCriterionOutcomesV1(reg.blindTruthCriteria, [metric("TOTAL_RETURN", "AVAILABLE", "0.01"), metric("TRADE_COUNT", "AVAILABLE", "99")]);
    expect(blindTruthOverallOutcomeV1(reg.blindTruthCriteria, failOutcomes)).toBe("FAIL");
    const insufficient = evaluateBlindTruthCriterionOutcomesV1(reg.blindTruthCriteria, [metric("TOTAL_RETURN", "UNAVAILABLE", null), metric("TRADE_COUNT", "AVAILABLE", "99")]);
    expect(blindTruthOverallOutcomeV1(reg.blindTruthCriteria, insufficient)).toBe("INSUFFICIENT_EVIDENCE");
    expect(() => canonicalBlindTruthResultV1({ ...pass, revealedDatasetSeries: [ref("SYNTRAKE:DATASET_SERIES:V1", "8"), ref("SYNTRAKE:DATASET_SERIES:V1", "8")] }, reg)).toThrow(/duplicate/);
    expect(() => canonicalBlindTruthResultV1({ ...pass, overallOutcome: "FAIL" }, reg)).toThrow("INCOMPATIBLE_CRITERIA");
    const s = seal(reg);
    const e = evaluation(reg, s);
    expect(hashBlindTruthRegistrationV1(reg).hashHex).toBe(expectedRegistrationHash);
    expect(hashBlindTruthVaultSealV1(s).hashHex).toBe(expectedVaultSealHash);
    expect(hashBlindTruthEvaluationV1(e).hashHex).toBe(expectedEvaluationHash);
    expect(() => assertBlindTruthResultBindingV1({ result: pass, registration: reg, vaultSeal: s, evaluation: e, verifiedMetricArtifact: verifiedMetricArtifact() })).not.toThrow();
    expect(() => canonicalBlindTruthResultV1({ ...pass, schemaVersion: "BLIND_TRUTH_RESULT_V1" } as never, reg)).toThrow(/undeclared field schemaVersion/);
    expect(() => canonicalBlindTruthResultV1({ ...pass, criterionOutcomes: pass.criterionOutcomes.filter((outcome) => outcome.criterionId !== "TOTAL_RETURN_PASS"), overallOutcome: "PASS" }, reg)).toThrow("INCOMPATIBLE_CRITERIA");
    expect(() => canonicalBlindTruthResultV1({ ...pass, criterionOutcomes: [...pass.criterionOutcomes, { criterionId: "UNKNOWN", criterionVersion: "CRITERION_V1", metricId: "TOTAL_RETURN", metricVersion: "METRIC_V2", status: "PASS", observedMetric: metric("TOTAL_RETURN", "AVAILABLE", "0.2") }] }, reg)).toThrow("INCOMPATIBLE_CRITERIA");
    const failingMetrics = [metric("TOTAL_RETURN", "AVAILABLE", "0.01"), metric("TRADE_COUNT", "AVAILABLE", "12")];
    const forgedPass = { ...pass, observedMetricResults: failingMetrics, criterionOutcomes: pass.criterionOutcomes, overallOutcome: "PASS" as const };
    expect(() => canonicalBlindTruthResultV1(forgedPass, reg)).toThrow("INCOMPATIBLE_CRITERIA");
    expect(() => canonicalBlindTruthResultV1({ ...pass, criterionOutcomes: pass.criterionOutcomes.map((outcome) => outcome.criterionId === "TOTAL_RETURN_PASS" ? { ...outcome, observedMetric: metric("TOTAL_RETURN", "AVAILABLE", "0.01") } : outcome) }, reg)).toThrow("INCOMPATIBLE_CRITERIA");
    expect(() => canonicalBlindTruthResultV1({ ...pass, criterionOutcomes: pass.criterionOutcomes.map((outcome) => outcome.criterionId === "TOTAL_RETURN_PASS" ? { ...outcome, status: "INSUFFICIENT_EVIDENCE" as const } : outcome) }, reg)).toThrow("INCOMPATIBLE_CRITERIA");
    expect(() => canonicalBlindTruthResultV1({ ...pass, registration: localRef("SYNTRAKE:BLIND_TRUTH_REGISTRATION:V1", "A") }, reg)).not.toThrow();
    expect(() => assertBlindTruthResultBindingV1({ result: { ...pass, registration: localRef("SYNTRAKE:BLIND_TRUTH_REGISTRATION:V1", "A") }, registration: reg, vaultSeal: s, evaluation: e, verifiedMetricArtifact: verifiedMetricArtifact() })).toThrow("DIVERGENT_EXISTING_IDENTITY");
    expect(() => assertBlindTruthResultBindingV1({ result: { ...pass, vaultSeal: localRef("SYNTRAKE:BLIND_TRUTH_VAULT_SEAL:V1", "B") }, registration: reg, vaultSeal: s, evaluation: e, verifiedMetricArtifact: verifiedMetricArtifact() })).toThrow("DIVERGENT_EXISTING_IDENTITY");
    expect(() => assertBlindTruthResultBindingV1({ result: { ...pass, evaluation: localRef("SYNTRAKE:BLIND_TRUTH_EVALUATION:V1", "C") }, registration: reg, vaultSeal: s, evaluation: e, verifiedMetricArtifact: verifiedMetricArtifact() })).toThrow("DIVERGENT_EXISTING_IDENTITY");
    expect(() => assertBlindTruthResultBindingV1({ result: pass, registration: reg, vaultSeal: s, evaluation: e } as never)).toThrow();
    const forgedMetricResult = { ...pass, observedMetricResults: [metric("TOTAL_RETURN", "AVAILABLE", "999"), metric("TRADE_COUNT", "AVAILABLE", "12")], criterionOutcomes: evaluateBlindTruthCriterionOutcomesV1(reg.blindTruthCriteria, [metric("TOTAL_RETURN", "AVAILABLE", "999"), metric("TRADE_COUNT", "AVAILABLE", "12")]), overallOutcome: "PASS" as const };
    expect(() => assertBlindTruthResultBindingV1({ result: forgedMetricResult, registration: reg, vaultSeal: s, evaluation: e, verifiedMetricArtifact: verifiedMetricArtifact() })).toThrow("METRIC_RESULT_ARTIFACT_INTEGRITY_FAILURE");
    const artifact = verifiedMetricArtifact();
    expect(verifyBlindTruthMetricResultSetArtifactV1(artifact)).toHaveLength(2);
    expect(selectBlindTruthObservedMetricResultsV1(reg.blindTruthCriteria, verifyBlindTruthMetricResultSetArtifactV1(artifact))).toEqual(pass.observedMetricResults);
    expect(() => verifyBlindTruthMetricResultSetArtifactV1({ descriptor: artifact.descriptor, contentBytes: canonicalJsonlArtifactBytesV1([metric("TOTAL_RETURN", "AVAILABLE", "999"), metric("TRADE_COUNT", "AVAILABLE", "12")]) })).toThrow("METRIC_RESULT_ARTIFACT_INTEGRITY_FAILURE");
    expect(() => verifyBlindTruthMetricResultSetArtifactV1({ descriptor: { ...artifact.descriptor, contentByteLength: String(Number(artifact.descriptor.contentByteLength) + 1) }, contentBytes: artifact.contentBytes })).toThrow("METRIC_RESULT_ARTIFACT_INTEGRITY_FAILURE");
    expect(() => verifyBlindTruthMetricResultSetArtifactV1({ descriptor: { ...artifact.descriptor, recordCount: "3" }, contentBytes: artifact.contentBytes })).toThrow("METRIC_RESULT_ARTIFACT_RECORD_COUNT_MISMATCH");
    expect(() => { const bytes = Buffer.from(JSON.stringify(metric("TOTAL_RETURN", "AVAILABLE", "0.2")), "utf8"); verifyBlindTruthMetricResultSetArtifactV1({ descriptor: artifactDescriptorV1("METRIC_RESULT_SET_V2", bytes, 1), contentBytes: bytes }); }).toThrow("METRIC_RESULT_ARTIFACT_FORMAT_INVALID");
    expect(() => { const bytes = Buffer.from('{"metricVersion":"METRIC_V2","metricId":"TOTAL_RETURN"}\n', "utf8"); verifyBlindTruthMetricResultSetArtifactV1({ descriptor: artifactDescriptorV1("METRIC_RESULT_SET_V2", bytes, 1), contentBytes: bytes }); }).toThrow("METRIC_RESULT_ARTIFACT_NON_CANONICAL");
    expect(() => verifyBlindTruthMetricResultSetArtifactV1({ descriptor: { ...artifact.descriptor, artifactSchemaVersion: "METRIC_RESULT_SET_V1" }, contentBytes: artifact.contentBytes })).toThrow("INCOMPATIBLE_METRIC_REGISTRY");
    const divergentSeal = { ...s, registration: localRef("SYNTRAKE:BLIND_TRUTH_REGISTRATION:V1", "D") };
    const divergentEvaluation = { ...e, registration: hashBlindTruthRegistrationV1(reg), vaultSeal: hashBlindTruthVaultSealV1(divergentSeal) };
    expect(() => assertBlindTruthEvaluationBindingV1({ evaluation: divergentEvaluation, registration: reg, vaultSeal: divergentSeal })).toThrow("DIVERGENT_EXISTING_IDENTITY");
    const divergentResult = { ...pass, vaultSeal: hashBlindTruthVaultSealV1(divergentSeal), evaluation: hashBlindTruthEvaluationV1(divergentEvaluation) };
    expect(() => assertBlindTruthResultBindingV1({ result: divergentResult, registration: reg, vaultSeal: divergentSeal, evaluation: divergentEvaluation, verifiedMetricArtifact: verifiedMetricArtifact() })).toThrow("DIVERGENT_EXISTING_IDENTITY");
    const wrongDigestSeal = { ...s, holdoutScopeDigest: h("4") };
    const wrongDigestEvaluation = { ...e, vaultSeal: hashBlindTruthVaultSealV1(wrongDigestSeal) };
    expect(() => assertBlindTruthEvaluationBindingV1({ evaluation: wrongDigestEvaluation, registration: reg, vaultSeal: wrongDigestSeal })).toThrow("HOLDOUT_SCOPE_MISMATCH");
    expect(() => assertBlindTruthResultBindingV1({ result: { ...pass, vaultSeal: hashBlindTruthVaultSealV1(wrongDigestSeal), evaluation: hashBlindTruthEvaluationV1(wrongDigestEvaluation) }, registration: reg, vaultSeal: wrongDigestSeal, evaluation: wrongDigestEvaluation, verifiedMetricArtifact: verifiedMetricArtifact() })).toThrow("HOLDOUT_SCOPE_MISMATCH");
  });


  it("allows multiple criteria to share one authoritative metric record", () => {
    const sharedMin: BlindTruthCriterionV1 = { ...requiredCriterion, criterionId: "TOTAL_RETURN_MIN", operator: "GTE", threshold: { kind: "SCALAR", value: { kind: "RATIO", value: "0.1" } } };
    const sharedMax: BlindTruthCriterionV1 = { ...requiredCriterion, criterionId: "TOTAL_RETURN_MAX", operator: "LTE", threshold: { kind: "SCALAR", value: { kind: "RATIO", value: "0.5" } } };
    const reg = boundRegistration({ blindTruthCriteria: [sharedMax, sharedMin] });
    expect(canonicalBlindTruthRegistrationV1(reg)).toBeTruthy();
    const oneTotalReturn = [metric("TOTAL_RETURN", "AVAILABLE", "0.2")];
    const artifact = verifiedMetricArtifact(oneTotalReturn);
    const verified = verifyBlindTruthMetricResultSetArtifactV1(artifact);
    expect(verified.filter((record) => record.metricId === "TOTAL_RETURN")).toHaveLength(1);
    const selected = selectBlindTruthObservedMetricResultsV1(reg.blindTruthCriteria, verified);
    expect(selected).toHaveLength(1);
    expect(selected[0]).toMatchObject({ metricId: "TOTAL_RETURN", value: "0.2" });
    const outcomes = evaluateBlindTruthCriterionOutcomesV1(reg.blindTruthCriteria, selected);
    expect(outcomes).toHaveLength(2);
    expect(outcomes.map((outcome) => [outcome.criterionId, outcome.status])).toEqual([["TOTAL_RETURN_MAX", "PASS"], ["TOTAL_RETURN_MIN", "PASS"]]);
    expect(blindTruthOverallOutcomeV1(reg.blindTruthCriteria, outcomes)).toBe("PASS");
    const s = seal(reg);
    const e = evaluation(reg, s);
    const passResult: BlindTruthResultV1 = { registration: hashBlindTruthRegistrationV1(reg), vaultSeal: hashBlindTruthVaultSealV1(s), evaluation: hashBlindTruthEvaluationV1(e), revealedDatasetSnapshot: ref("SYNTRAKE:DATASET_SNAPSHOT:V1", "7"), revealedDatasetSeries: [ref("SYNTRAKE:DATASET_SERIES:V1", "8")], observedMetricResults: selected, criterionOutcomes: outcomes, overallOutcome: "PASS" };
    expect(canonicalBlindTruthResultV1(passResult, reg)).toMatchObject({ overallOutcome: "PASS", observedMetricResults: [expect.objectContaining({ metricId: "TOTAL_RETURN" })] });
    expect(() => assertBlindTruthResultBindingV1({ result: passResult, registration: reg, vaultSeal: s, evaluation: e, verifiedMetricArtifact: artifact })).not.toThrow();
    const start = started(reg);
    const completed: BlindTruthRevealResultEventV1 = { ...start, predecessorEvent: hashBlindTruthRevealResultEventV1(start), eventState: "REVEAL_COMPLETED", result: passResult };
    expect(() => assertBlindTruthCompletedEventBindingV1({ event: completed, predecessor: start, registration: reg, vaultSeal: s, evaluation: e, verifiedMetricArtifact: artifact })).not.toThrow();

    const highArtifact = verifiedMetricArtifact([metric("TOTAL_RETURN", "AVAILABLE", "0.6")]);
    const highSelected = selectBlindTruthObservedMetricResultsV1(reg.blindTruthCriteria, verifyBlindTruthMetricResultSetArtifactV1(highArtifact));
    const highOutcomes = evaluateBlindTruthCriterionOutcomesV1(reg.blindTruthCriteria, highSelected);
    expect(highOutcomes.map((outcome) => [outcome.criterionId, outcome.status])).toEqual([["TOTAL_RETURN_MAX", "FAIL"], ["TOTAL_RETURN_MIN", "PASS"]]);
    expect(blindTruthOverallOutcomeV1(reg.blindTruthCriteria, highOutcomes)).toBe("FAIL");

    const duplicateBytes = canonicalJsonlArtifactBytesV1([metric("TOTAL_RETURN", "AVAILABLE", "0.2"), metric("TOTAL_RETURN", "AVAILABLE", "0.2")]);
    expect(() => verifyBlindTruthMetricResultSetArtifactV1({ descriptor: artifactDescriptorV1("METRIC_RESULT_SET_V2", duplicateBytes, 2), contentBytes: duplicateBytes })).toThrow("INCOMPATIBLE_METRIC_REGISTRY");
  });

  it("validates reveal event graph and predecessor lineage", () => {
    const reg = boundRegistration();
    const start = started(reg);
    const completed: BlindTruthRevealResultEventV1 = { ...start, predecessorEvent: hashBlindTruthRevealResultEventV1(start), eventState: "REVEAL_COMPLETED", result: result(reg) };
    const failed: BlindTruthRevealResultEventV1 = { ...start, predecessorEvent: hashBlindTruthRevealResultEventV1(start), eventState: "REVEAL_FAILED_CLOSED", reason: "VAULT_UNAVAILABLE" };
    expect(canonicalBlindTruthRevealResultEventV1(start)).toMatchObject({ eventState: "REVEAL_STARTED", predecessorEvent: null });
    expect(canonicalBlindTruthRevealResultEventV1(completed, start)).toMatchObject({ eventState: "REVEAL_COMPLETED", reason: null });
    expect(hashBlindTruthRevealResultEventV1(completed, start).hashHex).toBe(expectedCompletedEventHash);
    expect(canonicalBlindTruthRevealResultEventV1(failed, start)).toMatchObject({ eventState: "REVEAL_FAILED_CLOSED", result: null });
    expect(() => canonicalBlindTruthRevealResultEventV1(completed)).toThrow("AMBIGUOUS_EVENT_CHAIN");
    expect(() => canonicalBlindTruthRevealResultEventV1({ ...failed, reason: "FREE_FORM" as never }, start)).toThrow("AMBIGUOUS_EVENT_CHAIN");
    expect(() => canonicalBlindTruthRevealResultEventV1({ ...start, protocol: localRef("SYNTRAKE:BLIND_TRUTH_PROTOCOL:V1", "5") })).toThrow("INCOMPATIBLE_PROTOCOL_VERSION");
    expect(() => canonicalBlindTruthRevealResultEventV1({ ...completed, result: { ...completed.result!, registration: localRef("SYNTRAKE:BLIND_TRUTH_REGISTRATION:V1", "6") } }, start)).toThrow("DIVERGENT_EXISTING_IDENTITY");
    expect(() => canonicalBlindTruthRevealResultEventV1({ ...completed, result: { ...completed.result!, vaultSeal: localRef("SYNTRAKE:BLIND_TRUTH_VAULT_SEAL:V1", "7") } }, start)).toThrow("DIVERGENT_EXISTING_IDENTITY");
    expect(() => canonicalBlindTruthRevealResultEventV1({ ...completed, result: { ...completed.result!, evaluation: localRef("SYNTRAKE:BLIND_TRUTH_EVALUATION:V1", "8") } }, start)).toThrow("DIVERGENT_EXISTING_IDENTITY");
    expect(() => assertBlindTruthCompletedEventBindingV1({ event: completed, predecessor: start, registration: reg, vaultSeal: seal(reg), evaluation: evaluation(reg, seal(reg)), verifiedMetricArtifact: verifiedMetricArtifact() })).not.toThrow();
    const failingMetrics = [metric("TOTAL_RETURN", "AVAILABLE", "0.01"), metric("TRADE_COUNT", "AVAILABLE", "12")];
    const forgedCompleted: BlindTruthRevealResultEventV1 = { ...completed, result: { ...completed.result!, observedMetricResults: failingMetrics, criterionOutcomes: completed.result!.criterionOutcomes, overallOutcome: "PASS" } };
    expect(() => assertBlindTruthCompletedEventBindingV1({ event: forgedCompleted, predecessor: start, registration: reg, vaultSeal: seal(reg), evaluation: evaluation(reg, seal(reg)), verifiedMetricArtifact: verifiedMetricArtifact(failingMetrics) })).toThrow("INCOMPATIBLE_CRITERIA");
  });

  it("keeps RL-9A inside pure runtime scope", () => {
    const runtime = readFileSync("lib/investing/research/blindTruth.ts", "utf8");
    const index = readFileSync("lib/investing/research/index.ts", "utf8");
    const canonical = readFileSync("lib/investing/research/canonical.ts", "utf8");
    expect(runtime).not.toContain("lib/trading");
    expect(runtime).not.toContain("supabase");
    expect(runtime).not.toContain("process.env");
    expect(runtime).not.toContain("CREATE TABLE");
    expect(runtime).not.toContain("Paper");
    expect(runtime).not.toContain("Live");
    expect(index).toContain('export * from "./blindTruth"');
    expect(canonical).not.toContain("SYNTRAKE:BLIND_TRUTH_PROTOCOL:V1");
  });
});
