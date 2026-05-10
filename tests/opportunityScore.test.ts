import { describe, expect, it } from "vitest";
import { computeOpportunityScore, sortScoredOpportunities } from "@/lib/engine/opportunityScore";

describe("opportunityScore", () => {
  it("computes higher score for stronger edge with lower penalties", () => {
    const strong = computeOpportunityScore({
      prob_up: 0.66,
      prob_down: 0.34,
      expected_move_pct: 4.1,
      portfolio_risk_level: "moderate",
      concentration_overflow_pct: 0,
    });
    const weak = computeOpportunityScore({
      prob_up: 0.52,
      prob_down: 0.48,
      expected_move_pct: 2.1,
      portfolio_risk_level: "high",
      concentration_overflow_pct: 18,
    });

    expect(strong.score).toBeGreaterThan(weak.score);
  });

  it("sorts by score desc, then probability_up desc, then asset asc", () => {
    const rows = sortScoredOpportunities([
      { asset: "MSFT", score: 1.2, probability_up: 0.6 },
      { asset: "AAPL", score: 1.2, probability_up: 0.6 },
      { asset: "NVDA", score: 1.2, probability_up: 0.7 },
      { asset: "SPY", score: 0.8, probability_up: 0.8 },
    ]);

    expect(rows.map((r) => r.asset)).toEqual(["NVDA", "AAPL", "MSFT", "SPY"]);
  });
});
