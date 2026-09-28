import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..");
const contractPath = "docs/investing-genesis/I5_RL8_SCIENTIFIC_PROMOTION_STATE_MACHINE_V1_DESIGN_FREEZE_V1.md";

function read(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

describe("I5 RL-8 Scientific Promotion State Machine V1 design freeze", () => {
  it("remains candidate-only and design-only", () => {
    const contract = read(contractPath);
    expect(contract).toContain("Canonical predecessor:\n`05b4192557e8e2c22f63769774a1ca2985199e62`");
    expect(contract).toContain("RL-8 acceptance:\n`NOT ACCEPTED`");
    expect(contract).toContain("Runtime implementation:\n`NOT IMPLEMENTED BY THIS SLICE`");
    expect(contract).toContain("Migration:\n`NONE`");
    expect(contract).toContain("Production mutation:\n`NONE`");
    expect(contract).not.toContain("CURRENT_ACCEPTED / RL-8");
  });

  it("freezes the exact promotion subject identity and required HashRefs", () => {
    const contract = read(contractPath);
    for (const token of [
      "SCIENTIFIC_PROMOTION_SUBJECT_V1",
      "subjectExperiment: HashRef<SYNTRAKE:EXPERIMENT:V1>",
      "subjectExperimentParameters: HashRef<SYNTRAKE:EXPERIMENT_PARAMETERS:V1>",
      "subjectResearchIr: HashRef<SYNTRAKE:RESEARCH_IR:V1>",
      "subjectRunInput: HashRef<SYNTRAKE:RUN_INPUT:V1>",
      "subjectResult: HashRef<SYNTRAKE:RESULT:V1>",
      "subjectEvidenceObject: HashRef<SYNTRAKE:EVIDENCE_OBJECT:V1>",
      "subjectValidationProtocol: HashRef<SYNTRAKE:VALIDATION_PROTOCOL:V1>",
      "subjectValidationResult: HashRef<SYNTRAKE:VALIDATION_RESULT:V1>",
      "subjectMetricResultSet: HashRef<METRIC_RESULT_SET_V2>",
      "robustnessComparisonProtocol",
      "robustnessComparisonResult",
      "Operational UUIDs identify persisted rows and authority scope only",
    ]) expect(contract).toContain(token);
  });

  it("freezes states, terminal semantics and the transition graph", () => {
    const contract = read(contractPath);
    for (const token of [
      "DRAFT_RESEARCH",
      "EXECUTED",
      "INSUFFICIENT_EVIDENCE",
      "VALIDATION_FAILED",
      "VALIDATION_PASSED",
      "PROMOTION_ELIGIBLE",
      "REJECTED",
      "SUPERSEDED",
      "INVALIDATED",
      "DRAFT_RESEARCH -> EXECUTED",
      "EXECUTED -> VALIDATION_PASSED",
      "VALIDATION_PASSED -> PROMOTION_ELIGIBLE",
      "PROMOTION_ELIGIBLE -> SUPERSEDED",
      "All other transitions are forbidden",
      "Regression is not mutation",
    ]) expect(contract).toContain(token);
  });

  it("freezes promotion-eligible gates and RL-7 consumption semantics", () => {
    const contract = read(contractPath);
    for (const token of [
      "SCIENTIFIC_PROMOTION_PROTOCOL_V20260928",
      "GATE_AUTHORITY_AND_TENANCY",
      "GATE_ACCEPTED_EXECUTION_RESULT",
      "GATE_EVIDENCE_OBJECT_BINDING",
      "GATE_VALIDATION_RESULT",
      "GATE_METRIC_RESULT_SET_V2",
      "GATE_RL7_ROBUSTNESS_COMPARISON",
      "RL-7 evidence is mandatory in V1",
      "ROBUSTNESS_STABLE -> permits further promotion evaluation",
      "ROBUSTNESS_MIXED -> INSUFFICIENT_EVIDENCE",
      "ROBUSTNESS_DEGRADED -> VALIDATION_FAILED",
      "ROBUSTNESS_UNSTABLE -> VALIDATION_FAILED",
      "UNKNOWN_RL7_CLASSIFICATION",
      "does not recompute robustness",
    ]) expect(contract).toContain(token);
  });

  it("freezes gate outcomes, closed reasons and decision precedence", () => {
    const contract = read(contractPath);
    for (const token of [
      "PASS",
      "FAIL",
      "INCOMPATIBLE_EVIDENCE",
      "UNAVAILABLE",
      "MISSING_RL7_COMPARISON",
      "INCOMPATIBLE_METRIC_REGISTRY",
      "WRONG_HASHREF_DOMAIN",
      "DIVERGENT_EXISTING_IDENTITY",
      "No free-form string carries scientific authority",
      "The V1 decision table is evaluated in this exact order",
      "Integrity, authority and lineage incompatibility dominate eligibility",
      "every required gate is PASS",
      "`PROMOTION_ELIGIBLE` exist",
    ]) expect(contract).toContain(token);
  });

  it("freezes canonical domains and exact protocol/transition payloads without runtime admission", () => {
    const contract = read(contractPath);
    const canonical = read("lib/investing/research/canonical.ts");
    for (const token of [
      "SYNTRAKE:SCIENTIFIC_PROMOTION_PROTOCOL:V1",
      "SYNTRAKE:SCIENTIFIC_PROMOTION_TRANSITION:V1",
      "DESIGN_FROZEN",
      "NOT RUNTIME_ADMITTED",
      "SCIENTIFIC_PROMOTION_PROTOCOL_V1",
      "requiredEvidenceClasses",
      "decisionPrecedence",
      "transitionGraph",
      "SCIENTIFIC_PROMOTION_TRANSITION_V1",
      "predecessorState",
      "resultingState",
      "gateOutcomes",
      "No extra keys",
      "No third RL-8 scientific domain is admitted in V1",
    ]) expect(contract).toContain(token);
    expect(canonical).not.toContain("SYNTRAKE:SCIENTIFIC_PROMOTION_PROTOCOL:V1");
    expect(canonical).not.toContain("SYNTRAKE:SCIENTIFIC_PROMOTION_TRANSITION:V1");
  });

  it("freezes persistence, Passport, Evidence Ledger and supersession contracts", () => {
    const contract = read(contractPath);
    const passport = read("lib/investing/research/researchPassportReader.ts");
    for (const token of [
      "This design slice writes no SQL",
      "append-only transition persistence",
      "RLS and FORCE RLS",
      "reconstruction of current state from immutable history",
      "scientificPromotion.availability = DEFERRED_RL8",
      "latestTransition",
      "currentState",
      "Evidence Ledger",
      "does not create duplicate scientific truth",
      "New experiment evidence, validation rerun, Metric Registry version change",
      "silently rewrite an old `PROMOTION_ELIGIBLE` result",
    ]) expect(contract).toContain(token);
    expect(passport).toContain('scientificPromotion: { availability: "DEFERRED_RL8", transitions: [] }');
  });

  it("preserves determinism, authority boundaries and explicit out-of-scope", () => {
    const contract = read(contractPath);
    for (const token of [
      "Identical canonical inputs plus identical protocol",
      "scientific output bytes and HashRefs",
      "no current wall-clock time as scientific input",
      "AI",
      "judgment",
      "LLM judgment",
      "environment-dependent classification",
      "Authenticated identity",
      "ownership",
      "`service_role` is capability, not authorization",
      "RL-8 MUST NOT authorize",
      "Paper order creation",
      "Live execution",
      "Capital Kernel approval",
      "Decision Firewall bypass",
      "Blind Truth / Evidence Vault implementation",
      "RL-9",
      "CORE != LAB",
      "LAB != PAPER",
      "INVESTING != TRADING",
    ]) expect(contract).toContain(token);
  });
});
