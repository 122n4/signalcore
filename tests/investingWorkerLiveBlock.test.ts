import { describe, expect, it, vi } from "vitest";

const split = vi.fn(async () => ({ ok: true }));
const processOrder = vi.fn(async () => ({ ok: true }));
const recover = vi.fn(async () => ({ ok: true }));

vi.mock("@/lib/investing/server/config", () => ({
  readInvestingPaperConfig: vi.fn(() => ({ workerSecret: "test-worker-secret", environment: "paper" })),
}));
vi.mock("@/lib/investing/server/cashAndCorporateActions", () => ({
  applyPersistentPaperSplit: split,
}));
vi.mock("@/lib/investing/server/persistentPaper", () => ({
  getPersistentPaperHealth: vi.fn(async () => ({ ok: true })),
  processPersistentPaperOrder: processOrder,
  recoverPersistentPaperWork: recover,
}));

const { POST } = await import("@/app/api/investing/paper/worker/route");

describe("Investing worker Live block", () => {
  it("rejects a Live command before any worker action", async () => {
    const response = await POST(new Request("http://localhost/api/investing/paper/worker", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-investing-worker-secret": "test-worker-secret",
      },
      body: JSON.stringify({ action: "recover", environment: "live" }),
    }));
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("investing_live_execution_blocked");
    expect(split).not.toHaveBeenCalled();
    expect(processOrder).not.toHaveBeenCalled();
    expect(recover).not.toHaveBeenCalled();
  });
});
