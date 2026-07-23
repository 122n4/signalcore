import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { asMode } from "@/lib/signalcore/mode";
import { resolveModeAccess } from "@/lib/signalcore/modeAccess";
import {
  INVESTING_SHARED_BROKER_SYNC_BLOCKED,
  isInvestingSharedBrokerBlocked,
  resolveEffectiveSharedBrokerMode,
} from "@/lib/broker/investingBoundary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeSymbol(x: unknown) {
  return String(x || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

function safeNumber(x: unknown) {
  if (x === "" || x === null || x === undefined) return null;
  const n = typeof x === "number" ? x : Number(String(x).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const source = String(body?.source || "").toLowerCase().trim();
  const rawItems = Array.isArray(body?.items) ? body.items : [];
  const dedup = new Set<string>();

  const items = rawItems
    .map((x: any) => {
      const symbol = normalizeSymbol(x?.symbol);
      return {
        symbol,
        name: x?.name != null ? String(x.name).trim() : null,
        qty: safeNumber(x?.qty),
        value_eur: safeNumber(x?.value_eur ?? x?.valueEur),
      };
    })
    .filter((x: any) => x.symbol.length > 0)
    .filter((x: any) => {
      if (dedup.has(x.symbol)) return false;
      dedup.add(x.symbol);
      return true;
    });

  const supabase = getSupabaseAdmin();
  const effectiveMode = await resolveEffectiveSharedBrokerMode({
    userId,
    requestedMode: body?.mode,
    supabase,
  });
  if (isInvestingSharedBrokerBlocked(effectiveMode.mode)) {
    return NextResponse.json(
      { ok: false, error: INVESTING_SHARED_BROKER_SYNC_BLOCKED, mode: "investing", spoofed: effectiveMode.spoofed },
      { status: 410, headers: { "Cache-Control": "no-store" } },
    );
  }
  const access = await resolveModeAccess({
    supabase,
    userId,
    requestedMode: asMode(effectiveMode.mode),
  });
  if (!access.ok) {
    return NextResponse.json(
      { ok: false, error: access.error, allowedMode: access.allowedMode, requestedMode: access.mode },
      { status: access.status }
    );
  }
  const mode = access.mode;

  const { data: previousRows, error: previousErr } = await supabase
    .from("portfolio_items")
    .select("user_id,mode,symbol,name,qty,value_eur,created_at,updated_at")
    .eq("user_id", userId)
    .eq("mode", mode);
  if (previousErr) {
    return NextResponse.json({ ok: false, error: previousErr.message }, { status: 500 });
  }

  const { error: deleteErr } = await supabase
    .from("portfolio_items")
    .delete()
    .eq("user_id", userId)
    .eq("mode", mode);

  if (deleteErr) {
    return NextResponse.json({ ok: false, error: deleteErr.message }, { status: 500 });
  }

  if (!items.length) {
    return NextResponse.json({ ok: true, mode, inserted: 0, cleared: true });
  }

  const now = new Date().toISOString();
  const rows = items.map((it: any) => ({
    user_id: userId,
    mode,
    symbol: it.symbol,
    name: it.name,
    qty: it.qty,
    value_eur: it.value_eur,
    created_at: now,
  }));

  const { error: insertErr } = await supabase.from("portfolio_items").insert(rows);
  if (insertErr) {
    const hadPreviousRows = Array.isArray(previousRows) && previousRows.length > 0;
    let rollbackError: string | null = null;
    if (hadPreviousRows) {
      const restoreRows = (previousRows || []).map((row: any) => ({
        user_id: userId,
        mode,
        symbol: String(row?.symbol || "").toUpperCase(),
        name: row?.name == null ? null : String(row.name),
        qty: row?.qty == null ? null : Number(row.qty),
        value_eur: row?.value_eur == null ? null : Number(row.value_eur),
        created_at: row?.created_at ? String(row.created_at) : now,
        updated_at: row?.updated_at ? String(row.updated_at) : now,
      }));
      const { error: restoreErr } = await supabase.from("portfolio_items").insert(restoreRows);
      rollbackError = restoreErr ? restoreErr.message : null;
    }
    return NextResponse.json(
      {
        ok: false,
        error: insertErr.message,
        rollback: {
          attempted: true,
          restored: hadPreviousRows ? rollbackError == null : true,
          error: rollbackError,
        },
      },
      { status: 500 }
    );
  }

  if (source === "starter_pack") {
    await supabase.from("journal_entries").insert({
      user_id: userId,
      mode,
      type: "starter_applied",
      title: "Starter pack applied",
      details: {
        count: rows.length,
      },
      created_at: now,
    });
  }

  return NextResponse.json({ ok: true, mode, inserted: rows.length, cleared: true });
}
