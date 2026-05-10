import { describe, expect, it } from "vitest";
import {
  buildWeeklyPremiumReport,
  buildOpportunityQueue,
  computeOperationalAction,
  computeAntiChurnState,
  computeKillSwitchState,
  computeRiskEnvelope,
  enforceActionGateWithPreTrade,
} from "@/lib/signalcore/dailyEnhancements";
import { deriveRiskPolicy, evaluateRiskPolicy } from "@/lib/signalcore/riskPolicy";

describe("dailyEnhancements", () => {
  it("keeps execution available but cautious when pre-trade only fails on proof/discipline", () => {
    const out = enforceActionGateWithPreTrade({
      actionGate: { status: "ready", allowExecution: true, confidencePct: 84, reasons: ["ok"], coveragePct: 90 },
      preTrade: {
        required: true,
        status: "caution",
        reason: "Safety check failed",
        checks: {
          policyClear: true,
          qualityOk: true,
          proofDepthOk: false,
          validationOk: false,
          checklistOk: false,
          gateClear: true,
        },
        riskEscalationBlocked: true,
        requiredProofDays7: 2,
        nextStep: "Fix proof",
      },
    });
    expect(out.status).toBe("caution");
    expect(out.allowExecution).toBe(true);
  });

  it("still blocks action gate when pre-trade fails on hard safety checks", () => {
    const out = enforceActionGateWithPreTrade({
      actionGate: { status: "ready", allowExecution: true, confidencePct: 84, reasons: ["ok"], coveragePct: 42 },
      preTrade: {
        required: true,
        status: "blocked",
        reason: "Data quality below pre-trade floor.",
        checks: {
          policyClear: true,
          qualityOk: false,
          proofDepthOk: true,
          validationOk: true,
          checklistOk: true,
          gateClear: true,
        },
        riskEscalationBlocked: true,
        requiredProofDays7: 2,
        nextStep: "Improve pricing coverage before executing.",
      },
    });
    expect(out.status).toBe("blocked");
    expect(out.allowExecution).toBe(false);
  });

  it("locks risk envelope when kill-switch is active", () => {
    const policy = deriveRiskPolicy({
      mode: "investing",
      riskProfile: "Balanced",
      horizon: "Long",
      userSettings: null,
      plan: null,
    });
    const riskPolicyEval = evaluateRiskPolicy({
      policy,
      diagnostics: {
        concentrationTop1Pct: 15,
        concentrationTop3Pct: 45,
        cashDragPct: 10,
        pricing: { coveragePct: 95, missingSymbols: [] },
        riskLeaks: [],
      },
      pressureScore: 35,
      maxDrawdownPct: -6,
      hasPlan: true,
      hasHoldings: true,
    });
    const killSwitch = computeKillSwitchState({
      hasPlan: true,
      hasHoldings: true,
      doneToday: false,
      riskPolicyEval: { ...riskPolicyEval, status: "block", blocked: true, reasons: ["Policy block"], breaches: [{ key: "high_severity_leak", message: "x", actual: "high", limit: "none" }] },
      actionGate: { status: "blocked", reasons: ["blocked"] },
    });
    const envelope = computeRiskEnvelope({
      mode: "investing",
      riskPolicy: policy,
      riskPolicyEval,
      actionGate: { status: "ready", confidencePct: 80, pressureScore: 40 },
      executionScore: { score: 80 },
      executionEvidence: { avgQuality14: 80 },
      killSwitch,
    });
    expect(envelope.status).toBe("blocked");
    expect(envelope.maxDeployPct).toBe(0);
  });

  it("builds deterministic opportunity queue ordering", () => {
    const queueA = buildOpportunityQueue({
      opportunities: [
        { id: "a", type: "reduce_concentration", title: "Reduce concentration", score: 80, confidence: 70 },
        { id: "b", type: "fix_pricing", title: "Fix pricing", score: 70, confidence: 90 },
      ],
      executionScore: { score: 75 },
      riskPolicyEval: { status: "pass", blocked: false, reasons: [], nextStep: "", breaches: [], warnings: [], snapshot: { top1Pct: null, top3Pct: null, drawdownPct: null, exposurePct: null, coveragePct: null, pressureScore: null, missingSymbols: 0, topLeakSeverity: null } },
      actionGate: { status: "ready" },
      killSwitch: { active: false, state: "Monitoring", reason: "", trigger: null, allowNewRisk: true, releaseRule: "" },
      asOf: "2026-02-27T12:00:00.000Z",
    });

    const queueB = buildOpportunityQueue({
      opportunities: [
        { id: "a", type: "reduce_concentration", title: "Reduce concentration", score: 80, confidence: 70 },
        { id: "b", type: "fix_pricing", title: "Fix pricing", score: 70, confidence: 90 },
      ],
      executionScore: { score: 75 },
      riskPolicyEval: { status: "pass", blocked: false, reasons: [], nextStep: "", breaches: [], warnings: [], snapshot: { top1Pct: null, top3Pct: null, drawdownPct: null, exposurePct: null, coveragePct: null, pressureScore: null, missingSymbols: 0, topLeakSeverity: null } },
      actionGate: { status: "ready" },
      killSwitch: { active: false, state: "Monitoring", reason: "", trigger: null, allowNewRisk: true, releaseRule: "" },
      asOf: "2026-02-27T12:00:00.000Z",
    });

    expect(queueA.items.map((x) => `${x.id}:${x.priority}`)).toEqual(queueB.items.map((x) => `${x.id}:${x.priority}`));
  });

  it("raises anti-churn risk when discipline and continuity are weak", () => {
    const anti = computeAntiChurnState({
      doneToday: false,
      streak: 0,
      executionScore: { score: 40, validationPct: 35, disciplinePct: 30 },
      weeklyValue: { riskAvoidedPoints: 0, errorsAvoidedEstimate: 0, disciplineUpPct: -20, summary: "weak" },
      growthReadiness: { score: 45, tier: "Not ready", components: { alignment: 40, risk: 40, consistency: 30, execution: 30 }, nextFocus: "recover" },
      killSwitch: { active: true, state: "Protecting", reason: "x", trigger: "x", allowNewRisk: false, releaseRule: "x" },
      preTrade: {
        required: true,
        status: "blocked",
        reason: "blocked",
        checks: { policyClear: false, qualityOk: false, proofDepthOk: false, validationOk: false, checklistOk: false, gateClear: false },
        riskEscalationBlocked: true,
        requiredProofDays7: 2,
        nextStep: "fix",
      },
      actionGate: { status: "blocked" },
      continuitySignals: { directionalState: "worsening" },
    });
    expect(anti.riskLevel).toBe("high");
    expect(anti.score).toBeLessThan(45);
    expect(anti.interventions.length).toBeGreaterThan(0);
  });

  it("builds weekly premium report with deterministic metrics", () => {
    const report = buildWeeklyPremiumReport({
      asOf: "2026-02-27T12:00:00.000Z",
      mode: "investing",
      weeklyValue: { riskAvoidedPoints: 7, errorsAvoidedEstimate: 5, disciplineUpPct: 9, summary: "ok" },
      growthReadiness: { score: 76, tier: "Ready", components: { alignment: 80, risk: 70, consistency: 75, execution: 78 }, nextFocus: "keep discipline" },
      executionScore: { score: 74, validationPct: 70, disciplinePct: 71 },
      riskEnvelope: {
        status: "constrained",
        riskClass: "Moderate",
        maxDeployPct: 22,
        maxPositionPct: 12,
        expectedDrawdownBudgetPct: 10,
        confidenceWeight: 0.7,
        executionWeight: 0.72,
        pressureWeight: 0.6,
        recommendation: "x",
      },
      killSwitch: { active: false, state: "Monitoring", reason: "", trigger: null, allowNewRisk: true, releaseRule: "" },
      streak: 3,
      topLeakTitle: "Concentration",
      decisionSources: { trustLine: "Deterministic report." },
    });
    expect(report.metrics.growthReadiness).toBe(76);
    expect(report.metrics.executionScore).toBe(74);
    expect(report.trustLine).toBe("Deterministic report.");
    expect(report.focusNextWeek.length).toBeGreaterThan(0);
  });

  it("maps HOLD to PREPARE by default and DISCIPLINE when day is closed", () => {
    const holdOpen = computeOperationalAction({
      actionType: "HOLD",
      doneToday: false,
      hasProofToday: false,
      gateStatus: "ready",
      allowExecution: true,
      actionInstruction: "",
    });
    const holdClosed = computeOperationalAction({
      actionType: "HOLD",
      doneToday: true,
      hasProofToday: false,
      gateStatus: "ready",
      allowExecution: true,
    });

    expect(holdOpen.category).toBe("PREPARE");
    expect(holdClosed.category).toBe("DISCIPLINE");
    expect(holdOpen.brokerInstruction.length).toBeGreaterThan(0);
    expect(holdClosed.brokerInstruction.length).toBeGreaterThan(0);
  });

  it("maps deploy and rotate categories from action semantics", () => {
    const deploy = computeOperationalAction({
      actionType: "ADD",
      actionInstruction: "Add in staged lots",
      doneToday: false,
      gateStatus: "ready",
      allowExecution: true,
    });
    const rotate = computeOperationalAction({
      actionType: "REDUCE",
      actionInstruction: "Rebalance concentration drift",
      doneToday: false,
      gateStatus: "ready",
      allowExecution: true,
    });

    expect(deploy.category).toBe("DEPLOY");
    expect(rotate.category).toBe("ROTATE");
  });

  it("always returns a complete operational action payload", () => {
    const samples = ["HOLD", "ADD", "REDUCE", "EXIT", "PAUSE", "EXECUTE_BROKER", "CLOSE_DAY", "UNKNOWN"];
    for (const sample of samples) {
      const out = computeOperationalAction({
        actionType: sample,
        doneToday: sample === "CLOSE_DAY",
        gateStatus: "caution",
        allowExecution: true,
      });
      expect(["DEPLOY", "ROTATE", "PROTECT", "PREPARE", "DISCIPLINE"]).toContain(out.category);
      expect(out.brokerInstruction.length).toBeGreaterThan(0);
      expect(out.capitalImpact.length).toBeGreaterThan(0);
      expect(out.riskImpact.length).toBeGreaterThan(0);
      expect(out.expectedOutcomeWindow.length).toBeGreaterThan(0);
    }
  });
});
