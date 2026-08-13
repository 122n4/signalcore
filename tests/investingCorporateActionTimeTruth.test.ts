import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rpc: vi.fn(),
}));

vi.mock("@/lib/investing/repository/admin", () => ({
  getInvestingSupabaseAdmin: () => ({
    rpc: state.rpc,
  }),
}));

vi.mock("@/lib/investing/server/config", () => ({
  readInvestingPaperConfig: vi.fn(() => ({ enabled: true, environment: "paper" })),
}));

const {
  applyPersistentPaperSplit,
  validateInvestingCorporateActionEffectiveAt,
} = await import("@/lib/investing/server/cashAndCorporateActions");

const command = {
  userId: "worker_user",
  accountId: "11111111-1111-4111-8111-111111111111",
  symbol: "vwce",
  ratio: "2",
  action: "split" as const,
  clientRequestId: "split-request-1",
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-13T20:00:00.000Z"));
  state.rpc.mockReset();
  state.rpc.mockResolvedValue({ data: { ok: true }, error: null });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Investing corporate-action effective-time truth", () => {
  it("canonicalizes equivalent explicit timestamp representations to the same instant", () => {
    expect(validateInvestingCorporateActionEffectiveAt("2026-08-13T20:00:00Z")).toEqual({
      ok: true,
      effectiveAt: "2026-08-13T20:00:00.000Z",
    });
    expect(validateInvestingCorporateActionEffectiveAt("2026-08-13T22:00:00+02:00")).toEqual({
      ok: true,
      effectiveAt: "2026-08-13T20:00:00.000Z",
    });
  });

  it("sends only the validated explicit effective instant to the split RPC", async () => {
    await applyPersistentPaperSplit({
      ...command,
      effectiveAt: "2026-08-13T22:00:00+02:00",
    });

    expect(state.rpc).toHaveBeenCalledWith("investing_apply_split_v2", expect.objectContaining({
      p_actor_user_id: "worker_user",
      p_account_id: "11111111-1111-4111-8111-111111111111",
      p_symbol: "VWCE",
      p_ratio: "2.000000000000",
      p_action_type: "split",
      p_idempotency_key: "split-request-1",
      p_effective_at: "2026-08-13T20:00:00.000Z",
    }));
  });

  it("does not use the current server timestamp as a fallback when effectiveAt is missing", async () => {
    await expect(applyPersistentPaperSplit({
      ...command,
      effectiveAt: null,
    } as any)).rejects.toThrow("investing_corporate_action_effective_at_required");

    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("rejects invalid or timezone-less effectiveAt values before the RPC", async () => {
    for (const effectiveAt of ["", "   ", "not-a-date", "2026-08-13T20:00:00"]) {
      await expect(applyPersistentPaperSplit({
        ...command,
        effectiveAt,
      })).rejects.toThrow(/investing_corporate_action_effective_at_/u);
    }

    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("allows only the documented five-minute future skew", async () => {
    await applyPersistentPaperSplit({
      ...command,
      effectiveAt: "2026-08-13T20:05:00.000Z",
    });

    await expect(applyPersistentPaperSplit({
      ...command,
      clientRequestId: "split-request-future",
      effectiveAt: "2026-08-13T20:05:01.000Z",
    })).rejects.toThrow("investing_corporate_action_effective_at_future");

    expect(state.rpc).toHaveBeenCalledTimes(1);
  });
});
