import { createExecutionPlan } from "@/lib/trading/execution";
import type { ComposeTradingLiveDecisionInput } from "@/lib/trading/state";

import { createExecutionInput } from "./tradingOperationalFixtures";

type TradingLiveDecisionFixtureOptions = Parameters<typeof createExecutionInput>[0];

export function createTradingLiveDecisionInput(
  options: TradingLiveDecisionFixtureOptions = {},
): ComposeTradingLiveDecisionInput {
  const executionInput = createExecutionInput(options);

  return {
    snapshot: executionInput.snapshot,
    market: executionInput.market,
    setupCore: executionInput.setupCore,
    decisionCore: executionInput.decisionCore,
    playbook: executionInput.playbook,
    playbookCheck: executionInput.playbookCheck,
    behaviorGuard: executionInput.behaviorGuard,
    executionPlan: createExecutionPlan(executionInput),
    memory: null,
  };
}
