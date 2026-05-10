import { describe, expect, it } from "vitest";
import { composeDecisionEnvelope } from "@/lib/decision/composeDecisionEnvelope";
import type { ComposeDecisionEnvelopeInput } from "@/lib/decision/composeDecisionEnvelope";
import type { DeepPartial } from "./helpers/deepPartial";
import { mergeDeep } from "./helpers/mergeDeep";

function makeInput(overrides: DeepPartial<ComposeDecisionEnvelopeInput> = {}): ComposeDecisionEnvelopeInput {
  const base: ComposeDecisionEnvelopeInput = {
    mode: "investing",
    asOf: "2026-03-07T09:00:00.000Z",
    branch: "success",
    branchReason: null,
    nextBestAction: {
      type: "ADD",
      instruction: "Deploy measured capital",
      summary: "Deploy only a measured tranche inside the active plan.",
      reason: "Syntrake selected a measured add based on current plan alignment.",
      cta: {
        label: "Open Daily execution",
        action: "open_daily_execution",
        href: "/app?tab=daily&mode=investing",
      },
      source: "engine_v4",
      engineVersion: "v4-ultra",
      rawAction: "open_daily_execution",
    },
    whyNow: {
      driverKey: "concentration_med",
      driverTitle: "Concentration requires measured deployment",
      severity: "med",
      rationale: "The current setup allows measured deployment while keeping concentration under control.",
      evidence: ["Top leak: Concentration (MED)", "Decision pressure: 31/100"],
      expectedOutcome: "Measured deployment improves alignment without forcing risk.",
      counterfactual: "An oversized entry would increase concentration drift.",
    },
    operationalAction: {
      category: "DEPLOY",
      brokerInstruction: "Deploy a small tranche through the broker workflow.",
      capitalImpact: "Increase exposure gradually.",
      riskImpact: "Raises risk modestly but remains within the current gate.",
      expectedOutcomeWindow: "1-3 sessions",
    },
    decisionGovernance: {
      enabled: true,
      top_opportunities: [],
      opportunities: [],
      portfolio_risk: {
        risk_level: "moderate",
        concentration_warning: false,
        diversification_score: 72,
        concentration_top1_pct: 18,
        concentration_top3_pct: 44,
        volatility_exposure_pct: 32,
        exposure_by_asset_class: {},
        exposure_by_sector: {},
        correlation_clusters: [],
      },
      daily_decision: {
        asset: "AAPL",
        decision: "BUY",
        legacy_action_type: "ADD",
        confidence: 0.67,
        confidence_pct: 67,
        expected_move: 3.4,
        expected_value: 1.6,
        recommended_position_pct: 9,
        score: 81,
        regime: "trend",
        risk_level: "moderate",
        reason_codes: ["expected_value_positive", "prob_up_high"],
      },
      decision_confidence: 0.67,
      capital_protection: {
        protection_mode: false,
        recommended_action_bias: "neutral",
        size_multiplier: 1,
        position_size_multiplier: 1,
        restrict_aggressive_entries: false,
        reasons: [],
      },
      metadata: {
        precedence: [
          "RiskPolicy hard-stop",
          "ActionGate hard-stop",
          "CapitalProtection bias",
          "Probability and opportunity ranking",
        ],
        override: null,
        volatility_regime: "medium",
        probabilistic_layer_enabled: true,
      },
    },
    actionGate: {
      status: "ready",
      allowExecution: true,
      reasons: [],
      nextStep: "Continue with measured execution.",
      topLeakKey: "concentration_med",
      topLeakSeverity: "med",
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
        top3Pct: 44,
        drawdownPct: -3,
        exposurePct: 72,
        coveragePct: 96,
        pressureScore: 31,
        missingSymbols: 0,
        topLeakSeverity: "med",
      },
    },
    capitalStatus: {
      posture: "STABLE",
      planAlignment: "HIGH",
      riskPressure: 31,
      nextEvaluationAt: "2026-03-07T13:00:00.000Z",
    },
    decisionScores: {
      autopilotScore: 81,
      decisionConfidence: 74,
      riskPressure: 31,
      planCoherence: 88,
    },
    diagnostics: {
      hasPlan: true,
      hasHoldings: true,
      holdingsCount: 3,
      totalEur: 12000,
      cashEur: 1200,
      cashDragPct: 10,
      concentrationTop1Pct: 18,
      concentrationTop3Pct: 44,
      pricing: {
        coveragePct: 96,
        missingSymbols: [],
        priceAgeSeconds: 120,
      },
      changed: {
        totalEurDelta: 0,
        cashEurDelta: 0,
        holdingsCountDelta: 0,
        coveragePctDelta: 0,
      },
      riskLeaks: [
        {
          key: "concentration_med",
          severity: "med",
          title: "Concentration elevated",
          detail: "Top position remains above preferred concentration.",
        },
      ],
    },
    engineV4: {
      ok: true,
      engineVersion: "v4-ultra",
      mode: "investing",
      asOf: "2026-03-07T09:00:00.000Z",
      inputHash: "hash-123",
      loopStage: "DAY1_NBA",
      decision: {
        nextBestAction: {
          kind: "DEPLOY_CASH",
          title: "Deploy measured capital",
          desc: "Measured add remains the best path.",
          cta: {
            label: "Open Daily execution",
            action: "open_daily_execution",
            href: "/app?tab=daily&mode=investing",
          },
        },
        whyNow: "Measured deployment remains aligned with the active plan.",
        whatToDo: ["Deploy a small tranche", "Capture proof", "Review again later"],
        guardrails: [],
        opportunities: [],
        riskLeaks: [],
        priorityClass: "GROWTH",
        aggression: "NORMAL",
        confidence: 0.64,
      },
      scores: {
        autopilotScore: 79,
        proofQualityScore: 82,
        dataQualityScore: 93,
        reliabilityScore: 88,
        confidenceScore: 64,
      },
      proof: {
        lastProofQuality: 78,
        proofRequiredToday: true,
        proofStatus: "good",
        requirements: [],
        confirmedMoneyEur: 500,
      },
      reliability: {
        executionRate7d: 0.86,
        closeDayRate7d: 0.71,
        dataCoveragePct: 96,
      },
      portfolio: {
        holdingsCount: 3,
        cashEur: 1200,
        totalValueEur: 12000,
        coveragePct: 96,
      },
      plan: {
        hasPlan: true,
        status: "active",
        goal: "growth",
        targetEur: 50000,
        monthlyContributionEur: 500,
        horizonMonths: 60,
      },
      trace: [],
      decisionTrace: {
        version: "v4",
        chosen: {
          kind: "DEPLOY_CASH",
          title: "Deploy measured capital",
          desc: "Measured add remains the best path.",
          cta: {
            label: "Open Daily execution",
            action: "open_daily_execution",
            href: "/app?tab=daily&mode=investing",
          },
        },
        rankedTop: [
          {
            action: {
              kind: "DEPLOY_CASH",
              title: "Deploy cash within your active plan",
              reason: ["Measured deployment remains aligned with the active plan."],
            },
            score: 100,
          },
        ],
        blockers: [],
        reasons: [
          "Measured deployment remains aligned with the active plan.",
          "Priority class: GROWTH.",
          "Data coverage: 96%.",
          "Confidence: 64%.",
        ],
        stateSnapshot: {
          mode: "investing",
          cashPct: 10,
          exposurePct: 90,
          holdingsPresent: true,
          brokerExecutionPending: true,
          dailyClosed: false,
          loopStage: "DAY1_NBA",
          priorityClass: "GROWTH",
          aggression: "NORMAL",
          dataQualityStatus: "good",
          dataCoveragePct: 96,
          topRiskLeakSeverity: null,
        },
        inputHash: "hash-123",
      },
      fallbackUsed: false,
    },
  };

  return mergeDeep(base, overrides);
}

describe("composeDecisionEnvelope", () => {
  it("maps current success-path engine outputs into a canonical envelope", () => {
    const envelope = composeDecisionEnvelope(makeInput());

    expect(envelope.branch).toBe("success");
    expect(envelope.workflowDecision).toMatchObject({
      type: "ADD",
      instruction: "Deploy measured capital",
      source: "engine_v4",
      engineVersion: "v4-ultra",
      nextEvaluationAt: "2026-03-07T13:00:00.000Z",
      loopStage: "DAY1_NBA",
      priorityClass: "GROWTH",
      aggression: "NORMAL",
    });
    expect(envelope.portfolioStance).toMatchObject({
      asset: "AAPL",
      decision: "BUY",
      legacyActionType: "ADD",
      confidencePct: 67,
      source: "decision_governance",
    });
    expect(envelope.executionInstruction).toMatchObject({
      category: "DEPLOY",
      allowExecution: true,
      source: "daily_enhancements",
      derivedFromWorkflowType: "ADD",
    });
    expect(envelope.why).toMatchObject({
      headline: "Concentration requires measured deployment",
      rationale: "The current setup allows measured deployment while keeping concentration under control.",
      expectedOutcome: "Measured deployment improves alignment without forcing risk.",
      counterfactual: "An oversized entry would increase concentration drift.",
    });
    expect(envelope.scores).toMatchObject({
      autopilotScore: 81,
      decisionConfidencePct: 74,
      riskPressure: 31,
      planCoherence: 88,
      workflowConfidencePct: 64,
      portfolioConfidencePct: 67,
      dataQualityScore: 93,
      proofQualityScore: 82,
      reliabilityScore: 88,
    });
    expect(envelope.support).toMatchObject({
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
    });
    expect(envelope.blockers).toEqual([]);
  });

  it("reflects risk policy precedence without mutating the canonical structure", () => {
    const envelope = composeDecisionEnvelope(
      makeInput({
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
            drawdownPct: -6,
            exposurePct: 80,
            coveragePct: 96,
            pressureScore: 62,
            missingSymbols: 0,
            topLeakSeverity: "high",
          },
        },
      }),
    );

    expect(envelope.support.precedence.override).toBe("risk_policy");
    expect(envelope.support.precedence.allowExecution).toBe(false);
    expect(envelope.executionInstruction.allowExecution).toBe(false);
    expect(envelope.blockers[0]).toMatchObject({
      layer: "risk_policy",
      status: "block",
      haltsExecution: true,
    });
  });

  it("elevates low data quality into canonical precedence", () => {
    const base = makeInput();
    const envelope = composeDecisionEnvelope(
      makeInput({
        actionGate: {
          ...base.actionGate!,
          status: "ready",
          allowExecution: true,
        },
        diagnostics: {
          ...(base.diagnostics as NonNullable<typeof base.diagnostics>),
          pricing: {
            coveragePct: 62,
            missingSymbols: ["AAPL"],
            priceAgeSeconds: 3600,
          },
          riskLeaks: [
            {
              key: "pricing_low",
              severity: "high",
              title: "Pricing coverage weak",
              detail: "Coverage is too low for safe execution.",
            },
          ],
        },
      }),
    );

    expect(envelope.support.precedence.override).toBe("data_quality");
    expect(envelope.support.precedence.allowExecution).toBe(false);
    expect(envelope.executionInstruction.allowExecution).toBe(false);
    expect(envelope.blockers.some((blocker) => blocker.layer === "data_quality")).toBe(true);
  });

  it("normalizes invalid portfolio stance values deterministically", () => {
    const base = makeInput();
    const envelope = composeDecisionEnvelope(
      makeInput({
        decisionGovernance: {
          ...base.decisionGovernance!,
          daily_decision: {
            ...base.decisionGovernance!.daily_decision,
            decision: "UNEXPECTED" as any,
            legacy_action_type: "UNEXPECTED" as any,
          },
        },
      }),
    );

    expect(envelope.portfolioStance.decision).toBe("HOLD");
    expect(envelope.portfolioStance.legacyActionType).toBe("HOLD");
  });

  it("represents fatal fallback branches with deterministic fallback composition", () => {
    const envelope = composeDecisionEnvelope(
      makeInput({
        branch: "fatal_fallback",
        branchReason: "Unexpected fatal error while assembling the daily bundle.",
        nextBestAction: null,
        whyNow: null,
        operationalAction: null,
        decisionGovernance: null,
        actionGate: null,
        riskPolicyEval: null,
        capitalStatus: {
          posture: null,
          planAlignment: null,
          riskPressure: null,
          nextEvaluationAt: null,
        },
        decisionScores: {
          autopilotScore: null,
          decisionConfidence: null,
          riskPressure: null,
          planCoherence: null,
        },
        diagnostics: null,
        engineV4: null,
      }),
    );

    expect(envelope.branch).toBe("fatal_fallback");
    expect(envelope.workflowDecision).toMatchObject({
      type: "PAUSE",
      source: "fallback",
    });
    expect(envelope.portfolioStance).toMatchObject({
      decision: "HOLD",
      source: "synthetic",
    });
    expect(envelope.executionInstruction).toMatchObject({
      category: "PREPARE",
      allowExecution: false,
      source: "fallback",
    });
    expect(envelope.support).toMatchObject({
      branchReason: "Unexpected fatal error while assembling the daily bundle.",
      precedence: {
        override: "fallback",
        allowExecution: false,
      },
    });
    expect(envelope.blockers[0]).toMatchObject({
      layer: "fallback",
      code: "fatal_fallback",
      severity: "high",
      status: "block",
    });
  });
});
