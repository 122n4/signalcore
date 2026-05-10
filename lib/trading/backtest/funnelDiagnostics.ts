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
  createDefaultTradingPlaybook,
  runBehaviorGuard,
  runPlaybookCheck,
} from "@/lib/trading/playbook";

import { loadHistoricalTradingDataset } from "./historicalLoader";
import {
  createBacktestDecisionCore,
  createBacktestSetupCore,
  resolveBacktestTradeValidEdgeThreshold,
} from "./funnelOverrides";
import { applyBacktestMarketSessionOverrides } from "./marketSessionOverrides";
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
  TradingBacktestSimulationState,
  TradingBacktestStep,
} from "./types";
import type {
  TradingHistoricalDataset,
  TradingHistoricalDatasetRequest,
} from "./datasets";

type IncrementalSnapshotState = {
  source: TradingMarketDataSnapshot;
  nextIndexes: Partial<Record<TradingTimeframe, number>>;
  visibleTimeframes: TradingTimeframeMap<NormalizedCandle[]>;
};

type CounterMap = Record<string, number>;

export type TradingBacktestFunnelReport = {
  instrument: string;
  marketType: TradingBacktestResult["marketType"];
  sessionProfile: TradingBacktestResult["sessionProfile"];
  primaryTimeframe: TradingTimeframe;
  config: ResolvedTradingBacktestConfig;
  period: {
    from: string | null;
    to: string | null;
    barsProcessed: number;
    evaluatedBars: number;
    warmupBars: number;
  };
  counts: {
    setupTypes: CounterMap;
    maturityStates: CounterMap;
    opportunityWindowStates: CounterMap;
    decisionStates: CounterMap;
    executionStatuses: CounterMap;
    behaviorStates: CounterMap;
    signalsGenerated: number;
    tradesOpened: number;
    tradesClosed: number;
  };
  blockers: {
    decision: CounterMap;
    playbook: CounterMap;
    behavior: CounterMap;
  };
  highlights: {
    topDecisionBlockers: Array<{ key: string; count: number }>;
    topPlaybookReasons: Array<{ key: string; count: number }>;
    topBehaviorReasons: Array<{ key: string; count: number }>;
  };
};

export type TradingHistoricalBacktestFunnelResult = {
  historicalDataset: TradingHistoricalDataset;
  report: TradingBacktestFunnelReport;
};

function clampPercentage(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function bump(map: CounterMap, key: string, amount = 1): void {
  map[key] = (map[key] ?? 0) + amount;
}

function topEntries(map: CounterMap, limit = 8): Array<{ key: string; count: number }> {
  return Object.entries(map)
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key))
    .slice(0, limit);
}

function resolveBacktestConfig(
  dataset: TradingBacktestDataset,
  config: TradingBacktestConfig = {},
): ResolvedTradingBacktestConfig {
  const normalized = createTradingMarketDataSnapshot(dataset);
  const primaryTimeframe = config.primaryTimeframe ?? resolvePrimaryTimeframe(normalized);

  if (!primaryTimeframe) {
    throw new Error("Trading backtest funnel analysis requires at least one populated timeframe.");
  }

  return {
    playbook: config.playbook ?? createDefaultTradingPlaybook(),
    primaryTimeframe,
    warmupBars: Math.max(5, config.warmupBars ?? 24),
    evaluationStartAt: config.evaluationStartAt ? new Date(config.evaluationStartAt).toISOString() : null,
    startingEquity: config.startingEquity ?? 100,
    executionPolicy: config.executionPolicy ?? "allowed_and_caution",
    intrabarPolicy: config.intrabarPolicy ?? "stop_first",
    captureSteps: false,
    riskOverrides: config.riskOverrides ?? null,
    executionOverrides: config.executionOverrides ?? null,
    costModel: config.costModel ?? null,
    funnelOverrides: config.funnelOverrides ?? null,
    marketSessionOverrides: config.marketSessionOverrides ?? null,
  };
}

function createIncrementalSnapshotState(source: TradingMarketDataSnapshot): IncrementalSnapshotState {
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

function computeWeightedEdge(step: {
  decisionCore: TradingBacktestStep["decisionCore"];
}): number {
  const { weightedScores } = step.decisionCore.weighting;

  return clampPercentage(
    weightedScores.setup * 0.16 +
      weightedScores.quality * 0.16 +
      weightedScores.clarity * 0.16 +
      weightedScores.environment * 0.16 +
      weightedScores.maturity * 0.12 +
      weightedScores.opportunityWindow * 0.12 +
      weightedScores.momentum * 0.12 -
      weightedScores.conflictPenalty * 0.1 +
      weightedScores.confluenceBonus,
  );
}

function recordDecisionBlockers(
  report: TradingBacktestFunnelReport,
  step: Pick<
    TradingBacktestStep,
    "setupCore" | "decisionCore" | "market" | "executionPlan" | "playbookCheck" | "behaviorGuard"
  >,
): void {
  const { setupCore, decisionCore, market, playbookCheck, behaviorGuard, executionPlan } = step;

  if (setupCore.setup.type === "none") {
    bump(report.blockers.decision, "setup:none");
    return;
  }

  if (setupCore.setup.direction === "neutral") {
    bump(report.blockers.decision, "setup:neutral_direction");
  }

  if (setupCore.maturity.state !== "ready") {
    bump(report.blockers.decision, `maturity:${setupCore.maturity.state}`);
  }

  if (setupCore.opportunityWindow.state !== "active") {
    bump(report.blockers.decision, `window:${setupCore.opportunityWindow.state}`);
  }

  if (decisionCore.clarity.level === "low") {
    bump(report.blockers.decision, "clarity:low");
  }

  if (decisionCore.bias.direction === "mixed") {
    bump(report.blockers.decision, "bias:mixed");
  }

  if (decisionCore.bias.direction === "neutral") {
    bump(report.blockers.decision, "bias:neutral");
  }

  if (decisionCore.environment.state === "unfavorable") {
    bump(report.blockers.decision, "environment:unfavorable");
  }

  if (!market.session.marketOpen) {
    bump(report.blockers.decision, "session:market_closed");
  }

  const tradeValidEdgeThreshold = resolveBacktestTradeValidEdgeThreshold({
    setupType: setupCore.setup.type,
    overrides: report.config.funnelOverrides?.tradeValidEdgeThresholds,
  });

  if (computeWeightedEdge({ decisionCore }) < tradeValidEdgeThreshold) {
    bump(report.blockers.decision, `weighting:<${tradeValidEdgeThreshold}`);
  }

  if (!playbookCheck.sessionActive) {
    bump(report.blockers.playbook, "session_inactive");
  }

  if (!playbookCheck.rulesAligned) {
    bump(report.blockers.playbook, "rules_not_aligned");
  }

  for (const reason of playbookCheck.reasons) {
    bump(report.blockers.playbook, reason);
  }

  bump(report.counts.behaviorStates, behaviorGuard.state);

  for (const reason of behaviorGuard.reasons) {
    bump(report.blockers.behavior, reason);
  }

  if (
    decisionCore.decision.currentState === "TRADE_VALID" &&
    executionPlan.executionStatus.executionStatus === "restricted"
  ) {
    bump(report.blockers.decision, "execution:restricted_after_trade_valid");
  }
}

function createStepForDiagnostics(args: {
  index: number;
  candle: NormalizedCandle;
  primaryTimeframe: TradingTimeframe;
  snapshot: TradingMarketDataSnapshot;
  config: ResolvedTradingBacktestConfig;
  behavior: TradingBacktestSimulationState["behavior"];
}): Pick<
  TradingBacktestStep,
  | "index"
  | "asOf"
  | "candle"
  | "snapshot"
  | "market"
  | "setupCore"
  | "decisionCore"
  | "playbookCheck"
  | "behaviorGuard"
  | "executionPlan"
  | "liveDecision"
> {
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
  const executionPlan = createExecutionPlan({
    ...operationalInput,
    playbookCheck,
    behaviorGuard,
  });

  return {
    index: args.index,
    asOf: args.candle.timestamp,
    candle: args.candle,
    snapshot: args.snapshot,
    market,
    setupCore,
    decisionCore,
    playbookCheck,
    behaviorGuard,
    executionPlan,
    liveDecision: {
      currentState: decisionCore.decision.currentState,
    } as TradingBacktestStep["liveDecision"],
  };
}

export function analyzeTradingBacktestFunnel(
  dataset: TradingBacktestDataset,
  config: TradingBacktestConfig = {},
): TradingBacktestFunnelReport {
  const normalizedDataset = createTradingMarketDataSnapshot(dataset);
  const resolvedConfig = resolveBacktestConfig(dataset, config);
  const driverCandles = normalizedDataset.timeframes[resolvedConfig.primaryTimeframe] ?? [];

  if (driverCandles.length === 0) {
    throw new Error("Trading backtest funnel analysis requires candles on the selected primary timeframe.");
  }

  const report: TradingBacktestFunnelReport = {
    instrument: normalizedDataset.instrument,
    marketType: normalizedDataset.marketType,
    sessionProfile: normalizedDataset.sessionProfile,
    primaryTimeframe: resolvedConfig.primaryTimeframe,
    config: resolvedConfig,
    period: {
      from: driverCandles[0]?.timestamp ?? null,
      to: driverCandles.at(-1)?.timestamp ?? null,
      barsProcessed: 0,
      evaluatedBars: 0,
      warmupBars: resolvedConfig.warmupBars,
    },
    counts: {
      setupTypes: {},
      maturityStates: {},
      opportunityWindowStates: {},
      decisionStates: {},
      executionStatuses: {},
      behaviorStates: {},
      signalsGenerated: 0,
      tradesOpened: 0,
      tradesClosed: 0,
    },
    blockers: {
      decision: {},
      playbook: {},
      behavior: {},
    },
    highlights: {
      topDecisionBlockers: [],
      topPlaybookReasons: [],
      topBehaviorReasons: [],
    },
  };

  const incrementalSnapshot = createIncrementalSnapshotState(normalizedDataset);
  let simulator = createTradeSimulatorState(resolvedConfig.startingEquity);
  let processedBars = 0;
  let evaluatedBars = 0;
  let lastDriverCandle: NormalizedCandle | null = null;

  for (let index = 0; index < driverCandles.length; index += 1) {
    const candle = driverCandles[index];
    const tradesTakenBefore = simulator.behavior.tradesTaken;
    const closedTradesBefore = simulator.closedTrades.length;

    simulator = applyTradeSimulatorCandle(simulator, candle, index, resolvedConfig);
    processedBars += 1;
    lastDriverCandle = candle;

    if (simulator.behavior.tradesTaken > tradesTakenBefore) {
      report.counts.tradesOpened += simulator.behavior.tradesTaken - tradesTakenBefore;
    }

    if (simulator.closedTrades.length > closedTradesBefore) {
      report.counts.tradesClosed += simulator.closedTrades.length - closedTradesBefore;
    }

    if (index < resolvedConfig.warmupBars - 1) {
      continue;
    }

    simulator = synchronizeTradeSimulatorDay(simulator, candle.timestamp);
    const snapshot = advanceSnapshotToTimestamp(incrementalSnapshot, candle.timestamp);
    const step = createStepForDiagnostics({
      index,
      candle,
      primaryTimeframe: resolvedConfig.primaryTimeframe,
      snapshot,
      config: resolvedConfig,
      behavior: simulator.behavior,
    });

    evaluatedBars += 1;
    bump(report.counts.setupTypes, step.setupCore.setup.type);
    bump(report.counts.maturityStates, step.setupCore.maturity.state);
    bump(report.counts.opportunityWindowStates, step.setupCore.opportunityWindow.state);
    bump(report.counts.decisionStates, step.decisionCore.decision.currentState);
    bump(report.counts.executionStatuses, step.executionPlan.executionStatus.executionStatus);

    recordDecisionBlockers(report, step);

    const pendingSignalBefore = simulator.pendingSignal?.generatedAt ?? null;
    simulator = integrateTradeSimulatorStep(
      simulator,
      step as TradingBacktestStep,
      resolvedConfig,
    );

    if (
      simulator.pendingSignal &&
      simulator.pendingSignal.generatedAt === step.asOf &&
      simulator.pendingSignal.generatedAt !== pendingSignalBefore
    ) {
      report.counts.signalsGenerated += 1;
    }
  }

  simulator = finalizeTradeSimulator(simulator, lastDriverCandle, driverCandles.length - 1, config);

  report.period.barsProcessed = processedBars;
  report.period.evaluatedBars = evaluatedBars;
  report.highlights.topDecisionBlockers = topEntries(report.blockers.decision);
  report.highlights.topPlaybookReasons = topEntries(report.blockers.playbook);
  report.highlights.topBehaviorReasons = topEntries(report.blockers.behavior);

  return report;
}

export async function runHistoricalTradingBacktestFunnelAnalysis(args: {
  request: TradingHistoricalDatasetRequest;
  backtest?: TradingBacktestConfig;
}): Promise<TradingHistoricalBacktestFunnelResult> {
  const historicalDataset = await loadHistoricalTradingDataset(args.request);

  return {
    historicalDataset,
    report: analyzeTradingBacktestFunnel(historicalDataset.dataset, args.backtest),
  };
}
