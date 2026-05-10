// lib/market/providers/twelvedata.ts
import type {
  Candle,
  QuoteNormalized,
  Timeframe,
  MarketFetchOptions,
} from "@/lib/market/types";
import { cacheGet, cacheSet } from "@/lib/market/cache";
import { inferAssetKind, toTwelveDataSymbol, normSymbol } from "@/lib/market/symbols";

function apiKey() {
  const k = process.env.TWELVEDATA_API_KEY;
  if (!k) throw new Error("Missing TWELVEDATA_API_KEY");
  return k;
}

function baseUrl() {
  return "https://api.twelvedata.com";
}

type TDQuote = {
  symbol: string;
  currency?: string;
  datetime?: string;
  timestamp?: number | string;
  open?: string;
  high?: string;
  low?: string;
  close?: string;
  volume?: string;
  previous_close?: string;
  change?: string;
  percent_change?: string;
  average_volume?: string;
  is_market_open?: boolean;
  is_extended_hours?: boolean;
  status?: string;
  message?: string;
};

type TDTimeSeriesPoint = { datetime: string; open: string; high: string; low: string; close: string; volume?: string };
type TDTimeSeries = { values?: TDTimeSeriesPoint[]; status?: string; message?: string };

function parseNum(x: any) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function parseQuoteTimestamp(data: TDQuote) {
  const rawTimestamp = Number((data as any)?.timestamp);
  if (Number.isFinite(rawTimestamp) && rawTimestamp > 0) {
    return rawTimestamp * 1000;
  }

  const parsedDatetime = Date.parse(String(data.datetime ?? ""));
  if (Number.isFinite(parsedDatetime)) {
    return parsedDatetime;
  }

  return Date.now();
}

function supportsExtendedHours(kind: ReturnType<typeof inferAssetKind>) {
  return kind === "equity" || kind === "index";
}

function intervalMap(tf: Timeframe): "1min" | "5min" | "15min" | "1day" | "1h" | "4h" {
  if (tf.interval === "1min") return "1min";
  if (tf.interval === "5min") return "5min";
  if (tf.interval === "15min") return "15min";
  if (tf.interval === "1h") return "1h";
  if (tf.interval === "4h") return "4h";
  return "1day";
}

type ProviderRequestInit = RequestInit & {
  next?: {
    revalidate: number;
  };
};

function buildProviderFetchInit(options?: MarketFetchOptions): ProviderRequestInit {
  const persistentCacheTtlSec = Math.max(
    0,
    Math.round(options?.persistentCacheTtlSec ?? 0),
  );

  if (persistentCacheTtlSec > 0 && process.env.NEXT_RUNTIME && process.env.NODE_ENV !== "test") {
    return {
      next: {
        revalidate: persistentCacheTtlSec,
      },
    };
  }

  return { cache: "no-store" };
}

export async function tdQuoteNormalized(
  symbol: string,
  ttlMs = 30_000,
  options?: MarketFetchOptions,
): Promise<QuoteNormalized> {
  const raw = normSymbol(symbol);
  const kind = inferAssetKind(raw);
  const sym = toTwelveDataSymbol(raw, kind);
  const cacheTtlMs = Math.max(0, Math.round(options?.memoryCacheTtlMs ?? ttlMs));

  const key = `tdn:quote:${sym}`;
  const hit = cacheTtlMs > 0 ? cacheGet<QuoteNormalized>(key) : null;
  if (hit) return hit;

  const url = new URL(`${baseUrl()}/quote`);
  url.searchParams.set("symbol", sym);
  if (options?.extendedHours && supportsExtendedHours(kind)) {
    url.searchParams.set("prepost", "true");
  }
  url.searchParams.set("apikey", apiKey());

  const res = await fetch(url.toString(), buildProviderFetchInit(options));
  const data: TDQuote | null = await res.json().catch(() => null);

  if (!res.ok || !data) throw new Error(`TwelveData quote failed (${res.status})`);
  if ((data as any)?.status === "error") throw new Error((data as any)?.message ?? "TwelveData error");

  const price = parseNum(data.close);
  if (price == null) throw new Error("TwelveData quote missing price");

  const change = parseNum(data.change) ?? undefined;
  const percent = parseNum(data.percent_change) ?? undefined;

  // TwelveData datetime é string; usamos "agora" como timestamp se não der parse
  const ts = parseQuoteTimestamp(data);

  const out: QuoteNormalized = {
    symbol: sym,
    kind,
    price,
    change,
    percent,
    prevClose: parseNum(data.previous_close) ?? undefined,
    open: parseNum(data.open) ?? undefined,
    high: parseNum(data.high) ?? undefined,
    low: parseNum(data.low) ?? undefined,
    volume: parseNum(data.volume) ?? undefined,
    averageVolume: parseNum(data.average_volume) ?? undefined,
    isMarketOpen:
      typeof data.is_market_open === "boolean" ? data.is_market_open : undefined,
    isExtendedHours:
      typeof data.is_extended_hours === "boolean" ? data.is_extended_hours : undefined,
    currency: data.currency,
    timestamp: ts,
    provider: "twelvedata",
  };

  if (cacheTtlMs > 0) cacheSet(key, out, cacheTtlMs);
  return out;
}

export async function tdCandles(
  symbol: string,
  tf: Timeframe,
  ttlMs = 20 * 60_000,
  options?: MarketFetchOptions,
): Promise<Candle[]> {
  const raw = normSymbol(symbol);
  const kind = inferAssetKind(raw);
  const sym = toTwelveDataSymbol(raw, kind);
  const cacheTtlMs = Math.max(0, Math.round(options?.memoryCacheTtlMs ?? ttlMs));

  const interval = intervalMap(tf);
  const points = Math.max(40, Math.min(5000, tf.points ?? 140));

  const key = `tdn:ts:${sym}:${interval}:${points}`;
  const hit = cacheTtlMs > 0 ? cacheGet<Candle[]>(key) : null;
  if (hit) return hit;

  const url = new URL(`${baseUrl()}/time_series`);
  url.searchParams.set("symbol", sym);
  url.searchParams.set("interval", interval);
  url.searchParams.set("outputsize", String(points));
  if (options?.extendedHours && supportsExtendedHours(kind)) {
    url.searchParams.set("prepost", "true");
  }
  url.searchParams.set("apikey", apiKey());

  const res = await fetch(url.toString(), buildProviderFetchInit(options));
  const data: TDTimeSeries | null = await res.json().catch(() => null);

  if (!res.ok || !data) throw new Error(`TwelveData time_series failed (${res.status})`);
  if ((data as any)?.status === "error") throw new Error((data as any)?.message ?? "TwelveData error");

  const values = Array.isArray(data.values) ? data.values : [];
  // TwelveData devolve do mais recente -> mais antigo; invert para ordem temporal
  const ordered = [...values].reverse();

  const out: Candle[] = ordered.map((p) => {
    const t = Date.parse(p.datetime);
    const o = parseNum(p.open);
    const h = parseNum(p.high);
    const l = parseNum(p.low);
    const c = parseNum(p.close);
    const v = parseNum(p.volume);

    return {
      t: Number.isFinite(t) ? t : Date.now(),
      o: o ?? NaN,
      h: h ?? NaN,
      l: l ?? NaN,
      c: c ?? NaN,
      v: v ?? undefined,
    };
  }).filter((x) => Number.isFinite(x.c) && Number.isFinite(x.o) && Number.isFinite(x.h) && Number.isFinite(x.l));

  if (cacheTtlMs > 0) cacheSet(key, out, cacheTtlMs);
  return out;
}
