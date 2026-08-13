import { getCandles, getQuote as getNormalizedQuote } from "@/lib/market/marketClient";
import type { MarketCacheState } from "@/lib/market/types";

export type MarketQuote = {
  price: number;
  ts: number | null;
  source: string;
  currency?: string | null;
  cacheState?: MarketCacheState | null;
  servedFromFallback?: boolean | null;
  state?: "fresh" | "last_known_good" | null;
  prevClose?: number | null;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  volume?: number | null;
  averageVolume?: number | null;
  isMarketOpen?: boolean | null;
  isExtendedHours?: boolean | null;
};

function normalizeSymbol(value: unknown) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

const g = globalThis as typeof globalThis & {
  __syntrake_market_quotes_cache?: Map<string, { at: number; quote: MarketQuote }>;
  __syntrake_market_quotes_inflight?: Map<string, Promise<MarketQuote | null>>;
};

if (!g.__syntrake_market_quotes_cache) {
  g.__syntrake_market_quotes_cache = new Map<string, { at: number; quote: MarketQuote }>();
}

if (!g.__syntrake_market_quotes_inflight) {
  g.__syntrake_market_quotes_inflight = new Map<string, Promise<MarketQuote | null>>();
}

const MEM_CACHE = g.__syntrake_market_quotes_cache;
const INFLIGHT_QUOTES = g.__syntrake_market_quotes_inflight;

function getCache(key: string, ttlSec: number) {
  const hit = MEM_CACHE.get(key);
  if (!hit) return null;
  if (nowSeconds() - hit.at > ttlSec) return null;
  return hit.quote;
}

function setCache(key: string, quote: MarketQuote) {
  MEM_CACHE.set(key, { at: nowSeconds(), quote });
}

function timestampSeconds(value: unknown) {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) && timestamp > 0 ? Math.floor(timestamp / 1000) : null;
}

async function normalizedQuote(symbol: string): Promise<MarketQuote | null> {
  try {
    const quote = await getNormalizedQuote(symbol, "twelvedata");
    return {
      price: quote.price,
      ts: timestampSeconds(quote.timestamp),
      source: quote.provider,
      currency: quote.currency ?? null,
      cacheState: quote.cacheState ?? null,
      servedFromFallback: quote.cacheState?.servedFromFallback ?? null,
      state: quote.cacheState?.state ?? null,
      prevClose: quote.prevClose ?? null,
      open: quote.open ?? null,
      high: quote.high ?? null,
      low: quote.low ?? null,
      volume: quote.volume ?? null,
      averageVolume: quote.averageVolume ?? null,
      isMarketOpen:
        typeof quote.isMarketOpen === "boolean" ? quote.isMarketOpen : null,
      isExtendedHours:
        typeof quote.isExtendedHours === "boolean" ? quote.isExtendedHours : null,
    };
  } catch {
    try {
      const candles = await getCandles(symbol, { interval: "5min", points: 2 }, "auto");
      const last = Array.isArray(candles) && candles.length ? candles[candles.length - 1] : null;
      if (!last || !Number.isFinite(last.c) || last.c <= 0) return null;
      const ts = timestampSeconds(last.t);
      if (ts === null) return null;
      return {
        price: last.c,
        ts,
        source: "market-client-candle-fallback",
        currency: null,
        cacheState: candles.cacheState ?? null,
        servedFromFallback: candles.cacheState?.servedFromFallback ?? null,
        state: candles.cacheState?.state ?? null,
        prevClose: null,
        open: Number.isFinite(last.o) ? last.o : null,
        high: Number.isFinite(last.h) ? last.h : null,
        low: Number.isFinite(last.l) ? last.l : null,
        volume: Number.isFinite(Number(last.v ?? Number.NaN)) ? Number(last.v) : null,
        averageVolume: null,
        isMarketOpen: null,
        isExtendedHours: null,
      };
    } catch {
      return null;
    }
  }
}

export async function getQuotes(args: { symbols: string[]; ttlSec?: number }) {
  const ttlSec = Math.max(15, Math.min(3600, args.ttlSec ?? 60));
  const out: Record<string, MarketQuote> = {};
  const symbols = Array.from(new Set((args.symbols ?? []).map(normalizeSymbol))).filter(Boolean);

  const tasks = symbols.map(async (symbol) => {
    try {
      const cacheKey = `q:${symbol}`;
      const cached = getCache(cacheKey, ttlSec);
      if (cached) {
        out[symbol] = cached;
        return;
      }

      let inflight = INFLIGHT_QUOTES.get(cacheKey);
      if (!inflight) {
        inflight = normalizedQuote(symbol).finally(() => {
          INFLIGHT_QUOTES.delete(cacheKey);
        });
        INFLIGHT_QUOTES.set(cacheKey, inflight);
      }

      const quote = await inflight;
      if (!quote) return;
      setCache(cacheKey, quote);
      out[symbol] = quote;
    } catch {
      // Canonical market batching should never fail the caller on a single symbol.
    }
  });

  await Promise.all(tasks);
  return out;
}
