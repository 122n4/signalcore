import { writeFile } from "node:fs/promises";
import path from "node:path";

import { loadResearchConfig } from "./config";
import { ensureDirectory, readJsonIfExists, writeJsonAtomic } from "./fs";
import {
  runTradingMarketDataBackfill,
  type MarketDataBackfillPeriodStatus,
  type MarketDataBackfillRunReport,
} from "./marketDataBackfill";
import type { ResearchConfig } from "./types";

export type ResearchDataHunterStatus = "ok" | "needs_backfill" | "needs_sources" | "error";

export type ResearchDataHunterProvider = {
  id: string;
  label: string;
  configured: boolean;
  role: string;
};

export type ResearchDataNeededEntry = {
  instrument: string;
  periodLabel: string;
  status: MarketDataBackfillPeriodStatus;
  source: string;
  group: string | null;
  dataSymbol: string | null;
  targetPath: string;
  remoteUrl: string | null;
  note: string | null;
};

export type ResearchDataHunterReport = {
  ok: boolean;
  status: ResearchDataHunterStatus;
  generatedAt: string;
  nextAction: string;
  coverage: {
    instruments: number;
    periods: number;
    existing: number;
    missingDownloadable: number;
    missingManual: number;
    unsupported: number;
    stagedDownloaded: number;
    stagedExisting: number;
    stagedFailed: number;
  };
  providers: ResearchDataHunterProvider[];
  needed: {
    downloadable: ResearchDataNeededEntry[];
    manual: ResearchDataNeededEntry[];
    unsupported: ResearchDataNeededEntry[];
  };
  outputs: {
    jsonPath: string;
    markdownPath: string;
    backfillReportPath: string | null;
  };
  backfill: Pick<MarketDataBackfillRunReport, "generatedAt" | "request" | "outputs">;
};

export type ResearchDataHunterRequest = {
  config?: ResearchConfig;
  download?: boolean;
  maxRowsPerBucket?: number;
};

const DEFAULT_MAX_ROWS_PER_BUCKET = 80;

function providerConfigured(...names: string[]) {
  return names.some((name) => Boolean(process.env[name]?.trim()));
}

function providerInventory(): ResearchDataHunterProvider[] {
  return [
    {
      id: "official_archives",
      label: "Official public archives",
      configured: true,
      role: "Bulk historical candles where official archive support exists.",
    },
    {
      id: "twelvedata",
      label: "Twelve Data",
      configured: providerConfigured("TWELVEDATA_API_KEY", "TWELVEDATA_API_KEYS"),
      role: "Live/intraday fallback coverage when API quota is available.",
    },
    {
      id: "fmp",
      label: "Financial Modeling Prep",
      configured: providerConfigured("FMP_API_KEY"),
      role: "Equities, indices and fundamentals coverage.",
    },
    {
      id: "finnhub",
      label: "Finnhub",
      configured: providerConfigured("FINNHUB_API_KEY"),
      role: "Market data fallback and company metadata.",
    },
    {
      id: "alpha_vantage",
      label: "Alpha Vantage",
      configured: providerConfigured("ALPHA_VANTAGE_API_KEY"),
      role: "Slow but useful fallback for supported OHLC datasets.",
    },
  ];
}

function reportsDir(config: ResearchConfig) {
  return path.join(config.paths.reportsDir, "datasets");
}

function collectNeeded(
  backfill: MarketDataBackfillRunReport,
  status: MarketDataBackfillPeriodStatus,
  limit: number,
): ResearchDataNeededEntry[] {
  const rows: ResearchDataNeededEntry[] = [];
  for (const entry of backfill.after.entries) {
    for (const period of entry.periods) {
      if (period.status !== status) continue;
      rows.push({
        instrument: entry.instrument,
        periodLabel: period.label,
        status: period.status,
        source: entry.source,
        group: entry.group,
        dataSymbol: entry.dataSymbol,
        targetPath: period.targetPath,
        remoteUrl: period.remoteUrl,
        note: period.note,
      });
      if (rows.length >= limit) return rows;
    }
  }
  return rows;
}

function resolveStatus(summary: MarketDataBackfillRunReport["after"]["summary"]): ResearchDataHunterStatus {
  if (summary.missingDownloadable > 0) return "needs_backfill";
  if (summary.missingManual > 0 || summary.unsupported > 0) return "needs_sources";
  return "ok";
}

function nextAction(status: ResearchDataHunterStatus, summary: MarketDataBackfillRunReport["after"]["summary"]) {
  if (status === "needs_backfill") {
    return `Download ${summary.missingDownloadable} supported candle gaps before trusting fresh candidates.`;
  }
  if (status === "needs_sources") {
    return `Lab can keep running, but ${summary.missingManual} manual gaps and ${summary.unsupported} unsupported periods need a new official source or manual dataset.`;
  }
  if (status === "error") {
    return "Data hunter failed. Check PM2 logs before relying on new research output.";
  }
  return "Coverage is clear for the supported automatic universe.";
}

async function writeMarkdown(report: ResearchDataHunterReport, targetPath: string) {
  const lines = [
    "# Research Data Hunter",
    "",
    `- Generated: ${report.generatedAt}`,
    `- Status: ${report.status}`,
    `- Next action: ${report.nextAction}`,
    "",
    "## Coverage",
    "",
    `- Existing: ${report.coverage.existing}`,
    `- Missing downloadable: ${report.coverage.missingDownloadable}`,
    `- Missing manual: ${report.coverage.missingManual}`,
    `- Unsupported: ${report.coverage.unsupported}`,
    "",
    "## Providers",
    "",
    ...report.providers.map((provider) =>
      `- ${provider.label}: ${provider.configured ? "configured" : "missing"} - ${provider.role}`,
    ),
    "",
    "## Needed Data",
    "",
    ...formatNeeded("Downloadable", report.needed.downloadable),
    ...formatNeeded("Manual", report.needed.manual),
    ...formatNeeded("Unsupported", report.needed.unsupported),
  ];
  await ensureDirectory(path.dirname(targetPath));
  await writeFile(targetPath, `${lines.join("\n")}\n`, "utf8");
}

function formatNeeded(title: string, rows: ResearchDataNeededEntry[]) {
  const lines = [`### ${title}`, ""];
  if (rows.length === 0) {
    lines.push("- None.");
    lines.push("");
    return lines;
  }
  lines.push(
    ...rows.map((row) =>
      `- ${row.instrument} ${row.periodLabel}: ${row.note ?? row.remoteUrl ?? row.targetPath}`,
    ),
    "",
  );
  return lines;
}

export async function buildResearchDataHunterReport(
  request: ResearchDataHunterRequest = {},
): Promise<ResearchDataHunterReport> {
  const config = request.config ?? await loadResearchConfig();
  const maxRows = request.maxRowsPerBucket ?? DEFAULT_MAX_ROWS_PER_BUCKET;
  const outputDir = reportsDir(config);
  const backfill = await runTradingMarketDataBackfill({
    download: request.download ?? true,
    includeStaged: true,
    runAudit: false,
    reportsDir: outputDir,
  });
  const summary = backfill.after.summary;
  const status = resolveStatus(summary);
  const generatedAt = new Date().toISOString();
  const stamp = generatedAt.replace(/[:.]/g, "-");
  const jsonPath = path.join(outputDir, "research-data-hunter-latest.json");
  const markdownPath = path.join(outputDir, "research-data-hunter-latest.md");
  const timestampedJsonPath = path.join(outputDir, `research-data-hunter-${stamp}.json`);
  const report: ResearchDataHunterReport = {
    ok: status !== "error",
    status,
    generatedAt,
    nextAction: nextAction(status, summary),
    coverage: {
      instruments: summary.instruments,
      periods: summary.periods,
      existing: summary.existing,
      missingDownloadable: summary.missingDownloadable,
      missingManual: summary.missingManual,
      unsupported: summary.unsupported,
      stagedDownloaded: backfill.sync.stagedSummary.downloaded,
      stagedExisting: backfill.sync.stagedSummary.existing,
      stagedFailed: backfill.sync.stagedSummary.failed,
    },
    providers: providerInventory(),
    needed: {
      downloadable: collectNeeded(backfill, "missing_downloadable", maxRows),
      manual: collectNeeded(backfill, "missing_manual", maxRows),
      unsupported: collectNeeded(backfill, "unsupported", maxRows),
    },
    outputs: {
      jsonPath,
      markdownPath,
      backfillReportPath: backfill.outputs.jsonPath,
    },
    backfill: {
      generatedAt: backfill.generatedAt,
      request: backfill.request,
      outputs: backfill.outputs,
    },
  };

  await writeJsonAtomic(jsonPath, report);
  await writeJsonAtomic(timestampedJsonPath, report);
  await writeMarkdown(report, markdownPath);

  return report;
}

export async function readResearchDataHunterReport(
  config?: ResearchConfig,
): Promise<ResearchDataHunterReport | null> {
  const resolvedConfig = config ?? await loadResearchConfig();
  return readJsonIfExists<ResearchDataHunterReport>(
    path.join(reportsDir(resolvedConfig), "research-data-hunter-latest.json"),
  );
}
