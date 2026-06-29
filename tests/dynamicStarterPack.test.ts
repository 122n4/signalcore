import { beforeEach, describe, expect, it, vi } from "vitest";

const { getQuotesMock } = vi.hoisted(() => ({
  getQuotesMock: vi.fn(),
}));

vi.mock("@/lib/market/quotes", () => ({
  getQuotes: getQuotesMock,
}));

import { buildDynamicStarterPack } from "@/lib/signalcore/dynamicStarterPack";

describe("dynamic starter pack", () => {
  beforeEach(() => {
    getQuotesMock.mockReset();
  });

  it("marks the pack as reference quotes when pricing depends on fallback sources", async () => {
    getQuotesMock.mockResolvedValue({
      VWCE: { price: 120, ts: 1_710_000_000, source: "twelvedata" },
      AGGH: { price: 98, ts: 1_710_000_000, source: "market-client-candle-fallback" },
      SPY: { price: 510, ts: 1_710_000_000, source: "twelvedata" },
      GLD: { price: 225, ts: 1_710_000_000, source: "twelvedata" },
    });

    const result = await buildDynamicStarterPack({
      mode: "investing",
      referenceTotalEur: 10_000,
      riskProfile: "Balanced",
    });

    expect(result.source).toBe("reference_quotes");
    expect(result.items.some((item) => item.price_source === "market-client-candle-fallback")).toBe(true);
  });
});
