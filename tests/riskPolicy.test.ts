import { describe, expect, it } from "vitest";
import { deriveRiskPolicy, evaluateRiskPolicy } from "@/lib/signalcore/riskPolicy";

describe("riskPolicy", () => {
  it("derives balanced defaults for investing mode", () => {
    const policy = deriveRiskPolicy({
      mode: "investing",
      riskProfile: "Balanced",
      horizon: "Long",
      userSettings: null,
      plan: null,
    });
    expect(policy.level).toBe("balanced");
    expect(policy.maxSinglePositionPct).toBeGreaterThan(0);
    expect(policy.maxTop3ConcentrationPct).toBeGreaterThan(policy.maxSinglePositionPct);
    expect(policy.maxDrawdownPct).toBeGreaterThan(0);
    expect(policy.maxExposurePct).toBeGreaterThan(0);
  });

  it("blocks when concentration breaches hard limit", () => {
    const policy = deriveRiskPolicy({
      mode: "investing",
      riskProfile: "Conservative",
      horizon: "Long",
      userSettings: null,
      plan: null,
    });

    const evalResult = evaluateRiskPolicy({
      policy,
      diagnostics: {
        concentrationTop1Pct: policy.maxSinglePositionPct + 8,
        concentrationTop3Pct: policy.maxTop3ConcentrationPct + 10,
        cashDragPct: 5,
        pricing: { coveragePct: 95, missingSymbols: [] },
        riskLeaks: [],
      },
      pressureScore: 40,
      maxDrawdownPct: -5,
      hasPlan: true,
      hasHoldings: true,
    });

    expect(evalResult.status).toBe("block");
    expect(evalResult.blocked).toBe(true);
    expect(evalResult.breaches.length).toBeGreaterThan(0);
  });

  it("returns not_applicable without plan/holdings", () => {
    const policy = deriveRiskPolicy({
      mode: "investing",
      riskProfile: "Balanced",
      horizon: "Long",
      userSettings: null,
      plan: null,
    });
    const evalResult = evaluateRiskPolicy({
      policy,
      diagnostics: {},
      pressureScore: 0,
      maxDrawdownPct: 0,
      hasPlan: false,
      hasHoldings: false,
    });
    expect(evalResult.status).toBe("not_applicable");
    expect(evalResult.blocked).toBe(false);
  });

  it("still blocks investing when cash-derived exposure breaches the policy limit", () => {
    const policy = deriveRiskPolicy({
      mode: "investing",
      riskProfile: "Balanced",
      horizon: "Long",
      userSettings: null,
      plan: null,
    });
    const evalResult = evaluateRiskPolicy({
      policy,
      diagnostics: {
        concentrationTop1Pct: 18,
        concentrationTop3Pct: 36,
        cashDragPct: 0,
        pricing: { coveragePct: 95, missingSymbols: [] },
        riskLeaks: [],
      },
      pressureScore: 42,
      maxDrawdownPct: -5,
      hasPlan: true,
      hasHoldings: true,
    });

    expect(evalResult.status).toBe("block");
    expect(evalResult.blocked).toBe(true);
    expect(evalResult.breaches.some((breach) => breach.key === "exposure_limit")).toBe(true);
    expect(evalResult.snapshot.exposurePct).toBe(100);
  });
});
