import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  canonicalSha256HexV1,
  i5ResearchInternalCanonicalJsonBytesV1,
  sha256HexV1,
  type CanonicalJsonValue,
  type HashDomainV1,
  type HashRefV1,
} from "../lib/investing/research/canonical";
import {
  canonicalScientificPromotionProtocolV1,
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
const migrationName = "20261007143000_investing_i5_rl8c3_scientific_promotion_supersession_writer.sql";
const migrationPath = path.join(repoRoot, "supabase", "migrations", migrationName);
const migrationSql = fs.readFileSync(migrationPath, "utf8");
const normalized = migrationSql.toLowerCase().replace(/\s+/g, " ");
const connectionString = process.env.PG17_RECONCILIATION_URL ?? "";
const maybeDescribe = connectionString ? describe : describe.skip;

const protocolHashRef = hashScientificPromotionProtocolV1().hashHex;

const replayMigrations = fs
  .readdirSync(path.join(repoRoot, "supabase", "migrations"))
  .filter((name) => name.endsWith(".sql") && name >= "20260825120000_investing_genesis_i2_authority_materialization.sql" && name <= migrationName)
  .sort();

async function applyMigration(pool: Pool, name: string): Promise<void> {
  const sql = fs.readFileSync(path.join(repoRoot, "supabase", "migrations", name), "utf8");
  try {
    await pool.query(sql);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`PG17 RL-8C3 migration replay failed for ${name}: ${message}`);
  }
}

describe("I5 RL-8C3 scientific promotion supersession static contract", () => {
  it("creates exactly the narrow supersession writer surface", () => {
    expect(normalized).toContain("create or replace function investing.persist_research_scientific_promotion_supersession_v1(");
    expect(normalized).toContain("create or replace function investing.reconstruct_research_scientific_promotion_chain_v1(");
    expect(normalized).toContain("p_predecessor_transition_identity_id uuid");
    expect(normalized).toContain("p_transition_hash_hex text");
    expect(normalized).toContain("p_canonical_payload jsonb");
    expect(normalized).toContain("security definer");
    expect(normalized).toContain("set search_path = pg_catalog");
    expect(normalized).toContain("alter function investing.persist_research_scientific_promotion_supersession_v1(uuid, text, jsonb) owner to investing_rl8_writer");
    expect(normalized).toContain("grant execute on function investing.persist_research_scientific_promotion_supersession_v1(uuid, text, jsonb) to investing_app");
    expect(normalized).toContain("grant execute on function investing.reconstruct_research_scientific_promotion_chain_v1(uuid) to investing_app");
    expect(normalized).toContain("revoke all on function investing.persist_research_scientific_promotion_supersession_v1(uuid, text, jsonb) from public, anon, authenticated, service_role");
  });

  it("preserves security, RLS, append-only, and scientific domain boundaries", () => {
    expect(normalized).not.toContain("alter role investing_rl8_writer bypassrls");
    expect(normalized).not.toContain("create role investing_rl8_writer bypassrls");
    expect(normalized).not.toContain("grant investing_rl8_writer to investing_app");
    expect(normalized).not.toContain("grant investing_rl8_writer to service_role");
    expect(normalized).not.toContain("alter table investing.research_scientific_promotion_transitions_scientific_identities disable row level security");
    expect(normalized).not.toContain("update investing.research_scientific_promotion_transitions_scientific_identities");
    expect(normalized).not.toContain("delete from investing.research_scientific_promotion_transitions_scientific_identities");
    expect(normalized).not.toContain("paper");
    expect(normalized).not.toContain("live");
    expect(normalized).not.toContain("recommendation");
    expect(normalized).not.toContain("max(created_at");
    expect(normalized).not.toContain("order by created_at");
    expect(normalized).not.toContain("limit 1");
    expect(normalized).not.toContain("latest");
    expect(normalized).not.toContain("current pointer");
    expect(normalized).toContain("successorprotocol");
    expect(normalized.match(/syntrake:scientific_promotion_transition:v1/g)?.length ?? 0).toBeGreaterThan(0);
    expect(normalized).not.toContain("syntrake:scientific_promotion_supersession");
    expect(normalized).not.toContain("syntrake:scientific_promotion_lifecycle");
  });

  it("freezes supersession lifecycle protections", () => {
    for (const required of [
      "RESEARCH_SCIENTIFIC_PROMOTION_SUPERSESSION_PERSIST_V1",
      "SUPERSEDED",
      "SUPERSEDED_EVIDENCE",
      "DIVERGENT_EXISTING_IDENTITY",
      "REUSED_IDENTICAL",
      "WRONG_SUCCESSOR_PROTOCOL",
      "WRONG_SUCCESSOR_ROOT",
      "SUPERSESSION_CYCLE",
      "RL8C_PROTOCOL:",
      "RL8C_ROOT:",
      "RL8C_SUCCESSOR:",
      "RL8C_SUPERSEDE:",
      "v_predecessor.resulting_state not in ('EXECUTED','INSUFFICIENT_EVIDENCE','PROMOTION_ELIGIBLE','REJECTED')".toLowerCase(),
      "v_successor_protocol_hash = v_predecessor.protocol_hash_hex",
      "v_successor_root.predecessor_transition_identity_id is not null",
      "p_canonical_payload->'evidenceSnapshot' <> v_predecessor.canonical_payload->'evidenceSnapshot'".toLowerCase(),
      "p_canonical_payload->'gateOutcomes' <> v_predecessor.canonical_payload->'gateOutcomes'".toLowerCase(),
      "where predecessor_transition_identity_id = v_predecessor.research_scientific_promotion_transition_identity_id",
      "reconstruct_research_scientific_promotion_chain_v1",
      "MULTIPLE_SUCCESSORS",
      "ORPHAN_INTERMEDIATE_LEAF",
      "DANGLING_SUPERSESSION",
      "crossChainHops",
    ]) expect(normalized).toContain(required.toLowerCase());

    const protocolLock = normalized.indexOf("rl8c_protocol:");
    const rootLock = normalized.indexOf("rl8c_root:");
    const successorLock = normalized.indexOf("rl8c_successor:");
    const supersedeLock = normalized.indexOf("rl8c_supersede:");
    expect(protocolLock).toBeGreaterThanOrEqual(0);
    expect(rootLock).toBeGreaterThan(protocolLock);
    expect(successorLock).toBeGreaterThan(rootLock);
    expect(supersedeLock).toBeGreaterThan(successorLock);
  });

  it("installs independent database supersession integrity enforcement", () => {
    for (const required of [
      "create or replace function investing.rl8c_validate_supersession_integrity_v1()",
      "create constraint trigger research_scientific_promotion_supersession_integrity",
      "deferrable initially deferred",
      "for each row execute function investing.rl8c_validate_supersession_integrity_v1()",
      "alter function investing.rl8c_validate_supersession_integrity_v1() owner to investing_rl8_writer",
      "revoke all on function investing.rl8c_validate_supersession_integrity_v1() from public, anon, authenticated, service_role, investing_app",
      "RL-8C3 supersession integrity violation: canonical payload mismatch",
      "RL-8C3 supersession integrity violation: successor root missing",
      "RL-8C3 supersession integrity violation: same protocol",
      "RL-8C3 supersession integrity violation: forbidden predecessor state",
      "RL-8C3 postcondition failed: supersession integrity trigger missing",
      "RL-8C3 postcondition failed: supersession trigger authority mismatch",
    ]) expect(normalized).toContain(required.toLowerCase());
  });
});

describe("I5 RL-8C3 scientific promotion PG17 readiness", () => {
  it("records BLOCKED when PG17_RECONCILIATION_URL is absent", () => {
    expect(connectionString ? "READY - PG17 WILL EXECUTE" : "BLOCKED - PG17 NOT EXECUTED").toMatch(/^(READY - PG17 WILL EXECUTE|BLOCKED - PG17 NOT EXECUTED)$/u);
  });
});

maybeDescribe("I5 RL-8C3 scientific promotion real PG17 migration surface", () => {
  it("replays through RL-8C3 and exposes only the supersession writer to investing_app", async () => {
    const pool = new Pool({ connectionString });
    try {
      await pool.query("drop schema if exists investing cascade");
      await pool.query("drop schema if exists extensions cascade");
      for (const role of ["investing_rl8_writer", "investing_app", "investing_owner"]) {
        await pool.query(`do $$ begin if exists (select 1 from pg_roles where rolname='${role}') then execute 'reassign owned by ${role} to postgres'; execute 'drop owned by ${role}'; execute 'drop role ${role}'; end if; end $$`);
      }
      await pool.query("do $$ begin if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if; if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if; if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if; end $$");
      await pool.query("create schema extensions authorization postgres");
      await pool.query("create extension if not exists pgcrypto with schema extensions");
      for (const migration of replayMigrations) await applyMigration(pool, migration);
      const checks = await pool.query<{ app_execute: boolean; service_execute: boolean; reconstruct_app_execute: boolean; reconstruct_service_execute: boolean; reconstruct_owner_name: string; reconstruct_prosecdef: boolean; reconstruct_search_path_safe: boolean; owner_name: string; prosecdef: boolean; search_path_safe: boolean; force_rls: boolean; successor_index: boolean; supersession_trigger: boolean; supersession_trigger_deferrable: boolean; supersession_trigger_initially_deferred: boolean; trigger_owner_name: string; trigger_prosecdef: boolean; trigger_search_path_safe: boolean }>(`
        select
          has_function_privilege('investing_app','investing.persist_research_scientific_promotion_supersession_v1(uuid,text,jsonb)','EXECUTE') as app_execute,
          has_function_privilege('service_role','investing.persist_research_scientific_promotion_supersession_v1(uuid,text,jsonb)','EXECUTE') as service_execute,
          has_function_privilege('investing_app','investing.reconstruct_research_scientific_promotion_chain_v1(uuid)','EXECUTE') as reconstruct_app_execute,
          has_function_privilege('service_role','investing.reconstruct_research_scientific_promotion_chain_v1(uuid)','EXECUTE') as reconstruct_service_execute,
          pg_catalog.pg_get_userbyid(p.proowner) as owner_name,
          p.prosecdef,
          p.proconfig @> array['search_path=pg_catalog'] as search_path_safe,
          rp.owner_name as reconstruct_owner_name,
          rp.prosecdef as reconstruct_prosecdef,
          rp.search_path_safe as reconstruct_search_path_safe,
          c.relforcerowsecurity as force_rls,
          exists (select 1 from pg_indexes where schemaname='investing' and indexname='research_scientific_promotion_one_successor_per_predecessor') as successor_index,
          exists (select 1 from pg_trigger t join pg_class tc on tc.oid = t.tgrelid join pg_namespace tn on tn.oid = tc.relnamespace where tn.nspname='investing' and tc.relname='research_scientific_promotion_transitions_scientific_identities' and t.tgname='research_scientific_promotion_supersession_integrity') as supersession_trigger,
          exists (select 1 from pg_trigger t join pg_class tc on tc.oid = t.tgrelid join pg_namespace tn on tn.oid = tc.relnamespace where tn.nspname='investing' and tc.relname='research_scientific_promotion_transitions_scientific_identities' and t.tgname='research_scientific_promotion_supersession_integrity' and t.tgdeferrable) as supersession_trigger_deferrable,
          exists (select 1 from pg_trigger t join pg_class tc on tc.oid = t.tgrelid join pg_namespace tn on tn.oid = tc.relnamespace where tn.nspname='investing' and tc.relname='research_scientific_promotion_transitions_scientific_identities' and t.tgname='research_scientific_promotion_supersession_integrity' and t.tginitdeferred) as supersession_trigger_initially_deferred,
          tp.owner_name as trigger_owner_name,
          tp.prosecdef as trigger_prosecdef,
          tp.search_path_safe as trigger_search_path_safe
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        join lateral (select pg_catalog.pg_get_userbyid(r.proowner) as owner_name, r.prosecdef, r.proconfig @> array['search_path=pg_catalog'] as search_path_safe from pg_proc r join pg_namespace rn on rn.oid = r.pronamespace where rn.nspname='investing' and r.proname='reconstruct_research_scientific_promotion_chain_v1') rp on true
        join lateral (select pg_catalog.pg_get_userbyid(t.proowner) as owner_name, t.prosecdef, t.proconfig @> array['search_path=pg_catalog'] as search_path_safe from pg_proc t join pg_namespace tn on tn.oid = t.pronamespace where tn.nspname='investing' and t.proname='rl8c_validate_supersession_integrity_v1') tp on true
        join pg_class c on c.relname = 'research_scientific_promotion_transitions_scientific_identities'
        join pg_namespace cn on cn.oid = c.relnamespace and cn.nspname = 'investing'
        where n.nspname = 'investing' and p.proname = 'persist_research_scientific_promotion_supersession_v1'
      `);
      expect(checks.rows[0]).toEqual({ app_execute: true, service_execute: false, reconstruct_app_execute: true, reconstruct_service_execute: false, reconstruct_owner_name: "investing_rl8_writer", reconstruct_prosecdef: true, reconstruct_search_path_safe: true, owner_name: "investing_rl8_writer", prosecdef: true, search_path_safe: true, force_rls: true, successor_index: true, supersession_trigger: true, supersession_trigger_deferrable: true, supersession_trigger_initially_deferred: true, trigger_owner_name: "investing_rl8_writer", trigger_prosecdef: true, trigger_search_path_safe: true });
    } finally {
      await pool.end();
    }
  }, 120_000);
});

// RL-8C3 behavioral PG17 fixtures reuse the accepted RL-8C1/C2 fixture conventions.
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
    select $1, $2, null, $3, 'USER_PRINCIPAL', ($3::uuid)::text, $4, null, 'TENANT_SCOPE', 'RESEARCH_INVESTIGATION_CREATE_V1', 'RESEARCH_MUTATE', 'PURE_RESEARCH', $5, idempotency_record_id, $6, $7
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
      ($1,$4,$5,null,$6,'USER_PRINCIPAL',($6::uuid)::text,$7,null,'TENANT_SCOPE','PURE_RESEARCH','DRAFT','RESEARCH_DRAFT_REVISION_CREATE_V1'),
      ($2,$4,$5,null,$6,'USER_PRINCIPAL',($6::uuid)::text,$7,null,'TENANT_SCOPE','PURE_RESEARCH','HYPOTHESIS','RESEARCH_HYPOTHESIS_REVISION_CREATE_V1'),
      ($3,$4,$5,null,$6,'USER_PRINCIPAL',($6::uuid)::text,$7,null,'TENANT_SCOPE','PURE_RESEARCH','RESEARCH_SPEC','RESEARCH_SPEC_REVISION_CREATE_V1')
  `, [draftRoot, hypothesisRoot, specRoot, fixture.researchInvestigationId, fixture.tenantId, fixture.principalId, fixture.tenantMembershipId]);
  await client.query(`
    insert into investing.research_material_revisions (
      material_revision_id, material_root_id, research_investigation_id, tenant_id, account_id, principal_id, actor_kind, actor_id,
      tenant_membership_id, account_access_id, operation_scope, operation, capability, source_context, material_kind, revision_number,
      predecessor_revision_id, payload_schema_version, canonical_payload, material_hash, material_request_hash, idempotency_record_id, idempotency_key, correlation_id
    ) values
      ($1,$2,$5,$6,null,$7,'USER_PRINCIPAL',($7::uuid)::text,$8,null,'TENANT_SCOPE','RESEARCH_DRAFT_REVISION_CREATE_V1','RESEARCH_MUTATE','PURE_RESEARCH','DRAFT',1,null,'RESEARCH_DRAFT_HASH_PAYLOAD_V1','{"schemaVersion":"RESEARCH_DRAFT_HASH_PAYLOAD_V1"}'::jsonb,$9,$9,(select idempotency_record_id from investing.idempotency_records where idempotency_key=$11),$11,$12),
      ($3,$4,$5,$6,null,$7,'USER_PRINCIPAL',($7::uuid)::text,$8,null,'TENANT_SCOPE','RESEARCH_HYPOTHESIS_REVISION_CREATE_V1','RESEARCH_MUTATE','PURE_RESEARCH','HYPOTHESIS',1,null,'HYPOTHESIS_HASH_PAYLOAD_V1','{"schemaVersion":"HYPOTHESIS_HASH_PAYLOAD_V1"}'::jsonb,$10,$10,(select idempotency_record_id from investing.idempotency_records where idempotency_key=$13),$13,$14)
  `, [draftRevision, draftRoot, hypothesisRevision, hypothesisRoot, fixture.researchInvestigationId, fixture.tenantId, fixture.principalId, fixture.tenantMembershipId, draftHash, hypothesisHash, `rl8c1-${suffix}-draft-idem`, `rl8c1-${suffix}-draft-corr`, `rl8c1-${suffix}-hypothesis-idem`, `rl8c1-${suffix}-hypothesis-corr`]);
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
    ) values ($1,$2,$3,$4,null,$5,'USER_PRINCIPAL',($5::uuid)::text,$6,null,'TENANT_SCOPE','PURE_RESEARCH','RESEARCH_SPEC_REVISION_CREATE_V1','RESEARCH_MUTATE',1,null,$7,$8,$9,$10,'RESEARCH_SPEC_CANDIDATE_V1','CANDIDATE_ONLY',$11::jsonb,$12,(select idempotency_record_id from investing.idempotency_records where idempotency_key=$13),$13,$14)
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
      ($1,$3,$4,null,$5,'USER_PRINCIPAL',($5::uuid)::text,$6,null,'TENANT_SCOPE','PURE_RESEARCH','RESEARCH_EXPERIMENT_BASELINE_CREATE_V1','RESEARCH_MUTATE','BASELINE',null,$7,'SHA-256','SYNTRAKE:RESEARCH_IR:V1','SYNTRAKE_SHA256_V1',$10,'SHA-256','SYNTRAKE:EXPERIMENT:V1','SYNTRAKE_SHA256_V1',$11,null,null,null,null,$12,(select idempotency_record_id from investing.idempotency_records where idempotency_key=$13),$13,$14),
      ($2,$3,$4,null,$5,'USER_PRINCIPAL',($5::uuid)::text,$6,null,'TENANT_SCOPE','PURE_RESEARCH','RESEARCH_EXPERIMENT_VARIANT_CREATE_V1','RESEARCH_MUTATE','VARIANT',$1,$7,'SHA-256','SYNTRAKE:RESEARCH_IR:V1','SYNTRAKE_SHA256_V1',$10,'SHA-256','SYNTRAKE:EXPERIMENT:V1','SYNTRAKE_SHA256_V1',$8,'SHA-256','SYNTRAKE:EXPERIMENT_PARAMETERS:V1','SYNTRAKE_SHA256_V1',$9,$15,(select idempotency_record_id from investing.idempotency_records where idempotency_key=$16),$16,$17)
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

async function seedRl8RootAuthorityFixture(client: PoolClient, suffix: string, overrides: Partial<{ membershipState: string; membershipRole: string; tenantId: string; principalId: string; tenantMembershipId: string; runInputHashHex: string; resultHashHex: string; evidenceObjectHashHex: string; reuseAuthority: boolean }> = {}): Promise<Rl8cAuthorityFixture> {
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

function validationAssessmentProtocolPayloadFixture(): CanonicalJsonValue {
  return {
    schemaVersion: "VALIDATION_ASSESSMENT_PROTOCOL_V1",
    assessmentMethodology: "VALIDATION_ASSESSMENT_METHODOLOGY_V20260929",
    validationProtocol,
    subjectExperiment: experiment,
    subjectResearchIr: researchIr,
    metricRegistryVersion: "METRIC_REGISTRY_V20260927",
    criteria: [],
    requiredEvidenceRequirements: [],
    missingEvidenceSemantics: "REQUIRED_EVIDENCE_MISSING_IS_INSUFFICIENT_EVIDENCE_V1",
    aggregationRule: "ALL_REQUIRED_CRITERIA_PASS_V1",
  };
}

function validationAssessmentResultPayloadFixture(): CanonicalJsonValue {
  return {
    schemaVersion: "VALIDATION_ASSESSMENT_RESULT_V1",
    assessmentProtocol: validationAssessmentProtocol,
    validationProtocol,
    validationResult,
    subjectExperiment: experiment,
    subjectResearchIr: researchIr,
    metricRegistryVersion: "METRIC_REGISTRY_V20260927",
    consumedEvidence: [],
    criterionOutcomes: [],
    outcome: "PASS",
  };
}
async function seedFullStageAEvidence(client: PoolClient, fixture: Rl8cAuthorityFixture, suffix: string): Promise<void> {
  const validationProtocolId = (await client.query<{ id: string }>("select extensions.gen_random_uuid()::text as id")).rows[0]!.id;
  const validationResultId = (await client.query<{ id: string }>("select extensions.gen_random_uuid()::text as id")).rows[0]!.id;
  const assessmentProtocolId = (await client.query<{ id: string }>("select extensions.gen_random_uuid()::text as id")).rows[0]!.id;
  const assessmentResultId = (await client.query<{ id: string }>("select extensions.gen_random_uuid()::text as id")).rows[0]!.id;
  const comparisonProtocolId = (await client.query<{ id: string }>("select extensions.gen_random_uuid()::text as id")).rows[0]!.id;
  const comparisonResultId = (await client.query<{ id: string }>("select extensions.gen_random_uuid()::text as id")).rows[0]!.id;
  await client.query(`insert into investing.research_validation_protocols_scientific_identities (research_validation_protocol_identity_id, tenant_id, principal_id, tenant_membership_id, research_investigation_id, research_experiment_id, operation, capability, operation_scope, source_context, hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload) values ($1,$2,$3,$4,$5,$6,'RESEARCH_VALIDATION_PROTOCOL_CREATE_V1','RESEARCH_MUTATE','TENANT_SCOPE','PURE_RESEARCH','SHA-256','SYNTRAKE:VALIDATION_PROTOCOL:V1','SYNTRAKE_SHA256_V1',$7,'{"schemaVersion":"TEST_VALIDATION_PROTOCOL"}'::jsonb)`, [validationProtocolId, fixture.tenantId, fixture.principalId, fixture.tenantMembershipId, fixture.researchInvestigationId, fixture.researchExperimentId, validationProtocol.hashHex]);
  await client.query(`insert into investing.research_validation_results_scientific_identities (research_validation_result_identity_id, tenant_id, principal_id, tenant_membership_id, research_investigation_id, research_validation_protocol_identity_id, research_experiment_id, operation, capability, operation_scope, source_context, hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload) values ($1,$2,$3,$4,$5,$6,$7,'RESEARCH_VALIDATION_RESULT_FINALIZE_V1','RESEARCH_MUTATE','TENANT_SCOPE','PURE_RESEARCH','SHA-256','SYNTRAKE:VALIDATION_RESULT:V1','SYNTRAKE_SHA256_V1',$8,'{"schemaVersion":"TEST_VALIDATION_RESULT"}'::jsonb)`, [validationResultId, fixture.tenantId, fixture.principalId, fixture.tenantMembershipId, fixture.researchInvestigationId, validationProtocolId, fixture.researchExperimentId, validationResult.hashHex]);
  await client.query(`insert into investing.research_validation_assessment_protocols_scientific_identities (research_validation_assessment_protocol_identity_id, tenant_id, principal_id, tenant_membership_id, research_investigation_id, research_validation_protocol_identity_id, research_experiment_id, validation_protocol_hash_hex, subject_experiment_hash_hex, subject_research_ir_hash_hex, metric_registry_version, assessment_methodology, operation, capability, operation_scope, source_context, hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'METRIC_REGISTRY_V20260927','VALIDATION_ASSESSMENT_METHODOLOGY_V20260929','RESEARCH_VALIDATION_ASSESSMENT_PROTOCOL_CREATE_V1','RESEARCH_MUTATE','TENANT_SCOPE','PURE_RESEARCH','SHA-256','SYNTRAKE:VALIDATION_ASSESSMENT_PROTOCOL:V1','SYNTRAKE_SHA256_V1',$11,$12::jsonb)`, [assessmentProtocolId, fixture.tenantId, fixture.principalId, fixture.tenantMembershipId, fixture.researchInvestigationId, validationProtocolId, fixture.researchExperimentId, validationProtocol.hashHex, experiment.hashHex, researchIr.hashHex, validationAssessmentProtocol.hashHex, JSON.stringify(validationAssessmentProtocolPayloadFixture())]);
  await client.query(`insert into investing.research_validation_assessment_results_scientific_identities (research_validation_assessment_result_identity_id, tenant_id, principal_id, tenant_membership_id, research_investigation_id, research_validation_protocol_identity_id, research_experiment_id, research_validation_assessment_protocol_identity_id, research_validation_result_identity_id, assessment_protocol_hash_hex, validation_protocol_hash_hex, validation_result_hash_hex, subject_experiment_hash_hex, subject_research_ir_hash_hex, metric_registry_version, outcome, operation, capability, operation_scope, source_context, hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'METRIC_REGISTRY_V20260927','PASS','RESEARCH_VALIDATION_ASSESSMENT_RESULT_FINALIZE_V1','RESEARCH_MUTATE','TENANT_SCOPE','PURE_RESEARCH','SHA-256','SYNTRAKE:VALIDATION_ASSESSMENT_RESULT:V1','SYNTRAKE_SHA256_V1',$15,$16::jsonb)`, [assessmentResultId, fixture.tenantId, fixture.principalId, fixture.tenantMembershipId, fixture.researchInvestigationId, validationProtocolId, fixture.researchExperimentId, assessmentProtocolId, validationResultId, validationAssessmentProtocol.hashHex, validationProtocol.hashHex, validationResult.hashHex, experiment.hashHex, researchIr.hashHex, validationAssessmentResult.hashHex, JSON.stringify(validationAssessmentResultPayloadFixture())]);
  await client.query(`insert into investing.research_experiment_comparison_protocols_scientific_identities (research_experiment_comparison_protocol_identity_id, tenant_id, principal_id, tenant_membership_id, research_investigation_id, hash_hex, logical_comparison_key, canonical_payload) values ($1,$2,$3,$4,$5,$6,$7,'{"schemaVersion":"TEST_COMPARISON_PROTOCOL"}'::jsonb)`, [comparisonProtocolId, fixture.tenantId, fixture.principalId, fixture.tenantMembershipId, fixture.researchInvestigationId, robustnessComparisonProtocol.hashHex, fixtureHash(`rl8c2:${suffix}:comparison-logical-key`)]);
  await client.query(`insert into investing.research_experiment_comparison_results_scientific_identities (research_experiment_comparison_result_identity_id, tenant_id, principal_id, tenant_membership_id, research_investigation_id, research_experiment_comparison_protocol_identity_id, hash_hex, canonical_payload) values ($1,$2,$3,$4,$5,$6,$7,'{"schemaVersion":"TEST_COMPARISON_RESULT"}'::jsonb)`, [comparisonResultId, fixture.tenantId, fixture.principalId, fixture.tenantMembershipId, fixture.researchInvestigationId, comparisonProtocolId, robustnessComparisonResult.hashHex]);
}

function closureTransition(stageA: ScientificPromotionTransitionV1): ScientificPromotionTransitionV1 {
  return { ...stageA, predecessorState: stageA.resultingState, resultingState: stageA.resultingState === "VALIDATION_PASSED" ? "PROMOTION_ELIGIBLE" : "REJECTED", predecessorTransition: hashScientificPromotionTransitionV1(stageA), transitionReasons: stageA.resultingState === "VALIDATION_PASSED" ? [] : stageA.transitionReasons, rejectedTransition: stageA.resultingState === "VALIDATION_FAILED" ? hashScientificPromotionTransitionV1(stageA) : null };
}
function insufficientStageATransition(): ScientificPromotionTransitionV1 {
  const gates = passingGateOutcomes().map((gate, index) => index === 0 ? { ...gate, status: "INSUFFICIENT_EVIDENCE" as const, reasons: ["INCOMPLETE_VALIDATION" as const] } : gate);
  return stageATransition({ resultingState: "INSUFFICIENT_EVIDENCE", gateOutcomes: gates, transitionReasons: ["INCOMPLETE_VALIDATION"] });
}

function failedStageATransition(): ScientificPromotionTransitionV1 {
  const gates = passingGateOutcomes().map((gate, index) => index === 0 ? { ...gate, status: "FAIL" as const, reasons: ["FAILED_VALIDATION" as const] } : gate);
  return stageATransition({ resultingState: "VALIDATION_FAILED", gateOutcomes: gates, transitionReasons: ["FAILED_VALIDATION"] });
}

async function createWriterReadyRoot(client: PoolClient, suffix: string): Promise<{ fixture: Rl8cAuthorityFixture; rootId: string; rootPayload: ScientificPromotionTransitionV1 }> {
  const fixture = await createRl8cRootFixture(client, suffix);
  await setRl8Context(client, fixture, "RESEARCH_SCIENTIFIC_PROMOTION_PROTOCOL_CREATE_V1");
  await client.query("set local role investing_app");
  const protocol = await client.query<{ result: { researchScientificPromotionProtocolIdentityId: string } }>("select investing.persist_research_scientific_promotion_protocol_v1($1,$2::jsonb) as result", [protocolHashRef, JSON.stringify(canonicalScientificPromotionProtocolV1())]);
  fixture.protocolIdentityId = protocol.rows[0]!.result.researchScientificPromotionProtocolIdentityId;
  await client.query("reset role");
  await setRl8Context(client, fixture, "RESEARCH_SCIENTIFIC_PROMOTION_ROOT_CREATE_V1");
  await client.query("set local role investing_app");
  const rootPayload = rootTransition();
  const root = await client.query<{ result: { researchScientificPromotionTransitionIdentityId: string } }>("select investing.persist_research_scientific_promotion_root_v1($1,$2::jsonb) as result", [hashScientificPromotionTransitionV1(rootPayload).hashHex, JSON.stringify(rootPayload)]);
  await client.query("reset role");
  await seedFullStageAEvidence(client, fixture, suffix);
  return { fixture, rootId: root.rows[0]!.result.researchScientificPromotionTransitionIdentityId, rootPayload };
}

async function createCommittedWriterReadyRoot(client: PoolClient, suffix: string): Promise<{ fixture: Rl8cAuthorityFixture; rootId: string; rootPayload: ScientificPromotionTransitionV1 }> {
  await client.query("begin");
  try {
    const result = await createWriterReadyRoot(client, suffix);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  }
}

type Rl8c3PersistedTransition = {
  research_scientific_promotion_transition_identity_id: string;
  transition_hash_hex: string;
  resulting_state: ScientificPromotionTransitionV1["resultingState"];
  predecessor_state: ScientificPromotionTransitionV1["predecessorState"];
  protocol_hash_hex: string;
  research_scientific_promotion_protocol_identity_id: string;
  canonical_payload: ScientificPromotionTransitionV1;
};

type Rl8c3FutureRoot = {
  protocolIdentityId: string;
  protocolRef: ScientificPromotionTransitionV1["protocol"];
  rootId: string;
  rootRef: NonNullable<ScientificPromotionTransitionV1["predecessorTransition"]>;
  rootPayload: ScientificPromotionTransitionV1;
};

async function resetRl8c3BehaviorDatabase(pool: Pool): Promise<void> {
  await pool.query("drop schema if exists investing cascade");
  await pool.query("drop schema if exists extensions cascade");
  for (const role of ["investing_rl8_writer", "investing_app", "investing_owner"]) {
    await pool.query(`do $$ begin if exists (select 1 from pg_roles where rolname='${role}') then execute 'reassign owned by ${role} to postgres'; execute 'drop owned by ${role}'; execute 'drop role ${role}'; end if; end $$`);
  }
  await pool.query("do $$ begin if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if; if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if; if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if; end $$");
  await pool.query("create schema extensions authorization postgres");
  await pool.query("create extension if not exists pgcrypto with schema extensions");
  for (const migration of replayMigrations) await applyMigration(pool, migration);
}

async function rl8c3Transition(client: PoolClient, id: string): Promise<Rl8c3PersistedTransition> {
  const row = (await client.query<Rl8c3PersistedTransition>("select research_scientific_promotion_transition_identity_id, transition_hash_hex, resulting_state, predecessor_state, protocol_hash_hex, research_scientific_promotion_protocol_identity_id, canonical_payload from investing.research_scientific_promotion_transitions_scientific_identities where research_scientific_promotion_transition_identity_id=$1", [id])).rows[0];
  if (!row) throw new Error(`missing RL-8C3 transition ${id}`);
  return row;
}

async function rl8c3SuccessorCount(client: PoolClient, predecessorId: string): Promise<number> {
  return (await client.query<{ count: number }>("select count(*)::int as count from investing.research_scientific_promotion_transitions_scientific_identities where predecessor_transition_identity_id=$1", [predecessorId])).rows[0]!.count;
}

async function rl8c3SupersededSuccessorCount(client: PoolClient, predecessorId: string): Promise<number> {
  return (await client.query<{ count: number }>("select count(*)::int as count from investing.research_scientific_promotion_transitions_scientific_identities where predecessor_transition_identity_id=$1 and resulting_state='SUPERSEDED'", [predecessorId])).rows[0]!.count;
}

function testOnlyScientificPromotionRef<D extends typeof scientificPromotionProtocolDomainV1 | typeof scientificPromotionTransitionDomainV1>(hashDomain: D, payload: CanonicalJsonValue): { hashAlgorithm: "SHA-256"; hashDomain: D; hashVersion: "SYNTRAKE_SHA256_V1"; hashHex: ReturnType<typeof canonicalSha256HexV1> } {
  return {
    hashAlgorithm: "SHA-256",
    hashDomain,
    hashVersion: "SYNTRAKE_SHA256_V1",
    hashHex: canonicalSha256HexV1(sha256HexV1(Buffer.concat([Buffer.from(`${hashDomain}\n`, "utf8"), i5ResearchInternalCanonicalJsonBytesV1(payload)]))),
  };
}

async function createFutureProtocolRoot(client: PoolClient, fixture: Rl8cAuthorityFixture, suffix: string): Promise<Rl8c3FutureRoot> {
  const protocolIdentityId = (await client.query<{ id: string }>("select extensions.gen_random_uuid()::text as id")).rows[0]!.id;
  const payload = { ...(canonicalScientificPromotionProtocolV1() as unknown as Record<string, CanonicalJsonValue>), protocolId: `SCIENTIFIC_PROMOTION_PROTOCOL_TEST_${suffix}` } as unknown as CanonicalJsonValue;
  const protocolRef = testOnlyScientificPromotionRef(scientificPromotionProtocolDomainV1, payload) as ScientificPromotionTransitionV1["protocol"];
  const dbProtocolHash = (await client.query<{ hash: string }>("select investing.rl8c_sha256_hex_v1($1,$2::jsonb) as hash", [scientificPromotionProtocolDomainV1, JSON.stringify(payload)])).rows[0]!.hash;
  expect(dbProtocolHash).toBe(protocolRef.hashHex);
  await client.query(`insert into investing.research_scientific_promotion_protocols_scientific_identities (research_scientific_promotion_protocol_identity_id, operation, capability, operation_scope, source_context, hash_algorithm, hash_domain, hash_version, hash_hex, canonical_payload) values ($1,'RESEARCH_SCIENTIFIC_PROMOTION_PROTOCOL_CREATE_V1','RESEARCH_MUTATE','TENANT_SCOPE','PURE_RESEARCH','SHA-256',$2,'SYNTRAKE_SHA256_V1',$3,$4::jsonb)`, [protocolIdentityId, scientificPromotionProtocolDomainV1, protocolRef.hashHex, JSON.stringify(payload)]);
  const rootPayload = rootTransition({ protocol: protocolRef });
  const rootRef = testOnlyScientificPromotionRef(scientificPromotionTransitionDomainV1, rootPayload as unknown as CanonicalJsonValue) as Rl8c3FutureRoot["rootRef"];
  const dbRootHash = (await client.query<{ hash: string }>("select investing.rl8c_sha256_hex_v1($1,$2::jsonb) as hash", [scientificPromotionTransitionDomainV1, JSON.stringify(rootPayload)])).rows[0]!.hash;
  expect(dbRootHash).toBe(rootRef.hashHex);
  const rootId = (await client.query<{ id: string }>("select extensions.gen_random_uuid()::text as id")).rows[0]!.id;
  await client.query(`insert into investing.research_scientific_promotion_transitions_scientific_identities (research_scientific_promotion_transition_identity_id, operation, capability, operation_scope, source_context, tenant_id, principal_id, tenant_membership_id, research_investigation_id, research_experiment_id, research_scientific_promotion_protocol_identity_id, protocol_hash_hex, subject_experiment_hash_hex, subject_experiment_parameters_hash_hex, subject_research_ir_hash_hex, predecessor_state, resulting_state, transition_hash_algorithm, transition_hash_domain, transition_hash_version, transition_hash_hex, run_input_identity_id, run_input_hash_hex, result_identity_id, result_hash_hex, canonical_payload) values ($1,'RESEARCH_SCIENTIFIC_PROMOTION_ROOT_CREATE_V1','RESEARCH_MUTATE','TENANT_SCOPE','PURE_RESEARCH',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'DRAFT_RESEARCH','EXECUTED','SHA-256',$12,'SYNTRAKE_SHA256_V1',$13,$14,$15,$16,$17,$18::jsonb)`, [rootId, fixture.tenantId, fixture.principalId, fixture.tenantMembershipId, fixture.researchInvestigationId, fixture.researchExperimentId, protocolIdentityId, protocolRef.hashHex, experiment.hashHex, experimentParameters.hashHex, researchIr.hashHex, scientificPromotionTransitionDomainV1, rootRef.hashHex, fixture.runInputIdentityId, runInput.hashHex, fixture.resultIdentityId, result.hashHex, JSON.stringify(rootPayload)]);
  return { protocolIdentityId, protocolRef, rootId, rootRef, rootPayload };
}

function rl8c3SupersessionPayload(predecessor: Rl8c3PersistedTransition, successor: Rl8c3FutureRoot, overrides: Partial<ScientificPromotionTransitionV1> = {}): ScientificPromotionTransitionV1 {
  const predecessorRef = { hashAlgorithm: "SHA-256", hashDomain: scientificPromotionTransitionDomainV1, hashVersion: "SYNTRAKE_SHA256_V1", hashHex: canonicalSha256HexV1(predecessor.transition_hash_hex) } as NonNullable<ScientificPromotionTransitionV1["predecessorTransition"]>;
  return { ...predecessor.canonical_payload, predecessorTransition: predecessorRef, predecessorState: predecessor.resulting_state, resultingState: "SUPERSEDED", supersedes: predecessorRef, rejectedTransition: null, transitionReasons: ["SUPERSEDED_EVIDENCE"], supersededByChain: { successorProtocol: successor.protocolRef, successorRootTransition: successor.rootRef }, ...overrides };
}

async function hashTransitionFixtureForExplicitProtocol(client: PoolClient, payload: ScientificPromotionTransitionV1): Promise<string> {
  const localHash = testOnlyScientificPromotionRef(scientificPromotionTransitionDomainV1, payload as unknown as CanonicalJsonValue).hashHex;
  const dbHash = (await client.query<{ hash: string }>("select investing.rl8c_sha256_hex_v1($1,$2::jsonb) as hash", [scientificPromotionTransitionDomainV1, JSON.stringify(payload)])).rows[0]!.hash;
  expect(dbHash).toBe(localHash);
  return localHash;
}

async function callRl8c3Supersession(client: PoolClient, fixture: Rl8cAuthorityFixture, predecessorId: string, payload: ScientificPromotionTransitionV1): Promise<{ status: string; researchScientificPromotionTransitionIdentityId?: string; transitionHashHex?: string }> {
  const transitionHash = await hashTransitionFixtureForExplicitProtocol(client, payload);
  await setRl8Context(client, fixture, "RESEARCH_SCIENTIFIC_PROMOTION_SUPERSESSION_PERSIST_V1");
  await client.query("set local role investing_app");
  const response = await client.query<{ result: { status: string; researchScientificPromotionTransitionIdentityId?: string; transitionHashHex?: string } }>("select investing.persist_research_scientific_promotion_supersession_v1($1,$2,$3::jsonb) as result", [predecessorId, transitionHash, JSON.stringify(payload)]);
  await client.query("reset role");
  return response.rows[0]!.result;
}

async function createRl8c3Leaf(client: PoolClient, state: "EXECUTED" | "INSUFFICIENT_EVIDENCE" | "PROMOTION_ELIGIBLE" | "REJECTED" | "VALIDATION_PASSED" | "VALIDATION_FAILED", suffix: string): Promise<{ fixture: Rl8cAuthorityFixture; rootId: string; rootPayload: ScientificPromotionTransitionV1; leafId: string; leaf: Rl8c3PersistedTransition }> {
  const root = await createCommittedWriterReadyRoot(client, suffix);
  if (state === "EXECUTED") return { ...root, leafId: root.rootId, leaf: await rl8c3Transition(client, root.rootId) };
  await client.query("begin");
  try {
    await setRl8Context(client, root.fixture, "RESEARCH_SCIENTIFIC_PROMOTION_EVALUATION_PLAN_PERSIST_V1");
    await client.query("set local role investing_app");
    const stage = state === "INSUFFICIENT_EVIDENCE" ? insufficientStageATransition() : state === "VALIDATION_FAILED" || state === "REJECTED" ? failedStageATransition() : stageATransition();
    const closure = stage.resultingState === "VALIDATION_PASSED" || stage.resultingState === "VALIDATION_FAILED" ? closureTransition(stage) : null;
    const persisted = await client.query<{ result: { stageATransitionIdentityId: string; closureTransitionIdentityId: string | null } }>("select investing.persist_research_scientific_promotion_evaluation_plan_v1($1,$2,$3::jsonb,$4,$5::jsonb) as result", [root.rootId, hashScientificPromotionTransitionV1(stage).hashHex, JSON.stringify(stage), closure ? hashScientificPromotionTransitionV1(closure).hashHex : null, closure ? JSON.stringify(closure) : null]);
    await client.query("reset role");
    await client.query("commit");
    const leafId = state === "PROMOTION_ELIGIBLE" || state === "REJECTED" ? persisted.rows[0]!.result.closureTransitionIdentityId! : persisted.rows[0]!.result.stageATransitionIdentityId;
    return { ...root, leafId, leaf: await rl8c3Transition(client, leafId) };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  }
}

async function reconstructRl8c3(client: PoolClient, fixture: Rl8cAuthorityFixture, rootId: string): Promise<Record<string, unknown>> {
  await client.query("begin");
  try {
    await setRl8Context(client, fixture, "RESEARCH_SCIENTIFIC_PROMOTION_SUPERSESSION_PERSIST_V1");
    await client.query("set local role investing_app");
    const result = await client.query<{ result: Record<string, unknown> }>("select investing.reconstruct_research_scientific_promotion_chain_v1($1) as result", [rootId]);
    await client.query("reset role");
    await client.query("commit");
    return result.rows[0]!.result;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  }
}

maybeDescribe("I5 RL-8C3 scientific promotion real PG17 behavioral hard gate", () => {
  let behaviorPool: Pool;

  beforeAll(async () => {
    behaviorPool = new Pool({ connectionString, max: 8 });
    await resetRl8c3BehaviorDatabase(behaviorPool);
  }, 240_000);

  afterAll(async () => { await behaviorPool?.end(); });

  for (const state of ["EXECUTED", "INSUFFICIENT_EVIDENCE", "PROMOTION_ELIGIBLE", "REJECTED"] as const) {
    it(`REAL PG17 valid edge ${state} to SUPERSEDED`, async () => {
      const client = await behaviorPool.connect();
      try {
        const history = await createRl8c3Leaf(client, state, `valid-${state.toLowerCase()}`);
        const successor = await withTransaction(client, () => createFutureProtocolRoot(client, history.fixture, `B_VALID_${state}`));
        await client.query("begin");
        try {
          const again = await createFutureProtocolRoot(client, history.fixture, `B_VALID_${state}_COMMIT`);
          await client.query("commit");
          const resultValue = await withCommitted(client, () => callRl8c3Supersession(client, history.fixture, history.leafId, rl8c3SupersessionPayload(history.leaf, again)));
          expect(resultValue.status).toBe("CREATED");
          const persisted = await rl8c3Transition(client, resultValue.researchScientificPromotionTransitionIdentityId!);
          expect(persisted.resulting_state).toBe("SUPERSEDED");
          expect(persisted.canonical_payload.evidenceSnapshot).toEqual(history.leaf.canonical_payload.evidenceSnapshot);
          expect(persisted.canonical_payload.gateOutcomes).toEqual(history.leaf.canonical_payload.gateOutcomes);
          expect(persisted.canonical_payload.transitionReasons).toEqual(["SUPERSEDED_EVIDENCE"]);
          expect(persisted.canonical_payload.rejectedTransition).toBeNull();
          expect(await rl8c3SuccessorCount(client, history.leafId)).toBe(1);
        } catch (error) { await client.query("rollback").catch(() => undefined); throw error; }
        expect(successor.rootPayload.resultingState).toBe("EXECUTED");
      } finally { client.release(); }
    }, 160_000);
  }

  async function withCommitted<T>(client: PoolClient, action: () => Promise<T>): Promise<T> {
    await client.query("begin");
    try { const result = await action(); await client.query("commit"); return result; } catch (error) { await client.query("rollback").catch(() => undefined); throw error; }
  }

  it("REAL PG17 forbidden edge matrix rejects intermediate and superseded predecessors", async () => {
    const client = await behaviorPool.connect();
    try {
      for (const state of ["VALIDATION_PASSED", "VALIDATION_FAILED"] as const) {
        const history = await createRl8c3Leaf(client, state, `forbidden-${state.toLowerCase()}`);
        const successor = await withCommitted(client, () => createFutureProtocolRoot(client, history.fixture, `B_FORBIDDEN_${state}`));
        const successorCountBefore = await rl8c3SuccessorCount(client, history.leafId);
        const supersededCountBefore = await rl8c3SupersededSuccessorCount(client, history.leafId);
        await client.query("begin");
        await expectPgRejection(client, () => callRl8c3Supersession(client, history.fixture, history.leafId, rl8c3SupersessionPayload(history.leaf, successor)), /FORBIDDEN_TRANSITION/);
        await client.query("rollback");
        expect(await rl8c3SuccessorCount(client, history.leafId)).toBe(successorCountBefore);
        expect(await rl8c3SupersededSuccessorCount(client, history.leafId)).toBe(supersededCountBefore);
      }
      const base = await createRl8c3Leaf(client, "EXECUTED", "forbidden-superseded");
      const b = await withCommitted(client, () => createFutureProtocolRoot(client, base.fixture, "B_FORBIDDEN_SUPERSEDED"));
      const first = await withCommitted(client, () => callRl8c3Supersession(client, base.fixture, base.leafId, rl8c3SupersessionPayload(base.leaf, b)));
      const superseded = await rl8c3Transition(client, first.researchScientificPromotionTransitionIdentityId!);
      const c = await withCommitted(client, () => createFutureProtocolRoot(client, base.fixture, "C_FORBIDDEN_SUPERSEDED"));
      const successorCountBefore = await rl8c3SuccessorCount(client, superseded.research_scientific_promotion_transition_identity_id);
      const supersededCountBefore = await rl8c3SupersededSuccessorCount(client, superseded.research_scientific_promotion_transition_identity_id);
      await client.query("begin");
      await expectPgRejection(client, () => callRl8c3Supersession(client, base.fixture, superseded.research_scientific_promotion_transition_identity_id, rl8c3SupersessionPayload(superseded, c)), /FORBIDDEN_TRANSITION/);
      await client.query("rollback");
      expect(await rl8c3SuccessorCount(client, superseded.research_scientific_promotion_transition_identity_id)).toBe(successorCountBefore);
      expect(await rl8c3SupersededSuccessorCount(client, superseded.research_scientific_promotion_transition_identity_id)).toBe(supersededCountBefore);
    } finally { client.release(); }
  }, 180_000);

  it("REAL PG17 successor-lineage and copy-integrity negatives execute SQL writer calls", async () => {
    const client = await behaviorPool.connect();
    try {
      const history = await createRl8c3Leaf(client, "PROMOTION_ELIGIBLE", "lineage-copy");
      const successor = await withCommitted(client, () => createFutureProtocolRoot(client, history.fixture, "B_LINEAGE_COPY"));
      const base = rl8c3SupersessionPayload(history.leaf, successor);
      await client.query("begin");
      await expectPgRejection(client, () => callRl8c3Supersession(client, history.fixture, history.leafId, { ...base, supersededByChain: { ...base.supersededByChain!, successorRootTransition: { ...successor.rootRef, hashHex: canonicalSha256HexV1("A".repeat(64)) } } }), /WRONG_SUCCESSOR_ROOT|violates/i);
      await expectPgRejection(client, () => callRl8c3Supersession(client, history.fixture, history.leafId, { ...base, supersededByChain: { successorProtocol: hashScientificPromotionProtocolV1(), successorRootTransition: hashScientificPromotionTransitionV1(rootTransition()) } }), /FORBIDDEN_TRANSITION|same protocol|violates/i);
      await expectPgRejection(client, () => callRl8c3Supersession(client, history.fixture, history.leafId, { ...base, evidenceSnapshot: { ...base.evidenceSnapshot, evidenceObject: null } }), /WRONG_LINEAGE|MALFORMED|integrity/i);
      await expectPgRejection(client, () => callRl8c3Supersession(client, history.fixture, history.leafId, { ...base, gateOutcomes: [] }), /WRONG_LINEAGE|MALFORMED|integrity/i);
      await expectPgRejection(client, () => callRl8c3Supersession(client, history.fixture, history.leafId, { ...base, transitionReasons: [] }), /WRONG_LINEAGE|MALFORMED|integrity/i);
      await expectPgRejection(client, () => callRl8c3Supersession(client, history.fixture, history.leafId, { ...base, supersedes: null }), /WRONG_LINEAGE|MALFORMED|integrity/i);
      await expectPgRejection(client, () => callRl8c3Supersession(client, history.fixture, history.leafId, { ...base, rejectedTransition: hashScientificPromotionTransitionV1(history.leaf.canonical_payload) }), /WRONG_LINEAGE|MALFORMED|integrity/i);
      await expectPgRejection(client, () => callRl8c3Supersession(client, history.fixture, history.leafId, { ...base, supersededByChain: null }), /WRONG_LINEAGE|MALFORMED|integrity/i);
      await client.query("rollback");
    } finally { client.release(); }
  }, 180_000);

  it("REAL PG17 replay returns CREATED then REUSED_IDENTICAL and blocks divergent second successor", async () => {
    const client = await behaviorPool.connect();
    try {
      const history = await createRl8c3Leaf(client, "EXECUTED", "replay");
      const successor = await withCommitted(client, () => createFutureProtocolRoot(client, history.fixture, "B_REPLAY"));
      const payload = rl8c3SupersessionPayload(history.leaf, successor);
      const first = await withCommitted(client, () => callRl8c3Supersession(client, history.fixture, history.leafId, payload));
      const second = await withCommitted(client, () => callRl8c3Supersession(client, history.fixture, history.leafId, payload));
      const other = await withCommitted(client, () => createFutureProtocolRoot(client, history.fixture, "C_REPLAY"));
      const divergent = await withCommitted(client, () => callRl8c3Supersession(client, history.fixture, history.leafId, rl8c3SupersessionPayload(history.leaf, other)));
      expect(first.status).toBe("CREATED");
      expect(second.status).toBe("REUSED_IDENTICAL");
      expect(divergent.status).toBe("DIVERGENT_EXISTING_IDENTITY");
      expect(await rl8c3SuccessorCount(client, history.leafId)).toBe(1);
    } finally { client.release(); }
  }, 160_000);

  it("REAL PG17 two independent connections resolve identical and divergent concurrency", async () => {
    const setup = await behaviorPool.connect();
    const left = await behaviorPool.connect();
    const right = await behaviorPool.connect();
    try {
      const identical = await createRl8c3Leaf(setup, "EXECUTED", "concurrent-identical");
      const b = await withCommitted(setup, () => createFutureProtocolRoot(setup, identical.fixture, "B_CONCURRENT_IDENTICAL"));
      const payload = rl8c3SupersessionPayload(identical.leaf, b);
      const same = await Promise.all([withCommitted(left, () => callRl8c3Supersession(left, identical.fixture, identical.leafId, payload)), withCommitted(right, () => callRl8c3Supersession(right, identical.fixture, identical.leafId, payload))]);
      expect(same.map((item) => item.status).sort()).toEqual(["CREATED", "REUSED_IDENTICAL"].sort());
      expect(await rl8c3SuccessorCount(setup, identical.leafId)).toBe(1);
      const divergent = await createRl8c3Leaf(setup, "EXECUTED", "concurrent-divergent");
      const d1 = await withCommitted(setup, () => createFutureProtocolRoot(setup, divergent.fixture, "B_CONCURRENT_DIVERGENT"));
      const d2 = await withCommitted(setup, () => createFutureProtocolRoot(setup, divergent.fixture, "C_CONCURRENT_DIVERGENT"));
      const diff = await Promise.all([withCommitted(left, () => callRl8c3Supersession(left, divergent.fixture, divergent.leafId, rl8c3SupersessionPayload(divergent.leaf, d1))), withCommitted(right, () => callRl8c3Supersession(right, divergent.fixture, divergent.leafId, rl8c3SupersessionPayload(divergent.leaf, d2)))]);
      expect(diff.map((item) => item.status)).toContain("CREATED");
      expect(diff.map((item) => item.status)).toContain("DIVERGENT_EXISTING_IDENTITY");
      expect(await rl8c3SuccessorCount(setup, divergent.leafId)).toBe(1);
    } finally { setup.release(); left.release(); right.release(); }
  }, 240_000);

  it("REAL PG17 cycle guard accepts A to B to C and rejects cycle back to A", async () => {
    const client = await behaviorPool.connect();
    try {
      const a = await createRl8c3Leaf(client, "EXECUTED", "cycle");
      const b = await withCommitted(client, () => createFutureProtocolRoot(client, a.fixture, "B_CYCLE"));
      await withCommitted(client, () => callRl8c3Supersession(client, a.fixture, a.leafId, rl8c3SupersessionPayload(a.leaf, b)));
      const bRoot = await rl8c3Transition(client, b.rootId);
      const c = await withCommitted(client, () => createFutureProtocolRoot(client, a.fixture, "C_CYCLE"));
      await withCommitted(client, () => callRl8c3Supersession(client, a.fixture, b.rootId, rl8c3SupersessionPayload(bRoot, c)));
      const cRoot = await rl8c3Transition(client, c.rootId);
      expect((await reconstructRl8c3(client, a.fixture, a.rootId)).activeLeafTransitionIdentityId).toBe(c.rootId);
      const fakeBackToA: Rl8c3FutureRoot = { protocolIdentityId: a.fixture.protocolIdentityId, protocolRef: hashScientificPromotionProtocolV1(), rootId: a.rootId, rootRef: hashScientificPromotionTransitionV1(a.rootPayload), rootPayload: a.rootPayload };
      await client.query("begin");
      await expectPgRejection(client, () => callRl8c3Supersession(client, a.fixture, c.rootId, rl8c3SupersessionPayload(cRoot, fakeBackToA)), /SUPERSESSION_CYCLE|FORBIDDEN|WRONG_SUCCESSOR/i);
      await client.query("rollback");
    } finally { client.release(); }
  }, 240_000);

  it("REAL PG17 reconstruction returns stable simple, same-protocol, rejected, and cross-protocol views", async () => {
    const client = await behaviorPool.connect();
    try {
      const simple = await createRl8c3Leaf(client, "EXECUTED", "reconstruct-simple");
      expect((await reconstructRl8c3(client, simple.fixture, simple.rootId)).activeLeafState).toBe("EXECUTED");
      const eligible = await createRl8c3Leaf(client, "PROMOTION_ELIGIBLE", "reconstruct-eligible");
      expect((await reconstructRl8c3(client, eligible.fixture, eligible.rootId)).activeLeafState).toBe("PROMOTION_ELIGIBLE");
      const rejected = await createRl8c3Leaf(client, "REJECTED", "reconstruct-rejected");
      expect((await reconstructRl8c3(client, rejected.fixture, rejected.rootId)).activeLeafState).toBe("REJECTED");
      const a = await createRl8c3Leaf(client, "EXECUTED", "reconstruct-cross");
      const b = await withCommitted(client, () => createFutureProtocolRoot(client, a.fixture, "B_RECONSTRUCT"));
      await withCommitted(client, () => callRl8c3Supersession(client, a.fixture, a.leafId, rl8c3SupersessionPayload(a.leaf, b)));
      const view = await reconstructRl8c3(client, a.fixture, a.rootId);
      expect(view.status).toBe("OK");
      expect(view.rootTransitionIdentityId).toBe(a.rootId);
      expect(view.activeLeafTransitionIdentityId).toBe(b.rootId);
      expect(view.activeLeafState).toBe("EXECUTED");
      expect(JSON.stringify(view.crossChainHops)).toContain(b.protocolRef.hashHex);
      expect(await reconstructRl8c3(client, a.fixture, a.rootId)).toEqual(view);
    } finally { client.release(); }
  }, 240_000);

  it("REAL PG17 corrupt-history constructions fail closed or are structurally impossible", async () => {
    const client = await behaviorPool.connect();
    try {
      const history = await createRl8c3Leaf(client, "VALIDATION_PASSED", "corrupt-orphan");
      const view = await reconstructRl8c3(client, history.fixture, history.rootId);
      expect(view.status).toBe("OK");
      await client.query("begin");
      await expectPgRejection(client, () => client.query("insert into investing.research_scientific_promotion_transitions_scientific_identities (research_scientific_promotion_transition_identity_id, operation, capability, operation_scope, source_context, tenant_id, principal_id, tenant_membership_id, research_investigation_id, research_experiment_id, research_scientific_promotion_protocol_identity_id, protocol_hash_hex, subject_experiment_hash_hex, subject_experiment_parameters_hash_hex, subject_research_ir_hash_hex, predecessor_state, resulting_state, transition_hash_algorithm, transition_hash_domain, transition_hash_version, transition_hash_hex, canonical_payload) values (extensions.gen_random_uuid(),'CORRUPT_FIXTURE','RESEARCH_MUTATE','TENANT_SCOPE','PURE_RESEARCH',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'EXECUTED','VALIDATION_PASSED','SHA-256',$11,'SYNTRAKE_SHA256_V1',$12,'{}'::jsonb)", [history.fixture.tenantId, history.fixture.principalId, history.fixture.tenantMembershipId, history.fixture.researchInvestigationId, history.fixture.researchExperimentId, history.fixture.protocolIdentityId, protocolHashRef, experiment.hashHex, experimentParameters.hashHex, researchIr.hashHex, scientificPromotionTransitionDomainV1, "D".repeat(64)]));
      await client.query("rollback");
    } finally { client.release(); }
  }, 160_000);

  it("REAL PG17 trigger independently rejects direct invalid SUPERSEDED inserts", async () => {
    const client = await behaviorPool.connect();
    try {
      const history = await createRl8c3Leaf(client, "EXECUTED", "trigger-independent");
      const successor = await withCommitted(client, () => createFutureProtocolRoot(client, history.fixture, "B_TRIGGER"));
      const invalidPayload = rl8c3SupersessionPayload(history.leaf, successor, { evidenceSnapshot: { ...history.leaf.canonical_payload.evidenceSnapshot, result: null } });
      await client.query("begin");
      await expectPgRejection(client, async () => {
        await client.query("set constraints all deferred");
        await client.query(`insert into investing.research_scientific_promotion_transitions_scientific_identities (research_scientific_promotion_transition_identity_id, operation, capability, operation_scope, source_context, tenant_id, principal_id, tenant_membership_id, research_investigation_id, research_experiment_id, research_scientific_promotion_protocol_identity_id, protocol_hash_hex, subject_experiment_hash_hex, subject_experiment_parameters_hash_hex, subject_research_ir_hash_hex, predecessor_transition_identity_id, predecessor_transition_hash_hex, predecessor_state, resulting_state, transition_hash_algorithm, transition_hash_domain, transition_hash_version, transition_hash_hex, supersedes_transition_identity_id, supersedes_transition_hash_hex, superseded_by_successor_protocol_identity_id, superseded_by_successor_protocol_hash_hex, superseded_by_successor_root_transition_identity_id, superseded_by_successor_root_transition_hash_hex, run_input_identity_id, run_input_hash_hex, result_identity_id, result_hash_hex, canonical_payload) values (extensions.gen_random_uuid(),'RESEARCH_SCIENTIFIC_PROMOTION_SUPERSESSION_PERSIST_V1','RESEARCH_MUTATE','TENANT_SCOPE','PURE_RESEARCH',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'SUPERSEDED','SHA-256',$14,'SYNTRAKE_SHA256_V1',$15,$11,$12,$16,$17,$18,$19,$20,$21,$22,$23,$24::jsonb)`, [history.fixture.tenantId, history.fixture.principalId, history.fixture.tenantMembershipId, history.fixture.researchInvestigationId, history.fixture.researchExperimentId, history.leaf.research_scientific_promotion_protocol_identity_id, history.leaf.protocol_hash_hex, experiment.hashHex, experimentParameters.hashHex, researchIr.hashHex, history.leafId, history.leaf.transition_hash_hex, history.leaf.resulting_state, scientificPromotionTransitionDomainV1, hashScientificPromotionTransitionV1(invalidPayload).hashHex, successor.protocolIdentityId, successor.protocolRef.hashHex, successor.rootId, successor.rootRef.hashHex, history.fixture.runInputIdentityId, runInput.hashHex, history.fixture.resultIdentityId, result.hashHex, JSON.stringify(invalidPayload)]);
        await client.query("set constraints all immediate");
      }, /supersession integrity|violates|malformed/i);
      await client.query("rollback");
    } finally { client.release(); }
  }, 160_000);

  it("REAL PG17 authority, rollback, and append-only gates execute", async () => {
    const client = await behaviorPool.connect();
    try {
      const history = await createRl8c3Leaf(client, "EXECUTED", "authority-rollback-append");
      const successor = await withCommitted(client, () => createFutureProtocolRoot(client, history.fixture, "B_AUTH_ROLLBACK_APPEND"));
      const grants = await client.query<{ service_execute: boolean; anon_execute: boolean; authenticated_execute: boolean }>("select has_function_privilege('service_role','investing.persist_research_scientific_promotion_supersession_v1(uuid,text,jsonb)','EXECUTE') as service_execute, has_function_privilege('anon','investing.persist_research_scientific_promotion_supersession_v1(uuid,text,jsonb)','EXECUTE') as anon_execute, has_function_privilege('authenticated','investing.persist_research_scientific_promotion_supersession_v1(uuid,text,jsonb)','EXECUTE') as authenticated_execute");
      expect(grants.rows[0]).toEqual({ service_execute: false, anon_execute: false, authenticated_execute: false });
      await client.query("begin");
      const created = await callRl8c3Supersession(client, history.fixture, history.leafId, rl8c3SupersessionPayload(history.leaf, successor));
      expect(created.status).toBe("CREATED");
      await client.query("rollback");
      expect(await rl8c3SuccessorCount(client, history.leafId)).toBe(0);
      await client.query("begin");
      await expectPgRejection(client, () => client.query("update investing.research_scientific_promotion_transitions_scientific_identities set canonical_payload=canonical_payload where research_scientific_promotion_transition_identity_id=$1", [history.leafId]), /append-only|permission/i);
      await expectPgRejection(client, () => client.query("delete from investing.research_scientific_promotion_transitions_scientific_identities where research_scientific_promotion_transition_identity_id=$1", [history.leafId]), /append-only|permission/i);
      await client.query("rollback");
      expect((await rl8c3Transition(client, history.leafId)).canonical_payload).toEqual(history.leaf.canonical_payload);
    } finally { client.release(); }
  }, 160_000);

  it("REAL PG17 missing successor protocol is rejected by writer", async () => {
    const client = await behaviorPool.connect();
    try {
      const history = await createRl8c3Leaf(client, "EXECUTED", "missing-successor-protocol");
      const successor = await withCommitted(client, () => createFutureProtocolRoot(client, history.fixture, "B_MISSING_PROTOCOL"));
      const requestedSuccessorProtocolHash = canonicalSha256HexV1("0".repeat(64));
      const missingProtocolSuccessor: Rl8c3FutureRoot = { ...successor, protocolRef: { ...successor.protocolRef, hashHex: requestedSuccessorProtocolHash } };
      const payload = rl8c3SupersessionPayload(history.leaf, missingProtocolSuccessor);
      expect(payload.supersededByChain?.successorProtocol.hashHex).toBe(requestedSuccessorProtocolHash);
      const protocolRows = await client.query<{ count: number }>("select count(*)::int as count from investing.research_scientific_promotion_protocols_scientific_identities where hash_hex=$1", [requestedSuccessorProtocolHash]);
      expect(protocolRows.rows[0]!.count).toBe(0);
      expect(await hashTransitionFixtureForExplicitProtocol(client, payload)).toMatch(/^[0-9A-F]{64}$/u);
      await client.query("begin");
      await expectPgRejection(client, () => callRl8c3Supersession(client, history.fixture, history.leafId, payload), /WRONG_SUCCESSOR_PROTOCOL|violates|append-only/i);
      await client.query("rollback");
    } finally { client.release(); }
  }, 120_000);

  it("REAL PG17 missing successor root is rejected by writer", async () => {
    const client = await behaviorPool.connect();
    try {
      const history = await createRl8c3Leaf(client, "EXECUTED", "missing-successor-root");
      const successor = await withCommitted(client, () => createFutureProtocolRoot(client, history.fixture, "B_MISSING_ROOT"));
      const missingRoot = { ...successor, rootRef: { ...successor.rootRef, hashHex: canonicalSha256HexV1("B".repeat(64)) } };
      await client.query("begin");
      await expectPgRejection(client, () => callRl8c3Supersession(client, history.fixture, history.leafId, rl8c3SupersessionPayload(history.leaf, missingRoot)), /WRONG_SUCCESSOR_ROOT|violates/i);
      await client.query("rollback");
    } finally { client.release(); }
  }, 120_000);

  it("REAL PG17 wrong predecessorTransition is rejected by writer", async () => {
    const client = await behaviorPool.connect();
    try {
      const history = await createRl8c3Leaf(client, "EXECUTED", "wrong-predecessor-transition");
      const successor = await withCommitted(client, () => createFutureProtocolRoot(client, history.fixture, "B_WRONG_PREDECESSOR"));
      const payload = rl8c3SupersessionPayload(history.leaf, successor, { predecessorTransition: { hashAlgorithm: "SHA-256", hashDomain: scientificPromotionTransitionDomainV1, hashVersion: "SYNTRAKE_SHA256_V1", hashHex: canonicalSha256HexV1("C".repeat(64)) } });
      await client.query("begin");
      await expectPgRejection(client, () => callRl8c3Supersession(client, history.fixture, history.leafId, payload), /WRONG_LINEAGE|integrity/i);
      await client.query("rollback");
    } finally { client.release(); }
  }, 120_000);

  it("REAL PG17 same-protocol supersession is rejected by trigger path", async () => {
    const client = await behaviorPool.connect();
    try {
      const history = await createRl8c3Leaf(client, "EXECUTED", "same-protocol-trigger");
      const sameProtocolRoot: Rl8c3FutureRoot = { protocolIdentityId: history.leaf.research_scientific_promotion_protocol_identity_id, protocolRef: hashScientificPromotionProtocolV1(), rootId: history.rootId, rootRef: hashScientificPromotionTransitionV1(history.rootPayload), rootPayload: history.rootPayload };
      await client.query("begin");
      await expectPgRejection(client, () => callRl8c3Supersession(client, history.fixture, history.leafId, rl8c3SupersessionPayload(history.leaf, sameProtocolRoot)), /FORBIDDEN_TRANSITION|same protocol|violates/i);
      await client.query("rollback");
    } finally { client.release(); }
  }, 120_000);

  it("REAL PG17 anon cannot execute reconstruction", async () => {
    const client = await behaviorPool.connect();
    try {
      const history = await createRl8c3Leaf(client, "EXECUTED", "anon-reconstruct");
      await client.query("begin");
      await client.query("set local role anon");
      await expectPgRejection(client, () => client.query("select investing.reconstruct_research_scientific_promotion_chain_v1($1)", [history.rootId]), /permission denied|does not exist|execute/i);
      await client.query("rollback");
    } finally { client.release(); }
  }, 120_000);

  it("REAL PG17 direct duplicate successor is structurally impossible", async () => {
    const client = await behaviorPool.connect();
    try {
      const history = await createRl8c3Leaf(client, "EXECUTED", "duplicate-successor");
      const successor = await withCommitted(client, () => createFutureProtocolRoot(client, history.fixture, "B_DUPLICATE_SUCCESSOR"));
      await withCommitted(client, () => callRl8c3Supersession(client, history.fixture, history.leafId, rl8c3SupersessionPayload(history.leaf, successor)));
      await client.query("begin");
      await expectPgRejection(client, () => client.query("insert into investing.research_scientific_promotion_transitions_scientific_identities (research_scientific_promotion_transition_identity_id, operation, capability, operation_scope, source_context, tenant_id, principal_id, tenant_membership_id, research_investigation_id, research_experiment_id, research_scientific_promotion_protocol_identity_id, protocol_hash_hex, subject_experiment_hash_hex, subject_experiment_parameters_hash_hex, subject_research_ir_hash_hex, predecessor_transition_identity_id, predecessor_transition_hash_hex, predecessor_state, resulting_state, transition_hash_algorithm, transition_hash_domain, transition_hash_version, transition_hash_hex, canonical_payload) values (extensions.gen_random_uuid(),'CORRUPT_DUPLICATE','RESEARCH_MUTATE','TENANT_SCOPE','PURE_RESEARCH',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'EXECUTED','INSUFFICIENT_EVIDENCE','SHA-256',$13,'SYNTRAKE_SHA256_V1',$14,'{}'::jsonb)", [history.fixture.tenantId, history.fixture.principalId, history.fixture.tenantMembershipId, history.fixture.researchInvestigationId, history.fixture.researchExperimentId, history.leaf.research_scientific_promotion_protocol_identity_id, history.leaf.protocol_hash_hex, experiment.hashHex, experimentParameters.hashHex, researchIr.hashHex, history.leafId, history.leaf.transition_hash_hex, scientificPromotionTransitionDomainV1, "E".repeat(64)]), /one_successor|duplicate|violates/i);
      await client.query("rollback");
    } finally { client.release(); }
  }, 120_000);
});
