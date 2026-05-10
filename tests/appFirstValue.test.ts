import { describe, expect, it } from "vitest";

import { deriveFirstValueRailState, deriveSetupProgress } from "@/app/app/firstValue";

describe("app first value", () => {
  it("derives setup progress from core onboarding fields", () => {
    const state = deriveSetupProgress({
      risk_profile: "Balanced",
      horizon: "Long",
      goal_type: "retirement",
    });

    expect(state.complete).toBe(false);
    expect(state.progressDone).toBe(3);
    expect(state.progressTotal).toBe(4);
    expect(state.missingKeys).toEqual(["goal_target_value"]);
  });

  it("shows setup rail when onboarding is incomplete", () => {
    const rail = deriveFirstValueRailState({
      mode: "investing",
      tier: "free",
      settings: {
        risk_profile: "Balanced",
      },
      view: "daily",
      welcomeSetupRequested: false,
      offlineSetupRequested: false,
    });

    expect(rail.kind).toBe("setup");
  });

  it("hides the shell discovery rail for free trading after setup is complete", () => {
    const rail = deriveFirstValueRailState({
      mode: "trading",
      tier: "free",
      settings: {
        setup_status: "complete",
        risk_profile: "Balanced",
        horizon: "Long",
        goal_type: "wealth",
        goal_target_value: 100000,
      },
      view: "trading",
      welcomeSetupRequested: false,
      offlineSetupRequested: false,
    });

    expect(rail.kind).toBe("hidden");
  });

  it("hides rail while user is already inside planning onboarding", () => {
    const rail = deriveFirstValueRailState({
      mode: "investing",
      tier: "free",
      settings: {},
      view: "planning",
      welcomeSetupRequested: true,
      offlineSetupRequested: false,
    });

    expect(rail).toEqual({ kind: "hidden" });
  });
});
