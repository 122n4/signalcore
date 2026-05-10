import type { TradingCandleInput, TradingTimeframe } from "@/lib/trading/data";

import { runTradingBacktest } from "./runner";
import {
  TRADING_BACKTEST_DEFAULT_TIMEFRAMES,
  resolveTradingHistoricalInstrument,
  type TradingHistoricalBacktestResult,
  type TradingHistoricalDataset,
  type TradingHistoricalDatasetRequest,
  type TradingHistoricalSourcePreference,
} from "./datasets";
import { loadLocalHistoricalTradingDataset } from "./localHistoricalLoader";
import { computeTradingHistoricalCoverage } from "./quality";
import type { TradingBacktestConfig } from "./types";

type TwelveDataHistoricalPoint = {
  datetime: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume?: string;
};

type TwelveDataHistoricalResponse = {
  values?: TwelveDataHistoricalPoint[];
  status?: string;
  message?: string;
};

const TWELVEDATA_INTERVAL_MAP: Record<TradingTimeframe, string> = {
  "1m": "1min",
  "5m": "5min",
  "15m": "15min",
  "1h": "1h",
  "4h": "4h",
  "1d": "1day",
};

const TRADING_TIMEFRAME_MS: Record<TradingTimeframe, number> = {
  "1m": 60_000,
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "1h": 60 * 60_000,
  "4h": 4 * 60 * 60_000,
  "1d": 24 * 60 * 60_000,
};

const HISTORICAL_CHUNK_BAR_LIMIT = 4_500;
const HISTORICAL_PROBE_WINDOW_MS: Record<TradingTimeframe, number> = {
  "1m": 3 * 24 * 60 * 60_000,
  "5m": 14 * 24 * 60 * 60_000,
  "15m": 31 * 24 * 60 * 60_000,
  "1h": 31 * 24 * 60 * 60_000,
  "4h": 90 * 24 * 60 * 60_000,
  "1d": 365 * 24 * 60 * 60_000,
};
const TWELVEDATA_RETRY_LIMIT = 3;
const TWELVEDATA_RATE_LIMIT_WAIT_MS = 65_000;

let nextAllowedTwelveDataRequestAt = 0;

function apiKey(): string {
  const key = process.env.TWELVEDATA_API_KEY;

  if (!key) {
    throw new Error("Missing TWELVEDATA_API_KEY for trading historical backtests.");
  }

  return key;
}

function toIso(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid historical dataset timestamp: ${value}`);
  }

  return date.toISOString();
}

function toProviderDateTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid provider datetime: ${value}`);
  }

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  const seconds = String(date.getUTCSeconds()).padStart(2, "0");

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function estimateOutputSize(from: string, to: string, timeframe: TradingTimeframe): number {
  const fromMs = new Date(from).getTime();
  const toMs = new Date(to).getTime();
  const durationMs = Math.max(0, toMs - fromMs);
  const bars = Math.ceil(durationMs / TRADING_TIMEFRAME_MS[timeframe]) + 8;

  return Math.max(50, Math.min(5000, bars));
}

function resolveChunkDurationMs(timeframe: TradingTimeframe): number {
  return TRADING_TIMEFRAME_MS[timeframe] * HISTORICAL_CHUNK_BAR_LIMIT;
}

function resolveProbeWindowMs(timeframe: TradingTimeframe): number {
  return HISTORICAL_PROBE_WINDOW_MS[timeframe];
}

function resolveRequestIntervalMs(): number {
  const configured = Number(process.env.TRADING_BACKTEST_TD_REQUEST_INTERVAL_MS ?? 0);
  return Number.isFinite(configured) && configured > 0 ? configured : 0;
}

function isNoDataMessage(message: string | undefined): boolean {
  return (message ?? "").includes("No data is available on the specified dates");
}

function isRateLimitMessage(message: string | undefined): boolean {
  return (message ?? "").includes("run out of API credits for the current minute");
}

async function wait(ms: number): Promise<void> {
  if (ms <= 0) {
    return;
  }

  await new Promise((resolve) => setTimeout(resolve, ms));
}

function parseNumber(value: string | undefined): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeHistoricalCandles(
  points: TwelveDataHistoricalPoint[],
  from: string,
  to: string,
): TradingCandleInput[] {
  const start = new Date(from).getTime();
  const end = new Date(to).getTime();

  const candles = points
    .map((point) => {
      const timestamp = new Date(point.datetime).toISOString();
      const open = parseNumber(point.open);
      const high = parseNumber(point.high);
      const low = parseNumber(point.low);
      const close = parseNumber(point.close);
      const volume = parseNumber(point.volume);

      if (
        open === null ||
        high === null ||
        low === null ||
        close === null
      ) {
        return null;
      }

      const at = new Date(timestamp).getTime();

      if (at < start || at > end) {
        return null;
      }

      return {
        timestamp,
        open,
        high,
        low,
        close,
        volume,
      };
    })
    .filter(Boolean) as TradingCandleInput[];

  return candles.sort(
    (left, right) =>
      new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime(),
  );
}

async function fetchHistoricalTimeframe(args: {
  symbol: string;
  timeframe: TradingTimeframe;
  from: string;
  to: string;
}): Promise<TradingCandleInput[]> {
  for (let attempt = 0; attempt < TWELVEDATA_RETRY_LIMIT; attempt += 1) {
    const requestIntervalMs = resolveRequestIntervalMs();
    const now = Date.now();

    if (requestIntervalMs > 0 && nextAllowedTwelveDataRequestAt > now) {
      await wait(nextAllowedTwelveDataRequestAt - now);
    }

    const url = new URL("https://api.twelvedata.com/time_series");
    url.searchParams.set("symbol", args.symbol);
    url.searchParams.set("interval", TWELVEDATA_INTERVAL_MAP[args.timeframe]);
    url.searchParams.set("start_date", toProviderDateTime(args.from));
    url.searchParams.set("end_date", toProviderDateTime(args.to));
    url.searchParams.set("order", "ASC");
    url.searchParams.set("timezone", "UTC");
    url.searchParams.set(
      "outputsize",
      String(estimateOutputSize(args.from, args.to, args.timeframe)),
    );
    url.searchParams.set("apikey", apiKey());

    const response = await fetch(url.toString(), {
      cache: "no-store",
    });
    nextAllowedTwelveDataRequestAt = Date.now() + requestIntervalMs;
    const json = (await response.json().catch(() => null)) as TwelveDataHistoricalResponse | null;

    if (!response.ok || !json) {
      throw new Error(`Historical time series request failed (${response.status}).`);
    }

    if (json.status === "error") {
      if (isNoDataMessage(json.message)) {
        return [];
      }

      if (isRateLimitMessage(json.message) && attempt < TWELVEDATA_RETRY_LIMIT - 1) {
        await wait(TWELVEDATA_RATE_LIMIT_WAIT_MS);
        continue;
      }

      throw new Error(json.message ?? "Historical time series request failed.");
    }

    return normalizeHistoricalCandles(json.values ?? [], args.from, args.to);
  }

  throw new Error("Historical time series request exceeded retry budget.");
}

async function probeFirstAvailableSegment(args: {
  symbol: string;
  timeframe: TradingTimeframe;
  from: string;
  to: string;
}): Promise<{
  candles: TradingCandleInput[];
  nextCursorMs: number;
} | null> {
  const startMs = new Date(args.from).getTime();
  const endMs = new Date(args.to).getTime();
  const probeWindowMs = resolveProbeWindowMs(args.timeframe);
  const totalWindows = Math.max(1, Math.ceil((endMs - startMs) / probeWindowMs));
  const cache = new Map<number, TradingCandleInput[]>();

  async function readProbeWindow(index: number): Promise<TradingCandleInput[]> {
    const cached = cache.get(index);

    if (cached) {
      return cached;
    }

    const probeStart = startMs + index * probeWindowMs;
    const probeEnd = Math.min(endMs, probeStart + probeWindowMs);
    const candles = await fetchHistoricalTimeframe({
      symbol: args.symbol,
      timeframe: args.timeframe,
      from: new Date(probeStart).toISOString(),
      to: new Date(probeEnd).toISOString(),
    });

    cache.set(index, candles);
    return candles;
  }

  let low = 0;
  let high = totalWindows - 1;
  let firstAvailableIndex = -1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const candles = await readProbeWindow(mid);

    if (candles.length > 0) {
      firstAvailableIndex = mid;
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }

  if (firstAvailableIndex < 0) {
    return null;
  }

  const firstCandles = await readProbeWindow(firstAvailableIndex);
  const firstProbeStart = startMs + firstAvailableIndex * probeWindowMs;
  const firstProbeEnd = Math.min(endMs, firstProbeStart + probeWindowMs);

  return {
    candles: firstCandles,
    nextCursorMs: firstProbeEnd + 1,
  };
}

function mergeChunkedCandles(chunks: TradingCandleInput[][]): TradingCandleInput[] {
  const deduped = new Map<string, TradingCandleInput>();

  for (const candles of chunks) {
    for (const candle of candles) {
      deduped.set(candle.timestamp instanceof Date ? candle.timestamp.toISOString() : String(candle.timestamp), candle);
    }
  }

  return Array.from(deduped.values()).sort(
    (left, right) =>
      new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime(),
  );
}

async function fetchHistoricalTimeframeRange(args: {
  symbol: string;
  timeframe: TradingTimeframe;
  from: string;
  to: string;
}): Promise<TradingCandleInput[]> {
  const firstAvailable = await probeFirstAvailableSegment(args);

  if (!firstAvailable) {
    return [];
  }

  const endMs = new Date(args.to).getTime();
  const chunkDurationMs = resolveChunkDurationMs(args.timeframe);
  const chunks: TradingCandleInput[][] = [firstAvailable.candles];

  let cursor = firstAvailable.nextCursorMs;

  while (cursor < endMs) {
    const chunkEnd = Math.min(endMs, cursor + chunkDurationMs);
    const candles = await fetchHistoricalTimeframe({
      symbol: args.symbol,
      timeframe: args.timeframe,
      from: new Date(cursor).toISOString(),
      to: new Date(chunkEnd).toISOString(),
    });

    chunks.push(candles);

    if (chunkEnd >= endMs) {
      break;
    }

    cursor = chunkEnd + 1;
  }

  return mergeChunkedCandles(chunks);
}

function resolveHistoricalSourcePreference(
  preferred?: TradingHistoricalSourcePreference,
): TradingHistoricalSourcePreference {
  if (preferred) {
    return preferred;
  }

  const envPreferred = process.env.TRADING_BACKTEST_SOURCE_PREFERENCE;

  if (envPreferred === "local_first" || envPreferred === "local_only" || envPreferred === "api_only") {
    return envPreferred;
  }

  return "local_first";
}

async function loadProviderHistoricalTradingDataset(
  request: TradingHistoricalDatasetRequest,
): Promise<TradingHistoricalDataset> {
  const instrument = resolveTradingHistoricalInstrument(request.instrument);
  const from = toIso(request.from);
  const to = toIso(request.to);

  if (new Date(from).getTime() >= new Date(to).getTime()) {
    throw new Error("Historical backtest range requires from < to.");
  }

  const timeframes = request.timeframes?.length
    ? request.timeframes
    : TRADING_BACKTEST_DEFAULT_TIMEFRAMES;
  const requiredTimeframes = timeframes.filter((timeframe) => timeframe !== "5m");
  let lastMissingRequired = requiredTimeframes;
  let lastFailureReason: string | null = null;

  for (const dataSymbol of instrument.dataSymbols) {
    const loadedAt = new Date().toISOString();
    const datasetTimeframes: Partial<Record<TradingTimeframe, TradingCandleInput[]>> = {};
    const candleCounts: Partial<Record<TradingTimeframe, number>> = {};
    const timeframeErrors: Partial<Record<TradingTimeframe, string>> = {};

    for (const timeframe of timeframes) {
      try {
        const candles = await fetchHistoricalTimeframeRange({
          symbol: dataSymbol.symbol,
          timeframe,
          from,
          to,
        });

        if (candles.length === 0) {
          continue;
        }

        datasetTimeframes[timeframe] = candles;
        candleCounts[timeframe] = candles.length;
      } catch (error) {
        timeframeErrors[timeframe] = error instanceof Error ? error.message : String(error);
        continue;
      }
    }

    const missingRequired = requiredTimeframes.filter(
      (timeframe) => (datasetTimeframes[timeframe]?.length ?? 0) === 0,
    );
    lastMissingRequired = missingRequired;

    if (missingRequired.length > 0) {
      const requiredErrors = missingRequired
        .map((timeframe) => timeframeErrors[timeframe])
        .filter((message): message is string => Boolean(message));

      if (requiredErrors.length > 0) {
        lastFailureReason = `Historical dataset fetch failed for ${instrument.instrument} (${dataSymbol.symbol}): ${requiredErrors.join(" | ")}`;
      } else {
        lastFailureReason = `Historical dataset missing required timeframes for ${instrument.instrument} (${dataSymbol.symbol}): ${missingRequired.join(", ")}`;
      }

      continue;
    }

    const dataset: TradingHistoricalDataset = {
      metadata: {
        instrument: instrument.instrument,
        dataSymbol: dataSymbol.symbol,
        dataSymbolRelation: dataSymbol.relation,
        dataSymbolLabel: dataSymbol.label ?? null,
        marketType: instrument.marketType,
        sessionProfile: instrument.sessionProfile,
        source: instrument.source,
        from,
        to,
        loadedAt,
        timeframes,
        candleCounts,
      },
      dataset: {
        instrument: instrument.instrument,
        marketType: instrument.marketType,
        sessionProfile: instrument.sessionProfile,
        timeframes: datasetTimeframes,
      },
    };

    const coverage = computeTradingHistoricalCoverage(dataset);

    if (!coverage.valid) {
      lastFailureReason = `Historical dataset coverage below minimum for ${instrument.instrument} (${dataSymbol.symbol}): ${coverage.issues.join(" | ")}`;
      continue;
    }

    return dataset;
  }

  const lastResolvedSymbol = instrument.dataSymbols.at(-1);

  throw new Error(
    lastFailureReason ??
      `Historical dataset missing required timeframes for ${instrument.instrument} (${lastResolvedSymbol?.symbol ?? "no symbol"}): ${lastMissingRequired.join(", ")}`,
  );
}

export async function loadHistoricalTradingDataset(
  request: TradingHistoricalDatasetRequest,
): Promise<TradingHistoricalDataset> {
  const sourcePreference = resolveHistoricalSourcePreference(request.sourcePreference);
  const sourceOrder =
    sourcePreference === "local_only"
      ? ["local"] as const
      : sourcePreference === "api_only"
        ? ["api"] as const
        : ["local", "api"] as const;
  const failures: string[] = [];

  for (const source of sourceOrder) {
    try {
      return source === "local"
        ? await loadLocalHistoricalTradingDataset(request)
        : await loadProviderHistoricalTradingDataset(request);
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }

  throw new Error(failures.join(" | "));
}

export async function runHistoricalTradingBacktest(args: {
  request: TradingHistoricalDatasetRequest;
  backtest?: TradingBacktestConfig;
}): Promise<TradingHistoricalBacktestResult> {
  const historicalDataset = await loadHistoricalTradingDataset(args.request);
  const result = runTradingBacktest(historicalDataset.dataset, args.backtest);

  return {
    historicalDataset,
    result,
  };
}
