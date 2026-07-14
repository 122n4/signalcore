import {
  buildResearchLocalArchiveInventoryReport,
  loadResearchConfig,
  type ResearchLocalArchiveInventoryScope,
  writeResearchLocalArchiveInventoryReport,
} from "../../lib/trading/research/index";
import type { TradingMarketType } from "../../lib/trading/data";

function parseScope(argv: string[]): ResearchLocalArchiveInventoryScope {
  if (argv.includes("--canonical-only")) return "canonical";
  if (argv.includes("--staging-only")) return "staging";
  return "all";
}

function parseInstruments(argv: string[]): string[] | null {
  const raw = argv.find((arg) => arg.startsWith("--instruments="));
  if (!raw) return null;
  return raw
    .slice("--instruments=".length)
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);
}

function parseMarkets(argv: string[]): TradingMarketType[] | null {
  const raw = argv.find((arg) => arg.startsWith("--markets=") || arg.startsWith("--market="));
  if (!raw) return null;

  const normalized = raw.startsWith("--markets=")
    ? raw.slice("--markets=".length)
    : raw.slice("--market=".length);
  const allowed = new Set<TradingMarketType>(["forex", "crypto", "equities"]);

  return normalized
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value): value is TradingMarketType => allowed.has(value as TradingMarketType));
}

async function main() {
  const argv = process.argv.slice(2);
  const config = await loadResearchConfig();
  const scope = parseScope(argv);
  const markets = parseMarkets(argv);
  const instruments = parseInstruments(argv);
  const report = await buildResearchLocalArchiveInventoryReport(config, {
    scope,
    markets,
    instruments,
  });
  const outputs = await writeResearchLocalArchiveInventoryReport({
    config,
    report,
  });

  console.log(
    JSON.stringify(
      {
        reportId: report.report_id,
        scope: report.scope,
        requestedMarkets: report.requested_markets,
        requestedInstruments: report.requested_instruments,
        summary: report.summary,
        jsonPath: outputs.latestJsonPath,
        markdownPath: outputs.latestMarkdownPath,
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
