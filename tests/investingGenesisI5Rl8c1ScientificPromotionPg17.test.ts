import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  canonicalSha256HexV1,
  i5ResearchInternalCanonicalJsonBytesV1,
  type CanonicalJsonValue,
  type HashDomainV1,
  type HashRefV1,
} from "../lib/investing/research/canonical";
import {
  canonicalScientificPromotionProtocolBytesV1,
  canonicalScientificPromotionProtocolV1,
  canonicalScientificPromotionTransitionBytesV1,
  gateEvidenceForScientificPromotionV1,
  hashScientificPromotionProtocolV1,
  hashScientificPromotionTransitionV1,
  scientificPromotionGateVocabularyV1,
  scientificPromotionProtocolDomainV1,
  scientificPromotionTransitionDomainV1,
  type ScientificPromotionEvidenceSnapshotV1,
  type ScientificPromotionGateOutcomeV1,
  type ScientificPromotionSubjectV1,
  type ScientificPromotionTransitionV1,
} from "../lib/investing/research/scientificPromotion";

const repoRoot = path.resolve(__dirname, "..");
const connectionString = process.env.PG17_RECONCILIATION_URL ?? "";
const maybeDescribe = connectionString ? describe : describe.skip;
const migrationName = "20261004120000_investing_i5_rl8c1_scientific_promotion_schema_authority.sql";

const protocolCanonicalBytesSha256 = "A3DBB4046CD52A02E90EE175298A7799BAB791B8532FBF84A1A58C11D3B1F012";
const protocolHashRef = "122F57C9D0CEE90AF122C949D34C4862364BDD6C5DF1ACD87799F1110B7E124C";
const rootCanonicalBytesSha256 = "3546B2ADD88325F789DD3F4B25817AA6CF3E6D9812711E26852B432AA659F7A1";
const rootHashRef = "3E910D12366ED5B0CE8C93686FC18F98A0D07E550D96BF61237BA73ECE23901F";

const migrations = fs
  .readdirSync(path.join(repoRoot, "supabase", "migrations"))
  .filter((name) => name.endsWith(".sql") && name >= "20260825120000_investing_genesis_i2_authority_materialization.sql" && name <= migrationName)
  .sort()
  .map((name) => path.join("supabase", "migrations", name));

function sha256Hex(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex").toUpperCase();
}

function ref(hashDomain: HashDomainV1, char: string): HashRefV1 {
  return {
    hashAlgorithm: "SHA-256",
    hashDomain,
    hashVersion: "SYNTRAKE_SHA256_V1",
    hashHex: canonicalSha256HexV1(char.repeat(64).slice(0, 64)),
  };
}

const validationProtocol = ref("SYNTRAKE:VALIDATION_PROTOCOL:V1", "A");
const experiment = ref("SYNTRAKE:EXPERIMENT:V1", "B");
const researchIr = ref("SYNTRAKE:RESEARCH_IR:V1", "C");
const experimentParameters = ref("SYNTRAKE:EXPERIMENT_PARAMETERS:V1", "D");
const validationResult = ref("SYNTRAKE:VALIDATION_RESULT:V1", "E");
const result = ref("SYNTRAKE:RESULT:V1", "F");
const runInput = ref("SYNTRAKE:RUN_INPUT:V1", "1");
const evidenceObject = ref("SYNTRAKE:EVIDENCE_OBJECT:V1", "2");
const validationAssessmentProtocol = ref("SYNTRAKE:VALIDATION_ASSESSMENT_PROTOCOL:V1", "3");
const validationAssessmentResult = ref("SYNTRAKE:VALIDATION_ASSESSMENT_RESULT:V1", "4");
const robustnessComparisonProtocol = ref("SYNTRAKE:EXPERIMENT_COMPARISON_PROTOCOL:V1", "5");
const robustnessComparisonResult = ref("SYNTRAKE:EXPERIMENT_COMPARISON_RESULT:V1", "6");

const subject: ScientificPromotionSubjectV1 = {
  subjectExperiment: experiment,
  subjectExperimentParameters: experimentParameters,
  subjectResearchIr: researchIr,
};

function fullSnapshot(overrides: Partial<ScientificPromotionEvidenceSnapshotV1> = {}): ScientificPromotionEvidenceSnapshotV1 {
  return {
    runInput,
    result,
    evidenceObject,
    validationProtocol,
    validationResult,
    validationAssessmentProtocol,
    validationAssessmentResult,
    robustnessComparisonProtocol,
    robustnessComparisonResult,
    ...overrides,
  };
}

function rootTransition(overrides: Partial<ScientificPromotionTransitionV1> = {}): ScientificPromotionTransitionV1 {
  return {
    schemaVersion: "SCIENTIFIC_PROMOTION_TRANSITION_V1",
    protocol: hashScientificPromotionProtocolV1(),
    subject,
    predecessorTransition: null,
    predecessorState: "DRAFT_RESEARCH",
    resultingState: "EXECUTED",
    evidenceSnapshot: {
      runInput,
      result,
      evidenceObject: null,
      validationProtocol: null,
      validationResult: null,
      validationAssessmentProtocol: null,
      validationAssessmentResult: null,
      robustnessComparisonProtocol: null,
      robustnessComparisonResult: null,
    },
    gateOutcomes: [],
    transitionReasons: [],
    supersedes: null,
    rejectedTransition: null,
    supersededByChain: null,
    ...overrides,
  };
}

function passingGateOutcomes(snapshot: ScientificPromotionEvidenceSnapshotV1 = fullSnapshot()): ScientificPromotionGateOutcomeV1[] {
  return scientificPromotionGateVocabularyV1.map((gateId) => ({
    gateId,
    status: "PASS",
    reasons: [],
    evidence: gateEvidenceForScientificPromotionV1({ protocol: hashScientificPromotionProtocolV1(), subject, evidenceSnapshot: snapshot, gateId }),
  }));
}

function stageATransition(overrides: Partial<ScientificPromotionTransitionV1> = {}): ScientificPromotionTransitionV1 {
  return {
    ...rootTransition(),
    predecessorState: "EXECUTED",
    resultingState: "VALIDATION_PASSED",
    predecessorTransition: hashScientificPromotionTransitionV1(rootTransition()),
    evidenceSnapshot: fullSnapshot(),
    gateOutcomes: passingGateOutcomes(),
    ...overrides,
  };
}

function canonicalSortRefs(refs: Array<HashRefV1 | null>): HashRefV1[] {
  const byCanonical = new Map<string, HashRefV1>();
  for (const item of refs) {
    if (item === null) continue;
    byCanonical.set(i5ResearchInternalCanonicalJsonBytesV1(item as unknown as CanonicalJsonValue).toString("utf8"), item);
  }
  return Array.from(byCanonical.entries())
    .sort(([left], [right]) => Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8")))
    .map(([, item]) => item);
}

async function roleExists(client: PoolClient, role: string): Promise<boolean> {
  const result = await client.query<{ exists: boolean }>("select exists(select 1 from pg_roles where rolname=$1) as exists", [role]);
  return result.rows[0]?.exists === true;
}

async function dropRoleIfExists(client: PoolClient, role: string): Promise<void> {
  if (!(await roleExists(client, role))) return;
  await client.query(`reassign owned by ${role} to postgres`);
  await client.query(`drop owned by ${role}`);
  await client.query(`drop role ${role}`);
}

async function resetReconciliationDatabase(client: PoolClient): Promise<void> {
  await client.query("drop schema if exists investing cascade");
  await client.query("drop schema if exists extensions cascade");
  for (const role of ["investing_rl8_writer", "investing_app", "investing_owner"]) await dropRoleIfExists(client, role);
  await client.query("do $$ begin if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if; if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if; if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if; end $$");
  await client.query("create schema extensions authorization postgres");
  await client.query("create extension if not exists pgcrypto with schema extensions");
}

async function applyMigration(client: PoolClient, relativePath: string): Promise<void> {
  const sql = fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
  try {
    await client.query(sql);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`PG17 RL-8C1 migration replay failed for ${relativePath}: ${message}`);
  }
}

async function sqlCanonicalAndHash(client: PoolClient, payload: CanonicalJsonValue, domain: string): Promise<{ canonical: string; canonicalSha: string; hashref: string }> {
  const result = await client.query<{ canonical: string; canonical_sha: string; hashref: string }>(`
    select
      investing.rl8c_canonical_jsonb_v1($1::jsonb) as canonical,
      upper(pg_catalog.encode(extensions.digest(pg_catalog.convert_to(investing.rl8c_canonical_jsonb_v1($1::jsonb), 'UTF8'), 'sha256'), 'hex')) as canonical_sha,
      investing.rl8c_sha256_hex_v1($2, $1::jsonb) as hashref
  `, [JSON.stringify(payload), domain]);
  const row = result.rows[0];
  if (!row) throw new Error("missing SQL canonicalization row");
  return { canonical: row.canonical, canonicalSha: row.canonical_sha, hashref: row.hashref };
}

async function validateTransitionPayload(client: PoolClient, transition: ScientificPromotionTransitionV1): Promise<boolean> {
  const s = transition.evidenceSnapshot;
  const result = await client.query<{ ok: boolean }>(`
    select investing.rl8c_validate_transition_payload_shape_v1(
      $1::jsonb, $2, $3, $4, $5, $6, $7,
      $8::uuid, $9, $10::uuid, $11, $12::uuid, $13, $14::uuid, $15, $16::uuid, $17,
      $18::uuid, $19, $20::uuid, $21, $22::uuid, $23, $24::uuid, $25, $26::uuid, $27,
      $28::uuid, $29, $30::uuid, $31, $32::uuid, $33, $34::uuid, $35
    ) as ok
  `, [
    JSON.stringify(transition),
    transition.predecessorState,
    transition.resultingState,
    transition.protocol.hashHex,
    transition.subject.subjectExperiment.hashHex,
    transition.subject.subjectExperimentParameters.hashHex,
    transition.subject.subjectResearchIr.hashHex,
    transition.predecessorTransition ? "00000000-0000-0000-0000-000000000001" : null,
    transition.predecessorTransition?.hashHex ?? null,
    transition.rejectedTransition ? "00000000-0000-0000-0000-000000000002" : null,
    transition.rejectedTransition?.hashHex ?? null,
    transition.supersedes ? "00000000-0000-0000-0000-000000000003" : null,
    transition.supersedes?.hashHex ?? null,
    transition.supersededByChain ? "00000000-0000-0000-0000-000000000004" : null,
    transition.supersededByChain?.successorProtocol.hashHex ?? null,
    transition.supersededByChain ? "00000000-0000-0000-0000-000000000005" : null,
    transition.supersededByChain?.successorRootTransition.hashHex ?? null,
    s.runInput ? "00000000-0000-0000-0000-000000000101" : null,
    s.runInput?.hashHex ?? null,
    s.result ? "00000000-0000-0000-0000-000000000102" : null,
    s.result?.hashHex ?? null,
    s.evidenceObject ? "00000000-0000-0000-0000-000000000103" : null,
    s.evidenceObject?.hashHex ?? null,
    s.validationProtocol ? "00000000-0000-0000-0000-000000000104" : null,
    s.validationProtocol?.hashHex ?? null,
    s.validationResult ? "00000000-0000-0000-0000-000000000105" : null,
    s.validationResult?.hashHex ?? null,
    s.validationAssessmentProtocol ? "00000000-0000-0000-0000-000000000106" : null,
    s.validationAssessmentProtocol?.hashHex ?? null,
    s.validationAssessmentResult ? "00000000-0000-0000-0000-000000000107" : null,
    s.validationAssessmentResult?.hashHex ?? null,
    s.robustnessComparisonProtocol ? "00000000-0000-0000-0000-000000000108" : null,
    s.robustnessComparisonProtocol?.hashHex ?? null,
    s.robustnessComparisonResult ? "00000000-0000-0000-0000-000000000109" : null,
    s.robustnessComparisonResult?.hashHex ?? null,
  ]);
  return result.rows[0]?.ok === true;
}


type Rl8cAuthorityFixture = {
  tenantId: string;
  principalId: string;
  tenantMembershipId: string;
  researchInvestigationId: string;
  baselineExperimentId: string;
  researchExperimentId: string;
  researchSpecRevisionId: string;
  runInputIdentityId: string;
  resultIdentityId: string;
  evidenceObjectIdentityId: string;
  protocolIdentityId: string;
  runInputHashHex: string;
  resultHashHex: string;
  evidenceObjectHashHex: string;
};

function fixtureHash(label: string): string {
  return sha256Hex(label);
}

function pgErrorCode(error: unknown): unknown {
  return typeof error === "object" && error !== null && "code" in error ? (error as { code?: unknown }).code : undefined;
}

async function expectPgRejection(client: PoolClient, action: () => Promise<unknown>, pattern?: RegExp): Promise<void> {
  await client.query("savepoint rl8c_expected_rejection");
  let error: unknown = null;
  try {
    await action();
  } catch (caught) {
    error = caught;
  }
  await client.query("rollback to savepoint rl8c_expected_rejection");
  await client.query("release savepoint rl8c_expected_rejection");
  expect(error).not.toBeNull();
  expect(pgErrorCode(error)).not.toBe("25P02");
  if (pattern) expect(error instanceof Error ? error.message : String(error)).toMatch(pattern);
}

async function withTransaction<T>(client: PoolClient, action: () => Promise<T>): Promise<T> {
  await client.query("begin");
  try {
    const result = await action();
    await client.query("rollback");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  }
}

async function setRl8Context(client: PoolClient, fixture: Pick<Rl8cAuthorityFixture, "tenantId" | "principalId" | "tenantMembershipId" | "researchInvestigationId">, operation = "RESEARCH_SCIENTIFIC_PROMOTION_ROOT_CREATE_V1"): Promise<void> {
  await client.query("select set_config('syntrake.investing.operation', $1, true)", [operation]);
  await client.query("select set_config('syntrake.investing.capability', 'RESEARCH_MUTATE', true)");
  await client.query("select set_config('syntrake.investing.tenant_id', $1, true)", [fixture.tenantId]);
  await client.query("select set_config('syntrake.investing.principal_id', $1, true)", [fixture.principalId]);
  await client.query("select set_config('syntrake.investing.tenant_membership_id', $1, true)", [fixture.tenantMembershipId]);
  await client.query("select set_config('syntrake.investing.research_investigation_id', $1, true)", [fixture.researchInvestigationId]);
}

async function nextFixtureIds(client: PoolClient): Promise<Rl8cAuthorityFixture> {
  const ids = await client.query<Rl8cAuthorityFixture>(`
    select
      extensions.gen_random_uuid()::text as "tenantId",
      extensions.gen_random_uuid()::text as "principalId",
      extensions.gen_random_uuid()::text as "tenantMembershipId",
      extensions.gen_random_uuid()::text as "researchInvestigationId",
      extensions.gen_random_uuid()::text as "baselineExperimentId",
      extensions.gen_random_uuid()::text as "researchExperimentId",
      extensions.gen_random_uuid()::text as "researchSpecRevisionId",
      extensions.gen_random_uuid()::text as "runInputIdentityId",
      extensions.gen_random_uuid()::text as "resultIdentityId",
      extensions.gen_random_uuid()::text as "evidenceObjectIdentityId",
      extensions.gen_random_uuid()::text as "protocolIdentityId"
  `);
  const fixture = ids.rows[0];
  if (!fixture) throw new Error("missing generated fixture ids");
  return { ...fixture, runInputHashHex: runInput.hashHex, resultHashHex: result.hashHex, evidenceObjectHashHex: evidenceObject.hashHex };
}

async function seedAuthorityScope(client: PoolClient, fixture: Rl8cAuthorityFixture, suffix: string, overrides: Partial<{ membershipState: string; membershipRole: string; reuseAuthority: boolean }> = {}): Promise<void> {
  const membershipState = overrides.membershipState ?? "ACTIVE";
  const membershipRole = overrides.membershipRole ?? "OWNER";
  if (!overrides.reuseAuthority) {
    await client.query("insert into investing.principals (principal_id, external_provider, external_subject) values ($1, 'CLERK', $2)", [fixture.principalId, `rl8c1-${suffix}`]);
    await client.query("insert into investing.tenants (tenant_id) values ($1)", [fixture.tenantId]);
    await client.query("insert into investing.tenant_memberships (tenant_membership_id, tenant_id, principal_id, role, state, revoked_at) values ($1, $2, $3, $4, $5, case when $5 = 'REVOKED' then transaction_timestamp() else null end)", [fixture.tenantMembershipId, fixture.tenantId, fixture.principalId, membershipRole, membershipState]);
  }
  await seedIdempotency(client, fixture, suffix, "investigation", "RESEARCH_INVESTIGATION_CREATE_V1");
  await client.query(`
    insert into investing.research_investigations (
      research_investigation_id, tenant_id, account_id, principal_id, actor_kind, actor_id, tenant_membership_id, account_access_id,
      operation_scope, operation, capability, source_context, material_request_hash, idempotency_record_id, idempotency_key, correlation_id
    )
    select $1, $2, null, $3, 'USER_PRINCIPAL', $3::text, $4, null, 'TENANT_SCOPE', 'RESEARCH_INVESTIGATION_CREATE_V1', 'RESEARCH_MUTATE', 'PURE_RESEARCH', $5, idempotency_record_id, $6, $7
    from investing.idempotency_records where idempotency_key = $6
  `, [fixture.researchInvestigationId, fixture.tenantId, fixture.principalId, fixture.tenantMembershipId, fixtureHash(`${suffix}:investigation`), `rl8c1-${suffix}-investigation-idem`, `rl8c1-${suffix}-investigation-corr`]);
}

async function seedIdempotency(client: PoolClient, fixture: Rl8cAuthorityFixture, suffix: string, label: string, operation: string): Promise<string> {
  const id = (await client.query<{ id: string }>("select extensions.gen_random_uuid()::text as id")).rows[0]?.id;
  if (!id) throw new Error("missing idempotency id");
  await client.query(`
    insert into investing.idempotency_records (
      idempotency_record_id, idempotency_key, material_request_hash, correlation_id, actor_kind, actor_id, operation_scope, operation, principal_id, tenant_id, account_id, status, completed_at
    ) values ($1, $2, $3, $4, 'USER_PRINCIPAL', $5, 'TENANT_SCOPE', $6, $7, $8, null, 'SUCCEEDED', transaction_timestamp())
  `, [id, `rl8c1-${suffix}-${label}-idem`, fixtureHash(`${suffix}:${label}`), `rl8c1-${suffix}-${label}-corr`, fixture.principalId, operation, fixture.principalId, fixture.tenantId]);
  return id;
}

async function seedResearchMaterialAndSpec(client: PoolClient, fixture: Rl8cAuthorityFixture, suffix: string): Promise<void> {
  const draftRoot = (await client.query<{ id: string }>("select extensions.gen_random_uuid()::text as id")).rows[0]!.id;
  const hypothesisRoot = (await client.query<{ id: string }>("select extensions.gen_random_uuid()::text as id")).rows[0]!.id;
  const specRoot = (await client.query<{ id: string }>("select extensions.gen_random_uuid()::text as id")).rows[0]!.id;
  const draftRevision = (await client.query<{ id: string }>("select extensions.gen_random_uuid()::text as id")).rows[0]!.id;
  const hypothesisRevision = (await client.query<{ id: string }>("select extensions.gen_random_uuid()::text as id")).rows[0]!.id;
  const draftHash = fixtureHash(`${suffix}:draft`);
  const hypothesisHash = fixtureHash(`${suffix}:hypothesis`);
  await seedIdempotency(client, fixture, suffix, "draft", "RESEARCH_DRAFT_REVISION_CREATE_V1");
  await seedIdempotency(client, fixture, suffix, "hypothesis", "RESEARCH_HYPOTHESIS_REVISION_CREATE_V1");
  await seedIdempotency(client, fixture, suffix, "spec", "RESEARCH_SPEC_REVISION_CREATE_V1");
  await client.query(`
    insert into investing.research_material_roots (
      material_root_id, research_investigation_id, tenant_id, account_id, principal_id, actor_kind, actor_id,
      tenant_membership_id, account_access_id, operation_scope, source_context, material_kind, created_by_operation
    ) values
      ($1,$4,$5,null,$6,'USER_PRINCIPAL',$6::text,$7,null,'TENANT_SCOPE','PURE_RESEARCH','DRAFT','RESEARCH_DRAFT_REVISION_CREATE_V1'),
      ($2,$4,$5,null,$6,'USER_PRINCIPAL',$6::text,$7,null,'TENANT_SCOPE','PURE_RESEARCH','HYPOTHESIS','RESEARCH_HYPOTHESIS_REVISION_CREATE_V1'),
      ($3,$4,$5,null,$6,'USER_PRINCIPAL',$6::text,$7,null,'TENANT_SCOPE','PURE_RESEARCH','RESEARCH_SPEC','RESEARCH_SPEC_REVISION_CREATE_V1')
  `, [draftRoot, hypothesisRoot, specRoot, fixture.researchInvestigationId, fixture.tenantId, fixture.principalId, fixture.tenantMembershipId]);
  await client.query(`
    insert into investing.research_material_revisions (
      material_revision_id, material_root_id, research_investigation_id, tenant_id, account_id, principal_id, actor_kind, actor_id,
      tenant_membership_id, account_access_id, operation_scope, operation, capability, source_context, material_kind, revision_number,
      predecessor_revision_id, payload_schema_version, canonical_payload, material_hash, material_request_hash, idempotency_record_id, idempotency_key, correlation_id
    ) values
      ($1,$2,$6,$7,null,$8,'USER_PRINCIPAL',$8::text,$9,null,'TENANT_SCOPE','RESEARCH_DRAFT_REVISION_CREATE_V1','RESEARCH_MUTATE','PURE_RESEARCH','DRAFT',1,null,'RESEARCH_DRAFT_HASH_PAYLOAD_V1','{"schemaVersion":"RESEARCH_DRAFT_HASH_PAYLOAD_V1"}'::jsonb,$10,$10,(select idempotency_record_id from investing.idempotency_records where idempotency_key=$12),$12,$13),
      ($3,$4,$6,$7,null,$8,'USER_PRINCIPAL',$8::text,$9,null,'TENANT_SCOPE','RESEARCH_HYPOTHESIS_REVISION_CREATE_V1','RESEARCH_MUTATE','PURE_RESEARCH','HYPOTHESIS',1,null,'HYPOTHESIS_HASH_PAYLOAD_V1','{"schemaVersion":"HYPOTHESIS_HASH_PAYLOAD_V1"}'::jsonb,$11,$11,(select idempotency_record_id from investing.idempotency_records where idempotency_key=$14),$14,$15)
  `, [draftRevision, draftRoot, hypothesisRevision, hypothesisRoot, specRoot, fixture.researchInvestigationId, fixture.tenantId, fixture.principalId, fixture.tenantMembershipId, draftHash, hypothesisHash, `rl8c1-${suffix}-draft-idem`, `rl8c1-${suffix}-draft-corr`, `rl8c1-${suffix}-hypothesis-idem`, `rl8c1-${suffix}-hypothesis-corr`]);
  const specCandidate = {
    schemaVersion: "RESEARCH_SPEC_CANDIDATE_V1",
    status: "CANDIDATE_ONLY",
    sourceDraft: { hashAlgorithm: "SHA-256", hashDomain: "SYNTRAKE:RESEARCH_DRAFT:V1", hashVersion: "SYNTRAKE_SHA256_V1", hashHex: draftHash },
    hypothesisBinding: { kind: "EXPLICIT_HYPOTHESIS", hypothesis: { hashAlgorithm: "SHA-256", hashDomain: "SYNTRAKE:HYPOTHESIS:V1", hashVersion: "SYNTRAKE_SHA256_V1", hashHex: hypothesisHash } },
  };
  await client.query(`
    insert into investing.research_spec_revisions (
      research_spec_revision_id, material_root_id, research_investigation_id, tenant_id, account_id, principal_id, actor_kind, actor_id,
      tenant_membership_id, account_access_id, operation_scope, source_context, operation, capability, revision_number, predecessor_revision_id,
      source_draft_revision_id, source_draft_material_hash, hypothesis_revision_id, hypothesis_material_hash, candidate_schema_version, candidate_status,
      canonical_candidate, material_request_hash, idempotency_record_id, idempotency_key, correlation_id
    ) values ($1,$2,$3,$4,null,$5,'USER_PRINCIPAL',$5::text,$6,null,'TENANT_SCOPE','PURE_RESEARCH','RESEARCH_SPEC_REVISION_CREATE_V1','RESEARCH_MUTATE',1,null,$7,$8,$9,$10,'RESEARCH_SPEC_CANDIDATE_V1','CANDIDATE_ONLY',$11::jsonb,$12,(select idempotency_record_id from investing.idempotency_records where idempotency_key=$13),$13,$14)
  `, [fixture.researchSpecRevisionId, specRoot, fixture.researchInvestigationId, fixture.tenantId, fixture.principalId, fixture.tenantMembershipId, draftRevision, draftHash, hypothesisRevision, hypothesisHash, JSON.stringify(specCandidate), fixtureHash(`${suffix}:spec`), `rl8c1-${suffix}-spec-idem`, `rl8c1-${suffix}-spec-corr`]);
}

async function seedBaselineAndVariantExperiment(client: PoolClient, fixture: Rl8cAuthorityFixture, suffix: string): Promise<void> {
  await seedIdempotency(client, fixture, suffix, "baseline", "RESEARCH_EXPERIMENT_BASELINE_CREATE_V1");
  await seedIdempotency(client, fixture, suffix, "variant", "RESEARCH_EXPERIMENT_VARIANT_CREATE_V1");
  await client.query(`
    insert into investing.research_experiments (
      research_experiment_id, research_investigation_id, tenant_id, account_id, principal_id, actor_kind, actor_id, tenant_membership_id, account_access_id,
      operation_scope, source_context, operation, capability, relation, parent_experiment_id, research_spec_revision_id,
      research_ir_hash_algorithm, research_ir_hash_domain, research_ir_hash_version, research_ir_hash_hex,
      experiment_hash_algorithm, experiment_hash_domain, experiment_hash_version, experiment_hash_hex,
      experiment_parameters_hash_algorithm, experiment_parameters_hash_domain, experiment_parameters_hash_version, experiment_parameters_hash_hex,
      material_request_hash, idempotency_record_id, idempotency_key, correlation_id
    ) values
      ($1,$3,$4,null,$5,'USER_PRINCIPAL',$5::text,$6,null,'TENANT_SCOPE','PURE_RESEARCH','RESEARCH_EXPERIMENT_BASELINE_CREATE_V1','RESEARCH_MUTATE','BASELINE',null,$7,'SHA-256','SYNTRAKE:RESEARCH_IR:V1','SYNTRAKE_SHA256_V1',$10,'SHA-256','SYNTRAKE:EXPERIMENT:V1','SYNTRAKE_SHA256_V1',$11,null,null,null,null,$12,(select idempotency_record_id from investing.idempotency_records where idempotency_key=$13),$13,$14),
      ($2,$3,$4,null,$5,'USER_PRINCIPAL',$5::text,$6,null,'TENANT_SCOPE','PURE_RESEARCH','RESEARCH_EXPERIMENT_VARIANT_CREATE_V1','RESEARCH_MUTATE','VARIANT',$1,$7,'SHA-256','SYNTRAKE:RESEARCH_IR:V1','SYNTRAKE_SHA256_V1',$10,'SHA-256','SYNTRAKE:EXPERIMENT:V1','SYNTRAKE_SHA256_V1',$8,'SHA-256','SYNTRAKE:EXPERIMENT_PARAMETERS:V1','SYNTRAKE_SHA256_V1',$9,$15,(select idempotency_record_id from investing.idempotency_records where idempotency_key=$16),$16,$17)
  `, [fixture.baselineExperimentId, fixture.researchExperimentId, fixture.researchInvestigationId, fixture.tenantId, fixture.principalId, fixture.tenantMembershipId, fixture.researchSpecRevisionId, experiment.hashHex, experimentParameters.hashHex, researchIr.hashHex, fixtureHash(`${suffix}:baseline-experiment`), fixtureHash(`${suffix}:baseline`), `rl8c1-${suffix}-baseline-idem`, `rl8c1-${suffix}-baseline-corr`, fixtureHash(`${suffix}:variant`), `rl8c1-${suffix}-variant-idem`, `rl8c1-${suffix}-variant-corr`]);
}

async function seedRunInput(client: PoolClient, fixture: Rl8cAuthorityFixture): Promise<void> {
  const payload = {
    schemaVersion: "RUN_INPUT_HASH_PAYLOAD_V1",
    researchSourceContext: "PURE_RESEARCH",
    metricRegistryVersion: "METRIC_REGISTRY_V20260927",
    engineVersion: "ENGINE_V20260918",
    researchSpec: ref("SYNTRAKE:RESEARCH_SPEC:V1", "7"),
    researchIr,
    experiment,
    datasetSnapshot: ref("SYNTRAKE:DATASET_SNAPSHOT:V1", "8"),
    metricRequestSet: ref("SYNTRAKE:METRIC_REQUEST_SET:V1", "9"),
    executionConfig: ref("SYNTRAKE:EXECUTION_CONFIG:V1", "A"),
  };
  await client.query(`
    insert into investing.run_inputs_scientific_identities (
      run_input_identity_id, tenant_id, account_id, principal_id, tenant_membership_id, research_investigation_id, research_experiment_id, research_spec_revision_id,
      operation, capability, operation_scope, source_context, research_spec_hash_hex, research_ir_hash_hex, experiment_hash_hex, dataset_snapshot_hash_hex,
      metric_registry_version, metric_request_set_hash_hex, engine_version, execution_config_hash_hex, hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload
    ) values ($1,$2,null,$3,$4,$5,$6,$7,'RESEARCH_RUN_INPUT_SCIENTIFIC_CREATE_V1','RESEARCH_MUTATE','TENANT_SCOPE','PURE_RESEARCH',$8,$9,$10,$11,'METRIC_REGISTRY_V20260927',$12,'ENGINE_V20260918',$13,'SHA-256','SYNTRAKE:RUN_INPUT:V1','SYNTRAKE_SHA256_V1',$14,$15::jsonb)
  `, [fixture.runInputIdentityId, fixture.tenantId, fixture.principalId, fixture.tenantMembershipId, fixture.researchInvestigationId, fixture.researchExperimentId, fixture.researchSpecRevisionId, payload.researchSpec.hashHex, researchIr.hashHex, experiment.hashHex, payload.datasetSnapshot.hashHex, payload.metricRequestSet.hashHex, payload.executionConfig.hashHex, fixture.runInputHashHex, JSON.stringify(payload)]);
}

async function seedResultArtifacts(client: PoolClient, fixture: Rl8cAuthorityFixture, suffix: string): Promise<{ trace: string; valuation: string; metrics: string }> {
  const ids = await client.query<{ trace: string; valuation: string; metrics: string }>("select extensions.gen_random_uuid()::text as trace, extensions.gen_random_uuid()::text as valuation, extensions.gen_random_uuid()::text as metrics");
  const artifactIds = ids.rows[0]!;
  for (const [id, kind, schema] of [[artifactIds.trace, "EXECUTION_TRACE", "EXECUTION_TRACE_V1"], [artifactIds.valuation, "VALUATION_SERIES", "VALUATION_SERIES_V1"], [artifactIds.metrics, "METRIC_RESULT_SET", "METRIC_RESULT_SET_V1"]]) {
    const content = `${JSON.stringify({ suffix, kind })}\n`;
    await client.query(`
      insert into investing.research_result_artifacts (artifact_id, tenant_id, account_id, principal_id, tenant_membership_id, operation, capability, operation_scope, source_context, artifact_kind, artifact_schema_version, format, content_sha256, content_byte_length, record_count, content)
      values ($1,$2,null,$3,$4,'RESEARCH_EXECUTION_RUN_V1','RESEARCH_EXECUTE','TENANT_SCOPE','PURE_RESEARCH',$5,$6,'CANONICAL_JSONL_UTF8_LF_FINAL_NEWLINE_V1',upper(encode(extensions.digest(convert_to($7,'UTF8'),'sha256'),'hex')),octet_length(convert_to($7,'UTF8')),1,convert_to($7,'UTF8'))
    `, [id, fixture.tenantId, fixture.principalId, fixture.tenantMembershipId, kind, schema, content]);
  }
  return artifactIds;
}

async function seedResult(client: PoolClient, fixture: Rl8cAuthorityFixture, suffix: string): Promise<void> {
  const artifacts = await seedResultArtifacts(client, fixture, suffix);
  await client.query(`
    insert into investing.research_results_scientific_identities (
      result_identity_id, tenant_id, account_id, principal_id, tenant_membership_id, run_input_identity_id,
      execution_trace_artifact_id, valuation_series_artifact_id, metric_result_set_artifact_id, benchmark_series_artifact_id,
      operation, capability, operation_scope, source_context, engine_id, engine_version, hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload
    ) values ($1,$2,null,$3,$4,$5,$6,$7,$8,null,'RESEARCH_EXECUTION_RUN_V1','RESEARCH_EXECUTE','TENANT_SCOPE','PURE_RESEARCH','HISTORICAL_EXECUTION_ADAPTER','ENGINE_V20260918','SHA-256','SYNTRAKE:RESULT:V1','SYNTRAKE_SHA256_V1',$9,'{"schemaVersion":"RESULT_HASH_PAYLOAD_V1"}'::jsonb)
  `, [fixture.resultIdentityId, fixture.tenantId, fixture.principalId, fixture.tenantMembershipId, fixture.runInputIdentityId, artifacts.trace, artifacts.valuation, artifacts.metrics, fixture.resultHashHex]);
}

async function seedEvidenceObject(client: PoolClient, fixture: Rl8cAuthorityFixture, suffix: string): Promise<void> {
  const content = JSON.stringify({ schemaVersion: "RESEARCH_EXECUTION_EVIDENCE_V1", suffix });
  await client.query(`
    insert into investing.research_evidence_objects_scientific_identities (
      evidence_identity_id, tenant_id, account_id, principal_id, tenant_membership_id, run_input_identity_id, result_identity_id,
      descriptor_schema_version, descriptor_kind, descriptor_artifact_schema_version, descriptor_format, content, content_sha256, content_byte_length,
      hash_algorithm, hash_domain, hash_version, hash_hex, operation, capability, operation_scope, source_context
    ) values ($1,$2,null,$3,$4,$5,$6,'EVIDENCE_CONTENT_DESCRIPTOR_V1','RESEARCH_EXECUTION_EVIDENCE','RESEARCH_EXECUTION_EVIDENCE_V1','CANONICAL_JSON_UTF8_V1',convert_to($7,'UTF8'),upper(encode(extensions.digest(convert_to($7,'UTF8'),'sha256'),'hex')),octet_length(convert_to($7,'UTF8')),'SHA-256','SYNTRAKE:EVIDENCE_OBJECT:V1','SYNTRAKE_SHA256_V1',$8,'RESEARCH_EXECUTION_RUN_V1','RESEARCH_EXECUTE','TENANT_SCOPE','PURE_RESEARCH')
  `, [fixture.evidenceObjectIdentityId, fixture.tenantId, fixture.principalId, fixture.tenantMembershipId, fixture.runInputIdentityId, fixture.resultIdentityId, content, fixture.evidenceObjectHashHex]);
}

async function seedRl8RootAuthorityFixture(client: PoolClient, suffix: string, overrides: Partial<{ membershipState: string; membershipRole: string; tenantId: string; principalId: string; tenantMembershipId: string; runInputHashHex: string; resultHashHex: string; reuseAuthority: boolean }> = {}): Promise<Rl8cAuthorityFixture> {
  const fixture = { ...(await nextFixtureIds(client)), ...overrides };
  await seedAuthorityScope(client, fixture, suffix, overrides);
  await seedResearchMaterialAndSpec(client, fixture, suffix);
  await seedBaselineAndVariantExperiment(client, fixture, suffix);
  await seedRunInput(client, fixture);
  await seedResult(client, fixture, suffix);
  await seedEvidenceObject(client, fixture, suffix);
  return fixture;
}

async function createRl8cRootFixture(client: PoolClient, suffix: string, overrides: Partial<{ membershipState: string; membershipRole: string; tenantId: string; principalId: string; tenantMembershipId: string; runInputHashHex: string; resultHashHex: string; reuseAuthority: boolean }> = {}): Promise<Rl8cAuthorityFixture> {
  return seedRl8RootAuthorityFixture(client, suffix, overrides);
}

async function createSameAuthorityInvestigationFixture(client: PoolClient, suffix: string, authority: Pick<Rl8cAuthorityFixture, "tenantId" | "principalId" | "tenantMembershipId">, overrides: Partial<{ runInputHashHex: string; resultHashHex: string }> = {}): Promise<Rl8cAuthorityFixture> {
  return seedRl8RootAuthorityFixture(client, suffix, { ...authority, ...overrides, reuseAuthority: true });
}

async function insertCurrentProtocolIdentity(client: PoolClient, fixture: Rl8cAuthorityFixture): Promise<string> {
  await setRl8Context(client, fixture, "RESEARCH_SCIENTIFIC_PROMOTION_PROTOCOL_CREATE_V1");
  await client.query("set local role investing_rl8_writer");
  await client.query(`
    insert into investing.research_scientific_promotion_protocols_scientific_identities (
      research_scientific_promotion_protocol_identity_id, operation, capability, operation_scope, source_context,
      hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload
    ) values ($1,'RESEARCH_SCIENTIFIC_PROMOTION_PROTOCOL_CREATE_V1','RESEARCH_MUTATE','TENANT_SCOPE','PURE_RESEARCH','SHA-256',$2,'SYNTRAKE_SHA256_V1',$3,$4::jsonb)
  `, [fixture.protocolIdentityId, scientificPromotionProtocolDomainV1, protocolHashRef, JSON.stringify(canonicalScientificPromotionProtocolV1())]);
  return fixture.protocolIdentityId;
}

async function insertRl8cRootTransition(client: PoolClient, fixture: Rl8cAuthorityFixture, transition: ScientificPromotionTransitionV1 = rootTransition()): Promise<string> {
  const transitionIdentity = (await client.query<{ id: string }>("select extensions.gen_random_uuid()::text as id")).rows[0]?.id;
  if (!transitionIdentity) throw new Error("missing transition id");
  const hash = hashScientificPromotionTransitionV1(transition).hashHex;
  await setRl8Context(client, fixture, "RESEARCH_SCIENTIFIC_PROMOTION_ROOT_CREATE_V1");
  await client.query("set local role investing_rl8_writer");
  await client.query(`
    insert into investing.research_scientific_promotion_transitions_scientific_identities (
      research_scientific_promotion_transition_identity_id, operation, capability, operation_scope, source_context, tenant_id, principal_id, tenant_membership_id,
      research_investigation_id, research_experiment_id, research_scientific_promotion_protocol_identity_id, protocol_hash_hex,
      subject_experiment_hash_hex, subject_experiment_parameters_hash_hex, subject_research_ir_hash_hex,
      predecessor_state, resulting_state, transition_hash_algorithm, transition_hash_domain, transition_hash_version, transition_hash_hex,
      run_input_identity_id, run_input_hash_hex, result_identity_id, result_hash_hex, canonical_payload
    ) values ($1,'RESEARCH_SCIENTIFIC_PROMOTION_ROOT_CREATE_V1','RESEARCH_MUTATE','TENANT_SCOPE','PURE_RESEARCH',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'DRAFT_RESEARCH','EXECUTED','SHA-256',$12,'SYNTRAKE_SHA256_V1',$13,$14,$15,$16,$17,$18::jsonb)
  `, [transitionIdentity, fixture.tenantId, fixture.principalId, fixture.tenantMembershipId, fixture.researchInvestigationId, fixture.researchExperimentId, fixture.protocolIdentityId, transition.protocol.hashHex, transition.subject.subjectExperiment.hashHex, transition.subject.subjectExperimentParameters.hashHex, transition.subject.subjectResearchIr.hashHex, scientificPromotionTransitionDomainV1, hash, fixture.runInputIdentityId, transition.evidenceSnapshot.runInput?.hashHex, fixture.resultIdentityId, transition.evidenceSnapshot.result?.hashHex, JSON.stringify(transition)]);
  return transitionIdentity;
}

maybeDescribe("I5 RL-8C1 scientific promotion PostgreSQL 17 executable reconciliation", () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({ connectionString, max: 1 });
    const client = await pool.connect();
    try {
      await resetReconciliationDatabase(client);
      for (const migration of migrations) await applyMigration(client, migration);
    } finally {
      client.release();
    }
  }, 180_000);

  afterAll(async () => {
    await pool?.end();
  });

  it("replays the complete authoritative post-Genesis chain through RL-8C1", async () => {
    expect(migrations.at(-1)).toBe(path.join("supabase", "migrations", migrationName));
    const client = await pool.connect();
    try {
      const tables = await client.query<{ relname: string; owner: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(`
        select c.relname, pg_get_userbyid(c.relowner) as owner, c.relrowsecurity, c.relforcerowsecurity
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname='investing' and c.relname in ('research_scientific_promotion_protocols_scientific_identities','research_scientific_promotion_transitions_scientific_identities')
        order by c.relname
      `);
      expect(tables.rows).toEqual([
        { relname: "research_scientific_promotion_protocols_scientific_identities", owner: "investing_owner", relrowsecurity: true, relforcerowsecurity: true },
        { relname: "research_scientific_promotion_transitions_scientific_identities", owner: "investing_owner", relrowsecurity: true, relforcerowsecurity: true },
      ]);

      const writer = await client.query<{ rolcanlogin: boolean; rolinherit: boolean; rolbypassrls: boolean }>("select rolcanlogin, rolinherit, rolbypassrls from pg_roles where rolname='investing_rl8_writer'");
      expect(writer.rows[0]).toEqual({ rolcanlogin: false, rolinherit: false, rolbypassrls: false });

      const privileges = await client.query<{ ok: boolean }>(`
        select has_schema_privilege('investing_rl8_writer','extensions','USAGE')
          and has_function_privilege('investing_rl8_writer','investing.rl8c_jsonb_has_number_v1(jsonb)','EXECUTE')
          and has_function_privilege('investing_rl8_writer','investing.rl8c_canonical_jsonb_v1(jsonb)','EXECUTE')
          and has_function_privilege('investing_rl8_writer','investing.rl8c_sha256_hex_v1(text,jsonb)','EXECUTE')
          and has_function_privilege('investing_rl8_writer','investing.rl8c_sorted_unique_hashrefs_v1(jsonb)','EXECUTE') as ok
      `);
      expect(privileges.rows[0]?.ok).toBe(true);

      const forbiddenWriters = await client.query<{ count: string }>("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='investing' and p.proname like 'persist_research_scientific_promotion%'");
      expect(forbiddenWriters.rows[0]?.count).toBe("0");

      const policies = await client.query<{ policyname: string; qual: string | null }>("select policyname, qual from pg_policies where schemaname='investing' and policyname like '%rl8c_writer_select' order by policyname");
      expect(policies.rows.length).toBeGreaterThanOrEqual(14);
      expect(policies.rows.every((policy) => policy.qual?.includes("RESEARCH_SCIENTIFIC_PROMOTION_"))).toBe(true);

      const catalogObjects = await client.query<{ name: string }>(`
        select conname as name
        from pg_constraint c join pg_namespace n on n.oid = c.connamespace
        where n.nspname = 'investing'
        union
        select c.relname as name
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'investing' and c.relkind in ('i', 'I')
      `);
      const catalogNames = catalogObjects.rows.map((row) => row.name);
      expect(catalogNames).toEqual(expect.arrayContaining([
        "rl8c_sp_transitions_validation_protocol_fk",
        "rl8c_sp_transitions_validation_assessment_protocol_fk",
        "rl8c_sp_transitions_validation_assessment_result_fk",
        "rl8c_sp_transitions_robustness_protocol_fk",
        "rl8c_sp_transitions_cross_chain_target_key",
        "rl8c_validation_assessment_protocols_authority_hash_key",
        "rl8c_experiment_comparison_protocols_authority_hash_key",
      ]));
      for (const staleName of [
        "research_scientific_promotion_transitions_validation_protocol_fk",
        "research_scientific_promotion_transitions_validation_assessment_protocol_fk",
        "research_scientific_promotion_transitions_validation_assessment_result_fk",
        "research_scientific_promotion_transitions_robustness_protocol_fk",
        "research_scientific_promotion_transitions_rl8c_cross_chain_target_key",
        "research_validation_assessment_protocols_rl8c_authority_hash_key",
        "research_experiment_comparison_protocols_rl8c_authority_hash_key",
        "research_scientific_promotion_transitions_validation_assessment",
      ]) expect(catalogNames).not.toContain(staleName);
    } finally {
      client.release();
    }
  }, 60_000);

  it("executes SQL canonical protocol/root golden parity", async () => {
    const client = await pool.connect();
    try {
      const protocol = canonicalScientificPromotionProtocolV1();
      const protocolSql = await sqlCanonicalAndHash(client, protocol, scientificPromotionProtocolDomainV1);
      expect(protocolSql.canonical).toBe(canonicalScientificPromotionProtocolBytesV1().toString("utf8"));
      expect(protocolSql.canonicalSha).toBe(protocolCanonicalBytesSha256);
      expect(sha256Hex(canonicalScientificPromotionProtocolBytesV1())).toBe(protocolCanonicalBytesSha256);
      expect(protocolSql.hashref).toBe(protocolHashRef);
      expect(hashScientificPromotionProtocolV1().hashHex).toBe(protocolHashRef);

      const root = rootTransition();
      const rootSql = await sqlCanonicalAndHash(client, root as unknown as CanonicalJsonValue, scientificPromotionTransitionDomainV1);
      expect(rootSql.canonical).toBe(canonicalScientificPromotionTransitionBytesV1(root).toString("utf8"));
      expect(rootSql.canonicalSha).toBe(rootCanonicalBytesSha256);
      expect(sha256Hex(canonicalScientificPromotionTransitionBytesV1(root))).toBe(rootCanonicalBytesSha256);
      expect(rootSql.hashref).toBe(rootHashRef);
      expect(hashScientificPromotionTransitionV1(root).hashHex).toBe(rootHashRef);
    } finally {
      client.release();
    }
  }, 60_000);

  it("executes canonical Unicode/control-character parity", async () => {
    const client = await pool.connect();
    try {
      const fixture: CanonicalJsonValue = {
        "\u00E1": "non-ASCII value \u00E9",
        a: "prefix key",
        "\uD83D\uDE00": "astral Unicode scalar \uD83D\uDE00",
        quote: "\"",
        backslash: "\\",
        backspace: "\b",
        tab: "\t",
        lf: "\n",
        formFeed: "\f",
        cr: "\r",
        controlLow: "\u0001",
        controlHigh: "\u001f",
        slash: "/",
      };
      const sql = await sqlCanonicalAndHash(client, fixture, "SYNTRAKE:SCIENTIFIC_PROMOTION_TRANSITION:V1");
      expect(sql.canonical).toBe(i5ResearchInternalCanonicalJsonBytesV1(fixture).toString("utf8"));
      expect(sql.canonical).toContain("/");
      expect(sql.canonical).toContain("\\u0001");
      expect(sql.canonical).toContain("\\u001f");
    } finally {
      client.release();
    }
  }, 60_000);

  it("recovers the surrounding transaction after expected PostgreSQL failures", async () => {
    const client = await pool.connect();
    try {
      await withTransaction(client, async () => {
        await expectPgRejection(client, () => client.query("select 1 / 0 as invalid_division"));
        const firstRecovery = await client.query<{ ok: number }>("select 1 as ok");
        expect(firstRecovery.rows[0]?.ok).toBe(1);
        await expectPgRejection(client, () => client.query("select 1 / 0 as invalid_division_again"));
        const secondRecovery = await client.query<{ ok: number }>("select 1 as ok");
        expect(secondRecovery.rows[0]?.ok).toBe(1);
      });
    } finally {
      client.release();
    }
  }, 60_000);


  it("executes canonical HashRef evidence sorting and gate evidence rejection cases", async () => {
    const client = await pool.connect();
    try {
      const refs = [result, runInput, result, null];
      const sorted = await client.query<{ value: string }>("select investing.rl8c_sorted_unique_hashrefs_v1($1::jsonb)::text as value", [JSON.stringify(refs)]);
      expect(JSON.parse(sorted.rows[0]?.value ?? "[]")).toEqual(canonicalSortRefs(refs));
      expect(JSON.parse(sorted.rows[0]?.value ?? "[]")).toEqual(gateEvidenceForScientificPromotionV1({
        protocol: hashScientificPromotionProtocolV1(),
        subject,
        evidenceSnapshot: fullSnapshot(),
        gateId: "GATE_ACCEPTED_EXECUTION_RESULT",
      }));

      const validStageA = stageATransition();
      const validBinding = await client.query<{ ok: boolean }>("select investing.rl8c_gate_evidence_binding_valid_v1($1::jsonb) as ok", [JSON.stringify(validStageA)]);
      expect(validBinding.rows[0]?.ok).toBe(true);

      const wrongOrder = stageATransition({ gateOutcomes: passingGateOutcomes().map((gate) => gate.gateId === "GATE_ACCEPTED_EXECUTION_RESULT" ? { ...gate, evidence: [runInput, result] } : gate) });
      const duplicate = stageATransition({ gateOutcomes: passingGateOutcomes().map((gate) => gate.gateId === "GATE_ACCEPTED_EXECUTION_RESULT" ? { ...gate, evidence: [...gate.evidence, result] } : gate) });
      const extra = stageATransition({ gateOutcomes: passingGateOutcomes().map((gate) => gate.gateId === "GATE_ACCEPTED_EXECUTION_RESULT" ? { ...gate, evidence: [...gate.evidence, evidenceObject] } : gate) });
      const missing = stageATransition({ gateOutcomes: passingGateOutcomes().map((gate) => gate.gateId === "GATE_ACCEPTED_EXECUTION_RESULT" ? { ...gate, evidence: [result] } : gate) });
      for (const invalid of [wrongOrder, duplicate, extra, missing]) {
        const invalidBinding = await client.query<{ ok: boolean }>("select investing.rl8c_gate_evidence_binding_valid_v1($1::jsonb) as ok", [JSON.stringify(invalid)]);
        expect(invalidBinding.rows[0]?.ok).toBe(false);
      }
    } finally {
      client.release();
    }
  }, 60_000);

  it("executes transition structural root and negative payload assertions", async () => {
    const client = await pool.connect();
    try {
      expect(await validateTransitionPayload(client, rootTransition())).toBe(true);
      expect(await validateTransitionPayload(client, rootTransition({ evidenceSnapshot: { ...rootTransition().evidenceSnapshot, result: null } }))).toBe(false);
      expect(await validateTransitionPayload(client, rootTransition({ evidenceSnapshot: { ...rootTransition().evidenceSnapshot, evidenceObject } }))).toBe(false);
      expect(await validateTransitionPayload(client, rootTransition({ gateOutcomes: passingGateOutcomes() }))).toBe(false);
      expect(await validateTransitionPayload(client, stageATransition())).toBe(true);
      expect(await validateTransitionPayload(client, stageATransition({ gateOutcomes: passingGateOutcomes().slice(1) }))).toBe(false);
      expect(await validateTransitionPayload(client, stageATransition({ gateOutcomes: [{ ...passingGateOutcomes()[0], gateId: "UNKNOWN_GATE" as never }, ...passingGateOutcomes().slice(1)] }))).toBe(false);
      expect(await validateTransitionPayload(client, stageATransition({ gateOutcomes: [{ ...passingGateOutcomes()[0], status: "UNKNOWN" as never }, ...passingGateOutcomes().slice(1)] }))).toBe(false);
    } finally {
      client.release();
    }
  }, 60_000);


  it("executes actual ROOT table INSERT with RLS, CHECKs, FKs, protocol FK, subject FK, provenance FKs, hash check, and INSERT grant", async () => {
    const client = await pool.connect();
    try {
      await withTransaction(client, async () => {
        const fixture = await createRl8cRootFixture(client, "root-insert");
        await insertCurrentProtocolIdentity(client, fixture);
        const transitionIdentity = await insertRl8cRootTransition(client, fixture);
        const persisted = await client.query<{ count: string; run_input_hash_hex: string; result_hash_hex: string }>(`
          select count(*)::text as count, max(run_input_hash_hex) as run_input_hash_hex, max(result_hash_hex) as result_hash_hex
          from investing.research_scientific_promotion_transitions_scientific_identities
          where research_scientific_promotion_transition_identity_id = $1
        `, [transitionIdentity]);
        expect(persisted.rows[0]).toEqual({ count: "1", run_input_hash_hex: runInput.hashHex, result_hash_hex: result.hashHex });
      });
    } finally {
      client.release();
    }
  }, 60_000);

  it("executes actual table structural negatives", async () => {
    const client = await pool.connect();
    try {
      await withTransaction(client, async () => {
        const fixture = await createRl8cRootFixture(client, "structural-negatives");
        await insertCurrentProtocolIdentity(client, fixture);
        await expectPgRejection(client, () => insertRl8cRootTransition(client, fixture, rootTransition({ evidenceSnapshot: { ...rootTransition().evidenceSnapshot, result: null } })));
        await expectPgRejection(client, () => insertRl8cRootTransition(client, fixture, rootTransition({ evidenceSnapshot: { ...rootTransition().evidenceSnapshot, evidenceObject } })));
        await expectPgRejection(client, () => insertRl8cRootTransition(client, fixture, rootTransition({ gateOutcomes: passingGateOutcomes() })));
        await setRl8Context(client, fixture, "RESEARCH_SCIENTIFIC_PROMOTION_ROOT_CREATE_V1");
        await client.query("set local role investing_rl8_writer");
        await expectPgRejection(client, () => client.query("insert into investing.research_scientific_promotion_transitions_scientific_identities (research_scientific_promotion_transition_identity_id, operation, capability, operation_scope, source_context, tenant_id, principal_id, tenant_membership_id, research_investigation_id, research_experiment_id, research_scientific_promotion_protocol_identity_id, protocol_hash_hex, subject_experiment_hash_hex, subject_experiment_parameters_hash_hex, subject_research_ir_hash_hex, predecessor_state, resulting_state, transition_hash_algorithm, transition_hash_domain, transition_hash_version, transition_hash_hex, run_input_identity_id, run_input_hash_hex, result_identity_id, result_hash_hex, canonical_payload) values (extensions.gen_random_uuid(),'RESEARCH_SCIENTIFIC_PROMOTION_ROOT_CREATE_V1','RESEARCH_MUTATE','TENANT_SCOPE','PURE_RESEARCH',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'DRAFT_RESEARCH','EXECUTED','SHA-256',$11,'SYNTRAKE_SHA256_V1',$12,$13,null,$14,$15,$16::jsonb)", [fixture.tenantId, fixture.principalId, fixture.tenantMembershipId, fixture.researchInvestigationId, fixture.researchExperimentId, fixture.protocolIdentityId, protocolHashRef, experiment.hashHex, experimentParameters.hashHex, researchIr.hashHex, scientificPromotionTransitionDomainV1, rootHashRef, fixture.runInputIdentityId, fixture.resultIdentityId, result.hashHex, JSON.stringify(rootTransition())]));
        const wrongDomain = await client.query<{ ok: boolean }>("select investing.rl8c_hashref_matches_v1($1::jsonb, 'SYNTRAKE:RUN_INPUT:V1', $2) as ok", [JSON.stringify(ref("SYNTRAKE:RESULT:V1", "1")), runInput.hashHex]);
        expect(wrongDomain.rows[0]?.ok).toBe(false);
      });
    } finally {
      client.release();
    }
  }, 60_000);

  it("executes actual authority/RLS matrix and operation-boundary negative", async () => {
    const client = await pool.connect();
    try {
      await withTransaction(client, async () => {
        const valid = await createRl8cRootFixture(client, "authority-valid");
        await setRl8Context(client, valid);
        await client.query("set local role investing_rl8_writer");
        expect((await client.query("select count(*)::int as count from investing.tenant_memberships")).rows[0]?.count).toBe(1);
        for (const [key, value] of [["tenant_id", "00000000-0000-0000-0000-000000000001"], ["principal_id", "00000000-0000-0000-0000-000000000002"], ["tenant_membership_id", "00000000-0000-0000-0000-000000000003"]]) {
          await client.query("reset role");
          await setRl8Context(client, { ...valid, tenantId: key === "tenant_id" ? value : valid.tenantId, principalId: key === "principal_id" ? value : valid.principalId, tenantMembershipId: key === "tenant_membership_id" ? value : valid.tenantMembershipId });
          await client.query("set local role investing_rl8_writer");
          expect((await client.query("select count(*)::int as count from investing.tenant_memberships")).rows[0]?.count).toBe(0);
        }
        await client.query("reset role");
        await setRl8Context(client, { ...valid, researchInvestigationId: "00000000-0000-0000-0000-000000000004" });
        await client.query("set local role investing_rl8_writer");
        expect((await client.query("select count(*)::int as count from investing.tenant_memberships")).rows[0]?.count).toBe(1);
        expect((await client.query("select count(*)::int as count from investing.research_investigations")).rows[0]?.count).toBe(0);
        await client.query("reset role");
        const revoked = await createRl8cRootFixture(client, "authority-revoked", { membershipState: "REVOKED" });
        await setRl8Context(client, revoked);
        await client.query("set local role investing_rl8_writer");
        expect((await client.query("select count(*)::int as count from investing.tenant_memberships")).rows[0]?.count).toBe(0);
        await client.query("reset role");
        await expectPgRejection(client, () => createRl8cRootFixture(client, "authority-non-owner", { membershipRole: "VIEWER" }), /tenant_memberships_role_check|violates check constraint/i);
        const nonOwnerRecovery = await client.query<{ ok: number }>("select 1 as ok");
        expect(nonOwnerRecovery.rows[0]?.ok).toBe(1);
        await client.query("reset role");
        await setRl8Context(client, valid, "RESEARCH_EXECUTION_RUN_V1");
        await client.query("set local role investing_rl8_writer");
        expect((await client.query("select count(*)::int as count from investing.run_inputs_scientific_identities")).rows[0]?.count).toBe(0);
      });
    } finally {
      client.release();
    }
  }, 60_000);

  it("executes actual cross-Investigation provenance RLS", async () => {
    const client = await pool.connect();
    try {
      await withTransaction(client, async () => {
        const investigationA = await createRl8cRootFixture(client, "cross-investigation-a");
        const investigationB = await createSameAuthorityInvestigationFixture(client, "cross-investigation-b", {
          tenantId: investigationA.tenantId,
          principalId: investigationA.principalId,
          tenantMembershipId: investigationA.tenantMembershipId,
        }, { runInputHashHex: fixtureHash("cross-investigation-b:run-input"), resultHashHex: fixtureHash("cross-investigation-b:result") });
        await setRl8Context(client, investigationA);
        await client.query("set local role investing_rl8_writer");
        expect((await client.query("select count(*)::int as count from investing.research_investigations")).rows[0]?.count).toBe(1);
        const visibleResultB = await client.query<{ count: number }>("select count(*)::int as count from investing.research_results_scientific_identities where result_identity_id=$1", [investigationB.resultIdentityId]);
        expect(visibleResultB.rows[0]?.count).toBe(0);
        const visibleEvidenceB = await client.query<{ count: number }>("select count(*)::int as count from investing.research_evidence_objects_scientific_identities where evidence_identity_id=$1", [investigationB.evidenceObjectIdentityId]);
        expect(visibleEvidenceB.rows[0]?.count).toBe(0);
      });
    } finally {
      client.release();
    }
  }, 60_000);

  it("executes investing_app, anon, authenticated mutation denial and service_role grant absence", async () => {
    const client = await pool.connect();
    try {
      await withTransaction(client, async () => {
        for (const role of ["investing_app", "anon", "authenticated"]) {
          await client.query("reset role");
          await client.query(`set local role ${role}`);
          await expectPgRejection(client, () => client.query("insert into investing.research_scientific_promotion_protocols_scientific_identities (research_scientific_promotion_protocol_identity_id, operation, capability, operation_scope, source_context, hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload) values ($1::uuid,'RESEARCH_SCIENTIFIC_PROMOTION_PROTOCOL_CREATE_V1','RESEARCH_MUTATE','TENANT_SCOPE','PURE_RESEARCH','SHA-256',$2,'SYNTRAKE_SHA256_V1',$3,$4::jsonb)", ["00000000-0000-4000-8000-00000000c001", scientificPromotionProtocolDomainV1, protocolHashRef, JSON.stringify(canonicalScientificPromotionProtocolV1())]));
          await expectPgRejection(client, () => client.query("update investing.research_scientific_promotion_protocols_scientific_identities set hash_hex=hash_hex"));
          await expectPgRejection(client, () => client.query("delete from investing.research_scientific_promotion_protocols_scientific_identities"));
        }
        await client.query("reset role");
        const serviceRole = await client.query<{ table_insert: boolean; function_execute: boolean }>("select has_table_privilege('service_role','investing.research_scientific_promotion_protocols_scientific_identities','INSERT') as table_insert, has_function_privilege('service_role','investing.rl8c_sha256_hex_v1(text,jsonb)','EXECUTE') as function_execute");
        expect(serviceRole.rows[0]).toEqual({ table_insert: false, function_execute: false });
      });
    } finally {
      client.release();
    }
  }, 60_000);

  it("executes append-only trigger and cross-scope identical hash", async () => {
    const client = await pool.connect();
    try {
      await withTransaction(client, async () => {
        const left = await createRl8cRootFixture(client, "same-hash-left");
        const right = await createRl8cRootFixture(client, "same-hash-right");
        const sharedProtocolIdentityId = await insertCurrentProtocolIdentity(client, left);
        right.protocolIdentityId = sharedProtocolIdentityId;
        await client.query("reset role");
        const leftTransition = await insertRl8cRootTransition(client, left);
        await client.query("reset role");
        const rightTransition = await insertRl8cRootTransition(client, right);
        expect(leftTransition).not.toBe(rightTransition);
        const sameHashRows = await client.query<{ transition_hash_hex: string; count: number }>("select transition_hash_hex, count(*)::int as count from investing.research_scientific_promotion_transitions_scientific_identities where research_scientific_promotion_transition_identity_id = any($1::uuid[]) group by transition_hash_hex", [[leftTransition, rightTransition]]);
        expect(sameHashRows.rows).toEqual([{ transition_hash_hex: rootHashRef, count: 2 }]);
        await setRl8Context(client, left);
        await client.query("set local role investing_rl8_writer");
        await expectPgRejection(client, () => client.query("update investing.research_scientific_promotion_transitions_scientific_identities set canonical_payload=canonical_payload where research_scientific_promotion_transition_identity_id=$1", [leftTransition]));
        await expectPgRejection(client, () => client.query("delete from investing.research_scientific_promotion_transitions_scientific_identities where research_scientific_promotion_transition_identity_id=$1", [leftTransition]));
        await client.query("reset role");
        await expectPgRejection(client, () => client.query("update investing.research_scientific_promotion_transitions_scientific_identities set canonical_payload=canonical_payload where research_scientific_promotion_transition_identity_id=$1", [leftTransition]), /append-only/i);
        await expectPgRejection(client, () => client.query("delete from investing.research_scientific_promotion_transitions_scientific_identities where research_scientific_promotion_transition_identity_id=$1", [leftTransition]), /append-only/i);
      });
    } finally {
      client.release();
    }
  }, 60_000);
});
