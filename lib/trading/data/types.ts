export const TRADING_TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "1d"] as const;

export type TradingTimeframe = (typeof TRADING_TIMEFRAMES)[number];

export type TradingMarketType = "equities" | "forex" | "crypto";

export type TradingSessionProfile = "ny_equities" | "forex" | "crypto";

export type TradingCandleInput = {
  timestamp: string | number | Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number | null;
};

export type NormalizedCandle = {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
};

export type TradingTimeframeMap<T> = Partial<Record<TradingTimeframe, T>>;

export type TradingMarketDataInput = {
  instrument: string;
  marketType: TradingMarketType;
  sessionProfile?: TradingSessionProfile;
  snapshotAt?: string | number | Date;
  timeframes: TradingTimeframeMap<TradingCandleInput[]>;
};

export type TradingMarketDataSnapshot = {
  instrument: string;
  marketType: TradingMarketType;
  sessionProfile: TradingSessionProfile;
  snapshotAt: string;
  timeframes: TradingTimeframeMap<NormalizedCandle[]>;
  availableTimeframes: TradingTimeframe[];
};
