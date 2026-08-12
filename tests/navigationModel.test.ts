import { describe, expect, it } from "vitest";

import {
  buildModeAwareNavItems,
  INVESTING_PRIMARY_VIEW_KEYS,
  resolveModeAwareView,
  toModeAwareTab,
} from "@/app/app/navigationModel";

describe("canonical investing navigation", () => {
  it("shows only Overview, Portfolio, Plan, and Insights as primary investing nav", () => {
    expect(INVESTING_PRIMARY_VIEW_KEYS).toEqual(["daily", "portfolio", "planning", "research"]);
    expect(buildModeAwareNavItems({ mode: "investing", lang: "en" })).toEqual([
      { key: "daily", label: "Overview" },
      { key: "portfolio", label: "Portfolio" },
      { key: "planning", label: "Plan" },
      { key: "research", label: "Insights" },
    ]);
  });

  it("keeps compatibility routes routable without exposing them as primary nav", () => {
    expect(resolveModeAwareView({ rawView: "reports", mode: "investing" })).toBe("reports");
    expect(resolveModeAwareView({ rawView: "autonomy", mode: "investing" })).toBe("autonomy");
    expect(resolveModeAwareView({ rawView: "settings", mode: "investing" })).toBe("settings");
    expect(toModeAwareTab({ view: "reports", mode: "investing" })).toBe("reports");
    expect(toModeAwareTab({ view: "autonomy", mode: "investing" })).toBe("autonomy");
    expect(toModeAwareTab({ view: "settings", mode: "investing" })).toBe("settings");
  });

  it("maps legacy advisor requests to the canonical insights surface", () => {
    expect(resolveModeAwareView({ rawView: "advisor", mode: "investing" })).toBe("research");
    expect(toModeAwareTab({ view: "advisor", mode: "investing" })).toBe("research");
  });
});
