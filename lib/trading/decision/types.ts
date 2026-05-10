import type { TradingMarketDataSnapshot } from "@/lib/trading/data";
import type { MarketReadingOutput } from "@/lib/trading/market";
import type { SetupCoreOutput } from "@/lib/trading/setups";

export type ClarityOutput = {
  level: "low" | "medium" | "high";
  score: number;
  conflictScore: number;
  alignment: number;
};

export type BiasOutput = {
  direction: "bullish" | "bearish" | "mixed" | "neutral";
  score: number;
  confidence: number;
};

export type EnvironmentOutput = {
  state: "favorable" | "neutral" | "unfavorable";
  score: number;
  confidence: number;
};

export type DecisionWeightingOutput = {
  contextProfile: string;
  weightedScores: Record<string, number>;
  confidence: number;
};

export type TradingState =
  | "MARKET_CLOSED"
  | "SESSION_OPEN"
  | "WAIT"
  | "SETUP_FORMING"
  | "TRADE_VALID"
  | "TRADE_ACTIVE"
  | "BLOCKED"
  | "TOO_LATE"
  | "EXIT"
  | "SESSION_END";

export type DecisionOutput = {
  currentState: TradingState;
  primaryMessage: string;
  secondaryMessage?: string;
  confidence: number;
  reasons: string[];
};

export type DecisionEngineInput = {
  snapshot: TradingMarketDataSnapshot;
  market: MarketReadingOutput;
  setupCore: SetupCoreOutput;
};

export type DecisionCoreOutput = {
  clarity: ClarityOutput;
  bias: BiasOutput;
  environment: EnvironmentOutput;
  weighting: DecisionWeightingOutput;
  decision: DecisionOutput;
};
