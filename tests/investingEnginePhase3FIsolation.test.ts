import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = path.resolve(process.cwd(), "lib/investing/engine/v1/phase3f");
const PHASE4C_QA_REPLAY = path.resolve(
  process.cwd(),
  "scripts/qa/runInvestingEnginePhase4CIntegrityScan.ts",
);
const PHASE5DR_PRODUCTION_RUNNER = path.resolve(
  process.cwd(),
  "lib/investing/ops/infrastructure/factory.server.ts",
);

function files(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const target = path.join(directory, name);
    return statSync(target).isDirectory() ? files(target) : target.endsWith(".ts") ? [target] : [];
  });
}

describe("FASE 3F architectural isolation", () => {
  it("contains no forbidden runtime dependency or implicit nondeterminism", () => {
    const forbidden = [
      "@/app/",
      "supabase",
      "postgres",
      "@/lib/broker",
      "@/lib/trading",
      "@/lib/investing/runtime",
      "portfolio_items",
      "daily_snapshots",
      "journal_entries",
      "fixnow",
      "localstorage",
      "date.now",
      "math.random",
      "randomuuid",
      "uuidv4",
      "fetch(",
    ];
    for (const file of files(ROOT)) {
      const source = readFileSync(file, "utf8").toLowerCase();
      for (const token of forbidden) expect(source, `${file} contains ${token}`).not.toContain(token);
      expect(source, `${file} uses Number for financial conversion`).not.toMatch(/\bnumber\s*\(/u);
    }
  });

  it("imports only public type contracts from prior phase namespaces", () => {
    for (const file of files(ROOT)) {
      const source = readFileSync(file, "utf8");
      const priorPhaseImports = [...source.matchAll(/from\s+"([^"]*\/phase3[abcde][^"]*)"/gu)].map((match) => match[1]);
      for (const imported of priorPhaseImports) {
        expect(imported, `${file} imports prior implementation`).toMatch(/\/phase3(?:c|e)\/types$/u);
      }
    }
  });

  it("has no operational caller outside tests and its own namespace", () => {
    const roots = ["app", "components", "scripts", "lib"]
      .map((entry) => path.resolve(process.cwd(), entry))
      .filter(existsSync);
    const consumers = roots.flatMap(files).filter((file) => {
      if (file.startsWith(ROOT)) return false;
      if (file === PHASE4C_QA_REPLAY) return false;
      if (file === PHASE5DR_PRODUCTION_RUNNER) return false;
      return readFileSync(file, "utf8").includes("investing/engine/v1/phase3f");
    });
    expect(consumers).toEqual([]);
  });

  it("does not create API, UI, migration, worker, scheduler or process files", () => {
    expect(files(ROOT).map((file) => path.basename(file)).sort()).toEqual([
      "auditBundle.ts",
      "engine.ts",
      "explanation.ts",
      "hashing.ts",
      "index.ts",
      "orchestration.ts",
      "primitives.ts",
      "shadowPackage.ts",
      "types.ts",
      "validation.ts",
    ]);
  });
});
