import { describe, expect, it } from "vitest";

import { runPlaybookCheck } from "@/lib/trading/playbook";

import { createOperationalInput } from "./helpers/tradingOperationalFixtures";

describe("trading playbook check engine", () => {
  it("passes when trade-valid context is aligned with the playbook", () => {
    const input = createOperationalInput({
      playbookOverrides: {
        baseRules: {
          allowedSetups: ["breakout_continuation"],
          blockedSetups: ["none"],
          preferredRegimes: ["trending"],
          blockedRegimes: ["noisy"],
          riskPerTradePct: 0.5,
          maxDailyLossPct: 2,
          maxOpenRiskPct: 1.5,
          maxTrades: 4,
          maxConsecutiveLosses: 2,
          chasePolicy: "never",
          invalidationPolicy: "strict",
          noTradeIf: [],
          behaviorGuards: {
            blockChasing: true,
            blockRevengeTrading: true,
          },
        },
      },
    });
    input.market.regime.state = "trending";
    input.setupCore.setup = {
      type: "breakout_continuation",
      direction: "long",
      triggerLevel: 103.9,
      invalidationLevel: 102.6,
      confidence: 84,
    };

    const result = runPlaybookCheck(input);

    expect(result.sessionActive).toBe(true);
    expect(result.rulesAligned).toBe(true);
    expect(result.executionAllowed).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it("fails when a technically valid trade is outside the playbook", () => {
    const input = createOperationalInput({
      playbookOverrides: {
        baseRules: {
          allowedSetups: ["trend_pullback"],
          blockedSetups: ["failed_breakout"],
          preferredRegimes: ["trending"],
          blockedRegimes: ["noisy"],
          riskPerTradePct: 0.5,
          maxDailyLossPct: 2,
          maxOpenRiskPct: 1.5,
          maxTrades: 4,
          maxConsecutiveLosses: 2,
          chasePolicy: "never",
          invalidationPolicy: "strict",
          noTradeIf: [],
          behaviorGuards: {
            blockChasing: true,
            blockRevengeTrading: true,
          },
        },
      },
    });
    input.market.regime.state = "trending";
    input.setupCore.setup = {
      type: "breakout_continuation",
      direction: "long",
      triggerLevel: 103.9,
      invalidationLevel: 102.6,
      confidence: 84,
    };

    const result = runPlaybookCheck(input);

    expect(result.rulesAligned).toBe(false);
    expect(result.executionAllowed).toBe(false);
    expect(result.reasons.some((reason) => reason.includes("outside the allowed playbook set"))).toBe(true);
  });

  it("blocks configured market-session contexts even when the technical state is trade-valid", () => {
    const input = createOperationalInput({
      marketOverrides: {
        instrument: "NAS100",
        session: {
          marketOpen: true,
          session: "pre_market",
          confidence: 91,
        },
      },
    });
    input.snapshot.instrument = "NAS100";

    const result = runPlaybookCheck(input);

    expect(result.rulesAligned).toBe(false);
    expect(result.executionAllowed).toBe(false);
    expect(result.reasons).toContain(
      "NAS100 is blocked during pre-market in the current playbook calibration.",
    );
  });

  it("blocks the current engine-elevation crisis contexts", () => {
    const cases = [
      {
        instrument: "GBPUSD",
        session: "london_open" as const,
        setupType: "breakout_continuation" as const,
        reason: "GBPUSD is blocked during London open after current engine elevation validation.",
      },
      {
        instrument: "NAS100",
        session: "london_ny_overlap" as const,
        setupType: "breakout_continuation" as const,
        reason: "NAS100 overlap breakouts are blocked after current crisis validation.",
      },
      {
        instrument: "XAUUSD",
        session: "late_us" as const,
        setupType: "breakout_continuation" as const,
        reason: "XAUUSD late US breakouts are blocked after current crisis validation.",
      },
      {
        instrument: "BTCUSD",
        session: "weekend_drift" as const,
        setupType: "breakout_continuation" as const,
        reason: "BTCUSD weekend-drift breakouts are blocked after current crisis validation.",
      },
    ];

    for (const item of cases) {
      const input = createOperationalInput({
        marketOverrides: {
          instrument: item.instrument,
          session: {
            marketOpen: true,
            session: item.session,
            confidence: 91,
          },
        },
        setupCoreOverrides: {
          setup: {
            type: item.setupType,
            direction: "long",
            triggerLevel: 103.9,
            invalidationLevel: 102.6,
            confidence: 84,
          },
        },
      });
      input.snapshot.instrument = item.instrument;

      const result = runPlaybookCheck(input);

      expect(result.rulesAligned).toBe(false);
      expect(result.executionAllowed).toBe(false);
      expect(result.reasons).toContain(item.reason);
    }
  });

  it("supports selective blocked contexts by quality and clarity without blocking stronger variants", () => {
    const blockedInput = createOperationalInput({
      marketOverrides: {
        instrument: "NAS100",
        session: {
          marketOpen: true,
          session: "london_ny_overlap",
          confidence: 91,
        },
      },
      playbookOverrides: {
        baseRules: {
          allowedSetups: ["breakout_continuation"],
          blockedSetups: ["none"],
          blockedTradeValidContexts: [
            {
              instrument: "NAS100",
              sessions: ["london_ny_overlap"],
              setupTypes: ["breakout_continuation"],
              qualityGrades: ["B", "C", "D"],
              clarityLevels: ["medium"],
              environmentStates: ["neutral"],
              reason: "NAS100 overlap is blocked only when conviction falls out of the top tier.",
            },
          ],
          preferredRegimes: ["trending"],
          blockedRegimes: ["noisy"],
          riskPerTradePct: 0.5,
          maxDailyLossPct: 2,
          maxOpenRiskPct: 1.5,
          maxTrades: 4,
          maxConsecutiveLosses: 2,
          chasePolicy: "never",
          invalidationPolicy: "strict",
          noTradeIf: [],
          behaviorGuards: {
            blockChasing: true,
            blockRevengeTrading: true,
          },
        },
      },
      decisionCoreOverrides: {
        clarity: {
          level: "medium",
          score: 66,
          conflictScore: 18,
          alignment: 68,
        },
        environment: {
          state: "neutral",
          score: 64,
          confidence: 66,
        },
      },
      setupCoreOverrides: {
        quality: {
          score: 74,
          grade: "B",
          confidence: 75,
        },
      },
    });
    blockedInput.snapshot.instrument = "NAS100";
    blockedInput.market.regime.state = "trending";

    const strongInput = createOperationalInput({
      marketOverrides: {
        instrument: "NAS100",
        session: {
          marketOpen: true,
          session: "london_ny_overlap",
          confidence: 91,
        },
      },
      playbookOverrides: {
        baseRules: {
          allowedSetups: ["breakout_continuation"],
          blockedSetups: ["none"],
          blockedTradeValidContexts: [
            {
              instrument: "NAS100",
              sessions: ["london_ny_overlap"],
              setupTypes: ["breakout_continuation"],
              qualityGrades: ["B", "C", "D"],
              clarityLevels: ["medium"],
              environmentStates: ["neutral"],
            },
          ],
          preferredRegimes: ["trending"],
          blockedRegimes: ["noisy"],
          riskPerTradePct: 0.5,
          maxDailyLossPct: 2,
          maxOpenRiskPct: 1.5,
          maxTrades: 4,
          maxConsecutiveLosses: 2,
          chasePolicy: "never",
          invalidationPolicy: "strict",
          noTradeIf: [],
          behaviorGuards: {
            blockChasing: true,
            blockRevengeTrading: true,
          },
        },
      },
      decisionCoreOverrides: {
        clarity: {
          level: "high",
          score: 82,
          conflictScore: 10,
          alignment: 88,
        },
        environment: {
          state: "favorable",
          score: 76,
          confidence: 79,
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
    strongInput.snapshot.instrument = "NAS100";
    strongInput.market.regime.state = "trending";

    const blockedResult = runPlaybookCheck(blockedInput);
    const strongResult = runPlaybookCheck(strongInput);

    expect(blockedResult.executionAllowed).toBe(false);
    expect(blockedResult.reasons).toContain(
      "NAS100 overlap is blocked only when conviction falls out of the top tier.",
    );
    expect(strongResult.executionAllowed).toBe(true);
  });

  it("treats mean-reverting reclaim and reversal setups as preferred playbook contexts", () => {
    const input = createOperationalInput({
      marketOverrides: {
        regime: {
          state: "mean_reverting",
          score: 74,
          confidence: 72,
        },
      },
      setupCoreOverrides: {
        setup: {
          type: "range_reclaim",
          direction: "short",
          triggerLevel: 101.8,
          invalidationLevel: 103.1,
          confidence: 76,
        },
      },
      playbookOverrides: {
        baseRules: {
          allowedSetups: ["range_reclaim"],
          blockedSetups: ["none"],
          preferredRegimes: ["trending", "compression", "ranging"],
          blockedRegimes: ["noisy"],
          riskPerTradePct: 0.5,
          maxDailyLossPct: 2,
          maxOpenRiskPct: 1.5,
          maxTrades: 4,
          maxConsecutiveLosses: 2,
          chasePolicy: "never",
          invalidationPolicy: "strict",
          noTradeIf: [],
          behaviorGuards: {
            blockChasing: true,
            blockRevengeTrading: true,
          },
        },
      },
    });

    const result = runPlaybookCheck(input);

    expect(result.rulesAligned).toBe(true);
    expect(result.executionAllowed).toBe(true);
  });
});
