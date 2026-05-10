import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const getSupabaseAdminMock = vi.fn();
const resolveModeAccessMock = vi.fn();
const readUserSettingsMock = vi.fn();
const planFromSettingsMock = vi.fn();

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: getSupabaseAdminMock,
}));

vi.mock("@/lib/signalcore/modeAccess", () => ({
  resolveModeAccess: resolveModeAccessMock,
}));

vi.mock("@/lib/signalcore/supabaseRepo", () => ({
  readUserSettings: readUserSettingsMock,
  planFromSettings: planFromSettingsMock,
}));

describe("plan apply route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSupabaseAdminMock.mockReturnValue({});
  });

  it("returns 401 when the user is not authenticated", async () => {
    authMock.mockResolvedValue({ userId: null });

    const { GET } = await import("@/app/api/plan/apply/route");
    const res = await GET(new Request("https://syntrake.test/api/plan/apply"));
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data).toMatchObject({ ok: false, error: "unauthorized" });
  });

  it("returns 500 when the route fails unexpectedly", async () => {
    authMock.mockResolvedValue({ userId: "user_123" });
    resolveModeAccessMock.mockRejectedValue(new Error("mode_access_failed"));

    const { GET } = await import("@/app/api/plan/apply/route");
    const res = await GET(new Request("https://syntrake.test/api/plan/apply?mode=investing"));
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data).toMatchObject({ ok: false, error: "plan_failed", message: "mode_access_failed" });
  });
});
