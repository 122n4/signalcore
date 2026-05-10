import type { TradingTimeframe } from "@/lib/trading/data";

export type MarketDirection = "long" | "short" | "neutral";

export type StructureState =
  | "uptrend"
  | "downtrend"
  | "range"
  | "transition"
  | "breakout_structure"
  | "reclaim_structure"
  | "failed_break";

export type StructureOutput = {
  state: StructureState;
  direction: MarketDirection;
  score: number;
  confidence: number;
};

export type RegimeState =
  | "trending"
  | "ranging"
  | "expansion"
  | "compression"
  | "mean_reverting"
  | "low_participation"
  | "noisy";

export type RegimeOutput = {
  state: RegimeState;
  score: number;
  confidence: number;
};

export type VolatilityState = "compression" | "normal" | "expansion" | "spike";

export type VolatilityOutput = {
  state: VolatilityState;
  score: number;
  confidence: number;
};

export type SessionState =
  | "market_closed"
  | "pre_market"
  | "london_open"
  | "london_session"
  | "london_ny_overlap"
  | "ny_open"
  | "midday_lull"
  | "late_us"
  | "asia_flow"
  | "weekend_drift";

export type SessionOutput = {
  marketOpen: boolean;
  session: SessionState;
  confidence: number;
};

export type MomentumState =
  | "rising"
  | "accelerating"
  | "weakening"
  | "exhausted"
  | "neutral";

export type MomentumOutput = {
  state: MomentumState;
  direction: MarketDirection;
  score: number;
  confidence: number;
};

export type LiquidityState =
  | "liquidity_sweep"
  | "reclaim_after_sweep"
  | "thin_liquidity"
  | "healthy_participation"
  | "poor_participation"
  | "neutral";

export type LiquidityOutput = {
  state: LiquidityState;
  score: number;
  confidence: number;
};

export type MarketReadingOutput = {
  instrument: string;
  snapshotAt: string;
  timeframes: TradingTimeframe[];
  structure: StructureOutput;
  regime: RegimeOutput;
  volatility: VolatilityOutput;
  session: SessionOutput;
  momentum: MomentumOutput;
  liquidity: LiquidityOutput;
};
