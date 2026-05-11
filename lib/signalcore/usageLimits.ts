import type { AccessTier } from "@/lib/signalcore/entitlements";

export type FeatureUsageDecision = {
  allowed: boolean;
  feature: string;
  tier: AccessTier;
  limit: number | null;
  usedToday: number;
  remainingToday: number | null;
  resetAt: string;
  reason: "allowed" | "daily_limit_reached" | "cooldown_active" | "tracking_unavailable";
  retryAfterSeconds: number | null;
  tracked: boolean;
  trackingError?: string | null;
};

function dayStartUtcIso(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

function nextDayStartUtcIso(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString();
}

function safeErrorMessage(error: any) {
  return String(error?.message || error || "usage_tracking_failed").slice(0, 240);
}

export async function checkAndRecordFeatureUsage(args: {
  supabase: any;
  userId: string;
  feature: string;
  tier: AccessTier;
  dailyLimit: number | null;
  cooldownSeconds: number;
  now?: Date;
  metadata?: Record<string, unknown>;
}): Promise<FeatureUsageDecision> {
  const now = args.now ?? new Date();
  const createdAt = now.toISOString();
  const resetAt = nextDayStartUtcIso(now);
  const dailyLimit = args.dailyLimit == null ? null : Math.max(0, Math.floor(args.dailyLimit));
  const cooldownSeconds = Math.max(0, Math.floor(args.cooldownSeconds || 0));

  if (dailyLimit === 0) {
    return {
      allowed: false,
      feature: args.feature,
      tier: args.tier,
      limit: 0,
      usedToday: 0,
      remainingToday: 0,
      resetAt,
      reason: "daily_limit_reached",
      retryAfterSeconds: null,
      tracked: true,
    };
  }

  try {
    const since = dayStartUtcIso(now);
    const { count, error: countError } = await args.supabase
      .from("feature_usage_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", args.userId)
      .eq("feature", args.feature)
      .gte("created_at", since);

    if (countError) throw countError;

    const usedToday = Math.max(0, Number(count || 0));
    if (dailyLimit != null && usedToday >= dailyLimit) {
      return {
        allowed: false,
        feature: args.feature,
        tier: args.tier,
        limit: dailyLimit,
        usedToday,
        remainingToday: 0,
        resetAt,
        reason: "daily_limit_reached",
        retryAfterSeconds: null,
        tracked: true,
      };
    }

    if (cooldownSeconds > 0) {
      const { data: latestRows, error: latestError } = await args.supabase
        .from("feature_usage_events")
        .select("created_at")
        .eq("user_id", args.userId)
        .eq("feature", args.feature)
        .order("created_at", { ascending: false })
        .limit(1);

      if (latestError) throw latestError;

      const latestAt = Array.isArray(latestRows) ? latestRows[0]?.created_at : null;
      const latestMs = latestAt ? new Date(String(latestAt)).getTime() : NaN;
      if (Number.isFinite(latestMs)) {
        const elapsedSeconds = Math.floor((now.getTime() - latestMs) / 1000);
        if (elapsedSeconds < cooldownSeconds) {
          return {
            allowed: false,
            feature: args.feature,
            tier: args.tier,
            limit: dailyLimit,
            usedToday,
            remainingToday: dailyLimit == null ? null : Math.max(0, dailyLimit - usedToday),
            resetAt,
            reason: "cooldown_active",
            retryAfterSeconds: Math.max(1, cooldownSeconds - elapsedSeconds),
            tracked: true,
          };
        }
      }
    }

    const { error: insertError } = await args.supabase.from("feature_usage_events").insert({
      user_id: args.userId,
      feature: args.feature,
      plan: args.tier,
      created_at: createdAt,
      metadata: args.metadata ?? {},
    });

    if (insertError) throw insertError;

    const nextUsedToday = usedToday + 1;
    return {
      allowed: true,
      feature: args.feature,
      tier: args.tier,
      limit: dailyLimit,
      usedToday: nextUsedToday,
      remainingToday: dailyLimit == null ? null : Math.max(0, dailyLimit - nextUsedToday),
      resetAt,
      reason: "allowed",
      retryAfterSeconds: null,
      tracked: true,
    };
  } catch (error: any) {
    return {
      allowed: true,
      feature: args.feature,
      tier: args.tier,
      limit: dailyLimit,
      usedToday: 0,
      remainingToday: dailyLimit,
      resetAt,
      reason: "tracking_unavailable",
      retryAfterSeconds: null,
      tracked: false,
      trackingError: safeErrorMessage(error),
    };
  }
}

