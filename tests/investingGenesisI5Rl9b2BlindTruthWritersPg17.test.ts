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
  researchExperimentId: string;
  researchSpecRevisionId: string;
  subjectExperiment: HashRefV1;
  subjectExperimentParameters: HashRefV1;
  subjectResearchIr: HashRefV1;
  promotionProtocol: ReturnType<typeof hashRefV1>;
  promotionTransition: ReturnType<typeof hashRefV1>;
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
};

const rl9Tables = [
  "research_blind_truth_protocols_scientific_identities",
  "research_blind_truth_registrations_scientific_identities",
  "research_blind_truth_vault_seals_scientific_identities",
  "research_blind_truth_evaluations_scientific_identities",
  "research_blind_truth_reveal_result_events_scientific_identities",
] as const;

const h = (seed: string) => canonicalSha256HexV1(seed.repeat(64).slice(0, 64));
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
    blindTruthCriteria: [optionalCriterion, requiredCriterion],
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
    researchExperimentId: overrides.researchExperimentId ?? await uuid(client),
    researchSpecRevisionId: overrides.researchSpecRevisionId ?? await uuid(client),
    subjectExperiment: overrides.subjectExperiment ?? hashRef("SYNTRAKE:EXPERIMENT:V1", `${suffix}:experiment`),
    subjectExperimentParameters: overrides.subjectExperimentParameters ?? hashRef("SYNTRAKE:EXPERIMENT_PARAMETERS:V1", `${suffix}:parameters`),
    subjectResearchIr: overrides.subjectResearchIr ?? hashRef("SYNTRAKE:RESEARCH_IR:V1", `${suffix}:ir`),
    promotionProtocol: hashRefV1({ hashAlgorithm: "SHA-256", hashDomain: "SYNTRAKE:SCIENTIFIC_PROMOTION_PROTOCOL:V1", hashVersion: "SYNTRAKE_SHA256_V1", hashHex: "122F57C9D0CEE90AF122C949D34C4862364BDD6C5DF1ACD87799F1110B7E124C" }),
    promotionTransition: overrides.promotionTransition ?? hashRefV1({ hashAlgorithm: "SHA-256", hashDomain: "SYNTRAKE:SCIENTIFIC_PROMOTION_TRANSITION:V1", hashVersion: "SYNTRAKE_SHA256_V1", hashHex: h(`${suffix}:promotion`) }),
    hypothesis: overrides.hypothesis ?? hashRef("SYNTRAKE:HYPOTHESIS:V1", `${suffix}:hypothesis`),
    metricRequestSet: hashRefV1({ hashAlgorithm: "SHA-256", hashDomain: "SYNTRAKE:METRIC_REQUEST_SET:V1", hashVersion: "SYNTRAKE_SHA256_V1", hashHex: hashMetricRequestSetV1(metricRequestSetPayload) }),
    executionConfig: hashRefV1({ hashAlgorithm: "SHA-256", hashDomain: "SYNTRAKE:EXECUTION_CONFIG:V1", hashVersion: "SYNTRAKE_SHA256_V1", hashHex: hashExecutionConfigV1(executionConfigPayload) }),
    registrationPayload: undefined as never,
    registrationHash: "",
  };
  fx.registrationPayload = registrationPayloadFor(fx);
  fx.registrationHash = hashRegistrationPayload(fx.registrationPayload);
  await seedAuthority(client, fx, suffix, overrides.reuseAuthority === true);
  await seedMinimalResearchRows(client, fx, suffix);
  return fx;
}

async function seedMinimalResearchRows(client: PoolClient, fx: Rl9BehaviorFixture, suffix: string): Promise<void> {
  const specRoot = await uuid(client);
  const draftRoot = await uuid(client);
  const hypothesisRoot = await uuid(client);
  const draftRevision = await uuid(client);
  const hypothesisRevision = await uuid(client);
  const sourceDraftHash = h(`${suffix}:draft`);
  await client.query(`insert into investing.research_material_roots (material_root_id, research_investigation_id, tenant_id, principal_id, actor_kind, actor_id, tenant_membership_id, operation_scope, source_context, material_kind, created_by_operation) values ($1,$4,$5,$6,'USER_PRINCIPAL',($6::uuid)::text,$7,'TENANT_SCOPE','PURE_RESEARCH','RESEARCH_SPEC','RESEARCH_SPEC_REVISION_CREATE_V1'),($2,$4,$5,$6,'USER_PRINCIPAL',($6::uuid)::text,$7,'TENANT_SCOPE','PURE_RESEARCH','DRAFT','RESEARCH_DRAFT_REVISION_CREATE_V1'),($3,$4,$5,$6,'USER_PRINCIPAL',($6::uuid)::text,$7,'TENANT_SCOPE','PURE_RESEARCH','HYPOTHESIS','RESEARCH_HYPOTHESIS_REVISION_CREATE_V1')`, [specRoot, draftRoot, hypothesisRoot, fx.investigationId, fx.tenantId, fx.principalId, fx.membershipId]);
  await client.query(`insert into investing.research_material_revisions (material_revision_id, material_root_id, research_investigation_id, tenant_id, principal_id, actor_kind, actor_id, tenant_membership_id, operation_scope, operation, capability, source_context, material_kind, revision_number, payload_schema_version, canonical_payload, material_hash, material_request_hash, idempotency_record_id, idempotency_key, correlation_id) values ($1,$2,$5,$6,$7,'USER_PRINCIPAL',($7::uuid)::text,$8,'TENANT_SCOPE','RESEARCH_DRAFT_REVISION_CREATE_V1','RESEARCH_MUTATE','PURE_RESEARCH','DRAFT',1,'RESEARCH_DRAFT_HASH_PAYLOAD_V1','{"schemaVersion":"RESEARCH_DRAFT_HASH_PAYLOAD_V1"}'::jsonb,$9,$9,$11,$12,$13),($3,$4,$5,$6,$7,'USER_PRINCIPAL',($7::uuid)::text,$8,'TENANT_SCOPE','RESEARCH_HYPOTHESIS_REVISION_CREATE_V1','RESEARCH_MUTATE','PURE_RESEARCH','HYPOTHESIS',1,'HYPOTHESIS_HASH_PAYLOAD_V1','{"schemaVersion":"HYPOTHESIS_HASH_PAYLOAD_V1"}'::jsonb,$10,$10,$11,$12,$13)`, [draftRevision, draftRoot, hypothesisRevision, hypothesisRoot, fx.investigationId, fx.tenantId, fx.principalId, fx.membershipId, sourceDraftHash, fx.hypothesis.hashHex, fx.idempotencyRecordId, `rl9b-${suffix}-investigation-idem`, `rl9b-${suffix}-corr`]);
  await client.query(`insert into investing.research_spec_revisions (research_spec_revision_id, material_root_id, research_investigation_id, tenant_id, principal_id, actor_kind, actor_id, tenant_membership_id, operation_scope, source_context, operation, capability, revision_number, source_draft_revision_id, source_draft_material_hash, hypothesis_revision_id, hypothesis_material_hash, candidate_schema_version, candidate_status, canonical_candidate, material_request_hash, idempotency_record_id, idempotency_key, correlation_id) values ($1,$2,$3,$4,$5,'USER_PRINCIPAL',($5::uuid)::text,$6,'TENANT_SCOPE','PURE_RESEARCH','RESEARCH_SPEC_REVISION_CREATE_V1','RESEARCH_MUTATE',1,$7,$8,$9,$10,'RESEARCH_SPEC_CANDIDATE_V1','CANDIDATE_ONLY',$11::jsonb,$12,$13,$14,$15)`, [fx.researchSpecRevisionId, specRoot, fx.investigationId, fx.tenantId, fx.principalId, fx.membershipId, draftRevision, sourceDraftHash, hypothesisRevision, fx.hypothesis.hashHex, JSON.stringify({ schemaVersion: "RESEARCH_SPEC_CANDIDATE_V1", status: "CANDIDATE_ONLY", sourceDraft: hashRefV1({ hashAlgorithm: "SHA-256", hashDomain: "SYNTRAKE:RESEARCH_DRAFT:V1", hashVersion: "SYNTRAKE_SHA256_V1", hashHex: sourceDraftHash }), hypothesisBinding: { kind: "EXPLICIT_HYPOTHESIS", hypothesis: fx.hypothesis } }), h(`${suffix}:spec-request`), fx.idempotencyRecordId, `rl9b-${suffix}-investigation-idem`, `rl9b-${suffix}-corr`]);
  await client.query(`insert into investing.research_experiments (research_experiment_id, research_investigation_id, tenant_id, principal_id, actor_kind, actor_id, tenant_membership_id, operation_scope, source_context, operation, capability, relation, parent_experiment_id, research_spec_revision_id, research_ir_hash_algorithm, research_ir_hash_domain, research_ir_hash_version, research_ir_hash_hex, experiment_hash_algorithm, experiment_hash_domain, experiment_hash_version, experiment_hash_hex, experiment_parameters_hash_algorithm, experiment_parameters_hash_domain, experiment_parameters_hash_version, experiment_parameters_hash_hex, material_request_hash, idempotency_record_id, idempotency_key, correlation_id) values ($1,$2,$3,$4,'USER_PRINCIPAL',($4::uuid)::text,$5,'TENANT_SCOPE','PURE_RESEARCH','RESEARCH_EXPERIMENT_BASELINE_CREATE_V1','RESEARCH_MUTATE','BASELINE',null,$6,'SHA-256','SYNTRAKE:RESEARCH_IR:V1','SYNTRAKE_SHA256_V1',$7,'SHA-256','SYNTRAKE:EXPERIMENT:V1','SYNTRAKE_SHA256_V1',$8,'SHA-256','SYNTRAKE:EXPERIMENT_PARAMETERS:V1','SYNTRAKE_SHA256_V1',$9,$10,$11,$12,$13)`, [fx.researchExperimentId, fx.investigationId, fx.tenantId, fx.principalId, fx.membershipId, fx.researchSpecRevisionId, fx.subjectResearchIr.hashHex, fx.subjectExperiment.hashHex, fx.subjectExperimentParameters.hashHex, h(`${suffix}:experiment-request`), fx.idempotencyRecordId, `rl9b-${suffix}-investigation-idem`, `rl9b-${suffix}-corr`]);
  await client.query(`insert into investing.research_specs_scientific_identities (research_spec_identity_id, tenant_id, principal_id, tenant_membership_id, operation, capability, operation_scope, source_context, research_spec_revision_id, source_draft_hash_hex, hypothesis_hash_hex, hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload) values (extensions.gen_random_uuid(),$1,$2,$3,'RESEARCH_RUN_INPUT_SCIENTIFIC_CREATE_V1','RESEARCH_MUTATE','TENANT_SCOPE','PURE_RESEARCH',$4,$5,$6,'SHA-256','SYNTRAKE:RESEARCH_SPEC:V1','SYNTRAKE_SHA256_V1',$7,$8::jsonb)`, [fx.tenantId, fx.principalId, fx.membershipId, fx.researchSpecRevisionId, sourceDraftHash, fx.hypothesis.hashHex, h(`${suffix}:research-spec`), JSON.stringify({ schemaVersion: "RESEARCH_SPEC_HASH_PAYLOAD_V1", sourceDraft: hashRefV1({ hashAlgorithm: "SHA-256", hashDomain: "SYNTRAKE:RESEARCH_DRAFT:V1", hashVersion: "SYNTRAKE_SHA256_V1", hashHex: sourceDraftHash }), hypothesisBinding: { kind: "EXPLICIT_HYPOTHESIS", hypothesis: fx.hypothesis } })]);
  await client.query(`insert into investing.research_ir_scientific_identities (research_ir_identity_id, tenant_id, principal_id, tenant_membership_id, operation, capability, operation_scope, source_context, hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload) values (extensions.gen_random_uuid(),$1,$2,$3,'RESEARCH_RUN_INPUT_SCIENTIFIC_CREATE_V1','RESEARCH_MUTATE','TENANT_SCOPE','PURE_RESEARCH','SHA-256','SYNTRAKE:RESEARCH_IR:V1','SYNTRAKE_SHA256_V1',$4,'{"schemaVersion":"RESEARCH_IR_HASH_PAYLOAD_V1"}'::jsonb)`, [fx.tenantId, fx.principalId, fx.membershipId, fx.subjectResearchIr.hashHex]);
  await client.query(`insert into investing.metric_request_sets_scientific_identities (metric_request_set_identity_id, tenant_id, principal_id, tenant_membership_id, operation, capability, operation_scope, source_context, metric_registry_version, hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload) values (extensions.gen_random_uuid(),$1,$2,$3,'RESEARCH_RUN_INPUT_SCIENTIFIC_CREATE_V1','RESEARCH_MUTATE','TENANT_SCOPE','PURE_RESEARCH','METRIC_REGISTRY_V20260927','SHA-256','SYNTRAKE:METRIC_REQUEST_SET:V1','SYNTRAKE_SHA256_V1',$4,$5::jsonb)`, [fx.tenantId, fx.principalId, fx.membershipId, fx.metricRequestSet.hashHex, JSON.stringify(metricRequestSetPayload)]);
  await client.query(`insert into investing.execution_configs_scientific_identities (execution_config_identity_id, tenant_id, principal_id, tenant_membership_id, operation, capability, operation_scope, source_context, engine_compatibility_version, hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload) values (extensions.gen_random_uuid(),$1,$2,$3,'RESEARCH_RUN_INPUT_SCIENTIFIC_CREATE_V1','RESEARCH_MUTATE','TENANT_SCOPE','PURE_RESEARCH','ENGINE_V20260926','SHA-256','SYNTRAKE:EXECUTION_CONFIG:V1','SYNTRAKE_SHA256_V1',$4,$5::jsonb)`, [fx.tenantId, fx.principalId, fx.membershipId, fx.executionConfig.hashHex, JSON.stringify(executionConfigPayload)]);
  await client.query(`insert into investing.research_scientific_promotion_protocols_scientific_identities (research_scientific_promotion_protocol_identity_id, operation, capability, operation_scope, source_context, hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload) values (extensions.gen_random_uuid(),'RESEARCH_SCIENTIFIC_PROMOTION_PROTOCOL_CREATE_V1','RESEARCH_MUTATE','TENANT_SCOPE','PURE_RESEARCH','SHA-256','SYNTRAKE:SCIENTIFIC_PROMOTION_PROTOCOL:V1','SYNTRAKE_SHA256_V1',$1,'{"schemaVersion":"SCIENTIFIC_PROMOTION_PROTOCOL_V1","protocolId":"SCIENTIFIC_PROMOTION_PROTOCOL_V20261002"}'::jsonb) on conflict do nothing`, [fx.promotionProtocol.hashHex]);
  const protocolId = (await client.query<{ id: string }>("select research_scientific_promotion_protocol_identity_id::text as id from investing.research_scientific_promotion_protocols_scientific_identities where hash_hex=$1", [fx.promotionProtocol.hashHex])).rows[0]!.id;
  fx.protocolIdentityId = protocolId;
  await client.query(`insert into investing.research_scientific_promotion_transitions_scientific_identities (operation, capability, operation_scope, source_context, tenant_id, principal_id, tenant_membership_id, research_investigation_id, research_experiment_id, research_scientific_promotion_protocol_identity_id, protocol_hash_hex, subject_experiment_hash_hex, subject_experiment_parameters_hash_hex, subject_research_ir_hash_hex, predecessor_state, resulting_state, transition_hash_algorithm, transition_hash_domain, transition_hash_version, transition_hash_hex, canonical_payload) values ('RESEARCH_SCIENTIFIC_PROMOTION_EVALUATION_PLAN_PERSIST_V1','RESEARCH_MUTATE','TENANT_SCOPE','PURE_RESEARCH',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'VALIDATION_PASSED','PROMOTION_ELIGIBLE','SHA-256','SYNTRAKE:SCIENTIFIC_PROMOTION_TRANSITION:V1','SYNTRAKE_SHA256_V1',$11,$12::jsonb)`, [fx.tenantId, fx.principalId, fx.membershipId, fx.investigationId, fx.researchExperimentId, protocolId, fx.promotionProtocol.hashHex, fx.subjectExperiment.hashHex, fx.subjectExperimentParameters.hashHex, fx.subjectResearchIr.hashHex, fx.promotionTransition.hashHex, JSON.stringify({ resultingState: "PROMOTION_ELIGIBLE", subject: { subjectExperiment: fx.subjectExperiment, subjectExperimentParameters: fx.subjectExperimentParameters, subjectResearchIr: fx.subjectResearchIr }, protocol: fx.promotionProtocol })]);
}

async function insertRl8Successor(client: PoolClient, fx: Rl9BehaviorFixture, suffix: string): Promise<void> {
  const predecessor = await client.query<{ id: string }>("select research_scientific_promotion_transition_identity_id::text as id from investing.research_scientific_promotion_transitions_scientific_identities where tenant_id=$1 and transition_hash_hex=$2", [fx.tenantId, fx.promotionTransition.hashHex]);
  await client.query(`insert into investing.research_scientific_promotion_transitions_scientific_identities (operation, capability, operation_scope, source_context, tenant_id, principal_id, tenant_membership_id, research_investigation_id, research_experiment_id, research_scientific_promotion_protocol_identity_id, protocol_hash_hex, subject_experiment_hash_hex, subject_experiment_parameters_hash_hex, subject_research_ir_hash_hex, predecessor_transition_identity_id, predecessor_transition_hash_hex, predecessor_state, resulting_state, transition_hash_algorithm, transition_hash_domain, transition_hash_version, transition_hash_hex, canonical_payload) values ('RESEARCH_SCIENTIFIC_PROMOTION_EVALUATION_PLAN_PERSIST_V1','RESEARCH_MUTATE','TENANT_SCOPE','PURE_RESEARCH',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'PROMOTION_ELIGIBLE','VALIDATION_PASSED','SHA-256','SYNTRAKE:SCIENTIFIC_PROMOTION_TRANSITION:V1','SYNTRAKE_SHA256_V1',$13,$14::jsonb)`, [fx.tenantId, fx.principalId, fx.membershipId, fx.investigationId, fx.researchExperimentId, fx.protocolIdentityId, fx.promotionProtocol.hashHex, fx.subjectExperiment.hashHex, fx.subjectExperimentParameters.hashHex, fx.subjectResearchIr.hashHex, predecessor.rows[0]!.id, fx.promotionTransition.hashHex, h(`${suffix}:successor`), JSON.stringify({ resultingState: "VALIDATION_PASSED" })]);
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
             pg_has_role('postgres','investing_rl9_writer','member') as postgres_member,
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
      const [left, right] = await Promise.all([
        first.query(`select investing.persist_research_blind_truth_protocol_v1($1::text, $2::jsonb) as result`, [protocolHash, JSON.stringify(protocolPayload)]),
        second.query(`select investing.persist_research_blind_truth_protocol_v1($1::text, $2::jsonb) as result`, [protocolHash, JSON.stringify(protocolPayload)]),
      ]);
      expect([left.rows[0].result.status, right.rows[0].result.status].sort()).toEqual(["REUSED_IDENTICAL", "REUSED_IDENTICAL"]);
      await Promise.all([first.query("commit"), second.query("commit")]);
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

      const secondInvestigation = await seedRl9BehaviorFixture(client, "behavior-second-investigation", { tenantId: fx.tenantId, principalId: fx.principalId, membershipId: fx.membershipId, subjectExperiment: fx.subjectExperiment, subjectExperimentParameters: fx.subjectExperimentParameters, subjectResearchIr: fx.subjectResearchIr, reuseAuthority: true });
      await expectWriterStatus(client, secondInvestigation, "RESEARCH_BLIND_TRUTH_REGISTRATION_CREATE_V1", "persist_research_blind_truth_registration_v1", secondInvestigation.registrationHash, secondInvestigation.registrationPayload, "DIVERGENT_EXISTING_IDENTITY", true);

      const crossTenant = await seedRl9BehaviorFixture(client, "behavior-cross-tenant", { subjectExperiment: fx.subjectExperiment, subjectExperimentParameters: fx.subjectExperimentParameters, subjectResearchIr: fx.subjectResearchIr });
      const crossTenantResult = await callBlindTruthWriter(client, crossTenant, "RESEARCH_BLIND_TRUTH_REGISTRATION_CREATE_V1", "persist_research_blind_truth_registration_v1", crossTenant.registrationHash, crossTenant.registrationPayload, true);
      expect(crossTenantResult.status).toBe("CREATED");

      const malformedRegistration = { ...fx.registrationPayload, evaluatorProfile: { ...fx.registrationPayload.evaluatorProfile, engineVersion: "ENGINE_OLD" } } as unknown as BlindTruthRegistrationV1;
      await expectPgRejection(client, () => callBlindTruthWriter(client, fx, "RESEARCH_BLIND_TRUTH_REGISTRATION_CREATE_V1", "persist_research_blind_truth_registration_v1", hashRegistrationPayload(malformedRegistration), canonicalBlindTruthRegistrationV1(malformedRegistration), true), /INCOMPATIBLE_ENGINE_VERSION|MALFORMED_HASHREF/);

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
      await expectPgRejection(client, () => callBlindTruthWriter(client, fx, "RESEARCH_BLIND_TRUTH_EVALUATION_CREATE_V1", "persist_research_blind_truth_evaluation_v1", hashBlindTruthEvaluationV1({ ...evaluationPayload, evaluatorProfile: { ...blindTruthEvaluatorProfileV1, engineVersion: "ENGINE_OLD" as never } }).hashHex, canonicalBlindTruthEvaluationV1({ ...evaluationPayload, evaluatorProfile: { ...blindTruthEvaluatorProfileV1, engineVersion: "ENGINE_OLD" as never } }), false), /INCOMPATIBLE_ENGINE_VERSION/);

      const startedPayload = makeRevealStarted(fx.registrationPayload, sealPayload, evaluationPayload);
      const startedCanonical = canonicalBlindTruthRevealResultEventV1(startedPayload);
      const startedHash = hashBlindTruthRevealResultEventV1(startedPayload).hashHex;
      await expectSqlHashParity(client, "SYNTRAKE:BLIND_TRUTH_REVEAL_RESULT_EVENT:V1", startedCanonical, startedHash);
      const startedCreated = await callBlindTruthWriter(client, fx, "RESEARCH_BLIND_TRUTH_REVEAL_STARTED_CREATE_V1", "persist_research_blind_truth_reveal_started_v1", startedHash, startedCanonical, false);
      expect(startedCreated.status).toBe("CREATED");
      await expectWriterStatus(client, fx, "RESEARCH_BLIND_TRUTH_REVEAL_STARTED_CREATE_V1", "persist_research_blind_truth_reveal_started_v1", startedHash, startedCanonical, "REUSED_IDENTICAL", false);
      await expectWriterStatus(client, fx, "RESEARCH_BLIND_TRUTH_REVEAL_STARTED_CREATE_V1", "persist_research_blind_truth_reveal_started_v1", hashBlindTruthRevealResultEventV1({ ...startedPayload, reason: "VAULT_UNAVAILABLE" as never }).hashHex, { ...(startedCanonical as Record<string, unknown>), reason: "VAULT_UNAVAILABLE" }, "DIVERGENT_EXISTING_IDENTITY", false);

      await insertRl8Successor(client, fx, "behavior-main-successor");
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

});
