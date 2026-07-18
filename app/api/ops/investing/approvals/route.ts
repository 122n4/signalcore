import { NextResponse } from "next/server";

import { getRequestUserId } from "@/lib/auth/requestUser";
import { isLocalQaUserId } from "@/lib/auth/localQaAuth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isOwnerUserId } from "@/lib/signalcore/owner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function canAccess(userId: string | null | undefined) {
  return Boolean(userId && (isOwnerUserId(userId) || isLocalQaUserId(userId)));
}

export async function GET(req: Request) {
  const userId = await getRequestUserId(req);
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  if (!canAccess(userId)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const url = new URL(req.url);
    const mode = String(url.searchParams.get("mode") || "investing").trim() || "investing";
    const limit = Math.max(1, Math.min(100, Number(url.searchParams.get("limit") || 25) || 25));
    const sb = getSupabaseAdmin();
    const [queueQuery, historyQuery] = await Promise.all([
      sb
        .from("investing_execution_queue")
        .select("user_id,mode,day_key,as_of,decision_fingerprint,approval_status,approval_required,execution_decision,kill_switch_active,deployable_capital_eur,blocking_reasons,notes,meta,created_at")
        .eq("mode", mode)
        .eq("approval_status", "pending")
        .order("created_at", { ascending: false })
        .limit(limit),
      sb
        .from("investing_execution_approvals")
        .select("user_id,mode,decision_fingerprint,queue_day_key,decided_at,decided_by,approval_status,override_applied,note,meta,created_at")
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
  if (!canAccess(userId)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const mode = String(body?.mode || "investing").trim() || "investing";
    const decisionFingerprint = String(body?.decisionFingerprint || "").trim();
    const approvalStatus = String(body?.approvalStatus || "").trim();
    const note = String(body?.note || "").trim();
    const overrideApplied = Boolean(body?.overrideApplied);

    if (!decisionFingerprint) {
      return NextResponse.json({ ok: false, error: "decision_fingerprint_required" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    if (approvalStatus !== "approved" && approvalStatus !== "rejected") {
      return NextResponse.json({ ok: false, error: "invalid_approval_status" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }

    const sb = getSupabaseAdmin();
    const existing = await sb
      .from("investing_execution_queue")
      .select("*")
      .eq("mode", mode)
      .eq("decision_fingerprint", decisionFingerprint)
      .order("created_at", { ascending: false })
      .limit(1);

    if (existing.error) {
      throw new Error(existing.error.message);
    }

    const row = Array.isArray(existing.data) ? existing.data[0] : null;
    if (!row) {
      return NextResponse.json({ ok: false, error: "decision_not_found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
    }
    if (overrideApplied && !row.override_allowed) {
      return NextResponse.json({ ok: false, error: "override_not_allowed" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }

    const notes = Array.isArray(row.notes) ? row.notes.slice() : [];
    if (note) {
      notes.push(`owner:${approvalStatus}${overrideApplied ? ":override" : ""}:${note}`);
    }

    const meta = row.meta && typeof row.meta === "object" ? { ...row.meta } : {};
    const approvedAt = new Date().toISOString();
    meta.lastApproval = {
      by: userId,
      status: approvalStatus,
      overrideApplied,
      note: note || null,
      at: approvedAt,
    };

    const updated = {
      ...row,
      approval_status: approvalStatus,
      notes,
      meta,
      updated_at: approvedAt,
    };

    const result = await sb
      .from("investing_execution_queue")
      .upsert(updated, { onConflict: "user_id,mode,day_key,decision_fingerprint" } as any);

    if (result.error) {
      throw new Error(result.error.message);
    }

    const historyResult = await sb.from("investing_execution_approvals").upsert(
      {
        user_id: row.user_id,
        mode,
        decision_fingerprint: row.decision_fingerprint,
        queue_day_key: row.day_key ?? null,
        decided_at: approvedAt,
        decided_by: userId,
        approval_status: approvalStatus,
        override_applied: overrideApplied,
        note: note || null,
        meta: {
          queue_as_of: row.as_of ?? null,
          execution_decision: row.execution_decision ?? null,
        },
        updated_at: approvedAt,
      },
      { onConflict: "id" } as any,
    );

    if (historyResult.error) {
      throw new Error(historyResult.error.message);
    }

    return NextResponse.json(
      {
        ok: true,
        mode,
        decisionFingerprint,
        approvalStatus,
        overrideApplied,
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
