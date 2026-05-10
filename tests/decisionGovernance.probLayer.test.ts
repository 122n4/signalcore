import { describe, expect, it } from "vitest";
import { computeDecisionGovernance, type DecisionGovernanceInput } from "@/lib/engine/decisionGovernance";

function baseInput(overrides: Partial<DecisionGovernanceInput> = {}): DecisionGovernanceInput {
  return {
    enabled: true,
    probabilistic_enabled: true,
    mode: "investing",
    asOf: "2026-03-04T12:00:00.000Z",
    assets: [
      {
        asset: "SPY",
        value_eur: 500,
        volatility_pct: 14,
        marketData: { price: 120, prevClose: 100 },
      },
      {
        asset: "AGGH",
        value_eur: 500,
        volatility_pct: 8,
        marketData: { price: 105, prevClose: 100 },
      },
    ],
    portfolio_total_eur: 1000,
    drawdown_pct: -4,
    execution_quality_score: 82,
    max_single_position_pct: 22,
    action_gate: { status: "clear", allowExecution: true },
    risk_policy_eval: { blocked: false, status: "ok" },
    ...overrides,
  };
}

describe("decisionGovernance probabilistic layer", () => {
  it("keeps hard-stop precedence when risk policy blocks", () => {
    const out = computeDecisionGovernance(
      baseInput({
        risk_policy_eval: { blocked: true, status: "block" },
      }),
    );

    expect(out.metadata.probabilistic_layer_enabled).toBe(true);
    expect(out.daily_decision.decision).toBe("AVOID");
    expect(out.daily_decision.recommended_position_pct).toBe(0);
    expect(out.metadata.override).toBe("risk_policy");
  });

  it("produces sorted opportunities dashboard when enabled", () => {
    const out = computeDecisionGovernance(baseInput());

    expect(out.metadata.probabilistic_layer_enabled).toBe(true);
    expect(out.opportunities.length).toBeGreaterThan(0);
    expect(out.top_opportunities.length).toBeGreaterThan(0);
    expect(out.opportunities[0].score).toBeGreaterThanOrEqual(out.opportunities[out.opportunities.length - 1].score);
    expect(out.opportunities[0].probability_up).toBeGreaterThanOrEqual(0);
    expect(out.opportunities[0].probability_up + out.opportunities[0].probability_down).toBeCloseTo(1, 3);
  });

  it("keeps hard-stop precedence when action gate blocks even with positive opportunity", () => {
    const out = computeDecisionGovernance(
      baseInput({
        action_gate: { status: "blocked", allowExecution: false },
        risk_policy_eval: { blocked: false, status: "ok" },
      }),
    );

    expect(out.metadata.probabilistic_layer_enabled).toBe(true);
    expect(out.daily_decision.decision).toBe("AVOID");
    expect(out.daily_decision.recommended_position_pct).toBe(0);
    expect(out.metadata.override).toBe("action_gate");
  });

  it("never allows probabilistic override when both hard-stops are active", () => {
    const out = computeDecisionGovernance(
      baseInput({
        action_gate: { status: "blocked", allowExecution: false },
        risk_policy_eval: { blocked: true, status: "block" },
      }),
    );

    expect(out.metadata.probabilistic_layer_enabled).toBe(true);
    expect(out.daily_decision.decision).toBe("AVOID");
    expect(out.daily_decision.recommended_position_pct).toBe(0);
    expect(out.metadata.override).toBe("risk_policy");
  });

  it("degrades safely with sparse asset inputs", () => {
    const out = computeDecisionGovernance(
      baseInput({
        assets: [{ asset: "VWCE" }],
        portfolio_total_eur: 0,
        drawdown_pct: null,
        execution_quality_score: null,
      }),
    );

    expect(out.enabled).toBe(true);
    expect(Array.isArray(out.opportunities)).toBe(true);
    expect(out.daily_decision).toBeTruthy();
    expect(out.decision_confidence).toBeGreaterThan(0);
  });
});
