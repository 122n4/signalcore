import { describe, expect, it } from "vitest";

import {
  canAccessMode,
  canAccessView,
  getEntitlementsForTier,
  getLockedViewsForMode,
  resolveAccessTier,
} from "@/lib/signalcore/entitlements";

describe("signalcore entitlements", () => {
  it("keeps only trading available for the free tier", () => {
    const entitlements = getEntitlementsForTier("free");

    expect(entitlements.allowedModes).toEqual(["trading"]);
    expect(entitlements.tradingViews).toEqual(["trading"]);
    expect(entitlements.lockedTradingViews).toEqual(["journal", "alerts"]);
    expect(entitlements.trading.discoveryInstrumentLimit).toBe(3);
    expect(entitlements.trading.visibleHistoryDays).toBe(7);
  });

  it("unlocks the full trading stack for trial and pro tiers", () => {
    expect(canAccessView({ tier: "trial", mode: "trading", view: "journal" })).toBe(true);
    expect(canAccessView({ tier: "pro", mode: "trading", view: "alerts" })).toBe(true);
    expect(getLockedViewsForMode({ tier: "trial", mode: "trading" })).toEqual([]);
  });

  it("derives access tier from billing and trial state", () => {
    expect(resolveAccessTier({ billingPaid: false, hasProAccess: false, trialActive: false })).toBe("free");
    expect(resolveAccessTier({ billingPaid: false, hasProAccess: true, trialActive: true })).toBe("trial");
    expect(resolveAccessTier({ billingPaid: true, hasProAccess: true, trialActive: false })).toBe("pro");
  });

  it("allows trading mode", () => {
    expect(canAccessMode({ tier: "free", mode: "trading" })).toBe(true);
  });
});
