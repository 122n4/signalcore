import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  ensureResearchScientificDatasetSnapshot,
  buildResearchReportProvenance,
  readJsonFile,
  sha256File,
  buildResearchDatasetCatalog,
} from "@/lib/trading/research";

import { createResearchConfig, createResearchTempDir } from "./helpers/tradingResearchFixtures";

describe("trading research dataset snapshots", () => {
  it("writes an immutable scientific dataset snapshot and exposes it through provenance", async () => {
    const rootDir = await createResearchTempDir();
    const config = await createResearchConfig(rootDir);

    const snapshot = await ensureResearchScientificDatasetSnapshot(config);
    const snapshotPath = path.join(config.paths.rootDir, "datasets", "snapshots", `${snapshot.snapshot_id}.json`);
    const stored = await readJsonFile<typeof snapshot>(snapshotPath);
    const provenance = await buildResearchReportProvenance({ config });
    const catalog = await buildResearchDatasetCatalog(config);
    const scientificSnapshot = catalog.find((entry) => entry.kind === "scientific_snapshot");

    expect(stored.snapshot_id).toBe(snapshot.snapshot_id);
    expect(stored.content_address).toBe(snapshot.dataset_version);
    expect(stored.instruments[0]?.files[0]?.sha256).toBeTruthy();
    expect(stored.instruments[0]?.row_counts["15m"]).toBeGreaterThan(0);
    expect(provenance.dataset_refs.some((ref) => ref.snapshot_id === snapshot.snapshot_id)).toBe(true);
    expect(provenance.dataset_refs.every((ref) => !(ref.source_path ?? "").includes("latest.json"))).toBe(true);
    expect(scientificSnapshot?.data_plane.integrity.source_checksum).toBe(await sha256File(snapshotPath));
    expect(scientificSnapshot?.data_plane.integrity.source_checksum).not.toBe(snapshot.dataset_version);
  });
});
