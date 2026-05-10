import type { DecisionEngineInput } from "@/lib/trading/decision";
import type { MarketReadingOutput } from "@/lib/trading/market";
import type { SetupCoreOutput } from "@/lib/trading/setups";

import { createSetupInput } from "./tradingSetupFixtures";

type CreateDecisionInputOptions = {
  snapshotOverrides?: Parameters<typeof createSetupInput>[0]["snapshotOverrides"];
  marketOverrides?: Partial<MarketReadingOutput>;
  setupCoreOverrides?: Partial<SetupCoreOutput>;
};

export function createBaseSetupCore(
  overrides: Partial<SetupCoreOutput> = {},
): SetupCoreOutput {
  return {
    setup: {
      type: "none",
      direction: "neutral",
      triggerLevel: null,
      invalidationLevel: null,
      confidence: 18,
    },
    maturity: {
      state: "invalid",
      score: 10,
      confidence: 88,
    },
    opportunityWindow: {
      state: "closed",
      score: 10,
      confidence: 90,
    },
    quality: {
      score: 18,
      grade: "D",
      confidence: 82,
    },
    ...overrides,
  };
}

export function createDecisionInput(
  options: CreateDecisionInputOptions = {},
): DecisionEngineInput {
  const base = createSetupInput({
    snapshotOverrides: options.snapshotOverrides,
    marketOverrides: options.marketOverrides,
  });

  return {
    snapshot: base.snapshot,
    market: base.market,
    setupCore: createBaseSetupCore(options.setupCoreOverrides),
  };
}
