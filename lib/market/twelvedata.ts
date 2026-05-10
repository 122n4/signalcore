import { cacheGet, cacheSet } from "@/lib/market/cache";

function apiKey() {
  const k = process.env.TWELVEDATA_API_KEY;
  if (!k) throw new Error("Missing TWELVEDATA_API_KEY");
  return k;
}

function baseUrl() {
  return "https://api.twelvedata.com";
}

function normSymbol(symbol: string) {
  return String(symbol || "").trim().toUpperCase();
}

export type TDQuote = {
  symbol: string;
  name?: string;
  exchange?: string;
  currency?: string;
  datetime?: string;
  open?: string;
  high?: string;
  low?: string;
  close?: string;
  volume?: string;
  previous_close?: string;
  change?: string;
  percent_change?: string;
  is_market_open?: boolean;
};

export async function tdQuote(symbol: string, ttlMs = 15_000): Promise<TDQuote> {
  const sym = normSymbol(symbol);
  const key = `td:quote:${sym}`;
  const hit = cacheGet<TDQuote>(key);
  if (hit) return hit;

  const url = new URL(`${baseUrl()}/quote`);
  url.searchParams.set("symbol", sym);
  url.searchParams.set("apikey", apiKey());

  const res = await fetch(url.toString(), { cache: "no-store" });
  const data: any = await res.json().catch(() => null);

  if (!res.ok || !data) throw new Error(`TwelveData quote failed (${res.status})`);
  if (data?.status === "error") throw new Error(data?.message ?? "TwelveData error");

  cacheSet(key, data as TDQuote, ttlMs);
  return data as TDQuote;
}

export type TDTimeSeriesPoint = {
  datetime: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume?: string;
};

export type TDTimeSeries = {
  meta?: any;
  values?: TDTimeSeriesPoint[];
  status?: string;
  message?: string;
};

export async function tdTimeSeries(opts: {
  symbol: string;
  interval?: "1min" | "5min" | "15min" | "30min" | "45min" | "1h" | "2h" | "4h" | "1day" | "1week" | "1month";
  outputsize?: number;
  ttlMs?: number;
}) {
  const sym = normSymbol(opts.symbol);
  const interval = opts.interval ?? "1day";
  const outputsize = Math.max(1, Math.min(5000, Number(opts.outputsize ?? 120)));
  const ttlMs = opts.ttlMs ?? 60_000;

  const key = `td:ts:${sym}:${interval}:${outputsize}`;
  const hit = cacheGet<TDTimeSeries>(key);
  if (hit) return hit;

  const url = new URL(`${baseUrl()}/time_series`);
  url.searchParams.set("symbol", sym);
  url.searchParams.set("interval", interval);
  url.searchParams.set("outputsize", String(outputsize));
  url.searchParams.set("apikey", apiKey());

  const res = await fetch(url.toString(), { cache: "no-store" });
  const data: any = await res.json().catch(() => null);

  if (!res.ok || !data) throw new Error(`TwelveData time_series failed (${res.status})`);
  if (data?.status === "error") throw new Error(data?.message ?? "TwelveData error");

  cacheSet(key, data as TDTimeSeries, ttlMs);
  return data as TDTimeSeries;
}

export function inferAssetKind(symbol: string): "equity" | "forex" | "crypto" | "metal" | "index" {
  const normalized = normSymbol(symbol);

  if (normalized.includes("/")) {
    const [left, right] = normalized.split("/");

    if ((left === "XAU" || left === "XAG") && right === "USD") {
      return "metal";
    }

    if (["BTC", "ETH", "SOL", "BNB", "XRP", "ADA", "DOGE"].includes(left)) {
      return "crypto";
    }

    return "forex";
  }

  if (["BTCUSD", "ETHUSD", "SOLUSD", "BNBUSD", "XRPUSD", "ADAUSD", "DOGEUSD"].includes(normalized)) {
    return "crypto";
  }

  if (["XAUUSD", "XAGUSD"].includes(normalized)) {
    return "metal";
  }

  if (["NDX", "SPX", "DJI", "GER40", "NAS100", "US500"].includes(normalized)) {
    return "index";
  }

  return "equity";
}
