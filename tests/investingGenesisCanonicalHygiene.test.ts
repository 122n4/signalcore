import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..");
const docsRoot = path.join(repoRoot, "docs", "investing-genesis");

const removedDocs = [
  "I3A_IMPLEMENTATION_CHECKPOINT.md",
  "I3B_IMPLEMENTATION_CHECKPOINT.md",
  "I5A_RESEARCH_LAB_DOMAIN_DESIGN.md",
  "I5A_RESEARCH_LAB_DESIGN_DECISIONS_V1.md",
  "I5A_RESEARCH_LAB_DESIGN_AUDIT_AND_AMENDMENTS_V1.md",
  "I5A_RESEARCH_CANONICAL_TYPES_V1.md",
  "I5A_RESEARCH_IR_HASH_CONTRACT_V1.md",
  "I5A_AUTHORITY_SCOPE_CONTRACT_V1.md",
  "I5A_ROOTS_REVISIONS_IMMUTABILITY_V1.md",
  "I5A_ROOTS_REVISIONS_IMMUTABILITY_AMENDMENT_V1.md",
  "I5A_ROOTS_REVISIONS_IMMUTABILITY_AMENDMENT_V2.md",
  "I5A_ROOTS_REVISIONS_IMMUTABILITY_AMENDMENT_V3.md",
  "I5A_CANONICAL_BYTES_HASH_PREIMAGES_V1.md",
  "I5A_CANONICAL_BYTES_HASH_PREIMAGES_AMENDMENT_V1.md",
] as const;

const requiredCurrentDocs = [
  "CANONICAL_CURRENT_STATE.md",
  "I5A_MATERIAL_REVISIONS_OWNER_CONTRACT_V1.md",
  "I5A_CANONICAL_HASH_DOMAINS_V1.md",
  "I0_CONSTITUTION.md",
  "I1_AUTHORITY_DESIGN.md",
  "I1_DB_BOUNDARY_CONTRACT.md",
  "I2_LEDGER_DESIGN.md",
  "I3_ACCOUNTING_DESIGN.md",
  "I3_ACCOUNTING_DESIGN_FREEZE.md",
  "I4_PLAN_DESIGN.md",
  "I4B_CANONICAL_BYTES_CONTRACT.md",
  "I4B_PLAN_PERSISTENCE_DESIGN.md",
  "I4C_PLAN_WRITER_DESIGN.md",
  "I4C_RECONCILIATION.md",
  "I4_MASTER_CHECKPOINT.md",
  "I5_MATERIAL_COMMAND_IDENTITY_V1.md",
  "I5A_RESEARCH_IR_OWNER_CONTRACT_V1.md",
  "I5_EXPERIMENT_BASELINE_ADMISSION_OWNER_CONTRACT_V1.md",
  "I5_EXPERIMENT_SCIENTIFIC_CLOSURE_OWNER_CONTRACT_V1.md",
  "I5_DATASET_RUN_SCIENTIFIC_CLOSURE_OWNER_CONTRACT_V1.md",
  "I5_RESEARCH_EXECUTION_CLOSURE_OWNER_CONTRACT_V1.md",
  "I5_RL1_EVIDENCE_OBJECT_SCIENTIFIC_CLOSURE_OWNER_CONTRACT_V1.md",
  "I5_RL2_EVIDENCE_LEDGER_PASSPORT_OWNER_CONTRACT_V1.md",
  "I5_RL3_VALIDATION_PROTOCOL_OWNER_CONTRACT_V1.md",
  "I5_RL3B_VALIDATION_CHILD_EXECUTION_OWNER_CONTRACT_V1.md",
  "I5_RESEARCH_LAB_COMPLETION_PROGRAM_V1.md",
] as const;

const scannedRoots = ["AGENTS.md", "docs", "lib", "tests", "package.json", "tsconfig.json"] as const;

function walk(relativePath: string): string[] {
  const absolute = path.join(repoRoot, relativePath);
  if (!fs.existsSync(absolute)) return [];
  const stat = fs.statSync(absolute);
  if (stat.isFile()) return [relativePath.replaceAll("\\", "/")];
  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const child = path.join(relativePath, entry.name);
    if (entry.name === "node_modules" || entry.name === ".next" || entry.name === ".git") return [];
    if (entry.isDirectory()) return walk(child);
    if (entry.isFile()) return [child.replaceAll("\\", "/")];
    return [];
  });
}

function read(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function tableRow(source: string, label: string): string {
  return source.split(/\r?\n/u).find((line) => line.startsWith(`| ${label} |`)) ?? "";
}

describe("Investing Genesis canonical hygiene", () => {
  it("removes superseded active-tree documents and keeps current consolidated contracts", () => {
    for (const file of removedDocs) {
      expect(fs.existsSync(path.join(docsRoot, file)), file).toBe(false);
    }
    for (const file of requiredCurrentDocs) {
      expect(fs.existsSync(path.join(docsRoot, file)), file).toBe(true);
    }
  });

  it("uses current canonical state status rather than candidate hygiene language", () => {
    const state = read("docs/investing-genesis/CANONICAL_CURRENT_STATE.md");

    expect(state).toContain("Status: `CURRENT CANONICAL STATE MAP`");
    expect(state).not.toContain("CURRENT STATE MAP - HYGIENE CANDIDATE");
  });

  it("keeps the Research Lab Build Spec as reference only", () => {
    const activeDocs = fs.readdirSync(docsRoot)
      .filter((entry) => entry.endsWith(".md"))
      .map((entry) => read(path.join("docs", "investing-genesis", entry)))
      .join("\n");

    expect(activeDocs).toContain("is reference/blueprint only");
    expect(activeDocs).not.toMatch(/Build Spec[^.\n]*(authoritative|source specification authority|Source of Truth)/i);
    expect(activeDocs).not.toMatch(/authoritative[^.\n]*Build Spec/i);
  });

  it("preserves Core/Lab/Paper boundaries and the complete rehearsal model", () => {
    const state = read("docs/investing-genesis/CANONICAL_CURRENT_STATE.md");
    expect(state).toContain("CORE != LAB");
    expect(state).toContain("LAB != PAPER");
    expect(state).toContain("A. `EXECUTION REHEARSAL`");
    expect(state).toContain("B. `CANONICAL INTEGRITY REHEARSAL`");
    expect(state).toContain("C. `REPOSITORY CONTROL PLANE`");
    expect(state).toContain("WHAT DID THIS SLICE SUPERSEDE?");
    expect(state).toContain("R0 -> R1 -> R2 -> R3 -> R4 -> R5 -> R6 -> R7");
    expect(state).not.toContain("R8");
    expect(state).not.toContain("R9");
  });

  it("locks the accepted finite Research Lab completion program without closing I5 early", () => {
    const state = read("docs/investing-genesis/CANONICAL_CURRENT_STATE.md");
    const program = read("docs/investing-genesis/I5_RESEARCH_LAB_COMPLETION_PROGRAM_V1.md");

    expect(program).toContain("CURRENT ACCEPTED DESIGN CONTRACT - RESEARCH LAB COMPLETION PROGRAM - UNNUMBERED");
    expect(program).toContain("CURRENT_ACCEPTED / RESEARCH_LAB_COMPLETION_PROGRAM / UNNUMBERED");
    expect(program).toContain("RL-1 - Evidence Object Scientific Closure");
    expect(program).toContain("RL-11 - I5 Research Lab Full Rehearsal And Closure");
    expect(program).toContain("I5 RESEARCH LAB = BACKEND_COMPLETE / PRODUCT_UI_DEFERRED");
    expect(program).toContain("I5 RESEARCH LAB COMPLETION PROGRAM = CURRENT_ACCEPTED / UNNUMBERED");
    expect(program).toContain("5c86dbf7094b33dc2612b613c791b899fa29f6c4");
    expect(program).toContain("35508567814 - SUCCESS");
    expect(state).toContain("I5 Research Lab completion program (unnumbered)");
    expect(state).toContain("I5 RESEARCH LAB COMPLETION PROGRAM = CURRENT_ACCEPTED / UNNUMBERED");
    expect(state).toContain("Research Lab is not yet backend-complete");
    expect(state).toContain("I5 RESEARCH LAB = IN_PROGRESS / RL-4_TO_RL-11 / PRODUCT_UI_DEFERRED");
    expect(state).not.toMatch(/^`I5 RESEARCH LAB = BACKEND_COMPLETE \/ PRODUCT_UI_DEFERRED`/mu);
  });

  it("records accepted RL-1 Evidence Object Scientific Closure without public generic Evidence hashing", () => {
    const state = read("docs/investing-genesis/CANONICAL_CURRENT_STATE.md");
    const contract = read("docs/investing-genesis/I5_RL1_EVIDENCE_OBJECT_SCIENTIFIC_CLOSURE_OWNER_CONTRACT_V1.md");
    const hash = read("docs/investing-genesis/I5A_CANONICAL_HASH_DOMAINS_V1.md");
    const row = tableRow(state, "RL-1 Evidence Object Scientific Closure / unnumbered");

    expect(contract).toContain("CURRENT ACCEPTED OWNER CONTRACT - RL-1 EVIDENCE OBJECT SCIENTIFIC CLOSURE - UNNUMBERED");
    expect(contract).toContain("CURRENT_ACCEPTED / RL-1_EVIDENCE_OBJECT_SCIENTIFIC_CLOSURE / UNNUMBERED");
    expect(contract).toContain("1f7ab6ec80b7de1c47e68958ddd309dbb53f1f8c");
    expect(contract).toContain("35518056377 - SUCCESS");
    expect(contract).toContain("35518056379 - SUCCESS");
    expect(contract).toContain("17.11 (Debian 17.11-1.pgdg13+2)");
    expect(contract).toContain("Production migration application:");
    expect(contract).toContain("`NOT PERFORMED`");
    expect(contract).toContain("Permanent A-number:");
    expect(contract).toContain("`NOT ASSIGNED`");
    expect(state).toContain("I5 RL-1 Evidence Object Scientific Closure acceptance evidence:");
    expect(state).toContain("213 passed / 17 skipped files");
    expect(state).toContain("1165 passed / 36 skipped tests");
    expect(state).toContain("Dependency audit:");
    expect(state).toContain("0 vulnerabilities");
    expect(row).toContain("| YES | YES |");
    expect(row).toContain("CURRENT_ACCEPTED / RL-1_EVIDENCE_OBJECT_SCIENTIFIC_CLOSURE");
    expect(row).toContain("| NONE |");
    expect(state).toContain("RL-1 runtime/progression state:");
    expect(state).toContain("design: `YES`");
    expect(state).toContain("implementation: `YES`");
    expect(state).toContain("state: `CURRENT_ACCEPTED / RL-1_EVIDENCE_OBJECT_SCIENTIFIC_CLOSURE`");
    expect(state).toContain("permanent A-number: `NONE`");
    expect(hash).toContain("`SYNTRAKE:EVIDENCE_OBJECT:V1` | `CONTENT_PREIMAGE_EXACT`");
    expect(hash).toContain("current accepted through RL-1 Evidence Object Scientific Closure");
    expect(hash).toContain("RESEARCH_EXECUTION_EVIDENCE_V1");
    expect(hash).toContain("Generic or arbitrary raw Evidence hashing is not a sanctioned");
    expect(hash).toContain("Arbitrary raw Evidence objects remain outside the public hashing boundary");
    expect(state).toContain("I5 RESEARCH LAB = IN_PROGRESS / RL-4_TO_RL-11 / PRODUCT_UI_DEFERRED");
    expect(state).not.toMatch(/^`I5 RESEARCH LAB = BACKEND_COMPLETE \/ PRODUCT_UI_DEFERRED`/mu);
  });

  it("records accepted RL-2 Evidence Ledger and Passport without creating Passport scientific authority", () => {
    const state = read("docs/investing-genesis/CANONICAL_CURRENT_STATE.md");
    const contract = read("docs/investing-genesis/I5_RL2_EVIDENCE_LEDGER_PASSPORT_OWNER_CONTRACT_V1.md");
    const hash = read("docs/investing-genesis/I5A_CANONICAL_HASH_DOMAINS_V1.md");
    const row = tableRow(state, "RL-2 Evidence Ledger and Passport / unnumbered");

    expect(contract).toContain("CURRENT ACCEPTED OWNER CONTRACT - RL-2 EVIDENCE LEDGER AND PASSPORT V1 - UNNUMBERED");
    expect(contract).toContain("CURRENT_ACCEPTED / RL-2_EVIDENCE_LEDGER_PASSPORT / UNNUMBERED");
    expect(contract).toContain("Canonical predecessor: `15444892a8b12bd53ec8e48d4162093482c4fa40`");
    expect(contract).toContain("Technical candidate: `326feaf0c047c36a88a3be1c0cc71a573d75ffa5`");
    expect(contract).toContain("CI: `35774520717 - SUCCESS`");
    expect(contract).toContain("PG17: `35774520535 - SUCCESS`");
    expect(contract).toContain("Historical PG17 job: `106904206482 - SUCCESS`");
    expect(contract).toContain("Cumulative compatibility PG17 job: `106904206842 - SUCCESS`");
    expect(contract).toContain("RL-2 dedicated PostgreSQL rehearsal: `7 / 7 PASS`");
    expect(contract).toContain("Independent auditor verdict: `PASS`");
    expect(contract).toContain("Production migration application: `NOT PERFORMED`");
    expect(contract).toContain("Production RL-2 migration application: `NOT PERFORMED`");
    expect(contract).toContain("Permanent A-number: `NOT ASSIGNED`");
    expect(contract).toContain("Passport V1 is a deterministic projection/read model");
    expect(contract).toContain("not a Passport persistence table");
    expect(contract).toContain("not a new hash domain");
    expect(contract).toContain("NO_HYPOTHESIS");
    expect(contract).toContain("RunInput ResearchSpec scientific hash drift");
    expect(contract).toContain("RunInput Research IR binding drift");
    expect(contract).toContain("RunInput Experiment binding drift");
    expect(contract).toContain("duplicate, or ambiguous ResearchSpec scientific identity");
    expect(contract).toContain("Cross-tenant, cross-principal and cross-membership Investigation access");
    expect(state).toContain("I5 RL-2 Evidence Ledger and Passport acceptance evidence:");
    expect(state).toContain("15444892a8b12bd53ec8e48d4162093482c4fa40");
    expect(state).toContain("326feaf0c047c36a88a3be1c0cc71a573d75ffa5");
    expect(state).toContain("35774520717 - SUCCESS");
    expect(state).toContain("35774520535 - SUCCESS");
    expect(state).toContain("106904206482 - SUCCESS");
    expect(state).toContain("106904206842 - SUCCESS");
    expect(state).toContain("7 / 7 PASS");
    expect(state).toContain("Independent auditor verdict:");
    expect(state).toContain("PASS");
    expect(state).toContain("Production RL-2 migration application:");
    expect(state).toContain("NOT PERFORMED");
    expect(state).toContain("Permanent A-number:");
    expect(state).toContain("NOT ASSIGNED");
    expect(state).toContain("I5 RL-2 EVIDENCE LEDGER AND PASSPORT V1 = CURRENT_ACCEPTED / UNNUMBERED");
    expect(state).toContain("I5 RESEARCH LAB = IN_PROGRESS / RL-4_TO_RL-11 / PRODUCT_UI_DEFERRED");
    expect(state).toContain("Research Lab is not yet backend-complete");
    expect(state).not.toMatch(/^`I5 RESEARCH LAB = BACKEND_COMPLETE \/ PRODUCT_UI_DEFERRED`/mu);
    expect(row).toContain("| YES | YES |");
    expect(row).toContain("CURRENT ACCEPTED OWNER CONTRACT - RL-2 EVIDENCE LEDGER AND PASSPORT V1 - UNNUMBERED");
    expect(row).toContain("CURRENT_ACCEPTED / RL-2_EVIDENCE_LEDGER_PASSPORT");
    expect(row).toContain("| NONE |");
    expect(hash).toContain("RESEARCH_PASSPORT_V1 has no scientific hash domain");
    expect(hash).toContain("Evidence Ledger V1 has no independent scientific hash identity");
    expect(hash).not.toContain("SYNTRAKE:PASSPORT");
    expect(hash).not.toContain("SYNTRAKE:RESEARCH_PASSPORT");
  });

  it("records accepted RL-3A Validation Protocol Foundation without closing RL-3", () => {
    const state = read("docs/investing-genesis/CANONICAL_CURRENT_STATE.md");
    const contract = read("docs/investing-genesis/I5_RL3_VALIDATION_PROTOCOL_OWNER_CONTRACT_V1.md");
    const hash = read("docs/investing-genesis/I5A_CANONICAL_HASH_DOMAINS_V1.md");
    const row = tableRow(state, "RL-3A Validation Protocol Foundation / unnumbered");

    expect(contract).toContain("CURRENT_ACCEPTED / RL-3A_VALIDATION_PROTOCOL_FOUNDATION / UNNUMBERED");
    expect(contract).toContain("This acceptance covers only RL-3A Validation Protocol Foundation");
    expect(contract).toContain("accept complete RL-3, RL-3B, RL-3C, Validation Result");
    expect(contract).toContain("RL-3A does not execute validation runs, persist validation results");
    expect(contract).toContain("No migration, RLS policy, SQL function, database role, grant or Production");
    expect(hash).toContain("`SYNTRAKE:VALIDATION_PROTOCOL:V1` | `OWNER_PAYLOAD_EXACT`");
    expect(hash).toContain("current accepted through RL-3A Validation");
    expect(hash).toContain("Protocol Foundation as `OWNER_PAYLOAD_EXACT`");
    expect(hash).toContain("These accepted domains do not create aggregate Validation Result");
    expect(hash).toContain("promotion");
    expect(hash).toContain("blind-truth");
    expect(state).toContain("I5 RL-3A Validation Protocol Foundation (unnumbered)");
    expect(state).toContain("I5_RL3_VALIDATION_PROTOCOL_OWNER_CONTRACT_V1.md");
    expect(state).toContain("I5 RL-3A Validation Protocol Foundation acceptance evidence:");
    expect(state).toContain("fdc8351457c6e421163ec7144fb00dda6b7135f0");
    expect(state).toContain("3e7e61458b6b9ca16928e0ad1908e010d7134db3");
    expect(state).toContain("35784005405 - SUCCESS");
    expect(state).toContain("106936222294 - SUCCESS");
    expect(state).toContain("106936222042 - SUCCESS");
    expect(state).toContain("RL-3A dedicated tests:");
    expect(state).toContain("26 PASS");
    expect(state).toContain("Architecture boundaries:");
    expect(state).toContain("27 PASS");
    expect(state).toContain("1218 PASS / 43 SKIPPED");
    expect(state).toContain("NOT REQUIRED - NO PERSISTENCE / MIGRATION / RLS / SQL IN RL-3A");
    expect(state).toContain("Independent auditor verdict:");
    expect(state).toContain("PASS");
    expect(state).toContain("I5 RL-3A VALIDATION PROTOCOL FOUNDATION V1 = CURRENT_ACCEPTED / UNNUMBERED");
    expect(state).toContain("I5 RESEARCH LAB = IN_PROGRESS / RL-4_TO_RL-11 / PRODUCT_UI_DEFERRED");
    expect(row).toContain("| YES | YES |");
    expect(row).toContain("CURRENT ACCEPTED OWNER CONTRACT - RL-3A VALIDATION PROTOCOL FOUNDATION - UNNUMBERED");
    expect(row).toContain("CURRENT_ACCEPTED / RL-3A_VALIDATION_PROTOCOL_FOUNDATION");
    expect(row).toContain("| NONE |");
    expect(state).toContain("RL-3A runtime/progression state:");
    expect(state).toContain("state: `CURRENT_ACCEPTED / RL-3A_VALIDATION_PROTOCOL_FOUNDATION`");
    expect(state).toContain("permanent A-number: `NONE`");
  });

  it("records historical RL-3B acceptance without erasing later RL-3 closure", () => {
    const state = read("docs/investing-genesis/CANONICAL_CURRENT_STATE.md");
    const contract = read("docs/investing-genesis/I5_RL3B_VALIDATION_CHILD_EXECUTION_OWNER_CONTRACT_V1.md");
    const hash = read("docs/investing-genesis/I5A_CANONICAL_HASH_DOMAINS_V1.md");
    const row = tableRow(state, "RL-3B Validation Child Execution / unnumbered");

    expect(contract).toContain("CURRENT_ACCEPTED / RL-3B_VALIDATION_CHILD_EXECUTION / UNNUMBERED");
    expect(contract).toContain("`SYNTRAKE:RUN_INPUT:V1` cannot be reused for validation phases");
    expect(contract).toContain("`SYNTRAKE:VALIDATION_RUN_INPUT:V1 = OWNER_PAYLOAD_EXACT`");
    expect(contract).toContain("`SYNTRAKE:VALIDATION_CHILD_RESULT:V1 = OWNER_PAYLOAD_EXACT`");
    expect(contract).toContain("RL-3B does not activate `SYNTRAKE:VALIDATION_RESULT:V1`");
    expect(contract).toContain("20260923090000_investing_i5_rl3b_validation_child_execution.sql");
    expect(contract).toContain(
      "At initial RL-3B acceptance time, the migration had not been applied to Supabase Production.",
    );
    expect(contract).toContain(
      "`20260923090000_investing_i5_rl3b_validation_child_execution.sql` is applied in",
    );
    expect(contract).toContain("Supabase Production.");
    expect(contract).toContain(
      "This production application does not broaden this contract's functional",
    );
    expect(hash).toContain("`SYNTRAKE:VALIDATION_RUN_INPUT:V1` | `OWNER_PAYLOAD_EXACT`");
    expect(hash).toContain("`SYNTRAKE:VALIDATION_CHILD_RESULT:V1` | `OWNER_PAYLOAD_EXACT`");
    expect(hash).toContain("RL-3B Validation Child Execution");
    expect(hash).toContain("No aggregate Validation Result");
    expect(state).toContain("I5 RL-3B Validation Child Execution (unnumbered)");
    expect(state).toContain("I5_RL3B_VALIDATION_CHILD_EXECUTION_OWNER_CONTRACT_V1.md");
    expect(state).toContain("CURRENT_ACCEPTED / RL-3B_VALIDATION_CHILD_EXECUTION / UNNUMBERED");
    expect(row).toContain("| YES | YES |");
    expect(row).toContain("CURRENT ACCEPTED OWNER CONTRACT - RL-3B VALIDATION CHILD EXECUTION V1 - UNNUMBERED");
    expect(row).toContain("CURRENT_ACCEPTED / RL-3B_VALIDATION_CHILD_EXECUTION");
    expect(row).toContain("| NONE |");
    expect(state).toContain("Production Supabase Migration State");
    expect(state).toContain("`RL-3B Production migration = APPLIED`");
    expect(state).toContain("`RL-3B post-apply audit = PASSED`");
  });


  it("records RL-3C aggregate closure in Production and closes RL-3", () => {
    const state = read("docs/investing-genesis/CANONICAL_CURRENT_STATE.md");
    const contract = read("docs/investing-genesis/I5_RL3C_VALIDATION_AGGREGATE_CLOSURE_OWNER_CONTRACT_V1.md");
    const hash = read("docs/investing-genesis/I5A_CANONICAL_HASH_DOMAINS_V1.md");
    const row = tableRow(state, "RL-3C Validation Aggregate Closure / unnumbered");

    expect(contract).toContain("CURRENT_ACCEPTED / RL-3C_VALIDATION_AGGREGATE_CLOSURE / UNNUMBERED");
    expect(contract).toContain("cbe9165e1d89e45d6bda9af281200c31d25f950b");
    expect(contract).toContain("e1721482b0ba2b9a67b3d8751778ba2695e3e751");
    expect(contract).toContain("20260924175716_investing_i5_rl3c_validation_aggregate_closure.sql");
    expect(contract).toContain("CURRENT_ACCEPTED / RL-3_VALIDATION_PROTOCOL_V1 / UNNUMBERED");
    expect(hash).toContain("`SYNTRAKE:VALIDATION_RESULT:V1` | `OWNER_PAYLOAD_EXACT`");
    expect(hash).toContain("## RL-3C Validation Aggregate Closure");
    expect(hash).toContain("current accepted through RL-3C Validation");
    expect(hash).toContain("20260924175716_investing_i5_rl3c_validation_aggregate_closure.sql");
    expect(hash).not.toContain("## RL-3C Validation Aggregate Closure Candidate");
    expect(hash).not.toContain("only on its candidate branch");

    expect(state).toContain("I5 RL-3C Validation Aggregate Closure (unnumbered)");
    expect(state).toContain("I5_RL3C_VALIDATION_AGGREGATE_CLOSURE_OWNER_CONTRACT_V1.md");
    expect(state).toContain("I5 RL-3C Validation Aggregate Closure acceptance evidence:");
    expect(state).toContain("cbe9165e1d89e45d6bda9af281200c31d25f950b");
    expect(state).toContain("e1721482b0ba2b9a67b3d8751778ba2695e3e751");
    expect(state).toContain("107782658459 - SUCCESS");
    expect(state).toContain("107782658690 - SUCCESS");
    expect(state).toContain("`CURRENT THROUGH RL-3C`");
    expect(state).toContain(
      "`20260924175716 investing_i5_rl3c_validation_aggregate_closure`",
    );
    expect(state).toContain("`96 versions`");
    expect(state).toContain("`RL-3C Production migration = APPLIED`");
    expect(state).toContain("`RL-3C post-apply audit = PASSED`");
    expect(state).toContain("`RL-3 = CURRENT_ACCEPTED / RL-3_VALIDATION_PROTOCOL_V1 / UNNUMBERED`");
    expect(state).toContain("Security Advisor finding in schema `investing`:");
    expect(state).toContain("`NONE`");
    expect(state).toContain("Performance Advisor debt:");
    expect(state).toContain("`PRESENT / NON-BLOCKING`");
    expect(state).toContain("I5 RESEARCH LAB = IN_PROGRESS / RL-4_TO_RL-11 / PRODUCT_UI_DEFERRED");

    expect(row).toContain("| YES | YES |");
    expect(row).toContain("CURRENT ACCEPTED OWNER CONTRACT - RL-3C VALIDATION AGGREGATE CLOSURE - UNNUMBERED");
    expect(row).toContain("CURRENT_ACCEPTED / RL-3C_VALIDATION_AGGREGATE_CLOSURE");
    expect(row).toContain("| NONE |");
  });

  it("records A5 accepted trust recovery without claiming global recovery", () => {
    const state = read("docs/investing-genesis/CANONICAL_CURRENT_STATE.md");
    const a5 = tableRow(state, "I5-A5 Research IR runtime/owner contract");

    expect(a5).toContain("| YES | YES |");
    expect(a5).toContain("CURRENT ACCEPTED OWNER CONTRACT");
    expect(a5).toContain("CURRENT_ACCEPTED / TRUST_RECOVERY_CLOSED");
    expect(a5).toContain("| NONE |");
    expect(state).toContain("4fa0aa28344949f7f3d4e2d97c1528175a17e0c6");
    expect(state).toContain("2e88cde07e2f38dfc455e0a928adb709474f8af7");
    expect(state).toContain("SUPERSEDED_UNACCEPTED_CANDIDATE");
    expect(state).toContain("The benchmark discriminator is fixed fail-closed");
    expect(state).toContain("DatasetSnapshot remains `DEFERRED / NO CURRENT A-NUMBER`");
    expect(a5).not.toContain("OPEN_CORRECTION");
    expect(a5).not.toContain("NOT_TRUST_RECOVERY_ACCEPTED");
    expect(state).toContain("This gate record does not establish a global Trusted Genesis Baseline");
    expect(state).not.toContain("global Trust Recovery is complete");
  });

  it("records accepted unnumbered Experiment BASELINE runtime-only authority", () => {
    const state = read("docs/investing-genesis/CANONICAL_CURRENT_STATE.md");
    const experiment = tableRow(state, "Experiment BASELINE structural admission / unnumbered");

    expect(state).toContain("I5 Experiment baseline (unnumbered)");
    expect(state).toContain("lib/investing/research/experiment.ts");
    expect(state).toContain("I5 Experiment BASELINE structural admission: current accepted, unnumbered,");
    expect(experiment).toContain("| YES | YES |");
    expect(experiment).toContain("CURRENT ACCEPTED OWNER CONTRACT - EXPERIMENT BASELINE (UNNUMBERED)");
    expect(experiment).toContain("CURRENT_ACCEPTED / STRUCTURAL_RUNTIME_ONLY");
    expect(experiment).toContain("| NONE |");
    expect(state).toContain("Accepted audited candidate:");
    expect(state).toContain("81dc43cc0bc802565801e89e0f3a750029583b1d");
    expect(state).toContain("Permanent A-number: `NOT ASSIGNED`");
    expect(state).toContain("Experiment scientific hash");
    expect(state).toContain("ExperimentParameters hash");
    expect(state).toContain("DatasetSnapshot remains `DEFERRED / NO CURRENT A-NUMBER`");
  });

  it("records accepted unnumbered Experiment Scientific Closure without overclaiming downstream domains", () => {
    const state = read("docs/investing-genesis/CANONICAL_CURRENT_STATE.md");
    const experiment = tableRow(state, "Experiment Scientific Closure / unnumbered");

    expect(experiment).toContain("| YES | YES |");
    expect(experiment).toContain("CURRENT ACCEPTED OWNER CONTRACT - EXPERIMENT SCIENTIFIC CLOSURE - UNNUMBERED");
    expect(experiment).toContain("CURRENT_ACCEPTED / SCIENTIFIC_CLOSURE");
    expect(experiment).toContain("| NONE |");
    expect(state).toContain("59575f91bd276d607ca286a6dd1d485d3f68c497");
    expect(state).toContain("35361968564");
    expect(state).toContain("35361968472");
    expect(state).toContain("Dedicated Experiment Scientific Closure PG17 rehearsal:");
    expect(state).toContain("3/3 PASS");
    expect(state).toContain("Dataset & Run Scientific Closure");
    expect(state).toContain("DATASET & RUN SCIENTIFIC CLOSURE = CURRENT_ACCEPTED / SCIENTIFIC_CLOSURE / UNNUMBERED");
    expect(state).not.toContain("Run execution lifecycle = CURRENT_ACCEPTED");
    expect(state).not.toContain("Result = CURRENT_ACCEPTED");
    expect(state).toContain("I5 RL-1 Evidence Object Scientific Closure");
    expect(state).toContain("SYNTRAKE:EVIDENCE_OBJECT:V1 = CONTENT_PREIMAGE_EXACT");
    expect(state).not.toContain("Generic arbitrary Evidence hashing is a public Research authority surface");
    expect(state).not.toContain("Paper = CURRENT_ACCEPTED");
    expect(state).not.toContain("Trading = CURRENT_ACCEPTED");
    expect(state).not.toContain("Core = CURRENT_ACCEPTED");
  });

  it("records accepted unnumbered Dataset & Run Scientific Closure without claiming execution results", () => {
    const state = read("docs/investing-genesis/CANONICAL_CURRENT_STATE.md");
    const contract = read("docs/investing-genesis/I5_DATASET_RUN_SCIENTIFIC_CLOSURE_OWNER_CONTRACT_V1.md");
    const row = tableRow(state, "Dataset & Run Scientific Closure / unnumbered");

    expect(row).toContain("| YES | YES |");
    expect(row).toContain("CURRENT ACCEPTED OWNER CONTRACT - DATASET & RUN SCIENTIFIC CLOSURE - UNNUMBERED");
    expect(row).toContain("CURRENT_ACCEPTED / SCIENTIFIC_CLOSURE");
    expect(row).toContain("| NONE |");
    expect(contract).toContain("Status: CURRENT ACCEPTED OWNER CONTRACT - DATASET & RUN SCIENTIFIC CLOSURE - UNNUMBERED");
    expect(state).toContain("9cdc89a052dd76b8ed58eb52c434672c4f05ec65");
    expect(state).toContain("35453698054");
    expect(state).toContain("35453698064");
    expect(state).toContain("Dedicated Dataset/Run Scientific Closure PG17 rehearsal:");
    expect(state).toContain("5/5 PASS");
    expect(state).toContain("Production Supabase migration application:");
    expect(state).toContain("`NOT PERFORMED`");
    expect(contract).toContain("ACCOUNT_RESEARCH_CONTEXT:V1 = DECLARED_BUT_HASHING_DISABLED");
    expect(contract).toContain("Run execution lifecycle");
    expect(contract).toContain("Result");
    expect(contract).toContain("Evidence");
    expect(state).not.toContain("candidate-only Dataset/Run Scientific Closure");
  });

  it("does not overclaim missing A1/A2/A4 dedicated owner contracts", () => {
    const state = read("docs/investing-genesis/CANONICAL_CURRENT_STATE.md");

    expect(state).toContain("I5-A1 Investigation persistence/current runtime | YES | NO");
    expect(state).toContain("I5-A2 ResearchDraft persistence/current runtime | YES | NO");
    expect(state).toContain("I5-A3 material revisions | YES | YES");
    expect(state).toContain("I5-A4 ResearchSpec persistence | YES | NO");
    expect(state).toContain("no dedicated A1 persistence owner contract in tree");
    expect(state).toContain("no dedicated A2 persistence owner contract in tree");
    expect(state).toContain("no dedicated A4 ResearchSpec persistence owner contract in tree");
    expect(state).toContain("`I5_MATERIAL_COMMAND_IDENTITY_V1.md` is not evidence of A1/A2/A4 persistence");
    expect(state).toContain("no persistence authority");
  });

  it("records closed repository control plane and dependency security recovery", () => {
    const state = read("docs/investing-genesis/CANONICAL_CURRENT_STATE.md");

    expect(state).toContain("GitHub default branch: `main`");
    expect(state).toContain("Control-plane convergence baseline:");
    expect(state).toContain("216bec5e09bfa81a771048f1d693210942f02368");
    expect(state).toContain("Genesis lineage now occupies `main`");
    expect(state).toContain("archive/disconnected-main-pre-control-plane-20260913");
    expect(state).toContain("67393626c3bd3dbb7c18a4ff7235f9ea06f93e13");
    expect(state).toContain("design/i5-research-lab-canonical-20260906");
    expect(state).toContain("A5 Trust Recovery predecessor canonical:");
    expect(state).toContain("2096c2a9ff4f3e15fa4031693ea5e17de4829ea8");
    expect(state).toContain("4fa0aa28344949f7f3d4e2d97c1528175a17e0c6");
    expect(state).toContain("Syntrake Canonical Branch Guard");
    expect(state).toContain("23141231");
    expect(state).toContain("Syntrake Historical Archive Guard");
    expect(state).toContain("23141335");
    expect(state).toContain("Both rulesets: `ACTIVE`");
    expect(state).toContain("Bypass actors: none");
    expect(state).toContain("Canonical refs prohibit deletion and non-fast-forward updates");
    expect(state).toContain("Canonical refs require linear history");
    expect(state).toContain("Canonical refs require status checks: `verify`, `dependency-audit`, `Vercel`");
    expect(state).toContain("Historical archive ref prohibits deletion and non-fast-forward updates");
    expect(state).toContain("Historical/candidate branches do not become authority merely by existing");
    expect(state).toContain("REPOSITORY CONTROL PLANE = GREEN / TRUST_RECOVERY_CLOSED");
    expect(state).toContain("C. `REPOSITORY CONTROL PLANE REHEARSAL = PASS`");
    expect(state).toContain("TRUSTED GENESIS BASELINE = CURRENT_ACCEPTED");
    expect(state).toContain("TRUSTED_GENESIS_BASELINE_REHEARSAL_20260920.md");
    expect(state).toContain("A. `EXECUTION REHEARSAL = PASS`");
    expect(state).toContain("B. `CANONICAL INTEGRITY REHEARSAL = PASS`");
    expect(state).toContain("C. `REPOSITORY CONTROL PLANE REHEARSAL = PASS`");
    expect(state).not.toContain("TRUSTED GENESIS BASELINE = REHEARSAL_CANDIDATE / NOT CURRENT_ACCEPTED");
    expect(state).not.toContain("REPOSITORY CONTROL PLANE = RED / REQUIRES SEPARATE OWNER-AUTHORIZED GATE");
    expect(state).not.toContain("Current canonical before A5 promotion");
    expect(state).not.toContain("A5 acceptance target, not yet canonical");
    expect(state).not.toContain("git merge-base origin/main 9e341acc");
    expect(state).toContain("Dependency/security Trust Recovery predecessor:");
    expect(state).toContain("342659c2d92ccb6d5e0143b10fe13643864d771c");
    expect(state).toContain("Accepted dependency correction:");
    expect(state).toContain("774b3503f768ad3805684b4834ddbb7ffd899679");
    expect(state).toContain("Next.js `16.3.0 -> 16.3.5`");
    expect(state).toContain("`@next/third-parties` `16.3.0 -> 16.3.5`");
    expect(state).toContain("Transitive sharp `0.35.3 -> 0.35.4`");
    expect(state).toContain("Full dependency audit: `0 vulnerabilities`");
    expect(state).toContain("Production dependency audit: `0 vulnerabilities`");
    expect(state).toContain("GitHub Actions CI: `SUCCESS`");
    expect(state).toContain("Vercel: `SUCCESS`");
    expect(state).toContain("DEPENDENCY SECURITY TRUST RECOVERY = CLOSED");
    expect(state).toContain("PRE-EXISTING SECURITY BASELINE - TRUST RECOVERY BLOCKER");
    expect(state).not.toContain("Known dependency/security audit failures are");
    expect(state).not.toContain("sharp `<0.35.4`");
    expect(state).not.toContain("while that blocker remains");
  });

  it("records the accepted Trusted Genesis baseline from the full rehearsal", () => {
    const state = read("docs/investing-genesis/CANONICAL_CURRENT_STATE.md");
    const rehearsal = read("docs/investing-genesis/TRUSTED_GENESIS_BASELINE_REHEARSAL_20260920.md");
    const executionClosure = read("docs/investing-genesis/I5_RESEARCH_EXECUTION_CLOSURE_OWNER_CONTRACT_V1.md");

    expect(executionClosure).toContain("CURRENT ACCEPTED OWNER CONTRACT - RESEARCH EXECUTION CLOSURE - UNNUMBERED");
    expect(rehearsal).toContain("CURRENT ACCEPTED REHEARSAL EVIDENCE - TRUSTED GENESIS BASELINE");
    expect(rehearsal).toContain("a93dbb9e3c7c548efa8066cc680f64e0d2b05403");
    expect(rehearsal).toContain("5a70fa65c19ff8b1511711dad65ec90ef02b9a10");
    expect(rehearsal).toContain("e1bfdd8a67429ff33b4d5d425fba4b68ce688446");
    expect(rehearsal).toContain("35507108244 - SUCCESS");
    expect(rehearsal).toContain("35506819586");
    expect(rehearsal).toContain("A. EXECUTION REHEARSAL = PASS");
    expect(rehearsal).toContain("B. CANONICAL INTEGRITY REHEARSAL = PASS");
    expect(rehearsal).toContain("C. REPOSITORY CONTROL PLANE REHEARSAL = PASS");
    expect(rehearsal).toContain("23141231");
    expect(rehearsal).toContain("23141335");
    expect(rehearsal).toContain("67393626c3bd3dbb7c18a4ff7235f9ea06f93e13");
    expect(rehearsal).toContain("216bec5e09bfa81a771048f1d693210942f02368");
    expect(rehearsal).toContain("Production mutation:");
    expect(rehearsal).toContain("Production Supabase migration application:");
    expect(rehearsal).toContain("`NOT PERFORMED`");
    expect(state).toContain("TRUSTED GENESIS BASELINE = CURRENT_ACCEPTED");
    expect(state).not.toContain("TRUSTED GENESIS BASELINE = REHEARSAL_CANDIDATE / NOT CURRENT_ACCEPTED");
    expect(rehearsal).toContain("e93aa20187d99ec00de9d31a822f1bf86b2f297a");
    expect(rehearsal).toContain("35507509732 - SUCCESS");
    expect(rehearsal).toContain("35507511846 - SUCCESS");
  });

  it("does not invent A2/A4/A5 owner-contract groups", () => {
    const state = read("docs/investing-genesis/CANONICAL_CURRENT_STATE.md");
    const a5Owner = read("docs/investing-genesis/I5A_RESEARCH_IR_OWNER_CONTRACT_V1.md");

    expect(`${state}\n${a5Owner}`).not.toContain("A2/A4/A5 owner contracts");
  });

  it("does not leave deleted filenames as active authority references", () => {
    const allowedFiles = new Set([
      "docs/investing-genesis/CANONICAL_CURRENT_STATE.md",
      "tests/investingGenesisCanonicalHygiene.test.ts",
    ]);
    const textFiles = scannedRoots.flatMap((root) => walk(root))
      .filter((file) => /\.(?:md|ts|tsx|js|json|sql|cjs|mjs)$/u.test(file));

    for (const file of textFiles) {
      if (allowedFiles.has(file)) continue;
      const source = read(file);
      for (const removed of removedDocs) {
        expect(source.includes(removed), `${file} references ${removed}`).toBe(false);
      }
    }
  });

  it("keeps consolidated A3 and hash contracts tied to current runtime rather than future domains", () => {
    const a3 = read("docs/investing-genesis/I5A_MATERIAL_REVISIONS_OWNER_CONTRACT_V1.md");
    expect(a3).toContain("Draft and Hypothesis are independent sibling roots");
    expect(a3).toContain("ResearchSpec binds the exact Draft and optional Hypothesis dependency");
    expect(a3).toContain("No DatasetSnapshot, Run, Result");

    const hash = read("docs/investing-genesis/I5A_CANONICAL_HASH_DOMAINS_V1.md");
    expect(hash).toContain("Runtime truth is `lib/investing/research/canonical.ts`");
    expect(hash).toContain("`SYNTRAKE:RESEARCH_SPEC:V1` | `OWNER_PAYLOAD_EXACT`");
    expect(hash).toContain("ResearchSpec revision workflow status remains `CANDIDATE_ONLY`");
    expect(hash).toContain("accepted unnumbered");
  });

  it("keeps consolidated hash-domain current truth aligned with canonical current state", () => {
    const state = read("docs/investing-genesis/CANONICAL_CURRENT_STATE.md");
    const hash = read("docs/investing-genesis/I5A_CANONICAL_HASH_DOMAINS_V1.md");

    expect(hash).toContain("`SYNTRAKE:EXPERIMENT:V1` | `OWNER_PAYLOAD_EXACT`");
    expect(hash).toContain("`SYNTRAKE:EXPERIMENT_PARAMETERS:V1` | `OWNER_PAYLOAD_EXACT`");
    expect(hash).toContain("`SYNTRAKE:RESEARCH_SPEC:V1` | `OWNER_PAYLOAD_EXACT`");
    expect(hash).toContain("`SYNTRAKE:DATASET_SERIES:V1` | `OWNER_PAYLOAD_EXACT`");
    expect(hash).toContain("`SYNTRAKE:DATASET_SNAPSHOT:V1` | `OWNER_PAYLOAD_EXACT`");
    expect(hash).toContain("`SYNTRAKE:METRIC_REQUEST_SET:V1` | `OWNER_PAYLOAD_EXACT`");
    expect(hash).toContain("`SYNTRAKE:EXECUTION_CONFIG:V1` | `OWNER_PAYLOAD_EXACT`");
    expect(hash).not.toContain("`SYNTRAKE:EXPERIMENT:V1` | `DECLARED_BUT_HASHING_DISABLED`");
    expect(hash).not.toContain("`SYNTRAKE:EXPERIMENT_PARAMETERS:V1` | `DECLARED_BUT_HASHING_DISABLED`");
    expect(state).toMatch(/`SYNTRAKE:EXPERIMENT:V1`\r?\n= `OWNER_PAYLOAD_EXACT`/u);
    expect(state).toMatch(/`SYNTRAKE:EXPERIMENT_PARAMETERS:V1`\r?\n= `OWNER_PAYLOAD_EXACT`/u);
    expect(state).toMatch(/`SYNTRAKE:RESEARCH_SPEC:V1`\r?\n= `OWNER_PAYLOAD_EXACT`/u);
    expect(state).toMatch(/`SYNTRAKE:DATASET_SNAPSHOT:V1`\r?\n= `OWNER_PAYLOAD_EXACT`/u);
  });
});
