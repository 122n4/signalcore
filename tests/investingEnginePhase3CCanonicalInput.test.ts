import { describe, expect, it } from "vitest";

import {
  INVESTING_ENGINE_INPUT_CONTRACT_VERSION,
  FixtureMarketSnapshotPort,
  canonicalDecimalFromString,
  canonicalJsonStringify,
  createStaticPilotInstrumentCatalogAdapter,
  sealMarketSnapshotV1,
  type CanonicalMarketSnapshotV1,
} from "@/lib/investing/engine/v1";
import {
  CanonicalInvestingInputBuilderV1,
  INVESTING_ORDER_STATE_SEMANTICS_V1,
  InMemoryInvestingCanonicalSourceRepositoryV1,
  buildCanonicalInvestingInputFromSourcesV1,
  decimalAdd,
  decimalMultiply,
  type CanonicalInputBuildSourcesV1,
  type InvestingFillSourceV1,
  type InvestingFinancialReadModelV1,
  type InvestingOrderSourceV1,
  type InvestingPositionSourceV1,
} from "@/lib/investing/engine/v1/phase3c";

const AS_OF = "2026-07-20T10:00:00.000Z";
const d = canonicalDecimalFromString;
const catalogPort = createStaticPilotInstrumentCatalogAdapter();
const catalog = catalogPort.snapshot();

function market(args: {
  omit?: readonly string[];
  stale?: readonly string[];
  extras?: CanonicalMarketSnapshotV1["points"];
} = {}) {
  const omitted = new Set(args.omit ?? []);
  const stale = new Set(args.stale ?? []);
  const points: CanonicalMarketSnapshotV1["points"] = [
    ...catalog.instruments
      .filter((instrument) => !omitted.has(instrument.symbol))
      .map((instrument, index) => ({
        symbol: instrument.symbol,
        price: d(String([100, 200, 50, 150][index])),
        currency: instrument.currency,
        provider: "phase3c_fixture",
        providerAsOf: stale.has(instrument.symbol) ? "2026-07-20T09:00:00.000Z" : AS_OF,
        receivedAt: AS_OF,
        quality: "good" as const,
      })),
    ...(!omitted.has("USDEUR")
      ? [{
          symbol: "USDEUR",
          price: d("0.9"),
          currency: "EUR",
          provider: "phase3c_fixture",
          providerAsOf: stale.has("USDEUR") ? "2026-07-20T09:00:00.000Z" : AS_OF,
          receivedAt: AS_OF,
          quality: "good" as const,
        }]
      : []),
    ...(args.extras ?? []),
  ];
  return sealMarketSnapshotV1({
    contractVersion: "investing-market-snapshot/v1",
    marketSnapshotId: "market_phase3c_1",
    asOf: AS_OF,
    schemaVersion: "market-phase3c/v1",
    points,
    issues: [],
  });
}

function position(overrides: Partial<InvestingPositionSourceV1> = {}): InvestingPositionSourceV1 {
  return {
    accountId: "account_phase3c_1",
    symbol: "AGGH",
    quantity: "10",
    reservedQuantity: "0",
    costBasis: "45",
    currency: "EUR",
    ...overrides,
  };
}

function order(overrides: Partial<InvestingOrderSourceV1> = {}): InvestingOrderSourceV1 {
  return {
    orderId: "order_phase3c_1",
    semanticOrderId: "semantic_order_1",
    accountId: "account_phase3c_1",
    userId: "user_phase3c_1",
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

function fill(overrides: Partial<InvestingFillSourceV1> = {}): InvestingFillSourceV1 {
  return {
    fillId: "fill_phase3c_1",
    semanticFillId: "semantic_fill_1",
    orderId: "order_phase3c_1",
    quantity: "4",
    ...overrides,
  };
}

function financial(overrides: Partial<InvestingFinancialReadModelV1> = {}): InvestingFinancialReadModelV1 {
  return {
    identity: { requestedUserId: "user_phase3c_1", ownerUserId: "user_phase3c_1" },
    accounts: [{
      accountId: "account_phase3c_1",
      userId: "user_phase3c_1",
      portfolioId: "primary",
      environment: "paper",
      status: "active",
      baseCurrency: "EUR",
    }],
    cashBalances: [{
      accountId: "account_phase3c_1",
      currency: "EUR",
      available: "1000",
      settled: "1000",
      reserved: "0",
    }],
    positions: [],
    orders: [],
    fills: [],
    mandateSnapshot: {
      userId: "user_phase3c_1",
      accountId: "account_phase3c_1",
      mandate: {
        mandateSnapshotId: "mandate_phase3c_1",
        objective: "balanced",
        riskProfile: "Balanced",
        horizon: "Long",
        baseCurrency: "EUR",
        constraints: [{
          id: "paper_environment_only",
          kind: "hard",
          status: "pass",
          reasonCode: "paper_environment_confirmed",
          observed: null,
          limit: null,
          evidenceRefs: ["account_phase3c_1"],
        }],
      },
    },
    authoring: {
      plan: { objective: "balanced", riskProfile: "Balanced", horizon: "Long" },
      settings: { marketDataMaxAgeSeconds: "900", orderStaleAfterSeconds: "86400" },
    },
    ...overrides,
  };
}

function sources(overrides: {
  financial?: InvestingFinancialReadModelV1;
  market?: CanonicalMarketSnapshotV1;
} = {}): CanonicalInputBuildSourcesV1 {
  const snapshot = overrides.market ?? market();
  return {
    request: {
      requestedUserId: "user_phase3c_1",
      requestedAccountId: "account_phase3c_1",
      inputSnapshotId: "input_phase3c_1",
      runId: "run_phase3c_1",
      asOf: AS_OF,
      marketSnapshotId: snapshot.marketSnapshotId,
      versions: {
        contractVersion: INVESTING_ENGINE_INPUT_CONTRACT_VERSION,
        engineVersion: "engine/v1.1.0-phase3c",
        policyVersion: "portfolio-state-policy/v1",
        modelVersion: "portfolio-state-model/v1",
        instrumentCatalogVersion: catalog.version,
        marketDataSchemaVersion: snapshot.schemaVersion,
      },
    },
    financial: overrides.financial ?? financial(),
    instrumentCatalog: catalog,
    market: snapshot,
  };
}

function build(overrides: Parameters<typeof sources>[0] = {}) {
  return buildCanonicalInvestingInputFromSourcesV1(sources(overrides));
}

function codes(result: ReturnType<typeof build>) {
  return result.input.quality.issues.map((entry) => entry.code);
}

describe("FASE 3C canonical input and portfolio state", () => {
  it("defines explicit semantics for every required order state", () => {
    expect(Object.keys(INVESTING_ORDER_STATE_SEMANTICS_V1)).toEqual([
      "proposed", "approved", "submitting", "submitted", "partially_filled", "reconciling",
      "cancellation_requested", "cancelled", "submission_failed", "rejected", "filled", "reconciled",
    ]);
    expect(INVESTING_ORDER_STATE_SEMANTICS_V1.cancellation_requested.entersReserved).toBe(true);
    expect(INVESTING_ORDER_STATE_SEMANTICS_V1.cancelled.terminal).toBe(true);
  });

  it("builds an empty portfolio deterministically", () => {
    const first = build();
    const second = build();
    expect(canonicalJsonStringify(first.input)).toBe(canonicalJsonStringify(second.input));
    expect(first.input.inputHash).toBe(second.input.inputHash);
    expect(first.input.actual.positions).toEqual([]);
    expect(first.input.projected.positions).toEqual([]);
    expect(first.input.quality.status).toBe("good");
  });

  it("represents cash-only actual and projected state without duplication", () => {
    const result = build();
    expect(result.input.actual.cash[0]).toMatchObject({ available: "1000", settled: "1000", reserved: "0" });
    expect(result.input.projected.cash[0]).toMatchObject({ available: "1000", reserved: "0" });
    expect(result.portfolioState.actual.valuation.totalValueInBase).toBe("1000");
  });

  it("values one factual position from the sealed market snapshot", () => {
    const result = build({ financial: financial({ positions: [position()] }) });
    expect(result.input.actual.positions[0].quantity).toBe("10");
    expect(result.portfolioState.actual.valuation.positions[0]).toMatchObject({
      symbol: "AGGH",
      marketPrice: "50",
      baseMarketValue: "500",
      exposure: "0.333333333333333333",
    });
  });

  it("sorts and values multiple positions deterministically", () => {
    const result = build({ financial: financial({ positions: [
      position({ symbol: "VWCE", quantity: "1", costBasis: "90", currency: "USD" }),
      position(),
    ] }) });
    expect(result.input.actual.positions.map((entry) => entry.symbol)).toEqual(["AGGH", "VWCE"]);
    expect(result.portfolioState.actual.valuation.positionValueInBase).toBe("590");
  });

  it("reserves and projects a pending buy exactly once", () => {
    const readModel = financial({
      cashBalances: [{ accountId: "account_phase3c_1", currency: "EUR", available: "900", settled: "1000", reserved: "100" }],
      orders: [order()],
    });
    const result = build({ financial: readModel });
    expect(result.portfolioState.reserved.cash[0]).toMatchObject({ persisted: "100", economic: "100", effective: "100" });
    expect(result.input.projected.cash[0].available).toBe("900");
    expect(result.input.projected.positions[0].quantity).toBe("2");
    expect(result.input.pendingOrders).toHaveLength(1);
  });

  it("reserves quantity and projects a pending sell", () => {
    const sell = order({ side: "sell", persistedReservedCash: "0", persistedReservedQuantity: "2" });
    const result = build({ financial: financial({ positions: [position({ reservedQuantity: "2" })], orders: [sell] }) });
    expect(result.portfolioState.reserved.positions[0]).toMatchObject({ persisted: "2", economic: "2", effective: "2" });
    expect(result.input.projected.positions[0].quantity).toBe("8");
    expect(result.input.projected.cash[0].available).toBe("1100");
  });

  it("uses only the unfilled remainder for a partially filled buy", () => {
    const partial = order({
      status: "partially_filled", quantity: "10", cumulativeFilledQuantity: "4", persistedReservedCash: "300",
    });
    const result = build({ financial: financial({
      cashBalances: [{ accountId: "account_phase3c_1", currency: "EUR", available: "700", settled: "1000", reserved: "300" }],
      positions: [position({ quantity: "4", reservedQuantity: "0", costBasis: "50" })],
      orders: [partial],
      fills: [fill()],
    }) });
    expect(result.portfolioState.reserved.orders[0].remainingQuantity).toBe("6");
    expect(result.input.projected.positions[0].quantity).toBe("10");
    expect(result.input.projected.cash[0].available).toBe("700");
  });

  it("uses only the unfilled remainder for a partially filled sell", () => {
    const partial = order({
      side: "sell", status: "partially_filled", quantity: "10", cumulativeFilledQuantity: "4",
      persistedReservedCash: "0", persistedReservedQuantity: "6",
    });
    const result = build({ financial: financial({
      positions: [position({ quantity: "6", reservedQuantity: "6" })], orders: [partial], fills: [fill()],
    }) });
    expect(result.portfolioState.reserved.orders[0].remainingQuantity).toBe("6");
    expect(result.input.projected.positions[0].quantity).toBe("0");
    expect(result.input.projected.cash[0].available).toBe("1300");
  });

  it("aggregates two orders for the same instrument deterministically", () => {
    const orders = [
      order({ orderId: "order_b", semanticOrderId: "semantic_b", quantity: "1", persistedReservedCash: "50" }),
      order({ orderId: "order_a", semanticOrderId: "semantic_a", quantity: "1", persistedReservedCash: "50" }),
    ];
    const result = build({ financial: financial({
      cashBalances: [{ accountId: "account_phase3c_1", currency: "EUR", available: "900", settled: "1000", reserved: "100" }],
      orders,
    }) });
    expect(result.input.pendingOrders.map((entry) => entry.orderId)).toEqual(["order_a", "order_b"]);
    expect(result.input.projected.positions[0].quantity).toBe("2");
    expect(result.input.projected.cash[0].available).toBe("900");
  });

  it.each(["cancelled", "submission_failed", "rejected", "filled", "reconciled"])(
    "does not project terminal order state %s",
    (status) => {
      const terminal = order({
        status,
        cumulativeFilledQuantity: status === "filled" ? "2" : "0",
        persistedReservedCash: "0",
      });
      const result = build({ financial: financial({ orders: [terminal] }) });
      expect(result.input.pendingOrders).toEqual([]);
      expect(result.input.projected.cash[0].available).toBe("1000");
      expect(result.input.projected.positions).toEqual([]);
    },
  );

  it("keeps cancellation_requested reserved until cancellation is confirmed", () => {
    const result = build({ financial: financial({
      cashBalances: [{ accountId: "account_phase3c_1", currency: "EUR", available: "900", settled: "1000", reserved: "100" }],
      orders: [order({ status: "cancellation_requested" })],
    }) });
    expect(result.input.pendingOrders).toHaveLength(1);
    expect(result.input.projected.cash[0].available).toBe("900");
  });

  it("degrades stale and reconciling orders without releasing their reservation", () => {
    const result = build({ financial: financial({
      cashBalances: [{ accountId: "account_phase3c_1", currency: "EUR", available: "900", settled: "1000", reserved: "100" }],
      orders: [order({ status: "reconciling", updatedAt: "2026-07-18T10:00:00.000Z" })],
    }) });
    expect(result.input.quality.status).toBe("degraded");
    expect(codes(result)).toEqual(expect.arrayContaining(["order_state_stale", "order_state_reconciling_ambiguous"]));
    expect(result.input.projected.cash[0].available).toBe("900");
  });

  it("blocks an unknown state instead of inferring it", () => {
    const result = build({ financial: financial({ orders: [order({ status: "mystery", persistedReservedCash: "0" })] }) });
    expect(result.input.quality.status).toBe("insufficient");
    expect(codes(result)).toContain("order_state_unknown");
    expect(result.input.pendingOrders).toEqual([]);
  });

  it("blocks insufficient cash without silently funding it from pending sells", () => {
    const result = build({ financial: financial({
      orders: [order({ quantity: "30", persistedReservedCash: "1500" })],
    }) });
    expect(result.input.quality.status).toBe("insufficient");
    expect(codes(result)).toContain("reservation_exceeds_resource");
    expect(result.input.projected.cash[0].available).toBe("-500");
    expect(codes(result)).toContain("projected_cash_negative");
  });

  it("blocks a sell reservation larger than the factual position", () => {
    const sell = order({
      side: "sell", quantity: "10", persistedReservedCash: "0", persistedReservedQuantity: "10",
    });
    const result = build({ financial: financial({ positions: [position({ quantity: "5", reservedQuantity: "10" })], orders: [sell] }) });
    expect(result.input.quality.status).toBe("insufficient");
    expect(codes(result)).toContain("reservation_exceeds_resource");
    expect(codes(result)).toContain("projected_quantity_negative");
  });

  it("blocks inconsistent persisted reservations without double-subtracting them", () => {
    const result = build({ financial: financial({
      cashBalances: [{ accountId: "account_phase3c_1", currency: "EUR", available: "950", settled: "1000", reserved: "50" }],
      orders: [order()],
    }) });
    expect(codes(result)).toContain("inconsistent_persisted_reservation");
    expect(result.input.projected.cash[0].available).toBe("900");
  });

  it("blocks a missing sealed market price", () => {
    const result = build({
      financial: financial({ positions: [position()] }),
      market: market({ omit: ["AGGH"] }),
    });
    expect(result.input.quality.status).toBe("insufficient");
    expect(codes(result)).toContain("market_price_missing");
  });

  it("degrades a stale sealed market price", () => {
    const result = build({ financial: financial({ positions: [position()] }), market: market({ stale: ["AGGH"] }) });
    expect(result.input.quality.status).toBe("degraded");
    expect(codes(result)).toContain("market_price_stale");
  });

  it("blocks missing FX for a non-base-currency position", () => {
    const result = build({
      financial: financial({ positions: [position({ symbol: "VWCE", quantity: "1", currency: "USD" })] }),
      market: market({ omit: ["USDEUR"] }),
    });
    expect(result.input.quality.status).toBe("insufficient");
    expect(codes(result)).toContain("market_fx_missing");
  });

  it("blocks an instrument absent from the sealed catalog", () => {
    const missingPoint = {
      symbol: "MISSING",
      price: d("10"),
      currency: "EUR",
      provider: "phase3c_fixture",
      providerAsOf: AS_OF,
      receivedAt: AS_OF,
      quality: "good" as const,
    };
    const result = build({
      financial: financial({ positions: [position({ symbol: "MISSING", quantity: "1", currency: "EUR" })] }),
      market: market({ extras: [missingPoint] }),
    });
    expect(codes(result)).toContain("instrument_catalog_missing");
    expect(result.input.quality.status).toBe("insufficient");
  });

  it("preserves extreme decimals without Number conversion", () => {
    const amount = "999999999999999999999999999999.123456789012345678";
    const result = build({ financial: financial({ cashBalances: [{
      accountId: "account_phase3c_1", currency: "EUR", available: amount, settled: amount, reserved: "0",
    }] }) });
    expect(result.input.actual.cash[0].available).toBe(amount);
    expect(decimalAdd(amount as never, "0" as never)).toBe(amount);
    expect(decimalMultiply("0.1" as never, "0.2" as never)).toBe("0.02");
  });

  it("deduplicates semantic orders and blocks the ambiguous source", () => {
    const duplicate = order();
    const result = build({ financial: financial({
      cashBalances: [{ accountId: "account_phase3c_1", currency: "EUR", available: "900", settled: "1000", reserved: "100" }],
      orders: [duplicate, { ...duplicate }],
    }) });
    expect(result.input.pendingOrders).toHaveLength(1);
    expect(result.input.projected.positions[0].quantity).toBe("2");
    expect(codes(result)).toContain("duplicated_semantic_order");
    expect(result.input.quality.status).toBe("insufficient");
  });

  it("deduplicates repeated position symbols and blocks the ambiguous factual source", () => {
    const repeated = position();
    const result = build({ financial: financial({ positions: [repeated, { ...repeated }] }) });
    expect(result.input.actual.positions).toHaveLength(1);
    expect(codes(result)).toContain("position_symbol_duplicate");
    expect(result.input.quality.status).toBe("insufficient");
  });

  it("produces the same sealed input for differently ordered source keys and rows", () => {
    const firstFinancial = financial({ positions: [
      position({ symbol: "VWCE", quantity: "1", currency: "USD" }), position(),
    ] });
    const account = firstFinancial.accounts[0];
    const reorderedAccount = {
      baseCurrency: account.baseCurrency,
      status: account.status,
      environment: account.environment,
      portfolioId: account.portfolioId,
      userId: account.userId,
      accountId: account.accountId,
    };
    const secondFinancial = financial({
      ...firstFinancial,
      accounts: [reorderedAccount],
      positions: [...firstFinancial.positions].reverse(),
    });
    const first = build({ financial: firstFinancial });
    const second = build({ financial: secondFinancial });
    expect(canonicalJsonStringify(first.input)).toBe(canonicalJsonStringify(second.input));
    expect(first.input.inputHash).toBe(second.input.inputHash);
  });

  it("counts a repeated partial fill once", () => {
    const partial = order({
      status: "partially_filled", quantity: "10", cumulativeFilledQuantity: "4", persistedReservedCash: "300",
    });
    const repeated = fill();
    const result = build({ financial: financial({
      cashBalances: [{ accountId: "account_phase3c_1", currency: "EUR", available: "700", settled: "1000", reserved: "300" }],
      positions: [position({ quantity: "4", costBasis: "50" })],
      orders: [partial], fills: [repeated, { ...repeated }],
    }) });
    expect(result.portfolioState.reserved.orders[0].effectiveFilledQuantity).toBe("4");
    expect(result.portfolioState.reserved.orders[0].remainingQuantity).toBe("6");
    expect(result.input.projected.positions[0].quantity).toBe("10");
    expect(codes(result)).toContain("duplicate_semantic_fill");
  });

  it("ignores non-allowlisted authoring financial fields", () => {
    const injected = financial({ authoring: {
      plan: { objective: "balanced", cash: "999999", portfolio_items: [{ symbol: "FAKE" }] },
      settings: { marketDataMaxAgeSeconds: "900", positions: [{ symbol: "FAKE" }] },
    } });
    const result = build({ financial: injected });
    expect(result.input.actual.cash[0].available).toBe("1000");
    expect(result.input.actual.positions).toEqual([]);
    expect(result.normalizedAuthoring).not.toHaveProperty("cash");
  });

  it("blocks negative cash, invalid quantity, currency mismatch and excessive fills", () => {
    const invalid = order({
      status: "partially_filled", quantity: "2", cumulativeFilledQuantity: "3", persistedReservedCash: "0",
      currency: "USD",
    });
    const result = build({ financial: financial({
      cashBalances: [{ accountId: "account_phase3c_1", currency: "EUR", available: "-1", settled: "-1", reserved: "0" }],
      positions: [position({ quantity: "not-a-decimal" })], orders: [invalid],
    }) });
    expect(result.input.quality.status).toBe("insufficient");
    expect(codes(result)).toEqual(expect.arrayContaining([
      "cash_negative", "position_quantity_invalid", "fill_exceeds_order_quantity", "order_currency_mismatch",
    ]));
  });

  it("contains raw and non-finite financial numbers at the source boundary", () => {
    const result = build({ financial: financial({ cashBalances: [{
      accountId: "account_phase3c_1",
      currency: "EUR",
      available: Number.NaN as unknown as string,
      settled: Number.POSITIVE_INFINITY as unknown as string,
      reserved: 7 as unknown as string,
    }] }) });
    expect(result.input.quality.status).toBe("insufficient");
    expect(result.input.actual.cash[0]).toMatchObject({ available: "0", settled: "0", reserved: "0" });
    expect(canonicalJsonStringify(result.input)).not.toMatch(/NaN|Infinity/);
  });

  it("blocks pending orders without sufficient quantity/notional", () => {
    const result = build({ financial: financial({ orders: [order({ quantity: "0", unitPrice: null, persistedReservedCash: "0" })] }) });
    expect(result.input.quality.status).toBe("insufficient");
    expect(codes(result)).toContain("order_notional_or_quantity_insufficient");
  });

  it("validates identity, ownership and selects only active Paper", () => {
    expect(() => build({ financial: financial({
      identity: { requestedUserId: "user_phase3c_1", ownerUserId: "other_user" },
    }) })).toThrow("investing_input_identity_ownership_mismatch");
    expect(() => build({ financial: financial({ accounts: [{
      ...financial().accounts[0], environment: "live",
    }] }) })).toThrow("investing_input_active_paper_account_required");
  });

  it("composes the same builder through read-only in-memory ports", async () => {
    const readModel = financial();
    const snapshot = market();
    const repository = new InMemoryInvestingCanonicalSourceRepositoryV1([readModel]);
    const marketPort = new FixtureMarketSnapshotPort([snapshot]);
    const builder = new CanonicalInvestingInputBuilderV1(repository, catalogPort, marketPort);
    const direct = build({ financial: readModel, market: snapshot });
    const viaPorts = await builder.build(sources({ financial: readModel, market: snapshot }).request);
    expect(viaPorts.input.inputHash).toBe(direct.input.inputHash);
  });
});
