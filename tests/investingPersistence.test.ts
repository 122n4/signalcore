import { describe, expect, it } from "vitest";
import {
  buildInvestingExecutionPlan,
  buildInvestingExecutionPlanRow,
  buildInvestingMandateSnapshotRow,
  buildInvestingResearchSnapshotRow,
  buildInvestingReconciliationLedgerRow,
  buildInvestingRebalanceLedgerRow,
  createInvestingFingerprint,
  reconcileBrokerSnapshotAgainstInvestingIntent,
  resolveInvestingEngine,
  stableJsonStringify,
} from "@/lib/investing";

function makeEngine() {
  return {
    objective: "growth",
    benchmark: {
      benchmarkId: "growth_60_40",
      benchmarkName: "Growth 60/40",
      components: [{ symbol: "SPY", weightPct: 60 }],
      notes: ["benchmark aligned"],
    },
    executionPolicy: {
      avgFeeBps: 12,
      executionMode: "rebalance_now",
      turnoverBucket: "medium",
      taxFrictionBucket: "medium",
      minimumHoldingPeriodDays: 14,
      governanceStatus: "review",
      estimatedRoundTripCostEur: 13.4,
      notes: ["trade in liquid session"],
    },
    governancePolicy: {
      suitabilityStatus: "review",
      autonomyStatus: "supervised",
      turnoverStatus: "review",
      taxDragBucket: "medium",
      executionClearance: "review",
      approvalRequired: true,
      killSwitchActive: false,
      overrideAllowed: true,
      maxDeployablePct: 25,
      approvedSymbols: ["SPY"],
      blockedSymbols: [],
      manualReviewReasons: ["turnover_near_policy_cap"],
      notes: ["governance review required"],
    },
    construction: {
      mandate: {
        objective: "growth",
        riskProfile: "Balanced",
        horizon: "Long",
        baseCurrency: "EUR",
        cashReservePct: 5,
      },
      targetAllocations: [
        { symbol: "SPY", assetClass: "equity", targetWeightPct: 60, targetValueEur: 6000, rationale: "core" },
        { symbol: "AGGH", assetClass: "bond", targetWeightPct: 35, targetValueEur: 3500, rationale: "ballast" },
      ],
      notes: ["construction ready"],
    },
    rebalance: {
      withinPolicy: true,
      grossTurnoverPct: 12,
      actions: [
        { symbol: "SPY", action: "buy", deltaValueEur: 500, rationale: "top up" },
        { symbol: "AGGH", action: "hold", deltaValueEur: 0, rationale: "inside band" },
      ],
      notes: ["turnover within band"],
    },
    notes: ["mandate accepted"],
  } as Record<string, any>;
}

describe("investing persistence helpers", () => {
  it("keeps fingerprints stable across object key order", () => {
    const left = { b: 1, a: { d: 2, c: 3 } };
    const right = { a: { c: 3, d: 2 }, b: 1 };

    expect(stableJsonStringify(left)).toBe(stableJsonStringify(right));
    expect(createInvestingFingerprint(left)).toBe(createInvestingFingerprint(right));
  });

  it("resolves the investing engine from daily or derived snapshots", () => {
    const engine = makeEngine();
    expect(resolveInvestingEngine({ daily: { investingEngine: engine } })).toEqual(engine);
    expect(resolveInvestingEngine({ derived: { investingEngine: engine } })).toEqual(engine);
    expect(resolveInvestingEngine({})).toBeNull();
  });

  it("builds canonical mandate and rebalance rows with deterministic fingerprints", () => {
    const engine = makeEngine();
    const mandateRow = buildInvestingMandateSnapshotRow({
      userId: "user_1",
      mode: "investing",
      dayKey: "2026-07-17",
      asOf: "2026-07-17T10:00:00.000Z",
      engine,
    });
    const rebalanceRow = buildInvestingRebalanceLedgerRow({
      userId: "user_1",
      mode: "investing",
      dayKey: "2026-07-17",
      asOf: "2026-07-17T10:00:00.000Z",
      engine,
      mandateFingerprint: mandateRow.mandate_fingerprint,
      totalEur: 10_000,
      cashEur: 2_000,
      holdingsCount: 2,
    });

    expect(mandateRow.objective).toBe("growth");
    expect(mandateRow.risk_profile).toBe("Balanced");
    expect(mandateRow.horizon).toBe("Long");
    expect(mandateRow.policy).toMatchObject({
      mandate: { baseCurrency: "EUR" },
      benchmark: { benchmarkId: "growth_60_40" },
    });
    expect(mandateRow.mandate_fingerprint).toHaveLength(64);

    expect(rebalanceRow.status).toBe("proposed");
    expect(rebalanceRow.reason_codes).toContain("mandate accepted");
    expect(rebalanceRow.reason_codes).toContain("turnover within band");
    expect(rebalanceRow.reason_codes).toContain("governance review required");
    expect(rebalanceRow.governance_policy).toMatchObject({
      autonomyStatus: "supervised",
      taxDragBucket: "medium",
    });
    expect(rebalanceRow.valuation_context).toMatchObject({
      total_eur: 10_000,
      cash_eur: 2_000,
      holdings_count: 2,
    });
    expect(rebalanceRow.decision_fingerprint).toHaveLength(64);
    expect(rebalanceRow.mandate_fingerprint).toBe(mandateRow.mandate_fingerprint);
  });

  it("builds execution plan rows from governance clearance", () => {
    const engine = makeEngine();
    const mandateRow = buildInvestingMandateSnapshotRow({
      userId: "user_1",
      mode: "investing",
      dayKey: "2026-07-17",
      asOf: "2026-07-17T10:00:00.000Z",
      engine,
    });
    const rebalanceRow = buildInvestingRebalanceLedgerRow({
      userId: "user_1",
      mode: "investing",
      dayKey: "2026-07-17",
      asOf: "2026-07-17T10:00:00.000Z",
      engine,
      mandateFingerprint: mandateRow.mandate_fingerprint,
      totalEur: 10_000,
      cashEur: 2_000,
      holdingsCount: 2,
    });
    const executionPlan = buildInvestingExecutionPlan({
      engine,
      totalEur: 10_000,
      cashEur: 2_000,
      asOf: "2026-07-17T10:00:00.000Z",
    });
    const row = buildInvestingExecutionPlanRow({
      userId: "user_1",
      mode: "investing",
      dayKey: "2026-07-17",
      asOf: "2026-07-17T10:00:00.000Z",
      engine,
      mandateFingerprint: mandateRow.mandate_fingerprint,
      decisionFingerprint: rebalanceRow.decision_fingerprint,
      executionPlan,
    });

    expect(executionPlan.decision).toBe("manual_execute");
    expect(executionPlan.approvalStatus).toBe("pending");
    expect(row.approval_required).toBe(true);
    expect(row.max_deployable_pct).toBe(25);
    expect(row.blocking_reasons).toContain("turnover_near_policy_cap");
    expect(row.decision_fingerprint).toBe(rebalanceRow.decision_fingerprint);
  });

  it("builds research snapshot rows from benchmark validation and scorecards", () => {
    const engine = makeEngine();
    engine.benchmarkValidation = {
      benchmarkId: "growth_60_40",
      benchmarkName: "Growth 60/40",
      status: "review",
      overlapWeightPct: 74,
      activeSharePct: 16,
      concentrationDriftPct: 9,
      turnoverPct: 12,
      activeBets: [{ symbol: "SPY", activeWeightPct: 5 }],
      notes: ["benchmark validation ready"],
    };
    engine.instrumentScorecards = [
      { symbol: "SPY", mandateFit: "high", warnings: [], strengths: ["benchmark_eligible"] },
      { symbol: "GLD", mandateFit: "low", warnings: ["tax_drag"], strengths: [] },
    ];
    const mandateRow = buildInvestingMandateSnapshotRow({
      userId: "user_1",
      mode: "investing",
      dayKey: "2026-07-17",
      asOf: "2026-07-17T10:00:00.000Z",
      engine,
    });

    const row = buildInvestingResearchSnapshotRow({
      userId: "user_1",
      mode: "investing",
      dayKey: "2026-07-17",
      asOf: "2026-07-17T10:00:00.000Z",
      engine,
      mandateFingerprint: mandateRow.mandate_fingerprint,
    });

    expect(row.benchmark_id).toBe("growth_60_40");
    expect(row.status).toBe("review");
    expect(row.summary).toMatchObject({
      scorecardCount: 2,
      highFitCount: 1,
      warningCount: 1,
    });
    expect(row.research_fingerprint).toHaveLength(64);
  });

  it("builds investing intent reconciliation rows from target vs broker drift", () => {
    const result = reconcileBrokerSnapshotAgainstInvestingIntent({
      snapshot: {
        mode: "investing",
        asOf: "2026-07-17T10:00:00.000Z",
        positions: [
          { symbol: "SPY", qty: 10, valueEur: 5000 },
          { symbol: "GLD", qty: 3, valueEur: 600 },
        ],
        cashEur: 400,
        totalEur: 6000,
        source: "broker",
      },
      targetPortfolio: [
        { symbol: "SPY", targetWeightPct: 60, targetValueEur: 3600, assetClass: "equity" },
        { symbol: "AGGH", targetWeightPct: 35, targetValueEur: 2100, assetClass: "bond" },
      ],
      rebalanceActions: [{ symbol: "AGGH", action: "buy" }],
      decisionFingerprint: "f".repeat(64),
      intentAsOf: "2026-07-17T09:55:00.000Z",
    });

    const row = buildInvestingReconciliationLedgerRow({
      userId: "user_1",
      mode: "investing",
      result,
    });

    expect(result.status).toBe("critical");
    expect(result.mismatches.some((entry) => entry.type === "missing_target_in_broker")).toBe(true);
    expect(result.mismatches.some((entry) => entry.type === "orphan_broker_position")).toBe(true);
    expect(row.decision_fingerprint).toBe("f".repeat(64));
    expect(row.status).toBe("critical");
    expect(Array.isArray(row.mismatches)).toBe(true);
  });
});
