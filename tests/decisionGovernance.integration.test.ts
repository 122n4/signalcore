import { describe, expect, it } from "vitest";
import { computeDecisionGovernance, type DecisionGovernanceInput } from "@/lib/engine/decisionGovernance";

function baseInput(overrides: Partial<DecisionGovernanceInput> = {}): DecisionGovernanceInput {
  return {
    enabled: true,
    mode: "investing" as const,
    asOf: "2026-03-04T09:00:00.000Z",
    assets: [
      {
        asset: "SPY",
        value_eur: 100,
        marketData: {
          price: 108,
          prevClose: 100,
        },
        volatility_pct: 10,
      },
    ],
    portfolio_total_eur: 1000,
    drawdown_pct: -4,
    execution_quality_score: 82,
    max_single_position_pct: 22,
    action_gate: {
      status: "clear",
      allowExecution: true,
    },
    risk_policy_eval: {
      blocked: false,
      status: "ok",
    },
    ...overrides,
  };
}

describe("decisionGovernance integration", () => {
  it("gives RiskPolicy hard-stop precedence over all other modules", () => {
    const out = computeDecisionGovernance(
      baseInput({
        risk_policy_eval: {
          blocked: true,
          status: "block",
        },
      }),
    );

    expect(out.daily_decision.decision).toBe("AVOID");
    expect(out.daily_decision.reason_codes).toContain("risk_policy_blocked");
    expect(out.metadata.override).toBe("risk_policy");
  });

  it("gives ActionGate hard-stop precedence when policy is clear", () => {
    const out = computeDecisionGovernance(
      baseInput({
        action_gate: {
          status: "blocked",
          allowExecution: false,
        },
      }),
    );

    expect(out.daily_decision.decision).toBe("AVOID");
    expect(out.daily_decision.reason_codes).toContain("action_gate_blocked");
    expect(out.metadata.override).toBe("action_gate");
  });

  it("applies capital protection bias before opportunity execution", () => {
    const out = computeDecisionGovernance(
      baseInput({
        drawdown_pct: -25,
        execution_quality_score: 45,
      }),
    );

    expect(out.capital_protection.protection_mode).toBe(true);
    expect(out.metadata.override).toBe("capital_protection");
    expect(["HOLD", "REDUCE"]).toContain(out.daily_decision.decision);
    expect(out.daily_decision.reason_codes[0]).toMatch(/^capital_protection_/);
  });

  it("produces BUY/ADD mapping for favorable and unblocked context", () => {
    const out = computeDecisionGovernance(baseInput());

    expect(out.daily_decision.decision).toBe("BUY");
    expect(out.daily_decision.legacy_action_type).toBe("ADD");
    expect(out.top_opportunities.length).toBeGreaterThan(0);
    expect(out.decision_confidence).toBeGreaterThan(0);
  });
});
