import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..");
const migrationName = "20261004120000_investing_i5_rl8c1_scientific_promotion_schema_authority.sql";
const migrationPath = path.join(repoRoot, "supabase", "migrations", migrationName);
const sql = fs.readFileSync(migrationPath, "utf8");
const normalized = sql.replace(/\s+/g, " ").toLowerCase();

function expectContainsAll(source: string, tokens: readonly string[]): void {
  for (const token of tokens) expect(source).toContain(token);
}

describe("I5 RL-8C1 scientific promotion schema authority migration", () => {
  it("creates exactly the RL-8C1 migration surface without RL-8C2 writers", () => {
    const matching = fs.readdirSync(path.join(repoRoot, "supabase", "migrations")).filter((name) => name.includes("rl8c1_scientific_promotion_schema_authority"));
    expect(matching).toEqual([migrationName]);
    expect(normalized).toContain("create table investing.research_scientific_promotion_protocols_scientific_identities");
    expect(normalized).toContain("create table investing.research_scientific_promotion_transitions_scientific_identities");
    expect(normalized).not.toContain("persist_research_scientific_promotion_protocol_v1");
    expect(normalized).not.toContain("persist_research_scientific_promotion_root_v1");
    expect(normalized).not.toContain("persist_research_scientific_promotion_evaluation_plan_v1");
    expect(normalized).not.toContain("persist_research_scientific_promotion_supersession_v1");
    expect(normalized).toContain("rl-8 writer security definer surface must be zero in c1");
  });

  it("freezes the dedicated writer role, closed grants, and no forbidden memberships", () => {
    expectContainsAll(normalized, [
      "create role investing_rl8_writer nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls",
      "pg_has_role('investing_app', 'investing_rl8_writer', 'member')",
      "pg_has_role('service_role', 'investing_rl8_writer', 'member')",
      "pg_has_role('investing_rl8_writer', 'investing_owner', 'member')",
      "grant usage on schema investing to investing_rl8_writer",
      "grant usage on schema extensions to investing_rl8_writer",
      "grant select, insert on investing.research_scientific_promotion_protocols_scientific_identities to investing_rl8_writer",
      "grant select, insert on investing.research_scientific_promotion_transitions_scientific_identities to investing_rl8_writer",
      "revoke all on investing.research_scientific_promotion_protocols_scientific_identities from public, anon, authenticated, service_role, investing_app",
      "revoke all on investing.research_scientific_promotion_transitions_scientific_identities from public, anon, authenticated, service_role, investing_app",
    ]);
    expect(normalized).not.toMatch(/grant\s+(update|delete|truncate|references|trigger)\s+on\s+investing\.research_scientific_promotion_/);
  });

  it("creates all frozen RL-8C compatibility authority/hash indexes", () => {
    expectContainsAll(normalized, [
      "research_investigations_rl8c_authority_tuple_key",
      "research_experiments_rl8c_subject_authority_hash_key",
      "run_inputs_rl8c_authority_hash_key",
      "research_results_rl8c_run_input_hash_key",
      "research_evidence_objects_rl8c_authority_hash_key",
      "research_validation_protocols_rl8c_authority_hash_key",
      "research_validation_results_rl8c_authority_hash_key",
      "research_validation_assessment_protocols_rl8c_authority_hash_key",
      "research_validation_assessment_results_rl8c_authority_hash_key",
      "research_experiment_comparison_protocols_rl8c_authority_hash_key",
      "research_experiment_comparison_results_rl8c_authority_hash_key",
    ]);
    expect(normalized).toContain("evidence_identity_id, run_input_identity_id, result_identity_id");
    expect(normalized).toContain("research_validation_protocol_identity_id, research_investigation_id");
    expect(normalized).toContain("research_validation_result_identity_id, research_validation_protocol_identity_id");
  });

  it("keeps protocol storage forward-compatible while preserving current protocol goldens outside table constants", () => {
    expect(normalized).toContain("hash_domain text not null check (hash_domain = 'syntrake:scientific_promotion_protocol:v1')");
    expect(normalized).toContain("hash_hex text not null check (hash_hex ~ '^[0-9a-f]{64}$')");
    expect(normalized).toContain("protocol_hash_hex text not null check (protocol_hash_hex ~ '^[0-9a-f]{64}$')");
    expect(normalized).not.toContain("hash_hex = '122f57c9d0cee90af122c949d34c4862364bdd6c5df1acd87799f1110b7e124c'");
    expect(normalized).not.toContain("protocol_hash_hex = '122f57c9d0cee90af122c949d34c4862364bdd6c5df1acd87799f1110b7e124c'");
    expect(normalized).toContain("research_scientific_promotion_protocols_rl8c_identity_hash_key unique (research_scientific_promotion_protocol_identity_id, hash_hex)");
  });

  it("implements optional lifecycle references with MATCH SIMPLE plus pair checks", () => {
    expect(normalized).toContain("research_scientific_promotion_predecessor_fk foreign key");
    expect(normalized).toContain("research_scientific_promotion_rejected_fk foreign key");
    expect(normalized).toContain("research_scientific_promotion_supersedes_fk foreign key");
    expect(normalized).toContain("research_scientific_promotion_successor_root_fk foreign key");
    expect((normalized.match(/match simple/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect(normalized).toContain("research_scientific_promotion_successor_protocol_fk foreign key");
    expect(normalized).toContain("match full");
    expectContainsAll(normalized, [
      "research_scientific_promotion_predecessor_pair_check",
      "research_scientific_promotion_rejected_pair_check",
      "research_scientific_promotion_supersedes_pair_check",
      "research_scientific_promotion_successor_protocol_pair_check",
      "research_scientific_promotion_successor_root_pair_check",
    ]);
  });

  it("freezes root/successor uniqueness without resulting_state in successor uniqueness", () => {
    expect(normalized).toContain("research_scientific_promotion_one_root_per_chain_key");
    expect(normalized).toContain("where predecessor_transition_identity_id is null");
    const successorIndex = /create unique index research_scientific_promotion_one_successor_per_predecessor(?<body>.*?)where predecessor_transition_identity_id is not null/s.exec(normalized)?.groups?.body ?? "";
    expect(successorIndex).toContain("tenant_id");
    expect(successorIndex).toContain("research_investigation_id");
    expect(successorIndex).toContain("predecessor_transition_identity_id");
    expect(successorIndex).not.toContain("resulting_state");
  });

  it("installs RLS/FORCE RLS and exact membership authority policy", () => {
    expectContainsAll(normalized, [
      "alter table investing.research_scientific_promotion_protocols_scientific_identities enable row level security",
      "alter table investing.research_scientific_promotion_protocols_scientific_identities force row level security",
      "alter table investing.research_scientific_promotion_transitions_scientific_identities enable row level security",
      "alter table investing.research_scientific_promotion_transitions_scientific_identities force row level security",
      "create policy tenant_memberships_rl8c_writer_select",
      "tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)",
      "tenant_id::text = current_setting('syntrake.investing.tenant_id', true)",
      "principal_id::text = current_setting('syntrake.investing.principal_id', true)",
      "role = 'owner'",
      "state = 'active'",
    ]);
  });

  it("adds SQL canonical/hash foundation with no SECURITY DEFINER helper", () => {
    expectContainsAll(normalized, [
      "create or replace function investing.rl8c_jsonb_has_number_v1",
      "create or replace function investing.rl8c_canonical_jsonb_v1",
      "order by e.key collate \"c\"",
      "rl-8c canonical json forbids numbers",
      "create or replace function investing.rl8c_sha256_hex_v1",
      "extensions.digest",
      "p_hash_domain || e'\\n'",
      "create or replace function investing.reject_research_scientific_promotion_update_delete_v1",
      "security invoker",
    ]);
    expect(normalized).not.toMatch(/language\\s+(sql|plpgsql)[\\s\\S]{0,120}security definer/);
  });
});

describe("I5 RL-8C1 executable PostgreSQL correction coverage", () => {
  it("keeps extensions grant before SET LOCAL ROLE investing_owner", () => {
    const grantIndex = normalized.indexOf("grant usage on schema extensions to investing_rl8_writer");
    const setRoleIndex = normalized.indexOf("set local role investing_owner");
    expect(grantIndex).toBeGreaterThanOrEqual(0);
    expect(setRoleIndex).toBeGreaterThan(grantIndex);
    expect(normalized).not.toContain("grant create on schema extensions");
  });

  it("grants writer execute for check helpers and withholds helper execute from app/public roles", () => {
    for (const signature of [
      "investing.rl8c_jsonb_has_number_v1(jsonb)",
      "investing.rl8c_canonical_jsonb_v1(jsonb)",
      "investing.rl8c_sha256_hex_v1(text, jsonb)",
    ]) expect(normalized).toContain(`grant execute on function ${signature} to investing_rl8_writer`);
    expect(normalized).toContain("from public, anon, authenticated, service_role, investing_app");
    expect(normalized).toContain("forbidden helper execute grant exists");
  });

  it("requires all nine evidence ID/hash pair checks and parent dependencies", () => {
    expect(normalized).toContain("research_scientific_promotion_evidence_pair_check");
    expect(normalized).toContain("research_scientific_promotion_evidence_parent_dependency_check");
    for (const pair of [
      "run_input_identity_id is null and run_input_hash_hex is null",
      "result_identity_id is null and result_hash_hex is null",
      "evidence_object_identity_id is null and evidence_object_hash_hex is null",
      "validation_protocol_identity_id is null and validation_protocol_hash_hex is null",
      "validation_result_identity_id is null and validation_result_hash_hex is null",
      "validation_assessment_protocol_identity_id is null and validation_assessment_protocol_hash_hex is null",
      "validation_assessment_result_identity_id is null and validation_assessment_result_hash_hex is null",
      "robustness_comparison_protocol_identity_id is null and robustness_comparison_protocol_hash_hex is null",
      "robustness_comparison_result_identity_id is null and robustness_comparison_result_hash_hex is null",
      "result_identity_id is null or run_input_identity_id is not null",
      "evidence_object_identity_id is null or (run_input_identity_id is not null and result_identity_id is not null)",
      "validation_assessment_result_identity_id is null or (validation_assessment_protocol_identity_id is not null and validation_result_identity_id is not null)",
    ]) expect(normalized).toContain(pair);
  });

  it("freezes all nine evidence HashRef domains and all eleven gates", () => {
    for (const domain of [
      "syntrake:run_input:v1",
      "syntrake:result:v1",
      "syntrake:evidence_object:v1",
      "syntrake:validation_protocol:v1",
      "syntrake:validation_result:v1",
      "syntrake:validation_assessment_protocol:v1",
      "syntrake:validation_assessment_result:v1",
      "syntrake:experiment_comparison_protocol:v1",
      "syntrake:experiment_comparison_result:v1",
    ]) expect(normalized).toContain(domain);
    for (const gate of [
      "gate_accepted_execution_result",
      "gate_authority_and_tenancy",
      "gate_evidence_completeness",
      "gate_evidence_object_binding",
      "gate_lineage_integrity",
      "gate_metric_result_set_v2",
      "gate_protocol_compatibility",
      "gate_rl7_robustness_comparison",
      "gate_subject_identity",
      "gate_validation_assessment",
      "gate_validation_result",
    ]) expect(normalized).toContain(gate);
    for (const status of ["fail", "incompatible_evidence", "insufficient_evidence", "pass", "unavailable"]) expect(normalized).toContain(status);
  });

  it("closes protocol and transition V1 payload shapes", () => {
    expect(normalized).toContain("rl8c_validate_protocol_payload_shape_v1");
    expect(normalized).toContain("rl8c_validate_transition_payload_shape_v1");
    expect(normalized).toContain("jsonb_object_has_exact_keys_v1(p_payload, array['compatiblemetricregistryversion'");
    expect(normalized).toContain("jsonb_object_has_exact_keys_v1(p_payload, array['evidencesnapshot'");
    expect(normalized).toContain("p_payload->'gateoutcomes' = '[]'::jsonb");
    expect(normalized).toContain("p_run_input_identity_id is not null and p_result_identity_id is not null");
  });

  it("proves Result and Evidence Object RLS through the authorized Run Input lineage", () => {
    const resultPolicy = /create policy research_results_rl8c_writer_select(?<body>.*?);/.exec(normalized)?.groups?.body ?? "";
    expect(resultPolicy).toContain("exists (select 1 from investing.run_inputs_scientific_identities ri");
    expect(resultPolicy).toContain("ri.research_investigation_id::text = current_setting('syntrake.investing.research_investigation_id', true)");
    const evidencePolicy = /create policy research_evidence_objects_rl8c_writer_select(?<body>.*?);/.exec(normalized)?.groups?.body ?? "";
    expect(evidencePolicy).toContain("exists (select 1 from investing.run_inputs_scientific_identities ri");
    expect(evidencePolicy).toContain("exists (select 1 from investing.research_results_scientific_identities rr");
    expect(evidencePolicy).toContain("rr.run_input_identity_id = research_evidence_objects_scientific_identities.run_input_identity_id");
  });

  it("requires an RL-8 operation boundary on every upstream writer SELECT policy", () => {
    const policyNames = [
      "tenant_memberships_rl8c_writer_select",
      "research_investigations_rl8c_writer_select",
      "research_experiments_rl8c_writer_select",
      "run_inputs_rl8c_writer_select",
      "research_results_rl8c_writer_select",
      "research_evidence_objects_rl8c_writer_select",
      "research_validation_protocols_rl8c_writer_select",
      "research_validation_results_rl8c_writer_select",
      "research_validation_assessment_protocols_rl8c_writer_select",
      "research_validation_assessment_results_rl8c_writer_select",
      "research_experiment_comparison_protocols_rl8c_writer_select",
      "research_experiment_comparison_results_rl8c_writer_select",
    ];
    for (const policy of policyNames) {
      const body = new RegExp(`create policy ${policy}(?<body>.*?);`).exec(normalized)?.groups?.body ?? "";
      expect(body, policy).toContain("research_scientific_promotion_");
    }
  });
});

describe("I5 RL-8C1 final closure static invariants", () => {
  it("has exactly one extensions USAGE grant before SET LOCAL ROLE", () => {
    expect((normalized.match(/grant usage on schema extensions to investing_rl8_writer/g) ?? []).length).toBe(1);
    expect(normalized.indexOf("grant usage on schema extensions to investing_rl8_writer")).toBeLessThan(normalized.indexOf("set local role investing_owner"));
  });

  it("scopes transition hash uniqueness by tenant and Investigation", () => {
    expect(normalized).toContain("constraint research_scientific_promotion_transition_hash_key unique (tenant_id, research_investigation_id, transition_hash_algorithm, transition_hash_domain, transition_hash_version, transition_hash_hex)");
    expect(normalized).not.toContain("constraint research_scientific_promotion_transition_hash_key unique (transition_hash_algorithm, transition_hash_domain, transition_hash_version, transition_hash_hex)");
  });

  it("closes nested subject, evidenceSnapshot, and supersededByChain shapes", () => {
    expect(normalized).toContain("array['subjectexperiment','subjectexperimentparameters','subjectresearchir']");
    expect(normalized).toContain("array['evidenceobject','result','robustnesscomparisonprotocol','robustnesscomparisonresult','runinput','validationassessmentprotocol','validationassessmentresult','validationprotocol','validationresult']");
    expect(normalized).toContain("array['successorprotocol','successorroott ransition']".replace("successorroott ransition", "successorroottransition"));
  });

  it("freezes snapshot state matrix and SUPERSEDED structural handling", () => {
    expect(normalized).toContain("p_resulting_state = 'insufficient_evidence'");
    expect(normalized).toContain("p_validation_assessment_result_identity_id is not null");
    expect(normalized).toContain("p_resulting_state in ('validation_failed','validation_passed','promotion_eligible','rejected')");
    expect(normalized).toContain("p_robustness_comparison_result_identity_id is not null");
    expect(normalized).toContain("p_payload->'transitionreasons' = '[\"superseded_evidence\"]'::jsonb");
    expect(normalized).toContain("p_payload->'gateoutcomes' = '[]'::jsonb or investing.rl8c_validate_gate_outcomes_v1");
  });

  it("validates closed reason vocabulary, transition reason union, and canonical gate evidence binding", () => {
    expect(normalized).toContain("rl8c_reason_allowed_v1");
    expect(normalized).toContain("rl8c_transition_reason_union_valid_v1");
    expect(normalized).toContain("rl8c_gate_evidence_binding_valid_v1");
    expect(normalized).toContain("select distinct r.value #>> '{}' as reason");
    expect(normalized).toContain("create or replace function investing.rl8c_sorted_unique_hashrefs_v1");
    expect(normalized).toContain("investing.rl8c_canonical_jsonb_v1(value) as canonical");
    expect(normalized).toContain('order by canonical collate "c"');
    expect(normalized).not.toContain("order by x.value::text");
    expect(normalized).not.toContain("g.value->'evidence' <> jsonb_build_array(r.run_input, r.result_ref)");
    expect(normalized).toContain("when 'gate_accepted_execution_result' then g.value->'evidence' <> investing.rl8c_sorted_unique_hashrefs_v1(jsonb_build_array(r.result_ref, r.run_input))");
    for (const gate of [
      "gate_accepted_execution_result",
      "gate_evidence_completeness",
      "gate_evidence_object_binding",
      "gate_lineage_integrity",
      "gate_metric_result_set_v2",
      "gate_protocol_compatibility",
      "gate_rl7_robustness_comparison",
      "gate_subject_identity",
      "gate_validation_assessment",
      "gate_validation_result",
    ]) {
      expect(normalized).toContain(`when '${gate}' then g.value->'evidence' <> investing.rl8c_sorted_unique_hashrefs_v1`);
    }
    expect(normalized).toContain("when 'gate_authority_and_tenancy' then g.value->'evidence' <> '[]'::jsonb");
  });

  it("requires PG17 file to execute SQL closure assertions instead of only declaring case names", () => {
    const pg17 = fs.readFileSync(path.join(repoRoot, "tests/investingGenesisI5Rl8c1ScientificPromotionPg17.test.ts"), "utf8").toLowerCase();
    for (const literal of [
      "a3dbb4046cd52a02e90ee175298a7799bab791b8532fbf84a1a58c11d3b1f012",
      "122f57c9d0cee90af122c949d34c4862364bdd6c5df1acd87799f1110b7e124c",
      "3546b2add88325f789dd3f4b25817aa6cf3e6d9812711e26852b432aa659f7a1",
      "3e910d12366ed5b0ce8c93686fc18f98a0d07e550d96bf61237ba73ece23901f",
      "investing.rl8c_canonical_jsonb_v1($1::jsonb)",
      "investing.rl8c_sha256_hex_v1($2, $1::jsonb)",
      "investing.rl8c_sorted_unique_hashrefs_v1($1::jsonb)",
      "investing.rl8c_gate_evidence_binding_valid_v1($1::jsonb)",
      "investing.rl8c_validate_transition_payload_shape_v1",
      "canonical unicode/control-character parity",
    ]) expect(pg17).toContain(literal);
    expect(pg17).not.toContain("declares the full required executable closure matrix");
  });
});
