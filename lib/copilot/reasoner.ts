// lib/copilot/reasoner.ts
import type { CopilotContext, CopilotInsight, CopilotCTA, CopilotResponse } from "./types";

function id(prefix: string) {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

function pick<T>(arr: T[], n: number) {
  return arr.slice(0, Math.max(0, n));
}

export function reasonCopilot(ctx: CopilotContext): CopilotResponse {
  const e = ctx.engine;
  const b = e?.breakdown;

  const coherence = typeof b?.overall === "number" ? b.overall : null;
  const assetFit = typeof e?.assetFit?.overall === "number" ? e.assetFit.overall : null;

  const insights: CopilotInsight[] = [];
  const ctas: CopilotCTA[] = [];

  // Tier / access messaging
  if (ctx.isAuthenticated && ctx.isPaid) {
    insights.push({
      id: id("tier"),
      kind: "success",
      title: "Premium active",
      detail: "Advisor + drift monitoring + advanced planning are unlocked.",
    });
    ctas.push({ label: "Manage subscription", action: "open_manage_subscription" });
  } else if (ctx.isAuthenticated && !ctx.isPaid) {
    insights.push({
      id: id("tier"),
      kind: "info",
      title: "Premium available",
      detail: "Unlock Advisor + drift + advanced planning when you’re ready.",
    });
    ctas.push({ label: "View pricing", action: "open_pricing" });
  } else {
    insights.push({
      id: id("tier"),
      kind: "info",
      title: "Guest mode",
      detail: "Sign in to save portfolio + planning to the cloud.",
    });
    ctas.push({ label: "View pricing", action: "open_pricing" });
  }

  // Goal / portfolio prompts (high leverage)
  if (!ctx.flags.goalIsComplete) {
    insights.push({
      id: id("goal"),
      kind: "warning",
      title: "Goal missing",
      detail: "Add a target + timeframe to unlock goal-aware coherence and planning.",
      driver: "goal",
    });
    ctas.push({ label: "Set goal", action: "open_planning", targetTab: "planning" });
  }

  if (!ctx.flags.hasPortfolio) {
    insights.push({
      id: id("pf"),
      kind: "warning",
      title: "Portfolio empty",
      detail: "Add what you hold so coherence + asset fit react to your real plan.",
      driver: "portfolio",
    });
    ctas.push({ label: "Add holdings", action: "open_portfolio", targetTab: "portfolio" });
  }

  // Coherence interpretation
  if (coherence != null) {
    if (coherence >= 82) {
      insights.push({
        id: id("coh"),
        kind: "success",
        title: "Coherence is strong",
        detail: "Your plan looks aligned. Focus on process discipline and cadence.",
        driver: "overall",
      });
    } else if (coherence >= 68) {
      insights.push({
        id: id("coh"),
        kind: "info",
        title: "Coherence is decent",
        detail: "There are a few leaks. Fix the weakest driver first (goal/risk/asset fit).",
        driver: "overall",
      });
    } else {
      insights.push({
        id: id("coh"),
        kind: "warning",
        title: "Coherence is fragile",
        detail: "Reduce complexity and tighten alignment between goal/risk/horizon and holdings.",
        driver: "overall",
      });
      ctas.push({ label: "Open advisor", action: "open_advisor", targetTab: "advisor" });
    }
  }

  // Asset fit interpretation
  if (assetFit != null && ctx.flags.hasPortfolio) {
    if (assetFit < 62) {
      insights.push({
        id: id("af"),
        kind: "warning",
        title: "Asset fit is weak",
        detail: "Some holdings look misaligned with the current context. Consider simplifying into fewer buckets.",
        driver: "assetFit",
      });
      ctas.push({ label: "Review asset fit", action: "open_advisor", targetTab: "advisor" });
    } else if (assetFit < 75) {
      insights.push({
        id: id("af"),
        kind: "info",
        title: "Asset fit is mixed",
        detail: "A few positions may be noisy. Small re-tilts can improve coherence without big churn.",
        driver: "assetFit",
      });
    } else {
      insights.push({
        id: id("af"),
        kind: "success",
        title: "Asset fit is strong",
        detail: "Holdings are broadly aligned with regime/horizon/risk. Keep execution disciplined.",
        driver: "assetFit",
      });
    }
  }

  // Drift interpretation (if engine includes it)
  const drift = e?.drift?.label ?? null;
  const delta = typeof e?.drift?.scoreDelta === "number" ? e.drift.scoreDelta : 0;
  if (drift && ctx.isPaid) {
    if (drift === "high") {
      insights.push({
        id: id("drift"),
        kind: "warning",
        title: "High drift detected",
        detail: `Your coherence moved ${delta >= 0 ? "+" : ""}${Math.round(delta)} points since last snapshot. Review changes before adding complexity.`,
        driver: "drift",
      });
      ctas.push({ label: "Open drift view", action: "open_advisor", targetTab: "advisor", anchorId: "drift" });
    } else if (drift === "mild") {
      insights.push({
        id: id("drift"),
        kind: "info",
        title: "Mild drift",
        detail: `Small coherence change (${delta >= 0 ? "+" : ""}${Math.round(delta)}). Keep cadence steady.`,
        driver: "drift",
      });
    }
  }

  // Clean up CTAs: dedupe by action+tab
  const seen = new Set<string>();
  const cleanCtas = ctas.filter((c) => {
    const k = `${c.action}_${c.targetTab ?? ""}_${c.anchorId ?? ""}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const title = "SignalCore Copilot";

  // Summary: short, operational, habit-forming
  const summary = (() => {
    const regime = ctx.regime;
    const horizon = ctx.horizon;
    const risk = ctx.risk;

    if (!ctx.flags.goalIsComplete || !ctx.flags.hasPortfolio) {
      return "Set your goal + add holdings so guidance becomes plan-aware (not generic).";
    }

    return `Context: ${regime}. Horizon: ${horizon}. Risk: ${risk}. Your next best step is to fix the lowest driver first, then keep cadence disciplined.`;
  })();

  return {
    title,
    summary,
    insights: pick(insights, 6),
    ctas: pick(cleanCtas, 4),
    payload: {
      tab: ctx.tab,
      tier: ctx.tier,
      flags: ctx.flags,
    },
  };
}