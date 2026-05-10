import { describe, expect, it } from "vitest";
import { buildPortfolioHealth } from "@/lib/engine/portfolioHealth";

describe("portfolioHealth", () => {
  it("returns stable status for diversified portfolio", () => {
    const out = buildPortfolioHealth({
      portfolio_risk: {
        risk_level: "low",
        concentration_warning: false,
        concentration_top1_pct: 14,
        concentration_top3_pct: 41,
        diversification_score: 79,
        volatility_exposure_pct: 14,
      },
      protection_mode: false,
      action_gate_blocked: false,
      risk_policy_blocked: false,
    });

    expect(out.status).toBe("stable");
    expect(out.health_score).toBeGreaterThanOrEqual(70);
    expect(out.warning).toBeNull();
  });

  it("returns risk_high with warning when concentration and policy block are present", () => {
    const out = buildPortfolioHealth({
      portfolio_risk: {
        risk_level: "high",
        concentration_warning: true,
        concentration_top1_pct: 36,
        concentration_top3_pct: 82,
        diversification_score: 28,
        volatility_exposure_pct: 39,
      },
      protection_mode: true,
      action_gate_blocked: true,
      risk_policy_blocked: true,
    });

    expect(out.status).toBe("risk_high");
    expect(out.health_score).toBeLessThan(45);
    expect(String(out.warning || "").toLowerCase()).toContain("risk policy");
  });
});
