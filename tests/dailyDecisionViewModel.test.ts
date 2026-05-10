import { describe, expect, it } from "vitest";
import {
  buildDailyDecisionCtaOverride,
  buildDailyDecisionView,
  buildDailyHeroSemantics,
  buildDailySecondarySemantics,
  normalizeDailyFixKey,
  type BuildDailyDecisionViewInput,
} from "@/app/app/tabs/dailyDecisionViewModel";
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

describe("buildDailyDecisionView", () => {
  it("prioritizes no-plan setup override before any other state", () => {
    const view = buildDailyDecisionView(
      makeInput({
        hasPlan: false,
        daily: {
          decisionEnvelope: makeEnvelope({
            branch: "fatal_fallback",
            support: {
              precedence: {
                override: "fallback",
                allowExecution: false,
              },
            },
          }),
        },
      }),
    );

    expect(view.source).toBe("setup_override");
    expect(view.action).toBe("HOLD");
    expect(view.stateReason).toBe("no_plan");
    expect(view.blockerState).toBe("setup");
  });

  it("prioritizes no-holdings setup override and keeps investing guardrails", () => {
    const view = buildDailyDecisionView(
      makeInput({
        hasHoldings: false,
      }),
    );

    expect(view.source).toBe("setup_override");
    expect(view.action).toBe("BUY");
    expect(view.headline).toBe("BUY CORE: start allocation");
    expect(view.allowExecution).toBe(false);
    expect(view.guardrails).toEqual({
      maxNewRiskPct: 4,
      maxSinglePositionPct: 8,
      stopLossHint: "Prefer gradual entries in 2-4 tranches.",
    });
  });

  it("forces defensive paused behavior for fatal fallback once setup is complete", () => {
    const view = buildDailyDecisionView(
      makeInput({
        daily: {
          decisionEnvelope: makeEnvelope({
            branch: "fatal_fallback",
            support: {
              branchReason: "backend failure",
              precedence: {
                override: "fallback",
                allowExecution: false,
              },
            },
            executionInstruction: {
              allowExecution: false,
            },
          }),
        },
      }),
    );

    expect(view.source).toBe("blocked_override");
    expect(view.executionTempo).toBe("defensive");
    expect(view.allowExecution).toBe(false);
    expect(view.stateReason).toBe("fatal_fallback");
    expect(view.blockerState).toBe("fallback");
  });

  it("prioritizes low data quality over canonical growth mapping", () => {
    const view = buildDailyDecisionView(
      makeInput({
        topLeak: {
          key: "pricing_low",
        },
        topLeakSeverity: "high",
        derived: {
          diagnostics: {
            pricing: {
              coveragePct: 62,
            },
          },
        },
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

    expect(view.source).toBe("blocked_override");
    expect(view.action).toBe("HOLD");
    expect(view.headline).toBe("HOLD: fix data quality first");
    expect(view.allowExecution).toBe(false);
    expect(view.stateReason).toBe("low_data_quality");
    expect(view.blockerState).toBe("risk_blocked");
  });

  it("maps canonical envelope fields for healthy success states", () => {
    const view = buildDailyDecisionView(makeInput());

    expect(view.source).toBe("decision_envelope");
    expect(view.branch).toBe("success");
    expect(view.action).toBe("BUY");
    expect(view.headline).toBe("Measured deployment remains valid");
    expect(view.rationale).toBe("The active plan supports measured deployment.");
    expect(view.confidencePct).toBe(74);
    expect(view.executionTempo).toBe("normal");
    expect(view.allowExecution).toBe(true);
    expect(view.nextReviewAt).toBe("2026-03-07T13:00:00.000Z");
  });

  it("falls back to legacy computeDirective when the envelope is missing", () => {
    const view = buildDailyDecisionView(
      makeInput({
        daily: {},
        topLeakSeverity: "high",
        opportunitiesCount: 0,
      }),
    );

    expect(view.source).toBe("legacy_fallback");
    expect(view.stateReason).toBe("legacy_fallback");
    expect(view.action).toBe("SELL");
  });

  it("builds a portfolio quality-fix CTA override for low data quality states", () => {
    const decisionView = buildDailyDecisionView(
      makeInput({
        topLeak: {
          key: "pricing_low",
        },
        topLeakSeverity: "high",
        derived: {
          diagnostics: {
            pricing: {
              coveragePct: 62,
            },
          },
        },
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
            },
          }),
        },
      }),
    );

    const cta = buildDailyDecisionCtaOverride({
      mode: "investing",
      decisionView,
      hasPlan: true,
      hasHoldings: true,
      topLeakKey: "pricing_low",
    });

    expect(cta).toEqual({
      label: "Fix Data Quality",
      href: "/app?tab=portfolio&mode=investing&fixNow=1&fixKey=pricing_low&fixFrom=daily",
      reason: "low_data_quality",
    });
  });

  it("normalizes non-data leak keys to pricing_low", () => {
    expect(normalizeDailyFixKey("concentration_med")).toBe("pricing_low");
    expect(normalizeDailyFixKey("valuation_zero")).toBe("valuation_zero");
    expect(normalizeDailyFixKey("pricing_stale_high")).toBe("pricing_stale_high");
  });
});

describe("buildDailyHeroSemantics", () => {
  it("keeps warmup hero semantics dominant over remediation and growth framing", () => {
    const semantics = buildDailyHeroSemantics({
      decisionView: buildDailyDecisionView(
        makeInput({
          daily: {
            starterWarmup: {
              active: true,
            },
            decisionEnvelope: makeEnvelope(),
          },
        }),
      ),
      hasPlan: true,
      hasHoldings: true,
      starterWarmupActive: true,
      hasDisplayTopLeak: true,
      displayTopLeakSeverity: "high",
      canClose: false,
      nextReviewLabel: "5h",
      primaryDesc: "Primary CTA detail",
    });

    expect(semantics).toMatchObject({
      directiveDisplay: "OBSERVE",
      postureLabel: "Observe",
      gateLabel: "Warmup active",
      expectedImpactLabel: "Build & Observe",
      portfolioImpactLabel: "Portfolio Impact: Let starter positions settle",
      recommendedExposureLabel: "Measured",
      titleTone: "blue",
    });
    expect(semantics.dashboardChips).toContain("Starter Warmup");
  });

  it("keeps low-data hero semantics defensive and repair-first", () => {
    const semantics = buildDailyHeroSemantics({
      decisionView: buildDailyDecisionView(
        makeInput({
          topLeak: {
            key: "pricing_low",
          },
          topLeakSeverity: "high",
          derived: {
            diagnostics: {
              pricing: {
                coveragePct: 62,
              },
            },
          },
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
              },
            }),
          },
        }),
      ),
      hasPlan: true,
      hasHoldings: true,
      starterWarmupActive: false,
      hasDisplayTopLeak: true,
      displayTopLeakSeverity: "high",
      canClose: false,
      nextReviewLabel: "Soon",
      primaryDesc: "Repair data quality",
    });

    expect(semantics.directiveDisplay).toBe("FIX DATA");
    expect(semantics.gateLabel).toBe("Data quality");
    expect(semantics.expectedImpactLabel).toBe("Repair Data Quality");
    expect(semantics.portfolioImpactLabel).toBe("Portfolio Impact: Fix portfolio data before acting");
  });
});

describe("buildDailySecondarySemantics", () => {
  it("keeps balanced secondary semantics centered on the base path", () => {
    const secondary = buildDailySecondarySemantics({
      decisionView: buildDailyDecisionView(makeInput()),
      hasPlan: true,
      hasHoldings: true,
      starterWarmupActive: false,
      coveragePct: 96,
      setupScore: 86,
      pressureGauge: 31,
      autopilotScore: 81,
      growthScore: 58,
    });

    expect(secondary.scenarioNote).toContain("Balanced continuation");
    expect(secondary.dashboardSummary).toBe("The active plan supports measured deployment.");
    expect(secondary.marketItems.find((item) => item.name === "Trend")).toMatchObject({
      label: "Positive",
    });
    expect(secondary.scenarioItems.find((item) => item.name === "Base")?.tone).toBe("green");
  });
});
