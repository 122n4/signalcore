import { cacheGet, cacheSet } from "@/lib/market/cache";
import type {
  Candle,
  MarketFetchOptions,
  QuoteNormalized,
  Timeframe,
} from "@/lib/market/types";
import { inferAssetKind, normSymbol } from "@/lib/market/symbols";

type CoinbaseCandle = [
  number,
  number,
  number,
  number,
  number,
  number,
];

type CoinbaseTicker = {
  price?: string;
  volume?: string;
  time?: string;
  message?: string;
};

type ProviderRequestInit = RequestInit & {
  next?: {
    revalidate: number;
  };
};

function baseUrl() {
  return "https://api.exchange.coinbase.com";
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

function granularityMap(tf: Timeframe): 60 | 300 | 900 | 3600 | 14400 | 86400 {
  if (tf.interval === "1min") return 60;
  if (tf.interval === "5min") return 300;
  if (tf.interval === "15min") return 900;
  if (tf.interval === "1h") return 3600;
  if (tf.interval === "4h") return 14400;
  return 86400;
}

export function toCoinbaseProductId(symbol: string) {
  const normalized = normSymbol(symbol);

  if (normalized.includes("/")) {
    const [base, quote] = normalized.split("/");
    return `${base}-${quote === "USDT" ? "USD" : quote}`;
  }

  if (normalized.endsWith("USDT")) {
    return `${normalized.slice(0, -4)}-USD`;
  }

  if (normalized.endsWith("USD")) {
    return `${normalized.slice(0, -3)}-USD`;
  }

  return normalized.replace("_", "-");
}

export async function coinbaseQuote(
  symbol: string,
  ttlMs = 30_000,
  options?: MarketFetchOptions,
): Promise<QuoteNormalized> {
  const kind = inferAssetKind(symbol);

  if (kind !== "crypto") {
    throw new Error("Coinbase quote: unsupported kind");
  }

  const productId = toCoinbaseProductId(symbol);
  const cacheTtlMs = Math.max(0, Math.round(options?.memoryCacheTtlMs ?? ttlMs));
  const key = `cb:quote:${productId}`;
  const hit = cacheTtlMs > 0 ? cacheGet<QuoteNormalized>(key) : null;
  if (hit) return hit;

  const response = await fetch(
    `${baseUrl()}/products/${encodeURIComponent(productId)}/ticker`,
    buildProviderFetchInit(options),
  );
  const json = (await response.json().catch(() => null)) as CoinbaseTicker | null;
  const price = parseNum(json?.price);

  if (!response.ok || !json || price == null) {
    throw new Error(json?.message ?? `Coinbase quote failed (${response.status})`);
  }

  const timestamp = json.time ? new Date(json.time).getTime() : Date.now();
  const out: QuoteNormalized = {
    symbol: productId,
    kind,
    price,
    volume: parseNum(json.volume) ?? undefined,
    isMarketOpen: true,
    currency: productId.split("-")[1] ?? "USD",
    timestamp: Number.isFinite(timestamp) ? timestamp : Date.now(),
    provider: "coinbase",
  };

  if (cacheTtlMs > 0) cacheSet(key, out, cacheTtlMs);
  return out;
}

export async function coinbaseCandles(
  symbol: string,
  tf: Timeframe,
  ttlMs = 20 * 60_000,
  options?: MarketFetchOptions,
): Promise<Candle[]> {
  const kind = inferAssetKind(symbol);

  if (kind !== "crypto") {
    throw new Error("Coinbase candles: unsupported kind");
  }

  const productId = toCoinbaseProductId(symbol);
  const granularity = granularityMap(tf);
  const points = Math.max(1, Math.min(300, Math.round(tf.points ?? 140)));
  const cacheTtlMs = Math.max(0, Math.round(options?.memoryCacheTtlMs ?? ttlMs));
  const key = `cb:candles:${productId}:${granularity}:${points}`;
  const hit = cacheTtlMs > 0 ? cacheGet<Candle[]>(key) : null;
  if (hit) return hit;

  const end = Math.floor(Date.now() / 1000);
  const start = end - points * granularity;
  const url = new URL(`${baseUrl()}/products/${encodeURIComponent(productId)}/candles`);
  url.searchParams.set("granularity", String(granularity));
  url.searchParams.set("start", new Date(start * 1000).toISOString());
  url.searchParams.set("end", new Date(end * 1000).toISOString());

  const response = await fetch(url.toString(), buildProviderFetchInit(options));
  const json = (await response.json().catch(() => null)) as CoinbaseCandle[] | { message?: string } | null;

  if (!response.ok || !Array.isArray(json)) {
    const message = json && !Array.isArray(json) ? json.message : null;
    throw new Error(message ?? `Coinbase candles failed (${response.status})`);
  }

  const out = json
    .map((row) => ({
      t: Number(row[0]) * 1000,
      l: Number(row[1]),
      h: Number(row[2]),
      o: Number(row[3]),
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
    )
    .sort((left, right) => left.t - right.t);

  if (cacheTtlMs > 0) cacheSet(key, out, cacheTtlMs);
  return out;
}
