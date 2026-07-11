import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  supabaseAdmin: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: mocks.supabaseAdmin,
}));

import { upsertDefaultPlanIfMissing } from "@/lib/signalcore/supabaseRepo";

describe("investing default plan hardening", () => {
  beforeEach(() => {
    mocks.supabaseAdmin.mockReset();
  });

  it("does not create a default plan when settings already contain plan intent", async () => {
    const result = await upsertDefaultPlanIfMissing("user_existing", "Investing", {
      user_id: "user_existing",
      goal_type: "investing",
      risk_profile: "balanced",
    } as any);

    expect(result).toEqual({ ok: true, created: false });
    expect(mocks.supabaseAdmin).not.toHaveBeenCalled();
  });

  it("marks auto-created default plans with an explicit source", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn(() => ({ upsert }));
    mocks.supabaseAdmin.mockReturnValue({ from });

    const result = await upsertDefaultPlanIfMissing("user_new", "Investing", null);

    expect(result).toEqual({ ok: true, created: true });
    expect(from).toHaveBeenCalledWith("user_settings");
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user_new",
        plan_active: true,
        plan_v1: expect.objectContaining({
          source: "auto-default",
        }),
      }),
      { onConflict: "user_id" },
    );
  });
});
