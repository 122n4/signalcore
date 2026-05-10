import { describe, expect, it } from "vitest";
import { attachDecisionEnvelopeToDailyBundle } from "@/lib/decision/adapters/toLegacyDailyBundle";
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
      summary: "Deploy a measured tranche.",
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

describe("attachDecisionEnvelopeToDailyBundle", () => {
  it("adds only daily.decisionEnvelope and preserves other nodes", () => {
    const nestedDailyNode = { foo: "bar" };
    const derivedNode = { pressure: 31 };
    const response = {
      ok: true,
      mode: "investing",
      daily: {
        nba: { title: "Deploy measured capital" },
        nested: nestedDailyNode,
      },
      derived: derivedNode,
    };
    const envelope = makeEnvelope();

    const out = attachDecisionEnvelopeToDailyBundle({ response, envelope });

    expect(out).toMatchObject({
      ok: true,
      mode: "investing",
      derived: { pressure: 31 },
      daily: {
        nba: { title: "Deploy measured capital" },
        nested: { foo: "bar" },
        decisionEnvelope: envelope,
      },
    });
    expect(out).not.toBe(response);
    expect(out.daily).not.toBe(response.daily);
    expect(out.derived).toBe(response.derived);
    expect((out.daily as any).nested).toBe(nestedDailyNode);
    expect((response.daily as any).decisionEnvelope).toBeUndefined();
  });

  it("is deterministic for the same response and envelope", () => {
    const response = {
      ok: true,
      daily: {
        scores: {
          autopilotScore: 81,
        },
      },
      derived: {
        pressure: 31,
      },
    };
    const envelope = makeEnvelope();

    const a = attachDecisionEnvelopeToDailyBundle({ response, envelope });
    const b = attachDecisionEnvelopeToDailyBundle({ response, envelope });

    expect(a).toStrictEqual(b);
  });
});
