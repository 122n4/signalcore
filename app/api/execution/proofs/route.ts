import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { AutopilotMode } from "@/lib/signalcore/modes";
import { applyManualExecutionProof, refreshManualExecutionReminder } from "@/lib/signalcore/manualExecutionState";
import { resolveTradingRouteAccess } from "@/lib/signalcore/tradingRouteAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProofPayload = {
  broker: string;
  leakKey: string | null;
  completed: number;
  total: number;
  note: string;
  reference: string;
  feesEur: number | null;
  slippageBps: number | null;
  source: string;
  qualityScore: number;
  orders: Array<{
    symbol: string;
    action: string;
    targetValueEur: number | null;
    qtyTarget: number | null;
    referencePrice: number | null;
    limitPrice: number | null;
    stopLossPrice: number | null;
    orderNotionalEur: number | null;
    filledPrice: number | null;
    filledQty: number | null;
    brokerOrderId: string;
    executedAt: string | null;
    reason: string;
  }>;
};

function clampInt(v: unknown, min: number, max: number, fallback: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function clampFloat(v: unknown, min: number, max: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(min, Math.min(max, n));
}

function asText(v: unknown, maxLen = 200) {
  return String(v || "")
    .trim()
    .slice(0, maxLen);
}

function computeQualityScore(input: {
  completed: number;
  total: number;
  note: string;
  reference: string;
  feesEur: number | null;
  slippageBps: number | null;
}) {
  let s = 0;
  if (input.total > 0 && input.completed >= input.total) s += 60;
  else if (input.completed > 0) s += 35;
  if (input.reference.length >= 4) s += 20;
  if (input.note.length >= 16) s += 10;
  else if (input.note.length >= 6) s += 6;
  if (input.feesEur != null) s += 5;
  if (input.slippageBps != null) s += 5;
  return Math.max(0, Math.min(100, Math.round(s)));
}

function normalizeOrders(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x: any) => ({
      symbol: asText(x?.symbol, 24).toUpperCase(),
      action: asText(x?.action, 16).toUpperCase(),
      targetValueEur: clampFloat(x?.targetValueEur, -1000000000, 1000000000),
      qtyTarget: clampFloat(x?.qtyTarget, -1000000000, 1000000000),
      referencePrice: clampFloat(x?.referencePrice, 0, 1000000000),
      limitPrice: clampFloat(x?.limitPrice, 0, 1000000000),
      stopLossPrice: clampFloat(x?.stopLossPrice, 0, 1000000000),
      orderNotionalEur: clampFloat(x?.orderNotionalEur, 0, 1000000000),
      filledPrice: clampFloat(x?.filledPrice, 0, 1000000000),
      filledQty: clampFloat(x?.filledQty, 0, 1000000000),
      brokerOrderId: asText(x?.brokerOrderId, 120),
      executedAt: asText(x?.executedAt, 64) || null,
      reason: asText(x?.reason, 280),
    }))
    .filter((x: any) => x.symbol.length > 0)
    .slice(0, 40);
}

function normalizeProofPayload(raw: any): ProofPayload {
  const broker = asText(raw?.broker || "manual", 80) || "manual";
  const leakKey = asText(raw?.leakKey || "", 80) || null;
  const completed = Math.max(0, clampInt(raw?.completed, 0, 100000, 0));
  const total = Math.max(completed, clampInt(raw?.total, 0, 100000, completed));
  const note = asText(raw?.note, 800);
  const reference = asText(raw?.reference, 120);
  const feesEur = clampFloat(raw?.feesEur, 0, 1000000000);
  const slippageBps = clampFloat(raw?.slippageBps, -10000, 10000);
  const source = asText(raw?.source || "manual_checklist", 40) || "manual_checklist";
  const orders = normalizeOrders(raw?.orders);
  const qualityFromBody = clampInt(raw?.qualityScore, 0, 100, -1);
  const qualityScore =
    qualityFromBody >= 0
      ? qualityFromBody
      : computeQualityScore({ completed, total, note, reference, feesEur, slippageBps });

  return {
    broker,
    leakKey,
    completed,
    total,
    note,
    reference,
    feesEur,
    slippageBps,
    source,
    qualityScore,
    orders,
  };
}

function mapRowToProof(row: any): null | {
  id: string;
  at: string | null;
  mode: string;
  broker: string;
  leakKey: string | null;
  completed: number;
  total: number;
  note: string;
  reference: string;
  feesEur: number | null;
  slippageBps: number | null;
  source: string;
  qualityScore: number;
  orders: ProofPayload["orders"];
} {
  const details = row?.details && typeof row.details === "object" ? row.details : {};
  const raw =
    String(row?.type || "") === "daily_done"
      ? details?.manualExecutionProof && typeof details.manualExecutionProof === "object"
        ? details.manualExecutionProof
        : null
      : details;
  if (!raw) return null;

  const normalized = normalizeProofPayload(raw);
  if (normalized.total <= 0 && normalized.completed <= 0) return null;

  return {
    id: String(row?.id || ""),
    at: row?.created_at ? String(row.created_at) : null,
    mode: String(row?.mode || ""),
    broker: normalized.broker,
    leakKey: normalized.leakKey,
    completed: normalized.completed,
    total: normalized.total,
    note: normalized.note,
    reference: normalized.reference,
    feesEur: normalized.feesEur,
    slippageBps: normalized.slippageBps,
    source: normalized.source,
    qualityScore: normalized.qualityScore,
    orders: normalized.orders,
  };
}

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const limit = clampInt(url.searchParams.get("limit"), 1, 100, 20);
  const days = clampInt(url.searchParams.get("days"), 1, 120, 14);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const sb = getSupabaseAdmin();
  const access = await resolveTradingRouteAccess({
    supabase: sb,
    userId,
    requestedMode: url.searchParams.get("mode"),
    capability: "journal",
  });
  if (access.ok === false) {
    return NextResponse.json(access.body, { status: access.status });
  }
  const mode = access.mode as AutopilotMode;
  const { data, error } = await sb
    .from("journal_entries")
    .select("id,type,title,details,created_at,mode")
    .eq("user_id", userId)
    .eq("mode", mode)
    .in("type", ["execution_proof", "daily_done"])
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const proofs = (data || [])
    .map((row: any) => mapRowToProof(row))
    .filter(Boolean) as Array<{
    id: string;
    at: string | null;
    mode: string;
    broker: string;
    leakKey: string | null;
    completed: number;
    total: number;
    note: string;
    reference: string;
    feesEur: number | null;
    slippageBps: number | null;
    source: string;
    qualityScore: number;
    orders: ProofPayload["orders"];
  }>;

  const totals = proofs.reduce(
    (acc, p) => {
      const completed = Math.max(0, Math.min(p.completed, p.total));
      acc.totalOrders += Math.max(0, p.total);
      acc.completedOrders += completed;
      acc.sumQuality += p.qualityScore;
      if (p.qualityScore >= 70) acc.strongProofs += 1;
      if (p.reference.length > 0) acc.withReference += 1;
      if (p.feesEur != null) acc.totalFeesEur += p.feesEur;
      if (p.slippageBps != null) {
        acc.slippageSamples += 1;
        acc.sumSlippageBps += p.slippageBps;
      }
      return acc;
    },
    {
      totalOrders: 0,
      completedOrders: 0,
      sumQuality: 0,
      strongProofs: 0,
      withReference: 0,
      totalFeesEur: 0,
      slippageSamples: 0,
      sumSlippageBps: 0,
    }
  );

  const summary = {
    proofs: proofs.length,
    totalOrders: totals.totalOrders,
    completedOrders: totals.completedOrders,
    completionPct: totals.totalOrders > 0 ? Math.round((totals.completedOrders / totals.totalOrders) * 100) : 0,
    avgQuality: proofs.length > 0 ? Math.round(totals.sumQuality / proofs.length) : 0,
    strongProofs: totals.strongProofs,
    withReference: totals.withReference,
    totalFeesEur: Math.round(totals.totalFeesEur * 100) / 100,
    avgSlippageBps: totals.slippageSamples > 0 ? Math.round((totals.sumSlippageBps / totals.slippageSamples) * 100) / 100 : null,
    lastProofAt: proofs[0]?.at || null,
  };

  let manualState: Awaited<ReturnType<typeof refreshManualExecutionReminder>> | null = null;
  try {
    manualState = await refreshManualExecutionReminder({ sb, userId, mode });
  } catch {
    manualState = null;
  }

  return NextResponse.json(
    {
      ok: true,
      mode,
      days,
      summary,
      proofs,
      manualExecution: manualState
        ? {
            status: manualState.snapshot.status,
            pending: manualState.snapshot.pending,
            lastProof: manualState.snapshot.lastProof,
            updatedAt: manualState.snapshot.updatedAt,
          }
        : null,
    },
    { status: 200 }
  );
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const supabase = getSupabaseAdmin();
    const access = await resolveTradingRouteAccess({
      supabase,
      userId,
      requestedMode: body?.mode,
      capability: "execution",
    });
    if (access.ok === false) {
      return NextResponse.json(access.body, { status: access.status });
    }
    const mode = access.mode as AutopilotMode;
    const proof = normalizeProofPayload(body?.proof ?? body ?? {});
    if (proof.total <= 0) {
      return NextResponse.json({ ok: false, error: "total must be > 0" }, { status: 400 });
    }

    const confirmedAt = new Date().toISOString();
    const payload = {
      user_id: userId,
      mode,
      type: "execution_proof",
      title: `Execution proof (${proof.broker})`,
      details: {
        ...proof,
        confirmedAt,
      },
      created_at: confirmedAt,
    };

    const { data: inserted, error } = await supabase.from("journal_entries").insert(payload).select("id").maybeSingle();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    let acceptedForCloseDay = false;
    let gateReason: string | null = null;
    let pendingRowsRequired = 0;
    let manualStatus: "idle" | "pending" | "resolved" = "idle";
    let manualPending: any = null;
    let manualStateSynced = false;

    try {
      const applied = await applyManualExecutionProof({
        sb: supabase,
        userId,
        mode,
        proof,
        confirmedAt,
      });
      acceptedForCloseDay = applied.acceptedForCloseDay;
      gateReason = applied.gateReason || null;
      pendingRowsRequired = Number(applied.snapshot.lastProof?.pendingRowsRequired || 0);
      manualStatus = applied.snapshot.status;
      manualPending = applied.snapshot.pending;
      manualStateSynced = true;

      const proofDetails = {
        ...proof,
        confirmedAt,
        acceptedForCloseDay,
        gateReason,
        pendingRowsRequired,
      };
      if (inserted?.id) {
        await supabase.from("journal_entries").update({ details: proofDetails }).eq("id", String(inserted.id)).eq("user_id", userId);
      }
    } catch (stateError: any) {
      gateReason = stateError?.message ? String(stateError.message) : "manual_state_sync_failed";
    }

    return NextResponse.json(
      {
        ok: true,
        mode,
        proof: {
          ...proof,
          confirmedAt,
          acceptedForCloseDay,
          gateReason,
          pendingRowsRequired,
        },
        acceptedForCloseDay,
        gateReason,
        pendingRowsRequired,
        manualStatus,
        pending: manualPending,
        manualStateSynced,
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}
