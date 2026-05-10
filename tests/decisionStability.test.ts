import { describe, expect, it } from "vitest";
import { advanceDecisionStability } from "@/app/app/tabs/decisionStability";

function makeDailyView(overrides: Record<string, unknown> = {}) {
  return {
    action: "BUY",
    stateReason: "none",
    branch: "success",
    allowExecution: true,
    headline: "BUY: act selectively",
    ...overrides,
  };
}

function makeAdvisorView(overrides: Record<string, unknown> = {}) {
  return {
    kind: "continue_daily",
    action: "daily",
    title: "Step 4: continue in Daily",
    detail: "The active plan supports measured deployment.",
    ...overrides,
  };
}

describe("advanceDecisionStability", () => {
  it("lets hard states bypass stabilization immediately", () => {
    const healthy = advanceDecisionStability(
      null,
      makeDailyView(),
      {
        action: "BUY",
        stateReason: "none",
        branch: "success",
        allowExecution: true,
        hard: false,
        mode: "investing",
      },
    );

    const hard = advanceDecisionStability(
      healthy.frame,
      makeDailyView({
        action: "HOLD",
        stateReason: "no_plan",
        allowExecution: false,
        headline: "HOLD: no active plan",
      }),
      {
        action: "HOLD",
        stateReason: "no_plan",
        branch: "success",
        allowExecution: false,
        hard: true,
        mode: "investing",
      },
    );

    expect(hard.view.stateReason).toBe("no_plan");
    expect(hard.view.stabilitySource).toBe("live");
  });

  it("keeps starter_warmup on the first post-warmup refresh", () => {
    const warmup = advanceDecisionStability(
      null,
      makeDailyView({
        action: "HOLD",
        stateReason: "starter_warmup",
        allowExecution: false,
        headline: "OBSERVE: starter pack settling",
      }),
      {
        action: "HOLD",
        stateReason: "starter_warmup",
        branch: "success",
        allowExecution: false,
        hard: true,
        mode: "investing",
      },
    );

    const firstHealthy = advanceDecisionStability(
      warmup.frame,
      makeDailyView({
        action: "BUY",
        stateReason: "none",
        allowExecution: true,
        headline: "BUY: act selectively",
      }),
      {
        action: "BUY",
        stateReason: "none",
        branch: "success",
        allowExecution: true,
        hard: false,
        mode: "investing",
      },
    );

    expect(firstHealthy.view.stateReason).toBe("starter_warmup");
    expect(firstHealthy.view.stabilitySource).toBe("held");
  });

  it("keeps low_data_quality on the first healthy refresh", () => {
    const lowData = advanceDecisionStability(
      null,
      makeDailyView({
        action: "HOLD",
        stateReason: "low_data_quality",
        allowExecution: false,
        headline: "HOLD: fix data quality first",
      }),
      {
        action: "HOLD",
        stateReason: "low_data_quality",
        branch: "success",
        allowExecution: false,
        hard: true,
        mode: "investing",
      },
    );

    const firstHealthy = advanceDecisionStability(
      lowData.frame,
      makeDailyView({
        action: "BUY",
        stateReason: "none",
        allowExecution: true,
      }),
      {
        action: "BUY",
        stateReason: "none",
        branch: "success",
        allowExecution: true,
        hard: false,
        mode: "investing",
      },
    );

    expect(firstHealthy.view.stateReason).toBe("low_data_quality");
    expect(firstHealthy.view.stabilitySource).toBe("held");
  });

  it("keeps FIX -> HOLD -> FIX short oscillations stable", () => {
    const fix = advanceDecisionStability(
      null,
      makeAdvisorView({
        kind: "fix_leak",
        action: "fix",
        title: "Step 3: fix leak before growth",
      }),
      {
        action: "FIX",
        stateReason: "none",
        branch: "success",
        allowExecution: true,
        hard: false,
        mode: "investing",
      },
    );

    const holdCandidate = advanceDecisionStability(
      fix.frame,
      makeAdvisorView({
        kind: "continue_daily",
        action: "daily",
        title: "Step 4: continue in Daily",
      }),
      {
        action: "HOLD",
        stateReason: "none",
        branch: "success",
        allowExecution: true,
        hard: false,
        mode: "investing",
      },
    );

    const backToFix = advanceDecisionStability(
      holdCandidate.frame,
      makeAdvisorView({
        kind: "fix_leak",
        action: "fix",
        title: "Step 3: fix leak before growth",
      }),
      {
        action: "FIX",
        stateReason: "none",
        branch: "success",
        allowExecution: true,
        hard: false,
        mode: "investing",
      },
    );

    expect(holdCandidate.view.kind).toBe("fix_leak");
    expect(holdCandidate.view.stabilitySource).toBe("held");
    expect(backToFix.view.kind).toBe("fix_leak");
    expect(backToFix.view.stabilitySource).toBe("live");
  });

  it("releases to healthy canonical state after two consecutive matching readings", () => {
    const warmup = advanceDecisionStability(
      null,
      makeDailyView({
        action: "HOLD",
        stateReason: "starter_warmup",
        allowExecution: false,
      }),
      {
        action: "HOLD",
        stateReason: "starter_warmup",
        branch: "success",
        allowExecution: false,
        hard: true,
        mode: "investing",
      },
    );

    const firstBuy = advanceDecisionStability(
      warmup.frame,
      makeDailyView({
        action: "BUY",
        stateReason: "none",
        allowExecution: true,
      }),
      {
        action: "BUY",
        stateReason: "none",
        branch: "success",
        allowExecution: true,
        hard: false,
        mode: "investing",
      },
    );

    const secondBuy = advanceDecisionStability(
      firstBuy.frame,
      makeDailyView({
        action: "BUY",
        stateReason: "none",
        allowExecution: true,
      }),
      {
        action: "BUY",
        stateReason: "none",
        branch: "success",
        allowExecution: true,
        hard: false,
        mode: "investing",
      },
    );

    expect(firstBuy.view.action).toBe("HOLD");
    expect(firstBuy.view.stabilitySource).toBe("held");
    expect(secondBuy.view.action).toBe("BUY");
    expect(secondBuy.view.stabilitySource).toBe("live");
  });

  it("keeps Daily and Advisor aligned during the first post-warmup refresh", () => {
    const dailyWarmup = advanceDecisionStability(
      null,
      makeDailyView({
        action: "HOLD",
        stateReason: "starter_warmup",
        allowExecution: false,
      }),
      {
        action: "HOLD",
        stateReason: "starter_warmup",
        branch: "success",
        allowExecution: false,
        hard: true,
        mode: "investing",
      },
    );

    const advisorWarmup = advanceDecisionStability(
      null,
      makeAdvisorView({
        kind: "starter_warmup",
        action: "daily",
        title: "Step 3: observe starter pack",
      }),
      {
        action: "HOLD",
        stateReason: "starter_warmup",
        branch: "success",
        allowExecution: false,
        hard: true,
        mode: "investing",
      },
    );

    const dailyFirstHealthy = advanceDecisionStability(
      dailyWarmup.frame,
      makeDailyView({
        action: "BUY",
        stateReason: "none",
        allowExecution: true,
      }),
      {
        action: "BUY",
        stateReason: "none",
        branch: "success",
        allowExecution: true,
        hard: false,
        mode: "investing",
      },
    );

    const advisorFirstHealthy = advanceDecisionStability(
      advisorWarmup.frame,
      makeAdvisorView({
        kind: "continue_daily",
        action: "daily",
        title: "Step 4: continue in Daily",
      }),
      {
        action: "BUY",
        stateReason: "none",
        branch: "success",
        allowExecution: true,
        hard: false,
        mode: "investing",
      },
    );

    expect(dailyFirstHealthy.view.stateReason).toBe("starter_warmup");
    expect(advisorFirstHealthy.view.kind).toBe("starter_warmup");
    expect(dailyFirstHealthy.view.stabilitySource).toBe("held");
    expect(advisorFirstHealthy.view.stabilitySource).toBe("held");
  });
});
