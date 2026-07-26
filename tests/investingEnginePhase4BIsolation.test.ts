import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(process.cwd(), "lib/investing/engine/v1/persistence");
const PHASE4C_QA_CONSUMERS = new Set([
  path.resolve(process.cwd(), "scripts/qa/investingEnginePhase4CIntegrityScanner.ts"),
  path.resolve(process.cwd(), "scripts/qa/runInvestingEnginePhase4CIntegrityScan.ts"),
]);
const PHASE5A_INTERNAL_CONSUMERS = new Set([
  path.resolve(process.cwd(), "lib/investing/application/boundary.ts"),
  path.resolve(process.cwd(), "lib/investing/application/factory.server.ts"),
  path.resolve(process.cwd(), "lib/investing/application/ports.ts"),
]);
const PHASE5DR_INTERNAL_CONSUMERS = new Set([
  path.resolve(process.cwd(), "lib/investing/engine/v1/integrity/scanner.server.ts"),
  path.resolve(process.cwd(), "lib/investing/ops/infrastructure/factory.server.ts"),
  path.resolve(process.cwd(), "lib/investing/ops/infrastructure/projections.server.ts"),
  path.resolve(process.cwd(), "lib/investing/ops/infrastructure/scopedPersistence.server.ts"),
]);
function files(directory: string): string[] { return readdirSync(directory).flatMap((name) => { const target = path.join(directory, name); return statSync(target).isDirectory() ? files(target) : target.endsWith(".ts") ? [target] : []; }); }

describe("FASE 4B architectural isolation", () => {
  it("contains no operational or forbidden financial dependency", () => {
    const forbidden = ["@/app/", "@/lib/broker", "@/lib/trading", "@/lib/investing/runtime", "portfolio_items", "daily_snapshots", "localstorage", "date.now", "math.random", "fetch(", "createclient("];
    for (const file of files(ROOT)) {
      const source = readFileSync(file, "utf8").toLowerCase();
      for (const token of forbidden) expect(source, `${file}: ${token}`).not.toContain(token);
      expect(source).not.toMatch(/(?:from|import\()\s*["'][^"']*\/phase3[abcdef]/iu);
    }
  });

  it("has no API, UI, worker, scheduler or operational caller", () => {
    const roots = ["app", "components", "scripts", "lib"].map((entry) => path.resolve(process.cwd(), entry)).filter(existsSync);
    const consumers = roots.flatMap(files).filter((file) =>
      !file.startsWith(ROOT)
      && !PHASE4C_QA_CONSUMERS.has(file)
      && !PHASE5A_INTERNAL_CONSUMERS.has(file)
      && !PHASE5DR_INTERNAL_CONSUMERS.has(file)
      && readFileSync(file, "utf8").includes("investing/engine/v1/persistence"));
    expect(consumers).toEqual([]);
  });

  it("keeps credentials and environment lookup outside the adapter", () => {
    for (const file of files(ROOT)) {
      const source = readFileSync(file, "utf8").toLowerCase();
      expect(source).not.toContain("service_role_key");
      expect(source).not.toContain("supabase_service_role");
      expect(source).not.toContain("process.env");
    }
  });
});
