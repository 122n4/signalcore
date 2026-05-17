import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { buildBinanceMonthlyKlineZipUrl, type TradingOfficialSyncMonth } from "@/lib/trading/backtest";

import { loadResearchConfig } from "./config";
import { readJsonIfExists, writeJsonAtomic } from "./fs";
import type { ResearchConfig } from "./types";

type MarketDataSourceCatalog = {
  version: number;
  safety_rules?: string[];
  sources?: MarketDataSource[];
};

type MarketDataSource = {
  id: string;
  provider: string;
  kind: string;
  access: "direct_download" | "manual_download" | "reference_only";
  auto_download: boolean;
  license_note: string;
  reference_url: string;
  listing_url: string;
  local_format: string;
  quality_gate: string;
  markets: MarketDataSourceMarket[];
};

type MarketDataSourceMarket = {
  instrument: string;
  group: string;
  symbol: string;
  priority: number;
  rationale: string;
};

type StagingCatalog = {
  version?: number;
  generated_for?: string;
  notes?: string[];
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

export type MarketDataHarvestCandidate = {
  instrument: string;
  group: string;
  symbol: string;
  provider: string;
  sourceId: string;
  sourceKind: string;
  access: MarketDataSource["access"];
  priority: number;
  rationale: string;
  localFormat: string;
  qualityGate: string;
  licenseNote: string;
  listingUrl: string;
  referenceUrl: string;
  sampleRemoteUrl: string | null;
  status:
    | "active_lab"
    | "already_staged"
    | "new_staging_candidate"
    | "reference_only"
    | "unsupported";
  action:
    | "backfill_active"
    | "stage_candidate"
    | "manual_source_review"
    | "reference_only_review"
    | "ignore";
  safety: {
    promotionBlocked: boolean;
    reason: string;
  };
};

export type MarketDataHarvestPlan = {
  generatedAt: string;
  sourceCatalogPath: string;
  stagingCatalogPath: string;
  activeInstruments: string[];
  safetyRules: string[];
  candidates: MarketDataHarvestCandidate[];
  summary: {
    candidates: number;
    activeLab: number;
    alreadyStaged: number;
    newStagingCandidates: number;
    directDownload: number;
    manualReview: number;
    referenceOnly: number;
    unsupported: number;
  };
};

export type MarketDataHarvestRunReport = {
  ok: boolean;
  generatedAt: string;
  dryRun: boolean;
  updateStaging: boolean;
  plan: MarketDataHarvestPlan;
  stagingUpdate: {
    attempted: boolean;
    added: number;
    skippedExisting: number;
    path: string;
  };
  outputs: {
    jsonPath: string;
    markdownPath: string;
  };
};

const DEFAULT_SOURCE_CATALOG_PATH = "config/trading-research/market-data-source-catalog.json";
const DEFAULT_STAGING_CATALOG_PATH = "config/trading-research/market-staging-catalog.json";

function reportsDir(customDir?: string | null) {
  return path.resolve(customDir ?? "artifacts/trading-research/reports/datasets");
}

function previousCompleteMonth(): TradingOfficialSyncMonth {
  const cursor = new Date();
  cursor.setUTCDate(1);
  cursor.setUTCHours(0, 0, 0, 0);
  cursor.setUTCMonth(cursor.getUTCMonth() - 1);
  return {
    year: cursor.getUTCFullYear(),
    month: cursor.getUTCMonth() + 1,
  };
}

function normalizeInstrument(value: string) {
  return String(value || "").trim().toUpperCase();
}

function targetPathSegments(group: string, instrument: string) {
  return [group.toLowerCase(), instrument.toLowerCase()];
}

function sampleRemoteUrl(source: MarketDataSource, market: MarketDataSourceMarket) {
  if (source.id === "binance_spot_monthly_klines") {
    return buildBinanceMonthlyKlineZipUrl(market.symbol, previousCompleteMonth());
  }

  return source.listing_url || source.reference_url || null;
}

function candidateStatus(args: {
  source: MarketDataSource;
  instrument: string;
  active: Set<string>;
  staged: Set<string>;
}): MarketDataHarvestCandidate["status"] {
  if (args.source.access === "reference_only") return "reference_only";
  if (!args.source.local_format || args.source.local_format === "reference_daily_only") return "unsupported";
  if (args.active.has(args.instrument)) return "active_lab";
  if (args.staged.has(args.instrument)) return "already_staged";
  return "new_staging_candidate";
}

function candidateAction(args: {
  source: MarketDataSource;
  status: MarketDataHarvestCandidate["status"];
}): MarketDataHarvestCandidate["action"] {
  if (args.status === "active_lab" && args.source.auto_download) return "backfill_active";
  if (args.status === "new_staging_candidate" && args.source.access !== "reference_only") return "stage_candidate";
  if (args.status === "already_staged" && args.source.access === "manual_download") return "manual_source_review";
  if (args.status === "reference_only") return "reference_only_review";
  if (args.status === "unsupported") return "ignore";
  return "manual_source_review";
}

function summarize(candidates: MarketDataHarvestCandidate[]): MarketDataHarvestPlan["summary"] {
  return {
    candidates: candidates.length,
    activeLab: candidates.filter((candidate) => candidate.status === "active_lab").length,
    alreadyStaged: candidates.filter((candidate) => candidate.status === "already_staged").length,
    newStagingCandidates: candidates.filter((candidate) => candidate.status === "new_staging_candidate").length,
    directDownload: candidates.filter((candidate) => candidate.access === "direct_download").length,
    manualReview: candidates.filter((candidate) => candidate.access === "manual_download").length,
    referenceOnly: candidates.filter((candidate) => candidate.access === "reference_only").length,
    unsupported: candidates.filter((candidate) => candidate.status === "unsupported").length,
  };
}

export async function buildMarketDataHarvestPlan(args: {
  config?: ResearchConfig;
  sourceCatalogPath?: string;
  stagingCatalogPath?: string;
} = {}): Promise<MarketDataHarvestPlan> {
  const config = args.config ?? await loadResearchConfig();
  const sourceCatalogPath = args.sourceCatalogPath ?? DEFAULT_SOURCE_CATALOG_PATH;
  const stagingCatalogPath = args.stagingCatalogPath ?? DEFAULT_STAGING_CATALOG_PATH;
  const sourceCatalog = await readJsonIfExists<MarketDataSourceCatalog>(sourceCatalogPath);
  const stagingCatalog = await readJsonIfExists<StagingCatalog>(stagingCatalogPath);
  const active = new Set(config.study.instruments.map(normalizeInstrument));
  const staged = new Set((stagingCatalog?.markets ?? []).map((market) => normalizeInstrument(market.instrument)));
  const candidates: MarketDataHarvestCandidate[] = [];

  for (const source of sourceCatalog?.sources ?? []) {
    for (const market of source.markets ?? []) {
      const instrument = normalizeInstrument(market.instrument);
      const status = candidateStatus({
        source,
        instrument,
        active,
        staged,
      });
      const action = candidateAction({ source, status });

      candidates.push({
        instrument,
        group: market.group,
        symbol: market.symbol,
        provider: source.provider,
        sourceId: source.id,
        sourceKind: source.kind,
        access: source.access,
        priority: market.priority,
        rationale: market.rationale,
        localFormat: source.local_format,
        qualityGate: source.quality_gate,
        licenseNote: source.license_note,
        listingUrl: source.listing_url,
        referenceUrl: source.reference_url,
        sampleRemoteUrl: sampleRemoteUrl(source, market),
        status,
        action,
        safety: {
          promotionBlocked: true,
          reason: "Harvesting only prepares or audits data. Promotion requires coverage, walk-forward, crisis, cost stress and manual owner review.",
        },
      });
    }
  }

  candidates.sort((left, right) => {
    if (left.status !== right.status) {
      const order = ["active_lab", "new_staging_candidate", "already_staged", "manual_source_review", "reference_only", "unsupported"];
      return order.indexOf(left.status) - order.indexOf(right.status);
    }
    return right.priority - left.priority || left.instrument.localeCompare(right.instrument);
  });

  return {
    generatedAt: new Date().toISOString(),
    sourceCatalogPath,
    stagingCatalogPath,
    activeInstruments: [...active].sort(),
    safetyRules: sourceCatalog?.safety_rules ?? [],
    candidates,
    summary: summarize(candidates),
  };
}

function toStagingMarket(candidate: MarketDataHarvestCandidate): NonNullable<StagingCatalog["markets"]>[number] {
  return {
    instrument: candidate.instrument,
    group: candidate.group,
    status: "staged_only",
    priority: candidate.priority,
    rationale: candidate.rationale,
    expected_local_format: candidate.localFormat,
    expected_symbol: candidate.symbol,
    target_path_segments: targetPathSegments(candidate.group, candidate.instrument),
    source: {
      provider: candidate.provider,
      kind: candidate.sourceKind,
      listing_url: candidate.listingUrl,
      reference_url: candidate.referenceUrl,
    },
  };
}

async function updateStagingCatalog(plan: MarketDataHarvestPlan): Promise<MarketDataHarvestRunReport["stagingUpdate"]> {
  const current = await readJsonIfExists<StagingCatalog>(plan.stagingCatalogPath);
  const markets = [...(current?.markets ?? [])];
  const existing = new Set(markets.map((market) => normalizeInstrument(market.instrument)));
  let added = 0;
  let skippedExisting = 0;

  for (const candidate of plan.candidates) {
    if (candidate.action !== "stage_candidate") continue;
    if (existing.has(candidate.instrument)) {
      skippedExisting += 1;
      continue;
    }
    markets.push(toStagingMarket(candidate));
    existing.add(candidate.instrument);
    added += 1;
  }

  if (added > 0) {
    markets.sort((left, right) => right.priority - left.priority || left.instrument.localeCompare(right.instrument));
    await writeJsonAtomic(plan.stagingCatalogPath, {
      version: current?.version ?? 1,
      generated_for: current?.generated_for ?? "research_staging_only",
      notes: current?.notes ?? [
        "These markets are prepared for future expansion only.",
        "Nothing in this catalog is auto-added to the live core or active research planner.",
      ],
      markets,
    });
  }

  return {
    attempted: true,
    added,
    skippedExisting,
    path: plan.stagingCatalogPath,
  };
}

async function writeHarvestMarkdown(report: MarketDataHarvestRunReport, targetPath: string) {
  const lines = [
    "# Market Data Harvester",
    "",
    `Generated at: ${report.generatedAt}`,
    `Dry run: ${report.dryRun ? "yes" : "no"}`,
    `Staging update: ${report.stagingUpdate.attempted ? `yes (${report.stagingUpdate.added} added)` : "no"}`,
    "",
    "## Safety Rules",
    "",
    ...report.plan.safetyRules.map((rule) => `- ${rule}`),
    "",
    "## Summary",
    "",
    `- Candidates: ${report.plan.summary.candidates}`,
    `- Active lab: ${report.plan.summary.activeLab}`,
    `- New staging candidates: ${report.plan.summary.newStagingCandidates}`,
    `- Already staged: ${report.plan.summary.alreadyStaged}`,
    `- Direct download sources: ${report.plan.summary.directDownload}`,
    `- Manual review sources: ${report.plan.summary.manualReview}`,
    `- Reference only: ${report.plan.summary.referenceOnly}`,
    "",
    "## Next Candidates",
    "",
  ];

  const staged = report.plan.candidates
    .filter((candidate) => candidate.action === "stage_candidate")
    .slice(0, 30);
  lines.push(...(staged.length > 0
    ? staged.map((candidate) => `- ${candidate.instrument} (${candidate.provider}, ${candidate.localFormat}): ${candidate.rationale}`)
    : ["- No new staging candidates."]));
  lines.push(
    "",
    "## Active Backfill",
    "",
    ...report.plan.candidates
      .filter((candidate) => candidate.action === "backfill_active")
      .map((candidate) => `- ${candidate.instrument}: ${candidate.sampleRemoteUrl ?? candidate.listingUrl}`),
  );

  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, `${lines.join("\n")}\n`, "utf8");
}

export async function runMarketDataHarvester(args: {
  updateStaging?: boolean;
  dryRun?: boolean;
  reportsDir?: string | null;
  sourceCatalogPath?: string;
  stagingCatalogPath?: string;
} = {}): Promise<MarketDataHarvestRunReport> {
  const plan = await buildMarketDataHarvestPlan({
    sourceCatalogPath: args.sourceCatalogPath,
    stagingCatalogPath: args.stagingCatalogPath,
  });
  const outputDir = reportsDir(args.reportsDir);
  const jsonPath = path.join(outputDir, "market-data-harvest-latest.json");
  const markdownPath = path.join(outputDir, "market-data-harvest-latest.md");
  const stagingUpdate = args.updateStaging && !args.dryRun
    ? await updateStagingCatalog(plan)
    : {
        attempted: false,
        added: 0,
        skippedExisting: 0,
        path: plan.stagingCatalogPath,
      };
  const report: MarketDataHarvestRunReport = {
    ok: true,
    generatedAt: new Date().toISOString(),
    dryRun: Boolean(args.dryRun),
    updateStaging: Boolean(args.updateStaging),
    plan,
    stagingUpdate,
    outputs: {
      jsonPath,
      markdownPath,
    },
  };

  await mkdir(outputDir, { recursive: true });
  await writeJsonAtomic(jsonPath, report);
  await writeHarvestMarkdown(report, markdownPath);
  return report;
}
