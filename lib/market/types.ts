// lib/market/types.ts

export type AssetKind = "equity" | "forex" | "crypto" | "metal" | "index";

export type QuoteNormalized = {
  symbol: string;
  kind: AssetKind;

  price: number; // last
  change?: number;
  percent?: number; // 0..100
  prevClose?: number;
  open?: number;
  high?: number;
  low?: number;
  volume?: number;
  averageVolume?: number;
  isMarketOpen?: boolean;
  isExtendedHours?: boolean;

  currency?: string;
  timestamp?: number; // ms
  provider: "alphavantage" | "binance" | "coinbase" | "finnhub" | "fmp" | "kraken" | "twelvedata";
};

export type Candle = {
  t: number; // ms
  o: number;
  h: number;
  l: number;
  c: number;
  v?: number;
};

export type Timeframe =
  | { interval: "1min"; points?: number }
  | { interval: "5min"; points?: number }
  | { interval: "15min"; points?: number }
  | { interval: "1day"; points?: number }
  | { interval: "1h"; points?: number }
  | { interval: "4h"; points?: number };

export type MarketError = {
  provider: string;
  message: string;
};

export type MarketDataPurpose =
  | "scanner"
  | "paper"
  | "research"
  | "dashboard"
  | "ops"
  | "system";

export type MarketFetchOptions = {
  persistentCacheTtlSec?: number;
  memoryCacheTtlMs?: number;
  extendedHours?: boolean;
  purpose?: MarketDataPurpose;
  cycleId?: string;
  requestId?: string;
  bypassInFlightDedupe?: boolean;
};
