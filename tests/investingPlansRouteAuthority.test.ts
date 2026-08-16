import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const getSupabaseAdminMock = vi.hoisted(() => vi.fn());
const resolveModeAccessMock = vi.hoisted(() => vi.fn());
const state = vi.hoisted(() => ({
  tableCalls: [] as string[],
  writes: [] as Array<{ table: string; operation: "update" | "insert"; payload: unknown }>,
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: getSupabaseAdminMock,
}));

vi.mock("@/lib/signalcore/modeAccess", () => ({
  resolveModeAccess: resolveModeAccessMock,
}));

class UpdateQuery {
  constructor(private readonly table: string) {}

  eq() {
    return this;
  }

  private async execute() {
    return { data: null, error: null };
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.execute().then(onfulfilled, onrejected);
  }
}

class InsertQuery {
  constructor(private readonly row: Record<string, unknown>) {}

  select() {
    return this;
  }

  async single() {
    return { data: { id: "plan_1", ...this.row }, error: null };
  }
}

class PlansTable {
  update(payload: unknown) {
    state.writes.push({ table: "plans", operation: "update", payload });
    return new UpdateQuery("plans");
  }

  insert(payload: Record<string, unknown>) {
    state.writes.push({ table: "plans", operation: "insert", payload });
    return new InsertQuery(payload);
  }
}

function createSupabaseMock() {
  return {
    from(table: string) {
      state.tableCalls.push(table);
      if (table !== "plans") throw new Error(`unexpected table ${table}`);
      return new PlansTable();
    },
  };
}

function request(body: Record<string, unknown>) {
  return new Request("https://syntrake.test/api/plans", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("legacy plans route Investing authority guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.tableCalls.length = 0;
    state.writes.length = 0;
    authMock.mockResolvedValue({ userId: "user_r5" });
    getSupabaseAdminMock.mockReturnValue(createSupabaseMock());
  });

  it("fails closed for server-resolved Investing before any plans DML", async () => {
    resolveModeAccessMock.mockResolvedValue({
      ok: true,
      mode: "investing",
      allowedMode: "investing",
      hasProAccess: true,
      status: 200,
      error: null,
    });

    const { POST } = await import("@/app/api/plans/route");
    const response = await POST(request({ mode: "trading", goal: "legacy spoof", activate: true }));
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload).toEqual({
      ok: false,
      error: "investing_plan_authoring_not_accepted",
      mode: "investing",
    });
    expect(authMock).toHaveBeenCalledTimes(1);
    expect(resolveModeAccessMock).toHaveBeenCalledWith({
      supabase: expect.anything(),
      userId: "user_r5",
      requestedMode: "trading",
    });
    expect(state.tableCalls).toEqual([]);
    expect(state.writes).toEqual([]);
  });

  it("does not block the legacy Trading POST behavior", async () => {
    resolveModeAccessMock.mockResolvedValue({
      ok: true,
      mode: "trading",
      allowedMode: "trading",
      hasProAccess: true,
      status: 200,
      error: null,
    });

    const { POST } = await import("@/app/api/plans/route");
    const response = await POST(request({ mode: "trading", goal: "Trade only with controls", activate: true }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      mode: "trading",
      plan: {
        mode: "trading",
        goal: "Trade only with controls",
        status: "active",
        is_active: true,
      },
    });
    expect(state.writes.map((write) => write.operation)).toEqual(["update", "update", "insert"]);
    expect(state.writes).toContainEqual(
      expect.objectContaining({
        table: "plans",
        operation: "insert",
        payload: expect.objectContaining({ mode: "trading" }),
      }),
    );
  });
});
