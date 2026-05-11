import type { NormalizedCandle, TradingMarketDataSnapshot, TradingTimeframe } from "@/lib/trading/data";
import type { DecisionCoreOutput, TradingState } from "@/lib/trading/decision";
import type { ExecutionPlanOutput } from "@/lib/trading/execution";
import type { TradingProductCoverageSource, TradingProductCoverageStatus } from "@/lib/trading/marketCoverageTypes";
import type { MarketReadingOutput } from "@/lib/trading/market";
import type {
  BehaviorGuardOutput,
  PlaybookCheckOutput,
  ResolvedTradingPlaybookRules,
  TradingPlaybook,
} from "@/lib/trading/playbook";
import type { SetupCoreOutput } from "@/lib/trading/setups";

export type StateTransitionInput = {
  previousState: TradingState;
  snapshot: TradingMarketDataSnapshot;
  market: MarketReadingOutput;
  setupCore: SetupCoreOutput;
  decisionCore: DecisionCoreOutput;
  executionPlan: ExecutionPlanOutput;
};

export type StateTransitionOutput = {
  previousState: TradingState;
  nextState: TradingState;
  transitionReason: string;
  eventPriority: number;
};

export type FeedMessageInput = StateTransitionInput & {
  transition: StateTransitionOutput;
};

export type FeedMessageOutput = {
  headline: string;
  body?: string;
  shortPushMessage?: string;
  severity: "info" | "caution" | "action";
};

export type TradingFeedEvent = {
  id: string;
  timestamp: string;
  state: TradingState;
  headline: string;
  body?: string;
  clarityScore?: number | null;
  pressureState?: string | null;
  momentumState?: string | null;
  setupMaturity?: number | null;
  triggerLevel?: number | null;
  invalidationLevel?: number | null;
};

export type TradingFeedEventDraft = Omit<TradingFeedEvent, "id">;

export type SessionFeedMemory = {
  sessionId: string;
  instrument: string;
  startedAt: string;
  events: TradingFeedEvent[];
};

export type SessionFeedAppendResult = {
  memory: SessionFeedMemory;
  appended: boolean;
  event: TradingFeedEvent | null;
};

export type TradingChartSnapshot = {
  instrument: string;
  timeframe: TradingTimeframe | null;
  snapshotAt: string;
  candles: NormalizedCandle[];
};

export type TradingLiveDecision = {
  currentState: TradingState;
  currentHeadline: string;
  currentBody?: string;
  instrument?: string;
  direction?: "long" | "short" | "neutral";
  triggerLevel?: number | null;
  entryZoneLow?: number | null;
  entryZoneHigh?: number | null;
  invalidationLevel?: number | null;
  targetZone?: string | null;
  riskPct?: number | null;
  executionStatus: "allowed" | "restricted" | "caution";
  reasons: string[];
  nextDisciplineStep?: string | null;
  feed: TradingFeedEvent[];
};

export type TradingPlaybookWorkspaceSnapshot = {
  definition: Pick<TradingPlaybook, "id" | "name"> | null;
  activeRules: ResolvedTradingPlaybookRules | null;
  check: PlaybookCheckOutput | null;
  behaviorGuard: BehaviorGuardOutput | null;
};

export type TradingPerformanceSnapshot = {
  sessionId: string;
  instrument: string;
  startedAt: string;
  latestTimestamp: string | null;
  latestHeadline: string | null;
  latestState: TradingState | null;
  eventCount: number;
  stateCounts: Partial<Record<TradingState, number>>;
};

export type TradingContextSummary = {
  sessionLabel: string;
  contextLabel: string;
  marketOpen: boolean;
  priorityReason?: string | null;
  coverageStatus: TradingProductCoverageStatus;
  coverageLabel: string;
  coverageReason?: string | null;
  coverageSource?: TradingProductCoverageSource | null;
};

export type TradingWhySummary = {
  whyNow?: string | null;
  whyNotNow?: string | null;
};

export type TradingWorkspaceSnapshot = {
  instrument: string;
  contextSummary: TradingContextSummary;
  whySummary: TradingWhySummary;
  market: MarketReadingOutput;
  setupCore: SetupCoreOutput;
  decisionCore: DecisionCoreOutput;
  playbook: TradingPlaybookWorkspaceSnapshot;
  execution: ExecutionPlanOutput;
  performance: TradingPerformanceSnapshot;
};

export type TradingWatchlistEntry = {
  instrument: string;
  currentState: TradingState;
  currentHeadline: string;
  executionStatus: TradingLiveDecision["executionStatus"];
  contextSummary: TradingContextSummary;
  liveDecision: TradingLiveDecision;
  chart: TradingChartSnapshot | null;
  workspace: TradingWorkspaceSnapshot;
  watchlistPlacement: TradingWatchlistPlacement | null;
};

export type TradingWatchlistSectionKey = "look_first" | "forming" | "waiting" | "closed";

export type TradingWatchlistPlacement = {
  sectionKey: TradingWatchlistSectionKey;
  sectionTitle: string;
  sectionDescription: string;
  rankInSection: number;
  isLeadEntry: boolean;
  isSessionFocus: boolean;
};

export type TradingWatchlistSection = {
  key: TradingWatchlistSectionKey;
  title: string;
  description: string;
  sessionLabels: string[];
  marketOpenCount: number;
  priorityHint?: string | null;
  entries: TradingWatchlistEntry[];
};

export type TradingWatchlistFocus = {
  anchorInstrument: string;
  sessionLabel: string;
  marketOpen: boolean;
  contextLabel: string;
  priorityReason?: string | null;
  coverageStatus?: TradingProductCoverageStatus | null;
  coverageLabel?: string | null;
  sectionKey?: TradingWatchlistSectionKey | null;
  sectionTitle?: string | null;
};

export type TradingWatchlistCoverageSummary = {
  coverageBackedCount: number;
  stagedOnlyCount: number;
  liveOnlyCount: number;
};

export type ComposeTradingLiveDecisionInput = Omit<StateFeedInput, "memory"> & {
  memory?: SessionFeedMemory | null;
  playbook?: TradingPlaybook | null;
  playbookCheck?: PlaybookCheckOutput | null;
  behaviorGuard?: BehaviorGuardOutput | null;
  scannerSnapshot?: {
    source: "provider" | "cache" | "catalog" | "empty";
    providerError: string | null;
    dataSymbol: string | null;
    dataRelation: "direct" | "proxy" | null;
    snapshotAgeMs: number | null;
    actionableFreshness: boolean;
    staleReason: string | null;
  } | null;
  scannerCoverage?: {
    status: TradingProductCoverageStatus;
    label: string;
    detail: string;
    source: TradingProductCoverageSource;
  } | null;
};

export type ComposeTradingLiveDecisionOutput = {
  liveDecision: TradingLiveDecision;
  memory: SessionFeedMemory;
  transition: StateTransitionOutput;
  message: FeedMessageOutput;
};

export type StateFeedInput = Omit<StateTransitionInput, "previousState"> & {
  memory?: SessionFeedMemory | null;
};

export type StateFeedOutput = {
  transition: StateTransitionOutput;
  message: FeedMessageOutput;
  memory: SessionFeedMemory;
  appended: boolean;
  event: TradingFeedEvent | null;
};
