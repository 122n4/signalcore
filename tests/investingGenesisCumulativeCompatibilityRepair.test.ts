import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..");
const repairMigration = path.join(
  repoRoot,
  "supabase",
  "migrations",
  "20260921180446_investing_i0_i5_cumulative_compatibility_repair.sql",
);

const immutableHistoricalI5Blobs = [
  ["supabase/migrations/20260909100000_investing_i5_research_authority_audit_contract.sql", "1ef2786cf2718bbae036825d2e6ee9826751e330"],
  ["supabase/migrations/20260910120000_investing_i5_a1_research_investigation_persistence.sql", "b75a78389642dbaa3fda7f9f1ae9a60d3d945406"],
  ["supabase/migrations/20260910130000_investing_i5_a2_research_draft_persistence.sql", "a26ffa5ae5bc1c9591d0722bbbec1ee31c3066ce"],
  ["supabase/migrations/20260911110000_investing_i5_research_runtime_lock_contract_repair.sql", "f7706d6ac8c78fab5eca651ef7b477d915f5cb9f"],
  ["supabase/migrations/20260912050000_investing_i5_a3_research_material_revisions.sql", "907a6df7da30da13f13e42a37a5af6c433d51c94"],
  ["supabase/migrations/20260912070000_investing_i5_a4_research_spec_persistence.sql", "15701c0cebcc9159ea65ec8c5a824fe24ff473ab"],
  ["supabase/migrations/20260915150000_investing_i5_experiment_baseline_persistence.sql", "fe2892668042c0423298269432e470a490576f47"],
  ["supabase/migrations/20260916194400_investing_i5_experiment_variant_persistence.sql", "dd50d760a041f412ac9f62ebd549b935e9d6fb40"],
  ["supabase/migrations/20260917183000_investing_i5_experiment_scientific_closure.sql", "c6c499517cca7bf8200254eccf1261303124fb15"],
  ["supabase/migrations/20260918170000_investing_i5_dataset_run_scientific_closure.sql", "c7f6eda1f37cc6c2b737b8c95d460d1b9a3fa521"],
  ["supabase/migrations/20260919090000_investing_i5_research_execution_closure.sql", "830594f32a435d7ec6c2be0b12aaadba8a6ac786"],
  ["supabase/migrations/20260920090000_investing_i5_rl1_evidence_object_scientific_closure.sql", "d133116aa63d52b6393d0f29e363c7842ee9b411"],
] as const;

function read(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath));
}

function gitBlobSha(bytes: Buffer) {
  return createHash("sha1")
    .update(Buffer.from(`blob ${bytes.length}\0`, "utf8"))
    .update(bytes)
    .digest("hex");
}

function normalize(sql: string) {
  return sql.replace(/\s+/g, " ").trim().toLowerCase();
}

type PolicyContract = Readonly<{
  policyname: string;
  permissive: "PERMISSIVE";
  cmd: "INSERT" | "SELECT";
  roles: readonly ["investing_app"];
  qualMarkers: readonly string[];
  checkMarkers: readonly string[];
}>;

type PolicySnapshot = Readonly<{
  policyname: string;
  permissive: "PERMISSIVE" | "RESTRICTIVE";
  cmd: "INSERT" | "SELECT" | "UPDATE";
  roles: readonly string[];
  qual: string | null;
  withCheck: string | null;
}>;

const finalAuditPolicyContracts: readonly PolicyContract[] = [
  { policyname: "audit_events_i2b_authority_denial_insert", permissive: "PERMISSIVE", cmd: "INSERT", roles: ["investing_app"], qualMarkers: [], checkMarkers: ["AUTHORITY_ACCESS_DENIED", "ACCOUNT_CONTEXT_RESOLVE", "ACCOUNT_AUTHORITY_READ"] },
  { policyname: "audit_events_i2c_bootstrap_insert", permissive: "PERMISSIVE", cmd: "INSERT", roles: ["investing_app"], qualMarkers: [], checkMarkers: ["AUTHORITY_BOOTSTRAP", "INITIAL_PERSONAL_BOOTSTRAP", "DOMAIN_SCOPE"] },
  { policyname: "audit_events_i3c_buy_null_revision_insert", permissive: "PERMISSIVE", cmd: "INSERT", roles: ["investing_app"], qualMarkers: [], checkMarkers: ["I3_FILL_ACCOUNTING_SUCCEEDED", "I3_INTERNAL_PAPER_BUY_V1", "accounting_revision_id"] },
  { policyname: "audit_events_i3c_fill_success_insert", permissive: "PERMISSIVE", cmd: "INSERT", roles: ["investing_app"], qualMarkers: [], checkMarkers: ["I3_FILL_ACCOUNTING_SUCCEEDED", "ledger_transaction_id", "material_request_hash"] },
  { policyname: "audit_events_i4c_plan_conflict_insert", permissive: "PERMISSIVE", cmd: "INSERT", roles: ["investing_app"], qualMarkers: [], checkMarkers: ["PLAN_MUTATION_CONFLICT", "PLAN_INITIALIZE_V1", "PLAN_CREATE_AND_ACTIVATE_REVISION_V1"] },
  { policyname: "audit_events_i4c_plan_denial_insert", permissive: "PERMISSIVE", cmd: "INSERT", roles: ["investing_app"], qualMarkers: [], checkMarkers: ["AUTHORITY_ACCESS_DENIED", "PLAN_WRITE", "operation_scope"] },
  { policyname: "audit_events_i4c_plan_guard_read", permissive: "PERMISSIVE", cmd: "SELECT", roles: ["investing_app"], qualMarkers: ["PLAN_INITIALIZE_V1", "PLAN_CREATE_AND_ACTIVATE_REVISION_V1", "PLAN_WRITE"], checkMarkers: [] },
  { policyname: "audit_events_i4c_plan_success_insert", permissive: "PERMISSIVE", cmd: "INSERT", roles: ["investing_app"], qualMarkers: [], checkMarkers: ["PLAN_INITIALIZATION_SUCCEEDED", "PLAN_REVISION_ACTIVATED", "PLAN_REVISION"] },
  { policyname: "audit_events_i5_research_investigation_create_denial_insert", permissive: "PERMISSIVE", cmd: "INSERT", roles: ["investing_app"], qualMarkers: [], checkMarkers: ["RESEARCH_INVESTIGATION_CREATE_V1", "RESEARCH_MUTATE", "AUTHORITY_ACCESS_DENIED"] },
] as const;

const finalOperationVocabulary = [
  "INITIAL_PERSONAL_BOOTSTRAP",
  "INITIAL_PAPER_CASH_FUNDING",
  "I3_INTERNAL_PAPER_FILL_ACCOUNTING_V1",
  "PLAN_INITIALIZE_V1",
  "PLAN_CREATE_AND_ACTIVATE_REVISION_V1",
  "RESEARCH_INVESTIGATION_CREATE_V1",
  "RESEARCH_DRAFT_CREATE_V1",
  "RESEARCH_DRAFT_REVISION_CREATE_V1",
  "RESEARCH_HYPOTHESIS_REVISION_CREATE_V1",
  "RESEARCH_SPEC_REVISION_CREATE_V1",
  "RESEARCH_EXPERIMENT_BASELINE_CREATE_V1",
  "RESEARCH_EXPERIMENT_VARIANT_CREATE_V1",
] as const;

function validPolicies(actual: readonly PolicySnapshot[], expected: readonly PolicyContract[]) {
  if (actual.length !== expected.length) return false;
  return expected.every((contract) => {
    const policy = actual.find((entry) => entry.policyname === contract.policyname);
    if (!policy) return false;
    if (policy.permissive !== contract.permissive || policy.cmd !== contract.cmd) return false;
    if (policy.roles.length !== 1 || policy.roles[0] !== contract.roles[0]) return false;
    if (contract.cmd === "INSERT" && policy.qual !== null) return false;
    if (contract.cmd === "SELECT" && policy.withCheck !== null) return false;
    const qual = policy.qual ?? "";
    const withCheck = policy.withCheck ?? "";
    return (
      contract.qualMarkers.every((marker) => qual.includes(marker)) &&
      contract.checkMarkers.every((marker) => withCheck.includes(marker))
    );
  });
}

function validVocabulary(actual: readonly string[]) {
  return (
    actual.length === finalOperationVocabulary.length &&
    [...actual].sort().join("\0") === [...finalOperationVocabulary].sort().join("\0")
  );
}

function canonicalPolicySnapshots(): PolicySnapshot[] {
  return finalAuditPolicyContracts.map((contract) => ({
    policyname: contract.policyname,
    permissive: contract.permissive,
    cmd: contract.cmd,
    roles: contract.roles,
    qual: contract.cmd === "SELECT" ? contract.qualMarkers.join(" ") : null,
    withCheck: contract.cmd === "INSERT" ? contract.checkMarkers.join(" ") : null,
  }));
}

describe("Investing Genesis cumulative compatibility forward repair", () => {
  it("keeps every accepted I5 migration blob immutable against the accepted predecessor", () => {
    for (const [relativePath, expectedBlobSha] of immutableHistoricalI5Blobs) {
      expect(gitBlobSha(read(relativePath)), relativePath).toBe(expectedBlobSha);
    }
  });

  it("adds a later forward-only migration instead of rewriting historical lineage", () => {
    const migrationNames = fs
      .readdirSync(path.join(repoRoot, "supabase", "migrations"))
      .filter((entry) => /^\d{14}_.+\.sql$/.test(entry))
      .sort();

    expect(migrationNames).toContain("20260921180446_investing_i0_i5_cumulative_compatibility_repair.sql");
    expect(
      "20260921180446_investing_i0_i5_cumulative_compatibility_repair.sql" >
        "20260920090000_investing_i5_rl1_evidence_object_scientific_closure.sql",
    ).toBe(true);
  });

  it("fails closed on the historical physical I5 prestate and restores exact cumulative vocabulary", () => {
    const sql = normalize(fs.readFileSync(repairMigration, "utf8"));

    expect(sql).toContain("historical i5 idempotency vocabulary drifted");
    expect(sql).toContain("expected exact historical i5 audit policy count");
    expect(sql).toContain("exact historical i5 audit policy semantics drifted");
    expect(sql).toContain("unexpected historical audit_events policy present");
    expect(sql).toContain("historical i5 relation owner/rls/force drifted");
    expect(sql).toContain("i3/i4 relations already exist");
    expect(sql).toContain("final idempotency vocabulary drifted");

    for (const token of [
      "initial_personal_bootstrap",
      "initial_paper_cash_funding",
      "i3_internal_paper_fill_accounting_v1",
      "plan_initialize_v1",
      "plan_create_and_activate_revision_v1",
      "research_investigation_create_v1",
      "research_draft_create_v1",
      "research_draft_revision_create_v1",
      "research_hypothesis_revision_create_v1",
      "research_spec_revision_create_v1",
      "research_experiment_baseline_create_v1",
      "research_experiment_variant_create_v1",
    ]) {
      expect(sql).toContain(token);
    }

    expect(sql).not.toMatch(/operation\s+like/);
    expect(sql).not.toMatch(/research_%/);
    expect(sql).not.toMatch(/plan_%/);
  });

  it("preserves least-privilege guardrails in the repair artifact", () => {
    const sql = normalize(fs.readFileSync(repairMigration, "utf8"));

    expect(sql).toContain("security definer routine found in investing");
    expect(sql).toContain("investing table without rls/force rls");
    expect(sql).toContain("shared role has direct investing table authority");
    expect(sql).not.toMatch(/language\s+\w+\s+security\s+definer/);
    expect(sql).not.toMatch(/security\s+definer\s+set\s+search_path/);
    expect(sql).not.toContain("supabase_migrations");
  });

  it("models exact policy and vocabulary guards against audited negative drift cases", () => {
    const canonicalPolicies = canonicalPolicySnapshots();
    expect(validPolicies(canonicalPolicies, finalAuditPolicyContracts)).toBe(true);
    expect(validVocabulary([...finalOperationVocabulary])).toBe(true);

    expect(validPolicies([...canonicalPolicies, canonicalPolicies[0]!], finalAuditPolicyContracts)).toBe(false);
    expect(validPolicies(canonicalPolicies.slice(1), finalAuditPolicyContracts)).toBe(false);
    expect(validPolicies(canonicalPolicies.map((policy, index) => index === 0 ? { ...policy, cmd: "SELECT" } : policy), finalAuditPolicyContracts)).toBe(false);
    expect(validPolicies(canonicalPolicies.map((policy, index) => index === 0 ? { ...policy, roles: ["service_role"] } : policy), finalAuditPolicyContracts)).toBe(false);
    expect(validPolicies(canonicalPolicies.map((policy, index) => index === 0 ? { ...policy, permissive: "RESTRICTIVE" } : policy), finalAuditPolicyContracts)).toBe(false);
    expect(validPolicies(canonicalPolicies.map((policy, index) => index === 0 ? { ...policy, withCheck: "AUTHORITY_ACCESS_DENIED" } : policy), finalAuditPolicyContracts)).toBe(false);
    expect(validVocabulary([...finalOperationVocabulary, "UNKNOWN_OPERATION_V1"])).toBe(false);
  });
});
