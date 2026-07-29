import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { assertDestructiveInvestingQaDatabase } from "@/scripts/qa/investingDestructiveQaGuard";

const databaseUrl = process.env.INVESTING_6H_TEST_DATABASE_URL;
const pgDescribe = databaseUrl ? describe : describe.skip;
const configured = databaseUrl ?? "postgresql://invalid/phase6h_not_configured";
if (databaseUrl) {
  assertDestructiveInvestingQaDatabase(
    databaseUrl,process.env.ALLOW_DESTRUCTIVE_INVESTING_QA);
}
const forward = fs.readFileSync(path.join(process.cwd(),
  "supabase/migrations/20260730100000_investing_research_hypotheses_candidates_phase6h.sql"),"utf8");
const rollback = fs.readFileSync(path.join(process.cwd(),
  "supabase/rollbacks/20260730100000_investing_research_hypotheses_candidates_phase6h.down.sql"),"utf8");

pgDescribe("Phase 6H real PostgreSQL schema", () => {
  const pool = new pg.Pool({ connectionString: configured });
  afterAll(() => pool.end());
  it("applies exactly the append-only hypothesis and candidate tables", async () => {
    await pool.query(forward);
    const tables = await pool.query<{ relname: string; relrowsecurity: boolean;
      relforcerowsecurity: boolean }>(
      `select relname,relrowsecurity,relforcerowsecurity from pg_class
       where relname in ('investing_research_hypotheses','investing_research_candidates')
       order by relname`,
    );
    expect(tables.rows).toHaveLength(2);
    expect(tables.rows.every((row) =>
      row.relrowsecurity && row.relforcerowsecurity)).toBe(true);
    const grants = await pool.query<{ grantee: string; privilege_type: string }>(
      `select grantee,privilege_type from information_schema.role_table_grants
       where table_name in ('investing_research_hypotheses','investing_research_candidates')`,
    );
    expect(grants.rows.some((row) =>
      row.grantee === "authenticated" && row.privilege_type !== "SELECT")).toBe(false);
    expect(grants.rows.some((row) =>
      row.grantee === "service_role" && ["UPDATE","DELETE"].includes(row.privilege_type))).toBe(false);
  });
  it("rolls back an empty schema and reapplies cleanly", async () => {
    await pool.query(rollback);
    const absent = await pool.query<{ count: string }>(
      `select count(*)::text from pg_class where relname in
       ('investing_research_hypotheses','investing_research_candidates')`,
    );
    expect(absent.rows[0].count).toBe("0");
    await pool.query(forward);
  });
});
