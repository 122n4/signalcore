import {
  createTradingMarketDataSnapshot,
  resolvePrimaryTimeframe,
  type TradingMarketDataInput,
  type TradingTimeframe,
} from "@/lib/trading/data";

import { loadHistoricalTradingDataset } from "./historicalLoader";
import { computeBacktestMetrics } from "./metrics";
import { createWalkForwardPlan } from "./walkForward";
import { runTradingBacktestAsync } from "./runner";
import type {
  TradingBacktestConfig,
  TradingBacktestTrade,
} from "./types";
import type {
  TradingHistoricalDataset,
  TradingHistoricalDatasetRequest,
  TradingHistoricalSourcePreference,
} from "./datasets";

function roundMetric(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function buildEquityValues(trades: TradingBacktestTrade[], startingEquity = 100): number[] {
  const orderedTrades = [...trades].sort((left, right) => left.closedAt.localeCompare(right.closedAt));
  let equity = startingEquity;
  const values = [equity];

  for (const trade of orderedTrades) {
    equity = roundMetric(equity + trade.pnlPct);
    values.push(equity);
  }

  return values;
}

function sliceDatasetByWindow(args: {
  dataset: TradingMarketDataInput;
  from: string;
  to: string;
}): TradingMarketDataInput {
  const fromMs = new Date(args.from).getTime();
  const toMs = new Date(args.to).getTime();

  const timeframes = Object.fromEntries(
    Object.entries(args.dataset.timeframes).map(([timeframe, candles]) => [
      timeframe,
      (candles ?? []).filter((candle) => {
        const at = new Date(candle.timestamp).getTime();
        return at >= fromMs && at <= toMs;
      }),
    ]),
  );

  return {
    instrument: args.dataset.instrument,
    marketType: args.dataset.marketType,
    sessionProfile: args.dataset.sessionProfile,
    timeframes,
  };
}

function resolveWindowBars(args: {
  candleCount: number;
  trainFraction: number;
  testFraction: number;
  minTrainBars: number;
  minTestBars: number;
}) {
  const trainBars = Math.max(args.minTrainBars, Math.floor(args.candleCount * args.trainFraction));
  const testBars = Math.max(args.minTestBars, Math.floor(args.candleCount * args.testFraction));

  if (trainBars + testBars > args.candleCount) {
    throw new Error(
      `Walk-forward fractions produced invalid window sizes (${trainBars} train + ${testBars} test > ${args.candleCount} candles).`,
    );
  }

  return {
    trainBars,
    testBars,
    stepBars: testBars,
  };
}

export type TradingWalkForwardStudyRequest = {
  instruments?: string[];
  from: string;
  to: string;
  timeframes?: TradingTimeframe[];
  sourcePreference?: TradingHistoricalSourcePreference;
  backtest?: TradingBacktestConfig;
  windowing?: {
    primaryTimeframe?: TradingTimeframe | null;
    trainFraction?: number;
    testFraction?: number;
    minTrainBars?: number;
    minTestBars?: number;
  };
};

export type TradingWalkForwardWindowSummary = {
  index: number;
  trainFrom: string;
  trainTo: string;
  testFrom: string;
  testTo: string;
  totalTrades: number;
  winRate: number;
  averageRiskReward: number | null;
  expectancy: number;
  profitFactor: number | null;
  maxDrawdown: number;
};

export type TradingWalkForwardInstrumentStudy = {
  instrument: string;
  primaryTimeframe: TradingTimeframe;
  trainBars: number;
  testBars: number;
  windows: TradingWalkForwardWindowSummary[];
  summary: {
    totalTrades: number;
    winRate: number;
    averageRiskReward: number | null;
    expectancy: number;
    profitFactor: number | null;
    maxDrawdown: number;
  };
};

export type TradingWalkForwardStudyReport = {
  generatedAt: string;
  request: {
    instruments: string[];
    from: string;
    to: string;
    timeframes: TradingTimeframe[];
    windowing: {
      trainFraction: number;
      testFraction: number;
      minTrainBars: number;
      minTestBars: number;
      primaryTimeframe: TradingTimeframe | null;
    };
  };
  instruments: TradingWalkForwardInstrumentStudy[];
  failures: Array<{
    instrument: string;
    error: string;
  }>;
  aggregate: {
    totalTrades: number;
    winRate: number;
    averageRiskReward: number | null;
    expectancy: number;
    profitFactor: number | null;
    maxDrawdown: number;
  };
  aggregateTrades: TradingBacktestTrade[];
};

export type TradingWalkForwardStudyDeps = {
  loadDataset?: (request: TradingHistoricalDatasetRequest) => Promise<TradingHistoricalDataset>;
};

export async function runTradingWalkForwardStudy(
  request: TradingWalkForwardStudyRequest,
  deps: TradingWalkForwardStudyDeps = {},
): Promise<TradingWalkForwardStudyReport> {
  const loadDataset = deps.loadDataset ?? loadHistoricalTradingDataset;
  const requestedInstruments = request.instruments ?? [
    "EURUSD",
    "GBPUSD",
    "USDJPY",
    "XAUUSD",
    "NAS100",
    "US500",
    "BTCUSD",
    "ETHUSD",
  ];
  const requestedTimeframes = request.timeframes ?? ["4h", "1h", "15m"];
  const trainFraction = request.windowing?.trainFraction ?? 0.6;
  const testFraction = request.windowing?.testFraction ?? 0.1;
  const minTrainBars = request.windowing?.minTrainBars ?? 250;
  const minTestBars = request.windowing?.minTestBars ?? 80;

  const studies: TradingWalkForwardInstrumentStudy[] = [];
  const failures: TradingWalkForwardStudyReport["failures"] = [];
  const aggregateTrades: TradingBacktestTrade[] = [];
  let aggregateEvaluatedBars = 0;

  for (const instrument of requestedInstruments) {
    try {
      const historical = await loadDataset({
        instrument,
        from: request.from,
        to: request.to,
        timeframes: requestedTimeframes,
        sourcePreference: request.sourcePreference,
      });
      const snapshot = createTradingMarketDataSnapshot(historical.dataset);
      const primaryTimeframe =
        request.windowing?.primaryTimeframe ??
        resolvePrimaryTimeframe(snapshot);

      if (!primaryTimeframe) {
        throw new Error("Walk-forward study requires a populated primary timeframe.");
      }

      const primaryCandles = snapshot.timeframes[primaryTimeframe] ?? [];

      if (primaryCandles.length < minTrainBars + minTestBars) {
        throw new Error(
          `Not enough ${primaryTimeframe} candles for walk-forward study (${primaryCandles.length}).`,
        );
      }

      const bars = resolveWindowBars({
        candleCount: primaryCandles.length,
        trainFraction,
        testFraction,
        minTrainBars,
        minTestBars,
      });

      const plan = createWalkForwardPlan({
        instrument,
        primaryTimeframe,
        candles: primaryCandles,
        config: bars,
      });

      const windowSummaries: TradingWalkForwardWindowSummary[] = [];
      const instrumentTrades: TradingBacktestTrade[] = [];
      let instrumentEvaluatedBars = 0;

      for (const window of plan.windows) {
        const windowDataset = sliceDatasetByWindow({
          dataset: historical.dataset,
          from: window.trainFrom,
          to: window.testTo,
        });
        const result = await runTradingBacktestAsync(windowDataset, {
          ...request.backtest,
          primaryTimeframe,
          captureSteps: false,
          evaluationStartAt: window.testFrom,
        });

        instrumentTrades.push(...result.trades);
        aggregateTrades.push(...result.trades);
        instrumentEvaluatedBars += result.report.period.evaluatedBars;
        aggregateEvaluatedBars += result.report.period.evaluatedBars;

        windowSummaries.push({
          index: window.index,
          trainFrom: window.trainFrom,
          trainTo: window.trainTo,
          testFrom: window.testFrom,
          testTo: window.testTo,
          totalTrades: result.report.summary.totalTrades,
          winRate: result.report.summary.winRate,
          averageRiskReward: result.report.summary.averageRiskReward,
          expectancy: result.report.summary.expectancy,
          profitFactor: result.report.summary.profitFactor,
          maxDrawdown: result.report.summary.maxDrawdown,
        });
      }

      const instrumentMetrics = computeBacktestMetrics({
        trades: instrumentTrades,
        evaluatedBars: instrumentEvaluatedBars,
        equityValues: buildEquityValues(
          instrumentTrades,
          request.backtest?.startingEquity ?? 100,
        ),
      });

      studies.push({
        instrument,
        primaryTimeframe,
        trainBars: bars.trainBars,
        testBars: bars.testBars,
        windows: windowSummaries,
        summary: {
          totalTrades: instrumentTrades.length,
          winRate: instrumentMetrics.winRate,
          averageRiskReward: instrumentMetrics.averageRiskReward,
          expectancy: instrumentMetrics.expectancy,
          profitFactor: instrumentMetrics.profitFactor,
          maxDrawdown: instrumentMetrics.maxDrawdown,
        },
      });
    } catch (error) {
      failures.push({
        instrument,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const aggregateMetrics = computeBacktestMetrics({
    trades: aggregateTrades,
    evaluatedBars: aggregateEvaluatedBars,
    equityValues: buildEquityValues(
      aggregateTrades,
      request.backtest?.startingEquity ?? 100,
    ),
  });

  return {
    generatedAt: new Date().toISOString(),
    request: {
      instruments: requestedInstruments,
      from: request.from,
      to: request.to,
      timeframes: requestedTimeframes,
      windowing: {
        trainFraction,
        testFraction,
        minTrainBars,
        minTestBars,
        primaryTimeframe: request.windowing?.primaryTimeframe ?? null,
      },
    },
    instruments: studies,
    failures,
    aggregate: {
      totalTrades: aggregateTrades.length,
      winRate: aggregateMetrics.winRate,
      averageRiskReward: aggregateMetrics.averageRiskReward,
      expectancy: aggregateMetrics.expectancy,
      profitFactor: aggregateMetrics.profitFactor,
      maxDrawdown: aggregateMetrics.maxDrawdown,
    },
    aggregateTrades,
  };
}
