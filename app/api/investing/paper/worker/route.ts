import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { readInvestingPaperConfig } from "@/lib/investing/server/config";
import { applyPersistentPaperSplit } from "@/lib/investing/server/cashAndCorporateActions";
import { getPersistentPaperHealth, processPersistentPaperOrder, recoverPersistentPaperWork } from "@/lib/investing/server/persistentPaper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function authorized(req: Request) {
  const expected = readInvestingPaperConfig().workerSecret;
  const provided = String(req.headers.get("x-investing-worker-secret") || "");
  if (!expected || provided.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await getPersistentPaperHealth(), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (Number(req.headers.get("content-length") || 0) > 16_384) return NextResponse.json({ ok: false, error: "request_too_large" }, { status: 413 });
  const body = await req.json().catch(() => null);
  try {
    if (String(body?.environment || "paper").toLowerCase() === "live") {
      return NextResponse.json({ ok: false, error: "investing_live_execution_blocked" }, { status: 403 });
    }
    if (body?.action === "recover") return NextResponse.json({ ok: true, result: await recoverPersistentPaperWork() });
    if (
      (body?.action === "split" || body?.action === "reverse_split")
      && UUID.test(String(body?.accountId || ""))
      && /^.{1,128}$/.test(String(body?.userId || ""))
      && /^[A-Za-z0-9][A-Za-z0-9_.:-]{7,127}$/.test(String(body?.clientRequestId || ""))
      && /^[A-Z0-9._-]{1,24}$/.test(String(body?.symbol || "").toUpperCase())
      && /^\d{1,4}(?:\.\d{1,12})?$/.test(String(body?.ratio || ""))
    ) {
      return NextResponse.json({ ok: true, result: await applyPersistentPaperSplit({
        userId: String(body?.userId || ""),
        accountId: String(body.accountId),
        symbol: String(body.symbol),
        ratio: String(body.ratio),
        action: body.action,
        clientRequestId: String(body.clientRequestId),
        effectiveAt: body?.effectiveAt ? String(body.effectiveAt) : null,
      }) });
    }
    if (body?.action === "process_order" && UUID.test(String(body?.orderId || ""))) {
      return NextResponse.json({ ok: true, result: await processPersistentPaperOrder(String(body.orderId)) });
    }
    return NextResponse.json({ ok: false, error: "invalid_worker_command" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: String(error?.message || "investing_worker_failed").split(":", 1)[0] }, { status: 409 });
  }
}
