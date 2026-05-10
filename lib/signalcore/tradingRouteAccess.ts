import { getBillingStateUser } from "@/lib/signalcore/access";
import {
  canAccessView,
  getEntitlementsForTier,
  resolveAccessTier,
  type AccessEntitlements,
  type AccessTier,
} from "@/lib/signalcore/entitlements";
import type { AutopilotMode } from "@/lib/signalcore/modes";
import { resolveModeAccess } from "@/lib/signalcore/modeAccess";

export type TradingCapability = "execution" | "risk" | "journal" | "alerts";

type TradingRouteAccessDenied = {
  ok: false;
  status: number;
  body: {
    ok: false;
    error: string;
    upgradeRequired: boolean;
    mode: AutopilotMode;
    tier: AccessTier;
    surface: TradingCapability;
    lockedView: TradingCapability;
  };
};

type TradingRouteAccessAllowed = {
  ok: true;
  mode: AutopilotMode;
  tier: AccessTier;
  entitlements: AccessEntitlements;
  hasProAccess: boolean;
};

export type TradingRouteAccessResult = TradingRouteAccessDenied | TradingRouteAccessAllowed;

export function evaluateTradingCapabilityAccess(args: {
  mode: AutopilotMode;
  tier: AccessTier;
  entitlements: AccessEntitlements;
  capability: TradingCapability;
}): TradingRouteAccessDenied | { ok: true } {
  if (args.mode !== "trading") {
    return { ok: true };
  }

  const allowed = canAccessView({
    tier: args.tier,
    mode: "trading",
    view: args.capability,
  });

  if (allowed) {
    return { ok: true };
  }

  return {
    ok: false,
    status: 403,
    body: {
      ok: false,
      error: `trading_${args.capability}_upgrade_required`,
      upgradeRequired: true,
      mode: args.mode,
      tier: args.tier,
      surface: args.capability,
      lockedView: args.capability,
    },
  };
}

export async function resolveTradingRouteAccess(args: {
  supabase: any;
  userId: string;
  requestedMode: unknown;
  capability: TradingCapability;
}): Promise<TradingRouteAccessResult> {
  const billingState = await getBillingStateUser(args.userId);
  const hasProAccess = !!billingState.proActive;

  const modeAccess = await resolveModeAccess({
    supabase: args.supabase,
    userId: args.userId,
    requestedMode: args.requestedMode,
    hasProAccess,
  });

  if (!modeAccess.ok) {
    return {
      ok: false,
      status: modeAccess.status,
      body: {
        ok: false,
        error: modeAccess.error || "mode_access_denied",
        upgradeRequired: false,
        mode: modeAccess.mode,
        tier: "free",
        surface: args.capability,
        lockedView: args.capability,
      },
    };
  }

  const tier = resolveAccessTier({
    billingPaid: billingState.plan === "pro",
    hasProAccess: modeAccess.hasProAccess,
    trialActive: billingState.trialActive,
  });
  const entitlements = getEntitlementsForTier(tier);
  const capabilityAccess = evaluateTradingCapabilityAccess({
    mode: modeAccess.mode,
    tier,
    entitlements,
    capability: args.capability,
  });

  if (capabilityAccess.ok === false) {
    return capabilityAccess;
  }

  return {
    ok: true,
    mode: modeAccess.mode,
    tier,
    entitlements,
    hasProAccess: modeAccess.hasProAccess,
  };
}
