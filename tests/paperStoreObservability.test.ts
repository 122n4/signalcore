import { describe, expect, it } from "vitest";

import { buildPaperObservability } from "@/lib/trading/bot/paperStore";
import type { PaperTradeHistoryRow } from "@/lib/trading/bot/paperPerformance";

function rowWithOutcome(
  id: string,
  status: string,
  reason = "",
): PaperTradeHistoryRow {
  return {
    id,
    title: "Paper cycle",
    created_at: "2026-06-21T10:00:00.000Z",
    details: {
      paperOutcome: {
        status,
        checkedAt: "2026-06-21T10:05:00.000Z",
        closedAt: status === "open" || status === "unavailable_retryable" ? null : "2026-06-21T10:05:00.000Z",
        resultR: null,
        exitPrice: null,
        reason,
      },
    },
  };
}

describe("paper store observability", () => {
  it("treats final unavailable settlements as failures, not unresolved reconciliation work", () => {
    const observability = buildPaperObservability({
      schemaReady: true,
      reconciledHistoricalCycles: 0,
      repairedThisRun: 0,
      rows: [rowWithOutcome("paper-1", "unavailable", "tick order unavailable")],
      error: null,
    });

    expect(observability.settlementFailures).toBe(1);
    expect(observability.unresolvedCycles).toBe(0);
    expect(observability.unsettledCycleCount).toBe(0);
    expect(observability.reconciliationStatus).toBe("ok");
  });

  it("keeps retryable/open settlements marked as partial until they resolve", () => {
    const observability = buildPaperObservability({
      schemaReady: true,
      reconciledHistoricalCycles: 0,
      repairedThisRun: 0,
      rows: [
        rowWithOutcome("paper-1", "open"),
        rowWithOutcome("paper-2", "unavailable_retryable", "provider timeout"),
      ],
      error: null,
    });

    expect(observability.unresolvedCycles).toBe(2);
    expect(observability.unsettledCycleCount).toBe(2);
    expect(observability.retryableSettlementCount).toBe(1);
    expect(observability.reconciliationStatus).toBe("partial");
  });
});
