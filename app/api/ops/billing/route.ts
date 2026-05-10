import { NextResponse } from "next/server";

import { getRequestUserId } from "@/lib/auth/requestUser";
import { isLocalQaUserId } from "@/lib/auth/localQaAuth";
import { buildPremiumAuditReport, normalizeEmailFilter } from "@/lib/billing/premiumAuditService";
import { isOwnerUserId } from "@/lib/signalcore/owner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clampLimit(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 250;
  return Math.max(1, Math.min(1000, Math.round(n)));
}

export async function GET(req: Request) {
  try {
    const userId = await getRequestUserId(req);
    if (!userId) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
    if (!isOwnerUserId(userId) && !isLocalQaUserId(userId)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const url = new URL(req.url);
    const report = await buildPremiumAuditReport({
      emails: normalizeEmailFilter(url.searchParams.get("emails")),
      limit: clampLimit(url.searchParams.get("limit")),
    });

    return NextResponse.json(report, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "ops_billing_audit_failed",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
