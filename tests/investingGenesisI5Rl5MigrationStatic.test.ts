import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260926201750_investing_i5_rl5_engine_v2_admission.sql", "utf8");

describe("I5 RL-5 migration static hygiene", () => {
  it("uses fail-closed executor and exact five engine-version constraints", () => {
    expect(migration).toContain("current_user <> expected_current_user");
    expect(migration).toContain("set local role investing_owner");
    expect(migration.trim().toLowerCase().startsWith("begin;")).toBe(true);
    expect(migration.trim().toLowerCase().endsWith("commit;")).toBe(true);
    expect(migration).not.toMatch(/drop\s+constraint\s+if\s+exists/iu);
    expect(migration.match(/ENGINE_V20260926/gu)?.length).toBeGreaterThanOrEqual(6);
    expect(migration.match(/drop constraint/giu)).toHaveLength(5);
    expect(migration.match(/add constraint/giu)).toHaveLength(5);
    for (const constraint of [
      "research_execution_runs_engine_version_check",
      "research_results_scientific_identities_engine_version_check",
      "research_validation_child_results_scientif_engine_version_check",
      "research_validation_execution_runs_engine_version_check",
      "research_validation_run_inputs_scientific__engine_version_check",
    ]) {
      expect(migration.match(new RegExp(constraint, "g"))?.length).toBe(4);
    }
  });
});
