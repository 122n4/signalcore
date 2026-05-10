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
import { tdQuoteNormalized, tdCandles } from "@/lib/market/providers/twelvedata";

export type ProviderPref = "auto" | "binance" | "coinbase" | "finnhub" | "twelvedata";
type ConcreteProviderPref = Exclude<ProviderPref, "auto">;

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

  return String(process.env.TWELVEDATA_API_KEY || "").trim().length > 0;
}

export function hasAnyMarketDataProviderConfigured() {
  return hasProviderKey("finnhub") || hasProviderKey("twelvedata");
}

function resolveProviderOrder(kind: AssetKind, pref: ProviderPref): ConcreteProviderPref[] {
  const baseOrder: ConcreteProviderPref[] =
    pref === "auto"
      ? kind === "crypto"
        ? ["coinbase", "binance", "twelvedata", "finnhub"]
        : kind === "equity"
          ? ["finnhub", "twelvedata"]
          : ["twelvedata", "finnhub"]
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
      ? ["finnhub", "binance", "twelvedata"]
      : ["finnhub", "twelvedata"];
  }

  return kind === "crypto"
    ? ["twelvedata", "coinbase", "binance", "finnhub"]
    : ["twelvedata", "finnhub"];
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
    try {
      if (p === "coinbase") return await coinbaseQuote(symbol, undefined, options);
      if (p === "binance") return await binanceQuote(symbol, undefined, options);
      if (p === "finnhub") return await finnhubQuote(symbol, undefined, options);
      if (p === "twelvedata") return await tdQuoteNormalized(symbol, undefined, options);
    } catch (e: any) {
      providerErrors[p] = e?.message ?? "provider_failed";
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
    try {
      if (p === "coinbase") return await coinbaseCandles(symbol, tf, undefined, options);
      if (p === "binance") return await binanceCandles(symbol, tf, undefined, options);
      if (p === "finnhub") return await finnhubCandles(symbol, tf, undefined, options);
      if (p === "twelvedata") return await tdCandles(symbol, tf, undefined, options);
    } catch (e: any) {
      providerErrors[p] = e?.message ?? "provider_failed";
    }
  }

  throw new Error(formatProviderErrors(providerErrors) ?? "All candles providers failed");
}
