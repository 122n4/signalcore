// app/api/portfolio-meta/route.ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import type { AutopilotMode } from "@/lib/signalcore/modes";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveModeAccess } from "@/lib/signalcore/modeAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bad(msg: string, status = 400) {
  return NextResponse.json(
    {
      ok: false,
      error: msg,
      deprecated: true,
      canonicalSource: "portfolio_items",
      canonicalReadEndpoint: "/api/portfolio-items",
      canonicalWriteEndpoint: "/api/portfolio-items",
    },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-SignalCore-Deprecated": "true",
        "X-SignalCore-Canonical-Endpoint": "/api/portfolio-items",
      },
    }
  );
}

function ok(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(
    {
      deprecated: true,
      canonicalSource: "portfolio_items",
      canonicalReadEndpoint: "/api/portfolio-items",
      canonicalWriteEndpoint: "/api/portfolio-items",
      ...body,
    },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-SignalCore-Deprecated": "true",
        "X-SignalCore-Canonical-Endpoint": "/api/portfolio-items",
      },
    }
  );
}

function accessDenied(args: {
  status: number;
  error: string | null;
  allowedMode: string;
  requestedMode: string;
}) {
  return NextResponse.json(
    {
      ok: false,
      error: args.error || "upgrade_required",
      allowedMode: args.allowedMode,
      requestedMode: args.requestedMode,
      deprecated: true,
      canonicalSource: "portfolio_items",
      canonicalReadEndpoint: "/api/portfolio-items",
      canonicalWriteEndpoint: "/api/portfolio-items",
    },
    {
      status: args.status,
      headers: {
        "Cache-Control": "no-store",
        "X-SignalCore-Deprecated": "true",
        "X-SignalCore-Canonical-Endpoint": "/api/portfolio-items",
      },
    }
  );
}

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return bad("Unauthorized", 401);

  const { searchParams } = new URL(req.url);
  const sb = getSupabaseAdmin();
  const access = await resolveModeAccess({
    supabase: sb,
    userId,
    requestedMode: searchParams.get("mode"),
  });
  if (!access.ok) {
    return accessDenied({
      status: access.status,
      error: access.error,
      allowedMode: access.allowedMode,
      requestedMode: access.mode,
    });
  }
  const mode = access.mode;
  const { data, error } = await sb
    .from("portfolio_meta")
    .select("cash_eur, values_by_symbol, updated_at")
    .eq("user_id", userId)
    .eq("mode", mode)
    .maybeSingle();

  if (error) return bad(error.message, 500);

  return ok({
    ok: true,
    mode,
    meta: data ?? { cash_eur: 0, values_by_symbol: {}, updated_at: null },
  });
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return bad("Unauthorized", 401);

  const body = await req.json().catch(() => null);
  if (!body) return bad("Invalid JSON");

  const sb = getSupabaseAdmin();
  const access = await resolveModeAccess({
    supabase: sb,
    userId,
    requestedMode: body.mode,
  });
  if (!access.ok) {
    return accessDenied({
      status: access.status,
      error: access.error,
      allowedMode: access.allowedMode,
      requestedMode: access.mode,
    });
  }
  const mode = access.mode as AutopilotMode;
  const cashEur = Number(body.cashEur ?? 0);
  const valuesBySymbol =
    body.valuesBySymbol && typeof body.valuesBySymbol === "object" ? body.valuesBySymbol : {};

  if (!Number.isFinite(cashEur) || cashEur < 0) return bad("cashEur must be a non-negative number");

  const upsertRow = {
    user_id: userId,
    mode,
    cash_eur: cashEur,
    values_by_symbol: valuesBySymbol,
  };

  const { data, error } = await sb
    .from("portfolio_meta")
    .upsert(upsertRow, { onConflict: "user_id,mode" })
    .select("cash_eur, values_by_symbol, updated_at")
    .single();

  if (error) return bad(error.message, 500);

  return ok({ ok: true, mode, meta: data });
}

