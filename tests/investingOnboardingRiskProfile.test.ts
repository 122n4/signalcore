import { describe, expect, it } from "vitest";
import { deriveOnboardingRiskProfile } from "../lib/investing/onboarding/riskProfile";

describe("Investing onboarding risk profile", () => {
  it("does not classify a beginner who holds and reassesses as aggressive", () => {
    expect(deriveOnboardingRiskProfile({ lossReaction: "hold", incomeStable: true, needsCapitalSoon: false, experienceLevel: "beginner" })).toBe("Balanced");
  });

  it("reserves aggressive for experienced users with aggressive loss behaviour", () => {
    expect(deriveOnboardingRiskProfile({ lossReaction: "buy", incomeStable: true, needsCapitalSoon: false, experienceLevel: "advanced" })).toBe("Aggressive");
  });

  it("fails conservative when capital is needed soon and losses trigger selling", () => {
    expect(deriveOnboardingRiskProfile({ lossReaction: "sell", incomeStable: true, needsCapitalSoon: true, experienceLevel: "beginner" })).toBe("Conservative");
  });
});
