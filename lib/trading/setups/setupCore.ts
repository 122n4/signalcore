import type { SetupCoreOutput, SetupEngineInput } from "./types";
import { assessOpportunityWindow } from "./opportunityWindow";
import { detectSetup } from "./setupDetection";
import { assessSetupMaturity } from "./setupMaturity";
import { assessSetupQuality } from "./setupQuality";

export function createSetupCore(input: SetupEngineInput): SetupCoreOutput {
  const setup = detectSetup(input);
  const maturity = assessSetupMaturity(input, setup);
  const opportunityWindow = assessOpportunityWindow(input, setup, maturity);
  const quality = assessSetupQuality(input, setup, maturity, opportunityWindow);

  return {
    setup,
    maturity,
    opportunityWindow,
    quality,
  };
}
