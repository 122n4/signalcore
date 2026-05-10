import { afterEach, describe, expect, it } from "vitest";
import { enforceModeAccess, getBillingStateUser, getHasProAccessUser, getIsPaidUser } from "../lib/signalcore/access";

const ORIGINAL_OWNER_ID = process.env.SC_OWNER_USER_ID;
const ORIGINAL_OWNER_IDS = process.env.SC_OWNER_USER_IDS;

function makeSupabaseStub(activeMode: string | null) {
  return {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle: async () => ({
                  data: activeMode == null ? null : { active_mode: activeMode },
                }),
              };
            },
          };
        },
      };
    },
  };
}

afterEach(() => {
  if (ORIGINAL_OWNER_ID == null) delete process.env.SC_OWNER_USER_ID;
  else process.env.SC_OWNER_USER_ID = ORIGINAL_OWNER_ID;

  if (ORIGINAL_OWNER_IDS == null) delete process.env.SC_OWNER_USER_IDS;
  else process.env.SC_OWNER_USER_IDS = ORIGINAL_OWNER_IDS;
});

describe("access.enforceModeAccess", () => {
  it("allows free users to open trading discovery mode", async () => {
    const res = await enforceModeAccess({
      supabase: makeSupabaseStub("trading"),
      userId: "u1",
      requestedMode: "trading",
      hasProAccess: false,
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.allowedMode).toBe("trading");
  });

  it("keeps free users on investing when stored mode is investing", async () => {
    const res = await enforceModeAccess({
      supabase: makeSupabaseStub("investing"),
      userId: "u1",
      requestedMode: "investing",
      hasProAccess: false,
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.allowedMode).toBe("investing");
  });

  it("allows pro users and resolves stale stored modes to a supported workspace", async () => {
    const res = await enforceModeAccess({
      supabase: makeSupabaseStub("crypto"),
      userId: "u1",
      requestedMode: "forex",
      hasProAccess: true,
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.hasProAccess).toBe(true);
    expect(res.allowedMode).toBe("investing");
  });
});

describe("access owner override", () => {
  it("treats the configured owner as paid and pro", async () => {
    process.env.SC_OWNER_USER_ID = "owner_123";
    delete process.env.SC_OWNER_USER_IDS;

    await expect(getIsPaidUser("owner_123")).resolves.toBe(true);
    await expect(getHasProAccessUser("owner_123")).resolves.toBe(true);

    const billing = await getBillingStateUser("owner_123");
    expect(billing.plan).toBe("pro");
    expect(billing.proActive).toBe(true);
    expect(billing.source).toBe("owner_override");
  });
});
