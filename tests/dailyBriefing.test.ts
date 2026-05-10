import { describe, expect, it } from "vitest";
import { buildDailyBriefing } from "@/lib/engine/dailyBriefing";

describe("dailyBriefing", () => {
  it("generates briefing with key opportunity and buy focus", () => {
    const out = buildDailyBriefing({
      enabled: true,
      as_of: "2026-03-04T12:00:00.000Z",
      regime: "trend",
      volatility_regime: "medium",
      momentum: 0.4,
      portfolio_risk: {
        risk_level: "moderate",
        concentration_warning: false,
        concentration_top1_pct: 18,
        concentration_top3_pct: 51,
        diversification_score: 71,
        volatility_exposure_pct: 19,
      },
      capital_protection: {
        protection_mode: false,
      },
      daily_decision: {
        decision: "BUY",
        asset: "BTC",
        confidence_pct: 64,
      },
      opportunities: [
        {
          asset: "BTC",
          score: 2.3,
          probability_up: 0.64,
          expected_move: 4.1,
          recommended_position_pct: 3.5,
        },
      ],
      action_gate_status: "ready",
      risk_policy_blocked: false,
    });

    expect(out.enabled).toBe(true);
    expect(out.key_opportunity?.asset).toBe("BTC");
    expect(out.market_summary.toLowerCase()).toContain("momentum");
    expect(out.suggested_focus.toLowerCase()).toContain("buy");
  });

  it("prioritizes hard blocks in suggested focus", () => {
    const out = buildDailyBriefing({
      enabled: true,
      as_of: "2026-03-04T12:00:00.000Z",
      regime: "range",
      volatility_regime: "high",
      daily_decision: {
        decision: "BUY",
      },
      opportunities: [
        {
          asset: "SPY",
          score: 1.2,
          probability_up: 0.58,
          expected_move: 2.1,
          recommended_position_pct: 2.2,
        },
      ],
      action_gate_status: "blocked",
      risk_policy_blocked: true,
      capital_protection: {
        protection_mode: true,
      },
    });

    expect(out.suggested_focus.toLowerCase()).toContain("risk policy");
    expect(out.portfolio_health.status).toBe("risk_high");
  });

  it("is deterministic for the same inputs", () => {
    const input = {
      enabled: true,
      as_of: "2026-03-04T12:00:00.000Z",
      regime: "compression" as const,
      volatility_regime: "low" as const,
      opportunities: [{ asset: "AGGH", score: 0.4, probability_up: 0.52, expected_move: 1.4, recommended_position_pct: 1.2 }],
      daily_decision: { decision: "HOLD" },
      action_gate_status: "ready",
      risk_policy_blocked: false,
    };
    expect(buildDailyBriefing(input)).toEqual(buildDailyBriefing(input));
  });
});
