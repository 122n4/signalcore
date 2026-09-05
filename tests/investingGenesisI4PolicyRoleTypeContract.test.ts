import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..");
const i4bPath = path.join(repoRoot, "docs", "investing-genesis", "sql", "I4B_PLAN_PERSISTENCE_CANDIDATE.sql");

function readI4b() {
  return fs.readFileSync(i4bPath, "utf8");
}

describe("Investing Genesis I4-B PostgreSQL policy-role type contract", () => {
  it("compares pg_policy.polroles to an oid[] rather than a regrole[]", () => {
    const sql = readI4b();
    const oidRoleArray = /p\.polroles\s*=\s*array\[\(select oid from pg_catalog\.pg_roles where rolname = 'investing_app'\)\]/g;

    expect(sql).not.toContain("p.polroles = array['investing_app'::regrole]");
    expect(sql.match(oidRoleArray) ?? []).toHaveLength(2);
  });
});
