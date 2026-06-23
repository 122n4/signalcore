export type BotExecutionMode = "paper" | "live";
export type BotAutonomyOption = "paper_only" | "real_money_when_armed";
export type BotSide = "buy" | "sell";
export type BotOrderType = "market" | "limit";
export type BotTimeInForce = "day" | "gtc";

export type BotMarketDecision = {
  instrument: string;
  side: BotSide;
  tradeValid: boolean;
  executionStatus: "allowed" | "caution" | "restricted";
  marketOpen: boolean;
  snapshotFresh: boolean;
  snapshotAt: string;
  trigger?: number | null;
  entryLow?: number | null;
  entryHigh?: number | null;
  invalidation?: number | null;
  target?: number | null;
  confidence?: number | null;
  riskReward?: number | null;
  reason?: string | null;
};

export type BotAccountState = {
  equity: number;
  currency: string;
  openPositions: number;
  openRiskPct: number;
  dailyLossPct: number;
  tradesToday: number;
  consecutiveLosses: number;
};

export type BotRiskConfig = {
  maxRiskPerTradePct: number;
  maxDailyLossPct: number;
  maxOpenRiskPct: number;
  maxTradesPerDay: number;
  maxConsecutiveLosses: number;
  minRiskReward: number;
  minConfidence: number;
  allowCautionWithReducedRisk: boolean;
};

export type BotSafetyConfig = {
  executionMode: BotExecutionMode;
  autonomyOption: BotAutonomyOption;
  allowLiveTrading: boolean;
  liveEnvironmentConfirmed: boolean;
  killSwitch: boolean;
  requireFreshSnapshot: boolean;
  requireMarketOpen: boolean;
  operatorAcknowledgedAt?: string | null;
};

export type AutonomousBotConfig = {
  ownerUserId: string;
  risk: BotRiskConfig;
  safety: BotSafetyConfig;
};

export type BotOrderIntent = {
  idempotencyKey: string;
  mode: BotExecutionMode;
  instrument: string;
  side: BotSide;
  orderType: BotOrderType;
  timeInForce: BotTimeInForce;
  quantity: number;
  notional: number;
  estimatedEntry: number;
  stopLoss: number;
  takeProfit: number;
  riskPct: number;
  riskAmount: number;
  createdAt: string;
  rationale: string[];
};

export type BotCycleResult =
  | {
      action: "blocked";
      mode: BotExecutionMode;
      instrument: string;
      reasons: string[];
      intent: null;
    }
  | {
      action: "ready";
      mode: BotExecutionMode;
      instrument: string;
      reasons: string[];
      intent: BotOrderIntent;
    };

export type BrokerExecutionResult = {
  ok: boolean;
  brokerOrderId?: string | null;
  status: "accepted" | "rejected" | "paper_filled" | "paper_queued";
  message?: string | null;
  raw?: unknown;
};

export type BrokerExecutionAdapter = {
  name: string;
  mode: BotExecutionMode;
  submitBracketOrder(intent: BotOrderIntent): Promise<BrokerExecutionResult>;
};
