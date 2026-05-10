import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { AutopilotMode } from "@/lib/signalcore/modes";
import { resolveModeAccess } from "@/lib/signalcore/modeAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clampInt(v: unknown, min: number, max: number, fallback: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function round2(v: number) {
  if (!Number.isFinite(v)) return 0;
  return Math.round(v * 100) / 100;
}

function pctReturn(cur: number, base: number) {
  if (!Number.isFinite(cur) || !Number.isFinite(base) || base <= 0) return 0;
  return ((cur - base) / base) * 100;
}

function stddev(nums: number[]) {
  if (!nums.length) return 0;
  const mean = nums.reduce((s, n) => s + n, 0) / nums.length;
  const variance = nums.reduce((s, n) => s + (n - mean) ** 2, 0) / nums.length;
  return Math.sqrt(Math.max(0, variance));
}

function modeAnnualBenchmarkPct(mode: AutopilotMode) {
  void mode;
  return 7;
}

function dayKeyUTCFromIso(v: string | null | undefined) {
  if (!v) return null;
  const d = new Date(v);
  if (!Number.isFinite(d.getTime())) return null;
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function weekKeyUTC(v: string) {
  const d = new Date(`${v}T00:00:00.000Z`);
  if (!Number.isFinite(d.getTime())) return null;
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const diff = d.getTime() - firstThursday.getTime();
  const week = 1 + Math.round(diff / (7 * 24 * 60 * 60 * 1000));
  return `${d.getUTCFullYear()}-W${String(Math.max(1, week)).padStart(2, "0")}`;
}

function normalizeExecutionProof(row: any) {
  const type = String(row?.type || "").toLowerCase().trim();
  const details = row?.details && typeof row.details === "object" ? row.details : {};
  const raw = type === "daily_done" && details.manualExecutionProof && typeof details.manualExecutionProof === "object" ? details.manualExecutionProof : details;
  const total = Math.max(0, Math.round(Number(raw?.total || 0)));
  const completed = Math.max(0, Math.round(Number(raw?.completed || 0)));
  if (total <= 0 && completed <= 0) return null;
  const feesRaw = Number(raw?.feesEur);
  const slippageRaw = Number(raw?.slippageBps);
  const qualityRaw = Number(raw?.qualityScore);
  return {
    dayKey: dayKeyUTCFromIso(row?.created_at || null),
    total,
    completed,
    feesEur: Number.isFinite(feesRaw) && feesRaw >= 0 ? feesRaw : null,
    slippageBps: Number.isFinite(slippageRaw) ? slippageRaw : null,
    qualityScore: Number.isFinite(qualityRaw) ? Math.max(0, Math.min(100, Math.round(qualityRaw))) : null,
  };
}

export async function GET(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const days = clampInt(url.searchParams.get("days"), 30, 730, 365);
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
    const mode = access.mode as AutopilotMode;

    const { data: snapshotRows, error: snapErr } = await sb
      .from("daily_snapshots")
      .select("day_key,total_eur,created_at")
      .eq("user_id", userId)
      .eq("mode", mode)
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .limit(3000);
    if (snapErr) return NextResponse.json({ ok: false, error: snapErr.message }, { status: 500 });

    const byDay = new Map<string, { day: string; totalEur: number }>();
    for (const r of snapshotRows || []) {
      const day = String((r as any)?.day_key || dayKeyUTCFromIso((r as any)?.created_at || null) || "").trim();
      if (!day) continue;
      const total = Number((r as any)?.total_eur);
      if (!Number.isFinite(total)) continue;
      byDay.set(day, { day, totalEur: Math.max(0, total) });
    }
    const points = Array.from(byDay.values()).sort((a, b) => a.day.localeCompare(b.day));
    if (points.length === 0) {
      return NextResponse.json({
        ok: true,
        mode,
        windowDays: days,
        trackedDays: 0,
        summary: null,
        series: [],
        updatedAt: new Date().toISOString(),
      });
    }

    const start = points[0].totalEur;
    const current = points[points.length - 1].totalEur;
    const trackedDays = Math.max(0, points.length - 1);
    const totalReturnPct = pctReturn(current, start);
    const annualizedPct =
      trackedDays > 0 && start > 0 ? ((current / start) ** (365 / Math.max(1, trackedDays)) - 1) * 100 : 0;

    let peak = points[0].totalEur;
    let maxDrawdownPct = 0;
    for (const p of points) {
      if (p.totalEur > peak) peak = p.totalEur;
      if (peak > 0) {
        const dd = ((p.totalEur - peak) / peak) * 100;
        if (dd < maxDrawdownPct) maxDrawdownPct = dd;
      }
    }

    const last30 = points.slice(-31);
    const rets30: number[] = [];
    for (let i = 1; i < last30.length; i++) {
      const prev = last30[i - 1].totalEur;
      const cur = last30[i].totalEur;
      if (prev > 0) rets30.push(((cur - prev) / prev) * 100);
    }
    const volatility30dPct = stddev(rets30);

    const benchmarkAnnualPct = modeAnnualBenchmarkPct(mode);
    const benchmarkReturnPct = ((1 + benchmarkAnnualPct / 100) ** (trackedDays / 365) - 1) * 100;
    const alphaPct = totalReturnPct - benchmarkReturnPct;

    const { data: proofRows, error: proofErr } = await sb
      .from("journal_entries")
      .select("type,details,created_at")
      .eq("user_id", userId)
      .eq("mode", mode)
      .in("type", ["execution_proof", "daily_done"])
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(3000);
    if (proofErr) return NextResponse.json({ ok: false, error: proofErr.message }, { status: 500 });

    const proofs = (proofRows || []).map((r: any) => normalizeExecutionProof(r)).filter(Boolean) as Array<{
      dayKey: string | null;
      total: number;
      completed: number;
      feesEur: number | null;
      slippageBps: number | null;
      qualityScore: number | null;
    }>;
    const recent30Set = new Set(points.slice(-30).map((p) => p.day));
    let feesEur = 0;
    let fees30dEur = 0;
    let slippageSum30 = 0;
    let slippageCount30 = 0;
    let qualitySum30 = 0;
    let qualityCount30 = 0;

    for (const p of proofs) {
      if (p.feesEur != null) {
        feesEur += p.feesEur;
        if (p.dayKey && recent30Set.has(p.dayKey)) fees30dEur += p.feesEur;
      }
      if (p.dayKey && recent30Set.has(p.dayKey) && p.slippageBps != null) {
        slippageSum30 += p.slippageBps;
        slippageCount30 += 1;
      }
      if (p.dayKey && recent30Set.has(p.dayKey) && p.qualityScore != null) {
        qualitySum30 += p.qualityScore;
        qualityCount30 += 1;
      }
    }

    const avgSlippageBps30d = slippageCount30 > 0 ? slippageSum30 / slippageCount30 : null;
    const avgProofQuality30d = qualityCount30 > 0 ? qualitySum30 / qualityCount30 : null;
    const feeDragPct = current > 0 ? (feesEur / current) * 100 : 0;
    const netReturnPct = totalReturnPct - feeDragPct;
    const netAlphaPct = netReturnPct - benchmarkReturnPct;

    const recent56 = points.slice(-56);
    const daysByWeek = new Map<string, Set<string>>();
    for (const p of recent56) {
      const wk = weekKeyUTC(p.day);
      if (!wk) continue;
      const prev = daysByWeek.get(wk) || new Set<string>();
      prev.add(p.day);
      daysByWeek.set(wk, prev);
    }
    const weekKeys = Array.from(daysByWeek.keys()).sort();
    const observedWeeks = weekKeys.slice(-8);
    let weeksWith5Receipts = 0;
    for (const wk of observedWeeks) {
      const n = daysByWeek.get(wk)?.size || 0;
      if (n >= 5) weeksWith5Receipts += 1;
    }
    const disciplineDen = Math.max(1, observedWeeks.length);
    const weeklyDisciplinePct = (weeksWith5Receipts / disciplineDen) * 100;

    const alphaScore = Math.max(0, Math.min(100, 50 + alphaPct * 2));
    const drawdownScore = Math.max(0, Math.min(100, 100 + maxDrawdownPct * 2)); // dd negative
    const qualityScore = avgProofQuality30d == null ? 55 : Math.max(0, Math.min(100, avgProofQuality30d));
    const feeScore = Math.max(0, Math.min(100, 100 - feeDragPct * 15));
    const trackRecordScore = round2(alphaScore * 0.3 + drawdownScore * 0.2 + qualityScore * 0.2 + weeklyDisciplinePct * 0.2 + feeScore * 0.1);

    const series = points.slice(-180).map((p, idx) => {
      const bench = start * (1 + benchmarkAnnualPct / 100) ** (idx / 365);
      return {
        day: p.day,
        totalEur: round2(p.totalEur),
        benchmarkEur: round2(bench),
      };
    });

    return NextResponse.json(
      {
        ok: true,
        mode,
        windowDays: days,
        trackedDays,
        summary: {
          currentEur: round2(current),
          startEur: round2(start),
          totalReturnPct: round2(totalReturnPct),
          netReturnPct: round2(netReturnPct),
          annualizedPct: round2(annualizedPct),
          maxDrawdownPct: round2(maxDrawdownPct),
          volatility30dPct: round2(volatility30dPct),
          benchmarkAnnualPct: round2(benchmarkAnnualPct),
          benchmarkReturnPct: round2(benchmarkReturnPct),
          alphaPct: round2(alphaPct),
          netAlphaPct: round2(netAlphaPct),
          feesEur: round2(feesEur),
          fees30dEur: round2(fees30dEur),
          avgSlippageBps30d: avgSlippageBps30d == null ? null : round2(avgSlippageBps30d),
          avgProofQuality30d: avgProofQuality30d == null ? null : round2(avgProofQuality30d),
          weeksWith5Receipts,
          observedWeeks: disciplineDen,
          weeklyDisciplinePct: round2(weeklyDisciplinePct),
          feeDragPct: round2(feeDragPct),
          trackRecordScore,
        },
        series,
        updatedAt: new Date().toISOString(),
      },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "track_record_failed", message: String(e?.message || "Unknown") },
      { status: 500 }
    );
  }
}
