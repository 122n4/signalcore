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

  it("does not present legacy daily-bundle recommendations from offline setup", () => {
    const setup = read("app/app/offline-setup/offlineSetupClient.tsx");
    expect(setup).not.toContain("/api/daily-bundle");
    expect(setup).not.toContain("Allocation target");
    expect(setup).not.toContain("Top opportunities now");
    expect(setup).not.toContain("high-conviction");
    expect(setup).not.toContain("Get my first action");
    expect(setup).not.toContain("starterReady");
    expect(setup).toContain("Recommendation authority is unavailable during setup");
    expect(setup).toContain("canonical mandate and decision authority");
  });

  it("keeps main investing surfaces on the canonical dashboard endpoint", () => {
    const appUi = read("app/app/ui.tsx");
    const investingExperience = read("app/app/investing/InvestingExperience.tsx");
    const dashboardSurface = read("app/app/tabs/InvestingDashboardSurface.tsx");

    expect(appUi).toContain("<InvestingExperience screen=\"overview\" />");
    expect(appUi).toContain("<InvestingExperience screen=\"plan\" />");
    expect(appUi).toContain("<InvestingExperience screen=\"portfolio\" />");
    expect(appUi).toContain("<InvestingExperience screen=\"insights\" />");
    expect(investingExperience).toContain('fetch("/api/investing/dashboard"');
    expect(dashboardSurface).toContain("/api/investing/dashboard?mode=investing");
  });

  it("keeps R5 customer decision authority closed", () => {
    const dashboard = read("lib/investing/server/dashboard.ts");
    expect(dashboard).toContain("function hasAcceptedCanonicalDecisionAuthority");
    expect(dashboard).toContain("return false;");
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
