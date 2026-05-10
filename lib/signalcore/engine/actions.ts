// lib/signalcore/engine/actions.ts
import type { AutopilotMode } from "@/lib/signalcore/modes";
import type { Candidate, NBA } from "./types";
import { tinyId } from "./utils";

export function buildCandidates(args: {
  mode: AutopilotMode;
  hasPlan: boolean;
  hasHoldings: boolean;
  holdingsCount: number;
  missingValuesCount: number;
  cashEur: number;
}) {
  const out: Candidate[] = [];

  // Setup
  if (!args.hasPlan) {
    out.push({
      id: tinyId(),
      type: "setup",
      title: "Activate your plan",
      rationale: "Without constraints, an autopilot becomes dangerous.",
      impact: "Enables Safety Brain guardrails.",
      confidence: 0.92,
      action: {
        label: "Go to Planning",
        action: "go_planning",
        href: `/app?tab=planning&mode=${args.mode}`,
      },
    });
    return out;
  }

  if (args.hasPlan && !args.hasHoldings) {
    out.push({
      id: tinyId(),
      type: "setup",
      title: "Add holdings",
      rationale: "Holdings are required for drift + risk leak detection.",
      impact: "Unlocks daily candidates and monitoring.",
      confidence: 0.86,
      action: {
        label: "Go to Portfolio",
        action: "go_portfolio",
        href: `/app?tab=portfolio&mode=${args.mode}`,
      },
    });
    return out;
  }

  // Risk / structure candidates (no market data)
  if (args.holdingsCount <= 2) {
    out.push({
      id: tinyId(),
      type: "diversify",
      title: "Diversify holdings",
      rationale: "Very concentrated portfolios are fragile in regime shifts.",
      impact: "Reduces drawdown risk and stabilizes compounding.",
      confidence: 0.74,
      action: {
        label: "Open Portfolio",
        action: "open_portfolio",
        href: `/app?tab=portfolio&mode=${args.mode}`,
      },
    });
  }

  if (args.cashEur > 0) {
    out.push({
      id: tinyId(),
      type: "reduce_cash",
      title: "Reduce cash drag",
      rationale: "Idle cash reduces compounding over time.",
      impact: "Improves long-term growth probability.",
      confidence: 0.66,
      action: {
        label: "Review portfolio",
        action: "review_portfolio",
        href: `/app?tab=portfolio&mode=${args.mode}`,
      },
    });
  }

  if (args.missingValuesCount > 0) {
    out.push({
      id: tinyId(),
      type: "update_values",
      title: "Update missing EUR values",
      rationale: "Confirmed Money depends on portfolio totals being accurate.",
      impact: "Makes progress tracking real.",
      confidence: 0.7,
      action: {
        label: "Fix values",
        action: "fix_values",
        href: `/app?tab=portfolio&mode=${args.mode}`,
      },
    });
  }

  // fallback
  if (out.length === 0) {
    out.push({
      id: tinyId(),
      type: "review",
      title: "Hold (no action)",
      rationale: "No urgent risk leaks detected today.",
      impact: "Avoids overtrading. Protects compounding.",
      confidence: 0.82,
    });
  }

  // sort by confidence
  out.sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));

  return out.slice(0, 5);
}

export function buildNBA(args: {
  mode: AutopilotMode;
  hasPlan: boolean;
  hasHoldings: boolean;
  doneToday: boolean;
  candidates: Candidate[];
  starterPackCount: number;
}) : NBA {
  if (!args.hasPlan) {
    return {
      title: "Create & activate your plan",
      desc: "Safety Brain needs constraints before it can protect your capital.",
      confidence: 0.92,
      kind: "primary",
      cta: { label: "Go to Planning", action: "go_planning", href: `/app?tab=planning&mode=${args.mode}` },
    };
  }

  if (args.hasPlan && !args.hasHoldings) {
    if (args.starterPackCount > 0) {
      return {
        title: "Apply Starter Pack",
        desc: "One click portfolio to start compounding and unlock monitoring.",
        confidence: 0.86,
        kind: "primary",
        cta: { label: "Apply Starter Pack", action: "apply_starter_pack", href: `/app?tab=daily&mode=${args.mode}` },
      };
    }

    return {
      title: "Add holdings",
      desc: "Syntrake needs holdings to calculate drift and risk leaks.",
      confidence: 0.84,
      kind: "primary",
      cta: { label: "Go to Portfolio", action: "go_portfolio", href: `/app?tab=portfolio&mode=${args.mode}` },
    };
  }

  if (args.doneToday) {
    return {
      title: "Done for today",
      desc: "Your daily discipline is already confirmed. Come back tomorrow.",
      confidence: 0.75,
      kind: "ghost",
      cta: { label: "Refresh", action: "refresh", href: `/app?tab=daily&mode=${args.mode}` },
    };
  }

  // Candidates exist
  const top = args.candidates?.[0];

  if (top?.type === "review" || !top) {
    return {
      title: "Hold",
      desc: "No urgent actions detected today. Stability is a decision.",
      confidence: 0.82,
      kind: "primary",
      cta: { label: "Close the day", action: "mark_done", href: `/app?tab=daily&mode=${args.mode}` },
    };
  }

  return {
    title: "Next best action",
    desc: top.title,
    confidence: Math.max(0.6, Math.min(0.92, top.confidence ?? 0.75)),
    kind: "primary",
    cta: { label: top.action?.label || "Review", action: top.action?.action || "review", href: top.action?.href || `/app?tab=daily&mode=${args.mode}` },
  };
}
