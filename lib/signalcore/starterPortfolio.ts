import type { PlanLike, RiskProfile, Horizon, GoalType } from "./types";

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function asRiskProfile(x: any): RiskProfile {
  if (x === "Conservative" || x === "Balanced" || x === "Aggressive") return x;
  return "Balanced";
}

function asHorizon(x: any): Horizon {
  if (x === "Short" || x === "Medium" || x === "Long") return x;
  return "Long";
}

function asGoalType(x: any): GoalType {
  void x;
  return "Investing";
}

function pickCoreETF(plan: PlanLike) {
  const rp = asRiskProfile(plan.riskProfile);
  void asGoalType((plan as any).goalType);
  if (rp === "Conservative") return "AGGH";
  return "VWCE";
}

function pickHedgeETF(plan: PlanLike) {
  const rp = asRiskProfile(plan.riskProfile);
  if (rp === "Conservative") return "AGGH";
  return "GLD";
}

type StarterItem = {
  symbol: string;
  name?: string;
  type?: "ETF" | "Stock";
  role?: "core" | "satellite" | "hedge" | "cash";
  suggestedEUR?: number;
  maxEUR?: number;
  qty?: number;
  weight?: number;
};

export function buildStarterPortfolio(opts: {
  plan: PlanLike;
  cashEUR: number;
  includeHedge?: boolean;
  baseCurrency?: string;
}) {
  const plan = opts.plan;
  const cashEUR = Math.max(0, opts.cashEUR);
  const baseCurrency = opts.baseCurrency ?? "EUR";

  const rp = asRiskProfile(plan.riskProfile);
  const hz = asHorizon(plan.horizon);

  let corePct = rp === "Conservative" ? 0.75 : rp === "Aggressive" ? 0.92 : 0.88;
  let hedgePct = rp === "Conservative" ? 0.15 : 0.06;
  let cashPct = 1 - corePct - hedgePct;

  if (!opts.includeHedge) {
    hedgePct = 0;
    cashPct = 1 - corePct;
  }

  const minCash = Math.max(20, cashEUR * 0.02);
  const spendable = Math.max(0, cashEUR - minCash);
  const coreEUR = Math.round(spendable * corePct);
  const hedgeEUR = Math.round(spendable * hedgePct);
  const remainingCash = cashEUR - coreEUR - hedgeEUR;

  const maxCore = Math.round(clamp(coreEUR, 0, cashEUR * 0.6));
  const maxHedge = Math.round(clamp(hedgeEUR, 0, cashEUR * 0.35));

  const core = pickCoreETF(plan);
  const hedge = pickHedgeETF(plan);

  const items: StarterItem[] = [
    { symbol: core, type: "ETF", role: "core", suggestedEUR: coreEUR, maxEUR: maxCore, weight: corePct },
  ];

  if (opts.includeHedge && hedgeEUR > 0) {
    items.push({ symbol: hedge, type: "ETF", role: "hedge", suggestedEUR: hedgeEUR, maxEUR: maxHedge, weight: hedgePct });
  }

  items.push({ symbol: "CASH", type: "ETF", role: "cash", suggestedEUR: remainingCash, maxEUR: remainingCash, weight: cashPct });

  const note =
    rp === "Conservative"
      ? "Starter Portfolio: prioritize stability. Start with Core plus protection. Keep moves small."
      : "Starter Portfolio: start with Core. Add Hedge only if volatility rises. Keep moves small and consistent.";

  return {
    baseCurrency,
    horizon: hz,
    note,
    items,
  };
}
