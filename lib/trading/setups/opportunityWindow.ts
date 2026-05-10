import type {
  OpportunityWindowOutput,
  SetupContext,
  SetupEngineInput,
  SetupMaturityOutput,
  SetupOutput,
} from "./types";
import { clampPercentage, mapWindowStateScore, resolveSetupContext } from "./utils";

function buildOutput(
  state: OpportunityWindowOutput["state"],
  confidence: number,
): OpportunityWindowOutput {
  return {
    state,
    score: mapWindowStateScore(state),
    confidence: clampPercentage(confidence),
  };
}

export function assessOpportunityWindow(
  input: SetupEngineInput | SetupContext,
  setup: SetupOutput,
  maturity: SetupMaturityOutput,
): OpportunityWindowOutput {
  const context = resolveSetupContext(input);

  if (setup.type === "none" || maturity.state === "invalid" || !context.market.session.marketOpen) {
    return buildOutput("closed", 90);
  }

  if (maturity.state === "late") {
    return buildOutput("degrading", 76);
  }

  if (context.market.session.session === "midday_lull" || context.market.volatility.state === "spike") {
    return buildOutput("degrading", 72);
  }

  if (maturity.state === "ready") {
    return buildOutput(
      "active",
      66 + context.market.session.confidence * 0.12 + maturity.confidence * 0.12,
    );
  }

  if (maturity.state === "developing") {
    return buildOutput(
      "opening",
      60 + context.market.session.confidence * 0.1 + maturity.confidence * 0.1,
    );
  }

  return buildOutput(
    "forming",
    54 + context.market.session.confidence * 0.08 + maturity.confidence * 0.08,
  );
}
