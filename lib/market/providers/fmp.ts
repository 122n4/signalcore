import { cacheGet, cacheSet } from "@/lib/market/cache";
import type {
  Candle,
  MarketFetchOptions,
  QuoteNormalized,
  Timeframe,
} from "@/lib/market/types";
import { inferAssetKind, normSymbol } from "@/lib/market/symbols";

type FmpQuote = {
  symbol?: string;
  price?: number;
  dayHigh?: number;
  dayLow?: number;
  open?: number;
  previousClose?: number;
  volume?: number;
  avgVolume?: number;
  change?: number;
  changesPercentage?: number;
  timestamp?: number;
};

type FmpHistoricalPoint = {
  date?: string;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
};

function apiKey() {
  const key = process.env.FMP_API_KEY || process.env.FINANCIAL_MODELING_PREP_API_KEY;
  if (!key) throw new Error("Missing FMP_API_KEY");
  return key;
}

function parseNum(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function buildProviderFetchInit(options?: MarketFetchOptions): RequestInit & { next?: { revalidate: number } } {
  const persistentCacheTtlSec = Math.max(0, Math.round(options?.persistentCacheTtlSec ?? 0));

  if (persistentCacheTtlSec > 0 && process.env.NEXT_RUNTIME && process.env.NODE_ENV !== "test") {
    return {
      next: {
        revalidate: persistentCacheTtlSec,
      },
    };
  }

  return { cache: "no-store" };
}

function toFmpSymbol(symbol: string) {
  const normalized = normSymbol(symbol).replace("/", "");
  if (normalized === "XAUUSD") return "GCUSD";
  if (normalized === "XAGUSD") return "SIUSD";
  if (normalized === "NAS100" || normalized === "NDX") return "^NDX";
  if (normalized === "US500" || normalized === "SPX") return "^GSPC";
  if (normalized === "DJI") return "^DJI";
  if (normalized === "GER40") return "^GDAXI";
  return normalized;
}

function fmpInterval(tf: Timeframe) {
  if (tf.interval === "1min") return "1min";
  if (tf.interval === "5min") return "5min";
  if (tf.interval === "15min") return "15min";
  if (tf.interval === "1h") return "1hour";
  if (tf.interval === "4h") return "4hour";
  return "1day";
}

function parseTimestamp(value: unknown) {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return numeric * 1000;
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function quoteFromPayload(payload: unknown) {
  if (Array.isArray(payload)) return payload[0] as FmpQuote | undefined;
  return payload as FmpQuote | undefined;
}

function historicalPointsFromPayload(payload: any) {
  if (Array.isArray(payload)) return payload as FmpHistoricalPoint[];
  if (Array.isArray(payload?.historical)) return payload.historical as FmpHistoricalPoint[];
  return [];
}

export async function fmpQuote(
  symbol: string,
  ttlMs = 30_000,
  options?: MarketFetchOptions,
): Promise<QuoteNormalized> {
  const kind = inferAssetKind(symbol);
  const normalizedSymbol = toFmpSymbol(symbol);
  const cacheTtlMs = Math.max(0, Math.round(options?.memoryCacheTtlMs ?? ttlMs));
  const key = `fmp:quote:${normalizedSymbol}`;
  const hit = cacheTtlMs > 0 ? cacheGet<QuoteNormalized>(key) : null;
  if (hit) return hit;

  const url = new URL(`https://financialmodelingprep.com/api/v3/quote/${encodeURIComponent(normalizedSymbol)}`);
  url.searchParams.set("apikey", apiKey());

  const response = await fetch(url.toString(), buildProviderFetchInit(options));
  const payload = await response.json().catch(() => null);
  const quote = quoteFromPayload(payload);
  const price = parseNum(quote?.price);

  if (!response.ok || !quote || price == null) {
    throw new Error(`FMP quote failed (${response.status})`);
  }

  const out: QuoteNormalized = {
    symbol: normalizedSymbol,
    kind,
    price,
    change: parseNum(quote.change) ?? undefined,
    percent: parseNum(quote.changesPercentage) ?? undefined,
    prevClose: parseNum(quote.previousClose) ?? undefined,
    open: parseNum(quote.open) ?? undefined,
    high: parseNum(quote.dayHigh) ?? undefined,
    low: parseNum(quote.dayLow) ?? undefined,
    volume: parseNum(quote.volume) ?? undefined,
    averageVolume: parseNum(quote.avgVolume) ?? undefined,
    timestamp: quote.timestamp ? Number(quote.timestamp) * 1000 : Date.now(),
    provider: "fmp",
  };

  if (cacheTtlMs > 0) cacheSet(key, out, cacheTtlMs);
  return out;
}

export async function fmpCandles(
  symbol: string,
  tf: Timeframe,
  ttlMs = 20 * 60_000,
  options?: MarketFetchOptions,
): Promise<Candle[]> {
  const normalizedSymbol = toFmpSymbol(symbol);
  const cacheTtlMs = Math.max(0, Math.round(options?.memoryCacheTtlMs ?? ttlMs));
  const interval = fmpInterval(tf);
  const points = Math.max(30, Math.min(5000, tf.points ?? 140));
  const key = `fmp:candles:${normalizedSymbol}:${interval}:${points}`;
  const hit = cacheTtlMs > 0 ? cacheGet<Candle[]>(key) : null;
  if (hit) return hit;

  const endpoint =
    interval === "1day"
      ? `https://financialmodelingprep.com/api/v3/historical-price-full/${encodeURIComponent(normalizedSymbol)}`
      : `https://financialmodelingprep.com/api/v3/historical-chart/${interval}/${encodeURIComponent(normalizedSymbol)}`;
  const url = new URL(endpoint);
  url.searchParams.set("apikey", apiKey());

  const response = await fetch(url.toString(), buildProviderFetchInit(options));
  const payload = await response.json().catch(() => null);
  const values = historicalPointsFromPayload(payload);

  if (!response.ok || values.length === 0) {
    throw new Error(`FMP candles failed (${response.status})`);
  }

  const out = values
    .slice(0, points)
    .reverse()
    .map((point) => ({
      t: parseTimestamp(point.date),
      o: parseNum(point.open) ?? Number.NaN,
      h: parseNum(point.high) ?? Number.NaN,
      l: parseNum(point.low) ?? Number.NaN,
      c: parseNum(point.close) ?? Number.NaN,
      v: parseNum(point.volume) ?? undefined,
    }))
    .filter((candle) => Number.isFinite(candle.c) && Number.isFinite(candle.o) && Number.isFinite(candle.h) && Number.isFinite(candle.l));

  if (out.length === 0) throw new Error("FMP candles missing valid prices");
  if (cacheTtlMs > 0) cacheSet(key, out, cacheTtlMs);
  return out;
}
