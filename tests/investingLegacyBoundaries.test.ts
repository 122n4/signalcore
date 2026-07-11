import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("investing legacy boundaries", () => {
  it("keeps legacy portfolio endpoints visibly redirected to portfolio_items", () => {
    for (const path of ["app/api/portfolio/route.ts", "app/api/portfolio/save/route.ts", "app/api/portfolio-meta/route.ts"]) {
      const source = read(path);
      expect(source).toContain('canonicalSource: "portfolio_items"');
      expect(source).toContain('"X-SignalCore-Deprecated": "true"');
      expect(source).toContain('"/api/portfolio-items"');
    }
  });

  it("documents portfolios writes as compatibility mirrors, not canonical holdings", () => {
    const brokerSync = read("lib/broker/sync.ts");
    const repo = read("lib/signalcore/supabaseRepo.ts");
    expect(brokerSync).toContain("Compatibility mirror only");
    expect(repo).toContain("Runtime holdings are canonical in portfolio_items");
  });

  it("does not call the removed standalone opportunities API from the legacy panel", () => {
    const panel = read("components/opportunities/OpportunitiesPanel.tsx");
    expect(panel).not.toContain('fetch("/api/opportunities"');
    expect(panel).toContain('fetch("/api/daily-bundle?mode=investing"');
    expect(panel).not.toContain("demoOpportunities");
    expect(panel).not.toContain("demoPortfolio");
    expect(panel).not.toContain("@/lib/execution/store");
    expect(panel).not.toContain("mode=trading");
    expect(panel).not.toContain("opportunity_sent_to_execution");
    expect(panel).toContain("investing_opportunity_reviewed");
  });

  it("keeps the old opportunities engine outside the active app and API routes", () => {
    const activeFiles = [
      "app/api/daily-bundle/route.ts",
      "components/opportunities/OpportunitiesPanel.tsx",
    ].map(read).join("\n");
    const legacyRepo = read("lib/opportunities/supabaseRepo.ts");

    expect(activeFiles).not.toContain("@/lib/opportunities/supabaseRepo");
    expect(activeFiles).not.toContain("@/lib/opportunities/realEngine");
    expect(legacyRepo).toContain("Active Investing opportunities are served by /api/daily-bundle");
  });
});
