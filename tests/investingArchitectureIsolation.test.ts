import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const prohibited = [
  "@/lib/broker",
  "@/lib/trading",
  "@/lib/signalcore",
  "@/lib/supabase/admin",
  "lib/broker",
  "lib/trading",
  "lib/signalcore",
];

function listTsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) return listTsFiles(path);
    return path.endsWith(".ts") || path.endsWith(".tsx") ? [path] : [];
  });
}

describe("investing architecture isolation", () => {
  it("keeps lib/investing independent from broker, trading, signalcore and shared admin boundaries", () => {
    const files = listTsFiles(join(process.cwd(), "lib/investing"));
    const violations: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const token of prohibited) {
        if (source.includes(token)) violations.push(`${relative(process.cwd(), file)}:${token}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("keeps historical_raw access read-only by contract", () => {
    const source = readFileSync(join(process.cwd(), "lib/investing/historical-market-data/reader.ts"), "utf8");
    expect(source).toContain("readHistoricalRaw");
    expect(source).toContain("investing_historical_raw_is_read_only");
  });

  it("keeps the transitive Investing runtime graph outside Trading, Broker and SignalCore", () => {
    const root = process.cwd();
    const queue = [
      ...listTsFiles(join(root, "lib/investing")),
      ...listTsFiles(join(root, "app/api/investing")),
      join(root, "app/app/tabs/DailyTab.tsx"),
      join(root, "app/app/tabs/InvestingDashboardSurface.tsx"),
      join(root, "app/app/tabs/dailyDecisionViewModel.ts"),
      ...listTsFiles(join(root, "components/investing")),
    ];
    const visited = new Set<string>();
    const violations: string[] = [];
    while (queue.length) {
      const file = queue.pop()!;
      if (visited.has(file)) continue;
      visited.add(file);
      const source = readFileSync(file, "utf8");
      const imports = [...source.matchAll(/(?:from\s+|import\s*\()(["'])([^"']+)\1/g)].map((match) => match[2]!);
      for (const specifier of imports) {
        if (specifier.startsWith("@/lib/broker") || specifier.startsWith("@/lib/trading") || specifier.startsWith("@/lib/signalcore")) {
          violations.push(`${relative(root, file)} -> ${specifier}`);
          continue;
        }
        const base = specifier.startsWith("@/") ? join(root, specifier.slice(2)) : specifier.startsWith(".") ? resolve(dirname(file), specifier) : null;
        if (!base) continue;
        const candidate = [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts")].find((path) => existsSync(path) && statSync(path).isFile());
        if (candidate && (candidate.endsWith(".ts") || candidate.endsWith(".tsx"))) queue.push(candidate);
      }
    }
    expect(violations).toEqual([]);
  });

  it("keeps the Investing UI off shared broker, snapshot, journal and auto-fix APIs", () => {
    const source = readFileSync(join(process.cwd(), "app/app/tabs/DailyTab.tsx"), "utf8");
    for (const endpoint of ["/api/broker/", "/api/daily-bundle", "/api/daily-snapshot", "/api/journal/", "/api/fix-now/"]) {
      expect(source).not.toContain(endpoint);
    }
    expect(source).toContain("/api/investing/dashboard");
    expect(source).toContain("/api/investing/daily-cycle");
    expect(source).toContain("/api/investing/paper/accounts");
  });

  it("keeps the Investing portfolio tab on canonical Investing APIs", () => {
    const source = readFileSync(join(process.cwd(), "app/app/tabs/PortfolioTab.tsx"), "utf8");
    for (const endpoint of ["/api/daily-bundle", "/api/portfolio-items", "/api/fix-now/"]) {
      expect(source).not.toContain(endpoint);
    }
    expect(source).toContain("/api/investing/dashboard");
    expect(source).toContain("/api/investing/paper/accounts");
  });

  it("keeps all primary Investing tabs off legacy shared automation APIs", () => {
    const tabFiles = ["DailyTab.tsx", "PlanningTab.tsx", "PortfolioTab.tsx", "AdvisorTab.tsx", "AutonomyTab.tsx", "InvestingDashboardSurface.tsx"];
    for (const tabFile of tabFiles) {
      const source = readFileSync(join(process.cwd(), "app/app/tabs", tabFile), "utf8");
      for (const endpoint of ["/api/daily-bundle", "/api/portfolio-items", "/api/fix-now/", "/api/broker/", "/api/daily/close", "@/lib/broker"]) {
        expect(source, `${tabFile} should not call ${endpoint}`).not.toContain(endpoint);
      }
      expect(source, `${tabFile} should read the canonical Investing dashboard`).toContain("/api/investing/dashboard");
    }
  });

  it("does not expose fake disabled action buttons on the unified Investing dashboard", () => {
    const source = readFileSync(join(process.cwd(), "app/app/tabs/InvestingDashboardSurface.tsx"), "utf8");
    expect(source).not.toMatch(/<button[^>]*\sdisabled[\s=>]/i);
    expect(source).not.toContain("disabled in audit build");
  });
});
