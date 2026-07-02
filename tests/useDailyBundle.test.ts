import { describe, expect, it } from "vitest";

import { isUsableDailyBundleResponse } from "@/lib/signalcore/useDailyBundle";

describe("isUsableDailyBundleResponse", () => {
  it("accepts a normal successful bundle", () => {
    expect(
      isUsableDailyBundleResponse({
        ok: true,
        daily: { title: "Ready" } as any,
      }),
    ).toBe(true);
  });

  it("accepts a degraded canonical fallback bundle", () => {
    expect(
      isUsableDailyBundleResponse({
        ok: false,
        degraded: true,
        daily: { title: "Fallback" } as any,
        portfolio: { cash: 0, items: [] } as any,
      }),
    ).toBe(true);
  });

  it("rejects a hard failure payload", () => {
    expect(
      isUsableDailyBundleResponse({
        ok: false,
        error: "Unauthorized",
      }),
    ).toBe(false);
  });
});
