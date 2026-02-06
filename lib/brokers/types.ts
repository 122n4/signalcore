export type BrokerProvider = "snaptrade" | "csv";

export type Money = {
  currency: string; // "EUR","USD"
  value: number;
};

export type Holding = {
  symbol: string;
  name?: string;
  assetType?: "stock" | "etf" | "fund" | "crypto" | "cash" | "other";
  quantity: number;
  price?: number;
  marketValue?: number;
  currency?: string;
  weightPct?: number;
};

export type Cash = {
  currency: string;
  value: number;
};

export type Trade = {
  ts: number;
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  price?: number;
  currency?: string;
};

export type PortfolioSnapshot = {
  userId: string;
  provider: BrokerProvider;
  connectionId?: string | null;
  asOf: string; // ISO
  holdings: Holding[];
  cash: Cash[];
  trades: Trade[];
  metrics: {
    totalValue?: number;
    currency?: string;
    concentrationTop5Pct?: number;
    holdingsCount?: number;
  };
};

export type BrokerConnection = {
  id: string;
  user_id: string;
  provider: BrokerProvider;
  status: "active" | "revoked" | "error" | "needs_attention";
  account_label?: string | null;
  meta: Record<string, any>;
  created_at: string;
  updated_at: string;
};

export type BrokerStatus = {
  connected: boolean;
  provider?: BrokerProvider;
  status?: BrokerConnection["status"];
  accountLabel?: string | null;
  lastSyncAt?: string | null;
};