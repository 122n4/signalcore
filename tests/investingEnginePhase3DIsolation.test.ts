import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const PHASE3D_ROOT = join(process.cwd(), "lib", "investing", "engine", "v1", "phase3d");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : path.endsWith(".ts") || path.endsWith(".tsx") ? [path] : [];
  });
}

describe("FASE 3D isolation", () => {
  it("contains no forbidden runtime, financial legacy or side-effect dependency", () => {
    const forbidden = [
      "portfolio_items",
      "portfolios",
      "daily_snapshots",
      "journal_entries",
      "localStorage",
      "@/lib/broker",
      "fix-now",
      "@/lib/trading",
      "supabase",
      "fetch(",
      "Date.now(",
      "persistentPaper",
      "paperWorker",
      "/api/",
      "createProposal",
      "createOrder",
      "targetWeights",
    ];
    for (const file of sourceFiles(PHASE3D_ROOT)) {
      const source = readFileSync(file, "utf8");
      for (const token of forbidden) expect(source, `${file} contains ${token}`).not.toContain(token);
    }
  });

  it("has no operational caller outside the isolated 3D namespace", () => {
    const roots = ["app", "components", "scripts", "lib"].flatMap((root) => sourceFiles(join(process.cwd(), root)));
    const consumers = roots.filter((file) => !file.startsWith(PHASE3D_ROOT)).filter((file) =>
      readFileSync(file, "utf8").includes("investing/engine/v1/phase3d"),
    );
    expect(consumers).toEqual([]);
  });
});
