import type { SessionState } from "@/lib/trading/market";
import type {
  FeedMessageOutput,
  SessionFeedAppendResult,
  SessionFeedMemory,
  StateTransitionInput,
  StateTransitionOutput,
  TradingFeedEvent,
  TradingFeedEventDraft,
} from "./types";

function sessionBucket(session: SessionState): string {
  switch (session) {
    case "pre_market":
      return "pre_market";
    case "london_open":
    case "london_session":
      return "london";
    case "london_ny_overlap":
      return "overlap";
    case "ny_open":
    case "midday_lull":
    case "late_us":
      return "new_york";
    case "asia_flow":
    case "weekend_drift":
      return "asia";
    case "market_closed":
      return "closed";
  }
}

export function resolveSessionFeedId(
  instrument: string,
  snapshotAt: string,
  session: SessionState,
): string {
  return `${instrument}:${snapshotAt.slice(0, 10)}:${sessionBucket(session)}`;
}

export function createSessionFeedMemory(input: {
  instrument: string;
  startedAt: string;
  session: SessionState;
  sessionId?: string;
}): SessionFeedMemory {
  return {
    sessionId:
      input.sessionId ??
      resolveSessionFeedId(input.instrument, input.startedAt, input.session),
    instrument: input.instrument,
    startedAt: input.startedAt,
    events: [],
  };
}

export function buildTradingFeedEventDraft(
  input: StateTransitionInput,
  transition: StateTransitionOutput,
  message: FeedMessageOutput,
): TradingFeedEventDraft {
  return {
    timestamp: input.snapshot.snapshotAt,
    state: transition.nextState,
    headline: message.headline,
    body: message.body,
    clarityScore: input.decisionCore.clarity.score,
    pressureState: null,
    momentumState: input.market.momentum.state,
    setupMaturity: input.setupCore.maturity.score,
    triggerLevel:
      input.executionPlan.entryZone.triggerLevel ??
      input.setupCore.setup.triggerLevel ??
      null,
    invalidationLevel:
      input.executionPlan.invalidation.invalidationLevel ??
      input.setupCore.setup.invalidationLevel ??
      null,
  };
}

function materiallyDifferent(
  previous: TradingFeedEvent,
  next: TradingFeedEventDraft,
): boolean {
  if (previous.state !== next.state) {
    return true;
  }

  if (previous.headline !== next.headline || previous.body !== next.body) {
    return true;
  }

  if (previous.momentumState !== next.momentumState) {
    return true;
  }

  if ((previous.pressureState ?? null) !== (next.pressureState ?? null)) {
    return true;
  }

  if (
    typeof previous.clarityScore === "number" &&
    typeof next.clarityScore === "number" &&
    Math.abs(previous.clarityScore - next.clarityScore) >= 8
  ) {
    return true;
  }

  if (
    typeof previous.setupMaturity === "number" &&
    typeof next.setupMaturity === "number" &&
    Math.abs(previous.setupMaturity - next.setupMaturity) >= 10
  ) {
    return true;
  }

  if ((previous.triggerLevel ?? null) !== (next.triggerLevel ?? null)) {
    return true;
  }

  if ((previous.invalidationLevel ?? null) !== (next.invalidationLevel ?? null)) {
    return true;
  }

  return false;
}

export function appendSessionFeedEvent(
  memory: SessionFeedMemory,
  event: TradingFeedEventDraft,
): SessionFeedAppendResult {
  const previous = memory.events[memory.events.length - 1];

  if (previous && !materiallyDifferent(previous, event)) {
    return {
      memory,
      appended: false,
      event: null,
    };
  }

  const nextEvent: TradingFeedEvent = {
    id: `${memory.sessionId}:${memory.events.length + 1}`,
    ...event,
  };

  return {
    memory: {
      ...memory,
      events: [...memory.events, nextEvent],
    },
    appended: true,
    event: nextEvent,
  };
}
