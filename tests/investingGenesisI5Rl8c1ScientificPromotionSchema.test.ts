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
