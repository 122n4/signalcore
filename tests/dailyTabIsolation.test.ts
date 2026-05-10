import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("DailyTab trading isolation", () => {
  it("keeps trading UI out of DailyTab", () => {
    const source = readFileSync(
      resolve(process.cwd(), "app/app/tabs/DailyTab.tsx"),
      "utf8",
    );

    expect(source).not.toContain("TradingLiveDecisionSelectionSurface");
    expect(source).not.toContain("support.trading");
    expect(source).not.toContain("tradingWatchlist");
  });
});
