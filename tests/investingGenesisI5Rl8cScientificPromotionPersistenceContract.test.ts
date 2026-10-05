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
    expect(contract).toContain(`Current protocol HashRef = ${expectedProtocolHash}`);
    expect(contract).toContain("hash_hex text not null check (hash_hex ~ '^[0-9A-F]{64}$')");
    expect(contract).toContain("Current protocol HashRef = 122F57C9D0CEE90AF122C949D34C4862364BDD6C5DF1ACD87799F1110B7E124C");
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

  it("scopes transition hash uniqueness by tenant and Investigation", () => {
    const contract = read(contractPath);
    expect(contract).toContain("research_scientific_promotion_transition_hash_key (");
    expect(contract).toContain("tenant_id,\n  research_investigation_id,\n  transition_hash_algorithm,");
    expect(contract).toContain("Protocol hash uniqueness remains global");
    expect(contract).toContain("identical scientific transition payload may legitimately occur in two independently authorized Investigations");
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
      "RL8C1_ADD: research_validation_assessment_protocols_rl8c_authority_hash_key",
      "RL8C1_ADD: research_validation_protocols_rl8c_authority_hash_key",
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
      "object keys sorted lexicographically by Unicode code points",
      "arrays preserve order",
      "extensions.digest",
      "SHA256(",
      "Protocol canonical bytes SHA-256 = A3DBB4046CD52A02E90EE175298A7799BAB791B8532FBF84A1A58C11D3B1F012",
      "Current protocol HashRef = 122F57C9D0CEE90AF122C949D34C4862364BDD6C5DF1ACD87799F1110B7E124C",
      "Root canonical bytes SHA-256 = 3546B2ADD88325F789DD3F4B25817AA6CF3E6D9812711E26852B432AA659F7A1",
      "Root HashRef = 3E910D12366ED5B0CE8C93686FC18F98A0D07E550D96BF61237BA73ECE23901F",
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

  it("freezes exact physical upstream PK names and compatibility indexes", () => {
    const contract = read(contractPath);
    for (const token of [
      "evidence_identity_id, run_input_identity_id, result_identity_id",
      "research_validation_protocol_identity_id, research_investigation_id",
      "research_validation_result_identity_id, research_validation_protocol_identity_id",
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
    ]) expect(contract).toContain(token);
    expect(contract).not.toContain("EXISTING_OR_RL8C1_VERIFY_REQUIRED");
    expect(contract).not.toContain("(evidence_object_identity_id, run_input_identity_id, result_identity_id");
    expect(contract).not.toContain("(validation_protocol_identity_id, research_investigation_id");
    expect(contract).not.toContain("(validation_result_identity_id, validation_protocol_identity_id");
  });

  it("freezes deterministic server-side upstream row resolution and lookup failure semantics", () => {
    const contract = read(contractPath);
    for (const token of [
      "Writers parse the canonical payload HashRefs and resolve operational rows server-side",
      "They MUST NOT accept caller-selected upstream operational IDs for scientific evidence",
      "Each lookup requires exactly one row",
      "Zero matching authoritative rows fail closed",
      "More than one matching authoritative row returns `DIVERGENT_EXISTING_IDENTITY`",
      "No `LIMIT 1`, no `ORDER BY created_at`, no `MAX(...)`, no `latest`",
      "runInput: tenant_id, research_investigation_id, research_experiment_id",
      "result: tenant_id, resolved run_input_identity_id",
      "evidenceObject: tenant_id, resolved run_input_identity_id, resolved result_identity_id",
      "validationResult: tenant_id, resolved validation_protocol_identity_id",
      "validationAssessmentResult: tenant_id, resolved validation_assessment_protocol_identity_id, resolved validation_result_identity_id",
      "robustnessComparisonResult: tenant_id, resolved research_experiment_comparison_protocol_identity_id",
      "Root writer resolution sequence is exact",
      "Evaluation plan writer resolution is exact",
    ]) expect(contract).toContain(token);
  });

  it("freezes lifecycle composite FKs and successor-root cross-protocol binding", () => {
    const contract = read(contractPath);
    for (const token of [
      "research_scientific_promotion_transitions_rl8c_lifecycle_key",
      "Predecessor composite FK",
      "Rejected composite FK",
      "Supersedes composite FK",
      "research_scientific_promotion_transitions_rl8c_cross_chain_target_key",
      "research_scientific_promotion_protocols_rl8c_identity_hash_key",
      "Successor protocol pair FK",
      "MATCH FULL",
      "Predecessor composite FK uses MATCH SIMPLE",
      "Rejected composite FK uses MATCH SIMPLE",
      "Supersedes composite FK uses MATCH SIMPLE",
      "MATCH SIMPLE + identity/hash all-null-or-all-non-null CHECK + state-specific pair presence CHECK",
      "MATCH FULL MUST NOT be used for predecessor, rejected or supersedes lifecycle FKs",
      "ROOT with predecessor identity/hash both null",
      "PROMOTION_ELIGIBLE with rejected identity/hash both null",
      "ordinary non-SUPERSEDED with supersedes identity/hash both null",
      "predecessor_transition_identity_id is null and predecessor_transition_hash_hex is null",
      "predecessor_transition_identity_id is not null and predecessor_transition_hash_hex is not null",
      "rejected_transition_identity_id is null and rejected_transition_hash_hex is null",
      "supersedes_transition_identity_id is null and supersedes_transition_hash_hex is null",
      "superseded_by_successor_protocol_identity_id is null and superseded_by_successor_protocol_hash_hex is null",
      "superseded_by_successor_root_transition_identity_id is null and superseded_by_successor_root_transition_hash_hex is null",
      "ROOT: predecessor identity/hash pair = NULL",
      "Every non-root transition: predecessor identity/hash pair = NON-NULL",
      "SUPERSEDED only: supersedes identity/hash pair = NON-NULL; successor protocol identity/hash pair = NON-NULL; successor root identity/hash pair = NON-NULL",
      "The SUPERSEDED row's composite FK proves successor root transition identity",
      "Protocol is intentionally different there",
      "Row UUID alone is never sufficient",
      "research_scientific_promotion_supersession_integrity",
      "A foreign key MUST NOT be claimed to enforce literal state values",
    ]) expect(contract).toContain(token);
  });

  it("freezes exact writer role privileges and RLS predicates", () => {
    const contract = read(contractPath);
    for (const token of [
      "GRANT USAGE ON SCHEMA investing TO investing_rl8_writer",
      "GRANT USAGE ON SCHEMA extensions TO investing_rl8_writer",
      "GRANT SELECT, INSERT ON investing.research_scientific_promotion_protocols_scientific_identities TO investing_rl8_writer",
      "GRANT SELECT ON investing.tenant_memberships TO investing_rl8_writer",
      "GRANT SELECT ON investing.research_investigations TO investing_rl8_writer",
      "GRANT SELECT ON investing.run_inputs_scientific_identities TO investing_rl8_writer",
      "extensions.digest",
      "research_scientific_promotion_protocols_rl8c_writer_select",
      "research_scientific_promotion_protocols_rl8c_writer_insert",
      "research_scientific_promotion_transitions_rl8c_writer_insert",
      "tenant_memberships_rl8c_writer_select",
      "on investing.tenant_memberships",
      "for SELECT",
      "to investing_rl8_writer",
      "operation = current_setting('syntrake.investing.operation', true)",
      "tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)",
      "tenant_id::text = current_setting('syntrake.investing.tenant_id', true)",
      "principal_id::text = current_setting('syntrake.investing.principal_id', true)",
      "role = 'OWNER'",
      "state = 'ACTIVE'",
      "No UPDATE policy exists",
      "No DELETE policy exists",
    ]) expect(contract).toContain(token);
    expect(contract).not.toContain("minimum SELECT/INSERT required");
    expect(contract).not.toContain("If SELECT is required");
    expect(contract).not.toContain("as appropriate");
  });

  it("freezes all nine HashRef domains, Stage-A gate shape and structural state validation", () => {
    const contract = read(contractPath);
    for (const token of [
      "runInput = SYNTRAKE:RUN_INPUT:V1",
      "result = SYNTRAKE:RESULT:V1",
      "evidenceObject = SYNTRAKE:EVIDENCE_OBJECT:V1",
      "validationProtocol = SYNTRAKE:VALIDATION_PROTOCOL:V1",
      "validationResult = SYNTRAKE:VALIDATION_RESULT:V1",
      "validationAssessmentProtocol = SYNTRAKE:VALIDATION_ASSESSMENT_PROTOCOL:V1",
      "validationAssessmentResult = SYNTRAKE:VALIDATION_ASSESSMENT_RESULT:V1",
      "robustnessComparisonProtocol = SYNTRAKE:EXPERIMENT_COMPARISON_PROTOCOL:V1",
      "robustnessComparisonResult = SYNTRAKE:EXPERIMENT_COMPARISON_RESULT:V1",
      "Root structural validation",
      "DRAFT_RESEARCH -> EXECUTED",
      "source is exactly one of `EXECUTED`, `INSUFFICIENT_EVIDENCE`, `PROMOTION_ELIGIBLE`, `REJECTED`",
      "result is exactly one of `INSUFFICIENT_EVIDENCE`, `VALIDATION_FAILED`, `VALIDATION_PASSED`",
      "GATE_ACCEPTED_EXECUTION_RESULT",
      "GATE_RL7_ROBUSTNESS_COMPARISON",
      "GATE_VALIDATION_RESULT",
      "FAIL",
      "INCOMPATIBLE_EVIDENCE",
      "INSUFFICIENT_EVIDENCE",
      "PASS",
      "UNAVAILABLE",
    ]) expect(contract).toContain(token);
  });

  it("freezes byte-exact SQL canonical JSON rules and jsonb input semantics", () => {
    const contract = read(contractPath);
    for (const token of [
      "object keys sorted lexicographically by Unicode code points",
      "comparator compares scalar code points left-to-right",
      "shorter string first",
      "quote ->",
      "BACKSPACE -> \\b",
      "TAB -> \\t",
      "LF -> \\n",
      "other U+0000..U+001F -> lowercase \\u00xx",
      "invalid Unicode scalar sequences rejected",
      "slash is not escaped",
      "non-ASCII characters are not arbitrarily ASCII-escaped",
      "ordering is Unicode-code-point order, not locale-dependent collation",
      "PostgreSQL 17 parity tests include non-ASCII keys/values and control-character escaping",
      "Writer signatures use jsonb",
      "scientific identity is computed over the parsed canonical logical object",
      "Raw input key ordering and whitespace are never scientific identity",
    ]) expect(contract).toContain(token);
  });


  it("freezes membership authority proof for writer access", () => {
    const contract = read(contractPath);
    for (const token of [
      "investing.tenant_memberships",
      "GRANT SELECT ON investing.tenant_memberships TO investing_rl8_writer",
      "tenant_memberships_rl8c_writer_select",
      "current_setting('syntrake.investing.operation', true) in (",
      "current_setting('syntrake.investing.capability', true) = 'RESEARCH_MUTATE'",
      "tenant_membership_id::text = current_setting('syntrake.investing.tenant_membership_id', true)",
      "tenant_id::text = current_setting('syntrake.investing.tenant_id', true)",
      "principal_id::text = current_setting('syntrake.investing.principal_id', true)",
      "role = 'OWNER'",
      "state = 'ACTIVE'",
      "No client-supplied membership tuple is authority by itself",
      "Authority resolution order is frozen",
      "zero matching membership: AUTHORITY_FAILURE",
      "only after membership + Investigation authority succeeds",
      "Global scientific identity does not imply unauthenticated or global mutation authority",
      "fake GUC tuple with no matching membership -> BLOCKED",
      "SECURITY DEFINER regression proves invoking as investing_app with forged custom GUC values cannot bypass tenant_memberships + research_investigations authority resolution",
      "elevated table capability is not authorization",
    ]) expect(contract).toContain(token);
  });

  it("freezes protocol evolution storage without weakening current writer authority", () => {
    const contract = read(contractPath);
    for (const token of [
      "Protocol table storage is a version-forward immutable scientific protocol registry",
      "hash_hex text not null check (hash_hex ~ '^[0-9A-F]{64}$')",
      "protocol_hash_hex text not null check (protocol_hash_hex ~ '^[0-9A-F]{64}$')",
      "current writer authority != permanent storage-domain restriction",
      "Current root and same-protocol evaluation-plan writers only admit the current RL-8 V1 protocol",
      "Anything else through the current root/evaluation writer fails closed with `INCOMPATIBLE_PROTOCOL_VERSION`",
      "The current protocol writer admits only `protocolId = SCIENTIFIC_PROMOTION_PROTOCOL_V20261002`",
      "Future protocol identities require a new frozen methodology contract",
      "No generic arbitrary-protocol insertion is permitted",
      "No mutable `currentProtocol` column",
      "No environment-selected protocol",
      "The supersession writer does not create successor protocol, successor root or future methodology",
      "successor protocol != old protocol",
      "future root cannot be created through CURRENT V1 root writer unless explicitly admitted by future authority",
    ]) expect(contract).toContain(token);
    expect(contract).not.toContain(`hash_hex text check = '${expectedProtocolHash}'`);
    expect(contract).not.toContain(`protocol_hash_hex text not null check = '${expectedProtocolHash}'`);
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
      "If SELECT is required",
      "minimum SELECT/INSERT required",
      "as appropriate",
      "EXISTING_OR_RL8C1_VERIFY_REQUIRED",
      "EXISTING_EXACT_KEY: research_validation_assessment_protocols_authority_key",
      "research_scientific_promotion_transitions_rl8c_successor_root_key",
      "Predecessor composite FK uses MATCH FULL",
      "Rejected composite FK uses MATCH FULL",
      "Supersedes composite FK uses MATCH FULL",
    ]) expect(contract.slice(0, contract.indexOf("## 21. Forbidden stale wording"))).not.toContain(forbidden);
    const files = fs.readdirSync(path.join(repoRoot, "supabase", "migrations"));
    expect(files).not.toContain("I5_RL8C_SCIENTIFIC_PROMOTION_PERSISTENCE_CONTRACT_V1.sql");
    expect(contract).toContain("no SQL, no migration, no table, no function, no trigger");
  });
});