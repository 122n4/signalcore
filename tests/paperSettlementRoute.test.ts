import { beforeEach, describe, expect, it, vi } from "vitest";

const isEngineLoopAuthorizedMock = vi.fn();
const runPaperSettlementCycleForUserMock = vi.fn();

vi.mock("@/lib/engine/loopAuth", () => ({
  isEngineLoopAuthorized: isEngineLoopAuthorizedMock,
}));

vi.mock("@/lib/signalcore/owner", () => ({
  getOwnerUserIds: () => ["owner_1", "owner_2"],
}));

vi.mock("@/lib/trading/bot/paperRunner", () => ({
  runPaperSettlementCycleForUser: runPaperSettlementCycleForUserMock,
}));

describe("paper settlement route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SYNTRAKE_BOT_PAPER_MAX_SETTLEMENTS_PER_RUN = "5";
    isEngineLoopAuthorizedMock.mockReturnValue(true);
    runPaperSettlementCycleForUserMock.mockResolvedValue({
      ok: true,
      status: "settlement_completed",
      settled: 2,
      failures: 0,
    });
  });

  it("rejects unauthorized settlement calls", async () => {
    isEngineLoopAuthorizedMock.mockReturnValue(false);
    const { GET } = await import("@/app/api/trading/bot/paper-settlement/route");

    const response = await GET(new Request("https://syntrake.test/api/trading/bot/paper-settlement"));

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ ok: false, error: "unauthorized" });
    expect(runPaperSettlementCycleForUserMock).not.toHaveBeenCalled();
  });

  it("runs the settlement worker for configured owners", async () => {
    const { GET } = await import("@/app/api/trading/bot/paper-settlement/route");

    const response = await GET(new Request("https://syntrake.test/api/trading/bot/paper-settlement"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      maxSettlements: 5,
      ownersChecked: 2,
    });
    expect(runPaperSettlementCycleForUserMock).toHaveBeenCalledTimes(2);
    expect(runPaperSettlementCycleForUserMock).toHaveBeenNthCalledWith(1, {
      userId: "owner_1",
      triggerSource: "scheduler",
      maxSettlements: 5,
    });
    expect(runPaperSettlementCycleForUserMock).toHaveBeenNthCalledWith(2, {
      userId: "owner_2",
      triggerSource: "scheduler",
      maxSettlements: 5,
    });
  });
});
