// lib/market/marketClient.ts
import type {
  Candle,
  QuoteNormalized,
  Timeframe,
  AssetKind,
  MarketFetchOptions,
} from "@/lib/market/types";
import { inferAssetKind } from "@/lib/market/symbols";
import { binanceQuote, binanceCandles } from "@/lib/market/providers/binance";
import { coinbaseCandles, coinbaseQuote } from "@/lib/market/providers/coinbase";
import { finnhubQuote, finnhubCandles } from "@/lib/market/providers/finnhub";
import { fmpCandles, fmpQuote } from "@/lib/market/providers/fmp";
import { tdQuoteNormalized, tdCandles } from "@/lib/market/providers/twelvedata";
import { hasTwelveDataApiKey } from "@/lib/market/providers/twelvedataKeyPool";

export type ProviderPref = "auto" | "binance" | "coinbase" | "finnhub" | "fmp" | "twelvedata";
type ConcreteProviderPref = Exclude<ProviderPref, "auto">;
type ProviderCooldown = {
  until: number;
  reason: string;
};

const g = globalThis as any;
if (!g.__sc_market_provider_cooldowns) {
  g.__sc_market_provider_cooldowns = new Map<ConcreteProviderPref, ProviderCooldown>();
}

const PROVIDER_COOLDOWNS: Map<ConcreteProviderPref, ProviderCooldown> =
  g.__sc_market_provider_cooldowns;

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
}

function hasProviderKey(provider: ConcreteProviderPref) {
  if (provider === "binance") {
    return true;
  }

  if (provider === "coinbase") {
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
  return hasProviderKey("finnhub") || hasProviderKey("twelvedata");
}

function resolveProviderOrder(kind: AssetKind, pref: ProviderPref): ConcreteProviderPref[] {
  const baseOrder: ConcreteProviderPref[] =
    pref === "auto"
      ? kind === "crypto"
        ? ["coinbase", "binance", "fmp", "twelvedata", "finnhub"]
        : kind === "equity"
          ? ["finnhub", "fmp", "twelvedata"]
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
    return ["binance", "twelvedata", "finnhub"];
  }

  if (pref === "coinbase") {
    return ["coinbase", "binance", "twelvedata", "finnhub"];
  }

  if (pref === "finnhub") {
    return kind === "crypto"
      ? ["finnhub", "binance", "fmp", "twelvedata"]
      : ["finnhub", "fmp", "twelvedata"];
  }

  if (pref === "fmp") {
    return kind === "crypto"
      ? ["fmp", "coinbase", "binance", "twelvedata", "finnhub"]
      : ["fmp", "twelvedata", "finnhub"];
  }

  return kind === "crypto"
    ? ["twelvedata", "coinbase", "binance", "fmp", "finnhub"]
    : ["twelvedata", "fmp", "finnhub"];
}

export async function getQuote(
  symbol: string,
  pref: ProviderPref = "auto",
  options?: MarketFetchOptions,
): Promise<QuoteNormalized> {
  const kind: AssetKind = inferAssetKind(symbol);
  const order = resolveProviderOrder(kind, pref);
  const providerErrors: Partial<Record<Exclude<ProviderPref, "auto">, string>> = {};

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
      if (p === "coinbase") return await coinbaseQuote(symbol, undefined, options);
      if (p === "binance") return await binanceQuote(symbol, undefined, options);
      if (p === "finnhub") return await finnhubQuote(symbol, undefined, options);
      if (p === "fmp") return await fmpQuote(symbol, undefined, options);
      if (p === "twelvedata") return await tdQuoteNormalized(symbol, undefined, options);
    } catch (e: any) {
      providerErrors[p] = registerProviderFailure(p, e);
    }
  }

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
      if (p === "coinbase") return await coinbaseCandles(symbol, tf, undefined, options);
      if (p === "binance") return await binanceCandles(symbol, tf, undefined, options);
      if (p === "finnhub") return await finnhubCandles(symbol, tf, undefined, options);
      if (p === "fmp") return await fmpCandles(symbol, tf, undefined, options);
      if (p === "twelvedata") return await tdCandles(symbol, tf, undefined, options);
    } catch (e: any) {
      providerErrors[p] = registerProviderFailure(p, e);
    }
  }

  throw new Error(formatProviderErrors(providerErrors) ?? "All candles providers failed");
}
