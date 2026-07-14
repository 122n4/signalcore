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
import { fetchTwelveDataHistoricalRange, toIso } from "./twelveDataHistorical";
import type { TradingBacktestConfig } from "./types";

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
        const candles = await fetchTwelveDataHistoricalRange({
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
