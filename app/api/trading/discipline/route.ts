import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveTradingRouteAccess } from "@/lib/signalcore/tradingRouteAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type JournalRow = {
  id: string;
  type: string | null;
  title: string | null;
  details: any;
  created_at: string | null;
};

function asObject(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

function asNumber(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function pct(part: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
}

function roundR(value: number) {
  return Math.round(value * 100) / 100;
}

function normalizeDiscipline(row: JournalRow) {
  const details = asObject(row.details);
  const discipline = asObject(details.planDiscipline);
  const aligned =
    discipline.aligned === true
      ? true
      : discipline.status === "aligned"
        ? true
        : discipline.aligned === false || discipline.status === "violation"
          ? false
          : null;

  return {
    id: String(row.id),
    type: String(row.type || ""),
    title: String(row.title || ""),
    action: String(details.action || ""),
    instrument: String(details.instrument || discipline.instrument || ""),
    createdAt: row.created_at,
    aligned,
    status: aligned === false ? "violation" : aligned === true ? "aligned" : "unknown",
    violationReason: discipline.violationReason ? String(discipline.violationReason) : null,
    clarity: asNumber(discipline.clarity),
    recommendation: discipline.recommendation ? String(discipline.recommendation) : null,
    traderAction: discipline.traderAction ? String(discipline.traderAction) : null,
    resultR: asNumber(details.resultR ?? discipline.resultR),
  };
}

export async function GET(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const daysRaw = Number(url.searchParams.get("days"));
    const days = Number.isFinite(daysRaw) && daysRaw > 0 ? Math.min(365, Math.round(daysRaw)) : 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const sb = getSupabaseAdmin();
    const access = await resolveTradingRouteAccess({
      supabase: sb,
      userId,
      requestedMode: url.searchParams.get("mode") || "trading",
      capability: "journal",
    });
    if (access.ok === false) {
      return NextResponse.json(access.body, { status: access.status });
    }

    const { data, error } = await sb
      .from("journal_entries")
      .select("id,type,title,details,created_at")
      .eq("user_id", userId)
      .eq("mode", access.mode)
      .in("type", ["trading_follow", "trading_plan_violation"])
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message || "trading_discipline_read_failed");

    const events = ((data || []) as JournalRow[]).map(normalizeDiscipline);
    const entryEvents = events.filter((event) => event.action === "entry_confirmed");
    const alignedEntries = entryEvents.filter((event) => event.aligned === true);
    const violationEntries = entryEvents.filter((event) => event.aligned === false);
    const closedEvents = events.filter((event) => event.action === "closed" && event.resultR != null);
    const alignedPnlR = closedEvents
      .filter((event) => event.aligned === true)
      .reduce((sum, event) => sum + Number(event.resultR || 0), 0);
    const violationPnlR = closedEvents
      .filter((event) => event.aligned === false)
      .reduce((sum, event) => sum + Number(event.resultR || 0), 0);

    return NextResponse.json({
      ok: true,
      mode: access.mode,
      windowDays: days,
      summary: {
        entryCount: entryEvents.length,
        alignedCount: alignedEntries.length,
        violationCount: violationEntries.length,
        alignedPct: pct(alignedEntries.length, entryEvents.length),
        violationPct: pct(violationEntries.length, entryEvents.length),
        alignedPnlR: roundR(alignedPnlR),
        violationPnlR: roundR(violationPnlR),
        closedWithResultCount: closedEvents.length,
      },
      latestViolation: violationEntries[0] ?? null,
      events: events.slice(0, 80),
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}
