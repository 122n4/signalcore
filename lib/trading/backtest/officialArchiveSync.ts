import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { access, copyFile, mkdtemp, mkdir, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { spawn } from "node:child_process";

import { resolveTradingHistoricalInstrument } from "./datasets";

export type TradingOfficialSyncInstrument = "BTCUSD" | "ETHUSD" | "BNBUSD" | "SOLUSD" | "XRPUSD" | "US500";

export type TradingOfficialSyncMonth = {
  year: number;
  month: number;
};

export type TradingOfficialSyncStatus =
  | "downloaded"
  | "existing"
  | "missing_local"
  | "missing_remote"
  | "unsupported_remote_sync";

export type TradingOfficialSyncEntry = {
  instrument: TradingOfficialSyncInstrument;
  status: TradingOfficialSyncStatus;
  targetPath: string;
  remoteUrl: string | null;
  checksumVerified: boolean | null;
  periodLabel: string;
};

export type TradingOfficialSyncResult = {
  rootDir: string;
  entries: TradingOfficialSyncEntry[];
};

function createMonthLabel(part: TradingOfficialSyncMonth): string {
  return `${part.year}-${String(part.month).padStart(2, "0")}`;
}

function monthStart(input: TradingOfficialSyncMonth): Date {
  return new Date(Date.UTC(input.year, input.month - 1, 1));
}

export function buildMonthlyRange(from: TradingOfficialSyncMonth, to: TradingOfficialSyncMonth): TradingOfficialSyncMonth[] {
  const cursor = monthStart(from);
  const end = monthStart(to);
  const months: TradingOfficialSyncMonth[] = [];

  while (cursor <= end) {
    months.push({
      year: cursor.getUTCFullYear(),
      month: cursor.getUTCMonth() + 1,
    });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return months;
}

function resolveLocalHistoricalBaseDir(): string {
  const configuredDir = process.env.TRADING_BACKTEST_LOCAL_DATA_DIR?.trim();
  if (configuredDir) {
    return path.resolve(/* turbopackIgnore: true */ configuredDir);
  }

  return path.join(/* turbopackIgnore: true */ process.cwd(), "Data", "historical");
}

function buildLocalCsvPath(instrument: TradingOfficialSyncInstrument, part: TradingOfficialSyncMonth): string {
  const instrumentConfig = resolveTradingHistoricalInstrument(instrument);
  const localDataset = instrumentConfig.localDataset;
  if (!localDataset) {
    throw new Error(`No local dataset configured for ${instrument}.`);
  }

  const baseDir = resolveLocalHistoricalBaseDir();
  const root = path.join(/* turbopackIgnore: true */ baseDir, ...localDataset.pathSegments);
  if (localDataset.format === "crypto_binance_monthly_m1") {
    return path.join(root, `${localDataset.symbol}-1m-${createMonthLabel(part)}.csv`);
  }

  if (localDataset.format === "histdata_ascii_yearly_m1") {
    return path.join(root, `DAT_ASCII_${localDataset.symbol}_M1_${part.year}.csv`);
  }

  throw new Error(`Unsupported official sync format '${localDataset.format}' for ${instrument}.`);
}

export function buildBinanceMonthlyKlineZipUrl(symbol: string, part: TradingOfficialSyncMonth): string {
  const label = createMonthLabel(part);
  return `https://data.binance.vision/data/spot/monthly/klines/${symbol}/1m/${symbol}-1m-${label}.zip`;
}

class RemoteArchiveMissingError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "RemoteArchiveMissingError";
  }
}

function isRemoteArchiveMissingError(error: unknown): error is RemoteArchiveMissingError {
  return error instanceof RemoteArchiveMissingError;
}

async function fileExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function ensureParentDirectory(targetPath: string): Promise<void> {
  await mkdir(path.dirname(targetPath), { recursive: true });
}

async function downloadFile(url: string, targetPath: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    if (response.status === 404 || response.status === 410) {
      throw new RemoteArchiveMissingError(
        `Remote archive is not available yet for ${url}: ${response.status} ${response.statusText}`,
        response.status,
      );
    }
    throw new Error(`Download failed for ${url}: ${response.status} ${response.statusText}`);
  }

  await ensureParentDirectory(targetPath);
  await pipeline(Readable.fromWeb(response.body as never), createWriteStream(targetPath));
}

async function computeSha256(targetPath: string): Promise<string> {
  const hash = createHash("sha256");
  const stream = createReadStream(targetPath);

  await new Promise<void>((resolve, reject) => {
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve());
  });

  return hash.digest("hex");
}

export function parseChecksumFile(raw: string): string | null {
  const firstLine = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0) ?? null;
  if (!firstLine) {
    return null;
  }

  const [checksum] = firstLine.split(/\s+/);
  return checksum?.trim().toLowerCase() || null;
}

async function verifyChecksum(zipPath: string, checksumUrl: string): Promise<boolean> {
  const response = await fetch(checksumUrl);
  if (!response.ok) {
    return false;
  }

  const expected = parseChecksumFile(await response.text());
  if (!expected) {
    return false;
  }

  const actual = await computeSha256(zipPath);
  if (actual !== expected) {
    throw new Error(`Checksum mismatch for ${path.basename(zipPath)}.`);
  }

  return true;
}

async function runCommand(filePath: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(filePath, args, {
      stdio: "ignore",
      windowsHide: true,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${filePath} exited with code ${String(code)}.`));
    });
  });
}

async function extractZip(zipPath: string, targetDir: string): Promise<void> {
  if (process.platform !== "win32") {
    try {
      await runCommand("unzip", ["-o", zipPath, "-d", targetDir]);
      return;
    } catch {
      await runCommand("tar", ["-xf", zipPath, "-C", targetDir]);
      return;
    }
  }

  try {
    await runCommand("tar", ["-xf", zipPath, "-C", targetDir]);
    return;
  } catch {
    await runCommand("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${targetDir.replace(/'/g, "''")}' -Force`,
    ]);
  }
}

async function findFirstCsv(targetDir: string): Promise<string | null> {
  const entries = await readdir(targetDir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      const nested = await findFirstCsv(fullPath);
      if (nested) {
        return nested;
      }
      continue;
    }

    if (entry.isFile() && fullPath.toLowerCase().endsWith(".csv")) {
      return fullPath;
    }
  }

  return null;
}

export async function downloadBinanceMonthlyCsv(args: {
  symbol: string;
  part: TradingOfficialSyncMonth;
  targetPath: string;
}): Promise<{ remoteUrl: string; checksumVerified: boolean | null }> {
  const monthLabel = createMonthLabel(args.part);
  const zipUrl = buildBinanceMonthlyKlineZipUrl(args.symbol, args.part);
  const checksumUrl = `${zipUrl}.CHECKSUM`;
  const tempDir = await mkdtemp(path.join(os.tmpdir(), `signalcore-binance-${args.symbol}-${monthLabel}-`));
  const zipPath = path.join(tempDir, `${args.symbol}-1m-${monthLabel}.zip`);
  const extractDir = path.join(tempDir, "extract");

  try {
    await mkdir(extractDir, { recursive: true });
    await downloadFile(zipUrl, zipPath);
    const checksumVerified = await verifyChecksum(zipPath, checksumUrl);
    await extractZip(zipPath, extractDir);
    const csvPath = await findFirstCsv(extractDir);
    if (!csvPath) {
      throw new Error(`No CSV extracted from ${zipUrl}.`);
    }
    await ensureParentDirectory(args.targetPath);
    await copyFile(csvPath, args.targetPath);
    return {
      remoteUrl: zipUrl,
      checksumVerified,
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export async function inspectLocalYearlyArchive(args: {
  instrument: Extract<TradingOfficialSyncInstrument, "US500">;
  fromYear: number;
  toYear: number;
}): Promise<TradingOfficialSyncEntry[]> {
  const entries: TradingOfficialSyncEntry[] = [];

  for (let year = args.fromYear; year <= args.toYear; year += 1) {
    const targetPath = buildLocalCsvPath(args.instrument, { year, month: 1 });
    const exists = await fileExists(targetPath);
    entries.push({
      instrument: args.instrument,
      status: exists ? "existing" : "missing_local",
      targetPath,
      remoteUrl: null,
      checksumVerified: null,
      periodLabel: String(year),
    });
  }

  return entries;
}

export async function syncBinanceMonthlyArchive(args: {
  instrument: Extract<TradingOfficialSyncInstrument, "BTCUSD" | "ETHUSD" | "BNBUSD" | "SOLUSD" | "XRPUSD">;
  from: TradingOfficialSyncMonth;
  to: TradingOfficialSyncMonth;
  force?: boolean;
}): Promise<TradingOfficialSyncEntry[]> {
  const instrumentConfig = resolveTradingHistoricalInstrument(args.instrument);
  const localDataset = instrumentConfig.localDataset;
  if (!localDataset || localDataset.format !== "crypto_binance_monthly_m1") {
    throw new Error(`Instrument ${args.instrument} is not configured for Binance monthly sync.`);
  }

  const entries: TradingOfficialSyncEntry[] = [];
  for (const part of buildMonthlyRange(args.from, args.to)) {
    const targetPath = buildLocalCsvPath(args.instrument, part);
    if (!args.force && (await fileExists(targetPath))) {
      entries.push({
        instrument: args.instrument,
        status: "existing",
        targetPath,
        remoteUrl: buildBinanceMonthlyKlineZipUrl(localDataset.symbol, part),
        checksumVerified: null,
        periodLabel: createMonthLabel(part),
      });
      continue;
    }

    try {
      const download = await downloadBinanceMonthlyCsv({
        symbol: localDataset.symbol,
        part,
        targetPath,
      });
      entries.push({
        instrument: args.instrument,
        status: "downloaded",
        targetPath,
        remoteUrl: download.remoteUrl,
        checksumVerified: download.checksumVerified,
        periodLabel: createMonthLabel(part),
      });
    } catch (error) {
      if (!isRemoteArchiveMissingError(error)) {
        throw error;
      }

      entries.push({
        instrument: args.instrument,
        status: "missing_remote",
        targetPath,
        remoteUrl: buildBinanceMonthlyKlineZipUrl(localDataset.symbol, part),
        checksumVerified: null,
        periodLabel: createMonthLabel(part),
      });
    }
  }

  return entries;
}

export async function syncOfficialHistoricalArchives(args: {
  instruments: TradingOfficialSyncInstrument[];
  from: TradingOfficialSyncMonth;
  to: TradingOfficialSyncMonth;
  force?: boolean;
}): Promise<TradingOfficialSyncResult> {
  const entries: TradingOfficialSyncEntry[] = [];

  for (const instrument of args.instruments) {
    if (
      instrument === "BTCUSD"
      || instrument === "ETHUSD"
      || instrument === "BNBUSD"
      || instrument === "SOLUSD"
      || instrument === "XRPUSD"
    ) {
      entries.push(
        ...(await syncBinanceMonthlyArchive({
          instrument,
          from: args.from,
          to: args.to,
          force: args.force,
        })),
      );
      continue;
    }

    if (instrument === "US500") {
      entries.push(
        ...(await inspectLocalYearlyArchive({
          instrument,
          fromYear: args.from.year,
          toYear: args.to.year,
        })),
      );
      continue;
    }

    entries.push({
      instrument,
      status: "unsupported_remote_sync",
      targetPath: buildLocalCsvPath(instrument, args.from),
      remoteUrl: null,
      checksumVerified: null,
      periodLabel: createMonthLabel(args.from),
    });
  }

  return {
    rootDir: resolveLocalHistoricalBaseDir(),
    entries,
  };
}

export async function summarizeSyncResult(result: TradingOfficialSyncResult): Promise<{
  downloaded: number;
  existing: number;
  missingLocal: number;
  missingRemote: number;
  unsupported: number;
}> {
  const summary = {
    downloaded: 0,
    existing: 0,
    missingLocal: 0,
    missingRemote: 0,
    unsupported: 0,
  };

  for (const entry of result.entries) {
    if (entry.status === "downloaded") {
      summary.downloaded += 1;
    } else if (entry.status === "existing") {
      summary.existing += 1;
    } else if (entry.status === "missing_local") {
      summary.missingLocal += 1;
    } else if (entry.status === "missing_remote") {
      summary.missingRemote += 1;
    } else if (entry.status === "unsupported_remote_sync") {
      summary.unsupported += 1;
    }
  }

  return summary;
}
