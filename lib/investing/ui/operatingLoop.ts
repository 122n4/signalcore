export type InvestingOperatingLoopSummary = {
  stage: "setup_plan" | "fund_holdings" | "capture_proof" | "close_day" | "closed_waiting";
  headline: string;
  body: string;
  whyReturn: string;
  nextReviewLabel: string;
  progressDone: number;
  progressTotal: number;
  completionPct: number;
  streakDays: number;
  receiptsCount: number;
  weeklyConfirmedEur: number;
  steps: Array<{ key: "plan" | "holdings" | "proof" | "close_day"; label: string; detail: string; state: "done" | "active" | "idle" }>;
};

function nextReview(value?: string | null, now = Date.now()) {
  const timestamp = value ? new Date(value).getTime() : Number.NaN;
  if (!Number.isFinite(timestamp)) return "Next review pending";
  const minutes = Math.max(0, Math.round((timestamp - now) / 60_000));
  if (minutes <= 0) return "Now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours}h` : `${Math.round(hours / 24)}d`;
}

export function buildInvestingOperatingLoopSummary(args: {
  hasPlan: boolean; hasHoldings: boolean; doneToday: boolean; receiptsCount: number; streak: number;
  weeklyConfirmedEur?: number | null; nextReviewAt?: string | null; nowMs?: number;
}): InvestingOperatingLoopSummary {
  const proof = args.doneToday || args.receiptsCount > 0;
  const steps: InvestingOperatingLoopSummary["steps"] = [
    { key: "plan", label: "Plan active", detail: "Turn the objective into guardrails before risking capital.", state: args.hasPlan ? "done" : "active" },
    { key: "holdings", label: "Holdings connected", detail: "Use the persistent Investing account for real portfolio state.", state: args.hasHoldings ? "done" : args.hasPlan ? "active" : "idle" },
    { key: "proof", label: "Proof captured", detail: "Persist a canonical server-side decision cycle.", state: proof ? "done" : args.hasPlan && args.hasHoldings ? "active" : "idle" },
    { key: "close_day", label: "Day closed", detail: "Close recommendation separately from Paper execution.", state: args.doneToday ? "done" : proof && args.hasPlan && args.hasHoldings ? "active" : "idle" },
  ];
  const progressDone = steps.filter((step) => step.state === "done").length;
  const common = {
    whyReturn: "Returning on the next evaluation window preserves a clean, auditable decision history.",
    nextReviewLabel: nextReview(args.nextReviewAt, args.nowMs),
    progressDone,
    progressTotal: steps.length,
    completionPct: Math.round((progressDone / steps.length) * 100),
    streakDays: Math.max(0, Math.round(args.streak || 0)),
    receiptsCount: Math.max(0, Math.round(args.receiptsCount || 0)),
    weeklyConfirmedEur: Number(args.weeklyConfirmedEur || 0),
    steps,
  };
  if (!args.hasPlan) return { ...common, stage: "setup_plan", headline: "Activate the plan to start the investing operating loop.", body: "The mandate needs persisted objectives, horizon and risk settings." };
  if (!args.hasHoldings) return { ...common, stage: "fund_holdings", headline: "Open and fund a persistent Paper account.", body: "Cash and positions are read from Investing-owned projections, not Trading broker state." };
  if (!proof) return { ...common, stage: "capture_proof", headline: "Run today’s canonical recommendation cycle.", body: "The server recomputes mandate, governance and rebalance before persistence." };
  if (!args.doneToday) return { ...common, stage: "close_day", headline: "Close the recommendation loop.", body: "Paper execution remains a separate explicit action." };
  return { ...common, stage: "closed_waiting", headline: "Today’s investing loop is closed.", body: "The canonical decision is persisted; execution state remains independently visible." };
}
