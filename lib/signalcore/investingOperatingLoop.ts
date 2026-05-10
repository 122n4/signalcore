export type InvestingOperatingLoopStepKey = "plan" | "holdings" | "proof" | "close_day";

export type InvestingOperatingLoopStep = {
  key: InvestingOperatingLoopStepKey;
  label: string;
  detail: string;
  state: "done" | "active" | "idle";
};

export type InvestingOperatingLoopStage =
  | "setup_plan"
  | "fund_holdings"
  | "capture_proof"
  | "close_day"
  | "closed_waiting";

export type InvestingOperatingLoopSummary = {
  stage: InvestingOperatingLoopStage;
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
  steps: InvestingOperatingLoopStep[];
};

function clampInt(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

export function formatInvestingNextReviewWindow(nextReviewAt: string | null | undefined, nowMs = Date.now()) {
  if (!nextReviewAt) return "Next review pending";

  const at = new Date(nextReviewAt).getTime();
  if (!Number.isFinite(at)) return "Next review pending";

  const diffMs = at - nowMs;
  if (diffMs <= 0) return "Now";

  const diffMinutes = Math.max(1, Math.round(diffMs / 60_000));
  if (diffMinutes < 60) return `${diffMinutes}m`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h`;

  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d`;
}

export function buildInvestingOperatingLoopSummary(args: {
  hasPlan: boolean;
  hasHoldings: boolean;
  doneToday: boolean;
  receiptsCount: number;
  streak: number;
  weeklyConfirmedEur?: number | null;
  nextReviewAt?: string | null;
  nowMs?: number;
}): InvestingOperatingLoopSummary {
  const receiptsCount = clampInt(args.receiptsCount);
  const streakDays = clampInt(args.streak);
  const weeklyConfirmedEur = Number.isFinite(Number(args.weeklyConfirmedEur))
    ? Number(args.weeklyConfirmedEur)
    : 0;
  const proofDone = args.doneToday || receiptsCount > 0;
  const closeDone = args.doneToday;

  const steps: InvestingOperatingLoopStep[] = [
    {
      key: "plan",
      label: "Plan active",
      detail: "Turn the objective into guardrails before risking capital.",
      state: args.hasPlan ? "done" : "active",
    },
    {
      key: "holdings",
      label: "Holdings connected",
      detail: "Give Syntrake real portfolio state so risk and drift become useful.",
      state: args.hasHoldings ? "done" : args.hasPlan ? "active" : "idle",
    },
    {
      key: "proof",
      label: "Proof captured",
      detail: "Log what changed so the engine can learn from real execution quality.",
      state: proofDone ? "done" : args.hasPlan && args.hasHoldings ? "active" : "idle",
    },
    {
      key: "close_day",
      label: "Day closed",
      detail: "Lock the receipt and preserve continuity for the next cycle.",
      state: closeDone ? "done" : proofDone && args.hasPlan && args.hasHoldings ? "active" : "idle",
    },
  ];

  const progressDone = steps.filter((step) => step.state === "done").length;
  const progressTotal = steps.length;
  const completionPct = Math.round((progressDone / progressTotal) * 100);
  const nextReviewLabel = formatInvestingNextReviewWindow(args.nextReviewAt ?? null, args.nowMs);

  if (!args.hasPlan) {
    return {
      stage: "setup_plan",
      headline: "Activate the plan to start the investing operating loop.",
      body: "Until the plan is active, Daily cannot enforce real constraints around your target, horizon, and risk posture.",
      whyReturn:
        "The loop only compounds when plan, holdings, proof, and close-day stay connected instead of living in separate screens.",
      nextReviewLabel,
      progressDone,
      progressTotal,
      completionPct,
      streakDays,
      receiptsCount,
      weeklyConfirmedEur,
      steps,
    };
  }

  if (!args.hasHoldings) {
    return {
      stage: "fund_holdings",
      headline: "Add holdings to turn the loop into something real.",
      body: "Holdings unlock concentration checks, valuation sanity, drift monitoring, and daily guidance tied to actual capital.",
      whyReturn:
        "Users come back when the app reflects their real portfolio, not just a generic plan.",
      nextReviewLabel,
      progressDone,
      progressTotal,
      completionPct,
      streakDays,
      receiptsCount,
      weeklyConfirmedEur,
      steps,
    };
  }

  if (!proofDone) {
    return {
      stage: "capture_proof",
      headline: "Run today's loop and capture proof before the day drifts away.",
      body: "The core investing loop is now about evidence: one clean action, proof of what changed, and no ambiguity about whether the cycle was completed.",
      whyReturn:
        "Proof capture makes tomorrow's guidance sharper and stops the product from feeling like passive content.",
      nextReviewLabel,
      progressDone,
      progressTotal,
      completionPct,
      streakDays,
      receiptsCount,
      weeklyConfirmedEur,
      steps,
    };
  }

  if (!closeDone) {
    return {
      stage: "close_day",
      headline: "Close the day and protect continuity.",
      body: "You already have proof on record. The next leverage is discipline: close the cycle so streak, receipts, and future evaluation stay clean.",
      whyReturn:
        "Continuity is what turns a useful investing tool into a monthly habit worth paying to keep.",
      nextReviewLabel,
      progressDone,
      progressTotal,
      completionPct,
      streakDays,
      receiptsCount,
      weeklyConfirmedEur,
      steps,
    };
  }

  return {
    stage: "closed_waiting",
    headline: "Today's investing loop is closed.",
    body: `The cycle is complete. Return in ${nextReviewLabel} so Syntrake can continue from a clean state instead of rebuilding context from scratch.`,
    whyReturn:
      "Coming back on the next evaluation window keeps the streak alive and preserves the quality of the decision loop.",
    nextReviewLabel,
    progressDone,
    progressTotal,
    completionPct,
    streakDays,
    receiptsCount,
    weeklyConfirmedEur,
    steps,
  };
}
