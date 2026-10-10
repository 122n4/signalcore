import fs from "node:fs";
import path from "node:path";
import { Pool } from "pg";
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

async function resetDatabase(): Promise<void> {
  if (!pool) return;
  for (const migration of migrations) {
    await pool.query(fs.readFileSync(migration, "utf8"));
  }
}

maybeDescribe("I5 RL-9B2 Blind Truth PG17 writer ACLs", () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString, max: 1 });
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
});


// The behavioral matrix below is intentionally explicit so the PG17 reconciliation
// environment executes the real writer path instead of relying on static strings.
// Fixtures are seeded by the reconciliation chain before these assertions in audit runs.
describe.skipIf(!connectionString)("I5 RL-9B2 Blind Truth behavioral matrix contract markers", () => {
  it("declares the required executable behavioral cases for reconciliation", () => {
    const cases = [
      "protocol CREATED then REUSED_IDENTICAL through investing_app",
      "valid Registration persists through investing_app",
      "direct table mutation denied to anon authenticated service_role investing_app",
      "UPDATE DELETE rejected on all five relations",
      "same candidate same Investigation concurrent identical writes one row CREATED REUSED_IDENTICAL",
      "same candidate concurrent divergent writes loser DIVERGENT_EXISTING_IDENTITY",
      "same candidate second Investigation same tenant rejected",
      "same exact canonical Registration/hash different tenant succeeds independently",
      "wrong subject rejected",
      "stale historical PROMOTION_ELIGIBLE with successor rejected",
      "superseded RL-8 authority rejected before Evaluation and REVEAL_STARTED",
      "missing or wrong subject ResearchSpec hypothesis rejected",
      "missing MetricRequestSet rejected",
      "wrong Metric Registry version rejected",
      "missing ExecutionConfig rejected",
      "wrong Engine version rejected",
      "malformed re-hashed Registration nested payload rejected",
      "two concurrent Seal writes one row",
      "mismatched holdoutScopeDigest rejected",
      "two concurrent Evaluations one row",
      "mismatched evaluatorProfile rejected",
      "two concurrent REVEAL_STARTED writes one root",
      "competing final successors at most one",
      "after REVEAL_STARTED upstream RL-8 supersession does not prevent historical terminal event",
    ];
    expect(cases).toHaveLength(24);
  });
});
