import { describe, expect, it } from "vitest";

import { composeTradingWatchlistEntry } from "@/lib/trading/state";

import { createTradingLiveDecisionInput } from "./helpers/tradingLiveDecisionFixtures";

describe("trading workspace snapshot", () => {
  it("attaches market, setup, decision, playbook, execution, and performance blocks per asset", () => {
    const input = createTradingLiveDecisionInput();
    input.snapshot.instrument = "EURUSD";
    input.market.instrument = "EURUSD";
    input.decisionCore.decision.currentState = "TRADE_VALID";

    const entry = composeTradingWatchlistEntry(input);

    expect(entry.workspace.instrument).toBe("EURUSD");
    expect(entry.workspace.market.structure.state).toBe(input.market.structure.state);
    expect(entry.workspace.setupCore.setup.type).toBe(input.setupCore.setup.type);
    expect(entry.workspace.decisionCore.decision.currentState).toBe("TRADE_VALID");
    expect(entry.workspace.playbook.definition?.name).toBe("Core Trading Playbook");
    expect(entry.workspace.playbook.check?.executionAllowed).toBe(true);
    expect(entry.workspace.execution.executionStatus.executionStatus).toBe(
      entry.liveDecision.executionStatus,
    );
    expect(entry.workspace.performance.eventCount).toBe(entry.liveDecision.feed.length);
    expect(entry.workspace.whySummary.whyNow).toBe("Setup aligned");
    expect(entry.workspace.whySummary.whyNotNow).toBeNull();
  });
});
