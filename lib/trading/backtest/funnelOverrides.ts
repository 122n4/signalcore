import {
  createDecisionCore,
  type BiasOutput,
  type ClarityOutput,
  type DecisionEngineInput,
  type DecisionOutput,
  type DecisionWeightingOutput,
  type EnvironmentOutput,
} from "@/lib/trading/decision";
import { clampPercentage as clampDecisionPercentage, setupLabel } from "@/lib/trading/decision/utils";
import {
  assessOpportunityWindow,
  assessSetupMaturity,
  assessSetupQuality,
  createSetupCore,
  detectSetup,
  type OpportunityWindowOutput,
  type SetupCoreOutput,
  type SetupEngineInput,
  type SetupMaturityOutput,
  type SetupOutput,
} from "@/lib/trading/setups";
import {
  BREAKOUT_TRADE_VALID_EDGE_THRESHOLD,
  DEFAULT_TRADE_VALID_EDGE_THRESHOLD,
  isFullyTradeValidCandidate,
} from "@/lib/trading/decision/tradeValidGate";
import {
  clampPercentage as clampSetupPercentage,
  getDirectionalProgress,
  isSetupInvalid,
  mapMaturityStateScore,
  mapWindowStateScore,
  resolveSetupContext,
} from "@/lib/trading/setups/utils";

import type { TradingBacktestFunnelOverrides } from "./types";

const DEFAULT_SETUP_DEVELOPING_PROGRESS_THRESHOLD = 0.58;
const DEFAULT_SETUP_READY_PROGRESS_THRESHOLD = 0.92;
const BREAKOUT_SETUP_DEVELOPING_PROGRESS_THRESHOLD = 0.52;
const BREAKOUT_SETUP_READY_PROGRESS_THRESHOLD = 0.86;

function normalizeThreshold(
  value: number | null | undefined,
  fallback: number,
): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function buildMaturityOutput(
  state: SetupMaturityOutput["state"],
  confidence: number,
): SetupMaturityOutput {
  return {
    state,
    score: mapMaturityStateScore(state),
    confidence: clampSetupPercentage(confidence),
  };
}

function buildOpportunityWindowOutput(
  state: OpportunityWindowOutput["state"],
  confidence: number,
): OpportunityWindowOutput {
  return {
    state,
    score: mapWindowStateScore(state),
    confidence: clampSetupPercentage(confidence),
  };
}

function resolveMaturityThresholds(
  setup: SetupOutput,
  overrides?: TradingBacktestFunnelOverrides["maturityThresholds"] | null,
): {
  developing: number;
  ready: number;
} {
  if (setup.type === "breakout_continuation") {
    return {
      developing: normalizeThreshold(
        overrides?.breakoutDeveloping,
        BREAKOUT_SETUP_DEVELOPING_PROGRESS_THRESHOLD,
      ),
      ready: normalizeThreshold(overrides?.breakoutReady, BREAKOUT_SETUP_READY_PROGRESS_THRESHOLD),
    };
  }

  return {
    developing: normalizeThreshold(
      overrides?.defaultDeveloping,
      DEFAULT_SETUP_DEVELOPING_PROGRESS_THRESHOLD,
    ),
    ready: normalizeThreshold(overrides?.defaultReady, DEFAULT_SETUP_READY_PROGRESS_THRESHOLD),
  };
}

export function assessBacktestSetupMaturity(
  input: SetupEngineInput,
  setup: SetupOutput,
  overrides?: TradingBacktestFunnelOverrides["maturityThresholds"] | null,
): SetupMaturityOutput {
  if (!overrides) {
    return assessSetupMaturity(input, setup);
  }

  const context = resolveSetupContext(input);

  if (setup.type === "none") {
    return buildMaturityOutput("invalid", 88);
  }

  if (isSetupInvalid(setup.direction, context.latestPrice, setup.invalidationLevel)) {
    return buildMaturityOutput("invalid", 90);
  }

  const progress = getDirectionalProgress(
    setup.direction,
    context.latestPrice,
    setup.triggerLevel,
    setup.invalidationLevel,
  );

  if (!progress) {
    return buildMaturityOutput("invalid", 86);
  }

  const thresholds = resolveMaturityThresholds(setup, overrides);

  if (
    progress.progressToTrigger >= 1.55 ||
    (progress.progressToTrigger > 1.15 && context.market.momentum.state === "exhausted")
  ) {
    return buildMaturityOutput("late", 72);
  }

  if (progress.progressToTrigger >= thresholds.ready) {
    return buildMaturityOutput(
      "ready",
      64 + setup.confidence * 0.18 + context.market.momentum.confidence * 0.08,
    );
  }

  if (progress.progressToTrigger >= thresholds.developing) {
    return buildMaturityOutput(
      "developing",
      58 + setup.confidence * 0.14 + context.market.momentum.confidence * 0.06,
    );
  }

  return buildMaturityOutput(
    "forming",
    52 + setup.confidence * 0.1 + context.market.structure.confidence * 0.06,
  );
}

export function assessBacktestOpportunityWindow(
  input: SetupEngineInput,
  setup: SetupOutput,
  maturity: SetupMaturityOutput,
  overrides?: TradingBacktestFunnelOverrides["opportunityWindow"] | null,
): OpportunityWindowOutput {
  const context = resolveSetupContext(input);
  const ignoreMiddayLullDegrading = overrides?.ignoreMiddayLullDegrading ?? false;
  const promoteOpeningToActive = overrides?.promoteOpeningToActive ?? false;

  if (!overrides) {
    return assessOpportunityWindow(input, setup, maturity);
  }

  if (setup.type === "none" || maturity.state === "invalid" || !context.market.session.marketOpen) {
    return buildOpportunityWindowOutput("closed", 90);
  }

  if (maturity.state === "late") {
    return buildOpportunityWindowOutput("degrading", 76);
  }

  if (
    context.market.volatility.state === "spike" ||
    (context.market.session.session === "midday_lull" && !ignoreMiddayLullDegrading)
  ) {
    return buildOpportunityWindowOutput("degrading", 72);
  }

  if (maturity.state === "ready") {
    return buildOpportunityWindowOutput(
      "active",
      66 + context.market.session.confidence * 0.12 + maturity.confidence * 0.12,
    );
  }

  if (maturity.state === "developing") {
    if (promoteOpeningToActive) {
      return buildOpportunityWindowOutput(
        "active",
        62 + context.market.session.confidence * 0.11 + maturity.confidence * 0.11,
      );
    }

    return buildOpportunityWindowOutput(
      "opening",
      60 + context.market.session.confidence * 0.1 + maturity.confidence * 0.1,
    );
  }

  return buildOpportunityWindowOutput(
    "forming",
    54 + context.market.session.confidence * 0.08 + maturity.confidence * 0.08,
  );
}

export function createBacktestSetupCore(
  input: SetupEngineInput,
  overrides?: TradingBacktestFunnelOverrides | null,
): SetupCoreOutput {
  if (!overrides?.maturityThresholds && !overrides?.opportunityWindow) {
    return createSetupCore(input);
  }

  const setup = detectSetup(input);
  const maturity = assessBacktestSetupMaturity(input, setup, overrides?.maturityThresholds);
  const opportunityWindow = assessBacktestOpportunityWindow(
    input,
    setup,
    maturity,
    overrides?.opportunityWindow,
  );
  const quality = assessSetupQuality(input, setup, maturity, opportunityWindow);

  return {
    setup,
    maturity,
    opportunityWindow,
    quality,
  };
}

export function resolveBacktestTradeValidEdgeThreshold(args: {
  setupType: SetupOutput["type"];
  overrides?: TradingBacktestFunnelOverrides["tradeValidEdgeThresholds"] | null;
}): number {
  if (args.setupType === "breakout_continuation") {
    return normalizeThreshold(
      args.overrides?.breakoutTradeValid,
      BREAKOUT_TRADE_VALID_EDGE_THRESHOLD,
    );
  }

  return normalizeThreshold(
    args.overrides?.defaultTradeValid,
    DEFAULT_TRADE_VALID_EDGE_THRESHOLD,
  );
}

function summarizeReasons(
  input: DecisionEngineInput,
  clarity: ClarityOutput,
  bias: BiasOutput,
  environment: EnvironmentOutput,
): string[] {
  const reasons = [
    `Setup: ${setupLabel(input.setupCore.setup.type)}`,
    `Bias: ${bias.direction}`,
    `Clarity: ${clarity.level}`,
    `Environment: ${environment.state}`,
  ];

  if (input.setupCore.opportunityWindow.state !== "closed") {
    reasons.push(`Window: ${input.setupCore.opportunityWindow.state}`);
  }

  return reasons;
}

function computeWeightedEdge(weighting: DecisionWeightingOutput): number {
  return clampDecisionPercentage(
    weighting.weightedScores.setup * 0.16 +
      weighting.weightedScores.quality * 0.16 +
      weighting.weightedScores.clarity * 0.16 +
      weighting.weightedScores.environment * 0.16 +
      weighting.weightedScores.maturity * 0.12 +
      weighting.weightedScores.opportunityWindow * 0.12 +
      weighting.weightedScores.momentum * 0.12 -
      weighting.weightedScores.conflictPenalty * 0.1 +
      weighting.weightedScores.confluenceBonus,
  );
}

function makeBacktestDecision(
  input: DecisionEngineInput,
  clarity: ClarityOutput,
  bias: BiasOutput,
  environment: EnvironmentOutput,
  weighting: DecisionWeightingOutput,
  overrides?: TradingBacktestFunnelOverrides["tradeValidEdgeThresholds"] | null,
): DecisionOutput {
  const reasons = summarizeReasons(input, clarity, bias, environment);
  const tradeValidEdgeThreshold = resolveBacktestTradeValidEdgeThreshold({
    setupType: input.setupCore.setup.type,
    overrides,
  });
  const weightedEdge = computeWeightedEdge(weighting);

  if (!input.market.session.marketOpen) {
    return {
      currentState: "MARKET_CLOSED",
      primaryMessage: "Market closed.",
      secondaryMessage: "Wait for the next live session before evaluating opportunity.",
      confidence: 96,
      reasons,
    };
  }

  if (input.setupCore.setup.type === "none") {
    return {
      currentState: "WAIT",
      primaryMessage: "No valid setup yet.",
      secondaryMessage: "The market is open, but no canonical opportunity is qualified right now.",
      confidence: clampDecisionPercentage(
        input.market.session.confidence * 0.35 + clarity.score * 0.2 + environment.confidence * 0.2,
      ),
      reasons,
    };
  }

  if (input.setupCore.maturity.state === "invalid") {
    return {
      currentState: "EXIT",
      primaryMessage: "Setup invalidated.",
      secondaryMessage: "The opportunity lost structural validity and should not be pursued.",
      confidence: clampDecisionPercentage(82 + clarity.conflictScore * 0.12),
      reasons,
    };
  }

  if (
    input.setupCore.maturity.state === "late" ||
    input.setupCore.opportunityWindow.state === "degrading"
  ) {
    return {
      currentState: "TOO_LATE",
      primaryMessage: "Opportunity late.",
      secondaryMessage: "The setup has already extended and the window is degrading.",
      confidence: clampDecisionPercentage(74 + input.setupCore.maturity.confidence * 0.12),
      reasons,
    };
  }

  if (
    input.setupCore.maturity.state === "forming" ||
    input.setupCore.maturity.state === "developing" ||
    input.setupCore.opportunityWindow.state === "forming" ||
    input.setupCore.opportunityWindow.state === "opening"
  ) {
    return {
      currentState: input.setupCore.maturity.state === "forming" ? "SETUP_FORMING" : "WAIT",
      primaryMessage:
        input.setupCore.maturity.state === "forming"
          ? "Setup forming."
          : "Setup developing.",
      secondaryMessage: "The opportunity is building, but it is not yet at its best execution point.",
      confidence: clampDecisionPercentage(
        input.setupCore.maturity.confidence * 0.35 +
          input.setupCore.opportunityWindow.confidence * 0.25 +
          clarity.score * 0.2 +
          environment.confidence * 0.2,
      ),
      reasons,
    };
  }

  if (
    isFullyTradeValidCandidate({
      input,
      clarity,
      bias,
      environment,
      weightedEdge,
      edgeThreshold: tradeValidEdgeThreshold,
    })
  ) {
    return {
      currentState: "TRADE_VALID",
      primaryMessage: "Trade valid.",
      secondaryMessage: "Context, setup, and timing are aligned for a live opportunity.",
      confidence: clampDecisionPercentage(weightedEdge * 0.55 + weighting.confidence * 0.45),
      reasons,
    };
  }

  if (input.market.session.session === "ny_open" || input.market.session.session === "london_open") {
    return {
      currentState: "SESSION_OPEN",
      primaryMessage: "Session open.",
      secondaryMessage: "Stay selective while the session establishes structure and follow-through.",
      confidence: clampDecisionPercentage(
        input.market.session.confidence * 0.45 + clarity.score * 0.2 + environment.confidence * 0.2,
      ),
      reasons,
    };
  }

  return {
    currentState: "WAIT",
    primaryMessage: "Wait for better alignment.",
    secondaryMessage: "There is some opportunity structure, but confluence is not strong enough yet.",
    confidence: clampDecisionPercentage(
      weighting.confidence * 0.45 + clarity.score * 0.3 + environment.confidence * 0.25,
    ),
    reasons,
  };
}

export function createBacktestDecisionCore(
  input: DecisionEngineInput,
  overrides?: TradingBacktestFunnelOverrides | null,
) {
  const decisionCore = createDecisionCore(input);

  if (!overrides?.tradeValidEdgeThresholds) {
    return decisionCore;
  }

  return {
    ...decisionCore,
    decision: makeBacktestDecision(
      input,
      decisionCore.clarity,
      decisionCore.bias,
      decisionCore.environment,
      decisionCore.weighting,
      overrides.tradeValidEdgeThresholds,
    ),
  };
}
