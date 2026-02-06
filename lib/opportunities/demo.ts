import type { Opportunity, PortfolioMini } from "./types";

function uid(prefix = "opp") {
  return `${prefix}_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
}

export function demoPortfolio(): PortfolioMini {
  return {
    items: [
      { symbol: "SPY", name: "S&P 500 ETF", weightPct: 50 },
      { symbol: "AGG", name: "Bond ETF", weightPct: 30 },
      { symbol: "CASH", name: "Cash", weightPct: 20 },
    ],
    cashPct: 20,
  };
}

export function demoOpportunities(): Opportunity[] {
  return [
    {
      id: uid(),
      title: "Improve diversification (small, high-signal tweak)",
      action: "rebalance",
      symbol: "SPY / AGG",
      rationale: "Your portfolio looks slightly concentrated. A small rebalance can reduce risk without changing the plan.",
      why_now: "Tiny changes are cheaper than big fixes later (drift compounds).",
      confidence: 72,
      impact_hint: "Lower risk of nasty surprises; smoother path to the goal.",
      risk_note: "Avoid over-trading. Keep it small and disciplined.",
      horizon: "weeks",
      tags: ["drift", "discipline", "low-friction"],
      pro_note: "Pro: includes drift threshold + guardrails check + position sizing.",
    },
    {
      id: uid(),
      title: "Cash drag check",
      action: "buy",
      symbol: "CASH → Core",
      rationale: "Cash is useful, but too much cash can slow progress if your goal is long-term.",
      why_now: "If your plan is active, idle cash is usually the first inefficiency to fix.",
      confidence: 64,
      impact_hint: "Potentially improves long-run expected progress (no guarantees).",
      risk_note: "Only if your emergency buffer is already covered.",
      horizon: "months",
      tags: ["cash", "efficiency"],
      pro_note: "Pro: computes pacing impact and risk posture compatibility.",
    },
    {
      id: uid(),
      title: "Reduce single-theme exposure",
      action: "sell",
      symbol: "Theme/Single name",
      rationale: "If any single holding dominates, risk becomes personal and avoidable.",
      why_now: "Concentration is the #1 silent killer of retail portfolios.",
      confidence: 58,
      impact_hint: "Protects downside; reduces ‘one-bad-day’ risk.",
      risk_note: "Selling is optional; trimming is often enough.",
      horizon: "weeks",
      tags: ["concentration", "guardrails"],
      pro_note: "Pro: top-5 concentration + max single-position rule enforcement.",
    },
  ];
}