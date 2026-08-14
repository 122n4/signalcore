import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const split = vi.fn(async () => ({ ok: true }));
const processOrder = vi.fn(async () => ({ ok: true }));
const recover = vi.fn(async () => ({ ok: true }));

vi.mock("@/lib/investing/server/config", () => ({
  readInvestingPaperConfig: vi.fn(() => ({ workerSecret: "test-worker-secret", environment: "paper" })),
}));
vi.mock("@/lib/investing/server/cashAndCorporateActions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/investing/server/cashAndCorporateActions")>();
  return {
    ...actual,
    applyPersistentPaperSplit: split,
  };
});
vi.mock("@/lib/investing/server/persistentPaper", () => ({
  getPersistentPaperHealth: vi.fn(async () => ({ ok: true })),
  processPersistentPaperOrder: processOrder,
  recoverPersistentPaperWork: recover,
}));

const { POST } = await import("@/app/api/investing/paper/worker/route");

const validSplitCommand = {
  action: "split",
  userId: "worker_user",
  accountId: "11111111-1111-4111-8111-111111111111",
  symbol: "vwce",
  ratio: "2",
  clientRequestId: "split-request-1",
  effectiveAt: "2026-08-13T20:00:00Z",
};

function workerRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/investing/paper/worker", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-investing-worker-secret": "test-worker-secret",
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-13T20:00:00.000Z"));
  split.mockClear();
  processOrder.mockClear();
  recover.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Investing worker financial-truth gates", () => {
  it("rejects a Live command before any worker action", async () => {
    const response = await POST(workerRequest({ action: "recover", environment: "live" }));
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("investing_live_execution_blocked");
    expect(split).not.toHaveBeenCalled();
    expect(processOrder).not.toHaveBeenCalled();
    expect(recover).not.toHaveBeenCalled();
  });

  it("passes a valid explicit split effectiveAt to the helper as the exact canonical instant", async () => {
    const response = await POST(workerRequest({
      ...validSplitCommand,
      effectiveAt: "2026-08-13T22:00:00+02:00",
    }));

    expect(response.status).toBe(200);
    expect(split).toHaveBeenCalledWith(expect.objectContaining({
      action: "split",
      effectiveAt: "2026-08-13T20:00:00.000Z",
    }));
  });

  it.each([
    ["missing", undefined, "investing_corporate_action_effective_at_required"],
    ["null", null, "investing_corporate_action_effective_at_required"],
    ["empty", "", "investing_corporate_action_effective_at_required"],
    ["whitespace", "   ", "investing_corporate_action_effective_at_required"],
    ["malformed", "not-a-date", "investing_corporate_action_effective_at_invalid"],
    ["timezone-less", "2026-08-13T20:00:00", "investing_corporate_action_effective_at_invalid"],
  ])("rejects %s split effectiveAt before calling the helper", async (_label, effectiveAt, error) => {
    const body = { ...validSplitCommand } as Record<string, unknown>;
    if (effectiveAt === undefined) delete body.effectiveAt;
    else body.effectiveAt = effectiveAt;

    const response = await POST(workerRequest(body));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe(error);
    expect(split).not.toHaveBeenCalled();
  });

  it("accepts a split effectiveAt inside the five-minute future skew", async () => {
    const response = await POST(workerRequest({
      ...validSplitCommand,
      effectiveAt: "2026-08-13T20:04:59.000Z",
    }));

    expect(response.status).toBe(200);
    expect(split).toHaveBeenCalledWith(expect.objectContaining({
      effectiveAt: "2026-08-13T20:04:59.000Z",
    }));
  });

  it("rejects a split effectiveAt beyond the five-minute future skew before calling the helper", async () => {
    const response = await POST(workerRequest({
      ...validSplitCommand,
      effectiveAt: "2026-08-13T20:05:01.000Z",
    }));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("investing_corporate_action_effective_at_future");
    expect(split).not.toHaveBeenCalled();
  });

  it("applies the same explicit effectiveAt contract to reverse splits", async () => {
    const response = await POST(workerRequest({
      ...validSplitCommand,
      action: "reverse_split",
      effectiveAt: "2026-08-13T20:00:00.000Z",
    }));

    expect(response.status).toBe(200);
    expect(split).toHaveBeenCalledWith(expect.objectContaining({
      action: "reverse_split",
      effectiveAt: "2026-08-13T20:00:00.000Z",
    }));
  });
});
