import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveModeAccess } from "@/lib/signalcore/modeAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clampDays(v: string | null) {
  const n = Number(v || 7);
  if (!Number.isFinite(n)) return 7;
  return Math.max(1, Math.min(90, Math.round(n)));
}

function asObj(x: unknown) {
  return x && typeof x === "object" ? (x as Record<string, unknown>) : {};
}

function asStatus(x: unknown): "ok" | "warn" | "error" {
  const s = String(x || "").toLowerCase().trim();
  if (s === "error") return "error";
  if (s === "warn" || s === "warning") return "warn";
  return "ok";
}

function pct(num: number, den: number) {
  if (!Number.isFinite(num) || !Number.isFinite(den) || den <= 0) return null;
  return Math.round((num / den) * 10000) / 100;
}

function percentile(nums: number[], p: number) {
  if (!nums.length) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * (sorted.length - 1))));
  const v = sorted[idx];
  return Number.isFinite(v) ? Math.round(v) : null;
}

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const days = clampDays(url.searchParams.get("days"));

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const sb = getSupabaseAdmin();
  const access = await resolveModeAccess({
    supabase: sb,
    userId,
    requestedMode: url.searchParams.get("mode"),
  });
  if (!access.ok) {
    return NextResponse.json(
      { ok: false, error: access.error, allowedMode: access.allowedMode, requestedMode: access.mode },
      { status: access.status }
    );
  }
  const mode = access.mode;

  const { data, error } = await sb
    .from("journal_entries")
    .select("id,created_at,details")
    .eq("user_id", userId)
    .eq("mode", mode)
    .eq("type", "engine_event")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1500);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const rows = (data || []) as Array<Record<string, unknown>>;
  const counts = {
    total: 0,
    ok: 0,
    warn: 0,
    error: 0,
    orderSent: 0,
    orderFilled: 0,
    orderFailed: 0,
    riskBlocked: 0,
    receipts: 0,
  };

  const durations: number[] = [];
  const executionMap = new Map<string, { hasOk: boolean; hasError: boolean; latestAt: string | null }>();
  let latestAt: string | null = null;

  for (const row of rows) {
    const d = asObj(row.details);
    const event = String(d.event || "").toLowerCase().trim();
    const status = asStatus(d.status);
    const executionId = String(d.execution_id || d.executionId || "").trim();
    const createdAt = row.created_at ? String(row.created_at) : null;
    const durationRaw = Number(d.duration_ms ?? d.durationMs);
    const durationMs = Number.isFinite(durationRaw) && durationRaw >= 0 ? durationRaw : NaN;

    counts.total += 1;
    if (status === "ok") counts.ok += 1;
    else if (status === "warn") counts.warn += 1;
    else counts.error += 1;

    if (event === "order_sent") counts.orderSent += 1;
    if (event === "order_filled") counts.orderFilled += 1;
    if (event === "order_failed") counts.orderFailed += 1;
    if (event === "risk_blocked") counts.riskBlocked += 1;
    if (event === "daily_receipt_created") counts.receipts += 1;

    if (Number.isFinite(durationMs)) durations.push(durationMs);

    if (executionId) {
      const prev = executionMap.get(executionId) || { hasOk: false, hasError: false, latestAt: null };
      const next = {
        hasOk: prev.hasOk || status === "ok",
        hasError: prev.hasError || status === "error",
        latestAt: createdAt || prev.latestAt,
      };
      executionMap.set(executionId, next);
    }

    if (!latestAt && createdAt) latestAt = createdAt;
  }

  const executionStats = Array.from(executionMap.values());
  const executionTotal = executionStats.length;
  const executionWithError = executionStats.filter((x) => x.hasError).length;
  const executionWithOk = executionStats.filter((x) => x.hasOk).length;
  const executionSuccessRate = pct(executionTotal - executionWithError, executionTotal);

  const orderTotal = counts.orderFilled + counts.orderFailed;
  const orderSuccessRate = pct(counts.orderFilled, orderTotal);

  const avgDurationMs = durations.length
    ? Math.round(durations.reduce((sum, x) => sum + x, 0) / durations.length)
    : null;
  const p95DurationMs = percentile(durations, 95);

  return NextResponse.json(
    {
      ok: true,
      mode,
      windowDays: days,
      since,
      latestAt,
      counts,
      rates: {
        okRate: pct(counts.ok, counts.total),
        errorRate: pct(counts.error, counts.total),
        orderSuccessRate,
        executionSuccessRate,
      },
      executions: {
        total: executionTotal,
        withError: executionWithError,
        withOk: executionWithOk,
      },
      latency: {
        samples: durations.length,
        avgMs: avgDurationMs,
        p95Ms: p95DurationMs,
      },
    },
    { status: 200 }
  );
}
