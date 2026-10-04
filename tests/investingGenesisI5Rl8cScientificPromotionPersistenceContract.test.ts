import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  canonicalScientificPromotionProtocolV1,
  hashScientificPromotionProtocolV1,
  scientificPromotionTransitionGraphV1,
} from "../lib/investing/research/scientificPromotion";

const repoRoot = path.resolve(__dirname, "..");
const contractPath = "docs/investing-genesis/I5_RL8C_SCIENTIFIC_PROMOTION_PERSISTENCE_CONTRACT_V1.md";
const expectedProtocolHash = "122F57C9D0CEE90AF122C949D34C4862364BDD6C5DF1ACD87799F1110B7E124C";

function read(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function compact(value: string): string {
  return value.replace(/\s+/g, " ");
}

describe("I5 RL-8C Scientific Promotion Persistence Contract V1 design freeze", () => {
  it("is design-only on the exact RL-8B/RL-8A/RL-8 predecessor stack", () => {
    const contract = read(contractPath);
    for (const token of [
      "RL-8B deterministic engine TECHNICAL_PASS = a39d785e279b5239988279433751e54b7f275c02",
      "RL-8A corrected technical predecessor = ec691bbf4b1c47d4e909b2b2ba14d13a9e7e6bec",
      "RL-8 Design Freeze = 333e77f550a40b374a49764f58cc61276c6c965e",
      "STACKED WIP / DESIGN FREEZE / NO DATABASE MUTATION",
      "Migration: `NONE`",
      "Supabase mutation: `NONE`",
      "Production mutation: `NONE`",
      "NOT IMPLEMENTED BY THIS SLICE",
      "wip/i5-rl8c-persistence-contract-20261004",
    ]) expect(contract).toContain(token);
  });

  it("mechanically binds protocol payload and hash to the accepted RL-8 runtime", () => {
    const contract = read(contractPath);
    const protocol = canonicalScientificPromotionProtocolV1();
    expect(protocol).toMatchObject({
      schemaVersion: "SCIENTIFIC_PROMOTION_PROTOCOL_V1",
      protocolId: "SCIENTIFIC_PROMOTION_PROTOCOL_V20261002",
    });
    expect(Object.prototype.hasOwnProperty.call(protocol, "protocolToken")).toBe(false);
    expect(hashScientificPromotionProtocolV1().hashHex).toBe(expectedProtocolHash);
    expect(contract).toContain("protocolId = SCIENTIFIC_PROMOTION_PROTOCOL_V20261002");
    expect(contract).toContain(`hashHex = ${expectedProtocolHash}`);
    expect(contract).toContain(`hash_hex text check = '${expectedProtocolHash}'`);
    expect(contract).not.toContain("protocolToken");
  });

  it("freezes exactly two RL-8 scientific domains and exact relation names", () => {
    const contract = read(contractPath);
    for (const token of [
      "investing.research_scientific_promotion_protocols_scientific_identities",
      "investing.research_scientific_promotion_transitions_scientific_identities",
      "SYNTRAKE:SCIENTIFIC_PROMOTION_PROTOCOL:V1",
      "SYNTRAKE:SCIENTIFIC_PROMOTION_TRANSITION:V1",
      "No third RL-8 scientific HashRef domain is admitted",
      "NON_SCIENTIFIC_OPERATIONAL",
      "no mutable active pointer table",
      "no latest table",
      "no current-state table",
    ]) expect(contract).toContain(token);
  });

  it("freezes transition authority columns and subject Experiment operational binding", () => {
    const contract = read(contractPath);
    for (const token of [
      "operation text not null check",
      "capability text not null check = 'RESEARCH_MUTATE'",
      "operation_scope text not null check = 'TENANT_SCOPE'",
      "source_context text not null check = 'PURE_RESEARCH'",
      "research_experiment_id uuid not null",
      "research_experiments_rl8c".replace("research_experiments_rl8c", "investing.research_experiments"),
      "experiment_hash_hex",
      "experiment_parameters_hash_hex",
      "research_ir_hash_hex",
      "This proves `subjectExperiment`, `subjectExperimentParameters` and `subjectResearchIr`",
    ]) expect(contract).toContain(token);
  });

  it("freezes exact run input relation and upstream FK paths with operational ID plus hash", () => {
    const contract = read(contractPath);
    expect(contract).toContain("investing.run_inputs_scientific_identities");
    expect(contract).not.toContain("investing.research_run_inputs_scientific_identities");
    for (const token of [
      "run_input_identity_id uuid null",
      "run_input_hash_hex text null",
      "result_identity_id uuid null",
      "result_hash_hex text null",
      "evidence_object_identity_id uuid null",
      "evidence_object_hash_hex text null",
      "validation_protocol_identity_id uuid null",
      "validation_protocol_hash_hex text null",
      "validation_result_identity_id uuid null",
      "validation_result_hash_hex text null",
      "validation_assessment_protocol_identity_id uuid null",
      "validation_assessment_protocol_hash_hex text null",
      "validation_assessment_result_identity_id uuid null",
      "validation_assessment_result_hash_hex text null",
      "robustness_comparison_protocol_identity_id uuid null",
      "robustness_comparison_protocol_hash_hex text null",
      "robustness_comparison_result_identity_id uuid null",
      "robustness_comparison_result_hash_hex text null",
      "RL8C1_COMPATIBILITY_INDEX_REQUIRED",
      "EXISTING_OR_RL8C1_VERIFY_REQUIRED",
      "The Result FK proves Investigation transitively",
      "The Evidence Object FK proves Investigation transitively",
    ]) expect(contract).toContain(token);
    for (const vague of ["where current upstream schemas support", "where the upstream schema supports", "when an upstream relation includes"]) expect(contract).not.toContain(vague);
  });

  it("freezes Investigation compatibility key, root uniqueness and single successor", () => {
    const normalized = compact(read(contractPath));
    for (const token of [
      "research_investigations_rl8c_authority_tuple_key",
      "research_investigation_id, tenant_id, principal_id, tenant_membership_id, operation_scope, source_context",
      "research_scientific_promotion_one_root_per_chain_key",
      "tenant_id research_investigation_id subject_experiment_hash_hex subject_experiment_parameters_hash_hex subject_research_ir_hash_hex protocol_hash_hex",
      "research_scientific_promotion_one_successor_per_predecessor",
      "resultingState` is excluded from successor uniqueness",
      "REUSED_IDENTICAL",
      "DIVERGENT_EXISTING_IDENTITY",
    ]) expect(normalized).toContain(compact(token));
  });

  it("freezes dedicated writer role, closed table grants and SECURITY DEFINER allowlist", () => {
    const contract = read(contractPath);
    for (const token of [
      "investing_rl8_writer",
      "NOLOGIN",
      "NOINHERIT",
      "NOBYPASSRLS",
      "investing_app: SELECT only",
      "investing_app: NO INSERT, NO UPDATE, NO DELETE, NO TRUNCATE, NO REFERENCES, NO TRIGGER",
      "SECURITY DEFINER",
      "owner = investing_rl8_writer",
      "set search_path = pg_catalog",
      "deliberate narrow exception",
      "No other RL-8 writer function may be SECURITY DEFINER",
      "grant execute only to `investing_app`",
    ]) expect(contract).toContain(token);
    for (const forbidden of [
      "grant select, insert on investing.research_scientific_promotion_protocols_scientific_identities to investing_app",
      "grant select, insert on investing.research_scientific_promotion_transitions_scientific_identities to investing_app",
      "Direct INSERT by `investing_app` remains technically possible",
      "All writers and trigger functions MUST be:\n\n```text\nSECURITY INVOKER",
      "No RL-8C routine may be `SECURITY DEFINER`",
    ]) expect(contract.slice(0, contract.indexOf("## 21. Forbidden stale wording"))).not.toContain(forbidden);
  });

  it("freezes root writer signature without caller-supplied Investigation authority", () => {
    const contract = read(contractPath);
    expect(contract).toContain("investing.persist_research_scientific_promotion_root_v1(p_transition_hash_hex text, p_canonical_payload jsonb) returns jsonb");
    expect(contract).toContain("The root writer MUST derive `research_investigation_id`, `tenant_id`, `principal_id`, and `tenant_membership_id`");
    expect(contract).not.toContain("persist_research_scientific_promotion_root_v1(\n  p_research_investigation_id uuid");
  });

  it("freezes RLS/FORCE RLS without bypass and exact operation vocabulary", () => {
    const contract = read(contractPath);
    for (const token of [
      "Both RL-8C relations have RLS enabled and FORCE RLS enabled",
      "SECURITY DEFINER is not an RLS bypass because `investing_rl8_writer` is `NOBYPASSRLS`",
      "RESEARCH_SCIENTIFIC_PROMOTION_PROTOCOL_CREATE_V1",
      "RESEARCH_SCIENTIFIC_PROMOTION_ROOT_CREATE_V1",
      "RESEARCH_SCIENTIFIC_PROMOTION_EVALUATION_PLAN_PERSIST_V1",
      "RESEARCH_SCIENTIFIC_PROMOTION_SUPERSESSION_PERSIST_V1",
      "syntrake.investing.operation",
      "syntrake.investing.research_investigation_id",
      "No `auth.uid()` shortcut",
      "No authenticated-role-only authorization",
    ]) expect(contract).toContain(token);
  });

  it("freezes database canonical hash verification and cross-language goldens", () => {
    const contract = read(contractPath);
    for (const token of [
      "numbers rejected",
      "object keys sorted deterministically",
      "arrays preserve order",
      "extensions.digest",
      "SHA256(",
      expectedProtocolHash,
      "PASS Stage-A = BEEE521649E78934DCE216B8650F51B86F8BAE80A9A8EA5600321D1F2BB263A4",
      "PASS closure = 98A85178DFF04F3598215DF0AB51CF819B8C43CA74C1F5AA74EC42E00B19D531",
      "FAIL Stage-A = F3438AB40774749A8248BAE9C070E51448515BA39167B7DF9672414B55596DF0",
      "FAIL closure = 76D3E5A550D8B5766B8F77F8FB0A3E22024FEFA1C504ED64E3AAB69E5C512E04",
      "INSUFFICIENT Stage-A = D6135FFEAA229F0B870375333D602AE05974DE9AD424587CBBEFB82F9F8EF738",
    ]) expect(contract).toContain(token);
  });

  it("mechanically binds SUPERSEDED source states to runtime graph and freezes copy/cycle enforcement", () => {
    const contract = read(contractPath);
    const runtimeSources = scientificPromotionTransitionGraphV1.filter((edge) => edge.to === "SUPERSEDED").map((edge) => edge.from).sort();
    expect(runtimeSources).toEqual(["EXECUTED", "INSUFFICIENT_EVIDENCE", "PROMOTION_ELIGIBLE", "REJECTED"]);
    for (const token of ["EXECUTED", "INSUFFICIENT_EVIDENCE", "PROMOTION_ELIGIBLE", "REJECTED", "No other source state is allowed"]) expect(contract).toContain(token);
    expect(contract).not.toContain("SUPERSEDED only from allowed stable leaves `PROMOTION_ELIGIBLE` or `REJECTED`");
    for (const token of [
      "evidenceSnapshot = COPY predecessor",
      "gateOutcomes = COPY predecessor",
      "transitionReasons = [SUPERSEDED_EVIDENCE]",
      "supersedes = predecessor HashRef",
      "rejectedTransition = null",
      "research_scientific_promotion_supersession_integrity",
      "Multi-hop cycle validation is mandatory in the writer",
    ]) expect(contract).toContain(token);
  });

  it("freezes closure copy enforcement and DB-impossible orphan intermediates", () => {
    const contract = read(contractPath);
    for (const token of [
      "VALIDATION_PASSED -> PROMOTION_ELIGIBLE",
      "VALIDATION_FAILED -> REJECTED",
      "DEFERRABLE INITIALLY DEFERRED constraint trigger",
      "research_scientific_promotion_no_orphan_intermediate",
      "closure.evidenceSnapshot == predecessor.evidenceSnapshot",
      "closure.gateOutcomes == predecessor.gateOutcomes",
      "closure.transitionReasons == []",
      "closure.transitionReasons == predecessor.transitionReasons",
      "closure.rejectedTransition == predecessor HashRef",
      "does not rely on TypeScript convention",
    ]) expect(contract).toContain(token);
  });

  it("freezes reconstruction, lock ordering, future slices and PostgreSQL 17 matrix", () => {
    const contract = read(contractPath);
    for (const token of [
      "resolve unique root for chain key",
      "follow unique successor",
      "No timestamp choice",
      "RL8C_PROTOCOL:",
      "RL8C_ROOT:",
      "RL8C_SUCCESSOR:",
      "RL8C_SUPERSEDE:",
      "1. protocol identity",
      "2. root chain key",
      "3. predecessor successor slot",
      "4. supersession link",
      "RL-8C1: schema + compatibility authority/hash indexes + subject Experiment operational binding + dedicated investing_rl8_writer role",
      "RL-8C2: privileged narrow writer functions",
      "RL-8C3: SUPERSEDED writer",
      "SECURITY DEFINER allowlist contains exactly four RL-8 writer functions",
      "run input relation is `investing.run_inputs_scientific_identities`",
      "Production migration MUST NOT happen from this design slice",
    ]) expect(contract).toContain(token);
  });

  it("rejects stale wording and adds no SQL migration in this design slice", () => {
    const contract = read(contractPath);
    for (const forbidden of [
      "protocolToken",
      "investing.research_run_inputs_scientific_identities",
      "SUPERSEDED only from allowed stable leaves PROMOTION_ELIGIBLE or REJECTED",
      "grant select, insert on investing.research_scientific_promotion_protocols_scientific_identities to investing_app",
      "grant select, insert on investing.research_scientific_promotion_transitions_scientific_identities to investing_app",
      "all writers are SECURITY INVOKER",
      "implementation may choose",
      "optional orphan prevention",
      "best effort closure",
      "latest row wins",
      "writer convention only",
    ]) expect(contract.slice(0, contract.indexOf("## 21. Forbidden stale wording"))).not.toContain(forbidden);
    const files = fs.readdirSync(path.join(repoRoot, "supabase", "migrations"));
    expect(files).not.toContain("I5_RL8C_SCIENTIFIC_PROMOTION_PERSISTENCE_CONTRACT_V1.sql");
    expect(contract).toContain("no SQL, no migration, no table, no function, no trigger");
  });
});