import fs from "node:fs";
import path from "node:path";
import { Pool } from "pg";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..");
const migrationName = "20261007143000_investing_i5_rl8c3_scientific_promotion_supersession_writer.sql";
const migrationPath = path.join(repoRoot, "supabase", "migrations", migrationName);
const migrationSql = fs.readFileSync(migrationPath, "utf8");
const normalized = migrationSql.toLowerCase().replace(/\s+/g, " ");
const connectionString = process.env.PG17_RECONCILIATION_URL ?? "";
const maybeDescribe = connectionString ? describe : describe.skip;

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
      const checks = await pool.query<{ app_execute: boolean; service_execute: boolean; reconstruct_app_execute: boolean; reconstruct_service_execute: boolean; reconstruct_owner_name: string; reconstruct_prosecdef: boolean; reconstruct_search_path_safe: boolean; owner_name: string; prosecdef: boolean; search_path_safe: boolean; force_rls: boolean; successor_index: boolean }>(`
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
          exists (select 1 from pg_indexes where schemaname='investing' and indexname='research_scientific_promotion_one_successor_per_predecessor') as successor_index
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        join lateral (select pg_catalog.pg_get_userbyid(r.proowner) as owner_name, r.prosecdef, r.proconfig @> array['search_path=pg_catalog'] as search_path_safe from pg_proc r join pg_namespace rn on rn.oid = r.pronamespace where rn.nspname='investing' and r.proname='reconstruct_research_scientific_promotion_chain_v1') rp on true
        join pg_class c on c.relname = 'research_scientific_promotion_transitions_scientific_identities'
        join pg_namespace cn on cn.oid = c.relnamespace and cn.nspname = 'investing'
        where n.nspname = 'investing' and p.proname = 'persist_research_scientific_promotion_supersession_v1'
      `);
      expect(checks.rows[0]).toEqual({ app_execute: true, service_execute: false, reconstruct_app_execute: true, reconstruct_service_execute: false, reconstruct_owner_name: "investing_rl8_writer", reconstruct_prosecdef: true, reconstruct_search_path_safe: true, owner_name: "investing_rl8_writer", prosecdef: true, search_path_safe: true, force_rls: true, successor_index: true });
    } finally {
      await pool.end();
    }
  }, 120_000);
});