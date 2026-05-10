import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import ExecutionTab from "@/app/app/tabs/ExecutionTab";
import { composeTradingWatchlistEntry } from "@/lib/trading/state";
import { createTradingLiveDecisionInput } from "./helpers/tradingLiveDecisionFixtures";

const { useTradingWorkspaceMock, pushMock } = vi.hoisted(() => ({
  useTradingWorkspaceMock: vi.fn(),
  pushMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
  }),
  useSearchParams: () => ({
    get: () => null,
  }),
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
      instrument: "EURUSD",
    },
    decisionCoreOverrides: {
      decision: {
        currentState: "TRADE_VALID",
        primaryMessage: "Trade valid",
        secondaryMessage: "Trigger still clean",
        confidence: 84,
        reasons: ["Setup aligned"],
      },
    },
  });

  input.snapshot.instrument = "EURUSD";
  input.market.instrument = "EURUSD";
  input.decisionCore.decision.currentState = "TRADE_VALID";

  return composeTradingWatchlistEntry(input);
}

describe("ExecutionTab", () => {
  it("renders continuity, queue, and cockpit details from the live workspace", () => {
    const entry = makeEntry();

    useTradingWorkspaceMock.mockReturnValue({
      status: "ready",
      error: null,
      refresh: vi.fn(),
      entries: [entry],
      leadEntry: entry,
      isRefreshing: false,
      lastUpdatedAt: entry.chart.snapshotAt,
      snapshotDiscipline: {
        blocked: false,
        footnote: "Last good snapshot 2026-03-10 14:00 UTC",
        reason: null,
      },
    });

    const html = renderToStaticMarkup(<ExecutionTab />);

    expect(html).toContain("Execution continuity");
    expect(html).toContain("Back to Desk");
    expect(html).toContain("Open Alerts");
    expect(html).toContain("Execution Queue");
    expect(html).toContain("Execution Cockpit");
    expect(html).toContain("EURUSD");
    expect(html).toContain("Next re-check");
  });
});
