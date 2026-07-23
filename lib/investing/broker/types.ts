export type InvestingExecutionEnvironment = "simulation" | "paper" | "live";
export type InvestingAutonomyMode = "observe" | "propose" | "approval_required" | "automatic";

export type InvestingOrderSide = "buy" | "sell";
export type InvestingOrderType = "market" | "limit";
export type InvestingOrderStatus =
  | "accepted"
  | "rejected"
  | "submitted"
  | "partially_filled"
  | "filled"
  | "cancelled"
  | "expired"
  | "timeout"
  | "ambiguous";

export type InvestingCashSnapshot = {
  currency: string;
  availableAmount: string;
  settledAmount: string;
  reservedAmount: string;
  asOf: string;
};

export type InvestingPositionSnapshot = {
  symbol: string;
  quantity: string;
  marketValue: string;
  costBasis?: string | null;
  currency: string;
  asOf: string;
};

export type InvestingBrokerAccountSnapshot = {
  accountId: string;
  environment: InvestingExecutionEnvironment;
  asOf: string;
  cash: InvestingCashSnapshot[];
  positions: InvestingPositionSnapshot[];
};

export type InvestingOrderRequest = {
  accountId: string;
  portfolioId: string;
  symbol: string;
  side: InvestingOrderSide;
  quantity?: string | null;
  notional?: string | null;
  orderType: InvestingOrderType;
  limitPrice?: string | null;
  currency: string;
  clientOrderId: string;
  idempotencyKey: string;
  environment: InvestingExecutionEnvironment;
};

export type InvestingOrderSubmission = {
  internalOrderId: string;
  clientOrderId: string;
  brokerOrderId: string | null;
  status: InvestingOrderStatus;
  submittedAt: string;
  raw?: Record<string, unknown>;
};

export type InvestingFill = {
  fillId: string;
  orderId: string;
  brokerFillId: string | null;
  symbol: string;
  side: InvestingOrderSide;
  quantity: string;
  price: string;
  grossAmount: string;
  feeAmount: string;
  taxAmount: string;
  currency: string;
  executedAt: string;
};

export type InvestingBrokerAdapter = {
  environment: InvestingExecutionEnvironment;
  submitOrder(request: InvestingOrderRequest): Promise<InvestingOrderSubmission>;
  getOrder(orderId: string): Promise<InvestingOrderSubmission | null>;
  cancelOrder(orderId: string): Promise<InvestingOrderSubmission>;
  listOpenOrders(accountId: string): Promise<InvestingOrderSubmission[]>;
  listFills(orderId: string): Promise<InvestingFill[]>;
  getAccountSnapshot(accountId: string): Promise<InvestingBrokerAccountSnapshot>;
};

export class InvestingLiveExecutionBlockedError extends Error {
  readonly code = "investing_live_execution_blocked";

  constructor(message = "Live investing execution is disabled server-side.") {
    super(message);
    this.name = "InvestingLiveExecutionBlockedError";
  }
}
