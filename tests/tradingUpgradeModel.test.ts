import { describe, expect, it } from "vitest";

import { buildTradingUpgradeModel } from "@/components/trading/tradingUpgradeModel";

describe("trading upgrade model", () => {
  it("builds execution upgrade copy with source-aware pricing", () => {
    const model = buildTradingUpgradeModel("execution");

    expect(model.title).toContain("Execution");
    expect(model.pricingHref).toContain("source=trading_execution_gate");
    expect(model.proBullets).toEqual(
      expect.arrayContaining(["Execution cockpit with trigger, invalidation, and target framing"]),
    );
  });

  it("builds alerts upgrade copy without generic pricing language", () => {
    const model = buildTradingUpgradeModel("alerts");

    expect(model.modalTitle).toContain("alerts");
    expect(model.pricingHref).toContain("source=trading_alerts_gate");
    expect(model.trialBody).toContain("alert");
  });
});
