import type {
  BiasOutput,
  ClarityOutput,
  DecisionEngineInput,
  DecisionOutput,
  DecisionWeightingOutput,
  EnvironmentOutput,
} from "./types";
import {
  isEarlyTradeValidCandidate,
  isFullyTradeValidCandidate,
  resolveTradeValidEdgeThresholds,
} from "./tradeValidGate";
import { clampPercentage, setupLabel } from "./utils";

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

export function makeDecision(
  input: DecisionEngineInput,
  clarity: ClarityOutput,
  bias: BiasOutput,
  environment: EnvironmentOutput,
  weighting: DecisionWeightingOutput,
): DecisionOutput {
  const reasons = summarizeReasons(input, clarity, bias, environment);
  const tradeValidEdgeThresholds = resolveTradeValidEdgeThresholds(input);
  const weightedEdge = clampPercentage(
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
      confidence: clampPercentage(
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
      confidence: clampPercentage(82 + clarity.conflictScore * 0.12),
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
      confidence: clampPercentage(74 + input.setupCore.maturity.confidence * 0.12),
      reasons,
    };
  }

  const fullyTradeValid = isFullyTradeValidCandidate({
    input,
    clarity,
    bias,
    environment,
    weightedEdge,
    edgeThreshold: tradeValidEdgeThresholds.strict,
  });
  const earlyTradeValid =
    !fullyTradeValid &&
    isEarlyTradeValidCandidate({
      input,
      clarity,
      bias,
      environment,
      weightedEdge,
      earlyEdgeThreshold: tradeValidEdgeThresholds.early,
    });

  if (fullyTradeValid || earlyTradeValid) {
    return {
      currentState: "TRADE_VALID",
      primaryMessage: fullyTradeValid ? "Trade valid." : "Trade valid, early window.",
      secondaryMessage: fullyTradeValid
        ? "Context, setup, and timing are aligned for a live opportunity."
        : "Confluence is already strong enough to act selectively before the ideal trigger fully matures.",
      confidence: clampPercentage(
        weightedEdge * 0.5 +
          weighting.confidence * 0.3 +
          input.setupCore.maturity.confidence * 0.1 +
          input.setupCore.opportunityWindow.confidence * 0.1,
      ),
      reasons: earlyTradeValid
        ? [...reasons, "Early-valid confluence: strong developing setup with opening window."]
        : reasons,
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
      confidence: clampPercentage(
        input.setupCore.maturity.confidence * 0.35 +
          input.setupCore.opportunityWindow.confidence * 0.25 +
          clarity.score * 0.2 +
          environment.confidence * 0.2,
      ),
      reasons,
    };
  }

  if (input.market.session.session === "ny_open" || input.market.session.session === "london_open") {
    return {
      currentState: "SESSION_OPEN",
      primaryMessage: "Session open.",
      secondaryMessage: "Stay selective while the session establishes structure and follow-through.",
      confidence: clampPercentage(
        input.market.session.confidence * 0.45 + clarity.score * 0.2 + environment.confidence * 0.2,
      ),
      reasons,
    };
  }

  return {
    currentState: "WAIT",
    primaryMessage: "Wait for better alignment.",
    secondaryMessage: "There is some opportunity structure, but confluence is not strong enough yet.",
    confidence: clampPercentage(weighting.confidence * 0.45 + clarity.score * 0.3 + environment.confidence * 0.25),
    reasons,
  };
}
