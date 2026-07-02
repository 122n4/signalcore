import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type {
  TradingHistoricalDataset,
  TradingHistoricalDatasetRequest,
} from "./datasets";
import { resolveTradingHistoricalInstrument } from "./datasets";
import { computeTradingHistoricalCoverage } from "./quality";

export type TradingHistoricalDatasetCachePolicy =
  | "prefer_cache"
  | "refresh"
  | "read_only"
  | "write_through";

function resolveArchiveBaseDir(customDir?: string | null): string {
  const configuredDir = customDir?.trim();
  if (configuredDir) {
    return path.resolve(/* turbopackIgnore: true */ configuredDir);
  }

  return path.join(
    /* turbopackIgnore: true */ process.cwd(),
    "artifacts",
    "trading-backtests",
    "datasets",
  );
}

function buildDatasetArchivePath(args: {
  instrument: string;
  periodLabel: string;
  baseDir?: string | null;
}): string {
  const baseDir = resolveArchiveBaseDir(args.baseDir);

  return path.join(
    /* turbopackIgnore: true */ baseDir,
    args.instrument.toUpperCase(),
    `${args.periodLabel}.json`,
  );
}

function datasetMatchesRequest(args: {
  dataset: TradingHistoricalDataset;
  request: TradingHistoricalDatasetRequest;
}): boolean {
  const requestedTimeframes = args.request.timeframes ?? [];
  const metadata = args.dataset.metadata;

  if (metadata.instrument !== args.request.instrument.toUpperCase()) {
    return false;
  }

  if (metadata.from !== new Date(args.request.from).toISOString()) {
    return false;
  }

  if (metadata.to !== new Date(args.request.to).toISOString()) {
    return false;
  }

  const sourcePreference = args.request.sourcePreference ?? "local_first";
  const instrument = resolveTradingHistoricalInstrument(args.request.instrument);

  if (sourcePreference === "local_only" && metadata.source !== "local_archive") {
    return false;
  }

  if (sourcePreference === "api_only" && metadata.source === "local_archive") {
    return false;
  }

  if (
    sourcePreference === "local_first"
    && instrument.localDataset
    && metadata.source !== "local_archive"
  ) {
    return false;
  }

  return requestedTimeframes.every((timeframe) => metadata.timeframes.includes(timeframe));
}

export async function readTradingHistoricalDatasetArchive(args: {
  instrument: string;
  periodLabel: string;
  request: TradingHistoricalDatasetRequest;
  baseDir?: string | null;
}): Promise<TradingHistoricalDataset | null> {
  const archivePath = buildDatasetArchivePath(args);
  const resolvedArchivePath = /* turbopackIgnore: true */ archivePath;

  try {
    const raw = await readFile(resolvedArchivePath, "utf8");
    const parsed = JSON.parse(raw) as TradingHistoricalDataset;
    const coverage = computeTradingHistoricalCoverage(parsed);

    return datasetMatchesRequest({
      dataset: parsed,
      request: args.request,
    })
      && coverage.valid
      ? parsed
      : null;
  } catch {
    return null;
  }
}

export async function writeTradingHistoricalDatasetArchive(args: {
  dataset: TradingHistoricalDataset;
  periodLabel: string;
  baseDir?: string | null;
}): Promise<string> {
  const archivePath = buildDatasetArchivePath({
    instrument: args.dataset.metadata.instrument,
    periodLabel: args.periodLabel,
    baseDir: args.baseDir,
  });

  await mkdir(path.dirname(archivePath), { recursive: true });
  await writeFile(archivePath, JSON.stringify(args.dataset, null, 2), "utf8");

  return archivePath;
}

export async function loadOrFetchTradingHistoricalDataset(args: {
  request: TradingHistoricalDatasetRequest;
  periodLabel: string;
  cachePolicy?: TradingHistoricalDatasetCachePolicy;
  baseDir?: string | null;
  fetchDataset: () => Promise<TradingHistoricalDataset>;
}): Promise<TradingHistoricalDataset> {
  const cachePolicy = args.cachePolicy ?? "prefer_cache";
  const allowCacheWrite = cachePolicy === "prefer_cache" || cachePolicy === "refresh" || cachePolicy === "write_through";

  if (cachePolicy !== "refresh") {
    const cached = await readTradingHistoricalDatasetArchive({
      instrument: args.request.instrument,
      periodLabel: args.periodLabel,
      request: args.request,
      baseDir: args.baseDir,
    });

    if (cached) {
      return cached;
    }

    if (cachePolicy === "read_only") {
      throw new Error(
        `Missing cached trading historical dataset for ${args.request.instrument} (${args.periodLabel}).`,
      );
    }
  }

  const dataset = await args.fetchDataset();

  if (allowCacheWrite) {
    await writeTradingHistoricalDatasetArchive({
      dataset,
      periodLabel: args.periodLabel,
      baseDir: args.baseDir,
    });
  }

  return dataset;
}
