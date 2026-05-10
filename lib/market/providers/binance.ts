import { cacheGet, cacheSet } from "@/lib/market/cache";
import type {
  Candle,
  MarketFetchOptions,
  QuoteNormalized,
  Timeframe,
} from "@/lib/market/types";
import { inferAssetKind, normSymbol } from "@/lib/market/symbols";

type BinanceKline = [
  number,
  string,
  string,
  string,
  string,
  string,
  number,
  string,
  number,
  string,
  string,
  string,
];

type BinanceTicker24h = {
  symbol?: string;
  lastPrice?: string;
  priceChange?: string;
  priceChangePercent?: string;
  openPrice?: string;
  highPrice?: string;
  lowPrice?: string;
  volume?: string;
  closeTime?: number;
  msg?: string;
};

type ProviderRequestInit = RequestInit & {
  next?: {
    revalidate: number;
  };
};

function baseUrl() {
  return "https://api.binance.com";
}

function parseNum(input: unknown) {
  const value = Number(input);
  return Number.isFinite(value) ? value : null;
}

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

function intervalMap(tf: Timeframe): "1m" | "5m" | "15m" | "1h" | "4h" | "1d" {
  if (tf.interval === "1min") return "1m";
  if (tf.interval === "5min") return "5m";
  if (tf.interval === "15min") return "15m";
  if (tf.interval === "1h") return "1h";
  if (tf.interval === "4h") return "4h";
  return "1d";
}

export function toBinanceSpotSymbol(symbol: string) {
  const normalized = normSymbol(symbol);

  if (normalized.includes("/")) {
    const [base, quote] = normalized.split("/");
    return `${base}${quote === "USD" ? "USDT" : quote}`;
  }

  if (normalized.endsWith("USD")) {
    return `${normalized.slice(0, -3)}USDT`;
  }

  return normalized;
}

export async function binanceQuote(
  symbol: string,
  ttlMs = 30_000,
  options?: MarketFetchOptions,
): Promise<QuoteNormalized> {
  const kind = inferAssetKind(symbol);

  if (kind !== "crypto") {
    throw new Error("Binance quote: unsupported kind");
  }

  const binanceSymbol = toBinanceSpotSymbol(symbol);
  const cacheTtlMs = Math.max(0, Math.round(options?.memoryCacheTtlMs ?? ttlMs));
  const key = `bn:quote:${binanceSymbol}`;
  const hit = cacheTtlMs > 0 ? cacheGet<QuoteNormalized>(key) : null;
  if (hit) return hit;

  const url = new URL(`${baseUrl()}/api/v3/ticker/24hr`);
  url.searchParams.set("symbol", binanceSymbol);

  const response = await fetch(url.toString(), buildProviderFetchInit(options));
  const json = (await response.json().catch(() => null)) as BinanceTicker24h | null;
  const price = parseNum(json?.lastPrice);

  if (!response.ok || !json || price == null) {
    throw new Error(json?.msg ?? `Binance quote failed (${response.status})`);
  }

  const out: QuoteNormalized = {
    symbol: binanceSymbol,
    kind,
    price,
    change: parseNum(json.priceChange) ?? undefined,
    percent: parseNum(json.priceChangePercent) ?? undefined,
    open: parseNum(json.openPrice) ?? undefined,
    high: parseNum(json.highPrice) ?? undefined,
    low: parseNum(json.lowPrice) ?? undefined,
    volume: parseNum(json.volume) ?? undefined,
    isMarketOpen: true,
    currency: "USDT",
    timestamp: Number.isFinite(json.closeTime) ? Number(json.closeTime) : Date.now(),
    provider: "binance",
  };

  if (cacheTtlMs > 0) cacheSet(key, out, cacheTtlMs);
  return out;
}

export async function binanceCandles(
  symbol: string,
  tf: Timeframe,
  ttlMs = 20 * 60_000,
  options?: MarketFetchOptions,
): Promise<Candle[]> {
  const kind = inferAssetKind(symbol);

  if (kind !== "crypto") {
    throw new Error("Binance candles: unsupported kind");
  }

  const binanceSymbol = toBinanceSpotSymbol(symbol);
  const interval = intervalMap(tf);
  const points = Math.max(1, Math.min(1500, Math.round(tf.points ?? 140)));
  const cacheTtlMs = Math.max(0, Math.round(options?.memoryCacheTtlMs ?? ttlMs));
  const key = `bn:klines:${binanceSymbol}:${interval}:${points}`;
  const hit = cacheTtlMs > 0 ? cacheGet<Candle[]>(key) : null;
  if (hit) return hit;

  let remaining = points;
  let endTime: number | null = null;
  let rows: BinanceKline[] = [];

  while (remaining > 0) {
    const limit = Math.min(1000, remaining);
    const url = new URL(`${baseUrl()}/api/v3/klines`);
    url.searchParams.set("symbol", binanceSymbol);
    url.searchParams.set("interval", interval);
    url.searchParams.set("limit", String(limit));

    if (endTime != null) {
      url.searchParams.set("endTime", String(endTime));
    }

    const response = await fetch(url.toString(), buildProviderFetchInit(options));
    const json = (await response.json().catch(() => null)) as BinanceKline[] | { msg?: string } | null;

    if (!response.ok || !Array.isArray(json)) {
      const message = json && !Array.isArray(json) ? json.msg : null;
      throw new Error(message ?? `Binance klines failed (${response.status})`);
    }

    if (json.length === 0) {
      break;
    }

    rows = [...json, ...rows];
    remaining -= json.length;

    const earliestOpenTime = Number(json[0]?.[0]);
    if (json.length < limit || !Number.isFinite(earliestOpenTime)) {
      break;
    }

    endTime = earliestOpenTime - 1;
  }

  const deduped = Array.from(
    new Map(rows.map((row) => [Number(row[0]), row])).values(),
  ).sort((left, right) => Number(left[0]) - Number(right[0]));

  const out = deduped
    .map((row) => ({
      t: Number(row[0]),
      o: Number(row[1]),
      h: Number(row[2]),
      l: Number(row[3]),
      c: Number(row[4]),
      v: parseNum(row[5]) ?? undefined,
    }))
    .filter(
      (candle) =>
        Number.isFinite(candle.t) &&
        Number.isFinite(candle.o) &&
        Number.isFinite(candle.h) &&
        Number.isFinite(candle.l) &&
        Number.isFinite(candle.c),
    );

  if (cacheTtlMs > 0) cacheSet(key, out, cacheTtlMs);
  return out;
}
