import { computeTradingOpportunityUtilityScore, resolveTradingActionGuidance, resolveTradingAlertGuidance } from "@/lib/trading/state/watchlist";
import type { TradingWatchlistEntry } from "@/lib/trading/state/types";

export type TradingNotificationKind =
  | "execute_now"
  | "prepare_now"
  | "stand_aside"
  | "session_recheck";

export type TradingNotificationSeverity = "high" | "medium" | "low";

export type TradingNotificationEvent = {
  id: string;
  instrument: string;
  kind: TradingNotificationKind;
  severity: TradingNotificationSeverity;
  title: string;
  body: string;
  sessionLabel: string;
  actionLabel: string;
  browserEligible: boolean;
  requiresProDelivery: boolean;
  utilityScore: number;
};

function severityRank(value: TradingNotificationSeverity) {
  if (value === "high") return 0;
  if (value === "medium") return 1;
  return 2;
}

function kindForEntry(entry: TradingWatchlistEntry): TradingNotificationKind {
  const action = resolveTradingActionGuidance(entry);
  if (action.intent === "execute_now") return "execute_now";
  if (action.intent === "prepare_now") return "prepare_now";
  if (action.intent === "stand_aside") return "stand_aside";
  return "session_recheck";
}

function severityForEntry(entry: TradingWatchlistEntry): TradingNotificationSeverity {
  const kind = kindForEntry(entry);
  if (kind === "execute_now") return "high";
  if (kind === "prepare_now") return "medium";
  return "low";
}

function titleForEntry(entry: TradingWatchlistEntry): string {
  const action = resolveTradingActionGuidance(entry);
  if (action.intent === "execute_now") {
    const direction = entry.liveDecision.direction === "short" ? "Sell" : "Buy";
    return `${entry.instrument}: ${direction} setup validated`;
  }
  if (action.intent === "prepare_now") {
    return `${entry.instrument}: prepare the setup now`;
  }
  if (action.intent === "stand_aside") {
    return `${entry.instrument}: stand aside`;
  }
  return `${entry.instrument}: re-check later`;
}

function bodyForEntry(entry: TradingWatchlistEntry): string {
  const action = resolveTradingActionGuidance(entry);
  const alert = resolveTradingAlertGuidance(entry);
  if (action.intent === "execute_now") {
    return `${action.headline} ${entry.liveDecision.nextDisciplineStep ?? alert.nextAlertCondition}`;
  }
  if (action.intent === "prepare_now") {
    return `${action.summary} ${alert.recheckWindow}`;
  }
  if (action.intent === "stand_aside") {
    return `${action.summary} ${alert.nextAlertCondition}`;
  }
  return `${action.summary} ${alert.recheckWindow}`;
}

export function deriveTradingNotificationEvents(
  entries: TradingWatchlistEntry[],
): TradingNotificationEvent[] {
  return [...entries]
    .map((entry) => {
      const action = resolveTradingActionGuidance(entry);
      const kind = kindForEntry(entry);
      const severity = severityForEntry(entry);
      const utilityScore = computeTradingOpportunityUtilityScore(entry);

      return {
        id: [
          entry.instrument,
          entry.currentState,
          entry.executionStatus,
          entry.liveDecision.triggerLevel ?? "na",
          entry.liveDecision.invalidationLevel ?? "na",
        ].join(":"),
        instrument: entry.instrument,
        kind,
        severity,
        title: titleForEntry(entry),
        body: bodyForEntry(entry),
        sessionLabel: entry.contextSummary.sessionLabel,
        actionLabel: action.label,
        browserEligible: kind === "execute_now" || kind === "prepare_now",
        requiresProDelivery: true,
        utilityScore,
      } satisfies TradingNotificationEvent;
    })
    .filter((event) => event.kind !== "session_recheck" || event.utilityScore >= 65)
    .sort((left, right) => {
      const severityDelta = severityRank(left.severity) - severityRank(right.severity);
      if (severityDelta !== 0) return severityDelta;
      return right.utilityScore - left.utilityScore;
    });
}

export function deriveTradingFollowUpEvents(
  entries: TradingWatchlistEntry[],
  followedInstruments: string[],
): TradingNotificationEvent[] {
  const followed = new Set(followedInstruments.map((instrument) => instrument.toUpperCase()));

  return entries
    .filter((entry) => followed.has(entry.instrument.toUpperCase()))
    .map((entry) => {
      const action = resolveTradingActionGuidance(entry);
      const alert = resolveTradingAlertGuidance(entry);
      const utilityScore = computeTradingOpportunityUtilityScore(entry);
      const needsCloseReview =
        entry.currentState === "EXIT" ||
        entry.currentState === "TOO_LATE" ||
        entry.currentState === "BLOCKED" ||
        entry.executionStatus === "restricted";
      const kind: TradingNotificationKind = needsCloseReview
        ? "stand_aside"
        : action.intent === "execute_now"
          ? "execute_now"
          : action.intent === "prepare_now"
            ? "prepare_now"
            : "session_recheck";
      const severity: TradingNotificationSeverity =
        kind === "execute_now" ? "high" : needsCloseReview || kind === "prepare_now" ? "medium" : "low";
      const actionLabel = needsCloseReview
        ? "Review close"
        : kind === "session_recheck"
          ? "Hold / re-check"
          : action.label;
      const title = needsCloseReview
        ? `${entry.instrument}: close or stand-aside review`
        : `${entry.instrument}: followed trade update`;
      const body = needsCloseReview
        ? `${action.summary} ${alert.nextAlertCondition}`
        : `${action.summary} ${entry.liveDecision.nextDisciplineStep ?? alert.recheckWindow}`;

      return {
        id: [
          "follow",
          entry.instrument,
          entry.currentState,
          entry.executionStatus,
          entry.liveDecision.triggerLevel ?? "na",
          entry.liveDecision.invalidationLevel ?? "na",
        ].join(":"),
        instrument: entry.instrument,
        kind,
        severity,
        title,
        body,
        sessionLabel: entry.contextSummary.sessionLabel,
        actionLabel,
        browserEligible: true,
        requiresProDelivery: true,
        utilityScore,
      } satisfies TradingNotificationEvent;
    })
    .sort((left, right) => {
      const severityDelta = severityRank(left.severity) - severityRank(right.severity);
      if (severityDelta !== 0) return severityDelta;
      return right.utilityScore - left.utilityScore;
    });
}

export function deriveTradingNotificationPreview(
  events: TradingNotificationEvent[],
  limit = 1,
) {
  return events.slice(0, Math.max(0, limit));
}
