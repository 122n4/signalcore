import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveTradingRouteAccess } from "@/lib/signalcore/tradingRouteAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clampLimit(v: string | null) {
  const n = Number(v || 20);
  if (!Number.isFinite(n)) return 20;
  return Math.max(1, Math.min(100, Math.round(n)));
}

function asObj(x: unknown) {
  return x && typeof x === "object" ? (x as Record<string, unknown>) : {};
}

function asStr(x: unknown, fallback = "") {
  const s = String(x ?? "").trim();
  return s || fallback;
}

function asStatus(x: unknown): "ok" | "warn" | "error" {
  const v = String(x || "").toLowerCase().trim();
  if (v === "error") return "error";
  if (v === "warn" || v === "warning") return "warn";
  return "ok";
}

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const limit = clampLimit(url.searchParams.get("limit"));

  const sb = getSupabaseAdmin();
  const access = await resolveTradingRouteAccess({
    supabase: sb,
    userId,
    requestedMode: url.searchParams.get("mode"),
    capability: "alerts",
  });
  if (access.ok === false) {
    return NextResponse.json(access.body, { status: access.status });
  }
  const mode = access.mode;
  const { data, error } = await sb
    .from("journal_entries")
    .select("id,type,title,details,created_at,mode")
    .eq("user_id", userId)
    .eq("mode", mode)
    .in("type", ["engine_event", "engine_loop_tick", "decision_receipt", "fix_now_run"])
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const events = (data || []).map((row: any) => {
    const d = asObj(row?.details);
    const isEngineEvent = String(row?.type || "") === "engine_event";
    const event = isEngineEvent ? asStr(d.event, "engine_loop_tick") : asStr(row?.type, "event");
    const status = isEngineEvent ? asStatus(d.status) : "ok";
    const executionId = asStr(d.execution_id || d.executionId, "");
    const durationMsRaw = Number(d.duration_ms ?? d.durationMs);
    const durationMs = Number.isFinite(durationMsRaw) && durationMsRaw >= 0 ? Math.round(durationMsRaw) : null;
    const summary =
      event === "decision_receipt"
        ? `Receipt stored for ${asStr(d.day_key, "today")}`
        : event === "fix_now_run"
          ? `FixNow rounds: ${Number(d.rounds || 0)}`
          : asStr(d.message || d.error || d.reason || d.source, "");

    return {
      id: String(row?.id || ""),
      at: row?.created_at || null,
      mode: String(row?.mode || mode),
      type: String(row?.type || "event"),
      event,
      status,
      executionId: executionId || null,
      durationMs,
      title: asStr(row?.title, "Event"),
      summary,
      details: d,
    };
  });

  return NextResponse.json({ ok: true, mode, events }, { status: 200 });
}
