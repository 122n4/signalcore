import { NextResponse } from "next/server";

import { getRequestUserId } from "@/lib/auth/requestUser";
import { getInvestingSupabaseAdmin } from "@/lib/investing/repository/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const userId = await getRequestUserId(req);
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const url = new URL(req.url);
    const mode = String(url.searchParams.get("mode") || "investing").trim() || "investing";
    const limit = Math.max(1, Math.min(100, Number(url.searchParams.get("limit") || 25) || 25));
    const sb = getInvestingSupabaseAdmin() as any;
    const [queueQuery, historyQuery] = await Promise.all([
      sb
        .from("investing_execution_queue")
        .select("id,user_id,portfolio_id,account_id,mode,day_key,as_of,decision_fingerprint,approval_status,approval_required,execution_decision,operational_state,version,expires_at,kill_switch_active,deployable_capital_eur,blocking_reasons,notes,meta,created_at")
        .eq("user_id", userId)
        .eq("mode", mode)
        .eq("approval_status", "pending")
        .order("created_at", { ascending: false })
        .limit(limit),
      sb
        .from("investing_execution_approvals")
        .select("queue_id,queue_version,user_id,mode,decision_fingerprint,queue_day_key,decided_at,decided_by,approval_status,override_applied,note,meta,created_at")
        .eq("user_id", userId)
        .eq("mode", mode)
        .order("decided_at", { ascending: false })
        .limit(limit),
    ]);

    if (queueQuery.error) {
      throw new Error(queueQuery.error.message);
    }
    if (historyQuery.error) {
      throw new Error(historyQuery.error.message);
    }

    return NextResponse.json(
      {
        ok: true,
        mode,
        approvals: Array.isArray(queueQuery.data) ? queueQuery.data : [],
        history: Array.isArray(historyQuery.data) ? historyQuery.data : [],
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: "investing_approvals_read_failed", message: error?.message ?? "Unknown" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function POST(req: Request) {
  const userId = await getRequestUserId(req);
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const contentLength = Number(req.headers.get("content-length") || 0);
    if (contentLength > 16_384) {
      return NextResponse.json({ ok: false, error: "request_too_large" }, { status: 413, headers: { "Cache-Control": "no-store" } });
    }
    const body = await req.json().catch(() => ({}));
    const queueId = String(body?.queueId || "").trim();
    const expectedStatus = String(body?.expectedStatus || "").trim();
    const expectedVersion = Number(body?.expectedVersion);
    const approvalStatus = String(body?.decision || "").trim();
    const note = String(body?.note || "").trim();

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(queueId)) {
      return NextResponse.json({ ok: false, error: "invalid_queue_id" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    if (approvalStatus !== "approved" && approvalStatus !== "rejected") {
      return NextResponse.json({ ok: false, error: "invalid_approval_status" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    if (expectedStatus !== "pending" || !Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
      return NextResponse.json({ ok: false, error: "invalid_expected_state" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    if (note.length > 2_000) {
      return NextResponse.json({ ok: false, error: "note_too_long" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }

    const sb = getInvestingSupabaseAdmin() as any;
    const correlationId = `investing_approval_${crypto.randomUUID()}`;
    const result = await sb.rpc("investing_record_approval_v2", {
      p_actor_user_id: userId,
      p_queue_id: queueId,
      p_expected_status: expectedStatus,
      p_expected_version: expectedVersion,
      p_decision: approvalStatus,
      p_note: note,
      p_correlation_id: correlationId,
    } as any);

    if (result.error) {
      const message = String(result.error.message || "investing_approval_rpc_failed");
      const code = message.includes("not_found_or_forbidden")
        ? "investing_approval_not_found_or_forbidden"
        : message.includes("expired")
          ? "investing_approval_expired"
          : "investing_approval_state_conflict";
      const status = code.includes("not_found") ? 404 : 409;
      return NextResponse.json({ ok: false, error: code }, { status, headers: { "Cache-Control": "no-store" } });
    }

    return NextResponse.json(
      {
        ok: true,
        mode: "investing",
        queueId,
        approvalStatus,
        version: result.data?.version ?? expectedVersion + 1,
        correlationId,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: "investing_approval_write_failed", message: error?.message ?? "Unknown" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
