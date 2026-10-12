import { createHash } from "node:crypto";
import os from "node:os";
import { createSyntheticPrivateCiphertextStoreV1 } from "../workers/investing-blind-vault/privateCiphertextStore.mjs";
import { createSyntheticVaultConsumeOnceRehearsalV1 } from "../workers/investing-blind-vault/privateSyntheticConsumeOnce.mjs";
import { encryptBlindTruthVaultEnvelopeV1, decryptBlindTruthVaultEnvelopeV1 } from "../workers/investing-blind-vault/envelope";
import { deriveBlindTruthHoldoutCommitmentV1, verifyBlindTruthHoldoutCommitmentV1 } from "../lib/investing/secretVault/blindTruthVaultCrypto";
import fs from "node:fs";
import path from "node:path";
import { Pool, type PoolClient } from "pg";
import {
  blindTruthEvaluatorProfileV1,
  blindTruthHoldoutScopeDigestV1,
  canonicalBlindTruthEvaluationV1,
  canonicalBlindTruthProtocolV1,
  canonicalBlindTruthRegistrationV1,
  canonicalBlindTruthRevealResultEventV1,
  canonicalBlindTruthVaultSealV1,
  hashBlindTruthEvaluationV1,
  hashBlindTruthProtocolV1,
  hashBlindTruthRegistrationV1,
  hashBlindTruthRevealResultEventV1,
  hashBlindTruthVaultSealV1,
  type BlindTruthCriterionV1,
  type BlindTruthEvaluationV1,
  type BlindTruthRegistrationV1,
  type BlindTruthRevealResultEventV1,
  type BlindTruthVaultSealV1,
} from "../lib/investing/research/blindTruth";
import { canonicalSha256HexV1, hashRefV1, type HashRefV1 } from "../lib/investing/research/canonical";
import { hashExecutionConfigV1, hashMetricRequestSetV1, type ExecutionConfigHashPayloadV1, type MetricRequestSetHashPayloadV1 } from "../lib/investing/research/executionMaterials";
import { metricRegistryV2Requests } from "../lib/investing/research/researchMetrics";
import {
  canonicalScientificPromotionProtocolV1,
  gateEvidenceForScientificPromotionV1,
  hashScientificPromotionProtocolV1,
  hashScientificPromotionTransitionV1,
  scientificPromotionGateVocabularyV1,
  type ScientificPromotionEvidenceSnapshotV1,
  type ScientificPromotionGateOutcomeV1,
  type ScientificPromotionSubjectV1,
  type ScientificPromotionTransitionV1,
} from "../lib/investing/research/scientificPromotion";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..");
const connectionString = process.env.PG17_RECONCILIATION_URL ?? "";
const maybeDescribe = connectionString ? describe : describe.skip;
const migrationName = "20261010183000_investing_i5_rl9b2_blind_truth_public_metadata_writers.sql";
const migrations = fs
  .readdirSync(path.join(repoRoot, "supabase", "migrations"))
  .filter((name) => name.endsWith(".sql") && name >= "20260825120000_investing_genesis_i2_authority_materialization.sql" && name <= migrationName)
  .sort()
  .map((name) => path.join(repoRoot, "supabase", "migrations", name));

let pool: Pool | null = null;

const authority = {
  tenantId: "11111111-1111-4111-8111-111111111111",
  principalId: "22222222-2222-4222-8222-222222222222",
  membershipId: "33333333-3333-4333-8333-333333333333",
  investigationId: "44444444-4444-4444-8444-444444444444",
  idempotencyRecordId: "55555555-5555-4555-8555-555555555555",
};
const protocolPayload = canonicalBlindTruthProtocolV1();
const protocolHash = hashBlindTruthProtocolV1().hashHex;

async function resetDatabase(): Promise<void> {
  if (!pool) return;
  for (const migration of migrations) {
    await pool.query(fs.readFileSync(migration, "utf8"));
  }
  await seedAuthorityScope(pool);
}

async function seedAuthorityScope(client: Pool): Promise<void> {
  await client.query(
    `insert into investing.principals (principal_id, external_provider, external_subject) values ($1::uuid, 'CLERK', 'rl9b-pg17-principal') on conflict do nothing`,
    [authority.principalId],
  );
  await client.query(`insert into investing.tenants (tenant_id) values ($1::uuid) on conflict do nothing`, [authority.tenantId]);
  await client.query(
    `insert into investing.tenant_memberships (tenant_membership_id, tenant_id, principal_id, role, state) values ($1::uuid, $2::uuid, $3::uuid, 'OWNER', 'ACTIVE') on conflict do nothing`,
    [authority.membershipId, authority.tenantId, authority.principalId],
  );
  await client.query(
    `insert into investing.idempotency_records (idempotency_record_id, idempotency_key, material_request_hash, correlation_id, actor_kind, actor_id, operation_scope, operation, principal_id, tenant_id)
     values ($1::uuid, 'rl9b-pg17-idempotency-key', repeat('A',64), 'rl9b-pg17-correlation', 'USER_PRINCIPAL', ($2::uuid)::text, 'TENANT_SCOPE', 'RESEARCH_INVESTIGATION_CREATE_V1', $2::uuid, $3::uuid)
     on conflict do nothing`,
    [authority.idempotencyRecordId, authority.principalId, authority.tenantId],
  );
  await client.query(
    `insert into investing.research_investigations (research_investigation_id, tenant_id, principal_id, actor_kind, actor_id, tenant_membership_id, operation_scope, operation, capability, source_context, material_request_hash, idempotency_record_id, idempotency_key, correlation_id)
     values ($1::uuid, $2::uuid, $3::uuid, 'USER_PRINCIPAL', ($3::uuid)::text, $4::uuid, 'TENANT_SCOPE', 'RESEARCH_INVESTIGATION_CREATE_V1', 'RESEARCH_MUTATE', 'PURE_RESEARCH', repeat('B',64), $5::uuid, 'rl9b-pg17-idempotency-key', 'rl9b-pg17-correlation')
     on conflict do nothing`,
    [authority.investigationId, authority.tenantId, authority.principalId, authority.membershipId, authority.idempotencyRecordId],
  );
}

async function setAppAuthority(client: PoolClient, operation: string): Promise<void> {
  await client.query("set local role investing_app");
  await client.query(
    `select set_config('syntrake.investing.operation', $1, true),
            set_config('syntrake.investing.capability', 'RESEARCH_MUTATE', true),
            set_config('syntrake.investing.operation_scope', 'TENANT_SCOPE', true),
            set_config('syntrake.investing.source_context', 'PURE_RESEARCH', true),
            set_config('syntrake.investing.tenant_id', $2, true),
            set_config('syntrake.investing.principal_id', $3, true),
            set_config('syntrake.investing.tenant_membership_id', $4, true),
            set_config('syntrake.investing.research_investigation_id', $5, true)`,
    [operation, authority.tenantId, authority.principalId, authority.membershipId, authority.investigationId],
  );
}



type Rl9BehaviorFixture = {
  tenantId: string;
  principalId: string;
  membershipId: string;
  investigationId: string;
  idempotencyRecordId: string;
  baselineExperimentId: string;
  researchExperimentId: string;
  researchSpecRevisionId: string;
  runInputIdentityId: string;
  resultIdentityId: string;
  evidenceObjectIdentityId: string;
  validationProtocolIdentityId: string;
  validationResultIdentityId: string;
  validationAssessmentProtocolIdentityId: string;
  validationAssessmentResultIdentityId: string;
  comparisonProtocolIdentityId: string;
  comparisonResultIdentityId: string;
  rootTransitionIdentityId?: string;
  subjectExperiment: HashRefV1;
  subjectExperimentParameters: HashRefV1;
  subjectResearchIr: HashRefV1;
  promotionProtocol: ReturnType<typeof hashScientificPromotionProtocolV1>;
  promotionTransition: ReturnType<typeof hashScientificPromotionTransitionV1>;
  hypothesis: HashRefV1;
  metricRequestSet: HashRefV1;
  executionConfig: HashRefV1;
  registrationPayload: BlindTruthRegistrationV1;
  registrationHash: string;
  protocolIdentityId?: string;
  registrationIdentityId?: string;
  sealIdentityId?: string;
  evaluationIdentityId?: string;
  startedIdentityId?: string;
  scienceKey: string;
};

const rl9Tables = [
  "research_blind_truth_protocols_scientific_identities",
  "research_blind_truth_registrations_scientific_identities",
  "research_blind_truth_vault_seals_scientific_identities",
  "research_blind_truth_evaluations_scientific_identities",
  "research_blind_truth_reveal_result_events_scientific_identities",
] as const;

const h = (seed: string) => canonicalSha256HexV1(createHash("sha256").update(seed, "utf8").digest("hex").toUpperCase());
const hashRef = (hashDomain: HashRefV1["hashDomain"], seed: string): HashRefV1 => hashRefV1({ hashAlgorithm: "SHA-256", hashDomain, hashVersion: "SYNTRAKE_SHA256_V1", hashHex: h(seed) });
const metricRequestSetPayload: MetricRequestSetHashPayloadV1 = { schemaVersion: "METRIC_REQUEST_SET_HASH_PAYLOAD_V1", metricRegistryVersion: "METRIC_REGISTRY_V20260927", requests: [...metricRegistryV2Requests] };
const executionConfigPayload: ExecutionConfigHashPayloadV1 = { schemaVersion: "EXECUTION_CONFIG_HASH_PAYLOAD_V1", engineCompatibilityVersion: "ENGINE_V20260926", missingDataPolicy: "MISSING_DATA_STRICT_RESEARCH_V2", fxPolicy: "FX_USD_IDENTITY_V1", costsPolicy: "COMMISSION_FEES_ZERO_V1", slippagePolicy: "SLIPPAGE_ZERO_RESEARCH_V1", fillPolicy: "NEXT_SESSION_OPEN_V1", corporateActionPolicy: "SYNTHETIC_ADJUSTED_OHLC_PROVIDER_V2", calendarSessionPolicy: "XNYS_OPEN_CLOSE_SESSION_V2", valuationPolicy: "USD_ADJUSTED_CLOSE_MARK_V2" };
const requiredCriterion: BlindTruthCriterionV1 = { criterionId: "TOTAL_RETURN_PASS", criterionVersion: "CRITERION_V1", required: true, metricId: "TOTAL_RETURN", metricVersion: "METRIC_V2", operator: "GTE", threshold: { kind: "SCALAR", value: { kind: "RATIO", value: "0.1" } } };
const optionalCriterion: BlindTruthCriterionV1 = { criterionId: "TRADE_COUNT_DIAGNOSTIC", criterionVersion: "CRITERION_V1", required: false, metricId: "TRADE_COUNT", metricVersion: "METRIC_V2", operator: "GTE", threshold: { kind: "SCALAR", value: { kind: "INTEGER", value: "10" } } };

function pgErrorCode(error: unknown): unknown {
  return typeof error === "object" && error !== null && "code" in error ? (error as { code?: unknown }).code : undefined;
}

async function expectPgRejection(client: PoolClient, action: () => Promise<unknown>, pattern?: RegExp): Promise<void> {
  await client.query("savepoint rl9b_expected_rejection");
  let error: unknown = null;
  try {
    await action();
  } catch (caught) {
    error = caught;
  }
  await client.query("rollback to savepoint rl9b_expected_rejection");
  await client.query("release savepoint rl9b_expected_rejection");
  expect(error).not.toBeNull();
  expect(pgErrorCode(error)).not.toBe("25P02");
  if (pattern) expect(error instanceof Error ? error.message : String(error)).toMatch(pattern);
}

async function uuid(client: PoolClient): Promise<string> {
  const { rows } = await client.query<{ id: string }>("select extensions.gen_random_uuid()::text as id");
  return rows[0]!.id;
}

async function setRl9Authority(client: PoolClient, fx: Pick<Rl9BehaviorFixture, "tenantId" | "principalId" | "membershipId" | "investigationId">, operation: string, asApp: boolean): Promise<void> {
  await client.query("reset role");
  if (asApp) await client.query("set local role investing_app");
  await client.query(
    `select set_config('syntrake.investing.operation', $1, true),
            set_config('syntrake.investing.capability', 'RESEARCH_MUTATE', true),
            set_config('syntrake.investing.operation_scope', 'TENANT_SCOPE', true),
            set_config('syntrake.investing.source_context', 'PURE_RESEARCH', true),
            set_config('syntrake.investing.tenant_id', $2, true),
            set_config('syntrake.investing.principal_id', $3, true),
            set_config('syntrake.investing.tenant_membership_id', $4, true),
            set_config('syntrake.investing.research_investigation_id', $5, true)`,
    [operation, fx.tenantId, fx.principalId, fx.membershipId, fx.investigationId],
  );
}

async function seedAuthority(client: PoolClient, fx: Rl9BehaviorFixture, suffix: string, reuseAuthority = false): Promise<void> {
  if (!reuseAuthority) {
    await client.query("insert into investing.principals (principal_id, external_provider, external_subject) values ($1::uuid, 'CLERK', $2)", [fx.principalId, `rl9b-${suffix}`]);
    await client.query("insert into investing.tenants (tenant_id) values ($1::uuid)", [fx.tenantId]);
    await client.query("insert into investing.tenant_memberships (tenant_membership_id, tenant_id, principal_id, role, state) values ($1::uuid,$2::uuid,$3::uuid,'OWNER','ACTIVE')", [fx.membershipId, fx.tenantId, fx.principalId]);
  }
  await client.query("insert into investing.idempotency_records (idempotency_record_id, idempotency_key, material_request_hash, correlation_id, actor_kind, actor_id, operation_scope, operation, principal_id, tenant_id, status, completed_at) values ($1::uuid,$2,$3,$4,'USER_PRINCIPAL',($5::uuid)::text,'TENANT_SCOPE','RESEARCH_INVESTIGATION_CREATE_V1',$5::uuid,$6::uuid,'SUCCEEDED', transaction_timestamp())", [fx.idempotencyRecordId, `rl9b-${suffix}-investigation-idem`, h(`${suffix}:idem`), `rl9b-${suffix}-corr`, fx.principalId, fx.tenantId]);
  await client.query("insert into investing.research_investigations (research_investigation_id, tenant_id, principal_id, actor_kind, actor_id, tenant_membership_id, operation_scope, operation, capability, source_context, material_request_hash, idempotency_record_id, idempotency_key, correlation_id) values ($1::uuid,$2::uuid,$3::uuid,'USER_PRINCIPAL',($3::uuid)::text,$4::uuid,'TENANT_SCOPE','RESEARCH_INVESTIGATION_CREATE_V1','RESEARCH_MUTATE','PURE_RESEARCH',$5,$6::uuid,$7,$8)", [fx.investigationId, fx.tenantId, fx.principalId, fx.membershipId, h(`${suffix}:investigation`), fx.idempotencyRecordId, `rl9b-${suffix}-investigation-idem`, `rl9b-${suffix}-corr`]);
}

function registrationPayloadFor(fx: Rl9BehaviorFixture, overrides: Partial<BlindTruthRegistrationV1> = {}): BlindTruthRegistrationV1 {
  return {
    schemaVersion: "BLIND_TRUTH_REGISTRATION_V1",
    protocol: hashBlindTruthProtocolV1(),
    subjectExperiment: fx.subjectExperiment,
    subjectExperimentParameters: fx.subjectExperimentParameters,
    subjectResearchIr: fx.subjectResearchIr,
    promotionProtocol: fx.promotionProtocol as never,
    promotionTransition: fx.promotionTransition as never,
    hypothesis: fx.hypothesis,
    metricRequestSet: fx.metricRequestSet,
    executionConfig: fx.executionConfig,
    blindTruthCriteria: [requiredCriterion, optionalCriterion],
    holdoutScope: { schemaVersion: "BLIND_TRUTH_HOLDOUT_SCOPE_V1", providerId: "PROVIDER_V1", providerDatasetId: "DATASET_V1", providerDatasetVersion: "DATASET_VERSION_20261009", markets: ["BTCUSD", "EURUSD"], frequency: "M1", fields: ["close", "open"], coverageStart: "2026-01-01", coverageEnd: "2026-06-30", calendarId: "CALENDAR_24_7_V1", timezone: "UTC" },
    evaluatorProfile: blindTruthEvaluatorProfileV1,
    ...overrides,
  };
}

function hashRegistrationPayload(payload: BlindTruthRegistrationV1): string {
  return hashBlindTruthRegistrationV1(payload).hashHex;
}

function makeVaultSeal(registration: BlindTruthRegistrationV1): BlindTruthVaultSealV1 {
  return { schemaVersion: "BLIND_TRUTH_VAULT_SEAL_V1", protocol: hashBlindTruthProtocolV1(), registration: hashBlindTruthRegistrationV1(registration), holdoutScopeDigest: blindTruthHoldoutScopeDigestV1(registration.holdoutScope), commitmentAlgorithm: "SHA256_DOMAIN_SEPARATED_SALTED_V1", commitmentHash: h("9"), declaredPlaintextByteLength: "42", vaultFormatVersion: "BLIND_TRUTH_VAULT_FORMAT_V1" };
}

function makeEvaluation(registration: BlindTruthRegistrationV1, seal: BlindTruthVaultSealV1): BlindTruthEvaluationV1 {
  return { schemaVersion: "BLIND_TRUTH_EVALUATION_V1", protocol: hashBlindTruthProtocolV1(), registration: hashBlindTruthRegistrationV1(registration), vaultSeal: hashBlindTruthVaultSealV1(seal), evaluatorProfile: blindTruthEvaluatorProfileV1 };
}

function makeRevealStarted(registration: BlindTruthRegistrationV1, seal: BlindTruthVaultSealV1, evaluation: BlindTruthEvaluationV1): BlindTruthRevealResultEventV1 {
  return { schemaVersion: "BLIND_TRUTH_REVEAL_RESULT_EVENT_V1", protocol: hashBlindTruthProtocolV1(), registration: hashBlindTruthRegistrationV1(registration), vaultSeal: hashBlindTruthVaultSealV1(seal), evaluation: hashBlindTruthEvaluationV1(evaluation), predecessorEvent: null, eventState: "REVEAL_STARTED", reason: null, result: null };
}

async function expectSqlHashParity(client: PoolClient, domain: string, payload: unknown, expectedHash: string): Promise<void> {
  const result = await client.query<{ hash: string }>("select investing.rl8c_sha256_hex_v1($1, $2::jsonb) as hash", [domain, JSON.stringify(payload)]);
  expect(result.rows[0]!.hash).toBe(expectedHash);
}

async function callBlindTruthWriter(client: PoolClient, fx: Rl9BehaviorFixture, operation: string, functionName: string, hash: string, payload: unknown, asApp: boolean): Promise<Record<string, string>> {
  await setRl9Authority(client, fx, operation, asApp);
  const result = await client.query<{ result: Record<string, string> }>(`select investing.${functionName}($1::text, $2::jsonb) as result`, [hash, JSON.stringify(payload)]);
  await client.query("reset role");
  return result.rows[0]!.result;
}

async function expectWriterStatus(client: PoolClient, fx: Rl9BehaviorFixture, operation: string, functionName: string, hash: string, payload: unknown, expected: string, asApp: boolean): Promise<void> {
  const result = await callBlindTruthWriter(client, fx, operation, functionName, hash, payload, asApp);
  expect(result.status).toBe(expected);
}

async function seedRl9BehaviorFixture(client: PoolClient, suffix: string, overrides: Partial<Rl9BehaviorFixture & { reuseAuthority: boolean }> = {}): Promise<Rl9BehaviorFixture> {
  const fx: Rl9BehaviorFixture = {
    tenantId: overrides.tenantId ?? await uuid(client),
    principalId: overrides.principalId ?? await uuid(client),
    membershipId: overrides.membershipId ?? await uuid(client),
    investigationId: overrides.investigationId ?? await uuid(client),
    idempotencyRecordId: overrides.idempotencyRecordId ?? await uuid(client),
    baselineExperimentId: overrides.baselineExperimentId ?? await uuid(client),
    researchExperimentId: overrides.researchExperimentId ?? await uuid(client),
    researchSpecRevisionId: overrides.researchSpecRevisionId ?? await uuid(client),
    runInputIdentityId: overrides.runInputIdentityId ?? await uuid(client),
    resultIdentityId: overrides.resultIdentityId ?? await uuid(client),
    evidenceObjectIdentityId: overrides.evidenceObjectIdentityId ?? await uuid(client),
    validationProtocolIdentityId: overrides.validationProtocolIdentityId ?? await uuid(client),
    validationResultIdentityId: overrides.validationResultIdentityId ?? await uuid(client),
    validationAssessmentProtocolIdentityId: overrides.validationAssessmentProtocolIdentityId ?? await uuid(client),
    validationAssessmentResultIdentityId: overrides.validationAssessmentResultIdentityId ?? await uuid(client),
    comparisonProtocolIdentityId: overrides.comparisonProtocolIdentityId ?? await uuid(client),
    comparisonResultIdentityId: overrides.comparisonResultIdentityId ?? await uuid(client),
    subjectExperiment: overrides.subjectExperiment ?? hashRef("SYNTRAKE:EXPERIMENT:V1", `${suffix}:experiment`),
    subjectExperimentParameters: overrides.subjectExperimentParameters ?? hashRef("SYNTRAKE:EXPERIMENT_PARAMETERS:V1", `${suffix}:parameters`),
    subjectResearchIr: overrides.subjectResearchIr ?? hashRef("SYNTRAKE:RESEARCH_IR:V1", `${suffix}:ir`),
    promotionProtocol: hashScientificPromotionProtocolV1(),
    promotionTransition: overrides.promotionTransition ?? (undefined as never),
    hypothesis: overrides.hypothesis ?? hashRef("SYNTRAKE:HYPOTHESIS:V1", `${suffix}:hypothesis`),
    metricRequestSet: hashRefV1({ hashAlgorithm: "SHA-256", hashDomain: "SYNTRAKE:METRIC_REQUEST_SET:V1", hashVersion: "SYNTRAKE_SHA256_V1", hashHex: hashMetricRequestSetV1(metricRequestSetPayload) }),
    executionConfig: hashRefV1({ hashAlgorithm: "SHA-256", hashDomain: "SYNTRAKE:EXECUTION_CONFIG:V1", hashVersion: "SYNTRAKE_SHA256_V1", hashHex: hashExecutionConfigV1(executionConfigPayload) }),
    registrationPayload: undefined as never,
    registrationHash: "",
    scienceKey: overrides.scienceKey ?? suffix,
  };
  // Construct the real eligible transition hash from the RL-8 scientific contract.
  // It is persisted and checked by createAcceptedRl8PromotionLeaf below.
  fx.promotionTransition = hashScientificPromotionTransitionV1(rl8ClosureTransition(rl8StageATransition(fx)));
  fx.registrationPayload = registrationPayloadFor(fx);
  fx.registrationHash = hashRegistrationPayload(fx.registrationPayload);
  await seedAuthority(client, fx, suffix, overrides.reuseAuthority === true);
  await seedMinimalResearchRows(client, fx, suffix);
  return fx;
}


function promotionSubject(fx: Rl9BehaviorFixture): ScientificPromotionSubjectV1 {
  return {
    subjectExperiment: fx.subjectExperiment,
    subjectExperimentParameters: fx.subjectExperimentParameters,
    subjectResearchIr: fx.subjectResearchIr,
  };
}

function rootEvidence(fx: Rl9BehaviorFixture): ScientificPromotionEvidenceSnapshotV1 {
  return {
    runInput: hashRefV1({ hashAlgorithm: "SHA-256", hashDomain: "SYNTRAKE:RUN_INPUT:V1", hashVersion: "SYNTRAKE_SHA256_V1", hashHex: h(`${fx.scienceKey}:run-input`) }),
    result: hashRefV1({ hashAlgorithm: "SHA-256", hashDomain: "SYNTRAKE:RESULT:V1", hashVersion: "SYNTRAKE_SHA256_V1", hashHex: h(`${fx.scienceKey}:result`) }),
    evidenceObject: null,
    validationProtocol: null,
    validationResult: null,
    validationAssessmentProtocol: null,
    validationAssessmentResult: null,
    robustnessComparisonProtocol: null,
    robustnessComparisonResult: null,
  };
}

function fullEvidence(fx: Rl9BehaviorFixture): ScientificPromotionEvidenceSnapshotV1 {
  return {
    ...rootEvidence(fx),
    evidenceObject: hashRefV1({ hashAlgorithm: "SHA-256", hashDomain: "SYNTRAKE:EVIDENCE_OBJECT:V1", hashVersion: "SYNTRAKE_SHA256_V1", hashHex: h(`${fx.scienceKey}:evidence`) }),
    validationProtocol: hashRefV1({ hashAlgorithm: "SHA-256", hashDomain: "SYNTRAKE:VALIDATION_PROTOCOL:V1", hashVersion: "SYNTRAKE_SHA256_V1", hashHex: h(`${fx.scienceKey}:validation-protocol`) }),
    validationResult: hashRefV1({ hashAlgorithm: "SHA-256", hashDomain: "SYNTRAKE:VALIDATION_RESULT:V1", hashVersion: "SYNTRAKE_SHA256_V1", hashHex: h(`${fx.scienceKey}:validation-result`) }),
    validationAssessmentProtocol: hashRefV1({ hashAlgorithm: "SHA-256", hashDomain: "SYNTRAKE:VALIDATION_ASSESSMENT_PROTOCOL:V1", hashVersion: "SYNTRAKE_SHA256_V1", hashHex: h(`${fx.scienceKey}:assessment-protocol`) }),
    validationAssessmentResult: hashRefV1({ hashAlgorithm: "SHA-256", hashDomain: "SYNTRAKE:VALIDATION_ASSESSMENT_RESULT:V1", hashVersion: "SYNTRAKE_SHA256_V1", hashHex: h(`${fx.scienceKey}:assessment-result`) }),
    robustnessComparisonProtocol: hashRefV1({ hashAlgorithm: "SHA-256", hashDomain: "SYNTRAKE:EXPERIMENT_COMPARISON_PROTOCOL:V1", hashVersion: "SYNTRAKE_SHA256_V1", hashHex: h(`${fx.scienceKey}:comparison-protocol`) }),
    robustnessComparisonResult: hashRefV1({ hashAlgorithm: "SHA-256", hashDomain: "SYNTRAKE:EXPERIMENT_COMPARISON_RESULT:V1", hashVersion: "SYNTRAKE_SHA256_V1", hashHex: h(`${fx.scienceKey}:comparison-result`) }),
  };
}

function rl8RootTransition(fx: Rl9BehaviorFixture): ScientificPromotionTransitionV1 {
  return {
    schemaVersion: "SCIENTIFIC_PROMOTION_TRANSITION_V1",
    protocol: hashScientificPromotionProtocolV1(),
    subject: promotionSubject(fx),
    predecessorTransition: null,
    predecessorState: "DRAFT_RESEARCH",
    resultingState: "EXECUTED",
    evidenceSnapshot: rootEvidence(fx),
    gateOutcomes: [],
    transitionReasons: [],
    supersedes: null,
    rejectedTransition: null,
    supersededByChain: null,
  };
}

function passingGateOutcomes(fx: Rl9BehaviorFixture): ScientificPromotionGateOutcomeV1[] {
  const evidenceSnapshot = fullEvidence(fx);
  const subject = promotionSubject(fx);
  return scientificPromotionGateVocabularyV1.map((gateId) => ({
    gateId,
    status: "PASS",
    reasons: [],
    evidence: gateEvidenceForScientificPromotionV1({ protocol: hashScientificPromotionProtocolV1(), subject, evidenceSnapshot, gateId }),
  }));
}

function rl8StageATransition(fx: Rl9BehaviorFixture): ScientificPromotionTransitionV1 {
  const root = rl8RootTransition(fx);
  return {
    ...root,
    predecessorState: "EXECUTED",
    resultingState: "VALIDATION_PASSED",
    predecessorTransition: hashScientificPromotionTransitionV1(root),
    evidenceSnapshot: fullEvidence(fx),
    gateOutcomes: passingGateOutcomes(fx),
  };
}

function rl8ClosureTransition(stageA: ScientificPromotionTransitionV1): ScientificPromotionTransitionV1 {
  return {
    ...stageA,
    predecessorState: "VALIDATION_PASSED",
    resultingState: "PROMOTION_ELIGIBLE",
    predecessorTransition: hashScientificPromotionTransitionV1(stageA),
    transitionReasons: [],
    rejectedTransition: null,
  };
}

async function seedMinimalResearchRows(client: PoolClient, fx: Rl9BehaviorFixture, suffix: string): Promise<void> {
  const specRoot = await uuid(client);
  const draftRoot = await uuid(client);
  const hypothesisRoot = await uuid(client);
  const draftRevision = await uuid(client);
  const hypothesisRevision = await uuid(client);
  const sourceDraftHash = h(`${suffix}:draft`);
  // Each scientific operation requires its own persisted idempotency identity.
  // The investigation idempotency record is reserved for investigation creation.
  const idem = {
    draft: { id: await uuid(client), operation: "RESEARCH_DRAFT_REVISION_CREATE_V1", request: sourceDraftHash },
    hypothesis: { id: await uuid(client), operation: "RESEARCH_HYPOTHESIS_REVISION_CREATE_V1", request: fx.hypothesis.hashHex },
    spec: { id: await uuid(client), operation: "RESEARCH_SPEC_REVISION_CREATE_V1", request: h(`${suffix}:spec-request`) },
    baseline: { id: await uuid(client), operation: "RESEARCH_EXPERIMENT_BASELINE_CREATE_V1", request: h(`${suffix}:baseline-request`) },
    variant: { id: await uuid(client), operation: "RESEARCH_EXPERIMENT_VARIANT_CREATE_V1", request: h(`${suffix}:variant-request`) },
  } as const;
  const idemKey = (name: keyof typeof idem) => `rl9b-${suffix}-${name}-idempotency`;
  for (const [name, value] of Object.entries(idem) as [keyof typeof idem, (typeof idem)[keyof typeof idem]][]) {
    await client.query(
      `insert into investing.idempotency_records (idempotency_record_id,idempotency_key,material_request_hash,correlation_id,actor_kind,actor_id,operation_scope,operation,principal_id,tenant_id,status,completed_at)
       values ($1,$2,$3,$4,'USER_PRINCIPAL',($5::uuid)::text,'TENANT_SCOPE',$6,$5::uuid,$7::uuid,'SUCCEEDED',transaction_timestamp())`,
      [value.id, idemKey(name), value.request, `rl9b-${suffix}-corr`, fx.principalId, value.operation, fx.tenantId],
    );
  }
  await client.query(`insert into investing.research_material_roots (material_root_id, research_investigation_id, tenant_id, principal_id, actor_kind, actor_id, tenant_membership_id, operation_scope, source_context, material_kind, created_by_operation) values ($1,$4,$5,$6,'USER_PRINCIPAL',($6::uuid)::text,$7,'TENANT_SCOPE','PURE_RESEARCH','RESEARCH_SPEC','RESEARCH_SPEC_REVISION_CREATE_V1'),($2,$4,$5,$6,'USER_PRINCIPAL',($6::uuid)::text,$7,'TENANT_SCOPE','PURE_RESEARCH','DRAFT','RESEARCH_DRAFT_REVISION_CREATE_V1'),($3,$4,$5,$6,'USER_PRINCIPAL',($6::uuid)::text,$7,'TENANT_SCOPE','PURE_RESEARCH','HYPOTHESIS','RESEARCH_HYPOTHESIS_REVISION_CREATE_V1')`, [specRoot, draftRoot, hypothesisRoot, fx.investigationId, fx.tenantId, fx.principalId, fx.membershipId]);
  await client.query(`insert into investing.research_material_revisions (material_revision_id, material_root_id, research_investigation_id, tenant_id, principal_id, actor_kind, actor_id, tenant_membership_id, operation_scope, operation, capability, source_context, material_kind, revision_number, payload_schema_version, canonical_payload, material_hash, material_request_hash, idempotency_record_id, idempotency_key, correlation_id) values ($1,$2,$5,$6,$7,'USER_PRINCIPAL',($7::uuid)::text,$8,'TENANT_SCOPE','RESEARCH_DRAFT_REVISION_CREATE_V1','RESEARCH_MUTATE','PURE_RESEARCH','DRAFT',1,'RESEARCH_DRAFT_HASH_PAYLOAD_V1','{"schemaVersion":"RESEARCH_DRAFT_HASH_PAYLOAD_V1"}'::jsonb,$9,$9,$11,$12,$13),($3,$4,$5,$6,$7,'USER_PRINCIPAL',($7::uuid)::text,$8,'TENANT_SCOPE','RESEARCH_HYPOTHESIS_REVISION_CREATE_V1','RESEARCH_MUTATE','PURE_RESEARCH','HYPOTHESIS',1,'HYPOTHESIS_HASH_PAYLOAD_V1','{"schemaVersion":"HYPOTHESIS_HASH_PAYLOAD_V1"}'::jsonb,$10,$10,$14,$15,$13)`, [draftRevision, draftRoot, hypothesisRevision, hypothesisRoot, fx.investigationId, fx.tenantId, fx.principalId, fx.membershipId, sourceDraftHash, fx.hypothesis.hashHex, idem.draft.id, idemKey("draft"), `rl9b-${suffix}-corr`, idem.hypothesis.id, idemKey("hypothesis")]);
  await client.query(`insert into investing.research_spec_revisions (research_spec_revision_id, material_root_id, research_investigation_id, tenant_id, principal_id, actor_kind, actor_id, tenant_membership_id, operation_scope, source_context, operation, capability, revision_number, source_draft_revision_id, source_draft_material_hash, hypothesis_revision_id, hypothesis_material_hash, candidate_schema_version, candidate_status, canonical_candidate, material_request_hash, idempotency_record_id, idempotency_key, correlation_id) values ($1,$2,$3,$4,$5,'USER_PRINCIPAL',($5::uuid)::text,$6,'TENANT_SCOPE','PURE_RESEARCH','RESEARCH_SPEC_REVISION_CREATE_V1','RESEARCH_MUTATE',1,$7,$8,$9,$10,'RESEARCH_SPEC_CANDIDATE_V1','CANDIDATE_ONLY',$11::jsonb,$12,$13,$14,$15)`, [fx.researchSpecRevisionId, specRoot, fx.investigationId, fx.tenantId, fx.principalId, fx.membershipId, draftRevision, sourceDraftHash, hypothesisRevision, fx.hypothesis.hashHex, JSON.stringify({ schemaVersion: "RESEARCH_SPEC_CANDIDATE_V1", status: "CANDIDATE_ONLY", sourceDraft: hashRefV1({ hashAlgorithm: "SHA-256", hashDomain: "SYNTRAKE:RESEARCH_DRAFT:V1", hashVersion: "SYNTRAKE_SHA256_V1", hashHex: sourceDraftHash }), hypothesisBinding: { kind: "EXPLICIT_HYPOTHESIS", hypothesis: fx.hypothesis } }), idem.spec.request, idem.spec.id, idemKey("spec"), `rl9b-${suffix}-corr`]);
  await client.query(`insert into investing.research_experiments (research_experiment_id, research_investigation_id, tenant_id, principal_id, actor_kind, actor_id, tenant_membership_id, operation_scope, source_context, operation, capability, relation, parent_experiment_id, research_spec_revision_id, research_ir_hash_algorithm, research_ir_hash_domain, research_ir_hash_version, research_ir_hash_hex, experiment_hash_algorithm, experiment_hash_domain, experiment_hash_version, experiment_hash_hex, material_request_hash, idempotency_record_id, idempotency_key, correlation_id) values ($1,$2,$3,$4,'USER_PRINCIPAL',($4::uuid)::text,$5,'TENANT_SCOPE','PURE_RESEARCH','RESEARCH_EXPERIMENT_BASELINE_CREATE_V1','RESEARCH_MUTATE','BASELINE',null,$6,'SHA-256','SYNTRAKE:RESEARCH_IR:V1','SYNTRAKE_SHA256_V1',$7,'SHA-256','SYNTRAKE:EXPERIMENT:V1','SYNTRAKE_SHA256_V1',$8,$9,$10,$11,$12)`, [fx.baselineExperimentId, fx.investigationId, fx.tenantId, fx.principalId, fx.membershipId, fx.researchSpecRevisionId, fx.subjectResearchIr.hashHex, h(`${suffix}:baseline-experiment`), idem.baseline.request, idem.baseline.id, idemKey("baseline"), `rl9b-${suffix}-corr`]);
  await client.query(`insert into investing.research_experiments (research_experiment_id, research_investigation_id, tenant_id, principal_id, actor_kind, actor_id, tenant_membership_id, operation_scope, source_context, operation, capability, relation, parent_experiment_id, research_spec_revision_id, research_ir_hash_algorithm, research_ir_hash_domain, research_ir_hash_version, research_ir_hash_hex, experiment_hash_algorithm, experiment_hash_domain, experiment_hash_version, experiment_hash_hex, experiment_parameters_hash_algorithm, experiment_parameters_hash_domain, experiment_parameters_hash_version, experiment_parameters_hash_hex, material_request_hash, idempotency_record_id, idempotency_key, correlation_id) values ($1,$2,$3,$4,'USER_PRINCIPAL',($4::uuid)::text,$5,'TENANT_SCOPE','PURE_RESEARCH','RESEARCH_EXPERIMENT_VARIANT_CREATE_V1','RESEARCH_MUTATE','VARIANT',$6,$7,'SHA-256','SYNTRAKE:RESEARCH_IR:V1','SYNTRAKE_SHA256_V1',$8,'SHA-256','SYNTRAKE:EXPERIMENT:V1','SYNTRAKE_SHA256_V1',$9,'SHA-256','SYNTRAKE:EXPERIMENT_PARAMETERS:V1','SYNTRAKE_SHA256_V1',$10,$11,$12,$13,$14)`, [fx.researchExperimentId, fx.investigationId, fx.tenantId, fx.principalId, fx.membershipId, fx.baselineExperimentId, fx.researchSpecRevisionId, fx.subjectResearchIr.hashHex, fx.subjectExperiment.hashHex, fx.subjectExperimentParameters.hashHex, idem.variant.request, idem.variant.id, idemKey("variant"), `rl9b-${suffix}-corr`]);
  await client.query(`insert into investing.research_specs_scientific_identities (research_spec_identity_id, tenant_id, principal_id, tenant_membership_id, operation, capability, operation_scope, source_context, research_spec_revision_id, source_draft_hash_hex, hypothesis_hash_hex, hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload) values (extensions.gen_random_uuid(),$1,$2,$3,'RESEARCH_RUN_INPUT_SCIENTIFIC_CREATE_V1','RESEARCH_MUTATE','TENANT_SCOPE','PURE_RESEARCH',$4,$5,$6,'SHA-256','SYNTRAKE:RESEARCH_SPEC:V1','SYNTRAKE_SHA256_V1',$7,$8::jsonb)`, [fx.tenantId, fx.principalId, fx.membershipId, fx.researchSpecRevisionId, sourceDraftHash, fx.hypothesis.hashHex, h(`${suffix}:research-spec`), JSON.stringify({ schemaVersion: "RESEARCH_SPEC_HASH_PAYLOAD_V1", sourceDraft: hashRefV1({ hashAlgorithm: "SHA-256", hashDomain: "SYNTRAKE:RESEARCH_DRAFT:V1", hashVersion: "SYNTRAKE_SHA256_V1", hashHex: sourceDraftHash }), hypothesisBinding: { kind: "EXPLICIT_HYPOTHESIS", hypothesis: fx.hypothesis } })]);
  await client.query(`insert into investing.research_ir_scientific_identities (research_ir_identity_id, tenant_id, principal_id, tenant_membership_id, operation, capability, operation_scope, source_context, hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload) values (extensions.gen_random_uuid(),$1,$2,$3,'RESEARCH_RUN_INPUT_SCIENTIFIC_CREATE_V1','RESEARCH_MUTATE','TENANT_SCOPE','PURE_RESEARCH','SHA-256','SYNTRAKE:RESEARCH_IR:V1','SYNTRAKE_SHA256_V1',$4,'{"schemaVersion":"RESEARCH_IR_HASH_PAYLOAD_V1"}'::jsonb)`, [fx.tenantId, fx.principalId, fx.membershipId, fx.subjectResearchIr.hashHex]);
  await client.query(`insert into investing.metric_request_sets_scientific_identities (metric_request_set_identity_id, tenant_id, principal_id, tenant_membership_id, operation, capability, operation_scope, source_context, metric_registry_version, hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload) values (extensions.gen_random_uuid(),$1,$2,$3,'RESEARCH_RUN_INPUT_SCIENTIFIC_CREATE_V1','RESEARCH_MUTATE','TENANT_SCOPE','PURE_RESEARCH','METRIC_REGISTRY_V20260927','SHA-256','SYNTRAKE:METRIC_REQUEST_SET:V1','SYNTRAKE_SHA256_V1',$4,$5::jsonb)`, [fx.tenantId, fx.principalId, fx.membershipId, fx.metricRequestSet.hashHex, JSON.stringify(metricRequestSetPayload)]);
  await client.query(`insert into investing.execution_configs_scientific_identities (execution_config_identity_id, tenant_id, principal_id, tenant_membership_id, operation, capability, operation_scope, source_context, engine_compatibility_version, hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload) values (extensions.gen_random_uuid(),$1,$2,$3,'RESEARCH_RUN_INPUT_SCIENTIFIC_CREATE_V1','RESEARCH_MUTATE','TENANT_SCOPE','PURE_RESEARCH','ENGINE_V20260926','SHA-256','SYNTRAKE:EXECUTION_CONFIG:V1','SYNTRAKE_SHA256_V1',$4,$5::jsonb)`, [fx.tenantId, fx.principalId, fx.membershipId, fx.executionConfig.hashHex, JSON.stringify(executionConfigPayload)]);
  await seedRl8OperationalEvidence(client, fx, suffix);
  await createAcceptedRl8PromotionLeaf(client, fx);
}

async function seedRl8OperationalEvidence(client: PoolClient, fx: Rl9BehaviorFixture, suffix: string): Promise<void> {
  const root = rootEvidence(fx);
  const full = fullEvidence(fx);
  await client.query(`insert into investing.run_inputs_scientific_identities (run_input_identity_id, tenant_id, principal_id, tenant_membership_id, research_investigation_id, research_experiment_id, research_spec_revision_id, operation, capability, operation_scope, source_context, research_spec_hash_hex, research_ir_hash_hex, experiment_hash_hex, dataset_snapshot_hash_hex, metric_registry_version, metric_request_set_hash_hex, engine_version, execution_config_hash_hex, hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload) values ($1,$2,$3,$4,$5,$6,$7,'RESEARCH_RUN_INPUT_SCIENTIFIC_CREATE_V1','RESEARCH_MUTATE','TENANT_SCOPE','PURE_RESEARCH',$8,$9,$10,$11,'METRIC_REGISTRY_V20260927',$12,'ENGINE_V20260926',$13,'SHA-256','SYNTRAKE:RUN_INPUT:V1','SYNTRAKE_SHA256_V1',$14,$15::jsonb)`, [fx.runInputIdentityId, fx.tenantId, fx.principalId, fx.membershipId, fx.investigationId, fx.researchExperimentId, fx.researchSpecRevisionId, h(`${suffix}:research-spec`), fx.subjectResearchIr.hashHex, fx.subjectExperiment.hashHex, h(`${suffix}:dataset`), fx.metricRequestSet.hashHex, fx.executionConfig.hashHex, root.runInput!.hashHex, JSON.stringify({ schemaVersion: "RUN_INPUT_HASH_PAYLOAD_V1", researchSourceContext: "PURE_RESEARCH", metricRegistryVersion: "METRIC_REGISTRY_V20260927", engineVersion: "ENGINE_V20260926", researchSpec: hashRef("SYNTRAKE:RESEARCH_SPEC:V1", `${suffix}:research-spec`), researchIr: fx.subjectResearchIr, experiment: fx.subjectExperiment, datasetSnapshot: hashRef("SYNTRAKE:DATASET_SNAPSHOT:V1", `${suffix}:dataset`), metricRequestSet: fx.metricRequestSet, executionConfig: fx.executionConfig })]);
  const trace = await uuid(client); const valuation = await uuid(client); const metrics = await uuid(client);
  for (const [id, kind, schema] of [[trace, "EXECUTION_TRACE", "EXECUTION_TRACE_V1"], [valuation, "VALUATION_SERIES", "VALUATION_SERIES_V1"], [metrics, "METRIC_RESULT_SET", "METRIC_RESULT_SET_V1"]]) {
    const content = `${JSON.stringify({ suffix, kind })}\n`;
    await client.query(`insert into investing.research_result_artifacts (artifact_id, tenant_id, principal_id, tenant_membership_id, operation, capability, operation_scope, source_context, artifact_kind, artifact_schema_version, format, content_sha256, content_byte_length, record_count, content) values ($1,$2,$3,$4,'RESEARCH_EXECUTION_RUN_V1','RESEARCH_EXECUTE','TENANT_SCOPE','PURE_RESEARCH',$5,$6,'CANONICAL_JSONL_UTF8_LF_FINAL_NEWLINE_V1',upper(encode(extensions.digest(convert_to($7,'UTF8'),'sha256'),'hex')),octet_length(convert_to($7,'UTF8')),1,convert_to($7,'UTF8'))`, [id, fx.tenantId, fx.principalId, fx.membershipId, kind, schema, content]);
  }
  await client.query(`insert into investing.research_results_scientific_identities (result_identity_id, tenant_id, principal_id, tenant_membership_id, run_input_identity_id, execution_trace_artifact_id, valuation_series_artifact_id, metric_result_set_artifact_id, operation, capability, operation_scope, source_context, engine_id, engine_version, hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload) values ($1,$2,$3,$4,$5,$6,$7,$8,'RESEARCH_EXECUTION_RUN_V1','RESEARCH_EXECUTE','TENANT_SCOPE','PURE_RESEARCH','HISTORICAL_EXECUTION_ADAPTER','ENGINE_V20260926','SHA-256','SYNTRAKE:RESULT:V1','SYNTRAKE_SHA256_V1',$9,'{"schemaVersion":"RESULT_HASH_PAYLOAD_V1"}'::jsonb)`, [fx.resultIdentityId, fx.tenantId, fx.principalId, fx.membershipId, fx.runInputIdentityId, trace, valuation, metrics, root.result!.hashHex]);
  await client.query(`insert into investing.research_evidence_objects_scientific_identities (evidence_identity_id, tenant_id, principal_id, tenant_membership_id, run_input_identity_id, result_identity_id, descriptor_schema_version, descriptor_kind, descriptor_artifact_schema_version, descriptor_format, content, content_sha256, content_byte_length, hash_algorithm, hash_domain, hash_version, hash_hex, operation, capability, operation_scope, source_context) values ($1,$2,$3,$4,$5,$6,'EVIDENCE_CONTENT_DESCRIPTOR_V1','RESEARCH_EXECUTION_EVIDENCE','RESEARCH_EXECUTION_EVIDENCE_V1','CANONICAL_JSON_UTF8_V1',convert_to($7,'UTF8'),upper(encode(extensions.digest(convert_to($7,'UTF8'),'sha256'),'hex')),octet_length(convert_to($7,'UTF8')),'SHA-256','SYNTRAKE:EVIDENCE_OBJECT:V1','SYNTRAKE_SHA256_V1',$8,'RESEARCH_EXECUTION_RUN_V1','RESEARCH_EXECUTE','TENANT_SCOPE','PURE_RESEARCH')`, [fx.evidenceObjectIdentityId, fx.tenantId, fx.principalId, fx.membershipId, fx.runInputIdentityId, fx.resultIdentityId, JSON.stringify({ suffix, kind: "evidence" }), full.evidenceObject!.hashHex]);
  await client.query(`insert into investing.research_validation_protocols_scientific_identities (research_validation_protocol_identity_id, tenant_id, principal_id, tenant_membership_id, research_investigation_id, research_experiment_id, operation, capability, operation_scope, source_context, hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload) values ($1,$2,$3,$4,$5,$6,'RESEARCH_VALIDATION_PROTOCOL_CREATE_V1','RESEARCH_MUTATE','TENANT_SCOPE','PURE_RESEARCH','SHA-256','SYNTRAKE:VALIDATION_PROTOCOL:V1','SYNTRAKE_SHA256_V1',$7,'{"schemaVersion":"TEST_VALIDATION_PROTOCOL"}'::jsonb)`, [fx.validationProtocolIdentityId, fx.tenantId, fx.principalId, fx.membershipId, fx.investigationId, fx.researchExperimentId, full.validationProtocol!.hashHex]);
  await client.query(`insert into investing.research_validation_results_scientific_identities (research_validation_result_identity_id, tenant_id, principal_id, tenant_membership_id, research_investigation_id, research_validation_protocol_identity_id, research_experiment_id, operation, capability, operation_scope, source_context, hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload) values ($1,$2,$3,$4,$5,$6,$7,'RESEARCH_VALIDATION_RESULT_FINALIZE_V1','RESEARCH_MUTATE','TENANT_SCOPE','PURE_RESEARCH','SHA-256','SYNTRAKE:VALIDATION_RESULT:V1','SYNTRAKE_SHA256_V1',$8,'{"schemaVersion":"TEST_VALIDATION_RESULT"}'::jsonb)`, [fx.validationResultIdentityId, fx.tenantId, fx.principalId, fx.membershipId, fx.investigationId, fx.validationProtocolIdentityId, fx.researchExperimentId, full.validationResult!.hashHex]);
  await client.query(`insert into investing.research_validation_assessment_protocols_scientific_identities (research_validation_assessment_protocol_identity_id, tenant_id, principal_id, tenant_membership_id, research_investigation_id, research_validation_protocol_identity_id, research_experiment_id, validation_protocol_hash_hex, subject_experiment_hash_hex, subject_research_ir_hash_hex, metric_registry_version, assessment_methodology, operation, capability, operation_scope, source_context, hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'METRIC_REGISTRY_V20260927','VALIDATION_ASSESSMENT_METHODOLOGY_V20260929','RESEARCH_VALIDATION_ASSESSMENT_PROTOCOL_CREATE_V1','RESEARCH_MUTATE','TENANT_SCOPE','PURE_RESEARCH','SHA-256','SYNTRAKE:VALIDATION_ASSESSMENT_PROTOCOL:V1','SYNTRAKE_SHA256_V1',$11,$12::jsonb)`, [fx.validationAssessmentProtocolIdentityId, fx.tenantId, fx.principalId, fx.membershipId, fx.investigationId, fx.validationProtocolIdentityId, fx.researchExperimentId, full.validationProtocol!.hashHex, fx.subjectExperiment.hashHex, fx.subjectResearchIr.hashHex, full.validationAssessmentProtocol!.hashHex, JSON.stringify({ schemaVersion: "VALIDATION_ASSESSMENT_PROTOCOL_V1", assessmentMethodology: "VALIDATION_ASSESSMENT_METHODOLOGY_V20260929", validationProtocol: full.validationProtocol, subjectExperiment: fx.subjectExperiment, subjectResearchIr: fx.subjectResearchIr, metricRegistryVersion: "METRIC_REGISTRY_V20260927", criteria: [], requiredEvidenceRequirements: [], missingEvidenceSemantics: "REQUIRED_EVIDENCE_MISSING_IS_INSUFFICIENT_EVIDENCE_V1", aggregationRule: "ALL_REQUIRED_CRITERIA_PASS_V1" })]);
  await client.query(`insert into investing.research_validation_assessment_results_scientific_identities (research_validation_assessment_result_identity_id, tenant_id, principal_id, tenant_membership_id, research_investigation_id, research_validation_protocol_identity_id, research_experiment_id, research_validation_assessment_protocol_identity_id, research_validation_result_identity_id, assessment_protocol_hash_hex, validation_protocol_hash_hex, validation_result_hash_hex, subject_experiment_hash_hex, subject_research_ir_hash_hex, metric_registry_version, outcome, operation, capability, operation_scope, source_context, hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'METRIC_REGISTRY_V20260927','PASS','RESEARCH_VALIDATION_ASSESSMENT_RESULT_FINALIZE_V1','RESEARCH_MUTATE','TENANT_SCOPE','PURE_RESEARCH','SHA-256','SYNTRAKE:VALIDATION_ASSESSMENT_RESULT:V1','SYNTRAKE_SHA256_V1',$15,$16::jsonb)`, [fx.validationAssessmentResultIdentityId, fx.tenantId, fx.principalId, fx.membershipId, fx.investigationId, fx.validationProtocolIdentityId, fx.researchExperimentId, fx.validationAssessmentProtocolIdentityId, fx.validationResultIdentityId, full.validationAssessmentProtocol!.hashHex, full.validationProtocol!.hashHex, full.validationResult!.hashHex, fx.subjectExperiment.hashHex, fx.subjectResearchIr.hashHex, full.validationAssessmentResult!.hashHex, JSON.stringify({ schemaVersion: "VALIDATION_ASSESSMENT_RESULT_V1", assessmentProtocol: full.validationAssessmentProtocol, validationProtocol: full.validationProtocol, validationResult: full.validationResult, subjectExperiment: fx.subjectExperiment, subjectResearchIr: fx.subjectResearchIr, metricRegistryVersion: "METRIC_REGISTRY_V20260927", consumedEvidence: [], criterionOutcomes: [], outcome: "PASS" })]);
  await client.query(`insert into investing.research_experiment_comparison_protocols_scientific_identities (research_experiment_comparison_protocol_identity_id, tenant_id, principal_id, tenant_membership_id, research_investigation_id, hash_hex, logical_comparison_key, canonical_payload) values ($1,$2,$3,$4,$5,$6,$7,'{"schemaVersion":"TEST_COMPARISON_PROTOCOL"}'::jsonb)`, [fx.comparisonProtocolIdentityId, fx.tenantId, fx.principalId, fx.membershipId, fx.investigationId, full.robustnessComparisonProtocol!.hashHex, h(`${suffix}:comparison-logical-key`)]);
  await client.query(`insert into investing.research_experiment_comparison_results_scientific_identities (research_experiment_comparison_result_identity_id, tenant_id, principal_id, tenant_membership_id, research_investigation_id, research_experiment_comparison_protocol_identity_id, hash_hex, canonical_payload) values ($1,$2,$3,$4,$5,$6,$7,'{"schemaVersion":"TEST_COMPARISON_RESULT"}'::jsonb)`, [fx.comparisonResultIdentityId, fx.tenantId, fx.principalId, fx.membershipId, fx.investigationId, fx.comparisonProtocolIdentityId, full.robustnessComparisonResult!.hashHex]);
}

async function createAcceptedRl8PromotionLeaf(client: PoolClient, fx: Rl9BehaviorFixture): Promise<void> {
  await client.query("reset role");
  await client.query("set local role investing_app");
  await setRl9Authority(client, fx, "RESEARCH_SCIENTIFIC_PROMOTION_PROTOCOL_CREATE_V1", true);
  const protocol = await client.query<{ result: { researchScientificPromotionProtocolIdentityId: string } }>("select investing.persist_research_scientific_promotion_protocol_v1($1,$2::jsonb) as result", [hashScientificPromotionProtocolV1().hashHex, JSON.stringify(canonicalScientificPromotionProtocolV1())]);
  fx.protocolIdentityId = protocol.rows[0]!.result.researchScientificPromotionProtocolIdentityId;
  await setRl9Authority(client, fx, "RESEARCH_SCIENTIFIC_PROMOTION_ROOT_CREATE_V1", true);
  const root = rl8RootTransition(fx);
  const rootResult = await client.query<{ result: { researchScientificPromotionTransitionIdentityId: string } }>("select investing.persist_research_scientific_promotion_root_v1($1,$2::jsonb) as result", [hashScientificPromotionTransitionV1(root).hashHex, JSON.stringify(root)]);
  fx.rootTransitionIdentityId = rootResult.rows[0]!.result.researchScientificPromotionTransitionIdentityId;
  await setRl9Authority(client, fx, "RESEARCH_SCIENTIFIC_PROMOTION_EVALUATION_PLAN_PERSIST_V1", true);
  const stageA = rl8StageATransition(fx);
  const closure = rl8ClosureTransition(stageA);
  const evaluation = await client.query<{ result: { closureTransitionIdentityId: string } }>("select investing.persist_research_scientific_promotion_evaluation_plan_v1($1,$2,$3::jsonb,$4,$5::jsonb) as result", [fx.rootTransitionIdentityId, hashScientificPromotionTransitionV1(stageA).hashHex, JSON.stringify(stageA), hashScientificPromotionTransitionV1(closure).hashHex, JSON.stringify(closure)]);
  fx.promotionTransition = hashScientificPromotionTransitionV1(closure) as never;
  expect(evaluation.rows[0]!.result.closureTransitionIdentityId).toMatch(/^[0-9a-f-]{36}$/i);
  await client.query("reset role");
  fx.registrationPayload = registrationPayloadFor(fx);
  fx.registrationHash = hashRegistrationPayload(fx.registrationPayload);
}

async function insertRl8Successor(client: PoolClient, fx: Rl9BehaviorFixture): Promise<void> {
  // Inspect the persisted predecessor as the PG17 administrator. The app role
  // cannot use this direct SELECT as evidence; the writer authenticates itself.
  await client.query("reset role");
  const current = await client.query<{ id: string; hash: string }>("select research_scientific_promotion_transition_identity_id::text as id, transition_hash_hex as hash from investing.research_scientific_promotion_transitions_scientific_identities where tenant_id=$1 and research_investigation_id=$2 and transition_hash_hex=$3", [fx.tenantId, fx.investigationId, fx.promotionTransition.hashHex]);
  expect(current.rows).toHaveLength(1);
  expect(current.rows[0]!.hash).toBe(fx.promotionTransition.hashHex);
  await setRl9Authority(client, fx, "RESEARCH_SCIENTIFIC_PROMOTION_EVALUATION_PLAN_PERSIST_V1", true);
  const stageA: ScientificPromotionTransitionV1 = { ...rl8StageATransition(fx), predecessorState: "PROMOTION_ELIGIBLE", resultingState: "VALIDATION_PASSED", predecessorTransition: fx.promotionTransition };
  const closure = rl8ClosureTransition(stageA);
  // The RL-8C2 writer inserts Stage A and its required PROMOTION_ELIGIBLE
  // closure atomically; never bypass the deferred closure integrity trigger.
  const persisted = await client.query<{ result: { status: string; closureTransitionIdentityId: string } }>(
    "select investing.persist_research_scientific_promotion_evaluation_plan_v1($1::uuid,$2::text,$3::jsonb,$4::text,$5::jsonb) as result",
    [current.rows[0]!.id, hashScientificPromotionTransitionV1(stageA).hashHex, JSON.stringify(stageA), hashScientificPromotionTransitionV1(closure).hashHex, JSON.stringify(closure)],
  );
  expect(persisted.rows[0]!.result.status).toBe("CREATED");
  expect(persisted.rows[0]!.result.closureTransitionIdentityId).toMatch(/^[0-9a-f-]{36}$/i);
  await client.query("reset role");
}

async function sqlDomainHash(client: PoolClient, domain: string, payload: unknown): Promise<string> {
  const result = await client.query<{ hash: string }>("select investing.rl8c_sha256_hex_v1($1, $2::jsonb) as hash", [domain, JSON.stringify(payload)]);
  return result.rows[0]!.hash;
}

async function seedPersistedRl9Chain(client: PoolClient, suffix: string): Promise<Rl9BehaviorFixture & { registrationIdentityId: string; sealIdentityId: string; evaluationIdentityId: string; startedIdentityId: string; protocolIdentityId: string }> {
  const fx = await seedRl9BehaviorFixture(client, suffix);
  const protocol = await callBlindTruthWriter(client, fx, "RESEARCH_BLIND_TRUTH_PROTOCOL_CREATE_V1", "persist_research_blind_truth_protocol_v1", protocolHash, protocolPayload, true);
  const registration = await callBlindTruthWriter(client, fx, "RESEARCH_BLIND_TRUTH_REGISTRATION_CREATE_V1", "persist_research_blind_truth_registration_v1", fx.registrationHash, fx.registrationPayload, true);
  const seal = makeVaultSeal(fx.registrationPayload);
  const sealResult = await callBlindTruthWriter(client, fx, "RESEARCH_BLIND_TRUTH_VAULT_SEAL_CREATE_V1", "persist_research_blind_truth_vault_seal_v1", hashBlindTruthVaultSealV1(seal).hashHex, canonicalBlindTruthVaultSealV1(seal), false);
  const evaluation = makeEvaluation(fx.registrationPayload, seal);
  const evaluationResult = await callBlindTruthWriter(client, fx, "RESEARCH_BLIND_TRUTH_EVALUATION_CREATE_V1", "persist_research_blind_truth_evaluation_v1", hashBlindTruthEvaluationV1(evaluation).hashHex, canonicalBlindTruthEvaluationV1(evaluation), false);
  const started = makeRevealStarted(fx.registrationPayload, seal, evaluation);
  const startedResult = await callBlindTruthWriter(client, fx, "RESEARCH_BLIND_TRUTH_REVEAL_STARTED_CREATE_V1", "persist_research_blind_truth_reveal_started_v1", hashBlindTruthRevealResultEventV1(started).hashHex, canonicalBlindTruthRevealResultEventV1(started), false);
  return { ...fx, protocolIdentityId: protocol.researchBlindTruthProtocolIdentityId, registrationIdentityId: registration.researchBlindTruthRegistrationIdentityId, sealIdentityId: sealResult.researchBlindTruthVaultSealIdentityId, evaluationIdentityId: evaluationResult.researchBlindTruthEvaluationIdentityId, startedIdentityId: startedResult.researchBlindTruthRevealResultEventIdentityId };
}

async function createCommittedRegistrationFixture(suffix: string): Promise<Rl9BehaviorFixture> {
  const client = await pool!.connect();
  try {
    await client.query("begin");
    const fx = await seedRl9BehaviorFixture(client, suffix);
    // Force the deferred RL-8 closure check before changing to RL-9 authority.
    await client.query("commit");
    await client.query("begin");
    await callBlindTruthWriter(client, fx, "RESEARCH_BLIND_TRUTH_PROTOCOL_CREATE_V1", "persist_research_blind_truth_protocol_v1", protocolHash, protocolPayload, true);
    await client.query("commit");
    return fx;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function createCommittedRl9Chain(suffix: string): Promise<Rl9BehaviorFixture> {
  const client = await pool!.connect();
  try {
    await client.query("begin");
    const fx = await seedRl9BehaviorFixture(client, suffix);
    // Force the deferred RL-8 closure check before changing to RL-9 authority.
    await client.query("commit");
    await client.query("begin");
    await callBlindTruthWriter(client, fx, "RESEARCH_BLIND_TRUTH_PROTOCOL_CREATE_V1", "persist_research_blind_truth_protocol_v1", protocolHash, protocolPayload, true);
    await callBlindTruthWriter(client, fx, "RESEARCH_BLIND_TRUTH_REGISTRATION_CREATE_V1", "persist_research_blind_truth_registration_v1", fx.registrationHash, fx.registrationPayload, true);
    await client.query("commit");
    return fx;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function runWriterInCommittedTransaction(fx: Rl9BehaviorFixture, operation: string, functionName: string, hash: string, payload: unknown, asApp: boolean): Promise<Record<string, string>> {
  const client = await pool!.connect();
  try {
    await client.query("begin");
    const result = await callBlindTruthWriter(client, fx, operation, functionName, hash, payload, asApp);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function runConcurrentWriters(fx: Rl9BehaviorFixture, operation: string, functionName: string, hash: string, payload: unknown, asApp: boolean): Promise<[Record<string, string>, Record<string, string>]> {
  const [left, right] = await Promise.all([
    runWriterInCommittedTransaction(fx, operation, functionName, hash, payload, asApp),
    runWriterInCommittedTransaction(fx, operation, functionName, hash, payload, asApp),
  ]);
  return [left, right];
}

maybeDescribe("I5 RL-9B2 Blind Truth PG17 writer ACLs", () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString, max: 8 });
    await resetDatabase();
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    pool = null;
  });

  it("allows investing_app only the RL-9B public protocol and registration writers", async () => {
    const { rows } = await pool!.query(`
      select p.proname, has_function_privilege('investing_app', p.oid, 'EXECUTE') as app_execute,
             has_function_privilege('service_role', p.oid, 'EXECUTE') as service_execute,
             has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
             p.prosecdef,
             pg_get_userbyid(p.proowner) as owner,
             p.proconfig,
             pg_get_functiondef(p.oid) as definition
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'investing' and p.proname like 'persist_research_blind_truth_%_v1'
      order by p.proname
    `);
    expect(rows.map((row) => row.proname)).toEqual([
      "persist_research_blind_truth_evaluation_v1",
      "persist_research_blind_truth_final_event_v1",
      "persist_research_blind_truth_protocol_v1",
      "persist_research_blind_truth_registration_v1",
      "persist_research_blind_truth_reveal_started_v1",
      "persist_research_blind_truth_vault_seal_v1",
    ]);
    expect(rows.filter((row) => row.app_execute).map((row) => row.proname).sort()).toEqual([
      "persist_research_blind_truth_protocol_v1",
      "persist_research_blind_truth_registration_v1",
    ]);
    expect(rows.every((row) => !row.service_execute && !row.anon_execute && row.prosecdef && row.owner === "investing_rl9_writer" && String(row.proconfig).includes("search_path=pg_catalog"))).toBe(true);
  });

  it("keeps investing_rl9_writer hardened and outside forbidden memberships", async () => {
    const role = await pool!.query(`
      select rolcanlogin, rolinherit, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls
      from pg_roles where rolname = 'investing_rl9_writer'
    `);
    expect(role.rows).toEqual([{ rolcanlogin: false, rolinherit: false, rolsuper: false, rolcreatedb: false, rolcreaterole: false, rolreplication: false, rolbypassrls: false }]);
    const memberships = await pool!.query(`
      select pg_has_role('investing_app','investing_rl9_writer','member') as app_member,
             pg_has_role('service_role','investing_rl9_writer','member') as service_member,
             pg_has_role('investing_rl9_writer','investing_owner','member') as owner_member,
             exists (
               with recursive granted_roles(roleid) as (
                 select m.roleid from pg_catalog.pg_auth_members m
                 where m.member = 'postgres'::regrole
                 union
                 select m.roleid from pg_catalog.pg_auth_members m
                 join granted_roles g on g.roleid = m.member
               )
               select 1 from granted_roles
               where roleid = 'investing_rl9_writer'::regrole
             ) as postgres_member,
             has_schema_privilege('investing_rl9_writer','investing','CREATE') as writer_can_create
    `);
    expect(memberships.rows[0]).toEqual({ app_member: false, service_member: false, owner_member: false, postgres_member: false, writer_can_create: false });
  });


  it("persists current protocol through investing_app and reuses identical protocol deterministically", async () => {
    const client = await pool!.connect();
    try {
      await client.query("begin");
      await setAppAuthority(client, "RESEARCH_BLIND_TRUTH_PROTOCOL_CREATE_V1");
      const created = await client.query(`select investing.persist_research_blind_truth_protocol_v1($1::text, $2::jsonb) as result`, [protocolHash, JSON.stringify(protocolPayload)]);
      expect(created.rows[0].result.status).toBe("CREATED");
      const reused = await client.query(`select investing.persist_research_blind_truth_protocol_v1($1::text, $2::jsonb) as result`, [protocolHash, JSON.stringify(protocolPayload)]);
      expect(reused.rows[0].result.status).toBe("REUSED_IDENTICAL");
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  });

  it("uses real separate database connections for concurrent identical protocol replay", async () => {
    const [first, second] = await Promise.all([pool!.connect(), pool!.connect()]);
    try {
      await Promise.all([first.query("begin"), second.query("begin")]);
      await Promise.all([
        setAppAuthority(first, "RESEARCH_BLIND_TRUTH_PROTOCOL_CREATE_V1"),
        setAppAuthority(second, "RESEARCH_BLIND_TRUTH_PROTOCOL_CREATE_V1"),
      ]);
      // Demonstrate contention on the writer's transaction-scoped advisory lock
      // without awaiting two transactions that cannot both finish before commit.
      const left = await first.query(`select investing.persist_research_blind_truth_protocol_v1($1::text, $2::jsonb) as result`, [protocolHash, JSON.stringify(protocolPayload)]);
      const contention = await second.query(
        "select pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('RL9B_PROTOCOL:' || $1::text, 0)) as acquired",
        [protocolHash],
      );
      expect(contention.rows[0].acquired).toBe(false);
      const secondPending = second.query(`select investing.persist_research_blind_truth_protocol_v1($1::text, $2::jsonb) as result`, [protocolHash, JSON.stringify(protocolPayload)]);
      await first.query("commit");
      const right = await secondPending;
      await second.query("commit");
      expect([left.rows[0].result.status, right.rows[0].result.status].sort()).toEqual(["REUSED_IDENTICAL", "REUSED_IDENTICAL"]);
      const count = await pool!.query(`select count(*)::int as count from investing.research_blind_truth_protocols_scientific_identities where hash_hex = $1`, [protocolHash]);
      expect(count.rows[0].count).toBe(1);
    } catch (error) {
      await Promise.allSettled([first.query("rollback"), second.query("rollback")]);
      throw error;
    } finally {
      first.release();
      second.release();
    }
  });

  it("proves RL-9 writer can execute exact RL-8 canonical helpers without widening app/service execution", async () => {
    const grants = await pool!.query(`
      select
        has_function_privilege('investing_rl9_writer','investing.rl8c_jsonb_has_number_v1(jsonb)','EXECUTE') as number_execute,
        has_function_privilege('investing_rl9_writer','investing.rl8c_canonical_jsonb_v1(jsonb)','EXECUTE') as canonical_execute,
        has_function_privilege('investing_rl9_writer','investing.rl8c_sha256_hex_v1(text,jsonb)','EXECUTE') as hash_execute,
        has_function_privilege('investing_app','investing.rl8c_sha256_hex_v1(text,jsonb)','EXECUTE') as app_hash_execute,
        has_function_privilege('service_role','investing.rl8c_sha256_hex_v1(text,jsonb)','EXECUTE') as service_hash_execute,
        has_function_privilege('anon','investing.rl8c_sha256_hex_v1(text,jsonb)','EXECUTE') as anon_hash_execute,
        has_function_privilege('authenticated','investing.rl8c_sha256_hex_v1(text,jsonb)','EXECUTE') as authenticated_hash_execute
    `);
    expect(grants.rows[0]).toEqual({
      number_execute: true,
      canonical_execute: true,
      hash_execute: true,
      app_hash_execute: false,
      service_hash_execute: false,
      anon_hash_execute: false,
      authenticated_hash_execute: false,
    });
  });

  it("keeps RL-9 public validation helpers executable only by the internal RL-9 writer", async () => {
    const { rows } = await pool!.query(`
      select p.proname, has_function_privilege('investing_rl9_writer', p.oid, 'EXECUTE') as writer_execute,
             has_function_privilege('investing_app', p.oid, 'EXECUTE') as app_execute,
             has_function_privilege('service_role', p.oid, 'EXECUTE') as service_execute,
             has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
             has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'investing' and p.proname in (
        'rl9b_protocol_payload_valid_v1',
        'rl9b_registration_payload_valid_v1',
        'rl9b_seal_payload_valid_v1',
        'rl9b_evaluation_payload_valid_v1',
        'rl9b_event_payload_valid_v1'
      )
      order by p.proname
    `);
    expect(rows.map((row) => row.proname)).toEqual([
      "rl9b_evaluation_payload_valid_v1",
      "rl9b_event_payload_valid_v1",
      "rl9b_protocol_payload_valid_v1",
      "rl9b_registration_payload_valid_v1",
      "rl9b_seal_payload_valid_v1",
    ]);
    expect(rows.every((row) => row.writer_execute && !row.app_execute && !row.service_execute && !row.anon_execute && !row.authenticated_execute)).toBe(true);
  });


  it("returns false, not null, for malformed null-bearing public metadata validators", async () => {
    const checks = await pool!.query(`
      select
        investing.rl9b_hashref_matches_v1('{"hashAlgorithm":null,"hashDomain":"SYNTRAKE:BLIND_TRUTH_PROTOCOL:V1","hashVersion":"SYNTRAKE_SHA256_V1","hashHex":"B525A1D24BF0E843F8965915AEA8F0D70400CAD1E7E0E0099617F85521B0FE4C"}'::jsonb, 'SYNTRAKE:BLIND_TRUTH_PROTOCOL:V1', 'B525A1D24BF0E843F8965915AEA8F0D70400CAD1E7E0E0099617F85521B0FE4C') is false as hashref_null_field_rejected,
        investing.rl9b_evaluator_profile_valid_v1('{"blindTruthEvaluatorBehaviorVersion":"BLIND_TRUTH_EVALUATOR_V1","engineId":null,"engineVersion":"ENGINE_V20260926","metricRegistryVersion":"METRIC_REGISTRY_V20260927","metricResultArtifactSchemaVersion":"METRIC_RESULT_SET_V2"}'::jsonb) is false as evaluator_null_field_rejected,
        investing.rl9b_holdout_scope_valid_v1('{"schemaVersion":"BLIND_TRUTH_HOLDOUT_SCOPE_V1","providerId":null,"providerDatasetId":"DATASET_V1","providerDatasetVersion":"DATASET_VERSION_20261009","markets":["BTCUSD"],"frequency":"M1","fields":["close"],"coverageStart":"2026-01-01","coverageEnd":"2026-06-30","calendarId":"CALENDAR_24_7_V1","timezone":"UTC"}'::jsonb) is false as holdout_provider_null_rejected,
        investing.rl9b_holdout_scope_valid_v1('{"schemaVersion":"BLIND_TRUTH_HOLDOUT_SCOPE_V1","providerId":"PROVIDER_V1","providerDatasetId":"DATASET_V1","providerDatasetVersion":"DATASET_VERSION_20261009","markets":["BTCUSD"],"frequency":"M1","fields":["close"],"coverageStart":"2026-01-01","coverageEnd":"2026-06-30","calendarId":"CALENDAR_24_7_V1","timezone":null}'::jsonb) is false as holdout_timezone_null_rejected,
        investing.rl9b_criteria_valid_v1('[{"criterionId":null,"criterionVersion":"CRITERION_V1","metricId":"TOTAL_RETURN","metricVersion":"METRIC_V2","operator":"GTE","required":true,"threshold":{"kind":"SCALAR","value":{"kind":"RATIO","value":"0.1"}}}]'::jsonb) is false as criterion_id_null_rejected,
        investing.rl9b_criteria_valid_v1('[{"criterionId":"TOTAL_RETURN_PASS","criterionVersion":"CRITERION_V1","metricId":null,"metricVersion":"METRIC_V2","operator":"GTE","required":true,"threshold":{"kind":"SCALAR","value":{"kind":"RATIO","value":"0.1"}}}]'::jsonb) is false as metric_id_null_rejected,
        investing.rl9b_criteria_valid_v1('[{"criterionId":"TOTAL_RETURN_PASS","criterionVersion":"CRITERION_V1","metricId":"TOTAL_RETURN","metricVersion":"METRIC_V2","operator":"GTE","required":null,"threshold":{"kind":"SCALAR","value":{"kind":"RATIO","value":"0.1"}}}]'::jsonb) is false as required_null_rejected,
        investing.rl9b_numeric_value_valid_v1('{"kind":"RATIO","value":null}'::jsonb, 'TOTAL_RETURN') is false as threshold_value_null_rejected,
        investing.rl9b_seal_payload_valid_v1('{"schemaVersion":"BLIND_TRUTH_VAULT_SEAL_V1","protocol":{"hashAlgorithm":"SHA-256","hashDomain":"SYNTRAKE:BLIND_TRUTH_PROTOCOL:V1","hashVersion":"SYNTRAKE_SHA256_V1","hashHex":"B525A1D24BF0E843F8965915AEA8F0D70400CAD1E7E0E0099617F85521B0FE4C"},"registration":{"hashAlgorithm":"SHA-256","hashDomain":"SYNTRAKE:BLIND_TRUTH_REGISTRATION:V1","hashVersion":"SYNTRAKE_SHA256_V1","hashHex":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"},"holdoutScopeDigest":"BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB","commitmentAlgorithm":"SHA256_DOMAIN_SEPARATED_SALTED_V1","commitmentHash":"CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC","declaredPlaintextByteLength":null,"vaultFormatVersion":"BLIND_TRUTH_VAULT_FORMAT_V1"}'::jsonb, 'B525A1D24BF0E843F8965915AEA8F0D70400CAD1E7E0E0099617F85521B0FE4C', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA') is false as seal_length_null_rejected,
        investing.rl9b_event_payload_valid_v1('{"schemaVersion":"BLIND_TRUTH_REVEAL_RESULT_EVENT_V1","protocol":{"hashAlgorithm":"SHA-256","hashDomain":"SYNTRAKE:BLIND_TRUTH_PROTOCOL:V1","hashVersion":"SYNTRAKE_SHA256_V1","hashHex":"B525A1D24BF0E843F8965915AEA8F0D70400CAD1E7E0E0099617F85521B0FE4C"},"registration":{"hashAlgorithm":"SHA-256","hashDomain":"SYNTRAKE:BLIND_TRUTH_REGISTRATION:V1","hashVersion":"SYNTRAKE_SHA256_V1","hashHex":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"},"vaultSeal":{"hashAlgorithm":"SHA-256","hashDomain":"SYNTRAKE:BLIND_TRUTH_VAULT_SEAL:V1","hashVersion":"SYNTRAKE_SHA256_V1","hashHex":"BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB"},"evaluation":{"hashAlgorithm":"SHA-256","hashDomain":"SYNTRAKE:BLIND_TRUTH_EVALUATION:V1","hashVersion":"SYNTRAKE_SHA256_V1","hashHex":"CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC"},"predecessorEvent":null,"eventState":null,"reason":null,"result":null}'::jsonb, 'B525A1D24BF0E843F8965915AEA8F0D70400CAD1E7E0E0099617F85521B0FE4C', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB', 'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC', null, null, null) is false as event_state_null_rejected
    `);
    expect(Object.values(checks.rows[0]).every(Boolean)).toBe(true);
  });

  it("executes the final nested validator, numeric, holdout and seal rejection surface in PostgreSQL", async () => {
    const checks = await pool!.query(`
      select
        investing.rl9b_metric_numeric_kind_v1('TRADE_COUNT') = 'INTEGER' as trade_integer,
        investing.rl9b_metric_numeric_kind_v1('TOTAL_RETURN') = 'RATIO' as total_ratio,
        investing.rl9b_metric_numeric_kind_v1('VOLATILITY') is null as pseudo_metric_rejected,
        investing.rl9b_decimal_canonical_v1('0.1') as ratio_valid,
        not investing.rl9b_decimal_canonical_v1('0.10') as trailing_zero_rejected,
        not investing.rl9b_decimal_canonical_v1('1.0000000000000000001') as scale_rejected,
        not investing.rl9b_decimal_canonical_v1('-0') as negative_zero_rejected,
        investing.rl9b_immutable_behavior_token_v1('PROVIDER_V1') as behavior_token_valid,
        not investing.rl9b_immutable_behavior_token_v1('current') as mutable_alias_rejected,
        investing.rl9b_text_array_sorted_unique_nonempty_v1('["A","B"]'::jsonb, 256) as sorted_array_valid,
        not investing.rl9b_text_array_sorted_unique_nonempty_v1('["B","A"]'::jsonb, 256) as unsorted_array_rejected,
        not investing.rl9b_text_array_sorted_unique_nonempty_v1('["A","A"]'::jsonb, 256) as duplicate_array_rejected,
        not investing.rl9b_holdout_scope_valid_v1('{"schemaVersion":"BLIND_TRUTH_HOLDOUT_SCOPE_V1","providerId":"CURRENT","providerDatasetId":"DATASET_V1","providerDatasetVersion":"DATASET_VERSION_20261009","markets":["BTCUSD"],"frequency":"M1","fields":["close"],"coverageStart":"2026-01-01","coverageEnd":"2026-06-30","calendarId":"CALENDAR_24_7_V1","timezone":"UTC"}'::jsonb) as mutable_provider_rejected,
        not investing.rl9b_holdout_scope_valid_v1('{"schemaVersion":"BLIND_TRUTH_HOLDOUT_SCOPE_V1","providerId":"PROVIDER_V1","providerDatasetId":"DATASET_V1","providerDatasetVersion":"DATASET_VERSION_20261009","markets":["BTCUSD"],"frequency":"M1","fields":["close"],"coverageStart":"2026-02-31","coverageEnd":"2026-06-30","calendarId":"CALENDAR_24_7_V1","timezone":"UTC"}'::jsonb) as invalid_date_rejected,
        not investing.rl9b_numeric_value_valid_v1('{"kind":"RATIO","value":"0.10"}'::jsonb, 'TOTAL_RETURN') as nested_noncanonical_ratio_rejected,
        not investing.rl9b_threshold_valid_v1('{"kind":"RANGE","lower":{"kind":"RATIO","value":"10"},"upper":{"kind":"RATIO","value":"2"}}'::jsonb, 'TOTAL_RETURN', 'BETWEEN_INCLUSIVE') as invalid_range_rejected
    `);
    expect(Object.values(checks.rows[0]).every(Boolean)).toBe(true);
  });

  it("executes real RL-9B registration, seal, evaluation, reveal and final writers against a reusable RL-8 promotion fixture", async () => {
    const client = await pool!.connect();
    try {
      await client.query("begin");
      const fx = await seedRl9BehaviorFixture(client, "behavior-main");
      const protocolCreated = await callBlindTruthWriter(client, fx, "RESEARCH_BLIND_TRUTH_PROTOCOL_CREATE_V1", "persist_research_blind_truth_protocol_v1", protocolHash, protocolPayload, true);
      expect(["CREATED", "REUSED_IDENTICAL"]).toContain(protocolCreated.status);
      const created = await callBlindTruthWriter(client, fx, "RESEARCH_BLIND_TRUTH_REGISTRATION_CREATE_V1", "persist_research_blind_truth_registration_v1", fx.registrationHash, fx.registrationPayload, true);
      expect(created.status).toBe("CREATED");
      const replay = await callBlindTruthWriter(client, fx, "RESEARCH_BLIND_TRUTH_REGISTRATION_CREATE_V1", "persist_research_blind_truth_registration_v1", fx.registrationHash, fx.registrationPayload, true);
      expect(replay.status).toBe("REUSED_IDENTICAL");
      const persisted = await client.query(`
        select tenant_id::text, principal_id::text, tenant_membership_id::text, research_investigation_id::text, research_experiment_id::text,
               subject_experiment_hash_hex, subject_experiment_parameters_hash_hex, subject_research_ir_hash_hex,
               promotion_protocol_hash_hex, promotion_transition_hash_hex, hypothesis_hash_hex,
               metric_request_set_hash_hex, execution_config_hash_hex, registration_hash_hex
        from investing.research_blind_truth_registrations_scientific_identities where registration_hash_hex=$1`, [fx.registrationHash]);
      expect(persisted.rows[0]).toMatchObject({
        tenant_id: fx.tenantId,
        principal_id: fx.principalId,
        tenant_membership_id: fx.membershipId,
        research_investigation_id: fx.investigationId,
        research_experiment_id: fx.researchExperimentId,
        subject_experiment_hash_hex: fx.subjectExperiment.hashHex,
        subject_experiment_parameters_hash_hex: fx.subjectExperimentParameters.hashHex,
        subject_research_ir_hash_hex: fx.subjectResearchIr.hashHex,
        promotion_protocol_hash_hex: fx.promotionProtocol.hashHex,
        promotion_transition_hash_hex: fx.promotionTransition.hashHex,
        hypothesis_hash_hex: fx.hypothesis.hashHex,
        metric_request_set_hash_hex: fx.metricRequestSet.hashHex,
        execution_config_hash_hex: fx.executionConfig.hashHex,
        registration_hash_hex: fx.registrationHash,
      });

      // A different investigation in the same tenant cannot replay the current
      // registration without its own subject/promotion evidence. Do not duplicate
      // globally unique scientific rows merely to manufacture a hash collision.
      const secondInvestigation: Rl9BehaviorFixture = { ...fx, investigationId: await uuid(client), idempotencyRecordId: await uuid(client) };
      await seedAuthority(client, secondInvestigation, "behavior-second-investigation", true);
      expect(secondInvestigation.registrationHash).toBe(fx.registrationHash);
      await expectPgRejection(client, () => callBlindTruthWriter(client, secondInvestigation, "RESEARCH_BLIND_TRUTH_REGISTRATION_CREATE_V1", "persist_research_blind_truth_registration_v1", secondInvestigation.registrationHash, secondInvestigation.registrationPayload, true), /WRONG_SUBJECT/);
      const sameTenantHashCount = await client.query<{ count: number }>(`select count(*)::int as count from investing.research_blind_truth_registrations_scientific_identities where tenant_id=$1 and registration_hash_hex=$2`, [fx.tenantId, fx.registrationHash]);
      expect(sameTenantHashCount.rows[0]!.count).toBe(1);

      const crossTenant = await seedRl9BehaviorFixture(client, "behavior-cross-tenant", { subjectExperiment: fx.subjectExperiment, subjectExperimentParameters: fx.subjectExperimentParameters, subjectResearchIr: fx.subjectResearchIr, hypothesis: fx.hypothesis, scienceKey: fx.scienceKey });
      expect(crossTenant.registrationHash).toBe(fx.registrationHash);
      const crossTenantResult = await callBlindTruthWriter(client, crossTenant, "RESEARCH_BLIND_TRUTH_REGISTRATION_CREATE_V1", "persist_research_blind_truth_registration_v1", crossTenant.registrationHash, crossTenant.registrationPayload, true);
      expect(crossTenantResult.status).toBe("CREATED");
      const crossTenantHashCount = await client.query<{ count: number }>(`select count(*)::int as count from investing.research_blind_truth_registrations_scientific_identities where registration_hash_hex=$1`, [fx.registrationHash]);
      expect(crossTenantHashCount.rows[0]!.count).toBe(2);

      const staleRegistration = await seedRl9BehaviorFixture(client, "behavior-stale-registration");
      await insertRl8Successor(client, staleRegistration);
      await expectPgRejection(client, () => callBlindTruthWriter(client, staleRegistration, "RESEARCH_BLIND_TRUTH_REGISTRATION_CREATE_V1", "persist_research_blind_truth_registration_v1", staleRegistration.registrationHash, staleRegistration.registrationPayload, true), /STALE_PROMOTION_TRANSITION/);

      const malformedRegistrationCanonical = canonicalBlindTruthRegistrationV1(fx.registrationPayload) as unknown as Record<string, unknown>;
      const malformedRegistrationPayload = { ...malformedRegistrationCanonical, evaluatorProfile: { ...(malformedRegistrationCanonical.evaluatorProfile as Record<string, unknown>), engineVersion: "ENGINE_OLD" } };
      const malformedRegistrationHash = await sqlDomainHash(client, "SYNTRAKE:BLIND_TRUTH_REGISTRATION:V1", malformedRegistrationPayload);
      // Existing one-shot identity rejects divergent payloads via a non-mutating
      // status. It is not a SQL exception and must not be asserted as one.
      await expectWriterStatus(client, fx, "RESEARCH_BLIND_TRUTH_REGISTRATION_CREATE_V1", "persist_research_blind_truth_registration_v1", malformedRegistrationHash, malformedRegistrationPayload, "DIVERGENT_EXISTING_IDENTITY", true);

      // A fresh candidate reaches the database CHECK instead of hiding malformed
      // input behind the existing one-shot collision.
      const invalidOnly = await seedRl9BehaviorFixture(client, "behavior-invalid-registration");
      const invalidCanonical = canonicalBlindTruthRegistrationV1(invalidOnly.registrationPayload) as unknown as Record<string, unknown>;
      const invalidPayload = { ...invalidCanonical, evaluatorProfile: { ...(invalidCanonical.evaluatorProfile as Record<string, unknown>), engineVersion: "ENGINE_OLD" } };
      const invalidHash = await sqlDomainHash(client, "SYNTRAKE:BLIND_TRUTH_REGISTRATION:V1", invalidPayload);
      await expectPgRejection(client, () => callBlindTruthWriter(client, invalidOnly, "RESEARCH_BLIND_TRUTH_REGISTRATION_CREATE_V1", "persist_research_blind_truth_registration_v1", invalidHash, invalidPayload, true), /research_blind_truth_registrations_payload_check/);

      const sealPayload = makeVaultSeal(fx.registrationPayload);
      const sealCanonical = canonicalBlindTruthVaultSealV1(sealPayload);
      const sealHash = hashBlindTruthVaultSealV1(sealPayload).hashHex;
      await expectSqlHashParity(client, "SYNTRAKE:BLIND_TRUTH_VAULT_SEAL:V1", sealCanonical, sealHash);
      const sealCreated = await callBlindTruthWriter(client, fx, "RESEARCH_BLIND_TRUTH_VAULT_SEAL_CREATE_V1", "persist_research_blind_truth_vault_seal_v1", sealHash, sealCanonical, false);
      expect(sealCreated.status).toBe("CREATED");
      const sealReplay = await callBlindTruthWriter(client, fx, "RESEARCH_BLIND_TRUTH_VAULT_SEAL_CREATE_V1", "persist_research_blind_truth_vault_seal_v1", sealHash, sealCanonical, false);
      expect(sealReplay.status).toBe("REUSED_IDENTICAL");
      await expectWriterStatus(client, fx, "RESEARCH_BLIND_TRUTH_VAULT_SEAL_CREATE_V1", "persist_research_blind_truth_vault_seal_v1", hashBlindTruthVaultSealV1({ ...sealPayload, commitmentHash: h("8") }).hashHex, canonicalBlindTruthVaultSealV1({ ...sealPayload, commitmentHash: h("8") }), "DIVERGENT_EXISTING_IDENTITY", false);
      await expectPgRejection(client, () => callBlindTruthWriter(client, fx, "RESEARCH_BLIND_TRUTH_VAULT_SEAL_CREATE_V1", "persist_research_blind_truth_vault_seal_v1", hashBlindTruthVaultSealV1({ ...sealPayload, holdoutScopeDigest: h("7") }).hashHex, canonicalBlindTruthVaultSealV1({ ...sealPayload, holdoutScopeDigest: h("7") }), false), /DIVERGENT_EXISTING_IDENTITY/);

      const evaluationPayload = makeEvaluation(fx.registrationPayload, sealPayload);
      const evaluationCanonical = canonicalBlindTruthEvaluationV1(evaluationPayload);
      const evaluationHash = hashBlindTruthEvaluationV1(evaluationPayload).hashHex;
      await expectSqlHashParity(client, "SYNTRAKE:BLIND_TRUTH_EVALUATION:V1", evaluationCanonical, evaluationHash);
      const evaluationCreated = await callBlindTruthWriter(client, fx, "RESEARCH_BLIND_TRUTH_EVALUATION_CREATE_V1", "persist_research_blind_truth_evaluation_v1", evaluationHash, evaluationCanonical, false);
      expect(evaluationCreated.status).toBe("CREATED");
      await expectWriterStatus(client, fx, "RESEARCH_BLIND_TRUTH_EVALUATION_CREATE_V1", "persist_research_blind_truth_evaluation_v1", evaluationHash, evaluationCanonical, "REUSED_IDENTICAL", false);
      const malformedEvaluationCanonical = canonicalBlindTruthEvaluationV1(evaluationPayload) as unknown as Record<string, unknown>;
      const malformedEvaluationPayload = { ...malformedEvaluationCanonical, evaluatorProfile: { ...(malformedEvaluationCanonical.evaluatorProfile as Record<string, unknown>), engineVersion: "ENGINE_OLD" } };
      const malformedEvaluationHash = await sqlDomainHash(client, "SYNTRAKE:BLIND_TRUTH_EVALUATION:V1", malformedEvaluationPayload);
      await expectPgRejection(client, () => callBlindTruthWriter(client, fx, "RESEARCH_BLIND_TRUTH_EVALUATION_CREATE_V1", "persist_research_blind_truth_evaluation_v1", malformedEvaluationHash, malformedEvaluationPayload, false), /INCOMPATIBLE_ENGINE_VERSION/);

      const startedPayload = makeRevealStarted(fx.registrationPayload, sealPayload, evaluationPayload);
      const startedCanonical = canonicalBlindTruthRevealResultEventV1(startedPayload);
      const startedHash = hashBlindTruthRevealResultEventV1(startedPayload).hashHex;
      await expectSqlHashParity(client, "SYNTRAKE:BLIND_TRUTH_REVEAL_RESULT_EVENT:V1", startedCanonical, startedHash);
      const startedCreated = await callBlindTruthWriter(client, fx, "RESEARCH_BLIND_TRUTH_REVEAL_STARTED_CREATE_V1", "persist_research_blind_truth_reveal_started_v1", startedHash, startedCanonical, false);
      expect(startedCreated.status).toBe("CREATED");
      await expectWriterStatus(client, fx, "RESEARCH_BLIND_TRUTH_REVEAL_STARTED_CREATE_V1", "persist_research_blind_truth_reveal_started_v1", startedHash, startedCanonical, "REUSED_IDENTICAL", false);
      const divergentStartedPayload = { ...(startedCanonical as Record<string, unknown>), reason: "VAULT_UNAVAILABLE" };
      const divergentStartedHash = await sqlDomainHash(client, "SYNTRAKE:BLIND_TRUTH_REVEAL_RESULT_EVENT:V1", divergentStartedPayload);
      await expectWriterStatus(client, fx, "RESEARCH_BLIND_TRUTH_REVEAL_STARTED_CREATE_V1", "persist_research_blind_truth_reveal_started_v1", divergentStartedHash, divergentStartedPayload, "DIVERGENT_EXISTING_IDENTITY", false);

      // RL-9B has no vault consumption or verified evaluator evidence.
      // A matching SHA-256 is not evidence that a scientific result is true.
      const unverifiedCompleted = {
        ...(startedCanonical as Record<string, unknown>),
        eventState: "REVEAL_COMPLETED",
        predecessorEvent: hashBlindTruthRevealResultEventV1(startedPayload),
        result: true,
      };
      const unverifiedCompletedHash = await sqlDomainHash(client, "SYNTRAKE:BLIND_TRUTH_REVEAL_RESULT_EVENT:V1", unverifiedCompleted);
      await expectPgRejection(
        client,
        () => callBlindTruthWriter(client, fx, "RESEARCH_BLIND_TRUTH_FINAL_EVENT_CREATE_V1", "persist_research_blind_truth_final_event_v1", unverifiedCompletedHash, unverifiedCompleted, false),
        /REVEAL_COMPLETED_EVIDENCE_UNAVAILABLE/,
      );

      const forgedScientificResult = {
        registration: hashBlindTruthRegistrationV1(fx.registrationPayload),
        vaultSeal: hashBlindTruthVaultSealV1(sealPayload),
        evaluation: hashBlindTruthEvaluationV1(evaluationPayload),
        revealedDatasetSnapshot: hashRef("SYNTRAKE:DATASET_SNAPSHOT:V1", "unverified-dataset"),
        revealedDatasetSeries: [hashRef("SYNTRAKE:DATASET_SERIES:V1", "unverified-series")],
        observedMetricResults: [],
        criterionOutcomes: [],
        overallOutcome: "PASS",
      };
      const unverifiedObject = { ...unverifiedCompleted, result: forgedScientificResult };
      const unverifiedObjectHash = await sqlDomainHash(client, "SYNTRAKE:BLIND_TRUTH_REVEAL_RESULT_EVENT:V1", unverifiedObject);
      await expectPgRejection(
        client,
        () => callBlindTruthWriter(client, fx, "RESEARCH_BLIND_TRUTH_FINAL_EVENT_CREATE_V1", "persist_research_blind_truth_final_event_v1", unverifiedObjectHash, unverifiedObject, false),
        /REVEAL_COMPLETED_EVIDENCE_UNAVAILABLE/,
      );

      // Exercise the actual table CHECK even as the PG17 administrative role,
      // so a future direct write cannot bypass the fail-closed writer guard.
      await client.query("reset role");
      await expectPgRejection(client, () => client.query(
        `insert into investing.research_blind_truth_reveal_result_events_scientific_identities
         (operation, capability, operation_scope, source_context, tenant_id, principal_id, tenant_membership_id, research_investigation_id,
          research_experiment_id, research_blind_truth_protocol_identity_id, protocol_hash_hex, registration_identity_id, registration_hash_hex,
          vault_seal_identity_id, vault_seal_hash_hex, evaluation_identity_id, evaluation_hash_hex, predecessor_event_identity_id,
          predecessor_event_hash_hex, event_state, reason, event_hash_algorithm, event_hash_domain, event_hash_version, event_hash_hex, canonical_payload)
         select 'RESEARCH_BLIND_TRUTH_FINAL_EVENT_CREATE_V1', s.capability, s.operation_scope, s.source_context,
                s.tenant_id, s.principal_id, s.tenant_membership_id, s.research_investigation_id, s.research_experiment_id,
                s.research_blind_truth_protocol_identity_id, s.protocol_hash_hex, s.registration_identity_id, s.registration_hash_hex,
                s.vault_seal_identity_id, s.vault_seal_hash_hex, s.evaluation_identity_id, s.evaluation_hash_hex,
                s.research_blind_truth_reveal_result_event_identity_id, s.event_hash_hex, 'REVEAL_COMPLETED', null,
                'SHA-256', 'SYNTRAKE:BLIND_TRUTH_REVEAL_RESULT_EVENT:V1', 'SYNTRAKE_SHA256_V1', $2::text, $3::jsonb
         from investing.research_blind_truth_reveal_result_events_scientific_identities s
         where s.event_hash_hex=$1`,
        [startedHash, unverifiedObjectHash, JSON.stringify(unverifiedObject)],
      ), /research_blind_truth_events_payload_check/);

      await insertRl8Successor(client, fx);
      await expectPgRejection(client, () => callBlindTruthWriter(client, fx, "RESEARCH_BLIND_TRUTH_EVALUATION_CREATE_V1", "persist_research_blind_truth_evaluation_v1", evaluationHash, evaluationCanonical, false), /STALE_PROMOTION_TRANSITION/);
      await expectPgRejection(client, () => callBlindTruthWriter(client, fx, "RESEARCH_BLIND_TRUTH_REVEAL_STARTED_CREATE_V1", "persist_research_blind_truth_reveal_started_v1", startedHash, startedCanonical, false), /STALE_PROMOTION_TRANSITION|DIVERGENT_EXISTING_IDENTITY/);

      const finalPayload: BlindTruthRevealResultEventV1 = { ...startedPayload, predecessorEvent: hashBlindTruthRevealResultEventV1(startedPayload), eventState: "REVEAL_FAILED_CLOSED", reason: "VAULT_UNAVAILABLE" };
      const finalCanonical = canonicalBlindTruthRevealResultEventV1(finalPayload, startedPayload);
      const finalHash = hashBlindTruthRevealResultEventV1(finalPayload, startedPayload).hashHex;
      const finalCreated = await callBlindTruthWriter(client, fx, "RESEARCH_BLIND_TRUTH_FINAL_EVENT_CREATE_V1", "persist_research_blind_truth_final_event_v1", finalHash, finalCanonical, false);
      expect(finalCreated.status).toBe("CREATED");
      await expectWriterStatus(client, fx, "RESEARCH_BLIND_TRUTH_FINAL_EVENT_CREATE_V1", "persist_research_blind_truth_final_event_v1", hashBlindTruthRevealResultEventV1({ ...finalPayload, reason: "ACCESS_AUDIT_UNAVAILABLE" }, startedPayload).hashHex, canonicalBlindTruthRevealResultEventV1({ ...finalPayload, reason: "ACCESS_AUDIT_UNAVAILABLE" }, startedPayload), "DIVERGENT_EXISTING_IDENTITY", false);
      const finalCount = await client.query(`select count(*)::int as count from investing.research_blind_truth_reveal_result_events_scientific_identities where predecessor_event_hash_hex=$1`, [startedHash]);
      expect(finalCount.rows[0].count).toBe(1);
      await client.query("rollback");
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }, 120_000);

  it("denies direct mutations on all RL-9 public metadata relations and proves append-only triggers under elevated execution", async () => {
    const client = await pool!.connect();
    try {
      await client.query("begin");
      const fx = await seedPersistedRl9Chain(client, "mutation-denials");
      for (const role of ["anon", "authenticated", "service_role", "investing_app"]) {
        await client.query(`set local role ${role}`);
        for (const table of rl9Tables) {
          await expectPgRejection(client, () => client.query(`insert into investing.${table} default values`), /permission denied|violates/);
          await expectPgRejection(client, () => client.query(`update investing.${table} set canonical_payload = canonical_payload`), /permission denied/);
          await expectPgRejection(client, () => client.query(`delete from investing.${table}`), /permission denied/);
        }
        await client.query("reset role");
      }
      await client.query("reset role");
      for (const [table, idColumn, idValue] of [
        ["research_blind_truth_protocols_scientific_identities", "research_blind_truth_protocol_identity_id", fx.protocolIdentityId],
        ["research_blind_truth_registrations_scientific_identities", "research_blind_truth_registration_identity_id", fx.registrationIdentityId],
        ["research_blind_truth_vault_seals_scientific_identities", "research_blind_truth_vault_seal_identity_id", fx.sealIdentityId],
        ["research_blind_truth_evaluations_scientific_identities", "research_blind_truth_evaluation_identity_id", fx.evaluationIdentityId],
        ["research_blind_truth_reveal_result_events_scientific_identities", "research_blind_truth_reveal_result_event_identity_id", fx.startedIdentityId],
      ] as const) {
        await expectPgRejection(client, () => client.query(`update investing.${table} set canonical_payload = canonical_payload where ${idColumn}=$1`, [idValue]), /append-only/);
        await expectPgRejection(client, () => client.query(`delete from investing.${table} where ${idColumn}=$1`, [idValue]), /append-only/);
      }
      await client.query("rollback");
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }, 120_000);

  it("executes real committed concurrency for registration, seal, evaluation, reveal root and final successor one-winner paths", async () => {
    const client = await pool!.connect();
    try {
      await client.query("begin");
      const registrationFx = await seedRl9BehaviorFixture(client, "concurrent-registration");
      await client.query("commit");
      await client.query("begin");
      await callBlindTruthWriter(client, registrationFx, "RESEARCH_BLIND_TRUTH_PROTOCOL_CREATE_V1", "persist_research_blind_truth_protocol_v1", protocolHash, protocolPayload, true);
      await client.query("commit");

      const [regA, regB] = await runConcurrentWriters(registrationFx, "RESEARCH_BLIND_TRUTH_REGISTRATION_CREATE_V1", "persist_research_blind_truth_registration_v1", registrationFx.registrationHash, registrationFx.registrationPayload, true);
      expect([regA.status, regB.status].sort()).toEqual(["CREATED", "REUSED_IDENTICAL"]);
      const divergentFx = await createCommittedRegistrationFixture("concurrent-divergent-registration");
      const divergentPayload = { ...divergentFx.registrationPayload, holdoutScope: { ...divergentFx.registrationPayload.holdoutScope, providerDatasetVersion: "DATASET_VERSION_20261010" } } as BlindTruthRegistrationV1;
      const divergentHash = hashRegistrationPayload(divergentPayload);
      const divergentResults = await Promise.allSettled([
        runWriterInCommittedTransaction(divergentFx, "RESEARCH_BLIND_TRUTH_REGISTRATION_CREATE_V1", "persist_research_blind_truth_registration_v1", divergentFx.registrationHash, divergentFx.registrationPayload, true),
        runWriterInCommittedTransaction(divergentFx, "RESEARCH_BLIND_TRUTH_REGISTRATION_CREATE_V1", "persist_research_blind_truth_registration_v1", divergentHash, canonicalBlindTruthRegistrationV1(divergentPayload), true),
      ]);
      expect(divergentResults.filter((result) => result.status === "fulfilled" && (result.value as Record<string, string>).status === "CREATED")).toHaveLength(1);

      const chain = await createCommittedRl9Chain("concurrent-chain");
      const seal = makeVaultSeal(chain.registrationPayload);
      const sealCanonical = canonicalBlindTruthVaultSealV1(seal);
      const sealHash = hashBlindTruthVaultSealV1(seal).hashHex;
      const [sealA, sealB] = await runConcurrentWriters(chain, "RESEARCH_BLIND_TRUTH_VAULT_SEAL_CREATE_V1", "persist_research_blind_truth_vault_seal_v1", sealHash, sealCanonical, false);
      expect([sealA.status, sealB.status].sort()).toEqual(["CREATED", "REUSED_IDENTICAL"]);
      const evaluation = makeEvaluation(chain.registrationPayload, seal);
      const evaluationCanonical = canonicalBlindTruthEvaluationV1(evaluation);
      const evaluationHash = hashBlindTruthEvaluationV1(evaluation).hashHex;
      const [evalA, evalB] = await runConcurrentWriters(chain, "RESEARCH_BLIND_TRUTH_EVALUATION_CREATE_V1", "persist_research_blind_truth_evaluation_v1", evaluationHash, evaluationCanonical, false);
      expect([evalA.status, evalB.status].sort()).toEqual(["CREATED", "REUSED_IDENTICAL"]);
      const started = makeRevealStarted(chain.registrationPayload, seal, evaluation);
      const startedCanonical = canonicalBlindTruthRevealResultEventV1(started);
      const startedHash = hashBlindTruthRevealResultEventV1(started).hashHex;
      const [startA, startB] = await runConcurrentWriters(chain, "RESEARCH_BLIND_TRUTH_REVEAL_STARTED_CREATE_V1", "persist_research_blind_truth_reveal_started_v1", startedHash, startedCanonical, false);
      expect([startA.status, startB.status].sort()).toEqual(["CREATED", "REUSED_IDENTICAL"]);
      const failed: BlindTruthRevealResultEventV1 = { ...started, predecessorEvent: hashBlindTruthRevealResultEventV1(started), eventState: "REVEAL_FAILED_CLOSED", reason: "VAULT_UNAVAILABLE" };
      const competing: BlindTruthRevealResultEventV1 = { ...failed, reason: "ACCESS_AUDIT_UNAVAILABLE" };
      const finalResults = await Promise.allSettled([
        runWriterInCommittedTransaction(chain, "RESEARCH_BLIND_TRUTH_FINAL_EVENT_CREATE_V1", "persist_research_blind_truth_final_event_v1", hashBlindTruthRevealResultEventV1(failed, started).hashHex, canonicalBlindTruthRevealResultEventV1(failed, started), false),
        runWriterInCommittedTransaction(chain, "RESEARCH_BLIND_TRUTH_FINAL_EVENT_CREATE_V1", "persist_research_blind_truth_final_event_v1", hashBlindTruthRevealResultEventV1(competing, started).hashHex, canonicalBlindTruthRevealResultEventV1(competing, started), false),
      ]);
      expect(finalResults.filter((result) => result.status === "fulfilled" && (result.value as Record<string, string>).status === "CREATED")).toHaveLength(1);
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }, 120_000);


  /**
   * Real disposable PG17 writer chain + privately stored fictional bytes.
   * Test harness verifies REVEAL_STARTED was committed before a synthetic
   * consume attempt. NOT a real vault authority or an operational reveal.
   */
  async function runIntegratedSyntheticReveal(failureAfterBurn:boolean):Promise<void>{
    if(process.platform==="win32")return; // POSIX ownership/O_EXCL only
    const suffix=failureAfterBurn?"integrated-pg17-crash":"integrated-pg17-failclosed";
    const fx=await createCommittedRl9Chain(suffix);
    const fictional=Buffer.from('{"fictionalOnly":true,"day":"2026-01-01","close":"123.45"}\\n',"utf8");
    const salt=Buffer.alloc(32,0x4A),key=Buffer.alloc(32,0x5B);
    const commitment=deriveBlindTruthHoldoutCommitmentV1({
      secretSalt:salt,exactCanonicalHoldoutPlaintextBytes:fictional,
    });
    const seal:BlindTruthVaultSealV1={
      ...makeVaultSeal(fx.registrationPayload),
      commitmentHash:canonicalSha256HexV1(commitment),
      declaredPlaintextByteLength:String(fictional.length),
    };
    const sealHash=hashBlindTruthVaultSealV1(seal).hashHex;
    expect((await runWriterInCommittedTransaction(fx,
      "RESEARCH_BLIND_TRUTH_VAULT_SEAL_CREATE_V1",
      "persist_research_blind_truth_vault_seal_v1",sealHash,
      canonicalBlindTruthVaultSealV1(seal),false)).status).toBe("CREATED");
    const evaluation=makeEvaluation(fx.registrationPayload,seal);
    const evaluationHash=hashBlindTruthEvaluationV1(evaluation).hashHex;
    expect((await runWriterInCommittedTransaction(fx,
      "RESEARCH_BLIND_TRUTH_EVALUATION_CREATE_V1",
      "persist_research_blind_truth_evaluation_v1",evaluationHash,
      canonicalBlindTruthEvaluationV1(evaluation),false)).status).toBe("CREATED");
    const started=makeRevealStarted(fx.registrationPayload,seal,evaluation);
    const startedHash=hashBlindTruthRevealResultEventV1(started).hashHex;
    expect((await runWriterInCommittedTransaction(fx,
      "RESEARCH_BLIND_TRUTH_REVEAL_STARTED_CREATE_V1",
      "persist_research_blind_truth_reveal_started_v1",startedHash,
      canonicalBlindTruthRevealResultEventV1(started),false)).status).toBe("CREATED");
    const persisted=await pool!.query<{
      tenant_id:string;registration_hash_hex:string;
      evaluation_hash_hex:string;event_hash_hex:string;event_state:string;
    }>(
      "select tenant_id::text,registration_hash_hex,evaluation_hash_hex,"+
      "event_hash_hex,event_state from investing."+
      "research_blind_truth_reveal_result_events_scientific_identities "+
      "where event_hash_hex=$1",[startedHash]);
    expect(persisted.rows).toEqual([{
      tenant_id:fx.tenantId,registration_hash_hex:fx.registrationHash,
      evaluation_hash_hex:evaluationHash,event_hash_hex:startedHash,
      event_state:"REVEAL_STARTED",
    }]);

    const root=fs.mkdtempSync(path.join(os.tmpdir(),"syntrake-rl9-pg17-integrated-"));
    fs.chmodSync(root,0o700);
    try{
      const config={environment:{
        SYNTRAKE_VAULT_WORKER_MODE:"ISOLATED_SECRET_VAULT_V1",
        SYNTRAKE_VAULT_SYNTHETIC_STORE_MODE:"ISOLATED_REHEARSAL_V1",
      },rootDirectory:root,storageMode:"ISOLATED_REHEARSAL_V1"};
      const binding={
        tenantId:fx.tenantId,registrationHashHex:fx.registrationHash,
        holdoutScopeDigestHex:blindTruthHoldoutScopeDigestV1(
          fx.registrationPayload.holdoutScope),
        commitmentHashHex:commitment,
      };
      const envelope=encryptBlindTruthVaultEnvelopeV1({
        vaultEncryptionKey:key,keyVersion:"SYNTHETIC_K1",binding,
        exactCanonicalPlaintextBytes:fictional,
      });
      const staged=createSyntheticPrivateCiphertextStoreV1(config)
        .stageSyntheticEnvelopeV1({classification:"SYNTHETIC_TEST_VECTOR",envelope});
      const request={classification:"SYNTHETIC_TEST_VECTOR",
        privateObjectLocator:staged.privateObjectLocator,
        evaluationHashHex:evaluationHash,
        revealStartedEventHashHex:startedHash};
      if(failureAfterBurn) {
        // Object disappears AFTER staging but BEFORE consumption. The worker
        // must burn both claims even though it cannot open ciphertext.
        fs.unlinkSync(path.join(root,"objects",staged.privateObjectLocator+".sealed"));
        expect(()=>createSyntheticVaultConsumeOnceRehearsalV1(config)
          .consumeSyntheticSealedEnvelopeOnceV1(request)).toThrow("VAULT_UNAVAILABLE");
      } else {
        const consumed=createSyntheticVaultConsumeOnceRehearsalV1(config)
          .consumeSyntheticSealedEnvelopeOnceV1(request);
        expect(consumed.status).toBe("SYNTHETIC_CONSUMED_ONCE");
        const opened=decryptBlindTruthVaultEnvelopeV1({
          vaultEncryptionKey:key,expectedKeyVersion:"SYNTHETIC_K1",
          expectedBinding:binding,envelope:consumed.envelope,
        });
        try {
          verifyBlindTruthHoldoutCommitmentV1({
            secretSalt:salt,exactCanonicalHoldoutPlaintextBytes:opened,
            publicCommitmentHash:commitment,
            declaredPlaintextByteLength:String(fictional.length),
          });
          expect(opened.equals(fictional)).toBe(true);
        } finally {opened.fill(0);}
        // This rehearsal has NO approved metric evaluator nor complete
        // pre-registration exposure audit: scientific PASS is forbidden.
        const finalEvent:BlindTruthRevealResultEventV1={
          ...started,predecessorEvent:hashBlindTruthRevealResultEventV1(started),
          eventState:"REVEAL_FAILED_CLOSED",reason:"ACCESS_AUDIT_UNAVAILABLE",
        };
        const finalHash=hashBlindTruthRevealResultEventV1(finalEvent,started).hashHex;
        expect((await runWriterInCommittedTransaction(fx,
          "RESEARCH_BLIND_TRUTH_FINAL_EVENT_CREATE_V1",
          "persist_research_blind_truth_final_event_v1",finalHash,
          canonicalBlindTruthRevealResultEventV1(finalEvent,started),false)
        ).status).toBe("CREATED");
        expect((await runWriterInCommittedTransaction(fx,
          "RESEARCH_BLIND_TRUTH_FINAL_EVENT_CREATE_V1",
          "persist_research_blind_truth_final_event_v1",finalHash,
          canonicalBlindTruthRevealResultEventV1(finalEvent,started),false)
        ).status).toBe("REUSED_IDENTICAL");
      }
      // A new test worker instance may never regain the burned envelope.
      expect(()=>createSyntheticVaultConsumeOnceRehearsalV1(config)
        .consumeSyntheticSealedEnvelopeOnceV1(request)).toThrow("VAULT_UNAVAILABLE");
      expect(fs.readdirSync(path.join(root,"synthetic-evaluation-claims")))
        .toEqual([evaluationHash+".claimed"]);
      const events=await pool!.query<{event_state:string}>(
        "select event_state from investing."+
        "research_blind_truth_reveal_result_events_scientific_identities "+
        "where tenant_id=$1 and evaluation_hash_hex=$2 order by event_state",
        [fx.tenantId,evaluationHash]);
      expect(events.rows).toEqual(failureAfterBurn
        ?[{event_state:"REVEAL_STARTED"}]
        :[{event_state:"REVEAL_FAILED_CLOSED"},{event_state:"REVEAL_STARTED"}]);
      // This is raw event truth, not yet an accepted runtime projector.
      expect(events.rows.some(e=>e.event_state==="REVEAL_COMPLETED")).toBe(false);
    }finally{fictional.fill(0);fs.rmSync(root,{recursive:true,force:true});}
  }

  it("durably connects PG17 REVEAL_STARTED → synthetic one-shot → committed REVEAL_FAILED_CLOSED",async()=>{
    await runIntegratedSyntheticReveal(false);
  },120_000);

  it("keeps committed PG17 REVEAL_STARTED without a fictional terminal result after post-burn crash",async()=>{
    await runIntegratedSyntheticReveal(true);
  },120_000);
});


/**
 * RL-9C3B2A rehearsal intentionally reuses the exact accepted RL-9B2/RL-8
 * scientific fixtures instead of fabricating an invalid registration row.
 * The FIRST suite above remains unchanged and runs against its accepted B2
 * boundary; this suite runs afterwards in the disposable PG17 container.
 * NEVER point this test at production: it truncates synthetic fixture rows.
 */
maybeDescribe("RL-9C3B2A real positive registration/fence transaction", () => {
  const lockMigration = path.join(repoRoot, "supabase", "migrations",
    "20261012173000_investing_i5_rl9c3b1_registration_admission_lock.sql");
  const fenceMigration = path.join(repoRoot, "supabase", "migrations",
    "20261012180000_investing_i5_rl9c3b2a_embargo_fence_foundation.sql");

  beforeAll(async () => {
    pool = new Pool({ connectionString, max: 8 });
    const client = await pool.connect();
    try {
      const existing = await client.query<{ n: number }>(
        "select count(*)::int as n from investing.research_blind_truth_registrations_scientific_identities"
      );
      expect(existing.rows[0]!.n).toBeGreaterThan(0);
      // Install the prior C3B1 lock before evaluating C3B2A preconditions.
      await client.query(fs.readFileSync(lockMigration, "utf8"));
      // Existing B2 public registrations have no historical embargo/access
      // audit: C3B2A MUST refuse a silent after-the-fact backfill.
      let rejected: unknown = null;
      try {
        await client.query(fs.readFileSync(fenceMigration, "utf8"));
      } catch (error) {
        rejected = error;
      }
      expect(String(rejected)).toMatch(/RL9C3B2A_EXISTING_REGISTRATION_UNAUDITED/);
      await client.query("rollback");
      // Only isolated B2 synthetic fixture metadata may be cleared;
      // C3B2A must be installed against a clean registration frontier.
      await client.query(
        "truncate investing.research_blind_truth_reveal_result_events_scientific_identities, " +
        "investing.research_blind_truth_evaluations_scientific_identities, " +
        "investing.research_blind_truth_vault_seals_scientific_identities, " +
        "investing.research_blind_truth_registrations_scientific_identities"
      );
      await client.query(fs.readFileSync(fenceMigration, "utf8"));
      const counts = await client.query<{ registrations: number; fences: number }>(
        "select (select count(*)::int from investing.research_blind_truth_registrations_scientific_identities) as registrations, " +
        "(select count(*)::int from investing.research_blind_truth_embargo_fences_v1) as fences"
      );
      expect(counts.rows[0]).toEqual({ registrations: 0, fences: 0 });
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }, 180_000);

  afterAll(async () => {
    await pool?.end();
    pool = null;
  });

  it("registers one valid promoted candidate and inserts its exact canonical embargo fence in the same transaction", async () => {
    const client = await pool!.connect();
    try {
      await client.query("begin");
      const fx = await seedRl9BehaviorFixture(client, "c3b2a-positive-atomic");
      await callBlindTruthWriter(client, fx, "RESEARCH_BLIND_TRUTH_PROTOCOL_CREATE_V1",
        "persist_research_blind_truth_protocol_v1", protocolHash, protocolPayload, true);
      const actual = await callBlindTruthWriter(client, fx, "RESEARCH_BLIND_TRUTH_REGISTRATION_CREATE_V1",
        "persist_research_blind_truth_registration_v1", fx.registrationHash, fx.registrationPayload, false);
      expect(actual.status).toBe("CREATED");
      const row = await client.query<{
        tenant_id: string; registration_hash_hex: string;
        scope_hash_hex: string; canonical_holdout_scope: unknown;
      }>(
        "select tenant_id::text, registration_hash_hex, scope_hash_hex, canonical_holdout_scope " +
        "from investing.research_blind_truth_embargo_fences_v1 where registration_identity_id=$1::uuid",
        [actual.researchBlindTruthRegistrationIdentityId]
      );
      expect(row.rows).toHaveLength(1);
      expect(row.rows[0]!.tenant_id).toBe(fx.tenantId);
      expect(row.rows[0]!.registration_hash_hex).toBe(fx.registrationHash);
      expect(row.rows[0]!.scope_hash_hex).toBe(blindTruthHoldoutScopeDigestV1(fx.registrationPayload.holdoutScope));
      expect(row.rows[0]!.canonical_holdout_scope).toEqual(fx.registrationPayload.holdoutScope);
      await client.query("rollback");

      const absent = await pool!.query<{ registrations: number; fences: number }>(
        "select (select count(*)::int from investing.research_blind_truth_registrations_scientific_identities where registration_hash_hex=$1) as registrations, " +
        "(select count(*)::int from investing.research_blind_truth_embargo_fences_v1 where registration_hash_hex=$1) as fences",
        [fx.registrationHash]
      );
      expect(absent.rows[0]).toEqual({ registrations: 0, fences: 0 });
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }, 120_000);

  it("rejects an unavailable fence writer and rolls back the registration instead of committing a naked row", async () => {
    const fx = await createCommittedRegistrationFixture("c3b2a-fenced-insert-denied");
    const client = await pool!.connect();
    try {
      await client.query("begin");
      await client.query("set local role investing_owner");
      await client.query("revoke insert on investing.research_blind_truth_embargo_fences_v1 from investing_rl9_writer");
      await client.query("reset role");
      await expect(
        callBlindTruthWriter(client, fx, "RESEARCH_BLIND_TRUTH_REGISTRATION_CREATE_V1",
          "persist_research_blind_truth_registration_v1", fx.registrationHash, fx.registrationPayload, false)
      ).rejects.toMatchObject({ code: "42501" });
      await client.query("rollback"); // restores the grant and aborts registration
      const rows = await pool!.query<{ registrations: number; fences: number }>(
        "select (select count(*)::int from investing.research_blind_truth_registrations_scientific_identities where registration_hash_hex=$1) as registrations, " +
        "(select count(*)::int from investing.research_blind_truth_embargo_fences_v1 where registration_hash_hex=$1) as fences",
        [fx.registrationHash]
      );
      expect(rows.rows[0]).toEqual({ registrations: 0, fences: 0 });
    } finally {
      await client.query("rollback").catch(() => undefined);
      client.release();
    }
  }, 120_000);

  it("serializes two actual committed registration attempts into one registration AND one embargo fence", async () => {
    const fx = await createCommittedRegistrationFixture("c3b2a-concurrent-writer");
    const [a, b] = await runConcurrentWriters(fx, "RESEARCH_BLIND_TRUTH_REGISTRATION_CREATE_V1",
      "persist_research_blind_truth_registration_v1", fx.registrationHash, fx.registrationPayload, false);
    expect([a.status, b.status].sort()).toEqual(["CREATED", "REUSED_IDENTICAL"]);
    const result = await pool!.query<{ registrations: number; fences: number }>(
      "select (select count(*)::int from investing.research_blind_truth_registrations_scientific_identities where tenant_id=$1 and registration_hash_hex=$2) as registrations, " +
      "(select count(*)::int from investing.research_blind_truth_embargo_fences_v1 where tenant_id=$1 and registration_hash_hex=$2) as fences",
      [fx.tenantId, fx.registrationHash]
    );
    expect(result.rows[0]).toEqual({ registrations: 1, fences: 1 });
  }, 120_000);

  it("writer RLS sees only its own tenant fence after two independently committed registrations", async () => {
    const a = await createCommittedRegistrationFixture("c3b2a-tenant-a");
    const b = await createCommittedRegistrationFixture("c3b2a-tenant-b");
    await runWriterInCommittedTransaction(a, "RESEARCH_BLIND_TRUTH_REGISTRATION_CREATE_V1",
      "persist_research_blind_truth_registration_v1", a.registrationHash, a.registrationPayload, false);
    await runWriterInCommittedTransaction(b, "RESEARCH_BLIND_TRUTH_REGISTRATION_CREATE_V1",
      "persist_research_blind_truth_registration_v1", b.registrationHash, b.registrationPayload, false);
    const client=await pool!.connect();
    try {
      for(const fx of [a,b]){
        await client.query("begin");
        await client.query("set local role investing_rl9_writer");
        await client.query(
          "select set_config('syntrake.investing.tenant_id',$1,true), " +
          "set_config('syntrake.investing.principal_id',$2,true), " +
          "set_config('syntrake.investing.tenant_membership_id',$3,true), " +
          "set_config('syntrake.investing.research_investigation_id',$4,true)",
          [fx.tenantId,fx.principalId,fx.membershipId,fx.investigationId]
        );
        const visible=await client.query<{ tenant_id: string }>(
          "select tenant_id::text from investing.research_blind_truth_embargo_fences_v1"
        );
        expect(visible.rows).toEqual([{tenant_id:fx.tenantId}]);
        await client.query("rollback");
      }
    } finally {
      await client.query("rollback").catch(()=>undefined);
      client.release();
    }
  }, 120_000);
});


/**
 * RL-9C3B2B4: inspect a REAL committed scientific registration + matching
 * persisted fence, from the existing accepted V1 scientific fixtures above.
 * The denied preflight MUST return the SAME result for matching/nonmatching.
 * This is NOT a general read authorization or complete prior-access proof.
 */
maybeDescribe("RL-9C3B2B4 real persisted fence negative/positive classification", () => {
  const denialMigration = path.join(repoRoot,"supabase","migrations",
    "20261012183000_investing_i5_rl9c3b2b2_denied_read_journal.sql");
  const preflightMigration = path.join(repoRoot,"supabase","migrations",
    "20261012190000_investing_i5_rl9c3b2b4_persisted_fence_deny_preflight.sql");
  type FixtureFence = {
    tenant_id: string; principal_id: string; tenant_membership_id: string;
    research_investigation_id: string;
    canonical_holdout_scope: { markets: string[]; fields: string[];
      coverageStart: string; coverageEnd: string };
  };
  let fixtureFence: FixtureFence;

  beforeAll(async () => {
    pool = new Pool({ connectionString, max: 4 });
    const existing=await pool.query<FixtureFence>(
      "select tenant_id::text, principal_id::text, tenant_membership_id::text, "+
      "research_investigation_id::text,canonical_holdout_scope "+
      "from investing.research_blind_truth_embargo_fences_v1 order by created_at limit 1");
    expect(existing.rows).toHaveLength(1);
    fixtureFence=existing.rows[0]!;
    expect(fixtureFence.canonical_holdout_scope.markets.length).toBeGreaterThan(0);
    expect(fixtureFence.canonical_holdout_scope.fields.length).toBeGreaterThan(0);
    await pool.query(fs.readFileSync(denialMigration,"utf8"));
    await pool.query(fs.readFileSync(preflightMigration,"utf8"));
  }, 180_000);

  afterAll(async () => { await pool?.end(); pool=null; });

  async function probe(market: string) {
    const client=await pool!.connect();
    try {
      await client.query("begin");
      await client.query("set local role investing_app");
      const ctx: Record<string,string> = {
        tenant_id: fixtureFence.tenant_id,
        principal_id: fixtureFence.principal_id,
        tenant_membership_id: fixtureFence.tenant_membership_id,
        research_investigation_id: fixtureFence.research_investigation_id,
        actor_kind: "USER_PRINCIPAL", operation: "RESEARCH_EXECUTION_RUN_V1",
        capability: "RESEARCH_EXECUTE", operation_scope: "TENANT_SCOPE",
        source_context: "PURE_RESEARCH",
      };
      for(const [key,value] of Object.entries(ctx))
        await client.query("select set_config($1,$2,true)",["syntrake.investing."+key,value]);
      const rows=await client.query<{decision:string}>(
        "select investing.rl9c3b2b4_record_persisted_fence_preflight_v1"+
        "($1,$2::text[],$3::text[],$4::date,$5::date) as decision",[
          "D".repeat(64),[market],
          [fixtureFence.canonical_holdout_scope.fields[0]!],
          fixtureFence.canonical_holdout_scope.coverageStart,
          fixtureFence.canonical_holdout_scope.coverageEnd,
        ]);
      await client.query("commit");
      return rows.rows[0]!.decision;
    } finally {
      await client.query("rollback").catch(()=>undefined);client.release();
    }
  }

  it("labels a real same-tenant matching fence internally while returning only UNPROVEN",async()=>{
    const response=await probe(fixtureFence.canonical_holdout_scope.markets[0]!);
    expect(response).toBe("UNPROVEN_NOT_AUTHORIZED");
    const row=await pool!.query(
      "select preflight_observation from investing.research_blind_truth_denied_read_attempts_v1 "+
      "where series_hash_hex=$1 order by recorded_at desc limit 1",["D".repeat(64)]);
    expect(row.rows).toEqual([{preflight_observation:"CLAIMED_SCOPE_INTERSECTS_VISIBLE_FENCE"}]);
  });

  it("never authorizes a different market despite no visible intersection",async()=>{
    const response=await probe("B4_DISJOINT_MARKET_FIXTURE");
    expect(response).toBe("UNPROVEN_NOT_AUTHORIZED");
    const row=await pool!.query(
      "select preflight_observation from investing.research_blind_truth_denied_read_attempts_v1 "+
      "where series_hash_hex=$1 order by recorded_at desc limit 1",["D".repeat(64)]);
    expect(row.rows).toEqual([{
      preflight_observation:"NO_OVERLAP_IN_VISIBLE_FENCES_NOT_AUTHORIZATION",
    }]);
  });
});


/**
 * RL-9C3B2B5: real PG17 concurrent registration vs denied reader.
 * The registration inserts a VALID science-backed row+fence in a transaction,
 * then holds the actual advisory lock while the denied preflight tries to run.
 *
 * An uncommitted fence cannot be assumed visible. The preflight must wait,
 * then classify only the COMMITTED fence state. Denial is unconditional.
 */
maybeDescribe("RL-9C3B2B5 real registration-versus-denial race", () => {
  const deniedFn="investing.rl9c3b2b4_record_persisted_fence_preflight_v1";
  const journal="investing.research_blind_truth_denied_read_attempts_v1";

  beforeAll(async () => {
    pool = new Pool({ connectionString, max: 6 });
    const proof=await pool.query(
      "select to_regprocedure('"+deniedFn+"(text,text[],text[],date,date)') is not null as installed");
    expect(proof.rows).toEqual([{installed:true}]);
  });
  afterAll(async()=>{await pool?.end();pool=null;});

  async function setDeniedReaderContext(client:PoolClient, fx:Rl9BehaviorFixture) {
    await client.query("set local role investing_app");
    const scope:Record<string,string>={
      tenant_id:fx.tenantId,principal_id:fx.principalId,
      tenant_membership_id:fx.membershipId,
      research_investigation_id:fx.investigationId,
      actor_kind:"USER_PRINCIPAL",
      operation:"RESEARCH_EXECUTION_RUN_V1",
      capability:"RESEARCH_EXECUTE",
      operation_scope:"TENANT_SCOPE",
      source_context:"PURE_RESEARCH",
    };
    for(const [key,value] of Object.entries(scope))
      await client.query("select set_config($1,$2,true)",["syntrake.investing."+key,value]);
  }

  async function race(commitRegistration:boolean) {
    const suffix=commitRegistration?"b5-registration-commits":"b5-registration-rolls-back";
    const fx=await createCommittedRegistrationFixture(suffix);
    const registration=await pool!.connect();
    const reader=await pool!.connect();
    const seriesHash=commitRegistration?"B".repeat(64):"C".repeat(64);
    const holdout=fx.registrationPayload.holdoutScope;
    let pending:Promise<unknown>|null=null;
    let released=false;
    try {
      await registration.query("begin");
      const created=await callBlindTruthWriter(
        registration,fx,"RESEARCH_BLIND_TRUTH_REGISTRATION_CREATE_V1",
        "persist_research_blind_truth_registration_v1",
        fx.registrationHash,fx.registrationPayload,false,
      );
      expect(created.status).toBe("CREATED");
      const uncommitted=await pool!.query(
        "select count(*)::int as n from investing.research_blind_truth_embargo_fences_v1 "+
        "where tenant_id=$1 and registration_hash_hex=$2",[fx.tenantId,fx.registrationHash]);
      expect(uncommitted.rows).toEqual([{n:0}]);

      await reader.query("begin");
      await setDeniedReaderContext(reader,fx);
      await reader.query("set local statement_timeout = '10000ms'");
      let completed=false;
      const work=reader.query<{decision:string}>(
        "select "+deniedFn+"($1,$2::text[],$3::text[],$4::date,$5::date) as decision",
        [seriesHash,[holdout.markets[0]!],[holdout.fields[0]!],
          holdout.coverageStart,holdout.coverageEnd],
      ).then(result=>{completed=true;return result;});
      pending=work;
      await new Promise(resolve=>setTimeout(resolve,150));
      expect(completed).toBe(false); // server waits for genuine registration lock

      await registration.query(commitRegistration?"commit":"rollback");
      released=true;
      const verdict=await work;
      expect(verdict.rows).toEqual([{decision:"UNPROVEN_NOT_AUTHORIZED"}]);
      await reader.query("commit");
      const audit=await pool!.query(
        "select preflight_observation, decision from "+journal+
        " where series_hash_hex=$1",[seriesHash]);
      expect(audit.rows).toEqual([{
        decision:"UNPROVEN_NOT_AUTHORIZED",
        preflight_observation:commitRegistration
          ?"CLAIMED_SCOPE_INTERSECTS_VISIBLE_FENCE"
          :"NO_OVERLAP_IN_VISIBLE_FENCES_NOT_AUTHORIZATION",
      }]);
    }finally{
      if(!released)await registration.query("rollback").catch(()=>undefined);
      if(pending)await pending.catch(()=>undefined);
      await reader.query("rollback").catch(()=>undefined);
      registration.release();reader.release();
    }
  }

  it("waits for a valid registration commit and then observes the newly durable fence",async()=>{
    await race(true);
  },120_000);

  it("waits for registration rollback and still refuses to authorize the read",async()=>{
    await race(false);
  },120_000);
});

/**
 * RL-9C2B2F. Independent disposable SQL burn rehearsal AFTER the B2/C3
 * migration suites. Uses the same genuine RL-8/9 fixture builders; no
 * PostgreSQL production write or real Vault credential is exercised.
 */
maybeDescribe("RL-9C2B2F committed event-bound consume burn (never ALLOW)",()=>{
  const mappingMigration=path.join(repoRoot,"supabase","migrations",
    "20261012200000_investing_i5_rl9c3b2b7a_mapping_candidate_evidence.sql");
  const burnMigration=path.join(repoRoot,"supabase","migrations",
    "20261012213000_investing_i5_rl9c2b2f_pg17_consume_burn_reservation.sql");
  const burnTable="investing.research_blind_truth_consume_reservations_v1";
  const burnFn="investing.rl9c2b2f_reserve_committed_reveal_burn_v1";
  type EventFixture={fx:Rl9BehaviorFixture; startedHash:string; evalHash:string; seal:BlindTruthVaultSealV1};

  beforeAll(async()=>{
    pool=new Pool({connectionString,max:8});
    await pool.query(fs.readFileSync(mappingMigration,"utf8"));
    await pool.query(fs.readFileSync(burnMigration,"utf8"));
  },180_000);
  afterAll(async()=>{await pool?.end();pool=null;});

  async function eventFixture(suffix:string,fictional?:Buffer):Promise<EventFixture>{
    const client=await pool!.connect();
    try{
      await client.query("begin");
      const fx=await seedRl9BehaviorFixture(client,"b2f-"+suffix);
      await callBlindTruthWriter(client,fx,
        "RESEARCH_BLIND_TRUTH_PROTOCOL_CREATE_V1",
        "persist_research_blind_truth_protocol_v1",protocolHash,protocolPayload,true);
      // Public registration admission remains LOCKED. The disposable
      // admin alone can seed this synthetic scientific fixture.
      await callBlindTruthWriter(client,fx,
        "RESEARCH_BLIND_TRUTH_REGISTRATION_CREATE_V1",
        "persist_research_blind_truth_registration_v1",fx.registrationHash,
        fx.registrationPayload,false);
      const seal:BlindTruthVaultSealV1=fictional?{
        ...makeVaultSeal(fx.registrationPayload),
        commitmentHash:canonicalSha256HexV1(
          deriveBlindTruthHoldoutCommitmentV1({
            secretSalt:Buffer.alloc(32,0x69),
            exactCanonicalHoldoutPlaintextBytes:fictional,
          })),
        declaredPlaintextByteLength:String(fictional.length),
      }:makeVaultSeal(fx.registrationPayload);
      await callBlindTruthWriter(client,fx,
        "RESEARCH_BLIND_TRUTH_VAULT_SEAL_CREATE_V1",
        "persist_research_blind_truth_vault_seal_v1",
        hashBlindTruthVaultSealV1(seal).hashHex,canonicalBlindTruthVaultSealV1(seal),false);
      const evaluation=makeEvaluation(fx.registrationPayload,seal);
      const evalHash=hashBlindTruthEvaluationV1(evaluation).hashHex;
      await callBlindTruthWriter(client,fx,
        "RESEARCH_BLIND_TRUTH_EVALUATION_CREATE_V1",
        "persist_research_blind_truth_evaluation_v1",
        evalHash,canonicalBlindTruthEvaluationV1(evaluation),false);
      const started=makeRevealStarted(fx.registrationPayload,seal,evaluation);
      const startedHash=hashBlindTruthRevealResultEventV1(started).hashHex;
      await callBlindTruthWriter(client,fx,
        "RESEARCH_BLIND_TRUTH_REVEAL_STARTED_CREATE_V1",
        "persist_research_blind_truth_reveal_started_v1",
        startedHash,canonicalBlindTruthRevealResultEventV1(started),false);
      await client.query("commit");
      return {fx,startedHash,evalHash,seal};
    } catch(e){await client.query("rollback").catch(()=>undefined);throw e;}
    finally{client.release();}
  }

  async function reserve(f:EventFixture,options:{
    commit?:boolean;evalHash?:string;startedHash?:string;
  }={}):Promise<string>{
    const client=await pool!.connect();
    try {
      await client.query("begin");
      await setRl9Authority(client,f.fx,
        "RESEARCH_BLIND_TRUTH_REVEAL_STARTED_CREATE_V1",false);
      await client.query("set local role investing_rl9_writer");
      const r=await client.query<{decision:string}>(
        "select "+burnFn+"($1,$2) as decision",[
          options.evalHash??f.evalHash,
          options.startedHash??f.startedHash,
        ]);
      options.commit===false
        ? await client.query("rollback")
        : await client.query("commit");
      return r.rows[0]!.decision;
    } catch(e){await client.query("rollback").catch(()=>undefined);throw e;}
    finally{client.release();}
  }

  it("keeps the new writer private, NOLOGIN, FORCE-RLS, and registration locked",async()=>{
    const r=await pool!.query(
      "select has_function_privilege('investing_app','"+burnFn+"(text,text)','EXECUTE') as app,"+
      "has_function_privilege('service_role','"+burnFn+"(text,text)','EXECUTE') as service,"+
      "has_function_privilege('anon','"+burnFn+"(text,text)','EXECUTE') as anon,"+
      "has_function_privilege('authenticated','"+burnFn+"(text,text)','EXECUTE') as auth,"+
      "has_function_privilege('investing_app','investing.persist_research_blind_truth_registration_v1(text,jsonb)','EXECUTE') as admission,"+
      "has_table_privilege('investing_app','"+burnTable+"','SELECT') as rd");
    expect(r.rows).toEqual([{app:false,service:false,anon:false,
      auth:false,admission:false,rd:false}]);
    const acl=await pool!.query(
      "select relrowsecurity as rls,relforcerowsecurity as forced,"+
      "pg_get_userbyid(relowner) as owner from pg_class where oid='"+burnTable+"'::regclass");
    expect(acl.rows).toEqual([{rls:true,forced:true,owner:"investing_owner"}]);
  });

  it("requires an actual COMMITTED started event, burns exactly once and never returns ALLOW",async()=>{
    const f=await eventFixture("durable-success");
    const decision=await reserve(f);
    expect(decision).toBe("BURN_INSERTED_IN_TRANSACTION_NOT_AUTHORIZED");
    expect(JSON.stringify(decision)).not.toContain("ALLOW");
    const count=await pool!.query(
      "select reservation_state,started_event_hash_hex,evaluation_hash_hex "+
      "from "+burnTable+" where tenant_id=$1 and evaluation_hash_hex=$2",
      [f.fx.tenantId,f.evalHash]);
    expect(count.rows).toEqual([{reservation_state:"BURNED_NOT_AUTHORIZED",
      started_event_hash_hex:f.startedHash,evaluation_hash_hex:f.evalHash}]);
    await expect(reserve(f)).rejects.toThrow(/RL9C2B2F_ALREADY_BURNED/);
    expect((await pool!.query("select count(*)::int as n from "+burnTable+
      " where evaluation_hash_hex=$1",[f.evalHash])).rows).toEqual([{n:1}]);
  },120_000);

  it("never treats an uncommitted burn as durable; only COMMIT persists it",async()=>{
    const f=await eventFixture("abort");
    expect(await reserve(f,{commit:false}))
      .toBe("BURN_INSERTED_IN_TRANSACTION_NOT_AUTHORIZED");
    const none=await pool!.query("select count(*)::int as n from "+burnTable+
      " where evaluation_hash_hex=$1",[f.evalHash]);
    expect(none.rows).toEqual([{n:0}]);
    expect(await reserve(f)).toBe("BURN_INSERTED_IN_TRANSACTION_NOT_AUTHORIZED");
  },120_000);

  it("rejects missing event and mismatched evaluation/hash without changing the ledger",async()=>{
    const f=await eventFixture("wrong-hashes");
    for(const v of [
      {evalHash:"F".repeat(64)},
      {startedHash:"E".repeat(64)},
      {evalHash:"nothex"},
      {startedHash:"invalid"},
    ])await expect(reserve(f,v)).rejects.toThrow(
      /RL9C2B2F_UNPROVEN_CONTEXT|RL9C2B2F_COMMITTED_STARTED_EVENT_NOT_PROVEN/);
    expect((await pool!.query("select count(*)::int as n from "+burnTable+
      " where evaluation_hash_hex=$1",[f.evalHash])).rows).toEqual([{n:0}]);
  },120_000);

  it("serializes two independent PostgreSQL connections competing for one event",async()=>{
    const f=await eventFixture("racing");
    const results=await Promise.allSettled([reserve(f),reserve(f)]);
    const ok=results.filter(v=>v.status==="fulfilled");
    const blocked=results.filter(v=>v.status==="rejected");
    expect(ok).toHaveLength(1);
    expect(blocked).toHaveLength(1);
    expect(ok[0]).toMatchObject({status:"fulfilled",
      value:"BURN_INSERTED_IN_TRANSACTION_NOT_AUTHORIZED"});
    expect(String((blocked[0] as PromiseRejectedResult).reason))
      .toMatch(/RL9C2B2F_ALREADY_BURNED/);
    expect((await pool!.query("select count(*)::int as n from "+burnTable+
      " where evaluation_hash_hex=$1",[f.evalHash])).rows).toEqual([{n:1}]);
  },120_000);

  it("refuses new burn after committed terminal fail-closed event",async()=>{
    const f=await eventFixture("terminal");
    const client=await pool!.connect();
    try{
      await client.query("begin");
      const orig=await client.query<{canonical_payload:unknown}>(
        "select canonical_payload from "+
        "investing.research_blind_truth_reveal_result_events_scientific_identities "+
        "where event_hash_hex=$1",[f.startedHash]);
      expect(orig.rows).toHaveLength(1);
      const start=orig.rows[0]!.canonical_payload as BlindTruthRevealResultEventV1;
      const terminal:BlindTruthRevealResultEventV1={
        ...start,predecessorEvent:{
          hashAlgorithm:"SHA-256",hashDomain:"SYNTRAKE:BLIND_TRUTH_REVEAL_RESULT_EVENT:V1",
          hashVersion:"SYNTRAKE_SHA256_V1",hashHex:canonicalSha256HexV1(f.startedHash)},
        eventState:"REVEAL_FAILED_CLOSED",reason:"ACCESS_AUDIT_UNAVAILABLE",
      };
      await callBlindTruthWriter(client,f.fx,"RESEARCH_BLIND_TRUTH_FINAL_EVENT_CREATE_V1",
        "persist_research_blind_truth_final_event_v1",
        hashBlindTruthRevealResultEventV1(terminal,start).hashHex,
        canonicalBlindTruthRevealResultEventV1(terminal,start),false);
      await client.query("commit");
    }catch(e){await client.query("rollback").catch(()=>undefined);throw e;}
    finally{client.release();}
    await expect(reserve(f)).rejects.toThrow(/RL9C2B2F_ALREADY_TERMINAL/);
  },120_000);


  it("requires COMMITTED PG burn before synthetic ciphertext open, with both ledgers non-replayable",async()=>{
    if(process.platform==="win32")return;
    const fictional=Buffer.from('{"syntheticOnly":true,"close":"111.11"}');
    const f=await eventFixture("two-ledger-integration",fictional);
    // The test harness is privileged. No application can call this SQL
    // function, and neither the PG burn nor the filesystem claim is a Vault
    // secret-release permission or operational external authority.
    expect(await reserve(f)).toBe("BURN_INSERTED_IN_TRANSACTION_NOT_AUTHORIZED");
    const joined=await pool!.query<{event_state:string;reservation_state:string}>(
      "select e.event_state,r.reservation_state "+
      "from "+burnTable+" r join "+
      "investing.research_blind_truth_reveal_result_events_scientific_identities e "+
      "on e.research_blind_truth_reveal_result_event_identity_id=r.started_event_identity_id "+
      "and e.event_hash_hex=r.started_event_hash_hex "+
      "where r.tenant_id=$1 and r.evaluation_hash_hex=$2",
      [f.fx.tenantId,f.evalHash]);
    expect(joined.rows).toEqual([{
      event_state:"REVEAL_STARTED",reservation_state:"BURNED_NOT_AUTHORIZED",
    }]);
    const root=fs.mkdtempSync(path.join(os.tmpdir(),"syntrake-b2f-dual-burn-"));
    fs.chmodSync(root,0o700);
    try{
      const config={environment:{
        SYNTRAKE_VAULT_WORKER_MODE:"ISOLATED_SECRET_VAULT_V1",
        SYNTRAKE_VAULT_SYNTHETIC_STORE_MODE:"ISOLATED_REHEARSAL_V1",
      },rootDirectory:root,storageMode:"ISOLATED_REHEARSAL_V1"};
      const binding={
        tenantId:f.fx.tenantId,registrationHashHex:f.fx.registrationHash,
        holdoutScopeDigestHex:blindTruthHoldoutScopeDigestV1(
          f.fx.registrationPayload.holdoutScope),
        commitmentHashHex:f.seal.commitmentHash,
      };
      const key=Buffer.alloc(32,0x55);
      const envelope=encryptBlindTruthVaultEnvelopeV1({
        vaultEncryptionKey:key,keyVersion:"SYNTHETIC_K1",
        binding,exactCanonicalPlaintextBytes:fictional,
      });
      const staged=createSyntheticPrivateCiphertextStoreV1(config)
        .stageSyntheticEnvelopeV1({classification:"SYNTHETIC_TEST_VECTOR",envelope});
      const request={
        classification:"SYNTHETIC_TEST_VECTOR",
        privateObjectLocator:staged.privateObjectLocator,
        evaluationHashHex:f.evalHash,revealStartedEventHashHex:f.startedHash,
      };
      const consumed=createSyntheticVaultConsumeOnceRehearsalV1(config)
        .consumeSyntheticSealedEnvelopeOnceV1(request);
      expect(consumed.status).toBe("SYNTHETIC_CONSUMED_ONCE");
      const opened=decryptBlindTruthVaultEnvelopeV1({
        vaultEncryptionKey:key,expectedKeyVersion:"SYNTHETIC_K1",
        expectedBinding:binding,envelope:consumed.envelope,
      });
      try{
        verifyBlindTruthHoldoutCommitmentV1({
          secretSalt:Buffer.alloc(32,0x69),
          exactCanonicalHoldoutPlaintextBytes:opened,
          publicCommitmentHash:f.seal.commitmentHash,
          declaredPlaintextByteLength:f.seal.declaredPlaintextByteLength,
        });
        expect(opened.equals(fictional)).toBe(true);
      }finally{opened.fill(0);}
      await expect(reserve(f)).rejects.toThrow(/RL9C2B2F_ALREADY_BURNED/);
      expect(()=>createSyntheticVaultConsumeOnceRehearsalV1(config)
        .consumeSyntheticSealedEnvelopeOnceV1(request)).toThrow("VAULT_UNAVAILABLE");
      const terminal=await pool!.query<{n:number}>(
        "select count(*)::int as n from "+
        "investing.research_blind_truth_reveal_result_events_scientific_identities "+
        "where evaluation_hash_hex=$1 and event_state='REVEAL_COMPLETED'",
        [f.evalHash]);
      expect(terminal.rows).toEqual([{n:0}]);
    }finally{fictional.fill(0);fs.rmSync(root,{recursive:true,force:true});}
  },120_000);

  it("FORCE RLS blocks cross-tenant read under forged GUC scope and append-only UPDATE/DELETE",async()=>{
    const a=await eventFixture("tenant-one");
    const b=await eventFixture("tenant-two");
    await reserve(a);await reserve(b);
    const client=await pool!.connect();
    try{
      await client.query("begin");
      await setRl9Authority(client,a.fx,
        "RESEARCH_BLIND_TRUTH_REVEAL_STARTED_CREATE_V1",false);
      await client.query("set local role investing_rl9_writer");
      const visible=await client.query<{tenant_id:string}>(
        "select tenant_id::text from "+burnTable);
      expect(visible.rows).toEqual([{tenant_id:a.fx.tenantId}]);
      await client.query("reset role");
      await expectPgRejection(client,
        ()=>client.query("update "+burnTable+" set reservation_state=reservation_state"),
        /append-only/);
      await expectPgRejection(client,
        ()=>client.query("delete from "+burnTable),
        /append-only/);
      await client.query("rollback");
    }finally{await client.query("rollback").catch(()=>undefined);client.release();}
  },120_000);
});
