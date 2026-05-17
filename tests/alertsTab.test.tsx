import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import AlertsTab from "@/app/app/tabs/AlertsTab";
import { composeTradingOpportunityLayers } from "@/app/app/tabs/tradingWorkspace";
import { composeTradingWatchlistEntry } from "@/lib/trading/state";
import { createTradingLiveDecisionInput } from "./helpers/tradingLiveDecisionFixtures";

const { useTradingWorkspaceMock } = vi.hoisted(() => ({
  useTradingWorkspaceMock: vi.fn(),
}));

vi.mock("@/app/app/tabs/tradingWorkspace", async () => {
  const actual = await vi.importActual<typeof import("@/app/app/tabs/tradingWorkspace")>(
    "@/app/app/tabs/tradingWorkspace",
  );
  return {
    ...actual,
    useTradingWorkspace: useTradingWorkspaceMock,
  };
});

function makeEntry() {
  const input = createTradingLiveDecisionInput({
    marketOverrides: {
      instrument: "GBPUSD",
    },
    decisionCoreOverrides: {
      decision: {
        currentState: "WAIT",
        primaryMessage: "Wait for cleaner trigger",
        secondaryMessage: "Range still compressing",
        confidence: 71,
        reasons: ["Session still building"],
      },
    },
  });

  input.snapshot.instrument = "GBPUSD";
  input.market.instrument = "GBPUSD";
  input.decisionCore.decision.currentState = "WAIT";

  const entry = composeTradingWatchlistEntry(input);

  return {
    ...entry,
    executionStatus: "caution" as const,
    liveDecision: {
      ...entry.liveDecision,
      executionStatus: "caution" as const,
      nextDisciplineStep: "Wait for the trigger to print inside the London session.",
    },
  };
}

describe("AlertsTab", () => {
  it("renders continuity and clean Portuguese alert copy", () => {
    const entry = makeEntry();

    useTradingWorkspaceMock.mockReturnValue({
      status: "ready",
      error: null,
      refresh: vi.fn(),
      entries: [entry],
      opportunityLayers: composeTradingOpportunityLayers([entry]),
      notifications: [],
      isRefreshing: false,
      lastUpdatedAt: entry.chart.snapshotAt,
      snapshotDiscipline: {
        blocked: false,
        footnote: "Ultimo snapshot valido 2026-03-10 14:00 UTC",
        reason: null,
      },
    });

    const html = renderToStaticMarkup(<AlertsTab locale="pt" />);

    expect(html).toContain("Alert continuity");
    expect(html).toContain("Followed until close");
    expect(html).toContain("No followed instruments yet");
    expect(html).toContain("Proximas reavaliacoes");
    expect(html).toContain("Back to Desk");
    expect(html).toContain("Logica de automacao");
    expect(html).toContain("Permissao nao e obrigacao.");
    expect(html).toContain("GBPUSD");
  });
});
