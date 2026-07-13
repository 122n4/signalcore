// lib/market/marketClient.ts
import type {
  Candle,
  CandleSeries,
  QuoteNormalized,
  Timeframe,
  AssetKind,
  MarketFetchOptions,
  MarketCacheState,
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
type ProviderCallKind = "quote" | "candles";
type ProviderErrorType =
  | "cooldown"
  | "empty"
  | "forbidden"
  | "missing_key"
  | "not_found"
  | "provider_error"
  | "quota"
  | "rate_limit"
  | "timeout"
  | "unsupported";
type ProviderCooldown = {
  until: number;
  reason: string;
};
type LastGoodEntry<T> = {
  value: T;
  savedAt: number;
};
type ProviderCallTelemetry = {
  at: string;
  provider: ConcreteProviderPref;
  kind: ProviderCallKind;
  assetKind: AssetKind;
  symbol: string;
  timeframe?: string;
  purpose: NonNullable<MarketFetchOptions["purpose"]>;
  ok: boolean;
  errorType?: ProviderErrorType;
  message?: string;
  elapsedMs: number;
};

export type MarketClientTelemetrySummary = {
  generatedAt: string;
  windowSize: number;
  providers: Record<
    ConcreteProviderPref,
    {
      calls: number;
      successes: number;
      failures: number;
      successRate: number | null;
      lastSuccessAt: string | null;
      lastFailureAt: string | null;
      cooldownUntil: string | null;
      cooldownReason: string | null;
      errorBreakdown: Partial<Record<ProviderErrorType, number>>;
    }
  >;
  recent: ProviderCallTelemetry[];
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
if (!g.__sc_market_inflight_quotes) {
  g.__sc_market_inflight_quotes = new Map<string, Promise<QuoteNormalized>>();
}
if (!g.__sc_market_inflight_candles) {
  g.__sc_market_inflight_candles = new Map<string, Promise<Candle[]>>();
}
if (!g.__sc_market_provider_telemetry) {
  g.__sc_market_provider_telemetry = [] as ProviderCallTelemetry[];
}

const PROVIDER_COOLDOWNS: Map<ConcreteProviderPref, ProviderCooldown> =
  g.__sc_market_provider_cooldowns;
const LAST_GOOD_QUOTES: Map<string, LastGoodEntry<QuoteNormalized>> =
  g.__sc_market_last_good_quotes;
const LAST_GOOD_CANDLES: Map<string, LastGoodEntry<Candle[]>> =
  g.__sc_market_last_good_candles;
const INFLIGHT_QUOTES: Map<string, Promise<QuoteNormalized>> =
  g.__sc_market_inflight_quotes;
const INFLIGHT_CANDLES: Map<string, Promise<Candle[]>> =
  g.__sc_market_inflight_candles;
const PROVIDER_TELEMETRY: ProviderCallTelemetry[] =
  g.__sc_market_provider_telemetry;
const TELEMETRY_WINDOW = 600;

function providerPurpose(options?: MarketFetchOptions): NonNullable<MarketFetchOptions["purpose"]> {
  return options?.purpose ?? "system";
}

function classifyProviderError(error: unknown): { type: ProviderErrorType; message: string } {
  const message = String((error as any)?.message ?? error ?? "provider_failed");
  const normalized = message.toLowerCase();

  if (normalized.includes("cooldown_active")) return { type: "cooldown", message };
  if (normalized.includes("missing") && normalized.includes("key")) return { type: "missing_key", message };
  if (normalized.includes("unsupported")) return { type: "unsupported", message };
  if (normalized.includes("(403)") || normalized.includes("forbidden") || normalized.includes("unauthorized")) {
    return { type: "forbidden", message };
  }
  if (normalized.includes("(404)") || normalized.includes("not found") || normalized.includes("unknown symbol")) {
    return { type: "not_found", message };
  }
  if (normalized.includes("timeout") || normalized.includes("timed out") || normalized.includes("etimedout") || normalized.includes("aborted")) {
    return { type: "timeout", message };
  }
  if (
    normalized.includes("current minute") ||
    normalized.includes("minute") ||
    normalized.includes("(429)") ||
    normalized.includes("rate limit")
  ) {
    return { type: "rate_limit", message };
  }

  if (
    normalized.includes("api credits") ||
    normalized.includes("quota") ||
    normalized.includes("limit")
  ) {
    return { type: "quota", message };
  }

  if (normalized.includes("no candles") || normalized.includes("empty") || normalized.includes("insufficient")) {
    return { type: "empty", message };
  }

  return { type: "provider_error", message };
}

function rateLimitCooldownMs(message: string) {
  const { type } = classifyProviderError(message);
  if (type === "rate_limit") return 75_000;
  if (type === "quota") return 10 * 60_000;
  if (type === "timeout") return 30_000;
  return 0;
}

function pushTelemetry(entry: ProviderCallTelemetry) {
  PROVIDER_TELEMETRY.push(entry);
  if (PROVIDER_TELEMETRY.length > TELEMETRY_WINDOW) {
    PROVIDER_TELEMETRY.splice(0, PROVIDER_TELEMETRY.length - TELEMETRY_WINDOW);
  }
}

function recordProviderCall(input: Omit<ProviderCallTelemetry, "at">) {
  pushTelemetry({
    ...input,
    at: new Date().toISOString(),
  });
}

function registerProviderFailure(provider: ConcreteProviderPref, error: unknown) {
  const { message, type } = classifyProviderError(error);
  const cooldownMs = rateLimitCooldownMs(message);
  if (cooldownMs > 0) {
    PROVIDER_COOLDOWNS.set(provider, {
      until: Date.now() + cooldownMs,
      reason: message,
    });
  }

  return { message, type };
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
  INFLIGHT_QUOTES.clear();
  INFLIGHT_CANDLES.clear();
  PROVIDER_TELEMETRY.splice(0, PROVIDER_TELEMETRY.length);
}

const PROVIDERS: ConcreteProviderPref[] = [
  "alphavantage",
  "binance",
  "coinbase",
  "finnhub",
  "fmp",
  "kraken",
  "twelvedata",
];

export function getMarketClientTelemetrySummary(): MarketClientTelemetrySummary {
  const providers = Object.fromEntries(
    PROVIDERS.map((provider) => [
      provider,
      {
        calls: 0,
        successes: 0,
        failures: 0,
        successRate: null,
        lastSuccessAt: null,
        lastFailureAt: null,
        cooldownUntil: null,
        cooldownReason: null,
        errorBreakdown: {},
      },
    ]),
  ) as MarketClientTelemetrySummary["providers"];

  for (const entry of PROVIDER_TELEMETRY) {
    const bucket = providers[entry.provider];
    bucket.calls += 1;
    if (entry.ok) {
      bucket.successes += 1;
      bucket.lastSuccessAt = entry.at;
    } else {
      bucket.failures += 1;
      bucket.lastFailureAt = entry.at;
      const type = entry.errorType ?? "provider_error";
      bucket.errorBreakdown[type] = (bucket.errorBreakdown[type] ?? 0) + 1;
    }
  }

  for (const provider of PROVIDERS) {
    const bucket = providers[provider];
    bucket.successRate = bucket.calls > 0 ? Math.round((bucket.successes / bucket.calls) * 10000) / 100 : null;
    const cooldown = isProviderCoolingDown(provider);
    if (cooldown) {
      bucket.cooldownUntil = new Date(cooldown.until).toISOString();
      bucket.cooldownReason = cooldown.reason;
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    windowSize: PROVIDER_TELEMETRY.length,
    providers,
    recent: PROVIDER_TELEMETRY.slice(-50),
  };
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

function providerSupports(
  provider: ConcreteProviderPref,
  kind: AssetKind,
  callKind: ProviderCallKind,
) {
  if (provider === "alphavantage") {
    return kind === "equity" || kind === "forex";
  }

  if (provider === "binance" || provider === "coinbase" || provider === "kraken") {
    return kind === "crypto";
  }

  if (provider === "finnhub") {
    return kind === "equity" || kind === "forex" || kind === "crypto";
  }

  if (provider === "fmp") {
    return kind === "equity" || kind === "forex" || kind === "crypto" || kind === "metal" || kind === "index";
  }

  if (provider === "twelvedata") {
    return kind === "equity" || kind === "forex" || kind === "crypto" || kind === "metal" || kind === "index";
  }

  return callKind === "quote" || callKind === "candles";
}

function filterProviderOrder(
  order: ConcreteProviderPref[],
  kind: AssetKind,
  callKind: ProviderCallKind,
) {
  const unique = order.filter((provider, index, values) => values.indexOf(provider) === index);
  return unique.filter((provider) => providerSupports(provider, kind, callKind));
}

function resolveProviderOrder(kind: AssetKind, pref: ProviderPref): ConcreteProviderPref[] {
  const baseOrder: ConcreteProviderPref[] =
    pref === "auto"
      ? kind === "crypto"
        ? ["coinbase", "binance", "kraken", "twelvedata", "fmp", "finnhub"]
        : kind === "equity"
          ? ["finnhub", "fmp", "alphavantage", "twelvedata"]
          : kind === "forex"
            ? ["twelvedata", "finnhub", "alphavantage", "fmp"]
            : kind === "metal"
              ? ["twelvedata", "fmp"]
              : ["fmp", "twelvedata"]
      : resolveExplicitProviderOrder(kind, pref);
  const supported = filterProviderOrder(baseOrder, kind, "candles");

  const configured = supported.filter((provider) => hasProviderKey(provider));

  return configured.length > 0 ? configured : supported;
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

function quoteRequestKey(symbol: string, pref: ProviderPref, options?: MarketFetchOptions) {
  return `${quoteCacheKey(symbol, pref)}:${options?.extendedHours ? "extended" : "regular"}`;
}

function candlesRequestKey(symbol: string, tf: Timeframe, pref: ProviderPref, options?: MarketFetchOptions) {
  return `${candlesCacheKey(symbol, tf, pref)}:${options?.extendedHours ? "extended" : "regular"}`;
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

function buildCacheState(args: {
  stale: boolean;
  servedFromFallback: boolean;
  lastGoodAt: number | null;
}): MarketCacheState {
  return {
    stale: args.stale,
    servedFromFallback: args.servedFromFallback,
    state: args.servedFromFallback ? "last_known_good" : "fresh",
    lastGoodAt: args.lastGoodAt,
  };
}

function withQuoteCacheState(
  quote: QuoteNormalized,
  cacheState: MarketCacheState,
): QuoteNormalized {
  return {
    ...quote,
    cacheState,
  };
}

function withCandleSeriesCacheState(
  candles: Candle[],
  cacheState: MarketCacheState,
): CandleSeries {
  const series = [...candles] as CandleSeries;
  series.cacheState = cacheState;
  return series;
}

export async function getQuote(
  symbol: string,
  pref: ProviderPref = "auto",
  options?: MarketFetchOptions,
): Promise<QuoteNormalized> {
  if (options?.bypassInFlightDedupe) {
    return getQuoteInternal(symbol, pref, options);
  }

  const requestKey = quoteRequestKey(symbol, pref, options);
  const inflight = INFLIGHT_QUOTES.get(requestKey);
  if (inflight) return inflight;

  const promise = getQuoteInternal(symbol, pref, options).finally(() => {
    INFLIGHT_QUOTES.delete(requestKey);
  });
  INFLIGHT_QUOTES.set(requestKey, promise);
  return promise;
}

async function getQuoteInternal(
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
      recordProviderCall({
        provider: p,
        kind: "quote",
        assetKind: kind,
        symbol,
        purpose: providerPurpose(options),
        ok: false,
        errorType: "cooldown",
        message: providerErrors[p],
        elapsedMs: 0,
      });
      continue;
    }

    const startedAt = Date.now();
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
        const normalizedQuote = withQuoteCacheState(
          quote,
          buildCacheState({
            stale: false,
            servedFromFallback: false,
            lastGoodAt: null,
          }),
        );
        recordProviderCall({
          provider: p,
          kind: "quote",
          assetKind: kind,
          symbol,
          purpose: providerPurpose(options),
          ok: true,
          elapsedMs: Date.now() - startedAt,
        });
        setLastGood(LAST_GOOD_QUOTES, lastGoodKey, normalizedQuote);
        return normalizedQuote;
      }
      providerErrors[p] = "empty_quote_response";
      recordProviderCall({
        provider: p,
        kind: "quote",
        assetKind: kind,
        symbol,
        purpose: providerPurpose(options),
        ok: false,
        errorType: "empty",
        message: providerErrors[p],
        elapsedMs: Date.now() - startedAt,
      });
    } catch (e: any) {
      const failure = registerProviderFailure(p, e);
      providerErrors[p] = failure.message;
      recordProviderCall({
        provider: p,
        kind: "quote",
        assetKind: kind,
        symbol,
        purpose: providerPurpose(options),
        ok: false,
        errorType: failure.type,
        message: failure.message,
        elapsedMs: Date.now() - startedAt,
      });
    }
  }

  const stale = getLastGood(LAST_GOOD_QUOTES, lastGoodKey);
  if (stale) {
    const staleSavedAt = LAST_GOOD_QUOTES.get(lastGoodKey)?.savedAt ?? null;
    return withQuoteCacheState(
      stale,
      buildCacheState({
        stale: true,
        servedFromFallback: true,
        lastGoodAt: staleSavedAt,
      }),
    );
  }

  throw new Error(formatProviderErrors(providerErrors) ?? "All quote providers failed");
}

export async function getCandles(
  symbol: string,
  tf: Timeframe,
  pref: ProviderPref = "auto",
  options?: MarketFetchOptions,
): Promise<CandleSeries> {
  if (options?.bypassInFlightDedupe) {
    return getCandlesInternal(symbol, tf, pref, options);
  }

  const requestKey = candlesRequestKey(symbol, tf, pref, options);
  const inflight = INFLIGHT_CANDLES.get(requestKey);
  if (inflight) return inflight;

  const promise = getCandlesInternal(symbol, tf, pref, options).finally(() => {
    INFLIGHT_CANDLES.delete(requestKey);
  });
  INFLIGHT_CANDLES.set(requestKey, promise);
  return promise;
}

async function getCandlesInternal(
  symbol: string,
  tf: Timeframe,
  pref: ProviderPref = "auto",
  options?: MarketFetchOptions,
): Promise<CandleSeries> {
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
      recordProviderCall({
        provider: p,
        kind: "candles",
        assetKind: kind,
        symbol,
        timeframe: `${tf.interval}:${tf.points ?? "default"}`,
        purpose: providerPurpose(options),
        ok: false,
        errorType: "cooldown",
        message: providerErrors[p],
        elapsedMs: 0,
      });
      continue;
    }

    const startedAt = Date.now();
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
        const normalizedCandles = withCandleSeriesCacheState(
          candles,
          buildCacheState({
            stale: false,
            servedFromFallback: false,
            lastGoodAt: null,
          }),
        );
        recordProviderCall({
          provider: p,
          kind: "candles",
          assetKind: kind,
          symbol,
          timeframe: `${tf.interval}:${tf.points ?? "default"}`,
          purpose: providerPurpose(options),
          ok: true,
          elapsedMs: Date.now() - startedAt,
        });
        setLastGood(LAST_GOOD_CANDLES, lastGoodKey, normalizedCandles);
        return normalizedCandles;
      }
      providerErrors[p] = "empty_candles_response";
      recordProviderCall({
        provider: p,
        kind: "candles",
        assetKind: kind,
        symbol,
        timeframe: `${tf.interval}:${tf.points ?? "default"}`,
        purpose: providerPurpose(options),
        ok: false,
        errorType: "empty",
        message: providerErrors[p],
        elapsedMs: Date.now() - startedAt,
      });
    } catch (e: any) {
      const failure = registerProviderFailure(p, e);
      providerErrors[p] = failure.message;
      recordProviderCall({
        provider: p,
        kind: "candles",
        assetKind: kind,
        symbol,
        timeframe: `${tf.interval}:${tf.points ?? "default"}`,
        purpose: providerPurpose(options),
        ok: false,
        errorType: failure.type,
        message: failure.message,
        elapsedMs: Date.now() - startedAt,
      });
    }
  }

  const stale = getLastGood(LAST_GOOD_CANDLES, lastGoodKey);
  if (stale) {
    const staleSavedAt = LAST_GOOD_CANDLES.get(lastGoodKey)?.savedAt ?? null;
    return withCandleSeriesCacheState(
      stale,
      buildCacheState({
        stale: true,
        servedFromFallback: true,
        lastGoodAt: staleSavedAt,
      }),
    );
  }

  throw new Error(formatProviderErrors(providerErrors) ?? "All candles providers failed");
}
