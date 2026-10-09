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
  assertBlindTruthVaultSealBindingV1,
  type BlindTruthCriterionV1,
  type BlindTruthRegistrationV1,
  type BlindTruthRevealResultEventV1,
  type BlindTruthResultV1,
} from "../lib/investing/research/blindTruth";
import { canonicalSha256HexV1, hashRefV1, type HashRefV1 } from "../lib/investing/research/canonical";
import { hashExecutionConfigV1, hashMetricRequestSetV1, type ExecutionConfigHashPayloadV1, type MetricRequestSetHashPayloadV1 } from "../lib/investing/research/executionMaterials";

const h = (c: string) => canonicalSha256HexV1(c.repeat(64));
const ref = (hashDomain: HashRefV1["hashDomain"], c: string): HashRefV1 => hashRefV1({ hashAlgorithm: "SHA-256", hashDomain, hashVersion: "SYNTRAKE_SHA256_V1", hashHex: h(c) });
const localRef = (hashDomain: string, c: string) => ({ hashAlgorithm: "SHA-256" as const, hashDomain, hashVersion: "SYNTRAKE_SHA256_V1" as const, hashHex: h(c) }) as never;

const metricRequestSet: MetricRequestSetHashPayloadV1 = { schemaVersion: "METRIC_REQUEST_SET_HASH_PAYLOAD_V1", metricRegistryVersion: "METRIC_REGISTRY_V20260927", requests: [{ metricId: "TOTAL_RETURN", metricVersion: "METRIC_V2" }, { metricId: "TRADE_COUNT", metricVersion: "METRIC_V2" }] };
const executionConfig: ExecutionConfigHashPayloadV1 = { schemaVersion: "EXECUTION_CONFIG_HASH_PAYLOAD_V1", engineCompatibilityVersion: "ENGINE_V20260926", missingDataPolicy: "MISSING_DATA_POLICY_V1", fxPolicy: "FX_POLICY_V1", costsPolicy: "COSTS_POLICY_V1", slippagePolicy: "SLIPPAGE_POLICY_V1", fillPolicy: "FILL_POLICY_V1", corporateActionPolicy: "CORPORATE_ACTION_POLICY_V1", calendarSessionPolicy: "CALENDAR_SESSION_POLICY_V1", valuationPolicy: "VALUATION_POLICY_V1" };
const requiredCriterion: BlindTruthCriterionV1 = { criterionId: "TOTAL_RETURN_PASS", criterionVersion: "CRITERION_V1", required: true, metricId: "TOTAL_RETURN", metricVersion: "METRIC_V2", operator: "GTE", threshold: { kind: "RATIO", value: "0.1" } };
const optionalCriterion: BlindTruthCriterionV1 = { criterionId: "TRADE_COUNT_DIAGNOSTIC", criterionVersion: "CRITERION_V1", required: false, metricId: "TRADE_COUNT", metricVersion: "METRIC_V2", operator: "GTE", threshold: { kind: "INTEGER", value: "10" } };

function registration(overrides: Partial<BlindTruthRegistrationV1> = {}): BlindTruthRegistrationV1 {
  return { schemaVersion: "BLIND_TRUTH_REGISTRATION_V1", protocol: hashBlindTruthProtocolV1(), subjectExperiment: ref("SYNTRAKE:EXPERIMENT:V1", "A"), subjectExperimentParameters: ref("SYNTRAKE:EXPERIMENT_PARAMETERS:V1", "B"), subjectResearchIr: ref("SYNTRAKE:RESEARCH_IR:V1", "C"), promotionProtocol: localRef("SYNTRAKE:SCIENTIFIC_PROMOTION_PROTOCOL:V1", "D"), promotionTransition: localRef("SYNTRAKE:SCIENTIFIC_PROMOTION_TRANSITION:V1", "E"), hypothesis: ref("SYNTRAKE:HYPOTHESIS:V1", "F"), metricRequestSet: ref("SYNTRAKE:METRIC_REQUEST_SET:V1", "1"), executionConfig: ref("SYNTRAKE:EXECUTION_CONFIG:V1", "2"), blindTruthCriteria: [optionalCriterion, requiredCriterion], holdoutScope: { schemaVersion: "BLIND_TRUTH_HOLDOUT_SCOPE_V1", providerId: "PROVIDER_V1", providerDatasetId: "DATASET_V1", providerDatasetVersion: "DATASET_VERSION_20261009", markets: ["EURUSD", "BTCUSD"], frequency: "M1", fields: ["close", "open"], coverageStart: "2026-01-01", coverageEnd: "2026-06-30", calendarId: "CALENDAR_24_7_V1", timezone: "UTC" }, evaluatorProfile: blindTruthEvaluatorProfileV1, ...overrides };
}
function boundRegistration(): BlindTruthRegistrationV1 { return { ...registration(), metricRequestSet: { ...ref("SYNTRAKE:METRIC_REQUEST_SET:V1", "1"), hashHex: hashMetricRequestSetV1(metricRequestSet) }, executionConfig: { ...ref("SYNTRAKE:EXECUTION_CONFIG:V1", "2"), hashHex: hashExecutionConfigV1(executionConfig) } }; }
function seal(reg = boundRegistration()) { return { schemaVersion: "BLIND_TRUTH_VAULT_SEAL_V1" as const, protocol: hashBlindTruthProtocolV1(), registration: hashBlindTruthRegistrationV1(reg), holdoutScopeDigest: blindTruthHoldoutScopeDigestV1(reg.holdoutScope), commitmentAlgorithm: "SHA256_DOMAIN_SEPARATED_SALTED_V1" as const, commitmentHash: h("9"), declaredPlaintextByteLength: "42", vaultFormatVersion: "BLIND_TRUTH_VAULT_FORMAT_V1" as const }; }
function evaluation(reg = boundRegistration(), s = seal(reg)) { return { schemaVersion: "BLIND_TRUTH_EVALUATION_V1" as const, protocol: hashBlindTruthProtocolV1(), registration: hashBlindTruthRegistrationV1(reg), vaultSeal: hashBlindTruthVaultSealV1(s), evaluatorProfile: blindTruthEvaluatorProfileV1 }; }
const metric = (metricId: "TOTAL_RETURN" | "TRADE_COUNT", status: "AVAILABLE" | "UNAVAILABLE", value: string | null) => ({ metricId, metricVersion: "METRIC_V2", registryVersion: "METRIC_REGISTRY_V20260927", annualizationBasis: "TRADING_SESSIONS_PER_YEAR_252", riskFreeSessionReturn: "0", minimumAcceptableSessionReturn: "0", arithmetic: "EXACT_RATIONAL_WITH_DETERMINISTIC_BIGINT_ROOT_POWER_V1", rounding: "RESEARCH_RATIO_OUTPUT_V1_SCALE_18_ROUND_HALF_EVEN", status, ...(status === "AVAILABLE" ? { value: value! } : { reason: "INSUFFICIENT_OBSERVATIONS" }) });
function result(reg = boundRegistration()): BlindTruthResultV1 { const s = seal(reg); const e = evaluation(reg, s); const observedMetricResults = [metric("TOTAL_RETURN", "AVAILABLE", "0.2"), metric("TRADE_COUNT", "AVAILABLE", "12")]; const criterionOutcomes = evaluateBlindTruthCriterionOutcomesV1(reg.blindTruthCriteria, observedMetricResults); return { schemaVersion: "BLIND_TRUTH_RESULT_V1", registration: hashBlindTruthRegistrationV1(reg), vaultSeal: hashBlindTruthVaultSealV1(s), evaluation: hashBlindTruthEvaluationV1(e), revealedDatasetSnapshot: ref("SYNTRAKE:DATASET_SNAPSHOT:V1", "7"), revealedDatasetSeries: [ref("SYNTRAKE:DATASET_SERIES:V1", "8")], observedMetricResults, criterionOutcomes, overallOutcome: blindTruthOverallOutcomeV1(reg.blindTruthCriteria, criterionOutcomes) }; }
function started(reg = boundRegistration()): BlindTruthRevealResultEventV1 { const s = seal(reg); const e = evaluation(reg, s); return { schemaVersion: "BLIND_TRUTH_REVEAL_RESULT_EVENT_V1", protocol: hashBlindTruthProtocolV1(), registration: hashBlindTruthRegistrationV1(reg), vaultSeal: hashBlindTruthVaultSealV1(s), evaluation: hashBlindTruthEvaluationV1(e), predecessorEvent: null, eventState: "REVEAL_STARTED", reason: null, result: null }; }

describe("I5 RL-9A Blind Truth canonical runtime", () => {
  it("freezes protocol, five local domains, and deterministic protocol bytes/hash", () => {
    expect(blindTruthLocalHashDomainsV1).toEqual([blindTruthProtocolDomainV1, blindTruthRegistrationDomainV1, blindTruthVaultSealDomainV1, blindTruthEvaluationDomainV1, blindTruthRevealResultEventDomainV1]);
    expect(canonicalBlindTruthProtocolV1()).toEqual({ schemaVersion: "BLIND_TRUTH_PROTOCOL_V1", protocolId: "BLIND_TRUTH_PROTOCOL_V20261009", commitmentAlgorithm: "SHA256_DOMAIN_SEPARATED_SALTED_V1", commitmentDomain: "SYNTRAKE:BLIND_TRUTH_HOLDOUT_COMMITMENT:V1", reuseFingerprintAlgorithm: "HMAC_SHA256_DOMAIN_SEPARATED_NORMALIZED_HOLDOUT_V1", evaluatorBehaviorVersion: "BLIND_TRUTH_EVALUATOR_V1", allowedOutcomeVocabulary: ["PASS", "FAIL", "INSUFFICIENT_EVIDENCE"], eventStateVocabulary: ["REVEAL_STARTED", "REVEAL_COMPLETED", "REVEAL_FAILED_CLOSED"], reasonVocabulary: expect.arrayContaining(["STALE_PROMOTION_TRANSITION", "ANTI_REUSE_KEY_ROTATION_INCOMPLETE", "AMBIGUOUS_EVENT_CHAIN"]) });
    expect(canonicalBlindTruthProtocolBytesV1().toString("utf8")).toContain("BLIND_TRUTH_PROTOCOL_V20261009");
    expect(hashBlindTruthProtocolV1().hashDomain).toBe(blindTruthProtocolDomainV1);
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
    expect(() => canonicalBlindTruthRegistrationV1(registration({ blindTruthCriteria: [requiredCriterion, { ...requiredCriterion, threshold: { kind: "RATIO", value: "0.2" } }] }))).toThrow(/duplicate/);
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
  });

  it("validates reveal event graph and predecessor lineage", () => {
    const reg = boundRegistration();
    const start = started(reg);
    const completed: BlindTruthRevealResultEventV1 = { ...start, predecessorEvent: hashBlindTruthRevealResultEventV1(start), eventState: "REVEAL_COMPLETED", result: result(reg) };
    const failed: BlindTruthRevealResultEventV1 = { ...start, predecessorEvent: hashBlindTruthRevealResultEventV1(start), eventState: "REVEAL_FAILED_CLOSED", reason: "VAULT_UNAVAILABLE" };
    expect(canonicalBlindTruthRevealResultEventV1(start)).toMatchObject({ eventState: "REVEAL_STARTED", predecessorEvent: null });
    expect(canonicalBlindTruthRevealResultEventV1(completed, start)).toMatchObject({ eventState: "REVEAL_COMPLETED", reason: null });
    expect(canonicalBlindTruthRevealResultEventV1(failed, start)).toMatchObject({ eventState: "REVEAL_FAILED_CLOSED", result: null });
    expect(() => canonicalBlindTruthRevealResultEventV1(completed)).toThrow("AMBIGUOUS_EVENT_CHAIN");
    expect(() => canonicalBlindTruthRevealResultEventV1({ ...failed, reason: "FREE_FORM" as never }, start)).toThrow("AMBIGUOUS_EVENT_CHAIN");
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
