export type InvestingCommandState = "setup" | "build" | "act" | "review";

export type InvestingCommandModel = {
  state: InvestingCommandState;
  eyebrow: string;
  title: string;
  reason: string;
  actionLabel: string;
  actionHref: string;
  statusLabel: string;
};

export function buildInvestingCommandModel(input: {
  hasPlan: boolean;
  hasHoldings: boolean;
  doneToday: boolean;
  mode?: string;
}): InvestingCommandModel {
  const mode = input.mode || "investing";
  if (!input.hasPlan) {
    return {
      state: "setup",
      eyebrow: "Foundation required",
      title: "Define what this capital must achieve.",
      reason: "Syntrake needs your objective, horizon and risk boundaries before it can evaluate any investment responsibly.",
      actionLabel: "Create my plan",
      actionHref: `/app?tab=planning&mode=${mode}`,
      statusLabel: "Plan missing",
    };
  }
  if (!input.hasHoldings) {
    return {
      state: "build",
      eyebrow: "Portfolio required",
      title: "Connect your holdings or build the first allocation.",
      reason: "Without positions, Syntrake cannot measure concentration, drift or whether the portfolio still matches your plan.",
      actionLabel: "Complete portfolio",
      actionHref: `/app?tab=portfolio&mode=${mode}&fixNow=1&fixKey=no_holdings&fixFrom=overview`,
      statusLabel: "Holdings missing",
    };
  }
  if (!input.doneToday) {
    return {
      state: "act",
      eyebrow: "Today’s decision",
      title: "Review the next capital decision.",
      reason: "Your plan and portfolio are ready. Syntrake can now check risk, market context and portfolio drift for this cycle.",
      actionLabel: "Review today’s decision",
      actionHref: `/app?tab=daily&mode=${mode}`,
      statusLabel: "Decision pending",
    };
  }
  return {
    state: "review",
    eyebrow: "Loop complete",
    title: "Today’s decision is recorded.",
    reason: "No immediate action is required. Review the strategic explanation or return when the next evaluation window opens.",
    actionLabel: "Open strategic review",
    actionHref: `/app?tab=advisor&mode=${mode}`,
    statusLabel: "Protected",
  };
}
