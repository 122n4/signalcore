import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadHistoricalTradingDataset, resetTwelveDataHistoricalState } from "@/lib/trading/backtest";

const INTERVAL_MS: Record<string, number> = {
  "4h": 4 * 60 * 60_000,
  "1h": 60 * 60_000,
  "15min": 15 * 60_000,
  "5min": 5 * 60_000,
};

function buildResponse(args: {
  interval: string;
  startDate: string;
  endDate: string;
  outputsize: number;
}) {
  const anchor = new Date(args.startDate.replace(" ", "T") + "Z");
  const end = new Date(args.endDate.replace(" ", "T") + "Z");
  const stepMs = INTERVAL_MS[args.interval] ?? INTERVAL_MS["15min"];
  const maxBars = Math.max(2, args.outputsize);
  const values = [];
  let cursor = anchor.getTime();
  let index = 0;

  while (cursor <= end.getTime() && index < maxBars) {
    const base = 100 + index * 0.05;
    values.push({
      datetime: new Date(cursor).toISOString(),
      open: base.toFixed(4),
      high: (base + 0.08).toFixed(4),
      low: (base - 0.06).toFixed(4),
      close: (base + 0.03).toFixed(4),
      volume: String(100 + index),
    });
    cursor += stepMs;
    index += 1;
  }

  return {
    values,
  };
}

describe("trading historical dataset loader", () => {
  const originalKey = process.env.TWELVEDATA_API_KEY;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resetTwelveDataHistoricalState();
    process.env.TWELVEDATA_API_KEY = "test-key";
    fetchMock = vi.fn(async (input: string | URL) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith("/earliest_timestamp")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              datetime: "2020-01-01 00:00:00",
            }),
          } as Response;
        }
        const interval = url.searchParams.get("interval");
        const startDate = url.searchParams.get("start_date") ?? "2026-03-01T00:00:00.000Z";
        const endDate = url.searchParams.get("end_date") ?? "2026-03-02T00:00:00.000Z";
        const outputsize = Number(url.searchParams.get("outputsize") ?? "500");

        return {
          ok: true,
          status: 200,
          json: async () =>
            buildResponse({
              interval: interval ?? "15min",
              startDate,
              endDate,
              outputsize,
            }),
        } as Response;
      });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    resetTwelveDataHistoricalState();
    process.env.TWELVEDATA_API_KEY = originalKey;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("loads a real-shaped historical dataset by instrument, range, and timeframe", async () => {
    const historicalDataset = await loadHistoricalTradingDataset({
      instrument: "EURUSD",
      from: "2026-03-01T00:00:00.000Z",
      to: "2026-03-02T00:00:00.000Z",
      sourcePreference: "api_only",
    });

    expect(historicalDataset.metadata.instrument).toBe("EURUSD");
    expect(historicalDataset.metadata.source).toBe("twelvedata");
    expect(historicalDataset.metadata.timeframes).toEqual(["4h", "1h", "15m", "5m"]);
    expect(historicalDataset.metadata.candleCounts["4h"]).toBeGreaterThan(1);
    expect(historicalDataset.dataset.timeframes["15m"]?.length).toBeGreaterThan(1);
    expect(historicalDataset.dataset.marketType).toBe("forex");
  });

  it("chunks long historical ranges instead of relying on a single provider request", async () => {
    await loadHistoricalTradingDataset({
      instrument: "EURUSD",
      from: "2025-01-01T00:00:00.000Z",
      to: "2025-05-01T00:00:00.000Z",
      timeframes: ["15m"],
      sourcePreference: "api_only",
    });

    expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
  });

  it("falls back to chunk probing when earliest_timestamp is unavailable", async () => {
    fetchMock.mockImplementation(async (input: string | URL) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/earliest_timestamp")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: "error",
            message: "Endpoint temporarily unavailable.",
          }),
        } as Response;
      }

      return {
        ok: true,
        status: 200,
        json: async () =>
          buildResponse({
            interval: url.searchParams.get("interval") ?? "15min",
            startDate: url.searchParams.get("start_date") ?? "2024-01-01 00:00:00",
            endDate: url.searchParams.get("end_date") ?? "2024-04-01 00:00:00",
            outputsize: Number(url.searchParams.get("outputsize") ?? "500"),
          }),
      } as Response;
    });

    const historicalDataset = await loadHistoricalTradingDataset({
      instrument: "EURUSD",
      from: "2024-01-01T00:00:00.000Z",
      to: "2024-04-01T00:00:00.000Z",
      timeframes: ["15m"],
      sourcePreference: "api_only",
    });

    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("/earliest_timestamp"))).toBe(true);
    expect(fetchMock.mock.calls.filter(([input]) => String(input).includes("/time_series")).length).toBeGreaterThan(1);
    expect(historicalDataset.dataset.timeframes["15m"]?.length).toBeGreaterThan(0);
  });

  it("falls back to a proxy symbol when direct market coverage is unavailable", async () => {
    fetchMock.mockImplementation(async (input: string | URL) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/earliest_timestamp")) {
        const symbol = url.searchParams.get("symbol");
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: symbol === "NDX" ? "error" : undefined,
            message: symbol === "NDX" ? "This symbol is available starting with the Grow or Venture plan." : undefined,
            datetime: symbol === "NDX" ? undefined : "2020-01-01 00:00:00",
          }),
        } as Response;
      }
      const symbol = url.searchParams.get("symbol");
      const startDate = url.searchParams.get("start_date") ?? "2026-03-01 00:00:00";

      if (symbol === "NDX") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: "error",
            message: "This symbol is available starting with the Grow or Venture plan.",
          }),
        } as Response;
      }

      return {
        ok: true,
        status: 200,
        json: async () =>
          buildResponse({
            interval: url.searchParams.get("interval") ?? "15min",
            startDate,
            endDate: url.searchParams.get("end_date") ?? startDate,
            outputsize: Number(url.searchParams.get("outputsize") ?? "500"),
          }),
      } as Response;
    });

    const historicalDataset = await loadHistoricalTradingDataset({
      instrument: "NAS100",
      from: "2026-03-01T00:00:00.000Z",
      to: "2026-03-02T00:00:00.000Z",
      timeframes: ["4h", "1h", "15m"],
      sourcePreference: "api_only",
    });

    expect(historicalDataset.metadata.instrument).toBe("NAS100");
    expect(historicalDataset.metadata.dataSymbol).toBe("QQQ");
    expect(historicalDataset.metadata.dataSymbolRelation).toBe("proxy");
  });
});
