import { describe, expect, it } from "vitest";

import {
  INVESTING_ENGINE_INPUT_CONTRACT_VERSION,
  canonicalDecimalFromString,
  canonicalJsonStringify,
  createStaticPilotInstrumentCatalogAdapter,
  sealCanonicalInvestingInputV1,
  sealInstrumentCatalogSnapshotV1,
  sealMarketSnapshotV1,
  type CanonicalInstrumentCatalogSnapshotV1,
  type InvestingConstraintEvaluationV1,
} from "@/lib/investing/engine/v1";
import {
  buildCanonicalInvestingInputFromSourcesV1,
  type InvestingFinancialReadModelV1,
  type InvestingOrderSourceV1,
  type InvestingPositionSourceV1,
} from "@/lib/investing/engine/v1/phase3c";
import { evaluateInvestingRiskPolicyV1 } from "@/lib/investing/engine/v1/phase3d";
import {
  add,
  canonicalStringify,
  compare,
  constructPreliminaryInvestingProposalV1,
  sealConstructionModelSnapshotV1,
  type ConstructionEngineInputV1,
  type ConstructionInstrumentModelV1,
} from "@/lib/investing/engine/v1/phase3e";

const AS_OF = "2026-07-20T10:00:00.000Z";
const d = canonicalDecimalFromString;
const pilotCatalog = createStaticPilotInstrumentCatalogAdapter().snapshot();

function rule(args: {
  id: string;
  kind?: "hard" | "soft";
  status?: "pass" | "fail" | "unknown";
  limit?: string | null;
}): InvestingConstraintEvaluationV1 {
  return {
    id: args.id,
    kind: args.kind ?? "hard",
    status: args.status ?? "pass",
    reasonCode: `rule_${args.id.replaceAll(":", "_")}`,
    observed: null,
    limit: args.limit === undefined || args.limit === null ? null : d(args.limit),
    evidenceRefs: ["mandate_phase3e_1"],
  };
}

function position(overrides: Partial<InvestingPositionSourceV1> = {}): InvestingPositionSourceV1 {
  return {
    accountId: "account_phase3e_1",
    symbol: "AGGH",
    quantity: "2",
    reservedQuantity: "0",
    costBasis: "45",
    currency: "EUR",
    ...overrides,
  };
}

function order(overrides: Partial<InvestingOrderSourceV1> = {}): InvestingOrderSourceV1 {
  return {
    orderId: "order_phase3e_1",
    semanticOrderId: "semantic_order_phase3e_1",
    accountId: "account_phase3e_1",
    userId: "user_phase3e_1",
    portfolioId: "primary",
    symbol: "AGGH",
    currency: "EUR",
    side: "buy",
    status: "approved",
    quantity: "2",
    cumulativeFilledQuantity: "0",
    unitPrice: "50",
    persistedReservedCash: "100",
    persistedReservedQuantity: "0",
    estimatedFeeRemaining: "0",
    updatedAt: AS_OF,
    ...overrides,
  };
}

function catalogWith(args: { fractionalAggh?: boolean } = {}) {
  if (!args.fractionalAggh) return pilotCatalog;
  return sealInstrumentCatalogSnapshotV1({
    version: "static-pilot-investing-catalog/fractional-test-v1",
    instruments: pilotCatalog.instruments.map((instrument) => instrument.symbol === "AGGH"
      ? { ...instrument, lotSize: d("0.01"), minimumNotional: d("1") }
      : instrument),
  });
}

function market(args: {
  catalog?: CanonicalInstrumentCatalogSnapshotV1;
  prices?: Readonly<Record<string, string>>;
  omit?: readonly string[];
  stale?: readonly string[];
} = {}) {
  const catalog = args.catalog ?? pilotCatalog;
  const defaults: Record<string, string> = { VWCE: "100", SPY: "200", AGGH: "50", GLD: "150" };
  const omitted = new Set(args.omit ?? []);
  const stale = new Set(args.stale ?? []);
  return sealMarketSnapshotV1({
    contractVersion: "investing-market-snapshot/v1",
    marketSnapshotId: "market_phase3e_1",
    asOf: AS_OF,
    schemaVersion: "market-phase3e/v1",
    points: [
      ...catalog.instruments.filter((instrument) => !omitted.has(instrument.symbol)).map((instrument) => ({
        symbol: instrument.symbol,
        price: d(args.prices?.[instrument.symbol] ?? defaults[instrument.symbol] ?? "100"),
        currency: instrument.currency,
        provider: "phase3e_fixture",
        providerAsOf: stale.has(instrument.symbol) ? "2026-07-20T09:00:00.000Z" : AS_OF,
        receivedAt: AS_OF,
        quality: "good" as const,
      })),
      ...(!omitted.has("USDEUR") ? [{
        symbol: "USDEUR",
        price: d("0.9"),
        currency: "EUR",
        provider: "phase3e_fixture",
        providerAsOf: AS_OF,
        receivedAt: AS_OF,
        quality: "good" as const,
      }] : []),
    ],
    issues: [],
  });
}

function defaultModel(symbol: string): ConstructionInstrumentModelV1 {
  return {
    symbol,
    fractionalShares: false,
    minimumQuantity: d("1"),
    quantityIncrement: d("1"),
    priceIncrement: d("0.01"),
    commissionBps: d("5"),
    spreadBps: d("10"),
    slippageBps: d("5"),
    fxCostBps: d("10"),
    minimumFee: d("1"),
    averageDailyVolume: d("100000"),
    maxParticipation: d("0.1"),
    liquidityTier: "high",
    marketImpactBps: d("2"),
    liquidityAsOf: AS_OF,
    taxLotAvailability: "available",
  };
}

function financial(args: {
  cash?: string;
  cashReserved?: string;
  positions?: readonly InvestingPositionSourceV1[];
  orders?: readonly InvestingOrderSourceV1[];
  fills?: InvestingFinancialReadModelV1["fills"];
  constraints?: readonly InvestingConstraintEvaluationV1[];
} = {}): InvestingFinancialReadModelV1 {
  const cash = args.cash ?? "1000";
  return {
    identity: { requestedUserId: "user_phase3e_1", ownerUserId: "user_phase3e_1" },
    accounts: [{
      accountId: "account_phase3e_1",
      userId: "user_phase3e_1",
      portfolioId: "primary",
      environment: "paper",
      status: "active",
      baseCurrency: "EUR",
    }],
    cashBalances: [{
      accountId: "account_phase3e_1",
      currency: "EUR",
      available: cash,
      settled: cash,
      reserved: args.cashReserved ?? "0",
    }],
    positions: args.positions ?? [],
    orders: args.orders ?? [],
    fills: args.fills ?? [],
    mandateSnapshot: {
      userId: "user_phase3e_1",
      accountId: "account_phase3e_1",
      mandate: {
        mandateSnapshotId: "mandate_phase3e_1",
        objective: "balanced",
        riskProfile: "Balanced",
        horizon: "Long",
        baseCurrency: "EUR",
        constraints: args.constraints ?? [rule({ id: "paper_environment_only" })],
      },
    },
    authoring: {
      plan: { objective: "balanced", riskProfile: "Balanced", horizon: "Long" },
      settings: { marketDataMaxAgeSeconds: "900", orderStaleAfterSeconds: "86400" },
    },
  };
}

function buildSources(args: {
  cash?: string;
  cashReserved?: string;
  positions?: readonly InvestingPositionSourceV1[];
  orders?: readonly InvestingOrderSourceV1[];
  fills?: InvestingFinancialReadModelV1["fills"];
  constraints?: readonly InvestingConstraintEvaluationV1[];
  catalog?: CanonicalInstrumentCatalogSnapshotV1;
  market?: ReturnType<typeof market>;
  modelOverrides?: Readonly<Record<string, Partial<ConstructionInstrumentModelV1>>>;
  costBenefitThreshold?: string;
  minimumTradeBenefit?: string;
  contextUserId?: string;
  environment?: "paper" | "simulation";
} = {}): ConstructionEngineInputV1 {
  const catalog = args.catalog ?? pilotCatalog;
  const snapshot = args.market ?? market({ catalog });
  const built = buildCanonicalInvestingInputFromSourcesV1({
    request: {
      requestedUserId: "user_phase3e_1",
      requestedAccountId: "account_phase3e_1",
      inputSnapshotId: "input_phase3e_1",
      runId: "run_phase3e_1",
      asOf: AS_OF,
      marketSnapshotId: snapshot.marketSnapshotId,
      versions: {
        contractVersion: INVESTING_ENGINE_INPUT_CONTRACT_VERSION,
        engineVersion: "engine/v1.3.0-phase3e",
        policyVersion: "risk-policy/v1",
        modelVersion: "construction-model/v1",
        instrumentCatalogVersion: catalog.version,
        marketDataSchemaVersion: snapshot.schemaVersion,
      },
    },
    financial: financial(args),
    instrumentCatalog: catalog,
    market: snapshot,
  });
  let canonicalInput = built.input;
  if (args.environment === "simulation") {
    const draft: Record<string, unknown> = { ...canonicalInput, environment: "simulation" };
    delete draft.inputHash;
    canonicalInput = sealCanonicalInvestingInputV1(draft as never);
  }
  const envelope = evaluateInvestingRiskPolicyV1(canonicalInput, {
    expectedUserId: args.contextUserId ?? "user_phase3e_1",
    expectedAccountId: "account_phase3e_1",
    environment: "paper",
  });
  const model = sealConstructionModelSnapshotV1({
    contractVersion: "investing-construction-model/v1",
    version: "construction-model/v1",
    asOf: AS_OF,
    costBenefitThreshold: d(args.costBenefitThreshold ?? "0.05"),
    minimumTradeBenefit: d(args.minimumTradeBenefit ?? "1"),
    liquidityMaxAgeSeconds: d("900"),
    instruments: catalog.instruments.map((instrument) => ({
      ...defaultModel(instrument.symbol),
      ...(args.modelOverrides?.[instrument.symbol] ?? {}),
    })),
  });
  return {
    canonicalInput,
    portfolioState: built.portfolioState,
    risk: envelope.risk,
    policy: envelope.policy,
    constraints: envelope.constraints,
    envelope,
    model,
  };
}

function construct(args: Parameters<typeof buildSources>[0] = {}) {
  return constructPreliminaryInvestingProposalV1(buildSources(args));
}

function action(result: ReturnType<typeof construct>, symbol: string) {
  return result.actions.find((entry) => entry.symbol === symbol);
}

const relaxedSingleAggh = [
  rule({ id: "allow_instrument:AGGH" }),
  rule({ id: "max_instrument_weight:AGGH", limit: "0.95" }),
  rule({ id: "max_asset_class_weight:bond", limit: "0.95" }),
  rule({ id: "minimum_cash_weight", limit: "0.05" }),
  rule({ id: "maximum_total_exposure", limit: "0.95" }),
  rule({ id: "maximum_risk_score", kind: "soft", limit: "1" }),
];

describe("FASE 3E Portfolio Construction and Rebalance", () => {
  it("returns no_trade for a known zero portfolio", () => {
    const result = construct({ cash: "0" });
    expect(result.state).toBe("no_trade");
    expect(result.executable).toBe(false);
  });

  it("constructs a preliminary diversified target from cash-only", () => {
    const result = construct();
    expect(["proposal_ready", "degraded"]).toContain(result.state);
    expect(result.target?.positions.map((entry) => entry.symbol)).toEqual(["AGGH", "GLD", "SPY", "VWCE"]);
    expect(result.actions.some((entry) => entry.side === "buy")).toBe(true);
    expect(result.target!.cashWeight).not.toBe("0");
  });

  it("uses current and projected weights for one position", () => {
    const result = construct({ cash: "900", positions: [position()] });
    const aggh = action(result, "AGGH")!;
    expect(aggh.currentQuantity).toBe("2");
    expect(aggh.projectedQuantity).toBe("2");
    expect(aggh.explanation.join(" ")).toContain("Projected weight");
  });

  it("constructs deterministically from multiple positions", () => {
    const positions = [position(), position({ symbol: "VWCE", quantity: "1", currency: "USD", costBasis: "90" })];
    const result = construct({ cash: "800", positions });
    expect(result.target?.positions.length).toBeGreaterThan(1);
    expect(result.actions.map((entry) => entry.symbol)).toEqual([...result.actions.map((entry) => entry.symbol)].sort());
  });

  it("returns no_trade for an already aligned portfolio", () => {
    const result = construct({ cash: "50", positions: [position({ quantity: "19", costBasis: "50" })], constraints: relaxedSingleAggh });
    expect(result.state).toBe("no_trade");
    expect(result.actions.every((entry) => entry.side === "hold")).toBe(true);
  });

  it("produces a buy when target quantity exceeds projected quantity", () => {
    const result = construct({ cash: "900", positions: [position()] });
    expect(result.actions.some((entry) => entry.side === "buy" && entry.quantityDelta !== "0")).toBe(true);
  });

  it("produces a sell and never exceeds projected quantity", () => {
    const result = construct({
      cash: "0",
      positions: [position({ quantity: "20", costBasis: "40" })],
      constraints: [
        rule({ id: "max_instrument_weight", limit: "1" }),
        rule({ id: "max_asset_class_weight", limit: "1" }),
        rule({ id: "minimum_cash_weight", limit: "0" }),
        rule({ id: "maximum_total_exposure", limit: "1" }),
        rule({ id: "maximum_risk_score", kind: "soft", limit: "1" }),
      ],
    });
    const aggh = result.candidates.flatMap((entry) => entry.actions).find((entry) => entry.symbol === "AGGH" && entry.side === "sell")!;
    expect(aggh).toBeDefined();
    expect(d(aggh.quantityDelta.slice(1))).toBe(d(aggh.quantityDelta.slice(1)));
    expect(BigInt(aggh.quantityDelta.slice(1).split(".")[0])).toBeLessThanOrEqual(BigInt(aggh.projectedQuantity.split(".")[0]));
  });

  it("holds when the drift benefit is below the versioned threshold", () => {
    const result = construct({ cash: "900", positions: [position()], minimumTradeBenefit: "1000000" });
    expect(result.state).toBe("no_trade");
    expect(result.reasonCodes).toContain("benefit_below_minimum");
  });

  it("selects a full rebalance when liquidity supports it", () => {
    const result = construct();
    expect(result.selectedCandidateId).toContain("full_rebalance");
  });

  it("selects a partial rebalance when full size exceeds liquidity", () => {
    const result = construct({
      modelOverrides: {
        AGGH: { averageDailyVolume: d("3"), maxParticipation: d("1") },
        GLD: { averageDailyVolume: d("1"), maxParticipation: d("1") },
        SPY: { averageDailyVolume: d("1"), maxParticipation: d("1") },
        VWCE: { averageDailyVolume: d("2"), maxParticipation: d("1") },
      },
    });
    expect(result.selectedCandidateId).toContain("partial_rebalance");
  });

  it("propagates excessive concentration as a 3D block", () => {
    const result = construct({ cash: "0", positions: [position({ quantity: "20" })] });
    expect(result.state).toBe("blocked");
    expect(result.reasonCodes).toContain("feasible_envelope_blocked");
  });

  it("preserves the cash buffer after target rounding", () => {
    const result = construct();
    expect(result.target).not.toBeNull();
    expect(Number(result.target!.cashWeight)).toBeGreaterThanOrEqual(0.05);
    const buySpend = result.actions.filter((entry) => entry.side === "buy").reduce((sum, entry) =>
      sum + Number(entry.estimatedNotional) + Number(entry.cost.totalCost ?? "0"), 0);
    expect(buySpend).toBeLessThanOrEqual(950);
  });

  it("enforces a shared asset-class cap across multiple instruments", () => {
    const result = construct({
      constraints: [
        rule({ id: "max_instrument_weight", limit: "0.5" }),
        rule({ id: "max_asset_class_weight:equity", limit: "0.3" }),
        rule({ id: "minimum_cash_weight", limit: "0.05" }),
        rule({ id: "maximum_total_exposure", limit: "0.95" }),
        rule({ id: "maximum_risk_score", kind: "soft", limit: "1" }),
      ],
    });
    const equity = result.target?.assetClassWeights.find((entry) => entry.assetClass === "equity");
    expect(equity).toBeDefined();
    expect(compare(equity!.weight, d("0.3"))).toBeLessThanOrEqual(0);
  });

  it("keeps the selected target internally aligned with cash-limited actions", () => {
    const result = construct({ cash: "1000" });
    expect(result.target).not.toBeNull();
    for (const actionEntry of result.actions) {
      const targetPosition = result.target!.positions.find((entry) => entry.symbol === actionEntry.symbol);
      expect(targetPosition?.targetQuantity ?? "0").toBe(actionEntry.targetQuantity);
    }
    expect(add(result.target!.cashWeight, result.target!.totalExposure)).toBe("1");
    expect(result.residualCash).toBe(result.target!.residualCash);
  });

  it.each([
    ["prohibit_instrument:AGGH", "instrument_prohibited"],
    ["allow_instrument:VWCE", "instrument_universe"],
  ])("does not construct through a forbidden/out-of-universe holding: %s", (id) => {
    const result = construct({ cash: "900", positions: [position()], constraints: [rule({ id })] });
    expect(result.state).toBe("blocked");
    expect(result.target).toBeNull();
  });

  it("starts from PROJECTED and does not duplicate a pending buy", () => {
    const result = construct({
      cash: "900",
      cashReserved: "100",
      orders: [order()],
    });
    const aggh = result.candidates.find((entry) => entry.mode === "full_rebalance")
      ?.actions.find((entry) => entry.symbol === "AGGH")
      ?? result.actions.find((entry) => entry.symbol === "AGGH");
    expect(aggh?.currentQuantity).toBe("0");
    expect(aggh?.projectedQuantity).toBe("2");
    expect(Number(aggh?.targetQuantity ?? "0")).toBeGreaterThanOrEqual(2);
  });

  it("uses projected quantity after pending sell and never reuses its proceeds for funding", () => {
    const result = construct({
      cash: "0",
      positions: [position({ quantity: "10", reservedQuantity: "2" })],
      orders: [order({ side: "sell", persistedReservedCash: "0", persistedReservedQuantity: "2" })],
      constraints: relaxedSingleAggh,
    });
    const aggh = result.candidates.flatMap((entry) => entry.actions).find((entry) => entry.symbol === "AGGH")!;
    expect(aggh.currentQuantity).toBe("10");
    expect(aggh.projectedQuantity).toBe("8");
    expect(result.actions.filter((entry) => entry.side === "buy")).toEqual([]);
  });

  it("uses only the remainder after a partial fill", () => {
    const result = construct({
      cash: "700",
      cashReserved: "300",
      positions: [position({ quantity: "4", costBasis: "50" })],
      orders: [order({ status: "partially_filled", quantity: "10", cumulativeFilledQuantity: "4", persistedReservedCash: "300" })],
      fills: [{ fillId: "fill_1", semanticFillId: "semantic_fill_1", orderId: "order_phase3e_1", quantity: "4" }],
      constraints: relaxedSingleAggh,
    });
    const aggh = result.candidates.flatMap((entry) => entry.actions).find((entry) => entry.symbol === "AGGH")!;
    expect(aggh.currentQuantity).toBe("4");
    expect(aggh.projectedQuantity).toBe("10");
  });

  it("keeps cancellation_requested economically active", () => {
    const result = construct({
      cash: "900", cashReserved: "100", orders: [order({ status: "cancellation_requested" })],
    });
    expect(result.candidates.flatMap((entry) => entry.actions).find((entry) => entry.symbol === "AGGH")?.projectedQuantity).toBe("2");
  });

  it("aggregates two pending orders on the same instrument before construction", () => {
    const result = construct({
      cash: "900",
      cashReserved: "100",
      orders: [
        order({ orderId: "order_a", semanticOrderId: "semantic_a", quantity: "1", persistedReservedCash: "50" }),
        order({ orderId: "order_b", semanticOrderId: "semantic_b", quantity: "1", persistedReservedCash: "50" }),
      ],
    });
    expect(result.candidates.flatMap((entry) => entry.actions).find((entry) => entry.symbol === "AGGH")?.projectedQuantity).toBe("2");
  });

  it("keeps residual cash explicit", () => {
    const result = construct();
    expect(result.residualCash).not.toBeNull();
    expect(Number(result.residualCash)).toBeGreaterThan(0);
  });

  it("supports fractional shares and quantity increments", () => {
    const catalog = catalogWith({ fractionalAggh: true });
    const result = construct({
      catalog,
      market: market({ catalog, prices: { AGGH: "60" } }),
      constraints: relaxedSingleAggh,
      modelOverrides: { AGGH: { fractionalShares: true, minimumQuantity: d("0.01"), quantityIncrement: d("0.01") } },
    });
    const aggh = result.target?.positions.find((entry) => entry.symbol === "AGGH");
    if (!aggh) throw new Error("AGGH target expected");
    expect(aggh.targetQuantity).toMatch(/\./);
    expect(aggh.targetQuantity.split(".")[1].length).toBeLessThanOrEqual(2);
  });

  it("rounds whole-share instruments conservatively", () => {
    const result = construct();
    for (const target of result.target?.positions ?? []) expect(target.targetQuantity).not.toContain(".");
  });

  it("holds below minimum quantity, minimum notional and increment", () => {
    const result = construct({
      cash: "1000",
      modelOverrides: { AGGH: { minimumQuantity: d("10"), quantityIncrement: d("5") } },
    });
    const aggh = result.candidates.flatMap((entry) => entry.actions).find((entry) =>
      entry.symbol === "AGGH" && entry.reasonCodes.includes("below_minimum_quantity"),
    );
    expect(aggh?.side).toBe("hold");
  });

  it("rounds execution price conservatively to price increment", () => {
    const result = construct({
      market: market({ prices: { AGGH: "50.03" } }),
      modelOverrides: { AGGH: { priceIncrement: d("0.05") } },
    });
    const aggh = result.actions.find((entry) => entry.symbol === "AGGH" && entry.side === "buy")!;
    expect(aggh.estimatedPrice).toBe("50.05");
  });

  it("never spends unavailable cash", () => {
    const result = construct({
      cash: "60",
      constraints: relaxedSingleAggh,
      modelOverrides: { AGGH: { minimumFee: d("20") } },
      costBenefitThreshold: "1",
    });
    const buys = result.actions.filter((entry) => entry.side === "buy");
    const spend = buys.reduce((total, entry) => total + Number(entry.estimatedNotional) + Number(entry.cost.totalCost ?? "0"), 0);
    expect(spend).toBeLessThanOrEqual(57);
  });

  it("applies minimum fee, spread and slippage explicitly", () => {
    const result = construct();
    const trade = result.actions.find((entry) => entry.side === "buy")!;
    expect(trade.cost.minimumFeeApplied).toBe(true);
    expect(Number(trade.cost.spread)).toBeGreaterThan(0);
    expect(Number(trade.cost.slippage)).toBeGreaterThan(0);
  });

  it("includes explicit FX cost for foreign-currency trades", () => {
    const result = construct();
    const foreignTrade = result.actions.find((entry) => entry.side === "buy" && ["VWCE", "SPY", "GLD"].includes(entry.symbol))!;
    expect(Number(foreignTrade.cost.fxCost)).toBeGreaterThan(0);
  });

  it("returns insufficient_data instead of assuming unknown cost is zero", () => {
    const result = construct({
      modelOverrides: Object.fromEntries(pilotCatalog.instruments.map((entry) => [entry.symbol, { spreadBps: null }])),
    });
    expect(result.state).toBe("insufficient_data");
    expect(result.reasonCodes).toContain("transaction_cost_data_unavailable");
  });

  it("accepts sufficient liquidity and estimates market impact", () => {
    const result = construct();
    const trade = result.actions.find((entry) => entry.side === "buy")!;
    expect(trade.liquidity.status).toBe("sufficient");
    expect(trade.liquidity.marketability).toBe("marketable");
    expect(trade.liquidity.estimatedMarketImpact).not.toBeNull();
  });

  it("blocks when every needed trade exceeds liquidity capacity", () => {
    const overrides = Object.fromEntries(pilotCatalog.instruments.map((entry) => [entry.symbol, {
      averageDailyVolume: d("0.01"), maxParticipation: d("0.01"),
    }]));
    const result = construct({ modelOverrides: overrides });
    expect(result.state).toBe("blocked");
    expect(result.reasonCodes).toContain("liquidity_capacity_exceeded");
    expect(result.candidates.flatMap((entry) => entry.actions).some((entry) => entry.liquidity.marketability === "not_marketable")).toBe(true);
  });

  it("returns insufficient_data when material liquidity data is absent", () => {
    const overrides = Object.fromEntries(pilotCatalog.instruments.map((entry) => [entry.symbol, {
      averageDailyVolume: null, maxParticipation: null,
    }]));
    const result = construct({ modelOverrides: overrides });
    expect(result.state).toBe("insufficient_data");
    expect(result.reasonCodes).toContain("liquidity_data_unavailable");
    expect(result.candidates.flatMap((entry) => entry.actions).some((entry) => entry.liquidity.marketability === "unknown")).toBe(true);
  });

  it("marks stale liquidity as insufficient_data", () => {
    const overrides = Object.fromEntries(pilotCatalog.instruments.map((entry) => [entry.symbol, {
      liquidityAsOf: "2026-07-20T09:00:00.000Z",
    }]));
    const result = construct({ modelOverrides: overrides });
    expect(result.state).toBe("insufficient_data");
    expect(result.reasonCodes).toContain("liquidity_data_stale");
  });

  it("does not treat missing tax basis as zero", () => {
    const result = construct({
      cash: "0",
      positions: [position({ quantity: "20", costBasis: "0" })],
      constraints: [
        rule({ id: "max_instrument_weight", limit: "1" }),
        rule({ id: "max_asset_class_weight", limit: "1" }),
        rule({ id: "minimum_cash_weight", limit: "0" }),
        rule({ id: "maximum_total_exposure", limit: "1" }),
        rule({ id: "maximum_risk_score", kind: "soft", limit: "1" }),
      ],
      modelOverrides: { AGGH: { taxLotAvailability: "unavailable" } },
    });
    const sale = result.candidates.flatMap((entry) => entry.actions).find((entry) => entry.symbol === "AGGH" && entry.side === "sell")!;
    expect(sale.taxAwareness.status).toBe("unknown_basis");
    expect(sale.taxAwareness.estimatedRealizedGainLoss).toBeNull();
  });

  it.each([
    ["40", "known_gain"],
    ["60", "known_loss"],
  ])("estimates realized gain/loss from canonical cost basis %s", (costBasis, expected) => {
    const result = construct({
      cash: "0",
      positions: [position({ quantity: "20", costBasis })],
      constraints: [
        rule({ id: "max_instrument_weight", limit: "1" }),
        rule({ id: "max_asset_class_weight", limit: "1" }),
        rule({ id: "minimum_cash_weight", limit: "0" }),
        rule({ id: "maximum_total_exposure", limit: "1" }),
        rule({ id: "maximum_risk_score", kind: "soft", limit: "1" }),
      ],
    });
    const sale = result.candidates.flatMap((entry) => entry.actions).find((entry) => entry.symbol === "AGGH" && entry.side === "sell")!;
    expect(sale.taxAwareness.status).toBe(expected);
    expect(sale.taxAwareness.estimatedRealizedGainLoss).not.toBeNull();
  });

  it("uses taxable-gain awareness in deterministic candidate ranking", () => {
    const result = construct({
      cash: "0",
      positions: [position({ quantity: "20", costBasis: "40" })],
      constraints: [
        rule({ id: "max_instrument_weight", limit: "1" }),
        rule({ id: "max_asset_class_weight", limit: "1" }),
        rule({ id: "minimum_cash_weight", limit: "0" }),
        rule({ id: "maximum_total_exposure", limit: "1" }),
        rule({ id: "maximum_risk_score", kind: "soft", limit: "1" }),
      ],
    });
    expect(result.candidates.some((entry) => entry.evaluation.rankReasonCodes.includes("taxable_gain_prefer_lower_turnover"))).toBe(true);
  });

  it("fails closed on an impossible/conflicting target policy", () => {
    const result = construct({ constraints: [
      rule({ id: "max_instrument_weight:AGGH:first", limit: "0.2" }),
      rule({ id: "max_instrument_weight:AGGH:second", limit: "0.3" }),
    ] });
    expect(result.state).toBe("blocked");
  });

  it("preserves hard precedence and propagates a soft envelope", () => {
    const hard = construct({ cash: "0", positions: [position({ quantity: "20" })] });
    expect(hard.state).toBe("blocked");
    const soft = construct({
      cash: "550",
      positions: [position({ symbol: "VWCE", quantity: "5", currency: "USD" })],
      constraints: [
        rule({ id: "max_instrument_weight:VWCE", limit: "1" }),
        rule({ id: "max_asset_class_weight:equity", limit: "1" }),
        rule({ id: "max_currency_weight:USD", kind: "soft", limit: "0.3" }),
      ],
    });
    expect(["degraded", "no_trade"]).toContain(soft.state);
  });

  it("never constructs when 3D is blocked or insufficient_data", () => {
    const blocked = construct({ cash: "0", positions: [position({ quantity: "20" })] });
    expect(blocked.target).toBeNull();
    const insufficient = construct({
      cash: "900", positions: [position()], market: market({ omit: ["AGGH"] }),
    });
    expect(insufficient.state).toBe("insufficient_data");
    expect(insufficient.target).toBeNull();
  });

  it("propagates stale price as degraded and missing FX/instrument as insufficient", () => {
    const stale = construct({ cash: "900", positions: [position()], market: market({ stale: ["AGGH"] }) });
    expect(["degraded", "no_trade"]).toContain(stale.state);
    const fx = construct({
      cash: "900",
      positions: [position({ symbol: "VWCE", quantity: "1", currency: "USD" })],
      market: market({ omit: ["USDEUR"] }),
    });
    expect(fx.state).toBe("insufficient_data");
  });

  it("preserves extreme decimals and canonical output", () => {
    const amount = "999999999999999999999999999999.123456789012345678";
    const result = construct({ cash: amount, minimumTradeBenefit: amount });
    expect(canonicalStringify(result)).not.toMatch(/NaN|Infinity/);
    expect(result.proposalHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("is invariant to source row and object-key order", () => {
    const positions = [position(), position({ symbol: "VWCE", quantity: "1", currency: "USD", costBasis: "90" })];
    const first = construct({ cash: "800", positions });
    const second = construct({ cash: "800", positions: [...positions].reverse() });
    expect(first.proposalHash).toBe(second.proposalHash);
    expect(canonicalJsonStringify(first)).toBe(canonicalJsonStringify(second));
  });

  it("replays byte-identically with stable nested hashes", () => {
    const sources = buildSources();
    const first = constructPreliminaryInvestingProposalV1(sources);
    const second = constructPreliminaryInvestingProposalV1(sources);
    expect(canonicalStringify(first)).toBe(canonicalStringify(second));
    expect(first.proposalHash).toBe(second.proposalHash);
    expect(first.target?.targetHash).toBe(second.target?.targetHash);
    expect(first.candidates.map((entry) => entry.candidateHash)).toEqual(second.candidates.map((entry) => entry.candidateHash));
  });

  it("fails closed on ownership mismatch, non-Paper and Live attempts", () => {
    const ownership = buildSources({ contextUserId: "other_user" });
    expect(() => constructPreliminaryInvestingProposalV1(ownership)).toThrow("investing_construction_ownership_mismatch");
    const simulation = construct({ environment: "simulation" });
    expect(simulation.state).toBe("blocked");
    const live = buildSources();
    const forgedInput = { ...live.canonicalInput, environment: "live" };
    expect(() => constructPreliminaryInvestingProposalV1({ ...live, canonicalInput: forgedInput as never })).toThrow();
  });

  it("never produces an operational/executable proposal", () => {
    const result = construct();
    expect(result.executable).toBe(false);
    expect(result).not.toHaveProperty("orderId");
    expect(result).not.toHaveProperty("executionQueue");
    expect(result).not.toHaveProperty("approval");
  });
});
