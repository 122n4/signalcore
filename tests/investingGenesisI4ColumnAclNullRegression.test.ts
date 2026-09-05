import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..");
const i4bPath = path.join(
  repoRoot,
  "docs",
  "investing-genesis",
  "sql",
  "I4B_PLAN_PERSISTENCE_CANDIDATE.sql",
);

function occurrences(haystack: string, needle: string) {
  return haystack.split(needle).length - 1;
}

describe("Investing Genesis I4-B PostgreSQL column ACL applicability", () => {
  it("does not fabricate a zero-dimensional aclitem[] for NULL column ACLs", () => {
    const sql = fs.readFileSync(i4bPath, "utf8");
    const invalidFallback = "pg_catalog.aclexplode(coalesce(a.attacl, '{}'::aclitem[]))";
    const nullSafeForm = "pg_catalog.aclexplode(a.attacl)";

    expect(sql).not.toContain(invalidFallback);
    expect(occurrences(sql, nullSafeForm)).toBe(2);
  });
});
