import { describe, expect, it } from "vitest";
import { buildAutonomyDecisionView } from "@/app/app/tabs/autonomyDecisionViewModel";
import { buildDailyDecisionView, type BuildDailyDecisionViewInput } from "@/app/app/tabs/dailyDecisionViewModel";
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

function buildAutonomyInput(overrides: Partial<Parameters<typeof buildAutonomyDecisionView>[0]> = {}) {
  const decisionView = buildDailyDecisionView(makeInput());
  return {
    decisionView: {
      ...decisionView,
      stabilitySource: "live" as const,
    },
    precedenceOverride: "none",
    actionGateStatus: "ready",
    nextEvaluationAt: "2026-03-07T13:00:00.000Z",
    ...overrides,
  };
}

describe("buildAutonomyDecisionView", () => {
  it("maps no-plan to a setup-first operational summary", () => {
    const decisionView = buildDailyDecisionView(makeInput({ hasPlan: false }));
    const view = buildAutonomyDecisionView({
      decisionView: { ...decisionView, stabilitySource: "live" },
      precedenceOverride: "none",
      actionGateStatus: "ready",
      nextEvaluationAt: null,
    });

    expect(view.operationalStateLabel).toBe("Setup required");
    expect(view.topStatusBadgeLabel).toBe("Setup");
    expect(view.actionNeededBadgeLabel).toBe("Action needed");
  });

  it("maps no-holdings to a build-core operational summary", () => {
    const decisionView = buildDailyDecisionView(makeInput({ hasHoldings: false }));
    const view = buildAutonomyDecisionView({
      decisionView: { ...decisionView, stabilitySource: "live" },
      precedenceOverride: "none",
      actionGateStatus: "ready",
      nextEvaluationAt: null,
    });

    expect(view.operationalStateLabel).toBe("Build core");
    expect(view.statusSentence).toContain("initial holdings");
  });

  it("maps starter warmup to observe/settle semantics", () => {
    const decisionView = buildDailyDecisionView(
      makeInput({
        daily: {
          starterWarmup: { active: true },
          decisionEnvelope: makeEnvelope(),
        },
      }),
    );
    const view = buildAutonomyDecisionView({
      decisionView: { ...decisionView, stabilitySource: "live" },
      precedenceOverride: "none",
      actionGateStatus: "ready",
      nextEvaluationAt: "2026-03-07T13:00:00.000Z",
    });

    expect(view.operationalStateLabel).toBe("Observing");
    expect(view.topStatusBadgeLabel).toBe("Observe");
    expect(view.capitalProtectionExplanation).toContain("starter warmup");
  });

  it("maps fatal fallback to paused/defensive semantics", () => {
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
    const view = buildAutonomyDecisionView({
      decisionView: { ...decisionView, stabilitySource: "live" },
      precedenceOverride: "fallback",
      actionGateStatus: "blocked",
      nextEvaluationAt: "2026-03-07T13:00:00.000Z",
    });

    expect(view.operationalStateLabel).toBe("Paused");
    expect(view.topStatusBadgeLabel).toBe("Paused");
    expect(view.actionNeededBadgeLabel).toBe("Recovery");
  });

  it("maps low-data-quality to repair-quality-first semantics", () => {
    const decisionView = buildDailyDecisionView(
      makeInput({
        topLeak: { key: "pricing_low" },
        topLeakSeverity: "high",
        derived: { diagnostics: { pricing: { coveragePct: 62 } } },
        daily: {
          decisionEnvelope: makeEnvelope({
            blockers: [
              {
                layer: "data_quality",
                code: "pricing_low",
                title: "Data quality blocked",
                detail: "Pricing coverage is below the minimum threshold.",
                severity: "medium",
                status: "block",
                haltsExecution: true,
                reasonCodes: ["pricing_low"],
              },
            ],
            support: {
              precedence: {
                override: "data_quality",
                allowExecution: false,
              },
              snapshots: {
                topLeakKey: "pricing_low",
                topLeakSeverity: "medium",
              },
            },
          }),
        },
      }),
    );
    const view = buildAutonomyDecisionView({
      decisionView: { ...decisionView, stabilitySource: "live" },
      precedenceOverride: "none",
      actionGateStatus: "blocked",
      nextEvaluationAt: "2026-03-07T13:00:00.000Z",
    });

    expect(view.operationalStateLabel).toBe("Repairing data");
    expect(view.topStatusBadgeLabel).toBe("Fix data");
    expect(view.actionNeededBadgeLabel).toBe("Action needed");
  });

  it("maps healthy canonical state to normal live semantics", () => {
    const view = buildAutonomyDecisionView(buildAutonomyInput());

    expect(view.operationalStateLabel).toBe("Advancing");
    expect(view.topStatusBadgeLabel).toBe("On track");
    expect(view.actionNeededBadgeLabel).toBeNull();
    expect(view.capitalProtectionExplanation).toContain("supports measured growth");
  });

  it("surfaces held stability state explicitly", () => {
    const view = buildAutonomyDecisionView(
      buildAutonomyInput({
        decisionView: {
          ...buildDailyDecisionView(makeInput()),
          stabilitySource: "held",
        },
      }),
    );

    expect(view.stabilitySource).toBe("held");
    expect(view.operationalStateLabel).toBe("Stabilizing");
    expect(view.topStatusBadgeLabel).toBe("Stabilizing");
  });
});
