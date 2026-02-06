// lib/brokers/types.ts

export type BrokerProvider = "snaptrade" | "csv";

// Connection status used by brokerStore (v2)
export type BrokerConnectionStatus = "active" | "error" | "revoked" | "needs_attention";

/**
 * Canonical portfolio shapes used across the app (UI + engine + execution).
 * Providers (snaptrade/csv) should normalize into these.
 */

export type Holding = {
  symbol: string;         // "AAPL"
  name?: string | null;
  quantity: number;       // shares/units
  price?: number | null;  // last price
  currency?: string | null;
  marketValue?: number | null; // quantity * price
  weightPct?: number | null;   // optional (0..100)
  assetClass?: string | null;  // optional ("equity","etf",...)
  region?: string | null;      // optional ("US","EU","Global")
};

export type Cash = {
  currency: string;
  value: number;
};

export type TradeSide = "buy" | "sell";

export type Trade = {
  ts: number;            // epoch ms
  symbol: string;
  side: TradeSide;
  quantity: number;
  price?: number | null;
  currency?: string | null;
};

export type PortfolioMetrics = {
  totalValue?: number | null;
  currency?: string | null;
  concentrationTop5Pct?: number | null;
  holdingsCount?: number | null;
};

export type PortfolioSnapshot = {
  userId: string;
  provider: BrokerProvider;

  // If provider has a connection row in DB
  connectionId: string | null;

  asOf: string; // ISO date-time

  holdings: Holding[];
  cash: Cash[];
  trades: Trade[];

  metrics: PortfolioMetrics;
};

/**
 * Backwards-compatible shapes (older code may still reference these).
 * Keep them to avoid cascading refactors right now.
 */

export type BrokerAccount = {
  id: string;
  name?: string | null;
  institution?: string | null;
  currency?: string | null;
};

export type BrokerPosition = {
  symbol: string;
  name?: string | null;
  qty: number;
  price?: number | null;
  value?: number | null;
  currency?: string | null;
  assetType?: string | null;
};

export type BrokerSnapshot = {
  provider: BrokerProvider;
  asOf: string; // ISO
  accounts: BrokerAccount[];
  positions: BrokerPosition[];
  totalValue?: number | null;
};