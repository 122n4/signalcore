// app/api/daily-snapshot/route.ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createExecutionId, writeEngineEvent } from "@/lib/engine/events";
import { resolveModeAccess } from "@/lib/signalcore/modeAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function dayKeyUTC(d = new Date()) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const da = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}

function safeNum(x: any, fallback = 0) {
  const n = typeof x === "number" ? x : Number(String(x ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
}

function sumHoldingsValueEUR(holdings: any[]) {
  return (holdings ?? []).reduce((s, h) => s + safeNum(h?.valueEur ?? h?.value_eur ?? h?.value ?? 0, 0), 0);
}

export async function POST(req: Request) {
  const startedAtMs = Date.now();
  const executionId = createExecutionId("receipt");
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const supabase = getSupabaseAdmin();
    const access = await resolveModeAccess({
      supabase,
      userId,
      requestedMode: body?.mode,
    });
    if (!access.ok) {
      return NextResponse.json(
        { ok: false, error: access.error, allowedMode: access.allowedMode, requestedMode: access.mode },
        { status: access.status }
      );
    }
    const mode = access.mode;

    // full proof payload (audit)
    const snapshot = body?.snapshot ?? null;

    // best-effort totals extraction
    const portfolio = snapshot?.portfolio ?? body?.portfolio ?? {};
    const cash = safeNum(portfolio?.cash ?? portfolio?.cashEur ?? portfolio?.cash_eur ?? 0, 0);

    const holdings =
      Array.isArray(portfolio?.holdings) ? portfolio.holdings
      : Array.isArray(portfolio?.items) ? portfolio.items
      : [];

    const holdingsValue = sumHoldingsValueEUR(holdings);
    const total = cash + holdingsValue;

    const now = new Date();
    const dk = dayKeyUTC(now);

    // meta: allow client to send coveragePct, missingSymbols, etc
    const metaFromClient = snapshot?.derived?.pricing ?? snapshot?.portfolio?.valuation ?? snapshot?.derived?.diagnostics?.pricing ?? null;

    const row: any = {
      user_id: userId,
      mode,
      day_key: dk,
      as_of: now.toISOString(),
      total_eur: total,
      cash_eur: cash,
      holdings,
      meta: {
        source: "daily_snapshot_v3",
        holdingsCount: holdings?.length ?? 0,
        pricing: metaFromClient ?? null,
      },
      snapshot,
      created_at: now.toISOString(),
    };

    const { error } = await supabase
      .from("daily_snapshots")
      .upsert(row, { onConflict: "user_id,mode,day_key" } as any);

    if (error) {
      await writeEngineEvent({
        userId,
        mode,
        event: "daily_receipt_created",
        status: "error",
        source: "api.daily_snapshot",
        executionId,
        details: { dayKey: dk, error: error.message, duration_ms: Date.now() - startedAtMs },
      });
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    // Decision receipt (server-side, retention booster)
    await supabase.from("journal_entries").insert({
      user_id: userId,
      mode,
      type: "decision_receipt",
      title: "Decision receipt",
      details: {
        day_key: dk,
        total_eur: total,
        cash_eur: cash,
        holdingsCount: holdings?.length ?? 0,
        pricing: metaFromClient ?? null,
      },
      created_at: now.toISOString(),
    });

    await writeEngineEvent({
      userId,
      mode,
      event: "daily_receipt_created",
      status: "ok",
      source: "api.daily_snapshot",
      executionId,
      details: {
        dayKey: dk,
        totalEur: total,
        cashEur: cash,
        holdingsCount: holdings?.length ?? 0,
        duration_ms: Date.now() - startedAtMs,
      },
    });

    return NextResponse.json({ ok: true, mode, executionId, dayKey: dk, totalEUR: total });
  } catch (e: any) {
    try {
      const { userId } = await auth();
      if (userId) {
        await writeEngineEvent({
          userId,
          mode: "investing",
          event: "daily_receipt_created",
          status: "error",
          source: "api.daily_snapshot",
          executionId,
          details: { error: e?.message || "unknown_error", duration_ms: Date.now() - startedAtMs },
        });
      }
    } catch {
      // ignore
    }
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}
