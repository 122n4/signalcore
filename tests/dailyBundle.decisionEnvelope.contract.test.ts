import { describe, expect, it } from "vitest";
import { attachDecisionEnvelopeToDailyBundleRouteResponse } from "@/app/api/daily-bundle/route";
import { createTradingLiveDecisionInput } from "./helpers/tradingLiveDecisionFixtures";

function makeDecisionImpact() {
  return {
    confirmedMoneyEur: {
      today: 25,
      week: 140,
      total: 320,
    },
    baseline: {
      type: "mode_benchmark_v1" as const,
      window: "30d" as const,
      returnPct: 2.4,
      portfolioReturnPct: 4.1,
      alphaPct: 1.7,
    },
    attributionConfidence: {
      level: "medium" as const,
      score: 61,
      reasons: ["moderate_tracking_window", "acceptable_pricing_coverage"],
    },
    narrative: {
      headline: "Current edge is above the passive baseline.",
      detail: "Recent return is ahead of the passive benchmark, but attribution still needs more tracked evidence.",
    },
    segments: {
      byStateReason: [],
      byAction: [],
    },
  };
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
      quotes: { AAPL: { price: 100 } },
      valuation: { totalEur: 1000 },
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
          holdingsCount: 1,
          cashEur: 0,
          totalValueEur: 1000,
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
        fallbackUsed: false,
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
        reasons: ["existing route reason", "keep me"],
        primaryReason: "existing route reason",
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
      decisionImpact: makeDecisionImpact(),
    },
  };
}

function makePlanFallbackResponse() {
  return {
    ok: false,
    degraded: true,
    degradedReason: "plan_load_failed",
    mode: "investing" as const,
    asOf: "2026-03-07T09:00:00.000Z",
    plan: null,
    portfolio: { cash: 0, items: [] },
    daily: {
      nextBestAction: {
        type: "PAUSE",
        instruction: "Pause until planning recovers",
        summary: "Plan load failed.",
        reason: "Plan load failed.",
        cta: {
          label: "Go to Planning",
          action: "go_planning",
          href: "/app?tab=planning&mode=investing",
        },
        source: "engine_v3",
        engineVersion: "v3",
        rawAction: "go_planning",
        reasons: ["existing fallback reason"],
        asOf: "2026-03-07T08:30:00.000Z",
      },
      capitalStatus: {
        posture: "SURVIVAL",
        planAlignment: "LOW",
        riskPressure: 0,
        nextEvaluationAt: "2026-03-07T13:00:00.000Z",
      },
      scores: {
        autopilotScore: 25,
        decisionConfidence: 35,
        planCoherence: 0,
        auditNote: "plan-fallback",
      },
      actionGate: {
        status: "blocked",
        allowExecution: false,
        reasons: ["Plan failed to load."],
        nextStep: "Open Planning and activate a valid plan.",
        topLeakKey: "no_plan",
        topLeakSeverity: "high",
      },
      whyNow: {
        driverKey: "no_plan",
        driverTitle: "Plan unavailable",
        severity: "high",
        rationale: "Execution is blocked because an active plan is missing.",
        evidence: ["Plan load failed."],
        expectedOutcome: "Plan activation enables safe execution.",
        counterfactual: "Executing without a plan increases avoidable risk.",
      },
      operationalAction: {
        category: "PROTECT",
        brokerInstruction: "Do not execute new orders.",
        capitalImpact: "Capital deployment blocked.",
        riskImpact: "Risk escalation is prevented.",
        expectedOutcomeWindow: "Next evaluation window",
        extraOperationalField: "keep-plan",
      },
      daily_decision: {
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
          reason_codes: ["plan_load_failed"],
        },
        decision_confidence: 0.9,
        capital_protection: {
          protection_mode: true,
          recommended_action_bias: "defensive",
          size_multiplier: 0.4,
          restrict_aggressive_entries: true,
          reasons: ["plan_load_failed"],
        },
        metadata: {
          precedence: [],
          override: "fallback",
          volatility_regime: "high",
          probabilistic_layer_enabled: false,
        },
      },
      nba: { title: "Create & activate your plan" },
    },
    derived: {
      hasPlan: false,
      hasHoldings: false,
      daily_decision: {
        decision: "HOLD",
      },
      operationalAction: {
        category: "DEPLOY",
      },
      decisionImpact: makeDecisionImpact(),
    },
  };
}

function makeHoldingsFallbackResponse() {
  return {
    ok: false,
    degraded: true,
    degradedReason: "holdings_load_failed",
    mode: "investing" as const,
    asOf: "2026-03-07T09:00:00.000Z",
    plan: { id: "plan_1", status: "active" },
    portfolio: { cash: 0, items: [] },
    daily: {
      nextBestAction: {
        type: "PAUSE",
        instruction: "Pause until holdings recover",
        summary: "Holdings load failed.",
        reason: "Holdings load failed.",
        cta: {
          label: "Go to Portfolio",
          action: "go_portfolio",
          href: "/app?tab=portfolio&mode=investing",
        },
        source: "engine_v3",
        engineVersion: "v3",
        rawAction: "go_portfolio",
        reasons: ["existing holdings fallback reason"],
        asOf: "2026-03-07T08:35:00.000Z",
      },
      capitalStatus: {
        posture: "SURVIVAL",
        planAlignment: "LOW",
        riskPressure: 0,
        nextEvaluationAt: "2026-03-07T13:00:00.000Z",
      },
      scores: {
        autopilotScore: 28,
        decisionConfidence: 38,
        planCoherence: 20,
        auditNote: "holdings-fallback",
      },
      actionGate: {
        status: "blocked",
        allowExecution: false,
        reasons: ["Holdings failed to load."],
        nextStep: "Import/add holdings before executing orders.",
        topLeakKey: "no_holdings",
        topLeakSeverity: "high",
      },
      whyNow: {
        driverKey: "no_holdings",
        driverTitle: "Holdings unavailable",
        severity: "high",
        rationale: "Execution is blocked because holdings are missing.",
        evidence: ["Holdings load failed."],
        expectedOutcome: "Holdings import enables real risk diagnostics.",
        counterfactual: "Trading without holdings data can break risk sizing.",
      },
      operationalAction: {
        category: "PROTECT",
        brokerInstruction: "Do not execute new orders.",
        capitalImpact: "Capital deployment blocked.",
        riskImpact: "Risk escalation is prevented.",
        expectedOutcomeWindow: "Next evaluation window",
        extraOperationalField: "keep-holdings",
      },
      daily_decision: {
        decision: "HOLD",
        legacy_action_type: "HOLD",
        confidence: 0.15,
        confidence_pct: 15,
        expected_move: 0.5,
        expected_value: 0.25,
        recommended_position_pct: 3,
        score: 15,
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
          reason_codes: ["holdings_load_failed"],
        },
        decision_confidence: 0.9,
        capital_protection: {
          protection_mode: true,
          recommended_action_bias: "defensive",
          size_multiplier: 0.4,
          restrict_aggressive_entries: true,
          reasons: ["holdings_load_failed"],
        },
        metadata: {
          precedence: [],
          override: "fallback",
          volatility_regime: "high",
          probabilistic_layer_enabled: false,
        },
      },
      nba: { title: "Add holdings" },
    },
    derived: {
      hasPlan: true,
      hasHoldings: false,
      daily_decision: {
        decision: "HOLD",
      },
      operationalAction: {
        category: "DEPLOY",
      },
      decisionImpact: makeDecisionImpact(),
    },
  };
}

function makeFatalFallbackResponse() {
  return {
    ok: false,
    degraded: true,
    degradedReason: "daily_bundle_fallback",
    mode: "investing" as const,
    asOf: "2026-03-07T09:00:00.000Z",
    plan: null,
    portfolio: { cash: 0, items: [] },
    daily: {
      nextBestAction: {
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
        reasons: ["existing fatal fallback reason"],
        asOf: "2026-03-07T08:40:00.000Z",
      },
      capitalStatus: {
        posture: "SURVIVAL",
        planAlignment: "LOW",
        riskPressure: 100,
        nextEvaluationAt: "2026-03-07T10:00:00.000Z",
      },
      scores: {
        autopilotScore: 25,
        decisionConfidence: 30,
        planCoherence: 0,
        auditNote: "fatal-fallback",
      },
      actionGate: {
        status: "blocked",
        allowExecution: false,
        reasons: ["Temporary data issue detected."],
        nextStep: "Refresh Daily.",
        topLeakKey: "daily_bundle_fallback",
        topLeakSeverity: "high",
      },
      whyNow: {
        driverKey: "daily_bundle_fallback",
        driverTitle: "Temporary backend issue",
        severity: "high",
        rationale: "Syntrake switched to fallback mode to avoid a hard failure.",
        evidence: ["Fallback triggered by runtime error."],
        expectedOutcome: "Stable recovery without 500 failures.",
        counterfactual: "Without fallback, Daily would stay unavailable.",
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
          reason_codes: ["daily_bundle_fallback"],
        },
        decision_confidence: 0.9,
        capital_protection: {
          protection_mode: true,
          recommended_action_bias: "defensive",
          size_multiplier: 0.4,
          restrict_aggressive_entries: true,
          reasons: ["daily_bundle_fallback"],
        },
        metadata: {
          precedence: [],
          override: "fallback",
          volatility_regime: "high",
          probabilistic_layer_enabled: false,
        },
      },
      operationalAction: {
        category: "PROTECT",
        brokerInstruction: "Previous fallback instruction.",
        capitalImpact: "Previous capital impact.",
        riskImpact: "Previous risk impact.",
        expectedOutcomeWindow: "Previous window",
        extraOperationalField: "keep-fatal",
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
      nba: { title: "Daily fallback mode active" },
    },
    derived: {
      hasPlan: false,
      hasHoldings: false,
      daily_decision: {
        decision: "HOLD",
      },
      operationalAction: {
        category: "DEPLOY",
      },
      decisionImpact: makeDecisionImpact(),
    },
  };
}

describe("daily-bundle decisionEnvelope contract", () => {
  it("passes backend trading watchlist inputs through the route envelope attachment", () => {
    const eurusd = createTradingLiveDecisionInput();
    eurusd.snapshot.instrument = "EURUSD";
    eurusd.market.instrument = "EURUSD";
    eurusd.decisionCore.decision.currentState = "TRADE_VALID";

    const btcusd = createTradingLiveDecisionInput();
    btcusd.snapshot.instrument = "BTCUSD";
    btcusd.market.instrument = "BTCUSD";
    btcusd.decisionCore.decision.currentState = "WAIT";

    const out = attachDecisionEnvelopeToDailyBundleRouteResponse({
      response: makeSuccessResponse(),
      branch: "success",
      branchReason: null,
      tradingWatchlistInputs: [eurusd, btcusd],
    });

    expect(
      out.daily.decisionEnvelope.support.trading?.watchlist.map(
        (entry: { instrument: string }) => entry.instrument,
      ),
    ).toEqual(["EURUSD", "BTCUSD"]);
  });

  it("keeps success payload fields intact and adds daily.decisionEnvelope", () => {
    const response = makeSuccessResponse();

    const out = attachDecisionEnvelopeToDailyBundleRouteResponse({
      response,
      branch: "success",
      branchReason: null,
    });

    expect(out.ok).toBe(true);
    expect(out.plan).toEqual({ id: "plan_1", status: "active" });
    expect(out.portfolio.items).toEqual([{ symbol: "AAPL", qty: 10 }]);
    expect(out.daily.nba).toEqual({ title: "Deploy measured capital" });
    expect(out.derived.diagnostics.riskLeaks[0].key).toBe("concentration_med");
    expect(out.daily.daily_decision).toMatchObject({
      asset: "AAPL",
      decision: "BUY",
      legacy_action_type: "ADD",
      confidence: 0.67,
      confidence_pct: 67,
      extraDecisionField: "keep-me",
    });
    expect(out.daily.operationalAction).toMatchObject({
      category: "DEPLOY",
      extraOperationalField: "keep-me",
    });
    expect(out.derived.daily_decision).toMatchObject({
      decision: "BUY",
      confidence_pct: 67,
    });
    expect(out.derived.operationalAction).toMatchObject({
      category: "DEPLOY",
    });
    expect(out.daily.nextBestAction).toMatchObject({
      type: "ADD",
      reasons: ["existing route reason", "keep me"],
      primaryReason: "existing route reason",
      intent: "growth_add",
      lifecycleStage: "ACTIVE",
      sessionState: "READY",
      paywallActivationEligible: true,
      asOf: "2026-03-07T08:00:00.000Z",
      nextEvaluationAt: "2026-03-07T13:00:00.000Z",
    });
    expect(out.daily.scores).toMatchObject({
      autopilotScore: 81,
      decisionConfidence: 74,
      riskPressure: 31,
      planCoherence: 88,
      auditNote: "keep-me",
    });
    expect(out.daily.decisionEnvelope).toBeDefined();
    expect(out.daily.decisionEnvelope.branch).toBe("success");
    expect(out.daily.decisionEnvelope.workflowDecision.type).toBe("ADD");
    expect(out.derived.decisionImpact).toEqual(makeDecisionImpact());
    expect((response.daily as any).decisionEnvelope).toBeUndefined();
  });

  it("keeps plan-load fallback payload backward compatible and adds daily.decisionEnvelope", () => {
    const response = makePlanFallbackResponse();

    const out = attachDecisionEnvelopeToDailyBundleRouteResponse({
      response,
      branch: "plan_load_fallback",
      branchReason: "Plan query failed.",
    });

    expect(out.degraded).toBe(true);
    expect(out.degradedReason).toBe("plan_load_failed");
    expect(out.daily.actionGate.topLeakKey).toBe("no_plan");
    expect(out.daily.whyNow.driverKey).toBe("no_plan");
    expect(out.daily.nba.title).toBe("Create & activate your plan");
    expect(out.daily.daily_decision).toMatchObject({
      decision: "AVOID",
      legacy_action_type: "PAUSE",
      confidence_pct: 90,
    });
    expect(out.daily.operationalAction).toMatchObject({
      category: "PROTECT",
      extraOperationalField: "keep-plan",
    });
    expect(out.derived.daily_decision).toMatchObject({
      decision: "AVOID",
      confidence_pct: 90,
    });
    expect(out.derived.operationalAction).toMatchObject({
      category: "PROTECT",
    });
    expect(out.daily.nextBestAction).toMatchObject({
      type: "PAUSE",
      reasons: ["existing fallback reason"],
      asOf: "2026-03-07T08:30:00.000Z",
      nextEvaluationAt: "2026-03-07T13:00:00.000Z",
    });
    expect(out.daily.scores).toMatchObject({
      autopilotScore: 25,
      decisionConfidence: 35,
      riskPressure: 0,
      planCoherence: 0,
      auditNote: "plan-fallback",
    });
    expect(out.derived.decisionImpact).toEqual(makeDecisionImpact());
    expect(out.daily.decisionEnvelope.branch).toBe("plan_load_fallback");
    expect(out.daily.decisionEnvelope.support.precedence.override).toBe("fallback");
  });

  it("keeps holdings-load fallback payload backward compatible and adds daily.decisionEnvelope", () => {
    const response = makeHoldingsFallbackResponse();

    const out = attachDecisionEnvelopeToDailyBundleRouteResponse({
      response,
      branch: "holdings_load_fallback",
      branchReason: "Holdings query failed.",
    });

    expect(out.degraded).toBe(true);
    expect(out.degradedReason).toBe("holdings_load_failed");
    expect(out.daily.actionGate.topLeakKey).toBe("no_holdings");
    expect(out.daily.whyNow.driverKey).toBe("no_holdings");
    expect(out.daily.nba.title).toBe("Add holdings");
    expect(out.daily.daily_decision).toMatchObject({
      decision: "AVOID",
      legacy_action_type: "PAUSE",
      confidence_pct: 90,
    });
    expect(out.daily.operationalAction).toMatchObject({
      category: "PROTECT",
      extraOperationalField: "keep-holdings",
    });
    expect(out.derived.daily_decision).toMatchObject({
      decision: "AVOID",
      confidence_pct: 90,
    });
    expect(out.derived.operationalAction).toMatchObject({
      category: "PROTECT",
    });
    expect(out.daily.nextBestAction).toMatchObject({
      type: "PAUSE",
      reasons: ["existing holdings fallback reason"],
      asOf: "2026-03-07T08:35:00.000Z",
      nextEvaluationAt: "2026-03-07T13:00:00.000Z",
    });
    expect(out.daily.scores).toMatchObject({
      autopilotScore: 28,
      decisionConfidence: 38,
      riskPressure: 0,
      planCoherence: 20,
      auditNote: "holdings-fallback",
    });
    expect(out.derived.decisionImpact).toEqual(makeDecisionImpact());
    expect(out.daily.decisionEnvelope.branch).toBe("holdings_load_fallback");
    expect(out.daily.decisionEnvelope.support.precedence.override).toBe("fallback");
  });

  it("keeps fatal fallback payload backward compatible and adds daily.decisionEnvelope", () => {
    const response = makeFatalFallbackResponse();

    const out = attachDecisionEnvelopeToDailyBundleRouteResponse({
      response,
      branch: "fatal_fallback",
      branchReason: "Unexpected daily bundle error",
    });

    expect(out.degraded).toBe(true);
    expect(out.degradedReason).toBe("daily_bundle_fallback");
    expect(out.daily.actionGate.topLeakKey).toBe("daily_bundle_fallback");
    expect(out.daily.whyNow.driverKey).toBe("daily_bundle_fallback");
    expect(out.daily.nba.title).toBe("Daily fallback mode active");
    expect(out.daily.daily_decision).toMatchObject({
      decision: "AVOID",
      legacy_action_type: "PAUSE",
      confidence_pct: 90,
    });
    expect(out.daily.operationalAction).toMatchObject({
      category: "PROTECT",
      extraOperationalField: "keep-fatal",
    });
    expect(out.derived.daily_decision).toMatchObject({
      decision: "AVOID",
      confidence_pct: 90,
    });
    expect(out.derived.operationalAction).toMatchObject({
      category: "PROTECT",
    });
    expect(out.daily.nextBestAction).toMatchObject({
      type: "PAUSE",
      reasons: ["existing fatal fallback reason"],
      asOf: "2026-03-07T08:40:00.000Z",
      nextEvaluationAt: "2026-03-07T10:00:00.000Z",
    });
    expect(out.daily.scores).toMatchObject({
      autopilotScore: 25,
      decisionConfidence: 30,
      riskPressure: 100,
      planCoherence: 0,
      auditNote: "fatal-fallback",
    });
    expect(out.derived.decisionImpact).toEqual(makeDecisionImpact());
    expect(out.daily.decisionEnvelope.branch).toBe("fatal_fallback");
    expect(out.daily.decisionEnvelope.support.precedence.override).toBe("fallback");
    expect(out.daily.decisionEnvelope.executionInstruction.allowExecution).toBe(false);
  });
});
