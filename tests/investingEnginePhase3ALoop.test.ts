import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  userSettings: [] as Array<Record<string, any>>,
  journal: [] as Array<Record<string, any>>,
  tableCalls: [] as string[],
}));

const mocks = vi.hoisted(() => ({
  getSupabaseAdmin: vi.fn(),
  loadBrokerConnection: vi.fn(),
  saveBrokerConnection: vi.fn(),
  syncBrokerToPortfolio: vi.fn(),
  reconcileWithPortfolio: vi.fn(),
  resolveActiveModeForUser: vi.fn(),
  writeEngineEvent: vi.fn(),
}));

class QueryBuilder {
  private filters: Record<string, unknown> = {};

  constructor(private readonly table: string) {}

  select() {
    return this;
  }

  eq(key: string, value: unknown) {
    this.filters[key] = value;
    return this;
  }

  order() {
    return this;
  }

  limit() {
    return this;
  }

  async maybeSingle() {
    const source = this.table === "user_settings" ? state.userSettings : state.journal;
    const row = source.find((entry) =>
      Object.entries(this.filters).every(([key, value]) => entry?.[key] === value),
    );
    return { data: row ?? null, error: null };
  }

  async insert() {
    return { error: null };
  }

  private async execute() {
    const source = this.table === "user_settings" ? state.userSettings : state.journal;
    const data = source.filter((entry) =>
      Object.entries(this.filters).every(([key, value]) => entry?.[key] === value),
    );
    return { data, error: null };
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.execute().then(onfulfilled, onrejected);
  }
}

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: mocks.getSupabaseAdmin,
}));

vi.mock("@/lib/broker/store", () => ({
  loadBrokerConnection: mocks.loadBrokerConnection,
  saveBrokerConnection: mocks.saveBrokerConnection,
}));

vi.mock("@/lib/broker/sync", () => ({
  syncBrokerToPortfolio: mocks.syncBrokerToPortfolio,
  reconcileWithPortfolio: mocks.reconcileWithPortfolio,
  resolveActiveModeForUser: mocks.resolveActiveModeForUser,
}));

vi.mock("@/lib/engine/events", () => ({
  createExecutionId: vi.fn(() => "loop_test"),
  writeEngineEvent: mocks.writeEngineEvent,
}));

import { INVESTING_SHARED_BROKER_SYNC_BLOCKED } from "@/lib/broker/investingBoundary";
import { runEngineLoop } from "@/lib/engine/loop";
import { DEFAULT_BROKER_CONNECTION } from "@/lib/broker/shared";

const dueConnection = {
  ...DEFAULT_BROKER_CONNECTION,
  userId: "user_1",
  connected: true,
  autoSync: true,
  connectionMethod: "csv" as const,
  connectionReference: "portfolio-export.csv",
  csvImported: true,
  lastSyncAt: "2026-07-19T00:00:00.000Z",
  syncEveryMinutes: 15,
};

function setUserTarget(mode: "investing" | "trading", connection = dueConnection) {
  state.userSettings.splice(0, state.userSettings.length, {
    user_id: "user_1",
    active_mode: mode,
    broker_connection: connection,
    updated_at: "2026-07-19T00:00:00.000Z",
  });
}

describe("FASE 3A engine loop boundary", () => {
  beforeEach(() => {
    state.userSettings.length = 0;
    state.journal.length = 0;
    state.tableCalls.length = 0;
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getSupabaseAdmin.mockImplementation(() => ({
      from(table: string) {
        state.tableCalls.push(table);
        return new QueryBuilder(table);
      },
    }));
    mocks.saveBrokerConnection.mockImplementation(async (_userId, connection) => connection);
    mocks.resolveActiveModeForUser.mockImplementation(async (_userId, mode) => mode);
    mocks.syncBrokerToPortfolio.mockResolvedValue({
      snapshot: {
        mode: "trading",
        asOf: "2026-07-20T10:00:00.000Z",
        positions: [{ symbol: "SPY", qty: 1, valueEur: 500 }],
        cashEur: 500,
        totalEur: 1000,
        source: "test_bridge",
      },
      changes: { inserted: 1, updated: 0, deleted: 0 },
    });
    mocks.reconcileWithPortfolio.mockResolvedValue({
      ok: true,
      score: 100,
      status: "aligned",
      mismatchCount: 0,
    });
  });

  it.each([
    ["due", false, false, "2026-07-19T00:00:00.000Z"],
    ["not due", false, false, "2026-07-20T09:59:00.000Z"],
    ["force", true, false, "2026-07-20T09:59:00.000Z"],
    ["dry run", false, true, "2026-07-19T00:00:00.000Z"],
  ])("blocks a user_settings Investing target when %s", async (_case, force, dryRun, lastSyncAt) => {
    setUserTarget("investing", { ...dueConnection, lastSyncAt });

    const result = await runEngineLoop({
      force,
      dryRun,
      now: new Date("2026-07-20T10:00:00.000Z"),
    });

    expect(result.rows).toEqual([
      expect.objectContaining({
        userId: "user_1",
        mode: "investing",
        status: "skipped",
        reason: INVESTING_SHARED_BROKER_SYNC_BLOCKED,
      }),
    ]);
    expect(result.synced).toBe(0);
    expect(result.failed).toBe(0);
    expect(mocks.syncBrokerToPortfolio).not.toHaveBeenCalled();
    expect(mocks.reconcileWithPortfolio).not.toHaveBeenCalled();
    expect(mocks.saveBrokerConnection).not.toHaveBeenCalled();
    expect(mocks.writeEngineEvent).not.toHaveBeenCalled();
    expect(state.tableCalls).not.toContain("portfolio_items");
    expect(state.tableCalls).not.toContain("portfolios");
    expect(state.tableCalls).not.toContain("daily_snapshots");
  });

  it("blocks an Investing target from the journal fallback", async () => {
    state.journal.push({
      user_id: "journal_user",
      mode: "investing",
      type: "broker_connection_state",
      details: { connection: { ...dueConnection, userId: "journal_user" } },
      created_at: "2026-07-20T09:00:00.000Z",
    });

    const result = await runEngineLoop({ force: true, now: new Date("2026-07-20T10:00:00.000Z") });

    expect(result.rows[0]).toMatchObject({
      userId: "journal_user",
      mode: "investing",
      status: "skipped",
      reason: INVESTING_SHARED_BROKER_SYNC_BLOCKED,
    });
    expect(mocks.syncBrokerToPortfolio).not.toHaveBeenCalled();
    expect(mocks.writeEngineEvent).not.toHaveBeenCalled();
  });

  it("blocks an explicit Trading spoof when the stored active mode is Investing before loading the broker", async () => {
    setUserTarget("investing");

    const result = await runEngineLoop({ userId: "user_1", mode: "trading", force: true });

    expect(result.rows[0]).toMatchObject({
      mode: "investing",
      reason: INVESTING_SHARED_BROKER_SYNC_BLOCKED,
    });
    expect(mocks.loadBrokerConnection).not.toHaveBeenCalled();
    expect(mocks.syncBrokerToPortfolio).not.toHaveBeenCalled();
    expect(mocks.writeEngineEvent).not.toHaveBeenCalled();
  });

  it("preserves a due Trading target and the shared cron execution path", async () => {
    setUserTarget("trading");

    const result = await runEngineLoop({ now: new Date("2026-07-20T10:00:00.000Z") });

    expect(result).toMatchObject({ scanned: 1, due: 1, synced: 1, failed: 0 });
    expect(mocks.syncBrokerToPortfolio).toHaveBeenCalledOnce();
    expect(mocks.syncBrokerToPortfolio).toHaveBeenCalledWith(expect.objectContaining({ mode: "trading" }));
    expect(mocks.reconcileWithPortfolio).toHaveBeenCalledOnce();
    const eventNames = mocks.writeEngineEvent.mock.calls.map(([event]) => event.event);
    expect(eventNames).toContain("order_sent");
    expect(eventNames).toContain("order_filled");

    const vercel = JSON.parse(readFileSync(join(process.cwd(), "vercel.json"), "utf8"));
    expect(vercel.crons).toContainEqual({ path: "/api/engine/loop", schedule: "15 3 * * *" });
  });
});
