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
    expect(sql.indexOf("current_user <> 'postgres'")).toBeLessThan(
      sql.indexOf("set local role investing_owner"),
    );
    expect(sql.indexOf("set local role investing_owner")).toBeLessThan(
      sql.indexOf("create index research_validation_results_authority_tuple_fk_idx"),
    );
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
    expect(sql).toContain("tenant_membership_id,\n    tenant_id,\n    principal_id");
    expect(sql).toContain("no redundant\n-- eight-column protocol authority index is created");
    expect(sql).not.toMatch(/create\s+index\s+(?:if\s+not\s+exists\s+)?research_validation_results_protocol_authority_fk_idx/iu);
    expect(sql).not.toMatch(/create\s+index\s+if\s+not\s+exists/iu);
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

  it("freezes exact RL-3C prestate policy digests before replacement", () => {
    const sql = fs.readFileSync(remediationMigrationPath, "utf8");
    for (const [policyName, digest] of [
      ["research_passport_validation_child_results_select", "9b6b4729dbb6cfcdc033e00af8e1bf00"],
      ["research_validation_child_execute_result_select", "55e7a62b98720b25351e62c51f1c5fa1"],
      ["research_validation_finalize_child_results_select", "1f40faba476cde83739f6f0b74e07f62"],
      ["research_passport_validation_events_select", "3f55ff92f5320e2fdd339ab210216f7f"],
      ["research_validation_child_execute_event_select", "31c85dc5796f75255d66998284156f69"],
      ["research_validation_finalize_events_select", "27bb4b2f6ccc88d49070b112139a8dba"],
      ["research_passport_validation_runs_select", "9b6b4729dbb6cfcdc033e00af8e1bf00"],
      ["research_validation_child_execute_select", "55e7a62b98720b25351e62c51f1c5fa1"],
      ["research_validation_finalize_runs_select", "1f40faba476cde83739f6f0b74e07f62"],
      ["research_passport_validation_protocols_select", "9b6b4729dbb6cfcdc033e00af8e1bf00"],
      ["research_validation_child_protocol_parent_select", "55e7a62b98720b25351e62c51f1c5fa1"],
      ["research_validation_child_protocol_selector_select", "803d514c41293331f6f89e040501fd31"],
      ["research_validation_finalize_protocol_selector_select", "f5d5cfec7709e19b5132e663607177d5"],
      ["research_validation_protocol_create_select", "6a7e6216d140b8e0e00be39dada19d7b"],
      ["research_passport_validation_artifacts_select", "ba308e5fd91518c09b585c0746dedcfe"],
      ["research_validation_child_execute_artifact_select", "029d9b76c62a0044deb0bdd1c23f816e"],
      ["research_validation_finalize_artifacts_select", "2da03dde5538b54b97711aa054b7e117"],
      ["research_passport_validation_results_select", "9b6b4729dbb6cfcdc033e00af8e1bf00"],
      ["research_validation_finalize_result_insert", "b104a450f2d4fccf66813c69dc6d0783"],
      ["research_validation_finalize_result_select", "17c84f244c79d7490bdd08c4a17d2bbf"],
      ["research_passport_validation_run_inputs_select", "9b6b4729dbb6cfcdc033e00af8e1bf00"],
      ["research_validation_child_execute_run_input_select", "55e7a62b98720b25351e62c51f1c5fa1"],
      ["research_validation_finalize_run_inputs_select", "1f40faba476cde83739f6f0b74e07f62"],
      ["tenant_memberships_rl3c_finalize_read", "35c54b415635b9241a27de9fcdf907ed"],
      ["tenants_rl3c_finalize_read", "cea68ad4b45476057ffb6cbe64e16dcc"],
    ]) {
      expect(sql).toContain(`'${policyName}'`);
      expect(sql).toContain(`'${digest}'`);
    }
    expect(sql).toContain("p.permissive <> 'PERMISSIVE'");
    expect(sql).toContain("p.roles::text[] <> array['investing_app']");
    expect(sql).toContain("md5(coalesce(p.qual, '') || '|' || coalesce(p.with_check, ''))");
    expect(sql).toContain("policy drift");
  });

  it("keeps consolidated policy branches operation-specific", () => {
    const sql = fs.readFileSync(remediationMigrationPath, "utf8");
    for (const [policy, operation, capability] of [
      ["research_validation_protocols_select", "RESEARCH_VALIDATION_PROTOCOL_CREATE_V1", "RESEARCH_MUTATE"],
      ["research_validation_protocols_select", "RESEARCH_VALIDATION_CHILD_EXECUTE_V1", "RESEARCH_EXECUTE"],
      ["research_validation_protocols_select", "RESEARCH_VALIDATION_RESULT_FINALIZE_V1", "RESEARCH_MUTATE"],
      ["research_validation_protocols_select", "RESEARCH_PASSPORT_READ_V1", "RESEARCH_READ"],
      ["research_validation_run_inputs_select", "RESEARCH_VALIDATION_CHILD_EXECUTE_V1", "RESEARCH_EXECUTE"],
      ["research_validation_run_inputs_select", "RESEARCH_VALIDATION_RESULT_FINALIZE_V1", "RESEARCH_MUTATE"],
      ["research_validation_run_inputs_select", "RESEARCH_PASSPORT_READ_V1", "RESEARCH_READ"],
      ["research_validation_results_select", "RESEARCH_VALIDATION_RESULT_FINALIZE_V1", "RESEARCH_MUTATE"],
      ["research_validation_results_select", "RESEARCH_PASSPORT_READ_V1", "RESEARCH_READ"],
      ["research_validation_results_insert", "RESEARCH_VALIDATION_RESULT_FINALIZE_V1", "RESEARCH_MUTATE"],
    ]) {
      const start = sql.indexOf(`create policy ${policy}`);
      expect(start, policy).toBeGreaterThanOrEqual(0);
      const end = sql.indexOf(";\n", start);
      const body = sql.slice(start, end);
      expect(body).toContain(operation);
      expect(body).toContain(capability);
      expect(body).toContain("(select current_setting('syntrake.investing.operation', true))");
      expect(body).toContain("(select current_setting('syntrake.investing.capability', true))");
    }

    for (const predicate of [
      "syntrake.investing.operation_scope",
      "syntrake.investing.source_context",
      "syntrake.investing.tenant_id",
      "syntrake.investing.principal_id",
      "syntrake.investing.tenant_membership_id",
      "syntrake.investing.research_investigation_id",
      "syntrake.investing.account_id",
      "syntrake.investing.account_access_id",
    ]) {
      expect(sql).toContain(predicate);
    }
  });
});
