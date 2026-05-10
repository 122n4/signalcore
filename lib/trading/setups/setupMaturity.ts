import type { SetupContext, SetupEngineInput, SetupMaturityOutput, SetupOutput } from "./types";
import {
  clampPercentage,
  getDirectionalProgress,
  isSetupInvalid,
  mapMaturityStateScore,
  resolveSetupContext,
} from "./utils";

const DEFAULT_SETUP_DEVELOPING_PROGRESS_THRESHOLD = 0.58;
const DEFAULT_SETUP_READY_PROGRESS_THRESHOLD = 0.92;
const BREAKOUT_SETUP_DEVELOPING_PROGRESS_THRESHOLD = 0.52;
const BREAKOUT_SETUP_READY_PROGRESS_THRESHOLD = 0.86;
const REVERSAL_SETUP_DEVELOPING_PROGRESS_THRESHOLD = 0.4;
const REVERSAL_SETUP_READY_PROGRESS_THRESHOLD = 0.74;

function isReversalSetup(setup: SetupOutput) {
  return ["liquidity_sweep_reversal", "range_reclaim", "failed_breakout"].includes(setup.type);
}

function resolveMaturityThresholds(setup: SetupOutput): {
  developing: number;
  ready: number;
} {
  if (isReversalSetup(setup)) {
    return {
      developing: REVERSAL_SETUP_DEVELOPING_PROGRESS_THRESHOLD,
      ready: REVERSAL_SETUP_READY_PROGRESS_THRESHOLD,
    };
  }

  if (setup.type === "breakout_continuation") {
    return {
      developing: BREAKOUT_SETUP_DEVELOPING_PROGRESS_THRESHOLD,
      ready: BREAKOUT_SETUP_READY_PROGRESS_THRESHOLD,
    };
  }

  return {
    developing: DEFAULT_SETUP_DEVELOPING_PROGRESS_THRESHOLD,
    ready: DEFAULT_SETUP_READY_PROGRESS_THRESHOLD,
  };
}

function buildOutput(
  state: SetupMaturityOutput["state"],
  confidence: number,
): SetupMaturityOutput {
  return {
    state,
    score: mapMaturityStateScore(state),
    confidence: clampPercentage(confidence),
  };
}

export function assessSetupMaturity(
  input: SetupEngineInput | SetupContext,
  setup: SetupOutput,
): SetupMaturityOutput {
  const context = resolveSetupContext(input);

  if (setup.type === "none") {
    return buildOutput("invalid", 88);
  }

  if (isSetupInvalid(setup.direction, context.latestPrice, setup.invalidationLevel)) {
    return buildOutput("invalid", 90);
  }

  const progress = getDirectionalProgress(
    setup.direction,
    context.latestPrice,
    setup.triggerLevel,
    setup.invalidationLevel,
  );

  if (!progress) {
    return buildOutput("invalid", 86);
  }

  const thresholds = resolveMaturityThresholds(setup);

  if (
    progress.progressToTrigger >= 1.55 ||
    (progress.progressToTrigger > 1.15 && context.market.momentum.state === "exhausted")
  ) {
    return buildOutput("late", 72);
  }

  if (progress.progressToTrigger >= thresholds.ready) {
    return buildOutput(
      "ready",
      64 + setup.confidence * 0.18 + context.market.momentum.confidence * 0.08,
    );
  }

  if (progress.progressToTrigger >= thresholds.developing) {
    return buildOutput(
      "developing",
      58 + setup.confidence * 0.14 + context.market.momentum.confidence * 0.06,
    );
  }

  return buildOutput(
    "forming",
    52 + setup.confidence * 0.1 + context.market.structure.confidence * 0.06,
  );
}
