import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { mapJournalRowToExecutionProofWithCompletion, type ExecutionProofOrder } from "@/lib/signalcore/executionProof";
import { resolveTradingRouteAccess } from "@/lib/signalcore/tradingRouteAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clampInt(v: unknown, min: number, max: number, fallback: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function csvEscape(v: unknown) {
  const s = String(v ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

const CSV_HEADERS = [
  "proof_id",
  "date_utc",
  "mode",
  "broker",
  "leak_key",
  "completed",
  "total",
  "completion_pct",
  "quality_score",
  "reference",
  "fees_eur",
  "slippage_bps",
  "source",
  "note",
  "orders_count",
  "order_index",
  "symbol",
  "action",
  "target_value_eur",
  "qty_target",
  "reference_price",
  "limit_price",
  "stop_loss_price",
  "order_notional_eur",
  "filled_price",
  "filled_qty",
  "broker_order_id",
  "executed_at_utc",
  "order_reason",
];

function toCsv(rows: Array<Record<string, unknown>>, headers = CSV_HEADERS) {
  if (!rows.length) return `${headers.join(",")}\n`;
  const out: string[] = [headers.join(",")];
  for (const row of rows) {
    out.push(headers.map((k) => csvEscape(row[k])).join(","));
  }
  return `${out.join("\n")}\n`;
}

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const days = clampInt(url.searchParams.get("days"), 1, 365, 30);
  const limit = clampInt(url.searchParams.get("limit"), 1, 1000, 500);
  const format = String(url.searchParams.get("format") || "csv").toLowerCase().trim();
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
  const mode = access.mode;
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

  const proofs = (data || []).map((row: any) => mapJournalRowToExecutionProofWithCompletion(row)).filter(Boolean) as Array<{
    id: string;
    at: string | null;
    mode: string;
    broker: string;
    leakKey: string | null;
    completed: number;
    total: number;
    completionPct: number;
    note: string;
    reference: string;
    feesEur: number | null;
    slippageBps: number | null;
    source: string;
    qualityScore: number;
    orders: ExecutionProofOrder[];
  }>;

  if (format === "json") {
    const orderCount = proofs.reduce((acc, p) => acc + (Array.isArray(p.orders) ? p.orders.length : 0), 0);
    return NextResponse.json(
      {
        ok: true,
        mode,
        days,
        count: proofs.length,
        orderCount,
        proofs,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
          "Content-Disposition": `attachment; filename="syntrake_execution_proofs_${mode}_${days}d.json"`,
        },
      }
    );
  }

  const rows = proofs.flatMap((p) => {
    const orders = Array.isArray(p.orders) && p.orders.length > 0 ? p.orders : [null];
    return orders.map((order, idx) => ({
      proof_id: p.id,
      date_utc: p.at || "",
      mode: p.mode,
      broker: p.broker,
      leak_key: p.leakKey || "",
      completed: p.completed,
      total: p.total,
      completion_pct: p.completionPct,
      quality_score: p.qualityScore,
      reference: p.reference,
      fees_eur: p.feesEur ?? "",
      slippage_bps: p.slippageBps ?? "",
      source: p.source,
      note: p.note,
      orders_count: p.orders.length,
      order_index: order ? idx + 1 : "",
      symbol: order?.symbol || "",
      action: order?.action || "",
      target_value_eur: order?.targetValueEur ?? "",
      qty_target: order?.qtyTarget ?? "",
      reference_price: order?.referencePrice ?? "",
      limit_price: order?.limitPrice ?? "",
      stop_loss_price: order?.stopLossPrice ?? "",
      order_notional_eur: order?.orderNotionalEur ?? "",
      filled_price: order?.filledPrice ?? "",
      filled_qty: order?.filledQty ?? "",
      broker_order_id: order?.brokerOrderId || "",
      executed_at_utc: order?.executedAt || "",
      order_reason: order?.reason || "",
    }));
  });

  const csv = toCsv(rows);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="syntrake_execution_proofs_${mode}_${days}d.csv"`,
    },
  });
}
