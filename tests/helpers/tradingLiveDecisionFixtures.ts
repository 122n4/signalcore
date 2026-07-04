import { createExecutionPlan } from "@/lib/trading/execution";
import type { ComposeTradingLiveDecisionInput } from "@/lib/trading/state";

import { createExecutionInput } from "./tradingOperationalFixtures";

type TradingLiveDecisionFixtureOptions = Parameters<typeof createExecutionInput>[0];

export function createTradingLiveDecisionInput(
  options: TradingLiveDecisionFixtureOptions = {},
): ComposeTradingLiveDecisionInput {
  const executionInput = createExecutionInput(options);

  const liveBaseline = {
    baseline_id: "baseline-test-current",
    engine_hash: "engine-test-hash",
    strategy_id: "baseline-test-current",
    validation_profile: "default_live_safe",
    dataset_profile: "test",
    source: "research_live_baseline" as const,
    valid: true,
    loaded_at: executionInput.snapshot.snapshotAt,
    invalid_reason: null,
  };

  return {
    snapshot: executionInput.snapshot,
    market: executionInput.market,
    setupCore: executionInput.setupCore,
    decisionCore: executionInput.decisionCore,
    playbook: executionInput.playbook,
    playbookCheck: executionInput.playbookCheck,
    behaviorGuard: executionInput.behaviorGuard,
    executionPlan: createExecutionPlan(executionInput),
    liveBaseline,
    signal: {
      signal_id: `sig_test_${executionInput.snapshot.instrument}`,
      source: "trading_scanner",
      origin: "current_live_baseline",
      timestamp: executionInput.snapshot.snapshotAt,
      baseline_id: liveBaseline.baseline_id,
      engine_hash: liveBaseline.engine_hash,
      strategy_id: liveBaseline.strategy_id,
      validation_profile: liveBaseline.validation_profile,
    },
    memory: null,
  };
}
