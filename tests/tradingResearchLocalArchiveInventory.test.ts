import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  buildResearchLocalArchiveInventoryReport,
  readJsonFile,
  writeResearchLocalArchiveInventoryReport,
} from "@/lib/trading/research";

import {
  createResearchConfig,
  createResearchTempDir,
} from "./helpers/tradingResearchFixtures";

describe("trading research local archive inventory", () => {
  it("audits canonical and staging historical roots with dataset-level evidence", async () => {
    const rootDir = await createResearchTempDir();
    const config = await createResearchConfig(rootDir);
    const stagingRoot = path.join(rootDir, "historical-staging");
    process.env.TRADING_BACKTEST_STAGING_DATA_DIR = stagingRoot;

    await mkdir(path.join(stagingRoot, "crypto", "solusd"), { recursive: true });
    await writeFile(
      path.join(stagingRoot, "crypto", "solusd", "SOLUSDT-1m-2024-01.csv"),
      "1704067200000,100,101,99,100.5,1000\n1704067200000,100,101,99,100.5,1000\n",
      "utf8",
    );
    await writeFile(path.join(stagingRoot, "orphan.tmp"), "temp\n", "utf8");
    await writeFile(path.join(stagingRoot, "orphan.csv"), "temp\n", "utf8");

    const report = await buildResearchLocalArchiveInventoryReport(config);
    const outputs = await writeResearchLocalArchiveInventoryReport({ config, report });
    const latest = await readJsonFile<typeof report>(outputs.latestJsonPath);

    expect(report.schema_version).toBe("research.local-archive-inventory-report.v1");
    expect(latest.summary.datasets).toBe(report.summary.datasets);

    const eurusd = report.datasets.find((entry) => entry.instrument === "EURUSD" && entry.storage_tier === "canonical");
    const btcusd = report.datasets.find((entry) => entry.instrument === "BTCUSD" && entry.storage_tier === "canonical");
    const solusd = report.datasets.find((entry) => entry.instrument === "SOLUSD" && entry.storage_tier === "staging");

    expect(eurusd?.state).toBe("complete");
    expect(eurusd?.file_count).toBe(6);
    expect(eurusd?.manifest_exists).toBe(false);

    expect(btcusd?.state).toBe("partial");
    expect((btcusd?.missing_parts ?? 0) > 0).toBe(true);

    expect(solusd?.file_count).toBe(1);
    expect(solusd?.duplicates.identical).toBe(1);

    const stagingRootSummary = report.roots_summary.find((entry) => entry.root === stagingRoot);
    expect((stagingRootSummary?.categories.unreferenced ?? 0) > 0).toBe(true);
    expect((stagingRootSummary?.categories.temporary ?? 0) > 0).toBe(true);
  });

  it("can scope the inventory to canonical datasets only", async () => {
    const rootDir = await createResearchTempDir();
    const config = await createResearchConfig(rootDir);

    const report = await buildResearchLocalArchiveInventoryReport(config, "canonical");

    expect(report.scope).toBe("canonical");
    expect(report.datasets.every((entry) => entry.storage_tier === "canonical")).toBe(true);
    expect(report.roots_summary).toHaveLength(2);
    expect(report.roots_summary.find((entry) => entry.root === report.roots.staging)?.file_count).toBe(0);
  });

  it("can restrict the inventory to a selected instrument subset", async () => {
    const rootDir = await createResearchTempDir();
    const config = await createResearchConfig(rootDir);

    const report = await buildResearchLocalArchiveInventoryReport(config, {
      scope: "canonical",
      instruments: ["EURUSD", "BTCUSD"],
    });

    expect(report.requested_instruments).toEqual(["EURUSD", "BTCUSD"]);
    expect(report.datasets.map((entry) => entry.instrument)).toEqual(["BTCUSD", "EURUSD"]);
  });
});
