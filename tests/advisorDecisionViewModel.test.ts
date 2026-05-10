import { describe, expect, it } from "vitest";
import { buildDailyDecisionView, type BuildDailyDecisionViewInput } from "@/app/app/tabs/dailyDecisionViewModel";
import { buildAdvisorDecisionView } from "@/app/app/tabs/advisorDecisionViewModel";
import type { DecisionEnvelope } from "@/lib/decision/types";
import type { DeepPartial } from "./helpers/deepPartial";
import { mergeDeep } from "./helpers/mergeDeep";

function makeEnvelope(overrides: DeepPartial<DecisionEnvelope> = {}): DecisionEnvelope {
  const base: DecisionEnvelope = {
    version: "decision-envelope.v1",
    mode: "investing",
    asOf: "2026-03-07T09:00:00.000Z",
    branch: "success",
    workflowDecision: {
      type: "ADD",
      instruction: "Deploy measured capital",
      summary: "Deploy a measured tranche inside the active plan.",
      reason: "Measured deployment fits the active plan.",
      cta: {
        label: "Open Daily execution",
        action: "open_daily_execution",
        href: "/app?tab=daily&mode=investing",
      },
      source: "engine_v4",
      engineVersion: "v4-ultra",
      rawAction: "open_daily_execution",
      nextEvaluationAt: "2026-03-07T13:00:00.000Z",
      loopStage: "DAY1_NBA",
      priorityClass: "GROWTH",
      aggression: "NORMAL",
    },
    portfolioStance: {
      asset: "AAPL",
      decision: "BUY",
      legacyActionType: "ADD",
      confidencePct: 67,
      expectedMovePct: 3.4,
      expectedValue: 1.6,
      recommendedPositionPct: 9,
      score: 81,
      regime: "risk_on",
      riskLevel: "moderate",
      reasonCodes: ["expected_value_positive"],
      source: "decision_governance",
    },
    executionInstruction: {
      category: "DEPLOY",
      brokerInstruction: "Deploy a small tranche through the broker workflow.",
      capitalImpact: "Increase exposure gradually.",
      riskImpact: "Raises risk modestly but remains controlled.",
      expectedOutcomeWindow: "1-3 sessions",
      allowExecution: true,
      source: "daily_enhancements",
      derivedFromWorkflowType: "ADD",
    },
    why: {
      headline: "Measured deployment remains valid",
      rationale: "The active plan supports measured deployment.",
      evidence: ["Decision pressure: 31/100"],
      expectedOutcome: "Higher alignment with controlled risk.",
      counterfactual: "Oversized deployment would increase drift.",
    },
    blockers: [],
    scores: {
      autopilotScore: 81,
      decisionConfidencePct: 74,
      riskPressure: 31,
      planCoherence: 88,
      workflowConfidencePct: 64,
      portfolioConfidencePct: 67,
      dataQualityScore: 93,
      proofQualityScore: 82,
      reliabilityScore: 88,
    },
    support: {
      branchReason: null,
      precedence: {
        override: "none",
        allowExecution: true,
      },
      sources: {
        workflow: "engine_v4",
        portfolio: "decision_governance",
        execution: "daily_enhancements",
        engineVersion: "v4-ultra",
        inputHash: "hash-123",
      },
      snapshots: {
        actionGateStatus: "ready",
        riskPolicyStatus: "pass",
        riskPolicyBlocked: false,
        capitalProtectionMode: false,
        capitalPosture: "STABLE",
        planAlignment: "HIGH",
        governanceDecision: "BUY",
        topLeakKey: "concentration_med",
        topLeakSeverity: "medium",
        nextEvaluationAt: "2026-03-07T13:00:00.000Z",
      },
    },
  };

  return mergeDeep(base, overrides);
}

function makeInput(overrides: Partial<BuildDailyDecisionViewInput> = {}): BuildDailyDecisionViewInput {
  return {
    mode: "investing",
    daily: {
      decisionEnvelope: makeEnvelope(),
    },
    derived: {},
    hasPlan: true,
    hasHoldings: true,
    topLeak: null,
    topLeakSeverity: null,
    pressureScore: 31,
    opportunitiesCount: 2,
    ...overrides,
  };
}

describe("buildAdvisorDecisionView", () => {
  it("prioritizes no-plan state", () => {
    const decisionView = buildDailyDecisionView(makeInput({ hasPlan: false }));
    const view = buildAdvisorDecisionView({
      lang: "en",
      mode: "investing",
      decisionView,
      hasPlan: false,
      hasHoldings: false,
      starterWarmupActive: false,
      fallbackActive: false,
      lowDataQualityActive: false,
      hasFixPath: false,
      doneToday: false,
    });
    expect(view.kind).toBe("no_plan");
    expect(view.action).toBe("planning");
    expect(view.badgeTone).toBe("warn");
  });

  it("prioritizes no-holdings state", () => {
    const decisionView = buildDailyDecisionView(makeInput({ hasHoldings: false }));
    const view = buildAdvisorDecisionView({
      lang: "en",
      mode: "investing",
      decisionView,
      hasPlan: true,
      hasHoldings: false,
      starterWarmupActive: false,
      fallbackActive: false,
      lowDataQualityActive: false,
      hasFixPath: false,
      doneToday: false,
    });
    expect(view.kind).toBe("no_holdings");
    expect(view.action).toBe("portfolio");
  });

  it("prioritizes starter warmup before fix paths", () => {
    const decisionView = buildDailyDecisionView(
      makeInput({
        daily: {
          starterWarmup: { active: true },
          decisionEnvelope: makeEnvelope(),
        },
      }),
    );
    const view = buildAdvisorDecisionView({
      lang: "en",
      mode: "investing",
      decisionView,
      hasPlan: true,
      hasHoldings: true,
      starterWarmupActive: true,
      fallbackActive: false,
      lowDataQualityActive: false,
      hasFixPath: true,
      doneToday: false,
    });
    expect(view.kind).toBe("starter_warmup");
    expect(view.action).toBe("daily");
    expect(view.badgeTone).toBe("good");
  });

  it("prioritizes fatal fallback before low-data and fix paths", () => {
    const decisionView = buildDailyDecisionView(
      makeInput({
        daily: {
          decisionEnvelope: makeEnvelope({
            branch: "fatal_fallback",
            support: { precedence: { override: "fallback", allowExecution: false }, branchReason: "fatal" },
          }),
        },
      }),
    );
    const view = buildAdvisorDecisionView({
      lang: "en",
      mode: "investing",
      decisionView,
      hasPlan: true,
      hasHoldings: true,
      starterWarmupActive: false,
      fallbackActive: true,
      lowDataQualityActive: true,
      hasFixPath: true,
      doneToday: false,
    });
    expect(view.kind).toBe("fatal_fallback");
    expect(view.action).toBe("daily");
  });

  it("routes low-data-quality states to fix data first", () => {
    const decisionView = buildDailyDecisionView(
      makeInput({
        topLeak: { key: "pricing_low" },
        topLeakSeverity: "high",
        derived: { diagnostics: { pricing: { coveragePct: 62 } } },
      }),
    );
    const view = buildAdvisorDecisionView({
      lang: "en",
      mode: "investing",
      decisionView,
      hasPlan: true,
      hasHoldings: true,
      starterWarmupActive: false,
      fallbackActive: false,
      lowDataQualityActive: true,
      hasFixPath: true,
      doneToday: false,
    });
    expect(view.kind).toBe("low_data_quality");
    expect(view.action).toBe("fix");
    expect(view.detail).toContain("Repair pricing and valuation quality");
  });

  it("uses canonical rationale in healthy states", () => {
    const decisionView = buildDailyDecisionView(makeInput());
    const view = buildAdvisorDecisionView({
      lang: "en",
      mode: "investing",
      decisionView,
      hasPlan: true,
      hasHoldings: true,
      starterWarmupActive: false,
      fallbackActive: false,
      lowDataQualityActive: false,
      hasFixPath: false,
      doneToday: false,
    });
    expect(view.kind).toBe("continue_daily");
    expect(view.action).toBe("daily");
    expect(view.detail).toBe("The active plan supports measured deployment.");
    expect(view.badgeTone).toBe("good");
  });
});
