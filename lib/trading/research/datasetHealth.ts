import path from "node:path";
import { writeFile } from "node:fs/promises";

import type { TradingHistoricalCoverageAuditReport } from "@/lib/trading/backtest";

import { ensureDirectory, readJsonIfExists, sanitizeFileSegment, writeJsonAtomic } from "./fs";
import { buildResearchReportProvenance } from "./provenance";
import { resolveResearchReportSchemaVersion } from "./schema";
import type {
  ResearchConfig,
  ResearchDatasetHealthInstrumentEntry,
  ResearchDatasetHealthReport,
  ResearchDatasetHealthStatus,
  ResearchDatasetHealthSummary,
} from "./types";

type CoverageInstrumentSummary = TradingHistoricalCoverageAuditReport["summary"]["byInstrument"][string];

function normalizeInstrument(value: string): string {
  return value.trim().toUpperCase();
}

function classifyInstrumentStatus(args: {
  configured: boolean;
  audited: boolean;
  status: CoverageInstrumentSummary | undefined;
}): ResearchDatasetHealthStatus {
  if (!args.audited || !args.status) {
    return "missing";
  }

  if (args.status.failedPeriods > 0) {
    return "failed";
  }

  if (args.status.invalidPeriods > 0 || args.status.validPeriods <= 0) {
    return "degraded";
  }

  return "eligible";
}

function getStatusRank(status: ResearchDatasetHealthStatus): number {
  switch (status) {
    case "failed":
      return 0;
    case "missing":
      return 1;
    case "degraded":
      return 2;
    case "eligible":
      return 3;
  }
}

function buildInstrumentEntry(args: {
  instrument: string;
  configured: boolean;
  audited: boolean;
  status: CoverageInstrumentSummary | undefined;
}): ResearchDatasetHealthInstrumentEntry {
  const normalizedInstrument = normalizeInstrument(args.instrument);
  const status = classifyInstrumentStatus(args);

  return {
    instrument: normalizedInstrument,
    configured: args.configured,
    audited: args.audited,
    status,
    valid_periods: args.status?.validPeriods ?? 0,
    invalid_periods: args.status?.invalidPeriods ?? 0,
    failed_periods: args.status?.failedPeriods ?? 0,
    sources: [...(args.status?.sources ?? [])].sort(),
  };
}

function sortInstrumentEntries(
  left: ResearchDatasetHealthInstrumentEntry,
  right: ResearchDatasetHealthInstrumentEntry,
): number {
  return (
    Number(right.configured) - Number(left.configured) ||
    getStatusRank(left.status) - getStatusRank(right.status) ||
    left.instrument.localeCompare(right.instrument)
  );
}

export async function buildResearchDatasetHealthSummary(
  config: ResearchConfig,
): Promise<ResearchDatasetHealthSummary> {
  const coverageAuditPath = config.paths.coverageAuditPath;
  const configuredInstruments = Array.from(
    new Set(config.study.instruments.map(normalizeInstrument)),
  ).sort();
  if (!coverageAuditPath) {
    return {
      audit_loaded: false,
      audit_generated_at: null,
      configured_instrument_count: configuredInstruments.length,
      audited_instrument_count: 0,
      eligible_instrument_count: 0,
      degraded_instrument_count: 0,
      failed_instrument_count: 0,
      missing_instrument_count: configuredInstruments.length,
      suspended_instrument_count: configuredInstruments.length,
      eligible_instruments: [],
      suspended_instruments: [...configuredInstruments],
      missing_instruments: [...configuredInstruments],
    };
  }

  const report = await readJsonIfExists<TradingHistoricalCoverageAuditReport>(coverageAuditPath);
  const byInstrument = Object.fromEntries(
    Object.entries(report?.summary?.byInstrument ?? {}).map(([instrument, status]) => [
      normalizeInstrument(instrument),
      status,
    ]),
  ) as Record<string, CoverageInstrumentSummary>;
  const auditedInstruments = Object.keys(byInstrument)
    .map(normalizeInstrument)
    .sort();
  const unionInstruments = Array.from(
    new Set([...configuredInstruments, ...auditedInstruments]),
  ).sort();
  const entries = unionInstruments.map((instrument) =>
    buildInstrumentEntry({
      instrument,
      configured: configuredInstruments.includes(instrument),
      audited: auditedInstruments.includes(instrument),
      status: byInstrument[instrument],
    }),
  );
  const configuredEntries = entries.filter((entry) => entry.configured);

  return {
    audit_loaded: Boolean(report?.summary?.byInstrument),
    audit_generated_at: report?.generatedAt ?? null,
    configured_instrument_count: configuredInstruments.length,
    audited_instrument_count: auditedInstruments.length,
    eligible_instrument_count: configuredEntries.filter((entry) => entry.status === "eligible").length,
    degraded_instrument_count: configuredEntries.filter((entry) => entry.status === "degraded").length,
    failed_instrument_count: configuredEntries.filter((entry) => entry.status === "failed").length,
    missing_instrument_count: configuredEntries.filter((entry) => entry.status === "missing").length,
    suspended_instrument_count: configuredEntries.filter((entry) => entry.status !== "eligible").length,
    eligible_instruments: configuredEntries
      .filter((entry) => entry.status === "eligible")
      .map((entry) => entry.instrument),
    suspended_instruments: configuredEntries
      .filter((entry) => entry.status !== "eligible")
      .map((entry) => entry.instrument),
    missing_instruments: configuredEntries
      .filter((entry) => entry.status === "missing")
      .map((entry) => entry.instrument),
  };
}

export async function buildResearchDatasetHealthReport(
  config: ResearchConfig,
): Promise<ResearchDatasetHealthReport> {
  const coverageAuditPath = config.paths.coverageAuditPath;
  const report = coverageAuditPath
    ? await readJsonIfExists<TradingHistoricalCoverageAuditReport>(coverageAuditPath)
    : null;
  const byInstrument = Object.fromEntries(
    Object.entries(report?.summary?.byInstrument ?? {}).map(([instrument, status]) => [
      normalizeInstrument(instrument),
      status,
    ]),
  ) as Record<string, CoverageInstrumentSummary>;
  const configuredInstruments = Array.from(
    new Set(config.study.instruments.map(normalizeInstrument)),
  ).sort();
  const auditedInstruments = Object.keys(byInstrument)
    .map(normalizeInstrument)
    .sort();
  const unionInstruments = Array.from(
    new Set([...configuredInstruments, ...auditedInstruments]),
  )
    .sort()
    .map((instrument) =>
      buildInstrumentEntry({
        instrument,
        configured: configuredInstruments.includes(instrument),
        audited: auditedInstruments.includes(instrument),
        status: byInstrument[instrument],
      }),
    )
    .sort(sortInstrumentEntries);

  return {
    schema_version: resolveResearchReportSchemaVersion("datasetHealth"),
    provenance: await buildResearchReportProvenance({ config }),
    report_id: `dataset-health-${new Date().toISOString()}`,
    generated_at: new Date().toISOString(),
    coverage_audit_path: coverageAuditPath ?? null,
    summary: await buildResearchDatasetHealthSummary(config),
    instruments: unionInstruments,
  };
}

export async function writeResearchDatasetHealthReport(args: {
  config: ResearchConfig;
  report: ResearchDatasetHealthReport;
}): Promise<{
  jsonPath: string;
  markdownPath: string;
  latestJsonPath: string;
  latestMarkdownPath: string;
}> {
  const datasetDir = path.join(args.config.paths.reportsDir, "datasets");
  await ensureDirectory(datasetDir);

  const safeId = sanitizeFileSegment(args.report.report_id);
  const jsonPath = path.join(datasetDir, `${safeId}.json`);
  const markdownPath = path.join(datasetDir, `${safeId}.md`);
  const latestJsonPath = path.join(datasetDir, "dataset-health-latest.json");
  const latestMarkdownPath = path.join(datasetDir, "dataset-health-latest.md");

  await writeJsonAtomic(jsonPath, args.report);
  await writeJsonAtomic(latestJsonPath, args.report);

  const markdown = [
    `# Research Dataset Health`,
    ``,
    `- Schema version: ${args.report.schema_version}`,
    `- Dataset refs: ${args.report.provenance.dataset_refs.length}`,
    `- Generated at: ${args.report.generated_at}`,
    `- Audit loaded: ${args.report.summary.audit_loaded ? "yes" : "no"}`,
    `- Audit generated at: ${args.report.summary.audit_generated_at ?? "n/a"}`,
    `- Configured instruments: ${args.report.summary.configured_instrument_count}`,
    `- Audited instruments: ${args.report.summary.audited_instrument_count}`,
    `- Eligible instruments: ${args.report.summary.eligible_instrument_count}`,
    `- Suspended instruments: ${args.report.summary.suspended_instrument_count}`,
    `- Degraded instruments: ${args.report.summary.degraded_instrument_count}`,
    `- Failed instruments: ${args.report.summary.failed_instrument_count}`,
    `- Missing instruments: ${args.report.summary.missing_instrument_count}`,
    ``,
    `## Eligible`,
    ...(args.report.summary.eligible_instruments.length > 0
      ? args.report.summary.eligible_instruments.map((instrument) => `- ${instrument}`)
      : ["- none"]),
    ``,
    `## Suspended`,
    ...(args.report.summary.suspended_instruments.length > 0
      ? args.report.summary.suspended_instruments.map((instrument) => `- ${instrument}`)
      : ["- none"]),
    ``,
    `## Instruments`,
    ...(args.report.instruments.length > 0
      ? args.report.instruments.map(
          (entry) =>
            `- ${entry.instrument}: ${entry.status}` +
            ` [configured=${entry.configured ? "yes" : "no"} audited=${entry.audited ? "yes" : "no"}]` +
            ` (valid=${entry.valid_periods}, invalid=${entry.invalid_periods}, failed=${entry.failed_periods})`,
        )
      : ["- none"]),
  ].join("\n");

  await writeFile(markdownPath, `${markdown}\n`, "utf8");
  await writeFile(latestMarkdownPath, `${markdown}\n`, "utf8");

  return {
    jsonPath,
    markdownPath,
    latestJsonPath,
    latestMarkdownPath,
  };
}
