import { describe, expect, it } from "vitest";

import { compare, runInvestingEngineV1Final } from "@/lib/investing/engine/v1/phase3f";
import {
  PHASE3F_AS_OF,
  buildPhase3FSources,
  constraint,
  d,
  phase3fOrder,
  phase3fPosition,
  withResealedRequest,
} from "@/tests/fixtures/investingEnginePhase3FFixture";

describe("FASE 3F end-to-end final decision", () => {
  it("produces proposal_ready for a safe cash-only run", () => {
    const result = runInvestingEngineV1Final(buildPhase3FSources());
    expect(result.state).toBe("proposal_ready");
    expect(result.selectedCandidateMode).toBe("full_rebalance");
    expect(result.actions.some((action) => action.side === "buy")).toBe(true);
    expect(result.executable).toBe(false);
  });

  it("produces no_trade for an empty known portfolio", () => {
    const result = runInvestingEngineV1Final(buildPhase3FSources({ cash: "0" }));
    expect(result.state).toBe("no_trade");
    expect(result.actions.every((action) => action.side === "hold")).toBe(true);
  });

  it("produces degraded for a material proposal with a soft failure", () => {
    const result = runInvestingEngineV1Final(buildPhase3FSources({
      cash: "550",
      positions: [phase3fPosition({ symbol: "VWCE", quantity: "5", currency: "USD" })],
      constraints: [
        constraint({ id: "max_instrument_weight:VWCE", limit: "1" }),
        constraint({ id: "max_asset_class_weight:equity", limit: "1" }),
        constraint({ id: "max_currency_weight:USD", kind: "soft", limit: "0.3" }),
      ],
    }));
    expect(result.state).toBe("degraded");
    expect(result.softConstraints.some((entry) => entry.status === "fail")).toBe(true);
  });

  it("propagates a phase3D hard block without material proposal", () => {
    const result = runInvestingEngineV1Final(buildPhase3FSources({
      cash: "0",
      positions: [phase3fPosition({ quantity: "20" })],
      constraints: [constraint({ id: "prohibit_instrument:AGGH" })],
    }));
    expect(result.state).toBe("blocked");
    expect(result.reasonCodes).toContain("phase3d_blocked");
    expect(result.proposal).toBeNull();
    expect(result.actions).toEqual([]);
  });

  it("propagates phase3D insufficient_data", () => {
    const result = runInvestingEngineV1Final(buildPhase3FSources({
      cash: "0",
      positions: [phase3fPosition({ symbol: "SPY", currency: "USD" })],
      omitMarket: ["SPY"],
    }));
    expect(result.state).toBe("insufficient_data");
    expect(result.reasonCodes).toContain("phase3d_insufficient_data");
    expect(result.targetPortfolio).toBeNull();
  });

  it("propagates phase3E liquidity block", () => {
    const overrides = Object.fromEntries(["AGGH", "GLD", "SPY", "VWCE"].map((symbol) => [symbol, {
      averageDailyVolume: d("0.01"), maxParticipation: d("0.01"),
    }]));
    const result = runInvestingEngineV1Final(buildPhase3FSources({ modelOverrides: overrides }));
    expect(result.state).toBe("blocked");
    expect(result.reasonCodes).toContain("phase3e_blocked");
  });

  it("propagates phase3E insufficient cost/liquidity data", () => {
    const overrides = Object.fromEntries(["AGGH", "GLD", "SPY", "VWCE"].map((symbol) => [symbol, {
      spreadBps: null, averageDailyVolume: null,
    }]));
    const result = runInvestingEngineV1Final(buildPhase3FSources({ modelOverrides: overrides }));
    expect(result.state).toBe("insufficient_data");
    expect(result.reasonCodes).toContain("phase3e_insufficient_data");
  });

  it.each([
    ["one position", [phase3fPosition()]],
    ["multiple positions", [phase3fPosition(), phase3fPosition({ symbol: "VWCE", currency: "USD", quantity: "1" })]],
  ])("explains current/projected/target for %s", (_name, positions) => {
    const result = runInvestingEngineV1Final(buildPhase3FSources({ cash: "800", positions }));
    expect(result.actions.length).toBeGreaterThan(0);
    expect(result.actions.every((action) => action.explanation.some((line) => line.includes("Current quantity")))).toBe(true);
    expect(result.actions.every((action) => action.executable === false)).toBe(true);
  });

  it("preserves buy, sell and hold decisions", () => {
    const buy = runInvestingEngineV1Final(buildPhase3FSources());
    const sell = runInvestingEngineV1Final(buildPhase3FSources({
      cash: "0",
      positions: [phase3fPosition({ quantity: "20", costBasis: "40" })],
      constraints: [
        constraint({ id: "max_instrument_weight", limit: "1" }),
        constraint({ id: "max_asset_class_weight", limit: "1" }),
        constraint({ id: "minimum_cash_weight", limit: "0" }),
        constraint({ id: "maximum_total_exposure", limit: "1" }),
        constraint({ id: "maximum_risk_score", kind: "soft", limit: "1" }),
      ],
    }));
    const hold = runInvestingEngineV1Final(buildPhase3FSources({ cash: "0" }));
    expect(buy.actions.some((action) => action.side === "buy")).toBe(true);
    expect(sell.auditBundle.constructionCandidates.flatMap((candidate) => candidate.actions).some((action) => action.side === "sell")).toBe(true);
    expect(hold.state).toBe("no_trade");
  });

  it("preserves full and partial rebalance selection", () => {
    const full = runInvestingEngineV1Final(buildPhase3FSources());
    const partial = runInvestingEngineV1Final(buildPhase3FSources({
      modelOverrides: {
        AGGH: { averageDailyVolume: d("3"), maxParticipation: d("1") },
        GLD: { averageDailyVolume: d("1"), maxParticipation: d("1") },
        SPY: { averageDailyVolume: d("1"), maxParticipation: d("1") },
        VWCE: { averageDailyVolume: d("2"), maxParticipation: d("1") },
      },
    }));
    expect(full.selectedCandidateMode).toBe("full_rebalance");
    expect(partial.selectedCandidateMode).toBe("partial_rebalance");
  });

  it.each([
    ["pending buy", phase3fOrder(), "2"],
    ["partial fill", phase3fOrder({ status: "partially_filled", cumulativeFilledQuantity: "1", quantity: "3" }), "2"],
    ["cancellation requested", phase3fOrder({ status: "cancellation_requested" }), "2"],
  ])("preserves PROJECTED economics for %s", (_name, order, minimumProjected) => {
    const result = runInvestingEngineV1Final(buildPhase3FSources({ cash: "900", orders: [order] }));
    const aggh = result.auditBundle.constructionCandidates
      .find((candidate) => candidate.mode === "full_rebalance")
      ?.actions.find((action) => action.symbol === "AGGH");
    expect(compare(aggh?.projectedQuantity ?? d("0"), d(minimumProjected))).toBeGreaterThanOrEqual(0);
  });

  it("preserves pending sell, same-symbol orders and terminal exclusion", () => {
    const pendingSell = phase3fOrder({ side: "sell", quantity: "2", persistedReservedCash: "0", persistedReservedQuantity: "2" });
    const second = phase3fOrder({ orderId: "order_phase3f_2", semanticOrderId: "semantic_phase3f_2", quantity: "1" });
    const terminal = phase3fOrder({ orderId: "order_phase3f_terminal", semanticOrderId: "semantic_terminal", status: "filled" });
    const result = runInvestingEngineV1Final(buildPhase3FSources({
      cash: "0",
      positions: [phase3fPosition({ quantity: "10", reservedQuantity: "2" })],
      orders: [pendingSell, second, terminal],
    }));
    expect(result.auditBundle.portfolioStateSummary.reservedHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.explanation.nodes.some((node) => node.relatedOrders.includes("order_phase3f_terminal"))).toBe(false);
  });

  it("propagates a phase3C ambiguity as blocked", () => {
    const sources = buildPhase3FSources();
    const issue = { code: "order_state_ambiguous", severity: "error" as const, domain: "orders", message: "Ambiguous fixture", observedAt: PHASE3F_AS_OF };
    const changed = withResealedRequest(sources, {
      portfolioState: { ...sources.portfolioState, issues: [...sources.portfolioState.issues, issue] },
    });
    const result = runInvestingEngineV1Final(changed);
    expect(result.state).toBe("blocked");
    expect(result.reasonCodes).toContain("phase3c_blocked");
    expect(result.actions).toEqual([]);
  });

  it("propagates a non-blocking phase3C material error as insufficient_data", () => {
    const sources = buildPhase3FSources();
    const issue = { code: "price_evidence_missing", severity: "error" as const, domain: "market", message: "Missing fixture", observedAt: PHASE3F_AS_OF };
    const changed = withResealedRequest(sources, {
      portfolioState: { ...sources.portfolioState, issues: [...sources.portfolioState.issues, issue] },
    });
    const result = runInvestingEngineV1Final(changed);
    expect(result.state).toBe("insufficient_data");
    expect(result.reasonCodes).toContain("phase3c_insufficient_data");
  });

  it("degrades a material proposal when 3C carries a supported warning", () => {
    const sources = buildPhase3FSources();
    const issue = { code: "supported_quality_warning", severity: "warning" as const, domain: "market", message: "Supported warning fixture", observedAt: PHASE3F_AS_OF };
    const changed = withResealedRequest(sources, {
      portfolioState: { ...sources.portfolioState, issues: [...sources.portfolioState.issues, issue] },
    });
    const result = runInvestingEngineV1Final(changed);
    expect(result.state).toBe("degraded");
    expect(result.reasonCodes).toContain("supported_quality_warning");
  });

  it("preserves constraints, costs, liquidity, tax, target and risk reconciliation", () => {
    const result = runInvestingEngineV1Final(buildPhase3FSources());
    expect(result.hardConstraints.length).toBeGreaterThan(0);
    expect(result.costs.length).toBe(result.actions.length);
    expect(result.liquidity.length).toBe(result.actions.length);
    expect(result.taxAwareness.length).toBe(result.actions.length);
    expect(result.projectedRiskAfter).not.toBeNull();
    expect(result.targetPortfolio?.residualCash).toBe(result.residualCash);
    expect(result.selectedCandidateId).toBe(result.auditBundle.selectedCandidate?.candidateId);
  });

  it("preserves minimum fee, spread, slippage and FX cost in the final action", () => {
    const result = runInvestingEngineV1Final(buildPhase3FSources());
    const foreignBuy = result.actions.find((action) => action.symbol === "SPY" && action.side === "buy");
    expect(foreignBuy).toBeDefined();
    expect(foreignBuy!.estimatedCosts.minimumFeeApplied).toBe(true);
    expect(compare(foreignBuy!.estimatedCosts.spread!, d("0"))).toBeGreaterThan(0);
    expect(compare(foreignBuy!.estimatedCosts.slippage!, d("0"))).toBeGreaterThan(0);
    expect(compare(foreignBuy!.estimatedCosts.fxCost!, d("0"))).toBeGreaterThan(0);
  });

  it.each([
    ["stale", { liquidityAsOf: "2026-07-20T09:00:00.000Z" }, "liquidity_data_stale"],
    ["absent", { averageDailyVolume: null }, "liquidity_data_unavailable"],
  ])("propagates %s liquidity as insufficient_data", (_name, override, reason) => {
    const modelOverrides = Object.fromEntries(["AGGH", "GLD", "SPY", "VWCE"].map((symbol) => [symbol, override]));
    const result = runInvestingEngineV1Final(buildPhase3FSources({ modelOverrides }));
    expect(result.state).toBe("insufficient_data");
    expect(result.reasonCodes).toContain(reason);
  });

  it.each([
    ["known_gain", "40", "available"],
    ["known_loss", "60", "available"],
    ["unknown_basis", "40", "unavailable"],
  ])("preserves tax awareness %s and lower-turnover evidence", (expected, costBasis, availability) => {
    const result = runInvestingEngineV1Final(buildPhase3FSources({
      cash: "0",
      positions: [phase3fPosition({ quantity: "20", costBasis })],
      constraints: [
        constraint({ id: "max_instrument_weight", limit: "1" }),
        constraint({ id: "max_asset_class_weight", limit: "1" }),
        constraint({ id: "minimum_cash_weight", limit: "0" }),
        constraint({ id: "maximum_total_exposure", limit: "1" }),
        constraint({ id: "maximum_risk_score", kind: "soft", limit: "1" }),
      ],
      modelOverrides: { AGGH: { taxLotAvailability: availability as "available" | "unavailable" } },
    }));
    const sale = result.auditBundle.constructionCandidates.flatMap((candidate) => candidate.actions)
      .find((action) => action.symbol === "AGGH" && action.side === "sell");
    expect(sale?.taxAwareness.status).toBe(expected);
    if (expected === "known_gain") {
      expect(result.auditBundle.constructionCandidates.some((candidate) =>
        candidate.evaluation.rankReasonCodes.includes("taxable_gain_prefer_lower_turnover"))).toBe(true);
    }
  });

  it("preserves cash/concentration constraints, suitability and hard-over-soft precedence", () => {
    const suitable = runInvestingEngineV1Final(buildPhase3FSources({
      constraints: [
        constraint({ id: "suitability_instrument:GLD", status: "fail" }),
        constraint({ id: "minimum_cash_weight", limit: "0.1" }),
        constraint({ id: "max_instrument_weight", limit: "0.4" }),
      ],
    }));
    expect(suitable.targetPortfolio?.positions.some((position) => position.symbol === "GLD")).toBe(false);
    expect(compare(suitable.targetPortfolio!.cashWeight, d("0.1"))).toBeGreaterThanOrEqual(0);
    expect(suitable.targetPortfolio!.positions.every((position) => compare(position.targetWeight, d("0.4")) <= 0)).toBe(true);

    const blocked = runInvestingEngineV1Final(buildPhase3FSources({
      cash: "0",
      positions: [phase3fPosition({ quantity: "20" })],
      constraints: [
        constraint({ id: "prohibit_instrument:AGGH" }),
        constraint({ id: "max_currency_weight:EUR", kind: "soft", limit: "0.2" }),
      ],
    }));
    expect(blocked.state).toBe("blocked");
    expect(blocked.hardConstraints.some((entry) => entry.status === "fail")).toBe(true);
    expect(blocked.softConstraints.length).toBeGreaterThan(0);
  });

  it("creates complete explanation, audit bundle and empty legacy shadow schema", () => {
    const result = runInvestingEngineV1Final(buildPhase3FSources());
    expect(result.explanation.nodes.map((node) => node.stableCode)).toEqual([
      "canonical_input", "portfolio_state", "data_quality", "risk_assessment", "policy_evaluation",
      "constraints", "feasible_envelope", "target_construction", "rebalance_candidates", "cost_evaluation",
      "liquidity_evaluation", "tax_awareness", "candidate_ranking", "selected_decision", "final_state",
    ]);
    expect(result.auditBundle.auditBundleHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.shadowPackage.status).toBe("awaiting_legacy_result");
    expect(result.shadowPackage.legacyResult).toBeNull();
    expect(result.shadowPackage.comparison.missingLegacyFields).toEqual([]);
  });
});
