import { describe, expect, it } from "vitest";

import { applyBacktestMarketSessionOverrides } from "@/lib/trading/backtest";
import type { DecisionCoreOutput } from "@/lib/trading/decision";

function createDecisionCore(state: DecisionCoreOutput["decision"]["currentState"]): DecisionCoreOutput {
  return {
    clarity: {
      level: "high",
      score: 80,
      conflictScore: 10,
      alignment: 85,
    },
    bias: {
      direction: "bullish",
      score: 75,
      confidence: 80,
    },
    environment: {
      state: "favorable",
      score: 78,
      confidence: 82,
    },
    weighting: {
      contextProfile: "test",
      weightedScores: {
        setup: 80,
        quality: 80,
        clarity: 80,
        environment: 80,
        maturity: 80,
        opportunityWindow: 80,
        momentum: 80,
        conflictPenalty: 0,
        confluenceBonus: 0,
      },
      confidence: 80,
    },
    decision: {
      currentState: state,
      primaryMessage: "Trade valid",
      confidence: 80,
      reasons: ["Baseline reason"],
    },
  };
}

describe("applyBacktestMarketSessionOverrides", () => {
  it("blocks a matching trade-valid context", () => {
    const result = applyBacktestMarketSessionOverrides({
      instrument: "NAS100",
      session: "pre_market",
      setupType: "breakout_continuation",
      qualityGrade: "A",
      clarityLevel: "high",
      environmentState: "favorable",
      decisionCore: createDecisionCore("TRADE_VALID"),
      overrides: {
        blockedTradeValidContexts: [
          {
            instrument: "NAS100",
            sessions: ["pre_market"],
            reason: "Backtest blocked NAS100 pre-market.",
          },
        ],
      },
    });

    expect(result.decision.currentState).toBe("BLOCKED");
    expect(result.decision.secondaryMessage).toBe("Backtest blocked NAS100 pre-market.");
    expect(result.decision.reasons).toContain("Backtest blocked NAS100 pre-market.");
  });

  it("does not block non-matching contexts", () => {
    const result = applyBacktestMarketSessionOverrides({
      instrument: "XAUUSD",
      session: "asia_flow",
      setupType: "liquidity_sweep_reversal",
      qualityGrade: "A",
      clarityLevel: "high",
      environmentState: "favorable",
      decisionCore: createDecisionCore("TRADE_VALID"),
      overrides: {
        blockedTradeValidContexts: [
          {
            instrument: "NAS100",
            sessions: ["pre_market"],
          },
        ],
      },
    });

    expect(result.decision.currentState).toBe("TRADE_VALID");
    expect(result.decision.reasons).toEqual(["Baseline reason"]);
  });

  it("does not alter non-trade-valid states", () => {
    const result = applyBacktestMarketSessionOverrides({
      instrument: "NAS100",
      session: "pre_market",
      setupType: "breakout_continuation",
      qualityGrade: "A",
      clarityLevel: "high",
      environmentState: "favorable",
      decisionCore: createDecisionCore("WAIT"),
      overrides: {
        blockedTradeValidContexts: [
          {
            instrument: "NAS100",
            sessions: ["pre_market"],
          },
        ],
      },
    });

    expect(result.decision.currentState).toBe("WAIT");
  });

  it("matches a context rule only when quality and clarity filters also align", () => {
    const blocked = applyBacktestMarketSessionOverrides({
      instrument: "NAS100",
      session: "london_ny_overlap",
      setupType: "breakout_continuation",
      qualityGrade: "B",
      clarityLevel: "medium",
      environmentState: "neutral",
      decisionCore: createDecisionCore("TRADE_VALID"),
      overrides: {
        blockedTradeValidContexts: [
          {
            instrument: "NAS100",
            sessions: ["london_ny_overlap"],
            setupTypes: ["breakout_continuation"],
            qualityGrades: ["B", "C", "D"],
            clarityLevels: ["medium"],
            environmentStates: ["neutral"],
            reason: "Backtest blocked the lower-conviction NAS100 overlap block.",
          },
        ],
      },
    });

    const allowed = applyBacktestMarketSessionOverrides({
      instrument: "NAS100",
      session: "london_ny_overlap",
      setupType: "breakout_continuation",
      qualityGrade: "A",
      clarityLevel: "high",
      environmentState: "favorable",
      decisionCore: createDecisionCore("TRADE_VALID"),
      overrides: {
        blockedTradeValidContexts: [
          {
            instrument: "NAS100",
            sessions: ["london_ny_overlap"],
            setupTypes: ["breakout_continuation"],
            qualityGrades: ["B", "C", "D"],
            clarityLevels: ["medium"],
            environmentStates: ["neutral"],
          },
        ],
      },
    });

    expect(blocked.decision.currentState).toBe("BLOCKED");
    expect(allowed.decision.currentState).toBe("TRADE_VALID");
  });
});
