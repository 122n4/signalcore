import { beforeEach, describe, expect, it, vi } from "vitest";

const authState = { userId: "user_investing" as string | null };
const closeCalls: Array<Record<string, unknown>> = [];
const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];

vi.mock("@/lib/auth/requestUser", () => ({
  getRequestUserId: vi.fn(async () => authState.userId),
}));

vi.mock("@/lib/investing/server/dailyCycle", () => ({
  closeInvestingDailyCycle: vi.fn(async (command: Record<string, unknown>) => {
    closeCalls.push(command);
    return {
      dayKey: "2026-07-19",
      totalEur: 1000,
      cashEur: 100,
      executionDecision: "hold",
      approvalStatus: "not_required",
    };
  }),
}));

vi.mock("@/lib/investing/repository/admin", () => ({
  getInvestingSupabaseAdmin: vi.fn(() => ({
    async rpc(name: string, args: Record<string, unknown>) {
      rpcCalls.push({ name, args });
      return { data: { ok: false }, error: null };
    },
  })),
}));

const { POST } = await import("@/app/api/investing/daily-cycle/route");

beforeEach(() => {
  authState.userId = "user_investing";
  closeCalls.length = 0;
  rpcCalls.length = 0;
});

describe("Investing daily cycle command boundary", () => {
  it("accepts only the minimal command and ignores adulterated financial fields", async () => {
    const response = await POST(
      new Request("http://localhost/api/investing/daily-cycle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "close_daily_loop",
          portfolioId: "primary",
          clientRequestId: "close-2026-07-19",
          environment: "paper",
          totalEur: 999_999_999,
          cashEur: 999_999_999,
          holdings: [{ symbol: "FAKE", valueEur: 999_999_999 }],
          investingEngine: { governancePolicy: { killSwitchActive: false } },
        }),
      }),
    );
    expect(response.status).toBe(200);
    expect(closeCalls).toEqual([
      {
        userId: "user_investing",
        portfolioId: "primary",
        clientRequestId: "close-2026-07-19",
        note: null,
        environment: "paper",
      },
    ]);
    expect((await response.json()).totalEur).toBe(1000);
  });

  it("hard-blocks Live and records a dedicated attempt", async () => {
    const response = await POST(
      new Request("http://localhost/api/investing/daily-cycle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "close_daily_loop",
          portfolioId: "primary",
          clientRequestId: "live-attempt",
          environment: "live",
        }),
      }),
    );
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("investing_live_execution_blocked");
    expect(closeCalls).toHaveLength(0);
    expect(rpcCalls[0]?.name).toBe("investing_record_live_blocked_attempt_v2");
  });

  it("requires authentication", async () => {
    authState.userId = null;
    const response = await POST(new Request("http://localhost/api/investing/daily-cycle", { method: "POST", body: "{}" }));
    expect(response.status).toBe(401);
  });
});
