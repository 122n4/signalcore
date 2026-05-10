import { describe, expect, it } from "vitest";
import {
  buildDailyRenderPlan,
  buildSimpleSectionOrder,
  computeProbabilityEdgePct,
  decisionRequiresExecution,
  deriveExecutionStreakDays,
  normalizeSimpleDecision,
} from "@/lib/signalcore/dailySimpleMode";

describe("dailySimpleMode", () => {
  it("renders exact simple section order with execution step when required", () => {
    expect(buildSimpleSectionOrder("BUY")).toEqual([
      "command_hero",
      "execution_step",
      "decision_rationale",
      "next_cycle_timer",
    ]);
    expect(buildSimpleSectionOrder("REDUCE")).toEqual([
      "command_hero",
      "execution_step",
      "decision_rationale",
      "next_cycle_timer",
    ]);
    expect(buildSimpleSectionOrder("CLOSE")).toEqual([
      "command_hero",
      "execution_step",
      "decision_rationale",
      "next_cycle_timer",
    ]);
  });

  it("omits execution step for HOLD/WAIT", () => {
    expect(buildSimpleSectionOrder("HOLD")).toEqual([
      "command_hero",
      "decision_rationale",
      "next_cycle_timer",
    ]);
    expect(buildSimpleSectionOrder("WAIT")).toEqual([
      "command_hero",
      "decision_rationale",
      "next_cycle_timer",
    ]);
    expect(decisionRequiresExecution("HOLD")).toBe(false);
    expect(decisionRequiresExecution("WAIT")).toBe(false);
  });

  it("normalizes decisions from governance + action fallback", () => {
    expect(normalizeSimpleDecision({ governanceDecision: "BUY", actionType: "HOLD" })).toBe("BUY");
    expect(normalizeSimpleDecision({ governanceDecision: "AVOID", actionType: "ENTER" })).toBe("WAIT");
    expect(normalizeSimpleDecision({ governanceDecision: null, actionType: "CLOSE_DAY" })).toBe("CLOSE");
    expect(normalizeSimpleDecision({ governanceDecision: null, actionType: "EXECUTE_BROKER" })).toBe("BUY");
    expect(normalizeSimpleDecision({ governanceDecision: null, actionType: "REDUCE" })).toBe("REDUCE");
    expect(normalizeSimpleDecision({ governanceDecision: "BUY", actionType: "ENTER", doneToday: true })).toBe("WAIT");
  });

  it("computes deterministic probability edge percentages", () => {
    expect(
      computeProbabilityEdgePct({
        decision: "BUY",
        probabilityUp: 0.643,
        probabilityDown: 0.357,
      }),
    ).toBe(14.3);
    expect(
      computeProbabilityEdgePct({
        decision: "REDUCE",
        probabilityUp: 0.61,
        probabilityDown: 0.39,
      }),
    ).toBe(-11);
    expect(
      computeProbabilityEdgePct({
        decision: "WAIT",
        probabilityUp: 0.7,
        probabilityDown: 0.3,
      }),
    ).toBe(0);
    const repeat = computeProbabilityEdgePct({
      decision: "BUY",
      probabilityUp: 0.643,
      probabilityDown: 0.357,
    });
    expect(repeat).toBe(14.3);
  });

  it("derives streak with safe fallback", () => {
    expect(deriveExecutionStreakDays(12)).toBe(12);
    expect(deriveExecutionStreakDays("8")).toBe(8);
    expect(deriveExecutionStreakDays(-4)).toBe(0);
    expect(deriveExecutionStreakDays(null)).toBe(0);
  });

  it("keeps advanced diagnostics only in advanced mode plan", () => {
    const simplePlan = buildDailyRenderPlan({ workspaceMode: "simple", decision: "BUY" });
    expect(simplePlan.showAdvancedDiagnostics).toBe(false);
    expect(simplePlan.simpleSections.length).toBe(4);

    const advancedPlan = buildDailyRenderPlan({ workspaceMode: "advanced", decision: "BUY" });
    expect(advancedPlan.showAdvancedDiagnostics).toBe(true);
    expect(advancedPlan.simpleSections).toEqual([]);
  });
});
