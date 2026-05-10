import type { TradingMarketDataSnapshot, TradingTimeframe } from "@/lib/trading/data";
import type { MarketDirection, MarketReadingOutput } from "@/lib/trading/market";

export type SetupType =
  | "breakout_continuation"
  | "trend_pullback"
  | "liquidity_sweep_reversal"
  | "range_reclaim"
  | "failed_breakout"
  | "none";

export type SetupOutput = {
  type: SetupType;
  direction: MarketDirection;
  triggerLevel?: number | null;
  invalidationLevel?: number | null;
  confidence: number;
};

export type SetupMaturityState = "forming" | "developing" | "ready" | "late" | "invalid";

export type SetupMaturityOutput = {
  state: SetupMaturityState;
  score: number;
  confidence: number;
};

export type OpportunityWindowState =
  | "forming"
  | "opening"
  | "active"
  | "degrading"
  | "closed";

export type OpportunityWindowOutput = {
  state: OpportunityWindowState;
  score: number;
  confidence: number;
};

export type SetupQualityOutput = {
  score: number;
  grade: "A" | "B" | "C" | "D";
  confidence: number;
};

export type SetupEngineInput = {
  snapshot: TradingMarketDataSnapshot;
  market: MarketReadingOutput;
};

export type SetupContext = {
  snapshot: TradingMarketDataSnapshot;
  market: MarketReadingOutput;
  timeframe: TradingTimeframe | null;
  latestPrice: number | null;
};

export type SetupCoreOutput = {
  setup: SetupOutput;
  maturity: SetupMaturityOutput;
  opportunityWindow: OpportunityWindowOutput;
  quality: SetupQualityOutput;
};
