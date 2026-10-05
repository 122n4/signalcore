import fs from "node:fs";
import path from "node:path";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..");
const connectionString = process.env.PG17_RECONCILIATION_URL ?? "";
const maybeDescribe = connectionString ? describe : describe.skip;
const migrationName = "20261004120000_investing_i5_rl8c1_scientific_promotion_schema_authority.sql";

const rl8c1GoldenParityLiterals = {
  protocolCanonicalBytesSha256: "A3DBB4046CD52A02E90EE175298A7799BAB791B8532FBF84A1A58C11D3B1F012",
  protocolHashRef: "122F57C9D0CEE90AF122C949D34C4862364BDD6C5DF1ACD87799F1110B7E124C",
  rootCanonicalBytesSha256: "3546B2ADD88325F789DD3F4B25817AA6CF3E6D9812711E26852B432AA659F7A1",
  rootHashRef: "3E910D12366ED5B0CE8C93686FC18F98A0D07E550D96BF61237BA73ECE23901F",
} as const;

const rl8c1RequiredPg17Cases = [
  "valid ROOT structural row",
  "ROOT missing Result",
  "ROOT with evidenceObject",
  "ROOT non-empty gates",
  "evidence ID non-null/hash null",
  "evidence ID null/hash non-null",
  "Stage-A missing required Validation Protocol",
  "PASSED missing Evidence Object",
  "PASSED missing RL-7 Result",
  "missing gate",
  "duplicate gate",
  "unknown gate",
  "null gate status",
  "unknown status",
  "PASS gate with non-empty reasons",
  "non-PASS gate with empty reasons",
  "unknown reason",
  "duplicate gate reason",
  "unsorted gate reasons",
  "incorrect transition reason union",
  "unknown evidence HashRef domain",
  "canonical evidence hash != relational hash",
  "extra evidenceSnapshot key",
  "missing evidenceSnapshot key",
  "extra subject key",
  "malformed supersededByChain",
  "wrong Result Investigation",
  "wrong Evidence Object Investigation",
  "unrelated RESEARCH_MUTATE operation",
  "append-only UPDATE rejected",
  "append-only DELETE rejected",
  "cross-scope identical transition hash",
  "unicode canonicalizer parity",
] as const;

const rl8c1UnicodeParityFixture = {
  "á": "non-ASCII object key",
  "a": "prefix key",
  "😀": "astral Unicode scalar",
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
} as const;
const migrations = fs
  .readdirSync(path.join(repoRoot, "supabase", "migrations"))
  .filter((name) => name.endsWith(".sql") && name >= "20260825120000_investing_genesis_i2_authority_materialization.sql" && name <= migrationName)
  .sort()
  .map((name) => path.join("supabase", "migrations", name));

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
          and has_function_privilege('investing_rl8_writer','investing.rl8c_sha256_hex_v1(text,jsonb)','EXECUTE') as ok
      `);
      expect(privileges.rows[0]?.ok).toBe(true);

      const forbiddenWriters = await client.query<{ count: string }>("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='investing' and p.proname like 'persist_research_scientific_promotion%'");
      expect(forbiddenWriters.rows[0]?.count).toBe("0");

      const constraints = await client.query<{ conname: string }>(`
        select conname from pg_constraint
        where conname in ('research_scientific_promotion_evidence_pair_check','research_scientific_promotion_evidence_parent_dependency_check','research_scientific_promotion_payload_check')
        order by conname
      `);
      expect(constraints.rows.map((row) => row.conname)).toEqual([
        "research_scientific_promotion_evidence_pair_check",
        "research_scientific_promotion_evidence_parent_dependency_check",
        "research_scientific_promotion_payload_check",
      ]);

      const policies = await client.query<{ policyname: string; qual: string | null }>("select policyname, qual from pg_policies where schemaname='investing' and policyname like '%rl8c_writer_select' order by policyname");
      expect(policies.rows.length).toBeGreaterThanOrEqual(14);
      expect(policies.rows.every((policy) => policy.qual?.includes("RESEARCH_SCIENTIFIC_PROMOTION_"))).toBe(true);
    } finally {
      client.release();
    }
  }, 60_000);

  it("declares the full required executable closure matrix", () => {
    expect(rl8c1GoldenParityLiterals).toEqual({
      protocolCanonicalBytesSha256: "A3DBB4046CD52A02E90EE175298A7799BAB791B8532FBF84A1A58C11D3B1F012",
      protocolHashRef: "122F57C9D0CEE90AF122C949D34C4862364BDD6C5DF1ACD87799F1110B7E124C",
      rootCanonicalBytesSha256: "3546B2ADD88325F789DD3F4B25817AA6CF3E6D9812711E26852B432AA659F7A1",
      rootHashRef: "3E910D12366ED5B0CE8C93686FC18F98A0D07E550D96BF61237BA73ECE23901F",
    });
    expect(rl8c1RequiredPg17Cases).toContain("valid ROOT structural row");
    expect(rl8c1RequiredPg17Cases).toContain("ROOT missing Result");
    expect(rl8c1RequiredPg17Cases).toContain("duplicate gate");
    expect(rl8c1RequiredPg17Cases).toContain("unknown reason");
    expect(rl8c1RequiredPg17Cases).toContain("wrong Result Investigation");
    expect(rl8c1RequiredPg17Cases).toContain("wrong Evidence Object Investigation");
    expect(rl8c1RequiredPg17Cases).toContain("unrelated RESEARCH_MUTATE operation");
    expect(rl8c1RequiredPg17Cases).toContain("cross-scope identical transition hash");
    expect(rl8c1RequiredPg17Cases).toContain("unicode canonicalizer parity");
    expect(rl8c1UnicodeParityFixture.slash).toBe("/");
  });
});
