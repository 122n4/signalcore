import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = join(process.cwd(), "lib", "investing", "engine", "v1", "phase3e");

function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? files(path) : path.endsWith(".ts") || path.endsWith(".tsx") ? [path] : [];
  });
}

describe("FASE 3E isolation", () => {
  it("has no forbidden dependency, side effect or internal phase import", () => {
    const forbidden = [
      "portfolio_items", "portfolios", "daily_snapshots", "journal_entries", "localStorage",
      "@/lib/broker", "fix-now", "@/lib/trading", "supabase", "fetch(", "Date.now(",
      "persistentPaper", "paperWorker", "/api/", "phase3c", "phase3d",
      "createOrder", "executionQueue", "accounting", "reconciliation",
    ];
    for (const file of files(ROOT)) {
      const source = readFileSync(file, "utf8");
      for (const token of forbidden) expect(source, `${file} contains ${token}`).not.toContain(token);
    }
  });

  it("has no operational caller outside the isolated 3E namespace", () => {
    const roots = ["app", "components", "scripts", "lib"].flatMap((root) => files(join(process.cwd(), root)));
    const consumers = roots.filter((file) => !file.startsWith(ROOT)).filter((file) =>
      readFileSync(file, "utf8").includes("investing/engine/v1/phase3e"),
    );
    expect(consumers).toEqual([]);
  });
});
