import { describe, expect, it } from "vitest";

import {
  classifyResearchFailure,
  decideResearchRun,
  rankResearchOpportunity,
} from "@/lib/trading/research";

import { createMetricSummary } from "./helpers/tradingResearchFixtures";

describe("trading research ranking and forensics", () => {
  it("ranks stronger opportunities above weaker ones", () => {
    const stronger = rankResearchOpportunity({
      aggregate: {
        baseline: createMetricSummary({ expectancy: 0.2, profitFactor: 1.5, maxDrawdown: 4 }),
        current: createMetricSummary({ expectancy: 0.24, profitFactor: 1.66, maxDrawdown: 3.5 }),
      },
      crisis: {
        baseline: createMetricSummary({ expectancy: -0.04, profitFactor: 0.98, maxDrawdown: 5.1 }),
        current: createMetricSummary({ expectancy: 0.01, profitFactor: 1.08, maxDrawdown: 4.6 }),
      },
      walkForward: {
        baseline: createMetricSummary({ expectancy: 0.05, profitFactor: 1.01, maxDrawdown: 2.4 }),
        current: createMetricSummary({ expectancy: 0.11, profitFactor: 1.12, maxDrawdown: 2.1 }),
        affectedInstruments: ["NAS100"],
      },
      robustness: {
        holdout: {
          baseline: createMetricSummary({ expectancy: 0.03, profitFactor: 1.01, maxDrawdown: 2.5 }),
          current: createMetricSummary({ expectancy: 0.05, profitFactor: 1.05, maxDrawdown: 2.2 }),
        },
        costStress: {
          baseline: createMetricSummary({ expectancy: 0.02, profitFactor: 1.01, maxDrawdown: 2.6 }),
          current: createMetricSummary({ expectancy: 0.03, profitFactor: 1.03, maxDrawdown: 2.4 }),
        },
      },
      gates: {
        aggregateExpectancyStable: true,
        aggregateProfitFactorStable: true,
        aggregateDrawdownStable: true,
        crisisExpectancyStable: true,
        crisisProfitFactorStable: true,
        crisisDrawdownStable: true,
        walkForwardExpectancyStable: true,
        walkForwardProfitFactorStable: true,
        walkForwardDrawdownStable: true,
        walkForwardBreakEvenOrBetter: true,
        holdoutExpectancyStable: true,
        holdoutProfitFactorStable: true,
        holdoutDrawdownStable: true,
        holdoutBreakEvenOrBetter: true,
        costStressExpectancyStable: true,
        costStressProfitFactorStable: true,
        costStressDrawdownStable: true,
        costStressBreakEvenOrBetter: true,
        aggregateImproved: true,
        crisisImproved: true,
        walkForwardImproved: true,
        promotionThresholdMet: true,
        allHardGatesPass: true,
      },
    });
    const weaker = rankResearchOpportunity({
      aggregate: {
        baseline: createMetricSummary({ expectancy: 0.2, profitFactor: 1.5, maxDrawdown: 4 }),
        current: createMetricSummary({ expectancy: 0.205, profitFactor: 1.51, maxDrawdown: 3.95 }),
      },
      crisis: {
        baseline: createMetricSummary({ expectancy: -0.04, profitFactor: 0.98, maxDrawdown: 5.1 }),
        current: createMetricSummary({ expectancy: -0.035, profitFactor: 0.99, maxDrawdown: 5.05 }),
      },
      walkForward: {
        baseline: createMetricSummary({ expectancy: 0.05, profitFactor: 1.01, maxDrawdown: 2.4 }),
        current: createMetricSummary({ expectancy: 0.051, profitFactor: 1.02, maxDrawdown: 2.38 }),
        affectedInstruments: ["NAS100"],
      },
      robustness: null,
      gates: {
        aggregateExpectancyStable: true,
        aggregateProfitFactorStable: true,
        aggregateDrawdownStable: true,
        crisisExpectancyStable: true,
        crisisProfitFactorStable: true,
        crisisDrawdownStable: true,
        walkForwardExpectancyStable: true,
        walkForwardProfitFactorStable: true,
        walkForwardDrawdownStable: true,
        walkForwardBreakEvenOrBetter: true,
        costStressBreakEvenOrBetter: false,
        aggregateImproved: true,
        crisisImproved: false,
        walkForwardImproved: true,
        promotionThresholdMet: false,
        allHardGatesPass: true,
      },
    });

    expect(stronger.score).toBeGreaterThan(weaker.score);
    expect(stronger.band).not.toBe("weak");
  });

  it("classifies common runtime and validation failures deterministically", () => {
    expect(
      classifyResearchFailure({
        reason: "Recovered stale or hung run without complete artifact contract.",
      }).category,
    ).toBe("artifact_contract");
    expect(
      classifyResearchFailure({
        reason: "EPERM: operation not permitted, rename research-lock.json.tmp -> research-lock.json",
      }).category,
    ).toBe("runtime_os");
    const validationDecision = decideResearchRun({
      runId: "run-1",
      taskId: "task-1",
      gates: {
        aggregateExpectancyStable: false,
        aggregateProfitFactorStable: true,
        aggregateDrawdownStable: true,
        crisisExpectancyStable: true,
        crisisProfitFactorStable: true,
        crisisDrawdownStable: true,
        walkForwardExpectancyStable: true,
        walkForwardProfitFactorStable: true,
        walkForwardDrawdownStable: true,
        walkForwardBreakEvenOrBetter: true,
        aggregateImproved: false,
        crisisImproved: false,
        walkForwardImproved: false,
        promotionThresholdMet: false,
        allHardGatesPass: false,
      },
      promotedMetrics: {},
    });
    expect(validationDecision.failure_forensics?.category).toBe("validation_gate");
    expect(validationDecision.reason).toContain("aggregate expectancy degraded");
  });
});
