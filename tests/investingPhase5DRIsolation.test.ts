import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const infrastructureRoot = path.resolve(root, "lib/investing/ops/infrastructure");
const allowed = new Set([
  "factory.server.ts",
  "postgresReadModel.server.ts",
  "projections.server.ts",
  "scopedPersistence.server.ts",
  "server.ts",
  "softBudget.server.ts",
].map((name) => path.resolve(infrastructureRoot, name)));

function files(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory).flatMap((name) => {
    const target = path.join(directory, name);
    return statSync(target).isDirectory() ? files(target) : [path.resolve(target)];
  });
}

describe("FASE 5D-R server-only isolation", () => {
  it("uses a closed literal infrastructure allowlist", () => {
    expect(new Set(files(infrastructureRoot))).toEqual(allowed);
    for (const file of allowed) {
      expect(readFileSync(file, "utf8").startsWith('import "server-only";')).toBe(true);
    }
  });

  it("does not expose infrastructure from the neutral OPS entrypoint", () => {
    expect(readFileSync(path.resolve(root, "lib/investing/ops/index.ts"), "utf8"))
      .not.toMatch(/infrastructure|postgres|clerk|process\.env/u);
  });

  it("does not import QA scripts or write SQL in runtime infrastructure", () => {
    const source = files(infrastructureRoot)
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    expect(source).not.toContain("@/scripts/qa/");
    expect(source).not.toMatch(/\b(insert|update|delete|upsert)\b/iu);
    expect(source).not.toMatch(/service_role/iu);
  });

  it("has no Client Component import path to OPS infrastructure", () => {
    const clients = ["app", "components", "lib"]
      .flatMap((entry) => files(path.resolve(root, entry)))
      .filter((file) => /\.[jt]sx?$/u.test(file))
      .filter((file) => /^\s*["']use client["'];?/u.test(readFileSync(file, "utf8")));
    for (const file of clients) {
      expect(readFileSync(file, "utf8")).not.toContain("investing/ops/infrastructure");
    }
  });
});
