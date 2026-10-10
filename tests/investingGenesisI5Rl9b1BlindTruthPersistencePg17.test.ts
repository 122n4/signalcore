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
});
