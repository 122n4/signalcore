import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

describe("I5 RL-7 recovery acceptance closure", () => {
  it("records a dedicated recovery candidate contract without rewriting historical design-slice facts", () => {
    const contract = read("docs/investing-genesis/I5_RL7_ROBUSTNESS_EXPERIMENT_COMPARISON_V1_IMPLEMENTATION_CLOSURE_OWNER_CONTRACT_V1.md");
    const design = read("docs/investing-genesis/I5_RL7_ROBUSTNESS_EXPERIMENT_COMPARISON_V1_DESIGN_FREEZE_V1.md");

    expect(contract).toContain("RECOVERY CANDIDATE OWNER CONTRACT - RL-7 ROBUSTNESS AND EXPERIMENT COMPARISON V1 IMPLEMENTATION CLOSURE - UNNUMBERED");
    expect(contract).toContain("RECOVERY_CANDIDATE / RL-7_ROBUSTNESS_EXPERIMENT_COMPARISON_V1_IMPLEMENTATION_CLOSURE / UNNUMBERED / NOT_ACCEPTED_YET");
    expect(contract).toContain("425c635ba822e8c9c6fe78f673b1889a827b92be");
    expect(contract).toContain("#105");
    expect(contract).toContain("6cfd148cba970d81bbd3f32a2435f4994a242847");
    expect(contract).toContain("05b4192557e8e2c22f63769774a1ca2985199e62");
    expect(contract).toContain("cc12b1619e014d3deb566d303f878e99c04aef0c");
    expect(contract).toContain("PENDING INDEPENDENT ACCEPTANCE AUDIT / PRODUCTION GATE STILL REQUIRED");
    expect(contract).toContain("Fresh exact-candidate real PG17 execution:\n`PENDING EXTERNAL PG17 GATE`");
    expect(contract).toContain("Skipped local PG17 tests without `PG17_RECONCILIATION_URL` are not real PG17");

    expect(design).toContain("RL-7 acceptance:\n`NOT ACCEPTED`");
    expect(design).toContain("Runtime implementation:\n`NOT IMPLEMENTED BY THIS SLICE`");
  });

  it("keeps exact RL-7 scientific identities and deterministic comparison boundaries in the recovery candidate", () => {
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

    expect(contract).toContain("`buildExperimentComparisonResultV1` is the recovery candidate's pure");
    expect(contract).toContain("Caller-provided deltas, compatibility conclusions, PASS/FAIL");

    expect(canonical).toContain("\"SYNTRAKE:EXPERIMENT_COMPARISON_PROTOCOL:V1\": \"OWNER_PAYLOAD_EXACT\"");
    expect(canonical).toContain("\"SYNTRAKE:EXPERIMENT_COMPARISON_RESULT:V1\": \"OWNER_PAYLOAD_EXACT\"");
    expect(hash).toContain("| `SYNTRAKE:EXPERIMENT_COMPARISON_PROTOCOL:V1` | `OWNER_PAYLOAD_EXACT` |");
    expect(hash).toContain("| `SYNTRAKE:EXPERIMENT_COMPARISON_RESULT:V1` | `OWNER_PAYLOAD_EXACT` |");
  });

  it("freezes append-only security-invoker persistence and leaves Production untouched", () => {
    const contract = read("docs/investing-genesis/I5_RL7_ROBUSTNESS_EXPERIMENT_COMPARISON_V1_IMPLEMENTATION_CLOSURE_OWNER_CONTRACT_V1.md");
    const migrationA = read("supabase/migrations/20260928080318_investing_i5_rl7_experiment_comparison_v1.sql");
    const migrationB = read("supabase/migrations/20260928090809_investing_i5_rl7_experiment_comparison_persistence_closure.sql");

    expect(contract).toContain("Production migration:\n`NOT APPLIED`");
    expect(contract).toContain("Supabase Production:\n`UNCHANGED BY THIS CLOSURE`");
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

  it("keeps the canonical frontier at RL-7 recovery while preserving Production pending truth", () => {
    const state = read("docs/investing-genesis/CANONICAL_CURRENT_STATE.md");

    expect(state).toContain("I5 RL-7 Robustness And Experiment Comparison V1 Implementation Closure (unnumbered)");
    expect(state).toContain("I5_RL7_ROBUSTNESS_EXPERIMENT_COMPARISON_V1_IMPLEMENTATION_CLOSURE_OWNER_CONTRACT_V1.md");
    expect(state).toContain("RECOVERY_CANDIDATE / RL-7_ROBUSTNESS_EXPERIMENT_COMPARISON_V1_IMPLEMENTATION_CLOSURE");
    expect(state).toContain("I5 RESEARCH LAB = IN_PROGRESS / RL-7_RECOVERY_TO_RL-11 / PRODUCT_UI_DEFERRED");
    expect(state).not.toContain("I5 RESEARCH LAB = IN_PROGRESS / RL-8_TO_RL-11 / PRODUCT_UI_DEFERRED");
    expect(state).toContain("RL-7 Production migrations = NOT APPLIED / SEPARATE PRODUCTION GATE REQUIRED");
    expect(state).toContain("20260928080318 + 20260928090809");
    expect(state).toContain("101 versions");
    expect(state).toContain("20260930190148 investing_i5_rl3d_postapply_performance_remediation");
  });
});
