import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = { userId: "pref_user" as string | null };
const dbState = {
  calls: [] as Array<Record<string, unknown>>,
};

function createQuery(table: string) {
  const state: Record<string, unknown> = { table };
  const query: any = {
    upsert(payload: Record<string, unknown>, options: unknown) {
      state.operation = "upsert";
      state.payload = payload;
      state.options = options;
      return query;
    },
    select(columns: string) {
      state.select = columns;
      return query;
    },
    async maybeSingle() {
      dbState.calls.push({ ...state, single: true });
      return {
        data: {
          user_id: "pref_user",
          investing_ui_state: (state.payload as any)?.investing_ui_state,
        },
        error: null,
      };
    },
  };
  return query;
}

vi.mock("@/lib/auth/requestUser", () => ({
  getRequestUserId: vi.fn(async () => auth.userId),
}));

vi.mock("@/lib/investing/server/authz", () => ({
  requireInvestingRequestContext: vi.fn(async () => {
    if (!auth.userId) throw { status: 401, code: "unauthorized", publicError: "unauthorized" };
    return { userId: auth.userId, tenantId: "tenant_test", membershipId: "membership_test", role: "owner", permissions: [] };
  }),
  investingAuthzResponse: vi.fn((error: any) =>
    error?.status ? Response.json({ ok: false, error: error.publicError ?? error.code, code: error.code }, { status: error.status }) : null,
  ),
}));

vi.mock("@/lib/investing/repository/admin", () => ({
  getInvestingSupabaseAdmin: () => ({
    from: (table: string) => createQuery(table),
  }),
}));

const { POST } = await import("@/app/api/investing/preferences/route");

beforeEach(() => {
  auth.userId = "pref_user";
  dbState.calls.length = 0;
});

describe("Investing preferences route", () => {
  it("persists the mission brief preference in user_settings", async () => {
    const response = await POST(new Request("http://localhost/api/investing/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update_mission_brief",
        missionBriefHidden: true,
        missionBriefMode: "pro",
      }),
    }));

    expect(response.status).toBe(200);
    const call = dbState.calls.find((entry) => entry.table === "user_settings" && entry.operation === "upsert");
    expect(call?.options).toEqual({ onConflict: "user_id" });
    expect(call?.payload).toMatchObject({
      user_id: "pref_user",
      active_mode: "investing",
      investing_ui_state: {
        contractVersion: "investing-ui-state/v1",
        missionBriefHidden: true,
        missionBriefMode: "pro",
      },
    });
  });

  it("rejects invalid mission brief mode before persistence", async () => {
    const response = await POST(new Request("http://localhost/api/investing/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update_mission_brief",
        missionBriefHidden: false,
        missionBriefMode: "advanced",
      }),
    }));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("invalid_mission_brief_mode");
    expect(dbState.calls).toHaveLength(0);
  });
});
