import type { AccessTier } from "@/lib/signalcore/entitlements";

export type PlanDataRefreshLimits = {
  forceTradingRefreshDailyLimit: number | null;
  forceTradingRefreshCooldownSeconds: number;
  sharedTradingSnapshotOnly: boolean;
};

export type PlanLimits = {
  tier: AccessTier;
  dataRefresh: PlanDataRefreshLimits;
};

const PLAN_LIMITS: Record<AccessTier, PlanLimits> = {
  free: {
    tier: "free",
    dataRefresh: {
      forceTradingRefreshDailyLimit: 5,
      forceTradingRefreshCooldownSeconds: 15 * 60,
      sharedTradingSnapshotOnly: false,
    },
  },
  trial: {
    tier: "trial",
    dataRefresh: {
      forceTradingRefreshDailyLimit: 10,
      forceTradingRefreshCooldownSeconds: 2 * 60,
      sharedTradingSnapshotOnly: false,
    },
  },
  pro: {
    tier: "pro",
    dataRefresh: {
      forceTradingRefreshDailyLimit: null,
      forceTradingRefreshCooldownSeconds: 60,
      sharedTradingSnapshotOnly: false,
    },
  },
};

export function getPlanLimitsForTier(tier: AccessTier): PlanLimits {
  return PLAN_LIMITS[tier] ?? PLAN_LIMITS.free;
}
