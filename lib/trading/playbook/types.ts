import type { DecisionCoreOutput } from "@/lib/trading/decision";
import type { TradingMarketDataSnapshot } from "@/lib/trading/data";
import type { RegimeState, SessionState, MarketReadingOutput } from "@/lib/trading/market";
import type { SetupCoreOutput, SetupType } from "@/lib/trading/setups";

export type TradingNoTradeCondition =
  | "low_clarity"
  | "unfavorable_environment"
  | "late_setup"
  | "degrading_window"
  | "spike_volatility"
  | "noisy_regime"
  | "mixed_bias";

export type TradingBehaviorGuards = {
  blockChasing: boolean;
  blockRevengeTrading: boolean;
  cautionDailyLossPct?: number | null;
  cautionOpenRiskPct?: number | null;
  cautionConsecutiveLosses?: number | null;
  maxInvalidationBreaches?: number | null;
};

export type TradingPlaybookContextRule = {
  instrument?: string | null;
  sessions?: SessionState[] | null;
  setupTypes?: SetupType[] | null;
  qualityGrades?: Array<SetupCoreOutput["quality"]["grade"]> | null;
  clarityLevels?: Array<DecisionCoreOutput["clarity"]["level"]> | null;
  environmentStates?: Array<DecisionCoreOutput["environment"]["state"]> | null;
  reason?: string | null;
};

export type TradingPlaybookRules = {
  allowedSetups: SetupType[];
  blockedSetups: SetupType[];
  blockedTradeValidContexts?: TradingPlaybookContextRule[];
  preferredRegimes: RegimeState[];
  blockedRegimes: RegimeState[];
  riskPerTradePct: number;
  maxDailyLossPct: number;
  maxOpenRiskPct: number;
  maxTrades: number;
  maxConsecutiveLosses: number;
  chasePolicy: "never" | "controlled";
  invalidationPolicy: "strict" | "structural";
  noTradeIf: TradingNoTradeCondition[];
  behaviorGuards: TradingBehaviorGuards;
};

export type TradingPlaybook = {
  id: string;
  name: string;
  baseRules: TradingPlaybookRules;
  sessionOverrides?: Partial<Record<SessionState, Partial<TradingPlaybookRules>>>;
};

export type TradingBehaviorSnapshot = {
  tradesTaken: number;
  dailyLossPct: number;
  openRiskPct: number;
  consecutiveLosses: number;
  chasingActive: boolean;
  revengeTradingActive: boolean;
  invalidationBreaches: number;
};

export type TradingOperationalInput = {
  snapshot: TradingMarketDataSnapshot;
  market: MarketReadingOutput;
  setupCore: SetupCoreOutput;
  decisionCore: DecisionCoreOutput;
  playbook: TradingPlaybook;
  behavior: TradingBehaviorSnapshot;
};

export type ResolvedTradingPlaybookRules = TradingPlaybookRules & {
  activeSession: SessionState;
};

export type PlaybookCheckOutput = {
  sessionActive: boolean;
  rulesAligned: boolean;
  executionAllowed: boolean;
  hardBlock?: boolean;
  reasons: string[];
  nextDisciplineStep?: string | null;
};

export type BehaviorGuardOutput = {
  state: "clear" | "caution" | "restricted";
  score: number;
  reasons: string[];
};
