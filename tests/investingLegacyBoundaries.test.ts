import { existsSync, readFileSync } from "node:fs";
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

  it("physically removes obsolete Investing UX source paths", () => {
    const deletedPaths = [
      "app/app/investing/InvestingExperience.tsx",
      "app/app/investing/investingExperienceModel.ts",
      "app/app/offline-setup/offlineSetupClient.tsx",
      "app/app/offline-setup/page.tsx",
      "app/app/welcome/page.tsx",
      "app/app/welcome/welcomeClient.tsx",
      "app/app/daily/page.tsx",
      "app/app/daily/DailyClient.tsx",
      "app/app/daily/DailyPageClient.tsx",
      "app/app/portfolio/page.tsx",
      "app/my-portfolio/page.tsx",
      "app/structure-preview/page.tsx",
      "components/opportunities/OpportunitiesPanel.tsx",
      "components/planning/PlanningCopilotChat.tsx",
      "lib/opportunities/demo.ts",
      "lib/opportunities/realEngine.ts",
      "lib/opportunities/supabaseRepo.ts",
      "lib/opportunities/types.ts",
    ];

    for (const path of deletedPaths) {
      expect(existsSync(join(process.cwd(), path)), `${path} should be deleted`).toBe(false);
    }
  });

  it("keeps removed Investing UX disconnected from the active app shell", () => {
    const appUi = read("app/app/ui.tsx");

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
    expect(appUi).toContain('String(search?.get("mode") || "").toLowerCase().trim()');
    expect(appUi).toContain("/app?tab=trading&mode=trading");
    expect(appUi).toContain("<TradingTab");
    expect(appUi).toContain("<JournalTab");
    expect(appUi).toContain("<AlertsTab");
  });

  it("does not keep deleted Investing page front doors in the protected route matcher", () => {
    const proxy = read("proxy.ts");

    expect(proxy).not.toContain('"/my-portfolio(.*)"');
    expect(proxy).not.toContain('"/portfolio(.*)"');
  });

  it("treats whitespace-wrapped investing mode as the unavailable Investing boundary", () => {
    const appUi = read("app/app/ui.tsx");
    const params = new URLSearchParams("mode=%20investing%20");
    const requestedModeRaw = String(params.get("mode") || "").toLowerCase().trim();
    const investingUnavailableRequested = requestedModeRaw === "investing";

    expect(appUi).toContain('String(search?.get("mode") || "").toLowerCase().trim()');
    expect(requestedModeRaw).toBe("investing");
    expect(investingUnavailableRequested).toBe(true);
    expect(appUi.indexOf("investingUnavailableRequested ? (")).toBeLessThan(appUi.indexOf("<TradingTab"));
    expect(appUi).toContain("<InvestingTemporarilyUnavailableBoundary");
  });

  it("keeps R5 customer decision authority closed", () => {
    const dashboard = read("lib/investing/server/dashboard.ts");
    expect(dashboard).toContain("function hasAcceptedCanonicalDecisionAuthority");
    expect(dashboard).toContain("return false;");
  });

  it("physically removes the old opportunities engine from active source", () => {
    const activeFiles = [
      "app/api/daily-bundle/route.ts",
    ].map(read).join("\n");

    expect(activeFiles).not.toContain("@/lib/opportunities/supabaseRepo");
    expect(activeFiles).not.toContain("@/lib/opportunities/realEngine");
    expect(existsSync(join(process.cwd(), "lib/opportunities"))).toBe(false);
  });
});
