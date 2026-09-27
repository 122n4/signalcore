import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..");
const contractPath = "docs/investing-genesis/I5_RL7_ROBUSTNESS_EXPERIMENT_COMPARISON_V1_DESIGN_FREEZE_V1.md";

function read(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

describe("I5 RL-7 Robustness And Experiment Comparison V1 design freeze", () => {
  it("remains candidate-only and design-only", () => {
    const contract = read(contractPath);
    expect(contract).toContain("Canonical predecessor:\n`f21371b9d0cbf79773c198d0dd34b512a7eab46b`");
    expect(contract).toContain("RL-7 acceptance:\n`NOT ACCEPTED`");
    expect(contract).toContain("Runtime implementation:\n`NOT IMPLEMENTED BY THIS SLICE`");
    expect(contract).toContain("Migration:\n`NONE`");
    expect(contract).toContain("Production mutation:\n`NONE`");
    expect(contract).not.toContain("CURRENT_ACCEPTED / RL-7");
  });

  it("freezes exact admitted parameter deltas and deterministic paths", () => {
    const contract = read(contractPath);
    for (const token of ["COMPARE_LITERAL_VALUE_DELTA", "TAKE_COUNT_DELTA", "FIXED_TARGET_WEIGHT_DELTA", "REBALANCE_SCHEDULE_DELTA", "expressionPath", "pipelineOperationIndex", "referenceValue != subjectValue", "INCOMPARABLE_PARAMETER_STRUCTURE", "`NOT` adds token `clause`"]) expect(contract).toContain(token);
  });

  it("freezes scientific-input attribution and metric direction", () => {
    const contract = read(contractPath);
    for (const token of ["INCOMPATIBLE_SCIENTIFIC_INPUTS", "HIGHER_IS_BETTER", "LOWER_IS_BETTER", "DESCRIPTIVE_ONLY", "orientedDelta = rawDelta", "orientedDelta = r - s", "No rounded intermediate decides comparison"]) expect(contract).toContain(token);
  });

  it("freezes rational-only validation and fold stability", () => {
    const contract = read(contractPath);
    for (const token of ["TRAINING", "EVALUATION", "ROLLING_WALK_FORWARD", "EXPANDING_WALK_FORWARD", "foldRange = foldMax - foldMin", "nonDegradedFoldCount = count(di >= 0)", "degradedFoldCount = count(di < 0)", "Minimum fold count for classification is exactly `3`", "INCOMPLETE_VALIDATION", "No standard deviation, correlation, floating-point statistic"]) expect(contract).toContain(token);
  });

  it("freezes exact cost, neighborhood and concentration evidence", () => {
    const contract = read(contractPath);
    for (const token of ["explicitFeeTotal = final cumulativeExplicitFees", "slippageCostTotal = final cumulativeSlippageCost", "MISSING_EXACT_COST_EVIDENCE", "at least `3` admitted members including the subject", "minimumTradeCount = 20", "minimumRebalanceCount = 5", "LOW_EVENT_COUNT_DEPENDENCE", "FOLD_DIRECTION_CONCENTRATION", "UNSUPPORTED_CONCENTRATION_EVIDENCE", "no automatic parameter search", "no best-parameter selection"]) expect(contract).toContain(token);
  });

  it("freezes exact policy and classification precedence", () => {
    const contract = read(contractPath);
    for (const token of ["ROBUSTNESS_COMPARISON_POLICY_V20260927", "validationRequired = true", "minimumCompleteFolds = 3", "minimumNeighborhoodMembers = 3", "materialDegradationThreshold = 0", "foldInstabilityRule = degradedFoldCount > nonDegradedFoldCount", "neighborhoodInstabilityRule = degradedMemberCount > improvedOrEqualMemberCount", "ROBUSTNESS_INSUFFICIENT_EVIDENCE", "ROBUSTNESS_UNSTABLE", "ROBUSTNESS_DEGRADED", "ROBUSTNESS_STABLE", "ROBUSTNESS_MIXED", "evaluated in this exact precedence order", "primaryMetricId", "undocumented score", "AI confidence", "invented probability", "opaque weighted score", "80% robust"]) expect(contract).toContain(token);
  });

  it("freezes future scientific payloads without runtime admission", () => {
    const contract = read(contractPath);
    const canonical = read("lib/investing/research/canonical.ts");
    for (const token of ["SYNTRAKE:EXPERIMENT_COMPARISON_PROTOCOL:V1", "EXPERIMENT_COMPARISON_PROTOCOL_V1", "SYNTRAKE:EXPERIMENT_COMPARISON_RESULT:V1", "EXPERIMENT_COMPARISON_RESULT_V1", "No extra keys", "failure != null` requires `classification = null", "domain-separated respectively", "This slice does not activate those domains in `canonical.ts`", "RL-7 implementation requires append-only persistence", "No migration is written in this design slice"]) expect(contract).toContain(token);
    expect(canonical).not.toContain("SYNTRAKE:EXPERIMENT_COMPARISON_PROTOCOL:V1");
    expect(canonical).not.toContain("SYNTRAKE:EXPERIMENT_COMPARISON_RESULT:V1");
  });

  it("preserves fail-closed and downstream boundaries", () => {
    const contract = read(contractPath);
    for (const token of ["CORRUPTED_EVIDENCE", "AUTHORITY_FAILURE", "UNAVAILABLE` is distinct from mathematical zero", "Integrity corruption is fail-closed", "RL-7 does not decide promotion", "RL-8 owns", "PROMOTION_ELIGIBLE", "Blind Truth / Evidence Vault", "Paper", "Live", "Capital Kernel", "product API", "UI", "CORE != LAB", "LAB != PAPER", "INVESTING != TRADING"]) expect(contract).toContain(token);
  });

  it("does not create Trading or package-level implementation surface", () => {
    const contract = read(contractPath);
    const packageJson = read("package.json");
    expect(contract).toContain("MUST NOT import from or depend on `lib/trading/**`");
    expect(contract).toContain("Trading research runtime");
    expect(packageJson).not.toContain("rl7");
  });
});
