import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSupabaseAdmin: vi.fn(),
  getQuotes: vi.fn(),
  enforceModeAccess: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: mocks.getSupabaseAdmin,
}));

vi.mock("@/lib/market/quotes", () => ({
  getQuotes: mocks.getQuotes,
}));

vi.mock("@/lib/signalcore/access", () => ({
  enforceModeAccess: mocks.enforceModeAccess,
}));

import {
  INVESTING_SHARED_BROKER_SYNC_BLOCKED,
  resolveEffectiveSharedBrokerMode,
} from "@/lib/broker/investingBoundary";
import { reconcileWithPortfolio, syncBrokerToPortfolio } from "@/lib/broker/sync";
import { DEFAULT_BROKER_CONNECTION } from "@/lib/broker/shared";

function settingsSupabase(activeMode: unknown, error: unknown = null) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({
            data: activeMode === undefined ? null : { active_mode: activeMode },
            error,
          })),
        })),
      })),
    })),
  };
}

describe("FASE 3A direct shared broker boundary", () => {
  beforeEach(() => {
    mocks.getSupabaseAdmin.mockReset();
    mocks.getQuotes.mockReset();
    mocks.enforceModeAccess.mockReset();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("rejects Investing before bridge fetch, CSV read, quotes or database access", async () => {
    const connection = {
      ...DEFAULT_BROKER_CONNECTION,
      connected: true,
      autoSync: true,
      connectionMethod: "api" as const,
      connectionReference: "proof",
    };

    await expect(
      syncBrokerToPortfolio({ userId: "investor", mode: "investing", connection }),
    ).rejects.toThrow(INVESTING_SHARED_BROKER_SYNC_BLOCKED);

    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.getQuotes).not.toHaveBeenCalled();
    expect(mocks.getSupabaseAdmin).not.toHaveBeenCalled();
  });

  it("rejects shared reconciliation for Investing before reading portfolio_items", async () => {
    await expect(
      reconcileWithPortfolio({ userId: "investor", mode: "investing", snapshot: null }),
    ).rejects.toThrow(INVESTING_SHARED_BROKER_SYNC_BLOCKED);

    expect(mocks.getSupabaseAdmin).not.toHaveBeenCalled();
  });

  it.each([
    ["stored Investing, omitted request", "investing", undefined, "investing", false],
    ["stored Investing, spoofed Trading", "investing", "trading", "investing", true],
    ["stored Trading, explicit Investing", "trading", "investing", "investing", true],
    ["stored Trading, invalid request", "trading", "not-a-mode", "investing", true],
    ["stored Trading, omitted request", "trading", undefined, "trading", false],
    ["no setting, explicit Trading", undefined, "trading", "trading", false],
    ["no setting and omitted request", undefined, undefined, "investing", false],
  ])("resolves %s without allowing boundary spoofing", async (_name, stored, requested, expected, spoofed) => {
    const result = await resolveEffectiveSharedBrokerMode({
      userId: "investor",
      requestedMode: requested,
      supabase: settingsSupabase(stored),
    });

    expect(result.mode).toBe(expected);
    expect(result.spoofed).toBe(spoofed);
  });

  it("fails closed as Investing when active_mode cannot be read", async () => {
    const result = await resolveEffectiveSharedBrokerMode({
      userId: "investor",
      requestedMode: "trading",
      supabase: settingsSupabase(undefined, { message: "database unavailable" }),
    });

    expect(result).toMatchObject({ mode: "investing", failClosed: true, spoofed: true });
  });
});
