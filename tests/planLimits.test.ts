import { describe, expect, it } from "vitest";

import { getPlanLimitsForTier } from "@/lib/signalcore/planLimits";

describe("plan limits", () => {
  it("limits free users to five priority trading refreshes per day", () => {
    const limits = getPlanLimitsForTier("free");

    expect(limits.dataRefresh.sharedTradingSnapshotOnly).toBe(false);
    expect(limits.dataRefresh.forceTradingRefreshDailyLimit).toBe(5);
  });

  it("limits trial users to ten refreshes and keeps premium unlimited", () => {
    expect(getPlanLimitsForTier("trial").dataRefresh.forceTradingRefreshDailyLimit).toBe(10);
    expect(getPlanLimitsForTier("pro").dataRefresh.forceTradingRefreshDailyLimit).toBeNull();
  });
});
