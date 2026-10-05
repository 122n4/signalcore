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
});
