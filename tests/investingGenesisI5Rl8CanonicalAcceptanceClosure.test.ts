import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

describe("I5 RL-8 final canonical acceptance closure", () => {
  it("records dedicated current acceptance without rewriting historical candidate slices", () => {
    const contract = read("docs/investing-genesis/I5_RL8_SCIENTIFIC_PROMOTION_STATE_MACHINE_V1_IMPLEMENTATION_CLOSURE_OWNER_CONTRACT_V1.md");
    const design = read("docs/investing-genesis/I5_RL8_SCIENTIFIC_PROMOTION_STATE_MACHINE_V1_DESIGN_FREEZE_V1.md");
    const persistence = read("docs/investing-genesis/I5_RL8C_SCIENTIFIC_PROMOTION_PERSISTENCE_CONTRACT_V1.md");

    expect(contract).toContain("CURRENT ACCEPTED OWNER CONTRACT - RL-8 SCIENTIFIC PROMOTION STATE MACHINE V1 IMPLEMENTATION CLOSURE - UNNUMBERED");
    expect(contract).toContain("CURRENT_ACCEPTED / RL-8_SCIENTIFIC_PROMOTION_STATE_MACHINE_V1_IMPLEMENTATION_CLOSURE / UNNUMBERED");
    expect(contract).toContain("cd0a7aa9c95593aa11c0f3ce459af97d8c7fca42");
    expect(contract).toContain("0ad330bca67a3cfe5fee8de42036f09925f48087");
    expect(contract).toContain("Implementation PR:\n\`#121\`");
    expect(contract).toContain("CI: \`#1517 / SUCCESS\`");
    expect(contract).toContain("Investing Supabase Reconciliation PG17: \`#175 / SUCCESS\`");
    expect(contract).toContain("CURRENT_ACCEPTED / PRODUCTION GATE PASSED / POST-APPLY AUDITED");

    expect(design).toContain("RL-8 acceptance:\n\`NOT ACCEPTED\`");
    expect(design).toContain("Runtime implementation:\n\`NOT IMPLEMENTED BY THIS SLICE\`");
    expect(persistence).toContain("Acceptance: \`NOT ACCEPTED\`");
    expect(persistence).toContain("Production mutation: \`NONE\`");
  });

  it("freezes the accepted RL-8 state-machine and downstream authority boundary", () => {
    const contract = read("docs/investing-genesis/I5_RL8_SCIENTIFIC_PROMOTION_STATE_MACHINE_V1_IMPLEMENTATION_CLOSURE_OWNER_CONTRACT_V1.md");

    for (const token of [
      "DRAFT_RESEARCH",
      "EXECUTED",
      "INSUFFICIENT_EVIDENCE",
      "VALIDATION_FAILED",
      "VALIDATION_PASSED",
      "PROMOTION_ELIGIBLE",
      "REJECTED",
      "SUPERSEDED",
      "SYNTRAKE:SCIENTIFIC_PROMOTION_PROTOCOL:V1",
      "SYNTRAKE:SCIENTIFIC_PROMOTION_TRANSITION:V1",
    ]) expect(contract).toContain(token);

    expect(contract).toContain("PROMOTION_ELIGIBLE\` is scientific-governance evidence only");
    expect(contract).toContain("RL-9 remains the next Research Lab closure");
    expect(contract).toContain("I5 RESEARCH LAB = IN_PROGRESS / RL-9_TO_RL-11 / PRODUCT_UI_DEFERRED");
    expect(contract).not.toContain("I5 RESEARCH LAB = BACKEND_COMPLETE / PRODUCT_UI_DEFERRED");
  });

  it("freezes the exact production migration and managed-Supabase authority evidence", () => {
    const contract = read("docs/investing-genesis/I5_RL8_SCIENTIFIC_PROMOTION_STATE_MACHINE_V1_IMPLEMENTATION_CLOSURE_OWNER_CONTRACT_V1.md");

    for (const token of [
      "20261004120000_investing_i5_rl8c1_scientific_promotion_schema_authority.sql",
      "20261007120000_investing_i5_rl8c2_scientific_promotion_writers.sql",
      "20261007143000_investing_i5_rl8c3_scientific_promotion_supersession_writer.sql",
      "20261009043031 investing_i5_rl8c1_scientific_promotion_schema_authority",
      "20261009043034 investing_i5_rl8c2_scientific_promotion_writers",
      "20261009043037 investing_i5_rl8c3_scientific_promotion_supersession_writer",
      "qdnvbamoamtkujzwrxdb",
      "Security Advisor RL-8 findings: \`ZERO\`",
      "18 unindexed_foreign_keys INFO + 16 auth_rls_initplan WARN / NON-BLOCKING",
    ]) expect(contract).toContain(token);

    expect(contract).toContain("persist_research_scientific_promotion_supersession_v1(uuid,text,jsonb,uuid,uuid)");
    expect(contract).toContain("The obsolete three-argument supersession overload is absent");
    expect(contract).toContain("no final \`CREATE\` on schema \`investing\`");
    expect(contract).toContain("no residual postgres self-grant");
  });

  it("advances the canonical Research Lab frontier exactly to RL-9 through RL-11", () => {
    const state = read("docs/investing-genesis/CANONICAL_CURRENT_STATE.md");

    expect(state).toContain("I5 RL-8 Scientific Promotion State Machine V1 Implementation Closure (unnumbered)");
    expect(state).toContain("I5_RL8_SCIENTIFIC_PROMOTION_STATE_MACHINE_V1_IMPLEMENTATION_CLOSURE_OWNER_CONTRACT_V1.md");
    expect(state).toContain("CURRENT_ACCEPTED / RL-8_SCIENTIFIC_PROMOTION_STATE_MACHINE_V1_IMPLEMENTATION_CLOSURE / UNNUMBERED");
    expect(state).toContain("RL-8 Production migrations = APPLIED / POST-APPLY AUDITED");
    expect(state).toContain("20261009043037 investing_i5_rl8c3_scientific_promotion_supersession_writer");
    expect(state).toContain("I5 RESEARCH LAB = IN_PROGRESS / RL-9_TO_RL-11 / PRODUCT_UI_DEFERRED");
    expect(state).not.toContain("I5 RESEARCH LAB = IN_PROGRESS / RL-8_TO_RL-11 / PRODUCT_UI_DEFERRED");
  });
});
