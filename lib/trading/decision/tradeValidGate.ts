import type {
  BiasOutput,
  ClarityOutput,
  DecisionEngineInput,
  EnvironmentOutput,
} from "./types";

export const DEFAULT_TRADE_VALID_EDGE_THRESHOLD = 64;
export const BREAKOUT_TRADE_VALID_EDGE_THRESHOLD = 60;
export const DEFAULT_EARLY_TRADE_VALID_EDGE_THRESHOLD = 60;
export const BREAKOUT_EARLY_TRADE_VALID_EDGE_THRESHOLD = 58;

type PrecisionThresholds = {
  clarity: number;
  environment: number;
  quality: number;
  maturity: number;
  opportunityWindow: number;
};

const FULL_TRADE_VALID_THRESHOLDS: Record<"standard" | "reversal", PrecisionThresholds> = {
  standard: {
    clarity: 64,
    environment: 56,
    quality: 62,
    maturity: 66,
    opportunityWindow: 68,
  },
  reversal: {
    clarity: 68,
    environment: 60,
    quality: 68,
    maturity: 66,
    opportunityWindow: 68,
  },
};

const EARLY_STANDARD_THRESHOLDS: PrecisionThresholds = {
  clarity: 68,
  environment: 58,
  quality: 68,
  maturity: 60,
  opportunityWindow: 64,
};

const EARLY_REVERSAL_HIGH_CLARITY_THRESHOLDS: PrecisionThresholds = {
  clarity: 76,
  environment: 60,
  quality: 64,
  maturity: 58,
  opportunityWindow: 62,
};

const EARLY_REVERSAL_HIGH_QUALITY_THRESHOLDS: PrecisionThresholds = {
  clarity: 60,
  environment: 66,
  quality: 76,
  maturity: 56,
  opportunityWindow: 60,
};

export function isReversalSetup(type: DecisionEngineInput["setupCore"]["setup"]["type"]) {
  return ["liquidity_sweep_reversal", "range_reclaim", "failed_breakout"].includes(type);
}

export function resolveTradeValidEdgeThresholds(input: DecisionEngineInput): {
  strict: number;
  early: number;
} {
  if (input.setupCore.setup.type === "breakout_continuation") {
    return {
      strict: BREAKOUT_TRADE_VALID_EDGE_THRESHOLD,
      early: BREAKOUT_EARLY_TRADE_VALID_EDGE_THRESHOLD,
    };
  }

  return {
    strict: DEFAULT_TRADE_VALID_EDGE_THRESHOLD,
    early: DEFAULT_EARLY_TRADE_VALID_EDGE_THRESHOLD,
  };
}

export function isActionableBias(input: BiasOutput) {
  return input.direction !== "mixed" && input.direction !== "neutral";
}

export function isActionableClarity(input: ClarityOutput) {
  return input.level !== "low";
}

export function isActionableEnvironment(input: EnvironmentOutput) {
  return input.state !== "unfavorable";
}

function passesPrecisionThresholds(args: {
  input: DecisionEngineInput;
  clarity: ClarityOutput;
  environment: EnvironmentOutput;
  thresholds: PrecisionThresholds;
}) {
  const { input, clarity, environment, thresholds } = args;

  return (
    clarity.score >= thresholds.clarity &&
    environment.score >= thresholds.environment &&
    input.setupCore.quality.score >= thresholds.quality &&
    input.setupCore.maturity.score >= thresholds.maturity &&
    input.setupCore.opportunityWindow.score >= thresholds.opportunityWindow
  );
}

export function isFullyTradeValidCandidate(args: {
  input: DecisionEngineInput;
  clarity: ClarityOutput;
  bias: BiasOutput;
  environment: EnvironmentOutput;
  weightedEdge: number;
  edgeThreshold: number;
}) {
  const { input, clarity, bias, environment, weightedEdge, edgeThreshold } = args;
  const thresholdKey = isReversalSetup(input.setupCore.setup.type) ? "reversal" : "standard";

  return (
    input.setupCore.maturity.state === "ready" &&
    input.setupCore.opportunityWindow.state === "active" &&
    isActionableClarity(clarity) &&
    isActionableBias(bias) &&
    isActionableEnvironment(environment) &&
    passesPrecisionThresholds({
      input,
      clarity,
      environment,
      thresholds: FULL_TRADE_VALID_THRESHOLDS[thresholdKey],
    }) &&
    weightedEdge >= edgeThreshold
  );
}

export function isEarlyTradeValidCandidate(args: {
  input: DecisionEngineInput;
  clarity: ClarityOutput;
  bias: BiasOutput;
  environment: EnvironmentOutput;
  weightedEdge: number;
  earlyEdgeThreshold: number;
}) {
  const { input, clarity, bias, environment, weightedEdge, earlyEdgeThreshold } = args;
  const reversalSetup = isReversalSetup(input.setupCore.setup.type);
  const maturityEligible =
    input.setupCore.maturity.state === "ready" || input.setupCore.maturity.state === "developing";
  const windowEligible =
    input.setupCore.opportunityWindow.state === "active" ||
    input.setupCore.opportunityWindow.state === "opening";
  const reversalHighClarity = reversalSetup && clarity.score >= 76;
  const reversalHighQuality = reversalSetup && input.setupCore.quality.score >= 80;
  const reversalThresholds = reversalHighClarity
    ? EARLY_REVERSAL_HIGH_CLARITY_THRESHOLDS
    : EARLY_REVERSAL_HIGH_QUALITY_THRESHOLDS;
  const thresholds = reversalSetup ? reversalThresholds : EARLY_STANDARD_THRESHOLDS;
  const edgeThreshold = reversalSetup
    ? Math.max(
        earlyEdgeThreshold + (reversalHighClarity ? 6 : 8),
        reversalHighClarity ? 66 : 68,
      )
    : earlyEdgeThreshold;

  return (
    maturityEligible &&
    windowEligible &&
    isActionableClarity(clarity) &&
    isActionableBias(bias) &&
    isActionableEnvironment(environment) &&
    (!reversalSetup || reversalHighClarity || reversalHighQuality) &&
    passesPrecisionThresholds({
      input,
      clarity,
      environment,
      thresholds,
    }) &&
    weightedEdge >= edgeThreshold
  );
}
