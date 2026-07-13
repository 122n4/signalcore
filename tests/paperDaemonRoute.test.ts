import { beforeEach, describe, expect, it, vi } from "vitest";

const isEngineLoopAuthorizedMock = vi.fn();
const runPaperBotCycleForUserMock = vi.fn();

vi.mock("@/lib/engine/loopAuth", () => ({
  isEngineLoopAuthorized: isEngineLoopAuthorizedMock,
}));

vi.mock("@/lib/signalcore/owner", () => ({
  getOwnerUserIds: () => ["owner_1", "owner_2"],
}));

vi.mock("@/lib/trading/bot/paperRunner", () => ({
  runPaperBotCycleForUser: runPaperBotCycleForUserMock,
}));

describe("paper daemon route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SYNTRAKE_BOT_PAPER_MAX_TRADES_PER_DAY = "4";
    isEngineLoopAuthorizedMock.mockReturnValue(true);
    runPaperBotCycleForUserMock.mockResolvedValue({
      ok: true,
      status: "blocked",
      reason: "no_actionable_signal",
    });
  });

  it("rejects unauthorized daemon calls", async () => {
    isEngineLoopAuthorizedMock.mockReturnValue(false);
    const { GET } = await import("@/app/api/trading/bot/paper-daemon/route");

    const response = await GET(new Request("https://syntrake.test/api/trading/bot/paper-daemon"));

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ ok: false, error: "unauthorized" });
    expect(runPaperBotCycleForUserMock).not.toHaveBeenCalled();
  });

  it("runs the canonical paper runner for configured owners", async () => {
    const { GET } = await import("@/app/api/trading/bot/paper-daemon/route");

    const response = await GET(new Request("https://syntrake.test/api/trading/bot/paper-daemon"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      maxTradesPerDay: 4,
      ownersChecked: 2,
    });
    expect(runPaperBotCycleForUserMock).toHaveBeenCalledTimes(2);
    expect(runPaperBotCycleForUserMock).toHaveBeenNthCalledWith(1, {
      userId: "owner_1",
      triggerSource: "cron",
      cronScheduledAt: expect.any(String),
      maxTradesPerDay: 4,
    });
    expect(runPaperBotCycleForUserMock).toHaveBeenNthCalledWith(2, {
      userId: "owner_2",
      triggerSource: "cron",
      cronScheduledAt: expect.any(String),
      maxTradesPerDay: 4,
    });
  });
});
