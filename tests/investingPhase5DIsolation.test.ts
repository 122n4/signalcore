import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const opsRoot = path.join(root, "lib", "investing", "ops");

function files(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory).flatMap((entry) => {
    const target = path.join(directory, entry);
    return statSync(target).isDirectory() ? files(target) : [target];
  });
}

describe("Investing FASE 5D OPS isolation", () => {
  it("keeps the neutral entrypoint contracts-only and transitively browser-safe", () => {
    const index = readFileSync(path.join(opsRoot, "index.ts"), "utf8");
    expect(index).toContain("investing/ops/contracts");
    expect(index).not.toMatch(/\/server|\/ports|\/errors|factory|service|adapter/u);
    const neutral = ["index.ts", "contracts.ts"]
      .map((name) => readFileSync(path.join(opsRoot, name), "utf8"))
      .join("\n");
    expect(neutral).not.toMatch(
      /server-only|process\.env|node:|postgres|application\/server|identity\/server|paper-caller\/server|persistence\/postgres/u,
    );
  });

  it("marks every real data/service module server-only", () => {
    for (const name of [
      "adapter.server.ts",
      "service.server.ts",
      "factory.server.ts",
      "server.ts",
    ]) {
      expect(readFileSync(path.join(opsRoot, name), "utf8")
        .startsWith('import "server-only";')).toBe(true);
    }
  });

  it("contains no SQL, mutation, alternate engine machinery or Paper caller", () => {
    const source = files(opsRoot).map((file) => readFileSync(file, "utf8")).join("\n");
    expect(source).not.toMatch(
      /\b(select|insert|update|delete|upsert|truncate)\b|process\.env|new Pool|createClient/u,
    );
    expect(source).not.toMatch(
      /canonicalize|new InvestingEngine|VerifierV1|ReplayServiceV1|paper-caller|createCanonicalRun|repair|reconcile/u,
    );
  });

  it("has zero public, UI, cron, queue, worker, PM2, broker or provider callers", () => {
    const allowed = new Set(files(opsRoot).map((file) => path.resolve(file)));
    const candidates = ["app", "components", "lib", "scripts"]
      .map((entry) => path.join(root, entry))
      .flatMap(files)
      .filter((file) => /\.[cm]?[jt]sx?$/u.test(file))
      .filter((file) => !allowed.has(path.resolve(file)));
    const callers = candidates.filter((file) => {
      const source = readFileSync(file, "utf8");
      return source.includes("investing/ops/")
        || source.includes('from "@/lib/investing/ops"')
        || source.includes("createInvestingOpsServiceV1");
    });
    expect(callers).toEqual([]);
  });

  it("has no Client Component path and no Trading Paper mixture", () => {
    const clients = ["app", "components", "lib"]
      .map((entry) => path.join(root, entry))
      .flatMap(files)
      .filter((file) => /\.[jt]sx?$/u.test(file))
      .filter((file) => /^\s*["']use client["'];?/u.test(readFileSync(file, "utf8")));
    for (const file of clients) {
      expect(readFileSync(file, "utf8")).not.toContain("investing/ops/server");
    }
    expect(files(opsRoot).join("\n")).not.toMatch(/[\\/]trading[\\/]/iu);
  });

  it("contains no Phase 5E or 5F surface", () => {
    const source = files(opsRoot).map((file) => readFileSync(file, "utf8")).join("\n");
    expect(source).not.toMatch(/phase5[ef]|phase 5[ef]|fase 5[ef]/iu);
  });
});
