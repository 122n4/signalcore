import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  canonicalBlindTruthEvaluationBytesV1,
  canonicalBlindTruthProtocolBytesV1,
  hashBlindTruthEvaluationV1,
  hashBlindTruthProtocolV1,
  hashBlindTruthRegistrationV1,
  hashBlindTruthRevealResultEventV1,
  hashBlindTruthVaultSealV1,
} from "../lib/investing/research/blindTruth";
import { canonicalSha256HexV1, hashRefV1, type HashRefV1 } from "../lib/investing/research/canonical";
import { hashExecutionConfigV1, hashMetricRequestSetV1, type ExecutionConfigHashPayloadV1, type MetricRequestSetHashPayloadV1 } from "../lib/investing/research/executionMaterials";
import { metricRegistryV2Requests } from "../lib/investing/research/researchMetrics";

const schema = readFileSync("supabase/migrations/20261010180000_investing_i5_rl9b1_blind_truth_public_metadata.sql", "utf8");
const writers = readFileSync("supabase/migrations/20261010183000_investing_i5_rl9b2_blind_truth_public_metadata_writers.sql", "utf8");
const runtime = readFileSync("lib/investing/research/blindTruth.ts", "utf8");
const design = readFileSync("docs/investing-genesis/I5_RL9_BLIND_TRUTH_EVIDENCE_VAULT_V1_DESIGN_FREEZE_V1.md", "utf8");

const h = (c: string) => canonicalSha256HexV1(c.repeat(64));
const ref = (hashDomain: HashRefV1["hashDomain"], c: string): HashRefV1 => hashRefV1({ hashAlgorithm: "SHA-256", hashDomain, hashVersion: "SYNTRAKE_SHA256_V1", hashHex: h(c) });
const localRef = (hashDomain: string, c: string) => ({ hashAlgorithm: "SHA-256" as const, hashDomain, hashVersion: "SYNTRAKE_SHA256_V1" as const, hashHex: h(c) }) as never;
const metricRequestSet: MetricRequestSetHashPayloadV1 = { schemaVersion: "METRIC_REQUEST_SET_HASH_PAYLOAD_V1", metricRegistryVersion: "METRIC_REGISTRY_V20260927", requests: [...metricRegistryV2Requests] };
const executionConfig: ExecutionConfigHashPayloadV1 = { schemaVersion: "EXECUTION_CONFIG_HASH_PAYLOAD_V1", engineCompatibilityVersion: "ENGINE_V20260926", missingDataPolicy: "MISSING_DATA_STRICT_RESEARCH_V2", fxPolicy: "FX_USD_IDENTITY_V1", costsPolicy: "COMMISSION_FEES_ZERO_V1", slippagePolicy: "SLIPPAGE_ZERO_RESEARCH_V1", fillPolicy: "NEXT_SESSION_OPEN_V1", corporateActionPolicy: "SYNTHETIC_ADJUSTED_OHLC_PROVIDER_V2", calendarSessionPolicy: "XNYS_OPEN_CLOSE_SESSION_V2", valuationPolicy: "USD_ADJUSTED_CLOSE_MARK_V2" };
const registration = {
  schemaVersion: "BLIND_TRUTH_REGISTRATION_V1" as const,
  protocol: hashBlindTruthProtocolV1(),
  subjectExperiment: ref("SYNTRAKE:EXPERIMENT:V1", "A"),
  subjectExperimentParameters: ref("SYNTRAKE:EXPERIMENT_PARAMETERS:V1", "B"),
  subjectResearchIr: ref("SYNTRAKE:RESEARCH_IR:V1", "C"),
  promotionProtocol: localRef("SYNTRAKE:SCIENTIFIC_PROMOTION_PROTOCOL:V1", "D"),
  promotionTransition: localRef("SYNTRAKE:SCIENTIFIC_PROMOTION_TRANSITION:V1", "E"),
  hypothesis: ref("SYNTRAKE:HYPOTHESIS:V1", "F"),
  metricRequestSet: { ...ref("SYNTRAKE:METRIC_REQUEST_SET:V1", "1"), hashHex: hashMetricRequestSetV1(metricRequestSet) },
  executionConfig: { ...ref("SYNTRAKE:EXECUTION_CONFIG:V1", "2"), hashHex: hashExecutionConfigV1(executionConfig) },
  blindTruthCriteria: [{ criterionId: "TOTAL_RETURN_PASS", criterionVersion: "CRITERION_V1" as const, required: true, metricId: "TOTAL_RETURN", metricVersion: "METRIC_V2" as const, operator: "GTE" as const, threshold: { kind: "SCALAR" as const, value: { kind: "RATIO" as const, value: "0.1" } } }],
  holdoutScope: { schemaVersion: "BLIND_TRUTH_HOLDOUT_SCOPE_V1" as const, providerId: "PROVIDER_V1", providerDatasetId: "DATASET_V1", providerDatasetVersion: "DATASET_VERSION_20261009", markets: ["BTCUSD"], frequency: "M1", fields: ["close"], coverageStart: "2026-01-01", coverageEnd: "2026-06-30", calendarId: "CALENDAR_24_7_V1", timezone: "UTC" },
  evaluatorProfile: { engineId: "HISTORICAL_EXECUTION_ADAPTER" as const, engineVersion: "ENGINE_V20260926" as const, metricRegistryVersion: "METRIC_REGISTRY_V20260927" as const, metricResultArtifactSchemaVersion: "METRIC_RESULT_SET_V2" as const, blindTruthEvaluatorBehaviorVersion: "BLIND_TRUTH_EVALUATOR_V1" as const },
};
const seal = { schemaVersion: "BLIND_TRUTH_VAULT_SEAL_V1" as const, protocol: hashBlindTruthProtocolV1(), registration: hashBlindTruthRegistrationV1(registration), holdoutScopeDigest: h("9"), commitmentAlgorithm: "SHA256_DOMAIN_SEPARATED_SALTED_V1" as const, commitmentHash: h("8"), declaredPlaintextByteLength: "42", vaultFormatVersion: "BLIND_TRUTH_VAULT_FORMAT_V1" as const };
const evaluation = { schemaVersion: "BLIND_TRUTH_EVALUATION_V1" as const, protocol: hashBlindTruthProtocolV1(), registration: hashBlindTruthRegistrationV1(registration), vaultSeal: hashBlindTruthVaultSealV1(seal), evaluatorProfile: registration.evaluatorProfile };
const started = { schemaVersion: "BLIND_TRUTH_REVEAL_RESULT_EVENT_V1" as const, protocol: hashBlindTruthProtocolV1(), registration: hashBlindTruthRegistrationV1(registration), vaultSeal: hashBlindTruthVaultSealV1(seal), evaluation: hashBlindTruthEvaluationV1(evaluation), predecessorEvent: null, eventState: "REVEAL_STARTED" as const, reason: null, result: null };

describe("I5 RL-9B Blind Truth public metadata persistence contract", () => {
  it("adds exactly the five public metadata relations and five scientific domains", () => {
    const relations = [...schema.matchAll(/create table investing\.(research_blind_truth_[a-z_]+_scientific_identities)/g)].map((m) => m[1]);
    expect(relations).toEqual([
      "research_blind_truth_protocols_scientific_identities",
      "research_blind_truth_registrations_scientific_identities",
      "research_blind_truth_vault_seals_scientific_identities",
      "research_blind_truth_evaluations_scientific_identities",
      "research_blind_truth_reveal_result_events_scientific_identities",
    ]);
    expect([...new Set(schema.match(/SYNTRAKE:BLIND_TRUTH_[A-Z_]+:V1/g))].sort()).toEqual([
      "SYNTRAKE:BLIND_TRUTH_EVALUATION:V1",
      "SYNTRAKE:BLIND_TRUTH_PROTOCOL:V1",
      "SYNTRAKE:BLIND_TRUTH_REGISTRATION:V1",
      "SYNTRAKE:BLIND_TRUTH_REVEAL_RESULT_EVENT:V1",
      "SYNTRAKE:BLIND_TRUTH_VAULT_SEAL:V1",
    ].sort());
    expect(schema).not.toMatch(/create table investing\..*(secret|vault_object|hmac|embargo|lease|worker|retry)/i);
    expect(runtime).not.toContain("research_blind_truth_protocols_scientific_identities");
  });

  it("freezes database hash recomputation and runtime golden parity", () => {
    expect(schema).toContain("investing.rl8c_sha256_hex_v1(hash_domain, canonical_payload) = hash_hex");
    expect(schema).toContain("investing.rl8c_sha256_hex_v1(registration_hash_domain, canonical_payload) = registration_hash_hex");
    expect(schema).toContain("investing.rl8c_sha256_hex_v1(event_hash_domain, canonical_payload) = event_hash_hex");
    expect(hashBlindTruthProtocolV1().hashHex).toBe("B525A1D24BF0E843F8965915AEA8F0D70400CAD1E7E0E0099617F85521B0FE4C");
    expect(canonicalBlindTruthProtocolBytesV1().toString("utf8")).toContain("BLIND_TRUTH_PROTOCOL_V20261009");
    expect(hashBlindTruthRegistrationV1(registration).hashHex).toMatch(/^[0-9A-F]{64}$/);
    expect(hashBlindTruthVaultSealV1(seal).hashHex).toMatch(/^[0-9A-F]{64}$/);
    expect(hashBlindTruthEvaluationV1(evaluation).hashHex).toMatch(/^[0-9A-F]{64}$/);
    expect(hashBlindTruthRevealResultEventV1(started).hashHex).toMatch(/^[0-9A-F]{64}$/);
    expect(canonicalBlindTruthEvaluationBytesV1(evaluation).toString("utf8")).not.toContain("metricRequestSet");
  });

  it("freezes authority, one-shot keys, event constraints, RLS, FORCE RLS and append-only backstops", () => {
    expect(schema).toContain("create role investing_rl9_writer nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls");
    expect(schema).toContain("tenant_memberships_rl9b_writer_select");
    expect(schema).toContain("research_investigations_rl9b_writer_select");
    expect(writers).toContain("rl9b_assert_current_promotion_leaf_v1");
    expect(writers).toContain("resulting_state = 'PROMOTION_ELIGIBLE'");
    expect(writers).toContain("STALE_PROMOTION_TRANSITION");
    expect(schema).toContain("research_scientific_promotion_transitions_rl9b_identity_hash_key");
    expect(schema).toContain("research_blind_truth_one_registration_per_candidate_key");
    expect(schema).not.toMatch(/research_blind_truth_one_registration_per_candidate_key[\\s\\S]*research_investigation_id/);
    expect(schema).not.toMatch(/research_blind_truth_one_registration_per_candidate_key[\\s\\S]*promotion_/);
    expect(schema).toContain("research_blind_truth_one_reveal_started_per_evaluation_key");
    expect(schema).toContain("research_blind_truth_one_final_successor_per_started_key");
    expect(schema.match(/force row level security/g)).toHaveLength(5);
    expect(schema.match(/enable row level security/g)).toHaveLength(5);
    expect(schema.match(/append_only/g)?.length).toBeGreaterThanOrEqual(5);
  });

  it("keeps writer grants narrow and denies secret/evaluator-dependent writers to investing_app", () => {
    expect(writers).toContain("grant execute on function investing.persist_research_blind_truth_protocol_v1(text,jsonb) to investing_app");
    expect(writers).toContain("grant execute on function investing.persist_research_blind_truth_registration_v1(text,jsonb) to investing_app");
    expect(writers).toContain("revoke all on function investing.persist_research_blind_truth_vault_seal_v1(text,jsonb) from public, anon, authenticated, service_role, investing_app");
    expect(writers).toContain("revoke all on function investing.persist_research_blind_truth_evaluation_v1(text,jsonb) from public, anon, authenticated, service_role, investing_app");
    expect(writers).toContain("revoke all on function investing.persist_research_blind_truth_reveal_started_v1(text,jsonb) from public, anon, authenticated, service_role, investing_app");
    expect(writers).toContain("revoke all on function investing.persist_research_blind_truth_final_event_v1(text,jsonb) from public, anon, authenticated, service_role, investing_app");
    expect(schema).not.toMatch(/grant (insert|update|delete|truncate|references|trigger).*to investing_app/i);
    expect(writers).toContain("p.proconfig @> array['search_path=pg_catalog']");
  });

  it("does not change RL-9 design acceptance or implement secret-vault scope", () => {
    expect(design).toContain("RL-9B");
    expect(schema).not.toMatch(/vault_locator|provider_credential|hmac_reuse|secret_salt/i);
    expect(writers).not.toMatch(/consume_once|decrypt|encrypt|provider embargo/i);
  });
});
