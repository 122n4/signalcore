// lib/copilot/copilotCore.ts
import { runEngineV2, type EngineV2Output } from "@/lib/signalcore";
import type { CopilotContext, CopilotResponse } from "./types";
import { id, normalizeText, pct } from "./utils";

function hasGoal(ctx: CopilotContext) {
  const g = ctx.goal;
  return Boolean(g?.amount && g?.months);
}

function hasPortfolio(ctx: CopilotContext) {
  return Array.isArray(ctx.portfolio) && ctx.portfolio.length > 0;
}

function weakestDriver(out: EngineV2Output) {
  const b = out.breakdown;
  const keys = Object.keys(b).filter((k) => k !== "overall") as Array<keyof typeof b>;
  let bestKey = keys[0];
  let bestVal = Number(b[bestKey] ?? 0);
  for (const k of keys) {
    const v = Number(b[k] ?? 0);
    if (v < bestVal) {
      bestVal = v;
      bestKey = k;
    }
  }
  return { key: String(bestKey), value: bestVal };
}

function buildDefaultCTAs(ctx: CopilotContext, out: EngineV2Output) {
  const ctas = [];

  if (!ctx.isAuthenticated) {
    ctas.push({ label: "Sign in", action: "open_pricing" as const, targetTab: "overview" as any });
    return ctas;
  }

  if (ctx.tier !== "paid") {
    ctas.push({ label: "Upgrade", action: "open_pricing" as const, targetTab: "overview" as any });
  }

  if (!hasGoal(ctx)) ctas.push({ label: "Set goal", action: "open_planning" as const, targetTab: "planning" as any });
  if (!hasPortfolio(ctx))
    ctas.push({ label: "Add holdings", action: "open_portfolio" as const, targetTab: "portfolio" as any });

  // If weak driver is portfolio/assetFit, open portfolio/advisor
  const w = weakestDriver(out);
  if (w.key.includes("portfolio")) ctas.push({ label: "Fix portfolio structure", action: "open_portfolio" as const, targetTab: "portfolio" as any });
  if (w.key.includes("assetFit")) ctas.push({ label: "Review asset fit", action: "open_advisor" as const, targetTab: "advisor" as any });

  // Keep short
  return ctas.slice(0, 3);
}

function buildInsights(ctx: CopilotContext, out: EngineV2Output) {
  const insights = [];

  if (ctx.tier === "paid") {
    insights.push({
      id: id("tier"),
      kind: "success" as const,
      title: "Premium active",
      detail: "Advisor + drift + asset fit are unlocked.",
    });
  } else {
    insights.push({
      id: id("tier"),
      kind: "info" as const,
      title: "Free mode",
      detail: "You can explore. Premium unlocks full Advisor + advanced tooling.",
    });
  }

  if (!hasGoal(ctx)) {
    insights.push({
      id: id("goal"),
      kind: "warning" as const,
      title: "Goal missing",
      detail: "Add target amount + months to unlock stronger goal-aware coherence.",
    });
  }

  if (!hasPortfolio(ctx)) {
    insights.push({
      id: id("pf"),
      kind: "warning" as const,
      title: "Portfolio missing",
      detail: "Add holdings so coherence + asset fit reacts to your real situation.",
    });
  }

  const w = weakestDriver(out);
  insights.push({
    id: id("weak"),
    kind: w.value <= 65 ? ("warning" as const) : ("info" as const),
    title: "Weakest driver",
    detail: `${w.key} is your lowest driver (${Math.round(w.value)}/100). Fix this first to raise coherence fastest.`,
  });

  if (out.drift?.label && out.drift.label !== "stable") {
    insights.push({
      id: id("drift"),
      kind: out.drift.label === "high" ? ("warning" as const) : ("info" as const),
      title: "Drift detected",
      detail: `Coherence changed (${out.drift.scoreDelta >= 0 ? "+" : ""}${Math.round(out.drift.scoreDelta)}). Treat this as a “re-check” signal.`,
    });
  }

  return insights.slice(0, 6);
}

function buildAssistantMessage(ctx: CopilotContext, out: EngineV2Output, userMsg?: string) {
  const overall = out.breakdown.overall ?? 0;
  const w = weakestDriver(out);

  const lines: string[] = [];

  lines.push(
    `Coherence is ${Math.round(overall)}/100. Weakest driver: ${w.key} (${Math.round(w.value)}/100).`
  );

  if (!hasGoal(ctx)) {
    lines.push("To increase coherence fast: define your goal (amount + months).");
  } else {
    lines.push("Goal is defined. Next: align portfolio + process with the current regime.");
  }

  if (!hasPortfolio(ctx)) {
    lines.push("Add holdings and I’ll compute per-asset fit + coherence changes instantly.");
  } else {
    const af = out.assetFit?.overall ?? out.breakdown.assetFit ?? null;
    if (typeof af === "number") lines.push(`Asset Fit overall: ${Math.round(af)}/100.`);
  }

  if (Array.isArray(out.topActions) && out.topActions.length) {
    lines.push("");
    lines.push("Top actions (operational):");
    for (const a of out.topActions.slice(0, 3)) {
      lines.push(`• ${a.title}${a.detail ? ` — ${a.detail}` : ""}`);
    }
  }

  if (userMsg) {
    const t = normalizeText(userMsg);
    if (t.includes("drift")) {
      lines.push("");
      lines.push("Drift interpretation:");
      lines.push("• stable: keep cadence");
      lines.push("• mild: re-check weakest driver");
      lines.push("• high: freeze impulsive changes, re-confirm regime + risk budget, then update the plan.");
    }
    if (t.includes("what") || t.includes("next") || t.includes("agora") || t.includes("faz")) {
      lines.push("");
      lines.push("If you want, tell me: (1) your goal, (2) horizon, (3) risk style — I’ll output a weekly operating plan.");
    }
  }

  return lines.join("\n");
}

/**
 * Main entry — deterministic copilot powered by Engine v2.
 * (Later we can swap-in LLM, but keep this as “ground truth layer”.)
 */
export function runCopilot(input: { context: CopilotContext; userMessage?: string | null }): CopilotResponse {
  const ctx = input.context;

  const regime = ctx.regime ?? "Neutral";
  const horizon = ctx.horizon ?? "Long";
  const risk = ctx.risk ?? "Balanced";
  const goal = ctx.goal ?? null;
  const portfolio = Array.isArray(ctx.portfolio) ? ctx.portfolio : [];

  const out = runEngineV2({
    regime,
    horizon,
    risk,
    goal,
    portfolio,
    previousOverall: ctx.previousOverall ?? null,
  });

  const insights = buildInsights(ctx, out);
  const ctas = buildDefaultCTAs(ctx, out);

  const assistant_message = buildAssistantMessage(ctx, out, input.userMessage ?? undefined);

  return {
    title: "SignalCore Copilot",
    summary: "Operational guidance is active.",
    assistant_message,
    insights,
    ctas,
    payload: {
      tier: ctx.tier,
      tab: ctx.tab ?? null,
      coherence: out.breakdown.overall,
      weakest: weakestDriver(out),
      drift: out.drift ?? { label: "stable", scoreDelta: 0 },
      assetFit: out.assetFit?.overall ?? out.breakdown.assetFit ?? null,
      posture: out.posture ?? "Neutral",
      cadence: out.nextCheck ?? "Monthly",
      note: `This is guidance (not orders). Drivers: ${pct(out.breakdown.overall)}`,
    },
  };
}