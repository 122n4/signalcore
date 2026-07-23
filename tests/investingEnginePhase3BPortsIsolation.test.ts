import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

import {
  FixtureMarketSnapshotPort,
  canonicalDecimalFromString,
  sealMarketSnapshotV1,
} from "@/lib/investing/engine/v1";

function listTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return listTypeScriptFiles(path);
    return path.endsWith(".ts") ? [path] : [];
  });
}

describe("FASE 3B ports and IO isolation", () => {
  it("provides a read-only fixture MarketSnapshotPort", async () => {
    const snapshot = sealMarketSnapshotV1({
      contractVersion: "investing-market-snapshot/v1",
      marketSnapshotId: "fixture_snapshot_1",
      asOf: "2026-07-20T10:00:00.000Z",
      schemaVersion: "market-fixture/v1",
      points: [
        {
          symbol: "VWCE",
          price: canonicalDecimalFromString("135.42"),
          currency: "EUR",
          provider: "fixture",
          providerAsOf: "2026-07-20T09:59:00.000Z",
          receivedAt: "2026-07-20T10:00:00.000Z",
          quality: "good",
        },
      ],
      issues: [],
    });
    const port = new FixtureMarketSnapshotPort([snapshot]);

    expect(await port.getSnapshotById("fixture_snapshot_1")).toBe(snapshot);
    expect(await port.getSnapshotById("missing")).toBeNull();
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(() => new FixtureMarketSnapshotPort([snapshot, snapshot])).toThrow(
      "investing_market_fixture_duplicate_snapshot_id",
    );
    const point = snapshot.points[0]!;
    expect(() =>
      sealMarketSnapshotV1({
        contractVersion: "investing-market-snapshot/v1",
        marketSnapshotId: "duplicate_symbol_snapshot",
        asOf: snapshot.asOf,
        schemaVersion: snapshot.schemaVersion,
        points: [point, point],
        issues: [],
      }),
    ).toThrow("investing_market_duplicate_symbol");
  });

  it("keeps the complete v1 graph free from broker, worker, Supabase and execution API imports", () => {
    const root = join(process.cwd(), "lib/investing/engine/v1");
    const prohibited = [
      "@/lib/broker",
      "@/lib/supabase",
      "@supabase/",
      "@/app/api",
      "persistentPaper",
      "paperWorker",
      "getQuotes",
      "fetch(",
      "Date.now(",
      "new Date()",
    ];
    const violations: string[] = [];

    for (const file of listTypeScriptFiles(root)) {
      const source = readFileSync(file, "utf8");
      for (const token of prohibited) {
        if (source.includes(token)) violations.push(`${relative(process.cwd(), file)}:${token}`);
      }
    }

    expect(violations).toEqual([]);
  });
});
