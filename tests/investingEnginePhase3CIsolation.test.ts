import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const PHASE3C_ROOT = join(process.cwd(), "lib", "investing", "engine", "v1", "phase3c");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : path.endsWith(".ts") ? [path] : [];
  });
}

describe("FASE 3C source and IO isolation", () => {
  it("has no forbidden financial/runtime source dependency", () => {
    const forbidden = [
      "portfolio_items",
      "portfolios",
      "daily_snapshots",
      "journal_entries",
      "localStorage",
      "/broker/",
      "@/lib/broker",
      "fix-now",
      "@/lib/trading",
      "supabase",
      "fetch(",
      "Date.now(",
      "persistentPaper",
      "paperWorker",
      "/api/",
    ];
    for (const file of sourceFiles(PHASE3C_ROOT)) {
      const source = readFileSync(file, "utf8");
      for (const token of forbidden) expect(source, `${file} contains ${token}`).not.toContain(token);
    }
  });

  it("does not import the 3C builder from the operational runtime", () => {
    const roots = ["app", "components", "scripts", "lib"].flatMap((root) => sourceFiles(join(process.cwd(), root)));
    const consumers = roots.filter((file) => !file.startsWith(PHASE3C_ROOT)).filter((file) =>
      readFileSync(file, "utf8").includes("investing/engine/v1/phase3c"),
    );
    expect(consumers).toEqual([]);
  });
});
