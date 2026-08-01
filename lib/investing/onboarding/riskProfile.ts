export type OnboardingRiskProfile = "Conservative" | "Balanced" | "Aggressive";

export function deriveOnboardingRiskProfile(args: {
  lossReaction: "sell" | "hold" | "buy";
  incomeStable: boolean;
  needsCapitalSoon: boolean;
  experienceLevel: "beginner" | "intermediate" | "advanced";
}): OnboardingRiskProfile {
  const experienceAdjustment = args.experienceLevel === "beginner" ? -2 : args.experienceLevel === "advanced" ? 1 : 0;
  const score =
    (args.lossReaction === "buy" ? 3 : args.lossReaction === "hold" ? 2 : 0) +
    (args.incomeStable ? 2 : 0) +
    (args.needsCapitalSoon ? 0 : 2) +
    experienceAdjustment;
  return score >= 7 ? "Aggressive" : score <= 2 ? "Conservative" : "Balanced";
}
