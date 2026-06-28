import path from "node:path";

import { DEFAULT_RESEARCH_CONFIG_PATH } from "./config";
import { buildResearchDatasetHealthSummary } from "./datasetHealth";
import { fileExists, readJsonIfExists, sha256File, sha256Json } from "./fs";
import type {
  ResearchConfig,
  ResearchDatasetReference,
  ResearchRegistryDatasetEntry,
} from "./types";

type HarvesterLatestReport = {
  generatedAt?: string;
  plan?: {
    sourceCatalogPath?: string;
    stagingCatalogPath?: string;
    summary?: {
      candidates?: number;
      activeLab?: number;
      newStagingCandidates?: number;
      alreadyStaged?: number;
      directDownload?: number;
      manualReview?: number;
      referenceOnly?: number;
      unsupported?: number;
    };
  };
};

type CoverageAuditSummaryEntry = {
  validPeriods?: number;
  invalidPeriods?: number;
  failedPeriods?: number;
  sources?: string[];
};

type CoverageAuditReport = {
  generatedAt?: string;
  request?: {
    instruments?: string[];
    sourcePreference?: string;
  };
  summary?: {
    byInstrument?: Record<string, CoverageAuditSummaryEntry>;
  };
};

type BackfillLatestSyncEntry = {
  checksumVerified?: boolean | null;
};

type BackfillLatestReport = {
  generatedAt?: string;
  after?: {
    summary?: {
      existing?: number;
      missingDownloadable?: number;
      missingManual?: number;
      unsupported?: number;
      periods?: number;
    };
    localDataDir?: string;
    stagingDataDir?: string;
  };
  sync?: {
    stagedResult?: BackfillLatestSyncEntry[];
  };
  coverageAudit?: {
    outputPath?: string | null;
    failures?: number | null;
  };
};

async function resolveSourceChecksum(sourcePath: string | null): Promise<string | null> {
  if (!sourcePath || !(await fileExists(sourcePath))) {
    return null;
  }

  return sha256File(sourcePath);
}

function toCoverageRatio(readyItems: number, scopedItems: number): number | null {
  if (scopedItems <= 0) {
    return null;
  }

  return Number((readyItems / scopedItems).toFixed(4));
}

async function buildCoverageAuditDataset(config: ResearchConfig): Promise<ResearchRegistryDatasetEntry> {
  const summary = await buildResearchDatasetHealthSummary(config);
  const sourcePath = config.paths.coverageAuditPath ?? null;
  const coverageAudit = sourcePath
    ? await readJsonIfExists<CoverageAuditReport>(sourcePath)
    : null;
  const byInstrument = coverageAudit?.summary?.byInstrument ?? {};
  const providers = [...new Set(
    Object.values(byInstrument)
      .flatMap((entry) => entry.sources ?? [])
      .map((value) => String(value).trim())
      .filter(Boolean),
  )].sort();
  const scopedItems = Object.keys(byInstrument).length || summary.eligible_instrument_count;
  const readyItems = Object.values(byInstrument).filter((entry) =>
    (entry.validPeriods ?? 0) > 0
    && (entry.invalidPeriods ?? 0) === 0
    && (entry.failedPeriods ?? 0) === 0,
  ).length || summary.eligible_instrument_count;
  const gapItems = Math.max(
    summary.missing_instrument_count,
    scopedItems > 0 ? Math.max(0, scopedItems - readyItems) : 0,
  );
  const status =
    !summary.audit_loaded
      ? "missing"
      : summary.suspended_instrument_count > 0
        ? "degraded"
        : "ready";
  const payload = {
    sourcePreference: config.study.sourcePreference,
    configuredInstruments: config.study.instruments,
    eligibleInstruments: summary.eligible_instruments,
    suspendedInstruments: summary.suspended_instruments,
    missingInstruments: summary.missing_instruments,
  };

  return {
    dataset_id: "coverage_audit_local_only",
    dataset_version: sha256Json({
      sourcePath,
      auditGeneratedAt: summary.audit_generated_at,
      payload,
    }),
    kind: "coverage_audit",
    owner: "research_lab",
    status,
    source_path: sourcePath,
    generated_at: summary.audit_generated_at,
    data_plane: {
      tier: "silver",
      storage: {
        kind: "local_file",
        primary_root: sourcePath ? path.dirname(sourcePath) : null,
        secondary_root: null,
        format: "coverage_audit_json",
      },
      coverage: {
        scoped_items: scopedItems,
        ready_items: readyItems,
        gap_items: gapItems,
        coverage_ratio: toCoverageRatio(readyItems, scopedItems),
        gap_detected: gapItems > 0,
      },
      provider_quality: {
        providers,
        quality_gates: ["historical_coverage_audit"],
        source_mode: "local_only",
      },
      integrity: {
        source_checksum: await resolveSourceChecksum(sourcePath),
        verification_status: sourcePath ? "verified" : "pending",
        verified_items: sourcePath ? 1 : 0,
        pending_items: sourcePath ? 0 : 1,
        failed_items: 0,
      },
    },
    lineage: {
      config_paths: [DEFAULT_RESEARCH_CONFIG_PATH],
      artifact_paths: sourcePath ? [sourcePath] : [],
    },
    payload,
  };
}

async function buildActiveUniverseDataset(config: ResearchConfig): Promise<ResearchRegistryDatasetEntry> {
  const coverageAuditPath = config.paths.coverageAuditPath ?? null;
  const payload = {
    liveBaselineId: config.liveBaselineSource.baselineId,
    datasetProfile: config.liveBaselineSource.datasetProfile,
    validationProfile: config.liveBaselineSource.validationProfile,
    instruments: config.study.instruments,
    timeframes: config.study.timeframes,
    sourcePreference: config.study.sourcePreference,
    yearlyPeriods: config.study.yearlyPeriods,
    crisisPeriods: config.study.crisisPeriods,
    walkForward: config.study.walkForward,
  };

  return {
    dataset_id: `active_research_universe_${config.liveBaselineSource.datasetProfile}`,
    dataset_version: sha256Json(payload),
    kind: "active_research_universe",
    owner: "research_lab",
    status: "ready",
    source_path: null,
    generated_at: new Date().toISOString(),
    data_plane: {
      tier: "gold",
      storage: {
        kind: "derived_manifest",
        primary_root: null,
        secondary_root: coverageAuditPath ? path.dirname(coverageAuditPath) : null,
        format: "research_universe_manifest",
      },
      coverage: {
        scoped_items: config.study.instruments.length,
        ready_items: config.study.instruments.length,
        gap_items: 0,
        coverage_ratio: config.study.instruments.length > 0 ? 1 : null,
        gap_detected: false,
      },
      provider_quality: {
        providers: [config.study.sourcePreference],
        quality_gates: [config.liveBaselineSource.validationProfile],
        source_mode: "derived",
      },
      integrity: {
        source_checksum: null,
        verification_status: "not_applicable",
        verified_items: 0,
        pending_items: 0,
        failed_items: 0,
      },
    },
    lineage: {
      config_paths: [DEFAULT_RESEARCH_CONFIG_PATH],
      artifact_paths: coverageAuditPath ? [coverageAuditPath] : [],
    },
    payload,
  };
}

async function buildBackfillDataset(config: ResearchConfig): Promise<ResearchRegistryDatasetEntry> {
  const sourcePath = path.join(config.paths.reportsDir, "datasets", "market-data-backfill-latest.json");
  const report = await readJsonIfExists<BackfillLatestReport>(sourcePath);
  const payload = {
    existing: report?.after?.summary?.existing ?? 0,
    missingDownloadable: report?.after?.summary?.missingDownloadable ?? 0,
    missingManual: report?.after?.summary?.missingManual ?? 0,
    unsupported: report?.after?.summary?.unsupported ?? 0,
  };
  const scopedItems = report?.after?.summary?.periods
    ?? (payload.existing + payload.missingDownloadable + payload.missingManual + payload.unsupported);
  const gapItems = payload.missingDownloadable + payload.missingManual;
  const stagedChecks = report?.sync?.stagedResult ?? [];
  const verifiedItems = stagedChecks.filter((entry) => entry.checksumVerified === true).length;
  const failedItems = stagedChecks.filter((entry) => entry.checksumVerified === false).length;
  const pendingItems = stagedChecks.filter((entry) => entry.checksumVerified == null).length;
  const verificationStatus =
    failedItems > 0
      ? "failed"
      : verifiedItems > 0
        ? "verified"
        : sourcePath && (await fileExists(sourcePath))
          ? "pending"
          : "pending";
  const status = !(await fileExists(sourcePath))
    ? "missing"
    : payload.missingDownloadable > 0 || payload.missingManual > 0
      ? "degraded"
      : "ready";

  return {
    dataset_id: "market_data_backfill_scope",
    dataset_version: sha256Json({
      sourcePath,
      generatedAt: report?.generatedAt ?? null,
      payload,
    }),
    kind: "market_data_backfill",
    owner: "research_lab",
    status,
    source_path: sourcePath,
    generated_at: report?.generatedAt ?? null,
    data_plane: {
      tier: "bronze",
      storage: {
        kind: "report_artifact",
        primary_root: report?.after?.localDataDir ?? path.resolve("Data/historical"),
        secondary_root: report?.after?.stagingDataDir ?? path.resolve("data/historical-staging"),
        format: "market_data_backfill_report",
      },
      coverage: {
        scoped_items: scopedItems,
        ready_items: payload.existing,
        gap_items: gapItems,
        coverage_ratio: toCoverageRatio(payload.existing, scopedItems),
        gap_detected: gapItems > 0 || payload.unsupported > 0,
      },
      provider_quality: {
        providers: ["binance", "local_archive"],
        quality_gates: ["official_archive_sync", "historical_coverage_audit"],
        source_mode: "mixed",
      },
      integrity: {
        source_checksum: await resolveSourceChecksum(sourcePath),
        verification_status: verificationStatus,
        verified_items: verifiedItems,
        pending_items: pendingItems,
        failed_items: failedItems,
      },
    },
    lineage: {
      config_paths: [DEFAULT_RESEARCH_CONFIG_PATH],
      artifact_paths: (await fileExists(sourcePath)) ? [sourcePath] : [],
    },
    payload,
  };
}

async function buildHarvesterDataset(config: ResearchConfig): Promise<ResearchRegistryDatasetEntry> {
  const sourcePath = path.join(config.paths.reportsDir, "datasets", "market-data-harvest-latest.json");
  const report = await readJsonIfExists<HarvesterLatestReport>(sourcePath);
  const sourceCatalogPath = report?.plan?.sourceCatalogPath ?? "config/trading-research/market-data-source-catalog.json";
  const sourceCatalog = await readJsonIfExists<{
    sources?: Array<{ provider?: string; quality_gate?: string }>;
  }>(sourceCatalogPath);
  const providers = [...new Set(
    (sourceCatalog?.sources ?? [])
      .map((source) => String(source.provider ?? "").trim().toLowerCase())
      .filter(Boolean),
  )].sort();
  const qualityGates = [...new Set(
    (sourceCatalog?.sources ?? [])
      .map((source) => String(source.quality_gate ?? "").trim())
      .filter(Boolean),
  )].sort();
  const payload = {
    candidates: report?.plan?.summary?.candidates ?? 0,
    activeLab: report?.plan?.summary?.activeLab ?? 0,
    newStagingCandidates: report?.plan?.summary?.newStagingCandidates ?? 0,
    alreadyStaged: report?.plan?.summary?.alreadyStaged ?? 0,
    directDownload: report?.plan?.summary?.directDownload ?? 0,
    manualReview: report?.plan?.summary?.manualReview ?? 0,
    referenceOnly: report?.plan?.summary?.referenceOnly ?? 0,
    unsupported: report?.plan?.summary?.unsupported ?? 0,
  };
  const hasFile = await fileExists(sourcePath);
  const scopedItems = payload.candidates;
  const readyItems = payload.activeLab + payload.alreadyStaged;
  const gapItems = payload.newStagingCandidates + payload.manualReview + payload.unsupported;

  return {
    dataset_id: "market_data_harvest_catalog",
    dataset_version: sha256Json({
      sourcePath,
      generatedAt: report?.generatedAt ?? null,
      payload,
    }),
    kind: "market_data_harvest",
    owner: "research_lab",
    status: hasFile ? "ready" : "missing",
    source_path: sourcePath,
    generated_at: report?.generatedAt ?? null,
    data_plane: {
      tier: "bronze",
      storage: {
        kind: "catalog",
        primary_root: sourceCatalogPath,
        secondary_root: report?.plan?.stagingCatalogPath ?? "config/trading-research/market-staging-catalog.json",
        format: "market_data_source_catalog",
      },
      coverage: {
        scoped_items: scopedItems,
        ready_items: readyItems,
        gap_items: gapItems,
        coverage_ratio: toCoverageRatio(readyItems, scopedItems),
        gap_detected: gapItems > 0,
      },
      provider_quality: {
        providers,
        quality_gates: qualityGates,
        source_mode: "provider_catalog",
      },
      integrity: {
        source_checksum: await resolveSourceChecksum(sourcePath),
        verification_status: hasFile ? "verified" : "pending",
        verified_items: hasFile ? 1 : 0,
        pending_items: hasFile ? 0 : 1,
        failed_items: 0,
      },
    },
    lineage: {
      config_paths: [DEFAULT_RESEARCH_CONFIG_PATH],
      artifact_paths: hasFile ? [sourcePath] : [],
    },
    payload,
  };
}

export async function buildResearchDatasetCatalog(
  config: ResearchConfig,
): Promise<ResearchRegistryDatasetEntry[]> {
  return Promise.all([
    buildCoverageAuditDataset(config),
    buildActiveUniverseDataset(config),
    buildBackfillDataset(config),
    buildHarvesterDataset(config),
  ]);
}

export function toResearchDatasetReference(
  dataset: ResearchRegistryDatasetEntry,
): ResearchDatasetReference {
  return {
    dataset_id: dataset.dataset_id,
    dataset_version: dataset.dataset_version,
    status: dataset.status,
    generated_at: dataset.generated_at,
    source_path: dataset.source_path,
  };
}
