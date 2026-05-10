import type { TradingOperationalInput } from "@/lib/trading/playbook";
import {
  createClearBehaviorSnapshot,
  createDefaultTradingPlaybook,
  runBehaviorGuard,
  runPlaybookCheck,
  type TradingBehaviorSnapshot,
  type TradingPlaybook,
} from "@/lib/trading/playbook";
import type { DecisionCoreOutput } from "@/lib/trading/decision";
import type { MarketReadingOutput } from "@/lib/trading/market";
import type { SetupCoreOutput } from "@/lib/trading/setups";

import { createDecisionInput } from "./tradingDecisionFixtures";

type CreateOperationalInputOptions = {
  snapshotOverrides?: Parameters<typeof createDecisionInput>[0]["snapshotOverrides"];
  marketOverrides?: Partial<MarketReadingOutput>;
  decisionCoreOverrides?: Partial<DecisionCoreOutput>;
  setupCoreOverrides?: Partial<SetupCoreOutput>;
  playbookOverrides?: Partial<TradingPlaybook>;
  behaviorOverrides?: Partial<TradingBehaviorSnapshot>;
};

export function createOperationalInput(
  options: CreateOperationalInputOptions = {},
): TradingOperationalInput {
  const decisionBase = createDecisionInput({
    snapshotOverrides: options.snapshotOverrides,
    marketOverrides: options.marketOverrides,
  });
  const defaultSetupCore = {
    setup: {
      type: "breakout_continuation" as const,
      direction: "long" as const,
      triggerLevel: 103.9,
      invalidationLevel: 102.6,
      confidence: 84,
    },
    maturity: {
      state: "ready" as const,
      score: 78,
      confidence: 80,
    },
    opportunityWindow: {
      state: "active" as const,
      score: 82,
      confidence: 84,
    },
    quality: {
      score: 82,
      grade: "A" as const,
      confidence: 84,
    },
  };

  return {
    snapshot: decisionBase.snapshot,
    market: decisionBase.market,
    setupCore: {
      ...defaultSetupCore,
      ...options.setupCoreOverrides,
    },
    decisionCore: {
      clarity: { level: "medium", score: 58, conflictScore: 20, alignment: 68 },
      bias: { direction: "bullish", score: 74, confidence: 76 },
      environment: { state: "favorable", score: 72, confidence: 78 },
      weighting: {
        contextProfile: "trending:normal:ny_open",
        weightedScores: {
          structure: 74,
          momentum: 72,
          liquidity: 66,
          setup: 78,
          maturity: 78,
          opportunityWindow: 82,
          quality: 82,
          clarity: 58,
          bias: 74,
          environment: 72,
          conflictPenalty: 20,
          confluenceBonus: 5,
        },
        confidence: 78,
      },
      decision: {
        currentState: "TRADE_VALID",
        primaryMessage: "Trade valid.",
        secondaryMessage: "Context and timing are aligned.",
        confidence: 80,
        reasons: ["Setup aligned", "Environment favorable"],
      },
      ...options.decisionCoreOverrides,
    },
    playbook: createDefaultTradingPlaybook(options.playbookOverrides),
    behavior: createClearBehaviorSnapshot(options.behaviorOverrides),
  };
}

export function createExecutionInput(options: CreateOperationalInputOptions = {}) {
  const operationalInput = createOperationalInput(options);

  return {
    ...operationalInput,
    playbookCheck: runPlaybookCheck(operationalInput),
    behaviorGuard: runBehaviorGuard(operationalInput),
  };
}
