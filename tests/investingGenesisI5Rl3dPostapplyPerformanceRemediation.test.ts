import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..");
const migrationPath =
  "supabase/migrations/20260930190148_investing_i5_rl3d_postapply_performance_remediation.sql";
const read = () => fs.readFileSync(path.join(repoRoot, migrationPath), "utf8");

describe("I5 RL-3D post-apply performance remediation", () => {
  it("is fail-closed and limited to five covering indexes plus eleven policy rewrites", () => {
    const sql = read();
    expect((sql.match(/create index /gi) ?? [])).toHaveLength(5);
    expect((sql.match(/alter policy /gi) ?? [])).toHaveLength(11);
    expect(sql).toContain("policy drift");
    expect(sql).toContain("expected 5 target foreign keys");
    expect(sql).toContain("remediation index already exists");
    expect(sql).toContain("non-initplan-safe policies");
    expect(sql).toContain("invalid indexes");
  });

  it("preserves authority surface and wraps every executable current_setting call in a scalar SELECT", () => {
    const sql = read();
    const executable = sql
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("--"))
      .join("\n");
    const allCalls = executable.match(/current_setting\(/g) ?? [];
    const wrappedCalls = executable.match(/\(select current_setting\(/g) ?? [];
    expect(allCalls.length).toBeGreaterThan(0);
    expect(wrappedCalls).toHaveLength(allCalls.length);

    expect(sql).not.toMatch(/\bgrant\b/iu);
    expect(sql).not.toMatch(/\brevoke\b/iu);
    expect(sql).not.toMatch(/create\s+table/iu);
    expect(sql).not.toMatch(/alter\s+table/iu);
    expect(sql).not.toMatch(/security\s+definer/iu);
    expect(sql).not.toMatch(/\b(insert|update|delete|truncate)\s+into\b/iu);
  });
});
