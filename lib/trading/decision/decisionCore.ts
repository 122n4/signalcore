import type { DecisionCoreOutput, DecisionEngineInput } from "./types";
import { readBias } from "./bias";
import { readClarity } from "./clarity";
import { makeDecision } from "./decisionEngine";
import { readEnvironment } from "./environment";
import { applyDecisionWeighting } from "./weighting";

export function createDecisionCore(input: DecisionEngineInput): DecisionCoreOutput {
  const clarity = readClarity(input);
  const bias = readBias(input);
  const environment = readEnvironment(input);
  const weighting = applyDecisionWeighting(input, clarity, bias, environment);
  const decision = makeDecision(input, clarity, bias, environment, weighting);

  return {
    clarity,
    bias,
    environment,
    weighting,
    decision,
  };
}
