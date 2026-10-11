import fs from "node:fs";
import path from "node:path";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..");
const connectionString = process.env.PG17_RECONCILIATION_URL ?? "";
const maybeDescribe = connectionString ? describe : describe.skip;
const migrationName = "20261010180000_investing_i5_rl9b1_blind_truth_public_metadata.sql";
const migrations = fs
  .readdirSync(path.join(repoRoot, "supabase", "migrations"))
  .filter((name) => name.endsWith(".sql") && name >= "20260825120000_investing_genesis_i2_authority_materialization.sql" && name <= migrationName)
  .sort()
  .map((name) => path.join(repoRoot, "supabase", "migrations", name));

let pool: Pool | null = null;

async function resetDatabase(): Promise<void> {
  if (!pool) return;
  for (const migration of migrations) {
    await pool.query(fs.readFileSync(migration, "utf8"));
  }
}

maybeDescribe("I5 RL-9B1 Blind Truth PG17 public metadata schema", () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString, max: 1 });
    await resetDatabase();
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    pool = null;
  });

  it("installs exactly five RLS/FORCE public metadata relations without secret columns", async () => {
    const { rows } = await pool!.query(`
      select c.relname, c.relrowsecurity, c.relforcerowsecurity
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'investing' and c.relname like 'research_blind_truth_%_scientific_identities'
      order by c.relname
    `);
    expect(rows.map((row) => row.relname)).toEqual([
      "research_blind_truth_evaluations_scientific_identities",
      "research_blind_truth_protocols_scientific_identities",
      "research_blind_truth_registrations_scientific_identities",
      "research_blind_truth_reveal_result_events_scientific_identities",
      "research_blind_truth_vault_seals_scientific_identities",
    ]);
    expect(rows.every((row) => row.relrowsecurity && row.relforcerowsecurity)).toBe(true);
    const forbidden = await pool!.query(`
      select column_name from information_schema.columns
      where table_schema = 'investing'
        and table_name like 'research_blind_truth_%'
        and column_name ~* '(secret|plaintext|ciphertext|credential|locator|hmac|salt|key)'
    `);
    expect(forbidden.rows).toEqual([]);
  });

  it("installs tenant-scoped non-protocol hash keys and upstream writer policies", async () => {
    const keys = await pool!.query(`
      select conname, pg_get_constraintdef(oid, true) as def
      from pg_constraint
      where conname in (
        'research_blind_truth_registrations_hash_key',
        'research_blind_truth_vault_seals_hash_key',
        'research_blind_truth_evaluations_hash_key',
        'research_blind_truth_events_hash_key'
      )
      order by conname
    `);
    expect(keys.rows).toHaveLength(4);
    for (const row of keys.rows) expect(String(row.def)).toContain("tenant_id");
    const policies = await pool!.query(`
      select policyname from pg_policies
      where schemaname='investing' and policyname in (
        'research_experiments_rl9b_writer_select',
        'research_specs_rl9b_writer_select',
        'research_ir_rl9b_writer_select',
        'metric_request_sets_rl9b_writer_select',
        'execution_configs_rl9b_writer_select',
        'research_scientific_promotion_protocols_rl9b_writer_select',
        'research_scientific_promotion_transitions_rl9b_writer_select'
      )
    `);
    expect(policies.rows).toHaveLength(7);
  });

  it("installs one-shot and event uniqueness backstops", async () => {
    const { rows } = await pool!.query(`
      select indexname, indexdef from pg_indexes
      where schemaname = 'investing'
        and indexname in (
          'research_blind_truth_one_registration_per_candidate_key',
          'research_blind_truth_one_seal_per_registration_key',
          'research_blind_truth_one_evaluation_per_registration_seal_key',
          'research_blind_truth_one_reveal_started_per_evaluation_key',
          'research_blind_truth_one_final_successor_per_started_key'
        )
    `);
    expect(rows).toHaveLength(5);
    const oneShot = rows.find((row) => row.indexname === "research_blind_truth_one_registration_per_candidate_key")!.indexdef as string;
    expect(oneShot).toContain("tenant_id");
    expect(oneShot).not.toContain("research_investigation_id");
    expect(oneShot).not.toContain("promotion_");
  });

  it("detects actual direct and transitive writer grants without confusing superuser authority", async () => {
    const client = await pool!.connect();
    const membershipSql = `
      with recursive granted_roles(roleid) as (
        select m.roleid
        from pg_catalog.pg_auth_members m
        where m.member = 'postgres'::regrole
        union
        select m.roleid
        from pg_catalog.pg_auth_members m
        join granted_roles g on g.roleid = m.member
      )
      select exists (
        select 1 from granted_roles where roleid = 'investing_rl9_writer'::regrole
      ) as has_explicit_membership
    `;
    let transactionOpen = false;
    try {
      expect((await client.query(membershipSql)).rows[0].has_explicit_membership).toBe(false);

      await client.query("begin");
      transactionOpen = true;
      await client.query("grant investing_rl9_writer to postgres");
      expect((await client.query(membershipSql)).rows[0].has_explicit_membership).toBe(true);
      await client.query("rollback");
      transactionOpen = false;

      await client.query("begin");
      transactionOpen = true;
      await client.query("create role rl9b_pg17_writer_membership_bridge nologin");
      await client.query("grant investing_rl9_writer to rl9b_pg17_writer_membership_bridge");
      await client.query("grant rl9b_pg17_writer_membership_bridge to postgres");
      expect((await client.query(membershipSql)).rows[0].has_explicit_membership).toBe(true);
      await client.query("rollback");
      transactionOpen = false;

      expect((await client.query(membershipSql)).rows[0].has_explicit_membership).toBe(false);
    } finally {
      if (transactionOpen) await client.query("rollback").catch(() => undefined);
      client.release();
    }
  });
});