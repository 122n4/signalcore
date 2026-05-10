import type { MarketDirection } from "@/lib/trading/market";
import type { FeedMessageInput, FeedMessageOutput } from "./types";

function formatPrice(value: number | null | undefined, marketType: string): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  if (marketType === "forex") {
    return value.toFixed(4);
  }

  if (value >= 1000) {
    return value.toFixed(1);
  }

  if (value >= 1) {
    return value.toFixed(2);
  }

  return value.toFixed(4);
}

function sessionLabel(input: FeedMessageInput): string {
  switch (input.market.session.session) {
    case "london_open":
      return "London open";
    case "london_session":
      return "London session";
    case "london_ny_overlap":
      return "London-New York overlap";
    case "ny_open":
      return "New York open";
    case "midday_lull":
      return "midday lull";
    case "late_us":
      return "late US";
    case "asia_flow":
      return "Asia flow";
    case "weekend_drift":
      return "weekend drift";
    case "pre_market":
      return "pre-market";
    case "market_closed":
      return "next active session";
  }
}

function setupCue(input: FeedMessageInput): string {
  switch (input.market.liquidity.state) {
    case "liquidity_sweep":
      return "Liquidity sweep detected.";
    case "reclaim_after_sweep":
      return "Reclaim after sweep detected.";
    case "thin_liquidity":
      return "Liquidity is thin. Wait for better participation.";
    case "healthy_participation":
      return "Participation is healthy and structure is building.";
    case "poor_participation":
      return "Participation is poor and follow-through is limited.";
    case "neutral":
      return input.decisionCore.decision.secondaryMessage ?? "Structure is still building.";
  }
}

function directionLabel(direction: MarketDirection): string {
  switch (direction) {
    case "long":
      return "Long";
    case "short":
      return "Short";
    case "neutral":
      return "Neutral";
  }
}

function triggerPhrase(input: FeedMessageInput): string | null {
  const level = formatPrice(
    input.executionPlan.entryZone.triggerLevel ?? input.setupCore.setup.triggerLevel ?? null,
    input.snapshot.marketType,
  );

  if (!level) {
    return null;
  }

  if (input.setupCore.setup.direction === "long") {
    return `above ${level}`;
  }

  if (input.setupCore.setup.direction === "short") {
    return `below ${level}`;
  }

  return `near ${level}`;
}

function blockedReason(input: FeedMessageInput): string {
  const reason =
    input.executionPlan.executionStatus.reasons[0] ??
    input.transition.transitionReason;

  return reason.replace(/\.$/, "");
}

export function buildFeedMessage(input: FeedMessageInput): FeedMessageOutput {
  const instrument = input.market.instrument;
  const direction = directionLabel(input.setupCore.setup.direction);
  const trigger = triggerPhrase(input);

  switch (input.transition.nextState) {
    case "MARKET_CLOSED":
      return {
        headline: "Market closed",
        body: `Syntrake is waiting for the next ${sessionLabel(input)} window.`,
        shortPushMessage: "Market closed",
        severity: "info",
      };
    case "SESSION_OPEN":
      return {
        headline: "Session open",
        body: `Syntrake is analysing the ${sessionLabel(input)}.`,
        shortPushMessage: `Session open — ${sessionLabel(input)}`,
        severity: "info",
      };
    case "WAIT":
      return {
        headline: "Wait",
        body:
          input.decisionCore.decision.secondaryMessage ??
          "Conditions are not ready yet.",
        shortPushMessage: "Wait — Conditions not ready yet",
        severity: "info",
      };
    case "SETUP_FORMING":
      return {
        headline: "Setup forming",
        body: setupCue(input),
        shortPushMessage: "Setup forming",
        severity: "info",
      };
    case "TRADE_VALID":
      return {
        headline: "Trade valid",
        body: trigger
          ? `${direction} ${instrument} ${trigger}`
          : `${direction} ${instrument} on confirmation.`,
        shortPushMessage: trigger
          ? `Trade valid — ${direction} ${instrument} ${trigger}`
          : `Trade valid — ${direction} ${instrument}`,
        severity: "action",
      };
    case "TRADE_ACTIVE":
      return {
        headline: "Trade active",
        body: "Execution is live. Follow the invalidation and target path.",
        shortPushMessage: `Trade active — ${instrument}`,
        severity: "action",
      };
    case "BLOCKED":
      return {
        headline: "Blocked",
        body: `Valid setup, but ${blockedReason(input)}.`,
        shortPushMessage: "Blocked — Execution restricted",
        severity: "caution",
      };
    case "TOO_LATE":
      return {
        headline: "Too late",
        body: "Entry window degraded.",
        shortPushMessage: "Too late — Entry window degraded",
        severity: "caution",
      };
    case "EXIT":
      return {
        headline: "Exit",
        body: "Invalidation reached.",
        shortPushMessage: `Exit — ${instrument}`,
        severity: "action",
      };
    case "SESSION_END":
      return {
        headline: "Session end",
        body: "The active session ended. Reset for the next live window.",
        shortPushMessage: "Session end",
        severity: "info",
      };
  }
}
