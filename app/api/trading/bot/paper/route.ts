import { NextResponse } from "next/server";

import { getRequestUserId } from "@/lib/auth/requestUser";
import { isLocalQaUserId } from "@/lib/auth/localQaAuth";
import { isOwnerUserId } from "@/lib/signalcore/owner";
import {
  readPaperHistoryPayload,
  runPaperBotCycleForUser,
} from "@/lib/trading/bot/paperRunner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isBotOperator(userId: string) {
  return isOwnerUserId(userId) || isLocalQaUserId(userId);
}

export async function GET(req: Request) {
  const userId = await getRequestUserId(req);
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!isBotOperator(userId)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  try {
    const url = new URL(req.url);
    const days = Number(url.searchParams.get("days") || 183);
    return NextResponse.json(
      {
        ok: true,
        ...(await readPaperHistoryPayload(userId, {
          days: Number.isFinite(days) ? days : 183,
          maxSettlements: 10,
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "paper_history_failed" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function POST(req: Request) {
  const userId = await getRequestUserId(req);
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!isBotOperator(userId)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  try {
    const result = await runPaperBotCycleForUser({
      userId,
      source: "manual",
      maxTradesPerDay: 3,
    });
    return NextResponse.json(result, {
      status: result.status === "no_signal" ? 409 : 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "paper_cycle_failed" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
