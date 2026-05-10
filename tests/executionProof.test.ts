import { describe, expect, it } from "vitest";
import {
  computeExecutionProofQuality,
  evaluateExecutionProofForCloseDay,
  getExecutionProofQualityGate,
  mapJournalRowToExecutionProof,
  mapJournalRowToExecutionProofMetrics,
  mapJournalRowToExecutionProofWithCompletion,
  normalizeExecutionProofPayload,
} from "../lib/signalcore/executionProof";

describe("executionProof helpers", () => {
  it("computes quality score from evidence fields", () => {
    const score = computeExecutionProofQuality({
      completed: 2,
      total: 2,
      note: "Executed manually on broker with ticket saved",
      reference: "ABC123",
      feesEur: 1.2,
      slippageBps: 3,
    });
    expect(score).toBe(100);
  });

  it("respects explicit qualityScore override when provided", () => {
    const score = computeExecutionProofQuality({
      completed: 0,
      total: 0,
      note: "",
      reference: "",
      feesEur: null,
      slippageBps: null,
      qualityScore: 73.4,
    });
    expect(score).toBe(73);
  });

  it("returns the investing gate thresholds for the simplified runtime", () => {
    expect(getExecutionProofQualityGate("investing")).toEqual({ minQuality: 65, requireReference: false });
    expect(getExecutionProofQualityGate("forex")).toEqual({ minQuality: 65, requireReference: false });
  });

  it("evaluates close-day gate with the investing-only threshold", () => {
    const blocked = evaluateExecutionProofForCloseDay({
      mode: "investing",
      completed: 1,
      total: 1,
      note: "done",
      reference: "",
      feesEur: null,
      slippageBps: null,
    });
    expect(blocked.ok).toBe(false);
    expect(blocked.reason).toMatch(/65\/100/i);

    const allowed = evaluateExecutionProofForCloseDay({
      mode: "investing",
      completed: 1,
      total: 1,
      note: "Executed and checked fees",
      reference: "",
      feesEur: 0.4,
      slippageBps: 2,
    });
    expect(allowed.ok).toBe(true);
  });

  it("normalizes payload and computes quality when absent", () => {
    const proof = normalizeExecutionProofPayload({
      broker: " etoro ",
      leakKey: " concentration_med ",
      completed: "1",
      total: "2",
      note: "Manual order",
      reference: "x1",
      feesEur: "2.5",
      slippageBps: "4",
      orders: [
        {
          symbol: " spy ",
          action: "buy",
          targetValueEur: "100",
          qtyTarget: "1",
          referencePrice: "510",
          limitPrice: "511",
          stopLossPrice: "485",
          orderNotionalEur: "100",
          filledPrice: "510.4",
          filledQty: "1",
          brokerOrderId: "X-1001",
          executedAt: "2026-02-28T09:30:00.000Z",
          reason: "entry",
        },
      ],
    });

    expect(proof.broker).toBe("etoro");
    expect(proof.leakKey).toBe("concentration_med");
    expect(proof.completed).toBe(1);
    expect(proof.total).toBe(2);
    expect(proof.orders[0].symbol).toBe("SPY");
    expect(proof.qualityScore).toBeGreaterThan(0);
  });

  it("maps journal rows consistently for API/export/track-record", () => {
    const row = {
      id: 11,
      type: "daily_done",
      mode: "investing",
      created_at: "2026-02-25T10:00:00.000Z",
      details: {
        manualExecutionProof: {
          broker: "ibkr",
          completed: 2,
          total: 2,
          note: "ticket refs saved and fees captured",
          reference: "TR-991",
          feesEur: 1.1,
          slippageBps: 2,
          orders: [
            {
              symbol: "AAPL",
              action: "BUY",
              targetValueEur: 250,
              qtyTarget: 1.2,
              referencePrice: 190,
              limitPrice: 191,
              stopLossPrice: 178,
              orderNotionalEur: 250,
              filledPrice: 190.6,
              filledQty: 1.2,
              brokerOrderId: "IBKR-1001",
              executedAt: "2026-02-25T10:01:00.000Z",
              reason: "deploy plan",
            },
          ],
        },
      },
    };

    const mapped = mapJournalRowToExecutionProof(row);
    const exportMapped = mapJournalRowToExecutionProofWithCompletion(row);
    const metrics = mapJournalRowToExecutionProofMetrics(row);

    expect(mapped?.id).toBe("11");
    expect(mapped?.qualityScore).toBe(exportMapped?.qualityScore);
    expect(exportMapped?.completionPct).toBe(100);
    expect(mapped?.orders?.length).toBe(1);
    expect(exportMapped?.orders?.[0]?.brokerOrderId).toBe("IBKR-1001");
    expect(metrics?.dayKey).toBe("2026-02-25");
    expect(metrics?.qualityScore).toBe(mapped?.qualityScore);
  });
});
