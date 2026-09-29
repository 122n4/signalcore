import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..");
const contractPath = "docs/investing-genesis/I5_RL3D_VALIDATION_ASSESSMENT_V1_DESIGN_FREEZE_V1.md";

function read(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function compact(value: string): string {
  return value.replace(/\s+/g, " ");
}

describe("I5 RL-3D Validation Assessment V1 design freeze", () => {
  it("remains candidate-only and design-only", () => {
    const contract = read(contractPath);
    expect(contract).toContain("CANDIDATE / RL-3D_VALIDATION_ASSESSMENT_V1_DESIGN_FREEZE / UNNUMBERED");
    expect(contract).toContain("Canonical predecessor:\n`b3f48e3f55a1f0c41004c60a3119fbd2cb7f84f0`");
    expect(contract).toContain("Runtime implementation:\n`NOT IMPLEMENTED BY THIS SLICE`");
    expect(contract).toContain("Migration:\n`NONE`");
    expect(contract).toContain("Production mutation:\n`NONE`");
    expect(contract).toContain("Supabase Production:\n`UNCHANGED`");
    expect(contract).not.toContain("CURRENT_ACCEPTED / RL-3D");
  });

  it("does not retrofit accepted RL-3C Validation Result semantics", () => {
    const contract = read(contractPath);
    const rl3c = read("docs/investing-genesis/I5_RL3C_VALIDATION_AGGREGATE_CLOSURE_OWNER_CONTRACT_V1.md");
    for (const token of [
      "This design does not modify, retrofit or reinterpret",
      "SYNTRAKE:VALIDATION_RESULT:V1",
      "AGGREGATE_AVAILABLE != PASS",
      "CHILD_FAILED != FAIL assessment",
      "AGGREGATE_PENDING != INSUFFICIENT_EVIDENCE assessment",
      "Passport must not infer PASS from `AGGREGATE_AVAILABLE`",
    ]) expect(contract).toContain(token);
    expect(rl3c).toContain("This production/current-state closure does not introduce pass/fail scoring");
    expect(rl3c).toContain("- pass/fail;");
  });

  it("freezes exactly two new design-only assessment domains without runtime admission", () => {
    const contract = read(contractPath);
    const canonicalContract = read("docs/investing-genesis/I5A_CANONICAL_HASH_DOMAINS_V1.md");
    const canonicalRuntime = read("lib/investing/research/canonical.ts");
    for (const domain of [
      "SYNTRAKE:VALIDATION_ASSESSMENT_PROTOCOL:V1",
      "SYNTRAKE:VALIDATION_ASSESSMENT_RESULT:V1",
    ]) {
      expect(contract).toContain(domain);
      expect(canonicalContract).not.toContain(domain);
      expect(canonicalRuntime).not.toContain(domain);
    }
    expect(contract).toContain("They are design-frozen only in this slice");
    expect(contract).toContain("not added to `HashDomainV1` here");
  });

  it("freezes the assessment protocol payload and evidence authority", () => {
    const contract = read(contractPath);
    for (const token of [
      "VALIDATION_ASSESSMENT_PROTOCOL_V1",
      "VALIDATION_ASSESSMENT_METHODOLOGY_V20260929",
      "ALL_REQUIRED_CRITERIA_PASS_V1",
      "REQUIRED_EVIDENCE_MISSING_IS_INSUFFICIENT_EVIDENCE_V1",
      "validationProtocol: HashRef<SYNTRAKE:VALIDATION_PROTOCOL:V1>",
      "validationResult: HashRef<SYNTRAKE:VALIDATION_RESULT:V1>",
      "subjectExperiment: HashRef<SYNTRAKE:EXPERIMENT:V1>",
      "subjectResearchIr: HashRef<SYNTRAKE:RESEARCH_IR:V1>",
      "METRIC_REGISTRY_V20260927",
      "VALIDATION_ASSESSMENT_CRITERION_V1",
      "criterionId",
      "metricId",
      "metricVersion",
      "operator",
      "threshold",
      "evidenceRequirements",
      "LT",
      "LTE",
      "EQ",
      "GTE",
      "GT",
      "BETWEEN_INCLUSIVE",
      "OUTSIDE_EXCLUSIVE",
    ]) expect(contract).toContain(token);
  });

  it("freezes closed outcome vocabulary and fail-closed corruption semantics", () => {
    const contract = read(contractPath);
    const normalized = compact(contract);
    for (const token of [
      "VALIDATION_ASSESSMENT_RESULT_V1",
      "VALIDATION_ASSESSMENT_CRITERION_OUTCOME_V1",
      "PASS",
      "FAIL",
      "INSUFFICIENT_EVIDENCE",
      "Corruption, authority failure, schema incompatibility, lineage mismatch",
      "fail closed before an authoritative assessment outcome exists",
    ]) expect(contract).toContain(token);
    expect(normalized).toContain("failures are operational/integrity failures, not serialized assessment outcomes");
    expect(normalized).toContain("The closed assessment outcome vocabulary is exactly:");
    expect(normalized).toContain("PASS FAIL INSUFFICIENT_EVIDENCE");
  });

  it("freezes deterministic aggregation rather than hidden scoring", () => {
    const contract = read(contractPath);
    const normalized = compact(contract);
    for (const token of [
      "PASS:",
      "every required criterion has status PASS",
      "FAIL:",
      "at least one required criterion has status FAIL",
      "INSUFFICIENT_EVIDENCE:",
      "at least one required criterion has status INSUFFICIENT_EVIDENCE",
      "There is no hidden score",
      "weighted composite",
      "AI confidence",
      "caller override",
    ]) expect(contract).toContain(token);
    expect(normalized).toContain("Optional criteria may be recorded for diagnostic evidence only. Optional criteria cannot turn a failing required criterion into PASS");
    expect(normalized).toContain("no required criterion has status FAIL and at least one required criterion has status INSUFFICIENT_EVIDENCE");
  });

  it("freezes lineage, Passport projection and RL-8 consumption semantics", () => {
    const contract = read(contractPath);
    for (const token of [
      "same tenant authority",
      "same Investigation",
      "accepted Validation Protocol HashRef",
      "accepted Validation Result HashRef",
      "Metric Result Set",
      "metric registry version is exactly the protocol's registry version",
      "Server-derived authority scope is mandatory",
      "validationAssessment.availability",
      "DEFERRED_RL3D",
      "ASSESSMENT_AVAILABLE",
      "ASSESSMENT_UNAVAILABLE",
      "Validation Assessment PASS",
      "RL-8 validation gate may PASS if all other gates pass",
      "Validation Assessment FAIL",
      "VALIDATION_FAILED",
      "Validation Assessment INSUFFICIENT_EVIDENCE",
      "Corrupt, incompatible, unauthorized or missing assessment authority",
      "PROMOTION_ELIGIBLE",
    ]) expect(contract).toContain(token);
  });

  it("preserves persistence boundaries and non-authority", () => {
    const contract = read(contractPath);
    for (const token of [
      "This design slice writes no SQL",
      "append-only",
      "identical retry reuses the exact same identity",
      "divergent payload",
      "RLS and FORCE RLS",
      "PostgreSQL 17 rehearsal",
      "Paper orders",
      "Live execution",
      "Capital Kernel approval",
      "Blind Truth / Evidence Vault",
      "RL-8 implementation",
      "RL-9",
      "CORE != LAB",
      "LAB != PAPER",
      "INVESTING != TRADING",
      "Runtime changed: NO",
      "Migration changed: NO",
      "Production changed: NO",
      "Supabase Production changed: NO",
    ]) expect(contract).toContain(token);
  });
});
