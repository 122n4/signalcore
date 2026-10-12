import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * RL-9C3B2B0: executable inventory gate, NOT an operational embargo.
 *
 * An unreviewed new material read in Investing Research must break CI until
 * the inventory and the eventual server-authoritative read guard are revised.
 */
const root = path.resolve(__dirname, "..");
const researchRoot = path.join(root, "lib", "investing", "research");

function sourcesUnder(directory: string): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...sourcesUnder(full));
    else if (entry.isFile() && /\.tsx?$/u.test(entry.name)) {
      found.push(path.relative(root, full).replaceAll(path.sep, "/"));
    }
  }
  return found.sort();
}

function source(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const readSeam = "lib/investing/research/ordinaryResearchDatasetMaterialRead.ts";

const writerPaths = [
  "lib/investing/research/researchExecutionWriter.ts",
  "lib/investing/research/validationExecutionWriter.ts",
] as const;

describe("RL-9C3B2B0: Investing Research read-surface inventory (non-authorizing)", () => {
  it("pins every direct material-provider read in Investing Research", () => {
    const directReads = sourcesUnder(researchRoot).flatMap((file) => {
      const matches = source(file).match(/\bprovider\.loadSeriesContent\s*\(/gu) ?? [];
      return Array.from({ length: matches.length }, () => file);
    });
    expect(directReads).toEqual([readSeam]);
  });

  it("pins the current hash-only provider interface as a known embargo gap", () => {
    const material = source("lib/investing/research/datasetMaterial.ts");
    expect(material).toContain(
      "loadSeriesContent(seriesRef: HashRefV1): Promise<Buffer | null>;",
    );
    expect(material).toContain("this.materials.get(seriesRef.hashHex)");
  });

  it("pins both real execution writers behind the material-provider interface", () => {
    for (const writer of writerPaths) {
      const text = source(writer);
      expect(text).toContain("loadOrdinaryResearchDatasetSeriesMaterialV1(provider, series,");
      expect(text).not.toContain("provider.loadSeriesContent(");
      expect(text).toContain("datasetMaterialProvider: ResearchDatasetMaterialProviderV1");
    }
    expect(source(readSeam)).toContain("provider.loadSeriesContent(ref)");
    expect(source(readSeam)).toContain("hashDatasetSeriesV1(series)");
    expect(source(writerPaths[0])).toContain("loadAndVerifyMaterials(");
    expect(source(writerPaths[1])).toContain("buildValidationRunInput(");
  });

  it("pins service-level provider injection as an unproven authority boundary", () => {
    const services = [
      "lib/investing/research/researchExecutionService.ts",
      "lib/investing/research/validationExecutionService.ts",
    ];
    for (const service of services) {
      const text = source(service);
      expect(text).toContain("datasetMaterialProvider: ResearchDatasetMaterialProviderV1;");
      expect(text).toContain("datasetMaterialProvider: input.datasetMaterialProvider");
    }
  });

  it("does not silently treat the RL-9C3A prefilter as a read grant", () => {
    const prefilter = source("lib/investing/research/blindTruthEmbargoIntersection.ts");
    expect(prefilter).toContain("classification: 'DENY' | 'UNPROVEN'");
    expect(prefilter).toContain("NO_INTERSECTION_NOT_AUTHORIZATION");
    expect(prefilter).not.toContain("classification: 'ALLOW'");
  });
});
