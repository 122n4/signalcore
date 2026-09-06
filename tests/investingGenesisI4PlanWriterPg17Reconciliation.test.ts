import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  I4C_FROZEN_PLAN_WRITER_COMMIT_SHA,
  I4C_FROZEN_PLAN_WRITER_SQL_BLOB_SHA,
  renderI4cPlanWriterPg17Candidate,
} from "@/lib/investing/plan/pg17Hardening";

const repoRoot = path.resolve(__dirname, "..");
const frozenSqlPath = path.join(repoRoot, "docs", "investing-genesis", "sql", "I4C_PLAN_WRITER_CANDIDATE.sql");
const frozenWriterPath = path.join(repoRoot, "lib", "investing", "plan", "writer.ts");
const alternateRuntimePath = path.join(
  repoRoot,
  "docs",
  "investing-genesis",
  "sql",
  "I4C_PLAN_RUNTIME_WRITER_CANDIDATE.sql",
);
const reconciliationPath = path.join(repoRoot, "docs", "investing-genesis", "I4C_RECONCILIATION.md");

function read(filePath: string) {
  return fs.readFileSync(filePath, "utf8");
}

function normalize(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

describe("Investing Genesis I4-C PostgreSQL 17 reconciliation", () => {
  it("pins the exact frozen I4-C lineage and applies only the proven PostgreSQL 17 catalog fixes", () => {
    expect(I4C_FROZEN_PLAN_WRITER_COMMIT_SHA).toBe("8b0376a3d76eaf16e05a07770749fe562e4880c7");
    expect(I4C_FROZEN_PLAN_WRITER_SQL_BLOB_SHA).toBe("d30a02d36acbac46446e7a8eb5bc0ab577f6f3ca");

    const source = read(frozenSqlPath);
    const hardened = renderI4cPlanWriterPg17Candidate(source);

    expect(hardened.replacements).toBe(4);
    expect(hardened.rules).toEqual([
      { id: "NULL_COLUMN_ACL", replacements: 3 },
      { id: "POLICY_ROLE_OID_ARRAY", replacements: 1 },
    ]);
    expect(hardened.sql).not.toContain("pg_catalog.aclexplode(coalesce(a.attacl, '{}'::aclitem[]))");
    expect(hardened.sql).not.toContain("pol.polroles = array['investing_app'::regrole]");
    expect(hardened.sql.match(/pg_catalog\.aclexplode\(a\.attacl\)/g)?.length).toBeGreaterThanOrEqual(3);
    expect(
      hardened.sql.match(/pol\.polroles = array\[\(select oid from pg_catalog\.pg_roles where rolname = 'investing_app'\)\]/g)
        ?.length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("preserves the frozen Plan conflict, authority audit, and FORCE RLS prestate vocabulary while hardening catalog queries", () => {
    const hardened = normalize(renderI4cPlanWriterPg17Candidate(read(frozenSqlPath)).sql);

    expect(hardened).toContain("plan_mutation_conflict");
    expect(hardened).toContain("authority_access_denied");
    expect(hardened).toContain("plan_initialization_succeeded");
    expect(hardened).toContain("plan_revision_activated");
    expect(hardened).toContain("c.relrowsecurity");
    expect(hardened).toContain("c.relforcerowsecurity");
    expect(hardened).toContain("service_role");
  });

  it("keeps the canonical writer bound to explicit expected predecessor/version CAS semantics", () => {
    const writer = read(frozenWriterPath);

    expect(writer).toContain("expectedActiveRevisionId: string");
    expect(writer).toContain("expectedActiveVersion: string");
    expect(writer).toContain("expected_active_revision_id");
    expect(writer).toContain("expected_active_version");
    expect(writer).toContain("I4_PLAN_STALE_ACTIVE_POINTER");
    expect(writer).toContain("I4_PLAN_STALE_ACTIVE_POINTER_AFTER_INSERT");
    expect(writer).toContain("PLAN_MUTATION_CONFLICT");
  });

  it("records the later four-argument SQL runtime as non-canonical reference material", () => {
    const runtime = normalize(read(alternateRuntimePath));
    const reconciliation = normalize(read(reconciliationPath));

    expect(runtime).toContain("i4_plan_write_v1(text, text, bytea, text)");
    expect(reconciliation).toContain("non-canonical reference");
    expect(reconciliation).toContain("6515496a4fdc65a3f5d64f99465be625a24e12f1");
    expect(reconciliation).toContain("8d8d0ff3c113a3dd6cc95b890742bf6745e1bfb7");
    expect(reconciliation).toContain("do not execute i4-d");
  });

  it("fails closed if the frozen SQL no longer has the exact proven PostgreSQL 17 source shape", () => {
    const source = read(frozenSqlPath);
    const drifted = source.replace("pg_catalog.aclexplode(coalesce(a.attacl, '{}'::aclitem[]))", "pg_catalog.aclexplode(a.attacl)");

    expect(() => renderI4cPlanWriterPg17Candidate(drifted)).toThrow(/expected 3 source occurrences, found 2/i);
  });
});
