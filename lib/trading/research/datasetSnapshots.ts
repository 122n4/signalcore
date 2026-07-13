import path from "node:path";
import readline from "node:readline";
import { createReadStream } from "node:fs";

import {
  inspectLocalHistoricalFiles,
  loadLocalHistoricalTradingDataset,
  resolveLocalHistoricalFiles,
} from "@/lib/trading/backtest/localHistoricalLoader";
import { resolveTradingHistoricalInstrument } from "@/lib/trading/backtest/datasets";

import { ensureDirectory, fileExists, readJsonIfExists, sha256File, sha256Json, writeJsonAtomic } from "./fs";
import type {
  ResearchConfig,
  ResearchDatasetReference,
  ResearchRegistryDatasetEntry,
  ResearchScientificDatasetFileRef,
  ResearchScientificDatasetInstrumentSnapshot,
  ResearchScientificDatasetSnapshot,
} from "./types";

function resolveSnapshotDir(config: ResearchConfig): string {
  return path.join(config.paths.rootDir, "datasets", "snapshots");
}

function resolveUniverseLabel(config: ResearchConfig): string {
  return config.study.instruments.slice().sort().join(",");
}

function resolveTimezone(config: ResearchConfig): string {
  return config.study.datasetTimezone?.trim() || "UTC";
}

function resolveInstrumentProvider(args: {
  instrument: ReturnType<typeof resolveTradingHistoricalInstrument>;
}): string {
  const format = args.instrument.localDataset?.format;
  if (format === "crypto_binance_monthly_m1") return "binance";
  if (format === "indices_csv_yearly_m1") return "local_archive";
  if (format === "forex_ascii_yearly_m1" || format === "histdata_ascii_yearly_m1") return "local_archive";
  return args.instrument.source;
}

function resolveAdjustmentPolicy(args: {
  config: ResearchConfig;
  instrument: string;
  marketType: string;
}): ResearchScientificDatasetInstrumentSnapshot["adjustment_policy"] {
  const override = args.config.study.adjustmentPolicies?.[args.instrument];
  if (override) {
    return {
      splits: override.splits,
      dividends: override.dividends,
      note: override.note ?? null,
    };
  }

  if (args.marketType === "forex" || args.marketType === "crypto") {
    return {
      splits: "not_applicable",
      dividends: "not_applicable",
      note: "Spot/FX series do not use equity split or dividend adjustments.",
    };
  }

  return {
    splits: "unknown",
    dividends: "unknown",
    note: "Preserved exactly as stored in the canonical local archive.",
  };
}

async function countFileLines(filePath: string): Promise<number> {
  let lines = 0;
  const lineReader = readline.createInterface({
    input: createReadStream(filePath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  for await (const line of lineReader) {
    if (line.trim().length > 0) {
      lines += 1;
    }
  }

  return lines;
}

async function buildFileRefs(files: string[]): Promise<ResearchScientificDatasetFileRef[]> {
  const details = await inspectLocalHistoricalFiles({ files });
  return Promise.all(
    details.map(async (file) => ({
      path: file.path,
      sha256: await sha256File(file.path),
      size_bytes: file.sizeBytes,
      line_count: await countFileLines(file.path),
      modified_at: file.modifiedAt,
    })),
  );
}

function studyRange(config: ResearchConfig): { from: string; to: string } {
  const candidates = [
    ...(config.study.yearlyPeriods ?? []),
    ...config.study.crisisPeriods,
    {
      label: "walk_forward",
      from: config.study.walkForward.from,
      to: config.study.walkForward.to,
    },
  ];
  const from = candidates.map((period) => period.from).sort()[0] ?? config.study.walkForward.from;
  const to = candidates.map((period) => period.to).sort().slice(-1)[0] ?? config.study.walkForward.to;
  return { from, to };
}

async function buildInstrumentSnapshot(
  config: ResearchConfig,
  instrumentName: string,
): Promise<ResearchScientificDatasetInstrumentSnapshot> {
  const instrument = resolveTradingHistoricalInstrument(instrumentName);
  const localDataset = instrument.localDataset;
  if (!localDataset) {
    throw new Error(`Scientific dataset snapshot requires a configured local dataset for ${instrument.instrument}.`);
  }

  const range = studyRange(config);
  const files = await resolveLocalHistoricalFiles({
    config: localDataset,
    from: range.from,
    to: range.to,
    baseDir: config.study.datasetLocalDataRoot ?? null,
  });
  if (files.length === 0) {
    throw new Error(`Scientific dataset snapshot could not find local files for ${instrument.instrument}.`);
  }

  const historicalDataset = await loadLocalHistoricalTradingDataset({
    instrument: instrument.instrument,
    from: range.from,
    to: range.to,
    timeframes: config.study.timeframes,
    sourcePreference: "local_only",
    localDataRoot: config.study.datasetLocalDataRoot ?? null,
  });
  const selectedProvider = resolveInstrumentProvider({ instrument });

  return {
    instrument: instrument.instrument,
    dataset_id: `${instrument.instrument.toLowerCase()}_${config.liveBaselineSource.datasetProfile}`,
    selected_provider: selectedProvider,
    provider_candidates: [
      selectedProvider,
      instrument.source,
      ...(config.study.providerComparability?.fallbackProviders ?? []),
    ].filter((value, index, array) => value && array.indexOf(value) === index),
    universe: resolveUniverseLabel(config),
    market_type: instrument.marketType,
    session_profile: instrument.sessionProfile,
    source_preference: config.study.sourcePreference,
    symbols: instrument.dataSymbols,
    selected_symbol: historicalDataset.metadata.dataSymbol,
    selected_symbol_relation: historicalDataset.metadata.dataSymbolRelation,
    timeframe_base: "1m",
    timeframes: historicalDataset.metadata.timeframes,
    from: historicalDataset.metadata.from,
    to: historicalDataset.metadata.to,
    timezone: resolveTimezone(config),
    adjustment_policy: resolveAdjustmentPolicy({
      config,
      instrument: instrument.instrument,
      marketType: instrument.marketType,
    }),
    row_counts: historicalDataset.metadata.candleCounts,
    files: await buildFileRefs(files),
    comparability: {
      canonical_provider: config.study.providerComparability?.canonicalProvider ?? selectedProvider,
      fallback_providers: config.study.providerComparability?.fallbackProviders ?? [],
      preserve_provenance: config.study.providerComparability?.preserveProvenance ?? true,
    },
  };
}

function buildSnapshotPayload(config: ResearchConfig, instruments: ResearchScientificDatasetInstrumentSnapshot[]) {
  const timezone = resolveTimezone(config);
  const selectedProviders = Array.from(new Set(instruments.map((entry) => entry.selected_provider))).sort();
  const base = {
    schema_version: "research.scientific-dataset-snapshot.v1" as const,
    dataset_id: `research_${config.liveBaselineSource.datasetProfile}_${sha256Json({
      instruments: config.study.instruments.slice().sort(),
      timeframes: config.study.timeframes,
      sourcePreference: config.study.sourcePreference,
      yearlyPeriods: config.study.yearlyPeriods,
      crisisPeriods: config.study.crisisPeriods,
      walkForward: config.study.walkForward,
      robustness: config.study.robustness ?? null,
    }).slice(0, 12)}`,
    dataset_profile: config.liveBaselineSource.datasetProfile,
    source_preference: config.study.sourcePreference,
    timezone,
    universe: resolveUniverseLabel(config),
    periods: {
      yearly: config.study.yearlyPeriods ?? [],
      crisis: config.study.crisisPeriods,
      walk_forward: config.study.walkForward,
      robustness: config.study.robustness ?? null,
    },
    instruments,
    provider_matrix: {
      canonical_provider: config.study.providerComparability?.canonicalProvider ?? selectedProviders[0] ?? "local_archive",
      fallback_providers: config.study.providerComparability?.fallbackProviders ?? [],
      selected_providers: selectedProviders,
    },
  };
  const datasetVersion = sha256Json(base);
  return {
    ...base,
    dataset_version: datasetVersion,
    snapshot_id: `snapshot-${datasetVersion}`,
    created_at: new Date().toISOString(),
    content_address: datasetVersion,
  } satisfies ResearchScientificDatasetSnapshot;
}

export async function ensureResearchScientificDatasetSnapshot(
  config: ResearchConfig,
): Promise<ResearchScientificDatasetSnapshot> {
  const instruments = await Promise.all(
    config.study.instruments.slice().sort().map((instrument) => buildInstrumentSnapshot(config, instrument)),
  );
  const snapshot = buildSnapshotPayload(config, instruments);
  const snapshotDir = resolveSnapshotDir(config);
  const snapshotPath = path.join(snapshotDir, `${snapshot.snapshot_id}.json`);
  if (!(await fileExists(snapshotPath))) {
    await ensureDirectory(snapshotDir);
    await writeJsonAtomic(snapshotPath, snapshot);
  }
  return (await readJsonIfExists<ResearchScientificDatasetSnapshot>(snapshotPath)) ?? snapshot;
}

export function scientificDatasetSnapshotToReference(
  snapshot: ResearchScientificDatasetSnapshot,
  config: ResearchConfig,
): ResearchDatasetReference {
  const snapshotPath = path.join(resolveSnapshotDir(config), `${snapshot.snapshot_id}.json`);
  return {
    dataset_id: snapshot.dataset_id,
    dataset_version: snapshot.dataset_version,
    status: "ready",
    generated_at: snapshot.created_at,
    source_path: snapshotPath,
    snapshot_id: snapshot.snapshot_id,
    content_address: snapshot.content_address,
    checksum: null,
  };
}

export async function scientificDatasetSnapshotToRegistryEntry(
  snapshot: ResearchScientificDatasetSnapshot,
  config: ResearchConfig,
): Promise<ResearchRegistryDatasetEntry> {
  const snapshotPath = path.join(resolveSnapshotDir(config), `${snapshot.snapshot_id}.json`);
  const snapshotChecksum = await sha256File(snapshotPath);
  return {
    dataset_id: snapshot.dataset_id,
    dataset_version: snapshot.dataset_version,
    kind: "scientific_snapshot",
    owner: "research_lab",
    status: "ready",
    source_path: snapshotPath,
    generated_at: snapshot.created_at,
    snapshot_id: snapshot.snapshot_id,
    content_address: snapshot.content_address,
    data_plane: {
      tier: "gold",
      storage: {
        kind: "content_addressed_snapshot",
        primary_root: snapshotPath,
        secondary_root: config.study.datasetLocalDataRoot ?? null,
        format: snapshot.schema_version,
      },
      coverage: {
        scoped_items: snapshot.instruments.length,
        ready_items: snapshot.instruments.length,
        gap_items: 0,
        coverage_ratio: snapshot.instruments.length > 0 ? 1 : null,
        gap_detected: false,
      },
      provider_quality: {
        providers: snapshot.provider_matrix.selected_providers,
        quality_gates: [config.liveBaselineSource.validationProfile],
        source_mode: "local_only",
      },
      integrity: {
        source_checksum: snapshotChecksum,
        verification_status: "verified",
        verified_items: snapshot.instruments.length,
        pending_items: 0,
        failed_items: 0,
      },
    },
    lineage: {
      config_paths: [],
      artifact_paths: snapshot.instruments.flatMap((entry) => entry.files.map((file) => file.path)),
    },
    payload: snapshot as unknown as Record<string, unknown>,
  };
}
