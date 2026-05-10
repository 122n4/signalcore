import { describe, expect, it } from "vitest";
import { computeCapitalProtection } from "@/lib/engine/capitalProtection";

describe("capitalProtection", () => {
  it("stays neutral when no trigger is present", () => {
    const out = computeCapitalProtection({
      drawdown_pct: -3,
      volatility_regime: "medium",
      execution_quality_score: 82,
      action_gate_status: "clear",
      risk_policy_blocked: false,
    });

    expect(out.protection_mode).toBe(false);
    expect(out.recommended_action_bias).toBe("neutral");
    expect(out.size_multiplier).toBe(1);
    expect(out.position_size_multiplier).toBe(1);
    expect(out.restrict_aggressive_entries).toBe(false);
    expect(out.reasons).toEqual([]);
  });

  it("activates in stressed conditions and tightens sizing", () => {
    const out = computeCapitalProtection({
      drawdown_pct: -16,
      volatility_regime: "high",
      execution_quality_score: 45,
      action_gate_status: "blocked",
      risk_policy_blocked: true,
    });

    expect(out.protection_mode).toBe(true);
    expect(out.recommended_action_bias).toBe("defensive");
    expect(out.restrict_aggressive_entries).toBe(true);
    expect(out.size_multiplier).toBeLessThan(1);
    expect(out.position_size_multiplier).toBe(out.size_multiplier);
    expect(out.size_multiplier).toBeLessThanOrEqual(0.4);
    expect(out.reasons).toContain("volatility_regime_high");
    expect(out.reasons).toContain("risk_policy_blocked");
  });

  it("activates on correlation risk trigger even with calm drawdown", () => {
    const out = computeCapitalProtection({
      drawdown_pct: -2,
      volatility_regime: "medium",
      execution_quality_score: 82,
      action_gate_status: "clear",
      risk_policy_blocked: false,
      correlation_risk_high: true,
    });

    expect(out.protection_mode).toBe(true);
    expect(out.position_size_multiplier).toBeLessThan(1);
    expect(out.reasons).toContain("correlation_risk_high");
  });
});
