import type { AutopilotMode } from "@/lib/signalcore/modes";
import type {
  TradingChartSnapshot,
  TradingLiveDecision,
  TradingWatchlistCoverageSummary,
  TradingWatchlistFocus,
  TradingWatchlistEntry,
  TradingWatchlistSection,
} from "@/lib/trading/state";

export type DecisionEnvelopeBranch =
  | "success"
  | "plan_load_fallback"
  | "holdings_load_fallback"
  | "fatal_fallback";

export type WorkflowActionType =
  | "EXECUTE_BROKER"
  | "CLOSE_DAY"
  | "ENTER"
  | "ADD"
  | "REDUCE"
  | "EXIT"
  | "HOLD"
  | "PAUSE";

export type PortfolioStanceDecision = "BUY" | "REDUCE" | "HOLD" | "AVOID";

export type PortfolioStanceLegacyActionType = "ADD" | "REDUCE" | "HOLD" | "PAUSE";

export type ExecutionInstructionCategory =
  | "DEPLOY"
  | "ROTATE"
  | "PROTECT"
  | "PREPARE"
  | "DISCIPLINE";

export type DecisionSeverity = "low" | "medium" | "high";

export type DecisionPrecedenceOverride =
  | "none"
  | "risk_policy"
  | "data_quality"
  | "action_gate"
  | "capital_protection"
  | "opportunity_ranking"
  | "fallback";

export type WorkflowDecision = {
  type: WorkflowActionType;
  instruction: string;
  summary: string;
  reason: string;
  bestActionSummary?: string | null;
  setupLabel?: string | null;
  timingState?: "early" | "optimal" | "late" | "closed" | null;
  cta: {
    label: string;
    action: string;
    href: string | null;
  } | null;
  source: "engine_v4" | "engine_v3" | "fallback" | "synthetic";
  engineVersion: string | null;
  rawAction: string | null;
  nextEvaluationAt: string | null;
  loopStage: string | null;
  priorityClass: string | null;
  aggression: string | null;
};

export type PortfolioStance = {
  asset: string | null;
  decision: PortfolioStanceDecision;
  legacyActionType: PortfolioStanceLegacyActionType | null;
  confidencePct: number | null;
  expectedMovePct: number | null;
  expectedValue: number | null;
  recommendedPositionPct: number | null;
  score: number | null;
  regime: string | null;
  riskLevel: string | null;
  reasonCodes: string[];
  source: "decision_governance" | "fallback" | "synthetic";
};

export type ExecutionInstruction = {
  category: ExecutionInstructionCategory;
  brokerInstruction: string;
  capitalImpact: string;
  riskImpact: string;
  expectedOutcomeWindow: string;
  allowExecution: boolean;
  source: "daily_enhancements" | "fallback" | "synthetic";
  derivedFromWorkflowType: WorkflowActionType | null;
};

export type DecisionBlocker = {
  layer: "risk_policy" | "action_gate" | "capital_protection" | "fallback" | "data_quality";
  code: string;
  title: string;
  detail: string;
  severity: DecisionSeverity;
  status: "block" | "warn" | "info";
  haltsExecution: boolean;
  reasonCodes: string[];
};

export type DecisionScores = {
  autopilotScore: number | null;
  decisionConfidencePct: number | null;
  riskPressure: number | null;
  planCoherence: number | null;
  workflowConfidencePct: number | null;
  portfolioConfidencePct: number | null;
  dataQualityScore: number | null;
  proofQualityScore: number | null;
  reliabilityScore: number | null;
};

export type DecisionWhy = {
  headline: string | null;
  rationale: string;
  evidence: string[];
  expectedOutcome: string | null;
  counterfactual: string | null;
};

export type DecisionSupport = {
  branchReason: string | null;
  precedence: {
    override: DecisionPrecedenceOverride;
    allowExecution: boolean;
  };
  sources: {
    workflow: WorkflowDecision["source"];
    portfolio: PortfolioStance["source"];
    execution: ExecutionInstruction["source"];
    engineVersion: string | null;
    inputHash: string | null;
  };
  snapshots: {
    actionGateStatus: string | null;
    riskPolicyStatus: string | null;
    riskPolicyBlocked: boolean;
    capitalProtectionMode: boolean;
    capitalPosture: string | null;
    planAlignment: string | null;
    governanceDecision: PortfolioStanceDecision | null;
    topLeakKey: string | null;
    topLeakSeverity: DecisionSeverity | null;
    nextEvaluationAt: string | null;
  };
  trading?: {
    snapshotAt: string | null;
    liveDecision: TradingLiveDecision;
    chart: TradingChartSnapshot | null;
    watchlist: TradingWatchlistEntry[];
    watchlistFocus: TradingWatchlistFocus | null;
    watchlistSections: TradingWatchlistSection[];
    marketCoverageSummary: TradingWatchlistCoverageSummary;
  } | null;
};

export type DecisionEnvelope = {
  version: "decision-envelope.v1";
  mode: AutopilotMode;
  asOf: string;
  branch: DecisionEnvelopeBranch;
  workflowDecision: WorkflowDecision;
  portfolioStance: PortfolioStance;
  executionInstruction: ExecutionInstruction;
  why: DecisionWhy;
  blockers: DecisionBlocker[];
  scores: DecisionScores;
  support: DecisionSupport;
};
