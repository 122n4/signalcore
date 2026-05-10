// lib/signalcore/marketData.ts
import { getCandles, getQuote as getNormalizedQuote } from "@/lib/market/marketClient";
import type { AutopilotMode } from "@/lib/signalcore/modes";

export type Quote = {
  price: number;
  ts: number;
  source: string;
  currency?: string | null;
  prevClose?: number | null;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  volume?: number | null;
  averageVolume?: number | null;
  isMarketOpen?: boolean | null;
  isExtendedHours?: boolean | null;
};

function normSymbol(x: any) {
  return String(x || "").trim().toUpperCase().replace(/\s+/g, "");
}

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

const MEM_CACHE = new Map<string, { at: number; quote: Quote }>();
const INFLIGHT_QUOTES = new Map<string, Promise<Quote | null>>();

function getCache(key: string, ttlSec: number) {
  const hit = MEM_CACHE.get(key);
  if (!hit) return null;
  if (nowSec() - hit.at > ttlSec) return null;
  return hit.quote;
}

function setCache(key: string, quote: Quote) {
  MEM_CACHE.set(key, { at: nowSec(), quote });
}

async function normalizedQuote(symbol: string): Promise<Quote | null> {
  try {
    const quote = await getNormalizedQuote(symbol, "twelvedata");
    return {
      price: quote.price,
      ts: Math.floor((quote.timestamp ?? Date.now()) / 1000),
      source: quote.provider,
      currency: quote.currency ?? null,
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
      // If the quote endpoint is missing or degraded, fall back to the last real candle close.
      const candles = await getCandles(symbol, { interval: "5min", points: 2 }, "auto");
      const last = Array.isArray(candles) && candles.length ? candles[candles.length - 1] : null;
      if (!last || !Number.isFinite(last.c) || last.c <= 0) return null;
      return {
        price: last.c,
        ts: Math.floor((last.t ?? Date.now()) / 1000),
        source: "market-client-candle-fallback",
        currency: null,
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

/**
 * getQuotes:
 * - returns a map SYMBOL -> Quote
 * - TTL defaults 60s
 * - uses the normalized market client so focus symbols follow the same rules as candles
 */
export async function getQuotes(args: { symbols: string[]; mode: AutopilotMode; ttlSec?: number }) {
  const ttlSec = Math.max(15, Math.min(3600, args.ttlSec ?? 60));
  const out: Record<string, Quote> = {};
  const symbols = Array.from(new Set((args.symbols ?? []).map(normSymbol))).filter(Boolean);

  const tasks = symbols.map(async (sym) => {
    try {
      const cacheKey = `q:${sym}`;
      const cached = getCache(cacheKey, ttlSec);
      if (cached) {
        out[sym] = cached;
        return;
      }

      let inflight = INFLIGHT_QUOTES.get(cacheKey);
      if (!inflight) {
        inflight = normalizedQuote(sym).finally(() => {
          INFLIGHT_QUOTES.delete(cacheKey);
        });
        INFLIGHT_QUOTES.set(cacheKey, inflight);
      }

      const quote = await inflight;
      if (!quote) return;
      setCache(cacheKey, quote);
      out[sym] = quote;
    } catch {
      // Never fail the daily bundle due to a single quote provider error.
    }
  });

  await Promise.all(tasks);
  return out;
}
