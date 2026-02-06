export const dynamic = "force-dynamic";

function lastUser(messages: any[]) {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "user") return String(messages[i]?.content ?? "");
  }
  return "";
}

function simpleAdvisorReply(q: string, ctx: any) {
  const coherence = Math.round(ctx?.out?.breakdown?.overall ?? 0);
  const regime = String(ctx?.regime ?? "Neutral / Range-bound");

  const isRiskOff = regime === "Risk-off";

  if (q.toLowerCase().includes("what should i do") || q.toLowerCase().includes("today")) {
    return `Today’s decision: ${
      isRiskOff ? "reduce risk slightly" : "stay disciplined and execute inside your bands"
    }.\n\nWhy: coherence is ${coherence}/100 and regime is ${regime}.\n\nNext step: open Execution and generate candidates — then stop.`;
  }

  if (q.toLowerCase().includes("risk")) {
    return `Risk check: coherence ${coherence}/100 under regime ${regime}.\n\nIf coherence is < 70, your biggest risk is not the market — it’s decision drift. Fix structure first.`;
  }

  if (q.toLowerCase().includes("goal")) {
    return `Goal guidance: your plan must prioritize pace + drawdown.\n\nIf you want faster progress, the correct move is improving coherence + contributions — not random high-risk bets.`;
  }

  return `Got it. Based on your coherence (${coherence}/100) and regime (${regime}), the best move is to keep decisions inside guardrails.\n\nAsk: “What should I do today?” for the exact next step.`;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  const context = body?.context ?? {};

  const q = lastUser(messages);

  // For now: deterministic response (safe + stable).
  // Later we plug OpenAI here.
  const assistant_message = simpleAdvisorReply(q, context);

  return Response.json({ assistant_message });
}