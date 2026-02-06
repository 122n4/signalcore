// lib/signalcore/executionEngine.ts

import {
  ExecutionAction,
  Opportunity,
  PlanLike,
  PortfolioSnapshot,
  RiskLeak,
  RiskPosture,
} from "./types";

function uid(prefix = "act") {
  return `${prefix}_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function portfolioTotals(p: PortfolioSnapshot) {
  const holdings = p.holdings.reduce((s, h) => s + (h.valueBase || 0), 0);
  const cash = p.cashBase || 0;
  const total = holdings + cash;
  return { holdings, cash, total };
}

function detectRiskLeaks(portfolio: PortfolioSnapshot): RiskLeak[] {
  // Minimal institutional leaks (placeholder). We'll expand later.
  const { total } = portfolioTotals(portfolio);
  if (total <= 0) return [];

  // Concentration check: any holding > 35%
  const weights = portfolio.holdings.map((h) => ({
    symbol: h.symbol,
    w: total > 0 ? (h.valueBase / total) * 100 : 0,
  }));

  const top = [...weights].sort((a, b) => b.w - a.w)[0];
  const leaks: RiskLeak[] = [];

  if (top && top.w > 35) {
    leaks.push({
      id: uid("leak"),
      severity: top.w > 50 ? "critical" : "high",
      title: "High concentration risk",
      detail: `${top.symbol} is ~${top.w.toFixed(1)}% of your portfolio. This can cause deep drawdowns.`,
      suggestedFix: "Reduce concentration and spread into diversified core assets.",
    });
  }

  // Cash too high (opportunity cost)
  const cashPct = total > 0 ? (portfolio.cashBase / total) * 100 : 0;
  if (cashPct > 30) {
    leaks.push({
      id: uid("leak"),
      severity: cashPct > 50 ? "high" : "medium",
      title: "Too much cash drag",
      detail: `Cash is ~${cashPct.toFixed(1)}% of your portfolio. Long-term this can reduce goal odds.`,
      suggestedFix: "Deploy cash into your core bucket in controlled steps.",
    });
  }

  return leaks;
}

function suggestedAmountBase(portfolio: PortfolioSnapshot, plan: PlanLike) {
  const { total, cash } = portfolioTotals(portfolio);
  const contrib = plan.monthlyContribution ?? 0;
  // Default sizing logic: use monthlyContribution if set, else 2–5% of portfolio, capped by cash.
  const pct = total > 0 ? clamp(total * 0.03, 50, 1000) : 200;
  const amt = contrib > 0 ? clamp(contrib, 25, 5000) : pct;
  return clamp(Math.min(amt, cash > 0 ? cash : amt), 25, 5000);
}

function guardrailsFor(action: ExecutionAction, posture: RiskPosture) {
  const notes: string[] = [];
  let ok = true;

  if (action.kind === "BUY" && action.amountBase > 3000 && posture !== "growth") {
    ok = false;
    notes.push("Large single action size for non-growth posture. Consider splitting into smaller steps.");
  }
  if (action.kind === "BUY" && action.amountBase < 25) {
    ok = false;
    notes.push("Order size too small to matter. Increase size or batch weekly.");
  }

  return { ok, notes: notes.length ? notes : ["OK"] };
}

export type ExecutionEngineInput = {
  portfolio: PortfolioSnapshot;
  plan: PlanLike;
  opportunities: Opportunity[];
};

export type ExecutionEngineOutput = {
  riskLeaks: RiskLeak[];
  actions: ExecutionAction[];
};

export function runExecutionEngine(input: ExecutionEngineInput): ExecutionEngineOutput {
  const { portfolio, plan, opportunities } = input;
  const posture: RiskPosture = plan.riskPosture ?? "balanced";

  const leaks = detectRiskLeaks(portfolio);
  const topLeak = leaks[0];

  const amt = suggestedAmountBase(portfolio, plan);

  const topOpp = opportunities[0];

  const actions: ExecutionAction[] = [];

  // Action 1 (NBA): fix biggest leak if high/critical, else take best opportunity.
  if (topLeak && (topLeak.severity === "high" || topLeak.severity === "critical")) {
    actions.push({
      id: uid(),
      kind: "REBALANCE",
      symbol: topOpp?.symbol ?? "CORE",
      name: topOpp?.name ?? "Core diversification",
      bucket: "core",
      amountBase: amt,
      priority: 1,
      rationale:
        `${topLeak.title}. ${topLeak.suggestedFix ?? "Rebalance into diversified core."}`,
      impact: { oddsDelta: 1.2, riskDelta: -1.8 },
      guardrails: { ok: true, notes: ["Respects institutional diversification principles."] },
    });
  } else if (topOpp) {
    const oddsDelta = clamp(topOpp.expectedOddsDelta, -3, 6);
    const riskDelta = topOpp.riskLabel === "high" ? 1.6 : topOpp.riskLabel === "medium" ? 0.7 : -0.2;

    const act: ExecutionAction = {
      id: uid(),
      kind: "BUY",
      symbol: topOpp.symbol,
      name: topOpp.name,
      bucket: topOpp.bucketHint,
      amountBase: amt,
      priority: 1,
      rationale: `${topOpp.whyNow} (Fit ${topOpp.fitScore}/100)`,
      impact: { oddsDelta, riskDelta },
      guardrails: guardrailsFor(
        {
          id: "tmp",
          kind: "BUY",
          symbol: topOpp.symbol,
          name: topOpp.name,
          amountBase: amt,
          priority: 1,
          rationale: "",
          impact: { oddsDelta, riskDelta },
          guardrails: { ok: true, notes: [] },
        },
        posture
      ),
    };

    actions.push(act);
  }

  // Action 2: defensive if posture not growth or regime risk_off implied by low-fit opportunities.
  const opp2 = opportunities[1];
  if (opp2) {
    actions.push({
      id: uid(),
      kind: opp2.riskLabel === "low" ? "HEDGE" : "BUY",
      symbol: opp2.symbol,
      name: opp2.name,
      bucket: opp2.bucketHint,
      amountBase: clamp(amt * 0.6, 25, amt),
      priority: 2,
      rationale: `Second-best plan-aligned move: ${opp2.whyNow}`,
      impact: {
        oddsDelta: clamp(opp2.expectedOddsDelta * 0.6, -2, 4),
        riskDelta: opp2.riskLabel === "low" ? -0.8 : 0.4,
      },
      guardrails: { ok: true, notes: ["OK"] },
    });
  }

  // Action 3: discipline (cash drag / pacing)
  actions.push({
    id: uid(),
    kind: "REBALANCE",
    symbol: "DISCIPLINE",
    name: "Discipline step",
    bucket: "policy",
    amountBase: 0,
    priority: 3,
    rationale:
      "If you do nothing, your plan drifts. Confirm you executed Action #1, or schedule it for a specific day this week.",
    impact: { oddsDelta: 0.4, riskDelta: -0.2 },
    guardrails: { ok: true, notes: ["OK"] },
  });

  return { riskLeaks: leaks, actions };
}