import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  loadHistoricalTradingDataset,
  loadLocalHistoricalTradingDataset,
} from "@/lib/trading/backtest";

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "syntrake-local-history-"));
  tempDirs.push(dir);
  return dir;
}

function formatForexLine(date: Date, price: number): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  const seconds = String(date.getUTCSeconds()).padStart(2, "0");

  return `${year}${month}${day} ${hours}${minutes}${seconds};${price.toFixed(5)};${(price + 0.0002).toFixed(5)};${(price - 0.0002).toFixed(5)};${(price + 0.0001).toFixed(5)};1`;
}

function formatCryptoLine(timestampMs: number, price: number, unit: "ms" | "us" = "ms"): string {
  const openTime = unit === "us" ? timestampMs * 1000 : timestampMs;

  return [
    openTime,
    price.toFixed(2),
    (price + 0.4).toFixed(2),
    (price - 0.4).toFixed(2),
    (price + 0.2).toFixed(2),
    "10.00000000",
    openTime + (unit === "us" ? 59_999_000 : 59_999),
    "1000.00000000",
    "5",
    "1.00000000",
    "100.00000000",
    "0",
  ].join(",");
}

function formatIndexLine(date: Date, price: number): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  const seconds = String(date.getUTCSeconds()).padStart(2, "0");

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds},${price.toFixed(1)},${(price + 0.8).toFixed(1)},${(price - 0.7).toFixed(1)},${(price + 0.3).toFixed(1)},0,15`;
}

async function writeSampleFile(args: {
  filePath: string;
  lines: string[];
}): Promise<void> {
  await mkdir(path.dirname(args.filePath), { recursive: true });
  await writeFile(args.filePath, `${args.lines.join("\n")}\n`, "utf8");
}

afterEach(async () => {
  delete process.env.TRADING_BACKTEST_LOCAL_DATA_DIR;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("trading local historical dataset loader", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("fetch should not be used in local historical dataset tests");
    }));
  });

  it("loads yearly forex archive data and aggregates requested timeframes", async () => {
    const baseDir = await createTempDir();
    process.env.TRADING_BACKTEST_LOCAL_DATA_DIR = baseDir;
    const lines: string[] = [];
    const start = new Date("2024-01-01T00:00:00.000Z").getTime();

    for (let index = 0; index < 300; index += 1) {
      lines.push(formatForexLine(new Date(start + index * 60_000), 1.1 + index * 0.0001));
    }

    await writeSampleFile({
      filePath: path.join(baseDir, "forex", "eurusd", "DAT_ASCII_EURUSD_M1_2024.csv.csv"),
      lines,
    });

    const dataset = await loadLocalHistoricalTradingDataset({
      instrument: "EURUSD",
      from: "2024-01-01T00:00:00.000Z",
      to: "2024-01-01T04:59:00.000Z",
      timeframes: ["4h", "1h", "15m", "5m"],
    });

    expect(dataset.metadata.source).toBe("local_archive");
    expect(dataset.metadata.dataSymbol).toBe("EURUSD");
    expect(dataset.metadata.candleCounts["4h"]).toBe(2);
    expect(dataset.dataset.timeframes["1h"]?.length).toBe(5);
    expect(dataset.dataset.timeframes["15m"]?.length).toBe(20);
  });

  it("loads yearly forex archive data from single .csv files exported by HistData", async () => {
    const baseDir = await createTempDir();
    process.env.TRADING_BACKTEST_LOCAL_DATA_DIR = baseDir;
    const lines: string[] = [];
    const start = new Date("2024-01-01T00:00:00.000Z").getTime();

    for (let index = 0; index < 180; index += 1) {
      lines.push(formatForexLine(new Date(start + index * 60_000), 1.25 + index * 0.0001));
    }

    await writeSampleFile({
      filePath: path.join(baseDir, "forex", "gbpusd", "DAT_ASCII_GBPUSD_M1_2024.csv"),
      lines,
    });

    const dataset = await loadLocalHistoricalTradingDataset({
      instrument: "GBPUSD",
      from: "2024-01-01T00:00:00.000Z",
      to: "2024-01-01T02:59:00.000Z",
      timeframes: ["1h", "15m"],
    });

    expect(dataset.metadata.source).toBe("local_archive");
    expect(dataset.metadata.dataSymbol).toBe("GBPUSD");
    expect(dataset.dataset.timeframes["1h"]?.length).toBe(3);
    expect(dataset.dataset.timeframes["15m"]?.length).toBe(12);
  });

  it("loads monthly BTCUSDT archive data and uses local-first without fetch", async () => {
    const baseDir = await createTempDir();
    process.env.TRADING_BACKTEST_LOCAL_DATA_DIR = baseDir;
    const lines: string[] = [];
    const start = new Date("2024-01-01T00:00:00.000Z").getTime();

    for (let index = 0; index < 120; index += 1) {
      lines.push(formatCryptoLine(start + index * 60_000, 42_000 + index));
    }

    await writeSampleFile({
      filePath: path.join(baseDir, "cripto", "btcusdt", "BTCUSDT-1m-2024-01.csv"),
      lines,
    });

    const dataset = await loadHistoricalTradingDataset({
      instrument: "BTCUSD",
      from: "2024-01-01T00:00:00.000Z",
      to: "2024-01-01T01:59:00.000Z",
      timeframes: ["1h", "15m"],
    });

    expect(dataset.metadata.source).toBe("local_archive");
    expect(dataset.metadata.dataSymbol).toBe("BTCUSDT");
    expect(dataset.dataset.timeframes["1h"]?.length).toBe(2);
    expect(dataset.dataset.timeframes["15m"]?.length).toBe(8);
    expect(vi.mocked(fetch).mock.calls.length).toBe(0);
  });

  it("loads monthly ETHUSDT archive data from the ethusdt folder and normalizes microsecond timestamps", async () => {
    const baseDir = await createTempDir();
    process.env.TRADING_BACKTEST_LOCAL_DATA_DIR = baseDir;
    const lines: string[] = [];
    const start = new Date("2025-01-01T00:00:00.000Z").getTime();

    for (let index = 0; index < 120; index += 1) {
      lines.push(formatCryptoLine(start + index * 60_000, 3_300 + index, "us"));
    }

    await writeSampleFile({
      filePath: path.join(baseDir, "cripto", "ethusdt", "ETHUSDT-1m-2025-01.csv"),
      lines,
    });

    const dataset = await loadLocalHistoricalTradingDataset({
      instrument: "ETHUSD",
      from: "2025-01-01T00:00:00.000Z",
      to: "2025-01-01T01:59:00.000Z",
      timeframes: ["1h", "15m"],
    });

    expect(dataset.metadata.source).toBe("local_archive");
    expect(dataset.metadata.dataSymbol).toBe("ETHUSDT");
    expect(dataset.dataset.timeframes["1h"]?.length).toBe(2);
    expect(dataset.dataset.timeframes["15m"]?.length).toBe(8);
    expect(String(dataset.dataset.timeframes["15m"]?.[0]?.timestamp)).toBe("2025-01-01T00:00:00.000Z");
  });

  it("loads yearly index archive data and sorts descending file input correctly", async () => {
    const baseDir = await createTempDir();
    process.env.TRADING_BACKTEST_LOCAL_DATA_DIR = baseDir;
    const lines = ["DateTime,Open,High,Low,Close,Volume,TickVolume"];
    const start = new Date("2024-01-02T14:00:00.000Z").getTime();

    for (let index = 59; index >= 0; index -= 1) {
      lines.push(formatIndexLine(new Date(start + index * 60_000), 16_500 + index));
    }

    await writeSampleFile({
      filePath: path.join(baseDir, "indices", "nasdaq", "nasdaq_2024.csv"),
      lines,
    });

    const dataset = await loadLocalHistoricalTradingDataset({
      instrument: "NAS100",
      from: "2024-01-02T14:00:00.000Z",
      to: "2024-01-02T14:59:00.000Z",
      timeframes: ["15m"],
    });

    expect(dataset.metadata.source).toBe("local_archive");
    expect(dataset.dataset.timeframes["15m"]?.length).toBe(4);
    expect(String(dataset.dataset.timeframes["15m"]?.[0]?.timestamp)).toBe("2024-01-02T14:00:00.000Z");
  });

  it("loads yearly SPXUSD Histdata archive for US500", async () => {
    const baseDir = await createTempDir();
    process.env.TRADING_BACKTEST_LOCAL_DATA_DIR = baseDir;
    const lines: string[] = [];
    const start = new Date("2024-01-02T14:00:00.000Z").getTime();

    for (let index = 0; index < 120; index += 1) {
      lines.push(formatForexLine(new Date(start + index * 60_000), 4_800 + index * 0.5));
    }

    await writeSampleFile({
      filePath: path.join(baseDir, "indices", "us500", "DAT_ASCII_SPXUSD_M1_2024.csv"),
      lines,
    });

    const dataset = await loadLocalHistoricalTradingDataset({
      instrument: "US500",
      from: "2024-01-02T14:00:00.000Z",
      to: "2024-01-02T15:59:00.000Z",
      timeframes: ["1h", "15m"],
    });

    expect(dataset.metadata.source).toBe("local_archive");
    expect(dataset.metadata.instrument).toBe("US500");
    expect(dataset.metadata.dataSymbol).toBe("SPXUSD");
    expect(dataset.metadata.dataSymbolRelation).toBe("proxy");
    expect(dataset.dataset.marketType).toBe("equities");
    expect(dataset.dataset.timeframes["1h"]?.length).toBe(2);
    expect(dataset.dataset.timeframes["15m"]?.length).toBe(8);
  });
});
