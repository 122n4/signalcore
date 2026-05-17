// lib/market/marketClient.ts
import type {
  Candle,
  QuoteNormalized,
  Timeframe,
  AssetKind,
  MarketFetchOptions,
} from "@/lib/market/types";
import { inferAssetKind } from "@/lib/market/symbols";
import { alphaVantageCandles, alphaVantageQuote } from "@/lib/market/providers/alphavantage";
import { binanceQuote, binanceCandles } from "@/lib/market/providers/binance";
import { coinbaseCandles, coinbaseQuote } from "@/lib/market/providers/coinbase";
import { finnhubQuote, finnhubCandles } from "@/lib/market/providers/finnhub";
import { fmpCandles, fmpQuote } from "@/lib/market/providers/fmp";
import { krakenCandles, krakenQuote } from "@/lib/market/providers/kraken";
import { tdQuoteNormalized, tdCandles } from "@/lib/market/providers/twelvedata";
import { hasTwelveDataApiKey } from "@/lib/market/providers/twelvedataKeyPool";

export type ProviderPref = "alphavantage" | "auto" | "binance" | "coinbase" | "finnhub" | "fmp" | "kraken" | "twelvedata";
type ConcreteProviderPref = Exclude<ProviderPref, "auto">;
type ProviderCooldown = {
  until: number;
  reason: string;
};
type LastGoodEntry<T> = {
  value: T;
  savedAt: number;
};

const g = globalThis as any;
if (!g.__sc_market_provider_cooldowns) {
  g.__sc_market_provider_cooldowns = new Map<ConcreteProviderPref, ProviderCooldown>();
}
if (!g.__sc_market_last_good_quotes) {
  g.__sc_market_last_good_quotes = new Map<string, LastGoodEntry<QuoteNormalized>>();
}
if (!g.__sc_market_last_good_candles) {
  g.__sc_market_last_good_candles = new Map<string, LastGoodEntry<Candle[]>>();
}

const PROVIDER_COOLDOWNS: Map<ConcreteProviderPref, ProviderCooldown> =
  g.__sc_market_provider_cooldowns;
const LAST_GOOD_QUOTES: Map<string, LastGoodEntry<QuoteNormalized>> =
  g.__sc_market_last_good_quotes;
const LAST_GOOD_CANDLES: Map<string, LastGoodEntry<Candle[]>> =
  g.__sc_market_last_good_candles;

function rateLimitCooldownMs(message: string) {
  const normalized = message.toLowerCase();
  if (
    normalized.includes("current minute") ||
    normalized.includes("minute") ||
    normalized.includes("(429)") ||
    normalized.includes("rate limit")
  ) {
    return 75_000;
  }

  if (
    normalized.includes("api credits") ||
    normalized.includes("quota") ||
    normalized.includes("limit")
  ) {
    return 10 * 60_000;
  }

  return 0;
}

function registerProviderFailure(provider: ConcreteProviderPref, error: unknown) {
  const message = String((error as any)?.message ?? error ?? "provider_failed");
  const cooldownMs = rateLimitCooldownMs(message);
  if (cooldownMs > 0) {
    PROVIDER_COOLDOWNS.set(provider, {
      until: Date.now() + cooldownMs,
      reason: message,
    });
  }

  return message;
}

function isProviderCoolingDown(provider: ConcreteProviderPref) {
  const cooldown = PROVIDER_COOLDOWNS.get(provider);
  if (!cooldown) return null;
  if (Date.now() >= cooldown.until) {
    PROVIDER_COOLDOWNS.delete(provider);
    return null;
  }

  return cooldown;
}

export function resetMarketClientProviderCooldownsForTests() {
  PROVIDER_COOLDOWNS.clear();
  LAST_GOOD_QUOTES.clear();
  LAST_GOOD_CANDLES.clear();
}

function hasProviderKey(provider: ConcreteProviderPref) {
  if (provider === "alphavantage") {
    return String(process.env.ALPHAVANTAGE_API_KEY || process.env.ALPHA_VANTAGE_API_KEY || "").trim().length > 0;
  }

  if (provider === "binance") {
    return true;
  }

  if (provider === "coinbase") {
    return true;
  }

  if (provider === "kraken") {
    return true;
  }

  if (provider === "finnhub") {
    return String(process.env.FINNHUB_API_KEY || "").trim().length > 0;
  }

  if (provider === "fmp") {
    return String(process.env.FMP_API_KEY || process.env.FINANCIAL_MODELING_PREP_API_KEY || "").trim().length > 0;
  }

  return hasTwelveDataApiKey();
}

export function hasAnyMarketDataProviderConfigured() {
  return (
    hasProviderKey("alphavantage") ||
    hasProviderKey("binance") ||
    hasProviderKey("coinbase") ||
    hasProviderKey("finnhub") ||
    hasProviderKey("fmp") ||
    hasProviderKey("kraken") ||
    hasProviderKey("twelvedata")
  );
}

function resolveProviderOrder(kind: AssetKind, pref: ProviderPref): ConcreteProviderPref[] {
  const baseOrder: ConcreteProviderPref[] =
    pref === "auto"
      ? kind === "crypto"
        ? ["coinbase", "binance", "kraken", "fmp", "twelvedata", "finnhub"]
        : kind === "equity"
          ? ["finnhub", "fmp", "twelvedata", "alphavantage"]
          : kind === "forex"
            ? ["twelvedata", "fmp", "finnhub", "alphavantage"]
            : ["twelvedata", "fmp", "finnhub"]
      : resolveExplicitProviderOrder(kind, pref);

  const configured = baseOrder.filter((provider, index, values) => {
    return hasProviderKey(provider) && values.indexOf(provider) === index;
  });

  return configured.length > 0 ? configured : baseOrder.filter((provider, index, values) => values.indexOf(provider) === index);
}

function formatProviderErrors(errors: Partial<Record<Exclude<ProviderPref, "auto">, string>>) {
  const parts = Object.entries(errors)
    .filter((entry): entry is [Exclude<ProviderPref, "auto">, string] => Boolean(entry[1]))
    .map(([provider, message]) => `${provider}:${message}`);

  return parts.length > 0 ? parts.join(" | ") : null;
}

function resolveExplicitProviderOrder(
  kind: AssetKind,
  pref: ConcreteProviderPref,
): ConcreteProviderPref[] {
  if (pref === "binance") {
    return ["binance", "kraken", "twelvedata", "finnhub"];
  }

  if (pref === "coinbase") {
    return ["coinbase", "binance", "kraken", "twelvedata", "finnhub"];
  }

  if (pref === "finnhub") {
    return kind === "crypto"
      ? ["finnhub", "binance", "kraken", "fmp", "twelvedata"]
      : kind === "forex" || kind === "equity"
        ? ["finnhub", "fmp", "twelvedata", "alphavantage"]
        : ["finnhub", "fmp", "twelvedata"];
  }

  if (pref === "fmp") {
    return kind === "crypto"
      ? ["fmp", "coinbase", "binance", "kraken", "twelvedata", "finnhub"]
      : kind === "forex" || kind === "equity"
        ? ["fmp", "twelvedata", "finnhub", "alphavantage"]
        : ["fmp", "twelvedata", "finnhub"];
  }

  if (pref === "kraken") {
    return kind === "crypto"
      ? ["kraken", "coinbase", "binance", "fmp", "twelvedata", "finnhub"]
      : resolveProviderOrder(kind, "auto");
  }

  if (pref === "alphavantage") {
    return kind === "crypto"
      ? ["coinbase", "binance", "kraken", "fmp", "twelvedata", "finnhub"]
      : kind === "forex" || kind === "equity"
        ? ["alphavantage", "fmp", "twelvedata", "finnhub"]
        : ["twelvedata", "fmp", "finnhub"];
  }

  return kind === "crypto"
    ? ["twelvedata", "coinbase", "binance", "kraken", "fmp", "finnhub"]
    : kind === "forex" || kind === "equity"
      ? ["twelvedata", "fmp", "finnhub", "alphavantage"]
      : ["twelvedata", "fmp", "finnhub"];
}

function staleFallbackMs() {
  const configured = Number(process.env.MARKET_DATA_STALE_FALLBACK_MS ?? 6 * 60 * 60_000);
  return Number.isFinite(configured) ? Math.max(0, configured) : 6 * 60 * 60_000;
}

function quoteCacheKey(symbol: string, pref: ProviderPref) {
  return `${pref}:${symbol.toUpperCase()}`;
}

function candlesCacheKey(symbol: string, tf: Timeframe, pref: ProviderPref) {
  return `${pref}:${symbol.toUpperCase()}:${tf.interval}:${tf.points ?? "default"}`;
}

function getLastGood<T>(store: Map<string, LastGoodEntry<T>>, key: string): T | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() - entry.savedAt > staleFallbackMs()) {
    store.delete(key);
    return null;
  }
  return entry.value;
}

function setLastGood<T>(store: Map<string, LastGoodEntry<T>>, key: string, value: T) {
  store.set(key, {
    value,
    savedAt: Date.now(),
  });
}

export async function getQuote(
  symbol: string,
  pref: ProviderPref = "auto",
  options?: MarketFetchOptions,
): Promise<QuoteNormalized> {
  const kind: AssetKind = inferAssetKind(symbol);
  const order = resolveProviderOrder(kind, pref);
  const providerErrors: Partial<Record<Exclude<ProviderPref, "auto">, string>> = {};
  const lastGoodKey = quoteCacheKey(symbol, pref);

  if (order.length === 0) {
    throw new Error("No configured market data providers");
  }

  for (const p of order) {
    const cooldown = isProviderCoolingDown(p);
    if (cooldown) {
      providerErrors[p] = `cooldown_active:${cooldown.reason}`;
      continue;
    }

    try {
      let quote: QuoteNormalized | null = null;
      if (p === "alphavantage") quote = await alphaVantageQuote(symbol, undefined, options);
      if (p === "coinbase") quote = await coinbaseQuote(symbol, undefined, options);
      if (p === "binance") quote = await binanceQuote(symbol, undefined, options);
      if (p === "finnhub") quote = await finnhubQuote(symbol, undefined, options);
      if (p === "fmp") quote = await fmpQuote(symbol, undefined, options);
      if (p === "kraken") quote = await krakenQuote(symbol, undefined, options);
      if (p === "twelvedata") quote = await tdQuoteNormalized(symbol, undefined, options);
      if (quote) {
        setLastGood(LAST_GOOD_QUOTES, lastGoodKey, quote);
        return quote;
      }
    } catch (e: any) {
      providerErrors[p] = registerProviderFailure(p, e);
    }
  }

  const stale = getLastGood(LAST_GOOD_QUOTES, lastGoodKey);
  if (stale) return stale;

  throw new Error(formatProviderErrors(providerErrors) ?? "All quote providers failed");
}

export async function getCandles(
  symbol: string,
  tf: Timeframe,
  pref: ProviderPref = "auto",
  options?: MarketFetchOptions,
): Promise<Candle[]> {
  const kind: AssetKind = inferAssetKind(symbol);
  const order = resolveProviderOrder(kind, pref);
  const providerErrors: Partial<Record<Exclude<ProviderPref, "auto">, string>> = {};
  const lastGoodKey = candlesCacheKey(symbol, tf, pref);

  if (order.length === 0) {
    throw new Error("No configured market data providers");
  }

  for (const p of order) {
    const cooldown = isProviderCoolingDown(p);
    if (cooldown) {
      providerErrors[p] = `cooldown_active:${cooldown.reason}`;
      continue;
    }

    try {
      let candles: Candle[] | null = null;
      if (p === "alphavantage") candles = await alphaVantageCandles(symbol, tf, undefined, options);
      if (p === "coinbase") candles = await coinbaseCandles(symbol, tf, undefined, options);
      if (p === "binance") candles = await binanceCandles(symbol, tf, undefined, options);
      if (p === "finnhub") candles = await finnhubCandles(symbol, tf, undefined, options);
      if (p === "fmp") candles = await fmpCandles(symbol, tf, undefined, options);
      if (p === "kraken") candles = await krakenCandles(symbol, tf, undefined, options);
      if (p === "twelvedata") candles = await tdCandles(symbol, tf, undefined, options);
      if (candles && candles.length > 0) {
        setLastGood(LAST_GOOD_CANDLES, lastGoodKey, candles);
        return candles;
      }
    } catch (e: any) {
      providerErrors[p] = registerProviderFailure(p, e);
    }
  }

  const stale = getLastGood(LAST_GOOD_CANDLES, lastGoodKey);
  if (stale) return stale;

  throw new Error(formatProviderErrors(providerErrors) ?? "All candles providers failed");
}
