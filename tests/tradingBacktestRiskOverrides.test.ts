import { describe, expect, it } from "vitest";

import { createExecutionPlan } from "@/lib/trading/execution";
import { applyBacktestRiskOverrides } from "@/lib/trading/backtest";
import { createDefaultTradingPlaybook } from "@/lib/trading/playbook";

import { createExecutionInput } from "./helpers/tradingOperationalFixtures";

const DEFAULT_BASE_RULES = createDefaultTradingPlaybook().baseRules;

describe("trading backtest risk overrides", () => {
  it("raises aggressive risk framing to a configured high-edge risk target", () => {
    const input = createExecutionInput({
      decisionCoreOverrides: {
        clarity: {
          level: "high",
          score: 84,
          conflictScore: 10,
          alignment: 90,
        },
        environment: {
          state: "favorable",
          score: 78,
          confidence: 80,
        },
      },
      setupCoreOverrides: {
        quality: {
          score: 84,
          grade: "A",
          confidence: 84,
        },
      },
    });

    const executionPlan = createExecutionPlan(input);
    const adjusted = applyBacktestRiskOverrides({
      executionPlan,
      playbook: input.playbook,
      instrument: input.snapshot.instrument,
      session: input.market.session.session,
      setupType: input.setupCore.setup.type,
      executionStatus: executionPlan.executionStatus.executionStatus,
      behaviorState: "clear",
      behavior: input.behavior,
      qualityGrade: input.setupCore.quality.grade,
      clarityLevel: input.decisionCore.clarity.level,
      environmentState: input.decisionCore.environment.state,
      overrides: {
        aggressiveRiskPct: 1.4,
      },
    });

    expect(executionPlan.riskFraming.riskMode).toBe("aggressive");
    expect(executionPlan.riskFraming.riskPct).toBe(1);
    expect(executionPlan.riskFraming.sizeAdjustment).toBe(2);
    expect(adjusted.riskFraming.riskPct).toBe(1.4);
    expect(adjusted.riskFraming.sizeAdjustment).toBe(2.8);
  });

  it("does not change non-aggressive risk framing", () => {
    const input = createExecutionInput({
      decisionCoreOverrides: {
        clarity: {
          level: "high",
          score: 82,
          conflictScore: 12,
          alignment: 88,
        },
        environment: {
          state: "favorable",
          score: 76,
          confidence: 78,
        },
      },
      setupCoreOverrides: {
        quality: {
          score: 76,
          grade: "B",
          confidence: 78,
        },
      },
    });

    const executionPlan = createExecutionPlan(input);
    const adjusted = applyBacktestRiskOverrides({
      executionPlan,
      playbook: input.playbook,
      instrument: input.snapshot.instrument,
      session: input.market.session.session,
      setupType: input.setupCore.setup.type,
      executionStatus: executionPlan.executionStatus.executionStatus,
      behaviorState: "clear",
      behavior: input.behavior,
      qualityGrade: input.setupCore.quality.grade,
      clarityLevel: input.decisionCore.clarity.level,
      environmentState: input.decisionCore.environment.state,
      overrides: {
        aggressiveRiskPct: 1.4,
      },
    });

    expect(executionPlan.riskFraming.riskMode).toBe("normal");
    expect(adjusted).toEqual(executionPlan);
  });

  it("applies contextual backtest risk multipliers after the live contextual shaping", () => {
    const input = createExecutionInput({
      snapshotOverrides: {
        instrument: "NAS100",
      },
      marketOverrides: {
        session: {
          session: "ny_open",
          marketOpen: true,
          confidence: 90,
        },
      },
      decisionCoreOverrides: {
        clarity: {
          level: "high",
          score: 84,
          conflictScore: 10,
          alignment: 90,
        },
        environment: {
          state: "favorable",
          score: 78,
          confidence: 80,
        },
      },
      setupCoreOverrides: {
        setup: {
          type: "breakout_continuation",
          direction: "long",
          confidence: 84,
        },
        quality: {
          score: 84,
          grade: "A",
          confidence: 84,
        },
      },
    });

    const executionPlan = createExecutionPlan(input);
    const adjusted = applyBacktestRiskOverrides({
      executionPlan,
      playbook: input.playbook,
      instrument: input.snapshot.instrument,
      session: input.market.session.session,
      setupType: input.setupCore.setup.type,
      executionStatus: executionPlan.executionStatus.executionStatus,
      behaviorState: "clear",
      behavior: input.behavior,
      qualityGrade: input.setupCore.quality.grade,
      clarityLevel: input.decisionCore.clarity.level,
      environmentState: input.decisionCore.environment.state,
      overrides: {
        aggressiveRiskPct: 1,
        rules: [
          {
            instrument: "NAS100",
            sessions: ["ny_open"],
            setupTypes: ["breakout_continuation"],
            riskModes: ["aggressive"],
            riskMultiplier: 0.5,
          },
        ],
      },
    });

    expect(executionPlan.riskFraming.riskPct).toBe(0.75);
    expect(adjusted.riskFraming.riskPct).toBe(0.5);
    expect(adjusted.riskFraming.sizeAdjustment).toBe(1);
  });

  it("stacks multiple matching backtest risk rules in sequence", () => {
    const input = createExecutionInput({
      snapshotOverrides: {
        instrument: "NAS100",
      },
      marketOverrides: {
        session: {
          session: "ny_open",
          marketOpen: true,
          confidence: 90,
        },
      },
      decisionCoreOverrides: {
        clarity: {
          level: "high",
          score: 84,
          conflictScore: 10,
          alignment: 90,
        },
        environment: {
          state: "favorable",
          score: 78,
          confidence: 80,
        },
      },
      setupCoreOverrides: {
        setup: {
          type: "breakout_continuation",
          direction: "long",
          confidence: 84,
        },
        quality: {
          score: 84,
          grade: "A",
          confidence: 84,
        },
      },
    });

    const executionPlan = createExecutionPlan(input);
    const adjusted = applyBacktestRiskOverrides({
      executionPlan,
      playbook: input.playbook,
      instrument: input.snapshot.instrument,
      session: input.market.session.session,
      setupType: input.setupCore.setup.type,
      executionStatus: executionPlan.executionStatus.executionStatus,
      behaviorState: "clear",
      behavior: input.behavior,
      qualityGrade: input.setupCore.quality.grade,
      clarityLevel: input.decisionCore.clarity.level,
      environmentState: input.decisionCore.environment.state,
      overrides: {
        rules: [
          {
            instrument: "NAS100",
            setupTypes: ["breakout_continuation"],
            riskModes: ["aggressive"],
            riskMultiplier: 0.8,
          },
          {
            instrument: "NAS100",
            sessions: ["ny_open"],
            setupTypes: ["breakout_continuation"],
            riskModes: ["aggressive"],
            riskMultiplier: 0.5,
          },
        ],
      },
    });

    expect(executionPlan.riskFraming.riskPct).toBe(0.75);
    expect(adjusted.riskFraming.riskPct).toBe(0.3);
    expect(adjusted.riskFraming.sizeAdjustment).toBe(0.6);
  });

  it("supports selective backtest risk shaping by quality, clarity, and environment", () => {
    const mediumInput = createExecutionInput({
      snapshotOverrides: {
        instrument: "NAS100",
      },
      marketOverrides: {
        session: {
          session: "ny_open",
          marketOpen: true,
          confidence: 90,
        },
      },
      decisionCoreOverrides: {
        clarity: {
          level: "medium",
          score: 68,
          conflictScore: 18,
          alignment: 71,
        },
        environment: {
          state: "neutral",
          score: 58,
          confidence: 66,
        },
      },
      setupCoreOverrides: {
        setup: {
          type: "breakout_continuation",
          direction: "long",
          confidence: 77,
        },
        quality: {
          score: 76,
          grade: "B",
          confidence: 76,
        },
      },
    });

    const highInput = createExecutionInput({
      snapshotOverrides: {
        instrument: "NAS100",
      },
      marketOverrides: {
        session: {
          session: "ny_open",
          marketOpen: true,
          confidence: 90,
        },
      },
      decisionCoreOverrides: {
        clarity: {
          level: "high",
          score: 84,
          conflictScore: 9,
          alignment: 90,
        },
        environment: {
          state: "favorable",
          score: 77,
          confidence: 82,
        },
      },
      setupCoreOverrides: {
        setup: {
          type: "breakout_continuation",
          direction: "long",
          confidence: 84,
        },
        quality: {
          score: 85,
          grade: "A",
          confidence: 84,
        },
      },
    });

    const mediumAdjusted = applyBacktestRiskOverrides({
      executionPlan: createExecutionPlan(mediumInput),
      playbook: mediumInput.playbook,
      instrument: mediumInput.snapshot.instrument,
      session: mediumInput.market.session.session,
      setupType: mediumInput.setupCore.setup.type,
      executionStatus: createExecutionPlan(mediumInput).executionStatus.executionStatus,
      behaviorState: "clear",
      behavior: mediumInput.behavior,
      qualityGrade: mediumInput.setupCore.quality.grade,
      clarityLevel: mediumInput.decisionCore.clarity.level,
      environmentState: mediumInput.decisionCore.environment.state,
      overrides: {
        rules: [
          {
            instrument: "NAS100",
            sessions: ["ny_open"],
            setupTypes: ["breakout_continuation"],
            qualityGrades: ["B", "C", "D"],
            clarityLevels: ["medium"],
            environmentStates: ["neutral"],
            riskMultiplier: 0.67,
          },
        ],
      },
    });
    const highAdjusted = applyBacktestRiskOverrides({
      executionPlan: createExecutionPlan(highInput),
      playbook: highInput.playbook,
      instrument: highInput.snapshot.instrument,
      session: highInput.market.session.session,
      setupType: highInput.setupCore.setup.type,
      executionStatus: createExecutionPlan(highInput).executionStatus.executionStatus,
      behaviorState: "clear",
      behavior: highInput.behavior,
      qualityGrade: highInput.setupCore.quality.grade,
      clarityLevel: highInput.decisionCore.clarity.level,
      environmentState: highInput.decisionCore.environment.state,
      overrides: {
        rules: [
          {
            instrument: "NAS100",
            sessions: ["ny_open"],
            setupTypes: ["breakout_continuation"],
            qualityGrades: ["B", "C", "D"],
            clarityLevels: ["medium"],
            environmentStates: ["neutral"],
            riskMultiplier: 0.67,
          },
        ],
      },
    });

    expect(mediumAdjusted.riskFraming.riskPct).toBe(0.19);
    expect(highAdjusted.riskFraming.riskPct).toBe(0.75);
  });

  it("supports selective backtest risk shaping by execution status", () => {
    const input = createExecutionInput({
      playbookOverrides: {
        baseRules: {
          ...DEFAULT_BASE_RULES,
          blockedTradeValidContexts: [],
        },
      },
      snapshotOverrides: {
        instrument: "NAS100",
      },
      marketOverrides: {
        session: {
          session: "london_ny_overlap",
          marketOpen: true,
          confidence: 90,
        },
      },
      decisionCoreOverrides: {
        clarity: {
          level: "high",
          score: 84,
          conflictScore: 9,
          alignment: 90,
        },
        environment: {
          state: "favorable",
          score: 77,
          confidence: 82,
        },
      },
      setupCoreOverrides: {
        setup: {
          type: "breakout_continuation",
          direction: "long",
          confidence: 84,
        },
        quality: {
          score: 85,
          grade: "A",
          confidence: 84,
        },
      },
    });

    const executionPlan = createExecutionPlan(input);
    const cautionPlan = {
      ...executionPlan,
      executionStatus: {
        ...executionPlan.executionStatus,
        executionStatus: "caution" as const,
      },
    };
    const cautionAdjusted = applyBacktestRiskOverrides({
      executionPlan: cautionPlan,
      playbook: input.playbook,
      instrument: input.snapshot.instrument,
      session: input.market.session.session,
      setupType: input.setupCore.setup.type,
      executionStatus: "caution",
      behaviorState: "caution",
      behavior: input.behavior,
      qualityGrade: input.setupCore.quality.grade,
      clarityLevel: input.decisionCore.clarity.level,
      environmentState: input.decisionCore.environment.state,
      overrides: {
        rules: [
          {
            instrument: "NAS100",
            sessions: ["london_ny_overlap"],
            setupTypes: ["breakout_continuation"],
            executionStatuses: ["caution"],
            riskPct: 0.4,
          },
        ],
      },
    });
    const allowedAdjusted = applyBacktestRiskOverrides({
      executionPlan,
      playbook: input.playbook,
      instrument: input.snapshot.instrument,
      session: input.market.session.session,
      setupType: input.setupCore.setup.type,
      executionStatus: "allowed",
      behaviorState: "clear",
      behavior: input.behavior,
      qualityGrade: input.setupCore.quality.grade,
      clarityLevel: input.decisionCore.clarity.level,
      environmentState: input.decisionCore.environment.state,
      overrides: {
        rules: [
          {
            instrument: "NAS100",
            sessions: ["london_ny_overlap"],
            setupTypes: ["breakout_continuation"],
            executionStatuses: ["caution"],
            riskPct: 0.4,
          },
        ],
      },
    });

    expect(cautionAdjusted.riskFraming.riskPct).toBe(0.4);
    expect(allowedAdjusted.riskFraming.riskPct).toBe(0.5);
  });

  it("supports selective backtest risk shaping after a loss streak begins", () => {
    const input = createExecutionInput({
      behaviorOverrides: {
        consecutiveLosses: 1,
        dailyLossPct: 0.8,
      },
    });

    const executionPlan = createExecutionPlan(input);
    const adjusted = applyBacktestRiskOverrides({
      executionPlan,
      playbook: input.playbook,
      instrument: input.snapshot.instrument,
      session: input.market.session.session,
      setupType: input.setupCore.setup.type,
      executionStatus: executionPlan.executionStatus.executionStatus,
      behaviorState: "caution",
      behavior: input.behavior,
      qualityGrade: input.setupCore.quality.grade,
      clarityLevel: input.decisionCore.clarity.level,
      environmentState: input.decisionCore.environment.state,
      overrides: {
        rules: [
          {
            minConsecutiveLosses: 1,
            riskMultiplier: 0.5,
          },
        ],
      },
    });

    expect(executionPlan.riskFraming.riskPct).toBe(0.25);
    expect(adjusted.riskFraming.riskPct).toBe(0.13);
  });
});
