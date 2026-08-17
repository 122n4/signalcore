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
    expect(setup).not.toContain("/api/plans");
    expect(setup).not.toContain("buildScenarios");
    expect(setup).not.toContain("requiredMonthlyContribution");
    expect(setup).not.toContain("baseAnnualReturnPct");
    expect(setup).not.toContain("Assumed annual return");
    expect(setup).not.toContain("Projected value");
    expect(setup).not.toContain("Required monthly deposit");
    expect(setup).not.toContain("Required monthly contribution");
    expect(setup).not.toContain("realistic range");
    expect(setup).not.toContain("increase monthly contribution");
    expect(setup).not.toContain("5.5");
    expect(setup).not.toContain("7.5");
    expect(setup).not.toContain("10%");
    expect(setup).not.toContain("sc_wealth_plan_v1");
    expect(setup).not.toContain("sc_goal_quiz_v1");
    expect(setup).not.toContain("sc_starter_budget_v1");
    expect(setup).not.toContain("risk_profile");
    expect(setup).not.toContain("horizon");
    expect(setup).not.toContain("goal_target_value");
    expect(setup).not.toContain("monthly_contribution");
    expect(setup).not.toContain("goal_timeframe_months");
    expect(setup).not.toContain("Allocation target");
    expect(setup).not.toContain("Top opportunities now");
    expect(setup).not.toContain("high-conviction");
    expect(setup).not.toContain("Get my first action");
    expect(setup).not.toContain("starterReady");
    expect(setup).not.toContain("BUY");
    expect(setup).not.toContain("SELL");
    expect(setup).not.toContain("recommended allocation");
    expect(setup).toContain("Canonical Plan authoring is currently unavailable");
    expect(setup).toContain("Recommendation authority is unavailable during setup");
    expect(setup).toContain("Canonical financial authoring is unavailable");
  });

  it("keeps main investing sources present but disconnected from the active app shell", () => {
    const appUi = read("app/app/ui.tsx");
    const investingExperience = read("app/app/investing/InvestingExperience.tsx");
    const dashboardSurface = read("app/app/tabs/InvestingDashboardSurface.tsx");

    expect(appUi).not.toContain("@/app/app/investing/InvestingExperience");
    expect(appUi).not.toContain("@/app/app/tabs/InvestingDashboardSurface");
    expect(appUi).not.toContain("@/app/app/offline-setup/offlineSetupClient");
    expect(appUi).not.toContain("@/components/AutopilotSwitcher");
    expect(appUi).not.toContain("<InvestingExperience");
    expect(appUi).not.toContain("<InvestingDashboardSurface");
    expect(appUi).not.toContain("<OfflineSetupClient");
    expect(appUi).not.toContain("/api/investing/dashboard");
    expect(appUi).not.toContain("/api/daily-bundle?mode=investing");
    expect(appUi).toContain("InvestingTemporarilyUnavailableBoundary");
    expect(appUi).toContain("Investing is temporarily unavailable while the canonical experience is rebuilt.");
    expect(appUi).toContain("No Investing dashboard data is loaded from this temporary boundary.");
    expect(appUi).toContain("/app?tab=trading&mode=trading");
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
