import { describe, expect, it } from "vitest";
import { computeOwnerLoopKpis } from "@/lib/signalcore/ownerLoopKpis";

describe("ownerLoopKpis", () => {
  it("computes owner loop KPIs deterministically from conversion + snapshot rows", () => {
    const nowMs = new Date("2026-03-01T12:00:00.000Z").getTime();

    const out = computeOwnerLoopKpis({
      days: 30,
      nowMs,
      conversionEvents: [
        { user_id: "u1", created_at: "2026-02-09T08:00:00.000Z", details: { event: "paywall_open" } },
        { user_id: "u1", created_at: "2026-02-09T08:05:00.000Z", details: { event: "trial_started" } },
        { user_id: "u1", created_at: "2026-02-12T10:00:00.000Z", details: { event: "paid_activated" } },

        { user_id: "u2", created_at: "2026-02-28T20:00:00.000Z", details: { event: "paywall_open" } }, // <24h window, excluded D1
        { user_id: "u2", created_at: "2026-02-28T20:05:00.000Z", details: { event: "trial_started" } },

        { user_id: "u3", created_at: "2026-02-10T10:00:00.000Z", title: "Conversion: paywall_open" },
        { user_id: "u3", created_at: "2026-02-10T10:05:00.000Z", details: { event: "trial_started" } },
      ],
      dailySnapshots: [
        // u1: activated in <24h, has D7, one full weekly block and one partial block
        { user_id: "u1", day_key: "2026-02-09", created_at: "2026-02-09T18:00:00.000Z" },
        { user_id: "u1", day_key: "2026-02-10", created_at: "2026-02-10T18:00:00.000Z" },
        { user_id: "u1", day_key: "2026-02-11", created_at: "2026-02-11T18:00:00.000Z" },
        { user_id: "u1", day_key: "2026-02-12", created_at: "2026-02-12T18:00:00.000Z" },
        { user_id: "u1", day_key: "2026-02-13", created_at: "2026-02-13T18:00:00.000Z" },
        { user_id: "u1", day_key: "2026-02-16", created_at: "2026-02-16T18:00:00.000Z" },

        // u2: first close too recent for D7 eligibility
        { user_id: "u2", day_key: "2026-02-28", created_at: "2026-02-28T20:10:00.000Z" },

        // u3: not activated in D1 and no D7
        { user_id: "u3", day_key: "2026-02-12", created_at: "2026-02-12T12:00:00.000Z" },

        // u4: no conversion events, participates in retention + weekly denominator only
        { user_id: "u4", day_key: "2026-02-09", created_at: "2026-02-09T11:00:00.000Z" },
        { user_id: "u4", day_key: "2026-02-10", created_at: "2026-02-10T11:00:00.000Z" },
      ],
    });

    expect(out.kpis.activationD1).toMatchObject({
      rate: 50,
      numerator: 1,
      denominator: 2,
    });

    expect(out.kpis.retentionD7).toMatchObject({
      rate: 33.3,
      numerator: 1,
      denominator: 3,
    });

    expect(out.kpis.trialToPaid).toMatchObject({
      rate: 33.3,
      numerator: 1,
      denominator: 3,
    });

    expect(out.kpis.weeklyLoopCompletion).toMatchObject({
      rate: 20,
      numerator: 1,
      denominator: 5,
    });

    expect(out.meta.uniqueUsers).toBe(4);
    expect(out.meta.eventRows).toBe(7);
    expect(out.meta.snapshotRows).toBe(10);
  });
});
