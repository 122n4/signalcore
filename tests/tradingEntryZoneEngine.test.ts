import { describe, expect, it } from "vitest";

import { buildEntryZone } from "@/lib/trading/execution";

import { createExecutionInput } from "./helpers/tradingOperationalFixtures";

describe("trading entry zone engine", () => {
  it("builds a breakout entry zone around the trigger", () => {
    const input = createExecutionInput();
    input.setupCore.setup = {
      type: "breakout_continuation",
      direction: "long",
      triggerLevel: 103.9,
      invalidationLevel: 102.6,
      confidence: 84,
    };

    const result = buildEntryZone(input);

    expect(result.triggerType).toBe("break");
    expect(result.triggerLevel).toBe(103.9);
    expect(result.entryZoneLow).toBe(103.9);
    expect(result.entryZoneHigh).toBeGreaterThan(103.9);
  });

  it("builds a reclaim entry zone for reclaim-style setups", () => {
    const input = createExecutionInput();
    input.setupCore.setup = {
      type: "range_reclaim",
      direction: "short",
      triggerLevel: 101.8,
      invalidationLevel: 103.1,
      confidence: 72,
    };

    const result = buildEntryZone(input);

    expect(result.triggerType).toBe("reclaim");
    expect(result.entryZoneLow).toBeLessThanOrEqual(result.entryZoneHigh ?? 0);
  });
});
