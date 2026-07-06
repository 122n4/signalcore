import { composeTradingChartSnapshot } from "./chartSnapshot";
import { composeTradingLiveDecision } from "./liveDecision";
import { composeTradingWorkspaceSnapshot } from "./workspace";
import { coveragePriority } from "@/lib/trading/marketCoverageTypes";
import type {
  ComposeTradingLiveDecisionInput,
  TradingChartSnapshot,
  TradingLiveDecision,
  TradingWatchlistCoverageSummary,
  TradingWatchlistFocus,
  TradingWatchlistEntry,
  TradingWatchlistSection,
  TradingWatchlistSectionKey,
  TradingWorkspaceSnapshot,
} from "./types";

export type TradingActionIntent =
  | "execute_now"
  | "prepare_now"
  | "monitor_now"
  | "stand_aside"
  | "review_later";

export type TradingActionGuidance = {
  intent: TradingActionIntent;
  label: string;
  headline: string;
  summary: string;
};

export type TradingDayPlanStepTone = "good" | "warn" | "neutral";

export type TradingDayPlanStep = {
  slot: "now" | "next" | "if_not" | "close";
  title: string;
  body: string;
  tone: TradingDayPlanStepTone;
};

export type TradingDayPlan = {
  headline: string;
  summary: string;
  steps: TradingDayPlanStep[];
};

export type TradingAlertGuidance = {
  badge: string;
  headline: string;
  recheckWindow: string;
  nextAlertCondition: string;
  tone: TradingDayPlanStepTone;
};

const TRADING_WATCHLIST_STATE_ORDER: Record<TradingWatchlistEntry["currentState"], number> = {
  TRADE_ACTIVE: 0,
  TRADE_VALID: 1,
  SETUP_FORMING: 2,
  WAIT: 3,
  TOO_LATE: 4,
  BLOCKED: 5,
  MARKET_CLOSED: 6,
  SESSION_OPEN: 7,
  EXIT: 8,
  SESSION_END: 9,
};

const TRADING_WATCHLIST_EXECUTION_ORDER: Record<
  TradingWatchlistEntry["executionStatus"],
  number
> = {
  allowed: 0,
  caution: 1,
  restricted: 2,
};

const TRADING_WATCHLIST_SESSION_ORDER: Record<string, number> = {
  "London / NY overlap": 0,
  "London open": 1,
  "New York open": 2,
  "London session": 3,
  "Late US": 4,
  "Pre-market": 5,
  "Asia flow": 6,
  "Midday lull": 7,
  "Weekend drift": 8,
  "Market closed": 9,
};

const TRADING_WATCHLIST_SECTION_META: Record<
  TradingWatchlistSectionKey,
  Pick<TradingWatchlistSection, "title" | "description">
> = {
  look_first: {
    title: "Look first",
    description: "Start here. Actionable now plus the strongest near-ready setups in the current session.",
  },
  forming: {
    title: "Forming",
    description: "Worth attention. Structure is building, but it has not earned near-ready priority yet.",
  },
  waiting: {
    title: "Waiting / Stand aside",
    description: "Monitor only. There is no clean edge to act on right now.",
  },
  closed: {
    title: "Closed / Restricted",
    description: "Ignore for now. Closed market or operational restriction.",
  },
};

function tradingWatchlistPriority(state: TradingWatchlistEntry["currentState"]) {
  return TRADING_WATCHLIST_STATE_ORDER[state] ?? 99;
}

function tradingExecutionPriority(status: TradingWatchlistEntry["executionStatus"]) {
  return TRADING_WATCHLIST_EXECUTION_ORDER[status] ?? 99;
}

function tradingSessionPriority(sessionLabel: string) {
  return TRADING_WATCHLIST_SESSION_ORDER[sessionLabel] ?? 99;
}

function tradingCoveragePriority(entry: TradingWatchlistEntry) {
  return coveragePriority(entry.contextSummary.coverageStatus);
}

function clampTradingUtilityScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function hasCanonicalTradingSetup(entry: TradingWatchlistEntry) {
  return entry.workspace.setupCore.setup.type !== "none";
}

function isTradingClosedOrRestricted(
  entry: Pick<TradingWatchlistEntry, "currentState" | "executionStatus">,
) {
  return (
    entry.executionStatus === "restricted" ||
    entry.currentState === "BLOCKED" ||
    entry.currentState === "MARKET_CLOSED" ||
    entry.currentState === "SESSION_END"
  );
}

function tradingUtilityStateBase(entry: TradingWatchlistEntry) {
  switch (entry.currentState) {
    case "TRADE_ACTIVE":
      return 90;
    case "TRADE_VALID":
      return 84;
    case "SETUP_FORMING":
      return 68;
    case "WAIT":
      return 60;
    case "SESSION_OPEN":
      return 56;
    case "TOO_LATE":
      return 24;
    case "EXIT":
      return 18;
    case "BLOCKED":
      return 12;
    case "MARKET_CLOSED":
      return 8;
    case "SESSION_END":
      return 6;
  }
}

export function computeTradingOpportunityUtilityScore(entry: TradingWatchlistEntry) {
  const { setupCore, decisionCore, market } = entry.workspace;
  let score =
    tradingUtilityStateBase(entry) +
    (entry.contextSummary.marketOpen ? 6 : -12) +
    (entry.executionStatus === "allowed"
      ? 8
      : entry.executionStatus === "caution"
        ? 3
        : -22) +
    (hasCanonicalTradingSetup(entry) ? 6 : -14) +
    (setupCore.quality.score - 50) * 0.18 +
    (decisionCore.clarity.score - 50) * 0.16 +
    (setupCore.maturity.score - 50) * 0.12 +
    (setupCore.opportunityWindow.score - 50) * 0.14 +
    (market.session.confidence - 50) * 0.08 +
    (decisionCore.environment.score - 50) * 0.08;

  if (setupCore.maturity.state === "ready") {
    score += 6;
  } else if (setupCore.maturity.state === "developing") {
    score += 4;
  } else if (setupCore.maturity.state === "forming") {
    score += 2;
  } else if (setupCore.maturity.state === "late") {
    score -= 12;
  } else if (setupCore.maturity.state === "invalid") {
    score -= 16;
  }

  if (setupCore.opportunityWindow.state === "active") {
    score += 6;
  } else if (setupCore.opportunityWindow.state === "opening") {
    score += 4;
  } else if (setupCore.opportunityWindow.state === "forming") {
    score += 1;
  } else if (setupCore.opportunityWindow.state === "degrading") {
    score -= 10;
  } else if (setupCore.opportunityWindow.state === "closed") {
    score -= 14;
  }

  return clampTradingUtilityScore(score);
}

export function isTradingNearReadyOpportunity(entry: TradingWatchlistEntry) {
  const { setupCore, decisionCore } = entry.workspace;

  if (isTradingClosedOrRestricted(entry) || !entry.contextSummary.marketOpen) {
    return false;
  }

  if (!hasCanonicalTradingSetup(entry)) {
    return false;
  }

  if (
    entry.currentState !== "SETUP_FORMING" &&
    entry.currentState !== "WAIT" &&
    entry.currentState !== "SESSION_OPEN"
  ) {
    return false;
  }

  if (
    setupCore.maturity.state === "late" ||
    setupCore.maturity.state === "invalid" ||
    setupCore.opportunityWindow.state === "degrading" ||
    setupCore.opportunityWindow.state === "closed"
  ) {
    return false;
  }

  return (
    computeTradingOpportunityUtilityScore(entry) >= 70 &&
    setupCore.quality.score >= 72 &&
    decisionCore.clarity.score >= 68 &&
    setupCore.maturity.score >= 58 &&
    setupCore.opportunityWindow.score >= 60
  );
}

function firstTradingActionCopy(values: Array<string | null | undefined>) {
  for (const value of values) {
    if (value && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

function hasValidLiveBaseline(entry: TradingWatchlistEntry) {
  const liveBaseline = entry.liveDecision.liveBaseline;
  const signal = entry.liveDecision.signal;
  return Boolean(
    liveBaseline?.valid === true &&
      liveBaseline.baseline_id &&
      liveBaseline.engine_hash &&
      signal?.signal_id &&
      signal.baseline_id === liveBaseline.baseline_id &&
      signal.engine_hash === liveBaseline.engine_hash,
  );
}

function finitePositive(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : null;
}

function parseTargetZone(value: string | null | undefined) {
  const raw = String(value || "");
  const numbers = raw.match(/-?\d+(?:\.\d+)?/g)?.map((item) => Number(item)) ?? [];
  const valid = numbers.filter((item) => Number.isFinite(item) && item > 0);
  if (!valid.length) return null;
  if (valid.length === 1) return valid[0];
  return (valid[0] + valid[1]) / 2;
}

function hasExecutableOrderLevels(entry: TradingWatchlistEntry) {
  const decision = entry.liveDecision;
  const entryLevel =
    finitePositive(decision.entryZoneLow) ??
    finitePositive(decision.entryZoneHigh) ??
    finitePositive(decision.triggerLevel);
  const stop = finitePositive(decision.invalidationLevel);
  const target = parseTargetZone(decision.targetZone);

  return entryLevel != null && stop != null && target != null;
}

export function resolveTradingActionGuidance(
  entry: TradingWatchlistEntry,
): TradingActionGuidance {
  const primaryContext = firstTradingActionCopy([
    entry.liveDecision.nextDisciplineStep,
    entry.workspace.whySummary.whyNotNow,
    entry.workspace.whySummary.whyNow,
    entry.contextSummary.priorityReason,
    entry.liveDecision.reasons[0],
    entry.currentHeadline,
  ]);

  if (
    hasValidLiveBaseline(entry) &&
    hasExecutableOrderLevels(entry) &&
    (entry.currentState === "TRADE_VALID" || entry.currentState === "TRADE_ACTIVE") &&
    entry.executionStatus === "allowed"
  ) {
    return {
      intent: "execute_now",
      label: "Execute now",
      headline: "Clean trigger and execution aligned.",
      summary:
        primaryContext ??
        "The setup is live and the current broker-facing plan is ready to execute.",
    };
  }

  if (
    ((entry.currentState === "TRADE_VALID" || entry.currentState === "TRADE_ACTIVE") &&
      entry.executionStatus === "caution") ||
    isTradingNearReadyOpportunity(entry)
  ) {
    return {
      intent: "prepare_now",
      label: "Prepare now",
      headline: "Near-ready setup. Build the order plan before the trigger confirms.",
      summary:
        primaryContext ??
        "This setup deserves focused attention, but still needs cleaner execution discipline.",
    };
  }

  if (
    entry.currentState === "BLOCKED" ||
    entry.currentState === "TOO_LATE" ||
    entry.currentState === "EXIT" ||
    entry.executionStatus === "restricted"
  ) {
    return {
      intent: "stand_aside",
      label: "Stand aside",
      headline: "Capital protection comes first here.",
      summary:
        primaryContext ??
        "This market is restricted, late, or structurally invalid for a disciplined trade.",
    };
  }

  if (
    entry.currentState === "SETUP_FORMING" ||
    entry.currentState === "SESSION_OPEN" ||
    (entry.currentState === "WAIT" && entry.contextSummary.marketOpen)
  ) {
    return {
      intent: "monitor_now",
      label: "Monitor now",
      headline: "Structure is building, but there is no clean entry yet.",
      summary:
        primaryContext ??
        "Stay alert, keep the trigger in view, and avoid forcing an early entry.",
    };
  }

  return {
    intent: "review_later",
    label: "Review later",
    headline: "No live action in this session window.",
    summary:
      primaryContext ??
      "Use this slot to review the market map, then come back when the session reopens.",
  };
}

export function resolveTradingDayPlan(entry: TradingWatchlistEntry): TradingDayPlan {
  const action = resolveTradingActionGuidance(entry);
  const sessionLabel = entry.contextSummary.sessionLabel;
  const triggerText =
    entry.liveDecision.triggerLevel != null
      ? `Trigger level ${entry.liveDecision.triggerLevel.toFixed(
          Math.abs(entry.liveDecision.triggerLevel) >= 10 ? 2 : 4,
        )}.`
      : "Use the desk trigger and invalidation as the only execution reference.";
  const invalidationText =
    entry.liveDecision.invalidationLevel != null
      ? `Invalidation ${entry.liveDecision.invalidationLevel.toFixed(
          Math.abs(entry.liveDecision.invalidationLevel) >= 10 ? 2 : 4,
        )}.`
      : "Do not widen invalidation if the market drifts.";
  const nextStep =
    entry.liveDecision.nextDisciplineStep?.trim() ??
    entry.contextSummary.priorityReason?.trim() ??
    action.summary;

  if (
    (entry.currentState === "TRADE_VALID" || entry.currentState === "TRADE_ACTIVE") &&
    entry.executionStatus === "allowed"
  ) {
    return {
      headline: "Rest-of-day operating plan",
      summary: "The setup is actionable. Stay disciplined, execute only on trigger, and manage the rest of the session with rules.",
      steps: [
        {
          slot: "now",
          title: "Now",
          body: `${nextStep} ${triggerText}`,
          tone: "good",
        },
        {
          slot: "next",
          title: "After entry",
          body: `If the trigger trades, execute at planned risk only and respect the original structure. ${invalidationText}`,
          tone: "good",
        },
        {
          slot: "if_not",
          title: "If it does not trigger",
          body: "Do not force a fill. If price runs without the plan, or clarity degrades, stand aside and keep capital protected.",
          tone: "warn",
        },
        {
          slot: "close",
          title: "Before session close",
          body: `Review the live feed, note whether the trigger happened during ${sessionLabel}, and close the loop in journal/review instead of chasing a late setup.`,
          tone: "neutral",
        },
      ],
    };
  }

  if (action.intent === "prepare_now") {
    return {
      headline: "Rest-of-day operating plan",
      summary: "The setup is close, but it has not earned full execution yet. The goal is preparation without forcing the trade.",
      steps: [
        {
          slot: "now",
          title: "Now",
          body: `${nextStep} Build the order idea now so the decision is easy if the trigger confirms.`,
          tone: "good",
        },
        {
          slot: "next",
          title: "Next check",
          body: `Come back on the next live push or when the trigger/invalidation tighten up during ${sessionLabel}.`,
          tone: "neutral",
        },
        {
          slot: "if_not",
          title: "If it stays half-formed",
          body: "Keep it in preparation mode only. No trade if the structure remains ambiguous, late, or caution-heavy.",
          tone: "warn",
        },
        {
          slot: "close",
          title: "If the session ends first",
          body: "Archive it as missed or unfinished, then wait for a fresh session instead of carrying weak conviction into later hours.",
          tone: "neutral",
        },
      ],
    };
  }

  if (action.intent === "monitor_now") {
    return {
      headline: "Rest-of-day operating plan",
      summary: "The market deserves attention, but there is still no clean trade. The job is monitoring, not forcing activity.",
      steps: [
        {
          slot: "now",
          title: "Now",
          body: nextStep,
          tone: "neutral",
        },
        {
          slot: "next",
          title: "Next check",
          body: `Watch for a cleaner trigger, better clarity, or a stronger reclaim during ${sessionLabel}.`,
          tone: "neutral",
        },
        {
          slot: "if_not",
          title: "If nothing improves",
          body: "Do nothing. A quiet market is not a problem; forcing a trade is.",
          tone: "warn",
        },
        {
          slot: "close",
          title: "End of day",
          body: "Use the remaining time to scan the queue and radar, then come back only when the setup graduates out of watch mode.",
          tone: "neutral",
        },
      ],
    };
  }

  if (action.intent === "stand_aside") {
    return {
      headline: "Rest-of-day operating plan",
      summary: "This is a capital-protection state. The right move is to avoid damage and wait for better structure elsewhere.",
      steps: [
        {
          slot: "now",
          title: "Now",
          body: nextStep,
          tone: "warn",
        },
        {
          slot: "next",
          title: "Next move",
          body: "Rotate attention to execution-now or near-ready markets instead of trying to rescue this one.",
          tone: "neutral",
        },
        {
          slot: "if_not",
          title: "If conditions remain bad",
          body: "Keep standing aside. Restricted, late, or blocked markets do not deserve emotional re-entry.",
          tone: "warn",
        },
        {
          slot: "close",
          title: "Session close",
          body: "Mark it as protected capital and finish the day without trying to manufacture a trade out of a bad context.",
          tone: "neutral",
        },
      ],
    };
  }

  return {
    headline: "Rest-of-day operating plan",
    summary: "There is no live action in this session window. Use the day deliberately instead of staring at a dead screen.",
    steps: [
      {
        slot: "now",
        title: "Now",
        body: nextStep,
        tone: "neutral",
      },
      {
        slot: "next",
        title: "Next useful check",
        body: `Return when ${sessionLabel} becomes active again or when a new alert upgrades the market out of radar.`,
        tone: "neutral",
      },
      {
        slot: "if_not",
        title: "If the market stays inactive",
        body: "Do not invent a trade. Keep the day focused on better candidates and review quality instead.",
        tone: "warn",
      },
      {
        slot: "close",
        title: "End of day",
        body: "Review the strongest opportunities, note what never became executable, and reset cleanly for the next session.",
        tone: "neutral",
      },
    ],
  };
}

export function resolveTradingAlertGuidance(entry: TradingWatchlistEntry): TradingAlertGuidance {
  const action = resolveTradingActionGuidance(entry);
  const sessionLabel = entry.contextSummary.sessionLabel;
  const marketOpen = entry.contextSummary.marketOpen;
  const windowState = entry.workspace.setupCore.opportunityWindow.state;
  const setupType = entry.workspace.setupCore.setup.type;

  if (!marketOpen) {
    return {
      badge: "Session closed",
      headline: "No live alert pressure right now.",
      recheckWindow: `Re-check when ${sessionLabel} opens again or if another live market takes priority first.`,
      nextAlertCondition: "The next alert should fire only when the market comes back into an active session window.",
      tone: "neutral",
    };
  }

  if (
    (entry.currentState === "TRADE_VALID" || entry.currentState === "TRADE_ACTIVE") &&
    entry.executionStatus === "allowed"
  ) {
    return {
      badge: "High priority",
      headline: "Stay close to the feed. This setup is actionable now.",
      recheckWindow:
        "Re-check immediately on the next live push, trigger touch, invalidation pressure, or target progress.",
      nextAlertCondition:
        "The next alert should fire when the trade triggers, the structure weakens, or the market starts paying into the plan.",
      tone: "good",
    };
  }

  if (action.intent === "prepare_now") {
    return {
      badge: "Near-ready",
      headline: "This deserves focused attention, but not forced execution yet.",
      recheckWindow:
        windowState === "opening"
          ? "Re-check on the next 15m close or on the next meaningful live feed change."
          : "Re-check within 10-15 minutes, or earlier if the live feed upgrades the setup.",
      nextAlertCondition:
        "The next alert should fire when execution turns allowed, or when the setup degrades enough to stand aside.",
      tone: "good",
    };
  }

  if (action.intent === "monitor_now") {
    return {
      badge: "Monitor",
      headline: "Monitor the market, but let the setup earn more clarity first.",
      recheckWindow:
        setupType !== "none"
          ? "Re-check in 15-30 minutes or at the next session shift if structure keeps building."
          : "Re-check later in the session only if a cleaner setup appears or the queue thins out.",
      nextAlertCondition:
        "The next alert should fire when the setup upgrades into prepare-now quality or gets invalidated completely.",
      tone: "neutral",
    };
  }

  if (action.intent === "stand_aside") {
    return {
      badge: "Protection",
      headline: "Capital protection is the right alert state here.",
      recheckWindow:
        "Do not babysit this market. Re-check only if the restriction clears or a new session resets the context.",
      nextAlertCondition:
        "The next alert should fire only if the market becomes structurally tradable again.",
      tone: "warn",
    };
  }

  return {
    badge: "Low urgency",
    headline: "No live opportunity pressure in this market right now.",
    recheckWindow:
      "Re-check at the next active session window, or when the radar promotes this market into watchlist or queue.",
    nextAlertCondition:
      "The next alert should fire only when the market stops being passive and starts demanding attention.",
    tone: "neutral",
  };
}

function isFocusAligned(
  entry: TradingWatchlistEntry,
  focusSessionLabel: string | null,
) {
  return (
    Boolean(focusSessionLabel) &&
    entry.contextSummary.marketOpen &&
    entry.contextSummary.sessionLabel === focusSessionLabel
  );
}

export function resolveTradingWatchlistSectionKey(
  entry: Pick<TradingWatchlistEntry, "currentState" | "executionStatus">,
): TradingWatchlistSectionKey {
  const contextualEntry = entry as TradingWatchlistEntry;
  const contextText = [
    contextualEntry.contextSummary?.contextLabel ?? "",
    contextualEntry.contextSummary?.priorityReason ?? "",
  ]
    .join(" ")
    .toLowerCase();

  if (isTradingClosedOrRestricted(entry)) {
    return "closed";
  }

  if (
    entry.currentState === "TRADE_VALID" ||
    entry.currentState === "TRADE_ACTIVE" ||
    isTradingNearReadyOpportunity(contextualEntry)
  ) {
    return "look_first";
  }

  if (
    entry.currentState === "SETUP_FORMING" ||
    entry.currentState === "SESSION_OPEN" ||
    (entry.currentState === "WAIT" &&
      (contextText.includes("forming") || contextText.includes("building")))
  ) {
    return "forming";
  }

  return "waiting";
}

export function createTradingWatchlistEntry(input: {
  liveDecision: TradingLiveDecision;
  chart: TradingChartSnapshot | null;
  workspace: TradingWorkspaceSnapshot;
  fallbackInstrument?: string | null;
}): TradingWatchlistEntry {
  const instrument =
    String(
      input.liveDecision.instrument ??
        input.chart?.instrument ??
        input.fallbackInstrument ??
        "TRADING",
    )
      .trim() || "TRADING";

  return {
    instrument,
    currentState: input.liveDecision.currentState,
    currentHeadline: input.liveDecision.currentHeadline,
    executionStatus: input.liveDecision.executionStatus,
    contextSummary: input.workspace.contextSummary,
    liveDecision: input.liveDecision,
    chart: input.chart,
    workspace: input.workspace,
    watchlistPlacement: null,
  };
}

export function composeTradingWatchlistEntry(
  input: ComposeTradingLiveDecisionInput,
): TradingWatchlistEntry {
  const composed = composeTradingLiveDecision(input);
  const chart = composeTradingChartSnapshot(input.snapshot);
  const workspace = composeTradingWorkspaceSnapshot({
    input,
    liveDecision: composed.liveDecision,
    memory: composed.memory,
  });

  return createTradingWatchlistEntry({
    liveDecision: composed.liveDecision,
    chart,
    workspace,
    fallbackInstrument: input.market.instrument,
  });
}

export function sortTradingWatchlist(entries: TradingWatchlistEntry[]): TradingWatchlistEntry[] {
  const baseSorted = sortTradingWatchlistWithFocus(entries, null);
  const focus = resolveTradingWatchlistFocus(baseSorted);

  return sortTradingWatchlistWithFocus(baseSorted, focus?.sessionLabel ?? null);
}

function sortTradingWatchlistWithFocus(
  entries: TradingWatchlistEntry[],
  focusSessionLabel: string | null,
): TradingWatchlistEntry[] {
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((left, right) => {
      const leftSection = resolveTradingWatchlistSectionKey(left.entry);
      const rightSection = resolveTradingWatchlistSectionKey(right.entry);
      const sectionOrder: Record<TradingWatchlistSectionKey, number> = {
        look_first: 0,
        forming: 1,
        waiting: 2,
        closed: 3,
      };
      const sectionDelta = sectionOrder[leftSection] - sectionOrder[rightSection];

      if (sectionDelta !== 0) {
        return sectionDelta;
      }

      const priorityDelta =
        tradingWatchlistPriority(left.entry.currentState) -
        tradingWatchlistPriority(right.entry.currentState);

      if (priorityDelta !== 0) {
        return priorityDelta;
      }

      const marketOpenDelta =
        Number(right.entry.contextSummary.marketOpen) - Number(left.entry.contextSummary.marketOpen);

      if (marketOpenDelta !== 0) {
        return marketOpenDelta;
      }

      const focusDelta =
        Number(isFocusAligned(right.entry, focusSessionLabel)) -
        Number(isFocusAligned(left.entry, focusSessionLabel));

      if (focusDelta !== 0) {
        return focusDelta;
      }

      const coverageDelta =
        tradingCoveragePriority(left.entry) - tradingCoveragePriority(right.entry);

      if (coverageDelta !== 0) {
        return coverageDelta;
      }

      const utilityDelta =
        computeTradingOpportunityUtilityScore(right.entry) -
        computeTradingOpportunityUtilityScore(left.entry);

      if (utilityDelta !== 0) {
        return utilityDelta;
      }

      const executionDelta =
        tradingExecutionPriority(left.entry.executionStatus) -
        tradingExecutionPriority(right.entry.executionStatus);

      if (executionDelta !== 0) {
        return executionDelta;
      }

      const sessionDelta =
        tradingSessionPriority(left.entry.contextSummary.sessionLabel) -
        tradingSessionPriority(right.entry.contextSummary.sessionLabel);

      if (sessionDelta !== 0) {
        return sessionDelta;
      }

      return left.index - right.index;
    })
    .map(({ entry }) => entry);
}

export function resolveTradingWatchlistFocus(
  entries: TradingWatchlistEntry[],
): TradingWatchlistFocus | null {
  const anchor =
    entries.find(
      (entry) =>
        entry.contextSummary.marketOpen &&
        entry.executionStatus !== "restricted" &&
        entry.currentState !== "MARKET_CLOSED" &&
        entry.currentState !== "SESSION_END",
    ) ??
    entries[0] ??
    null;

  if (!anchor) {
    return null;
  }

  const sectionKey = resolveTradingWatchlistSectionKey(anchor);

  return {
    anchorInstrument: anchor.instrument,
    sessionLabel: anchor.contextSummary.sessionLabel,
    marketOpen: anchor.contextSummary.marketOpen,
    contextLabel: anchor.contextSummary.contextLabel,
    priorityReason: anchor.contextSummary.priorityReason ?? null,
    coverageStatus: anchor.contextSummary.coverageStatus,
    coverageLabel: anchor.contextSummary.coverageLabel,
    sectionKey,
    sectionTitle: TRADING_WATCHLIST_SECTION_META[sectionKey].title,
  };
}

export function summarizeTradingWatchlistCoverage(
  entries: TradingWatchlistEntry[],
): TradingWatchlistCoverageSummary {
  return entries.reduce<TradingWatchlistCoverageSummary>(
    (summary, entry) => {
      if (entry.contextSummary.coverageStatus === "coverage_backed") {
        summary.coverageBackedCount += 1;
      } else if (entry.contextSummary.coverageStatus === "staged_only") {
        summary.stagedOnlyCount += 1;
      } else {
        summary.liveOnlyCount += 1;
      }

      return summary;
    },
    {
      coverageBackedCount: 0,
      stagedOnlyCount: 0,
      liveOnlyCount: 0,
    },
  );
}

function collectSectionSessionLabels(entries: TradingWatchlistEntry[]): string[] {
  const seen = new Set<string>();
  const ordered = [...entries].sort(
    (left, right) =>
      tradingSessionPriority(left.contextSummary.sessionLabel) -
      tradingSessionPriority(right.contextSummary.sessionLabel),
  );

  for (const entry of ordered) {
    const label = entry.contextSummary.sessionLabel;

    if (!seen.has(label)) {
      seen.add(label);
    }
  }

  return Array.from(seen);
}

function buildSectionDescription(
  key: TradingWatchlistSectionKey,
  entries: TradingWatchlistEntry[],
  sessionLabels: string[],
  marketOpenCount: number,
  focus: TradingWatchlistFocus | null,
): string {
  const sessionText =
    sessionLabels.length > 0 ? ` ${sessionLabels.join(" / ")}.` : "";
  const focusText =
    focus?.marketOpen && sessionLabels.includes(focus.sessionLabel)
      ? ` Focus session: ${focus.sessionLabel}.`
      : "";

  if (key === "look_first") {
    return `Highest session priority right now.${sessionText}${focusText}`;
  }

  if (key === "forming") {
    return `Building, but not ready to act yet.${sessionText}${focusText}`;
  }

  if (key === "waiting") {
    return `Monitor without forcing entries.${sessionText}${focusText}`;
  }

  return `Ignore for now. Closed session or restricted execution.${sessionText}`;
}

function buildSectionPriorityHint(
  key: TradingWatchlistSectionKey,
  entries: TradingWatchlistEntry[],
  focus: TradingWatchlistFocus | null,
): string | null {
  if (focus && key === "look_first") {
    const reason = focus.priorityReason?.trim();
    return reason ? `${focus.sessionLabel} focus - ${reason}` : `${focus.sessionLabel} focus`;
  }

  const firstReason =
    entries.find((entry) => entry.contextSummary.priorityReason?.trim())?.contextSummary
      .priorityReason ?? null;

  if (firstReason) {
    return firstReason;
  }

  if (key === "look_first") {
    return "Highest live focus in the current session.";
  }

  if (key === "forming") {
    return "Setup is building, but the entry is not clean yet.";
  }

  if (key === "waiting") {
    return "No clean edge right now.";
  }

  return "Closed market or operational restriction.";
}

export function composeTradingWatchlistSections(
  entries: TradingWatchlistEntry[],
  focus?: TradingWatchlistFocus | null,
): TradingWatchlistSection[] {
  const resolvedFocus =
    focus === undefined ? resolveTradingWatchlistFocus(sortTradingWatchlist(entries)) : focus;
  const sections = new Map<TradingWatchlistSectionKey, TradingWatchlistEntry[]>();

  for (const entry of entries) {
    const key = resolveTradingWatchlistSectionKey(entry);
    const current = sections.get(key) ?? [];
    current.push(entry);
    sections.set(key, current);
  }

  return (["look_first", "forming", "waiting", "closed"] as TradingWatchlistSectionKey[])
    .flatMap((key) => {
      const sectionEntries = sections.get(key) ?? [];

      if (sectionEntries.length === 0) {
        return [];
      }

      const sectionEntriesWithPlacement = sectionEntries.map((entry, index) => ({
        ...entry,
        watchlistPlacement: {
          sectionKey: key,
          sectionTitle: TRADING_WATCHLIST_SECTION_META[key].title,
          sectionDescription: TRADING_WATCHLIST_SECTION_META[key].description,
          rankInSection: index,
          isLeadEntry: index === 0,
          isSessionFocus: resolvedFocus?.anchorInstrument === entry.instrument,
        },
      }));

      const sessionLabels = collectSectionSessionLabels(sectionEntriesWithPlacement);
      const marketOpenCount = sectionEntriesWithPlacement.filter(
        (entry) => entry.contextSummary.marketOpen,
      ).length;

      return [
        {
          key,
          title: TRADING_WATCHLIST_SECTION_META[key].title,
          description: buildSectionDescription(
            key,
            sectionEntriesWithPlacement,
            sessionLabels,
            marketOpenCount,
            resolvedFocus ?? null,
          ),
          sessionLabels,
          marketOpenCount,
          priorityHint: buildSectionPriorityHint(
            key,
            sectionEntriesWithPlacement,
            resolvedFocus ?? null,
          ),
          entries: sectionEntriesWithPlacement,
        },
      ];
    });
}

export function composeTradingWatchlist(
  inputs: ComposeTradingLiveDecisionInput[],
): TradingWatchlistEntry[] {
  const entries: TradingWatchlistEntry[] = [];
  const seen = new Set<string>();

  for (const input of inputs) {
    const entry = composeTradingWatchlistEntry(input);

    if (seen.has(entry.instrument)) {
      continue;
    }

    seen.add(entry.instrument);
    entries.push(entry);
  }

  return sortTradingWatchlist(entries);
}
