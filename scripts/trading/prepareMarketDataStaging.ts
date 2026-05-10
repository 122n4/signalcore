import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

import { readJsonFile, writeJsonAtomic } from "../../lib/trading/research/index";

type MarketStagingEntry = {
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
};

type MarketStagingCatalog = {
  version: number;
  generated_for: string;
  notes: string[];
  markets: MarketStagingEntry[];
};

async function main() {
  const repoRoot = path.resolve(".");
  const catalogPath = path.resolve("config/trading-research/market-staging-catalog.json");
  const stagingRoot = path.resolve("data/historical-staging");
  const artifactsRoot = path.resolve("artifacts/trading-research/reports/datasets");
  const catalog = await readJsonFile<MarketStagingCatalog>(catalogPath);

  await mkdir(stagingRoot, { recursive: true });
  await mkdir(artifactsRoot, { recursive: true });

  const prepared = [];
  for (const market of catalog.markets) {
    const relativeDir = path.join(...market.target_path_segments);
    const absoluteDir = path.join(stagingRoot, relativeDir);
    await mkdir(absoluteDir, { recursive: true });
    prepared.push({
      instrument: market.instrument,
      status: market.status,
      staging_dir: absoluteDir,
      expected_symbol: market.expected_symbol,
      expected_local_format: market.expected_local_format,
      source: market.source,
    });
  }

  const report = {
    report_id: `market-staging-${new Date().toISOString()}`,
    generated_at: new Date().toISOString(),
    repo_root: repoRoot,
    staging_root: stagingRoot,
    catalog_path: catalogPath,
    market_count: catalog.markets.length,
    prepared,
    notes: catalog.notes,
  };

  const latestJsonPath = path.join(artifactsRoot, "market-staging-latest.json");
  const latestMarkdownPath = path.join(artifactsRoot, "market-staging-latest.md");

  const markdown = [
    "# Market Data Staging",
    "",
    `Generated at: ${report.generated_at}`,
    `Staging root: ${stagingRoot}`,
    "",
    "Prepared markets:",
    ...prepared.map(
      (entry) =>
        `- ${entry.instrument}: ${entry.expected_local_format} -> ${entry.staging_dir} (${entry.source.provider})`,
    ),
    "",
    "Notes:",
    ...catalog.notes.map((note) => `- ${note}`),
  ].join("\n");

  await writeJsonAtomic(latestJsonPath, report);
  await writeFile(latestMarkdownPath, `${markdown}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        ok: true,
        stagingRoot,
        marketCount: report.market_count,
        jsonPath: latestJsonPath,
        markdownPath: latestMarkdownPath,
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
