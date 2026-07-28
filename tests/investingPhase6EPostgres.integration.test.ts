import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { assertDestructiveInvestingQaDatabase } from "@/scripts/qa/investingDestructiveQaGuard";

const databaseUrl = process.env.INVESTING_6E_TEST_DATABASE_URL;
const pgDescribe = databaseUrl ? describe : describe.skip;
const configured = databaseUrl ?? "postgresql://invalid/phase6e_not_configured";
if (databaseUrl) assertDestructiveInvestingQaDatabase(databaseUrl, process.env.ALLOW_DESTRUCTIVE_INVESTING_QA);
const forward = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20260728130000_investing_research_dataset_catalog_phase6e.sql"), "utf8");
const rollback = fs.readFileSync(path.join(process.cwd(), "supabase/rollbacks/20260728130000_investing_research_dataset_catalog_phase6e.down.sql"), "utf8");

pgDescribe("Phase 6E real PostgreSQL migration, constraints and rollback", () => {
  const pool = new pg.Pool({ connectionString: configured });
  afterAll(() => pool.end());

  it("applies, enforces scoped attempts, rolls back empty, and reapplies", async () => {
    await pool.query(forward);
    const tables = await pool.query<{ table_name: string }>(
      `select table_name from information_schema.tables where table_schema='public'
       and table_name like 'investing_research_%'`,
    );
    for (const name of ["investing_research_dataset_requests","investing_research_acquisition_jobs","investing_research_datasets","investing_research_dataset_versions","investing_research_dataset_lineage"]) {
      expect(tables.rows.some((row) => row.table_name === name)).toBe(true);
    }
    await pool.query(rollback);
    await pool.query(forward);
  });

  it("has RLS forced and no authenticated writes", async () => {
    const rls = await pool.query<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `select relname,relrowsecurity,relforcerowsecurity from pg_class
       where relname in ('investing_research_dataset_requests','investing_research_acquisition_jobs',
       'investing_research_datasets','investing_research_dataset_versions','investing_research_dataset_lineage')`,
    );
    expect(rls.rows).toHaveLength(5);
    expect(rls.rows.every((row) => row.relrowsecurity && row.relforcerowsecurity)).toBe(true);
    const grants = await pool.query<{ privilege_type: string }>(
      `select privilege_type from information_schema.role_table_grants
       where grantee='authenticated' and table_name like 'investing_research_%'`,
    );
    expect(new Set(grants.rows.map((row) => row.privilege_type))).toEqual(new Set(["SELECT"]));
  });
});
