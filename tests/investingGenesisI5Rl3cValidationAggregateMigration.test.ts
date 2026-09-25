import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..");
const migrationPath = path.join(
  repoRoot,
  "supabase",
  "migrations",
  "20260924175716_investing_i5_rl3c_validation_aggregate_closure.sql",
);
const remediationMigrationPath = path.join(
  repoRoot,
  "supabase",
  "migrations",
  "20260925044248_investing_i5_rl3c_postapply_advisor_remediation.sql",
);

describe("I5 RL-3C aggregate migration contract", () => {
  it("keeps aggregate identity append-only, tenant-authorized, and Passport read-only", () => {
    const sql = fs.readFileSync(migrationPath, "utf8");
    expect(sql).toContain("research_validation_results_scientific_identities");
    expect(sql).toContain("SYNTRAKE:VALIDATION_RESULT:V1");
    expect(sql).toContain("RESEARCH_VALIDATION_RESULT_FINALIZE_V1");
    expect(sql).toContain("force row level security");
    expect(sql).toContain("unique (research_validation_protocol_identity_id)");
    expect(sql).toContain("research_validation_results_protocol_authority_fk");
    expect(sql).toContain("research_validation_results_append_only_trigger");
    expect(sql).toContain("RESEARCH_PASSPORT_READ_V1");
    expect(sql).toContain("grant select, insert on investing.research_validation_results_scientific_identities to investing_app");
    expect(sql).not.toMatch(/grant\s+(?:update|delete)/iu);
    expect(sql).toContain("revoke all on investing.research_validation_results_scientific_identities from public, anon, authenticated, service_role");
  });

  it("adds advisor remediation without broadening RL-3C authority semantics", () => {
    const sql = fs.readFileSync(remediationMigrationPath, "utf8");
    expect(sql).toContain("RL-3C advisor remediation prestate violation");
    expect(sql).toContain("create policy research_validation_results_select");
    expect(sql).toContain("create policy research_validation_results_insert");
    expect(sql).toContain("create policy research_validation_protocols_select");
    expect(sql).toContain("create policy research_validation_run_inputs_select");
    expect(sql).toContain("create policy research_validation_execution_runs_select");
    expect(sql).toContain("create policy research_validation_execution_run_events_select");
    expect(sql).toContain("create policy research_validation_result_artifacts_select");
    expect(sql).toContain("create policy research_validation_child_results_select");

    for (const token of [
      "RESEARCH_VALIDATION_RESULT_FINALIZE_V1",
      "RESEARCH_MUTATE",
      "RESEARCH_PASSPORT_READ_V1",
      "RESEARCH_READ",
      "RESEARCH_VALIDATION_CHILD_EXECUTE_V1",
      "RESEARCH_EXECUTE",
      "TENANT_SCOPE",
      "PURE_RESEARCH",
      "syntrake.investing.tenant_id",
      "syntrake.investing.principal_id",
      "syntrake.investing.tenant_membership_id",
      "syntrake.investing.research_investigation_id",
    ]) {
      expect(sql).toContain(token);
    }

    expect(sql).toContain("research_validation_results_authority_tuple_fk_idx");
    expect(sql).toContain("research_validation_results_protocol_authority_fk_idx");
    expect(sql).not.toMatch(/grant\s+(?:update|delete)\s+on\s+investing\.research_validation_results_scientific_identities/iu);
    expect(sql).not.toMatch(/alter\s+table\s+investing\.research_validation_results_scientific_identities\s+disable\s+row\s+level\s+security/iu);

    const policyBodies = sql.match(/create policy [\s\S]*?;\n/giu) ?? [];
    const remediatedBodies = policyBodies.filter((body) =>
      /research_validation_(?:protocols|run_inputs|execution_runs|execution_run_events|result_artifacts|child_results|results)_(?:select|insert)|tenants_rl3c_finalize_read|tenant_memberships_rl3c_finalize_read/iu.test(body),
    );
    expect(remediatedBodies.length).toBeGreaterThanOrEqual(10);
    for (const body of remediatedBodies) {
      expect(body).not.toMatch(/(?<!select\s)current_setting\(/iu);
      expect(body).toMatch(/\(select current_setting\(/iu);
    }
  });
});
