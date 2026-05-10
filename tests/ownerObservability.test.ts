import { describe, expect, it } from "vitest";

import {
  buildOwnerOpsOverview,
  computeGlobalEngineReliability,
  computeOwnerConversionObservability,
} from "@/lib/signalcore/ownerObservability";
import { computeOwnerLoopKpis } from "@/lib/signalcore/ownerLoopKpis";

describe("ownerObservability", () => {
  it("computes global conversion observability deterministically", () => {
    const out = computeOwnerConversionObservability([
      { user_id: "anon:v1", created_at: "2026-03-01T10:00:00.000Z", details: { event: "paywall_open", source: "landing" } },
      { user_id: "u1", created_at: "2026-03-01T10:05:00.000Z", details: { event: "paywall_open", source: "pricing" } },
      { user_id: "u1", created_at: "2026-03-01T10:06:00.000Z", details: { event: "trial_started", source: "pricing" } },
      { user_id: "u1", created_at: "2026-03-02T10:06:00.000Z", details: { event: "paid_activated", source: "stripe" } },
      { user_id: "u2", created_at: "2026-03-03T10:06:00.000Z", details: { event: "paywall_open", source: "app" } },
      { user_id: "u2", created_at: "2026-03-03T10:07:00.000Z", details: { event: "checkout_start", source: "app" } },
      { user_id: "u2", created_at: "2026-03-03T10:08:00.000Z", details: { event: "checkout_session_created", source: "app" } },
    ]);

    expect(out.counts.paywallOpen).toBe(3);
    expect(out.uniqueUsers).toBe(2);
    expect(out.anonymousVisitors).toBe(1);
    expect(out.attributedUsers.paidFromTrialUsers).toBe(1);
    expect(out.rates.trialStartRate).toBe(0);
    expect(out.topSources[0]).toMatchObject({ source: "app", count: 3 });
  });

  it("computes global engine reliability with execution and error summaries", () => {
    const out = computeGlobalEngineReliability([
      {
        user_id: "u1",
        created_at: "2026-03-02T10:00:00.000Z",
        title: "Order sent",
        details: { event: "order_sent", status: "ok", execution_id: "e1", duration_ms: 110 },
      },
      {
        user_id: "u1",
        created_at: "2026-03-02T10:00:02.000Z",
        title: "Order filled",
        details: { event: "order_filled", status: "ok", execution_id: "e1", duration_ms: 210 },
      },
      {
        user_id: "u2",
        created_at: "2026-03-02T10:05:00.000Z",
        title: "Order failed",
        details: { event: "order_failed", status: "error", execution_id: "e2", error: "broker_down", duration_ms: 420 },
      },
    ]);

    expect(out.uniqueUsers).toBe(2);
    expect(out.counts.total).toBe(3);
    expect(out.counts.error).toBe(1);
    expect(out.executions.withError).toBe(1);
    expect(out.rates.orderSuccessRate).toBe(50);
    expect(out.recentErrors[0]).toMatchObject({ event: "order_failed", userId: "u2" });
  });

  it("builds owner ops overview with actionable alerts", () => {
    const loopKpis = computeOwnerLoopKpis({
      days: 30,
      nowMs: new Date("2026-03-10T12:00:00.000Z").getTime(),
      conversionEvents: [
        { user_id: "u1", created_at: "2026-03-01T10:00:00.000Z", details: { event: "paywall_open" } },
        { user_id: "u1", created_at: "2026-03-01T10:01:00.000Z", details: { event: "trial_started" } },
      ],
      dailySnapshots: [{ user_id: "u1", day_key: "2026-03-01", created_at: "2026-03-01T18:00:00.000Z" }],
    });

    const overview = buildOwnerOpsOverview({
      conversionRows: [
        { user_id: "u1", created_at: "2026-03-01T10:00:00.000Z", details: { event: "paywall_open" } },
        { user_id: "u1", created_at: "2026-03-01T10:01:00.000Z", details: { event: "trial_started" } },
        { user_id: "u1", created_at: "2026-03-01T10:02:00.000Z", details: { event: "paid_activated" } },
      ],
      engineRows: [
        {
          user_id: "u1",
          created_at: "2026-03-01T11:00:00.000Z",
          title: "Order failed",
          details: { event: "order_failed", status: "error", execution_id: "e1", error: "timeout" },
        },
      ],
      loopKpis,
      tradingLiveOk: false,
      scannerFreshOpenMarketCount: 0,
      scannerOpenMarketCount: 8,
      providerErrorCounts: { provider_fetch_failed: 4 },
    });

    expect(overview.status).toBe("error");
    expect(overview.alerts.map((alert) => alert.id)).toEqual(
      expect.arrayContaining(["trading-live-degraded", "provider-errors"]),
    );
  });
});
