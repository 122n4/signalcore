import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const uiRoot = path.resolve(root, "lib/investing/ui");
const routeRoot = path.resolve(root, "app/investing");
const component = path.resolve(root, "components/investing/InvestingRuntimeUi.tsx");
const ownedRouteFiles = [
  path.resolve(routeRoot, "error.tsx"),
  path.resolve(routeRoot, "loading.tsx"),
  path.resolve(routeRoot, "page.tsx"),
  path.resolve(routeRoot, "runs/page.tsx"),
  path.resolve(routeRoot, "runs/[runId]/page.tsx"),
];
const ownedFiles = [
  path.resolve(uiRoot, "contracts.ts"),
  path.resolve(uiRoot, "index.ts"),
  path.resolve(uiRoot, "presenter.ts"),
  path.resolve(uiRoot, "server/loader.server.ts"),
  path.resolve(uiRoot, "server/runtime.server.ts"),
];
const exactFiles = new Set([
  ...ownedFiles,
  path.resolve(uiRoot, "decisionImpact.ts"),
  path.resolve(uiRoot, "directives.ts"),
  path.resolve(uiRoot, "operatingLoop.ts"),
]);

function files(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory).flatMap((entry) => {
    const target = path.resolve(directory, entry);
    return statSync(target).isDirectory() ? files(target) : [target];
  });
}

describe("FASE 5E-R import and privacy isolation", () => {
  it("uses a closed literal UI module allowlist", () => {
    expect(new Set(files(uiRoot))).toEqual(exactFiles);
    for (const file of [
      path.resolve(uiRoot, "server/loader.server.ts"),
      path.resolve(uiRoot, "server/runtime.server.ts"),
    ]) {
      expect(readFileSync(file, "utf8").startsWith('import "server-only";')).toBe(true);
    }
  });

  it("has exactly one production integration point and no null runtime", () => {
    const production = ownedFiles
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    expect(production.match(/createProductionInvestingOpsRuntimeV1/gu)).toHaveLength(2);
    const runtime = readFileSync(path.resolve(uiRoot, "server/runtime.server.ts"), "utf8");
    expect(runtime.match(/createProductionInvestingOpsRuntimeV1\(/gu)).toHaveLength(1);
    expect(runtime).toContain("await runtime.close()");
    expect(production).not.toMatch(/return null|fake runtime|fixture|mock|fallback static/iu);
  });

  it("contains no SQL, pool, scope input, mutations or parallel composition", () => {
    const production = ownedFiles
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    expect(production).not.toMatch(
      /["'`]\s*(?:select\s+|insert\s+into\b|update\s+\S+\s+set\b|delete\s+from\b|truncate\s+\S+)|new Pool|createClient/iu,
    );
    expect(production).not.toMatch(/ownerId|tenantId|portfolioId|accountId|membershipId/u);
    expect(production).not.toMatch(/<form|<input|use server|paper-caller|Trading Paper/iu);
  });

  it("keeps the only Client Component disconnected from every server module", () => {
    const clients = [...ownedRouteFiles, component]
      .filter((file) => /^\s*["']use client["'];?/u.test(readFileSync(file, "utf8")));
    expect(clients).toEqual([path.resolve(routeRoot, "error.tsx")]);
    const source = readFileSync(clients[0], "utf8");
    expect(source).not.toMatch(/investing\/(ui|ops|identity)|server-only|process\.env|node:|postgres/iu);
  });

  it("creates no API, action, worker, queue, cron or writable UI", () => {
    const routeFiles = ownedRouteFiles;
    expect(routeFiles.some((file) => /route\.[jt]s$/u.test(file))).toBe(false);
    const source = routeFiles.map((file) => readFileSync(file, "utf8")).join("\n");
    expect(source).not.toMatch(/\b(worker|queue|cron|PM2|broker|provider|replay action|repair)\b/iu);
    expect(source).not.toMatch(/<button|<form|<input/iu);
  });

  it("does not expose technical codes or protected identifiers in UI rendering", () => {
    const source = [readFileSync(component, "utf8"), ...ownedRouteFiles
      .map((file) => readFileSync(file, "utf8"))].join("\n");
    expect(source).not.toMatch(/identity_scope_not_authorized|ops_dependency_unavailable|reasonCode/u);
    expect(source).not.toMatch(/ownerId|tenantId|membershipId|accountId|portfolioId/u);
  });
});
