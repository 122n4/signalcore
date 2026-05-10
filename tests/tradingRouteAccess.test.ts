import { describe, expect, it } from "vitest";

import { getEntitlementsForTier } from "@/lib/signalcore/entitlements";
import { evaluateTradingCapabilityAccess } from "@/lib/signalcore/tradingRouteAccess";

describe("trading route access", () => {
  it("blocks free trading execution surfaces on the server", () => {
    const result = evaluateTradingCapabilityAccess({
      mode: "trading",
      tier: "free",
      entitlements: getEntitlementsForTier("free"),
      capability: "execution",
    });

    expect(result.ok).toBe(false);
    if (result.ok !== false) {
      throw new Error("expected denial");
    }
    expect(result.status).toBe(403);
    expect(result.body).toMatchObject({
      error: "trading_execution_upgrade_required",
      upgradeRequired: true,
      mode: "trading",
      tier: "free",
      surface: "execution",
      lockedView: "execution",
    });
  });

  it("allows trading pro surfaces for trial and pro tiers", () => {
    const trialResult = evaluateTradingCapabilityAccess({
      mode: "trading",
      tier: "trial",
      entitlements: getEntitlementsForTier("trial"),
      capability: "journal",
    });
    const proResult = evaluateTradingCapabilityAccess({
      mode: "trading",
      tier: "pro",
      entitlements: getEntitlementsForTier("pro"),
      capability: "alerts",
    });

    expect(trialResult.ok).toBe(true);
    expect(proResult.ok).toBe(true);
  });

  it("never blocks investing routes with trading capability checks", () => {
    const result = evaluateTradingCapabilityAccess({
      mode: "investing",
      tier: "free",
      entitlements: getEntitlementsForTier("free"),
      capability: "journal",
    });

    expect(result.ok).toBe(true);
  });
});
