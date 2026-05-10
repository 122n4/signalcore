// lib/signalcore/access.ts
// Server-side access helpers (Free vs Pro).

import { clerkClient } from "@clerk/nextjs/server";
import type { AutopilotMode } from "@/lib/signalcore/modes";
import { normalizeMode } from "@/lib/signalcore/modes";
import { getAllowedModesForTier, resolveAccessTier } from "@/lib/signalcore/entitlements";
import { hasProAccessFromMetadata } from "@/lib/signalcore/trial";
import { isOwnerUserId } from "@/lib/signalcore/owner";
import { isLocalQaUserId } from "@/lib/auth/localQaAuth";

export type AccessCheck =
  | { ok: true; isPaid: boolean; hasProAccess: boolean; allowedMode: AutopilotMode }
  | { ok: false; isPaid: boolean; hasProAccess: boolean; allowedMode: AutopilotMode; status: number; error: string };

export type BillingStateTruth = {
  plan: "free" | "pro";
  trialActive: boolean;
  trialEndsAt: string | null;
  proActive: boolean;
  trialStarted: boolean;
  trialExpired: boolean;
  source: "dev_force_pro" | "owner_override" | "clerk_public_metadata_v1" | "fallback_free";
};

function isDevForceProEnabled() {
  return process.env.NODE_ENV !== "production" && process.env.SC_FORCE_PRO === "1";
}

export async function getIsPaidUser(userId: string): Promise<boolean> {
  // Dev override (local only): SC_FORCE_PRO=1
  if (isDevForceProEnabled()) return true;
  if (isLocalQaUserId(userId)) return true;
  if (isOwnerUserId(userId)) return true;

  try {
    const client: any = typeof clerkClient === "function" ? await (clerkClient as any)() : clerkClient;
    const user = await client.users.getUser(userId);
    return Boolean((user.publicMetadata as any)?.isPaid);
  } catch {
    return false;
  }
}

export async function getHasProAccessUser(userId: string): Promise<boolean> {
  // Dev override (local only): SC_FORCE_PRO=1
  if (isDevForceProEnabled()) return true;
  if (isLocalQaUserId(userId)) return true;
  if (isOwnerUserId(userId)) return true;

  try {
    const client: any = typeof clerkClient === "function" ? await (clerkClient as any)() : clerkClient;
    const user = await client.users.getUser(userId);
    const access = hasProAccessFromMetadata(user.publicMetadata as any);
    return access.hasProAccess;
  } catch {
    return false;
  }
}

export async function getBillingStateUser(userId: string): Promise<BillingStateTruth> {
  if (isDevForceProEnabled() || isLocalQaUserId(userId)) {
    return {
      plan: "pro",
      trialActive: false,
      trialEndsAt: null,
      proActive: true,
      trialStarted: false,
      trialExpired: false,
      source: "dev_force_pro",
    };
  }

  if (isOwnerUserId(userId)) {
    return {
      plan: "pro",
      trialActive: false,
      trialEndsAt: null,
      proActive: true,
      trialStarted: false,
      trialExpired: false,
      source: "owner_override",
    };
  }

  try {
    const client: any = typeof clerkClient === "function" ? await (clerkClient as any)() : clerkClient;
    const user = await client.users.getUser(userId);
    const access = hasProAccessFromMetadata(user.publicMetadata as any);
    return {
      plan: access.isPaid ? "pro" : "free",
      trialActive: access.trial.isActive,
      trialEndsAt: access.trial.endsAt,
      proActive: access.hasProAccess,
      trialStarted: access.trial.hasStarted,
      trialExpired: access.trial.isExpired,
      source: "clerk_public_metadata_v1",
    };
  } catch {
    return {
      plan: "free",
      trialActive: false,
      trialEndsAt: null,
      proActive: false,
      trialStarted: false,
      trialExpired: false,
      source: "fallback_free",
    };
  }
}

export async function getAllowedModeFromSettings(params: {
  supabase: any;
  userId: string;
}): Promise<AutopilotMode> {
  const { supabase, userId } = params;
  try {
    const res = await supabase
      .from("user_settings")
      .select("active_mode")
      .eq("user_id", userId)
      .maybeSingle();

    const m = res?.data?.active_mode;
    return normalizeMode(m || "investing") as AutopilotMode;
  } catch {
    return "investing";
  }
}

export async function enforceModeAccess(params: {
  supabase: any;
  userId: string;
  requestedMode: any;
  // Optional: if you already know access status, pass it to avoid extra call
  hasProAccess?: boolean;
}): Promise<AccessCheck> {
  const { supabase, userId, requestedMode } = params;
  const requested = normalizeMode(requestedMode) as AutopilotMode;
  const hasProAccess = params.hasProAccess ?? (await getHasProAccessUser(userId));
  const storedMode = await getAllowedModeFromSettings({ supabase, userId });
  const tier = resolveAccessTier({
    billingPaid: hasProAccess,
    hasProAccess,
    trialActive: false,
  });
  const allowedModes = getAllowedModesForTier(tier);
  const normalizedStoredMode = allowedModes.includes(storedMode) ? storedMode : allowedModes[0]!;
  const requestedAllowed = allowedModes.includes(requested);

  if (requestedAllowed) {
    return { ok: true, isPaid: hasProAccess, hasProAccess, allowedMode: normalizedStoredMode };
  }

  return { ok: true, isPaid: hasProAccess, hasProAccess, allowedMode: normalizedStoredMode };
}
