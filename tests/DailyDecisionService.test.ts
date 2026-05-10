import { describe, expect, it } from "vitest";
import { buildDailyDecisionPayload } from "@/lib/decision/DailyDecisionService";
import type { DecisionEnvelopeBranch } from "@/lib/decision/types";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function makeSuccessResponse() {
  return {
    ok: true,
    mode: "investing" as const,
    asOf: "2026-03-07T09:00:00.000Z",
    plan: { id: "plan_1", status: "active" },
    portfolio: {
      cash: 0,
      items: [{ symbol: "AAPL", qty: 10 }],
    },
    daily: {
      engineV4: {
        ok: true,
        engineVersion: "v4-ultra",
        mode: "investing",
        asOf: "2026-03-07T09:00:00.000Z",
        inputHash: "hash-success",
        loopStage: "DAY1_NBA",
        decision: {
          nextBestAction: {
            kind: "DEPLOY_CASH",
            title: "Deploy measured capital",
            desc: "Measured add remains valid.",
            cta: {
              label: "Open Daily execution",
              action: "open_daily_execution",
              href: "/app?tab=daily&mode=investing",
            },
          },
          whyNow: "Measured deployment remains aligned.",
          whatToDo: [],
          guardrails: [],
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
      },
      nextBestAction: {
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
        reasons: ["keep-this-reason"],
        primaryReason: "keep-this-reason",
        intent: "growth_add",
        lifecycleStage: "ACTIVE",
        sessionState: "READY",
        paywallActivationEligible: true,
        asOf: "2026-03-07T08:00:00.000Z",
      },
      capitalStatus: {
        posture: "STABLE",
        planAlignment: "HIGH",
        riskPressure: 31,
        nextEvaluationAt: "2026-03-07T13:00:00.000Z",
      },
      scores: {
        autopilotScore: 81,
        decisionConfidence: 74,
        planCoherence: 88,
        auditNote: "keep-me",
      },
      actionGate: {
        status: "ready",
        allowExecution: true,
        reasons: [],
        nextStep: "Continue with measured execution.",
        topLeakKey: "concentration_med",
        topLeakSeverity: "med",
      },
      whyNow: {
        driverKey: "concentration_med",
        driverTitle: "Concentration requires measured deployment",
        severity: "med",
        rationale: "The current setup allows measured deployment while keeping concentration under control.",
        evidence: ["Top leak: Concentration (MED)"],
        expectedOutcome: "Measured deployment improves alignment without forcing risk.",
        counterfactual: "An oversized entry would increase concentration drift.",
      },
      operationalAction: {
        category: "DEPLOY",
        brokerInstruction: "Deploy a small tranche through the broker workflow.",
        capitalImpact: "Increase exposure gradually.",
        riskImpact: "Raises risk modestly but remains within the current gate.",
        expectedOutcomeWindow: "1-3 sessions",
        extraOperationalField: "keep-me",
      },
      daily_decision: {
        asset: "TSLA",
        decision: "HOLD",
        legacy_action_type: "HOLD",
        confidence: 0.12,
        confidence_pct: 12,
        expected_move: 0.4,
        expected_value: 0.2,
        recommended_position_pct: 2,
        score: 12,
        regime: "risk_off",
        risk_level: "high",
        reason_codes: ["stale_value"],
        extraDecisionField: "keep-me",
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
          regime: "risk_on",
          risk_level: "moderate",
          reason_codes: ["expected_value_positive"],
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
          precedence: [],
          override: null,
          volatility_regime: "medium",
          probabilistic_layer_enabled: true,
        },
      },
      nba: { title: "Deploy measured capital" },
    },
    derived: {
      hasPlan: true,
      hasHoldings: true,
      daily_decision: {
        decision: "HOLD",
      },
      operationalAction: {
        category: "PREPARE",
      },
      diagnostics: {
        hasPlan: true,
        hasHoldings: true,
        holdingsCount: 1,
        totalEur: 1000,
        cashEur: 0,
        cashDragPct: 0,
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
    },
  };
}

function makeFallbackResponse(args: {
  degradedReason: string;
  branchKey: string;
  nbaTitle: string;
  nextActionType: "PAUSE";
  nextInstruction: string;
  nextAction: string;
  nextHref: string;
  nextAsOf: string;
  topLeakKey: string;
  topLeakTitle: string;
  riskPressure: number;
  decisionReasonCode: string;
  operationalCategory: "PROTECT" | "PREPARE";
  derivedHasPlan: boolean;
  derivedHasHoldings: boolean;
}): any {
  return {
    ok: false,
    degraded: true,
    degradedReason: args.degradedReason,
    mode: "investing" as const,
    asOf: "2026-03-07T09:00:00.000Z",
    plan: args.derivedHasPlan ? { id: "plan_1", status: "active" } : null,
    portfolio: { cash: 0, items: [] },
    daily: {
      nextBestAction: {
        type: args.nextActionType,
        instruction: args.nextInstruction,
        summary: `${args.topLeakTitle}.`,
        reason: `${args.topLeakTitle}.`,
        cta: {
          label: args.nbaTitle,
          action: args.nextAction,
          href: args.nextHref,
        },
        source: args.branchKey === "fatal_fallback" ? "fallback" : "engine_v3",
        engineVersion: args.branchKey === "fatal_fallback" ? null : "v3",
        rawAction: args.nextAction,
        reasons: [`${args.branchKey}_existing_reason`],
        asOf: args.nextAsOf,
      },
      capitalStatus: {
        posture: "SURVIVAL",
        planAlignment: "LOW",
        riskPressure: args.riskPressure,
        nextEvaluationAt:
          args.branchKey === "fatal_fallback"
            ? "2026-03-07T10:00:00.000Z"
            : "2026-03-07T13:00:00.000Z",
      },
      scores: {
        autopilotScore: args.branchKey === "holdings_load_fallback" ? 28 : 25,
        decisionConfidence: args.branchKey === "holdings_load_fallback" ? 38 : args.branchKey === "plan_load_fallback" ? 35 : 30,
        planCoherence: args.branchKey === "holdings_load_fallback" ? 20 : 0,
        auditNote: `${args.branchKey}_audit`,
      },
      actionGate: {
        status: "blocked",
        allowExecution: false,
        reasons: [`${args.topLeakTitle}.`],
        nextStep: "Recover setup before executing orders.",
        topLeakKey: args.topLeakKey,
        topLeakSeverity: "high",
      },
      whyNow: {
        driverKey: args.topLeakKey,
        driverTitle: args.topLeakTitle,
        severity: "high",
        rationale: `${args.topLeakTitle} blocks execution.`,
        evidence: [`${args.topLeakTitle}.`],
        expectedOutcome: "Safe recovery.",
        counterfactual: "Unsafe execution would increase risk.",
      },
      operationalAction: {
        category: args.operationalCategory,
        brokerInstruction: "Previous fallback instruction.",
        capitalImpact: "Previous capital impact.",
        riskImpact: "Previous risk impact.",
        expectedOutcomeWindow: "Previous window",
        extraOperationalField: `keep-${args.branchKey}`,
      },
      daily_decision: {
        decision: "HOLD",
        legacy_action_type: "HOLD",
        confidence: 0.11,
        confidence_pct: 11,
        expected_move: 0.1,
        expected_value: 0.05,
        recommended_position_pct: 1,
        score: 11,
        regime: "risk_off",
        risk_level: "high",
        reason_codes: ["stale_value"],
      },
      decisionGovernance: {
        enabled: true,
        top_opportunities: [],
        opportunities: [],
        portfolio_risk: {
          risk_level: "high",
          concentration_warning: false,
          diversification_score: 0,
          concentration_top1_pct: 0,
          concentration_top3_pct: 0,
          volatility_exposure_pct: 0,
          exposure_by_asset_class: {},
          exposure_by_sector: {},
          correlation_clusters: [],
        },
        daily_decision: {
          asset: null,
          decision: "AVOID",
          legacy_action_type: "PAUSE",
          confidence: 0.9,
          confidence_pct: 90,
          expected_move: 0,
          expected_value: 0,
          recommended_position_pct: 0,
          score: 0,
          regime: null,
          risk_level: "high",
          reason_codes: [args.decisionReasonCode],
        },
        decision_confidence: 0.9,
        capital_protection: {
          protection_mode: true,
          recommended_action_bias: "defensive",
          size_multiplier: 0.4,
          restrict_aggressive_entries: true,
          reasons: [args.decisionReasonCode],
        },
        metadata: {
          precedence: [],
          override: "fallback",
          volatility_regime: "high",
          probabilistic_layer_enabled: false,
        },
      },
      nba: { title: args.nbaTitle },
    },
    derived: {
      hasPlan: args.derivedHasPlan,
      hasHoldings: args.derivedHasHoldings,
      daily_decision: {
        decision: "HOLD",
      },
      operationalAction: {
        category: "DEPLOY",
      },
    },
  };
}

describe("buildDailyDecisionPayload", () => {
  it("finalizes success responses without changing the route contract shape", () => {
    const input = makeSuccessResponse();

    const out = buildDailyDecisionPayload({
      response: input,
      branch: "success",
      branchReason: null,
    });

    expect(out.response.ok).toBe(true);
    expect(out.decisionEnvelope.branch).toBe("success");
    expect(out.response.daily.decisionEnvelope).toEqual(out.decisionEnvelope);
    expect(out.response.daily.daily_decision).toMatchObject({
      asset: "AAPL",
      decision: "BUY",
      confidence_pct: 67,
      extraDecisionField: "keep-me",
    });
    expect(out.response.daily.operationalAction).toMatchObject({
      category: "DEPLOY",
      extraOperationalField: "keep-me",
    });
    expect(out.response.derived?.daily_decision).toMatchObject({
      decision: "BUY",
      confidence_pct: 67,
    });
    expect(out.response.derived?.operationalAction).toMatchObject({
      category: "DEPLOY",
    });
    expect(out.response.daily.nextBestAction).toMatchObject({
      type: "ADD",
      reasons: ["keep-this-reason"],
      primaryReason: "keep-this-reason",
      intent: "growth_add",
      asOf: "2026-03-07T08:00:00.000Z",
      nextEvaluationAt: "2026-03-07T13:00:00.000Z",
    });
    expect(out.response.daily.scores).toMatchObject({
      autopilotScore: 81,
      decisionConfidence: 74,
      riskPressure: 31,
      planCoherence: 88,
      auditNote: "keep-me",
    });
    expect((input.daily as any).decisionEnvelope).toBeUndefined();
  });

  it.each([
    {
      branch: "plan_load_fallback" as DecisionEnvelopeBranch,
      branchReason: "Plan query failed.",
      response: makeFallbackResponse({
        degradedReason: "plan_load_failed",
        branchKey: "plan_load_fallback",
        nbaTitle: "Go to Planning",
        nextActionType: "PAUSE",
        nextInstruction: "Pause until planning recovers",
        nextAction: "go_planning",
        nextHref: "/app?tab=planning&mode=investing",
        nextAsOf: "2026-03-07T08:30:00.000Z",
        topLeakKey: "no_plan",
        topLeakTitle: "Plan unavailable",
        riskPressure: 0,
        decisionReasonCode: "plan_load_failed",
        operationalCategory: "PROTECT",
        derivedHasPlan: false,
        derivedHasHoldings: false,
      }),
      expectedNextEvaluationAt: "2026-03-07T13:00:00.000Z",
      expectedOperationalCategory: "PROTECT",
    },
    {
      branch: "holdings_load_fallback" as DecisionEnvelopeBranch,
      branchReason: "Holdings query failed.",
      response: makeFallbackResponse({
        degradedReason: "holdings_load_failed",
        branchKey: "holdings_load_fallback",
        nbaTitle: "Go to Portfolio",
        nextActionType: "PAUSE",
        nextInstruction: "Pause until holdings recover",
        nextAction: "go_portfolio",
        nextHref: "/app?tab=portfolio&mode=investing",
        nextAsOf: "2026-03-07T08:35:00.000Z",
        topLeakKey: "no_holdings",
        topLeakTitle: "Holdings unavailable",
        riskPressure: 0,
        decisionReasonCode: "holdings_load_failed",
        operationalCategory: "PROTECT",
        derivedHasPlan: true,
        derivedHasHoldings: false,
      }),
      expectedNextEvaluationAt: "2026-03-07T13:00:00.000Z",
      expectedOperationalCategory: "PROTECT",
    },
    {
      branch: "fatal_fallback" as DecisionEnvelopeBranch,
      branchReason: "Unexpected daily bundle error",
      response: makeFallbackResponse({
        degradedReason: "daily_bundle_fallback",
        branchKey: "fatal_fallback",
        nbaTitle: "Refresh Daily",
        nextActionType: "PAUSE",
        nextInstruction: "Pause until the daily bundle recovers",
        nextAction: "refresh_daily",
        nextHref: "/app?tab=daily&mode=investing",
        nextAsOf: "2026-03-07T08:40:00.000Z",
        topLeakKey: "daily_bundle_fallback",
        topLeakTitle: "Temporary backend issue",
        riskPressure: 100,
        decisionReasonCode: "daily_bundle_fallback",
        operationalCategory: "PROTECT",
        derivedHasPlan: false,
        derivedHasHoldings: false,
      }),
      expectedNextEvaluationAt: "2026-03-07T10:00:00.000Z",
      expectedOperationalCategory: "PROTECT",
    },
  ])("finalizes $branch responses branch-safely", ({ branch, branchReason, response, expectedNextEvaluationAt, expectedOperationalCategory }) => {
    const input = clone(response);

    const out = buildDailyDecisionPayload({
      response: input,
      branch,
      branchReason,
    });

    expect(out.response.degraded).toBe(true);
    expect(out.decisionEnvelope.branch).toBe(branch);
    expect(out.response.daily.decisionEnvelope).toEqual(out.decisionEnvelope);
    expect(out.response.daily.daily_decision).toMatchObject({
      decision: "AVOID",
      legacy_action_type: "PAUSE",
      confidence_pct: 90,
    });
    expect(out.response.daily.operationalAction).toMatchObject({
      category: expectedOperationalCategory,
      extraOperationalField: `keep-${branch}`,
    });
    expect(out.response.derived?.daily_decision).toMatchObject({
      decision: "AVOID",
      confidence_pct: 90,
    });
    expect(out.response.derived?.operationalAction).toMatchObject({
      category: expectedOperationalCategory,
    });
    expect(out.response.daily.nextBestAction).toMatchObject({
      type: "PAUSE",
      reasons: [`${branch}_existing_reason`],
      nextEvaluationAt: expectedNextEvaluationAt,
    });
    expect(out.response.daily.scores).toMatchObject({
      auditNote: `${branch}_audit`,
    });
    expect(out.response.daily.decisionEnvelope.support.precedence.override).toBe("fallback");
  });
});
