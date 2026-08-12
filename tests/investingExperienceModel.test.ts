import { describe, expect, it } from "vitest";

import {
  buildFinancialDisplay,
  buildInvestingExperienceModel,
  formatEur,
} from "@/app/app/investing/investingExperienceModel";

describe("investing experience model", () => {
  it("does not format unavailable portfolio or cash truth as zero", () => {
    const model = buildInvestingExperienceModel({
      portfolio: {
        accountId: "account-a",
        environment: "paper",
        cashEur: 0,
        totalEur: 0,
        cash: { amountEur: 0, availability: "UNAVAILABLE", asOf: null },
        valuation: { totalEur: 0, availability: "UNAVAILABLE", source: "empty" },
      },
    });

    expect(model.portfolioValue.text).toBe("Dados indisponiveis neste momento");
    expect(model.cash.text).toBe("Dados indisponiveis neste momento");
    expect(model.portfolioValue.text).not.toBe(formatEur(0));
    expect(model.cash.text).not.toBe(formatEur(0));
  });

  it("renders explicit real zero cash as valid EUR 0", () => {
    const model = buildInvestingExperienceModel({
      portfolio: {
        accountId: "account-a",
        environment: "paper",
        cash: { amountEur: 0, availability: "REAL", asOf: "2026-08-02T00:00:00.000Z" },
        valuation: { totalEur: 0, availability: "REAL", source: "cash_only" },
      },
    });

    expect(model.cash.text).toBe(formatEur(0));
    expect(model.cash.label).toBe("Real");
    expect(model.portfolioValue.text).toBe(formatEur(0));
    expect(model.portfolioValue.label).toBe("Real - cash only");
  });

  it("labels real, stale, and estimated values without promoting them", () => {
    expect(buildFinancialDisplay({ value: 10, availability: "REAL" })).toMatchObject({ text: formatEur(10), label: "Real" });
    expect(buildFinancialDisplay({ value: 10, availability: "STALE" })).toMatchObject({ text: formatEur(10), label: "Stale" });
    expect(buildFinancialDisplay({ value: 10, availability: "ESTIMATED" })).toMatchObject({ text: formatEur(10), label: "Estimated" });
  });

  it("does not invent plan targets or performance from non-canonical legacy plan fields", () => {
    const model = buildInvestingExperienceModel({ plan: { value: null } });

    expect(model.planTarget).toBe("Plan target not yet available");
    expect(model.planTarget).not.toContain("50");
    expect(model.hasPlan).toBe(false);
    expect(model.performanceText).toBe("Performance not yet available");
    expect(model.performanceText).not.toBe("0%");
  });

  it("renders missing and ambiguous canonical plan states without a selected target", () => {
    const missing = buildInvestingExperienceModel({ plan: { availability: "UNAVAILABLE", reason: "plan_missing", value: null } });
    const ambiguous = buildInvestingExperienceModel({
      plan: { availability: "UNAVAILABLE", reason: "investing_plan_ambiguous", value: null },
    });

    expect(missing.planName).toBe("Plan not available");
    expect(missing.planTargetAvailable).toBe(false);
    expect(ambiguous.planName).toBe("Plan unavailable");
    expect(ambiguous.planTargetAvailable).toBe(false);
  });

  it("shows legacy text goal only as summary and keeps structured target unavailable", () => {
    const model = buildInvestingExperienceModel({
      plan: {
        availability: "AVAILABLE",
        value: {
          id: "plan-a",
          mode: "investing",
          status: "active",
          version: 1,
          summary: "Long-term plan",
          structured: { availability: "UNAVAILABLE", schemaVersion: null, reason: "structured_plan_missing" },
        },
      },
    });

    expect(model.hasPlan).toBe(true);
    expect(model.planName).toBe("Long-term plan");
    expect(model.planTarget).toBe("Plan target not yet available");
    expect(model.planDetails).toEqual([{ label: "Version", value: "1" }]);
  });

  it("displays only present structured v1 plan fields", () => {
    const model = buildInvestingExperienceModel({
      plan: {
        availability: "AVAILABLE",
        value: {
          id: "plan-a",
          mode: "investing",
          status: "active",
          version: 2,
          label: "Core plan",
          structured: {
            availability: "AVAILABLE",
            schemaVersion: 1,
            reason: null,
            objective: {
              targetAmount: { amount: 75000, currency: "EUR" },
              timeframeMonths: 120,
            },
            risk: { profile: "Balanced" },
          },
        },
      },
    });

    expect(model.planName).toBe("Core plan");
    expect(model.planTarget).toBe(formatEur(75000));
    expect(model.planDetails).toEqual([
      { label: "Version", value: "2" },
      { label: "Timeframe", value: "120 months" },
      { label: "Risk", value: "Balanced" },
    ]);
    expect(JSON.stringify(model.planDetails)).not.toContain("Long");
  });

  it("does not present unavailable decisions as recommendations", () => {
    const model = buildInvestingExperienceModel({
      derived: { decisionAvailability: "UNAVAILABLE", customerDecision: { summary: { title: "Buy now" } } },
    });

    expect(model.decision.actionable).toBe(false);
    expect(model.decision.text).toBe("Decision data unavailable. Refresh required.");
    expect(model.decision.text).not.toContain("Buy now");
  });

  it("marks estimated decision guidance explicitly", () => {
    const model = buildInvestingExperienceModel({
      derived: { decisionAvailability: "ESTIMATED", customerDecision: { summary: { title: "Review allocation" } } },
    });

    expect(model.decision.actionable).toBe(true);
    expect(model.decision.label).toBe("Estimated");
    expect(model.decision.text).toBe("Estimated guidance only");
  });

  it("uses account environment labels without treating no-account as paper active", () => {
    expect(buildInvestingExperienceModel({ portfolio: { accountId: null, environment: "paper" } }).environment).toBe("No active account");
    expect(buildInvestingExperienceModel({ portfolio: { accountId: "a", environment: "paper" } }).environment).toBe("Paper");
    expect(buildInvestingExperienceModel({ portfolio: { accountId: "a", environment: "simulation" } }).environment).toBe("Simulation");
    expect(buildInvestingExperienceModel({ portfolio: { accountId: "a", environment: "live" } }).environment).toBe("Live");
  });

  it("exposes only positive-quantity holdings", () => {
    const model = buildInvestingExperienceModel({
      portfolio: {
        items: [
          { symbol: "VWCE", qty: 0, valueEur: 100, valuationAvailability: "REAL" },
          { symbol: "IWDA", qty: 2, valueEur: 200, valuationAvailability: "REAL" },
        ],
      },
    });

    expect(model.items.map((item) => item.symbol)).toEqual(["IWDA"]);
  });
});
