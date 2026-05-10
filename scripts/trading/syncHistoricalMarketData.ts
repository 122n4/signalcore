import {
  summarizeSyncResult,
  syncOfficialHistoricalArchives,
  type TradingOfficialSyncInstrument,
} from "../../lib/trading/backtest/index";

function readArg(name: string): string | null {
  const prefix = `--${name}=`;
  const matched = process.argv.find((arg) => arg.startsWith(prefix));
  return matched ? matched.slice(prefix.length) : null;
}

function readBooleanArg(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function parseMonth(input: string, fallbackMonth: number): { year: number; month: number } {
  const trimmed = input.trim();
  const [yearPart, monthPart] = trimmed.split("-");
  const year = Number(yearPart);
  const month = Number(monthPart ?? fallbackMonth);

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error(`Invalid month input '${input}'. Expected YYYY-MM or YYYY.`);
  }

  return { year, month };
}

function defaultToMonth(): { year: number; month: number } {
  const now = new Date();
  const month = now.getUTCMonth();
  const year = month === 0 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
  return {
    year,
    month: month === 0 ? 12 : month,
  };
}

async function main() {
  const instruments = (
    readArg("instruments")
    ?? process.env.TRADING_MARKET_DATA_INSTRUMENTS
    ?? "BTCUSD,ETHUSD,US500"
  )
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter((value): value is TradingOfficialSyncInstrument =>
      value === "BTCUSD" || value === "ETHUSD" || value === "US500",
    );

  const from = parseMonth(
    readArg("from") ?? process.env.TRADING_MARKET_DATA_FROM ?? "2019-01",
    1,
  );
  const to = parseMonth(
    readArg("to") ?? process.env.TRADING_MARKET_DATA_TO ?? `${defaultToMonth().year}-${String(defaultToMonth().month).padStart(2, "0")}`,
    defaultToMonth().month,
  );
  const force = readBooleanArg("force") || process.env.TRADING_MARKET_DATA_FORCE === "1";

  const result = await syncOfficialHistoricalArchives({
    instruments,
    from,
    to,
    force,
  });
  const summary = await summarizeSyncResult(result);

  console.log(
    JSON.stringify(
      {
        ok: true,
        rootDir: result.rootDir,
        instruments,
        from,
        to,
        force,
        summary,
        sample: result.entries.slice(0, 12),
        totalEntries: result.entries.length,
      },
      null,
      2,
    ),
  );
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
