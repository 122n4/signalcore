// lib/copilot/prompts.ts

import type { CopilotContext } from "./types";

export function tone(ctx: CopilotContext) {
  // Tom “institucional” mas humano.
  // Free: mais educativo / Premium: mais direto e operacional.
  const base =
    "Calm, structured, and practical. No hype. No urgency. Explain like a senior advisor.";
  const premium =
    "More operational. Clear next steps. Optimize coherence and reduce decision load.";
  return ctx.tier === "premium" ? premium : base;
}

export function tabHeadline(ctx: CopilotContext) {
  switch (ctx.tab) {
    case "overview":
      return "Weekly posture, simplified";
    case "portfolio":
      return "Portfolio desk";
    case "planning":
      return "Goal-based planning";
    case "advisor":
      return "Advisor — coherence first";
    case "screener":
      return "Screener — fit-first ranking";
    case "research":
      return "Research — decision-ready notes";
    case "risklab":
      return "Risk Lab — know your downside";
    case "alerts":
      return "Alerts — only when material";
    case "journal":
      return "Journal — process over noise";
    default:
      return "SignalCore";
  }
}