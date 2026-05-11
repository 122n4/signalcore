import { describe, expect, it, vi } from "vitest";

import { checkAndRecordFeatureUsage } from "@/lib/signalcore/usageLimits";

function createSupabaseMock(args?: {
  count?: number;
  latestCreatedAt?: string | null;
  errorOn?: "count" | "latest" | "insert";
}) {
  const insert = vi.fn(async () => ({
    error: args?.errorOn === "insert" ? new Error("insert_failed") : null,
  }));

  const from = vi.fn((table: string) => {
    if (table !== "feature_usage_events") throw new Error("unexpected_table");
    return {
      select: vi.fn((_columns: string, options?: { count?: string; head?: boolean }) => {
        if (options?.head) {
          const query: any = {
            eq: vi.fn(() => query),
            gte: vi.fn(async () => ({
              count: args?.count ?? 0,
              error: args?.errorOn === "count" ? new Error("count_failed") : null,
            })),
          };
          return query;
        }

        const query: any = {
          eq: vi.fn(() => query),
          order: vi.fn(() => query),
          limit: vi.fn(async () => ({
            data: args?.latestCreatedAt ? [{ created_at: args.latestCreatedAt }] : [],
            error: args?.errorOn === "latest" ? new Error("latest_failed") : null,
          })),
        };
        return query;
      }),
      insert,
    };
  });

  return { supabase: { from }, insert };
}

describe("usage limits", () => {
  it("blocks zero-limit features without touching storage", async () => {
    const { supabase } = createSupabaseMock();
    const decision = await checkAndRecordFeatureUsage({
      supabase,
      userId: "user_1",
      feature: "trading_live_refresh",
      tier: "free",
      dailyLimit: 0,
      cooldownSeconds: 60,
      now: new Date("2026-05-11T12:00:00.000Z"),
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("daily_limit_reached");
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("records allowed usage and returns remaining daily quota", async () => {
    const { supabase, insert } = createSupabaseMock({ count: 2 });
    const decision = await checkAndRecordFeatureUsage({
      supabase,
      userId: "user_1",
      feature: "trading_live_refresh",
      tier: "trial",
      dailyLimit: 5,
      cooldownSeconds: 0,
      now: new Date("2026-05-11T12:00:00.000Z"),
    });

    expect(decision.allowed).toBe(true);
    expect(decision.usedToday).toBe(3);
    expect(decision.remainingToday).toBe(2);
    expect(insert).toHaveBeenCalledOnce();
  });

  it("blocks usage during cooldown", async () => {
    const { supabase, insert } = createSupabaseMock({
      count: 1,
      latestCreatedAt: "2026-05-11T11:59:30.000Z",
    });
    const decision = await checkAndRecordFeatureUsage({
      supabase,
      userId: "user_1",
      feature: "trading_live_refresh",
      tier: "pro",
      dailyLimit: 10,
      cooldownSeconds: 60,
      now: new Date("2026-05-11T12:00:00.000Z"),
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("cooldown_active");
    expect(decision.retryAfterSeconds).toBe(30);
    expect(insert).not.toHaveBeenCalled();
  });
});

