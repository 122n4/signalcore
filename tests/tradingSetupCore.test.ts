import { describe, expect, it } from "vitest";

import { createSetupCore } from "@/lib/trading/setups";

import { createSetupInput } from "./helpers/tradingSetupFixtures";

describe("trading setup core orchestrator", () => {
  it("chains detection, maturity, opportunity window and quality into one output", () => {
    const input = createSetupInput({
      marketOverrides: {
        structure: { state: "breakout_structure", direction: "long", score: 82, confidence: 82 },
        regime: { state: "trending", score: 76, confidence: 74 },
        momentum: { state: "accelerating", direction: "long", score: 80, confidence: 78 },
        liquidity: { state: "healthy_participation", score: 70, confidence: 68 },
      },
    });

    const result = createSetupCore(input);

    expect(result.setup.type).toBe("breakout_continuation");
    expect(result.maturity.state).toMatch(/forming|developing|ready|late/);
    expect(result.opportunityWindow.state).toMatch(/forming|opening|active|degrading|closed/);
    expect(result.quality.grade).toMatch(/[A-D]/);
  });
});
