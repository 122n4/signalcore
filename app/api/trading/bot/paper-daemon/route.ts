import { NextResponse } from "next/server";

import { isEngineLoopAuthorized } from "@/lib/engine/loopAuth";
import { selectPaperOwnerBatch } from "@/lib/trading/bot/ownerBatch";
import { runPaperBotCycleForUser } from "@/lib/trading/bot/paperRunner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function maxTradesPerDay() {
  const raw = Number(process.env.SYNTRAKE_BOT_PAPER_MAX_TRADES_PER_DAY ?? 3);
  return Number.isFinite(raw) ? Math.max(1, Math.min(10, Math.round(raw))) : 3;
}

function cronScheduledAt(nowIso: string) {
  const now = new Date(nowIso);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 7, 0, 0)).toISOString();
}

async function handleDaemon(req: Request) {
  if (!isEngineLoopAuthorized({ headers: req.headers, env: process.env })) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const owners = selectPaperOwnerBatch();
  if (owners.length === 0) {
    return NextResponse.json(
      { ok: false, error: "missing_owner_user_ids" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const results = [];
  const generatedAt = new Date().toISOString();
  for (const userId of owners) {
    try {
      results.push({
        userId,
        ...(await runPaperBotCycleForUser({
          userId,
          triggerSource: "cron",
          cronScheduledAt: cronScheduledAt(generatedAt),
          maxTradesPerDay: maxTradesPerDay(),
        })),
      });
    } catch (error: any) {
      results.push({
        userId,
        ok: false,
        status: "error",
        error: error?.message || "paper_daemon_user_failed",
      });
    }
  }

  return NextResponse.json(
    {
      ok: results.some((result) => result.ok),
      generatedAt,
      maxTradesPerDay: maxTradesPerDay(),
      ownersChecked: results.length,
      results,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(req: Request) {
  return handleDaemon(req);
}

export async function POST(req: Request) {
  return handleDaemon(req);
}
