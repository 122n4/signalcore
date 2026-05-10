import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const rootDir = process.cwd();
const sourceDir = path.resolve(
  process.env.TRADING_LIGHT_SCANNER_PROVIDER_CACHE_DIR ??
    path.join(rootDir, ".cache", "trading-scanner-provider-cache"),
);
const targetPath = path.resolve(
  process.env.TRADING_LIGHT_SCANNER_FALLBACK_CATALOG_PATH ??
    path.join(rootDir, "config", "trading", "trading-scanner-fallback-catalog.json"),
);

function hasAnyCandles(timeframes) {
  return Object.values(timeframes ?? {}).some((rows) => Array.isArray(rows) && rows.length > 0);
}

async function main() {
  let fileNames = [];

  try {
    fileNames = (await readdir(sourceDir)).filter((fileName) => fileName.toLowerCase().endsWith(".json"));
  } catch {
    fileNames = [];
  }

  if (fileNames.length === 0) {
    console.log(
      JSON.stringify({
        ok: true,
        skipped: true,
        reason: "no_provider_cache_files_found",
        sourceDir,
        targetPath,
      }),
    );
    return;
  }

  const instruments = {};

  for (const fileName of fileNames.sort()) {
    const raw = await readFile(path.join(sourceDir, fileName), "utf8");
    const parsed = JSON.parse(raw);
    const instrument = String(parsed.instrument ?? path.basename(fileName, ".json"))
      .trim()
      .toUpperCase();

    if (!instrument || !hasAnyCandles(parsed.timeframes)) {
      continue;
    }

    instruments[instrument] = {
      instrument,
      snapshotAt: parsed.snapshotAt,
      timeframes: parsed.timeframes,
      writtenAt: parsed.writtenAt ?? new Date().toISOString(),
    };
  }

  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(
    targetPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        instruments,
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log(
    JSON.stringify({
      ok: true,
      skipped: false,
      sourceDir,
      targetPath,
      instrumentCount: Object.keys(instruments).length,
    }),
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      sourceDir,
      targetPath,
    }),
  );
  process.exitCode = 1;
});
