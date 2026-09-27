import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..");
const contractPath = "docs/investing-genesis/I5_RL7_ROBUSTNESS_EXPERIMENT_COMPARISON_V1_DESIGN_FREEZE_V1.md";

function read(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

describe("I5 RL-7 Robustness And Experiment Comparison V1 design freeze", () => {
  it("freezes candidate-only RL-7 status without runtime, migration, Production or acceptance authority", () => {
    const contract = read(contractPath);

    expect(contract).toContain("CANDIDATE DESIGN FREEZE - RL-7 ROBUSTNESS AND EXPERIMENT COMPARISON V1 - UNNUMBERED");
    expect(contract).toContain("CANDIDATE / RL-7_ROBUSTNESS_EXPERIMENT_COMPARISON_V1_DESIGN_FREEZE / UNNUMBERED");
    expect(contract).toContain("Canonical predecessor:\n`f21371b9d0cbf79773c198d0dd34b512a7eab46b`");
    expect(contract).toContain("RL-7 acceptance:\n`NOT ACCEPTED`");
    expect(contract).toContain("Runtime implementation:\n`NOT IMPLEMENTED BY THIS SLICE`");
    expect(contract).toContain("Migration:\n`NONE`");
    expect(contract).toContain("Production mutation:\n`NONE`");
    expect(contract).toContain("Permanent A-number:\n`NOT ASSIGNED`");
    expect(contract).not.toContain("CURRENT_ACCEPTED / RL-7");
    expect(contract).toContain("RL-7 must not emit:");
    expect(contract).toContain("`PROMOTION_ELIGIBLE`");
  });

  it("matches the completion-program comparison and anti-overfit purpose", () => {
    const contract = read(contractPath);

    for (const required of [
      "exact parameter delta",
      "exact scientific input delta",
      "metric delta",
      "OOS/walk-forward delta",
      "drawdown delta",
      "turnover/cost delta",
      "concentration/dependence warnings",
      "parameter-neighborhood sensitivity",
      "instability/degradation classification",
      "IS vs OOS degradation",
      "fold/window stability",
      "dependence on a very small number of events/trades/rebalances",
      "result concentration across subperiods",
      "No undocumented composite score may decide scientific truth",
    ]) {
      expect(contract).toContain(required);
    }
  });

  it("freezes lineage, parameter delta and separate scientific input delta", () => {
    const contract = read(contractPath);

    expect(contract).toContain("BASELINE vs direct VARIANT");
    expect(contract).toContain("VARIANT vs child VARIANT");
    expect(contract).toContain("Cross-tenant comparison is forbidden");
    expect(contract).toContain("A client-supplied");
    expect(contract).toContain("INCOMPARABLE_LINEAGE");
    expect(contract).toContain("SYNTRAKE:EXPERIMENT_PARAMETERS:V1");
    expect(contract).toContain("COMPARE_LITERAL_VALUE_DELTA");
    expect(contract).toContain("TAKE_COUNT_DELTA");
    expect(contract).toContain("FIXED_TARGET_WEIGHT_DELTA");
    expect(contract).toContain("REBALANCE_SCHEDULE_DELTA");
    expect(contract).toContain("The input-delta section compares at least:");
    expect(contract).toContain("DatasetSnapshot HashRef");
    expect(contract).toContain("MetricRequestSet HashRef");
    expect(contract).toContain("metric registry version");
  });

  it("binds metric comparison to RL-6 and validation/OOS semantics to RL-3", () => {
    const contract = read(contractPath);

    expect(contract).toContain("METRIC_REGISTRY_V20260927");
    expect(contract).toContain("METRIC_RESULT_SET_V2");
    expect(contract).toContain("same metricId");
    expect(contract).toContain("same metricVersion");
    expect(contract).toContain("INCOMPATIBLE_METRIC_VERSIONS");
    expect(contract).toContain("No rounded intermediate may decide scientific comparison");
    expect(contract).toContain("RL-7 consumes accepted RL-3 Validation authority");
    expect(contract).toContain("TRAINING");
    expect(contract).toContain("EVALUATION");
    expect(contract).toContain("ROLLING_WALK_FORWARD");
    expect(contract).toContain("EXPANDING_WALK_FORWARD");
    expect(contract).toContain("INCOMPARABLE_VALIDATION_PROTOCOL");
    expect(contract).toContain("INCOMPLETE_VALIDATION");
  });

  it("freezes drawdown, turnover, cost, neighborhood and concentration behavior without optimizer authority", () => {
    const contract = read(contractPath);

    expect(contract).toContain("MAX_DRAWDOWN");
    expect(contract).toContain("MAX_DRAWDOWN_DURATION");
    expect(contract).toContain("MAX_DRAWDOWN_RECOVERY");
    expect(contract).toContain("UNRECOVERED_DRAWDOWN");
    expect(contract).toContain("TURNOVER");
    expect(contract).toContain("TRADE_COUNT");
    expect(contract).toContain("REBALANCE_COUNT");
    expect(contract).toContain("MISSING_EXACT_COST_EVIDENCE");
    expect(contract).toContain("neighborhood membership is explicit");
    expect(contract).toContain("no automatic parameter search");
    expect(contract).toContain("no best-parameter selection");
    expect(contract).toContain("INSUFFICIENT_PARAMETER_NEIGHBORHOOD");
    expect(contract).toContain("UNSUPPORTED_CONCENTRATION_EVIDENCE");
  });

  it("freezes a closed classification policy with no opaque score or fabricated confidence", () => {
    const contract = read(contractPath);

    expect(contract).toContain("ROBUSTNESS_STABLE");
    expect(contract).toContain("ROBUSTNESS_MIXED");
    expect(contract).toContain("ROBUSTNESS_DEGRADED");
    expect(contract).toContain("ROBUSTNESS_UNSTABLE");
    expect(contract).toContain("ROBUSTNESS_INSUFFICIENT_EVIDENCE");
    expect(contract).toContain("ROBUSTNESS_COMPARISON_POLICY_V20260927");
    expect(contract).toContain("There is no mutable `default`, `latest`, `current`, `production`");
    expect(contract).toContain("undocumented score");
    expect(contract).toContain("AI confidence");
    expect(contract).toContain("invented probability");
    expect(contract).toContain("opaque weighted");
    expect(contract).toContain("80% robust");
  });

  it("freezes future scientific identity and persistence decisions without runtime admission", () => {
    const contract = read(contractPath);
    const canonical = read("lib/investing/research/canonical.ts");

    expect(contract).toContain("SYNTRAKE:EXPERIMENT_COMPARISON_PROTOCOL:V1");
    expect(contract).toContain("SYNTRAKE:EXPERIMENT_COMPARISON_RESULT:V1");
    expect(contract).toContain("DESIGN_FROZEN / NOT RUNTIME_ADMITTED");
    expect(contract).toContain("This slice does not activate those domains in `canonical.ts`");
    expect(contract).toContain("RL-7 implementation requires append-only persistence");
    expect(contract).toContain("No migration is written in this design slice");
    expect(contract).toContain("comparison methodology/input identity is separate from derived comparison result/evidence identity");
    expect(canonical).not.toContain("SYNTRAKE:EXPERIMENT_COMPARISON_PROTOCOL:V1");
    expect(canonical).not.toContain("SYNTRAKE:EXPERIMENT_COMPARISON_RESULT:V1");
  });

  it("preserves missingness/fail-closed taxonomy and downstream boundaries", () => {
    const contract = read(contractPath);

    for (const required of [
      "INSUFFICIENT_EVIDENCE",
      "INCOMPARABLE_LINEAGE",
      "INCOMPATIBLE_SCIENTIFIC_INPUTS",
      "MISSING_RESULT",
      "MISSING_VALIDATION_RESULT",
      "METRIC_UNAVAILABLE",
      "CORRUPTED_EVIDENCE",
      "AUTHORITY_FAILURE",
      "UNAVAILABLE` is distinct from mathematical zero",
      "Integrity corruption is fail-closed",
      "RL-7 does not decide promotion",
      "RL-8 owns",
      "Blind Truth / Evidence Vault",
      "Paper",
      "Live",
      "Capital Kernel",
      "product API",
      "UI",
      "CORE != LAB",
      "LAB != PAPER",
      "INVESTING != TRADING",
    ]) {
      expect(contract).toContain(required);
    }
  });

  it("does not create Trading dependency or package-level implementation surface", () => {
    const contract = read(contractPath);
    const packageJson = read("package.json");

    expect(contract).toContain("MUST NOT import from or depend on `lib/trading/**`");
    expect(contract).toContain("Trading research runtime");
    expect(packageJson).not.toContain("rl7");
  });
});
