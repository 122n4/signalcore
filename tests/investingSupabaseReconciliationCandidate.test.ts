import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..");
const migrationsRoot = path.join(repoRoot, "supabase", "migrations");
const repairName = "20260823000000_reconcile_zero_genesis_journal_residual.sql";
const repairPath = path.join(migrationsRoot, repairName);
const candidateDocPath = path.join(
  repoRoot,
  "docs",
  "investing-genesis",
  "SUPABASE_RECONCILIATION_CANDIDATE_20260915.md",
);
const verifiedResidualSha256 = "5833faf5ca3ab62250f460c1e35ede4b30e20caa58ba87c7b34a4563eb615248";

const currentGenesisAndI5 = [
  "20260825120000_investing_genesis_i2_authority_materialization.sql",
  "20260825123000_investing_genesis_i2_authorized_context.sql",
  "20260828105111_investing_genesis_i2_atomic_personal_bootstrap.sql",
  "20260831221500_investing_genesis_i2_ledger_schema.sql",
  "20260909100000_investing_i5_research_authority_audit_contract.sql",
  "20260910120000_investing_i5_a1_research_investigation_persistence.sql",
  "20260910130000_investing_i5_a2_research_draft_persistence.sql",
  "20260911110000_investing_i5_research_runtime_lock_contract_repair.sql",
  "20260912050000_investing_i5_a3_research_material_revisions.sql",
  "20260912070000_investing_i5_a4_research_spec_persistence.sql",
] as const;

function stripSqlComments(sql: string) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--.*$/gm, "");
}

function normalizeSql(sql: string) {
  return stripSqlComments(sql).replace(/\s+/g, " ").trim().toLowerCase();
}

describe("Investing Supabase reconciliation candidate", () => {
  it("is ordered after Zero-Genesis isolation and before current Genesis materialization", () => {
    const migrationNames = fs
      .readdirSync(migrationsRoot)
      .filter((entry) => /^\d{14}_.+\.sql$/.test(entry))
      .sort();

    expect(migrationNames).toContain(repairName);
    expect(repairName > "20260822223021_revoke_legacy_public_function_execute_for_investing_isolation.sql").toBe(true);
    expect(repairName < currentGenesisAndI5[0]).toBe(true);

    for (const migration of currentGenesisAndI5) {
      expect(fs.existsSync(path.join(migrationsRoot, migration)), migration).toBe(true);
      expect(repairName < migration, migration).toBe(true);
    }
  });

  it("fails closed on Production drift before touching the verified residual", () => {
    const sql = normalizeSql(fs.readFileSync(repairPath, "utf8"));

    expect(sql).toContain("if current_user <> 'postgres' then");
    expect(sql).toContain("investing schema already exists");
    expect(sql).toContain("investing genesis roles already exist");
    expect(sql).toContain("public.journal_entries is missing");
    expect(sql).toContain("extensions.digest(text,text) is missing");
    expect(sql).toContain("public.journal_entries.mode text column is missing");
    expect(sql).toContain("public.journal_entries.type text column is missing");
    expect(sql).toContain("public.journal_entries.created_at timestamptz column is missing");
    expect(sql).toContain("unexpected investing journal residual count %");
    expect(sql).toContain("the sole residual does not match independently verified production evidence");
    expect(sql).toContain("full-row sha-256 fingerprint mismatch");
    expect(sql).toContain("type = 'conversion_event'");
    expect(sql).toContain("timestamptz '2026-09-05 13:59:12.762+00'");
    expect(sql).toContain(verifiedResidualSha256);
    expect(sql).toContain("encode(extensions.digest(to_jsonb(j)::text, 'sha256'), 'hex')");
  });

  it("blocks recurrence before removing the old row, then validates the guard", () => {
    const sql = normalizeSql(fs.readFileSync(repairPath, "utf8"));
    const guardIndex = sql.indexOf("add constraint journal_entries_no_retired_investing_mode_check");
    const deleteIndex = sql.indexOf("delete from public.journal_entries");
    const validateIndex = sql.indexOf("validate constraint journal_entries_no_retired_investing_mode_check");

    expect(guardIndex).toBeGreaterThanOrEqual(0);
    expect(sql).toContain("check (lower(coalesce(mode, '')) <> 'investing') not valid");
    expect(deleteIndex).toBeGreaterThan(guardIndex);
    expect(validateIndex).toBeGreaterThan(deleteIndex);
    expect(sql).toContain("expected exactly one fingerprint-pinned residual deletion");
    expect(sql).toContain("investing journal residual remains after repair");
    expect(sql).toContain("investing runtime residuals remain after repair");
    expect(sql).toContain("and c.convalidated");
  });

  it("contains exactly one fingerprint-pinned row deletion and no unrelated DML", () => {
    const sql = stripSqlComments(fs.readFileSync(repairPath, "utf8"));
    const deletes = sql.match(/\bdelete\s+from\b/gi) ?? [];

    expect(deletes).toHaveLength(1);
    expect(sql).toMatch(/delete\s+from\s+public\.journal_entries\s+as\s+j/i);
    expect(sql).toContain(verifiedResidualSha256);
    expect(sql).toMatch(/extensions\.digest\(to_jsonb\(j\)::text,\s*'sha256'\)/i);
    expect(sql).not.toMatch(/\binsert\s+into\b/i);
    expect(sql).not.toMatch(/\bupdate\s+/i);
    expect(sql).not.toMatch(/\btruncate\b/i);
    expect(sql).not.toMatch(/\bdrop\s+(?:table|schema|role|function)\b/i);
  });

  it("does not mutate Supabase migration history or materialize Genesis itself", () => {
    const sql = normalizeSql(fs.readFileSync(repairPath, "utf8"));

    expect(sql).not.toContain("supabase_migrations");
    expect(sql).not.toContain("migration repair");
    expect(sql).not.toContain("create schema investing");
    expect(sql).not.toContain("create role investing_owner");
    expect(sql).not.toContain("create role investing_app");
    expect(sql).not.toMatch(/create table investing\./);
    expect(sql).not.toMatch(/create function investing\./);
  });

  it("records the independently verified reconciliation boundary without authorizing Production", () => {
    const doc = fs.readFileSync(candidateDocPath, "utf8");

    expect(doc).toContain("986c96f8d1d4ed9f3d0245451e7a14acdc6add39");
    expect(doc).toContain("Current source migration count: `31`");
    expect(doc).toContain("Production migration-ledger count: `73`");
    expect(doc).toContain("Versions present in both source and ledger: `20`");
    expect(doc).toContain("Source versions missing from production ledger: `11`");
    expect(doc).toContain("Production-ledger versions absent from current source: `53`");
    expect(doc).toContain("20260822140500_recover_zero_genesis_shared_preconditions");
    expect(doc).toContain(verifiedResidualSha256);
    expect(doc).toContain("full-row SHA-256");
    expect(doc).toContain("PRODUCTION DDL/DML               = NOT AUTHORIZED");
    expect(doc).toContain("MIGRATION-HISTORY MUTATION       = NOT AUTHORIZED");
    expect(doc).toContain("MERGE                            = NOT AUTHORIZED");
  });
});
