import { createHash } from "node:crypto";

import type {
  InvestingBrokerAccountSnapshot,
  InvestingBrokerAdapter,
  InvestingFill,
  InvestingOrderRequest,
  InvestingOrderSubmission,
} from "@/lib/investing/broker/types";
import { InvestingLiveExecutionBlockedError } from "@/lib/investing/broker/types";
import { addMoney, compareMoney, multiplyMoney, subtractMoney, toMoney } from "@/lib/investing/money/decimal";

type PaperOrderBehavior =
  | "accepted"
  | "rejected"
  | "filled"
  | "partial_fill"
  | "timeout"
  | "ambiguous"
  | "duplicate_response"
  | "duplicate_fill"
  | "out_of_order_fill";

type StoredOrder = InvestingOrderSubmission & {
  request: InvestingOrderRequest;
  behavior: PaperOrderBehavior;
};

export class InvestingPaperBrokerAdapter implements InvestingBrokerAdapter {
  readonly environment = "paper" as const;
  private readonly orders = new Map<string, StoredOrder>();
  private readonly clientOrderMap = new Map<string, string>();
  private readonly idempotencyMap = new Map<string, { orderId: string; fingerprint: string }>();
  private readonly fills = new Map<string, InvestingFill[]>();
  private readonly cash = new Map<string, string>();
  private readonly positions = new Map<string, Map<string, { quantity: string; marketValue: string; currency: string }>>();

  constructor(private readonly opts: { behavior?: PaperOrderBehavior; startingCash?: string; feeRateBps?: number; taxRateBps?: number } = {}) {}

  async submitOrder(request: InvestingOrderRequest): Promise<InvestingOrderSubmission> {
    if (request.environment === "live") {
      throw new InvestingLiveExecutionBlockedError();
    }
    const fingerprint = this.requestFingerprint(request);
    const existingIdempotency = this.idempotencyMap.get(request.idempotencyKey);
    if (existingIdempotency) {
      if (existingIdempotency.fingerprint !== fingerprint) throw new Error("investing_paper_idempotency_payload_mismatch");
      return this.orders.get(existingIdempotency.orderId)!;
    }
    const existingId = this.clientOrderMap.get(request.clientOrderId);
    if (existingId) {
      throw new Error("investing_paper_client_order_id_reused");
    }

    const behavior = this.opts.behavior ?? "filled";
    if (behavior === "timeout") {
      throw new Error("investing_paper_submit_timeout");
    }

    const internalOrderId = `ipo_${this.hash(request.idempotencyKey).slice(0, 24)}`;
    const status =
      behavior === "rejected"
        ? "rejected"
        : behavior === "ambiguous"
          ? "ambiguous"
          : behavior === "partial_fill"
            ? "partially_filled"
            : "submitted";
    const order: StoredOrder = {
      internalOrderId,
      clientOrderId: request.clientOrderId,
      brokerOrderId: `paper_${internalOrderId}`,
      status,
      submittedAt: new Date().toISOString(),
      raw: { behavior },
      request,
      behavior,
    };
    this.orders.set(internalOrderId, order);
    this.clientOrderMap.set(request.clientOrderId, internalOrderId);
    this.idempotencyMap.set(request.idempotencyKey, { orderId: internalOrderId, fingerprint });

    if (behavior === "filled" || behavior === "duplicate_response" || behavior === "duplicate_fill" || behavior === "out_of_order_fill") {
      const fill = this.buildFill(order, "1");
      if (!this.canApplyFill(order, fill)) {
        order.status = "rejected";
        order.raw = { behavior, reason: "insufficient_cash_or_position" };
      } else {
        order.status = "filled";
        this.fills.set(internalOrderId, [fill]);
        if (behavior === "duplicate_fill") this.fills.get(internalOrderId)!.push(this.buildFill(order, "1"));
        this.applyFill(order, fill);
      }
    } else if (behavior === "partial_fill") {
      const fill = this.buildFill(order, "0.5");
      if (!this.canApplyFill(order, fill)) {
        order.status = "rejected";
        order.raw = { behavior, reason: "insufficient_cash_or_position" };
      } else {
        this.fills.set(internalOrderId, [fill]);
        this.applyFill(order, fill);
      }
    }

    return behavior === "duplicate_response" ? { ...order } : order;
  }

  async getOrder(orderId: string) {
    return this.orders.get(orderId) ?? null;
  }

  async cancelOrder(orderId: string): Promise<InvestingOrderSubmission> {
    const order = this.orders.get(orderId);
    if (!order) throw new Error("investing_paper_order_not_found");
    if (order.status === "filled") return order;
    order.status = "cancelled";
    return order;
  }

  async listOpenOrders(accountId: string) {
    return [...this.orders.values()].filter((order) => order.request.accountId === accountId && ["accepted", "submitted", "partially_filled"].includes(order.status));
  }

  async listFills(orderId: string) {
    return this.fills.get(orderId) ?? [];
  }

  async getAccountSnapshot(accountId: string): Promise<InvestingBrokerAccountSnapshot> {
    const asOf = new Date().toISOString();
    const cash = this.cash.get(accountId) ?? this.opts.startingCash ?? "100000.00";
    const positions = [...(this.positions.get(accountId)?.entries() ?? [])].map(([symbol, position]) => ({
      symbol,
      quantity: position.quantity,
      marketValue: position.marketValue,
      currency: position.currency,
      asOf,
    }));
    return {
      accountId,
      environment: "paper",
      asOf,
      cash: [{ currency: "EUR", availableAmount: cash, settledAmount: cash, reservedAmount: "0.00", asOf }],
      positions,
    };
  }

  private buildFill(order: StoredOrder, fraction: string): InvestingFill {
    const request = order.request;
    const quantity = request.quantity ?? "1";
    const price = request.limitPrice ?? "100.00";
    const filledQuantity = multiplyMoney(quantity, fraction, 6);
    const grossAmount = request.notional ? multiplyMoney(request.notional, fraction, 2) : multiplyMoney(filledQuantity, price, 2);
    const feeAmount = multiplyMoney(grossAmount, String((this.opts.feeRateBps ?? 5) / 10_000), 2);
    const taxAmount = multiplyMoney(grossAmount, String((this.opts.taxRateBps ?? 0) / 10_000), 2);
    return {
      fillId: `ipf_${this.hash(`${order.internalOrderId}:${fraction}:${grossAmount}`).slice(0, 24)}`,
      orderId: order.internalOrderId,
      brokerFillId: `paper_fill_${this.hash(order.internalOrderId + fraction).slice(0, 18)}`,
      symbol: request.symbol,
      side: request.side,
      quantity: filledQuantity,
      price,
      grossAmount,
      feeAmount,
      taxAmount,
      currency: request.currency,
      executedAt: new Date().toISOString(),
    };
  }

  private applyFill(order: StoredOrder, fill: InvestingFill) {
    const accountId = order.request.accountId;
    const currentCash = this.cash.get(accountId) ?? this.opts.startingCash ?? "100000.00";
    const totalCosts = addMoney(fill.feeAmount, fill.taxAmount, 2);
    const buyCashDelta = addMoney(fill.grossAmount, totalCosts, 2);
    const sellCashDelta = subtractMoney(fill.grossAmount, totalCosts, 2);
    this.cash.set(accountId, order.request.side === "buy" ? subtractMoney(currentCash, buyCashDelta, 2) : addMoney(currentCash, sellCashDelta, 2));

    const bySymbol = this.positions.get(accountId) ?? new Map<string, { quantity: string; marketValue: string; currency: string }>();
    const current = bySymbol.get(fill.symbol) ?? { quantity: "0", marketValue: "0.00", currency: fill.currency };
    const nextQty = order.request.side === "buy" ? addMoney(current.quantity, fill.quantity, 6) : subtractMoney(current.quantity, fill.quantity, 6);
    const nextValue = toMoney(multiplyMoney(nextQty, fill.price, 2), 2);
    bySymbol.set(fill.symbol, { quantity: nextQty, marketValue: nextValue, currency: fill.currency });
    this.positions.set(accountId, bySymbol);
  }

  private canApplyFill(order: StoredOrder, fill: InvestingFill) {
    const accountId = order.request.accountId;
    if (order.request.side === "buy") {
      const currentCash = this.cash.get(accountId) ?? this.opts.startingCash ?? "100000.00";
      const requiredCash = addMoney(addMoney(fill.grossAmount, fill.feeAmount, 2), fill.taxAmount, 2);
      return compareMoney(currentCash, requiredCash, 2) >= 0;
    }
    const currentQuantity = this.positions.get(accountId)?.get(fill.symbol)?.quantity ?? "0";
    return compareMoney(currentQuantity, fill.quantity, 6) >= 0;
  }

  private requestFingerprint(request: InvestingOrderRequest) {
    return this.hash(
      JSON.stringify({
        accountId: request.accountId,
        portfolioId: request.portfolioId,
        symbol: request.symbol.toUpperCase(),
        side: request.side,
        quantity: request.quantity ?? null,
        notional: request.notional ?? null,
        orderType: request.orderType,
        limitPrice: request.limitPrice ?? null,
        currency: request.currency.toUpperCase(),
        clientOrderId: request.clientOrderId,
        environment: request.environment,
      }),
    );
  }

  private hash(value: string) {
    return createHash("sha256").update(value).digest("hex");
  }
}
