import { describe, expect, it } from "vitest";
import {
  buildModeAwareNavItems,
  buildShellCopy,
  inferModeFromView,
  isAuxiliarySurfaceMode,
  resolveModeAwareView,
  toModeAwareTab,
} from "@/app/app/navigationModel";

describe("app navigation model", () => {
  it("exposes the trading shell navigation", () => {
    expect(buildModeAwareNavItems({ mode: "trading", lang: "en" })).toEqual([
      { key: "trading", label: "Trading" },
      { key: "alerts", label: "Alerts" },
      { key: "journal", label: "Journal" },
    ]);
  });

  it("falls unknown tabs back to trading", () => {
    expect(resolveModeAwareView({ rawView: "unknown", mode: "trading" })).toBe("trading");
  });

  it("writes current tabs through the trading shell", () => {
    expect(toModeAwareTab({ view: "trading", mode: "trading" })).toBe("trading");
    expect(toModeAwareTab({ view: "alerts", mode: "trading" })).toBe("alerts");
    expect(toModeAwareTab({ view: "journal", mode: "trading" })).toBe("journal");
  });

  it("can infer the workspace mode directly from a tab key", () => {
    expect(inferModeFromView("trading")).toBe("trading");
    expect(inferModeFromView("unknown")).toBeNull();
  });

  it("exposes trading shell copy for current tabs", () => {
    expect(buildShellCopy({ mode: "trading", view: "trading", lang: "en" })).toEqual({
      title: "Trading Cockpit",
      subtitle: "Opportunity flow, execution discipline, and post-trade learning in one trading-native workspace.",
    });
  });

  it("treats the current workspace as auxiliary", () => {
    expect(isAuxiliarySurfaceMode("trading")).toBe(true);
  });
});
