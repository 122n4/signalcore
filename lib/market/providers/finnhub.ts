import { cacheGet, cacheSet } from "@/lib/market/cache";
import type {
  Candle,
  QuoteNormalized,
  Timeframe,
  MarketFetchOptions,
} from "@/lib/market/types";
import { inferAssetKind, toFinnhubSymbol } from "@/lib/market/symbols";

type FinnhubQuote = { c: number; d: number; dp: number; t?: number };
type FinnhubCandle = { c: number[]; h: number[]; l: number[]; o: number[]; t: number[]; v?: number[]; s: string };

function apiKey() {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) throw new Error("Missing FINNHUB_API_KEY");
  return key;
}

function nowMs() {
  return Date.now();
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

export async function finnhubQuote(
  symbol: string,
  ttlMs = 30_000,
  options?: MarketFetchOptions,
): Promise<QuoteNormalized> {
  const kind = inferAssetKind(symbol);
  const normalizedSymbol = toFinnhubSymbol(symbol, kind);
  const cacheTtlMs = Math.max(0, Math.round(options?.memoryCacheTtlMs ?? ttlMs));

  if (kind !== "equity") {
    throw new Error("Finnhub quote: unsupported kind");
  }

  const key = `fh:quote:${normalizedSymbol}`;
  const hit = cacheTtlMs > 0 ? cacheGet<QuoteNormalized>(key) : null;
  if (hit) return hit;

  const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(normalizedSymbol)}&token=${encodeURIComponent(apiKey())}`;
  const response = await fetch(url, buildProviderFetchInit(options));
  const json = (await response.json().catch(() => null)) as FinnhubQuote | null;

  if (!response.ok || !json || typeof json.c !== "number") {
    throw new Error(`Finnhub quote failed (${response.status})`);
  }

  const out: QuoteNormalized = {
    symbol: normalizedSymbol,
    kind,
    price: json.c,
    change: typeof json.d === "number" ? json.d : undefined,
    percent: typeof json.dp === "number" ? json.dp : undefined,
    currency: undefined,
    timestamp: json.t ? json.t * 1000 : nowMs(),
    provider: "finnhub",
  };

  if (cacheTtlMs > 0) cacheSet(key, out, cacheTtlMs);
  return out;
}

function tfToUnixRange(tf: Timeframe) {
  const interval = tf.interval;
  const points = Math.max(30, Math.min(500, tf.points ?? 120));
  const now = new Date();
  const to = Math.floor(now.getTime() / 1000);

  const secondsPer =
    interval === "1min"
      ? 60
      : interval === "5min"
        ? 300
        : interval === "15min"
          ? 900
          : interval === "1h"
            ? 3600
            : interval === "4h"
              ? 14400
              : 86400;

  const from = to - points * secondsPer;
  const resolution =
    interval === "1min"
      ? "1"
      : interval === "5min"
        ? "5"
        : interval === "15min"
          ? "15"
          : interval === "1h"
            ? "60"
            : interval === "4h"
              ? "240"
              : "D";

  return { from, to, resolution };
}

export async function finnhubCandles(
  symbol: string,
  tf: Timeframe,
  ttlMs = 20 * 60_000,
  options?: MarketFetchOptions,
): Promise<Candle[]> {
  const kind = inferAssetKind(symbol);
  const normalizedSymbol = toFinnhubSymbol(symbol, kind);
  const cacheTtlMs = Math.max(0, Math.round(options?.memoryCacheTtlMs ?? ttlMs));

  if (
    kind !== "equity" &&
    kind !== "index" &&
    kind !== "forex" &&
    kind !== "crypto" &&
    kind !== "metal"
  ) {
    throw new Error("Finnhub candles: unsupported kind");
  }

  const points = Math.max(30, Math.min(500, tf.points ?? 120));
  const key = `fh:candles:${normalizedSymbol}:${tf.interval}:${points}`;
  const hit = cacheTtlMs > 0 ? cacheGet<Candle[]>(key) : null;
  if (hit) return hit;

  const { from, to, resolution } = tfToUnixRange({ ...tf, points });
  const endpoint =
    kind === "equity" || kind === "index"
      ? "stock/candle"
      : kind === "crypto"
        ? "crypto/candle"
        : "forex/candle";
  const url = new URL(`https://finnhub.io/api/v1/${endpoint}`);
  url.searchParams.set("symbol", normalizedSymbol);
  url.searchParams.set("resolution", resolution);
  url.searchParams.set("from", String(from));
  url.searchParams.set("to", String(to));
  url.searchParams.set("token", apiKey());

  const response = await fetch(url.toString(), buildProviderFetchInit(options));
  const json = (await response.json().catch(() => null)) as FinnhubCandle | null;

  if (!response.ok || !json || json.s !== "ok") {
    throw new Error(`Finnhub candles failed (${response.status})`);
  }

  const out: Candle[] = (json.t ?? [])
    .map((tSec, index) => ({
      t: tSec * 1000,
      o: Number(json.o?.[index] ?? Number.NaN),
      h: Number(json.h?.[index] ?? Number.NaN),
      l: Number(json.l?.[index] ?? Number.NaN),
      c: Number(json.c?.[index] ?? Number.NaN),
      v: json.v ? Number(json.v[index] ?? 0) : undefined,
    }))
    .filter((candle) => Number.isFinite(candle.c) && Number.isFinite(candle.o) && Number.isFinite(candle.h) && Number.isFinite(candle.l));

  if (cacheTtlMs > 0) cacheSet(key, out, cacheTtlMs);
  return out;
}
