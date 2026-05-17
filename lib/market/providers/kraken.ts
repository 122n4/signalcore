import { cacheGet, cacheSet } from "@/lib/market/cache";
import type {
  Candle,
  MarketFetchOptions,
  QuoteNormalized,
  Timeframe,
} from "@/lib/market/types";
import { inferAssetKind, normSymbol } from "@/lib/market/symbols";

type KrakenTickerResponse = {
  error?: string[];
  result?: Record<string, {
    c?: [string, string];
    o?: string;
    h?: [string, string];
    l?: [string, string];
    v?: [string, string];
  }>;
};

type KrakenOhlcRow = [number, string, string, string, string, string, string, number];
type KrakenOhlcResponse = {
  error?: string[];
  result?: Record<string, KrakenOhlcRow[] | number>;
};

function baseUrl() {
  return "https://api.kraken.com";
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

function intervalMap(tf: Timeframe): 1 | 5 | 15 | 60 | 240 | 1440 {
  if (tf.interval === "1min") return 1;
  if (tf.interval === "5min") return 5;
  if (tf.interval === "15min") return 15;
  if (tf.interval === "1h") return 60;
  if (tf.interval === "4h") return 240;
  return 1440;
}

export function toKrakenPair(symbol: string) {
  const normalized = normSymbol(symbol).replace("/", "");
  const base = normalized.endsWith("USDT")
    ? normalized.slice(0, -4)
    : normalized.endsWith("USD")
      ? normalized.slice(0, -3)
      : normalized;

  const krakenBase = base === "BTC" ? "XBT" : base;
  return `${krakenBase}USD`;
}

function firstResultValue<T>(result: Record<string, T> | undefined) {
  if (!result) return null;
  const key = Object.keys(result).find((entry) => entry !== "last");
  return key ? result[key] : null;
}

export async function krakenQuote(
  symbol: string,
  ttlMs = 30_000,
  options?: MarketFetchOptions,
): Promise<QuoteNormalized> {
  const kind = inferAssetKind(symbol);
  if (kind !== "crypto") throw new Error("Kraken quote: unsupported kind");

  const pair = toKrakenPair(symbol);
  const cacheTtlMs = Math.max(0, Math.round(options?.memoryCacheTtlMs ?? ttlMs));
  const key = `kr:quote:${pair}`;
  const hit = cacheTtlMs > 0 ? cacheGet<QuoteNormalized>(key) : null;
  if (hit) return hit;

  const url = new URL(`${baseUrl()}/0/public/Ticker`);
  url.searchParams.set("pair", pair);

  const response = await fetch(url.toString(), buildProviderFetchInit(options));
  const payload = (await response.json().catch(() => null)) as KrakenTickerResponse | null;
  const ticker = firstResultValue(payload?.result);
  const price = parseNum(ticker?.c?.[0]);

  if (!response.ok || !payload || payload.error?.length || !ticker || price == null) {
    throw new Error(payload?.error?.join(", ") || `Kraken quote failed (${response.status})`);
  }

  const out: QuoteNormalized = {
    symbol: pair,
    kind,
    price,
    open: parseNum(ticker.o) ?? undefined,
    high: parseNum(ticker.h?.[1]) ?? undefined,
    low: parseNum(ticker.l?.[1]) ?? undefined,
    volume: parseNum(ticker.v?.[1]) ?? undefined,
    isMarketOpen: true,
    currency: "USD",
    timestamp: Date.now(),
    provider: "kraken",
  };

  if (cacheTtlMs > 0) cacheSet(key, out, cacheTtlMs);
  return out;
}

export async function krakenCandles(
  symbol: string,
  tf: Timeframe,
  ttlMs = 20 * 60_000,
  options?: MarketFetchOptions,
): Promise<Candle[]> {
  const kind = inferAssetKind(symbol);
  if (kind !== "crypto") throw new Error("Kraken candles: unsupported kind");

  const pair = toKrakenPair(symbol);
  const interval = intervalMap(tf);
  const points = Math.max(1, Math.min(720, Math.round(tf.points ?? 140)));
  const cacheTtlMs = Math.max(0, Math.round(options?.memoryCacheTtlMs ?? ttlMs));
  const key = `kr:ohlc:${pair}:${interval}:${points}`;
  const hit = cacheTtlMs > 0 ? cacheGet<Candle[]>(key) : null;
  if (hit) return hit;

  const since = Math.floor(Date.now() / 1000) - points * interval * 60;
  const url = new URL(`${baseUrl()}/0/public/OHLC`);
  url.searchParams.set("pair", pair);
  url.searchParams.set("interval", String(interval));
  url.searchParams.set("since", String(since));

  const response = await fetch(url.toString(), buildProviderFetchInit(options));
  const payload = (await response.json().catch(() => null)) as KrakenOhlcResponse | null;
  const rows = firstResultValue(payload?.result) as KrakenOhlcRow[] | null;

  if (!response.ok || !payload || payload.error?.length || !Array.isArray(rows)) {
    throw new Error(payload?.error?.join(", ") || `Kraken OHLC failed (${response.status})`);
  }

  const out = rows
    .slice(-points)
    .map((row) => ({
      t: Number(row[0]) * 1000,
      o: Number(row[1]),
      h: Number(row[2]),
      l: Number(row[3]),
      c: Number(row[4]),
      v: parseNum(row[6]) ?? undefined,
    }))
    .filter(
      (candle) =>
        Number.isFinite(candle.t) &&
        Number.isFinite(candle.o) &&
        Number.isFinite(candle.h) &&
        Number.isFinite(candle.l) &&
        Number.isFinite(candle.c),
    );

  if (out.length === 0) throw new Error("Kraken candles missing valid prices");
  if (cacheTtlMs > 0) cacheSet(key, out, cacheTtlMs);
  return out;
}
