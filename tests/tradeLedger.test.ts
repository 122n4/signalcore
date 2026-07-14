import { describe, expect, it } from "vitest";

import {
  buildTradeLedgerTimeline,
  computeTradeLedgerSummary,
  deriveTradeLedgerRow,
  resolveTradeLedgerWindow,
} from "@/lib/ops/tradeLedger";

describe("trade ledger helpers", () => {
  it("derives ledger metadata from canonical paper trade payloads", () => {
    const row = deriveTradeLedgerRow({
      id: "paper-1",
      user_id: "owner_1",
      instrument: "BTCUSD",
      side: "buy",
      broker: "syntrake_paper_broker",
      execution_status: "accepted",
      status: "open",
      idempotency_key: "owner_1:sig-1",
      signal_id: "sig-1",
      trigger_source: "cron",
      reason_code: "execution_accepted",
      reason_detail: null,
      entry_price: 70000,
      stop_price: 69800,
      target_price: 70400,
      risk_pct: 0.25,
      risk_amount: 25,
      result_r: null,
      exit_price: null,
      opened_at: "2026-07-13T22:51:39.000Z",
      settled_at: null,
      last_settlement_at: "2026-07-13T22:51:59.000Z",
      settlement_error: "twelvedata:cooldown_active",
      source_journal_entry_id: "journal-1",
      created_at: "2026-07-13T22:51:39.000Z",
      signal_loaded_at: "2026-07-13T22:50:00.000Z",
      policy_evaluated_at: "2026-07-13T22:50:10.000Z",
      lock_acquired_at: "2026-07-13T22:51:10.000Z",
      lock_released_at: "2026-07-13T22:51:50.000Z",
      persist_started_at: "2026-07-13T22:51:20.000Z",
      persist_completed_at: "2026-07-13T22:51:39.000Z",
      settlement_started_at: "2026-07-13T22:51:50.000Z",
      settlement_completed_at: "2026-07-13T22:51:59.000Z",
      raw_details: {
        paperResearchContext: {
          setupType: "liquidity_sweep_reversal",
          timeframe: "15m",
        },
        scannerSnapshot: {
          source: "provider",
        },
        scannerContext: {
          liveBaseline: {
            baseline_id: "baseline-1",
            strategy_id: "strategy-1",
          },
        },
      },
    } as any);

    expect(row.displayStatus).toBe("accepted");
    expect(row.setupType).toBe("liquidity_sweep_reversal");
    expect(row.timeframe).toBe("15m");
    expect(row.marketSource).toBe("provider");
    expect(row.strategyId).toBe("strategy-1");
    expect(row.baselineId).toBe("baseline-1");
    expect(row.acceptedLatencyMs).toBeGreaterThan(0);
  });

  it("computes summary metrics from filtered rows", () => {
    const rows = [
      { side: "buy", displayStatus: "accepted", outcomeStatus: "won", pnlAmount: 50, resultR: 2, settledAt: "2026-07-13T22:00:00.000Z", holdingMs: 3600000, settlementLatencyMs: 60000, acceptedLatencyMs: 30000, executionLatencyMs: 20000, marketSource: "provider" },
      { side: "sell", displayStatus: "unavailable_retryable", outcomeStatus: "open", pnlAmount: null, resultR: null, settledAt: null, holdingMs: null, settlementLatencyMs: 120000, acceptedLatencyMs: 40000, executionLatencyMs: 10000, marketSource: "cache" },
      { side: "sell", displayStatus: "rejected", outcomeStatus: "rejected", pnlAmount: null, resultR: null, settledAt: null, holdingMs: null, settlementLatencyMs: null, acceptedLatencyMs: null, executionLatencyMs: null, marketSource: "provider" },
      { side: "buy", displayStatus: "lost", outcomeStatus: "lost", pnlAmount: -25, resultR: -1, settledAt: "2026-07-13T23:00:00.000Z", holdingMs: 7200000, settlementLatencyMs: 180000, acceptedLatencyMs: 50000, executionLatencyMs: 30000, marketSource: "provider" },
    ] as any;

    const summary = computeTradeLedgerSummary(rows);

    expect(summary.total).toBe(4);
    expect(summary.buy).toBe(2);
    expect(summary.sell).toBe(2);
    expect(summary.wins).toBe(1);
    expect(summary.losses).toBe(1);
    expect(summary.retryable).toBe(1);
    expect(summary.rejected).toBe(1);
    expect(summary.winRate).toBe(50);
    expect(summary.pnlTotal).toBe(25);
    expect(summary.providerCount).toBe(2);
  });

  it("counts accepted trades by execution status even after they close", () => {
    const summary = computeTradeLedgerSummary([
      { executionStatus: "accepted", displayStatus: "won", outcomeStatus: "won", side: "buy", pnlAmount: 20, resultR: 1, settledAt: "2026-07-13T23:00:00.000Z", holdingMs: 1000, settlementLatencyMs: 1000, acceptedLatencyMs: 1000, executionLatencyMs: 1000, marketSource: "provider" },
      { executionStatus: "paper_queued", displayStatus: "lost", outcomeStatus: "lost", side: "sell", pnlAmount: -20, resultR: -1, settledAt: "2026-07-13T23:10:00.000Z", holdingMs: 1000, settlementLatencyMs: 1000, acceptedLatencyMs: 1000, executionLatencyMs: 1000, marketSource: "provider" },
      { executionStatus: "rejected", displayStatus: "rejected", outcomeStatus: "rejected", side: "sell", pnlAmount: null, resultR: null, settledAt: null, holdingMs: null, settlementLatencyMs: null, acceptedLatencyMs: null, executionLatencyMs: null, marketSource: "provider" },
    ] as any);

    expect(summary.accepted).toBe(2);
  });

  it("builds a chronological timeline from trade, journal and run evidence", () => {
    const timeline = buildTradeLedgerTimeline(
      {
        id: "paper-1",
        decisionAt: "2026-07-13T22:50:10.000Z",
        acceptedAt: "2026-07-13T22:51:39.000Z",
        executionAt: "2026-07-13T22:51:39.000Z",
        lastSettlementAt: "2026-07-13T22:51:59.000Z",
        settledAt: null,
        executionStatus: "accepted",
        outcomeStatus: "open",
        displayStatus: "accepted",
        triggerSource: "cron",
        reasonCode: "execution_accepted",
      } as any,
      [
        {
          id: "run-1",
          run_kind: "execution",
          lifecycle_status: "accepted",
          reason_code: "execution_accepted",
          trigger_source: "cron",
          request_started_at: "2026-07-13T22:51:10.000Z",
          persist_completed_at: "2026-07-13T22:51:39.000Z",
          settlement_completed_at: null,
          raw_details: {},
          created_at: "2026-07-13T22:51:39.000Z",
        },
      ] as any,
      {
        created_at: "2026-07-13T22:51:39.000Z",
        type: "trading_bot_paper_cycle",
      } as any,
    );

    expect(timeline[0]?.state).toBe("decision_ready");
    expect(timeline.some((item) => item.component === "journal")).toBe(true);
    expect(timeline.some((item) => item.component === "execution")).toBe(true);
  });

  it("resolves period presets to concrete UTC windows", () => {
    const now = new Date("2026-07-13T22:00:00.000Z");
    const last7 = resolveTradeLedgerWindow("last_7d", null, null, now);
    expect(last7.from).toBe("2026-07-07T00:00:00.000Z");
    expect(last7.to).toBe("2026-07-14T00:00:00.000Z");
  });

  it("derives fallback decision and accepted dates from canonical timestamps", () => {
    const row = deriveTradeLedgerRow({
      id: "paper-fallback",
      user_id: "owner_1",
      instrument: "ETHUSD",
      side: "buy",
      broker: "syntrake_paper_broker",
      execution_status: "accepted",
      status: "open",
      idempotency_key: null,
      signal_id: null,
      trigger_source: "manual",
      reason_code: null,
      reason_detail: null,
      entry_price: 100,
      stop_price: 90,
      target_price: 120,
      risk_pct: 0.25,
      risk_amount: 25,
      result_r: null,
      exit_price: null,
      opened_at: null,
      settled_at: null,
      last_settlement_at: null,
      settlement_error: null,
      source_journal_entry_id: "journal-fallback",
      created_at: "2026-07-01T10:00:00.000Z",
      signal_loaded_at: null,
      policy_evaluated_at: null,
      lock_acquired_at: null,
      lock_released_at: null,
      persist_started_at: null,
      persist_completed_at: null,
      settlement_started_at: null,
      settlement_completed_at: null,
      raw_details: {},
    } as any);

    expect(row.decisionAt).toBe("2026-07-01T10:00:00.000Z");
    expect(row.acceptedAt).toBe("2026-07-01T10:00:00.000Z");
  });
});
