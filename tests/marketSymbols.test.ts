import { describe, expect, it } from "vitest";
import { inferAssetKind, normSymbol, toFinnhubSymbol, toTwelveDataSymbol } from "@/lib/market/symbols";

describe("market symbols", () => {
  it("classifies assets with simple deterministic rules", () => {
    expect(inferAssetKind("AAPL")).toBe("equity");
    expect(inferAssetKind("VWCE")).toBe("equity");
    expect(inferAssetKind("EUR/USD")).toBe("forex");
    expect(inferAssetKind("EURUSD")).toBe("forex");
    expect(inferAssetKind("GBPUSD")).toBe("forex");
    expect(inferAssetKind("USDJPY")).toBe("forex");
    expect(inferAssetKind("BTC/USD")).toBe("crypto");
    expect(inferAssetKind("BTCUSD")).toBe("crypto");
    expect(inferAssetKind("XAU/USD")).toBe("metal");
    expect(inferAssetKind("XAUUSD")).toBe("metal");
    expect(inferAssetKind("NDX")).toBe("index");
  });

  it("keeps symbol normalization simple and deterministic", () => {
    expect(normSymbol(" aapl ")).toBe("AAPL");
    expect(toTwelveDataSymbol("aapl", "equity")).toBe("AAPL");
    expect(toTwelveDataSymbol("eurusd", "forex")).toBe("EUR/USD");
    expect(toTwelveDataSymbol("gbpusd", "forex")).toBe("GBP/USD");
    expect(toTwelveDataSymbol("btcusd", "crypto")).toBe("BTC/USD");
    expect(toTwelveDataSymbol("xauusd", "metal")).toBe("XAU/USD");
    expect(toFinnhubSymbol("vwce")).toBe("VWCE");
    expect(toFinnhubSymbol("eur/usd")).toBe("OANDA:EUR_USD");
    expect(toFinnhubSymbol("eurusd")).toBe("OANDA:EUR_USD");
    expect(toFinnhubSymbol("xau/usd")).toBe("OANDA:XAU_USD");
    expect(toFinnhubSymbol("btc/usd")).toBe("BINANCE:BTCUSDT");
  });
});
