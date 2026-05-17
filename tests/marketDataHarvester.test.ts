import path from "node:path";
import { describe, expect, it } from "vitest";

import { buildMarketDataHarvestPlan, readJsonFile, runMarketDataHarvester, writeJsonAtomic } from "@/lib/trading/research";

import { createResearchConfig, createResearchTempDir } from "./helpers/tradingResearchFixtures";

function sourceCatalog() {
  return {
    version: 1,
    safety_rules: ["stage only"],
    sources: [
      {
        id: "binance_spot_monthly_klines",
        provider: "Binance",
        kind: "official_public_archive",
        access: "direct_download",
        auto_download: true,
        license_note: "official archive",
        reference_url: "https://data.binance.vision/",
        listing_url: "https://data.binance.vision/?prefix=data/spot/monthly/klines/",
        local_format: "crypto_binance_monthly_m1",
        quality_gate: "monthly_1m_ohlcv_complete",
        markets: [
          {
            instrument: "BTCUSD",
            group: "crypto",
            symbol: "BTCUSDT",
            priority: 100,
            rationale: "active lab",
          },
          {
            instrument: "SOLUSD",
            group: "crypto",
            symbol: "SOLUSDT",
            priority: 90,
            rationale: "new candidate",
          },
        ],
      },
      {
        id: "stooq_daily_reference",
        provider: "Stooq",
        kind: "public_reference_dataset",
        access: "reference_only",
        auto_download: false,
        license_note: "reference only",
        reference_url: "https://stooq.com/",
        listing_url: "https://stooq.com/db/h/",
        local_format: "reference_daily_only",
        quality_gate: "not_execution_grade",
        markets: [
          {
            instrument: "SPY",
            group: "equities",
            symbol: "SPY.US",
            priority: 50,
            rationale: "reference only",
          },
        ],
      },
    ],
  };
}

describe("market data harvester", () => {
  it("classifies approved sources without promoting discovered markets", async () => {
    const rootDir = await createResearchTempDir();
    const baseConfig = await createResearchConfig(rootDir);
    const config = {
      ...baseConfig,
      study: {
        ...baseConfig.study,
        instruments: ["BTCUSD"],
      },
    };
    const sourceCatalogPath = path.join(rootDir, "source-catalog.json");
    const stagingCatalogPath = path.join(rootDir, "staging-catalog.json");

    await writeJsonAtomic(sourceCatalogPath, sourceCatalog());
    await writeJsonAtomic(stagingCatalogPath, {
      version: 1,
      markets: [],
    });

    const plan = await buildMarketDataHarvestPlan({
      config,
      sourceCatalogPath,
      stagingCatalogPath,
    });

    expect(plan.summary.candidates).toBe(3);
    expect(plan.candidates.find((candidate) => candidate.instrument === "BTCUSD")?.action).toBe("backfill_active");
    expect(plan.candidates.find((candidate) => candidate.instrument === "SOLUSD")?.action).toBe("stage_candidate");
    expect(plan.candidates.find((candidate) => candidate.instrument === "SPY")?.action).toBe("reference_only_review");
    expect(plan.candidates.every((candidate) => candidate.safety.promotionBlocked)).toBe(true);
  });

  it("can update staging idempotently when explicitly requested", async () => {
    const rootDir = await createResearchTempDir();
    const sourceCatalogPath = path.join(rootDir, "source-catalog.json");
    const stagingCatalogPath = path.join(rootDir, "staging-catalog.json");
    const reportsDir = path.join(rootDir, "reports");

    await writeJsonAtomic(sourceCatalogPath, sourceCatalog());
    await writeJsonAtomic(stagingCatalogPath, {
      version: 1,
      markets: [],
    });

    const first = await runMarketDataHarvester({
      sourceCatalogPath,
      stagingCatalogPath,
      reportsDir,
      updateStaging: true,
    });
    const second = await runMarketDataHarvester({
      sourceCatalogPath,
      stagingCatalogPath,
      reportsDir,
      updateStaging: true,
    });
    const staging = await readJsonFile<{ markets: Array<{ instrument: string }> }>(stagingCatalogPath);

    expect(first.stagingUpdate.added).toBe(1);
    expect(second.stagingUpdate.added).toBe(0);
    expect(staging.markets.map((market) => market.instrument)).toEqual(["SOLUSD"]);
  });
});
