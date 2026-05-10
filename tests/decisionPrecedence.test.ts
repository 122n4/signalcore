import { describe, expect, it } from "vitest";
import {
  resolveDecisionPrecedence,
  type ResolveDecisionPrecedenceInput,
} from "@/lib/decision/precedence";
import type {
  ExecutionInstruction,
  PortfolioStance,
} from "@/lib/decision/types";

function makePortfolioStance(overrides: Partial<PortfolioStance> = {}): PortfolioStance {
  return {
    asset: "AAPL",
    decision: "BUY",
    legacyActionType: "ADD",
    confidencePct: 72,
    expectedMovePct: 3.4,
    expectedValue: 1.8,
    recommendedPositionPct: 9,
    score: 77,
    regime: "trend",
    riskLevel: "moderate",
    reasonCodes: ["base_case"],
    source: "decision_governance",
    ...overrides,
  };
}

function makeExecutionInstruction(overrides: Partial<ExecutionInstruction> = {}): ExecutionInstruction {
  return {
    category: "DEPLOY",
    brokerInstruction: "Deploy measured capital.",
    capitalImpact: "Increase exposure slightly.",
    riskImpact: "Raises portfolio risk modestly.",
    expectedOutcomeWindow: "1-3 sessions",
    allowExecution: true,
    source: "daily_enhancements",
    derivedFromWorkflowType: "ADD",
    ...overrides,
  };
}

function makeInput(
  overrides: Partial<ResolveDecisionPrecedenceInput> = {},
): ResolveDecisionPrecedenceInput {
  return {
    branch: "success",
    branchReason: null,
    portfolioStance: makePortfolioStance(),
    executionInstruction: makeExecutionInstruction(),
    actionGate: null,
    riskPolicyEval: null,
    capitalProtection: null,
    topLeak: null,
    dataQualityBlocked: false,
    dataQualityReason: null,
    ...overrides,
  };
}

describe("resolveDecisionPrecedence", () => {
  it("lets risk policy override action gate and capital protection", () => {
    const result = resolveDecisionPrecedence(makeInput({
      actionGate: {
        status: "blocked",
        allowExecution: false,
        reasons: ["Coverage below threshold"],
        nextStep: "Fix pricing coverage.",
        topLeakKey: "pricing_coverage",
        topLeakSeverity: "medium",
      },
      riskPolicyEval: {
        status: "block",
        blocked: true,
        reasons: ["Policy breach detected."],
        nextStep: "Reduce concentration.",
        breaches: [
          {
            key: "single_position_limit",
            message: "Single position exceeds limit.",
            actual: 28,
            limit: 20,
          },
        ],
        warnings: [],
        snapshot: {
          top1Pct: 28,
          top3Pct: 50,
          drawdownPct: -5,
          exposurePct: 90,
          coveragePct: 82,
          pressureScore: 63,
          missingSymbols: 1,
          topLeakSeverity: "med",
        },
      },
      capitalProtection: {
        protection_mode: true,
        recommended_action_bias: "defensive",
        size_multiplier: 0.55,
        position_size_multiplier: 0.55,
        restrict_aggressive_entries: true,
        reasons: ["drawdown_exceeded_12"],
      },
      topLeak: {
        key: "pricing_coverage",
        title: "Pricing coverage weak",
        severity: "med",
      },
    }));

    expect(result.override).toBe("risk_policy");
    expect(result.allowExecution).toBe(false);
    expect(result.executionInstruction.allowExecution).toBe(false);
    expect(result.blockers[0]?.layer).toBe("risk_policy");
    expect(result.blockers.some((blocker) => blocker.layer === "action_gate")).toBe(true);
    expect(result.blockers.some((blocker) => blocker.layer === "capital_protection")).toBe(true);
  });

  it("lets action gate override capital protection when policy is clear", () => {
    const result = resolveDecisionPrecedence(makeInput({
      actionGate: {
        status: "blocked",
        allowExecution: false,
        reasons: ["Manual proof missing."],
        nextStep: "Add proof before trading.",
        topLeakKey: "proof_gap",
        topLeakSeverity: "high",
      },
      riskPolicyEval: {
        status: "pass",
        blocked: false,
        reasons: [],
        nextStep: "Continue.",
        breaches: [],
        warnings: [],
        snapshot: {
          top1Pct: 18,
          top3Pct: 42,
          drawdownPct: -3,
          exposurePct: 80,
          coveragePct: 94,
          pressureScore: 38,
          missingSymbols: 0,
          topLeakSeverity: "high",
        },
      },
      capitalProtection: {
        protection_mode: true,
        recommended_action_bias: "defensive",
        size_multiplier: 0.7,
        position_size_multiplier: 0.7,
        restrict_aggressive_entries: true,
        reasons: ["action_gate_blocked"],
      },
      topLeak: {
        key: "proof_gap",
        title: "Proof missing",
        severity: "high",
      },
    }));

    expect(result.override).toBe("action_gate");
    expect(result.allowExecution).toBe(false);
    expect(result.executionInstruction.allowExecution).toBe(false);
    expect(result.blockers[0]?.layer).toBe("action_gate");
  });

  it("dedupes repeated blocker detail fragments so the live surface does not echo the same sentence twice", () => {
    const result = resolveDecisionPrecedence(makeInput({
      riskPolicyEval: {
        status: "block",
        blocked: true,
        reasons: ["Pricing coverage below policy (0% < 70%)."],
        nextStep: "Reduce concentration/pressure and restore pricing coverage before executing.",
        breaches: [
          {
            key: "pricing_coverage_limit",
            message: "Pricing coverage below policy (0% < 70%).",
            actual: 0,
            limit: 70,
          },
        ],
        warnings: [],
        snapshot: {
          top1Pct: 18,
          top3Pct: 42,
          drawdownPct: -3,
          exposurePct: 64,
          coveragePct: 0,
          pressureScore: 28,
          missingSymbols: 1,
          topLeakSeverity: "high",
        },
      },
    }));

    expect(result.blockers[0]?.detail).toBe(
      "Pricing coverage below policy (0% < 70%). Reduce concentration/pressure and restore pricing coverage before executing.",
    );
  });

  it("keeps execution allowed but marks capital protection when higher layers are clear", () => {
    const result = resolveDecisionPrecedence(makeInput({
      actionGate: {
        status: "ready",
        allowExecution: true,
        reasons: [],
        nextStep: null,
        topLeakKey: null,
        topLeakSeverity: null,
      },
      riskPolicyEval: {
        status: "pass",
        blocked: false,
        reasons: [],
        nextStep: "Continue.",
        breaches: [],
        warnings: [],
        snapshot: {
          top1Pct: 14,
          top3Pct: 36,
          drawdownPct: -2,
          exposurePct: 68,
          coveragePct: 97,
          pressureScore: 28,
          missingSymbols: 0,
          topLeakSeverity: "low",
        },
      },
      capitalProtection: {
        protection_mode: true,
        recommended_action_bias: "defensive",
        size_multiplier: 0.7,
        position_size_multiplier: 0.7,
        restrict_aggressive_entries: true,
        reasons: ["volatility_regime_high"],
      },
      topLeak: null,
    }));

    expect(result.override).toBe("capital_protection");
    expect(result.allowExecution).toBe(true);
    expect(result.executionInstruction.allowExecution).toBe(true);
    expect(result.blockers).toHaveLength(1);
    expect(result.blockers[0]).toMatchObject({
      layer: "capital_protection",
      status: "warn",
      haltsExecution: false,
    });
  });

  it("synthesizes deterministic HOLD and PREPARE outputs when layers are missing", () => {
    const result = resolveDecisionPrecedence(makeInput({
      portfolioStance: null,
      executionInstruction: null,
      actionGate: null,
      riskPolicyEval: null,
      capitalProtection: null,
      topLeak: null,
    }));

    expect(result.override).toBe("none");
    expect(result.allowExecution).toBe(true);
    expect(result.portfolioStance).toMatchObject({
      decision: "HOLD",
      source: "synthetic",
      reasonCodes: ["portfolio_stance_missing"],
    });
    expect(result.executionInstruction).toMatchObject({
      category: "PREPARE",
      source: "synthetic",
      allowExecution: true,
    });
    expect(result.blockers).toEqual([]);
  });

  it("uses override none when a portfolio stance exists but no higher-priority layer fired", () => {
    const result = resolveDecisionPrecedence(makeInput({
      actionGate: {
        status: "ready",
        allowExecution: true,
        reasons: [],
        nextStep: null,
        topLeakKey: null,
        topLeakSeverity: null,
      },
      riskPolicyEval: {
        status: "pass",
        blocked: false,
        reasons: [],
        nextStep: "Continue.",
        breaches: [],
        warnings: [],
        snapshot: {
          top1Pct: 10,
          top3Pct: 25,
          drawdownPct: -1,
          exposurePct: 42,
          coveragePct: 98,
          pressureScore: 12,
          missingSymbols: 0,
          topLeakSeverity: null,
        },
      },
      capitalProtection: {
        protection_mode: false,
        recommended_action_bias: "neutral",
        size_multiplier: 1,
        position_size_multiplier: 1,
        restrict_aggressive_entries: false,
        reasons: [],
      },
      topLeak: null,
    }));

    expect(result.override).toBe("none");
    expect(result.allowExecution).toBe(true);
    expect(result.blockers).toEqual([]);
  });

  it("forces fallback override and blocks execution on non-success branches", () => {
    const result = resolveDecisionPrecedence(makeInput({
      branch: "plan_load_fallback",
      branchReason: "Plan query failed.",
      actionGate: {
        status: "ready",
        allowExecution: true,
        reasons: [],
        nextStep: null,
        topLeakKey: null,
        topLeakSeverity: null,
      },
      riskPolicyEval: null,
      capitalProtection: null,
      topLeak: null,
    }));

    expect(result.override).toBe("fallback");
    expect(result.allowExecution).toBe(false);
    expect(result.executionInstruction.allowExecution).toBe(false);
    expect(result.blockers[0]).toMatchObject({
      layer: "fallback",
      code: "plan_load_fallback",
      status: "block",
      haltsExecution: true,
    });
  });
});
