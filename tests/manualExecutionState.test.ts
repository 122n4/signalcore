import { describe, expect, it } from "vitest";
import {
  evaluateManualExecutionProofAgainstPending,
  hasBlockingManualExecutionPendingForToday,
  isManualExecutionPendingForCurrentUtcDay,
  type ManualExecutionStateSnapshot,
} from "../lib/signalcore/manualExecutionState";

describe("manualExecutionState", () => {
  it("rejects proof when pending checklist rows are not fully covered", () => {
    const out = evaluateManualExecutionProofAgainstPending({
      mode: "investing",
      pendingRowsRequired: 3,
      proof: {
        broker: "manual",
        leakKey: "concentration_high",
        completed: 2,
        total: 2,
        note: "Executed with tickets and fees captured",
        reference: "ABC123",
        feesEur: 1.2,
        slippageBps: 3,
        source: "manual_checklist",
        qualityScore: 95,
        orders: [
          {
            symbol: "AAA",
            action: "BUY",
            targetValueEur: 200,
            qtyTarget: 1,
            referencePrice: 200,
            limitPrice: 201,
            stopLossPrice: 180,
            orderNotionalEur: 200,
            filledPrice: 200.5,
            filledQty: 1,
            brokerOrderId: "T-AAA-1",
            executedAt: "2026-02-28T09:00:00.000Z",
            reason: "rebalance",
          },
          {
            symbol: "BBB",
            action: "SELL",
            targetValueEur: 0,
            qtyTarget: 0.5,
            referencePrice: 100,
            limitPrice: 99,
            stopLossPrice: null,
            orderNotionalEur: 100,
            filledPrice: 99.5,
            filledQty: 0.5,
            brokerOrderId: "T-BBB-1",
            executedAt: "2026-02-28T09:01:00.000Z",
            reason: "trim risk",
          },
        ],
      },
    });
    expect(out.ok).toBe(false);
    expect(out.reason).toMatch(/requires 3 orders/i);
  });

  it("accepts proof when gate and pending row requirements are met", () => {
    const out = evaluateManualExecutionProofAgainstPending({
      mode: "investing",
      pendingRowsRequired: 2,
      proof: {
        broker: "manual",
        leakKey: "pricing_low",
        completed: 2,
        total: 2,
        note: "Executed and validated checklist",
        reference: "TR-001",
        feesEur: 0.9,
        slippageBps: 2,
        source: "manual_checklist",
        qualityScore: 88,
        orders: [
          {
            symbol: "AAPL",
            action: "BUY",
            targetValueEur: 300,
            qtyTarget: 1.2,
            referencePrice: 190,
            limitPrice: 191,
            stopLossPrice: 179,
            orderNotionalEur: 300,
            filledPrice: 190.8,
            filledQty: 1.2,
            brokerOrderId: "TR-AAPL-1",
            executedAt: "2026-02-28T09:10:00.000Z",
            reason: "plan deploy",
          },
          {
            symbol: "MSFT",
            action: "SELL",
            targetValueEur: 120,
            qtyTarget: 0.6,
            referencePrice: 400,
            limitPrice: 399,
            stopLossPrice: null,
            orderNotionalEur: 180,
            filledPrice: 399.2,
            filledQty: 0.6,
            brokerOrderId: "TR-MSFT-1",
            executedAt: "2026-02-28T09:11:00.000Z",
            reason: "concentration trim",
          },
        ],
      },
    });
    expect(out.ok).toBe(true);
    expect(out.reason).toBe("");
  });

  it("accepts proof when per-order fill details are missing but gate is satisfied", () => {
    const out = evaluateManualExecutionProofAgainstPending({
      mode: "investing",
      pendingRowsRequired: 1,
      proof: {
        broker: "manual",
        leakKey: "pricing_low",
        completed: 1,
        total: 1,
        note: "Executed but missing details",
        reference: "TR-OPT-1",
        feesEur: 0.4,
        slippageBps: 1,
        source: "manual_checklist",
        qualityScore: 85,
        orders: [
          {
            symbol: "NVDA",
            action: "BUY",
            targetValueEur: 250,
            qtyTarget: 0.5,
            referencePrice: 500,
            limitPrice: 501,
            stopLossPrice: 470,
            orderNotionalEur: 250,
            filledPrice: null,
            filledQty: null,
            brokerOrderId: "",
            executedAt: null,
            reason: "plan deploy",
          },
        ],
      },
    });
    expect(out.ok).toBe(true);
    expect(out.reason).toBe("");
  });

  it("blocks close day only when pending exists for today", () => {
    const today = "2026-02-28T10:00:00.000Z";
    const sameDaySnapshot: ManualExecutionStateSnapshot = {
      version: 1,
      status: "pending",
      pending: {
        id: "p1",
        mode: "investing",
        leakKey: "concentration_high",
        rows: 2,
        createdAt: "2026-02-28T09:30:00.000Z",
        context: "execute",
        orders: [],
        reminderStage: "none",
        lastReminderAt: null,
        nextReminderAt: "2026-02-28T11:30:00.000Z",
      },
      lastProof: null,
      updatedAt: "2026-02-28T09:30:00.000Z",
    };
    const previousDaySnapshot: ManualExecutionStateSnapshot = {
      ...sameDaySnapshot,
      pending: {
        ...sameDaySnapshot.pending!,
        createdAt: "2026-02-27T22:00:00.000Z",
      },
    };

    expect(hasBlockingManualExecutionPendingForToday({ snapshot: sameDaySnapshot, nowIso: today })).toBe(true);
    expect(hasBlockingManualExecutionPendingForToday({ snapshot: previousDaySnapshot, nowIso: today })).toBe(false);
  });

  it("detects pending freshness by UTC day", () => {
    const nowIso = "2026-02-28T10:00:00.000Z";
    expect(
      isManualExecutionPendingForCurrentUtcDay({
        createdAt: "2026-02-28T00:00:00.000Z",
        nowIso,
      })
    ).toBe(true);
    expect(
      isManualExecutionPendingForCurrentUtcDay({
        createdAt: "2026-02-27T23:59:59.000Z",
        nowIso,
      })
    ).toBe(false);
    expect(
      isManualExecutionPendingForCurrentUtcDay({
        createdAt: "invalid-date",
        nowIso,
      })
    ).toBe(false);
  });
});
