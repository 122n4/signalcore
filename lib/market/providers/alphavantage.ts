import { cacheGet, cacheSet } from "@/lib/market/cache";
import type {
  Candle,
  MarketFetchOptions,
  QuoteNormalized,
  Timeframe,
} from "@/lib/market/types";
import { inferAssetKind, normSymbol } from "@/lib/market/symbols";

function apiKey() {
  const key = process.env.ALPHAVANTAGE_API_KEY || process.env.ALPHA_VANTAGE_API_KEY;
  if (!key) throw new Error("Missing ALPHAVANTAGE_API_KEY");
  return key;
}

function baseUrl() {
  return "https://www.alphavantage.co/query";
}

function parseNum(input: unknown) {
  const value = Number(input);
  return Number.isFinite(value) ? value : null;
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

function intervalMap(tf: Timeframe): "1min" | "5min" | "15min" | "60min" {
  if (tf.interval === "1min") return "1min";
  if (tf.interval === "5min") return "5min";
  if (tf.interval === "15min") return "15min";
  return "60min";
}

function splitPair(symbol: string) {
  const normalized = normSymbol(symbol);
  if (normalized.includes("/")) {
    const [from, to] = normalized.split("/");
    return { from, to };
  }
  if (normalized.length >= 6) {
    return { from: normalized.slice(0, 3), to: normalized.slice(3, 6) };
  }
  return null;
}

function compactSymbol(symbol: string) {
  return normSymbol(symbol).replace("/", "");
}

function readError(payload: any) {
  return payload?.["Error Message"] || payload?.Note || payload?.Information || null;
}

export async function alphaVantageQuote(
  symbol: string,
  ttlMs = 60_000,
  options?: MarketFetchOptions,
): Promise<QuoteNormalized> {
  const kind = inferAssetKind(symbol);
  if (kind !== "equity" && kind !== "forex") {
    throw new Error("Alpha Vantage quote: unsupported kind");
  }

  const normalizedSymbol = compactSymbol(symbol);
  const cacheTtlMs = Math.max(0, Math.round(options?.memoryCacheTtlMs ?? ttlMs));
  const key = `av:quote:${normalizedSymbol}`;
  const hit = cacheTtlMs > 0 ? cacheGet<QuoteNormalized>(key) : null;
  if (hit) return hit;

  const url = new URL(baseUrl());
  if (kind === "forex") {
    const pair = splitPair(symbol);
    if (!pair) throw new Error("Alpha Vantage forex quote: invalid pair");
    url.searchParams.set("function", "CURRENCY_EXCHANGE_RATE");
    url.searchParams.set("from_currency", pair.from);
    url.searchParams.set("to_currency", pair.to);
  } else {
    url.searchParams.set("function", "GLOBAL_QUOTE");
    url.searchParams.set("symbol", normalizedSymbol);
  }
  url.searchParams.set("apikey", apiKey());

  const response = await fetch(url.toString(), buildProviderFetchInit(options));
  const payload = await response.json().catch(() => null);
  const error = readError(payload);

  if (!response.ok || !payload || error) {
    throw new Error(error || `Alpha Vantage quote failed (${response.status})`);
  }

  const quote =
    kind === "forex"
      ? payload?.["Realtime Currency Exchange Rate"]
      : payload?.["Global Quote"];
  const price = kind === "forex"
    ? parseNum(quote?.["5. Exchange Rate"])
    : parseNum(quote?.["05. price"]);

  if (price == null) throw new Error("Alpha Vantage quote missing price");

  const out: QuoteNormalized = {
    symbol: normalizedSymbol,
    kind,
    price,
    change: kind === "equity" ? parseNum(quote?.["09. change"]) ?? undefined : undefined,
    percent:
      kind === "equity"
        ? parseNum(String(quote?.["10. change percent"] ?? "").replace("%", "")) ?? undefined
        : undefined,
    open: kind === "equity" ? parseNum(quote?.["02. open"]) ?? undefined : undefined,
    high: kind === "equity" ? parseNum(quote?.["03. high"]) ?? undefined : undefined,
    low: kind === "equity" ? parseNum(quote?.["04. low"]) ?? undefined : undefined,
    volume: kind === "equity" ? parseNum(quote?.["06. volume"]) ?? undefined : undefined,
    timestamp: Date.now(),
    provider: "alphavantage",
  };

  if (cacheTtlMs > 0) cacheSet(key, out, cacheTtlMs);
  return out;
}

export async function alphaVantageCandles(
  symbol: string,
  tf: Timeframe,
  ttlMs = 20 * 60_000,
  options?: MarketFetchOptions,
): Promise<Candle[]> {
  const kind = inferAssetKind(symbol);
  if (kind !== "equity" && kind !== "forex") {
    throw new Error("Alpha Vantage candles: unsupported kind");
  }

  const normalizedSymbol = compactSymbol(symbol);
  const interval = intervalMap(tf);
  const points = Math.max(1, Math.min(100, Math.round(tf.points ?? 100)));
  const cacheTtlMs = Math.max(0, Math.round(options?.memoryCacheTtlMs ?? ttlMs));
  const key = `av:candles:${normalizedSymbol}:${interval}:${points}`;
  const hit = cacheTtlMs > 0 ? cacheGet<Candle[]>(key) : null;
  if (hit) return hit;

  const url = new URL(baseUrl());
  if (kind === "forex") {
    const pair = splitPair(symbol);
    if (!pair) throw new Error("Alpha Vantage forex candles: invalid pair");
    url.searchParams.set("function", "FX_INTRADAY");
    url.searchParams.set("from_symbol", pair.from);
    url.searchParams.set("to_symbol", pair.to);
  } else {
    url.searchParams.set("function", "TIME_SERIES_INTRADAY");
    url.searchParams.set("symbol", normalizedSymbol);
  }
  url.searchParams.set("interval", interval);
  url.searchParams.set("outputsize", "compact");
  url.searchParams.set("apikey", apiKey());

  const response = await fetch(url.toString(), buildProviderFetchInit(options));
  const payload = await response.json().catch(() => null);
  const error = readError(payload);
  const seriesKey = `Time Series FX (${interval})`;
  const equitySeriesKey = `Time Series (${interval})`;
  const series = payload?.[seriesKey] || payload?.[equitySeriesKey];

  if (!response.ok || !payload || error || !series || typeof series !== "object") {
    throw new Error(error || `Alpha Vantage candles failed (${response.status})`);
  }

  const out = Object.entries(series)
    .slice(0, points)
    .reverse()
    .map(([datetime, row]: [string, any]) => ({
      t: Date.parse(datetime),
      o: parseNum(row?.["1. open"]) ?? Number.NaN,
      h: parseNum(row?.["2. high"]) ?? Number.NaN,
      l: parseNum(row?.["3. low"]) ?? Number.NaN,
      c: parseNum(row?.["4. close"]) ?? Number.NaN,
      v: parseNum(row?.["5. volume"]) ?? undefined,
    }))
    .filter(
      (candle) =>
        Number.isFinite(candle.t) &&
        Number.isFinite(candle.o) &&
        Number.isFinite(candle.h) &&
        Number.isFinite(candle.l) &&
        Number.isFinite(candle.c),
    );

  if (out.length === 0) throw new Error("Alpha Vantage candles missing valid prices");
  if (cacheTtlMs > 0) cacheSet(key, out, cacheTtlMs);
  return out;
}
