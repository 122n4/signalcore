import type { AutopilotMode } from "@/lib/signalcore/modes";

export type LoopStage = "DAY0_SETUP" | "DAY0_EXECUTE" | "DAY1_NBA" | "DAY2PLUS_NBA";

export type PriorityClass = "SURVIVAL" | "RISK_CONTROL" | "EXECUTION" | "OPTIMIZATION" | "GROWTH";

export type AggressionLevel = "LOW" | "NORMAL" | "HIGH" | "MAX";

export type ActionKind =
  | "EXECUTE_STARTER_PACK"
  | "MANUAL_BROKER_CHECKLIST"
  | "DEPLOY_CASH"
  | "REBALANCE"
  | "REDUCE_CONCENTRATION"
  | "HEDGE_RISK"
  | "ENTER_POSITION"
  | "EXIT_POSITION"
  | "ADJUST_STOPS"
  | "WAIT"
  | "HOLD"
  | "PAUSE";

export type Guardrail = {
  code: string;
  message: string;
  severity: "low" | "medium" | "high";
};

export type Opportunity = {
  kind: ActionKind;
  title: string;
  score: number;
  rationale?: string | null;
};

export type RiskLeak = {
  key: string;
  title: string;
  severity: "low" | "medium" | "high";
};

export type NextBestAction = {
  kind: ActionKind;
  title: string;
  desc: string;
  cta: {
    label: string;
    action: string;
    href?: string | null;
  };
};

export type DecisionOutput = {
  nextBestAction: NextBestAction;
  whyNow: string;
  whatToDo: string[];
  guardrails: Guardrail[];
  opportunities?: Opportunity[];
  riskLeaks?: RiskLeak[];
  priorityClass: PriorityClass;
  aggression: AggressionLevel;
  confidence: number;
};

export type ScorePack = {
  autopilotScore: number;
  proofQualityScore: number;
  dataQualityScore: number;
  reliabilityScore: number;
  confidenceScore: number;
};

export type ProofSummary = {
  lastProofQuality: number | null;
  proofRequiredToday: boolean;
  proofStatus: "unknown" | "missing" | "weak" | "good" | "not_required";
  requirements: string[];
  confirmedMoneyEur: number | null;
};

export type ReliabilitySummary = {
  executionRate7d: number | null;
  closeDayRate7d: number | null;
  dataCoveragePct: number;
};

export type PortfolioSummary = {
  holdingsCount: number;
  cashEur: number;
  totalValueEur: number;
  coveragePct: number;
};

export type PlanSummary = {
  hasPlan: boolean;
  status: string | null;
  goal: string | null;
  targetEur: number | null;
  monthlyContributionEur: number | null;
  horizonMonths: number | null;
};

export type DecisionTraceItem = {
  step: string;
  outcome: string;
  detail?: string | null;
};

export type DailyBundleV4 = {
  ok: true;
  engineVersion: "v4-ultra";
  mode: AutopilotMode;
  asOf: string;
  inputHash: string;
  loopStage: LoopStage;
  decision: DecisionOutput;
  scores: ScorePack;
  proof: ProofSummary;
  reliability: ReliabilitySummary;
  portfolio: PortfolioSummary;
  plan: PlanSummary;
  trace: DecisionTraceItem[];
  fallbackUsed: boolean;
};

export type EngineContextPlan = {
  hasPlan: boolean;
  id: string | null;
  status: string | null;
  goal: string | null;
  targetEur: number | null;
  monthlyContributionEur: number | null;
  horizonMonths: number | null;
  raw?: Record<string, any> | null;
};

export type EngineContextHolding = {
  id: string | null;
  symbol: string;
  name: string | null;
  qty: number | null;
  valueEur: number | null;
};

export type EngineContextPortfolio = {
  hasHoldings: boolean;
  items: EngineContextHolding[];
  holdingsCount: number;
  cashEur: number;
  totalValueEur: number;
  coveragePct: number;
};

export type EngineQuoteLite = {
  price: number | null;
  ts: number | null;
  source: string | null;
};

export type EngineContextMarket = {
  source: string;
  quotes: Record<string, EngineQuoteLite>;
  dataQuality: {
    status: "good" | "limited" | "poor";
    coveragePct: number;
    quoteCount: number;
    missingCount: number;
  };
};

export type EngineContextDayState = {
  doneToday: boolean;
  receiptsCount: number;
  streak: number;
  lastSnapshotAt: string | null;
  lastProofAt: string | null;
  lastProofQuality: number | null;
};

export type EngineContextReliability = {
  executionRate7d: number | null;
  closeDayRate7d: number | null;
  dataCoveragePct: number;
};

export type EngineContextAccess = {
  isPro: boolean | null;
  modeAllowed: boolean | null;
};

export type EngineContextSignals = {
  topRiskLeakKey: string | null;
  topRiskLeakTitle: string | null;
  topRiskLeakSeverity: "low" | "medium" | "high" | null;
};

export type EngineContext = {
  userId: string;
  mode: AutopilotMode;
  asOf: string;
  setupComplete: boolean;
  plan: EngineContextPlan;
  portfolio: EngineContextPortfolio;
  market: EngineContextMarket;
  dayState: EngineContextDayState;
  reliability: EngineContextReliability;
  access: EngineContextAccess;
  signals: EngineContextSignals;
};

export type BuildEngineContextSources = {
  userId: string;
  mode: AutopilotMode;
  asOf?: string | null;
  setupStatus?: string | null;
  plan?: Record<string, any> | null;
  portfolioItems?: Array<Record<string, any>> | null;
  portfolioCashEur?: number | null;
  valuation?: Record<string, any> | null;
  quotes?: Record<string, any> | null;
  dailyState?: Partial<EngineContextDayState> | null;
  reliability?: Partial<EngineContextReliability> | null;
  access?: Partial<EngineContextAccess> | null;
  signals?: Partial<EngineContextSignals> | null;
};

export type PriorityResult = {
  priorityClass: PriorityClass;
  reason: string;
};

export type GovernorResult = {
  overridden: boolean;
  actionKind: ActionKind | null;
  reason: string | null;
  guardrails: Guardrail[];
  trace: DecisionTraceItem[];
};
