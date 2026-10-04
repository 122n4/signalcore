import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..");
const contractPath = "docs/investing-genesis/I5_RL8C_SCIENTIFIC_PROMOTION_PERSISTENCE_CONTRACT_V1.md";

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
      "Migration:\n`NONE`",
      "Supabase mutation:\n`NONE`",
      "Production mutation:\n`NONE`",
      "NOT IMPLEMENTED BY THIS SLICE",
      "wip/i5-rl8c-persistence-contract-20261004",
    ]) expect(contract).toContain(token);
  });

  it("freezes exactly two RL-8 scientific domains and the exact relation names", () => {
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

  it("freezes protocol identity and global reusability without authority metadata in scientific identity", () => {
    const contract = read(contractPath);
    for (const token of [
      "research_scientific_promotion_protocol_identity_id uuid primary key",
      "RESEARCH_SCIENTIFIC_PROMOTION_PROTOCOL_CREATE_V1",
      "SCIENTIFIC_PROMOTION_PROTOCOL_V20261002",
      "SCIENTIFIC_PROMOTION_PROTOCOL_V1",
      "Protocol operational persistence is reusable across tenants and Investigations",
      "no tenant columns",
      "global immutable protocol identity table",
      "unique (hash_algorithm, hash_domain, hash_version, hash_hex)",
    ]) expect(contract).toContain(token);
  });

  it("freezes transition columns, upstream operational provenance FKs and state presence rules", () => {
    const contract = read(contractPath);
    for (const token of [
      "research_scientific_promotion_transition_identity_id uuid primary key",
      "tenant_id uuid not null",
      "principal_id uuid not null",
      "tenant_membership_id uuid not null",
      "research_investigation_id uuid not null",
      "predecessor_transition_identity_id uuid null",
      "transition_hash_domain text check = 'SYNTRAKE:SCIENTIFIC_PROMOTION_TRANSITION:V1'",
      "run_input_identity_id uuid null",
      "result_identity_id uuid null",
      "evidence_object_identity_id uuid null",
      "validation_assessment_result_identity_id uuid null",
      "robustness_comparison_result_identity_id uuid null",
      "Persistence MUST NOT accept nine arbitrary HashRef strings",
      "ROOT (`EXECUTED`) admits only `runInput` and `result`",
      "Stage B/lifecycle (`PROMOTION_ELIGIBLE`, `REJECTED`, `SUPERSEDED`) MUST copy predecessor evidence",
    ]) expect(contract).toContain(token);
  });

  it("freezes root uniqueness and single-successor invariant with resultingState excluded", () => {
    const normalized = compact(read(contractPath));
    for (const token of [
      "research_scientific_promotion_one_root_per_chain_key",
      "tenant_id research_investigation_id subject_experiment_hash_hex subject_experiment_parameters_hash_hex subject_research_ir_hash_hex protocol_hash_hex",
      "Exactly one authoritative root may exist for one chain key",
      "REUSED_IDENTICAL",
      "DIVERGENT_EXISTING_IDENTITY",
      "research_scientific_promotion_one_successor_per_predecessor",
      "predecessor_transition_identity_id",
      "resultingState` is excluded from successor uniqueness",
      "Any second different state, hash, canonical payload, evidenceSnapshot, reasons or lifecycle link returns `DIVERGENT_EXISTING_IDENTITY`",
    ]) expect(normalized).toContain(compact(token));
  });

  it("freezes atomic Stage-A closure pairs and DB-impossible orphan intermediates", () => {
    const contract = read(contractPath);
    for (const token of [
      "VALIDATION_PASSED -> PROMOTION_ELIGIBLE",
      "VALIDATION_FAILED -> REJECTED",
      "They MUST persist atomically in one database transaction",
      "INSUFFICIENT_EVIDENCE` persists Stage A only",
      "research_scientific_promotion_no_orphan_intermediate",
      "DEFERRABLE INITIALLY DEFERRED constraint trigger",
      "VALIDATION_PASSED successor resulting_state = PROMOTION_ELIGIBLE",
      "VALIDATION_FAILED successor resulting_state = REJECTED",
      "does not rely on TypeScript convention",
      "does not rely on a transaction-local custom GUC",
    ]) expect(contract).toContain(token);
  });

  it("freezes exact writer function names, signatures and conflict vocabulary", () => {
    const contract = read(contractPath);
    for (const token of [
      "investing.persist_research_scientific_promotion_protocol_v1(",
      "p_protocol_hash_hex text",
      "investing.persist_research_scientific_promotion_root_v1(",
      "p_research_investigation_id uuid",
      "investing.persist_research_scientific_promotion_evaluation_plan_v1(",
      "p_closure_transition_hash_hex text default null",
      "investing.persist_research_scientific_promotion_supersession_v1(",
      "p_successor_root_transition_identity_id uuid",
      "CREATED",
      "REUSED_IDENTICAL",
      "DIVERGENT_EXISTING_IDENTITY",
      "UPSERT semantics are forbidden",
    ]) expect(contract).toContain(token);
  });

  it("freezes SECURITY INVOKER, safe grants, service_role denial and direct-insert bypass prevention", () => {
    const contract = read(contractPath);
    for (const token of [
      "SECURITY INVOKER",
      "owner = investing_owner",
      "set search_path = pg_catalog",
      "No RL-8C routine may be `SECURITY DEFINER`",
      "revoke all on function investing.persist_research_scientific_promotion_protocol_v1",
      "public, anon, authenticated, service_role",
      "public`, `anon`, `authenticated`, and `service_role` have no writer EXECUTE authority",
      "grant select, insert on investing.research_scientific_promotion_protocols_scientific_identities to investing_app",
      "grant select, insert on investing.research_scientific_promotion_transitions_scientific_identities to investing_app",
      "Direct INSERT by `investing_app` remains technically possible",
      "all material scientific invariants MUST be enforced by database constraints, FKs, RLS and triggers",
      "Writer convention alone is not security",
    ]) expect(contract).toContain(token);
  });

  it("freezes RLS, FORCE RLS, operation vocabulary and authority tuple FKs", () => {
    const contract = read(contractPath);
    for (const token of [
      "RLS enabled and FORCE RLS enabled",
      "RESEARCH_SCIENTIFIC_PROMOTION_PROTOCOL_CREATE_V1",
      "RESEARCH_SCIENTIFIC_PROMOTION_ROOT_CREATE_V1",
      "RESEARCH_SCIENTIFIC_PROMOTION_EVALUATION_PLAN_PERSIST_V1",
      "RESEARCH_SCIENTIFIC_PROMOTION_SUPERSESSION_PERSIST_V1",
      "syntrake.investing.operation",
      "syntrake.investing.capability",
      "syntrake.investing.tenant_id",
      "syntrake.investing.principal_id",
      "syntrake.investing.tenant_membership_id",
      "syntrake.investing.research_investigation_id",
      "No `auth.uid()` shortcut",
      "No authenticated-role-only authorization",
      "foreign key (tenant_membership_id, tenant_id, principal_id)",
      "Row UUID alone is never trusted",
    ]) expect(contract).toContain(token);
  });

  it("freezes append-only payload/hash structural checks", () => {
    const contract = read(contractPath);
    for (const token of [
      "UPDATE authority = none",
      "DELETE authority = none",
      "investing.reject_research_scientific_promotion_update_delete_v1()",
      "canonical_payload->>'schemaVersion' = 'SCIENTIFIC_PROMOTION_TRANSITION_V1'",
      "protocol HashRef domain/version/hash equals protocol columns",
      "subject Experiment HashRef equals",
      "predecessorState equals `predecessor_state`",
      "resultingState equals `resulting_state`",
      "evidenceSnapshot HashRefs/nulls match the nine operational FK columns",
      "64 uppercase hex",
      "No lowercase normalization at persistence time",
    ]) expect(contract).toContain(token);
  });

  it("freezes SUPERSEDED linkage, cycle prevention and deterministic reconstruction", () => {
    const contract = read(contractPath);
    for (const token of [
      "supersedes",
      "supersededByChain.successorProtocol",
      "supersededByChain.successorRootTransition",
      "SUPERSEDED only from allowed stable leaves `PROMOTION_ELIGIBLE` or `REJECTED`",
      "successor protocol differs",
      "referenced successor is actually ROOT",
      "one old chain -> at most one successor-chain link",
      "recursive CTE under advisory locks",
      "no cycles",
      "resolve unique root for chain key",
      "follow unique successor",
      "zero successor = active leaf",
      "more than one successor = corrupt history / `DIVERGENT_EXISTING_IDENTITY`",
      "`VALIDATION_PASSED` or `VALIDATION_FAILED` as committed leaf = corrupt history",
      "No timestamp choice",
      "no mutable latest pointer",
    ]) expect(contract).toContain(token);
  });

  it("freezes advisory lock identities, lock ordering, no-new-evidence retry semantics and future slices", () => {
    const contract = read(contractPath);
    for (const token of [
      "pg_advisory_xact_lock",
      "RL8C_PROTOCOL:",
      "RL8C_ROOT:",
      "RL8C_SUCCESSOR:",
      "RL8C_SUPERSEDE:",
      "Lock ordering is exact",
      "1. protocol identity",
      "2. root chain key",
      "3. predecessor successor slot",
      "4. supersession link",
      "identical retry of the ORIGINAL transition request returns `REUSED_IDENTICAL`",
      "a different successor for an already-consumed predecessor returns `DIVERGENT_EXISTING_IDENTITY`",
      "RL-8C1: schema + authority + immutable protocol/transition identities",
      "RL-8C2: protocol/root/evaluation-plan writers",
      "RL-8C3: SUPERSEDED linkage writer",
      "No Passport mutation",
    ]) expect(contract).toContain(token);
  });

  it("freezes PostgreSQL 17 concurrency/security matrix and production authorization gate", () => {
    const contract = read(contractPath);
    for (const token of [
      "clean migration replay on PostgreSQL 17",
      "owner = investing_owner",
      "forbidden grants absent",
      "SECURITY DEFINER absent",
      "exact protocol retry -> REUSED_IDENTICAL",
      "concurrent identical roots -> one row / both deterministic results",
      "concurrent divergent roots -> one winner / one DIVERGENT",
      "VALIDATION_PASSED orphan commit -> impossible",
      "VALIDATION_FAILED orphan commit -> impossible",
      "service_role mutation -> blocked",
      "anon/authenticated/public mutation -> blocked",
      "SUPERSEDED cycle -> blocked",
      "reconstruction with multiple successors -> fail closed",
      "contract accepted\n-> migration created in Git\n-> candidate SHA",
      "explicit owner authorization\n-> Production apply",
      "Production migration MUST NOT happen from this design slice",
    ]) expect(contract).toContain(token);
  });

  it("rejects stale wording that permits optional writer behavior", () => {
    const contract = read(contractPath);
    const forbidden = [
      "implementation may choose",
      "optional orphan prevention",
      "best effort closure",
      "latest row wins",
      "service_role authorized writer",
      "authenticated role owns rows",
      "timestamp current state",
      "writer convention only",
    ];
    const bodyBeforeForbiddenList = contract.slice(0, contract.indexOf("## 25. Forbidden stale wording"));
    for (const token of forbidden) expect(bodyBeforeForbiddenList).not.toContain(token);
  });

  it("adds no SQL migration in this design slice", () => {
    const files = fs.readdirSync(path.join(repoRoot, "supabase", "migrations"));
    expect(files).not.toContain("I5_RL8C_SCIENTIFIC_PROMOTION_PERSISTENCE_CONTRACT_V1.sql");
    expect(read(contractPath)).toContain("no SQL, no migration, no table, no function, no trigger");
  });
});