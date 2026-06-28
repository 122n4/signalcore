import path from "node:path";

import { loadResearchConfig } from "./config";
import { buildResearchDatasetHealthSummary } from "./datasetHealth";
import { readJsonIfExists } from "./fs";
import type {
  MarketDataBackfillPlanEntry,
  MarketDataBackfillPeriod,
  MarketDataBackfillRunReport,
} from "./marketDataBackfill";
import { readResearchDataHunterReport } from "./dataHunter";
import type { ResearchConfig } from "./types";

type SourceCatalog = {
  sources?: Array<{
    id?: string;
    provider?: string;
    kind?: string;
    access?: string;
    auto_download?: boolean;
    reference_url?: string;
    listing_url?: string;
    local_format?: string;
    markets?: Array<{
      instrument?: string;
      group?: string;
      symbol?: string;
      priority?: number;
      rationale?: string;
    }>;
  }>;
};

type StagingCatalog = {
  markets?: Array<{
    instrument: string;
    group: string;
    status: string;
    priority: number;
    rationale: string;
    expected_local_format: string;
    expected_symbol: string;
    target_path_segments: string[];
    source: {
      provider: string;
      kind: string;
      listing_url: string;
      reference_url: string;
    };
  }>;
};

export type ResearchDatasetRequirementStatus =
  | "existing"
  | "missing_manual"
  | "downloadable"
  | "unsupported"
  | "staged_only";

export type ResearchDatasetRequirementPriority = "P0" | "P1" | "P2";

export type ResearchDatasetRequirementRow = {
  instrument: string;
  periodLabel: string;
  timeframe: string;
  status: ResearchDatasetRequirementStatus;
  priority: ResearchDatasetRequirementPriority;
  expectedPath: string;
  recommendedSource: string;
  lastAuditAt: string | null;
  blocksCoreResearch: boolean;
  sourceScope: "active_lab" | "staged_market";
  group: string | null;
  dataSymbol: string | null;
  note: string | null;
};

export type ResearchDatasetRequirementsReport = {
  generatedAt: string;
  source: "backfill_latest_report" | "none";
  lastAuditAt: string | null;
  summary: {
    totalRows: number;
    officialGapCount: number;
    downloadableCount: number;
    manualCount: number;
    unsupportedCount: number;
    stagedOnlyCount: number;
    existingCount: number;
    blockingCount: number;
  };
  rows: ResearchDatasetRequirementRow[];
};

export type ResearchDataAcquisitionPlan = {
  generatedAt: string;
  mode: "safe_reuse_existing_pipeline";
  status: "ready" | "needs_sources" | "clear" | "unavailable";
  summary: {
    officialGapCount: number;
    downloadableCount: number;
    manualCount: number;
    unsupportedCount: number;
  };
  safeguards: Array<{
    id: string;
    label: string;
    status: "in_place" | "attention";
    detail: string;
  }>;
  steps: Array<{
    id: string;
    label: string;
    command: string;
    purpose: string;
  }>;
  pendingRows: ResearchDatasetRequirementRow[];
  logs: string[];
  reports: string[];
};

function normalizeInstrument(value: string | undefined | null) {
  return String(value ?? "").trim().toUpperCase();
}

function inferTimeframe(localFormat: string | null | undefined) {
  if (!localFormat) return "n/a";
  if (localFormat.includes("m1") || localFormat.includes("M1")) return "M1";
  if (localFormat.includes("1m")) return "1m";
  if (localFormat.includes("daily")) return "1D";
  return localFormat;
}

function toPriority(value: number | null | undefined): ResearchDatasetRequirementPriority {
  if ((value ?? 0) >= 80) return "P1";
  return "P2";
}

function sourceLabel(source: {
  provider?: string;
  access?: string;
  kind?: string;
  listing_url?: string;
} | null | undefined) {
  if (!source) return "Canonical local dataset";
  const provider = String(source.provider ?? "Unknown");
  const access = String(source.access ?? source.kind ?? "").trim();
  const listingUrl = String(source.listing_url ?? "").trim();
  return [provider, access, listingUrl].filter(Boolean).join(" • ");
}

function activeInstrumentSource(entry: MarketDataBackfillPlanEntry) {
  if (entry.localFormat === "crypto_binance_monthly_m1") {
    return "Binance • official_public_archive • https://data.binance.vision/";
  }
  return `${entry.dataSymbol ?? entry.instrument} • canonical local historical dataset`;
}

function displayStatus(entry: MarketDataBackfillPlanEntry, period: MarketDataBackfillPeriod): ResearchDatasetRequirementStatus {
  if (entry.source === "staged_market" && period.status === "existing") {
    return "staged_only";
  }
  if (period.status === "missing_downloadable") {
    return "downloadable";
  }
  return period.status;
}

async function readBackfillLatestReport(config: ResearchConfig) {
  return readJsonIfExists<MarketDataBackfillRunReport>(
    path.join(config.paths.reportsDir, "datasets", "market-data-backfill-latest.json"),
  );
}

async function readSourceCatalog() {
  return readJsonIfExists<SourceCatalog>("config/trading-research/market-data-source-catalog.json");
}

async function readStagingCatalog() {
  return readJsonIfExists<StagingCatalog>("config/trading-research/market-staging-catalog.json");
}

function buildSourceIndex(sourceCatalog: SourceCatalog | null) {
  const byInstrument = new Map<
    string,
    {
      provider?: string;
      access?: string;
      kind?: string;
      listing_url?: string;
      priority?: number;
    }
  >();

  for (const source of sourceCatalog?.sources ?? []) {
    for (const market of source.markets ?? []) {
      const instrument = normalizeInstrument(market.instrument);
      if (!instrument) continue;
      byInstrument.set(instrument, {
        provider: source.provider,
        access: source.access,
        kind: source.kind,
        listing_url: source.listing_url,
        priority: market.priority,
      });
    }
  }

  return byInstrument;
}

function buildStagingIndex(stagingCatalog: StagingCatalog | null) {
  const byInstrument = new Map<
    string,
    {
      provider?: string;
      kind?: string;
      listing_url?: string;
      priority?: number;
      status?: string;
    }
  >();

  for (const market of stagingCatalog?.markets ?? []) {
    const instrument = normalizeInstrument(market.instrument);
    if (!instrument) continue;
    byInstrument.set(instrument, {
      provider: market.source.provider,
      kind: market.source.kind,
      listing_url: market.source.listing_url,
      priority: market.priority,
      status: market.status,
    });
  }

  return byInstrument;
}

export async function buildResearchDatasetRequirementsReport(
  config?: ResearchConfig,
): Promise<ResearchDatasetRequirementsReport> {
  const resolvedConfig = config ?? await loadResearchConfig();
  const [backfill, sourceCatalog, stagingCatalog] = await Promise.all([
    readBackfillLatestReport(resolvedConfig),
    readSourceCatalog(),
    readStagingCatalog(),
  ]);

  if (!backfill) {
    return {
      generatedAt: new Date().toISOString(),
      source: "none",
      lastAuditAt: null,
      summary: {
        totalRows: 0,
        officialGapCount: 0,
        downloadableCount: 0,
        manualCount: 0,
        unsupportedCount: 0,
        stagedOnlyCount: 0,
        existingCount: 0,
        blockingCount: 0,
      },
      rows: [],
    };
  }

  const activeSet = new Set(resolvedConfig.study.instruments.map(normalizeInstrument));
  const sourceIndex = buildSourceIndex(sourceCatalog);
  const stagingIndex = buildStagingIndex(stagingCatalog);

  const rows = backfill.after.entries.flatMap((entry) =>
    entry.periods.map((period) => {
      const instrument = normalizeInstrument(entry.instrument);
      const status = displayStatus(entry, period);
      const sourceMeta =
        entry.source === "staged_market" ? stagingIndex.get(instrument) : sourceIndex.get(instrument);
      const priority =
        entry.source === "active_lab"
          ? "P0"
          : toPriority(sourceMeta?.priority ?? stagingIndex.get(instrument)?.priority ?? null);
      const blocksCoreResearch = activeSet.has(instrument) && status !== "existing";
      return {
        instrument,
        periodLabel: period.label,
        timeframe: inferTimeframe(entry.localFormat),
        status,
        priority,
        expectedPath: period.targetPath,
        recommendedSource:
          entry.source === "active_lab"
            ? sourceMeta
              ? sourceLabel(sourceMeta)
              : activeInstrumentSource(entry)
            : sourceLabel(sourceMeta),
        lastAuditAt: backfill.generatedAt ?? null,
        blocksCoreResearch,
        sourceScope: entry.source,
        group: entry.group,
        dataSymbol: entry.dataSymbol,
        note: period.note,
      } satisfies ResearchDatasetRequirementRow;
    }),
  );

  const summary = rows.reduce(
    (acc, row) => {
      acc.totalRows += 1;
      if (row.status === "downloadable") acc.downloadableCount += 1;
      if (row.status === "missing_manual") acc.manualCount += 1;
      if (row.status === "unsupported") acc.unsupportedCount += 1;
      if (row.status === "staged_only") acc.stagedOnlyCount += 1;
      if (row.status === "existing") acc.existingCount += 1;
      if (row.blocksCoreResearch) acc.blockingCount += 1;
      return acc;
    },
    {
      totalRows: 0,
      officialGapCount: 0,
      downloadableCount: 0,
      manualCount: 0,
      unsupportedCount: 0,
      stagedOnlyCount: 0,
      existingCount: 0,
      blockingCount: 0,
    },
  );
  summary.officialGapCount = summary.downloadableCount + summary.manualCount;

  return {
    generatedAt: new Date().toISOString(),
    source: "backfill_latest_report",
    lastAuditAt: backfill.generatedAt ?? null,
    summary,
    rows,
  };
}

export async function buildResearchDataAcquisitionPlan(
  config?: ResearchConfig,
): Promise<ResearchDataAcquisitionPlan> {
  const resolvedConfig = config ?? await loadResearchConfig();
  const [requirements, dataHunter, datasetHealth] = await Promise.all([
    buildResearchDatasetRequirementsReport(resolvedConfig),
    readResearchDataHunterReport(resolvedConfig),
    buildResearchDatasetHealthSummary(resolvedConfig),
  ]);

  const pendingRows = requirements.rows.filter((row) =>
    row.status === "downloadable" || row.status === "missing_manual" || row.status === "unsupported",
  );
  const downloadableCount = pendingRows.filter((row) => row.status === "downloadable").length;
  const manualCount = pendingRows.filter((row) => row.status === "missing_manual").length;
  const unsupportedCount = pendingRows.filter((row) => row.status === "unsupported").length;
  const officialGapCount = downloadableCount + manualCount;

  const safeguards: ResearchDataAcquisitionPlan["safeguards"] = [
    {
      id: "catalog_detection",
      label: "Detect gaps from official catalog",
      status: requirements.source === "backfill_latest_report" ? "in_place" : "attention",
      detail: "Uses the canonical backfill report plus approved source/staging catalogs already maintained by the Research Lab.",
    },
    {
      id: "authorized_source_resolution",
      label: "Identify authorized source only",
      status: pendingRows.every((row) => Boolean(row.recommendedSource)) ? "in_place" : "attention",
      detail: "Source resolution stays inside the approved source catalog and staging catalog; no random providers are introduced.",
    },
    {
      id: "no_overwrite_default",
      label: "Never overwrite existing files by default",
      status: "in_place",
      detail: "The existing backfill pipeline runs with force=false by default, so acquisition stays additive unless an operator overrides it deliberately.",
    },
    {
      id: "validation_chain",
      label: "Validate format, checksum and coverage",
      status: "in_place",
      detail: "Backfill/dataset-health already provide checksum/coverage evidence; staged promotion remains blocked until coverage audit passes.",
    },
    {
      id: "no_parallel_pipeline",
      label: "Reuse the existing pipeline only",
      status: "in_place",
      detail: "Safe acquisition continues to use dataHunter, marketDataBackfill, datasetHealth, sourceCatalog and artifact-backed reports.",
    },
    {
      id: "promotion_block",
      label: "No auto-promotion of data",
      status: "in_place",
      detail: datasetHealth.audit_loaded
        ? "Coverage audit is already part of the evidence chain; data acquisition does not auto-promote staged markets into the core."
        : "Coverage audit report is missing, so promotion should remain blocked until it is regenerated.",
    },
  ];

  const status: ResearchDataAcquisitionPlan["status"] =
    requirements.source === "none"
      ? "unavailable"
      : officialGapCount > 0 || unsupportedCount > 0 || dataHunter?.status === "needs_sources"
        ? "needs_sources"
        : "clear";

  return {
    generatedAt: new Date().toISOString(),
    mode: "safe_reuse_existing_pipeline",
    status,
    summary: {
      officialGapCount,
      downloadableCount,
      manualCount,
      unsupportedCount,
    },
    safeguards,
    steps: [
      {
        id: "detect",
        label: "Audit gaps",
        command: "npm run research:data-hunter",
        purpose: "Detect canonical gaps and classify them as downloadable, manual or unsupported.",
      },
      {
        id: "acquire",
        label: "Acquire only approved data",
        command: "npm run research:data-backfill",
        purpose: "Use the existing safe backfill pipeline to stage/download approved datasets without overwriting existing files by default.",
      },
      {
        id: "validate",
        label: "Validate coverage health",
        command: "npm run research:data-health",
        purpose: "Confirm coverage and dataset evidence before any staged market is treated as trustworthy.",
      },
      {
        id: "publish",
        label: "Sync operational state",
        command: "npm run research:sync",
        purpose: "Publish the canonical VPS/worker state to Supabase so /ops/lab stays aligned with the worker source of truth.",
      },
    ],
    pendingRows,
    logs: [
      "artifacts/trading-research/runtime/pm2-backfill.out.log",
      "artifacts/trading-research/runtime/pm2-backfill.err.log",
      "artifacts/trading-research/runtime/pm2-data-hunter.out.log",
      "artifacts/trading-research/runtime/pm2-data-hunter.err.log",
    ],
    reports: [
      path.join(resolvedConfig.paths.reportsDir, "datasets", "market-data-backfill-latest.json"),
      path.join(resolvedConfig.paths.reportsDir, "datasets", "research-data-hunter-latest.json"),
      path.join(resolvedConfig.paths.reportsDir, "datasets", "dataset-health-latest.json"),
    ],
  };
}
