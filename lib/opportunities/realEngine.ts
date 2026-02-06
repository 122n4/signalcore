// lib/opportunities/realEngine.ts
import type { Opportunity, PortfolioMini } from "@/lib/opportunities/types";

type UserSettings = {
  goal_amount?: number;
  goal_currency?: string;
  goal_timeframe_months?: number;
  risk_profile?: "conservative" | "balanced" | "growth";
  monthly_contribution?: number;
  language?: string;
};

type PortfolioSnapshot = {
  baseCurrency?: string;
  cashBase?: number;
  holdings?: Array<{
    symbol: string;
    name?: string;
    value?: number; // base currency
  }>;
};

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function uid(prefix = "opp") {
  return `${prefix}_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
}

function portfolioValue(p: PortfolioSnapshot) {
  const hv = (p.holdings ?? []).reduce((s, h) => s + (h.value ?? 0), 0);
  return hv + (p.cashBase ?? 0);
}

function toPortfolioMini(p: PortfolioSnapshot): PortfolioMini {
  const V = portfolioValue(p);
  const items = (p.holdings ?? [])
    .slice()
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
    .slice(0, 8)
    .map((h) => ({
      symbol: h.symbol,
      name: h.name,
      weightPct: V > 0 ? ((h.value ?? 0) / V) * 100 : 0,
    }));

  const cashPct = V > 0 ? ((p.cashBase ?? 0) / V) * 100 : 0;
  return { items, cashPct };
}

/**
 * “Regime” v0 (proxy) — até ligares market regime real.
 * - Usa posture + cash% + concentração como sinal de ambiente/estado do portfólio.
 */
function inferRegime(settings: UserSettings, p: PortfolioSnapshot) {
  const posture = settings.risk_profile ?? "balanced";
  const V = portfolioValue(p);
  const cashPct = V > 0 ? ((p.cashBase ?? 0) / V) * 100 : 0;

  const holdings = (p.holdings ?? []).slice().sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  const top = holdings[0];
  const topPct = top && V > 0 ? ((top.value ?? 0) / V) * 100 : 0;

  if (cashPct >= 35) return "Cash-heavy (idle drag risk)";
  if (topPct >= 25) return "Concentration risk (single-name exposure)";
  if (posture === "growth") return "Risk-on posture (growth tilt)";
  if (posture === "conservative") return "Defensive posture (capital preservation)";
  return "Neutral posture (balanced)";
}

function suggestedDeployEUR(settings: UserSettings, p: PortfolioSnapshot) {
  const V = portfolioValue(p);
  const cash = p.cashBase ?? 0;

  // institutional sizing: cap single action to 10% portfolio OR 50% cash
  const max = Math.max(0, Math.min(V * 0.1, cash * 0.5));
  const suggested = Math.max(0, Math.min(cash * 0.3, max));
  return { suggested: Math.round(suggested), max: Math.round(max) };
}

export function buildOpportunitiesReal(input: {
  settings: UserSettings;
  portfolio: PortfolioSnapshot;
}): { regime: string; portfolioMini: PortfolioMini; opportunities: Opportunity[] } {
  const { settings, portfolio } = input;

  const posture = settings.risk_profile ?? "balanced";
  const goal = settings.goal_amount ?? 0;
  const months = settings.goal_timeframe_months ?? 0;

  const V = portfolioValue(portfolio);
  const cash = portfolio.cashBase ?? 0;

  const mini = toPortfolioMini(portfolio);
  const regime = inferRegime(settings, portfolio);

  const opps: Opportunity[] = [];

  // 1) Cash drag (deploy discipline)
  if (cash > 0) {
    const { suggested, max } = suggestedDeployEUR(settings, portfolio);
    const cashPct = mini.cashPct ?? 0;

    opps.push({
      id: uid(),
      title: cashPct >= 25 ? "Reduce cash drag (disciplined deploy)" : "Deploy cash gradually (stay consistent)",
      action: "buy",
      symbol: "CASH → Core",
      rationale:
        "Keeping too much cash can slow progress. Institutions deploy gradually with sizing caps to control risk.",
      why_now:
        cashPct >= 25
          ? "Cash drag compounds silently. Small actions now beat big fixes later."
          : "Consistency is your edge — build the habit while staying within guardrails.",
      confidence: cashPct >= 25 ? 74 : 64,
      impact_hint:
        suggested > 0
          ? `Suggested: €${suggested} (cap €${max}). This is sizing discipline, not a promise.`
          : "Add funds or free cash if you want to deploy.",
      risk_note:
        "Only deploy if your emergency buffer is covered. Keep single-action size capped.",
      horizon: "months",
      tags: ["discipline", "cash", "pacing"],
      pro_note:
        `Sizing rule: min(10% portfolio, 50% cash). Posture: ${posture}. Regime: ${regime}.`,
    });
  }

  // 2) Concentration leak (top holding)
  if (V > 0 && (portfolio.holdings?.length ?? 0) > 0) {
    const holdings = (portfolio.holdings ?? []).slice().sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
    const top = holdings[0];
    const topPct = top?.value ? ((top.value ?? 0) / V) * 100 : 0;

    if (top && topPct >= 20) {
      opps.push({
        id: uid(),
        title: "Reduce concentration risk (avoid one-bad-day)",
        action: "sell",
        symbol: top.symbol,
        rationale:
          "When one position dominates, your goal depends on a single story. That’s avoidable risk.",
        why_now:
          "Concentration is the #1 silent killer of retail portfolios. Trim early, not after damage.",
        confidence: clamp(55 + (topPct - 20) * 2, 55, 85),
        impact_hint: `Top holding is ~${topPct.toFixed(1)}% of portfolio. Trimming can reduce drawdown risk.`,
        risk_note:
          "You don’t need to fully exit — trimming to a safer size often solves the risk.",
        horizon: "weeks",
        tags: ["risk", "concentration", "guardrails"],
        pro_note:
          `Institutional rule of thumb: keep single-name exposure below a cap (often 8–12% depending on plan).`,
      });
    }
  }

  // 3) “Do nothing” / Hold edge (when no clear action)
  if (opps.length === 0) {
    opps.push({
      id: uid(),
      title: "No high-conviction moves today (discipline wins)",
      action: "hold",
      symbol: "",
      rationale:
        "Not acting is also a decision. Overtrading is one of the biggest performance leaks for beginners.",
      why_now:
        "When edge is unclear, the best move is protecting your plan: reduce noise, stick to cadence.",
      confidence: 70,
      impact_hint:
        "Hold today. If you add monthly contributions, do it on schedule — consistency matters.",
      risk_note:
        "If you feel ‘urge to act’, check drift/guardrails first.",
      horizon: "days",
      tags: ["discipline", "avoid-overtrading"],
      pro_note:
        `Engine sees no urgent inefficiency from your current cash/concentration snapshot.`,
    });
  }

  // Sort by confidence (desc)
  opps.sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));

  // Add a small “goal context” note when available (human)
  if (goal > 0 && months > 0) {
    opps[0] = {
      ...opps[0],
      tags: Array.from(new Set([...(opps[0].tags ?? []), "goal-aware"])),
      pro_note:
        (opps[0].pro_note ? opps[0].pro_note + " " : "") +
        `Goal: €${goal} / ${months} months.`,
    };
  }

  return { regime, portfolioMini: mini, opportunities: opps };
}