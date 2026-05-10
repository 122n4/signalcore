import { describe, expect, it } from "vitest";
import {
  projectLegacyDailyDecision,
  projectLegacyDecisionFields,
  projectLegacyNextBestAction,
  projectLegacyOperationalAction,
  projectLegacyScores,
} from "@/lib/decision/projectors/toLegacyDecisionFields";
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

describe("legacy decision field projectors", () => {
  it("projects daily_decision from the envelope and preserves unknown extras", () => {
    const current = {
      confidence: 0.1,
      confidence_pct: 10,
      legacy_only: "keep-me",
    };

    const out = projectLegacyDailyDecision({
      envelope: makeEnvelope(),
      current,
    });

    expect(out).toMatchObject({
      asset: "AAPL",
      decision: "BUY",
      legacy_action_type: "ADD",
      confidence: 0.67,
      confidence_pct: 67,
      expected_move: 3.4,
      expected_value: 1.6,
      recommended_position_pct: 9,
      score: 81,
      regime: "risk_on",
      risk_level: "moderate",
      reason_codes: ["expected_value_positive"],
      legacy_only: "keep-me",
    });
    expect(current).toEqual({
      confidence: 0.1,
      confidence_pct: 10,
      legacy_only: "keep-me",
    });
  });

  it("projects operationalAction from the envelope without mutating the current node", () => {
    const current = {
      category: "PREPARE",
      brokerInstruction: "Old instruction",
      capitalImpact: "Old capital impact",
      riskImpact: "Old risk impact",
      expectedOutcomeWindow: "Old window",
      extra: "keep-me",
    };

    const out = projectLegacyOperationalAction({
      envelope: makeEnvelope(),
      current,
    });

    expect(out).toMatchObject({
      category: "DEPLOY",
      brokerInstruction: "Deploy a small tranche through the broker workflow.",
      capitalImpact: "Increase exposure gradually.",
      riskImpact: "Raises risk modestly but remains controlled.",
      expectedOutcomeWindow: "1-3 sessions",
      extra: "keep-me",
    });
    expect(current.category).toBe("PREPARE");
  });

  it("hybrid-projects nextBestAction while preserving legacy route extras", () => {
    const current = {
      type: "HOLD",
      instruction: "Wait",
      summary: "Old summary",
      reason: "Old reason",
      reasons: ["old reason", "fallback"],
      primaryReason: "old reason",
      intent: "protect_capital",
      lifecycleStage: "ACTIVE",
      sessionState: "LOCKED",
      paywallActivationEligible: true,
      asOf: "2026-03-07T08:00:00.000Z",
      cta: {
        label: "Old CTA",
        action: "old_action",
        href: "/old",
      },
    };

    const out = projectLegacyNextBestAction({
      envelope: makeEnvelope(),
      current,
    });

    expect(out).toMatchObject({
      type: "ADD",
      instruction: "Deploy measured capital",
      summary: "Deploy a measured tranche inside the active plan.",
      reason: "Measured deployment fits the active plan.",
      source: "engine_v4",
      engineVersion: "v4-ultra",
      rawAction: "open_daily_execution",
      nextEvaluationAt: "2026-03-07T13:00:00.000Z",
      asOf: "2026-03-07T08:00:00.000Z",
      cta: {
        label: "Open Daily execution",
        action: "open_daily_execution",
        href: "/app?tab=daily&mode=investing",
      },
      reasons: ["old reason", "fallback"],
      primaryReason: "old reason",
      intent: "protect_capital",
      lifecycleStage: "ACTIVE",
      sessionState: "LOCKED",
      paywallActivationEligible: true,
    });
    expect(current.type).toBe("HOLD");
  });

  it("conservatively merges scores by overriding canonical numeric fields only", () => {
    const envelope = makeEnvelope({
      scores: {
        autopilotScore: 81,
        decisionConfidencePct: 74,
        riskPressure: 31,
        planCoherence: null,
        workflowConfidencePct: 64,
        portfolioConfidencePct: 67,
        dataQualityScore: 93,
        proofQualityScore: 82,
        reliabilityScore: 88,
      },
    });
    const current = {
      autopilotScore: 10,
      decisionConfidence: 11,
      riskPressure: 12,
      planCoherence: 13,
      confidenceBand: "B",
      auditNote: "keep-me",
    };

    const out = projectLegacyScores({
      envelope,
      current,
    });

    expect(out).toEqual({
      autopilotScore: 81,
      decisionConfidence: 74,
      riskPressure: 31,
      planCoherence: 13,
      confidenceBand: "B",
      auditNote: "keep-me",
    });
    expect(current.autopilotScore).toBe(10);
  });

  it("projects daily and derived mirrors for success-shaped inputs without touching nextBestAction or scores by default", () => {
    const daily = {
      daily_decision: { decision: "HOLD", extraDecisionField: "keep" },
      operationalAction: { category: "PREPARE", extraOperationalField: "keep" },
      nextBestAction: { type: "HOLD", keep: true },
      scores: { autopilotScore: 10, keep: true },
    };
    const derived = {
      daily_decision: { decision: "HOLD" },
      operationalAction: { category: "PREPARE" },
      keep: true,
    };

    const out = projectLegacyDecisionFields({
      envelope: makeEnvelope(),
      daily,
      derived,
    });

    expect(out.daily.daily_decision).toMatchObject({
      decision: "BUY",
      extraDecisionField: "keep",
    });
    expect(out.daily.operationalAction).toMatchObject({
      category: "DEPLOY",
      extraOperationalField: "keep",
    });
    expect(out.daily.nextBestAction).toEqual({ type: "HOLD", keep: true });
    expect(out.daily.scores).toEqual({ autopilotScore: 10, keep: true });
    expect(out.derived).toMatchObject({
      daily_decision: {
        decision: "BUY",
      },
      operationalAction: {
        category: "DEPLOY",
      },
      keep: true,
    });
    expect(daily.daily_decision).toEqual({ decision: "HOLD", extraDecisionField: "keep" });
    expect(derived.operationalAction).toEqual({ category: "PREPARE" });
  });

  it("projects fallback-shaped inputs deterministically when nextBestAction and scores are enabled", () => {
    const envelope = makeEnvelope({
      branch: "fatal_fallback",
      workflowDecision: {
        type: "PAUSE",
        instruction: "Pause until the daily bundle recovers",
        summary: "Fallback branch active.",
        reason: "Fallback branch active.",
        cta: {
          label: "Refresh Daily",
          action: "refresh_daily",
          href: "/app?tab=daily&mode=investing",
        },
        source: "fallback",
        engineVersion: null,
        rawAction: "refresh_daily",
        nextEvaluationAt: "2026-03-07T10:00:00.000Z",
        loopStage: null,
        priorityClass: null,
        aggression: null,
      },
      portfolioStance: {
        asset: null,
        decision: "AVOID",
        legacyActionType: "PAUSE",
        confidencePct: 90,
        expectedMovePct: 0,
        expectedValue: 0,
        recommendedPositionPct: 0,
        score: 0,
        regime: null,
        riskLevel: "high",
        reasonCodes: ["daily_bundle_fallback"],
        source: "fallback",
      },
      executionInstruction: {
        category: "PREPARE",
        brokerInstruction: "Do not execute new capital changes until the blocking conditions clear.",
        capitalImpact: "Capital deployment blocked.",
        riskImpact: "Risk escalation is prevented.",
        expectedOutcomeWindow: "Next evaluation window",
        allowExecution: false,
        source: "fallback",
        derivedFromWorkflowType: null,
      },
      scores: {
        autopilotScore: 25,
        decisionConfidencePct: 30,
        riskPressure: 100,
        planCoherence: 0,
        workflowConfidencePct: null,
        portfolioConfidencePct: 90,
        dataQualityScore: null,
        proofQualityScore: null,
        reliabilityScore: null,
      },
    });

    const out = projectLegacyDecisionFields({
      envelope,
      daily: {
        nextBestAction: {
          reasons: ["temporary backend issue"],
          asOf: "2026-03-07T09:00:00.000Z",
        },
        scores: {
          auditNote: "preserve-me",
        },
      },
      derived: {
        keep: "yes",
      },
      includeNextBestAction: true,
      includeScores: true,
    });

    expect(out.daily.daily_decision).toMatchObject({
      decision: "AVOID",
      legacy_action_type: "PAUSE",
      confidence_pct: 90,
    });
    expect(out.daily.operationalAction).toMatchObject({
      category: "PREPARE",
      brokerInstruction: "Do not execute new capital changes until the blocking conditions clear.",
    });
    expect(out.daily.nextBestAction).toMatchObject({
      type: "PAUSE",
      instruction: "Pause until the daily bundle recovers",
      source: "fallback",
      reasons: ["temporary backend issue"],
    });
    expect(out.daily.scores).toMatchObject({
      autopilotScore: 25,
      decisionConfidence: 30,
      riskPressure: 100,
      planCoherence: 0,
      auditNote: "preserve-me",
    });
    expect(out.derived).toMatchObject({
      daily_decision: {
        decision: "AVOID",
      },
      operationalAction: {
        category: "PREPARE",
      },
      keep: "yes",
    });
  });
});
