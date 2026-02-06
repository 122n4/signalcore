// lib/brokers/types.ts
export type BrokerProvider = "snaptrade";

export type BrokerConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

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