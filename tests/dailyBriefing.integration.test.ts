import { describe, expect, it } from "vitest";
import { computeDecisionGovernance } from "@/lib/engine/decisionGovernance";
import { buildDailyBriefingFromDecisionGovernance } from "@/lib/engine/dailyBriefing";

describe("dailyBriefing integration", () => {
  it("maps decision governance output into daily-bundle friendly briefing payload", () => {
    const governance = computeDecisionGovernance({
      enabled: true,
      probabilistic_enabled: true,
      mode: "investing",
      asOf: "2026-03-04T12:00:00.000Z",
      assets: [
        {
          asset: "SPY",
          value_eur: 600,
          volatility_pct: 16,
          marketData: {
            price: 104,
            prevClose: 100,
          },
        },
        {
          asset: "AGGH",
          value_eur: 400,
          volatility_pct: 8,
          marketData: {
            price: 101,
            prevClose: 100,
          },
        },
      ],
      portfolio_total_eur: 1000,
      drawdown_pct: -4,
      execution_quality_score: 78,
      coverage_pct: 98,
      max_single_position_pct: 22,
      action_gate: { status: "ready", allowExecution: true },
      risk_policy_eval: { blocked: false, status: "ok" },
    });

    const briefing = buildDailyBriefingFromDecisionGovernance({
      enabled: true,
      as_of: "2026-03-04T12:00:00.000Z",
      decision_governance: governance,
      action_gate: { status: "ready", allowExecution: true },
      risk_policy_eval: { blocked: false, status: "ok" },
    });

    expect(briefing.enabled).toBe(true);
    expect(typeof briefing.market_summary).toBe("string");
    expect(typeof briefing.portfolio_status).toBe("string");
    expect(typeof briefing.suggested_focus).toBe("string");
    expect(briefing.key_opportunity_text.length).toBeGreaterThan(0);
  });

  it("keeps protective focus when daily-bundle gating is blocked", () => {
    const governance = computeDecisionGovernance({
      enabled: true,
      probabilistic_enabled: true,
      mode: "investing",
      asOf: "2026-03-04T12:00:00.000Z",
      assets: [{ asset: "SPY", value_eur: 1000, volatility_pct: 30 }],
      portfolio_total_eur: 1000,
      drawdown_pct: -18,
      execution_quality_score: 42,
      coverage_pct: 60,
      max_single_position_pct: 22,
      action_gate: { status: "blocked", allowExecution: false },
      risk_policy_eval: { blocked: true, status: "block" },
    });

    const briefing = buildDailyBriefingFromDecisionGovernance({
      enabled: true,
      as_of: "2026-03-04T12:00:00.000Z",
      decision_governance: governance,
      action_gate: { status: "blocked", allowExecution: false },
      risk_policy_eval: { blocked: true, status: "block" },
    });

    expect(briefing.portfolio_health.status).toBe("risk_high");
    expect(briefing.suggested_focus.toLowerCase()).toContain("risk policy");
  });
});
