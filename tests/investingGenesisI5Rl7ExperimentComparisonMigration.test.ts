import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..");
const migrationPath = path.join(repoRoot, "supabase/migrations/20260928080318_investing_i5_rl7_experiment_comparison_v1.sql");
const closureMigrationPath = path.join(repoRoot, "supabase/migrations/20260928090809_investing_i5_rl7_experiment_comparison_persistence_closure.sql");
const sql = fs.readFileSync(migrationPath, "utf8");
const closureSql = fs.readFileSync(closureMigrationPath, "utf8");

describe("I5 RL-7 experiment comparison persistence migration", () => {
  it("creates append-only protocol and result scientific identity tables", () => {
    expect(sql).toContain("create table investing.research_experiment_comparison_protocols_scientific_identities");
    expect(sql).toContain("create table investing.research_experiment_comparison_results_scientific_identities");
    expect(sql).toContain("research_experiment_comparison_protocols_append_only");
    expect(sql).toContain("research_experiment_comparison_results_append_only");
    expect(sql).toContain("research experiment comparison scientific identities are append-only");
  });

  it("binds exact RL-7 protocol and result hash domains to immutable logical identity", () => {
    expect(sql).toContain("SYNTRAKE:EXPERIMENT_COMPARISON_PROTOCOL:V1");
    expect(sql).toContain("SYNTRAKE:EXPERIMENT_COMPARISON_RESULT:V1");
    expect(sql).toContain("check (hash_hex ~ '^[0-9A-F]{64}$')");
    expect(sql).toContain("check (logical_comparison_key ~ '^[0-9A-F]{64}$')");
    expect(sql).toContain("unique (tenant_id, hash_algorithm, hash_domain, hash_version, hash_hex)");
    expect(sql).toContain("unique (tenant_id, logical_comparison_key)");
    expect(sql).toContain("unique (tenant_id, research_experiment_comparison_protocol_identity_id)");
  });

  it("enforces owner role, RLS, FORCE RLS and blocks public Supabase mutation roles", () => {
    expect(sql).toContain("set local role investing_owner");
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("force row level security");
    expect(sql).toContain("revoke all on investing.research_experiment_comparison_protocols_scientific_identities from public, anon, authenticated, service_role");
    expect(sql).toContain("revoke all on investing.research_experiment_comparison_results_scientific_identities from public, anon, authenticated, service_role");
    expect(sql).toContain("grant select, insert on investing.research_experiment_comparison_protocols_scientific_identities to investing_app");
    expect(sql).toContain("grant select, insert on investing.research_experiment_comparison_results_scientific_identities to investing_app");
    expect(sql).not.toContain("grant update");
    expect(sql).not.toContain("grant delete");
  });

  it("uses server-derived tenant authority in policies and includes poststate drift checks", () => {
    for (const setting of ["syntrake.investing.tenant_id", "syntrake.investing.principal_id", "syntrake.investing.tenant_membership_id"]) {
      expect(sql).toContain(setting);
    }
    expect(sql).toContain("RL-7 experiment comparison table owner drift");
    expect(sql).toContain("RL-7 experiment comparison RLS/FORCE RLS drift");
    expect(sql).toContain("RL-7 experiment comparison forbidden grants drift");
  });

  it("adds authoritative protocol/result persistence functions with deterministic reuse and conflict semantics", () => {
    expect(closureSql).toContain("persist_research_experiment_comparison_protocol_v1");
    expect(closureSql).toContain("finalize_research_experiment_comparison_result_v1");
    expect(closureSql).toContain("RL7_EXPERIMENT_COMPARISON_PROTOCOL_CONFLICT");
    expect(closureSql).toContain("RL7_EXPERIMENT_COMPARISON_RESULT_CONFLICT");
    expect(closureSql).toContain("REUSED_IDENTICAL");
    expect(closureSql).toContain("pg_advisory_xact_lock");
    expect(closureSql).toContain("for update");
  });

  it("binds protocol/result rows to server-derived authority and finalizer lineage", () => {
    expect(closureSql).toContain("research_experiment_comparison_protocols_authority_tuple_fk");
    expect(closureSql).toContain("research_experiment_comparison_results_authority_tuple_fk");
    expect(closureSql).toContain("research_experiment_comparison_results_protocol_authority_fk");
    expect(closureSql).toContain("references investing.tenant_memberships");
    expect(closureSql).toContain("references investing.research_experiment_comparison_protocols_scientific_identities");
  });

  it("preserves minimum privileges and avoids SECURITY DEFINER persistence", () => {
    expect(closureSql).toContain("security invoker");
    expect(closureSql).toContain("SECURITY DEFINER function drift");
    expect(closureSql).toContain("grant execute on function investing.persist_research_experiment_comparison_protocol_v1(text, text, jsonb)");
    expect(closureSql).toContain("grant execute on function investing.finalize_research_experiment_comparison_result_v1(uuid, text, jsonb)");
    expect(closureSql).toContain("revoke all on function investing.persist_research_experiment_comparison_protocol_v1(text, text, jsonb)");
    expect(closureSql).toContain("revoke all on function investing.finalize_research_experiment_comparison_result_v1(uuid, text, jsonb)");
  });
});
