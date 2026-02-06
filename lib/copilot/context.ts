// lib/copilot/context.ts
import type { CopilotContext, CopilotTab, UserTier } from "./types";
import { runEngineV2, type Goal, type Horizon, type MarketRegime, type PortfolioItem, type RiskProfile } from "@/lib/signalcore";

function safeArray<T>(x: unknown): T[] {
  return Array.isArray(x) ? (x as T[]) : [];
}

function hasGoalComplete(goal: Goal): boolean {
  const amt = goal?.amount ?? null;
  const m = goal?.months ?? null;
  return Boolean(amt && m);
}

export function buildCopilotContext(input: {
  tab: CopilotTab;
  tier: UserTier;
  isAuthenticated: boolean;
  isPaid: boolean;

  regime: MarketRegime;
  horizon: Horizon;
  risk: RiskProfile;
  goal: Goal;
  portfolio: unknown;

  previousOverall?: number | null;
  nowISO?: string;
}): CopilotContext {
  const nowISO = input.nowISO ?? new Date().toISOString();
  const portfolio = safeArray<PortfolioItem>(input.portfolio);

  const hasGoal = Boolean(input.goal);
  const goalIsComplete = hasGoalComplete(input.goal);
  const hasPortfolio = portfolio.length > 0;

  const engine = runEngineV2({
    regime: input.regime,
    horizon: input.horizon,
    risk: input.risk,
    goal: input.goal,
    portfolio,
    previousOverall: input.previousOverall ?? null,
  });

  const coherenceOverall = engine?.breakdown?.overall ?? null;
  const assetFitOverall = engine?.assetFit?.overall ?? null;

  return {
    nowISO,

    tab: input.tab,
    tier: input.tier,
    isAuthenticated: input.isAuthenticated,
    isPaid: input.isPaid,

    regime: input.regime,
    horizon: input.horizon,
    risk: input.risk,
    goal: input.goal,
    portfolio,

    engine,

    flags: {
      hasGoal,
      hasPortfolio,
      goalIsComplete,
      portfolioCount: portfolio.length,
      coherenceOverall,
      assetFitOverall,
      driftLabel: engine?.drift?.label ?? null,
    },
  };
}