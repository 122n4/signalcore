import path from "node:path";

import {
  buildResearchRuntimeHealth,
  ensureDirectory,
  loadResearchConfig,
  runResearchExpansionMarketStudy,
  runTradingMarketDataBackfill,
  writeJsonAtomic,
} from "@/lib/trading/research";
import type { TradingOfficialSyncMonth } from "@/lib/trading/backtest";

type DaemonCycleStatus = {
  ok: boolean;
  cycle: number;
  generatedAt: string;
  mode: "once" | "loop";
  backfill: {
    ok: boolean;
    range: string;
    before: unknown;
    after: unknown;
    sync: unknown;
    stagedSync: unknown;
  } | null;
  expansionStudy: Awaited<ReturnType<typeof runResearchExpansionMarketStudy>> | null;
  runtimeHealth: Awaited<ReturnType<typeof buildResearchRuntimeHealth>> | null;
  error: string | null;
  nextCycleAt: string | null;
};

function readArg(name: string): string | null {
  const prefix = `--${name}=`;
  const matched = process.argv.find((arg) => arg.startsWith(prefix));
  return matched ? matched.slice(prefix.length) : null;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function parseNumberArg(name: string, fallback: number): number {
  const raw = readArg(name) ?? process.env[`RESEARCH_MAX_DAEMON_${name.toUpperCase()}`];
  if (!raw) return fallback;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid --${name} value '${raw}'.`);
  }

  return parsed;
}

function parseMonth(input: string): TradingOfficialSyncMonth {
  const [yearPart, monthPart] = input.trim().split("-");
  const year = Number(yearPart);
  const month = Number(monthPart);

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error(`Invalid month '${input}'. Expected YYYY-MM.`);
  }

  return { year, month };
}

function formatMonth(month: TradingOfficialSyncMonth): string {
  return `${month.year}-${String(month.month).padStart(2, "0")}`;
}

function addMonths(month: TradingOfficialSyncMonth, delta: number): TradingOfficialSyncMonth {
  const date = new Date(Date.UTC(month.year, month.month - 1 + delta, 1));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
  };
}

function previousCompletedMonth(now = new Date()): TradingOfficialSyncMonth {
  return addMonths(
    {
      year: now.getUTCFullYear(),
      month: now.getUTCMonth() + 1,
    },
    -1,
  );
}

function monthStartIso(month: TradingOfficialSyncMonth): string {
  return new Date(Date.UTC(month.year, month.month - 1, 1, 0, 0, 0, 0)).toISOString();
}

function monthEndIso(month: TradingOfficialSyncMonth): string {
  return new Date(Date.UTC(month.year, month.month, 0, 23, 59, 59, 999)).toISOString();
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }

    const timeout = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
  });
}

async function writeStatus(status: DaemonCycleStatus): Promise<void> {
  const config = await loadResearchConfig();
  const runtimeDir = path.join(config.paths.rootDir, "runtime");
  await ensureDirectory(runtimeDir);
  await writeJsonAtomic(path.join(runtimeDir, "research-max-daemon-status.json"), status);
}

async function runCycle(args: {
  cycle: number;
  mode: "once" | "loop";
  backfillFrom: TradingOfficialSyncMonth;
  backfillTo: TradingOfficialSyncMonth;
  nextCycleAt: string | null;
}): Promise<DaemonCycleStatus> {
  try {
    const backfill = await runTradingMarketDataBackfill({
      from: args.backfillFrom,
      to: args.backfillTo,
      includeStaged: true,
      download: true,
      force: false,
      runAudit: false,
    });
    const expansionStudy = await runResearchExpansionMarketStudy({
      from: monthStartIso(args.backfillFrom),
      to: monthEndIso(args.backfillTo),
      outputDir: "artifacts/trading-backtests",
      localDataDir: "data/historical-staging",
    });
    const config = await loadResearchConfig();
    const runtimeHealth = await buildResearchRuntimeHealth({ config });
    const status: DaemonCycleStatus = {
      ok: backfill.ok && expansionStudy.failures.length === 0,
      cycle: args.cycle,
      generatedAt: new Date().toISOString(),
      mode: args.mode,
      backfill: {
        ok: backfill.ok,
        range: `${formatMonth(backfill.request.from)} -> ${formatMonth(backfill.request.to)}`,
        before: backfill.before.summary,
        after: backfill.after.summary,
        sync: backfill.sync.summary,
        stagedSync: backfill.sync.stagedSummary,
      },
      expansionStudy,
      runtimeHealth,
      error: null,
      nextCycleAt: args.nextCycleAt,
    };

    await writeStatus(status);
    return status;
  } catch (error) {
    const status: DaemonCycleStatus = {
      ok: false,
      cycle: args.cycle,
      generatedAt: new Date().toISOString(),
      mode: args.mode,
      backfill: null,
      expansionStudy: null,
      runtimeHealth: null,
      error: error instanceof Error ? error.message : String(error),
      nextCycleAt: args.nextCycleAt,
    };

    await writeStatus(status);
    return status;
  }
}

async function main() {
  const loop = hasFlag("loop");
  const controller = new AbortController();
  const stop = () => controller.abort();
  const intervalMinutes = parseNumberArg("intervalMinutes", 360);
  const maxCycles = parseNumberArg("maxCycles", loop ? 0 : 1);
  const months = Math.max(3, Math.floor(parseNumberArg("months", 30)));
  const explicitFrom = readArg("from");
  const explicitTo = readArg("to");
  const toMonth = explicitTo ? parseMonth(explicitTo) : previousCompletedMonth();
  const fromMonth = explicitFrom ? parseMonth(explicitFrom) : addMonths(toMonth, -(months - 1));
  let cycle = 0;

  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  try {
    while (!controller.signal.aborted) {
      cycle += 1;
      const nextCycleAt =
        loop && (maxCycles <= 0 || cycle < maxCycles)
          ? new Date(Date.now() + intervalMinutes * 60_000).toISOString()
          : null;
      const status = await runCycle({
        cycle,
        mode: loop ? "loop" : "once",
        backfillFrom: fromMonth,
        backfillTo: toMonth,
        nextCycleAt,
      });

      console.log(JSON.stringify(status, null, 2));

      if (!loop || (maxCycles > 0 && cycle >= maxCycles)) {
        return;
      }

      await sleep(intervalMinutes * 60_000, controller.signal);
    }
  } finally {
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
