"use client";

import type { AutopilotMode } from "@/lib/signalcore/modes";
import { normalizeMode } from "@/lib/signalcore/modes";
import { resolveAccessTier, type AccessTier } from "@/lib/signalcore/entitlements";

export type AccessTrialState = {
  active: boolean;
  started: boolean;
  expired: boolean;
  startedAt: string | null;
  endsAt: string | null;
  remainingDays: number;
  days: number;
};

export const EMPTY_ACCESS_TRIAL: AccessTrialState = {
  active: false,
  started: false,
  expired: false,
  startedAt: null,
  endsAt: null,
  remainingDays: 0,
  days: 0,
};

export type AccessClientState = {
  isPaid: boolean;
  hasProAccess: boolean;
  billingPaid: boolean;
  trial: AccessTrialState;
  tier: AccessTier;
  storedMode: AutopilotMode;
};

export function normalizeAccessTrial(input: any): AccessTrialState {
  if (!input || typeof input !== "object") return EMPTY_ACCESS_TRIAL;
  return {
    active: Boolean((input as any).active),
    started: Boolean((input as any).started),
    expired: Boolean((input as any).expired),
    startedAt: (input as any).startedAt ? String((input as any).startedAt) : null,
    endsAt: (input as any).endsAt ? String((input as any).endsAt) : null,
    remainingDays: Math.max(0, Math.round(Number((input as any).remainingDays || 0))),
    days: Math.max(0, Math.round(Number((input as any).days || 0))),
  };
}

async function fetchJSON(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data } as const;
}

export async function loadAccessClientState() {
  const [me, us] = await Promise.all([fetchJSON("/api/me"), fetchJSON("/api/user-settings")]);
  const billingActive = Boolean(me.data?.isPaid);
  const hasProAccess = Boolean(me.data?.hasProAccess ?? billingActive);
  const trial = normalizeAccessTrial(me.data?.trial);
  const storedMode = normalizeMode(us.data?.settings?.active_mode || "investing") as AutopilotMode;
  const tier = resolveAccessTier({
    billingPaid: billingActive,
    hasProAccess,
    trialActive: trial.active,
  });

  return {
    isPaid: hasProAccess,
    hasProAccess,
    billingPaid: billingActive,
    trial,
    tier,
    storedMode,
  } satisfies AccessClientState;
}
