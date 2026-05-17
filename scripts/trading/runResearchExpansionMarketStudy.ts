import { runResearchExpansionMarketStudy } from "@/lib/trading/research";
import type { TradingTimeframe } from "@/lib/trading/data";

function readArg(name: string): string | null {
  const prefix = `--${name}=`;
  const matched = process.argv.find((arg) => arg.startsWith(prefix));
  return matched ? matched.slice(prefix.length) : null;
}

function parseCsvArg(name: string, fallback: string[]): string[] {
  const raw = readArg(name);
  if (!raw) return fallback;
  return raw
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);
}

function parseTimeframesArg(name: string, fallback: TradingTimeframe[]): TradingTimeframe[] {
  return parseCsvArg(name, fallback) as TradingTimeframe[];
}

function dateArg(name: string, fallback: string): string {
  const raw = readArg(name) ?? fallback;
  return new Date(raw).toISOString();
}

async function main() {
  const summary = await runResearchExpansionMarketStudy({
    from: dateArg("from", "2025-01-01T00:00:00.000Z"),
    to: dateArg("to", "2025-03-31T23:59:59.000Z"),
    instruments: parseCsvArg("instruments", ["SOLUSD", "BNBUSD", "XRPUSD"]),
    timeframes: parseTimeframesArg("timeframes", ["4h", "1h", "15m"]),
  });

  console.log(JSON.stringify(summary, null, 2));
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
