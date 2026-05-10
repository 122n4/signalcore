import {
  createTradingMarketDataSnapshot,
  resolvePrimaryTimeframe,
  type NormalizedCandle,
  type TradingMarketDataSnapshot,
  type TradingTimeframe,
  type TradingTimeframeMap,
} from "@/lib/trading/data";
import { createExecutionPlan } from "@/lib/trading/execution";
import { createMarketReading } from "@/lib/trading/market";
import {
  createClearBehaviorSnapshot,
  createDefaultTradingPlaybook,
  runBehaviorGuard,
  runPlaybookCheck,
} from "@/lib/trading/playbook";
import { composeTradingLiveDecision, composeTradingWorkspaceSnapshot } from "@/lib/trading/state";
import { computeBacktestMetrics } from "./metrics";
import { applyBacktestMarketSessionOverrides } from "./marketSessionOverrides";
import { buildBacktestReport } from "./report";
import { applyBacktestRiskOverrides } from "./riskOverrides";
import { createBacktestDecisionCore, createBacktestSetupCore } from "./funnelOverrides";
import {
  applyTradeSimulatorCandle,
  createTradeSimulatorState,
  finalizeTradeSimulator,
  integrateTradeSimulatorStep,
  synchronizeTradeSimulatorDay,
} from "./tradeSimulator";
import type {
  ResolvedTradingBacktestConfig,
  TradingBacktestConfig,
  TradingBacktestDataset,
  TradingBacktestResult,
  TradingBacktestStep,
} from "./types";

type TradingBacktestAsyncOptions = {
  yieldEveryBars?: number;
};

type IncrementalSnapshotState = {
  source: TradingMarketDataSnapshot;
  nextIndexes: Partial<Record<TradingTimeframe, number>>;
  visibleTimeframes: TradingTimeframeMap<NormalizedCandle[]>;
};

function resolveBacktestConfig(
  dataset: TradingBacktestDataset,
  config: TradingBacktestConfig = {},
): ResolvedTradingBacktestConfig {
  const normalized = createTradingMarketDataSnapshot(dataset);
  const primaryTimeframe = config.primaryTimeframe ?? resolvePrimaryTimeframe(normalized);

  if (!primaryTimeframe) {
    throw new Error("Trading backtest requires at least one populated timeframe.");
  }

  return {
    playbook: config.playbook ?? createDefaultTradingPlaybook(),
    primaryTimeframe,
    warmupBars: Math.max(5, config.warmupBars ?? 24),
    evaluationStartAt: config.evaluationStartAt ? new Date(config.evaluationStartAt).toISOString() : null,
    startingEquity: config.startingEquity ?? 100,
    executionPolicy: config.executionPolicy ?? "allowed_and_caution",
    intrabarPolicy: config.intrabarPolicy ?? "stop_first",
    captureSteps: config.captureSteps ?? true,
    riskOverrides: config.riskOverrides ?? null,
    executionOverrides: config.executionOverrides ?? null,
    costModel: config.costModel ?? null,
    funnelOverrides: config.funnelOverrides ?? null,
    marketSessionOverrides: config.marketSessionOverrides ?? null,
  };
}

function createIncrementalSnapshotState(
  source: TradingMarketDataSnapshot,
): IncrementalSnapshotState {
  const visibleTimeframes: TradingTimeframeMap<NormalizedCandle[]> = {};
  const nextIndexes: Partial<Record<TradingTimeframe, number>> = {};

  for (const timeframe of source.availableTimeframes) {
    visibleTimeframes[timeframe] = [];
    nextIndexes[timeframe] = 0;
  }

  return {
    source,
    nextIndexes,
    visibleTimeframes,
  };
}

function advanceSnapshotToTimestamp(
  state: IncrementalSnapshotState,
  asOf: string,
): TradingMarketDataSnapshot {
  const availableTimeframes: TradingTimeframe[] = [];

  for (const timeframe of state.source.availableTimeframes) {
    const candles = state.source.timeframes[timeframe] ?? [];
    const visible = state.visibleTimeframes[timeframe] ?? [];
    let nextIndex = state.nextIndexes[timeframe] ?? 0;

    while (nextIndex < candles.length && candles[nextIndex].timestamp <= asOf) {
      visible.push(candles[nextIndex]);
      nextIndex += 1;
    }

    state.visibleTimeframes[timeframe] = visible;
    state.nextIndexes[timeframe] = nextIndex;

    if (visible.length > 0) {
      availableTimeframes.push(timeframe);
    }
  }

  return {
    instrument: state.source.instrument,
    marketType: state.source.marketType,
    sessionProfile: state.source.sessionProfile,
    snapshotAt: asOf,
    timeframes: state.visibleTimeframes,
    availableTimeframes,
  };
}

function cloneSnapshot(snapshot: TradingMarketDataSnapshot): TradingMarketDataSnapshot {
  const clonedTimeframes: TradingTimeframeMap<NormalizedCandle[]> = {};

  for (const timeframe of snapshot.availableTimeframes) {
    clonedTimeframes[timeframe] = [...(snapshot.timeframes[timeframe] ?? [])];
  }

  return {
    instrument: snapshot.instrument,
    marketType: snapshot.marketType,
    sessionProfile: snapshot.sessionProfile,
    snapshotAt: snapshot.snapshotAt,
    timeframes: clonedTimeframes,
    availableTimeframes: [...snapshot.availableTimeframes],
  };
}

function cloneStepForStorage(step: TradingBacktestStep): TradingBacktestStep {
  return {
    ...step,
    snapshot: cloneSnapshot(step.snapshot),
  };
}

function buildBacktestStep(args: {
  index: number;
  candle: NormalizedCandle;
  primaryTimeframe: TradingTimeframe;
  snapshot: TradingMarketDataSnapshot;
  config: ResolvedTradingBacktestConfig;
  behavior: ReturnType<typeof createClearBehaviorSnapshot>;
  memory: TradingBacktestResult["steps"][number]["memory"] | null;
}): TradingBacktestStep {
  const market = createMarketReading(args.snapshot);
  const setupCore = createBacktestSetupCore(
    {
      snapshot: args.snapshot,
      market,
    },
    args.config.funnelOverrides,
  );
  const baseDecisionCore = createBacktestDecisionCore(
    {
      snapshot: args.snapshot,
      market,
      setupCore,
    },
    args.config.funnelOverrides,
  );
  const decisionCore = applyBacktestMarketSessionOverrides({
    instrument: args.snapshot.instrument,
    session: market.session.session,
    setupType: setupCore.setup.type,
    qualityGrade: setupCore.quality.grade,
    clarityLevel: baseDecisionCore.clarity.level,
    environmentState: baseDecisionCore.environment.state,
    decisionCore: baseDecisionCore,
    overrides: args.config.marketSessionOverrides,
  });
  const operationalInput = {
    snapshot: args.snapshot,
    market,
    setupCore,
    decisionCore,
    playbook: args.config.playbook,
    behavior: args.behavior,
  };
  const playbookCheck = runPlaybookCheck(operationalInput);
  const behaviorGuard = runBehaviorGuard(operationalInput);
  const baseExecutionPlan = createExecutionPlan({
    ...operationalInput,
    playbookCheck,
    behaviorGuard,
  });
  const executionPlan = applyBacktestRiskOverrides({
    executionPlan: baseExecutionPlan,
    playbook: args.config.playbook,
    instrument: args.snapshot.instrument,
    session: market.session.session,
    setupType: setupCore.setup.type,
    executionStatus: baseExecutionPlan.executionStatus.executionStatus,
    behaviorState: behaviorGuard.state,
    behavior: args.behavior,
    qualityGrade: setupCore.quality.grade,
    clarityLevel: decisionCore.clarity.level,
    environmentState: decisionCore.environment.state,
    overrides: args.config.riskOverrides,
  });
  const liveDecisionOutput = composeTradingLiveDecision({
    snapshot: args.snapshot,
    market,
    setupCore,
    decisionCore,
    executionPlan,
    playbook: args.config.playbook,
    playbookCheck,
    behaviorGuard,
    memory: args.memory ?? null,
  });
  const workspace = composeTradingWorkspaceSnapshot({
    input: {
      snapshot: args.snapshot,
      market,
      setupCore,
      decisionCore,
      executionPlan,
      playbook: args.config.playbook,
      playbookCheck,
      behaviorGuard,
    },
    liveDecision: liveDecisionOutput.liveDecision,
    memory: liveDecisionOutput.memory,
  });

  return {
    index: args.index,
    asOf: args.candle.timestamp,
    primaryTimeframe: args.primaryTimeframe,
    candle: args.candle,
    behavior: args.behavior,
    snapshot: args.snapshot,
    market,
    setupCore,
    decisionCore,
    playbookCheck,
    behaviorGuard,
    executionPlan,
    liveDecision: liveDecisionOutput.liveDecision,
    workspace,
    memory: liveDecisionOutput.memory,
  };
}

export function runTradingBacktest(
  dataset: TradingBacktestDataset,
  config: TradingBacktestConfig = {},
): TradingBacktestResult {
  const normalizedDataset = createTradingMarketDataSnapshot(dataset);
  const resolvedConfig = resolveBacktestConfig(dataset, config);
  const driverCandles = normalizedDataset.timeframes[resolvedConfig.primaryTimeframe] ?? [];

  if (driverCandles.length === 0) {
    throw new Error("Trading backtest requires candles on the selected primary timeframe.");
  }

  const steps: TradingBacktestStep[] = [];
  const incrementalSnapshot = createIncrementalSnapshotState(normalizedDataset);
  let memory: TradingBacktestStep["memory"] | null = null;
  let simulator = createTradeSimulatorState(resolvedConfig.startingEquity);
  let processedBars = 0;
  let firstProcessedAt: string | null = null;
  let lastProcessedAt: string | null = null;
  let evaluatedBars = 0;

  for (let index = 0; index < driverCandles.length; index += 1) {
    const candle = driverCandles[index];
    simulator = applyTradeSimulatorCandle(simulator, candle, index, resolvedConfig);

    if (index < resolvedConfig.warmupBars - 1) {
      continue;
    }

    simulator = synchronizeTradeSimulatorDay(simulator, candle.timestamp);
    const snapshot = advanceSnapshotToTimestamp(incrementalSnapshot, candle.timestamp);
    const step = buildBacktestStep({
      index,
      candle,
      primaryTimeframe: resolvedConfig.primaryTimeframe,
      snapshot,
      config: resolvedConfig,
      behavior: simulator.behavior,
      memory,
    });

    memory = step.memory;
    processedBars += 1;
    firstProcessedAt ??= step.asOf;
    lastProcessedAt = step.asOf;

    if (!resolvedConfig.evaluationStartAt || step.asOf >= resolvedConfig.evaluationStartAt) {
      evaluatedBars += 1;
    }

    if (resolvedConfig.captureSteps) {
      steps.push(cloneStepForStorage(step));
    }

    simulator = integrateTradeSimulatorStep(simulator, step, resolvedConfig);
  }

  simulator = finalizeTradeSimulator(
    simulator,
    driverCandles.at(-1) ?? null,
    driverCandles.length - 1,
    resolvedConfig,
  );

  const metrics = computeBacktestMetrics({
    trades: simulator.closedTrades,
    evaluatedBars,
    equityValues: simulator.equityCurve.map((point) => point.equity),
  });
  const report = buildBacktestReport({
    instrument: normalizedDataset.instrument,
    marketType: normalizedDataset.marketType,
    sessionProfile: normalizedDataset.sessionProfile,
    primaryTimeframe: resolvedConfig.primaryTimeframe,
    warmupBars: resolvedConfig.warmupBars,
    periodFrom: firstProcessedAt,
    periodTo: lastProcessedAt,
    barsProcessed: processedBars,
    evaluatedBars,
    trades: simulator.closedTrades,
    metrics,
  });

  return {
    instrument: normalizedDataset.instrument,
    marketType: normalizedDataset.marketType,
    sessionProfile: normalizedDataset.sessionProfile,
    primaryTimeframe: resolvedConfig.primaryTimeframe,
    config: resolvedConfig,
    steps,
    trades: simulator.closedTrades,
    metrics,
    report,
  };
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

export async function runTradingBacktestAsync(
  dataset: TradingBacktestDataset,
  config: TradingBacktestConfig = {},
  options: TradingBacktestAsyncOptions = {},
): Promise<TradingBacktestResult> {
  const normalizedDataset = createTradingMarketDataSnapshot(dataset);
  const resolvedConfig = resolveBacktestConfig(dataset, config);
  const driverCandles = normalizedDataset.timeframes[resolvedConfig.primaryTimeframe] ?? [];
  const yieldEveryBars = Math.max(1, options.yieldEveryBars ?? 250);

  if (driverCandles.length === 0) {
    throw new Error("Trading backtest requires candles on the selected primary timeframe.");
  }

  const steps: TradingBacktestStep[] = [];
  const incrementalSnapshot = createIncrementalSnapshotState(normalizedDataset);
  let memory: TradingBacktestStep["memory"] | null = null;
  let simulator = createTradeSimulatorState(resolvedConfig.startingEquity);
  let processedBars = 0;
  let firstProcessedAt: string | null = null;
  let lastProcessedAt: string | null = null;
  let evaluatedBars = 0;

  for (let index = 0; index < driverCandles.length; index += 1) {
    const candle = driverCandles[index];
    simulator = applyTradeSimulatorCandle(simulator, candle, index, resolvedConfig);

    if (index < resolvedConfig.warmupBars - 1) {
      if ((index + 1) % yieldEveryBars === 0) {
        await yieldToEventLoop();
      }
      continue;
    }

    simulator = synchronizeTradeSimulatorDay(simulator, candle.timestamp);
    const snapshot = advanceSnapshotToTimestamp(incrementalSnapshot, candle.timestamp);
    const step = buildBacktestStep({
      index,
      candle,
      primaryTimeframe: resolvedConfig.primaryTimeframe,
      snapshot,
      config: resolvedConfig,
      behavior: simulator.behavior,
      memory,
    });

    memory = step.memory;
    processedBars += 1;
    firstProcessedAt ??= step.asOf;
    lastProcessedAt = step.asOf;

    if (!resolvedConfig.evaluationStartAt || step.asOf >= resolvedConfig.evaluationStartAt) {
      evaluatedBars += 1;
    }

    if (resolvedConfig.captureSteps) {
      steps.push(cloneStepForStorage(step));
    }

    simulator = integrateTradeSimulatorStep(simulator, step, resolvedConfig);

    if ((index + 1) % yieldEveryBars === 0) {
      await yieldToEventLoop();
    }
  }

  simulator = finalizeTradeSimulator(
    simulator,
    driverCandles.at(-1) ?? null,
    driverCandles.length - 1,
    resolvedConfig,
  );

  const metrics = computeBacktestMetrics({
    trades: simulator.closedTrades,
    evaluatedBars,
    equityValues: simulator.equityCurve.map((point) => point.equity),
  });
  const report = buildBacktestReport({
    instrument: normalizedDataset.instrument,
    marketType: normalizedDataset.marketType,
    sessionProfile: normalizedDataset.sessionProfile,
    primaryTimeframe: resolvedConfig.primaryTimeframe,
    warmupBars: resolvedConfig.warmupBars,
    periodFrom: firstProcessedAt,
    periodTo: lastProcessedAt,
    barsProcessed: processedBars,
    evaluatedBars,
    trades: simulator.closedTrades,
    metrics,
  });

  return {
    instrument: normalizedDataset.instrument,
    marketType: normalizedDataset.marketType,
    sessionProfile: normalizedDataset.sessionProfile,
    primaryTimeframe: resolvedConfig.primaryTimeframe,
    config: resolvedConfig,
    steps,
    trades: simulator.closedTrades,
    metrics,
    report,
  };
}
