import { describe, expect, it } from "vitest";

import { buildRiskFraming } from "@/lib/trading/execution";
import { createDefaultTradingPlaybook } from "@/lib/trading/playbook";

import { createExecutionInput } from "./helpers/tradingOperationalFixtures";

const DEFAULT_BASE_RULES = createDefaultTradingPlaybook().baseRules;

describe("trading risk framing engine", () => {
  it("returns normal framing for an aligned trade-valid setup", () => {
    const input = createExecutionInput({
      decisionCoreOverrides: {
        clarity: {
          level: "high",
          score: 82,
          conflictScore: 12,
          alignment: 88,
        },
      },
      setupCoreOverrides: {
        quality: {
          score: 74,
          grade: "B",
          confidence: 78,
        },
      },
    });

    const result = buildRiskFraming(input);

    expect(result).toEqual({
      riskPct: 0.5,
      sizeAdjustment: 1,
      riskMode: "normal",
    });
  });

  it("returns reduced framing when behavior is in caution", () => {
    const input = createExecutionInput({
      behaviorOverrides: {
        dailyLossPct: 1.3,
        openRiskPct: 1.1,
      },
    });

    const result = buildRiskFraming(input);

    expect(result.riskMode).toBe("reduced");
    expect(result.sizeAdjustment).toBeLessThan(1);
  });

  it("returns 1.0% aggressive framing for high-edge trades", () => {
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

    const result = buildRiskFraming(input);

    expect(result).toEqual({
      riskPct: 1,
      sizeAdjustment: 2,
      riskMode: "aggressive",
    });
  });

  it("reduces NAS100 breakout continuation exposure softly without changing signal logic", () => {
    const input = createExecutionInput({
      snapshotOverrides: {
        instrument: "NAS100",
        marketType: "equities",
      },
      marketOverrides: {
        session: {
          session: "late_us",
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
          triggerLevel: 103.9,
          invalidationLevel: 102.6,
          confidence: 84,
        },
        quality: {
          score: 84,
          grade: "A",
          confidence: 84,
        },
      },
    });

    const result = buildRiskFraming(input);

    expect(result).toEqual({
      riskPct: 0.75,
      sizeAdjustment: 1.5,
      riskMode: "aggressive",
    });
  });

  it("stacks a second NAS100 overlap reduction only in london_ny_overlap", () => {
    const input = createExecutionInput({
      playbookOverrides: {
        baseRules: {
          ...DEFAULT_BASE_RULES,
          blockedTradeValidContexts: [],
        },
      },
      snapshotOverrides: {
        instrument: "NAS100",
        marketType: "equities",
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
          triggerLevel: 103.9,
          invalidationLevel: 102.6,
          confidence: 84,
        },
        quality: {
          score: 84,
          grade: "A",
          confidence: 84,
        },
      },
    });

    const result = buildRiskFraming(input);

    expect(result).toEqual({
      riskPct: 0.5,
      sizeAdjustment: 1,
      riskMode: "aggressive",
    });
  });

  it("halves US500 pre-market exposure while keeping the trade available", () => {
    const input = createExecutionInput({
      snapshotOverrides: {
        instrument: "US500",
        marketType: "equities",
      },
      marketOverrides: {
        session: {
          session: "pre_market",
          marketOpen: true,
          confidence: 90,
        },
      },
      decisionCoreOverrides: {
        clarity: {
          level: "high",
          score: 82,
          conflictScore: 12,
          alignment: 88,
        },
      },
      setupCoreOverrides: {
        quality: {
          score: 74,
          grade: "B",
          confidence: 78,
        },
      },
    });

    const result = buildRiskFraming(input);

    expect(result).toEqual({
      riskPct: 0.25,
      sizeAdjustment: 0.5,
      riskMode: "normal",
    });
  });

  it("halves XAUUSD breakout continuation exposure in london_open", () => {
    const input = createExecutionInput({
      snapshotOverrides: {
        instrument: "XAUUSD",
        marketType: "forex",
      },
      marketOverrides: {
        session: {
          session: "london_open",
          marketOpen: true,
          confidence: 90,
        },
      },
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
        setup: {
          type: "breakout_continuation",
          direction: "long",
          triggerLevel: 2035.4,
          invalidationLevel: 2028.8,
          confidence: 78,
        },
        quality: {
          score: 74,
          grade: "B",
          confidence: 78,
        },
      },
    });

    const result = buildRiskFraming(input);

    expect(result).toEqual({
      riskPct: 0.25,
      sizeAdjustment: 0.5,
      riskMode: "normal",
    });
  });

  it("halves BTCUSD breakout continuation exposure in weekend_drift even for aggressive trades", () => {
    const input = createExecutionInput({
      playbookOverrides: {
        baseRules: {
          ...DEFAULT_BASE_RULES,
          blockedTradeValidContexts: [],
        },
      },
      snapshotOverrides: {
        instrument: "BTCUSD",
        marketType: "crypto",
      },
      marketOverrides: {
        session: {
          session: "weekend_drift",
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
          triggerLevel: 68350,
          invalidationLevel: 67120,
          confidence: 84,
        },
        quality: {
          score: 84,
          grade: "A",
          confidence: 84,
        },
      },
    });

    const result = buildRiskFraming(input);

    expect(result).toEqual({
      riskPct: 0.5,
      sizeAdjustment: 1,
      riskMode: "aggressive",
    });
  });
});
