import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ activeMode: "investing" as "investing" | "trading" }));
const authState = vi.hoisted(() => ({ userId: "route_user" as string | null }));
const mocks = vi.hoisted(() => ({
  getSupabaseAdmin: vi.fn(),
  loadBrokerConnection: vi.fn(),
  saveBrokerConnection: vi.fn(),
  syncBrokerToPortfolio: vi.fn(),
  reconcileWithPortfolio: vi.fn(),
  resolveActiveModeForUser: vi.fn(),
  writeEngineEvent: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: authState.userId })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: mocks.getSupabaseAdmin,
}));

vi.mock("@/lib/broker/store", () => ({
  loadBrokerConnection: mocks.loadBrokerConnection,
  saveBrokerConnection: mocks.saveBrokerConnection,
}));

vi.mock("@/lib/broker/sync", () => ({
  resolveActiveModeForUser: mocks.resolveActiveModeForUser,
  syncBrokerToPortfolio: mocks.syncBrokerToPortfolio,
  reconcileWithPortfolio: mocks.reconcileWithPortfolio,
}));

vi.mock("@/lib/engine/events", () => ({
  createExecutionId: vi.fn(() => "route_test"),
  writeEngineEvent: mocks.writeEngineEvent,
}));

import { DEFAULT_BROKER_CONNECTION } from "@/lib/broker/shared";
import { POST as syncPost } from "@/app/api/broker/sync/route";
import { POST as reconcilePost } from "@/app/api/broker/reconcile/route";

const connection = {
  ...DEFAULT_BROKER_CONNECTION,
  userId: "route_user",
  broker: "interactive_brokers" as const,
  connected: true,
  autoSync: true,
  connectionMethod: "csv" as const,
  connectionReference: "portfolio-export.csv",
  csvImported: true,
  snapshot: {
    mode: "trading" as const,
    asOf: "2026-07-20T10:00:00.000Z",
    positions: [],
    cashEur: 1000,
    totalEur: 1000,
    source: "route_fixture",
  },
};

function modeSupabase() {
  return {
    from: vi.fn((table: string) => {
      if (table !== "user_settings") throw new Error(`unexpected_table:${table}`);
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: { active_mode: state.activeMode }, error: null })),
          })),
        })),
      };
    }),
  };
}

function postRequest(path: string, body: Record<string, unknown> = {}) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("FASE 3A broker routes", () => {
  beforeEach(() => {
    state.activeMode = "investing";
    authState.userId = "route_user";
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getSupabaseAdmin.mockImplementation(modeSupabase);
    mocks.loadBrokerConnection.mockResolvedValue(connection);
    mocks.resolveActiveModeForUser.mockImplementation(async (_userId, mode) => mode);
    mocks.saveBrokerConnection.mockImplementation(async (_userId, value) => value);
    mocks.syncBrokerToPortfolio.mockResolvedValue({
      snapshot: connection.snapshot,
      changes: { inserted: 0, updated: 0, deleted: 0 },
    });
    mocks.reconcileWithPortfolio.mockResolvedValue({
      ok: true,
      status: "aligned",
      score: 100,
      mismatchCount: 0,
      checkedAt: "2026-07-20T10:00:00.000Z",
    });
  });

  it.each([
    ["omitted mode", {}, false],
    ["explicit Investing", { mode: "investing" }, false],
    ["spoofed Trading", { mode: "trading" }, true],
    ["invalid mode", { mode: "invalid" }, false],
  ])("blocks broker sync with %s when active_mode is Investing", async (_name, body, spoofed) => {
    const response = await syncPost(postRequest("/api/broker/sync", body));
    const payload = await response.json();

    expect(response.status).toBe(410);
    expect(payload).toMatchObject({
      ok: false,
      error: "investing_shared_broker_sync_blocked",
      mode: "investing",
      spoofed,
    });
    expect(mocks.loadBrokerConnection).not.toHaveBeenCalled();
    expect(mocks.syncBrokerToPortfolio).not.toHaveBeenCalled();
    expect(mocks.reconcileWithPortfolio).not.toHaveBeenCalled();
    expect(mocks.saveBrokerConnection).not.toHaveBeenCalled();
    expect(mocks.writeEngineEvent).not.toHaveBeenCalled();
  });

  it("blocks an explicit Investing request when active_mode is Trading", async () => {
    state.activeMode = "trading";
    const response = await syncPost(postRequest("/api/broker/sync", { mode: "investing" }));
    const payload = await response.json();

    expect(response.status).toBe(410);
    expect(payload).toMatchObject({ error: "investing_shared_broker_sync_blocked", spoofed: true });
    expect(mocks.loadBrokerConnection).not.toHaveBeenCalled();
    expect(mocks.writeEngineEvent).not.toHaveBeenCalled();
  });

  it("fails closed when access resolution falls back from Trading to Investing", async () => {
    state.activeMode = "trading";
    mocks.resolveActiveModeForUser.mockResolvedValue("investing");

    const response = await syncPost(postRequest("/api/broker/sync", { mode: "trading" }));
    const payload = await response.json();

    expect(response.status).toBe(410);
    expect(payload).toMatchObject({ error: "investing_shared_broker_sync_blocked", mode: "investing" });
    expect(mocks.loadBrokerConnection).not.toHaveBeenCalled();
    expect(mocks.writeEngineEvent).not.toHaveBeenCalled();
  });

  it("preserves broker sync for the effective Trading mode", async () => {
    state.activeMode = "trading";
    const response = await syncPost(postRequest("/api/broker/sync"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ ok: true, mode: "trading" });
    expect(mocks.loadBrokerConnection).toHaveBeenCalledOnce();
    expect(mocks.syncBrokerToPortfolio).toHaveBeenCalledWith(expect.objectContaining({ mode: "trading" }));
    expect(mocks.reconcileWithPortfolio).toHaveBeenCalledWith(expect.objectContaining({ mode: "trading" }));
  });

  it.each([true, false])("blocks shared reconcile for Investing when refresh=%s", async (refresh) => {
    const response = await reconcilePost(postRequest("/api/broker/reconcile", { refresh }));
    const payload = await response.json();

    expect(response.status).toBe(410);
    expect(payload).toMatchObject({
      ok: false,
      error: "investing_shared_broker_sync_blocked",
      mode: "investing",
    });
    expect(mocks.loadBrokerConnection).not.toHaveBeenCalled();
    expect(mocks.syncBrokerToPortfolio).not.toHaveBeenCalled();
    expect(mocks.reconcileWithPortfolio).not.toHaveBeenCalled();
    expect(mocks.saveBrokerConnection).not.toHaveBeenCalled();
  });

  it.each([
    [true, 1],
    [false, 0],
  ])("preserves Trading reconcile when refresh=%s", async (refresh, expectedSyncCalls) => {
    state.activeMode = "trading";
    const response = await reconcilePost(postRequest("/api/broker/reconcile", { refresh }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ ok: true, mode: "trading" });
    expect(mocks.syncBrokerToPortfolio).toHaveBeenCalledTimes(expectedSyncCalls);
    expect(mocks.reconcileWithPortfolio).toHaveBeenCalledOnce();
  });
});
