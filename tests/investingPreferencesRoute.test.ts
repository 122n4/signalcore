import { beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  userId: "user_a" as string | null,
}));

type Row = Record<string, unknown>;
const db = vi.hoisted(() => ({
  rows: [] as Row[],
  calls: [] as Array<{ op: string; row?: Row; filters?: Array<[string, unknown]> }>,
  fail: false,
}));

class QueryBuilder {
  private filters: Array<[string, unknown]> = [];
  private selected = "";
  private rowLimit: number | null = null;
  private pendingUpsert: Row | null = null;

  constructor(private readonly table: string) {}

  select(columns: string) {
    this.selected = columns;
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push([column, value]);
    return this;
  }

  limit(value: number) {
    this.rowLimit = value;
    return this;
  }

  upsert(row: Row) {
    this.pendingUpsert = row;
    return this;
  }

  private execute() {
    if (db.fail) return { data: null, error: { code: "db_unavailable" } };
    if (this.pendingUpsert) {
      db.calls.push({ op: "upsert", row: this.pendingUpsert });
      const existing = db.rows.find((row) => row.user_id === this.pendingUpsert?.user_id);
      if (existing) Object.assign(existing, this.pendingUpsert);
      else db.rows.push({ ...this.pendingUpsert });
    } else {
      db.calls.push({ op: `select:${this.selected}`, filters: [...this.filters] });
    }
    let result = db.rows.filter((row) => this.filters.every(([column, value]) => row[column] === value));
    if (this.pendingUpsert) result = db.rows.filter((row) => row.user_id === this.pendingUpsert?.user_id);
    if (this.rowLimit != null) result = result.slice(0, this.rowLimit);
    return { data: result, error: null };
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: { data: Row[] | null; error: { code: string } | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }
}

vi.mock("@/lib/auth/requestUser", () => ({
  getRequestUserId: vi.fn(async () => authState.userId),
}));

vi.mock("@/lib/investing/repository/admin", () => ({
  getInvestingSupabaseAdmin: vi.fn(() => ({
    from(table: string) {
      return new QueryBuilder(table);
    },
    rpc() {
      throw new Error("rpc_must_not_be_called");
    },
  })),
}));

const route = await import("@/app/api/investing/preferences/route");

beforeEach(() => {
  authState.userId = "user_a";
  db.rows.length = 0;
  db.calls.length = 0;
  db.fail = false;
});

describe("/api/investing/preferences", () => {
  it("requires authentication", async () => {
    authState.userId = null;

    const response = await route.GET(new Request("http://localhost/api/investing/preferences"));

    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("GET returns own preferences and ignores client-supplied user IDs", async () => {
    db.rows.push(
      { user_id: "user_a", investing_ui_state: { schemaVersion: 1, defaultScreen: "portfolio" }, updated_at: "2026-08-02T00:00:00.000Z" },
      { user_id: "user_b", investing_ui_state: { schemaVersion: 1, defaultScreen: "plan" }, updated_at: "2026-08-02T00:00:00.000Z" },
    );

    const response = await route.GET(new Request("http://localhost/api/investing/preferences?userId=user_b"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.preferences).toEqual({ schemaVersion: 1, defaultScreen: "portfolio" });
    expect(db.calls[0]?.filters).toEqual([["user_id", "user_a"]]);
  });

  it("GET missing row returns default and performs zero writes", async () => {
    const response = await route.GET(new Request("http://localhost/api/investing/preferences"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.preferences).toEqual({ schemaVersion: 1, defaultScreen: null });
    expect(db.calls.map((call) => call.op)).toEqual(["select:user_id,investing_ui_state,updated_at"]);
  });

  it("PUT accepts valid preferences and uses only server identity", async () => {
    const response = await route.PUT(new Request("http://localhost/api/investing/preferences", {
      method: "PUT",
      body: JSON.stringify({ schemaVersion: 1, defaultScreen: "plan", userId: undefined }),
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.preferences).toEqual({ schemaVersion: 1, defaultScreen: "plan" });
    expect(db.calls[0]).toMatchObject({
      op: "upsert",
      row: {
        user_id: "user_a",
        investing_ui_state: { schemaVersion: 1, defaultScreen: "plan" },
      },
    });
  });

  it("PUT rejects malformed and financial/security state", async () => {
    for (const body of [
      { schemaVersion: 1, defaultScreen: "broker" },
      { schemaVersion: 1, defaultScreen: "overview", portfolioId: "primary" },
      { schemaVersion: 1, defaultScreen: "overview", goalAmount: 50000 },
      { schemaVersion: 1, defaultScreen: "overview", disableProvenance: true },
    ]) {
      const response = await route.PUT(new Request("http://localhost/api/investing/preferences", {
        method: "PUT",
        body: JSON.stringify(body),
      }));
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ ok: false, error: "investing_preferences_invalid" });
    }
  });

  it("returns 503 when the database is unavailable", async () => {
    db.fail = true;

    const response = await route.GET(new Request("http://localhost/api/investing/preferences"));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, error: "investing_preferences_unavailable" });
  });

  it("does not implement unsupported preference methods", () => {
    expect((route as Record<string, unknown>).POST).toBeUndefined();
    expect((route as Record<string, unknown>).PATCH).toBeUndefined();
    expect((route as Record<string, unknown>).DELETE).toBeUndefined();
  });
});
