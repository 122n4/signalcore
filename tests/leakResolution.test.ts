import { describe, expect, it } from "vitest";
import { isLeakResolved, normalizeLeakFamily } from "@/lib/fixNow/leakResolution";

describe("leakResolution", () => {
  it("groups concentration severity variants into the same unresolved family", () => {
    expect(normalizeLeakFamily("concentration_high")).toBe("concentration");
    expect(normalizeLeakFamily("concentration_med")).toBe("concentration");
    expect(
      isLeakResolved({
        targetLeakKey: "concentration_high",
        currentLeakKey: "concentration_med",
      }),
    ).toBe(false);
  });

  it("groups stale pricing severity variants into the same unresolved family", () => {
    expect(normalizeLeakFamily("pricing_stale_high")).toBe("pricing_stale");
    expect(normalizeLeakFamily("pricing_stale_med")).toBe("pricing_stale");
    expect(
      isLeakResolved({
        targetLeakKey: "pricing_stale_high",
        currentLeakKey: "pricing_stale_med",
      }),
    ).toBe(false);
  });

  it("groups core data quality leaks into the same unresolved family", () => {
    expect(normalizeLeakFamily("pricing_low")).toBe("data_quality");
    expect(normalizeLeakFamily("valuation_zero")).toBe("data_quality");
    expect(
      isLeakResolved({
        targetLeakKey: "pricing_low",
        currentLeakKey: "valuation_zero",
      }),
    ).toBe(false);
  });

  it("treats removal of the family as resolved", () => {
    expect(
      isLeakResolved({
        targetLeakKey: "concentration_high",
        currentLeakKey: null,
      }),
    ).toBe(true);
  });

  it("treats migration to a different family as resolved", () => {
    expect(
      isLeakResolved({
        targetLeakKey: "concentration_high",
        currentLeakKey: "pricing_low",
      }),
    ).toBe(true);
  });
});
