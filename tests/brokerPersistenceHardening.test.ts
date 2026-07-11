import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSupabaseAdmin: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: mocks.getSupabaseAdmin,
}));

import { loadBrokerConnection, saveBrokerConnection } from "@/lib/broker/store";
import { DEFAULT_BROKER_CONNECTION } from "@/lib/broker/shared";

describe("broker persistence hardening", () => {
  beforeEach(() => {
    mocks.getSupabaseAdmin.mockReset();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOW_MEMORY_FALLBACK", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("does not load from memory fallback in production when persistence is unavailable", async () => {
    mocks.getSupabaseAdmin.mockImplementation(() => {
      throw new Error("missing service role");
    });

    await expect(loadBrokerConnection("user_prod")).rejects.toThrow("broker_persistence_unavailable");
  });

  it("does not save only to memory in production when persistence is unavailable", async () => {
    mocks.getSupabaseAdmin.mockImplementation(() => {
      throw new Error("missing service role");
    });

    await expect(
      saveBrokerConnection("user_prod", {
        ...DEFAULT_BROKER_CONNECTION,
        userId: "user_prod",
        broker: "interactive_brokers",
        connected: true,
        source: "memory",
      }),
    ).rejects.toThrow("broker_persistence_unavailable");
  });
});
