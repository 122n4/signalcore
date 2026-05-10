import { describe, expect, it } from "vitest";
import { inferAssetKind, normSymbol, toFinnhubSymbol, toTwelveDataSymbol } from "@/lib/market/symbols";

describe("market symbols", () => {
  it("classifies assets with simple deterministic rules", () => {
    expect(inferAssetKind("AAPL")).toBe("equity");
    expect(inferAssetKind("VWCE")).toBe("equity");
    expect(inferAssetKind("EUR/USD")).toBe("forex");
    expect(inferAssetKind("BTC/USD")).toBe("crypto");
    expect(inferAssetKind("XAU/USD")).toBe("metal");
    expect(inferAssetKind("NDX")).toBe("index");
  });

  it("keeps symbol normalization simple and deterministic", () => {
    expect(normSymbol(" aapl ")).toBe("AAPL");
    expect(toTwelveDataSymbol("aapl", "equity")).toBe("AAPL");
    expect(toFinnhubSymbol("vwce")).toBe("VWCE");
    expect(toFinnhubSymbol("eur/usd")).toBe("OANDA:EUR_USD");
    expect(toFinnhubSymbol("xau/usd")).toBe("OANDA:XAU_USD");
    expect(toFinnhubSymbol("btc/usd")).toBe("BINANCE:BTCUSDT");
  });
});
