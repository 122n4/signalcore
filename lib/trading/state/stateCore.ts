import { buildFeedMessage } from "./feedMessage";
import { appendSessionFeedEvent, buildTradingFeedEventDraft, createSessionFeedMemory, resolveSessionFeedId } from "./sessionMemory";
import { resolveStateTransition } from "./stateTransition";
import type { SessionFeedMemory, StateFeedInput, StateFeedOutput } from "./types";

function isSameTradingDay(left: string, right: string): boolean {
  return left.slice(0, 10) === right.slice(0, 10);
}

function shouldReuseMemory(memory: SessionFeedMemory | null | undefined, input: StateFeedInput): boolean {
  if (!memory) {
    return false;
  }

  if (memory.instrument !== input.market.instrument) {
    return false;
  }

  if (!isSameTradingDay(memory.startedAt, input.snapshot.snapshotAt)) {
    return false;
  }

  if (!input.market.session.marketOpen) {
    return true;
  }

  return (
    memory.sessionId ===
    resolveSessionFeedId(
      input.market.instrument,
      input.snapshot.snapshotAt,
      input.market.session.session,
    )
  );
}

function emitStateEvent(
  memory: SessionFeedMemory,
  input: StateFeedInput,
  previousState: "MARKET_CLOSED" | "SESSION_OPEN" | "WAIT" | "SETUP_FORMING" | "TRADE_VALID" | "TRADE_ACTIVE" | "BLOCKED" | "TOO_LATE" | "EXIT" | "SESSION_END",
) {
  const transitionInput = {
    ...input,
    previousState,
  };
  const transition = resolveStateTransition(transitionInput);
  const message = buildFeedMessage({
    ...transitionInput,
    transition,
  });
  const eventDraft = buildTradingFeedEventDraft(transitionInput, transition, message);
  const appendResult = appendSessionFeedEvent(memory, eventDraft);

  return {
    transition,
    message,
    appendResult,
  };
}

export function processStateFeed(input: StateFeedInput): StateFeedOutput {
  const canReuseMemory = shouldReuseMemory(input.memory, input);
  const hasHistory = canReuseMemory && (input.memory?.events.length ?? 0) > 0;
  let memory = canReuseMemory
    ? input.memory!
    : createSessionFeedMemory({
        instrument: input.market.instrument,
        startedAt: input.snapshot.snapshotAt,
        session: input.market.session.session,
      });

  if (
    !hasHistory &&
    input.market.session.marketOpen &&
    input.decisionCore.decision.currentState !== "MARKET_CLOSED"
  ) {
    const bootstrap = emitStateEvent(memory, input, "MARKET_CLOSED");
    memory = bootstrap.appendResult.memory;
  }

  const previousState = memory.events[memory.events.length - 1]?.state ?? "MARKET_CLOSED";
  const { transition, message, appendResult } = emitStateEvent(memory, input, previousState);

  return {
    transition,
    message,
    memory: appendResult.memory,
    appended: appendResult.appended,
    event: appendResult.event,
  };
}
