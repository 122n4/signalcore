import {
  buildTradingMarketDataBackfillPlan,
  runTradingMarketDataBackfill,
  type MarketDataBackfillRunReport,
} from "../../lib/trading/research/index";
import type { TradingOfficialSyncMonth } from "../../lib/trading/backtest/index";

function readArg(name: string): string | null {
  const prefix = `--${name}=`;
  const matched = process.argv.find((arg) => arg.startsWith(prefix));
  return matched ? matched.slice(prefix.length) : null;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function parseMonth(input: string | null): TradingOfficialSyncMonth | undefined {
  if (!input) return undefined;

  const [yearPart, monthPart] = input.trim().split("-");
  const year = Number(yearPart);
  const month = Number(monthPart);

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error(`Invalid month '${input}'. Expected YYYY-MM.`);
  }

  return { year, month };
}

function parseNumberArg(name: string): number | undefined {
  const raw = readArg(name);
  if (!raw) return undefined;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid --${name} value '${raw}'.`);
  }

  return parsed;
}

function parseInstruments(): string[] | undefined {
  const raw = readArg("instruments");
  if (!raw) return undefined;

  return raw
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);
}

function parseIntervalMs(): number {
  const minutes = parseNumberArg("intervalMinutes") ?? Number(process.env.TRADING_DATA_BACKFILL_INTERVAL_MINUTES ?? 60);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    throw new Error("Backfill loop interval must be greater than zero minutes.");
  }

  return Math.round(minutes * 60_000);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function compactReport(report: MarketDataBackfillRunReport) {
  return {
    ok: report.ok,
    generatedAt: report.generatedAt,
    range: `${report.request.from.year}-${String(report.request.from.month).padStart(2, "0")} -> ${report.request.to.year}-${String(report.request.to.month).padStart(2, "0")}`,
    instruments: report.request.instruments,
    before: report.before.summary,
    after: report.after.summary,
    sync: report.sync.summary,
    stagedSync: report.sync.stagedSummary,
    coverageFailures: report.coverageAudit.failures,
    outputs: report.outputs,
  };
}

async function runOnce() {
  const request = {
    instruments: parseInstruments(),
    from: parseMonth(readArg("from")),
    to: parseMonth(readArg("to")),
    auditFromYear: parseNumberArg("auditFromYear"),
    auditToYear: parseNumberArg("auditToYear"),
    includeStaged: !hasFlag("no-staged"),
    download: !hasFlag("no-download") && !hasFlag("dry-run"),
    force: hasFlag("force"),
    runAudit: !hasFlag("no-audit") && !hasFlag("dry-run"),
    coverageAuditPath: readArg("coverageAuditPath"),
    reportsDir: readArg("reportsDir"),
  };

  if (hasFlag("dry-run")) {
    const plan = await buildTradingMarketDataBackfillPlan({
      instruments: request.instruments,
      from: request.from,
      to: request.to,
      includeStaged: request.includeStaged,
    });
    console.log(JSON.stringify({
      ok: true,
      dryRun: true,
      summary: plan.summary,
      entries: plan.entries.map((entry) => ({
        instrument: entry.instrument,
        source: entry.source,
        autoDownload: entry.autoDownload,
        missingDownloadable: entry.periods.filter((period) => period.status === "missing_downloadable").length,
        missingManual: entry.periods.filter((period) => period.status === "missing_manual").length,
        existing: entry.periods.filter((period) => period.status === "existing").length,
      })),
    }, null, 2));
    return;
  }

  const report = await runTradingMarketDataBackfill(request);
  console.log(JSON.stringify(compactReport(report), null, 2));
}

async function main() {
  const loop = hasFlag("loop");
  const maxCycles = parseNumberArg("maxCycles") ?? Number(process.env.TRADING_DATA_BACKFILL_MAX_CYCLES ?? 0);

  if (!loop) {
    await runOnce();
    return;
  }

  const intervalMs = parseIntervalMs();
  let cycle = 0;

  while (true) {
    cycle += 1;
    await runOnce();

    if (maxCycles > 0 && cycle >= maxCycles) {
      return;
    }

    await sleep(intervalMs);
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
