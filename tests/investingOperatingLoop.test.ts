import { describe, expect, it } from "vitest";

import {
  buildInvestingOperatingLoopSummary,
  formatInvestingNextReviewWindow,
} from "@/lib/signalcore/investingOperatingLoop";

describe("investing operating loop", () => {
  it("starts with plan activation when the user has no active plan", () => {
    const summary = buildInvestingOperatingLoopSummary({
      hasPlan: false,
      hasHoldings: false,
      doneToday: false,
      receiptsCount: 0,
      streak: 0,
      nextReviewAt: null,
    });

    expect(summary.stage).toBe("setup_plan");
    expect(summary.progressDone).toBe(0);
    expect(summary.steps.map((step) => step.state)).toEqual(["active", "idle", "idle", "idle"]);
    expect(summary.headline).toContain("Activate the plan");
  });

  it("moves to proof capture once plan and holdings are in place", () => {
    const summary = buildInvestingOperatingLoopSummary({
      hasPlan: true,
      hasHoldings: true,
      doneToday: false,
      receiptsCount: 0,
      streak: 2,
      weeklyConfirmedEur: 130,
      nextReviewAt: "2026-03-24T19:00:00.000Z",
      nowMs: Date.parse("2026-03-24T18:00:00.000Z"),
    });

    expect(summary.stage).toBe("capture_proof");
    expect(summary.progressDone).toBe(2);
    expect(summary.steps.map((step) => step.state)).toEqual(["done", "done", "active", "idle"]);
    expect(summary.nextReviewLabel).toBe("1h");
  });

  it("promotes the day to close-day once proof exists and then to closed waiting", () => {
    const openSummary = buildInvestingOperatingLoopSummary({
      hasPlan: true,
      hasHoldings: true,
      doneToday: false,
      receiptsCount: 3,
      streak: 4,
      weeklyConfirmedEur: 240,
      nextReviewAt: "2026-03-24T19:00:00.000Z",
      nowMs: Date.parse("2026-03-24T18:00:00.000Z"),
    });

    expect(openSummary.stage).toBe("close_day");
    expect(openSummary.progressDone).toBe(3);
    expect(openSummary.steps.map((step) => step.state)).toEqual(["done", "done", "done", "active"]);

    const closedSummary = buildInvestingOperatingLoopSummary({
      hasPlan: true,
      hasHoldings: true,
      doneToday: true,
      receiptsCount: 3,
      streak: 5,
      weeklyConfirmedEur: 280,
      nextReviewAt: "2026-03-25T06:00:00.000Z",
      nowMs: Date.parse("2026-03-24T18:00:00.000Z"),
    });

    expect(closedSummary.stage).toBe("closed_waiting");
    expect(closedSummary.progressDone).toBe(4);
    expect(closedSummary.steps.every((step) => step.state === "done")).toBe(true);
    expect(closedSummary.headline).toContain("closed");
  });

  it("formats next review windows into compact retention labels", () => {
    const now = Date.parse("2026-03-24T18:00:00.000Z");

    expect(formatInvestingNextReviewWindow(null, now)).toBe("Next review pending");
    expect(formatInvestingNextReviewWindow("2026-03-24T18:05:00.000Z", now)).toBe("5m");
    expect(formatInvestingNextReviewWindow("2026-03-24T21:00:00.000Z", now)).toBe("3h");
    expect(formatInvestingNextReviewWindow("2026-03-26T18:00:00.000Z", now)).toBe("2d");
  });
});
