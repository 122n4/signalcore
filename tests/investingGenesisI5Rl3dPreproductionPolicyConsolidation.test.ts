import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..");
const read = (relativePath: string) => fs.readFileSync(path.join(repoRoot, relativePath), "utf8");

const original =
  "supabase/migrations/20260929193000_investing_i5_rl3d_validation_assessment_v1.sql";
const consolidation =
  "supabase/migrations/20260930175542_investing_i5_rl3d_preproduction_policy_consolidation.sql";

describe("I5 RL-3D pre-Production policy consolidation", () => {
  it("preserves accepted migration history and consolidates exactly seven split Validation SELECT policies", () => {
    const originalSql = read(original);
    const sql = read(consolidation);

    const splitPolicies = [
      "research_validation_protocols_rl3d_assessment_selector_read",
      "research_validation_runs_rl3d_protocol_create_read",
      "research_validation_events_rl3d_protocol_create_read",
      "research_validation_results_rl3d_assessment_read",
      "research_validation_run_inputs_rl3d_assessment_read",
      "research_validation_child_results_rl3d_assessment_read",
      "research_validation_artifacts_rl3d_assessment_read",
    ];

    const consolidatedPolicies = [
      "research_validation_protocols_select",
      "research_validation_execution_runs_select",
      "research_validation_execution_run_events_select",
      "research_validation_results_select",
      "research_validation_run_inputs_select",
      "research_validation_child_results_select",
      "research_validation_result_artifacts_select",
    ];

    for (const policy of splitPolicies) {
      expect(originalSql).toContain(`create policy ${policy}`);
      expect(sql).toContain(`drop policy ${policy}`);
      expect(sql).not.toContain(`create policy ${policy}`);
    }

    for (const policy of consolidatedPolicies) {
      expect(sql).toContain(`drop policy ${policy}`);
      expect(sql).toContain(`create policy ${policy}`);
    }

    expect(sql).toContain("expected 14 source policies");
    expect(sql).toContain("validation SELECT policy multiplicity remains");
    expect(sql).toContain("stale split RL-3D policies remain");
    expect(sql).toContain("RESEARCH_VALIDATION_ASSESSMENT_PROTOCOL_CREATE_V1");
    expect(sql).toContain("RESEARCH_VALIDATION_ASSESSMENT_RESULT_FINALIZE_V1");
  });

  it("is policy-only and does not widen grants or introduce privileged routines", () => {
    const sql = read(consolidation);

    expect(sql).toContain("set local role investing_owner");
    expect(sql).not.toMatch(/create\s+table/iu);
    expect(sql).not.toMatch(/alter\s+table/iu);
    expect(sql).not.toMatch(/\bgrant\b/iu);
    expect(sql).not.toMatch(/\brevoke\b/iu);
    expect(sql).not.toMatch(/security\s+definer/iu);
    expect(sql).not.toMatch(/\b(insert|update|delete|truncate)\s+into\b/iu);
  });
});
