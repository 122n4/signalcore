import { NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { getRequestUserId } from "@/lib/auth/requestUser";
import { isLocalQaUserId } from "@/lib/auth/localQaAuth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { hasProAccessFromMetadata } from "@/lib/signalcore/trial";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clampInt(v: unknown, min: number, max: number, fallback: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function eventFromRow(row: any) {
  const details = row?.details && typeof row.details === "object" ? row.details : {};
  const detailEvent = String((details as any)?.event || "")
    .toLowerCase()
    .trim();
  if (detailEvent) return detailEvent;
  const title = String(row?.title || "")
    .toLowerCase()
    .trim();
  if (title.startsWith("conversion:")) {
    return title.replace("conversion:", "").trim();
  }
  return null;
}

function pct(a: number, b: number) {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((a / b) * 100)));
}

async function getAccessState(userId: string) {
  if (isLocalQaUserId(userId)) {
    return {
      isPaid: true,
      hasProAccess: true,
      planStatus: "paid",
      trial: {
        active: false,
        started: false,
        expired: false,
        startedAt: null,
        endsAt: null,
        remainingDays: 0,
        days: 0,
      },
    };
  }

  const client: any =
    typeof clerkClient === "function" ? await (clerkClient as any)() : clerkClient;
  const user = await client.users.getUser(userId);
  const access = hasProAccessFromMetadata(user.publicMetadata as any);
  const planStatus = access.isPaid ? "paid" : access.trial.isActive ? "trial" : "free";
  return {
    isPaid: access.isPaid,
    hasProAccess: access.hasProAccess,
    planStatus,
    trial: {
      active: access.trial.isActive,
      started: access.trial.hasStarted,
      expired: access.trial.isExpired,
      startedAt: access.trial.startedAt,
      endsAt: access.trial.endsAt,
      remainingDays: access.trial.remainingDays,
      days: access.trial.days,
    },
  };
}

export async function GET(req: Request) {
  try {
    const userId = await getRequestUserId(req);
    if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const days = clampInt(url.searchParams.get("days"), 1, 365, 30);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from("journal_entries")
      .select("id,mode,title,details,created_at")
      .eq("user_id", userId)
      .eq("type", "conversion_event")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    const rows = Array.isArray(data) ? data : [];
    const counts = {
      paywallOpen: 0,
      trialStartClick: 0,
      trialStarted: 0,
      trialBlockedUsed: 0,
      checkoutStart: 0,
      checkoutSessionCreated: 0,
      paidActivated: 0,
      portalOpen: 0,
    };
    const seenEvents = new Set<string>();

    const events = rows
      .map((row: any) => {
        const details = row?.details && typeof row.details === "object" ? row.details : {};
        const event = eventFromRow(row);
        if (!event) return null;
        seenEvents.add(event);
        if (event === "paywall_open") counts.paywallOpen += 1;
        if (event === "trial_start_click") counts.trialStartClick += 1;
        if (event === "trial_started") counts.trialStarted += 1;
        if (event === "trial_blocked_used") counts.trialBlockedUsed += 1;
        if (event === "checkout_start") counts.checkoutStart += 1;
        if (event === "checkout_session_created") counts.checkoutSessionCreated += 1;
        if (event === "paid_activated") counts.paidActivated += 1;
        if (event === "portal_open") counts.portalOpen += 1;
        return {
          id: String(row?.id || ""),
          at: row?.created_at ? String(row.created_at) : null,
          mode: String(row?.mode || ""),
          event,
          source: (details as any)?.source ? String((details as any).source) : null,
        };
      })
      .filter(Boolean)
      .slice(0, 30) as Array<{
      id: string;
      at: string | null;
      mode: string;
      event: string;
      source: string | null;
    }>;
    const stageFlags = {
      paywallOpen: seenEvents.has("paywall_open"),
      trialStartClick: seenEvents.has("trial_start_click"),
      trialStarted: seenEvents.has("trial_started"),
      checkoutStart: seenEvents.has("checkout_start"),
      checkoutSessionCreated: seenEvents.has("checkout_session_created"),
      paidActivated: seenEvents.has("paid_activated"),
      portalOpen: seenEvents.has("portal_open"),
    };
    const checkoutIntentSeen = stageFlags.checkoutSessionCreated || stageFlags.checkoutStart;

    const access = await getAccessState(userId);
    const trialDays = Number(access?.trial?.remainingDays || 0);
    const urgency =
      access.planStatus === "trial"
        ? trialDays <= 1
          ? "Trial ends in less than 24h. Upgrade now to avoid interruption."
          : trialDays <= 3
            ? `Trial ends in ${trialDays} days. Upgrade now to keep Pro features active.`
            : `Trial active (${trialDays} days left). Keep executing and validate outcomes.`
        : access.planStatus === "free"
          ? "Free mode active. Start trial or upgrade to unlock full execution."
          : "Paid subscription active.";

    const rates = {
      trialClickRate: pct(stageFlags.trialStartClick ? 1 : 0, stageFlags.paywallOpen ? 1 : 0),
      trialStartRate: pct(stageFlags.trialStarted ? 1 : 0, stageFlags.trialStartClick ? 1 : 0),
      checkoutIntentRate: pct(checkoutIntentSeen ? 1 : 0, stageFlags.paywallOpen ? 1 : 0),
      paidFromCheckoutRate: pct(stageFlags.paidActivated && checkoutIntentSeen ? 1 : 0, checkoutIntentSeen ? 1 : 0),
      paidFromTrialRate: pct(stageFlags.paidActivated && stageFlags.trialStarted ? 1 : 0, stageFlags.trialStarted ? 1 : 0),
      overallPaidRate: pct(stageFlags.paidActivated && stageFlags.paywallOpen ? 1 : 0, stageFlags.paywallOpen ? 1 : 0),
    };

    return NextResponse.json(
      {
        ok: true,
        days,
        counts,
        stageFlags,
        rates,
        access,
        urgency,
        events,
      },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "conversion_funnel_failed", message: e?.message || "Unknown" },
      { status: 500 }
    );
  }
}
