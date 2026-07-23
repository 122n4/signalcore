import { describe, expect, it } from "vitest";

import {
  DisabledInvestingLiveBrokerAdapter,
  InvestingLiveExecutionBlockedError,
  InvestingPaperBrokerAdapter,
  assertBalancedLedgerTransaction,
  buildTradeSettlementLedger,
  evaluateInvestingPreTradeControls,
  reconcileInvestingAccountingState,
  transitionInvestingExecutionState,
} from "@/lib/investing";

describe("investing financial architecture", () => {
  it("rejects unbalanced ledger transactions", () => {
    expect(() =>
      assertBalancedLedgerTransaction({
        correlationId: "corr_1",
        sourceType: "test",
        sourceId: "src_1",
        currency: "EUR",
        entries: [
          { accountCode: "cash", side: "debit", amount: "10.00", currency: "EUR" },
          { accountCode: "asset", side: "credit", amount: "9.99", currency: "EUR" },
        ],
      }),
    ).toThrow("ledger_not_balanced");
  });

  it("builds balanced trade settlement entries", () => {
    const tx = buildTradeSettlementLedger({
      correlationId: "corr_2",
      orderId: "ord_1",
      side: "buy",
      grossAmount: "100.00",
      feeAmount: "1.25",
      currency: "EUR",
    });
    expect(() => assertBalancedLedgerTransaction(tx)).not.toThrow();
    expect(tx.entries).toHaveLength(3);
  });

  it("validates execution transitions and blocks illegal regressions", () => {
    expect(transitionInvestingExecutionState({ current: "awaiting_approval", transition: "approve", environment: "paper" })).toEqual({
      state: "approved",
      idempotent: false,
    });
    expect(() => transitionInvestingExecutionState({ current: "rejected", transition: "start_submission", environment: "paper" })).toThrow(
      "illegal_investing_execution_transition",
    );
  });

  it("blocks live before any execution state transition", () => {
    expect(() => transitionInvestingExecutionState({ current: "approved", transition: "start_submission", environment: "live" })).toThrow(
      InvestingLiveExecutionBlockedError,
    );
  });

  it("submits deterministic paper orders and dedupes client order ids", async () => {
    const broker = new InvestingPaperBrokerAdapter({ behavior: "filled", startingCash: "1000.00" });
    const request = {
      accountId: "acct_1",
      portfolioId: "portfolio_1",
      symbol: "VWCE",
      side: "buy" as const,
      quantity: "1",
      orderType: "limit" as const,
      limitPrice: "100.00",
      currency: "EUR",
      clientOrderId: "client_1",
      idempotencyKey: "idem_1",
      environment: "paper" as const,
    };
    const first = await broker.submitOrder(request);
    const second = await broker.submitOrder(request);
    expect(second.internalOrderId).toBe(first.internalOrderId);
    expect((await broker.listFills(first.internalOrderId))).toHaveLength(1);
  });

  it("uses the idempotency key as the paper order identity and rejects altered retries", async () => {
    const broker = new InvestingPaperBrokerAdapter({ behavior: "filled", startingCash: "1000.00" });
    const request = {
      accountId: "acct_1",
      portfolioId: "portfolio_1",
      symbol: "VWCE",
      side: "buy" as const,
      notional: "100.00",
      orderType: "market" as const,
      currency: "EUR",
      clientOrderId: "client_idem",
      idempotencyKey: "idem_canonical",
      environment: "paper" as const,
    };
    const first = await broker.submitOrder(request);
    expect((await broker.submitOrder(request)).internalOrderId).toBe(first.internalOrderId);
    await expect(broker.submitOrder({ ...request, notional: "101.00" })).rejects.toThrow("idempotency_payload_mismatch");
  });

  it("applies partial notional and deducts sell fees and taxes from cash", async () => {
    const broker = new InvestingPaperBrokerAdapter({ behavior: "partial_fill", startingCash: "1000.00", feeRateBps: 100, taxRateBps: 200 });
    const buy = await broker.submitOrder({
      accountId: "acct_sell",
      portfolioId: "portfolio_1",
      symbol: "VWCE",
      side: "buy",
      quantity: "2",
      notional: "200.00",
      orderType: "limit",
      limitPrice: "100.00",
      currency: "EUR",
      clientOrderId: "client_buy",
      idempotencyKey: "idem_buy",
      environment: "paper",
    });
    expect((await broker.listFills(buy.internalOrderId))[0]?.grossAmount).toBe("100.00");
    const sell = await broker.submitOrder({
      accountId: "acct_sell",
      portfolioId: "portfolio_1",
      symbol: "VWCE",
      side: "sell",
      quantity: "1",
      notional: "100.00",
      orderType: "limit",
      limitPrice: "100.00",
      currency: "EUR",
      clientOrderId: "client_sell",
      idempotencyKey: "idem_sell",
      environment: "paper",
    });
    expect((await broker.listFills(sell.internalOrderId))[0]?.grossAmount).toBe("50.00");
    expect((await broker.getAccountSnapshot("acct_sell")).cash[0]?.availableAmount).toBe("945.50");
  });

  it("rejects paper fills that would create negative cash or positions", async () => {
    const cashBroker = new InvestingPaperBrokerAdapter({ behavior: "filled", startingCash: "10.00" });
    const buy = await cashBroker.submitOrder({
      accountId: "acct_cash",
      portfolioId: "portfolio_1",
      symbol: "VWCE",
      side: "buy",
      notional: "100.00",
      orderType: "market",
      currency: "EUR",
      clientOrderId: "too_large",
      idempotencyKey: "too_large",
      environment: "paper",
    });
    expect(buy.status).toBe("rejected");

    const sell = await cashBroker.submitOrder({
      accountId: "acct_cash",
      portfolioId: "portfolio_1",
      symbol: "VWCE",
      side: "sell",
      quantity: "1",
      orderType: "market",
      currency: "EUR",
      clientOrderId: "naked_sell",
      idempotencyKey: "naked_sell",
      environment: "paper",
    });
    expect(sell.status).toBe("rejected");
  });

  it("posts sell proceeds net of fees and taxes and books realized P&L", () => {
    const tx = buildTradeSettlementLedger({
      correlationId: "corr_sell",
      orderId: "ord_sell",
      side: "sell",
      grossAmount: "120.00",
      feeAmount: "2.00",
      taxAmount: "3.00",
      costBasisAmount: "100.00",
      currency: "eur",
    });
    expect(() => assertBalancedLedgerTransaction(tx)).not.toThrow();
    expect(tx.entries.find((entry) => entry.accountCode === "cash")?.amount).toBe("115.00");
    expect(tx.entries.find((entry) => entry.accountCode === "realized_gain")?.amount).toBe("20.00");
  });

  it("includes the new order in daily limits and blocks request/environment mismatch", () => {
    const evaluations = evaluateInvestingPreTradeControls({
      request: {
        accountId: "acct_1",
        portfolioId: "portfolio_1",
        symbol: "VWCE",
        side: "buy",
        notional: "20.00",
        orderType: "market",
        currency: "EUR",
        clientOrderId: "client_controls",
        idempotencyKey: "idem_controls",
        environment: "live",
      },
      mandate: { baseCurrency: "EUR" } as never,
      instruments: [{ symbol: "VWCE", qualityStatus: "approved", enabled: true }] as never,
      cashAvailable: "100.00",
      reservedCash: "90.00",
      dailySubmittedNotional: "90.00",
      dailyOrderCount: 0,
      environment: "paper",
      killSwitchActive: false,
      maxOrderNotional: "100.00",
      maxDailyNotional: "100.00",
      maxDailyOrders: 10,
      freshnessSeconds: 1,
      reconciliationStatus: "passed",
    });
    expect(evaluations.find((entry) => entry.controlName === "environment_allowed")?.passed).toBe(false);
    expect(evaluations.find((entry) => entry.controlName === "cash_available")?.passed).toBe(false);
    expect(evaluations.find((entry) => entry.controlName === "max_daily_notional")?.passed).toBe(false);
  });

  it("blocks live execution server-side", async () => {
    const broker = new DisabledInvestingLiveBrokerAdapter();
    await expect(
      broker.submitOrder({
        accountId: "acct_1",
        portfolioId: "portfolio_1",
        symbol: "VWCE",
        side: "buy",
        notional: "100.00",
        orderType: "market",
        currency: "EUR",
        clientOrderId: "client_live",
        idempotencyKey: "idem_live",
        environment: "live",
      }),
    ).rejects.toBeInstanceOf(InvestingLiveExecutionBlockedError);
  });

  it("detects cash, fill and ledger reconciliation breaks", () => {
    const result = reconcileInvestingAccountingState({
      internal: {
        cash: [{ currency: "EUR", availableAmount: "900.00", settledAmount: "900.00", reservedAmount: "0.00", asOf: "2026-07-19T00:00:00.000Z" }],
        positions: [{ symbol: "VWCE", quantity: "1", marketValue: "100.00", currency: "EUR", asOf: "2026-07-19T00:00:00.000Z" }],
        orders: [],
        fills: [{ fillId: "fill_1", orderId: "ord_1", quantity: "1", grossAmount: "100.00", feeAmount: "0.50", currency: "EUR" }],
        ledgerBalanced: false,
      },
      broker: {
        cash: [{ currency: "EUR", availableAmount: "899.00", settledAmount: "899.00", reservedAmount: "0.00", asOf: "2026-07-19T00:00:00.000Z" }],
        positions: [],
        orders: [],
        fills: [],
      },
    });
    expect(result.status).toBe("failed");
    expect(result.counts.material).toBeGreaterThan(0);
    expect(result.counts.critical).toBe(1);
  });
});
