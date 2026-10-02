import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

describe("I5 RL-7 final canonical acceptance closure", () => {
  it("records a dedicated current accepted contract without rewriting historical design-slice facts", () => {
    const contract = read("docs/investing-genesis/I5_RL7_ROBUSTNESS_EXPERIMENT_COMPARISON_V1_IMPLEMENTATION_CLOSURE_OWNER_CONTRACT_V1.md");
    const design = read("docs/investing-genesis/I5_RL7_ROBUSTNESS_EXPERIMENT_COMPARISON_V1_DESIGN_FREEZE_V1.md");

    expect(contract).toContain("CURRENT ACCEPTED OWNER CONTRACT - RL-7 ROBUSTNESS AND EXPERIMENT COMPARISON V1 IMPLEMENTATION CLOSURE - UNNUMBERED");
    expect(contract).toContain("CURRENT_ACCEPTED / RL-7_ROBUSTNESS_EXPERIMENT_COMPARISON_V1_IMPLEMENTATION_CLOSURE / UNNUMBERED");
    expect(contract).toContain("425c635ba822e8c9c6fe78f673b1889a827b92be");
    expect(contract).toContain("#105");
    expect(contract).toContain("6cfd148cba970d81bbd3f32a2435f4994a242847");
    expect(contract).toContain("05b4192557e8e2c22f63769774a1ca2985199e62");
    expect(contract).toContain("cc12b1619e014d3deb566d303f878e99c04aef0c");
    expect(contract).toContain("CURRENT_ACCEPTED / PRODUCTION GATE PASSED / POST-APPLY AUDITED");
    expect(contract).toContain("Fresh exact-candidate real PG17 execution:\n`PASS / POSTGRESQL 17`");
    expect(contract).toContain("CI: `#1444 / SUCCESS`");
    expect(contract).toContain("PostgreSQL 17 gate: `#157 / SUCCESS`");

    expect(design).toContain("RL-7 acceptance:\n`NOT ACCEPTED`");
    expect(design).toContain("Runtime implementation:\n`NOT IMPLEMENTED BY THIS SLICE`");
  });

  it("keeps exact RL-7 scientific identities and deterministic comparison boundaries in the accepted closure", () => {
    const contract = read("docs/investing-genesis/I5_RL7_ROBUSTNESS_EXPERIMENT_COMPARISON_V1_IMPLEMENTATION_CLOSURE_OWNER_CONTRACT_V1.md");
    const canonical = read("lib/investing/research/canonical.ts");
    const hash = read("docs/investing-genesis/I5A_CANONICAL_HASH_DOMAINS_V1.md");

    for (const token of [
      "SYNTRAKE:EXPERIMENT_COMPARISON_PROTOCOL:V1",
      "SYNTRAKE:EXPERIMENT_COMPARISON_RESULT:V1",
      "OWNER_PAYLOAD_EXACT",
      "ROBUSTNESS_COMPARISON_POLICY_V20260927",
      "ROBUSTNESS_STABLE",
      "ROBUSTNESS_MIXED",
      "ROBUSTNESS_DEGRADED",
      "ROBUSTNESS_UNSTABLE",
      "ROBUSTNESS_INSUFFICIENT_EVIDENCE",
    ]) expect(contract).toContain(token);

    expect(contract).toContain("## Current Accepted Scope");
    expect(contract).toContain("`buildExperimentComparisonResultV1` is the current accepted closure's pure");
    expect(contract).toContain("Caller-provided deltas, compatibility conclusions, PASS/FAIL");

    expect(canonical).toContain("\"SYNTRAKE:EXPERIMENT_COMPARISON_PROTOCOL:V1\": \"OWNER_PAYLOAD_EXACT\"");
    expect(canonical).toContain("\"SYNTRAKE:EXPERIMENT_COMPARISON_RESULT:V1\": \"OWNER_PAYLOAD_EXACT\"");
    expect(hash).toContain("| `SYNTRAKE:EXPERIMENT_COMPARISON_PROTOCOL:V1` | `OWNER_PAYLOAD_EXACT` |");
    expect(hash).toContain("| `SYNTRAKE:EXPERIMENT_COMPARISON_RESULT:V1` | `OWNER_PAYLOAD_EXACT` |");
  });

  it("freezes append-only security-invoker persistence and Production post-apply state", () => {
    const contract = read("docs/investing-genesis/I5_RL7_ROBUSTNESS_EXPERIMENT_COMPARISON_V1_IMPLEMENTATION_CLOSURE_OWNER_CONTRACT_V1.md");
    const migrationA = read("supabase/migrations/20260928080318_investing_i5_rl7_experiment_comparison_v1.sql");
    const migrationB = read("supabase/migrations/20260928090809_investing_i5_rl7_experiment_comparison_persistence_closure.sql");

    expect(contract).toContain("Production migration:\n`APPLIED / POST-APPLY AUDITED`");
    expect(contract).toContain("Supabase Production:\n`RL-7 MIGRATIONS APPLIED / POST-APPLY AUDITED`");
    expect(contract).toContain("20260928080318_investing_i5_rl7_experiment_comparison_v1.sql");
    expect(contract).toContain("20260928090809_investing_i5_rl7_experiment_comparison_persistence_closure.sql");
    expect(contract).toContain("20261001090000_investing_i5_rl7_remove_redundant_row_locks.sql");
    expect(contract).toContain("20261002202439_investing_i5_rl7_preproduction_function_search_path.sql");
    expect(contract).toContain("removes redundant row-lock/UPDATE-privilege requirements");
    expect(contract).toContain("pre-production Security Advisor remediation");
    expect(contract).toContain("search_path=pg_catalog");
    expect(contract).toContain("does not\nchange persistence logic, authority semantics, grants, RLS, table structure or\npayload contracts");
    expect(contract).toContain("These migrations establish append-only protocol/result scientific identities");
    expect(contract).toContain("cumulative RL-7 migration set now applied and aligned in Production");
    expect(contract).toContain("Real PostgreSQL 17 verification of the concrete adapter");
    expect(contract).toContain("passed and is recorded in the final acceptance evidence below");
    expect(contract).toContain("Supabase Production project: `qdnvbamoamtkujzwrxdb`");
    expect(contract).toContain("Security Advisor RL-7 findings: `ZERO`");
    expect(contract).toContain("Performance Advisor RL-7 findings: `4 unindexed_foreign_keys INFO / NON-BLOCKING`");
    expect(contract).not.toContain(["its", ["two", "migrations"].join(" "), "remain"].join(" "));
    expect(contract).not.toContain("## Recovery Candidate Scope");
    expect(contract).not.toContain("recovery candidate's pure");
    expect(contract).not.toContain("remains a required acceptance gate");
    expect(contract).not.toContain("required before Production can be considered aligned");
    expect(contract).toContain("REUSED_IDENTICAL");
    expect(contract).toContain("SECURITY INVOKER");
    expect(contract).toContain("RL-10");
    expect(contract).toContain("RL-7 does not decide promotion");

    expect(migrationA.toLowerCase()).toContain("force row level security");
    expect(migrationB.toLowerCase()).toContain("security invoker");
    expect(migrationB).toContain("pg_advisory_xact_lock");
    expect(migrationB).toContain("RL7_EXPERIMENT_COMPARISON_PROTOCOL_CONFLICT");
    expect(migrationB).toContain("RL7_EXPERIMENT_COMPARISON_RESULT_CONFLICT");
  });

  it("keeps the canonical frontier after RL-7 acceptance while preserving downstream boundaries", () => {
    const state = read("docs/investing-genesis/CANONICAL_CURRENT_STATE.md");

    expect(state).toContain("I5 RL-7 Robustness And Experiment Comparison V1 Implementation Closure (unnumbered)");
    expect(state).toContain("I5_RL7_ROBUSTNESS_EXPERIMENT_COMPARISON_V1_IMPLEMENTATION_CLOSURE_OWNER_CONTRACT_V1.md");
    expect(state).toContain("CURRENT_ACCEPTED / RL-7_ROBUSTNESS_EXPERIMENT_COMPARISON_V1_IMPLEMENTATION_CLOSURE");
    expect(state).toContain("I5 RESEARCH LAB = IN_PROGRESS / RL-8_TO_RL-11 / PRODUCT_UI_DEFERRED");
    expect(state).not.toContain("Ã¢â‚¬â€");
    expect(state).not.toContain("Ã¢");
    expect(state).not.toContain("Ãƒ");
    expect(state).not.toContain("RL-7 post-apply audit:\\n");
    expect(state).not.toContain("I5 RESEARCH LAB = IN_PROGRESS / RL-7_RECOVERY_TO_RL-11 / PRODUCT_UI_DEFERRED");
    expect(state).toContain("RL-7 Production migrations = APPLIED / POST-APPLY AUDITED");
    expect(state).toContain("20260928080318 + 20260928090809 + 20261001090000 + 20261002202439");
    expect(state).toContain("RL-7 Git migration correction = 20261001090000 removes redundant row-lock/UPDATE-privilege requirements");
    expect(state).toContain("RL-7 pre-production security remediation = 20261002202439 fixes function search_path=pg_catalog");
    expect(state).toContain("RL-7 migration ledger alignment:\n  `PASS / EXACT FOUR-MIGRATION SET`");
    expect(state).toContain("20261002202439 investing_i5_rl7_preproduction_function_search_path");
  });
});
