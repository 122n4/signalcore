import type { AutopilotMode } from "@/lib/signalcore/modes";

export type AccessTier = "free" | "trial" | "pro";

export type EntitledViewKey = "trading" | "journal" | "alerts";

export type AccessEntitlements = {
  tier: AccessTier;
  allowedModes: AutopilotMode[];
  tradingViews: EntitledViewKey[];
  lockedTradingViews: EntitledViewKey[];
  trading: {
    discoveryInstrumentLimit: number | null;
    visibleHistoryDays: number | null;
    weeklyOpportunityBudget: number | null;
    executionEnabled: boolean;
    riskEnabled: boolean;
    journalEnabled: boolean;
    alertsEnabled: boolean;
    marketCoverage: "discovery" | "full";
  };
};

const FULL_TRADING_VIEWS: EntitledViewKey[] = ["trading", "journal", "alerts"];
const DISCOVERY_TRADING_VIEWS: EntitledViewKey[] = ["trading"];
const LOCKED_DISCOVERY_TRADING_VIEWS: EntitledViewKey[] = ["journal", "alerts"];

const ENTITLEMENTS_BY_TIER: Record<AccessTier, AccessEntitlements> = {
  free: {
    tier: "free",
    allowedModes: ["trading"],
    tradingViews: DISCOVERY_TRADING_VIEWS,
    lockedTradingViews: LOCKED_DISCOVERY_TRADING_VIEWS,
    trading: {
      discoveryInstrumentLimit: 3,
      visibleHistoryDays: 7,
      weeklyOpportunityBudget: 3,
      executionEnabled: false,
      riskEnabled: false,
      journalEnabled: false,
      alertsEnabled: false,
      marketCoverage: "discovery",
    },
  },
  trial: {
    tier: "trial",
    allowedModes: ["trading"],
    tradingViews: FULL_TRADING_VIEWS,
    lockedTradingViews: [],
    trading: {
      discoveryInstrumentLimit: null,
      visibleHistoryDays: null,
      weeklyOpportunityBudget: null,
      executionEnabled: true,
      riskEnabled: true,
      journalEnabled: true,
      alertsEnabled: true,
      marketCoverage: "full",
    },
  },
  pro: {
    tier: "pro",
    allowedModes: ["trading"],
    tradingViews: FULL_TRADING_VIEWS,
    lockedTradingViews: [],
    trading: {
      discoveryInstrumentLimit: null,
      visibleHistoryDays: null,
      weeklyOpportunityBudget: null,
      executionEnabled: true,
      riskEnabled: true,
      journalEnabled: true,
      alertsEnabled: true,
      marketCoverage: "full",
    },
  },
};

export function resolveAccessTier(args: {
  billingPaid?: boolean | null;
  hasProAccess?: boolean | null;
  trialActive?: boolean | null;
}): AccessTier {
  if (args.billingPaid || (args.hasProAccess && !args.trialActive)) {
    return "pro";
  }

  if (args.trialActive) {
    return "trial";
  }

  return "free";
}

export function getEntitlementsForTier(tier: AccessTier): AccessEntitlements {
  return ENTITLEMENTS_BY_TIER[tier];
}

export function getAllowedModesForTier(tier: AccessTier): AutopilotMode[] {
  return getEntitlementsForTier(tier).allowedModes;
}

export function canAccessMode(args: {
  tier: AccessTier;
  mode: AutopilotMode;
}): boolean {
  return getAllowedModesForTier(args.tier).includes(args.mode);
}

export function canAccessView(args: {
  tier: AccessTier;
  mode: AutopilotMode;
  view: EntitledViewKey;
}): boolean {
  const entitlements = getEntitlementsForTier(args.tier);
  const allowedViews = entitlements.tradingViews;
  return allowedViews.includes(args.view);
}

export function getLockedViewsForMode(args: {
  tier: AccessTier;
  mode: AutopilotMode;
}): EntitledViewKey[] {
  const entitlements = getEntitlementsForTier(args.tier);
  void args.mode;
  return entitlements.lockedTradingViews;
}

