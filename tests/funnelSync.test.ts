import { describe, expect, it } from "vitest";
import {
  buildGoalQuizSnapshot,
  buildUserSettingsSyncPayload,
  goalTypeFromMode,
  horizonFromMonthsForSettings,
  horizonPresetFromMonths,
  resolvePlanningSeed,
  riskPresetFromProfile,
  riskProfileFromPreset,
} from "../lib/signalcore/funnelSync";

describe("funnelSync", () => {
  it("resolves planning seed with wealth plan taking precedence over goal quiz for numeric fields", () => {
    const out = resolvePlanningSeed({
      goalQuiz: {
        startingCapital: 100,
        monthlyContribution: 100,
        targetCapital: 1000,
        riskProfile: "Balanced",
        horizonMonths: 36,
      },
      wealthPlan: {
        startingCapital: 9999,
        monthlyContribution: 9999,
        targetCapital: 9999,
      },
    });

    expect(out.startingCapital).toBe(9999);
    expect(out.monthlyContribution).toBe(9999);
    expect(out.targetCapital).toBe(9999);
    expect(out.riskPreset).toBe("medium");
    expect(out.horizonPreset).toBe("3y");
  });

  it("falls back to wealth plan values when goal quiz is missing", () => {
    const out = resolvePlanningSeed({
      goalQuiz: null,
      wealthPlan: {
        startingCapital: 2500,
        monthlyContribution: 200,
        targetCapital: 15000,
      },
    });

    expect(out.startingCapital).toBe(2500);
    expect(out.monthlyContribution).toBe(200);
    expect(out.targetCapital).toBe(15000);
    expect(out.riskPreset).toBe(null);
    expect(out.horizonPreset).toBe(null);
  });

  it("maps risk and horizon normalization deterministically", () => {
    expect(riskPresetFromProfile("Conservative")).toBe("low");
    expect(riskPresetFromProfile("Balanced")).toBe("medium");
    expect(riskPresetFromProfile("Aggressive")).toBe("high");
    expect(riskPresetFromProfile("unknown")).toBe(null);

    expect(riskProfileFromPreset("low")).toBe("Conservative");
    expect(riskProfileFromPreset("medium")).toBe("Balanced");
    expect(riskProfileFromPreset("high")).toBe("Aggressive");

    expect(horizonPresetFromMonths(3)).toBe("3m");
    expect(horizonPresetFromMonths(12)).toBe("12m");
    expect(horizonPresetFromMonths(36)).toBe("3y");
    expect(horizonPresetFromMonths(60)).toBe("5y");
    expect(horizonPresetFromMonths(120)).toBe("10y");
    expect(horizonPresetFromMonths(null)).toBe(null);
  });

  it("builds goal quiz snapshot for 100/100/1000 preserving existing keys", () => {
    const out = buildGoalQuizSnapshot({
      existingGoalQuiz: { hasExistingHoldings: false, verdict: "realistic" },
      mode: "investing",
      riskPreset: "medium",
      horizonMonths: 36,
      startingCapital: 100,
      monthlyContribution: 100,
      targetCapital: 1000,
      annualReturn: 7,
    });

    expect(out.mode).toBe("investing");
    expect(out.goalType).toBe("Investing");
    expect(out.riskProfile).toBe("Balanced");
    expect(out.horizonMonths).toBe(36);
    expect(out.startingCapital).toBe(100);
    expect(out.monthlyContribution).toBe(100);
    expect(out.targetCapital).toBe(1000);
    expect(out.annualReturn).toBe(7);
    expect(out.hasExistingHoldings).toBe(false);
    expect(out.verdict).toBe("realistic");
  });

  it("builds user-settings sync payload for Setup -> Planning -> Advisor -> Daily", () => {
    const out = buildUserSettingsSyncPayload({
      mode: "investing",
      riskPreset: "medium",
      horizonMonths: 36,
      targetCapital: 1000,
    });

    expect(out).toEqual({
      active_mode: "investing",
      risk_profile: "Balanced",
      horizon: "Medium",
      goal_type: "Investing",
      goal_target_value: 1000,
    });
    expect(goalTypeFromMode("investing")).toBe("Investing");
    expect(horizonFromMonthsForSettings(60)).toBe("Long");
  });
});
