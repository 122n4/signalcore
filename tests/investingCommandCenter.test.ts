import { describe, expect, it } from "vitest";

import { buildInvestingCommandModel } from "@/lib/investing/ui/commandCenter";

describe("Investing command center", () => {
  it.each([
    [{ hasPlan: false, hasHoldings: false, doneToday: false }, "setup", "planning"],
    [{ hasPlan: true, hasHoldings: false, doneToday: false }, "build", "portfolio"],
    [{ hasPlan: true, hasHoldings: true, doneToday: false }, "act", "daily"],
    [{ hasPlan: true, hasHoldings: true, doneToday: true }, "review", "advisor"],
  ])("maps the verified state to one next action", (input, state, tab) => {
    const result = buildInvestingCommandModel(input);
    expect(result.state).toBe(state);
    expect(result.actionHref).toContain(`tab=${tab}`);
    expect(result.reason.length).toBeGreaterThan(40);
  });
});
