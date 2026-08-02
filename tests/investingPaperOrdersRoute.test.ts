import { beforeEach, describe, expect, it, vi } from "vitest";

const submit = vi.fn();
const processOrder = vi.fn();

vi.mock("@/lib/auth/requestUser", () => ({
  getRequestUserId: vi.fn(async () => "user-paper-test"),
}));

vi.mock("@/lib/investing/repository/admin", () => ({
  getInvestingSupabaseAdmin: vi.fn(() => ({})),
}));

vi.mock("@/lib/investing/server/persistentPaper", () => ({
  submitPersistentPaperOrder: submit,
  processPersistentPaperOrder: processOrder,
}));

const { POST } = await import("@/app/api/investing/paper/orders/route");

const command = {
  queueId: "123e4567-e89b-42d3-a456-426614174000",
  expectedQueueVersion: 2,
  symbol: "AGGH",
  clientRequestId: "paper-order-route-test",
  environment: "paper",
};

describe("Investing Paper orders route", () => {
  beforeEach(() => {
    submit.mockReset();
    processOrder.mockReset();
  });

  it("finishes an acknowledged Paper order so the user sees the resulting position", async () => {
    submit.mockResolvedValue({ order_id: "123e4567-e89b-42d3-a456-426614174001", status: "submitted" });
    processOrder.mockResolvedValue({ status: "filled" });

    const response = await POST(new Request("http://localhost/api/investing/paper/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(command),
    }));

    expect(response.status).toBe(200);
    expect(processOrder).toHaveBeenCalledWith("123e4567-e89b-42d3-a456-426614174001");
    expect(await response.json()).toMatchObject({ ok: true, fill: { status: "filled" } });
  });

  it("does not process Live commands", async () => {
    const response = await POST(new Request("http://localhost/api/investing/paper/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...command, environment: "live" }),
    }));

    expect(response.status).toBe(403);
    expect(submit).not.toHaveBeenCalled();
    expect(processOrder).not.toHaveBeenCalled();
  });
});
