import { describe, expect, it } from "vitest";

import {
  applyDecisionWeighting,
  makeDecision,
  readBias,
  readClarity,
  readEnvironment,
} from "@/lib/trading/decision";
import type {
  BiasOutput,
  ClarityOutput,
  DecisionWeightingOutput,
  EnvironmentOutput,
} from "@/lib/trading/decision";

import { createDecisionInput } from "./helpers/tradingDecisionFixtures";

function runDecision(input: ReturnType<typeof createDecisionInput>) {
  const clarity = readClarity(input);
  const bias = readBias(input);
  const environment = readEnvironment(input);
  const weighting = applyDecisionWeighting(input, clarity, bias, environment);

  return makeDecision(input, clarity, bias, environment, weighting);
}

describe("trading decision engine", () => {
  it("emits MARKET_CLOSED when the session is closed", () => {
    const input = createDecisionInput({
      marketOverrides: {
        session: { marketOpen: false, session: "market_closed", confidence: 95 },
      },
    });

    const result = runDecision(input);

    expect(result.currentState).toBe("MARKET_CLOSED");
  });

  it("emits WAIT when there is no valid setup", () => {
    const input = createDecisionInput();

    const result = runDecision(input);

    expect(result.currentState).toBe("WAIT");
  });

  it("emits SETUP_FORMING when a setup exists but is still early", () => {
    const input = createDecisionInput({
      marketOverrides: {
        structure: { state: "uptrend", direction: "long", score: 74, confidence: 76 },
        regime: { state: "trending", score: 72, confidence: 70 },
        momentum: { state: "rising", direction: "long", score: 68, confidence: 66 },
      },
      setupCoreOverrides: {
        setup: {
          type: "trend_pullback",
          direction: "long",
          triggerLevel: 104.4,
          invalidationLevel: 102.7,
          confidence: 74,
        },
        maturity: { state: "forming", score: 38, confidence: 66 },
        opportunityWindow: { state: "forming", score: 40, confidence: 68 },
        quality: { score: 64, grade: "B", confidence: 72 },
      },
    });

    const result = runDecision(input);

    expect(result.currentState).toBe("SETUP_FORMING");
  });

  it("emits TRADE_VALID when confluence is ready and active", () => {
    const input = createDecisionInput({
      marketOverrides: {
        structure: { state: "uptrend", direction: "long", score: 82, confidence: 82 },
        regime: { state: "trending", score: 78, confidence: 76 },
        volatility: { state: "expansion", score: 62, confidence: 60 },
        session: { marketOpen: true, session: "ny_open", confidence: 92 },
        momentum: { state: "accelerating", direction: "long", score: 82, confidence: 80 },
        liquidity: { state: "healthy_participation", score: 70, confidence: 68 },
      },
      setupCoreOverrides: {
        setup: {
          type: "breakout_continuation",
          direction: "long",
          triggerLevel: 103.9,
          invalidationLevel: 102.6,
          confidence: 84,
        },
        maturity: { state: "ready", score: 78, confidence: 82 },
        opportunityWindow: { state: "active", score: 82, confidence: 84 },
        quality: { score: 84, grade: "A", confidence: 86 },
      },
    });

    const result = runDecision(input);

    expect(result.currentState).toBe("TRADE_VALID");
    expect(result.confidence).toBeGreaterThanOrEqual(75);
  });

  it("promotes a strong developing setup into TRADE_VALID before full maturity", () => {
    const input = createDecisionInput({
      marketOverrides: {
        structure: { state: "uptrend", direction: "long", score: 80, confidence: 80 },
        regime: { state: "trending", score: 76, confidence: 74 },
        volatility: { state: "normal", score: 60, confidence: 60 },
        session: { marketOpen: true, session: "london_ny_overlap", confidence: 90 },
        momentum: { state: "accelerating", direction: "long", score: 78, confidence: 78 },
        liquidity: { state: "healthy_participation", score: 72, confidence: 70 },
      },
      setupCoreOverrides: {
        setup: {
          type: "breakout_continuation",
          direction: "long",
          triggerLevel: 103.9,
          invalidationLevel: 102.8,
          confidence: 84,
        },
        maturity: { state: "developing", score: 66, confidence: 80 },
        opportunityWindow: { state: "opening", score: 70, confidence: 82 },
        quality: { score: 82, grade: "A", confidence: 84 },
      },
    });

    const result = runDecision(input);

    expect(result.currentState).toBe("TRADE_VALID");
    expect(result.primaryMessage).toContain("early");
  });

  it("promotes a high-quality reversal into TRADE_VALID with medium clarity in compression", () => {
    const clarity: ClarityOutput = {
      level: "medium",
      score: 63,
      conflictScore: 16,
      alignment: 70,
    };
    const bias: BiasOutput = {
      direction: "bearish",
      score: 74,
      confidence: 76,
    };
    const environment: EnvironmentOutput = {
      state: "favorable",
      score: 82,
      confidence: 78,
    };
    const weighting: DecisionWeightingOutput = {
      contextProfile: "test-reversal",
      weightedScores: {
        setup: 82,
        quality: 80,
        clarity: 63,
        environment: 82,
        maturity: 58,
        opportunityWindow: 62,
        momentum: 74,
        conflictPenalty: 8,
        confluenceBonus: 5,
      },
      confidence: 76,
    };
    const input = createDecisionInput({
      marketOverrides: {
        structure: { state: "uptrend", direction: "long", score: 74, confidence: 74 },
        regime: { state: "compression", score: 80, confidence: 78 },
        volatility: { state: "normal", score: 54, confidence: 56 },
        session: { marketOpen: true, session: "asia_flow", confidence: 82 },
        momentum: { state: "rising", direction: "short", score: 72, confidence: 70 },
        liquidity: { state: "reclaim_after_sweep", score: 82, confidence: 80 },
      },
      setupCoreOverrides: {
        setup: {
          type: "liquidity_sweep_reversal",
          direction: "short",
          triggerLevel: 101.8,
          invalidationLevel: 103.1,
          confidence: 82,
        },
        maturity: { state: "developing", score: 58, confidence: 74 },
        opportunityWindow: { state: "opening", score: 62, confidence: 76 },
        quality: { score: 80, grade: "A", confidence: 82 },
      },
    });

    const result = makeDecision(input, clarity, bias, environment, weighting);

    expect(result.currentState).toBe("TRADE_VALID");
    expect(result.primaryMessage).toContain("early");
  });

  it("keeps a high-clarity reversal in WAIT when setup quality is only mid-tier", () => {
    const clarity: ClarityOutput = {
      level: "high",
      score: 80,
      conflictScore: 10,
      alignment: 84,
    };
    const bias: BiasOutput = {
      direction: "bearish",
      score: 72,
      confidence: 74,
    };
    const environment: EnvironmentOutput = {
      state: "neutral",
      score: 64,
      confidence: 70,
    };
    const weighting: DecisionWeightingOutput = {
      contextProfile: "test-reversal-high-clarity",
      weightedScores: {
        setup: 62,
        quality: 61,
        clarity: 80,
        environment: 64,
        maturity: 58,
        opportunityWindow: 62,
        momentum: 70,
        conflictPenalty: 8,
        confluenceBonus: 5,
      },
      confidence: 74,
    };
    const input = createDecisionInput({
      marketOverrides: {
        structure: { state: "transition", direction: "neutral", score: 50, confidence: 50 },
        regime: { state: "compression", score: 80, confidence: 78 },
        volatility: { state: "normal", score: 54, confidence: 56 },
        session: { marketOpen: true, session: "asia_flow", confidence: 82 },
        momentum: { state: "rising", direction: "short", score: 70, confidence: 68 },
        liquidity: { state: "neutral", score: 48, confidence: 50 },
      },
      setupCoreOverrides: {
        setup: {
          type: "range_reclaim",
          direction: "short",
          triggerLevel: 101.8,
          invalidationLevel: 103.1,
          confidence: 72,
        },
        maturity: { state: "developing", score: 58, confidence: 74 },
        opportunityWindow: { state: "opening", score: 62, confidence: 76 },
        quality: { score: 61, grade: "C", confidence: 72 },
      },
    });

    const result = makeDecision(input, clarity, bias, environment, weighting);

    expect(result.currentState).toBe("WAIT");
  });

  it("blocks a high-clarity reversal when quality and environment are soft", () => {
    const clarity: ClarityOutput = {
      level: "high",
      score: 78,
      conflictScore: 12,
      alignment: 82,
    };
    const bias: BiasOutput = {
      direction: "bearish",
      score: 70,
      confidence: 72,
    };
    const environment: EnvironmentOutput = {
      state: "neutral",
      score: 60,
      confidence: 70,
    };
    const weighting: DecisionWeightingOutput = {
      contextProfile: "test-reversal-softened-thresholds",
      weightedScores: {
        setup: 68,
        quality: 58,
        clarity: 78,
        environment: 60,
        maturity: 58,
        opportunityWindow: 62,
        momentum: 72,
        conflictPenalty: 8,
        confluenceBonus: 5,
      },
      confidence: 74,
    };
    const input = createDecisionInput({
      marketOverrides: {
        structure: { state: "transition", direction: "neutral", score: 52, confidence: 54 },
        regime: { state: "compression", score: 78, confidence: 76 },
        volatility: { state: "normal", score: 54, confidence: 56 },
        session: { marketOpen: true, session: "late_us", confidence: 84 },
        momentum: { state: "rising", direction: "short", score: 72, confidence: 70 },
        liquidity: { state: "neutral", score: 52, confidence: 54 },
      },
      setupCoreOverrides: {
        setup: {
          type: "range_reclaim",
          direction: "short",
          triggerLevel: 101.8,
          invalidationLevel: 103.1,
          confidence: 72,
        },
        maturity: { state: "developing", score: 58, confidence: 74 },
        opportunityWindow: { state: "opening", score: 62, confidence: 76 },
        quality: { score: 58, grade: "C", confidence: 70 },
      },
    });

    const result = makeDecision(input, clarity, bias, environment, weighting);

    expect(result.currentState).toBe("WAIT");
  });

  it("blocks breakout continuation when clarity and environment are marginal", () => {
    const clarity: ClarityOutput = {
      level: "medium",
      score: 60,
      conflictScore: 18,
      alignment: 64,
    };
    const bias: BiasOutput = {
      direction: "bullish",
      score: 62,
      confidence: 70,
    };
    const environment: EnvironmentOutput = {
      state: "neutral",
      score: 58,
      confidence: 68,
    };
    const weighting: DecisionWeightingOutput = {
      contextProfile: "test",
      weightedScores: {
        setup: 64,
        quality: 64,
        clarity: 60,
        environment: 58,
        maturity: 78,
        opportunityWindow: 78,
        momentum: 60,
        conflictPenalty: 20,
        confluenceBonus: 0,
      },
      confidence: 68,
    };

    const breakoutInput = createDecisionInput({
      marketOverrides: {
        structure: { state: "uptrend", direction: "long", score: 76, confidence: 76 },
        regime: { state: "trending", score: 68, confidence: 68 },
        volatility: { state: "normal", score: 56, confidence: 56 },
        session: { marketOpen: true, session: "london_ny_overlap", confidence: 88 },
        momentum: { state: "rising", direction: "long", score: 60, confidence: 62 },
        liquidity: { state: "healthy_participation", score: 62, confidence: 60 },
      },
      setupCoreOverrides: {
        setup: {
          type: "breakout_continuation",
          direction: "long",
          triggerLevel: 103.7,
          invalidationLevel: 102.5,
          confidence: 72,
        },
        maturity: { state: "ready", score: 78, confidence: 78 },
        opportunityWindow: { state: "active", score: 82, confidence: 80 },
        quality: { score: 64, grade: "B", confidence: 76 },
      },
    });
    const pullbackInput = createDecisionInput({
      marketOverrides: breakoutInput.market,
      setupCoreOverrides: {
        setup: {
          type: "trend_pullback",
          direction: "long",
          triggerLevel: 103.7,
          invalidationLevel: 102.5,
          confidence: 72,
        },
        maturity: { state: "ready", score: 78, confidence: 78 },
        opportunityWindow: { state: "active", score: 82, confidence: 80 },
        quality: { score: 64, grade: "B", confidence: 76 },
      },
    });

    const breakoutResult = makeDecision(breakoutInput, clarity, bias, environment, weighting);
    const pullbackResult = makeDecision(pullbackInput, clarity, bias, environment, weighting);

    expect(breakoutResult.currentState).toBe("WAIT");
    expect(pullbackResult.currentState).toBe("WAIT");
  });

  it("emits TOO_LATE when the setup is late or degrading", () => {
    const input = createDecisionInput({
      marketOverrides: {
        structure: { state: "downtrend", direction: "short", score: 78, confidence: 80 },
        regime: { state: "trending", score: 74, confidence: 72 },
        momentum: { state: "weakening", direction: "short", score: 58, confidence: 60 },
      },
      setupCoreOverrides: {
        setup: {
          type: "breakout_continuation",
          direction: "short",
          triggerLevel: 101.6,
          invalidationLevel: 103.2,
          confidence: 76,
        },
        maturity: { state: "late", score: 42, confidence: 76 },
        opportunityWindow: { state: "degrading", score: 44, confidence: 74 },
        quality: { score: 56, grade: "C", confidence: 70 },
      },
    });

    const result = runDecision(input);

    expect(result.currentState).toBe("TOO_LATE");
  });

  it("emits EXIT when a setup is invalidated", () => {
    const input = createDecisionInput({
      marketOverrides: {
        structure: { state: "failed_break", direction: "short", score: 70, confidence: 72 },
        regime: { state: "ranging", score: 56, confidence: 58 },
        momentum: { state: "exhausted", direction: "short", score: 58, confidence: 60 },
      },
      setupCoreOverrides: {
        setup: {
          type: "failed_breakout",
          direction: "short",
          triggerLevel: 101.8,
          invalidationLevel: 103.1,
          confidence: 68,
        },
        maturity: { state: "invalid", score: 10, confidence: 90 },
        opportunityWindow: { state: "closed", score: 10, confidence: 90 },
        quality: { score: 34, grade: "D", confidence: 66 },
      },
    });

    const result = runDecision(input);

    expect(result.currentState).toBe("EXIT");
  });
});
