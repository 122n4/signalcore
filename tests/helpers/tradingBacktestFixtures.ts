import { buildSequenceCandles } from "./tradingMarketFixtures";
import { createExecutionInput } from "./tradingOperationalFixtures";
import { createExecutionPlan } from "@/lib/trading/execution";
import { composeTradingLiveDecision, composeTradingWorkspaceSnapshot } from "@/lib/trading/state";
import type { TradingBacktestDataset, TradingBacktestStep, TradingBacktestTrade } from "@/lib/trading/backtest";
import type { TradingBehaviorSnapshot, TradingPlaybook } from "@/lib/trading/playbook";
import type { DecisionCoreOutput } from "@/lib/trading/decision";
import type { MarketReadingOutput } from "@/lib/trading/market";
import type { SetupCoreOutput } from "@/lib/trading/setups";

type CreateBacktestStepFixtureOptions = {
  index?: number;
  snapshotOverrides?: Parameters<typeof createExecutionInput>[0]["snapshotOverrides"];
  marketOverrides?: Partial<MarketReadingOutput>;
  setupCoreOverrides?: Partial<SetupCoreOutput>;
  decisionCoreOverrides?: Partial<DecisionCoreOutput>;
  playbookOverrides?: Partial<TradingPlaybook>;
  behaviorOverrides?: Partial<TradingBehaviorSnapshot>;
};

export function createBacktestDatasetFixture(): TradingBacktestDataset {
  const candles15m = buildSequenceCandles({
    closes: [
      100, 100.4, 100.9, 101.3, 101.7, 102.1, 102.6, 103.2, 103.9, 104.4,
      104.9, 105.5, 106.2, 106.8, 107.3, 107.9, 108.4, 109, 109.7, 110.2,
      110.9, 111.5, 112.1, 112.8, 113.4, 114, 114.7, 115.3, 116, 116.6,
      117.1, 117.7,
    ],
    ranges: Array.from({ length: 32 }, () => 0.9),
    start: "2026-03-10T08:00:00.000Z",
    stepMinutes: 15,
  });
  const candles1h = candles15m.filter((_, index) => index % 4 === 3);

  return {
    instrument: "EURUSD",
    marketType: "forex",
    sessionProfile: "forex",
    timeframes: {
      "15m": candles15m,
      "1h": candles1h,
    },
  };
}

export function createBacktestStepFixture(
  options: CreateBacktestStepFixtureOptions = {},
): TradingBacktestStep {
  const executionInput = createExecutionInput({
    snapshotOverrides: options.snapshotOverrides,
    marketOverrides: options.marketOverrides,
    setupCoreOverrides: options.setupCoreOverrides,
    decisionCoreOverrides: options.decisionCoreOverrides,
    playbookOverrides: options.playbookOverrides,
    behaviorOverrides: options.behaviorOverrides,
  });
  const executionPlan = createExecutionPlan(executionInput);
  const liveDecisionOutput = composeTradingLiveDecision({
    snapshot: executionInput.snapshot,
    market: executionInput.market,
    setupCore: executionInput.setupCore,
    decisionCore: executionInput.decisionCore,
    executionPlan,
    playbook: executionInput.playbook,
    playbookCheck: executionInput.playbookCheck,
    behaviorGuard: executionInput.behaviorGuard,
    memory: null,
  });
  const workspace = composeTradingWorkspaceSnapshot({
    input: {
      snapshot: executionInput.snapshot,
      market: executionInput.market,
      setupCore: executionInput.setupCore,
      decisionCore: executionInput.decisionCore,
      executionPlan,
      playbook: executionInput.playbook,
      playbookCheck: executionInput.playbookCheck,
      behaviorGuard: executionInput.behaviorGuard,
    },
    liveDecision: liveDecisionOutput.liveDecision,
    memory: liveDecisionOutput.memory,
  });
  const primaryCandles = executionInput.snapshot.timeframes["15m"] ?? executionInput.snapshot.timeframes["5m"] ?? [];
  const candle = primaryCandles.at(-1);

  if (!candle) {
    throw new Error("Backtest step fixture requires at least one primary candle.");
  }

  return {
    index: options.index ?? 12,
    asOf: executionInput.snapshot.snapshotAt,
    primaryTimeframe: "15m",
    candle,
    behavior: executionInput.behavior,
    snapshot: executionInput.snapshot,
    market: executionInput.market,
    setupCore: executionInput.setupCore,
    decisionCore: executionInput.decisionCore,
    playbookCheck: executionInput.playbookCheck,
    behaviorGuard: executionInput.behaviorGuard,
    executionPlan,
    liveDecision: liveDecisionOutput.liveDecision,
    workspace,
    memory: liveDecisionOutput.memory,
  };
}

export function createBacktestTradeFixture(
  overrides: Partial<TradingBacktestTrade> = {},
): TradingBacktestTrade {
  return {
    id: overrides.id ?? "EURUSD:trade:1",
    instrument: overrides.instrument ?? "EURUSD",
    setupType: overrides.setupType ?? "breakout_continuation",
    session: overrides.session ?? "ny_open",
    direction: overrides.direction ?? "long",
    signalAt: overrides.signalAt ?? "2026-03-10T14:00:00.000Z",
    openedAt: overrides.openedAt ?? "2026-03-10T14:15:00.000Z",
    closedAt: overrides.closedAt ?? "2026-03-10T15:00:00.000Z",
    entryPrice: overrides.entryPrice ?? 103.9,
    exitPrice: overrides.exitPrice ?? 106.1,
    triggerType: overrides.triggerType ?? "break",
    triggerLevel: overrides.triggerLevel ?? 103.9,
    invalidationLevel: overrides.invalidationLevel ?? 102.6,
    targetZone: overrides.targetZone ?? "106.0-106.4",
    riskPct: overrides.riskPct ?? 0.5,
    riskRewardEstimate: overrides.riskRewardEstimate ?? 2.2,
    exitReason: overrides.exitReason ?? "target_hit",
    outcome: overrides.outcome ?? "win",
    pnlR: overrides.pnlR ?? 1.69,
    pnlPct: overrides.pnlPct ?? 0.845,
    barsHeld: overrides.barsHeld ?? 3,
  };
}
