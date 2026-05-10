import type { VolatilityRegime } from "@/lib/engine/features";
import type { MarketRegime } from "@/lib/engine/regimeDetection";
import { buildMarketSummary, type MarketSummaryOutput } from "@/lib/engine/marketSummary";
import {
  buildPortfolioHealth,
  type PortfolioHealthOutput,
  type PortfolioHealthRiskInput,
} from "@/lib/engine/portfolioHealth";

export type DailyBriefingTopOpportunity = {
  asset: string;
  score: number;
  probability_up: number;
  expected_move: number;
  recommended_position_pct: number;
  summary: string;
};

export type DailyBriefingOutput = {
  enabled: boolean;
  generated_at: string | null;
  market_environment: MarketSummaryOutput;
  portfolio_health: PortfolioHealthOutput;
  key_opportunity: DailyBriefingTopOpportunity | null;
  suggested_focus: string;
  market_summary: string;
  portfolio_status: string;
  key_opportunity_text: string;
};

export type DailyBriefingInput = {
  enabled: boolean;
  as_of?: string | null;
  regime?: MarketRegime | null;
  volatility_regime?: VolatilityRegime | null;
  momentum?: number | null;
  portfolio_risk?: PortfolioHealthRiskInput | null;
  capital_protection?: {
    protection_mode?: boolean | null;
    recommended_action_bias?: string | null;
  } | null;
  daily_decision?: {
    decision?: string | null;
    asset?: string | null;
    confidence_pct?: number | null;
  } | null;
  opportunities?: Array<{
    asset?: string | null;
    score?: number | null;
    probability_up?: number | null;
    expected_move?: number | null;
    recommended_position_pct?: number | null;
  }> | null;
  action_gate_status?: string | null;
  risk_policy_blocked?: boolean | null;
};

type DailyBriefingGovernanceLike = {
  enabled?: boolean;
  opportunities?: Array<{
    asset?: string | null;
    score?: number | null;
    probability_up?: number | null;
    expected_move?: number | null;
    recommended_position_pct?: number | null;
    regime?: string | null;
  }> | null;
  portfolio_risk?: PortfolioHealthRiskInput | null;
  capital_protection?: {
    protection_mode?: boolean | null;
    recommended_action_bias?: string | null;
  } | null;
  daily_decision?: {
    decision?: string | null;
    asset?: string | null;
    confidence_pct?: number | null;
  } | null;
  metadata?: {
    volatility_regime?: string | null;
  } | null;
};

function clamp(x: number, min: number, max: number) {
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, x));
}

function round2(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 100) / 100;
}

function normalizeIso(v: unknown) {
  const raw = String(v || "").trim();
  if (!raw) return null;
  const ms = new Date(raw).getTime();
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

function formatPct(x: number) {
  const v = round2(x);
  return `${v > 0 ? "+" : ""}${v}%`;
}

function firstOpportunity(
  rows: DailyBriefingInput["opportunities"],
): DailyBriefingTopOpportunity | null {
  const list = Array.isArray(rows) ? rows : [];
  const top = list[0];
  const asset = String(top?.asset || "").trim().toUpperCase();
  if (!asset) return null;

  const score = round2(Number(top?.score || 0));
  const probabilityUp = clamp(Number(top?.probability_up || 0), 0, 1);
  const expectedMove = round2(Number(top?.expected_move || 0));
  const recommendedPosition = clamp(round2(Number(top?.recommended_position_pct || 0)), 0, 100);
  const probabilityUpPct = Math.round(probabilityUp * 100);
  const summary = `${asset} has ${probabilityUpPct}% upside probability, expected move ${formatPct(expectedMove)}, suggested size ${recommendedPosition}%.`;

  return {
    asset,
    score,
    probability_up: probabilityUp,
    expected_move: expectedMove,
    recommended_position_pct: recommendedPosition,
    summary,
  };
}

function inferMomentum(args: {
  momentum?: number | null;
  opportunity: DailyBriefingTopOpportunity | null;
  dailyDecision?: DailyBriefingInput["daily_decision"];
}) {
  const explicit = Number(args.momentum);
  if (Number.isFinite(explicit)) return clamp(explicit, -1, 1);
  if (args.opportunity) return clamp((args.opportunity.probability_up - 0.5) * 2, -1, 1);
  const decision = String(args.dailyDecision?.decision || "").trim().toUpperCase();
  if (decision === "BUY") return 0.3;
  if (decision === "REDUCE" || decision === "AVOID") return -0.3;
  return 0;
}

function pickSuggestedFocus(args: {
  dailyDecision?: DailyBriefingInput["daily_decision"];
  opportunity: DailyBriefingTopOpportunity | null;
  protectionMode: boolean;
  actionGateStatus: string;
  riskPolicyBlocked: boolean;
}) {
  const decision = String(args.dailyDecision?.decision || "").trim().toUpperCase();
  if (args.riskPolicyBlocked) {
    return "Execution is blocked by risk policy. Reduce concentration first and refresh Daily.";
  }
  if (args.actionGateStatus === "blocked" || args.actionGateStatus === "caution") {
    return "Resolve Action Gate blockers before placing new orders.";
  }
  if (args.protectionMode) {
    return "Capital protection mode is active. Favor HOLD or REDUCE with smaller position sizes.";
  }
  if (decision === "BUY" && args.opportunity) {
    return `Primary focus: execute the planned BUY on ${args.opportunity.asset} with checklist discipline.`;
  }
  if (decision === "REDUCE") {
    return "Primary focus: reduce oversized exposure and move concentration back inside limits.";
  }
  if (decision === "AVOID") {
    return "Primary focus: avoid new entries until risk and quality conditions improve.";
  }
  if (args.opportunity) {
    return `Primary focus: monitor ${args.opportunity.asset} and execute only while gate status remains clear.`;
  }
  return "Primary focus: keep daily checklist discipline and wait for the next evaluated opportunity.";
}

export function buildDailyBriefing(input: DailyBriefingInput): DailyBriefingOutput {
  const opportunity = firstOpportunity(input.opportunities);
  const momentum = inferMomentum({
    momentum: input.momentum,
    opportunity,
    dailyDecision: input.daily_decision,
  });
  const market = buildMarketSummary({
    regime: input.regime ?? null,
    volatility_regime: input.volatility_regime ?? null,
    momentum,
  });

  const riskPolicyBlocked = Boolean(input.risk_policy_blocked);
  const actionGateStatus = String(input.action_gate_status || "").trim().toLowerCase();
  const protectionMode = Boolean(input.capital_protection?.protection_mode);
  const portfolioHealth = buildPortfolioHealth({
    portfolio_risk: input.portfolio_risk,
    protection_mode: protectionMode,
    action_gate_blocked: actionGateStatus === "blocked",
    risk_policy_blocked: riskPolicyBlocked,
  });

  const suggestedFocus = pickSuggestedFocus({
    dailyDecision: input.daily_decision,
    opportunity,
    protectionMode,
    actionGateStatus,
    riskPolicyBlocked,
  });

  const portfolioStatus = portfolioHealth.warning
    ? `${portfolioHealth.description} ${portfolioHealth.warning}`
    : portfolioHealth.description;

  return {
    enabled: Boolean(input.enabled),
    generated_at: normalizeIso(input.as_of),
    market_environment: market,
    portfolio_health: portfolioHealth,
    key_opportunity: opportunity,
    suggested_focus: suggestedFocus,
    market_summary: market.description,
    portfolio_status: portfolioStatus,
    key_opportunity_text: opportunity
      ? opportunity.summary
      : "No high-conviction opportunity is ranked for this cycle.",
  };
}

export function buildDailyBriefingFromDecisionGovernance(args: {
  enabled: boolean;
  as_of?: string | null;
  decision_governance?: DailyBriefingGovernanceLike | null;
  action_gate?: { status?: string | null; allowExecution?: boolean | null } | null;
  risk_policy_eval?: { blocked?: boolean | null; status?: string | null } | null;
}) {
  const governance = args.decision_governance && typeof args.decision_governance === "object" ? args.decision_governance : null;
  const opportunities = Array.isArray(governance?.opportunities) ? governance.opportunities : [];
  const top = opportunities[0] || null;
  const inferredMomentum =
    top && Number.isFinite(Number(top.probability_up))
      ? clamp((Number(top.probability_up) - 0.5) * 2, -1, 1)
      : 0;
  const riskPolicyBlocked =
    Boolean(args.risk_policy_eval?.blocked) ||
    String(args.risk_policy_eval?.status || "").trim().toLowerCase() === "block";

  return buildDailyBriefing({
    enabled: Boolean(args.enabled),
    as_of: args.as_of ?? null,
    regime: (top as any)?.regime ?? null,
    volatility_regime: (governance as any)?.metadata?.volatility_regime ?? null,
    momentum: inferredMomentum,
    portfolio_risk: governance?.portfolio_risk ?? null,
    capital_protection: governance?.capital_protection ?? null,
    daily_decision: governance?.daily_decision ?? null,
    opportunities: opportunities,
    action_gate_status: args.action_gate?.status ?? null,
    risk_policy_blocked: riskPolicyBlocked,
  });
}
