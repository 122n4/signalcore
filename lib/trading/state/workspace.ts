import { resolveTradingPlaybookRules } from "@/lib/trading/playbook";
import { composeTradingContextSummary } from "./contextSummary";
import { composeTradingWhySummary } from "./whySummary";

import type {
  ComposeTradingLiveDecisionInput,
  SessionFeedMemory,
  TradingLiveDecision,
  TradingPerformanceSnapshot,
  TradingWorkspaceSnapshot,
} from "./types";

function buildPerformanceSnapshot(memory: SessionFeedMemory): TradingPerformanceSnapshot {
  const stateCounts: TradingPerformanceSnapshot["stateCounts"] = {};

  for (const event of memory.events) {
    stateCounts[event.state] = (stateCounts[event.state] ?? 0) + 1;
  }

  const latestEvent = memory.events.at(-1) ?? null;

  return {
    sessionId: memory.sessionId,
    instrument: memory.instrument,
    startedAt: memory.startedAt,
    latestTimestamp: latestEvent?.timestamp ?? null,
    latestHeadline: latestEvent?.headline ?? null,
    latestState: latestEvent?.state ?? null,
    eventCount: memory.events.length,
    stateCounts,
  };
}

export function composeTradingWorkspaceSnapshot(args: {
  input: ComposeTradingLiveDecisionInput;
  liveDecision: TradingLiveDecision;
  memory: SessionFeedMemory;
}): TradingWorkspaceSnapshot {
  const { input, liveDecision, memory } = args;
  const activeRules = input.playbook
    ? resolveTradingPlaybookRules(input.playbook, input.market.session.session)
    : null;
  const contextSummary = composeTradingContextSummary({ input, liveDecision });
  const whySummary = composeTradingWhySummary({
    input,
    liveDecision,
    contextSummary,
  });

  return {
    instrument: liveDecision.instrument ?? input.market.instrument,
    contextSummary,
    whySummary,
    market: input.market,
    setupCore: input.setupCore,
    decisionCore: input.decisionCore,
    playbook: {
      definition: input.playbook
        ? {
            id: input.playbook.id,
            name: input.playbook.name,
          }
        : null,
      activeRules,
      check: input.playbookCheck ?? null,
      behaviorGuard: input.behaviorGuard ?? null,
    },
    execution: input.executionPlan,
    performance: buildPerformanceSnapshot(memory),
  };
}
