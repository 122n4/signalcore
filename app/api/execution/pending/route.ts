import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { AutopilotMode } from "@/lib/signalcore/modes";
import {
  clearManualExecutionPending,
  refreshManualExecutionReminder,
  setManualExecutionPending,
} from "@/lib/signalcore/manualExecutionState";
import { resolveTradingRouteAccess } from "@/lib/signalcore/tradingRouteAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function asInt(value: unknown, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.round(n);
}

function asText(value: unknown, maxLen = 120) {
  return String(value || "")
    .trim()
    .slice(0, maxLen);
}

export async function GET(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const sb = getSupabaseAdmin();
    const access = await resolveTradingRouteAccess({
      supabase: sb,
      userId,
      requestedMode: url.searchParams.get("mode"),
      capability: "execution",
    });
    if (access.ok === false) {
      return NextResponse.json(access.body, { status: access.status });
    }
    const mode = access.mode as AutopilotMode;
    const state = await refreshManualExecutionReminder({ sb, userId, mode });
    return NextResponse.json(
      {
        ok: true,
        mode,
        status: state.snapshot.status,
        pending: state.snapshot.pending,
        lastProof: state.snapshot.lastProof,
        updatedAt: state.snapshot.updatedAt,
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const action = asText(body?.action || "start", 32).toLowerCase();
    const sb = getSupabaseAdmin();
    const access = await resolveTradingRouteAccess({
      supabase: sb,
      userId,
      requestedMode: body?.mode,
      capability: "execution",
    });
    if (access.ok === false) {
      return NextResponse.json(access.body, { status: access.status });
    }
    const mode = access.mode as AutopilotMode;

    if (action === "clear") {
      const snapshot = await clearManualExecutionPending({
        sb,
        userId,
        mode,
        reason: asText(body?.reason || "", 240) || null,
      });
      return NextResponse.json(
        {
          ok: true,
          mode,
          status: snapshot.status,
          pending: snapshot.pending,
          lastProof: snapshot.lastProof,
          updatedAt: snapshot.updatedAt,
        },
        { status: 200 }
      );
    }

    if (action === "start") {
      const rows = Math.max(0, asInt(body?.rows, 0));
      if (rows <= 0) {
        return NextResponse.json({ ok: false, error: "rows must be > 0" }, { status: 400 });
      }
      const snapshot = await setManualExecutionPending({
        sb,
        userId,
        mode,
        leakKey: asText(body?.leakKey, 80) || null,
        rows,
        context: asText(body?.context, 40) || null,
        orders: Array.isArray(body?.orders) ? body.orders : [],
      });
      return NextResponse.json(
        {
          ok: true,
          mode,
          status: snapshot.status,
          pending: snapshot.pending,
          lastProof: snapshot.lastProof,
          updatedAt: snapshot.updatedAt,
        },
        { status: 200 }
      );
    }

    return NextResponse.json({ ok: false, error: "Unsupported action" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}
