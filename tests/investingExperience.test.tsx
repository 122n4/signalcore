import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { InvestingExperienceStateView } from "@/app/app/investing/InvestingExperience";

describe("InvestingExperience", () => {
  it("renders first-screen loading without legacy dashboard data", () => {
    const html = renderToStaticMarkup(
      <InvestingExperienceStateView screen="overview" state={{ status: "loading", data: null, error: null }} />,
    );

    expect(html).toContain("Loading dashboard");
    expect(html).toContain("Dados indisponiveis neste momento");
    expect(html).not.toContain("€0");
  });

  it("renders recoverable error with retry and no fabricated zero values", () => {
    const retry = vi.fn();
    const html = renderToStaticMarkup(
      <InvestingExperienceStateView
        screen="overview"
        state={{ status: "error", data: null, error: "Dados indisponiveis neste momento" }}
        onRetry={retry}
      />,
    );

    expect(html).toContain("Retry");
    expect(html).toContain("Dados indisponiveis neste momento");
    expect(html).not.toContain("€0");
  });

  it("renders real, estimated, stale, and unavailable portfolio truth distinctly", () => {
    const real = renderToStaticMarkup(
      <InvestingExperienceStateView
        screen="overview"
        state={{
          status: "ready",
          error: null,
          data: {
            portfolio: {
              accountId: "a",
              environment: "paper",
              cash: { amountEur: 700, availability: "REAL" },
              totalEur: 700,
              valuation: { totalEur: 700, availability: "REAL", source: "cash_only" },
            },
            derived: { decisionAvailability: "REAL", customerDecision: { summary: { title: "Decision available" } } },
          },
        }}
      />,
    );
    expect(real).toContain("€700");
    expect(real).toContain("Real - cash only");

    const estimated = renderToStaticMarkup(
      <InvestingExperienceStateView
        screen="overview"
        state={{
          status: "ready",
          error: null,
          data: {
            portfolio: {
              accountId: "a",
              environment: "paper",
              cash: { amountEur: 700, availability: "REAL" },
              totalEur: 950,
              valuation: { totalEur: 950, availability: "ESTIMATED", source: "cost_basis_fallback" },
            },
            derived: { decisionAvailability: "ESTIMATED" },
          },
        }}
      />,
    );
    expect(estimated).toContain("€950");
    expect(estimated).toContain("Estimated");

    const stale = renderToStaticMarkup(
      <InvestingExperienceStateView
        screen="overview"
        state={{
          status: "ready",
          error: null,
          data: {
            portfolio: {
              accountId: "a",
              environment: "paper",
              cash: { amountEur: 700, availability: "REAL" },
              totalEur: 1000,
              valuation: { totalEur: 1000, availability: "STALE", source: "market_quotes" },
            },
            derived: { decisionAvailability: "STALE" },
          },
        }}
      />,
    );
    expect(stale).toContain("€1,000");
    expect(stale).toContain("Stale");

    const unavailable = renderToStaticMarkup(
      <InvestingExperienceStateView
        screen="overview"
        state={{
          status: "ready",
          error: null,
          data: {
            portfolio: {
              accountId: "a",
              environment: "paper",
              cash: { amountEur: 0, availability: "UNAVAILABLE" },
              totalEur: 0,
              valuation: { totalEur: 0, availability: "UNAVAILABLE", source: "empty" },
            },
            derived: { decisionAvailability: "UNAVAILABLE" },
          },
        }}
      />,
    );
    expect(unavailable).toContain("Dados indisponiveis neste momento");
    expect(unavailable).not.toContain("€0");
  });

  it("renders portfolio active holdings only and respects cash truth", () => {
    const html = renderToStaticMarkup(
      <InvestingExperienceStateView
        screen="portfolio"
        state={{
          status: "ready",
          error: null,
          data: {
            portfolio: {
              accountId: "a",
              environment: "simulation",
              cash: { amountEur: 0, availability: "REAL" },
              totalEur: 200,
              valuation: { totalEur: 200, availability: "REAL", source: "market_quotes" },
              items: [
                { symbol: "VWCE", qty: 0, valueEur: 100, valuationAvailability: "REAL" },
                { symbol: "IWDA", qty: 2, valueEur: 200, valuationAvailability: "REAL" },
              ],
            },
          },
        }}
      />,
    );

    expect(html).toContain("IWDA");
    expect(html).not.toContain("VWCE");
    expect(html).toContain("€0");
    expect(html).toContain("Simulation");
  });

  it("renders plan and insights without fake progress or actionable unavailable decisions", () => {
    const planHtml = renderToStaticMarkup(
      <InvestingExperienceStateView screen="plan" state={{ status: "ready", error: null, data: { plan: { goal: "Long-term plan" } } }} />,
    );
    expect(planHtml).toContain("Plan target not yet available");
    expect(planHtml).not.toContain("€50");
    expect(planHtml).not.toContain("0%");

    const insightsHtml = renderToStaticMarkup(
      <InvestingExperienceStateView
        screen="insights"
        state={{ status: "ready", error: null, data: { derived: { decisionAvailability: "UNAVAILABLE" } } }}
      />,
    );
    expect(insightsHtml).toContain("Decision data unavailable. Refresh required.");
    expect(insightsHtml).toContain("Research remains a validation surface");
  });

  it("keeps the new primary experience on the canonical dashboard read path only", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "app/app/investing/InvestingExperience.tsx"), "utf8");

    expect(source).toContain('fetch("/api/investing/dashboard"');
    expect(source).toContain('cache: "no-store"');
    expect(source).toContain("AbortController");
    expect(source).toContain("DASHBOARD_TIMEOUT_MS = 12_000");
    expect(source).not.toContain("loadInvestingExperienceDashboard");
    expect(source).not.toContain("view=experience");
    expect(source).not.toContain("createClient");
    expect(source).not.toContain("supabase");
    expect(source).not.toContain("method: \"POST\"");
    expect(source).not.toContain("/api/investing/paper/orders");
    expect(source).not.toContain("/api/investing/paper/accounts");
  });

  it("does not resurrect dead dirty RPC names", () => {
    const sources = [
      "app/app/investing/InvestingExperience.tsx",
      "app/app/investing/investingExperienceModel.ts",
      "lib/investing/server/dashboard.ts",
    ].map((file) => fs.readFileSync(path.join(process.cwd(), file), "utf8").toLowerCase());
    const joined = sources.join("\n");

    expect(joined).not.toContain("read_investing_dashboard_compact_v1");
    expect(joined).not.toContain("loadinvestingexperiencedashboard");
    expect(joined).not.toContain("open_investing_account_mode_v1");
    expect(joined).not.toContain("read_investing_account_truth_v1");
    expect(joined).not.toContain("propose_investing_live_manual_order_v1");
    expect(joined).not.toContain("read_investing_canonical_plan_v1");
    expect(joined).not.toContain("save_investing_dashboard_preferences_v1");
  });
});
