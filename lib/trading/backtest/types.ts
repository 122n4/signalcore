import type {
  NormalizedCandle,
  TradingMarketDataInput,
  TradingMarketDataSnapshot,
  TradingMarketType,
  TradingSessionProfile,
  TradingTimeframe,
} from "@/lib/trading/data";
import type { DecisionCoreOutput, TradingState } from "@/lib/trading/decision";
import type { ExecutionPlanOutput, EntryZoneOutput } from "@/lib/trading/execution";
import type { MarketReadingOutput, SessionState } from "@/lib/trading/market";
import type {
  BehaviorGuardOutput,
  PlaybookCheckOutput,
  TradingBehaviorSnapshot,
  TradingPlaybook,
} from "@/lib/trading/playbook";
import type { SetupCoreOutput, SetupType } from "@/lib/trading/setups";
import type { SessionFeedMemory, TradingLiveDecision, TradingWorkspaceSnapshot } from "@/lib/trading/state";

export type TradingBacktestDataset = TradingMarketDataInput;

export type TradingBacktestExecutionPolicy = "allowed_only" | "allowed_and_caution";

export type TradingBacktestIntrabarPolicy = "stop_first" | "target_first";

export type TradingBacktestRiskOverrides = {
  aggressiveRiskPct?: number | null;
  rules?: TradingBacktestRiskRule[] | null;
};

export type TradingBacktestRiskRule = {
  instrument?: string | null;
  sessions?: SessionState[] | null;
  setupTypes?: SetupType[] | null;
  riskModes?: Array<ExecutionPlanOutput["riskFraming"]["riskMode"]> | null;
  executionStatuses?: Array<ExecutionPlanOutput["executionStatus"]["executionStatus"]> | null;
  behaviorStates?: Array<BehaviorGuardOutput["state"]> | null;
  minConsecutiveLosses?: number | null;
  minDailyLossPct?: number | null;
  qualityGrades?: Array<SetupCoreOutput["quality"]["grade"]> | null;
  clarityLevels?: Array<DecisionCoreOutput["clarity"]["level"]> | null;
  environmentStates?: Array<DecisionCoreOutput["environment"]["state"]> | null;
  riskPct?: number | null;
  riskMultiplier?: number | null;
  reason?: string | null;
};

export type TradingBacktestExecutionRule = {
  instrument?: string | null;
  sessions?: SessionState[] | null;
  setupTypes?: SetupType[] | null;
  riskModes?: Array<ExecutionPlanOutput["riskFraming"]["riskMode"]> | null;
  executionStatuses?: Array<ExecutionPlanOutput["executionStatus"]["executionStatus"]> | null;
  qualityGrades?: Array<SetupCoreOutput["quality"]["grade"]> | null;
  clarityLevels?: Array<DecisionCoreOutput["clarity"]["level"]> | null;
  environmentStates?: Array<DecisionCoreOutput["environment"]["state"]> | null;
  reason?: string | null;
};

export type TradingBacktestExecutionOverrides = {
  blockedSignalContexts?: TradingBacktestExecutionRule[] | null;
};

export type TradingBacktestCostModel = {
  roundTripCostR?: number | null;
};

export type TradingBacktestFunnelOverrides = {
  maturityThresholds?: {
    defaultDeveloping?: number | null;
    defaultReady?: number | null;
    breakoutDeveloping?: number | null;
    breakoutReady?: number | null;
  } | null;
  opportunityWindow?: {
    promoteOpeningToActive?: boolean;
    ignoreMiddayLullDegrading?: boolean;
  } | null;
  tradeValidEdgeThresholds?: {
    defaultTradeValid?: number | null;
    breakoutTradeValid?: number | null;
  } | null;
};

export type TradingBacktestMarketSessionRule = {
  instrument?: string | null;
  sessions?: SessionState[] | null;
  setupTypes?: SetupType[] | null;
  qualityGrades?: Array<SetupCoreOutput["quality"]["grade"]> | null;
  clarityLevels?: Array<DecisionCoreOutput["clarity"]["level"]> | null;
  environmentStates?: Array<DecisionCoreOutput["environment"]["state"]> | null;
  reason?: string | null;
};

export type TradingBacktestMarketSessionOverrides = {
  blockedTradeValidContexts?: TradingBacktestMarketSessionRule[] | null;
};

export type TradingBacktestConfig = {
  playbook?: TradingPlaybook;
  primaryTimeframe?: TradingTimeframe | null;
  warmupBars?: number;
  evaluationStartAt?: string | null;
  startingEquity?: number;
  executionPolicy?: TradingBacktestExecutionPolicy;
  intrabarPolicy?: TradingBacktestIntrabarPolicy;
  captureSteps?: boolean;
  riskOverrides?: TradingBacktestRiskOverrides;
  executionOverrides?: TradingBacktestExecutionOverrides;
  costModel?: TradingBacktestCostModel | null;
  funnelOverrides?: TradingBacktestFunnelOverrides;
  marketSessionOverrides?: TradingBacktestMarketSessionOverrides;
};

export type ResolvedTradingBacktestConfig = {
  playbook: TradingPlaybook;
  primaryTimeframe: TradingTimeframe;
  warmupBars: number;
  evaluationStartAt: string | null;
  startingEquity: number;
  executionPolicy: TradingBacktestExecutionPolicy;
  intrabarPolicy: TradingBacktestIntrabarPolicy;
  captureSteps: boolean;
  riskOverrides: TradingBacktestRiskOverrides | null;
  executionOverrides: TradingBacktestExecutionOverrides | null;
  costModel: TradingBacktestCostModel | null;
  funnelOverrides: TradingBacktestFunnelOverrides | null;
  marketSessionOverrides: TradingBacktestMarketSessionOverrides | null;
};

export type TradingBacktestStep = {
  index: number;
  asOf: string;
  primaryTimeframe: TradingTimeframe;
  candle: NormalizedCandle;
  behavior: TradingBehaviorSnapshot;
  snapshot: TradingMarketDataSnapshot;
  market: MarketReadingOutput;
  setupCore: SetupCoreOutput;
  decisionCore: DecisionCoreOutput;
  playbookCheck: PlaybookCheckOutput;
  behaviorGuard: BehaviorGuardOutput;
  executionPlan: ExecutionPlanOutput;
  liveDecision: TradingLiveDecision;
  workspace: TradingWorkspaceSnapshot;
  memory: SessionFeedMemory;
};

export type TradingBacktestSignal = {
  instrument: string;
  generatedAt: string;
  setupType: SetupType;
  session: SessionState;
  technicalState: TradingState;
  direction: "long" | "short";
  triggerType: EntryZoneOutput["triggerType"];
  triggerLevel: number;
  entryZoneLow: number;
  entryZoneHigh: number;
  invalidationLevel: number;
  targetZone: string | null;
  targetZoneLow: number | null;
  targetZoneHigh: number | null;
  riskPct: number | null;
  riskRewardEstimate: number | null;
  executionStatus: TradingLiveDecision["executionStatus"];
};

export type TradingBacktestOpenTrade = {
  id: string;
  instrument: string;
  setupType: SetupType;
  session: SessionState;
  direction: "long" | "short";
  signalAt: string;
  openedAt: string;
  entryPrice: number;
  triggerType: EntryZoneOutput["triggerType"];
  triggerLevel: number;
  invalidationLevel: number;
  targetZone: string | null;
  targetZoneLow: number | null;
  targetZoneHigh: number | null;
  riskPct: number | null;
  riskRewardEstimate: number | null;
  entryIndex: number;
};

export type TradingBacktestExitReason =
  | "target_hit"
  | "invalidation_hit"
  | "technical_exit"
  | "session_end"
  | "end_of_data";

export type TradingBacktestTrade = {
  id: string;
  instrument: string;
  setupType: SetupType;
  session: SessionState;
  direction: "long" | "short";
  signalAt: string;
  openedAt: string;
  closedAt: string;
  entryPrice: number;
  exitPrice: number;
  triggerType: EntryZoneOutput["triggerType"];
  triggerLevel: number;
  invalidationLevel: number;
  targetZone: string | null;
  riskPct: number | null;
  riskRewardEstimate: number | null;
  exitReason: TradingBacktestExitReason;
  outcome: "win" | "loss" | "scratch";
  grossPnlR?: number;
  grossPnlPct?: number;
  costPnlR?: number;
  costPnlPct?: number;
  pnlR: number;
  pnlPct: number;
  barsHeld: number;
};

export type TradingBacktestEquityPoint = {
  timestamp: string;
  equity: number;
  drawdownPct: number;
  tradeId?: string | null;
};

export type TradingBacktestSimulationState = {
  pendingSignal: TradingBacktestSignal | null;
  openTrade: TradingBacktestOpenTrade | null;
  closedTrades: TradingBacktestTrade[];
  behavior: TradingBehaviorSnapshot;
  behaviorDay: string | null;
  equity: number;
  peakEquity: number;
  equityCurve: TradingBacktestEquityPoint[];
};

export type TradingBacktestDistributionBucket = {
  count: number;
  wins: number;
  losses: number;
  scratches: number;
  winRate: number;
  totalPnlR: number;
  totalPnlPct: number;
  expectancy: number;
};

export type TradingBacktestMetrics = {
  tradeCount: number;
  wins: number;
  losses: number;
  scratches: number;
  winRate: number;
  averageRiskReward: number | null;
  expectancy: number;
  maxDrawdown: number;
  profitFactor: number | null;
  tradeFrequency: {
    totalTrades: number;
    tradesPer100Bars: number;
    averageBarsHeld: number;
  };
  grossProfitPct: number;
  grossLossPct: number;
  distributions: {
    bySetup: Partial<Record<SetupType, TradingBacktestDistributionBucket>>;
    bySession: Partial<Record<SessionState, TradingBacktestDistributionBucket>>;
  };
};

export type TradingBacktestReport = {
  instrument: string;
  marketType: TradingMarketType;
  sessionProfile: TradingSessionProfile;
  primaryTimeframe: TradingTimeframe;
  period: {
    from: string | null;
    to: string | null;
    barsProcessed: number;
    evaluatedBars: number;
    warmupBars: number;
  };
  summary: {
    totalTrades: number;
    winRate: number;
    averageRiskReward: number | null;
    expectancy: number;
    maxDrawdown: number;
    profitFactor: number | null;
    tradeFrequency: number;
    grossProfitPct: number;
    grossLossPct: number;
  };
  distributions: TradingBacktestMetrics["distributions"];
  insights: {
    strongestSetup: SetupType | null;
    weakestSetup: SetupType | null;
    strongestSession: SessionState | null;
    weakestSession: SessionState | null;
  };
  trades: TradingBacktestTrade[];
};

export type TradingBacktestResult = {
  instrument: string;
  marketType: TradingMarketType;
  sessionProfile: TradingSessionProfile;
  primaryTimeframe: TradingTimeframe;
  config: ResolvedTradingBacktestConfig;
  steps: TradingBacktestStep[];
  trades: TradingBacktestTrade[];
  metrics: TradingBacktestMetrics;
  report: TradingBacktestReport;
};

export type TradingWalkForwardConfig = {
  trainBars: number;
  testBars: number;
  stepBars?: number;
};

export type TradingWalkForwardWindow = {
  index: number;
  trainStart: number;
  trainEnd: number;
  testStart: number;
  testEnd: number;
  trainFrom: string;
  trainTo: string;
  testFrom: string;
  testTo: string;
};

export type TradingWalkForwardPlan = {
  instrument: string;
  primaryTimeframe: TradingTimeframe;
  trainBars: number;
  testBars: number;
  stepBars: number;
  windows: TradingWalkForwardWindow[];
};
