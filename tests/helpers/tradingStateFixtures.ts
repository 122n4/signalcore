import type { TradingState } from "@/lib/trading/decision";
import { createExecutionPlan } from "@/lib/trading/execution";
import type { StateFeedInput, StateTransitionInput } from "@/lib/trading/state";

import { createExecutionInput } from "./tradingOperationalFixtures";

type TradingExecutionFixtureOptions = Parameters<typeof createExecutionInput>[0];

function buildStateBase(options: TradingExecutionFixtureOptions = {}) {
  const executionInput = createExecutionInput(options);

  return {
    snapshot: executionInput.snapshot,
    market: executionInput.market,
    setupCore: executionInput.setupCore,
    decisionCore: executionInput.decisionCore,
    executionPlan: createExecutionPlan(executionInput),
  };
}

export function createStateTransitionInput(
  previousState: TradingState = "MARKET_CLOSED",
  options: TradingExecutionFixtureOptions = {},
): StateTransitionInput {
  return {
    previousState,
    ...buildStateBase(options),
  };
}

export function createStateFeedInput(
  options: TradingExecutionFixtureOptions = {},
): StateFeedInput {
  return buildStateBase(options);
}
